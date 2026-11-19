import { getEditableDocument, type EditableBlock } from "../editable.ts";
import { projectInlineContent, type InlineContent } from "../inline.ts";
import type { FootnoteDefinition } from "../operations.ts";
import { admitNativeDocument, supportedNativeBlock } from "./native.ts";
import { parse } from "./parse.ts";
import type { MystNode } from "./tree.ts";

/** A Markdown fragment read as the body of a native document. */
export type MarkdownFragment = {
  /** Body blocks in source order. Source native admission refuses arrives in its place as
   * literal paragraphs, one per non-blank source line. */
  blocks: EditableBlock[];
  /** Endnote definitions the kept body references, for the caller's label-collision plan. */
  footnotes: FootnoteDefinition[];
  /** Whether a kept block uses Markdown formatting beyond plain paragraphs. Indented code
   * and hard line breaks do not count: plain text indented by four spaces, or with trailing
   * spaces, is not evidence that the author wrote Markdown. */
  formatted: boolean;
  /** Source lines kept as literal paragraphs because native admission refuses their blocks. */
  literal: number;
  /** Indexes of `blocks` that are such literal source lines; a caller adds no meaning to them. */
  literalBlocks: number[];
};

const NATIVE_PREFIX = "---\nlitzio: 1\n---\n\n";
const PREFIX_LINES = 4;
const FENCE = /^ {0,3}(?:`{3,}|~{3,})/;
const FENCE_OPEN = /^ {0,3}(:{3,}|`{3,}|~{3,})/;

type Range = { start: number; end: number; known: boolean };

/**
 * Read Markdown (for example pasted text) with the parser and native admission that open a
 * document. Refused source is kept as literal text in its place rather than dropped, together
 * with the link reference definitions the parse consumed (kept links already carry their URL).
 * When the kept blocks still fail whole-document admission (labels, citations, canonical
 * write), every non-blank source line is kept as a literal paragraph.
 */
export function readMarkdownFragment(markdown: string): MarkdownFragment {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const document = parse(NATIVE_PREFIX + lines.join("\n"));
  const [frontMatter, ...body] = document.children;
  const ranges = sourceRanges(body, lines);
  const supported = body.map((node, index) => supportedNativeBlock(node, [index + 1]));
  const referenced = new Set<string>();
  body.forEach((node, index) => { if (supported[index] && node.type !== "footnoteDefinition") footnoteLabels(node, referenced); });
  const kept = body.map((node, index) => supported[index] && (node.type !== "footnoteDefinition" || referenced.has(String(node.label))));
  // Blocks without their own source position share one range; refuse them together.
  ranges.forEach((range, index) => {
    if (!range.known && !kept[index]) ranges.forEach((other, at) => { if (!other.known && other.start === range.start) kept[at] = false; });
  });
  const refused = kept.includes(false);
  const owner: ("kept" | "refused" | undefined)[] = lines.map(() => undefined);
  ranges.forEach((range, index) => {
    for (let line = range.start; line <= range.end; line++) if (owner[line] !== "kept") owner[line] = kept[index] ? "kept" : "refused";
  });
  const items: { line: number; node: MystNode; literal: boolean }[] = [];
  let formatted = false, literal = 0;
  body.forEach((node, index) => {
    if (!kept[index] || node.type === "footnoteDefinition") return;
    if (formatting(node, ranges[index]!, lines)) formatted = true;
    items.push({ line: ranges[index]!.start, node, literal: false });
  });
  // Lines no block owns are link definitions the parse consumed. They stay with refused text,
  // and stay when nothing else is kept, since then no kept link carries their URL.
  const keepUnowned = refused || !items.length;
  lines.forEach((text, line) => {
    if (!text.trim() || owner[line] === "kept" || owner[line] === undefined && !keepUnowned) return;
    literal += 1;
    items.push({ line, node: literalParagraph(text), literal: true });
  });
  items.sort((left, right) => left.line - right.line);
  const definitions = body.filter((node, index) => kept[index] && node.type === "footnoteDefinition");
  const accounted = everyLineExplained(lines, body, ranges, kept, new Set(items.flatMap(item => item.literal ? [item.line] : [])));
  document.children = [frontMatter!, ...items.map(item => item.node), ...definitions];
  let literalBlocks = items.flatMap((item, index) => item.literal ? [index] : []);
  try {
    if (!accounted) throw new Error("A source line is not explained by the kept blocks.");
    admitNativeDocument(document);
  } catch {
    document.children = [frontMatter!, ...lines.filter(line => line.trim()).map(literalParagraph)];
    literal = document.children.length - 1;
    literalBlocks = document.children.slice(1).map((_node, index) => index);
  }
  const blocks = getEditableDocument(document).blocks;
  return {
    blocks: blocks.filter(block => block.block !== "footnote"),
    footnotes: blocks.flatMap(block => block.block === "footnote" ? [{ label: block.label, content: block.content }] : []),
    formatted,
    literal,
    literalBlocks,
  };
}

const DEFINITION = /^ {0,3}\[(?!\^)[^\]]+\]:[ \t]*<?([^\s>]+)>?/;

/**
 * The last guard against losing pasted text: every non-blank source line must be inside a kept
 * block the parser located, a literal line, or a link definition whose destination a kept link
 * carries. A lifted directive's lines are a guess, so they count only when they read back as
 * that same block. Anything else sends the caller to the whole-literal fallback.
 */
function everyLineExplained(lines: string[], body: MystNode[], ranges: Range[], kept: boolean[], literalLines: Set<number>): boolean {
  const explained = lines.map((text, line) => !text.trim() || literalLines.has(line));
  for (const [index, node] of body.entries()) {
    if (!kept[index]) continue;
    const range = ranges[index]!;
    if (!range.known && !(fencedRange(lines, range) && readsBackAs(node, lines.slice(range.start, range.end + 1)))) return false;
    for (let line = range.start; line <= range.end; line++) explained[line] = true;
  }
  const urls = new Set<string>();
  body.forEach((node, index) => { if (kept[index]) linkUrls(node, urls); });
  let definition = false;
  for (const [line, text] of lines.entries()) {
    if (explained[line]) { definition = false; continue; }
    const destination = DEFINITION.exec(text)?.[1];
    if (destination !== undefined) definition = carried(destination, urls);
    // A line that is not a definition continues the one before it (a multi-line title).
    else if (!definition || !lines[line - 1]?.trim()) return false;
    if (!definition) return false;
  }
  return true;
}

/** A guessed range is exactly one fenced block: an opening fence line to its closing fence. */
function fencedRange(lines: string[], range: Range): boolean {
  const opener = FENCE_OPEN.exec(lines[range.start] ?? "")?.[1];
  return !!opener && range.end > range.start && closingFence(opener).test(lines[range.end] ?? "");
}

function closingFence(opener: string): RegExp {
  return new RegExp(`^ {0,3}${opener[0] === ":" ? ":" : `\\${opener[0]}`}{${opener.length},}[ \\t]*$`);
}

function readsBackAs(node: MystNode, source: string[]): boolean {
  const blocks = (tree: MystNode[]) => JSON.stringify(getEditableDocument({ type: "root", children: tree } as never).blocks, (key, value) => key === "path" ? undefined : value);
  try {
    const reread = parse(NATIVE_PREFIX + source.join("\n")).children.slice(1);
    return reread.length === 1 && blocks(reread) === blocks([node]);
  } catch { return false; }
}

function linkUrls(node: MystNode, urls: Set<string>): void {
  if (node.type === "link" && typeof node.url === "string") urls.add(node.url);
  node.children?.forEach(child => linkUrls(child, urls));
}

function carried(destination: string, urls: Set<string>): boolean {
  if (urls.has(destination)) return true;
  try { return urls.has(encodeURI(destination)) || [...urls].some(url => decodeURI(url) === destination); } catch { return false; }
}

/** Zero-based source lines of each body block. Lifted directives carry no position: one
 * starts at the first non-blank line after the previous body block and ends at its closing
 * fence (the same fence character, at least as long), or else before the next positioned
 * source. Endnote definitions always carry theirs, though the parse moves them after the body. */
function sourceRanges(body: MystNode[], lines: string[]): Range[] {
  const line = (value: number | undefined) => value === undefined ? undefined : value - PREFIX_LINES - 1;
  const starts = body.flatMap(node => line(node.position?.start.line) ?? []);
  let previousEnd = -1;
  let previousUnknown: Range | undefined;
  return body.map(node => {
    const start = line(node.position?.start.line), end = line(node.position?.end.line);
    if (start !== undefined && end !== undefined) {
      if (node.type !== "footnoteDefinition") { previousEnd = end; previousUnknown = undefined; }
      return { start, end, known: true };
    }
    const next = Math.min(lines.length, ...starts.filter(value => value > previousEnd));
    let first = previousEnd + 1;
    while (first < next && !lines[first]!.trim()) first++;
    // No lines left: the previous lifted block's range was a guess that took them; share it.
    if (first >= next && previousUnknown) return { ...previousUnknown };
    // Lines before the opening fence (a consumed link definition) belong to no block. A fence
    // opens a block only at a block start, not inside a definition's multi-line title.
    const fenced = lines.findIndex((text, at) => at >= first && at < next && FENCE_OPEN.test(text) && (at === first || !lines[at - 1]!.trim()));
    if (fenced >= 0) first = fenced;
    const opener = FENCE_OPEN.exec(lines[first] ?? "")?.[1];
    let close = next - 1;
    if (opener) {
      const closer = closingFence(opener);
      for (let at = first + 1; at < next; at++) if (closer.test(lines[at]!)) { close = at; break; }
    }
    previousEnd = close;
    previousUnknown = { start: first, end: close, known: false };
    return { ...previousUnknown };
  });
}

function literalParagraph(text: string): MystNode {
  return { type: "paragraph", children: [{ type: "text", value: text }] };
}

function footnoteLabels(node: MystNode, labels: Set<string>): void {
  if (node.type === "footnoteReference" && typeof node.label === "string") labels.add(node.label);
  node.children?.forEach(child => footnoteLabels(child, labels));
}

function formatting(node: MystNode, range: Range, lines: string[]): boolean {
  if (node.type === "paragraph") return hasFormatting(projectInlineContent(node) ?? []);
  if (node.type === "code" && range.known) return FENCE.test(lines[range.start] ?? "");
  return true;
}

function hasFormatting(content: InlineContent[]): boolean {
  return content.some(item => item.kind !== "text" && item.kind !== "break");
}
