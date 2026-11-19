import { readMarkdownFragment, type FootnoteDefinition } from "@litzio/core";
import { Fragment, Slice, type Schema } from "@tiptap/pm/model";
import { linkUrlsInNodes, type AutoLink } from "./pasted-url.ts";
import { toTiptapBlock } from "./tiptap-document.ts";

export type MarkdownPaste = { slice: Slice; footnotes: FootnoteDefinition[] };

/**
 * Clipboard text that Core reads, as a whole, as formatted Markdown: editor content projected as
 * opening a document does. Core's open-document admission decides all or nothing; text it does
 * not read, or reads without Markdown syntax, returns undefined and keeps the engine's
 * plain-text paste. The engine fits the slice to the selection as it fits parsed HTML; the paste
 * plugin then closes its edges as for external HTML, so only a paragraph edge joins the text
 * around the selection. URLs become links as in any paste.
 */
export function markdownPaste(schema: Schema, text: string, autoLink: AutoLink): MarkdownPaste | undefined {
  let fragment;
  try { fragment = readMarkdownFragment(text); } catch { return undefined; }
  if (!fragment?.formatted || !fragment.blocks.length) return undefined;
  const nodes = fragment.blocks.map(block => schema.nodeFromJSON(toTiptapBlock(block)));
  return {
    slice: new Slice(Fragment.fromArray(linkUrlsInNodes(nodes, schema.marks.link!, autoLink)), 0, 0),
    footnotes: fragment.footnotes,
  };
}
