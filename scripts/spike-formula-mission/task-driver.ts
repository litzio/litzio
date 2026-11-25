// Adapted from the pi audio task driver. Run one isolated Host, Copilot ACP session and recording proxy.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { isolatedHostEnvironment } from "../../test/helpers/isolated-host-environment.ts";
import { judgeDocument } from "./judge.ts";

const [task, fixtureArg, outputArg, copilotArg] = process.argv.slice(2);
if (!["B", "B-hint", "C", "probe"].includes(task!) || !fixtureArg || !outputArg || !copilotArg) {
  throw new Error("Usage: tsx task-driver.ts <B|B-hint|C|probe> <fixture> <new-evidence-dir> <Copilot-CLI-directory>");
}
const checkout = fileURLToPath(new URL("../../", import.meta.url));
const fixture = path.resolve(fixtureArg);
const evidence = path.resolve(outputArg);
mkdirSync(evidence);
const root = mkdtempSync(path.join(tmpdir(), "litzio-formula-"));
const docs = path.join(root, "docs");
const editorDir = path.join(root, "editor");
const profile = path.join(root, "copilot-profile");
const docsFile = path.join(docs, "LSR-1.1-standards.md");
const baseline = path.join(fixture, path.basename(docsFile));
const formulas = JSON.parse(readFileSync(path.join(fixture, "formulas.json"), "utf8"));
const target = formulas[0];
const selected = task === "C" ? formulas : [target];
cpSync(fixture, docs, { recursive: true, filter: name => path.basename(name) !== "formulas.json" });
for (const key of Object.keys(process.env)) {
  if (/^LITZIO_|^COPILOT_|^(GITHUB_TOKEN|GH_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_PAT|GITHUB_COPILOT_TOKEN)$/i.test(key)) delete process.env[key];
}
Object.assign(process.env, isolatedHostEnvironment(root), {
  HOME: profile, USERPROFILE: profile, COPILOT_HOME: path.join(profile, ".copilot"),
  LOCALAPPDATA: path.join(profile, "local"), APPDATA: path.join(profile, "roaming"),
  TEMP: path.join(root, "temp"), TMP: path.join(root, "temp"),
  PATH: path.resolve(copilotArg) + path.delimiter + process.env.PATH,
});
for (const key of ["HOME", "COPILOT_HOME", "LOCALAPPDATA", "APPDATA", "TEMP"]) mkdirSync(process.env[key]!, { recursive: true });
mkdirSync(path.join(process.env.LITZIO_ASSISTANT_CWD!, ".git"), { recursive: true });
mkdirSync(editorDir);
writeFileSync(path.join(editorDir, "index.html"), "<!doctype html><title>Formula measurement</title>");

const proxyLog = path.join(evidence, "requests.jsonl");
const requestDir = path.join(evidence, "bodies");
const proxy = spawn(process.execPath, [path.join(import.meta.dirname, "ollama-proxy.mjs"), "0", proxyLog, "http://127.0.0.1:11434", requestDir], { windowsHide: true, stdio: ["ignore", "pipe", "inherit"] });
const proxyExit = once(proxy, "exit");
let host: Awaited<ReturnType<typeof import("../../apps/editor/server/http-host.ts").startHttpHost>> | undefined;
const result: Record<string, unknown> = { task, root, pid: process.pid, proxyPid: proxy.pid };
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
  host = await startHttpHost({ roots: [root], editorDir, port: 0, daemon, log: console.log, warn: console.error });
  const origin = host.url;
  const call = async (method: string, route: string, body?: unknown) => {
    const response = await fetch(origin + route, { method, headers: { Origin: origin, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    const raw = await response.text();
    if (!response.ok) throw new Error(method + " " + route + " -> " + response.status + " " + raw);
    return raw ? JSON.parse(raw) : undefined;
  };
  const settings = await call("GET", "/api/assistant/settings");
  await call("PUT", "/api/assistant/settings", { ...settings, provider: "ollama", ollamaUrl: "http://127.0.0.1:" + port, model, reasoningEffort, permissionMode });
  const message = task === "C" ? "이 문서에서 그림으로 들어간 수식을 모두 수식으로 바꿔 줘."
    : task === "probe" ? "파일을 수정하지 말고 이미지 보기 도구로 " + path.join(docs, target.image) + " 그림을 연 다음, 그림에서 보이는 수식을 LaTeX로 써 줘."
    : path.basename(docsFile) + "의 " + target.image + " 그림 블록을 수식 블록 " + target.latex + "로 바꿔 줘.";
  const route = "/api/assistant/conversations";
  const started = Date.now();
  result.message = message;
  const sent = await call("POST", route, { action: "send", submissionId: crypto.randomUUID(), provider: "ollama", model, reasoningEffort, permissionMode,
    message, folders: [docs], document: { path: docsFile }, references: [] });
  let conversation = sent.conversation ?? sent;
  const id = conversation.id;
  if (!id) throw new Error("No conversation returned.");
  result.conversationId = id;
  const snapshot = async () => {
    const response = await call("GET", route + "?id=" + encodeURIComponent(id));
    return response.conversation ?? response;
  };

  let stop = "timeout";
  while (Date.now() - started < 600_000) {
    const turn = conversation.turns.at(-1);
    const questions = turn?.items.filter(item => item.question?.status === "pending") ?? [];
    if (questions.length) {
      stop = questions.some(item => item.question.approval) ? "approval-pending" : "question-pending";
      break;
    }
    if (turn && turn.status !== "inProgress") {
      stop = turn.status;
      break;
    }
    await delay(1000);
    conversation = await snapshot();
  }
  result.seconds = (Date.now() - started) / 1000;
  result.stop = stop;
  result.conversation = conversation;
  if (conversation.turns.at(-1)?.status === "inProgress") {
    await call("POST", route, { action: "interrupt", id });
    for (let n = 0; n < 30; n++) {
      const interrupted = await snapshot();
      if (interrupted.turns.at(-1)?.status !== "inProgress") break;
      await delay(1000);
    }
  }
  if (task !== "probe") result.judgement = await judgeDocument(checkout, baseline, docsFile, selected);
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
  console.log(JSON.stringify({ task, pid: process.pid, seconds: result.seconds, stop: result.stop, modelRequests: result.modelRequests, inputTokens: result.inputTokens, error: result.error }));
}
