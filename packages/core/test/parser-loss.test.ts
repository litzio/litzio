import assert from "node:assert/strict";
import test from "node:test";
import { parse, serialize, writeIssueOf } from "../src/index.ts";

const loss = (pattern: RegExp) => (error: unknown) => {
  const issue = writeIssueOf(error);
  return issue.code === "parser-loss" && pattern.test(issue.reason);
};

function nestedList(depth: number, loose: boolean): string {
  return Array.from({ length: depth }, (_, index) => "  ".repeat(index) + "- Item " + (index + 1))
    .join(loose ? "\n\n" : "\n") + "\n";
}

test("a nested list preserves nine levels and refuses dropped content at ten", () => {
  for (const loose of [true, false]) {
    const tail = "\n# After the list\n\nThe final paragraph.\n";
    const markdown = serialize(parse(nestedList(9, loose) + tail));
    assert.match(markdown, /Item 9/);
    assert.match(markdown, /The final paragraph/);
    assert.throws(() => parse(nestedList(10, loose) + tail), loss(/nesting/i));
  }
});

test("depth loss is detected inside quotes and both forms of callout", () => {
  const quote = (source: string) => source.trimEnd().split("\n").map(line => "> " + line).join("\n") + "\n";
  for (const wrap of [
    quote,
    (source: string) => "> [!NOTE]\n>\n" + quote(source),
    (source: string) => ":::{note}\n" + source + ":::\n",
  ]) {
    assert.throws(() => parse(wrap(nestedList(9, true))), error => writeIssueOf(error).code === "native-content");
    assert.throws(() => parse(wrap(nestedList(10, true))), loss(/nesting/i));
  }
});

test("NUL in text, code or frontmatter refuses structured parsing", () => {
  for (const source of ["Before\0after.\n", "~~~text\nBefore\0after.\n~~~\n", "---\ntitle: Before\0after\n---\n"]) {
    assert.throws(() => parse(source), loss(/NUL/));
  }
});

test("an invalid numeric character reference refuses only where Markdown would replace it", () => {
  for (const reference of ["&#0;", "&#xD800;", "&#x110000;"]) {
    assert.throws(() => parse("Before " + reference + " after.\n"), loss(/numeric character reference/i));
  }
  assert.throws(() => parse("[Link][ref] and &#0;.\n\n[ref]: https://example.com\n"), loss(/numeric character reference/i));
  assert.throws(() => parse("![a&#0;b](example.png)\n"), loss(/numeric character reference/i));
  assert.throws(() => parse(":::{note}\nBefore &#0; after.\n:::\n"), loss(/numeric character reference/i));
  const source = "Escaped \\&#0;, code `&#0;` and &#xFFFD;.\n\n```text\n&#0;\n```\n";
  assert.equal(serialize(parse(source)), source.replace("&#xFFFD;", "\uFFFD"));
  const mermaid = ':::{figure}\n\n```{mermaid}\ngraph TD\n  A["&#0;"]\n```\n:::\n';
  assert.match(serialize(parse(mermaid)), /A\["&#0;"\]/);
  assert.match(serialize(parse(":::{figure} /path&#0;.png\n\nCaption.\n:::\n")), /path&#0;\.png/);
});

test("a pipe table refuses content beyond its header width", () => {
  const header = "| A | B |\n| --- | --- |\n";
  assert.throws(() => parse(header + "| C | D | discarded |\n"), loss(/header width/i));
  assert.throws(() => parse(":::{table}\n" + header + "| C | D | discarded |\n:::\n"), loss(/header width/i));
  assert.equal(serialize(parse(header + "| C | D |   |\n")), header + "| C | D |\n");
  assert.equal(serialize(parse(header + "| C |\n")), header + "| C | |\n");
});

test("numeric character reference loss survives nested inline parsing", () => {
  for (const source of [
    "![overview ![marker&#0;](pin.png)](overview.png)\n\nBefore.\n",
    "![overview ![detail ![marker&#0;](pin.png)](detail.png)](overview.png)\n",
    "[Label &#0;](https://example.com)\n",
    "[Label &#0;][id]\n\n[id]: https://example.com\n",
    "Text[^a].\n\n[^a]: Note &#0;.\n",
    "| Header |\n| --- |\n| Row &#0; |\n",
    "Notation {sub}`a&#0;b`.\n",
    "Notation {sup}`a&#0;b`.\n",
    ":::{figure} example.png\n\nCaption &#0;.\n:::\n",
    ":::{table} Caption &#0;.\n\n| Header |\n| --- |\n| Row |\n:::\n",
  ]) {
    assert.throws(() => parse(source), loss(/numeric character reference/i), source);
  }
});
