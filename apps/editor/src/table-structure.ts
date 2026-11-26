import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";
import type { TiptapJSON } from "./tiptap-inline.ts";

// Where a top-level table block keeps its rows. Its caption and notes follow the rows; callers
// read rows and their positions through these helpers instead of the block's own children.

/** The table block's rows, without its caption and notes. */
export function tableRows(table: PMNode): PMNode[] {
  const rows: PMNode[] = [];
  table.forEach(child => { if (child.type.name === "tableRow") rows.push(child); });
  return rows;
}

/** Each row of the table block at `tablePos`, with the position before the row. */
export function forEachTableRow(table: PMNode, tablePos: number, visit: (row: PMNode, pos: number, index: number) => void): void {
  let index = 0;
  table.forEach((child, offset) => { if (child.type.name === "tableRow") visit(child, tablePos + 1 + offset, index++); });
}

/** The row and column of the cell holding `$pos`, when that cell is in a top-level table block. */
export function tableCellOf($pos: ResolvedPos): { row: number; column: number } | undefined {
  if ($pos.depth < 3 || $pos.parent.type.name !== "tableCell" || $pos.node(1).type.name !== "table") return undefined;
  return { row: $pos.index($pos.depth - 2), column: $pos.index($pos.depth - 1) };
}

/** The rows of a table block's JSON, without its caption and notes. */
export function tableRowsJSON(table: TiptapJSON): TiptapJSON[] {
  return (table.content ?? []).filter(child => child.type !== "tableCaption" && child.type !== "tableNotes");
}
