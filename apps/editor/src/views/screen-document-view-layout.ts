import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import type { ScreenDocumentViewProps, ScreenDocumentViewLayout } from "@litzio/plugin-sdk";
import type { ReadingPosition } from "../document-reading.ts";

/** Reuse renderer geometry; scrolling measures only the viewport and document origin. */
export function useDocumentViewLayout(viewport: RefObject<HTMLDivElement | null>, request: object,
  revision: string | undefined, positions: ReadingPosition | undefined, enabled: boolean,
  callback: ScreenDocumentViewProps["onVisibleBlockLayoutChange"]) {
  const blocks = useMemo(() => positions?.blocks.filter(block => !block.key.includes(":"))
    .map(block => ({ ...block, path: JSON.parse(block.key) as number[] })) ?? [], [positions]);
  const latest = useRef({ revision, blocks, enabled, callback });
  latest.current = { revision, blocks, enabled, callback };
  const previous = useRef("");
  const schedule = useRef(() => {});
  useLayoutEffect(() => {
    if (!callback) return;
    const element = viewport.current;
    let frame = 0;
    const report = () => {
      frame = 0;
      const current = latest.current;
      const height = element?.clientHeight ?? 0;
      const origin = element?.querySelector(".document");
      const offset = element && origin ? origin.getBoundingClientRect().top - element.getBoundingClientRect().top - element.clientTop : 0;
      const layout: ScreenDocumentViewLayout = {
        ...(current.revision ? { revision: current.revision } : {}), height,
        blocks: current.enabled && origin ? current.blocks
          .filter(block => block.top + offset < height && block.top + block.height + offset > 0)
          .map(block => ({ path: block.path, top: block.top + offset, bottom: block.top + block.height + offset })) : [],
      };
      const key = JSON.stringify(layout);
      if (key !== previous.current) { previous.current = key; current.callback?.(layout); }
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(report); };
    schedule.current = queue;
    const observer = new ResizeObserver(queue);
    if (element) { observer.observe(element); element.addEventListener("scroll", queue); }
    queue();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); element?.removeEventListener("scroll", queue);
      schedule.current = () => {};
    };
  }, [viewport, request, !!revision, !!callback]);
  useLayoutEffect(() => schedule.current(), [blocks, enabled, revision]);
}
