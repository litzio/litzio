import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
const log = process.argv[2];
const send = message => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
let session = 0, pending;
createInterface({ input: process.stdin }).on("line", line => {
  const request = JSON.parse(line); if (log) appendFileSync(log, line + "\n");
  if (!request.method) return;
  const { id, method, params } = request;
  const reply = result => send({ id, result });
  if (method === "initialize") reply({ protocolVersion: 1, agentCapabilities: { loadSession: true }, agentInfo: { name: "fake-copilot", version: "1" } });
  else if (method === "session/new") reply({ sessionId: `copilot-${++session}`, models: { currentModelId: "copilot-model", availableModels: [{ modelId: "copilot-model", name: "Copilot fixture model" }] } });
  else if (method === "session/set_model") reply({});
  else if (method === "session/prompt") {
    if (params.prompt[0].text.includes("FAIL THIS TURN")) { send({ id, error: { code: -32000, message: "Copilot quota fixture failure" } }); return; }
    pending = { id, sessionId: params.sessionId };
    send({ method: "session/update", params: { sessionId: params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "한글 ACP answer" } } } });
    send({ id: "permission", method: "session/request_permission", params: { sessionId: params.sessionId, toolCall: { toolCallId: "edit", kind: "edit", title: "Write file", locations: [{ path: params.prompt[0].text.match(/"folders":\["([^"]+)"/)?.[1]?.replaceAll("\\\\", "\\") + "/new.txt" }] }, options: [{ optionId: "once", kind: "allow_once", name: "Allow once" }] } });
  } else if (method === "session/cancel") {
    if (pending) { send({ id: pending.id, result: { stopReason: "cancelled" } }); pending = undefined; }
  } else send({ id, error: { code: -32601, message: `Unsupported fixture method: ${method}` } });
});
