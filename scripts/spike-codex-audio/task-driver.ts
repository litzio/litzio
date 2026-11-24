// Spike experiment 2 driver: one run of one task on a fresh isolated Litzio HTTP Host (in this process).
// Usage: tsx task-driver.ts <hello|edit|plugin> <run-root> [--fake]
// Writes <run-root>/result.json: per turn the outcome, judgement, Host tool items, and the proxy's model requests.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedHostEnvironment } from "../../test/helpers/isolated-host-environment.ts";
import { parse, serialize } from "../../packages/core/src/index.ts";
import { startFake } from "./fake-ollama.mjs";
import { startProxy } from "./ollama-proxy.mjs";
import { localConnection, model } from "./local-connection.ts";

const [task, root, mode] = process.argv.slice(2) as ["hello" | "edit" | "plugin", string, string?];
if (!["hello", "edit", "plugin"].includes(task) || !root || !path.isAbsolute(root) || existsSync(root)
  || (mode && mode !== "--fake")) throw new Error("Supply a task and a new absolute run directory.");
const fake = mode === "--fake";
const checkout = fileURLToPath(new URL("../../", import.meta.url));
const docs = path.join(root, "docs"), editorDir = path.join(root, "editor");
for (const dir of [docs, editorDir]) mkdirSync(dir, { recursive: true });
writeFileSync(path.join(editorDir, "index.html"), "<!doctype html><title>spike</title>");
for (const key of Object.keys(process.env)) if (/^LITZIO_.*_SETTINGS_FILE$/.test(key)) delete process.env[key];
Object.assign(process.env, isolatedHostEnvironment(root));
// Preserve the earlier experiment's project boundary. Windows Codex home skills are excluded by localConnection.
mkdirSync(path.join(process.env.LITZIO_ASSISTANT_CWD!, ".git"), { recursive: true });
const engine = "codex";
const started = Date.now();
const deadline = started + 20 * 60_000;
const log = (...values: unknown[]) => console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s]`, ...values);

// Task 1 fixture: a canonical Litzio document (two headings, paragraphs, a table). The target paragraph is not last.
const DOC = "점검.md";
const TARGET_OLD = "검사 주기는 매주 월요일 오전이다.";
const docFile = path.join(docs, DOC);
const original = serialize(parse(`---\nlitzio: 1\ntitle: 설비 점검 안내\n---\n\n# 점검 개요\n\n이 문서는 조립 라인 설비의 정기 점검 방법을 정리한다.\n\n${TARGET_OLD}\n\n점검 결과는 담당자가 기록한다.\n\n# 점검 항목\n\n| 항목 | 기준 |\n| --- | --- |\n| 벨트 장력 | 정상 범위 |\n| 모터 온도 | 70도 이하 |\n\n이상이 있으면 즉시 라인을 멈춘다.\n`));
const MESSAGES = {
  hello: ["안녕?"],
  edit: [`${DOC}에서 "${TARGET_OLD}" 문단의 요일을 수요일로 고쳐 줘. 다른 곳은 바꾸지 마.`, "방금 고친 문단 아래에 한 문장을 더해 줘."],
  plugin: ["작은 화면 플러그인 하나를 만들어 이 Host에 설치해 줘. ID는 local.counter, 이름은 '누름 횟수'. 화면에 제목 '누름 횟수'와 [누르기] 버튼 하나가 있고, 버튼을 누를 때마다 누른 횟수를 화면에 보여 주면 돼. 저장은 필요 없어. 다 되면 설치됐는지 확인하고 짧게 알려 줘.", "버튼 글자를 '한 번 더'로 바꿔 줘."],
}[task];
if (task === "edit") writeFileSync(docFile, original);

const lines = (s: string) => s.replace(/\r\n/g, "\n").split("\n");
// Asynchronous: the Host runs in this process, so a blocking child would stall it (one run lost its next send).
const litzioCheck = (file: string) => new Promise<{ passed: boolean; detail: string }>(resolve => execFile(process.execPath,
  [path.join(checkout, "node_modules/tsx/dist/cli.mjs"), path.join(checkout, "packages/cli/src/cli.ts"), "check", file, "--format", "json"],
  { cwd: checkout, encoding: "utf8", timeout: 60_000, windowsHide: true }, (error, stdout, stderr) => resolve({ passed: !error, detail: (stdout + stderr).slice(0, 600) })));
/** Turn 1: only the target paragraph line changed, now says 수요일 and no longer 월요일. */
function judgeEdit1(before: string, after: string) {
  const a = lines(before), b = lines(after), t = a.indexOf(TARGET_OLD);
  const sameOthers = a.length === b.length && a.every((line, i) => i === t || line === b[i]);
  const changedOk = /수요일/.test(b[t] ?? "") && !/월요일/.test(b[t] ?? "");
  return { changed: before !== after, onlyTarget: sameOthers, targetFixed: changedOk, ok: before !== after && sameOthers && changedOk };
}
/** Turn 2: everything before the target paragraph and from the next original block on is unchanged; between them
 *  the edited paragraph remains and new sentence text was added. */
function judgeEdit2(before: string, after: string) {
  const a = lines(before), b = lines(after);
  const t = a.findIndex(line => line.includes("검사 주기")), next = a.findIndex((line, i) => i > t && line.trim() !== "");
  const head = a.slice(0, t), tail = a.slice(next);
  const headOk = head.every((line, i) => b[i] === line);
  const tailStart = b.length - tail.length;
  const tailOk = tailStart >= t && tail.every((line, i) => b[tailStart + i] === line);
  const middleBefore = a.slice(t, next).join("\n").trim(), middleAfter = b.slice(t, tailStart).join("\n").trim();
  const grew = middleAfter.length > middleBefore.length && middleAfter.includes("수요일");
  return { changed: before !== after, headOk, tailOk, grew, added: middleAfter.slice(middleBefore.length > 0 ? 0 : 0, 400), ok: before !== after && headOk && tailOk && grew };
}

const proxyLog = path.join(root, "proxy.jsonl");
const proxyLines = () => existsSync(proxyLog) ? readFileSync(proxyLog, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)) : [];
const { startHttpHost } = await import("../../apps/editor/server/http-host.ts");
const { DAEMON_PROTOCOL } = await import("../../apps/editor/server/daemon-protocol.ts");
// The same daemon control `litzio daemon run` passes: without it the Host has no /daemon/health and every
// `litzio plugins ...` CLI call fails its protocol check (found after the first plugin runs; see SPIKE.md).
const daemon = { health: { pid: process.pid, startedAt: new Date().toISOString(), instanceId: crypto.randomUUID(), processStartedAt: new Date().toISOString(),
  daemonHome: process.env.LITZIO_DAEMON_DIR!, executable: process.execPath, roots: [root], nonLoopback: false, launcher: "cli-run" as const, productVersion: "0.0.0-spike", protocolVersion: DAEMON_PROTOCOL },
  stop: () => {} };
// Host roots = the whole run folder, as scripts/assistant-acceptance runs `daemon run --root <run>`: with only docs,
// full-access scaffolding into the Host's plugin authoring folder (under the data folder) is refused (second fix).
const proxy = fake ? await startFake(proxyLog, docFile, path.join(root, "unused.md"), Buffer.alloc(0))
  : await startProxy(proxyLog, path.join(root, "bodies"));
let host: Awaited<ReturnType<typeof startHttpHost>> | undefined;
try {
  const local = await localConnection(root, process.env.LITZIO_ASSISTANT_CWD!, proxy.origin);
  host = await startHttpHost({ roots: [root], editorDir, port: 0, daemon, spikeAgent: local.create, log: () => {}, warn: (message: string) => log("warn", String(message).slice(0, 300)) });
  const origin: string = host.origin ?? host.url ?? `http://127.0.0.1:${host.port ?? host.server?.address().port}`;
  const call = async (method: string, route: string, body?: unknown) => {
    const response = await fetch(origin + route, { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${route} -> ${response.status} ${text.slice(0, 500)}`);
    return text ? JSON.parse(text) : undefined;
  };
  const permissionMode = "full-access", reasoningEffort = "medium";
  const settings = await call("GET", "/api/assistant/settings");
  await call("PUT", "/api/assistant/settings", { ...settings, provider: "codex", model, reasoningEffort, permissionMode });
  log("host", origin, "proxy", proxy.origin, "pid", process.pid, "engine", engine, "task", task);

  function pluginState() {
    const settingsFile = process.env.LITZIO_PLUGINS_SETTINGS_FILE!;
    const record = existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, "utf8")) : {};
    return record;
  }
  /** Files of the Host's installed copy of local.counter (not the assistant's source folder). */
  function installedCopyText(installationId: string | undefined) {
    if (!installationId) return { dir: null, text: "" };
    const walk = (dir: string, depth = 0): string[] => depth > 6 ? [] : readdirSync(dir, { withFileTypes: true }).flatMap(e => e.name === "node_modules" ? [] : e.isDirectory() ? walk(path.join(dir, e.name), depth + 1) : [path.join(dir, e.name)]);
    const all = walk(process.env.LITZIO_DATA_DIR!);
    const dir = [...new Set(all.map(f => path.dirname(f)))].find(d => path.basename(d) === installationId || d.includes(installationId));
    if (!dir) return { dir: null, text: "" };
    const files = walk(dir).filter(f => /\.(jsx?|tsx?|mjs|json|html)$/.test(f) && statSync(f).size < 2_000_000);
    return { dir: path.relative(root, dir), text: files.map(f => readFileSync(f, "utf8")).join("\n") };
  }
  function findInstallationId(record: any): string | undefined {
    let found: string | undefined;
    const visit = (v: any, key?: string) => {
      if (!v || typeof v !== "object") return;
      if (key === "local.counter" && typeof v.installationId === "string") found = v.installationId;
      for (const [k, value] of Object.entries(v)) visit(value, k);
    };
    visit(record);
    return found;
  }
  async function judgePlugin(turn: 1 | 2) {
    const list = (await call("GET", "/api/plugins")).plugins as any[];
    const entry = list.find(p => p.id === "local.counter");
    const installationId = findInstallationId(pluginState());
    const copy = installedCopyText(installationId);
    const summary = list.map(p => ({ id: p.id, name: p.name, enabled: p.enabled, running: p.running, error: p.error }));
    if (turn === 1) return { plugins: summary, ok: !!entry && entry.enabled === true && entry.running === true, copyDir: copy.dir, hasPressLabel: copy.text.includes("누르기") };
    return { plugins: summary, ok: !!entry && entry.enabled === true && entry.running === true && copy.text.includes("한 번 더"), running: !!entry?.running, copyHasNewLabel: copy.text.includes("한 번 더"), copyDir: copy.dir };
  }

  async function runTurn(index: number, conversationId?: string) {
    const message = MESSAGES[index];
    const before = proxyLines().length, t0 = Date.now();
    const docBefore = task === "edit" ? readFileSync(docFile, "utf8") : "";
    const send = { action: "send", provider: "codex", model, reasoningEffort, permissionMode, message, folders: [docs], ...(task === "edit" ? { document: { path: docFile } } : {}), references: [], ...(conversationId ? { id: conversationId } : {}) };
    let conversation = await call("POST", "/api/assistant/conversations", send);
    const id = conversation.id ?? conversation.conversation?.id;
    let stop = "timeout";
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      conversation = await call("GET", `/api/assistant/conversations?id=${encodeURIComponent(id)}`);
      const turn = conversation.turns.at(-1);
      if (turn?.items.some((item: any) => item.question?.status === "pending")) {
        stop = turn.items.some((item: any) => item.question?.status === "pending" && item.question.approval) ? "approval-pending" : "question-pending"; break;
      }
      if (turn && turn.status !== "inProgress") { stop = turn.status; break; }
    }
    const seconds = +((Date.now() - t0) / 1000).toFixed(1);
    if (conversation.turns.at(-1)?.status === "inProgress") {
      await call("POST", "/api/assistant/conversations", { action: "interrupt", id });
      for (let n = 0; n < 30 && (await call("GET", `/api/assistant/conversations?id=${encodeURIComponent(id)}`)).turns.at(-1)?.status === "inProgress"; n++) await new Promise(r => setTimeout(r, 1000));
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
    const requests = proxyLines().slice(before);
    const turn = conversation.turns.at(-1);
    const items = turn?.items ?? [];
    const tools = items.filter((i: any) => i.kind === "tool").map((i: any) => ({ text: String(i.text ?? "").slice(0, 300), status: i.status, kind: i.work?.kind ?? "host", result: String(i.toolResult ?? "").slice(0, 300) }));
    const judgement = task === "edit"
      ? { ...(index === 0 ? judgeEdit1(docBefore, readFileSync(docFile, "utf8")) : judgeEdit2(docBefore, readFileSync(docFile, "utf8"))), check: await litzioCheck(docFile) }
      : task === "hello" ? { ok: stop === "completed" } : await judgePlugin(index === 0 ? 1 : 2);
    const ok = task === "edit" ? (judgement as any).ok && (judgement as any).check.passed : (judgement as any).ok;
    const modelToolCalls = requests.flatMap((r: any) => r.toolCalls ?? []);
    const result = {
      turn: index + 1, message, stop, error: turn?.error, seconds, ok, judgement,
      modelRequests: requests.length,
      inputTokens: requests.reduce((s: number, r: any) => s + (r.inputTokens ?? 0), 0),
      outputTokens: requests.reduce((s: number, r: any) => s + (r.outputTokens ?? 0), 0),
      firstInput: requests[0]?.inputTokens, lastInput: requests.at(-1)?.inputTokens,
      missingUsage: requests.filter((r: any) => r.inputTokens === undefined).length,
      reasoningCharsTotal: requests.reduce((s: number, r: any) => s + (r.reasoningChars ?? 0), 0),
      requestsWithReasoning: requests.filter((r: any) => r.reasoningChars > 0).length,
      thinkingFields: requests[0]?.thinkingFields,
      toolsFirst: requests[0]?.tools, toolsMax: Math.max(0, ...requests.map((r: any) => r.tools ?? 0)),
      toolSearchCalls: modelToolCalls.filter((c: any) => c.name === "tool_search").length,
      modelToolCalls: modelToolCalls.length, modelToolCallNames: modelToolCalls.map((c: any) => c.name),
      hostToolItems: tools.length, hostToolFailed: tools.filter((t: any) => t.status === "failed").length, tools,
      lastAnswer: items.filter((i: any) => i.kind === "assistant").map((i: any) => i.text).join("\n").slice(-800),
      requests: requests.map((r: any) => ({ n: r.n, status: r.status, ms: r.ms, in: r.inputTokens, out: r.outputTokens, cached: r.cachedTokens, tools: r.tools, msgs: r.messages, reasoning: r.reasoningChars, finish: r.finish, calls: (r.toolCalls ?? []).map((c: any) => c.name), err: r.error ?? r.proxyError })),
    };
    log(`turn ${index + 1}`, stop, `${seconds}s`, ok ? "OK" : "FAIL", `requests=${requests.length}`, `in=${result.inputTokens}`);
    return { id, result };
  }

  const out: any = { engine, model, task, root: path.basename(root), startedAt: new Date(started).toISOString(), turns: [] };
  try {
    const first = await runTurn(0);
    out.conversationId = first.id; out.turns.push(first.result);
    if (fake) {
      const captures = proxyLines();
      const firstRequest = captures.find(request => request.method === "POST" && request.path === "/v1/responses");
      if (!firstRequest || !first.result.ok || captures.some(request => request.method === "CONNECT" || !request.path?.startsWith("/"))) throw new Error("Fake preflight failed");
      log("isolated first request", local.checkBody(firstRequest.body));
    } else {
      const firstBody = path.join(root, "bodies", "1.json");
      if (existsSync(firstBody)) log("first request", local.checkBody(JSON.parse(readFileSync(firstBody, "utf8"))));
      if (task !== "hello" && Date.now() < deadline && first.result.stop !== "timeout") {
        writeFileSync(path.join(root, "result.json"), JSON.stringify(out, null, 2));
        const second = await runTurn(1, first.id);
        out.turns.push(second.result);
      }
    }
    if ("rejected" in proxy && proxy.rejected.length) throw new Error("Unexpected proxy targets were blocked");
  } catch (error) {
    out.error = String((error as Error)?.stack ?? error).slice(0, 2000);
    log("error", out.error);
    process.exitCode = 1;
  } finally {
    out.finishedAt = new Date().toISOString();
    writeFileSync(path.join(root, "result.json"), JSON.stringify(out, null, 2));
  }
} finally {
  try { await host?.close(); } finally { await proxy.close(); }
  log("host and proxy closed");
}
