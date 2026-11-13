import { useLayoutEffect, useRef, type RefObject } from "react";
import type { ReadingPosition } from "../document-reading.ts";

/** The preview owns scrolling; the renderer only reports snapshot geometry. */
export function useDocumentViewNavigation(viewport: RefObject<HTMLDivElement | null>, request: object, identity: string,
  selected: false | ReadingPosition["blocks"][number] | ReadingPosition["cells"][number] | undefined) {
  const manual = useRef(false), first = useRef(true);
  useLayoutEffect(() => { manual.current = false; first.current = true; }, [request, identity]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || !selected || manual.current || selected.height <= 0) return;
    // A later renderer measurement can move the target after its first reveal.
    // Keep it visible without moving an already-visible target on every report.
    const visibleHeight = Math.min(selected.height, Math.max(0, element.clientHeight - 32));
    const outside = selected.top < element.scrollTop + 16 || selected.top + visibleHeight > element.scrollTop + element.clientHeight - 16;
    if (first.current || outside) element.scrollTo({ top: Math.max(0, selected.top - 16) });
    if ("clip" in selected) {
      // Tables own horizontal scrolling. Never pan the preview or its plugin screen.
      const scroller = element.querySelector<HTMLElement>(`.table-block[data-source-path="${JSON.parse(selected.table).join(",")}"] .table-scroll`);
      const visibleWidth = Math.min(selected.width, Math.max(0, selected.clip.width - 32));
      if (scroller && (selected.left < selected.clip.left + 16 || selected.left + visibleWidth > selected.clip.left + selected.clip.width - 16)) {
        scroller.scrollBy({ left: selected.left - selected.clip.left - 16 });
      }
    }
    first.current = false;
  }, [viewport, request, identity, selected]);
  const pause = () => { manual.current = true; };
  return {
    onWheelCapture: pause,
    onPointerDownCapture: (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget || event.target instanceof HTMLElement && event.target.matches(".table-scroll")) pause();
    },
    onKeyDownCapture: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) pause();
    },
  };
}
