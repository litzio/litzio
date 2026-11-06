import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {ReviewPage} from '@litzio/core/views-v2';
import {DocumentEditor} from '../DocumentEditor.tsx';
import type {ReadingPosition} from '../document-reading.ts';
import {Button} from '../components/ui/button.tsx';
import type {ReviewSnapshot} from './ReviewRenderer.tsx';
import {coherent} from './ReviewRenderer.tsx';
/** #1315 historical app experiment; the plugin provides data, never renderer code. */
export function ContinuousCompare({snapshot:s,readPage,disabled}:{snapshot:ReviewSnapshot;readPage(n:number):Promise<ReviewSnapshot>;disabled:boolean}) {
 const root=useRef<HTMLDivElement>(null),left=useRef<HTMLDivElement>(null),right=useRef<HTMLDivElement>(null),body=useRef<HTMLDivElement>(null);
 const [layout,setLayout]=useState<ReadingPosition>({blocks:[],height:0}),[sourceIds,setSourceIds]=useState<string[]>([]),[keys,setKeys]=useState<string[]>([]),[sync,setSync]=useState(false),[line,setLine]=useState<number[]>(),[tick,setTick]=useState(0);
 const pages=s.pageIndex||[],valid=!disabled&&coherent(s),lock=useRef(false);
 const reveal=(el:HTMLElement,top:number)=>{el.scrollTop=Math.max(0,top-16);};
 const chooseSource=(id:string)=>{if(!valid)return;const entries=s.mapping!.entries.filter(e=>e.sourceIds.includes(id)), targets=entries.flatMap(e=>e.targets.map(t=>JSON.stringify(t.path)));setSourceIds(entries.flatMap(e=>e.sourceIds));setKeys(targets);const b=layout.blocks.find(b=>targets.includes(b.key));if(b&&right.current&&body.current)reveal(right.current,body.current.offsetTop+b.top);};
 const chooseDocument=(key:string|undefined)=>{if(!valid||!key)return;const ids=s.mapping!.entries.filter(e=>e.targets.some(t=>JSON.stringify(t.path)===key)).flatMap(e=>e.sourceIds);setKeys([key]);setSourceIds(ids);const page=pages.find(p=>p.regions.some(r=>ids.includes(r.id)));if(page&&left.current){const el=left.current.querySelector<HTMLElement>(`[data-page="${page.pageNo}"]`);if(el)reveal(left.current,el.offsetTop);}};
 useLayoutEffect(()=>{const a=root.current?.querySelector<HTMLElement>('.review-region[aria-pressed="true"]'),b=layout.blocks.find(b=>keys.includes(b.key));if(!a||!b||!root.current||!body.current){setLine(undefined);return;}const r=root.current.getBoundingClientRect(),ar=a.getBoundingClientRect(),br=body.current.getBoundingClientRect();setLine([ar.right-r.left,ar.top-r.top+ar.height/2,br.left-r.left,br.top-r.top+b.top+b.height/2]);},[sourceIds,keys,layout,tick]);
 const onScroll=(from:HTMLElement,to:HTMLElement)=>{setTick(t=>t+1);if(!sync||!valid||lock.current)return;lock.current=true;to.scrollTop=from.scrollTop/Math.max(1,from.scrollHeight-from.clientHeight)*(to.scrollHeight-to.clientHeight);requestAnimationFrame(()=>{lock.current=false;});};
 return <><Button variant="outline" aria-pressed={sync} disabled={!valid} onClick={()=>setSync(x=>!x)}>Scroll sync {sync?'on':'off'}</Button><div ref={root} className="review-compare spike-compare">
 <div className="spike-pages" ref={left} onScroll={()=>{if(left.current&&right.current)onScroll(left.current,right.current);}}>{pages.map(p=><LazyPage key={p.pageNo} page={p} initial={s} readPage={readPage} selected={sourceIds} choose={chooseSource} disabled={!valid}/>)}</div>
 <section aria-label="Document preview" ref={right} className="review-read" onScroll={()=>{if(right.current&&left.current)onScroll(right.current,left.current);}}><div ref={body} className="review-reading-content"><DocumentEditor readOnly preview document={s.document} documentPath={s.documentPath} onStructuralReject={()=>{}} onReadingLayout={setLayout} onReadingSelection={chooseDocument}/><div className="review-highlights" aria-hidden="true">{layout.blocks.filter(b=>keys.includes(b.key)).map(b=><div key={b.key} style={{top:b.top,height:b.height}}/>)}</div></div></section>
 {valid&&line&&<svg className="spike-connectors" aria-label="Correspondence connection"><line x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]} stroke="currentColor" strokeWidth="2"/></svg>}
 </div></>;
}
function LazyPage({page:p,initial,readPage,selected,choose,disabled}:{page:ReviewPage;initial:ReviewSnapshot;readPage(n:number):Promise<ReviewSnapshot>;selected:string[];choose(id:string):void;disabled:boolean}){
 const ref=useRef<HTMLDivElement>(null),[near,setNear]=useState(false),[url,setUrl]=useState<string>(),[failed,setFailed]=useState(false);
 useEffect(()=>{const observer=new IntersectionObserver(([e])=>setNear(e.isIntersecting),{root:ref.current?.parentElement,rootMargin:'100px'});if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{let active=true;if(!near){setUrl(undefined);return;}setFailed(false);const request=initial.page?.pageNo===p.pageNo?Promise.resolve(initial):readPage(p.pageNo);request.then(s=>{if(active)setUrl(s.imageUrl);},()=>{if(active)setFailed(true);});return()=>{active=false;};},[near,initial,readPage,p.pageNo]);
 return <div ref={ref} data-page={p.pageNo} className="spike-page"><span>Page {p.pageNo}</span><div className="review-page" style={{aspectRatio:`${p.width}/${p.height}`}}>{url&&<img loading="lazy" src={url} alt={`Source page ${p.pageNo}`}/>} {failed&&<span>Image unavailable</span>}{near&&p.regions.map(r=><Button key={r.id} variant="ghost" disabled={disabled} className="review-region p-0 rounded-none" aria-label={`${r.category} · ${r.status}${r.reason?' · '+r.reason:''}`} aria-pressed={selected.includes(r.id)} style={{left:`${r.bbox[0]/p.width*100}%`,top:`${(p.origin === 'TOPLEFT' ? r.bbox[1] : p.height-r.bbox[3])/p.height*100}%`,width:`${(r.bbox[2]-r.bbox[0])/p.width*100}%`,height:`${(r.bbox[3]-r.bbox[1])/p.height*100}%`}} onClick={()=>choose(r.id)}><span>{r.category}</span></Button>)}</div></div>;
}
