import assert from "node:assert/strict";
import { syncBuiltinESMExports } from "node:module";
import fs, { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { getEditableDocument, parse } from "@litzio/core";
import { convertDoclingFile, addDoclingCorrection, removeDoclingCorrection, applyDoclingCorrections, readDoclingMap, convertWithDoclingCorrections, type DoclingCorrection } from "../src/index.ts";
import { emptyCorrections } from "../src/conversion/corrections.ts";
import { inspectDoclingMap, sha256 } from "../src/shared/map.ts";
import { readSource } from "../src/conversion/source.ts";

const ref = ($ref: string) => ({ $ref });
function source() {
  const texts = ["Heading", "False heading", "Para", "graph.", "Header", "Actually body"].map((text, i) => ({
    self_ref: `#/texts/${i}`, parent: ref(i === 5 ? "#/furniture" : "#/body"), children: [], label: i < 2 ? "section_header" : i === 5 ? "page_footer" : "text",
    text, orig: text, content_layer: i === 5 ? "furniture" : "body", ...(i < 2 ? { level: 1 } : {}),
    prov: [{ page_no: i < 3 ? 1 : 2, bbox: { l: 1, t: 1, r: 10, b: 10, coord_origin: "TOPLEFT" }, charspan: [0, [...text].length] }],
  }));
  return { schema_name: "DoclingDocument", version: "1.10.0", name: "Corrections",
    origin: { mimetype: "application/pdf", binary_hash: 0, filename: "source.pdf" },
    body: { self_ref: "#/body", children: texts.slice(0, 5).map(x => ref(x.self_ref)) },
    furniture: { self_ref: "#/furniture", content_layer: "furniture", children: [ref("#/texts/5")] }, texts,
    pages: { "1": { page_no: 1, size: { width: 100, height: 100 } }, "2": { page_no: 2, size: { width: 100, height: 100 } } } };
}
const inputText = () => JSON.stringify(source()).replace('"binary_hash":0', '"binary_hash":18446744073709551615');
function approval(id: string, target: number, change: Pick<DoclingCorrection, "operation" | "value">): DoclingCorrection {
  return { id, self_ref: `#/texts/${target}`, reason: "Approved from source pages", approvedAt: "2026-11-02T01:00:00Z", ...change } as DoclingCorrection;
}
function setup(t: test.TestContext) {
  const root = mkdtempSync(path.join(tmpdir(), "docling-corrections-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, "source.json"), folder = path.join(root, "result");
  const original = inputText(); writeFileSync(input, original);
  const baseline = convertDoclingFile(input, folder);
  return { root, input, folder, original, baseline };
}
const blocks = (markdown: string) => getEditableDocument(parse(markdown)).blocks;
function snapshot(folder: string) {
  return readdirSync(folder, { recursive: true, withFileTypes: true }).filter(x => x.isFile()).map(x => {
    const file = path.join(x.parentPath, x.name); return [path.relative(folder, file), sha256(readFileSync(file))];
  }).sort((a, b) => a[0].localeCompare(b[0]));
}

test("heading depth and both heading/body decisions use Core conversion, with original source metadata", t => {
  const f = setup(t);
  let result = addDoclingCorrection(f.folder, approval("depth", 0, { operation: "heading", value: { level: 3 } }));
  assert.ok(blocks(result.markdown).some(b => b.block === "heading" && b.level === 3 && b.text === "Heading"));
  result = addDoclingCorrection(f.folder, approval("body", 1, { operation: "heading", value: { level: null } }));
  assert.ok(blocks(result.markdown).some(b => b.block === "paragraph" && b.text === "False heading"));
  result = addDoclingCorrection(f.folder, approval("title", 4, { operation: "heading", value: { level: 2 } }));
  assert.ok(blocks(result.markdown).some(b => b.block === "heading" && b.level === 2 && b.text === "Header"));
  assert.equal(result.map.source.sha256, sha256(f.original));
  assert.equal(result.map.items.find(x => x.self_ref === "#/texts/1")!.label, "section_header");
  assert.equal(readFileSync(f.input, "utf8"), f.original);
  assert.deepEqual(readDoclingMap(JSON.stringify(result.map), result.markdown), result.map);
  assert.equal(inspectDoclingMap(JSON.stringify(f.baseline.map), result.markdown).stale, true);
  assert.equal(inspectDoclingMap(JSON.stringify(result.map), result.markdown).stale, false);
});

test("cross-page merge keeps both original regions targeting one paragraph, and removal restores exact output", t => {
  const f = setup(t), before = snapshot(f.folder);
  const result = addDoclingCorrection(f.folder, approval("join", 2, { operation: "merge-paragraphs", value: { next: "#/texts/3" } }));
  assert.ok(blocks(result.markdown).some(b => b.block === "paragraph" && b.text === "Para graph."));
  assert.ok(!blocks(result.markdown).some(b => b.block === "paragraph" && b.text === "graph."));
  const first = result.map.items.find(x => x.self_ref === "#/texts/2")!, second = result.map.items.find(x => x.self_ref === "#/texts/3")!;
  assert.deepEqual(first.targets, second.targets); assert.equal(second.status, "converted");
  assert.deepEqual(first.provenance, source().texts[2].prov); assert.deepEqual(second.provenance, source().texts[3].prov);
  assert.equal(second.parent, "#/body");
  const restored = removeDoclingCorrection(f.folder, "join");
  assert.deepEqual(restored, f.baseline); assert.deepEqual(snapshot(f.folder), before);
  assert.equal(readFileSync(f.input, "utf8"), f.original);
  // Chains can cross reading-order container boundaries while refs remain original.
  const grouped: any = source();
  grouped.texts[4].label = "page_header"; grouped.texts[4].content_layer = "furniture";
  grouped.texts.push({ ...structuredClone(grouped.texts[3]), self_ref: "#/texts/6", text: "Third page.", orig: "Third page.", parent: ref("#/body"), prov: [{ ...grouped.texts[3].prov[0], page_no: 3, charspan: [0, 11] }] });
  grouped.pages["3"] = { page_no: 3, size: { width: 100, height: 100 } };
  grouped.groups = [2, 3].map((index, i) => ({ self_ref: `#/groups/${i}`, label: "section", parent: ref("#/body"), children: [ref(`#/texts/${index}`)] }));
  grouped.texts[2].parent = ref("#/groups/0"); grouped.texts[3].parent = ref("#/groups/1");
  grouped.body.children = [ref("#/texts/0"), ref("#/texts/1"), ref("#/groups/0"), ref("#/texts/4"), ref("#/groups/1"), ref("#/texts/6")];
  const input = JSON.stringify(grouped), ledger = emptyCorrections("source.json", input);
  ledger.entries = [approval("join-first", 2, { operation: "merge-paragraphs", value: { next: "#/texts/3" } }), approval("join-next", 2, { operation: "merge-paragraphs", value: { next: "#/texts/6" } })];
  const chained = convertWithDoclingCorrections(input, ledger);
  assert.ok(blocks(chained.markdown).some(b => b.block === "paragraph" && b.text === "Para graph. Third page."));
  const target = chained.map.items.find(x => x.self_ref === "#/texts/2")!.targets;
  for (const id of [3, 6]) assert.deepEqual(chained.map.items.find(x => x.self_ref === `#/texts/${id}`)!.targets, target);
});

test("body/header/footer classification changes both label and layer without moving the source tree", t => {
  const f = setup(t);
  addDoclingCorrection(f.folder, approval("header", 4, { operation: "furniture", value: { label: "page_header" } }));
  const result = addDoclingCorrection(f.folder, approval("body", 5, { operation: "furniture", value: { label: "text" } }));
  assert.ok(!blocks(result.markdown).some(b => "text" in b && b.text === "Header"));
  assert.ok(blocks(result.markdown).some(b => b.block === "paragraph" && b.text === "Actually body"));
  assert.equal(result.map.items.find(x => x.self_ref === "#/texts/4")!.status, "decoration");
  assert.equal(result.map.items.find(x => x.self_ref === "#/texts/5")!.status, "converted");
  removeDoclingCorrection(f.folder, "header"); removeDoclingCorrection(f.folder, "body");
  const footer = addDoclingCorrection(f.folder, approval("footer", 4, { operation: "furniture", value: { label: "page_footer" } }));
  assert.equal(footer.map.items.find(x => x.self_ref === "#/texts/4")!.status, "decoration");
  assert.equal(readFileSync(f.input, "utf8"), f.original);
});

test("invalid, conflicting or unrepresentable approvals leave every result file and ledger unchanged", t => {
  const f = setup(t);
  addDoclingCorrection(f.folder, approval("depth", 0, { operation: "heading", value: { level: 2 } }));
  for (const [entry, reason] of [
    [approval("missing", 99, { operation: "heading", value: { level: 1 } }), /does not exist/],
    [approval("conflict", 0, { operation: "heading", value: { level: 3 } }), /Conflicts/],
    [approval("depth", 1, { operation: "heading", value: { level: 3 } }), /Invalid correction/],
    [approval("level", 1, { operation: "heading", value: { level: 7 } }), /Invalid correction/],
    [approval("skip", 2, { operation: "merge-paragraphs", value: { next: "#/texts/4" } }), /consecutive body/],
    [approval("page", 3, { operation: "merge-paragraphs", value: { next: "#/texts/4" } }), /cross consecutive pages/],
    [approval("furniture", 5, { operation: "heading", value: { level: 2 } }), /reachable body/],
    [{ ...approval("date", 1, { operation: "heading", value: { level: 2 } }), approvedAt: "not a date" }, /Invalid correction/],
  ] as const) {
    const before = snapshot(f.folder);
    assert.throws(() => addDoclingCorrection(f.folder, entry as DoclingCorrection), reason);
    assert.deepEqual(snapshot(f.folder), before);
  }
  const before = snapshot(f.folder);
  assert.throws(() => removeDoclingCorrection(f.folder, "unknown"), /does not exist/);
  assert.deepEqual(snapshot(f.folder), before);
  // Revoking a prerequisite must refuse the entire edit when a later merge depends on it.
  const dependent = source(); dependent.texts[2].label = "section_header"; dependent.texts[2].level = 1;
  const input = path.join(f.root, "dependent.json"), output = path.join(f.root, "dependent");
  writeFileSync(input, JSON.stringify(dependent)); convertDoclingFile(input, output);
  addDoclingCorrection(output, approval("body-first", 2, { operation: "heading", value: { level: null } }));
  // A merge after reclassification is a valid ordered sequence.
  addDoclingCorrection(output, approval("join", 2, { operation: "merge-paragraphs", value: { next: "#/texts/3" } }));
  const approved = snapshot(output);
  assert.throws(() => removeDoclingCorrection(output, "body-first"), /consecutive body/);
  assert.deepEqual(snapshot(output), approved);
  const samePage = source(); samePage.texts[2].prov[0].page_no = 2;
  const text = JSON.stringify(samePage), record = emptyCorrections("source.json", text);
  record.entries = [approval("style", 2, { operation: "merge-paragraphs", value: { next: "#/texts/3" } })];
  assert.throws(() => convertWithDoclingCorrections(text, record), /cross consecutive pages/);
  assert.equal(readFileSync(f.input, "utf8"), f.original);
});

test("replay preserves bundled original JSON/assets, initializes an empty ledger, and rejects source drift", t => {
  const f = setup(t), bundle = path.join(f.root, "bundle");
  cpSync(new URL("./fixtures/nist-sp1108r4/", import.meta.url), bundle, { recursive: true });
  const before = snapshot(bundle);
  applyDoclingCorrections(bundle);
  assert.deepEqual(snapshot(bundle).filter(([file]) => file !== "corrections.json"), before);
  const original = readFileSync(path.join(bundle, "document.json"));
  const data = JSON.parse(original.toString("utf8"));
  const heading = data.texts.find((x: any) => x.label === "section_header" && x.content_layer === "body");
  const entry = { ...approval("nist", 0, { operation: "heading", value: { level: 6 } }), self_ref: heading.self_ref };
  addDoclingCorrection(bundle, entry);
  assert.deepEqual(readFileSync(path.join(bundle, "document.json")), original);
  removeDoclingCorrection(bundle, "nist");
  assert.deepEqual(snapshot(bundle).filter(([file]) => file !== "corrections.json"), before);
  const saved = snapshot(f.folder); writeFileSync(f.input, f.original + "\n");
  assert.throws(() => applyDoclingCorrections(f.folder), /source SHA-256 mismatch/);
  assert.deepEqual(snapshot(f.folder), saved);
});

test("publication failure rolls back the complete generation; concurrent edits fail before replacement", t => {
  const f = setup(t), before = snapshot(f.folder);
  const rename = fs.renameSync;
  fs.renameSync = ((from, to) => {
    if (String(from).includes(".corrections-") && String(to) === f.folder) throw new Error("injected publication failure");
    return rename(from, to);
  }) as typeof rename;
  syncBuiltinESMExports();
  try { assert.throws(() => addDoclingCorrection(f.folder, approval("depth", 0, { operation: "heading", value: { level: 2 } })), /injected publication/); }
  finally { fs.renameSync = rename; syncBuiltinESMExports(); }
  assert.deepEqual(snapshot(f.folder), before);
  assert.deepEqual(readdirSync(f.root).sort(), ["result", "source.json"]);
  const map = readFileSync(path.join(f.folder, "document.docling-map.json"));
  assert.throws(() => applyDoclingCorrections(f.folder, { beforePublish: () => writeFileSync(path.join(f.folder, "document.md"), "concurrent edit") }), /changed after/);
  assert.equal(readFileSync(path.join(f.folder, "document.md"), "utf8"), "concurrent edit");
  assert.deepEqual(readFileSync(path.join(f.folder, "document.docling-map.json")), map);
  assert.deepEqual(readdirSync(f.root).sort(), ["result", "source.json"]);
});

test("merge conditions refuse formatting/association loss, including a consumed ref", () => {
  const text = inputText(), record = emptyCorrections("source.json", text);
  record.entries = [approval("join", 2, { operation: "merge-paragraphs", value: { next: "#/texts/3" } }), approval("consumed", 3, { operation: "heading", value: { level: 2 } })];
  assert.throws(() => convertWithDoclingCorrections(text, record), /Conflicts/);
  for (const mutate of [
    (s: any) => { s.texts[3].formatting = { bold: true }; },
    (s: any) => { s.pictures = [{ self_ref: "#/pictures/0", label: "picture", parent: ref("#/body"), children: [], captions: [ref("#/texts/3")] }]; s.body.children.push(ref("#/pictures/0")); },
    (s: any) => { s.texts[2].formatting = s.texts[3].formatting = { underline: true }; },
    (s: any) => {
      s.pictures = [{ self_ref: "#/pictures/0", label: "picture", parent: ref("#/body"), children: [ref("#/texts/2"), ref("#/texts/3")], image: { uri: "picture.png", mimetype: "image/png", dpi: 72, size: { width: 1, height: 1 } } }];
      s.texts[2].parent = s.texts[3].parent = ref("#/pictures/0");
      s.body.children = [ref("#/texts/0"), ref("#/texts/1"), ref("#/pictures/0"), ref("#/texts/4")];
    },
  ]) {
    const s = source(); mutate(s); const input = JSON.stringify(s), ledger = emptyCorrections("source.json", input);
    ledger.entries = [approval("join", 2, { operation: "merge-paragraphs", value: { next: "#/texts/3" } })];
    assert.throws(() => convertWithDoclingCorrections(input, ledger), /formatting|consecutive body|cannot be represented/);
    readSource(input);
  }
});
