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
      const column = shown(".table-column-handle"), row = shown(".table-row-handle");
      if (!current || !column || !row) errors.push("Expected current cell, both handles");
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
      return { errors, metrics };
    });
    return report.errors;
  }, { message: "Table tools must stay attached to the visible grid/scroll edges" }).toEqual([]);
  return report!;
}
