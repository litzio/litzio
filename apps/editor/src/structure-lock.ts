import type { EditorState } from "@tiptap/pm/state";

/** Whether this editor keeps every top-level block: a content-only editor's structure guard
 * (editor-schema.tsx) is installed. Commands then move the caret instead of adding blocks. */
export function isStructureLocked(state: EditorState): boolean {
  return state.plugins.some(plugin => plugin.spec.lockStructure === true);
}
