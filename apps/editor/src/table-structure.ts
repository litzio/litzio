import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";
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

/** The row and column of the cell holding `$pos`, when that cell is in a top-level table block. */
export function tableCellOf($pos: ResolvedPos): { row: number; column: number } | undefined {
  if ($pos.depth < 3 || $pos.parent.type.name !== "tableCell" || $pos.node(1).type.name !== "table") return undefined;
  return { row: $pos.index($pos.depth - 2), column: $pos.index($pos.depth - 1) };
}

/** The rows of a table block's JSON, without its caption and notes. */
export function tableRowsJSON(table: TiptapJSON): TiptapJSON[] {
  return table.content?.find(child => child.type === "tableGrid")?.content ?? [];
}
