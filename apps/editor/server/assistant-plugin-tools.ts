import type { DocumentToolScope } from "./assistant-document-tools.ts";
import { accessPath } from "./file-access.ts";
import { PLUGIN_REGISTRATION_CHANGED, pluginManagementSchema, jobRequestSchema, PLUGIN_JOBS } from "@litzio/plugin-sdk";
import type { PluginHost } from "./plugins/plugin-host.ts";
import { z } from "zod";
import { publicOperationError } from "./plugins/operation-result.ts";

const pluginOperationInput = z.strictObject({ operation: z.string().min(1), input: z.unknown().refine(value => value !== undefined) });
export const pluginOperationTools = [{ type: "function", name: "invoke_plugin_operation", description: "Invoke a declared assistant:true read operation or health check on this conversation's Host. Inspect manage_plugins list for full operation names and input schemas. Supply comparison targets as operation input, never settings. Read-only turns cannot invoke. No per-call approval. Activity contains metadata only; never supply secrets.", inputSchema: { type: "object", properties: { operation: { type: "string" }, input: {} }, required: ["operation", "input"], additionalProperties: false } }];

export async function executePluginOperationTool(host: PluginHost, input: unknown, scope: DocumentToolScope) {
  const activity: { operation?: string; outcome: string; at: number; receipt?: Awaited<ReturnType<PluginHost["invokeOperation"]>>["receipt"] } = { outcome: "refused", at: Date.now() };
  try {
    const args = pluginOperationInput.parse(input);
    // Only declared names may enter activity, never arbitrary input or output text.
    if (host.viewOperationOwner(args.operation)) activity.operation = args.operation;
    if (!["opened-folders", "full-access"].includes(scope.permissionMode))
      return { errorKind: "forbidden", error: "Plugin operations are unavailable in read-only turns.", activity };
    const result = await host.invokeAssistantOperation(args.operation, args.input);
    activity.outcome = result.receipt.outcome;
    activity.receipt = result.receipt;
    return { ...result, activity };
  } catch (error) {
    return { ...publicOperationError(error, "read"), activity };
  }
}

export const pluginTools = [{ type: "function", name: "manage_plugins", description: "Manage plugins on this Host. Management runs without per-call approval and is recorded in conversation activity. Never supply secrets. Use list to inspect artifacts, registrationId and digests. Trust and enable with trust:true require the registrationId you inspected.", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["list", "scaffold", "validate", "register", "trust", "enable", "disable", "reload", "unregister", "settings"] }, id: { type: "string" }, directory: { type: "string" }, template: { type: "string", enum: ["greet", "query", "file"] }, digest: { type: "string" }, registrationId: { type: "string" }, trust: { type: "boolean" }, settings: { type: "object", additionalProperties: true } }, required: ["action"], additionalProperties: false } }];
export async function executePluginTool(host: PluginHost, input: unknown, activity: (entry: { action: string; id?: string; outcome: "success" | "failure" }) => void, scope?: DocumentToolScope) {
  input = pluginManagementSchema.parse(input);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid plugin management input");
  const { action, ...args } = input as Record<string, any>;
  if (!["list", "scaffold", "validate", "register", "trust", "enable", "disable", "reload", "unregister", "settings"].includes(action) || Object.keys(args).some(key => !["template", "id", "directory", "digest", "registrationId", "trust", "settings"].includes(key))) throw new Error("Invalid plugin management action");
  try {
    if (action === "scaffold") {
      if (!scope?.folders || !["opened-folders", "full-access"].includes(scope.permissionMode)) throw new Error("Plugin creation is read-only for this turn.");
      args.directory = scope.folders.resolve(accessPath(args.directory, scope.access, true), true);
    }
    const result = await host.invoke(action, args, action === "scaffold" ? scope!.folders : undefined);
    const value = result as { id?: string; receipt?: { outcome: string } };
    const entry = { action, id: value.id ?? args.id, outcome: value.receipt?.outcome === "failure" ? "failure" as const : "success" as const };
    activity(entry);
    return { result, ...(entry.outcome === "failure" ? { error: "Plugin validation failed; see result.errors." } : {}), activity: entry };
  } catch (error) { activity({ action, id: args.id, outcome: "failure" }); return { error: error instanceof Error && error.message === PLUGIN_REGISTRATION_CHANGED ? PLUGIN_REGISTRATION_CHANGED : "Plugin management failed; inspect plugin status.", activity: { action, id: args.id, outcome: "failure" } }; }
}

export const pluginJobTools = [{ type: "function", name: "plugin_jobs", description: "Start, observe, stop, read the result or list plugin jobs on this conversation's Host. Use the declared job bindings. Files and output are relative to the named Host Root. Generate one UUID for start; on uncertainty query that same requestId, never resend start. No per-call approval. Calls appear in conversation activity.", inputSchema: PLUGIN_JOBS.inputSchema }];
export async function executePluginJobTool(host: PluginHost, input: unknown, scope: import("./assistant-document-tools.ts").DocumentToolScope) {
  const parsed = jobRequestSchema.parse(input);
  if (parsed.action === "job-start" || parsed.action === "job-start-many" || parsed.action === "job-stop") {
    if (!["opened-folders", "full-access"].includes(scope.permissionMode)) throw new Error("Plugin job writes are read-only for this turn.");
    const root = "root" in parsed ? parsed.root : host.jobs.list().jobs.find(job => job.requestId === parsed.requestId)?.root;
    if (!root || !scope.folders) throw new Error("No opened folder for this job.");
    scope.folders.resolve(root);
  }
  const { action, ...args } = parsed;
  return host.invoke(action, args);
}
