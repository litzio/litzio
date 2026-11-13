import { z } from "zod";

export const DOCUMENT_AUTHORING_LIMITS = { bytes: 4 * 1024 * 1024, inputs: 5000, blocks: 5000, string: 16384, tableRows: 100, tableColumns: 32 } as const;
/** Canonical authoring/serialization semantics used by portable derived snapshots. */
export const DOCUMENT_AUTHORING_CONTRACT = "core-authoring-1";
const text = z.string().max(DOCUMENT_AUTHORING_LIMITS.string).refine(value => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value));
const block = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("paragraph"), text }),
  z.strictObject({ kind: z.literal("heading"), level: z.number().int().min(1).max(6), text }),
  z.strictObject({ kind: z.literal("list"), ordered: z.boolean(), start: z.number().int().positive().optional(), items: z.array(text).min(1).max(100) }),
  z.strictObject({ kind: z.literal("table"), rows: z.array(z.array(text).min(1).max(DOCUMENT_AUTHORING_LIMITS.tableColumns)).min(1).max(DOCUMENT_AUTHORING_LIMITS.tableRows), enumerator: text.optional(), enumerated: z.boolean().optional() }),
  z.strictObject({ kind: z.literal("figure"), imageUrl: text.optional(), imageAsset: text.min(1).max(512).optional(), imageAlt: text, caption: text, enumerator: text.optional(), enumerated: z.boolean().optional() }).refine(value => (value.imageUrl !== undefined) !== (value.imageAsset !== undefined), "Expected imageUrl or imageAsset"),
  z.strictObject({ kind: z.literal("code"), language: text, code: text }),
  z.strictObject({ kind: z.literal("equation"), latex: text, enumerator: text.optional() }),
  z.strictObject({ kind: z.literal("divider") }),
]);
export const documentAuthoringSchema = z.strictObject({ title: text.optional(), inputs: z.array(z.strictObject({
  key: text.min(1).max(512), blocks: z.array(block).max(DOCUMENT_AUTHORING_LIMITS.blocks),
})).max(DOCUMENT_AUTHORING_LIMITS.inputs) }).superRefine((value, ctx) => {
  if (new Set(value.inputs.map(input => input.key)).size !== value.inputs.length) ctx.addIssue({ code: "custom", message: "Duplicate input key" });
  if (value.inputs.reduce((sum, input) => sum + input.blocks.length, 0) > DOCUMENT_AUTHORING_LIMITS.blocks) ctx.addIssue({ code: "custom", message: "Too many blocks" });
});
export type DocumentAuthoringInput = z.infer<typeof documentAuthoringSchema>;
