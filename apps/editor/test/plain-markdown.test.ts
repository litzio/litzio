import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPlainMarkdown } from "../src/plain-markdown.ts";

test("untrusted Markdown cannot introduce active HTML or unsafe destinations", () => {
  const html = renderPlainMarkdown(`<script>alert(1)</script>
<img src=x onerror=alert(1)>
<iframe src="https://example.com"></iframe><object data="x"></object>

[x](javascript:alert%281%29) ![x](javascript:alert%281%29)
[x](other.md) ![x](file:///secret.png) ![x](//example.com/a.png)

$\\href{javascript:alert(1)}{bad}$
`, "/root/readme.md");
  assert.doesNotMatch(html, /<(script|iframe|object|img)\b/i);
  assert.doesNotMatch(html, /(?:href|src)="(?:javascript:|file:|other.md|\/\/)/i);
  assert.doesNotMatch(html, /<[^>]+\sonerror=/i);
});

test("reading extensions and Host-relative images preserve display only", () => {
  const html = renderPlainMarkdown("# Title\n\n| A |\n| --- |\n| B |\n\n- [x] Done\n\n$x+1$[^n]\n\n[^n]: Note\n\n![alt](../image.svg)\n\n```mermaid\ngraph LR\n```", "/root/readme.md");
  for (const expected of ['<h1', '<table', 'disabled=""', 'class="katex"', 'footnote', '/document/..%2Fimage.svg?path=%2Froot%2Freadme.md', 'language-mermaid']) assert.ok(html.includes(expected), expected);
});
