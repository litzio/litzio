// Sends one Assistant turn to an isolated Host and counts the CLI calls it made.
// Usage: node assistant-count.mjs <host-origin> <docs-root> <permissionMode> <message> <out.json>
//        node assistant-count.mjs <host-origin> --analyze <conversation-id> <out.json>
// Uses the cheapest model from AGENTS.md (Codex gpt-6-luna, low).
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";

const analyze = process.argv[3] === "--analyze";
const [origin, root, permissionMode, message, out] = analyze ? [process.argv[2], "", "", "", process.argv[5]] : process.argv.slice(2);
const route = `${origin}/api/assistant/conversations`;
const headers = { "Content-Type": "application/json", "X-Litzio-Protocol": "4", Origin: origin };
const started = Date.now();
const submission = analyze ? { id: process.argv[4] } : await (await fetch(route, { method: "POST", headers, body: JSON.stringify({
  action: "send", submissionId: randomUUID(), message, provider: "codex", permissionMode, model: "gpt-6-luna", reasoningEffort: "low",
  references: [], skills: [], folders: [root], document: { path: path.join(root, "report.md") },
}) })).json();
let id = submission.conversationId ?? submission.receipt?.conversationId ?? submission.id;
let conversation;
for (;;) {
  await new Promise(resolve => setTimeout(resolve, 2000));
  if (!id) {
    // The newest conversation created after this send (the isolated Host has no other client).
    const list = await (await fetch(route, { headers })).json();
    id = list.filter(info => info.createdAt >= started - 2000).sort((a, b) => b.createdAt - a.createdAt)[0]?.id;
    if (!id) continue;
  }
  conversation = await (await fetch(`${route}?id=${encodeURIComponent(id)}`, { headers })).json();
  const turn = conversation?.turns?.at(-1);
  if (turn && turn.status !== "inProgress" && (analyze || Date.now() - started > 5000)) break;
  if (Date.now() - started > 15 * 60_000) throw new Error("turn did not finish in 15 minutes");
}
const items = conversation.turns.flatMap(turn => turn.items);
const tools = items.filter(item => item.kind === "tool");
const shell = tools.filter(item => item.work?.kind !== "tool"); // Host dynamic tools have work.kind "tool"
const cliText = item => `${item.text ?? ""} ${item.work?.detail ?? ""}`;
// Invocations inside the command text (item.text; work.detail is the output): the Host's absolute
// shim through the env variable, or a bare `litzio <subcommand> ` on PATH. A search pattern
// such as 'litzio check' (no following space) is not counted. Each call is "<command> <action|flag>"
// so help (`--help`) and Host calls (`plugins list`, `operation invoke`) can be told apart.
// PowerShell quoting may put "' between & and the variable.
const INVOKE = /(?:&\s*["']*\$env:LITZIO_ASSISTANT_CLI\s+(-{0,2}[a-z][a-z-]*)(?=[\s'"]|$)|(?:"%LITZIO_ASSISTANT_CLI%"|"\$LITZIO_ASSISTANT_CLI"|(?:^|[;&|(]\s*)litzio(?:\.cmd)?)\s+(-{0,2}[a-z][a-z-]*)(?=\s|$))(?:\s+([^\s;'"]+))?/gi;
const cli = shell.flatMap(item => [...(item.text ?? "").matchAll(INVOKE)]
  .map(([, envCommand, bareCommand, next]) => [envCommand ?? bareCommand, next])
  .map(([command, next]) => next?.startsWith("-") || !next || command.startsWith("-") ? `${command} ${next ?? ""}`.trim()
    : ["plugins", "operation", "templates", "assistant", "daemon"].includes(command) ? `${command} ${next}` : command));
const summary = {
  permissionMode, message, seconds: Math.round((Date.now() - started) / 1000), status: conversation.turns.at(-1).status,
  toolItems: tools.length, shellCommands: shell.length, cliCalls: cli.length, cli,
  hostTools: tools.filter(item => item.work?.kind === "tool").map(item => item.text),
  shell: shell.map(item => `${item.work?.kind}: ${cliText(item).replace(/\s+/g, " ").slice(0, 160)}`),
  answer: items.filter(item => item.kind === "assistant").at(-1)?.text?.slice(0, 400),
};
writeFileSync(out, JSON.stringify({ summary, conversation }, null, 2));
console.log(JSON.stringify(summary, null, 2));
