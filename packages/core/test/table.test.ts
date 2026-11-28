import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as core from "@litzio/core";
import { parse as parseTree } from "../src/myst/parse.ts";
import { roundTrip, repeatRoundTrip } from "../src/myst/serialize.ts";
import { tableOf } from "../src/myst/table.ts";
import { writeIssueOf } from "../src/write-error.ts";
import {
  getEditableDocument,
  insertTable,
  insertTableColumn,
  insertTableRow,
  moveTableColumn,
  moveTableRow,
  parse,
  removeBlock,
  removeTableColumn,
  removeTableRow,
  serialize,
  updateTableCell,
  updateTableCaption,
  updateLabel,
  updateTableColumnAlignment,
  type InlineContent,
  type MystDocument,
} from "./core-internal.ts";

const technical = readFileSync(new URL("./fixtures/technical-document.md", import.meta.url), "utf8");
const TABLE = 12;

test("grouped pipe cell edits keep sequential write bytes and readback meaning", () => {
  const source = "---\nlitzio: 1\n---\n\n| Left | Right |\n| :--- | ---: |\n| | **Fixed** |\n| Before | Here |\n";
  const original = core.parse(source);
  const originalBytes = core.serialize(original);
  const paths = [[1, 0, 0], [1, 0, 1], [1, 1, 0], [1, 2, 0], [1, 2, 1]];
  const replacements = ["Voltage", "정상 상태", "", "e\u0301  7", "900"];
  let state = 2045;
  const sample = (bound: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor(state / 2 ** 32 * bound);
  };
  for (let caseIndex = 0; caseIndex < 128; caseIndex++) {
    const available = [...paths];
    const edits = Array.from({ length: 2 + sample(paths.length - 1) }, () => ({
      path: available.splice(sample(available.length), 1)[0],
      content: replacements[sample(replacements.length)],
    }));
    const grouped = core.tryUpdateTableCells(original, edits);
    assert.ok(grouped, `eligible group ${caseIndex}`);
    const sequential = edits.reduce((doc, edit) => core.updateTableCell(doc, edit.path, edit.content), original);
    const groupedWrite = core.serializeWithReadback(grouped);
    const sequentialWrite = core.serializeWithReadback(sequential);
    assert.equal(groupedWrite.markdown, sequentialWrite.markdown);
    assert.deepEqual(core.getEditableDocument(groupedWrite.document), core.getEditableDocument(sequentialWrite.document));
  }
  assert.equal(core.serialize(original), originalBytes);
});

test("a group cannot hide repeated cells or an earlier cell's round-trip refusal", () => {
  const original = core.parse("---\nlitzio: 1\n---\n\n| Header |\n| --- |\n| Before |\n");
  const header = { path: [1, 0, 0], content: "Changed" };
  const body = { path: [1, 1, 0], content: "Repaired" };
  const bad = { ...body, content: "invalid\0text" };
  assert.equal(core.tryUpdateTableCells(original, [header, body, body]), undefined);
  assert.equal(core.tryUpdateTableCells(original, [header, bad, body]), undefined);
  assert.equal(core.tryUpdateTableCells(original, [bad, header]), undefined);
  assert.throws(() => core.updateTableCell(core.updateTableCell(original, header.path, header.content), bad.path, bad.content),
    error => core.writeIssueOf(error).code === "round-trip-mismatch");
});

test("internally read a complex table and write stable canonical bytes with caption, options and notes", () => {
  const source = [
    "---", "litzio: 1", "---", "", ":::{table} **Operating limits** {ref}`conditions`",
    ":name: limits", ":enumerator: A.3", "", "<table>", "<thead>", "<tr>",
    '<th colspan="2"><p>Limits</p></th>', "</tr>", "<tr>", "<th><p>Item</p></th>",
    "<th><p>Conditions</p></th>", "</tr>", "</thead>", "<tbody>", "<tr>",
    '<td rowspan="2" style="text-align: right"><p>Voltage<br>rating</p><p>A &amp; B</p></td>',
    '<td><ol start="2"><li>Nominal<ul><li>Maximum</li></ul></li></ol></td>', "</tr>", "<tr>",
    '<td><p><span data-myst="math">x &lt; y</span> <span data-myst="numref">limits</span> <span data-myst="footnote">test</span> <span data-myst="cite:t">alpha,beta</span></p></td>',
    "</tr>", "</tbody>", "</table>", "", "a. Measured at full load.", "", "b. At sea level, see {cite}`alpha`.",
    ":::", "", "[^test]: In the test report.", "",
  ].join("\n");
  // ADR-0024 step 3: native admission reads the grid and writes the same bytes.
  assert.equal(core.serialize(core.parse(source)), source);
  const input = source.replace("<table>\n<thead>", "<TABLE>  \n<THEAD>")
    .replace('rowspan="2" style="text-align: right"', "STYLE='text-align:right;' ROWSPAN=02")
    .replace('data-myst="cite:t"', 'data-myst="cite"');
  const first = roundTrip(parseTree(input, { complexTables: true }));
  const grid = tableOf(first.reparsed.children[1])!;
  assert.equal(grid.headerRows, 2);
  assert.deepEqual(grid.children!.map(row => row.children!.map(cell => [cell.column, cell.rowspan, cell.colspan])),
    [[[0, 1, 2]], [[0, 1, 1], [1, 1, 1]], [[0, 2, 1], [1, 1, 1]], [[1, 1, 1]]]);
  assert.equal(first.markdown, source);
  assert.equal(repeatRoundTrip(first).markdown, source);
  const changed = structuredClone(first.reparsed);
  const editedCell = tableOf(changed.children[1])!.children![3].children![0];
  editedCell.rowspan = 2;
  assert.throws(() => roundTrip(changed), error => {
    assert.deepEqual(writeIssueOf(error).path, [1, 3, 1]);
    return /span exceeds/.test(writeIssueOf(error).reason);
  });
  assert.equal(roundTrip(first.reparsed).markdown, source);
});

const tableSource = (grid: string, options = "", notes = "") =>
  ":::{table}\n" + options + "\n" + grid + (notes ? "\n\n" + notes : "") + "\n:::\n";
const parseComplex = (source: string) => parseTree(source, { complexTables: true });

test("a footnote referenced only by a complex table keeps the document's shared link definitions", () => {
  const source = [
    "---", "litzio: 1", "---", "", ":::{table}", "",
    '<table><thead><tr><th><p>X<span data-myst="footnote">n</span></p><p>Y</p></th></tr></thead></table>',
    ":::", "", "[^n]: See [manual][spec].", "", "[spec]: https://example.com/manual", "",
  ].join("\n");
  const first = roundTrip(parseComplex(source));
  assert.match(first.markdown, /\[\^n\]: See \[manual\]\(https:\/\/example\.com\/manual\)\./);
  assert.equal(repeatRoundTrip(first).markdown, first.markdown);
});

test("a footnote referenced only by a complex table keeps another footnote it references", () => {
  const grid = '<table><thead><tr><th><p>X<span data-myst="footnote">n</span></p><p>Y</p></th></tr></thead></table>';
  const source = tableSource(grid) + "\n[^n]: Outer [^m].\n\n[^m]: Inner.\n";
  const first = roundTrip(parseComplex(source));
  assert.match(first.markdown, /\[\^n\]: Outer \[\^m\]\.\n\n\[\^m\]: Inner\./);
  assert.equal(repeatRoundTrip(first).markdown, first.markdown);
  assert.throws(() => roundTrip(parseComplex(source + "\n```text\nUnclosed fence\n")), /footnote \[\^n\]/);
});

test("HTML cells preserve block boundaries and data whitespace, and a captionless first note stays a note", () => {
  const grid = [
    "<table>", "<thead>", "<tr>",
    '<th rowspan="2"><p> A&#10;B&#13;C&#9;D </p><p></p><p><strong><em>Marked</em></strong> <del>removed</del> H<sub>2</sub> x<sup>3</sup> <code>&lt;tag&gt;</code> <a href="https://example.org/?x=1&amp;y=2" title="A &quot;quote&quot;">link</a></p><ul><li> <ol><li>Item</li></ol></li></ul></th>',
    "</tr>", "<tr>", "</tr>", "</thead>", "</table>",
  ].join("\n");
  const source = tableSource(grid, ":enumerated: false\n", "a. First note.");
  const inline = source.replace("A&#10;B", "A\nB").replace("&#13;", "&#xD;")
    .replace("<ol><li>", '<ol start="01"><li>');
  const first = roundTrip(parseComplex(inline));
  assert.equal(first.markdown, source);
  assert.equal(repeatRoundTrip(first).markdown, source);
  assert.deepEqual(first.reparsed.children[0].children!.map(node => node.type), ["table", "legend"]);
});

test("HTML-to-pipe conversion preserves alignment, breaks and notes, and promotion preserves old inline cells", () => {
  const html = '<table><thead><tr><th style="text-align: center"><p>Header</p></th></tr></thead>' +
    '<tbody><tr><td style="text-align: center"><p>two<br>lines</p></td></tr></tbody></table>';
  const pipe = tableSource("|    Header    |\n| :----------: |\n| two<br>lines |", "", "a. First note.");
  const lowered = roundTrip(parseComplex(tableSource(html, "", "a. First note.")));
  assert.equal(lowered.markdown, pipe);
  assert.equal(repeatRoundTrip(lowered).markdown, pipe);
  assert.equal(roundTrip(parseComplex(pipe)).markdown, pipe);

  const grid = tableOf(lowered.reparsed.children[0])!;
  // A cell changes to block content. The body cell still has its old inline children.
  const header = grid.children![0].children![0];
  header.children = [
    { type: "paragraph", children: header.children },
    { type: "paragraph", children: [{ type: "text", value: "Second paragraph" }] },
  ];
  const raised = roundTrip(lowered.reparsed);
  assert.match(raised.markdown, /<th style="text-align: center"><p>Header<\/p><p>Second paragraph<\/p><\/th>/);
  assert.match(raised.markdown, /<td style="text-align: center"><p>two<br>lines<\/p><\/td>/);
  assert.equal(repeatRoundTrip(raised).markdown, raised.markdown);

  const edited = tableOf(raised.reparsed.children[0])!;
  edited.children![0].children![0].children!.pop();
  assert.equal(roundTrip(raised.reparsed).markdown, pipe);

  for (const changed of [html.replace('center"><p>two', 'right"><p>two'), html.replace("two<br>lines", " two ")]) {
    const document = parseComplex(tableSource(changed));
    const before = structuredClone(document);
    assert.throws(() => roundTrip(document), error => {
      assert.deepEqual(writeIssueOf(error).path, [0, 1, 0]);
      return /pipe table/.test(writeIssueOf(error).reason);
    });
    assert.deepEqual(document, before);
  }
});

test("complex table input refuses repaired, malformed and out-of-scope HTML", () => {
  const header = "<thead><tr><th><p>A</p></th></tr></thead>";
  const grid = "<table>" + header + "</table>";
  const malformed = [
    "<table><tr><th><p>A</p></th></tr></table>",
    grid.replace("</th>", ""),
    grid.replace("<th>", '<th colspan="1" COLSPAN="2">'),
    grid.replace("<p>A</p>", "<p>A</bogus>B</p>"),
    grid.replace("<p>A</p>", "<p><a href=x>outer<a href=y>inner</a></a></p>"),
    grid.replace("<p>A</p>", "<p><a href=x>first</a><a href=x>second</a></p>"),
    grid.replace("<tr>", "<tr>Fostered text"),
    grid.replace("<th>", '<th style="text-align: left; width: 5px">'),
    grid.replace("<p>A</p>", '<p><img src="x">A</p>'),
    grid.replace("<p>A</p>", '<p><span data-myst="math"><em>x</em></span></p>'),
    grid.replace("<p>A</p>", "<p>A<!-- hidden --></p>"),
    grid.replace("<thead>", "<thead>\n\n"),
    grid + " stray text",
    grid + grid,
    "<table>" + header + "<tbody><tr></tr></tbody></table>",
    grid.replace("<th>", '<th rowspan="2">'),
    grid.replace("<th>", '<th colspan="9007199254740992">'),
    grid.replace("<th>", '<th colspan="33">'),
    '<table><thead><tr><th><p>A</p></th><th rowspan="2"><p>B</p></th></tr><tr><th colspan="2"><p>C</p></th></tr></thead></table>',
  ];
  for (const source of malformed) assert.throws(() => parseComplex(tableSource(source)), source);
  assert.throws(() => parseComplex(grid), /inside a \{table\} directive/);
  assert.throws(() => parseComplex(tableSource(grid) + "\n<div>Outside</div>"), /inside a \{table\} directive/);
  assert.throws(() => parseComplex(tableSource(grid.replace("A", '<span data-myst="footnote">note</span>')) +
    '\n[^note]: Has <em>raw HTML</em>.\n'), /inside a \{table\} directive/);
  assert.throws(() => parseComplex(tableSource(grid, "", "- A list is not a table note.")), /caption, notes or options/);
  for (const options of [":align: center\n", ":name: a\n:name: b\n", ":enumerated: xyz\n",
    ":constructor: a\n", ":invented: true\n"]) {
    assert.throws(() => parseComplex(tableSource(grid, options)), /Unsupported table options/);
  }
  assert.throws(() => parseComplex(tableSource(grid, ":enumerator: A.3\n:enumerated: false\n")), /numbering options/);
});

function cells(document: MystDocument, index: number) {
  const block = getEditableDocument(document).blocks[index];
  assert.equal(block?.block, "table");
  return block.block === "table" ? block.rows.map((row) => row.cells.map(({ text, header, editable }) => ({ text, header, editable }))) : [];
}

test("cells of supported inline content and empty cells are editable", () => {
  assert.deepEqual(cells(parse(technical), TABLE), [
    [{ text: "Port", header: true, editable: true }, { text: "Type", header: true, editable: true }],
    [{ text: "U", header: false, editable: true }, { text: "AC", header: false, editable: true }],
    [{ text: "P", header: false, editable: true }, { text: "DC", header: false, editable: true }],
  ]);
  const mixed = parse("| A | B | C | D | E |\n| --- | --- | --- | --- | --- |\n|  | **b** | $x$ | [l](u) | {ref}`intro` |\n");
  assert.deepEqual(cells(mixed, 0)[1].map((cell) => cell.editable), [true, true, true, true, true]);
  const block = getEditableDocument(mixed).blocks[0];
  assert.deepEqual(block.block === "table" && block.rows[1].cells.map((cell) => cell.content), [
    [], [{ kind: "strong", children: [{ kind: "text", text: "b" }] }], [{ kind: "math", value: "x" }],
    [{ kind: "link", url: "u", children: [{ kind: "text", text: "l" }] }], [{ kind: "reference", role: "ref", label: "intro" }],
  ]);
});

test("updateTableCell and insertTable keep inline content through canonical Markdown", () => {
  const formatted: InlineContent[] = [
    { kind: "strong", children: [{ kind: "text", text: "AC" }] }, { kind: "text", text: " at " }, { kind: "math", value: "x_1" },
    { kind: "text", text: " " }, { kind: "code", value: "a_b" }, { kind: "text", text: " " },
    { kind: "link", url: "https://a.example", children: [{ kind: "text", text: "spec" }] },
    { kind: "text", text: " " }, { kind: "reference", role: "eq", label: "eq-current" },
  ];
  const edited = updateTableCell(parse(technical), [TABLE, 1, 1], formatted);
  const inserted = insertTable(parse(""), 0, [["Port", [{ kind: "emphasis", children: [{ kind: "text", text: "Type" }] }]], ["U", formatted]]);
  for (const [document, index] of [[edited, TABLE], [inserted, 0]] as const) {
    const markdown = serialize(document);
    assert.equal(serialize(parse(markdown)), markdown);
    const block = getEditableDocument(parse(markdown)).blocks[index];
    assert.equal(block.block, "table");
    if (block.block !== "table") continue;
    assert.equal(block.rows[1].cells[1].editable, true);
    assert.deepEqual(block.rows[1].cells[1].content, formatted);
  }
  // Plain text replaces a formatted cell, clearing its marks.
  const plain = updateTableCell(edited, [TABLE, 1, 1], "AC");
  assert.deepEqual(cells(plain, TABLE)[1][1], { text: "AC", header: false, editable: true });
  assert.match(serialize(plain), /\| U +\| AC +\|/);
});

test("updateTableCell writes header and body cell text through canonical Markdown", () => {
  const original = parse(technical);
  const header = updateTableCell(original, [TABLE, 0, 0], "Port name");
  const edited = updateTableCell(header, [TABLE, 1, 1], "AC-side");
  const markdown = serialize(edited);
  assert.match(markdown, /\n\| Port name \| Type \|\n\| --- \| --- \|\n\| U \| AC-side \|\n\| P \| DC \|\n$/);
  assert.equal(serialize(parse(markdown)), markdown);
  assert.deepEqual(cells(parse(markdown), TABLE).map((row) => row.map((cell) => cell.text)),
    [["Port name", "Type"], ["U", "AC-side"], ["P", "DC"]]);
  assert.deepEqual(cells(parse(markdown), TABLE)[0].map((cell) => cell.header), [true, true]);
  // Everything outside the table is written exactly as before.
  assert.equal(serialize(removeBlock(parse(markdown), TABLE)), serialize(removeBlock(original, TABLE)));
});

test("cells can be cleared and filled, and Markdown syntax is kept as literal text", () => {
  const document = parse("| A | B |\n| --- | --- |\n| x |  |\n");
  const filled = updateTableCell(document, [0, 1, 1], "a | b *c* `d`");
  const cleared = updateTableCell(filled, [0, 1, 0], "");
  const markdown = serialize(cleared);
  assert.deepEqual(cells(parse(markdown), 0)[1], [
    { text: "", header: false, editable: true },
    { text: "a | b *c* `d`", header: false, editable: true },
  ]);
  assert.equal(serialize(parse(markdown)), markdown);
  // Empty inline content clears a cell like empty text.
  assert.equal(serialize(updateTableCell(filled, [0, 1, 0], [{ kind: "text", text: "" }])), markdown);
});

test("table cell code and math pipes retain exact values, alignment and stable native saves", async (t) => {
  for (const kind of ["code", "math"] as const) {
    const values = kind === "math"
      ? ["|x|", "P(A|B)", String.raw`\|x\|`, String.raw`\left|x\right|`, "a$|b", "a|b\\"]
      : ["a | b", "flags | MASK", String.raw`a \| b`, "a`|b"];
    values.push("|", "a||b", ...[0, 1, 2, 3, 4].map(count => `a${"\\".repeat(count)}|b`));
    for (const value of values) await t.test(`${kind} ${JSON.stringify(value)}`, () => {
      const content: InlineContent[] = [{ kind, value }];
      const inserted = core.insertTable(core.createDocument(), 1,
        [["Header", content], ["Body", content]], ["left", "right"]);
      const before = structuredClone(inserted);
      const markdown = core.serialize(inserted);
      assert.deepEqual(inserted, before);
      const reopened = core.parse(markdown);
      const block = core.getEditableDocument(reopened).blocks.find(block => block.block === "table");
      assert(block?.block === "table");
      assert.deepEqual(block.rows.map(row => row.cells.map(cell => cell.content)), [
        [[{ kind: "text", text: "Header" }], content],
        [[{ kind: "text", text: "Body" }], content],
      ]);
      for (const row of block.rows) assert.deepEqual(row.cells.map(cell => cell.align), ["left", "right"]);
      assert.equal(core.serialize(reopened), markdown);
      assert.equal(core.serialize(core.parse(core.serialize(reopened))), markdown);

      // Existing cells use the same write path, including nested marks and link content.
      const nested: InlineContent[] = [{ kind: "strong", children: [
        { kind: "link", url: "https://example.com", children: content },
      ] }];
      const edited = core.updateTableCell(reopened, [1, 1, 1], nested);
      const editedMarkdown = core.serialize(edited);
      const editedBlock = core.getEditableDocument(core.parse(editedMarkdown)).blocks.find(block => block.block === "table");
      assert(editedBlock?.block === "table");
      assert.deepEqual(editedBlock.rows[1].cells[1].content, nested);
      for (const row of editedBlock.rows) assert.deepEqual(row.cells.map(cell => cell.align), ["left", "right"]);
      assert.equal(core.serialize(core.parse(editedMarkdown)), editedMarkdown);
    });
  }
});

test("cell pipe escaping leaves prose and table captions unchanged", () => {
  const inline = "`a | b` $|x|$ $\\|x\\|$ {math}`a$|b`";
  const source = `---\nlitzio: 1\n---\n\n${inline}\n\n:::{table} ${inline}\n\n| H |\n| - |\n| x |\n:::\n`;
  assert.equal(core.serialize(core.parse(source)), source);
});

test("updateTableCell fails closed without mutating the document", () => {
  const document = parse(technical);
  const before = structuredClone(document);
  const rejected: [number[], string | InlineContent[], RegExp][] = [
    [[TABLE, 1, 1], [{ kind: "text", text: "A\nB" }], /line breaks/],
    [[TABLE, 1, 1], [{ kind: "strong", children: [{ kind: "text", text: "AC " }] }], /whitespace/],
    [[TABLE, 1, 1], " AC", /whitespace/],
    [[TABLE, 1, 1], "AC ", /whitespace/],
    [[TABLE, 1], "x", /requires a top-level table cell path/],
    [[2, 0, 0], "x", /not editable/],
    [[TABLE, 9, 0], "x", /out of range/],
  ];
  for (const [path, text, reason] of rejected) {
    assert.throws(() => updateTableCell(document, path, text), reason, `${path} ${JSON.stringify(text)}`);
  }
  assert.deepEqual(document, before);

});

const texts = (document: MystDocument, index: number) => cells(document, index).map((row) => row.map((cell) => cell.text));

test("insertTable writes a header row and body rows of plain text through canonical Markdown", () => {
  const document = parse("# Title\n\nText.\n");
  const next = insertTable(document, 1, [["Port", "Type"], ["U", "AC"], ["", "a | b"]]);
  const markdown = serialize(next);
  assert.equal(markdown, String.raw`# Title

| Port | Type |
| --- | --- |
| U | AC |
| | a \| b |

Text.
`);
  assert.equal(serialize(parse(markdown)), markdown);
  assert.deepEqual(texts(parse(markdown), 1), [["Port", "Type"], ["U", "AC"], ["", "a | b"]]);
  assert.deepEqual(cells(parse(markdown), 1).map((row) => row.map((cell) => cell.header)), [[true, true], [false, false], [false, false]]);
  // A header-only table and an empty table are Markdown tables too.
  assert.deepEqual(texts(parse(serialize(insertTable(document, 1, [["A"]]))), 1), [["A"]]);
  assert.deepEqual(texts(parse(serialize(insertTable(document, 2, [["", ""], ["", ""]]))), 2), [["", ""], ["", ""]]);
});

test("insertTableRow adds an empty body row below the header or any body row", () => {
  const document = parse("| A | B |\n| --- | --- |\n| x | y |\n");
  const markdown = serialize(insertTableRow(insertTableRow(document, [0], 1), [0], 3));
  assert.equal(markdown, "| A | B |\n| --- | --- |\n| | |\n| x | y |\n| | |\n");
  assert.equal(serialize(parse(markdown)), markdown);
  assert.deepEqual(texts(parse(markdown), 0), [["A", "B"], ["", ""], ["x", "y"], ["", ""]]);
  // A new row's cells are editable, so they can be filled right away.
  assert.deepEqual(texts(updateTableCell(parse(markdown), [0, 1, 1], "z"), 0)[1], ["", "z"]);
});

test("insertTableColumn adds an empty column, header cell included, at any position", () => {
  const document = parse("| A | B |\n| --- | --- |\n| x | **y** |\n");
  const first = insertTableColumn(document, [0], 0);
  const last = insertTableColumn(first, [0], 3);
  const markdown = serialize(last);
  assert.equal(markdown, "| | A | B | |\n| --- | --- | --- | --- |\n| | x | **y** | |\n");
  assert.equal(serialize(parse(markdown)), markdown);
  assert.deepEqual(cells(parse(markdown), 0), [
    [{ text: "", header: true, editable: true }, { text: "A", header: true, editable: true }, { text: "B", header: true, editable: true }, { text: "", header: true, editable: true }],
    [{ text: "", header: false, editable: true }, { text: "x", header: false, editable: true }, { text: "y", header: false, editable: true }, { text: "", header: false, editable: true }],
  ]);
});

test("table insertion fails closed without mutating the document", () => {
  const document = parse(technical);
  const before = structuredClone(document);
  const rejected: [() => unknown, RegExp][] = [
    [() => insertTable(document, 0, [["A"]], []), /alignment/],
    [() => insertTable(document, 0, [["A"]], ["invalid" as "left"]), /alignment/],
    [() => insertTable(document, 0, []), /header row with at least one cell/],
    [() => insertTable(document, 0, [[]]), /header row with at least one cell/],
    [() => insertTable(document, 0, [["A", "B"], ["x"]]), /same number of cells/],
    [() => insertTable(document, 0, [["A"], [[{ kind: "text", text: "x\ny" }]]]), /line breaks/],
    [() => insertTable(document, 0, [[" A"]]), /whitespace/],
    [() => insertTable(document, 99, [["A"]]), /index out of range/],
    [() => insertTableRow(document, [TABLE], 0), /from 1 to 3/],
    [() => insertTableRow(document, [TABLE], 4), /from 1 to 3/],
    [() => insertTableRow(document, [TABLE], 1.5), /from 1 to 3/],
    [() => insertTableColumn(document, [TABLE], -1), /from 0 to 2/],
    [() => insertTableColumn(document, [TABLE], 3), /from 0 to 2/],
    [() => insertTableRow(document, [0], 1), /requires a table at \[0\]/],
    [() => insertTableColumn(document, [TABLE, 0], 0), /top-level table path/],
  ];
  for (const [run, reason] of rejected) assert.throws(run, reason);
  assert.deepEqual(document, before);
});

test("aligned tables retain column semantics across cell edits and row/column insertion", () => {
  let document = insertTable(parse(""), 0, [["L", "C", "R", "None"], ["a", "b", "c", "d"]], ["left", "center", "right", null]);
  document = updateTableCell(document, [0, 1, 1], "changed");
  document = insertTableRow(document, [0], 1);
  document = insertTableColumn(document, [0], 2);
  const markdown = serialize(document);
  const block = getEditableDocument(parse(markdown)).blocks[0];
  assert.equal(block.block, "table");
  if (block.block !== "table") return;
  for (const row of block.rows) assert.deepEqual(row.cells.map(cell => cell.align), ["left", "center", undefined, "right", undefined]);
  assert.equal(block.rows[2].cells[1].text, "changed");
  assert.equal(serialize(parse(markdown)), markdown);
});

test("table rows and columns move and remove supported cells with column alignment", () => {
  const source = "| A | B | C |\n| :-- | :-: | --: |\n| a1 | **b1** | c1 |\n| a2 | b2 | c2 |\n";
  let document = moveTableColumn(moveTableRow(parse(source), [0], 2, 1), [0], 0, 2);
  assert.deepEqual(texts(document, 0), [["B", "C", "A"], ["b2", "c2", "a2"], ["b1", "c1", "a1"]]);
  const block = getEditableDocument(document).blocks[0];
  assert.deepEqual(block.block === "table" && block.rows[0].cells.map(cell => cell.align), ["center", "right", "left"]);
  document = removeTableColumn(removeTableRow(document, [0], 1), [0], 2);
  assert.deepEqual(texts(document, 0), [["B", "C"], ["b1", "c1"]]);
  assert.equal(serialize(parse(serialize(document))), serialize(document));
});

test("updateTableColumnAlignment sets or clears a column's alignment on every row", () => {
  const document = parse("| A | B |\n| --- | :-: |\n| x | y |\n");
  const markdown = serialize(updateTableColumnAlignment(updateTableColumnAlignment(document, [0], 0, "right"), [0], 1, null));
  assert.equal(markdown, "| A | B |\n| ---: | --- |\n| x | y |\n");
  const block = getEditableDocument(parse(markdown)).blocks[0];
  assert.deepEqual(block.block === "table" && block.rows.map(row => row.cells.map(cell => cell.align)), [["right", undefined], ["right", undefined]]);
});

test("table structure changes fail closed without mutating the document", () => {
  const document = parse(technical);
  const before = structuredClone(document);
  const headerOnly = parse("| A |\n| - |\n");
  const rejected: [() => unknown, RegExp][] = [
    [() => removeTableRow(document, [TABLE], 0), /from 1 to 2/],
    [() => removeTableRow(document, [TABLE], 3), /from 1 to 2/],
    [() => removeTableRow(headerOnly, [0], 1), /no body row/],
    [() => removeTableColumn(headerOnly, [0], 0), /at least one column/],
    [() => removeTableColumn(document, [TABLE], 2), /from 0 to 1/],
    [() => moveTableRow(document, [TABLE], 1, 0), /from 1 to 2/],
    [() => moveTableColumn(document, [TABLE], 0, 2), /from 0 to 1/],
    [() => updateTableColumnAlignment(document, [TABLE], 0, "justify" as "left"), /left, center, right or null/],
    [() => removeTableRow(document, [0], 1), /requires a table at \[0\]/],
  ];
  for (const [run, reason] of rejected) assert.throws(run, reason);
  assert.deepEqual(document, before);
});


test("table captions and labels survive cell, grid and alignment edits, and can be removed", () => {
  const plain = parse("| A | B |\n|:---|---:|\n| 1 | 2 |\n");
  const before = structuredClone(plain);
  let document = updateTableCaption(plain, [0], [{ kind: "strong", children: [{ kind: "text", text: "Values" }] }]);
  document = updateLabel(document, [0], "tbl-values");
  document = updateTableCell(document, [0, 1, 1], "3");
  document = insertTableRow(document, [0], 2);
  document = moveTableColumn(document, [0], 1, 0);
  const markdown = serialize(document);
  assert.match(markdown, /:::\{table\} \*\*Values\*\*\n:name: tbl-values/);
  const block = getEditableDocument(parse(markdown)).blocks[0];
  assert.equal(block.block, "table");
  if (block.block !== "table") return;
  assert.equal(block.label, "tbl-values");
  assert.equal(block.rows[1].cells[0].text, "3");
  assert.equal(block.rows[0].cells[0].align, "right");
  assert.deepEqual(block.caption, [{ kind: "strong", children: [{ kind: "text", text: "Values" }] }]);
  assert.equal(serialize(parse(markdown)), markdown);
  assert.deepEqual(plain, before);
  document = updateTableCaption(document, [0], "");
  assert.match(serialize(document), /:::\{table\}\n:name: tbl-values/);
  document = updateLabel(document, [0], "");
  assert.equal(getEditableDocument(document).blocks[0].block, "table");
  assert.match(serialize(document), /^\| B \| A \|\n\| ---: \| :--- \|\n/);
  assert.doesNotMatch(serialize(document), /tbl-values/);
  // Label-only tables must not recurse when first adding or changing the label.
  assert.match(serialize(updateLabel(plain, [0], "tbl-only")), /:name: tbl-only/);
  assert.throws(() => updateTableCaption(plain, [0], " two lines\ncaption"), /line breaks|whitespace/);

});

const text = (text: string): InlineContent => ({ kind: "text", text });
const nativeTable = "---\nlitzio: 1\n---\n\n:::{table}\n\n| Name |\n| ---- |\n| A |\n";

test("table cell breaks round-trip at the edges, consecutively and within marks", () => {
  const doc = core.parse(nativeTable + ":::\n");
  const changed = core.updateTableCell(doc, [1, 1, 0], "\r\nA\n\nB\r");
  const markdown = core.serialize(changed);
  assert.match(markdown, /\| <br>A<br><br>B<br> \|/);
  const reopened = core.parse(markdown);
  const block = core.getEditableDocument(reopened).blocks[0];
  assert.ok(block.block === "table");
  assert.deepEqual(block.rows[1].cells[0].content, [
    { kind: "break" }, text("A"), { kind: "break" }, { kind: "break" }, text("B"), { kind: "break" },
  ]);
  assert.equal(core.serialize(reopened), markdown);
  const rich = core.parse(nativeTable.replace("| A |", "| **a<br>b** <br> c |") + ":::\n");
  const withMarks = core.getEditableDocument(rich).blocks[0];
  assert.ok(withMarks.block === "table");
  assert.deepEqual(withMarks.rows[1].cells[0].content, [
    { kind: "strong", children: [text("a"), { kind: "break" }, text("b")] }, text(" "), { kind: "break" }, text(" c"),
  ]);
  for (const html of ["<BR>", "<br/>", "<br />", '<br class="note">', "<span>x</span>"]) {
    assert.throws(() => core.parse(nativeTable.replace("| A |", "| x" + html + "y |") + ":::\n"), /Unsupported native content/);
  }
});

test("table note whitespace follows paragraph writes and supports field-level authoring reuse", async () => {
  const raw = nativeTable + "\n&#32;&#9;a. note&#32;\n:::\n";
  const document = core.parse(raw);
  const block = core.getEditableDocument(document).blocks[0];
  assert.ok(block.block === "table" && block.notes);
  assert.deepEqual(block.notes, [[text(" \ta. note ")]]);
  const body = core.serialize(core.parse("---\nlitzio: 1\n---\n\n&#32;&#9;a. note&#32;\n"));
  const canonical = core.serialize(document);
  assert.match(body, /\na\. note&#x20;\n$/);
  assert.match(canonical, /\na\. note&#x20;\n:::\n$/);
  assert.equal(core.serialize(core.parse(canonical)), canonical);
  const authored = await core.authorDocument({ inputs: [{ key: "table", blocks: [
    { kind: "table", rows: block.rows.map(row => row.cells.map(cell => cell.content)), notes: block.notes },
  ] }] });
  assert.equal(authored.source, canonical);
  assert.equal(core.serialize(core.updateTableNote(document, [1], 0, block.notes[0])), canonical);
});

test("table notes round-trip as owned paragraphs and follow whole-table operations", async () => {
  const source = nativeTable.replace("| A |", "| <br>A<br> B <br> |") + "\na. **Nominal** {sub}`x` $y$ [Link](https://example.test) {ref}`next`\n\nb. Limit\\\ncontinued\n:::\n\n(next)=\n\n# Next\n";
  const doc = core.parse(source);
  const read = (document: core.Document) => {
    const block = core.getEditableDocument(document).blocks.find(block => block.block === "table");
    assert.ok(block);
    return block;
  };
  const initial = read(doc);
  assert.equal(initial.caption, undefined);
  assert.deepEqual(initial.notes?.map(core.inlineContentText), ["a. Nominal x $y$ Link {ref}\x60next\x60", "b. Limit\ncontinued"]);
  const canonical = core.serialize(doc);
  assert.equal(core.serialize(core.parse(canonical)), canonical);
  const machine = core.machineNodes(core.getEditableDocument(doc));
  const table = machine.find(node => node.type === "table")!;
  const rows = initial.rows.map(row => row.cells.map(cell => machine.find(node => node.path.join() === cell.path.join())!.content));
  const authored = await core.authorDocument({ inputs: [{ key: "table", blocks: [
    { kind: "table", rows, notes: table.notes }, { kind: "target", label: "next" }, { kind: "heading", level: 1, text: "Next" },
  ] }] });
  assert.equal(authored.source, canonical);
  let edited = core.insertTableNote(doc, [1], 1, "c. Added");
  edited = core.updateTableNote(edited, [1], 0, "a. Updated");
  edited = core.moveTableNote(edited, [1], 2, 0);
  edited = core.removeTableNote(edited, [1], 2);
  edited = core.insertTableRow(edited, [1], 1);
  edited = core.updateTableCaption(edited, [1], "Measurements");
  edited = core.updateLabel(edited, [1], "measurements");
  assert.deepEqual(read(core.parse(core.serialize(edited))).notes?.map(core.inlineContentText), ["b. Limit\ncontinued", "a. Updated"]);
  const moved = core.moveBlock(edited, 1, 3);
  assert.deepEqual(read(moved).notes, read(edited).notes);
  assert.doesNotMatch(core.serialize(core.removeBlock(moved, read(moved).path[0])), /Limit|Updated/);
  for (const block of ["- List", "# Heading", "![Image](image.png)", "| Another |\n| ------- |\n| Cell |",
    "[^n]"]) {
    assert.throws(() => core.parse(nativeTable + "\n" + block + "\n:::\n" + (block === "[^n]" ? "\n[^n]: Endnote\n" : "")), /Unsupported native content/);
  }
  assert.throws(() => core.insertTableNote(doc, [1], 4, "Out of bounds"), /index is out of range/);
  assert.throws(() => core.updateTableNote(doc, [1], 0, [{ kind: "footnote", label: "n" }]), /cannot contain an endnote/);
});

// ADR-0024 step 3: a complex grid read, edited and authored through the public API.
const complexSource = core.serialize(core.parse([
  "---", "litzio: 1", "---", "", "Before.", "", ":::{table} Limits", ":name: limits", "", "<table>", "<thead>",
  "<tr>", '<th colspan="2"><p>Range</p></th>', "</tr>", "<tr>", "<th><p>Item</p></th>", "<th><p>Value</p></th>", "</tr>",
  "</thead>", "<tbody>", "<tr>", '<td rowspan="2"><p>Output</p><p>rated</p></td>', "<td><p>230 V</p></td>", "</tr>",
  "<tr>", "<td><ul><li>Peak</li><li>Mean</li></ul></td>", "</tr>", "</tbody>", "</table>", "", "a. Measured.", ":::", "",
].join("\n")));

test("complex table cells are read and edited at their start column through the public API", () => {
  const document = core.parse(complexSource);
  const table = core.getEditableDocument(document).blocks[1];
  assert.ok(table.block === "table" && table.grid === "complex");
  assert.equal(table.headerRows, 2);
  assert.deepEqual(table.rows.map(row => row.cells.map(cell => [cell.path.join(","), cell.rowspan, cell.colspan, cell.text])), [
    [["2,0,0", 1, 2, "Range"]], [["2,1,0", 1, 1, "Item"], ["2,1,1", 1, 1, "Value"]],
    [["2,2,0", 2, 1, "Output\nrated"], ["2,2,1", 1, 1, "230 V"]], [["2,3,1", 1, 1, "Peak\nMean"]],
  ]);
  // inspect --format json carries the grid as complex table input; inline content only for one paragraph.
  const nodes = core.machineNodes(core.getEditableDocument(document));
  const tableNode = nodes.find(node => node.type === "table");
  assert.deepEqual([tableNode?.grid, tableNode?.headerRows], ["complex", 2]);
  const cells = nodes.filter(node => node.type === "cell");
  assert.deepEqual(cells.map(cell => [cell.path.join(","), "content" in cell]), [["2,0,0", true], ["2,1,0", true], ["2,1,1", true], ["2,2,0", false], ["2,2,1", true], ["2,3,1", false]]);
  assert.deepEqual(cells[5].blocks, [{ kind: "list", list: { ordered: false, items: [{ content: [{ kind: "text", text: "Peak" }] }, { content: [{ kind: "text", text: "Mean" }] }] } }]);

  const edited = core.serialize(core.updateTableCell(document, [2, 2, 1], [{ kind: "strong", children: [{ kind: "text", text: "240 V" }] }]));
  assert.equal(edited, complexSource.replace("<td><p>230 V</p></td>", "<td><p><strong>240 V</strong></p></td>"));
  const blocks = core.serialize(core.updateTableCellBlocks(document, [2, 3, 1], [{ kind: "paragraph", content: [{ kind: "text", text: "Peak" }] },
    { kind: "list", list: { ordered: true, start: 2, items: [{ content: [{ kind: "text", text: "Mean" }] }] } }]));
  assert.match(blocks, /\n<td><p>Peak<\/p><ol start="2"><li>Mean<\/li><\/ol><\/td>\n/);
  // A covered position is no cell, and a cell of several blocks needs block input.
  assert.throws(() => core.updateTableCell(document, [2, 3, 0], "x"), /not where a cell starts/);
  assert.throws(() => core.updateTableCell(document, [2, 2, 0], "x"), /replace its blocks/);
  // Rectangular row, column and alignment operations cannot keep the grid; table notes still can.
  for (const change of [() => core.insertTableRow(document, [2], 3), () => core.removeTableRow(document, [2], 3), () => core.moveTableRow(document, [2], 2, 3),
    () => core.insertTableColumn(document, [2], 1), () => core.removeTableColumn(document, [2], 1), () => core.moveTableColumn(document, [2], 0, 1),
    () => core.updateTableColumnAlignment(document, [2], 1, "right")]) {
    assert.throws(change, (error: unknown) => error instanceof core.DocumentDiagnosticError && /merged cells, header rows or cell blocks/.test(error.message));
  }
  assert.match(core.serialize(core.insertTableNote(document, [2], 1, "b. Second.")), /\n\na\. Measured\.\n\nb\. Second\.\n:::\n$/);
  assert.equal(core.serialize(document), complexSource);
  // The quick Save leaves complex tables to the full Save.
  const baseline = core.LocalWriteBaseline.fromCanonical(complexSource, document)!;
  assert.deepEqual(baseline.write({ kind: "cell", path: [2, 2, 1], content: [{ kind: "text", text: "240 V" }] }), { reason: "complex-table" });
});

test("cell blocks move a table between pipe and HTML grids, and complex input round-trips through inspect", () => {
  const pipe = nativeSource(":::{table}\n\n| A | B |\n| - | - |\n| 1 | 2 |\n:::\n");
  const document = core.parse(pipe);
  const twoParagraphs = core.updateTableCellBlocks(document, [1, 1, 0], [{ kind: "paragraph", content: [{ kind: "text", text: "x" }] }, { kind: "paragraph", content: [{ kind: "text", text: "y" }] }]);
  const html = core.serialize(twoParagraphs);
  assert.match(html, /\n<td><p>x<\/p><p>y<\/p><\/td>\n<td><p>2<\/p><\/td>\n/);
  const back = core.updateTableCellBlocks(core.parse(html), [1, 1, 0], [{ kind: "paragraph", content: [{ kind: "text", text: "1" }] }]);
  assert.equal(core.serialize(back), core.serialize(document));
  const backBlock = core.getEditableDocument(back).blocks[0];
  assert.ok(backBlock.block === "table" && backBlock.grid === undefined);
  // An HTML grid that fits pipe cells reads as the pipe table its canonical write is.
  const fitting = core.parse(html.replace("<td><p>x</p><p>y</p></td>", "<td><p>1</p></td>"));
  const fittingBlock = core.getEditableDocument(fitting).blocks[0];
  assert.ok(fittingBlock.block === "table" && fittingBlock.grid === undefined);
  assert.equal(core.serialize(fitting), core.serialize(document));

  // The inspect nodes of a complex table are its insertion input.
  const nodes = core.machineNodes(core.getEditableDocument(core.parse(complexSource))).filter(node => node.path[0] === 2);
  const rows: { cells: core.ComplexTableCellInput[] }[] = [];
  for (const cell of nodes.filter(node => node.type === "cell")) {
    (rows[cell.path[1]] ??= { cells: [] }).cells.push({ column: cell.column as number, rowspan: cell.rowspan as number, colspan: cell.colspan as number, blocks: cell.blocks as core.TableCellBlock[] });
  }
  for (let index = 0; index < rows.length; index++) rows[index] ??= { cells: [] };
  const inserted = core.insertTable(core.parse(nativeSource("Start.\n")), 1, { grid: "complex", headerRows: nodes[0].headerRows as number, rows }, undefined, ["a. Measured."]);
  const grid = (markdown: string) => markdown.slice(markdown.indexOf("<table>"), markdown.indexOf("</table>"));
  assert.equal(grid(core.serialize(inserted)), grid(complexSource));
  const empty = [{ kind: "paragraph" as const, content: [] }];
  assert.throws(() => core.insertTable(core.parse(nativeSource("Start.\n")), 1, { grid: "complex", headerRows: 1,
    rows: [{ cells: [{ colspan: 2, blocks: empty }] }, { cells: [{ blocks: empty }] }] }), /Uncovered position/);
});

test("complex grid authoring checks the expanded grid before it expands a span", () => {
  const paragraph = [{ kind: "paragraph" as const, content: [] }];
  const table = (headerRows: number, rows: { cells: object[] }[]) => core.documentAuthoringSchema.safeParse({ inputs: [{ key: "a", blocks: [{ kind: "table", grid: "complex", headerRows, rows }] }] });
  assert.equal(table(1, [{ cells: [{ colspan: 2, blocks: paragraph }] }, { cells: [{ blocks: paragraph }, { blocks: paragraph }] }]).success, true);
  // 300 rows of one 30-column cell would expand to 9,000 positions; the spans alone refuse it.
  const wide = table(1, Array.from({ length: 300 }, () => ({ cells: [{ colspan: 30, blocks: paragraph }] })));
  assert.match(JSON.stringify(wide.error?.issues), /grid width or table size limit/);
  assert.match(JSON.stringify(table(1, [{ cells: [{ rowspan: 2, blocks: paragraph }] }, { cells: [] }]).error?.issues), /row group/);
  assert.match(JSON.stringify(table(1, [{ cells: [{ blocks: paragraph }, { blocks: paragraph }] }, { cells: [{ blocks: paragraph }] }]).error?.issues), /Uncovered position in table row at \[1\]/);
  assert.match(JSON.stringify(table(1, [{ cells: [{ colspan: 33, blocks: paragraph }] }]).error?.issues), /grid width or table size limit/);
  // Cell blocks count toward the shared block budget.
  const blocks = Array.from({ length: core.DOCUMENT_AUTHORING_LIMITS.blocks }, () => paragraph[0]);
  assert.match(JSON.stringify(table(1, [{ cells: [{ blocks }] }]).error?.issues), /Too many blocks/);
});

function nativeSource(body: string): string {
  return `---\nlitzio: 1\n---\n\n${body}`;
}
