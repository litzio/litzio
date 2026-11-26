import type { ScreenDocumentEditState } from "@litzio/plugin-sdk";
import type { DocumentFileResponse, LocalWriteStatus, SavedBlock, SaveRequest, SaveResponse } from "../../shared/document-protocol.ts";
import type { DocumentEditorHandle } from "../DocumentEditor.tsx";
import { admitContentEdits, saveLiveEditor, type ProvisionalSave } from "../editor-save.ts";
import type { SaveDisplayError } from "../save-error.ts";

export type ContentEditState = ScreenDocumentEditState["state"];

/**
 * Content editing of one mounted document view, for the lifetime of one read. The editor is
 * never recreated by a Save: the opening snapshot's NodePaths stay valid, so every revision this
 * view's own Saves continued from the read is accepted for targets and correspondences.
 * Saves run one at a time; a conflict keeps the edits and stops saving until the view reads again.
 */
export function createContentEditSession(options: {
  snapshot: DocumentFileResponse;
  /** Revisions a previous read of this view accepted, when this read found the file at one of them. */
  continues?: readonly string[];
  editor(): DocumentEditorHandle | null;
  requestSave(body: SaveRequest): Promise<SaveResponse>;
  /** State, revision or error changed. */
  onChange(): void;
  onSave(save: { previousRevision: string; revision: string; blocks?: SavedBlock[] }): void;
}) {
  const { snapshot } = options;
  const base: SaveRequest["base"] = { source: snapshot.source };
  const own = new Set([...options.continues ?? [], snapshot.revision]);
  let latest = snapshot.revision;
  let pending: { revision: string; checkpoint: ProvisionalSave } | undefined;
  let state: ContentEditState = "clean";
  let error: SaveDisplayError | undefined;
  let edits = 0, failedEdits = -1;
  let deferred = false, disposed = false, held = false;
  let running: Promise<boolean> | null = null, queued: Promise<boolean> | null = null;

  const set = (next: ContentEditState, failure?: SaveDisplayError) => {
    if (next === state && failure === error) return;
    state = next; error = failure;
    options.onChange();
  };

  async function save(explicit: boolean): Promise<boolean> {
    const editor = options.editor();
    if (disposed || !editor || state === "conflict" || held) return false;
    if (!editor.hasDocumentChanges()) {
      if (state !== "clean") set("clean");
      return true;
    }
    // A failed Save is retried on request or after a further edit, not on every block change.
    if (!explicit && state === "failed" && edits === failedEdits) return false;
    // Leaving a block can arrive inside a composition; save once it ends.
    if (editor.isComposing()) { deferred = true; return false; }
    const previousRevision = latest;
    set("saving");
    const result = await saveLiveEditor(editor, snapshot.document, { path: snapshot.path, revision: latest, base, describe: true },
      options.requestSave, () => !disposed, (payload, submitted) => admitContentEdits(payload, snapshot.document, submitted));
    if (result.kind === "superseded") return false;
    if (result.kind === "failed") {
      failedEdits = edits;
      set(result.conflict ? "conflict" : "failed", result.error);
      return false;
    }
    own.add(result.revision);
    latest = result.revision;
    pending = result.provisional && { revision: result.revision, checkpoint: result.provisional };
    set(editor.hasDocumentChanges() ? "unsaved" : "clean");
    options.onSave({ previousRevision, revision: result.revision, ...(result.blocks ? { blocks: result.blocks } : {}) });
    return true;
  }

  function run(explicit: boolean): Promise<boolean> {
    const current = save(explicit).finally(() => { if (running === current) running = null; });
    running = current;
    return current;
  }

  return {
    get state() { return state; },
    get revision() { return latest; },
    get pendingLocalWrite() { return pending?.revision; },
    settle(previous: string, result: Exclude<LocalWriteStatus, { state: "pending" }>): "reload" | undefined {
      if (disposed || state === "saving" || latest !== previous || pending?.revision !== previous) return;
      if (result.state === "uncorrected" || (result.state === "done" && !result.verified)) return;
      const { checkpoint } = pending;
      pending = undefined;
      if (result.state === "rejected") {
        own.delete(previous);
        latest = result.revision;
        base.savedEdits = checkpoint.previousEdits;
        failedEdits = edits;
        set("failed", checkpoint.reject(result));
      } else if (result.state === "corrected") {
        if (options.editor()?.hasUnsavedChanges()) set("conflict");
        else return "reload";
      } else options.onChange();
    },
    get path() { return snapshot.path; },
    get error() { return error; },
    accepts(revision: string) { return own.has(revision); },
    revisions(): readonly string[] { return [...own]; },
    /** Unsaved applied edits, or a Save in progress. */
    pending() { return state === "saving" || !!options.editor()?.hasDocumentChanges(); },
    /** The editor's applied content differs (or no longer differs) from the last acknowledged Save. */
    dirty(changed: boolean) {
      if (held) return;
      if (state === "clean" || state === "unsaved" || (state === "failed" && !changed)) set(changed ? "unsaved" : "clean");
    },
    edited() { edits++; },
    /** A change shown before its write (screen-document-view-apply.ts) holds Saves; the view reports saving. */
    hold(value: boolean) {
      if (held === value) return;
      held = value;
      if (value) set("saving");
      else set(options.editor()?.hasDocumentChanges() ? "unsaved" : "clean");
    },
    compositionEnded() {
      if (!deferred) return;
      deferred = false;
      void this.flush();
    },
    /** Save the applied edits, after any Save in progress. explicit: the user asked (Ctrl+S). */
    flush(explicit = false): Promise<boolean> {
      if (queued) return queued;
      if (running) {
        const next = running.then(() => { queued = null; return run(explicit); });
        queued = next;
        return next;
      }
      return run(explicit);
    },
    // An effect cleanup followed by setup again (as StrictMode may repeat) keeps the session usable.
    activate() { disposed = false; },
    dispose() { disposed = true; },
  };
}

export type ContentEditSession = ReturnType<typeof createContentEditSession>;
