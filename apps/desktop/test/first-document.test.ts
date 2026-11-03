import { syncBuiltinESMExports } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { firstDocument } from "../src/first-document.ts";

test("start-up skips malformed paths before I/O and accepts valid Unicode names", (t) => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "litzio-startup-"));
  const valid = path.join(dir, "한글😀�.md");
  fs.writeFileSync(valid, "sentinel");
  const exists = t.mock.method(fs, "existsSync");
  const stat = t.mock.method(fs, "statSync");
  const warning = t.mock.fn<(message: string) => void>();
  syncBuiltinESMExports();
  try {
    const source = fileURLToPath(new URL("../../editor/samples", import.meta.url));
    fs.cpSync(source, path.join(dir, "sample"), { recursive: true });
    const first = firstDocument([path.join(dir, "X\uD800Y.md"), valid], dir, dir, warning);
    assert.equal(first.document, valid);
    assert.ok(first.samples);
    assert.ok(exists.mock.calls.every(call => !String(call.arguments[0]).includes("X\uD800Y")));
    assert.deepEqual(stat.mock.calls.map(call => call.arguments), [[valid]]);
    assert.deepEqual(warning.mock.calls.map(call => call.arguments),
      [["Ignoring start-up document: Invalid Unicode: unpaired surrogate; nothing was written"]]);
    exists.mock.resetCalls(); stat.mock.resetCalls();
    assert.deepEqual(firstDocument([path.join(dir, "X\uDC00Y.md")], dir, dir, warning), { samples: first.samples });
    assert.ok(exists.mock.calls.every(call => !String(call.arguments[0]).includes("X\uDC00Y")));
    assert.equal(stat.mock.callCount(), 0);
    const plain = path.join(dir, "notes.TXT"), other = path.join(dir, "data.json");
    fs.writeFileSync(plain, "plain text"); fs.writeFileSync(other, "{}");
    assert.equal(firstDocument([other, plain], dir, dir, warning).document, plain);
    assert.deepEqual(warning.mock.calls.map(call => call.arguments), Array(2).fill(
      ["Ignoring start-up document: Invalid Unicode: unpaired surrogate; nothing was written"]));
  } finally {
    exists.mock.restore(); stat.mock.restore();
    syncBuiltinESMExports();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("each startup replaces sample edits and added files with the bundled originals", () => sampleFixture(({dir,copy,source,warning,warnings}) => {
  // No ownership or historical layout is required for this disposable sample directory.
  fs.mkdirSync(copy);
  fs.writeFileSync(path.join(copy, "personal.md"), "added file");
  const first = firstDocument([], dir, dir, warning);
  assert.ok(first.samples);
  for (const language of ["ko", "en"] as const) fs.writeFileSync(first.samples[language], `edited ${language}`);
  fs.mkdirSync(path.join(copy, "extra"));
  fs.writeFileSync(path.join(copy, "extra", "notes.md"), "added notes");
  assert.deepEqual(firstDocument([], dir, dir, warning), first);
  assert.deepEqual(snapshot(copy), snapshot(source), "all bundled files restored, extra entries removed");
  assert.deepEqual(warnings, []);
  assert.deepEqual(fs.readdirSync(dir).sort(), ["document.md", "sample", "sample-native-v1"], "no staging or backup leftovers");
}));

function sampleFixture(run: (fixture: { dir: string; copy: string; source: string; valid: string; warning: (message: string) => void; warnings: string[] }) => void): void {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "litzio-sample-safety-"));
  try {
    fs.cpSync(fileURLToPath(new URL("../../editor/samples", import.meta.url)), path.join(dir, "sample"), { recursive: true });
    const valid = path.join(dir, "document.md");
    fs.writeFileSync(valid, "---\nlitzio: 1\n---\n\n# My document\n");
    const warnings: string[] = [];
    run({ dir, source: path.join(dir, "sample"), copy: path.join(dir, "sample-native-v1"), valid, warnings, warning: message => warnings.push(message) });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function snapshot(folder: string): [string, string][] {
  return fs.readdirSync(folder, { recursive: true, encoding: "utf8" }).sort().map(name => {
    const file = path.join(folder, name);
    return [name, fs.statSync(file).isDirectory() ? "directory" : fs.readFileSync(file).toString("base64")];
  });
}

test("destination, ancestor and nested junctions stay intact without touching their targets", () => {
  for (const location of ["destination", "ancestor", "nested"]) sampleFixture(({dir,copy,source,valid,warning}) => {
    // Every destructive fixture is under this test's OS temporary root, outside the repository.
    const outside = path.join(dir, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "personal.md"), "outside personal work");
    let userData = dir;
    let link = copy;
    if (location === "ancestor") {
      userData = path.join(dir, "linked-parent"); link = userData;
      fs.mkdirSync(path.join(outside, "sample-native-v1"));
      fs.writeFileSync(path.join(outside, "sample-native-v1", "technical-document.md"), "edited legacy");
      fs.writeFileSync(path.join(outside, "sample-native-v1", "diagram.svg"), "diagram");
    }
    if (location === "nested") {
      assert.ok(firstDocument([], dir, dir, warning).samples);
      link = path.join(copy, "ko", "assets");
      fs.rmSync(link, {recursive:true});
    }
    fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    const before = snapshot(outside);
    assert.deepEqual(firstDocument([valid], userData, dir, warning), {document:valid,sampleProblem:"unavailable"});
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true, "the junction itself is preserved");
    assert.deepEqual(snapshot(outside), before, "the external target is preserved");
  });
});

test("failed sample copies leave argument documents usable, old edits intact and no partial offer", () => {
  for (const existing of [false,true]) sampleFixture(({dir,copy,source,valid,warning,warnings}) => {
    if (existing) {
      const initial = firstDocument([], dir, dir, warning);
      assert.ok(initial.samples);
      fs.writeFileSync(initial.samples.ko, "edited sample");
    }
    const before = existing ? snapshot(copy) : undefined;
    fs.unlinkSync(path.join(source, "en/references.bib"));
    assert.deepEqual(firstDocument([valid], dir, dir, warning), {document:valid,sampleProblem:"unavailable"});
    assert.deepEqual(firstDocument([], dir, dir, warning), {sampleProblem:"unavailable"}, "empty startup also continues without advertising partial paths");
    assert.ok(warnings.at(-1)?.includes("references.bib"));
    if (before) assert.deepEqual(snapshot(copy), before);
    else assert.equal(fs.existsSync(copy), false);
    assert.deepEqual(fs.readdirSync(dir).sort(), existing ? ["document.md","sample","sample-native-v1"] : ["document.md","sample"], "incomplete staging folders are cleaned");
  });
});

test("failed staged installation restores the old sample and never advertises a failed installation", (t) => sampleFixture(({dir,copy,source,valid,warning}) => {
  assert.ok(firstDocument([], dir, dir, warning).samples);
  const before = snapshot(copy);
  const rename = fs.renameSync;
  const mocked = t.mock.method(fs, "renameSync", (...[from, to]: Parameters<typeof fs.renameSync>) => {
    if (String(from).includes(".litzio-sample-stage-") && !String(from).endsWith("-previous") && to === copy) throw new Error("injected installation failure");
    return rename(from,to);
  });
  syncBuiltinESMExports();
  try {
    assert.deepEqual(firstDocument([valid], dir, dir, warning), {document:valid,sampleProblem:"unavailable"});
    assert.deepEqual(snapshot(copy), before);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["document.md","sample","sample-native-v1"]);
  } finally { mocked.mock.restore(); syncBuiltinESMExports(); }
}));
