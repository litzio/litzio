import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";
import { TableMap } from "@tiptap/pm/tables";
import type { TiptapJSON } from "./tiptap-inline.ts";

// A top-level table block holds a grid of rows, then its caption and optional notes. The grid
// follows the prosemirror-tables roles (table, row, cell), so TableMap reads it. Callers read rows
// and their positions through these helpers instead of the block's own children.

/** The grid holding the table block's rows. */
function tableGrid(table: PMNode): PMNode | undefined {
  return table.firstChild?.type.name === "tableGrid" ? table.firstChild : undefined;
}

/** The table block's rows, without its caption and notes. */
export function tableRows(table: PMNode): PMNode[] {
  const rows: PMNode[] = [];
  tableGrid(table)?.forEach(row => rows.push(row));
  return rows;
}

/** Each row of the table block at `tablePos`, with the position before the row. */
export function forEachTableRow(table: PMNode, tablePos: number, visit: (row: PMNode, pos: number, index: number) => void): void {
  // Past the table block's and the grid's opening tokens.
  tableGrid(table)?.forEach((row, offset, index) => visit(row, tablePos + 2 + offset, index));
}

// A top-level table block is at depth 1, its grid at 2, a row at 3 and a cell at 4. A cell holds
// blocks: a caret in a cell is in one of its paragraphs.
const CELL_DEPTH = 4;

/** True when `$pos` is inside a cell of a top-level table block, including inside its blocks. */
export function inTableCell($pos: ResolvedPos): boolean {
  return $pos.depth >= CELL_DEPTH && $pos.node(1).type.name === "table" && $pos.node(CELL_DEPTH).type.name === "tableCell";
}

/** The positions before and after the cell holding `$pos`, when that cell is in a top-level table block. */
export function tableCellRange($pos: ResolvedPos): { from: number; to: number } | undefined {
  return inTableCell($pos) ? { from: $pos.before(CELL_DEPTH), to: $pos.after(CELL_DEPTH) } : undefined;
}

/** The row and column of the cell holding `$pos`, when that cell is in a top-level table block. The
 * column is the grid column where the cell starts, as in Core cell paths (ADR-0024). */
export function tableCellOf($pos: ResolvedPos): { row: number; column: number } | undefined {
  if (!inTableCell($pos)) return undefined;
  const grid = $pos.node(CELL_DEPTH - 2);
  const rect = TableMap.get(grid).findCell($pos.before(CELL_DEPTH) - $pos.start(CELL_DEPTH - 2));
  return { row: rect.top, column: rect.left };
}

/** True when a table block's grid is complex (ADR-0024): a merged cell, a header row after the
 * first, a row that only covered cells fill, or a cell that does not hold exactly one paragraph.
 * Core keeps such a grid as HTML; rectangular row and column commands do not apply to it. */
export function isComplexTable(table: PMNode): boolean {
  return tableRows(table).some((row, index) => {
    let complex = row.childCount === 0;
    row.forEach(cell => {
      if (cell.attrs.colspan !== 1 || cell.attrs.rowspan !== 1 || (index > 0 && cell.attrs.header) ||
          cell.childCount !== 1 || cell.firstChild!.type.name !== "paragraph") complex = true;
    });
    return complex;
  });
}

/** The rows of a table block's JSON, without its caption and notes. */
export function tableRowsJSON(table: TiptapJSON): TiptapJSON[] {
  return table.content?.find(child => child.type === "tableGrid")?.content ?? [];
}
