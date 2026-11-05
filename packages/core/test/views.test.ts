import assert from "node:assert/strict";
import test from "node:test";
import { evaluateView, parseView, serializeView, validateView, VIEW_LIMITS } from "../src/views.ts";

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
