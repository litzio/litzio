import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { artifactDigest } from "../server/plugins/artifact-digest.mjs";
import { PluginHost } from "../server/plugins/plugin-host.ts";
import { executePluginTool } from "../server/assistant-plugin-tools.ts";
test("local artifact trust, activation, admission, drain, settings persistence and assistant activity", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugins-"));
  const directory = path.join(root, "artifact"); mkdirSync(directory);
  const manifest = { schemaVersion: 1, id: "litzio.onedrive", tier: "official", publisher: { id: "litzio", name: "Litzio" }, name: "Fixture", version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: { operations: [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "string" } }] }, settingsSchema: { type: "object", properties: { label: { type: "string" } }, additionalProperties: false } };
  writeFileSync(path.join(directory, "litzio-plugin.json"), JSON.stringify(manifest));
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
  writeFileSync(path.join(directory, "host.js"), `export function activate(c){return {operations:{read:async()=>{await new Promise(r=>setTimeout(r,50));return c.settings.label ?? "done"}},status:()=>({available:true,message:"Fixture",folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
  const host = new PluginHost(path.join(root, "state.json"), { officialPlugins: [] });
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
    const activities: unknown[] = [];
    await executePluginTool(host, { action: "enable", id: manifest.id }, entry => { activities.push(entry); });
    assert.deepEqual(activities, [{ action: "enable", id: manifest.id, outcome: "success" }]);
    assert.equal((await host.list())[0]?.running, true);
    await executePluginTool(host, { action: "settings", id: manifest.id, settings: { label: "live" } }, () => {});
    assert.equal((await host.invokeOperation("litzio.onedrive.read", {})).result, "live");
    writeFileSync(path.join(directory, "extra.js"), "// updated artifact");
    await assert.rejects(host.invoke("settings", { id: manifest.id, settings: { label: "recovered" } }), /Explicit digest-bound trust/);
    const failedReload = (await host.list())[0]!;
    assert.equal(failedReload.enabled, false); assert.equal(failedReload.running, false); assert.equal(failedReload.trusted, false);
    assert.deepEqual(failedReload.settings, { label: "recovered" });
    await assert.rejects(host.invoke("enable", { id: manifest.id }), /changed/);
    await host.invoke("trust", { id: manifest.id, digest: failedReload.digest });
    await host.invoke("enable", { id: manifest.id });
    assert.equal((await host.list())[0]?.running, true);
    assert.equal((await host.invokeOperation("litzio.onedrive.read", {})).result, "recovered");
    await host.invoke("disable", { id: manifest.id });
    const { statSync, utimesSync } = await import("node:fs");
    const entry = path.join(directory, "host.js"), metadata = statSync(entry);
    writeFileSync(entry, readFileSync(entry, "utf8").replace('"done"', '"edit"'));
    utimesSync(entry, metadata.atime, metadata.mtime);
    assert.equal((await host.list())[0]!.trusted, false);
    writeFileSync(path.join(directory, "extra.js"), "changed");
    await assert.rejects(host.invoke("enable", { id: manifest.id }), /changed/);
    assert.equal(new PluginHost(path.join(root, "state.json")) instanceof PluginHost, true);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});
import { fileURLToPath, pathToFileURL } from "node:url";
import { ProviderConnections } from "../server/provider-connections.ts";
import { AssistantConversations } from "../server/assistant-conversations.ts";
import { RootAccess } from "../server/file-access.ts";
test("Codex management runs without approval and exposes activity in the existing tool result", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-activity-"));
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url))] }, undefined, { packaged: false, checkoutRoot: root });
  const host = new PluginHost(path.join(root, "plugins.json"));
  const conversations = new AssistantConversations(connection, new RootAccess([root]), host);
  try {
    const settings = { provider: "codex" as const, permissionMode: "full-access" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
    const conversation = await conversations.send({ message: "Inspect plugins", folders: [root], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings, "window-a");
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
  } finally { await connection.close(); await host.close(); rmSync(root, { recursive: true, force: true }); }
});

function lifecycleFixture(root: string, id: string, code = "export function activate(){return {operations:{},status:()=>({available:true,message:'Fixture',folders:[],decorations:[],accounts:[]}),dispose(){}}}") {
  const directory = path.join(root, id); mkdirSync(directory);
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
  writeFileSync(path.join(directory, "litzio-plugin.json"), JSON.stringify({ schemaVersion: 1, id, tier: "community", publisher: { id: "fixture", name: "Fixture" }, name: id, version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: {} }));
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
    const directory = lifecycleFixture(root, "fixture.slow", `import {existsSync,writeFileSync} from 'node:fs'; let calls=0; export function activate(){return {operations:{},async status(){if(calls++>0){writeFileSync(${JSON.stringify(marker)},'');while(!existsSync(${JSON.stringify(release)}))await new Promise(r=>setTimeout(r,10))}return {available:true,message:'Fixture',folders:[],decorations:[],accounts:[]}},dispose(){writeFileSync(${JSON.stringify(disposed)},'')}}}`);
    await host.invoke("register", { directory });
    await host.invoke("trust", { id: "fixture.slow", digest: (await host.list())[0]!.digest });
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
    assert.deepEqual(damaged.secrets?.declarations, [{ id: "pat", scope: "connection", required: true, configured: false, error: "Secret unavailable or damaged" }]);
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
      await unsupportedHost.invoke("trust", { id: p.id, digest: p.digest });
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
  const manifest = { secrets: [{ id: "pat", scope: "connection", required: true }], schemaVersion: 1, id: "fixture.rows", tier: "community", publisher: { id: "fixture", name: "Fixture" }, name: "Rows", version: "0.1.0", requiresSdk: ">=0.3.0 <1.0.0", entry: "host.js", contributes: { operations: [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: { type: "object", properties: { mode: { type: "string" } }, additionalProperties: false }, outputSchema: { type: "array", items: { type: "object" } }, rowSchema: { points: { type: "number", label: "Points" }, caption: { type: "string", label: "Caption", linkField: "url" }, url: { type: "string", label: "URL" }, token: { type: "string", label: "Token", secret: true } } }] } };
  writeFileSync(path.join(directory, "litzio-plugin.json"), JSON.stringify(manifest));
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
  writeFileSync(path.join(directory, "host.js"), `export function activate(){return {operations:{read:({mode})=>{if(mode?.startsWith("error:")) throw Object.assign(new Error("raw-response credential-private"), {kind:mode.slice(6),response:"credential-private"}); return [{points:mode==="wrong-number"?"3":-3,caption:"row-boundary-known-private",url:"https://example.test/issue/1",token:mode==="wrong-secret"?4:"private",extra:"undeclared"}]} },status:()=>({available:true,message:"Rows",folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
  const host = new PluginHost(path.join(root, "plugins.json"), { secrets: { supported: true, async read() { return knownSecret; }, async set() {}, async status() { return true; }, async delete() {} } });
  try {
    await host.invoke("register", { directory }); const record = (await host.list())[0]!;
    await host.invoke("trust", { id: record.id, digest: record.digest }); await host.invoke("enable", { id: record.id });
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
    const { executeViewOperation } = await import("../server/views.ts");
    const { statisticsView, viewRequest } = await import("../src/views/view-api.ts");
    const view = { ...statisticsView, schemaVersion: 2, catalog: "litzio-v2", profile: "query", owner: "fixture.rows", sources: { stats: { kind: "operation", operation: "fixture.rows.read", version: 1, args: { mode: "error:auth" } } }, layout: { component: "Panel", direction: "vertical", children: [{ component: "Table", title: "Rows", source: "stats", data: "/rows", columns: ["points"] }] } };
    const failedView = await executeViewOperation({ action: "run", root, view }, { access: new RootAccess([root]), plugins: host });
    assert.equal(failedView.errorKind, "auth", failedView.error); assert.equal(failedView.error, PLUGIN_ERROR_MESSAGES.auth);
    const client = { request: async () => new Response(JSON.stringify(failedView)) } as unknown as import("../src/host-client.ts").HostClient;
    await assert.rejects(viewRequest(client, {}), error => error instanceof Error && "kind" in error && error.kind === "auth" && !error.message.includes("private"));
    for (const mode of ["wrong-number", "wrong-secret"]) {
      const refused = await invoke(mode); assert.equal(refused.receipt.outcome, "failure"); assert.ok(!("result" in refused)); assert.ok(!JSON.stringify(refused).includes("private")); assert.equal(refused.errorKind, "failed"); assert.ok(!refused.error.includes("retrying a write"));
    }
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("K1 assistant job tools use shared definitions without per-call consent and leave activity", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-job-tool-"));
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url))] }, undefined, { packaged: false, checkoutRoot: root });
  const host = new PluginHost(path.join(root, "plugins.json"));
  const conversations = new AssistantConversations(connection, new RootAccess([root]), host);
  try {
    const settings = { provider: "codex" as const, permissionMode: "full-access" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
    const conversation = await conversations.send({ message: "List plugin jobs", folders: [root], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings, "window-a");
    const response = await connection.client.request("fixture/tool", { threadId: conversation.id, tool: "plugin_jobs", arguments: { action: "job-list" } }) as any;
    assert.equal(response.result.success, true);
    assert.equal(conversations.current(conversation.id).userInput, undefined);
    const activity = conversations.current(conversation.id).turns.flatMap(turn => turn.items).find(item => item.text === "plugin_jobs · job-list");
    assert.equal(activity?.status, "completed"); assert.equal(activity?.toolResult?.success, true);
  } finally { await connection.close(); await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("subprocess isolation, fresh artifact reload, trust failure recovery and crash status", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-reload-")), host = new PluginHost(path.join(root, "state.json"));
  const marker = path.join(root, "disposed");
  const code = (label: string, crash = false) => `import {writeFileSync} from 'node:fs'; export function activate(){${crash ? "setTimeout(()=>process.exit(7),100);" : ""}return {operations:{},status:()=>({available:true,message:${JSON.stringify(label)}+':'+process.pid,folders:[],decorations:[],accounts:[]}),dispose(){writeFileSync(${JSON.stringify(marker)},'disposed')}}}`;
  try {
    const directory = lifecycleFixture(root, "fixture.reload", code("first"));
    await host.invoke("register", { directory });
    const trust = async () => host.invoke("trust", { id: "fixture.reload", digest: (await host.list())[0]!.digest });
    await trust(); await host.invoke("enable", { id: "fixture.reload" });
    const first = (await host.list())[0]!.status!.message;
    assert.notEqual(first.split(':')[1], String(process.pid));
    writeFileSync(path.join(directory, "host.js"), code("second"));
    await assert.rejects(host.invoke("reload", { id: "fixture.reload" }), /trust/);
    assert.equal(readFileSync(marker, "utf8"), "disposed");
    assert.equal((await host.list())[0]!.running, false);
    await trust(); await host.invoke("reload", { id: "fixture.reload" });
    const second = (await host.list())[0]!.status!.message;
    assert.match(second, /^second:/); assert.notEqual(first.split(':')[1], second.split(':')[1]);
    writeFileSync(path.join(directory, "host.js"), "throw new Error('private error')");
    await trust(); await assert.rejects(host.invoke("reload", { id: "fixture.reload" }), /request failed/);
    assert.equal((await host.list())[0]!.running, false);
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
    await new Promise(r => setTimeout(r, 100)); assert.equal((await host.list())[0]!.running, false);
    writeFileSync(path.join(directory, "host.js"), code("final"));
    await trust(); await host.invoke("reload", { id: "fixture.reload" });
    assert.match((await host.list())[0]!.status!.message, /^final:/);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});


test("a stalled write times out as uncertain; failed disposal can recover on the next reload", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-timeout-")), host = new PluginHost(path.join(root, "state.json"));
  try {
    const directory = lifecycleFixture(root, "fixture.timeout", `export function activate(){return {operations:{write:()=>new Promise(()=>{})},status:()=>({available:true,message:'ready',folders:[],decorations:[],accounts:[]}),dispose(){throw new Error('private')}}}`);
    const file = path.join(directory, "litzio-plugin.json"), manifest = JSON.parse(readFileSync(file, 'utf8'));
    manifest.contributes.operations = [{id:'write',version:1,effect:'write',scope:'host',inputSchema:{type:'object'},outputSchema:{type:'object'}}];
    writeFileSync(file, JSON.stringify(manifest));
    await host.invoke("register", {directory});
    await host.invoke("trust", {id:'fixture.timeout',digest:(await host.list())[0]!.digest});
    await host.invoke("enable", {id:'fixture.timeout'});
    await assert.rejects(host.invoke("reload", {id:'fixture.timeout'}), /disposal failed/);
    assert.equal((await host.list())[0]!.running, false);
    await host.invoke("reload", {id:'fixture.timeout'});
    const result = await host.invokeOperation('fixture.timeout.write', {});
    assert.equal(result.receipt.outcome, 'uncertain');
    assert.equal('errorKind' in result && result.errorKind, 'timeout');
    assert.match('error' in result ? result.error : '', /Check the target before retrying a write/);
    assert.equal((await host.list())[0]!.running, false);
    assert.match((await host.list())[0]!.error!, /process failed/);
  } finally {await host.close(); rmSync(root, {recursive:true, force:true});}
});


test("Host shutdown closes every child even when one dispose fails", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-close-")), host = new PluginHost(path.join(root, "state.json"));
  const marker = path.join(root, 'disposed');
  try {
    for (const [id, dispose] of [['fixture.bad', "throw new Error('private')"], ['fixture.good', `writeFileSync(${JSON.stringify(marker)},'done')`]]) {
      const directory = lifecycleFixture(root, id!, `import {writeFileSync} from 'node:fs'; export function activate(){return {operations:{},status:()=>({available:true,message:'ready',folders:[],decorations:[],accounts:[]}),dispose(){${dispose}}}}`);
      await host.invoke('register', {directory});
      await host.invoke('trust', {id, digest:(await host.list()).find(p=>p.id===id)!.digest});
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
      return {operations:{read:(input)=>{if(input.fail)throw Error(c.secrets.pat);return {version:c.secrets.pat==='first-private-token'?1:c.secrets.pat==='second-private-token'?2:0}}},status:()=>({available:true,message:c.secrets.pat,folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
    const file = path.join(directory,'litzio-plugin.json'), manifest = JSON.parse(readFileSync(file,'utf8'));
    manifest.secrets = [{id:'pat',scope:'connection',required:true}];
    manifest.contributes.operations = [{id:'read',version:1,effect:'read',scope:'host',inputSchema:{},outputSchema:{}}];
    writeFileSync(file,JSON.stringify(manifest));
    await host.invoke('register',{directory});
    await assert.rejects(host.invoke('enable',{id:'fixture.secret'}),/trust/);
    await host.invoke('trust',{id:'fixture.secret',digest:(await host.list())[0]!.digest});
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
  const host = new PluginHost(path.join(root, "state.json")), directory = path.join(root, "greeting"), id = "local.greeting";
  const activity: any[] = [];
  const scope = { folders: new RootAccess([root]), access: new RootAccess([root]), permissionMode: "opened-folders" };
  try {
    await executePluginTool(host, { action: "scaffold", directory, id }, e => activity.push(e), scope);
    const entry = path.join(directory, "host.js"), source = readFileSync(entry, "utf8");
    assert.equal(JSON.parse(readFileSync(path.join(directory, "litzio-plugin.json"), "utf8")).requiresSdk, ">=0.3.0 <1.0.0");
    assert.match(source, /import .* from "@litzio\/plugin-sdk"/);
    assert.match(readFileSync(path.join(directory, "plugin-sdk.d.ts"), "utf8"), /PluginContext/);
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
    assert.match(JSON.stringify(invalid), /Missing handler/); assert.match(JSON.stringify(invalid), /Undeclared operation handler/);
    writeFileSync(entry, source.replace('({ greeting: "Hello, " + name + "!" })', '({ greeting: 42 })'));
    assert.match(JSON.stringify(await validate()), /Output schema mismatch/);
    const manifestFile = path.join(directory, "litzio-plugin.json"), manifest = readFileSync(manifestFile, "utf8");
    writeFileSync(manifestFile, manifest.replace('"type": "string"', '"type": "invalid"'));
    assert.equal((await validate()).valid, false);

    writeFileSync(manifestFile, manifest.replace(/"requiresSdk": "[^"]+"/, '"requiresSdk": "999.0.0"'));
    assert.equal((await validate()).valid, false);
    await assert.rejects(host.invoke("register", { directory }));
    // An unchanged pre-0.2 scaffold's exact requirement remains executable.
    writeFileSync(manifestFile, manifest.replace(/"requiresSdk": "[^"]+"/, '"requiresSdk": "0.1.0"')); writeFileSync(entry, source);
    await executePluginTool(host, { action: "register", directory }, e => activity.push(e));
    assert.deepEqual(activity.at(-1), { action: "register", id, outcome: "success" });
    const trust = async () => host.invoke("trust", { id, digest: (await host.list())[0]!.digest });
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
  assert.equal(runtime.SDK_VERSION, "0.3.0");
  assert.equal(JSON.parse(readFileSync(new URL("../../../packages/plugin-sdk/package.json", import.meta.url), "utf8")).version, runtime.SDK_VERSION);
  assert.equal(typeof runtime.PluginOperationError, "function");
});

test("runtime import boundary checks resolved real paths, including aliases into the Host checkout", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-import-boundary-"));
  const host = new PluginHost(path.join(root, "state.json")), id = "fixture.imports";
  const source = `import { SDK_VERSION } from '@litzio/plugin-sdk';
import {basename} from 'node:path'; import {message} from './local.js'; import {value} from 'fixture-dependency';
export function activate(){return {operations:{},status:()=>({available:true,message:[SDK_VERSION,basename('okay'),message,value].join('/'),folders:[],decorations:[],accounts:[]}),dispose(){}}}`;
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
    const trust = async () => host.invoke("trust", { id, digest: (await host.list())[0]!.digest });
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
  const host = new PluginHost(path.join(root, "turn-plugins.json"), { access });
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
    const directory = path.join(opened, "valid");
    const result = await executePluginTool(host, { action: "scaffold", directory, id: "local.valid" }, e => activities.push(e), scope);
    assert.equal(result.activity.outcome, "success"); assert.equal(existsSync(path.join(directory, "host.js")), true);
  } finally { await assistant.close(); await host.close(); rmSync(root, { recursive: true, force: true }); }
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
    const source = readFileSync(path.join(directory, "host.js"), "utf8");
    const activities: unknown[] = [];
    const check = async (file: string) => {
      const result: any = await host.invoke("validate", { directory });
      assert.equal(result.valid, false); assert.ok(result.errors.length);
      assert.equal(result.errors[0].file, file);
      assert.ok(Object.hasOwn(result.errors[0], "line")); assert.ok(Object.hasOwn(result.errors[0], "column"));
      assert.equal(JSON.stringify(result).includes(secret), false);
      const tool = await executePluginTool(host, { action: "validate", directory }, e => activities.push(e));
      assert.equal(tool.activity.outcome, "failure"); assert.equal(JSON.stringify(tool).includes(secret), false);
      assert.equal(await pluginCli(["plugins", "validate", directory, "--host", "http://127.0.0.1:5180", "--json"]), 1);
      assert.equal(captured.join("").includes(secret), false); assert.equal(JSON.stringify(activities).includes(secret), false);
    };
    writeFileSync(path.join(directory, "litzio-plugin.json"), `{ "token": "${secret}", broken }`);
    await check("litzio-plugin.json");
    writeFileSync(path.join(directory, "litzio-plugin.json"), manifest);
    writeFileSync(path.join(directory, "host.js"), `const ${secret} = ;`);
    await check("host entry");
    writeFileSync(path.join(directory, "host.js"), source.replace("greet:", `"${secret}":`));
    await check("host entry");
  } finally { stdout.mock.restore(); stderr.mock.restore(); await host.close(); rmSync(root, { recursive: true, force: true }); }
});


test("short secrets preserve keys and leave the plugin scope on replacement, deletion and unregister", async () => {
  const { safePluginValue } = await import("../server/plugins/secret-redaction.ts");
  assert.deepEqual(safePluginValue({ id: "id", defaultCandidate: ["secret-long", "a.b"] }, ["id", "secret", "secret-long", "a.b"]), { id: "[secret]", defaultCandidate: ["[secret]", "[secret]"] });
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-redaction-scope-")), values = new Map<string, string>();
  const store = { supported: true, async read(p: string, n: string) { return values.get(`${p}/${n}`); }, async status(p: string, n: string) { return values.has(`${p}/${n}`); }, async set(p: string, n: string, v: string) { values.set(`${p}/${n}`, v); }, async delete(p: string, n?: string) { for (const key of values.keys()) if (n ? key === `${p}/${n}` : key.startsWith(`${p}/`)) values.delete(key); } };
  const host = new PluginHost(path.join(root, "state.json"), { secrets: store });
  try {
    const dirs: string[] = [];
    for (const id of ["fixture.a", "fixture.b"]) {
      const directory = lifecycleFixture(root, id, `export function activate(){return {operations:{read:input=>{if(input.fail)throw Error('raw-log-private');return {id:input.value,defaultCandidate:true}}},status:()=>({available:true,message:'id',folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
      dirs.push(directory);
      const file = path.join(directory, "litzio-plugin.json"), m = JSON.parse(readFileSync(file, "utf8"));
      m.secrets = [{ id: "pat", scope: "connection", required: false }, { id: "other", scope: "connection", required: false }];
      m.contributes.operations = [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: {}, outputSchema: { type: "object", required: ["id", "defaultCandidate"], additionalProperties: false, properties: { id: { type: "string" }, defaultCandidate: { type: "boolean" } } } }];
      writeFileSync(file, JSON.stringify(m));
      await host.invoke("register", { directory });
      await host.invoke("trust", { id, digest: (await host.list()).find(p => p.id === id)!.digest });
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
    await host.invoke("register", { directory: dirs[0] }); await host.invoke("trust", { id: "fixture.a", digest: (await host.list()).find(p => p.id === "fixture.a")!.digest }); await host.invoke("enable", { id: "fixture.a" });
    await check("fixture.a", "raw-log-private", "raw-log-private");
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

// Host policy combinations belong here; browser coverage owns the folder picker and toggle wiring.
test("bundled defaults follow supply until an explicit choice; update verification cannot be bypassed", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-bundled-"));
  const directory = lifecycleFixture(root, "fixture.bundled");
  const file = path.join(directory, "litzio-plugin.json");
  const manifest = JSON.parse(readFileSync(file, "utf8")); manifest.tier = "official";
  writeFileSync(file, JSON.stringify(manifest));
  const supply = [{ id: manifest.id, publisher: "fixture", directory, digest: artifactDigest(directory), defaultEnabled: false }];
  const state = path.join(root, "state.json");
  let host = new PluginHost(state, { officialPlugins: supply });
  try {
    await host.start(); assert.equal((await host.list())[0]!.enabled, false);
    // Saving unrelated settings must not turn a default into an explicit choice.
    await host.invoke("settings", { id: manifest.id, settings: {} }); await host.close();
    supply[0]!.defaultEnabled = true;
    host = new PluginHost(state, { officialPlugins: supply }); await host.start();
    assert.equal((await host.list())[0]!.running, true);
    await host.invoke("disable", { id: manifest.id }); await host.close();
    host = new PluginHost(state, { officialPlugins: supply }); await host.start();
    assert.equal((await host.list())[0]!.enabled, false);
    await host.invoke("enable", { id: manifest.id }); await host.close();
    supply[0]!.defaultEnabled = false;
    host = new PluginHost(state, { officialPlugins: supply }); await host.start();
    assert.equal((await host.list())[0]!.running, true);
    await assert.rejects(host.invoke("unregister", { id: manifest.id }), /disabled/);
    await assert.rejects(host.invoke("register", { directory }), /app only/);
    await host.close(); writeFileSync(path.join(directory, "tampered.js"), "changed");
    host = new PluginHost(state, { officialPlugins: supply }); await host.start();
    const status = (await host.list())[0]!;
    assert.equal(status.official, false); assert.equal(status.running, false); assert.match(status.error!, /verification/);
    await assert.rejects(host.invoke("trust", { id: manifest.id, digest: status.digest }), /disabled/);
    await assert.rejects(host.invoke("enable", { id: manifest.id }), /verification/);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});


test("plugin service shutdown waits for startup and confirms the started child exits once", async t => {
  const { createPluginService } = await import("../server/plugin-service.ts");
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-start-close-"));
  const file = path.join(root, "state.json");
  const directory = lifecycleFixture(root, "fixture.start", `export function activate(){return {operations:{},status:()=>({available:true,message:String(process.pid),folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
  const seed = new PluginHost(file, { officialPlugins: [] });
  try {
    await seed.invoke("register", { directory });
    await seed.invoke("trust", { id: "fixture.start", digest: (await seed.list())[0]!.digest });
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
  const host = new PluginHost(path.join(root, "state.json"), { officialPlugins: [] });
  try {
    const directory = lifecycleFixture(root, "fixture.health", `export function activate(c){return {operations:{connection:()=>c.settings.invalid ? {ok:true,message:'fixed',raw:'private service response'} : {ok:false,message:'Service unavailable'}},status:()=>({available:true,message:'ready',folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
    const file = path.join(directory, "litzio-plugin.json"), manifest = JSON.parse(readFileSync(file, "utf8"));
    manifest.requiresSdk = ">=0.3.0 <1.0.0";
    manifest.settingsSchema = { type: "object", properties: { invalid: { type: "boolean" } } };
    manifest.contributes = { healthCheck: "connection", operations: [{ id: "connection", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "object" } }] };
    writeFileSync(file, JSON.stringify(manifest));
    await host.invoke("register", { directory });
    await host.invoke("trust", { id: manifest.id, digest: (await host.list())[0]!.digest });
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

test("Jira artifact filters reject malformed dates/JQL controls and detail preserves bounded text and comment range", async t => {
  const source = readFileSync(new URL("../../../community-plugins/jira/host.js", import.meta.url), "utf8");
  const { activate } = await import("data:text/javascript;base64," + Buffer.from(source.replace('"@litzio/plugin-sdk"', JSON.stringify(import.meta.resolve("@litzio/plugin-sdk")))).toString("base64"));
  let calls: URL[] = [], body: any = { startAt: 0, total: 0, issues: [] };
  t.mock.method(globalThis, "fetch", async (url: string) => { calls.push(new URL(url)); return new Response(JSON.stringify(body)); });
  const plugin = activate({ settings: { baseUrl: "https://jira.example.com/jira" }, secrets: { pat: "synthetic" } });
  t.after(() => plugin.dispose());
  for (const input of [{ dateFrom: "2026-02-29" }, { dateTo: "2026-13-01" }, { dateFrom: "2026-11-09", dateTo: "2026-11-01" }, { project: 'X" OR true' }, { reporter: "user\nOR true" }]) {
    await assert.rejects(plugin.operations.issues(input));
  }
  assert.equal(calls.length, 0);
  await plugin.operations.issues({ dateField: "생성일", reporter: 'name"\\x', project: "MOCK", dateFrom: "2024-02-29", dateTo: "2024-02-29" });
  assert.equal(calls[0]!.searchParams.get("jql"), 'assignee = currentUser() AND resolution = Unresolved AND project = "MOCK" AND reporter = "name\\"\\\\x" AND created >= "2024-02-29" AND created < "2024-03-01" ORDER BY updated DESC');
  await assert.rejects(plugin.operations.jql({ jql: " " }));
  await assert.rejects(plugin.operations.jql({ jql: "x".repeat(4001) }));
  const offsets: number[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get("jql"), "project = MOCK ORDER BY updated DESC");
    const startAt = Number(query.get("startAt")); offsets.push(startAt);
    return new Response(JSON.stringify({ startAt, total: 3, issues: Array.from({length: startAt === 0 ? 2 : 1}, (_, i) => ({key: `MOCK-${startAt+i+1}`, fields:{summary:"Fixture"}})) }));
  });
  assert.deepEqual((await plugin.operations.jql({jql:"project = MOCK ORDER BY updated DESC"})).map((r: any) => r.key), ["MOCK-1", "MOCK-2", "MOCK-3"]);
  assert.deepEqual(offsets, [0, 2]);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({errorMessages:["RAW-JIRA-SENTINEL"]}), {status:400}));
  await assert.rejects(plugin.operations.jql({jql:"project ="}), (e: any) => e.kind === "failed" && !e.message.includes("SENTINEL"));
  body = { key: "MOCK-1", fields: { description: null } };
  t.mock.method(globalThis, "fetch", async (url: string) => new Response(JSON.stringify(url.includes("/comment?") ? { startAt: 0, total: 0, comments: [] } : body)));
  const detail = await plugin.operations.detail({ key: "MOCK-1" });
  assert.equal(detail.description, ""); assert.equal(detail.commentsTotal, 0); assert.equal(detail.commentsReturned, 0);
  body.fields.description = {};
  await assert.rejects(plugin.operations.detail({ key: "MOCK-1" }));
});

test("registered icons enforce image bounds, artifact links and digest trust", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-icons-")), host = new PluginHost(path.join(root, "state.json"));
  try {
    const directory = lifecycleFixture(root, "fixture.icon");
    const manifestFile = path.join(directory, "litzio-plugin.json"), icon = path.join(directory, "icon.svg");
    const manifest = { ...JSON.parse(readFileSync(manifestFile, "utf8")), requiresSdk: "^0.3.0", icon: "icon.svg" };
    writeFileSync(manifestFile, JSON.stringify(manifest));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="blue"/></svg>';
    for (const invalid of [svg.replace('width="16"', 'width="257"'), svg.replace('height="16"', 'height="0"'), '<html/>', svg + ' '.repeat(65536), '<svg']) {
      writeFileSync(icon, invalid); await assert.rejects(host.invoke("register", { directory }));
    }
    writeFileSync(icon, svg);
    await host.invoke("register", { directory });
    const digest = (await host.list())[0]!.digest!;
    assert.throws(() => host.icon(manifest.id, digest), /unavailable/);
    await host.invoke("trust", { id: manifest.id, digest });
    assert.equal(host.icon(manifest.id, digest).mime, "image/svg+xml");
    assert.equal(host.icon(manifest.id, digest).bytes.toString(), svg);
    writeFileSync(icon, svg.replace('blue', 'red'));
    assert.throws(() => host.icon(manifest.id, digest), /unavailable/);
    assert.equal((await host.list())[0]!.iconDigest, undefined);
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
