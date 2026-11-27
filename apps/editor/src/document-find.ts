import { Extension } from "@tiptap/core";
import { literalSearchPattern } from "@litzio/core";
import { Plugin, PluginKey, TextSelection, type Command, type EditorState, type Transaction } from "@tiptap/pm/state";
import { SearchQuery, getMatchHighlights, getSearchState, search, setSearchState } from "prosemirror-search";

type Match = { from: number; to: number };
const remainingMatchesKey = new PluginKey<ReadonlyMap<number, number> | null>("remainingReplacementMatches");
const remainingMatches = new Plugin<ReadonlyMap<number, number> | null>({
  key: remainingMatchesKey,
  state: {
    init: () => null,
    apply(tr, previous) {
      const remaining = tr.getMeta(remainingMatchesKey) as ReadonlyMap<number, number> | null | undefined;
      return remaining !== undefined ? remaining : tr.docChanged ? null : previous;
    },
  },
});

/** Keep only the original unprocessed ranges until the query or document changes. */
export function keepRemainingMatches(tr: Transaction, matches: Match[]): void {
  tr.setMeta(remainingMatchesKey, new Map(matches.map(({ from, to }) => [from, to])));
}

/** Find in document (#1982): prosemirror-search owns matching, wrapping and the match decorations.
 * Matches are view decorations and the current match is the engine selection; the document,
 * its history and the save snapshot never change. */
export const DocumentFind = Extension.create({
  name: "documentFind",
  addProseMirrorPlugins: () => [remainingMatches, search()],
});

export type FindOptions = { text: string; caseSensitive: boolean };

/** Plain text only: no regular expressions, whole words or escape sequences. */
function findQuery({ text, caseSensitive }: FindOptions, respectRemaining = true): SearchQuery {
  // StringQuery lowercases the whole block and then uses the folded offsets in the
  // original document. An expanding fold (e.g. İ) can move a highlight onto other text.
  return new SearchQuery({ search: caseSensitive ? text : literalSearchPattern(text),
    caseSensitive, regexp: !caseSensitive, literal: true,
    // The library represents inline atoms with U+FFFC while scanning.
    filter: (state, result) => {
      const remaining = respectRemaining ? remainingMatchesKey.getState(state) : null;
      return (!remaining || remaining.get(result.from) === result.to) &&
        (!text.includes("\ufffc") || state.doc.textBetween(result.from, result.to).length === result.to - result.from);
    },
  });
}

/** Show the matches of a new search text and make the first one at or after the selection current. */
export function findTransaction(state: EditorState, options: FindOptions): Transaction {
  const query = findQuery(options);
  const tr = setSearchState(state.tr.setMeta(remainingMatchesKey, null), query);
  if (!query.valid) return tr;
  // Search from the document start, as the highlight pass does, so a candidate
  // overlapping an earlier match cannot displace that match.
  const initial = findQuery(options, false);
  const first = initial.findNext(state);
  let match = first;
  while (match && match.from < state.selection.from) match = initial.findNext(state, match.to);
  match ??= first;
  return match ? tr.setSelection(TextSelection.create(state.doc, match.from, match.to)).scrollIntoView() : tr;
}

/** Next/previous match, wrapping at the document ends. */
export function findStep(direction: 1 | -1): Command {
  return (state, dispatch) => {
    const { matches, current } = findMatches(state);
    if (!matches.length) return false;
    const next = current >= 0 ? matches[(current + direction + matches.length) % matches.length]
      : direction > 0 ? matches.find(match => match.from >= state.selection.to) ?? matches[0]
        : matches.findLast(match => match.to <= state.selection.from) ?? matches.at(-1)!;
    dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, next.from, next.to)).scrollIntoView());
    return true;
  };
}

/** Remove the highlights. The caret stays where the last current match starts. */
export function closeFindTransaction(state: EditorState): Transaction {
  const current = findMatches(state);
  const tr = setSearchState(state.tr.setMeta(remainingMatchesKey, null), findQuery({ text: "", caseSensitive: false }));
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
