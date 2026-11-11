// Validate exhaustive manual labels and retain a small, path-free result fixture.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const result = JSON.parse(await readFile('tmp/evidence-match/result.json', 'utf8'));
const labels = JSON.parse(await readFile(new URL('./noise-labels.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const datasets = result.datasets.map(d => ({
  name: d.name, pages: d.pages, pdfSha256: d.pdfSha256, doclingSha256: d.doclingSha256, litzioSha256: d.litzioSha256,
  units: d.units, conversionMs: d.conversionMs, extractionMs: d.extractionMs, suppressedLines: d.suppressedLines.length,
  baselines: Object.fromEntries(Object.entries(d.baselines).map(([mode, b]) => {
    const annotation = labels[d.name][mode];
    assert.deepEqual(Object.values(annotation).flat().sort((a, b) => a - b), b.alerts.map(a => a.id));
    return [mode, {
      alerts: b.alerts.length, perPage: b.alerts.length / d.pages.length,
      perCause: Object.fromEntries(Object.entries(annotation).map(([cause, ids]) => [cause, ids.length])),
      perPageCounts: Object.fromEntries(d.pages.map(page => [page, b.alerts.filter(a => a.page === page).length])),
      fingerprint: hash(JSON.stringify(b.alerts.map(a => [a.id, a.page, a.pdfText, a.docText]))),
      matchingMs: b.elapsedMs, pdfTokens: b.pdfTokens, docTokens: b.docTokens, lcs: b.lcs, matrixBytes: b.matrixBytes,
    }];
  })),
}));
// Manual annotations belong to these exact text gaps, not just these counts.
const measured = JSON.parse(await readFile(new URL('./measurement.json', import.meta.url), 'utf8'));
for (const d of datasets) {
  const expected = measured.datasets.find(x => x.name === d.name);
  for (const key of ['pdfSha256', 'doclingSha256', 'litzioSha256']) assert.equal(d[key], expected[key]);
  for (const mode of ['raw', 'filtered']) assert.equal(d.baselines[mode].fingerprint, expected.baselines[mode].fingerprint, 'Baseline changed: re-inspect every noise label');
}
assert.deepEqual(result.cases.map(c => [c.mode, c.kind, c.case, c.detected, c.targetBaselineMatchedTokens, c.targetTokens]), measured.cases.map(c => [c.mode, c.kind, c.case, c.detected, c.targetBaselineMatchedTokens, c.targetTokens]));
const fixture = {
  measuredOn: '2026-11-11', base: '519a1018', node: result.node, pdfjs: result.pdfjs,
  datasets, cases: result.cases.map(({ text, changedText, ...c }) => ({ ...c, targetTextSha256: hash(text), ...(changedText ? { changedTextSha256: hash(changedText) } : {}) })),
  elapsedMs: result.elapsedMs,
};
const file = process.argv[2] ?? 'tmp/evidence-match/summary.json';
await writeFile(file, JSON.stringify(fixture, null, 2) + '\n');
console.log(JSON.stringify({ file, datasets: datasets.map(d => ({ name: d.name, counts: Object.fromEntries(Object.entries(d.baselines).map(([mode, b]) => [mode, b.perCause])) })) }));
