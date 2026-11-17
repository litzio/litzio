import { useLayoutEffect, useRef, useCallback, type RefObject } from "react";
import type { ScreenDocumentViewProps } from "@litzio/plugin-sdk";
import type { ReadingPosition } from "../document-reading.ts";

/** Input attribution belongs to this mounted preview, never to the document snapshot. */
export function useDocumentViewInteractions(viewport: RefObject<HTMLDivElement | null>, request: object,
  revision: string | undefined, positions: ReadingPosition | undefined, enabled: boolean,
  onVisibleBlockChange: ScreenDocumentViewProps["onVisibleBlockChange"], onBlockClick: ScreenDocumentViewProps["onBlockClick"]) {
  const latest = useRef({ revision, positions, enabled, onVisibleBlockChange, onBlockClick });
  latest.current = { revision, positions, enabled, onVisibleBlockChange, onBlockClick };
  const cancel = useRef(() => {});
  const cancelScroll = useCallback(() => cancel.current(), []);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || (!onVisibleBlockChange && !onBlockClick)) return;
    let user = false, timer: ReturnType<typeof setTimeout> | undefined, lastTime = 0, lastKey = "", sent = false;
    let previousTop = element.scrollTop;
    let down: { x: number; y: number; target: EventTarget | null; moved?: boolean } | undefined;
    const reset = () => { previousTop = element.scrollTop; user = false; clearTimeout(timer); };
    cancel.current = reset;
    const blocks = () => latest.current.positions?.blocks.filter(block => !block.key.includes(":")) ?? [];
    const emit = (final: boolean) => {
      const current = latest.current;
      if (!current.enabled || !current.revision) return;
      const block = blocks().find(block => block.top + block.height > element.scrollTop);
      if (!block) return;
      if (block.key !== lastKey || final && sent) {
        sent = true; lastKey = block.key; lastTime = performance.now();
        current.onVisibleBlockChange?.({ revision: current.revision, path: JSON.parse(block.key) });
      }
    };
    const arm = () => {
      // Passive wheel input may arrive after compositor scrolling; compare the last observed position.
      if (!user) { lastKey = blocks().find(block => block.top + block.height > previousTop)?.key ?? ""; lastTime = 0; sent = false; }
      user = true; clearTimeout(timer); timer = setTimeout(reset, 200);
    };
    const wheel = (event: WheelEvent) => { if (event.deltaY) arm(); };
    const key = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) arm();
    };
    const scroll = (event: Event) => {
      if (event.target !== element) return;
      previousTop = element.scrollTop;
      if (!user) return;
      clearTimeout(timer);
      if (performance.now() - lastTime >= 100) emit(false);
      timer = setTimeout(() => { if (user) emit(true); reset(); }, 160);
    };
    const pointer = (event: PointerEvent) => {
      down = event.button === 0 ? { x: event.clientX, y: event.clientY, target: event.target } : undefined;
      if (event.target === element) arm();
    };
    const move = (event: PointerEvent) => {
      if (down && Math.hypot(down.x - event.clientX, down.y - event.clientY) > 4) down.moved = true;
      if (down?.target === element && event.buttons === 1) arm();
    };
    const click = (event: MouseEvent) => {
      const start = down; down = undefined;
      const current = latest.current;
      if (!start || start.moved || !current.enabled || !current.revision || event.detail !== 1 || event.shiftKey ||
        Math.hypot(start.x - event.clientX, start.y - event.clientY) > 4) return;
      if (!(event.target instanceof Element) || event.target.closest('a,button,input,select,textarea,[role="button"],[data-reference],[data-testid="cross-reference"],[data-testid="footnote-number"],[data-citation]')) return;
      // Walk outward to the renderer's top-level source block (including tables/lists).
      const root = element.querySelector(".tiptap");
      let node: Element | null = event.target;
      while (node && node.parentElement !== root) node = node.parentElement;
      const source = node?.getAttribute("data-source-path");
      const origin = root?.closest(".document")?.getBoundingClientRect().top;
      const top = node && origin !== undefined ? node.getBoundingClientRect().top - origin : undefined;
      const block = blocks().find(block => source ? JSON.parse(block.key).join(",") === source : top !== undefined && Math.abs(block.top - top) < 1);
      if (block) current.onBlockClick?.({ revision: current.revision, path: JSON.parse(block.key) });
    };
    element.addEventListener("wheel", wheel, { passive: true, capture: true });
    element.addEventListener("keydown", key, true);
    element.addEventListener("scroll", scroll);
    element.addEventListener("pointerdown", pointer, true);
    element.addEventListener("pointermove", move, true);
    element.addEventListener("click", click);
    return () => {
      reset(); cancel.current = () => {};
      element.removeEventListener("wheel", wheel, true); element.removeEventListener("keydown", key, true);
      element.removeEventListener("scroll", scroll); element.removeEventListener("pointerdown", pointer, true);
      element.removeEventListener("pointermove", move, true); element.removeEventListener("click", click);
    };
  }, [viewport, request, !!revision, !!onVisibleBlockChange, !!onBlockClick]);
  // Geometry changes and snapshot/target invalidation must not masquerade as user scrolling.
  useLayoutEffect(cancelScroll, [positions, enabled, cancelScroll]);
  return cancelScroll;
}
