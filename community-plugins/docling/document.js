import { authorDocument, DOCUMENT_AUTHORING_LIMITS as limits } from "@litzio/plugin-sdk";

// This stage deliberately accepts no edits yet. Future review replays against a copy,
// never mutating the archived JSON or assigning persistent identity to output paths.
function applyCorrections(original) {
  return structuredClone(original);
}

function refuse(reason, ref) {
  throw Object.assign(new Error(reason), { conversionReason: reason, ...(ref ? { sourceRef: ref } : {}) });
}

/** Source-only caption convention. Never infer roman, alphabetic or partial numbers. */
export function readCaptionNumber(caption, kind) {
  const failed = reason => ({ caption, reason });
  const prefix = /^\s*(Figure|Fig\.?|Table|그림|표)\s+([\s\S]*)$/i.exec(caption);
  if (!prefix) return failed("Caption number not recognized");
  const actual = /^(?:Table|표)$/i.test(prefix[1]) ? "table" : "figure";
  if (actual !== kind) return failed("Caption kind does not match source item");
  // Extract the complete numeric run before checking its boundary: a suffix on 2.1a
  // must not backtrack into a valid-looking number 2 and caption '1a'.
  const number = /^[0-9]+(?:[.-][0-9]+)*/.exec(prefix[2])?.[0];
  if (!number) return failed("Caption number is not an Arabic numeric string");
  const rest = prefix[2].slice(number.length);
  if (/^\s*(?:[-/]\s*[0-9]|\.\s*[0-9]|[:.]{2})/.test(rest)) return failed("Ambiguous caption number separator");
  if (rest && !/^(?:\s|:|\.(?:\s|$))/.test(rest)) return failed("Ambiguous caption number boundary");
  return { enumerator: number, caption: rest.replace(/^\s*[:.]?\s*/, "") };
}

/** Interpret Docling only here; the SDK owns document semantics and serialization. */
export async function convertDocument(original, sourceHash) {
  const doc = applyCorrections(original);
  if (doc?.schema_name !== "DoclingDocument" || !Array.isArray(doc.body?.children)) refuse("Invalid DoclingDocument");
  const records = new Map(), inputs = [], images = [], losses = [], visited = new Set(), captionOwners = new Map();
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
  const captionNumbers = new Map(), usedNumbers = new Map();
  for (const [collection, kind] of [[doc.pictures ?? [], "figure"], [doc.tables ?? [], "table"]]) for (const owner of collection) {
    if (isFurniture(owner)) continue;
    const captions = (owner.captions ?? []).map(c => resolve(c.$ref)).filter(c => !isFurniture(c));
    const caption = captions.map(c => c.text).filter(Boolean).join(" ");
    const value = readCaptionNumber(caption, kind);
    if (captions.slice(1).some(c => /^\s*(?:Figure|Fig\.?|Table|그림|표)\s/i.test(c.text))) {
      captionNumbers.set(owner.self_ref, { caption, reason: "Multiple numbered captions are ambiguous" }); continue;
    }
    captionNumbers.set(owner.self_ref, value);
    if (value.enumerator !== undefined) {
      const key = kind + ":" + value.enumerator;
      usedNumbers.set(key, (usedNumbers.get(key) ?? 0) + 1);
    }
  }
  function captionNumber(ref, kind, caption) {
    const value = captionNumbers.get(ref) ?? { caption, reason: "Caption number not recognized" };
    if (value.enumerator !== undefined && usedNumbers.get(kind + ":" + value.enumerator) === 1) return value;
    note(ref, "caption-number", value.reason ?? "Duplicate source number for this kind");
    return { caption, enumerated: false };
  }
  function table(ref, item, numbering, contributors) {
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
    emit(ref, { kind: "table", rows, ...numbering }, contributors);
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
        const number = captionNumber(ref, "table", captionText);
        const numbering = number.enumerator === undefined ? { enumerated: false } : { enumerator: number.enumerator };
        table(ref, item, numbering, [ref, ...captions]);
        if (number.caption) emit(ref, { kind: "paragraph", text: number.caption }, [ref, ...captions]);
      } else if (ref.startsWith("#/pictures/")) {
        const number = captionNumber(ref, "figure", captionText);
        const image = item.image, match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image?.uri ?? "");
        let imageInput = { imageUrl: "" };
        if (match && match[1] === image.mimetype && Buffer.from(match[2], "base64").toString("base64") === match[2]) {
          images.push({ key: ref, mime: match[1], base64: match[2] });
          imageInput = { imageAsset: ref };
        } else note(ref, "picture-image", "Figure ImageRef unavailable; original archived data retained");
        emit(ref, { kind: "figure", ...imageInput, imageAlt: "", caption: number.caption,
          ...(number.enumerator === undefined ? { enumerated: false } : { enumerator: number.enumerator }) }, [ref, ...captions]);
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
  // The SDK validates semantics and establishes input/block positions. Image paths here
  // are layout-only bindings; only the Host can publish final paths and targets.
  try { authored = await authorDocument(input, Object.fromEntries(images.map(image => [image.key, "./pending-image.png"]))); }
  catch (error) { refuse(`SDK authoring refused document (${error.code ?? "invalid-input"}); limits: ${limits.bytes} bytes, ${limits.string} characters/string`); }
  function makeReport(final) {
    const targetsByKey = new Map(final.inputs.map(input => [input.key, input.targets]));
    const items = [...records.values()].map(({ links, cells, ...item }) => {
      const targets = [...new Map(links.map(link => {
        const target = targetsByKey.get(link.key)[link.index];
        return [JSON.stringify(target.path), target];
      })).values()];
      // Caption number and text may contribute to the table block and a following paragraph.
      return { ...item, targets, ...(cells.length ? { cells: cells.map(cell => ({ ...cell, targets: targets.slice(0, 1) })) } : {}) };
    });
    const count = kind => losses.filter(loss => loss.kind === kind).length;
    const summary = [["병합 칸 반복", count("merged-cell")], ["다단 헤더 계층 소실", count("multi-row-header")],
      ["중첩 목록 평탄화", count("nested-list")], ["그림 이미지 미포함", count("picture-image")], ["미지원", count("unsupported")],
      ["표 셀 역할 소실", count("table-role")], ["목록 표식 미보존", count("list-marker")], ["캡션 번호 미보존", count("caption-number")]]
      .filter(([, value]) => value > 0).map(([label, value]) => `${label} ${value}`).join(" · ");
    return { sourceHash, documentRevision: final.documentRevision, documentHash: final.documentHash, items, losses, summary };
  }
  return { source: authored.source, document: { authoring: input, images }, report: makeReport(authored),
    bindReport(result) {
      if (!Array.isArray(result?.inputs) || result.inputs.length !== authored.inputs.length) refuse("Final Host inputs required");
      for (const [index, value] of result.inputs.entries()) {
        const expected = authored.inputs[index];
        if (value.key !== expected.key || !Array.isArray(value.targets) || value.targets.length !== expected.targets.length || value.targets.some((target, i) =>
          JSON.stringify(target.path) !== JSON.stringify(expected.targets[i].path) || target.documentRevision !== result.revision || target.documentHash !== result.revision)) refuse("Final Host targets do not match authoring inputs");
      }
      return makeReport({ inputs: result.inputs, documentRevision: result.revision, documentHash: result.revision });
    },
  };
}
