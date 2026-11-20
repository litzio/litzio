import { readMarkdownFragment, type EditableBlock, type FootnoteDefinition } from "@litzio/core";
import { Fragment, Slice, type Node as PMNode, type Schema } from "@tiptap/pm/model";
import { linkUrlsInNodes, type AutoLink } from "./pasted-url.ts";
import { toTiptapBlock, type TiptapJSON } from "./tiptap-document.ts";

export type MarkdownPaste = { slice: Slice; footnotes: FootnoteDefinition[] };

/**
 * Clipboard text that Core reads, as a whole, as formatted Markdown: editor content projected as
 * opening a document does. Core's open-document admission decides all or nothing; text it does
 * not read, or reads without Markdown syntax, returns undefined and keeps the engine's
 * plain-text paste. The engine fits the slice to the selection as it fits parsed HTML; the paste
 * plugin then closes its edges as for external HTML, so only a paragraph edge joins the text
 * around the selection. URLs become links as in any paste.
 *
 * The gate: when the converted content names a cross-reference target (a Figure, Table or
 * Equation label, a section label `(x)=`), cannot be built, or holds a node the editor's paste
 * does not carry (`accepts`), the conversion is given up here and the text keeps the plain-text
 * paste. A pasted label could collide with any target the document has, so it is never pasted
 * as formatting, and a paste never ends with nothing inserted.
 */
export function markdownPaste(schema: Schema, text: string, autoLink: AutoLink, accepts: (node: PMNode) => boolean,
  project: (block: EditableBlock) => TiptapJSON = toTiptapBlock): MarkdownPaste | undefined {
  try {
    const fragment = readMarkdownFragment(text);
    if (!fragment?.formatted || !fragment.blocks.length || fragment.blocks.some(namesTarget)) return undefined;
    const nodes = linkUrlsInNodes(fragment.blocks.map(block => schema.nodeFromJSON(project(block))), schema.marks.link!, autoLink);
    if (!nodes.every(accepts)) return undefined;
    return { slice: new Slice(Fragment.fromArray(nodes), 0, 0), footnotes: fragment.footnotes };
  } catch { return undefined; }
}

/** A block that is or carries an explicit cross-reference target: a section label, or a Figure,
 * Table or Equation label. */
function namesTarget(block: EditableBlock): boolean {
  return block.block === "target" || "label" in block && Boolean(block.label);
}
