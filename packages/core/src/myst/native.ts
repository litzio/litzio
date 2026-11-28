import { isMap, isScalar, parseDocument } from "yaml";
import { createHtmlId } from "myst-common";
import { hasAdjacentMatchingLinks, inlineContentText, projectInlineContent, type InlineContent } from "../inline.ts";
import { DocumentWriteError, writeIssueOf, type WriteIssue } from "../write-error.ts";
import { validateStructure } from "../validation.ts";
import { supportedAdmonitionContent } from "./admonition.ts";
import { supportedCodeBlock } from "./code.ts";
import { isFigure, supportedFigureContent } from "./figure.ts";
import { supportedFootnoteContent } from "./footnote.ts";
import { checklistShapeIssue, supportedListContent } from "./list.ts";
import { citationShorthand } from "./literal-syntax.ts";
import { FRONT_MATTER_FIELD } from "./constants.ts";
import { parse as parseTree } from "./parse.ts";
import { isDivider, supportedQuoteContent } from "./quote.ts";
import { supportedTargetLabel } from "./reference.ts";
import { repeatRoundTrip, roundTrip, serialize as serializeTree } from "./serialize.ts";
import { tableCellContent, tableOf, tableCaptionParagraph, tableNoteContent, tableNoteParagraphs, isNativeTableSource, validNumberOptions } from "./table.ts";
import { isComplexGrid, tableCellBlocks, usePipeGrid } from "./table-grid.ts";
import type { MystDocument, MystNode } from "./tree.ts";
import { NUMBERED_KINDS, referenceTemplatesError, type NumberedKind } from "../numbering.ts";
import { referenceTemplateValue } from "./reference-templates.ts";
import { getTemplateMetadata } from "./template.ts";
import { getDocumentStatus } from "./status.ts";
import { getDocumentTitle } from "./title.ts";
import { declaredBibliography } from "./citation.ts";

export type NativeDocumentErrorCode = "native-marker" | "native-metadata" | "native-content";
export class NativeDocumentError extends DocumentWriteError {
  constructor(readonly code: NativeDocumentErrorCode, reason: string, path?: number[], line?: number) {
    super(reason, { code, action: "Open a native document or create a new document. Automatic conversion is not supported.", path, line });
    this.name = "NativeDocumentError";
  }
}

function fields(node: MystNode, allowed: string[]): boolean {
  return Object.entries(node).every(([key, value]) => value === undefined ||
    ["type", "position", ...allowed].includes(key));
}

export function supportedHeadingContent(node: MystNode): InlineContent[] | undefined {
  if (!fields(node, ["depth", "children"]) || !Number.isInteger(node.depth) || node.depth < 1 || node.depth > 6) return undefined;
  const content = projectInlineContent(node);
  const breaks = (items: InlineContent[]): boolean => items.some(item => item.kind === "break" || ("children" in item && breaks(item.children)));
  return content && inlineContentText(content).length > 0 && !breaks(content) ? content : undefined;
}

/**
 * Whether source starts with frontmatter carrying the native marker `litzio: 1`, read from the
 * leading frontmatter alone so a folder listing can tell native files apart without parsing them.
 * It is not admission: a marked file can still be rejected for its metadata or content.
 */
export function hasNativeMarker(source: string): boolean {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source.replace(/^\uFEFF/, ""));
  if (!match) return false;
  const yaml = parseDocument(match[1]!);
  const marker = isMap(yaml.contents) ? yaml.get("litzio", true) : undefined;
  return isScalar(marker) && marker.value === 1;
}

/** Validate source metadata before accepting a file; canonicalization cannot detect duplicate YAML keys. */
function metadata(document: MystDocument): void {
  const first = document.children[0];
  if (first?.[FRONT_MATTER_FIELD] !== true) throw new NativeDocumentError("native-marker", "A native document requires leading frontmatter with litzio: 1", [0], 1);
  const yaml = parseDocument(String(first.value ?? ""));
  if (yaml.errors.length || !isMap(yaml.contents)) throw new NativeDocumentError("native-metadata", `Invalid native frontmatter: ${yaml.errors[0]?.message ?? "expected a YAML mapping"}`, [0], 1);
  const marker = yaml.get("litzio", true);
  if (!isScalar(marker) || marker.value !== 1) throw new NativeDocumentError("native-marker", "Unsupported native document marker; expected YAML number litzio: 1", [0], 1);
  // Other fields belong to other tools; they are kept as written and never read as Litzio metadata.
  if (yaml.contents.items.some(pair => !isScalar(pair.key))) throw new NativeDocumentError("native-metadata", "Native frontmatter keys must be plain scalars", [0], 1);
  try { getDocumentStatus(document); getDocumentTitle(document); declaredBibliography(document); getTemplateMetadata(document); }
  catch (error) {
    const refusal = new NativeDocumentError("native-metadata", (error as Error).message, [0], 1);
    refusal.location.action = writeIssueOf(error).action;
    throw refusal;
  }
  if (yaml.has("numbering")) {
    const numbering = yaml.get("numbering", true);
    if (!isMap(numbering) || numbering.items.some(pair => {
      if (!isScalar(pair.key)) return true;
      const key = pair.key.value;
      if (key === "headings") return !isScalar(pair.value) || typeof pair.value.value !== "boolean";
      if (key === "title") return !isScalar(pair.value) || pair.value.value !== false;
      if (!NUMBERED_KINDS.includes(key as NumberedKind)) return true;
      const template = referenceTemplateValue(pair.value);
      return template === undefined || referenceTemplatesError({ [String(key)]: template }) !== undefined;
    })) {
      throw new NativeDocumentError("native-metadata", "Numbering supports only headings: boolean, title: false and figure/table/equation templates", [0], 1);
    }
  }
}

function supportedBlock(node: MystNode): boolean {
  if (!isNativeTableSource(node)) return false;
  if (!validNumberOptions(node) || (node.enumerated !== undefined && !isFigure(node) && !tableOf(node))) return false;
  if (node.type === "heading") return supportedHeadingContent(node) !== undefined;
  if (node.type === "paragraph") return fields(node, ["children"]) && projectInlineContent(node) !== undefined;
  if (node.type === "admonition") return supportedAdmonitionContent(node) !== undefined;
  if (node.type === "blockquote") return supportedQuoteContent(node) !== undefined;
  if (node.type === "footnoteDefinition") return supportedFootnoteContent(node) !== undefined;
  if (node.type === "math") return fields(node, ["value", "label", "identifier", "html_id", "enumerator"]) && typeof node.value === "string" &&
    (node.html_id === undefined || (typeof node.identifier === "string" && node.html_id === createHtmlId(node.identifier)));
  if (node.type === "container" && node.kind === "figure") {
    return fields(node, ["kind", "children", "label", "identifier", "enumerator", "enumerated"]) && supportedFigureContent(node) !== undefined &&
      (node.children ?? []).every(child => child.type === "image"
        ? fields(child, ["url", "alt"]) : child.type === "mermaid" ? fields(child, ["value"]) : fields(child, ["children"]) && (child.children ?? []).every(paragraph => fields(paragraph, ["children"])));
  }
  const table = tableOf(node);
  if (table) {
    const caption = tableCaptionParagraph(node);
    const complex = isComplexGrid(table);
    return (!caption || projectInlineContent(caption) !== undefined) &&
      tableNoteParagraphs(node).every(note => tableNoteContent(note) !== undefined) && fields(table, complex ? ["children", "headerRows"] : ["children"]) &&
      (table.children ?? []).length > 0 && (table.children ?? []).every(row => row.type === "tableRow" && fields(row, ["children"]) &&
        (row.children ?? []).every(cell => complex
          ? fields(cell, ["header", "align", "children", "column", "rowspan", "colspan"]) && tableCellBlocks(cell) !== undefined
          : fields(cell, ["header", "align", "children"]) && tableCellContent(cell) !== undefined));
  }
  return isDivider(node) || supportedListContent(node) !== undefined || supportedCodeBlock(node) !== undefined || supportedTargetLabel(node) !== undefined;
}

function assertInlineContent(node: MystNode, path: number[]): void {
  // A complex table's cell holds paragraphs and lists, which are checked themselves.
  const cellBlocks = node.type === "tableCell" && (node.children ?? []).some(child => child.type === "paragraph" || child.type === "list");
  if (["heading", "paragraph", "tableCell"].includes(node.type) && !cellBlocks) {
    const content = projectInlineContent(node);
    if (!content) throw new NativeDocumentError("native-content", "Unsupported native inline content", path, node.position?.start.line);
    if (hasAdjacentMatchingLinks(content)) {
      throw new NativeDocumentError("native-content", "Adjacent separate links with the same target are not supported", path, node.position?.start.line);
    }
  }
  node.children?.forEach((child, index) => assertInlineContent(child, [...path, index]));
}

export function assertNativeDocument(document: MystDocument): void {
  validateStructure(document);
  metadata(document);
  const shorthand = citationShorthand(document);
  if (shorthand) {
    const error = new NativeDocumentError("native-content",
      "Bracket citation shorthand is not supported; use an explicit citation role, or escape the opening bracket (\\[) or the @ (\\@) for literal text.",
      shorthand.path, shorthand.line);
    error.location.action = "Use {cite}, {cite:t} or {cite:p} for citations. For literal text, escape the opening bracket (\\[) or the @ (\\@).";
    throw error;
  }
  document.children.forEach((node, index) => {
    if (index === 0) return;
    const checklist = node.type === "list" ? checklistShapeIssue(node) : undefined;
    if (checklist) throw new NativeDocumentError("native-content", checklist, [index], node.position?.start.line);
    if (!supportedBlock(node)) throw new NativeDocumentError("native-content", `Unsupported native content: ${node.type}${node.kind ? ` (${node.kind})` : ""}`, [index], node.position?.start.line);
    assertInlineContent(node, [index]);
  });
}

export function parseNativeDocument(source: string): MystDocument {
  // ADR-0024: a `{table}` grid may be the supported HTML subset.
  const document = parseTree(source, { complexTables: true, nativeAdmission: true });
  assertNativeDocument(document);
  // An HTML grid that fits a pipe grid is a pipe table, as its canonical write is, so that the read
  // model and the operations see the grid that the document keeps.
  document.children.forEach((node, index) => {
    const table = tableOf(node);
    if (isComplexGrid(table)) usePipeGrid(table!, [index]);
  });
  serializeTree(document);
  return document;
}

export function serializeNativeDocument(document: MystDocument): string {
  return roundTripNativeDocument(document).markdown;
}

export function serializeNativeDocumentWithReadback(document: MystDocument) {
  const { markdown, reparsed } = roundTripNativeDocument(document);
  return { markdown, document: reparsed };
}

function roundTripNativeDocument(document: MystDocument) {
  assertNativeDocument(document);
  const result = roundTrip(document);
  assertNativeDocument(result.reparsed);
  return result;
}

/** The authored source must be native and stable through a second canonical write. */
export function canonicalNativeSnapshot(document: MystDocument) {
  const result = roundTripNativeDocument(document);
  const repeated = repeatRoundTrip(result);
  if (repeated.markdown !== result.markdown) {
    assertNativeDocument(repeated.reparsed);
    throw new Error();
  }
  return result;
}

export function createDocument(): MystDocument {
  return parseNativeDocument("---\nlitzio: 1\n---\n");
}

export function canonicalWriteIssue(document: MystDocument): WriteIssue | undefined {
  try { serializeNativeDocument(document); return undefined; }
  catch (error) { return writeIssueOf(error); }
}

export function canonicalWriteError(document: MystDocument): string | undefined {
  return canonicalWriteIssue(document)?.reason;
}
