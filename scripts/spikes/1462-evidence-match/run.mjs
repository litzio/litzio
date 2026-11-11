// Bounded experiment, not a library. Run from repo root with pnpm exec tsx.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { convertDocument } from '../../../community-plugins/docling/document.js';
import { parse, serialize, getEditableDocument, inlineContentText, removeBlock, moveBlock, updateParagraphInlineContent, updateTableCell, canonicalWriteError } from '../../../packages/core/src/index.ts';

const rootRequire = createRequire(new URL('../../../apps/editor/package.json', import.meta.url));
const pdfjsPath = rootRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs');
const { getDocument } = await import(pathToFileURL(pdfjsPath).href);
const out = 'tmp/evidence-match';
const sha = value => createHash('sha256').update(value).digest('hex');
const protocol = JSON.parse(await readFile(new URL('./protocol.json', import.meta.url), 'utf8'));
const started = performance.now();

function normalize(text) {
  return [...text].map(c => /[\p{N}\p{S}µΩKÅ]/u.test(c) || /[\u2070-\u209f]/u.test(c) ? c : c.normalize('NFKC')).join('')
    .replace(/\u00ad/g, '').replace(/(?<=\p{L})-\n(?=\p{Ll})/gu, '');
}
const words = text => normalize(text).match(/[\p{L}\p{M}]+|[0-9]+(?:[.,][0-9]+)*|[^\s]/gu) ?? [];
assert.deepEqual(words('ﬁne 12.5 µA ≤ ²'), ['fine', '12.5', 'µA', '≤', '²']);
assert.notDeepEqual(words('12.5 mA < 2'), words('12.6 MA ≤ ²'));
assert.deepEqual(words('inter-\nnational'), words('international'));

async function evidence(file, selected) {
  const bytes = await readFile(file), begin = performance.now();
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const pdf = await task.promise, pages = [];
  try {
    for (let page = 1; page <= pdf.numPages; page++) {
      if (selected && !selected.includes(page)) continue;
      const p = await pdf.getPage(page), content = await p.getTextContent();
      const viewport = p.getViewport({ scale: 1 });
      const items = content.items.filter(i => typeof i.str === 'string' && i.str.trim()).map((i, index) => {
        const t = pdfjsTransform(viewport.transform, i.transform);
        return { text: i.str, x: t[4], y: t[5], width: i.width, height: i.height, index };
      });
      // Smallest geometry rule: cluster baselines within 2 pt, then x order.
      // It intentionally does not infer columns, tables, or semantic regions.
      items.sort((a, b) => a.y - b.y || a.x - b.x || a.index - b.index);
      const lines = [];
      for (const item of items) {
        let line = lines.at(-1);
        if (!line || Math.abs(line.y - item.y) > 2) {
          line = { page, id: `${page}:${lines.length}`, y: item.y, height: viewport.height, items: [] };
          lines.push(line);
        }
        line.items.push(item);
      }
      for (const line of lines) {
        line.items.sort((a, b) => a.x - b.x || a.index - b.index);
        line.text = line.items.map(i => i.text).join(' ');
      }
      pages.push({ page, width: viewport.width, height: viewport.height, items, lines });
    }
  } finally { await task.destroy(); }
  // Exact repeated text, never replace numbers with wildcards.
  const edgePages = new Map();
  for (const p of pages) for (const l of p.lines) if (edge(l)) {
    const key = words(l.text).join(' ');
    if (!edgePages.has(key)) edgePages.set(key, new Set());
    edgePages.get(key).add(p.page);
  }
  let id = 0;
  for (const p of pages) for (const [index, l] of p.lines.entries()) {
    l.suppressed = edge(l) && (/^\s*\d+\s*$/.test(l.text) || edgePages.get(words(l.text).join(' '))?.size >= 3);
    l.tokens = words(l.text).map(text => ({ text, page: p.page, line: l.id, id: id++ }));
    const previous = p.lines[index - 1];
    if (previous && /\p{L}-\s*$/u.test(previous.text) && /^\s*\p{Ll}/u.test(l.text) && previous.tokens.at(-1)?.text === '-' && l.tokens.length) {
      previous.tokens.pop();
      previous.tokens.at(-1).text += l.tokens.shift().text;
    }
  }
  const tokens = pages.flatMap(p => p.lines.flatMap(l => l.tokens));
  return { sha256: sha(bytes), pages, tokens, filtered: pages.flatMap(p => p.lines.filter(l => !l.suppressed).flatMap(l => l.tokens)), elapsedMs: performance.now() - begin };
}
function edge(line) { return line.y < line.height * 0.08 || line.y > line.height * 0.92; }
function pdfjsTransform(a, b) {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}

function project(doc) {
  const units = [];
  const add = (block, text, kind = block.block, path = block.path) => { if (text) units.push({ path, kind, text, tokens: words(text) }); };
  for (const b of getEditableDocument(doc).blocks) {
    if (b.block === 'table') {
      if (b.enumerator) add(b, `Table ${b.enumerator}`, 'table-number');
      for (const row of b.rows) for (const c of row.cells) add(b, c.text, 'cell', c.path);
      if (b.caption) add(b, inlineContentText(b.caption), 'caption');
    } else if (b.block === 'figure') {
      if (b.enumerator) add(b, `Figure ${b.enumerator}`, 'figure-number');
      add(b, b.caption.text, 'caption');
    } else if (b.block === 'list') {
      b.items.forEach((item, i) => add(b, `${b.ordered ? `${(b.start ?? 1) + i}. ` : ''}${inlineContentText(item.content)}`, 'list'));
    } else add(b, b.text ?? b.latex ?? b.code ?? '');
  }
  return units.map((unit, index) => ({ ...unit, id: index }));
}

// Full token LCS is deliberately bounded. No scalable alignment engine is added.
function compare(pdf, units) {
  const begin = performance.now();
  const doc = units.flatMap(u => u.tokens.map((text, index) => ({ text, unit: u.id, index })));
  const n = pdf.length, m = doc.length, stride = m + 1;
  if ((n + 1) * stride > 140_000_000 || Math.min(n, m) > 65534) throw new Error('Spike LCS bound exceeded; stop rather than design an alignment engine');
  const matrix = new Uint16Array((n + 1) * stride);
  for (let i = n - 1; i >= 0; i--) {
    const row = i * stride, next = row + stride;
    for (let j = m - 1; j >= 0; j--) matrix[row + j] = pdf[i].text === doc[j].text ? matrix[next + j + 1] + 1 : Math.max(matrix[next + j], matrix[row + j + 1]);
  }
  let i = 0, j = 0, gap, lastPage = pdf[0]?.page;
  const gaps = [], matches = [];
  while (i < n || j < m) {
    if (i < n && j < m && pdf[i].text === doc[j].text) {
      matches.push({ pdf: pdf[i].id, unit: doc[j].unit, token: doc[j].index });
      lastPage = pdf[i].page; gap = undefined; i++; j++; continue;
    }
    if (!gap) { gap = { missing: [], unsupported: [], fallbackPage: pdf[i]?.page ?? lastPage }; gaps.push(gap); }
    if (i < n && (j >= m || matrix[(i + 1) * stride + j] >= matrix[i * stride + j + 1])) gap.missing.push(pdf[i++]);
    else gap.unsupported.push(doc[j++]);
  }
  const alerts = gaps.flatMap(g => {
    const pages = [...new Set(g.missing.map(t => t.page))];
    if (!pages.length) pages.push(g.fallbackPage);
    return pages.map((page, index) => ({ page, missing: g.missing.filter(t => t.page === page), unsupported: index === 0 ? g.unsupported : [] }));
  }).map((a, index) => ({ ...a, id: index + 1, pdfText: a.missing.map(t => t.text).join(' '), docText: a.unsupported.map(t => t.text).join(' ') }));
  return { alerts, matches, pdfTokens: n, docTokens: m, lcs: matrix[0], matrixBytes: matrix.byteLength, elapsedMs: performance.now() - begin };
}

function selected(values) { return [0.2, 0.5, 0.8].map(q => values[Math.floor((values.length - 1) * q)]); }
function mutations(doc, units) {
  const paragraphs = units.filter(u => u.kind === 'paragraph' && u.text.length >= 80);
  const cells = units.filter(u => u.kind === 'cell' && u.text.trim().length >= 4);
  assert(paragraphs.length >= 4 && cells.length >= 3);
  const result = [];
  for (const [kind, candidates] of [['paragraph-delete', paragraphs], ['number-change', paragraphs.filter(u => /[0-9]/.test(u.text))], ['paragraph-order', paragraphs.slice(0, -1)], ['cell-delete', cells]]) {
    assert(candidates.length >= 3);
    for (const [index, target] of selected(candidates).entries()) {
      let variant, changedText, interval;
      if (kind === 'paragraph-delete') variant = removeBlock(doc, target.path[0]);
      if (kind === 'number-change') {
        changedText = target.text.replace(/[0-9]/, d => String((Number(d) + 1) % 10));
        variant = updateParagraphInlineContent(doc, target.path, [{ kind: 'text', text: changedText }]);
      }
      if (kind === 'paragraph-order') {
        const next = paragraphs[paragraphs.indexOf(target) + 1];
        variant = moveBlock(doc, target.path[0], next.path[0]);
        interval = [target.id, next.id];
      }
      if (kind === 'cell-delete') variant = updateTableCell(doc, target.path, '');
      assert.equal(canonicalWriteError(variant), undefined);
      const source = serialize(variant);
      assert.notEqual(source, serialize(doc));
      assert.equal(serialize(parse(source)), source);
      result.push({ kind, case: index + 1, target, changedText, interval, source, units: project(parse(source)) });
    }
  }
  return result;
}

function score(base, run, mutation, pdfTokens) {
  const originalMissing = new Set(base.alerts.flatMap(a => a.missing.map(t => t.id)));
  const newlyMissing = run.alerts.flatMap(a => a.missing).filter(t => !originalMissing.has(t.id));
  const targetEvidence = new Set(base.matches.filter(m => m.unit === mutation.target.id).map(m => m.pdf));
  const hit = newlyMissing.filter(t => targetEvidence.has(t.id));
  const needed = Math.ceil(mutation.target.tokens.length / 2);
  let detected;
  if (mutation.kind === 'number-change') {
    const changed = mutation.units.find(u => u.text === mutation.changedText);
    const oldNumber = mutation.target.tokens.find(t => /[0-9]/.test(t));
    const newNumber = changed.tokens.find(t => /[0-9]/.test(t));
    detected = hit.some(t => t.text === oldNumber) && run.alerts.some(a => a.unsupported.some(t => t.unit === changed.id && t.text === newNumber));
  } else if (mutation.kind === 'paragraph-order') {
    const affected = new Set(base.matches.filter(m => m.unit >= mutation.interval[0] && m.unit <= mutation.interval[1]).map(m => m.pdf));
    const missing = newlyMissing.filter(t => affected.has(t.id));
    // A run must be consecutive on both sides, not merely equal bags of words.
    detected = false;
    for (let i = 0; i + 8 <= missing.length; i++) {
      const ids = missing.slice(i, i + 8).map(t => pdfTokens.findIndex(p => p.id === t.id));
      if (ids.some((id, k) => k && id !== ids[k - 1] + 1)) continue;
      const needle = missing.slice(i, i + 8).map(t => t.text).join('\0');
      for (const a of run.alerts) for (let j = 0; j + 8 <= a.unsupported.length; j++) {
        if (a.unsupported.slice(j, j + 8).map(t => t.text).join('\0') === needle) detected = true;
      }
      if (detected) break;
    }
  } else detected = hit.length >= needed && hit.length >= Math.ceil(targetEvidence.size / 2);
  return { detected, newTargetMissingTokens: hit.length, targetTokens: mutation.target.tokens.length, targetBaselineMatchedTokens: targetEvidence.size, targetBaselineUnmatchedTokens: mutation.target.tokens.length - targetEvidence.size };
}

// Sanity checks of the measured behavior, not additional product tests.
const tinyPdf = text => words(text).map((text, id) => ({ text, id, page: 1, line: '1:0' }));
const tinyDoc = text => [{ id: 0, tokens: words(text) }];
assert.equal(compare(tinyPdf('A 12.5 µA ≤ ²'), tinyDoc('A 12.5 µA ≤ ²')).alerts.length, 0);
for (const text of ['A 12.6 µA ≤ ²', 'A 12.5 mA ≤ ²', 'A 12.5 µA < ²', 'A 12.5 µA ≤ 2']) {
  const run = compare(tinyPdf('A 12.5 µA ≤ ²'), tinyDoc(text));
  assert(run.alerts.some(a => a.missing.length && a.unsupported.length));
}
assert(compare(tinyPdf('Alpha beta.'), tinyDoc('Alpha beta. Alpha beta.')).alerts.some(a => a.unsupported.length));
assert(compare(tinyPdf('Alpha beta.'), tinyDoc('')).alerts.some(a => a.missing.length));

// Reuse only the original bounded comparison and Core projection in the followup.
export { compare, project };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
await mkdir(out, { recursive: true });
const result = { protocol, node: process.version, pdfjs: '5.6.205', cases: [], datasets: [] };
for (const config of [
  { name: 'lsr', pdf: 'community-plugins/docling/sample/lsr-1.1/LSR-1.1-standards.pdf', json: `${out}/lsr-document.json` },
  { name: 'nist', pdf: `${out}/nist-source.pdf`, json: `${out}/nist-document.json`, pages: [6, 9, 10] },
]) {
  const bytes = await readFile(config.json), originalHash = sha(bytes), hypothesis = JSON.parse(bytes);
  const conversionStart = performance.now();
  const converted = await convertDocument(hypothesis, originalHash);
  assert.equal(sha(JSON.stringify(hypothesis)), sha(JSON.stringify(JSON.parse(bytes))));
  const document = parse(converted.source);
  assert.equal(canonicalWriteError(document), undefined);
  let units = project(document);
  // The holdout is a page slice of an existing PDF, not a changed DoclingDocument.
  // Provenance only selects that requested slice; it never discards PDF evidence.
  if (config.pages) {
    const paths = new Set(converted.report.items.filter(item => {
      const [, collection, index] = item.self_ref.split('/');
      return hypothesis[collection]?.[Number(index)]?.prov?.some(p => config.pages.includes(p.page_no));
    }).flatMap(item => item.targets.map(t => JSON.stringify(t.path))));
    units = units.filter(u => paths.has(JSON.stringify([u.path[0]]))).map((u, id) => ({ ...u, id }));
  }
  const conversionMs = performance.now() - conversionStart;
  const pdf = await evidence(config.pdf, config.pages);
  await writeFile(`${out}/${config.name}-initial.md`, converted.source);
  await writeFile(`${out}/${config.name}-evidence.json`, JSON.stringify(pdf, null, 2));
  await writeFile(`${out}/${config.name}-units.json`, JSON.stringify(units, null, 2));
  const dataset = { name: config.name, pdfSha256: pdf.sha256, doclingSha256: originalHash, litzioSha256: sha(converted.source), pages: pdf.pages.map(p => p.page), units: units.length, conversionMs, extractionMs: pdf.elapsedMs, suppressedLines: pdf.pages.flatMap(p => p.lines.filter(l => l.suppressed).map(l => ({ page: p.page, text: l.text }))), baselines: {} };
  const variants = config.name === 'lsr' ? mutations(document, units) : [];
  // Targets are chosen before either baseline is compared.
  for (const [mode, tokens] of [['raw', pdf.tokens], ['filtered', pdf.filtered]]) {
    const base = compare(tokens, units);
    dataset.baselines[mode] = base;
    for (const mutation of variants) {
      const run = compare(tokens, mutation.units);
      const verdict = score(base, run, mutation, tokens);
      result.cases.push({ dataset: config.name, mode, kind: mutation.kind, case: mutation.case, path: mutation.target.path, text: mutation.target.text, changedText: mutation.changedText, ...verdict, alerts: run.alerts.length, elapsedMs: run.elapsedMs });
      await writeFile(`${out}/${mode}-${mutation.kind}-${mutation.case}.json`, JSON.stringify(run, null, 2));
      if (mode === 'raw') await writeFile(`${out}/${mutation.kind}-${mutation.case}.md`, mutation.source);
    }
  }
  assert.equal(sha(await readFile(config.json)), originalHash);
  result.datasets.push(dataset);
  console.log(JSON.stringify({ name: config.name, pages: dataset.pages, baseline: Object.fromEntries(Object.entries(dataset.baselines).map(([mode, b]) => [mode, { alerts: b.alerts.length, perPage: b.alerts.length / dataset.pages.length, ms: b.elapsedMs, tokens: [b.pdfTokens, b.docTokens], matrixBytes: b.matrixBytes }])) }));
}
result.elapsedMs = performance.now() - started;
await writeFile(`${out}/result.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ cases: result.cases.map(c => ({ mode: c.mode, kind: c.kind, case: c.case, detected: c.detected, matched: c.targetBaselineMatchedTokens, tokens: c.targetTokens })), elapsedMs: result.elapsedMs }));
}
