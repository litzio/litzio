import type { EditableDocument } from "@litzio/core";
import type { SaveRequest, SaveResponse, SupportedEdits } from "../shared/document-protocol.ts";
import { SaveContentError } from "../shared/save-error.ts";
import type { DocumentEditorHandle } from "./DocumentEditor.tsx";
import { messageOf, SaveConflictError } from "./document-session.ts";
import { SaveDisplayError } from "./save-error.ts";
import { collectSupportedEdits, type TiptapJSON } from "./tiptap-document.ts";

export type EditorSaveResult =
  | { kind: "saved"; revision: string; payload: SupportedEdits }
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
  target: { path: string; revision: string; base: SaveRequest["base"] },
  requestSave: (body: SaveRequest) => Promise<SaveResponse>,
  current: () => boolean,
  admit?: (payload: SupportedEdits) => void,
): Promise<EditorSaveResult> {
  let submitted: TiptapJSON | undefined;
  let payload: SupportedEdits | undefined;
  try {
    submitted = editor.beginSave();
    payload = collectSupportedEdits(snapshot, submitted);
    admit?.(payload);
    const next = await requestSave({ path: target.path, revision: target.revision, base: target.base, ...payload });
    if (!current()) return { kind: "superseded" };
    target.base.savedEdits = payload;
    editor.finishSave(true);
    return { kind: "saved", revision: next.revision, payload };
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
