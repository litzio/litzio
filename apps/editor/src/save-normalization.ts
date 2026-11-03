import { inlineContentLength, paragraphInlineContent } from "@litzio/core";
import { closeHistory } from "@tiptap/pm/history";
import type { EditorState } from "@tiptap/pm/state";
import { fromTiptapContent } from "./tiptap-inline.ts";

/** Apply only Core's removed suffixes, leaving node identities, marks and history intact. */
export function normalizeSaveTails(state: EditorState) {
  const tr = closeHistory(state.tr);
  state.doc.descendants((node, pos, parent) => {
    if (!["paragraph", "quote", "admonition", "figure", "footnoteDefinition"].includes(node.type.name)) return;
    // Table cells have a separate single-line contract.
    if (parent?.type.name === "tableCell" || parent?.type.name === "tableHeader") return;
    let length: number;
    try {
      const content = fromTiptapContent({ type: "doc", content: [{ type: "paragraph", content: node.toJSON().content }] });
      length = inlineContentLength(paragraphInlineContent(content));
    } catch {
      // Cleanup is not admission: leave invalid input untouched for the existing
      // collector/Host refusal path and its diagnostics, without acknowledging it.
      return;
    }
    const from = pos + 1 + length, to = pos + 1 + node.content.size;
    if (from >= to) return;
    // Retain the active tail (or a selection touching it) while the user is writing there.
    if (state.selection.from <= to && state.selection.to > from) return;
    tr.delete(tr.mapping.map(from), tr.mapping.map(to));
  });
  return tr;
}
