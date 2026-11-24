// Spike driver: starts the real Litzio HTTP Host in-process (isolated data/assistant dirs), points the Ollama provider at
// OLLAMA_URL and runs one scenario through the Host's own assistant operations. With LITZIO_SPIKE_PI_ACP set, the
// Ollama connection launches pi-litzio-acp.mjs instead of `copilot --acp`.
// Usage: tsx host-driver.ts <scenario> [conversationId]
//   hello | qcard | readdoc | write-inside | write-outside | cancel | followup <id> | audio <wav>...
// Env: SPIKE_ROOT (data root), OLLAMA_URL, SPIKE_MODEL, SPIKE_PERMISSION (full-access|opened-folders|read-only), SPIKE_MESSAGE
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.SPIKE_ROOT!;
const scenario = process.argv[2]!, extra = process.argv.slice(3);
const docs = path.join(root, "docs"), editorDir = path.join(root, "editor");
for (const dir of [docs, editorDir]) mkdirSync(dir, { recursive: true });
writeFileSync(path.join(editorDir, "index.html"), "<!doctype html><title>spike</title>");
const doc = path.join(docs, "line-report.md");
if (!existsSync(doc)) writeFileSync(doc, "# 생산 라인 점검\n\n| 라인 | 상태 |\n| --- | --- |\n| A 라인 | 정상 |\n| B 라인 | 이상: 컨베이어 소음 |\n");
process.env.LITZIO_DATA_DIR = path.join(root, "data");
process.env.LITZIO_ASSISTANT_CWD = path.join(root, "assistant");
process.env.SPIKE_DOC = doc;
const started = Date.now();
const log = (...values: unknown[]) => console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s]`, ...values);

const { startHttpHost } = await import("../../apps/editor/server/http-host.ts");
const host: any = await startHttpHost({ roots: [docs], editorDir, port: 0, log: () => {}, warn: message => log("warn", message) });
const origin: string = host.origin ?? host.url ?? `http://127.0.0.1:${host.port ?? host.server?.address().port}`;
log("host", origin);
const call = async (method: string, route: string, body?: unknown) => {
  const response = await fetch(origin + route, { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${route} -> ${response.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
};
const model = process.env.SPIKE_MODEL ?? "fake-audio:latest";
const permissionMode = process.env.SPIKE_PERMISSION ?? "full-access";
const settings = await call("GET", "/api/assistant/settings");
await call("PUT", "/api/assistant/settings", { ...settings, provider: "ollama", ollamaUrl: process.env.OLLAMA_URL, model, reasoningEffort: "medium", permissionMode });
log("diagnostics", JSON.stringify(await call("GET", "/api/assistant/diagnostics?provider=ollama")).slice(0, 300));

const message = process.env.SPIKE_MESSAGE || ({ hello: "안녕?", qcard: "QCARD: ask me one question with the question card tool.", readdoc: "READDOC: read the document line-report.md with the Litzio Host tool.",
  "write-inside": `WRITEFILE ${path.join(docs, "spike-note.md")}`, "write-outside": `WRITEFILE ${path.join(root, "outside-note.md")}`, cancel: "SLOW please", bash: "BASH echo SHELL=$0; litzio --version; ls bin", followup: "다시 안녕?", audio: "Transcribe the attached audio." } as Record<string, string>)[scenario]!;
const references: string[] = [];
const send = { action: "send", provider: "ollama", model, reasoningEffort: "medium", permissionMode, message, folders: [docs], document: { path: doc }, references, ...(scenario === "followup" ? { id: extra[0] } : {}) };
if (scenario === "followup") {
  const resumed = await call("POST", "/api/assistant/conversations", { action: "resume", id: extra[0] });
  log("resumed; replayed turns", resumed.turns.length, JSON.stringify(resumed.turns.map((t: any) => t.items.map((i: any) => `${i.kind}:${(i.text ?? "").slice(0, 40)}`))));
}
let conversation = await call("POST", "/api/assistant/conversations", send);
const id = conversation.id;
log("sent; conversation", id);
const deadline = Date.now() + Number(process.env.SPIKE_TIMEOUT_MS ?? 600_000);
let cancelled = false, answered = false;
while (Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 500));
  conversation = await call("GET", `/api/assistant/conversations?id=${encodeURIComponent(id)}`);
  const turn = conversation.turns.at(-1);
  if (scenario === "cancel" && !cancelled && Date.now() - started > 4000) { cancelled = true; log("interrupt"); await call("POST", "/api/assistant/conversations", { action: "interrupt", id }); }
  const pending = turn?.items.find((item: any) => item.question?.status === "pending" && item.question.approval);
  if (pending && !answered) {
    answered = true;
    log("approval card", JSON.stringify(pending.question.questions[0]).slice(0, 500));
    const option = process.env.SPIKE_APPROVE === "reject" ? "Reject" : pending.question.questions[0].options[0].label;
    await call("POST", "/api/assistant/conversations", { action: "answer", id, turnId: pending.question.turnId, requestId: pending.question.requestId, answers: { decision: { answers: [option] } } });
  }
  if (turn && turn.status !== "inProgress") break;
}
const turn = conversation.turns.at(-1);
log("turn", turn?.status, turn?.error ?? "");
for (const item of turn?.items ?? []) log("item", item.kind, JSON.stringify({ text: item.text?.slice(0, 300), tool: item.tool ?? item.toolName, status: item.status, question: item.question && { status: item.question.status, approval: item.question.approval, q: item.question.questions?.map((q: any) => q.question ?? q.title) } }).slice(0, 600));
log("usage", JSON.stringify({ tokenUsage: conversation.tokenUsage, copilotUsage: conversation.copilotUsage }));
if (scenario.startsWith("write")) log("file written?", existsSync(path.join(docs, "spike-note.md")), existsSync(path.join(root, "outside-note.md")));
console.log("CONVERSATION", id);
await host.close?.();
log("host closed");
process.exit(0);
