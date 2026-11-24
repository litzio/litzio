import { PluginHost } from "../server/plugins/plugin-host.ts";
import childProcess, { spawnSync, type ChildProcess } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { assistantCliEnvironment, hostCli } from "../server/assistant-cli.ts";
import { brand } from "../../../brand.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, chmodSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexAppServer, LineDecoder } from "../server/codex-app-server.ts";
import { onlyStorePowerShell, ProviderConnections, ASSISTANT_INSTRUCTIONS, LITZIO_GUIDE } from "../server/provider-connections.ts";
import { AssistantConversations } from "../server/assistant-conversations.ts";
import { canonicalFilePath, RootAccess, fileErrorMessage } from "../server/file-access.ts";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { listenForFetch } from "../../../test/helpers/fetch-server.ts";
import { fakeProviderCli, settled, useReleaseSource } from "./helpers/provider-cli.ts";

export const fakeServer = fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url));

test("Copilot ACP rejects unsupported interactive questions instead of acknowledging them", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "copilot-question-")), log = path.join(root, "rpc.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), undefined, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log, "--fixture-question"] }, {}, () => "http://127.0.0.1:12345");
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  const settings = { provider: "copilot" as const, permissionMode: "read-only" as const, model: "copilot-model", reasoningEffort: "low" };
  const c = await conversations.send({ message: "Ask about travel", folders: [], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings);
  for (let attempt = 0; c.turns.at(-1)!.status === "inProgress" && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(c.turns.at(-1)!.status, "completed");
  assert.match(c.turns.at(-1)!.items.map(item => item.text).join(""), /Interactive question unsupported/);
  assert.equal(c.userInput, undefined);
  const requests = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.equal(requests[0].hostOrigin, "http://127.0.0.1:12345");
  assert.equal(requests.find(row => row.id === "question-unsupported").error.code, -32601);
  assert.match(requests.find(row => row.method === "session/prompt").params.prompt[0].text, /request_litzio_user_input through the Litzio Host MCP server/);
});

test("Copilot session creation errors retain a readable message across the Host error boundary", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "copilot-error-"));
  const connection = new ProviderConnections(path.join(root, "assistant"), undefined, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), "", "--fixture-session-error"] });
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  assert.equal((await connection.diagnostics("copilot")).error, "Copilot session fixture failure");
  await assert.rejects(connection.models("copilot"), error => {
    assert.ok(error instanceof Error, "Host boundaries require Error to preserve the message instead of [object Object]");
    assert.equal(error.message, "Copilot session fixture failure");
    assert.equal(fileErrorMessage(error, null), "Copilot session fixture failure");
    assert.equal(fileErrorMessage(error, new RootAccess([root])), "Copilot session fixture failure");
    assert.equal(String(error).includes("must-not-be-displayed"), false);
    return true;
  });
});

/** Waits for a provider event; a regression that never delivers it fails here instead of at the CI job limit. */
async function until(condition: () => unknown, what: string, timeoutMs = 10_000) {
  for (const deadline = Date.now() + timeoutMs; !condition();) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
const turnSettled = (conversation: { turns: { status: string }[] }) => until(() => conversation.turns.at(-1)!.status !== "inProgress", "the turn to finish");
/** A fake Ollama whose installed models the test changes; `stop` frees the port for an unreachable address. */
async function fakeOllama(models: string[]) {
  const server = createServer((req, res) => {
    if (req.url !== "/api/tags") { res.statusCode = 404; res.end(); return; }
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ models: models.map(name => ({ name })) }));
  });
  await listenForFetch(server);
  return { models, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, stop: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }) };
}
const acpRows = (log: string) => readFileSync(log, "utf8").split("\n").slice(0, -1).map(line => JSON.parse(line));
const acpLaunches = (log: string) => acpRows(log).filter(entry => entry.startedAt);
/** The fake Copilot names sessions after its process. */
const sessionPid = (id: string) => Number(id.split("-")[1]);

test("Ollama lists its own models, launches its process with the chosen model and reports why it is unavailable", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ollama-provider-")), log = path.join(root, "acp.jsonl");
  const ollama = await fakeOllama(["local-a:4b", "local-b:latest"]), stopped = await fakeOllama([]);
  await stopped.stop();
  // Model-source variables inherited from the daemon's parent reach neither process.
  const parent = () => ({ ...process.env, COPILOT_PROVIDER_BASE_URL: "http://parent.invalid/v1", COPILOT_PROVIDER_TYPE: "azure", COPILOT_MODEL: "parent-model" });
  const connection = new ProviderConnections(path.join(root, "assistant"), undefined, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log], env: parent });
  let address = ollama.url;
  connection.ollamaUrl = () => address;
  const conversations = new AssistantConversations(connection, new RootAccess([root]), {} as any);
  t.after(async () => { await connection.close(); await ollama.stop(); rmSync(root, { recursive: true, force: true }); });
  // Auto is GitHub's account routing and is not an Ollama model.
  const local = await connection.models("ollama", "fresh");
  assert.equal(local.provider, "ollama");
  assert.deepEqual(local.models.map(model => model.model), ["local-a:4b", "local-b:latest"]);
  // An Ollama session has no reasoning option; the launch argument takes every CLI value, including none.
  assert.deepEqual(local.copilot?.reasoningEfforts?.map(value => value.reasoningEffort), ["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
  const ready = await connection.diagnostics("ollama");
  assert.deepEqual([ready.connected, ready.ollama], [true, { url: ollama.url, models: 2 }]);
  const settings = { provider: "ollama" as const, permissionMode: "read-only" as const, model: "local-b:latest", reasoningEffort: "medium", ollamaUrl: ollama.url };
  const input = { provider: "ollama" as const, message: "COMPLETE THIS TURN", folders: [root], model: "local-b:latest", reasoningEffort: "medium" };
  const conversation = await conversations.send(input, settings);
  await turnSettled(conversation);
  assert.equal(conversation.turns.at(-1)!.status, "completed");
  assert.equal(conversation.provider, "ollama");
  assert.deepEqual(acpLaunches(log).at(-1).byok, { baseUrl: `${ollama.url}/v1`, apiKey: "", wireApi: "responses", model: "local-b:latest", offline: null });
  // One Ollama process serves one model; another model relaunches it between turns.
  await turnSettled(await conversations.send({ ...input, id: conversation.id, model: "local-a:4b" }, settings));
  assert.equal(acpLaunches(log).at(-1).byok.model, "local-a:4b");
  assert.equal(conversation.turns.at(-1)!.status, "completed");
  // Reasoning effort is a launch argument too: the chosen value relaunches the process between turns.
  const effort = (launch: { args: string[] }) => launch.args[launch.args.indexOf("--reasoning-effort") + 1];
  assert.equal(effort(acpLaunches(log).at(-1)), "medium");
  await turnSettled(await conversations.send({ ...input, id: conversation.id, model: "local-a:4b", reasoningEffort: "none" }, settings));
  assert.equal(effort(acpLaunches(log).at(-1)), "none");
  assert.equal(conversation.reasoningEffort, "none");
  // The GitHub account keeps its own catalog and process, without any model-source variable.
  const account = await connection.models("copilot", "fresh");
  assert.deepEqual(account.models.map(model => model.model), ["auto", "copilot-model"]);
  assert.equal(account.copilot?.reasoningEffortSource, "cli");
  await turnSettled(await conversations.send({ ...input, provider: "copilot", model: "copilot-model" }, { ...settings, provider: "copilot", model: "copilot-model" }));
  assert.equal(acpLaunches(log).at(-1).byok, null);
  assert.equal(acpLaunches(log).filter(launch => launch.byok?.baseUrl === "http://parent.invalid/v1").length, 0);
  // The three reasons Ollama cannot be used.
  address = stopped.url;
  const unreachable = await connection.diagnostics("ollama");
  assert.deepEqual([unreachable.connected, unreachable.ollama], [false, { url: stopped.url, models: null, unavailable: "unreachable" }]);
  assert.ok(unreachable.version, "the Copilot CLI version does not depend on Ollama being reachable");
  await assert.rejects(connection.models("ollama"), /Ollama is unavailable/);
  address = ollama.url; ollama.models.splice(0);
  assert.deepEqual((await connection.diagnostics("ollama")).ollama, { url: ollama.url, models: 0, unavailable: "no-models" });
  ollama.models.push("local-a:4b");
  t.mock.getter(connection.ollama, "executable", () => null);
  const missing = await connection.diagnostics("ollama");
  assert.deepEqual([missing.connected, missing.ollama, missing.path], [false, { url: ollama.url, models: 1, unavailable: "cli-missing" }, null]);
  address = stopped.url;
  const bothUnavailable = await connection.diagnostics("ollama");
  assert.deepEqual([bothUnavailable.connected, bothUnavailable.ollama, bothUnavailable.path], [false, { url: stopped.url, models: null, unavailable: "unreachable" }, null]);
});

test("Copilot account and Ollama run as separate processes that never take over each other's turns, approvals, tools or resumes", async t => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const root = mkdtempSync(path.join(tmpdir(), "acp-pair-")), log = path.join(root, "acp.jsonl"), cwd = path.join(root, "assistant");
  const ollama = await fakeOllama(["local-a:4b", "local-b:latest"]);
  const options = { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log] };
  const host = () => {
    const connection = new ProviderConnections(cwd, undefined, options);
    connection.ollamaUrl = () => ollama.url;
    return { connection, conversations: new AssistantConversations(connection, new RootAccess([root]), {} as any) };
  };
  let { connection, conversations } = host();
  const server = createServer((req, res) => { void conversations.mcp.handle(req, res); });
  await listenForFetch(server);
  conversations.mcp.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const clients: InstanceType<typeof Client>[] = [];
  t.after(async () => { await Promise.all(clients.map(client => client.close())); await conversations.close(); await connection.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await ollama.stop(); rmSync(root, { recursive: true, force: true }); });
  const accountSettings = { provider: "copilot" as const, permissionMode: "read-only" as const, model: "auto", reasoningEffort: "medium" };
  const ollamaSettings = { provider: "ollama" as const, permissionMode: "read-only" as const, model: "local-b:latest", reasoningEffort: "medium", ollamaUrl: ollama.url };
  // Both turns ask to write outside the read-only scope, so each waits on an approval card at the same time.
  const account = await conversations.send({ message: "Wait for approval", folders: [root], model: "auto", reasoningEffort: "medium" }, accountSettings);
  const local = await conversations.send({ message: "Wait for approval", folders: [root], model: "local-b:latest", reasoningEffort: "medium" }, ollamaSettings);
  await until(() => account.userInput && local.userInput, "both approval cards");
  assert.notEqual(sessionPid(account.id), sessionPid(local.id), "two processes");
  const launch = (pid: number) => acpLaunches(log).find(entry => entry.pid === pid);
  assert.deepEqual([launch(sessionPid(account.id)).byok, launch(sessionPid(local.id)).byok?.model], [null, "local-b:latest"]);
  // A permission request is active only for a turn of the connection that sent it.
  writeFileSync(path.join(root, "a.md"), "A\n");
  const foreign = { sessionId: account.id, toolCall: { toolCallId: "read", kind: "read" as const, title: "Read", locations: [{ path: path.join(root, "a.md") }] }, options: [{ optionId: "once", kind: "allow_once" as const, name: "Once" }] };
  assert.deepEqual(await connection.ollama.permission!(foreign), { outcome: { outcome: "cancelled" } });
  assert.equal((await connection.copilot.permission!(foreign) as any).outcome.outcome, "selected");
  // Each turn's Host tool endpoint answers for its own conversation.
  const endpoint = async (id: string) => { const client = new Client({ name: "fixture", version: "1" }); clients.push(client); await client.connect(new StreamableHTTPClientTransport(new URL(conversations.mcp.lease(id).servers[0]!.url))); return client; };
  const accountTools = await endpoint(account.id), localTools = await endpoint(local.id);
  assert.equal((await accountTools.callTool({ name: "list_documents", arguments: { path: root } })).isError, false);
  assert.equal((await localTools.callTool({ name: "list_documents", arguments: { path: root } })).isError, false);
  // The account process exits: only its turn, card and tool endpoint end.
  const accountCard = account.userInput!;
  const exited = new Promise(resolve => connection.copilot.once("disconnected", resolve));
  await assert.rejects(connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: account.id, modelId: "EXIT PROCESS" })));
  await exited;
  assert.equal(account.turns.at(-1)!.status, "failed");
  assert.throws(() => conversations.answer(account.id, accountCard.turnId, accountCard.requestId, { decision: { answers: ["Reject"] } }), /expired/);
  assert.throws(() => conversations.mcp.lease(account.id), /Missing Copilot MCP/);
  assert.equal(local.turns.at(-1)!.status, "inProgress");
  assert.equal((await localTools.callTool({ name: "list_documents", arguments: { path: root } })).isError, false, "the Ollama turn keeps its tool scope");
  // The surviving card answers its own process: the permission result reaches the Ollama conversation.
  conversations.answer(local.id, local.userInput!.turnId, local.userInput!.requestId, { decision: { answers: ["1. Allow once"] } });
  await until(() => local.turns.at(-1)!.items.some(item => item.text.includes("Permission result")), "the Ollama permission result");
  assert.equal(account.turns.flatMap(turn => turn.items).some(item => item.text.includes("Permission result")), false);
  await conversations.interrupt(local.id);
  await turnSettled(local);

  // After a Host restart each conversation reopens on its stored provider's connection, Ollama with its recorded model.
  await conversations.close(); await connection.close();
  ({ connection, conversations } = host());
  ollama.models.splice(1);
  const otherModel = () => acpLaunches(log).filter(launch => launch.byok?.model === "local-a:4b").length, before = otherModel();
  await assert.rejects(conversations.resume(local.id, { ...ollamaSettings, model: "local-a:4b" }), /This conversation's model local-b:latest is not in Ollama\./);
  assert.equal(otherModel(), before, "never reopened with another model");
  ollama.models.push("local-b:latest");
  const reopened = await conversations.resume(local.id, { ...ollamaSettings, model: "local-a:4b" });
  assert.equal(reopened.model, "local-b:latest");
  const reopenedAccount = await conversations.resume(account.id, accountSettings);
  assert.equal(reopenedAccount.provider, "copilot");
  const loads = acpRows(log).filter(row => row.method === "session/load").slice(-2).map(row => row.params.sessionId);
  assert.deepEqual(loads, [local.id, account.id]);
  assert.deepEqual(acpLaunches(log).slice(-2).map(launch => launch.byok?.model ?? null), ["local-b:latest", null]);
});

test("a Copilot CLI update runs once and each connection that uses it relaunches when it alone is idle", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "acp-pair-update-")), log = path.join(root, "acp.jsonl");
  const ollama = await fakeOllama(["local-a:4b"]);
  const cli = fakeProviderCli(root, { version: "1.0.114", update: "ok", next: "1.0.115" });
  const connection = new ProviderConnections(path.join(root, "assistant"), undefined, { bin: cli.bin, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log] });
  connection.ollamaUrl = () => ollama.url;
  const conversations = new AssistantConversations(connection, new RootAccess([root]), {} as any);
  t.after(async () => { await conversations.close(); await connection.close(); await ollama.stop(); rmSync(root, { recursive: true, force: true }); });
  useReleaseSource(connection, { latest: async () => "1.0.115" });
  const accountSettings = { provider: "copilot" as const, permissionMode: "read-only" as const, model: "auto", reasoningEffort: "medium" };
  const ollamaSettings = { provider: "ollama" as const, permissionMode: "read-only" as const, model: "local-a:4b", reasoningEffort: "medium", ollamaUrl: ollama.url };
  const account = await conversations.send({ message: "COMPLETE THIS TURN", folders: [root], model: "auto", reasoningEffort: "medium" }, accountSettings);
  await turnSettled(account);
  const local = await conversations.send({ message: "Wait for approval", folders: [root], model: "local-a:4b", reasoningEffort: "medium" }, ollamaSettings);
  await until(() => local.userInput, "the Ollama approval card");
  // Launches by connection; the Ollama count also holds the catalog probe of its first send.
  const launched = (local: boolean) => acpLaunches(log).filter(launch => !!launch.byok === local).length;
  const [accountLaunches, ollamaLaunches] = [launched(false), launched(true)];
  connection.updateCli("copilot", () => {});
  assert.throws(() => connection.updateCli("copilot", () => {}), /already running/, "one run for the executable both connections use");
  const update = await settled(connection, "copilot");
  assert.deepEqual([update.status, update.deferred, cli.read().updates], ["succeeded", true, 1]);
  assert.equal(local.turns.at(-1)!.status, "inProgress", "the Ollama turn keeps its process");
  // The idle account connection relaunched at once; the busy Ollama connection waits for its own turn.
  await turnSettled(await conversations.send({ id: account.id, message: "COMPLETE THIS TURN", folders: [root], model: "auto", reasoningEffort: "medium" }, accountSettings));
  assert.deepEqual([launched(false), launched(true)], [accountLaunches + 1, ollamaLaunches]);
  await conversations.interrupt(local.id);
  await turnSettled(local);
  await turnSettled(await conversations.send({ id: local.id, message: "COMPLETE THIS TURN", folders: [root], model: "local-a:4b", reasoningEffort: "medium" }, ollamaSettings));
  assert.deepEqual([launched(false), launched(true)], [accountLaunches + 1, ollamaLaunches + 1]);
  assert.equal(await connection.relaunchUpdated("ollama"), false, "one relaunch per update");
});

test("Copilot ACP lists its models, streams one turn, applies permission scope, cancels and reports a failed turn", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "copilot-connection-")), log = path.join(root, "acp.jsonl");
  // Keep the exact owned processes: Windows may reuse a historical PID before
  // this test's final assertion. Include diagnostic and replacement connections.
  const children: ChildProcess[] = [];
  const spawn = childProcess.spawn;
  const spawned = t.mock.method(childProcess, "spawn", (...args: Parameters<typeof spawn>) => {
    const child = spawn(...args);
    if (args[1]?.includes(log)) children.push(child);
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => { spawned.mock.restore(); syncBuiltinESMExports(); });
  const connection = new ProviderConnections(path.join(root, "assistant"), undefined, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log] });
  const conversations = new AssistantConversations(connection, new RootAccess([root]), {} as any);
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const catalog = await connection.models("copilot");
  assert.deepEqual(catalog.models.map(model => model.model), ["auto", "copilot-model"]);
  assert.deepEqual(catalog.models[0]!.supportedReasoningEfforts.map(value => value.reasoningEffort), ["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
  assert.deepEqual(catalog.copilot?.modes.map(mode => mode.id), ["agent", "plan"]);
  assert.equal((await connection.diagnostics("copilot")).connected, true);
  assert.equal(readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(message => message.method === "initialize").length, 2);
  const settings = { provider: "codex" as const, permissionMode: "read-only" as const, model: "auto", reasoningEffort: "high" };
  const input = { submissionId: "copilot-submission", provider: "copilot" as const, message: `Question\nPermission fixture path: ${JSON.stringify(path.join(root, "new.txt"))}`, folders: [root], model: settings.model, reasoningEffort: "high", mode: "plan" };
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
    assert.ok(turn.items.some(item => item.kind === "reasoning" && item.text === "Checking ACP context."));
    assert.deepEqual(turn.items.find(item => item.id === "shell-step")?.work, { kind: "execute", detail: "fixture failure", truncated: false });
    assert.equal(turn.items.find(item => item.id === "shell-step")?.status, "failed");
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
    assert.equal(conversations.submission(failedInput.submissionId).submission.status, "accepted");
    await connection.copilot.useLaunchSettings("low", false);
    const resumedFailure = await conversations.resume(conversation.id, settings);
    assert.equal(resumedFailure.turns.flatMap(turn => turn.items).some(item => item.submissionId === failedInput.submissionId), false);
    assert.equal(conversations.submission(failedInput.submissionId).submission.status, "accepted", "turn failure and missing history must not revoke admission");
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
    const lowChild = children.at(-1)!;
    const resumed = await conversations.resume(restricted.id, settings);
    assert.equal(resumed.reasoningEffort, "high");
    assert.equal(connection.copilot.reasoningEffort, "high");
    assert.ok(lowChild.exitCode !== null || lowChild.signalCode !== null, "replaced low-effort child must have exited");
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
  assert.ok(rpc.find(message => message.method === "session/prompt").params.prompt[0].text.includes("기존 문서는 표·목록·그림·캡션·수식도 공급자 패치로 본문을 고치고"));
  await connection.close();
  const launches = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(message => message.pid);
  assert.ok(children.length > 0);
  assert.deepEqual(children.map(child => child.pid).sort(), launches.map(message => message.pid).sort(), "observe every owned fake child");
  for (const child of children) {
    assert.ok(child.exitCode !== null || child.signalCode !== null, "every owned fake child must be stopped");
  }
});

test("conversation streams summaries, steers and interrupts one Codex thread; only its index is stored by Litzio", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-conversation-")), cwd = path.join(root, "assistant"), log = path.join(root, "rpc.jsonl");
  const connection = new ProviderConnections(cwd, { bin: process.execPath, args: [fakeServer, log] });
  const plugins = new PluginHost(path.join(root, "plugins.json"), { authoringDirectory: path.join(root, "data", "plugins") });
  t.after(() => plugins.close());
  const conversations = new AssistantConversations(connection, new RootAccess([root]), plugins);
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
  assert.equal(JSON.stringify(conversation).includes("Litzio plugin authoring skill"), false);
  assert.deepEqual(streamed, ["Checking the opened ", "Checking the opened document."]);
  assert.equal(conversation.turns[0]!.items.find(item => item.kind === "user")!.userMessageSource, "provider-live");
  assert.deepEqual(conversation.turns[0]!.items.filter(item => item.kind === "reasoning").map(item => item.text), ["Checking the opened document.\nChecking folders.", ""]);
  assert.equal(conversation.turns[0]!.status, "inProgress");
  assert.equal(conversation.turns[0]!.items.find(item => item.kind === "assistant")!.text, "Partial answer");
  assert.deepEqual(conversation.tokenUsage, { used: 810, limit: 1000 });
  assert.equal(JSON.stringify(conversation).includes("PRIVATE RAW REASONING"), false);
  const shell = conversation.turns[0]!.items.find(item => item.work?.kind === "execute")!;
  assert.equal(shell.text, "Get-Content notes.md");
  assert.deepEqual(shell.work, { kind: "execute", detail: "fixture", truncated: false });
  connection.client.emit("notification", "item/commandExecution/outputDelta", { threadId: conversation.id, turnId: conversation.turns[0]!.id, itemId: shell.id, delta: "x".repeat(16_001) });
  assert.equal(shell.work!.detail!.length, 16_000);
  assert.equal(shell.work!.truncated, true);
  connection.client.emit("notification", "item/completed", { threadId: conversation.id, turnId: conversation.turns[0]!.id, item: { id: "failed-command", type: "commandExecution", command: "exit 1", status: "completed", exitCode: 1, aggregatedOutput: "failed" } });
  assert.equal(conversation.turns[0]!.items.find(item => item.id === "failed-command")?.status, "failed");

  connection.client.emit("notification", "item/commandExecution/outputDelta", { threadId: conversation.id, turnId: conversation.turns[0]!.id, itemId: shell.id, delta: "ignored" });
  assert.equal(shell.work!.detail!.length, 16_000);

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
  const context=JSON.parse(start.input[1].text.split("(JSON):\n")[1]);
  assert.deepEqual(context.document,{path:input.document.path});
  assert.equal("screen" in context,false);assert.equal("folders" in context,false);
  assert.equal(JSON.stringify(start.input).includes("UNSAVED DOCUMENT TEXT"),false);
  assert.equal(JSON.parse(start.input[1].text.split("(JSON):\n")[1]).permissionMode, "opened-folders");
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
    for (const permissionMode of ["opened-folders", "read-only"] as const) {
      await assert.rejects(resumed.send({ ...input, permissionMode, folders: [cwd], references: [input.document.path] }, settings), /outside/);
      await assert.rejects(resumed.send({ ...input, permissionMode, references: [path.join(root, ".hidden")] }, settings), /unavailable/);
    }
    const full = { ...input, permissionMode: "full-access" as const, folders: [], references: [input.document.path, path.join(root, ".hidden"), input.document.path] };
    const attached = await resumed.send(full, settings);
    assert.deepEqual(attached.turns[0]!.items.find(item => item.kind === "user")!.references!.map(file => file.path), [input.document.path, path.join(root, ".hidden")]);
    await resumed.interrupt(attached.id);
    await assert.rejects(resumed.send({ ...full, references: [root] }, settings), /unavailable/);
    await assert.rejects(resumed.send({ ...full, references: [path.join(linked, "file.txt")] }, settings), /unavailable/);
    await assert.rejects(resumed.send({ ...full, references: [fakeServer] }, settings), /outside/);
    const restricted = await resumed.send({ ...input, references: [] }, settings);
    await assert.rejects(resumed.send({ ...full, id: restricted.id }, settings), /outside/);
    await resumed.interrupt(restricted.id);
    const many = Array.from({ length: 11 }, (_, i) => path.join(root, `file-${i}.txt`));
    for (const file of many) writeFileSync(file, "reference");
    const eleven = await resumed.send({ ...input, references: many }, settings);
    assert.equal(eleven.turns[0]!.items.find(item => item.kind === "user")!.references!.length, 11);
    await resumed.interrupt(eleven.id);
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
  assert.equal(ASSISTANT_INSTRUCTIONS, readFileSync(new URL("../server/assistant/AGENTS.md", import.meta.url), "utf8"));
  assert.equal(LITZIO_GUIDE, readFileSync(new URL("../server/assistant/litzio-guide/SKILL.md", import.meta.url), "utf8"));
  assert.equal(readFileSync(guide, "utf8"), LITZIO_GUIDE);
  writeFileSync(guide, "stale"); connection.environment();
  assert.equal(readFileSync(guide, "utf8"), LITZIO_GUIDE);
  assert.equal(readFileSync(env.instructions, "utf8"), ASSISTANT_INSTRUCTIONS);
  // Generated guidance owns routing and safety; CLI tests own actual writes.
  const instructions = readFileSync(env.instructions, "utf8"), generatedGuide = readFileSync(guide, "utf8");
  assert.doesNotMatch(generatedGuide, /docling|convert-pdf/i, "usage guide must not advertise removed conversion features");
  assert.doesNotMatch(instructions, /convert-pdf/i, "review guidance must not advertise removed conversion commands");
  assert.match(instructions, /앱·그림 안내.*litzio-guide.*SKILL\.md.*UTF-8/);
  assert.match(generatedGuide, /list_templates.*현재 이름/);
  assert.match(generatedGuide, /templates list --json --language <ko\|en>/);
  assert.match(generatedGuide, /templates read <id> --json --language <ko\|en>/);
  assert.match(generatedGuide, /선택·적용에 별도 동의를 묻지 않는다/);
  assert.match(generatedGuide, /없거나 잘못됐으면 다른 템플릿으로 몰래 대체하지/);
  assert.match(generatedGuide, /create <new-file> --template <id> --language <ko\|en>/);
  assert.match(generatedGuide, /templates save <name> --from <file> --description <text>/);
  assert.match(generatedGuide, /save_template.*name,from,description/);
  assert.match(generatedGuide, /미저장 편집 내용은 전달되지 않는다.*먼저 저장/);
  assert.match(generatedGuide, /CLI 생성에는 리치오 결과 카드·카드 Undo가 없/);
  assert.match(instructions, /uncertain.*쓰기를 재실행하지 않는다.*기존 requestId.*먼저 조회/);
  assert.match(instructions, /상태 미발견은 쓰기가 없었다는 증거가 아니다/);
  assert.match(instructions, /accepted:true.*저장.*렌더 확인·답변 수신을 뜻하지 않는다/);
  assert.match(instructions, /표·목록·그림·캡션·수식.*공급자 패치로 본문을 고치고.*litzio check/);
  assert.match(instructions, /AGENTS.md.*먼저 읽는다/);
  for (const text of [instructions, generatedGuide]) {
    assert.match(text, /permissionMode.*opened-folders.*read-only.*check·inspect·compare·도움말만 실행된다/);
    assert.match(text, /쓰기\(insert-\*·apply-batch 등\).*시도.*승인.*요청하지/);
    assert.match(text, /읽기 전용의 편집 제한은 유지/);
    assert.match(text, /공급자 패치.*없으면 UTF-8 파일 편집 셸/);
    assert.match(text, /full-access.*쓰기 CLI도 쓸 수 있다/);
    assert.doesNotMatch(text, /실행 승인이 필요할 수 있다/);
  }
  const parentPath = process.env.PATH;
  const [models, diagnostics] = await Promise.all([connection.models(), connection.diagnostics()]);
  assert.deepEqual(models.models.map(model => model.model), ["gpt-6.1-sol", "chosen-model", "next-model"]);
  assert.equal(process.env.PATH, parentPath, "Host process PATH must not change");
  const cli = await connection.client.request("fixture/cli", { command: brand.cliCommand, args: ["templates", "read", "builtin:technical-document", "--json", "--language", "ko"] });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).id, "builtin:technical-document");
  assert.match(JSON.parse(cli.stdout).source, /기술 문서/);
  const missingOrigin = await connection.client.request("fixture/cli", { command: brand.cliCommand, args: ["plugins", "list", "--json"], hostFromEnvironment: true });
  assert.equal(missingOrigin.hostOrigin, null);
  assert.equal(missingOrigin.status, 1);
  assert.match(missingOrigin.stdout, /explicit --host/);
  const documentFile = path.join(root, "example.md"), operationsFile = path.join(root, "operations.json");
  writeFileSync(documentFile, "---\nlitzio: 1\n---\n\nBefore\n");
  writeFileSync(operationsFile, /```json\n([^`]+)```/.exec(LITZIO_GUIDE)![1]);
  const runCli = (args: string[]) => connection.client.request("fixture/cli", { command: brand.cliCommand, args });
  const inspected = await runCli(["inspect", documentFile, "--format", "json"]);
  assert.equal(inspected.status, 0, inspected.stderr);
  const revision = JSON.parse(inspected.stdout).revision;
  const editArgs = ["apply-batch", documentFile, "--operations", operationsFile, "--if-revision", revision, "--format", "json"];
  const edited = await runCli(editArgs);
  assert.equal(edited.status, 0, edited.stderr);
  const receipt = JSON.parse(edited.stdout);
  assert.equal(receipt.ok, true); assert.equal(receipt.applied, 1);
  const reinspection = await runCli(["inspect", documentFile, "--format", "json"]);
  assert.equal(JSON.parse(reinspection.stdout).revision, receipt.revision);
  assert.match(readFileSync(documentFile, "utf8"), /After/);
  const after = readFileSync(documentFile, "utf8");
  const stale = await runCli(editArgs);
  assert.equal(stale.status, 1); assert.match(stale.stderr, /revision mismatch/);
  assert.equal(readFileSync(documentFile, "utf8"), after);
  const ownBin = cli.path.split(path.delimiter)[0];
  assert.equal(path.dirname(ownBin), path.join(cwd, "bin"));
  const launcher = readFileSync(path.join(ownBin, "cli.cjs"), "utf8");
  const other = assistantCliEnvironment(cwd, { bin: process.execPath, args: ["--version"] });
  assert.notEqual((other.PATH ?? other.Path)!.split(path.delimiter)[0], ownBin);
  assert.equal(readFileSync(path.join(ownBin, "cli.cjs"), "utf8"), launcher, "Another Host sharing cwd must not replace this CLI");
  assert.equal(process.env.PATH, parentPath);
  const fallback = assistantCliEnvironment(cwd, hostCli());
  const unowned = assistantCliEnvironment(cwd, hostCli(), { ...process.env, litzio_host_origin: "http://parent.invalid" });
  assert.equal(unowned.LITZIO_HOST_ORIGIN, undefined, "a listener-less provider cannot inherit another Host target");
  assert.equal(unowned.litzio_host_origin, undefined);
  const inheritedTarget = spawnSync(process.execPath, ["-e", "process.stdout.write(process.env.LITZIO_HOST_ORIGIN ?? 'absent')"], { env: unowned, encoding: "utf8", windowsHide: true });
  assert.equal(inheritedTarget.status, 0); assert.equal(inheritedTarget.stdout, "absent");
  const pathKey = Object.keys(fallback).find(key => key.toUpperCase() === "PATH")!;
  fallback[pathKey] = (fallback[pathKey] ?? "").split(path.delimiter).slice(1).join(path.delimiter);
  assert.ok(path.isAbsolute(fallback.LITZIO_ASSISTANT_CLI!));
  const command = process.platform === "win32" ? '"%LITZIO_ASSISTANT_CLI%" --help' : '"$LITZIO_ASSISTANT_CLI" --help';
  const direct = spawnSync(command, { env: fallback, encoding: "utf8", shell: true });
  assert.equal(direct.status, 0, direct.stderr);
  assert.match(direct.stdout, /Usage:/i);
  if (process.platform === "linux") {
    // Model a login profile overwriting PATH, while retaining the inherited fallback.
    const login = spawnSync("bash", ["-lc", 'PATH=/usr/bin:/bin; command -v litzio && exit 1; "$LITZIO_ASSISTANT_CLI" --help'], { env: fallback, encoding: "utf8" });
    assert.equal(login.status, 0, login.stderr);
    assert.match(login.stdout, /Usage:/i);
  }
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
    try {
      await client.connect();
      const disconnected = method === "exit" ? new Promise(resolve => client.once("disconnected", resolve)) : undefined;
      await assert.rejects(client.request(method), method === "malformed" ? /Invalid/ : method === "exit" ? /exited/ : /timed out: hang/);
      if (disconnected) await disconnected;
      if (method !== "malformed") assert.ok((await client.request("model/list")).data.length);
    }
    finally { await client.close(); }
  }
  const client = new CodexAppServer(root, { bin: path.join(root, "absent-codex"), args: [fakeServer] });
  try {
    await assert.rejects(client.connect(), /could not be executed/);
    const restored = t.mock.getter(client, "executable", () => process.execPath);
    await client.connect();
    assert.ok((await client.request("model/list")).data.length);
    restored.mock.restore();
  } finally { await client.close(); }
});

test("Codex unconfirmed termination after a failed initialization does not block the next connection", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "codex-retire-")), log = path.join(root, "rpc.jsonl");
  const orphan = (): number => readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).find(row => row.orphanPid).orphanPid;
  const client = new CodexAppServer(root, { bin: process.execPath, args: [fakeServer, log, "orphan-hang-initialize-once"], timeoutMs: 2000 });
  t.after(async () => {
    try { process.kill(orphan()); } catch { /* Absent or already stopped by the scenario. */ }
    await client.close(); rmSync(root, { recursive: true, force: true });
  });
  // Initialization times out and the stopped process keeps its stdout open,
  // so its termination check fails after the stop deadline.
  await assert.rejects(client.connect(), /Could not confirm agent termination/);
  process.kill(orphan());
  await client.connect();
  assert.ok((await client.request("model/list")).data.length);
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

test("provider CLI update runs the executable's own update once at a time, reports its result and relaunches only an idle connection", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "provider-cli-update-")), log = path.join(root, "rpc.jsonl");
  const cli = fakeProviderCli(root, { version: "0.150.0", update: "hang", next: "0.151.0" });
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: cli.bin, args: [fakeServer, log] });
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  let releases = 0, release: () => Promise<string> = async () => "0.151.0";
  useReleaseSource(connection, { latest: () => { releases++; return release(); }, timeoutMs: 1500 });
  const pids = () => readFileSync(log, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line).pid).filter(Boolean);

  // Status: newer release, cached; a failed check is unknown, never current; no update command means no check.
  const available = await connection.updates.version("codex", "codex-cli 0.150.0");
  assert.deepEqual([available.versionStatus, available.latestVersion, available.updateUnavailable], ["available", "0.151.0", undefined]);
  assert.equal((await connection.updates.version("codex", "codex-cli 0.151.0")).versionStatus, "current");
  assert.equal((await connection.updates.version("codex", "codex-cli 0.152.0")).versionStatus, "current", "a build newer than the release is not an update");
  assert.equal((await connection.updates.version("codex", "codex-cli 0.151.0-rc.1")).versionStatus, "unknown", "a pre-release is not compared");
  assert.equal(releases, 1, "the release read is reused while the screen reopens");
  release = () => Promise.reject(new Error("offline"));
  useReleaseSource(connection, { latest: () => { releases++; return release(); }, timeoutMs: 1500 });
  assert.deepEqual(await connection.updates.version("codex", "codex-cli 0.150.0"), { versionStatus: "unknown" });
  cli.write({ help: false });
  assert.deepEqual(await connection.updates.version("codex", "codex-cli 0.150.0"), { versionStatus: "unknown", updateUnavailable: "unsupported" });
  assert.equal(releases, 2);
  cli.write({ help: true });

  // A stalled update ends at the time limit; a second start for the same provider is refused meanwhile.
  await connection.client.connect();
  connection.updateCli("codex", () => {});
  assert.throws(() => connection.updateCli("codex", () => {}), /already running/);
  const stalled = await settled(connection, "codex");
  assert.equal(stalled.status, "failed"); assert.equal(stalled.timedOut, true);
  assert.equal(cli.read().updates, 1);

  cli.write({ update: "fail" });
  const failed = (connection.updateCli("codex", () => {}), await settled(connection, "codex"));
  assert.deepEqual([failed.status, failed.exitCode], ["failed", 3]);
  assert.match(failed.output, /Checking for updates[\s\S]*error: release download failed/, "stdout and stderr are shown without color codes");
  assert.equal(pids().length, 1, "a failed update keeps the running connection");

  // A turn in progress keeps the earlier process; the next idle moment launches the updated executable.
  cli.write({ update: "ok" });
  let busy = true, reread = 0;
  connection.providerBusy = () => busy;
  const deferred = (connection.updateCli("codex", () => { reread++; }), await settled(connection, "codex"));
  assert.deepEqual([deferred.status, deferred.exitCode, deferred.deferred, reread], ["succeeded", 0, true, 1]);
  assert.match(deferred.output, /Updated to 0\.151\.0/);
  await connection.client.request("model/list", { cursor: null });
  assert.equal(pids().length, 1, "a running turn is never interrupted");
  assert.equal(await connection.relaunchUpdated("codex"), false);
  busy = false;
  assert.equal(await connection.relaunchUpdated("codex"), true);
  await connection.client.request("model/list", { cursor: null });
  assert.equal(pids().length, 2);
  assert.equal(await connection.relaunchUpdated("codex"), false, "one relaunch per update");
  const idle = (connection.updateCli("codex", () => {}), await settled(connection, "codex"));
  assert.equal(idle.deferred, undefined);
  await connection.client.request("model/list", { cursor: null });
  assert.equal(pids().length, 3, "an idle connection closes right after the update");

  // Host shutdown ends a running update and its process tree.
  cli.write({ update: "hang" });
  connection.updateCli("codex", () => {});
  while (!cli.read().pid || cli.read().updates !== 5) await new Promise(resolve => setTimeout(resolve, 50));
  await connection.close();
  assert.throws(() => process.kill(cli.read().pid!, 0), /ESRCH/, "the update process is gone once the Host has closed");
  assert.equal((await settled(connection, "codex")).status, "failed");
});

test("a send already on its way to the provider defers the relaunch after an update", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "provider-cli-pending-")), log = path.join(root, "rpc.jsonl");
  const cli = fakeProviderCli(root, { version: "0.150.0", update: "slow", next: "0.151.0" });
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: cli.bin, args: [fakeServer, log, "delay-turn-start"] });
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  t.after(async () => { await conversations.close(); await connection.close(); rmSync(root, { recursive: true, force: true }); });
  useReleaseSource(connection, { latest: async () => "0.151.0" });
  await connection.client.connect();
  const settings = { provider: "codex", model: "gpt-6.1-sol", reasoningEffort: "medium", permissionMode: "full-access" } as const;
  // The provider announces the turn 3 s after turn/start; the update finishes in between.
  connection.updateCli("codex", () => {});
  const sent = conversations.send({ message: "Draft", folders: [], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings);
  const update = await settled(connection, "codex");
  assert.deepEqual([update.status, update.deferred], ["succeeded", true]);
  assert.equal((await sent).turns.at(-1)!.status, "inProgress", "the send is not cut off by the relaunch");
});

test("a Copilot send already on its way defers the relaunch after an update", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "copilot-cli-pending-")), log = path.join(root, "acp.jsonl");
  const cli = fakeProviderCli(root, { version: "1.0.114", update: "ok", next: "1.0.115" });
  const connection = new ProviderConnections(path.join(root, "assistant"), undefined, { bin: cli.bin, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log, "--fixture-hold-new-session"] });
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  t.after(async () => { await conversations.close(); await connection.close(); rmSync(root, { recursive: true, force: true }); });
  useReleaseSource(connection, { latest: async () => "1.0.115" });
  connection.environment();
  await connection.copilot.catalog();
  const rows = () => readFileSync(log, "utf8").split("\n").slice(0, -1).map(line => JSON.parse(line));
  const settings = { provider: "copilot", model: "auto", reasoningEffort: "medium", permissionMode: "read-only" } as const;
  // The new session is held at the provider while the update finishes.
  const sent = conversations.send({ message: "Wait for cancellation", folders: [], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings);
  await until(() => rows().filter(row => row.method === "session/new").length >= 2, "the held session/new request");
  connection.updateCli("copilot", () => {});
  const update = await settled(connection, "copilot");
  assert.deepEqual([update.status, update.deferred], ["succeeded", true]);
  writeFileSync(log + ".release", "release");
  const conversation = await sent;
  assert.equal(conversation.turns.at(-1)!.status, "inProgress", "the send is not cut off by the relaunch");
  assert.equal(rows().filter(row => row.pid).length, 1, "the Copilot process that received the send keeps running");
  await conversations.interrupt(conversation.id);
});

test("dynamic document tools enforce turn scope and preserve results across process resume", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-tools-")), folder = path.join(root, "docs"), outside = path.join(root, "outside"), cwd = path.join(root, "assistant"), log = path.join(root, "rpc.jsonl");
  mkdirSync(folder); mkdirSync(outside);
  const connection = new ProviderConnections(cwd, { bin: process.execPath, args: [fakeServer, log] }, undefined, { packaged: false, checkoutRoot: root });
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  const settings = { provider: "codex" as const, permissionMode: "opened-folders" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const input = { message: "Create Hello", folders: [folder], model: settings.model, reasoningEffort: "medium" };
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
  await conversations.send({ ...input, id: conversation.id, folders: [outside] }, { ...settings, permissionMode: "read-only" });
  assert.equal((await call("create_document", { ...args, path: path.join(folder, "Steered.md") })).result.success, true);
  await connection.client.request("fixture/finish", { threadId: conversation.id });
  assert.equal((await call("create_document", { ...args, path: path.join(folder, "late.md") })).result.success, false);
  await connection.close();
  const next = new ProviderConnections(cwd, { bin: process.execPath, args: [fakeServer, log] }, undefined, { packaged: false, checkoutRoot: root });
  try {
    const history = new AssistantConversations(next, new RootAccess([root]));
    const resumed = await history.resume(conversation.id, settings);
    assert.deepEqual(resumed.turns[0]!.items.find(item => item.text === "create_document" && item.toolResult?.success === true)!.toolResult, created);
    await history.send({ ...input, id: conversation.id, folders: [], permissionMode: "read-only" }, settings);
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
    for (const [tool, arguments_] of [["create_document", { ...args, path: outsideFile }], ["read_document", { path: outsideFile }]] as const) {
      const response = await next.client.request("fixture/tool", { threadId: conversation.id, tool, arguments: arguments_ });
      assert.equal(response.result.success, true, `${tool} outside opened folders in Full access`);
    }
    const hostDenied = await next.client.request("fixture/tool", { threadId: conversation.id, tool: "read_document", arguments: { path: path.join(root, "..", "outside-host.md") } });
    assert.equal(hostDenied.result.success, false, "Full access preserves Host roots");
    const rpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(rpc.find(entry => entry.method === "thread/start").params.dynamicTools.map((tool: any) => tool.name), ["import_document_image", "create_document", "read_document", "list_documents", "list_templates", "read_template", "save_template", "request_litzio_user_input"]);
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
  await conversations.answer(c.id, q.turnId, q.requestId, { "0": { answers: ["A"] } });
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




test("Codex requirements disable full access; policy rejection retries once before execution and remembers reduced access", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-policy-"));
  const opened = path.join(root, "opened"); mkdirSync(opened);
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
    if (method === "turn/start") { policies.push(params.sandboxPolicy.type); assert.equal(JSON.parse(params.input[1].text.split("(JSON):\n")[1]).permissionMode, params.sandboxPolicy.type === "dangerFullAccess" ? "full-access" : params.sandboxPolicy.type === "readOnly" ? "read-only" : "opened-folders"); if (uncertain) throw new Error("Connection closed before response"); }
    if (method === "turn/start" && params.sandboxPolicy.type === "dangerFullAccess") throw new Error("invalid thread settings override: invalid value for sandbox_mode: DangerFullAccess is not in the allowed set [ReadOnly, WorkspaceWrite] (set by enterprise-managed requirements private-organization)");
    return original(method, params);
  });
  assert.equal((await connection.models()).fullAccessAllowed, false);
  discovery = false;
  assert.equal((await connection.models()).fullAccessAllowed, undefined);
  const conversations = new AssistantConversations(connection, null);
  const settings = { provider: "codex" as const, permissionMode: "opened-folders" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const input = { message: "Keep this conversation", folders: [opened], model: settings.model, reasoningEffort: settings.reasoningEffort };
  const conversation = await conversations.send(input, settings);
  await conversations.interrupt(conversation.id);
  const before = conversation.turns.length;
  const retry = await conversations.send({ ...input, id: conversation.id, permissionMode: "full-access" }, settings);
  assert.equal(retry.id, conversation.id);
  assert.equal(retry.turns.length, before + 1, "only the admitted retry creates a turn");
  assert.equal(retry.permissionMode, "opened-folders");
  assert.equal(retry.permissionFallback, true);
  assert.deepEqual(policies, ["workspaceWrite", "dangerFullAccess", "workspaceWrite"]);
  const outside = path.join(root, "fallback-outside.md");
  const create = (file: string) => connection.client.request("fixture/tool", { threadId: retry.id, tool: "create_document", arguments: { path: file, title: "Fallback scope", blocks: [{ type: "paragraph", text: "Policy fallback" }] } });
  const denied = await create(outside);
  assert.equal(denied.result.success, false, "fallback Host writes must obey opened-folder scope");
  assert.equal(JSON.parse(denied.result.contentItems[0].text).errorKind, "forbidden");
  assert.equal(existsSync(outside), false, "a rejected Full access turn must not create a file outside opened folders");
  const inside = path.join(opened, "fallback-inside.md");
  assert.equal((await create(inside)).result.success, true, "fallback keeps legitimate opened-folder Host writes available");
  assert.equal(existsSync(inside), true);
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
  writeFileSync(outside, "outside reference");
  const beforeReferenceFallback = policies.length;
  await assert.rejects(conversations.send({ ...input, id: restored.id, permissionMode: "full-access", references: [outside] }, settings), /outside/);
  assert.equal(policies.length, beforeReferenceFallback + 1, "a policy downgrade must reject outside attachments before restricted submission");
  uncertain = true;
  const attempts = policies.length;
  await assert.rejects(conversations.send({ ...input, id: restored.id, permissionMode: "full-access" }, settings), /Connection closed before response/);
  assert.equal(policies.length, attempts + 1, "uncertain acceptance must never replay a request");

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
  const first = await conversations.send(input, settings);
  // The fixture may still be appending a later request; parse only complete lines.
  const rows = () => readFileSync(log, "utf8").split("\n").slice(0, -1).map(line => JSON.parse(line));
  const endpoint = () => rows().filter(row => ["session/new", "session/load"].includes(row.method) && row.params.mcpServers.length).at(-1).params.mcpServers[0].url;
  const firstUrl = endpoint();
  const connect = async (url: string) => { const client = new Client({ name: "fixture", version: "1" }); clients.push(client); await client.connect(new StreamableHTTPClientTransport(new URL(url))); return client; };
  const one = await connect(firstUrl);
  assert.deepEqual((await one.listTools()).tools, conversations.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema: { ...inputSchema } })));
  assert.equal((await one.callTool({ name: "list_documents", arguments: { path: root } })).isError, false);
  const { documentTools } = await import("../server/assistant-document-tools.ts");
  const published = (await one.listTools()).tools;
  for (const name of ["import_document_image"]) {
    const definition = documentTools.find(tool => tool.name === name)!;
    assert.deepEqual(published.find(tool => tool.name === name), { name, description: definition.description, inputSchema: definition.inputSchema });
  }
  const original = path.join(root, "a.md"), source = "---\nlitzio: 1\n---\n\nFirst paragraph.\n\nSecond paragraph.\n";
  writeFileSync(original, source);
  const payload = (result: any) => JSON.parse(result.content[0].text);
  const image = path.join(root, "desk.png");
  writeFileSync(image, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64"));
  const imported = await one.callTool({ name: "import_document_image", arguments: { path: original, source: image } });
  assert.equal(imported.isError, false);
  assert.equal(payload(imported).path, "./assets/desk.png");
  assert.deepEqual(readFileSync(path.join(root, payload(imported).path)), readFileSync(image));
  const structuredPath=path.join(root,"structured-mcp.md");
  const operations=[{command:"insert-table",at:"end",cells:[["Task","State"],["A","Done"]]},{command:"insert-figure",at:"end",image:"missing.png",caption:"Chart"}];
  const rejectedStructure=await one.callTool({name:"create_document",arguments:{path:structuredPath,title:"Report",operations:[...operations,{command:"remove-block",at:99999}]}});
  assert.equal(rejectedStructure.isError,true);assert.equal(payload(rejectedStructure).errorKind,"invalid_input");
  assert.equal(payload(rejectedStructure).recovery.action,"correct_input");assert.equal(existsSync(structuredPath),false);
  const structured=await one.callTool({name:"create_document",arguments:{path:structuredPath,title:"Report",operations}});
  assert.equal(structured.isError,false);assert.equal(payload(structured).receipt.outcome,"success");
  assert.equal(payload(structured).path,structuredPath);assert.ok(payload(structured).revision);
  assert.equal(payload(structured).readiness[0].status,"missing_or_unreadable","asset warnings must survive without becoming a document-write failure");
  connection.client.emit("disconnected", "Unrelated Codex connection closed");
  assert.equal((await one.callTool({name:"list_documents",arguments:{path:root}})).isError,false,"Codex disconnect cannot revoke a Copilot turn");
  for(const name of ["read_screen_context","close_tabs","open_folder","close_folders","read_display_settings","change_display_settings"])assert.equal(published.some(tool=>tool.name===name),false);
  await assert.rejects(one.callTool({name:"read_screen_context",arguments:{}}),/Unknown Host tool/);
  const permission = async (serverName: string, toolName: string, metadata = true) => (await resolvePermission(connection, conversations, { sessionId: first.id, toolCall: { toolCallId: "mcp", kind: "other", title: "litzio_host-list_documents", ...(metadata ? { rawInput: { serverName, toolName } } : {}) }, options: [{ optionId: "once", kind: "allow_once", name: "Once" }] }));
  assert.equal((await permission("litzio_host", "list_documents")).outcome.outcome, "selected");
  assert.equal((await permission("foreign", "list_documents")).outcome.outcome, "cancelled");
  assert.equal((await permission("litzio_host", "missing_tool")).outcome.outcome, "cancelled");
  assert.equal((await permission("litzio_host", "list_documents", false)).outcome.outcome, "cancelled", "a matching title alone does not identify a Host tool");
  const second = await conversations.send({ ...input, folders: [] }, { ...settings, permissionMode: "read-only" });
  const two = await connect(endpoint());
  assert.equal((await two.callTool({ name: "invoke_plugin_operation", arguments: { operation: "fixture.read", input: {} } })).isError, false, "read-only MCP dispatch uses the same Host plugin operation path");
  assert.equal((await two.callTool({ name: "list_documents", arguments: { path: root } })).isError, true, "a second conversation cannot inherit the first folder scope");
  assert.equal((await one.callTool({ name: "request_litzio_user_input", arguments: {} })).isError, true, "text questions must not create review image approval");
  const asked = await one.callTool({ name: "request_litzio_user_input", arguments: { questions: [{ title: "Which result?", options: ["Summary", "Details"] }] } });
  assert.equal(asked.isError, false, "Copilot supports the shared structured question tool over HTTP MCP");
  assert.ok(first.turns.flatMap(t => t.items).some(item => item.question?.sourceQuestions?.[0]?.title === "Which result?"));
  await conversations.interrupt(first.id);
  await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: first.id, modelId: "auto" }));
  await assert.rejects(one.callTool({ name: "list_documents", arguments: { path: root } }), /No authorized active turn/);
  assert.equal((await permission("litzio_host", "list_documents")).outcome.outcome, "cancelled");
  const deadline = Date.now() + 5000;
  while (first.turns.at(-1)?.status === "inProgress" && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.notEqual(first.turns.at(-1)?.status, "inProgress");
  assert.equal(readFileSync(original, "utf8"), source);

  const question = first.turns.at(-1)!.items.find(item => item.question?.requestId === first.userInput?.requestId)!.question!;
  const answers = { "0": { answers: ["Summary"] } };
  await conversations.answer(first.id, question.turnId, question.requestId, answers);
  assert.equal(question.status, "answered");
  const answerItem = first.turns.at(-1)!.items[0]!;
  assert.deepEqual(answerItem.questionAnswer?.answers, answers);
  await conversations.interrupt(first.id);
  await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: first.id, modelId: "auto" }));
  const unmatched = answerItem.text.replace(String(question.requestId), "unmatched-question");
  await conversations.send({ ...input, id: first.id, message: unmatched }, settings);
  const unmatchedItem = first.turns.at(-1)!.items[0]!;
  assert.equal(unmatchedItem.questionAnswer, undefined);
  assert.equal(unmatchedItem.text, unmatched);
  await conversations.interrupt(first.id);
  await connection.copilot.call(async () => (await connection.copilot.connect()).unstable_setSessionModel({ sessionId: first.id, modelId: "auto" }));

  const previousTurn = first.turns.at(-1)!.id;
  await conversations.send({ ...input, id: first.id, folders: [] }, { ...settings, permissionMode: "read-only" });
  assert.equal(rows().some(row => row.method === "session/load"), false, "a loaded session must not be loaded twice");
  assert.notEqual(first.turns.at(-1)!.id, previousTurn);
  assert.equal((await one.callTool({ name: "invoke_plugin_operation", arguments: { operation: "fixture.read", input: {} } })).isError, false, "the original endpoint serves the new admitted turn");
  assert.equal((await one.callTool({ name: "list_documents", arguments: { path: root } })).isError, true, "the new turn cannot inherit earlier folders");
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
  await connection.copilot.useLaunchSettings(settings.reasoningEffort, false);
  const replayClient = await connection.copilot.connect(), load = replayClient.loadSession.bind(replayClient);
  const prompts = rows().filter(row => row.method === "session/prompt" && row.params.sessionId === first.id).map(row => row.params.prompt[0]);
  assert.ok(prompts.some(prompt => prompt.text.includes(answerItem.text)), "the original answer remains in the provider prompt");
  const replay = t.mock.method(replayClient, "loadSession", async (params: Parameters<typeof replayClient.loadSession>[0]) => {
    const result = await load(params);
    for (const content of prompts) connection.copilot.emit("update", { sessionId: params.sessionId, update: { sessionUpdate: "user_message_chunk", content } });
    return result;
  });
  const reopened = await conversations.resume(first.id, settings);
  replay.mock.restore();
  const items = reopened.turns.flatMap(turn => turn.items);
  assert.deepEqual(items.find(item => item.text === answerItem.text)?.questionAnswer?.answers, answers);
  assert.ok(items.some(item => item.text === unmatched && !item.questionAnswer));
  const restored = items.find(item => item.question?.requestId === question.requestId)?.question;
  assert.equal(restored?.status, "answered");
  assert.deepEqual(restored?.answers, answers);
  const idleUrl = endpoint();
  assert.notEqual(idleUrl, firstUrl, "process restart replaces the session endpoint");
  assert.equal((await fetch(firstUrl, { method: "POST" })).status, 403);
  await conversations.resume(first.id, settings);
  assert.equal(rows().filter(row => row.method === "session/load" && row.params.sessionId === first.id).length, 1);
  conversations.remove(first.id);
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

test("PowerShell inventory warns only for Store-only installations", () => {
  const store = [
    "C:/Users/example/AppData/Local/Microsoft/WindowsApps/Microsoft.PowerShell_8wekyb3d8bbwe/pwsh.exe",
    "C:/Users/example/AppData/Local/Microsoft/WindowsApps/pwsh.exe",
  ];
  assert.equal(onlyStorePowerShell(store), true);
  assert.equal(onlyStorePowerShell([...store, "C:/Program Files/PowerShell/7/pwsh.exe"]), false);
  assert.equal(onlyStorePowerShell([]), false);
});

test("a Copilot disconnect cleans up only its own conversations while a Codex turn keeps running", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "provider-disconnect-")), log = path.join(root, "rpc.jsonl"), acpLog = path.join(root, "acp.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath, args: [fakeServer, log] }, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), acpLog] });
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  t.after(async () => { await conversations.close(); await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const codexSettings = { provider: "codex" as const, permissionMode: "opened-folders" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const codex = await conversations.send({ message: "Draft", folders: [root], model: codexSettings.model, reasoningEffort: codexSettings.reasoningEffort }, codexSettings);
  const copilotSettings = { provider: "copilot" as const, permissionMode: "read-only" as const, model: "auto", reasoningEffort: "medium" };
  const copilot = await conversations.send({ message: "Wait for approval", folders: [root], model: "auto", reasoningEffort: "medium" }, copilotSettings);
  // The fixture asks to write outside the read-only scope: an approval card waits for the user.
  await until(() => copilot.userInput, "the Copilot approval card");
  const approval = copilot.userInput!;
  const acp = connection.copilot, client = await acp.connect();
  const disconnected = new Promise(resolve => acp.once("disconnected", resolve));
  await assert.rejects(acp.call(() => client.unstable_setSessionModel({ sessionId: copilot.id, modelId: "EXIT PROCESS" })));
  await disconnected;
  assert.equal(copilot.turns.at(-1)!.status, "failed");
  assert.equal(copilot.userInput, undefined);
  assert.throws(() => conversations.answer(copilot.id, approval.turnId, approval.requestId, { decision: { answers: ["Reject"] } }), /expired/);
  assert.throws(() => conversations.mcp.lease(copilot.id), /Missing Copilot MCP/, "the lost connection's Host tool endpoint is revoked");
  assert.equal(codex.turns.at(-1)!.status, "inProgress");
  assert.equal((await connection.client.request("fixture/tool", { threadId: codex.id, tool: "list_documents", arguments: { path: root } })).result.success, true, "the Codex turn keeps its tool scope");
  const resumes = () => readFileSync(log, "utf8").split("\n").filter(Boolean).filter(line => JSON.parse(line).method === "thread/resume").length;
  await conversations.send({ id: codex.id, message: "Also this", folders: [root], model: codexSettings.model, reasoningEffort: codexSettings.reasoningEffort }, codexSettings);
  assert.equal(resumes(), 0, "the Codex conversation stays loaded");
  await conversations.send({ id: copilot.id, message: "COMPLETE THIS TURN", folders: [root], model: "auto", reasoningEffort: "medium" }, copilotSettings);
  assert.ok(readFileSync(acpLog, "utf8").split("\n").filter(Boolean).some(line => JSON.parse(line).method === "session/load" && JSON.parse(line).params.sessionId === copilot.id), "the Copilot conversation is loaded again on the new process");
  await conversations.interrupt(codex.id);
});

test("Copilot recovery preserves active prompts and never replays timed out requests", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "copilot-recovery-")), log = path.join(root, "rpc.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), undefined, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log], timeoutMs: 2000 });
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  connection.environment();
  const acp = connection.copilot, first = await acp.catalog(), client = await acp.connect();
  const disconnected = new Promise(resolve => acp.once("disconnected", resolve));
  await assert.rejects(acp.call(() => client.unstable_setSessionModel({ sessionId: first.sessionId, modelId: "EXIT PROCESS" })));
  await disconnected;
  assert.equal((await connection.diagnostics("copilot")).connected, true);
  assert.notEqual((await acp.catalog()).sessionId, first.sessionId);
  for (const pipe of ["stdin", "stdout"] as const) {
    const beforeStreamLoss = await acp.catalog();
    // Inject OS pipe errors at the Node stream boundary. The fake child still
    // owns a real ACP connection, and the next catalog must use a new child.
    const streamLost = new Promise(resolve => acp.once("disconnected", resolve));
    const interrupted = acp.call(() => new Promise<never>(() => {}));
    const child = (acp as unknown as { child: import("node:child_process").ChildProcessWithoutNullStreams }).child;
    if (pipe === "stdout") child.stdout.destroy(new Error("Fixture pipe failure"));
    else child.stdin.emit("error", new Error("Fixture pipe failure"));
    await assert.rejects(interrupted, /Fixture pipe failure/);
    await streamLost;
    assert.notEqual((await acp.catalog()).sessionId, beforeStreamLoss.sessionId);
  }
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  const settings = { provider: "copilot" as const, permissionMode: "read-only" as const, model: "auto", reasoningEffort: "medium" };
  const input = { message: "Wait for cancellation", folders: [], model: "auto", reasoningEffort: "medium" };
  const active = await conversations.send(input, settings), running = await acp.connect();
  await assert.rejects(acp.call(() => running.unstable_setSessionModel({ sessionId: active.id, modelId: "HANG REQUEST" })), /timed out/);
  assert.equal((await connection.diagnostics("copilot")).connected, true);
  assert.equal(await acp.connect(), running);
  assert.equal(active.turns.at(-1)!.status, "inProgress");
  const fresh = await conversations.send({ ...input, message: "COMPLETE THIS TURN" }, settings);
  await acp.call(() => running.unstable_setSessionModel({ sessionId: fresh.id, modelId: "auto" }));
  assert.equal(fresh.turns.at(-1)!.status, "completed");
  await conversations.interrupt(active.id);
  const requests = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.equal(requests.filter(row => row.params?.modelId === "HANG REQUEST").length, 1);
  assert.equal(requests.filter(row => row.method === "session/prompt").length, 2);
});

test("Copilot resolved spawn failure reconnects the same owner", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "copilot-start-")), cwd = path.join(root, "missing");
  const connection = new ProviderConnections(cwd, undefined, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url))], timeoutMs: 2000 });
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  connection.environment();
  const missing = t.mock.getter(connection.copilot, "executable", () => path.join(root, "missing-executable"));
  await assert.rejects(connection.copilot.connect());
  missing.mock.restore();
  assert.equal((await connection.diagnostics("copilot")).connected, true);
  assert.ok((await connection.copilot.catalog()).sessionId);
});

test("Copilot exit before initialization and a rejected session recover on the next request", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "copilot-transient-")), log = path.join(root, "rpc.jsonl");
  const connection = new ProviderConnections(path.join(root, "assistant"), undefined, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log, "--fixture-exit-once", "--fixture-session-error-once"], timeoutMs: 2000 });
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  connection.environment();
  await assert.rejects(connection.copilot.connect(), /Copilot ACP (exited|stream closed)/);
  const client = await connection.copilot.connect();
  // A provider error response such as missing sign-in keeps the process; the
  // catalog is not cached, so the same connection succeeds once it is resolved.
  await assert.rejects(connection.copilot.catalog(), /Copilot session fixture failure/);
  assert.ok((await connection.copilot.catalog()).sessionId);
  assert.equal(await connection.copilot.connect(), client);
  assert.equal((await connection.diagnostics("copilot")).connected, true);
});

test("Copilot unconfirmed termination of a retired process does not block the next connection", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "copilot-retire-")), fixture = fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url));
  const owners: ProviderConnections[] = [], logs = ["initialize", "stream"].map(name => path.join(root, `${name}.jsonl`));
  const orphan = (log: string): number => readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).find(row => row.orphanPid).orphanPid;
  t.after(async () => {
    for (const log of logs) try { process.kill(orphan(log)); } catch { /* Absent or already stopped by the scenario. */ }
    await Promise.all(owners.map(owner => owner.close())); rmSync(root, { recursive: true, force: true });
  });
  // Initialization timeout and transport loss each retire a process whose
  // stdout stays open, so its termination check fails after the stop deadline.
  await Promise.all([true, false].map(async hangInitialize => {
    const log = logs[hangInitialize ? 0 : 1]!;
    const connection = new ProviderConnections(path.join(root, hangInitialize ? "initialize" : "stream"), undefined, { bin: process.execPath, args: [fixture, log, "--fixture-orphan-stdout-once", ...(hangInitialize ? ["--fixture-hang-initialize"] : [])], timeoutMs: 2000 });
    owners.push(connection); connection.environment();
    const acp = connection.copilot;
    if (!hangInitialize) {
      await acp.catalog();
      const lost = new Promise(resolve => acp.once("disconnected", resolve));
      (acp as unknown as { child: import("node:child_process").ChildProcessWithoutNullStreams }).child.stdin.emit("error", new Error("Fixture pipe failure"));
      await lost;
    }
    await assert.rejects(acp.connect(), /Could not confirm agent termination/);
    process.kill(orphan(log));
    assert.equal((await connection.diagnostics("copilot")).connected, true);
    assert.ok((await acp.catalog()).sessionId);
  }));
});

test("Copilot late session load cannot trap explicit resume on an already loaded session", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "copilot-late-load-")), log = path.join(root, "rpc.jsonl"), cwd = path.join(root, "assistant");
  const options = { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log, "--fixture-delay-load-once"] };
  const first = new ProviderConnections(cwd, undefined, options);
  const connection = new ProviderConnections(cwd, undefined, options);
  t.after(async () => { await first.close(); await connection.close(); rmSync(root, { recursive: true, force: true }); });
  const settings = { provider: "copilot" as const, permissionMode: "read-only" as const, model: "auto", reasoningEffort: "medium" };
  const input = { message: "COMPLETE THIS TURN", folders: [], model: "auto", reasoningEffort: "medium" };
  const original = new AssistantConversations(first, new RootAccess([root]));
  const saved = await original.send(input, settings);
  await first.copilot.call(async () => (await first.copilot.connect()).unstable_setSessionModel({ sessionId: saved.id, modelId: "auto" }));
  assert.equal(saved.turns.at(-1)!.status, "completed");
  await first.close();
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  const active = await conversations.send({ ...input, message: "Wait for cancellation" }, settings);
  let accepted!: () => void;
  const loadAccepted = new Promise<void>(resolve => { accepted = resolve; });
  const late = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Missing delayed load response")), 5000);
    connection.copilot.on("update", params => {
      if (params.update.content?.text === "Delayed load accepted") accepted();
      if (params.update.content?.text === "Delayed load completed") { clearTimeout(timer); resolve(); }
    });
  });
  // Advance only the admitted load's Host deadline. CLI startup/diagnosis must
  // not inherit an artificial 300ms speed requirement from this fault injection.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const restoring = conversations.resume(saved.id, settings);
    await Promise.race([loadAccepted, late.then(() => { throw new Error("Load completed before fault injection"); })]);
    t.mock.timers.tick(15000);
    await assert.rejects(restoring, /timed out/);
  } finally { t.mock.timers.reset(); }
  await late; // Provider accepted the load; only its success response was delayed.
  const diagnostic = await connection.diagnostics("copilot");
  assert.equal(diagnostic.connected, true, diagnostic.error);
  assert.equal((await conversations.resume(saved.id, settings)).id, saved.id);
  assert.equal((await conversations.resume(saved.id, settings)).id, saved.id);
  assert.equal(active.turns.at(-1)!.status, "failed", "uncertain session ownership retires the transport including its other active turn");
  const requests = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.equal(requests.filter(row => row.method === "session/load").length, 2, "only the two explicit restore attempts dispatch; successful resume reuses the loaded session");
  assert.equal(requests.filter(row => row.method === "session/prompt").length, 2, "no failed work is automatically replayed");
});

test("Copilot ACP usage stays on its conversation and survives in-memory resume without summing prompt reports", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-1581-"));
  const connection = new ProviderConnections(path.join(root, "assistant"), undefined, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url))] });
  const conversations = new AssistantConversations(connection, new RootAccess([root]), {} as any);
  t.after(async () => { await conversations.close(); await connection.close(); });
  const settings = { provider: "copilot" as const, permissionMode: "read-only" as const, model: "auto", reasoningEffort: "high" };
  const input = { message: "USAGE FIXTURE", folders: [root], model: "auto", reasoningEffort: "high" };
  const used = await conversations.send(input, settings);
  const finished = async (value: typeof used) => {
    for (let i = 0; i < 100 && value.turns.at(-1)?.status === "inProgress"; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(value.turns.at(-1)?.status, "completed");
  };
  await finished(used);
  assert.deepEqual(used.tokenUsage, { used: 15000, limit: 200000 });
  assert.deepEqual(used.copilotUsage, { cost: { amount: 0.25, currency: "USD" }, prompt: { totalTokens: 14000, inputTokens: 13995, outputTokens: 5, thoughtTokens: undefined, cachedReadTokens: undefined, cachedWriteTokens: undefined } });
  const resumed = await conversations.resume(used.id, settings);
  assert.deepEqual(resumed.tokenUsage, used.tokenUsage);
  assert.deepEqual(resumed.copilotUsage, used.copilotUsage);
  await finished(await conversations.send({ ...input, id: used.id }, settings));
  assert.equal(conversations.current(used.id).copilotUsage?.prompt?.totalTokens, 14000);
  const absent = await conversations.send({ ...input, message: "COMPLETE THIS TURN" }, settings);
  await finished(absent);
  assert.equal(absent.tokenUsage, undefined);
  assert.equal(absent.copilotUsage, undefined);
});

test("pasted images are Host-owned across permissions, restart, and deletion; crafted paths gain no exception", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-paste-")), cwd = path.join(root, "assistant"), log = path.join(root, "rpc.jsonl");
  const connection = new ProviderConnections(cwd, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url)), log] });
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  t.after(async () => { await conversations.close(); await connection.close(); });
  const data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=";
  const upload = () => conversations.attachments.upload({ mime: "image/png", data });
  assert.throws(() => conversations.attachments.upload({ mime: "image/svg+xml", data }), /Only/);
  assert.throws(() => conversations.attachments.upload({ mime: "image/png", data: Buffer.from("not an image").toString("base64") }), /complete/);
  assert.throws(() => conversations.attachments.upload({ mime: "image/png", data, path: root } as any), /Invalid/);
  const settings = { provider: "codex" as const, model: "gpt-6.1-sol", reasoningEffort: "medium", permissionMode: "read-only" as const };
  const input = { message: "Read the image", folders: [], model: settings.model, reasoningEffort: "medium" };
  for (const permissionMode of ["read-only", "opened-folders", "full-access"] as const) {
    const image = upload();
    const result = await conversations.send({ ...input, permissionMode, references: [image.path] }, settings);
    const calls = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert(calls.some(row => row.method === "turn/start" && row.params.input.some((part: any) => part.type === "localImage" && part.path === image.path)));
    await connection.client.request("fixture/finish", { threadId: result.id });
    for (let n = 0; n < 100 && result.turns.some(turn => turn.status === "inProgress"); n++) await new Promise(resolve => setTimeout(resolve, 10));
    const other = path.join(cwd, "other.png"); writeFileSync(other, Buffer.from(data, "base64"));
    for (const file of [other, image.path.replace("clipboard-", "../attachments/clipboard-"), image.path.toUpperCase()]) {
      await assert.rejects(conversations.send({ ...input, permissionMode: "read-only", references: [file] }, settings), /outside|unavailable/);
    }
    const linked = path.join(cwd, "link");
    if (!existsSync(linked)) symlinkSync(path.dirname(image.path), linked, "junction");
    await assert.rejects(conversations.send({ ...input, references: [path.join(linked, path.basename(image.path))] }, settings), /outside|unavailable/);
    await assert.rejects(conversations.send({ ...input, references: [image.path] }, settings), /another conversation/);
    conversations.remove(result.id);
    assert.equal(existsSync(image.path), false);
  }
  const draft = upload();
  writeFileSync(draft.path, "replacement secret");
  assert.throws(() => conversations.attachments.reference(draft.path), /unavailable/);
  writeFileSync(draft.path, Buffer.from(data, "base64"));
  const { AssistantAttachments } = await import("../server/assistant-attachments.ts");
  new AssistantAttachments(cwd); // A fresh Host drops unclaimed drafts after an unclean stop.
  assert.equal(existsSync(draft.path), false);
  await conversations.close();
  assert.equal(existsSync(draft.path), false);
});

test("pasted images use ACP image bytes and retained Host attachments survive restart", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-paste-acp-")), log = path.join(root, "rpc.jsonl"), cwd = path.join(root, "assistant");
  const connection = new ProviderConnections(cwd, undefined, { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log] });
  const conversations = new AssistantConversations(connection, new RootAccess([root]));
  t.after(async () => { await conversations.close(); await connection.close(); });
  const data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=";
  const image = conversations.attachments.upload({ mime: "image/png", data });
  const settings = { provider: "copilot" as const, permissionMode: "read-only" as const, model: "auto", reasoningEffort: "high" };
  const result = await conversations.send({ message: "COMPLETE THIS TURN", folders: [], model: "auto", reasoningEffort: "high", references: [image.path] }, settings);
  for (let n = 0; n < 100 && result.turns.at(-1)?.status === "inProgress"; n++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(result.turns.at(-1)?.status, "completed");
  const prompt = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)).find(row => row.method === "session/prompt");
  assert.deepEqual(prompt.params.prompt[1], { type: "image", mimeType: "image/png", data });
  await conversations.close(); await connection.close();
  const { AssistantAttachments } = await import("../server/assistant-attachments.ts");
  const restored = new AssistantAttachments(cwd);
  assert.equal(restored.reference(image.path, result.id)?.kind, "image");
  assert.equal(restored.reference(image.path, result.id)?.pastedImage, true, "restored references retain the presentation marker");
  restored.remove(result.id);
  assert.equal(existsSync(image.path), false);
});
