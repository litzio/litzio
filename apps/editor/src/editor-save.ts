import type { EditableDocument } from "@litzio/core";
import type { LocalWriteStatus, SaveRequest, SaveResponse, SupportedEdits } from "../shared/document-protocol.ts";
import { SaveContentError } from "../shared/save-error.ts";
import type { DocumentEditorHandle } from "./DocumentEditor.tsx";
import { messageOf, SaveConflictError } from "./document-session.ts";
import { SaveDisplayError } from "./save-error.ts";
import { collectSupportedEdits, toTiptapDocument, type TiptapJSON } from "./tiptap-document.ts";
import { keepsEndnoteReferences } from "./structure-lock.ts";

export type ProvisionalSave = {
  savedDocument: TiptapJSON;
  previousEdits: SupportedEdits | undefined;
  reject(status: Extract<LocalWriteStatus, {state: "rejected"}>): SaveDisplayError;
};

export type EditorSaveResult =
  | ({ kind: "saved"; payload: SupportedEdits; provisional?: ProvisionalSave } & SaveResponse)
  | { kind: "failed"; error: SaveDisplayError; conflict: boolean }
  /** The editor was replaced or unmounted while the request was pending; nothing was acknowledged. */
  | { kind: "superseded" };

/**
 * One Save of a live editor through the official write path, shared by document tabs and
 * content-editing document views. Locators stay relative to the opening `snapshot`: `base`
 * replays the previously accepted edits, so the editor is never recreated after a Save.
 * `admit` may refuse the collected edits before anything is sent.
 */
export async function saveLiveEditor(
  editor: DocumentEditorHandle,
  snapshot: EditableDocument,
  target: { path: string; revision: string; base: SaveRequest["base"]; describe?: true },
  requestSave: (body: SaveRequest) => Promise<SaveResponse>,
  current: () => boolean,
  admit?: (payload: SupportedEdits, submitted: TiptapJSON) => void,
): Promise<EditorSaveResult> {
  let submitted: TiptapJSON | undefined;
  let payload: SupportedEdits | undefined;
  try {
    submitted = editor.beginSave();
    payload = collectSupportedEdits(snapshot, submitted);
    admit?.(payload, submitted);
    const next = await requestSave({ path: target.path, revision: target.revision, base: target.base, ...payload,
      ...(target.describe ? { describe: true } : {}) });
    if (!current()) return { kind: "superseded" };
    let provisional: ProvisionalSave | undefined;
    if (next.pendingLocalWrite) {
      const checkpoint = editor.provisionalCheckpoint();
      provisional = {
        savedDocument: checkpoint.savedDocument,
        previousEdits: target.base.savedEdits,
        reject(status) {
          const failure = new SaveDisplayError(
            [new SaveContentError(status.reason, status.failure.target, status.failure)], submitted, payload,
          );
          checkpoint.reject(failure.locations);
          return failure;
        },
      };
    }
    target.base.savedEdits = payload;
    editor.finishSave(true);
    return { kind: "saved", ...next, payload, ...(provisional ? { provisional } : {}) };
  } catch (cause) {
    if (!current()) return { kind: "superseded" };
    const failure = cause instanceof SaveContentError ? cause
      : new SaveContentError(messageOf(cause), undefined, { phase: "collect", cause });
    const error = new SaveDisplayError([failure], submitted, payload);
    editor.showSaveErrors(error.locations);
    editor.finishSave();
    return { kind: "failed", error, conflict: cause instanceof SaveConflictError };
  }
}

/** Save request items that change top-level structure: block order, splits, merges,
 * insertions, deletions, heading levels, table rows and columns, and Admonition kinds. */
export function structuralEditKinds(edits: SupportedEdits): string[] {
  return [
    ...(edits.order ? ["order"] : []),
    ...(edits.splits?.length ? ["splits"] : []),
    ...(edits.merges?.length ? ["merges"] : []),
    ...(edits.inserts?.length ? ["inserts"] : []),
    ...(edits.deletes?.length ? ["deletes"] : []),
    ...(edits.headingLevels?.length ? ["headingLevels"] : []),
    ...(edits.tables?.length ? ["tables"] : []),
    ...(edits.admonitions?.some(edit => edit.variant !== undefined) ? ["admonitionKinds"] : []),
  ];
}

/** Content editing never sends a structural change, even if one got past the editor's guard.
 * With the opening snapshot and the submitted editor document, it also checks on its own that
 * every place keeps its endnote references, which Save would otherwise complete into endnote changes. */
export function admitContentEdits(edits: SupportedEdits, opening?: EditableDocument, submitted?: TiptapJSON): void {
  const kinds = [...structuralEditKinds(edits),
    ...(opening && submitted && !keepsEndnoteReferences(toTiptapDocument(opening), submitted) ? ["endnote references"] : [])];
  if (kinds.length) {
    throw new SaveContentError(`Content editing does not save structural changes (${kinds.join(", ")}).`, undefined, {
      phase: "collect", action: "Nothing was sent. Read the document again to discard this change.",
    });
  }
}
