// Adapted from the formula mission's isolated Host, Copilot ACP and recording proxy.
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { isolatedHostEnvironment } from "../../test/helpers/isolated-host-environment.ts";
import { judgeDocument } from "./judge.ts";
import { tasks } from "./tasks.mjs";

const [taskId, outputArg, copilotArg] = process.argv.slice(2);
const task = tasks.find(candidate => candidate.id === taskId);
if (!task || !outputArg || !copilotArg) {
  throw new Error("Usage: tsx task-driver.ts <task-id> <new-evidence-dir> <Copilot-CLI-directory>");
}
const checkout = fileURLToPath(new URL("../../", import.meta.url));
const evidence = path.resolve(outputArg);
mkdirSync(evidence);
const root = mkdtempSync(path.join(tmpdir(), "litzio-small-range-"));
const docs = path.join(root, "docs");
const baseline = path.join(evidence, "baseline");
const editorDir = path.join(root, "editor");
const profile = path.join(root, "copilot-profile");
mkdirSync(docs);
task.prepare?.(docs);
cpSync(docs, baseline, { recursive: true });
for (const key of Object.keys(process.env)) {
  if (/^LITZIO_|^COPILOT_|^(GITHUB_TOKEN|GH_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_PAT|GITHUB_COPILOT_TOKEN)$/i.test(key)) delete process.env[key];
}
Object.assign(process.env, isolatedHostEnvironment(root), {
  HOME: profile, USERPROFILE: profile, COPILOT_HOME: path.join(profile, ".copilot"),
  LOCALAPPDATA: path.join(profile, "local"), APPDATA: path.join(profile, "roaming"),
  TEMP: path.join(root, "temp"), TMP: path.join(root, "temp"),
  PIP_REQUIRE_VIRTUALENV: "1", PIP_NO_INDEX: "1",
  PATH: path.resolve(copilotArg) + path.delimiter + process.env.PATH,
});
for (const key of ["HOME", "COPILOT_HOME", "LOCALAPPDATA", "APPDATA", "TEMP"]) mkdirSync(process.env[key]!, { recursive: true });
mkdirSync(path.join(process.env.LITZIO_ASSISTANT_CWD!, ".git"), { recursive: true });
mkdirSync(editorDir);
writeFileSync(path.join(editorDir, "index.html"), "<!doctype html><title>Ollama task range measurement</title>");

const proxyLog = path.join(evidence, "requests.jsonl");
const requestDir = path.join(evidence, "bodies");
const proxy = spawn(process.execPath, [path.join(import.meta.dirname, "ollama-proxy.mjs"), "0", proxyLog, "http://127.0.0.1:11434", requestDir], { windowsHide: true, stdio: ["ignore", "pipe", "inherit"] });
const proxyExit = once(proxy, "exit");
let host: Awaited<ReturnType<typeof import("../../apps/editor/server/http-host.ts").startHttpHost>> | undefined;
const result: Record<string, unknown> = { task: taskId, root, pid: process.pid, proxyPid: proxy.pid };
const model = "gemma4:e4b", permissionMode = "full-access", reasoningEffort = "medium";
const save = () => writeFileSync(path.join(evidence, "result.json"), JSON.stringify(result, null, 2));
save();

try {
  const [ready] = await Promise.race([once(proxy.stdout!, "data"), proxyExit, delay(10000, [], { ref: false })]);
  const port = /ollama proxy on (\d+)/.exec(String(ready))?.[1];
  if (!port) throw new Error("Recording proxy failed to start.");
  const { startHttpHost } = await import("../../apps/editor/server/http-host.ts");
  const { DAEMON_PROTOCOL } = await import("../../apps/editor/server/daemon-protocol.ts");
  const daemon = { health: { pid: process.pid, startedAt: new Date().toISOString(), instanceId: crypto.randomUUID(), processStartedAt: new Date().toISOString(),
    daemonHome: process.env.LITZIO_DAEMON_DIR!, executable: process.execPath, roots: [root], nonLoopback: false,
    launcher: "cli-run" as const, productVersion: "0.0.0-spike", protocolVersion: DAEMON_PROTOCOL }, stop: () => {} };
  const hostLog = (line: string) => {
    appendFileSync(path.join(evidence, "host.log"), line + "\n");
    const version = /provider=ollama engine=acp role=main version=(\S+)/.exec(line)?.[1];
    if (version) result.cliVersion = version;
  };
  host = await startHttpHost({ roots: [root], editorDir, port: 0, daemon, log: hostLog, warn: hostLog });
  const origin = host.url;
  const call = async (method: string, route: string, body?: unknown, timeout = 30_000) => {
    const response = await fetch(origin + route, { method, headers: { Origin: origin, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
    const raw = await response.text();
    if (!response.ok) throw new Error(method + " " + route + " -> " + response.status + " " + raw);
    return raw ? JSON.parse(raw) : undefined;
  };
  const settings = await call("GET", "/api/assistant/settings");
  await call("PUT", "/api/assistant/settings", { ...settings, provider: "ollama", ollamaUrl: "http://127.0.0.1:" + port, model, reasoningEffort, permissionMode });
  const route = "/api/assistant/conversations";
  const references = [];
  if (task.attachment) {
    const attachment = await call("POST", route, {
      action: "upload-image", mime: "image/png", data: readFileSync(task.attachment).toString("base64"),
    });
    references.push(attachment.path);
  }
  const message = task.message.replace("{folder}", docs).replace("{file}", task.imageFile ? path.join(docs, task.imageFile) : "");
  const started = Date.now(), deadline = started + 300_000;
  result.message = message;
  let conversation, id;
  const budget = () => Math.min(30_000, Math.max(1, deadline - Date.now()));
  const snapshot = async (timeout = 30_000) => {
    const response = await call("GET", route + "?id=" + encodeURIComponent(id), undefined, timeout);
    return response.conversation ?? response;
  };

  async function runTurn(message, references = []) {
    if (Date.now() >= deadline) return "timeout";
    const submissionId = crypto.randomUUID();
    let sent = await call("POST", route, { action: "send", id, submissionId, provider: "ollama", model, reasoningEffort, permissionMode,
      message, folders: taskId.startsWith("1") ? [] : [docs],
      document: task.activeDocument ? { path: path.join(docs, task.activeDocument) } : undefined, references }, budget());
    while (!sent.conversation && sent.submission?.status === "pending" && Date.now() < deadline) {
      await delay(Math.min(500, budget()));
      sent = await call("GET", route + "?submissionId=" + encodeURIComponent(submissionId), undefined, budget());
    }
    conversation = sent.conversation ?? (sent.submission?.conversationId ? sent : undefined);
    id = conversation?.id ?? sent.submission?.conversationId;
    if (!id) throw new Error("No accepted conversation: " + JSON.stringify(sent.submission ?? sent));
    result.conversationId = id;
    conversation = await snapshot(budget());

    while (Date.now() < deadline) {
      const turn = conversation.turns.at(-1);
      const questions = turn?.items.filter(item => item.question?.status === "pending") ?? [];
      if (questions.length) return questions.some(item => item.question.approval) ? "approval-pending" : "question-pending";
      if (turn && turn.status !== "inProgress") return turn.status;
      await delay(Math.min(500, budget()));
      conversation = await snapshot(budget());
    }
    return "timeout";
  }

  const observeTurn = (...args: Parameters<typeof runTurn>) => runTurn(...args).catch(error => {
    if (Date.now() >= deadline && error.name === "TimeoutError") return "timeout";
    throw error;
  });
  const firstStop = await observeTurn(message, references);
  result.firstStop = firstStop;
  let stop = firstStop;
  if (task.followup && firstStop === "completed") {
    cpSync(docs, path.join(evidence, "first-turn"), { recursive: true });
    stop = await observeTurn(task.followup);
  }
  result.seconds = (Date.now() - started) / 1000;
  result.stop = stop;
  result.conversation = conversation;
  if (conversation?.turns.at(-1)?.status === "inProgress") {
    await call("POST", route, { action: "interrupt", id });
    for (let n = 0; n < 30; n++) {
      const interrupted = await snapshot();
      if (interrupted.turns.at(-1)?.status !== "inProgress") break;
      await delay(1000);
    }
  }
  cpSync(docs, path.join(evidence, "final"), { recursive: true });
  result.judgement = await judgeDocument(checkout, evidence, task, result);
} catch (error) {
  result.error = String((error as Error).stack ?? error);
  process.exitCode = 1;
} finally {
  try {
    const requests = existsSync(proxyLog) ? readFileSync(proxyLog, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
    result.requests = requests;
    const captured = existsSync(requestDir) ? readdirSync(requestDir).filter(name => /^\d+\.json$/.test(name)).length : 0;
    result.modelRequests = captured;
    result.inputTokens = requests.reduce((sum, request) => sum + (request.inputTokens ?? 0), 0);
    result.missingUsage = captured - new Set(requests.filter(request => request.inputTokens !== undefined).map(request => request.n)).size;
    const resident = await fetch("http://127.0.0.1:11434/api/ps", { signal: AbortSignal.timeout(5000) }).then(response => response.json()).catch(() => undefined);
    result.ollamaResident = resident?.models?.filter(model => model.name === "gemma4:e4b");
    save();
  } finally {
    try { await host?.close(); }
    finally { proxy.kill(); await proxyExit; }
  }
  console.log(JSON.stringify({ task: taskId, pid: process.pid, seconds: result.seconds, judgement: result.judgement?.ok, stop: result.stop, modelRequests: result.modelRequests, inputTokens: result.inputTokens, error: result.error }));
}
