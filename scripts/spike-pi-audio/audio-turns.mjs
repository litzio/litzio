// Spike experiment 2, task 3: one pi session, three turns — (1) ACP audio block + transcription, (2) a text-only
// follow-up that needs the audio again, (3) an unrelated question. Model requests go through the recording proxy,
// which reports per request the input tokens and whether audio bytes were sent again.
// Usage: node audio-turns.mjs <wav> <out.json>
// Env: COPILOT_PROVIDER_BASE_URL (proxy /v1), COPILOT_MODEL, PI_SPIKE_ROOT, SPIKE_CWD (a Host assistant folder copy),
//      PROXY_LOG, PI_SPIKE_POWERSHELL (as in tasks 1-2).
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const [wav, out] = process.argv.slice(2);
const cwd = process.env.SPIKE_CWD ?? process.cwd();
const proxyLines = () => existsSync(process.env.PROXY_LOG) ? readFileSync(process.env.PROXY_LOG, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)) : [];
const TURNS = [
  "이 음성을 원래 언어 그대로 받아써 줘. 받아쓴 글만 답해.",
  "방금 음성에서 두 번째로 말한 내용이 뭐였지?",
  "음성과 상관없는 질문이야. 대한민국의 수도는 어디야? 한 단어로 답해.",
];
const child = spawn(process.execPath, [path.join(here, "pi-litzio-acp.mjs"), "--acp", "--allow-tool=litzio_host", "--reasoning-effort", "medium"],
  { cwd, env: process.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
let stderr = ""; child.stderr.on("data", chunk => { stderr += chunk; });
let text = [];
const connection = new ClientSideConnection(() => ({
  requestPermission: async request => ({ outcome: { outcome: "selected", optionId: request.options.find(o => o.kind.startsWith("allow"))?.optionId } }),
  sessionUpdate: async params => { const u = params.update; if (u.sessionUpdate === "agent_message_chunk" && u.content.type === "text") text.push(u.content.text); },
}), ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout)));
const result = { wav: path.basename(wav), wavBytes: readFileSync(wav).length, adapterPid: child.pid, turns: [] };
try {
  await connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {}, clientInfo: { name: "Litzio", version: "0.0.0" } });
  const { sessionId } = await connection.newSession({ cwd, mcpServers: [] });
  for (const [i, prompt] of TURNS.entries()) {
    const before = proxyLines().length, started = Date.now();
    text = [];
    const blocks = [{ type: "text", text: prompt }, ...(i === 0 ? [{ type: "audio", data: readFileSync(wav).toString("base64"), mimeType: "audio/wav" }] : [])];
    const response = await connection.prompt({ sessionId, prompt: blocks });
    await new Promise(resolve => setTimeout(resolve, 500));
    const requests = proxyLines().slice(before);
    result.turns.push({ turn: i + 1, prompt, seconds: (Date.now() - started) / 1000, stopReason: response.stopReason, answer: text.join(""),
      modelRequests: requests.length, inputTokens: requests.map(r => r.inputTokens), outputTokens: requests.map(r => r.outputTokens),
      audioParts: requests.map(r => r.audioParts), audioBytes: requests.map(r => r.audioBytes), reasoningChars: requests.map(r => r.reasoningChars),
      toolCalls: requests.flatMap(r => (r.toolCalls ?? []).map(c => c.name)), ms: requests.map(r => r.ms) });
    console.log(JSON.stringify(result.turns.at(-1)).slice(0, 600));
  }
} catch (error) {
  result.error = String(error?.message ?? JSON.stringify(error)); result.stderr = stderr.slice(-1500);
} finally {
  writeFileSync(out, JSON.stringify(result, null, 2));
  child.stdin.end();
  await new Promise(resolve => { const t = setTimeout(() => { child.kill(); resolve(); }, 5000); child.once("exit", () => { clearTimeout(t); resolve(); }); });
}
