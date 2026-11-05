import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDocument, serialize } from "@litzio/core";
import { executeViewOperation, folderStatistics, STATISTICS_PLUGIN_ID } from "../server/views.ts";
import { RootAccess } from "../server/file-access.ts";
import { startHttpHost } from "../server/http-host.ts";
import { startFetchServer } from "../../../test/helpers/fetch-server.ts";
import { viewCli } from "../../../packages/cli/src/views.ts";
import { DAEMON_PROTOCOL } from "../shared/daemon-version.ts";
import { nativeSource } from "./helpers/document.ts";

const view = { kind: "litzio-view", schemaVersion: 1, catalog: "litzio-v1", title: "Statistics", refresh: "manual", sources: { stats: { operation: "folder.statistics", version: 1, args: {} } }, layout: { component: "VerticalPanel", children: [{ component: "Table", title: "Documents", source: "stats", data: "/rows", columns: ["folder", "documents"] }] } };
test("Host favourites create exclusively, open definition without reading root, and run current data", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-views-"));
  const root = path.join(dir, "documents"), directory = path.join(dir, "data");
  fs.mkdirSync(root); fs.writeFileSync(path.join(root, "one.md"), serialize(createDocument()));
  fs.writeFileSync(path.join(root, "plain.md"), "# ordinary Markdown");
  const scope = { access: new RootAccess([root]), directory };
  const invoke = (input: unknown) => executeViewOperation(input, scope);
  const plugin = STATISTICS_PLUGIN_ID;
  try {
    assert.equal(invoke({ action: "validate", view }).receipt.outcome, "success");
    assert.equal(invoke({ action: "save", plugin, name: "Documents", view }).receipt.outcome, "success");
    assert.equal(invoke({ action: "save", plugin, name: "Documents", view }).receipt.outcome, "failure");
    assert.equal(invoke({ action: "save", plugin, name: "documents", view }).receipt.outcome, "failure");
    const saved = fs.readFileSync(path.join(directory, plugin, "views", "Documents.view.json"), "utf8");
    assert.ok(!saved.includes(root)); assert.ok(!saved.includes('"rows"'));
    assert.deepEqual(invoke({ action: "list", plugin }).favourites, ["Documents"]);
    // No document root exists while reopening. Opening still succeeds and never returns rows.
    fs.renameSync(root, `${root}-away`);
    const opened = invoke({ action: "open", plugin, name: "Documents" });
    assert.equal(opened.receipt.outcome, "success"); assert.ok(opened.view); assert.ok(!("rows" in opened));
    fs.renameSync(`${root}-away`, root);
    const running = { ...scope, access: new RootAccess([root]) };
    const first = executeViewOperation({ action: "run", root, view: opened.view }, running);
    assert.equal(first.receipt.outcome, "success"); assert.ok("rows" in first); assert.equal(first.rows?.[0].documents, 1);
    fs.writeFileSync(path.join(root, "two.md"), serialize(createDocument()));
    const second = executeViewOperation({ action: "run", root, view: opened.view }, running);
    assert.ok("rows" in second); assert.equal(second.rows?.[0].documents, 2);
    const savedRun = executeViewOperation({ action: "run", root, plugin, name: "Documents" }, running);
    assert.ok("rows" in savedRun); assert.deepEqual(savedRun.rows, second.rows);
    assert.equal(fs.readFileSync(path.join(directory, plugin, "views", "Documents.view.json"), "utf8"), saved);
    for (const name of ["../escape", "CON", "/absolute", "bad."]) assert.equal(invoke({ action: "save", plugin, name, view }).receipt.outcome, "failure");
    assert.equal(invoke({ action: "save", plugin: "other", name: "Other", view }).receipt.outcome, "failure");
    assert.equal(executeViewOperation({ action: "run", root: directory, view }, running).receipt.outcome, "failure");
    const invalid = structuredClone(view); invalid.sources.stats.args = { folder: "../outside" };
    assert.equal(executeViewOperation({ action: "run", root, view: invalid }, running).receipt.outcome, "failure");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("statistics enforce folder boundary and fail malformed native documents without empty success", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-statistics-"));
  try {
    fs.mkdirSync(path.join(dir, "a")); fs.mkdirSync(path.join(dir, ".hidden"));
    fs.writeFileSync(path.join(dir, "a", "doc.md"), nativeSource("# Heading\n\n## Second\n\nText.\n"));
    fs.writeFileSync(path.join(dir, ".hidden", "doc.md"), serialize(createDocument()));
    const scope = new RootAccess([dir]);
    assert.deepEqual(folderStatistics(dir, "a", scope).map(row => [row.folder, row.documents]), [["a", 1]]);
    assert.equal(folderStatistics(dir, "a", scope)[0].headings, 2);
    assert.throws(() => folderStatistics(dir, "..", scope));
    fs.writeFileSync(path.join(dir, "a", "doc.md"), Buffer.from([0xff]));
    assert.throws(() => folderStatistics(dir, "a", scope), /UTF-8/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("favourite list preserves I/O errors instead of empty success", context => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-views-io-"));
  context.mock.method(fs, "readdirSync", () => { throw Object.assign(new Error("Access denied"), { code: "EACCES" }); });
  try {
    const result = executeViewOperation({ action: "list", plugin: STATISTICS_PLUGIN_ID }, { access: null, directory });
    assert.equal(result.receipt.outcome, "failure"); assert.ok(result.error);
  } finally { context.mock.restoreAll(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test("HTTP and CLI run return identical aggregated data, target and receipt semantics", async context => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-view-http-"));
  const previous = process.env.LITZIO_DATA_DIR;
  process.env.LITZIO_DATA_DIR = path.join(dir, "state");
  fs.mkdirSync(path.join(dir, "editor")); fs.writeFileSync(path.join(dir, "editor", "index.html"), "<!doctype html>");
  const root = path.join(dir, "root"); fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "doc.md"), serialize(createDocument()));
  const spec: any = structuredClone(view);
  Object.assign(spec.sources.stats, { groupBy: { field: "modified", interval: "month" }, aggregate: { op: "sum", field: "documents" } });
  spec.layout.children[0].columns = ["group", "value"];
  const file = path.join(dir, "input.view.json"); fs.writeFileSync(file, JSON.stringify(spec));
  const host = await startFetchServer(() => startHttpHost({ roots: [root], editorDir: path.join(dir, "editor"), port: 0, daemon: { health: { pid: process.pid, startedAt: new Date().toISOString(), instanceId: "view-test", launcher: "cli-run", productVersion: "test", protocolVersion: DAEMON_PROTOCOL, processStartedAt: "test", daemonHome: dir, executable: process.execPath, roots: [root], nonLoopback: false }, stop() {} } }));
  try {
    const response = await fetch(`${host.url}/api/views`, { method: "POST", headers: { Origin: host.url, "Content-Type": "application/json" }, body: JSON.stringify({ action: "run", root, view: spec }) });
    assert.equal(response.status, 200);
    const http = await response.json();
    let output = "";
    context.mock.method(process.stdout, "write", (chunk: string) => { output += chunk; return true; });
    let code: number;
    try { code = await viewCli(["run", file, "--root", root, "--host", host.url, "--json"]); }
    finally { context.mock.restoreAll(); }
    assert.equal(code, 0, output);
    const cli = JSON.parse(output);
    assert.deepEqual(cli.rows, http.rows);
    assert.deepEqual(cli.target, http.target);
    for (const key of ["operation", "version", "scope", "outcome"]) assert.equal(cli.receipt[key], http.receipt[key]);
    assert.equal(cli.host, host.url);
    assert.notEqual(cli.receipt.requestId, http.receipt.requestId);
    fs.writeFileSync(file, JSON.stringify({ ...spec, schemaVersion: 99 }));
    output = "";
    context.mock.method(process.stdout, "write", (chunk: string) => { output += chunk; return true; });
    try { code = await viewCli(["validate", file, "--host", host.url, "--json"]); }
    finally { context.mock.restoreAll(); }
    assert.equal(code, 1);
    const invalid = JSON.parse(output);
    assert.equal(invalid.receipt.operation, "view.validate");
    assert.equal(invalid.receipt.outcome, "failure");
    assert.ok(invalid.error);
  } finally {
    await host.close();
    if (previous === undefined) delete process.env.LITZIO_DATA_DIR; else process.env.LITZIO_DATA_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
