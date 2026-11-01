import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import { listenForFetch } from "@litzio/plugin-api/testing";
import { buildAiAgent } from "../../../packages/cli/scripts/build-ai-agent.ts";
import { buildDoclingWorker } from "../../../packages/cli/scripts/build-docling-worker.ts";
import { structureReviewSource, structureReviewSuggestions } from "../../../plugins/docling/test/structure-review-fixture.ts";
import { bundledAiManifest, bundledPluginManifest, createPluginHost } from "../server/plugin-host.ts";
import { RootAccess } from "../server/file-access.ts";
import { handleDocumentRequest } from "../server/document-api.ts";

for (const ownerEnds of [false, true]) test(ownerEnds
  ? "a second Host cleans pre-receipt inputs only after owner loss, without PID reuse or replay"
  : "a second Host preserves another live Host's pending review admission and completes it", async t => {
  await buildDoclingWorker(path.dirname(bundledPluginManifest())); await buildAiAgent(path.dirname(bundledAiManifest()));
  const root = mkdtempSync(path.join(tmpdir(), "shared-docling-admission-")), directory = path.join(root, "plugins"), facade = path.join(root, "fake-agent");
  mkdirSync(facade);
  writeFileSync(path.join(facade, "host.cjs"), readFileSync(path.join(path.dirname(bundledAiManifest()), "host.cjs")));
  writeFileSync(path.join(facade, "worker.cjs"), `process.once("message", () => process.send({type:"complete",result:${JSON.stringify({ proposals: structureReviewSuggestions })}}, () => process.exit(0)));`);
  writeFileSync(path.join(facade, "manifest.json"), JSON.stringify({ id: "ai-agent", version: "shared-review-fixture", workerApi: 1, entry: "worker.cjs", services: ["ai-task"], tasks: ["ai-task"], host: { api: 1, entry: "host.cjs" } }));
  const options = { directory, aiManifest: path.join(facade, "manifest.json") };
  const owner = createPluginHost(new RootAccess([root]), undefined, options), observer = createPluginHost(new RootAccess([root]), undefined, options);
  t.after(async () => { await observer.close(); await owner.close(); rmSync(root, { recursive: true, force: true }); });
  const source = path.join(root, "source.json"), folder = path.join(root, "result"), original = structureReviewSource(), id = randomUUID();
  writeFileSync(source, original); owner.invoke("docling", "convert", { input: source, output: folder });
  const materialCount = () => readdirSync(folder).filter(name => name.startsWith(`.structure-review-${id}-`)).length;
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }), paused = new Promise<void>(resolve => { release = resolve; });
  const read = fsPromises.readFile;
  fsPromises.readFile = (async (...args: Parameters<typeof read>) => {
    if (String(args[0]).includes(`.structure-review-${id}-`)) { enter(); await paused; }
    return read(...args);
  }) as typeof read;
  syncBuiltinESMExports();
  const starting = owner.invoke<Promise<any>>("docling", "review-start", { folder, id }).then(value => ({ value, error: null }), error => ({ value: null, error }));
  let during: any, materials: number, unknown: any, ownerId: string, probeFailed = false, outcome: Awaited<typeof starting>;
  try {
    await entered;
    ownerId = JSON.parse(readFileSync(path.join(folder, "structure-review.json"), "utf8")).task.owner;
    const ownerFile = path.join(directory, "owners", `${ownerId}.sqlite`), stat = fs.statSync;
    const probe = t.mock.method(fs, "statSync", ((file, options) => {
      if (String(file) === ownerFile) { probeFailed = true; throw Object.assign(new Error("Injected owner probe EACCES"), { code: "EACCES" }); }
      return stat(file, options);
    }) as typeof stat);
    syncBuiltinESMExports();
    try { unknown = { view: observer.invoke("docling", "review-status", { folder }), materials: materialCount() }; }
    finally { probe.mock.restore(); syncBuiltinESMExports(); }
    if (ownerEnds) {
      await owner.close();
      // Both Hosts have this test process's PID. A distinct live session lock
      // must never revive the original owner's unlocked session.
      assert.notEqual(observer.plugins().requestOwner(), ownerId);
    }
    during = observer.invoke("docling", "review-status", { folder }); materials = materialCount();
  } finally { fsPromises.readFile = read; syncBuiltinESMExports(); release(); outcome = await starting; }
  assert.equal(probeFailed, true); assert.equal(unknown.view.task.status, "running"); assert.equal(unknown.materials, 3);
  if (ownerEnds) {
    assert.equal(during.task.status, "uncertain"); assert.equal(materials, 0); assert.ok(outcome.error);
    assert.equal(observer.plugins().getAi(id), null);
    assert.equal((await observer.invoke<Promise<any>>("docling", "review-start", { folder, id })).task.status, "uncertain");
    assert.equal(observer.plugins().aiHistory().length, 0);
    assert.equal(readFileSync(source, "utf8"), original);
    return;
  }
  assert.deepEqual({ status: during.task.status, materials, startError: outcome.error?.code ?? null },
    { status: "running", materials: 3, startError: null });
  assert.equal(during.canCancel, false);
  let done: any; const deadline = Date.now() + 10_000;
  do { done = observer.invoke("docling", "review-status", { folder }); if (done.task.status !== "running") break; assert.ok(Date.now() < deadline); await delay(10); } while (true);
  assert.equal(done.task.status, "success"); assert.equal(done.proposals.length, 3);
  assert.ok(done.proposals.every((p: any) => p.state === "pending")); assert.equal(materialCount(), 0);
  assert.equal(readFileSync(source, "utf8"), original);
});

test("installed Docling review uses the mediated service through HTTP operations, preserves source and respects Root/disable", async t => {
  await buildDoclingWorker(path.dirname(bundledPluginManifest())); await buildAiAgent(path.dirname(bundledAiManifest()));
  const root = mkdtempSync(path.join(tmpdir(), "installed-docling-review-")), directory = path.join(root, "plugins"), facade = path.join(root, "fake-agent");
  mkdirSync(facade);
  // Only execution is replaced. The installed B service, receipt store, process
  // lifetime and Docling consumer are real; no model or Docling server is called.
  writeFileSync(path.join(facade, "host.cjs"), readFileSync(path.join(path.dirname(bundledAiManifest()), "host.cjs")));
  writeFileSync(path.join(facade, "worker.cjs"), `process.once("message", () => process.send({type:"complete",result:${JSON.stringify({ proposals: structureReviewSuggestions })}}, () => process.exit(0)));`);
  writeFileSync(path.join(facade, "manifest.json"), JSON.stringify({ id: "ai-agent", version: "review-fixture", workerApi: 1, entry: "worker.cjs", services: ["ai-task"], tasks: ["ai-task"], host: { api: 1, entry: "host.cjs" } }));
  const host = createPluginHost(new RootAccess([root]), undefined, { directory, aiManifest: path.join(facade, "manifest.json") });
  const server = createServer((req, res) => { void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); }, new RootAccess([root]), 1_000_000, undefined, undefined, host); });
  await listenForFetch(server);
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); rmSync(root, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/plugin-operation`;
  async function invoke(operation: string, args: Record<string, unknown>) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plugin: "docling", operation, args }) });
    const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return value;
  }
  const source = path.join(root, "source.json"), folder = path.join(root, "result"), original = structureReviewSource(); writeFileSync(source, original);
  await invoke("convert", { input: source, output: folder });
  const id = randomUUID(); await invoke("review-start", { folder, id });
  let result: any;
  const deadline = Date.now() + 10_000;
  do { result = await invoke("review-status", { folder }); if (result.task.status !== "running") break; assert.ok(Date.now() < deadline, "review worker must finish"); await delay(10); } while (true);
  assert.equal(result.task.status, "success"); assert.ok(result.proposals.every((p: any) => p.state === "pending"));
  const before = host.plugins().aiHistory().length;
  await invoke("review-start", { folder, id }); assert.equal(host.plugins().aiHistory().length, before, "UUID replay must not execute again");
  await invoke("review-approve", { folder, id: result.proposals[0].id });
  assert.equal(host.invoke("docling", "compare", { path: path.join(folder, "document.md") }).stale, false);
  const ledger = JSON.parse(readFileSync(path.join(folder, "corrections.json"), "utf8"));
  assert.deepEqual(JSON.parse(ledger.entries[0].aiEvidence), structureReviewSuggestions[0].evidence);
  await invoke("review-undo", { folder, id: result.proposals[0].id });
  await invoke("review-reject", { folder, id: result.proposals[1].id });
  host.plugins().unregister("ai-agent");
  assert.equal((await invoke("review-start", { folder, id: randomUUID() })).available, false);
  assert.equal(readFileSync(source, "utf8"), original);
  for (const receipt of host.plugins().aiHistory()) for (const temporary of Object.values(host.plugins().getAi(receipt.job.id)!.temporary!)) assert.equal(existsSync(temporary), false);
  // Terminal proposals belong to their file, not to B's old temporary material locators.
  const moved = path.join(root, "moved-result");
  renameSync(folder, moved);
  assert.equal((await invoke("review-proposals", { folder: moved })).proposals[1].state, "rejected");
  assert.equal((await invoke("review-cancel", { folder: moved })).task.status, "success");
  assert.throws(() => host.invoke("docling", "review-proposals", { folder: path.dirname(root) }), /allowed|outside/i);
});
