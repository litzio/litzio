import assert from "node:assert/strict";
import test from "node:test";
import { evaluateView, parseView, serializeView, validateView, VIEW_LIMITS, rowSchema, createViewCatalog, type ViewOperation } from "../src/views.ts";

const base = () => ({ kind: "litzio-view", schemaVersion: 1, catalog: "litzio-v1", title: "문서 통계", refresh: "manual", sources: { stats: { operation: "folder.statistics", version: 1, args: {} } }, layout: { component: "VerticalPanel", children: [{ component: "Table", title: "통계", source: "stats", data: "/rows", columns: ["folder", "documents"] }] } });
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
    v => v.layout.children[0] = { component: "BarChart", title: "Chart", source: "stats", data: "/rows", x: "folder", y: "modified" },
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
  spec.layout.children = [{ component: "BarChart", title: "Chart", source: "stats", data: "/rows", x: "status", y: "status" }];
  assert.throws(() => validateView(spec, ops));
});
import { queryViewSchema, validateCatalogView, serializeCatalogView, parseCatalogView, validateViewInputs, evaluateQueryView, compileViewInputSchema, reviewPageSchema, reviewProposalSchema } from "../src/views-v2.ts";
const v2 = (): any => ({ ...base(), schemaVersion: 2, catalog: "litzio-v2", profile: "query" });
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
    layout: { component: "VerticalPanel", children: [{ component: "SourceDocumentCompare", title: "Compare", source: "review" }] } };
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
  const noForm = formView(); delete noForm.form; assert.throws(() => validateCatalogView(noForm, operations));
  const fixed = formView(); delete fixed.form; fixed.sources.stats.args = { text: "a".repeat(513) };
  assert.throws(() => validateCatalogView(fixed, [{ ...inputOperation, inputSchema: { type: "object", properties: { text: { type: "string" } } } }]));
  const tooMany = formView(); tooMany.form.fields = Array(9).fill(tooMany.form.fields[0]); assert.throws(() => validateCatalogView(tooMany, operations));
  const wrongControl = formView(); wrongControl.form.fields[0].component = "Checkbox"; assert.throws(() => validateCatalogView(wrongControl, operations));
});
test("v2 permits exactly 12 public columns and rejects duplicates/secrets/13 columns", () => {
  const fields = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`col${i}`, { type: "string", label: `Column ${i}` }]));
  const op = { ...inputOperation, inputSchema: { type: "object" }, rowSchema: rowSchema.parse(fields) };
  const v = v2(); v.sources.stats.operation = op.operation; v.layout.children[0].columns = Object.keys(fields).slice(0, 12);
  assert.equal(validateCatalogView(v, [op]).profile, "query");
  v.layout.children[0].columns.push("col12"); assert.throws(() => validateCatalogView(v, [op]));
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
