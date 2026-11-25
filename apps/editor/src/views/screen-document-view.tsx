import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useCallback, type CSSProperties } from "react";
import type { ScreenDocumentViewProps, ScreenDocumentViewState } from "@litzio/plugin-sdk";
import type { DocumentFileResponse } from "../../shared/document-protocol.ts";
import type { HostClient } from "../host-client.ts";
import { HostClientContext } from "../host-context.tsx";
import { createDocumentRequests } from "../document-session.ts";
import { DocumentEditor, type DocumentEditorHandle } from "../DocumentEditor.tsx";
import { Button } from "../components/ui/button.tsx";
import type { ReadingPosition } from "../document-reading.ts";
import { Notice } from "../ui/primitives.tsx";
import { MessageArea } from "../shell/MessageArea.tsx";
import { useNotifications } from "../components/ui/notification-center.tsx";
import { messageText, type UiMessage } from "../ui-message.ts";
import { i18n } from "../i18n.ts";
import "./screen-document-view.css";
import { useDocumentViewInteractions } from "./screen-document-view-interactions.ts";
import { useDocumentViewLayout } from "./screen-document-view-layout.ts";
import { useDocumentViewNavigation } from "./screen-document-view-navigation.ts";
import { createContentEditSession } from "./screen-document-view-editing.ts";

/** As long as the window's other short notices. */
const REFUSAL_NOTICE_MS = 5000;

/** App-owned binding, never a plugin-supplied Host or root override. */
export const DocumentViewScope = createContext<{ client: HostClient; roots: readonly string[] } | undefined>(undefined);

function assertDocumentViewPath(path: string, roots: readonly string[]) {
  const normalized = path.replaceAll("\\", "/");
  if (!normalized || normalized.split("/").some(part => part === "." || part === "..") ||
    !roots.some(root => normalized.startsWith(root.replaceAll("\\", "/").replace(/\/$/, "") + "/"))) {
    throw new Error(i18n.t("Choose a document inside this screen's opened folders."));
  }
}

export type DocumentViewGeometry = {
  viewport: HTMLDivElement;
  paper: HTMLElement;
  actionHost: HTMLDivElement;
  /** The latest saved revision shown. */
  revision: string;
  /** Paths of this revision address the view: the one it read or one its own Saves continued. */
  accepts(revision: string): boolean;
  scale: number;
  positions: ReadingPosition;
};

export function DocumentView(props: ScreenDocumentViewProps) {
  return <DocumentViewSnapshot view={props} />;
}

/** A saved snapshot, read-only or with content editing. The existing reader owns admission,
 * bibliography and its read timeout; content editing saves through the official write path. */
export function DocumentViewSnapshot({ view, onGeometry }: {
  view: ScreenDocumentViewProps;
  onGeometry?(geometry: DocumentViewGeometry | undefined): void;
}) {
  const { target, scale = 1, height = 480, label = i18n.t("Document preview"), onStateChange,
    onVisibleBlockChange, onBlockClick, onVisibleBlockLayoutChange, onEditStateChange, onSave } = view;
  const previewScale = Number.isNaN(scale) ? 1 : Math.max(0.4, Math.min(1, scale));
  const scope = useContext(DocumentViewScope);
  // Unsaved edits hold a new path, reloadKey or mode until they are saved (see the effect below).
  const wanted = { path: view.path, reloadKey: view.reloadKey, edit: view.editContent === true };
  const [shown, setShown] = useState(wanted);
  const [discarded, discardEdits] = useReducer((count: number) => count + 1, 0);
  const [, editChanged] = useReducer((count: number) => count + 1, 0);
  const editorRef = useRef<DocumentEditorHandle>(null);
  const sessionRef = useRef<ReturnType<typeof createContentEditSession>>(undefined);
  const differs = shown.path !== wanted.path || shown.reloadKey !== wanted.reloadKey || shown.edit !== wanted.edit;
  const holding = differs && !!sessionRef.current?.pending();
  const { path, reloadKey, edit } = differs && !holding ? wanted : shown;
  let scopeProblem = "";
  try {
    if (!scope) throw new Error("DocumentView requires a plugin screen's Host and opened folders.");
    assertDocumentViewPath(path, scope.roots);
  } catch (error) { scopeProblem = String((error as Error).message); }
  const [snapshot, setSnapshot] = useState<{ request: object; file: DocumentFileResponse }>();
  const [problem, setProblem] = useState("");
  const [positions, setPositions] = useState<ReadingPosition>();
  const viewport = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const notify = useRef(onStateChange); notify.current = onStateChange;
  const request = useMemo(() => ({}), [path, reloadKey, edit, discarded, scope?.client, scopeProblem]);
  const file = snapshot?.request === request ? snapshot.file : undefined;
  const saved = useRef(onSave); saved.current = onSave;
  // The provider's value is a new object on each screen render; the session lives for one read.
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const lastSession = useRef<ReturnType<typeof createContentEditSession>>(undefined);
  const session = useMemo(() => file && edit ? createContentEditSession({
    snapshot: file,
    // Reading again a file still at a revision this view saved keeps the same paths.
    continues: lastSession.current?.path === file.path && lastSession.current.accepts(file.revision) ? lastSession.current.revisions() : undefined,
    editor: () => editorRef.current,
    requestSave: body => {
      const current = scopeRef.current;
      if (!current) throw new Error("DocumentView requires a plugin screen's Host and opened folders.");
      current.client.assertCurrent();
      assertDocumentViewPath(body.path, current.roots);
      return createDocumentRequests(current.client).requestSave(body);
    },
    onChange: editChanged,
    onSave: save => saved.current?.(save),
  }) : undefined, [file, edit]);
  sessionRef.current = session;
  if (session) lastSession.current = session;
  useEffect(() => {
    session?.activate();
    return () => session?.dispose();
  }, [session]);
  const notifyEdit = useRef(onEditStateChange); notifyEdit.current = onEditStateChange;
  const editState = session?.state, editRevision = session?.revision, editError = session?.error;
  useEffect(() => {
    if (!editState || !editRevision) return;
    notifyEdit.current?.({ state: editState, revision: editRevision, ...(editError ? { message: editError.message } : {}) });
  }, [editState, editRevision, editError]);
  useEffect(() => {
    if (!differs) return;
    if (!holding) { setShown(wanted); return; }
    // Save first; read again only after that Save succeeds. A failure keeps its state and the edits.
    void sessionRef.current?.flush().then(ok => { if (ok) editChanged(); });
  });
  const latestRevision = session?.revision ?? file?.revision;
  const accepts = useCallback((revision: string) => session ? session.accepts(revision) : revision === file?.revision, [session, file]);
  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(undefined); setProblem(""); setPositions(undefined);
    void (async () => {
      if (!scope) throw new Error("DocumentView requires a plugin screen's Host and opened folders.");
      assertDocumentViewPath(path, scope.roots);
      scope.client.assertCurrent();
      const result = await createDocumentRequests(scope.client).requestDocument("GET", path, undefined, controller.signal);
      controller.signal.throwIfAborted(); scope.client.assertCurrent();
      if (!("kind" in result) || result.kind !== "native") throw new Error(i18n.t("This input file is not supported."));
      assertDocumentViewPath(result.path, scope.roots);
      setSnapshot({ request, file: result });
    })().catch(error => { if (!controller.signal.aborted) setProblem(String(error.message ?? error)); });
    return () => controller.abort();
  }, [request]);

  const targetKey = JSON.stringify(target?.path);
  const block = file && target && file.document.blocks.find(block =>
    JSON.stringify(block.path) === targetKey || block.block === "table" && block.rows.some(row => row.cells.some(cell => JSON.stringify(cell.path) === targetKey)));
  const cell = block && block.block === "table" && block.rows.flatMap((row, rowIndex) => row.cells.map((cell, column) => ({cell, row:rowIndex, column}))).find(value => JSON.stringify(value.cell.path) === targetKey);
  const location = block && (cell ? positions?.cells.find(position => position.table === JSON.stringify(block.path) && position.row === cell.row && position.column === cell.column)
    : positions?.blocks.find(position => position.key === JSON.stringify(block.path)));
  const unsupported = !!file && !!target && !block;
  const stale = !!file && !!target && !accepts(target.revision);
  const message = problem || (stale ? i18n.t("The target revision differs from this saved snapshot. Read again before navigating.")
    : unsupported ? i18n.t("The target is not a supported block or table cell in this snapshot.") : "");
  const state: ScreenDocumentViewState["state"] = problem ? "error" : !file ? "loading" : stale ? "stale-target" : unsupported ? "target-not-found" : "ready";
  useEffect(() => { notify.current?.({ state, ...(latestRevision ? { revision: latestRevision } : {}), ...(message ? { message } : {}) }); }, [state, latestRevision, message]);
  const selected = !stale && location;
  const clip = selected && "clip" in selected ? selected.clip : undefined;
  const highlight = selected && target?.highlight !== false ? <div className="screen-document-view-highlight" data-testid="document-view-highlight" data-target-kind={cell ? "cell" : "block"} aria-hidden="true"
    // Reading geometry is measured after zoom; paint with the same zoom as the paper.
    style={{
      top: (selected.top - (clip?.top ?? 0)) / previewScale,
      left: (selected.left - (clip?.left ?? 0)) / previewScale,
      width: selected.width / previewScale,
      height: selected.height / previewScale,
    }} /> : null;
  const cancelScroll = useDocumentViewInteractions(viewport, request, latestRevision, positions, !!file && !stale && !problem, onVisibleBlockChange, onBlockClick);
  const alignTop = typeof target?.top === "number" && Number.isFinite(target.top) ? target.top : undefined;
  // With top, only revision, path, top and request place the target again; highlight changes only the highlight.
  // Targets without top keep their value rule, including highlight.
  const placement = alignTop === undefined ? [target?.highlight] : [alignTop, target?.request];
  // A Save by this view keeps paths and places nothing again; only another target revision does.
  const targetRevision = target && accepts(target.revision) ? file?.revision : target?.revision;
  const navigation = useDocumentViewNavigation(viewport, request, JSON.stringify([file?.revision, targetKey, targetRevision, ...placement, reloadKey]), selected, alignTop === undefined && target?.highlight === false, cancelScroll, previewScale, positions, alignTop);
  useDocumentViewLayout(viewport, request, latestRevision, positions, !!file && !stale && !problem, onVisibleBlockLayoutChange);
  useLayoutEffect(() => {
    if (!onGeometry) return;
    const element = viewport.current;
    const paper = element?.querySelector<HTMLElement>(".document");
    onGeometry(element && paper && actions.current && positions && file && latestRevision && !stale && !problem
      ? { viewport: element, paper, actionHost: actions.current, revision: latestRevision, accepts, scale: previewScale, positions }
      : undefined);
  }, [file, latestRevision, accepts, stale, problem, positions, previewScale, onGeometry]);
  const fillHeight = height === "fill";
  const [notice, setNotice] = useState<UiMessage>("");
  // A refused edit or copy leaves the document unchanged. Say so briefly instead of failing the view:
  // a warning card of the window's notification center, which shows without taking focus.
  const [refusal, setRefusal] = useState<UiMessage>("");
  const reject = useCallback((reason?: UiMessage) => setRefusal(reason ?? { key: "This change cannot preserve the supported document structure. Your document is unchanged." }), []);
  useEffect(() => { setNotice(""); setRefusal(""); }, [path, file?.revision, reloadKey]);
  useEffect(() => {
    if (!refusal) return;
    const timer = setTimeout(() => setRefusal(""), REFUSAL_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [refusal]);
  const refusalText = refusal ? messageText(refusal) : "";
  useNotifications(refusalText ? [{ id: `document-view-refused:${refusalText}`, message: refusalText, severity: "warning", testId: "document-view-refused" }] : []);
  return <section className="screen-document-view" aria-label={label} data-state={state} data-edit-state={session?.state} data-fill-height={fillHeight || undefined}
    onBlur={event => { if (session && !event.currentTarget.contains(event.relatedTarget as Node | null)) void session.flush(); }}>
    <MessageArea error="" notice={messageText(notice)} noticeCause={notice} onNoticeExpired={() => setNotice("")} />
    {message ? <Notice tone={problem ? "error" : "warning"}>{message}</Notice> : null}
    {session?.state === "conflict" ? <Notice tone="warning" className="screen-document-view-notice" data-testid="document-view-conflict">
      <p>{i18n.t("This document changed outside this view. Your edits are kept here but cannot be saved.")}</p>
      <Button variant="outline" size="sm" onClick={discardEdits}>{i18n.t("Read again (discard edits)")}</Button>
    </Notice> : session?.state === "failed" && session.error ? <Notice tone="error" className="screen-document-view-notice" data-testid="document-view-save-error">
      <p>{session.error.message}</p>
    </Notice> : null}
    {!file && !problem ? <p role="status">{i18n.t("Loading document…")}</p> : null}
    {file && scope && !problem ? <HostClientContext.Provider value={scope.client}>
      <div className="screen-document-view-scroll" ref={viewport} role="region" aria-label={label + " content"} tabIndex={0} style={fillHeight ? undefined : { height }} {...navigation} onKeyDownCapture={event => {
        navigation.onKeyDownCapture(event);
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault(); event.stopPropagation();
          void session?.flush(true);
        }
      }} onCompositionEnd={() => session?.compositionEnded()}>
        <div className="screen-document-view-content" style={{"--document-view-scale":previewScale} as CSSProperties}>
          {onGeometry && <div className="screen-document-view-actions" ref={actions} />}
          <DocumentEditor key={JSON.stringify([path, file.revision, reloadKey, edit])} ref={editorRef} readOnly={!session} preview contentOnly={!!session}
            document={file.document} bibliography={file.bibliography}
            documentPath={file.path} onStructuralReject={reject} onReadingLayout={setPositions} onNotice={setNotice}
            {...session ? {
              onDirtyChange: (dirty: boolean) => session.dirty(dirty),
              onAppliedEdit: () => session.edited(),
              onBlockLeave: () => void session.flush(),
              // An edit form (equation source, inline math, link) applied or closed.
              onDraftChange: (active: boolean) => { if (!active) setTimeout(() => void session.flush()); },
            } : {}} />
          {clip ? <div className="screen-document-view-highlight-clip" style={{top:clip.top,left:clip.left,width:clip.width,height:clip.height}}>{highlight}</div> : highlight}
        </div>
      </div>
    </HostClientContext.Provider> : null}
  </section>;
}
