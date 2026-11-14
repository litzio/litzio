import { expect, type Locator } from "@playwright/test";

/** Inspect actual targets in viewport coordinates; never reuse product geometry. */
export async function assertTableToolGeometry(block: Locator) {
  let report;
  await expect.poll(async () => {
    report = await block.evaluate(element => {
      const table = element.querySelector("table")!, viewport = element.querySelector(".table-scroll")!.getBoundingClientRect();
      const css = getComputedStyle(element);
      const length = (name: string) => { const value = css.getPropertyValue(name).trim(); return parseFloat(value) * (value.endsWith("rem") ? parseFloat(getComputedStyle(document.documentElement).fontSize) : 1); };
      const gap = length("--space-table-tool-edge"), face = length("--size-table-tool-face"), target = length("--size-control-compact");
      const bounds = table.getBoundingClientRect(), current = table.querySelector<HTMLTableCellElement>("[data-current-cell=true]")!;
      const errors: string[] = [], metrics: Record<string, unknown> = { viewport: viewport.toJSON(), gap };
      const near = (name: string, actual: number, expected: number) => { if (Math.abs(actual - expected) > 1) errors.push(`${name}: ${actual} expected ${expected}`); };
      const shown = (selector: string) => element.querySelector<HTMLButtonElement>(`${selector}[data-show=true]`);
      const column = shown(".table-column-handle"), row = shown(".table-row-handle"), addColumn = shown(".table-extend-column"), addRow = shown(".table-extend-row");
      if (!current || !column || !row || !addColumn || !addRow) errors.push("Expected current cell, both handles and both append bars");
      if (current && column && row) {
        const cell = table.rows[0].cells[current.cellIndex].getBoundingClientRect(), line = current.parentElement!.getBoundingClientRect();
        const c = column.getBoundingClientRect(), r = row.getBoundingClientRect();
        near("column center", c.left + c.width / 2, cell.left + cell.width / 2);
        near("column border", c.bottom, bounds.top + face / 2);
        near("row center", r.top + r.height / 2, line.top + line.height / 2);
        near("row border", r.right, viewport.left + (element.querySelector(".table-scroll")!.scrollLeft > 0 ? -gap : face / 2));
        for (const rect of [c, r]) { if (rect.width < target || rect.height < target) errors.push("Handle below compact target"); }
        metrics.column = c.toJSON(); metrics.row = r.toJSON();
      }
      if (addColumn) {
        const r = addColumn.getBoundingClientRect();
        near("append column edge", r.left, viewport.right + gap);
        near("append column top", r.top, bounds.top);
        near("append column bottom", r.bottom, table.rows[table.rows.length - 1].getBoundingClientRect().bottom);
        metrics.addColumn = r.toJSON();
      }
      if (addRow) {
        const r = addRow.getBoundingClientRect(), gridEnd = table.rows[table.rows.length - 1].getBoundingClientRect().bottom;
        const caption = table.querySelector("caption")!.getBoundingClientRect(), text = table.querySelector("caption .caption")!.getBoundingClientRect();
        const inCaptionGap = r.top >= gridEnd && r.bottom <= text.top;
        near("append row left", r.left, viewport.left); near("append row right", r.right, viewport.right);
        near("append row gap", r.top, (inCaptionGap ? gridEnd : caption.bottom) + gap);
        metrics.addRow = r.toJSON();
      }
      return { errors, metrics };
    });
    return report.errors;
  }, { message: "Table tools must stay attached to the visible grid/scroll edges" }).toEqual([]);
  return report!;
}
