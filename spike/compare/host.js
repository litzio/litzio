import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createComparisonDocument, completedReviewSchema, SDK_VERSION } from '@litzio/plugin-sdk';
const hash = x => createHash('sha256').update(x).digest('hex');
export function activate() {
 const jobs = new Map();
 return { operations: {
  start(input) {
   try { const root=path.dirname(input.file), bytes=readFileSync(input.file), d=JSON.parse(bytes), sourceRevision=hash(bytes), generation=input.requestId;
   const resolve=ref=>ref.slice(2).split('/').reduce((a,k)=>a[k],d);
   const blocks=[], owners=[], regions=[], limits=[];
   function visit(ref, parent) {
    const item=resolve(ref), ids=[];
    for(const [i,p] of (item.prov||[]).entries()) {
     const id=ref.replace(/[^a-zA-Z0-9_.-]/g,'-')+'-'+i, b=p.bbox; ids.push(id);
     regions.push({ page:p.page_no, id, bbox:[b.l,Math.min(b.b,b.t),b.r,Math.max(b.b,b.t)], category:item.label||'group', status:item.content_layer==='furniture'?'decoration':'supported', ...(item.content_layer==='furniture'?{reason:'Docling furniture layer; excluded from document'}:{}) });
    }
    if(item.content_layer==='furniture') return;
    let block;
    if(ref.startsWith('#/pictures/')) block={kind:'figure',image:item.image.uri,caption:(item.captions||[]).map(r=>resolve(r.$ref).text).join(' ')};
    else if(ref.startsWith('#/tables/')) {
     const rows=Array.from({length:item.data.num_rows},()=>Array(item.data.num_cols).fill(''));
     for(const c of item.data.table_cells) { rows[c.start_row_offset_idx][c.start_col_offset_idx]=c.text; if(c.row_span>1||c.col_span>1)limits.push({ref,reason:'Merged cell flattened to anchor; no fidelity claim'}); }
     block={kind:'table',rows};
    } else if(typeof item.text==='string') block=item.label==='section_header'?{kind:'heading',level:Math.max(1,Math.min(6,item.level||2)),text:item.text}:{kind:'paragraph',text:item.text};
    if(block) {blocks.push(block);owners.push({ref,ids:[...ids],parent});
     if(item.captions?.length) { const owner=owners.at(-1); for(const c of item.captions){const before=owners.length;visit(c.$ref,ref);const caption=owners[before];if(caption){owner.ids.push(...caption.ids);caption.ids.push(...ids);}} }
    }
    if(!ref.startsWith('#/pictures/')&&!ref.startsWith('#/tables/')) for(const c of item.children||[])visit(c.$ref,ref);
   }
   for(const c of d.body.children)visit(c.$ref);
   const result=createComparisonDocument(blocks), revision=result.revision;
   const pages=Object.values(d.pages).map(p=>({generation,sourceRevision,pageNo:p.page_no,width:p.size.width,height:p.size.height,origin:'BOTTOMLEFT',unit:'pt',imageRef:'page-'+p.page_no,regions:regions.filter(r=>r.page===p.page_no).map(({page,...r})=>r)}));
   const images=Object.values(d.pages).map(p=>({ref:'page-'+p.page_no,path:p.image.uri,revision:hash(readFileSync(path.join(root,p.image.uri)))}));
   const mapping={generation,documentRevision:revision,documentHash:revision,sourceRevision,mappingRevision:'nist-m1',entries:owners.map((o,i)=>({sourceIds:o.ids,targets:[result.targets[i]]})).filter(e=>e.sourceIds.length)};
   const review=completedReviewSchema.parse({review:'compare',bundle:{generation,documentRevision:revision,documentHash:revision,sourceRevision,mappingRevision:'nist-m1'},pages,mapping,images});
   const complete={state:'completed',phase:'Prepared',document:{source:result.source},review};
   jobs.set(input.requestId,complete);
   return {state:'running',phase:'Accepted'}; } catch(e) { writeFileSync(path.join(path.dirname(input.file),'conversion-error.txt'),String(e.stack)); throw e; }
  },
  status(input){return jobs.get(input.requestId);}, stop(){return {state:'stopped',phase:'Stopped'};},
  read(){return {};}, propose(){throw new Error('Read only spike');}, approve(){throw new Error('Read only spike');}, reject(){throw new Error('Read only spike');}, undo(){throw new Error('Read only spike');},
  probe: async input => { const results=[]; for(const spec of input.specifiers){try{await import(spec);results.push({specifier:spec,rejected:false});}catch{results.push({specifier:spec,rejected:true});}} return {pid:process.pid,sdk:SDK_VERSION,results}; }
 }, status:()=>({available:true,message:'NIST comparison spike',folders:[],decorations:[],accounts:[]}),dispose(){jobs.clear();} };
}
