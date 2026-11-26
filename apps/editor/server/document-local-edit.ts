import { inlineContentText, type EditableDocument, type LocalWriteEdit } from "@litzio/core";
import { isDeepStrictEqual } from "node:util";
import type { SupportedEdits } from "../shared/document-protocol.ts";

/** Save requests replay cumulative edits on the opening snapshot. Without structural
 * edits those locators also address the approved disk model. Keep ambiguous requests
 * on replay, including repetitions and changes to the document-wide metadata. */
export function localEdit(opening: EditableDocument, bibliography: string[], previous: SupportedEdits, next: SupportedEdits):
  { edit: LocalWriteEdit } | { reason: string } {
  const contentEdits = (edits: SupportedEdits) => {
    for (const [key, value] of Object.entries(edits)) {
      if (key === "path" || key === "revision" || key === "base" || key === "paragraphs" || key === "cells") continue;
      if (key === "bibliography" && isDeepStrictEqual(value, bibliography)) continue;
      if (Array.isArray(value) && !value.length && ["headings", "headingLevels", "equations", "figures", "tables",
        "tableCaptions", "tableNotes", "admonitions", "quotes", "footnotes", "lists", "codes", "labels",
        "enumerators", "splits", "merges", "inserts", "deletes"].includes(key)) continue;
      return undefined;
    }
    const content = new Map<string, LocalWriteEdit>();
    for (const [kind, editsOfKind] of [["paragraph", edits.paragraphs], ["cell", edits.cells]] as const) {
      if (editsOfKind !== undefined && !Array.isArray(editsOfKind)) return undefined;
      for (const item of editsOfKind ?? []) {
        if (!Array.isArray(item?.path) || item.path.length !== (kind === "paragraph" ? 1 : 3) ||
            item.path.some(part => !Number.isInteger(part) || part < 0) || !Array.isArray(item.content)) return undefined;
        const key = item.path.join(",");
        if (content.has(key)) return undefined;
        content.set(key, { kind, path: item.path, content: item.content });
      }
    }
    return content;
  };

  const before = contentEdits(previous), after = contentEdits(next);
  if (!before || !after) return { reason: "structure-or-metadata" };
  let edit: LocalWriteEdit | undefined;
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(key), current = after.get(key);
    if (isDeepStrictEqual(old, current)) continue;
    if (edit) return { reason: "multiple-content-edits" };
    const locator = current ?? old!;
    const [index, row, column] = locator.path;
    const block = opening.blocks.find(item => item.path.length === 1 && item.path[0] === index);
    // ADR-0024: a complex table's cells take the full Save.
    if (block?.block === "table" && block.grid === "complex") return { reason: "complex-table" };
    const original = locator.kind === "paragraph" && block?.block === "paragraph" ? block
      : locator.kind === "cell" && block?.block === "table" ? block.rows[row]?.cells[column] : undefined;
    if (!original?.editable) return { reason: "opening-locator" };
    const content = current?.content ?? original.content;
    if (locator.kind === "paragraph" && !inlineContentText(content).length) return { reason: "empty-paragraph" };
    edit = { ...locator, content };
  }
  return edit ? { edit } : { reason: "no-content-change" };
}
