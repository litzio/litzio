import { executeViewOperation, type ViewProposalScope } from "./views.ts";
import type { FileAccess } from "./file-access.ts";
import type { PluginService } from "./plugin-service.ts";

/** Stateless view execution; plugin runtime lifetime belongs to the plugin service. */
export function createViewService(access: FileAccess, plugins: PluginService, directory?: string) {
  return { execute: async (input: unknown, proposal?: ViewProposalScope) => {
    await plugins.start();
    return executeViewOperation(input, { access, plugins: plugins.host, directory, proposal });
  } };
}
