import test from "node:test";
import assert from "node:assert/strict";
import { validateManifest, compileSchema, defaultJobOutput, HEALTH_CHECK_OUTPUT_SCHEMA, healthCheckResultSchema } from "../src/index.ts";
const manifest = () => ({ schemaVersion: 1, id: "example.demo", tier: "community", publisher: { id: "example", name: "Example" }, name: "Demo", version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: {} });
test("manifest rejects unsupported extensions, invalid identities, versions and unknown declarations before execution", () => {
  assert.equal(validateManifest(manifest()).id, "example.demo");
  for (const requiresSdk of ["0.1.0", "^0.1.0", "0.2.0", "^0.2.0", ">=0.2.0 <1.0.0", "^0.3.0"]) assert.ok(validateManifest({ ...manifest(), requiresSdk }));
  for (const requiresSdk of ["0.1.1", "^0.4.0", ">=1.0.0"]) assert.throws(() => validateManifest({ ...manifest(), requiresSdk }), /Unsupported SDK range/);
  for (const change of [{ settingsSchema: { type: "invalid" } }, { id: "../escape" }, { requiresSdk: "^2.0.0" }, { version: "bad" }, { entry: "../host.js" }, { contributes: { surprise: [] } }, { contributes: { jobs: [{ id: "import", title: "Import", accept: [".txt"], start: "start", status: "status", stop: "stop", resultKind: "native-document" }] } }, { contributes: { dataViews: [{ id: "table", operation: "read", version: 1 }] } }, { contributes: { generatedUi: [{ id: "ui", catalog: "table", schemaVersion: 1 }] } }, { contributes: { views: [{ id: "saved", definition: "view.json" }] } }, { contributes: { secretUses: [{ operation: "read", secret: "token" }] } }]) assert.throws(() => validateManifest({ ...manifest(), ...change }));
  assert.throws(() => compileSchema({ $ref: "https://example.test/schema" }));
  assert.throws(() => compileSchema({ type: "not-a-type" }));
  const job = { id: "export", title: "Export", accept: [".txt"], start: "start", status: "status", stop: "stop", resultKind: "file", resultExtension: ".bin" };
  const withJob = (value: unknown, requiresSdk = ">=0.2.0 <1.0.0") => ({ ...manifest(), requiresSdk, contributes: { jobs: [value], operations: ["start", "status", "stop"].map(id => ({ id, version: 1, effect: id === "status" ? "read" : "write", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "object" } })) } });
  const nativeJob = { id: "import", title: "Import", accept: [".txt"], start: "start", status: "status", stop: "stop", resultKind: "native-document" };
  const generated = withJob({ ...nativeJob, generatedDocument: "prepare" }, "^0.3.0");
  generated.contributes.operations.push({ id: "prepare", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "object" } });
  assert.ok(validateManifest(generated));
  assert.throws(() => validateManifest({ ...generated, requiresSdk: "^0.1.0" }), /Generated documents require SDK/);
  assert.throws(() => validateManifest({ ...generated, contributes: { ...generated.contributes, operations: generated.contributes.operations.slice(0, -1) } }), /host read provider/);
  for (const requiresSdk of ["0.1.0", "^0.1.0"]) {
    assert.throws(() => validateManifest(withJob(job, requiresSdk)), /File job results require SDK 0\.2\.0 or later in requiresSdk/);
    assert.ok(validateManifest(withJob(nativeJob, requiresSdk)));
  }
  const screen = { id: "jobs", title: "Jobs", icon: "LayoutDashboard", jobs: ["export"] };
  const withScreen = (requiresSdk: string, value = screen) => { const m = withJob(job, requiresSdk); return { ...m, contributes: { ...m.contributes, screens: [value] } }; };
  assert.equal(validateManifest(withScreen("^0.3.0")).contributes.screens[0]!.defaultViewIds.length, 0);
  assert.throws(() => validateManifest(withScreen("^0.2.0")), /Screen jobs require SDK/);
  assert.throws(() => validateManifest(withScreen("^0.3.0", { ...screen, jobs: ["missing"] })), /Undeclared screen job/);
  assert.throws(() => validateManifest(withScreen("^0.3.0", { ...screen, jobs: [] })), /Screen needs views or jobs/);
  const binding = validateManifest(withJob(job)).contributes.jobs[0];
  assert.equal(defaultJobOutput(binding, "nested/a.txt"), "nested/a.bin");
  assert.equal(defaultJobOutput({ ...binding, resultKind: "native-document" }, "docs/\uBCF4\uACE0\uC11C.docling"), "docs/\uBCF4\uACE0\uC11C.md");
  for (const resultExtension of [undefined, "bin", ".BIN", "../bin", ".tar.gz"]) assert.throws(() => validateManifest(withJob({ ...job, resultExtension })));
  assert.throws(() => validateManifest(withJob({ ...job, resultKind: "native-document" })));
});

test("declared secrets accept unique identifiers only", () => {
 const secret = { id: "token", scope: "connection", required: true };
 assert.equal(validateManifest({ ...manifest(), secrets: [secret] }).secrets.length, 1);
 assert.throws(() => validateManifest({ ...manifest(), secrets: [secret, secret] }));
});

test("read operation row schema is normalized and rejects invalid declarations", () => {
  const operation = { id: "read", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "array", items: { type: "object" } }, rowSchema: { points: { type: "number", label: "Points" } } };
  const withOperation = (op: unknown) => ({ ...manifest(), contributes: { operations: [op] } });
  assert.equal(validateManifest(withOperation(operation)).contributes.operations[0]!.rowSchema!.points.secret, false);
  assert.throws(() => validateManifest(withOperation({ ...operation, effect: "write" })));
  for (const name of ["group", "value", "a".repeat(81)]) assert.throws(() => validateManifest(withOperation({ ...operation, rowSchema: { [name]: { type: "number", label: "Points" } } })));
  assert.ok(validateManifest(withOperation({ ...operation, rowSchema: { ["a".repeat(80)]: { type: "number", label: "Points" } } })));

  assert.throws(() => validateManifest(withOperation({ ...operation, rowSchema: { points: { type: "number", label: "Points", date: true } } })));
});

test("v2 view and review contributions validate local bindings before entry execution", () => {
  const inputSchema = { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false };
  const read = { id: "search", version: 1, effect: "read", scope: "host", inputSchema, outputSchema: { type: "array" }, rowSchema: { title: { type: "string", label: "Title" } } };
  const write = { ...read, id: "change", effect: "write", rowSchema: undefined };
  const binding = (operation: string) => ({ operation: `example.demo.${operation}`, version: 1 });
  const review = { id: "review", title: "Review", read: binding("search"), propose: binding("change"), approve: binding("change"), reject: binding("change"), undo: binding("change") };
  const definition = { kind: "litzio-view", schemaVersion: 2, catalog: "litzio-v2", profile: "query", owner: manifest().id, title: "Search", refresh: "manual",
    sources: { stats: { kind: "operation", operation: "example.demo.search", version: 1, args: { query: "hello" } } },
    layout: { component: "Panel", direction: "vertical", children: [{ component: "Table", title: "Results", source: "stats", data: "/rows", columns: ["title"] }] } };
  const m = { ...manifest(), contributes: { operations: [read, write], views: [{ id: "search", title: "Search", definition }], reviews: [review] } };
  assert.equal(validateManifest(m).contributes.views[0]!.definition.profile, "query");
  assert.equal(validateManifest({ ...m, contributes: { operations: [read], reviews: [{ id: "compare", title: "Compare", read: binding("search") }] } }).contributes.reviews[0]!.propose, undefined);
  const screen = { id: "dashboard", title: "Dashboard", icon: "LayoutDashboard", defaultViewIds: ["search"], primary: true };
  const screened = { ...m, contributes: { ...m.contributes, screens: [screen] } };
  assert.equal(validateManifest(screened).contributes.screens[0].primary, true);
  const snapshot = structuredClone(screened) as any;
  snapshot.contributes.views[0].definition.refresh = "assistant";
  snapshot.contributes.views[0].definition.sources.stats = { kind: "assistant", generatedAt: "2026-11-06T00:00:00.000Z", rowSchema: { title: { type: "string", label: "Title" } }, rows: [{ title: "Saved result" }], provenance: [{ kind: "reference", label: "Source", refId: "ref-1" }] };
  assert.throws(() => validateManifest(snapshot));

  for (const change of [
    (v: any) => v.contributes.screens.push(screen),
    (v: any) => v.contributes.screens.push({ ...screen, id: "second" }),
    (v: any) => v.contributes.screens[0].defaultViewIds = ["missing"],
    (v: any) => v.contributes.screens[0].defaultViewIds = ["search", "search"],
    (v: any) => v.contributes.screens[0].icon = "https://example.test/icon",
    (v: any) => v.contributes.screens[0].route = "/custom",
    (v: any) => v.contributes.views[0].definition.owner = "other.plugin",
  ]) { const bad = structuredClone(screened); change(bad); assert.throws(() => validateManifest(bad)); }

  for (const change of [(v: any) => v.contributes.views[0].definition.profile = "review", (v: any) => v.contributes.views[0].definition.sources.stats.operation = "other.plugin.search",
    (v: any) => v.contributes.reviews[0].approve = binding("search"), (v: any) => v.contributes.reviews[0].read = binding("change"),
    (v: any) => v.contributes.reviews[0].approve.operation = "other.plugin.change", (v: any) => v.contributes.reviews[0].undo.version = 2,
    (v: any) => v.contributes.reviews[0].execute = binding("change")]) {
    const bad = structuredClone(m); change(bad); assert.throws(() => validateManifest(bad));
  }
});

test("health checks bind a host read accepting empty input and require the feature SDK", () => {
  const op = { id: "connection", version: 1, effect: "read", scope: "host", inputSchema: { type: "object", additionalProperties: false }, outputSchema: HEALTH_CHECK_OUTPUT_SCHEMA };
  const check = (operation: unknown = op, requiresSdk = ">=0.3.0 <1.0.0") => ({ ...manifest(), requiresSdk, contributes: { healthCheck: "connection", operations: [operation] } });
  assert.equal(validateManifest(check()).contributes.healthCheck, "connection");
  for (const requiresSdk of ["^0.1.0", "0.2.0"]) assert.throws(() => validateManifest(check(op, requiresSdk)), /Health checks require SDK/);
  for (const operation of [{ ...op, effect: "write" }, { ...op, id: "other" }, { ...op, inputSchema: { type: "object", required: ["url"], properties: { url: { type: "string" } } } }]) assert.throws(() => validateManifest(check(operation)));
  assert.deepEqual(healthCheckResultSchema.parse({ ok: true, message: "Connected" }), { ok: true, message: "Connected" });
  for (const value of [{ ok: true }, { ok: "yes", message: "Connected" }, { ok: true, message: "Connected", raw: {} }]) assert.throws(() => healthCheckResultSchema.parse(value));
});

test("link columns require a supported SDK feature contract", () => {
  const operation = { id: "read", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "array" }, rowSchema: { key: { type: "string", label: "Key", linkField: "url" }, url: { type: "string", label: "URL" } } };
  for (const requiresSdk of ["0.1.0", "^0.1.0", "0.2.0", "^0.2.0", ">=0.1.0 <0.3.0"]) assert.throws(() => validateManifest({ ...manifest(), requiresSdk, contributes: { operations: [operation] } }), /Link columns require SDK 0.3.0/);
  for (const requiresSdk of ["0.3.0", "^0.3.0", ">=0.3.0 <1.0.0"]) assert.ok(validateManifest({ ...manifest(), requiresSdk, contributes: { operations: [operation] } }));
});

test("plugin image paths require the feature SDK and remain artifact-relative", () => {
  for (const icon of ["icon.png", "assets/icon.svg"]) assert.equal(validateManifest({ ...manifest(), requiresSdk: "^0.3.0", icon }).icon, icon);
  assert.throws(() => validateManifest({ ...manifest(), icon: "icon.png" }), /SDK 0.3.0/);
  for (const icon of ["../icon.png", "/icon.png", "C:/icon.png", "https://example.test/icon.png", "a/../icon.svg", "icon.gif", "icon.svg?x", "a\\icon.png"]) assert.throws(() => validateManifest({ ...manifest(), requiresSdk: "^0.3.0", icon }));
});

test("input suggestions bind public text fields to same-plugin reads on SDK 0.3", () => {
 const source = {id:"search",version:1,effect:"read",scope:"host",inputSchema:{type:"object",properties:{person:{type:"string"}}},outputSchema:{type:"array"},rowSchema:{name:{type:"string",label:"Name"}},inputSuggestions:{person:"people"}};
 const people = {id:"people",version:1,effect:"read",scope:"host",inputSchema:{type:"object",properties:{query:{type:"string"}},required:["query"],additionalProperties:false},outputSchema:{type:"array"}};
 const input = { ...manifest(), requiresSdk:"^0.3.0", contributes:{operations:[source,people]} };
 assert.deepEqual(validateManifest(input).contributes.operations[0]?.inputSuggestions,{person:"people"});
 assert.throws(()=>validateManifest({...input,requiresSdk:"^0.2.0"}),/SDK 0.3/);
 assert.throws(()=>validateManifest({...input,contributes:{operations:[source,{...people,effect:"write"}]}}),/standalone host read/);
 assert.throws(()=>validateManifest({...input,contributes:{operations:[{...source,inputSuggestions:{missing:"people"}},people]}}),/public free-text/);
 assert.throws(()=>validateManifest({...input,contributes:{operations:[{...source,inputSchema:{type:"object",properties:{person:{type:"string",secret:true}}}},people]}}),/public free-text/);
});
