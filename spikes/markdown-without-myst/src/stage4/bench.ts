/**
 * Stage 4: four paths over the same in-scope synthetic documents, split into read / convert / write.
 *  1 MyST path (Core, JS)   2 remark path (this spike, JS)   3 Rust native (pipeline.exe)   4 Rust WASM from Node
 * Path 4 includes copying UTF-8 in and out of WASM memory, and the model handed to JS as JSON
 * (serde_json → TextDecoder → JSON.parse), as well as JSON.stringify of the model for writing.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { getEditableDocument, parse, serialize } from "../../../../packages/core/src/index.ts";
import { parse as mystParse } from "../../../../packages/core/src/myst/parse.ts";
import { coreModel } from "../model.ts";
import { parseMarkdown, stringifyMarkdown } from "../external/format.ts";
import { mdastToModel, readDocument } from "../external/read.ts";
import { modelToMdast, writeDocument } from "../external/write.ts";
import { canonicalJson } from "../roundtrip.ts";
import { inScopeSynthetic } from "./synthetic.ts";

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return Math.round(s[Math.floor(s.length / 2)] * 10) / 10; };
function time(runs: number, f: () => unknown): number {
  for (let i = 0; i < 2; i++) f();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) { const t = performance.now(); f(); samples.push(performance.now() - t); }
  return median(samples);
}

const root = new URL("../../", import.meta.url);
const pipeline = fileURLToPath(new URL("rust/target/release/pipeline.exe", root));
const wasmBytes = readFileSync(new URL("rust/target/wasm32-unknown-unknown/release/litzio_markdown_spike.wasm", root));
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const wasm = instance.exports as any;
const encoder = new TextEncoder(), decoder = new TextDecoder();
const copyIn = (text: string): [number, number] => {
  const bytes = encoder.encode(text);
  const ptr = wasm.alloc(bytes.length);
  new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
  return [ptr, bytes.length];
};
const copyOut = () => decoder.decode(new Uint8Array(wasm.memory.buffer, wasm.out_ptr(), wasm.out_len()));
const wasmRead = (markdown: string) => { const [p, n] = copyIn(markdown); if (wasm.parse(p, n)) throw new Error(copyOut()); };
const wasmConvert = () => { if (wasm.convert()) throw new Error(copyOut()); return JSON.parse(copyOut()); };
const wasmWrite = (model: unknown, guarded = false) => { const [p, n] = copyIn(JSON.stringify(model)); if (wasm.write(p, n, guarded ? 1 : 0)) throw new Error(copyOut()); return copyOut(); };

const runs = Number(process.argv[2] ?? 9);
const scratch = process.argv[3];
mkdirSync(scratch, { recursive: true });
const report: Record<string, unknown> = { node: process.version, runs, unit: "ms, median" };
for (const size of [2300, 5000]) {
  const myst = serialize(parse(inScopeSynthetic(size)));
  const document = parse(myst);
  const model = coreModel(document, myst);
  const markdown = writeDocument(model);
  const tree = parseMarkdown(markdown);
  const mdast = modelToMdast(model);
  const row: Record<string, unknown> = { blocks: model.blocks.length, mystBytes: Buffer.byteLength(myst), markdownBytes: Buffer.byteLength(markdown) };

  row["1 MyST (Core, JS)"] = {
    read: time(runs, () => mystParse(myst)),
    convert: time(runs, () => getEditableDocument(document)),
    write: time(runs, () => serialize(document)),
    "public parse (read + admission + write preflight)": time(runs, () => parse(myst)),
    note: "write is Core's canonical write, which always re-parses and compares its output",
  };
  row["2 remark (JS)"] = {
    read: time(runs, () => parseMarkdown(markdown)),
    convert: time(runs, () => mdastToModel(tree, markdown)),
    write: time(runs, () => stringifyMarkdown(modelToMdast(model) as any)),
    "write (mdast → Markdown only)": time(runs, () => stringifyMarkdown(mdast as any)),
    "guarded write": time(runs, () => { const out = writeDocument(model); if (canonicalJson(readDocument(out).blocks) !== canonicalJson(model.blocks)) throw new Error("guard"); }),
  };

  const file = `${scratch}/stage4-${size}.md`;
  writeFileSync(file, markdown);
  const native = JSON.parse(execFileSync(pipeline, [file, String(runs), `${scratch}/stage4-${size}.rust.json`, `${scratch}/stage4-${size}.rust.md`], { encoding: "utf8" }));
  row["3 Rust native"] = native;

  wasmRead(markdown);
  const wasmModel = wasmConvert();
  const wasmMarkdown = wasmWrite(wasmModel);
  row["4 Rust WASM (Node)"] = {
    read: time(runs, () => wasmRead(markdown)),
    convert: time(runs, () => wasmConvert()),
    write: time(runs, () => wasmWrite(wasmModel)),
    "guarded write": time(runs, () => wasmWrite(wasmModel, true)),
  };

  const nativeMarkdown = readFileSync(`${scratch}/stage4-${size}.rust.md`, "utf8");
  const nativeModel = JSON.parse(readFileSync(`${scratch}/stage4-${size}.rust.json`, "utf8"));
  row.checks = {
    "2 = 3 Markdown bytes": nativeMarkdown === markdown,
    "2 = 4 Markdown bytes": wasmMarkdown === markdown,
    "1 = 2 model": canonicalJson(readDocument(markdown).blocks) === canonicalJson(model.blocks),
    "2 = 3 model": canonicalJson(nativeModel.blocks) === canonicalJson(model.blocks),
    "2 = 4 model": canonicalJson(wasmModel.blocks) === canonicalJson(model.blocks),
  };
  report[`in-scope-${size}`] = row;
  console.log(size, JSON.stringify(row));
}
writeFileSync(new URL("results/bench-stage4.json", root), JSON.stringify(report, null, 1) + "\n");
