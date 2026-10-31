import { createPluginHost } from "../../server/plugin-host.ts";
import type { ConversionJob } from "@litzio/plugin-api/worker";
import path from "node:path";
export function createDoclingHost(...args: Parameters<typeof createPluginHost>) {
  const [access, settings, options] = args;
  const host = createPluginHost(access, settings, options ?? (settings ? { directory: path.join(path.dirname(settings), "plugins-default") } : undefined));
  return Object.assign(host, {
    settings: () => host.invoke<{ server: string }>("docling", "settings"),
    configure: (server: unknown) => host.invoke("docling", "configure", { server }),
    check: () => host.invoke("docling", "check"),
    current: (id?: string) => host.invoke<ConversionJob | null>("docling", "current", { id }),
    start: async (path: unknown, id?: string) => host.invoke<Promise<ConversionJob>>("docling", "start", { path, id }),
    cancel: async (id: unknown) => host.invoke<Promise<ConversionJob>>("docling", "cancel", { id }),
  });
}
