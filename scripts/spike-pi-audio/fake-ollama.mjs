// Spike-only fake Ollama: records every request body and answers with a small script.
// Usage: node fake-ollama.mjs <port> <log.jsonl>
// Scenario keywords in the latest user text:
//   "QCARD"  -> call request_litzio_user_input (via tool_search first when the tool is deferred)
//   "READDOC" -> call the Host read_document tool the same way
//   "SLOW"   -> stream slowly for 60 s (cancellation check)
//   "WRITEFILE <path>" -> call pi's write tool on <path> (approval check)
// Otherwise it answers with a short text.
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";

const port = Number(process.argv[2] ?? 11500), log = process.argv[3] ?? "fake-ollama.jsonl";
const MODELS = ["fake-audio:latest"];
const record = entry => appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");

const text = content => typeof content === "string" ? content : Array.isArray(content) ? content.map(part => part.text ?? part.input_text ?? "").join("") : "";
function decide(body) {
  // Chat Completions shape (pi) and Responses shape (Copilot CLI) are both reduced to messages + tools.
  const messages = body.messages ?? (body.input ?? []).map(item => ({ role: item.role ?? item.type, content: item.content ?? item.output ?? "" }));
  const tools = (body.tools ?? []).map(tool => tool.function?.name ?? tool.name);
  const users = messages.filter(m => m.role === "user");
  const lastUser = text(users.at(-1)?.content ?? "");
  const last = messages.at(-1);
  const afterTool = last && (last.role === "tool" || last.role === "function_call_output");
  const toolResults = messages.filter(m => m.role === "tool").length;
  const docPath = (() => { try { return JSON.parse(lastUser.slice(lastUser.indexOf("{", lastUser.indexOf("(JSON):")))).document.path; } catch { return "C:/missing.md"; } })();
  const want = /QCARD/.test(lastUser) ? "request_litzio_user_input" : /READDOC/.test(lastUser) ? "read_document" : undefined;
  if (want) {
    const direct = tools.find(name => name === want || name.endsWith(`_${want}`) || name.endsWith(`-${want}`));
    if (toolResults === 0) {
      if (direct) return { call: direct, args: want === "request_litzio_user_input" ? { questions: [{ title: "Which color?", options: ["Red", "Blue"] }] } : { path: docPath } };
      if (tools.includes("tool_search")) return { call: "tool_search", args: { query: want } };
    }
    if (toolResults === 1 && afterTool && direct && !messages.some(m => (m.tool_calls ?? []).some(c => c.function?.name === direct)))
      return { call: direct, args: want === "request_litzio_user_input" ? { questions: [{ title: "Which color?", options: ["Red", "Blue"] }] } : { path: docPath } };
    if (afterTool) return { say: "Tool finished." };
  }
  const write = /WRITEFILE (\S+)/.exec(lastUser);
  if (write && !afterTool) return { call: tools.includes("write") ? "write" : "create", args: { path: write[1], content: "spike\n" } };
  const bash = /BASH (.+)/.exec(lastUser);
  if (bash && !afterTool) return { call: tools.includes("powershell") ? "powershell" : "bash", args: { command: bash[1] } };
  if (/SLOW/.test(lastUser) && !afterTool) return { say: "slow ".repeat(120), slow: true };
  return { say: afterTool ? "Done." : "안녕하세요." };
}

function sse(res) { res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }); }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function chatCompletions(body, res) {
  const plan = decide(body), id = `chatcmpl-${Date.now()}`, model = body.model;
  const chunk = (delta, finish = null, extra = {}) => res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: 0, model, choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`);
  if (!body.stream) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ id, object: "chat.completion", model, choices: [{ index: 0, message: { role: "assistant", content: plan.say ?? "" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
    return;
  }
  sse(res);
  chunk({ role: "assistant", content: "" });
  if (plan.call) {
    chunk({ tool_calls: [{ index: 0, id: `call_${Date.now()}`, type: "function", function: { name: plan.call, arguments: JSON.stringify(plan.args) } }] });
    chunk({}, "tool_calls");
  } else {
    for (const word of plan.say.split(/(?<= )/)) {
      if (res.destroyed) return;
      chunk({ content: word });
      if (plan.slow) await sleep(500);
    }
    chunk({}, "stop");
  }
  res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: 0, model, choices: [], usage: { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 } })}\n\n`);
  res.end("data: [DONE]\n\n");
}

async function responses(body, res) {
  const plan = decide(body), id = `resp_${Date.now()}`;
  sse(res);
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  const base = { id, object: "response", model: body.model, status: "in_progress", output: [] };
  send("response.created", { response: base });
  let item;
  if (plan.call) {
    item = { type: "function_call", id: "fc_1", call_id: `call_${Date.now()}`, name: plan.call, arguments: JSON.stringify(plan.args), status: "completed" };
    send("response.output_item.added", { output_index: 0, item: { ...item, arguments: "" } });
    send("response.function_call_arguments.done", { output_index: 0, item_id: "fc_1", arguments: item.arguments });
  } else {
    item = { type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text: plan.say, annotations: [] }] };
    send("response.output_item.added", { output_index: 0, item: { ...item, content: [] } });
    send("response.content_part.added", { output_index: 0, item_id: "msg_1", content_index: 0, part: { type: "output_text", text: "", annotations: [] } });
    send("response.output_text.delta", { output_index: 0, item_id: "msg_1", content_index: 0, delta: plan.say });
    send("response.output_text.done", { output_index: 0, item_id: "msg_1", content_index: 0, text: plan.say });
  }
  send("response.output_item.done", { output_index: 0, item });
  send("response.completed", { response: { ...base, status: "completed", output: [item], usage: { input_tokens: 100, output_tokens: 5, total_tokens: 105 } } });
  res.end();
}

createServer(async (req, res) => {
  const chunks = [];
  for await (const part of req) chunks.push(part);
  const raw = Buffer.concat(chunks).toString("utf8");
  let body; try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
  record({ method: req.method, path: req.url, body });
  try {
    if (req.url === "/api/tags") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ models: MODELS.map(name => ({ name, model: name })) })); return; }
    if (req.url === "/api/show") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ capabilities: ["completion", "tools", "vision", "audio"], model_info: { "general.context_length": 65536 } })); return; }
    if (req.url === "/v1/models") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ object: "list", data: MODELS.map(id => ({ id, object: "model" })) })); return; }
    if (req.url === "/v1/chat/completions") return await chatCompletions(body, res);
    if (req.url === "/v1/responses") return await responses(body, res);
    res.statusCode = 404; res.end("not found");
  } catch (error) { record({ error: String(error?.stack ?? error) }); if (!res.headersSent) res.statusCode = 500; res.end(); }
}).listen(port, "127.0.0.1", () => console.log(`fake ollama on ${port} pid ${process.pid}`));
