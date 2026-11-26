import { assertInlineContent, hasAdjacentMatchingLinks, inlineContentToNodes, projectInlineContent, type InlineContent } from "../inline.ts";
import { MAX_LIST_START, type ListContent } from "../list.ts";
import { DOCUMENT_AUTHORING_LIMITS } from "../document-authoring-input.ts";
import { DocumentWriteError, writeIssueOf } from "../write-error.ts";
import { createListNode, supportedListContent } from "./list.ts";
import type { TableCellBlock } from "../table.ts";
import type { MystNode } from "./tree.ts";

export function tableGridError(reason: string, path: number[], line?: number): never {
  throw new DocumentWriteError(reason, { code: "table-shape", path, line,
    action: "Correct the table grid or cell content before saving." });
}

function onlyFields(node: MystNode, keys: string[]): boolean {
  return Object.entries(node).every(([key, value]) => value === undefined ||
    ["type", "position", "children", ...keys].includes(key));
}

export function tableInline(node: MystNode, path: number[]): InlineContent[] {
  const content = projectInlineContent(node);
  if (!content) tableGridError("Unsupported table cell inline content", path);
  assertTableInline(content, path);
  return content;
}

function assertTableInline(content: InlineContent[], path: number[]): void {
  try { assertInlineContent(content); }
  catch (error) {
    const issue = writeIssueOf(error);
    throw new DocumentWriteError(issue.reason, { ...issue, path }, { cause: error });
  }
  if (hasAdjacentMatchingLinks(content)) tableGridError("Adjacent separate links with the same target are not supported", path);
}

export function tableList(node: MystNode, path: number[]): ListContent {
  const list = supportedListContent(node, true);
  const validate = (list: ListContent): void => {
    if (list.checklist !== undefined || list.style !== undefined || list.delimiter !== undefined ||
        (list.ordered && (list.start! < 1 || list.start! > MAX_LIST_START))) {
      tableGridError("Table lists support bullets and positive decimal numbering", path);
    }
    for (const item of list.items) {
      assertTableInline(item.content, path);
      if (item.list) validate(item.list);
    }
  };
  if (!list) tableGridError("Unsupported table cell list", path);
  validate(list);
  return list;
}

/** A table grid in its complex form: it records its header rows and each cell's start column and spans. */
export function isComplexGrid(table: MystNode | undefined): boolean {
  return table?.type === "table" && table.headerRows !== undefined;
}

/** The blocks of a table cell: its paragraphs and lists, or a pipe cell's inline content as one paragraph. */
export function tableCellBlocks(cell: MystNode | undefined): TableCellBlock[] | undefined {
  if (cell?.type !== "tableCell") return undefined;
  const children = cell.children ?? [];
  if (!children.some(block => block.type === "paragraph" || block.type === "list")) {
    const content = projectInlineContent(cell);
    return content ? [{ kind: "paragraph", content }] : undefined;
  }
  const blocks: TableCellBlock[] = [];
  for (const block of children) {
    const content = block.type === "paragraph" && onlyFields(block, []) ? projectInlineContent(block) : undefined;
    const list = block.type === "list" ? supportedListContent(block, true) : undefined;
    if (content) blocks.push({ kind: "paragraph", content });
    else if (list) blocks.push({ kind: "list", list });
    else return undefined;
  }
  return blocks;
}

/** Cell children for blocks, as the HTML grid reader produces them. */
export function tableCellBlockNodes(blocks: TableCellBlock[]): MystNode[] {
  return blocks.map(block => block.kind === "paragraph"
    ? { type: "paragraph", children: inlineContentToNodes(block.content) }
    : createListNode(block.list));
}

/** After a change to a table's cells, put the grid in the form its canonical write uses: a pipe
 * grid when it fits one, otherwise the complex form with start columns and spans. */
export function settleTableGrid(table: MystNode, path: number[]): void {
  locateTableCells(table, path);
  usePipeGrid(table, path);
}

export function needsComplexGrid(table: MystNode): boolean {
  return table.headerRows !== undefined || Boolean(table.children?.[0]?.children?.length &&
    table.children[0].children.every(cell => cell.header === true) &&
    table.children.some(row => row.children?.some(cell => cell.rowspan !== undefined || cell.colspan !== undefined ||
      cell.column !== undefined || cell.children?.some(block => block.type === "list") ||
      (cell.children?.length ?? 0) > 1 && cell.children?.some(block => block.type === "paragraph"))));
}

/**
 * On the internal parse result or write clone, assign each cell its actual start
 * column. The same grid rules apply to HTML and to changes to its semantic nodes.
 */
export function locateTableCells(table: MystNode, path: number[]): void {
  const rows = table.children ?? [];
  const { tableRows, tableColumns, tableCells } = DOCUMENT_AUTHORING_LIMITS;
  const headerRows = table.headerRows ?? 1;
  if (table.type !== "table" || !onlyFields(table, ["headerRows"]) || !Number.isInteger(headerRows) ||
      headerRows < 1 || headerRows > rows.length || rows.length > tableRows) {
    tableGridError("Table requires a header group and at most " + tableRows + " rows", path);
  }
  table.headerRows = headerRows;
  const occupied = rows.map(() => new Set<number>());
  let width = 0;
  for (const [rowIndex, row] of rows.entries()) {
    const rowPath = [...path, rowIndex];
    if (row.type !== "tableRow" || !onlyFields(row, [])) tableGridError("Unsupported table row", rowPath);
    const header = rowIndex < headerRows;
    const groupEnd = header ? headerRows : rows.length;
    let column = 0;
    for (const cell of row.children ?? []) {
      while (occupied[rowIndex].has(column)) column++;
      const cellPath = [...rowPath, column];
      const { rowspan = 1, colspan = 1, align } = cell;
      if (cell.type !== "tableCell" || !onlyFields(cell, ["column", "rowspan", "colspan", "header", "align"]) ||
          (cell.column !== undefined && cell.column !== column) ||
          (header ? cell.header !== true : cell.header !== undefined) ||
          (align !== undefined && !["left", "center", "right"].includes(align))) {
        tableGridError("Invalid table cell kind, start column or alignment", cellPath);
      }
      if (!Number.isSafeInteger(rowspan) || rowspan < 1 || rowIndex + rowspan > groupEnd ||
          !Number.isSafeInteger(colspan) || colspan < 1 ||
          column + colspan > (rowIndex ? width : tableColumns) || (column + colspan) * rows.length > tableCells) {
        tableGridError("Table span exceeds its row group, grid width or table size limit", cellPath);
      }
      for (let r = rowIndex; r < rowIndex + rowspan; r++) {
        for (let c = column; c < column + colspan; c++) {
          if (occupied[r].has(c)) tableGridError("Overlapping table spans", cellPath);
          occupied[r].add(c);
        }
      }
      cell.column = column;
      cell.rowspan = rowspan;
      cell.colspan = colspan;
      column += colspan;
      if (!rowIndex) width = column;

      const blocks = cell.children ?? [];
      // A promoted pipe cell still has its original inline children.
      if (!blocks.some(block => block.type === "paragraph" || block.type === "list")) {
        tableInline(cell, cellPath);
        cell.children = [{ type: "paragraph", children: blocks }];
        continue;
      }
      for (const block of blocks) {
        if (block.type === "list") tableList(block, cellPath);
        else if (block.type === "paragraph" && onlyFields(block, [])) tableInline(block, cellPath);
        else tableGridError("Table cells support paragraphs and lists", cellPath);
      }
    }
    if (width === 0 || occupied[rowIndex].size !== width) tableGridError("Uncovered position in table row", rowPath);
  }
}

/** Normalize exactly the HTML grids whose structure fits the original pipe writer. */
export function usePipeGrid(table: MystNode, path: number[]): void {
  if (table.headerRows !== 1 || !table.children!.every(row => row.children!.every(cell =>
    cell.rowspan === 1 && cell.colspan === 1 && cell.children!.length === 1 && cell.children![0].type === "paragraph"))) return;
  const header = table.children![0].children!;
  for (const [rowIndex, row] of table.children!.entries()) {
    for (const [column, cell] of row.children!.entries()) {
      if (cell.align !== header[column].align) tableGridError("A pipe table requires the same alignment throughout each column", [...path, rowIndex, column]);
      cell.children = cell.children![0].children ?? [];
      delete cell.column;
      delete cell.rowspan;
      delete cell.colspan;
    }
  }
  delete table.headerRows;
}
