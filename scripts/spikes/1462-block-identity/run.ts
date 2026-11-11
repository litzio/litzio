// Run from repository root: pnpm exec tsx scripts/spikes/1462-block-identity/run.ts
// All writes are experimental artifacts under ignored tmp/block-identity.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import * as C from "../../../packages/core/src/index.ts";
import * as A from "./path-map.ts";
import * as B from "./target-pairs.ts";
// A read-only diagnostic of MyST resolution, not an alternate product write path.
import { referenceTargetIndex } from "../../../packages/core/src/myst/label.ts";

// Community artifacts receive this SDK binding from their real Host. The spike
// binds the same SDK implementation locally, without editing the converter.
const binding = registerHooks({ resolve(specifier, context, next) {
  return next(specifier === "@litzio/plugin-sdk"
    ? new URL("../../../packages/plugin-sdk/src/index.ts", import.meta.url).href : specifier, context);
} });
const { convertDocument } = await import("../../../community-plugins/docling/document.js");
binding.deregister();

const here = new URL("./", import.meta.url);
const out = "tmp/block-identity";
await mkdir(out, { recursive: true });
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const clone = <T>(v: T): T => structuredClone(v);
type Fixture = any; // Spike JSON only; deliberately no new product schema.
type Expected = { block: string; text?: string; rows?: string[][]; origins: string[]; estimated: boolean };
const shape = (b: C.EditableBlock) => ({ block: b.block,
  ...("text" in b ? { text: b.text } : {}),
  ...(b.block === "table" ? { rows: b.rows.map(r => r.cells.map(c => c.text)) } : {}),
});
function sourceItem(f: Fixture, ref: string) {
  const [, kind, index] = ref.split("/");
  return f.document[kind][Number(index)];
}
function origins(f: Fixture, refs: string[]): A.Origin[] {
  return refs.map(ref => ({ ref: f.sourceRefs?.[ref] ?? ref, regions: clone(sourceItem(f, ref).prov) }));
}
function expectedLink(expected: Expected, originalLinks: Map<string, A.Link>): A.Link {
  return { origins: [...new Map(expected.origins.flatMap(key => originalLinks.get(key)!.origins).map(o => [o.ref, o])).values()],
    estimated: expected.estimated };
}
function contentOperation(document: C.Document, path: C.NodePath, step: Fixture) {
  switch (step.op) {
    case "text": return C.updateNodeTextAtPath(document, path, step.fromText, step.toText);
    case "convert": return C.convertBlock(document, path, step.to);
    case "split": return C.splitParagraph(document, path, step.offset);
    case "merge": return C.mergeParagraphWithPrevious(document, path);
    case "remove": return C.removeBlock(document, path[0]);
    case "cell": return C.updateTableCell(document, [path[0], step.row, step.column], step.value);
    default: throw new Error(`Unexpected content operation ${step.op}`);
  }
}
function verdict(expected: A.Link, actual?: A.Link) {
  if (!actual) return { wrong: 0, silent: 1 };
  return { wrong: JSON.stringify(actual) === JSON.stringify(expected) ? 0 : 1, silent: 0 };
}

async function run(f: Fixture, mode: "A" | "B") {
  const immutableHash = hash(JSON.stringify(f.document));
  const converted = await convertDocument(f.document, immutableHash);
  let document = C.parse(converted.source);
  let blocks = C.getEditableDocument(document).blocks;
  assert.equal(blocks.length, f.keys.length);
  const originalLinks = new Map<string, A.Link>(), expected = new Map<string, Expected>();
  let paths: A.Paths = new Map();
  for (const [i, block] of blocks.entries()) {
    const key = f.keys[i];
    const refs = converted.report.items.filter(item => item.targets.some(t => t.path[0] === block.path[0])).map(item => item.self_ref);
    assert.equal(refs.length, 1, "Excerpt has one source contributor per initial block");
    assert.equal(refs[0], f.document.body.children[i].$ref, "Initial correspondence follows source reading order");
    const item = sourceItem(f, refs[0]);
    if ("text" in block) assert.equal(block.text, item.text);
    const link = { origins: origins(f, refs), estimated: false };
    assert.ok(link.origins.every(o => o.regions.length > 0));
    originalLinks.set(key, link); paths.set(block.path[0], clone(link));
    expected.set(key, { ...shape(block), origins: [key], estimated: false });
  }
  let order: string[] = [...f.keys];
  const ids = new Map<string, string>(f.keys.map((k: string, i: number) => [k, `b-${String(i + 1).padStart(3, "0")}`]));
  let links = new Map([...originalLinks].map(([k, v]) => [ids.get(k)!, clone(v)]));
  let merged = new Map<string, string>();
  let deleted: A.Link[] = [], expectedDeleted: A.Link[] = [];
  const expectedMerged = new Map<string, string>();
  if (mode === "B") {
    for (const [i, block] of [...blocks.entries()].reverse()) {
      document = C.insertTarget(document, block.path[0], ids.get(f.keys[i])!);
    }
  }
  if (f.name === "synthetic" && mode === "A") {
    if (process.argv.includes("--fault=swap")) {
      const one = blocks[1].path[0], two = blocks[2].path[0];
      const saved = paths.get(one)!; paths.set(one, paths.get(two)!); paths.set(two, saved);
    }
    if (process.argv.includes("--fault=drop")) paths.delete(blocks[2].path[0]);
  }
  const checkpoints: unknown[] = [];
  function check(stage: string) {
    const projected = mode === "A" ? C.getEditableDocument(document).blocks.map(block => ({ block })) : B.pairs(document);
    assert.equal(projected.length, order.length, `${stage}: block count`);
    let wrong = 0, silent = 0;
    for (const [i, pair] of projected.entries()) {
      const key = order[i], wanted = expected.get(key)!;
      assert.deepEqual(shape(pair.block), { block: wanted.block,
        ...(wanted.text !== undefined ? { text: wanted.text } : {}), ...(wanted.rows ? { rows: wanted.rows } : {}) }, `${stage}: content ${key}`);
      const actual = mode === "A" ? paths.get(pair.block.path[0]) : links.get((pair as ReturnType<typeof B.pairs>[number]).id!);
      const result = verdict(expectedLink(wanted, originalLinks), actual);
      wrong += result.wrong; silent += result.silent;
      if (mode === "B") assert.equal((pair as ReturnType<typeof B.pairs>[number]).id, ids.get(key), `${stage}: ID follows ${key}`);
    }
    assert.equal(mode === "A" ? paths.size : links.size, order.length, `${stage}: no dangling correspondence`);
    assert.deepEqual(deleted, expectedDeleted, `${stage}: deletion is explicit; evidence retained`);
    if (mode === "B") assert.deepEqual(merged, expectedMerged, `${stage}: merged ID aliases`);
    checkpoints.push({ stage, blocks: order.length, wrongConnections: wrong, silentSourceLoss: silent });
    assert.equal(wrong, 0, `${stage}: wrong source regions`);
    assert.equal(silent, 0, `${stage}: silent source loss`);
  }
  async function checkpoint(stage: string) {
    check(`${stage}/immediate`);
    const source = C.serialize(document);
    document = C.parse(source); check(`${stage}/reparse`);
    assert.equal(C.serialize(document), source, "Stable canonical write");
    const prefix = `${out}/${f.name}-${mode}-${stage}`;
    await writeFile(`${prefix}.md`, source);
    // Experiment checkpoint only, not a proposed product sidecar/storage contract.
    await writeFile(`${prefix}.json`, JSON.stringify({ revision: hash(source), paths: [...paths], links: [...links], merged: [...merged], deleted }));
    document = C.parse(await readFile(`${prefix}.md`, "utf8"));
    const saved = JSON.parse(await readFile(`${prefix}.json`, "utf8"));
    assert.equal(saved.revision, hash(C.serialize(document)), "Correspondence belongs to this document snapshot");
    paths = new Map(saved.paths); links = new Map(saved.links); merged = new Map(saved.merged); deleted = saved.deleted;
    check(`${stage}/disk-reopen`);
  }
  await checkpoint("initial");
  for (const [i, step] of f.steps.entries()) {
    const index = order.indexOf(step.key), id = ids.get(step.key)!;
    const block = (mode === "A" ? C.getEditableDocument(document).blocks : B.pairs(document).map(p => p.block))[index];
    if (step.op === "split") ids.set(step.newKey, `b-${String(ids.size + 1).padStart(3, "0")}`);
    if (step.op === "remove") expectedDeleted.push(expectedLink(expected.get(step.key)!, originalLinks));
    if (step.op === "merge") expectedMerged.set(id, ids.get(step.front)!);
    if (mode === "A") {
      if (step.op === "move") {
        const to = C.getEditableDocument(document).blocks[step.to].path[0];
        document = C.moveBlock(document, block.path[0], to); paths = A.move(paths, block.path[0], to);
      } else {
        document = contentOperation(document, block.path, step);
        if (step.op === "split") paths = A.split(paths, block.path[0]);
        if (step.op === "merge") paths = A.merge(paths, block.path[0]);
        if (step.op === "remove") paths = A.remove(paths, block.path[0], deleted);
      }
    } else {
      if (step.op === "split") document = B.split(document, id, ids.get(step.newKey)!, step.offset, links);
      else if (step.op === "merge") document = B.merge(document, id, links, merged);
      else if (step.op === "move") document = B.move(document, id, step.to);
      else if (step.op === "remove") document = B.remove(document, id, links, deleted);
      else document = contentOperation(document, block.path, step);
    }
    order = [...step.expectedOrder]; // Explicit fixture oracle, never the mapping mutator.
    for (const [key, changes] of Object.entries(step.expectedChanges)) {
      expected.set(key, { ...expected.get(key), ...clone(changes as Expected) } as Expected);
    }
    if (step.op === "cell") expected.get(step.key)!.rows![step.row][step.column] = step.value;
    await checkpoint(`${i + 1}-${step.op}`);
  }
  await checkpoint("final");
  assert.equal(hash(JSON.stringify(f.document)), immutableHash, "Source evidence unchanged");
  const finalSource = C.serialize(document);
  await writeFile(`${out}/${f.name}-${mode}-export.md`, finalSource);
  document = C.parse(await readFile(`${out}/${f.name}-${mode}-export.md`, "utf8"));
  check("standalone-md-export-reopen");
  const tableAt = order.indexOf("table"), table = C.getEditableDocument(document).blocks.filter(b => b.block !== "target")[tableAt];
  assert.equal(table.block, "table");
  const lastStep = f.steps.at(-1);
  const cell = converted.report.items.find(item => item.self_ref === "#/tables/0")!.cells.find(cell => cell.positions.some(p => p.row === lastStep.row && p.column === lastStep.column));
  assert.ok(cell, "Existing source cell locator addresses corrected row/column");
  // A second move in the opposite direction exercises both bounded shift formulas.
  // A/B final exported source must stay semantically identical after a round trip move.
  if (mode === "B") {
    const movedId = ids.get(f.steps.find(s => s.op === "move").key)!;
    document = B.move(document, movedId, 0);
    document = B.move(document, movedId, order.length - 1);
    assert.equal(C.serialize(document), finalSource);
  } else {
    const first = C.getEditableDocument(document).blocks[0].path[0], last = C.getEditableDocument(document).blocks.at(-1)!.path[0];
    const roundTrip = A.move(A.move(paths, last, first), first, last);
    assert.deepEqual([...roundTrip].sort(), [...paths].sort());
  }
  return { fixture: f.name, mode, checkpoints, sourceEvidenceHash: immutableHash,
    exportedMarkdownHash: hash(finalSource), tableCell: { sourceCellIndex: cell.index, row: lastStep.row, column: lastStep.column },
    merged: [...merged], deleted: deleted.map(link => link.origins.map(o => o.ref)) };
}

async function nativeProbes(f: Fixture) {
  const converted = await convertDocument(f.document, hash(JSON.stringify(f.document)));
  let document = C.parse(converted.source);
  for (const [i, block] of [...C.getEditableDocument(document).blocks.entries()].reverse()) {
    document = C.insertTarget(document, block.path[0], `b-${i + 1}`);
  }
  document = C.parse(C.serialize(document));
  const all = B.pairs(document);
  const locate = (key: string) => all[f.keys.indexOf(key)];
  const resolution = ["h", "repeat-a", "table"].map(key => {
    const pair = locate(key), index = referenceTargetIndex(document as never);
    const target = index.lookup(pair.id!)?.target?.node;
    return { kind: pair.block.block, targetLine: pair.target, blockPath: pair.block.path,
      resolvedPath: target ? index.path(target) : null, ownLabel: "label" in pair.block ? pair.block.label : null };
  });
  const attempts: unknown[] = [];
  for (const step of f.steps) {
    const pair = locate(step.key);
    try {
      let next = step.op === "move" ? C.moveBlock(document, pair.block.path[0], all.at(-1)!.block.path[0])
        : contentOperation(document, pair.block.path, step);
      next = C.parse(C.serialize(next)); // Each direct native probe is isolated from the same saved baseline.
      const projected = B.pairs(next);
      const resolution = referenceTargetIndex(next as never);
      const rawOrder = [...f.keys];
      if (step.op === "split") rawOrder.splice(rawOrder.indexOf(step.key) + 1, 0, step.newKey);
      if (step.op === "remove") rawOrder.splice(rawOrder.indexOf(step.key), 1);
      if (step.op === "move") rawOrder.push(...rawOrder.splice(rawOrder.indexOf(step.key), 1));
      let wrongConnections = 0, silentSourceLoss = 0;
      const expectedIds = new Map(f.keys.map((key: string, i: number) => [key, `b-${i + 1}`]));
      for (const [i, key] of rawOrder.entries()) {
        const id = expectedIds.get(key) ?? "b-new-split";
        const resolved = resolution.lookup(id)?.target?.node;
        const path = resolved ? resolution.path(resolved) : undefined;
        if (path && JSON.stringify(path) !== JSON.stringify(projected[i].block.path)) wrongConnections++;
        if (!path || JSON.stringify(path) !== JSON.stringify(projected[i].block.path)) silentSourceLoss++;
      }
      if (step.op === "remove") {
        const stale = resolution.lookup(pair.id!)?.target?.node;
        if (stale && resolution.path(stale)) wrongConnections++;
      }
      attempts.push({ operation: step.op, accepted: true, associations: projected.map(p => ({ id: p.id ?? null, ...shape(p.block) })),
        wrongConnections, silentSourceLoss,
        targetLines: C.getEditableDocument(next).blocks.filter(b => b.block === "target").map(b => b.label) });
    } catch (error) {
      attempts.push({ operation: step.op, accepted: false, reason: (error as Error).message });
    }
  }
  const split = attempts.find((a: any) => a.operation === "split") as any;
  const merge = attempts.find((a: any) => a.operation === "merge") as any;
  const move = attempts.find((a: any) => a.operation === "move") as any;
  const remove = attempts.find((a: any) => a.operation === "remove") as any;
  assert.ok(split.associations.some(p => p.id === null), "Raw split leaves rear paragraph without ID");
  assert.equal(merge.accepted, false, "Raw merge is blocked by the intervening target");
  assert.ok(move.associations.some(p => p.id === null), "Raw move leaves the moved block without ID");
  assert.ok(remove.targetLines.includes(locate("delete").id), "Raw deletion leaves its target line behind");
  let paragraphLabelSetter = "";
  try { C.updateLabel(document, locate("repeat-a").block.path, "paragraph-owned-id"); }
  catch (error) { paragraphLabelSetter = (error as Error).message; }
  assert.match(paragraphLabelSetter, /requires a top-level Equation, Figure, Table or target/);
  return { resolution, attempts, nativeAcceptance: false,
    paragraphLabelSetter,
    wrongConnections: attempts.reduce((n: number, a: any) => n + (a.wrongConnections ?? 0), 0),
    silentSourceLoss: attempts.reduce((n: number, a: any) => n + (a.silentSourceLoss ?? 0), 0) };
}

const fixtures = await Promise.all(["synthetic.json", "lsr-excerpt.json"].map(async file => JSON.parse(await readFile(new URL(file, here), "utf8"))));
const runs = [];
for (const f of fixtures) for (const mode of ["A", "B"] as const) runs.push(await run(f, mode));
const native = await nativeProbes(fixtures[0]);
const loc: Record<string, number> = {};
for (const [mode, file] of [["A", "path-map.ts"], ["B", "target-pairs.ts"]]) {
  const source = (await readFile(new URL(file, here), "utf8")).replace(/\r\n/g, "\n");
  loc[mode] = source.split(`// BEGIN measured ${mode}\n`)[1].split(`// END measured ${mode}`)[0].trimEnd().split("\n").length;
}
const result = { scope: "Two bounded fixtures, seven sequential operations each; B uses explicit target-pair shim, not native identity", loc,
  runs, native };
await writeFile(`${out}/results.json`, JSON.stringify(result, null, 2) + "\n");
await writeFile(`${out}/summary.json`, JSON.stringify({ ...result,
  runs: runs.map(({ checkpoints, ...r }) => ({ ...r, checkpoints: checkpoints.length,
    wrongConnections: 0, silentSourceLoss: 0 })),
  native: { ...native, attempts: native.attempts.map(({ associations, targetLines, ...a }: any) => a) },
}, null, 2) + "\n");
console.log(JSON.stringify({ runs: runs.map(r => ({ fixture: r.fixture, mode: r.mode, checkpoints: r.checkpoints.length })), loc,
  wrongConnections: 0, silentSourceLoss: 0, BNativeAccepted: false, results: `${out}/results.json` }, null, 2));
