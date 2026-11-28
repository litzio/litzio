import { createMystParser, createTokenizer } from "myst-parser";
import {
  containerChildrenTransform,
  liftMystDirectivesAndRolesTransform,
} from "myst-transforms";
import { VFile } from "vfile";
import { DocumentWriteError } from "../write-error.ts";
import { recognizeGitHubAlert } from "./admonition.ts";
import { ensureFrontMatter, markFrontMatter } from "./metadata.ts";
import { locateFootnotes } from "./footnote.ts";
import { adoptRecoveredLinkDefinitions, parseLinkDefinitions } from "./link-definitions.ts";
import { retainMermaidOptions } from "./figure.ts";
import { assertComplexTableDirective, isNativeTableSource, readTableBreaks, retainTableSource } from "./table.ts";
import type { MystDocument, MystNode } from "./tree.ts";
import { assertUnicode } from "./unicode.ts";

/**
 * Parse boundary. The canonical-write guard compares this parse with the parse of
 * its own output, so anything decided here is invisible to it:
 * - text is the user's text: MyST's default typographic quote substitution
 *   (markdown-it `typographer` + `smartquotes`) would turn `Don't` into `Don’t`,
 *   so it is off, and a typed straight quote reloads exactly as written;
 * - a leading UTF-8 byte order mark is an encoding signature, not content;
 * - front matter is marked so canonical write preserves its metadata role;
 * - table directive kinds, options and parser diagnostics survive lifting for native admission;
 * - footnote definitions get their own source lines and follow the body in endnote order, as
 *   canonical write puts them; those the parse dropped are recorded.
 */
// Bare @name is text. Bracket shorthand is refused from source-token evidence at
// native admission; explicit cite roles retain their typed meaning.
// Keep MyST's HTML recognition: disabling it would admit unsupported HTML as text.
// The pinned markdown-it patch bounds unterminated inline HTML scans instead.
// Prices stay literal when a digit sits outside the dollar delimiters.
export const MATH_EXTENSIONS = { amsmath: true, dollarmath: { allow_digits: false } };
export const OPTIONS = {
  extensions: { smartquotes: false, citations: false, attrs_block: true, strikethrough: true, math: MATH_EXTENSIONS },
};
const parseMyst = createMystParser(OPTIONS);
const imageTokenizer = createTokenizer(OPTIONS);

const parserLossReasons = {
  depth: "Markdown nesting exceeds the parser limit and content would be lost.",
  entity: "An invalid numeric character reference would be replaced.",
  table: "A Markdown table row contains content beyond its header width.",
} as const;

function parserLoss(reason: string, line?: number): DocumentWriteError {
  return new DocumentWriteError(reason, {
    code: "parser-loss", line,
    action: "Keep editing as text, or correct the affected Markdown before opening as a structured document.",
  });
}

/** MyST tokenizes some directive arguments and bodies speculatively. Inspect
 * surviving nodes so opaque values (such as Mermaid code) stay literal. */
function assertNoParserLoss(node: MystNode): void {
  const kind: unknown = node.litzioParserLoss;
  if (kind === "depth" || kind === "entity" || kind === "table") {
    throw parserLoss(parserLossReasons[kind], kind === "entity" ? undefined : node.position?.start.line);
  }
  node.children?.forEach(assertNoParserLoss);
}

/** Read one line without document reference definitions as a standalone image. Only an
 * inline image link without a title can produce this token on its own. The writer uses
 * the same reading to keep a Figure whose URL or alt text would not survive it. */
export function standaloneImage(line: string): { url: string; alt: string } | undefined {
  const tokens = imageTokenizer.parseInline(line, {})[0]?.children;
  const image = tokens?.length === 1 ? tokens[0] : undefined;
  if (image?.type !== "image" || image.attrGet("title") !== null) return undefined;
  // myst-parser reads alt text the same way.
  return { url: image.attrGet("src") ?? "", alt: image.attrGet("alt") || (image.children ?? []).reduce((text, child) => text + child.content, "") };
}

const directiveRanges = new WeakMap<MystNode, NonNullable<MystNode["position"]>>();

/** Single lifted blocks occupy the directive fences. Keep this parser evidence apart
 * from diagnostic positions and the serializable model. */
export function sourcePosition(node: MystNode): MystNode["position"] {
  return directiveRanges.get(node) ?? node.position;
}

export function parse(source: string, { complexTables = false, nativeAdmission = false, documentMetadata = false } = {}): MystDocument {
  assertUnicode(source);
  const nul = source.indexOf("\0");
  if (nul !== -1) throw parserLoss("A NUL character would be replaced by the Markdown parser.", source.slice(0, nul).split(/\r\n?|\n/).length);
  const text = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const file = new VFile();
  let hasParserLoss = false;
  file.data.litzioParserLoss = () => { hasParserLoss = true; };
  const document = documentMetadata && text.includes("]:")
    ? parseLinkDefinitions(text, file, OPTIONS)
    : parseMyst(text, file);
  if (hasParserLoss) assertNoParserLoss(document);
  markFrontMatter(document, text);
  if (documentMetadata) ensureFrontMatter(document);
  const convertedTables = complexTables ? new Set<MystNode>() : undefined;
  retainTableSource(document, file, convertedTables);
  retainMermaidOptions(document, file);
  for (const node of document.children) {
    if (node.type === "mystDirective" && node.children?.length === 1 && node.position) {
      directiveRanges.set(node.children[0], node.position);
    }
  }
  let lines: string[] | undefined;
  document.children = document.children.map(node => {
    if (node.type !== "image" || !node.position) return node;
    lines ??= text.split(/\r\n?|\n/);
    const { start, end } = node.position;
    const line = lines[start.line - 1];
    if (start.line !== end.line || !line || !/^ {0,3}!\[/.test(line) || !node.url ||
        !Object.keys(node).every(key => node[key] === undefined || ["type", "position", "url", "alt"].includes(key))) return node;
    if (!standaloneImage(line.trim())) return node;
    return { type: "container", kind: "figure", children: [node], position: node.position };
  });
  liftMystDirectivesAndRolesTransform(document);
  for (const [index, node] of document.children.entries()) {
    if (node.type !== "blockquote" || !node.position) continue;
    lines ??= text.split(/\r\n?|\n/);
    document.children[index] = recognizeGitHubAlert(node, lines) ?? node;
  }
  if (convertedTables?.size) {
    document.children.forEach((node, index) => {
      if (convertedTables.has(node)) assertComplexTableDirective(node, [index]);
    });
    // The HTML reader has already organized these containers. MyST's general
    // hoisting pass would discard their empty cell paragraphs.
    const children = document.children.filter(node => !convertedTables.has(node));
    containerChildrenTransform({ ...document, children }, new VFile());
  } else containerChildrenTransform(document, new VFile());
  readTableBreaks(document);
  const probe = locateFootnotes(document, text, OPTIONS, convertedTables?.size
    ? source => parse(source, { documentMetadata })
    : undefined);
  if (probe) adoptRecoveredLinkDefinitions(document, probe);
  // Native admission refuses HTML outside the grids itself, with its own codes and reasons.
  if (complexTables && !nativeAdmission) rejectOutOfScopeHtml(document);
  return document;
}

function rejectOutOfScopeHtml(node: MystNode, path: number[] = []): void {
  if (node.type === "html" || !isNativeTableSource(node)) {
    throw new DocumentWriteError("Only a table grid inside a {table} directive supports HTML", {
      code: "native-content", path, line: node.position?.start.line,
      action: "Use supported Markdown outside the table grid.",
    });
  }
  node.children?.forEach((child, index) => rejectOutOfScopeHtml(child, [...path, index]));
}
