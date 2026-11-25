import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = path.resolve("tmp/assistant-review");
const read = input => JSON.parse(readFileSync(input, "utf8"));
const baseline = read(path.join(dir, "baseline-score.json"));
const prior = read(path.join(dir, "legacy-score.json"));
const pinned = read(path.join(dir, "plugin/pdf/answer-key-baseline.json"));
const findings = read(new URL("./review-findings.json", import.meta.url));
const manualMath = read(new URL("./math-findings.json", import.meta.url));
const n = (entries, test) => entries.filter(test).length;
const tableEntries = baseline.entries.filter(e => e.grid);
const allCells = tableEntries.flatMap(e => e.cells);
for (const [role, count] of Object.entries(pinned.summary)) assert.equal(prior.summary[role].correct, count, role);
for (const [field, count] of Object.entries(pinned.tables)) assert.equal(prior.tableSummary[field], count, field);
assert.equal(prior.formulaSummary.own_image, pinned.formulas.own_image);
assert.equal(tableEntries.length, pinned.tables.text);
assert.equal(n(tableEntries, e => e.grid.actual.join() === e.grid.expected.join()), pinned.tables.same_grid);
assert.equal(n(allCells, cell => cell.same), pinned.tables.matched_text);
assert.equal(n(baseline.entries, e => e.issues.includes("kind:image") && e.role === "formula"), pinned.formulas.own_image);
assert.deepEqual(
  baseline.entries.filter(e => e.status !== "correct").map(e => e.id).sort(),
  [...new Set(Object.values(findings.groups).flat())].sort(),
  "The identification reference must cover each baseline error.",
);

const ids = Object.keys(findings.runs);
const result = {
  baseline: baseline.summary, baselineTotal: baseline.entries.length,
  baselineWrong: n(baseline.entries, e => e.status !== "correct"),
  baselineExtras: baseline.extras,
  baselineValidation: {
    originalTextTables: tableEntries.length, projectedGrids: tableEntries.length,
    projectedNonMathCellsCorrect: n(allCells, c => c.same), originalFormulaImages: pinned.formulas.own_image,
  },
  runs: {},
};
for (const name of ids) {
  const folder = path.join(dir, "runs", name);
  const s = read(path.join(folder, "state.json"));
  const integrity = read(path.join(folder, "integrity.json"));
  const score = read(path.join(folder, "score.json"));
  const entry = findings.runs[name];
  const found = [...findings.identifiedByAll, ...entry.additional];
  const correct = new Set(score.entries.filter(e => e.status === "correct").map(e => e.id));
  const fullFixes = Object.keys(findings.groups).filter(key => findings.groups[key].every(id => correct.has(id)));
  const form = manualMath[name];
  assert.equal(form.standalone, n(score.entries, e => e.latex));
  assert.equal(form.cells, n(score.entries.filter(e => e.actualMath?.length).flatMap(e => [...new Set(e.actualMath.flatMap(c => c.expressions))]), () => true));
  const usage = s.snapshots.map(snapshot => {
    const turn = snapshot.conversation.turns.at(-1);
    const tools = turn.items.filter(item => item.kind === "tool");
    const action = item => item.work?.kind === "execute" ? "shell" : item.work?.kind === "edit" ? "patch" : "document";
    return {
      seconds: Math.round(snapshot.elapsedSeconds), contextTokens: snapshot.conversation.tokenUsage?.used,
      approvals: n(turn.items, item => item.question?.approval),
      order: tools.map(item => action(item) + (item.status === "failed" ? " (failed)" : "")),
      cli: n(tools, item => action(item) === "shell" && /\b(?:litzio(?:\.ps1)?|LITZIO_ASSISTANT_CLI)\b[^\n]{0,180}\b(?:check|inspect|insert-|apply-batch|update-|help|--help)/i.test(item.text)),
    };
  });
  const names = score.rosterOrder.map(e => e.path);
  const orderCorrect = names.length === 18 && names.every((item, i) => i === 0 ||
    item[0] > names[i - 1][0] || (item[0] === names[i - 1][0] && item[1] > names[i - 1][1]));
  result.runs[name] = {
    detection: { found, missed: Object.keys(findings.groups).filter(key => !found.includes(key)),
      falseClaims: entry.falseClaims, ambiguous: entry.ambiguous, unsupported: entry.unsupported, outside: entry.outside },
    scored: score.summary, correct: correct.size, newlyCorrect: score.newlyCorrect, damaged: score.damaged,
    stillWrong: score.stillWrong.length, fullFixes, fullFixesOfFound: fullFixes.filter(x => found.includes(x)),
    mathMeaning: form, rosterInSourceOrder: orderCorrect,
    check: integrity.check, stale: integrity.mapping.stale, originalPdfUnchanged: integrity.pdfUnchanged,
    reviewDidNotEdit: integrity.reviewDidNotEdit, hostExited: integrity.hostExited,
    originalAssetsMissingOrOverwritten: integrity.originalAssetsMissingOrOverwritten,
    originalAssetsNoLongerReferenced: integrity.originalAssetsNoLongerReferenced,
    newAssets: integrity.newAssets, brokenLinks: score.links.filter(link => !link.resolves).length,
    nativeFigures: score.assets.length, extraBlockCount: score.extras.length,
    calls: usage,
  };
}
const output = process.argv[2] ?? path.join(dir, "results.json");
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
