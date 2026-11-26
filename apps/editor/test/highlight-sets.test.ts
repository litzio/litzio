import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { history, undoDepth } from "@tiptap/pm/history";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { editorExtensions } from "../src/editor-schema.tsx";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { highlightKey, highlightPlugin, highlightRanges, highlightRedraw, highlightSet, highlightWordAt } from "../src/highlight-decorations.ts";
import type { HighlightWord } from "../src/highlight-sets.ts";
import { toTiptapDocument } from "../src/tiptap-document.ts";
import { loadEditableDocument, nativeSource } from "./helpers/document.ts";

// Highlight sets (#2020). The store is this device's preference; the decorations are view-only like Find.
// Browser scenario highlight-sets covers the entry points, persistence across reload and other screens.
const memory = new Map<string, string>();
let refuse = false;
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { if (refuse) throw new Error("quota"); memory.set(key, value); },
  removeItem: (key: string) => memory.delete(key),
} });
const store = await import("../src/highlight-sets.ts");

const source = nativeSource([
  "# The system shall start",
  "It SHALL stop. Marshall and shallow are other words; shall-like is not one either.",
  "Users must wait. 위약금은 기한 안에 냅니다. 확인 필요 항목과 확인 항목.",
  "Inline $x$ math: sha$y$ll stays split, **sh**all joins across marks.",
  "```python\nshall = 1\n```",
  ":::{table} Caption shall\n:label: tbl-hl\n\n| Must cell | Other |\n| --- | --- |\n| One | Two |\n:::",
  "The API Key and api key differ.",
].join("\n\n") + "\n");
const words: HighlightWord[] = [
  { text: "shall", color: "blue" }, { text: "must", color: "blue" }, { text: "위약금", color: "red" },
  { text: "기한", color: "amber" }, { text: "확인 필요", color: "amber" }, { text: "확인", color: "gray" }, { text: "API Key", color: "violet" },
];

function editorState(getWords: () => readonly HighlightWord[] | null = () => words, text = source) {
  const extensions = editorExtensions();
  const schema = getSchema(extensions);
  const doc = schema.nodeFromJSON(toTiptapDocument(loadEditableDocument(text)));
  return EditorState.create({ schema, doc, plugins: [highlightPlugin(getWords), history()] });
}
const shown = (state: EditorState) => highlightKey.getState(state)!.decorations.find()
  .map(item => `${state.doc.textBetween(item.from, item.to)}:${(item as unknown as { type: { attrs: Record<string, string> } }).type.attrs["data-highlight"]}`);

test("English words match whole and in any case; Korean and phrases match letter for letter", () => {
  const texts = shown(editorState());
  assert.deepEqual(texts.filter(text => /^shall/i.test(text)), ["shall:blue", "SHALL:blue", "shall:blue", "shall:blue", "shall:blue"],
    "heading, upper case, before a hyphen, joined across a bold mark and in a table caption; not Marshall, shallow or code");
  assert.ok(texts.includes("Must:blue"), "table cells are text blocks too");
  assert.ok(texts.includes("위약금:red") && texts.includes("기한:amber"), "Korean matches inside a word with its particle");
  assert.deepEqual(texts.filter(text => text.startsWith("확인")), ["확인 필요:amber", "확인:gray"], "the longer phrase wins where both match");
  assert.deepEqual(texts.filter(text => /api/i.test(text)), ["API Key:violet"], "a phrase keeps its case");
  assert.ok(!texts.some(text => text.startsWith("sha$") || text === "sha"), "inline math interrupts a match");
  // The block menu names the set's word under the caret, as the set spells it.
  const state = editorState();
  let at = -1;
  state.doc.descendants((node, pos) => { if (at < 0 && node.isText && node.text!.includes("SHALL")) at = pos + node.text!.indexOf("SHALL"); });
  assert.equal(highlightWordAt(state, at + 2), "shall");
  assert.equal(highlightWordAt(state, at - 3), undefined);
  // Touching words: the word starting at a position wins, so the menu acts on the word under the pointer or caret.
  const touching = editorState(() => [{ text: "입력", color: "blue" }, { text: "전압", color: "red" }, { text: "must", color: "green" }, { text: "shall", color: "teal" }],
    nativeSource("입력전압을 재고 must-shall, shall.must 순서로 적는다.\n"));
  const textAt = (text: string) => {
    let found = -1;
    touching.doc.descendants((node, pos) => { if (found < 0 && node.isText && node.text!.includes(text)) found = pos + node.text!.indexOf(text); });
    return found;
  };
  const voltage = textAt("전압");
  assert.deepEqual([highlightWordAt(touching, voltage - 1), highlightWordAt(touching, voltage), highlightWordAt(touching, voltage + 2)],
    ["입력", "전압", "전압"], "inside 입력, at the start of 전압, and a caret just after 전압");
  const hyphen = textAt("must-shall"), period = textAt("shall.must");
  assert.deepEqual([highlightWordAt(touching, hyphen + 4), highlightWordAt(touching, hyphen + 5)], ["must", "shall"], "a hyphen between English words");
  assert.deepEqual([highlightWordAt(touching, period + 5), highlightWordAt(touching, period + 6)], ["shall", "must"], "a period between English words");
});

test("the per-node decoration tree is the one DecorationSet.create builds", () => {
  // highlightSet uses DecorationSet's tree constructor; a prosemirror-view upgrade must keep this equal.
  const { doc } = editorState();
  const ranges = highlightRanges(doc, words);
  const built = highlightSet(doc, ranges);
  const created = DecorationSet.create(doc, ranges.map(range => Decoration.inline(range.from, range.to, { "data-highlight": range.color })));
  const spans = (set: DecorationSet) => set.find().map(item => [item.from, item.to]);
  assert.deepEqual(spans(built), spans(created));
  doc.forEach((child, offset) => assert.deepEqual(spans(built.forChild(offset, child) as DecorationSet), spans(created.forChild(offset, child) as DecorationSet)));
});

test("decorations change no document, history or selection and follow a changed set", () => {
  let words2: readonly HighlightWord[] | null = words;
  const opening = editorState(() => words2);
  words2 = null;
  let state = opening.apply(highlightRedraw(opening.tr));
  assert.equal(state.doc, opening.doc);
  assert.equal(undoDepth(state), 0);
  assert.deepEqual(shown(state), [], "turning the set off removes every highlight");
  words2 = [{ text: "wait", color: "green" }];
  state = state.apply(highlightRedraw(state.tr));
  assert.deepEqual(shown(state), ["wait:green"]);
  assert.equal(undoDepth(state), 0);
});

test("edits rescan only what they touch and agree with a full scan", () => {
  let state = editorState();
  const at = (text: string) => {
    let found = -1;
    state.doc.descendants((node, pos) => { if (found < 0 && node.isText) { const index = node.text!.indexOf(text); if (index >= 0) found = pos + index; } });
    return found;
  };
  const edits: ((s: EditorState) => EditorState)[] = [
    s => s.apply(s.tr.insertText("x", at("shall start") + 5)), // breaks a word
    s => s.apply(s.tr.delete(at("x start"), at("x start") + 1)), // restores it
    s => s.apply(s.tr.insertText("must ", at("wait"))), // adds one
    s => s.apply(s.tr.setSelection(TextSelection.create(s.doc, at("Users"))).split(at("Users") + 6)), // splits a block
    s => s.apply(s.tr.insertText(" shall", at("api key") + 7)),
    s => { const from = at("It SHALL"); return s.apply(s.tr.join(from - 1)); }, // joins blocks
  ];
  for (const edit of edits) {
    state = edit(state);
    const expected = highlightRanges(state.doc, words).map(range => `${state.doc.textBetween(range.from, range.to)}:${range.color}`);
    assert.deepEqual(shown(state), expected);
  }
});

test("the store resolves a document's own choice before its folder default and forgets deleted sets", () => {
  const a = store.createHighlightSet(" Requirements ")!;
  const b = store.createHighlightSet("Contract")!;
  assert.equal(store.highlightState().sets.find(set => set.id === a)!.name, "Requirements");
  assert.equal(store.createHighlightSet("  "), null);
  store.setHighlightWord(a, "Shall", "blue");
  store.setHighlightWord(a, "SHALL", "green");
  store.setHighlightWord(a, " 해야 한다 ", "red");
  assert.deepEqual(store.highlightState().sets.find(set => set.id === a)!.words, [{ text: "Shall", color: "green" }, { text: "해야 한다", color: "red" }],
    "an English word is one entry in any case");
  assert.equal(store.setHighlightWord(a, "two\nlines", "blue"), false);

  assert.equal(store.activeHighlightSet("/docs/one.md"), null);
  store.setHighlightFolderDefault("/docs/one.md", a);
  assert.deepEqual([store.activeHighlightSet("/docs/two.md")?.set.id, store.activeHighlightSet("/docs/two.md")?.source], [a, "folder"]);
  assert.equal(store.activeHighlightSet("/docs/sub/three.md"), null, "a folder default covers that folder only");
  store.chooseHighlightSet("/docs/one.md", b);
  store.chooseHighlightSet("/docs/two.md", "off");
  assert.deepEqual(store.activeHighlightSet("/docs/one.md")?.set.id, b);
  assert.equal(store.activeHighlightSet("/docs/two.md"), null, "Off wins over the folder default");

  store.relocateHighlightChoice("/docs/one.md", "/docs/renamed.md");
  assert.equal(store.activeHighlightSet("/docs/renamed.md")?.set.id, b);
  store.deleteHighlightSet(b);
  assert.equal(store.activeHighlightSet("/docs/renamed.md")?.set.id, a, "a deleted choice falls back to the folder default");
  assert.ok(!Object.values(store.highlightState().documents).includes(b));

  const saved = store.parseHighlightState(JSON.parse(memory.get("litzio.highlightSets.v1")!));
  assert.deepEqual(saved, store.highlightState(), "a reload reads back the same state");
  assert.deepEqual(store.parseHighlightState({ sets: [{ id: "x", name: "X", words: [{ text: "a", color: "orange" }] }], documents: { "/d.md": "gone" } }),
    { sets: [{ id: "x", name: "X", words: [] }], documents: {}, folders: {} }, "unknown colors and sets are dropped");

  refuse = true;
  assert.equal(store.chooseHighlightSet("/docs/three.md", a), false, "a refused write is reported");
  assert.equal(store.activeHighlightSet("/docs/three.md")?.set.id, a, "and still applies");
  refuse = false;
});

test("a change from another window is kept by the next change here and shown on its storage event", () => {
  const key = "litzio.highlightSets.v1";
  const here = store.createHighlightSet("Here")!;
  // Another window then saves its own set; this page's copy does not have it yet.
  const theirs = JSON.parse(memory.get(key)!);
  theirs.sets.push({ id: "there", name: "There", words: [{ text: "shall", color: "red" }] });
  memory.set(key, JSON.stringify(theirs));
  store.setHighlightWord(here, "must", "green");
  const saved = store.parseHighlightState(JSON.parse(memory.get(key)!));
  assert.deepEqual(saved.sets.filter(set => ["here", "there"].includes(set.name.toLowerCase())).map(set => [set.name, set.words.map(word => word.text)]),
    [["Here", ["must"]], ["There", ["shall"]]], "neither window's set is lost");

  const unchanged = store.highlightState().sets.find(set => set.id === here)!;
  theirs.sets = saved.sets.map(set => (set.id === "there" ? { ...set, name: "Renamed there" } : set));
  memory.set(key, JSON.stringify(theirs));
  store.reloadHighlightSets();
  assert.equal(store.highlightState().sets.find(set => set.id === "there")!.name, "Renamed there");
  assert.equal(store.highlightState().sets.find(set => set.id === here), unchanged, "an unchanged set keeps its object, so editors do not rescan");
  // A malformed saved word is skipped rather than failing the page.
  assert.deepEqual(store.parseHighlightState({ sets: [{ id: "x", name: "X", words: [{ text: { toString: null }, color: "red" }] }] }).sets[0]!.words, []);
});
