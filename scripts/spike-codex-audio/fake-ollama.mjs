// Responses SSE framing adapted from the pi audio spike's fake Ollama.
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

function responses(body, res, plan) {
  const id = `resp_${randomUUID()}`;
  sse(res);
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  const base = { id, object: "response", model: body.model, status: "in_progress", output: [] };
  send("response.created", { response: base });
  let item;
  if (plan.call) {
    item = { type: "function_call", id: "fc_1", call_id: `call_${randomUUID()}`, name: plan.call, arguments: JSON.stringify(plan.args), status: "completed" };
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

function sse(res) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
}

function decide(body, document, newDocument) {
  const input = body.input ?? [];
  const userText = input.filter(item => item.role === "user")
    .flatMap(item => item.content ?? []).map(part => part.text ?? "").join("\n");
  if (!input.some(item => item.type === "function_call_output" || item.type === "custom_tool_call_output")) {
    if (userText.includes("QCARD")) {
      return { call: "request_litzio_user_input", args: { questions: [{ title: "Which color?", options: ["Red", "Blue"] }] } };
    }
    if (userText.includes("READDOC")) return { call: "read_document", args: { path: document } };
    if (userText.includes("WRITEDOC")) {
      return { call: "create_document", args: {
        path: newDocument, title: "Spike test", blocks: [{ type: "paragraph", text: "Synthetic write fixture." }],
      } };
    }
    if (userText.includes("APPROVAL_PROBE")) {
      return { call: "exec_command", args: {
        cmd: "Set-Content -LiteralPath approval-probe.txt -Value 'Synthetic fixture'",
        sandbox_permissions: "require_escalated", justification: "May I create the synthetic approval fixture?",
      } };
    }
  }
  return { say: "안녕하세요." };
}

export async function startFake(logPath, document, newDocument, wav) {
  const entries = [];
  const record = entry => {
    entries.push(entry);
    appendFileSync(logPath, JSON.stringify(entry) + "\n");
  };
  const server = createServer(async (req, res) => {
    try {
      const parts = [];
      for await (const chunk of req) parts.push(chunk);
      const raw = Buffer.concat(parts).toString("utf8");
      const body = raw && req.url?.startsWith("/") ? JSON.parse(raw) : undefined;
      record({ method: req.method, host: req.headers.host, path: req.url, rawChars: [...raw].length, body });
      if (req.method === "GET" && req.url === "/sample.wav") {
        res.writeHead(200, { "Content-Type": "audio/wav" });
        return res.end(wav);
      }
      if (req.method === "POST" && (req.url === "/v1/responses" || req.url === "/api/responses")) {
        return responses(body, res, decide(body, document, newDocument));
      }
      res.writeHead(404).end();
    } catch (error) {
      record({ error: String(error) });
      res.end();
    }
  });
  // HTTP(S) proxy for any non-fake URL. Record attempts and deny them without forwarding.
  server.on("connect", (req, socket) => {
    record({ method: "CONNECT", path: req.url });
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    entries,
    origin: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    },
  };
}
