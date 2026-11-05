import { test } from "node:test";
import assert from "node:assert/strict";
import { validateView, parseView, serializeView, rowsSchema } from "../src/views/index.ts";
import fs from "node:fs";
const example = JSON.parse(fs.readFileSync(new URL("../../../spikes/dynamic-ui/example.view.json", import.meta.url), "utf8"));
test("canonical spec is stable and excludes data", () => {
  const source = serializeView(example); assert.equal(serializeView(parseView(source)), source);
  assert.equal(source.includes('"rows"'), false);
});
test("finite catalog rejects executable, unbounded and invalid bindings", () => {
  const mutations = [
    (v: any) => v.layout.children[0].component = "HTML",
    (v: any) => v.layout.children[0].html = "<script>alert(1)</script>",
    (v: any) => v.layout.children[0].style = "body{display:none}",
    (v: any) => v.layout.children[0].onClick = "alert(1)",
    (v: any) => v.title = "<b>title</b>",
    (v: any) => v.title = "javascript:alert(1)",
    (v: any) => v.title = "https://example.com",
    (v: any) => v.sources.stats.args.url = "https://example.com",
    (v: any) => v.sources.stats.operation = "file.delete",
    (v: any) => v.layout.children[0].columns = ["authorEmail"],
    (v: any) => v.layout.children[1].y = "modified",
    (v: any) => v.layout.children[0].data = "/secret",
    (v: any) => v.schemaVersion = 10,
    (v: any) => v.title = "x".repeat(20000),
  ];
  for (const mutate of mutations) { const value = structuredClone(example); mutate(value); assert.throws(() => validateView(value)); }
  assert.throws(() => rowsSchema.parse(Array.from({ length: 101 }, () => ({ folder: "x", documents: 0, headings: 0, modified: null }))));
});
