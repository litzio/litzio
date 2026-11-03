import { useLayoutEffect } from "react";

/** Keep Chromium's document-wide native input history inside its focused surface. */
export function useNativeHistoryBoundary(boundary: HTMLElement | null, enabled = true): void {
  useLayoutEffect(() => {
    if (!enabled || !boundary) return;
    const document = boundary.ownerDocument;
    // beforeinput identifies the real history target before mutation and focus transfer.
    // Nested dialogs own their own portal boundary when focus leaves this surface.
    const guardHistory = (event: InputEvent) => {
      if ((event.inputType === "historyUndo" || event.inputType === "historyRedo") &&
          boundary.contains(document.activeElement) && event.target instanceof Node && !boundary.contains(event.target)) {
        event.preventDefault();
      }
    };
    document.addEventListener("beforeinput", guardHistory, true);
    return () => document.removeEventListener("beforeinput", guardHistory, true);
  }, [enabled, boundary]);
}
