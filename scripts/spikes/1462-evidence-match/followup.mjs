// One frozen holdout. No model calls, product changes or general alignment library.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { compare as lcs, project } from './run.mjs';
import { convertDocument } from '../../../community-plugins/docling/document.js';
import { parse, serialize, removeBlock, moveBlock, updateParagraphInlineContent, updateTableCell, canonicalWriteError } from '../../../packages/core/src/index.ts';

const out = 'tmp/evidence-match/followup';
const protocolBytes = await readFile(new URL('./followup-protocol.json', import.meta.url));
const protocol = JSON.parse(protocolBytes), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const begin = performance.now();
const rawWords = text => [...text].map(c => /[\p{N}\p{S}µΩKÅ\u2070-\u209f]/u.test(c) ? c : c.normalize('NFKC')).join('').replace(/\u00ad/g, '').match(/[\p{L}\p{M}]+|[0-9]+(?:[.,][0-9]+)*|[^\s]/gu) ?? [];
function words(text) {
  const tokens = rawWords(text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')).filter(t=>!/^[.,;:!?"'()[\]{}…•]$/.test(t));
  return tokens.filter((t, i) => {
    if (t === '-' && /^\p{L}+$/u.test(tokens[i - 1] ?? '') && /^\p{L}+$/u.test(tokens[i + 1] ?? '')) return false;
    return true;
  });
}
assert.deepEqual(words('“quality”—check; 12.5 µg/L ≤ -2%'), words('quality check 12.5 µg/L ≤ -2%'));
for (const changed of ['12.6 µg/L ≤ -2%', '12.5 mg/L ≤ -2%', '12.5 µg/L < -2%', '12.5 µg/L ≤ 2%']) assert.notDeepEqual(words(changed), words('12.5 µg/L ≤ -2%'));

const originalBytes = await readFile(`${out}/document.json`), pdfBytes = await readFile(`${out}/source.pdf`);
const original = JSON.parse(originalBytes);
const converted = await convertDocument(original, hash(originalBytes));
const doc = parse(converted.source);
assert.equal(canonicalWriteError(doc), undefined);
assert.equal(hash(JSON.stringify(original)), hash(JSON.stringify(JSON.parse(originalBytes))));
const resolve = ref => { const [, kind, n] = ref.split('/'); return original[kind]?.[Number(n)]; };
const ownerOfCaption = new Map();
for (const owner of [...(original.tables ?? []), ...(original.pictures ?? [])]) for (const c of owner.captions ?? []) ownerOfCaption.set(c.$ref, owner.self_ref);
const excluded = item => item.content_layer === 'furniture' || ['page_header', 'page_footer'].includes(item.label) ? 'furniture' : item.label === 'formula' ? 'formula' : item.self_ref.startsWith('#/pictures/') ? 'picture' : undefined;
const regions = [];
for (const item of [...original.texts, ...original.tables, ...original.pictures]) {
  const reason = excluded(item);
  const group = reason ? `out:${reason}` : item.self_ref.startsWith('#/tables/') ? item.self_ref : ownerOfCaption.get(item.self_ref) ?? (item.label === 'footnote' ? 'footnotes' : 'body');
  if (group === 'body') continue;
  for (const prov of item.prov ?? []) {
    const b = prov.bbox, h = original.pages[prov.page_no].size.height;
    const top = b.coord_origin === 'BOTTOMLEFT' ? h - b.t : b.t;
    const bottom = b.coord_origin === 'BOTTOMLEFT' ? h - b.b : b.b;
    regions.push({ ref: item.self_ref, group: group === 'footnotes' ? `footnotes:${prov.page_no}` : group, reason, page: prov.page_no, left: Math.min(b.l,b.r), right: Math.max(b.l,b.r), top: Math.min(top,bottom), bottom: Math.max(top,bottom), pdfRawTokens: 0 });
  }
}
const priority = r => r.reason === 'furniture' ? 0 : r.reason === 'formula' ? 1 : r.reason === 'picture' ? 2 : r.ref.startsWith('#/tables/') ? 3 : ownerOfCaption.has(r.ref) ? 4 : 5;
regions.sort((a, b) => priority(a) - priority(b));

const req = createRequire(new URL('../../../apps/editor/package.json', import.meta.url));
const { getDocument, Util } = await import(pathToFileURL(req.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
const task = getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true });
const pdf = await task.promise, pages = [];
try {
  assert(pdf.numPages >= 3 && pdf.numPages <= 5, 'Stop: wrong holdout page count');
  for (let page = 1; page <= pdf.numPages; page++) {
    const p = await pdf.getPage(page), view = p.getViewport({ scale: 1 }), content = await p.getTextContent();
    const items = content.items.filter(i => i.str?.trim()).map((item, index) => {
      const t = Util.transform(view.transform, item.transform);
      return { text: item.str, x: t[4], y: t[5], width: item.width, height: item.height, index, page };
    }).sort((a,b) => a.y-b.y || a.x-b.x || a.index-b.index);
    const lines = [];
    for (const i of items) {
      if (!lines.length || Math.abs(lines.at(-1).y-i.y)>2) lines.push({ y:i.y, items:[], id:`${page}:${lines.length}`, page, height:view.height });
      lines.at(-1).items.push(i);
    }
    for (const l of lines) { l.items.sort((a,b)=>a.x-b.x); l.text=l.items.map(i=>i.text).join(' '); }
    pages.push({ page, height: view.height, width: view.width, lines });
  }
} finally { await task.destroy(); }
const edge = l => l.y < l.height*.08 || l.y > l.height*.92;
const repeats = new Map();
for (const p of pages) for (const l of p.lines) if (edge(l)) {
  const key=rawWords(l.text).join(' '); if(!repeats.has(key)) repeats.set(key,new Set()); repeats.get(key).add(p.page);
}
let id=0, total=0, folded=0;
const evidence=[], excludedCounts={furniture:0,'repeated-edge':0,picture:0,formula:0};
for(const p of pages) for(const l of p.lines) for(const i of l.items) {
  const x=i.x+i.width/2, y=i.y-i.height/2;
  const region=regions.find(r=>r.page===p.page&&x>=r.left-1&&x<=r.right+1&&y>=r.top-1&&y<=r.bottom+1);
  const repeated=edge(l)&&(/^\s*\d+\s*$/.test(l.text)||repeats.get(rawWords(l.text).join(' '))?.size>=3);
  const reason=region?.reason??(repeated?'repeated-edge':undefined), raw=rawWords(i.text), normalized=words(i.text);
  total+=raw.length; if(region) region.pdfRawTokens+=raw.length;
  if(reason) excludedCounts[reason]+=raw.length; else folded+=raw.length-normalized.length;
  i.group=reason?`out:${reason}`:region?.group??'body'; i.rawTokens=raw.length;
  const tokens=normalized.map(text=>({text,id:id++,page:p.page,line:l.id,group:i.group}));
  evidence.push(...tokens);
}
// Join only letter / line-end hyphen / next-line lowercase within one group/page.
for(let i=1;i+1<evidence.length;i++) {
  const a=evidence[i-1],h=evidence[i],b=evidence[i+1];
  if(h.text==='-'&&/^\p{L}+$/u.test(a.text)&&/^\p{Ll}/u.test(b.text)&&a.line!==b.line&&a.page===b.page&&a.group===b.group&&a.group===h.group) {a.text+=b.text;evidence.splice(i,2);i--;}
}
const pathRefs=new Map();
for(const item of converted.report.items) for(const t of item.targets) {
  const key=JSON.stringify(t.path); if(!pathRefs.has(key)) pathRefs.set(key,[]); pathRefs.get(key).push(item.self_ref);
}
// Source span map collapses only converter copies of the same semantic cell.
const cellMap=new Map();
for(const item of converted.report.items.filter(i=>i.self_ref.startsWith('#/tables/'))) for(const cell of item.cells??[]) {
  const path=item.targets[0].path[0], positions=cell.positions.map(p=>[path,p.row,p.column]);
  for(const position of positions) cellMap.set(JSON.stringify(position),{ref:item.self_ref,index:cell.index,positions,key:`${item.self_ref}:${cell.index}`});
}
function units(document, remap=new Map()) {
  const seenCells=new Set();
  return project(document).map(u=>{
    const oldPath=[remap.get(u.path[0])??u.path[0],...u.path.slice(1)];
    const refs=pathRefs.get(JSON.stringify([oldPath[0]]))??[];
    const table=refs.find(r=>r.startsWith('#/tables/')), picture=refs.find(r=>r.startsWith('#/pictures/'));
    const source=refs.map(resolve), textItems=source.filter(i=>i?.self_ref.startsWith('#/texts/'));
    const cell=u.kind==='cell'?cellMap.get(JSON.stringify(oldPath)):undefined;
    let reason, group='body';
    const sourceRegion=textItems.flatMap(item=>(item.prov??[]).map(p=>{
      const b=p.bbox,h=original.pages[p.page_no].size.height;
      const x=(b.l+b.r)/2,y=b.coord_origin==='BOTTOMLEFT'?h-(b.t+b.b)/2:(b.t+b.b)/2;
      return regions.find(r=>r.page===p.page_no&&x>=r.left-1&&x<=r.right+1&&y>=r.top-1&&y<=r.bottom+1);
    })).find(Boolean);
    if(table) { group=table; reason=excluded(resolve(table)); }
    else if(picture&&u.kind==='caption') group=picture;
    else if(textItems.length&&textItems.every(i=>excluded(i))) reason=excluded(textItems[0]);
    else if(sourceRegion?.reason) reason=sourceRegion.reason;
    else if(sourceRegion&&sourceRegion.group!=='body') group=sourceRegion.group;
    // Tables' separate caption paragraph is already bound to its owner via report.
    if(reason) group=`out:${reason}`;
    const page=source.flatMap(i=>i?.prov??[])[0]?.page_no;
    const skip=cell&&seenCells.has(cell.key); if(cell) seenCells.add(cell.key);
    return {...u,oldPath,refs,group,page,cell,skip,tokens:words(u.text)};
  }).filter(u=>!u.skip).map((u,id)=>({...u,id}));
}

function bag(pdfTokens,docUnits) {
  const remaining=new Map(),matches=[],unsupported=[];
  for(const t of pdfTokens) {if(!remaining.has(t.text))remaining.set(t.text,[]);remaining.get(t.text).push(t);}
  for(const u of docUnits) for(const [index,text] of u.tokens.entries()) {
    const p=remaining.get(text)?.shift();
    if(p)matches.push({pdf:p.id,unit:u.id,token:index}); else unsupported.push({text,unit:u.id,index,page:u.page});
  }
  const ids=new Set([...remaining.values()].flat().map(t=>t.id));
  const missing=pdfTokens.filter(t=>ids.has(t.id));
  const alerts=[];
  // Keep separate unmatched runs; no one-alert-per-table shortcut.
  let gap;
  for(const t of pdfTokens) {
    if(!ids.has(t.id)){gap=undefined;continue;}
    if(!gap||gap.page!==t.page){gap={page:t.page,missing:[],unsupported:[]};alerts.push(gap);}gap.missing.push(t);
  }
  const extra=new Set(unsupported.map(t=>`${t.unit}:${t.index}`));gap=undefined;
  for(const u of docUnits) for(const [index,text] of u.tokens.entries()) {
    if(!extra.has(`${u.id}:${index}`)){gap=undefined;continue;}
    if(!gap||gap.unit!==u.id){gap={page:u.page,unit:u.id,missing:[],unsupported:[]};alerts.push(gap);}gap.unsupported.push({text,unit:u.id,index});
  }
  return {matches,alerts,missing};
}
const tiny=words('Sample 12.5 µg/L ≤ -2%').map((text,id)=>({text,id,page:1,line:'1:0'}));
assert.equal(bag(tiny,[{id:0,page:1,tokens:words('≤ -2% Sample 12.5 µg/L')}]).alerts.length,0);
assert(bag(tiny,[{id:0,page:1,tokens:words('Sample 12.6 µg/L ≤ -2%')}]).alerts.some(a=>a.missing.length));
assert(bag(tiny,[{id:0,page:1,tokens:[]}]).alerts.some(a=>a.missing.length));
function compare(allUnits) {
  const active=allUnits.filter(u=>!u.group.startsWith('out:'));
  const body=active.filter(u=>u.group==='body'), pbody=evidence.filter(t=>t.group==='body');
  const result=lcs(pbody,body);
  const groups=[...new Set([...active.map(u=>u.group),...evidence.filter(t=>!t.group.startsWith('out:')).map(t=>t.group)])].filter(g=>g!=='body');
  for(const group of groups) {
    const b=bag(evidence.filter(t=>t.group===group),active.filter(u=>u.group===group));
    result.matches.push(...b.matches); result.alerts.push(...b.alerts.map(a=>({...a,group})));
  }
  result.alerts=result.alerts.map((a,index)=>({...a,id:index+1,group:a.group??'body',pdfText:a.missing.map(t=>t.text).join(' '),docText:a.unsupported.map(t=>t.text).join(' ')}));
  return result;
}
const initial=units(doc);
let state=protocol.seed;
function random(){let t=state+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}
function sample(a){assert(a.length>=3,'Stop: fewer than 3 eligible cases');const copy=[...a];for(let i=copy.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy.slice(0,3);}
const paragraphs=initial.filter(u=>u.kind==='paragraph'&&u.group==='body'&&u.text.length>=80);
const selected=[];
for(const [kind,candidates] of [['paragraph-delete',paragraphs],['number-change',paragraphs.filter(u=>/[0-9]/.test(u.text))],['paragraph-order',paragraphs.slice(0,-1)],['cell-delete',initial.filter(u=>u.kind==='cell'&&u.text.trim().length>=4)]]) {
  for(const [index,target] of sample(candidates).entries()) selected.push({kind,case:index+1,target});
}
// Persist all choices before the first holdout comparison; no resampling.
await writeFile(`${out}/selection.json`,JSON.stringify(selected,null,2));
const baseline=compare(initial), results=[];
function missingCounts(run,group){const counts=new Map();for(const t of run.alerts.filter(a=>a.group===group).flatMap(a=>a.missing))counts.set(t.text,(counts.get(t.text)??0)+1);return counts;}
for(const test of selected) {
  const {target,kind}=test,remap=new Map();let variant,changed;
  if(kind==='paragraph-delete') variant=removeBlock(doc,target.path[0]);
  if(kind==='number-change') {changed=target.text.replace(/[0-9]/,d=>String((Number(d)+1)%10));variant=updateParagraphInlineContent(doc,target.path,[{kind:'text',text:changed}]);}
  let interval;
  if(kind==='paragraph-order') {
    const next=paragraphs[paragraphs.indexOf(target)+1];variant=moveBlock(doc,target.path[0],next.path[0]);interval=[target.id,next.id];
  }
  if(kind==='cell-delete') {variant=doc;for(const path of target.cell?.positions??[target.path])variant=updateTableCell(variant,path,'');}
  // Core indices include metadata nodes; derive the exact index shifts, never rebind by text similarity.
  const oldIndices=new Set(project(doc).map(u=>u.path[0]));
  if(kind==='paragraph-delete') for(const old of oldIndices) if(old!==target.path[0]) remap.set(old>target.path[0]?old-1:old,old);
  if(kind==='paragraph-order') {
    const to=paragraphs[paragraphs.indexOf(target)+1].path[0],from=target.path[0];
    for(const old of oldIndices) remap.set(old===from?to:old>from&&old<=to?old-1:old,old);
  }
  const source=serialize(variant);assert.equal(canonicalWriteError(variant),undefined);assert.equal(serialize(parse(source)),source);assert.notEqual(source,converted.source);
  const current=units(parse(source),remap),run=compare(current);
  const baseMissing=new Set(baseline.alerts.flatMap(a=>a.missing.map(t=>t.id)));
  const fresh=run.alerts.flatMap(a=>a.missing).filter(t=>!baseMissing.has(t.id));
  const targetIds=new Set(baseline.matches.filter(m=>m.unit===target.id).map(m=>m.pdf));
  const hits=fresh.filter(t=>targetIds.has(t.id));let detected=false,detail;
  if(kind==='paragraph-delete') detected=hits.length>=Math.ceil(target.tokens.length/2);
  if(kind==='number-change') {
    const u=current.find(u=>JSON.stringify(u.oldPath)===JSON.stringify(target.path)),oldNumber=target.tokens.find(t=>/[0-9]/.test(t)),newNumber=words(changed).find(t=>/[0-9]/.test(t));
    detected=hits.some(t=>t.text===oldNumber)&&run.alerts.some(a=>a.unsupported.some(t=>t.unit===u.id&&t.text===newNumber));
    detail={oldNumber,newNumber};
  }
  if(kind==='cell-delete') {
    const old=missingCounts(baseline,target.group),now=missingCounts(run,target.group),need=new Map();
    for(const t of target.tokens)need.set(t,(need.get(t)??0)+1);
    let count=0;for(const [t,n]of need)count+=Math.min(n,Math.max(0,(now.get(t)??0)-(old.get(t)??0)));
    detected=count>=Math.ceil(target.tokens.length/2);detail={newMissingTargetTokenCounts:count};
  }
  if(kind==='paragraph-order') {
    const affected=new Set(baseline.matches.filter(m=>m.unit>=interval[0]&&m.unit<=interval[1]).map(m=>m.pdf));
    const missing=fresh.filter(t=>affected.has(t.id)), body=evidence.filter(t=>t.group==='body');
    for(let i=0;i+8<=missing.length;i++) {
      const seq=missing.slice(i,i+8),idx=seq.map(t=>body.findIndex(p=>p.id===t.id));
      if(idx.some((n,k)=>k&&n!==idx[k-1]+1))continue;
      for(const a of run.alerts) for(let j=0;j+8<=a.unsupported.length;j++) if(a.unsupported.slice(j,j+8).map(t=>t.text).join('\0')===seq.map(t=>t.text).join('\0'))detected=true;
    }
  }
  const record={kind,case:test.case,path:target.path,group:target.group,page:target.page,targetTextSha256:hash(target.text),tokens:target.tokens.length,baselineMatched:targetIds.size,newTargetMissing:hits.length,detected,detail,alerts:run.alerts.length};
  results.push(record);
  await writeFile(`${out}/${kind}-${test.case}.md`,source);
  await writeFile(`${out}/${kind}-${test.case}.json`,JSON.stringify(run,null,2));
}
const outside=Object.values(excludedCounts).reduce((a,b)=>a+b,0);
const summary={protocolSha256:hash(protocolBytes),seed:protocol.seed,pdfSha256:hash(pdfBytes),doclingSha256:hash(originalBytes),litzioSha256:hash(converted.source),pages:pages.length,coverage:{denominatorRawPdfTokens:total,inScopeRawPdfTokens:total-outside,inScopePercent:100*(total-outside)/total,outsideRawPdfTokens:outside,outsidePercent:100*outside/total,byReason:excludedCounts,punctuationFoldedInScope:folded,excludedDoclingRegions:regions.filter(r=>r.reason).map(r=>({ref:r.ref,page:r.page,reason:r.reason,pdfRawTokens:r.pdfRawTokens})),excludedLitzioUnits:initial.filter(u=>u.group.startsWith('out:')).length},baseline:{alerts:baseline.alerts.length,perPage:baseline.alerts.length/pages.length,perGroup:Object.fromEntries([...new Set(baseline.alerts.map(a=>a.group))].map(group=>[group,baseline.alerts.filter(a=>a.group===group).length])),fingerprint:hash(JSON.stringify(baseline.alerts.map(a=>[a.page,a.group,a.pdfText,a.docText])))},cases:results,elapsedMs:performance.now()-begin};
await writeFile(`${out}/initial.md`,converted.source);
await writeFile(`${out}/evidence.json`,JSON.stringify({pages,regions,evidence,units:initial},null,2));
await writeFile(`${out}/baseline.json`,JSON.stringify(baseline,null,2));
await writeFile(`${out}/summary.json`,JSON.stringify(summary,null,2)+'\n');
assert.equal(hash(await readFile(`${out}/document.json`)),hash(originalBytes));
console.log(JSON.stringify(summary,null,2));
