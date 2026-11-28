import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse, serialize, type MystDocument } from "./core-internal.ts";
import { semanticDifference, semanticFingerprint } from "../src/myst/fingerprint.ts";
import { EXPECTED_URL, attempt, generatedCases, type Expected } from "./writer-bytes-cases.ts";
import { localWriteCorpus } from "./local-write-corpus.ts";
import { mystParse } from "myst-parser";
import { parse as parseNative, serialize as serializeNative } from "@litzio/core";

test("local canonical Save agrees with full write, reread and repeat on seeded edits", () => {
  const corpus = localWriteCorpus(false);
  const results = Object.values(corpus);
  assert.equal(corpus["without-frontmatter"].fallback["document-retry"], corpus["without-frontmatter"].tests);
  assert.ok(corpus["unmarked-frontmatter"].paragraph + corpus["unmarked-frontmatter"].cell > 0);
  assert.ok(corpus["adjacent-code-info"].paragraph + corpus["adjacent-code-info"].cell > 0);
  assert.ok(results.some(item => item.paragraph > 0));
  assert.ok(results.some(item => item.cell > 0));
  assert.ok(results.some(item => Object.keys(item.fallback).length > 0));
});

// The byte baseline includes the approved canonical spelling changes in #2050, #2053 and #2058.
// Cases the baseline refused may now save if they are semantic and byte-stable.
const expected = JSON.parse(readFileSync(EXPECTED_URL, "utf8")) as Expected;

function check(name: string, make: () => MystDocument, master: string | null): void {
  const output = attempt(serialize, make);
  if (master !== null) {
    assert.equal(output, master, name);
    return;
  }
  // A newly saved document reads back with the same meaning and writes the same bytes again.
  if (output === null) return;
  const reparsed = parse(output);
  assert.equal(semanticDifference(semanticFingerprint(make()), semanticFingerprint(reparsed)), undefined, name);
  assert.equal(serialize(reparsed), output, name);
}

test("repository Markdown fixtures keep master's canonical bytes", () => {
  for (const [file, { input, output }] of Object.entries(expected.fixtures)) check(file, () => parse(input), output);
});

test("line-start syntax, indentation and target-like text keep master's bytes in every context", () => {
  const cases = generatedCases(parse);
  assert.deepEqual(cases.map(([name]) => name).sort(), Object.keys(expected.generated).sort());
  for (const [name, make] of cases) check(name, make, expected.generated[name]!);
});

test("paragraph text that starts a line with MyST block syntax saves and reloads as the same text", () => {
  const paragraph = (...children: MystDocument["children"]): MystDocument =>
    ({ type: "root", children: [{ type: "paragraph", children }] });
  const text = (value: string) => ({ type: "text", value });
  for (const [document, markdown] of [
    [paragraph(text("+++")), "\\+++\n"],
    [paragraph(text("a\n+++ meta")), "a\n\\+++ meta\n"],
    [paragraph(text("%c")), "\\%c\n"],
    [paragraph(text("a\n% c")), "a\n\\% c\n"],
    [paragraph(text(":::{note}\nx\n:::")), "\\:::{note}\nx\n\\:::\n"],
    [paragraph(text("(lab)=")), "\\(lab)=\n"],
    [paragraph(text("a\n(lab)=")), "a\n\\(lab)=\n"],
    [paragraph(text("a"), { type: "break" }, text("+++ b")), "a\\\n\\+++ b\n"],
    [paragraph(text("a "), { type: "strong", children: [text("b\n+++")] }), "a **b\n\\+++**\n"],
    [paragraph({ type: "strong", children: [text("b")] }, text("\n%c")), "**b**\n\\%c\n"],
    [paragraph({ type: "link", url: "https://example.com", children: [text("b\n:::")] }), "[b\n\\:::](https://example.com)\n"],
    // Only lines MyST reads as blocks are escaped; `(측정)=` is text and keeps its bytes.
    [{ type: "root", children: [{ type: "paragraph", children: [text("(측정)=")] }, { type: "paragraph", children: [text("+++")] }] }, "(측정)=\n\n\\+++\n"],
  ] as [MystDocument, string][]) {
    const before = semanticFingerprint(structuredClone(document));
    const output = serialize(document);
    assert.equal(output, markdown);
    assert.equal(semanticDifference(before, semanticFingerprint(parse(output))), undefined, markdown);
  }
  // Inside lists, quotes, admonitions and endnotes as well.
  for (const source of ["- a\n  \\+++\n","> a\n> \\% c\n", "> [!NOTE]\n> a\n> \\:::\n", "a[^1]\n\n[^1]: \\(lab)=\n"]) {
    const document = parse(source);
    assert.equal(serialize(document), source);
  }
});

test("text keeps only the escapes that its meaning or other MyST readers need (#2058)", () => {
  const text = (value: string) => ({ type: "text", value });
  const root = (...children: MystDocument["children"]): MystDocument => ({ type: "root", children });
  const paragraph = (...children: MystDocument["children"]) => ({ type: "paragraph", children });
  const table = (value: string) => {
    const document = parse("| h |\n| --- |\n| x |\n");
    document.children[0].children![1].children![0].children![0].value = value;
    return document;
  };
  for (const [document, markdown] of [
    // CommonMark reads these as text without a backslash.
    [root(paragraph(text("Use snake_case and a_b_c names."))), "Use snake_case and a_b_c names.\n"],
    [root(paragraph(text("See [[Page]] and [[Page|alias]]."))), "See [[Page]] and [[Page|alias]].\n"],
    [root(paragraph(text("A [!x] note, [x] or [y]."))), "A [!x] note, [x] or [y].\n"],
    [root(paragraph(text("R&D & more"))), "R&D & more\n"],
    [root(paragraph(text("Embed ![[note.png]] and #tag"))), "Embed ![[note.png]] and #tag\n"],
    [root({ type: "heading", depth: 2, children: [text("Use C#")] }), "## Use C#\n"],
    // These still need one: citation shorthand for default MyST, math, line-start
    // blocks, a reference, emphasis, a pipe in a cell and a bracket in link text.
    [root(paragraph(text("[@literal] here"))), "\\[\\@literal] here\n"],
    [root(paragraph(text("[see @key]"))), "\\[see \\@key]\n"],
    [root(paragraph(text("$5 and $10"))), "\\$5 and $10\n"],
    [root(paragraph(text("# a")), paragraph(text("1. a")), paragraph(text("- a"))), "\\# a\n\n1\\. a\n\n\\- a\n"],
    [root(paragraph(text("&amp; and &#123;"))), "\\&amp; and \\&#123;\n"],
    [root(paragraph(text("_a_ word"))), "\\_a\\_ word\n"],
    [root(paragraph(text("an ![image]"))), "an \\![image]\n"],
    [root({ type: "heading", depth: 2, children: [text("Tag #")] }), "## Tag \\#\n"],
    [root(paragraph(text("a [^1] b"))), "a \\[^1] b\n"],
    [root(paragraph({ type: "link", url: "https://e.com", children: [text("a ] b")] })), "[a \\] b](https://e.com)\n"],
    [table("a | b_c"), "| h |\n| --- |\n| a \\| b_c |\n"],
  ] as [MystDocument, string][]) {
    const before = semanticFingerprint(structuredClone(document));
    const output = serialize(document);
    assert.equal(output, markdown);
    const reparsed = parse(output);
    assert.equal(semanticDifference(before, semanticFingerprint(reparsed)), undefined, markdown);
    assert.equal(serialize(reparsed), output, markdown);
    // Opens as a native document, and default MyST reads no citation.
    assert.doesNotThrow(() => parseNative(`---\nlitzio: 1\n---\n\n${output}`), markdown);
    assert.doesNotMatch(JSON.stringify(mystParse(output)), /"type":"cite(?:Group)?"/, markdown);
  }
});

test("a block whose unescaped text would read differently keeps the escapes in that block only (#2058)", () => {
  const text = (value: string) => ({ type: "text", value });
  // Unescaped, `[x](y)` is a link; the next block still drops its unneeded escapes.
  const document: MystDocument = { type: "root", children: [
    { type: "paragraph", children: [text("see [x](y) and a_b")] },
    { type: "paragraph", children: [text("snake_case")] },
  ] };
  const output = serialize(document);
  assert.equal(output, "see \\[x]\\(y) and a\\_b\n\nsnake_case\n");
  assert.equal(serialize(parse(output)), output);
  // Two and three such blocks: only they take the upstream escapes; the wiki link keeps its form.
  const header = "---\nlitzio: 1\n---\n\n";
  const two = `${header}See [[Manual]].\n\nShow \\[x](one).\n\nShow \\[y](two).\n`;
  assert.equal(serializeNative(parseNative(two)), `${header}See [[Manual]].\n\nShow \\[x]\\(one).\n\nShow \\[y]\\(two).\n`);
  const three = `${header}Show \\[x](one).\n\nSee [[Manual]] and snake_case.\n\nShow \\[y](two).\n\nShow \\[z](three) R&D.\n`;
  const written = serializeNative(parseNative(three));
  assert.equal(written, `${header}Show \\[x]\\(one).\n\nSee [[Manual]] and snake_case.\n\nShow \\[y]\\(two).\n\nShow \\[z]\\(three) R\\&D.\n`);
  assert.equal(serializeNative(parseNative(written)), written);
});
