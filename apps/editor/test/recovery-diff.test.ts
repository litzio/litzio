import assert from "node:assert/strict";
import test from "node:test";
import { DiffBudgetError, recoveryDiff } from "../src/recovery-diff.ts";

test("unified line and word changes retain both exact sources, numbering and region counts", () => {
  const before = "old title\r\n\r\nremoved\r\n\r\nkept\r\n";
  const after = "new title\r\n\r\n\r\nkept\r\n\r\nadded";
  const diff = recoveryDiff(before, after);
  const rows = diff.groups.flatMap(group => group.rows);
  assert.equal(rows.filter(row => row.old !== undefined).map(row => row.line).join(""), before);
  assert.equal(rows.filter(row => row.next !== undefined).map(row => row.line).join(""), after);
  assert.deepEqual(rows.filter(row => row.old !== undefined).map(row => row.old), [1, 2, 3, 4, 5]);
  assert.deepEqual(rows.filter(row => row.next !== undefined).map(row => row.next), [1, 2, 3, 4, 5, 6]);
  assert.equal(diff.count, 3);
  assert.equal(diff.wordsOmitted, false);
  const pair = diff.groups.filter(group => group.change === 1);
  assert.equal(pair.length, 2);
  for (const group of pair) {
    const row = group.rows[0];
    assert.equal(row.words?.map(word => word.value).join(""), row.line);
    assert.ok(row.words?.some(word => word.added || word.removed));
  }
});

test("the reviewer's 50 × 1000-word input retains every line within 500ms and omits word highlighting", () => {
  const source = (word: string) => "---\nlitzio: 1\n---\n\n```text\n" +
    Array(50).fill(Array.from({ length: 1000 }, (_, i) => word + i).join(" ")).join("\n") + "\n```\n";
  const before = source("old"), after = source("new");
  assert.ok(Buffer.byteLength(before) > 344_000 && Buffer.byteLength(before) < 345_000);
  const start = performance.now();
  const diff = recoveryDiff(before, after);
  assert.ok(performance.now() - start < 500, "whole diff exceeded the computation budget");
  assert.equal(diff.wordsOmitted, true);
  assert.equal(diff.count, 1);
  assert.equal(diff.groups.flatMap(group => group.rows).filter(row => row.old !== undefined).map(row => row.line).join(""), before);
  assert.equal(diff.groups.flatMap(group => group.rows).filter(row => row.next !== undefined).map(row => row.line).join(""), after);
});

test("extreme character or line counts reject the whole comparison instead of returning partial lines", () => {
  assert.throws(() => recoveryDiff("a".repeat(1_000_001), ""), DiffBudgetError);
  assert.throws(() => recoveryDiff("\n".repeat(6000), "\n".repeat(6000)), DiffBudgetError);
});

import { comparisonRows } from "../src/comparison-rows.ts";
import type { EditableDocument } from "@litzio/core";
const model = (count: number): EditableDocument => ({ blocks: Array.from({ length: count }, (_, index) => ({ block: "paragraph", path: [index], text: "", content: [], editable: true })) });
test("visual layout keeps context on both sides and folds only the rest", () => {
  const rows = comparisonRows(model(10), model(10), [{ kind: "changed", before: [5], after: [5], details: [] }]);
  assert.deepEqual(rows.filter(row => row.fold === undefined).map(row => row.before), [[4], [5], [6]]);
  assert.equal(new Set(rows.flatMap(row => row.fold === undefined ? [] : [row.fold])).size, 2);
  assert.equal(rows[5].number, 1);
});
test("visual layout aligns unchanged gaps around unpaired insertions and deletions", () => {
  const added = comparisonRows(model(4), model(5), [{ kind: "added", after: [2], details: [] }]);
  assert.deepEqual(added.map(row => [row.before, row.after]), [[[0], [0]], [[1], [1]], [undefined, [2]], [[2], [3]], [[3], [4]]]);
  const removed = comparisonRows(model(5), model(4), [{ kind: "removed", before: [2], details: [] }]);
  assert.deepEqual(removed.map(row => [row.before, row.after]), [[[0], [0]], [[1], [1]], [[2], undefined], [[3], [2]], [[4], [3]]]);
});

import { comparisonDescription } from "../src/comparison-description.ts";
test("visual explanations render hidden levels and link targets without raw projection JSON", () => {
  const before: EditableDocument = { blocks: [{ block: "paragraph", path: [1], editable: true, text: "Same", content: [{ kind: "link", url: "https://example.test/v1", children: [{ kind: "text", text: "Same" }] }] }] };
  const after: EditableDocument = { blocks: [{ block: "paragraph", path: [1], editable: true, text: "Same", content: [{ kind: "link", url: "https://example.test/v2", children: [{ kind: "text", text: "Same" }] }] }] };
  const description = comparisonDescription({ before: [1], after: [1], number: 1, change: { kind: "changed", details: ['content: opaque Core-selected field'] } }, before, after);
  assert.match(description, /https:\/\/example.test\/v1.*→.*https:\/\/example.test\/v2/);
  assert.doesNotMatch(description, /"kind"|"children"/);
});
