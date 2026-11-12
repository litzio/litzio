import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
const log = process.argv[2];
if (log) appendFileSync(log, JSON.stringify({ pid: process.pid, args: process.argv.slice(3) }) + "\n");
const modes = { currentModeId: "agent", availableModes: ["agent", "plan", "autopilot", "allow-all"].map(id => ({ id, name: id === "agent" ? "Agent" : id === "plan" ? "Plan" : id })) };
const configOptions = [{ id: "allow_all", name: "Allow All", type: "select", currentValue: "off", options: ["on", "off"].map(value => ({ value, name: value })) },
  ...(process.argv.includes("--fixture-config") ? [{ id: "model", category: "model", name: "Model", type: "select", currentValue: "copilot-model", options: ["auto", "copilot-model", "max-only"].map(value => ({ value, name: value })) }, { id: "reasoning", category: "thought_level", name: "Thought level", type: "select", currentValue: "low", options: ["low", "high"].map(value => ({ value, name: value })) }] : [])];
const sessionState = () => ({ models: { currentModelId: "copilot-model", availableModels: [{ modelId: "copilot-model", name: "Copilot fixture model" }, ...(process.argv.includes("--fixture-config") ? [{ modelId: "max-only", name: "Max only" }] : [])] }, modes, configOptions });
const send = message => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
let session = 0, pending;
const prompts = new Map();
const selectedModels = new Map();
const loaded = new Set();
const optionsFor = id => selectedModels.get(id) === "auto" ? configOptions.filter(option => option.id !== "reasoning") : configOptions;
createInterface({ input: process.stdin }).on("line", line => {
  const request = JSON.parse(line); if (log) appendFileSync(log, line + "\n");
  if (!request.method) {
    if (request.id === "question-unsupported" && pending) {
      send({ method: "session/update", params: { sessionId: pending.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: request.error ? "Interactive question unsupported" : "Unexpected question acceptance" } } } });
      send({ id: pending.id, result: { stopReason: "end_turn" } }); pending = undefined;
    }
    if (request.id === "permission" && pending) send({ method: "session/update", params: { sessionId: pending.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `Permission result: ${JSON.stringify(request.result)}` } } } });
    return;
  }
  const { id, method, params } = request;
  const reply = result => send({ id, result });
  if (method === "initialize") reply({ protocolVersion: 1, agentCapabilities: { loadSession: true }, agentInfo: { name: "fake-copilot", version: "1" } });
  else if (method === "session/new") {
    if (process.argv.includes("--fixture-session-error")) { send({ id, error: { code: -32000, message: "Copilot session fixture failure", data: { token: "must-not-be-displayed" } } }); return; }
    const sessionId = `copilot-${process.pid}-${++session}`;
    loaded.add(sessionId);
    reply({ sessionId, ...sessionState() });
  }
  else if (method === "session/load") {
    if (loaded.has(params.sessionId)) { send({ id, error: { code: -32603, message: `Session ${params.sessionId} is already loaded` } }); return; }
    loaded.add(params.sessionId); reply(sessionState());
  }
  else if (method === "session/set_mode") { modes.currentModeId = params.modeId; send({ method: "session/update", params: { sessionId: params.sessionId, update: { sessionUpdate: "current_mode_update", currentModeId: params.modeId } } }); reply({}); }
  else if (method === "session/set_config_option") {
    if (params.configId === "model") {
      selectedModels.set(params.sessionId, params.value);
      const reasoning = configOptions.find(option => option.id === "reasoning");
      reasoning.options = (params.value === "max-only" ? ["max"] : ["low", "max"]).map(value => ({ value, name: value }));
      if (params.value === "max-only") reasoning.currentValue = "max";
    }
    if (process.argv.includes("--fixture-config") && params.configId === "reasoning" && selectedModels.get(params.sessionId) === "auto") { send({ id, error: { code: -32602, message: "This model does not support reasoning_effort configuration." } }); return; }
    configOptions.find(option => option.id === params.configId).currentValue = params.value;
    // Model config returns authoritative state even without a notification.
    if (params.configId !== "model") send({ method: "session/update", params: { sessionId: params.sessionId, update: { sessionUpdate: "config_option_update", configOptions: optionsFor(params.sessionId) } } });
    reply({ configOptions: optionsFor(params.sessionId) });
  }
  else if (method === "session/set_model") {
    selectedModels.set(params.sessionId, params.modelId);
    if (process.argv.includes("--fixture-config")) {
      const reasoning = configOptions.find(option => option.id === "reasoning");
      reasoning.options = ["low", "max"].map(value => ({ value, name: value }));
      send({ method: "session/update", params: { sessionId: params.sessionId, update: { sessionUpdate: "config_option_update", configOptions: params.modelId === "auto" ? configOptions.filter(option => option.id !== "reasoning") : configOptions } } });
    }
    reply({});
  }
  else if (method === "session/prompt") {
    if (params.prompt[0].text.includes("FAIL THIS TURN")) { send({ id, error: { code: -32000, message: "Copilot quota fixture failure" } }); return; }
    if (params.prompt[0].text.includes("COMPLETE THIS TURN")) { reply({ stopReason: "end_turn" }); return; }
    pending = { id, sessionId: params.sessionId }; prompts.set(params.sessionId, pending);
    if (process.argv.includes("--fixture-question")) {
      send({ id: "question-unsupported", method: "session/request_user_input", params: { sessionId: params.sessionId, questions: [{ title: "Travel style?", options: ["Rest", "Food"] }] } }); return;
    }
    send({ method: "session/update", params: { sessionId: params.sessionId, update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Checking ACP context." } } } });
    send({ method: "session/update", params: { sessionId: params.sessionId, update: { sessionUpdate: "tool_call", toolCallId: "shell-step", title: "echo fixture", kind: "execute", status: "in_progress" } } });
    send({ method: "session/update", params: { sessionId: params.sessionId, update: { sessionUpdate: "tool_call_update", toolCallId: "shell-step", status: "failed", content: [{ type: "content", content: { type: "text", text: "fixture failure" } }] } } });
    send({ method: "session/update", params: { sessionId: params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "한글 ACP answer" } } } });
    send({ id: "permission", method: "session/request_permission", params: { sessionId: params.sessionId, toolCall: { toolCallId: "edit", kind: "edit", title: "Write file", locations: [{ path: params.prompt[0].text.match(/"folders":\["([^"]+)"/)?.[1]?.replaceAll("\\\\", "\\") + "/new.txt" }] }, options: [{ optionId: "once", kind: "allow_once", name: "Allow once" }, { optionId: "session", kind: "allow_always", name: "Allow for this session" }, { optionId: "no", kind: "reject_once", name: "Reject once" }] } });
  } else if (method === "session/cancel") {
    const prompt = prompts.get(params.sessionId);
    if (prompt) { send({ id: prompt.id, result: { stopReason: "cancelled" } }); prompts.delete(params.sessionId); }
  } else send({ id, error: { code: -32601, message: `Unsupported fixture method: ${method}` } });
});
