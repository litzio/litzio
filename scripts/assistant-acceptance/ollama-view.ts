/** Run with pnpm exec tsx --test scripts/assistant-acceptance/ollama-view.ts and an installed Copilot CLI. */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { listenForFetch } from "../../test/helpers/fetch-server.ts";
import { RootAccess } from "../../apps/editor/server/file-access.ts";
import { ProviderConnections } from "../../apps/editor/server/provider-connections.ts";
import { AssistantConversations } from "../../apps/editor/server/assistant-conversations.ts";

test("Copilot sends the viewed PNG to the Ollama Responses endpoint", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ollama-view-"));
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
  const image = path.join(root, "sample.png");
  writeFileSync(image, Buffer.from(png, "base64"));
  mkdirSync(path.join(root, "assistant", ".git"), { recursive: true });
  const model = "local-vision";
  let toolOutput: unknown;
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/tags") return res.end(JSON.stringify({ models: [{ name: model }] }));
    if (req.url === "/api/show") return res.end(JSON.stringify({ capabilities: ["vision"] }));
    if (req.url !== "/v1/responses") { res.writeHead(404); return res.end(); }
    let body = "";
    for await (const chunk of req) body += chunk;
    const output = JSON.parse(body).input.find((item: { call_id?: string; type: string }) =>
      item.type === "function_call_output" && item.call_id === "call_image");
    if (output) toolOutput = output.output;
    const call = { type: "function_call", id: "fc_image", call_id: "call_image", name: "view", arguments: JSON.stringify({ path: image }) };
    res.setHeader("Content-Type", "text/event-stream");
    const event = (type: string, fields: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`);
    const response = { id: "resp_test", model, output: output ? [] : [call] };
    event("response.created", { response: { ...response, status: "in_progress", output: [] } });
    if (!output) {
      event("response.output_item.added", { output_index: 0, item: { ...call, arguments: "" } });
      event("response.function_call_arguments.delta", { output_index: 0, item_id: call.id, delta: call.arguments });
      event("response.output_item.done", { output_index: 0, item: call });
    }
    event("response.completed", { response: { ...response, status: "completed" } });
    res.end();
  });
  await listenForFetch(server);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const connection = new ProviderConnections(path.join(root, "assistant"), undefined, {
    bin: process.env.LITZIO_TEST_COPILOT_BIN,
    env: () => ({ ...process.env, HOME: root, USERPROFILE: root, COPILOT_HOME: path.join(root, ".copilot") }),
  });
  t.after(async () => {
    await connection.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  });
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  const settings = { provider: "ollama" as const, ollamaUrl: url, model, reasoningEffort: "", permissionMode: "full-access" as const };
  const conversation = await conversations.send({ ...settings, message: "View sample.png", folders: [root] }, settings);
  const deadline = Date.now() + 30000;
  while (conversation.turns.at(-1)?.status === "inProgress" && !toolOutput && Date.now() < deadline) await delay(100);
  assert.ok(Array.isArray(toolOutput) && toolOutput.some(part => part.type === "input_image" && part.image_url === "data:image/png;base64," + png),
    "view tool output must contain the original PNG bytes");
});
