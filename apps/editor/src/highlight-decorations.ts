import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { isEnglishWord, type HighlightColor, type HighlightWord } from "./highlight-sets.ts";

/**
 * Highlight sets (#2020) as view decorations, like Find (#1982): the document, dirty state, history,
 * save edit and recovery snapshot never change, and copy, print and Source never show them.
 * Edits rescan only the text blocks they touch; a set or choice change rescans the document.
 */
export const highlightKey = new PluginKey<HighlightPluginState>("highlightSets");
type HighlightPluginState = { words: readonly HighlightWord[] | null; decorations: DecorationSet };
export type HighlightRange = { from: number; to: number; color: HighlightColor; text: string };

type Matcher = { pattern: RegExp; english: Map<string, HighlightWord>; literal: Map<string, HighlightWord> };
const matchers = new WeakMap<readonly HighlightWord[], Matcher | null>();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

function matcherFor(words: readonly HighlightWord[]): Matcher | null {
  if (matchers.has(words)) return matchers.get(words)!;
  const english = new Map<string, HighlightWord>();
  const literal = new Map<string, HighlightWord>();
  for (const word of words) (isEnglishWord(word.text) ? english.set(word.text.toLowerCase(), word) : literal.set(word.text, word));
  // Longest first, so a phrase wins over a word it contains. Only English words ignore case.
  const parts = [...words].sort((a, b) => b.text.length - a.text.length).map(word => isEnglishWord(word.text)
    ? `(?<![A-Za-z0-9])(?i:${escape(word.text)})(?![A-Za-z0-9])` : escape(word.text));
  const matcher = parts.length ? { pattern: new RegExp(parts.join("|"), "gu"), english, literal } : null;
  matchers.set(words, matcher);
  return matcher;
}

/** Inline nodes other than text (math, references, citations, breaks) interrupt a match. */
function blockText(node: PmNode): string {
  let text = "";
  node.forEach(child => { text += child.isText ? child.text! : "￼".repeat(child.nodeSize); });
  return text;
}

function scanBlock(node: PmNode, pos: number, matcher: Matcher, found: HighlightRange[]): void {
  // Code keeps its syntax colors.
  if (node.type.spec.code) return;
  const text = blockText(node);
  for (const match of text.matchAll(matcher.pattern)) {
    const word = matcher.english.get(match[0].toLowerCase()) ?? matcher.literal.get(match[0]);
    if (!word) continue;
    const from = pos + 1 + match.index;
    found.push({ from, to: from + match[0].length, color: word.color, text: word.text });
  }
}

/** Every highlighted range of the document, in order. */
export function highlightRanges(doc: PmNode, words: readonly HighlightWord[] | null, from = 0, to = doc.content.size): HighlightRange[] {
  const matcher = words && matcherFor(words);
  const found: HighlightRange[] = [];
  if (!matcher) return found;
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    scanBlock(node, pos, matcher, found);
    return false;
  });
  return found;
}

const decoration = (range: HighlightRange, shift = 0) => Decoration.inline(range.from + shift, range.to + shift,
  { class: "highlight-word", "data-highlight": range.color, "data-highlight-word": range.text });

// DecorationSet's tree constructor: top-level local decorations and [from, to, subtree] triples.
type DecorationTree = new (local: Decoration[], children: (number | DecorationSet)[]) => DecorationSet;
/**
 * The same tree DecorationSet.create builds. create offers every decoration to every top-level node,
 * which takes about 300 ms for 34,000 highlights in 5,000 blocks; sorted ranges are split per node
 * here and each node's subtree still comes from create.
 */
export function highlightSet(doc: PmNode, ranges: readonly HighlightRange[]): DecorationSet {
  const children: (number | DecorationSet)[] = [];
  let next = 0;
  doc.forEach((child, offset) => {
    const end = offset + child.nodeSize;
    const own: Decoration[] = [];
    for (; next < ranges.length && ranges[next]!.from < end; next++) own.push(decoration(ranges[next]!, -(offset + 1)));
    const subtree = own.length ? DecorationSet.create(child, own) : DecorationSet.empty;
    if (subtree !== DecorationSet.empty) children.push(offset, end, subtree);
  });
  return children.length ? new (DecorationSet as unknown as DecorationTree)([], children) : DecorationSet.empty;
}

function fullState(doc: PmNode, words: readonly HighlightWord[] | null): HighlightPluginState {
  return { words, decorations: highlightSet(doc, highlightRanges(doc, words)) };
}

/** Text blocks the transaction changed, in the new document. */
function touchedBlocks(tr: Transaction): { from: number; to: number }[] {
  const size = tr.doc.content.size;
  const blocks = new Map<number, number>();
  tr.mapping.maps.forEach((map, index) => map.forEach((_oldStart, _oldEnd, start, end) => {
    const rest = tr.mapping.slice(index + 1);
    const from = Math.max(0, rest.map(start, -1) - 1), to = Math.min(size, rest.map(end, 1) + 1);
    tr.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true;
      blocks.set(pos, pos + node.nodeSize);
      return false;
    });
  }));
  return [...blocks].map(([from, to]) => ({ from, to }));
}

function applyHighlights(tr: Transaction, value: HighlightPluginState, getWords: () => readonly HighlightWord[] | null): HighlightPluginState {
  if (tr.getMeta(highlightKey)) {
    const words = getWords();
    if (words !== value.words) return fullState(tr.doc, words);
  }
  if (!tr.docChanged || !value.words) return value;
  let decorations = value.decorations.map(tr.mapping, tr.doc);
  for (const block of touchedBlocks(tr)) {
    decorations = decorations.remove(decorations.find(block.from, block.to))
      .add(tr.doc, highlightRanges(tr.doc, value.words, block.from, block.to).map(range => decoration(range)));
  }
  return { words: value.words, decorations };
}

/** `getWords` returns the active set's words (a new array whenever they change), or null. */
export function highlightPlugin(getWords: () => readonly HighlightWord[] | null): Plugin<HighlightPluginState> {
  return new Plugin<HighlightPluginState>({
    key: highlightKey,
    state: {
      init: (_, state) => fullState(state.doc, getWords()),
      apply: (tr, value) => applyHighlights(tr, value, getWords),
    },
    props: { decorations: state => highlightKey.getState(state)?.decorations },
  });
}

export const highlightExtension = (getWords: () => readonly HighlightWord[] | null) => Extension.create({
  name: "highlightSets",
  addProseMirrorPlugins: () => [highlightPlugin(getWords)],
});

/** Reread the active set without a history entry. */
export function highlightRedraw(tr: Transaction): Transaction {
  return tr.setMeta(highlightKey, true).setMeta("addToHistory", false);
}
