import { convertDoclingDocument, type Conversion, type ConversionOptions } from "./convert.ts";
import { collections, readSource, type SourceDocument, type SourceItem } from "./source.ts";
import { parseJsonPreservingIntegers } from "./bundle.ts";
import { readDoclingMap, sha256 } from "../shared/map.ts";

type Approval = { id: string; self_ref: string; reason: string; aiEvidence?: string; approvedAt: string };
export type DoclingCorrection = Approval & (
  | { operation: "heading"; value: { level: number | null } }
  | { operation: "merge-paragraphs"; value: { next: string } }
  | { operation: "furniture"; value: { label: "text" | "page_header" | "page_footer" } }
);
export type DoclingCorrections = {
  format: "litzio-docling-corrections"; version: 1;
  source: { file: string; sha256: string }; entries: DoclingCorrection[];
};
export function emptyCorrections(file: string, input: string): DoclingCorrections {
  return { format: "litzio-docling-corrections", version: 1, source: { file, sha256: sha256(input) }, entries: [] };
}

/** The exact approval replay/representation checks, without filesystem writes. */
export function checkDoclingCorrection(input: string, ledger: DoclingCorrections, entry: DoclingCorrection, options: ConversionOptions = {}): void {
  convertWithDoclingCorrections(input, { ...ledger, entries: [...ledger.entries, entry] }, options);
}

const object = (v: any): boolean => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: any, allowed: string[]): boolean => object(v) && Object.keys(v).every(k => allowed.includes(k));
const ref = (v: unknown): v is string => typeof v === "string" && /^#\/texts\/(0|[1-9]\d*)$/u.test(v);

/** A strict, versioned, human-readable approval ledger. No AI execution. */
export function readDoclingCorrections(input: string): DoclingCorrections {
  const record = JSON.parse(input);
  if (!keys(record, ["format", "version", "source", "entries"]) || record.format !== "litzio-docling-corrections" || record.version !== 1 ||
      !keys(record.source, ["file", "sha256"]) || typeof record.source.file !== "string" || !record.source.file.trim() ||
      typeof record.source.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(record.source.sha256) || !Array.isArray(record.entries)) throw new Error("Invalid Docling corrections format/version/source");
  const ids = new Set<string>();
  for (const [index, e] of record.entries.entries()) {
    const fail = () => { throw new Error(`Invalid correction at index ${index}${typeof e?.id === "string" ? ` (${e.id})` : ""}`); };
    if (!keys(e, ["id", "self_ref", "operation", "value", "reason", "aiEvidence", "approvedAt"]) ||
        typeof e.id !== "string" || !e.id.trim() || ids.has(e.id) || !ref(e.self_ref) ||
        typeof e.reason !== "string" || !e.reason.trim() || (e.aiEvidence !== undefined && typeof e.aiEvidence !== "string") ||
        typeof e.approvedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/u.test(e.approvedAt) || !Number.isFinite(Date.parse(e.approvedAt))) fail();
    ids.add(e.id);
    if (e.operation === "heading") {
      if (!keys(e.value, ["level"]) || !(e.value.level === null || (Number.isInteger(e.value.level) && e.value.level >= 1 && e.value.level <= 6))) fail();
    } else if (e.operation === "merge-paragraphs") {
      if (!keys(e.value, ["next"]) || !ref(e.value.next) || e.value.next === e.self_ref) fail();
    } else if (e.operation === "furniture") {
      if (!keys(e.value, ["label"]) || !["text", "page_header", "page_footer"].includes(e.value.label)) fail();
    } else fail();
  }
  return record;
}

/** Replay on a private copy, retaining original refs/regions in the public map. */
export function convertWithDoclingCorrections(input: string, ledger: DoclingCorrections, options: ConversionOptions = {}): Conversion {
  readDoclingCorrections(JSON.stringify(ledger));
  if (sha256(input) !== ledger.source.sha256) throw new Error("Docling correction source SHA-256 mismatch");
  const original = readSource(input);
  // Preserve uint64 and all fields outside the explicitly corrected structure.
  const copy = parseJsonPreservingIntegers(input.replace(/^\uFEFF/u, "")) as SourceDocument;
  const nodes = new Map([copy.body, copy.furniture, ...collections.flatMap(k => copy[k] ?? [])].filter((x): x is SourceItem => !!x).map(x => [x.self_ref, x]));
  const aliases = new Map<string, string>(), classified = new Set<string>(), merged = new Set<string>();
  const decoration = (x: SourceItem) => x.content_layer === "furniture" || ["page_header", "page_footer"].includes(x.label);
  const label = (x: SourceItem) => x.label ?? original.nodes.get(x.self_ref)!.label;
  const leaf = (x: SourceItem) => !(x.children?.length || x.captions?.length || x.footnotes?.length || x.references?.length) &&
    ![...nodes.values()].some(n => [...(n.captions ?? []), ...(n.footnotes ?? []), ...(n.references ?? [])].some(r => r.$ref === x.self_ref));
  function order(): string[] {
    const result: string[] = [];
    function visit(x: SourceItem): void {
      if (!decoration(x) && !["unspecified", "section", "chapter"].includes(label(x))) result.push(x.self_ref);
      for (const r of x.children ?? []) visit(nodes.get(r.$ref)!);
    }
    if (copy.body) visit(copy.body);
    // A furniture-root child can explicitly be classified as body content.
    if (copy.furniture) for (const r of copy.furniture.children ?? []) visit(nodes.get(r.$ref)!);
    return result;
  }
  for (const e of ledger.entries) {
    try {
      const x = nodes.get(e.self_ref);
      if (!x) throw new Error(`Target does not exist: ${e.self_ref}`);
      if (aliases.has(e.self_ref) || (e.operation !== "merge-paragraphs" && (classified.has(e.self_ref) || merged.has(e.self_ref)))) throw new Error("Conflicts with an earlier correction");
      if (!leaf(x) || !x.text?.trim()) throw new Error("Expected nonempty, unassociated leaf text");
      if (e.operation === "heading") {
        if (decoration(x) || (x.content_layer ?? "body") !== "body" || !["text", "title", "section_header"].includes(label(x)) || !order().includes(x.self_ref)) throw new Error("Expected reachable body text or heading");
        x.label = e.value.level === null ? "text" : "section_header";
        if (e.value.level === null) delete x.level; else x.level = e.value.level;
      } else if (e.operation === "furniture") {
        if (!["body", "furniture"].includes(x.content_layer ?? "body") || !["text", "title", "section_header", "page_header", "page_footer"].includes(label(x))) throw new Error("Expected body text/heading or page header/footer");
        // Layer and label are independent from reading-tree placement in Docling.
        x.label = e.value.label; x.content_layer = e.value.label === "text" ? "body" : "furniture"; delete x.level;
      } else {
        const y = nodes.get(e.value.next);
        if (!y) throw new Error(`Target does not exist: ${e.value.next}`);
        if (aliases.has(y.self_ref) || merged.has(y.self_ref)) throw new Error("Merge continuation conflicts with an earlier correction");
        const flow = order(), at = flow.indexOf(x.self_ref);
        if (at < 0 || flow[at + 1] !== y.self_ref || [x, y].some(n => label(n) !== "text" || decoration(n) || (n.content_layer ?? "body") !== "body" || !leaf(n) || !n.text?.trim())) throw new Error("Expected consecutive body paragraphs");
        const last = x.prov?.at(-1)?.page_no, first = y.prov?.[0]?.page_no;
        if (last === undefined || first !== last + 1) throw new Error("Paragraphs must cross consecutive pages");
        if (JSON.stringify(x.formatting ?? null) !== JSON.stringify(y.formatting ?? null) || (x.hyperlink ?? null) !== (y.hyperlink ?? null)) throw new Error("Paragraph formatting/hyperlinks differ");
        const parent = y.parent && nodes.get(y.parent.$ref);
        if (!parent?.children?.some(r => r.$ref === y.self_ref)) throw new Error("Continuation has no reading-order owner");
        const offset = [...x.text!].length + 1;
        x.text += " " + y.text;
        x.orig = (x.orig ?? original.nodes.get(x.self_ref)!.text ?? "") + " " + (y.orig ?? y.text);
        x.prov = [...(x.prov ?? []), ...(y.prov ?? []).map(p => ({ ...p, charspan: p.charspan.map(n => n + offset) }))];
        parent.children = parent.children.filter(r => r.$ref !== y.self_ref);
        y.parent = null; // Keep its array slot/self_ref and original fields; do not renumber.
        aliases.set(y.self_ref, x.self_ref);
      }
      if (e.operation === "merge-paragraphs") merged.add(x.self_ref); else classified.add(x.self_ref);
    } catch (cause) { throw new Error(`Correction ${e.id} (${e.self_ref}): ${(cause as Error).message}`, { cause }); }
  }
  const result = convertDoclingDocument(ledger.entries.length ? JSON.stringify(copy) : input, options);
  const converted = new Map(result.map.items.map(x => [x.self_ref, x]));
  for (const e of ledger.entries) {
    const item = converted.get(aliases.get(e.self_ref) ?? e.self_ref)!;
    if (e.operation !== "furniture" || e.value.label === "text") {
      const expected = e.operation === "heading" && e.value.level !== null ? "heading" : "paragraph";
      if (item.status !== "converted" || !item.targets.some(t => t.role === "block" && t.block === expected)) throw new Error(`Correction ${e.id} cannot be represented as ${expected}: ${item.reason ?? "source is owned by another structure"}`);
    }
  }
  result.map.source.sha256 = sha256(input);
  for (const item of result.map.items) {
    const source = original.nodes.get(item.self_ref)!;
    // Source inspection and boxes always describe the untouched original.
    item.label = source.label; item.content_layer = source.content_layer ?? "body"; item.parent = source.parent?.$ref ?? null;
    item.provenance = (source.prov ?? []).map(p => ({ ...structuredClone(p), bbox: { ...p.bbox, coord_origin: p.bbox.coord_origin ?? "TOPLEFT" } }));
    const survivor = aliases.get(item.self_ref);
    if (survivor) {
      const target = converted.get(survivor)!;
      item.status = target.status; item.targets = structuredClone(target.targets);
      if (target.reason) item.reason = target.reason; else delete item.reason;
      item.notes.push(`Approved paragraph merge into ${survivor}; original source region retained.`);
    }
    for (const e of ledger.entries.filter(e => e.self_ref === item.self_ref)) item.notes.push(`Approved correction ${e.id}: ${e.operation}. ${e.reason}`);
  }
  readDoclingMap(JSON.stringify(result.map), result.markdown);
  return result;
}
