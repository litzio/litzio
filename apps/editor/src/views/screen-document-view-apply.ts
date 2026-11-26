import { useEffect, useReducer, useRef, useState } from "react";
import type { ScreenDocumentApplyState, ScreenDocumentViewApply } from "@litzio/plugin-sdk";
import type { DocumentFileResponse } from "../../shared/document-protocol.ts";
import type { DocumentEditorHandle } from "../DocumentEditor.tsx";
import type { DocumentViewAttrs } from "../document-view-change.ts";
import { freshBlockPath, toTiptapBlock, type TiptapJSON } from "../tiptap-document.ts";
import { i18n } from "../i18n.ts";
import type { ContentEditSession } from "./screen-document-view-editing.ts";

/** A change shown before its write: what it replaced, to put it back. */
type Pending = { request: string | number; revision: string; from: number; count: number; nodes: TiptapJSON[]; attrs: DocumentViewAttrs;
  reading?: AbortController };

/**
 * A change screen code is writing, shown first (#1995). The view replaces only the changed blocks
 * and holds input. When the screen code reports the written revision, the view reads that file
 * in the background and continues from it without recreating the editor; when it reports a
 * failure, the view puts back what it replaced. State belongs to the mounted view and one read.
 */
export function useDocumentViewApply(options: {
  apply: ScreenDocumentViewApply | undefined;
  /** The current read; a new one (reload, path, edit mode) recreates the editor and drops the change. */
  read: object;
  file: DocumentFileResponse | undefined;
  revision: string | undefined;
  session: ContentEditSession | undefined;
  editor(): DocumentEditorHandle | null;
  reread(signal: AbortSignal): Promise<DocumentFileResponse>;
  /** The written file, for the same read. */
  adopt(file: DocumentFileResponse): void;
  /** The written file could not be read. */
  fail(message: string): void;
  onState?(state: ScreenDocumentApplyState): void;
}): { applying: boolean; failure: string; retry(): void } {
  const latest = useRef(options); latest.current = options;
  const pending = useRef<Pending | undefined>(undefined);
  const decided = useRef(new Set<string | number>());
  const [applying, setApplying] = useState(false);
  const [failure, setFailure] = useState("");
  const [attempt, retry] = useReducer((count: number) => count + 1, 0);

  useEffect(() => () => {
    pending.current?.reading?.abort();
    pending.current = undefined;
    setApplying(false);
    setFailure("");
  }, [options.read]);

  const { apply, file, revision, session } = options;
  useEffect(() => {
    const { editor: editorOf, onState } = latest.current;
    const report = (request: string | number, state: ScreenDocumentApplyState["state"], at: string, message?: string) =>
      onState?.({ request, state, revision: at, ...(message ? { message } : {}) });
    const putBack = (current: Pending, message: string) => {
      current.reading?.abort();
      pending.current = undefined;
      try { editorOf()?.applyViewChange(current.from, current.count, current.nodes, current.attrs); }
      catch { /* An editor gone with its read has nothing to put back. */ }
      session?.hold(false);
      setApplying(false);
      setFailure(message);
      report(current.request, "failed", current.revision, message);
    };

    const current = pending.current;
    if (current) {
      if (!apply) {
        putBack(current, i18n.t("The change was withdrawn before its write finished."));
        retry();
        return;
      }
      // One change at a time: a newer one is refused, and the shown one still waits for its outcome.
      if (apply.request !== current.request) {
        if (!decided.current.has(apply.request)) {
          decided.current.add(apply.request);
          report(apply.request, "refused", current.revision, i18n.t("Another change is still waiting for its write."));
        }
        return;
      }
      if (apply.failed !== undefined) { putBack(current, apply.failed || i18n.t("The change could not be saved.")); return; }
      if (apply.saved === undefined || current.reading) return;
      const reading = current.reading = new AbortController();
      void latest.current.reread(reading.signal).then(written => {
        if (reading.signal.aborted || pending.current !== current) return;
        editorOf()?.rebaseView(written.document);
        pending.current = undefined;
        session?.hold(false);
        latest.current.adopt(written);
        setApplying(false);
        report(current.request, "saved", written.revision);
      }).catch((error: unknown) => {
        if (reading.signal.aborted || pending.current !== current) return;
        pending.current = undefined;
        setApplying(false);
        const message = error instanceof Error ? error.message : String(error);
        latest.current.fail(message);
        report(current.request, "failed", current.revision, message);
      });
      return;
    }

    if (!apply || decided.current.has(apply.request)) return;
    const refuse = (message: string) => {
      decided.current.add(apply.request);
      report(apply.request, "refused", revision ?? apply.revision, message);
    };
    const editor = editorOf();
    if (!file || !editor || !revision || file.document.blocks.length === 0) return refuse(i18n.t("The document is not shown yet."));
    // Replacing blocks would break an input method composition: decide once it ends.
    if (editor.isComposing()) return;
    if (apply.revision !== revision) return refuse(i18n.t("The view shows another revision of the document."));
    if (session?.pending()) return refuse(i18n.t("The view has edits that are not saved yet."));
    try {
      const { change } = apply;
      // Blocks shown ahead of their write are new to this read until it adopts the written file.
      const nodes = change.blocks.map(block => {
        const node = toTiptapBlock(block);
        return { ...node, attrs: { ...node.attrs, sourcePath: freshBlockPath() } };
      });
      const { document } = change;
      const { inserted, ...replaced } = editor.applyViewChange(change.from, change.removed, nodes, {
        title: document.title ?? null, status: document.status ?? null,
        headingNumbering: document.headingNumbering ?? null, referenceTemplates: document.referenceTemplates ?? null,
      });
      decided.current.add(apply.request);
      pending.current = { request: apply.request, revision, from: change.from, count: inserted, ...replaced };
      session?.hold(true);
      setApplying(true);
      setFailure("");
      report(apply.request, "pending", revision);
    } catch (error) {
      refuse(error instanceof Error ? error.message : String(error));
    }
  }, [apply?.request, apply?.saved, apply?.failed, apply, file, revision, session, attempt]);

  return { applying, failure, retry };
}
