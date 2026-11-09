import { authorDocument, DOCUMENT_AUTHORING_LIMITS as limits } from "@litzio/plugin-sdk";

// This stage deliberately accepts no edits yet. Future review replays against a copy,
// never mutating the archived JSON or assigning persistent identity to output paths.
function applyCorrections(original) {
  return structuredClone(original);
}

function refuse(reason, ref) {
  throw Object.assign(new Error(reason), { conversionReason: reason, ...(ref ? { sourceRef: ref } : {}) });
}

/** Interpret Docling only here; the SDK owns document semantics and serialization. */
export async function convertDocument(original, sourceHash) {
  const doc = applyCorrections(original);
  if (doc?.schema_name !== "DoclingDocument" || !Array.isArray(doc.body?.children)) refuse("Invalid DoclingDocument");
  const records = new Map(), inputs = [], losses = [], visited = new Set(), captionOwners = new Map();
  const note = (ref, kind, detail, extra = {}) => losses.push({ self_ref: ref, kind, detail, ...extra });
  const isFurniture = item => item.content_layer === "furniture" || ["page_header", "page_footer"].includes(item.label);
  function resolve(ref) {
    const match = /^#\/(texts|groups|tables|pictures|key_value_items|form_items)\/(\d+)$/.exec(ref ?? "");
    const item = match && doc[match[1]]?.[Number(match[2])];
    if (!item || item.self_ref !== ref) refuse("Invalid source reference", ref);
    return item;
  }
  function record(ref) {
    if (!records.has(ref)) {
      const item = resolve(ref);
      records.set(ref, { self_ref: ref, label: item.label ?? "", status: "omitted", links: [], cells: [] });
      inputs.push({ key: ref, blocks: [] });
      if (inputs.length > limits.inputs) refuse(`Authoring input limit exceeded (${limits.inputs})`, ref);
    }
    return records.get(ref);
  }
  let blockCount = 0;
  function emit(ref, block, contributors = [ref]) {
    if (++blockCount > limits.blocks) refuse(`Authoring block limit exceeded (${limits.blocks})`, ref);
    const input = inputs.find(input => input.key === ref), index = input.blocks.length;
    input.blocks.push(block);
    for (const key of contributors) {
      const entry = record(key);
      entry.status = "converted";
      entry.links.push({ key: ref, index });
    }
    return { key: ref, index };
  }
  for (const collection of [doc.tables ?? [], doc.pictures ?? []]) for (const owner of collection) {
    for (const caption of owner.captions ?? []) {
      resolve(caption.$ref);
      if (captionOwners.has(caption.$ref)) refuse("Caption has multiple owners", caption.$ref);
      captionOwners.set(caption.$ref, owner.self_ref);
    }
  }
  function table(ref, item) {
    const { num_rows: height, num_cols: width, table_cells: cells } = item.data ?? {};
    if (!Number.isInteger(height) || !Number.isInteger(width) || height < 1 || width < 1 || !Array.isArray(cells)) refuse("Invalid table dimensions", ref);
    if (height > limits.tableRows || width > limits.tableColumns) refuse(`Table limit exceeded (${limits.tableRows} rows, ${limits.tableColumns} columns)`, ref);
    const rows = Array.from({ length: height }, () => Array(width).fill("")), occupied = new Set();
    const headers = new Set();
    for (const [index, cell] of cells.entries()) {
      const { start_row_offset_idx: r0, end_row_offset_idx: r1, start_col_offset_idx: c0, end_col_offset_idx: c1 } = cell;
      if (![r0, r1, c0, c1].every(Number.isInteger) || r0 < 0 || c0 < 0 || r1 <= r0 || c1 <= c0 || r1 > height || c1 > width ||
          (cell.row_span !== undefined && cell.row_span !== r1 - r0) || (cell.col_span !== undefined && cell.col_span !== c1 - c0) || typeof cell.text !== "string") refuse("Invalid table cell coordinates/span/text", ref);
      const positions = [];
      for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
        const position = r * width + c;
        if (occupied.has(position)) refuse("Overlapping table cells", ref);
        occupied.add(position); rows[r][c] = cell.text; positions.push({ row: r, column: c });
        if (cell.column_header) headers.add(r);
      }
      record(ref).cells.push({ index, positions });
      if (positions.length > 1) note(ref, "merged-cell", "Cell text repeated in covered positions", { cellIndex: index });
      if (cell.row_header || cell.row_section) note(ref, "table-role", "Row header/section represented as ordinary cells", { cellIndex: index });
    }
    if (headers.size > 1) note(ref, "multi-row-header", "Only the first row is a native header; later header rows retain their text as body cells");
    if (!headers.has(0)) note(ref, "table-role", "First source row used as native header");
    emit(ref, { kind: "table", rows });
  }
  let pendingList;
  function visit(ref, listDepth = 0, excluded = false) {
    const item = resolve(ref), entry = record(ref);
    if (visited.has(ref)) refuse("Duplicate or cyclic reading reference", ref);
    visited.add(ref);
    const furniture = excluded || isFurniture(item);
    if (furniture) {
      entry.status = "furniture"; pendingList = undefined;
      for (const child of item.children ?? []) visit(child.$ref, listDepth, true);
      for (const caption of item.captions ?? []) record(caption.$ref).status = "furniture";
      return;
    }
    const captions = (item.captions ?? []).map(caption => caption.$ref).filter(key => {
      if (!isFurniture(resolve(key))) return true;
      record(key).status = "furniture";
      return false;
    });
    const captionText = captions.map(key => {
      const value = resolve(key);
      record(key);
      if (typeof value.text !== "string") refuse("Invalid caption text", key);
      return value.text;
    }).filter(Boolean).join(" ");
    const isGroup = ref.startsWith("#/groups/");
    const isList = isGroup && ["list", "ordered_list"].includes(item.label);
    if (isGroup) {
      pendingList = undefined;
      if (!["list", "ordered_list", "section", "chapter", "unspecified"].includes(item.label)) note(ref, "unsupported", "Unsupported group; children retained in reading order");
      for (const child of item.children ?? []) visit(child.$ref, listDepth + (isList ? 1 : 0));
      entry.status = "container";
      pendingList = undefined;
      return;
    }
    if (captionOwners.has(ref)) { pendingList = undefined; return; }
    if (item.label === "list_item") {
      if (typeof item.text !== "string" || !item.text.trim()) refuse("Empty or invalid list item", ref);
      const ordered = item.enumerated === true;
      const marker = String(item.marker ?? ""), number = /^(\d+)[.)]?$/.exec(marker)?.[1];
      const start = number ? Number(number) : 1;
      const consecutive = pendingList && pendingList.ordered === ordered && (!ordered || start === pendingList.next);
      if (!consecutive || pendingList.block.items.length === 100) {
        const block = { kind: "list", ordered, ...(ordered ? { start } : {}), items: [item.text] };
        const link = emit(ref, block);
        pendingList = { block, ordered, next: start + 1, link };
      } else {
        pendingList.block.items.push(item.text); pendingList.next++;
        entry.status = "converted"; entry.links.push(pendingList.link);
      }
      if (ordered && !number) note(ref, "list-marker", "Source marker unavailable as a numeric start; automatic numbering used");
      if (listDepth > 1) note(ref, "nested-list", "Nested item flattened");
    } else {
      pendingList = undefined;
      if (ref.startsWith("#/tables/")) {
        table(ref, item);
        if (captionText) emit(ref, { kind: "paragraph", text: captionText }, [ref, ...captions]);
      } else if (ref.startsWith("#/pictures/")) {
        emit(ref, { kind: "figure", imageUrl: "", imageAlt: "", caption: captionText }, [ref, ...captions]);
        note(ref, "picture-image", "Figure image omitted; archived ImageRef retained");
      } else if (typeof item.text === "string" && item.text.trim()) {
        const text = item.text;
        if (item.label === "title") emit(ref, { kind: "heading", level: 1, text });
        else if (item.label === "section_header" && Number.isInteger(item.level) && item.level >= 1 && item.level <= 6) emit(ref, { kind: "heading", level: item.level, text });
        else if (item.label === "code") emit(ref, { kind: "code", language: item.code_language === "unknown" ? "" : item.code_language ?? "", code: text });
        else if (item.label === "formula") emit(ref, { kind: "equation", latex: text });
        else {
          emit(ref, { kind: "paragraph", text });
          if (!["text", "paragraph", "caption", "footnote"].includes(item.label)) note(ref, "unsupported", "Unsupported text role retained as paragraph");
          if (item.label === "footnote") note(ref, "unsupported", "Standalone footnote retained without an inferred call site");
        }
        if (item.formatting || item.hyperlink) note(ref, "unsupported", "Inline formatting/link semantics omitted; literal text retained");
      } else note(ref, "unsupported", "Item has no supported content");
    }
    for (const child of item.children ?? []) visit(child.$ref, listDepth);
  }
  for (const child of doc.body.children) visit(child.$ref);
  // Furniture is independent of tree placement. Inventory orphaned content too.
  for (const kind of ["texts", "tables", "pictures", "groups", "key_value_items", "form_items"]) for (const [index, item] of (doc[kind] ?? []).entries()) {
    const ref = `#/${kind}/${index}`;
    if (item.self_ref !== ref) refuse("Invalid self_ref", ref);
    if (records.has(ref)) {
      if (records.get(ref).status === "omitted" && captionOwners.has(ref)) note(ref, "unsupported", "Caption has no output block");
      continue;
    }
    const entry = record(ref);
    if (isFurniture(item)) entry.status = "furniture";
    else note(ref, "unsupported", "Unreachable source item omitted");
  }
  const input = { inputs };
  if (Buffer.byteLength(JSON.stringify(input)) > limits.bytes) refuse(`Authoring input byte limit exceeded (${limits.bytes})`);
  let authored;
  try { authored = await authorDocument(input); }
  catch (error) { refuse(`SDK authoring refused document (${error.code ?? "invalid-input"}); limits: ${limits.bytes} bytes, ${limits.string} characters/string`); }
  const targetsByKey = new Map(authored.inputs.map(input => [input.key, input.targets]));
  const items = [...records.values()].map(({ links, cells, ...item }) => {
    const targets = [...new Map(links.map(link => {
      const target = targetsByKey.get(link.key)[link.index];
      return [JSON.stringify(target.path), target];
    })).values()];
    // Table captions have a separate paragraph target, never a cell target.
    return { ...item, targets, ...(cells.length ? { cells: cells.map(cell => ({ ...cell, targets: targets.slice(0, 1) })) } : {}) };
  });
  const count = kind => losses.filter(loss => loss.kind === kind).length;
  const summary = [["병합 칸 반복", count("merged-cell")], ["다단 헤더 계층 소실", count("multi-row-header")],
    ["중첩 목록 평탄화", count("nested-list")], ["그림 이미지 미포함", count("picture-image")], ["미지원", count("unsupported")],
    ["표 셀 역할 소실", count("table-role")], ["목록 표식 미보존", count("list-marker")]]
    .filter(([, value]) => value > 0).map(([label, value]) => `${label} ${value}`).join(" · ");
  return { source: authored.source, report: { sourceHash, documentRevision: authored.documentRevision, documentHash: authored.documentHash, items, losses, summary } };
}
