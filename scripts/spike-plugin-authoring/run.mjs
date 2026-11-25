// Local measurement only. Raw Host logs and conversation snapshots stay in ignored tmp.
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isolatedHostEnvironment } from "../../test/helpers/isolated-host-environment.ts";
import { DAEMON_PROTOCOL } from "../../apps/editor/shared/daemon-version.ts";
import { tasks, prepare } from "./tasks.mjs";

const [name, mode] = process.argv.slice(2);
const match = /^(?:([AB])-([123])-([12])|pilot-([12]))$/.exec(name ?? "");
if (!match) throw new Error("Use a run ID A-1-1 through B-3-2, or pilot-1 / pilot-2.");
const arm = match[1] ?? "A";
const taskId = Number(match[2] ?? 3);
const evidence = path.resolve("tmp", "plugin-authoring-runs", name);
const cli = path.resolve("tmp", "plugin-authoring-builds", arm, "cli.mjs");
if (!existsSync(cli)) throw new Error("Build and copy the appropriate CLI distribution first.");
mkdirSync(path.dirname(evidence), { recursive: true });
mkdirSync(evidence); // Each run ID is consumed once.
const root = mkdtempSync(path.join(os.tmpdir(), "litzio-authoring-"));
const folder = path.join(root, "자료");
mkdirSync(folder);
prepare(taskId, folder);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^LITZIO_/i.test(key)));
Object.assign(env, isolatedHostEnvironment(root));
const model = "gpt-6.1-terra", reasoningEffort = "high", permissionMode = "full-access", provider = "codex";
mkdirSync(env.LITZIO_DATA_DIR);
writeFileSync(env.LITZIO_ASSISTANT_SETTINGS_FILE, JSON.stringify({ model, reasoningEffort, permissionMode, provider, responseLanguage: "ko" }));

const socket = net.createServer().listen(0, "127.0.0.1");
await once(socket, "listening");
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const url = `http://127.0.0.1:${port}`;
const host = spawn(process.execPath, [cli, "daemon", "run", "--root", root, "--port", String(port)], {
  env, cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let hostLog = "";
host.stdout.on("data", chunk => { hostLog += chunk; });
host.stderr.on("data", chunk => { hostLog += chunk; });
const exited = once(host, "exit");
const alive = () => host.exitCode === null && host.signalCode === null;
const report = { name, arm, taskId, root, folder, url, pid: process.pid, hostPid: host.pid, model, reasoningEffort, actions: [], snapshots: [] };
const file = key => path.join(evidence, key);
function save() {
  writeFileSync(file("state.json"), JSON.stringify(report, null, 2));
  writeFileSync(file("host.log"), hostLog);
}
const route = "/api/assistant/conversations";
const call = async (suffix, body, timeout = 30_000) => {
  const response = await fetch(url + suffix, {
    method: body ? "POST" : "GET",
    headers: { Origin: url, Connection: "close", "Content-Type": "application/json", "x-litzio-protocol": DAEMON_PROTOCOL },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
};
let id;
async function observe(receipt) {
  for (let i = 0; i < 600; i++) {
    if (receipt && !id) {
      const result = await call(route + "?submissionId=" + receipt);
      if (result.submission?.status === "rejected") throw new Error(JSON.stringify(result.submission));
      id = result.conversation?.id ?? result.submission?.conversationId;
    }
    if (id) {
      const conversation = await call(route + "?id=" + encodeURIComponent(id));
      const turn = conversation.turns.at(-1);
      const pending = turn?.items.filter(item => item.question?.status === "pending") ?? [];
      if (turn && (pending.length || turn.status !== "inProgress")) return conversation;
    }
    await delay(1000);
  }
  throw new Error("Assistant turn did not settle within 600 seconds.");
}
function installed() {
  return JSON.parse(execFileSync(process.execPath, [cli, "plugins", "list", "--host", url, "--json"], { encoding: "utf8", windowsHide: true, timeout: 15_000 })).plugins;
}
async function turn(action) {
  report.actions.push({ ...action, time: Date.now() });
  save();
  let receipt;
  if (action.message) {
    receipt = crypto.randomUUID();
    try {
      const sent = await call(route, { action: "send", id, submissionId: receipt, provider, model, reasoningEffort, permissionMode,
        folders: [folder], message: action.message });
      id = sent.conversation?.id ?? sent.submission?.conversationId ?? id;
    } catch (error) {
      if (error.name !== "TimeoutError") throw error;
    }
  } else {
    const previous = report.snapshots.at(-1)?.conversation.turns.at(-1);
    const waiting = previous?.items.find(item => item.question?.status === "pending")?.question;
    if (!waiting || waiting.approval) throw new Error("No answerable question card.");
    const answers = Object.fromEntries(waiting.questions.map(question => [question.id, { answers: [action.answers[question.id]] }]));
    if (Object.values(answers).some(value => typeof value.answers[0] !== "string" || !value.answers[0])) throw new Error("Answer each question.");
    await call(route, { action: "answer", id, turnId: waiting.turnId, requestId: waiting.requestId, answers });
  }
  const conversation = await observe(receipt);
  if (conversation.model !== model || conversation.reasoningEffort !== reasoningEffort || conversation.permissionMode !== permissionMode) {
    throw new Error("Admitted conversation settings differ from the experiment.");
  }
  report.snapshots.push({ elapsedSeconds: (Date.now() - report.actions[0].time) / 1000, conversation, plugins: installed() });
  save();
}
try {
  for (let i = 0; !hostLog.includes("HTTP:"); i++) {
    if (!alive() || i === 120) throw new Error("Isolated Host did not start.");
    await delay(250);
  }
  const health = await call("/daemon/health");
  if (health.pid !== host.pid) throw new Error("Host identity mismatch.");
  const catalog = await call("/api/assistant/models?provider=codex");
  const entry = catalog.models.find(item => item.model === model);
  const supportsHigh = entry?.supportedReasoningEfforts.some(item => item.reasoningEffort === reasoningEffort) ?? false;
  report.preflight = { modelFound: Boolean(entry), supportsHigh, fullAccessAllowed: catalog.fullAccessAllowed };
  save();
  if (!supportsHigh || catalog.fullAccessAllowed === false) throw new Error("Required Codex model, effort or permission is unavailable.");
  if (mode !== "--preflight") {
    await turn({ message: tasks[taskId].prompt });
    for (let number = 2; number <= 9; number++) {
      const command = file(`action-${number}.json`);
      for (let i = 0; !existsSync(command) && i < 900; i++) await delay(1000);
      if (!existsSync(command)) throw new Error("No operator action within 15 minutes.");
      const action = JSON.parse(readFileSync(command, "utf8"));
      if (action.stop) break;
      if (number > 8) throw new Error("User turn budget exhausted.");
      await turn(action);
    }
  }
} catch (error) {
  report.error = String(error.message ?? error);
  process.exitCode = 1;
} finally {
  try {
    if (id && alive()) await call(route, { action: "interrupt", id }).catch(() => {});
    if (alive()) {
      const health = await call("/daemon/health");
      if (health.pid !== host.pid) throw new Error("Refusing to stop an unowned Host.");
      await call("/daemon/stop", { ...health, confirm: true });
      await Promise.race([exited, delay(30_000, undefined, { ref: false })]);
    }
  } catch (error) {
    report.shutdownError = String(error.message ?? error);
  } finally {
    if (alive()) {
      if (process.platform === "win32") {
        try { execFileSync("taskkill.exe", ["/PID", String(host.pid), "/T", "/F"], { windowsHide: true }); }
        catch (error) { report.shutdownError = String(error.message ?? error); }
      } else host.kill();
      await Promise.race([exited, delay(5000, undefined, { ref: false })]);
    }
    report.hostExited = !alive();
    report.closedAt = Date.now();
    save();
    console.log(JSON.stringify({ name, preflight: report.preflight, error: report.error, hostExited: report.hostExited }));
  }
}
