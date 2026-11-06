import assert from "node:assert/strict";
import test from "node:test";
import { evaluateView, parseView, serializeView, validateView, VIEW_LIMITS, rowSchema, createViewCatalog, type ViewOperation } from "../src/views.ts";

const base = () => ({ kind: "litzio-view", schemaVersion: 1, catalog: "litzio-v1", title: "문서 통계", refresh: "manual", sources: { stats: { kind: "operation", operation: "folder.statistics", version: 1, args: {} } }, layout: { component: "Panel", direction: "vertical", children: [{ component: "Table", title: "통계", source: "stats", data: "/rows", columns: ["folder", "documents"] }] } });
const rows = [
  { folder: "b", documents: 3, headings: 9, modified: "2026-11-08T23:00:00.000Z" },
  { folder: "a", documents: 1, headings: 5, modified: "2026-11-02T00:00:00.000Z" },
  { folder: "a", documents: 2, headings: 7, modified: null },
];
const grouped = (groupBy: object, aggregate: object) => { const v: any = base(); Object.assign(v.sources.stats, { groupBy, aggregate }); v.layout.children[0].columns = ["group", "value"]; return v; };

test("canonical serialization is stable and reparses with Unicode byte limits", () => {
  const view = base();
  const canonical = serializeView(view);
  assert.equal(serializeView(parseView(canonical)), canonical);
  assert.deepEqual(validateView(view), parseView(canonical));
  assert.throws(() => parseView(" ".repeat(VIEW_LIMITS.bytes + 1)), /byte limit/);
  const huge: any = base(); huge.title = "한".repeat(VIEW_LIMITS.bytes / 2);
  assert.throws(() => validateView(huge), /byte limit/);
});

test("rejects unsupported structures, bindings, types and processing", () => {
  const cases: ((v: any) => void)[] = [
    v => v.schemaVersion = 0, v => v.catalog = "remote", v => v.hostId = "other",
    v => v.sources.stats.operation = "fetch", v => v.sources.stats.version = 2,
    v => v.sources.stats.args.url = "https://example.com", v => v.sources.stats.args.folder = "../outside",
    v => v.sources.stats.args.folder = "C:\\private", v => v.sources.stats.args.folder = "/etc",
    v => v.layout.children[0].component = "HTML", v => v.layout.children[0].html = "<b>bad</b>",
    v => v.layout.children[0].onClick = "eval()", v => v.layout.children[0].style = {},
    v => v.layout.children[0].columns = ["authorEmail"], v => v.layout.children[0].data = "/other",
    v => v.layout.children[0] = { component: "Chart", type: "bar", title: "Chart", source: "stats", data: "/rows", x: "folder", y: "modified" },
    v => v.sources.stats.join = {}, v => v.sources.stats.formula = "a+b",
    v => v.sources.stats.groupBy = [{ field: "folder" }, { field: "modified" }],
    v => v.sources.stats.filters = [{ op: "eq", field: "documents", value: "1" }],
    v => v.sources.stats.filters = [{ op: "range", field: "documents", min: 3, max: 2 }],
    v => v.sources.stats.filters = [{ op: "range", field: "modified", min: "yesterday" }],
    v => v.sources.stats.filters = [{ op: "range", field: "documents" }],
    v => v.sources.stats.limit = VIEW_LIMITS.rows + 1,
    v => v.layout.children = Array(VIEW_LIMITS.panels + 1).fill(v.layout.children[0]),
  ];
  for (const change of cases) { const value = base(); change(value); assert.throws(() => validateView(value)); }
  assert.throws(() => validateView(grouped({ field: "folder" }, { op: "sum", field: "folder" })));
  assert.throws(() => validateView(grouped({ field: "modified" }, { op: "count" })));
  const cross = grouped({ field: "folder" }, { op: "count" }); cross.layout.children[0].columns = ["documents"];
  assert.throws(() => validateView(cross));
});

test("filter then group then sort then limit, with deterministic aggregation", () => {
  for (const [op, expected] of [["count", 2], ["sum", 12], ["avg", 6], ["min", 5], ["max", 7]] as const) {
    const view = grouped({ field: "folder" }, op === "count" ? { op } : { op, field: "headings" });
    Object.assign(view.sources.stats, { filters: [{ op: "contains", field: "folder", value: "a" }, { op: "range", field: "documents", min: 1, max: 2 }], sort: { field: "value", direction: "desc" }, limit: 1 });
    assert.deepEqual(evaluateView(view, rows), { rows: [{ group: "a", value: expected }] });
    assert.deepEqual(evaluateView(view, [...rows].reverse()), evaluateView(view, rows));
  }
  const v: any = base(); Object.assign(v.sources.stats, { filters: [{ op: "eq", field: "folder", value: "a" }], sort: { field: "documents", direction: "desc" }, limit: 1 });
  assert.deepEqual(evaluateView(v, rows).rows, [rows[2]]);
  assert.deepEqual(evaluateView(base(), []).rows, []);
  assert.throws(() => evaluateView(base(), [{ ...rows[0], documents: "3" }]));
  assert.throws(() => evaluateView(base(), Array(VIEW_LIMITS.rows + 1).fill(rows[0])));
});

test("UTC day, Monday week and month grouping preserve null dates", () => {
  for (const [interval, expected] of [["day", [{ group: null, value: 1 }, { group: "2026-11-02", value: 1 }, { group: "2026-11-08", value: 1 }]], ["week", [{ group: null, value: 1 }, { group: "2026-11-02", value: 2 }]], ["month", [{ group: null, value: 1 }, { group: "2026-11", value: 2 }]]] as const) {
    assert.deepEqual(evaluateView(grouped({ field: "modified", interval }, { op: "count" }), rows).rows, expected);
  }
  assert.deepEqual(evaluateView(grouped({ field: "modified", interval: "week" }, { op: "count" }), [{ ...rows[0], modified: "0000-01-01T00:00:00.000Z" }]).rows, [{ group: "-000001-12-27", value: 1 }]);
});

const pluginOperation: ViewOperation = { operation: "fixture.issues.read", version: 1,
  inputSchema: { type: "object", additionalProperties: false }, validateArgs: args => JSON.stringify(args) === "{}",
  rowSchema: rowSchema.parse({ status: { type: "string", label: "Status" }, points: { type: "number", label: "Points" }, opened: { type: "string", date: true, label: "Opened" }, token: { type: "string", label: "Token", secret: true } }) };
test("operation declarations control all bindings and transforms without revealing secret fields", () => {
  const spec: any = base(); spec.sources.stats.operation = pluginOperation.operation;
  spec.layout.children[0].columns = ["status", "points"];
  const ops = [pluginOperation];
  const data = [{ status: "open", points: 2, opened: "2026-11-05T00:00:00.000Z", token: "private" }];
  assert.deepEqual(evaluateView(spec, data, ops).rows, [{ status: "open", points: 2, opened: data[0].opened }]);
  assert.ok(!JSON.stringify(createViewCatalog(ops)).includes('"token"'));
  for (const field of ["token", "folder", "unknown"]) { const bad = structuredClone(spec); bad.layout.children[0].columns = [field]; assert.throws(() => validateView(bad, ops)); }
  assert.throws(() => validateView(spec));
  for (const op of ["count", "sum", "avg", "min", "max"]) {
    const grouped = structuredClone(spec); Object.assign(grouped.sources.stats, { filters: [{ op: "contains", field: "status", value: "op" }], groupBy: { field: "status" }, aggregate: op === "count" ? { op } : { op, field: "points" }, sort: { field: "value", direction: "desc" }, limit: 1 });
    grouped.layout.children[0].columns = ["group", "value"];
    assert.deepEqual(evaluateView(grouped, data, ops).rows, [{ group: "open", value: op === "count" ? 1 : 2 }]);
    if (op !== "count") { grouped.sources.stats.aggregate.field = "status"; assert.throws(() => validateView(grouped, ops)); }
  }
  const dates = structuredClone(spec); Object.assign(dates.sources.stats, { groupBy: { field: "opened", interval: "month" }, aggregate: { op: "count" } }); dates.layout.children[0].columns = ["group", "value"];
  assert.deepEqual(evaluateView(dates, data, ops).rows, [{ group: "2026-11", value: 1 }]);
  for (const patch of [{ filters: [{ op: "eq", field: "unknown", value: "x" }] }, { sort: { field: "unknown", direction: "asc" } }, { groupBy: { field: "unknown" }, aggregate: { op: "count" } }]) {
    const bad = structuredClone(spec); Object.assign(bad.sources.stats, patch); assert.throws(() => validateView(bad, ops));
  }
  spec.layout.children = [{ component: "Chart", type: "bar", title: "Chart", source: "stats", data: "/rows", x: "status", y: "status" }];
  assert.throws(() => validateView(spec, ops));
});
import { createCatalogV2, operationQueryViewSchema as queryViewSchema, validateCatalogView, serializeCatalogView, parseCatalogView, validateViewInputs, evaluateQueryView, compileViewInputSchema, compilePortableViewInputSchema, ViewInputError, reviewPageSchema, reviewProposalSchema } from "../src/views-v2.ts";
const v2 = (): any => ({ ...base(), schemaVersion: 2, catalog: "litzio-v2", profile: "query", owner: "litzio.statistics" });
const inputOperation: ViewOperation = { ...pluginOperation, inputSchema: { type: "object", properties: {
  text: { type: "string", maxLength: 8 }, date: { type: "string", format: "date" }, count: { type: "integer", minimum: 1, maximum: 5 },
  preset: { type: "string", enum: ["open", "all"] }, enabled: { type: ["boolean", "null"] }, token: { type: "string", writeOnly: true },
}, required: ["text"], additionalProperties: false }, validateArgs: () => true };
const formView = (): any => { const v = v2(); v.sources.stats.operation = inputOperation.operation; v.layout.children[0].columns = ["status"];
  v.form = { component: "InputForm", source: "stats", fields: [{ component: "TextInput", field: "text" }, { component: "DateInput", field: "date" },
    { component: "NumberInput", field: "count" }, { component: "Select", field: "preset" }, { component: "Checkbox", field: "enabled" }], submit: { component: "SubmitButton", label: "Search" } }; return v; };
test("v2 canonical query/review profiles reject v1 and cross-profile/action injection", () => {
  const review: any = { kind: "litzio-view", schemaVersion: 2, catalog: "litzio-v2", profile: "review", title: "Review", refresh: "manual",
    sources: { review: { plugin: "example.demo", review: "compare", bundleRef: "bundle-1" } },
    layout: { component: "Panel", direction: "vertical", children: [{ component: "SourceDocumentCompare", title: "Compare", source: "review" }] } };
  for (const v of [v2(), review]) { const text = serializeCatalogView(v); assert.equal(serializeCatalogView(parseCatalogView(text)), text); }
  assert.throws(() => validateCatalogView(base()));
  for (const change of [(v: any) => v.form = formView().form, (v: any) => v.sources.review.bundleRef = "https://other/asset", (v: any) => v.layout.children[0].action = "approve", (v: any) => v.layout.children[0].component = "Table"]) {
    const v = structuredClone(review); change(v); assert.throws(() => validateCatalogView(v));
  }
  const q = v2(); q.layout.children[0].component = "ReviewList"; assert.throws(() => validateCatalogView(q));
});
test("v2 form validates type/enum/date/range/secret and separates saved missing inputs from execution", () => {
  const operations = [inputOperation];
  const v = formView(), parsed = queryViewSchema.parse(v);
  assert.deepEqual(validateViewInputs(parsed, inputOperation), { state: "needs-input", missing: ["text"] });
  assert.doesNotThrow(() => validateCatalogView(v, operations));
  assert.throws(() => evaluateQueryView(v, [], operations), /args/);
  v.sources.stats.args = { text: "", date: "2026-11-06", count: 2, preset: "open", enabled: null };
  assert.equal(validateViewInputs(queryViewSchema.parse(v), inputOperation, "execute").state, "ready");
  assert.deepEqual(evaluateQueryView(v, [], operations), { rows: [] });
  assert.equal(serializeCatalogView(parseCatalogView(serializeCatalogView(v, operations), operations), operations), serializeCatalogView(v, operations));
  for (const args of [{ text: 1 }, { text: "long text" }, { text: "a", date: "2026-02-30" }, { text: "a", count: 1.5 }, { text: "a", count: 6 }, { text: "a", preset: "bad" }, { text: "a", enabled: "false" }, { text: "a", token: "secret" }, { text: "a", unknown: 1 }]) {
    const bad = structuredClone(v); bad.sources.stats.args = args; assert.throws(() => validateCatalogView(bad, operations));
  }
  for (const field of ["token", "unknown"]) { const bad = formView(); bad.form.fields[0].field = field; assert.throws(() => validateCatalogView(bad, operations)); }
  // Diagnostics expose only declared public JSON Pointer paths and keywords.
  const patterned = { ...inputOperation, inputSchema: { type: "object", properties: {
    text: { type: "string", minLength: 2, pattern: "^[a-z]+$" },
    date: { type: "string", format: "date" },
  }, required: ["text"], additionalProperties: false } };
  for (const [args, expected] of [
    [{ text: "x" }, { field: "/text", keyword: "minLength" }],
    [{ text: "PRIVATE-123" }, { field: "/text", keyword: "pattern" }],
    [{ text: "ok", date: "PRIVATE" }, { field: "/date", keyword: "format" }],
  ] as const) {
    const invalid = formView(); invalid.form.fields = [{ component: "TextInput", field: "text" }]; invalid.sources.stats.args = args;
    assert.throws(() => validateViewInputs(queryViewSchema.parse(invalid), patterned), error => {
      const issues = (error as { inputIssues: unknown }).inputIssues;
      assert.deepEqual(issues, [expected]); assert.ok(!JSON.stringify(issues).includes("PRIVATE")); return true;
    });
  }
  const noForm = formView(); delete noForm.form; assert.throws(() => validateCatalogView(noForm, operations));
  const fixed = formView(); delete fixed.form; fixed.sources.stats.args = { text: "a".repeat(513) };
  assert.throws(() => validateCatalogView(fixed, [{ ...inputOperation, inputSchema: { type: "object", properties: { text: { type: "string" } } } }]));
  const tooMany = formView(); tooMany.form.fields = Array(9).fill(tooMany.form.fields[0]); assert.throws(() => validateCatalogView(tooMany, operations));
  const wrongControl = formView(); wrongControl.form.fields[0].component = "Checkbox"; assert.throws(() => validateCatalogView(wrongControl, operations));
  // Ajv accepts these valid inputs, but secret annotations behind schema applicators
  // must never reach persisted args or the public catalog.
  const indirectSchemas = [
    { type: "object", properties: { token: { $ref: "#/$defs/token" } }, $defs: { token: { type: "string", writeOnly: true } } },
    ...["allOf", "anyOf", "oneOf"].map(keyword => ({ type: "object", properties: { token: { [keyword]: [{ type: "string", secret: true }] } } })),
    { type: "object", properties: { token: { type: "string" } }, allOf: [{ properties: { token: { type: "string", format: "password" } } }] },
    { type: "object", properties: { token: { type: "string" } }, if: { required: ["token"] }, then: { properties: { token: { writeOnly: true } } } },
    { type: "object", properties: { token: { $ref: "#/properties/token" } } },
    { type: "object", properties: { token: { $ref: "https://example.test/token" } } },
    { type: "object", patternProperties: { token: { writeOnly: true } } },
    { type: "object", additionalProperties: { writeOnly: true } },
  ];
  for (const [index, inputSchema] of indirectSchemas.entries()) {
    const op = { ...inputOperation, inputSchema };
    if (index < 4) assert.equal(compileViewInputSchema(inputSchema)({ token: "credential" }), true);
    const bad = formView(); delete bad.form; bad.sources.stats.args = { token: "credential" };
    assert.throws(() => serializeCatalogView(bad, [op]), /Unsupported persisted input schema/);
    assert.throws(() => createCatalogV2([op]), /Unsupported persisted input schema/);
  }
  const nestedSchema = { type: "object", properties: { data: { type: "array", items: { type: "object", properties: {
    public: { type: "string" }, credential: { type: "string", writeOnly: true },
  }, required: ["public"] } } } };
  const nestedOp = { ...inputOperation, inputSchema: nestedSchema };
  const fixedNested = formView(); delete fixedNested.form; fixedNested.sources.stats.args = { data: [{ public: "visible" }] };
  assert.doesNotThrow(() => serializeCatalogView(fixedNested, [nestedOp]));
  assert.ok(!JSON.stringify(createCatalogV2([nestedOp])).includes('"credential"'));
  fixedNested.sources.stats.args.data[0].credential = "credential";
  assert.throws(() => serializeCatalogView(fixedNested, [nestedOp]), /Secret input/);

});
test("v2 permits wide public schemas and tables but rejects duplicates and secrets", () => {
  const fields = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`col${i}`, { type: "string", label: `Column ${i}` }]));
  const op = { ...inputOperation, inputSchema: { type: "object" }, rowSchema: rowSchema.parse(fields) };
  const v = v2(); v.sources.stats.operation = op.operation; v.layout.children[0].columns = Object.keys(fields);
  assert.equal(validateCatalogView(v, [op]).profile, "query");
  v.layout.children[0].columns = ["col0", "col0"]; assert.throws(() => validateCatalogView(v, [op]));
  v.layout.children[0].columns = ["token"]; assert.throws(() => validateCatalogView(v, [pluginOperation]));
});
test("review neutral data checks page coordinates and proposal action eligibility", () => {
  const page = { generation: "g1", sourceRevision: "s1", pageNo: 1, width: 100, height: 200, origin: "BOTTOMLEFT", unit: "pt",
    regions: [{ id: "r1", bbox: [0, 10, 100, 200], category: "text", status: "supported" }] };
  assert.ok(reviewPageSchema.safeParse(page).success);
  assert.ok(!reviewPageSchema.safeParse({ ...page, width: 99 }).success);
  const proposal = { id: "p1", kind: "replace", targets: [{ path: [0, 1], documentRevision: "d1", documentHash: "hash" }], evidence: ["Original"],
    before: { type: "plain", text: "before" }, after: { type: "plain", text: "after" }, baseline: { documentRevision: "d1", proposalRevision: "p1" }, state: "pending", actions: [{ action: "approve", allowed: true }] };
  assert.ok(reviewProposalSchema.safeParse(proposal).success);
  assert.ok(!reviewProposalSchema.safeParse({ ...proposal, state: "stale" }).success);
  assert.ok(!reviewProposalSchema.safeParse({ ...proposal, actions: [{ action: "execute", allowed: true }] }).success);
  assert.throws(() => compileViewInputSchema({ $ref: "https://external/schema" }));
});

test("CSP-safe Core input validation preserves schema constraints and field diagnostics without coercion", () => {
  const schema = { type: "object", additionalProperties: false, required: ["text"], properties: {
    text: { type: "string", minLength: 3, pattern: "^[a-z]+$" }, date: { type: "string", format: "date" },
    count: { type: "integer", minimum: 1, maximum: 5 }, preset: { type: "string", enum: ["open", "all"] }, enabled: { type: ["boolean", "null"] },
  } };
  const before = structuredClone(schema);
  const op = { ...inputOperation, inputSchema: schema, validateArgs: () => true };
  for (const [args, field] of [[{}, "text"], [{ text: "x" }, "text"], [{ text: "abc1" }, "text"], [{ text: "abc", date: "2026-02-31" }, "date"], [{ text: "abc", count: "2" }, "count"], [{ text: "abc", count: 1.5 }, "count"], [{ text: "abc", count: Infinity }, "count"], [{ text: "abc", count: NaN }, "count"], [{ text: "abc", preset: "other" }, "preset"]] as const) {
    for (const compile of [compileViewInputSchema, compilePortableViewInputSchema]) {
      const view = queryViewSchema.parse(formView()); view.sources.stats.args = { ...args };
      assert.throws(() => validateViewInputs(view, op, "execute", compile), error => error instanceof ViewInputError && error.inputIssues.some(issue => issue.field === `/${field}`));
      if (Object.keys(args).length) assert.throws(() => validateViewInputs(view, op, "static", compile), error => error instanceof ViewInputError && error.inputIssues.some(issue => issue.field === `/${field}`));
      assert.deepEqual(view.sources.stats.args, args);
    }
  }
  for (const compile of [compileViewInputSchema, compilePortableViewInputSchema]) {
    const view = queryViewSchema.parse(formView()); view.sources.stats.args = { text: "abc", date: "2024-02-29", count: 2, enabled: false };
    assert.equal(validateViewInputs(view, op, "execute", compile).state, "ready");
  }
  assert.deepEqual(schema, before);
});

test("portable inputs distinguish optional absence, explicit empty text, null and false", () => {
  const schema = { type: "object", additionalProperties: false, properties: { text: { type: "string", const: "" }, enabled: { type: ["boolean", "null"] } } };
  for (const compile of [compileViewInputSchema, compilePortableViewInputSchema]) {
    const check = compile(schema);
    for (const args of [{}, { text: "" }, { enabled: false }, { enabled: null }]) {
      const before = structuredClone(args); assert.equal(check(args), true); assert.deepEqual(args, before);
    }
    assert.equal(check({ text: "other" }), false);
  }
});


const assistantView = (): any => ({ ...v2(), owner: "litzio.assistant", refresh: "assistant", sources: { stats: {
  kind: "assistant", generatedAt: "2026-11-06T00:00:00.000Z",
  rowSchema: { x: { type: "number", label: "X", nullable: true }, y: { type: "number", label: "Y", nullable: true } },
  rows: [{ x: 1, y: 2 }, { x: 2, y: null }], provenance: [{ kind: "reference", label: "Assumption", refId: "ref-1" }], method: "Calculated from supplied material",
} }, layout: { component: "Panel", direction: "vertical", children: [{ component: "Chart", type: "line", title: "Trend", source: "stats", data: "/rows", x: "x", y: "y" }] } });
test("assistant snapshot canonical roundtrip preserves inline rows, provenance and order without operations", () => {
  const view = assistantView(), text = serializeCatalogView(view, []);
  const connected = serializeCatalogView(v2());
  assert.throws(() => parseCatalogView(connected + " ".repeat(32769 - Buffer.byteLength(connected))), /byte limit/);
  assert.equal(serializeCatalogView(parseCatalogView(text, []), []), text);
  assert.deepEqual(evaluateQueryView(view, undefined, []).rows, view.sources.stats.rows);
  for (const change of [
    (v: any) => delete v.owner, (v: any) => v.refresh = "manual", (v: any) => v.sources.stats.args = {},
    (v: any) => v.form = {}, (v: any) => v.sources.stats.rowSchema.x.secret = true,
    (v: any) => v.sources.stats.rows[0].unknown = 1, (v: any) => delete v.sources.stats.rows[0].y,
    (v: any) => v.sources.stats.rows[0].y = Infinity, (v: any) => v.sources.stats.rows[0].y = "2",
    (v: any) => v.sources.stats.provenance = [], (v: any) => v.layout.children[0].x = "missing",
    (v: any) => v.sources.stats.provenance[0].url = "https://example.test",
    (v: any) => v.profile = "review",
  ]) { const bad = assistantView(); change(bad); assert.throws(() => validateCatalogView(bad, [])); }
  for (const path of ["../escape.md", "/root.md", "https://example.test/a", "a/../b.md", "a\\b.md"]) {
    const bad = assistantView(); bad.sources.stats.provenance = [{ kind: "document", label: "Document", hostId: "host-a", rootId: "root-a", path, revision: "r1" }]; assert.throws(() => validateCatalogView(bad, []));
  }
});
test("assistant row, string, provenance and raw/canonical byte limits are enforced", () => {
  const view = assistantView(); view.layout.children[0].type = "scatter";
  view.sources.stats.rows = Array.from({ length: 10000 }, () => ({ x: 1, y: 2 }));
  assert.equal(evaluateQueryView(view, undefined, []).rows.length, 10000);
  view.sources.stats.rows.push({ x: 1, y: 2 }); assert.throws(() => validateCatalogView(view));
  const small = assistantView(); small.sources.stats.provenance = Array(64).fill(small.sources.stats.provenance[0]); validateCatalogView(small);
  small.sources.stats.provenance.push(small.sources.stats.provenance[0]); assert.throws(() => validateCatalogView(small));
  const text = serializeCatalogView(assistantView());
  parseCatalogView(text + " ".repeat(1048576 - Buffer.byteLength(text)));
  assert.throws(() => parseCatalogView(text + " ".repeat(1048577 - Buffer.byteLength(text))), /byte limit/);
  const strings = assistantView(); strings.layout.children = [{ component: "Table", title: "Text", source: "stats", data: "/rows", columns: ["text"] }];
  strings.sources.stats.rowSchema = { text: { type: "string", label: "Text" } }; strings.sources.stats.rows = [{ text: "a".repeat(4096) }]; validateCatalogView(strings);
  strings.sources.stats.rows[0].text += "a"; assert.throws(() => validateCatalogView(strings));
  strings.sources.stats.rows = Array(254).fill({ text: "a".repeat(4096) }); assert.ok(Buffer.byteLength(JSON.stringify(strings)) < 1048576);
  assert.throws(() => serializeCatalogView(strings), /byte limit/);
});
test("Chart types and Panel structure have strict, shared Core semantics", () => {
  for (const xs of [[2, 1], [1, 1], [null, 2]]) { const v = assistantView(); v.sources.stats.rows.forEach((r: any, i: number) => r.x = xs[i]); assert.throws(() => validateCatalogView(v)); }
  const v = assistantView(); v.layout.children[0].type = "scatter"; v.sources.stats.rows = [{ x: null, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 2 }]; validateCatalogView(v);
  for (const type of ["bar", "line", "scatter"]) { const bad = assistantView(); Object.assign(bad.layout.children[0], { type, options: { invented: true } }); assert.throws(() => validateCatalogView(bad)); }
  const date = assistantView(); date.sources.stats.rowSchema.x = { type: "string", label: "Date", date: true }; date.sources.stats.rows = [{ x: "2026-11-06T00:00:00.000Z", y: null }]; validateCatalogView(date);
  date.layout.children[0].type = "scatter"; assert.throws(() => validateCatalogView(date));
  const panel = assistantView(); const leaf = panel.layout.children[0]; panel.layout = { component: "Panel", direction: "horizontal", children: [leaf, leaf] }; validateCatalogView(panel);
  panel.layout.children.push(leaf); assert.throws(() => validateCatalogView(panel));
  panel.layout.children = [{ ...panel.layout, children: [leaf, leaf] }, leaf]; assert.throws(() => validateCatalogView(panel));
});


test("monthly date aggregation binds to line x and validates final bucket order", () => {
  const view: any = { ...grouped({ field: "modified", interval: "month" }, { op: "count" }), schemaVersion: 2, catalog: "litzio-v2", profile: "query", owner: "litzio.statistics" };
  view.layout.children = [{ component: "Chart", type: "line", title: "Monthly documents", source: "stats", data: "/rows", x: "group", y: "value" }];
  const data = [rows[0], { ...rows[1], modified: "2026-10-02T00:00:00.000Z" }, { ...rows[2], modified: "2026-11-02T00:00:00.000Z" }];
  const canonical = serializeCatalogView(view);
  assert.equal(serializeCatalogView(parseCatalogView(canonical)), canonical);
  const expected = { rows: [{ group: "2026-10", value: 1 }, { group: "2026-11", value: 2 }] };
  assert.deepEqual(evaluateQueryView(view, data), expected);
  assert.deepEqual(evaluateQueryView(view, [...data].reverse()), expected);
  // Repeated dates collapse to unique buckets; descending final output still fails line order.
  view.sources.stats.sort = { field: "group", direction: "desc" };
  assert.throws(() => evaluateQueryView(view, data), /ascending/);
  delete view.sources.stats.sort;
  assert.throws(() => evaluateQueryView(view, rows), /non-null/);
});

test("assistant calculation method preserves comparison expressions as plain text", () => {
  const view = assistantView();
  const method = "매출 > 0인 행만 합산하고 비용 < 100인 행과 비교한다.\n<b>도 텍스트다.</b>";
  view.sources.stats.method = method;
  const parsed = parseCatalogView(serializeCatalogView(view));
  assert.equal(parsed.profile === "query" && parsed.sources.stats.kind === "assistant" && parsed.sources.stats.method, method);
  view.sources.stats.method = "a".repeat(4097);
  assert.throws(() => validateCatalogView(view));
  view.sources.stats.method = "설명\u0000";
  assert.throws(() => validateCatalogView(view));
});
