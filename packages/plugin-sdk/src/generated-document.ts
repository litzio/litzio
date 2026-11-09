import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1);
/** Host-owned connection only. All source-format state stays inside the plugin-owned file. */
export const generatedDocumentBaselineSchema = z.strictObject({ sourceRevision: hash, documentRevision: hash.nullable(), linkRevision: hash.nullable() });
export const generatedProgressSchema = z.strictObject({ checkedPages: z.array(z.number().int().positive()).max(2000).refine(pages => new Set(pages).size === pages.length, "Duplicate checked page"), lastPage: z.number().int().positive().nullable() });
export const generatedTargetSchema = z.strictObject({ path: z.array(z.number().int().nonnegative()), documentRevision: hash, documentHash: hash });
export const generatedInputsSchema = z.array(z.strictObject({ key: id, targets: z.array(generatedTargetSchema) })).max(5000);
export const generatedDocumentLinkSchema = z.strictObject({ plugin: id, job: id, source: id, generatedFrom: hash.nullable(), generatedRevision: hash.nullable(), inputs: generatedInputsSchema.optional() });
const common = { root: id, document: id };
export const generatedDocumentRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...common, action: z.literal("generated-open"), plugin: id, job: id, source: id, baseline: generatedDocumentBaselineSchema, requestId: z.uuid() }),
  z.strictObject({ ...common, action: z.literal("generated-read") }),
  z.strictObject({ ...common, action: z.literal("generated-compare"), pageNo: z.number().int().positive().optional() }),
  z.strictObject({ ...common, action: z.literal("generated-progress"), baseline: generatedDocumentBaselineSchema, progress: generatedProgressSchema, requestId: z.uuid() }),
  z.strictObject({ ...common, action: z.literal("generated-patch"), baseline: generatedDocumentBaselineSchema, patches: z.array(z.record(z.string(), z.unknown())).min(1).max(2000), requestId: z.uuid() }),
  z.strictObject({ ...common, action: z.literal("generated-regenerate"), baseline: generatedDocumentBaselineSchema, requestId: z.uuid() }),
  z.strictObject({ action: z.literal("generated-status"), requestId: z.uuid() }),
]);
/** Plugins prepare a candidate, then Host verifies and publishes the exact staging bytes. */
export const generatedDocumentStateSchema = z.strictObject({ record: z.record(z.string(), z.unknown()), items: z.array(z.record(z.string(), z.unknown())).max(10000) });
export type GeneratedDocumentLink = z.infer<typeof generatedDocumentLinkSchema>;
