import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "node:http";
import { createPluginHost } from "../server/plugin-host.ts";
import { handleDocumentRequest } from "../server/document-api.ts";
import { listenForFetch } from "@litzio/plugin-api/testing";
import { randomUUID } from "node:crypto";

test("headless Host operations use the installed plugin through local and HTTP calls, validate entry/API and respect disable", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "plugin-host-")), manifest = path.join(root, "manifest.json");
  writeFileSync(path.join(root, "worker.cjs"), "process.exit(0)");
  writeFileSync(path.join(root, "host.cjs"), `exports.activate = host => ({ routes: { '/api/echo': { GET: 'echo' } }, operations: {
    echo: args => ({ ...args, count: host.session.get('count') || 0 }),
    increment: () => { host.session.set('count', (host.session.get('count') || 0) + 1); return host.session.get('count'); }
  } });`);
  const description = { id: "echo", version: "1", workerApi: 1, entry: "worker.cjs", host: { api: 1, entry: "host.cjs" }, routes: ["/api/echo"] };
  writeFileSync(manifest, JSON.stringify(description));
  const host = createPluginHost(undefined, undefined, { directory: path.join(root, "installed"), manifest });
  const server = createServer((req, res) => { void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); }, undefined, 4096, undefined, undefined, host); });
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); rmSync(root, { recursive: true, force: true }); });
  await listenForFetch(server);
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  assert.deepEqual(host.invoke("echo", "echo", { message: "local" }), { message: "local", count: 0 });
  const response = await fetch(url + "/api/plugin-operation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plugin: "echo", operation: "increment" }) });
  assert.equal(response.status, 200); assert.equal(await response.json(), 1);
  assert.deepEqual(await (await fetch(url + "/api/echo?message=http")).json(), { message: "http", count: 1 });
  assert.throws(() => host.invoke("echo", "toString"), /Unknown/u);
  writeFileSync(manifest, JSON.stringify({ ...description, version: "2" })); host.plugins().register(manifest);
  assert.equal(host.invoke("echo", "echo").count, 1, "plugin transient state survives a new activation");
  const job = { id: randomUUID(), input: "input.pdf", output: "output", startedAt: Date.now(), state: "running" as const, progress: { phase: "checking" as const } };
  host.plugins().admit(job, "same-input", "echo");
  assert.throws(() => host.plugins().admit(job, "same-input", "another-plugin"), /conflicts/u, "a UUID cannot alias another plugin's work");
  host.plugins().unregister("echo"); assert.throws(() => host.invoke("echo", "increment"), /disabled/u);
  const installed = host.plugins().register(manifest);
  writeFileSync(path.join(installed.directory, "host.cjs"), "tampered");
  const fresh = createPluginHost(undefined, undefined, { directory: path.join(root, "installed"), manifest });
  try { assert.throws(() => fresh.invoke("echo", "echo"), /hash mismatch/u); } finally { await fresh.close(); }
  writeFileSync(manifest, JSON.stringify({ ...description, host: { api: 2, entry: "host.cjs" } }));
  assert.throws(() => host.plugins().register(manifest), /incompatible/iu);
  await host.close(); assert.throws(() => host.invoke("echo", "echo"), /closing/u);
});
