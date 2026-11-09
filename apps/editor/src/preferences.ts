import { LOCAL_HOST_ID, locatorKey } from "./host-locator.ts";
import { brand } from "../../../brand.ts";
/**
 * User display and navigation preferences. They belong to this browser, never to a document: nothing here is
 * written to Markdown. The assistant can read/change its fixed appearance allowlist through the Host. Their visual values live in `styles/tokens.css`.
 */
export type DocumentWidth = "standard" | "wide";

export const PAGE_BACKGROUNDS = ["paper", "flat"] as const;
export type PageBackground = typeof PAGE_BACKGROUNDS[number];
export const PAGE_BACKGROUND_KEY = `${brand.storagePrefix}.pageBackground`;

export function readPageBackground(): PageBackground {
  try {
    return globalThis.localStorage?.getItem(PAGE_BACKGROUND_KEY) === "flat" ? "flat" : "paper";
  } catch { return "paper"; }
}

export function writePageBackground(page: PageBackground): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(PAGE_BACKGROUND_KEY, page);
    return true;
  } catch { return false; }
}

export const THEME_LABELS = { light: "Light", dark: "Dark" } as const;
export const THEMES = ["light", "dark"] as const;
export type ThemePreference = typeof THEMES[number];
export const THEME_KEY = `${brand.storagePrefix}.theme`;

export function readTheme(): ThemePreference {
  try {
    const saved = globalThis.localStorage?.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    const initial = saved == null && globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    writeTheme(initial);
    return initial;
  } catch { return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
}

export function writeTheme(theme: ThemePreference): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(THEME_KEY, theme);
    return true;
  } catch { return false; }
}

export const ACCENT_COLORS = ["blue", "violet", "plum", "teal", "green", "graphite"] as const;
export type AccentColor = typeof ACCENT_COLORS[number];
export const ACCENT_COLOR_KEY = `${brand.storagePrefix}.accentColor`;

export function readAccentColor(): AccentColor {
  try {
    const saved = globalThis.localStorage?.getItem(ACCENT_COLOR_KEY);
    return ACCENT_COLORS.find(color => color === saved) ?? "plum";
  } catch { return "plum"; }
}

/** The live choice still applies when preference persistence is unavailable. */
export function writeAccentColor(color: AccentColor): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(ACCENT_COLOR_KEY, color);
    return true;
  } catch { return false; }
}

export type UiLanguage = "ko" | "en";
export const UI_LANGUAGE_KEY = `${brand.storagePrefix}.uiLanguage`;

export function readUiLanguage(): UiLanguage {
  try {
    const saved = globalThis.localStorage?.getItem(UI_LANGUAGE_KEY);
    if (saved === "ko" || saved === "en") return saved;
  } catch { /* A disabled preference store does not prevent opening the Editor. */ }
  const preferred = globalThis.navigator?.languages?.[0] || globalThis.navigator?.language || "en";
  return /^ko(?:-|$)/i.test(preferred) ? "ko" : "en";
}

/** The live choice still applies when preference persistence is unavailable. */
export function writeUiLanguage(language: UiLanguage): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(UI_LANGUAGE_KEY, language);
    return true;
  } catch { return false; }
}

const DOCUMENT_WIDTH_KEY = `${brand.storagePrefix}.documentWidth`;

export function readDocumentWidth(): DocumentWidth {
  try {
    return globalThis.localStorage?.getItem(DOCUMENT_WIDTH_KEY) === "wide" ? "wide" : "standard";
  } catch {
    return "standard";
  }
}

/** Remembers the preference when storage is available; the current page applies it either way. */
export function writeDocumentWidth(width: DocumentWidth): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(DOCUMENT_WIDTH_KEY, width);
    return true;
  } catch {
    // Storage can be disabled; the preference then lasts for this page only.
    return false;
  }
}

const RECENT_FOLDERS_KEY = `${brand.storagePrefix}.recentFolders`;
const RECENT_FOLDER_LIMIT = 5;

/** Display filtering only; the Host still authorizes each filesystem request. */
export function visibleRecentFolders(recent: string[], roots?: readonly string[]): string[] {
  if (!roots) return recent;
  return recent.filter(folder => !folder.split(/[\\/]/).some(part => part === "." || part === "..") && roots.some(root => folder === root ||
    folder.startsWith(root.endsWith("/") || root.endsWith("\\") ? root : root + (root.includes("\\") ? "\\" : "/"))));
}

/** Folders opened in this browser, newest first. */
export function readRecentFolders(hostId = LOCAL_HOST_ID): string[] {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(locatorKey({ hostId, path: RECENT_FOLDERS_KEY })) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, RECENT_FOLDER_LIMIT) : [];
  } catch {
    return [];
  }
}

const OPEN_FOLDERS_KEY = `${brand.storagePrefix}.openFolders`;

/**
 * The sidebar's opened folders, in order, for this browser and Host origin. Paths are stored under a Host identity key;
 * each is listed again through the Host on start, which still authorizes it.
 */
export function readOpenFolders(hostId = LOCAL_HOST_ID): string[] {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(locatorKey({ hostId, path: OPEN_FOLDERS_KEY })) ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))] : [];
  } catch {
    return [];
  }
}

export function writeOpenFolders(folders: readonly string[], hostId = LOCAL_HOST_ID): void {
  try {
    globalThis.localStorage?.setItem(locatorKey({ hostId, path: OPEN_FOLDERS_KEY }), JSON.stringify(folders));
  } catch {
    // Storage can be disabled; the folders then stay open for this page only.
  }
}

const COLLAPSED_FOLDER_SECTIONS_KEY = `${brand.storagePrefix}.collapsedFolderSections`;

/** Collapsed opened roots only, in the same browser/origin boundary as openFolders. */
export function readCollapsedFolderSections(hostId = LOCAL_HOST_ID): string[] {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(locatorKey({ hostId, path: COLLAPSED_FOLDER_SECTIONS_KEY })) ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))] : [];
  } catch { return []; }
}

export function writeCollapsedFolderSections(roots: readonly string[], hostId = LOCAL_HOST_ID): void {
  try { globalThis.localStorage?.setItem(locatorKey({ hostId, path: COLLAPSED_FOLDER_SECTIONS_KEY }), JSON.stringify(roots)); }
  catch { /* Disabled storage leaves section visibility usable for this page. */ }
}

const OPEN_TABS_KEY = `${brand.storagePrefix}.openTabs`;
export type OpenTabsPreference = { paths: string[]; activePath: string | null };

/** null means no usable preference; an empty list deliberately starts without a document. */
export function readOpenTabs(hostId = LOCAL_HOST_ID): OpenTabsPreference | null {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(locatorKey({ hostId, path: OPEN_TABS_KEY })) ?? "null") as OpenTabsPreference | null;
    if (!value || !Array.isArray(value.paths)) return null;
    const paths = [...new Set(value.paths.filter((item): item is string => typeof item === "string" && item.length > 0))];
    return { paths, activePath: typeof value.activePath === "string" && paths.includes(value.activePath) ? value.activePath : null };
  } catch { return null; }
}

/** Navigation only: never content, editor snapshots, or Host authorization. */
export function writeOpenTabs(tabs: OpenTabsPreference, hostId = LOCAL_HOST_ID): void {
  try { globalThis.localStorage?.setItem(locatorKey({ hostId, path: OPEN_TABS_KEY }), JSON.stringify(tabs)); }
  catch { /* Disabled storage leaves the current page's tabs usable. */ }
}

/** Puts a folder first in the recent list; returns the new list. */
export function rememberRecentFolder(folder: string, previous: string[] | undefined = undefined, hostId = LOCAL_HOST_ID): string[] {
  previous ??= readRecentFolders(hostId);
  const recent = [folder, ...previous.filter(item => item !== folder)].slice(0, RECENT_FOLDER_LIMIT);
  try {
    globalThis.localStorage?.setItem(locatorKey({ hostId, path: RECENT_FOLDERS_KEY }), JSON.stringify(recent));
  } catch {
    // Storage can be disabled; the list then lasts for this page only.
  }
  return recent;
}

// Path-scoped presentation only. No Markdown, Host writes or editor transactions.
export const TABLE_WRAP_DEFAULT_KEY = `${brand.storagePrefix}.tableWrapDefault`;
export const TABLE_WRAP_DOCUMENTS_KEY = `${brand.storagePrefix}.tableWrapDocuments`;
export function readTableWrapDefault(): boolean {
  try { return globalThis.localStorage?.getItem(TABLE_WRAP_DEFAULT_KEY) !== "false"; }
  catch { return true; }
}
export function readTableWrapDocuments(hostId = LOCAL_HOST_ID): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(locatorKey({ hostId, path: TABLE_WRAP_DOCUMENTS_KEY })) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === "boolean")) : {};
  } catch { return {}; }
}
export function writeTableWrapPreferences(defaultValue: boolean, documents: Record<string, boolean>, hostId = LOCAL_HOST_ID): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(TABLE_WRAP_DEFAULT_KEY, String(defaultValue));
    globalThis.localStorage.setItem(locatorKey({ hostId, path: TABLE_WRAP_DOCUMENTS_KEY }), JSON.stringify(documents));
    return true;
  } catch { return false; }
}

// Browser-owned plugin screen presentation; never written to documents or the Host.
export const PLUGIN_TABLE_COLUMNS_KEY = `${brand.storagePrefix}.pluginTableColumns`;
export function readPluginTableColumns(scope: string): string[] | undefined {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(`${PLUGIN_TABLE_COLUMNS_KEY}:${scope}`) ?? "null");
    return Array.isArray(value) && value.every(v => typeof v === "string") ? value : undefined;
  } catch { return undefined; }
}
export function writePluginTableColumns(scope: string, columns: string[]): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(`${PLUGIN_TABLE_COLUMNS_KEY}:${scope}`, JSON.stringify(columns));
    return true;
  } catch { return false; }
}
