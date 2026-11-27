import { closeHistory } from "@tiptap/pm/history";
import { paragraphInlineContent } from "@litzio/core";
import type { Mark } from "@tiptap/pm/model";
import { TextSelection, type EditorState } from "@tiptap/pm/state";
import { findMatches, keepRemainingMatches } from "./document-find.ts";
import { fromTiptapContent } from "./tiptap-inline.ts";

/** Replace the ranges the find bar actually highlights in the current Editor snapshot. */
export function replaceFoundText(state: EditorState, replacement: string, all: boolean) {
  const { matches, current } = findMatches(state);
  const targets = all ? matches : current < 0 ? [] : [matches[current]];
  const tr = closeHistory(state.tr);
  const touchedNotes = new Set<number>();
  let replaced = 0;
  for (const { from, to } of targets.toReversed()) {
    const start = state.doc.resolve(from);
    if (!start.sameParent(state.doc.resolve(to)) || !start.parent.isTextblock) return null;

    let marks: readonly Mark[] | undefined;
    let text = "";
    let containsAtom = false;
    start.parent.nodesBetween(start.parentOffset, to - start.start(), (node, pos) => {
      if (!node.isText) {
        containsAtom = true;
        return false;
      }
      text += node.text!.slice(Math.max(0, start.parentOffset - pos), to - start.start() - pos);
      marks = marks === undefined ? node.marks : marks.filter(mark => mark.isInSet(node.marks));
      return false;
    });
    if (containsAtom) return null;
    if (text === replacement) continue;
    if (start.parent.type.name === "tableNote") touchedNotes.add(start.before());
    if (replacement) tr.replaceWith(from, to, state.schema.text(replacement, marks));
    else tr.delete(from, to);
    replaced++;
  }
  for (const pos of touchedNotes) {
    const note = tr.doc.nodeAt(tr.mapping.map(pos));
    const content = fromTiptapContent({ type: "doc", content: [{ type: "paragraph", content: note?.content.toJSON() ?? [] }] });
    if (!paragraphInlineContent(content).length) return null;
  }
  if (!all && current >= 0) {
    const end = tr.mapping.map(matches[current].to);
    const remaining = matches.filter((_, index) => index !== current).map(({ from, to }) => ({
      from: tr.mapping.map(from, 1), to: tr.mapping.map(to, -1),
    }));
    keepRemainingMatches(tr, remaining);
    const next = remaining.find(match => match.from >= end) ?? remaining[0];
    const from = next?.from ?? end;
    const to = next?.to ?? end;
    tr.setSelection(TextSelection.create(tr.doc, from, to)).scrollIntoView();
  }
  return { tr, replaced };
}
