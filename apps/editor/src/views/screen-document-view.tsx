import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
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
import { useDocumentViewNavigation } from "./screen-document-view-navigation.ts";

/** App-owned binding, never a plugin-supplied Host or root override. */
export const DocumentViewScope = createContext<{ client: HostClient; roots: readonly string[] } | undefined>(undefined);

export function assertDocumentViewPath(path: string, roots: readonly string[]) {
  const normalized = path.replaceAll("\\", "/");
  if (!normalized || normalized.split("/").some(part => part === "." || part === "..") ||
    !roots.some(root => normalized.startsWith(root.replaceAll("\\", "/").replace(/\/$/, "") + "/"))) {
    throw new Error(i18n.t("Choose a document inside this screen's opened folders."));
  }
}

/** Saved snapshots only. The existing reader owns admission, bibliography and its read timeout. */
export function DocumentView({ path, target, reloadKey, height = 480, label = i18n.t("Document preview"), onStateChange }: ScreenDocumentViewProps) {
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
  const highlight = selected ? <div className="screen-document-view-highlight" data-testid="document-view-highlight" data-target-kind={cell ? "cell" : "block"} aria-hidden="true"
    style={{ top: selected.top - (clip?.top ?? 0), height: selected.height, ...(cell ? {left:selected.left - (clip?.left ?? 0),width:selected.width} : {}) }} /> : null;
  const navigation = useDocumentViewNavigation(viewport, request, JSON.stringify([file?.revision, targetKey, target?.revision, reloadKey]), selected);
  const reject = useCallback(() => setProblem(i18n.t("This document could not be displayed.")), []);
  return <section className="screen-document-view" aria-label={label} data-state={state}>
    {message ? <Notice tone={problem ? "error" : "warning"}>{message}</Notice> : null}
    {!file && !problem ? <p role="status">{i18n.t("Loading document…")}</p> : null}
    {file && scope && !problem ? <HostClientContext.Provider value={scope.client}>
      <div className="screen-document-view-scroll" ref={viewport} role="region" aria-label={label + " content"} tabIndex={0} style={{ height }} {...navigation} onKeyDownCapture={event => {
        navigation.onKeyDownCapture(event);
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); event.stopPropagation(); }
      }}>
        <div className="screen-document-view-content">
          <DocumentEditor key={JSON.stringify([path, file.revision, reloadKey])} readOnly preview document={file.document} bibliography={file.bibliography}
            documentPath={file.path} onStructuralReject={reject} onReadingLayout={setPositions} />
          {clip ? <div className="screen-document-view-highlight-clip" style={{top:clip.top,left:clip.left,width:clip.width,height:clip.height}}>{highlight}</div> : highlight}
        </div>
      </div>
    </HostClientContext.Provider> : null}
  </section>;
}
