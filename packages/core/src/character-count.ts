import type { EditableDocument } from "./editable.ts";
import type { InlineContent } from "./inline.ts";
import type { ListContent } from "./list.ts";

export type CharacterCount = { withSpaces: number; withoutSpaces: number };

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const whitespace = /^\p{White_Space}+$/u;

export function countDocumentCharacters(document: EditableDocument): CharacterCount {
  let withSpaces = 0;
  let withoutSpaces = 0;
  function countText(text: string): void {
    if (/^[\x00-\x7f]*$/.test(text)) {
      withSpaces += text.length - (text.match(/\r\n/g)?.length ?? 0);
      withoutSpaces += text.replace(/[\t-\r ]/g, "").length;
      return;
    }
    for (const { segment } of graphemes.segment(text)) {
      withSpaces++;
      if (!whitespace.test(segment)) withoutSpaces++;
    }
  }

  function countInline(content: InlineContent[]): void {
    let text = "";
    function append(items: InlineContent[]): void {
      for (const item of items) {
        if ("children" in item) append(item.children);
        else if (item.kind === "text") text += item.text;
        else if (item.kind === "code") text += item.value;
        else if (item.kind === "break") text += "\n";
        else {
          countText(text);
          text = "";
        }
      }
    }
    append(content);
    countText(text);
  }

  function countList(list: ListContent): void {
    for (const item of list.items) {
      countInline(item.content);
      if (item.list) countList(item.list);
    }
  }

  for (const block of document.blocks) {
    switch (block.block) {
      case "heading": case "paragraph": case "quote": case "admonition": case "footnote":
        countInline(block.content);
        break;
      case "code": countText(block.code); break;
      case "list": countList(block); break;
      case "figure": countInline(block.caption.content); break;
      case "table":
        if (block.grid === "complex") {
          for (const row of block.rows) for (const cell of row.cells) for (const part of cell.blocks) {
            if (part.kind === "paragraph") countInline(part.content);
            else countList(part.list);
          }
        } else {
          for (const row of block.rows) for (const cell of row.cells) countInline(cell.content);
        }
        if (block.caption) countInline(block.caption);
        for (const note of block.notes ?? []) countInline(note);
        break;
    }
  }
  return { withSpaces, withoutSpaces };
}
