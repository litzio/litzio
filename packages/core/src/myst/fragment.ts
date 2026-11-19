import { getEditableDocument, type EditableBlock } from "../editable.ts";
import { projectInlineContent, type InlineContent } from "../inline.ts";
import type { FootnoteDefinition } from "../operations.ts";
import { admitNativeDocument, supportedNativeBlock } from "./native.ts";
import { parse } from "./parse.ts";
import type { MystNode } from "./tree.ts";

/** A Markdown fragment read as the body of a native document. */
export type MarkdownFragment = {
  /** Body blocks in source order. A source block native admission refuses arrives as
   * literal paragraphs of its non-blank source lines. */
  blocks: EditableBlock[];
  /** Endnote definitions the body references, for the caller's label-collision plan. */
  footnotes: FootnoteDefinition[];
  /** Whether a kept block uses Markdown formatting beyond plain paragraphs. Indented code
   * and hard line breaks do not count: plain text indented by four spaces, or with trailing
   * spaces, is not evidence that the author wrote Markdown. */
  formatted: boolean;
  /** Source blocks kept as literal text because native admission refuses them. */
  literal: number;
};

const NATIVE_PREFIX = "---\nlitzio: 1\n---\n\n";
const PREFIX_LINES = 4;
const FENCE = /^ {0,3}(?:`{3,}|~{3,})/;

/**
 * Read Markdown (for example pasted text) with the parser and native admission that open a
 * document. Unsupported blocks are kept as literal text rather than dropped; when the kept
 * blocks still fail whole-document admission (labels, citations, canonical write), every
 * non-blank source line is kept as a literal paragraph.
 */
export function readMarkdownFragment(markdown: string): MarkdownFragment {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const document = parse(NATIVE_PREFIX + lines.join("\n"));
  const sourceLines = (node: MystNode): string[] => {
    const start = node.position?.start.line, end = node.position?.end.line;
    if (start === undefined || end === undefined) throw new Error("A parsed block has no source position.");
    return lines.slice(start - PREFIX_LINES - 1, end - PREFIX_LINES).filter(line => line.trim());
  };
  const [frontMatter, ...body] = document.children;
  let formatted = false, literal = 0;
  const referenced = new Set<string>();
  body.forEach((node, index) => { if (node.type !== "footnoteDefinition" && supportedNativeBlock(node, [index + 1])) footnoteLabels(node, referenced); });
  document.children = [frontMatter!, ...body.flatMap((node, index) => {
    if (supportedNativeBlock(node, [index + 1]) && (node.type !== "footnoteDefinition" || referenced.has(String(node.label)))) {
      if (formatting(node, lines)) formatted = true;
      return [node];
    }
    literal += 1;
    return sourceLines(node).map(literalParagraph);
  })];
  try {
    admitNativeDocument(document);
  } catch {
    // The parse may omit source (an unreferenced endnote definition), so read the lines, not the blocks.
    document.children = [frontMatter!, ...lines.filter(line => line.trim()).map(literalParagraph)];
    literal = Math.max(body.length, 1);
  }
  const blocks = getEditableDocument(document).blocks;
  return {
    blocks: blocks.filter(block => block.block !== "footnote"),
    footnotes: blocks.flatMap(block => block.block === "footnote" ? [{ label: block.label, content: block.content }] : []),
    formatted,
    literal,
  };
}

function literalParagraph(text: string): MystNode {
  return { type: "paragraph", children: [{ type: "text", value: text }] };
}

function footnoteLabels(node: MystNode, labels: Set<string>): void {
  if (node.type === "footnoteReference" && typeof node.label === "string") labels.add(node.label);
  node.children?.forEach(child => footnoteLabels(child, labels));
}

function formatting(node: MystNode, lines: string[]): boolean {
  if (node.type === "paragraph") return hasFormatting(projectInlineContent(node) ?? []);
  if (node.type === "code") return FENCE.test(lines[(node.position?.start.line ?? 0) - PREFIX_LINES - 1] ?? "");
  return true;
}

function hasFormatting(content: InlineContent[]): boolean {
  return content.some(item => item.kind !== "text" && item.kind !== "break");
}
