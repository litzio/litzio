// Spike: replays the first model request a fake Ollama recorded against the real Ollama to read its input token count.
// Usage: node replay-tokens.mjs <fake.jsonl> <model>
import { readFileSync } from "node:fs";
const [log, model] = process.argv.slice(2);
const entry = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).find(e => e.path === "/v1/responses" || e.path === "/v1/chat/completions");
const body = { ...entry.body, model, stream: false };
delete body.stream_options;
if (entry.path === "/v1/responses") body.max_output_tokens = 32; else body.max_completion_tokens = 32;
const started = Date.now();
const response = await fetch(`http://127.0.0.1:11434${entry.path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(600_000) });
const json = await response.json();
console.log(JSON.stringify({ path: entry.path, model, status: response.status, seconds: (Date.now() - started) / 1000, usage: json.usage, error: json.error }));
