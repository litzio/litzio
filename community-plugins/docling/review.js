import { DOCUMENT_AUTHORING_LIMITS } from "@litzio/plugin-sdk";

export const emptyReview = () => ({ patches: [], checkedPages: [], lastPage: null, approval: null });
export function readReview(bytes) {
  const record = bytes === undefined ? emptyReview() : JSON.parse(Buffer.from(bytes).toString("utf8"));
  if (!record || Object.keys(record).sort().join() !== ["patches", "checkedPages", "lastPage", "approval"].sort().join() ||
      !Array.isArray(record.patches) || record.patches.length > 2000 || !Array.isArray(record.checkedPages) || record.checkedPages.some(p => !Number.isInteger(p) || p < 1) ||
      record.lastPage !== null && (!Number.isInteger(record.lastPage) || record.lastPage < 1) || record.approval !== null) throw new Error("Invalid review record");
  return record;
}
/** Replay against a copy. The archived PDF and JSON bytes never change. */
export function applyCorrections(original, patches = []) {
  if (!Array.isArray(patches) || patches.length > 2000) throw new Error("Invalid corrections");
  // Patches cannot address pages. Keep their immutable embedded image bytes out of the replay copy.
  const { pages, ...content } = original;
  const doc = structuredClone(content), nodes = new Map();
  if (pages !== undefined) doc.pages = pages;
  for (const kind of ["texts", "tables", "pictures", "groups", "key_value_items", "form_items"]) for (const [i, item] of (doc[kind] ?? []).entries()) {
    if (item.self_ref !== `#/${kind}/${i}`) throw new Error("Invalid self_ref");
    nodes.set(item.self_ref, { item, kind });
  }
  const text = value => typeof value === "string" && value.length <= DOCUMENT_AUTHORING_LIMITS.string && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
  function exclude(ref, excluded, ancestors = new Set()) {
    const node = nodes.get(ref);
    if (!node || ancestors.has(ref)) throw new Error("Invalid correction target tree");
    node.item.__reviewExcluded = excluded;
    for (const child of node.item.children ?? []) exclude(child.$ref, excluded, new Set([...ancestors, ref]));
  }
  for (const patch of patches) {
    const node = nodes.get(patch?.self_ref);
    if (!node) throw new Error("Unknown correction target");
    const fields = { text: ["type", "self_ref", "text"], kind: ["type", "self_ref", "kind", ...(patch.kind === "heading" ? ["level"] : [])],
      exclude: ["type", "self_ref", "excluded"], cell: ["type", "self_ref", "cell", "text"] }[patch.type];
    if (!fields || Object.keys(patch).length !== fields.length || fields.some(key => !Object.hasOwn(patch, key))) throw new Error("Invalid correction fields");
    if (patch.type === "text") {
      if (node.kind !== "texts" || !text(patch.text)) throw new Error("Expected a text item and Unicode text");
      node.item.text = patch.text;
    } else if (patch.type === "kind") {
      if (node.kind !== "texts" || !["paragraph", "heading"].includes(patch.kind) || patch.kind === "heading" && (!Number.isInteger(patch.level) || patch.level < 1 || patch.level > 6)) throw new Error("Expected paragraph or heading 1–6");
      node.item.label = patch.kind === "heading" ? "section_header" : "text";
      node.item.__reviewKind = true;
      node.item.content_layer = "body";
      if (patch.kind === "heading") node.item.level = patch.level; else delete node.item.level;
    } else if (patch.type === "exclude") {
      if (typeof patch.excluded !== "boolean") throw new Error("Expected exclusion flag");
      exclude(patch.self_ref, patch.excluded);
    } else {
      if (node.kind !== "tables" || !Number.isInteger(patch.cell) || patch.cell < 0 || !node.item.data?.table_cells?.[patch.cell] || !text(patch.text)) throw new Error("Expected original table_cells index and Unicode text");
      node.item.data.table_cells[patch.cell].text = patch.text;
    }
  }
  return doc;
}
export function reviewItems(doc) {
  return ["texts", "tables", "pictures", "groups", "key_value_items", "form_items"].flatMap(kind => (doc[kind] ?? []).map(item => ({
    self_ref: item.self_ref, kind, label: item.label, excluded: item.__reviewExcluded === true,
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

/** Page bytes stay immutable; regions, kinds and targets use one replayed effective document. */
export function comparison(archive, record, report, input) {
  const pages = Object.entries(archive.document.pages ?? {}).map(([key, page]) => ({ generation: input.generation, sourceRevision: input.sourceRevision, pageNo: Number(key), width: page.size.width, height: page.size.height, unit: "pt", origin: "TOPLEFT", regions: [] })).sort((a,b) => a.pageNo-b.pageNo);
  if (!pages.length || pages.some((p,i) => p.pageNo !== i+1)) throw new Error("Expected consecutive PDF pages");
  const effective = applyCorrections(archive.document, record.patches);
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
      const status = current.__reviewExcluded ? "excluded" : item.status === "furniture" ? "decoration" : item.targets.length ? "supported" : "unsupported";
      const kind = regionKinds.get(current.label);
      page.regions.push({id,bbox,category: current.label ?? "item",...(kind ? {kind} : {}),status}); sourceIds.push(id);
    }
    if (sourceIds.length) entries.push({sourceIds,targets:item.targets});
  }
  return {review:"compare",bundle:{generation:input.generation,documentRevision:input.result.revision,documentHash:input.result.revision,sourceRevision:input.sourceRevision,mappingRevision:input.generation},pages,images:[],mapping:{generation:input.generation,documentRevision:input.result.revision,documentHash:input.result.revision,sourceRevision:input.sourceRevision,mappingRevision:input.generation,entries}};
}
export function setProgress(document, record, progress) {
  const pages = new Set(Object.keys(document.pages ?? {}).map(Number));
  if (!progress || Object.keys(progress).sort().join() !== "checkedPages,lastPage" || !Array.isArray(progress.checkedPages) || new Set(progress.checkedPages).size !== progress.checkedPages.length || progress.checkedPages.some(p => !Number.isInteger(p) || !pages.has(p)) || progress.lastPage !== null && (!Number.isInteger(progress.lastPage) || !pages.has(progress.lastPage))) throw new Error("Invalid review progress");
  record.checkedPages = [...progress.checkedPages].sort((a,b)=>a-b); record.lastPage=progress.lastPage;
}
