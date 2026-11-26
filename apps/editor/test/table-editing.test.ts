import { nativeSource } from "./helpers/document.ts";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getSchema } from "@tiptap/core";
import { history, undo } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { splitBlock } from "@tiptap/pm/commands";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import { editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import { BLOCK_COMMANDS } from "../src/block-commands.ts";
import { tableTab } from "../src/document-interaction.ts";
import { isComplexTable, tableCellOf } from "../src/table-structure.ts";
import {
  assertSupportedDocumentChange,
  collectSupportedEdits,
  toTiptapDocument,
  type TiptapJSON,
} from "../src/tiptap-document.ts";
import { documentRevision, saveDocumentFile } from "../server/document-api.ts";
import { loadEditableDocument } from "./helpers/document.ts";
import { saveEdits } from "../server/document-replay.ts";

const fixture = fileURLToPath(new URL("../../../packages/core/test/fixtures/technical-document.md", import.meta.url));
const source = nativeSource(readFileSync(fixture, "utf8"));
const TABLE = 13;
const mixed = nativeSource("| Name | Note |\n| --- | --- |\n| U | **bold** |\n| P |  |\n");

function tableOf(projection: TiptapJSON): TiptapJSON {
  return projection.content!.find((block) => block.type === "table")!;
}

/** The rows of a table block: its grid holds them, before its caption and notes. */
function gridOf(table: TiptapJSON): TiptapJSON {
  return table.content![0];
}

function setCell(projection: TiptapJSON, row: number, cell: number, text: string, marks?: TiptapJSON["marks"]): TiptapJSON {
  const next = structuredClone(projection);
  gridOf(tableOf(next)).content![row].content![cell].content![0].content = text ? [{ type: "text", text, ...(marks ? { marks } : {}) }] : [];
  return next;
}

test("editable, empty and formatted cells round-trip through the single Tiptap schema", () => {
  const projection = toTiptapDocument(loadEditableDocument(mixed));
  assert.equal(gridOf(tableOf(projection)).type, "tableGrid");
  const rows = gridOf(tableOf(projection)).content!;
  assert.deepEqual(rows.map((row) => row.content!.map((cell) => cell.type)), [
    ["tableCell", "tableCell"],
    ["tableCell", "tableCell"],
    ["tableCell", "tableCell"],
  ]);
  assert.deepEqual(rows[1].content![1].attrs, { header: false, sourceCell: "1,1" });
  assert.deepEqual(rows[2].content![1], { type: "tableCell", attrs: { header: false, sourceCell: "2,1" }, content: [{ type: "paragraph", content: [] }] });
  const schema = getSchema(editorExtensions());
  assert.deepEqual(schema.nodeFromJSON(projection).toJSON(), schema.nodeFromJSON(schema.nodeFromJSON(projection).toJSON()).toJSON());
  assert.ok(schema.nodeFromJSON(projection).eq(schema.nodeFromJSON(projection)));
  // prosemirror-tables reads the grid: every cell spans one row and one column.
  let grid: ProseMirrorNode | undefined;
  schema.nodeFromJSON(projection).descendants(node => { if (node.type.name === "tableGrid") grid = node; return !grid; });
  const map = TableMap.get(grid!);
  assert.deepEqual([map.width, map.height, map.problems], [2, 3, null]);
});

test("changed header and body cells become Core cell edits; unchanged tables send none", () => {
  const document = loadEditableDocument(source);
  const projection = toTiptapDocument(document);
  assert.equal(collectSupportedEdits(document, projection).cells, undefined);
  const edited = setCell(setCell(projection, 0, 0, "Port name"), 1, 1, "AC-side", [{ type: "bold" }]);
  assert.deepEqual(collectSupportedEdits(document, edited).cells, [
    { path: [TABLE, 0, 0], content: [{ kind: "text", text: "Port name" }] },
    { path: [TABLE, 1, 1], content: [{ kind: "strong", children: [{ kind: "text", text: "AC-side" }] }] },
  ]);
});

test("unsupported table grid changes are refused", () => {
  const baseline = toTiptapDocument(loadEditableDocument(mixed));
  const changes: [string, (table: TiptapJSON) => void][] = [
    ["added row", (table) => { table.content!.push(structuredClone(table.content![2])); }],
    ["removed cell", (table) => { table.content![2].content!.pop(); }],
    ["cell kind", (table) => { table.content![1].content![1] = { type: "tableCell", attrs: { header: false }, content: [{ type: "paragraph", content: [] }] }; }],
    ["header flag", (table) => { table.content![2].content![0].attrs!.header = true; }],
    ["column alignment", (table) => { table.content![2].content![0].attrs!.align = "right"; }],
  ];
  for (const [name, change] of changes) {
    const next = structuredClone(baseline);
    change(gridOf(tableOf(next)));
    assert.throws(() => assertSupportedDocumentChange(baseline, next), Error, name);
  }
});

test("typing in a cell is allowed and undoable; Enter cannot change the table", () => {
  const baseline = toTiptapDocument(loadEditableDocument(mixed));
  const schema = getSchema(editorExtensions());
  const doc = schema.nodeFromJSON(baseline);
  let rejected = 0;
  let state = EditorState.create({ schema, doc, plugins: [history(), structureGuardPlugin(baseline, () => rejected++)] });
  const cell = cellPosition(doc, 1, 0);
  // After the cell's first character: into the cell, its paragraph and past "U".
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cell + 3)));
  state = state.apply(state.tr.insertText("-typed"));
  assert.equal(cellText(state.doc, 1, 0), "U-typed");
  assert.equal(rejected, 0);

  // Enter cannot split a cell: the command does not apply, or the guard rejects it.
  let split = state;
  const applied = splitBlock(state, (transaction) => { split = state.apply(transaction); });
  assert.ok(split.doc.eq(state.doc));
  assert.equal(rejected, applied ? 1 : 0);

  let undone = state;
  undo(state, (transaction) => { undone = state.apply(transaction); });
  assert.equal(cellText(undone.doc, 1, 0), "U");
});

test("Host Save writes edited header and body cells and keeps everything else", () => {
  const saved = saveEdits(source, {
    cells: [
      { path: [TABLE, 0, 0], content: [{ kind: "strong", children: [{ kind: "text", text: "Port name" }] }] },
      { path: [TABLE, 2, 1], content: [] },
    ],
  });
  assert.match(saved.markdown, /\| \*\*Port name\*\* \| Type +\|\n\| -+ \| -+ \|\n\| U +\| AC +\|\n\| P +\| +\|\n:::\n$/);
  // Everything before the table (the rest of the document) is the unchanged canonical form.
  const beforeTable = (markdown: string) => markdown.slice(0, markdown.indexOf("\n| "));
  assert.ok(beforeTable(saved.markdown).includes("{eq}`eq-current`"));
  assert.equal(beforeTable(saved.markdown), beforeTable(saveEdits(source, {}).markdown));
  const table = loadEditableDocument(saved.markdown).blocks[TABLE - 1];
  assert.equal(table?.block, "table");
  if (table?.block === "table") {
    assert.deepEqual(table.rows.map((row) => row.cells.map((cell) => [cell.text, cell.header, cell.editable])), [
      [["Port name", true, true], ["Type", true, true]],
      [["U", false, true], ["AC", false, true]],
      [["P", false, true], ["", false, true]],
    ]);
  }
});

test("Host preserves files on invalid cell edits and saves pipe content losslessly", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "litzio-table-save-"));
  const file = path.join(dir, "table.md");
  writeFileSync(file, mixed);
  try {
    const revision = documentRevision(mixed);
    const rejected: [unknown, RegExp][] = [
      [{ path: [1, 1, 0], content: "x" }, /must be InlineContent/],
      [{ path: [1, 1], content: [{ kind: "text", text: "x" }] }, /not allowed/],
      [{ path: [1, 1, 0], content: [{ kind: "text", text: "U " }] }, /whitespace/],
    ];
    for (const [cell, reason] of rejected) {
      assert.throws(() => saveDocumentFile(file, { revision, cells: [cell as never] }), reason);
      assert.equal(readFileSync(file, "utf8"), mixed);
    }
    const content = [{ kind: "code", value: "a|b" }, { kind: "text", text: " " },
      { kind: "math", value: "P(A|B)" }] as const;
    const saved = saveDocumentFile(file, { revision, cells: [{ path: [1, 1, 0], content: [...content] }] });
    const onDisk = readFileSync(file, "utf8");
    assert.equal(onDisk, saved.markdown);
    const table = loadEditableDocument(onDisk).blocks[0];
    assert(table?.block === "table");
    assert.deepEqual(table.rows[1].cells[0].content, content);
    saveDocumentFile(file, { revision: documentRevision(onDisk) });
    assert.equal(readFileSync(file, "utf8"), onDisk);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function cellPosition(doc: ProseMirrorNode, row: number, cell: number): number {
  let found = -1;
  doc.descendants((node, position) => {
    if (node.type.name !== "table") return true;
    const offset = position + 2;
    node.firstChild!.forEach((tableRow, rowOffset, rowIndex) => {
      if (rowIndex !== row) return;
      tableRow.forEach((_, cellOffset, cellIndex) => {
        if (cellIndex === cell) found = offset + rowOffset + 1 + cellOffset;
      });
    });
    return false;
  });
  return found;
}

function cellText(doc: ProseMirrorNode, row: number, cell: number): string {
  return doc.nodeAt(cellPosition(doc, row, cell))?.textContent ?? "";
}

// ADR-0024: a complex grid with merged cells, two header rows and cell blocks.
const complex = nativeSource([":::{table} Limits", "", "<table>", "<thead>", "<tr>", '<th colspan="2"><p>Range</p></th>', "</tr>",
  "<tr>", "<th><p>Item</p></th>", "<th><p>Value</p></th>", "</tr>", "</thead>", "<tbody>", "<tr>",
  '<td rowspan="2"><p>Output</p><p>rated</p></td>', "<td><p>230 V</p></td>", "</tr>", "<tr>",
  "<td><ol><li>Peak</li><li>Mean</li></ol></td>", "</tr>", "</tbody>", "</table>", ":::", ""].join("\n"));

test("a complex table keeps its spans, header rows and cell blocks, and only their text changes", () => {
  const document = loadEditableDocument(complex);
  const projection = toTiptapDocument(document);
  const schema = getSchema(editorExtensions());
  const doc = schema.nodeFromJSON(projection);
  const table = doc.child(0);
  assert.ok(isComplexTable(table));
  const map = TableMap.get(table.firstChild!);
  assert.deepEqual([map.width, map.height, map.problems], [2, 4, null]);
  const cells: string[] = [];
  table.firstChild!.descendants(node => { if (node.type.name === "tableCell") cells.push(`${node.attrs.sourceCell} ${node.attrs.rowspan}x${node.attrs.colspan} ${node.content.content.map(child => child.type.name).join("+")}`); return node.type.name !== "tableCell"; });
  assert.deepEqual(cells, ["0,0 1x2 paragraph", "1,0 1x1 paragraph", "1,1 1x1 paragraph", "2,0 2x1 paragraph+paragraph", "2,1 1x1 paragraph", "3,1 1x1 orderedList"]);
  assert.equal(collectSupportedEdits(document, projection).cells, undefined);
  const captioned = structuredClone(projection);
  tableOf(captioned).content![1].content = [{ type: "text", text: "Output limits" }];
  assert.deepEqual(collectSupportedEdits(document, captioned).tableCaptions, [{ path: [1], content: [{ kind: "text", text: "Output limits" }] }]);
  // Text in a paragraph and in a list item of merged-grid cells becomes block edits at the start column.
  const typed = structuredClone(projection);
  gridOf(tableOf(typed)).content![2].content![0].content![1].content = [{ type: "text", text: "rated load" }];
  gridOf(tableOf(typed)).content![3].content![0].content![0].content![1].content![0].content = [{ type: "text", text: "Mean", marks: [{ type: "bold" }] }];
  const edits = collectSupportedEdits(document, typed);
  assert.deepEqual(edits.cells?.map(edit => [edit.path.join(","), "blocks" in edit]), [["1,2,0", true], ["1,3,1", true]]);
  const saved = saveEdits(complex, edits).markdown;
  assert.equal(saved, complex.replace("<p>rated</p>", "<p>rated load</p>").replace("<li>Mean</li>", "<li><strong>Mean</strong></li>"));
  const reloaded = toTiptapDocument(loadEditableDocument(saved));
  assert.equal(collectSupportedEdits(loadEditableDocument(saved), reloaded).cells, undefined);
  // The grid and each cell's paragraphs and lists stay: spans, a new paragraph or list item are refused.
  for (const [name, change] of [
    ["span", (grid: TiptapJSON) => { grid.content![0].content![0].attrs!.colspan = 1; }],
    ["paragraph", (grid: TiptapJSON) => { grid.content![2].content![1].content!.push({ type: "paragraph", content: [] }); }],
    ["list item", (grid: TiptapJSON) => { const list = grid.content![3].content![0].content![0]; list.content!.push(structuredClone(list.content![0])); }],
    ["list kind", (grid: TiptapJSON) => { grid.content![3].content![0].content![0].type = "bulletList"; }],
  ] as const) {
    const next = structuredClone(projection);
    change(gridOf(tableOf(next)));
    assert.throws(() => assertSupportedDocumentChange(projection, next), /keeps its grid/, name);
  }
  // A simple table cannot gain blocks or spans, nor a new table come with them.
  const simple = toTiptapDocument(loadEditableDocument(mixed));
  const listed = structuredClone(simple);
  gridOf(tableOf(listed)).content![1].content![1].content = [{ type: "paragraph", content: [] }, { type: "paragraph", content: [] }];
  assert.throws(() => assertSupportedDocumentChange(simple, listed), /cannot gain/);

  // Litzio's own clipboard moves a complex table (cut, then paste after a paragraph): it is deleted at
  // its place and inserted as complex table input, so the grid, caption and notes move as they are.
  const movable = complex + "\nAfter.\n";
  const opened = loadEditableDocument(movable);
  const [moving, after] = toTiptapDocument(opened).content!;
  const moved = { ...toTiptapDocument(opened), content: [after, { ...moving, attrs: { ...moving.attrs, sourcePath: "new:paste:1" } }] };
  // The cut declares the table's deletion, as the structure guard records it.
  moved.attrs = { ...moved.attrs, deletedPaths: [String(moving.attrs!.sourcePath)] };
  const movedSave = saveEdits(movable, collectSupportedEdits(opened, moved)).markdown;
  const grid = (markdown: string) => markdown.slice(markdown.indexOf(":::{table}"), markdown.indexOf("</table>"));
  assert.ok(movedSave.indexOf("After.") < movedSave.indexOf(":::{table}"));
  assert.equal(grid(movedSave), grid(movable));

  // Row and column commands do not apply; the last cell's Tab leaves the table instead of adding a row.
  let state = EditorState.create({ schema, doc, plugins: [history(), structureGuardPlugin(projection, () => {})] });
  let last = -1;
  doc.descendants((node, pos) => { if (node.type.name === "paragraph" && node.textContent === "Mean") last = pos + 1; });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, last)));
  assert.deepEqual(tableCellOf(state.selection.$from), { row: 3, column: 1 });
  // Its last cell starts with a list: Tab leaves the table (here into a new paragraph after it) and adds no row.
  const tab = tableTab(state, false, true)!;
  assert.equal(tab.selection.$from.depth, 1);
  assert.equal(tab.doc.child(0).firstChild!.childCount, 4);
  // A content-only view (a plugin document view) adds no paragraph: Tab is left to the browser.
  const locked = EditorState.create({ schema, doc, selection: state.selection, plugins: [structureGuardPlugin(projection, () => {}, [], true)] });
  assert.equal(tableTab(locked, false, true), null);
  // Shift+Tab from that cell reaches the previous cell's first textblock.
  assert.equal(tableTab(state, true, true)!.selection.$from.parent.textContent, "230 V");
  for (const id of ["table-row", "table-column", "table-row-delete", "table-align-right"]) {
    assert.equal(BLOCK_COMMANDS.find(command => command.id === id)!.enabled(state, 0), false, id);
  }
  assert.equal(BLOCK_COMMANDS.find(command => command.id === "table-note")!.enabled(state, 0), true);
});
