import { displayRequestCurrent, displayValues, type DisplayReply, type DisplayRequest, type DisplaySettings } from "../shared/assistant-display.ts";
import { currentTheme, applyTheme, applyPageBackground } from "./theme.ts";
import { i18n } from "./i18n.ts";
import { writePageBackground, writeTheme, writeUiLanguage, writeDocumentWidth, type DocumentWidth } from "./preferences.ts";

/** Uses the same live state and preference writers as Settings; never touches document state. */
export async function handleDisplayRequest(request: DisplayRequest, width: DocumentWidth, setWidth: (width: DocumentWidth) => void, setTheme: (theme: DisplaySettings["theme"]) => void, pollStartedAt: number): Promise<DisplayReply> {
  const read = (): DisplaySettings => ({ theme: currentTheme(), uiLanguage: i18n.resolvedLanguage === "ko" ? "ko" : "en", documentWidth: width,
    pageBackground: document.documentElement.dataset.page === "flat" ? "flat" : "paper" });
  const before = read();
  try {
    if (!displayRequestCurrent(request, pollStartedAt)) throw new Error(i18n.t("Display request expired."));
    if (!request.changes) return { before, after: before };
    const changes = displayValues(request.changes);
    if (request.expected && Object.entries(displayValues(request.expected)).some(([key, value]) => before[key as keyof DisplaySettings] !== value)) throw new Error(i18n.t("Display settings changed since this action. Undo was not applied."));
    // Apply to the live window even when storage is blocked, as manual Settings does.
    // Report persistence failure explicitly instead of claiming a saved change.
    let persisted = true;
    if (changes.theme) { await applyTheme(changes.theme, false); setTheme(changes.theme); persisted = writeTheme(changes.theme) && persisted; }
    if (changes.uiLanguage) { await i18n.changeLanguage(changes.uiLanguage); persisted = writeUiLanguage(changes.uiLanguage) && persisted; }
    if (changes.pageBackground) { applyPageBackground(changes.pageBackground); persisted = writePageBackground(changes.pageBackground) && persisted; }
    if (changes.documentWidth) { width = changes.documentWidth; setWidth(width); persisted = writeDocumentWidth(width) && persisted; }
    // Mounted Settings owns local page state; notify it to reflect the actual choice.
    window.dispatchEvent(new Event("litzio-display-changed"));
    return { before, after: read(), ...(!persisted ? { error: i18n.t("Display changed in this window but could not be saved.") } : {}) };
  } catch (error) { return { before, after: read(), error: (error as Error).message }; }
}
