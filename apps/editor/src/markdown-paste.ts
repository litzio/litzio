import { readMarkdownFragment, type FootnoteDefinition } from "@litzio/core";
import { Fragment, Slice, type Schema } from "@tiptap/pm/model";
import { linkUrlsInNodes, type AutoLink } from "./pasted-url.ts";
import { toTiptapBlock } from "./tiptap-document.ts";

export type MarkdownPaste = { slice: Slice; footnotes: FootnoteDefinition[]; literal: boolean };

/**
 * Clipboard text that Core reads as formatted Markdown, as editor content. Core's open-document
 * parser and native admission decide the blocks; this only projects them as opening a document
 * does. Text without Markdown syntax returns undefined and keeps the engine's plain-text paste.
 * The engine fits the slice to the selection as it fits parsed HTML; the paste plugin then closes
 * its edges as for external HTML, so only a paragraph edge joins the text around the selection.
 * URLs in kept text become links as in any paste; literal source lines stay exactly as written.
 */
export function markdownPaste(schema: Schema, text: string, autoLink: AutoLink): MarkdownPaste | undefined {
  let fragment;
  try { fragment = readMarkdownFragment(text); } catch { return undefined; }
  // Refused Markdown alone still takes this path, so its literal text comes with a notice.
  if (!fragment.formatted && !fragment.literal || !fragment.blocks.length) return undefined;
  const literal = new Set(fragment.literalBlocks);
  const nodes = fragment.blocks.map((block, index) => {
    const node = schema.nodeFromJSON(toTiptapBlock(block));
    return literal.has(index) ? node : linkUrlsInNodes([node], schema.marks.link!, autoLink)[0]!;
  });
  return {
    slice: new Slice(Fragment.fromArray(nodes), 0, 0),
    footnotes: fragment.footnotes,
    literal: fragment.literal > 0,
  };
}
