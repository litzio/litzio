/**
 * The Editor ↔ Core bridge. Core → Tiptap projection lives in tiptap-projection.ts; Tiptap →
 * SupportedEdits collection and structure validation in tiptap-edits.ts. This module keeps the
 * bridge's public surface in one place.
 */
export type { TiptapJSON } from "./tiptap-inline.ts";
export {
  isNewBlockPath,
  paragraphContent,
  TABLE_CELL_SOURCE_ATTR,
  toTiptapBlock,
  toTiptapDocument,
} from "./tiptap-projection.ts";
export {
  appliedDocument,
  assertSupportedDocumentChange,
  collectSupportedEdits,
  DELETED_PATHS_ATTR,
  figureContent,
  freshBlockPath,
  isSessionPlaceholder,
  isSupportedDocumentChange,
  normalizeEngineDocument,
} from "./tiptap-edits.ts";
