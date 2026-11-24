// Spike experiment 2: prints one run's tool calls and tool results (pi session JSONL or Copilot CLI events.jsonl),
// for classifying failures by hand. Usage: node transcript.mjs <run-root> [max-chars=300]
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const [root, maxArg] = process.argv.slice(2), max = Number(maxArg ?? 300);
const clip = s => String(s ?? "").replace(/\x1b\[[0-9;]*m/g, "").replace(/\s+/g, " ").slice(0, max);
const find = (dir, test) => !existsSync(dir) ? [] : readdirSync(dir, { recursive: true }).map(f => path.join(dir, String(f))).filter(test);
const lines = file => readFileSync(file, "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return {}; } });
for (const file of find(path.join(root, "pi", "sessions"), f => f.endsWith(".jsonl"))) {
  for (const e of lines(file)) {
    const m = e.message; if (!m) continue;
    if (m.role === "user") console.log("USER", clip((m.content ?? []).map(c => c.text ?? "").join("").split("\n").at(-1)));
    if (m.role === "assistant") for (const c of m.content ?? []) {
      if (c.type === "toolCall") console.log("  CALL", c.name, clip(JSON.stringify(c.arguments)));
      if (c.type === "text" && c.text.trim()) console.log("  SAY", clip(c.text));
    }
    if (m.role === "toolResult") console.log("  ->", m.isError ? "ERR" : "ok", clip((m.content ?? []).map(c => c.text ?? "").join("")));
  }
}
for (const file of find(path.join(root, "copilot-home", ".copilot", "session-state"), f => f.endsWith("events.jsonl"))) {
  for (const e of lines(file)) {
    const d = e.data ?? {};
    if (e.type === "user.message") console.log("USER", clip(String(d.content ?? "").split("\n").at(-1)));
    if (e.type === "assistant.message") { for (const t of d.toolRequests ?? []) console.log("  CALL", t.name, clip(JSON.stringify(t.arguments))); if (String(d.content ?? "").trim()) console.log("  SAY", clip(d.content)); }
    if (e.type === "tool.execution_complete") console.log("  ->", d.success === false ? "ERR" : "ok", clip(JSON.stringify(d.result?.content ?? d.result ?? d.error)));
  }
}
