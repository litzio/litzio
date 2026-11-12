import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, X, Undo2, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, ArrowDownUp } from "lucide-react";
import type { EditableDocument } from "@litzio/core";
import type { ReviewView, ReviewBundle, ReviewPage, ReviewMapping, ReviewProposal, ReviewBaseline } from "@litzio/core/views-v2";
import { messageText } from "../ui-message.ts";
import { i18n } from "../i18n.ts";
import { collectSupportedEdits } from "../tiptap-document.ts";
import type { SupportedEdits } from "../../shared/document-protocol.ts";
import { DocumentEditor, type DocumentEditorHandle } from "../DocumentEditor.tsx";
import { ReviewImageSourcesContext } from "../node-views/figure-view.tsx";
import type { ReadingPosition } from "../document-reading.ts";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
import { Notice } from "../ui/primitives.tsx";
import "./review.css";
import { ContinuousSource } from "./ContinuousSource.tsx";
import { blockKind, regionKinds } from "./review-kinds.ts";
import { useCompareGeometry } from "./compare-geometry.ts";
import { REVIEW_UNAVAILABLE_GUIDANCE, type ReviewPendingChange, type ReviewVerification } from "../../shared/review.ts";


/** Host supplies one coherent snapshot, including the identity of the actual Read model. */
export type ReviewSnapshot = {
  state?: "ready" | "stale";
  generatedBaseline?: { sourceRevision: string; documentRevision: string | null; linkRevision: string | null };
  bundle: ReviewBundle; page?: ReviewPage; mapping?: ReviewMapping; proposals: ReviewProposal[];
  pages?: ReviewPage[];
  document: EditableDocument; documentRevision: string; documentHash: string; documentPath?: string;
  workspaceBaseline?: string; contentRevision?: string; imageSources?: Record<string,string>;
  regionPages?: Record<string, number>;
  baseline: ReviewBaseline; pageCount: number; imageUrl?: string; progress?: { checkedPages: number[]; lastPage: number | null };
  unresolved?: ReviewPendingChange[];
};
export type ReviewAction = "approve" | "reject" | "undo";
export type ReviewAdapter = {
  /** Source-scoped observation retained until the same requestId has a definitive status. */
  readonly pending?: { requestId: string; receipt?: { requestId: string; outcome: string }; verification?: ReviewVerification; guidance?: string };
  read(pageNo: number): Promise<ReviewSnapshot>;
  loadPage?(snapshot: ReviewSnapshot, pageNo: number): Promise<string | undefined>;
  act(action: ReviewAction, proposal: ReviewProposal, baseline: ReviewBaseline): Promise<void>;
  verify?(snapshot: ReviewSnapshot): Promise<void>;
  saveProgress?(snapshot: ReviewSnapshot, pageNo: number, checked?: boolean): Promise<ReviewSnapshot>;
  saveDocument?(snapshot: ReviewSnapshot, edits: SupportedEdits): Promise<void>;
  editing?(active: boolean): void;
  openDocument?(): void;
};
function documentCoherent(s: ReviewSnapshot) {
  const b = s.bundle;
  return s.state !== "stale" && b.documentRevision === s.documentRevision && b.documentHash === s.documentHash
    && s.baseline.documentRevision === b.documentRevision && s.baseline.sourceRevision === b.sourceRevision
    && s.baseline.mappingRevision === b.mappingRevision;
}
/** Mapping validity controls correspondence navigation, never proposal action availability. */
export function coherent(s: ReviewSnapshot) {
  const { bundle: b, page: p, mapping: m } = s;
  return documentCoherent(s) && !!p && !!m && !m.continuation && b.generation === p.generation && b.generation === m.generation
    && b.documentRevision === m.documentRevision && b.documentHash === m.documentHash
    && b.sourceRevision === p.sourceRevision && b.sourceRevision === m.sourceRevision && b.mappingRevision === m.mappingRevision
    && m.entries.every(e => e.targets.every(t => t.documentRevision === b.documentRevision && t.documentHash === b.documentHash));
}
function targetsMatch(s: ReviewSnapshot, p: ReviewProposal) {
  return p.targets.every(t => t.documentRevision === s.documentRevision && t.documentHash === s.documentHash);
}
function sameBaseline(a: ReviewBaseline, b: ReviewBaseline) {
  return a.documentRevision === b.documentRevision && a.proposalRevision === b.proposalRevision
    && a.sourceRevision === b.sourceRevision && a.mappingRevision === b.mappingRevision;
}
/** Reveal only when the whole block (or the top of an oversized block) is outside the viewport. */
function reveal(scroll: HTMLElement, top: number, height: number) {
  const start = scroll.scrollTop, end = start + scroll.clientHeight;
  if (top >= start && (top + height <= end || height > scroll.clientHeight && top < end)) return;
  scroll.scrollTo({ top: Math.max(0, top - 16), behavior: "instant" });
}
const regionStatus = { supported: "Supported", unsupported: "Unsupported", decoration: "Decoration", excluded: "Excluded" };
const proposalStatus = { pending: "Pending review", approved: "Applied", rejected: "Rejected", inapplicable: "Cannot apply", stale: "Out of date" };
export function PageSurface({ snapshot: s, selected, onSelect, onPage, disabled = false, selectionDisabled = false }: {
  snapshot: ReviewSnapshot; selected: string[]; onSelect(id: string): void; onPage(page: number): void; disabled?: boolean; selectionDisabled?: boolean;
}) {
  const [zoom, setZoom] = useState(1), [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [s.imageUrl]);
  const kinds = regionKinds(s);
  const p = s.page;
  if (!p) return <section aria-label="Source page" className="review-source"><Notice>No source pages available. Page controls are disabled.</Notice></section>;
  return <section aria-label="Source page" className="review-source">
    <div className="review-toolbar"><Button variant="ghost" aria-label={i18n.t("Previous page")} disabled={disabled || p.pageNo <= 1} onClick={() => onPage(p.pageNo - 1)}><ChevronLeft /></Button>
      <span>{i18n.t("Page")} {p.pageNo} / {s.pageCount}</span><Button variant="ghost" aria-label={i18n.t("Next page")} disabled={disabled || p.pageNo >= s.pageCount} onClick={() => onPage(p.pageNo + 1)}><ChevronRight /></Button>
      <Button variant="outline" onClick={() => setZoom(v => v === 1 ? 1.5 : 1)}>{zoom === 1 ? i18n.t("Zoom in") : i18n.t("Fit to width")}</Button></div>
    {(!s.imageUrl || failed) && <Notice>{i18n.t("No image available. Showing regions only.")}</Notice>}
    <div className="review-page-scroll"><div className="review-page" style={{ width: `${zoom * 100}%`, aspectRatio: `${p.width}/${p.height}` }}>
      {s.imageUrl && !failed ? <img src={s.imageUrl} alt={`Source page ${p.pageNo}`} onError={() => setFailed(true)} /> : null}
      {p.regions.map(r => { const [x1,y1,x2,y2] = r.bbox; return <Button key={r.id} variant="ghost" className="review-region p-0 rounded-none" data-kind={kinds.get(r.id) ?? "unmapped"} title={`${r.category} · ${regionStatus[r.status]}${kinds.get(r.id) === "unmapped" ? ` · ${i18n.t("No matching content.")}`:""}`} aria-description={kinds.get(r.id) === "unmapped" ? i18n.t("No matching content."):undefined} aria-label={`${r.category} · ${regionStatus[r.status]}${r.reason ? ` · ${r.reason}` : ""}`} aria-pressed={selected.includes(r.id)} disabled={disabled || selectionDisabled}
        style={{ left: `${x1/p.width*100}%`, top: `${(p.origin === "TOPLEFT" ? y1 : p.height-y2)/p.height*100}%`, width: `${(x2-x1)/p.width*100}%`, height: `${(y2-y1)/p.height*100}%` }} onClick={() => onSelect(r.id)}><span>{r.category} · {regionStatus[r.status]}</span></Button>; })}
    </div></div>
  </section>;
}
export type ReviewNavigation = { path?: number[]; sourceId?: string; pageNo?: number };
export function SourceDocumentCompare({ navigation, snapshot: s, disabled, selectionDisabled, onPage, onVerify, loadPage, onCheck, onUnavailable, title, toolbarActions, editing, onEditing, saveDocument, compact = false }: { editing?: boolean; onEditing?(active:boolean):void; saveDocument?: ReviewAdapter["saveDocument"]; navigation?: ReviewNavigation; snapshot: ReviewSnapshot; disabled: boolean; selectionDisabled?: boolean; onPage(n: number): void; onVerify?(): Promise<boolean>; loadPage?: ReviewAdapter["loadPage"]; onCheck?(page:number,checked:boolean):void; onUnavailable?():void; title?: string; toolbarActions?: ReactNode; compact?: boolean }) {
  const editor=useRef<DocumentEditorHandle>(null), [dirty,setDirty]=useState(false), [saveBusy,setSaveBusy]=useState(false), [editError,setEditError]=useState("");
  const save=async()=>{if(!editor.current || saveBusy || !saveDocument)return;setSaveBusy(true);setEditError("");try{await saveDocument(s,collectSupportedEdits(s.document,editor.current.beginSave()));editor.current?.finishSave(true);onEditing?.(false);}catch(error){editor.current?.finishSave();setEditError(String((error as Error).message));}finally{setSaveBusy(false);}};
  const [sources, setSources] = useState<string[]>([]), [targets, setTargets] = useState<string[]>([]);
  const [positions, setPositions] = useState<ReadingPosition>({ blocks: [], height: 0 });
  const scroll = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null), source = useRef<HTMLDivElement>(null);
  const compare = useRef<HTMLDivElement>(null), wireId = useId();
  const [sync,setSync] = useState(true), [jump,setJump] = useState<{pageNo:number}>();
  const [zoom,setZoom] = useState<number | "fit">("fit"), [zoomDraft,setZoomDraft] = useState<string>(i18n.t("Page width"));
  const zoomValue = useRef<number | "fit">("fit");
  const zoomAnchor = useRef<{pane:HTMLElement;page:HTMLElement;y:number;offset:number;x:number;screenY:number} | undefined>(undefined);
  const changeZoom = (next:number | "fit") => {
    const pane=source.current?.querySelector<HTMLElement>(".review-page-scroll");
    const page=pane?.querySelector<HTMLElement>(`[data-page-no="${s.page?.pageNo}"] .review-page`);
    if (pane && page) {
      const bounds=pane.getBoundingClientRect(),image=page.getBoundingClientRect(),screenY=Math.min(80,pane.clientHeight/3),y=bounds.top+screenY-image.top;
      zoomAnchor.current={pane,page,y:Math.max(0,y)/image.height,offset:Math.min(0,y),x:Math.min(1,Math.max(0,(bounds.left+pane.clientWidth/2-image.left)/image.width)),screenY};
    }
    zoomValue.current=next;setZoom(next);setZoomDraft(next === "fit" ? i18n.t("Page width"):`${next}%`);
  };
  const commitZoom = (value:string) => {
    const number=Number(value.trim().replace(/%$/,""));
    changeZoom(value === i18n.t("Page width") ? "fit":value.trim() && Number.isFinite(number) ? Math.min(400,Math.max(25,number)):zoomValue.current);
  };
  const zoomChanged = useRef(changeZoom);zoomChanged.current=changeZoom;
  const [pageDraft,setPageDraft] = useState(String(s.page?.pageNo ?? 1)), [editingPage,setEditingPage] = useState(false);
  useEffect(()=>{if (!editingPage) setPageDraft(String(s.page?.pageNo ?? 1));},[s.page?.pageNo,editingPage]);
  const continuous = !!loadPage && !!s.pages?.length;
  const navigate = (pageNo:number) => { if (continuous) setJump({pageNo}); else onPage(pageNo); };
  const [unmapped, setUnmapped] = useState(false);
  const valid = !disabled && coherent(s);
  const wires = useCompareGeometry(compare,content,s,positions,sources,targets,valid,continuous && sync,zoom);
  useLayoutEffect(()=>{
    const anchor=zoomAnchor.current;zoomAnchor.current=undefined;if (!anchor) return;
    const bounds=anchor.pane.getBoundingClientRect(),image=anchor.page.getBoundingClientRect();
    anchor.pane.scrollTop+=image.top+anchor.y*image.height+anchor.offset-bounds.top-anchor.screenY;
    anchor.pane.scrollLeft+=image.left+anchor.x*image.width-bounds.left-anchor.pane.clientWidth/2;
  },[zoom]);
  useEffect(()=>{
    const element=source.current;if (!element || !continuous) return;
    const wheel=(event:WheelEvent)=>{
      if (!event.ctrlKey || !event.deltaY) return;
      event.preventDefault();
      const page=element.querySelector<HTMLElement>(`[data-page-no="${s.page?.pageNo}"] .review-page`),width=Number(page?.dataset.sourceWidth);
      if (!page || !width) return;
      const current=zoomValue.current === "fit" ? Math.round((page?.getBoundingClientRect().width ?? width)/width*100):zoomValue.current;
      zoomChanged.current(Math.min(400,Math.max(25,current+(event.deltaY<0 ? 10:-10))));
    };
    element.addEventListener("wheel",wheel,{passive:false});
    return ()=>element.removeEventListener("wheel",wheel);
  },[continuous,s.page?.pageNo]);
  useEffect(() => { setSources([]); setTargets([]); setUnmapped(false); }, [s.documentHash, s.bundle.sourceRevision, disabled]);
  const selectionEpoch = useRef(0);
  const selectSource = async (id: string) => {
    const token = ++selectionEpoch.current;
    if (onVerify && !await onVerify() || token !== selectionEpoch.current) return;
    if (!valid || !s.mapping) return;
    const entries = s.mapping.entries.filter(e => e.sourceIds.includes(id));
    const keys = entries.flatMap(e => e.targets.map(t => JSON.stringify(t.path)));
    setSources([id]); setTargets(keys); setUnmapped(!keys.length);
    const first = positions.blocks.find(b => keys.includes(b.key));
    if (first && scroll.current && content.current) reveal(scroll.current, content.current.offsetTop + first.top, first.height);
  };
  const pendingSelection = useRef<string | undefined>(undefined);
  const selectDocument = async (key: string | undefined) => {
    if (!key) return;
    const token = ++selectionEpoch.current;
    if (onVerify && !await onVerify() || token !== selectionEpoch.current) return;
    if (!valid || !key || !s.mapping) return;
    const ids = s.mapping.entries.filter(e => e.targets.some(t => JSON.stringify(t.path) === key)).flatMap(e => e.sourceIds);
    setTargets([key]); setSources(ids); setUnmapped(!ids.length);

    const targetPage = s.mapping.entries.filter(e => e.targets.some(t => JSON.stringify(t.path) === key)).flatMap(e => e.sourceIds).map(id => s.regionPages?.[id]).find(Boolean);
    if (targetPage && targetPage !== s.page?.pageNo) { if (!continuous) pendingSelection.current = key; navigate(targetPage); }
    // Reveal the new source after React commits.

  };
  useEffect(() => { if (pendingSelection.current && !disabled && !selectionDisabled) { const key = pendingSelection.current; pendingSelection.current = undefined; selectDocument(key); } }, [s, disabled, selectionDisabled]);
  useLayoutEffect(() => {
    const container = source.current?.querySelector<HTMLElement>(".review-page-scroll");
    const region = container?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (container && region) { const a = container.getBoundingClientRect(), b = region.getBoundingClientRect(); reveal(container, container.scrollTop + b.top-a.top, b.height); }
  }, [sources]);
  const deliveredNavigation = useRef<ReviewNavigation | undefined>(undefined);
  useEffect(() => {
    if (!navigation || deliveredNavigation.current === navigation || disabled || selectionDisabled || !positions.blocks.length) return;
    deliveredNavigation.current = navigation;
    if (navigation.pageNo) navigate(navigation.pageNo);
    if (navigation.path) {
      const owner = s.document.blocks.find(block => block.path.every((part,index)=>navigation.path![index]===part));
      const key = JSON.stringify(owner?.path ?? navigation.path);
      void selectDocument(key);
      const block = positions.blocks.find(block => block.key === key);
      if (block && scroll.current && content.current) reveal(scroll.current, content.current.offsetTop + block.top, block.height);
    } else if (navigation.sourceId) void selectSource(navigation.sourceId);
  }, [navigation, disabled, selectionDisabled, positions]);
  const checkedDescription = i18n.t("{{checked}} of {{total}} pages checked",{checked:s.progress?.checkedPages.length ?? 0,total:s.pageCount});
  return <>{continuous && <div className="review-toolbar review-compare-toolbar" aria-label={i18n.t("Source comparison")}>
    <span className="review-file" title={title ?? s.documentPath}>{title ?? s.documentPath}</span>
    <Tooltip><TooltipTrigger render={<span className="review-progress" tabIndex={0} aria-label={checkedDescription} />}><Check aria-hidden="true" />{s.progress?.checkedPages.length ?? 0}</TooltipTrigger><TooltipContent>{checkedDescription}</TooltipContent></Tooltip>
    <form className="review-page-jump" onSubmit={event=>{event.preventDefault();const page=Number(pageDraft);if (Number.isInteger(page) && page>=1 && page<=s.pageCount) setJump({pageNo:page});}}>
      <span>{i18n.t("Page")}</span><Input className="review-page-number shrink-0" type="number" min={1} max={s.pageCount} step={1} required disabled={disabled || !valid} aria-label={i18n.t("Go to page")} title={i18n.t("Press Enter to go to page.")} value={pageDraft} onFocus={()=>setEditingPage(true)} onBlur={()=>setEditingPage(false)} onChange={event=>setPageDraft(event.target.value)} style={{width:`calc(${Math.max(2,String(s.pageCount).length+1)}ch + var(--space-6) + var(--size-icon-slot))`}} /><span>/ {s.pageCount}</span>
    </form>
    <Input className="review-zoom" list={`${wireId}-zoom`} aria-label={i18n.t("Source zoom")} title={i18n.t("Source zoom (25–400%)")} value={zoomDraft} onChange={event=>{const value=event.target.value;setZoomDraft(value);if ([i18n.t("Page width"),"50%","75%","100%","150%","200%"].includes(value)) commitZoom(value);}} onBlur={event=>commitZoom(event.target.value)} onKeyDown={event=>{if (event.key === "Enter") {event.preventDefault();commitZoom(event.currentTarget.value);}}} />
    <datalist id={`${wireId}-zoom`}>{[i18n.t("Page width"),"50%","75%","100%","150%","200%"].map(value=><option value={value} key={value} />)}</datalist>
    <Tooltip><TooltipTrigger render={<Button variant={sync ? "secondary":"outline"} size="icon" aria-label={i18n.t("Sync scrolling")} aria-pressed={sync} onClick={()=>setSync(value=>!value)} />}><ArrowDownUp /></TooltipTrigger><TooltipContent>{i18n.t("Sync scrolling")}</TooltipContent></Tooltip>
    {toolbarActions}
    {compact && <Tooltip><TooltipTrigger render={<span className="review-wide-hint" tabIndex={0} />}>{i18n.t("Wide window advised")}</TooltipTrigger><TooltipContent>{i18n.t("Use a wider window for side-by-side comparison.")}</TooltipContent></Tooltip>}
  </div>}<div className="review-compare" ref={compare}>
    <div ref={source}>{continuous ? <ContinuousSource snapshot={s} loadPage={loadPage!} selected={sources} disabled={disabled || !valid} saving={!!selectionDisabled} compact={compact} zoom={zoom} jump={jump} onSelect={selectSource} onVisible={onPage} onCheck={onCheck!} onUnavailable={onUnavailable!} /> : <PageSurface snapshot={s} selected={sources} onSelect={selectSource} onPage={onPage} disabled={disabled} selectionDisabled={!valid || selectionDisabled} />}</div>
    <section aria-label="Document preview" className="review-read" ref={scroll} tabIndex={0} onKeyDownCapture={event=>{if(editing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="s"){event.preventDefault();event.stopPropagation();void save();}}}>
      {saveDocument&&<div className="review-toolbar">{editing?<><Button size="sm" disabled={saveBusy||!dirty} onClick={()=>void save()}>{i18n.t("Save")}</Button><Button size="sm" variant="outline" disabled={saveBusy} onClick={()=>{setDirty(false);setEditError("");onEditing?.(false);}}>{i18n.t("Cancel")}</Button></>:<Button size="sm" variant="outline" disabled={disabled} onClick={()=>onEditing?.(true)}>{i18n.t("Edit")}</Button>}</div>}
      {editError&&<Notice tone="warning">{editError}</Notice>}
      <div className="review-reading-content" ref={content}>
        <ReviewImageSourcesContext.Provider value={s.imageSources}><DocumentEditor ref={editor} key={`${s.documentHash}-${!!editing}`} readOnly={!editing || saveBusy} preview={!editing} onDirtyChange={setDirty} showHeadingLevels document={s.document} documentPath={s.documentPath} onStructuralReject={reason=>setEditError(reason ? messageText(reason) : i18n.t("Data unavailable."))} onNotice={message=>setEditError(messageText(message))} onReadingLayout={setPositions} onReadingSelection={selectDocument} /></ReviewImageSourcesContext.Provider>
        <div className="review-highlights" aria-hidden="true">{positions.blocks.filter(b => targets.includes(b.key)).map(b => <div key={b.key} data-kind={blockKind(s.document.blocks.find(block=>JSON.stringify(block.path)===b.key))} style={{ top: b.top, height: b.height }} />)}</div>
      </div>
    </section><svg className="review-wires" aria-hidden="true"><defs>{wires.map((wire,index)=><linearGradient key={wire.key} id={`${wireId}-${index}`} gradientUnits="userSpaceOnUse" x1={wire.paperEdge} x2={wire.paperEdge+1} y1={0} y2={0}><stop offset="0" style={{stopColor:`var(--id-color-review-source-${wire.kind})`}} /><stop offset="1" style={{stopColor:`var(--id-color-review-${wire.kind})`}} /></linearGradient>)}</defs>{wires.map((wire,index)=><path key={wire.key} d={wire.d} data-kind={wire.kind} data-selected={wire.selected} style={{stroke:`url(#${wireId}-${index})`}} />)}</svg></div>{unmapped && <Notice>{i18n.t("No matching content.")}</Notice>}{!disabled && !valid && <Notice tone="warning">{!s.mapping ? "Correspondence unavailable. Source-to-document navigation is disabled."
      : s.mapping.continuation ? "Mappings are incomplete. Source-to-document navigation is disabled."
      : "Mappings are out of date. Source-to-document navigation is disabled."}</Notice>}</>;
}
export function ReviewList({ proposals, selected, onSelect }: { proposals: ReviewProposal[]; selected?: string; onSelect(id: string): void }) {
  return <nav aria-label="Changes" className="review-list">{!proposals.length && <Notice>No changes to review.</Notice>}{proposals.map((p, index) => <Button key={p.id} variant={selected === p.id ? "secondary" : "ghost"} aria-pressed={selected === p.id} onClick={() => onSelect(p.id)}>Change {index + 1} · {proposalStatus[p.state]}</Button>)}</nav>;
}
const fieldLabels: Record<string, string> = { title: "Title", name: "Name", description: "Description", count: "Count", value: "Value", date: "Date", enabled: "Enabled" };
type Scalar = string | number | boolean | null;
function isPreviewScalar(value: unknown): value is Scalar {
  return value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)
    || typeof value === "string" && value.length <= 512;
}
function displayScalar(value: Scalar): string {
  if (value === null) return "No value";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return new Intl.NumberFormat("en", { maximumSignificantDigits: 21 }).format(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value)
      return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  }
  return value || "Empty text";
}
/** V1 kind IDs carry no public display schema. Never guess labels from arbitrary object keys. */
function ReviewContent({ content }: { content: ReviewProposal["before"] }) {
  let preview;
  if (content.type === "plain") preview = content.text;
  else if (isPreviewScalar(content.value)) preview = displayScalar(content.value);
  else if (Array.isArray(content.value) && content.value.length <= 16 && content.value.every(isPreviewScalar)) {
    preview = content.value.length ? <ul>{content.value.map((value, index) => <li key={index}>{displayScalar(value)}</li>)}</ul> : "No items";
  } else if (content.value && typeof content.value === "object" && !Array.isArray(content.value)) {
    const fields = Object.entries(content.value);
    if (fields.length <= 8 && fields.every(([key, value]) => Object.hasOwn(fieldLabels, key) && isPreviewScalar(value)))
      preview = fields.length ? <dl>{fields.map(([key, value]) => <div key={key}><dt>{fieldLabels[key]}</dt><dd>{displayScalar(value as Scalar)}</dd></div>)}</dl> : "No fields";
  }
  return <div className="review-value">{preview ?? "Structured content preview unavailable."}</div>;
}
function ReviewPagePanel({ snapshot, disabled, onPage }: { snapshot: ReviewSnapshot; disabled: boolean; onPage(n: number): void }) {
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => setSelected([]), [snapshot]);
  return <PageSurface snapshot={snapshot} selected={selected} onSelect={id => setSelected([id])} onPage={onPage} disabled={disabled} />;
}
export function ReviewDetail({ proposal: p, document, baseline, disabled, onAction }: { proposal: ReviewProposal; document: EditableDocument; baseline: ReviewBaseline; disabled: boolean; onAction(a: ReviewAction): void }) {
  const targetNames = p.targets.map(t => {
    const block = document.blocks.find(b => JSON.stringify(b.path) === JSON.stringify(t.path));
    return block && "text" in block && block.text ? block.text : "Document content";
  });
  return <section aria-label="Change details" className="review-detail"><strong>{proposalStatus[p.state]}</strong><p>Target: {targetNames.join(" · ")}</p>
    <div className="review-before-after"><div>Before<ReviewContent content={p.before} /></div><div>After<ReviewContent content={p.after} /></div></div>
    <ul>{p.evidence.map((e,i) => <li key={i}>{e}</li>)}</ul><div className="review-toolbar">{(["approve", "reject", "undo"] as const).map(action => {
      const availability = p.actions.find(a => a.action === action), allowed = !disabled && sameBaseline(p.baseline, baseline) && availability?.allowed && (action === "undo" ? p.state === "approved" : p.state === "pending");
      const Icon = action === "approve" ? Check : action === "reject" ? X : Undo2;
      const label = action === "approve" ? "Approve" : action === "reject" ? "Reject" : "Undo";
      const reason = disabled ? "Refresh data before using this action." : !sameBaseline(p.baseline, baseline) ? "This change is out of date." : availability?.reason ?? "This action is unavailable for this change.";
      const button = <Button variant={action === "approve" ? "default" : "outline"} disabled={!allowed} onClick={() => onAction(action)}><Icon />{label}</Button>;
      return allowed ? <span key={action}>{button}</span> : <Tooltip key={action}>
        <TooltipTrigger render={<span className="review-action-trigger" tabIndex={0} aria-label={`${label} unavailable`} />}>{button}</TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>;
    })}</div></section>;
}
/** Mount with a new key on Host/source changes. Adapter is scoped to that mounted source. */
export function ReviewRenderer({ blocked = false, navigation, view, adapter, actions, unavailableMessage }: { blocked?: boolean; navigation?: ReviewNavigation; view: ReviewView; adapter: ReviewAdapter; actions?: ReactNode; unavailableMessage?: string }) {
  const [snapshot, setSnapshot] = useState<ReviewSnapshot>(), [selected, setSelected] = useState<string>();
  const [state, setState] = useState<"loading" | "ready" | "refreshing" | "unavailable" | "uncertain">("loading");
  const verification = useRef<Promise<boolean> | undefined>(undefined);
  const saving = useRef(0), latest = useRef<ReviewSnapshot | undefined>(undefined);
  const refreshAfterSave = useRef(false);
  const currentAdapter = useRef(adapter); currentAdapter.current = adapter;
  // StrictMode replays mount effects. Both subscriptions observe one Host read;
  // starting it twice would contend for the generated document's admission lock.
  const opening = useRef<{ adapter: ReviewAdapter; bundleRef: string; result: Promise<ReviewSnapshot> } | undefined>(undefined);
  latest.current = snapshot;
  const [editing,setEditing]=useState(false);
  const [savingProgress, setSavingProgress] = useState(false), [progressError, setProgressError] = useState(false);
  const host = useRef<HTMLDivElement>(null), [wide, setWide] = useState(false), [compact,setCompact] = useState(false), epoch = useRef(0), busy = useRef(false);
  useEffect(() => { const observer = new ResizeObserver(entries => {setWide(entries[0].contentRect.width >= 1024);setCompact(entries[0].contentRect.width <= 640);}); if (host.current) observer.observe(host.current); return () => observer.disconnect(); }, []);
  useEffect(() => { const token = ++epoch.current; busy.current = true; saving.current = 0; refreshAfterSave.current = false; setSavingProgress(false); setProgressError(false); setState("loading"); setSnapshot(undefined); setSelected(undefined);
    if (opening.current?.adapter !== adapter || opening.current.bundleRef !== view.sources.review.bundleRef) opening.current = { adapter, bundleRef: view.sources.review.bundleRef, result: adapter.read(1) };
    opening.current.result.then(s => { if (epoch.current === token) { setSnapshot(s); setState(adapter.pending ? "uncertain" : "ready"); busy.current = false; } }, () => { if (epoch.current === token) { setState(adapter.pending ? "uncertain" : "unavailable"); busy.current = false; } });
    return () => { ++epoch.current; };
  }, [adapter, view.sources.review.bundleRef]);
  const saveProgress = (s: ReviewSnapshot, pageNo: number, checked?: boolean) => {
    if (!adapter.saveProgress || progressError) return;
    saving.current++; setSavingProgress(true);
    let failed = false;
    void adapter.saveProgress(s, pageNo, checked).catch(() => { failed = true; if (currentAdapter.current === adapter) setProgressError(true); }).finally(() => {
      if (currentAdapter.current !== adapter) return;
      if (!--saving.current) {
        setSavingProgress(false);
        if (!failed) { refreshAfterSave.current = true; if (!busy.current) { refreshAfterSave.current = false; void read(latest.current?.page?.pageNo ?? pageNo); } }
      }
    });
  };
  const read = async (pageNo: number, remember = false) => {
    if (busy.current) return; busy.current = true; const token = ++epoch.current; setState("refreshing");
    try { const next = await adapter.read(pageNo); if (token === epoch.current) { setSnapshot(next); latest.current = next; setState(adapter.pending ? "uncertain" : "ready"); if (!saving.current) setProgressError(false); if (remember) saveProgress(next, pageNo); } }
    catch { if (token === epoch.current) setState(adapter.pending ? "uncertain" : "unavailable"); } finally { if (token === epoch.current) { busy.current = false; if (refreshAfterSave.current && !saving.current) { refreshAfterSave.current = false; void read(latest.current?.page?.pageNo ?? pageNo); } } }
  };
  const stale = snapshot && (!documentCoherent(snapshot) || !adapter.saveProgress && snapshot.bundle.bundleRef !== view.sources.review.bundleRef);
  const unresolved = adapter.pending ?? snapshot?.unresolved?.[0];
  const unverifiable = unresolved?.verification === "unavailable";
  const disabled = blocked || state !== "ready" || !!stale || !!unresolved || progressError;
  const proposal = snapshot?.proposals.find(p => p.id === selected);
  const act = async (action: ReviewAction) => {
    if (busy.current || disabled || !snapshot || !proposal || !sameBaseline(proposal.baseline, snapshot.baseline) || !targetsMatch(snapshot, proposal) || (action === "undo" ? proposal.state !== "approved" : proposal.state !== "pending") || !proposal.actions.some(a => a.action === action && a.allowed)) return;
    busy.current = true; const token = ++epoch.current; setState("refreshing");
    try {
      await adapter.act(action, proposal, snapshot.baseline);
      if (token !== epoch.current) return;
      const next = await adapter.read(snapshot.page?.pageNo ?? 1);
      if (token === epoch.current) { setSnapshot(next); setState(adapter.pending ? "uncertain" : "ready"); }
    } catch { if (token === epoch.current) setState("uncertain"); }
    finally { if (token === epoch.current) busy.current = false; }
  };
  const combined = !!adapter.saveProgress && !!adapter.loadPage && !!snapshot?.pages?.length;
  const controls = unverifiable
      ? <Tooltip><TooltipTrigger render={<Button variant="outline" disabled={!adapter.openDocument} onClick={adapter.openDocument} />}>Open result document</TooltipTrigger><TooltipContent>{REVIEW_UNAVAILABLE_GUIDANCE}</TooltipContent></Tooltip>
      : <>{adapter.openDocument && <Tooltip><TooltipTrigger render={<Button variant="outline" size={combined ? "icon":"default"} aria-label={i18n.t("Open document")} onClick={adapter.openDocument} />}>{combined ? <ExternalLink />:i18n.t("Open document")}</TooltipTrigger><TooltipContent>{i18n.t("Open document")}</TooltipContent></Tooltip>}
        <Tooltip><TooltipTrigger render={<Button variant="outline" size={combined ? "icon":"default"} aria-label={unresolved ? "Check request status":i18n.t("Refresh data")} disabled={editing || savingProgress || state === "loading" || state === "refreshing"} onClick={() => void read(snapshot?.page?.pageNo ?? 1)} />}>{combined ? <RefreshCw />:unresolved ? "Check request status":i18n.t("Refresh data")}</TooltipTrigger><TooltipContent>{unresolved ? "Check request status":i18n.t("Refresh data")}</TooltipContent></Tooltip>
        {actions}{savingProgress && <span role="status">{i18n.t("Saving review progress…")}</span>}</>;
  return <div ref={host} className="review-renderer" data-generated={!!adapter.saveProgress}>{!combined && <header className="review-toolbar"><h2>{view.title}</h2>{controls}</header>}
    {(state !== "ready" || unresolved) && <Notice tone={state === "unavailable" || state === "uncertain" || unresolved ? "warning" : "info"}>{state === "refreshing" ? i18n.t("Refreshing data…") : state === "loading" ? i18n.t("Loading data…") : unverifiable ? "Status checks cannot resolve this outcome. Do not repeat this change." : state === "uncertain" || unresolved ? "Outcome unknown. Check the same request ID; do not resend this change." : unavailableMessage ?? i18n.t("Data unavailable.")}{unresolved && <span> Request: {unresolved.requestId}</span>}</Notice>}
    {progressError && <Notice tone="warning">{i18n.t("Review progress could not be saved. Refresh data before continuing.")}</Notice>}
    {stale && <Notice tone="warning">{i18n.t("Data is out of date. Open newly verified comparison data to continue.")}</Notice>}
    {!wide && !adapter.saveProgress && <Notice>Widen the window to compare. Comparison requires at least 1024px.</Notice>}
    {snapshot && (wide || adapter.saveProgress) && <div className="review-panels">{view.layout.children.map((child, index) => <section key={index} aria-label={child.title} className="review-panel">
      <h3 className={combined && child.component === "SourceDocumentCompare" ? "sr-only":undefined}>{child.title}</h3>
      {child.component === "PageSurface" && <ReviewPagePanel snapshot={snapshot} disabled={disabled} onPage={n => void read(n,true)} />}
      {child.component === "SourceDocumentCompare" && <SourceDocumentCompare editing={editing} onEditing={active=>{setEditing(active);adapter.editing?.(active);if(!active)void read(snapshot.page?.pageNo??1);}} saveDocument={adapter.saveDocument} navigation={navigation} snapshot={snapshot} compact={compact} title={view.title} toolbarActions={combined ? controls:undefined} disabled={disabled} selectionDisabled={savingProgress || editing} loadPage={adapter.loadPage} onUnavailable={()=>setState("unavailable")} onCheck={(pageNo,checked)=>{
        if (disabled || busy.current) return;
        const pages = new Set(snapshot.progress?.checkedPages);
        if (checked) pages.add(pageNo); else pages.delete(pageNo);
        setSnapshot({...snapshot,progress:{checkedPages:[...pages],lastPage:snapshot.page?.pageNo ?? pageNo}});
        saveProgress(snapshot,pageNo,checked);
      }} onPage={n => {
        if (!adapter.loadPage) { void read(n,true); return; }
        if (snapshot.page?.pageNo === n) return;
        const page = snapshot.pages?.find(page=>page.pageNo === n);
        if (page) setSnapshot(current=>current ? {...current,page}:current);
      }} onVerify={adapter.verify ? async () => {
        if (disabled || saving.current) return false;
        if (verification.current) return verification.current;
        if (busy.current) return false;
        busy.current = true;
        return verification.current = (async () => {
          try { await adapter.verify!(snapshot); return true; }
          catch { setState("unavailable"); return false; }
          finally { busy.current = false; verification.current = undefined; }
        })();
      } : undefined} />}
      {child.component === "ReviewList" && <ReviewList proposals={snapshot.proposals} selected={selected} onSelect={setSelected} />}
      {child.component === "ReviewDetail" && (proposal
        ? <ReviewDetail proposal={proposal} document={snapshot.document} baseline={snapshot.baseline} disabled={disabled || !targetsMatch(snapshot, proposal)} onAction={a => void act(a)} />
        : <Notice>Select a change to view its details.</Notice>)}
    </section>)}</div>}
  </div>;
}
