import { projectInlineContent, paragraphLeadingSpaceLength } from "../inline.ts";
import { writeMd } from "myst-to-md";
import { createTokenizer } from "myst-parser";
import { assertUnicode } from "./unicode.ts";
import { VFile } from "vfile";
import { semanticDifferenceIssue, semanticFingerprint } from "./fingerprint.ts";
import { nestedListNeedsBlank } from "./list.ts";
import { DocumentWriteError, writeIssueOf, type WriteIssue } from "../write-error.ts";
import { completeFootnotes, endnotePlacement, footnoteWriteIssue } from "./footnote.ts";
import { githubAlertTag } from "./admonition.ts";
import { supportedCodeBlock, writeCodeFence } from "./code.ts";
import { isFigure, figureContentKind } from "./figure.ts";
import { FRONT_MATTER_FIELD, IMPLICIT_FRONT_MATTER } from "./constants.ts";
import { encodeEmphasisBoundaries, hasAlternateBoundaries } from "./emphasis-boundary.ts";
import { encodeLineStarts, hasLineStartSyntax } from "./line-start.ts";
import { sourceSyntaxDiagnostics } from "./literal-syntax.ts";
import { holdsAt, markMinimalEscape, minimalEscapeText } from "./minimal-escape.ts";
import { MATH_EXTENSIONS, parse, standaloneImage } from "./parse.ts";
import { prepareReferences } from "./reference.ts";
import { assertComplexTableDirective, isTableDirective, tableOf, tableCaptionParagraph, tableBlockNode, tableNoteParagraphs } from "./table.ts";
import { locateTableCells, needsComplexGrid, usePipeGrid } from "./table-grid.ts";
import { writeTableHtml } from "./table-html.ts";
import { cloneDocument, type MystDocument, type MystNode } from "./tree.ts";

const LOSS = "Document contains semantic content that cannot be preserved in canonical Markdown";
// Ask the pinned upstream citation rule which literal @ positions need protection.
// Do not duplicate its key grammar, preceding-character or URL-context rules.
const writerTokenizer = createTokenizer({ extensions: { smartquotes: false, math: MATH_EXTENSIONS } });
const citationRules = writerTokenizer.inline.ruler.getRules("");
writerTokenizer.inline.ruler.disable("citation");
const nonCitationRules = new Set(writerTokenizer.inline.ruler.getRules(""));
const citationRule = citationRules.find(rule => !nonCitationRules.has(rule))!;
// Likewise ask the pinned dollar-math rule which literal $ positions would open math.
const mathRule = (() => {
  const rules = writerTokenizer.inline.ruler.getRules("");
  writerTokenizer.inline.ruler.disable("math_inline");
  const others = new Set(writerTokenizer.inline.ruler.getRules(""));
  writerTokenizer.inline.ruler.enable("math_inline");
  return rules.find(rule => !others.has(rule))!;
})();
const handlers = { text: minimalEscapeText };

/** Canonical serialization would lose semantics; `detail` names the node and reason. */
export class SemanticLossError extends DocumentWriteError {
  constructor(readonly detail: string, options?: ErrorOptions & Partial<Omit<WriteIssue, "reason">>) {
    super(`${LOSS}: ${detail}`, { code: options?.code ?? "round-trip-mismatch", action: options?.action ?? "Review this content and simplify or replace the unsupported content before saving.",
      ...(options?.path ? { path: options.path } : {}), ...(options?.line ? { line: options.line } : {}) }, options);
  }
}

/** Serialize for an operation's own round-trip check, reporting a loss as that operation's failure.
 * Incomplete session states are checked on a disposable clone: missing footnote definitions
 * are completed, and an empty equation is checked without its unrepresentable fixed option.
 * The operation result retains that option. Only the final canonical write rejects it. */
export function serializeFor(document: MystDocument, failure: string): string {
  return roundTripFor(document, failure).markdown;
}

export function roundTripFor(document: MystDocument, failure: string): RoundTrip {
  try {
    let check = document;
    if (document.children.some(node => node.type === "math" && node.value === "" && node.enumerator !== undefined)) {
      check = cloneDocument(document);
      for (const node of check.children) if (node.type === "math" && node.value === "") delete node.enumerator;
    }
    return roundTrip(completeFootnotes(check));
  } catch (error) {
    if (error instanceof SemanticLossError) throw new Error(`${failure} (${error.detail})`, { cause: error });
    throw error;
  }
}

/**
 * Canonical write path. Never returns Markdown that loses document semantics:
 * 1. myst-to-md diagnostics mean output it could not render;
 * 2. the reparsed Markdown must keep the original semantic fingerprint.
 * Footnote definitions are written after the body in endnote order, wherever the tree holds
 * them (`endnotePlacement`); parse reads them back in that order, so writing is idempotent.
 */
export function serialize(document: MystDocument): string {
  return roundTrip(document).markdown;
}

type RoundTrip = { markdown: string; reparsed: MystDocument; fingerprint: ReturnType<typeof semanticFingerprint> };

/** Check the second serialization in full, reusing the parse only for identical bytes. */
export function repeatRoundTrip(result: RoundTrip): RoundTrip {
  return roundTrip(result.reparsed, result);
}

/** How a write attempt differs from the plain write. */
type Attempt = { alternate: boolean; lineStarts: boolean };
type Conventions = { attempted?: Set<number>; skip?: ReadonlySet<number> };
type Prepared = { prefix: string; minimal: Set<number> };

/** Return the same parsed snapshot that passed canonical semantic comparison.
 * The plain write is tried first and kept whenever it passes, so output it keeps never changes.
 * Only a refused document takes the later attempts (see hasAlternateBoundaries and
 * hasLineStartSyntax); when they are refused as well, the first refusal stands. */
export function roundTrip(document: MystDocument, previous?: RoundTrip): RoundTrip {
  try { return writeWithConventions(document, previous, { alternate: false, lineStarts: false }); }
  catch (error) {
    if (!(error instanceof SemanticLossError) || error.location.code !== "round-trip-mismatch") throw error;
    const alternate = hasAlternateBoundaries(document), lineStarts = hasLineStartSyntax(document);
    const attempts = [
      ...(alternate ? [{ alternate, lineStarts: false }] : []),
      ...(lineStarts ? [{ alternate: false, lineStarts }] : []),
      ...(alternate && lineStarts ? [{ alternate, lineStarts }] : []),
    ];
    for (const attempt of attempts) {
      try { return writeWithConventions(document, previous, attempt); }
      catch { /* the first refusal stands */ }
    }
    throw error;
  }
}

/** Local replacement cannot request escaping changes to other blocks. */
export function plainRoundTrip(document: MystDocument, previous?: RoundTrip): RoundTrip {
  return writeRoundTrip(document, previous, { alternate: false, lineStarts: false });
}

/** Prefer conventional syntax, keeping the existing writer for blocks whose
 * conventional form cannot preserve their meaning in the complete document. */
function writeWithConventions(document: MystDocument, previous: RoundTrip | undefined, attempt: Attempt): RoundTrip {
  const attempted = new Set<number>();
  const mismatch = (error: unknown): error is SemanticLossError =>
    error instanceof SemanticLossError && error.location.code === "round-trip-mismatch";
  try { return writeRoundTrip(document, previous, attempt, { attempted }); }
  catch (error) {
    if (!mismatch(error) || !attempted.size) throw error;
    // Keep the conventions of every block that read back; skip only the blocks a refusal
    // names. One refusal names all differing blocks it can align, so a retry is rarely needed
    // twice. Only a refusal that names no new attempted block skips them all.
    const skip = new Set<number>();
    let failure: SemanticLossError = error;
    for (let retry = 0; retry < 2; retry++) {
      const found = failedBlocks(failure).filter(block => attempted.has(block) && !skip.has(block));
      if (!found.length || found.length === attempted.size) break;
      for (const block of found) skip.add(block);
      try { return writeRoundTrip(document, previous, attempt, { skip }); }
      catch (next) {
        if (!mismatch(next)) break;
        failure = next;
      }
    }
    try { return writeRoundTrip(document, previous, attempt, { skip: attempted }); }
    catch { throw error; }
  }
}

/** Original top-level indices of the blocks a refusal names. */
const refusedBlocks = new WeakMap<SemanticLossError, number[]>();
function failedBlocks(error: SemanticLossError): number[] {
  const path = error.location.path?.[0];
  return refusedBlocks.get(error) ?? (path === undefined ? [] : [path]);
}

/** Name every top-level block that reads back differently, when the reread keeps the block
 * count so blocks still align, together with narrowed-escape blocks that read as literal syntax. */
function refusal(error: SemanticLossError, expected: ReturnType<typeof semanticFingerprint>, result: RoundTrip,
  blockPaths: number[][], literal: number[]): SemanticLossError {
  const blocks = new Set<number>(literal);
  const after = result.fingerprint.children;
  if (expected.children.length === after.length) {
    expected.children.forEach((block, index) => {
      if (semanticDifferenceIssue(block, after[index])) blocks.add(blockPaths[index][0]);
    });
  }
  if (blocks.size) refusedBlocks.set(error, [...blocks]);
  return error;
}

function literalBlocks(result: RoundTrip, blockPaths: number[][], minimal: ReadonlySet<number>): number[] {
  if (!minimal.size) return [];
  return sourceSyntaxDiagnostics(result.reparsed).map(item => blockPaths[item.path[0]]?.[0])
    .filter((block): block is number => block !== undefined && minimal.has(block));
}

function writeRoundTrip(document: MystDocument, previous: RoundTrip | undefined, attempt: Attempt, conventions: Conventions = {}): RoundTrip {
  assertUnicode(document);
  // The fingerprint would also catch these, but not name the footnote.
  const footnotes = footnoteWriteIssue(document);
  if (footnotes) throw new SemanticLossError(footnotes.reason, footnotes);
  const tree = cloneDocument(document);
  let complexTables = false;
  const convertedToPipe = new Set<number>();
  tree.children.forEach((node, index) => {
    const table = node.type === "table" ? node : node.kind === "table"
      ? node.children?.find(child => child.type === "table") : undefined;
    if (!table || !needsComplexGrid(table)) return;
    const path = [index];
    locateTableCells(table, path);
    const block = node.type === "table" ? tableBlockNode(table, [], "") : node;
    assertComplexTableDirective(block, path);
    tree.children[index] = block;
    usePipeGrid(table, path);
    if (table.headerRows === undefined) convertedToPipe.add(index);
    else complexTables = true;
  });
  // Normalize prose on the disposable write clone. Table notes are prose;
  // cells and figure/table captions have separate whitespace contracts.
  const normalizeStarts = (node: MystNode): void => {
    if (isFigure(node)) return;
    if (tableOf(node)) {
      tableNoteParagraphs(node).forEach(normalizeStarts);
      return;
    }
    if (node.type === "paragraph") {
      const content = projectInlineContent(node);
      let remaining = content ? paragraphLeadingSpaceLength(content) : 0;
      const trim = (items: MystNode[]): MystNode[] => items.flatMap(item => {
        if (!remaining) return [item];
        if (item.type === "text" && typeof item.value === "string") {
          const count = Math.min(remaining, item.value.length);
          remaining -= count;
          item.value = item.value.slice(count);
          return item.value ? [item] : [];
        }
        if (item.children) {
          item.children = trim(item.children);
          return item.children.length ? [item] : [];
        }
        return [item];
      });
      if (remaining) node.children = trim(node.children ?? []);
    } else node.children?.forEach(normalizeStarts);
  };
  tree.children.forEach(normalizeStarts);
  const originalIndex = new Map(tree.children.map((node, index) => [node, index]));
  tree.children = endnotePlacement(tree);
  const blockPaths = tree.children.map(node => [originalIndex.get(node)!]);
  const expected = semanticFingerprint(tree);
  tree.children = tree.children.map((node, index) => {
    try {
      const flow = { type: "root", children: [node.type === "table" ? tableBlockNode(node, [], "") : node] };
      const path = blockPaths[index];
      prepareReferences(flow, convertedToPipe.has(path[0]) ? path : undefined);
      return flow.children[0];
    }
    catch (error) {
      const issue = writeIssueOf(error);
      throw new DocumentWriteError(issue.reason, {
        code: issue.code ?? "invalid-reference", path: issue.path ?? blockPaths[index], action: "Review this reference or target and replace it with a supported reference or plain text.",
      }, { cause: error });
    }
  });
  const { prefix: frontMatter, minimal } = prepareWriter(tree, blockPaths, attempt, conventions);
  const file = new VFile();
  try {
    writeMd(file, tree as never, undefined, { handlers });
  } catch (error) {
    assertNoSerializationDiagnostics(file, document);
    throw new SemanticLossError("serializer failed", { code: "serialization-failed", cause: error,
      action: "Could not serialize this document. Keep your edits and report this error; no specific content cause was identified." });
  }
  assertNoSerializationDiagnostics(file, document);
  // Normalize the complete output, including preserved source, before semantic verification.
  const markdown = `${frontMatter}${String(file.result ?? "").trimEnd()}\n`.replace(/\r\n?/g, "\n");
  const result = previous?.markdown === markdown ? previous : parsedRoundTrip(markdown, complexTables, document.children[0]?.[FRONT_MATTER_FIELD] === true);
  const difference = semanticDifferenceIssue(expected, result.fingerprint);
  if (difference) {
    const index = difference.blockIndex;
    const path = index === undefined ? undefined : blockPaths[index];
    if (path && convertedToPipe.has(path[0])) {
      const before = expected.children[index!].children.find(node => node.type === "table");
      const after = result.fingerprint.children[index!]?.children.find(node => node.type === "table");
      if (before) {
        for (const [row, entry] of before.children.entries()) {
          for (const [column, cell] of entry.children.entries()) {
            const readback = after?.children[row]?.children[column];
            if (!readback || semanticDifferenceIssue(cell, readback)) {
              throw new SemanticLossError("Cell content cannot be preserved in a pipe table", { path: [...path, row, column] });
            }
          }
        }
      }
    }
    throw refusal(new SemanticLossError(difference.reason, { path }), expected, result, blockPaths,
      literalBlocks(result, blockPaths, minimal));
  }
  // Same meaning is not enough for narrowed escapes: text must not read as citation shorthand,
  // which native admission rejects, or as other literal syntax, which reopening reports.
  const literal = literalBlocks(result, blockPaths, minimal);
  if (literal.length) {
    throw refusal(new SemanticLossError("text would read as literal syntax without its escapes", { path: [literal[0]] }),
      expected, result, blockPaths, literal);
  }
  return result;
}

/** Decide per Figure, before the document write, so an image whose URL or alt text would not
 * read back keeps `{figure}` without a document-wide retry. Local writes then get the same bytes. */
function keepsStandaloneImage(image: MystNode): boolean {
  let read: ReturnType<typeof standaloneImage>;
  try { read = standaloneImage(render({ type: "paragraph", children: [image] })); }
  catch { return false; }
  return read !== undefined && read.url === image.url && read.alt === (image.alt ?? "");
}

function parsedRoundTrip(markdown: string, complexTables: boolean, documentMetadata: boolean): RoundTrip {
  const reparsed = parse(markdown, { complexTables, documentMetadata });
  return { markdown, reparsed, fingerprint: semanticFingerprint(reparsed) };
}

/** Write one prepared flow node with myst-to-md. */
function render(value: MystNode, tablePipeAlign = true): string {
  const file = new VFile();
  writeMd(file, { type: "root", children: [value] } as never, undefined, { tablePipeAlign, handlers });
  assertNoSerializationDiagnostics(file);
  return String(file.result ?? "").trimEnd();
}

/** Adapt the MyST representation to the existing mdast writer, on the write-only clone.
 * The original fingerprint and the whole reparsed output still have to match. */
function prepareWriter(tree: MystDocument, blockPaths: number[][], { alternate, lineStarts }: Attempt, conventions: Conventions): Prepared {
  let prefix = "";
  // Blocks whose text is written with the narrowed escapes of minimal-escape.ts.
  const minimal = new Set<number>();
  const bracketBlocks = new Set<number>();
  // A table caption is written into its directive's line, not at a line start.
  const captions = new WeakSet<MystNode>();
  function visit(node: MystNode, index: number, parent?: MystNode, path: number[] = [], inLink = false, inCell = false): void {
    try { prepare(node, index, parent, path, inLink || node.type === "link", inCell || node.type === "tableCell"); }
    catch (error) {
      if (error instanceof DocumentWriteError) {
        if (!error.location.path?.length && path.length) error.location.path = path;
        throw error;
      }
      const issue = writeIssueOf(error);
      throw new DocumentWriteError(issue.reason, { code: issue.code, action: issue.action, path: issue.path ?? path,
        ...(issue.line ? { line: issue.line } : {}) }, { cause: error });
    }
  }
  function prepare(node: MystNode, index: number, parent: MystNode | undefined, path: number[], inLink: boolean, inCell: boolean): void {
    if (inCell && node.type === "break") {
      node.type = "html";
      node.value = "<br>";
    }
    // Reference/inline writer adaptations change caption leaves, not the Figure's content kind.
    const figureKind = isFigure(node) ? figureContentKind(node) : undefined;
    const mermaidFigure = figureKind === "mermaid";
    const useConvention = !conventions.skip?.has(path[0]);
    const alert = useConvention && parent === tree && node.type === "admonition" &&
      node.children?.length === 1 && node.children[0].type === "paragraph" ? githubAlertTag(node.kind) : undefined;
    const tableCaption = tableCaptionParagraph(node);
    if (tableCaption) captions.add(tableCaption);
    if (parent === tree && holdsAt(node)) bracketBlocks.add(path[0]);
    if (useConvention && markMinimalEscape(node, bracketBlocks.has(path[0]))) {
      minimal.add(path[0]);
      conventions.attempted?.add(path[0]);
    }
    // Lifted roles can lack positions; diagnostics still identify their containing block.
    node.position ??= parent?.position;
    if (node[FRONT_MATTER_FIELD] !== undefined) {
      if (parent !== tree || index !== 0 || node[FRONT_MATTER_FIELD] !== true) {
        throw new SemanticLossError(`Block ${index + 1}: front matter must be closed and remain at the start of the document`, {
          code: "native-metadata", path, action: "Close the front matter with --- and keep it at the start of the file, then Reload." });
      }
      if (node[IMPLICIT_FRONT_MATTER] !== true) {
        const yaml = String(node.value ?? "");
        prefix = `---\n${yaml}${yaml && !yaml.endsWith("\n") ? "\n" : ""}---\n\n`;
      }
    }
    // A leading dash divider would be parsed as the start of YAML frontmatter.
    if (node.type === "thematicBreak" && parent === tree && index === 1 &&
        tree.children[0]?.[IMPLICIT_FRONT_MATTER] === true) {
      node.type = "html";
      node.value = "***";
    }
    // myst-to-md chooses its image directive by key presence, even for undefined
    // attributes emitted by myst-parser. Absent values must stay absent.
    for (const key of Object.keys(node)) if (node[key] === undefined) delete node[key];
    if (node.type === "code" && node.meta !== undefined) {
      const block = supportedCodeBlock(node);
      if (block?.meta !== undefined) {
        node.type = "html"; // Emit the already-validated fence verbatim on the write clone.
        node.value = writeCodeFence(block.language, block.code, block.meta);
        return;
      }
    }
    // MyST puts alignment on each cell; mdast-util-gfm-table expects columns on the table.
    // Nonuniform or unrepresentable alignment still fails the full fingerprint check.
    if (node.type === "table" && node.children?.[0]?.children?.some(cell => cell.align !== undefined)) {
      node.align = node.children[0].children.map(cell => cell.align ?? null);
    }
    // Do this before inline math becomes raw dollar output, and only on the write clone.
    if (node.type === "tableCell") escapeTableCodeAndMath(node);
    // Before escaping: text after an encoded boundary character starts its own context,
    // so a following `@` or `$` is judged where MyST will read it.
    if (node.children?.some(child => child.type === "strong" || child.type === "emphasis")) {
      node.children = encodeEmphasisBoundaries(node.children, alternate);
    }
    // myst-to-md does not protect literal dollars or citation-triggering @ text.
    // The writer emits these escaped `html` values verbatim.
    if (node.children?.some(child => child.type === "text" && /[$@]/.test(String(child.value)))) {
      node.children = node.children.flatMap(child => child.type === "text" ? escapeText(child, inLink, useConvention) : [child]);
    }
    // myst-to-md writes inline math as the `{math}` role; write MyST's usual `$...$`.
    if (node.children?.some(child => child.type === "inlineMath")) {
      node.children = node.children.map((child, index, siblings) => isDollarMath(child, siblings[index - 1], siblings[index + 1])
        ? { type: "html", value: `$${child.value}$` } : child);
    }
    node.children?.forEach((child, childIndex) => {
      if (child.type !== "table" || child.headerRows === undefined) {
        visit(child, childIndex, node, node === tree ? blockPaths[childIndex] : [...path, childIndex], inLink, inCell);
      }
    });
    if (node.type === "list") {
      const items = node.children ?? [];
      // Prefer sibling spacing to optional paragraph-to-sublist gaps. The original
      // spread flags remain available when this block needs the other spelling.
      if (useConvention && items.length > 1) {
        const optionalGaps = items.filter(item => item.spread && item.children?.length === 2 &&
          item.children[0].type === "paragraph" && item.children[1].type === "list" && !nestedListNeedsBlank(item));
        if (optionalGaps.length) {
          node.spread = true;
          for (const item of optionalGaps) item.spread = false;
          conventions.attempted?.add(path[0]);
        }
      }
      // The upstream writer drops checked. Emit a checkbox before the prepared
      // inline content, or by itself for an empty item. The pinned reader needs tight spacing.
      for (const item of items) {
        if (typeof item.checked !== "boolean") continue;
        item.spread = false;
        const marker = item.checked ? "[x]" : "[ ]";
        const paragraph = item.children?.[0];
        if (paragraph?.type === "paragraph") paragraph.children = [{ type: "html", value: `${marker} ` }, ...(paragraph.children ?? [])];
        else item.children = [{ type: "paragraph", children: [{ type: "html", value: marker }] }, ...(item.children ?? [])];
        delete item.checked;
      }
    }
    // After the inline content is prepared, so its remaining text is final.
    if (lineStarts && node.type === "paragraph" && !captions.has(node) && node.children) {
      node.children = encodeLineStarts(node.children, true);
    }
    if (useConvention && node.type === "delete") {
      node.type = "gfmDelete";
      conventions.attempted?.add(path[0]);
    }
    if (alert) {
      const quote = render({ type: "blockquote", children: node.children });
      node.type = "html";
      node.value = `> [!${alert}]\n${quote}`;
      delete node.kind;
      delete node.children;
      conventions.attempted?.add(path[0]);
      return;
    }
    if (useConvention && parent === tree && figureKind === "image" && node.children?.length === 1 &&
        node.children[0].url && Object.keys(node).every(key => ["type", "kind", "children", "position"].includes(key)) &&
        Object.keys(node.children[0]).every(key => ["type", "url", "alt", "position"].includes(key)) &&
        keepsStandaloneImage(node.children[0])) {
      node.type = "paragraph";
      delete node.kind;
      conventions.attempted?.add(path[0]);
      return;
    }
    // MyST requires a body in {math}; dollar fences also preserve an empty equation
    // and its optional closing-line label. The full fingerprint still guards the label.
    if (node.type === "math" && node.enumerator !== undefined && !String(node.value ?? "").trim()) {
      throw new DocumentWriteError("A fixed number cannot be represented on an empty equation in MyST. Enter equation content or clear the fixed number.", {
        code: "fixed-number-unrepresentable", path, action: "Enter equation content or clear the fixed number.",
      });
    }
    // The pinned upstream writer omits enumerator on image Figures and math. Reuse its
    // complete directive output and add only the standard option on the write clone.
    if ((node.enumerator !== undefined || node.enumerated !== undefined) && (node.type === "math" || figureKind === "image")) {
      const enumerator = node.enumerator, enumerated = node.enumerated;
      delete node.enumerator;
      delete node.enumerated;
      const source = render(node);
      const newline = source.indexOf("\n");
      node.type = "html";
      node.value = `${source.slice(0, newline)}${enumerator !== undefined ? `\n:enumerator: ${enumerator}` : ""}${enumerated !== undefined ? `\n:enumerated: ${enumerated}` : ""}${source.slice(newline)}`;
      delete node.children;
    }
    if (node.type === "math" && node.value === "") {
      const source = `$$\n$$${node.label ? ` (${node.label})` : ""}`;
      if (node.label) {
        const reloaded = parse(`${source}\n`).children[0];
        if (reloaded?.type !== "math" || reloaded.value !== "" || reloaded.label !== node.label || reloaded.identifier !== node.identifier) {
          throw new DocumentWriteError("This empty equation's label cannot be preserved in MyST dollar math.", {
            code: "invalid-label", path, action: "Enter equation content, remove the label, or use a label without spaces, closing parentheses or dollar signs.",
          });
        }
      }
      node.type = "html";
      node.value = source;
    } else if (node.type === "math" && typeof node.value === "string" &&
        Object.keys(node).every(key => key === "type" || key === "value" || key === "position")) {
      const source = `$$\n${node.value}\n$$`;
      // A blank line or an early closing fence in LaTeX can end dollar math.
      const tokens = writerTokenizer.parse(source, {});
      if (tokens.length === 1 && tokens[0].type === "math_block" && tokens[0].content === node.value) {
        node.type = "html";
        node.value = source;
      }
    }
    if (node.type === "admonition" && node.children?.length === 0) {
      node.type = "html";
      node.value = `:::{${node.kind}}\n:::`;
      delete node.children;
    }
    // Core chooses the grid and writes the shared directive wrapper.
    if (isTableDirective(node)) {
      const caption = tableCaptionParagraph(node);
      const table = tableOf(node)!;
      if (table.headerRows === undefined && node.children!.length === 1 &&
          node.label === undefined && node.identifier === undefined &&
          node.enumerator === undefined && node.enumerated === undefined) {
        const lines = render(table, false).split("\n");
        // The unpadded writer emits one hyphen per delimiter cell. Keep three
        // for GitHub's documented table syntax, preserving alignment colons.
        lines[1] = lines[1].replaceAll("-", "---");
        node.type = "html";
        node.value = lines.join("\n");
        delete node.children;
        return;
      }
      const grid = table.headerRows === undefined ? render(table) : writeTableHtml(table, path);
      const body = [grid, ...tableNoteParagraphs(node).map(note => render(note))].join("\n\n");
      const title = caption ? render(caption) : "";
      if (/[\r\n]/.test(title)) throw new SemanticLossError("table caption must fit on one line", { code: "line-break", path,
        action: "Remove line breaks from the table caption." });
      const fence = ":".repeat(Math.max(3, ...[...body.matchAll(/^(:{3,})/gm)].map(match => match[1].length + 1)));
      node.type = "html";
      node.value = `${fence}{table}${title ? ` ${title}` : ""}\n${node.label ? `:name: ${node.label}\n` : ""}${node.enumerator !== undefined ? `:enumerator: ${node.enumerator}\n` : ""}${node.enumerated !== undefined ? `:enumerated: ${node.enumerated}\n` : ""}\n${body}\n${fence}`;
      delete node.children;
    }
    // Write the supported Mermaid shape ourselves; upstream's Figure writer assumes an image.
    // Select both fences from the complete body; raw source is never parsed as Markdown here.
    if (mermaidFigure) {
      const source = node.children![0].value as string;
      const caption = (node.children ?? []).filter(child => child.type === "caption")
        .flatMap(child => child.children ?? []).map(paragraph => render(paragraph)).join("\n\n");
      const codeFence = "`".repeat(Math.max(3, ...[...source.matchAll(/`+/g)].map(match => match[0].length + 1)));
      const body = `${codeFence}{mermaid}\n${source}\n${codeFence}${caption ? `\n\n${caption}` : ""}`;
      const fence = ":".repeat(Math.max(3, ...[...body.matchAll(/^ *(:{3,})/gm)].map(match => match[1].length + 1)));
      node.type = "html";
      node.value = `${fence}{figure}\n${node.label ? `:name: ${node.label}\n` : ""}${node.enumerator !== undefined ? `:enumerator: ${node.enumerator}\n` : ""}${node.enumerated !== undefined ? `:enumerated: ${node.enumerated}\n` : ""}\n${body}\n${fence}`;
      delete node.children;
    }
    // myst-to-md writes a Figure only from its image. A pending Figure (no content, at most its
    // caption) is the same directive without an argument; MyST reads it back as the same
    // container. Only this shape is written here: a Figure with other content, a legend or
    // subfigures still goes to myst-to-md and fails closed. The full guard still applies.
    if (isFigure(node) && !node.subcontainer && (node.children ?? []).length <= 1 &&
        (node.children ?? []).every(child => child.type === "caption")) {
      const caption = (node.children ?? []).flatMap(child => child.children ?? []).map(paragraph => render(paragraph)).join("\n\n");
      const fence = ":".repeat(Math.max(3, ...[...caption.matchAll(/^(:{3,})/gm)].map(match => match[1].length + 1)));
      node.type = "html";
      node.value = `${fence}{figure}\n${node.label ? `:name: ${node.label}\n` : ""}${node.enumerator !== undefined ? `:enumerator: ${node.enumerator}\n` : ""}${node.enumerated !== undefined ? `:enumerated: ${node.enumerated}\n` : ""}${caption ? `\n${caption}\n` : ""}${fence}`;
      delete node.children;
    }
  }
  visit(tree, 0);
  if (tree.children[0]?.[FRONT_MATTER_FIELD] === true) tree.children.shift();
  return { prefix, minimal };
}

function escapeTableCodeAndMath(node: MystNode): void {
  // markdown-it's table splitter removes one backslash immediately before each pipe,
  // regardless of preceding backslashes. Add exactly one, retaining the authored value.
  // Text/link fields already use the upstream GFM escaping; MyST code/math bypass it.
  if ((node.type === "inlineCode" || node.type === "inlineMath") && typeof node.value === "string") {
    node.value = node.value.replaceAll("|", "\\|");
  }
  node.children?.forEach(escapeTableCodeAndMath);
}

/** Whether inline math can be written as `$...$`. The value must not hold `$` or end in a
 * backslash that would escape the closing `$`. The writer turns a line ending before an `html`
 * node into a space, so math right after a line break keeps the role. */
function isDollarMath(node: MystNode, previous: MystNode | undefined, next: MystNode | undefined): boolean {
  if (node.type !== "inlineMath" || typeof node.value !== "string" || !/^[^$\r\n]*[^$\r\n\\]$/.test(node.value) ||
      !Object.keys(node).every(key => key === "type" || key === "value" || key === "position") ||
      previous?.type === "break" || (previous?.type === "text" && /[\r\n]$/.test(String(previous.value)))) return false;
  const before = previous?.type === "text" ? String(previous.value).slice(-1) : "";
  const after = next?.type === "text" ? String(next.value).slice(0, 1) : "";
  // A preceding text backslash is escaped by the Markdown writer.
  const source = `${before === "\\" ? " " : before}$${node.value}$${after}`;
  const state = new writerTokenizer.inline.State(source, writerTokenizer, {}, []);
  state.pos = before.length;
  return mathRule(state, true);
}

/** Escape a literal `@` where the citation rule would read one, and a `$` where dollar math
 * would open; without `minimal` (a block written with upstream escapes) every `$`. */
function escapeText(text: MystNode, inLink: boolean, minimal: boolean): MystNode[] {
  const value = String(text.value);
  const state = new writerTokenizer.inline.State(value, writerTokenizer, {}, []);
  const result: MystNode[] = [];
  let start = 0;
  for (let index = 0; index < value.length; index++) {
    if (value[index] !== "$" && value[index] !== "@") continue;
    state.pos = index;
    if (value[index] === "@" && (inLink || !citationRule(state, true))) continue;
    if (value[index] === "$" && minimal && !mathRule(state, true)) continue;
    // mdast collapses a text node's trailing newline before raw inline output.
    // Keep that newline with the escaped @ so a soft line break stays text.
    const boundary = value[index] === "@" && index > start && value[index - 1] === "\n" ? index - 1 : index;
    if (boundary > start) result.push({ ...text, value: value.slice(start, boundary) });
    result.push({ type: "html", value: `${value.slice(boundary, index)}\\${value[index]}` });
    start = index + 1;
  }
  if (start < value.length) result.push({ ...text, value: value.slice(start) });
  return result;
}

/**
 * Canonical writeability preflight: why the canonical write path would refuse this
 * document, or undefined when it can write it. It runs the canonical write itself, so its verdict
 * and reason are those of Save and `format` for the same snapshot. Nothing is written and
 * the document is not changed (serialize works on a clone).
 */
export function canonicalWriteError(document: MystDocument): string | undefined {
  return canonicalWriteIssue(document)?.reason;
}

export function canonicalWriteIssue(document: MystDocument): WriteIssue | undefined {
  try {
    serialize(document);
    return undefined;
  } catch (error) {
    return writeIssueOf(error);
  }
}

/**
 * myst-to-md reports nodes it cannot render (rule `md-renders`) on the VFile,
 * writes an empty string for them and continues. In myst-to-md 1.0.17 every
 * message it emits means lost output, and supported documents emit none, so any
 * message rejects the write. Revisit this policy if a version adds harmless ones.
 */
function assertNoSerializationDiagnostics(file: VFile, document?: MystDocument): void {
  if (file.messages.length === 0) return;
  const reasons = [...new Set(file.messages.map((message) =>
    `${message.line ? `Line ${message.line}: ` : ""}${message.reason}`))];
  const line = file.messages[0]?.line;
  const index = line == null ? -1 : document?.children.findIndex(node =>
    node.position !== undefined && node.position.start.line <= line && node.position.end.line >= line) ?? -1;
  throw new SemanticLossError(reasons.join("; "), { code: "unsupported-content", ...(line ? { line } : {}), ...(index >= 0 ? { path: [index] } : {}) });
}
