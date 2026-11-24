// Spike: FLEURS samples through Ollama directly and through pi (ACP audio block, patched adapter).
// Usage: node fleurs-batch.mjs <samples.json> <out.jsonl> <model> [routes=v1,native,pi]
// pi route env: PI_SPIKE_ROOT, SPIKE_CWD (as acp-client.mjs). Audio files sit next to samples.json.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [samplesFile, out, model, routesArg] = process.argv.slice(2);
const routes = (routesArg ?? "v1,native,pi").split(",");
const samples = JSON.parse(readFileSync(samplesFile, "utf8"));
const dir = path.dirname(samplesFile);
const TASKS = {
  transcribe: "Transcribe this audio exactly in its original language. Output only the transcription.",
  about: "이 음성은 무엇에 관한 내용인가? 한 문장으로 답하라.",
};
for (const sample of samples) for (const [task, prompt] of Object.entries(TASKS)) for (const route of routes) {
  if (route === "native" && task !== "transcribe") continue;
  const wav = path.join(dir, sample.file);
  let result;
  try {
    if (route === "pi") {
      const started = Date.now();
      const output = execFileSync(process.execPath, [path.join(here, "acp-client.mjs"), "audio-block", wav], { env: { ...process.env, COPILOT_PROVIDER_BASE_URL: "http://127.0.0.1:11434/v1", COPILOT_MODEL: model, SPIKE_PROMPT: prompt }, encoding: "utf8", timeout: 600_000 });
      const text = JSON.parse(/assistant text: (.*)/.exec(output)?.[1] ?? "null");
      const usage = JSON.parse(/prompt result (.*)/.exec(output)?.[1] ?? "{}").usage;
      result = { seconds: (Date.now() - started) / 1000, text, usage, error: /\] error (.*)/.exec(output)?.[1] };
    } else result = JSON.parse(execFileSync(process.execPath, [path.join(here, "ollama-direct.mjs"), route, model, prompt, wav], { encoding: "utf8", timeout: 600_000 }));
  } catch (error) { result = { error: String(error.message).slice(0, 500) }; }
  const row = { id: sample.id, split: sample.split, lang: sample.lang, task, route, ...result };
  appendFileSync(out, JSON.stringify(row) + "\n");
  console.log(sample.lang, sample.id, task, route, result.seconds, JSON.stringify(result.text ?? result.error)?.slice(0, 120));
}
