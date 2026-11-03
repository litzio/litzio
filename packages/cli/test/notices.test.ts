import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectPackages, packageDirectory, packageNotices } from "../../../scripts/third-party-notices.ts";

test("bundle discovery does not suppress Editor dependencies; internal metadata and hyphenated notices", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-notices-"));
  const files: string[] = [], dirs = [root];
  const dir = (relative: string) => { const p = path.join(root, relative); mkdirSync(p); dirs.push(p); return p; };
  const file = (directory: string, name: string, content: string) => { const p = path.join(directory, name); writeFileSync(p, content); files.push(p); return p; };
  try {
    const editor = dir("editor");
    file(editor, "package.json", JSON.stringify({ name: "fixture-editor", version: "1", dependencies: { child: "1" } }));
    file(editor, "LICENSE", "Editor permission");
    const internal = dir("editor/dist");
    file(internal, "package.json", '{"type":"commonjs"}');
    const input = file(internal, "index.js", "");
    dir("editor/node_modules");
    const child = dir("editor/node_modules/child");
    file(child, "package.json", '{"name":"child","version":"1","license":"MIT"}');
    const license = file(child, "LICENSE-MIT.txt", "Child copyright and permission");
    assert.equal(packageDirectory(input), realpathSync(editor));
    const packages = collectPackages([input], [editor]);
    assert.ok(packages.has(realpathSync(child)));
    assert.match(packageNotices(packages), /Child copyright and permission/);
    writeFileSync(license, "");
    assert.throws(() => packageNotices(packages), /Missing license text: child@1/);
  } finally {
    files.reverse().forEach(p => unlinkSync(p));
    dirs.reverse().forEach(p => rmdirSync(p));
  }
});
