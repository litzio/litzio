import { createMystParser } from "myst-parser";
import {
  containerChildrenTransform,
  liftMystDirectivesAndRolesTransform,
} from "myst-transforms";
import { VFile } from "vfile";
import { DocumentWriteError } from "../write-error.ts";
import { FRONT_MATTER_FIELD } from "./constants.ts";
import { locateFootnotes } from "./footnote.ts";
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
export const OPTIONS = { extensions: { smartquotes: false, citations: false, attrs_block: true } };
const parseMyst = createMystParser(OPTIONS);

const directiveRanges = new WeakMap<MystNode, NonNullable<MystNode["position"]>>();

/** Single lifted blocks occupy the directive fences. Keep this parser evidence apart
 * from diagnostic positions and the serializable model. */
export function sourcePosition(node: MystNode): MystNode["position"] {
  return directiveRanges.get(node) ?? node.position;
}

export function parse(source: string, { complexTables = false } = {}): MystDocument {
  assertUnicode(source);
  const text = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const file = new VFile();
  const document = parseMyst(text, file) as MystDocument;
  markFrontMatter(document, text);
  const convertedTables = complexTables ? new Set<MystNode>() : undefined;
  retainTableSource(document, file, convertedTables);
  retainMermaidOptions(document, file);
  for (const node of document.children) {
    if (node.type === "mystDirective" && node.children?.length === 1 && node.position) {
      directiveRanges.set(node.children[0], node.position);
    }
  }
  liftMystDirectivesAndRolesTransform(document);
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
  locateFootnotes(document, text, OPTIONS, convertedTables?.size ? parse : undefined);
  if (complexTables) rejectOutOfScopeHtml(document);
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

/**
 * myst-parser replaces its `front_matter` token with an ordinary `yaml` fence, so the
 * tree alone cannot tell front matter from a leading ```yaml block. The source can:
 * of the block rules, only front matter opens a code block with `-` (fences open with
 * ``` or ~~~, indented code with spaces), and it only starts at the first line.
 */
function markFrontMatter(document: MystDocument, source: string): void {
  const first = document.children[0];
  if (first?.type === "code" && first.position?.start.line === 1 && source.startsWith("-")) {
    const lines = source.split(/\r?\n/);
    const opener = /^(-{3,})[\t ]*$/.exec(lines[0]);
    // An indented marker can belong to a YAML block scalar. The upstream rule
    // also accepts it as a closer; do not reinterpret that ambiguous input.
    const closer = /^(-{3,})[\t ]*$/.exec(lines[(first.position.end.line ?? 1) - 1]);
    first[FRONT_MATTER_FIELD] = opener && closer && first.position.end.line > 1 &&
      closer[1].length >= opener[1].length ? true : "unclosed or unsupported delimiter";
    if (first[FRONT_MATTER_FIELD] === true) {
      // MyST's code conversion trims a trailing blank line. In YAML a block scalar
      // (notably |+) can give that newline meaning. Keep the complete metadata value;
      // the marker above keeps its role and required document-start context semantic.
      const content = lines.slice(1, first.position.end.line - 1);
      first.value = content.length ? `${content.join("\n")}\n` : "";
    }
  }
}
