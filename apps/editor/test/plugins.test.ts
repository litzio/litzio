import { PLUGIN_CLI_SOURCE, PLUGIN_CLI_OPERATION, verifyPluginCli } from "../../../test/helpers/external-plugin.ts";
import { availableHostCli, hostCli } from "../server/host-cli.ts";
import {writeCodePluginManifest} from "../../../test/helpers/code-plugin.ts";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { canonicalFilePath } from "../server/file-access.ts";

import { compileSchema, validateManifest } from "@litzio/plugin-sdk";
import { PLUGIN_AUTHORING_SKILL } from "../server/plugins/authoring-skill.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync, readFileSync, rmSync, rmdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { PluginHost } from "../server/plugins/plugin-host.ts";
import { executePluginTool } from "../server/assistant-plugin-tools.ts";


import { PluginAssistantSkills } from "../server/plugins/assistant-skills.ts";

// Host lifecycle and public-operation tests stay in-process.
// HTTP plugin scenarios cover browser registration/settings/secret integration.

test("bundled job lookup example is a valid public operation and distinguishes absent records", () => {
  const operations = JSON.parse(/```json\n([^`]+)```/.exec(PLUGIN_AUTHORING_SKILL)![1]);
  const manifest = validateManifest({ id: "fixture.jobs", name: "Jobs", entry: "host.mjs", screen: "screen.jsx", operations });
  const op = manifest.contributes.operations[0];
  const input = compileSchema(op.inputSchema), output = compileSchema(op.outputSchema);
  assert.equal(input({ id: "job-1" }), true); assert.equal(input({}), false);
  for (const state of ["queued", "running", "succeeded", "failed", "cancelled", "not_found"]) {
    assert.equal(output({ id: "job-1", state, message: state }), true);
  }
  assert.equal(output({ id: "job-1", state: "succeeded", message: "Done", result: { path: "result.json" } }), true);
  assert.equal(output({ id: "job-1", state: "unknown", message: "Unknown" }), false);
});


















test("local artifact trust, activation, admission, drain, settings persistence and assistant activity", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugins-"));
  const directory = path.join(root, "artifact"); mkdirSync(directory);
  const manifest = {id: "fixture.lifecycle",name: "Fixture",entry: "host.js",settingsSchema: { type: "object", properties: { label: { type: "string", minLength: 1 }, nested: { type: "object", properties: { value: { type: "string" } }, required: ["value"] } }, additionalProperties: false },operations: [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "string" } }],screen:"screen.jsx"};
  writeCodePluginManifest(directory,manifest);
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
  writeFileSync(path.join(directory, "host.js"), `export function activate(c){return {operations:{read:async()=>{await new Promise(r=>setTimeout(r,50));return c.settings.label ?? "done"}},status:()=>({available:true,message:"Fixture"}),dispose(){}}}`);
  const host = new PluginHost(path.join(root, "state.json"), {  });
  try {
    await host.invoke("register", { directory });
    await assert.rejects(host.invoke("settings", { id: manifest.id, settings: { label: 42 } }), (error: any) => {
      assert.match(error.message, /Invalid settings/);
      assert.deepEqual(error.settingsIssues, [{ keyword: "type", path: "/label" }]);
      return true;
    });
    for (const [settings, keyword, fieldPath] of [[{ label: "" }, "minLength", "/label"], [{ nested: {} }, "required", "/nested/value"]] as const) {
      await assert.rejects(host.invoke("settings", { id: manifest.id, settings }), (error: any) => {
        assert.deepEqual(error.settingsIssues, [{ keyword, path: fieldPath }]); return true;
      });
    }
    const rejected = await executePluginTool(host, { action: "settings", id: manifest.id, settings: { label: 42 } }, () => {});
    assert.equal(rejected.error, "Plugin management failed; inspect plugin status.");
    const collision = path.join(root, "collision"); mkdirSync(collision);
    writeFileSync(path.join(collision, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
    writeFileSync(path.join(collision, "host.js"), "throw new Error('Must not import conflicting plugin')");
    writeCodePluginManifest(collision,{ ...manifest, id: "fixture", operations: [{ ...manifest.operations[0], id: "lifecycle.read" }] });
    await assert.rejects(host.invoke("register", { directory: collision }), /collision/);
    const registered = (await host.list())[0]!;
    assert.equal(registered.running, false);
    await assert.rejects(host.invoke("enable", { id: manifest.id }), /trust/);
    await host.invoke("trust", { id: manifest.id, registrationId: registered.registrationId });
    await host.invoke("enable", { id: manifest.id });
    const admitted = host.invokeOperation("fixture.lifecycle.read", {});
    const disabling = host.invoke("disable", { id: manifest.id });
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(host.invokeOperation("fixture.lifecycle.read", {}), /disabled/);
    await disabling; assert.equal((await admitted).result, "done");
    await host.invoke("settings", { id: manifest.id, settings: { label: "saved" } });
    assert.deepEqual((await host.list())[0]?.settings, { label: "saved" });
    const activities: unknown[] = [];
    await executePluginTool(host, { action: "enable", id: manifest.id }, entry => { activities.push(entry); });
    assert.deepEqual(activities, [{ action: "enable", id: manifest.id, outcome: "success" }]);
    assert.equal((await host.list())[0]?.running, true);
    await executePluginTool(host, { action: "settings", id: manifest.id, settings: { label: "live" } }, () => {});
    assert.equal((await host.invokeOperation("fixture.lifecycle.read", {})).result, "live");
    writeFileSync(path.join(directory, "extra.js"), "// updated artifact");
    await host.invoke("settings", { id: manifest.id, settings: { label: "recovered" } });
    assert.equal((await host.list())[0]!.trusted, true);
    assert.equal((await host.list())[0]?.running, true);
    assert.equal((await host.invokeOperation("fixture.lifecycle.read", {})).result, "recovered");
    await host.invoke("disable", { id: manifest.id });
    const { statSync, utimesSync } = await import("node:fs");
    const entry = path.join(directory, "host.js"), metadata = statSync(entry);
    writeFileSync(entry, readFileSync(entry, "utf8").replace('"done"', '"edit"'));
    utimesSync(entry, metadata.atime, metadata.mtime);
    assert.equal((await host.list())[0]!.trusted, true);
    writeFileSync(path.join(directory, "extra.js"), "changed");
    await host.invoke("enable", { id: manifest.id });
    assert.equal(new PluginHost(path.join(root, "state.json")) instanceof PluginHost, true);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});
import { fileURLToPath, pathToFileURL } from "node:url";
import { ProviderConnections } from "../server/provider-connections.ts";
import { AssistantConversations } from "../server/assistant-conversations.ts";
import { RootAccess } from "../server/file-access.ts";
test("Codex plugin tools share Host reads, enforce turn permission and restore metadata-only activity", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-activity-"));
  const log = path.join(root, "provider.jsonl"), secret = "synthetic-plugin-tool-PAT-private";
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url)), log] }, undefined, { packaged: false, checkoutRoot: root });
  const host = new PluginHost(path.join(root, "plugins.json"), { secrets: { supported: true, async read() { return secret; }, async set() {}, async status() { return true; }, async delete() {} } });
  const conversations = new AssistantConversations(connection, new RootAccess([root]), host);
  try {
    const settings = { provider: "codex" as const, permissionMode: "full-access" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
    const directory = lifecycleFixture(root, "fixture.lookup", `export function activate(c){return {operations:{
      read:({mode})=>{if(mode==='auth')throw Object.assign(Error(c.secrets.pat),{kind:'auth'});if(mode==='invalid')return 7;return mode==='empty'?[]:['output-only-marker',c.secrets.pat]},
      echo:()=>({[c.secrets.pat]:'echoed as key',value:c.secrets.pat}),
      nested:()=>[{safe:{['prefix-'+c.secrets.pat+'-suffix']:[{value:c.secrets.pat}]}}],
      connection:()=>({ok:true,message:'Connected'}), hidden:()=>{throw Error('must not run')}, write:()=>{throw Error('must not run')}
    },status:()=>({available:true,message:'Ready'}),dispose(){}}}`);
    const manifestFile = path.join(directory, "litzio-plugin.json"), manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    const operation = { version: 1, scope: "host", effect: "read", inputSchema: { type: "object" }, outputSchema: {} };

    manifest.secrets = [{ id: "pat", title: "Access token", scope: "connection", required: true }];
    Object.assign(manifest,{ healthCheck: "connection", operations: [
      { ...operation, id: "read", assistant: true, inputSchema: { type: "object", properties: { mode: { type: "string" }, query: { type: "string" } }, required: ["mode"], additionalProperties: false }, outputSchema: { type: "array", items: { type: "string" } } },
      { ...operation, id: "connection", outputSchema: { type: "object" } }, { ...operation, id: "hidden" }, { ...operation, id: "write", effect: "write", assistant: true },
      { ...operation, id: "echo", assistant: true, outputSchema: { type: "object", additionalProperties: { type: "string" } } },
      { ...operation, id: "nested", assistant: true, outputSchema: { type: "array", items: { type: "object" } } },
    ] });
    writeFileSync(manifestFile, JSON.stringify(manifest));
    await host.invoke("register", { directory });
    await host.invoke("trust", { id: manifest.id, registrationId: (await host.list())[0]!.registrationId });
    await host.invoke("enable", { id: manifest.id });
    const conversation = await conversations.send({ message: "Inspect plugins", folders: [root], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings);
    const start = readFileSync(log, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)).find(entry => entry.method === "thread/start");
    assert.ok(start.params.dynamicTools.some((tool: any) => tool.name === "invoke_plugin_operation"));
    const invoke = async (operation: string, input: unknown, id = conversation.id) => {
      const response: any = await connection.client.request("fixture/tool", { threadId: id, tool: "invoke_plugin_operation", arguments: { operation, input } });
      return { success: response.result.success, ...JSON.parse(response.result.contentItems[0].text) };
    };
    const health = await invoke("fixture.lookup.connection", {});
    assert.equal(health.success, true); assert.deepEqual(health.result, { ok: true, message: "Connected" });
    const read = await invoke("fixture.lookup.read", { mode: "success", query: "input-only-marker" });
    assert.equal(read.success, true); assert.deepEqual(read.result, ["output-only-marker", "[secret]"]);
    assert.equal(read.receipt.scope, "host"); assert.equal(read.receipt.outcome, "success");
    const empty = await invoke("fixture.lookup.read", { mode: "empty" });
    assert.equal(empty.success, true); assert.deepEqual(empty.result, []);
    const auth = await invoke("fixture.lookup.read", { mode: "auth" });
    assert.equal(auth.recovery.action,"request_permission");
    assert.equal(auth.success, false); assert.equal(auth.errorKind, "forbidden"); assert.equal(auth.receipt.outcome, "failure");
    for (const name of ["echo", "nested"]) {
      const refused = await invoke(`fixture.lookup.${name}`, {});
      assert.equal(refused.success, false, "Secret-bearing dynamic keys must not reach the provider");
      assert.equal(refused.errorKind, "unavailable"); assert.equal(refused.receipt.outcome, "failure");
      assert.ok(!("result" in refused)); assert.equal(JSON.stringify(refused).includes(secret), false);
    }
    for (const name of ["hidden", "write"]) {
      const denied = await invoke(`fixture.lookup.${name}`, {});
      assert.equal(denied.success, false); assert.equal(denied.errorKind, "forbidden"); assert.equal(denied.activity.outcome, "refused");
    }
    for (const input of [{ mode: "invalid" }, { mode: 1 }]) {
      const invalid = await invoke("fixture.lookup.read", input);
      assert.equal(invalid.success, false); assert.equal(invalid.errorKind, typeof input.mode === "number" ? "invalid_input" : "unavailable"); assert.ok(!("result" in invalid));
    }
    for (const action of ["list", "scaffold", "reload"]) {
      const response: any = await connection.client.request("fixture/tool", { threadId: conversation.id, tool: "manage_plugins", arguments: action === "list" ? { action } : action === "scaffold" ? { action, directory: path.join(root, "scaffolded"), id: "local.fixture" } : { action, id: "missing.plugin" } });
      assert.equal(conversations.current(conversation.id).userInput, undefined);
      assert.equal(response.result.success, action !== "reload");
      assert.match(response.result.contentItems[0].text, /activity/);
      assert.ok(conversations.current(conversation.id).turns.flatMap(t => t.items).some(item => item.text.includes(`plugins.${action}`)));
    }
    await connection.client.request("fixture/finish", { threadId: conversation.id });
    const restored = await conversations.resume(conversation.id, settings);
    assert.ok(restored.turns.flatMap(t => t.items).some(item => item.text === "plugins.reload (missing.plugin): failure"));
    const activity = restored.turns.flatMap(t => t.items).filter(item => item.text.startsWith("invoke_plugin_operation"));
    assert.ok(activity.some(item => item.text.includes("fixture.lookup.read") && item.status === "failed"));
    const recorded = JSON.stringify(activity);
    assert.match(recorded, /requestId/);
    assert.ok(activity.every(item => Number.isFinite(JSON.parse(item.toolResult!.contentItems[0]!.text!).activity.at)));
    assert.doesNotMatch(recorded, /input-only-marker|output-only-marker|synthetic-plugin-tool-PAT-private/);
    assert.equal(readFileSync(log, "utf8").includes(secret), false);
    const readOnly = { ...settings, permissionMode: "read-only" as const };
    const restricted = await conversations.send({ message: "Inspect only", folders: [root], model: settings.model, reasoningEffort: settings.reasoningEffort }, readOnly);
    for (const name of ["read", "connection"]) {
      const allowed = await invoke(`fixture.lookup.${name}`, name === "read" ? { mode: "success" } : {}, restricted.id);
      assert.equal(allowed.success, true); assert.equal(allowed.receipt.outcome, "success");
    }
    for (const name of ["hidden", "write"]) {
      const denied = await invoke(`fixture.lookup.${name}`, {}, restricted.id);
      assert.equal(denied.success, false); assert.equal(denied.errorKind, "forbidden");
      assert.equal(denied.activity.outcome, "refused");
      assert.match(denied.error, /assistant:true/); assert.match(denied.error, /Broader turn permissions do not enable/);
    }
    const manage = async (args: unknown) => {
      const response: any = await connection.client.request("fixture/tool", { threadId: restricted.id, tool: "manage_plugins", arguments: args });
      return { success: response.result.success, ...JSON.parse(response.result.contentItems[0].text) };
    };
    for (const action of ["list", "validate", "settings"]) {
      const result = await manage(action === "list" ? { action } : action === "validate" ? { action, directory } : { action, id: manifest.id });
      assert.equal(result.success, true);
    }
    for (const args of [
      { action: "disable", id: manifest.id }, { action: "reload", id: manifest.id },
      { action: "enable", id: manifest.id }, { action: "unregister", id: manifest.id },
      { action: "settings", id: manifest.id, settings: {} }, { action: "register", directory },
      { action: "trust", id: manifest.id, registrationId: (await host.list())[0]!.registrationId },
      { action: "scaffold", id: "local.readonly" },
    ]) {
      const denied = await manage(args);
      assert.equal(denied.success, false, args.action);
      assert.equal(denied.activity.outcome, "failure");
      assert.match(denied.error, new RegExp(args.action));
      assert.match(denied.error, /Opened folders.*Full access/);
    }
    const redacted = await invoke("fixture.lookup.read", { mode: "success" }, restricted.id);
    assert.deepEqual(redacted.result, ["output-only-marker", "[secret]"]);
    await connection.client.request("fixture/finish", { threadId: restricted.id });
    await host.invoke("disable", { id: manifest.id });
    await assert.rejects(host.invokeAssistantOperation("fixture.lookup.read", { mode: "success" }), (error: any) => error.kind === "unavailable");
  } finally { await connection.close(); await host.close(); rmSync(root, { recursive: true, force: true }); }
});

function lifecycleFixture(root: string, id: string, code = "export function activate(){return {operations:{},status:()=>({available:true,message:'Fixture'}),dispose(){}}}") {
  const directory = path.join(root, id); mkdirSync(directory);
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
  writeCodePluginManifest(directory,{id,name: id,entry: "host.js",screen:"screen.jsx"});
  writeFileSync(path.join(directory, "screen.jsx"), "export default function Screen(){return null}");
  writeFileSync(path.join(directory, "host.js"), code);
  return directory;
}
test("missing artifact affects only its registration; unregister records activity and leaves artifact files alone", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-missing-plugin-")), host = new PluginHost(path.join(root, "state.json"));
  try {
    const a = lifecycleFixture(root, "fixture.a"), b = lifecycleFixture(root, "fixture.b");
    await host.invoke("register", { directory: a }); rmSync(a, { recursive: true });
    await host.invoke("register", { directory: b });
    assert.match((await host.list()).find(p => p.id === "fixture.a")!.error!, /artifact missing/);
    await executePluginTool(host, { action: "unregister", id: "fixture.a" }, () => {});
    await host.invoke("unregister", { id: "fixture.b" });
    assert.equal((await host.list()).length, 0);
    assert.doesNotThrow(() => readFileSync(path.join(b, "host.js")));
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});
test("disable drains admitted status observations and their late results cannot restore contributions", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-status-drain-")), host = new PluginHost(path.join(root, "state.json"));
  try {
    const marker = path.join(root, "started"), release = path.join(root, "release"), disposed = path.join(root, "disposed");
    const directory = lifecycleFixture(root, "fixture.slow", `import {existsSync,writeFileSync} from 'node:fs'; let calls=0; export function activate(){return {operations:{},async status(){if(calls++>0){writeFileSync(${JSON.stringify(marker)},'');while(!existsSync(${JSON.stringify(release)}))await new Promise(r=>setTimeout(r,10))}return {available:true,message:'Fixture'}},dispose(){writeFileSync(${JSON.stringify(disposed)},'')}}}`);
    await host.invoke("register", { directory });
    await host.invoke("trust", { id: "fixture.slow", registrationId: (await host.list())[0]!.registrationId });
    await host.invoke("enable", { id: "fixture.slow" });
    const observation = host.list();
    while (!existsSync(marker)) await new Promise(r => setTimeout(r, 10));
    let disabled = false;
    const stopping = host.invoke("disable", { id: "fixture.slow" }).then(() => { disabled = true; });
    await new Promise(r => setImmediate(r));
    assert.equal(disabled, false); assert.equal(existsSync(disposed), false);
    assert.equal((await host.list())[0]!.status, null);
    writeFileSync(release, ''); await stopping;
    assert.equal(existsSync(disposed), true);
    const late = (await observation)[0]!;
    assert.equal(late.running, false); assert.equal(late.enabled, false); assert.equal(late.status, null);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("Windows DPAPI uses an isolated Host/account namespace, persists ciphertext and rejects other OSes", async () => {
  const { WindowsPluginSecretStore } = await import("../server/plugins/secret-store.ts");
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-secrets-"));
  const unsupported = new WindowsPluginSecretStore(root, "linux");
  try {
    assert.equal(unsupported.supported, false);
    await assert.rejects(unsupported.set("p", "token", "value"), /unsupported/);
    await assert.rejects(unsupported.read("p", "token"), /unsupported/);
    await assert.rejects(unsupported.delete("p"), /unsupported/);
    const { createHash } = await import("node:crypto");
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    const file = path.join(root, hash("p"), hash("token"));
    // File-only status validation is testable on every OS without DPAPI.
    const envelopeStore = new WindowsPluginSecretStore(root, "win32");
    mkdirSync(path.dirname(file), { recursive: true });
    // Exact independent-review reproduction: a header with empty mandatory fields.
    const emptyEnvelope = Buffer.alloc(84);
    emptyEnvelope.writeUInt32LE(1, 0);
    Buffer.from("d08c9ddf0115d1118c7a00c04fc297eb", "hex").copy(emptyEnvelope, 4);
    emptyEnvelope.writeUInt32LE(1, 20);
    writeFileSync(file, emptyEnvelope);
    await assert.rejects(envelopeStore.status("p", "token"), /unavailable/);
    await envelopeStore.delete("p", "token");
    if (process.platform !== "win32") return;
    const store = new WindowsPluginSecretStore(root), value = 'isolated-token-"-한글';
    await store.set("p", "token", value);
    const originalRead = store.read.bind(store);
    store.read = async () => { throw new Error("status must not decrypt"); };
    assert.equal(await store.status("p", "token"), true);
    store.read = originalRead;
    assert.equal(await store.read("p", "token"), value);
    assert.equal(await store.read("q", "token"), undefined);
    assert.equal(await new WindowsPluginSecretStore(path.join(root, "other-host")).read("p", "token"), undefined);
    assert.equal(await new WindowsPluginSecretStore(root).read("p", "token"), value);
    const { readdirSync } = await import("node:fs");
    for (const name of readdirSync(root, { recursive: true, withFileTypes: true })) if (name.isFile()) assert.equal(readFileSync(path.join(name.parentPath, name.name)).includes(Buffer.from(value)), false);
    const ciphertext = readFileSync(file);
    // Mutate the real Protect output, retaining the rest of its envelope.
    const cipherOffset = 48 + ciphertext.readUInt32LE(44);
    const saltOffset = cipherOffset + 8;
    const hmacKeyOffset = saltOffset + 4 + ciphertext.readUInt32LE(saltOffset);
    const hashOffset = hmacKeyOffset + 4 + ciphertext.readUInt32LE(hmacKeyOffset);
    const hmacOffset = hashOffset + 8;
    const dataOffset = hmacOffset + 4 + ciphertext.readUInt32LE(hmacOffset);
    const signatureOffset = dataOffset + 4 + ciphertext.readUInt32LE(dataOffset);
    for (const [offset, value] of [[cipherOffset, 0], [cipherOffset + 4, 0], [hashOffset, 0], [hashOffset + 4, 0], [saltOffset, 0], [hmacOffset, 0], [dataOffset, 0], [signatureOffset, 0], [dataOffset, 0xffffffff]]) {
      const invalid = Buffer.from(ciphertext); invalid.writeUInt32LE(value!, offset!);
      writeFileSync(file, invalid);
      await assert.rejects(store.status("p", "token"), /unavailable/);
    }
    for (const invalid of [ciphertext.subarray(0, -1), Buffer.concat([ciphertext, Buffer.from([0])])]) {
      writeFileSync(file, invalid);
      await assert.rejects(store.status("p", "token"), /unavailable/);
    }
    writeFileSync(file, ciphertext);
    assert.equal(await store.status("p", "token"), true);
    const damaged = Buffer.from(ciphertext); damaged[damaged.length - 1]! ^= 1;
    writeFileSync(file, damaged);
    assert.equal(await store.status("p", "token"), true);
    await assert.rejects(store.read("p", "token"), /unavailable/);
    await assert.rejects(store.status("p", "token"), /unavailable/);
    writeFileSync(file, ciphertext);
    assert.equal(await store.status("p", "token"), true);
    writeFileSync(file, "malformed");
    await assert.rejects(store.status("p", "token"), /unavailable/);
    await store.delete("p", "token"); assert.equal(await store.status("p", "token"), false);
    await store.set("p", "token", "new-value"); await store.delete("p"); assert.equal(await store.status("p", "token"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("secret admission, runtime plugin scope, non-disclosure and unregister cleanup", async () => {
  const { safePluginValue } = await import("../server/plugins/secret-redaction.ts");
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-secret-host-"));
  const values = new Map<string, string>(), broken = new Set<string>();
  const store = { supported: true, async read(p: string, n: string) { return values.get(`${p}/${n}`); }, async status(p: string, n: string) { if (broken.has(`${p}/${n}`)) throw new Error("raw-store-error-private"); return values.has(`${p}/${n}`); }, async set(p: string, n: string, v: string) { values.set(`${p}/${n}`, v); broken.delete(`${p}/${n}`); }, async delete(p: string, n?: string) { for (const key of values.keys()) if (n ? key === `${p}/${n}` : key.startsWith(`${p}/`)) { values.delete(key); broken.delete(key); } } };
  const host = new PluginHost(path.join(root, "state.json"), { secrets: store }), value = 'fixture-PAT-"-private';
  try {
    for (const id of ["example.first", "example.second"]) {
      const directory = path.join(root, id); mkdirSync(directory);
      writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
      writeCodePluginManifest(directory,{id,name: id,entry: "host.js",secrets: [{ id: "pat", title: "Access token", scope: "connection", required: true }],operations: [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: {}, outputSchema: {} }],screen:"screen.jsx"});
      writeFileSync(path.join(directory, "host.js"), `export function activate(c){ if(Object.keys(c.secrets).join()!=='pat')throw Error('scope');return {operations:{read:(input)=>{if(input.fail)throw Error(c.secrets.pat);return {echo:c.secrets.pat}}},status:()=>({available:true,message:c.secrets.pat}),dispose(){}}}`);
      await host.invoke("register", { directory });
      await assert.rejects(host.setSecret(id, "undeclared", value), /Undeclared/);
      await host.setSecret(id, "pat", id === "example.first" ? value : "second-private-PAT");
      const plugin = (await host.list()).find(p => p.id === id)!;
      await host.invoke("trust", { id, registrationId: plugin.registrationId }); await host.invoke("enable", { id });
      assert.equal(JSON.stringify(await host.invokeOperation(`${id}.read`, {})).includes(id === "example.first" ? value : "second-private-PAT"), false);
    }
    assert.equal(JSON.stringify(await host.invokeOperation("example.first.read", { fail: true })).includes(value), false);
    assert.equal(JSON.stringify(await host.list()).includes(value), false);
    assert.deepEqual(safePluginValue({ value }, [value]), { value: "[secret]" });
    assert.equal(safePluginValue(`error ${value}`, [value]), "error [secret]");
    assert.equal(readFileSync(path.join(root, "state.json"), "utf8").includes(value), false);
    await host.setSecret("example.first", "pat", "replacement-private");
    assert.equal(values.get("example.first/pat"), "replacement-private");
    assert.equal((await host.list()).find(p => p.id === "example.first")!.running, true);
    assert.deepEqual((await host.invokeOperation("example.first.read", {})).result, { echo: "[secret]" });
    await host.invoke("disable", { id: "example.first" });
    broken.add("example.first/pat");
    const damaged = (await host.list()).find(p => p.id === "example.first")!;
    assert.equal(damaged.name, "example.first"); assert.equal(damaged.digest?.length, 64);
    assert.deepEqual(damaged.secrets?.declarations, [{ id: "pat", title: "Access token", scope: "connection", required: true, configured: false, error: "Secret unavailable or damaged" }]);
    assert.equal((await host.list()).find(p => p.id === "example.second")!.secrets?.declarations[0]?.configured, true);
    assert.equal(JSON.stringify(await host.invoke("secret-status", { id: "example.first" })).includes("raw-store-error-private"), false);
    await host.invoke("secret-delete", { id: "example.first", name: "pat" });
    assert.equal("error" in (await host.list()).find(p => p.id === "example.first")!.secrets!.declarations[0]!, false);
    await host.setSecret("example.first", "pat", value);
    assert.equal((await host.list()).find(p => p.id === "example.first")!.secrets?.declarations[0]?.configured, true);
    await host.invoke("secret-delete", { id: "example.first", name: "pat" });
    assert.equal(await store.status("example.first", "pat"), false);
    await assert.rejects(host.invoke("enable", { id: "example.first" }), /not configured/);
    assert.equal(await store.status("example.second", "pat"), true);
    await host.invoke("unregister", { id: "example.second" }); assert.equal(values.size, 0);
    const { WindowsPluginSecretStore } = await import("../server/plugins/secret-store.ts");
    const unsupportedHost = new PluginHost(path.join(root, "unsupported.json"), { secrets: new WindowsPluginSecretStore(path.join(root, "unsupported-secrets"), "linux") });
    try {
      await unsupportedHost.invoke("register", { directory: path.join(root, "example.first") });
      const p = (await unsupportedHost.list())[0]!;
      await unsupportedHost.invoke("trust", { id: p.id, registrationId: p.registrationId });
      await assert.rejects(unsupportedHost.setSecret(p.id, "pat", value), /unsupported/);
      await assert.rejects(unsupportedHost.invoke("enable", { id: p.id }), /unsupported/);
      assert.equal((await unsupportedHost.list())[0]!.secrets?.supported, false);
    } finally { await unsupportedHost.close(); }

  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("Host streams stay intact while synchronous and asynchronous plugin output is discarded", async () => {
  const { spawnSync } = await import("node:child_process");
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-logs-"));
  try {
    const directory = lifecycleFixture(root, "fixture.logs", `export async function activate(){console.log('private-log');process.stderr.write('private-log');await new Promise(r=>setTimeout(r,1));console.log('private-log');return {operations:{},status:()=>({}),dispose(){console.log('private-log')}}}`);
    const redaction = new URL("../server/plugins/secret-redaction.ts", import.meta.url).href;
    const transport = new URL("../server/plugins/plugin-process.ts", import.meta.url).href;
    const script = `import assert from 'node:assert/strict'; const out=process.stdout.write, err=process.stderr.write; await import(${JSON.stringify(redaction)}); assert.equal(process.stdout.write,out); assert.equal(process.stderr.write,err); const {startPluginProcess}=await import(${JSON.stringify(transport)}); const plugin=await startPluginProcess(${JSON.stringify(path.join(directory, "host.js"))},{contributes:{operations:[]}}, {}, {}, ()=>{}); await plugin.dispose(); console.log('host-visible');`;
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), "host-visible"); assert.equal(result.stderr, "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("operation invoke publishes declared public rows and refuses row-type mismatches", async () => {
  const knownSecret = "row-boundary-known-private";
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-operation-rows-"));
  const directory = path.join(root, "artifact"); mkdirSync(directory);
  const manifest = {id: "fixture.rows",name: "Rows",entry: "host.js",secrets: [{ id: "pat", title: "Access token", scope: "connection", required: true }],operations: [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: { type: "object", properties: { mode: { type: "string" } }, additionalProperties: false }, outputSchema: { type: "array", items: { type: "object", properties: {points:{type:"number"},caption:{type:"string"},url:{type:"string"}},required:["points","caption","url"],additionalProperties:false } },  }],screen:"screen.jsx"};
  writeCodePluginManifest(directory,manifest);
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
  writeFileSync(path.join(directory, "host.js"), `export function activate(){return {operations:{read:({mode})=>{if(mode?.startsWith("error:")) throw Object.assign(new Error("raw-response credential-private"), {kind:mode.slice(6),response:"credential-private"}); return [{points:mode==="wrong-number"?"3":-3,caption:mode==="wrong-secret"?4:"row-boundary-known-private",url:"https://example.test/issue/1"}]} },status:()=>({available:true,message:"Rows"}),dispose(){}}}`);
  const host = new PluginHost(path.join(root, "plugins.json"), { secrets: { supported: true, async read() { return knownSecret; }, async set() {}, async status() { return true; }, async delete() {} } });
  try {
    await host.invoke("register", { directory }); const record = (await host.list())[0]!;
    await host.invoke("trust", { id: record.id, registrationId: record.registrationId }); await host.invoke("enable", { id: record.id });
    const invoke = (mode?: string) => host.invoke("invoke", { operation: "fixture.rows.read", input: mode ? { mode } : {} }) as Promise<any>;
    const valid = await invoke(); assert.equal(valid.receipt.outcome, "success"); assert.deepEqual(valid.result, [{ points: -3, caption: "[secret]", url: "https://example.test/issue/1" }]);
    await host.invoke("reload", { id: record.id });
    assert.deepEqual((await invoke()).result, valid.result);
    const { PLUGIN_ERROR_KINDS, PLUGIN_ERROR_MESSAGES } = await import("@litzio/plugin-sdk");
    for (const kind of [...PLUGIN_ERROR_KINDS, "credential-private"] as const) {
      const failure = await invoke(`error:${kind}`);
      const expected = kind === "credential-private" ? "failed" : kind;
      assert.equal(failure.errorKind, expected);
      assert.equal(failure.error, PLUGIN_ERROR_MESSAGES[expected]);
      assert.equal(failure.receipt.outcome, "failure");
      assert.ok(!JSON.stringify(failure).includes("private"));
      assert.ok(!JSON.stringify(failure).includes("raw-response"));
    }
    for (const mode of ["wrong-number", "wrong-secret"]) {
      const refused = await invoke(mode); assert.equal(refused.receipt.outcome, "failure"); assert.ok(!("result" in refused)); assert.ok(!JSON.stringify(refused).includes("private")); assert.equal(refused.errorKind, "failed"); assert.ok(!refused.error.includes("retrying a write"));
    }
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});



test("subprocess isolation, fresh artifact reload, trust failure recovery and crash status", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-reload-")), host = new PluginHost(path.join(root, "state.json"), { });
  const connection = new ProviderConnections(path.join(root, "assistant"));
  const skills = path.join(root, "assistant", ".agents", "skills"), installedSkill = path.join(skills, "litzio-plugin-fixture--reload---review");
  const marker = path.join(root, "disposed");
  const code = (label: string, crash = false) => `import {writeFileSync} from 'node:fs'; export function activate(){${crash ? "setTimeout(()=>process.exit(7),100);" : ""}return {operations:{read:()=> 'available'},status:()=>({available:true,message:${JSON.stringify(label)}+':'+process.pid}),dispose(){writeFileSync(${JSON.stringify(marker)},'disposed')}}}`;
  try {
    const directory = lifecycleFixture(root, "fixture.reload", code("first"));
    const manifestFile = path.join(directory, "litzio-plugin.json"), manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
     manifest.skills = [{ id: "review", directory: "skills/review" }];
    manifest.operations = [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "string" } }];
    writeFileSync(manifestFile, JSON.stringify(manifest));
    const skillDirectory = path.join(directory, "skills", "review"); mkdirSync(path.join(skillDirectory, "references"), { recursive: true });
    const skillText = (body: string) => `---\nname: review\ndescription: Review a converted document\n---\n${body}\n`;
    writeFileSync(path.join(skillDirectory, "SKILL.md"), skillText("First procedure"));
    writeFileSync(path.join(skillDirectory, "references", "evidence.md"), "Original evidence");
    connection.environment();
    const userSkill = path.join(skills, "user-skill"); mkdirSync(userSkill); writeFileSync(path.join(userSkill, "SKILL.md"), "User skill");
    const stale = path.join(skills, "litzio-plugin-removed---review"); mkdirSync(stale); writeFileSync(path.join(stale, "SKILL.md"), "Stale");
    await host.start(); assert.equal(existsSync(stale), false);
    await host.invoke("register", { directory });
    assert.equal(existsSync(installedSkill), false, "registration without trust cannot publish instructions");
    const trust = async () => host.invoke("trust", { id: "fixture.reload", registrationId: (await host.list())[0]!.registrationId });
    await trust();
    const copyFault = t.mock.method(fs, "cpSync", ((_source: unknown, target: string) => {
      mkdirSync(target, { recursive: true }); writeFileSync(path.join(target, "partial.txt"), "Partial copy");
      throw Object.assign(new Error("simulated ENOSPC during skill copy"), { code: "ENOSPC" });
    }) as typeof fs.cpSync); syncBuiltinESMExports();
    try { await host.invoke("enable", { id: "fixture.reload" }); }
    finally { copyFault.mock.restore(); syncBuiltinESMExports(); }
    const degraded = (await host.list())[0]!;
    assert.equal(degraded.running, true); assert.match(degraded.error!, /skill/i);
    assert.equal((await host.invokeOperation("fixture.reload.read", {})).result, "available");
    assert.equal(existsSync(installedSkill), false);
    await host.invoke("reload", { id: "fixture.reload" });
    assert.equal((await host.list())[0]!.error, undefined);
    const cleanupFault = t.mock.method(fs, "rmSync", (() => { throw Object.assign(new Error("simulated startup cleanup failure"), { code: "EACCES" }); }) as typeof fs.rmSync); syncBuiltinESMExports();
    try { await host.start(); } finally { cleanupFault.mock.restore(); syncBuiltinESMExports(); }
    assert.match((await host.list())[0]!.error!, /skill/i);
    assert.equal((await host.invokeOperation("fixture.reload.read", {})).result, "available");
    await host.invoke("reload", { id: "fixture.reload" });
    assert.match(readFileSync(path.join(installedSkill, "SKILL.md"), "utf8"), /name: litzio-plugin-fixture--reload---review/);
    assert.equal(readFileSync(path.join(installedSkill, "references", "evidence.md"), "utf8"), "Original evidence");
    assert.ok(connection.environment().skills.includes(path.basename(installedSkill)));
    const first = (await host.list())[0]!.status!.message;
    assert.notEqual(first.split(':')[1], String(process.pid));
    writeFileSync(path.join(directory, "host.js"), code("second"));
    writeFileSync(path.join(skillDirectory, "SKILL.md"), skillText("Updated procedure"));
    rmSync(path.join(skillDirectory, "references"), { recursive: true });
    await host.invoke("reload", { id: "fixture.reload" });
    assert.match(readFileSync(path.join(installedSkill, "SKILL.md"), "utf8"), /Updated procedure/);
    assert.equal(existsSync(path.join(installedSkill, "references")), false, "reload removes deleted resources");
    assert.equal(readFileSync(marker, "utf8"), "disposed");
    assert.equal((await host.list())[0]!.running, true);
    await host.invoke("reload", { id: "fixture.reload" });
    const second = (await host.list())[0]!.status!.message;
    assert.match(second, /^second:/); assert.notEqual(first.split(':')[1], second.split(':')[1]);
    writeFileSync(path.join(directory, "host.js"), "throw new Error('private error')");
    await trust(); await assert.rejects(host.invoke("reload", { id: "fixture.reload" }), /request failed/);
    assert.equal((await host.list())[0]!.running, false);
    assert.equal(existsSync(installedSkill), false, "failed activation cannot retain instructions");
    writeFileSync(path.join(directory, "host.js"), code("recovered"));
    await trust(); await host.invoke("reload", { id: "fixture.reload" });
    assert.match((await host.list())[0]!.status!.message, /^recovered:/);
    writeFileSync(path.join(directory, "host.js"), code("crash", true));
    await trust(); await host.invoke("reload", { id: "fixture.reload" });
    // Process exit notification can follow a rejected status RPC on a busy Host.
    const deadline = Date.now() + 5000;
    let failed = (await host.list())[0]!;
    while (!/process failed/.test(failed.error ?? "") && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 25));
      failed = (await host.list())[0]!;
    }
    assert.equal(failed.running, false); assert.match(failed.error!, /process failed/);
    assert.equal(existsSync(installedSkill), false, "crashed plugin instructions are removed");
    await new Promise(r => setTimeout(r, 100)); assert.equal((await host.list())[0]!.running, false);
    writeFileSync(path.join(directory, "host.js"), code("final"));
    await trust(); await host.invoke("reload", { id: "fixture.reload" });
    assert.match((await host.list())[0]!.status!.message, /^final:/);
    await host.invoke("disable", { id: "fixture.reload" }); assert.equal(existsSync(installedSkill), false);
    await host.invoke("enable", { id: "fixture.reload" }); assert.equal(existsSync(installedSkill), true);
    await host.invoke("unregister", { id: "fixture.reload" }); assert.equal(existsSync(installedSkill), false);
    await host.invoke("register", { directory }); await trust(); await host.invoke("enable", { id: "fixture.reload" });
    await host.close(); assert.equal(existsSync(installedSkill), false);
    assert.equal(readFileSync(path.join(userSkill, "SKILL.md"), "utf8"), "User skill");
    assert.ok(existsSync(path.join(skills, "litzio-guide", "SKILL.md")));
  } finally { await connection.close(); await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("scaffolded skills report actionable diagnostics and accept documented YAML", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-skill-validation-"));
  const host = new PluginHost(path.join(root, "state.json"), { authoringDirectory: path.join(root, "plugins") });
  try {
    await host.invoke("scaffold", { id: "local.example", template: "screen" });
    const directory = path.join(root, "plugins", "local.example");
    const file = path.join(directory, "litzio-plugin.json");
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    manifest.skills = [{ id: "generation-status", directory: "skills/status" }];
    writeFileSync(file, JSON.stringify(manifest));
    const source = path.join(directory, "skills", "status"); mkdirSync(source, { recursive: true });
    const skillFile = path.join(source, "SKILL.md");
    const missing: any = await host.invoke("validate", { directory });
    assert.equal(missing.errors[0].file, "skills/status/SKILL.md");
    assert.match(missing.errors[0].message, /Expected a readable UTF-8 SKILL.md/);
    for (const text of [
      '---\nname: "example-generation-status"\ndescription: "Read generation status."\n---\nRead the existing generation status. Do not edit documents.\r\n',
      '---\r\nname: unrelated\r\ndescription: Read status\r\n---\r\n',
      '---\nname: status\ndescription: Read status\n---\n',
    ]) {
      writeFileSync(skillFile, text);
      assert.equal((await host.invoke("validate", { directory }) as any).valid, true);
    }
    for (const [text, field] of [
      ["No frontmatter", "frontmatter"], ["---\n[]\n---\n", "frontmatter"],
      ["---\nname: [\n---\n", "frontmatter"],
      ["---\nname: 12\ndescription: Status\n---\n", "name"],
      ["---\nname: status\ndescription: ''\n---\n", "description"],
    ]) {
      writeFileSync(skillFile, text);
      const result: any = await host.invoke("validate", { directory });
      assert.equal(result.valid, false);
      assert.equal(result.errors[0].file, "skills/status/SKILL.md");
      assert.equal(result.errors[0].path, field);
      assert.match(result.errors[0].message, /Expected|Invalid YAML/);
    }
    writeFileSync(skillFile, "---\nname: status\ndescription: Status\n---\n");
    // 14 prefix + 14 encoded plugin id + 3 separator + 33 skill id = 64.
    for (const [length, valid] of [[33, true], [34, false]] as const) {
      manifest.skills[0].id = "s".repeat(length); writeFileSync(file, JSON.stringify(manifest));
      const result: any = await host.invoke("validate", { directory });
      assert.equal(result.valid, valid);
      if (!valid) assert.match(result.errors[0].message, /65 characters; maximum is 64.*Shorten/);
    }
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("skill validation is nonexecuting and plugin namespaces preserve other contributions", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-skills-")), host = new PluginHost(path.join(root, "state.json"));
  try {
    const directories = ["fixture.first", "fixture.second"].map(id => lifecycleFixture(root, id, "throw new Error('must not execute')"));
    for (const [index, directory] of directories.entries()) {
      const manifestFile = path.join(directory, "litzio-plugin.json"), manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
       manifest.skills = [{ id: "review", directory: "skills/review" }];
      writeFileSync(manifestFile, JSON.stringify(manifest));
      await assert.rejects(host.invoke("register", { directory }), /Expected an existing artifact-local/);
      const source = path.join(directory, "skills", "review"); mkdirSync(source, { recursive: true });
      writeFileSync(path.join(source, "SKILL.md"), "---\nname: review\n---\nMissing description");
      await assert.rejects(host.invoke("register", { directory }), /description: Expected a non-empty YAML string/);
      writeFileSync(path.join(source, "SKILL.md"), "---\nname: review\ndescription: Review\n---\nProcedure");
      await host.invoke("register", { directory });
      const manager = new PluginAssistantSkills(path.join(root, "assistant"));
      manager.install(directory, validateManifest(manifest));
      const copied = path.join(root, "assistant", ".agents", "skills", `litzio-plugin-${manifest.id.replaceAll(".", "--")}---review`, "SKILL.md");
      assert.equal(manager.displayName(copied), `${manifest.name} · review`);
      assert.match(readFileSync(copied, "utf8"), /name: litzio-plugin-/);
      manager.clear(manifest.id);
      assert.equal(manager.displayName(copied), undefined);
      manager.install(directory, validateManifest(manifest));
      if (index === 1) {
        assert.ok(existsSync(path.join(root, "assistant", ".agents", "skills", "litzio-plugin-fixture--first---review", "SKILL.md")));
        const first = validateManifest(JSON.parse(readFileSync(path.join(directories[0]!, "litzio-plugin.json"), "utf8")));
        first.contributes.skills = []; manager.install(directories[0]!, first);
        assert.equal(existsSync(path.join(root, "assistant", ".agents", "skills", "litzio-plugin-fixture--first---review")), false);
        assert.equal(existsSync(path.join(root, "assistant", ".agents", "skills", "litzio-plugin-fixture--second---review", "SKILL.md")), true);
        if (process.platform === "win32") {
          const skillPath = path.join(root, "assistant", ".agents", "skills", "litzio-plugin-fixture--second---review");
          const upperPath = path.join(path.dirname(skillPath), path.basename(skillPath).toUpperCase());
          fs.renameSync(skillPath, upperPath); manager.clear("fixture.second");
          assert.equal(existsSync(upperPath), false, "Windows cleanup matches namespace aliases without case sensitivity");
        }
      }
    }
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});


test("a stalled write times out as uncertain; failed disposal can recover on the next reload", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-timeout-")), host = new PluginHost(path.join(root, "state.json"));
  try {
    const directory = lifecycleFixture(root, "fixture.timeout", `export function activate(){return {operations:{write:()=>new Promise(()=>{})},status:()=>({available:true,message:'ready'}),dispose(){throw new Error('private')}}}`);
    const file = path.join(directory, "litzio-plugin.json"), manifest = JSON.parse(readFileSync(file, 'utf8'));
    manifest.operations = [{id:'write',version:1,effect:'write',scope:'host',inputSchema:{type:'object'},outputSchema:{type:'object'}}];
    writeFileSync(file, JSON.stringify(manifest));
    await host.invoke("register", {directory});
    await host.invoke("trust", {id:'fixture.timeout',registrationId:(await host.list())[0]!.registrationId});
    await host.invoke("enable", {id:'fixture.timeout'});
    await assert.rejects(host.invoke("reload", {id:'fixture.timeout'}), /disposal failed/);
    assert.equal((await host.list())[0]!.running, false);
    await host.invoke("reload", {id:'fixture.timeout'});
    const result = await host.invokeOperation('fixture.timeout.write', {});
    assert.equal(result.receipt.outcome, 'uncertain');
    assert.equal('errorKind' in result && result.errorKind, 'timeout');
    assert.match('error' in result ? result.error ?? '' : '', /Check the target before retrying a write/);
    assert.equal((await host.list())[0]!.running, false);
    assert.match((await host.list())[0]!.error!, /process failed/);
  } finally {await host.close(); rmSync(root, {recursive:true, force:true});}
});


test("Host shutdown closes every child even when one dispose fails", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-close-")), host = new PluginHost(path.join(root, "state.json"));
  const marker = path.join(root, 'disposed');
  try {
    for (const [id, dispose] of [['fixture.bad', "throw new Error('private')"], ['fixture.good', `writeFileSync(${JSON.stringify(marker)},'done')`]]) {
      const directory = lifecycleFixture(root, id!, `import {writeFileSync} from 'node:fs'; export function activate(){return {operations:{},status:()=>({available:true,message:'ready'}),dispose(){${dispose}}}}`);
      await host.invoke('register', {directory});
      await host.invoke('trust', {id, registrationId:(await host.list()).find(p=>p.id===id)!.registrationId});
      await host.invoke('enable', {id});
    }
    await assert.rejects(host.close(), /cleanup failed/);
    assert.equal(readFileSync(marker, 'utf8'), 'done');
    assert.ok((await host.list()).every(p=>!p.running));
  } finally {await host.close(); rmSync(root, {recursive:true, force:true});}
});


test("secret IPC admission is per plugin at activation, and reload reads fresh values without exposing errors", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-secret-ipc-"));
  const values = new Map([['fixture.secret/pat', 'first-private-token'], ['fixture.other/pat', 'other-private-token']]);
  const reads: string[] = [];
  const store = { supported: true, async read(id: string, name: string) { reads.push(`${id}/${name}`); return values.get(`${id}/${name}`); }, async status(id: string, name: string) {return values.has(`${id}/${name}`);}, async set(id: string, name: string, value: string) {values.set(`${id}/${name}`,value);}, async delete() {} };
  const host = new PluginHost(path.join(root, 'state.json'), { secrets: store });
  try {
    const directory = lifecycleFixture(root, 'fixture.secret', `export function activate(c){
      console.log(c.secrets.pat); process.stderr.write(c.secrets.pat);
      if (!Object.isFrozen(c.secrets) || Object.keys(c.secrets).join() !== 'pat') throw Error('scope');
      if(c.secrets.pat === 'throw-private-token') throw Error(c.secrets.pat);
      return {operations:{read:(input)=>{if(input.fail)throw Error(c.secrets.pat);return {version:c.secrets.pat==='first-private-token'?1:c.secrets.pat==='second-private-token'?2:0}}},status:()=>({available:true,message:c.secrets.pat}),dispose(){}}}`);
    const file = path.join(directory,'litzio-plugin.json'), manifest = JSON.parse(readFileSync(file,'utf8'));

    manifest.secrets = [{id:'pat',title:'Access token',scope:'connection',required:true}];
    manifest.operations = [{id:'read',version:1,effect:'read',scope:'host',inputSchema:{},outputSchema:{}}];
    writeFileSync(file,JSON.stringify(manifest));
    await host.invoke('register',{directory});
    await assert.rejects(host.invoke('enable',{id:'fixture.secret'}),/trust/);
    await host.invoke('trust',{id:'fixture.secret',registrationId:(await host.list())[0]!.registrationId});
    assert.deepEqual(reads, []);
    await host.invoke('enable',{id:'fixture.secret'});
    assert.deepEqual((await host.invokeOperation('fixture.secret.read',{})).result,{version:1});
    assert.deepEqual(reads,['fixture.secret/pat']);
    assert.equal(JSON.stringify(await host.invokeOperation('fixture.secret.read',{fail:true})).includes('first-private-token'),false);
    assert.equal(JSON.stringify(await host.list()).includes('first-private-token'),false);
    await host.invoke('disable',{id:'fixture.secret'});
    await host.setSecret('fixture.secret','pat','second-private-token');
    await host.invoke('reload',{id:'fixture.secret'});
    assert.deepEqual((await host.invokeOperation('fixture.secret.read',{})).result,{version:2});
    assert.deepEqual(reads,['fixture.secret/pat','fixture.secret/pat']);
    await host.invoke('disable',{id:'fixture.secret'});
    await host.setSecret('fixture.secret','pat','throw-private-token');
    await assert.rejects(host.invoke('reload',{id:'fixture.secret'}), error => error instanceof Error && error.message === 'Plugin request failed');
    assert.equal(JSON.stringify(await host.list()).includes('throw-private-token'),false);
    assert.equal((await host.list())[0]!.running,false);
  } finally {await host.close();rmSync(root,{recursive:true,force:true});}
});

test("authoring: scaffold, nonexecuting validation, attach, invoke and fresh reload", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-authoring-"));
  const documents = path.join(root, "documents"); mkdirSync(documents);
  const authoringDirectory = path.join(root, "data", "plugins"), id = "local.greeting", directory = path.join(authoringDirectory, id);
  const access = new RootAccess([documents]);
  const host = new PluginHost(path.join(root, "state.json"), { access, authoringDirectory });
  const activity: any[] = [];
  const scope = { folders: null, access, permissionMode: "opened-folders" };
  try {
    const created = await executePluginTool(host, { action: "scaffold", id }, e => activity.push(e), scope);
    assert.equal(created.activity.outcome, "success");
    assert.ok("result" in created);
    assert.equal((created.result as any).directory, canonicalFilePath(directory));
    await assert.rejects(host.invoke("scaffold", { id }), /EEXIST/);
    const entry = path.join(directory, "host.mjs"), source = readFileSync(entry, "utf8");
    assert.equal(JSON.parse(readFileSync(path.join(directory,"litzio-plugin.json"),"utf8")).screen,"screen.jsx");
    assert.match(source, /import .* from ['"]@litzio\/plugin-sdk['"]/);
    // Even an artifact-local SDK must never replace the Host's public runtime.
    const localSdk = path.join(directory, "node_modules/@litzio/plugin-sdk");
    mkdirSync(localSdk, { recursive: true });
    writeFileSync(path.join(localSdk, "package.json"), JSON.stringify({ type: "module", exports: "./index.js" }));
    writeFileSync(path.join(localSdk, "index.js"), 'throw new Error("Artifact SDK must not load");');

    await assert.rejects(host.invoke("scaffold", { directory, id }));
    assert.equal(readFileSync(entry, "utf8"), source);
    const validate = () => host.invoke("validate", { directory }) as Promise<any>;
    assert.equal((await validate()).valid, true);
    const marker = path.join(root, "executed");
    writeFileSync(entry, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'bad');\n` + source);
    assert.equal((await validate()).valid, true); assert.equal(existsSync(marker), false);
    writeFileSync(entry, source.replace('greet:', 'undeclared:'));
    const invalid = await executePluginTool(host, { action: "validate", directory }, e => activity.push(e));
    assert.equal(invalid.activity.outcome, "failure");
    assert.match(JSON.stringify(invalid), /Missing handler/);
    writeFileSync(entry, source.replace('greeting:"Hello, "+name+"!"', 'greeting:42'));
    assert.match(JSON.stringify(await validate()), /Output schema mismatch/);
    const manifestFile = path.join(directory, "litzio-plugin.json"), manifest = readFileSync(manifestFile, "utf8");
    writeFileSync(manifestFile, manifest.replace('"type": "string"', '"type": "invalid"'));
    assert.equal((await validate()).valid, false);

    writeFileSync(manifestFile, JSON.stringify({...JSON.parse(manifest),requiresSdk:"999.0.0"}));
    assert.equal((await validate()).valid, false);
    await assert.rejects(host.invoke("register", { directory }));
    // An unchanged pre-0.2 scaffold's exact requirement remains executable.
    writeFileSync(manifestFile, manifest); writeFileSync(entry, source);
    await executePluginTool(host, { action: "register", directory }, e => activity.push(e));
    assert.deepEqual(activity.at(-1), { action: "register", id, outcome: "success" });
    const trust = async () => host.invoke("trust", { id, registrationId: (await host.list())[0]!.registrationId });
    await trust(); await host.invoke("enable", { id });
    assert.deepEqual((await host.invokeOperation(`${id}.greet`, { name: "World" })).result, { greeting: "Hello, World!" });
    writeFileSync(entry, source.replace('Hello, ', 'Welcome, '));
    assert.equal((await validate()).valid, true);
    await trust(); await host.invoke("reload", { id });
    assert.deepEqual((await host.invokeOperation(`${id}.greet`, { name: "World" })).result, { greeting: "Welcome, World!" });
    // Internal package imports fail even if an artifact supplies a matching package.
    const internal = path.join(directory, "node_modules/@litzio/core");
    mkdirSync(internal, { recursive: true });
    writeFileSync(path.join(internal, "package.json"), JSON.stringify({ type: "module", exports: "./index.js" }));
    writeFileSync(path.join(internal, "index.js"), 'export const forbidden = true;');
    writeFileSync(entry, 'import "@litzio/core";\n' + source);
    await trust(); await assert.rejects(host.invoke("reload", { id }), /request failed/);
    assert.equal(existsSync(marker), false);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});


import { createPluginService } from "../server/plugin-service.ts";
import { pluginCli } from "../../../packages/cli/src/plugins.ts";
import { DAEMON_PROTOCOL } from "../shared/daemon-version.ts";

test("Host SDK runtime is one self-contained JavaScript module with only Node builtin imports", async () => {
  const { buildSdkRuntime } = await import("../../../packages/cli/scripts/plugin-sdk.ts");
  const { isBuiltin } = await import("node:module");
  const result = await buildSdkRuntime();
  assert.equal(result.outputFiles!.length, 1, "SDK must not emit shared chunks");
  for (const output of Object.values(result.metafile.outputs)) {
    for (const dependency of output.imports) {
      assert.ok(dependency.external && isBuiltin(dependency.path), `SDK must be self-contained: ${dependency.path}`);
    }
  }
  const runtime = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles![0]!.contents).toString("base64")}`);
  assert.equal(runtime.SDK_VERSION, "0.5.0");
  assert.equal(JSON.parse(readFileSync(new URL("../../../packages/plugin-sdk/package.json", import.meta.url), "utf8")).version, runtime.SDK_VERSION);
  assert.equal(typeof runtime.PluginOperationError, "function");
});

test("runtime import boundary checks resolved real paths, including aliases into the Host checkout", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-import-boundary-"));
  const host = new PluginHost(path.join(root, "state.json")), id = "fixture.imports";
  const source = `import { SDK_VERSION } from '@litzio/plugin-sdk';
import {basename} from 'node:path'; import {message} from './local.js'; import {value} from 'fixture-dependency';
export function activate(){return {operations:{},status:()=>({available:true,message:[SDK_VERSION,basename('okay'),message,value].join('/')}),dispose(){}}}`;
  // A legitimate artifact can itself live under the checkout boundary.
  const checkoutTmp = fileURLToPath(new URL("../../../tmp/", import.meta.url));
  mkdirSync(checkoutTmp, { recursive: true });
  const checkoutScratch = mkdtempSync(path.join(checkoutTmp, "import-boundary-"));
  const directory = lifecycleFixture(checkoutScratch, id, source), entry = path.join(directory, "host.js");
  const target = fileURLToPath(new URL("../../../packages/core/src/label.ts", import.meta.url));
  try {
    writeFileSync(path.join(directory, "local.js"), "export const message = 'local';");
    const dependency = path.join(directory, "node_modules/fixture-dependency");
    mkdirSync(dependency, { recursive: true });
    writeFileSync(path.join(dependency, "package.json"), JSON.stringify({ type: "module", exports: "./index.js" }));
    writeFileSync(path.join(dependency, "index.js"), "export const value = 'dependency';");
    await host.invoke("register", { directory });
    const trust = async () => host.invoke("trust", { id, registrationId: (await host.list())[0]!.registrationId });
    await trust(); await host.invoke("enable", { id });
    assert.match((await host.list())[0]!.status!.message, /okay\/local\/dependency$/);
    // Keep the link outside the artifact: artifact admission independently rejects links.
    // This reaches the runtime resolver and proves that realpath, not lexical path, is checked.
    const alias = path.join(root, "host-source-alias");
    symlinkSync(path.dirname(target), alias, process.platform === "win32" ? "junction" : "dir");
    const attempts = [
      path.relative(directory, target).replaceAll("\\", "/"),
      pathToFileURL(target).href,
      pathToFileURL(path.join(alias, "label.ts")).href,
      path.relative(directory, path.join(alias, "label.ts")).replaceAll("\\", "/"),
      ...(process.platform === "win32" ? [pathToFileURL(target.toUpperCase()).href] : []),
    ];
    for (const specifier of attempts) {
      writeFileSync(entry, `import ${JSON.stringify(specifier)};\n` + source);
      await trust();
      await assert.rejects(host.invoke("reload", { id }), /request failed/, specifier);
      assert.equal((await host.list())[0]!.running, false);
    }
    writeFileSync(entry, `import {createRequire} from 'node:module'; createRequire(import.meta.url)(${JSON.stringify(target)});\n` + source);
    await trust(); await assert.rejects(host.invoke("reload", { id }), /request failed/);
    // Restore the ordinary SDK + artifact + dependency imports after all refusals.
    writeFileSync(entry, source); await trust(); await host.invoke("reload", { id });
    assert.match((await host.list())[0]!.status!.message, /okay\/local\/dependency$/);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); rmSync(checkoutScratch, { recursive: true, force: true }); }
});

test("scaffold enforces Host roots and the active assistant turn write scope before creation", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-scaffold-access-"));
  const allowed = path.join(root, "allowed"), opened = path.join(allowed, "opened");
  mkdirSync(allowed); mkdirSync(opened);
  const access = new RootAccess([allowed]);
  const assistant = createPluginService(access, path.join(root, "plugins.json"));
  const authoringDirectory = path.join(root, "data", "plugins");
  const host = new PluginHost(path.join(root, "turn-plugins.json"), { access, authoringDirectory });
  const scope = { access, folders: new RootAccess([opened]), permissionMode: "opened-folders" };
  const activities: unknown[] = [];
  try {
    const outside = path.join(root, "outside");
    await assert.rejects(assistant.invoke("pluginsManage", { action: "scaffold", directory: outside, id: "local.outside" }), /outside/);
    assert.equal(existsSync(outside), false);
    const attempt = async (directory: string, turnScope: typeof scope | undefined) => {
      const result = await executePluginTool(host, { action: "scaffold", directory, id: "local.scope" }, e => activities.push(e), turnScope);
      assert.equal(result.activity.outcome, "failure"); assert.equal(existsSync(directory), false);
    };
    await attempt(path.join(allowed, "not-opened"), scope);
    await attempt(path.join(opened, "readonly"), { ...scope, permissionMode: "read-only" });
    await attempt(path.join(opened, "no-scope"), undefined);
    await attempt(outside, { ...scope, permissionMode: "full-access" });
    for (const turnScope of [undefined, { ...scope, folders: null, permissionMode: "read-only" }, { ...scope, folders: null, permissionMode: "full-access" }]) {
      const denied = await executePluginTool(host, { action: "scaffold", id: "local.denied" }, () => {}, turnScope);
      assert.equal(denied.activity.outcome, "failure");
      assert.equal(existsSync(path.join(authoringDirectory, "local.denied")), false);
    }
    const defaultResult = await executePluginTool(host, { action: "scaffold", id: "local.default" }, () => {}, scope);
    assert.equal(defaultResult.activity.outcome, "success");
    assert.ok("result" in defaultResult);
    assert.equal((defaultResult.result as any).directory, canonicalFilePath(path.join(authoringDirectory, "local.default")));
    await assert.rejects(host.invoke("scaffold", { directory: path.join(authoringDirectory, "explicit"), id: "local.explicit" }), /outside/);

    const directory = path.join(opened, "valid");
    const result = await executePluginTool(host, { action: "scaffold", directory, id: "local.valid" }, e => activities.push(e), scope);
    assert.equal(result.activity.outcome, "success"); assert.equal(existsSync(path.join(directory, "host.mjs")), true);
  } finally { await assistant.close(); await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("default scaffold rejects an existing plugins junction before writing outside its directory", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-authoring-junction-"));
  const data = path.join(root, "data"), outside = path.join(root, "outside"), documents = path.join(root, "documents");
  for (const directory of [data, outside, documents]) mkdirSync(directory);
  const directory = path.join(data, "plugins"), id = "local.escape";
  t.after(() => {
    // Only exact fixture files and empty directories; never traverse a junction for cleanup.
    if (existsSync(directory)) rmSync(directory);
    for (const target of [data, outside]) {
      const artifact = path.join(target, id);
      if (existsSync(artifact)) {
        for (const file of ["litzio-plugin.json", "host.mjs", "screen.jsx"]) rmSync(path.join(artifact, file));
        rmdirSync(artifact);
      }
    }
    for (const folder of [documents, outside, data, root]) rmdirSync(folder);
  });
  const access = new RootAccess([documents]);
  for (const target of [data, outside]) {
    symlinkSync(target, directory, process.platform === "win32" ? "junction" : "dir");
    const host = new PluginHost(path.join(root, "state.json"), { access, authoringDirectory: directory });
    try {
      const result = await executePluginTool(host, { action: "scaffold", id }, () => {}, { access, folders: null, permissionMode: "opened-folders" });
      assert.equal(result.activity.outcome, "failure");
      assert.equal(existsSync(path.join(target, id)), false);
      await assert.rejects(host.invoke("scaffold", { id }), /link/);
    } finally { await host.close(); rmSync(directory); }
  }
  mkdirSync(directory);
  const leaf = path.join(directory, id);
  symlinkSync(outside, leaf, process.platform === "win32" ? "junction" : "dir");
  const host = new PluginHost(path.join(root, "state.json"), { access, authoringDirectory: directory });
  try {
    await assert.rejects(host.invoke("scaffold", { id }), /outside/);
    assert.equal(existsSync(path.join(outside, "host.mjs")), false);
  } finally { await host.close(); rmSync(leaf); rmdirSync(directory); }
});

test("authoring refuses deterministic junction replacements between checking and use", async t => {
  for (const phase of ["sandbox-stat", "root-adoption", "after-mkdir", "after-write"]) await t.test(phase, async t => {
    const root = canonicalFilePath(mkdtempSync(path.join(os.tmpdir(), "litzio-authoring-swap-")));
    const data = path.join(root, "data"), plugins = path.join(data, "plugins"), templates = path.join(data, "templates"), outside = path.join(root, "outside");
    for (const folder of [data, plugins, templates, outside]) mkdirSync(folder);
    const id = "local.swap", artifact = path.join(plugins, id), held = path.join(root, "held");
    const host = new PluginHost(path.join(root, "state.json"), { authoringDirectory: plugins });
    let swapped = false, rootReads = 0;
    const swap = (directory: string, target: string) => {
      fs.renameSync(directory, held);
      symlinkSync(target, directory, process.platform === "win32" ? "junction" : "dir");
      swapped = true;
    };
    const lstat = fs.lstatSync, realpath = process.platform === "win32" ? fs.realpathSync.native : fs.realpathSync, mkdir = fs.mkdirSync, write = fs.writeFileSync;
    const adoptRoot = (...args: any[]) => {
      // The first two plugin realpath reads are prechecks; the third adopts RootAccess.
      if (args[0] === plugins && ++rootReads === 3 && !swapped) swap(plugins, outside);
      return Reflect.apply(realpath, fs, args);
    };
    const replacement = phase === "sandbox-stat" ? t.mock.method(fs, "lstatSync", ((...args: any[]) => {
      const stat = Reflect.apply(lstat, fs, args);
      if (args[0] === plugins && !swapped) swap(plugins, templates);
      return stat;
    }) as typeof fs.lstatSync) : phase === "root-adoption" ? process.platform === "win32"
      ? t.mock.method(fs.realpathSync, "native", adoptRoot as typeof fs.realpathSync.native)
      : t.mock.method(fs, "realpathSync", adoptRoot as typeof fs.realpathSync)
    : phase === "after-mkdir" ? t.mock.method(fs, "mkdirSync", ((...args: any[]) => {
      const result = Reflect.apply(mkdir, fs, args);
      if (args[0] === artifact && !swapped) swap(artifact, outside);
      return result;
    }) as typeof fs.mkdirSync) : t.mock.method(fs, "writeFileSync", ((...args: any[]) => {
      const result = Reflect.apply(write, fs, args);
      if (path.dirname(String(args[0])) === artifact && !swapped) swap(artifact, outside);
      return result;
    }) as typeof fs.writeFileSync);
    syncBuiltinESMExports();
    try {
      if (phase === "sandbox-stat") assert.equal(host.authoringPath(), undefined);
      else await assert.rejects(host.invoke("scaffold", { id }));
      assert.equal(swapped, true, "the real directory must be replaced at the intended boundary");
      assert.equal(existsSync(path.join(outside, "host.mjs")), false);
      assert.equal(existsSync(path.join(outside, id, "host.mjs")), false);
      if (phase === "after-write") assert.equal(existsSync(path.join(held, "litzio-plugin.json")), true, "failure must leave the created file for inspection");
    } finally {
      replacement.mock.restore(); syncBuiltinESMExports(); await host.close();
      // Remove only this fixture's links, known files and empty directories.
      const link = phase === "sandbox-stat" || phase === "root-adoption" ? plugins : artifact;
      if (swapped) rmSync(link);
      for (const folder of [path.join(outside, id), outside, held, artifact]) {
        if (!existsSync(folder)) continue;
        for (const file of ["litzio-plugin.json", "host.mjs", "screen.jsx"]) {
          const target = path.join(folder, file); if (existsSync(target)) rmSync(target);
        }
        rmdirSync(folder);
      }
      for (const folder of [plugins, templates, data, root]) if (existsSync(folder)) rmdirSync(folder);
    }
  });
});

test("authoring aliases share canonical validation/install paths and retain write scope", async t => {
  const root = canonicalFilePath(mkdtempSync(path.join(os.tmpdir(), "litzio-authoring-parent-")));
  const data = path.join(root, "real-data"), alias = path.join(root, "data-alias"), documents = path.join(root, "documents");
  mkdirSync(data); mkdirSync(documents);
  symlinkSync(data, alias, process.platform === "win32" ? "junction" : "dir");
  const configured = path.join(process.platform === "win32" ? alias.toUpperCase() : alias, "plugins");
  const expected = path.join(canonicalFilePath(data), "plugins"), id = "local.alias", artifact = path.join(expected, id);
  const access = new RootAccess([documents]);
  const host = new PluginHost(path.join(root, "state.json"), { access, authoringDirectory: configured });
  t.after(async () => {
    await host.close(); rmSync(alias);
    if (existsSync(artifact)) {
      for (const file of ["litzio-plugin.json", "host.mjs", "screen.jsx"]) rmSync(path.join(artifact, file));
      rmdirSync(artifact);
    }
    if (existsSync(expected)) rmdirSync(expected);
    if (existsSync(path.join(root, "state.json"))) rmSync(path.join(root, "state.json"));
    for (const folder of [documents, data, root]) rmdirSync(folder);
  });
  assert.equal(host.authoringPath(), expected);
  assert.equal(existsSync(expected), false);
  const created = await executePluginTool(host, { action: "scaffold", id }, () => {}, { access, folders: null, permissionMode: "opened-folders" });
  assert.equal(created.activity.outcome, "success"); assert.ok("result" in created);
  assert.equal((created.result as any).directory, artifact);
  for (const directory of [artifact, path.join(configured, id)]) {
    assert.equal((await host.invoke("validate", { directory }) as any).valid, true);
    const denied: any = await host.invoke("install", { directory }, access);
    assert.equal(denied.receipt.outcome, "failure");
    assert.equal(denied.errors[0].path, "directory");
    assert.equal(denied.errors[0].code, "outside_plugin_scope");
    const installed: any = await host.invoke("install", { directory });
    assert.equal(installed.receipt.outcome, "success", JSON.stringify(installed));
    assert.equal((await host.list())[0]!.running, true);
  }
});

test("read-only validation never creates a missing plugins directory or its data parent", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-authoring-readonly-"));
  const data = path.join(root, "missing-data"), directory = path.join(data, "plugins");
  const host = new PluginHost(path.join(root, "state.json"), { authoringDirectory: directory });
  t.after(async () => {
    await host.close();
    if (existsSync(directory)) rmdirSync(directory);
    if (existsSync(data)) rmdirSync(data);
    rmdirSync(root);
  });
  const result = await executePluginTool(host, { action: "validate", directory: path.join(directory, "missing") }, () => {}, { access: null, folders: null, permissionMode: "read-only" });
  assert.equal(result.activity.outcome, "failure");
  assert.ok("result" in result);
  assert.equal((result.result as any).errors[0].path, "directory");
  assert.match((result.result as any).errors[0].message, /existing plugin directory/);
  assert.equal(existsSync(directory), false);
  assert.equal(existsSync(data), false);
  mkdirSync(data);
  const existingData = await executePluginTool(host, { action: "validate", directory: path.join(directory, "missing") }, () => {}, { access: null, folders: null, permissionMode: "read-only" });
  assert.equal(existingData.activity.outcome, "failure");
  assert.equal(existsSync(directory), false);
});

test("validation diagnostics never expose source values through Host, assistant, CLI or logs", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-validation-redaction-"));
  const host = new PluginHost(path.join(root, "state.json"));
  const directory = path.join(root, "artifact"), secret = "SYNTHETIC_SECRET_MUST_NOT_ESCAPE_91";
  const captured: string[] = [];
  const stdout = t.mock.method(process.stdout, "write", ((value: string) => { captured.push(String(value)); return true; }) as typeof process.stdout.write);
  const stderr = t.mock.method(process.stderr, "write", ((value: string) => { captured.push(String(value)); return true; }) as typeof process.stderr.write);
  t.mock.method(globalThis, "fetch", async (url: URL, init?: RequestInit) => {
    if (url.pathname === "/daemon/health") return new Response(JSON.stringify({ protocolVersion: DAEMON_PROTOCOL }));
    const { action, ...args } = JSON.parse(init!.body as string);
    return new Response(JSON.stringify(await host.invoke(action, args)));
  });
  try {
    await host.invoke("scaffold", { directory, id: "local.redaction" });
    const manifest = readFileSync(path.join(directory, "litzio-plugin.json"), "utf8");
    const source = readFileSync(path.join(directory, "host.mjs"), "utf8");
    const activities: unknown[] = [];
    const check = async (file: string) => {
      const result: any = await host.invoke("validate", { directory });
      assert.equal(result.valid, false); assert.ok(result.errors.length);
      assert.equal(result.errors[0].file, file);
      assert.ok(Object.hasOwn(result.errors[0], "line")); assert.ok(Object.hasOwn(result.errors[0], "column"));
      assert.equal(JSON.stringify(result).includes(secret), false);
      const tool = await executePluginTool(host, { action: "validate", directory }, e => activities.push(e));
      assert.equal(tool.activity.outcome, "failure"); assert.equal(JSON.stringify(tool).includes(secret), false);
      assert.deepEqual((tool as any).result.errors, result.errors);
      assert.equal(await pluginCli(["plugins", "validate", directory, "--host", "http://127.0.0.1:5180", "--json"]), 1);
      assert.deepEqual(JSON.parse(captured.at(-1)!).errors, result.errors);
      assert.equal(captured.join("").includes(secret), false); assert.equal(JSON.stringify(activities).includes(secret), false);
    };
    await host.invoke("register", { directory });
    const manifestPath = path.join(directory, "litzio-plugin.json");
    const invalid = JSON.parse(manifest);
    delete invalid.name;
    writeFileSync(manifestPath, JSON.stringify(invalid));
    await check("litzio-plugin.json");
    const diagnostics: any = await host.invoke("validate", { directory });
    assert.deepEqual((await host.list())[0]!.errors, diagnostics.errors);
    assert.ok(diagnostics.errors.some((e: any) => e.path === "name" && e.code === "invalid_type" && /string/.test(e.message)));
    writeFileSync(path.join(directory, "litzio-plugin.json"), `{ "token": "${secret}", broken }`);
    await check("litzio-plugin.json");
    const syntax: any = await host.invoke("validate", { directory });
    assert.equal(syntax.errors[0].path, "$");
    assert.match(syntax.errors[0].message, /Invalid syntax/);
    assert.equal(syntax.errors[0].line, 1);
    assert.ok(syntax.errors[0].column > 1);
    writeFileSync(path.join(directory, "litzio-plugin.json"), manifest);
    writeFileSync(path.join(directory, "host.mjs"), `const ${secret} = ;`);
    await check("host entry");
    writeFileSync(path.join(directory, "host.mjs"), source.replace("greet:", `"${secret}":`));
    await check("host entry");
  } finally { stdout.mock.restore(); stderr.mock.restore(); await host.close(); rmSync(root, { recursive: true, force: true }); }
});


test("short secrets preserve keys and leave the plugin scope on replacement, deletion and unregister", async () => {
  const { assertNoPluginSecrets, safePluginValue } = await import("../server/plugins/secret-redaction.ts");
  assert.deepEqual(safePluginValue({ id: "id", defaultCandidate: ["secret-long", "a.b"] }, ["id", "secret", "secret-long", "a.b"]), { id: "[secret]", defaultCandidate: ["[secret]", "[secret]"] });
  // Keep key names intact, but refuse publication if a key or non-string scalar
  // still contains an actual secret, including characters escaped in JSON text.
  for (const [value, secret] of [[{ id: "safe" }, "id"], [{ outer: [{ 'quoted"key': "safe" }] }, 'quoted"key'], [[123], "123"], [true, "true"], [null, "null"]] as const)
    assert.throws(() => assertNoPluginSecrets(safePluginValue(value, [secret]), [secret]), /Plugin result contains a secret/);
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-redaction-scope-")), values = new Map<string, string>();
  const store = { supported: true, async read(p: string, n: string) { return values.get(`${p}/${n}`); }, async status(p: string, n: string) { return values.has(`${p}/${n}`); }, async set(p: string, n: string, v: string) { values.set(`${p}/${n}`, v); }, async delete(p: string, n?: string) { for (const key of values.keys()) if (n ? key === `${p}/${n}` : key.startsWith(`${p}/`)) values.delete(key); } };
  const host = new PluginHost(path.join(root, "state.json"), { secrets: store });
  try {
    const dirs: string[] = [];
    for (const id of ["fixture.a", "fixture.b"]) {
      const directory = lifecycleFixture(root, id, `export function activate(){return {operations:{read:input=>{if(input.fail)throw Error('raw-log-private');return {id:input.value,defaultCandidate:true}}},status:()=>({available:true,message:'id'}),dispose(){}}}`);
      dirs.push(directory);
      const file = path.join(directory, "litzio-plugin.json"), m = JSON.parse(readFileSync(file, "utf8"));

      m.secrets = [{ id: "pat", title: "Access token", scope: "connection", required: false }, { id: "other", title: "Access token", scope: "connection", required: false }];
      m.operations = [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: {}, outputSchema: { type: "object", required: ["id", "defaultCandidate"], additionalProperties: false, properties: { id: { type: "string" }, defaultCandidate: { type: "boolean" } } } }];
      writeFileSync(file, JSON.stringify(m));
      await host.invoke("register", { directory });
      await host.invoke("trust", { id, registrationId: (await host.list()).find(p => p.id === id)!.registrationId });
    }
    await host.setSecret("fixture.a", "pat", "id"); await host.setSecret("fixture.a", "other", "raw-log-private");
    await host.invoke("enable", { id: "fixture.a" }); await host.invoke("enable", { id: "fixture.b" });
    const check = async (id: string, value: string, expected: string) => assert.deepEqual((await host.invokeOperation(`${id}.read`, { value })).result, { id: expected, defaultCandidate: true });
    await check("fixture.a", "id", "[secret]"); await check("fixture.b", "id", "id");
    assert.equal((await host.list()).find(p => p.id === "fixture.a")!.status!.message, "[secret]");
    await check("fixture.a", "raw-log-private", "[secret]");
    const activities: unknown[] = [];
    const tool = await executePluginTool(host, { action: "list" }, e => activities.push(e));
    const failure = await host.invokeOperation("fixture.a.read", { fail: true });
    assert.equal(JSON.stringify(failure).includes("raw-log-private"), false);
    assert.equal(JSON.stringify([tool, activities]).includes("raw-log-private"), false);
    await host.invoke("disable", { id: "fixture.a" }); await host.setSecret("fixture.a", "pat", "replacement"); await host.invoke("enable", { id: "fixture.a" });
    await check("fixture.a", "id", "id");
    await host.invoke("disable", { id: "fixture.a" }); await host.invoke("secret-delete", { id: "fixture.a", name: "pat" }); await host.invoke("enable", { id: "fixture.a" });
    await check("fixture.a", "replacement", "replacement");
    await host.invoke("unregister", { id: "fixture.a" });
    await host.invoke("register", { directory: dirs[0] }); await host.invoke("trust", { id: "fixture.a", registrationId: (await host.list()).find(p => p.id === "fixture.a")!.registrationId }); await host.invoke("enable", { id: "fixture.a" });
    await check("fixture.a", "raw-log-private", "raw-log-private");
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

// Host policy combinations belong here; browser coverage owns the folder picker and toggle wiring.

test("plugin service shutdown waits for startup and confirms the started child exits once", async t => {
  const { createPluginService } = await import("../server/plugin-service.ts");
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-start-close-"));
  const file = path.join(root, "state.json");
  const directory = lifecycleFixture(root, "fixture.start", `export function activate(){return {operations:{},status:()=>({available:true,message:String(process.pid)}),dispose(){}}}`);
  const seed = new PluginHost(file, {  });
  try {
    await seed.invoke("register", { directory });
    await seed.invoke("trust", { id: "fixture.start", registrationId: (await seed.list())[0]!.registrationId });
    await seed.invoke("enable", { id: "fixture.start" });
  } finally { await seed.close(); }
  const service = createPluginService(null, file);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const start = service.host.start.bind(service.host);
  t.mock.method(service.host, "start", async () => { await start(); entered(); await gate; });
  const cleanup = t.mock.method(service.host, "close", service.host.close.bind(service.host));
  t.after(async () => { release(); await service.close(); rmSync(root, { recursive: true, force: true }); });
  const starting = service.start();
  await waiting;
  const pid = Number((await service.host.list()).find(plugin => plugin.id === "fixture.start")!.status!.message);
  assert.ok(pid > 0); assert.doesNotThrow(() => process.kill(pid, 0));
  let closed = false;
  const closing = service.close();
  void closing.then(() => { closed = true; });
  assert.equal(service.close(), closing);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, false, "startup owns its resources until it settles");
  await assert.rejects(service.start(), /closing/);
  release(); await starting; await closing;
  await service.close();
  assert.equal(cleanup.mock.callCount(), 1);
  assert.throws(() => process.kill(pid, 0), "shutdown confirms the exact child has exited");
});

test("health check publication enforces the SDK result even with a permissive plugin schema", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-health-"));
  const host = new PluginHost(path.join(root, "state.json"), {  });
  try {
    const directory = lifecycleFixture(root, "fixture.health", `export function activate(c){return {operations:{connection:()=>c.settings.invalid ? {ok:true,message:'fixed',raw:'private service response'} : {ok:false,message:'Service unavailable'}},status:()=>({available:true,message:'ready'}),dispose(){}}}`);
    const file = path.join(directory, "litzio-plugin.json"), manifest = JSON.parse(readFileSync(file, "utf8"));

    manifest.settingsSchema = { type: "object", properties: { invalid: { type: "boolean" } } };
    Object.assign(manifest,{ healthCheck: "connection", operations: [{ id: "connection", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "object" } }] });
    writeFileSync(file, JSON.stringify(manifest));
    await host.invoke("register", { directory });
    await host.invoke("trust", { id: manifest.id, registrationId: (await host.list())[0]!.registrationId });
    await host.invoke("enable", { id: manifest.id });
    const valid = await host.invokeOperation("fixture.health.connection", {});
    assert.deepEqual(valid.result, { ok: false, message: "Service unavailable" });
    assert.equal(valid.receipt.outcome, "success");
    await host.invoke("settings", { id: manifest.id, settings: { invalid: true } });
    const invalid = await host.invokeOperation("fixture.health.connection", {});
    assert.equal(invalid.receipt.outcome, "failure");
    assert.equal(invalid.result, undefined);
    assert.ok(!JSON.stringify(invalid).includes("private service response"));
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("registered icons enforce image bounds, artifact links and digest trust", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-icons-")), host = new PluginHost(path.join(root, "state.json"));
  try {
    const directory = lifecycleFixture(root, "fixture.icon");
    const manifestFile = path.join(directory, "litzio-plugin.json"), icon = path.join(directory, "icon.svg");
    const manifest = { ...JSON.parse(readFileSync(manifestFile, "utf8")), icon: "icon.svg" };
    writeFileSync(manifestFile, JSON.stringify(manifest));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="blue"/></svg>';
    for (const invalid of [svg.replace('width="16"', 'width="257"'), svg.replace('height="16"', 'height="0"'), '<html/>', svg + ' '.repeat(65536), '<svg']) {
      writeFileSync(icon, invalid); await assert.rejects(host.invoke("register", { directory }));
    }
    writeFileSync(icon, svg);
    await host.invoke("register", { directory });
    const digest = (await host.list())[0]!.digest!;
    assert.throws(() => host.icon(manifest.id, digest), /unavailable/);
    await host.invoke("trust", { id: manifest.id, registrationId: (await host.list())[0]!.registrationId, digest });
    assert.equal(host.icon(manifest.id, digest).mime, "image/svg+xml");
    assert.equal(host.icon(manifest.id, digest).bytes.toString(), svg);
    writeFileSync(icon, svg.replace('blue', 'red'));
    assert.throws(() => host.icon(manifest.id, digest), /unavailable/);
    const updatedDigest = (await host.list())[0]!.digest!;
    assert.equal((await host.list())[0]!.iconDigest, updatedDigest);
    assert.equal(host.icon(manifest.id, updatedDigest).mime, "image/svg+xml");
    rmSync(icon); const linked = path.join(directory, "linked");
    symlinkSync(directory, linked, "junction");
    await assert.rejects(host.invoke("register", { directory }), /linked/);
    rmSync(linked);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFYQAAAAASUVORK5CYII=", "base64");
    writeFileSync(manifestFile, JSON.stringify({ ...manifest, icon: "icon.png" }));
    writeFileSync(path.join(directory, "icon.png"), png); await host.invoke("register", { directory });
    png.writeUInt32BE(257, 16); writeFileSync(path.join(directory, "icon.png"), png);
    await assert.rejects(host.invoke("register", { directory }), /dimensions/);
    writeFileSync(path.join(directory, "icon.png"), "not png"); await assert.rejects(host.invoke("register", { directory }), /PNG/);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});




test("registration trust survives updates and restart, but not removal", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-registration-trust-"));
  const file = path.join(root, "state.json");
  let host = new PluginHost(file, { });
  try {
    const directory = lifecycleFixture(root, "fixture.trust"), id = "fixture.trust";
    await host.invoke("register", { directory });
    const originalRegistration = (await host.list())[0]!.registrationId;
    assert.equal((await host.list())[0]!.trusted, false);
    await assert.rejects(host.invoke("enable", { id }), /trust/);
    assert.equal((await host.list())[0]!.trusted, false);
    await host.invoke("enable", { id, registrationId: (await host.list())[0]!.registrationId, trust: true });
    assert.equal((await host.list())[0]!.trusted, true);
    assert.equal((await host.list())[0]!.running, true);
    writeFileSync(path.join(directory, "update.txt"), "updated");
    assert.equal((await host.list())[0]!.trusted, true);
    await host.invoke("reload", { id });
    await host.close(); host = new PluginHost(file, { });
    await host.start();
    assert.equal((await host.list())[0]!.running, true);
    assert.equal((await host.list())[0]!.registrationId, originalRegistration);
    await host.invoke("unregister", { id });
    await host.invoke("register", { directory });
    const approval = (await host.list())[0]!;
    assert.equal(approval.trusted, false);
    await host.invoke("unregister", { id });
    await host.invoke("register", { directory });
    assert.equal((await host.list())[0]!.trusted, false);
    await assert.rejects(host.invoke("enable", { id }), /trust/);
    const replacement = (await host.list())[0]!;
    assert.notEqual(replacement.registrationId, approval.registrationId);
    assert.equal(replacement.digest, approval.digest, "identical bytes still belong to a new registration");
    const unchanged = readFileSync(file, "utf8");
    for (const action of ["trust", "enable"]) {
      await assert.rejects(host.invoke(action, { id, registrationId: approval.registrationId, ...(action === "enable" ? { trust: true } : {}) }), /registration changed/i);
      assert.equal(readFileSync(file, "utf8"), unchanged);
    }
    await assert.rejects(host.invoke("enable", { id, trust: true }), /registration changed/i);
    assert.equal((await host.list())[0]!.trusted, false);
    assert.equal((await host.list())[0]!.running, false);
    await host.invoke("trust", { id, registrationId: (await host.list())[0]!.registrationId });
    const beforeReplacement = (await host.list())[0]!;
    const other = path.join(root, "other"); mkdirSync(other);
    const replacementDirectory = lifecycleFixture(other, id);
    await host.invoke("register", { directory: replacementDirectory });
    await assert.rejects(host.invoke("enable", { id, registrationId: beforeReplacement.registrationId, trust: true }), /registration changed/i);
    assert.equal((await host.list())[0]!.trusted, false);
    const fresh = (await host.list())[0]!;
    await host.invoke("enable", { id, registrationId: fresh.registrationId, trust: true });
    assert.equal((await host.list())[0]!.running, true);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});



// Supply/trust policy is exercised here; HTTP browser coverage owns the confirmation UI.








test("screen code is active-only, reloads local JSX, reports compiler failures and accepts arbitrary JSON", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-screen-code-"));
  const host = new PluginHost(path.join(root, "state.json"), { });
  try {
    const { scaffoldPlugin } = await import("../server/plugins/plugin-authoring.ts");
    const directory = path.join(root, "plugin"); scaffoldPlugin(directory, "fixture.screen", undefined, undefined, "screen");
    const otherDrive = process.platform === "win32" ? ["C:", "D:"].map(drive => drive + path.sep).find(drive => drive.toLowerCase() !== path.parse(root).root.toLowerCase() && existsSync(drive)) : undefined;
    if (otherDrive) {
      const { compileScreen } = await import("../server/plugins/screen-code.ts");
      const outside = mkdtempSync(path.join(otherDrive, "litzio-screen-boundary-"));
      const external = path.join(outside, "outside.jsx");
      writeFileSync(external, 'export default function Screen(){return "outside-drive-marker"}');
      assert.throws(() => compileScreen(directory, external), /inside plugin folder/);
      writeFileSync(path.join(directory, "screen.jsx"), `export {default} from ${JSON.stringify(external.replaceAll("\\", "/"))};`);
      assert.throws(() => compileScreen(directory, "screen.jsx"), /local plugin files/);
    }

    writeFileSync(path.join(directory, "part.jsx"), 'export const label = "First";');
    writeFileSync(path.join(directory, "screen.jsx"), 'import {label} from "./part.jsx"; export default function Screen(){return <div>{label}</div>}');
    await host.start(); await host.invoke("register", { directory });
    assert.deepEqual(host.viewScreens(), []);
    await host.invoke("trust", { id: "fixture.screen", registrationId: (await host.list())[0]!.registrationId });
    await host.invoke("enable", { id: "fixture.screen" });
    const first = host.viewScreens()[0]!; assert.match(first.code!, /First/);
    assert.equal(host.viewScreens(false)[0]!.code, undefined); assert.equal(host.viewScreens(false)[0]!.codeRevision, first.codeRevision);
    assert.deepEqual((await host.invoke("screen-invoke", {plugin:"fixture.screen",operation:"fixture.screen.measurements",input:{}}) as any).result, [10,18,12,24]);
    writeFileSync(path.join(directory, "part.jsx"), 'export const label = "Second";');
    await host.invoke("reload", { id: "fixture.screen" });
    assert.match(host.viewScreens()[0]!.code!, /Second/); assert.notEqual(host.viewScreens()[0]!.codeRevision, first.codeRevision);
    await host.invoke("disable", { id: "fixture.screen" }); assert.deepEqual(host.viewScreens(), []);
    writeFileSync(path.join(directory, "screen.jsx"), 'export default function Screen(){return <div>}');
    const validation: any = await host.invoke("validate", { directory });
    assert.equal(validation.valid, false); assert.equal(validation.errors[0].file, "screen.jsx"); assert.ok(validation.errors[0].line);
    await assert.rejects(host.invoke("reload", { id: "fixture.screen" }), /screen.jsx/);
    assert.deepEqual(host.viewScreens(), []); assert.match((await host.list())[0]!.error!, /screen.jsx/);
  } finally { await host.close(); }
});


test("screen dependency bundle stays offline and shares the app React instance", async () => {
  const { bundleScreens, compileScreen } = await import("../server/plugins/screen-code.ts");
  const React = await import("react"); const { renderToString } = await import("react-dom/server");
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-screen-bundle-"));
  writeCodePluginManifest(root,{contributes:{screens:[{entry:"screen.jsx"}]}});
  const library = path.join(root, "node_modules", "fixture-chart"); mkdirSync(library, {recursive:true});
  writeFileSync(path.join(library, "package.json"), JSON.stringify({name:"fixture-chart",main:"index.js",type:"module"}));
  writeFileSync(path.join(library, "index.js"), 'import React from "react"; export function Chart(){const [x]=React.useState(24);return React.createElement("output",null,x)}');
  writeFileSync(path.join(root,"screen.jsx"),'import {Chart} from "fixture-chart"; export default function Screen(){return <Chart/>}');
  assert.throws(()=>compileScreen(root,"screen.jsx"), /npm packages/);
  const result = bundleScreens(root); assert.ok(result.files[0]!.bytes > 0);
  fs.renameSync(path.join(root,"node_modules"),path.join(root,"authoring-dependencies"));
  const code=compileScreen(root,"screen.jsx");
  const module=await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  assert.equal(renderToString(React.createElement(module.default(React))),"<output>24</output>");
});


test("install uses authoring ID in opened folders, repeats edits and refuses private CLI calls", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-install-"));
  const host = new PluginHost(path.join(root, "state.json"), { authoringDirectory: path.join(root, "plugins") });
  const scope = { folders: new RootAccess([root]), access: new RootAccess([root]), permissionMode: "opened-folders" };
  const id = "local.install";
  try {
    const created: any = await executePluginTool(host, {action:"scaffold",id,template:"screen"},()=>{},scope);
    assert.equal(created.error, undefined);
    const directory = created.result.directory;
    const entry = path.join(directory,"host.mjs");
    const manifestFile = path.join(directory,"litzio-plugin.json");
    const manifest = {...JSON.parse(readFileSync(manifestFile,"utf8")),icon:"icon.PNG"};
    writeFileSync(manifestFile,JSON.stringify({...manifest,icon:"icon.webp"}));
    writeFileSync(path.join(directory,"icon.webp"),Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA","base64"));
    for (const action of ["validate","install"]) {
      assert.equal((await host.invoke(action,{directory}) as any).receipt.outcome,"failure");
    }
    writeFileSync(manifestFile,JSON.stringify(manifest));
    writeFileSync(path.join(directory,manifest.icon),Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFYQAAAAASUVORK5CYII=","base64"));
    assert.equal(validateManifest(manifest).icon,"icon.PNG");
    assert.equal((await host.invoke("validate",{directory}) as any).valid,true);
    writeFileSync(entry,readFileSync(entry,"utf8").replace('message: "Ready"','message: String(process.pid)'));
    const installed: any = await executePluginTool(host,{action:"install",id},()=>{},scope);
    assert.equal(installed.error, undefined, JSON.stringify(installed));
    assert.equal((await host.list())[0]!.running, true);
    assert.equal(host.icon(id,(await host.list())[0]!.digest!).mime,"image/png");
    const first = host.viewScreens()[0]!.codeRevision;
    await assert.rejects(host.invokeOperation(`${id}.measurements`,{}), /unavailable/);
    await assert.rejects(host.invokeAssistantOperation(`${id}.measurements`,{}));
    assert.deepEqual((await host.invoke("screen-invoke",{plugin:id,operation:`${id}.measurements`,input:{}}) as any).result,[10,18,12,24]);
    await assert.rejects(host.invoke("screen-invoke",{plugin:"other",operation:`${id}.measurements`,input:{}}));
    writeFileSync(entry,readFileSync(entry,"utf8").replace("10, 18, 12, 24","20, 30"));
    writeFileSync(manifestFile,JSON.stringify({...manifest,icon:"icon.SVG"}));
    writeFileSync(path.join(directory,"icon.SVG"),'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>');
    assert.equal((await host.invoke("validate",{directory}) as any).valid,true);
    assert.equal((await host.invoke("install",{id}) as any).receipt.outcome,"success");
    assert.equal(host.icon(id,(await host.list())[0]!.digest!).mime,"image/svg+xml");
    assert.notEqual(host.viewScreens()[0]!.codeRevision,first);
    assert.deepEqual((await host.invoke("screen-invoke",{plugin:id,operation:`${id}.measurements`,input:{}}) as any).result,[20,30]);
    await host.invoke("scaffold",{id:"local.other",template:"screen"});
    assert.equal((await host.invoke("install",{id:"local.other"}) as any).receipt.outcome,"success");
    const workingSource = readFileSync(entry,"utf8");
    const beforeInstall = await host.list();
    const beforeScreens = host.viewScreens();
    const beforeState = readFileSync(path.join(root,"state.json"),"utf8");
    writeFileSync(entry,workingSource.replace("export function activate(context) {", "export function activate(context) { throw new Error('Activation failed');"));
    assert.equal((await host.invoke("validate",{directory}) as any).valid,true);
    const activationFailed: any = await host.invoke("install",{id});
    assert.equal(activationFailed.receipt.outcome,"failure");
    assert.deepEqual((await host.list()).map(item=>[item.id,item.enabled,item.running,item.registrationId,item.status?.message]),beforeInstall.map(item=>[item.id,item.enabled,item.running,item.registrationId,item.status?.message]));
    assert.deepEqual(host.viewScreens(),beforeScreens);
    assert.equal(readFileSync(path.join(root,"state.json"),"utf8"),beforeState);
    writeFileSync(entry,workingSource.replace("20, 30","40, 50"));
    assert.equal((await host.invoke("install",{id}) as any).receipt.outcome,"success");
    assert.deepEqual((await host.invoke("screen-invoke",{plugin:id,operation:`${id}.measurements`,input:{}}) as any).result,[40,50]);
    assert.notEqual(host.viewScreens().find(screen=>screen.plugin===id)!.codeRevision,beforeScreens.find(screen=>screen.plugin===id)!.codeRevision);
    assert.deepEqual(host.viewScreens().find(screen=>screen.plugin==="local.other"),beforeScreens.find(screen=>screen.plugin==="local.other"));
    writeFileSync(path.join(directory,"screen.jsx"),"export default function Screen(){return <div>}");
    const failed: any = await host.invoke("install",{id});
    assert.equal(failed.receipt.outcome,"failure");assert.equal(failed.errors[0].file,"screen.jsx");assert.ok(failed.errors[0].line);
    const refused = await executePluginTool(host,{action:"install",id},()=>{},{...scope,permissionMode:"read-only"});
    assert.equal(refused.errorKind,"forbidden");
  } finally {await host.close();}
});


test("bundled npm cache publishes complete archives, reuses them and retries interruption", async () => {
  const { c } = await import("tar");
  const { prepareScreenNpm } = await import("../server/plugins/screen-npm.ts");
  const root = mkdtempSync(path.join(os.tmpdir(),"litzio-npm-cache-"));
  const source = path.join(root,"source"), cache = path.join(root,"cache"), archive = path.join(root,"npm.tar.gz");
  mkdirSync(path.join(source,"bin"),{recursive:true});
  const entry = path.join(source,"bin/npm-cli.js");
  writeFileSync(entry,"version one");
  await c({cwd:source,file:archive,gzip:true},["."]);
  const ready = await Promise.all([prepareScreenNpm(archive,cache),prepareScreenNpm(archive,cache)]);
  assert.equal(ready[0].entry,ready[1].entry);
  assert.equal(ready.filter(result=>result.extracted).length,1);
  assert.equal(readFileSync(ready[0].entry,"utf8"),"version one");
  assert.equal((await prepareScreenNpm(archive,cache)).extracted,false);
  assert.equal(fs.readdirSync(cache).filter(name=>name.startsWith(".npm-")).length,0);
  // An abandoned staging directory is never mistaken for a completed version.
  mkdirSync(path.join(cache,".npm-interrupted","bin"),{recursive:true});
  writeFileSync(path.join(cache,".npm-interrupted","bin/npm-cli.js"),"partial");
  const bytes = readFileSync(archive);
  writeFileSync(archive,bytes.subarray(0,Math.floor(bytes.length/2)));
  await assert.rejects(prepareScreenNpm(archive,cache));
  assert.equal(readFileSync(ready[0].entry,"utf8"),"version one");
  writeFileSync(entry,"version two");
  await c({cwd:source,file:archive,gzip:true},["."]);
  const updated=await prepareScreenNpm(archive,cache);
  assert.notEqual(updated.entry,ready[0].entry);
  assert.equal(updated.extracted,true);
  assert.equal(readFileSync(updated.entry,"utf8"),"version two");
});

test("scaffolded Node plugins use the Host CLI and fail clearly without a launcher", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-cli-"));
  const host = new PluginHost(path.join(root, "state.json"), {authoringDirectory:path.join(root,"plugins")});
  const absent = new PluginHost(path.join(root, "absent.json"), {cli:null});
  try {
    assert.deepEqual(availableHostCli(), hostCli());
    assert.equal(availableHostCli({packaged:true}), undefined);
    assert.equal(availableHostCli({checkoutRoot:path.join(root,"missing")}), undefined);
    await host.invoke("scaffold", {id:"fixture.cli"});
    const directory = path.join(root,"plugins/fixture.cli");
    const file = path.join(directory,"litzio-plugin.json");
    const manifest = JSON.parse(readFileSync(file,"utf8")); manifest.operations=[PLUGIN_CLI_OPERATION];
    writeFileSync(file,JSON.stringify(manifest));writeFileSync(path.join(directory,"host.mjs"),PLUGIN_CLI_SOURCE);
    const installed: any = await host.invoke("install",{directory});
    assert.equal(installed.receipt.outcome, "success", JSON.stringify(installed));
    assert.equal((await host.list())[0]!.running, true);
    await verifyPluginCli(async args => {
      const reply = await host.invokeOperation("fixture.cli.run",{args});
      assert.equal(reply.receipt.outcome, "success", JSON.stringify(reply));
      assert.ok("result" in reply);
      return reply.result;
    }, root);
    const installedWithoutCli: any = await absent.invoke("install",{directory});
    assert.equal(installedWithoutCli.receipt.outcome, "success", JSON.stringify(installedWithoutCli));
    assert.deepEqual((await absent.list())[0]!.status, {available:false,message:"This Host has no official CLI launcher"});
    const unavailable = await absent.invokeOperation("fixture.cli.run",{args:["--version"]});
    assert.ok("errorKind" in unavailable);
    assert.equal(unavailable.errorKind, "unavailable");
    // Registration/enable and reload also transport the same optional descriptor.
    await host.invoke("disable",{id:"fixture.cli"}); await host.invoke("enable",{id:"fixture.cli"});
    assert.equal(((await host.invokeOperation("fixture.cli.run",{args:["--version"]})).result as any).status,0);
    await host.invoke("reload",{id:"fixture.cli"});
    assert.equal((await host.list())[0]!.status!.available,true);
  } finally { await Promise.all([host.close(),absent.close()]);rmSync(root,{recursive:true,force:true}); }
});
