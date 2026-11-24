// Spike recording proxy in front of the real Ollama. Every request and response chunk is passed through as it
// arrives (no buffering on the client side); a copy of the response is parsed after it ends for usage numbers.
// Usage: node ollama-proxy.mjs <port> <log.jsonl> [upstream=http://127.0.0.1:11434] [bodies-dir]
// One JSON line per model request: engine-neutral counts (messages, tools, audio parts and bytes, thinking fields),
// the usage the model reported (input/output tokens), reasoning characters seen in the stream, tool calls the model
// made and the elapsed time. With bodies-dir, each model request body is also written to <dir>/<n>.json.
import { createServer, request as httpRequest } from "node:http";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const port = Number(process.argv[2] ?? 11600), log = process.argv[3] ?? "proxy.jsonl";
const upstream = new URL(process.argv[4] ?? "http://127.0.0.1:11434"), bodies = process.argv[5];
if (bodies) mkdirSync(bodies, { recursive: true });
let n = 0;
const MODEL_PATHS = new Set(["/v1/chat/completions", "/v1/responses", "/api/chat"]);

function describeRequest(body) {
  const messages = body.messages ?? body.input ?? [];
  let audioParts = 0, audioBytes = 0, imageParts = 0;
  const visit = value => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    if (value.type === "input_audio" && value.input_audio?.data) { audioParts++; audioBytes += Buffer.from(value.input_audio.data, "base64").length; }
    if (value.type === "image_url" || value.type === "input_image") imageParts++;
    Object.values(value).forEach(visit);
  };
  visit(messages);
  const tools = (body.tools ?? []).map(tool => tool.function?.name ?? tool.name);
  return {
    model: body.model, messages: Array.isArray(messages) ? messages.length : 0, tools: tools.length, toolNames: tools,
    audioParts, audioBytes, imageParts,
    thinkingFields: Object.fromEntries(["reasoning", "reasoning_effort", "think", "include"].filter(k => k in body).map(k => [k, body[k]])),
    bodyChars: JSON.stringify(body).length,
  };
}

function parseResponse(pathname, text) {
  const out = { inputTokens: undefined, outputTokens: undefined, reasoningChars: 0, textChars: 0, toolCalls: [], finish: undefined };
  const events = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try { events.push(JSON.parse(data)); } catch { /* partial line */ }
  }
  if (!events.length) { try { events.push(JSON.parse(text)); } catch { /* not JSON */ } }
  const calls = new Map();
  for (const e of events) {
    if (pathname === "/v1/responses") {
      if (e.type === "response.reasoning_text.delta" || e.type === "response.reasoning_summary_text.delta") out.reasoningChars += (e.delta ?? "").length;
      if (e.type === "response.output_text.delta") out.textChars += (e.delta ?? "").length;
      if (e.type === "response.output_item.done" && e.item?.type === "function_call") out.toolCalls.push({ name: e.item.name, args: String(e.item.arguments ?? "").slice(0, 400) });
      if (e.type === "response.output_item.done" && e.item?.type === "reasoning" && !out.reasoningChars)
        out.reasoningChars += JSON.stringify(e.item.content ?? e.item.summary ?? "").length;
      if (e.type === "response.completed" || e.type === "response.incomplete" || e.type === "response.failed") {
        out.inputTokens = e.response?.usage?.input_tokens; out.outputTokens = e.response?.usage?.output_tokens; out.finish = e.response?.status;
        out.error = e.response?.error ?? undefined;
      }
    } else if (pathname === "/v1/chat/completions") {
      for (const choice of e.choices ?? []) {
        const d = choice.delta ?? choice.message ?? {};
        out.reasoningChars += (d.reasoning ?? d.reasoning_content ?? "").length;
        out.textChars += (typeof d.content === "string" ? d.content : "").length;
        for (const c of d.tool_calls ?? []) {
          const entry = calls.get(c.index ?? c.id) ?? { name: "", args: "" };
          if (c.function?.name) entry.name += c.function.name;
          if (c.function?.arguments) entry.args += c.function.arguments;
          calls.set(c.index ?? c.id, entry);
        }
        if (choice.finish_reason) out.finish = choice.finish_reason;
      }
      if (e.usage) { out.inputTokens = e.usage.prompt_tokens; out.outputTokens = e.usage.completion_tokens; }
      if (e.error) out.error = e.error;
    } else {
      out.reasoningChars += (e.message?.thinking ?? "").length;
      out.textChars += (e.message?.content ?? "").length;
      if (e.done) { out.inputTokens = e.prompt_eval_count; out.outputTokens = e.eval_count; out.finish = e.done_reason; }
    }
  }
  for (const c of calls.values()) out.toolCalls.push({ name: c.name, args: c.args.slice(0, 400) });
  return out;
}

createServer((req, res) => {
  const chunks = [], started = Date.now();
  req.on("data", chunk => chunks.push(chunk));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const pathname = new URL(req.url, "http://x").pathname;
    const isModel = MODEL_PATHS.has(pathname) && req.method === "POST";
    const id = isModel ? ++n : undefined;
    let body;
    if (isModel) { try { body = JSON.parse(raw.toString("utf8")); } catch { body = undefined; } }
    if (isModel && bodies && body) writeFileSync(path.join(bodies, `${id}.json`), raw);
    const headers = { ...req.headers, host: upstream.host };
    const upstreamReq = httpRequest({ hostname: upstream.hostname, port: upstream.port, path: req.url, method: req.method, headers }, upstreamRes => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      const copy = [];
      upstreamRes.on("data", chunk => { if (isModel) copy.push(chunk); res.write(chunk); });
      upstreamRes.on("end", () => {
        res.end();
        if (!isModel) return;
        const entry = { n: id, at: new Date(started).toISOString(), path: pathname, status: upstreamRes.statusCode, ms: Date.now() - started,
          ...(body ? describeRequest(body) : { unparsedBody: raw.length }), ...parseResponse(pathname, Buffer.concat(copy).toString("utf8")) };
        appendFileSync(log, JSON.stringify(entry) + "\n");
      });
      upstreamRes.on("error", error => appendFileSync(log, JSON.stringify({ n: id, path: pathname, upstreamError: String(error) }) + "\n"));
    });
    upstreamReq.on("error", error => { appendFileSync(log, JSON.stringify({ n: id, path: pathname, proxyError: String(error) }) + "\n"); if (!res.headersSent) res.writeHead(502); res.end(); });
    // Client gave up (cancel/timeout): stop the upstream request too, as a direct connection would.
    res.on("close", () => { if (!res.writableFinished) upstreamReq.destroy(); });
    upstreamReq.end(raw);
  });
}).listen(port, "127.0.0.1", () => console.log(`ollama proxy on ${port} -> ${upstream.href} pid ${process.pid}`));
