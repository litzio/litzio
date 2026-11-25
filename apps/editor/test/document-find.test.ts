import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { history, undoDepth } from "@tiptap/pm/history";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { editorDocumentJSON, editorExtensions } from "../src/editor-schema.tsx";
import { closeFindTransaction, findMatches, findStep, findTransaction, selectedFindText } from "../src/document-find.ts";
import { DocumentFind } from "../src/document-find.ts";
import { appliedDocument, toTiptapDocument } from "../src/tiptap-document.ts";
import { loadEditableDocument, nativeSource } from "./helpers/document.ts";

// Find (#1982) reuses prosemirror-search. These cases pin what Litzio relies on: which document
// text it reaches, case handling, wrapping, and that finding never edits the document.
// Browser scenario document-find covers keys, focus, scrolling and the two views.
const source = nativeSource([
  "# Heading alpha",
  "Paragraph bravo with $x^2$ math.",
  "- List charlie",
  ":::{table} Caption delta\n:label: tbl-find\n\n| Cell echo | Other |\n| --- | --- |\n| One | Two |\n\nNote foxtrot\n:::",
  ":::{note}\nCallout golf\n:::",
  "Claim[^n].",
  "```python\ncode_hotel = 1\n```",
  "```{math}\n:label: eq-find\n\nindia + 1\n```",
  ":::{figure} ./diagram.svg\n:name: fig-find\n\nFigure kilo\n:::",
  "Paragraph BRAVO again.",
  "[^n]: Endnote juliet.",
].join("\n\n") + "\n");

function editorState() {
  const extensions = editorExtensions();
  const schema = getSchema(extensions);
  const doc = schema.nodeFromJSON(toTiptapDocument(loadEditableDocument(source)));
  const plugins = DocumentFind.config.addProseMirrorPlugins!.call({} as never) as EditorState["plugins"];
  return EditorState.create({ schema, doc, plugins: [...plugins, history()] });
}

const find = (state: EditorState, text: string, caseSensitive = false) => state.apply(findTransaction(state, { text, caseSensitive }));
const step = (state: EditorState, direction: 1 | -1) => {
  let next = state;
  assert.equal(findStep(direction)(state, tr => { next = state.apply(tr); }), true);
  return next;
};
const current = (state: EditorState) => {
  const { matches, current } = findMatches(state);
  return current < 0 ? "" : state.doc.textBetween(matches[current]!.from, matches[current]!.to);
};

test("find reaches document text in every text block kind, not math source or generated numbers", () => {
  const state = editorState();
  for (const word of ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "juliet", "kilo"]) {
    assert.ok(findMatches(find(state, word)).matches.length > 0, `${word} is found`);
  }
  // Equation LaTeX and inline math are rendered atoms, and table/heading numbers are generated display.
  for (const text of ["india", "x^2", "Table 1"]) assert.equal(findMatches(find(state, text)).matches.length, 0, `${text} is not document text`);
});

test("find ignores case unless asked, wraps both ways and starts at the selection", () => {
  let state = editorState();
  assert.equal(findMatches(find(state, "bravo")).matches.length, 2);
  assert.equal(findMatches(find(state, "bravo", true)).matches.length, 1);
  state = find(state, "bravo");
  assert.equal(findMatches(state).current, 0);
  state = step(state, 1);
  assert.deepEqual([findMatches(state).current, current(state)], [1, "BRAVO"]);
  state = step(state, 1);
  assert.equal(findMatches(state).current, 0, "Next wraps to the first match");
  state = step(state, -1);
  assert.equal(findMatches(state).current, 1, "Previous wraps to the last match");
  // A changed search text starts from the current match, not from the document start.
  state = find(state, "brav");
  assert.deepEqual([findMatches(state).current, current(state)], [1, "BRAV"]);
  assert.equal(findMatches(find(state, "zulu")).matches.length, 0);
});

test("find and close leave the document, history and save snapshot unchanged and keep the caret at the match", () => {
  const opening = editorState();
  let state = step(step(find(opening, "bravo"), 1), -1);
  const match = findMatches(state).matches[findMatches(state).current]!;
  state = state.apply(closeFindTransaction(state));
  assert.equal(state.doc, opening.doc);
  assert.deepEqual(appliedDocument(editorDocumentJSON(state)), appliedDocument(editorDocumentJSON(opening)));
  assert.equal(undoDepth(state), 0);
  assert.deepEqual(findMatches(state).matches, [], "closing removes the highlights");
  assert.ok(state.selection.empty && state.selection.from === match.from);
});

test("a single-line selection seeds the search text", () => {
  const state = editorState();
  const start = findMatches(find(state, "Heading alpha")).matches[0]!;
  assert.equal(selectedFindText(state.apply(state.tr.setSelection(TextSelection.create(state.doc, start.from, start.to)))), "Heading alpha");
  const across = TextSelection.create(state.doc, start.from, findMatches(find(state, "bravo")).matches[0]!.to);
  assert.equal(selectedFindText(state.apply(state.tr.setSelection(across))), "", "a selection across blocks is not a search text");
});
