// Plugin-owned Docling meaning. The source object is never modified.
export function reviewDocument(doc, patches) {
  if (doc?.schema_name !== "DoclingDocument" || !Array.isArray(doc.body?.children) || !Array.isArray(patches)) throw new Error("Invalid review input");
  const nodes = new Map(), order = [], parents = new Map();
  function visit(ref, parent) {
    const key = ref?.$ref, match = /^#\/(texts|groups|tables|pictures)\/(\d+)$/.exec(key ?? "");
    if (!match || nodes.has(key)) throw new Error("Invalid, repeated or cyclic Docling reference");
    const item = doc[match[1]]?.[Number(match[2])];
    if (!item || item.self_ref !== key) throw new Error("Docling self_ref mismatch");
    nodes.set(key, { item, kind: match[1] }); order.push(key); parents.set(key, parent);
    for (const child of item.children ?? []) visit(child, key);
  }
  for (const ref of doc.body.children) visit(ref, null);
  const edits = new Map(order.map(key => [key, { excluded: false, cells: new Map() }]));
  const string = text => typeof text === "string" && text.length <= 16384 && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);
  function exclude(key, value) {
    edits.get(key).excluded = value;
    for (const child of nodes.get(key).item.children ?? []) exclude(child.$ref, value);
  }
  for (const patch of patches) {
    const node = nodes.get(patch?.self_ref), edit = edits.get(patch?.self_ref);
    if (!node || !patch || typeof patch !== "object") throw new Error("Unknown review target");
    const fields = { text: ["type", "self_ref", "text"], kind: ["type", "self_ref", "kind", ...(patch.kind === "heading" ? ["level"] : [])], exclude: ["type", "self_ref", "excluded"], cell: ["type", "self_ref", "cell", "text"] }[patch.type];
    if (!fields || Object.keys(patch).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(patch, key))) throw new Error("Invalid patch fields");
    switch (patch.type) {
      case "text":
        if (node.kind !== "texts" || !string(patch.text)) throw new Error("Expected text item and Unicode text");
        edit.text = patch.text; break;
      case "kind":
        if (node.kind !== "texts" || !["paragraph", "heading"].includes(patch.kind) || patch.kind === "heading" && (!Number.isInteger(patch.level) || patch.level < 1 || patch.level > 6)) throw new Error("Expected paragraph or heading 1–6");
        edit.kind = patch.kind; edit.level = patch.level; break;
      case "exclude":
        if (typeof patch.excluded !== "boolean") throw new Error("Expected exclusion flag");
        // Group exclusion is applied to descendants at this point in the ordered ledger.
        exclude(patch.self_ref, patch.excluded); break;
      case "cell":
        if (node.kind !== "tables" || !Number.isInteger(patch.cell) || patch.cell < 0 || !node.item.data?.table_cells?.[patch.cell] || !string(patch.text)) throw new Error("Expected original table_cells index");
        edit.cells.set(patch.cell, patch.text); break;
    }
  }
  const inputs = [], items = [];
  for (const key of order) {
    const { item, kind } = nodes.get(key), edit = edits.get(key), blocks = [];
    const text = edit.text ?? item.text;
    const heading = edit.kind ? edit.kind === "heading" : item.label === "section_header" && Number.isInteger(item.level) && item.level >= 1 && item.level <= 6;
    if (!edit.excluded && typeof text === "string" && text) blocks.push(heading ? { kind: "heading", level: edit.level ?? item.level, text } : { kind: "paragraph", text });
    if (!edit.excluded && kind === "tables") {
      const text = (item.data?.table_cells ?? []).map((cell, i) => edit.cells.get(i) ?? cell.text ?? "").join(" | ");
      if (text) blocks.push({ kind: "paragraph", text });
    }
    inputs.push({ key, blocks });
    items.push({ self_ref: key, kind, parent: parents.get(key), excluded: edit.excluded,
      pages: [...new Set((item.prov ?? []).map(p => p.page_no))],
      ...(typeof text === "string" ? { text, block: heading ? "heading" : "paragraph", ...(heading ? { level: edit.level ?? item.level } : {}) } : {}),
      ...(kind === "tables" ? { cells: (item.data?.table_cells ?? []).map((cell, i) => ({ cell: i, text: edit.cells.get(i) ?? cell.text ?? "" })) } : {}),
    });
  }
  return { input: { inputs: [{ key: "pdf", blocks: inputs.flatMap(input => input.blocks) }] }, items };
}
