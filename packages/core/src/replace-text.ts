import { getEditableDocument } from "./editable.ts";
import type { NodePath } from "./document.ts";
import { literalSearchPattern, type InlineContent } from "./inline.ts";
import { groupInlineLeaves, orderInlineMarks, type InlineLeaf, type InlineMark } from "./inline-group.ts";
import type { ListContent } from "./list.ts";
import type { MystDocument } from "./myst/tree.ts";
import {
  updateAdmonitionInlineContent, updateCodeBlock, updateFigure, updateFootnoteDefinition,
  updateHeadingInlineContent, updateList, updateParagraphsInlineContent, updateQuoteInlineContent,
  updateTableCaption, updateTableCell, updateTableCellBlocks, updateTableNote,
} from "./operations.ts";
import { DocumentDiagnosticError } from "./write-error.ts";

export type ReplaceAllTextOptions = { from: string; to: string; caseSensitive?: boolean };

/** Replace changed matches on private document copies, using the existing text operations
 * for each editable block so a refused replacement cannot leave partial changes. */
export function replaceAllText(document: MystDocument, { from, to, caseSensitive = true }: ReplaceAllTextOptions) {
  if (!from) throw new DocumentDiagnosticError("invalid-operation", "replaceAllText requires a non-empty search string");
  if (/[\r\n]/u.test(from) || /[\r\n]/u.test(to)) {
    throw new DocumentDiagnosticError("invalid-operation", "search and replacement must be single-line text");
  }
  const pattern = new RegExp(literalSearchPattern(from), caseSensitive ? "gu" : "giu");
  let replaced = 0;
  let next = document;
  const paragraphs: { path: NodePath; content: InlineContent[] }[] = [];

  function matches(text: string) {
    const ranges: { from: number; to: number }[] = [];
    for (const match of text.matchAll(pattern)) {
      if (match[0] === to) continue;
      ranges.push({ from: match.index, to: match.index + match[0].length });
    }
    replaced += ranges.length;
    return ranges;
  }

  function inline(content: InlineContent[]): InlineContent[] {
    const result: InlineLeaf[] = [];
    let run: InlineLeaf[] = [];
    const before = replaced;
    const flush = () => {
      if (run.length) for (const leaf of replaceRun(run, to, matches)) result.push(leaf);
      run = [];
    };
    for (const leaf of leavesOf(content)) {
      if (leaf.item.kind === "text" || leaf.item.kind === "code") run.push(leaf);
      else {
        flush();
        result.push(leaf);
      }
    }
    flush();
    return replaced === before ? content : groupInlineLeaves(result);
  }

  function list(value: ListContent): ListContent {
    return { ...value, items: value.items.map(item => ({
      ...item, content: inline(item.content), ...(item.list ? { list: list(item.list) } : {}),
    })) };
  }

  for (const block of getEditableDocument(document).blocks) {
    const { path } = block;
    if (block.block === "code") {
      const ranges = matches(block.code);
      if (ranges.length) {
        let end = 0;
        const parts = ranges.map(range => {
          const prefix = block.code.slice(end, range.from);
          end = range.to;
          return prefix + to;
        });
        next = updateCodeBlock(next, path, { code: parts.join("") + block.code.slice(end) });
      }
    } else if (block.block === "list") {
      const before = replaced;
      const content = list(block);
      if (before !== replaced) next = updateList(next, path, content);
    } else if (block.block === "table") {
      if (block.grid === "complex") {
        for (const { cells } of block.rows) for (const cell of cells) {
          const before = replaced;
          const blocks = cell.blocks.map(item => item.kind === "paragraph"
            ? { ...item, content: inline(item.content) }
            : { ...item, list: list(item.list) });
          if (before !== replaced) next = updateTableCellBlocks(next, cell.path, blocks);
        }
      } else {
        for (const { cells } of block.rows) for (const cell of cells) {
          const content = inline(cell.content);
          if (content !== cell.content) next = updateTableCell(next, cell.path, content);
        }
      }
      if (block.caption) {
        const caption = inline(block.caption);
        if (caption !== block.caption) next = updateTableCaption(next, path, caption);
      }
      for (const [index, note] of (block.notes ?? []).entries()) {
        const content = inline(note);
        if (content !== note) next = updateTableNote(next, path, index, content);
      }
    } else if (block.block === "figure") {
      const caption = inline(block.caption.content);
      if (caption !== block.caption.content) next = updateFigure(next, path, { caption });
    } else if ("content" in block) {
      const content = inline(block.content);
      if (content === block.content) continue;
      switch (block.block) {
        case "paragraph": paragraphs.push({ path, content }); break;
        case "heading": next = updateHeadingInlineContent(next, path, content); break;
        case "admonition": next = updateAdmonitionInlineContent(next, path, content); break;
        case "quote": next = updateQuoteInlineContent(next, path, content); break;
        case "footnote": next = updateFootnoteDefinition(next, path, content); break;
      }
    }
  }
  return { document: updateParagraphsInlineContent(next, paragraphs), replaced };
}

function* leavesOf(content: InlineContent[], marks: InlineMark[] = []): Iterable<InlineLeaf> {
  for (const item of content) {
    if ("children" in item) {
      const key = item.kind === "link" ? `link ${JSON.stringify([item.url, item.title ?? null])}` : item.kind;
      yield* leavesOf(item.children, orderInlineMarks([...marks, { key, wrap: children => ({ ...item, children }) }]));
    } else {
      yield { item, marks };
    }
  }
}

function textOf(leaf: InlineLeaf): string {
  return leaf.item.kind === "text" ? leaf.item.text : leaf.item.kind === "code" ? leaf.item.value : "";
}

/** The caller gives adjoining text leaves from just one text block. */
function replaceRun(run: InlineLeaf[], replacement: string,
  matches: (text: string) => { from: number; to: number }[]): InlineLeaf[] {
  const text = run.map(textOf).join("");
  const ranges = matches(text);
  if (!ranges.length) return run;

  let index = 0, offset = 0, leafEnd = textOf(run[0]).length;
  const output: InlineLeaf[] = [];
  const take = (end: number, consume: (leaf: InlineLeaf, text: string) => void) => {
    while (offset < end) {
      const stop = Math.min(end, leafEnd);
      consume(run[index], text.slice(offset, stop));
      offset = stop;
      if (offset === leafEnd && ++index < run.length) leafEnd += textOf(run[index]).length;
    }
  };
  const keep = (leaf: InlineLeaf, text: string) => {
    if (text) output.push({ marks: leaf.marks, item: leaf.item.kind === "code"
      ? { kind: "code", value: text } : { kind: "text", text } });
  };
  for (const range of ranges) {
    take(range.from, keep);
    const first = run[index];
    let marks = first.marks;
    let code = first.item.kind === "code";
    take(range.to, leaf => {
      marks = marks.filter(mark => leaf.marks.some(other => mark.key === other.key));
      code &&= leaf.item.kind === "code";
    });
    if (replacement) output.push({ marks, item: code ? { kind: "code", value: replacement } : { kind: "text", text: replacement } });
  }
  take(text.length, keep);
  return output;
}
