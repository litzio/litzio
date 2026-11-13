import type {DocumentToolScope} from "./assistant-document-tools.ts";
import {FileAccessError,accessPath} from "./file-access.ts";
import {PLUGIN_REGISTRATION_CHANGED,pluginManagementSchema} from "@litzio/plugin-sdk";
import type {PluginHost} from "./plugins/plugin-host.ts";
import {z} from "zod";
import {publicOperationError} from "./plugins/operation-result.ts";
const pluginOperationInput = z.strictObject({ operation: z.string().min(1), input: z.unknown().refine(value => value !== undefined) });
export const pluginOperationTools = [{ type: "function", name: "invoke_plugin_operation", description: "Invoke a declared assistant:true read operation or health check on this conversation's Host. Inspect manage_plugins list for full operation names and input schemas. Supply comparison targets as operation input, never settings. Read-only turns may invoke these reads. No per-call approval. Activity contains metadata only; never supply secrets.", inputSchema: { type: "object", properties: { operation: { type: "string" }, input: {} }, required: ["operation", "input"], additionalProperties: false } }];

export async function executePluginOperationTool(host: PluginHost, input: unknown, scope: DocumentToolScope) {
  const activity: { operation?: string; outcome: string; at: number; receipt?: Awaited<ReturnType<PluginHost["invokeOperation"]>>["receipt"] } = { outcome: "refused", at: Date.now() };
  try {
    const args = pluginOperationInput.parse(input);
    // Only declared names may enter activity, never arbitrary input or output text.
    if (host.viewOperationOwner(args.operation)) activity.operation = args.operation;
    const result = await host.invokeAssistantOperation(args.operation, args.input);
    activity.outcome = result.receipt.outcome;
    activity.receipt = result.receipt;
    return { ...result, activity };
  } catch (error) {
    const failure = error instanceof z.ZodError ? {errorKind:"invalid_input",error:"Invalid plugin operation input; inspect the operation schema."} : publicOperationError(error, "read");
    return { ...failure, ...(failure.errorKind === "forbidden" ? { error: "Plugin operation refused: the assistant requires a declared read operation with assistant:true, or a health check. Broader turn permissions do not enable writes or private operations through this tool; use the dedicated authorized workflow." } : {}), activity };
  }
}

export const pluginTools = [{ type: "function", name: "manage_plugins", description: "Manage plugins on this Host. Management runs without per-call approval and is recorded in conversation activity. Never supply secrets. Use list to inspect artifacts, registrationId and digests. Trust and enable with trust:true require the registrationId you inspected.", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["list", "install", "scaffold", "dependencies", "bundle", "validate", "register", "trust", "enable", "disable", "reload", "unregister", "settings"] }, id: { type: "string" }, directory: { type: "string" }, template: { type: "string", enum: ["greet", "screen", "chart"] }, digest: { type: "string" }, registrationId: { type: "string" }, trust: { type: "boolean" }, settings: { type: "object", additionalProperties: true } }, required: ["action"], additionalProperties: false } }];
export async function executePluginTool(host: PluginHost, input: unknown, activity: (entry: { action: string; id?: string; outcome: "success" | "failure" }) => void, scope?: DocumentToolScope) {
  input = pluginManagementSchema.parse(input);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Object.assign(new Error("Invalid plugin management input"),{errorKind:"invalid_input"});
  const { action, ...args } = input as Record<string, any>;
  if (!["list", "install", "scaffold", "dependencies", "bundle", "validate", "register", "trust", "enable", "disable", "reload", "unregister", "settings"].includes(action) || Object.keys(args).some(key => !["template", "id", "directory", "digest", "registrationId", "trust", "settings"].includes(key))) throw Object.assign(new Error("Invalid plugin management action"),{errorKind:"invalid_input"});
  const writes = !["list", "validate"].includes(action) && !(action === "settings" && args.settings === undefined);
  if (writes && scope?.permissionMode === "read-only") {
    const entry = { action, id: args.id, outcome: "failure" as const };
    activity(entry);
    return { errorKind:"forbidden", error: `Plugin management action ${action} is blocked in read-only turns. Switch to Opened folders or Full access to change plugins.`, activity: entry };
  }
  try {
    let creationScope = scope?.folders;
    if (action === "scaffold") {
      if (!scope || !["opened-folders", "full-access"].includes(scope.permissionMode)) throw Object.assign(new Error("Plugin creation is read-only for this turn."),{errorKind:"forbidden"});
      if (scope.permissionMode === "opened-folders" && args.directory === undefined) creationScope = host.authoringAccess(true);
      if (!creationScope) throw Object.assign(new Error("No writable folder for this turn."),{errorKind:"forbidden"});
      if (args.directory !== undefined) args.directory = creationScope.resolve(accessPath(args.directory, scope.access, true), true);
    }
    const result = await host.invoke(action, args, action === "scaffold" ? creationScope : undefined);
    const value = result as { id?: string; receipt?: { outcome: string } };
    const entry = { action, id: value.id ?? args.id, outcome: value.receipt?.outcome === "failure" ? "failure" as const : "success" as const };
    activity(entry);
    return { result, ...(entry.outcome === "failure" ? { errorKind:"invalid_input", error: "Plugin validation failed; see result.errors." } : {}), activity: entry };
  } catch (error) { activity({ action, id: args.id, outcome: "failure" }); return { errorKind:error instanceof Error && error.message === PLUGIN_REGISTRATION_CHANGED ? "conflict" : (error as any)?.errorKind ?? (error instanceof FileAccessError ? "forbidden" : ["list","validate"].includes(action) ? "unavailable" : "uncertain"), error: error instanceof Error && error.message === PLUGIN_REGISTRATION_CHANGED ? PLUGIN_REGISTRATION_CHANGED : "Plugin management failed; inspect plugin status.", activity: { action, id: args.id, outcome: "failure" } }; }
}
