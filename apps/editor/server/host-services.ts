import { hostPaths } from "./host-paths.ts";
import { createAssistantHost } from "./assistant-host.ts";
import { createPluginService } from "./plugin-service.ts";
import { createViewService } from "./view-service.ts";
import { LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";
import { resetHostPaths } from "./app-reset.ts";
import { createPluginBuilderService } from "./plugin-builder.ts";

export type HostServices = {
  assistant?: ReturnType<typeof createAssistantHost>;
  plugins?: ReturnType<typeof createPluginService>;
  views?: ReturnType<typeof createViewService>;
  pluginBuilder?: ReturnType<typeof createPluginBuilderService>;
};

/** Compose once per Host. Assistant initialization cannot block plugin/view requests. */
export function createHostServices(access: FileAccess = LOCAL_FILE_ACCESS) {
  const paths = hostPaths(undefined, { ...process.env });
  const plugins = createPluginService(access, paths.settingsFile("plugins"), paths.jobHistory);
  const views = createViewService(access, plugins);
  let assistant: ReturnType<typeof createAssistantHost> | undefined;
  let pluginBuilder: ReturnType<typeof createPluginBuilderService> | undefined;
  let closed = false;
  let closing: Promise<void> | undefined;
  return {
    resetPaths: resetHostPaths(paths),
    plugins, views,
    get assistant() {
      if (closed) throw new Error("The Host is closing.");
      return assistant ??= createAssistantHost(access, undefined, { plugins, paths });
    },
    get pluginBuilder() {
      if (closed) throw new Error("The Host is closing.");
      return pluginBuilder ??= createPluginBuilderService({ connection: () => this.assistant.connection(), plugins });
    },
    close() {
      closed = true;
      pluginBuilder?.close();
      return closing ??= (async () => {
        const results = await Promise.allSettled([Promise.resolve().then(() => assistant?.close()), Promise.resolve().then(() => plugins.close())]);
        const errors = results.flatMap(result => result.status === "rejected" ? [result.reason] : []);
        if (errors.length) throw new AggregateError(errors, "Host services could not close.");
      })();
    },
  };
}
