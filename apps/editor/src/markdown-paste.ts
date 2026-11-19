import { readMarkdownFragment, type FootnoteDefinition } from "@litzio/core";
import { Fragment, Slice, type Schema } from "@tiptap/pm/model";
import { toTiptapBlock } from "./tiptap-document.ts";

export type MarkdownPaste = { slice: Slice; footnotes: FootnoteDefinition[]; literal: boolean };

/**
 * Clipboard text that Core reads as formatted Markdown, as editor content. Core's open-document
 * parser and native admission decide the blocks; this only projects them as opening a document
 * does. Text without Markdown formatting returns undefined and keeps the engine's plain-text paste.
 * The engine fits the slice to the selection as it fits parsed HTML; the paste plugin then closes
 * its edges as for external HTML, so only a paragraph edge joins the text around the selection.
 */
export function markdownPaste(schema: Schema, text: string): MarkdownPaste | undefined {
  let fragment;
  try { fragment = readMarkdownFragment(text); } catch { return undefined; }
  if (!fragment.formatted || !fragment.blocks.length) return undefined;
  return {
    slice: new Slice(Fragment.fromArray(fragment.blocks.map(block => schema.nodeFromJSON(toTiptapBlock(block)))), 0, 0),
    footnotes: fragment.footnotes,
    literal: fragment.literal > 0,
  };
}
