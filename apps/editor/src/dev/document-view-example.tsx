import { useTranslation } from "react-i18next";
import { useState, useRef, useLayoutEffect, useMemo } from "react";
import { getEditableDocument, parse } from "@litzio/core";
import { DocumentViewScope } from "../views/screen-document-view.tsx";
import { ScreenFrame } from "../components/ui/task-header.tsx";
import { screenUI as ui } from "../views/screen-ui.ts";
import type { ScreenDocumentViewState, ScreenDocumentViewProps, ScreenLinkedDocumentItem } from "@litzio/plugin-sdk";
import type { HostClient } from "../host-client.ts";

const columns = Array.from({length:12}, (_, index) => `Column ${index+1}`);
const source = "---\nlitzio: 1\ntitle: Document view example\n---\n\nSaved snapshots use the same renderer as document tabs.\n\n| " + columns.join(" | ") + " |\n| " + columns.map(() => "---").join(" | ") + " |\n| " + columns.map((_, index) => index === 11 ? "18" : `Source ${index+1}`).join(" | ") + " |\n\n$$\nE=mc^2\n$$\n\n:::{figure} " + new URL("./document-view-diagram.svg", import.meta.url).href + "\n:alt: Synthetic diagram\n\nSynthetic diagram\n:::\n" + Array.from({length:24}, (_, index) => `\nSource passage ${index + 1}. Synthetic material for side-by-side reading.\n`).join("\n") + "\n\n- Source list\n  - Nested source item\n";
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
  const [fillHeight, setFillHeight] = useState(false);
  const [scale,setScale] = useState(1);
  const list = useRef<HTMLDivElement>(null), manualList = useRef(false);
  const [following, setFollowing] = useState<ScreenDocumentViewProps["target"]>();
  const followSource = ({path: blockPath}: {path: readonly number[]}) => {
    // The latest user input wins over a delayed settled report from the other pane.
    if (manualList.current) return;
    const index = document.blocks.findIndex(block => JSON.stringify(block.path) === JSON.stringify(blockPath));
    const item = list.current?.children[index] as HTMLElement | undefined;
    if (item && list.current) list.current.scrollTop = item.offsetTop;
  };
  const [state, setState] = useState<ScreenDocumentViewState>();
  return <DocumentViewScope.Provider value={{ client, roots: extraFolder ? ["/example", "/unrelated"] : ["/example"] }}>
    <div className="task-surface gallery-document-view"><ScreenFrame title="Document view">
    <ui.ScreenLayout fillHeight={fillHeight} actions={<ui.Button aria-pressed={fillHeight} onClick={() => setFillHeight(value => !value)}>Fill available height</ui.Button>} description="Synthetic saved snapshot. The application renderer owns text, tables, equations and references.">
      <ui.Toolbar><ui.Button variant="outline" onClick={() => setScale(value => value === 1 ? 0.5 : 1)}>Scale {scale}</ui.Button><ui.Button variant="outline" onClick={() => setStale(value => !value)}>Toggle stale target</ui.Button>
        <ui.Button variant="outline" onClick={() => setReload(value => value + 1)}>Read again</ui.Button>
        <ui.Button variant="outline" onClick={() => { setFollowing(undefined); setColumn(value => 11-value); }}>Select other cell</ui.Button>
        <ui.Button variant="outline" onClick={() => setNarrow(value => !value)}>Toggle preview width</ui.Button>
        <ui.Button variant="outline" aria-pressed={extraFolder} onClick={() => setExtraFolder(value => !value)}>Toggle unrelated folder</ui.Button>
        <span aria-label="Document reads">{reads}</span><ui.Status variant="plain" tone={state?.state === "ready" ? "ok" : state?.state === "loading" ? "progress" : "warning"} label={state ? stateLabels[state.state] : t("Ready")} /></ui.Toolbar>
      <div style={{display:"flex",flexWrap:fillHeight?"nowrap":"wrap",flex:fillHeight?1:undefined,minHeight:0,gap:fillHeight?"var(--space-4)":"var(--space-12)"}}>
      <div ref={list} role="region" aria-label="Source passages" tabIndex={0}
        style={{height:fillHeight?undefined:480,overflow:"auto",position:"relative",flex:"1 1 200px",minWidth:0}}
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
      <div onWheelCapture={() => {manualList.current = false;}} onKeyDownCapture={() => {manualList.current = false;}} onPointerDownCapture={() => {manualList.current = false;}} style={{width:narrow?260:undefined,flex:narrow?"0 1 260px":fillHeight?"1 1 200px":"2 1 320px",minWidth:0,maxWidth:"100%"}}><ui.DocumentView path={path} scale={scale} height={fillHeight ? "fill" : 480} reloadKey={reloadKey} onVisibleBlockChange={followSource} onBlockClick={followSource} target={following ? {...following,revision:stale ? "b".repeat(64) : revision} : { revision: stale ? "b".repeat(64) : revision, path: document.blocks.find(block => block.block === "table")!.rows[1].cells[column].path }} onStateChange={setState} /></div></div>
    </ui.ScreenLayout></ScreenFrame></div>
  </DocumentViewScope.Provider>;
}

const samplePassages = [
  "Check the water level before switching on the pump.",
  "Set the flow control to its lowest setting. Open the inlet valve slowly and wait until the pressure gauge holds steady.",
  "Record the flow rate after two minutes.",
  "Close the inlet valve before disconnecting the test line.",
];

export function LinkedDocumentViewExample() {
  const { i18n } = useTranslation();
  const korean = i18n.resolvedLanguage === "ko";
  const [large, setLarge] = useState(false);
  const [stale, setStale] = useState(false);
  const [fillHeight, setFillHeight] = useState(false);
  const [scale, setScale] = useState(1);
  const [selected, select] = useState<string>();
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!viewport) return;
    const measure = () => setWidth(viewport.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(viewport, { box: "content-box" });
    measure();
    return () => observer.disconnect();
  }, [viewport]);
  const sample = useMemo(() => {
    const passages = korean ? [
      "펌프를 켜기 전에 수위를 확인하세요.",
      "유량 조절기를 가장 낮게 설정하세요. 흡입 밸브를 천천히 열고 압력계 표시가 안정될 때까지 기다리세요.",
      "2분 뒤 유량을 기록하세요.",
      "시험용 배관을 분리하기 전에 흡입 밸브를 닫으세요.",
    ] : samplePassages;
    const body = Array.from({ length: large ? 1200 : 24 }, (_, index) =>
      `${index + 1} · ${passages[index % passages.length]}`).join("\n\n");
    const title = korean ? "펌프 검사 절차" : "Pump inspection procedure";
    const source = `---\nlitzio: 1\ntitle: ${title}\n---\n\n${body}\n`;
    const samplePath = large ? "/example/large-procedure.md" : "/example/procedure.md";
    const document = getEditableDocument(parse(source));
    const client: HostClient = { assertCurrent() {}, url: value => value, crossOrigin: undefined,
      async request() { return Response.json({ kind: "native", path: samplePath, source, document, revision }); } };
    return { document, samplePath, client };
  }, [large, korean]);
  const pitch = 64 * scale, inset = 16 * scale, height = 48 * scale;
  const items = useMemo<ScreenLinkedDocumentItem[]>(() => sample.document.blocks.map((block, index) => ({
    id: String(index + 1),
    label: korean ? `원본 구역 ${index + 1}` : `Source section ${index + 1}`,
    path: block.path,
    boxes: [{ left: inset, top: inset + pitch * index, width: width - 2 * inset, height }],
    colorToken: index % 3 === 1 ? "--id-color-warning" : "--id-color-info",
  })), [sample, korean, inset, pitch, width, height]);
  return <DocumentViewScope.Provider value={{ client: sample.client, roots: ["/example"] }}>
    <div className="task-surface gallery-document-view"><ScreenFrame title={korean ? "문서 블록 대조" : "Linked document view"}>
    <ui.ScreenLayout fillHeight={fillHeight} actions={<ui.Button aria-pressed={fillHeight} onClick={() => setFillHeight(value => !value)}>
      {korean ? "남은 높이 채우기" : "Fill available height"}
    </ui.Button>}>
      <ui.Toolbar>
        <ui.Button aria-pressed={scale !== 1} onClick={() => setScale(scale === 1 ? .75 : 1)}>{korean ? "원본 배율" : "Source scale"} {scale}</ui.Button>
        <ui.Button aria-pressed={stale} onClick={() => setStale(!stale)}>{korean ? "다른 저장본 연결" : "Use another revision"}</ui.Button>
        <ui.Button aria-pressed={large} onClick={() => { select(undefined); setLarge(!large); }}>{korean ? "1,200개 블록" : "1,200 blocks"}</ui.Button>
      </ui.Toolbar>
      <ui.LinkedDocumentView document={{ path: sample.samplePath, height: fillHeight ? "fill" : undefined }}
        sourceLabel={korean ? "원본 자료" : "Source material"} sourceRef={setViewport} sourceScale={scale}
        revision={stale ? "b".repeat(64) : revision} items={items} selectedId={selected} onSelect={select}
        source={<div style={{ position: "relative", height: 2 * inset + pitch * items.length }}>
          {items.map(item => <ui.Button key={item.id} data-linked-item={item.id} aria-pressed={selected === item.id}
            style={{ position: "absolute", ...item.boxes[0], justifyContent: "start",
              borderInlineStartWidth: "var(--space-1)", borderInlineStartColor: `var(${item.colorToken})` }}>{item.label}</ui.Button>)}
        </div>} />
    </ui.ScreenLayout></ScreenFrame></div>
  </DocumentViewScope.Provider>;
}
