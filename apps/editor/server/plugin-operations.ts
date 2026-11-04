import type { createPluginHost } from "./plugin-host.ts";
import { accessPath, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";

const id = { type: "string" };
const object = { type: "object" };
/** Host management only: deliberately not exposed as assistant tools. */
export const pluginOperations = {
  list: { properties: {}, required: [] },
  enable: { properties: { id }, required: ["id"] },
  disable: { properties: { id }, required: ["id"] },
  reregister: { properties: { id }, required: ["id"] },
  register: { properties: { manifest: id }, required: ["manifest"] },
  settings: { properties: { id }, required: ["id"] },
  configure: { properties: { id, args: object }, required: ["id", "args"] },
  features: { properties: { id, args: object }, required: ["id", "args"] },
};
export type PluginOperation = keyof typeof pluginOperations;
export type PluginScope = { host: ReturnType<typeof createPluginHost>; access?: FileAccess };

/** Results are the existing installation/list or plugin settings snapshot, not a new ledger.
 * Failures throw unchanged; async operations must settle before reporting success. */
export function executePluginOperation(operation: PluginOperation, input: unknown, { host, access = LOCAL_FILE_ACCESS }: PluginScope): any {
  const spec = pluginOperations[operation];
  if (!spec || !input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !Object.hasOwn(spec.properties, key))) throw new Error("Unsupported plugin operation input.");
  const value = input as Record<string, any>;
  for (const key of spec.required) if (value[key] === undefined) throw new Error(`Required plugin ${key} is missing.`);
  for (const [key, property] of Object.entries(spec.properties)) {
    if (property.type === "string" && (typeof value[key] !== "string" || !value[key].trim())) throw new Error(`Invalid plugin ${key}.`);
    if (property.type === "object" && (!value[key] || typeof value[key] !== "object" || Array.isArray(value[key]))) throw new Error(`Invalid plugin ${key}.`);
  }
  if (operation === "list") return host.inventory();
  if (operation === "enable") return host.plugins().enable(value.id);
  if (operation === "disable") return host.unregister(value.id).then(() => host.plugins().list());
  if (operation === "reregister") return host.reregister(value.id);
  if (operation === "register") return host.plugins().register(accessPath(value.manifest, access), false, file => { accessPath(file, access); });
  return host.invoke(value.id, operation, value.args ?? {});
}

/** Both contributed HTTP routes and the generic HTTP facade use the same settings entry. */
export function executePluginInvocation(id: string, operation: string, args: unknown, scope: PluginScope): any {
  if (operation === "settings") return executePluginOperation("settings", { id }, scope);
  if (operation === "configure" || operation === "features") return executePluginOperation(operation, { id, args }, scope);
  return scope.host.invoke(id, operation, args);
}
