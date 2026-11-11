import { AgentScreenRequests } from "../server/assistant-screen-tools.ts";
import { PluginHost } from "../server/plugins/plugin-host.ts";
import { compileViewInputSchema, queryViewSchema } from "@litzio/core/views-v2";
import { assistantCliEnvironment } from "../server/assistant-cli.ts";
import { brand } from "../../../brand.ts";
import { AgentDisplayRequests } from "../server/assistant-display-tools.ts";
import { displayRequestCurrent } from "../shared/assistant-display.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, chmodSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexAppServer, LineDecoder } from "../server/codex-app-server.ts";
import { ProviderConnections, ASSISTANT_INSTRUCTIONS, LITZIO_GUIDE } from "../server/provider-connections.ts";
import { AssistantConversations } from "../server/assistant-conversations.ts";
import { canonicalFilePath, RootAccess, fileErrorMessage } from "../server/file-access.ts";

export const fakeServer = fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url));

test("Copilot ACP rejects unsupported interactive questions instead of acknowledging them", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "copilot-question-")), log = path.join(root, "rpc.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), undefined, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log, "--fixture-question"] });
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  const settings = { provider: "copilot" as const, permissionMode: "read-only" as const, model: "copilot-model", reasoningEffort: "low" };
  const c = await conversations.send({ message: "Ask about travel", folders: [], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings);
  for (let attempt = 0; c.turns.at(-1)!.status === "inProgress" && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(c.turns.at(-1)!.status, "completed");
  assert.match(c.turns.at(-1)!.items.map(item => item.text).join(""), /Interactive question unsupported/);
  assert.equal(c.userInput, undefined);
  const requests = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.equal(requests.find(row => row.id === "question-unsupported").error.code, -32601);
  assert.match(requests.find(row => row.method === "session/prompt").params.prompt[0].text, /does not support interactive question cards/);
});

test("Copilot session creation errors retain a readable message across the Host error boundary", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "copilot-error-"));
  const connection = new ProviderConnections(path.join(root, "assistant"), undefined, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), "", "--fixture-session-error"] });
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  await assert.rejects(connection.models("copilot"), error => {
    assert.ok(error instanceof Error, "Host boundaries require Error to preserve the message instead of [object Object]");
    assert.equal(error.message, "Copilot session fixture failure");
    assert.equal(fileErrorMessage(error, null), "Copilot session fixture failure");
    assert.equal(fileErrorMessage(error, new RootAccess([root])), "Copilot session fixture failure");
    assert.equal(String(error).includes("must-not-be-displayed"), false);
    return true;
  });
});

test("Copilot ACP lists its models, streams one turn, applies permission scope, cancels and reports a failed turn", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "copilot-connection-")), log = path.join(root, "acp.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), undefined, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log] });
  const conversations = new AssistantConversations(connection, new RootAccess([root]), {} as any);
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const catalog = await connection.models("copilot");
  assert.deepEqual(catalog.models.map(model => model.model), ["auto", "copilot-model"]);
  assert.deepEqual(catalog.models[0]!.supportedReasoningEfforts.map(value => value.reasoningEffort), ["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
  assert.deepEqual(catalog.copilot?.modes.map(mode => mode.id), ["agent", "plan"]);
  assert.equal((await connection.diagnostics("copilot")).connected, true);
  assert.equal(readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(message => message.method === "initialize").length, 1);
  const settings = { provider: "codex" as const, permissionMode: "read-only" as const, model: "auto", reasoningEffort: "high" };
  const input = { submissionId: "copilot-submission", provider: "copilot" as const, message: "Question", folders: [root], model: settings.model, reasoningEffort: "high", mode: "plan" };
  await assert.rejects(conversations.send({ ...input, skills: [{ name: "codex-only", path: path.join(root, "SKILL.md") }] }, settings), /only with Codex/);
  const accepted = await conversations.submit(input, () => conversations.send(input, settings));
  const conversation = accepted.conversation!;
  assert.equal(accepted.submission.status, "accepted");
  assert.equal(accepted.submission.itemId, conversation.turns[0]!.items[0]!.id);
  assert.equal(conversation.turns[0]!.items[0]!.submissionId, input.submissionId);
  await conversations.submit(input, () => { throw new Error("Duplicate reached provider"); });
  assert.equal(conversation.turns.length, 1, "ACP selector updates must not create transcript turns");
  const turn = conversation.turns[0]!;
  await t.test("response and permission arrive over the child stdio", async () => {
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error("Missing ACP update")), 5000);
      const inspect = () => { if (turn.items.some(item => item.text === "한글 ACP answer")) { clearTimeout(deadline); resolve(); } };
      connection.copilot.on("update", inspect); t.after(() => connection.copilot.off("update", inspect)); inspect();
    });
    assert.equal(turn.status, "inProgress");
    await assert.rejects(conversations.send({ ...input, reasoningEffort: "low" }, settings), /Stop/);
    await assert.rejects(conversations.send({ ...input, id: conversation.id }, settings), /Stop/);
    const request = { sessionId: conversation.id, toolCall: { toolCallId: "write", kind: "edit" as const, locations: [{ path: path.join(root, "new.txt") }] }, options: [{ optionId: "once", name: "Allow once", kind: "allow_once" as const }] };
    assert.deepEqual(connection.copilot.permission!(request), { outcome: { outcome: "cancelled" } });
    assert.deepEqual(connection.copilot.permission!({ ...request, toolCall: { toolCallId: "url", kind: "fetch" } }), { outcome: { outcome: "cancelled" } });
    await conversations.interrupt(conversation.id);
    // A protocol barrier ensures prompt completion is processed, without a timing assumption.
    await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: conversation.id, modelId: input.model }));
    assert.equal(turn.status, "interrupted");
    await conversations.send({ ...input, id: conversation.id, permissionMode: "opened-folders" }, settings);
    assert.deepEqual(connection.copilot.permission!(request), { outcome: { outcome: "selected", optionId: "once" } });
    assert.deepEqual(connection.copilot.permission!({ ...request, toolCall: { ...request.toolCall, locations: [{ path: path.join(root, "..", "outside.txt") }] } }), { outcome: { outcome: "cancelled" } });
    assert.deepEqual(connection.copilot.permission!({ ...request, toolCall: { toolCallId: "url", kind: "fetch" } }), { outcome: { outcome: "selected", optionId: "once" } });
    assert.deepEqual(connection.copilot.permission!({ ...request, toolCall: { toolCallId: "shell", kind: "execute" } }), { outcome: { outcome: "cancelled" } });
    await conversations.interrupt(conversation.id);
    await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: conversation.id, modelId: input.model }));
    const failedInput = { ...input, id: conversation.id, submissionId: "copilot-prompt-failed", message: "FAIL THIS TURN" };
    await conversations.submit(failedInput, () => conversations.send(failedInput, settings));
    await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: conversation.id, modelId: input.model }));
    assert.equal(conversation.turns.at(-1)!.status, "failed");
    assert.match(conversation.turns.at(-1)!.error!, /quota fixture/);
    assert.equal(conversation.turns.at(-1)!.items[0]!.userMessageSource, "host", "a Host row is not provider persistence proof");
    assert.equal(conversations.submission(failedInput.submissionId).submission.status, "unknown");
    assert.equal(conversations.submission(failedInput.submissionId).submission.turnFailed, true);
    const resumedFailure = await conversations.resume(conversation.id, settings);
    assert.equal(resumedFailure.turns.flatMap(turn => turn.items).some(item => item.submissionId === failedInput.submissionId), false);
    assert.equal(conversations.submission(failedInput.submissionId).submission.status, "unknown", "missing provider history must not erase uncertainty");
    assert.ok(resumedFailure.turns.flatMap(turn => turn.items).filter(item => item.kind === "user").every(item => item.userMessageSource === "provider-history"));
    const client = await connection.copilot.connect(), load = client.loadSession.bind(client);
    const prompt = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).find(message => message.method === "session/prompt").params.prompt[0];
    const replay = t.mock.method(client, "loadSession", async (params: Parameters<typeof client.loadSession>[0]) => {
      const result = await load(params);
      connection.copilot.emit("update", { sessionId: params.sessionId, update: { sessionUpdate: "user_message_chunk", content: prompt } });
      return result;
    });
    const recorded = await conversations.resume(conversation.id, settings);
    const persisted = recorded.turns.flatMap(turn => turn.items).find(item => item.submissionId === input.submissionId)!;
    assert.equal(persisted.userMessageSource, "provider-history");
    assert.equal(persisted.text, input.message);
    replay.mock.restore();
  });
  assert.equal(conversations.list()[0]!.provider, "copilot");
  assert.equal(JSON.stringify(conversation).includes("Litzio plugin authoring skill"), false);
  assert.equal((await conversations.resume(conversation.id, { ...settings, provider: "codex" })).provider, "copilot");
  const rpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.match(rpc.find(message => message.method === "session/prompt").params.prompt[0].text, /Litzio plugin authoring skill/);
  assert.ok(rpc.some(message => message.args?.includes("high")), "CLI fallback receives the selected effort at startup");
  assert.ok(rpc.some(message => message.method === "session/set_mode" && message.params.modeId === "plan"));
  await assert.rejects(conversations.send({ ...input, id: conversation.id, reasoningEffort: "low" }, settings), /new conversation/);
  await assert.rejects(conversations.send({ ...input, mode: "autopilot" }, settings), /mode/);
  const full = await conversations.send(input, { ...settings, permissionMode: "full-access" });
  const execution = { sessionId: full.id, toolCall: { toolCallId: "shell", kind: "execute" as const }, options: [{ optionId: "once", name: "Allow once", kind: "allow_once" as const }] };
  assert.deepEqual(connection.copilot.permission!(execution), { outcome: { outcome: "selected", optionId: "once" } });
  assert.deepEqual(connection.copilot.permission!({ ...execution, toolCall: { toolCallId: "outside", kind: "edit", locations: [{ path: path.join(root, "..", "outside.txt") }] } }), { outcome: { outcome: "selected", optionId: "once" } });
  assert.deepEqual(connection.copilot.permission!({ ...execution, toolCall: { toolCallId: "url", kind: "fetch" } }), { outcome: { outcome: "selected", optionId: "once" } });
  await conversations.interrupt(full.id);
  // cancel is a notification: wait for the existing RPC barrier before reading child-owned JSONL.
  await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: full.id, modelId: input.model }));
  const fullRpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const launch = fullRpc.filter(message => message.args).at(-1);
  assert.ok(!launch.args.includes("--deny-tool=shell"));
  assert.ok(launch.args.includes("--disable-builtin-mcps"));
  assert.ok(fullRpc.some(message => message.method === "session/set_config_option" && message.params.configId === "allow_all" && message.params.value === "on"));
  const restricted = await conversations.send({ ...input, id: full.id, permissionMode: "read-only" }, settings);
  assert.deepEqual(connection.copilot.permission!({ ...execution, sessionId: restricted.id }), { outcome: { outcome: "cancelled" } });
  await conversations.interrupt(restricted.id);
  // Wait for the fixture to finish logging prior requests before reading its JSONL.
  await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: restricted.id, modelId: input.model }));
  const restrictedRpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.ok(restrictedRpc.filter(message => message.args).at(-1).args.includes("--deny-tool=shell"));
  assert.equal(restrictedRpc.filter(message => message.method === "session/set_config_option" && message.params.configId === "allow_all").at(-1).params.value, "off");
  await t.test("CLI history restores A high after B low and after Host restart", async () => {
    const barrier = () => connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: restricted.id, modelId: input.model }));
    await barrier();
    const low = await conversations.send({ ...input, reasoningEffort: "low" }, settings);
    await assert.rejects(conversations.resume(restricted.id, settings), /Stop the Copilot response/);
    assert.equal(conversations.current(low.id).turns.at(-1)!.status, "inProgress");
    await conversations.interrupt(low.id); await barrier();
    const lowPid = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(message => message.pid).at(-1).pid;
    const resumed = await conversations.resume(restricted.id, settings);
    assert.equal(resumed.reasoningEffort, "high");
    assert.equal(connection.copilot.reasoningEffort, "high");
    assert.throws(() => process.kill(lowPid, 0), "replaced low-effort child must have exited");
    await conversations.send({ ...input, id: resumed.id }, settings);
    await conversations.interrupt(resumed.id); await barrier();
    await connection.close();
    const next = new ProviderConnections(connection.cwd, undefined, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log] });
    try {
      const history = new AssistantConversations(next, new RootAccess([root]));
      const loaded = await history.resume(restricted.id, { ...settings, reasoningEffort: "low" });
      assert.equal(loaded.reasoningEffort, "high");
      assert.equal(next.copilot.reasoningEffort, "high");
      await history.send({ ...input, id: loaded.id }, settings);
      await history.interrupt(loaded.id);
    } finally { await next.close(); }
  });
  // One config-capable fixture session exercises the alternative to CLI fallback.
  const configConnection = new ProviderConnections(path.join(root, "config-assistant"), undefined, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log, "--fixture-config"] });
  await t.test("live config choices override the separate catalog", async () => {
    try {
      const configConversations = new AssistantConversations(configConnection, new RootAccess([root]));
      const configConversation = await configConversations.send({ ...input, model: "copilot-model", reasoningEffort: "low" }, settings);
      assert.deepEqual(configConversation.copilot?.reasoningEfforts?.map(value => value.reasoningEffort), ["low", "max"]);
      assert.deepEqual((await configConnection.models("copilot")).models[0]!.supportedReasoningEfforts.map(value => value.reasoningEffort), ["low", "high"]);
      await configConversations.interrupt(configConversation.id);
      await configConnection.copilot.call(async () => (await configConnection.copilot.connect()).setSessionMode({ sessionId: configConversation.id, modeId: "plan" }));
      await configConversations.send({ ...input, model: "copilot-model", id: configConversation.id, reasoningEffort: "max" }, settings);
      await configConversations.interrupt(configConversation.id);
      const configRpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
      assert.ok(configRpc.some(message => message.method === "session/set_config_option" && message.params.configId === "reasoning" && message.params.value === "max"));
      const auto = await configConversations.send({ ...input, model: "auto", reasoningEffort: "low" }, settings);
      await configConnection.copilot.call(async () => (await configConnection.copilot.connect()).setSessionMode({ sessionId: auto.id, modeId: "plan" }));
      assert.ok(auto.turns[0]!.items.some(item => item.kind === "assistant" && item.text === "한글 ACP answer"));
      assert.equal(auto.copilot?.reasoningEffortSource, "config");
      assert.deepEqual(auto.copilot?.reasoningEfforts, []);
      await configConversations.interrupt(auto.id);
      await configConnection.copilot.call(async () => (await configConnection.copilot.connect()).setSessionMode({ sessionId: auto.id, modeId: "plan" }));
      await configConversations.send({ ...input, id: auto.id, model: "auto", reasoningEffort: "low" }, settings);
      await configConversations.interrupt(auto.id);
      await configConnection.copilot.call(async () => (await configConnection.copilot.connect()).setSessionMode({ sessionId: auto.id, modeId: "plan" }));
      const autoRpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(message => message.params?.sessionId === auto.id);
      assert.ok(autoRpc.some(message => message.method === "session/set_config_option" && message.params.configId === "model"));
      assert.equal(autoRpc.some(message => message.method === "session/set_config_option" && message.params.configId === "reasoning"), false);
      const turnsBeforeSwitch = auto.turns.length;
      await assert.rejects(configConversations.send({ ...input, id: auto.id, model: "max-only", reasoningEffort: "low" }, settings), /Invalid Copilot reasoning effort/);
      const rejected = configConversations.current(auto.id);
      assert.equal(rejected.model, "max-only");
      assert.equal(rejected.reasoningEffort, "max", "snapshot retains the provider's actual current value after rejection");
      assert.deepEqual(rejected.copilot?.reasoningEfforts?.map(value => value.reasoningEffort), ["max"], "new choices survive validation failure without a notification");
      assert.equal(rejected.turns.length, turnsBeforeSwitch, "invalid effort must not start a prompt or silently use the provider default");
      await configConversations.send({ ...input, id: auto.id, model: "max-only", reasoningEffort: "max" }, settings);
      await configConnection.copilot.call(async () => (await configConnection.copilot.connect()).setSessionMode({ sessionId: auto.id, modeId: "plan" }));
      assert.ok(auto.turns.at(-1)!.items.some(item => item.kind === "assistant" && item.text === "한글 ACP answer"));
      await configConversations.interrupt(auto.id);
    } finally { await configConnection.close(); }
  });
  assert.ok(rpc.find(message => message.method === "session/prompt").params.prompt[0].text.includes("Do not modify existing documents"));
  await connection.close();
  for (const { pid } of readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(message => message.pid)) assert.throws(() => process.kill(pid, 0), "every owned fake child must be stopped");
});

test("conversation streams summaries, steers and interrupts one Codex thread; only its index is stored by Litzio", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-conversation-")), cwd = path.join(root, "assistant"), log = path.join(root, "rpc.jsonl");
  const connection = new ProviderConnections(cwd, { bin: process.execPath, args: [fakeServer, log] });
  const plugins = new PluginHost(path.join(root, "plugins.json"), { authoringDirectory: path.join(root, "data", "plugins") });
  t.after(() => plugins.close());
  const conversations = new AssistantConversations(connection, new RootAccess([root]), plugins);
  const settings = { provider: "codex" as const, permissionMode: "opened-folders" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const input = { message: "What changed?", folders: [root], model: settings.model, reasoningEffort: "medium", references: [path.join(root, "notes.md"), path.join(root, "image.png"), path.join(root, "report.pdf"), path.join(root, "notes.md")],
    reviewWorkspace:{path:path.join(root,"review.docling"),source:"UNSAVED REVIEW CONTEXT"},
    document: { path: path.join(root, "notes.md"), source: "UNSAVED DOCUMENT TEXT" } };
  writeFileSync(input.document.path, "ON DISK");
  writeFileSync(input.reviewWorkspace.path,"WORKSPACE CONTENT IS NOT CONTEXT");
  writeFileSync(path.join(root, "image.png"), "image fixture");
  writeFileSync(path.join(root, "report.pdf"), "REFERENCE CONTENT MUST NOT BE IN INPUT");
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const streamed: string[] = [];
  connection.client.on("notification", (method, params) => {
    if (method === "item/reasoning/summaryTextDelta") streamed.push(conversations.current(params.threadId).turns[0]!.items.find(item => item.kind === "reasoning")!.text);
  });
  const conversation = await conversations.send(input, settings);
  assert.equal(JSON.stringify(conversation).includes("Litzio plugin authoring skill"), false);
  assert.deepEqual(streamed, ["Checking the opened ", "Checking the opened document."]);
  assert.equal(conversation.turns[0]!.items.find(item => item.kind === "user")!.userMessageSource, "provider-live");
  assert.deepEqual(conversation.turns[0]!.items.filter(item => item.kind === "reasoning").map(item => item.text), ["Checking the opened document.\nChecking folders.", ""]);
  assert.equal(conversation.turns[0]!.status, "inProgress");
  assert.equal(conversation.turns[0]!.items.find(item => item.kind === "assistant")!.text, "Partial answer");
  assert.deepEqual(conversation.tokenUsage, { used: 810, limit: 1000 });
  assert.equal(JSON.stringify(conversation).includes("PRIVATE RAW REASONING"), false);
  assert.equal(JSON.stringify(conversation).includes("UNSAVED DOCUMENT TEXT"), false, "unsaved content is not displayed as a user message");
  await assert.rejects(conversations.send({ ...input, id: conversation.id, reasoningEffort: "high" }, settings), /locked/);
  await conversations.send({ ...input, id: conversation.id, message: "Only summarize.", permissionMode: "full-access" }, settings);
  assert.deepEqual(conversation.turns[0]!.items.filter(item => item.kind === "user").map(item => item.text), ["What changed?", "Only summarize."]);
  assert.equal(conversation.permissionMode, "opened-folders", "steering cannot change the captured scope");
  await assert.rejects(conversations.send({ ...input, id: conversation.id, provider: "copilot" }, settings), /Provider is locked/);
  await assert.rejects(conversations.send({ ...input, permissionMode: "invalid" as any }, settings), /Invalid permission mode/);
  await conversations.interrupt(conversation.id);
  assert.equal(conversation.turns[0]!.status, "interrupted");
  assert.equal(conversation.turns[0]!.items.find(item => item.kind === "assistant")!.text, "Partial answer");
  assert.equal(readFileSync(input.document.path, "utf8"), "ON DISK");
  const stored = JSON.parse(readFileSync(path.join(cwd, "conversations.json"), "utf8"));
  assert.deepEqual(Object.keys(stored[0]).sort(), ["createdAt", "folders", "id", "permissionMode", "provider", "title", "updatedAt"]);
  const rpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const start = rpc.find(item => item.method === "turn/start").params;
  assert.equal(start.summary, "auto");
  assert.match(start.input[1].text, /Litzio plugin authoring skill/);
  const refs = [{ path: input.document.path, name: "notes.md", kind: "document" }, { path: path.join(root, "image.png"), name: "image.png", kind: "image" }, { path: path.join(root, "report.pdf"), name: "report.pdf", kind: "file" }];
  assert.deepEqual(JSON.parse(start.input[1].text.split("(JSON):\n")[1]).references, refs);
  assert.equal(JSON.stringify(start.input).includes("REFERENCE CONTENT MUST NOT BE IN INPUT"), false);
  assert.equal(start.input.length, 3);
  assert.deepEqual(start.input[2], { type: "localImage", path: path.join(root, "image.png") });
  assert.deepEqual(conversation.turns[0]!.items.filter(item => item.kind === "user").map(item => item.references), [refs, refs]);
  assert.deepEqual(JSON.parse(rpc.find(item => item.method === "turn/steer").params.input[1].text.split("(JSON):\n")[1]), { ...JSON.parse(start.input[1].text.split("(JSON):\n")[1]), userMessage: "Only summarize." });
  const canonicalPlugins = path.join(canonicalFilePath(root), "data", "plugins");
  assert.deepEqual(start.sandboxPolicy, { type: "workspaceWrite", writableRoots: [root, canonicalPlugins], networkAccess: true, excludeTmpdirEnvVar: true, excludeSlashTmp: true });
  const noFolders = await conversations.send({ message: "Create a plugin", folders: [], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings);
  const noFolderStart = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(item => item.method === "turn/start").at(-1).params;
  assert.deepEqual(noFolderStart.sandboxPolicy.writableRoots, [canonicalPlugins]);
  assert.deepEqual(noFolders.folders, []);
  await conversations.interrupt(noFolders.id);
  assert.equal(existsSync(plugins.authoringDirectory), false, "sandbox path checks must not create the plugins folder");
  mkdirSync(path.dirname(plugins.authoringDirectory));
  symlinkSync(root, plugins.authoringDirectory, process.platform === "win32" ? "junction" : "dir");
  try {
    const startsBefore = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(item => item.method === "turn/start");
    await conversations.send({ id: noFolders.id, message: "Create a plugin", folders: [], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings);
    const starts = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(item => item.method === "turn/start");
    assert.equal(starts.length, startsBefore.length + 1);
    assert.deepEqual(starts.at(-1).params.sandboxPolicy.writableRoots, [], "an unsafe plugins directory is omitted from writableRoots");
    await conversations.interrupt(noFolders.id);
  } finally { rmSync(plugins.authoringDirectory); }

  assert.deepEqual(JSON.parse(start.input[1].text.slice(start.input[1].text.indexOf("{"))).document, { path: input.document.path });
  assert.equal(start.input[1].text.includes("ON DISK"), false, "document content is read on demand, not injected");
  assert.deepEqual(JSON.parse(start.input[1].text.slice(start.input[1].text.indexOf("{"))).reviewWorkspace,{path:input.reviewWorkspace.path});
  assert.equal(start.input[1].text.includes("UNSAVED REVIEW CONTEXT"),false);
  assert.equal(rpc.find(item => item.method === "thread/start").params.ephemeral, false);
  assert.equal(rpc.find(item => item.method === "turn/steer").params.expectedTurnId, conversation.turns[0]!.id);
  await connection.close();
  const tampered = JSON.parse(readFileSync(path.join(cwd, "conversations.json"), "utf8"));
  tampered.find((entry: any) => entry.id === conversation.id).permissionMode = "full-access";
  writeFileSync(path.join(cwd, "conversations.json"), JSON.stringify(tampered));
  const resumedConnection = new ProviderConnections(cwd, { bin: process.execPath, args: [fakeServer, log] });
  try {
    const resumed = new AssistantConversations(resumedConnection, new RootAccess([root]));
    const history = await resumed.resume(conversation.id, { ...settings, provider: "copilot", permissionMode: "read-only" });
    assert.equal(history.provider, "codex");
    assert.ok(history.turns.flatMap(turn => turn.items).filter(item => item.kind === "user").every(item => item.userMessageSource === "provider-history"));
    assert.equal(history.permissionMode, "read-only", "UI snapshots must expose only the bounded grant before sending");
    assert.deepEqual(history.turns[0]!.items.filter(item => item.kind === "reasoning"), conversation.turns[0]!.items.filter(item => item.kind === "reasoning"));
    assert.equal(JSON.stringify(history).includes("PRIVATE RAW REASONING"), false);
    assert.equal("responseLanguage" in history, false);
    assert.deepEqual(history.turns[0]!.items.filter(item => item.kind === "user").map(item => ({ text: item.text, references: item.references })), [
      { text: "What changed?", references: refs }, { text: "Only summarize.", references: refs },
    ]);
    assert.equal(JSON.stringify(history).includes("UNSAVED DOCUMENT TEXT"), false);
    await assert.rejects(resumed.send({ ...input, references: [root] }, settings), /outside/);
    await assert.rejects(resumed.send({ ...input, folders: [cwd], references: [input.document.path] }, settings), /outside/);
    writeFileSync(path.join(root, ".hidden"), "hidden");
    await assert.rejects(resumed.send({ ...input, references: [path.join(root, ".hidden")] }, settings), /unavailable/);
    const real = path.join(root, "real"); mkdirSync(real); writeFileSync(path.join(real, "file.txt"), "reference");
    const linked = path.join(root, "linked"); symlinkSync(real, linked, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(resumed.send({ ...input, references: [path.join(linked, "file.txt")] }, settings), /unavailable/);
    const many = Array.from({ length: 11 }, (_, i) => path.join(root, `file-${i}.txt`));
    for (const file of many) writeFileSync(file, "reference");
    await assert.rejects(resumed.send({ ...input, references: many }, settings), /10/);
    const deleted = many[0]!; rmSync(deleted);
    await assert.rejects(resumed.send({ ...input, references: [deleted] }, settings));
    assert.equal(history.turns[0]!.status, "interrupted");
    await resumed.send({ ...input, id: conversation.id, message: "" }, { ...settings, permissionMode: "read-only" });
    const requests = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(requests.filter(item => item.method === "turn/start").at(-1).params.sandboxPolicy, { type: "readOnly", networkAccess: false });
    await resumedConnection.client.request("fixture/finish", { threadId: conversation.id });
    const paged = await resumed.resume(conversation.id, settings);
    assert.deepEqual(paged.turns.map(turn => turn.status), ["interrupted", "completed"], "all pages are hydrated oldest first");
    await resumed.send({ ...input, id: conversation.id, message: "Check disconnect." }, settings);
    await assert.rejects(resumed.send({ ...input, folders: [path.dirname(root)] }, settings), /outside/);
    await assert.rejects(resumed.resume("unknown-thread", settings), /not found/);
    await resumed.interrupt(conversation.id);
    await resumed.send({ ...input, id: conversation.id, permissionMode: "full-access" }, settings);
    const fullRpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
    const fullStart = fullRpc.filter(item => item.method === "turn/start").at(-1).params;
    assert.deepEqual(fullStart.sandboxPolicy, { type: "dangerFullAccess" });
    assert.equal(fullStart.approvalPolicy, "never");
    await resumed.interrupt(conversation.id);
    assert.equal((await resumed.resume(conversation.id, settings)).permissionMode, "full-access", "same Host retains the user-approved override");
    await resumed.send({ ...input, id: conversation.id }, settings);
    const approvedRpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(approvedRpc.filter(item => item.method === "turn/start").at(-1).params.sandboxPolicy, { type: "dangerFullAccess" });
    const lastActive = resumed.current(conversation.id).turns.at(-1)!;
    await resumedConnection.close(); assert.equal(lastActive.status, "failed"); assert.match(lastActive.error!, /exited/);
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
  const connection = new ProviderConnections(cwd, { bin: process.execPath, args: [fakeServer, log, "account-fail"] });
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  assert.equal(existsSync(log), false);
  const env = connection.environment(); assert.equal(env.cwd, cwd); assert.deepEqual(env.skills, ["litzio-guide"]);
  const guide = path.join(cwd, ".agents", "skills", "litzio-guide", "SKILL.md");
  assert.equal(readFileSync(guide, "utf8"), LITZIO_GUIDE);
  writeFileSync(guide, "stale"); connection.environment();
  assert.equal(readFileSync(guide, "utf8"), LITZIO_GUIDE);
  assert.equal(readFileSync(env.instructions, "utf8"), ASSISTANT_INSTRUCTIONS);
  // Generated guidance owns consent and CLI routing; CLI tests own actual writes.
  const instructions = readFileSync(env.instructions, "utf8"), generatedGuide = readFileSync(guide, "utf8");
  assert.doesNotMatch(instructions + generatedGuide, /docling|convert-pdf/i, "generated product guidance must not advertise removed conversion features");
  assert.match(instructions, /Read .*litzio-guide.*SKILL\.md.*template/);
  assert.match(instructions, /query list_templates/);
  assert.match(generatedGuide, /templates list --json --language <ko\|en>/);
  assert.match(generatedGuide, /templates read <id> --json --language <ko\|en>/);
  assert.match(generatedGuide, /Propose.*user agrees.*create_document/s);
  assert.match(generatedGuide, /explicitly names a template.*authorization/s);
  assert.match(generatedGuide, /create <new-file> --template <id> --language <ko\|en>/);
  assert.match(generatedGuide, /templates save <name> --from <file> --description <text>/);
  assert.match(generatedGuide, /Confirm.*name.*description.*source.*before saving/s);
  assert.match(generatedGuide, /Unsaved editor changes are not supplied.*saved disk version/s);
  assert.match(generatedGuide, /CLI creations do not produce.*result card/);
  const parentPath = process.env.PATH;
  const [models, diagnostics] = await Promise.all([connection.models(), connection.diagnostics()]);
  assert.deepEqual(models.models.map(model => model.model), ["gpt-6.1-sol", "chosen-model", "next-model"]);
  assert.equal(process.env.PATH, parentPath, "Host process PATH must not change");
  const cli = await connection.client.request("fixture/cli", { command: brand.cliCommand, args: ["templates", "read", "builtin:technical-document", "--json", "--language", "ko"] });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).id, "builtin:technical-document");
  assert.match(JSON.parse(cli.stdout).source, /기술 문서/);
  const ownBin = cli.path.split(path.delimiter)[0];
  assert.equal(path.dirname(ownBin), path.join(cwd, "bin"));
  const launcher = readFileSync(path.join(ownBin, "cli.cjs"), "utf8");
  const other = assistantCliEnvironment(cwd, { bin: process.execPath, args: ["--version"] });
  assert.notEqual((other.PATH ?? other.Path)!.split(path.delimiter)[0], ownBin);
  assert.equal(readFileSync(path.join(ownBin, "cli.cjs"), "utf8"), launcher, "Another Host sharing cwd must not replace this CLI");
  assert.equal(process.env.PATH, parentPath);
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
test("account usage shares the lazy connection, caches concurrent reads for 60s and refetches notifications without leaking provider fields", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "usage-connection-")), log = path.join(root, "rpc.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath, args: [fakeServer, log] });
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const count = () => readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(line => line.method === "account/rateLimits/read").length;
  const [first, concurrent] = await Promise.all([connection.accountUsage(), connection.accountUsage()]);
  assert.deepEqual(first, concurrent); assert.equal(count(), 1);
  now += 59_999; await connection.accountUsage(); assert.equal(count(), 1);
  now++; await connection.accountUsage(); assert.equal(count(), 2);
  const bucket = (name: string, usedPercent: number) => ({ limitName: name, primary: { usedPercent, windowDurationMins: 300, resetsAt: 1900000000, secret: "hidden" }, secondary: null });
  await connection.client.request("fixture/usage", { account: { type: "chatgpt", email: "fixture@example.invalid", planType: "plus", id: "hidden-id", accessToken: "hidden-token" },
    limits: { rateLimitsByLimitId: { codex: bucket("Codex", 45), review: bucket("Review", 12) } } });
  const updated = await connection.accountUsage();
  assert.equal(count(), 3);
  assert.deepEqual(updated.account, { type: "chatgpt", email: "fixture@example.invalid", planType: "plus" });
  assert.deepEqual(updated.rateLimits?.map(bucket => bucket.windows[0].usedPercent), [45, 12]);
  assert.doesNotMatch(JSON.stringify(updated), /hidden/);
  const business = { limitName: "Codex", primary: null, secondary: null, planType: "business",
    individualLimit: { limit: "500", used: "208.24", remainingPercent: 58, resetsAt: 1900000000 },
    credits: { hasCredits: true, unlimited: false, balance: null }, spendControlReached: false };
  await connection.client.request("fixture/usage", { account: { type: "chatgpt", planType: "business" },
    limits: { rateLimits: business, rateLimitsByLimitId: { codex: business } } });
  const businessUsage = (await connection.accountUsage()).rateLimits![0];
  assert.deepEqual(businessUsage, { name: "Codex", windows: [], planType: "business",
    individualLimit: { limit: 500, used: 208.24, remainingPercent: 58, resetsAt: 1900000000 },
    credits: { hasCredits: true, unlimited: false, balance: null }, spendControlReached: false });
  await connection.client.request("fixture/usage", { account: { type: "chatgpt" }, limits: { rateLimits: {
    ...business, primary: bucket("Codex", 28).primary,
    credits: { hasCredits: true, unlimited: false, balance: "125.50" },
  } } });
  const combined = (await connection.accountUsage()).rateLimits![0];
  assert.equal(combined.windows[0].usedPercent, 28, "period and individual quotas can coexist, including the single-bucket response");
  assert.equal(combined.credits?.balance, 125.5);
  await connection.client.request("fixture/usage", { account: { type: "chatgpt" }, limits: { rateLimits: { futureField: true } } });
  assert.deepEqual((await connection.accountUsage()).rateLimits, [{ name: "codex", windows: [] }]);
  await connection.client.request("fixture/usage", { notification: "account/updated", account: { type: "apiKey", email: "hidden", planType: "hidden" }, limits: {} });
  assert.deepEqual((await connection.accountUsage()).account, { type: "apiKey" });
  await connection.client.request("fixture/usage", { notification: "account/updated", account: null, limits: {} });
  assert.equal((await connection.accountUsage()).account, null);
  // Account changes while a read is pending must discard that older account.
  now += 60_000;
  const originalRequest = connection.client.request.bind(connection.client);
  let release!: () => void, observed!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const reading = new Promise<void>(resolve => { observed = resolve; });
  let hold = true;
  const request = t.mock.method(connection.client, "request", async (method: string, params?: unknown) => {
    const result = await originalRequest(method, params);
    if (method === "account/read" && hold) { hold = false; observed(); await held; }
    return result;
  });
  const pending = connection.accountUsage(); await reading;
  await originalRequest("fixture/usage", { notification: "account/updated", account: { type: "apiKey" }, limits: {} });
  release(); assert.deepEqual((await pending).account, { type: "apiKey" });
  request.mock.restore();
  const lines = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.equal(lines.filter(line => line.method === "initialize").length, 1);
  assert.equal(lines.some(line => ["model/list", "mcpServerStatus/list"].includes(line.method)), false, "hover reads only account and usage");
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
  const connection = new ProviderConnections(cwd, { bin: process.execPath, args: [fakeServer, log] }, undefined, { packaged: false, checkoutRoot: root });
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  const settings = { provider: "codex" as const, permissionMode: "opened-folders" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const input = { message: "Create Hello", folders: [folder], model: settings.model, reasoningEffort: "medium" };
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const conversation = await conversations.send(input, settings, "window-a");
  const call = async (tool: string, args: unknown, extra = {}) => (await connection.client.request("fixture/tool", { threadId: conversation.id, tool, arguments: args, ...extra }));
  const handler = connection.client.toolCall!;
  let arrived: (() => void) | undefined;
  connection.client.toolCall = params => { const reply = handler(params); arrived?.(); return reply; };
  const beginDisplay = async (tool: string, args: unknown) => {
    const received = new Promise<void>(resolve => { arrived = resolve; });
    const response = call(tool, args); await received; arrived = undefined;
    const request = conversations.display.snapshot(conversation.id, "window-a")!;
    assert.ok(request);
    return { response, request };
  };
  const original = { theme: "light" as const, uiLanguage: "en" as const, documentWidth: "standard" as const, pageBackground: "paper" as const };
  const reading = await beginDisplay("read_display_settings", {});
  assert.equal(conversations.display.snapshot(conversation.id, "window-b"), undefined);
  assert.throws(() => conversations.display.reply(conversation.id, "window-b", reading.request.id, { before: original, after: original }), /another window/);
  conversations.display.reply(conversation.id, "window-a", reading.request.id, { before: original, after: original });
  assert.deepEqual(JSON.parse((await reading.response).result.contentItems[0].text), original);
  const changing = await beginDisplay("change_display_settings", { changes: { theme: "dark" } });
  const after = { ...original, theme: "dark" as const };
  conversations.display.reply(conversation.id, "window-a", changing.request.id, { before: original, after });
  const displayResult = (await changing.response).result;
  assert.equal(displayResult.success, true);
  const displayReceipt = JSON.parse(displayResult.contentItems[0].text);
  assert.deepEqual(displayReceipt.changed, ["theme"]);
  const undo = conversations.display.undo(conversation.id, "window-a", displayReceipt.requestId);
  const restoring = conversations.display.snapshot(conversation.id, "window-a")!;
  assert.deepEqual(restoring.expected, { theme: "dark" });
  conversations.display.reply(conversation.id, "window-a", restoring.id, { before: after, after: original });
  assert.deepEqual(await undo, { undone: true });
  await assert.rejects(conversations.display.undo(conversation.id, "window-a", displayReceipt.requestId), /unavailable/);
  for (const changes of [{ permissionMode: "full-access" }, { provider: "copilot" }, { model: "x" }, { plugins: [] }, { frontMatter: {} }, { theme: "invalid" }, {}]) {
    assert.equal((await call("change_display_settings", { changes })).result.success, false);
  }
  const file = path.join(folder, "Hello.md"), args = { path: file, title: "Hello", blocks: [{ type: "heading", level: 2, text: "Welcome" }, { type: "paragraph", text: "Hello world" }] };
  const created = (await call("create_document", args)).result;
  assert.equal(created.success, true);
  const receipt = JSON.parse(created.contentItems[0].text); assert.equal(receipt.path, file); assert.ok(receipt.revision); assert.match(receipt.identity.ino, /^\d+$/); assert.match(receipt.identity.dev, /^\d+$/);
  const read = (await call("read_document", { path: file })).result;
  assert.equal(read.success, true); assert.equal(JSON.parse(read.contentItems[0].text).revision, receipt.revision);
  assert.match(JSON.parse(read.contentItems[0].text).source, /Hello world/);
  const listed = (await call("list_documents", { path: folder })).result;
  assert.equal(listed.success, true); assert.equal(JSON.parse(listed.contentItems[0].text).entries[0].path, file);
  const catalog = JSON.parse((await call("list_templates", { language: "ko" })).result.contentItems[0].text);
  assert.equal(catalog.directory, path.join(root, ".litzio-dev", "templates"));
  assert.ok(catalog.templates.some((item: any) => item.id === "builtin:technical-document"));
  const templateFile = path.join(folder, "Template.md");
  const fromTemplate = (await call("create_document", { path: templateFile, template: "builtin:technical-document", language: "ko" })).result;
  assert.equal(fromTemplate.success, true);
  const templateReceipt = JSON.parse(fromTemplate.contentItems[0].text);
  assert.equal(templateReceipt.path, templateFile); assert.ok(templateReceipt.identity.ino);
  const templateSource = readFileSync(templateFile, "utf8"); assert.ok(!templateSource.includes("template:"));
  const saved = (await call("save_template", { name: "Reusable", from: templateFile, description: "From saved disk" })).result;
  assert.equal(saved.success, true, JSON.stringify(saved));
  const preview = JSON.parse((await call("read_template", { template: "user:Reusable" })).result.contentItems[0].text);
  assert.equal(preview.description, "From saved disk");
  assert.equal(readFileSync(templateFile, "utf8"), templateSource);
  for (const [tool, input] of [
    ["save_template", { name: "Outside", from: path.join(outside, "escape.md") }],
    ["create_document", { path: path.join(outside, "escape.md"), template: "builtin:ai-report" }],
    ["create_document", { path: templateFile, template: "builtin:ai-report" }],
    ["create_document", { path: path.join(folder, "bad-template.md"), template: "missing" }],
    ["create_document", { path: path.join(folder, "mixed.md"), template: "builtin:ai-report", title: "Ignored?", blocks: [] }],
  ] as const) assert.equal((await call(tool, input)).result.success, false);
  assert.equal(readFileSync(templateFile, "utf8"), templateSource);
  assert.equal(existsSync(path.join(folder, "bad-template.md")), false);
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
  await conversations.send({ ...input, id: conversation.id, folders: [outside] }, { ...settings, permissionMode: "read-only" }, "window-b");
  assert.equal((await call("create_document", { ...args, path: path.join(folder, "Steered.md") })).result.success, true);
  const endingDisplay = await beginDisplay("read_display_settings", {});
  assert.equal(conversations.display.snapshot(conversation.id, "window-b"), undefined, "Steering cannot transfer the originating window");
  await connection.client.request("fixture/finish", { threadId: conversation.id });
  assert.equal((await endingDisplay.response).result.success, false);
  assert.equal((await call("create_document", { ...args, path: path.join(folder, "late.md") })).result.success, false);
  await connection.close();
  const next = new ProviderConnections(cwd, { bin: process.execPath, args: [fakeServer, log] }, undefined, { packaged: false, checkoutRoot: root });
  try {
    const history = new AssistantConversations(next, new RootAccess([root]));
    const resumed = await history.resume(conversation.id, settings);
    assert.deepEqual(resumed.turns[0]!.items.find(item => item.text === "create_document" && item.toolResult?.success === true)!.toolResult, created);
    await history.send({ ...input, id: conversation.id, folders: [], permissionMode: "read-only" }, settings, "window-readonly");
    const readOnlyDisplay = next.client.toolCall!({ threadId: conversation.id, turnId: history.current(conversation.id).turns.at(-1)!.id, namespace: null,
      tool: "read_display_settings", arguments: {} });
    const readOnlyRequest = history.display.snapshot(conversation.id, "window-readonly")!;
    history.display.reply(conversation.id, "window-readonly", readOnlyRequest.id, { before: original, after: original });
    assert.equal((await readOnlyDisplay as { success: boolean }).success, true, "Display reads do not need document write access or opened folders");
    const denied = await next.client.request("fixture/tool", { threadId: conversation.id, tool: "create_document", arguments: { ...args, path: path.join(folder, "readonly.md") } });
    assert.equal(denied.result.success, false); assert.equal(existsSync(path.join(folder, "readonly.md")), false);
    const templateDenied = await next.client.request("fixture/tool", { threadId: conversation.id, tool: "save_template", arguments: { name: "Denied", from: templateFile } });
    assert.equal(templateDenied.result.success, false);
    const catalogWithoutFolders = await next.client.request("fixture/tool", { threadId: conversation.id, tool: "list_templates", arguments: {} });
    assert.equal(catalogWithoutFolders.result.success, true);
    const persistedTemplate = resumed.turns[0]!.items.find(item => item.text === "create_document" && item.toolResult?.success && item.toolResult.contentItems?.some(content => content.type === "inputText" && typeof content.text === "string" && JSON.parse(content.text).path === templateFile));
    assert.deepEqual(persistedTemplate?.toolResult, fromTemplate);
    const rpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(rpc.find(entry => entry.method === "thread/start").params.dynamicTools.map((tool: any) => tool.name), ["create_document", "read_document", "list_documents", "read_screen_context", "read_display_settings", "change_display_settings", "list_templates", "read_template", "save_template", "request_litzio_user_input"]);
    assert.equal("dynamicTools" in rpc.find(entry => entry.method === "thread/resume").params, false);

  } finally { await next.close(); }
});


test("user questions reply once with exact RPC id and expire on resolution, completion, interruption and disconnect", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-question-")), log = path.join(root, "rpc.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath, args: [fakeServer, log] });
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const settings = { provider: "codex" as const, permissionMode: "read-only" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const input = { message: "Ask", folders: [root], model: settings.model, reasoningEffort: "medium" };
  const c = await conversations.send(input, settings);
  const questions = [{ id: "constructor", header: "Choice", question: "Which?", isOther: false, isSecret: false, options: [{ label: "A", description: "First" }] },
    { id: "__proto__", header: "Secret", question: "Text?", isOther: true, isSecret: true, options: null }];
  const answers = { constructor: { answers: ["A"] }, ["__proto__"]: { answers: ["custom"] } };
  const ask = (requestId: string | number) => connection.client.request("fixture/question", { threadId: c.id, requestId, questions });
  const answer = (requestId: string | number) => conversations.answer(c.id, c.turns.at(-1)!.id, requestId, answers);
  for (const requestId of ["request-1", 0]) {
    await ask(requestId);
    assert.deepEqual((await conversations.resume(c.id, settings)).userInput?.questions, questions);
    assert.throws(() => conversations.answer(c.id, "stale", requestId, answers), /expired/);
    assert.throws(() => conversations.answer(c.id, c.turns.at(-1)!.id, requestId, { ...answers, constructor: { answers: ["invalid"] } }), /Invalid/);
    const inherited = Object.setPrototypeOf({ ["__proto__"]: answers["__proto__"], extra: { answers: ["unused"] } }, { constructor: answers.constructor });
    assert.throws(() => conversations.answer(c.id, c.turns.at(-1)!.id, requestId, inherited), /Invalid/, "inherited answers cannot fill a missing question key");
    assert.throws(() => conversations.answer(c.id, c.turns.at(-1)!.id, requestId, { ...answers, constructor: Object.create({ answers: ["A"] }) }), /Invalid/, "answer values must also be own properties");
    answer(requestId); assert.throws(() => answer(requestId), /expired/);
    await connection.client.request("notify");
    const replies = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(value => value.id === requestId && value.result);
    assert.deepEqual(replies, [{ id: requestId, result: { answers } }]);
  }
  const savedQuestions = JSON.parse(readFileSync(path.join(connection.cwd, "conversations.json"), "utf8"))[0].questions;
  assert.deepEqual(savedQuestions.find((record: any) => record.question.requestId === 0).question.answers["__proto__"], { answers: ["••••"] }, "the Host index masks secret answers while the RPC receives the actual value");
  questions[0]!.isOther = true;
  await ask("custom-constructor");
  const custom = { ...answers, constructor: { answers: ["Explain the assumptions"] } };
  conversations.answer(c.id, c.turns.at(-1)!.id, "custom-constructor", custom);
  await connection.client.request("notify");
  assert.deepEqual(JSON.parse(readFileSync(log, "utf8").trim().split("\n").find(line => JSON.parse(line).id === "custom-constructor")!).result, { answers: custom });
  await ask("resolved");
  await connection.client.request("fixture/resolved", { threadId: c.id, requestId: "unrelated" });
  assert.ok(c.userInput);
  await connection.client.request("fixture/resolved", { threadId: c.id, requestId: "resolved" });
  assert.equal(c.userInput, undefined); assert.throws(() => answer("resolved"), /expired/);
  await ask("finished"); await connection.client.request("fixture/finish", { threadId: c.id });
  assert.equal(c.userInput, undefined); assert.throws(() => answer("finished"), /expired/);
  await conversations.send({ ...input, id: c.id }, settings);
  await ask("interrupted");
  const originalRequest = connection.client.request.bind(connection.client);
  const interruptRpc = t.mock.method(connection.client, "request", async (method: string, params: unknown) => method === "turn/interrupt" ? {} : originalRequest(method, params));
  try { await conversations.interrupt(c.id); } finally { interruptRpc.mock.restore(); }
  assert.equal(JSON.parse(readFileSync(path.join(connection.cwd, "conversations.json"), "utf8"))[0].questions.find((record: any) => record.question.requestId === "interrupted").question.status, "expired", "interrupt persists closure even when no turn/completed notification follows");
  assert.equal(c.userInput, undefined); assert.throws(() => answer("interrupted"), /expired/);
  await conversations.send({ ...input, id: c.id }, settings);
  await ask("disconnected"); await connection.close();
  assert.equal(c.userInput, undefined); assert.throws(() => answer("disconnected"), /expired/);
});


test("async questions retain metadata and answered history while ended questions stay closed on reopen", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-async-question-")), log = path.join(root, "rpc.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath, args: [fakeServer, log] });
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  let restarted: ProviderConnections | undefined;
  t.after(async () => { await restarted?.close(); await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const settings = { provider: "codex" as const, permissionMode: "read-only" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const c = await conversations.send({ message: "Ask about travel", folders: [], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings);
  const turnId = c.turns.at(-1)!.id;
  const questions = [{ title: "예시 여행 계획에서 어떤 여행 방식을 선호하시나요?", options: ["휴식 중심", "관광 중심", "음식 탐방"] }, { title: "추가 요청을 알려 주세요.", options: null }];
  await connection.client.request("fixture/async-question", { threadId: c.id, itemId: "travel-question", questions });
  const item = c.turns.at(-1)!.items.find(item => item.id === "travel-question")!;
  assert.equal(item.kind, "question", "async input must not degrade to ordinary answer text");
  const question = (item as any).question;
  assert.equal(question.delivery, "async");
  assert.deepEqual(question.sourceQuestions, questions);
  assert.equal(question.status, "pending");
  assert.equal(c.userInput?.requestId, question.requestId);
  const answers = { "0": { answers: ["음식 탐방"] }, "1": { answers: ["아이와 쉬는 시간을 넣어 주세요."] } };
  await conversations.answer(c.id, turnId, question.requestId, answers);
  assert.equal(question.status, "answered");
  assert.deepEqual(question.answers, answers);
  const steer = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(row => row.method === "turn/steer");
  assert.equal(steer.length, 1);
  assert.equal(steer[0].params.expectedTurnId, turnId);
  assert.match(JSON.stringify(steer[0].params.input), /travel-question/);
  assert.match(JSON.stringify(steer[0].params.input), /음식 탐방/);
  await connection.client.request("fixture/finish", { threadId: c.id });
  const reopened = await conversations.resume(c.id, settings);
  const restored = (reopened.turns.flatMap(turn => turn.items).find(item => item.id === "travel-question") as any).question;
  assert.equal(restored.status, "answered");
  assert.deepEqual(restored.answers, answers);
  assert.deepEqual(restored.sourceQuestions, questions);
  await conversations.send({ id: c.id, message: "Ask another question", folders: [], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings);
  await connection.client.request("fixture/async-question", { threadId: c.id, itemId: "later-question", questions });
  await connection.client.request("fixture/async-question", { threadId: c.id, itemId: "second-pending-question", questions });
  await connection.client.request("fixture/finish", { threadId: c.id });
  assert.equal(conversations.current(c.id).userInput, undefined, "completion closes every pending question in the turn");
  assert.ok(conversations.current(c.id).turns.at(-1)!.items.filter(item => item.question).every(item => item.question!.status === "expired"));
  await conversations.interrupt(c.id);
  assert.equal(conversations.current(c.id).turns.at(-1)!.items.find(item => item.id === "later-question")!.question!.status, "expired");
  const saved = JSON.parse(readFileSync(path.join(connection.cwd, "conversations.json"), "utf8"));
  assert.equal(saved[0].questions.find((record: any) => record.itemId === "later-question").question.status, "expired", "interrupt after completion must persist question expiry without another provider notification");
  const stopped = await conversations.resume(c.id, settings);
  assert.equal(stopped.userInput, undefined, "explicit reopen cannot revive a stopped question");
  assert.throws(() => conversations.answer(c.id, stopped.turns.at(-1)!.id, "later-question", answers), /expired/);
  await connection.close();
  // Recreate the stale pending index from the reviewer's completed-turn race.
  saved[0].questions.find((record: any) => record.itemId === "later-question").question.status = "pending";
  writeFileSync(path.join(connection.cwd, "conversations.json"), JSON.stringify(saved));
  restarted = new ProviderConnections(connection.cwd, { bin: process.execPath, args: [fakeServer, log] });
  const history = new AssistantConversations(restarted, new RootAccess([root]));
  const resumed = await history.resume(c.id, settings);
  assert.equal(resumed.userInput, undefined, "a stopped question must stay closed after daemon restart");
  assert.equal(JSON.parse(readFileSync(path.join(connection.cwd, "conversations.json"), "utf8"))[0].questions.find((record: any) => record.itemId === "later-question").question.status, "expired", "restoration persists normalized completed-turn questions");
  assert.deepEqual((resumed.turns.flatMap(turn => turn.items).find(item => item.id === "travel-question") as any).question.answers, answers);
  assert.throws(() => history.answer(c.id, resumed.turns.at(-1)!.id, "later-question", answers), /expired/);
  assert.equal(resumed.turns.at(-1)!.status, "completed", "answering a closed question cannot start a new turn");
  const ordinary = 'Litzio question answers (JSON):\n{"turnId":"missing","requestId":"missing","answers":{"0":{"answers":["example"]}}}';
  await history.send({ id: c.id, message: ordinary, folders: [], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings);
  const ordinaryItem = resumed.turns.at(-1)!.items.find(item => item.kind === "user")!;
  assert.equal(ordinaryItem.questionAnswer, undefined, "unmatched user-authored JSON is not hidden as an answer record");
  assert.equal(ordinaryItem.text, ordinary);
  assert.throws(() => history.answer(c.id, resumed.turns[1]!.id, "later-question", answers), /expired/, "another active turn must not revive an old question");
  for (const itemId of ["failed-question", "second-failed-question"]) await restarted.client.request("fixture/async-question", { threadId: c.id, itemId, questions });
  await restarted.client.request("fixture/fail", { threadId: c.id });
  assert.equal(resumed.turns.at(-1)!.status, "failed");
  assert.equal(resumed.userInput, undefined);
  assert.ok(JSON.parse(readFileSync(path.join(connection.cwd, "conversations.json"), "utf8"))[0].questions.filter((record: any) => record.itemId.includes("failed-question")).every((record: any) => record.question.status === "expired"), "a terminal error persists all question expiries without turn/completed");
  await history.send({ id: c.id, message: "Disconnect during a question", folders: [], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings);
  await restarted.client.request("fixture/async-question", { threadId: c.id, itemId: "disconnected-question", questions });
  await restarted.close();
  assert.equal(resumed.userInput, undefined);
  assert.equal(JSON.parse(readFileSync(path.join(connection.cwd, "conversations.json"), "utf8"))[0].questions.find((record: any) => record.itemId === "disconnected-question").question.status, "expired");
});

test("Host question tool accepts a confirmed conversation renderer and reports hidden-window failure", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-question-display-")), log = path.join(root, "rpc.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath, args: [fakeServer, log] });
  const conversations = new AssistantConversations(connection, new RootAccess([root]), undefined, 1000);
  t.after(async () => { conversations.close(); await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const settings = { provider: "codex" as const, permissionMode: "read-only" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const c = await conversations.send({ message: "Ask", folders: [], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings, "origin-window");
  const ask = (title: string) => connection.client.request("fixture/tool", { threadId: c.id, tool: "request_litzio_user_input", arguments: { questions: [{ title, options: ["A", "B"] }] } });
  const toolReply = ask("Choose a travel style");
  for (let attempt = 0; !c.userInput && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(c.userInput);
  const q = c.userInput!;
  assert.throws(() => conversations.questionVisible("another-conversation", q.turnId, q.requestId, "other-window"), /another conversation/);
  conversations.questionVisible(c.id, q.turnId, q.requestId, "other-window");
  const accepted = await toolReply;
  assert.equal(accepted.result.success, true);
  assert.equal(JSON.parse(accepted.result.contentItems[0].text).accepted, true);
  assert.deepEqual(conversations.questionVisible(c.id, q.turnId, q.requestId, "origin-window"), { acknowledged: true }, "lost acknowledgements do not apply twice");
  const failed = await ask("Hidden window");
  assert.equal(failed.result.success, false);
  assert.equal(JSON.parse(failed.result.contentItems[0].text).accepted, false);
  assert.match(JSON.parse(failed.result.contentItems[0].text).error, /No Litzio window confirmed/);
  await conversations.answer(c.id, q.turnId, q.requestId, { "0": { answers: ["A"] } }, "answer-window");
  const followupReply = ask("Follow-up during the same turn");
  for (let attempt = 0; !c.userInput && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(c.userInput, "the active turn retains its rendering client for follow-up questions");
  conversations.questionVisible(c.id, c.userInput.turnId, c.userInput.requestId, "answer-window");
  assert.equal((await followupReply).result.success, true);
});

test("skills use only assistant cwd, enabled catalog, explicit input and context history", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-skills-")), log = path.join(root, "rpc.jsonl");
  const connection = new ProviderConnections(root, { bin: process.execPath, args: [fakeServer, log] });
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const catalog = await connection.skills();
  assert.deepEqual(catalog.skills.map(skill => skill.name), ["litzio-guide"]);
  assert.match(catalog.errors[0]!.message, /frontmatter/);
  const skill = catalog.skills[0]!;
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  const settings = { provider: "codex" as const, permissionMode: "read-only" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const input = { message: "$litzio-guide Help", folders: [], model: settings.model, reasoningEffort: settings.reasoningEffort, skills: [{ name: skill.name, path: skill.path }] };
  const conversation = await conversations.send(input, settings);
  await conversations.send({ ...input, id: conversation.id, message: "Steer" }, settings);
  await conversations.interrupt(conversation.id);
  const resumed = await conversations.resume(conversation.id, settings);
  assert.deepEqual(resumed.turns[0]!.items.filter(item => item.kind === "user").map(item => item.references), [[{ name: skill.name, path: skill.path, kind: "skill" }], []]);
  const rpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(rpc.find(item => item.method === "skills/list").params, { cwds: [root], forceReload: true });
  for (const method of ["turn/start", "turn/steer"]) {
    const messages = rpc.find(item => item.method === method).params.input;
    if (method === "turn/start") assert.deepEqual(messages[2], { type: "skill", name: skill.name, path: skill.path });
    assert.equal(messages[0].text, method === "turn/start" ? input.message : "Steer");
    if (method === "turn/steer") assert.equal(messages.some((part: any) => part.type === "skill"), false);
  }
  await assert.rejects(conversations.send({ ...input, message: "$disabled Help", skills: [{ name: "disabled", path: "/disabled/SKILL.md" }] }, settings), /no longer active/);
  const failing = new ProviderConnections(root, { bin: process.execPath, args: [fakeServer, log, "skills-fail"] });
  try { await assert.rejects(failing.skills(), /skills unavailable/); } finally { await failing.close(); }
});

test("display requests report absent windows, expire honestly, cancel and reject mismatched acknowledgements", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const host = new AgentDisplayRequests();
  const before = { theme: "light" as const, uiLanguage: "en" as const, documentWidth: "standard" as const, pageBackground: "paper" as const };
  await assert.rejects(host.execute("read_display_settings", {}, "thread"), /originating/);
  const pending = host.execute("change_display_settings", { changes: { theme: "dark" } }, "thread", "window");
  const rejected = assert.rejects(pending, /unconfirmed/);
  const command = host.snapshot("thread", "window")!;
  assert.throws(() => host.reply("thread", "window", command.id, { before, after: before }), /confirm/);
  await assert.rejects(host.execute("read_display_settings", {}, "thread", "window"), /pending/);
  t.mock.timers.tick(10_000); await rejected;
  assert.equal(host.snapshot("thread", "window"), undefined);
  assert.throws(() => host.reply("thread", "window", command.id, { before, after: { ...before, theme: "dark" } }), /expired/);
  const cancelled = assert.rejects(host.execute("read_display_settings", {}, "thread", "window"), /cancelled/);
  host.cancel("thread"); await cancelled;
  const failed = host.execute("change_display_settings", { changes: { theme: "dark" } }, "thread", "window");
  host.reply("thread", "window", host.snapshot("thread", "window")!.id, { before, after: { ...before, theme: "dark" }, error: "Storage blocked" });
  assert.equal((await failed as { error?: string }).error, "Storage blocked");
  const timers = t.mock.timers;
  for (const skew of [-60_000, 60_000]) await t.test(`remote clock offset ${skew}ms keeps fresh requests and rejects delayed snapshots`, async t => {
    let hostNow = 20_000, screenNow = 5_000_000, screen = false;
    t.mock.method(performance, "now", () => screen ? screenNow : hostNow);
    t.mock.method(Date, "now", () => 1_000_000 + hostNow + (screen ? skew : 0));
    const requests = new AgentDisplayRequests();
    t.after(() => requests.cancel());
    const pollStartedAt = screenNow;
    const fresh = requests.execute("change_display_settings", { changes: { theme: "dark" } }, "thread", "window").catch(error => error);
    hostNow += 2000; screenNow += 2000;
    const command = requests.snapshot("thread", "window")!;
    assert.equal(command.validForMs, 8000, "Snapshots carry remaining Host lifetime, not a renewed lease");
    hostNow += 1000; screenNow += 1000; screen = true;
    assert.equal(displayRequestCurrent(command, pollStartedAt), true, "A fresh request must survive either remote wall-clock offset");
    screen = false;
    requests.reply("thread", "window", command.id, { before, after: { ...before, theme: "dark" } });
    assert.deepEqual((await fresh).changed, ["theme"]);
    const delayedPollStartedAt = screenNow;
    const delayed = requests.execute("read_display_settings", {}, "thread", "window").catch(error => error);
    const oldSnapshot = requests.snapshot("thread", "window")!;
    hostNow += 11_000; screenNow += 11_000; screen = true;
    assert.equal(displayRequestCurrent(oldSnapshot, delayedPollStartedAt), false, "Transit time must not revive an expired Host request");
    screen = false;
    assert.equal(requests.snapshot("thread", "window"), undefined);
    assert.throws(() => requests.reply("thread", "window", oldSnapshot.id, { before, after: before }), /expired/);
    timers.tick(10_000);
    assert.match((await delayed).message, /unconfirmed/);
    assert.equal(requests.snapshot("thread", "window"), undefined);
    assert.throws(() => requests.reply("thread", "window", oldSnapshot.id, { before, after: before }), /expired/);
  });
});


test("Codex requirements disable full access; policy rejection preserves history and permits retry", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-policy-"));
  const connection = new ProviderConnections(root, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url))] });
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const original = connection.client.request.bind(connection.client);
  let discovery = true;
  t.mock.method(connection.client, "request", async (method: string, params?: any) => {
    if (method === "configRequirements/read") {
      if (!discovery) throw new Error("Method not found");
      return { requirements: { allowedSandboxModes: ["read-only", "workspace-write"] } };
    }
    if (method === "turn/start" && params.sandboxPolicy.type === "dangerFullAccess") throw new Error("invalid thread settings override: invalid value for sandbox_mode: DangerFullAccess is not in the allowed set [ReadOnly, WorkspaceWrite] (set by enterprise-managed requirements private-organization)");
    return original(method, params);
  });
  assert.equal((await connection.models()).fullAccessAllowed, false);
  discovery = false;
  assert.equal((await connection.models()).fullAccessAllowed, undefined);
  const conversations = new AssistantConversations(connection, null);
  const settings = { provider: "codex" as const, permissionMode: "opened-folders" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const input = { message: "Keep this conversation", folders: [root], model: settings.model, reasoningEffort: settings.reasoningEffort };
  const conversation = await conversations.send(input, settings);
  await conversations.interrupt(conversation.id);
  const before = conversation.turns.length;
  await assert.rejects(conversations.send({ ...input, id: conversation.id, permissionMode: "full-access" }, settings), { message: "Your organization does not allow Full access. Choose Opened folders or Read-only and send again." });
  assert.equal(conversations.current(conversation.id).turns.length, before);
  const retry = await conversations.send({ ...input, id: conversation.id, permissionMode: "opened-folders" }, settings);
  assert.equal(retry.id, conversation.id);
  assert.equal(retry.turns.at(-1)!.status, "inProgress");
});


test("screen queries isolate originating windows, omit undeclared data and fail on timeout/cancellation", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const host = new AgentScreenRequests();
  const activeTab = { id: "settings", kind: "settings" as const, hostId: null, title: "Settings", unsaved: false };
  const reply = { activeTab, tabs: [activeTab], folders: [{ hostId: "remote", path: "/docs" }] };
  assert.throws(() => host.execute({}, "thread"), /originating/);
  assert.throws(() => host.execute({ text: "excluded" }, "thread", "window"), /no arguments/);
  const result = host.execute({}, "thread", "window");
  const command = host.snapshot("thread", "window")!;
  assert.equal(host.snapshot("thread", "other"), undefined);
  assert.equal(host.snapshot("other-thread", "window"), undefined);
  assert.throws(() => host.reply("thread", "other", command.id, reply), /another window/);
  assert.throws(() => host.reply("other-thread", "window", command.id, reply), /another window/);
  assert.throws(() => host.reply("thread", "window", command.id, { ...reply, activeTab: { ...activeTab, id: "missing" } }), /not open/);
  const untrusted = { ...reply, tabs: [{ ...activeTab, text: "unsaved private content" }] };
  host.reply("thread", "window", command.id, untrusted);
  assert.deepEqual(await result, reply);
  assert.equal(host.snapshot("thread", "window"), undefined);
  const timeout = assert.rejects(host.execute({}, "thread", "window"), /did not respond/);
  const expired = host.snapshot("thread", "window")!;
  t.mock.timers.tick(10_000); await timeout;
  assert.throws(() => host.reply("thread", "window", expired.id, reply), /expired/);
  const cancelled = assert.rejects(host.execute({}, "thread", "window"), /cancelled/);
  host.cancel("thread"); await cancelled;
});
