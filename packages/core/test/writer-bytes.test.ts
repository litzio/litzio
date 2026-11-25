import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse, serialize, type MystDocument } from "./core-internal.ts";
import { semanticDifference, semanticFingerprint } from "../src/myst/fingerprint.ts";
import { EXPECTED_URL, attempt, generatedCases, type Expected } from "./writer-bytes-cases.ts";
import { localWriteCorpus } from "./local-write-corpus.ts";

test("local canonical Save agrees with full write, reread and repeat on seeded edits", () => {
  const results = Object.values(localWriteCorpus(false));
  assert.ok(results.some(item => item.paragraph > 0));
  assert.ok(results.some(item => item.cell > 0));
  assert.ok(results.some(item => Object.keys(item.fallback).length > 0));
});

// A document master saved keeps its bytes; only documents master refused may now save (#1846).
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
  for (const source of ["*   a\n    \\+++\n","> a\n> \\% c\n", ":::{note}\na\n\\:::\n:::\n", "a[^1]\n\n[^1]: \\(lab)=\n"]) {
    const document = parse(source);
    assert.equal(serialize(document), source);
  }
});
