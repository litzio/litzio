import { pluginManagementSchema, jobRequestSchema, PLUGIN_JOBS } from "@litzio/plugin-sdk";
import type { PluginHost } from "./plugins/plugin-host.ts";
export const pluginTools = [{ type: "function", name: "manage_plugins", description: "Manage plugins on this Host. Every invocation requires a fresh explicit user confirmation in Litzio, including full access. Never supply secrets. Use list to inspect artifacts and digests.", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["list", "register", "trust", "enable", "disable", "unregister", "settings"] }, id: { type: "string" }, directory: { type: "string" }, digest: { type: "string" }, settings: { type: "object", additionalProperties: true } }, required: ["action"], additionalProperties: false } }];
export async function executePluginTool(host: PluginHost, input: unknown, confirm: (description: string) => Promise<boolean>) {
  input = pluginManagementSchema.parse(input);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid plugin management input");
  const { action, ...args } = input as Record<string, any>;
  if (!["list", "register", "trust", "enable", "disable", "unregister", "settings"].includes(action) || Object.keys(args).some(key => !["id", "directory", "digest", "settings"].includes(key))) throw new Error("Invalid plugin management action");
  if (!await confirm(`Target: this conversation's Host. plugins.${action}\n${JSON.stringify(args)}`)) throw new Error("Plugin management was not approved");
  return host.invoke(action, args);
}

export const pluginJobTools = [{ type: "function", name: "plugin_jobs", description: "Start, observe, stop, read the result or list plugin jobs on this conversation's Host. Use the declared job bindings. Files and output are relative to the named Host Root. Generate one UUID for start; on uncertainty query that same requestId, never resend start. No per-call approval. Calls appear in conversation activity.", inputSchema: PLUGIN_JOBS.inputSchema }];
export async function executePluginJobTool(host: PluginHost, input: unknown, scope: import("./assistant-document-tools.ts").DocumentToolScope) {
  const parsed = jobRequestSchema.parse(input);
  if (parsed.action === "job-start" || parsed.action === "job-stop") {
    if (!["opened-folders", "full-access"].includes(scope.permissionMode)) throw new Error("Plugin job writes are read-only for this turn.");
    const root = parsed.action === "job-start" ? parsed.root : host.jobs.list().jobs.find(job => job.requestId === parsed.requestId)?.root;
    if (!root || !scope.folders) throw new Error("No opened folder for this job.");
    scope.folders.resolve(root);
  }
  const { action, ...args } = parsed;
  return host.invoke(action, args);
}
