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
const match = /^([ab])-(sol|terra)(-retry)?$/.exec(name ?? "");
if (!match) throw new Error("Expected a-sol, a-terra, b-sol or b-terra.");
if (mode !== undefined && mode !== "--preflight") throw new Error("Expected --preflight or no mode.");
const [, condition, alias, retry] = match;
const model = alias === "sol" ? "gpt-6.2-sol" : "gpt-6.1-terra";
const reasoningEffort = alias === "sol" ? "medium" : "high";
const permissionMode = "full-access";
const provider = "codex";
const dir = path.resolve("tmp/assistant-review");
const baseline = path.join(dir, "baseline");
const evidence = path.join(dir, "runs", mode === "--preflight" ? name + "-preflight" : name);
const cli = path.resolve("packages/cli/dist/cli.mjs");
if (!existsSync(cli) || !existsSync(path.join(dir, "baseline-score.json"))) throw new Error("Build CLI and score baseline first.");
const readJson = file => JSON.parse(readFileSync(file, "utf8"));
const control = readJson(path.join(dir, "control.json"));
if (control.correct !== 111 || control.total !== 111 || control.damaged !== 0 || !control.validation.valid) {
  throw new Error("Verify the answer sheet before running the experiment.");
}
if (retry) {
  const previous = readJson(path.join(dir, "runs", name.replace(/-retry$/, ""), "state.json"));
  if (!previous.error || previous.actions.length !== 0) {
    throw new Error("Retry is reserved for a runner failure before any assistant submission.");
  }
}
mkdirSync(path.dirname(evidence), { recursive: true });
mkdirSync(evidence); // Each run ID may be used once.
const root = mkdtempSync(path.join(os.tmpdir(), "litzio-pdf-review-"));
const folder = path.join(root, "documents");
cpSync(baseline, folder, { recursive: true });
const stem = "LSR-1.1-standards";
const pdf = path.join(folder, stem + ".pdf");
const document = path.join(folder, stem, stem + ".md");
const answerFile = condition === "a" ? "고칠 곳 목록.md" : "standards.json";
const fixtures = path.join(dir, "plugin", "pdf", "test", "fixtures");
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");
cpSync(path.join(condition === "a" ? dir : fixtures, answerFile), path.join(folder, answerFile));
if (condition === "b") cpSync(path.join(fixtures, "README.md"), path.join(folder, "README.md"));
const answerSha256 = hash(path.join(folder, answerFile));
const expectedAnswerHash = condition === "a" ? control.answerSha256 :
  "34f06fb1a0aabc8b2b016b18815badfbefebab370f26da957e1750501fa66759";
if (answerSha256 !== expectedAnswerHash ||
    hash(document) !== "cec42786f767dde29fcce6c1e63b7692c775dfa459b30d7f23ba9ff59e973a82" ||
    hash(pdf) !== "63cda884de96dfd0357843a534895f1beb7a10b24f3244398d930817a32b82ea") {
  throw new Error("The starting document, PDF or answer does not match the verified input.");
}
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^LITZIO_/i.test(key)));
Object.assign(env, isolatedHostEnvironment(root), { LITZIO_PLUGINS: path.join(root, "plugins") });
mkdirSync(env.LITZIO_DATA_DIR);
writeFileSync(env.LITZIO_ASSISTANT_SETTINGS_FILE, JSON.stringify({ model, reasoningEffort, permissionMode, provider, responseLanguage: "ko" }));

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
const report = { name, condition, root, folder, url, document, pdf, pid: process.pid, hostPid: host.pid,
  model, reasoningEffort, permissionMode, answerSha256, actions: [], snapshots: [],
  initialHash: hash(document), initialPdfHash: hash(pdf) };
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
  const requestedModels = new Set(["gpt-6.2-sol", "gpt-6.1-terra"]);
  const models = catalog.models.filter(item => requestedModels.has(item.model)).map(item => ({
    model: item.model,
    supportedReasoningEfforts: item.supportedReasoningEfforts.map(effort => effort.reasoningEffort),
  }));
  const entry = catalog.models.find(item => item.model === model);
  const supportsEffort = entry?.supportedReasoningEfforts.some(item => item.reasoningEffort === reasoningEffort) ?? false;
  report.preflight = { models, modelFound: Boolean(entry), supportsEffort, fullAccessAllowed: catalog.fullAccessAllowed };
  save();
  if (!supportsEffort || catalog.fullAccessAllowed === false) throw new Error("Model, effort or full access unavailable.");
  if (mode !== "--preflight") {
    const instruction = condition === "a"
      ? "이 폴더의 정답지(" + answerFile + ")대로 이 문서를 고쳐 줘. 정답지에 없는 곳은 건드리지 마."
      : "이 폴더의 정답 파일(" + answerFile + ")이 원본 PDF의 정답이야. 이 문서를 정답과 같게 고쳐 줘. 이미 맞는 곳은 건드리지 마.";
    await turn(instruction + " 원본은 " + stem + ".pdf야.");
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
