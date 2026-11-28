import { createTokenizer } from "myst-parser";
import { getEditableDocument, type EditableBlock } from "../editable.ts";
import { projectInlineContent, type InlineContent } from "../inline.ts";
import type { FootnoteDefinition } from "../operations.ts";
import { parseNativeDocument } from "./native.ts";
import { OPTIONS } from "./parse.ts";
import type { MystNode } from "./tree.ts";

/** Markdown read as the whole body of a native document. */
export type MarkdownFragment = {
  /** Body blocks in source order. */
  blocks: EditableBlock[];
  /** Endnote definitions the body references, for the caller's label-collision plan. */
  footnotes: FootnoteDefinition[];
  /** Whether a block uses Markdown formatting beyond plain paragraphs. Indented code and hard
   * line breaks do not count: plain text indented by four spaces, or with trailing spaces, is
   * not evidence that the author wrote Markdown. */
  formatted: boolean;
};

const NATIVE_PREFIX = "---\n{}\n---\n\n";
const FENCE = /^ {0,3}(?:`{3,}|~{3,})/;

/**
 * Source the parse consumes without leaving editable content: link reference definitions
 * (markdown-it records every one in `env.references`, also inside quotes, lists and directive
 * bodies), MyST comments (`% …` lines, `comment` nodes) and block breaks (`+++`, `block`
 * nodes). None of it can be kept as editable text.
 */
const CONSUMING_NODES = new Set(["comment", "block"]);
const tokenizer = createTokenizer(OPTIONS);

/**
 * Read Markdown (for example pasted text) as the whole body of a native document, through the
 * same admission and canonical round-trip as opening a document. All or nothing: undefined
 * when any of it is not native content or is source the parse consumes without editable
 * content, so the caller can keep the text as it is.
 */
export function readMarkdownFragment(markdown: string): MarkdownFragment | undefined {
  const source = NATIVE_PREFIX + markdown.replace(/\r\n?/g, "\n");
  let document;
  try { document = parseNativeDocument(source); } catch { return undefined; }
  const body = document.children.slice(1);
  if (consumesSource(source, body)) return undefined;
  const lines = source.split("\n");
  const blocks = getEditableDocument(document).blocks;
  return {
    blocks: blocks.filter(block => block.block !== "footnote"),
    footnotes: blocks.flatMap(block => block.block === "footnote" ? [{ label: block.label, content: block.content }] : []),
    formatted: body.some(node => formatting(node, lines)),
  };
}

/** Judged on the same source and parser options as the parse, so both read it alike. */
function consumesSource(source: string, body: MystNode[]): boolean {
  const env: { references?: Record<string, unknown> } = {};
  tokenizer.parse(source, env);
  if (Object.keys(env.references ?? {}).length) return true;
  const visit = (node: MystNode): boolean => CONSUMING_NODES.has(node.type) || (node.children ?? []).some(visit);
  return body.some(visit);
}

function formatting(node: MystNode, lines: string[]): boolean {
  if (node.type === "paragraph") return hasFormatting(projectInlineContent(node) ?? []);
  if (node.type === "code") {
    const start = node.position?.start.line;
    return start === undefined || FENCE.test(lines[start - 1] ?? "");
  }
  return true;
}

function hasFormatting(content: InlineContent[]): boolean {
  return content.some(item => item.kind !== "text" && item.kind !== "break");
}
