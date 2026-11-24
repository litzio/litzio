// Spike ACP client with Litzio's @agentclientprotocol/sdk (0.17.1): launches pi-litzio-acp.mjs like the Host would,
// and runs one scenario. Usage:
//   node acp-client.mjs <scenario> [args...]
//   audio-block <wav>...      prompt with ACP audio blocks (needs the adapter patch)
//   audio-link <wav>...       prompt with resource_link blocks to the files (no patch)
//   hello                     "안녕?" with an empty MCP list
//   cancel                    "SLOW" prompt, cancel after 2 s
//   resume <sessionId>        new process, session/load, then one prompt
// Env: COPILOT_PROVIDER_BASE_URL, COPILOT_MODEL, PI_SPIKE_ROOT, SPIKE_CWD, SPIKE_MCP (JSON mcpServers), SPIKE_PROMPT
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const [scenario, ...args] = process.argv.slice(2);
const cwd = process.env.SPIKE_CWD ?? process.cwd();
const mcpServers = JSON.parse(process.env.SPIKE_MCP ?? "[]");
const started = Date.now();
const log = (...values) => console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s]`, ...values);

const child = spawn(process.execPath, [path.join(here, "pi-litzio-acp.mjs"), "--acp", "--allow-tool=litzio_host", "--reasoning-effort", "medium"],
  { cwd, env: process.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
log("adapter pid", child.pid);
let stderr = ""; child.stderr.on("data", chunk => { stderr += chunk; });
const updates = [], permissions = [];
const text = [];
const connection = new ClientSideConnection(() => ({
  requestPermission: async request => {
    permissions.push(request);
    log("permission", JSON.stringify({ title: request.toolCall.title, kind: request.toolCall.kind, locations: request.toolCall.locations, rawInput: request.toolCall.rawInput, options: request.options.map(o => o.kind) }));
    const allow = request.options.find(option => option.kind === "allow_once");
    return allow ? { outcome: { outcome: "selected", optionId: allow.optionId } } : { outcome: { outcome: "cancelled" } };
  },
  sessionUpdate: async params => {
    updates.push(params.update);
    const u = params.update;
    if (u.sessionUpdate === "agent_message_chunk" && u.content.type === "text") text.push(u.content.text);
    else if (u.sessionUpdate === "tool_call" || u.sessionUpdate === "tool_call_update") log(u.sessionUpdate, JSON.stringify({ id: u.toolCallId, title: u.title, kind: u.kind, status: u.status, locations: u.locations }).slice(0, 400));
  },
}), ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout)));

try {
  const init = await connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {}, clientInfo: { name: "Litzio", version: "0.0.0" } });
  log("initialize", JSON.stringify({ promptCapabilities: init.agentCapabilities?.promptCapabilities, loadSession: init.agentCapabilities?.loadSession, mcp: init.agentCapabilities?.mcpCapabilities }));
  let sessionId;
  if (scenario === "resume") {
    sessionId = args[0];
    const loaded = await connection.loadSession({ sessionId, cwd, mcpServers });
    log("loadSession ok; replayed updates:", updates.length, "kinds:", [...new Set(updates.map(u => u.sessionUpdate))].join(","));
  } else {
    const session = await connection.newSession({ cwd, mcpServers });
    sessionId = session.sessionId;
    log("newSession", sessionId, "modes:", JSON.stringify(session.modes?.availableModes?.map(m => m.id)), "config:", JSON.stringify(session.configOptions?.map(o => o.id)));
  }
  let prompt;
  if (scenario === "audio-block") prompt = [{ type: "text", text: process.env.SPIKE_PROMPT ?? "Transcribe each audio clip." },
    ...args.map(file => ({ type: "audio", data: readFileSync(file).toString("base64"), mimeType: "audio/wav" }))];
  else if (scenario === "audio-link") prompt = [{ type: "text", text: process.env.SPIKE_PROMPT ?? "Transcribe each audio clip." },
    ...args.map(file => ({ type: "resource_link", uri: pathToFileURL(file).href, name: path.basename(file), mimeType: "audio/wav" }))];
  else if (scenario === "cancel") prompt = [{ type: "text", text: "SLOW please" }];
  else prompt = [{ type: "text", text: process.env.SPIKE_PROMPT ?? (scenario === "resume" ? "다시 안녕?" : "안녕?") }];
  const running = connection.prompt({ sessionId, prompt });
  if (scenario === "cancel") { await new Promise(resolve => setTimeout(resolve, 2000)); log("cancel"); await connection.cancel({ sessionId }); }
  const result = await running;
  log("prompt result", JSON.stringify(result));
  log("assistant text:", JSON.stringify(text.join("").slice(0, 600)));
  console.log("SESSION", sessionId);
} catch (error) {
  log("error", error?.message ?? JSON.stringify(error));
  if (stderr) log("stderr", stderr.slice(-2000));
  process.exitCode = 1;
} finally {
  child.stdin.end();
  await new Promise(resolve => { const t = setTimeout(() => { child.kill(); resolve(); }, 5000); child.once("exit", () => { clearTimeout(t); resolve(); }); });
  log("adapter exited", child.exitCode, child.signalCode);
}
