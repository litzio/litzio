import { reviewBundleSchema, reviewPageSchema, reviewMappingSchema, type ReviewBundle } from "@litzio/core/views-v2";
export * from "./generated-document.ts";
export * from "./review-workspace.ts";
export * from "./review-ledger.ts";
import { queryViewSchema, reviewContributionSchema, validateCatalogView, compileViewInputSchema } from "@litzio/core/views-v2";
export * from "@litzio/core/views-v2";
export { authorDocument, documentAuthoringSchema, DOCUMENT_AUTHORING_LIMITS, DocumentAuthoringError, type DocumentAuthoringInput, type AuthoredDocument } from "@litzio/core";
// Editor-neutral document operations; the opaque Core document never exposes an AST.
export { parse, serialize, getEditableDocument, updateNodeTextAtPath, convertBlock, removeBlock, updateTableCell,
  updateParagraphInlineContent, updateHeadingInlineContent, insertParagraph, insertHeading, insertTable, insertFigure,
  insertList, insertCodeBlock, insertEquation, updateLabel, updateEnumerator, updateEnumeration, updateTableCaption,
  updateList, updateCodeBlock, updateEquationLatex, updateFigure, inlineContentText, bodyEndIndex } from "@litzio/core";
import { rowSchema, type ViewOperation } from "@litzio/core/views";
export { rowSchema, operationRowResultSchema, type OperationRowResult, type RowSchema } from "@litzio/core/views";
import { compileSchema } from "./schema.ts";
import { z } from "zod";
import { documentAuthoringSchema, DOCUMENT_AUTHORING_LIMITS } from "@litzio/core";
import semver from "semver";
export const SDK_VERSION = "0.5.0";
// Actual SDK contracts still implemented by this Host, not hypothetical versions
// between releases. Features before the next public release share one minor.
// The current Host retains earlier contracts.
const supportedSdkVersions = ["0.1.0", "0.2.0", "0.3.0", "0.4.0", SDK_VERSION];
export const healthCheckResultSchema = z.strictObject({ ok: z.boolean(), message: z.string().min(1).max(300) });
export const inputHintResultSchema = z.strictObject({ text: z.string().min(1).max(512) });
export const inputSuggestionResultsSchema = z.array(z.strictObject({ value: z.string().min(1).max(512).regex(/^[^\r\n]+$/), label: z.string().min(1).max(512) })).max(32).refine(items => new Set(items.map(item => item.value)).size === items.length, "Duplicate suggestion value");
export type HealthCheckResult = z.infer<typeof healthCheckResultSchema>;
export const HEALTH_CHECK_OUTPUT_SCHEMA = { type: "object", properties: { ok: { type: "boolean" }, message: { type: "string", minLength: 1, maxLength: 300 } }, required: ["ok", "message"], additionalProperties: false } as const;
const id = z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
const schema = z.record(z.string(), z.unknown());
const operation = z.strictObject({ id, version: z.number().int().positive(), effect: z.enum(["read", "write"]), assistant: z.boolean().default(false), scope: z.enum(["host", "folder"]), inputSchema: schema, outputSchema: schema, rowSchema: rowSchema.optional(), inputSuggestions: z.record(z.string(), id).optional(), inputHints: z.record(z.string(), id).optional() });
const extension = z.string().regex(/^\.[a-z0-9]+$/);
const skillContribution = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  directory: z.string().min(1).refine(value => !/[\\:\x00?#]/.test(value) && value.split("/").every(part => !!part && part !== "." && part !== ".."), "Skill directory must stay inside package"),
});
const jobFields = { id, title: z.string().min(1), accept: z.array(extension).min(1), start: id, status: id, stop: id };
const jobContributionSchema = z.discriminatedUnion("resultKind", [
  z.strictObject({ ...jobFields, resultKind: z.literal("native-document"), generatedDocument: id.optional(), comparison: id.optional(), workspace: z.boolean().optional() }),
  z.strictObject({ ...jobFields, resultKind: z.literal("file"), resultExtension: extension }),
]);
export const SCREEN_ICONS = ["LayoutDashboard", "Table", "ChartColumn", "FileText", "Folder"] as const;
export const screenContributionSchema = z.strictObject({ id, title: queryViewSchema.shape.title, icon: z.enum(SCREEN_ICONS),
  jobs: z.array(id).max(16).refine(ids => new Set(ids).size === ids.length, "Duplicate screen job").default([]),
  defaultViewIds: z.array(id).max(8).refine(ids => new Set(ids).size === ids.length, "Duplicate default view").default([]), primary: z.boolean().default(false) });
export const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1), id, tier: z.enum(["official", "community"]),
  publisher: z.strictObject({ id, name: z.string().min(1) }), name: z.string().min(1), description: z.string().default(""),
  version: z.string().refine(v => !!semver.valid(v), "Invalid SemVer"), requiresSdk: z.string().refine(v => !!semver.validRange(v), "Invalid SDK range"), entry: z.string().min(1), icon: z.string().min(1).max(240).optional(),
  contributes: z.strictObject({ healthCheck: id.optional(), operations: z.array(operation).default([]), jobs: z.array(jobContributionSchema).default([]), folderSources: z.array(id).default([]), folderDecorations: z.array(id).default([]), accounts: z.array(id).default([]),
    skills: z.array(skillContribution).refine(skills => new Set(skills.map(skill => skill.id)).size === skills.length, "Duplicate skill ID").default([]),
    dataViews: z.array(z.strictObject({ id, operation: id, version: z.number().int().positive() })).default([]),
    generatedUi: z.array(z.strictObject({ id, catalog: z.string(), schemaVersion: z.number().int().positive() })).default([]),
    views: z.array(z.strictObject({ id, title: z.string().min(1), definition: queryViewSchema })).default([]),
    screens: z.array(screenContributionSchema).default([]),
    reviews: z.array(reviewContributionSchema).default([]),
    secretUses: z.array(z.strictObject({ operation: id, secret: id })).default([]) }),
  settingsSchema: schema.default({ type: "object", additionalProperties: false }),
  secrets: z.array(z.strictObject({ id, title: z.string().min(1), description: z.string().optional(), scope: z.literal("connection"), required: z.boolean() })).default([]),
});
export type PluginManifest = z.infer<typeof manifestSchema>;
export type OperationDefinition = z.infer<typeof operation>;
export function validateManifest(input: unknown): PluginManifest {
  const m = manifestSchema.parse(input);
  if (!supportedSdkVersions.some(version => semver.satisfies(version, m.requiresSdk))) throw new Error("Unsupported SDK range");
  if (m.contributes.skills.length && !supportedSdkVersions.some(version => semver.gte(version, "0.5.0") && semver.satisfies(version, m.requiresSdk))) throw new Error("Assistant skills require SDK 0.5.0 or later in requiresSdk");
  if (/^(?:[a-z]+:|[/\\])/i.test(m.entry) || m.entry.split(/[/\\]/).includes("..")) throw new Error("Entry must stay inside package");
  if (m.icon !== undefined) {
    if (!supportedSdkVersions.some(version => semver.gte(version, "0.3.0") && semver.satisfies(version, m.requiresSdk))) throw new Error("Plugin icons require SDK 0.3.0 or later in requiresSdk");
    if (m.icon.startsWith("/") || /[\\:\x00?#]/.test(m.icon) || !/\.(png|svg)$/.test(m.icon) || m.icon.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Icon must be a package-relative PNG or SVG path");
  }
  for (const list of Object.values(m.contributes)) {
    if (!Array.isArray(list)) continue;
    const ids = list.map(item => typeof item === "string" ? item : "id" in item ? item.id : JSON.stringify(item));
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate contribution ID");
  }
  if (m.contributes.operations.some(op => op.scope === "folder")) throw new Error("Folder-scoped plugin operations are unsupported in stage 1");
  if (m.secrets.length && !supportedSdkVersions.some(version => semver.gte(version, "0.4.0") && semver.satisfies(version, m.requiresSdk))) throw new Error("Secret titles require SDK 0.4.0 or later in requiresSdk");
  if (new Set(m.secrets.map(s => s.id)).size !== m.secrets.length) throw new Error("Duplicate secret ID");
  if (m.contributes.dataViews.length || m.contributes.generatedUi.length || m.contributes.secretUses.length) throw new Error("Unsupported contribution: dataViews, generatedUi and secretUses");
  for (const job of m.contributes.jobs) {
    if (job.resultKind === "native-document" && job.workspace && (!job.comparison || !job.generatedDocument)) throw new Error("Review workspaces require a generated provider and comparison");
    if (job.resultKind === "native-document" && job.generatedDocument) {
      if (!supportedSdkVersions.some(version => semver.gte(version, "0.3.0") && semver.satisfies(version, m.requiresSdk))) throw new Error("Generated documents require SDK 0.3.0 or later");
      const provider = m.contributes.operations.find(op => op.id === job.generatedDocument);
      if (!provider || provider.effect !== "read" || provider.scope !== "host") throw new Error("Generated documents require a host read provider");
    }
    if (job.resultKind === "native-document" && job.comparison) {
      if (!job.generatedDocument || !m.contributes.reviews.some(r => r.id === job.comparison) || !supportedSdkVersions.some(version => semver.gte(version, "0.4.0") && semver.satisfies(version, m.requiresSdk))) throw new Error("Comparison requires a generated provider, review and SDK 0.4.0");
    }
    if (job.resultKind === "file" && !supportedSdkVersions.some(version => semver.gte(version, "0.2.0") && semver.satisfies(version, m.requiresSdk))) throw new Error("File job results require SDK 0.2.0 or later in requiresSdk");
    for (const binding of [job.start, job.status, job.stop]) if (!m.contributes.operations.some(op => op.id === binding)) throw new Error("Undeclared job operation");
    if (new Set([job.start, job.status, job.stop]).size !== 3) throw new Error("Job bindings must be distinct");
    if (m.contributes.operations.find(op => op.id === job.start)?.effect !== "write") throw new Error("Job start must be a write operation");
  }
  if (m.contributes.healthCheck) {
    if (!supportedSdkVersions.some(version => semver.gte(version, "0.3.0") && semver.satisfies(version, m.requiresSdk))) throw new Error("Health checks require SDK 0.3.0 or later in requiresSdk");
    const check = m.contributes.operations.find(op => op.id === m.contributes.healthCheck);
    if (!check || check.effect !== "read" || check.scope !== "host" || !compileSchema(check.inputSchema)({}) || check.rowSchema || m.contributes.jobs.some(job => [job.start, job.status, job.stop].includes(check.id)) || m.contributes.reviews.some(review => review.read.operation === `${m.id}.${check.id}`)) throw new Error("Health check must bind a standalone host read operation accepting empty input");
  }
  const linkSchemas = [
    ...m.contributes.operations.flatMap(op => op.rowSchema ? [op.rowSchema] : []),
  ];
  if (linkSchemas.some(fields => Object.values(fields).some(field => field.linkField)) &&
      !supportedSdkVersions.some(version => semver.gte(version, "0.3.0") && semver.satisfies(version, m.requiresSdk))) throw new Error("Link columns require SDK 0.3.0 or later in requiresSdk");
  if (linkSchemas.some(fields => Object.values(fields).some(field => field.hidden !== undefined)) &&
      !supportedSdkVersions.some(version => semver.gte(version, "0.3.0") && semver.satisfies(version, m.requiresSdk))) throw new Error("Column visibility requires SDK 0.3.0 or later in requiresSdk");
  if (Array.isArray(m.settingsSchema.required) && m.settingsSchema.required.length) throw new Error("settingsSchema.required must be empty: settings start at {} and are saved one field at a time. Check missing connection values in connection checks and operations instead; handle defaults in code.");
  compileSchema(m.settingsSchema);
  for (const operation of m.contributes.operations) { if (operation.rowSchema && operation.effect !== "read") throw new Error("Only read operations can declare row schema"); compileViewInputSchema(operation.inputSchema); compileSchema(operation.outputSchema); }
  for (const source of m.contributes.operations) for (const [field, target] of Object.entries(source.inputSuggestions ?? {})) {
    if (!supportedSdkVersions.some(version => semver.gte(version, "0.3.0") && semver.satisfies(version, m.requiresSdk))) throw new Error("Input suggestions require SDK 0.3.0");
    const properties = source.inputSchema.properties as Record<string, any> | undefined;
    const property = properties?.[field];
    const candidate = m.contributes.operations.find(op => op.id === target);
    if (source.effect !== "read" || !source.rowSchema || !property || property.type !== "string" || property.secret || property.writeOnly || property.format || property.enum || property.const !== undefined) throw new Error("Suggestions require a public free-text query field");
    if (!candidate || candidate.effect !== "read" || candidate.scope !== "host" || !compileSchema(candidate.inputSchema)({ query: "example" }) || m.contributes.jobs.some(job => [job.start, job.status, job.stop].includes(target)) || m.contributes.reviews.some(review => Object.values(review).some(binding => typeof binding === "object" && binding.operation === `${m.id}.${target}`))) throw new Error("Suggestions require a standalone host read operation accepting query");
  }
  for (const source of m.contributes.operations) for (const [field, target] of Object.entries(source.inputHints ?? {})) {
    if (!supportedSdkVersions.some(version => semver.gte(version, "0.3.0") && semver.satisfies(version, m.requiresSdk))) throw new Error("Input hints require SDK 0.3.0");
    const property = (source.inputSchema.properties as Record<string, any> | undefined)?.[field];
    const candidate = m.contributes.operations.find(op => op.id === target);
    if (source.effect !== "read" || !source.rowSchema || !property || property.type !== "string" || property.secret || property.writeOnly || property.format || property.enum || property.const !== undefined) throw new Error("Hints require a public free-text query field");
    if (!candidate || candidate.effect !== "read" || candidate.scope !== "host" || !compileSchema(candidate.inputSchema)({}) || candidate.rowSchema || m.contributes.jobs.some(job => [job.start, job.status, job.stop].includes(target)) || m.contributes.reviews.some(review => Object.values(review).some(binding => typeof binding === "object" && binding.operation === `${m.id}.${target}`))) throw new Error("Hints require a standalone host read operation accepting empty input");
  }
  const viewOperations: ViewOperation[] = m.contributes.operations.filter(op => op.effect === "read" && op.rowSchema).map(op => ({
    operation: `${m.id}.${op.id}`, version: op.version, rowSchema: op.rowSchema!, inputSchema: op.inputSchema, validateArgs: compileViewInputSchema(op.inputSchema),
  }));
  for (const view of m.contributes.views) {
    if (view.definition.owner !== m.id) throw new Error("Default view owner must match plugin");
    validateCatalogView(view.definition, viewOperations);
  }
  if (m.contributes.screens.filter(screen => screen.primary).length > 1) throw new Error("Only one primary screen is allowed");
  for (const screen of m.contributes.screens) {
    if (!screen.jobs.length && !screen.defaultViewIds.length) throw new Error("Screen needs views or jobs");
    if (screen.jobs.length && !supportedSdkVersions.some(version => semver.gte(version, "0.3.0") && semver.satisfies(version, m.requiresSdk))) throw new Error("Screen jobs require SDK 0.3.0 or later in requiresSdk");
    for (const job of screen.jobs) if (!m.contributes.jobs.some(j => j.id === job)) throw new Error("Undeclared screen job");
  }
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
/** Decorate the exact folder with the owning plugin manifest icon. */
export type FolderDecoration = { id: string; path: string; icon: "plugin" };
export type AccountStatus = { id: string; label: string; source: string };
export type PluginStatus = { available: boolean; message: string; folders: FolderSource[]; decorations: FolderDecoration[]; accounts: AccountStatus[] };
export type PluginContext = { secrets?: Readonly<Record<string, string>>; settings: Readonly<Record<string, unknown>>; platform: string; env: Readonly<Record<string, string | undefined>>; isDirectory(path: string): boolean };
export type PluginInstance = { operations: Record<string, (input: unknown) => unknown | Promise<unknown>>; status(): PluginStatus | Promise<PluginStatus>; dispose(): void | Promise<void> };
export type PluginModule = { activate(context: PluginContext): PluginInstance | Promise<PluginInstance> };
export type OperationReceipt = { requestId: string; operation: string; version: number; scope: string; outcome: "success" | "refused" | "failure" | "uncertain" };
export { compileSchema } from "./schema.ts";
export const statusSchema = z.strictObject({ available: z.boolean(), message: z.string(),
  folders: z.array(z.strictObject({ id, path: z.string().min(1), label: z.string().min(1), defaultCandidate: z.boolean() })),
  decorations: z.array(z.strictObject({ id, path: z.string().min(1), icon: z.literal("plugin") })),
  accounts: z.array(z.strictObject({ id, label: z.string().min(1), source: z.string().min(1) })) });
export const PLUGIN_REGISTRATION_CHANGED = "Plugin registration changed. Review the plugin and confirm again.";
export const pluginManagementSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("secret-status"), id }),
  z.strictObject({ action: z.literal("secret-delete"), id, name: id }),
  z.strictObject({ action: z.literal("list") }),
  z.strictObject({ action: z.literal("scaffold"), directory: z.string().min(1).optional(), id, template: z.enum(["greet", "query", "file"]).optional() }),
  z.strictObject({ action: z.literal("validate"), directory: z.string().min(1) }),
  z.strictObject({ action: z.literal("register"), directory: z.string().min(1) }),
  z.strictObject({ action: z.literal("trust"), id, registrationId: z.uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/).optional() }),
  z.strictObject({ action: z.literal("unregister"), id }),
  z.strictObject({ action: z.literal("reload"), id }), z.strictObject({ action: z.literal("enable"), id, registrationId: z.uuid().optional(), trust: z.boolean().optional() }), z.strictObject({ action: z.literal("disable"), id }),
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
/** Root-relative sibling default; Host reserves an available name on admission. */
export function defaultJobOutput(job: JobContribution, file: string): string {
  return file.replace(/\.[^./\\]+$/, "") + (job.resultKind === "file" ? job.resultExtension : ".md");
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
/** Text stays bounded separately from base64 images. Completed payload only; not a job lifetime limit. */
export const JOB_DOCUMENT_MAX_BYTES = 32 * 1024 * 1024;
export const documentImageSchema = z.strictObject({ key: z.string().min(1).max(512), mime: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
  base64: z.string().min(1).max(4 * Math.ceil(10 * 1024 * 1024 / 3)) });
export const authoredDocumentRequestSchema = z.strictObject({ authoring: documentAuthoringSchema, images: z.array(documentImageSchema).max(256).default([]) }).superRefine((value, ctx) => {
  if (new Set(value.images.map(image => image.key)).size !== value.images.length) ctx.addIssue({ code: "custom", message: "Duplicate image key" });
  if (new TextEncoder().encode(JSON.stringify(value)).length > JOB_DOCUMENT_MAX_BYTES) ctx.addIssue({ code: "custom", message: "Document payload exceeds 32 MiB" });
});
export type AuthoredDocumentRequest = z.infer<typeof authoredDocumentRequestSchema>;
export const jobDocumentSchema = z.union([z.strictObject({ source: z.string().refine(value => new TextEncoder().encode(value).length <= DOCUMENT_AUTHORING_LIMITS.bytes, "Document source exceeds 4 MiB") }), authoredDocumentRequestSchema]);
export const jobUpdateSchema = z.strictObject({
  state: z.enum(["running", "completed", "failed", "stopped", "uncertain"]), phase: z.string(),
  progress: z.strictObject({ done: z.number().nonnegative(), total: z.number().positive() }).refine(p => p.done <= p.total).optional(),
  errorKind: z.unknown().transform(pluginErrorKind).optional(), document: jobDocumentSchema.optional(), review: completedReviewSchema.optional(),
  file: z.strictObject({ path: z.string().min(1) }).optional(),
});
export type JobContribution = PluginManifest["contributes"]["jobs"][number];
export type JobSnapshot = { requestId: string; plugin: string; job: string; root: string; file?: string; output?: string; startFailure?: JobStartFailure; startedAt?: number; finishedAt?: number; elapsedMs: number; state: "running" | "completed" | "failed" | "stopped" | "uncertain"; phase: string; stopRequested: boolean; progress?: { done: number; total: number }; errorKind?: PluginErrorKind; error?: string; result?: { kind?: "native-document" | "file"; path: string; revision: string; inputs?: import("@litzio/core").AuthoredDocument["inputs"]; comparison?: { root: string; document: string }; bundle?: ReviewBundle; review?: { plugin: string; review: string; root: string; bundleRef: string; generation: string } } };
export const JOB_BATCH_MAX_FILES = 50;
export const JOB_START_FAILURE_MESSAGES = {
  result_exists: "The result path already exists or is in use.",
  unsupported_input: "This input file is not supported.",
  unavailable: "The plugin is disabled or not running.",
  start_failed: "The plugin could not acknowledge the start request.",
  other: "Cannot start this file. Check the input and result path.",
} as const;
export type JobStartFailure = { kind: keyof typeof JOB_START_FAILURE_MESSAGES; path?: string };
export type BatchJobResult = { file: string; requestId?: string; job?: JobSnapshot; errorKind?: PluginErrorKind; error?: string; startFailure?: JobStartFailure };
export const jobRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("job-start-many"), plugin: id, job: id, root: z.string().min(1), requestIds: z.array(z.string().uuid()).max(JOB_BATCH_MAX_FILES).optional(), files: z.array(z.string().min(1)).min(1).max(JOB_BATCH_MAX_FILES).refine(files => new Set(files).size === files.length, "Duplicate input file") }),
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
