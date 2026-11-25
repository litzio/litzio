/* Isolated Host and shutdown adapted from the plugin-authoring spike runner. */
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isolatedHostEnvironment } from "../../test/helpers/isolated-host-environment.ts";
import { DAEMON_PROTOCOL } from "../../apps/editor/shared/daemon-version.ts";

const [name, mode] = process.argv.slice(2);
const match = /^(sol|terra|astra)-([123]|png-[12]|reserve)$/.exec(name ?? "");
if (!match) throw new Error("Expected sol/terra and run number, png episode or reserve.");
const model = ({sol: "gpt-6.2-sol", terra: "gpt-6.1-terra", astra: "gpt-6.2-astra"})[match[1]];
const reasoningEffort = match[1] === "terra" ? "high" : "medium";
const permissionMode = "full-access";
const provider = "codex";
const dir = path.resolve("tmp/assistant-review");
const baseline = path.join(dir, "baseline");
const evidence = path.join(dir, "runs", mode === "--preflight" ? name + "-preflight" : name);
const cli = path.resolve("packages/cli/dist/cli.mjs");
if (!existsSync(cli) || !existsSync(path.join(dir, "baseline-score.json"))) throw new Error("Build CLI and score baseline first.");
mkdirSync(path.dirname(evidence), { recursive: true });
mkdirSync(evidence); // Each run ID may be used once.
const root = mkdtempSync(path.join(os.tmpdir(), "litzio-pdf-review-"));
const folder = path.join(root, "documents");
cpSync(baseline, folder, { recursive: true });
if (name.includes("-png-")) cpSync(path.join(dir, "pages"), path.join(folder, "pages"), { recursive: true });
const stem = "LSR-1.1-standards";
const pdf = path.join(folder, stem + ".pdf");
const document = path.join(folder, stem, stem + ".md");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^LITZIO_/i.test(key)));
Object.assign(env, isolatedHostEnvironment(root), { LITZIO_PLUGINS: path.join(root, "plugins") });
mkdirSync(env.LITZIO_DATA_DIR);
writeFileSync(env.LITZIO_ASSISTANT_SETTINGS_FILE, JSON.stringify({ model, reasoningEffort, permissionMode, provider, responseLanguage: "ko" }));
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");

const socket = net.createServer().listen(0, "127.0.0.1");
await once(socket, "listening");
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const url = "http://127.0.0.1:" + port;
const host = spawn(process.execPath, [cli, "daemon", "run", "--root", folder, "--port", String(port)], {
  env, cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let hostLog = "";
host.stdout.on("data", chunk => { hostLog += chunk; });
host.stderr.on("data", chunk => { hostLog += chunk; });
const exited = once(host, "exit");
const alive = () => host.exitCode === null && host.signalCode === null;
const report = { name, root, folder, url, document, pdf, pid: process.pid, hostPid: host.pid,
  model, reasoningEffort, permissionMode, actions: [], snapshots: [], initialHash: hash(document), initialPdfHash: hash(pdf) };
function save() {
  writeFileSync(path.join(evidence, "state.json"), JSON.stringify(report, null, 2));
  writeFileSync(path.join(evidence, "host.log"), hostLog);
}
const route = "/api/assistant/conversations";
async function call(suffix, body, timeout = 30_000) {
  const response = await fetch(url + suffix, {
    method: body ? "POST" : "GET",
    headers: { Origin: url, Connection: "close", "Content-Type": "application/json", "x-litzio-protocol": DAEMON_PROTOCOL },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}
let id;
async function turn(message) {
  const start = Date.now();
  const previous = report.snapshots.at(-1)?.conversation.turns.length ?? 0;
  const submissionId = crypto.randomUUID();
  report.actions.push({ message, time: start, submissionId });
  save();
  try {
    const sent = await call(route, { action: "send", id, submissionId, provider, model, reasoningEffort, permissionMode,
      folders: [folder], document: { path: document }, message });
    id = sent.conversation?.id ?? sent.submission?.conversationId ?? id;
  } catch (error) {
    // Consult the receipt after transport failure and never replay a send.
    report.transportError = String(error);
  }
  let conversation;
  let state = "timeout";
  while (Date.now() - start < 900_000) {
    const receipt = await call(route + "?submissionId=" + submissionId);
    if (receipt.submission?.status === "rejected") throw new Error(JSON.stringify(receipt.submission));
    id ??= receipt.conversation?.id ?? receipt.submission?.conversationId;
    if (id) {
      conversation = await call(route + "?id=" + encodeURIComponent(id));
      const last = conversation.turns.at(-1);
      if (conversation.turns.length > previous && last) {
        if (last.items.some(item => item.question?.status === "pending" && item.question.approval)) {
          state = "approval";
          break;
        }
        if (last.status !== "inProgress") {
          state = last.status;
          break;
        }
      }
    }
    await delay(1000);
  }
  const admitted = (conversation?.turns.length ?? 0) > previous;
  if (admitted && (conversation.model !== model || conversation.reasoningEffort !== reasoningEffort || conversation.permissionMode !== permissionMode)) {
    throw new Error("Admitted conversation settings differ from the experiment.");
  }
  report.snapshots.push({ admitted, elapsedSeconds: (Date.now() - start) / 1000, state, conversation,
    documentHash: existsSync(document) ? hash(document) : null, pdfHash: existsSync(pdf) ? hash(pdf) : null });
  save();
  return state;
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
  const supportsEffort = entry?.supportedReasoningEfforts.some(item => item.reasoningEffort === reasoningEffort) ?? false;
  report.preflight = { modelFound: Boolean(entry), supportsEffort, fullAccessAllowed: catalog.fullAccessAllowed };
  save();
  if (!supportsEffort || catalog.fullAccessAllowed === false) throw new Error("Model, effort or full access unavailable.");
  if (mode !== "--preflight") {
    const pages = name.includes("-png-") ? "\n원본의 쪽 이미지는 " + path.join(folder, "pages") + "에 있어." : "";
    const first = await turn("원본 PDF는 " + pdf + "에 있고, 변환한 문서는 지금 열어 둔 문서(" + document + ")야." +
      pages + "\n원본과 견줘 변환이 틀린 곳을 찾아 목록으로 알려 줘. 아직 고치지는 마.");
    if (first === "completed") await turn("찾은 것을 문서에 반영해 줘. 원본과 같은 곳은 건드리지 마.");
  }
} catch (error) {
  report.error = String(error.message ?? error);
  process.exitCode = 1;
} finally {
  try {
    if (id && alive() && report.snapshots.at(-1)?.state !== "completed") {
      await call(route, { action: "interrupt", id }).catch(() => {});
    }
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
    console.log(JSON.stringify({ name, preflight: report.preflight, turns: report.snapshots.map(t => t.state),
      error: report.error, hostExited: report.hostExited }));
  }
}
