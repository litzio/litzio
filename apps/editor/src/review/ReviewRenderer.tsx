import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, X, Undo2, ChevronLeft, ChevronRight } from "lucide-react";
import type { EditableDocument } from "@litzio/core";
import type { ReviewView, ReviewBundle, ReviewPage, ReviewMapping, ReviewProposal, ReviewBaseline } from "@litzio/core/views-v2";
import { DocumentEditor } from "../DocumentEditor.tsx";
import type { ReadingPosition } from "../document-reading.ts";
import { Button } from "../components/ui/button.tsx";
import { Notice } from "../ui/primitives.tsx";
import "./review.css";

/** Host supplies one coherent snapshot, including the identity of the actual Read model. */
export type ReviewSnapshot = {
  bundle: ReviewBundle; page: ReviewPage; mapping: ReviewMapping; proposals: ReviewProposal[];
  document: EditableDocument; documentRevision: string; documentHash: string; documentPath: string;
  baseline: ReviewBaseline; pageCount: number; imageUrl?: string;
};
export type ReviewAction = "approve" | "reject" | "undo";
export type ReviewAdapter = {
  read(pageNo: number): Promise<ReviewSnapshot>;
  act(action: ReviewAction, proposal: ReviewProposal, baseline: ReviewBaseline): Promise<void>;
  openDocument(): void;
};
export function coherent(s: ReviewSnapshot) {
  const { bundle: b, page: p, mapping: m } = s;
  return b.generation === p.generation && b.generation === m.generation && b.documentRevision === s.documentRevision
    && b.documentHash === s.documentHash && b.documentRevision === m.documentRevision && b.documentHash === m.documentHash
    && b.sourceRevision === p.sourceRevision && b.sourceRevision === m.sourceRevision && b.mappingRevision === m.mappingRevision
    && s.baseline.documentRevision === b.documentRevision && s.baseline.sourceRevision === b.sourceRevision && s.baseline.mappingRevision === b.mappingRevision
    && m.entries.every(e => e.targets.every(t => t.documentRevision === b.documentRevision && t.documentHash === b.documentHash));
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
const regionStatus = { supported: "지원", unsupported: "미지원", decoration: "장식", excluded: "제외" };
const proposalStatus = { pending: "검토 대기 · pending", approved: "적용됨 · applied", rejected: "거절됨", inapplicable: "적용 불가", stale: "오래된 제안 · stale" };
export function PageSurface({ snapshot: s, selected, onSelect, onPage, disabled = false }: {
  snapshot: ReviewSnapshot; selected: string[]; onSelect(id: string): void; onPage(page: number): void; disabled?: boolean;
}) {
  const [zoom, setZoom] = useState(1), [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [s.imageUrl]);
  const p = s.page;
  return <section aria-label="원본 페이지" className="review-source">
    <div className="review-toolbar"><Button variant="ghost" aria-label="이전 페이지" disabled={disabled || p.pageNo <= 1} onClick={() => onPage(p.pageNo - 1)}><ChevronLeft /></Button>
      <span>{p.pageNo} / {s.pageCount} 페이지</span><Button variant="ghost" aria-label="다음 페이지" disabled={disabled || p.pageNo >= s.pageCount} onClick={() => onPage(p.pageNo + 1)}><ChevronRight /></Button>
      <Button variant="outline" onClick={() => setZoom(v => v === 1 ? 1.5 : 1)}>{zoom === 1 ? "확대" : "맞춤"}</Button></div>
    <div className="review-page-scroll"><div className="review-page" style={{ width: `${zoom * 100}%`, aspectRatio: `${p.width}/${p.height}` }}>
      {s.imageUrl && !failed ? <img src={s.imageUrl} alt={`원본 ${p.pageNo} 페이지`} onError={() => setFailed(true)} /> : <Notice>이미지 없음 · 영역 정보만 표시합니다.</Notice>}
      {p.regions.map(r => { const [x1,y1,x2,y2] = r.bbox; return <button key={r.id} className="review-region" aria-label={`${r.category} · ${regionStatus[r.status]}${r.reason ? ` · ${r.reason}` : ""}`} aria-pressed={selected.includes(r.id)} disabled={disabled}
        style={{ left: `${x1/p.width*100}%`, top: `${(p.origin === "TOPLEFT" ? y1 : p.height-y2)/p.height*100}%`, width: `${(x2-x1)/p.width*100}%`, height: `${(y2-y1)/p.height*100}%` }} onClick={() => onSelect(r.id)}><span>{r.category} · {regionStatus[r.status]}</span></button>; })}
    </div></div>
  </section>;
}
export function SourceDocumentCompare({ snapshot: s, disabled, onPage }: { snapshot: ReviewSnapshot; disabled: boolean; onPage(n: number): void }) {
  const [sources, setSources] = useState<string[]>([]), [targets, setTargets] = useState<string[]>([]);
  const [positions, setPositions] = useState<ReadingPosition>({ blocks: [], height: 0 });
  const scroll = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null), source = useRef<HTMLDivElement>(null);
  const [unmapped, setUnmapped] = useState(false);
  const valid = !disabled && coherent(s);
  useEffect(() => { setSources([]); setTargets([]); setUnmapped(false); }, [s]);
  const selectSource = (id: string) => {
    if (!valid) return;
    const entries = s.mapping.entries.filter(e => e.sourceIds.includes(id));
    const keys = entries.flatMap(e => e.targets.map(t => JSON.stringify(t.path)));
    setSources([id]); setTargets(keys); setUnmapped(!keys.length);
    const first = positions.blocks.find(b => keys.includes(b.key));
    if (first && scroll.current && content.current) reveal(scroll.current, content.current.offsetTop + first.top, first.height);
  };
  const selectDocument = (key: string | undefined) => {
    if (!valid || !key) return;
    const ids = s.mapping.entries.filter(e => e.targets.some(t => JSON.stringify(t.path) === key)).flatMap(e => e.sourceIds);
    setTargets([key]); setSources(ids); setUnmapped(!ids.length);

    // Reveal the new source after React commits.

  };
  useLayoutEffect(() => {
    const container = source.current?.querySelector<HTMLElement>(".review-page-scroll");
    const region = container?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (container && region) { const a = container.getBoundingClientRect(), b = region.getBoundingClientRect(); reveal(container, container.scrollTop + b.top-a.top, b.height); }
  }, [sources]);
  return <><div className="review-compare">
    <div ref={source}><PageSurface snapshot={s} selected={sources} onSelect={selectSource} onPage={onPage} disabled={disabled} /></div>
    <section aria-label="문서 Read" className="review-read" ref={scroll} tabIndex={0}>
      <div className="review-reading-content" ref={content}>
        <DocumentEditor readOnly preview document={s.document} documentPath={s.documentPath} onStructuralReject={() => {}} onReadingLayout={setPositions} onReadingSelection={selectDocument} />
        <div className="review-highlights" aria-hidden="true">{positions.blocks.filter(b => targets.includes(b.key)).map(b => <div key={b.key} style={{ top: b.top, height: b.height }} />)}</div>
      </div>
    </section></div>{unmapped && <Notice>대응하는 자료가 없습니다.</Notice>}{s.mapping.continuation && <Notice>대응 목록이 완전하지 않습니다. 추가 자료를 읽은 뒤 검토하세요.</Notice>}</>;
}
export function ReviewList({ proposals, selected, onSelect }: { proposals: ReviewProposal[]; selected?: string; onSelect(id: string): void }) {
  return <nav aria-label="변경 제안" className="review-list">{!proposals.length && <Notice>변경 제안이 없습니다.</Notice>}{proposals.map(p => <Button key={p.id} variant={selected === p.id ? "secondary" : "ghost"} aria-pressed={selected === p.id} onClick={() => onSelect(p.id)}>{p.kind} · {proposalStatus[p.state]}</Button>)}</nav>;
}
export function ReviewDetail({ proposal: p, baseline, disabled, onAction }: { proposal: ReviewProposal; baseline: ReviewBaseline; disabled: boolean; onAction(a: ReviewAction): void }) {
  const content = (v: ReviewProposal["before"]) => v.type === "plain" ? v.text : `${v.kind}\n${JSON.stringify(v.value, null, 2)}`;
  return <section aria-label="제안 상세" className="review-detail"><strong>{proposalStatus[p.state]}</strong><p>대상: {p.targets.map(t => JSON.stringify(t.path)).join(", ")}</p>
    <div className="review-before-after"><div>변경 전<pre>{content(p.before)}</pre></div><div>변경 후<pre>{content(p.after)}</pre></div></div>
    <ul>{p.evidence.map((e,i) => <li key={i}>{e}</li>)}</ul><div className="review-toolbar">{(["approve", "reject", "undo"] as const).map(action => {
      const availability = p.actions.find(a => a.action === action), allowed = !disabled && sameBaseline(p.baseline, baseline) && availability?.allowed && (action === "undo" ? p.state === "approved" : p.state === "pending");
      const Icon = action === "approve" ? Check : action === "reject" ? X : Undo2;
      return <div key={action}><Button variant={action === "approve" ? "default" : "outline"} disabled={!allowed} onClick={() => onAction(action)}><Icon />{action === "approve" ? "승인" : action === "reject" ? "거절" : "되돌리기"}</Button>{!allowed && <small>{disabled ? "자료를 확인한 뒤 사용하세요" : !sameBaseline(p.baseline, baseline) ? "오래된 제안" : availability?.reason ?? "이 상태에서는 사용할 수 없습니다"}</small>}</div>;
    })}</div></section>;
}
/** Mount with a new key on Host/source changes. Adapter is scoped to that mounted source. */
export function ReviewRenderer({ view, adapter }: { view: ReviewView; adapter: ReviewAdapter }) {
  const [snapshot, setSnapshot] = useState<ReviewSnapshot>(), [selected, setSelected] = useState<string>();
  const [pageSelection, setPageSelection] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "refreshing" | "unavailable" | "uncertain">("loading");
  const host = useRef<HTMLDivElement>(null), [wide, setWide] = useState(false), epoch = useRef(0), busy = useRef(false);
  useEffect(() => { const observer = new ResizeObserver(entries => setWide(entries[0].contentRect.width >= 1024)); if (host.current) observer.observe(host.current); return () => observer.disconnect(); }, []);
  useEffect(() => { const token = ++epoch.current; busy.current = true; setState("loading"); setSnapshot(undefined); setSelected(undefined);
    adapter.read(1).then(s => { if (epoch.current === token) { setSnapshot(s); setState("ready"); busy.current = false; } }, () => { if (epoch.current === token) { setState("unavailable"); busy.current = false; } });
    return () => { ++epoch.current; };
  }, [adapter, view.sources.review.bundleRef]);
  const read = async (pageNo: number) => {
    if (busy.current) return; busy.current = true; const token = ++epoch.current; setState("refreshing");
    try { const next = await adapter.read(pageNo); if (token === epoch.current) { setSnapshot(next); setState("ready"); } }
    catch { if (token === epoch.current) setState("unavailable"); } finally { if (token === epoch.current) busy.current = false; }
  };
  const stale = snapshot && (!coherent(snapshot) || snapshot.bundle.bundleRef !== view.sources.review.bundleRef || !!snapshot.mapping.continuation);
  const disabled = state !== "ready" || !!stale;
  const proposal = snapshot?.proposals.find(p => p.id === selected);
  const components = new Set(view.layout.children.map(child => child.component));
  const act = async (action: ReviewAction) => {
    if (busy.current || disabled || !snapshot || !proposal || !sameBaseline(proposal.baseline, snapshot.baseline) || !proposal.actions.some(a => a.action === action && a.allowed)) return;
    busy.current = true; const token = ++epoch.current; setState("refreshing");
    try {
      await adapter.act(action, proposal, snapshot.baseline);
      if (token !== epoch.current) return;
      const next = await adapter.read(snapshot.page.pageNo);
      if (token === epoch.current) { setSnapshot(next); setState("ready"); }
    } catch { if (token === epoch.current) setState("uncertain"); }
    finally { if (token === epoch.current) busy.current = false; }
  };
  return <div ref={host} className="review-renderer"><header className="review-toolbar"><h2>{view.title}</h2><Button variant="outline" onClick={adapter.openDocument}>결과 문서 열기</Button><Button variant="outline" disabled={state === "loading" || state === "refreshing"} onClick={() => void read(snapshot?.page.pageNo ?? 1)}>다시 읽기</Button></header>
    {state !== "ready" && <Notice tone={state === "unavailable" || state === "uncertain" ? "warning" : "info"}>{state === "refreshing" ? "갱신 중" : state === "loading" ? "자료 읽는 중" : state === "uncertain" ? "결과 불확실 · 변경을 다시 보내지 말고 상태를 확인하세요." : "자료 사용 불가 · unavailable"}</Notice>}
    {stale && <Notice tone="warning">오래된 자료 · stale — 다시 읽기 전에는 이동하거나 적용할 수 없습니다.</Notice>}
    {!wide && <Notice>대조하려면 창을 넓히세요. 대조 콘텐츠는 최소 1024px이 필요합니다.</Notice>}
    {snapshot && wide && <>
      {components.has("SourceDocumentCompare") ? <SourceDocumentCompare snapshot={snapshot} disabled={disabled} onPage={n => void read(n)} />
        : components.has("PageSurface") && <PageSurface snapshot={snapshot} selected={pageSelection} onSelect={id => setPageSelection([id])} onPage={n => void read(n)} disabled={disabled} />}
      {(components.has("ReviewList") || components.has("ReviewDetail")) && <div className="review-proposals">
        <ReviewList proposals={snapshot.proposals} selected={selected} onSelect={setSelected} />
        {proposal && <ReviewDetail proposal={proposal} baseline={snapshot.baseline} disabled={disabled || proposal.targets.some(t => t.documentRevision !== snapshot.documentRevision || t.documentHash !== snapshot.documentHash)} onAction={a => void act(a)} />}
      </div>}
    </>}
  </div>;
}
