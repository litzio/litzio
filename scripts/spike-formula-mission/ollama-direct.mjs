// Adapted from the pi audio spike's direct native Ollama probe.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { normalizeLatex, reportedLatex } from "./latex.mjs";

const [fixture, output] = process.argv.slice(2);
const cases = JSON.parse(readFileSync(path.join(fixture, "formulas.json"), "utf8"));
const base = "http://127.0.0.1:11434";
const runs = [];
for (const entry of cases) {
  const data = readFileSync(path.join(fixture, entry.image)).toString("base64");
  for (let repeat = 1; repeat <= 3; repeat++) {
    const started = Date.now();
    const body = { model: "gemma4:e4b", stream: false,
      messages: [{ role: "user", content: "이 수식을 LaTeX로 써라.", images: [data] }] };
    let result;
    try {
      const response = await fetch(base + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(600_000) });
      const json = await response.json();
      const text = json.message?.content;
      result = { status: response.status, requests: 1, inputTokens: json.prompt_eval_count, outputTokens: json.eval_count, text, error: json.error,
        exactIgnoringWhitespace: typeof text === "string" && reportedLatex(text).some(latex => normalizeLatex(latex) === normalizeLatex(entry.latex)) };
    } catch (error) {
      result = { requests: 1, error: String(error) };
    }
    const run = { id: entry.id, repeat, seconds: (Date.now() - started) / 1000, ...result };
    console.log(JSON.stringify(run));
    runs.push(run);
    writeFileSync(output, JSON.stringify(runs, null, 2));
  }
}
