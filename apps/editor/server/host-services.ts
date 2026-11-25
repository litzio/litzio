import { hostPaths } from "./host-paths.ts";
import { createAssistantHost } from "./assistant-host.ts";
import { createPluginService } from "./plugin-service.ts";
import type { PluginHostLogging } from "./plugins/plugin-host.ts";
import { createViewService } from "./view-service.ts";
import { LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";
import { resetHostPaths } from "./app-reset.ts";
import { DocumentThread } from "./document-thread.ts";

export type HostServices = {
  documents?: DocumentThread;
  assistant?: ReturnType<typeof createAssistantHost>;
  plugins?: ReturnType<typeof createPluginService>;
  views?: ReturnType<typeof createViewService>;
};

/** Compose once per Host. Assistant initialization cannot block plugin/view requests. */
export function createHostServices(access: FileAccess = LOCAL_FILE_ACCESS, options?: PluginHostLogging & { origin(): string | undefined }) {
  const paths = hostPaths(undefined, { ...process.env });
  const plugins = createPluginService(access, paths.settingsFile("plugins"), paths.assistant, options);
  const views = createViewService(access, plugins);
  const documents = new DocumentThread(options, paths.settingsFile("local-write-statistics"));
  let assistant: ReturnType<typeof createAssistantHost> | undefined;
  let closed = false;
  let closing: Promise<void> | undefined;
  return {
    resetPaths: resetHostPaths(paths),
    documents,
    plugins, views,
    get assistant() {
      if (closed) throw new Error("The Host is closing.");
      return assistant ??= createAssistantHost(access, undefined, { plugins, paths, origin: options?.origin, log: options?.log });
    },
    close() {
      closed = true;
      return closing ??= (async () => {
        const results = await Promise.allSettled([documents.close(), Promise.resolve().then(() => assistant?.close()), Promise.resolve().then(() => plugins.close())]);
        const errors = results.flatMap(result => result.status === "rejected" ? [result.reason] : []);
        if (errors.length) throw new AggregateError(errors, "Host services could not close.");
      })();
    },
  };
}
