import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { createAssistantHost } from "../server/assistant-host.ts";
import { ProviderConnections } from "../server/provider-connections.ts";
import { handleDocumentRequest } from "../server/document-api.ts";
import { listenForFetch } from "../../../test/helpers/fetch-server.ts";
import { runCliAsync } from "../../../packages/cli/src/cli.ts";

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
  const saved = await put(settings);
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
    const { VIEW_TRANSPORT_LIMITS } = await import("../shared/view-limits.ts");
    const oversized = await fetch(`${url}/api/assistant/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", message: "x".repeat(VIEW_TRANSPORT_LIMITS.requestBytes) }) });
    assert.equal(oversized.status, 413, "the Host enforces the envelope even when the app transport is bypassed");
  } finally {
    stdout.mock.restore(); stderr.mock.restore();
    if (previous === undefined) delete process.env.LITZIO_ASSISTANT_SETTINGS_FILE; else process.env.LITZIO_ASSISTANT_SETTINGS_FILE = previous;
  }
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
  const pid = JSON.parse(readFileSync(log, "utf8").split("\n")[0]!).pid as number;
  assert.equal(typeof pid, "number");
  t.mock.method(connection, "diagnostics", async (provider?: "codex" | "copilot") => ({ provider: provider ?? "codex", connected: false, path: null, version: null, checkedAt: Date.now(), error: "Fixture provider unavailable" }));
  await host.invoke("configure", { ...settings, permissionMode: "read-only" });
  t.mock.method(connection, "models", async () => ({ provider: "copilot" as const, updatedAt: Date.now(), models: [{ id: "auto", model: "auto", displayName: "Auto", description: "Fixture", defaultReasoningEffort: "medium", supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Fixture" }] }] }));
  await host.invoke("configure", { ...settings, provider: "copilot", model: "auto" });
  assert.doesNotThrow(() => process.kill(pid, 0));
  assert.equal((await host.invoke("assistantConversations", { id })).turns[0], turn);
  await assert.rejects(host.invoke("assistantConversation", { action: "send", message: "New work", folders: [root], model: settings.model, reasoningEffort: settings.reasoningEffort }), /AI provider copilot is unavailable: Fixture provider unavailable/);
  await host.invoke("assistantConversation", { action: "interrupt", id });
  await host.close();
  assert.throws(() => process.kill(pid!, 0), "daemon shutdown waits for its exact provider process");
  await assert.rejects(host.invoke("assistantConversations", {}), /closing/);
});

test("a cancelled view request interrupts its eventual provider turn when admission was delayed", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-view-cancel-"));
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath,
    args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url))] });
  const host = createAssistantHost(null, path.join(root, "ai.json"), { agent: connection });
  t.after(async () => { await host.close(); rmSync(root, { recursive: true, force: true }); });
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const diagnostics = connection.diagnostics.bind(connection);
  t.mock.method(connection, "diagnostics", async (provider?: "codex" | "copilot") => { entered(); await gate; return diagnostics(provider); });
  const { requestId } = await host.invoke("assistantConversation", { action: "prepare-view-generation" });
  const sending = host.invoke("assistantConversation", { action: "send", viewGeneration: true, viewGenerationRequest: requestId,
    message: "Show document totals", folders: [], model: "gpt-6.1-sol", reasoningEffort: "medium" });
  await waiting;
  assert.deepEqual(await host.invoke("assistantConversation", { action: "cancel-view-generation", requestId }), { acknowledged: true });
  release(); await assert.rejects(sending, /cancelled/);
  const [info] = await host.invoke("assistantConversations", {});
  const conversation = await host.invoke("assistantConversations", { id: info.id });
  assert.equal(conversation.turns.at(-1).status, "interrupted");
});


test("plugin and view services work without an assistant and survive assistant shutdown failure", async t => {
  const { createHostServices } = await import("../server/host-services.ts");
  const { STATISTICS_PLUGIN_ID } = await import("../server/views.ts");
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
  const response = await fetch(`${url}/api/views`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list", plugin: STATISTICS_PLUGIN_ID }) });
  assert.equal(response.status, 200);
  await services.assistant.close();
  assert.deepEqual((await services.plugins.invoke("pluginsList")).plugins.map((p: any) => p.id), (await (await fetch(`${url}/api/plugins`)).json()).plugins.map((p: any) => p.id));
  assert.equal((await services.views.execute({ action: "list", plugin: STATISTICS_PLUGIN_ID })).receipt.outcome, "success");
  // A service failure still lets Host shutdown close the independent runtime.
  t.mock.method(services.assistant, "close", async () => { throw new Error("fixture close failed"); });
  await assert.rejects(services.close(), /could not close/);
  await assert.rejects(services.plugins.invoke("pluginsList"), /closing/);
});


test("generation proposals use the admitted Host request, owner and material identities rather than public client scope", async t => {
  const { writeFileSync } = await import("node:fs");
  const { executeViewOperation } = await import("../server/views.ts");
  const root = mkdtempSync(path.join(tmpdir(), "view-proposal-host-"));
  const log = path.join(root, "provider.jsonl"), file = path.join(root, "a.md");
  writeFileSync(file, "Revenue: 100");
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath,
    args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url)), log] });
  const { builtinViewOperations } = await import("@litzio/core/views");
  const operation = { operation: "example.data.read", version: 1, inputSchema: { type: "object", properties: {}, additionalProperties: false }, rowSchema: { total: { type: "number" as const, label: "Total" } }, validateArgs: () => true };
  const plugins = { start: async () => {}, host: {
    viewOperations: () => [...builtinViewOperations, operation], viewOperationOwner: (name: string) => name === operation.operation ? "example.data" : undefined,
    viewScreens: () => [{ plugin: "example.data", id: "dashboard" }], hasViewOwner: (owner: string) => owner === "example.data",
  } } as unknown as import("../server/plugin-service.ts").PluginService;
  const host = createAssistantHost(null, path.join(root, "settings.json"), { agent: connection, plugins });
  t.after(async () => { await host.close(); rmSync(root, { recursive: true, force: true }); });
  const prepared = await host.invoke("assistantConversation", { action: "prepare-view-generation" });
  const conversation = await host.invoke("assistantConversation", { action: "send", viewGeneration: true, viewGenerationRequest: prepared.requestId,
    message: "Total", folders: [root], references: [file], model: "gpt-6.1-sol", reasoningEffort: "medium", viewContext: { owner: "litzio.assistant", hostId: "host-a", roots: [] } });
  const rpc = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const context = JSON.parse(rpc.find(call => call.method === "turn/start").params.input[1].text.split("(JSON):\n")[1]);
  const provenance = context.viewGeneration.materials.map((material: any) => material.provenance);
  assert.equal(provenance[0].kind, "reference", "absence of app Root identity never fabricates a document binding");
  const view = { kind: "litzio-view", schemaVersion: 2, catalog: "litzio-v2", profile: "query", owner: "litzio.assistant", title: "예시: Total", refresh: "assistant",
    sources: { stats: { kind: "assistant", generatedAt: "2026-11-06T00:00:00.000Z", rowSchema: { total: { type: "number", label: "Total" } }, rows: [{ total: 100 }], provenance } },
    layout: { component: "Panel", direction: "vertical", children: [{ component: "Table", title: "예시: Total", source: "stats", data: "/rows", columns: ["total"] }] } };
  const proposal = { action: "propose-view-generation", requestId: prepared.requestId, id: conversation.id, turnId: conversation.turns.at(-1).id, view };
  await assert.rejects(host.invoke("assistantConversation", proposal), /completed view generation/);
  const { VIEW_GENERATION_OUTPUT_BYTES } = await import("../shared/view-generation.ts");
  const otherOutput = conversation.turns.at(-1).items.filter((item: any) => item.kind !== "user" && item.kind !== "assistant").map((item: any) => item.text).join("");
  const encodedView = JSON.stringify(view);
  const finalText = encodedView + " ".repeat(VIEW_GENERATION_OUTPUT_BYTES - Buffer.byteLength(otherOutput + encodedView, "utf8"));
  await connection.client.request("fixture/finish", { threadId: conversation.id, finalText });
  assert.equal(conversation.turns.at(-1).status, "completed", "user input is not charged to the provider output budget");
  const result = await host.invoke("assistantConversation", proposal);
  assert.equal(result.receipt.outcome, "success"); assert.equal(result.provenanceStatus, "verified");
  const publicResult = await executeViewOperation({ action: "propose", view }, { access: null });
  assert.ok("provenanceStatus" in publicResult); assert.equal(publicResult.provenanceStatus, "unverified");
  const forged = { ...view, sources: { stats: { ...view.sources.stats, provenance: [{ kind: "reference", label: "Forged", refId: "not-supplied" }] } } };
  assert.equal((await host.invoke("assistantConversation", { ...proposal, view: forged })).receipt.outcome, "failure");
  assert.equal((await host.invoke("assistantConversation", { ...proposal, view: { ...view, owner: "litzio.statistics" } })).receipt.outcome, "failure");
  await assert.rejects(host.invoke("assistantConversation", { ...proposal, turnId: "other-turn" }), /mismatched/);
  await assert.rejects(host.invoke("assistantConversation", { ...proposal, proposal: { owner: "litzio.statistics", provenance } }), /Invalid view generation proposal/);
  await host.invoke("assistantConversation", { action: "cancel-view-generation", requestId: prepared.requestId });
  await assert.rejects(host.invoke("assistantConversation", proposal), /expired or mismatched/);
  const wrongOwner = await host.invoke("assistantConversation", { action: "prepare-view-generation" });
  await assert.rejects(host.invoke("assistantConversation", { action: "send", id: conversation.id, viewGeneration: true, viewGenerationRequest: wrongOwner.requestId,
    message: "New request", folders: [root], model: "gpt-6.1-sol", reasoningEffort: "medium", viewContext: { owner: "litzio.statistics", hostId: "host-a", roots: [] } }), /admitted destination/);
  await assert.rejects(host.invoke("assistantConversation", { action: "prepare-view-generation", target: { kind: "screen", plugin: "missing.plugin", id: "dashboard" } }), /unavailable/);
  const statistics = await host.invoke("assistantConversation", { action: "prepare-view-generation", target: { kind: "statistics" } });
  const next = await host.invoke("assistantConversation", { action: "send", id: conversation.id, viewGeneration: true, viewGenerationRequest: statistics.requestId,
    message: "Statistics", folders: [root], model: "gpt-6.1-sol", reasoningEffort: "medium", viewContext: { owner: "litzio.statistics", hostId: "host-a", roots: [] } });
  await connection.client.request("fixture/finish", { threadId: conversation.id });
  const crossOwner = { ...view, owner: "example.data", refresh: "manual", sources: { stats: { kind: "operation", operation: operation.operation, version: 1, args: {} } } };
  const cross = await host.invoke("assistantConversation", { action: "propose-view-generation", requestId: statistics.requestId, id: conversation.id, turnId: next.turns.at(-1).id, view: crossOwner });
  assert.equal(cross.receipt.outcome, "failure", "a catalog operation cannot change an explicitly admitted destination namespace");
  const large = await host.invoke("assistantConversation", { action: "prepare-view-generation" });
  const over = await host.invoke("assistantConversation", { action: "send", id: conversation.id, viewGeneration: true, viewGenerationRequest: large.requestId,
    message: "Over limit", folders: [], model: "gpt-6.1-sol", reasoningEffort: "medium" });
  const overTurn = over.turns.at(-1);
  const otherBytes = Buffer.byteLength(overTurn.items.filter((item: any) => item.kind !== "user" && item.kind !== "assistant").map((item: any) => item.text).join(""), "utf8");
  await connection.client.request("fixture/finish", { threadId: conversation.id, finalText: "x".repeat(VIEW_GENERATION_OUTPUT_BYTES - otherBytes + 1) });
  assert.equal(overTurn.status, "failed"); assert.match(overTurn.error, /output exceeds byte limit/);


});
