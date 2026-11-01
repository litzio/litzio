import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { checkPluginSources } from "@litzio/plugin-api/build";
import { checkFeatureBoundaries } from "../scripts/check-boundaries.ts";
import { fileURLToPath } from "node:url";

test("conversion and comparison meet only through shared file formats, including erased/dynamic imports", t => {
  checkFeatureBoundaries(fileURLToPath(new URL("../src", import.meta.url)));
  const root = mkdtempSync(path.join(tmpdir(), "docling-features-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const area of ["conversion", "comparison", "shared"]) mkdirSync(path.join(root, area));
  for (const [area, code] of [
    ["conversion", 'import type { ComparisonSnapshot } from "../comparison/compare.ts";'],
    ["comparison", 'const load = () => import("../conversion/convert.ts");'],
    ["shared", 'export * from "../conversion/source.ts";'],
    ["conversion", 'export * from "../host.ts";'],
  ]) {
    const file = path.join(root, area, "test.ts"); writeFileSync(file, code);
    assert.throws(() => checkFeatureBoundaries(root), /cannot import/u);
    writeFileSync(file, 'import type { DoclingMap } from "../shared/map.ts";');
  }
  assert.doesNotThrow(() => checkFeatureBoundaries(root));
});

test("plugin boundary includes erased, dynamic and nested imports and package dependencies", t => {
  const root = mkdtempSync(path.join(tmpdir(), "plugin-boundary-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "src/nested"), { recursive: true }); mkdirSync(path.join(root, "scripts"));
  const manifest = path.join(root, "package.json"), source = path.join(root, "src/nested/check.ts");
  writeFileSync(manifest, JSON.stringify({ dependencies: { "@litzio/core": "*", "@litzio/plugin-api": "*" } }));
  for (const text of [
    'import type { Editor } from "@tiptap/core";',
    'type Private = import("@litzio/core/src/myst/parse.ts");',
    'export * from "@litzio/file-commit";',
    'import type { Host } from "../../../../apps/editor/server/plugin-host.ts";',
    'const load = () => import("@litzio/editor");',
    'const load = (name: string) => import(name);',
  ]) { writeFileSync(source, text); assert.throws(() => checkPluginSources(root), /cannot import|must be static/u, text); }
  writeFileSync(source, 'import type { EditableDocument } from "@litzio/core"; import type { UiHost } from "@litzio/plugin-api/ui";');
  assert.doesNotThrow(() => checkPluginSources(root));
  writeFileSync(manifest, JSON.stringify({ dependencies: { "@litzio/editor": "*" } }));
  assert.throws(() => checkPluginSources(root), /cannot depend/u);
});
