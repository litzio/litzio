import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createServer } from "node:http";
import { listenForFetch } from "@litzio/plugin-api/testing";
import { handleDocumentRequest } from "../server/document-api.ts";
import { createPluginHost } from "../server/plugin-host.ts";

test("plugin inventory compares pinned and bundled revisions without replacing, and explicitly reregisters", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "plugin-inventory-"));
  const manifest = path.join(root, "manifest.json");
  const write = (version: string) => writeFileSync(manifest, JSON.stringify({ id: "example", version, workerApi: 1, entry: "worker.cjs" }));
  writeFileSync(path.join(root, "worker.cjs"), "process.exit(0)"); write("1.0.0");
  const host = createPluginHost(undefined, undefined, { directory: path.join(root, "store"), manifest, run: { checkoutRoot: root } });
  t.after(async () => { await host.close(); rmSync(root, { recursive: true, force: true }); });
  const server = createServer((req, res) => { void handleDocumentRequest(req, res, () => res.end(), undefined, 4096, undefined, undefined, host); });
  await listenForFetch(server);
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/worker-plugins`;
  const list = async () => (await (await fetch(url)).json()) as ReturnType<typeof host.inventory>;
  const original = host.plugins(true).list().find(item => item.id === "example")!;
  assert.equal(host.inventory().find(item => item.id === "example")!.bundledRevision, original.revision);
  writeFileSync(path.join(root, "worker.cjs"), "process.exit(1)");
  const changed = (await list()).find(item => item.id === "example")!;
  assert.equal(changed.version, original.version);
  assert.equal(changed.revision, original.revision);
  assert.notEqual(changed.bundledRevision, original.revision);
  assert.equal(changed.directory, original.directory);
  assert.ok(path.isAbsolute(changed.directory));
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bundled: "example" }) });
  assert.equal(response.status, 200);
  const restored = (await list()).find(item => item.id === "example")!;
  assert.equal(restored.revision, restored.bundledRevision);
  writeFileSync(manifest, JSON.stringify({ id: "external", version: "1.0.0", workerApi: 1, entry: "worker.cjs" }));
  host.plugins().register(manifest);
  const db = new DatabaseSync(path.join(root, "store/runtime.sqlite"));
  for (const item of host.plugins().list().filter(item => ["example", "external"].includes(item.id))) {
    db.prepare("UPDATE plugins SET value=? WHERE id=?").run(JSON.stringify({ ...item, version: "abcdef123456" }), item.id);
  }
  db.close();
  for (const id of ["example", "external"]) {
    const item = (await list()).find(item => item.id === id)!;
    assert.match(item.registrationError!, /manifest/);
    assert.equal(item.version, "abcdef123456"); // Inventory must not migrate data.
  }
  write("1.0.0");
  assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bundled: "example" }) })).status, 200);
  assert.equal((await list()).find(item => item.id === "example")!.registrationError, null);
  write("2.0.0");
  assert.equal(host.inventory().find(item => item.id === "external")!.bundledRevision, null);
  assert.throws(() => host.reregister("external"), /bundled/);
});
