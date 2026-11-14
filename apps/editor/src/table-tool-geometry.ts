import { useEffect, useState, type RefObject } from "react";
import type { Node } from "@tiptap/pm/model";

type Geometry = {
  columns: { left: number; width: number; visible: boolean }[];
  rows: { top: number; height: number }[];
  viewportRight: number; viewportTop: number; left: number; right: number; top: number; bottom: number; appendTop: number; appendHeight: number; appendWidth: number;
  rowSpace: boolean; columnSpace: boolean; scrolled: boolean; targetSize: number; clearance: number;
};

/** View-only coordinates relative to the block, outside its horizontal scroller. */
export function useTableToolGeometry(grid: RefObject<HTMLDivElement | null>, node: Node, visible: boolean) {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  useEffect(() => {
    if (!visible) return;
    const canvas = grid.current, table = canvas?.querySelector("table");
    const block = canvas?.closest<HTMLElement>(".table-block");
    const scroll = canvas?.closest<HTMLElement>(".table-scroll");
    if (!canvas || !table || !block || !scroll) return;
    const viewportOwner = block.closest<HTMLElement>(".document-scroll");
    const measure = () => {
      const origin = block.getBoundingClientRect(), bounds = table.getBoundingClientRect(), viewport = scroll.getBoundingClientRect();
      const css = getComputedStyle(canvas);
      const length = (name: string) => {
        const value = css.getPropertyValue(name).trim();
        return parseFloat(value) * (value.endsWith("rem") ? parseFloat(getComputedStyle(document.documentElement).fontSize) : 1);
      };
      const target = length("--size-control-compact"), face = length("--size-table-tool-face"), gap = length("--space-table-tool-edge");
      const columns = [...(table.rows[0]?.cells ?? [])].map(cell => {
        const rect = cell.getBoundingClientRect(), center = rect.left + rect.width / 2;
        return { left: Math.max(viewport.left + target / 2, Math.min(viewport.right - target / 2, center)) - origin.left, width: rect.width, visible: center >= viewport.left + target / 2 && center <= viewport.right - target / 2 };
      });
      const rows = [...table.rows].map(row => { const r = row.getBoundingClientRect(); return { top: r.top - origin.top, height: r.height }; });
      const gridBottom = rows.at(-1)!;
      const bottom = gridBottom.top + gridBottom.height;
      const caption = table.querySelector("caption")?.getBoundingClientRect();
      const bar = length("--size-table-tool-bar");
      const captionText = table.querySelector("caption .caption")?.getBoundingClientRect();
      const captionStart = (captionText?.top ?? caption?.top ?? bounds.bottom) - origin.top;
      const gapFits = captionStart - bottom >= bar + 2 * gap;
      const nextBlock = (block.closest(".node-table") ?? block).nextElementSibling;
      const end = nextBlock?.getBoundingClientRect().top ?? block.closest(".document")?.getBoundingClientRect().bottom ?? window.innerHeight;
      const appendTop = gapFits ? bottom + gap : (caption?.bottom ?? bounds.bottom) - origin.top + gap;
      const appendHeight = Math.max(0, Math.min(target, (gapFits ? captionStart : end - origin.top) - gap - appendTop));
      const owner = viewportOwner?.getBoundingClientRect();
      const available = Math.min(owner?.right ?? window.innerWidth, window.innerWidth) - viewport.right;
      const appendWidth = Math.max(0, Math.min(target, available - gap));
      const next = { columns, rows, viewportRight: viewport.right, viewportTop: bounds.top, left: viewport.left - origin.left, right: viewport.right - origin.left,
        targetSize: target, clearance: gap, top: bounds.top - origin.top, bottom, appendTop, appendHeight, appendWidth, scrolled: scroll.scrollLeft > 0,
        rowSpace: appendHeight >= bar, columnSpace: available >= Math.max(face, bar + gap) };
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(table); observer.observe(scroll); observer.observe(block);
    // A docked panel/sidebar changes the viewport's padding/content box while a
    // Standard-width paper and every table keep their size. Observe the layout
    // owner as well: size-only observers on the table miss that position shift.
    if (viewportOwner) observer.observe(viewportOwner);
    const editor = block.closest(".document-editor"); if (editor) observer.observe(editor);
    measure();
    // Capturing scroll also covers document and enclosing layout scroll without
    // attaching listeners to every possible ancestor. No animation-frame loop.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("scroll", measure, true); window.removeEventListener("resize", measure); };
  }, [grid, node, visible]);
  return geometry;
}
