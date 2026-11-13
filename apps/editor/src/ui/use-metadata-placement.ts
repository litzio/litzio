import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { documentScrollContainer } from "../document-scroll.ts";

/** Whole target plus its metadata line, shared by side selection and Base UI. */
export function metadataAnchorRect(block: Element, anchor: HTMLElement | null) {
  const rect = block.getBoundingClientRect();
  const top = Math.min(rect.top, anchor?.getBoundingClientRect().top ?? rect.top);
  return new DOMRect(rect.left, top, rect.width, rect.bottom - top);
}

/** Choose against the largest thumbnail, not the current loading paragraph.
 * Only external geometry changes choose again; the library still tracks the anchor. */
export function useMetadataPlacement(anchor: RefObject<HTMLElement | null>, target: () => Element | null,
  popup: HTMLElement | null, bounds: { x: number; y: number; width: number; height: number } | undefined, open: boolean) {
  const [side, setSide] = useState<"top" | "bottom">("bottom");
  const currentSide = useRef(side);
  const targetRef = useRef(target); targetRef.current = target;
  const focused = useRef<{ element: HTMLElement; selection?: [number | null, number | null, "forward" | "backward" | "none" | null] }>(undefined);
  useLayoutEffect(() => {
    if (!popup || !bounds || !open) return;
    const measure = () => {
      const block = targetRef.current();
      if (!block) return;
      const rect = metadataAnchorRect(block, anchor.current), style = getComputedStyle(popup);
      const fields = popup.querySelector<HTMLElement>(".metadata-property-fields")!;
      const actions = popup.querySelector<HTMLElement>(".form-actions")!;
      const media = popup.querySelector<HTMLElement>(".metadata-property-media");
      const gap = parseFloat(getComputedStyle(fields).rowGap);
      const frame = [style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderBottomWidth].reduce((sum, value) => sum + parseFloat(value), 0);
      const height = frame + fields.scrollHeight + actions.offsetHeight + gap + (media ? parseFloat(getComputedStyle(media).maxHeight) + gap : 0);
      const offset = parseFloat(style.getPropertyValue("--space-figure-popover-gap"));
      // Match Base UI's pinned default collision padding.
      const below = bounds.y + bounds.height - rect.bottom - offset - 5;
      const above = rect.top - bounds.y - offset - 5;
      const next = below >= height || below >= above ? "bottom" : "top";
      if (currentSide.current !== next) {
        focused.current = undefined;
        const element = popup.ownerDocument.activeElement;
        if (element instanceof HTMLElement && popup.contains(element)) focused.current = { element,
          selection: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
            ? [element.selectionStart, element.selectionEnd, element.selectionDirection] : undefined };
        currentSide.current = next;
        setSide(next);
      }
    };
    measure();
    const viewport = documentScrollContainer(anchor.current);
    viewport?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => { viewport?.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, [anchor, popup, bounds, open]);
  useLayoutEffect(() => {
    const snapshot = focused.current; focused.current = undefined;
    if (!snapshot?.element.isConnected || !document.hasFocus()) return;
    const active = document.activeElement;
    if (active !== document.body && active !== snapshot.element) return;
    snapshot.element.focus({ preventScroll: true });
    if (snapshot.selection && (snapshot.element instanceof HTMLInputElement || snapshot.element instanceof HTMLTextAreaElement)) {
      const [start, end, direction] = snapshot.selection;
      if (start !== null && end !== null) snapshot.element.setSelectionRange(start, end, direction ?? undefined);
    }
  }, [side]);
  return side;
}
