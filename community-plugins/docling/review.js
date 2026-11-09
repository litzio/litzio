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
  const doc = structuredClone(original), nodes = new Map();
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
