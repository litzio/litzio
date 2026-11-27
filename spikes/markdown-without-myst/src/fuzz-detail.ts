/**
 * Edit fuzz: random edits through Core operations on base documents. Whatever Core's canonical
 * write accepts is then round-tripped through the candidate format (same check as roundtrip.ts).
 * Answers "can the new format hold everything Core can hold", beyond the fixed corpus.
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as core from "../../../packages/core/src/index.ts";
import { roundTrip, summarize, type Result } from "./roundtrip.ts";
import { PROFILES } from "./profiles.ts";

type Inline = core.InlineContent;

function random(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
}

const TOKENS = [
  "a", "word", " ", "  ", "*", "_", "**", "__", "~", "~~", "`", "``", "$", "$$", "\\", "\\*", "[", "]", "(", ")", "{", "}",
  ":", ":sub", ":eq[x]", ":note", "::", ":::", ":::note", "10:30", "#", "# h", "- ", "* ", "+ ", "1. ", "1) ", "> ", "|", "<", ">",
  "<br>", "<b>", "&", "&amp;", "&#42;", "!", "![x](y)", "^", "[^x]", "[x]: y", "@kim", "[@key]", "%", "% c", "+++", "(lab)=",
  "한글", "😀", "\u00a0", "\t", "http://example.org/a_b", "www.example.org", "---", "===", "{eq}`a`", "{style=lower-alpha}",
  "\n", "\n- item", "\n1. item", "\n:::note", "\n> q", "\n# h", "\n    code", "\n(target)=", "\n|a|b|", "\n$$",
];
const URLS = ["https://example.org", "https://example.org/a_(b)", "https://example.org/a b", "#sec-intro", "./x.md", "mailto:a@b.c", "https://example.org/<x>", "https://e.org/?a=1&b=2"];
const LABELS = ["eq-a", "A B", "sec-intro", "fig-free", "x.y", "a\"b", "a}b", "한글", "a#b", "tab-fixed"];

function inline(choose: () => number, depth: number, marks: Set<string>): Inline[] {
  const pick = <T,>(list: readonly T[]) => list[Math.floor(choose() * list.length)];
  const out: Inline[] = [];
  const count = 1 + Math.floor(choose() * 4);
  for (let i = 0; i < count; i++) {
    const r = choose();
    if (r < 0.45 || depth > 2) out.push({ kind: "text", text: Array.from({ length: 1 + Math.floor(choose() * 3) }, () => pick(TOKENS)).join("") });
    else if (r < 0.62) {
      const kind = pick(["strong", "emphasis", "delete", "subscript", "superscript"] as const);
      if (marks.has(kind) || ((kind === "subscript" || kind === "superscript") && (marks.has("subscript") || marks.has("superscript")))) continue;
      out.push({ kind, children: inline(choose, depth + 1, new Set([...marks, kind])) } as Inline);
    } else if (r < 0.7) {
      if (marks.has("link")) continue;
      out.push({ kind: "link", url: pick(URLS), ...(choose() < 0.3 ? { title: pick(["T", "a \"q\"", "x)y"]) } : {}), children: inline(choose, depth + 1, new Set([...marks, "link"])) });
    } else if (r < 0.77) out.push({ kind: "math", value: pick(["x", "a_b", "\\$", "a$b", "x^{2}", "\\frac{1}{2}", "`x`", "a}b"]) });
    else if (r < 0.84) out.push({ kind: "code", value: pick(["x", "`", "a`b", " x ", "``", "$x$", "|"]) });
    else if (r < 0.88) out.push({ kind: "break" });
    else if (r < 0.94) { if (!marks.size || !marks.has("subscript") && !marks.has("superscript")) out.push({ kind: "reference", role: pick(["eq", "numref", "ref"] as const), label: pick(LABELS) }); }
    else { if (!marks.has("subscript") && !marks.has("superscript")) out.push({ kind: "citation", role: pick(["cite", "cite:t", "cite:p"] as const), keys: pick([["alpha"], ["alpha", "beta"], ["a-b_c"]]) }); }
  }
  return out;
}

type Edit = (document: core.Document, choose: () => number) => core.Document;

function editsFor(document: core.Document): Edit[] {
  const edits: Edit[] = [];
  const blocks = core.getEditableDocument(document).blocks;
  for (const block of blocks) {
    const path = block.path;
    const content = (choose: () => number) => inline(choose, 0, new Set());
    if (block.block === "paragraph") edits.push((d, c) => core.updateParagraphInlineContent(d, path, content(c)));
    if (block.block === "heading") edits.push((d, c) => core.updateHeadingInlineContent(d, path, content(c)));
    if (block.block === "admonition") edits.push((d, c) => core.updateAdmonitionInlineContent(d, path, content(c)));
    if (block.block === "quote") edits.push((d, c) => core.updateQuoteInlineContent(d, path, content(c)));
    if (block.block === "footnote") edits.push((d, c) => core.updateFootnoteDefinition(d, path, content(c)));
    if (block.block === "table" && !block.grid) {
      for (const row of block.rows) for (const cell of row.cells) edits.push((d, c) => core.updateTableCell(d, cell.path, content(c)));
      edits.push((d, c) => core.updateTableCaption(d, path, content(c)));
      edits.push((d, c) => core.updateLabel(d, path, LABELS[Math.floor(c() * LABELS.length)]));
    }
    if (block.block === "figure") {
      edits.push((d, c) => core.updateFigure(d, path, { caption: content(c) }));
      edits.push((d, c) => core.updateFigure(d, path, { imageUrl: URLS[Math.floor(c() * URLS.length)].replace(/^#/, "img/") + ".png", imageAlt: TOKENS[Math.floor(c() * TOKENS.length)].replace(/\n/g, "") }));
      edits.push((d, c) => core.updateLabel(d, path, LABELS[Math.floor(c() * LABELS.length)]));
    }
    if (block.block === "equation") {
      edits.push((d, c) => core.updateEquationLatex(d, path, block.latex, ["x", "a$$b", "\\begin{a}\n$$\n\\end{a}", "}", "x\n\ny", "{#id}"][Math.floor(c() * 6)]));
      edits.push((d, c) => core.updateLabel(d, path, LABELS[Math.floor(c() * LABELS.length)]));
      edits.push((d, c) => core.updateEnumerator(d, path, ["7a", "A.1", "x y", "\"q\"", "}"][Math.floor(c() * 5)]));
    }
    if (block.block === "code") edits.push((d, c) => core.updateCodeBlock(d, path, { code: ["```", "~~~", "````x", "a\n\n\nb", "  indented", "$$", ":::"][Math.floor(c() * 7)], language: ["", "py", "c++", "mermaid"][Math.floor(c() * 4)] }));
    if (block.block === "list") {
      edits.push((d, c) => {
        const items = block.items.map(item => ({ ...item, content: content(c) }));
        return core.updateList(d, path, { ...block, items } as core.ListContent);
      });
    }
    if (block.block === "target") edits.push((d, c) => core.updateLabel(d, path, ["sec-a", "a.b", "x+y", "@a", "a|b"][Math.floor(c() * 5)]));
  }
  return edits;
}

const citeAsT = (model: any) => JSON.parse(JSON.stringify(model, (k, v) => v && v.kind === "citation" && v.role === "cite" ? { ...v, role: "cite:t" } : v));
const base = PROFILES["external-renamed"];
const profile = { ...base, name: "probe", prepare: (m: any) => citeAsT(base.prepare!(m)) };
const bases = ["fixtures/feature-matrix.myst.md", "../../packages/core/test/fixtures/technical-document.canonical.md"]
  .map(file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8"))
  .map(source => source.startsWith("---\n") ? source : `---\nlitzio: 1\n---\n\n${source}`);
const choose = random(Number(process.argv[3] ?? 7));
const seen = new Map<string, number>();
for (let i = 0; i < Number(process.argv[2] ?? 1500); i++) {
  const b = core.parse(bases[i % bases.length]);
  const edits = editsFor(b);
  let document = b;
  for (let n = 0; n < 1 + Math.floor(choose() * 3); n++) { try { document = edits[Math.floor(choose() * edits.length)](document, choose); } catch {} }
  let source: string;
  try { source = core.serialize(core.reconcileEndnotes(b, document)); } catch { continue; }
  const r = roundTrip({ name: "x", source }, profile as any);
  if (r.status === "same") continue;
  const key = r.status + " " + (r.category ?? "") + " " + (r.detail ?? "").replace(/\/blocks\/\d+/, "").replace(/\d+/g, "#").slice(0, 60);
  seen.set(key, (seen.get(key) ?? 0) + 1);
  if (seen.get(key) === 1) console.log(r.status, r.category ?? "", (r.detail ?? "").slice(0, 260));
}
console.log([...seen].sort((a, b) => b[1] - a[1]).slice(0, 25));
