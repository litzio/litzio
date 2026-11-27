/**
 * Question 2: one-pass costs, median of N runs in one Node process (after warm-up).
 * Core: public parse (MyST parse + admission + canonical write preflight), its internal MyST
 * parse alone, the read model projection and public serialize (canonical write + readback guards).
 * Profiles: remark parse to mdast, mdast → model, model → Markdown, and a guarded write
 * (write + re-read + compare) comparable in intent to Core's readback check.
 */
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { getEditableDocument, parse, serialize } from "../../../packages/core/src/index.ts";
import { parse as mystParse } from "../../../packages/core/src/myst/parse.ts";
import { coreModel } from "./model.ts";
import { syntheticDocuments } from "./corpus.ts";
import { canonicalJson } from "./roundtrip.ts";
import * as directiveFormat from "./directive/format.ts";
import * as directiveRead from "./directive/read.ts";
import * as directiveWrite from "./directive/write.ts";
import * as externalFormat from "./external/format.ts";
import * as externalRead from "./external/read.ts";
import * as externalWrite from "./external/write.ts";

const median = (values: number[]) => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
function time(runs: number, f: () => unknown): number {
  for (let i = 0; i < 2; i++) f();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) { const t = performance.now(); f(); samples.push(performance.now() - t); }
  return Math.round(median(samples) * 10) / 10;
}

const sizes = (process.argv[2] ?? "2300,5000").split(",").map(Number);
const runs = Number(process.argv[3] ?? 9);
const report: Record<string, unknown> = { node: process.version, runs, unit: "ms (median)" };
for (const { name, source } of syntheticDocuments(sizes)) {
  const canonical = serialize(parse(source));
  const document = parse(canonical);
  const model = coreModel(document, canonical);
  const row: Record<string, unknown> = { bytes: Buffer.byteLength(canonical), blocks: model.blocks.length };
  row.core = {
    "MyST parse only (internal)": time(runs, () => mystParse(canonical)),
    "parse (public: + admission + preflight)": time(runs, () => parse(canonical)),
    "read model (getEditableDocument)": time(runs, () => getEditableDocument(document)),
    "serialize (public: canonical write + guards)": time(runs, () => serialize(document)),
  };
  const profiles = {
    directive: { format: directiveFormat, read: directiveRead, write: directiveWrite },
    external: { format: externalFormat, read: externalRead, write: externalWrite },
  };
  for (const [key, { format, read, write }] of Object.entries(profiles)) {
    const markdown = write.writeDocument(model);
    const tree = format.parseMarkdown(markdown);
    const mdast = write.modelToMdast(model);
    row[key] = {
      bytes: Buffer.byteLength(markdown),
      "remark parse → mdast": time(runs, () => format.parseMarkdown(markdown)),
      "mdast → model": time(runs, () => read.mdastToModel(tree, markdown)),
      "read total": time(runs, () => read.readDocument(markdown)),
      "model → mdast": time(runs, () => write.modelToMdast(model)),
      "mdast → Markdown": time(runs, () => format.stringifyMarkdown(mdast as any)),
      "write total": time(runs, () => write.writeDocument(model)),
      "guarded write (write + re-read + compare)": time(runs, () => {
        const out = write.writeDocument(model);
        if (canonicalJson(read.readDocument(out).blocks) !== canonicalJson(model.blocks)) throw new Error("guard");
      }),
    };
  }
  report[name] = row;
  console.log(name, JSON.stringify(row));
}
writeFileSync(new URL("../results/bench-js.json", import.meta.url), JSON.stringify(report, null, 1) + "\n");
