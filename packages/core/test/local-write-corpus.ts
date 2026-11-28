import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getEditableDocument, LocalWriteBaseline, parse, reconcileEndnotes, serialize, serializeWithReadback,
  updateParagraphInlineContent, updateTableCell, validateStructure, type InlineContent, type LocalWriteEdit,
} from "@litzio/core";
import { semanticDifference, semanticFingerprint } from "../src/myst/fingerprint.ts";
import type { MystDocument } from "../src/myst/tree.ts";
import { EXPECTED_URL, type Expected } from "./writer-bytes-cases.ts";

export const header = "---\nlitzio: 1\n---\n\n";
const text = (value: string): InlineContent[] => value ? [{ kind: "text", text: value }] : [];

function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** Same document mix and seed as the #1983 spike. */
export function synthetic(size: number): string {
  const choose = random(1983 + size);
  const groups = size / 20;
  const paragraphs = Array.from({ length: 13 * groups }, (_, i) => `The measurement record lists the observed value for sample ${i + 1}.`);
  const linked = Math.round(paragraphs.length * 0.05);
  for (let i = 0; i < groups; i++) {
    const index = 4 + Math.floor((i % linked) * (paragraphs.length - 4) / linked);
    paragraphs[index] += ` [Figure](#fig-${i + 1})[^note-${i + 1}].`;
  }
  const headings = Array.from({ length: 2 * groups }, (_, i) => `${"#".repeat(1 + i % 3)} Section ${i + 1}`);
  const lists = Array.from({ length: groups }, (_, i) => `- Sample ${i + 1}\n- Record result`);
  const tables = Array.from({ length: groups }, (_, i) => [
    `:::{table} Sample results ${i + 1}`, "", "| Input | Result |", "| --- | --- |",
    ...Array.from({ length: 10 }, (_, j) => `| Sample ${j + 1} | Pass |`), ":::",
  ].join("\n"));
  const equations = Array.from({ length: groups }, (_, i) => `:::{math}\nx_${i + 1} = 2\n:::`);
  const figures = Array.from({ length: groups }, (_, i) =>
    `:::{figure} samples/example.svg\n:name: fig-${i + 1}\n\nSample diagram ${i + 1}.\n:::`);
  const body = [...paragraphs.slice(4), ...headings, ...lists, ...tables, ...equations, ...figures];
  for (let i = body.length - 1; i > 0; i--) {
    const j = Math.floor(choose() * (i + 1));
    [body[i], body[j]] = [body[j], body[i]];
  }
  // Blank lines alone do not separate adjacent bullet lists.
  for (let i = 1; i < body.length; i++) {
    if (!body[i].startsWith("- ") || !body[i - 1].startsWith("- ")) continue;
    const gap = body.findIndex((item, j) => Math.abs(j - i) > 1 && !item.startsWith("- ") &&
      !body[j - 1]?.startsWith("- ") && !body[j + 1]?.startsWith("- "));
    assert.ok(gap >= 0);
    [body[i], body[gap]] = [body[gap], body[i]];
  }
  const notes = Array.from({ length: groups }, (_, i) => `[^note-${i + 1}]: Synthetic sample note.`);
  return header + [...paragraphs.slice(0, 4), ...body, ...notes].join("\n\n") + "\n";
}

const syntax = [
  "*", "_", "[square]", "|", "#", "<span>", "`", "$", "  ", " 한글 😀",
  " " + "length".repeat(640), " [^note-1]", " [remote][lookup]",
  "\n- item", "\n1. item", "\n:::note", "\n[lookup]: https://example.org", "\n(target)=",
  "\n% comment", "\n+++", "\n---\n", "\n~~~",
];
const variants = [
  (content: InlineContent[]) => [...content, ...text(" corrected")],
  (content: InlineContent[]) => content.map(part => part.kind === "text" ? { ...part, text: part.text.toUpperCase() } : part),
  (content: InlineContent[]) => text(Array.from(content.find(part => part.kind === "text")?.text ?? "")[0] ?? ""),
  () => [],
  (content: InlineContent[]): InlineContent[] => [...content, ...text(" "), { kind: "strong", children: text("verified") }],
  (content: InlineContent[]): InlineContent[] => [...content, ...text(" "), { kind: "math", value: "x^2" }],
  (content: InlineContent[]): InlineContent[] => [...content, ...text(" "), { kind: "link", url: "https://example.org", children: text("source") }],
  (content: InlineContent[]) => content.filter(part => part.kind !== "footnote"),
  (content: InlineContent[]): InlineContent[] => [...content, { kind: "footnote", label: "note-1" }],
  (): InlineContent[] => [
    { kind: "strong", children: text("Precision (A)") }, { kind: "emphasis", children: text("was") }, ...text("measured"),
  ],
  ...syntax.map(suffix => (content: InlineContent[]) => [...content, ...text(suffix)]),
];

type Corpus = { input: string; count?: number };
type Counts = { tests: number; paragraph: number; cell: number; refused: number; skipped: number;
  mismatches: number; fallback: Record<string, number> };
const fingerprint = (document: ReturnType<typeof parse>) => semanticFingerprint(document as unknown as MystDocument);

function compare(name: string, { input, count }: Corpus): Counts {
  const stats: Counts = { tests: 0, paragraph: 0, cell: 0, refused: 0, skipped: 0, mismatches: 0, fallback: {} };
  let source: string, original: ReturnType<typeof parse>;
  try {
    source = serialize(parse(input));
    original = parse(source);
  } catch { return { ...stats, skipped: 1 }; }
  const baseline = LocalWriteBaseline.fromCanonical(source, original);
  const targets = getEditableDocument(original).blocks.flatMap((block): LocalWriteEdit[] => {
    if (block.block === "paragraph" && block.editable) return [{ kind: "paragraph", path: block.path, content: block.content }];
    if (block.block === "table" && !block.grid) return block.rows.flatMap(row =>
      row.cells.filter(cell => cell.editable).map(cell => ({ kind: "cell", path: cell.path, content: cell.content })));
    return [];
  });
  const choose = random(1983);
  const total = count ?? targets.length * variants.length;
  for (let i = 0; i < total && targets.length; i++) {
    const target = targets[count === undefined ? Math.floor(i / variants.length) : Math.floor(choose() * targets.length)];
    const variant = count === undefined ? i % variants.length : i % 4 === 0 ? 0 : Math.floor(choose() * variants.length);
    const edit = { ...target, content: variants[variant](target.content) };
    const local = baseline?.write(edit) ?? { reason: "document-retry" };
    let full: ReturnType<typeof serializeWithReadback> | undefined;
    let refusal: unknown;
    try {
      const document = reconcileEndnotes(original, edit.kind === "paragraph"
        ? updateParagraphInlineContent(original, edit.path, edit.content)
        : updateTableCell(original, edit.path, edit.content));
      validateStructure(document);
      full = serializeWithReadback(document);
    } catch (error) { refusal = error; }
    stats.tests++;
    if (!full) stats.refused++;
    if ("reason" in local) {
      stats.fallback[local.reason] = (stats.fallback[local.reason] ?? 0) + 1;
      if (name === "without-frontmatter" && full) {
        assert.equal(serialize(parse(full.markdown)), full.markdown);
        assert.ok(!full.markdown.startsWith("---\n"), full.markdown);
      }
      continue;
    }
    stats[edit.kind]++;
    const label = `${name}, ${edit.kind} [${edit.path}], variant ${variant}`;
    assert.ok(full, `${label}: full write refused: ${String(refusal)}`);
    assert.equal(local.markdown, full.markdown, label);
    const reread = parse(local.markdown);
    assert.equal(semanticDifference(fingerprint(full.document), fingerprint(reread)), undefined, label);
    assert.equal(serialize(reread), local.markdown, label);
  }
  return stats;
}

export function localWriteCorpus(large: boolean) {
  const expected = JSON.parse(readFileSync(EXPECTED_URL, "utf8")) as Expected;
  const fixtures = Object.entries(expected.fixtures).map(([name, { input }]): [string, Corpus] =>
    [name, { input: input.startsWith("---\n") ? input : header + input, ...(large ? {} : { count: 3 }) }]);
  const ordinaryBody = "First paragraph.\n\nSecond paragraph.\n\n| Input | Result |\n| --- | --- |\n| Signal | Pass |\n";
  const corpus: [string, Corpus][] = [
    ...fixtures,
    ["without-frontmatter", { input: ordinaryBody, ...(large ? {} : { count: 6 }) }],
    ["unmarked-frontmatter", { input: `---\ntitle: Results\n---\n\n${ordinaryBody}`, ...(large ? {} : { count: 6 }) }],
    ["synthetic-300", { input: synthetic(300), count: large ? 400 : 12 }],
    ["synthetic-2300", { input: synthetic(2300), count: large ? 100 : 4 }],
  ];
  return Object.fromEntries(corpus.map(([name, input]) => [name, compare(name, input)]));
}

if (import.meta.main) process.stdout.write(JSON.stringify(localWriteCorpus(true), null, 2) + "\n");
