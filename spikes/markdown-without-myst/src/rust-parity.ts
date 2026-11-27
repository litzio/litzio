/**
 * Question 3: does markdown-rs read the same documents into the same mdast?
 * JS: the remark parsers of each profile. Rust: markdown-rs 1.0.0 with the same construct set
 * (rust/src/lib.rs), which has no directive construct. Positions are compared separately
 * (JS offsets are UTF-16 code units, Rust offsets are UTF-8 bytes), on ASCII-only documents.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, serialize } from "../../../packages/core/src/index.ts";
import { coreModel } from "./model.ts";
import { generatedDocuments, nativeDocuments, syntheticDocuments, trackedMarkdown } from "./corpus.ts";
import * as directiveFormat from "./directive/format.ts";
import * as directiveWrite from "./directive/write.ts";
import * as externalFormat from "./external/format.ts";
import * as externalWrite from "./external/write.ts";
import { canonicalJson } from "./roundtrip.ts";

const BINARY = fileURLToPath(new URL("../rust/target/release/mdast.exe", import.meta.url));

/** Structure only: no positions, no remark `data` (hast hints), no null/false-default fields. */
function shape(node: any): any {
  if (Array.isArray(node)) return node.map(shape);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "position" || key === "data" || value === null || value === undefined) continue;
    out[key] = shape(value);
  }
  return out;
}
function positions(node: any, out: string[] = []): string[] {
  if (node?.position) out.push(`${node.type}:${node.position.start.line}.${node.position.start.column}-${node.position.end.line}.${node.position.end.column}`);
  for (const child of node?.children ?? []) positions(child, out);
  return out;
}
const positionExamples: string[] = [];
/** Node types whose start or end position differs (same structure assumed). */
function positionDifferences(a: any, b: any, out: Set<string>): Set<string> {
  const pa = a?.position, pb = b?.position;
  if (pa && pb) {
    if (pa.start.line !== pb.start.line || pa.start.column !== pb.start.column) {
      out.add(`${a.type} start`);
      if (a.type === "text" && positionExamples.length < 4) positionExamples.push(`${JSON.stringify(a.value).slice(0, 40)} js ${pa.start.line}:${pa.start.column} rust ${pb.start.line}:${pb.start.column}`);
    }
    if (pa.end.line !== pb.end.line || pa.end.column !== pb.end.column) out.add(`${a.type} end`);
  }
  (a?.children ?? []).forEach((child: any, i: number) => positionDifferences(child, b?.children?.[i], out));
  return out;
}
function firstDifference(a: any, b: any, path = ""): string {
  if (canonicalJson(a) === canonicalJson(b)) return "";
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const found = firstDifference(a[key], b[key], `${path}/${key}`);
      if (found) return found;
    }
  }
  return `${path}: ${JSON.stringify(a)?.slice(0, 100)} ≠ ${JSON.stringify(b)?.slice(0, 100)}`;
}

type Doc = { set: string; name: string; markdown: string; js: (s: string) => any };
const docs: Doc[] = [];
for (const { name, source } of [...nativeDocuments(), ...generatedDocuments(), ...syntheticDocuments([300, 2300, 5000])]) {
  let model;
  try { const canonical = serialize(parse(source)); model = coreModel(parse(canonical), canonical); } catch { continue; }
  try { docs.push({ set: "directive", name, markdown: directiveWrite.writeDocument(model), js: directiveFormat.parseMarkdown }); } catch { /* unwritable */ }
  try { docs.push({ set: "external", name, markdown: externalWrite.writeDocument(model), js: externalFormat.parseMarkdown }); } catch { /* unwritable */ }
}
for (const { name, source } of trackedMarkdown()) docs.push({ set: "repository .md", name, markdown: source.replace(/\r\n/g, "\n"), js: externalFormat.parseMarkdown });

const dir = join(tmpdir(), `litzio-spike-${process.pid}`);
mkdirSync(dir, { recursive: true });
const paths = docs.map((doc, i) => { const path = join(dir, `${i}.md`); writeFileSync(path, doc.markdown); return path; });
const lines = execFileSync(BINARY, { input: paths.join("\n") + "\n", maxBuffer: 1 << 30, encoding: "utf8" }).trimEnd().split("\n");
rmSync(dir, { recursive: true, force: true });

const report: Record<string, any> = {};
const examples: Record<string, string[]> = {};
docs.forEach((doc, i) => {
  const row = report[doc.set] ??= { documents: 0, sameStructure: 0, asciiDocuments: 0, samePositions: 0, differences: {} as Record<string, number> };
  row.documents++;
  const rust = JSON.parse(lines[i]);
  const js = doc.js(doc.markdown);
  const difference = firstDifference(shape(js), shape(rust));
  if (!difference) row.sameStructure++;
  else {
    const key = difference.replace(/\/children\/\d+/g, "").replace(/:.*$/s, "") + (/textDirective|leafDirective|containerDirective/.test(difference) ? " (directive)" : "");
    row.differences[key] = (row.differences[key] ?? 0) + 1;
    (examples[doc.set] ??= []).length < 12 && examples[doc.set].push(`${doc.name}: ${difference}`);
  }
  if (/^[\x00-\x7f]*$/.test(doc.markdown)) {
    row.asciiDocuments++;
    if (canonicalJson(positions(js)) === canonicalJson(positions(rust))) row.samePositions++;
    else if (!difference) for (const key of positionDifferences(js, rust, new Set())) (row.positionDifferences ??= {})[key] = (row.positionDifferences[key] ?? 0) + 1;
  }
});
const out = { markdownRs: "1.0.0", report, examples, positionExamples };
writeFileSync(new URL("../results/rust-parity.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify(out, null, 1));
