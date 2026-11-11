/** Window-owned metadata only. Never includes editor text or plugin result data. */
export type ScreenTab = { id: string; kind: "document" | "text" | "pdf" | "review" | "comparison" | "staged-comparison" | "plugin" | "plugin-jobs" | "settings" | "templates"; hostId: string | null; title: string; path?: string; unsaved: boolean };
export type ScreenInfo = { activeTab: ScreenTab | null; tabs: ScreenTab[]; folders: { hostId: string; path: string }[] };
export type ScreenRequest = { id: string; validForMs: number };
export type ScreenSnapshot = { screenRequest?: ScreenRequest };
/** Reconstruct the allowlisted result so undeclared content cannot enter provider history. */
export function screenInfo(value: ScreenInfo): ScreenInfo {
  const tab = (item: ScreenTab): ScreenTab => {
    if (!item || typeof item.id !== "string" || !["document", "text", "pdf", "review", "comparison", "staged-comparison", "plugin", "plugin-jobs", "settings", "templates"].includes(item.kind) || item.hostId !== null && typeof item.hostId !== "string" || typeof item.title !== "string" || typeof item.unsaved !== "boolean" || item.path !== undefined && typeof item.path !== "string") throw new Error("Invalid screen tab.");
    return { id: item.id, kind: item.kind, hostId: item.hostId, title: item.title, unsaved: item.unsaved, ...(item.path !== undefined ? { path: item.path } : {}) };
  };
  if (!value || !Array.isArray(value.tabs) || !Array.isArray(value.folders)) throw new Error("Invalid screen response.");
  const tabs = value.tabs.map(tab);
  const activeId = value.activeTab?.id;
  const activeTab = value.activeTab === null ? null : tabs.find(item => item.id === activeId);
  if (activeTab === undefined) throw new Error("Active screen tab is not open.");
  const folders = value.folders.map(item => {
    if (!item || typeof item.hostId !== "string" || typeof item.path !== "string") throw new Error("Invalid screen folder.");
    return { hostId: item.hostId, path: item.path };
  });
  return { activeTab, tabs, folders };
}
