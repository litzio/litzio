import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:http";
import { before, test } from "node:test";
import { AI_TASK, type AiTaskRequest, type AiTaskRecord } from "@litzio/plugin-api/ai";
import { listenForFetch } from "@litzio/plugin-api/testing";
import { buildAiAgent } from "../../../packages/cli/scripts/build-ai-agent.ts";
import { createPluginHost, bundledAiManifest } from "../server/plugin-host.ts";
import { handleDocumentRequest } from "../server/document-api.ts";
import { PluginStore } from "../server/plugin-store.ts";
import { AiTaskRuntime } from "../server/ai-task-runtime.ts";
import { RootAccess } from "../server/file-access.ts";
import { brand } from "../../../brand.ts";

before(() => buildAiAgent(path.dirname(bundledAiManifest())));
async function finished(read: () => AiTaskRecord | null) {
  const deadline = Date.now() + 10_000;
  while (true) {
    const value = read(); if (value && value.status !== "running") return value;
    if (Date.now() >= deadline) throw new Error("AI task did not finish."); await delay(10);
  }
}
function message(source: string, id = randomUUID()): AiTaskRequest {
  return { id, caller: "feature", task: "inspect", instruction: "Return the requested material as value.", materials: [{ path: source, name: "material.txt" }], input: { small: 1 },
    schema: { type: "object", properties: { value: { type: "string" }, input: { type: "object" } }, required: ["value", "input"], additionalProperties: false }, baseline: "caller-revision-opaque" };
}

test("installed caller uses Host-mediated service, HTTP observes completion, UUID is unique across Hosts, disable drains and core stays usable", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-host-test-")), plugins = path.join(root, "plugins"), input = path.join(root, "material.txt");
  writeFileSync(input, "original material");
  const previous = process.env.LITZIO_AI_TEST_ADAPTER; process.env.LITZIO_AI_TEST_ADAPTER = "success";
  const host = createPluginHost(new RootAccess([root]), undefined, { directory: plugins });
  const observer = createPluginHost(new RootAccess([root]), undefined, { directory: plugins });
  const facade = path.join(root, "consumer"); mkdirSync(facade);
  writeFileSync(path.join(facade, "ui.mjs"), "export function activate() {}");
  writeFileSync(path.join(facade, "host.cjs"), `exports.activate = host => ({ routes: {}, operations: {
    available: () => !!host.aiTasks(), start: request => { const service = host.aiTasks(); if (!service) throw new Error('AI agent is disabled'); return service.start(request); }
  } });`);
  writeFileSync(path.join(facade, "manifest.json"), JSON.stringify({ id: "feature", version: "1", ui: { api: 1, reactMajor: 19, script: "ui.mjs" }, host: { api: 1, entry: "host.cjs" } }));
  host.plugins(true).register(path.join(facade, "manifest.json"));
  const server = createServer((req, res) => { void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); }, new RootAccess([root]), 1_000_000, undefined, undefined, host); });
  await listenForFetch(server); const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await observer.close(); await host.close();
    if (previous === undefined) delete process.env.LITZIO_AI_TEST_ADAPTER; else process.env.LITZIO_AI_TEST_ADAPTER = previous;
    rmSync(root, { recursive: true, force: true });
  });
  assert.equal(host.invoke("feature", "available"), true);
  assert.deepEqual(await (await fetch(url + AI_TASK.discoveryRoute)).json(), { available: true });
  assert.equal((await host.aiTasks()!.status()).adapter, "Fake");
  const request = message(input);
  const [first, second] = await Promise.all([host.invoke<Promise<AiTaskRecord>>("feature", "start", request), observer.aiTasks()!.start(request)]);
  assert.equal(first.job.id, second.job.id);
  assert.equal(first.job.state, "running"); assert.equal(first.job.result, undefined);
  const done = await finished(() => host.aiTasks()!.current(request.id));
  assert.equal(done.status, "success"); assert.equal(done.job.baseline, request.baseline);
  assert.deepEqual(done.job.result, { value: "original material", input: request.input });
  assert.equal(host.plugins().aiHistory().length, 1);
  const receipt = host.plugins().getAi(request.id)!;
  for (const file of Object.values(receipt.temporary!)) assert.equal(existsSync(file), false);
  assert.equal((await (await fetch(url + AI_TASK.route + "?id=" + request.id)).json()).job.state, "success");
  await assert.rejects(() => host.aiTasks()!.start({ ...request, baseline: "changed" }), /conflicts/);
  await assert.rejects(() => host.aiTasks()!.start({ ...message(input), caller: "missing" }), /caller/);
  assert.throws(() => host.invoke<Promise<AiTaskRecord>>("feature", "start", { ...message(input), caller: AI_TASK.plugin }), /mismatched/);
  assert.throws(() => host.invoke(AI_TASK.plugin, "start", { ...message(input), materials: [{ path: input, name: "../outside.txt" }] }), /material/);
  process.env.LITZIO_AI_TEST_ADAPTER = "hang";
  const hanging = message(input); await host.aiTasks()!.start(hanging);
  host.plugins().unregister(AI_TASK.plugin);
  assert.equal(host.aiTasks(), undefined); assert.equal(host.invoke("feature", "available"), false);
  assert.deepEqual(await (await fetch(url + AI_TASK.discoveryRoute)).json(), { available: false });
  await assert.rejects(() => host.invoke<Promise<AiTaskRecord>>(AI_TASK.plugin, "start", message(input)), /not registered/);
  const stopped = await host.invoke<Promise<AiTaskRecord>>(AI_TASK.plugin, "cancel", { id: hanging.id });
  assert.equal(stopped.status, "cancelled"); assert.equal(stopped.canCancel, false); assert.equal(stopped.job.result, undefined);
  assert.equal((await host.invoke<Promise<AiTaskRecord>>(AI_TASK.plugin, "start", request)).job.id, request.id);
  assert.equal(host.aiTasks(), undefined, "discovery never silently re-enables the agent");
  writeFileSync(path.join(root, "document.md"), "# Ordinary document\n\nStill works.\n");
  const ordinary = await fetch(url + "/api/document?path=" + encodeURIComponent(path.join(root, "document.md")));
  assert.equal(ordinary.status, 200); assert.equal(readFileSync(input, "utf8"), "original material");
});

test("fake adapter failures, timeout and actual worker cancellation never expose a result; restarted requests remain uncertain and clean only their own recorded temp folders", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-lifetime-test-")), input = path.join(root, "material.txt"), directory = path.join(root, "plugins");
  writeFileSync(input, "data"); const previous = process.env.LITZIO_AI_TEST_ADAPTER;
  const store = new PluginStore(directory); store.register(bundledAiManifest());
  const runtime = new AiTaskRuntime(store);
  t.after(async () => { await runtime.close(); store.close(); if (previous === undefined) delete process.env.LITZIO_AI_TEST_ADAPTER; else process.env.LITZIO_AI_TEST_ADAPTER = previous; rmSync(root, { recursive: true, force: true }); });
  for (const [mode, failure] of [["format", "format"], ["malformed", "format"], ["provider", "provider"], ["hang", "timeout"], ["hang", "cancelled"]]) {
    process.env.LITZIO_AI_TEST_ADAPTER = mode;
    const request = { ...message(input), caller: AI_TASK.plugin };
    await runtime.start(request, failure === "timeout" ? 50 : 5000, AI_TASK.plugin);
    if (failure === "cancelled") await runtime.cancel(request.id);
    const done = await finished(() => runtime.current(request.id));
    assert.equal(done.job.failure, failure); assert.equal(done.job.result, undefined); assert.equal(done.canCancel, false);
    const receipt = store.getAi(request.id)!;
    for (const file of Object.values(receipt.temporary!)) assert.equal(existsSync(file), false);
  }
  const incomplete = path.join(root, "incomplete-worker"); mkdirSync(incomplete);
  writeFileSync(path.join(incomplete, "worker.cjs"), 'process.once("message", () => process.send({ type: "complete", result: { value: "partial", input: {} } }, () => process.exit(7)));');
  writeFileSync(path.join(incomplete, "host.cjs"), readFileSync(path.join(path.dirname(bundledAiManifest()), "host.cjs")));
  writeFileSync(path.join(incomplete, "manifest.json"), JSON.stringify({ id: AI_TASK.plugin, version: "incomplete", workerApi: 1, entry: "worker.cjs", tasks: [AI_TASK.service], host: { api: 1, entry: "host.cjs" } }));
  store.register(path.join(incomplete, "manifest.json"));
  const partial = { ...message(input), caller: AI_TASK.plugin };
  await runtime.start(partial, 5000, AI_TASK.plugin);
  const rejected = await finished(() => runtime.current(partial.id));
  assert.equal(rejected.status, "error"); assert.equal(rejected.job.result, undefined, "complete IPC without normal exit cannot publish partial output");
  const id = randomUUID(), snapshot = path.join(tmpdir(), `${brand.appName}-ai-task-${id}-${randomUUID()}-snapshot`), control = snapshot.replace(/-snapshot$/, "-control");
  const independent = new PluginStore(directory);
  const { receipt } = independent.admit({ kind: "ai-task", id, caller: AI_TASK.plugin, task: "restart", baseline: "base", state: "running", startedAt: Date.now() }, "same", AI_TASK.plugin);
  receipt.temporary = { snapshot, control }; independent.update(receipt); mkdirSync(snapshot); mkdirSync(control);
  const liveId = randomUUID(), liveSnapshot = path.join(tmpdir(), `${brand.appName}-ai-task-${liveId}-${randomUUID()}-snapshot`), liveControl = liveSnapshot.replace(/-snapshot$/, "-control");
  const live = independent.admit({ ...receipt.job, id: liveId }, "live", AI_TASK.plugin).receipt;
  live.status = "uncertain"; live.job.state = "error"; live.job.failure = "uncertain"; live.temporary = { snapshot: liveSnapshot, control: liveControl };
  independent.update(live); mkdirSync(liveSnapshot); mkdirSync(liveControl);
  const watching = new PluginStore(directory), liveObserver = new AiTaskRuntime(watching);
  try { assert.equal(existsSync(liveSnapshot), true, "another live owner may still be terminating an uncertain provider"); assert.equal(existsSync(liveControl), true); }
  finally { await liveObserver.close(); watching.close(); }
  independent.close();
  const recovered = new PluginStore(directory), restarted = new AiTaskRuntime(recovered);
  try {
    assert.equal(restarted.current(id)!.status, "uncertain"); assert.equal(restarted.current(id)!.job.failure, "uncertain");
    assert.equal(existsSync(snapshot), false); assert.equal(existsSync(control), false); assert.equal(existsSync(input), true);
    assert.equal(existsSync(liveSnapshot), false); assert.equal(existsSync(liveControl), false);
    assert.equal(recovered.admit(receipt.job, "same", AI_TASK.plugin).fresh, false);
    assert.equal(recovered.getAi(id)!.status, "uncertain");
  } finally { await restarted.close(); recovered.close(); }
});
