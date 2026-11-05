import { z } from "zod";
import semver from "semver";
export const SDK_VERSION = "0.1.0";
const id = z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
const schema = z.record(z.string(), z.unknown());
const operation = z.strictObject({ id, version: z.number().int().positive(), effect: z.enum(["read", "write"]), assistant: z.boolean().default(false), scope: z.enum(["host", "folder"]), inputSchema: schema, outputSchema: schema });
export const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1), id, tier: z.enum(["official", "community"]),
  publisher: z.strictObject({ id, name: z.string().min(1) }), name: z.string().min(1), description: z.string().default(""),
  version: z.string().refine(v => !!semver.valid(v), "Invalid SemVer"), requiresSdk: z.string().refine(v => !!semver.validRange(v), "Invalid SDK range"), entry: z.string().min(1),
  contributes: z.strictObject({ operations: z.array(operation).default([]), folderSources: z.array(id).default([]), folderDecorations: z.array(id).default([]), accounts: z.array(id).default([]),
    dataViews: z.array(z.strictObject({ id, operation: id, version: z.number().int().positive() })).default([]),
    generatedUi: z.array(z.strictObject({ id, catalog: z.string(), schemaVersion: z.number().int().positive() })).default([]),
    views: z.array(z.strictObject({ id, definition: z.string().min(1) })).default([]),
    secretUses: z.array(z.strictObject({ operation: id, secret: id })).default([]) }),
  settingsSchema: schema.default({ type: "object", additionalProperties: false }),
  secrets: z.array(z.strictObject({ id, scope: z.literal("connection"), required: z.boolean() })).default([]),
});
export type PluginManifest = z.infer<typeof manifestSchema>;
export type OperationDefinition = z.infer<typeof operation>;
export function validateManifest(input: unknown): PluginManifest {
  const m = manifestSchema.parse(input);
  if (!semver.satisfies(SDK_VERSION, m.requiresSdk)) throw new Error("Unsupported SDK range");
  if (/^(?:[a-z]+:|[/\\])/i.test(m.entry) || m.entry.split(/[/\\]/).includes("..")) throw new Error("Entry must stay inside package");
  for (const list of Object.values(m.contributes)) {
    const ids = list.map(item => typeof item === "string" ? item : "id" in item ? item.id : JSON.stringify(item));
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate contribution ID");
  }
  if (m.contributes.operations.some(op => op.scope === "folder")) throw new Error("Folder-scoped plugin operations are unsupported in stage 1");
  if (m.secrets.length || m.contributes.dataViews.length || m.contributes.generatedUi.length || m.contributes.views.length || m.contributes.secretUses.length) throw new Error("Unsupported stage-1 contribution: views, generated UI and secrets");
  return m;
}
export type FolderSource = { id: string; path: string; label: string; defaultCandidate: boolean };
export type FolderDecoration = { id: string; path: string; icon: "onedrive" };
export type AccountStatus = { id: string; label: string; source: string };
export type PluginStatus = { available: boolean; message: string; folders: FolderSource[]; decorations: FolderDecoration[]; accounts: AccountStatus[] };
export type PluginContext = { settings: Readonly<Record<string, unknown>>; platform: string; env: Readonly<Record<string, string | undefined>>; isDirectory(path: string): boolean };
export type PluginInstance = { operations: Record<string, (input: unknown) => unknown | Promise<unknown>>; status(): PluginStatus | Promise<PluginStatus>; dispose(): void | Promise<void> };
export type PluginModule = { activate(context: PluginContext): PluginInstance | Promise<PluginInstance> };
export type OperationReceipt = { requestId: string; operation: string; version: number; scope: string; outcome: "success" | "refused" | "failure" | "uncertain" };
export { compileSchema } from "./schema.ts";
export const statusSchema = z.strictObject({ available: z.boolean(), message: z.string(),
  folders: z.array(z.strictObject({ id, path: z.string().min(1), label: z.string().min(1), defaultCandidate: z.boolean() })),
  decorations: z.array(z.strictObject({ id, path: z.string().min(1), icon: z.literal("onedrive") })),
  accounts: z.array(z.strictObject({ id, label: z.string().min(1), source: z.string().min(1) })) });
export const pluginManagementSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("list") }),
  z.strictObject({ action: z.literal("register"), directory: z.string().min(1) }),
  z.strictObject({ action: z.literal("trust"), id, digest: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.strictObject({ action: z.literal("enable"), id }), z.strictObject({ action: z.literal("disable"), id }),
  z.strictObject({ action: z.literal("settings"), id, settings: z.record(z.string(), z.unknown()).optional() }),
]);
export type PluginManagementInput = z.infer<typeof pluginManagementSchema>;
export const PLUGIN_MANAGEMENT = { version: 1, scope: "host", inputSchema: z.toJSONSchema(pluginManagementSchema) } as const;
