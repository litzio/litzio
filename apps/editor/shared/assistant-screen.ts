/** Window-owned metadata only. Never includes editor text or plugin result data. */
export type ScreenTab = { id: string; kind: "document" | "text" | "pdf" | "plugin" | "settings" | "templates"; hostId: string | null; title: string; path?: string; unsaved: boolean };
export type ScreenInfo = { activeTab: ScreenTab | null; tabs: ScreenTab[]; folders: { hostId: string; path: string }[] };
export type ScreenRequest = { id: string; validForMs: number };
export type ScreenSnapshot = { screenRequest?: ScreenRequest };
/** Reconstruct the allowlisted result so undeclared content cannot enter provider history. */
export function screenInfo(value: ScreenInfo): ScreenInfo {
  const tab = (item: ScreenTab): ScreenTab => {
    if (!item || typeof item.id !== "string" || !["document", "text", "pdf", "plugin", "settings", "templates"].includes(item.kind) || item.hostId !== null && typeof item.hostId !== "string" || typeof item.title !== "string" || typeof item.unsaved !== "boolean" || item.path !== undefined && typeof item.path !== "string") throw new Error("Invalid screen tab.");
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

/** Concrete reversible actions in the originating window only. */
export type ScreenAction = { kind: "close_tabs"; tabIds: string[] | "all" } | { kind: "open_folder"; hostId: string; path: string } | { kind: "close_folders"; folders: { hostId: string; path: string }[] | "all" };
export type ScreenActionResult = { outcome: "success" | "conflict" | "invalid_input" | "unavailable" | "forbidden" | "uncertain"; completed: string[]; remaining: { target: string; reason: string }[] };
export type ScreenActionRequest = { id: string; validForMs: number; action: ScreenAction };
export type ScreenActionSnapshot = { screenActionRequest?: ScreenActionRequest };
export function screenAction(name: string, value: unknown): ScreenAction {
  const input = value as Record<string, unknown>;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid action input.");
  const keys = name === "close_tabs" ? ["tabIds"] : name === "open_folder" ? ["hostId", "path"] : name === "close_folders" ? ["folders"] : [];
  if (!keys.length || Object.keys(input).some(key => !keys.includes(key))) throw new Error("Invalid action input.");
  const string = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
  if (name === "close_tabs" && (input.tabIds === "all" || Array.isArray(input.tabIds) && input.tabIds.length > 0 && input.tabIds.every(string))) return { kind: name, tabIds: input.tabIds as string[] | "all" };
  if (name === "open_folder" && string(input.hostId) && string(input.path)) return { kind: name, hostId: input.hostId, path: input.path };
  if (name === "close_folders" && (input.folders === "all" || Array.isArray(input.folders) && input.folders.length > 0 && input.folders.every(item => item && Object.keys(item).every(key => ["hostId", "path"].includes(key)) && string(item.hostId) && string(item.path)))) return { kind: name, folders: input.folders as { hostId: string; path: string }[] | "all" };
  throw new Error("Invalid action input.");
}
