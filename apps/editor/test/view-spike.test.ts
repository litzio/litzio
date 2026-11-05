import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { viewOperations } from "../server/view-spike.ts";
const example = JSON.parse(fs.readFileSync(new URL("../../../spikes/dynamic-ui/example.view.json", import.meta.url), "utf8"));
test("shared Host run/save/reopen preserves query, refreshes data and rejects stale writes and root escape", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-view-spike-"));
  try {
    fs.mkdirSync(path.join(root, "beta"));
    fs.copyFileSync(path.resolve("apps/editor/document/technical-document.md"), path.join(root, "beta/one.md"));
    const ops = viewOperations(root), file = path.join(root, "report.view.json");
    const first = ops.run(example); assert.equal("documents" in first.rows[0]! && first.rows[0].documents, 1);
    const saved = ops.save(file, example, null);
    assert.deepEqual(ops.run(ops.read(file).view).rows, first.rows);
    assert.throws(() => ops.save(file, example, null));
    assert.throws(() => ops.save(file, example, "stale"));
    ops.save(file, example, saved.revision);
    fs.copyFileSync(path.join(root, "beta/one.md"), path.join(root, "beta/two.md"));
    const refreshed = ops.run(ops.read(file).view).rows[0]!;
    assert.equal("documents" in refreshed && refreshed.documents, 2);
    assert.throws(() => ops.save(path.join(root, "../outside.view.json"), example, null));
    assert.throws(() => ops.read(path.join(root, "../outside.view.json")));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
