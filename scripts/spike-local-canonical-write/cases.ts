import type { InlineContent } from "../../packages/core/src/inline.ts";
import { projectInlineContent } from "../../packages/core/src/inline.ts";
import * as ops from "../../packages/core/src/operations.ts";
import { figureCaptionContent } from "../../packages/core/src/figure.ts";
import { supportedFigureContent } from "../../packages/core/src/myst/figure.ts";
import { supportedListContent } from "../../packages/core/src/myst/list.ts";
import { tableOf, tableCaptionParagraph } from "../../packages/core/src/myst/table.ts";
import type { MystNode } from "../../packages/core/src/myst/tree.ts";
import type { Edit, EditKind, Snapshot } from "./local.ts";

export const header = "---\nlitzio: 1\n---\n\n";
const prose = "The measurement record lists the observed value for this sample.";
const text = (value: string): InlineContent[] => [{ kind: "text", text: value }];
const plain = (content: InlineContent[]) => content.map(part => part.kind === "text" ? part.text : "").join("");

export function random(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

export function synthetic(size: number): string {
  const choose = random(1983 + size);
  const groups = size / 20;
  const paragraphs = Array.from({ length: 13 * groups }, (_, i) => prose + " Entry " + (i + 1) + ".");
  const linked = Math.round(paragraphs.length * 0.05);
  for (let i = 0; i < groups; i++) {
    const index = 4 + Math.floor((i % linked) * (paragraphs.length - 4) / linked);
    paragraphs[index] += " [Figure](#fig-" + (i + 1) + ")[^note-" + (i + 1) + "].";
  }
  const headings = Array.from({ length: 2 * groups }, (_, i) => "#".repeat(1 + i % 3) + " Section " + (i + 1));
  const lists = Array.from({ length: groups }, (_, i) => "- Sample " + (i + 1) + "\n- Record result");
  const tables = Array.from({ length: groups }, (_, i) => [
    ":::{table} Sample results " + (i + 1), "", "| Input | Result |", "| --- | --- |",
    ...Array.from({ length: 10 }, (_, j) => "| Sample " + (j + 1) + " | Pass |"), ":::",
  ].join("\n"));
  const equations = Array.from({ length: groups }, (_, i) => ":::{" + "math}\nx_" + (i + 1) + " = 2\n:::");
  const figures = Array.from({ length: groups }, (_, i) =>
    ":::{figure} samples/example.svg\n:name: fig-" + (i + 1) + "\n\nSample diagram " + (i + 1) + ".\n:::");
  const body = [...paragraphs.slice(4), ...headings, ...lists, ...tables, ...equations, ...figures];
  for (let i = body.length - 1; i > 0; i--) {
    const j = Math.floor(choose() * (i + 1));
    [body[i], body[j]] = [body[j], body[i]];
  }
  // Blank lines alone do not separate two GFM bullet lists.
  for (let i = 1; i < body.length; i++) {
    if (!body[i].startsWith("- ") || !body[i - 1].startsWith("- ")) continue;
    const gap = body.findIndex((item, j) => Math.abs(j - i) > 1 && !item.startsWith("- ") &&
      !body[j - 1]?.startsWith("- ") && !body[j + 1]?.startsWith("- "));
    if (gap < 0) throw new Error("Unable to place separate synthetic lists");
    [body[i], body[gap]] = [body[gap], body[i]];
  }
  const notes = Array.from({ length: groups }, (_, i) => "[^note-" + (i + 1) + "]: Synthetic sample note.");
  return header + [...paragraphs.slice(0, 4), ...body, ...notes].join("\n\n") + "\n";
}

const styles = [
  "*", "_", "[square]", "|", "#", "<span>", "\x60", "$", "  ", " 한글 😀",
  " " + "length".repeat(640), " [^note-1]", " [remote][lookup]",
  "\n- item", "\n1. item", "\n:::note", "\n[lookup]: https://example.org", "\n(target)=",
  "\n% comment", "\n+++", "\n---\n", "\n~~~",
];
export const variants = ["append", "middle", "short", "empty", "case",
  ...styles.map((_, index) => "syntax-" + index)];

function change(value: string, variant: string): string {
  const units = Array.from(value);
  const middle = Math.floor(units.length / 2);
  if (variant === "append") return value + " corrected";
  if (variant === "middle") return units.slice(0, middle).join("") + "x" + units.slice(middle + 1).join("");
  if (variant === "short") return units.slice(0, 1).join("");
  if (variant === "empty") return "";
  if (variant === "case") return value.toUpperCase();
  return value + styles[Number(variant.slice("syntax-".length))];
}

function editInline(content: InlineContent[], variant: string): InlineContent[] {
  if (variant === "mark") return [...content, ...text(" "), { kind: "strong", children: text("verified") }];
  if (variant === "math") return [...content, ...text(" "), { kind: "math", value: "x^2" }];
  if (variant === "link") return [...content, ...text(" "), { kind: "link", url: "https://example.org", children: text("source") }];
  if (variant === "drop-note") return content.filter(item => item.kind !== "footnote");
  if (variant === "add-note") return [...content, { kind: "footnote", label: "note-1" }];
  if (variant === "alternate") return [
    { kind: "strong", children: text("Precision (A)") },
    { kind: "emphasis", children: text("was") }, ...text("measured"),
  ];
  if (variant === "empty" || variant === "short") return text(change(plain(content), variant)).filter(item => "text" in item && item.text);
  const index = content.findIndex(item => item.kind === "text");
  if (index < 0) return [...content, ...text(change("", variant))];
  const part = content[index];
  if (part.kind !== "text") throw new Error("text index");
  return content.with(index, { ...part, text: change(part.text, variant) });
}

export function kindOf(node: MystNode): EditKind {
  if (tableOf(node)) return "cell";
  if (supportedFigureContent(node)) return "caption";
  if (node.type === "math") return "equation";
  if (node.type === "paragraph" || node.type === "heading" || node.type === "list" || node.type === "admonition") return node.type;
  return "other";
}

export function editAt(snapshot: Snapshot, index: number, kind: EditKind, variant: string): Edit {
  const node = snapshot.document.children[index];
  return { index, kind, variant, apply: (doc, at) => {
    const target = doc.children[at];
    if (kind === "paragraph" || kind === "inline") {
      const content = editInline(projectInlineContent(target) ?? [], variant);
      return ops.updateParagraphInlineContent(doc, [at], content);
    }
    if (kind === "heading") return ops.updateHeadingInlineContent(doc, [at], editInline(projectInlineContent(target) ?? [], variant));
    if (kind === "cell") {
      const table = tableOf(target)!;
      const row = Math.min(1, (table.children?.length ?? 1) - 1);
      const column = Math.min(1, (table.children?.[row].children?.length ?? 1) - 1);
      const cell = table.children![row].children![column];
      const content = projectInlineContent(cell) ?? [];
      return ops.updateTableCell(doc, [at, row, column], editInline(content, variant));
    }
    if (kind === "caption") {
      if (tableOf(node)) {
        const caption = tableCaptionParagraph(target);
        return ops.updateTableCaption(doc, [at], editInline(caption ? projectInlineContent(caption) ?? [] : [], variant));
      }
      const figure = supportedFigureContent(target)!;
      return ops.updateFigure(doc, [at], { caption: editInline(figureCaptionContent(figure.caption), variant) });
    }
    if (kind === "list") {
      const list = supportedListContent(target)!;
      list.items[0].content = editInline(list.items[0].content, variant);
      return ops.updateList(doc, [at], list);
    }
    if (kind === "equation") {
      const value = String(target.value);
      return ops.updateEquationLatex(doc, [at], value, variant === "append" ? value + " + 1" : change(value, variant));
    }
    if (kind === "admonition") {
      const content = target.children?.[0] ? projectInlineContent(target.children[0]) ?? [] : [];
      return ops.updateAdmonitionInlineContent(doc, [at], editInline(content, variant));
    }
    if (kind === "structure") return ops.removeBlock(doc, at);
    if (target.type === "footnoteDefinition") return ops.updateFootnoteDefinition(doc, [at],
      editInline(projectInlineContent(target.children?.[0] ?? target) ?? [], variant));
    if (target.type === "blockquote") return ops.updateQuoteInlineContent(doc, [at],
      editInline(projectInlineContent(target.children?.[0] ?? target) ?? [], variant));
    // Also exercise deletion of unsupported-to-splice blocks such as code and targets.
    return ops.removeBlock(doc, at);
  } };
}

export function mechanical(snapshot: Snapshot, large: boolean): Edit[] {
  const choose = random(1983);
  return snapshot.document.children.flatMap((node, index) => {
    if (!index) return [];
    const kind = kindOf(node);
    const adversarial = variants[Math.floor(choose() * variants.length)];
    if (kind === "paragraph") {
      const additions = ["mark", "math", "link", "alternate"];
      return [editAt(snapshot, index, kind, "append"),
        editAt(snapshot, index, index % 3 === 0 ? "inline" : kind,
          index % 3 === 0 ? additions[index % additions.length] : adversarial),
        ...(!large ? [editAt(snapshot, index, kind, "middle")] : [])];
    }
    if (kind === "cell") {
      return [editAt(snapshot, index, kind, "math"), editAt(snapshot, index, kind, adversarial),
        ...(!large ? [editAt(snapshot, index, "caption", "append")] : [])];
    }
    if (kind === "heading") return [editAt(snapshot, index, kind, "case"), editAt(snapshot, index, kind, "append")];
    return [editAt(snapshot, index, kind, "append"), editAt(snapshot, index, kind, adversarial)];
  });
}

export function mixed(snapshot: Snapshot, count: number): Edit[] {
  const choose = random(19831125);
  const byKind = (kind: EditKind) => snapshot.document.children.flatMap((node, index) =>
    index && kindOf(node) === kind ? [index] : []);
  const plan = [["paragraph", 60], ["cell", 20], ["heading", 5], ["caption", 5], ["list", 5], ["structure", 5]] as const;
  return plan.flatMap(([kind, percent]) => Array.from({ length: count * percent / 100 }, (_, i) => {
    const candidates = byKind(kind === "structure" ? "paragraph" : kind);
    return editAt(snapshot, candidates[Math.floor(choose() * candidates.length)], kind,
      kind === "cell" && i % 2 === 0 ? "math" : i % 2 === 0 ? "middle" : "append");
  }));
}
