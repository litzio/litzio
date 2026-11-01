import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { listenForFetch } from "@litzio/plugin-api/testing";
import { buildAiAgent } from "../../../packages/cli/scripts/build-ai-agent.ts";
import { buildDoclingWorker } from "../../../packages/cli/scripts/build-docling-worker.ts";
import { structureReviewSource, structureReviewSuggestions } from "../../../plugins/docling/test/structure-review-fixture.ts";
import { bundledAiManifest, bundledPluginManifest, createPluginHost } from "../server/plugin-host.ts";
import { RootAccess } from "../server/file-access.ts";
import { handleDocumentRequest } from "../server/document-api.ts";

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
