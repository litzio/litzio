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

const view = { kind: "litzio-view", schemaVersion: 2, catalog: "litzio-v2", profile: "query", owner: "litzio.statistics", title: "Statistics", refresh: "manual", sources: { stats: { kind: "operation", operation: "folder.statistics", version: 1, args: {} } }, layout: { component: "Panel", direction: "vertical", children: [{ component: "Table", title: "Documents", source: "stats", data: "/rows", columns: ["folder", "documents"] }] } };
const assistantView = { ...view, owner: "litzio.assistant", title: "예시: 합계 snapshot", refresh: "assistant", sources: { stats: {
  kind: "assistant", generatedAt: "2026-11-06T00:00:00.000Z", rowSchema: { total: { type: "number", label: "합계" } }, rows: [{ total: 300 }],
  provenance: [{ kind: "reference", label: "예시: 합산 자료", refId: "reference-a" }], method: "두 문서 값을 합산했다.",
} }, layout: { component: "Panel", direction: "vertical", children: [{ component: "Table", title: "예시: 합계", source: "stats", data: "/rows", columns: ["total"] }] } };
test("proposal scope fixes owner and checks supplied provenance without certifying content", async () => {
  const scope = { access: null, proposal: { owner: "litzio.assistant", provenance: assistantView.sources.stats.provenance as import("@litzio/core/views-v2").ViewProvenance[] } };
  const invoke = (value: unknown) => executeViewOperation({ action: "propose", view: value }, scope);
  const checked = await invoke(assistantView);
  assert.ok("provenanceStatus" in checked); assert.equal(checked.provenanceStatus, "verified");
  const unchecked = await executeViewOperation({ action: "propose", view: assistantView }, { access: scope.access });
  assert.ok("provenanceStatus" in unchecked); assert.equal(unchecked.provenanceStatus, "unverified");
  const wrong = structuredClone(assistantView); wrong.sources.stats.provenance[0].refId = "not-supplied";
  assert.equal((await invoke(wrong)).receipt.outcome, "failure");
  assert.equal((await invoke({ ...assistantView, owner: "litzio.statistics" })).code, "owner-mismatch");
  assert.equal((await invoke({ ...view, owner: "litzio.assistant" })).code, "owner-mismatch");
  assert.equal((await executeViewOperation({ action: "propose", view: assistantView, proposal: scope.proposal }, scope)).receipt.outcome, "failure");
  assert.equal((await executeViewOperation({ action: "run", view: assistantView, input: {} }, scope)).receipt.outcome, "failure");
  assert.equal((await executeViewOperation({ action: "run", view }, scope)).receipt.outcome, "failure");
});
test("Host favourites create exclusively, open definition without reading root, and run current data", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-views-"));
  const root = path.join(dir, "documents"), directory = path.join(dir, "data");
  fs.mkdirSync(root); fs.writeFileSync(path.join(root, "one.md"), serialize(createDocument()));
  fs.writeFileSync(path.join(root, "plain.md"), "# ordinary Markdown");
  const scope = { access: new RootAccess([root]), directory };
  const invoke = (input: unknown) => executeViewOperation(input, scope);
  const plugin = STATISTICS_PLUGIN_ID;
  try {
    assert.equal((await invoke({ action: "validate", view })).receipt.outcome, "success");
    assert.equal((await invoke({ action: "save", plugin, name: "Documents", view })).receipt.outcome, "success");
    assert.equal((await invoke({ action: "save", plugin, name: "Documents", view })).receipt.outcome, "failure");
    assert.equal((await invoke({ action: "save", plugin, name: "documents", view })).receipt.outcome, "failure");
    const saved = fs.readFileSync(path.join(directory, plugin, "views", "Documents.view.json"), "utf8");
    assert.ok(!saved.includes(root)); assert.ok(!saved.includes('"rows"'));
    assert.deepEqual((await invoke({ action: "list", plugin })).favourites, ["Documents"]);
    // No document root exists while reopening. Opening still succeeds and never returns rows.
    fs.renameSync(root, `${root}-away`);
    const opened = (await invoke({ action: "open", plugin, name: "Documents" }));
    assert.equal(opened.receipt.outcome, "success"); assert.ok("view" in opened); assert.ok(opened.view); assert.ok(!("rows" in opened));
    fs.renameSync(`${root}-away`, root);
    const running = { ...scope, access: new RootAccess([root]) };
    const first = (await executeViewOperation({ action: "run", root, view: opened.view }, running));
    assert.equal(first.receipt.outcome, "success"); assert.ok("rows" in first); assert.equal(first.rows?.[0].documents, 1);
    fs.writeFileSync(path.join(root, "two.md"), serialize(createDocument()));
    const second = (await executeViewOperation({ action: "run", root, view: opened.view }, running));
    assert.ok("rows" in second); assert.equal(second.rows?.[0].documents, 2);
    const savedRun = (await executeViewOperation({ action: "run", root, plugin, name: "Documents" }, running));
    assert.ok("rows" in savedRun); assert.deepEqual(savedRun.rows, second.rows);
    assert.equal(fs.readFileSync(path.join(directory, plugin, "views", "Documents.view.json"), "utf8"), saved);
    for (const name of ["../escape", "CON", "/absolute", "bad."]) assert.equal((await invoke({ action: "save", plugin, name, view })).receipt.outcome, "failure");
    assert.equal((await invoke({ action: "save", plugin: "other", name: "Other", view })).receipt.outcome, "failure");
    assert.equal((await executeViewOperation({ action: "run", root: directory, view }, running)).receipt.outcome, "failure");
    const invalid = structuredClone(view); invalid.sources.stats.args = { folder: "../outside" };
    assert.equal((await executeViewOperation({ action: "run", root, view: invalid }, running)).receipt.outcome, "failure");
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

test("favourite list preserves I/O errors instead of empty success", async context => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-views-io-"));
  context.mock.method(fs, "readdirSync", () => { throw Object.assign(new Error("Access denied"), { code: "EACCES" }); });
  try {
    const result = (await executeViewOperation({ action: "list", plugin: STATISTICS_PLUGIN_ID }, { access: null, directory }));
    assert.equal(result.receipt.outcome, "failure"); assert.ok(result.error);
  } finally { context.mock.restoreAll(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test("HTTP and CLI share v2 inputs, saved namespaces, manual queries, availability and error receipts", async context => {
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
    // A broken assistant settings file must not block execution on plugin/view requests.
    fs.mkdirSync(path.join(dir, "state"), { recursive: true });
    fs.writeFileSync(path.join(dir, "state", "assistant.json"), "invalid JSON");
    const manage = async (input: unknown) => {
      const response = await fetch(`${host.url}/api/plugins`, { method: "POST", headers: { Origin: host.url, "Content-Type": "application/json" }, body: JSON.stringify(input) });
      assert.equal(response.status, 200, await response.clone().text());
      return response.json();
    };
    const id = "local.independent", directory = path.join(root, "plugin");
    await manage({ action: "scaffold", directory, id });
    await manage({ action: "register", directory });
    const { plugins } = await (await fetch(`${host.url}/api/plugins`)).json();
    await manage({ action: "trust", id, digest: plugins.find((p: any) => p.id === id).digest });
    await manage({ action: "enable", id });
    assert.deepEqual((await manage({ action: "invoke", operation: `${id}.greet`, input: { name: "World" } })).result, { greeting: "Hello, World!" });
    const unavailable = await fetch(`${host.url}/api/assistant/settings`);
    assert.ok(unavailable.status >= 400);
    assert.deepEqual((await manage({ action: "invoke", operation: `${id}.greet`, input: { name: "World" } })).result, { greeting: "Hello, World!" });
    // Representative Jira-style preset goes through a real plugin child and both transports.
    const jira = "fixture.jira", artifact = path.join(root, "jira");
    await manage({ action: "scaffold", directory: artifact, id: jira });
    const manifestFile = path.join(artifact, "litzio-plugin.json");
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    const presets = ["assigned-open", "reported-open", "assigned-all", "reported-all", "recent", "all"];
    const rowSchema = Object.fromEntries(["key", "summary", "status", "assignee", "updated"].map(key => [key, { type: "string", label: key }]));
    const jiraView = { ...structuredClone(view), owner: jira, title: "My issues", sources: { stats: { kind: "operation", operation: `${jira}.search`, version: 1, args: { preset: presets[0], text: "old" } } },
      form: { component: "InputForm", source: "stats", fields: [{ component: "Select", field: "preset" }, { component: "TextInput", field: "text" }], submit: { component: "SubmitButton", label: "Search" } },
      layout: { component: "Panel", direction: "vertical", children: [{ component: "Table", title: "Issues", source: "stats", data: "/rows", columns: Object.keys(rowSchema) }] } };
    manifest.contributes.operations = [{ id: "search", version: 1, effect: "read", scope: "host", rowSchema,
      inputSchema: { type: "object", properties: { preset: { type: "string", enum: presets }, text: { type: "string", minLength: 2, pattern: "^[A-Za-z]+$" }, credential: { type: "string", writeOnly: true } }, required: ["preset"], additionalProperties: false },
      outputSchema: { type: "array", items: { type: "object" } } }];
    // SDK-valid runtime schema, intentionally unsupported for persisted view input.
    manifest.contributes.operations.push({ ...manifest.contributes.operations[0], id: "advanced", inputSchema: {
      type: "object", properties: { term: { anyOf: [{ type: "string" }, { type: "number" }] } }, additionalProperties: false,
    } });
    manifest.contributes.views = [{ id: "issues", title: "My issues", definition: jiraView }];
    manifest.contributes.screens = [{ id: "dashboard", title: "예시: Issues", icon: "Table", defaultViewIds: ["issues"], primary: true }];
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    fs.writeFileSync(path.join(artifact, "host.js"), `export function activate() { return {
      operations: { advanced: () => [], search: ({preset, text}) => { if(text === "fail") throw Object.assign(new Error("PRIVATE SERVICE BODY"), {kind:"auth"}); return [{key:"MOCK-1",summary:preset,status:"Open",assignee:text ?? "me",updated:"2026-11-06"}]; } },
      status: () => ({available:true,message:"Ready",folders:[],decorations:[],accounts:[]}), dispose() {} }; }`);
    await manage({ action: "register", directory: artifact });
    const records = await (await fetch(`${host.url}/api/plugins`)).json();
    await manage({ action: "trust", id: jira, digest: records.plugins.find((p: any) => p.id === jira).digest });
    await manage({ action: "enable", id: jira });
    const request = async (input: unknown) => (await fetch(`${host.url}/api/views`, { method: "POST", headers: { Origin: host.url, "Content-Type": "application/json" }, body: JSON.stringify(input) })).json();
    const cliRequest = async (args: string[], expected = 0) => {
      let output = "";
      context.mock.method(process.stdout, "write", (chunk: string) => { output += chunk; return true; });
      try { assert.equal(await viewCli([...args, "--host", host.url, "--json"]), expected, output); }
      finally { context.mock.restoreAll(); }
      return JSON.parse(output);
    };
    const parity = (http: any, cli: any) => {
      const { receipt: a, ...h } = http, { receipt: b, host: _, ...c } = cli;
      assert.deepEqual(c, h);
      for (const key of ["operation", "version", "scope", "outcome"]) assert.equal(a[key], b[key]);
    };
    const jiraFile = path.join(dir, "jira.view.json"), inputFile = path.join(dir, "args.json");
    fs.writeFileSync(jiraFile, JSON.stringify(jiraView));
    fs.writeFileSync(inputFile, JSON.stringify({ preset: "reported-open" }));
    const catalog = await request({ action: "catalog" });
    assert.equal(catalog.receipt.outcome, "success");
    assert.ok(catalog.catalog.schema); assert.equal("columns" in catalog.catalog.limits, false);
    assert.ok(!("operations" in catalog)); // One response contract: catalog.operations.
    assert.ok(catalog.catalog.operations.some((op: any) => op.operation === "folder.statistics"));
    assert.ok(catalog.catalog.operations.some((op: any) => op.operation === `${jira}.search` && op.plugin === jira));
    assert.ok(!catalog.catalog.operations.some((op: any) => op.operation === `${jira}.advanced`));
    // The excluded operation remains available through ordinary runtime invocation.
    assert.deepEqual((await manage({ action: "invoke", operation: `${jira}.advanced`, input: { term: 1 } })).result, []);
    assert.equal(catalog.views.find((v: any) => v.plugin === jira).definition.layout.children[0].columns.length, 5);
    parity(catalog, await cliRequest(["catalog"]));
    parity(await request({ action: "propose", view: jiraView }), await cliRequest(["propose", jiraFile]));
    // Reuse this Host/child to cover transport/storage integration rather than another subprocess.
    const snapshot = structuredClone(assistantView);
    snapshot.owner = jira;
    const snapshotFile = path.join(dir, "snapshot.view.json");
    fs.writeFileSync(snapshotFile, JSON.stringify(snapshot));
    assert.deepEqual((await request({ action: "catalog" })).screens, [{ plugin: jira, jobs: [], ...manifest.contributes.screens[0] }]);
    parity(await request({ action: "propose", view: snapshot, plugin: jira }), await cliRequest(["propose", snapshotFile, "--plugin", jira]));
    assert.equal((await request({ action: "save", view: snapshot, plugin: jira, name: "snapshot" })).receipt.outcome, "success");
    assert.equal((await cliRequest(["save", snapshotFile, "--plugin", jira, "--name", "snapshot-cli"])).receipt.outcome, "success");
    // Save uses current unqueried input, replacing rather than merging old text.
    const saved = await cliRequest(["save", jiraFile, "--plugin", jira, "--name", "issues", "--input", inputFile]);
    assert.equal(saved.plugin, jira);
    const opened = await request({ action: "open", plugin: jira, name: "issues" });
    parity(opened, await cliRequest(["open", "issues", "--plugin", jira]));
    assert.deepEqual(opened.view.sources.stats.args, { preset: "reported-open" });
    assert.ok(!("rows" in opened));
    parity(await request({ action: "list", plugin: jira }), await cliRequest(["list", "--plugin", jira]));
    const run = await request({ action: "run", plugin: jira, name: "issues" });
    parity(run, await cliRequest(["run", "--name", "issues", "--plugin", jira]));
    assert.equal(run.receipt.scope, "host");
    assert.ok(!("target" in run));
    assert.deepEqual(run.args, { preset: "reported-open" });
    assert.equal(run.rows[0].summary, "reported-open"); assert.equal(run.rows[0].assignee, "me");
    parity(await request({ action: "run", view: jiraView, input: { preset: "reported-open" } }), await cliRequest(["run", jiraFile, "--input", inputFile]));
    const favouriteFile = path.join(dir, "state", "plugins", jira, "views", "issues.view.json");
    const preserved = fs.readFileSync(favouriteFile, "utf8");
    const secondSave = await request({ action: "save", view: jiraView, name: "http", input: { preset: "reported-open" } });
    assert.equal(secondSave.revision, saved.revision);
    assert.equal((await request({ action: "save", view: jiraView, name: "issues" })).receipt.outcome, "failure");
    assert.equal((await request({ action: "save", view: jiraView, plugin: STATISTICS_PLUGIN_ID, name: "wrong" })).receipt.outcome, "failure");
    assert.equal((await request({ action: "save", view: jiraView, name: "secret", input: { preset: "all", credential: "PRIVATE" } })).receipt.outcome, "failure");
    fs.writeFileSync(inputFile, JSON.stringify({ preset: "all", text: "fail" }));
    const failed = await request({ action: "run", view: jiraView, root, input: { preset: "all", text: "fail" } });
    const failedCli = await cliRequest(["run", jiraFile, "--input", inputFile, "--root", root], 1);
    assert.equal(failedCli.errorKind, failed.errorKind); assert.equal(failed.errorKind, "auth");
    assert.equal(failedCli.error, failed.error); assert.ok(!JSON.stringify(failed).includes("PRIVATE"));
    for (const [args, keyword, field] of [
      [{ preset: "all", text: "x" }, "minLength", "/text"],
      [{ preset: "all", text: "PRIVATE-123" }, "pattern", "/text"],
      [{ preset: "INVALID-PRIVATE" }, "enum", "/preset"],
      [{ preset: "all", credential: "PRIVATE" }, "secret", undefined],
      [[], "type", undefined],
    ] as const) {
      fs.writeFileSync(inputFile, JSON.stringify(args));
      const rejected = await request({ action: "run", view: jiraView, root, input: args });
      assert.equal(rejected.code, "invalid-input"); assert.ok(!("errorKind" in rejected));
      assert.ok(rejected.inputIssues.some((issue: any) => issue.keyword === keyword && issue.field === field));
      assert.ok(!JSON.stringify(rejected).includes("PRIVATE"));
      parity(rejected, await cliRequest(["run", jiraFile, "--input", inputFile, "--root", root], 1));
    }
    assert.ok(!("inputIssues" in failed)); // Source errors retain only #1233 classification.
    const incomplete = structuredClone(jiraView); incomplete.sources.stats.args = {} as any;
    const needs = await request({ action: "propose", view: incomplete });
    assert.equal(needs.inputState.state, "needs-input");
    assert.equal((await request({ action: "save", view: incomplete, name: "incomplete" })).receipt.outcome, "success");
    assert.equal((await request({ action: "open", plugin: jira, name: "incomplete" })).inputState.state, "needs-input");
    assert.equal((await request({ action: "run", plugin: jira, name: "incomplete", root, input: { preset: "all" } })).receipt.outcome, "success");
    const missingInput = await request({ action: "run", view: incomplete, root });
    assert.equal(missingInput.code, "invalid-input");
    assert.deepEqual(missingInput.inputIssues, [{ field: "/preset", keyword: "required" }]);
    await manage({ action: "disable", id: jira });
    parity(await request({ action: "open", plugin: jira, name: "issues" }), await cliRequest(["open", "issues", "--plugin", jira], 1));
    assert.equal((await request({ action: "run", plugin: jira, name: "issues", root })).code, "unavailable");
    assert.ok(!(await request({ action: "catalog" })).views.some((v: any) => v.plugin === jira));
    // Keep version 1, but remove a previously bound column. The stored file must
    // be reported unavailable (with new-view advice), not as a generic bad request.
    delete manifest.contributes.operations[0].rowSchema.updated;
    manifest.contributes.views[0].definition.layout.children[0].columns = ["key", "summary", "status", "assignee"];
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    await manage({ action: "register", directory: artifact });
    const removed = await (await fetch(`${host.url}/api/plugins`)).json();
    await manage({ action: "trust", id: jira, digest: removed.plugins.find((p: any) => p.id === jira).digest });
    await manage({ action: "enable", id: jira });
    const missingColumn = await request({ action: "open", plugin: jira, name: "issues" });
    assert.equal(missingColumn.code, "unavailable"); assert.match(missingColumn.error, /Create a new view/);
    parity(missingColumn, await cliRequest(["open", "issues", "--plugin", jira], 1));
    assert.equal((await request({ action: "run", plugin: jira, name: "issues", root })).code, "unavailable");
    assert.equal(fs.readFileSync(favouriteFile, "utf8"), preserved);
    await manage({ action: "disable", id: jira });
    assert.deepEqual((await request({ action: "catalog" })).screens, []);
    const reopenedSnapshot = await request({ action: "open", plugin: jira, name: "snapshot" });
    assert.equal(reopenedSnapshot.receipt.outcome, "success");
    assert.equal(reopenedSnapshot.provenanceStatus, "unverified");
    const storedRun = await request({ action: "run", plugin: jira, name: "snapshot" });
    assert.deepEqual(storedRun.rows, snapshot.sources.stats.rows);
    assert.deepEqual(storedRun.provenance, snapshot.sources.stats.provenance);
    parity(storedRun, await cliRequest(["run", "--name", "snapshot", "--plugin", jira]));
    // More than the former 64 KiB HTTP cap, while remaining below the full canonical limit.
    const large = structuredClone(assistantView);
    large.sources.stats.rows = Array.from({ length: 8000 }, (_, total) => ({ total }));
    fs.writeFileSync(snapshotFile, JSON.stringify(large));
    parity(await request({ action: "propose", view: large }), await cliRequest(["propose", snapshotFile]));
    const small = JSON.stringify(assistantView);
    const rawView = small.slice(0, 1) + " ".repeat(1048577 - Buffer.byteLength(small)) + small.slice(1);
    fs.writeFileSync(snapshotFile, rawView);
    assert.equal((await cliRequest(["propose", snapshotFile], 1)).outcome, "failure");
    const rawProposal = await fetch(`${host.url}/api/views`, { method: "POST", headers: { Origin: host.url, "Content-Type": "application/json" }, body: '{"action":"propose","view":' + rawView + '}' });
    assert.equal(rawProposal.status, 400, "HTTP must reject the same oversized raw definition as CLI");
    const atLimit = rawView.slice(0, 1) + rawView.slice(2);
    const exactProposal = await fetch(`${host.url}/api/views`, { method: "POST", headers: { Origin: host.url, "Content-Type": "application/json" }, body: '{"action":"propose","view":' + atLimit + '}' });
    assert.equal(exactProposal.status, 200, "A valid exact-limit raw definition must remain accepted");
    fs.writeFileSync(snapshotFile, atLimit);
    assert.equal((await cliRequest(["propose", snapshotFile])).receipt.outcome, "success");
    const tooLarge = JSON.stringify({ action: "propose", view: large }) + " ".repeat(1048576);
    const oversized = await fetch(`${host.url}/api/views`, { method: "POST", headers: { Origin: host.url, "Content-Type": "application/json" }, body: tooLarge });
    assert.equal(oversized.status, 413);
    fs.writeFileSync(snapshotFile, " ".repeat(1048577));
    assert.equal((await cliRequest(["propose", snapshotFile], 1)).outcome, "failure");
    manifest.contributes.operations[0].version = 2;
    manifest.contributes.views[0].definition.sources.stats.version = 2;
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    await manage({ action: "register", directory: artifact });
    const changed = await (await fetch(`${host.url}/api/plugins`)).json();
    await manage({ action: "trust", id: jira, digest: changed.plugins.find((p: any) => p.id === jira).digest });
    await manage({ action: "enable", id: jira });
    parity(await request({ action: "open", plugin: jira, name: "issues" }), await cliRequest(["open", "issues", "--plugin", jira], 1));
    assert.equal(fs.readFileSync(favouriteFile, "utf8"), preserved);
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
