import { PluginHost, type PluginHostLogging } from "./plugins/plugin-host.ts";
import { type FileAccess, LOCAL_FILE_ACCESS } from "./file-access.ts";
import { hostPaths } from "./host-paths.ts";

/** Host-owned plugin lifetime and management API, independent of AI providers. */
export function createPluginService(access: FileAccess = LOCAL_FILE_ACCESS, settingsFile = hostPaths().settingsFile("plugins"), assistantDirectory = hostPaths().assistant, logging?: PluginHostLogging) {
  const host = new PluginHost(settingsFile, { access, assistantDirectory, log: logging?.log, warn: logging?.warn });
  let ready: Promise<void> | undefined, closing: Promise<void> | undefined;
  let closed = false;
  // Catalogs and management can respond as soon as registered activations have been scheduled.
  const begin = () => {
    if (closed) throw new Error("The Plugin Host is closing.");
    return ready ??= host.start();
  };
  const start = async () => begin();
  const invoke = async (operation: string, args: any = {}): Promise<any> => {
    begin();
    if (operation === "pluginSecretSet") {
      try { return await host.setSecret(args.id, args.name, args.value); }
      catch (error) {
        throw new Error("Unable to store plugin secret. Check plugin status and Windows store support.");
      }
    }
    if (operation === "pluginsList") return { plugins: await host.list() };
    if (operation === "pluginsManage") { const { action, ...input } = args; return host.invoke(action, input); }
    throw new Error("Unknown plugin operation.");
  };
  const route = (url: string): Record<string, string> | undefined => {
    if (url === "/api/plugins/secrets") return { POST: "pluginSecretSet" };
    if (url === "/api/plugins") return { GET: "pluginsList", POST: "pluginsManage" };
  };
  const close = () => {
    closed = true;
    host.stopActivations();
    return closing ??= (async () => { try { await ready; } finally { await host.close(); } })();
  };
  return { host, start, begin, invoke, route, close };
}
export type PluginService = ReturnType<typeof createPluginService>;
