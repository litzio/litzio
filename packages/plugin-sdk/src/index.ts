import { reviewBundleSchema, reviewPageSchema, reviewMappingSchema, type ReviewBundle } from "@litzio/core/views-v2";
import { queryViewSchema, reviewContributionSchema, validateCatalogView, compileViewInputSchema } from "@litzio/core/views-v2";
export * from "@litzio/core/views-v2";
export { authorDocument, documentAuthoringSchema, DOCUMENT_AUTHORING_LIMITS, DocumentAuthoringError, type DocumentAuthoringInput, type AuthoredDocument } from "@litzio/core";
import { rowSchema, type ViewOperation } from "@litzio/core/views";
export { rowSchema, type RowSchema } from "@litzio/core/views";
import { compileSchema } from "./schema.ts";
import { z } from "zod";
import semver from "semver";
export const SDK_VERSION = "0.2.0";
// Actual SDK contracts still implemented by this Host, not hypothetical versions
// between releases. Additive releases retain earlier contracts; breaking releases
// remove contracts they no longer implement.
const supportedSdkVersions = ["0.1.0", SDK_VERSION];
const id = z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
const schema = z.record(z.string(), z.unknown());
const operation = z.strictObject({ id, version: z.number().int().positive(), effect: z.enum(["read", "write"]), assistant: z.boolean().default(false), scope: z.enum(["host", "folder"]), inputSchema: schema, outputSchema: schema, rowSchema: rowSchema.optional() });
const extension = z.string().regex(/^\.[a-z0-9]+$/);
const jobFields = { id, title: z.string().min(1), accept: z.array(extension).min(1), start: id, status: id, stop: id };
const jobContributionSchema = z.discriminatedUnion("resultKind", [
  z.strictObject({ ...jobFields, resultKind: z.literal("native-document") }),
  z.strictObject({ ...jobFields, resultKind: z.literal("file"), resultExtension: extension }),
]);
export const SCREEN_ICONS = ["LayoutDashboard", "Table", "ChartColumn", "FileText", "Folder"] as const;
export const screenContributionSchema = z.strictObject({ id, title: queryViewSchema.options[0].shape.title, icon: z.enum(SCREEN_ICONS),
  defaultViewIds: z.array(id).min(1).max(8).refine(ids => new Set(ids).size === ids.length, "Duplicate default view"), primary: z.boolean().default(false) });
export const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1), id, tier: z.enum(["official", "community"]),
  publisher: z.strictObject({ id, name: z.string().min(1) }), name: z.string().min(1), description: z.string().default(""),
  version: z.string().refine(v => !!semver.valid(v), "Invalid SemVer"), requiresSdk: z.string().refine(v => !!semver.validRange(v), "Invalid SDK range"), entry: z.string().min(1),
  contributes: z.strictObject({ operations: z.array(operation).default([]), jobs: z.array(jobContributionSchema).default([]), folderSources: z.array(id).default([]), folderDecorations: z.array(id).default([]), accounts: z.array(id).default([]),
    dataViews: z.array(z.strictObject({ id, operation: id, version: z.number().int().positive() })).default([]),
    generatedUi: z.array(z.strictObject({ id, catalog: z.string(), schemaVersion: z.number().int().positive() })).default([]),
    views: z.array(z.strictObject({ id, title: z.string().min(1), definition: queryViewSchema })).default([]),
    screens: z.array(screenContributionSchema).default([]),
    reviews: z.array(reviewContributionSchema).default([]),
    secretUses: z.array(z.strictObject({ operation: id, secret: id })).default([]) }),
  settingsSchema: schema.default({ type: "object", additionalProperties: false }),
  secrets: z.array(z.strictObject({ id, scope: z.literal("connection"), required: z.boolean() })).default([]),
});
export type PluginManifest = z.infer<typeof manifestSchema>;
export type OperationDefinition = z.infer<typeof operation>;
export function validateManifest(input: unknown): PluginManifest {
  const m = manifestSchema.parse(input);
  if (!supportedSdkVersions.some(version => semver.satisfies(version, m.requiresSdk))) throw new Error("Unsupported SDK range");
  if (/^(?:[a-z]+:|[/\\])/i.test(m.entry) || m.entry.split(/[/\\]/).includes("..")) throw new Error("Entry must stay inside package");
  for (const list of Object.values(m.contributes)) {
    const ids = list.map(item => typeof item === "string" ? item : "id" in item ? item.id : JSON.stringify(item));
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate contribution ID");
  }
  if (m.contributes.operations.some(op => op.scope === "folder")) throw new Error("Folder-scoped plugin operations are unsupported in stage 1");
  if (new Set(m.secrets.map(s => s.id)).size !== m.secrets.length) throw new Error("Duplicate secret ID");
  if (m.contributes.dataViews.length || m.contributes.generatedUi.length || m.contributes.secretUses.length) throw new Error("Unsupported contribution: dataViews, generatedUi and secretUses");
  for (const job of m.contributes.jobs) {
    if (job.resultKind === "file" && !supportedSdkVersions.some(version => semver.gte(version, "0.2.0") && semver.satisfies(version, m.requiresSdk))) throw new Error("File job results require SDK 0.2.0 or later in requiresSdk");
    for (const binding of [job.start, job.status, job.stop]) if (!m.contributes.operations.some(op => op.id === binding)) throw new Error("Undeclared job operation");
    if (new Set([job.start, job.status, job.stop]).size !== 3) throw new Error("Job bindings must be distinct");
    if (m.contributes.operations.find(op => op.id === job.start)?.effect !== "write") throw new Error("Job start must be a write operation");
  }
  compileSchema(m.settingsSchema);
  for (const operation of m.contributes.operations) { if (operation.rowSchema && operation.effect !== "read") throw new Error("Only read operations can declare row schema"); compileViewInputSchema(operation.inputSchema); compileSchema(operation.outputSchema); }
  const viewOperations: ViewOperation[] = m.contributes.operations.filter(op => op.effect === "read" && op.rowSchema).map(op => ({
    operation: `${m.id}.${op.id}`, version: op.version, rowSchema: op.rowSchema!, inputSchema: op.inputSchema, validateArgs: compileViewInputSchema(op.inputSchema),
  }));
  for (const view of m.contributes.views) {
    if (view.definition.owner !== m.id) throw new Error("Default view owner must match plugin");
    validateCatalogView(view.definition, viewOperations);
  }
  if (m.contributes.screens.filter(screen => screen.primary).length > 1) throw new Error("Only one primary screen is allowed");
  for (const screen of m.contributes.screens) for (const viewId of screen.defaultViewIds) if (!m.contributes.views.some(v => v.id === viewId)) throw new Error("Undeclared screen view");
  for (const review of m.contributes.reviews) {
    for (const action of ["read", "propose", "approve", "reject", "undo"] as const) {
      const binding = review[action];
      if (!binding) continue;
      const op = m.contributes.operations.find(op => `${m.id}.${op.id}` === binding.operation && op.version === binding.version);
      if (!op || op.effect !== (action === "read" ? "read" : "write")) throw new Error("Invalid review operation binding");
    }
  }
  return m;
}
export type FolderSource = { id: string; path: string; label: string; defaultCandidate: boolean };
export type FolderDecoration = { id: string; path: string; icon: "onedrive" };
export type AccountStatus = { id: string; label: string; source: string };
export type PluginStatus = { available: boolean; message: string; folders: FolderSource[]; decorations: FolderDecoration[]; accounts: AccountStatus[] };
export type PluginContext = { secrets?: Readonly<Record<string, string>>; settings: Readonly<Record<string, unknown>>; platform: string; env: Readonly<Record<string, string | undefined>>; isDirectory(path: string): boolean };
export type PluginInstance = { operations: Record<string, (input: unknown) => unknown | Promise<unknown>>; status(): PluginStatus | Promise<PluginStatus>; dispose(): void | Promise<void> };
export type PluginModule = { activate(context: PluginContext): PluginInstance | Promise<PluginInstance> };
export type OperationReceipt = { requestId: string; operation: string; version: number; scope: string; outcome: "success" | "refused" | "failure" | "uncertain" };
export { compileSchema } from "./schema.ts";
export const statusSchema = z.strictObject({ available: z.boolean(), message: z.string(),
  folders: z.array(z.strictObject({ id, path: z.string().min(1), label: z.string().min(1), defaultCandidate: z.boolean() })),
  decorations: z.array(z.strictObject({ id, path: z.string().min(1), icon: z.literal("onedrive") })),
  accounts: z.array(z.strictObject({ id, label: z.string().min(1), source: z.string().min(1) })) });
export const pluginManagementSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("secret-status"), id }),
  z.strictObject({ action: z.literal("secret-delete"), id, name: id }),
  z.strictObject({ action: z.literal("list") }),
  z.strictObject({ action: z.literal("scaffold"), directory: z.string().min(1), id }),
  z.strictObject({ action: z.literal("validate"), directory: z.string().min(1) }),
  z.strictObject({ action: z.literal("register"), directory: z.string().min(1) }),
  z.strictObject({ action: z.literal("trust"), id, digest: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.strictObject({ action: z.literal("unregister"), id }),
  z.strictObject({ action: z.literal("reload"), id }), z.strictObject({ action: z.literal("enable"), id }), z.strictObject({ action: z.literal("disable"), id }),
  z.strictObject({ action: z.literal("settings"), id, settings: z.record(z.string(), z.unknown()).optional() }),
]);
export type PluginManagementInput = z.infer<typeof pluginManagementSchema>;
export const PLUGIN_MANAGEMENT = { version: 1, scope: "host", inputSchema: z.toJSONSchema(pluginManagementSchema) } as const;

/** K1 start accepts work and returns running within the 10s RPC budget.
 * Keep background work in the child, catch its failures, and expose it via status.
 * There is no Host job lifetime timeout. stop/dispose must cancel owned resources.
 * Host-validated absolute paths are provided; only Host publishes results.
 */
export const JOB_START_CONTRACT_MESSAGE = "K1 start must accept work and return running within 10 seconds. Keep background work in the child process and report completion through status.";
/** File bytes stay on disk, never in RPC JSON. Host enforces this limit at publication. */
export const JOB_FILE_MAX_BYTES = 2 * 1024 ** 3;
export type JobInput = { requestId: string; root: string; file: string; output: string; resultFile?: { path: string; maxBytes: number } };
/** Root-relative default; native-document keeps its existing result.md default. */
export function defaultJobOutput(job: JobContribution, file: string): string {
  return job.resultKind === "file" ? file.replace(/\.[^./\\]+$/, "") + job.resultExtension : "result.md";
}

/** K1 handlers receive Host-validated paths; results are published only by Host. */
/** Completed K1 review materials are admitted and assigned opaque refs by the Host. */
export const completedReviewSchema = z.strictObject({ review: z.string().min(1).max(512),
  bundle: reviewBundleSchema.omit({ bundleRef: true, documentRef: true }), pages: z.array(reviewPageSchema).max(2000),
  mapping: reviewMappingSchema.optional(), images: z.array(z.strictObject({ ref: z.string().min(1).max(512), path: z.string().min(1), revision: z.string().min(1).max(512) })).max(2000) }).superRefine((value, ctx) => {
    const ids = value.pages.flatMap(page => page.regions.map(region => region.id));
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Duplicate region across review pages" });
  });
export type CompletedReview = z.infer<typeof completedReviewSchema>;
export const jobUpdateSchema = z.strictObject({
  state: z.enum(["running", "completed", "failed", "stopped", "uncertain"]), phase: z.string(),
  progress: z.strictObject({ done: z.number().nonnegative(), total: z.number().positive() }).refine(p => p.done <= p.total).optional(),
  errorKind: z.unknown().transform(pluginErrorKind).optional(), document: z.strictObject({ source: z.string() }).optional(), review: completedReviewSchema.optional(),
  file: z.strictObject({ path: z.string().min(1) }).optional(),
});
export type JobContribution = PluginManifest["contributes"]["jobs"][number];
export type JobSnapshot = { requestId: string; plugin: string; job: string; root: string; elapsedMs: number; state: "running" | "completed" | "failed" | "stopped" | "uncertain"; phase: string; stopRequested: boolean; progress?: { done: number; total: number }; errorKind?: PluginErrorKind; error?: string; result?: { kind?: "native-document" | "file"; path: string; revision: string; bundle?: ReviewBundle; review?: { plugin: string; review: string; root: string; bundleRef: string; generation: string } } };
export const jobRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("job-list"), plugin: id.optional() }),
  z.strictObject({ action: z.literal("job-start"), plugin: id, job: id, requestId: z.string().uuid(), root: z.string().min(1), file: z.string().min(1), output: z.string().min(1).optional() }),
  ...(["job-status", "job-stop", "job-result"] as const).map(action => z.strictObject({ action: z.literal(action), requestId: z.string().uuid() })),
]);

export const PLUGIN_JOBS = { version: 1, scope: "host", inputSchema: z.toJSONSchema(jobRequestSchema) } as const;
export { validatePluginSource } from "./authoring.ts";

/** Only these kinds cross the plugin error boundary; messages are Host-owned. */
export const PLUGIN_ERROR_KINDS = ["auth", "forbidden", "not_found", "unavailable", "timeout", "failed"] as const;
export type PluginErrorKind = typeof PLUGIN_ERROR_KINDS[number];
export function pluginErrorKind(value: unknown): PluginErrorKind {
  return PLUGIN_ERROR_KINDS.includes(value as PluginErrorKind) ? value as PluginErrorKind : "failed";
}
export class PluginOperationError extends Error {
  constructor(public readonly kind: PluginErrorKind) { super("Plugin request failed"); }
}
export const PLUGIN_ERROR_MESSAGES: Readonly<Record<PluginErrorKind, string>> = {
  auth: "Authentication required. Check credentials in plugin settings.",
  forbidden: "Access denied. Ask the service administrator for permission.",
  not_found: "Target not found. Check the target address or identifier.",
  unavailable: "Service unavailable. Try again later.",
  timeout: "Operation timed out. Check the service connection.",
  failed: "Plugin operation failed. Check plugin settings and the target.",
};

export type ViewContribution = PluginManifest["contributes"]["views"][number];

export type ScreenContribution = PluginManifest["contributes"]["screens"][number];
