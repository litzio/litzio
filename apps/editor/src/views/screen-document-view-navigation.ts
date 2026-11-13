import { useEffect, useRef, type RefObject } from "react";

/** The preview owns scrolling; the renderer only reports snapshot geometry. */
export function useDocumentViewNavigation(viewport: RefObject<HTMLDivElement | null>, request: object, identity: string,
  selected: false | { top: number } | undefined) {
  const jumped = useRef("");
  useEffect(() => { jumped.current = ""; }, [request]);
  useEffect(() => {
    if (selected && viewport.current && jumped.current !== identity) {
      viewport.current.scrollTo({ top: Math.max(0, selected.top - 16) });
      jumped.current = identity;
    }
  }, [selected, viewport, identity]);
}
