import { AgentScreenActionRequests } from "../server/assistant-screen-action-tools.ts";
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
  assert.match(requests.find(row => row.method === "session/prompt").params.prompt[0].text, /request_litzio_user_input through the Litzio Host MCP server/);
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
    await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: conversation.id, modelId: input.model }));
    const card = conversation.userInput!;
    assert.ok(card, "ACP fixture permission must become a card");
    assert.equal(turn.items.find(item => item.question?.requestId === card.requestId)!.question!.approval, true);
    const received = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { connection.copilot.off("update", inspect); reject(new Error("Missing ACP permission reply")); }, 5000);
      const inspect = () => { if (turn.items.some(item => item.text.includes('"optionId":"session"'))) { clearTimeout(timer); connection.copilot.off("update", inspect); resolve(); } };
      connection.copilot.on("update", inspect);
    });
    conversations.answer(conversation.id, card.turnId, card.requestId, { decision: { answers: ["2. Allow for this session"] } });
    await received;
    assert.equal(turn.status, "inProgress");
    await assert.rejects(conversations.send({ ...input, reasoningEffort: "low" }, settings), /Stop/);
    await assert.rejects(conversations.send({ ...input, id: conversation.id }, settings), /Stop/);
    const request = { sessionId: conversation.id, toolCall: { toolCallId: "write", kind: "edit" as const, locations: [{ path: path.join(root, "new.txt") }] }, options: [{ optionId: "once", name: "Allow once", kind: "allow_once" as const }] };
    assert.deepEqual((await resolvePermission(connection, conversations, request)), { outcome: { outcome: "cancelled" } });
    for (const kind of ["read", "search", "edit", "delete", "move", "execute", "fetch"] as const) {
      const result = (await resolvePermission(connection, conversations, { ...request, toolCall: { toolCallId: kind, kind, locations: [{ path: log }] } }));
      assert.equal(result.outcome.outcome, kind === "read" || kind === "search" ? "selected" : "cancelled", `read-only ${kind}`);
      assert.equal((await resolvePermission(connection, conversations, { ...request, toolCall: { toolCallId: kind, kind, locations: [{ path: path.join(root, "..", "outside.txt") }] } })).outcome.outcome, "cancelled", `read-only outside ${kind}`);
    }
    assert.deepEqual((await resolvePermission(connection, conversations, { ...request, toolCall: { toolCallId: "url", kind: "fetch" } })), { outcome: { outcome: "cancelled" } });
    const rejectRequest = { ...request, options: [{ optionId: "yes", name: "Allow", kind: "allow_once" as const }, { optionId: "no", name: "Deny", kind: "reject_once" as const }] };
    const rejection = connection.copilot.permission!(rejectRequest);
    const rejecting = conversation.userInput!;
    conversations.answer(conversation.id, rejecting.turnId, rejecting.requestId, { decision: { answers: ["2. Deny"] } });
    assert.deepEqual(await rejection, { outcome: { outcome: "selected", optionId: "no" } });
    const cancelled = connection.copilot.permission!(request), expiring = conversation.userInput!;
    await conversations.interrupt(conversation.id);
    assert.deepEqual(await cancelled, { outcome: { outcome: "cancelled" } });
    assert.equal(conversation.turns.flatMap(t => t.items).find(i => i.question?.requestId === expiring.requestId)?.question?.status, "expired");
    // A protocol barrier ensures prompt completion is processed, without a timing assumption.
    await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: conversation.id, modelId: input.model }));
    assert.equal(turn.status, "interrupted");
    await conversations.send({ ...input, id: conversation.id, permissionMode: "opened-folders" }, settings);
    assert.deepEqual((await resolvePermission(connection, conversations, request)), { outcome: { outcome: "selected", optionId: "once" } });
    writeFileSync(path.join(root, "target.txt"), "move destination fixture");
    for (const kind of ["read", "search", "edit", "delete", "move", "other", "fetch"] as const) {
      const scoped = { ...request, toolCall: { toolCallId: kind, kind, locations: [{ path: log }, { path: path.join(root, "target.txt") }] } };
      assert.equal((await resolvePermission(connection, conversations, scoped)).outcome.outcome, "selected", `opened-folders ${kind}`);
      assert.equal((await resolvePermission(connection, conversations, { ...scoped, toolCall: { ...scoped.toolCall, locations: [...scoped.toolCall.locations, { path: path.join(root, "..", "outside.txt") }] } })).outcome.outcome, "cancelled", `mixed outside locations ${kind}`);
    }
    assert.equal((await resolvePermission(connection, conversations, { ...request, toolCall: { toolCallId: "shell", kind: "execute", locations: [{ path: log }] } })).outcome.outcome, "cancelled", "even an inside location cannot authorize shell");
    assert.equal((await resolvePermission(connection, conversations, { ...request, toolCall: { toolCallId: "move", kind: "move" } })).outcome.outcome, "cancelled", "a file mutation still needs locations");
    assert.deepEqual((await resolvePermission(connection, conversations, { ...request, toolCall: { ...request.toolCall, locations: [{ path: path.join(root, "..", "outside.txt") }] } })), { outcome: { outcome: "cancelled" } });
    assert.deepEqual((await resolvePermission(connection, conversations, { ...request, toolCall: { toolCallId: "url", kind: "fetch" } })), { outcome: { outcome: "selected", optionId: "once" } });
    assert.deepEqual((await resolvePermission(connection, conversations, { ...request, toolCall: { toolCallId: "shell", kind: "execute" } })), { outcome: { outcome: "cancelled" } });
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
    await connection.copilot.useLaunchSettings("low", false);
    const resumedFailure = await conversations.resume(conversation.id, settings);
    assert.equal(resumedFailure.turns.flatMap(turn => turn.items).some(item => item.submissionId === failedInput.submissionId), false);
    assert.equal(conversations.submission(failedInput.submissionId).submission.status, "unknown", "missing provider history must not erase uncertainty");
    assert.ok(resumedFailure.turns.flatMap(turn => turn.items).filter(item => item.kind === "user").every(item => item.userMessageSource === "provider-history"));
    await connection.copilot.useLaunchSettings("low", false);
    await connection.copilot.useLaunchSettings("high", false);
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
  assert.deepEqual((await resolvePermission(connection, conversations, execution)), { outcome: { outcome: "selected", optionId: "once" } });
  assert.deepEqual((await resolvePermission(connection, conversations, { ...execution, toolCall: { toolCallId: "outside", kind: "edit", locations: [{ path: path.join(root, "..", "outside.txt") }] } })), { outcome: { outcome: "selected", optionId: "once" } });
  assert.deepEqual((await resolvePermission(connection, conversations, { ...execution, toolCall: { toolCallId: "url", kind: "fetch" } })), { outcome: { outcome: "selected", optionId: "once" } });
  await conversations.interrupt(full.id);
  // cancel is a notification: wait for the existing RPC barrier before reading child-owned JSONL.
  await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: full.id, modelId: input.model }));
  const fullRpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const launch = fullRpc.filter(message => message.args).at(-1);
  assert.ok(!launch.args.includes("--deny-tool=shell"));
  assert.ok(!launch.args.includes("--disable-builtin-mcps"));
  assert.ok(fullRpc.some(message => message.method === "session/set_config_option" && message.params.configId === "allow_all" && message.params.value === "on"));
  const restricted = await conversations.send({ ...input, id: full.id, permissionMode: "read-only" }, settings);
  assert.deepEqual((await resolvePermission(connection, conversations, { ...execution, sessionId: restricted.id })), { outcome: { outcome: "cancelled" } });
  await conversations.interrupt(restricted.id);
  // Wait for the fixture to finish logging prior requests before reading its JSONL.
  await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: restricted.id, modelId: input.model }));
  const restrictedRpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.ok(!restrictedRpc.filter(message => message.args).at(-1).args.includes("--deny-tool=shell"));
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
  assert.ok(rpc.find(message => message.method === "session/prompt").params.prompt[0].text.includes("Edit existing documents only after an explicit user edit request"));
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
    await history.interrupt(conversation.id);
    await history.send({ ...input, id: conversation.id, permissionMode: "full-access" }, settings);
    const outsideFile = path.join(outside, "Full.md");
    for (const [tool, arguments_] of [["create_document", { ...args, path: outsideFile }], ["read_document", { path: outsideFile }], ["stage_document", { path: outsideFile }]] as const) {
      const response = await next.client.request("fixture/tool", { threadId: conversation.id, tool, arguments: arguments_ });
      assert.equal(response.result.success, true, `${tool} outside opened folders in Full access`);
    }
    const hostDenied = await next.client.request("fixture/tool", { threadId: conversation.id, tool: "read_document", arguments: { path: path.join(root, "..", "outside-host.md") } });
    assert.equal(hostDenied.result.success, false, "Full access preserves Host roots");
    const rpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(rpc.find(entry => entry.method === "thread/start").params.dynamicTools.map((tool: any) => tool.name), ["inspect_staged_document", "edit_staged_document", "stage_document", "create_document", "read_document", "list_documents", "read_screen_context", "close_tabs", "open_folder", "close_folders", "read_display_settings", "change_display_settings", "list_templates", "read_template", "save_template", "request_litzio_user_input"]);
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


test("async questions retain metadata and accept follow-up answers after completion and restart", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-async-question-")), log = path.join(root, "rpc.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath, args: [fakeServer, log] });
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  let restarted: ProviderConnections | undefined;
  t.after(async () => { await restarted?.close(); await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const settings = { provider: "codex" as const, permissionMode: "read-only" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  let c = await conversations.send({ message: "Ask about travel", folders: [], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings);
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
  c = reopened;
  const restored = (reopened.turns.flatMap(turn => turn.items).find(item => item.id === "travel-question") as any).question;
  assert.equal(restored.status, "answered");
  assert.deepEqual(restored.answers, answers);
  assert.deepEqual(restored.sourceQuestions, questions);
  await conversations.send({ id: c.id, message: "Ask another question", folders: [], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings);
  await connection.client.request("fixture/async-question", { threadId: c.id, itemId: "later-question", questions });
  await connection.client.request("fixture/async-question", { threadId: c.id, itemId: "second-pending-question", questions });
  await connection.client.request("fixture/finish", { threadId: c.id });
  const origin = c.turns.at(-1)!.id;
  assert.equal(c.userInput?.requestId, "later-question");
  await conversations.interrupt(c.id);
  await connection.close();
  restarted = new ProviderConnections(connection.cwd, { bin: process.execPath, args: [fakeServer, log] });
  const history = new AssistantConversations(restarted, new RootAccess([root]));
  const resumed = await history.resume(c.id, settings);
  assert.equal(resumed.userInput?.requestId, "later-question", "unanswered questions survive restart and reopen");
  assert.throws(() => history.answer(c.id, "other-turn", "later-question", answers), /expired/);
  const sending = history.answer(c.id, origin, "later-question", answers);
  assert.throws(() => history.answer(c.id, origin, "later-question", answers), /expired/, "consume before awaiting dispatch");
  await sending;
  const followup = resumed.turns.at(-1)!;
  assert.notEqual(followup.id, origin);
  assert.equal(followup.status, "inProgress");
  assert.equal(followup.items.find(item => item.kind === "user")?.questionAnswer?.requestId, "later-question");
  const rpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.match(JSON.stringify(rpc.filter(row => row.method === "turn/start").at(-1).params.input), /later-question/);
  await restarted.client.request("fixture/fail", { threadId: c.id });
  await history.answer(c.id, origin, "second-pending-question", answers);
  assert.equal(resumed.turns.at(-1)!.status, "inProgress", "answers remain usable after a failed turn");
  await restarted.client.request("fixture/async-question", { threadId: c.id, itemId: "stopped-question", questions });
  const stoppedOrigin = resumed.turns.at(-1)!.id;
  await history.interrupt(c.id);
  await history.answer(c.id, stoppedOrigin, "stopped-question", answers);
  assert.equal(resumed.turns.at(-1)!.status, "inProgress", "answers remain usable after interruption");
  assert.deepEqual(resumed.turns[0]!.items.find(item => item.id === "travel-question")!.question!.answers, answers);
});

test("Host question tool accepts saved questions without a viewing window", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-question-display-")), log = path.join(root, "rpc.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath, args: [fakeServer, log] });
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  t.after(async () => { await conversations.close(); await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const settings = { provider: "codex" as const, permissionMode: "read-only" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const c = await conversations.send({ message: "Ask", folders: [], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings);
  const accepted = await connection.client.request("fixture/tool", { threadId: c.id, tool: "request_litzio_user_input", arguments: { questions: [{ title: "Choose a travel style", options: ["A", "B"] }] } });
  assert.equal(accepted.result.success, true);
  assert.equal(JSON.parse(accepted.result.contentItems[0].text).accepted, true);
  const q = c.userInput!;
  assert.ok(q);
  const saved = JSON.parse(readFileSync(path.join(connection.cwd, "conversations.json"), "utf8"));
  assert.equal(saved[0].questions[0].question.status, "pending");
  const other = await conversations.send({ message: "Other conversation", folders: [], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings);
  assert.throws(() => conversations.answer(other.id, q.turnId, q.requestId, { "0": { answers: ["A"] } }), /expired/);
  await connection.client.request("fixture/finish", { threadId: c.id });
  await conversations.answer(c.id, q.turnId, q.requestId, { "0": { answers: ["A"] } }, "another-window");
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


test("Codex requirements disable full access; policy rejection retries once before execution and remembers reduced access", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-policy-"));
  const connection = new ProviderConnections(root, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url))] });
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const original = connection.client.request.bind(connection.client);
  let discovery = true;
  const policies: string[] = [];
  let uncertain = false;
  t.mock.method(connection.client, "request", async (method: string, params?: any) => {
    if (method === "configRequirements/read") {
      if (!discovery) throw new Error("Method not found");
      return { requirements: { allowedSandboxModes: ["read-only", "workspace-write"] } };
    }
    if (method === "turn/start") { policies.push(params.sandboxPolicy.type); if (uncertain) throw new Error("Connection closed before response"); }
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
  const retry = await conversations.send({ ...input, id: conversation.id, permissionMode: "full-access" }, settings);
  assert.equal(retry.id, conversation.id);
  assert.equal(retry.turns.length, before + 1, "only the admitted retry creates a turn");
  assert.equal(retry.permissionMode, "opened-folders");
  assert.equal(retry.permissionFallback, true);
  assert.deepEqual(policies, ["workspaceWrite", "dangerFullAccess", "workspaceWrite"]);
  await conversations.interrupt(retry.id);
  const restored = await new AssistantConversations(connection, null).resume(retry.id, { ...settings, permissionMode: "full-access" });
  assert.equal(restored.permissionMode, "opened-folders");
  assert.equal(restored.permissionFallback, true);
  await conversations.send({ ...input, id: restored.id }, { ...settings, permissionMode: "full-access" });
  assert.equal(policies.at(-1), "workspaceWrite", "next turn does not repeat the rejection");
  await conversations.interrupt(restored.id);
  const changed = await conversations.send({ ...input, id: restored.id, permissionMode: "read-only" }, settings);
  assert.equal(changed.permissionMode, "read-only");
  assert.equal(changed.permissionFallback, undefined, "explicit changed permission clears the fallback notice");
  await conversations.interrupt(changed.id);
  const reopened = await new AssistantConversations(connection, null).resume(changed.id, settings);
  assert.equal(reopened.permissionFallback, undefined, "cleared notice stays cleared on resume");
  assert.equal(reopened.permissionMode, "read-only");
  uncertain = true;
  const attempts = policies.length;
  await assert.rejects(conversations.send({ ...input, id: restored.id, permissionMode: "full-access" }, settings), /Connection closed before response/);
  assert.equal(policies.length, attempts + 1, "uncertain acceptance must never replay a request");

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


test("screen actions validate inputs, isolate windows and classify unconfirmed effects", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const host = new AgentScreenActionRequests();
  assert.equal((await host.execute("close_tabs", { tabIds: [] }, "thread", "window")).outcome, "invalid_input");
  assert.equal((await host.execute("close_tabs", { tabIds: "all", unexpected: true }, "thread", "window")).outcome, "invalid_input");
  assert.equal((await host.execute("open_folder", { hostId: "local", path: "/docs" }, "thread")).outcome, "unavailable");
  for (const [name, input] of [["close_tabs", {tabIds: ["saved", "dirty"]}], ["open_folder", {hostId: "local", path: "/docs"}], ["close_folders", {folders: "all"}]] as const) {
    const result = host.execute(name, input, "thread", "window");
    const command = host.snapshot("thread", "window")!;
    assert.equal(command.action.kind, name);
    assert.equal(host.snapshot("thread", "other"), undefined);
    assert.equal(host.snapshot("other", "window"), undefined);
    const reply = {outcome: "conflict" as const, completed: ["saved"], remaining: [{target: "dirty", reason: "Unsaved confirmation pending."}]};
    assert.throws(() => host.reply("thread", "other", command.id, reply), /another window/);
    assert.throws(() => host.reply("other", "window", command.id, reply), /another window/);
    assert.equal((await host.execute(name, input, "thread", "window")).outcome, "conflict");
    host.reply("thread", "window", command.id, reply);
    assert.deepEqual(await result, reply);
    assert.throws(() => host.reply("thread", "window", command.id, reply), /expired/);
  }
  const timeout = host.execute("close_tabs", {tabIds: "all"}, "thread", "window");
  t.mock.timers.tick(10_000); assert.equal((await timeout).outcome, "uncertain");
  const cancelled = host.execute("close_tabs", {tabIds: "all"}, "thread", "window");
  host.cancel("thread"); assert.equal((await cancelled).outcome, "uncertain");
});

test("Copilot HTTP MCP reuses loaded sessions and isolates active turn scopes", async t => {
  const { createServer } = await import("node:http");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const root = mkdtempSync(path.join(tmpdir(), "copilot-mcp-"));
  const log = path.join(root, "acp.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), undefined, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log] });
  const conversations = new AssistantConversations(connection, new RootAccess([root]), {
    viewOperationOwner: () => "fixture",
    invokeAssistantOperation: async () => ({ receipt: { outcome: "success" }, rows: [{ title: "Host read" }] }),
  } as any);
  const server = createServer((req, res) => { void conversations.mcp.handle(req, res); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  conversations.mcp.base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  const clients: InstanceType<typeof Client>[] = [];
  t.after(async () => { await Promise.all(clients.map(client => client.close())); await connection.close(); await conversations.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); });
  const settings = { provider: "copilot" as const, permissionMode: "opened-folders" as const, model: "auto", reasoningEffort: "low" };
  const input = { message: "Inspect files", folders: [root], model: "auto", reasoningEffort: "low" };
  const first = await conversations.send(input, settings, "mcp-window-one");
  // The fixture may still be appending a later request; parse only complete lines.
  const rows = () => readFileSync(log, "utf8").split("\n").slice(0, -1).map(line => JSON.parse(line));
  const endpoint = () => rows().filter(row => ["session/new", "session/load"].includes(row.method) && row.params.mcpServers.length).at(-1).params.mcpServers[0].url;
  const firstUrl = endpoint();
  const connect = async (url: string) => { const client = new Client({ name: "fixture", version: "1" }); clients.push(client); await client.connect(new StreamableHTTPClientTransport(new URL(url))); return client; };
  const one = await connect(firstUrl);
  assert.deepEqual((await one.listTools()).tools, conversations.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema: { type: "object", ...inputSchema } })));
  assert.equal((await one.callTool({ name: "list_documents", arguments: { path: root } })).isError, false);
  const { documentTools } = await import("../server/assistant-document-tools.ts");
  const published = (await one.listTools()).tools;
  for (const name of ["inspect_staged_document", "edit_staged_document"]) {
    const definition = documentTools.find(tool => tool.name === name)!;
    assert.deepEqual(published.find(tool => tool.name === name), { name, description: definition.description, inputSchema: definition.inputSchema });
  }
  const original = path.join(root, "a.md"), source = "---\nlitzio: 1\n---\n\nFirst paragraph.\n\nSecond paragraph.\n";
  writeFileSync(original, source);
  const payload = (result: any) => JSON.parse(result.content[0].text);
  const structuredPath=path.join(root,"structured-mcp.md");
  const operations=[{command:"insert-table",at:"end",cells:[["Task","State"],["A","Done"]]},{command:"insert-figure",at:"end",image:"missing.png",caption:"Chart"}];
  const rejectedStructure=await one.callTool({name:"create_document",arguments:{path:structuredPath,title:"Report",operations:[...operations,{command:"remove-block",at:99999}]}});
  assert.equal(rejectedStructure.isError,true);assert.equal(payload(rejectedStructure).errorKind,"invalid_input");
  assert.equal(payload(rejectedStructure).recovery.action,"correct_input");assert.equal(existsSync(structuredPath),false);
  const structured=await one.callTool({name:"create_document",arguments:{path:structuredPath,title:"Report",operations}});
  assert.equal(structured.isError,false);assert.equal(payload(structured).receipt.outcome,"success");
  assert.equal(payload(structured).path,structuredPath);assert.ok(payload(structured).revision);
  assert.equal(payload(structured).readiness[0].status,"missing_or_unreadable","asset warnings must survive without becoming a document-write failure");
  const stagedResult = await one.callTool({ name: "stage_document", arguments: { path: original } });
  assert.equal(stagedResult.isError, false);
  const staged = payload(stagedResult);
  const inspectedResult = await one.callTool({ name: "inspect_staged_document", arguments: { change: staged.id } });
  assert.equal(inspectedResult.isError, false);
  const inspected = payload(inspectedResult), secondNode = inspected.nodes.find((node: any) => node.text === "Second paragraph.");
  assert.ok(secondNode);
  const editInput = { change: staged.id, copyRevision: inspected.copyRevision, operations: [{ command: "update-node-text", path: secondNode.path.join(","), from: secondNode.text, to: "Edited through MCP." }] };
  const rejectedPath = await one.callTool({ name: "edit_staged_document", arguments: { ...editInput, path: original } });
  assert.equal(rejectedPath.isError, true);
  assert.equal(payload(rejectedPath).errorKind, "invalid_input", "MCP cannot supply a write path instead of the Host change ID");
  const edited = await one.callTool({ name: "edit_staged_document", arguments: editInput });
  assert.equal(edited.isError, false);
  assert.equal(payload(edited).receipt.outcome, "success");
  assert.match(readFileSync(staged.copy, "utf8"), /Edited through MCP/);
  const editedBytes = readFileSync(staged.copy, "utf8");
  const atomic = await one.callTool({ name: "edit_staged_document", arguments: { ...editInput, copyRevision: payload(edited).copyRevision, operations: [{ command: "insert-block", at: "end", text: "Must roll back" }, { command: "remove-block", at: 99999 }] } });
  assert.equal(atomic.isError, true);
  assert.equal(payload(atomic).errorKind, "invalid_input");
  assert.match(payload(atomic).error, /operation 2/);
  assert.equal(readFileSync(staged.copy, "utf8"), editedBytes);
  const badScreenAction=await one.callTool({name:"close_tabs",arguments:{}});
  assert.equal(badScreenAction.isError,true);assert.equal(payload(badScreenAction).errorKind,"invalid_input");
  const stale = await one.callTool({ name: "edit_staged_document", arguments: editInput });
  assert.equal(stale.isError, true); assert.equal(payload(stale).errorKind, "conflict");
  assert.equal(payload(stale).recovery.tool,"inspect_staged_document");
  const refreshed=await one.callTool({name:payload(stale).recovery.tool,arguments:payload(stale).recovery.arguments});
  assert.equal(payload(refreshed).copyRevision,payload(edited).copyRevision);
  assert.equal(readFileSync(original, "utf8"), source, "MCP edits only the pending copy, awaiting human Apply");
  const other = await conversations.send(input, settings);
  const otherClient = await connect(endpoint());
  const foreign = await otherClient.callTool({ name: "inspect_staged_document", arguments: { change: staged.id } });
  assert.equal(foreign.isError, true);
  assert.equal(payload(foreign).errorKind, "unavailable", "even with the same folder scope, another conversation cannot read this receipt");
  const foreignEdit = await otherClient.callTool({ name: "edit_staged_document", arguments: { ...editInput, copyRevision: payload(edited).copyRevision } });
  assert.equal(foreignEdit.isError, true); assert.equal(payload(foreignEdit).errorKind, "unavailable");
  await conversations.interrupt(other.id);

  const screenRead = one.callTool({ name: "read_screen_context", arguments: {} });
  const screenDeadline = Date.now() + 5000;
  while (!conversations.screen.snapshot(first.id, "mcp-window-one") && Date.now() < screenDeadline) await new Promise(resolve => setTimeout(resolve, 10));
  const screenRequest = conversations.screen.snapshot(first.id, "mcp-window-one");
  assert.ok(screenRequest, "Copilot MCP dispatch uses the originating window handler");
  assert.equal(conversations.screen.snapshot(first.id, "other-window"), undefined);
  connection.client.emit("disconnected", "Unrelated Codex connection closed");
  assert.ok(conversations.screen.snapshot(first.id, "mcp-window-one"), "a Codex disconnect cannot cancel the Copilot window query");
  const screenInfo = { activeTab: null, tabs: [], folders: [{ hostId: "fixture-host", path: root }] };
  assert.throws(() => conversations.screen.reply(first.id, "other-window", screenRequest.id, screenInfo), /another window/);
  conversations.screen.reply(first.id, "mcp-window-one", screenRequest.id, screenInfo);
  const screenResult = await screenRead;
  assert.equal(screenResult.isError, false);
  assert.deepEqual(JSON.parse((screenResult.content as { text: string }[])[0]!.text), screenInfo);
  for (const [name, args] of [["close_tabs", {tabIds: ["saved", "dirty", "gone"]}], ["open_folder", {hostId: "local", path: root}], ["close_folders", {folders: "all"}]] as const) {
    assert.ok(conversations.tools.some(tool => tool.name === name), "screen actions belong to the common Codex/MCP catalog");
    const actionCall = one.callTool({name, arguments: args});
    const actionDeadline = Date.now() + 5000;
    while (!conversations.screenActions.snapshot(first.id, "mcp-window-one") && Date.now() < actionDeadline) await new Promise(resolve => setTimeout(resolve, 10));
    const action = conversations.screenActions.snapshot(first.id, "mcp-window-one");
    assert.ok(action, "MCP forwards to the existing window action request path");
    assert.deepEqual(action.action, {kind: name, ...args});
    assert.equal(conversations.screenActions.snapshot(first.id, "other-window"), undefined);
    assert.equal(conversations.screenActions.snapshot("other-conversation", "mcp-window-one"), undefined);
    connection.client.emit("disconnected", "Unrelated Codex connection closed");
    assert.ok(conversations.screenActions.snapshot(first.id, "mcp-window-one"));
    // The same App handler rechecks targets/dirty state; its classified partial result
    // must pass through MCP unchanged, rather than becoming a blanket success.
    const reply = {outcome: "conflict" as const, completed: ["saved"], remaining: [{target: "dirty", reason: "Unsaved confirmation required."}, {target: "gone", reason: "Tab no longer open."}]};
    assert.throws(() => conversations.screenActions.reply(first.id, "other-window", action.id, reply), /another window/);
    assert.throws(() => conversations.screenActions.reply("other-conversation", "mcp-window-one", action.id, reply), /another window/);
    conversations.screenActions.reply(first.id, "mcp-window-one", action.id, reply);
    const result = await actionCall;
    assert.equal(result.isError, true);
    const {receipt,errorKind,recovery,...targets}=payload(result);
    assert.deepEqual(targets,reply);
    assert.equal(receipt.outcome,"failure");assert.equal(errorKind,"conflict");
    assert.equal(recovery.tool,"read_screen_context");
  }
  const permission = async (serverName: string, toolName: string, metadata = true) => (await resolvePermission(connection, conversations, { sessionId: first.id, toolCall: { toolCallId: "mcp", kind: "other", title: "litzio_host-list_documents", ...(metadata ? { rawInput: { serverName, toolName } } : {}) }, options: [{ optionId: "once", kind: "allow_once", name: "Once" }] }));
  assert.equal((await permission("litzio_host", "list_documents")).outcome.outcome, "selected");
  assert.equal((await permission("foreign", "list_documents")).outcome.outcome, "cancelled");
  assert.equal((await permission("litzio_host", "missing_tool")).outcome.outcome, "cancelled");
  assert.equal((await permission("litzio_host", "list_documents", false)).outcome.outcome, "cancelled", "a matching title alone does not identify a Host tool");
  const second = await conversations.send({ ...input, folders: [] }, { ...settings, permissionMode: "read-only" });
  const two = await connect(endpoint());
  const noWindow = await two.callTool({ name: "read_screen_context", arguments: {} });
  assert.equal(noWindow.isError, true);
  assert.match(JSON.stringify(noWindow.content), /No originating Litzio window/);
  const noActionWindow = await two.callTool({name: "close_tabs", arguments: {tabIds: "all"}});
  assert.equal(noActionWindow.isError,true);
  assert.equal(JSON.parse((noActionWindow.content as {text: string}[])[0]!.text).outcome, "unavailable");
  assert.equal((await two.callTool({ name: "invoke_plugin_operation", arguments: { operation: "fixture.read", input: {} } })).isError, false, "read-only MCP dispatch uses the same Host plugin operation path");
  assert.equal((await two.callTool({ name: "list_documents", arguments: { path: root } })).isError, true, "a second conversation cannot inherit the first folder scope");
  const readOnlyEdit = await two.callTool({ name: "edit_staged_document", arguments: editInput });
  assert.equal(readOnlyEdit.isError, true); assert.equal(payload(readOnlyEdit).errorKind, "forbidden");

  assert.equal((await one.callTool({ name: "request_litzio_user_input", arguments: {} })).isError, true, "text questions must not create review image approval");
  const asked = await one.callTool({ name: "request_litzio_user_input", arguments: { questions: [{ title: "Which result?", options: ["Summary", "Details"] }] } });
  assert.equal(asked.isError, false, "Copilot supports the shared structured question tool over HTTP MCP");
  assert.ok(first.turns.flatMap(t => t.items).some(item => item.question?.sourceQuestions?.[0]?.title === "Which result?"));
  const endingAction = one.callTool({name: "close_tabs", arguments: {tabIds: "all"}});
  const endingDeadline = Date.now() + 5000;
  while (!conversations.screenActions.snapshot(first.id, "mcp-window-one") && Date.now() < endingDeadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(conversations.screenActions.snapshot(first.id, "mcp-window-one"));
  await conversations.interrupt(first.id);
  const endedAction = await endingAction;
  assert.equal(endedAction.isError,true);
  assert.equal(payload(endedAction).recovery.tool,"read_screen_context");
  assert.equal(JSON.parse((endedAction.content as {text: string}[])[0]!.text).outcome, "uncertain");
  assert.equal(conversations.screenActions.snapshot(first.id, "mcp-window-one"), undefined);

  await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: first.id, modelId: "auto" }));
  await assert.rejects(one.callTool({ name: "list_documents", arguments: { path: root } }), /No authorized active turn/);
  assert.equal((await permission("litzio_host", "list_documents")).outcome.outcome, "cancelled");
  const deadline = Date.now() + 5000;
  while (first.turns.at(-1)?.status === "inProgress" && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.notEqual(first.turns.at(-1)?.status, "inProgress");
  await assert.rejects(one.callTool({ name: "edit_staged_document", arguments: { ...editInput, copyRevision: payload(edited).copyRevision } }), /No authorized active turn/);
  assert.equal(readFileSync(staged.copy, "utf8"), editedBytes, "an ended MCP turn cannot edit its earlier copy");
  assert.equal(readFileSync(original, "utf8"), source);

  const previousTurn = first.turns.at(-1)!.id;
  await conversations.send({ ...input, id: first.id, folders: [] }, { ...settings, permissionMode: "read-only" });
  assert.equal(rows().some(row => row.method === "session/load"), false, "a loaded session must not be loaded twice");
  assert.notEqual(first.turns.at(-1)!.id, previousTurn);
  assert.equal((await one.callTool({ name: "invoke_plugin_operation", arguments: { operation: "fixture.read", input: {} } })).isError, false, "the original endpoint serves the new admitted turn");
  assert.equal((await one.callTool({ name: "list_documents", arguments: { path: root } })).isError, true, "the new turn cannot inherit earlier folders");
  assert.equal((await one.callTool({ name: "edit_staged_document", arguments: editInput })).isError, true, "the new turn cannot inherit write access");
  assert.ok(!rows().find(row => row.args)?.args.includes("--deny-tool=shell"));
  assert.ok(rows().find(row => row.args)?.args.includes("--allow-tool=litzio_host"));
  assert.ok(rows().filter(row => row.args).every(row => !row.args.includes("--disable-builtin-mcps")));
  await conversations.interrupt(first.id); await conversations.interrupt(second.id);
  const idleDeadline = Date.now() + 5000;
  while ([first.id, second.id].some(id => conversations.current(id).turns.some(turn => turn.status === "inProgress")) && Date.now() < idleDeadline) await new Promise(resolve => setTimeout(resolve, 10));
  for (const [message, status] of [["COMPLETE THIS TURN", "completed"], ["FAIL THIS TURN", "failed"]]) {
    await conversations.send({ ...input, id: first.id, message: message! }, settings);
    const deadline = Date.now() + 5000;
    while (first.turns.at(-1)!.status === "inProgress" && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(first.turns.at(-1)!.status, status);
    await assert.rejects(one.callTool({ name: "list_documents", arguments: { path: root } }), /No authorized active turn/);
  }
  assert.equal(rows().some(row => row.method === "session/load"), false);
  await connection.copilot.useLaunchSettings("medium", false);
  await conversations.resume(first.id, settings);
  const idleUrl = endpoint();
  assert.notEqual(idleUrl, firstUrl, "process restart replaces the session endpoint");
  assert.equal((await fetch(firstUrl, { method: "POST" })).status, 403);
  await conversations.resume(first.id, settings);
  assert.equal(rows().filter(row => row.method === "session/load" && row.params.sessionId === first.id).length, 1);
  conversations.remove(first.id, () => {});
  assert.equal((await fetch(idleUrl, { method: "POST" })).status, 403, "deleting an idle resumed conversation revokes its lease");
  await connection.models("copilot");
  const acp = await connection.copilot.connect();
  let failedUrl = "";
  const failedSetup = t.mock.method(acp, "newSession", async (params: Parameters<typeof acp.newSession>[0]) => {
    failedUrl = (params.mcpServers[0] as { url: string }).url;
    throw new Error("fixture session setup failure");
  });
  await assert.rejects(conversations.send(input, settings), /fixture session setup failure/);
  assert.equal((await fetch(failedUrl, { method: "POST" })).status, 403);
  failedSetup.mock.restore();
  let correctionId = "";
  const failedConfiguration = t.mock.method(acp, "setSessionMode", async (params: Parameters<typeof acp.setSessionMode>[0]) => { correctionId = params.sessionId; throw new Error("fixture session configuration failure"); });
  await assert.rejects(conversations.send(input, settings), /fixture session configuration failure/);
  const idle = await connect(endpoint());
  await assert.rejects(idle.callTool({ name: "list_documents", arguments: { path: root } }), /No authorized active turn/);
  failedConfiguration.mock.restore();
  await conversations.send({ ...input, id: correctionId }, settings);
  assert.equal((await idle.callTool({ name: "list_documents", arguments: { path: root } })).isError, false, "corrected settings reuse the created session endpoint");
  await conversations.interrupt(correctionId);
  t.mock.method(acp, "loadSession", async (params: Parameters<typeof acp.loadSession>[0]) => {
    failedUrl = (params.mcpServers[0] as { url: string }).url;
    throw new Error("fixture resume setup failure");
  });
  await assert.rejects(conversations.resume(second.id, settings), /fixture resume setup failure/);
  assert.equal((await fetch(failedUrl, { method: "POST" })).status, 403);
});


test("Codex approvals forward card answers to the provider RPC", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-approval-")), log = path.join(root, "rpc.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath, args: [fakeServer, log] });
  const conversations = new AssistantConversations(connection, null);
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const settings = { provider: "codex" as const, permissionMode: "opened-folders" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const c = await conversations.send({ message: "Approve", folders: [root], model: settings.model, reasoningEffort: "medium" }, settings);
  const cases = [
    ["item/commandExecution/requestApproval", "Allow once", { decision: "accept" }],
    ["item/commandExecution/requestApproval", "Allow for this session", { decision: "acceptForSession" }],
    ["item/fileChange/requestApproval", "Reject", { decision: "decline" }],
    ["mcpServer/elicitation/request", "Allow once", { action: "accept", content: {}, _meta: null }],
    ["mcpServer/elicitation/request", "Reject", { action: "decline", content: null, _meta: null }],
  ] as const;
  for (const [index, [method, label, result]] of cases.entries()) {
    const requestId = `approval-${index}`;
    await connection.client.request("fixture/approval", { threadId: c.id, requestId, method, input: { command: "read outside.txt", mode: "form", message: "Continue?", requestedSchema: { type: "object", properties: {} } } });
    assert.equal(c.userInput?.requestId, requestId);
    assert.equal(c.turns.at(-1)!.items.find(item => item.question?.requestId === requestId)!.question!.approval, !method.includes("elicitation"));
    conversations.answer(c.id, c.turns.at(-1)!.id, requestId, { decision: { answers: [label] } });
    assert.throws(() => conversations.answer(c.id, c.turns.at(-1)!.id, requestId, { decision: { answers: [label] } }), /expired/);
    await connection.client.request("notify");
    assert.deepEqual(readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).find(row => row.id === requestId).result, result);
  }
  const ask = (requestId: string | number, input = {}) => connection.client.request("fixture/approval", { threadId: c.id, requestId, method: "mcpServer/elicitation/request", input: { mode: "form", requestedSchema: { type: "object", properties: { value: { type: "integer" } }, required: ["value"] }, ...input } });
  await ask("form");
  const answer = (requestId: string | number, text: string) => conversations.answer(c.id, c.turns.at(-1)!.id, requestId, { decision: { answers: [text] } });
  assert.throws(() => answer("form", "Allow once"), /JSON/);
  assert.equal(c.userInput?.requestId, "form", "invalid form input leaves the RPC answerable");
  answer("form", '{"value":7}');
  await connection.client.request("notify");
  assert.deepEqual(readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).find(row => row.id === "form").result.content, { value: 7 });
  await ask(0); await ask("0");
  answer("0", "Reject");
  assert.equal(c.userInput?.requestId, 0, "parallel typed request IDs remain independent");
  await connection.client.request("fixture/resolved", { threadId: c.id, requestId: 0 });
  assert.throws(() => answer(0, "Reject"), /expired/);
  await ask("ended");
  await connection.client.request("fixture/finish", { threadId: c.id });
  assert.throws(() => answer("ended", "Reject"), /expired/);

});


async function resolvePermission(connection: ProviderConnections, conversations: AssistantConversations, request: Parameters<NonNullable<ProviderConnections["copilot"]["permission"]>>[0]) {
  const result = connection.copilot.permission!(request);
  if (result instanceof Promise) {
    const conversation = conversations.current(request.sessionId), question = conversation.turns.flatMap(t => t.items).findLast(item => item.question?.status === "pending")!.question!;
    assert.ok(question, "out-of-scope access must ask instead of silently rejecting");
    conversations.answer(conversation.id, question.turnId, question.requestId, { decision: { answers: ["Reject"] } });
  }
  return result;
}
