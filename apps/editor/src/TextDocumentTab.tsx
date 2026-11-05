import { useHostClient, useHostId } from "./host-context.tsx";
import { memo, useMemo, useLayoutEffect, useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { EditorFileResponse, TextFileResponse } from "../shared/document-protocol.ts";
import { createDocumentSessionLifetime, messageOf, createDocumentRequests, SaveConflictError } from "./document-session.ts";
import { createRecoveryRecorder } from "./recovery-storage.ts";
import { useMessageState } from "./ui-message.ts";
import { i18n } from "./i18n.ts";
import type { Operation } from "./operation.ts";
import { NotificationScope } from "./components/ui/notification-center.tsx";
import { splitDocumentPath } from "./shell/document-path.ts";
import { MessageArea } from "./shell/MessageArea.tsx";
import { ExternalChangeNotice } from "./shell/ExternalChangeNotice.tsx";
import type { EditorSession } from "./DocumentTab.tsx";

import { createPortal } from "react-dom";
import { CopyButton } from "./components/CopyButton.tsx";
import { renderPlainMarkdown } from "./plain-markdown.ts";
import { openExternalLink } from "./link-opening.ts";

export type TextSessionSnapshot = { kind: "text"; file: TextFileResponse; text: string; savedSource: string };

function useTextSession(initial: TextFileResponse, restored: TextSessionSnapshot | undefined, recoveryId: string, replaceFile: (file: EditorFileResponse) => void) {
  const hostId = useHostId();
  const client = useHostClient();
  const { requestDocument, requestSave, cancelReads } = useMemo(() => createDocumentRequests(client), [client]);
  const [openedPath, setOpenedPath] = useState(initial.path);
  const pathRef = useRef(openedPath); pathRef.current = openedPath;
  const input = useRef<HTMLTextAreaElement>(null);
  const markdown = /\.md$/i.test(openedPath);
  const [view, setView] = useState<"read" | "visual">(() => markdown ? "read" : "visual");
  const text = useRef(restored?.text ?? initial.source);
  const saved = useRef(restored?.savedSource ?? initial.source);
  const revision = useRef(initial.revision);
  const [externalRevision, setExternalRevision] = useState<string | null>();
  const [documentDirty, setDirty] = useState(text.current !== saved.current);
  const [status, setStatus] = useState<Operation>("ready");
  const [reloadDialog, setReloadDialog] = useState(false);
  const [error, setError, errorCause] = useMessageState("");
  const [recoveryError, setRecoveryError] = useMessageState("");
  const lifetime = useRef(createDocumentSessionLifetime()).current;
  const busyRef = useRef(false);
  const busy = status === "saving" || status === "opening";
  busyRef.current = busy;
  const capture = useRef<() => TextSessionSnapshot | null>(() => null);
  const [recorder] = useState(() => createRecoveryRecorder(recoveryId, () => pathRef.current, () => capture.current(),
    cause => setRecoveryError({ key: "Local recovery is unavailable: {{reason}}. Keep this window open and save or copy your work. Changes after the last record may be lost.", values: { reason: messageOf(cause) } }),
    () => setRecoveryError(""), hostId));
  function getSnapshot(): TextSessionSnapshot {
    return { kind: "text", file: { kind: "text", path: pathRef.current, source: saved.current, revision: revision.current }, text: text.current, savedSource: saved.current };
  }
  const dirty = () => text.current !== saved.current;
  capture.current = () => dirty() ? getSnapshot() : null;
  useEffect(() => {
    lifetime.activate();
    if (restored) recorder.edit(dirty());
    return () => { lifetime.dispose(); cancelReads(); recorder.cancel(); };
  }, []);
  // These are the work-protection/focus capabilities the shell shares with native documents.
  const editorRef = useRef({ hasUnsavedChanges: dirty, hasDocumentChanges: dirty,
    getFocusTarget: () => input.current,
    focusEnd: (_y: number) => { input.current?.focus(); return true; } });
  function change(value: string) {
    text.current = value;
    const changed = dirty();
    setDirty(changed);
    recorder.edit(changed);
  }
  async function save(): Promise<boolean> {
    if (busyRef.current) return false;
    const current = lifetime.capture();
    busyRef.current = true; setStatus("saving"); setError("");
    const submitted = text.current;
    try {
      const next = await requestSave({ kind: "text", path: pathRef.current, revision: revision.current, source: submitted });
      if (!current()) return false;
      revision.current = next.revision;
      setExternalRevision(undefined);
      saved.current = submitted;
      const changed = dirty();
      setDirty(changed);
      if (changed) recorder.edit(); else void recorder.discard();
      setStatus(changed ? "saved-pending" : "saved");
      return true;
    } catch (cause) {
      if (!current()) return false;
      setError(cause instanceof SaveConflictError ? { key: "The file changed outside the editor. Your text is kept. Copy it before reloading the disk version." } : cause instanceof Error ? cause : messageOf(cause));
      setStatus(cause instanceof SaveConflictError ? "save-conflict" : "save-failed");
      return false;
    } finally { if (current()) busyRef.current = false; }
  }
  async function load(path: string): Promise<string | null> {
    if (busyRef.current) return null;
    const current = lifetime.beginOpen();
    busyRef.current = true; setStatus("opening"); setError(""); setReloadDialog(true);
    try {
      const file = await requestDocument("GET", path);
      if (!current()) return null;
      if ("start" in file) throw new Error("The Host did not return a document.");
      void recorder.discard();
      replaceFile(file);
      return "";
    } catch (cause) {
      if (!current()) return null;
      const reason = messageOf(cause); setError(reason); setStatus("open-failed"); return reason;
    } finally { if (current()) { busyRef.current = false; setReloadDialog(false); } }
  }
  return { client, hostId,
    kind: "text" as const, markdown, view: markdown ? view : "visual" as const, setView, currentText: text.current, editorRef, input, initialText: restored?.text ?? initial.source, change, getSnapshot,
    acknowledgedRevision: revision.current,
    externalRevision, externalChanged: externalRevision !== undefined && externalRevision !== revision.current,
    observeRevision(next: string | null, expected: string) {
      if (input.current?.isConnected && pathRef.current === openedPath && revision.current === expected && !busyRef.current) setExternalRevision(next);
    },
    openedPath, documentDirty, draftActive: false, draftNotice: "", assetPending: false,
    isCurrent: () => Boolean(input.current?.isConnected),
    busy, busyRef, setStatus, switching: status === "opening", status, save, load,
    reload: async () => { if (busyRef.current) return; if (dirty()) setReloadDialog(true); else await load(pathRef.current); },
    reloadFromDisk: async () => { await load(pathRef.current); }, reloadDialog, setReloadDialog,
    pendingWork: () => busyRef.current ? i18n.t("{{product}} is still working on the document. Try again in a moment.") : dirty() ? i18n.t("Save your changes, then restart to update.") : null,
    discardRecovery: () => recorder.discard(), suspendRecovery: () => recorder.cancel(),
    resumeRecovery: () => { if (dirty()) recorder.edit(); },
    relocate(next: string) { pathRef.current = next; setOpenedPath(next); if (dirty()) recorder.edit(); },
    recoveryError, error, errorCause,
  };
}
export type TextSession = ReturnType<typeof useTextSession>;

export const TextDocumentTab = memo(function TextDocumentTab({ id, file, restored, recoveryId, active, focused, groupIndex, onFocus, onReveal, report, replaceFile, onCompare }: {
  id: string; file: TextFileResponse; restored?: TextSessionSnapshot; recoveryId: string; active: boolean; focused: boolean; groupIndex: number;
  onFocus(id: string): void; onReveal(id: string): void; report(id: string, session: EditorSession | null): void; replaceFile(file: EditorFileResponse): void;
  onCompare(session: EditorSession): void;
}) {
  useTranslation();
  const client = useHostClient();
  const session = useTextSession(file, restored, recoveryId, replaceFile);
  const html = useMemo(() => session.markdown && session.view === "read" ? renderPlainMarkdown(session.currentText, session.openedPath, client) : "", [session.currentText, session.openedPath, session.markdown, session.view]);
  const reading = useRef<HTMLElement>(null);
  const [blocks, setBlocks] = useState<HTMLElement[]>([]);
  useLayoutEffect(() => { setBlocks(Array.from(reading.current?.querySelectorAll<HTMLElement>(".code-block") ?? [])); }, [html]);
  useLayoutEffect(() => { report(id, session); });
  useLayoutEffect(() => () => report(id, null), [id, report]);
  return <NotificationScope value={{ name: splitDocumentPath(session.openedPath).name, reveal(action) {
    onReveal(id); requestAnimationFrame(action);
  } }}>
    <ExternalChangeNotice session={session} onReveal={() => onReveal(id)} onCompare={onCompare} />
    <MessageArea onReveal={() => session.input.current?.focus()} notice="" onNoticeExpired={() => {}} error={session.status === "save-conflict" ? "" : session.error} errorCause={session.errorCause} warnings={session.recoveryError ? [{ id: "text-recovery", message: session.recoveryError }] : []} />
    <div className="document-scroll text-document-scroll" role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={!active} inert={!active}
      data-document-tab={id} data-active={focused ? "true" : "false"} data-visible={active ? "true" : "false"} data-group-index={groupIndex}
      style={{ "--editor-group-index": groupIndex } as CSSProperties} onFocusCapture={() => onFocus(id)} onPointerDownCapture={() => onFocus(id)}>
      <div className="text-document" data-view={session.view}>
        <p className="text-mode-notice" data-testid="text-mode-notice">{i18n.t(session.view === "read" ? "Markdown · Not a {{product}} document" : "Text mode · Not a {{product}} document")}</p>
        {session.markdown && session.view === "read" ? <article ref={reading} className="document-editor plain-markdown" data-testid="plain-markdown" onClick={event => {
          const anchor = event.target instanceof Element ? event.target.closest("a") : null;
          if (!anchor) return;
          event.preventDefault();
          const href = anchor.getAttribute("href") ?? "";
          if (/^#fn(?:ref)?\d+$/.test(href)) event.currentTarget.querySelector(`[id="${href.slice(1)}"]`)?.scrollIntoView({ block: "nearest" });
          else openExternalLink(href);
        }} dangerouslySetInnerHTML={{ __html: html }} /> : null}
        {blocks.map((block, index) => createPortal(<CopyButton text={block.querySelector("code")?.textContent ?? ""} label={i18n.t("Copy code")} />, block, String(index)))}
        <textarea hidden={session.view === "read"} ref={session.input} className="text-document-input" data-testid="text-editor" aria-label={i18n.t("Text editor")}
          defaultValue={session.initialText} onChange={event => session.change(event.currentTarget.value)} spellCheck={false} wrap="off" />
      </div>
    </div>
  </NotificationScope>;
});
