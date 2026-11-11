import { getEditableDocument, inlineContentText, parse } from "@litzio/core";
import { z } from "zod";
import { textRevision } from "@litzio/file-commit";

const path = z.array(z.number().int().nonnegative()).min(1);
const reason = z.enum(["furniture", "picture", "formula"]);
/** Converter-neutral, TOPLEFT PDF points. IDs/groups are opaque to the common review layer. */
export const evidenceMaterialSchema = z.strictObject({
  pdfBase64: z.string().max(90 * 1024 * 1024),
  regions: z.array(z.strictObject({ id: z.string(), page: z.number().int().positive(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]), group: z.string(),
    exclude: reason.optional() })).max(100000),
  bindings: z.array(z.strictObject({ path, group: z.string(), page: z.number().int().positive().optional(), listItem: z.number().int().nonnegative().optional(), exclude: reason.optional(), cellKey: z.string().optional() })).max(100000),
});
type Material = z.infer<typeof evidenceMaterialSchema>;
type Token = { text: string; page?: number; bbox?: number[]; path?: number[]; group: string; line?: string };
type Gap = { missing: Token[]; unsupported: Token[]; page?: number };
const rawWords = (text: string) => [...text].map(c => /[\p{N}\p{S}µΩKÅ\u2070-\u209f]/u.test(c) ? c : c.normalize("NFKC")).join("").replace(/\u00ad/g, "").match(/[\p{L}\p{M}]+|[0-9]+(?:[.,][0-9]+)*|[.,][0-9]+|!=|<=|>=|==|[^\s]/gu) ?? [];
export function evidenceWords(text: string) {
  const tokens = rawWords(text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")).filter(t => !/^[.,;:!?"'()[\]{}…•]$/.test(t));
  return tokens.filter((t, i) => !(t === "-" && /^\p{L}+$/u.test(tokens[i - 1] ?? "") && /^\p{L}+$/u.test(tokens[i + 1] ?? "")));
}

/** Bounded full LCS, as in the approved spike; no incremental matching/index. */
function ordered(pdf: Token[], doc: Token[]): Gap[] {
  const n = pdf.length, m = doc.length, stride = m + 1;
  if ((n + 1) * stride > 140_000_000 || Math.min(n, m) > 65534) throw new Error("Evidence comparison limit exceeded");
  const matrix = new Uint16Array((n + 1) * stride);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    matrix[i * stride + j] = pdf[i].text === doc[j].text ? matrix[(i + 1) * stride + j + 1] + 1 : Math.max(matrix[(i + 1) * stride + j], matrix[i * stride + j + 1]);
  const gaps: Gap[] = []; let i = 0, j = 0, gap: Gap | undefined, page = pdf[0]?.page;
  while (i < n || j < m) {
    if (i < n && j < m && pdf[i].text === doc[j].text) { page = pdf[i].page; i++; j++; gap = undefined; continue; }
    if (!gap) { gap = { missing: [], unsupported: [], page: pdf[i]?.page ?? page }; gaps.push(gap); }
    if (i < n && (j === m || matrix[(i + 1) * stride + j] >= matrix[i * stride + j + 1])) gap.missing.push(pdf[i++]);
    else gap.unsupported.push(doc[j++]);
  }
  return gaps.flatMap(g => {
    const pages = [...new Set(g.missing.map(t => t.page))]; if (!pages.length) pages.push(g.page);
    return pages.map((page, i) => ({ page, missing: g.missing.filter(t => t.page === page), unsupported: i ? [] : g.unsupported }));
  });
}
function unordered(pdf: Token[], doc: Token[]): Gap[] {
  const remaining = new Map<string, Token[]>(), used = new Set<Token>(), extras = new Set<Token>();
  for (const t of pdf) { if (!remaining.has(t.text)) remaining.set(t.text, []); remaining.get(t.text)!.push(t); }
  for (const t of doc) { const p = remaining.get(t.text)?.shift(); if (p) used.add(p); else extras.add(t); }
  const gaps: Gap[] = [];
  for (const [tokens, missing] of [[pdf, true], [doc, false]] as const) {
    let gap: Gap | undefined;
    for (const t of tokens) {
      if (missing ? used.has(t) : !extras.has(t)) { gap = undefined; continue; }
      if (!gap || gap.page !== t.page || !missing && JSON.stringify(gap.unsupported[0]?.path) !== JSON.stringify(t.path)) {
        gap = { page: t.page, missing: [], unsupported: [] }; gaps.push(gap);
      }
      (missing ? gap.missing : gap.unsupported).push(t);
    }
  }
  return gaps;
}

export async function inspectEvidence(source: string, material: Material, selectedPages?: number[]) {
  const { getDocument, Util } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Explicit worker import also works in the self-contained CLI/daemon bundle.
  // @ts-expect-error PDF.js ships no declaration for its worker entry.
  (globalThis as any).pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const bytes = Buffer.from(material.pdfBase64, "base64");
  if (bytes.toString("base64") !== material.pdfBase64) throw new Error("Invalid evidence PDF encoding");
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  type Item = { text: string; x: number; y: number; width: number; height: number };
  type Line = { page: number; y: number; height: number; id: string; items: Item[]; text: string };
  const lines: Line[] = [], pages: number[] = [], imagePages: number[] = [];
  try {
    const pdf = await task.promise;
    if (selectedPages?.some(p => p > pdf.numPages)) throw new Error("Unknown evidence page");
    for (let page = 1; page <= pdf.numPages; page++) {
      if (selectedPages && !selectedPages.includes(page)) continue;
      pages.push(page);
      const p = await pdf.getPage(page), view = p.getViewport({ scale: 1 }), content = await p.getTextContent();
      const items: Item[] = content.items.flatMap(item => {
        if (!("str" in item) || !item.str.trim()) return [];
        const t = Util.transform(view.transform, item.transform);
        return [{ text: item.str, x: t[4], y: t[5], width: item.width, height: item.height }];
      }).sort((a, b) => a.y - b.y || a.x - b.x);
      if (!items.length) imagePages.push(page);
      let line: Line | undefined;
      for (const item of items) {
        if (!line || Math.abs(line.y - item.y) > 2) { line = { page, y: item.y, height: view.height, id: `${page}:${lines.length}`, items: [], text: "" }; lines.push(line); }
        line.items.push(item);
      }
    }
  } finally { await task.destroy(); }
  const edge = (l: Line) => l.y < l.height * .08 || l.y > l.height * .92;
  const repeats = new Map<string, Set<number>>();
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x); l.text = l.items.map(i => i.text).join(" ");
    if (edge(l)) { const key = rawWords(l.text).join(" "); if (!repeats.has(key)) repeats.set(key, new Set()); repeats.get(key)!.add(l.page); }
  }
  const outside = { furniture: 0, "repeated-edge": 0, picture: 0, formula: 0 };
  let total = 0; const evidence: Token[] = [];
  const regions = material.regions.filter(r => pages.includes(r.page));
  for (const l of lines) for (const item of l.items) {
    const x = item.x + item.width / 2, y = item.y - item.height / 2;
    const region = regions.find(r => r.page === l.page && x >= r.bbox[0] - 1 && x <= r.bbox[2] + 1 && y >= r.bbox[1] - 1 && y <= r.bbox[3] + 1);
    const repeated = edge(l) && (/^\s*\d+\s*$/.test(l.text) || (repeats.get(rawWords(l.text).join(" "))?.size ?? 0) >= 3);
    const excluded = region?.exclude ?? (repeated ? "repeated-edge" : undefined), raw = rawWords(item.text);
    total += raw.length;
    if (excluded) { outside[excluded] += raw.length; continue; }
    evidence.push(...evidenceWords(item.text).map(text => ({ text, page: l.page, line: l.id, group: region?.group ?? "body", bbox: [item.x, item.y - item.height, item.x + item.width, item.y] })));
  }
  for (let i = 1; i + 1 < evidence.length; i++) {
    const a = evidence[i - 1], h = evidence[i], b = evidence[i + 1];
    if (h.text === "-" && /^\p{L}+$/u.test(a.text) && /^\p{Ll}/u.test(b.text) && a.line !== b.line && a.page === b.page && a.group === b.group && a.group === h.group) { a.text += b.text; evidence.splice(i, 2); i--; }
  }
  const doc: Token[] = [], seenCells = new Set<string>(); let outsideUnits = 0;
  const add = (p: readonly number[], text: string, kind?: string, listItem?: number) => {
    if (!text) return;
    const binding = material.bindings.find(b => b.listItem === listItem && JSON.stringify(b.path) === JSON.stringify(p)) ?? material.bindings.find(b => b.listItem === undefined && b.path.length === 1 && b.path[0] === p[0]);
    const region = regions.find(r => r.group === binding?.group);
    if (selectedPages && !selectedPages.includes(binding?.page ?? region?.page ?? 0)) return;
    if (imagePages.length === pages.length || imagePages.includes(binding?.page ?? region?.page ?? 0)) return;
    if (binding?.exclude || kind === "equation") { outsideUnits++; return; }
    if (binding?.cellKey) { if (seenCells.has(binding.cellKey)) return; seenCells.add(binding.cellKey); }
    doc.push(...evidenceWords(text).map(text => ({ text, path: [...p], page: binding?.page ?? region?.page, group: binding?.group ?? "body" })));
  };
  for (const b of getEditableDocument(parse(source)).blocks) {
    if (b.block === "table") {
      if (b.enumerator) add(b.path, `Table ${b.enumerator}`);
      for (const row of b.rows) for (const c of row.cells) add(c.path, c.text);
      if (b.caption) add(b.path, inlineContentText(b.caption));
    } else if (b.block === "figure") {
      if (b.enumerator) add(b.path, `Figure ${b.enumerator}`);
      add(b.path, b.caption.text);
    } else if (b.block === "list") b.items.forEach((item, i) => add(b.path, `${b.ordered ? `${(b.start ?? 1) + i}. ` : ""}${inlineContentText(item.content)}`, "list", i));
    else add(b.path, "text" in b ? b.text : b.block === "equation" ? b.latex : b.block === "code" ? b.code : "", b.block);
  }
  const gaps: Gap[] = [];
  for (const group of new Set([...evidence, ...doc].map(t => t.group))) gaps.push(...(group === "body" ? ordered : unordered)(evidence.filter(t => t.group === group), doc.filter(t => t.group === group)));
  const candidates = gaps.map((g, i) => ({ id: i + 1, page: g.page ?? null,
    priority: [...g.missing, ...g.unsupported].some(t => /[\p{N}\p{S}%/µμΩ+\-−±]/u.test(t.text) || /^(?:[munpkMGT]?A|[munpkMGT]?V|[munpkMGT]?g|kg|mg|Hz|kHz|MHz|s|ms|m|h|mm|cm|nm|mol|Pa|W|L|K|°C)$/u.test(t.text)) ? "numeric-unit" : "text",
    missing: g.missing, unsupported: g.unsupported,
  })).sort((a, b) => Number(b.priority === "numeric-unit") - Number(a.priority === "numeric-unit") || a.id - b.id);
  return { status: imagePages.length === pages.length ? "unavailable-image-pdf" : "inspected", documentRevision: textRevision(source), pages, imagePages,
    coverage: { rawPdfTokens: total, inScopeRawPdfTokens: total - Object.values(outside).reduce((a,b) => a+b, 0), outsideRawPdfTokens: Object.values(outside).reduce((a,b) => a+b, 0), outside, outsideRegions: regions.filter(r => r.exclude), outsideDocumentUnits: outsideUnits }, candidates };
}

/** PDF.js owns rasterization/cropping; no converter or new image engine. */
export async function renderEvidenceImage(material: Material, pageNo: number, bbox: number[]) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // @ts-expect-error PDF.js ships no worker declaration.
  (globalThis as any).pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const task = getDocument({ data: new Uint8Array(Buffer.from(material.pdfBase64, "base64")), useSystemFonts: true });
  try {
    const pdf = await task.promise, page = await pdf.getPage(pageNo);
    const view = page.getViewport({ scale: 1 });
    const [left, top, right, bottom] = bbox;
    if (left < 0 || top < 0 || right > view.width + 1 || bottom > view.height + 1 || right <= left || bottom <= top) throw new Error("Invalid image region");
    const width = Math.ceil((right-left)*2), height = Math.ceil((bottom-top)*2);
    if (width * height > 16_000_000) throw new Error("Image pixel limit exceeded");
    const factory = pdf.canvasFactory as {create(w:number,h:number):any;destroy(canvas:any):void};
    const canvas = factory.create(width, height);
    try {
      await page.render({ canvasContext: canvas.context, canvas: canvas.canvas, viewport: page.getViewport({scale:2,offsetX:-left*2,offsetY:-top*2}) }).promise;
      const bytes: Buffer = canvas.canvas.toBuffer("image/png");
      return { mime: "image/png", base64: bytes.toString("base64"), width, height };
    } finally { factory.destroy(canvas); }
  } finally { await task.destroy(); }
}
