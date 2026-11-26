import type { InlineContent } from "./inline.ts";
import type { ListContent } from "./list.ts";

/** A block of a table cell: a paragraph of inline content or a list (ADR-0024). */
export type TableCellBlock =
  | { kind: "paragraph"; content: InlineContent[] }
  | { kind: "list"; list: ListContent };

/** A cell of a complex table grid: it starts at `column` of its row. Omitted spans are 1. */
export type ComplexTableCellInput = {
  column?: number;
  rowspan?: number;
  colspan?: number;
  align?: "left" | "center" | "right";
  blocks: TableCellBlock[];
};

/**
 * A table grid with merged cells, several header rows or cell blocks. Each row holds only the
 * cells that start in it; the first `headerRows` rows are the header.
 */
export type ComplexTableInput = {
  grid: "complex";
  headerRows: number;
  rows: { cells: ComplexTableCellInput[] }[];
};

/** Display text of cell blocks: one line per paragraph and per list item. */
export function tableCellBlocksText(blocks: TableCellBlock[], text: (content: InlineContent[]) => string): string {
  const items = (list: ListContent): string[] => list.items.flatMap(item => [text(item.content), ...(item.list ? items(item.list) : [])]);
  return blocks.flatMap(block => block.kind === "paragraph" ? [text(block.content)] : items(block.list)).join("\n");
}
