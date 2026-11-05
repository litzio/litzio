import assert from "node:assert/strict";
import test from "node:test";
import { compareDocuments, parse, serialize } from "@litzio/core";
const native = (body: string) => `---\nlitzio: 1\n---\n\n${body}\n`;
const compare = (a: string, b: string) => compareDocuments(parse(native(a)), parse(native(b)));

test("comparison ignores canonical source and mark nesting order, not block meaning", () => {
  const document = parse(native("***Both***\n\n| A | B |\n| --- | --- |\n| 1 | 2 |"));
  assert.deepEqual(compareDocuments(document, parse(serialize(document))), { changes: [], documentChanged: false });
  assert.equal(compare("**_Both_**", "_**Both**_").changes.length, 0);
  assert.equal(compare("A\n\nB", "A\n\n\nB").changes.length, 0);
});

test("comparison includes hidden properties, marks, destinations and atomic technical blocks", () => {
  for (const [a, b, property] of [
    ["## Title", "### Title", "level"],
    ["Text", "**Text**", "content"],
    ["[Link](https://a.test)", "[Link](https://b.test)", "content"],
    ["| A |\n| --- |\n| 1 |", "| A |\n| --- |\n| 2 |", "rows"],
    ["| A |\n| --- |\n| 1 |", "| A |\n| --- |\n| 1 |\n| 2 |", "rows"],
    ["```{math}\n:label: eq-a\nx\n```", "```{math}\n:label: eq-b\nx\n```", "label"],
    ["```{math}\nx\n```", "```{math}\ny\n```", "latex"],
    [":::{figure} ./a.png\n\nCaption\n:::", ":::{figure} ./b.png\n\nCaption\n:::", "imageUrl"],
    [":::{figure} ./a.png\n\nCaption\n:::", ":::{figure} ./a.png\n\nNew caption\n:::", "caption"],
    [":::{figure}\n\n```{mermaid}\ngraph LR\nA-->B\n```\n:::", ":::{figure}\n\n```{mermaid}\ngraph LR\nA-->C\n```\n:::", "mermaidSource"],
  ]) {
    const result = compare(a, b);
    assert.equal(result.changes.length, 1, `${property}: one atomic block`);
    assert.equal(result.changes[0].kind, "changed", property);
    assert.match(result.changes[0].details.join(" "), new RegExp(property));
    assert.deepEqual(result.changes[0].before, [1]);
    assert.deepEqual(result.changes[0].after, [1]);
  }
});

test("repeated blocks use sequence matching; reordering remains removal and addition", () => {
  const result = compare("A\n\nB\n\nA\n\nC", "B\n\nA\n\nC\n\nA");
  assert.equal(result.changes.filter(change => change.kind === "changed").length, 0);
  assert.equal(result.changes.filter(change => change.kind === "removed").length, 1);
  assert.equal(result.changes.filter(change => change.kind === "added").length, 1);
  assert.equal(compare("A\n\nA", "A\n\nB\n\nA").changes[0].kind, "added");
});

test("frontmatter values compare semantically while comments are source-only", () => {
  const a = parse('---\nlitzio: 1\ntitle: Old\n---\n\nText\n');
  const b = parse('---\ntitle: Old # comment\nlitzio: 1\n---\n\nText\n');
  assert.equal(compareDocuments(a, b).documentChanged, false);
  assert.equal(compareDocuments(a, parse('---\nlitzio: 1\ntitle: New\n---\n\nText\n')).documentChanged, true);
});
