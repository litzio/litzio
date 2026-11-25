import { nativeSource } from "./helpers/document.ts";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { AllSelection, EditorState, NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { parse, serialize, type InlineContent } from "@litzio/core";
import { applyBlockShortcut, type BlockShortcut } from "../src/markdown-input-rules.ts";
import { addTableColumnRight, addTableRowBelow, BLOCK_COMMANDS, changeAdmonitionVariant, changeHeadingLevel, deleteBlock, headingToParagraph, insertDividerAfter, insertParagraphAfter, insertQuoteAfter, paragraphToHeading, paragraphToHeadingRejection, removeTableColumn, removeTableRow } from "../src/block-commands.ts";
import { editorDocumentJSON, editorExtensions, LOCKED_STRUCTURE_REJECTION, structureGuardPlugin } from "../src/editor-schema.tsx";
import { admitContentEdits, structuralEditKinds } from "../src/editor-save.ts";
import { joinRichProse, selectAllTransaction } from "../src/document-interaction.ts";
import { collectSupportedEdits, toTiptapDocument, type TiptapJSON } from "../src/tiptap-document.ts";
import { documentRevision, saveDocumentFile } from "../server/document-api.ts";
import { loadEditableDocument } from "./helpers/document.ts";
import { saveEdits } from "../server/document-replay.ts";

const source = nativeSource("# Structural blocks\n\n## Existing heading\n\nKeep this paragraph.\n");
const warningBody: InlineContent[] = [{ kind: "text", text: "Check current limit." }];

test("both boundary delete keys join a heading and prose with a line break into a paragraph", () => {
  const markdown = nativeSource("## Heading\n\n**Bold** and $x$\\\nnext.\n");
  const editable = loadEditableDocument(markdown);
  const baseline = toTiptapDocument(editable);
  const schema = getSchema(editorExtensions());
  const doc = schema.nodeFromJSON(baseline);
  for (const backward of [true, false]) {
    const state = EditorState.create({schema, doc,
      selection: TextSelection.create(doc, doc.child(0).nodeSize + (backward ? 1 : -1)),
      plugins: [structureGuardPlugin(baseline, () => assert.fail("representable join was rejected"))]});
    const tr = joinRichProse(state, backward);
    assert.ok(tr);
    const joined = state.applyTransaction(tr).state;
    const saved = saveEdits(markdown, collectSupportedEdits(editable, editorDocumentJSON(joined)));
    assert.equal(saved.markdown, nativeSource("Heading**Bold** and $x$\\\nnext.\n"));
    assert.equal(loadEditableDocument(saved.markdown).blocks[0].block, "paragraph");
  }
  // Formatted prose without line breaks joins into the heading by the engine's own join.
  const formatted = schema.nodeFromJSON(toTiptapDocument(loadEditableDocument(nativeSource("## Heading\n\n**Bold** and $x$.\n"))));
  assert.equal(joinRichProse(EditorState.create({ schema, doc: formatted,
    selection: TextSelection.create(formatted, formatted.child(0).nodeSize + 1) }), true), null);
});

function editorState(markdown: string) {
  const editable = loadEditableDocument(markdown);
  const projection = toTiptapDocument(editable);
  const schema = getSchema(editorExtensions());
  const state = EditorState.create({ schema, doc: schema.nodeFromJSON(projection) });
  return { editable, state };
}

function saveFile(file: string, markdown: string, edits: ReturnType<typeof collectSupportedEdits>) {
  return saveDocumentFile(file, { revision: documentRevision(markdown), ...edits });
}

test("new Warning survives Tiptap collection, Host file save and reload", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "litzio-editor-structural-warning-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, source);
  try {
    const { editable, state } = editorState(source);
    const warning = state.schema.nodeFromJSON({
      type: "admonition",
      attrs: { sourcePath: "new:warning", variant: "warning", text: "", editable: true },
      content: [{ type: "text", text: "Check current limit." }],
    });
    const insertAt = state.doc.child(0).nodeSize + state.doc.child(1).nodeSize;
    const changed = state.apply(state.tr.insert(insertAt, warning));
    const edits = collectSupportedEdits(editable, changed.doc.toJSON() as TiptapJSON);
    assert.deepEqual(edits.inserts, [{ block: "admonition", variant: "warning", content: warningBody }]);
    assert.ok(edits.order?.some((item) => "insert" in item));

    const saved = saveFile(file, source, edits);
    const disk = readFileSync(file, "utf8");
    assert.equal(disk, saved.markdown);
    assert.equal(disk, nativeSource([
      "# Structural blocks",
      "",
      "## Existing heading",
      "",
      ":::{warning}",
      "Check current limit.",
      ":::",
      "",
      "Keep this paragraph.",
      "",
    ].join("\n")));
    assert.equal(serialize(parse(disk)), disk);
    const reloaded = loadEditableDocument(disk).blocks;
    const admonition = reloaded.find((block) => block.block === "admonition");
    assert.equal(admonition?.block, "admonition");
    if (admonition?.block !== "admonition") return;
    assert.equal(admonition.variant, "warning");
    assert.deepEqual(admonition.content, warningBody);
    assert.deepEqual(reloaded.filter((block) => block.block === "heading").map((block) =>
      block.block === "heading" ? [block.level, block.text] : []), [
      [1, "Structural blocks"], [2, "Existing heading"],
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Heading level edits survive Tiptap collection, Host file save and reload", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "litzio-editor-heading-level-"));
  const levelOnlyFile = path.join(dir, "level-only.md");
  const textAndLevelFile = path.join(dir, "text-and-level.md");
  writeFileSync(levelOnlyFile, source);
  writeFileSync(textAndLevelFile, source);
  try {
    const { editable, state } = editorState(source);
    const levelOnly = state.apply(changeHeadingLevel(state, 1, 4));
    const levelEdits = collectSupportedEdits(editable, levelOnly.doc.toJSON() as TiptapJSON);
    assert.deepEqual(levelEdits.headingLevels, [{ path: [2], from: 2, to: 4 }]);
    assert.deepEqual(levelEdits.headings, []);
    saveFile(levelOnlyFile, source, levelEdits);
    const levelDisk = readFileSync(levelOnlyFile, "utf8");
    assert.equal(levelDisk, nativeSource("# Structural blocks\n\n#### Existing heading\n\nKeep this paragraph.\n"));
    const levelReload = loadEditableDocument(levelDisk).blocks;
    assert.deepEqual(levelReload.map((block) => block.block), ["heading", "heading", "paragraph"]);
    assert.deepEqual(levelReload[1], {
      block: "heading", path: [2], level: 4, text: "Existing heading", content: [{ kind: "text", text: "Existing heading" }], editable: true,
    });
    assert.equal(levelReload[2]?.block === "paragraph" && levelReload[2].text, "Keep this paragraph.");

    const levelAndText = state.apply(changeHeadingLevel(state, 1, 5));
    let textRange: { from: number; to: number } | undefined;
    levelAndText.doc.descendants((node, position) => {
      if (textRange || !node.isText) return;
      const index = node.text!.indexOf("Existing heading");
      if (index >= 0) textRange = { from: position + index, to: position + index + "Existing heading".length };
    });
    assert.ok(textRange);
    const renamed = levelAndText.apply(levelAndText.tr.insertText("Renamed heading", textRange!.from, textRange!.to));
    const combinedEdits = collectSupportedEdits(editable, renamed.doc.toJSON() as TiptapJSON);
    assert.deepEqual(combinedEdits.headingLevels, [{ path: [2], from: 2, to: 5 }]);
    assert.deepEqual(combinedEdits.headings, [{ path: [2], content: [{ kind: "text", text: "Renamed heading" }] }]);
    saveFile(textAndLevelFile, source, combinedEdits);
    const combinedDisk = readFileSync(textAndLevelFile, "utf8");
    const combinedReload = loadEditableDocument(combinedDisk).blocks;
    assert.deepEqual(combinedReload[1], {
      block: "heading", path: [2], level: 5, text: "Renamed heading", content: [{ kind: "text", text: "Renamed heading" }], editable: true,
    });
    assert.equal(combinedReload[2]?.block === "paragraph" && combinedReload[2].text, "Keep this paragraph.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Paragraph and Heading conversions survive Tiptap collection, Host file save and reload", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "litzio-editor-convert-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, source);
  try {
    const editable = loadEditableDocument(source);
    const baseline = toTiptapDocument(editable);
    const schema = getSchema(editorExtensions());
    let state = EditorState.create({ schema, doc: schema.nodeFromJSON(baseline),
      plugins: [structureGuardPlugin(baseline, () => assert.fail("representable conversion was rejected"))] });
    state = state.applyTransaction(paragraphToHeading(state, 2, 3)).state;
    state = state.applyTransaction(headingToParagraph(state, 1)).state;

    const saved = saveFile(file, source, collectSupportedEdits(editable, editorDocumentJSON(state)));
    assert.equal(readFileSync(file, "utf8"), saved.markdown);
    assert.deepEqual(loadEditableDocument(saved.markdown).blocks.map((block) =>
      block.block === "heading" ? [block.block, block.level, block.text] : [block.block, "text" in block && block.text]), [
      ["heading", 1, "Structural blocks"], ["paragraph", "Existing heading"], ["heading", 3, "Keep this paragraph."],
    ]);

    const broken = editorState(nativeSource("Keep\\\nthis paragraph.\n")).state;
    assert.ok(paragraphToHeadingRejection(broken, 0));
    assert.throws(() => paragraphToHeading(broken, 0, 2));
    const rich = editorState(nativeSource("Keep **this** paragraph.\n")).state;
    assert.equal(paragraphToHeadingRejection(rich, 0), undefined);
    assert.deepEqual(rich.apply(paragraphToHeading(rich, 0, 2)).doc.child(0).toJSON().content?.[1]?.marks, [{ type: "bold" }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Markdown block shortcuts replace the typed prefix and save as the equivalent Core blocks", () => {
  const markdown = nativeSource("# Title\n\nFirst item **bold**\n\nSecond\n\nsnippet\n\nKeep.\n\nTwo\\\nlines\n\nDone\n");
  const editable = loadEditableDocument(markdown);
  const baseline = toTiptapDocument(editable);
  const schema = getSchema(editorExtensions());
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON(baseline),
    plugins: [structureGuardPlugin(baseline, () => assert.fail("representable shortcut was rejected"))] });
  const typed = (index: number, prefix: string, shortcut: BlockShortcut) => {
    let start = 1;
    for (let i = 0; i < index; i++) start += state.doc.child(i).nodeSize;
    state = state.applyTransaction(state.tr.insertText(prefix, start)).state;
    const tr = state.tr;
    const applied = applyBlockShortcut(tr, start, start + prefix.length, shortcut);
    if (applied) state = state.applyTransaction(tr).state;
    return applied;
  };
  assert.ok(typed(1, "-", { block: "list", ordered: false }));
  assert.ok(typed(2, "3.", { block: "list", ordered: true, start: 3 }));
  assert.ok(typed(3, "```js", { block: "code", language: "js" }));
  assert.ok(typed(4, "##", { block: "heading", level: 2 }));
  // Headings hold no line breaks; the typed prefix stays as text.
  assert.equal(typed(5, "##", { block: "heading", level: 2 }), false);
  assert.equal(state.doc.child(5).type.name, "paragraph");
  // A typed checkbox makes a checklist item in the typed state.
  assert.ok(typed(6, "[x]", { block: "list", ordered: false, checked: true }));

  const saved = saveEdits(markdown, collectSupportedEdits(editable, editorDocumentJSON(state)));
  const blocks = loadEditableDocument(saved.markdown).blocks;
  assert.deepEqual(blocks.map(block => block.block), ["heading", "list", "list", "code", "heading", "paragraph", "list"]);
  assert.deepEqual(blocks[6], { block: "list", path: [7], ordered: false, checklist: true, items: [{ content: [{ kind: "text", text: "Done" }], checked: true }] });
  assert.deepEqual(blocks[1]?.block === "list" && blocks[1].items.map(item => item.content), [
    [{ kind: "text", text: "First item " }, { kind: "strong", children: [{ kind: "text", text: "bold" }] }],
  ]);
  assert.deepEqual(blocks[2]?.block === "list" && [blocks[2].ordered, blocks[2].start], [true, 3]);
  assert.deepEqual(blocks[3]?.block === "code" && [blocks[3].language, blocks[3].code], ["js", "snippet"]);
  assert.deepEqual(blocks[4]?.block === "heading" && [blocks[4].level, blocks[4].text], [2, "Keep."]);
  assert.equal(blocks[5]?.block === "paragraph" && blocks[5].text, "##Two\nlines");

  // Block shortcuts apply to top-level paragraphs only, not to paragraphs inside list items.
  const inList = state.doc.child(1).firstChild!.firstChild!;
  assert.equal(inList.type.name, "paragraph");
  assert.equal(applyBlockShortcut(state.tr, state.doc.child(0).nodeSize + 3, state.doc.child(0).nodeSize + 3,
    { block: "heading", level: 2 }), false);
});

test("a new document's empty starting paragraph becomes a heading by shortcut or conversion", () => {
  const editable = loadEditableDocument(nativeSource(""));
  const baseline = toTiptapDocument(editable);
  const schema = getSchema(editorExtensions());
  const start = () => EditorState.create({ schema, doc: schema.nodeFromJSON(baseline),
    plugins: [structureGuardPlugin(baseline, () => assert.fail("heading in a new document was rejected"))] });
  const titled = (state: EditorState) => state.applyTransaction(state.tr.insertText("OBCM", 1)).state;

  let typed = start();
  typed = typed.applyTransaction(typed.tr.insertText("#", 1)).state;
  const tr = typed.tr;
  assert.ok(applyBlockShortcut(tr, 1, 2, { block: "heading", level: 1 }));
  typed = titled(typed.applyTransaction(tr).state);
  const converted = titled(start().applyTransaction(paragraphToHeading(start(), 0, 1)).state);

  for (const state of [typed, converted]) {
    assert.equal(state.doc.child(0).type.name, "heading");
    assert.equal(saveEdits(nativeSource(""), collectSupportedEdits(editable, editorDocumentJSON(state))).markdown, nativeSource("# OBCM\n"));
  }
});

test("quotes and dividers from commands and shortcuts save as Core quotes and dividers", () => {
  const markdown = nativeSource("# Title\n\n> Existing quote.\n\nQuote me\n\n\n");
  const editable = loadEditableDocument(markdown);
  const baseline = toTiptapDocument(editable);
  const schema = getSchema(editorExtensions());
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON(baseline),
    plugins: [structureGuardPlugin(baseline, () => assert.fail("representable quote edit was rejected"))] });
  const apply = (tr: Transaction) => { state = state.applyTransaction(tr).state; };
  // Edit the existing quote, then add a quote and a divider after it from the insert menu.
  apply(state.tr.insertText("Edited ", state.doc.child(0).nodeSize + 1));
  apply(insertQuoteAfter(state, 1));
  apply(state.tr.insertText("New quote."));
  apply(insertDividerAfter(state, 2));
  // `> ` on the paragraph that followed; the empty paragraph after a divider is session space.
  const start = Array.from({ length: 5 }, (_, i) => state.doc.child(i).nodeSize).reduce((a, b) => a + b, 0) + 1;
  assert.equal(state.doc.child(5).textContent, "Quote me");
  const tr = state.tr.insertText(">", start);
  assert.ok(applyBlockShortcut(tr, start, start + 1, { block: "quote" }));
  apply(tr);

  const saved = saveEdits(markdown, collectSupportedEdits(editable, editorDocumentJSON(state)));
  assert.deepEqual(loadEditableDocument(saved.markdown).blocks.map(block => block.block === "quote" ? `quote ${block.text}` : block.block), [
    "heading", "quote Edited Existing quote.", "quote New quote.", "divider", "quote Quote me",
  ]);
});

test("a formatted heading opens editable, takes marks and saves its inline content", () => {
  const markdown = nativeSource("## Limits of **phase** current\n\nBody.\n");
  const { editable, state } = editorState(markdown);
  assert.equal(state.doc.child(0).type.name, "heading");
  let from = 0;
  state.doc.descendants((node, pos) => { if (!from && node.isText && node.text === " current") from = pos + 1; });
  const italic = state.apply(state.tr.addMark(from, from + "current".length, state.schema.marks.italic.create()));
  const edits = collectSupportedEdits(editable, italic.doc.toJSON() as TiptapJSON);
  assert.deepEqual(edits.headings?.[0]?.path, [1]);
  const saved = saveEdits(markdown, edits);
  assert.match(saved.markdown, /^## Limits of \*\*phase\*\* \*current\*$/m);
  const savedBlock = loadEditableDocument(saved.markdown).blocks[0];
  assert.equal(savedBlock?.block === "heading" && savedBlock.editable, true);
});

test("select all stays in each textblock, expands an existing full range and resets after a transaction", () => {
  const { state: initial } = editorState(nativeSource("## Heading\n\nParagraph\n\n- Item\n\n> Quote\n\n```text\nCode\n```\n"));
  initial.doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const state = initial.apply(initial.tr.setSelection(TextSelection.create(initial.doc, pos + 2)));
    const selected = state.apply(selectAllTransaction(state));
    assert.equal(selected.selection.from, pos + 1);
    assert.equal(selected.selection.to, pos + 1 + node.content.size);
    assert.ok(selected.apply(selectAllTransaction(selected, selected)).selection instanceof AllSelection);
    // A full range selected independently (including backwards) also expands immediately.
    const full = state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos + 1 + node.content.size, pos + 1)));
    assert.ok(full.apply(selectAllTransaction(full)).selection instanceof AllSelection);
    const moved = selected.apply(selected.tr.setSelection(TextSelection.create(selected.doc, pos + 2)));
    assert.ok(!(moved.apply(selectAllTransaction(moved, selected)).selection instanceof AllSelection));
  });
});

test("empty block select all uses consecutive state and document expansion can be disabled", () => {
  const schema = getSchema(editorExtensions());
  const doc = schema.node("doc", null, [schema.node("paragraph"), schema.node("paragraph", null, schema.text("Other"))]);
  const initial = EditorState.create({schema, doc});
  const first = initial.apply(selectAllTransaction(initial));
  assert.equal(first.selection.from, 1);
  assert.equal(first.selection.to, 1);
  assert.ok(first.apply(selectAllTransaction(first, first)).selection instanceof AllSelection);
  const intervening = first.apply(first.tr);
  assert.ok(!(intervening.apply(selectAllTransaction(intervening, first)).selection instanceof AllSelection));
  assert.ok(!(first.apply(selectAllTransaction(first, first, false)).selection instanceof AllSelection));
  const full = initial.apply(initial.tr.setSelection(TextSelection.create(doc, 3, 8)));
  assert.deepEqual(full.apply(selectAllTransaction(full, full, false)).selection.toJSON(), full.selection.toJSON());
  for (const type of ["figure", "table"]) {
    const block = schema.nodes[type]!.createAndFill()!;
    const nodeDoc = schema.node("doc", null, [block, schema.node("paragraph")]);
    const node = EditorState.create({schema, doc: nodeDoc, selection: NodeSelection.create(nodeDoc, 0)});
    assert.ok(node.apply(selectAllTransaction(node)).selection instanceof AllSelection);
    assert.deepEqual(node.apply(selectAllTransaction(node, undefined, false)).selection.toJSON(), node.selection.toJSON());
  }
});

// Content editing (#1976): the structure guard keeps every top-level block; Save refuses the rest.
const lockedSource = nativeSource("# Title\n\nFirst paragraph.\n\nSecond paragraph.\n\n:::{table} Caption\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n:::\n\n- one\n- two\n\n:::{warning}\nCheck.\n:::\n");

function contentEditor(lock: boolean) {
  const editable = loadEditableDocument(lockedSource);
  const baseline = toTiptapDocument(editable);
  const schema = getSchema(editorExtensions());
  const rejections: unknown[] = [];
  const state = EditorState.create({ schema, doc: schema.nodeFromJSON(baseline),
    plugins: [structureGuardPlugin(baseline, reason => rejections.push(reason ?? "unsupported"), [], lock)] });
  return { editable, state, rejections, schema };
}

function topPos(state: EditorState, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize;
  return pos;
}

function innerPos(state: EditorState, type: string, occurrence = 0): number {
  const found: number[] = [];
  state.doc.descendants((node, pos) => { if (node.type.name === type) found.push(pos); });
  return found[occurrence]! + 1;
}

const structuralChanges: [string, (state: EditorState) => Transaction][] = [
  ["Enter split", state => state.tr.split(topPos(state, 1) + 3)],
  ["Backspace merge", state => state.tr.join(topPos(state, 2))],
  ["insert", state => { const tr = insertParagraphAfter(state, 1); return tr.insertText("New", tr.selection.from); }],
  ["delete", state => deleteBlock(state, 1)],
  ["move", state => BLOCK_COMMANDS.find(command => command.id === "move-down")!.run(state, 1)],
  ["kind by input rule", state => { const tr = state.tr; assert.ok(applyBlockShortcut(tr, topPos(state, 1) + 1, topPos(state, 1) + 1, { block: "heading", level: 2 })); return tr; }],
  ["heading level", state => changeHeadingLevel(state, 0, 2)],
  ["table row", state => addTableRowBelow(state, 3)],
  ["table column", state => addTableColumnRight(state, 3)],
  ["table row removal", state => removeTableRow(state, 3, { row: 1, column: 0 })],
  ["table column removal", state => removeTableColumn(state, 3, { row: 0, column: 1 })],
  ["Admonition kind", state => changeAdmonitionVariant(state, 5, "tip")],
  ["select across blocks and type", state => state.tr.insertText("x", topPos(state, 1) + 3, topPos(state, 2) + 3)],
  ["select all and delete", state => state.tr.setSelection(new AllSelection(state.doc)).deleteSelection()],
];

test("content editing refuses each structural change and leaves the document unchanged", () => {
  for (const [name, change] of structuralChanges) {
    const { state, rejections } = contentEditor(true);
    const next = state.apply(change(state));
    assert.ok(next.doc.eq(state.doc), name);
    assert.deepEqual(rejections, [{ key: LOCKED_STRUCTURE_REJECTION }], name);
  }
});

test("a Save request with a structural change is never sent from content editing", () => {
  for (const [name, change] of structuralChanges) {
    // The same change as a document tab collects it.
    const { editable, state, rejections } = contentEditor(false);
    const next = state.apply(change(state));
    assert.deepEqual(rejections, [], name);
    const edits = collectSupportedEdits(editable, editorDocumentJSON(next));
    assert.notDeepEqual(structuralEditKinds(edits), [], name);
    assert.throws(() => admitContentEdits(edits), /structural changes/, name);
  }
});

test("content editing keeps text, inline math in a cell, list items and captions", () => {
  const { editable, state, rejections, schema } = contentEditor(true);
  let next = state.apply(state.tr.insertText(" Fixed", topPos(state, 1) + 1 + "First paragraph".length));
  next = next.apply(next.tr.insert(innerPos(next, "tableCell", 3), schema.nodes.inlineMath.create({ value: "x^2" })));
  next = next.apply(next.tr.insertText(" text", innerPos(next, "tableCaption") + "Caption".length));
  const list = next.doc.child(4);
  next = next.apply(next.tr.insert(topPos(next, 4) + list.nodeSize - 1,
    schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, schema.text("three")))));
  next = next.apply(next.tr.delete(topPos(next, 4) + 1, topPos(next, 4) + 1 + list.child(0).nodeSize));
  assert.deepEqual(rejections, []);
  const edits = collectSupportedEdits(editable, editorDocumentJSON(next));
  assert.deepEqual(structuralEditKinds(edits), []);
  admitContentEdits(edits);
  const saved = saveEdits(lockedSource, edits).markdown;
  assert.match(saved, /First paragraph Fixed\./);
  assert.match(saved, /\| 1 \| \$x\^2\$2 \|/);
  assert.match(saved, /:::\{table\} Caption text/);
  assert.match(saved, /\*   two\n\*   three\n/);
  assert.doesNotMatch(saved, /one/);
  assert.deepEqual(loadEditableDocument(saved).blocks.map(block => block.block), editable.blocks.map(block => block.block));
});
