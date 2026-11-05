import assert from "node:assert/strict";
import test from "node:test";
import { checkEditorEngineBoundary } from "./editor-engine-boundary.ts";

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
