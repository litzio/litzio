import { matchesFileAction } from "../../shared/plugin-file-actions.ts";
import type { ViewScreen } from "./view-api.ts";

export function viewFileActions(screens: readonly ViewScreen[], path: string) {
  const entries = screens.flatMap(screen =>
    (screen.fileActions ?? []).filter(action => matchesFileAction(action, path)).map(action => ({ screen, action })));
  entries.sort((a, b) => a.screen.plugin.localeCompare(b.screen.plugin));
  return entries.map(entry => {
    const { screen, action } = entry;
    const duplicate = entries.some(other => other !== entry && other.action.label === action.label);
    return { ...entry, key: `${screen.plugin}:${action.id}`, label: duplicate ? `${action.label} (${screen.title})` : action.label };
  });
}

export type ViewFileAction = ReturnType<typeof viewFileActions>[number];
export type OpenPluginFile = (entry: ViewFileAction, path: string) => boolean;
