/** Fixed appearance allowlist. This is internal Host/screen transport, not a Plugin API. */
export const DISPLAY_SETTINGS = {
  theme: ["light", "dark"], uiLanguage: ["ko", "en"],
  documentWidth: ["standard", "wide"], pageBackground: ["paper", "flat"],
} as const;
export type DisplaySettings = { [K in keyof typeof DISPLAY_SETTINGS]: typeof DISPLAY_SETTINGS[K][number] };
export type DisplayChanges = Partial<DisplaySettings>;
export function displayValues(value: unknown, complete = false): DisplayChanges {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid display settings.");
  const entries = Object.entries(value);
  if (!entries.length || complete && entries.length !== Object.keys(DISPLAY_SETTINGS).length || entries.some(([key, val]) =>
    !Object.hasOwn(DISPLAY_SETTINGS, key) || !(DISPLAY_SETTINGS[key as keyof DisplaySettings] as readonly unknown[]).includes(val))) throw new Error("Unsupported display setting or value.");
  return { ...value };
}
export type DisplayRequest = { id: string; expiresAt: number; changes?: DisplayChanges; expected?: DisplayChanges };
export type DisplayReply = { before: DisplaySettings; after: DisplaySettings; error?: string };
export type DisplayReceipt = DisplayReply & { requestId: string; changed: (keyof DisplaySettings)[] };
export type DisplaySnapshot = { displayRequest?: DisplayRequest };
