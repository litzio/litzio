import { PluginHost } from "./plugins/plugin-host.ts";
import { type FileAccess, LOCAL_FILE_ACCESS } from "./file-access.ts";
import { hostPaths } from "./host-paths.ts";

/** Host-owned plugin lifetime and management API, independent of AI providers. */
export function createPluginService(access: FileAccess = LOCAL_FILE_ACCESS, settingsFile = hostPaths().settingsFile("plugins")) {
  const host = new PluginHost(settingsFile, { access });
  let ready: Promise<void> | undefined, closing: Promise<void> | undefined;
  let closed = false;
  const start = () => {
    if (closed) return Promise.reject(new Error("The Plugin Host is closing."));
    return ready ??= host.start();
  };
  const invoke = async (operation: string, args: any = {}): Promise<any> => {
    await start();
    if (operation === "review") return host.reviews.execute(args);
    if (operation === "pluginSecretSet") {
      try { return await host.setSecret(args.id, args.name, args.value); }
      catch { throw new Error("Unable to store plugin secret. Disable the plugin and check Windows store support."); }
    }
    if (operation === "pluginsList") return { plugins: await host.list() };
    if (operation === "pluginsManage") { const { action, ...input } = args; return host.invoke(action, input); }
    throw new Error("Unknown plugin operation.");
  };
  const route = (url: string): Record<string, string> | undefined => {
    if (url === "/api/reviews") return { POST: "review" };
    if (url === "/api/plugins/secrets") return { POST: "pluginSecretSet" };
    if (url === "/api/plugins") return { GET: "pluginsList", POST: "pluginsManage" };
  };
  const close = () => {
    closed = true;
    return closing ??= (async () => { try { await ready; } finally { await host.close(); } })();
  };
  return { host, start, invoke, route, close };
}
export type PluginService = ReturnType<typeof createPluginService>;
