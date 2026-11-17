import { useTranslation } from "react-i18next";
import { useState, useRef, useLayoutEffect, useCallback } from "react";
import { getEditableDocument, parse } from "@litzio/core";
import { DocumentViewScope } from "../views/screen-document-view.tsx";
import { screenUI as ui } from "../views/screen-ui.ts";
import type { ScreenDocumentViewState, ScreenDocumentViewLayout, ScreenDocumentViewProps } from "@litzio/plugin-sdk";
import type { HostClient } from "../host-client.ts";

const columns = Array.from({length:12}, (_, index) => `Column ${index+1}`);
const source = "---\nlitzio: 1\ntitle: Document view example\n---\n\nSaved snapshots use the same renderer as document tabs.\n\n| " + columns.join(" | ") + " |\n| " + columns.map(() => "---").join(" | ") + " |\n| " + columns.map((_, index) => index === 11 ? "18" : `Source ${index+1}`).join(" | ") + " |\n\n$$\nE=mc^2\n$$\n" + Array.from({length:24}, (_, index) => `\nSource passage ${index + 1}. Synthetic material for side-by-side reading.\n`).join("\n") + "\n\n- Source list\n  - Nested source item\n";
const document = getEditableDocument(parse(source));
const revision = "a".repeat(64), path = "/example/report.md";

/** Synthetic saved snapshot; the gallery never reads or writes a user's files. */
export function DocumentViewExample() {
  const {t} = useTranslation();
  const stateLabels = {loading:t("Loading…"),ready:t("Ready"),error:t("Error"),"stale-target":t("The saved document has changed."),"target-not-found":t("Target not found. Check the target address or identifier.")};
  const [reads, setReads] = useState(0), [extraFolder, setExtraFolder] = useState(false);
  const [client] = useState<HostClient>(() => ({ assertCurrent() {}, url: path => path, crossOrigin: undefined,
    async request() { setReads(value => value + 1); return Response.json({ kind: "native", path, source, document, revision }); } }));
  const [reloadKey, setReload] = useState(0), [stale, setStale] = useState(false), [column, setColumn] = useState(11), [narrow, setNarrow] = useState(false);
  const list = useRef<HTMLDivElement>(null), manualList = useRef(false);
  const [following, setFollowing] = useState<ScreenDocumentViewProps["target"]>();
  const followSource = ({path: blockPath}: {path: readonly number[]}) => {
    // The latest user input wins over a delayed settled report from the other pane.
    if (manualList.current) return;
    const index = document.blocks.findIndex(block => JSON.stringify(block.path) === JSON.stringify(blockPath));
    const item = list.current?.children[index] as HTMLElement | undefined;
    if (item && list.current) list.current.scrollTop = item.offsetTop;
  };
  // Screen-owned refs and SVG: only vertical block geometry comes from DocumentView.
  const pair = useRef<HTMLDivElement>(null), preview = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<ScreenDocumentViewLayout>();
  const [lines, setLines] = useState<{key:string; x1:number; y1:number; x2:number; y2:number}[]>([]);
  const connect = useCallback(() => {
    const host = pair.current, source = list.current;
    const view = preview.current?.querySelector<HTMLElement>('[role="region"]');
    if (!host || !source || !view) { setLines([]); return; }
    const box = host.getBoundingClientRect(), from = source.getBoundingClientRect(), to = view.getBoundingClientRect();
    setLines((layout?.blocks ?? []).flatMap(block => {
      const index = document.blocks.findIndex(item => JSON.stringify(item.path) === JSON.stringify(block.path));
      const row = source.children[index]?.getBoundingClientRect();
      if (!row || row.bottom <= from.top || row.top >= from.bottom || from.right >= to.left) return [];
      return [{key:JSON.stringify(block.path), x1:from.right-box.left, y1:Math.max(from.top,Math.min(from.bottom,(row.top+row.bottom)/2))-box.top,
        x2:to.left-box.left, y2:to.top+view.clientTop+Math.max(0,Math.min(layout!.height,(block.top+block.bottom)/2))-box.top}];
    }));
  }, [layout]);
  useLayoutEffect(() => {
    connect();
    const observer = new ResizeObserver(connect);
    if(pair.current) observer.observe(pair.current);
    list.current?.addEventListener("scroll",connect);
    return () => {observer.disconnect();list.current?.removeEventListener("scroll",connect);};
  }, [connect]);
  const [state, setState] = useState<ScreenDocumentViewState>();
  return <DocumentViewScope.Provider value={{ client, roots: extraFolder ? ["/example", "/unrelated"] : ["/example"] }}>
    <ui.ScreenLayout title="Document view" description="Synthetic saved snapshot. The application renderer owns text, tables, equations and references.">
      <ui.Toolbar><ui.Button variant="outline" onClick={() => setStale(value => !value)}>Toggle stale target</ui.Button>
        <ui.Button variant="outline" onClick={() => setReload(value => value + 1)}>Read again</ui.Button>
        <ui.Button variant="outline" onClick={() => { setFollowing(undefined); setColumn(value => 11-value); }}>Select other cell</ui.Button>
        <ui.Button variant="outline" onClick={() => setNarrow(value => !value)}>Toggle preview width</ui.Button>
        <ui.Button variant="outline" aria-pressed={extraFolder} onClick={() => setExtraFolder(value => !value)}>Toggle unrelated folder</ui.Button>
        <span aria-label="Document reads">{reads}</span><ui.Status variant="plain" tone={state?.state === "ready" ? "ok" : state?.state === "loading" ? "progress" : "warning"} label={state ? stateLabels[state.state] : t("Ready")} /></ui.Toolbar>
      <div ref={pair} style={{display:"flex",flexWrap:"wrap",gap:"var(--space-12)",position:"relative"}}>
      <div ref={list} role="region" aria-label="Source passages" tabIndex={0}
        style={{height:480,overflow:"auto",position:"relative",flex:"1 1 200px",minWidth:0}}
        onWheel={() => {manualList.current = true;}} onKeyDown={() => {manualList.current = true;}}
        onPointerDown={event => {if(event.target === event.currentTarget) manualList.current = true;}}
        onScroll={event => {
          if (!manualList.current) return;
          const index = [...event.currentTarget.children].findIndex(child => (child as HTMLElement).offsetTop + child.clientHeight > event.currentTarget.scrollTop);
          const block = document.blocks[index];
          if(block) setFollowing({revision,path:block.path,highlight:false});
        }}>
        {document.blocks.map((block,index) => <div key={JSON.stringify(block.path)} style={{minHeight:120,padding:"var(--space-3)"}}>
          <ui.Button onClick={() => { manualList.current = true; setFollowing({revision,path:block.path,highlight:false}); }}>Source block {index+1}</ui.Button>
        </div>)}
      </div>
      <div ref={preview} onWheelCapture={() => {manualList.current = false;}} onKeyDownCapture={() => {manualList.current = false;}} onPointerDownCapture={() => {manualList.current = false;}} style={{width:narrow?260:undefined,flex:narrow?"0 1 260px":"2 1 320px",minWidth:0,maxWidth:"100%"}}><ui.DocumentView path={path} height={480} reloadKey={reloadKey} onVisibleBlockLayoutChange={setLayout} onVisibleBlockChange={followSource} onBlockClick={followSource} target={following ? {...following,revision:stale ? "b".repeat(64) : revision} : { revision: stale ? "b".repeat(64) : revision, path: document.blocks.find(block => block.block === "table")!.rows[1].cells[column].path }} onStateChange={setState} /></div><svg aria-hidden="true" data-testid="document-view-connectors" style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",overflow:"hidden"}}>
        {lines.map(line => <line key={line.key} data-path={line.key} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="var(--id-color-accent)" strokeWidth={2} />)}
      </svg></div>
    </ui.ScreenLayout>
  </DocumentViewScope.Provider>;
}
