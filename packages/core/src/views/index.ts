import { z } from "zod";

// Spike v0: finite catalog, no expressions, remote resources or action language.
const text = z.string().min(1).max(160).refine(v => !/[<>\u0000-\u001f]|(?:https?:|javascript:|data:|=>|\bfunction\b|\b(?:alert|eval|fetch|url)\s*\(|[{};])/i.test(v), "Only plain labels are allowed");
export const fields = ["folder", "documents", "headings", "modified"] as const;
const field = z.enum([...fields, "setting", "value"]);
const source = z.strictObject({ operation: z.literal("folder.statistics"), version: z.literal(1), args: z.strictObject({ folder: text.optional(), sort: z.enum(["folder", "documents", "headings", "modified"]).default("folder"), descending: z.boolean().default(false) }) });
const table = z.strictObject({ component: z.literal("Table"), title: text, source: z.literal("stats"), data: z.literal("/rows"), columns: z.array(field).min(1).max(4).refine(v => new Set(v).size === v.length, "Duplicate columns") });
const chart = z.strictObject({ component: z.literal("BarChart"), title: text, source: z.literal("stats"), data: z.literal("/rows"), x: z.literal("folder"), y: z.enum(["documents", "headings"]) });
export const viewSchema = z.strictObject({ kind: z.literal("litzio-view"), schemaVersion: z.literal(0), catalog: z.literal("litzio-spike-v0"), title: text, refresh: z.literal("manual"), sources: z.strictObject({ stats: z.union([source, z.strictObject({ operation: z.literal("app.about-fixture"), version: z.literal(1), args: z.strictObject({}) })]) }), layout: z.strictObject({ component: z.literal("VerticalPanel"), children: z.array(z.discriminatedUnion("component", [table, chart])).min(1).max(6) }) }).superRefine((view, ctx) => {
  const about = view.sources.stats.operation === "app.about-fixture";
  for (const panel of view.layout.children) {
    if (panel.component === "BarChart" && about || panel.component === "Table" && panel.columns.some(c => about ? !["setting", "value"].includes(c) : !fields.includes(c as typeof fields[number]))) ctx.addIssue({ code: "custom", message: "Binding does not belong to operation output schema" });
  }
});
export type View = z.infer<typeof viewSchema>;
export const rowSchema = z.strictObject({ folder: z.string().max(512), documents: z.number().int().nonnegative(), headings: z.number().int().nonnegative(), modified: z.string().datetime().nullable() });
export const rowsSchema = z.array(z.union([rowSchema, z.strictObject({ setting: z.string().max(160), value: z.string().max(512) })])).max(100);
export type ViewRow = z.infer<typeof rowsSchema>[number];
export function validateView(value: unknown): View {
  if (JSON.stringify(value).length > 16384) throw new Error("View exceeds 16 KiB");
  return viewSchema.parse(value);
}
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([k, v]) => [k, ordered(v)]));
  return value;
}
export function serializeView(value: unknown): string { return JSON.stringify(ordered(validateView(value)), null, 2) + "\n"; }
export function parseView(source: string): View {
  if (source.length > 16384) throw new Error("View exceeds 16 KiB");
  return validateView(JSON.parse(source));
}
export const viewCatalog = { schema: z.toJSONSchema(viewSchema), result: z.toJSONSchema(rowsSchema), effect: "read", scope: "opened folder", limits: { rows: 100, files: 1000, fileBytes: 1048576 }, note: "folder exact filter; sort and descending supported. Unsupported requested fields must be reported, never invented." };
