import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { createAssistantHost } from "../server/assistant-host.ts";
import { ProviderConnections } from "../server/provider-connections.ts";
import { handleDocumentRequest } from "../server/document-api.ts";
import { listenForFetch } from "../../../test/helpers/fetch-server.ts";
import { runCliAsync } from "../../../packages/cli/src/cli.ts";
import { fakeProviderCli, useReleaseSource } from "./helpers/provider-cli.ts";

test("Codex skill discovery waits for plugin startup; Copilot retains tool-only support", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-plugin-skill-catalog-"));
  let started = false, discovered = false, release!: () => void;
  const ready = new Promise<void>(resolve => { release = () => { started = true; resolve(); }; });
  const agent = { async skills() { assert.equal(started, true); discovered = true; return { skills: [{ name: "internal", path: "/plugin/SKILL.md", description: "Review" }, { name: "user", path: "/user/SKILL.md", description: "User" }], errors: [] }; }, async close() {} } as unknown as ProviderConnections;
  const plugins = { start: () => ready, host: { skillDisplayName: (file: string) => file === "/plugin/SKILL.md" ? "Fixture · documents" : undefined } } as import("../server/plugin-service.ts").PluginService;
  const host = createAssistantHost(null, path.join(root, "settings.json"), { agent, plugins });
  try {
    const listing = host.invoke("assistantSkills", { provider: "codex" });
    await Promise.resolve(); assert.equal(discovered, false);
    await assert.rejects(host.invoke("assistantSkills", { provider: "copilot" }), /only with Codex/);
    release(); assert.deepEqual((await listing).skills, [{ name: "internal", path: "/plugin/SKILL.md", description: "Review", displayName: "Fixture · documents" }, { name: "user", path: "/user/SKILL.md", description: "User" }]);
  } finally { release(); await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("the plugin authoring skill is in the assistant working folder only on a Host with plugins", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-authoring-skill-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const plugins = { start: async () => {}, host: {} } as unknown as import("../server/plugin-service.ts").PluginService;
  // The same working folder: a Host without plugins also drops a copy an earlier Host left.
  for (const withPlugins of [true, false]) {
    const host = createAssistantHost(null, path.join(root, "assistant.json"), { agent: new ProviderConnections(path.join(root, "assistant")), ...(withPlugins ? { plugins } : {}) });
    try { assert.equal((await host.invoke("assistantEnvironment")).skills.includes("litzio-authoring"), withPlugins); }
    finally { await host.close(); }
  }
});

test("assistant history lists both providers in index order and retains explicit filtering", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-assistant-history-"));
  const agent = new ProviderConnections(path.join(root, "assistant"));
  const host = createAssistantHost(null, path.join(root, "ai.json"), { agent });
  t.after(async () => { await host.close(); rmSync(root, { recursive: true, force: true }); });
  agent.environment();
  const entries = [
    { id: "current", title: "Experiment", provider: "copilot", folders: [], createdAt: 1, updatedAt: 3 },
    { id: "older", title: "Report", provider: "codex", folders: [], createdAt: 1, updatedAt: 2 },
    { id: "legacy", title: "Outline", folders: [], createdAt: 1, updatedAt: 1 },
  ];
  writeFileSync(path.join(agent.cwd, "conversations.json"), JSON.stringify(entries));
  assert.deepEqual(await host.invoke("assistantConversations", {}), entries);
  assert.deepEqual(await host.invoke("assistantConversations", { provider: "codex" }), entries.slice(1));
  assert.deepEqual(await host.invoke("assistantConversations", { provider: "copilot" }), entries.slice(0, 1));
});

test("official settings HTTP and CLI share validation and the stored snapshot without registration", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-assistant-host-"));
  const file = path.join(root, "ai.json");
  const agent = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath,
    args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url))] }, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url))] });
  const host = createAssistantHost(null, file, { agent });
  const server = createServer((req, res) => { void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); }, null, Infinity, undefined, undefined, { assistant: host }); });
  await listenForFetch(server);
  const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await host.close(); rmSync(root, { recursive: true, force: true }); });
  const settings = { ...await host.invoke("settings"), model: "gpt-6.1-sol", reasoningEffort: "high" };
  const put = (value: unknown) => fetch(`${url}/api/assistant/settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  assert.equal(settings.permissionMode, "full-access", "unsaved permission defaults to full access");
  assert.equal(settings.ollamaUrl, "http://localhost:11434");
  const saved = await put(settings);
  const usage = await fetch(`${url}/api/assistant/diagnostics?provider=codex&summary=account-usage`).then(response => response.json());
  assert.equal(usage.account.email, "fixture@example.invalid");
  assert.equal(usage.rateLimits[0].windows[0].usedPercent, 28);
  assert.equal("path" in usage || "mcp" in usage, false);
  assert.deepEqual(await fetch(`${url}/api/assistant/diagnostics?provider=copilot&summary=account-usage`).then(response => response.json()).then(({ provider, ...value }) => ({ provider, keys: Object.keys(value) })), { provider: "copilot", keys: ["checkedAt"] });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.deepEqual(await saved.json(), settings);
  const previous = process.env.LITZIO_ASSISTANT_SETTINGS_FILE;
  process.env.LITZIO_ASSISTANT_SETTINGS_FILE = file;
  const output: string[] = [];
  const stdout = t.mock.method(process.stdout, "write", ((value: string) => { output.push(value); return true; }) as typeof process.stdout.write);
  const stderr = t.mock.method(process.stderr, "write", (() => true) as typeof process.stderr.write);
  try {
    assert.equal(await runCliAsync(["assistant", "settings"]), 0);
    assert.deepEqual(JSON.parse(output.pop()!), settings);
    assert.equal(await runCliAsync(["assistant", "configure", "--file", file]), 0);
    assert.deepEqual(JSON.parse(output.pop()!), settings);
    const before = readFileSync(file, "utf8");
    assert.equal(await runCliAsync(["ai", "settings"]), 2);
    assert.equal((await fetch(`${url}/api/ai-agent-settings`)).status, 404);
    const legacy = await put({ ...settings, writeAccess: "read-only" });
    assert.equal(legacy.status, 400); assert.match(await legacy.text(), /unknown field.*writeAccess/);
    assert.equal((await put({ ...settings, providers: { codex: false, copilot: false } })).status, 400);
    const missing = await put({ ...settings, model: "missing-model" });
    assert.equal(missing.status, 400); assert.match(await missing.text(), /model.*allowed values.*gpt-6.1-sol/);
    const effort = await put({ ...settings, reasoningEffort: "unsupported" });
    assert.equal(effort.status, 400); assert.match(await effort.text(), /reasoningEffort.*allowed values/);
    const source = await put({ ...settings, copilotModelSource: "account" });
    assert.equal(source.status, 400, "the removed Copilot model source is not new input"); assert.match(await source.text(), /unknown field.*copilotModelSource/);
    const address = await put({ ...settings, ollamaUrl: "http://user:secret@127.0.0.1:11434" });
    assert.equal(address.status, 400); assert.match(await address.text(), /ollamaUrl/);
    assert.equal(readFileSync(file, "utf8"), before);
    // A saved file from an earlier version still opens: a field this version no longer has is dropped, not converted.
    writeFileSync(file, JSON.stringify({ ...settings, copilotModelSource: "ollama" }));
    assert.deepEqual(await host.invoke("settings"), settings);
    assert.equal(await runCliAsync(["assistant", "settings"]), 0);
    assert.deepEqual(JSON.parse(output.pop()!), settings);
    // The Ollama address changes through the same CLI operation; without a model change it is not validated.
    const local = path.join(root, "local.json");
    writeFileSync(local, JSON.stringify({ ...settings, ollamaUrl: " http://127.0.0.1:9/ollama/ " }));
    assert.equal(await runCliAsync(["assistant", "configure", "--file", local]), 0);
    assert.deepEqual(JSON.parse(output.pop()!), { ...settings, ollamaUrl: "http://127.0.0.1:9/ollama" });
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { ...settings, ollamaUrl: "http://127.0.0.1:9/ollama" }, "the next save writes no removed field");
    writeFileSync(local, JSON.stringify({ ...settings, copilotModelSource: "account" }));
    assert.notEqual(await runCliAsync(["assistant", "configure", "--file", local]), 0);
    writeFileSync(local, JSON.stringify(settings));
    assert.equal(await runCliAsync(["assistant", "configure", "--file", local]), 0);
    assert.deepEqual(JSON.parse(output.pop()!), settings);
    // Ollama as the default provider: its model is validated against the Ollama list of the address being saved.
    const ollama = createServer((req, res) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(req.url === "/api/show" ? { thinking: { values: ["low", "high"], default: "high" } } : { models: [{ name: "local-a:4b" }, { name: "local-b:4b" }] })); });
    await listenForFetch(ollama);
    t.after(() => new Promise<void>(resolve => ollama.close(() => resolve())));
    const ollamaUrl = `http://127.0.0.1:${(ollama.address() as import("node:net").AddressInfo).port}`;
    const choose = (provider: string, model: string) => put({ ...settings, provider, reasoningEffort: "medium", ollamaUrl, model });
    const toOllama = await choose("ollama", "local-a:4b");
    assert.equal(toOllama.status, 200, await toOllama.clone().text());
    const adjusted = { ...settings, provider: "ollama", reasoningEffort: "high", ollamaUrl, model: "local-a:4b" };
    assert.deepEqual(await toOllama.json(), adjusted);
    writeFileSync(local, JSON.stringify({ ...adjusted, reasoningEffort: "" }));
    // CLI configure constructs its own Host. Use the same fixture-backed catalog for that call.
    const catalog = t.mock.method(ProviderConnections.prototype, "models", agent.models.bind(agent));
    try { assert.equal(await runCliAsync(["assistant", "configure", "--file", local]), 0); }
    finally { catalog.mock.restore(); }
    assert.deepEqual(JSON.parse(output.pop()!), adjusted);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), adjusted);
    const autoOnOllama = await choose("ollama", "auto");
    assert.equal(autoOnOllama.status, 400); assert.match(await autoOnOllama.text(), /model.*allowed values for ollama: local-a:4b, local-b:4b\./);
    const toAccount = await choose("copilot", "auto");
    assert.equal(toAccount.status, 200, await toAccount.clone().text());
    const localNameOnAccount = await choose("copilot", "local-b:4b");
    assert.equal(localNameOnAccount.status, 400); assert.match(await localNameOnAccount.text(), /model.*allowed values for copilot: auto, copilot-model\./);
    assert.equal((await put(settings)).status, 200);
    assert.equal((await fetch(`${url}/api/worker-plugins`)).status, 404);
    assert.equal((await fetch(`${url}/api/ai-tasks`)).status, 404);
    const { ASSISTANT_TRANSPORT_LIMITS } = await import("../shared/assistant-limits.ts");
    const image = await fetch(`${url}/api/assistant/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "upload-image", mime: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=" }) });
    assert.equal(image.status, 200);
    const uploaded = await image.json() as any;
    assert.equal(path.dirname(uploaded.path), path.join(agent.cwd, "attachments"));
    assert.equal(uploaded.kind, "image");
    const injection = await fetch(`${url}/api/assistant/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "upload-image", mime: "image/png", data: "", path: file }) });
    assert.equal(injection.status, 400);
    const ordinary = await fetch(`${url}/api/assistant/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unknown", message: "x".repeat(128 * 1024) }) });
    assert.equal(ordinary.status, 400); assert.match(await ordinary.text(), /Unknown conversation action/);
    const oversized = await fetch(`${url}/api/assistant/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", message: "x".repeat(ASSISTANT_TRANSPORT_LIMITS.requestBytes) }) });
    assert.equal(oversized.status, 413, "the Host enforces the envelope even when the app transport is bypassed");
  } finally {
    stdout.mock.restore(); stderr.mock.restore();
    if (previous === undefined) delete process.env.LITZIO_ASSISTANT_SETTINGS_FILE; else process.env.LITZIO_ASSISTANT_SETTINGS_FILE = previous;
  }
});

test("provider CLI update is one Host run shared by HTTP and the explicit-Host CLI and keeps a running turn", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-provider-update-")), log = path.join(root, "rpc.jsonl");
  const cli = fakeProviderCli(root, { version: "0.150.0", update: "hang", next: "0.151.0" });
  const agent = new ProviderConnections(path.join(root, "assistant"), { bin: cli.bin, args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url)), log] });
  useReleaseSource(agent, { latest: async () => "0.151.0", timeoutMs: 1500 });
  const host = createAssistantHost(null, path.join(root, "assistant.json"), { agent });
  const server = createServer((req, res) => { void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); }, null, Infinity, undefined, undefined, { assistant: host }); });
  await listenForFetch(server);
  const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); rmSync(root, { recursive: true, force: true }); });
  const post = async (route: string, body: unknown) => fetch(`${origin}${route}`, { method: "POST", headers: { "Content-Type": "application/json", Connection: "close" }, body: JSON.stringify(body) });
  const pids = () => readFileSync(log, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line).pid).filter(Boolean);
  const running = await (await post("/api/assistant/conversations", { action: "send", message: "Draft", folders: [], model: "gpt-6.1-sol", reasoningEffort: "medium" })).json() as any;
  assert.equal(running.turns.at(-1).status, "inProgress");
  const output: string[] = [];
  const stdout = t.mock.method(process.stdout, "write", ((value: string) => { output.push(value); return true; }) as typeof process.stdout.write);
  const stderr = t.mock.method(process.stderr, "write", (() => true) as typeof process.stderr.write);
  try {
    assert.equal(await runCliAsync(["assistant", "provider-update", "codex", "--check", "--host", origin]), 0);
    assert.deepEqual((({ version, versionStatus, latestVersion, update }) => [version, versionStatus, latestVersion, update.status])(JSON.parse(output.pop()!)), ["codex-cli 0.150.0", "available", "0.151.0", "idle"]);
    assert.equal((await post("/api/assistant/provider-update", { provider: "codex" })).status, 200);
    const second = await post("/api/assistant/provider-update", { provider: "codex" });
    assert.equal(second.status, 400); assert.match((await second.json() as any).error, /already running/);
    // Updates name the executable; Ollama's runs through the copilot one.
    const ollama = await post("/api/assistant/provider-update", { provider: "ollama" });
    assert.equal(ollama.status, 400); assert.match((await ollama.json() as any).error, /Invalid AI provider CLI/);
    assert.notEqual(await runCliAsync(["assistant", "provider-update", "ollama", "--check", "--host", origin]), 0);
    assert.equal(await runCliAsync(["assistant", "provider-update", "codex", "--check", "--host", origin]), 0, "--check reports a run without waiting for it");
    assert.equal(JSON.parse(output.pop()!).update.status, "running");
    cli.write({ update: "fail" });
    assert.equal(await runCliAsync(["assistant", "provider-update", "codex", "--host", origin]), 1, "a refused start fails the command");
    while ((await (await fetch(`${origin}/api/assistant/provider-update?provider=codex`)).json() as any).status === "running") await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await runCliAsync(["assistant", "provider-update", "codex", "--host", origin]), 1);
    assert.deepEqual((({ status, exitCode }) => [status, exitCode])(JSON.parse(output.pop()!).update), ["failed", 3]);
    cli.write({ update: "ok" });
    assert.equal(await runCliAsync(["assistant", "provider-update", "codex", "--host", origin]), 0);
    const updated = JSON.parse(output.pop()!);
    assert.deepEqual([updated.update.status, updated.update.deferred, updated.version, updated.versionStatus], ["succeeded", true, "codex-cli 0.151.0", "current"]);
  } finally { stdout.mock.restore(); stderr.mock.restore(); }
  assert.equal(pids().length, 1, "the running turn keeps its process");
  await agent.client.request("fixture/finish", { threadId: running.id });
  await post("/api/assistant/conversations", { action: "resume", id: running.id });
  const next = await (await post("/api/assistant/conversations", { action: "send", id: running.id, message: "Continue", folders: [], model: "gpt-6.1-sol", reasoningEffort: "medium" })).json() as any;
  assert.equal(next.turns.at(-1).status, "inProgress");
  assert.equal(pids().length, 2, "the next send after the turn launches the updated CLI");
});

test("question metadata and answers use the same HTTP and explicit-Host CLI conversation operations", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-question-http-"));
  const agent = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url))] });
  const host = createAssistantHost(null, path.join(root, "assistant.json"), { agent });
  const server = createServer((req, res) => { void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); }, null, Infinity, undefined, undefined, { assistant: host }); });
  await listenForFetch(server);
  const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); rmSync(root, { recursive: true, force: true }); });
  const post = async (body: unknown) => (await fetch(`${origin}/api/assistant/conversations`, { method: "POST", headers: { "Content-Type": "application/json", Connection: "close" }, body: JSON.stringify(body) })).json() as Promise<any>;
  const c = await post({ action: "send", message: "Ask about travel", folders: [], model: "gpt-6.1-sol", reasoningEffort: "medium" });
  const questions = [{ title: "예시 여행 계획에서 어떤 여행 방식을 선호하시나요?", options: ["휴식 중심", "관광 중심", "음식 탐방"] }];
  await agent.client.request("fixture/async-question", { threadId: c.id, itemId: "http-travel-question", questions });
  const snapshot = await (await fetch(`${origin}/api/assistant/conversations?id=${c.id}`, { headers: { Connection: "close" } })).json() as any;
  const record = snapshot.turns[0].items.find((item: any) => item.id === "http-travel-question").question;
  assert.deepEqual(record.sourceQuestions, questions);
  assert.equal(snapshot.userInput.requestId, record.requestId);
  const answerFile = path.join(root, "answer.json");
  writeFileSync(answerFile, JSON.stringify({ turnId: record.turnId, requestId: record.requestId, answers: { "0": { answers: ["음식 탐방"] } } }));
  const output: string[] = [];
  const stdout = t.mock.method(process.stdout, "write", ((value: string) => { output.push(value); return true; }) as typeof process.stdout.write);
  try {
    assert.equal(await runCliAsync(["assistant", "answer", c.id, "--file", answerFile, "--host", origin]), 0);
    assert.equal(JSON.parse(output.pop()!).turns[0].items.find((item: any) => item.id === "http-travel-question").question.status, "answered");
    await agent.client.request("fixture/finish", { threadId: c.id });
    await post({ action: "resume", id: c.id });
    assert.equal(await runCliAsync(["assistant", "conversation", c.id, "--host", origin]), 0);
    assert.deepEqual(JSON.parse(output.pop()!).turns[0].items.find((item: any) => item.id === "http-travel-question").question.answers, { "0": { answers: ["음식 탐방"] } });
  } finally { stdout.mock.restore(); }
  // Restore an already oversized provider history, then GET and continue the same conversation.
  // Reuse this fixture process/HTTP path rather than launching another provider.
  const {ASSISTANT_TRANSPORT_LIMITS}=await import("../shared/assistant-limits.ts");
  const legacy={type:"dynamicToolCall",id:"legacy-tool",tool:"fixture_read",status:"completed",success:true,contentItems:[{type:"inputText",text:"x".repeat(ASSISTANT_TRANSPORT_LIMITS.responseBytes+1)}]};
  const request=agent.client.request.bind(agent.client);
  t.mock.method(agent.client,"request",async(method:string,args:any)=>method==="thread/turns/list" ? {data:[{id:record.turnId,status:"completed",items:[legacy]}],nextCursor:null} : request(method,args));
  const resumed=await post({action:"resume",id:c.id});
  assert.equal(resumed.id,c.id);assert.ok(Buffer.byteLength(JSON.stringify(resumed))<ASSISTANT_TRANSPORT_LIMITS.responseBytes);
  assert.match(resumed.turns[0].items[0].toolResult.contentItems[0].text,/omitted/);
  assert.equal(legacy.contentItems[0].text.length,ASSISTANT_TRANSPORT_LIMITS.responseBytes+1,"display projection does not modify provider history");
  const loaded=await fetch(`${origin}/api/assistant/conversations?id=${c.id}`).then(r=>r.json());assert.equal(loaded.id,c.id);
  const continued=await post({action:"send",id:c.id,submissionId:"continue-large-review",message:"Continue review",folders:[],model:"gpt-6.1-sol",reasoningEffort:"medium"});
  assert.equal(continued.submission.status,"accepted");assert.equal(continued.conversation.id,c.id);
});

test("history rename, archive and unarchive keep order over HTTP and explicit-Host CLI; sending unarchives", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-history-archive-"));
  const agent = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url))] });
  const host = createAssistantHost(null, path.join(root, "assistant.json"), { agent });
  const server = createServer((req, res) => { void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); }, null, Infinity, undefined, undefined, { assistant: host }); });
  await listenForFetch(server);
  const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); rmSync(root, { recursive: true, force: true }); });
  const post = async (body: unknown) => {
    const response = await fetch(`${origin}/api/assistant/conversations`, { method: "POST", headers: { "Content-Type": "application/json", Connection: "close" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  };
  const listed = async () => (await fetch(`${origin}/api/assistant/conversations`, { headers: { Connection: "close" } })).json() as Promise<any[]>;
  const send = { folders: [], model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const older = (await post({ action: "send", message: "Draft the report", ...send })).body;
  await agent.client.request("fixture/finish", { threadId: older.id });
  const running = (await post({ action: "send", message: "Outline", ...send })).body;
  const before = await listed();
  assert.deepEqual(before.map(entry => entry.id), [running.id, older.id]);

  const busy = await post({ action: "archive", id: running.id });
  assert.equal(busy.status, 400); assert.match(busy.body.error, /Stop the Assistant response before archiving/);
  assert.equal((await post({ action: "rename", id: running.id, title: "  Weekly outline  " })).body.title, "Weekly outline", "renaming is allowed while responding");
  assert.equal((await fetch(`${origin}/api/assistant/conversations?id=${running.id}`).then(response => response.json()) as any).title, "Weekly outline");
  for (const title of ["   ", "x".repeat(81), 3]) assert.equal((await post({ action: "rename", id: older.id, title })).status, 400);
  assert.equal((await post({ action: "rename", id: older.id, title: "x".repeat(80) })).status, 200);
  assert.match((await post({ action: "archive", id: "missing" })).body.error, /not found/);

  const output: string[] = [];
  const stdout = t.mock.method(process.stdout, "write", ((value: string) => { output.push(value); return true; }) as typeof process.stdout.write);
  const stderr = t.mock.method(process.stderr, "write", (() => true) as typeof process.stderr.write);
  try {
    assert.equal(await runCliAsync(["assistant", "rename", older.id, "--title", "Report", "--host", origin]), 0);
    assert.equal(JSON.parse(output.pop()!).title, "Report");
    assert.notEqual(await runCliAsync(["assistant", "rename", older.id, "--title", " ", "--host", origin]), 0);
    assert.equal(await runCliAsync(["assistant", "archive", older.id, "--host", origin]), 0);
    assert.equal(typeof JSON.parse(output.pop()!).archivedAt, "number");
  } finally { stdout.mock.restore(); stderr.mock.restore(); }
  const archived = await listed();
  assert.deepEqual(archived.map(entry => [entry.id, entry.updatedAt]), before.map(entry => [entry.id, entry.updatedAt]), "rename and archive keep order and updatedAt");
  assert.equal(archived[1].title, "Report"); assert.equal(typeof archived[1].archivedAt, "number"); assert.equal(archived[0].archivedAt, undefined);

  assert.equal((await post({ action: "unarchive", id: older.id })).body.archivedAt, undefined);
  assert.equal((await post({ action: "archive", id: older.id })).status, 200);
  await agent.client.request("fixture/finish", { threadId: running.id });
  await post({ action: "resume", id: older.id });
  const continued = await post({ action: "send", id: older.id, submissionId: "archived-continue", message: "Continue", ...send });
  assert.equal(continued.body.submission.status, "accepted");
  const after = (await listed()).find(entry => entry.id === older.id);
  assert.equal(after.archivedAt, undefined, "sending to an archived conversation unarchives it");
  assert.equal(after.title, "Report");

  // A slow reopen that started before a rename must not restore the old title.
  const request = agent.client.request.bind(agent.client);
  let held = false, entered!: () => void, release!: () => void;
  const entering = new Promise<void>(resolve => { entered = resolve; }), released = new Promise<void>(resolve => { release = resolve; });
  const holdTurns = t.mock.method(agent.client, "request", async (method: string, params: any) => {
    if (method === "thread/turns/list" && !held) { held = true; entered(); await released; }
    return request(method, params);
  });
  const slow = post({ action: "resume", id: running.id });
  await entering;
  assert.equal((await post({ action: "resume", id: running.id })).status, 200);
  assert.equal((await post({ action: "rename", id: running.id, title: "Renamed while reopening" })).status, 200);
  release();
  assert.equal((await slow).status, 200);
  assert.equal((await fetch(`${origin}/api/assistant/conversations?id=${running.id}`).then(response => response.json()) as any).title, "Renamed while reopening");
  assert.equal((await post({ action: "send", id: running.id, submissionId: "after-overlapping-resume", message: "Next", ...send })).body.submission.status, "accepted");
  assert.equal((await listed()).find(entry => entry.id === running.id).title, "Renamed while reopening", "the next send keeps the rename");
  holdTurns.mock.restore();

  // A send still waiting for the provider saves its own object later; only rename changes a stored title.
  await agent.client.request("fixture/finish", { threadId: running.id });
  let startHeld = false, startEntered!: () => void, startRelease!: () => void;
  const startEntering = new Promise<void>(resolve => { startEntered = resolve; }), startReleased = new Promise<void>(resolve => { startRelease = resolve; });
  t.mock.method(agent.client, "request", async (method: string, params: any) => {
    if (method === "turn/start" && !startHeld) { startHeld = true; startEntered(); await startReleased; }
    return request(method, params);
  });
  const waiting = post({ action: "send", id: running.id, message: "Later", ...send });
  await startEntering;
  assert.equal((await post({ action: "resume", id: running.id })).status, 200);
  assert.equal((await post({ action: "rename", id: running.id, title: "Renamed during send" })).status, 200);
  startRelease();
  assert.equal((await waiting).status, 200);
  assert.equal((await listed()).find(entry => entry.id === running.id).title, "Renamed during send", "a send admitted after a rename keeps the rename");
});

test("unavailable provider rejects new work with a reason; settings do not close admitted conversations", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-ai-lifetime-"));
  const log = path.join(root, "provider.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath,
    args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url)), log] });
  const lines: string[] = [];
  const host = createAssistantHost(null, path.join(root, "ai.json"), { agent: connection, log: line => lines.push(line) });
  t.after(async () => { await host.close(); rmSync(root, { recursive: true, force: true }); });
  const settings = { ...await host.invoke("settings"), model: "gpt-6.1-sol", reasoningEffort: "medium" };
  await host.invoke("configure", settings);
  const cachedArgs = { provider: "codex", cache: "prefer" };
  await t.test("reopening observes logout and login on the same Host", async t => {
    let now = Date.now(), signedIn = true;
    t.mock.method(Date, "now", () => now);
    const checks = t.mock.method(connection, "diagnostics", async () => ({
      provider: "codex" as const, connected: true, path: null, version: null, checkedAt: now,
      account: signedIn ? { type: "chatgpt" } : null,
    }));
    await host.invoke("assistantDiagnostics", { provider: "codex" });
    for (const next of [false, true]) {
      now += 3_001;
      signedIn = next;
      assert.equal(Boolean((await host.invoke("assistantDiagnostics", cachedArgs)).account), !next);
      const count = checks.mock.callCount();
      assert.equal(count, next ? 3 : 2, "opening starts its own background recheck");
      const refreshed = await host.invoke("assistantDiagnostics", { ...cachedArgs, cache: "revalidate" });
      assert.equal(Boolean(refreshed.account), next);
      assert.equal(checks.mock.callCount(), count, "the view joins the background recheck");
    }
    await host.invoke("assistantDiagnostics", { ...cachedArgs, cache: "revalidate" });
    assert.equal(checks.mock.callCount(), 3, "a recently completed check is reused");
  });
  await t.test("a removed model invalidates the list on rejected send", async t => {
    const initial = await host.invoke("assistantModels", cachedArgs);
    const replacement = { ...initial.models[0], id: "replacement", model: "replacement" };
    t.mock.method(connection, "models", async () => ({ ...initial, models: [replacement] }));
    await assert.rejects(host.invoke("assistantConversation", { action: "send", message: "Removed model", folders: [root], model: settings.model, reasoningEffort: settings.reasoningEffort }), /Invalid AI model/);
    assert.deepEqual((await host.invoke("assistantModels", cachedArgs)).models, [replacement]);
  });
  const conversation = await host.invoke("assistantConversation", { action: "send", message: "Question", folders: [root], model: settings.model, reasoningEffort: settings.reasoningEffort });
  const id = conversation.id, turn = conversation.turns[0];
  await connection.client.request("fixture/async-question", { threadId: id, itemId: "provider-switch-question", questions: [{ title: "Choose before switching", options: ["A", "B"] }] });
  const pid = JSON.parse(readFileSync(log, "utf8").split("\n")[0]!).pid as number;
  assert.equal(typeof pid, "number");
  assert.equal((await host.invoke("assistantDiagnostics", { provider: "codex", cache: "prefer" })).connected, true);
  let completeCheck!: () => void;
  const gate = new Promise<void>(resolve => { completeCheck = resolve; });
  const diagnostics = t.mock.method(connection, "diagnostics", async (provider?: "codex" | "copilot") => {
    await gate;
    return { provider: provider ?? "codex", connected: false, path: null, version: null, checkedAt: Date.now(), error: "Fixture provider unavailable" };
  });
  const cached = await host.invoke("assistantDiagnostics", { provider: "codex", cache: "prefer" });
  assert.equal(cached.connected, true);
  const first = host.invoke("assistantDiagnostics", { provider: "copilot", cache: "prefer" });
  const second = host.invoke("assistantDiagnostics", { provider: "copilot", cache: "prefer" });
  assert.equal(diagnostics.mock.callCount(), 1, "cold consumers share one check");
  completeCheck();
  assert.deepEqual(await first, await second);
  await assert.rejects(host.invoke("assistantConversation", { action: "send", provider: "codex", message: "New work", folders: [root], model: settings.model, reasoningEffort: settings.reasoningEffort }), /AI provider codex is unavailable: Fixture provider unavailable/);
  // A refused send writes the stage and the Host's kind, never the provider's reason or the message.
  const text = lines.join("\n");
  assert.ok(lines.includes("assistant turn failed provider=codex session=new stage=check error=unavailable"), text);
  assert.ok(lines.some(line => /^assistant turn failed provider=codex session=new stage=prepare error=model-unavailable elapsedMs=\d+$/.test(line)), text);
  for (const value of ["Fixture provider unavailable", "New work", "Removed model", "Question", root]) assert.equal(text.includes(value), false, value);
  const refreshed = await host.invoke("assistantDiagnostics", { provider: "codex", cache: "prefer" });
  assert.equal(refreshed.connected, false);
  await host.invoke("configure", { ...settings, permissionMode: "read-only" });
  assert.equal(conversation.userInput?.requestId, "provider-switch-question");
  t.mock.method(connection, "models", async () => ({ provider: "copilot" as const, updatedAt: Date.now(), models: [{ id: "auto", model: "auto", displayName: "Auto", description: "Fixture", defaultReasoningEffort: "medium", supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Fixture" }] }] }));
  await host.invoke("configure", { ...settings, provider: "copilot", model: "auto" });
  assert.equal(conversation.userInput?.requestId, "provider-switch-question");
  assert.equal(turn.status, "inProgress", "provider defaults do not end an admitted turn");
  assert.equal(JSON.parse(readFileSync(path.join(connection.cwd, "conversations.json"), "utf8"))[0].questions[0].question.status, "pending", "provider defaults do not close unanswered questions");
  assert.doesNotThrow(() => process.kill(pid, 0));
  assert.equal((await host.invoke("assistantConversations", { id })).turns[0], turn);
  await assert.rejects(host.invoke("assistantConversation", { action: "send", message: "New work", folders: [root], model: settings.model, reasoningEffort: settings.reasoningEffort }), /AI provider copilot is unavailable: Fixture provider unavailable/);
  await host.invoke("assistantConversation", { action: "interrupt", id });
  await Promise.all([host.close(), host.close()]);
  await host.close();
  assert.throws(() => process.kill(pid!, 0), "daemon shutdown waits for its exact provider process");
  await assert.rejects(host.invoke("assistantConversations", {}), /closing/);
});

test("plugin and view services work without an assistant and survive assistant shutdown failure", async t => {
  const { createHostServices } = await import("../server/host-services.ts");

  const root = mkdtempSync(path.join(tmpdir(), "litzio-services-"));
  const previous = process.env.LITZIO_DATA_DIR;
  process.env.LITZIO_DATA_DIR = root;
  const services = createHostServices(null);
  if (previous === undefined) delete process.env.LITZIO_DATA_DIR; else process.env.LITZIO_DATA_DIR = previous;
  // Pass only these services: no assistant exists in the HTTP handler.
  const server = createServer((req, res) => { void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); }, null, Infinity, undefined, undefined, { plugins: services.plugins, views: services.views }); });
  await listenForFetch(server);
  const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await services.plugins.close(); rmSync(root, { recursive: true, force: true }); });
  assert.equal((await fetch(`${url}/api/plugins`)).status, 200);
  assert.equal((await fetch(`${url}/api/assistant/settings`)).status, 404);
  const response = await fetch(`${url}/api/plugin-screens`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "screens" }) });
  assert.equal(response.status, 200);
  await services.assistant.close();
  assert.deepEqual((await services.plugins.invoke("pluginsList")).plugins.map((p: any) => p.id), (await (await fetch(`${url}/api/plugins`)).json()).plugins.map((p: any) => p.id));
  assert.equal((await services.views.execute({ action: "screens" })).receipt.outcome, "success");
  // A service failure still lets Host shutdown close the independent runtime.
  const assistantClose = t.mock.method(services.assistant, "close", async () => { throw new Error("fixture close failed"); });
  const closing = services.close();
  await Promise.all([assert.rejects(closing, /could not close/), assert.rejects(services.close(), /could not close/)]);
  await assert.rejects(services.close(), /could not close/);
  assert.equal(assistantClose.mock.callCount(), 1, "all callers retain the same shutdown failure without running cleanup again");
  await assert.rejects(services.plugins.invoke("pluginsList"), /closing/);
});


// Provider identity/filesystem risks live here; browser coverage checks only explicit UI dispatch.
test("provider log lookup binds Litzio index, provider RPC ID and original metadata", async t => {
  const { writeFileSync, mkdirSync, symlinkSync, unlinkSync } = await import("node:fs");
  const { validateProviderLog } = await import("../server/provider-session-log.ts");
  const directory = mkdtempSync(path.join(tmpdir(), "litzio-provider-log-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const id = "00000000-0000-4000-8000-000000000001", other = "00000000-0000-4000-8000-000000000002";
  const log = path.join(directory, "session.jsonl");
  writeFileSync(log, JSON.stringify({ type: "session_meta", payload: { id } }) + "\n");
  assert.equal(validateProviderLog(log, "codex", id), log);
  assert.throws(() => validateProviderLog(log, "codex", other), /another session/);
  assert.throws(() => validateProviderLog(log, "copilot", id), /another session/);
  assert.throws(() => validateProviderLog(log, "codex", "../bad"), /Invalid/);
  if (process.platform === "win32") {
    for (const unsupported of [
      String.raw`\\server\share\session.jsonl`,
      String.raw`\\?\UNC\server\share\session.jsonl`,
      "\\\\.\\" + log,
      String.raw`\\?\Volume{00000000-0000-4000-8000-000000000001}\session.jsonl`,
    ]) {
      assert.throws(() => validateProviderLog(unsupported, "codex", id), /Invalid provider log location/);
    }
  }
  const link = path.join(directory, "linked");
  mkdirSync(path.join(directory, "original"));
  symlinkSync(path.join(directory, "original"), link, "junction");
  writeFileSync(path.join(link, "log.jsonl"), JSON.stringify({ type: "session_meta", payload: { id } }) + "\n");
  assert.throws(() => validateProviderLog(path.join(link, "log.jsonl"), "codex", id), /Linked/);
  const agent = new ProviderConnections(directory);
  t.after(() => agent.close());
  const host = createAssistantHost(undefined, undefined, { agent }); t.after(() => host.close());
  writeFileSync(path.join(directory, "conversations.json"), JSON.stringify([{ id, provider: "codex" }]));
  const providerPath = process.platform === "win32" ? "\\\\?\\" + log : log;
  const rpc = t.mock.method(agent.client, "request", async () => ({ thread: { id, path: providerPath } }));
  const lookup = (value = id, provider = "codex") => host.invoke("assistantConversation", { action: "provider-log", id: value, provider });
  assert.equal((await lookup()).path, log);
  const server = createServer((req, res) => { void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); }, null, Infinity, undefined, undefined, { assistant: host }); });
  await listenForFetch(server);
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const cli = await promisify(execFile)(process.execPath, [fileURLToPath(import.meta.resolve("tsx/cli")), fileURLToPath(new URL("../../../packages/cli/src/cli.ts", import.meta.url)), "assistant", "provider-log", id, "codex", "--host", url], { windowsHide: true });
  assert.equal(JSON.parse(cli.stdout).path, log);
  const calls = rpc.mock.callCount();
  assert.equal((await lookup(other)).reason, "unknown"); assert.equal((await lookup(id, "copilot")).reason, "unknown");
  assert.equal(rpc.mock.callCount(), calls);
  rpc.mock.mockImplementation(async () => ({ thread: { id: other, path: log } }));
  assert.equal((await lookup()).reason, "unverified");
  rpc.mock.mockImplementation(async () => { throw Object.assign(new Error("sensitive auth details"), { code: "EACCES" }); });
  assert.equal((await lookup()).reason, "denied");
  rpc.mock.mockImplementation(async () => ({ thread: { id, path: log } }));
  unlinkSync(log); assert.equal((await lookup()).reason, "missing");
  writeFileSync(log, JSON.stringify({ type: "session.start", data: { sessionId: id } }) + "\n");
  assert.equal(validateProviderLog(log, "copilot", id), log);
  assert.equal(validateProviderLog(log, "ollama", id), log, "Ollama's log is the Copilot CLI's");
  // The CLI accepts ollama and reaches the same Host check, which binds the index's provider.
  writeFileSync(path.join(directory, "conversations.json"), JSON.stringify([{ id, provider: "ollama" }]));
  assert.equal((await lookup(id, "copilot")).reason, "unknown");
  const ollama = await promisify(execFile)(process.execPath, [fileURLToPath(import.meta.resolve("tsx/cli")), fileURLToPath(new URL("../../../packages/cli/src/cli.ts", import.meta.url)), "assistant", "provider-log", id, "ollama", "--host", url], { windowsHide: true }).catch(error => error);
  assert.deepEqual(JSON.parse(ollama.stdout), { available: false, reason: "missing" }, "the Copilot CLI log location is checked for an Ollama conversation");
});

test("assistant shutdown rejects a send still waiting for plugin startup before provider admission", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-admission-close-"));
  const connection = new ProviderConnections(path.join(root, "assistant"));
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const plugins = { start: async () => { entered(); await gate; } } as unknown as import("../server/plugin-service.ts").PluginService;
  const diagnostics = t.mock.method(connection, "diagnostics", async () => { throw new Error("provider admission after shutdown"); });
  const host = createAssistantHost(null, path.join(root, "settings.json"), { agent: connection, plugins });
  t.after(async () => { release(); await host.close(); rmSync(root, { recursive: true, force: true }); });
  const sending = assert.rejects(host.invoke("assistantConversation", { action: "send", message: "Question", folders: [] }), /closing/);
  await waiting;
  await Promise.all([host.close(), host.close()]);
  release(); await sending;
  assert.equal(diagnostics.mock.callCount(), 0, "no provider resources may be created after close");
});


test("submission IDs survive event-before-response, duplicate sends and uncertain acceptance", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-submission-"));
  const log = path.join(root, "rpc.jsonl");
  const agent = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath,
    args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url)), log] });
  const host = createAssistantHost(null, path.join(root, "ai.json"), { agent });
  t.after(async () => { await host.close(); rmSync(root, { recursive: true, force: true }); });
  const input = { action: "send", submissionId: "submission-first", message: "Same message", folders: [root], model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const originalRequest = agent.client.request.bind(agent.client);
  let release!: () => void, observed!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const observation = new Promise<void>(resolve => { observed = resolve; });
  agent.client.on("notification", (method, params) => { if (method === "item/completed" && params.item?.type === "userMessage") observed(); });
  const delayed = t.mock.method(agent.client, "request", async (method: string, params: any) => {
    const result = await originalRequest(method, params);
    if (method === "turn/start") await gate;
    return result;
  });
  const sending = host.invoke("assistantConversation", input);
  const duplicate = host.invoke("assistantConversation", input);
  await observation;
  const early = await host.invoke("assistantConversations", { submissionId: input.submissionId });
  assert.equal(early.submission.status, "accepted", "provider observation identifies acceptance before RPC returns");
  release();
  const first = await sending;
  await duplicate;
  delayed.mock.restore();
  assert.equal(first.submission.status, "accepted");
  const id = first.conversation.id;
  const users = () => first.conversation.turns.flatMap((turn: any) => turn.items).filter((item: any) => item.kind === "user");
  assert.equal(users().length, 1);
  assert.equal(users()[0].submissionId, input.submissionId);
  assert.equal(first.submission.itemId, users()[0].id);
  await host.invoke("assistantConversation", input);
  assert.equal(users().length, 1, "the same ID never calls the provider twice");
  const steer = await host.invoke("assistantConversation", { ...input, id, submissionId: "submission-steer" });
  assert.equal(steer.submission.status, "accepted");
  assert.equal(users().length, 2, "identical text with a new ID is a separate steer");
  assert.equal((await host.invoke("assistantConversations", { submissionId: input.submissionId })).conversation.id, id);
  const rejected = await host.invoke("assistantConversation", { ...input, id, submissionId: "submission-rejected", reasoningEffort: "invalid" });
  assert.equal(rejected.submission.status, "rejected");
  const retried = await host.invoke("assistantConversation", { ...input, id, submissionId: "submission-rejected" });
  assert.equal(retried.submission.status, "accepted", "a pre-dispatch rejection can be retried explicitly");
  const original = agent.client.request.bind(agent.client);
  let attempts = 0;
  t.mock.method(agent.client, "request", async (method: string, params: any) => {
    if (method === "turn/steer") { attempts++; throw new Error("Response lost"); }
    return original(method, params);
  });
  const uncertain = await host.invoke("assistantConversation", { ...input, id, submissionId: "submission-uncertain" });
  assert.equal(uncertain.submission.status, "unknown");
  assert.equal((await host.invoke("assistantConversations", { submissionId: "submission-uncertain" })).submission.status, "unknown");
  assert.equal((await host.invoke("assistantConversations", { submissionId: "not-seen" })).submission.status, "unknown");
  await host.invoke("assistantConversation", { ...input, id, submissionId: "submission-uncertain" });
  assert.equal(attempts, 1, "explicit retry of uncertain admission never dispatches twice");
  // The reverse order is valid too: RPC accepts first, then the provider user item arrives.
  let providerInput: any;
  t.mock.method(agent.client, "request", async (method: string, params: any) => {
    if (method === "turn/steer") { providerInput = params; return { turnId: first.conversation.turns[0].id }; }
    return original(method, params);
  });
  const late = await host.invoke("assistantConversation", { ...input, id, submissionId: "submission-late-item" });
  assert.equal(late.submission.status, "accepted");
  assert.equal(late.submission.itemId, undefined);
  agent.client.emit("notification", "item/completed", { threadId: id, turnId: first.conversation.turns[0].id,
    item: { id: "late-user", type: "userMessage", content: providerInput.input } });
  const reconciled = await host.invoke("assistantConversations", { submissionId: "submission-late-item" });
  assert.equal(reconciled.submission.itemId, "late-user");
  assert.equal(users().at(-1).submissionId, "submission-late-item");
  // Keep App's submission ID across a real Host/provider lifecycle restart.
  await host.close();
  const replacementAgent = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath,
    args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url)), log] });
  const replacement = createAssistantHost(null, path.join(root, "ai.json"), { agent: replacementAgent });
  t.after(() => replacement.close());
  const starts = () => readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(entry => entry.method === "turn/start").length;
  const beforeRestartRetry = starts();
  const missing = await replacement.invoke("assistantConversations", { submissionId: input.submissionId });
  assert.equal(missing.submission.status, "unknown");
  assert.equal(starts(), beforeRestartRetry, "receipt lookup after restart cannot dispatch forgotten work");
  const newInput = { ...input, submissionId: "explicit-new-submission" };
  const [newSend, newDuplicate] = await Promise.all([
    replacement.invoke("assistantConversation", newInput), replacement.invoke("assistantConversation", newInput),
  ]);
  assert.equal(newSend.submission.status, "accepted");
  assert.equal(newDuplicate.conversation.id, newSend.conversation.id);
  assert.notEqual(newSend.conversation.id, id);
  assert.equal(starts(), beforeRestartRetry + 1, "explicit new send dispatches once even with a concurrent duplicate");
  await replacement.close();
});



test("image import shares add-only Host and CLI behavior with document tools and folder permissions", async t => {
  const { executeDocumentTool, documentFolders } = await import("../server/assistant-document-tools.ts");
  const { RootAccess, LOCAL_FILE_ACCESS } = await import("../server/file-access.ts");
  const root = mkdtempSync(path.join(tmpdir(), "image-import-"));
  const outside = mkdtempSync(path.join(tmpdir(), "image-outside-"));
  t.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });
  const file = path.join(root, "document.md"), source = path.join(root, "image.png"), external = path.join(outside, "external.png");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64");
  writeFileSync(file, "---\nlitzio: 1\n---\n\nOriginal.\n"); writeFileSync(source, png); writeFileSync(external, png);
  const access = LOCAL_FILE_ACCESS, folders = documentFolders([root], "opened-folders", access);
  const invoke = (input: unknown, override = {}) => executeDocumentTool("import_document_image", input, { folders, access, permissionMode: "opened-folders", ...override }) as any;
  const input = { path: file, source };
  assert.equal(invoke(input, { permissionMode: "read-only" }).errorKind, "forbidden");
  const first = invoke(input), second = invoke(input);
  assert.equal(first.path, "./assets/image.png"); assert.equal(second.path, "./assets/image-2.png");
  assert.deepEqual(readFileSync(path.join(root, first.path)), png);
  assert.deepEqual(readFileSync(source), png);
  assert.equal(invoke({ path: file, source: external }).errorKind, "forbidden");
  assert.equal(invoke({ path: file, source: external }, { permissionMode: "full-access", folders: documentFolders([], "full-access", access) }).receipt.outcome, "success");
  assert.equal(invoke({ path: file, source: external }, { permissionMode: "full-access", access: new RootAccess([root]) }).errorKind, "forbidden");
  const fullScope = { permissionMode: "full-access", access: new RootAccess([root, outside]), folders: documentFolders([root], "full-access", new RootAccess([root, outside])) };
  const created = path.join(outside, "created.md");
  assert.equal((executeDocumentTool("create_document", { path: created, title: "Outside", blocks: [] }, fullScope) as any).receipt.outcome, "success");
  assert.match((executeDocumentTool("read_document", { path: created }, fullScope) as any).source, /Outside/);
  assert.ok((executeDocumentTool("list_documents", { path: outside }, fullScope) as any).entries.some((entry: any) => entry.path === created));
  assert.throws(() => executeDocumentTool("read_document", { path: created }, { folders, access, permissionMode: "opened-folders" }), /outside/);
  const operatorScope = { ...fullScope, access: new RootAccess([root]), folders: documentFolders([root], "full-access", new RootAccess([root])) };
  assert.throws(() => executeDocumentTool("read_document", { path: created }, operatorScope), /outside/);
  writeFileSync(source, "invalid png");
  assert.equal(invoke(input).errorKind, "invalid_input");
  assert.deepEqual(readFileSync(path.join(root, first.path)), png);
  writeFileSync(source, png);
  const output: string[] = [];
  const stdout = t.mock.method(process.stdout, "write", ((value: string) => { output.push(value); return true; }) as typeof process.stdout.write);
  try {
    assert.equal(await runCliAsync(["assistant", "import-image", file, "--source", source]), 0);
    assert.equal(JSON.parse(output.pop()!).path, "./assets/image-3.png");
  } finally { stdout.mock.restore(); }
  assert.match(readFileSync(file, "utf8"), /Original/);
});

test("structured creation reuse Core batches and report image readiness separately", async t => {
  const { executeDocumentTool } = await import("../server/assistant-document-tools.ts");
  const { RootAccess } = await import("../server/file-access.ts");
  const { parse, serialize, getEditableDocument } = await import("@litzio/core");
  const root = mkdtempSync(path.join(tmpdir(), "structured-tools-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const access = new RootAccess([root]);
  const scope = { folders: access, access, permissionMode: "opened-folders" };
  const invoke = (name: string, input: unknown, override = {}) => executeDocumentTool(name, input, { ...scope, ...override }) as any;
  const file = path.join(root, "report.md");
  writeFileSync(path.join(root, "chart.png"), "synthetic image-file presence fixture");
  const operations = [
    { command: "insert-table", at: "end", cells: [["Task", "Status"], ["A", "Done"]], caption: "Weekly work" },
    { command: "insert-list", at: "end", list: { ordered: false, items: [{ content: [{ kind: "text", text: "Next week" }] }] } },
    { command: "insert-figure", at: "end", image: "chart.png", caption: "Old chart" },
    { command: "insert-figure", at: "end", image: "missing.png" },
    { command: "insert-figure", at: "end", image: "../outside.png" },
    { command: "insert-equation", at: "end", latex: "x=1" },
  ];
  const created = invoke("create_document", { path: file, title: "Weekly report", operations });
  assert.equal(created.receipt.outcome, "success", JSON.stringify(created));
  assert.deepEqual(created.readiness.map((entry: any) => entry.status), ["available", "missing_or_unreadable", "unavailable"]);
  assert.equal(serialize(parse(created.source)), created.source);
  assert.deepEqual(getEditableDocument(parse(created.source)).blocks.map(block => block.block), ["table", "list", "figure", "figure", "figure", "equation"]);
  assert.equal(invoke("create_document", { path: file, title: "Conflict", operations }).errorKind, "conflict");
  const bad = path.join(root, "bad.md");
  for (const input of [
    { path: bad, title: "Bad", operations, blocks: [] },
    { path: bad, title: "Bad", operations: [...operations, { command: "remove-block", at: 99999 }] },
    { path: bad, title: "Bad", operations: [] },
  ]) assert.equal(invoke("create_document", input).errorKind, "invalid_input");
  assert.equal(existsSync(bad), false);
  assert.equal(invoke("create_document", { path: bad, title: "Bad", operations }, { permissionMode: "read-only" }).errorKind, "forbidden");

});


test("provider edits retain turn-before content and refuse later or out-of-scope writes", async t => {
  const { AssistantConversations } = await import("../server/assistant-conversations.ts");
  const { RootAccess, canonicalFilePath } = await import("../server/file-access.ts");
  const root = mkdtempSync(path.join(tmpdir(), "litzio-1565-changes-"));
  const folder = path.join(root, "opened");
  const { mkdirSync } = await import("node:fs"); mkdirSync(folder);
  const file = path.join(folder, "sample.txt"), outside = path.join(root,"outside.txt");
  writeFileSync(file,"before\n"); writeFileSync(outside,"outside\n");
  const canonical = canonicalFilePath(file);
  const connection = new ProviderConnections(path.join(root,"assistant"), {bin:process.execPath,args:[fileURLToPath(new URL("./fixtures/codex-app-server.mjs",import.meta.url))]}, {bin:process.execPath,args:[fileURLToPath(new URL("./fixtures/copilot-acp.mjs",import.meta.url))]});
  const history = new AssistantConversations(connection,new RootAccess([root]));
  t.after(async()=>{await history.close();await connection.close();});
  const settings = {provider:"codex" as const,permissionMode:"opened-folders" as const,model:"gpt-6.1-sol",reasoningEffort:"medium",responseLanguage:"en" as const};
  const conversation = await history.send({message:"edit",folders:[folder],model:settings.model,reasoningEffort:settings.reasoningEffort},settings);
  const edit = (target:string,after:string,diff:string) => connection.client.request("fixture/edit",{threadId:conversation.id,path:target,after,diff});
  await edit(file,"after\n","@@ -1 +1 @@\n-before\n+after\n");
  await edit(process.platform === "win32" ? file.toUpperCase().replaceAll("\\", "/") : file,"final\n","@@ -1 +1 @@\n-after\n+final\n");
  const unsafe=path.join(folder,"unsafe.txt");writeFileSync(unsafe,"before\n");
  await edit(unsafe,"after\n","@@ -1 +1 @@\n-wrong\n+different\n");
  await edit(outside,"changed outside\n","@@ -1 +1 @@\n-outside\n+changed outside\n");
  await connection.client.request("fixture/finish",{threadId:conversation.id});
  const turn=conversation.turns[0]!;
  assert.ok(turn.items.some(item=>item.fileChanges?.includes(canonical)));
  assert.equal(turn.items.findLast(item=>item.fileChanges?.length)?.fileChanges?.[0],canonical,"Codex rows use the canonical tab path, including provider case/slash aliases");
  assert.deepEqual(history.fileChange(conversation.id,turn.id,file),{before:"before\n",after:"final\n",sourceOnly:true,changed:false,missing:false});
  assert.throws(()=>history.fileChange(conversation.id,turn.id,outside),/outside the allowed folders/);
  assert.throws(()=>history.fileChange(conversation.id,turn.id,unsafe),/unavailable/);
  assert.throws(()=>history.fileChange(conversation.id,turn.id,file,false,[]),/root/);
  writeFileSync(file,"human edit\n");
  assert.throws(()=>history.fileChange(conversation.id,turn.id,file,true),/refused/);
  assert.equal(readFileSync(file,"utf8"),"human edit\n");
  writeFileSync(file,"final\n"); history.fileChange(conversation.id,turn.id,file,true);
  assert.equal(readFileSync(file,"utf8"),"before\n");
  const acpSettings={...settings,provider:"copilot" as const,model:"copilot-model",reasoningEffort:"low"};
  const acp=await history.send({message:"EDIT FIXTURE "+JSON.stringify(process.platform === "win32" ? file.toUpperCase().replaceAll("\\", "/") : file),folders:[folder],provider:"copilot",model:"copilot-model",reasoningEffort:"low"},acpSettings);
  await new Promise<void>((resolve,reject)=>{const deadline=setTimeout(()=>reject(Error("ACP edit did not finish")),5000);const check=()=>{if(acp.turns.at(-1)?.status!=="inProgress"){clearTimeout(deadline);resolve();}else setTimeout(check,10);};check();});
  const acpTurn=acp.turns[0]!;
  assert.equal(acpTurn.items.find(item=>item.fileChanges)?.fileChanges?.[0],canonical);
  assert.equal((history.fileChange(acp.id,acpTurn.id,file) as any).before,"before\n");
  history.fileChange(acp.id,acpTurn.id,file,true);assert.equal(readFileSync(file,"utf8"),"before\n");
});


test("Codex rejects a repeated-block diff when its declared block changed before completion", async () => {
  const { AssistantFileChanges } = await import("../server/assistant-file-changes.ts");
  const root = mkdtempSync(path.join(tmpdir(), "litzio-1565-hunk-position-"));
  const file = path.join(root, "repeated.txt");
  const original = "1\n2\n3\nA\n4\n5\n6\nseparator\n1\n2\n3\nB\n4\n5\n6\n";
  const assistantResult = original.replace("A\n", "B\n");
  const laterEdit = assistantResult.replace("B\n", "C\n");
  writeFileSync(file, laterEdit);
  const changes = new AssistantFileChanges(null);
  const diff = "@@ -1,7 +1,7 @@\n 1\n 2\n 3\n-A\n+B\n 4\n 5\n 6\n";
  assert.equal(changes.codex("turn", { path: file, kind: { type: "update", move_path: null }, diff }, [root]), false);
  assert.throws(() => changes.compare("turn", file, [root]), /unavailable/);
  assert.throws(() => changes.undo("turn", file, [root]), /unavailable/);
  assert.equal(readFileSync(file, "utf8"), laterEdit, "neither the later first-block edit nor the untouched second block may change");
});


test("Codex refuses a deletion without new-side context after another deletion", async () => {
  const { AssistantFileChanges } = await import("../server/assistant-file-changes.ts");
  const root = mkdtempSync(path.join(tmpdir(), "litzio-1570-strict-diff-"));
  const file = path.join(root, "deleted.txt");
  writeFileSync(file, "A\n");
  const changes = new AssistantFileChanges(null);
  assert.equal(changes.codex("turn", { path: file, kind: { type: "update" }, diff: "@@ -3,1 +2,0 @@\n-C\n" }, [root]), false);
  assert.throws(() => changes.compare("turn", file, [root]), /unavailable/);
  assert.throws(() => changes.undo("turn", file, [root]), /unavailable/);
  assert.equal(readFileSync(file, "utf8"), "A\n");
});


test("Codex declared-span restoration preserves exact text and rejects malformed hunks", async () => {
  const { AssistantFileChanges } = await import("../server/assistant-file-changes.ts");
  const { canonicalFilePath } = await import("../server/file-access.ts");
  const { createTwoFilesPatch } = await import("diff");
  const root = mkdtempSync(path.join(tmpdir(), "litzio-1570-strict-diff-"));
  const file = path.join(root, "text.txt");
  const cases = [
    ["one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n", "ONE\nextra\ntwo\nthree\nfour\nfive\nsix\nseven\nEIGHT\n"],
    ["head\r\nold\r\ntail\r\n", "head\r\nnew\r\ntail\r\n"],
    ["old", "new"],
    ["old\n", "new"],
    ["old", "new\n"],
    ["제목\n이전 내용\n끝\n", "제목\n변경한 내용\n끝\n"],
  ];
  for (const [before, after] of cases) {
    writeFileSync(file, after!);
    const changes = new AssistantFileChanges(null);
    const diff = createTwoFilesPatch("before", "after", before!, after!, undefined, undefined, { context: 1 });
    assert.equal(changes.codex("turn", { path: file, kind: { type: "update" }, diff }, [root]), canonicalFilePath(file), diff);
    assert.equal(changes.compare("turn", file, [root]).before, before);
    changes.undo("turn", file, [root]);
    assert.deepEqual(readFileSync(file), Buffer.from(before!));
  }
  const hunk = "@@ -1 +1 @@\n-old\n+new\n";
  for (const diff of [
    "@@ -4 +4 @@\n-old\n+new\n", // range beyond EOF
    "@@ -1,2 +1 @@\n-old\n+new\n", // header count mismatch
    "@@ -1 +1 @@\n+new\n", // missing declared old line (parser normalization)
    "@@ -2,1 +1,0 @@\n-old\n", // unanchored deletion even within file bounds
    hunk + hunk, // overlapping spans
    "@@ -2 +2 @@\n-old\n+new\n" + hunk, // reversed order
  ]) {
    writeFileSync(file, "new\nnew\n");
    const changes = new AssistantFileChanges(null);
    assert.equal(changes.codex("turn", { path: file, kind: { type: "update" }, diff }, [root]), false, diff);
    assert.throws(() => changes.undo("turn", file, [root]), /unavailable/);
    assert.equal(readFileSync(file, "utf8"), "new\nnew\n");
  }
});
