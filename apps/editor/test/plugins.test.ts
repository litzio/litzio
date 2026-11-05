import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
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
import { fileURLToPath, pathToFileURL } from "node:url";
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

function lifecycleFixture(root: string, id: string, code = "export function activate(){return {operations:{},status:()=>({available:true,message:'Fixture',folders:[],decorations:[],accounts:[]}),dispose(){}}}") {
  const directory = path.join(root, id); mkdirSync(directory);
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
  writeFileSync(path.join(directory, "litzio-plugin.json"), JSON.stringify({ schemaVersion: 1, id, tier: "community", publisher: { id: "fixture", name: "Fixture" }, name: id, version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: {} }));
  writeFileSync(path.join(directory, "host.js"), code);
  return directory;
}
test("missing artifact affects only its registration; unregister remains approved and leaves artifact files alone", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-missing-plugin-")), host = new PluginHost(path.join(root, "state.json"));
  try {
    const a = lifecycleFixture(root, "fixture.a"), b = lifecycleFixture(root, "fixture.b");
    await host.invoke("register", { directory: a }); rmSync(a, { recursive: true });
    await host.invoke("register", { directory: b });
    assert.match((await host.list()).find(p => p.id === "fixture.a")!.error!, /artifact missing/);
    await assert.rejects(executePluginTool(host, { action: "unregister", id: "fixture.a" }, async () => false), /not approved/);
    assert.equal((await host.list()).length, 2);
    await executePluginTool(host, { action: "unregister", id: "fixture.a" }, async () => true);
    await host.invoke("unregister", { id: "fixture.b" });
    assert.equal((await host.list()).length, 0);
    assert.doesNotThrow(() => readFileSync(path.join(b, "host.js")));
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});
test("disable drains admitted status observations and their late results cannot restore contributions", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-status-drain-")), host = new PluginHost(path.join(root, "state.json"));
  try {
    const directory = lifecycleFixture(root, "fixture.slow", `let calls=0, begin, release; export let disposed=false; export const started=new Promise(r=>begin=r); const blocked=new Promise(r=>release=r); export function finish(){release()} export function activate(){return {operations:{},async status(){if(calls++>0){begin();await blocked}return {available:true,message:'Fixture',folders:[],decorations:[],accounts:[]}},dispose(){disposed=true}}}`);
    await host.invoke("register", { directory });
    await host.invoke("trust", { id: "fixture.slow", digest: (await host.list())[0]!.digest });
    await host.invoke("enable", { id: "fixture.slow" });
    const control = await import(pathToFileURL(path.join(directory, "host.js")).href);
    const observation = host.list(); await control.started;
    let disabled = false;
    const stopping = host.invoke("disable", { id: "fixture.slow" }).then(() => { disabled = true; });
    await new Promise(r => setImmediate(r));
    assert.equal(disabled, false); assert.equal(control.disposed, false);
    assert.equal((await host.list())[0]!.status, null);
    control.finish(); await stopping;
    assert.equal(control.disposed, true);
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
    if (process.platform !== "win32") return;
    const store = new WindowsPluginSecretStore(root), value = 'isolated-token-"-한글';
    await store.set("p", "token", value);
    assert.equal(await store.status("p", "token"), true);
    assert.equal(await store.read("p", "token"), value);
    assert.equal(await store.read("q", "token"), undefined);
    assert.equal(await new WindowsPluginSecretStore(path.join(root, "other-host")).read("p", "token"), undefined);
    assert.equal(await new WindowsPluginSecretStore(root).read("p", "token"), value);
    const { readdirSync } = await import("node:fs");
    for (const name of readdirSync(root, { recursive: true, withFileTypes: true })) if (name.isFile()) assert.equal(readFileSync(path.join(name.parentPath, name.name)).includes(Buffer.from(value)), false);
    await store.delete("p", "token"); assert.equal(await store.status("p", "token"), false);
    await store.set("p", "token", "new-value"); await store.delete("p"); assert.equal(await store.status("p", "token"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("secret admission, runtime plugin scope, non-disclosure and unregister cleanup", async () => {
  const { safePluginValue, redactSecrets } = await import("../server/plugins/secret-redaction.ts");
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-secret-host-"));
  const values = new Map<string, string>();
  const store = { supported: true, async read(p: string, n: string) { return values.get(`${p}/${n}`); }, async status(p: string, n: string) { return values.has(`${p}/${n}`); }, async set(p: string, n: string, v: string) { values.set(`${p}/${n}`, v); }, async delete(p: string, n?: string) { for (const key of values.keys()) if (n ? key === `${p}/${n}` : key.startsWith(`${p}/`)) values.delete(key); } };
  const host = new PluginHost(path.join(root, "state.json"), store), value = 'fixture-PAT-"-private';
  try {
    for (const id of ["example.first", "example.second"]) {
      const directory = path.join(root, id); mkdirSync(directory);
      writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
      writeFileSync(path.join(directory, "litzio-plugin.json"), JSON.stringify({ schemaVersion: 1, id, tier: "community", publisher: { id: "example", name: "Example" }, name: id, version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: { operations: [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: {}, outputSchema: {} }] }, secrets: [{ id: "pat", scope: "connection", required: true }] }));
      writeFileSync(path.join(directory, "host.js"), `export function activate(c){ if(Object.keys(c.secrets).join()!=='pat')throw Error('scope');return {operations:{read:(input)=>{if(input.fail)throw Error(c.secrets.pat);return {echo:c.secrets.pat}}},status:()=>({available:true,message:c.secrets.pat,folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
      await host.invoke("register", { directory });
      await assert.rejects(host.setSecret(id, "undeclared", value), /Undeclared/);
      await host.setSecret(id, "pat", id === "example.first" ? value : "second-private-PAT");
      const plugin = (await host.list()).find(p => p.id === id)!;
      await host.invoke("trust", { id, digest: plugin.digest }); await host.invoke("enable", { id });
      assert.equal(JSON.stringify(await host.invokeOperation(`${id}.read`, {})).includes(id === "example.first" ? value : "second-private-PAT"), false);
    }
    assert.equal(JSON.stringify(await host.invokeOperation("example.first.read", { fail: true })).includes(value), false);
    assert.equal(JSON.stringify(await host.list()).includes(value), false);
    assert.deepEqual(safePluginValue({ value }), { value: "[secret]" });
    assert.equal(redactSecrets(`error ${value}`), "error [secret]");
    assert.equal(readFileSync(path.join(root, "state.json"), "utf8").includes(value), false);
    await assert.rejects(host.setSecret("example.first", "pat", value), /Disable/);
    await host.invoke("disable", { id: "example.first" });
    await host.invoke("secret-delete", { id: "example.first", name: "pat" });
    assert.equal(await store.status("example.first", "pat"), false);
    await assert.rejects(host.invoke("enable", { id: "example.first" }), /not configured/);
    assert.equal(await store.status("example.second", "pat"), true);
    await host.invoke("unregister", { id: "example.second" }); assert.equal(values.size, 0);
    const { WindowsPluginSecretStore } = await import("../server/plugins/secret-store.ts");
    const unsupportedHost = new PluginHost(path.join(root, "unsupported.json"), new WindowsPluginSecretStore(path.join(root, "unsupported-secrets"), "linux"));
    try {
      await unsupportedHost.invoke("register", { directory: path.join(root, "example.first") });
      const p = (await unsupportedHost.list())[0]!;
      await unsupportedHost.invoke("trust", { id: p.id, digest: p.digest });
      await assert.rejects(unsupportedHost.setSecret(p.id, "pat", value), /unsupported/);
      await assert.rejects(unsupportedHost.invoke("enable", { id: p.id }), /unsupported/);
      assert.equal((await unsupportedHost.list())[0]!.secrets?.supported, false);
    } finally { await unsupportedHost.close(); }

  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("plugin synchronous and asynchronous logs never reach stdout/stderr", async () => {
  const { execFileSync } = await import("node:child_process");
  const module = new URL("../server/plugins/secret-redaction.ts", import.meta.url).href;
  const result = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `import {withPluginCode} from ${JSON.stringify(module)}; await withPluginCode(async()=>{console.log('log-private'); process.stderr.write('error-private'); await new Promise(r=>setTimeout(r,1));console.log('async-private')}); console.log('host-visible')`], { encoding: "utf8", windowsHide: true });
  assert.equal(result.trim(), "host-visible");
});
