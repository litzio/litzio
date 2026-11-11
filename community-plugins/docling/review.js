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
