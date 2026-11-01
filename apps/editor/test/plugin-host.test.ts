import assert from "node:assert/strict";
import fs, { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "node:http";
import { createPluginHost } from "../server/plugin-host.ts";
import { handleDocumentRequest } from "../server/document-api.ts";
import { listenForFetch } from "@litzio/plugin-api/testing";
import { randomUUID } from "node:crypto";
import { RootAccess, FileAccessError } from "../server/file-access.ts";

test("installed Docling corrections preserve a long conversion folder under a Windows 8.3 allowed Root", { skip: process.platform !== "win32" }, async t => {
  const base = mkdtempSync(path.join(tmpdir(), "plugin-host-short-root-"));
  let host: ReturnType<typeof createPluginHost> | undefined;
  t.after(async () => { await host?.close(); rmSync(base, { recursive: true, force: true }); });
  const allowed = path.join(base, "LongAllowedRoot"), outside = path.join(base, "LongAllowedRoot-outside");
  fs.mkdirSync(allowed); fs.mkdirSync(outside);
  const folder = path.join(allowed, "LongConversionFolder");
  fs.cpSync(fileURLToPath(new URL("../../../plugins/docling/test/fixtures/nist-sp1108r4/", import.meta.url)), folder, { recursive: true });
  const shortRoot = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "(New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:LITZIO_TEST_ALLOWED_ROOT).ShortPath"],
  { encoding: "utf8", windowsHide: true, env: { ...process.env, LITZIO_TEST_ALLOWED_ROOT: allowed } }).trim();
  if (path.basename(shortRoot).toLowerCase() === path.basename(allowed).toLowerCase()) {
    t.skip("The temporary filesystem does not provide an 8.3 Root alias"); return;
  }
  const access = new RootAccess([shortRoot]), canonicalRoot = fs.realpathSync.native(allowed);
  const locator = path.join(shortRoot, "LongConversionFolder"), canonical = fs.realpathSync.native(folder);
  const read = (file: string) => fs.readFileSync(path.join(folder, file));
  const original = { source: read("document.json"), document: read("document.md"), map: read("document.docling-map.json") };
  host = createPluginHost(access, undefined, { directory: path.join(base, "plugins") });
  assert.equal(host.invoke("docling", "compare", { path: path.join(locator, "document.md") }).stale, false);
  assert.equal(host.invoke("docling", "apply-corrections", { folder: locator }).output, canonical);
  const heading = JSON.parse(original.source.toString("utf8")).texts.find((item: any) => item.label === "section_header" && item.content_layer === "body");
  const entry = { id: "short-root-heading", self_ref: heading.self_ref, operation: "heading", value: { level: 6 }, reason: "Installed Host Root regression", approvedAt: "2026-11-02T01:00:00Z" };
  assert.equal(host.invoke("docling", "add-correction", { folder: canonical, entry }).output, canonical);
  assert.equal(host.invoke("docling", "compare", { path: path.join(canonical, "document.md") }).stale, false);
  assert.equal(host.invoke("docling", "remove-correction", { folder: locator, id: entry.id }).output, canonical);
  assert.ok(fs.existsSync(folder), "native publication must preserve the original long folder name");
  assert.deepEqual(read("document.json"), original.source);
  assert.deepEqual(read("document.md"), original.document); assert.deepEqual(read("document.docling-map.json"), original.map);
  assert.deepEqual(fs.readdirSync(allowed), ["LongConversionFolder"]);

  // Generic Host callers keep their locator while the same pinned directory
  // admits canonical paths, creation parents and duplicate Root spellings.
  for (const root of [shortRoot, canonicalRoot]) {
    const document = path.join(root, "LongConversionFolder", "document.md");
    assert.equal(access.resolve(document), document);
    assert.equal(access.boundary(document), root);
    assert.equal(access.resolve(path.join(root, "new.md"), true), path.join(root, "new.md"));
  }
  assert.deepEqual(new RootAccess([shortRoot, canonicalRoot]).roots, [shortRoot]);
  const sentinel = path.join(outside, "private.md"); writeFileSync(sentinel, "Outside Root");
  assert.throws(() => host!.invoke("docling", "apply-corrections", { folder: outside }), FileAccessError);
  fs.symlinkSync(outside, path.join(allowed, "escape"), "junction");
  assert.throws(() => access.resolve(path.join(shortRoot, "escape", "private.md")), FileAccessError);
  assert.throws(() => access.resolve(path.join(canonicalRoot, "escape", "missing.md"), true), FileAccessError);
  assert.equal(fs.readFileSync(sentinel, "utf8"), "Outside Root");
  fs.renameSync(allowed, `${allowed}-moved`); fs.mkdirSync(allowed);
  assert.throws(() => access.resolve(path.join(canonicalRoot, "new.md"), true), /allowed folder changed or is unavailable/);
});

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
