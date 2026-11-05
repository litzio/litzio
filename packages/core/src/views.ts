import { z } from "zod";

export const VIEW_LIMITS = { bytes: 32768, panels: 8, rows: 2000 } as const;
const label = z.string().min(1).max(160).refine(v => !/[<>\u0000-\u001f]|(?:https?:|javascript:|data:)/i.test(v), "Plain label required");
const field = z.enum(["folder", "documents", "headings", "modified"]);
type Field = z.infer<typeof field>;
const numeric = z.enum(["documents", "headings"]);
const scalar = z.union([z.string().max(512), z.number().finite(), z.null()]);
const filter = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("eq"), field, value: scalar }),
  z.strictObject({ op: z.literal("contains"), field: z.literal("folder"), value: z.string().max(512) }),
  z.strictObject({ op: z.literal("range"), field, min: scalar.optional(), max: scalar.optional() }),
]);
const aggregate = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("count") }),
  z.strictObject({ op: z.enum(["sum", "avg", "min", "max"]), field: numeric }),
]);
const groupBy = z.union([
  z.strictObject({ field: z.enum(["folder", "documents", "headings"]) }),
  z.strictObject({ field: z.literal("modified"), interval: z.enum(["day", "week", "month"]) }),
]);
const outputField = z.enum(["folder", "documents", "headings", "modified", "group", "value"]);
const source = z.strictObject({
  operation: z.literal("folder.statistics"), version: z.literal(1),
  args: z.strictObject({ folder: z.string().min(1).max(512).refine(v => v === "." || (!/[:\\\u0000-\u001f]/.test(v) && !v.startsWith("/") && v.split("/").every(p => p && p !== "." && p !== "..")), "Relative folder required").optional() }),
  filters: z.array(filter).max(8).default([]),
  groupBy: groupBy.optional(), aggregate: aggregate.optional(),
  sort: z.strictObject({ field: outputField, direction: z.enum(["asc", "desc"]) }).optional(),
  limit: z.number().int().min(1).max(VIEW_LIMITS.rows).default(VIEW_LIMITS.rows),
});
const binding = { title: label, source: z.literal("stats"), data: z.literal("/rows") };
const table = z.strictObject({ component: z.literal("Table"), ...binding, columns: z.array(outputField).min(1).max(4).refine(v => new Set(v).size === v.length, "Duplicate columns") });
const chart = z.strictObject({ component: z.literal("BarChart"), ...binding, x: outputField, y: outputField });
export const viewSchema = z.strictObject({
  kind: z.literal("litzio-view"), schemaVersion: z.literal(1), catalog: z.literal("litzio-v1"),
  title: label, refresh: z.literal("manual"),
  sources: z.strictObject({ stats: source }),
  layout: z.strictObject({ component: z.literal("VerticalPanel"), children: z.array(z.discriminatedUnion("component", [table, chart])).min(1).max(VIEW_LIMITS.panels) }),
}).superRefine((view, ctx) => {
  const s = view.sources.stats;
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (!!s.groupBy !== !!s.aggregate) fail("groupBy and aggregate must be specified together");
  const fields = s.groupBy ? ["group", "value"] : ["folder", "documents", "headings", "modified"];
  const numbers = s.groupBy ? ["value", ...(s.groupBy.field === "documents" || s.groupBy.field === "headings" ? ["group"] : [])] : ["documents", "headings"];
  for (const p of view.layout.children) {
    const bound = p.component === "Table" ? p.columns : [p.x, p.y];
    if (bound.some(f => !fields.includes(f))) fail("Binding outside operation output schema");
    if (p.component === "BarChart" && !numbers.includes(p.y)) fail("BarChart y must be numeric");
  }
  if (s.sort && !fields.includes(s.sort.field)) fail("Sort field outside output schema");
  for (const f of s.filters) {
    const valid = (v: unknown) => f.field === "folder" ? typeof v === "string" : f.field === "modified" ? v === null || typeof v === "string" && isoDate.safeParse(v).success : typeof v === "number";
    if (f.op === "eq" && !valid(f.value)) fail("Filter value type mismatch");
    if (f.op === "range") {
      if (f.field === "folder" || f.min === undefined && f.max === undefined || [f.min, f.max].some(v => v !== undefined && (v === null || !valid(v)))) fail("Invalid range bounds");
      if (f.min != null && f.max != null && compare(f.min, f.max) > 0) fail("Reversed range bounds");
    }
  }
});
export type View = z.infer<typeof viewSchema>;
const isoDate = z.iso.datetime({ precision: 3 });
export const statisticsRowsSchema = z.array(z.strictObject({ folder: z.string().max(512), documents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), headings: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), modified: isoDate.nullable() })).max(VIEW_LIMITS.rows);
export type StatisticsRow = z.infer<typeof statisticsRowsSchema>[number];
export type ViewRow = Record<string, string | number | null>;

function size(text: string): void {
  if (new TextEncoder().encode(text).length > VIEW_LIMITS.bytes) throw new Error("View exceeds byte limit");
}
export function validateView(value: unknown): View {
  const text = JSON.stringify(value);
  if (text === undefined) throw new Error("View must be JSON");
  size(text);
  return viewSchema.parse(value);
}
export function parseView(text: string): View { size(text); return validateView(JSON.parse(text)); }
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => compare(a, b)).map(([k, v]) => [k, ordered(v)]));
  return value;
}
export function serializeView(value: unknown): string {
  const text = JSON.stringify(ordered(validateView(value)), null, 2) + "\n";
  size(text);
  return text;
}
function compare(a: string | number | null, b: string | number | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
}
function dateGroup(value: string, interval: "day" | "week" | "month"): string {
  const d = new Date(value);
  if (interval === "week") d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  const date = d.toISOString().split("T")[0];
  return interval === "month" ? date.slice(0, -3) : date;
}
/** Sole evaluation path for Host, CLI and app. No I/O and no expressions. */
export function evaluateView(input: unknown, data: unknown): { rows: ViewRow[] } {
  const s = validateView(input).sources.stats;
  let raw = statisticsRowsSchema.parse(data).filter(row => s.filters.every(f => {
    const value = row[f.field];
    if (f.op === "eq") return value === f.value;
    if (f.op === "contains") return row.folder.includes(f.value);
    return value !== null && (f.min === undefined || compare(value, f.min) >= 0) && (f.max === undefined || compare(value, f.max) <= 0);
  }));
  // Stable, locale-independent input order also fixes floating point accumulation order.
  raw = raw.sort((a, b) => { for (const key of ["folder", "documents", "headings", "modified"] as Field[]) { const n = compare(a[key], b[key]); if (n) return n; } return 0; });
  let rows: ViewRow[] = raw;
  if (s.groupBy && s.aggregate) {
    const groups = new Map<string | number | null, StatisticsRow[]>();
    for (const row of raw) {
      const value = row[s.groupBy.field];
      const key = s.groupBy.field === "modified" && typeof value === "string" ? dateGroup(value, s.groupBy.interval) : value;
      const group = groups.get(key) ?? [];
      group.push(row); groups.set(key, group);
    }
    const aggregation = s.aggregate;
    rows = [...groups].sort(([a], [b]) => compare(a, b)).map(([group, members]) => {
      let value: number;
      if (aggregation.op === "count") value = members.length;
      else {
        const values = members.map(row => row[aggregation.field]);
        if (aggregation.op === "min") value = Math.min(...values);
        else if (aggregation.op === "max") value = Math.max(...values);
        else { value = values.reduce((a, b) => a + b, 0); if (aggregation.op === "avg") value /= values.length; }
      }
      if (!Number.isFinite(value)) throw new Error("Non-finite aggregate result");
      return { group, value };
    });
  }
  if (s.sort) { const sort = s.sort; rows.sort((a, b) => compare(a[sort.field], b[sort.field]) * (sort.direction === "desc" ? -1 : 1)); }
  return { rows: rows.slice(0, s.limit) };
}

export const viewCatalog = { schema: z.toJSONSchema(viewSchema), result: z.toJSONSchema(statisticsRowsSchema), limits: VIEW_LIMITS, effect: "read", scope: "opened folder" };
