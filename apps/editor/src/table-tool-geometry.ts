import { useEffect, useState, type RefObject } from "react";
import type { Node } from "@tiptap/pm/model";

type Geometry = {
  columns: { left: number; visible: boolean }[];
  rows: { top: number; height: number }[];
  left: number; top: number;
  scrolled: boolean; targetSize: number; clearance: number;
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
    const measure = () => {
      const origin = block.getBoundingClientRect(), bounds = table.getBoundingClientRect(), viewport = scroll.getBoundingClientRect();
      const css = getComputedStyle(canvas);
      const length = (name: string) => {
        const value = css.getPropertyValue(name).trim();
        return parseFloat(value) * (value.endsWith("rem") ? parseFloat(getComputedStyle(document.documentElement).fontSize) : 1);
      };
      const target = length("--size-control-compact"), gap = length("--space-table-tool-edge");
      const columns = [...(table.rows[0]?.cells ?? [])].map(cell => {
        const rect = cell.getBoundingClientRect(), center = rect.left + rect.width / 2;
        return { left: Math.max(viewport.left + target / 2, Math.min(viewport.right - target / 2, center)) - origin.left, visible: center >= viewport.left + target / 2 && center <= viewport.right - target / 2 };
      });
      const rows = [...table.rows].map(row => { const r = row.getBoundingClientRect(); return { top: r.top - origin.top, height: r.height }; });
      const next = { columns, rows, left: viewport.left - origin.left, top: bounds.top - origin.top,
        targetSize: target, clearance: gap, scrolled: scroll.scrollLeft > 0 };
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(table); observer.observe(scroll); observer.observe(block);
    measure();
    // Capturing scroll also covers document and enclosing layout scroll without
    // attaching listeners to every possible ancestor. No animation-frame loop.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("scroll", measure, true); window.removeEventListener("resize", measure); };
  }, [grid, node, visible]);
  return geometry;
}
