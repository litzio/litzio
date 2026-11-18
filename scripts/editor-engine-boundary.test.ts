import assert from "node:assert/strict";
import test from "node:test";
import { checkEditorEngineBoundary } from "./editor-engine-boundary.ts";
import { checkSourceImportBoundary } from "./source-import-boundary.ts";

test("non-Editor production layers reject editor-engine imports and models", () => {
  for (const base of ["packages/core/src", "packages/cli/src", "packages/file-commit/src", "apps/desktop/src"]) {
    for (const source of [
      'import type { Node } from "@tiptap/pm/model";',
      'export type { EditorState } from "prosemirror-state";',
      'const engine = import( "@tiptap/core");',
      'import "prosemirror-view";',
      'const engine = require("prosemirror-model");',
    ]) assert.throws(() => checkEditorEngineBoundary(`${base}/example.ts`, source), /Editor engine dependency/);
  }
});
test("Editor owns engine dependencies; neutral imports remain allowed", () => {
  assert.doesNotThrow(() => checkEditorEngineBoundary("apps/editor/src/schema.ts", 'import { Node } from "@tiptap/core";'));
  assert.doesNotThrow(() => checkEditorEngineBoundary("packages/cli/src/cli.ts", 'import { parse } from "@litzio/core";'));
});

for (const [scenario, file, source, message] of [
  ["Core import of CLI source", "packages/core/src/example.ts", 'import { run } from "../../cli/src/run.ts";', /package boundary/],
  ["CLI side-effect import of Editor UI", "packages/cli/src/example.ts", 'import "../../../apps/editor/src/setup.ts";', /CLI and Desktop may reuse Host handlers/],
  ["Editor re-export of Core MyST source", "apps/editor/src/example.ts", 'export * from "../../../packages/core/src/myst/parse.ts";', /package boundary/],
  ["Host import of Editor UI", "apps/editor/server/example.ts", 'import { render } from "../src/render.ts";', /Host and shared code/],
  ["Shared dynamic import of Editor UI", "apps/editor/shared/example.ts", 'const view = import("../src/render.ts");', /Host and shared code/],
  ["SDK side-effect React import", "packages/plugin-sdk/src/example.ts", 'import "react";', /Plugin SDK UI dependency/],
  ["SDK dynamic React import", "packages/plugin-sdk/src/example.ts", 'const ui = import("react");', /Plugin SDK UI dependency/],
  ["Spaced dynamic import across packages", "packages/core/src/example.ts", 'const cli = import ("../../cli/src/run.ts");', /package boundary/],
] as const) {
  test(scenario, () => {
    assert.throws(() => checkSourceImportBoundary(file, source), message);
  });
}

test("approved Host reuse and imports within a package remain allowed", () => {
  checkSourceImportBoundary("packages/cli/src/example.ts", 'import { start } from "../../../apps/editor/server/http.ts";');
  checkSourceImportBoundary("packages/cli/src/example.ts", 'export * from "../../../apps/editor/shared/host.ts";');
  checkSourceImportBoundary("packages/core/src/example.ts", 'import { parse } from "./myst/parse.ts";');
  checkSourceImportBoundary("packages/core/src/example.ts", 'const parser = import ("./myst/parse.ts");');
});

test("existing source boundary violations remain rejected", () => {
  assert.throws(() => checkSourceImportBoundary("packages/core/src/example.ts", 'import { render } from "../../../apps/editor/src/render.ts";'));
  assert.throws(() => checkSourceImportBoundary("packages/plugin-sdk/src/example.ts", 'export * from "react/jsx-runtime";'), /Plugin SDK UI dependency/);
});

test("Desktop can reuse Host code and all packages can import the root brand", () => {
  checkSourceImportBoundary("apps/desktop/src/example.ts", 'import { start } from "../../editor/server/http.ts";');
  checkSourceImportBoundary("apps/desktop/src/example.ts", 'export * from "../../editor/shared/host.ts";');
  checkSourceImportBoundary("packages/core/src/myst/example.ts", 'import { appName } from "../../../../brand.ts";');
  assert.throws(() => checkSourceImportBoundary("apps/desktop/src/example.ts", 'import "../../editor/src/setup.ts";'), /CLI and Desktop may reuse Host handlers/);
  assert.throws(() => checkSourceImportBoundary("packages/core/src/myst/example.ts", 'import "../../../../other.ts";'), /package boundary/);
});
