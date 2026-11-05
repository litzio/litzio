import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, X, Undo2, ChevronLeft, ChevronRight } from "lucide-react";
import type { EditableDocument } from "@litzio/core";
import type { ReviewView, ReviewBundle, ReviewPage, ReviewMapping, ReviewProposal, ReviewBaseline } from "@litzio/core/views-v2";
import { DocumentEditor } from "../DocumentEditor.tsx";
import type { ReadingPosition } from "../document-reading.ts";
import { Button } from "../components/ui/button.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
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
const regionStatus = { supported: "Supported", unsupported: "Unsupported", decoration: "Decoration", excluded: "Excluded" };
const proposalStatus = { pending: "Pending review", approved: "Applied", rejected: "Rejected", inapplicable: "Cannot apply", stale: "Out of date" };
export function PageSurface({ snapshot: s, selected, onSelect, onPage, disabled = false }: {
  snapshot: ReviewSnapshot; selected: string[]; onSelect(id: string): void; onPage(page: number): void; disabled?: boolean;
}) {
  const [zoom, setZoom] = useState(1), [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [s.imageUrl]);
  const p = s.page;
  return <section aria-label="Source page" className="review-source">
    <div className="review-toolbar"><Button variant="ghost" aria-label="Previous page" disabled={disabled || p.pageNo <= 1} onClick={() => onPage(p.pageNo - 1)}><ChevronLeft /></Button>
      <span>Page {p.pageNo} of {s.pageCount}</span><Button variant="ghost" aria-label="Next page" disabled={disabled || p.pageNo >= s.pageCount} onClick={() => onPage(p.pageNo + 1)}><ChevronRight /></Button>
      <Button variant="outline" onClick={() => setZoom(v => v === 1 ? 1.5 : 1)}>{zoom === 1 ? "Zoom in" : "Fit to width"}</Button></div>
    <div className="review-page-scroll"><div className="review-page" style={{ width: `${zoom * 100}%`, aspectRatio: `${p.width}/${p.height}` }}>
      {s.imageUrl && !failed ? <img src={s.imageUrl} alt={`Source page ${p.pageNo}`} onError={() => setFailed(true)} /> : <Notice>No image available. Showing regions only.</Notice>}
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
    <section aria-label="Document preview" className="review-read" ref={scroll} tabIndex={0}>
      <div className="review-reading-content" ref={content}>
        <DocumentEditor readOnly preview document={s.document} documentPath={s.documentPath} onStructuralReject={() => {}} onReadingLayout={setPositions} onReadingSelection={selectDocument} />
        <div className="review-highlights" aria-hidden="true">{positions.blocks.filter(b => targets.includes(b.key)).map(b => <div key={b.key} style={{ top: b.top, height: b.height }} />)}</div>
      </div>
    </section></div>{unmapped && <Notice>No matching content.</Notice>}{s.mapping.continuation && <Notice>Mappings are incomplete. Refresh data before reviewing.</Notice>}</>;
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
export function ReviewRenderer({ view, adapter }: { view: ReviewView; adapter: ReviewAdapter }) {
  const [snapshot, setSnapshot] = useState<ReviewSnapshot>(), [selected, setSelected] = useState<string>();
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
  return <div ref={host} className="review-renderer"><header className="review-toolbar"><h2>{view.title}</h2><Button variant="outline" onClick={adapter.openDocument}>Open document</Button><Button variant="outline" disabled={state === "loading" || state === "refreshing"} onClick={() => void read(snapshot?.page.pageNo ?? 1)}>Refresh data</Button></header>
    {state !== "ready" && <Notice tone={state === "unavailable" || state === "uncertain" ? "warning" : "info"}>{state === "refreshing" ? "Refreshing data…" : state === "loading" ? "Loading data…" : state === "uncertain" ? "Outcome unknown. Check the status before trying again." : "Data unavailable."}</Notice>}
    {stale && <Notice tone="warning">Data is out of date. Refresh data to navigate or apply changes.</Notice>}
    {!wide && <Notice>Widen the window to compare. Comparison requires at least 1024px.</Notice>}
    {snapshot && wide && <div className="review-panels">{view.layout.children.map((child, index) => <section key={index} aria-label={child.title} className="review-panel">
      <h3>{child.title}</h3>
      {child.component === "PageSurface" && <ReviewPagePanel snapshot={snapshot} disabled={disabled} onPage={n => void read(n)} />}
      {child.component === "SourceDocumentCompare" && <SourceDocumentCompare snapshot={snapshot} disabled={disabled} onPage={n => void read(n)} />}
      {child.component === "ReviewList" && <ReviewList proposals={snapshot.proposals} selected={selected} onSelect={setSelected} />}
      {child.component === "ReviewDetail" && (proposal
        ? <ReviewDetail proposal={proposal} document={snapshot.document} baseline={snapshot.baseline} disabled={disabled || proposal.targets.some(t => t.documentRevision !== snapshot.documentRevision || t.documentHash !== snapshot.documentHash)} onAction={a => void act(a)} />
        : <Notice>Select a change to view its details.</Notice>)}
    </section>)}</div>}
  </div>;
}
