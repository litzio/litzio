import { Extension } from "@tiptap/core";
import { TextSelection, type Command, type EditorState, type Transaction } from "@tiptap/pm/state";
import { SearchQuery, findNext, findPrev, getMatchHighlights, getSearchState, search, setSearchState } from "prosemirror-search";

/** Find in document (#1982): prosemirror-search owns matching, wrapping and the match decorations.
 * Matches are view decorations and the current match is the engine selection; the document,
 * its history and the save snapshot never change. */
export const DocumentFind = Extension.create({
  name: "documentFind",
  addProseMirrorPlugins: () => [search()],
});

export type FindOptions = { text: string; caseSensitive: boolean };

/** Plain text only: no regular expressions, whole words or escape sequences. */
function findQuery({ text, caseSensitive }: FindOptions): SearchQuery {
  return new SearchQuery({ search: text, caseSensitive, literal: true });
}

/** Show the matches of a new search text and make the first one at or after the selection current. */
export function findTransaction(state: EditorState, options: FindOptions): Transaction {
  const query = findQuery(options);
  const tr = setSearchState(state.tr, query);
  if (!query.valid) return tr;
  const from = state.selection.from;
  const match = query.findNext(state, from) ?? query.findNext(state, 0, from);
  return match ? tr.setSelection(TextSelection.create(state.doc, match.from, match.to)).scrollIntoView() : tr;
}

/** Next/previous match, wrapping at the document ends. */
export function findStep(direction: 1 | -1): Command {
  return direction > 0 ? findNext : findPrev;
}

/** Remove the highlights. The caret stays where the last current match starts. */
export function closeFindTransaction(state: EditorState): Transaction {
  const current = findMatches(state);
  const tr = setSearchState(state.tr, findQuery({ text: "", caseSensitive: false }));
  const match = current.current >= 0 ? current.matches[current.current] : undefined;
  return match ? tr.setSelection(TextSelection.create(state.doc, match.from)) : tr;
}

export function findActive(state: EditorState): boolean {
  return Boolean(getSearchState(state)?.query.valid);
}

/** All highlighted matches in document order and the index of the current one (-1 when none is current). */
export function findMatches(state: EditorState): { matches: { from: number; to: number }[]; current: number } {
  if (!findActive(state)) return { matches: [], current: -1 };
  const matches = getMatchHighlights(state).find().map(({ from, to }) => ({ from, to })).sort((a, b) => a.from - b.from);
  const { from, to } = state.selection;
  return { matches, current: matches.findIndex(match => match.from === from && match.to === to) };
}

/** A non-empty single-line text selection becomes the search text when Find opens. */
export function selectedFindText(state: EditorState): string {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || selection.empty) return "";
  const text = state.doc.textBetween(selection.from, selection.to, "\n", "\n");
  return text.includes("\n") ? "" : text;
}
