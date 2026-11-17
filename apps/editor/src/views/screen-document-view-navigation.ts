import { useLayoutEffect, useRef, type RefObject } from "react";
import type { ReadingPosition } from "../document-reading.ts";

/** The preview owns scrolling; the renderer only reports snapshot geometry. */
export function useDocumentViewNavigation(viewport: RefObject<HTMLDivElement | null>, request: object, identity: string,
  selected: false | ReadingPosition["blocks"][number] | ReadingPosition["cells"][number] | undefined, alignStart = false, onProgrammaticScroll?: () => void, scale = 1, positions?: ReadingPosition) {
  const manual = useRef(false), first = useRef(true);
  useLayoutEffect(() => { manual.current = false; first.current = true; }, [request, identity]);
  const scrollTop = useRef(0);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const remember = () => { scrollTop.current = element.scrollTop; };
    remember(); element.addEventListener("scroll",remember);
    return () => element.removeEventListener("scroll",remember);
  }, [viewport, request, !!positions]);
  const previous = useRef({scale, positions});
  const anchor = useRef<{key:string; offset:number; height:number; layout:ReadingPosition} | undefined>(undefined);
  useLayoutEffect(() => { anchor.current = undefined; }, [request, identity]);
  useLayoutEffect(() => {
    const element = viewport.current, old = previous.current;
    previous.current = {scale, positions};
    if (!element) return;
    if (old.scale !== scale && old.positions) {
      const block = old.positions.blocks.find(block => !block.key.includes(":") && block.top + block.height > scrollTop.current);
      if (block) anchor.current = {key:block.key, offset:block.top-scrollTop.current, height:block.height, layout:old.positions};
      manual.current = true;
      onProgrammaticScroll?.();
    }
    if (anchor.current && positions && positions !== anchor.current.layout) {
      const block = positions.blocks.find(block => block.key === anchor.current!.key);
      if (block) element.scrollTop = block.top - anchor.current.offset * (anchor.current.offset < 0 ? block.height / anchor.current.height : 1);
      anchor.current = undefined;
    }
  }, [scale, positions, viewport, onProgrammaticScroll]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || !selected || manual.current || selected.height <= 0) return;
    // A later renderer measurement can move the target after its first reveal.
    // Keep it visible without moving an already-visible target on every report.
    const visibleHeight = Math.min(selected.height, Math.max(0, element.clientHeight - 32));
    const outside = selected.top < element.scrollTop + 16 || selected.top + visibleHeight > element.scrollTop + element.clientHeight - 16;
    if (alignStart || first.current || outside) {
      onProgrammaticScroll?.();
      element.scrollTo({ top: Math.max(0, selected.top - (alignStart ? 0 : 16)) });
    }
    if ("clip" in selected) {
      // Tables own horizontal scrolling. Never pan the preview or its plugin screen.
      const scroller = element.querySelector<HTMLElement>(`.table-block[data-source-path="${JSON.parse(selected.table).join(",")}"] .table-scroll`);
      const visibleWidth = Math.min(selected.width, Math.max(0, selected.clip.width - 32));
      if (scroller && (selected.left < selected.clip.left + 16 || selected.left + visibleWidth > selected.clip.left + selected.clip.width - 16)) {
        onProgrammaticScroll?.();
        scroller.scrollBy({ left: (selected.left - selected.clip.left - 16) / scale });
      }
    }
    first.current = false;
  }, [viewport, request, identity, selected, alignStart, onProgrammaticScroll, scale]);
  const pause = () => { manual.current = true; anchor.current = undefined; };
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
