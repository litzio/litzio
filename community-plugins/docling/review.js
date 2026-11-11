import { emptyReviewLedger, reviewLedgerSchema } from "@litzio/plugin-sdk";

export const emptyReview = () => ({ version: 4, checkedPages: [], lastPage: null, approval: null, ledger: emptyReviewLedger() });
export function readReview(bytes) {
  const record = bytes === undefined ? emptyReview() : JSON.parse(Buffer.from(bytes).toString("utf8"));
  if (!record || record.version !== 4 || Object.keys(record).sort().join() !== ["version", "checkedPages", "lastPage", "approval", "ledger"].sort().join() ||
      !Array.isArray(record.checkedPages) || record.checkedPages.some(p => !Number.isInteger(p) || p < 1) ||
      record.lastPage !== null && (!Number.isInteger(record.lastPage) || record.lastPage < 1) || record.approval !== null) throw new Error("Invalid review record");
  record.ledger = reviewLedgerSchema.parse(record.ledger);
  return record;
}

/** Original evidence identity remains immutable after document corrections. */
export function originalReviewTarget(document, locator) {
  const match = /^#\/(texts|tables|pictures|groups|key_value_items|form_items)\/(0|[1-9]\d*)$/.exec(locator.self_ref ?? "");
  const item = match && document[match[1]]?.[Number(match[2])];
  if (!item || item.self_ref !== locator.self_ref || locator.cell !== undefined && locator.cell !== null &&
      (match[1] !== "tables" || !Number.isInteger(locator.cell) || locator.cell < 0 || !item.data?.table_cells?.[locator.cell])) throw new Error("Unknown original review target");
  return item;
}
export function reviewItems(doc) {
  return ["texts", "tables", "pictures", "groups", "key_value_items", "form_items"].flatMap(kind => (doc[kind] ?? []).map(item => ({
    self_ref: item.self_ref, kind, label: item.label, excluded: false,
    pages: [...new Set((item.prov ?? []).map(p => p.page_no))],
    ...(typeof item.text === "string" ? { text: item.text, ...(item.level !== undefined ? { level: item.level } : {}) } : {}),
    ...(kind === "tables" ? { cells: (item.data?.table_cells ?? []).map((cell, index) => ({ cell: index, text: cell.text })) } : {}),
  })));
}

// Provider labels stay here; shared review consumers only see the optional SDK kind.
const regionKinds = new Map([
  ["heading", "heading"], ["title", "heading"], ["section_header", "heading"],
  ["text", "text"], ["paragraph", "text"], ["sentence", "text"], ["caption", "text"],
  ["list", "list"], ["list_item", "list"], ["table", "table"], ["formula", "formula"], ["equation", "formula"],
  ["picture", "picture"], ["image", "picture"], ["figure", "picture"], ["footnote", "footnote"], ["endnote", "footnote"],
  ["code", "code"], ["code_block", "code"],
]);

/** Page bytes stay immutable; regions, kinds and targets use the saved document and its maintained correspondence. */
export function comparison(archive, record, report, input) {
  const pages = Object.entries(archive.document.pages ?? {}).map(([key, page]) => ({ generation: input.generation, sourceRevision: input.sourceRevision, pageNo: Number(key), width: page.size.width, height: page.size.height, unit: "pt", origin: "TOPLEFT", regions: [] })).sort((a,b) => a.pageNo-b.pageNo);
  if (!pages.length || pages.some((p,i) => p.pageNo !== i+1)) throw new Error("Expected consecutive PDF pages");
  const effective = archive.document;
  const entries = [], nodes = new Map(["texts", "tables", "pictures", "groups", "key_value_items", "form_items"].flatMap(kind => (effective[kind] ?? []).map(item => [item.self_ref, item])));
  for (const item of report.items) {
    const current = nodes.get(item.self_ref), sourceIds = [];
    if (!current) throw new Error("Unknown effective comparison item");
    for (const [index,prov] of (current.prov ?? []).entries()) {
      const page = pages.find(p => p.pageNo === prov.page_no);
      if (!page) throw new Error("Unknown provenance page");
      const b = prov.bbox, id = `region-${item.self_ref.slice(2).replaceAll("/","-")}-${index}`;
      if (!["TOPLEFT","BOTTOMLEFT"].includes(b.coord_origin)) throw new Error("Unknown coordinate origin");
      const top = b.coord_origin === "TOPLEFT" ? b.t : page.height-b.t, bottom = b.coord_origin === "TOPLEFT" ? b.b : page.height-b.b;
      const bbox = [Math.min(b.l,b.r),Math.min(top,bottom),Math.max(b.l,b.r),Math.max(top,bottom)];
      const status = item.status === "excluded" ? "excluded" : item.status === "furniture" ? "decoration" : item.targets.length ? "supported" : "unsupported";
      const category = item.label ?? current.label;
      const kind = regionKinds.get(category);
      page.regions.push({id,bbox,category: category ?? "item",...(kind ? {kind} : {}),status}); sourceIds.push(id);
    }
    if (sourceIds.length) entries.push({sourceIds,targets:item.targets});
  }
  for(const insertion of report.insertions??[]){
    const sourceIds=[];
    for(const [index,region]of insertion.regions.entries()){
      const page=pages.find(p=>p.pageNo===region.page);if(!page)throw new Error("Unknown insertion evidence page");
      const id=`${insertion.key.replaceAll(":","-")}-${index}`;page.regions.push({id,bbox:region.bbox,category:"삽입 근거",kind:insertion.kind==="heading"?"heading":"text",status:"supported"});
      sourceIds.push(id);
    }
    if(sourceIds.length)entries.push({sourceIds,targets:insertion.targets});
  }
  for (const pageNo of report.failedPages ?? []) {
    const page = pages.find(page => page.pageNo === pageNo);
    if (page) page.regions.push({id:`failed-page-${pageNo}`,bbox:[0,0,page.width,page.height],category:"변환 실패 페이지",status:"unsupported",reason:"이 쪽의 변환이 실패했습니다. 원본 PDF를 확인하세요."});
  }
  return {review:"compare",bundle:{generation:input.generation,documentRevision:input.result.revision,documentHash:input.result.revision,sourceRevision:input.sourceRevision,mappingRevision:input.generation},pages,images:[],mapping:{generation:input.generation,documentRevision:input.result.revision,documentHash:input.result.revision,sourceRevision:input.sourceRevision,mappingRevision:input.generation,entries}};
}
export function setProgress(document, record, progress) {
  const pages = new Set(Object.keys(document.pages ?? {}).map(Number));
  if (!progress || Object.keys(progress).sort().join() !== "checkedPages,lastPage" || !Array.isArray(progress.checkedPages) || new Set(progress.checkedPages).size !== progress.checkedPages.length || progress.checkedPages.some(p => !Number.isInteger(p) || !pages.has(p)) || progress.lastPage !== null && (!Number.isInteger(progress.lastPage) || !pages.has(progress.lastPage))) throw new Error("Invalid review progress");
  record.checkedPages = [...progress.checkedPages].sort((a,b)=>a-b); record.lastPage=progress.lastPage;
}

/** Only this adapter knows Docling labels, self_refs, cell spans and provenance. */
export function evidenceMaterial(archive, report) {
  const doc=archive.document, regions=[],bindings=[], owners=new Map();
  for(const owner of [...(doc.tables??[]),...(doc.pictures??[])])for(const c of owner.captions??[])owners.set(c.$ref,owner.self_ref);
  const nodes=[...(doc.texts??[]),...(doc.tables??[]),...(doc.pictures??[])];
  const excluded=item=>item.content_layer==="furniture"||["page_header","page_footer"].includes(item.label)?"furniture":
    ["formula","equation"].includes(item.label)?"formula":item.self_ref.startsWith("#/pictures/")?"picture":undefined;
  const groupFor=item=>item.self_ref.startsWith("#/tables/")?item.self_ref:owners.get(item.self_ref)??(item.label==="footnote"?`footnotes:${item.prov?.[0]?.page_no}`:"body");
  for(const item of nodes){
    const exclude=excluded(item),group=exclude?`out:${exclude}`:groupFor(item);
    for(const [i,p]of(item.prov??[]).entries()){
      const b=p.bbox,h=doc.pages[p.page_no].size.height,t=b.coord_origin==="BOTTOMLEFT"?h-b.t:b.t,bt=b.coord_origin==="BOTTOMLEFT"?h-b.b:b.b;
      // Body has no area filter: all otherwise unclassified PDF text remains in scope.
      if(group!=="body")regions.push({id:`${item.self_ref}:${i}`,page:p.page_no,bbox:[Math.min(b.l,b.r),Math.min(t,bt),Math.max(b.l,b.r),Math.max(t,bt)],group,...(exclude?{exclude}:{})});
    }
    const mapped=report.items.find(m=>m.self_ref===item.self_ref);
    for(const target of mapped?.targets??[])bindings.push({path:target.path,group:exclude==="picture"?item.self_ref:group,page:item.prov?.[0]?.page_no,...(mapped.listItem!==undefined?{listItem:mapped.listItem}:{}),...(exclude&&exclude!=="picture"?{exclude}:{})});
    for(const cell of mapped?.cells??[])for(const target of mapped.targets)for(const position of cell.positions)
      bindings.unshift({path:[target.path[0],position.row,position.column],group,page:item.prov?.[0]?.page_no,cellKey:`${item.self_ref}:${cell.index}`});
  }
  const priority=r=>r.exclude==="furniture"?0:r.exclude==="formula"?1:r.exclude==="picture"?2:r.group.startsWith("#/tables/")?3:r.group.startsWith("footnotes:")?5:4;
  regions.sort((a,b)=>priority(a)-priority(b));
  // Caption text inside an excluded picture/formula/furniture area shares that scope hypothesis.
  for(const b of bindings){
    const item=nodes.find(item=>report.items.find(m=>m.self_ref===item.self_ref&&m.listItem===b.listItem)?.targets.some(t=>JSON.stringify(t.path)===JSON.stringify(b.path)));
    if(b.group!=="body"||!item)continue;
    for(const p of item.prov??[]){const bb=p.bbox,h=doc.pages[p.page_no].size.height,x=(bb.l+bb.r)/2,y=bb.coord_origin==="BOTTOMLEFT"?h-(bb.t+bb.b)/2:(bb.t+bb.b)/2;
      const r=regions.find(r=>r.page===p.page_no&&x>=r.bbox[0]-1&&x<=r.bbox[2]+1&&y>=r.bbox[1]-1&&y<=r.bbox[3]+1);
      if(r){b.group=r.group;if(r.exclude)b.exclude=r.exclude;break;}}
  }
  for(const insertion of report.insertions??[])for(const target of insertion.targets)bindings.push({path:target.path,group:"body",page:insertion.regions[0]?.page});
  return {pdfBase64:archive.sourcePdf.toString("base64"),regions,bindings};
}
