/** Deterministic source selection, never an AI inspection or a correction.
 * @param {import("./schema/document.js").DoclingDocument} doc
 */
export function extractReviewLenses(doc, sourceRevision, report) {
  const collections = ["texts", "tables", "pictures", "groups", "key_value_items", "form_items"];
  const items = collections.flatMap(key => doc[key] ?? []), nodes = new Map(items.map(item => [item.self_ref, item]));
  const resolve = ref => {
    const item = nodes.get(ref.$ref);
    if (!item) throw new Error(`Unresolved lens reference: ${ref.$ref}`);
    return item;
  };
  const order = new Map(), depth = new Map(), seen = new Set();
  function visit(item, level) {
    if (seen.has(item.self_ref)) throw new Error(`Duplicate/cyclic reading reference: ${item.self_ref}`);
    seen.add(item.self_ref); order.set(item.self_ref, order.size); depth.set(item.self_ref, level);
    for (const ref of item.children ?? []) visit(resolve(ref), level + 1);
  }
  for (const root of [doc.body, doc.furniture]) for (const ref of root?.children ?? []) visit(resolve(ref), 0);
  // Resolve ownership too: a schema-valid dangling ref must not yield empty success.
  for (const item of items) for (const key of ["captions", "footnotes", "references"]) for (const ref of item[key] ?? []) resolve(ref);
  const pagesOf = selected => [...new Set(selected.flatMap(item => (item.prov ?? []).map(p => p.page_no)))].sort((a,b) => a-b);
  const furniture = item => item.content_layer === "furniture" || ["page_header", "page_footer"].includes(item.label);
  const body = item => (item.content_layer ?? "body") === "body" && !furniture(item);
  const summary = item => ({ self_ref:item.self_ref, label:item.label, content_layer:item.content_layer ?? "body",
    parent:item.parent ?? null, children:item.children ?? [], prov:item.prov ?? [],
    order:order.get(item.self_ref) ?? null, depth:depth.get(item.self_ref) ?? null,
    ...(typeof item.text === "string" ? {text:item.text} : {}),
    ...(item.level !== undefined ? {level:item.level} : {}),
    ...(item.marker !== undefined ? {marker:item.marker,enumerated:item.enumerated} : {}),
  });
  const ordered = items.filter(item => order.has(item.self_ref)).sort((a,b) => order.get(a.self_ref)-order.get(b.self_ref));
  const nearby = item => {
    const index = ordered.indexOf(item);
    return index < 0 ? [] : ordered.slice(Math.max(0,index-1),index+2).filter(other => other !== item);
  };
  const kinds = [], lenses = {};
  function add(kind, official, auxiliary, selected) {
    const scope = {pages:pagesOf(selected),targets:[...new Set(selected.map(item => item.self_ref))]};
    kinds.push({kind,required:true,scope,extracted:true});
    lenses[kind] = {scope,official,auxiliary};
  }
  const headings = items.filter(item => ["title","section_header","document_index"].includes(item.label));
  add("headings",headings.map(item => ({...summary(item),...(item.label === "document_index" ? {table_cells:item.data?.table_cells ?? []} : {})})),[],headings);
  function topFraction(prov) {
    const page = doc.pages?.[prov.page_no];
    if (!page?.size?.height) throw new Error(`Missing lens provenance page: ${prov.page_no}`);
    const box = prov.bbox;
    return (box.coord_origin === "BOTTOMLEFT" ? page.size.height - Math.max(box.t,box.b) : Math.min(box.t,box.b)) / page.size.height;
  }
  const bands = items.filter(item => body(item) && typeof item.text === "string" && item.text.length <= 220 &&
    (item.prov ?? []).some(prov => { const y=topFraction(prov); return y <= .12 || y >= .88; }));
  const normalized = item => item.text.replace(/\d/g,"#").replace(/\s+/g," ").trim();
  const repeats = new Map();
  for (const item of bands) {
    const key = normalized(item), pages = repeats.get(key) ?? new Set();
    for (const page of pagesOf([item])) pages.add(page);
    repeats.set(key,pages);
  }
  const headerCandidates = bands.filter(item => repeats.get(normalized(item)).size > 1);
  const headers = items.filter(furniture);
  add("headers-footers",headers.map(summary),headerCandidates.map(item => ({...summary(item),basis:"repeated-number-normalized-12-percent-band",normalized:normalized(item)})),[...headers,...headerCandidates]);
  function ownership(kind, field, label, candidates = []) {
    const owners = items.filter(item => (item[field] ?? []).length), owned = new Set(owners.flatMap(item => item[field].map(ref => ref.$ref)));
    const selected = items.filter(item => item.label === label || owned.has(item.self_ref));
    const context = [...owners,...selected].flatMap(nearby);
    add(kind,{owners:owners.map(item => ({...summary(item),[field]:item[field].map(ref => summary(resolve(ref)))})),
      unlinked:selected.filter(item => !owned.has(item.self_ref)).map(summary),context:context.map(summary)},
      candidates.map(item => ({...summary(item),basis:"marker-prefix-bottom-35-percent"})),[...owners,...selected,...context,...candidates]);
  }
  ownership("captions","captions","caption");
  const footnoteCandidates = items.filter(item => body(item) && item.label !== "footnote" && typeof item.text === "string" &&
    /^\s*(?:\d+|[A-Za-z])(?:[.)]|\s)/.test(item.text) && (item.prov ?? []).some(prov => topFraction(prov) >= .65));
  ownership("footnotes","footnotes","footnote",footnoteCandidates);
  const lists = items.filter(item => item.label === "list_item" || item.self_ref.startsWith("#/groups/") && ["list","ordered_list"].includes(item.label));
  add("lists",lists.map(summary),[],lists);
  const bodyOrder = ordered.filter(item => body(item) && !item.self_ref.startsWith("#/groups/"));
  const pages = Object.keys(doc.pages ?? {}).map(Number).sort((a,b)=>a-b), boundaries = [], boundaryItems = [];
  for (let i=0;i<pages.length-1;i++) {
    const before = bodyOrder.filter(item => pagesOf([item]).includes(pages[i])).at(-1);
    const after = bodyOrder.find(item => pagesOf([item]).includes(pages[i+1]));
    boundaries.push({from:pages[i],to:pages[i+1],last:before ? summary(before) : null,first:after ? summary(after) : null});
    boundaryItems.push(...[before,after].filter(Boolean));
  }
  add("page-boundaries",boundaries,[],boundaryItems);
  // Missing items at a boundary are explicit evidence, not an absent extraction.
  const formulas = items.filter(item => item.label === "formula"), tables = doc.tables ?? [];
  const tableData = tables.map(item => {
    const cells = item.data.table_cells, occupied = new Map(), overlaps = [], invalid = [];
    for (const [index,cell] of cells.entries()) {
      const {start_row_offset_idx:r0,end_row_offset_idx:r1,start_col_offset_idx:c0,end_col_offset_idx:c1} = cell;
      if (r0<0 || c0<0 || r1<=r0 || c1<=c0 || r1>item.data.num_rows || c1>item.data.num_cols) {invalid.push(index);continue;}
      for (let row=r0;row<r1;row++) for (let column=c0;column<c1;column++) {
        const key=`${row}:${column}`;
        if (occupied.has(key)) overlaps.push({row,column,cells:[occupied.get(key),index]});
        occupied.set(key,index);
      }
    }
    const unoccupied = [];
    for (let row=0;row<item.data.num_rows;row++) for (let column=0;column<item.data.num_cols;column++) if(!occupied.has(`${row}:${column}`)) unoccupied.push({row,column});
    return {...summary(item),num_rows:item.data.num_rows,num_cols:item.data.num_cols,
      table_cells:cells.map((cell,index)=>({index,...cell})),overlaps,unoccupied,invalid};
  });
  add("formulas-tables",{formulas:formulas.map(summary),tables:tableData},[],[...formulas,...tables]);
  const requiredChecks = ["pictures","tables"].flatMap(collection => (doc[collection] ?? []).map(item => {
    const mapped = report.items.find(entry => entry.self_ref === item.self_ref);
    const disposition = furniture(item) || mapped?.status === "furniture" ? "furniture" : mapped?.status === "excluded" ? "excluded" : mapped?.targets?.length ? "supported" : "unsupported";
    const regions=(item.prov ?? []).map((prov,index)=>{
      const height=doc.pages?.[prov.page_no]?.size?.height, box=prov.bbox;
      if(!height)throw new Error(`Missing inventory provenance page: ${prov.page_no}`);
      const top=box.coord_origin === "BOTTOMLEFT" ? height-box.t : box.t, bottom=box.coord_origin === "BOTTOMLEFT" ? height-box.b : box.b;
      return {page:prov.page_no,bbox:[Math.min(box.l,box.r),Math.min(top,bottom),Math.max(box.l,box.r),Math.max(top,bottom)],ref:`${item.self_ref}/prov/${index}`};
    });
    return {id:item.self_ref,kind:collection === "pictures" ? "picture" : "table",locator:{self_ref:item.self_ref},
      pages:pagesOf([item]),regions,disposition,derivedFrom:[item.self_ref]};
  }));
  const targets=items.map(item => item.self_ref);
  kinds.push({kind:"source-evidence",required:false,scope:{pages,targets},extracted:false});
  return {lenses,inventory:{contentRevision:sourceRevision,pages,targets,lenses:kinds,requiredChecks,complete:true}};
}
