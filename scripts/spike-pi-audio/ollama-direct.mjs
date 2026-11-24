// Spike: sends a WAV straight to Ollama, the way pi's request ends up (/v1/chat/completions input_audio)
// or Ollama's native /api/chat (messages[].images). Usage:
//   node ollama-direct.mjs <v1|native> <model> <prompt> <wav>
import { readFileSync } from "node:fs";
const [mode, model, prompt, wav] = process.argv.slice(2);
const data = readFileSync(wav).toString("base64");
const base = process.env.OLLAMA ?? "http://127.0.0.1:11434";
const started = Date.now();
const body = mode === "native"
  ? { model, stream: false, messages: [{ role: "user", content: prompt, images: [data] }] }
  : { model, stream: false, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "input_audio", input_audio: { data, format: "wav" } }] }] };
const response = await fetch(`${base}${mode === "native" ? "/api/chat" : "/v1/chat/completions"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(600_000) });
const json = await response.json();
const text = mode === "native" ? json.message?.content : json.choices?.[0]?.message?.content;
const usage = mode === "native" ? { prompt_tokens: json.prompt_eval_count, completion_tokens: json.eval_count } : json.usage;
console.log(JSON.stringify({ status: response.status, seconds: (Date.now() - started) / 1000, usage, text, error: json.error }));
