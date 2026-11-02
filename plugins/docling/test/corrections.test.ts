import assert from "node:assert/strict";
import { syncBuiltinESMExports } from "node:module";
import { execFileSync } from "node:child_process";
import fs, { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { getEditableDocument, parse } from "@litzio/core";
import { convertDoclingFile, addDoclingCorrection, removeDoclingCorrection, applyDoclingCorrections, readDoclingMap, convertWithDoclingCorrections, type DoclingCorrection } from "../src/index.ts";
import { emptyCorrections } from "../src/conversion/corrections.ts";
import { PublishedCorrectionCleanupError } from "../src/conversion/correction-files.ts";
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

function windowsAlias(t: test.TestContext, f: ReturnType<typeof setup>) {
  const folder = path.join(f.root, "LongConversionFolder");
  fs.renameSync(f.folder, folder);
  const alias = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "(New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:LITZIO_TEST_CONVERSION_FOLDER).ShortPath"],
  { encoding: "utf8", windowsHide: true, env: { ...process.env, LITZIO_TEST_CONVERSION_FOLDER: folder } }).trim();
  if (path.basename(alias).toLowerCase() === path.basename(folder).toLowerCase()) {
    t.skip("The temporary filesystem does not provide an 8.3 folder alias"); return;
  }
  return { folder, alias };
}

test("Windows 8.3 correction input preserves the original public folder name and bytes", { skip: process.platform !== "win32" }, t => {
  const f = setup(t), names = windowsAlias(t, f);
  if (!names) return;
  const before = snapshot(names.folder);
  applyDoclingCorrections(names.alias);
  assert.ok(fs.existsSync(names.folder), "the original long public path must still exist");
  assert.deepEqual(snapshot(names.folder), before);
  assert.deepEqual(readdirSync(f.root).sort(), ["LongConversionFolder", "source.json"]);
});

test("Windows long and 8.3 correction paths share a lock without releasing another writer's lock", { skip: process.platform !== "win32" }, t => {
  const f = setup(t), names = windowsAlias(t, f);
  if (!names) return;
  const lock = path.join(f.root, ".LongConversionFolder.corrections.lock"), before = snapshot(names.folder);
  fs.mkdirSync(lock);
  assert.throws(() => applyDoclingCorrections(names.alias), /already being updated/);
  assert.ok(fs.existsSync(lock), "a rejected writer must leave the owner's lock intact");
  assert.deepEqual(snapshot(names.folder), before);
  rmSync(lock, { recursive: true });
  applyDoclingCorrections(names.folder);
});

// Exercise the real publication/rollback transaction; only rename failures and
// sleeping are injected. The existing Windows CI command selects these tests.
for (const phase of ["backup", "publication", "rollback"] as const) {
  for (const code of ["EPERM", "EACCES", "EBUSY"]) test(`Windows ${phase} rename recovers from transient ${code}`, { skip: process.platform !== "win32" }, t => {
    const f = setup(t), before = snapshot(f.folder), waits: number[] = [];
    const rename = fs.renameSync, publicationError = new Error("injected publication failure");
    let attempts = 0, checked = 0;
    t.mock.method(Atomics, "wait", (_array: Int32Array, _index: number, _value: number, ms: number) => {
      assert.ok(fs.existsSync(path.join(f.root, ".result.corrections.lock")));
      waits.push(ms); return "timed-out";
    });
    fs.renameSync = ((from, to) => {
      const step = String(to).includes(".previous-") ? "backup" : String(from).includes(".previous-") ? "rollback" : "publication";
      if (phase === "rollback" && step === "publication") throw publicationError;
      if (step === phase && ++attempts <= 3) throw Object.assign(new Error(`transient ${code}`), { code });
      return rename(from, to);
    }) as typeof rename;
    syncBuiltinESMExports();
    try {
      const change = () => addDoclingCorrection(f.folder, approval("depth", 0, { operation: "heading", value: { level: 2 } }), { beforePublish: () => { checked++; } });
      if (phase === "rollback") assert.throws(change, error => error === publicationError);
      else change();
    } finally { fs.renameSync = rename; syncBuiltinESMExports(); }
    assert.equal(attempts, 4); assert.deepEqual(waits, [20, 40, 80]);
    assert.equal(checked, 1, "retry a single rename, never replay preparation or revision checks");
    if (phase === "rollback") assert.deepEqual(snapshot(f.folder), before);
    else {
      const markdown = readFileSync(path.join(f.folder, "document.md"), "utf8");
      assert.ok(blocks(markdown).some(b => b.block === "heading" && b.level === 2));
      assert.equal(inspectDoclingMap(readFileSync(path.join(f.folder, "document.docling-map.json"), "utf8"), markdown).stale, false);
      assert.equal(JSON.parse(readFileSync(path.join(f.folder, "corrections.json"), "utf8")).entries.length, 1);
    }
    assert.equal(readFileSync(f.input, "utf8"), f.original);
    assert.deepEqual(readdirSync(f.root).sort(), ["result", "source.json"]);
  });

  test(`Windows ${phase} rename exhausts its bounded waits and preserves failure recovery`, { skip: process.platform !== "win32" }, t => {
    const f = setup(t), before = snapshot(f.folder), waits: number[] = [];
    const rename = fs.renameSync, problem = Object.assign(new Error("persistent EPERM"), { code: "EPERM" });
    const publicationError = new Error("injected publication failure");
    let attempts = 0, previous: string | undefined;
    t.mock.method(Atomics, "wait", (_array: Int32Array, _index: number, _value: number, ms: number) => {
      assert.ok(fs.existsSync(path.join(f.root, ".result.corrections.lock")));
      if (phase !== "backup") assert.equal(fs.existsSync(f.folder), false, "never expose an incomplete generation during backoff");
      waits.push(ms); return "timed-out";
    });
    fs.renameSync = ((from, to) => {
      const step = String(to).includes(".previous-") ? "backup" : String(from).includes(".previous-") ? "rollback" : "publication";
      if (step === "backup") previous = String(to);
      if (phase === "rollback" && step === "publication") throw publicationError;
      if (step === phase) { attempts++; throw problem; }
      return rename(from, to);
    }) as typeof rename;
    syncBuiltinESMExports();
    try {
      assert.throws(() => addDoclingCorrection(f.folder, approval("depth", 0, { operation: "heading", value: { level: 2 } })), error => {
        if (phase !== "rollback") return error === problem;
        assert.ok(error instanceof Error); assert.match(error.message, /Could not restore.*rollback failed.*retained at/);
        assert.ok(previous && error.message.includes(previous));
        assert.ok(includesError(error, problem)); assert.ok(includesError(error, publicationError)); return true;
      });
    } finally { fs.renameSync = rename; syncBuiltinESMExports(); }
    assert.equal(attempts, 7); assert.deepEqual(waits, [20, 40, 80, 160, 320, 640]);
    assert.equal(waits.reduce((sum, ms) => sum + ms, 0), 1260);
    if (phase === "rollback") {
      assert.ok(previous); assert.equal(fs.existsSync(f.folder), false);
      assert.deepEqual(snapshot(previous), before);
      rename(previous, f.folder); // Manual recovery after checking the retained backup.
    } else assert.deepEqual(snapshot(f.folder), before);
    assert.equal(readFileSync(f.input, "utf8"), f.original);
    assert.deepEqual(readdirSync(f.root).sort(), ["result", "source.json"], "release owned lock and clean staging independently");
  });
}

test("rename refuses other errors immediately, and sharing errors are not retried outside Windows", t => {
  const f = setup(t), before = snapshot(f.folder), rename = fs.renameSync;
  const codes = process.platform === "win32" ? ["ENOSPC", "ENOENT", "EEXIST"] : ["EPERM", "EACCES", "EBUSY", "ENOSPC"];
  t.mock.method(Atomics, "wait", () => { assert.fail("this error must not wait"); });
  for (const code of codes) {
    let attempts = 0;
    const problem = Object.assign(new Error(`permanent ${code}`), { code });
    fs.renameSync = (() => { attempts++; throw problem; }) as typeof rename; syncBuiltinESMExports();
    try { assert.throws(() => applyDoclingCorrections(f.folder), error => error === problem); }
    finally { fs.renameSync = rename; syncBuiltinESMExports(); }
    assert.equal(attempts, 1); assert.deepEqual(snapshot(f.folder), before);
    assert.deepEqual(readdirSync(f.root).sort(), ["result", "source.json"]);
  }
});

function includesError(error: unknown, expected: Error): boolean {
  return error === expected || (error instanceof AggregateError && error.errors.some(cause => includesError(cause, expected))) ||
    (error instanceof Error && includesError(error.cause, expected));
}

for (const failure of ["staging", "backup", "rollback"] as const) test(`${failure} cleanup failure still releases the correction lock and preserves diagnostics`, t => {
  const f = setup(t), before = snapshot(f.folder), rename = fs.renameSync, remove = fs.rmSync;
  const publicationError = new Error("injected publication failure"), rollbackError = new Error("injected rollback failure");
  const cleanupError = Object.assign(new Error("injected EPERM cleanup failure"), { code: "EPERM" });
  const lock = path.join(f.root, ".result.corrections.lock");
  let retained: string | undefined, previous: string | undefined;
  fs.renameSync = ((from, to) => {
    if (String(to).includes(".previous-")) previous = String(to);
    if (failure !== "backup" && String(from).includes(".corrections-") && String(to) === f.folder) throw publicationError;
    if (failure === "rollback" && String(from).includes(".previous-") && String(to) === f.folder) throw rollbackError;
    return rename(from, to);
  }) as typeof rename;
  fs.rmSync = ((file, options) => {
    if (String(file).includes(failure === "backup" ? ".previous-" : ".corrections-")) { retained = String(file); throw cleanupError; }
    return remove(file, options);
  }) as typeof remove;
  syncBuiltinESMExports();
  let problem: unknown;
  try {
    assert.throws(() => addDoclingCorrection(f.folder, approval("depth", 0, { operation: "heading", value: { level: 2 } })), error => { problem = error; return true; });
  } finally { fs.renameSync = rename; fs.rmSync = remove; syncBuiltinESMExports(); }
  assert.equal(fs.existsSync(lock), false, "cleanup of a sibling must not prevent lock release");
  assert.ok(retained && fs.existsSync(retained));
  assert.ok(problem instanceof Error); assert.ok(problem.message.includes(retained));
  assert.ok(includesError(problem, cleanupError));
  assert.ok(problem instanceof AggregateError);
  assert.equal(problem instanceof PublishedCorrectionCleanupError, failure === "backup", "only a successfully published generation can report published cleanup failure");
  if (failure === "backup") {
    assert.match(problem.message, /published/i);
    assert.deepEqual(snapshot(retained), before);
    assert.ok(blocks(readFileSync(path.join(f.folder, "document.md"), "utf8")).some(b => b.block === "heading" && b.level === 2));
  } else {
    assert.ok(includesError(problem, publicationError)); assert.match(problem.message, /injected publication failure/);
    if (failure === "rollback") {
      assert.ok(includesError(problem, rollbackError)); assert.match(problem.message, /injected rollback failure/);
      assert.ok(previous && fs.existsSync(previous)); assert.ok(problem.message.includes(previous));
      assert.deepEqual(snapshot(previous), before);
      assert.equal(fs.existsSync(f.folder), false);
      rename(previous, f.folder); // Test-only manual recovery of the retained generation.
    } else assert.deepEqual(snapshot(f.folder), before);
  }
  applyDoclingCorrections(f.folder); // An ordinary later request is no longer blocked.
  assert.ok(fs.existsSync(retained), "leftover siblings are reported, not silently recovered by a later request");
});

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
