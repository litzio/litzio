import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback, type CSSProperties } from "react";
import type { ScreenDocumentViewProps, ScreenDocumentViewState } from "@litzio/plugin-sdk";
import type { DocumentFileResponse } from "../../shared/document-protocol.ts";
import type { HostClient } from "../host-client.ts";
import { HostClientContext } from "../host-context.tsx";
import { createDocumentRequests } from "../document-session.ts";
import { DocumentEditor } from "../DocumentEditor.tsx";
import type { ReadingPosition } from "../document-reading.ts";
import { Notice } from "../ui/primitives.tsx";
import { i18n } from "../i18n.ts";
import "./screen-document-view.css";
import { useDocumentViewInteractions } from "./screen-document-view-interactions.ts";
import { useDocumentViewLayout } from "./screen-document-view-layout.ts";
import { useDocumentViewNavigation } from "./screen-document-view-navigation.ts";

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
  revision: string;
  scale: number;
  positions: ReadingPosition;
};

export function DocumentView(props: ScreenDocumentViewProps) {
  return <DocumentViewSnapshot view={props} />;
}

/** Saved snapshots only. The existing reader owns admission, bibliography and its read timeout. */
export function DocumentViewSnapshot({ view, onGeometry }: {
  view: ScreenDocumentViewProps;
  onGeometry?(geometry: DocumentViewGeometry | undefined): void;
}) {
  const { path, target, reloadKey, scale = 1, height = 480, label = i18n.t("Document preview"), onStateChange,
    onVisibleBlockChange, onBlockClick, onVisibleBlockLayoutChange } = view;
  const previewScale = Number.isNaN(scale) ? 1 : Math.max(0.4, Math.min(1, scale));
  const scope = useContext(DocumentViewScope);
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
  const request = useMemo(() => ({}), [path, reloadKey, scope?.client, scopeProblem]);
  const file = snapshot?.request === request ? snapshot.file : undefined;
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
  const stale = !!file && !!target && target.revision !== file.revision;
  const message = problem || (stale ? i18n.t("The target revision differs from this saved snapshot. Read again before navigating.")
    : unsupported ? i18n.t("The target is not a supported block or table cell in this snapshot.") : "");
  const state: ScreenDocumentViewState["state"] = problem ? "error" : !file ? "loading" : stale ? "stale-target" : unsupported ? "target-not-found" : "ready";
  useEffect(() => { notify.current?.({ state, ...(file ? { revision: file.revision } : {}), ...(message ? { message } : {}) }); }, [state, file, message]);
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
  const cancelScroll = useDocumentViewInteractions(viewport, request, file?.revision, positions, !!file && !stale && !problem, onVisibleBlockChange, onBlockClick);
  const alignTop = typeof target?.top === "number" && Number.isFinite(target.top) ? target.top : undefined;
  // request only distinguishes repeated placements; targets without top keep their value rule.
  const alignRequest = alignTop === undefined ? undefined : target?.request;
  const navigation = useDocumentViewNavigation(viewport, request, JSON.stringify([file?.revision, targetKey, target?.revision, target?.highlight, alignTop, alignRequest, reloadKey]), selected, target?.highlight === false, cancelScroll, previewScale, positions, alignTop);
  useDocumentViewLayout(viewport, request, file?.revision, positions, !!file && !stale && !problem, onVisibleBlockLayoutChange);
  useLayoutEffect(() => {
    if (!onGeometry) return;
    const element = viewport.current;
    const paper = element?.querySelector<HTMLElement>(".document");
    onGeometry(element && paper && actions.current && positions && file && !stale && !problem
      ? { viewport: element, paper, actionHost: actions.current, revision: file.revision, scale: previewScale, positions }
      : undefined);
  }, [file, stale, problem, positions, previewScale, onGeometry]);
  const reject = useCallback(() => setProblem(i18n.t("This document could not be displayed.")), []);
  const fillHeight = height === "fill";
  return <section className="screen-document-view" aria-label={label} data-state={state} data-fill-height={fillHeight || undefined}>
    {message ? <Notice tone={problem ? "error" : "warning"}>{message}</Notice> : null}
    {!file && !problem ? <p role="status">{i18n.t("Loading document…")}</p> : null}
    {file && scope && !problem ? <HostClientContext.Provider value={scope.client}>
      <div className="screen-document-view-scroll" ref={viewport} role="region" aria-label={label + " content"} tabIndex={0} style={fillHeight ? undefined : { height }} {...navigation} onKeyDownCapture={event => {
        navigation.onKeyDownCapture(event);
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); event.stopPropagation(); }
      }}>
        <div className="screen-document-view-content" style={{"--document-view-scale":previewScale} as CSSProperties}>
          {onGeometry && <div className="screen-document-view-actions" ref={actions} />}
          <DocumentEditor key={JSON.stringify([path, file.revision, reloadKey])} readOnly preview document={file.document} bibliography={file.bibliography}
            documentPath={file.path} onStructuralReject={reject} onReadingLayout={setPositions} />
          {clip ? <div className="screen-document-view-highlight-clip" style={{top:clip.top,left:clip.left,width:clip.width,height:clip.height}}>{highlight}</div> : highlight}
        </div>
      </div>
    </HostClientContext.Provider> : null}
  </section>;
}
