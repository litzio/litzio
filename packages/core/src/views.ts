import { z } from "zod";
import { rowSchema, parseOperationRows, OPERATION_ROW_LIMIT, type RowSchema } from "./operation-rows.ts";
export { rowSchema, parseOperationRows, type RowSchema } from "./operation-rows.ts";

export const VIEW_LIMITS = { bytes: 32768, panels: 8, rows: OPERATION_ROW_LIMIT } as const;
const label = z.string().min(1).max(160).refine(v => !/[<>\u0000-\u001f]|(?:https?:|javascript:|data:)/i.test(v), "Plain label required");
export type ViewOperation = { operation: string; version: number; rowSchema: RowSchema; inputSchema: Record<string, unknown>; validateArgs(args: unknown): boolean };
const field = z.string().min(1).max(80);
const scalar = z.union([z.string().max(512), z.number().finite(), z.boolean(), z.null()]);
const filter = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("eq"), field, value: scalar }),
  z.strictObject({ op: z.literal("contains"), field, value: z.string().max(512) }),
  z.strictObject({ op: z.literal("range"), field, min: scalar.optional(), max: scalar.optional() }),
]);
const aggregate = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("count") }),
  z.strictObject({ op: z.enum(["sum", "avg", "min", "max"]), field }),
]);
const groupBy = z.strictObject({ field, interval: z.enum(["day", "week", "month"]).optional() });
const outputField = field;
const folderArgs = z.strictObject({ folder: z.string().min(1).max(512).refine(v => v === "." || (!/[:\\\u0000-\u001f]/.test(v) && !v.startsWith("/") && v.split("/").every(p => p && p !== "." && p !== "..")), "Relative folder required").optional() });
export const statisticsOperation: ViewOperation = {
  operation: "folder.statistics", version: 1,
  inputSchema: z.toJSONSchema(folderArgs), validateArgs: args => folderArgs.safeParse(args).success,
  rowSchema: rowSchema.parse({ folder: { type: "string", label: "folder" }, documents: { type: "number", label: "documents" }, headings: { type: "number", label: "headings" }, modified: { type: "string", date: true, nullable: true, label: "modified" } }),
};
export const builtinViewOperations = [statisticsOperation];
const source = z.strictObject({
  operation: z.string().min(1).max(160), version: z.number().int().positive(), args: z.record(z.string(), z.unknown()),
  filters: z.array(filter).max(8).default([]), groupBy: groupBy.optional(), aggregate: aggregate.optional(),
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
});
function validateBindings(view: View, operations: readonly ViewOperation[]) {
  const s = view.sources.stats;
  const op = operations.find(op => op.operation === s.operation && op.version === s.version);
  if (!op) throw new Error("Operation unavailable or missing row schema");
  if (!op.validateArgs(s.args)) throw new Error("Invalid operation args");
  const declared = rowSchema.parse(op.rowSchema);
  const fields = Object.fromEntries(Object.entries(declared).filter(([, f]) => !f.secret));
  const get = (name: string) => { if (!Object.hasOwn(fields, name)) throw new Error("Binding outside operation output schema"); return fields[name]!; };
  if (!!s.groupBy !== !!s.aggregate) throw new Error("groupBy and aggregate must be specified together");
  if (s.groupBy) { const f = get(s.groupBy.field); if (f.date !== !!s.groupBy.interval) throw new Error("Date grouping requires interval; other fields forbid interval"); }
  if (s.aggregate && s.aggregate.op !== "count" && get(s.aggregate.field).type !== "number") throw new Error("Aggregate field must be numeric");
  for (const f of s.filters) {
    const definition = get(f.field);
    const valid = (v: unknown) => v === null ? definition.nullable : typeof v === definition.type && (!definition.date || isoDate.safeParse(v).success);
    if (f.op === "eq" && !valid(f.value)) throw new Error("Filter value type mismatch");
    if (f.op === "contains" && (definition.type !== "string" || definition.date)) throw new Error("Contains requires text field");
    if (f.op === "range" && (!(definition.type === "number" || definition.date) || f.min === undefined && f.max === undefined || [f.min, f.max].some(v => v !== undefined && (v === null || !valid(v))) || f.min != null && f.max != null && compare(f.min, f.max) > 0)) throw new Error("Invalid range bounds");
  }
  const output: RowSchema = s.groupBy ? { group: { ...get(s.groupBy.field), date: false }, value: { type: "number", label: "value", date: false, nullable: false, secret: false } } : fields;
  const outputField = (name: string) => { if (!Object.hasOwn(output, name)) throw new Error("Binding outside operation output schema"); return output[name]!; };
  for (const p of view.layout.children) {
    for (const name of p.component === "Table" ? p.columns : [p.x, p.y]) outputField(name);
    if (p.component === "BarChart" && outputField(p.y).type !== "number") throw new Error("BarChart y must be numeric");
  }
  if (s.sort) outputField(s.sort.field);
  return fields;
}
export type View = z.infer<typeof viewSchema>;
const isoDate = z.iso.datetime({ precision: 3 });
export const statisticsRowsSchema = z.array(z.strictObject({ folder: z.string().max(512), documents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), headings: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), modified: isoDate.nullable() })).max(VIEW_LIMITS.rows);
export type StatisticsRow = z.infer<typeof statisticsRowsSchema>[number];
export type ViewRow = Record<string, string | number | boolean | null>;

function size(text: string): void {
  if (new TextEncoder().encode(text).length > VIEW_LIMITS.bytes) throw new Error("View exceeds byte limit");
}
export function validateView(value: unknown, operations: readonly ViewOperation[] = builtinViewOperations): View {
  const text = JSON.stringify(value);
  if (text === undefined) throw new Error("View must be JSON");
  size(text);
  const view = viewSchema.parse(value); validateBindings(view, operations); return view;
}
export function parseView(text: string, operations: readonly ViewOperation[] = builtinViewOperations): View { size(text); return validateView(JSON.parse(text), operations); }
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => compare(a, b)).map(([k, v]) => [k, ordered(v)]));
  return value;
}
export function serializeView(value: unknown, operations: readonly ViewOperation[] = builtinViewOperations): string {
  const text = JSON.stringify(ordered(validateView(value, operations)), null, 2) + "\n";
  size(text);
  return text;
}
function compare(a: ViewRow[string], b: ViewRow[string]): number {
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
export function evaluateView(input: unknown, data: unknown, operations: readonly ViewOperation[] = builtinViewOperations): { rows: ViewRow[] } {
  const view = validateView(input, operations), s = view.sources.stats;
  const fields = validateBindings(view, operations);
  let raw = parseOperationRows(data, operations.find(op => op.operation === s.operation && op.version === s.version)!.rowSchema).filter(row => s.filters.every(f => {
    const value = row[f.field];
    if (f.op === "eq") return value === f.value;
    if (f.op === "contains") return typeof value === "string" && value.includes(f.value);
    return value !== null && (f.min === undefined || compare(value, f.min) >= 0) && (f.max === undefined || compare(value, f.max) <= 0);
  }));
  // Stable, locale-independent input order also fixes floating point accumulation order.
  raw = raw.sort((a, b) => { for (const key of Object.keys(fields)) { const n = compare(a[key], b[key]); if (n) return n; } return 0; });
  let rows: ViewRow[] = raw;
  if (s.groupBy && s.aggregate) {
    const groups = new Map<ViewRow[string], ViewRow[]>();
    for (const row of raw) {
      const value = row[s.groupBy.field];
      const key = s.groupBy.interval && typeof value === "string" ? dateGroup(value, s.groupBy.interval) : value;
      const group = groups.get(key) ?? [];
      group.push(row); groups.set(key, group);
    }
    const aggregation = s.aggregate;
    rows = [...groups].sort(([a], [b]) => compare(a, b)).map(([group, members]) => {
      let value: number;
      if (aggregation.op === "count") value = members.length;
      else {
        const values = members.map(row => { const value = row[aggregation.field]; if (typeof value !== "number") throw new Error("Aggregate requires non-null numbers"); return value; });
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

export function createViewCatalog(operations: readonly ViewOperation[] = builtinViewOperations) {
  return { schema: z.toJSONSchema(viewSchema), operations: operations.map(op => ({ operation: op.operation, version: op.version, inputSchema: op.inputSchema, rowSchema: Object.fromEntries(Object.entries(op.rowSchema).filter(([, f]) => !f.secret)) })), limits: VIEW_LIMITS, effect: "read", scope: "target Host" };
}
export const viewCatalog = createViewCatalog();
