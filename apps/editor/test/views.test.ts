import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDocument, serialize } from "@litzio/core";
import { executeViewOperation } from "../server/views.ts";
import { RootAccess } from "../server/file-access.ts";
import { startHttpHost } from "../server/http-host.ts";
import { startFetchServer } from "../../../test/helpers/fetch-server.ts";
import { viewCli } from "../../../packages/cli/src/views.ts";
import { DAEMON_PROTOCOL } from "../shared/daemon-version.ts";
import { nativeSource } from "./helpers/document.ts";

const view = { kind: "litzio-view", schemaVersion: 2, catalog: "litzio-v2", profile: "query", owner: "fixture.jira", title: "Issues", refresh: "manual", sources: { stats: { kind: "operation", operation: "fixture.jira.search", version: 1, args: {} } }, layout: { component: "Panel", direction: "vertical", children: [{ component: "Table", title: "Issues", source: "stats", data: "/rows", columns: ["key"] }] } };
test("HTTP and CLI share plugin inputs, manual queries, availability and error receipts", async context => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-view-http-"));
  const previous = process.env.LITZIO_DATA_DIR;
  process.env.LITZIO_DATA_DIR = path.join(dir, "state");
  fs.mkdirSync(path.join(dir, "editor")); fs.writeFileSync(path.join(dir, "editor", "index.html"), "<!doctype html>");
  const root = path.join(dir, "root"); fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "doc.md"), serialize(createDocument()));
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
    await manage({ action: "trust", id, registrationId: plugins.find((p: any) => p.id === id).registrationId });
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
    manifest.requiresSdk = ">=0.3.0 <1.0.0";
    const presets = ["assigned-open", "reported-open", "assigned-all", "reported-all", "recent", "all"];
    const rowSchema: Record<string, {type: string; label: string; hidden?: boolean}> = Object.fromEntries(["key", "summary", "status", "assignee", "updated"].map(key => [key, { type: "string", label: key }]));
    rowSchema.updated.hidden = true;
    const jiraView = { ...structuredClone(view), owner: jira, title: "My issues", sources: { stats: { kind: "operation", operation: `${jira}.search`, version: 1, args: { preset: presets[0], text: "old" } } },
      form: { component: "InputForm", source: "stats", fields: [{ component: "Select", field: "preset" }, { component: "TextInput", field: "text" }], submit: { component: "SubmitButton", label: "Search" } },
      layout: { component: "Panel", direction: "vertical", children: [{ component: "Table", title: "Issues", source: "stats", data: "/rows", columns: Object.keys(rowSchema) }] } };
    manifest.contributes.operations = [{ id: "search", version: 1, effect: "read", scope: "host", rowSchema,
      inputSchema: { type: "object", properties: { preset: { type: "string", enum: presets }, text: { type: "string", minLength: 2, pattern: "^[A-Za-z]+$" }, credential: { type: "string", writeOnly: true } }, required: ["preset"], additionalProperties: false },
      outputSchema: { type: "object", properties: { rows: {type:"array",items:{type:"object"}}, truncated:{type:"boolean"}, total:{type:"integer"} }, required:["rows","truncated"] } }];
    // SDK-valid runtime schema, intentionally unsupported for persisted view input.
    manifest.contributes.operations.push({ ...manifest.contributes.operations[0], id: "advanced", outputSchema: {type:"array",items:{type:"object"}}, inputSchema: {
      type: "object", properties: { term: { anyOf: [{ type: "string" }, { type: "number" }] } }, additionalProperties: false,
    } });
    manifest.contributes.views = [{ id: "issues", title: "My issues", definition: structuredClone(jiraView) }];
    manifest.contributes.screens = [{ id: "dashboard", title: "예시: Issues", icon: "Table", defaultViewIds: ["issues"], primary: true }];
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    fs.writeFileSync(path.join(artifact, "host.js"), `export function activate() { return {
      operations: { advanced: () => [], search: ({preset, text}) => { if(text === "fail") throw Object.assign(new Error("PRIVATE SERVICE BODY"), {kind:"auth"}); return {rows:[{key:"MOCK-1",summary:preset,status:"Open",assignee:text ?? "me",updated:"2026-11-06"}],truncated:true,total:1234}; } },
      status: () => ({available:true,message:"Ready",folders:[],decorations:[],accounts:[]}), dispose() {} }; }`);
    await manage({ action: "register", directory: artifact });
    const records = await (await fetch(`${host.url}/api/plugins`)).json();
    await manage({ action: "trust", id: jira, registrationId: records.plugins.find((p: any) => p.id === jira).registrationId });
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
    const jiraFile = path.join(dir, "query.json"), inputFile = path.join(dir, "args.json");
    fs.writeFileSync(jiraFile, JSON.stringify(jiraView));
    fs.writeFileSync(inputFile, JSON.stringify({ preset: "reported-open" }));
    const catalog = await request({ action: "catalog" });
    assert.equal(catalog.receipt.outcome, "success");
    assert.ok(catalog.catalog.schema); assert.equal("columns" in catalog.catalog.limits, false);
    assert.ok(!("operations" in catalog));
    assert.ok(catalog.catalog.operations.some((op: any) => op.operation === `${jira}.search` && op.plugin === jira));
    assert.ok(!catalog.catalog.operations.some((op: any) => op.operation === `${jira}.advanced`));
    assert.deepEqual((await manage({ action: "invoke", operation: `${jira}.advanced`, input: { term: 1 } })).result, []);
    assert.equal(catalog.views.find((v: any) => v.plugin === jira).definition.layout.children[0].columns.length, 5);
    assert.deepEqual(catalog.screens, [{ plugin: jira, jobs: [], ...manifest.contributes.screens[0] }]);
    parity(await request({ action: "validate", view: jiraView }), await cliRequest(["validate", jiraFile]));
    const run = await request({ action: "run", view: jiraView, input: { preset: "reported-open" } });
    assert.deepEqual(run.coverage, {truncated:true,total:1234,returned:1});
    parity(run, await cliRequest(["run", jiraFile, "--input", inputFile]));
    assert.equal(run.receipt.scope, "host"); assert.ok(!("target" in run));
    assert.deepEqual(run.args, { preset: "reported-open" });
    assert.equal(run.rows[0].summary, "reported-open"); assert.equal(run.rows[0].assignee, "me");
    const wrongOwner = { ...jiraView, owner: "other.plugin" };
    assert.equal((await request({ action: "run", view: wrongOwner })).code, "owner-mismatch");
    // Removed public actions cannot reopen or create a stored view.
    for (const action of ["propose", "save", "list", "open"]) {
      assert.equal((await request({ action, view: jiraView, plugin: jira, name: "issues" })).receipt.outcome, "failure");
      assert.equal((await cliRequest([action, jiraFile], 1)).outcome, "failure");
    }
    fs.writeFileSync(inputFile, JSON.stringify({ preset: "all", text: "fail" }));
    const failed = await request({ action: "run", view: jiraView, input: { preset: "all", text: "fail" } });
    const failedCli = await cliRequest(["run", jiraFile, "--input", inputFile], 1);
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
      const rejected = await request({ action: "run", view: jiraView, input: args });
      assert.equal(rejected.code, "invalid-input"); assert.ok(!("errorKind" in rejected));
      assert.ok(rejected.inputIssues.some((issue: any) => issue.keyword === keyword && issue.field === field));
      assert.ok(!JSON.stringify(rejected).includes("PRIVATE"));
      parity(rejected, await cliRequest(["run", jiraFile, "--input", inputFile], 1));
    }
    assert.ok(!("inputIssues" in failed)); // Source errors retain only #1233 classification.
    const incomplete = structuredClone(jiraView); incomplete.sources.stats.args = {} as any;
    assert.equal((await request({ action: "validate", view: incomplete })).inputState.state, "needs-input");
    assert.equal((await request({ action: "run", view: incomplete, input: { preset: "all" } })).receipt.outcome, "success");
    const missingInput = await request({ action: "run", view: incomplete });
    assert.equal(missingInput.code, "invalid-input");
    assert.deepEqual(missingInput.inputIssues, [{ field: "/preset", keyword: "required" }]);
    await manage({ action: "disable", id: jira });
    assert.equal((await request({ action: "run", view: jiraView })).code, "unavailable");
    assert.ok(!(await request({ action: "catalog" })).views.some((v: any) => v.plugin === jira));
    delete manifest.contributes.operations[0].rowSchema.updated;
    manifest.contributes.views[0].definition.layout.children[0].columns = ["key", "summary", "status", "assignee"];
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    await manage({ action: "register", directory: artifact });

    const changed = await (await fetch(`${host.url}/api/plugins`)).json();
    await manage({ action: "trust", id: jira, registrationId: changed.plugins.find((p: any) => p.id === jira).registrationId });
    await manage({ action: "enable", id: jira });
    const missingColumn = await request({ action: "run", view: jiraView });
    assert.equal(missingColumn.code, "unavailable");
    parity(missingColumn, await cliRequest(["run", jiraFile], 1));
    await manage({ action: "disable", id: jira });
    manifest.contributes.operations[0].version = 2;
    manifest.contributes.views[0].definition.sources.stats.version = 2;
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    await manage({ action: "register", directory: artifact });
    const versioned = await (await fetch(`${host.url}/api/plugins`)).json();
    await manage({ action: "trust", id: jira, registrationId: versioned.plugins.find((p: any) => p.id === jira).registrationId });
    await manage({ action: "enable", id: jira });
    assert.equal((await request({ action: "run", view: jiraView })).code, "unavailable");
    fs.writeFileSync(jiraFile, JSON.stringify({ ...jiraView, schemaVersion: 99 }));
    const invalid = await cliRequest(["validate", jiraFile], 1);
    assert.equal(invalid.receipt.operation, "view.validate"); assert.equal(invalid.receipt.outcome, "failure");
    fs.writeFileSync(jiraFile, " ".repeat(32769));
    assert.equal((await cliRequest(["validate", jiraFile], 1)).outcome, "failure");
  } finally {
    await host.close();
    if (previous === undefined) delete process.env.LITZIO_DATA_DIR; else process.env.LITZIO_DATA_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
