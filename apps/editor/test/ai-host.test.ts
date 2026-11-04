import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { createAiHost } from "../server/ai-host.ts";
import { AiAgentConnection } from "../server/ai-agent-connection.ts";
import { handleDocumentRequest } from "../server/document-api.ts";
import { listenForFetch } from "../../../test/helpers/fetch-server.ts";
import { runCliAsync } from "../../../packages/cli/src/cli.ts";

test("official settings HTTP and CLI share validation and the stored snapshot without registration", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-ai-host-"));
  const file = path.join(root, "ai.json");
  const agent = new AiAgentConnection(path.join(root, "assistant"), { bin: process.execPath,
    args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url))] });
  const host = createAiHost(null, file, { agent });
  const server = createServer((req, res) => { void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); }, null, Infinity, undefined, undefined, host); });
  await listenForFetch(server);
  const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await host.close(); rmSync(root, { recursive: true, force: true }); });
  const settings = { ...await host.invoke("settings"), model: "gpt-6.1-sol", reasoningEffort: "high" };
  const put = (value: unknown) => fetch(`${url}/api/ai-agent-settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  const saved = await put(settings);
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.deepEqual(await saved.json(), settings);
  const previous = process.env.LITZIO_AI_AGENT_SETTINGS_FILE;
  process.env.LITZIO_AI_AGENT_SETTINGS_FILE = file;
  const output: string[] = [];
  const stdout = t.mock.method(process.stdout, "write", ((value: string) => { output.push(value); return true; }) as typeof process.stdout.write);
  const stderr = t.mock.method(process.stderr, "write", (() => true) as typeof process.stderr.write);
  try {
    assert.equal(await runCliAsync(["ai", "settings"]), 0);
    assert.deepEqual(JSON.parse(output.pop()!), settings);
    assert.equal(await runCliAsync(["ai", "configure", "--file", file]), 0);
    assert.deepEqual(JSON.parse(output.pop()!), settings);
    const before = readFileSync(file, "utf8");
    assert.equal((await put({ ...settings, providers: { codex: false, copilot: false } })).status, 400);
    const missing = await put({ ...settings, model: "missing-model" });
    assert.equal(missing.status, 400); assert.match(await missing.text(), /model.*allowed values.*gpt-6.1-sol/);
    const effort = await put({ ...settings, reasoningEffort: "unsupported" });
    assert.equal(effort.status, 400); assert.match(await effort.text(), /reasoningEffort.*allowed values/);
    assert.equal(readFileSync(file, "utf8"), before);
    assert.equal((await fetch(`${url}/api/worker-plugins`)).status, 404);
    assert.equal((await fetch(`${url}/api/ai-tasks`)).status, 404);
  } finally {
    stdout.mock.restore(); stderr.mock.restore();
    if (previous === undefined) delete process.env.LITZIO_AI_AGENT_SETTINGS_FILE; else process.env.LITZIO_AI_AGENT_SETTINGS_FILE = previous;
  }
});

test("unavailable provider rejects new work with a reason; settings do not close admitted conversations", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-ai-lifetime-"));
  const log = path.join(root, "provider.jsonl");
  const connection = new AiAgentConnection(path.join(root, "assistant"), { bin: process.execPath,
    args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url)), log] });
  const host = createAiHost(null, path.join(root, "ai.json"), { agent: connection });
  t.after(async () => { await host.close(); rmSync(root, { recursive: true, force: true }); });
  const settings = { ...await host.invoke("settings"), model: "gpt-6.1-sol", reasoningEffort: "medium" };
  await host.invoke("configure", settings);
  const conversation = await host.invoke("agentConversation", { action: "send", message: "Question", folders: [root], model: settings.model, reasoningEffort: settings.reasoningEffort });
  const id = conversation.id, turn = conversation.turns[0];
  const pid = JSON.parse(readFileSync(log, "utf8").split("\n")[0]!).pid as number;
  assert.equal(typeof pid, "number");
  t.mock.method(connection, "diagnostics", async (provider?: "codex" | "copilot") => ({ provider: provider ?? "codex", connected: false, path: null, version: null, checkedAt: Date.now(), error: "Fixture provider unavailable" }));
  await host.invoke("configure", { ...settings, writeAccess: "read-only" });
  t.mock.method(connection, "models", async () => ({ provider: "copilot" as const, updatedAt: Date.now(), models: [{ id: "auto", model: "auto", displayName: "Auto", description: "Fixture", defaultReasoningEffort: "medium", supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Fixture" }] }] }));
  await host.invoke("configure", { ...settings, provider: "copilot", model: "auto" });
  assert.doesNotThrow(() => process.kill(pid, 0));
  assert.equal((await host.invoke("agentConversations", { id })).turns[0], turn);
  await assert.rejects(host.invoke("agentConversation", { action: "send", message: "New work", folders: [root], model: settings.model, reasoningEffort: settings.reasoningEffort }), /AI provider copilot is unavailable: Fixture provider unavailable/);
  await host.invoke("agentConversation", { action: "interrupt", id });
  await host.close();
  assert.throws(() => process.kill(pid!, 0), "daemon shutdown waits for its exact provider process");
  await assert.rejects(host.invoke("agentConversations", {}), /closing/);
});
