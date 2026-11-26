import type { NodePath } from "./document.ts";
import { figureCaptionContent } from "./figure.ts";
import { figureContentKind, supportedFigureContent, type FigureContentKind } from "./myst/figure.ts";
import { getDocumentStatus } from "./myst/status.ts";
import type { DocumentStatus } from "./status.ts";
import { getDocumentTitle } from "./myst/title.ts";
import { getHeadingNumbering } from "./myst/heading-numbering.ts";
import type { HeadingNumbering, ReferenceTemplates } from "./numbering.ts";
import { getReferenceTemplates } from "./myst/reference-templates.ts";
import { tableCellContent, tableOf, tableCaptionParagraph, tableNoteParagraphs, tableNoteContent } from "./myst/table.ts";
import { isComplexGrid, tableCellBlocks } from "./myst/table-grid.ts";
import { tableCellBlocksText, type TableCellBlock } from "./table.ts";
import { inlineContentText, projectInlineContent, type InlineContent } from "./inline.ts";
import { supportedAdmonitionContent } from "./myst/admonition.ts";
import type { ListContent } from "./list.ts";
import type { CodeBlockContent } from "./code.ts";
import { supportedCodeBlock } from "./myst/code.ts";
import { supportedListContent } from "./myst/list.ts";
import { isDivider, supportedQuoteContent } from "./myst/quote.ts";
import { supportedTargetLabel } from "./myst/reference.ts";
import { supportedHeadingContent as headingContent } from "./myst/native.ts";
import { FRONT_MATTER_FIELD } from "./myst/constants.ts";
import { supportedFootnoteContent } from "./myst/footnote.ts";
import { type MystDocument, type MystNode, toText } from "./myst/tree.ts";

export type EditableCaption = {
  path: NodePath;
  text: string;
  content: InlineContent[];
  editable: true;
};

export type EditableTableCell = {
  path: NodePath;
  text: string;
  /** Supported inline content; empty when the cell is empty. */
  content: InlineContent[];
  header: boolean;
  /** Native cells contain supported inline content. */
  editable: true;
  align?: "left" | "center" | "right";
};

export type EditableTableRow = {
  cells: EditableTableCell[];
};

/** A cell of a complex table (ADR-0024). Rows hold only the cells that start in them. */
export type EditableComplexTableCell = {
  /** [table, row, column]: `column` is the grid column where the cell starts. */
  path: NodePath;
  /** Display text: one line per paragraph and list item. */
  text: string;
  header: boolean;
  editable: true;
  align?: "left" | "center" | "right";
  column: number;
  rowspan: number;
  colspan: number;
  blocks: TableCellBlock[];
  /** The inline content of a cell that holds one paragraph; inline input replaces it. */
  content?: InlineContent[];
};

export type EditableComplexTableRow = {
  cells: EditableComplexTableCell[];
};

type EditableTableFields = {
  block: "table";
  enumerator?: string;
  enumerated?: boolean;
  path: NodePath;
  label?: string;
  caption?: InlineContent[];
  notes?: InlineContent[][];
};

export type EditableBlock =
  | {
      block: "heading";
      path: NodePath;
      level: number;
      text: string;
      /** Supported heading inline content. */
      content: InlineContent[];
      /** Native headings contain supported inline content. */
      editable: true;
    }
  | {
      block: "paragraph";
      path: NodePath;
      text: string;
      content: InlineContent[];
      editable: true;
    }
  | {
      block: "admonition";
      path: NodePath;
      variant: string;
      text: string;
      content: InlineContent[];
      editable: true;
    }
  | {
      /** Quote v1: one paragraph of supported inline content. */
      block: "quote";
      path: NodePath;
      text: string;
      content: InlineContent[];
      editable: true;
    }
  | {
      /** A footnote definition. Footnotes v2 edits one paragraph of supported inline content
       * without footnote references. */
      block: "footnote";
      path: NodePath;
      label: string;
      text: string;
      content: InlineContent[];
      editable: true;
    }
  | {
      /** A plain thematic break (`---`). */
      block: "divider";
      path: NodePath;
    }
  | {
      block: "figure";
      enumerator?: string;
      enumerated?: boolean;
      path: NodePath;
      label: string;
      /** What the Figure shows: "none", "image" or "mermaid" for supported Figures. */
      contentKind: FigureContentKind;
      /** The image the Figure shows at its top level, if any; empty for pending and Mermaid Figures. */
      imageUrl: string;
      imageAlt: string;
      /** Opaque diagram source, present only when contentKind is mermaid. */
      mermaidSource?: string;
      caption: EditableCaption;
      /** True when Core Figure operations can update supported properties without flattening content. */
      editable: true;
    }
  | (EditableTableFields & { grid?: undefined; rows: EditableTableRow[] })
  /** A table with merged cells, several header rows or cell blocks. */
  | (EditableTableFields & { grid: "complex"; headerRows: number; rows: EditableComplexTableRow[] })
  | ({
      /** A List v1 structure. */
      block: "list";
      path: NodePath;
    } & ListContent)
  | ({
      /** A Code block v1 structure. */
      block: "code";
      path: NodePath;
    } & CodeBlockContent)
  | {
      block: "equation";
      enumerator?: string;
      path: NodePath;
      latex: string;
      label: string;
    }
  | {
      /** A `(label)=` target: it labels the block after it, typically a section heading. */
      block: "target";
      path: NodePath;
      label: string;
    };


export type EditableDocument = {
  status?: DocumentStatus;
  title?: string;
  referenceTemplates?: ReferenceTemplates;
  blocks: EditableBlock[];
  headingNumbering?: HeadingNumbering;
};

export function getEditableDocument(document: MystDocument): EditableDocument {
  const blocks = document.children.flatMap((node, index) => node[FRONT_MATTER_FIELD] === true ? [] : [toBlock(node, [index])]);
  const headingNumbering = getHeadingNumbering(document);
  const referenceTemplates = getReferenceTemplates(document);
  const title = getDocumentTitle(document);
  const status = getDocumentStatus(document);
  return { blocks, ...(status !== undefined ? { status } : {}), ...(title !== undefined ? { title } : {}), ...(Object.keys(referenceTemplates).length ? { referenceTemplates } : {}), ...(headingNumbering ? { headingNumbering } : {}) };
}

function toBlock(node: MystNode, path: NodePath): EditableBlock {
  if (node.type === "heading") {
    const content = requireContent(headingContent(node));
    return {
      block: "heading",
      path,
      level: Number(node.depth ?? 1),
      text: toText(node),
      content,
      editable: true as const,
    };
  }
  if (node.type === "paragraph") {
    const content = requireContent(projectInlineContent(node));
    return {
      block: "paragraph",
      path,
      text: inlineContentText(content),
      content,
      editable: true as const,
    };
  }
  if (node.type === "admonition") {
    const content = requireContent(supportedAdmonitionContent(node));
    return {
      block: "admonition",
      path,
      variant: typeof node.kind === "string" && node.kind.length > 0 ? node.kind : "note",
      text: inlineContentText(content),
      content,
      editable: true as const,
    };
  }
  if (node.type === "blockquote") {
    const content = requireContent(supportedQuoteContent(node));
    return { block: "quote", path, text: inlineContentText(content), content, editable: true as const };
  }
  if (node.type === "footnoteDefinition" && typeof node.label === "string") {
    const content = requireContent(supportedFootnoteContent(node));
    return { block: "footnote", path, label: node.label, text: inlineContentText(content),
      content, editable: true as const };
  }
  if (isDivider(node)) {
    return { block: "divider", path };
  }
  if (node.type === "container" && node.kind === "figure") {
    return figureBlock(node, path);
  }
  if (node.type === "math") {
    return {
      block: "equation",
      ...(node.enumerator !== undefined ? { enumerator: node.enumerator as string } : {}),
      path,
      latex: typeof node.value === "string" ? node.value : "",
      label: nodeLabel(node),
    };
  }
  if (tableOf(node) && (!tableCaptionParagraph(node) || projectInlineContent(tableCaptionParagraph(node)!) !== undefined)) {
    return tableBlock(node, path);
  }
  const list = supportedListContent(node);
  if (list) {
    return { block: "list", path, ...list };
  }
  const code = supportedCodeBlock(node);
  if (code) {
    return { block: "code", path, ...code };
  }
  const target = supportedTargetLabel(node);
  if (target !== undefined) {
    return { block: "target", path, label: target };
  }
  throw new Error(`Unsupported native block at [${path.join(",")}]: ${node.type}`);
}

function figureBlock(node: MystNode, path: NodePath): EditableBlock {
  const children = node.children ?? [];
  const imageIndex = children.findIndex((child) => child.type === "image");
  const captionIndex = children.findIndex((child) => child.type === "caption");
  const image = imageIndex >= 0 ? children[imageIndex] : undefined;
  const caption = captionIndex >= 0 ? children[captionIndex] : undefined;
  const supported = supportedFigureContent(node);
  if (!supported) throw new Error("Unsupported native Figure");
  return {
    block: "figure",
    ...(node.enumerator !== undefined ? { enumerator: node.enumerator as string } : {}),
    ...(node.enumerated !== undefined ? { enumerated: node.enumerated as boolean } : {}),
    path,
    label: nodeLabel(node),
    contentKind: figureContentKind(node),
    ...(supported.mermaidSource !== undefined ? { mermaidSource: supported.mermaidSource } : {}),
    imageUrl: typeof image?.url === "string" ? image.url : "",
    imageAlt: typeof image?.alt === "string" ? image.alt : "",
    caption: {
      path: captionIndex >= 0 ? [...path, captionIndex] : path,
      text: caption ? toText(caption) : "",
      content: figureCaptionContent(supported.caption),
      editable: true as const,
    },
    editable: true as const,
  };
}

/** The cell of a table block at a cell path [table, row, column]; a complex table's column is the
 * column where its cell starts, so a covered position has no cell. */
export function tableCellAtPath(block: EditableBlock | undefined, path: NodePath): EditableTableCell | EditableComplexTableCell | undefined {
  if (block?.block !== "table" || path.length !== 3) return undefined;
  const cells: (EditableTableCell | EditableComplexTableCell)[] = block.rows[path[1]]?.cells ?? [];
  return cells.find(cell => cell.path[2] === path[2]);
}

function tableBlock(node: MystNode, path: NodePath): EditableBlock {
  const table = tableOf(node)!;
  const notes = tableNoteParagraphs(node).map(note => requireContent(tableNoteContent(note)));
  const fields = {
    block: "table" as const,
    ...(node.enumerator !== undefined ? { enumerator: node.enumerator as string } : {}),
    ...(node.enumerated !== undefined ? { enumerated: node.enumerated as boolean } : {}),
    path,
  };
  const details = {
    ...(notes.length ? { notes } : {}),
    ...(nodeLabel(node) ? { label: nodeLabel(node) } : {}),
    ...(tableCaptionParagraph(node) ? { caption: projectInlineContent(tableCaptionParagraph(node)!)! } : {}),
  };
  if (isComplexGrid(table)) {
    const rows = (table.children ?? []).map((row, rowIndex) => ({
      cells: (row.children ?? []).map(cell => {
        const blocks = tableCellBlocks(cell);
        if (!blocks) throw new Error("Unsupported native table cell content");
        const column = cell.column as number;
        return {
          path: [...path, rowIndex, column] as NodePath,
          text: tableCellBlocksText(blocks, inlineContentText),
          header: cell.header === true,
          editable: true as const,
          ...(["left", "center", "right"].includes(String(cell.align)) ? { align: cell.align as "left" | "center" | "right" } : {}),
          column, rowspan: cell.rowspan as number, colspan: cell.colspan as number,
          blocks,
          ...(blocks.length === 1 && blocks[0].kind === "paragraph" ? { content: blocks[0].content } : {}),
        };
      }),
    }));
    return { ...fields, grid: "complex", headerRows: table.headerRows as number, rows, ...details };
  }
  const rows = (table.children ?? []).map((row, rowIndex) => ({
    cells: (row.children ?? []).map((cell, cellIndex) => {
      const content = requireContent(tableCellContent(cell));
      const inline = inlineContentText(content);
      return {
        path: [...path, rowIndex, cellIndex] as NodePath,
        text: inline.includes("\n") ? inline : toText(cell),
        content,
        header: rowIndex === 0,
        editable: true as const,
        ...(["left", "center", "right"].includes(String(cell.align))
          ? { align: cell.align as "left" | "center" | "right" } : {}),
      };
    }),
  }));
  return { ...fields, rows, ...details };
}

function requireContent(content: InlineContent[] | undefined): InlineContent[] {
  if (!content) throw new Error("Unsupported native inline content");
  return content;
}

function nodeLabel(node: MystNode): string {
  if (typeof node.label === "string" && node.label.length > 0) return node.label;
  if (typeof node.identifier === "string" && node.identifier.length > 0) return node.identifier;
  return "";
}
