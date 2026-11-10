import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Input } from "../components/ui/input.tsx";
import { regionKinds } from "./review-kinds.ts";
import type { ReviewPage } from "@litzio/core/views-v2";
import type { ReviewAdapter, ReviewSnapshot } from "./ReviewRenderer.tsx";
import { Button } from "../components/ui/button.tsx";
import { i18n } from "../i18n.ts";

const status = {supported:"Supported",unsupported:"Unsupported",decoration:"Decoration",excluded:"Excluded"};
/** Page geometry is cheap metadata; PNGs and region controls exist only near the viewport. */
export function ContinuousSource({snapshot:s, loadPage, selected, disabled, saving, jump, onSelect, onVisible, onCheck, onUnavailable}: {
  snapshot: ReviewSnapshot; loadPage: NonNullable<ReviewAdapter["loadPage"]>; selected: string[]; disabled: boolean; saving: boolean;
  jump?: {pageNo:number}; onSelect(id:string):void; onVisible(page:number):void; onCheck(page:number,checked:boolean):void; onUnavailable():void;
}) {
  const pane = useRef<HTMLDivElement>(null);
  const [pageDraft,setPageDraft] = useState(String(s.page?.pageNo ?? 1)), [editingPage,setEditingPage] = useState(false);
  const kinds = useMemo(()=>regionKinds(s),[s]);
  useEffect(()=>{if (!editingPage) setPageDraft(String(s.page?.pageNo ?? 1));},[s.page?.pageNo,editingPage]);
  const [zoom,setZoom] = useState(1), [near,setNear] = useState<number[]>([]);
  const [images,setImages] = useState<Record<number,string>>({});
  const pages = s.pages ?? (s.page ? [s.page] : []);
  const identity = `${s.documentHash}:${s.generatedBaseline?.sourceRevision}`;
  const latest = useRef({s,near,identity,loadPage,onUnavailable}); latest.current = {s,near,identity,loadPage,onUnavailable};
  const cache = useRef<{identity:string;images:Record<number,string>}>({identity,images:{}});
  const pumping = useRef(false), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => {mounted.current = false;}; }, []);
  useEffect(() => {
    if (pumping.current) return;
    pumping.current = true;
    void (async () => {
      try {
        while (mounted.current) {
          const current = latest.current;
          if (cache.current.identity !== current.identity) {
            cache.current = {identity:current.identity,images:current.s.page && current.s.imageUrl ? {[current.s.page.pageNo]:current.s.imageUrl} : {}};
          }
          const images = cache.current.images;
          for (const key of Object.keys(images)) if (current.near.length && !current.near.includes(Number(key))) delete images[Number(key)];
          setImages({...images});
          const page = current.near.find(page => !images[page]);
          if (page === undefined) break;
          const image = await current.loadPage(current.s,page);
          if (latest.current.identity !== current.identity) continue;
          if (!image) break; // A progress save changed baseline; its fresh snapshot restarts loading.
          if (latest.current.near.includes(page)) images[page] = image;
        }
      } catch { if (mounted.current) latest.current.onUnavailable(); }
      finally { pumping.current = false; }
    })();
  }, [identity,near]);
  useLayoutEffect(() => {
    const element = pane.current!;
    const observer = new IntersectionObserver(entries => {
      setNear(previous => {
        const next = new Set(previous);
        for (const entry of entries) { const page = Number((entry.target as HTMLElement).dataset.pageNo); if (entry.isIntersecting) next.add(page); else next.delete(page); }
        return [...next].sort((a,b)=>a-b);
      });
    },{root:element,rootMargin:"100% 0px"});
    element.querySelectorAll(".review-source-sheet").forEach(sheet=>observer.observe(sheet));
    return () => observer.disconnect();
  }, [pages.length]);
  const show = (pageNo:number) => {
    const element = pane.current!, sheet = element.querySelector<HTMLElement>(`[data-page-no="${pageNo}"]`);
    if (sheet) { element.scrollTop += sheet.getBoundingClientRect().top-element.getBoundingClientRect().top; onVisible(pageNo); }
  };
  useLayoutEffect(() => { show(s.progress?.lastPage ?? s.page?.pageNo ?? 1); }, []);
  useLayoutEffect(() => { if (jump) show(jump.pageNo); }, [jump]);
  return <section className="review-source" aria-label="Source pages">
    <div className="review-toolbar"><form className="review-page-jump" onSubmit={event=>{event.preventDefault();const page=Number(pageDraft);if (Number.isInteger(page) && page>=1 && page<=s.pageCount) show(page);}}>
      <span>{i18n.t("Page")}</span><Input className="review-page-number shrink-0" type="number" min={1} max={s.pageCount} step={1} required disabled={disabled} aria-label={i18n.t("Go to page")} title={i18n.t("Press Enter to go to page.")} value={pageDraft} onFocus={()=>setEditingPage(true)} onBlur={()=>setEditingPage(false)} onChange={event=>setPageDraft(event.target.value)} style={{width:`calc(${Math.max(2,String(s.pageCount).length+1)}ch + var(--space-6) + var(--size-icon-slot))`}} /><span>/ {s.pageCount}</span>
    </form><Button variant="outline" onClick={()=>setZoom(value=>value === 1 ? 1.5:1)}>{i18n.t(zoom === 1 ? "Zoom in":"Fit to width")}</Button></div>
    <div className="review-page-scroll" ref={pane} onScroll={()=>{
      const element = pane.current!, bounds = element.getBoundingClientRect();
      const sheets = [...element.querySelectorAll<HTMLElement>(".review-source-sheet")];
      const first = sheets.find(sheet=>sheet.getBoundingClientRect().bottom > bounds.top + Math.min(80,element.clientHeight/3));
      if (first) onVisible(Number(first.dataset.pageNo));
    }}>
      <div className="review-source-pages" style={{width:`${zoom*100}%`}}>{pages.map((p:ReviewPage) => <div className="review-source-sheet" data-page-no={p.pageNo} key={p.pageNo}>
        <header className="review-page-heading"><span>{i18n.t("Page")} {p.pageNo}</span><Button variant="outline" size="sm" disabled={disabled} aria-label={`${i18n.t("Page")} ${p.pageNo}: ${i18n.t("Page checked")}`} aria-pressed={s.progress?.checkedPages.includes(p.pageNo) ?? false} onClick={()=>onCheck(p.pageNo,!s.progress?.checkedPages.includes(p.pageNo))}>{i18n.t(s.progress?.checkedPages.includes(p.pageNo) ? "Page checked":"Mark page checked")}</Button></header>
        <div className="review-page" style={{aspectRatio:`${p.width}/${p.height}`}}>
          {!images[p.pageNo] && near.includes(p.pageNo) && <span className="review-image-loading">{i18n.t("Loading data…")}</span>}
          {images[p.pageNo] && <img src={images[p.pageNo]} alt={`Source page ${p.pageNo}`} onError={onUnavailable} />}
          {near.includes(p.pageNo) && images[p.pageNo] && p.regions.map(r=>{const [x1,y1,x2,y2]=r.bbox;return <Button key={r.id} variant="ghost" className="review-region p-0 rounded-none" data-region-id={r.id} data-kind={kinds.get(r.id) ?? "unmapped"} title={`${r.category} · ${status[r.status]}${kinds.get(r.id) === "unmapped" ? ` · ${i18n.t("No matching content.")}`:""}`} aria-description={kinds.get(r.id) === "unmapped" ? i18n.t("No matching content."):undefined} aria-label={`${r.category} · ${status[r.status]}${r.reason ? ` · ${r.reason}`:""}`} aria-pressed={selected.includes(r.id)} disabled={disabled || saving} style={{left:`${x1/p.width*100}%`,top:`${(p.origin === "TOPLEFT" ? y1:p.height-y2)/p.height*100}%`,width:`${(x2-x1)/p.width*100}%`,height:`${(y2-y1)/p.height*100}%`}} onClick={()=>onSelect(r.id)}><span>{r.category} · {status[r.status]}</span></Button>;})}
        </div>
      </div>)}</div>
    </div>
  </section>;
}
