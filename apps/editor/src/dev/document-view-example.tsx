import { useTranslation } from "react-i18next";
import { useState, useRef } from "react";
import { getEditableDocument, parse } from "@litzio/core";
import { DocumentViewScope } from "../views/screen-document-view.tsx";
import { screenUI as ui } from "../views/screen-ui.ts";
import type { ScreenDocumentViewState, ScreenDocumentViewProps } from "@litzio/plugin-sdk";
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
    manualList.current = false;
    const index = document.blocks.findIndex(block => JSON.stringify(block.path) === JSON.stringify(blockPath));
    const item = list.current?.children[index] as HTMLElement | undefined;
    if (item && list.current) list.current.scrollTop = item.offsetTop - list.current.offsetTop;
  };
  const [state, setState] = useState<ScreenDocumentViewState>();
  return <DocumentViewScope.Provider value={{ client, roots: extraFolder ? ["/example", "/unrelated"] : ["/example"] }}>
    <ui.ScreenLayout title="Document view" description="Synthetic saved snapshot. The application renderer owns text, tables, equations and references.">
      <ui.Toolbar><ui.Button variant="outline" onClick={() => setStale(value => !value)}>Toggle stale target</ui.Button>
        <ui.Button variant="outline" onClick={() => setReload(value => value + 1)}>Read again</ui.Button>
        <ui.Button variant="outline" onClick={() => { setFollowing(undefined); setColumn(value => 11-value); }}>Select other cell</ui.Button>
        <ui.Button variant="outline" onClick={() => setNarrow(value => !value)}>Toggle preview width</ui.Button>
        <ui.Button variant="outline" aria-pressed={extraFolder} onClick={() => setExtraFolder(value => !value)}>Toggle unrelated folder</ui.Button>
        <span aria-label="Document reads">{reads}</span><ui.Status variant="plain" tone={state?.state === "ready" ? "ok" : state?.state === "loading" ? "progress" : "warning"} label={state ? stateLabels[state.state] : t("Ready")} /></ui.Toolbar>
      <div style={{display:"flex",flexWrap:"wrap",gap:"var(--space-4)"}}>
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
          <ui.Button onClick={() => setFollowing({revision,path:block.path,highlight:false})}>Source block {index+1}</ui.Button>
        </div>)}
      </div>
      <div style={{width:narrow?260:undefined,flex:narrow?"0 1 260px":"2 1 320px",minWidth:0,maxWidth:"100%"}}><ui.DocumentView path={path} height={480} reloadKey={reloadKey} onVisibleBlockChange={followSource} onBlockClick={followSource} target={following ? {...following,revision:stale ? "b".repeat(64) : revision} : { revision: stale ? "b".repeat(64) : revision, path: document.blocks.find(block => block.block === "table")!.rows[1].cells[column].path }} onStateChange={setState} /></div></div>
    </ui.ScreenLayout>
  </DocumentViewScope.Provider>;
}
