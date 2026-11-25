import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = path.resolve("tmp/assistant-review");
const stem = "LSR-1.1-standards";
const baseline = path.join(dir, "baseline", stem, stem + ".md");
const oracle = read(path.join(dir, "plugin/pdf/test/fixtures/standards.json"));
const originalMapping = read(baseline.replace(/\.md$/, ".pdf-source.json"));
const legacy = read(path.join(dir, "legacy-score.json"));
const capacities = new Map(oracle.relations.filter(r => r.type === "caption_of").map(r => [r.to, r.from]));
const tableNotes = oracle.relations.filter(r => r.type === "table_note_for");
const byId = new Map(oracle.elements.map(e => [e.id, e]));
const elements = oracle.elements.filter(e => e.page !== 1 && e.order !== null);
const [run = "baseline"] = process.argv.slice(2);
const visualFindings = read(new URL("./visual-findings.json", import.meta.url));
const state = run === "baseline" ? null : read(path.join(dir, "runs", run, "state.json"));
const file = state?.document ?? baseline;
const cli = path.resolve("packages/cli/dist/cli.mjs");
const check = invoke("check");
const snapshot = invoke("inspect");
const output = state ? path.join(dir, "runs", run, "score.json") : path.join(dir, "baseline-score.json");
const baselineScore = state ? read(path.join(dir, "baseline-score.json")) : null;
const report = { revision: snapshot.revision, check, excludedPages: [1], entries: [], summary: {}, extras: [], links: [], assets: [] };
const normalized = value => String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
const pathOf = node => node.path.join(".");
const tops = snapshot.nodes.filter(node => node.path.length === 1 && node.type !== "caption");
const targets = new Map(tops.filter(node => node.label).map(node => [node.label, node]));
const captionText = node => inline(node.caption ?? snapshot.nodes.find(n => n.type === "caption" && n.path[0] === node.path[0])?.content ?? []);
const caption = node => normalized((node.captionNumberText ? node.captionNumberText + ". " : "") + captionText(node));
const originalNodes = read(path.join(dir, "baseline-inspect.json")).nodes;
const originalAssets = new Map(originalMapping.ownedImages.map(i => [i.name, i.sha256]));
const mappedNode = id => {
  const blocks = legacy.elements.find(e => e.id === id)?.blocks ?? [];
  const position = originalMapping.blocks.find(b => blocks.includes(b.id))?.path[0];
  return originalNodes.find(n => n.path[0] === position && n.type === "figure");
};
const words = text => new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []));
const used = new Set();
const candidates = tops.filter(n => ["paragraph", "heading", "quote", "admonition", "footnote"].includes(n.type))
  .map(n => ({ n, text: normalized(inline(n.content) || n.text) }));
const nonListText = snapshot.nodes.filter(n => ["code", "cell", "figure"].includes(n.type))
  .map(n => ({ n, text: normalized(n.code || n.imageAlt || inline(n.content) || n.text) }));
const items = [];
for (const n of tops.filter(n => n.type === "list")) {
  function add(list, depth, prefix) {
    (list ?? []).forEach((item, index) => {
      const itemPath = [...prefix, index];
      items.push({ n, text: normalized(inline(item.content) || item.text), depth, itemPath });
      if (item.list) add(item.list.items, depth + 1, itemPath);
    });
  }
  add(n.items, 1, n.path);
}
const textCandidates = [...candidates, ...items];
const title = snapshot.title ? { n: { type: "title", path: [] }, text: normalized(snapshot.title) } : null;
if (title) textCandidates.push(title);
const captions = tops.filter(n => ["table", "figure"].includes(n.type) && captionText(n)).map(n => ({ n, text: caption(n) }));
const findText = (expected, pool, expectedType) => {
  const a = words(expected);
  return pool.map(candidate => {
    const b = words(candidate.text);
    const shared = [...a].filter(x => b.has(x)).length;
    const overlap = shared / (a.size + b.size - shared || 1);
    const score = candidate.text === expected ? 3 : (candidate.text.includes(expected) || expected.includes(candidate.text)) && Math.min(a.size, b.size) >= 2 ? 2 : overlap >= 0.55 && shared >= 4 ? overlap : 0;
    return { ...candidate, score };
  }).filter(c => c.score).sort((a, b) => b.score - a.score || Number(b.n.type === expectedType) - Number(a.n.type === expectedType))[0];
};
const associated = new Map();
for (const element of elements.filter(e => ["table", "picture"].includes(e.role))) {
  const expected = byId.get(capacities.get(element.id))?.text;
  const match = captions.find(c => c.text === normalized(expected))?.n;
  const original = mappedNode(element.id);
  const originalHash = originalAssets.get(path.basename(original?.imageUrl ?? ""));
  const image = originalHash && tops.find(n => n.type === "figure" && assetHash(n.imageUrl) === originalHash);
  const tableTokens = new Set(element.table?.cells.map(c => normalized(c.text)).filter(Boolean));
  const possibleTables = tops.filter(n => n.type === "table").map(n => {
    const values = new Set(cellsOf(n).map(c => normalized(inline(c.content))));
    return { n, ratio: [...tableTokens].filter(t => values.has(t)).length / (tableTokens.size || 1) };
  }).sort((a, b) => b.ratio - a.ratio);
  const fallback = element.role === "table" && possibleTables[0]?.ratio >= 0.5 ? possibleTables[0].n : null;
  associated.set(element.id, match ?? fallback ?? image);
}
const formulaSets = [
  { ids: ["std-equation-1", "std-equation-2"], before: "std-equations-intro", after: "std-symbol-defs" },
  { ids: ["std-equation-3"], before: "std-conditional-table", after: "std-cube-explanation" },
];
for (const set of formulaSets) {
  const index = id => (associated.get(id) ?? findText(normalized(byId.get(id).text), candidates)?.n)?.path[0];
  const lo = index(set.before), hi = index(set.after);
  const eligible = tops.filter(n => n.type === "equation" && n.path[0] > lo && n.path[0] < hi);
  const matched = new Map();
  for (const id of set.ids) {
    const expected = byId.get(id);
    const orig = mappedNode(id);
    const digest = originalAssets.get(path.basename(orig?.imageUrl ?? ""));
    const retained = tops.find(n => n.type === "figure" && digest && assetHash(n.imageUrl) === digest);
    const equation = eligible.find(n => ![...matched.values()].includes(n) && n.latex.trim().startsWith(expected.text.split("=")[0]));
    if (equation || retained) matched.set(id, equation ?? retained);
  }
  const remaining = set.ids.filter(id => !matched.has(id));
  const unusedEquations = eligible.filter(n => ![...matched.values()].includes(n));
  if (remaining.length === unusedEquations.length) remaining.forEach((id, i) => matched.set(id, unusedEquations[i]));
  for (const id of set.ids) associated.set(id, matched.get(id));
}
for (const e of elements) {
  const entry = { id: e.id, role: e.role, page: e.page, status: "missing", issues: [], expected: e.text };
  let actual;
  let node = associated.get(e.id);
  if (e.role === "table") {
    if (node?.type === "table") Object.assign(entry, compareTable(e, node));
    else if (node) entry.issues.push("kind:image");
  } else if (e.role === "picture" || e.role === "formula") {
    if (node) {
      if (e.role === "formula") {
        if (node.type !== "equation") entry.issues.push("kind:image");
        else {
          entry.latex = node.latex;
          entry.math = "manual";
        }
      } else {
        const src = mappedNode(e.id);
        const digest = assetHash(node.imageUrl);
        const finding = visualFindings.images[digest];
        entry.imageSha256 = digest;
        if (finding === "complete") {
          // Visually confirmed against the authored PDF region.
        } else if (finding) entry.issues.push(finding);
        else if (!digest || digest !== originalAssets.get(path.basename(src?.imageUrl ?? ""))) entry.issues.push("image:manual-review");
      }
    }
  } else if (e.role === "caption") {
    const relatedId = oracle.relations.find(r => r.type === "caption_of" && r.from === e.id)?.to;
    const parent = associated.get(relatedId);
    const attached = parent ? caption(parent) : "";
    const found = findText(normalized(e.text), [...captions, ...candidates], "caption");
    node = found?.n ?? parent;
    actual = found?.text ?? attached;
    if (node && attached !== normalized(e.text)) entry.issues.push(node === parent ? "text" : "kind-or-attachment");
    if (!actual) node = undefined;
  } else {
    let expected = normalized(e.text);
    let wanted = ({ paragraph: "paragraph", section_header: "heading", document_title: "heading",
      list_item: "list", footnote: "footnote" })[e.role];
    const localTable = tableNotes.find(r => r.from === e.id);
    const pageWithoutCall = ["std-page-note-18", "std-page-note-19"].includes(e.id);
    if (localTable || pageWithoutCall) wanted = "paragraph";
    if (e.role === "footnote" && wanted === "footnote") expected = normalized(expected.slice(e.note_marker.length));
    const continuation = oracle.relations.find(r => r.type === "paragraph_continues" && [r.from, r.to].includes(e.id));
    if (continuation) expected = normalized(byId.get(continuation.from).text + " " + byId.get(continuation.to).text);
    const found = findText(expected, e.role === "list_item" ? [...textCandidates, ...nonListText] : textCandidates, wanted);
    node = found?.n;
    actual = found?.text;
    if (node) {
      if (node.type !== wanted) entry.issues.push("kind");
      const level = e.heading_level ?? (e.role === "document_title" ? 2 : null);
      if (level && node.type === "heading" && node.level !== level) entry.issues.push("level");
      if (pageWithoutCall && node.type === "paragraph") actual = actual.replace(/^\[(\d+)\]\s*/, "$1 ");
      if (expected !== actual) entry.issues.push("text");
      if (localTable) {
        const parent = associated.get(localTable.to);
        const peers = tableNotes.filter(r => r.to === localTable.to).map(r => normalized(byId.get(r.from).text));
        const between = tops.filter(n => n.path[0] > (parent?.path[0] ?? Infinity) && n.path[0] < node.path[0]);
        if (parent?.type !== "table" || node.path[0] <= parent.path[0] ||
            between.some(n => !peers.includes(normalized(inline(n.content) || n.text)))) entry.issues.push("note-placement");
      }
      if (found.itemPath) entry.itemPath = found.itemPath;
    }
  }
  if (node) {
    used.add(pathOf(node));
    if (node.type === "cell") used.add(String(node.path[0]));
    entry.path = node.path;
    entry.actualType = node.type;
    entry.status = entry.issues.length ? "wrong" : "correct";
  }
  if (actual) entry.actual = actual;
  report.entries.push(entry);
  const counts = report.summary[e.role] ??= { correct: 0, wrong: 0, missing: 0 };
  counts[entry.status]++;
}
report.extras = tops.filter(n => !used.has(pathOf(n)) && n.type !== "target").map(n => ({
  path: n.path, type: n.type, text: normalized(inline(n.content) || n.text || caption(n)), latex: n.latex,
}));
for (const n of tops.filter(n => n.imageUrl)) report.assets.push({ path: n.path, url: n.imageUrl, sha256: assetHash(n.imageUrl) });
for (const n of snapshot.nodes) {
  scan(n.content ?? n.items ?? n.caption, item => {
    if (item.kind === "reference" || (item.kind === "link" && item.url.startsWith("#")) || item.kind === "footnote") {
      const label = item.label ?? item.url.slice(1);
      report.links.push({ path: n.path, kind: item.kind, label, resolves: targets.has(label) });
    } else if (item.kind === "link" && /^(?:\.\/)?assets\//.test(item.url)) {
      report.links.push({ path: n.path, kind: "asset-link", label: item.url, resolves: Boolean(assetHash(item.url)) });
    }
  });
}
report.rosterOrder = report.entries.filter(e => e.role === "list_item" && e.itemPath).map(e => ({ id: e.id, path: e.itemPath }));
const found = new Map(report.entries.map(e => [e.id, e]));
report.relations = oracle.relations.map(relation => {
  const a = found.get(relation.from), b = found.get(relation.to);
  let matches = null;
  if (a?.path && b?.path) {
    switch (relation.type) {
      case "caption_of": matches = a.status === "correct"; break;
      case "table_note_for": matches = !a.issues.includes("note-placement"); break;
      case "paragraph_continues": matches = a.status === "correct" && a.path[0] === b.path[0]; break;
      case "must_remain_distinct": matches = a.path[0] !== b.path[0]; break;
      case "note_reference": {
        const def = tops.find(n => pathOf(n) === b.path.join("."));
        matches = report.links.some(link => link.kind === "footnote" && link.path[0] === a.path[0] && link.label === def?.label);
        break;
      }
    }
  }
  return { ...relation, matches };
});
if (baselineScore) {
  const before = new Map(baselineScore.entries.map(e => [e.id, e.status]));
  report.newlyCorrect = report.entries.filter(e => e.status === "correct" && before.get(e.id) !== "correct").map(e => e.id);
  report.damaged = report.entries.filter(e => e.status !== "correct" && before.get(e.id) === "correct").map(e => e.id);
  report.stillWrong = report.entries.filter(e => e.status !== "correct" && before.get(e.id) !== "correct").map(e => e.id);
}
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ run, valid: check.validation?.valid, summary: report.summary, newlyCorrect: report.newlyCorrect, damaged: report.damaged }));

function read(name) { return JSON.parse(readFileSync(name, "utf8")); }

function invoke(command) {
  const result = spawnSync(process.execPath, [cli, command, file, "--format", "json"], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error || !result.stdout) throw result.error ?? Error(result.stderr);
  return JSON.parse(result.stdout);
}

function scan(value, visit) {
  if (Array.isArray(value)) for (const x of value) scan(x, visit);
  else if (value && typeof value === "object") {
    visit(value);
    for (const x of Object.values(value)) scan(x, visit);
  }
}

function inline(content = []) {
  return content.map(item => {
    if (item.kind === "footnote") {
      const def = targets.get(item.label);
      const source = def && elements.find(e => e.role === "footnote" && e.text.slice(e.note_marker.length).trim() === normalized(def.text));
      return source?.note_marker ?? "";
    }
    if (item.kind === "reference") return targets.get(item.label)?.referenceText ?? item.label;
    if (item.kind === "math") return item.value;
    if (item.kind === "break") return "\n";
    return item.text ?? (item.children ? inline(item.children) : "");
  }).join("");
}

function assetHash(url) {
  if (!url || /^(?:[a-z]+:|\/)/i.test(url)) return null;
  const target = path.resolve(path.dirname(file), url);
  if (!existsSync(target)) return null;
  return createHash("sha256").update(readFileSync(target)).digest("hex");
}

function cellsOf(node) {
  return snapshot.nodes.filter(n => n.type === "cell" && n.path[0] === node.path[0]);
}

function compareTable(element, node) {
  const { num_rows, num_cols, cells } = element.table;
  const folded = cells.some(c => c.r0 === 0 && c.r1 === 2 && c.column_header);
  const expectedRows = num_rows - Number(folded);
  const actualCells = cellsOf(node);
  const actualRows = 1 + Math.max(-1, ...actualCells.map(n => n.path[1]));
  const actualCols = 1 + Math.max(-1, ...actualCells.map(n => n.path[2]));
  const results = [];
  const math = [];
  const actualMath = actualCells.flatMap(cell => {
    const expressions = [];
    scan(cell.content, item => { if (item.kind === "math") expressions.push(item.value); });
    return expressions.length ? [{ row: cell.path[1], col: cell.path[2], expressions }] : [];
  });
  for (let row = 0; row < expectedRows; row++) {
    for (let col = 0; col < num_cols; col++) {
      const sourceRows = folded ? row ? [row + 1] : [0, 1] : [row];
      const pitched = cells.filter(c => sourceRows.some(r => c.r0 <= r && r < c.r1) && c.c0 <= col && col < c.c1);
      const expected = pitched.map(c => c.text).filter(Boolean).join(" / ");
      const actual = actualCells.find(n => n.path[1] === row && n.path[2] === col);
      const actualText = normalized(inline(actual?.content) || actual?.text);
      const sourceMath = pitched.find(c => c.content_kind === "math");
      if (sourceMath) {
        const expressions = [];
        scan(actual?.content, item => { if (item.kind === "math") expressions.push(item.value); });
        math.push({ id: sourceMath.id, row, col, expected, actual: actualText, expressions });
      } else results.push({ row, col, expected, actual: actualText, same: Boolean(actual) && normalized(expected) === actualText });
    }
  }
  const issues = [];
  if (actualRows !== expectedRows || actualCols !== num_cols || actualCells.length !== expectedRows * num_cols) issues.push("grid");
  if (results.some(c => !c.same)) issues.push("cell-text");
  if (math.some(c => !c.expressions.length)) issues.push("cell-math-kind");
  return { issues, grid: { expected: [expectedRows, num_cols], actual: [actualRows, actualCols] }, cells: results, math, actualMath };
}
