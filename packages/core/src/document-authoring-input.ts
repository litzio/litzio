import { DOCUMENT_STATUSES } from "./status.ts";
import { z } from "zod";
import { ADMONITION_VARIANTS } from "./myst/admonition.ts";
import type { InlineContent } from "./inline.ts";
import { LIST_STYLES, type ListContent, type ListItemContent } from "./list.ts";
import { locateTableCells } from "./myst/table-grid.ts";
import type { MystNode } from "./myst/tree.ts";
import { writeIssueOf } from "./write-error.ts";

export const DOCUMENT_AUTHORING_LIMITS = { bytes: 4 * 1024 * 1024, inputs: 5000, blocks: 5000, string: 16384, tableRows: 500, tableColumns: 32, tableCells: 8000 } as const;
/** Canonical authoring/serialization semantics used by portable derived snapshots. */
export const DOCUMENT_AUTHORING_CONTRACT = "core-authoring-1";
const text = z.string().max(DOCUMENT_AUTHORING_LIMITS.string).refine(value => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value));
// These schemas describe Core operation types, not another document representation.
const inline: z.ZodType<InlineContent> = z.lazy(() => z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("text"), text }),
  z.strictObject({ kind: z.literal("break") }),
  z.strictObject({ kind: z.enum(["math", "code"]), value: text }),
  z.strictObject({ kind: z.enum(["strong", "emphasis", "delete", "subscript", "superscript"]), children: z.array(inline) }),
  z.strictObject({ kind: z.literal("link"), url: text, title: text.optional(), children: z.array(inline) }),
  z.strictObject({ kind: z.literal("reference"), role: z.enum(["eq", "numref", "ref"]), label: text }),
  z.strictObject({ kind: z.literal("footnote"), label: text }),
  z.strictObject({ kind: z.literal("citation"), role: z.enum(["cite", "cite:t", "cite:p"]), keys: z.array(text) }),
]));
const content = z.array(inline);
const listItem: z.ZodType<ListItemContent> = z.lazy(() => z.strictObject({ content, checked: z.boolean().optional(), list: list.optional() }));
const list: z.ZodType<ListContent> = z.lazy(() => z.strictObject({
  ordered: z.boolean(), checklist: z.boolean().optional(), start: z.number().int().positive().optional(), style: z.enum(LIST_STYLES).optional(),
  delimiter: z.enum([".", ")"]).optional(), items: z.array(listItem).min(1).max(100),
}));
const inlineFields = { text: text.optional(), content: content.optional() };
const tableFields = { notes: z.array(z.union([text, content])).max(DOCUMENT_AUTHORING_LIMITS.blocks).optional(), caption: z.union([text, content]).optional(), label: text.optional(), enumerator: text.optional(), enumerated: z.boolean().optional() };
const align = z.enum(["left", "center", "right"]);
// ADR-0024: the complex grid of `inspect --format json`; rows hold the cells that start in them.
const cellBlock = z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("paragraph"), content }), z.strictObject({ kind: z.literal("list"), list })]);
const complexCell = z.strictObject({ column: z.number().int().nonnegative().optional(), rowspan: z.number().int().positive().optional(), colspan: z.number().int().positive().optional(),
  align: align.optional(), blocks: z.array(cellBlock).min(1).max(DOCUMENT_AUTHORING_LIMITS.blocks) });
const table = z.discriminatedUnion("grid", [
  z.strictObject({ kind: z.literal("table"), grid: z.literal("complex"), headerRows: z.number().int().positive().max(DOCUMENT_AUTHORING_LIMITS.tableRows),
    rows: z.array(z.strictObject({ cells: z.array(complexCell).max(DOCUMENT_AUTHORING_LIMITS.tableColumns) })).min(1).max(DOCUMENT_AUTHORING_LIMITS.tableRows), ...tableFields }),
  z.strictObject({ kind: z.literal("table"), grid: z.undefined().optional(), rows: z.array(z.array(z.union([text, content])).min(1).max(DOCUMENT_AUTHORING_LIMITS.tableColumns)).min(1).max(DOCUMENT_AUTHORING_LIMITS.tableRows),
    align: z.array(align.nullable()).optional(), ...tableFields }),
]);

/** Why a complex grid's spans do not fit: the same checks Core applies before it expands a span. */
function complexGridIssue(grid: { headerRows: number; rows: { cells: { column?: number; rowspan?: number; colspan?: number }[] }[] }): string | undefined {
  const skeleton: MystNode = { type: "table", headerRows: grid.headerRows, children: grid.rows.map((row, index) => ({ type: "tableRow",
    children: row.cells.map(cell => ({ type: "tableCell", ...(index < grid.headerRows ? { header: true } : {}), ...(cell.column !== undefined ? { column: cell.column } : {}),
      rowspan: cell.rowspan ?? 1, colspan: cell.colspan ?? 1, children: [{ type: "paragraph", children: [] }] })) })) };
  try { locateTableCells(skeleton, []); return undefined; }
  catch (error) { return writeIssueOf(error).reason; }
}
const block = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("paragraph"), ...inlineFields }),
  z.strictObject({ kind: z.literal("heading"), level: z.number().int().min(1).max(6), ...inlineFields }),
  z.strictObject({ kind: z.literal("quote"), ...inlineFields }),
  z.strictObject({ kind: z.literal("admonition"), variant: z.enum(ADMONITION_VARIANTS), ...inlineFields }),
  z.strictObject({ kind: z.literal("footnote"), label: text, ...inlineFields }),
  z.strictObject({ kind: z.literal("target"), label: text }),
  z.strictObject({ kind: z.literal("list"), ordered: z.boolean(), checklist: z.boolean().optional(), start: z.number().int().positive().optional(),
    style: z.enum(LIST_STYLES).optional(), delimiter: z.enum([".", ")"]).optional(), items: z.array(z.union([text, listItem])).min(1).max(100) }),
  table,
  z.strictObject({ kind: z.literal("figure"), imageUrl: text.optional(), imageAsset: text.min(1).max(512).optional(), imageAlt: text, caption: z.union([text, content]), label: text.optional(), enumerator: text.optional(), enumerated: z.boolean().optional() }).refine(value => (value.imageUrl !== undefined) !== (value.imageAsset !== undefined), "Expected imageUrl or imageAsset"),
  z.strictObject({ kind: z.literal("code"), language: text, code: text }),
  z.strictObject({ kind: z.literal("equation"), latex: text, label: text.optional(), enumerator: text.optional() }),
  z.strictObject({ kind: z.literal("divider") }),
]).superRefine((value, ctx) => {
  if (value.kind === "table" && value.grid === "complex") {
    const issue = complexGridIssue(value);
    if (issue) ctx.addIssue({ code: "custom", message: issue });
  } else if (value.kind === "table" && value.rows.reduce((sum, row) => sum + row.length, 0) > DOCUMENT_AUTHORING_LIMITS.tableCells)
    ctx.addIssue({ code: "custom", message: `Table exceeds ${DOCUMENT_AUTHORING_LIMITS.tableCells} cells` });
  if ((value.kind === "paragraph" || value.kind === "heading" || value.kind === "quote" || value.kind === "admonition" || value.kind === "footnote") && (value.text === undefined) === (value.content === undefined))
    ctx.addIssue({ code: "custom", message: "Expected exactly one of text or content" });
});
export const documentAuthoringSchema = z.strictObject({ status: z.enum(DOCUMENT_STATUSES).optional(), title: text.optional(), inputs: z.array(z.strictObject({
  key: text.min(1).max(512), blocks: z.array(block).max(DOCUMENT_AUTHORING_LIMITS.blocks),
})).max(DOCUMENT_AUTHORING_LIMITS.inputs) }).superRefine((value, ctx) => {
  // Count nested list items, table note paragraphs and table cell blocks as blocks too; inline atoms and every nested string are bounded by bytes/string limits.
  let nested = 0;
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (!Array.isArray(node) && "items" in node && Array.isArray(node.items)) nested += node.items.length;
    if ("notes" in node && Array.isArray(node.notes)) nested += node.notes.length;
    // A complex table cell's paragraphs and lists; their list items count above.
    if ("blocks" in node && Array.isArray(node.blocks) && !("key" in node)) nested += node.blocks.length;
    for (const child of Object.values(node)) visit(child);
  };
  visit(value);
  if (nested + value.inputs.reduce((sum, input) => sum + input.blocks.length, 0) > DOCUMENT_AUTHORING_LIMITS.blocks)
    ctx.addIssue({ code: "custom", message: "Too many blocks including list items and table notes" });
  if (new Set(value.inputs.map(input => input.key)).size !== value.inputs.length) ctx.addIssue({ code: "custom", message: "Duplicate input key" });
  if (value.inputs.reduce((sum, input) => sum + input.blocks.length, 0) > DOCUMENT_AUTHORING_LIMITS.blocks) ctx.addIssue({ code: "custom", message: "Too many blocks" });
});
export type DocumentAuthoringInput = z.infer<typeof documentAuthoringSchema>;
