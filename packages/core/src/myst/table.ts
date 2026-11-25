import { inlineContentToNodes, projectInlineContent, type InlineContent } from "../inline.ts";
import { labelError } from "../label.ts";
import { DocumentWriteError } from "../write-error.ts";
import { labelIdentifier } from "./label.ts";
import { readTableHtml } from "./table-html.ts";
import { tableGridError, tableInline } from "./table-grid.ts";
import type { MystNode } from "./tree.ts";
import type { VFile } from "vfile";

/** The only raw HTML with native meaning is a bare <br> within a table cell. */
export function readTableBreaks(node: MystNode, inCell = false): void {
  if (inCell && node.type === "html" && node.value === "<br>") {
    node.type = "break";
    delete node.value;
  }
  node.children?.forEach(child => readTableBreaks(child, inCell || node.type === "tableCell"));
}

export function tableCellContent(cell: MystNode | undefined): InlineContent[] | undefined {
  return cell?.type === "tableCell" ? projectInlineContent(cell) : undefined;
}

export function tableNoteHasFootnote(content: InlineContent[]): boolean {
  return content.some(item => item.kind === "footnote" || ("children" in item && tableNoteHasFootnote(item.children)));
}

/** Replace a supported cell's content; an empty cell has no children, as MyST parses it. */
export function setTableCellContent(cell: MystNode, content: InlineContent[]): void {
  cell.children = inlineContentToNodes(content);
}

// New columns are unaligned; new rows inherit each existing column's alignment.
function cell(content: InlineContent[], header: boolean): MystNode {
  return {
    type: "tableCell",
    ...(header ? { header: true } : {}),
    children: inlineContentToNodes(content),
  };
}

/** A GFM table of inline-content cells; the first row is the header row. */
export function createTableNode(rows: InlineContent[][][], align?: ("left" | "center" | "right" | null)[]): MystNode {
  return {
    type: "table",
    children: rows.map((row, index) => ({ type: "tableRow", children: row.map((content, column) => ({ ...cell(content, index === 0), ...(align?.[column] ? { align: align[column] } : {}) })) })),
  };
}

/** Insert a body row of empty cells, one per header cell. */
export function insertTableRowNode(table: MystNode, index: number): void {
  const columns = table.children?.[0]?.children ?? [];
  table.children!.splice(index, 0, { type: "tableRow", children: columns.map(header => ({
    ...cell([], false), ...(header.align === undefined ? {} : { align: header.align }),
  })) });
}

/** Insert an empty column; its header cell is empty too. */
export function insertTableColumnNode(table: MystNode, index: number): void {
  table.children!.forEach((row, rowIndex) => row.children!.splice(index, 0, cell([], rowIndex === 0)));
}

/** Remove a row and its cells. */
export function removeTableRowNode(table: MystNode, index: number): void {
  table.children!.splice(index, 1);
}

/** Remove a column from every row. */
export function removeTableColumnNode(table: MystNode, index: number): void {
  table.children!.forEach(row => row.children!.splice(index, 1));
}

/** Move a row; its cells keep their content and alignment. */
export function moveTableRowNode(table: MystNode, from: number, to: number): void {
  table.children!.splice(to, 0, ...table.children!.splice(from, 1));
}

/** Move a column in every row; its cells keep their content and alignment. */
export function moveTableColumnNode(table: MystNode, from: number, to: number): void {
  table.children!.forEach(row => row.children!.splice(to, 0, ...row.children!.splice(from, 1)));
}

/** GFM alignment belongs to a column, so MyST records it on every cell of the column. */
export function setTableColumnAlignNode(table: MystNode, index: number, align: "left" | "center" | "right" | null): void {
  for (const row of table.children!) {
    const target = row.children![index];
    if (align) target.align = align;
    else delete target.align;
  }
}

const TABLE_DIRECTIVE_FIELDS = new Set(["type", "kind", "children", "label", "identifier", "position", "enumerator", "enumerated"]);
const CAPTION_FIELDS = new Set(["type", "children", "position"]);

// Source-kind admission is distinct from semantic equality: the internal MyST
// writer can preserve CSV grids, but the native document format does not admit them.
// Public parse rejects these nodes before any operation can clone their tree.
const nonNativeTableSources = new WeakSet<MystNode>();
export function isNativeTableSource(node: MystNode): boolean {
  return !nonNativeTableSources.has(node);
}

/**
 * Retain source evidence before directive lifting. MyST's option map can itself
 * drop names inherited from Object.prototype; VFile diagnostics still record them.
 * Unsupported options and diagnostics also participate in the write fingerprint.
 */
export function retainTableSource(node: MystNode, file: VFile, complexGrids?: Map<MystNode, MystNode>, path: number[] = []): void {
  if (node.type === "mystDirective" && node.name !== "table") {
    node.children?.filter(child => child.type === "container" && child.kind === "table")
      .forEach(child => nonNativeTableSources.add(child));
  }
  if (node.type === "mystDirective" && node.name === "table") {
    // MyST's generic container transform promotes the first loose paragraph to a
    // caption when the directive has no argument. Preserve the table's source order.
    const container = node.children?.[0];
    const children = container?.children ?? [];
    const first = children[0]?.type === "caption" ? 1 : 0;
    const rawGrid = complexGrids && path.length === 1 && container?.kind === "table" && children[first]?.type === "html"
      ? children[first] : undefined;
    const grid = rawGrid ? first : children.findIndex(child => child.type === "table");
    if (container?.kind === "table" && grid >= 0 && grid < children.length - 1) {
      const after = children.splice(grid + 1);
      children.push({ type: "legend", children: after });
    }
    const options = node.options ?? {};
    const unsupported = Object.fromEntries(Object.entries(options)
      .filter(([name]) => name !== "name" && name !== "label" && name !== "enumerator" && name !== "enumerated" && name !== "numbered"));
    const diagnostics = file.messages.filter(message => message.line != null && node.position &&
      message.line >= node.position.start.line && message.line <= node.position.end.line)
      .map(message => message.reason);
    if ((Object.keys(unsupported).length || diagnostics.length) && node.children?.[0]) {
      node.children[0]["(unsupported table options)"] = { options: unsupported, diagnostics };
    }
    if (rawGrid) {
      if (Object.keys(unsupported).length || diagnostics.length) {
        throw new DocumentWriteError("Unsupported table options: " + [...Object.keys(unsupported), ...diagnostics].join(", "), {
          code: "native-content", path, line: node.position?.start.line,
          action: "Use supported table options with valid values.",
        }, { cause: { options, diagnostics } });
      }
      const grid = readTableHtml(String(rawGrid.value), path, rawGrid.position?.start.line);
      grid.position = rawGrid.position;
      children[first] = grid;
      assertComplexTableDirective(container!, path);
      // MyST hoists paragraph children throughout the container, including
      // empty paragraphs. Hide the grid's contents during that transform.
      const placeholder = { type: "table", position: grid.position };
      complexGrids!.set(placeholder, grid);
      children[first] = placeholder;
    }
  }
  node.children?.forEach((child, index) => retainTableSource(child, file, complexGrids, [...path, index]));
}

export function validNumberOptions(node: MystNode): boolean {
  return (node.enumerated === undefined || typeof node.enumerated === "boolean") &&
    (node.enumerator === undefined || (node.enumerated !== false && typeof node.enumerator === "string" &&
      Boolean(node.enumerator.trim()) && !/[\r\n]/.test(node.enumerator)));
}

export function assertComplexTableDirective(node: MystNode, path: number[]): void {
  if (!isTableDirective(node)) tableGridError("Unsupported table caption, notes or options", path, node.position?.start.line);
  if (!validNumberOptions(node)) tableGridError("Invalid table numbering options", path, node.position?.start.line);
  if (node.label !== undefined && (labelError(node.label) || !node.label || node.identifier !== labelIdentifier(node.label))) {
    tableGridError("Invalid table label", path, node.position?.start.line);
  }
  const caption = tableCaptionParagraph(node);
  if (caption) tableInline(caption, path);
  for (const note of tableNoteParagraphs(node)) {
    tableInline(note, path);
    if (!tableNoteContent(note)) tableGridError("Table notes require supported prose without footnotes", path, note.position?.start.line);
  }
}

/**
 * A `{table}` directive Core can author: a Markdown table with optional one-paragraph caption
 * and label, followed by an optional legend of note paragraphs.
 */
export function isTableDirective(node: MystNode | undefined): boolean {
  if (node?.type !== "container" || node.kind !== "table") return false;
  if (!Object.keys(node).every((key) => TABLE_DIRECTIVE_FIELDS.has(key) || node[key] === undefined)) return false;
  const children = node.children ?? [];
  const caption = children[0]?.type === "caption" ? children[0] : undefined;
  const rest = caption ? children.slice(1) : children;
  if (rest.length < 1 || rest.length > 2 || rest[0].type !== "table") return false;
  const legend = rest[1];
  if (legend && (legend.type !== "legend" || !Object.keys(legend).every(key => CAPTION_FIELDS.has(key)) ||
      !legend.children?.length || !legend.children.every(note => note.type === "paragraph" &&
        Object.keys(note).every(key => CAPTION_FIELDS.has(key))))) return false;
  // Native grids have a header row. Headerless csv/list-table containers are
  // outside this writer's GFM shape and must not acquire an invented header.
  const header = rest[0].children?.[0]?.children;
  if (!header?.length || !header.every(cell => cell.header === true)) return false;
  if (caption && !(Object.keys(caption).every((key) => CAPTION_FIELDS.has(key)) &&
      caption.children?.length === 1 && caption.children[0].type === "paragraph" &&
      Object.keys(caption.children[0]).every(key => CAPTION_FIELDS.has(key)))) return false;
  return true;
}

/** The Markdown table of a top-level block: a plain table, or the table of a table directive. */
export function tableOf(node: MystNode | undefined): MystNode | undefined {
  if (node?.type === "table") return node;
  return isTableDirective(node) ? node!.children!.find((child) => child.type === "table") : undefined;
}

/** The caption paragraph of a table directive, if it has a caption. */
export function tableCaptionParagraph(node: MystNode | undefined): MystNode | undefined {
  return isTableDirective(node) && node!.children![0].type === "caption" ? node!.children![0].children![0] : undefined;
}

/** The table-owned paragraphs, after the grid. */
export function tableNoteParagraphs(node: MystNode | undefined): MystNode[] {
  return isTableDirective(node) ? node!.children!.find(child => child.type === "legend")?.children ?? [] : [];
}

export function tableNoteContent(note: MystNode): InlineContent[] | undefined {
  const content = projectInlineContent(note);
  return content?.length && !tableNoteHasFootnote(content) ? content : undefined;
}

export function setTableNoteParagraphs(block: MystNode, paragraphs: MystNode[]): void {
  const children = block.children!.filter(child => child.type !== "legend");
  if (paragraphs.length) children.push({ type: "legend", children: paragraphs });
  block.children = children;
}

/**
 * The top-level block for every authored table: a `{table}` directive, even without caption or label.
 */
export function tableBlockNode(table: MystNode, caption: InlineContent[], label: string, identifier?: string, enumerator?: string, enumerated?: boolean, notes: MystNode[] = []): MystNode {
  return {
    type: "container",
    kind: "table",
    ...(enumerator !== undefined ? { enumerator } : {}),
    ...(enumerated !== undefined ? { enumerated } : {}),
    ...(label.length > 0 ? { label, identifier } : {}),
    children: [
      ...(caption.length > 0 ? [{ type: "caption", children: [{ type: "paragraph", children: inlineContentToNodes(caption) }] }] : []),
      table,
      ...(notes.length ? [{ type: "legend", children: notes }] : []),
    ],
  };
}
