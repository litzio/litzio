import { z } from "zod";
import { DOCUMENT_AUTHORING_CONTRACT } from "@litzio/core";
import { generatedInputsSchema, generatedProgressSchema } from "./generated-document.ts";
import { reviewLedgerSchema, reviewLedgerChangeSchema } from "./review-ledger.ts";

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
  ledger: reviewLedgerSchema.optional(),
});
const common = { root: id, workspace: id, plugin: id, job: id };
export const workspaceRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...common, action: z.literal("workspace-read") }),
  z.strictObject({ action: z.literal("workspace-find"), root: id, path: id.optional() }),
  z.strictObject({ ...common, action: z.literal("workspace-compare"), pageNo: z.number().int().positive().optional(), baseline: hash.optional() }),
  z.strictObject({ ...common, action: z.literal("workspace-image"), baseline: hash, ref: hash }),
  z.strictObject({ ...common, action: z.literal("workspace-export-check"), baseline: hash, output: id.optional() }),
  z.strictObject({ ...common, action: z.literal("workspace-export"), mode: z.literal("current"), baseline: hash, requestId: z.uuid(), output: id.optional(), targetRevision: hash.nullable(), overwrite: z.boolean().default(false) }),
  ...(["workspace-open", "workspace-regenerate"] as const).map(action => z.strictObject({ ...common, action: z.literal(action), baseline: hash, requestId: z.uuid() })),
  z.strictObject({ ...common, action: z.literal("workspace-patch"), baseline: hash, requestId: z.uuid(), patches: z.array(z.record(z.string(), z.unknown())).min(1).max(2000) }),
  z.strictObject({ ...common, action: z.literal("workspace-progress"), baseline: hash, requestId: z.uuid(), progress: generatedProgressSchema }),
  z.strictObject({ action: z.literal("workspace-status"), requestId: z.uuid() }),
  z.discriminatedUnion("mode", [
    z.strictObject({ ...common, action: z.literal("workspace-evidence"), mode: z.literal("read") }),
    z.strictObject({ ...common, action: z.literal("workspace-evidence"), mode: z.literal("run"), baseline: hash, requestId: z.uuid(), pages: z.array(z.number().int().positive()).min(1).max(10000).optional() }),
  ]),
  z.strictObject({ ...common, action: z.literal("workspace-groups-read") }),
  ...(["workspace-inspection", "workspace-required-checks", "workspace-completion"] as const).map(action => z.strictObject({ ...common, action: z.literal(action) })),
  z.strictObject({ ...common, action: z.literal("workspace-review-change"), baseline: hash, requestId: z.uuid(), change: reviewLedgerChangeSchema }),
]);
/** P5 adapter contract only: these use the same dispatcher schema, with no AI registration in P2.
 * Human confirmation is required for approve/reject/undo/completion and cannot be synthesized by an assistant.
 * Propose accepts change.supersedes [{groupId,targetIds,replacementGroupId}] through that same schema and CLI;
 * it closes only open proposals with linked history, and grants no approval or relaxed target-content check.
 */
export const REVIEW_LEDGER_OPERATIONS = { version: 1, scope: "workspace", inputSchema: z.toJSONSchema(workspaceRequestSchema),
  assistant: { propose: "workspace-review-change:groups-propose", read: "workspace-groups-read", inspection: "workspace-inspection", requiredChecks: "workspace-required-checks", completion: "workspace-completion" },
  humanOnly: ["groups-approve", "groups-reject", "groups-undo", "completion"] } as const;
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;

/** Contract only; assistant runtime registration belongs to stage 5. Run saves inspection records, never proposals. */
export const REVIEW_EVIDENCE_OPERATION = { version: 1, scope: "workspace", action: "workspace-evidence", modes: ["read", "run"], inputSchema: z.toJSONSchema(workspaceRequestSchema), assistantRegistered: false } as const;
