import { useEffect, useState, type RefObject } from "react";
import type { Node } from "@tiptap/pm/model";

type Geometry = { columns: { left: number; width: number }[]; rows: { top: number; height: number }[]; right: number; bottom: number };

export function useTableToolGeometry(grid: RefObject<HTMLDivElement | null>, node: Node, visible: boolean) {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  useEffect(() => {
    if (!visible) return;
    const canvas = grid.current;
    const table = canvas?.querySelector("table");
    if (!canvas || !table) return;
    const measure = () => {
      const origin = canvas.getBoundingClientRect();
      const bounds = table.getBoundingClientRect();
      const columns = [...(table.rows[0]?.cells ?? [])].map(cell => {
        const rect = cell.getBoundingClientRect();
        return { left: rect.left - origin.left, width: rect.width };
      });
      const rows = [...table.rows].map(row => {
        const rect = row.getBoundingClientRect();
        return { top: rect.top - origin.top, height: rect.height };
      });
      // Native table bounds include its caption. Keep bottom actions after the entire
      // caption, including wrapped text and the editable empty surface.
      const next = { columns, rows, right: bounds.right - origin.left, bottom: bounds.bottom - origin.top };
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    [...table.rows].forEach(row => observer.observe(row));
    const frame = requestAnimationFrame(measure);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [grid, node, visible]);
  return geometry;
}
