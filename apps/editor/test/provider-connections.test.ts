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
import { RootAccess } from "../server/file-access.ts";

export const fakeServer = fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url));

test("Copilot ACP lists its models, streams one turn, applies permission scope, cancels and reports a failed turn", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "copilot-connection-")), log = path.join(root, "acp.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), undefined, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log] });
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const catalog = await connection.models("copilot");
  assert.deepEqual(catalog.models.map(model => model.model), ["auto", "copilot-model"]);
  assert.deepEqual(catalog.models[0]!.supportedReasoningEfforts.map(value => value.reasoningEffort), ["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
  assert.deepEqual(catalog.copilot?.modes.map(mode => mode.id), ["agent", "plan"]);
  assert.equal((await connection.diagnostics("copilot")).connected, true);
  assert.equal(readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(message => message.method === "initialize").length, 1);
  const settings = { provider: "codex" as const, permissionMode: "read-only" as const, model: "auto", reasoningEffort: "high" };
  const input = { provider: "copilot" as const, message: "Question", folders: [root], model: settings.model, reasoningEffort: "high", mode: "plan" };
  await assert.rejects(conversations.send({ ...input, skills: [{ name: "codex-only", path: path.join(root, "SKILL.md") }] }, settings), /only with Codex/);
  const conversation = await conversations.send(input, settings);
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
    await conversations.interrupt(conversation.id);
    // A protocol barrier ensures prompt completion is processed, without a timing assumption.
    await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: conversation.id, modelId: input.model }));
    assert.equal(turn.status, "interrupted");
    await conversations.send({ ...input, id: conversation.id, permissionMode: "opened-folders" }, settings);
    assert.deepEqual(connection.copilot.permission!(request), { outcome: { outcome: "selected", optionId: "once" } });
    assert.deepEqual(connection.copilot.permission!({ ...request, toolCall: { ...request.toolCall, locations: [{ path: path.join(root, "..", "outside.txt") }] } }), { outcome: { outcome: "cancelled" } });
    await conversations.interrupt(conversation.id);
    await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: conversation.id, modelId: input.model }));
    await conversations.send({ ...input, id: conversation.id, message: "FAIL THIS TURN" }, settings);
    await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: conversation.id, modelId: input.model }));
    assert.equal(conversation.turns.at(-1)!.status, "failed");
    assert.match(conversation.turns.at(-1)!.error!, /quota fixture/);
  });
  assert.equal(conversations.list()[0]!.provider, "copilot");
  assert.equal((await conversations.resume(conversation.id, { ...settings, provider: "codex" })).provider, "copilot");
  const rpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
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
  const fullRpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const launch = fullRpc.filter(message => message.args).at(-1);
  assert.ok(!launch.args.includes("--deny-tool=shell"));
  assert.ok(launch.args.includes("--disable-builtin-mcps"));
  assert.ok(fullRpc.some(message => message.method === "session/set_config_option" && message.params.configId === "allow_all" && message.params.value === "on"));
  await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: full.id, modelId: input.model }));
  const restricted = await conversations.send({ ...input, id: full.id, permissionMode: "read-only" }, settings);
  assert.deepEqual(connection.copilot.permission!({ ...execution, sessionId: restricted.id }), { outcome: { outcome: "cancelled" } });
  await conversations.interrupt(restricted.id);
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
      const configConversation = await configConversations.send({ ...input, reasoningEffort: "low" }, settings);
      assert.deepEqual(configConversation.copilot?.reasoningEfforts?.map(value => value.reasoningEffort), ["low", "max"]);
      assert.deepEqual((await configConnection.models("copilot")).models[0]!.supportedReasoningEfforts.map(value => value.reasoningEffort), ["low", "high"]);
      await configConversations.interrupt(configConversation.id);
      await configConnection.copilot.call(async () => (await configConnection.copilot.connect()).setSessionMode({ sessionId: configConversation.id, modeId: "plan" }));
      await configConversations.send({ ...input, id: configConversation.id, reasoningEffort: "max" }, settings);
      await configConversations.interrupt(configConversation.id);
      const configRpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
      assert.ok(configRpc.some(message => message.method === "session/set_config_option" && message.params.configId === "reasoning" && message.params.value === "max"));
    } finally { await configConnection.close(); }
  });
  assert.ok(rpc.find(message => message.method === "session/prompt").params.prompt[0].text.includes("Do not modify existing documents"));
  await connection.close();
  for (const { pid } of readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(message => message.pid)) assert.throws(() => process.kill(pid, 0), "every owned fake child must be stopped");
});

test("conversation streams summaries, steers and interrupts one Codex thread; only its index is stored by Litzio", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-conversation-")), cwd = path.join(root, "assistant"), log = path.join(root, "rpc.jsonl");
  const connection = new ProviderConnections(cwd, { bin: process.execPath, args: [fakeServer, log] });
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  const settings = { provider: "codex" as const, permissionMode: "opened-folders" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const input = { message: "What changed?", folders: [root], model: settings.model, reasoningEffort: "medium", references: [path.join(root, "notes.md"), path.join(root, "image.png"), path.join(root, "report.pdf"), path.join(root, "notes.md")],
    document: { path: path.join(root, "notes.md"), source: "UNSAVED DOCUMENT TEXT" } };
  writeFileSync(input.document.path, "ON DISK");
  writeFileSync(path.join(root, "image.png"), "image fixture");
  writeFileSync(path.join(root, "report.pdf"), "REFERENCE CONTENT MUST NOT BE IN INPUT");
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const streamed: string[] = [];
  connection.client.on("notification", (method, params) => {
    if (method === "item/reasoning/summaryTextDelta") streamed.push(conversations.current(params.threadId).turns[0]!.items.find(item => item.kind === "reasoning")!.text);
  });
  const conversation = await conversations.send(input, settings);
  assert.deepEqual(streamed, ["Checking the opened ", "Checking the opened document."]);
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
  const refs = [{ path: input.document.path, name: "notes.md", kind: "document" }, { path: path.join(root, "image.png"), name: "image.png", kind: "image" }, { path: path.join(root, "report.pdf"), name: "report.pdf", kind: "file" }];
  assert.deepEqual(JSON.parse(start.input[1].text.split("(JSON):\n")[1]).references, refs);
  assert.equal(JSON.stringify(start.input).includes("REFERENCE CONTENT MUST NOT BE IN INPUT"), false);
  assert.equal(start.input.length, 3);
  assert.deepEqual(start.input[2], { type: "localImage", path: path.join(root, "image.png") });
  assert.deepEqual(conversation.turns[0]!.items.filter(item => item.kind === "user").map(item => item.references), [refs, refs]);
  assert.deepEqual(rpc.find(item => item.method === "turn/steer").params.input.slice(1), start.input.slice(1));
  assert.deepEqual(start.sandboxPolicy, { type: "workspaceWrite", writableRoots: [root], networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true });
  assert.deepEqual(JSON.parse(start.input[1].text.slice(start.input[1].text.indexOf("{"))).document, { path: input.document.path });
  assert.equal(start.input[1].text.includes("ON DISK"), false, "document content is read on demand, not injected");
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
    assert.deepEqual(rpc.find(entry => entry.method === "thread/start").params.dynamicTools.map((tool: any) => tool.name), ["create_document", "read_document", "list_documents", "read_display_settings", "change_display_settings", "list_templates", "read_template", "save_template"]);
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
  await ask("interrupted"); await conversations.interrupt(c.id);
  assert.equal(c.userInput, undefined); assert.throws(() => answer("interrupted"), /expired/);
  await conversations.send({ ...input, id: c.id }, settings);
  await ask("disconnected"); await connection.close();
  assert.equal(c.userInput, undefined); assert.throws(() => answer("disconnected"), /expired/);
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
