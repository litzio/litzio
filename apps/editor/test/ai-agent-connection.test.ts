import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, chmodSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexAppServer, LineDecoder } from "../server/codex-app-server.ts";
import { AiAgentConnection, AGENT_INSTRUCTIONS, LITZIO_GUIDE } from "../server/ai-agent-connection.ts";
import { AiAgentConversations } from "../server/ai-agent-conversations.ts";
import { RootAccess } from "../server/file-access.ts";

export const fakeServer = fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url));

test("conversation streams summaries, steers and interrupts one Codex thread; only its index is stored by Litzio", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-conversation-")), cwd = path.join(root, "assistant"), log = path.join(root, "rpc.jsonl");
  const connection = new AiAgentConnection(cwd, { bin: process.execPath, args: [fakeServer, log] });
  const conversations = new AiAgentConversations(connection, new RootAccess([root]));
  const settings = { provider: "codex" as const, enabled: true, writeAccess: "opened-folders" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const input = { message: "What changed?", folders: [root], model: settings.model, reasoningEffort: "medium", responseLanguage: "ja" as const,
    document: { path: path.join(root, "notes.md"), source: "UNSAVED DOCUMENT TEXT" } };
  writeFileSync(input.document.path, "ON DISK");
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const conversation = await conversations.send(input, settings);
  assert.equal(conversation.turns[0]!.status, "inProgress");
  assert.equal(conversation.turns[0]!.items.find(item => item.kind === "assistant")!.text, "Partial answer");
  assert.deepEqual(conversation.tokenUsage, { used: 810, limit: 1000 });
  assert.equal(JSON.stringify(conversation).includes("PRIVATE RAW REASONING"), false);
  assert.equal(JSON.stringify(conversation).includes("UNSAVED DOCUMENT TEXT"), false, "context is not displayed as a user message");
  await assert.rejects(conversations.send({ ...input, id: conversation.id, reasoningEffort: "high" }, settings), /locked/);
  await conversations.send({ ...input, id: conversation.id, message: "Only summarize." }, settings);
  assert.deepEqual(conversation.turns[0]!.items.filter(item => item.kind === "user").map(item => item.text), ["What changed?", "Only summarize."]);
  await conversations.interrupt(conversation.id);
  assert.equal(conversation.turns[0]!.status, "interrupted");
  assert.equal(conversation.turns[0]!.items.find(item => item.kind === "assistant")!.text, "Partial answer");
  assert.equal(readFileSync(input.document.path, "utf8"), "ON DISK");
  const stored = JSON.parse(readFileSync(path.join(cwd, "conversations.json"), "utf8"));
  assert.deepEqual(Object.keys(stored[0]).sort(), ["createdAt", "folders", "id", "title", "updatedAt"]);
  const rpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const start = rpc.find(item => item.method === "turn/start").params;
  assert.deepEqual(start.sandboxPolicy, { type: "workspaceWrite", writableRoots: [root], networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true });
  assert.ok(start.input[1].text.includes("UNSAVED DOCUMENT TEXT"));
  assert.equal(rpc.find(item => item.method === "thread/start").params.ephemeral, false);
  assert.equal(rpc.find(item => item.method === "turn/steer").params.expectedTurnId, conversation.turns[0]!.id);
  await connection.close();
  const resumedConnection = new AiAgentConnection(cwd, { bin: process.execPath, args: [fakeServer, log] });
  try {
    const resumed = new AiAgentConversations(resumedConnection, new RootAccess([root]));
    const history = await resumed.resume(conversation.id, settings, "en");
    assert.equal(history.responseLanguage, "ja");
    assert.equal(history.turns[0]!.status, "interrupted");
    await resumed.send({ ...input, id: conversation.id, message: "Read only." }, { ...settings, writeAccess: "read-only" });
    const requests = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(requests.filter(item => item.method === "turn/start").at(-1).params.sandboxPolicy, { type: "readOnly", networkAccess: false });
    await resumedConnection.client.request("fixture/finish", { threadId: conversation.id });
    const paged = await resumed.resume(conversation.id, settings, "en");
    assert.deepEqual(paged.turns.map(turn => turn.status), ["interrupted", "completed"], "all pages are hydrated oldest first");
    await resumed.send({ ...input, id: conversation.id, message: "Check disconnect." }, settings);
    await assert.rejects(resumed.send({ ...input, folders: [path.dirname(root)] }, settings), /outside/);
    await assert.rejects(resumed.resume("unknown-thread", settings, "en"), /not found/);
    const active = paged.turns.at(-1)!;
    await resumedConnection.close(); assert.equal(active.status, "failed"); assert.match(active.error!, /exited/);
  } finally { await resumedConnection.close(); }
});
test("stdio splits UTF-8 safely", () => {
  const messages: any[] = [], decoder = new LineDecoder(message => messages.push(message));
  const bytes = Buffer.from('{"result":"한글"}\n{"result":2}\n');
  for (const byte of bytes) decoder.push(Buffer.from([byte]));
  assert.deepEqual(messages, [{ result: "한글" }, { result: 2 }]);
});
test("one lazy process initializes once, preserves caller home and cwd, pages models and reports partial diagnostics", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-connection-")), cwd = path.join(root, "assistant"), log = path.join(root, "rpc.jsonl");
  const connection = new AiAgentConnection(cwd, { bin: process.execPath, args: [fakeServer, log, "account-fail"] });
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  assert.equal(existsSync(log), false);
  const env = connection.environment(); assert.equal(env.cwd, cwd); assert.deepEqual(env.skills, ["litzio-guide"]);
  const guide = path.join(cwd, ".agents", "skills", "litzio-guide", "SKILL.md");
  assert.equal(readFileSync(guide, "utf8"), LITZIO_GUIDE);
  writeFileSync(guide, "stale"); connection.environment();
  assert.equal(readFileSync(guide, "utf8"), LITZIO_GUIDE);
  assert.equal(readFileSync(env.instructions, "utf8"), AGENT_INSTRUCTIONS);
  const [models, diagnostics] = await Promise.all([connection.models(), connection.diagnostics()]);
  assert.deepEqual(models.models.map(model => model.model), ["gpt-6.1-sol", "chosen-model", "next-model"]);
  assert.equal(diagnostics.connected, true); assert.equal(diagnostics.accountError, "fixture error");
  assert.equal(diagnostics.rateLimits![0].windows[0].usedPercent, 28);
  assert.deepEqual(diagnostics.mcp, [{ name: "fixture", status: "unknown", authStatus: "notLoggedIn" }]);
  await connection.models();
  const notification = new Promise(resolve => connection.client.once("notification", (method, params) => resolve({ method, params })));
  await connection.client.request("notify"); assert.deepEqual(await notification, { method: "fixture/notification", params: { text: "한글" } });
  await assert.rejects(connection.client.request("fail"), /fixture error/);
  const lines = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.equal(lines.filter(line => line.pid).length, 1); assert.equal(lines[0].cwd, cwd);
  assert.equal(lines[0].home, process.env.CODEX_HOME ?? null);
  assert.equal(lines.filter(line => line.method === "initialize").length, 1);
  assert.equal(lines.filter(line => line.method === "initialized").length, 1);
  const pending = connection.client.request("hang"); await new Promise(resolve => setImmediate(resolve));
  const rejected = assert.rejects(pending, /closing/); await connection.close(); await rejected;
  assert.throws(() => process.kill(lines[0].pid, 0));
  await assert.rejects(connection.client.request("model/list"), /closed/);
});
test("malformed output, process loss and request timeout reject without replay", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-transport-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const method of ["malformed", "exit", "hang"]) {
    const client = new CodexAppServer(root, { bin: process.execPath, args: [fakeServer], timeoutMs: 2000 });
    try { await client.connect(); await assert.rejects(client.request(method), method === "malformed" ? /Invalid/ : method === "exit" ? /exited/ : /timed out: hang/); }
    finally { await client.close(); }
  }
  const client = new CodexAppServer(root, { bin: path.join(root, "absent-codex") });
  try { await assert.rejects(client.connect(), /could not be executed/); } finally { await client.close(); }
});

test("installed CLI launcher paths with spaces support version diagnostics and reject old Codex before app-server launch", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "codex launcher ")), log = path.join(root, "rpc.jsonl");
  const bin = path.join(root, process.platform === "win32" ? "codex.cmd" : "codex");
  const launcher = (version: string) => {
    writeFileSync(bin, process.platform === "win32"
      ? `@echo off\r\nif "%~1"=="--version" (\r\necho codex-cli ${version}\r\nexit /b 0\r\n)\r\n"${process.execPath}" "${fakeServer}" "${log}"\r\n`
      : `#!/bin/sh\nif [ "$1" = "--version" ]; then echo codex-cli ${version}; exit 0; fi\nexec "${process.execPath}" "${fakeServer}" "${log}"\n`);
    if (process.platform !== "win32") chmodSync(bin, 0o755);
  };
  t.after(() => rmSync(root, { recursive: true, force: true }));
  launcher("0.140.9");
  const old = new CodexAppServer(root, { bin });
  try { await assert.rejects(old.connect(), /0.141.0 or later/); assert.equal(existsSync(log), false); } finally { await old.close(); }
  launcher("0.141.0");
  const current = new CodexAppServer(root, { bin });
  try { assert.equal(await current.version(), "codex-cli 0.141.0"); await current.connect(); assert.ok(existsSync(log)); }
  finally { await current.close(); }
});


test("dynamic document tools enforce turn scope and preserve results across process resume", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-tools-")), folder = path.join(root, "docs"), outside = path.join(root, "outside"), cwd = path.join(root, "assistant"), log = path.join(root, "rpc.jsonl");
  mkdirSync(folder); mkdirSync(outside);
  const connection = new AiAgentConnection(cwd, { bin: process.execPath, args: [fakeServer, log] });
  const conversations = new AiAgentConversations(connection, new RootAccess([root]));
  const settings = { provider: "codex" as const, enabled: true, writeAccess: "opened-folders" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const input = { message: "Create Hello", folders: [folder], model: settings.model, reasoningEffort: "medium", responseLanguage: "en" as const };
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const conversation = await conversations.send(input, settings);
  const call = async (tool: string, args: unknown, extra = {}) => (await connection.client.request("fixture/tool", { threadId: conversation.id, tool, arguments: args, ...extra }));
  const file = path.join(folder, "Hello.md"), args = { path: file, title: "Hello", blocks: [{ type: "heading", level: 2, text: "Welcome" }, { type: "paragraph", text: "Hello world" }] };
  const created = (await call("create_document", args)).result;
  assert.equal(created.success, true);
  const receipt = JSON.parse(created.contentItems[0].text); assert.equal(receipt.path, file); assert.ok(receipt.revision); assert.match(receipt.identity.ino, /^\d+$/); assert.match(receipt.identity.dev, /^\d+$/);
  const read = (await call("read_document", { path: file })).result;
  assert.equal(read.success, true); assert.equal(JSON.parse(read.contentItems[0].text).revision, receipt.revision);
  assert.match(JSON.parse(read.contentItems[0].text).source, /Hello world/);
  const listed = (await call("list_documents", { path: folder })).result;
  assert.equal(listed.success, true); assert.equal(JSON.parse(listed.contentItems[0].text).entries[0].path, file);
  const before = readFileSync(file);
  assert.equal((await call("create_document", args)).result.success, false);
  assert.deepEqual(readFileSync(file), before);
  for (const tool of ["create_document", "read_document", "list_documents"]) assert.equal((await call(tool, tool === "create_document" ? { ...args, path: path.join(outside, "escape.md") } : { path: outside })).result.success, false);
  assert.equal((await call("create_document", { ...args, path: path.join(folder, "bad.md"), blocks: [{ type: "html", text: "bad" }] })).result.success, false);
  assert.equal(existsSync(path.join(folder, "bad.md")), false);
  symlinkSync(outside, path.join(folder, "escape"), process.platform === "win32" ? "junction" : "dir");
  assert.equal((await call("create_document", { ...args, path: path.join(folder, "escape", "bad.md") })).result.success, false);
  assert.equal((await call("list_documents", { path: path.join(folder, "escape") })).result.success, false);
  assert.equal((await call("read_document", { path: file }, { turnId: "stale" })).result.success, false);
  assert.equal((await call("ignored", {}, { method: "unsupported" })).error.code, -32601);
  await conversations.send({ ...input, id: conversation.id, folders: [outside] }, { ...settings, writeAccess: "read-only" });
  assert.equal((await call("create_document", { ...args, path: path.join(folder, "Steered.md") })).result.success, true);
  await connection.client.request("fixture/finish", { threadId: conversation.id });
  assert.equal((await call("create_document", { ...args, path: path.join(folder, "late.md") })).result.success, false);
  await connection.close();
  const next = new AiAgentConnection(cwd, { bin: process.execPath, args: [fakeServer, log] });
  try {
    const history = new AiAgentConversations(next, new RootAccess([root]));
    const resumed = await history.resume(conversation.id, settings, "en");
    assert.deepEqual(resumed.turns[0]!.items.find(item => item.toolResult?.success === true)!.toolResult, created);
    await history.send({ ...input, id: conversation.id }, { ...settings, writeAccess: "read-only" });
    const denied = await next.client.request("fixture/tool", { threadId: conversation.id, tool: "create_document", arguments: { ...args, path: path.join(folder, "readonly.md") } });
    assert.equal(denied.result.success, false); assert.equal(existsSync(path.join(folder, "readonly.md")), false);
    const rpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(rpc.find(entry => entry.method === "thread/start").params.dynamicTools.map((tool: any) => tool.name), ["create_document", "read_document", "list_documents"]);
    assert.equal("dynamicTools" in rpc.find(entry => entry.method === "thread/resume").params, false);
  } finally { await next.close(); }
});


test("user questions reply once with exact RPC id and expire on resolution, completion, interruption and disconnect", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-question-")), log = path.join(root, "rpc.jsonl");
  const connection = new AiAgentConnection(path.join(root, "assistant"), { bin: process.execPath, args: [fakeServer, log] });
  const conversations = new AiAgentConversations(connection, new RootAccess([root]));
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const settings = { provider: "codex" as const, enabled: true, writeAccess: "read-only" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const input = { message: "Ask", folders: [root], model: settings.model, reasoningEffort: "medium", responseLanguage: "en" as const };
  const c = await conversations.send(input, settings);
  const questions = [{ id: "choice", header: "Choice", question: "Which?", isOther: false, isSecret: false, options: [{ label: "A", description: "First" }] },
    { id: "secret", header: "Secret", question: "Text?", isOther: true, isSecret: true, options: null }];
  const answers = { choice: { answers: ["A"] }, secret: { answers: ["custom"] } };
  const ask = (requestId: string | number) => connection.client.request("fixture/question", { threadId: c.id, requestId, questions });
  const answer = (requestId: string | number) => conversations.answer(c.id, c.turns.at(-1)!.id, requestId, answers);
  for (const requestId of ["request-1", 0]) {
    await ask(requestId);
    assert.deepEqual((await conversations.resume(c.id, settings, "en")).userInput?.questions, questions);
    assert.throws(() => conversations.answer(c.id, "stale", requestId, answers), /expired/);
    assert.throws(() => conversations.answer(c.id, c.turns.at(-1)!.id, requestId, { ...answers, choice: { answers: ["invalid"] } }), /Invalid/);
    answer(requestId); assert.throws(() => answer(requestId), /expired/);
    await connection.client.request("notify");
    const replies = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(value => value.id === requestId && value.result);
    assert.deepEqual(replies, [{ id: requestId, result: { answers } }]);
  }
  await ask("resolved");
  await connection.client.request("fixture/resolved", { threadId: c.id, requestId: "unrelated" });
  assert.ok(c.userInput);
  await connection.client.request("fixture/resolved", { threadId: c.id, requestId: "resolved" });
  assert.equal(c.userInput, undefined); assert.throws(() => answer("resolved"), /expired/);
  await ask("finished"); await connection.client.request("fixture/finish", { threadId: c.id });
  assert.equal(c.userInput, undefined); assert.throws(() => answer("finished"), /expired/);
  await conversations.send({ ...input, id: c.id }, settings);
  await ask("interrupted"); await conversations.interrupt(c.id);
  assert.equal(c.userInput, undefined); assert.throws(() => answer("interrupted"), /expired/);
  await conversations.send({ ...input, id: c.id }, settings);
  await ask("disconnected"); await connection.close();
  assert.equal(c.userInput, undefined); assert.throws(() => answer("disconnected"), /expired/);
});
