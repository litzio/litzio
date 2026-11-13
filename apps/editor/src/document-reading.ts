import type { Editor } from "@tiptap/core";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { TABLE_CELL_SOURCE_ATTR } from "./tiptap-projection.ts";

/** Snapshot locators and geometry only; engine types stay inside the Editor. */
type ReadingRect = { top: number; left: number; width: number; height: number };
export type ReadingPosition = {
  blocks: (ReadingRect & { key: string })[];
  cells: (ReadingRect & { table: string; row: number; column: number })[];
  height: number;
};
export type ReadingCallbacks = {
  onReadingLayout?(position: ReadingPosition): void;
  onReadingSelection?(key: string | undefined): void;
};

export function useDocumentReading(editor: Editor | null, host: RefObject<HTMLElement | null>, callbacks: ReadingCallbacks) {
  const report = useRef(callbacks); report.current = callbacks;
  const observeLayout = !!callbacks.onReadingLayout, observeSelection = !!callbacks.onReadingSelection;
  useLayoutEffect(() => {
    if (!editor || !host.current || (!observeLayout && !observeSelection)) return;
    const element = host.current;
    let frame = 0, previous: string | undefined, lastLayout = "", active = true;
    let observed = new Set<Element>();
    const measure = () => {
      const origin = element.getBoundingClientRect();
      const blocks: ReadingPosition["blocks"] = [];
      const cells: ReadingPosition["cells"] = [];
      const nextObserved = new Set<Element>([element]);
      const geometry = (dom: HTMLElement): ReadingRect => {
        nextObserved.add(dom);
        const rect = dom.getBoundingClientRect();
        return { top: rect.top - origin.top, left: rect.left - origin.left, width: rect.width, height: rect.height };
      };
      editor.state.doc.forEach((node, offset) => {
        const dom = editor.view.nodeDOM(offset);
        if (!(dom instanceof HTMLElement) || !node.attrs.sourcePath) return;
        const key = JSON.stringify(String(node.attrs.sourcePath).split(",").map(Number));
        blocks.push({ key, ...geometry(dom) });
        if (node.type.name === "table") node.forEach((row, rowOffset) => {
          if (row.type.name !== "tableRow") return;
          row.forEach((cell, cellOffset) => {
            const cellDom = editor.view.nodeDOM(offset + 2 + rowOffset + cellOffset);
            const source = String(cell.attrs[TABLE_CELL_SOURCE_ATTR] ?? "");
            if (!(cellDom instanceof HTMLElement) || !/^\d+,\d+$/.test(source)) return;
            const [rowIndex, column] = source.split(",").map(Number);
            cells.push({ table: key, row: rowIndex, column, ...geometry(cellDom) });
          });
        });
        if (node.type.name === "bulletList" || node.type.name === "orderedList") {
          const walk = (list: HTMLElement, indexes: number[]) => {
            [...list.children].filter(child => child.tagName === "LI").forEach((child, index) => {
              const item = [...indexes, index];
              blocks.push({ key: `${key}:${item.join(".")}`, ...geometry(child as HTMLElement) });
              for (const nested of child.children) if (nested.matches("ul,ol")) walk(nested as HTMLElement, item);
            });
          };
          walk(dom, []);
        }
      });
      for (const dom of observed) if (!nextObserved.has(dom)) observer.unobserve(dom);
      for (const dom of nextObserved) if (!observed.has(dom)) observer.observe(dom);
      observed = nextObserved;
      const layout = { blocks, cells, height: element.scrollHeight };
      const signature = JSON.stringify(layout);
      if (signature !== lastLayout) { lastLayout = signature; report.current.onReadingLayout?.(layout); }
    };
    const selection = (force = false) => {
      const { $from, empty } = editor.state.selection;
      // A text range spans content, rather than selecting one correspondence target.
      const path = (empty || "node" in editor.state.selection) && editor.state.doc.maybeChild($from.index(0))?.attrs.sourcePath;
      const items: number[] = [];
      for (let depth = 1; depth <= $from.depth; depth++) {
        if ($from.node(depth).type.name === "listItem") items.push($from.index(depth - 1));
      }
      const key = path ? JSON.stringify(String(path).split(",").map(Number)) + (items.length ? `:${items.join(".")}` : "") : undefined;
      if (force || key !== previous) { previous = key; report.current.onReadingSelection?.(key); }
    };
    const changed = () => selection();
    // Source inspection may change without moving the engine selection. Clicking that
    // same document block again must restore its correspondence as well.
    const clicked = () => selection(true);
    const schedule = () => { if (!active) return; cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    if (observeLayout) {
      observer.observe(element);
      mutations.observe(element, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
      element.addEventListener("load", schedule, true);
      element.addEventListener("scroll", schedule, true);
      document.fonts.addEventListener("loadingdone", schedule);
      document.fonts.addEventListener("loadingerror", schedule);
      schedule();
    }
    if (observeSelection) {
      editor.on("selectionUpdate", changed);
      editor.view.dom.addEventListener("click", clicked);
    }
    return () => {
      active = false;
      observer.disconnect(); mutations.disconnect(); element.removeEventListener("load", schedule, true);
      element.removeEventListener("scroll", schedule, true); document.fonts.removeEventListener("loadingdone", schedule);
      document.fonts.removeEventListener("loadingerror", schedule);
      editor.off("selectionUpdate", changed); editor.view.dom.removeEventListener("click", clicked); cancelAnimationFrame(frame);
    };
  }, [editor, host, observeLayout, observeSelection]);
}
