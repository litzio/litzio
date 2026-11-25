import { flushSync } from "react-dom";
import type { HostClient } from "./host-client.ts";
import { useHostClient } from "./host-context.tsx";
import type { UiMessage } from "./ui-message.ts";
import { useMessageState } from "./ui-message.ts";
import { i18n } from "./i18n.ts";
import { type Operation } from "./operation.ts";
import { createRecoveryRecorder } from "./recovery-storage.ts";
import type { EditorSnapshot } from "./editor-snapshot.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EditableDocument } from "@litzio/core";
import type { DocumentFileResponse, EditorFileResponse, SaveRequest, SupportedEdits } from "../shared/document-protocol.ts";
import type { DocumentEditorHandle } from "./DocumentEditor.tsx";
import type { ImageChoice, ImageChooser } from "./editor-schema.tsx";
import type { ImageRenamer } from "./image-rename.ts";
import type { FileOperationResponse } from "../shared/file-operations.ts";
import { chooseHostImage, rollbackAsset } from "./image-assets.ts";
import { createOutlineStore, type OutlineItem } from "./outline.ts";
import { SaveDisplayError, type SaveErrorLocation } from "./save-error.ts";
import type { DocumentView } from "./shell/TopBar.tsx";
import { collectSupportedEdits } from "./tiptap-document.ts";
import { createDocumentSessionLifetime, messageOf, createDocumentRequests } from "./document-session.ts";
import { saveLiveEditor, type ProvisionalSave } from "./editor-save.ts";
import { useLocalWriteVerification } from "./useLocalWriteVerification.ts";

/** Shown until the first Save of a source whose endnote definitions canonical write moves. */
const ENDNOTES_MOVE_NOTICE = "Save moves this file's endnote definitions after the body, in the order of their first reference, keeping each label and text. Source shows the Markdown Save writes.";

/** Opening model/source plus the acknowledged disk checkpoint and applied engine snapshots.
 * Shared by client recovery and the internal initialization tests. */
export type DocumentSessionSnapshot = {
  kind?: "native";
  file: DocumentFileResponse;
  editor: EditorSnapshot;
  savedEdits?: SupportedEdits;
  /** A clean candidate may have settled since its tab closed. */
  candidateRevision?: string;
};

/** One document's state and operations. The shell owns the shared work-loss confirmation. */
export function useDocumentSession(initial: DocumentFileResponse, restored?: Pick<DocumentSessionSnapshot, "editor" | "savedEdits">, recoveryId?: string, onAssetChange?: (documentPath: string, assetPath: string) => void, renameImage?: ImageRenamer, replaceFile?: (file: EditorFileResponse) => void) {
  const client = useHostClient();

  const { requestBibliography, requestDocument, requestSave, requestSource, validateFigure, cancelReads } = useMemo(() => createDocumentRequests(client), [client]);
  const renameRef = useRef(renameImage);
  renameRef.current = renameImage;
  const assetChangeRef = useRef(onAssetChange);
  assetChangeRef.current = onAssetChange;
  const [initialEditorSnapshot, setInitialEditorSnapshot] = useState(() => restored?.editor && structuredClone(restored.editor));
  const editorRef = useRef<DocumentEditorHandle>(null);
  const [recoveryError, setRecoveryError] = useMessageState("");
  const captureRef = useRef<() => DocumentSessionSnapshot | null>(() => null);
  const [openedPath, setOpenedPath] = useState(initial.path);
  const openedPathRef = useRef(openedPath);
  const [recorder] = useState(() => recoveryId ? createRecoveryRecorder(recoveryId, () => openedPathRef.current, () => captureRef.current(),
    cause => setRecoveryError({ key: "Local recovery is unavailable: {{reason}}. Keep this window open and save or copy your work. Changes after the last record may be lost.", values: { reason: messageOf(cause) } }),
    () => setRecoveryError("")) : undefined);
  const [document, setDocument] = useState<EditableDocument>(initial.document);
  const sourceRevision = useRef(initial.revision);
  const [externalRevision, setExternalRevision] = useState<string | null>();
  const pendingSave = useRef<{ revision: string; previousRevision: string; checkpoint: ProvisionalSave; awaiting: boolean } | undefined>(undefined);
  const [pendingRevision, setPendingRevision] = useState<string>();
  function clearPendingSave(): void {
    pendingSave.current = undefined;
    setPendingRevision(undefined);
  }
  const [bibliography, setBibliography] = useState(initial.bibliography);
  const [bibliographyRoot] = useState(initial.bibliographyRoot);
  const [initialBase] = useState<SaveRequest["base"]>(() => ({
    source: initial.source, ...(restored?.savedEdits ? { savedEdits: structuredClone(restored.savedEdits) } : {}),
  }));
  const sessionBase = useRef(initialBase);
  const [headingNumbering, setHeadingNumbering] = useState(false);
  const [referenceTemplates, setReferenceTemplates] = useState<import("@litzio/core").ReferenceTemplates | null>(null);
  const [reloadDialog, setReloadDialog] = useState(false);
  const [status, setStatus] = useState<Operation>("ready");
  const [error, setError, errorValue] = useMessageState("");
  const [saveLocations, setSaveLocations] = useState<readonly SaveErrorLocation[]>([]);
  const [notice, setNoticeMessage, noticeValue] = useMessageState("");
  const [noticeAction, setNoticeAction] = useState<(() => void) | null>(null);
  const noticeActionRef = useRef<(() => void) | null>(null);
  function setNotice(message: UiMessage, action?: () => void): void {
    const guarded = action ? () => {
      if (noticeActionRef.current !== guarded) return;
      setNotice("");
      action();
    } : null;
    noticeActionRef.current = guarded;
    setNoticeAction(() => guarded);
    setNoticeMessage(message);
  }
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [draftActive, setDraftActive] = useState(false);
  const [assetPending, setAssetPending] = useState(false);
  const [documentDirty, setDocumentDirty] = useState(false);
  // Outline changes on scrolling re-render the outline only, never the App and its editor.
  const outlineStore = useRef(createOutlineStore()).current;
  // The opened source writes endnote definitions elsewhere than canonical write puts them; the
  // first Save moves them. Opening never writes and does not make the document dirty.
  const [endnotesMove, setEndnotesMove] = useState(!initial.endnotesInPlace);
  const draftNotice = draftActive
    ? i18n.t("Save and Source include applied content only. Unapplied edit drafts stay unsaved until you apply them.")
    : "";
  const [view, setView] = useState<DocumentView>("visual");
  const [sourceMarkdown, setSourceMarkdown] = useState("");
  const [sourcePending, setSourcePending] = useState(false);
  const lifetime = useRef(createDocumentSessionLifetime()).current;
  const isCurrent = useMemo(() => lifetime.capture(), [lifetime, editorGeneration]);
  // A Figure's Choose… opens the image picker; its promise settles when the picker closes.
  const [imageChoice, setImageChoice] = useState<{ client: HostClient; documentPath: string; resolve(choice?: ImageChoice): void } | null>(null);
  const imageChoiceRef = useRef(imageChoice);
  const imageReturnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // StrictMode's effect cleanup/setup must not revive callbacks from the first setup.
    setEditorGeneration(lifetime.activate());
    if (restored) recorder?.edit();
    return () => {
      recorder?.cancel();
      lifetime.dispose(); cancelReads();
      imageChoiceRef.current?.resolve(undefined);
      imageChoiceRef.current = null;
    };
  }, []);

  // Stable for one editor lifetime, including its NodeViews and asynchronous asset callbacks.
  const editorCallbacks = useMemo(() => {
    const chooseImage: ImageChooser = (documentPath, returnFocus) => new Promise(resolve => {
      if (!isCurrent()) { resolve(undefined); return; }
      imageReturnFocus.current = returnFocus.current;
      imageChoiceRef.current = { client, documentPath, resolve };
      setImageChoice(imageChoiceRef.current);
    });
    return {
      onSaveLocationsChange: (locations: readonly SaveErrorLocation[]) => { if (isCurrent()) setSaveLocations(locations); },
      onNotice: (message: UiMessage, action?: () => void) => { if (isCurrent()) setNotice(message, action); },
      onDraftChange: (active: boolean) => { if (isCurrent()) setDraftActive(active); },
      onAssetPendingChange: (active: boolean) => { if (isCurrent()) setAssetPending(active); },
      onAssetChange: (path: string) => assetChangeRef.current?.(openedPathRef.current, path),
      onAssetError: (reason: string) => { if (isCurrent()) setError(reason); },
      onAppliedEdit: (dirty: boolean) => { if (isCurrent()) recorder?.edit(dirty || !!pendingSave.current); },
      onDirtyChange: (dirty: boolean) => { if (isCurrent()) setDocumentDirty(dirty); },
      onReferenceTemplatesChange: (templates: import("@litzio/core").ReferenceTemplates | null) => { if (isCurrent()) setReferenceTemplates(templates); },
      onHeadingNumberingChange: (enabled: boolean) => { if (isCurrent()) setHeadingNumbering(enabled); },
      onOutlineChange: (outline: Parameters<typeof outlineStore.set>[0]) => { if (isCurrent()) outlineStore.set(outline); },
      validateFigure,
      chooseImage,
      renameImage: (path: string, url: string, name: string) => {
        if (!renameRef.current) throw new Error("Image rename is unavailable.");
        return renameRef.current(path, url, name);
      },
      onStructuralReject: (reason?: UiMessage) => {
        if (isCurrent()) setNotice(reason ?? { key: "This change cannot preserve the supported document structure. Your document is unchanged." });
      },
    };
  }, [isCurrent, outlineStore]);
  // A pending Source preview belongs to the open document, so it blocks document switches too.
  const busy = status === "loading" || status === "opening" || status === "creating" || status === "saving" ||
    sourcePending || assetPending;
  // A close can arrive after the rendered status changed but before passive effects ran.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const switching = status === "loading" || status === "opening" || status === "creating";

  useLocalWriteVerification(client, openedPath, pendingRevision, busy, (revision, result) => {
    const pending = pendingSave.current;
    const editor = editorRef.current;
    if (!isCurrent() || busyRef.current || !editor || pending?.revision !== revision || sourceRevision.current !== revision) return;
    if (result.state === "uncorrected" || (result.state === "done" && !result.verified)) {
      pending.awaiting = false;
      setPendingRevision(undefined);
      return;
    }
    clearPendingSave();
    if (result.state === "rejected") {
      sourceRevision.current = result.revision;
      sessionBase.current.savedEdits = pending.checkpoint.previousEdits;
      setExternalRevision(undefined);
      setError(pending.checkpoint.reject(result));
      setStatus("save-failed");
      recorder?.edit();
    } else if (result.state === "corrected") {
      setExternalRevision(result.revision);
      if (!editor.hasUnsavedChanges()) {
        if (!editor.hasDocumentChanges()) void recorder?.discard();
        void reloadFromDisk(true);
      } else if (!editor.hasDocumentChanges()) void recorder?.discard();
      else recorder?.checkpoint();
    } else if (editor.hasDocumentChanges()) recorder?.checkpoint();
    else void recorder?.discard();
  });

  function acceptDocument(next: DocumentFileResponse): void {
    clearPendingSave();
    setEditorGeneration(lifetime.replace());
    imageChoiceRef.current?.resolve(undefined);
    imageChoiceRef.current = null;
    setImageChoice(null);
    setDocument(next.document);
    setBibliography(next.bibliography);
    setInitialEditorSnapshot(undefined);
    setSaveLocations([]);
    sessionBase.current = { source: next.source };
    setEndnotesMove(!next.endnotesInPlace);
    sourceRevision.current = next.revision;
    setExternalRevision(undefined);
    setOpenedPath(next.path);
    openedPathRef.current = next.path;
    setDraftActive(false);
    setAssetPending(false);
    setDocumentDirty(false);
    setSourcePending(false);
    setSourceMarkdown("");
    setView("visual");
    setStatus("ready");
  }

  /** Error message, "" on success, or null for a dialog refusal or superseded request. */
  async function load(requestedPath: string, preserveLocalEdits = false): Promise<string | null> {
    if (!isCurrent()) return null;
    const current = lifetime.beginOpen();
    setError("");
    setNotice("");
    busyRef.current = true;
    setStatus(requestedPath ? "opening" : "loading");
    try {
      const next = await requestDocument("GET", requestedPath, bibliographyRoot);
      if (!current()) return null;
      setReloadDialog(false);
      if ("start" in next) throw new Error("The Host did not return a document.");
      // Automatic reads cannot replace work entered while the GET was pending.
      // hasUnsavedChanges includes the editor's unapplied drafts.
      if (preserveLocalEdits && (!editorRef.current || editorRef.current.hasUnsavedChanges())) {
        setStatus("ready");
        return i18n.t("Changes applied on disk. Save or close your local edits before reloading the document.");
      }
      const accept = () => {
        if (!pendingSave.current) void recorder?.discard();
        if (next.kind === "text") replaceFile?.(next);
        else acceptDocument(next);
      };
      // Commit automatic replacement in this same task: an input event cannot reach
      // the old editor between the live-state check and React replacing its DOM.
      if (preserveLocalEdits) flushSync(accept); else accept();
      return "";
    } catch (cause) {
      if (!current()) return null;
      setReloadDialog(false);
      const message = messageOf(cause);
      setStatus("open-failed");
      return message;
    } finally { if (current()) busyRef.current = false; }
  }

  async function save(): Promise<boolean> {
    if (!isCurrent() || view === "read" || !document || !editorRef.current || !openedPath || !sessionBase.current || busyRef.current) return false;
    const editor = editorRef.current;
    const base = sessionBase.current;
    const previousRevision = sourceRevision.current;
    setError("");
    setNotice("");
    busyRef.current = true;
    setStatus("saving");
    try {
      const result = await saveLiveEditor(editor, document, { path: openedPath, revision: previousRevision, base }, requestSave, isCurrent);
      if (result.kind === "superseded") return false;
      if (result.kind === "failed") {
        setError(result.error);
        setStatus(result.conflict ? "save-conflict" : "save-failed");
        return false;
      }
      const { payload } = result;
      sourceRevision.current = result.revision;
      if (result.provisional) {
        pendingSave.current = { revision: result.revision, previousRevision, checkpoint: result.provisional, awaiting: true };
        setPendingRevision(result.revision);
        recorder?.edit();
        await recorder?.flush();
        if (!isCurrent()) return false;
      } else clearPendingSave();
      setExternalRevision(undefined);
      setEndnotesMove(false);
      if (payload.bibliography !== undefined && JSON.stringify(payload.bibliography) !== JSON.stringify(bibliography?.declarations ?? [])) {
        const declarations = payload.bibliography;
        const sources = await requestBibliography(openedPath, result.revision, declarations, bibliographyRoot);
        if (!isCurrent()) return false;
        setBibliography({ declarations, sources });
      }
      if (!pendingSave.current) {
        if (editor.hasDocumentChanges()) recorder?.checkpoint();
        else void recorder?.discard();
      }
      const hasPendingUserState = editor.hasUnsavedChanges();
      setStatus(hasPendingUserState ? "saved-pending" : "saved");
      return true;
    } finally { if (isCurrent()) busyRef.current = false; }
  }

  /**
   * Shows the canonical Markdown the current editor state would save as. The Host runs
   * the Save request through Core without writing; any failure keeps the Visual view.
   */
  async function showSource(): Promise<void> {
    if (!isCurrent() || !document || !editorRef.current || !openedPath || !sessionBase.current || busy) return;
    setError("");
    if (noticeActionRef.current) setNotice("");
    setSourcePending(true);
    try {
      const payload = collectSupportedEdits(document, editorRef.current.getDocument());
      const markdown = await requestSource({ path: openedPath, revision: sourceRevision.current, base: sessionBase.current, ...payload });
      if (!isCurrent()) return;
      setSourceMarkdown(markdown);
      setView("source");
    } catch (cause) {
      if (isCurrent()) setError({ key: "Source view unavailable: {{reason}}", values: { reason: messageOf(cause) } });
    } finally {
      if (isCurrent()) setSourcePending(false);
    }
  }

  /**
   * Work an update restart would lose or interrupt, as the Desktop app asks before installing:
   * the same state that guards closing the page, with the reason to show.
   */
  function pendingWork(): string | null {
    if (!document || !editorRef.current) return i18n.t("The editor is not ready to restart.");
    if (status === "saving") return i18n.t("A save is in progress. Restart to update after it finishes.");
    if (assetPending) return i18n.t("An image is still being added. Restart to update after it finishes.");
    if (sourcePending || switching) return i18n.t("{{product}} is still working on the document. Try again in a moment.");
    if (editorRef.current?.hasUnsavedChanges()) {
      return draftActive ? i18n.t("Apply or Cancel the open edits and save your changes, then restart to update.")
        : i18n.t("Save your changes, then restart to update.");
    }
    return null;
  }
  /** Navigation preserves Read; Source navigation returns to the rendered document. */
  function revealItem(item: OutlineItem): void {
    if (view !== "source") {
      editorRef.current?.revealItem(item);
      return;
    }
    setView("visual");
    requestAnimationFrame(() => { if (isCurrent()) editorRef.current?.revealItem(item); });
  }

  async function reload(): Promise<void> {
    if (!isCurrent() || busy || !openedPath) return;
    setNotice("");
    if (editorRef.current?.hasUnsavedChanges()) {
      setReloadDialog(true);
      return;
    }
    await reloadFromDisk();
  }

  async function reloadFromDisk(preserveLocalEdits = false): Promise<void> {
    if (!isCurrent()) return;
    // Keep a modal boundary during the read, so newly typed input cannot race a reload.
    setReloadDialog(true);
    const message = await load(openedPath, preserveLocalEdits);
    // load closes only its own modal; a superseded read returns no error to report.
    if (message && isCurrent()) setError(message);
  }

  async function selectImage(source: string): Promise<string> {
    if (!imageChoice || !isCurrent()) return "";
    const { documentPath, resolve } = imageChoice;
    try {
      const { path, rollbackToken } = await chooseHostImage(documentPath, source, client);
      if (rollbackToken) assetChangeRef.current?.(documentPath, path);
      // A copy no Figure ends up using is removed; a linked image is never touched.
      const discard = rollbackToken === undefined ? undefined : () => void rollbackAsset({ path, rollbackToken }, documentPath, client).finally(() => assetChangeRef.current?.(documentPath, path)).catch((cause: unknown) => {
        if (isCurrent()) setError({ key: "The unused copied image remains at {{path}}: {{reason}}", values: { path: path, reason: messageOf(cause) } });
      });
      if (!isCurrent() || imageChoiceRef.current !== imageChoice) {
        discard?.();
        resolve(undefined);
        return "";
      }
      resolve({ path, ...(discard ? { discard } : {}) });
      return "";
    } catch (cause) {
      return isCurrent() && imageChoiceRef.current === imageChoice ? messageOf(cause) : "";
    }
  }
  function closeImageChoice(): void {
    if (!isCurrent() || imageChoiceRef.current !== imageChoice) return;
    imageChoice?.resolve(undefined);
    imageChoiceRef.current = null;
    setImageChoice(null);
  }

  function getSnapshot(): DocumentSessionSnapshot {
    if (!isCurrent() || !editorRef.current) throw new Error("Editor is not ready");
    return structuredClone({
      file: { kind: "native", bibliographyRoot, ...(bibliography ? { bibliography: { declarations: bibliography.declarations } } : {}), path: openedPathRef.current, document, source: sessionBase.current.source, revision: sourceRevision.current, endnotesInPlace: sessionBase.current.savedEdits !== undefined || !endnotesMove },
      editor: editorRef.current.getSnapshot(),
      ...(sessionBase.current.savedEdits ? { savedEdits: sessionBase.current.savedEdits } : {}),
    });
  }

  captureRef.current = () => {
    const pending = pendingSave.current;
    if (!isCurrent() || (!pending && !editorRef.current?.hasDocumentChanges())) return null;
    const snapshot = getSnapshot();
    if (pending) {
      snapshot.file.revision = pending.previousRevision;
      snapshot.savedEdits = pending.checkpoint.previousEdits;
      snapshot.editor.savedDocument = pending.checkpoint.savedDocument;
      if (!editorRef.current?.hasDocumentChanges()) snapshot.candidateRevision = pending.revision;
    }
    return snapshot;
  };

  return {
    client, kind: "native" as const,
    recoveryError, discardRecovery: () => pendingSave.current ? undefined : recorder?.discard(),
    suspendRecovery: () => recorder?.cancel(),
    resumeRecovery: () => { if (pendingSave.current || editorRef.current?.hasDocumentChanges()) recorder?.edit(); },
    relocate(next: string) {
      openedPathRef.current = next;
      setOpenedPath(next);
      if (pendingSave.current || editorRef.current?.hasDocumentChanges()) recorder?.edit();
    },
    async appliedSource(): Promise<string> {
      if (!editorRef.current) throw new Error("Editor is not ready");
      return requestSource({ path: openedPathRef.current, revision: sourceRevision.current, base: sessionBase.current,
        ...collectSupportedEdits(document, editorRef.current.getSnapshot().editorDocument) });
    },
    acknowledgedRevision: sourceRevision.current,
    externalRevision, externalChanged: externalRevision !== undefined && externalRevision !== sourceRevision.current,
    observeRevision(revision: string | null, expected: string) {
      if (!isCurrent() || openedPathRef.current !== openedPath || sourceRevision.current !== expected || busyRef.current || pendingSave.current?.awaiting) return;
      setExternalRevision(revision);
      if (pendingSave.current) return;
      if (revision !== null && revision !== sourceRevision.current && revision !== externalRevision && editorRef.current && !editorRef.current.hasUnsavedChanges()) {
        void reloadFromDisk(true);
      }
    },
    savePreviewRequest(): SaveRequest {
      if (!isCurrent() || !editorRef.current || !document || busy) throw new Error("Editor is not ready");
      return structuredClone({ path: openedPathRef.current, revision: sourceRevision.current, base: sessionBase.current,
        ...collectSupportedEdits(document, editorRef.current.getDocument()) });
    },
    getSnapshot, initialEditorSnapshot, editorRef, document, bibliography, openedPath, headingNumbering, referenceTemplates, outlineStore, editorGeneration, isCurrent,
    imageRenameRevision: () => sourceRevision.current,
    imageRenameSources: () => editorRef.current?.imageRenameSources() ?? [],
    acceptImageRename(result: NonNullable<FileOperationResponse["figureDocument"]>) {
      const editor = editorRef.current;
      if (!editor) throw new Error("Editor is not ready");
      editor.renameImagePaths(result.replacements);
      if (sourceRevision.current !== result.revision) sessionBase.current.savedEdits = collectSupportedEdits(document, editor.getSnapshot().savedDocument);
      sourceRevision.current = result.revision;
      setExternalRevision(undefined);
      if (editor.hasDocumentChanges()) recorder?.edit();
      else if (!pendingSave.current) void recorder?.discard();
    },
    view, setView, sourceMarkdown, status, setStatus, error, setError, errorCause: errorValue, notice, setNotice, noticeCause: noticeValue, noticeAction,
    saveFailure: errorValue instanceof SaveDisplayError ? errorValue : undefined,
    saveLocations,
    revealSaveLocation(index: number) {
      const location = saveLocations[index];
      if (!location) return;
      if (view !== "source") { editorRef.current?.revealSaveLocation(location); return; }
      setView("visual");
      requestAnimationFrame(() => { if (isCurrent()) editorRef.current?.revealSaveLocation(location); });
    },
    draftActive, assetPending, documentDirty, busy, switching, busyRef, draftNotice,
    documentNotice: endnotesMove ? i18n.t(ENDNOTES_MOVE_NOTICE) : "",
    load, save, showSource, reload, reloadFromDisk, reloadDialog, setReloadDialog,
    pendingWork, revealItem,
    imageChoice, imageReturnFocus, selectImage, closeImageChoice,
    editorCallbacks,
  };
}

export type DocumentSession = ReturnType<typeof useDocumentSession>;
