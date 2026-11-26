import { z } from "zod";
import { compileSchema } from "./schema.ts";
import { compileOperationInputSchema } from "@litzio/core/operation-input";
import { documentAuthoringSchema } from "@litzio/core";
export { compileSchema } from "./schema.ts";
export { compileOperationInputSchema } from "@litzio/core/operation-input";
export { authorDocument, documentAuthoringSchema, DOCUMENT_AUTHORING_LIMITS, DocumentAuthoringError, type DocumentAuthoringInput, type AuthoredDocument } from "@litzio/core";
// Editor-neutral document operations; the opaque Core document never exposes an AST.
export { mergeParagraphWithPrevious, splitParagraph, updateHeadingLevel, machineNodes,
  type Document, type NodePath, parse, serialize, getEditableDocument, updateNodeTextAtPath, convertBlock, removeBlock, updateTableCell,
  updateParagraphInlineContent, updateHeadingInlineContent, insertParagraph, insertHeading, insertTable, insertFigure,
  insertList, insertCodeBlock, insertEquation, updateLabel, updateEnumerator, updateEnumeration, updateTableCaption,
  updateDocumentStatus, DOCUMENT_STATUSES, type DocumentStatus,
  updateList, updateCodeBlock, updateEquationLatex, updateFigure, inlineContentText, bodyEndIndex,
  insertAdmonition, updateAdmonitionVariant, updateAdmonitionInlineContent, updateDocumentTitle,
  insertTableNote, updateTableNote, removeTableNote, moveTableNote,
  ADMONITION_VARIANTS, type AdmonitionVariant } from "@litzio/core";

export const SDK_VERSION = "0.19.0";
const id = z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
const schema = z.record(z.string(), z.unknown());
const operation = z.strictObject({ id, version: z.number().int().positive().default(1), effect: z.enum(["read","write"]).default("read"), scope: z.enum(["host","folder"]).default("host"), assistant: z.boolean().default(false), inputSchema: schema.default({}), outputSchema: schema.default({}) });
const skill = z.strictObject({id:z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),directory:z.string().min(1).refine(v=>!/[\\:\x00?#]/.test(v)&&v.split("/").every(p=>!!p&&p!=="."&&p!==".."),"Skill directory must stay inside package")});
const secret = z.strictObject({id,title:z.string().min(1),description:z.string().optional(),scope:z.literal("connection"),required:z.boolean().default(false)});
export const SCREEN_ICONS = ["LayoutDashboard","Table","ChartColumn","FileText","Folder"] as const;
const PLUGIN_ICON_MIME_TYPES = { ".svg": "image/svg+xml", ".png": "image/png" } as const;
/** Shared file-format contract for manifest admission and Host icon loading. */
export function pluginIconMime(icon: string) {
 const extension = icon.slice(icon.lastIndexOf(".")).toLowerCase();
 return Object.hasOwn(PLUGIN_ICON_MIME_TYPES, extension) ? PLUGIN_ICON_MIME_TYPES[extension as keyof typeof PLUGIN_ICON_MIME_TYPES] : undefined;
}
/** Public GitHub plugin source: a repository, or `/tree/<ref>/<folder>` where the Host resolves the ref and folder split. */
export function parseGitHubSource(value: string): { owner: string; repo: string; tree: string[] } | undefined {
 let url: URL;
 // URL parsing would silently resolve dot segments; an address must name its folder directly.
 if (value.split("/").some(part => part === "." || part === ".." || /^%2e(%2e)?$/i.test(part))) return undefined;
 try { url = new URL(value); } catch { return undefined; }
 if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || url.search || url.hash) return undefined;
 let parts: string[];
 try { parts = url.pathname.replace(/\/+$/, "").split("/").slice(1).map(decodeURIComponent); } catch { return undefined; }
 if (parts.some(part => !part || part === "." || part === ".." || /[\\/\u0000]/.test(part))) return undefined;
 const [owner, rawRepo, kind, ...tree] = parts, repo = rawRepo?.replace(/\.git$/i, "");
 if (!owner || !repo || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) return undefined;
 if (kind === undefined) return { owner, repo, tree: [] };
 return kind === "tree" && tree.length ? { owner, repo, tree } : undefined;
}
export const GITHUB_TRACKS = ["release", "branch"] as const;
export type GitHubTrack = typeof GITHUB_TRACKS[number];
const githubSource = z.string().refine(value => !!parseGitHubSource(value), "Expected a public GitHub address: https://github.com/<owner>/<repo> or https://github.com/<owner>/<repo>/tree/<ref>/<folder>");
const manifestVersion = z.string().refine(value => value.trim().length > 0 && !/[\r\n\v\f\u0085\u2028\u2029]/u.test(value), "Expected a non-empty single-line version");
const cardSchema = z.strictObject({id,name:z.string().min(1),version:manifestVersion.optional(),repository:githubSource.optional(),description:z.string().optional(),icon:z.string().min(1).default("LayoutDashboard"),entry:z.string().min(1),screen:z.string().min(1),operations:z.array(operation).default([]),settingsSchema:schema.default({type:"object",additionalProperties:false}),secrets:z.array(secret).default([]),skills:z.array(skill).default([]),healthCheck:id.optional()});
export function validateManifest(input:unknown) {
 const card=cardSchema.parse(input);
 for(const file of [card.entry,card.screen]) if(/^(?:[a-z]+:|[/\\])/i.test(file)||file.split(/[/\\]/).includes(".."))throw new Error("Entry must stay inside package");
 if(!SCREEN_ICONS.includes(card.icon as any)&&(!pluginIconMime(card.icon)||/^(?:[a-z]+:|[/\\])/i.test(card.icon)||card.icon.split(/[/\\]/).includes("..")))throw new Error("Invalid icon path");
 for(const values of [card.operations,card.secrets,card.skills])if(new Set(values.map(v=>v.id)).size!==values.length)throw new Error("Duplicate identity");
 if(Array.isArray(card.settingsSchema.required)&&card.settingsSchema.required.length)throw new Error("settingsSchema.required must be empty");
 compileSchema(card.settingsSchema);
 for(const op of card.operations){compileOperationInputSchema(op.inputSchema);compileSchema(op.outputSchema);}
 if(card.healthCheck){const op=card.operations.find(op=>op.id===card.healthCheck);if(!op||op.effect!=="read"||op.scope!=="host"||!compileSchema(op.inputSchema)({}))throw new Error("Health check must be a host read accepting empty input");}
 return {id:card.id,name:card.name,version:card.version,repository:card.repository,description:card.description,entry:card.entry,icon:SCREEN_ICONS.includes(card.icon as any)?undefined:card.icon,settingsSchema:card.settingsSchema,secrets:card.secrets,
 contributes:{operations:card.operations,healthCheck:card.healthCheck,skills:card.skills,screens:[{id:"main",title:card.name,icon:SCREEN_ICONS.includes(card.icon as any)?card.icon:"LayoutDashboard",entry:card.screen,primary:true}]}};
}
export type PluginManifest=ReturnType<typeof validateManifest>;
export type OperationDefinition=z.infer<typeof operation>;
export type ScreenContribution=PluginManifest["contributes"]["screens"][number];
export const healthCheckResultSchema=z.strictObject({ok:z.boolean(),message:z.string().min(1).max(300)});
export type HealthCheckResult=z.infer<typeof healthCheckResultSchema>;
export const HEALTH_CHECK_OUTPUT_SCHEMA={type:"object",properties:{ok:{type:"boolean"},message:{type:"string",minLength:1,maxLength:300}},required:["ok","message"],additionalProperties:false} as const;
export type PluginStatus={available:boolean;message:string};
export const statusSchema=z.strictObject({available:z.boolean(),message:z.string()});
/** Shell-free launch descriptor for this Host's official CLI. Append command arguments. */
export type PluginCli = Readonly<{ bin: string; args: readonly string[] }>;
export type PluginContext={cli?:PluginCli;secrets?:Readonly<Record<string,string>>;settings:Readonly<Record<string,unknown>>;platform:string;env:Readonly<Record<string,string|undefined>>;isDirectory(path:string):boolean};
export type PluginInstance={operations:Record<string,(input:unknown)=>unknown|Promise<unknown>>;status():PluginStatus|Promise<PluginStatus>;dispose():void|Promise<void>};
export type PluginModule={activate(context:PluginContext):PluginInstance|Promise<PluginInstance>};
export type OperationReceipt={requestId:string;operation:string;version:number;scope:string;outcome:"success"|"refused"|"failure"|"uncertain"};
export const PLUGIN_REGISTRATION_CHANGED = "Plugin registration changed. Review the plugin and confirm again.";
export const pluginManagementSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("secret-status"), id }),
  z.strictObject({ action: z.literal("secret-delete"), id, name: id }),
  z.strictObject({ action: z.literal("list") }),
  z.strictObject({ action: z.literal("install"), id: id.optional(), directory: z.string().min(1).optional(), source: githubSource.optional(), track: z.enum(GITHUB_TRACKS).optional() })
    .refine(value => [value.id, value.directory, value.source].filter(Boolean).length === 1, "Supply id, directory or source").refine(value => !value.track || !!value.source, "track applies to a GitHub source"),
  z.strictObject({ action: z.literal("scaffold"), directory: z.string().min(1).optional(), id, template: z.enum(["greet", "screen", "chart"]).optional() }),
  z.strictObject({ action: z.literal("dependencies"), directory: z.string().min(1) }),
  z.strictObject({ action: z.literal("bundle"), directory: z.string().min(1) }),
  z.strictObject({ action: z.literal("validate"), directory: z.string().min(1) }),
  z.strictObject({ action: z.literal("register"), directory: z.string().min(1).optional(), source: githubSource.optional(), track: z.enum(GITHUB_TRACKS).optional() })
    .refine(value => !!value.directory !== !!value.source, "Supply directory or source").refine(value => !value.track || !!value.source, "track applies to a GitHub source"),
  z.strictObject({ action: z.literal("source-plugins"), source: githubSource }),
  z.strictObject({ action: z.literal("trust"), id, registrationId: z.uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/).optional() }),
  z.strictObject({ action: z.literal("unregister"), id }),
  z.strictObject({ action: z.literal("reload"), id }), z.strictObject({ action: z.literal("check-updates"), id: id.optional() }), z.strictObject({ action: z.literal("update"), id }), z.strictObject({ action: z.literal("enable"), id, registrationId: z.uuid().optional(), trust: z.boolean().optional() }), z.strictObject({ action: z.literal("disable"), id }),
  z.strictObject({ action: z.literal("settings"), id, settings: z.record(z.string(), z.unknown()).optional() }),
]);
export type PluginManagementInput = z.infer<typeof pluginManagementSchema>;
export const PLUGIN_MANAGEMENT = { version: 1, scope: "host", inputSchema: z.toJSONSchema(pluginManagementSchema) } as const;

export const DOCUMENT_REQUEST_MAX_BYTES=32*1024*1024;
export const documentImageSchema = z.strictObject({ key: z.string().min(1).max(512), mime: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
  base64: z.string().min(1).max(4 * Math.ceil(10 * 1024 * 1024 / 3)) });
export const authoredDocumentRequestSchema = z.strictObject({ authoring: documentAuthoringSchema, images: z.array(documentImageSchema).max(256).default([]) }).superRefine((value, ctx) => {
  if (new Set(value.images.map(image => image.key)).size !== value.images.length) ctx.addIssue({ code: "custom", message: "Duplicate image key" });
  if (new TextEncoder().encode(JSON.stringify(value)).length > DOCUMENT_REQUEST_MAX_BYTES) ctx.addIssue({ code: "custom", message: "Document payload exceeds 32 MiB" });
});
export type AuthoredDocumentRequest = z.infer<typeof authoredDocumentRequestSchema>;
/** Only these kinds cross the plugin error boundary; messages are Host-owned. */
export const PLUGIN_ERROR_KINDS = ["auth", "forbidden", "not_found", "unavailable", "timeout", "failed"] as const;
export type PluginErrorKind = typeof PLUGIN_ERROR_KINDS[number];
export function pluginErrorKind(value: unknown): PluginErrorKind {
  return PLUGIN_ERROR_KINDS.includes(value as PluginErrorKind) ? value as PluginErrorKind : "failed";
}
/** Explicit opt-in to publishing a caller-correctable failure. Never include secrets or internal paths. */
export class PluginPublicError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "PluginPublicError"; }
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

export { validatePluginSource } from "./authoring.ts";
export { SCREEN_UI, SCREEN_UI_GUIDANCE } from "./screen-ui.ts";
export type { ScreenConfirmInput, ScreenPickPathInput, ScreenPickedPath, ScreenOpenDocumentResult } from "./screen-actions.ts";
export type { ScreenChartProps, ScreenSelectProps, ScreenSliderProps, ScreenSummaryProps, ScreenDocumentViewProps, ScreenDocumentViewLayout, ScreenDocumentViewState, ScreenDocumentEditState, ScreenDocumentSavedBlock, ScreenDocumentViewApply, ScreenDocumentApplyState } from "./screen-ui.ts";
export { documentViewChange, type ScreenDocumentViewChange } from "./document-view-change.ts";
export type { ScreenLinkedDocumentItem, ScreenLinkedDocumentViewProps } from "./screen-ui.ts";
export type { ScreenItemListItem, ScreenItemListGroup, ScreenItemListProps } from "./screen-ui.ts";
export type { ScreenLayoutBack } from "./screen-ui.ts";
