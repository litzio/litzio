import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { createAssistantHost } from "../server/assistant-host.ts";
import { ProviderConnections } from "../server/provider-connections.ts";
import { handleDocumentRequest } from "../server/document-api.ts";
import { listenForFetch } from "../../../test/helpers/fetch-server.ts";
import { runCliAsync } from "../../../packages/cli/src/cli.ts";

test("Codex skill discovery waits for plugin startup; Copilot retains tool-only support", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-plugin-skill-catalog-"));
  let started = false, discovered = false, release!: () => void;
  const ready = new Promise<void>(resolve => { release = () => { started = true; resolve(); }; });
  const agent = { async skills() { assert.equal(started, true); discovered = true; return { skills: [{ name: "internal", path: "/plugin/SKILL.md", description: "Review" }, { name: "user", path: "/user/SKILL.md", description: "User" }], errors: [] }; }, async close() {} } as unknown as ProviderConnections;
  const plugins = { start: () => ready, host: { skillDisplayName: (file: string) => file === "/plugin/SKILL.md" ? "Docling · review" : undefined } } as import("../server/plugin-service.ts").PluginService;
  const host = createAssistantHost(null, path.join(root, "settings.json"), { agent, plugins });
  try {
    const listing = host.invoke("assistantSkills", { provider: "codex" });
    await Promise.resolve(); assert.equal(discovered, false);
    await assert.rejects(host.invoke("assistantSkills", { provider: "copilot" }), /only with Codex/);
    release(); assert.deepEqual((await listing).skills, [{ name: "internal", path: "/plugin/SKILL.md", description: "Review", displayName: "Docling · review" }, { name: "user", path: "/user/SKILL.md", description: "User" }]);
  } finally { release(); await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("official settings HTTP and CLI share validation and the stored snapshot without registration", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-assistant-host-"));
  const file = path.join(root, "ai.json");
  const agent = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath,
    args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url))] });
  const host = createAssistantHost(null, file, { agent });
  const server = createServer((req, res) => { void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); }, null, Infinity, undefined, undefined, { assistant: host }); });
  await listenForFetch(server);
  const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await host.close(); rmSync(root, { recursive: true, force: true }); });
  const settings = { ...await host.invoke("settings"), model: "gpt-6.1-sol", reasoningEffort: "high" };
  const put = (value: unknown) => fetch(`${url}/api/assistant/settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  assert.equal(settings.permissionMode, "full-access", "unsaved permission defaults to full access");
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
    assert.equal(readFileSync(file, "utf8"), before);
    assert.equal((await fetch(`${url}/api/worker-plugins`)).status, 404);
    assert.equal((await fetch(`${url}/api/ai-tasks`)).status, 404);
    const { ASSISTANT_TRANSPORT_LIMITS } = await import("../shared/assistant-limits.ts");
    const ordinary = await fetch(`${url}/api/assistant/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unknown", message: "x".repeat(128 * 1024) }) });
    assert.equal(ordinary.status, 400); assert.match(await ordinary.text(), /Unknown conversation action/);
    const oversized = await fetch(`${url}/api/assistant/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", message: "x".repeat(ASSISTANT_TRANSPORT_LIMITS.requestBytes) }) });
    assert.equal(oversized.status, 413, "the Host enforces the envelope even when the app transport is bypassed");
  } finally {
    stdout.mock.restore(); stderr.mock.restore();
    if (previous === undefined) delete process.env.LITZIO_ASSISTANT_SETTINGS_FILE; else process.env.LITZIO_ASSISTANT_SETTINGS_FILE = previous;
  }
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
  const legacy={type:"dynamicToolCall",id:"legacy-review",tool:"read_review_document",status:"completed",success:true,contentItems:[{type:"inputText",text:"x".repeat(ASSISTANT_TRANSPORT_LIMITS.responseBytes+1)}]};
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

test("unavailable provider rejects new work with a reason; settings do not close admitted conversations", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-ai-lifetime-"));
  const log = path.join(root, "provider.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath,
    args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url)), log] });
  const host = createAssistantHost(null, path.join(root, "ai.json"), { agent: connection });
  t.after(async () => { await host.close(); rmSync(root, { recursive: true, force: true }); });
  const settings = { ...await host.invoke("settings"), model: "gpt-6.1-sol", reasoningEffort: "medium" };
  await host.invoke("configure", settings);
  const conversation = await host.invoke("assistantConversation", { action: "send", message: "Question", folders: [root], model: settings.model, reasoningEffort: settings.reasoningEffort });
  const id = conversation.id, turn = conversation.turns[0];
  await connection.client.request("fixture/async-question", { threadId: id, itemId: "provider-switch-question", questions: [{ title: "Choose before switching", options: ["A", "B"] }] });
  const pid = JSON.parse(readFileSync(log, "utf8").split("\n")[0]!).pid as number;
  assert.equal(typeof pid, "number");
  t.mock.method(connection, "diagnostics", async (provider?: "codex" | "copilot") => ({ provider: provider ?? "codex", connected: false, path: null, version: null, checkedAt: Date.now(), error: "Fixture provider unavailable" }));
  await host.invoke("configure", { ...settings, permissionMode: "read-only" });
  assert.equal(conversation.userInput?.requestId, "provider-switch-question");
  t.mock.method(connection, "models", async () => ({ provider: "copilot" as const, updatedAt: Date.now(), models: [{ id: "auto", model: "auto", displayName: "Auto", description: "Fixture", defaultReasoningEffort: "medium", supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Fixture" }] }] }));
  await host.invoke("configure", { ...settings, provider: "copilot", model: "auto" });
  assert.equal(conversation.userInput, undefined);
  assert.equal(turn.status, "inProgress", "provider defaults do not end an admitted turn");
  assert.equal(JSON.parse(readFileSync(path.join(connection.cwd, "conversations.json"), "utf8"))[0].questions[0].question.status, "expired", "provider changes persist closure of the previous provider's questions");
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
  const response = await fetch(`${url}/api/views`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "catalog" }) });
  assert.equal(response.status, 200);
  await services.assistant.close();
  assert.deepEqual((await services.plugins.invoke("pluginsList")).plugins.map((p: any) => p.id), (await (await fetch(`${url}/api/plugins`)).json()).plugins.map((p: any) => p.id));
  assert.equal((await services.views.execute({ action: "catalog" })).receipt.outcome, "success");
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
  const link = path.join(directory, "linked");
  mkdirSync(path.join(directory, "original"));
  symlinkSync(path.join(directory, "original"), link, "junction");
  writeFileSync(path.join(link, "log.jsonl"), JSON.stringify({ type: "session_meta", payload: { id } }) + "\n");
  assert.throws(() => validateProviderLog(path.join(link, "log.jsonl"), "codex", id), /Linked/);
  const agent = new ProviderConnections(directory);
  t.after(() => agent.close());
  const host = createAssistantHost(undefined, undefined, { agent }); t.after(() => host.close());
  writeFileSync(path.join(directory, "conversations.json"), JSON.stringify([{ id, provider: "codex" }]));
  const rpc = t.mock.method(agent.client, "request", async () => ({ thread: { id, path: log } }));
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
  const agent = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath,
    args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url))] });
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
  const original = agent.client.request.bind(agent.client);
  t.mock.method(agent.client, "request", async (method: string, params: any) => {
    if (method === "turn/steer") throw new Error("Response lost");
    return original(method, params);
  });
  const uncertain = await host.invoke("assistantConversation", { ...input, id, submissionId: "submission-uncertain" });
  assert.equal(uncertain.submission.status, "unknown");
  assert.equal((await host.invoke("assistantConversations", { submissionId: "submission-uncertain" })).submission.status, "unknown");
  assert.equal((await host.invoke("assistantConversations", { submissionId: "not-seen" })).submission.status, "unknown");
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
});

test("pending copies survive Host restart, preserve originals on conflict, and use CLI semantic edits", async t => {
  const { AssistantChanges } = await import("../server/assistant-changes.ts");
  const { RootAccess, canonicalFilePath } = await import("../server/file-access.ts");
  const { createDocument, serialize } = await import("@litzio/core");
  const { listFolder } = await import("../server/document-api.ts");
  const root = mkdtempSync(path.join(tmpdir(), "assistant-changes-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const original = path.join(root, "original.md"), directory = path.join(root, ".assistant", "changes");
  const source = serialize(createDocument()); writeFileSync(original, source);
  const access = new RootAccess([root]), scope = { folders: access, access, permissionMode: "opened-folders" };
  const changes = new AssistantChanges(directory, access);
  assert.throws(() => changes.start("readonly", original, { ...scope, permissionMode: "read-only" }), /read-only/);
  assert.deepEqual(changes.list("readonly"), []);
  const record = changes.start("one", original, scope);
  assert.equal(changes.start("one", original, scope).copy, record.copy);
  assert.equal(path.dirname(record.copy), path.dirname(canonicalFilePath(original)), "relative attachment base must remain unchanged");
  assert.ok(!listFolder(root, root, access).entries.some(entry => entry.path === record.copy), "hidden copies are not documents in Explorer/search");
  assert.equal(await runCliAsync(["insert-block", record.copy, "--at", "end", "--text", "Edited by CLI"]), 0);
  assert.equal(readFileSync(original, "utf8"), source);
  const restarted = new AssistantChanges(directory, access);
  assert.equal(restarted.list("one")[0]!.copy, record.copy);
  const preview = restarted.preview("one", record.id);
  assert.match(preview.after, /Edited by CLI/);
  writeFileSync(record.copy, preview.after + "\n");
  assert.throws(() => restarted.apply("one", record.id, preview.copyRevision, preview.diskRevision), /changed/);
  const reviewed = restarted.preview("one", record.id);
  restarted.apply("one", record.id, reviewed.copyRevision, reviewed.diskRevision);
  assert.match(readFileSync(original, "utf8"), /Edited by CLI/);
  assert.deepEqual(restarted.list("one"), []);
  const next = restarted.start("one", original, scope);
  writeFileSync(original, source);
  const conflict = restarted.preview("one", next.id);
  assert.equal(conflict.changed, true);
  assert.throws(() => restarted.apply("one", next.id, conflict.copyRevision, conflict.diskRevision), /changed/);
  assert.equal(readFileSync(original, "utf8"), source);
  rmSync(original);
  assert.equal(restarted.preview("one", next.id).missing, true);
  restarted.discard("one", next.id);
  assert.deepEqual(restarted.list("one"), []);
});

test("pending Host operations and explicit-Host CLI share receipts without resuming a provider", async t => {
  const { hostPaths } = await import("../server/host-paths.ts");
  const { RootAccess } = await import("../server/file-access.ts");
  const { createDocument, serialize } = await import("@litzio/core");
  const { mkdirSync, existsSync } = await import("node:fs");
  const root = mkdtempSync(path.join(tmpdir(), "pending-host-"));
  const directory = path.join(root, ".assistant"), original = path.join(root, "original.md");
  mkdirSync(directory); writeFileSync(original, serialize(createDocument()));
  const index = [{ id: "codex", folders: [root], provider: "codex", permissionMode: "opened-folders" }, { id: "copilot", folders: [root], provider: "copilot", permissionMode: "opened-folders" }];
  writeFileSync(path.join(directory, "conversations.json"), JSON.stringify(index));
  const paths = { ...hostPaths(), assistant: directory };
  const host = createAssistantHost(new RootAccess([root]), path.join(root, "settings.json"), { paths });
  const server = createServer((req,res) => { void handleDocumentRequest(req,res,()=>{res.statusCode=404;res.end();}, null, Infinity, undefined, undefined, { assistant: host }); });
  await listenForFetch(server);
  const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); await host.close(); rmSync(root,{recursive:true,force:true}); });
  await assert.rejects(host.invoke("assistantConversation", { action:"changes-start", id:"copilot", path:original }), /Full access/);
  const record = await host.invoke("assistantConversation", { action:"changes-start", id:"codex", path:original });
  assert.equal(await runCliAsync(["assistant","changes","list","codex","--host",origin]),0);
  assert.equal(await runCliAsync(["assistant","changes","inspect","codex","--change",record.id,"--host",origin]),0);
  const inspection = await host.invoke("assistantConversation",{action:"changes-inspect",id:"codex",change:record.id});
  const operationsFile = path.join(root,"operations.json");
  writeFileSync(operationsFile,JSON.stringify([{command:"insert-block",at:"end",text:"Edited through Host CLI"}]));
  const editArgs = ["assistant","changes","edit","codex","--change",record.id,"--copy-revision",inspection.copyRevision,"--operations",operationsFile,"--host",origin];
  assert.equal(await runCliAsync(editArgs),0);
  assert.equal(await runCliAsync(editArgs),1,"stale CLI revision must exit nonzero");
  assert.doesNotMatch(readFileSync(original,"utf8"),/Edited through Host CLI/);
  const preview = await host.invoke("assistantConversation", { action:"changes-preview", id:"codex", change:record.id });
  assert.equal(await runCliAsync(["assistant","changes","apply","codex","--change",record.id,"--copy-revision",preview.copyRevision,"--disk-revision",preview.diskRevision,"--host",origin]),0);
  const next = await host.invoke("assistantConversation", { action:"changes-start", id:"codex", path:original });
  await host.invoke("assistantConversation", {action:"delete",id:"codex"});
  assert.equal(existsSync(next.copy),false);
  assert.equal(JSON.parse(readFileSync(path.join(directory,"conversations.json"),"utf8")).some((entry:any)=>entry.id==="codex"),false);
});


test("staged Host tools edit atomically by conversation receipt with scoped revision checks", async t => {
  const { AssistantChanges } = await import("../server/assistant-changes.ts");
  const { executeDocumentTool } = await import("../server/assistant-document-tools.ts");
  const { RootAccess } = await import("../server/file-access.ts");
  const { textRevision } = await import("@litzio/file-commit");
  const fs = await import("node:fs");
  const root = mkdtempSync(path.join(tmpdir(), "staged-tools-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const original = path.join(root, "a.md"), source = "---\nlitzio: 1\n---\n\nFirst paragraph.\n\nSecond paragraph.\n";
  writeFileSync(original, source);
  const access = new RootAccess([root]), changes = new AssistantChanges(path.join(root, ".changes"), access);
  const scope = { folders: access, access, permissionMode: "opened-folders", changes, conversation: "one" };
  const staged = executeDocumentTool("stage_document", {path: original}, scope) as any;
  const invoke = (name: string, input: any, override = {}) => executeDocumentTool(name, input, {...scope, ...override}) as any;
  const inspected = invoke("inspect_staged_document", {change: staged.id});
  assert.equal(inspected.receipt.outcome, "success");
  const second = inspected.nodes.find((node: any) => node.text === "Second paragraph.");
  assert.ok(second);
  const operations = [{command: "update-node-text", path: second.path.join(","), from: second.text, to: "Revised second paragraph."}];
  const input = {change: staged.id, copyRevision: inspected.copyRevision, operations};
  assert.equal(invoke("edit_staged_document", {...input, path:original}).errorKind, "invalid_input");
  assert.equal(invoke("edit_staged_document", input, {permissionMode:"read-only"}).errorKind, "forbidden");
  assert.equal(invoke("edit_staged_document", input, {conversation:"other"}).errorKind, "unavailable");
  assert.equal(invoke("edit_staged_document", input).receipt.outcome, "success");
  const updated = invoke("inspect_staged_document", {change:staged.id});
  const atomic = invoke("edit_staged_document", {...input, copyRevision:updated.copyRevision, operations:[{command:"insert-block",at:"end",text:"Must roll back"},{command:"remove-block",at:99999}]});
  assert.equal(atomic.errorKind, "invalid_input");
  assert.match(atomic.error, /operation 2/);
  assert.equal(textRevision(readFileSync(staged.copy,"utf8")), updated.copyRevision);
  assert.equal(invoke("edit_staged_document",input).errorKind,"conflict");
  const rename = t.mock.method(fs.default,"renameSync",()=>{throw new Error("rename unavailable");});
  assert.equal(invoke("edit_staged_document",{...input,copyRevision:updated.copyRevision,operations:[{command:"format"}]}).errorKind,"uncertain");
  rename.mock.restore();
  assert.equal(readFileSync(original,"utf8"),source);
  assert.match(readFileSync(staged.copy,"utf8"),/Revised second paragraph/);
  assert.doesNotMatch(readFileSync(staged.copy,"utf8"),/Must roll back/);
  const narrow = path.join(root,"narrow");fs.mkdirSync(narrow);
  assert.equal(invoke("edit_staged_document",input,{folders:new RootAccess([narrow])}).errorKind,"forbidden");
  rmSync(original);
  assert.equal(invoke("inspect_staged_document",{change:staged.id}).receipt.outcome,"success","a deleted original must not prevent inspecting the pending copy");
  assert.equal(invoke("edit_staged_document",{...input,copyRevision:updated.copyRevision,operations:[{command:"insert-block",at:"end",text:"Still staged"}]}).receipt.outcome,"success");
  assert.equal(fs.existsSync(original),false,"editing a copy must not recreate a deleted original");
});

test("provider-neutral tool failures expose executable recovery without replaying writes", async t => {
  const { AssistantConversations } = await import("../server/assistant-conversations.ts");
  const { RootAccess } = await import("../server/file-access.ts");
  const root = mkdtempSync(path.join(tmpdir(),"tool-recovery-"));
  const connection = new ProviderConnections(path.join(root,"assistant"));
  const history:any = new AssistantConversations(connection,null);
  t.after(async()=>{await history.close();await connection.close();rmSync(root,{recursive:true,force:true});});
  const original=path.join(root,"a.md");writeFileSync(original,"---\nlitzio: 1\n---\n\nBefore.\n");
  history.conversations.set("one",{id:"one",title:"fixture",folders:[root],createdAt:1,updatedAt:1,turns:[{id:"turn",status:"inProgress",items:[]}]});
  const scope={folders:new RootAccess([root]),access:null,permissionMode:"opened-folders",turnId:"turn"};
  history.scopes.set("one",scope);
  const invoke=async(tool:string,args:any)=>{
    const result:any=await connection.client.toolCall!({threadId:"one",turnId:"turn",callId:"call",tool,arguments:args});
    return {success:result.success,...JSON.parse(result.contentItems[0].text)};
  };
  const badAction=await invoke("close_tabs",{});
  assert.equal(badAction.success,false);assert.equal(badAction.errorKind,"invalid_input");
  const noWindow=await invoke("close_tabs",{tabIds:"all"});
  assert.equal(noWindow.errorKind,"unavailable");assert.equal(noWindow.recovery.tool,"read_screen_context");
  const {AgentScreenActionRequests}=await import("../server/assistant-screen-action-tools.ts");
  history.screenActions=new AgentScreenActionRequests(1);
  (scope as any).displayClient="window";
  const timedOut=await invoke("close_tabs",{tabIds:"all"});
  assert.equal(timedOut.success,false);assert.equal(timedOut.errorKind,"uncertain");
  assert.equal(timedOut.recovery.tool,"read_screen_context");assert.deepEqual(timedOut.completed,[]);
  assert.equal(timedOut.remaining.length,1);delete (scope as any).displayClient;
  const invalid=await invoke("read_document",{path:"relative"});
  assert.equal(invalid.errorKind,"invalid_input");assert.equal(invalid.recovery.action,"correct_input");
  for(const [tool,input] of [["create_document",{path:"report.md",template:"builtin:ai-report"}],["save_template",{from:"source.md",name:"Relative"}]] as const) {
    const relative=await invoke(tool,input);
    assert.equal(relative.success,false);assert.equal(relative.errorKind,"invalid_input");
    assert.equal(relative.recovery.action,"correct_input");assert.match(relative.recovery.instruction,/absolute path.*opened folder/i);
    const folders=scope.folders;(scope as any).folders=null;
    const missingFolder=await invoke(tool,tool === "create_document" ? {...input,path:path.join(root,"report.md")} : {...input,from:original});
    assert.equal(missingFolder.errorKind,"forbidden");scope.folders=folders;
  }
  const staged=await invoke("stage_document",{path:original});
  const inspected=await invoke("inspect_staged_document",{change:staged.id});
  const args={change:staged.id,copyRevision:inspected.copyRevision,operations:[{command:"insert-block",at:"end",text:"Intended."}]};
  assert.equal((await invoke("edit_staged_document",args)).success,true);
  const conflict=await invoke("edit_staged_document",args);
  assert.equal(conflict.success,false);assert.equal(conflict.errorKind,"conflict");
  const current=await invoke(conflict.recovery.tool,conflict.recovery.arguments);
  assert.equal((await invoke("edit_staged_document",{...args,copyRevision:current.copyRevision})).success,true);
  scope.permissionMode="read-only";
  const forbidden=await invoke("edit_staged_document",args);
  assert.equal(forbidden.errorKind,"forbidden");assert.match(forbidden.recovery.instruction,/Opened folders/);
  scope.permissionMode="opened-folders";
  const location={root,workspace:"a.md",plugin:"fixture",job:"workspace"};
  let writes=0;
  history.plugins={generatedDocuments:{execute:async(input:any)=>{
    if(input.action==="workspace-find")return {targets:[location]};
    if(input.action==="workspace-read")return {receipt:{outcome:"success"},baseline:"a".repeat(64)};
    if(input.action==="workspace-status")return {state:"unknown"};
    writes++;throw new Error("Lost response");
  }}};
  const uncertain=await invoke("run_review_source_evidence",{path:original});
  assert.equal(uncertain.errorKind,"uncertain");assert.equal(uncertain.receipt.outcome,"uncertain");
  assert.match(uncertain.receipt.requestId,/^[a-f0-9-]{36}$/);
  assert.equal(uncertain.recovery.arguments.requestId,uncertain.receipt.requestId);
  const status=await invoke(uncertain.recovery.tool,uncertain.recovery.arguments);
  assert.equal(status.errorKind,"uncertain");assert.equal(writes,1,"status observation must never replay a write");
  history.plugins.generatedDocuments.execute=async()=>({targets:[location,{...location,plugin:"other"}]});
  const ambiguous=await invoke("read_review_document",{path:original});
  assert.equal(ambiguous.errorKind,"invalid_input");assert.equal(ambiguous.candidates.length,2);
  assert.equal(ambiguous.recovery.action,"narrow_candidates");
});
