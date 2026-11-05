import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PluginHost } from "../server/plugins/plugin-host.ts";
import { executePluginTool } from "../server/assistant-plugin-tools.ts";
test("local artifact trust, activation, admission, drain, settings persistence and assistant activity", async () => {
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
    const activities: unknown[] = [];
    await executePluginTool(host, { action: "enable", id: manifest.id }, entry => { activities.push(entry); });
    assert.deepEqual(activities, [{ action: "enable", id: manifest.id, outcome: "success" }]);
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
    assert.deepEqual(safePluginValue({ value }), { value: "[secret]" });
    assert.equal(redactSecrets(`error ${value}`), "error [secret]");
    assert.equal(readFileSync(path.join(root, "state.json"), "utf8").includes(value), false);
    await assert.rejects(host.setSecret("example.first", "pat", value), /Disable/);
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

test("plugin synchronous and asynchronous logs never reach stdout/stderr", async () => {
  const { execFileSync } = await import("node:child_process");
  const module = new URL("../server/plugins/secret-redaction.ts", import.meta.url).href;
  const result = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `import {withPluginCode} from ${JSON.stringify(module)}; await withPluginCode(async()=>{console.log('log-private'); process.stderr.write('error-private'); await new Promise(r=>setTimeout(r,1));console.log('async-private')}); console.log('host-visible')`], { encoding: "utf8", windowsHide: true });
  assert.equal(result.trim(), "host-visible");
});

test("operation invoke publishes declared public rows and refuses row-type mismatches", async () => {
  const { rememberSecret } = await import("../server/plugins/secret-redaction.ts");
  const knownSecret = "row-boundary-known-private"; rememberSecret(knownSecret);
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-operation-rows-"));
  const directory = path.join(root, "artifact"); mkdirSync(directory);
  const manifest = { schemaVersion: 1, id: "fixture.rows", tier: "community", publisher: { id: "fixture", name: "Fixture" }, name: "Rows", version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: { operations: [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: { type: "object", properties: { mode: { type: "string" } }, additionalProperties: false }, outputSchema: { type: "array", items: { type: "object" } }, rowSchema: { points: { type: "number", label: "Points" }, caption: { type: "string", label: "Caption" }, token: { type: "string", label: "Token", secret: true } } }] } };
  writeFileSync(path.join(directory, "litzio-plugin.json"), JSON.stringify(manifest));
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
  writeFileSync(path.join(directory, "host.js"), `export function activate(){return {operations:{read:({mode})=>{if(mode?.startsWith("error:")) throw Object.assign(new Error("raw-response credential-private"), {kind:mode.slice(6),response:"credential-private"}); return [{points:mode==="wrong-number"?"3":-3,caption:"row-boundary-known-private",token:mode==="wrong-secret"?4:"private",extra:"undeclared"}]} },status:()=>({available:true,message:"Rows",folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
  const host = new PluginHost(path.join(root, "plugins.json"));
  try {
    await host.invoke("register", { directory }); const record = (await host.list())[0]!;
    await host.invoke("trust", { id: record.id, digest: record.digest }); await host.invoke("enable", { id: record.id });
    const invoke = (mode?: string) => host.invoke("invoke", { operation: "fixture.rows.read", input: mode ? { mode } : {} }) as Promise<any>;
    const valid = await invoke(); assert.equal(valid.receipt.outcome, "success"); assert.deepEqual(valid.result, [{ points: -3, caption: "[secret]" }]);
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
    const view = { ...statisticsView, sources: { stats: { operation: "fixture.rows.read", version: 1, args: { mode: "error:auth" } } }, layout: { component: "VerticalPanel", children: [{ component: "Table", title: "Rows", source: "stats", data: "/rows", columns: ["points"] }] } };
    const failedView = await executeViewOperation({ action: "run", root, view }, { access: new RootAccess([root]), plugins: host });
    assert.equal(failedView.errorKind, "auth", failedView.error); assert.equal(failedView.error, PLUGIN_ERROR_MESSAGES.auth);
    const client = { request: async () => new Response(JSON.stringify(failedView)) } as unknown as import("../src/host-client.ts").HostClient;
    await assert.rejects(viewRequest(client, {}), /\[auth\] Authentication required/);
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
    await new Promise(r => setTimeout(r, 200));
    const failed = (await host.list())[0]!;
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
    writeFileSync(manifestFile, manifest); writeFileSync(entry, source);
    await executePluginTool(host, { action: "register", directory }, e => activity.push(e));
    assert.deepEqual(activity.at(-1), { action: "register", id, outcome: "success" });
    const trust = async () => host.invoke("trust", { id, digest: (await host.list())[0]!.digest });
    await trust(); await host.invoke("enable", { id });
    assert.deepEqual((await host.invokeOperation(`${id}.greet`, { name: "World" })).result, { greeting: "Hello, World!" });
    writeFileSync(entry, source.replace('Hello, ', 'Welcome, '));
    assert.equal((await validate()).valid, true);
    await trust(); await host.invoke("reload", { id });
    assert.deepEqual((await host.invokeOperation(`${id}.greet`, { name: "World" })).result, { greeting: "Welcome, World!" });
    assert.equal(existsSync(marker), false);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});


import { createPluginService } from "../server/plugin-service.ts";
import { pluginCli } from "../../../packages/cli/src/plugins.ts";
import { DAEMON_PROTOCOL } from "../shared/daemon-version.ts";

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
