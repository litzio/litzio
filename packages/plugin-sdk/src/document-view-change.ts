import { getEditableDocument, type Document, type EditableBlock, type EditableDocument } from "@litzio/core";

/**
 * What a DocumentView shows of a change before its write (`apply`): the top-level blocks
 * [from, from + removed) of the document before the change give way to `blocks`, Core's read
 * model of the changed document, and the document fields take `document`'s values.
 */
export type ScreenDocumentViewChange = {
  from: number;
  removed: number;
  blocks: EditableBlock[];
  document: { title: string | null; status: EditableDocument["status"] | null;
    headingNumbering: EditableDocument["headingNumbering"] | null; referenceTemplates: EditableDocument["referenceTemplates"] | null };
};

// Paths move with the blocks before them; a block's content is what it shows.
const shown = (block: EditableBlock) => JSON.stringify(block, (key, value) => key === "path" ? undefined : value);

/** The change between two Core documents, as a DocumentView shows it: the blocks from the first
 * to the last that differ, with the changed document's read model. */
export function documentViewChange(before: Document, after: Document): ScreenDocumentViewChange {
  const old = getEditableDocument(before), next = getEditableDocument(after);
  const a = old.blocks.map(shown), b = next.blocks.map(shown);
  let from = 0;
  while (from < a.length && from < b.length && a[from] === b[from]) from++;
  let tail = 0;
  while (tail < a.length - from && tail < b.length - from && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  return {
    from,
    removed: a.length - from - tail,
    blocks: next.blocks.slice(from, next.blocks.length - tail),
    document: { title: next.title ?? null, status: next.status ?? null,
      headingNumbering: next.headingNumbering ?? null, referenceTemplates: next.referenceTemplates ?? null },
  };
}
