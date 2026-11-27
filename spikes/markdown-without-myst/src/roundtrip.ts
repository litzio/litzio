/**
 * Question 1: Core (MyST) → comparison model A → candidate Markdown N → remark → model B.
 * A and B must be deep-equal (object key order ignored); N must be stable on a second write.
 */
import { writeFileSync } from "node:fs";
import { parse, serialize } from "../../../packages/core/src/index.ts";
import { coreModel, type Block, type Model } from "./model.ts";
import { Unsupported } from "./directive/read.ts";
import { PROFILES, type Profile } from "./profiles.ts";
import { generatedDocuments, nativeDocuments, syntheticDocuments, type Input } from "./corpus.ts";

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}

function firstDifference(a: unknown, b: unknown, path = ""): string | undefined {
  if (canonicalJson(a) === canonicalJson(b)) return undefined;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const found = firstDifference((a as any)[key], (b as any)[key], `${path}/${key}`);
      if (found) return found;
    }
  }
  return `${path}: ${JSON.stringify(a)?.slice(0, 120)} ≠ ${JSON.stringify(b)?.slice(0, 120)}`;
}

export type Result = {
  name: string; status: "same" | "core-refused" | "write-failed" | "read-refused" | "different" | "unstable";
  detail?: string; category?: string; blocks?: Record<string, number>; differing?: Record<string, number>;
  /** Blocks the profile cannot write, by reason; the rest of the document is still round-tripped. */
  unwritable?: Record<string, number>; unwritableDetail?: string[];
  /** The written Markdown, kept only when it could not be read back. */
  markdown?: string;
};

const categoryOf = (error: unknown) => error instanceof Unsupported ? error.category : "error";

/** Drop the blocks the profile refuses to write, recording why. A target is tried with its heading. */
function writableBlocks(a: Model, profile: Profile, unwritable: Record<string, number>, details: string[]): Model {
  const blocks = a.blocks.filter((block, index) => {
    const context = block.block === "target" ? a.blocks.slice(index, index + 2) : [block];
    try { profile.writeDocument({ frontmatter: a.frontmatter, blocks: context }); return true; } catch (error) {
      const key = `${kindOf(block)}:${categoryOf(error)}`;
      unwritable[key] = (unwritable[key] ?? 0) + 1;
      if (details.length < 5) details.push(String(error).slice(0, 160));
      return false;
    }
  });
  return { ...a, blocks };
}

export function roundTrip({ name, source }: Input, profile: Profile, keep?: (model: Model, markdown: string) => void): Result {
  let a: Model;
  try {
    const canonical = serialize(parse(source));
    a = coreModel(parse(canonical), canonical);
  } catch (error) { return { name, status: "core-refused", detail: String(error).slice(0, 160) }; }
  try { a = profile.prepare?.(a) ?? a; } catch (error) {
    return { name, status: "write-failed", category: error instanceof Unsupported ? error.category : "error", detail: String(error).slice(0, 200) };
  }
  const { readDocument, writeDocument } = profile;
  const blocks: Record<string, number> = {};
  for (const block of a.blocks) blocks[kindOf(block)] = (blocks[kindOf(block)] ?? 0) + 1;
  let markdown: string;
  const unwritable: Record<string, number> = {};
  const unwritableDetail: string[] = [];
  try { markdown = writeDocument(a); } catch {
    a = writableBlocks(a, profile, unwritable, unwritableDetail);
    try { markdown = writeDocument(a); } catch (error) {
      return { name, status: "write-failed", blocks, unwritable, category: categoryOf(error), detail: String(error).slice(0, 200) };
    }
  }
  const lost = Object.keys(unwritable).length ? { unwritable, unwritableDetail } : {};
  let b: Model;
  try { b = readDocument(markdown); } catch (error) {
    return { name, status: "read-refused", blocks, ...lost, category: categoryOf(error), detail: String(error).slice(0, 200), markdown };
  }
  keep?.(a, markdown);
  const differing: Record<string, number> = {};
  let detail: string | undefined;
  if (canonicalJson(a.frontmatter) !== canonicalJson(b.frontmatter)) { differing.frontmatter = 1; detail = firstDifference(a.frontmatter, b.frontmatter, "/frontmatter"); }
  const count = Math.max(a.blocks.length, b.blocks.length);
  for (let i = 0; i < count; i++) {
    const found = firstDifference(a.blocks[i], b.blocks[i], `/blocks/${i}`);
    if (found) {
      const kind = a.blocks[i] ? kindOf(a.blocks[i]) : "extra";
      differing[kind] = (differing[kind] ?? 0) + 1;
      detail ??= found;
    }
  }
  if (Object.keys(differing).length) return { name, status: "different", blocks, ...lost, differing, detail };
  const again = writeDocument(b);
  if (again !== markdown) return { name, status: "unstable", blocks, ...lost, detail: firstDifference(markdown.split("\n"), again.split("\n")) };
  return { name, status: "same", blocks, ...lost };
}

function kindOf(block: Block): string {
  if (block.block === "table") return block.grid === "complex" ? "table(complex)" : "table";
  if (block.block === "list") return block.checklist ? "list(checklist)" : block.ordered ? "list(ordered)" : "list";
  if (block.block === "figure") return `figure(${block.contentKind})`;
  return block.block;
}

export function summarize(results: Result[]) {
  const status: Record<string, number> = {};
  const blocks: Record<string, { total: number; differing: number }> = {};
  const failures: Record<string, number> = {};
  const unwritable: Record<string, number> = {};
  let documentsWithUnwritable = 0;
  for (const result of results) {
    if (result.unwritable) documentsWithUnwritable++;
    for (const [key, n] of Object.entries(result.unwritable ?? {})) unwritable[key] = (unwritable[key] ?? 0) + n;
    status[result.status] = (status[result.status] ?? 0) + 1;
    for (const [kind, n] of Object.entries(result.blocks ?? {})) {
      blocks[kind] ??= { total: 0, differing: 0 };
      blocks[kind].total += n;
      blocks[kind].differing += result.differing?.[kind] ?? 0;
    }
    if (result.status !== "same" && result.status !== "core-refused") {
      const key = `${result.status}${result.category ? `:${result.category}` : ""}`;
      failures[key] = (failures[key] ?? 0) + 1;
    }
  }
  // What differed, without block indexes and values: "/caption/content/1/role" etc.
  const differences: Record<string, number> = {};
  for (const result of results) if (result.status === "different" && result.detail) {
    const key = result.detail.replace(/^\/blocks\/\d+/, "").replace(/\/\d+/g, "/#").replace(/:.*$/s, "")
      + (/role: "cite" ≠ "cite:t"/.test(result.detail) ? " (cite→cite:t)" : "");
    differences[key] = (differences[key] ?? 0) + 1;
  }
  return { documents: results.length, status, failures, differences, documentsWithUnwritable, unwritable, blocks };
}

if (import.meta.main) {
  const profile = PROFILES[process.argv[2] ?? "directive"];
  const sets: Record<string, Input[]> = { native: nativeDocuments(), generated: generatedDocuments(), synthetic: syntheticDocuments() };
  const report: Record<string, unknown> = { profile: profile.name };
  const problems: Result[] = [];
  for (const [set, inputs] of Object.entries(sets)) {
    const results = inputs.map(input => roundTrip(input, profile));
    report[set] = summarize(results);
    problems.push(...results.filter(r => r.status !== "same" && r.status !== "core-refused"));
    if (set === "native") report.nativeRefused = results.filter(r => r.status === "core-refused").map(r => `${r.name}: ${r.detail}`);
  }
  report.problems = problems.slice(0, 60).map(p => ({ name: p.name, status: p.status, category: p.category, differing: p.differing, detail: p.detail }));
  const out = JSON.stringify(report, null, 1);
  writeFileSync(new URL(`../results/roundtrip-${profile.name}.json`, import.meta.url), out + "\n");
  process.stdout.write(out.slice(0, 6000) + "\n");
}
