import { pluginManagementSchema } from "@litzio/plugin-sdk";
import type { PluginHost } from "./plugins/plugin-host.ts";
export const pluginTools = [{ type: "function", name: "manage_plugins", description: "Manage plugins on this Host. Every invocation requires a fresh explicit user confirmation in Litzio, including full access. Never supply secrets. Use list to inspect artifacts and digests.", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["list", "register", "trust", "enable", "disable", "settings"] }, id: { type: "string" }, directory: { type: "string" }, digest: { type: "string" }, settings: { type: "object", additionalProperties: true } }, required: ["action"], additionalProperties: false } }];
export async function executePluginTool(host: PluginHost, input: unknown, confirm: (description: string) => Promise<boolean>) {
  input = pluginManagementSchema.parse(input);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid plugin management input");
  const { action, ...args } = input as Record<string, any>;
  if (!["list", "register", "trust", "enable", "disable", "settings"].includes(action) || Object.keys(args).some(key => !["id", "directory", "digest", "settings"].includes(key))) throw new Error("Invalid plugin management action");
  if (!await confirm(`Target: this conversation's Host. plugins.${action}\n${JSON.stringify(args)}`)) throw new Error("Plugin management was not approved");
  return host.invoke(action, args);
}
