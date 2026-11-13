import { useLayoutEffect, useRef, type RefObject } from "react";

/** The preview owns scrolling; the renderer only reports snapshot geometry. */
export function useDocumentViewNavigation(viewport: RefObject<HTMLDivElement | null>, request: object, identity: string,
  selected: false | { top: number; left: number; width: number; height: number } | undefined) {
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
    first.current = false;
  }, [viewport, request, identity, selected && selected.top, selected && selected.left, selected && selected.width, selected && selected.height]);
  const pause = () => { manual.current = true; };
  return {
    onWheelCapture: pause,
    onPointerDownCapture: (event: React.PointerEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) pause(); },
    onKeyDownCapture: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) pause();
    },
  };
}
