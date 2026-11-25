import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { serialize as encode } from "node:v8";
import { saveEdits } from "../../apps/editor/server/document-replay.ts";
import { projectInlineContent, sameInlineContent } from "../../packages/core/src/inline.ts";
import { canonicalNativeSnapshot, hasNativeMarker, serializeNativeDocument } from "../../packages/core/src/myst/native.ts";
import { parse } from "../../packages/core/src/myst/parse.ts";
import { semanticFingerprint, semanticDifference } from "../../packages/core/src/myst/fingerprint.ts";
import { reconcileEndnotes } from "../../packages/core/src/operations.ts";
import { updateDocumentTitle } from "../../packages/core/src/myst/title.ts";
import { textRevision } from "../../packages/file-commit/src/index.ts";
import { blockRanges, openSnapshot, tryLocal, type Edit, type EditKind, type Snapshot } from "./local.ts";
import { header, editAt, mechanical, mixed, synthetic, variants } from "./cases.ts";

const stages: EditKind[] = ["paragraph", "inline", "cell", "heading", "list", "caption", "equation", "admonition"];
const enabled = new Set(stages);
const enabledByStage = stages.map((_, index) => new Set(stages.slice(0, index + 1)));
const fixtureDir = new URL("../../packages/core/test/fixtures/", import.meta.url);
type Source = { name: string; source: string; large?: boolean };

function fixtures(): Source[] {
  const files = readdirSync(fixtureDir).filter(name => name.endsWith(".md"))
    .map(name => ({ name, source: readFileSync(new URL(name, fixtureDir), "utf8") }));
  const bytes = JSON.parse(readFileSync(new URL("writer-bytes.master.json", fixtureDir), "utf8"));
  const archived = Object.entries(bytes.fixtures as Record<string, { input: string; output: string | null }>)
    .map(([name, { input }]) => ({ name: "writer-bytes/" + name, source: input }));
  const extra = [
    { name: "adversarial", source: header + [
      "Paragraph with remote [label].", "Second ordinary sample.", "# Heading", "(explicit)=",
      "# Another sample", "Separate prose.", "- first\n- second",
      "Immediate neighbour.", "Middle sample.", "Text with reference [^end].",
      "A side paragraph.", ":::{note}\nUniform record.\n:::", "Closing paragraph.",
      ":::{table} Labelled table\n:name: table-sample\n\n| Header | Value |\n| - | - |\n| A | 2 |\n:::",
      "Another reader uses [explicit](#explicit) and {numref}\x60table-sample\x60.",
      "[label]: https://example.org", "[^end]: Distant endnote.",
    ].join("\n\n") + "\n" },
    { name: "document-retry", source: header + "Stable first paragraph.\n\n\\:::note\n\n**(a)**&#x1F600;\n\nFinal paragraph.\n" },
  ];
  const pdf = process.env.SPIKE_PDF_MARKDOWN;
  return [...files, ...archived, ...extra, ...(pdf ? [{ name: "public-pdf", source: readFileSync(pdf, "utf8") }] : [])];
}

function nativeSource(input: string): string {
  return hasNativeMarker(input) ? input : header + input;
}

function full(snapshot: Snapshot, edit: Edit) {
  const updated = edit.apply(snapshot.document, edit.index);
  // The targeted footnote cases include the Host's final reconciliation.
  const next = edit.variant === "drop-note" || edit.variant === "short" || edit.variant === "empty" ?
    reconcileEndnotes(snapshot.document, updated) : updated;
  return canonicalNativeSnapshot(next);
}

type Row = {
  suite: string; document: string; index: number; kind: EditKind; variant: string; reason?: string;
  fullAccepted: boolean; shadowSame?: boolean; mismatch?: string; shadowDifference?: string;
  firstStage?: number;
};

function evaluate(snapshot: Snapshot, edit: Edit, suite: string, document: string): Row {
  const stage = stages.indexOf(edit.kind);
  // Each new type first runs under its own cumulative policy. A later stage only
  // opens more types, so the same per-type input and full oracle stay applicable.
  const policy = enabledByStage[stage] ?? enabled;
  const local = tryLocal(snapshot, edit, policy);
  const row: Row = { suite, document, index: edit.index, kind: edit.kind, variant: edit.variant,
    reason: local.reason, fullAccepted: false, firstStage: local.candidate ? stage : undefined };
  let oracle: ReturnType<typeof full> | undefined;
  try { oracle = full(snapshot, edit); }
  catch (error) {
    if (error instanceof TypeError || error instanceof ReferenceError) throw error;
    // A full refusal is a comparison outcome.
  }
  row.fullAccepted = oracle !== undefined;
  const compare = (candidate: NonNullable<typeof local.candidate>): string | undefined => {
    if (!oracle) return "full refusal or unstable second write";
    if (!candidate.snapshot.bytes.equals(Buffer.from(oracle.markdown))) return "bytes";
    // Identical bytes are parsed by the existing full writer. Independently compare its
    // top-level boundaries and semantics to the model assembled from the original and window.
    return semanticDifference(semanticFingerprint(candidate.snapshot.document), oracle.fingerprint);
  };
  if (local.candidate) row.mismatch = compare(local.candidate);
  else {
    assert.ok(local.reason);
    const shadow = tryLocal(snapshot, edit, policy, true);
    if (shadow.candidate) {
      row.shadowDifference = compare(shadow.candidate);
      row.shadowSame = !row.shadowDifference;
    }
  }
  return row;
}

function fixtureCases(snapshot: Snapshot): Edit[] {
  const result = mechanical(snapshot, false);
  result.push({ index: 0, kind: "structure", variant: "frontmatter", apply: doc => updateDocumentTitle(doc, "A new title") });
  for (const [index, node] of snapshot.document.children.entries()) {
    if (node.type !== "paragraph") continue;
    result.push(...variants.map(variant => editAt(snapshot, index, "paragraph", variant)));
    result.push(...["mark", "math", "link", "alternate", "add-note"].map(variant => editAt(snapshot, index, "inline", variant)));
    if (projectInlineContent(node)?.some(item => item.kind === "footnote")) {
      result.push(editAt(snapshot, index, "inline", "drop-note"));
    }
  }
  return [...new Map(result.map(edit => [[edit.index, edit.kind, edit.variant].join("/"), edit])).values()];
}

function batch(shard: number, workers: number, smoke: boolean) {
  const onlyPdf = process.env.SPIKE_SUITE === "pdf";
  const definitions: Source[] = onlyPdf ? [] : [
    { name: "synthetic-300", source: synthetic(300) },
    { name: "synthetic-2300", source: synthetic(2300), large: true },
  ];
  const results: Row[] = [];
  const inputs: { name: string; blocks?: number; located?: number; plain?: boolean; rejected?: boolean }[] = [];
  if (shard === 0) definitions.push(...fixtures().filter(source => !onlyPdf || source.name === "public-pdf"));
  if (onlyPdf && shard === 0) assert.ok(definitions.length, "Set SPIKE_PDF_MARKDOWN to the converted sample.");
  for (const { name, source, large } of definitions) {
    let snapshot: Snapshot;
    try { snapshot = openSnapshot(nativeSource(source)); }
    catch (error) {
      if (name.startsWith("synthetic")) throw error;
      inputs.push({ name, rejected: true });
      continue;
    }
    if (shard === 0) inputs.push({ name, blocks: snapshot.document.children.length - 1,
      located: snapshot.ranges.filter(Boolean).length - 1, plain: snapshot.plain });
    const isSynthetic = name.startsWith("synthetic");
    if (isSynthetic) assert.equal(snapshot.document.children.length - 1, Number(name.split("-")[1]));
    const cases = isSynthetic ? mechanical(snapshot, !!large) : fixtureCases(snapshot);
    if (isSynthetic) cases.push(...mixed(snapshot, 100));
    const selected = isSynthetic ? cases.filter((_, index) => index % workers === shard) : cases;
    const limit = smoke && isSynthetic ? 20 : selected.length;
    for (const edit of selected.slice(0, limit)) {
      const i = cases.indexOf(edit);
      const suite = isSynthetic && i >= cases.length - 100 ? "mixed" : "mechanical";
      const row = evaluate(snapshot, edit, suite, name);
      if (row.mismatch) console.error("MISMATCH", JSON.stringify(row));
      results.push(row);
    }
    console.error("finished", shard, name, limit);
  }
  return { results, inputs };
}

function time(size: number, hostReplay: boolean) {
  const start = performance.now();
  let snapshot = openSnapshot(synthetic(size));
  assert.equal(snapshot.document.children.length - 1, size);
  const openMs = performance.now() - start;
  const initial = snapshot.bytes.toString("utf8");
  const opening = snapshot;
  const memory = { source: snapshot.bytes.length, map: encode(snapshot.ranges).length,
    model: encode(snapshot.document).length };
  const rows = [];
  for (let i = 1; i <= 10; i++) {
    const index = 1 + (i % 3);
    const edit = editAt(snapshot, index, "paragraph", i % 2 === 0 ? "syntax-9" : "append");
    const before = performance.now();
    const { candidate, reason } = tryLocal(snapshot, edit, enabled);
    assert.ok(candidate, reason);
    const fast = performance.now() - before;
    const fullStarted = performance.now();
    const changed = edit.apply(snapshot.document, index);
    const output = serializeNativeDocument(changed);
    const revision = textRevision(output);
    const fullNative = performance.now() - fullStarted;
    assert.equal(candidate.snapshot.bytes.toString("utf8"), output);
    assert.equal(candidate.revision, revision);
    assert.deepEqual(candidate.snapshot.ranges, blockRanges(candidate.snapshot.bytes, parse(output, true)));
    assert.equal(canonicalNativeSnapshot(changed).markdown, output);
    const oldSnapshot = snapshot;
    snapshot = candidate.snapshot;
    if (![1, 2, 5, 10].includes(i)) continue;
    const edits = (state: Snapshot) => ({ paragraphs: [1, 2, 3].flatMap(index => {
      const content = projectInlineContent(state.document.children[index])!;
      return sameInlineContent(content, projectInlineContent(opening.document.children[index])!) ? [] :
        [{ path: [index], content }];
    }) });
    let replay: number | undefined;
    if (hostReplay) {
      const began = performance.now();
      if (i > 1) assert.equal(saveEdits(initial, edits(oldSnapshot)).markdown, oldSnapshot.bytes.toString("utf8"));
      assert.equal(saveEdits(initial, edits(snapshot)).markdown, output);
      replay = performance.now() - began;
    }
    rows.push({ i, changedBlocks: edits(snapshot).paragraphs.length, fast, ...candidate.timings, fullNative, replay });
  }
  return { size, openMs, memory, rows };
}

function chainedTypes() {
  let snapshot = openSnapshot(header + [
    "First sample.", "Second sample.", "# Same Anchor", "Plain sample.",
    ":::{table} Grid\n\n| Name | Value |\n| - | - |\n| A | 2 |\n:::",
    "After the grid.", "Before the list.", "- First item\n- Second item", "Near the list.",
    "A separate block.", ":::{figure} samples/example.svg\n\nOriginal diagram.\n:::",
    "A plain record.", ":::{math}\nx=2\n:::", "Before the notice.",
    ":::{note}\nA sample notice.\n:::", "Last sample.",
  ].join("\n\n") + "\n");
  const steps: [number, EditKind, string][] = [
    [1, "paragraph", "append"], [2, "inline", "mark"], [5, "cell", "math"], [3, "heading", "case"],
    [8, "list", "append"], [11, "caption", "append"], [13, "equation", "append"], [15, "admonition", "append"],
    [1, "paragraph", "syntax-9"], [5, "caption", "append"], [2, "inline", "math"], [5, "cell", "syntax-9"],
  ];
  for (const [index, kind, variant] of steps) {
    const edit = editAt(snapshot, index, kind, variant);
    const local = tryLocal(snapshot, edit, enabled);
    assert.ok(local.candidate, kind + " " + local.reason);
    const oracle = full(snapshot, edit);
    snapshot = local.candidate.snapshot;
    assert.equal(snapshot.bytes.toString("utf8"), oracle.markdown);
    assert.equal(semanticDifference(semanticFingerprint(snapshot.document), oracle.fingerprint), undefined);
    assert.deepEqual(snapshot.ranges, blockRanges(snapshot.bytes, parse(oracle.markdown, true)));
  }
  return { kinds: steps.map(([, kind]) => kind), finalRevision: textRevision(snapshot.bytes.toString("utf8")) };
}

function distantEndnote() {
  const source = header + ["Before.", "The claim[^n].", "After.", "A distant paragraph.",
    "[^n]: The endnote."].join("\n\n") + "\n";
  const snapshot = openSnapshot(source);
  const edit = editAt(snapshot, 2, "inline", "drop-note");
  assert.equal(tryLocal(snapshot, edit, enabled).reason, "footnote dependency");
  const unsafe = tryLocal(snapshot, edit, enabled, true).candidate;
  assert.ok(unsafe?.snapshot.bytes.toString("utf8").includes("[^n]:"));
  const oracle = full(snapshot, edit);
  assert.ok(!oracle.markdown.includes("[^n]:"));
  return "The edit window alone misses deletion of the distant endnote.";
}

function totals(rows: Row[]) {
  const count = (subset: Row[]) => ({
    n: subset.length, allowed: subset.filter(r => !r.reason).length,
    mismatch: subset.filter(r => r.mismatch).length, fullRejected: subset.filter(r => !r.fullAccepted).length,
    shadowCompared: subset.filter(r => r.shadowSame !== undefined).length,
    shadowSame: subset.filter(r => r.shadowSame).length,
  });
  const grouped = (key: (row: Row) => string) => Object.fromEntries(
    [...new Set(rows.map(key))].sort().map(value => [value, count(rows.filter(row => key(row) === value))]));
  return { total: count(rows), kinds: grouped(r => r.kind), reasons: grouped(r => r.reason ?? "accepted"),
    variants: grouped(r => r.variant),
    stages: stages.map((stage, index) => ({ stage, allowed: rows.filter(r => r.firstStage !== undefined && r.firstStage <= index).length,
      mismatch: rows.filter(r => r.mismatch && stages.indexOf(r.kind) <= index).length })),
  };
}

if (process.argv[2] === "--child") {
  const result = batch(Number(process.argv[3]), Number(process.argv[4]), process.argv[5] === "--smoke");
  process.send!(result, () => process.disconnect());
} else if (process.argv[2] === "--chain") {
  console.log(JSON.stringify({ ...chainedTypes(), negative: distantEndnote() }, null, 2));
} else if (process.argv[2] === "--time") {
  const size = process.argv.slice(3).find(value => !value.startsWith("--"));
  const sizes = size ? [Number(size)] : [300, 1300, 2300, 5000];
  console.log(JSON.stringify(sizes.map(size => time(size, !process.argv.includes("--skip-replay"))), null, 2));
} else {
  const smoke = process.argv.includes("--smoke");
  const workerCount = Number(process.env.SPIKE_WORKERS ?? Math.min(6, availableParallelism()));
  const started = performance.now();
  const jobs = Array.from({ length: workerCount }, (_, shard) => new Promise<ReturnType<typeof batch>>((resolve, reject) => {
    const worker = fork(fileURLToPath(import.meta.url), ["--child", String(shard), String(workerCount), ...(smoke ? ["--smoke"] : [])],
      { stdio: ["ignore", "inherit", "inherit", "ipc"] });
    let result: ReturnType<typeof batch> | undefined;
    worker.once("message", message => { result = message as ReturnType<typeof batch>; });
    worker.once("error", reject);
    worker.once("exit", code => code === 0 && result ? resolve(result) : reject(new Error("shard " + shard + " exited " + code)));
  }));
  const batches = await Promise.all(jobs);
  const rows = batches.flatMap(result => result.results);
  console.log(JSON.stringify({ smoke, workerCount, seconds: (performance.now() - started) / 1000,
    inputs: batches.flatMap(result => result.inputs), mechanical: totals(rows.filter(r => r.suite === "mechanical")),
    mixed: totals(rows.filter(r => r.suite === "mixed")), mismatches: rows.filter(r => r.mismatch),
    shadowDifferences: rows.filter(r => r.shadowDifference),
  }, null, 2));
  if (rows.some(row => row.mismatch)) process.exitCode = 1;
}
