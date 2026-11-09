import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const patches = z.array(z.record(z.string(), z.unknown())).max(2000);
/** Plugin-owned patch semantics; Host-owned durable record and file baselines. */
export const documentReviewRecordSchema = z.strictObject({
  plugin: z.string().min(1), job: z.string().min(1),
  source: z.strictObject({ path: z.string().min(1), hash }), patches,
  checkedPages: z.array(z.number().int().positive()).max(2000),
  lastPage: z.number().int().positive().nullable(), approval: z.null(),
});
export const documentReviewBaselineSchema = z.strictObject({
  sourceHash: hash, reviewRevision: hash.nullable(), documentRevision: hash.nullable(),
});
const common = { root: z.string().min(1), document: z.string().min(1) };
export const documentReviewRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...common, action: z.literal("generated-open"), plugin: z.string().min(1), job: z.string().min(1), source: z.string().min(1), baseline: documentReviewBaselineSchema, requestId: z.uuid() }),
  z.strictObject({ ...common, action: z.literal("generated-read") }),
  z.strictObject({ ...common, action: z.literal("generated-patch"), baseline: documentReviewBaselineSchema, patches: patches.min(1), requestId: z.uuid() }),
  z.strictObject({ ...common, action: z.literal("generated-regenerate"), baseline: documentReviewBaselineSchema, requestId: z.uuid() }),
  z.strictObject({ action: z.literal("generated-status"), requestId: z.uuid() }),
]);
export const documentReviewBuildSchema = z.strictObject({ source: z.string().max(262144) });
export const documentReviewValidationSchema = z.strictObject({ items: z.array(z.record(z.string(), z.unknown())).max(2000) });
export type DocumentReviewRecord = z.infer<typeof documentReviewRecordSchema>;
export type DocumentReviewBaseline = z.infer<typeof documentReviewBaselineSchema>;
