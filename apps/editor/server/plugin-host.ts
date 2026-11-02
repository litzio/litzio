import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HostModule, HostPlugin } from "@litzio/plugin-api/host";
import { decodeUtf8 } from "@litzio/file-commit";
import { brand } from "../../../brand.ts";
import { accessPath, type FileAccess, LOCAL_FILE_ACCESS } from "./file-access.ts";
import { resolveDocumentPath, resolveMediaPath } from "./document-path.ts";
import { readModel } from "./document-replay.ts";
import { PluginRuntime } from "./plugin-runtime.ts";
import { AI_TASK, type AiTaskService } from "@litzio/plugin-api/ai";

declare const __LITZIO_DOCLING_DIRECTORY__: string;
declare const __LITZIO_AI_DIRECTORY__: string;
export function bundledAiManifest() {
  return fileURLToPath(new URL(`${typeof __LITZIO_AI_DIRECTORY__ === "string" ? __LITZIO_AI_DIRECTORY__ : "../../../tmp/ai-agent-worker"}/manifest.json`, import.meta.url));
}
export function bundledPluginManifest() {
  return fileURLToPath(new URL(`${typeof __LITZIO_DOCLING_DIRECTORY__ === "string" ? __LITZIO_DOCLING_DIRECTORY__ : "../../../tmp/docling-worker"}/manifest.json`, import.meta.url));
}
export function pluginsDirectory() { return process.env.LITZIO_PLUGINS_DIR ?? path.join(os.homedir(), brand.folders.shared, brand.folders.plugins); }

/** Load declared trusted operations, never plugin source or an application import. */
export function createPluginHost(access: FileAccess = LOCAL_FILE_ACCESS, settingsFile?: string, options?: { directory?: string; manifest?: string; timeoutMs?: number; aiManifest?: string; aiTimeoutMs?: number }) {
  let runtime: PluginRuntime | undefined, closed = false, closing: Promise<void> | undefined;
  const directory = options?.directory ?? pluginsDirectory();
  const configuredSettings = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("LITZIO_") && key.endsWith("_SETTINGS_FILE")));
  const activations = new Map<string, HostPlugin>();
  const sessions = new Map<string, Map<string, unknown>>();
  const getRuntime = () => {
    if (closed) throw new Error("The plugin runtime is closing.");
    return runtime ??= new PluginRuntime(directory, options?.manifest ?? bundledPluginManifest(), options?.timeoutMs, file => { accessPath(file, access, true); });
  };
  const plugins = (seed = false) => {
    const value = getRuntime();
    if (seed) {
      value.ensureBundled();
      if (!value.store.list().some(item => item.id === AI_TASK.plugin)) value.store.register(options?.aiManifest ?? bundledAiManifest(), true);
    }
    return value.store;
  };
  const load = (id: string) => {
    const store = plugins(true), installation = store.list().find(item => item.id === id);
    if (!installation?.host) throw new Error("Plugin Host operations are unavailable.");
    const key = `${id}/${installation.revision}`;
    let plugin = activations.get(key);
    if (!plugin) {
      const file = store.hostEntry(id);
      const module: HostModule = createRequire(import.meta.url)(file);
      plugin = module.activate({
        features: () => store.list().find(item => item.id === id)?.features ?? {},
        setFeatures: features => store.setFeatures(id, features),
        settingsFile: settingsFile ?? configuredSettings[`LITZIO_${id.toUpperCase().replaceAll("-", "_")}_SETTINGS_FILE`] ?? path.join(os.homedir(), brand.folders.shared, `${id}.json`),
        resolvePath: (file, create) => accessPath(file, access, create),
        documentPath: file => resolveDocumentPath(file, access),
        mediaPath: (uri, file) => resolveMediaPath(uri, file, access),
        readText: file => decodeUtf8(readFileSync(accessPath(file, access))),
        validateDocument: source => { readModel(source); },
        session: sessions.get(id) ?? sessions.set(id, new Map()).get(id)!,
        requestOwner: () => getRuntime().store.requestOwner(),
        isRequestOwnerAlive: owner => getRuntime().store.isRequestOwnerAlive(owner),
        executor: { start: request => getRuntime().start({ ...request, plugin: id }), current: id => getRuntime().current(id),
          cancel: id => getRuntime().cancel(id), close: () => close(),
          history: () => getRuntime().requestHistory(id), forget: request => getRuntime().forgetRequest(request, id) },
        aiExecutor: { start: (request, timeoutMs) => getRuntime().ai.start(request, options?.aiTimeoutMs ?? timeoutMs, id),
          current: request => getRuntime().ai.current(request), cancel: request => getRuntime().ai.cancel(request) },
        aiTasks: () => {
          const service = aiTasks();
          if (!service) return undefined;
          const own = (request: string) => {
            const record = service.current(request);
            if (record && record.job.caller !== id) throw new Error("AI task belongs to another caller.");
            return record;
          };
          return { status: service.status, start: request => {
            if (request.caller !== id || !plugins().list().find(item => item.id === id)?.enabled) throw new Error("AI task caller is unavailable or mismatched.");
            if (!aiTasks()) throw new Error("AI agent is disabled.");
            return service.start(request);
          }, current: own, cancel: request => { own(request); return service.cancel(request); } };
        },
      });
      activations.set(key, plugin);
    }
    return plugin;
  };
  const aiTasks = (): AiTaskService | undefined => {
    const installation = plugins(true).list().find(item => item.enabled && item.services?.includes(AI_TASK.service));
    return installation ? load(installation.id).aiTaskService : undefined;
  };
  const invoke = <T = any>(id: string, operation: string, args: unknown = {}): T => {
    const plugin = load(id);
    if (!Object.hasOwn(plugin.operations, operation)) throw new Error("Unknown plugin operation.");
    if (!plugins().list().find(item => item.id === id)?.enabled && !plugin.drainingOperations?.includes(operation)) throw new Error("Plugin is disabled.");
    return plugin.operations[operation](args);
  };
  const route = (url: string) => {
    for (const installation of plugins(true).list()) if (installation.host && installation.routes?.includes(url)) {
      const methods = load(installation.id).routes[url];
      if (methods) return { id: installation.id, methods };
    }
  };
  const close = () => {
    closed = true;
    return closing ??= (runtime?.close() ?? Promise.resolve()).finally(() => { activations.clear(); sessions.clear(); });
  };
  return { plugins, invoke, route, aiTasks, close };
}
