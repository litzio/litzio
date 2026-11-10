import { z } from "zod";
import { DOCUMENT_AUTHORING_CONTRACT } from "@litzio/core";
import { generatedInputsSchema, generatedProgressSchema } from "./generated-document.ts";

/** Bump when canonical authoring/serialization or stable image binding semantics change. */
export const REVIEW_AUTHORING_CONTRACT = `${DOCUMENT_AUTHORING_CONTRACT}/review-images-1`;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(512);
export const workspaceSnapshotSchema = z.strictObject({
  source: z.string().max(4 * 1024 * 1024), documentRevision: hash, inputs: generatedInputsSchema,
  contentRevision: hash, cacheKey: hash, adapterVersion: id, authoringContract: id,
  images: z.array(z.strictObject({ key: id, ref: id, revision: hash, mime: z.enum(["image/png", "image/jpeg", "image/webp"]) })).max(5000),
});
export const workspaceStateSchema = z.strictObject({
  record: z.record(z.string(), z.unknown()), items: z.array(z.record(z.string(), z.unknown())).max(10000),
  snapshot: workspaceSnapshotSchema.nullable(), cacheState: z.enum(["missing", "invalid", "current", "created-version"]),
});
const common = { root: id, workspace: id, plugin: id, job: id };
export const workspaceRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...common, action: z.literal("workspace-read") }),
  ...(["workspace-open", "workspace-regenerate"] as const).map(action => z.strictObject({ ...common, action: z.literal(action), baseline: hash, requestId: z.uuid() })),
  z.strictObject({ ...common, action: z.literal("workspace-patch"), baseline: hash, requestId: z.uuid(), patches: z.array(z.record(z.string(), z.unknown())).min(1).max(2000) }),
  z.strictObject({ ...common, action: z.literal("workspace-progress"), baseline: hash, requestId: z.uuid(), progress: generatedProgressSchema }),
  z.strictObject({ action: z.literal("workspace-status"), requestId: z.uuid() }),
]);
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;
