import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PluginHost } from "../server/plugins/plugin-host.ts";
import { executePluginTool } from "../server/assistant-plugin-tools.ts";
test("local artifact trust, activation, admission, drain, settings persistence and per-call assistant approval", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugins-"));
  const directory = path.join(root, "artifact"); mkdirSync(directory);
  const manifest = { schemaVersion: 1, id: "litzio.onedrive", tier: "official", publisher: { id: "litzio", name: "Litzio" }, name: "Fixture", version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: { operations: [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "string" } }] }, settingsSchema: { type: "object", properties: { label: { type: "string" } }, additionalProperties: false } };
  writeFileSync(path.join(directory, "litzio-plugin.json"), JSON.stringify(manifest));
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
  writeFileSync(path.join(directory, "host.js"), `export function activate(){return {operations:{read:async()=>{await new Promise(r=>setTimeout(r,50));return "done"}},status:()=>({available:true,message:"Fixture",folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
  const host = new PluginHost(path.join(root, "state.json"));
  try {
    await host.invoke("register", { directory });
    const collision = path.join(root, "collision"); mkdirSync(collision);
    writeFileSync(path.join(collision, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
    writeFileSync(path.join(collision, "host.js"), "throw new Error('Must not import conflicting plugin')");
    writeFileSync(path.join(collision, "litzio-plugin.json"), JSON.stringify({ ...manifest, id: "litzio", contributes: { operations: [{ ...manifest.contributes.operations[0], id: "onedrive.read" }] } }));
    await assert.rejects(host.invoke("register", { directory: collision }), /collision/);
    const registered = (await host.list())[0]!;
    assert.equal(registered.running, false); assert.equal(registered.official, false);
    await assert.rejects(host.invoke("enable", { id: manifest.id }), /trust/);
    await host.invoke("trust", { id: manifest.id, digest: registered.digest });
    await host.invoke("enable", { id: manifest.id });
    const admitted = host.invokeOperation("litzio.onedrive.read", {});
    const disabling = host.invoke("disable", { id: manifest.id });
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(host.invokeOperation("litzio.onedrive.read", {}), /disabled/);
    await disabling; assert.equal((await admitted).result, "done");
    await host.invoke("settings", { id: manifest.id, settings: { label: "saved" } });
    assert.deepEqual((await host.list())[0]?.settings, { label: "saved" });
    let calls = 0;
    for (let i = 0; i < 2; i++) await assert.rejects(executePluginTool(host, { action: "enable", id: manifest.id }, async () => { calls++; return false; }), /not approved/);
    assert.equal(calls, 2); assert.equal((await host.list())[0]?.running, false);
    await executePluginTool(host, { action: "enable", id: manifest.id }, async () => true);
    assert.equal((await host.list())[0]?.running, true);
    await host.invoke("disable", { id: manifest.id });
    writeFileSync(path.join(directory, "extra.js"), "changed");
    await assert.rejects(host.invoke("enable", { id: manifest.id }), /changed/);
    assert.equal(new PluginHost(path.join(root, "state.json")) instanceof PluginHost, true);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});
import { fileURLToPath } from "node:url";
import { ProviderConnections } from "../server/provider-connections.ts";
import { AssistantConversations } from "../server/assistant-conversations.ts";
import { RootAccess } from "../server/file-access.ts";
test("Codex management adapter requires fresh confirmation even with full access and cancels pending approval", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-consent-"));
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url))] }, undefined, { packaged: false, checkoutRoot: root });
  const host = new PluginHost(path.join(root, "plugins.json"));
  const conversations = new AssistantConversations(connection, new RootAccess([root]), host);
  try {
    const settings = { provider: "codex" as const, permissionMode: "full-access" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
    const conversation = await conversations.send({ message: "Inspect plugins", folders: [root], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings, "window-a");
    const handler = connection.client.toolCall!;
    let arrive: (() => void) | undefined;
    connection.client.toolCall = params => { const result = handler(params); arrive?.(); return result; };
    for (const approve of [true, false]) {
      const received = new Promise<void>(resolve => { arrive = resolve; });
      const response = connection.client.request("fixture/tool", { threadId: conversation.id, tool: "manage_plugins", arguments: { action: "list" } });
      await received;
      const pending = conversations.current(conversation.id).userInput!;
      assert.match(pending.questions[0]!.question, /plugins.list/);
      conversations.answer(conversation.id, pending.turnId, pending.requestId, { "plugin-confirm": { answers: [approve ? "Approve once" : "Reject"] } });
      const result = await response as any;
      assert.equal(result.result?.success ?? false, approve);
    }
    const received = new Promise<void>(resolve => { arrive = resolve; });
    const response = connection.client.request("fixture/tool", { threadId: conversation.id, tool: "manage_plugins", arguments: { action: "list" } });
    await received; await conversations.interrupt(conversation.id); await response;
    assert.equal(conversations.current(conversation.id).userInput, undefined);
  } finally { await connection.close(); await host.close(); rmSync(root, { recursive: true, force: true }); }
});
