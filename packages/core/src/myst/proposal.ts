import { getEditableDocument } from "../editable.ts";
import { updateHeadingInlineContent, updateParagraphInlineContent } from "../operations.ts";
import { parseNativeDocument, serializeNativeDocument } from "./native.ts";
import type { MystDocument } from "./tree.ts";

/** Snapshot ordinal, never persistent identity. Small spike: inline changes only. */
export function proposalBlock(document: MystDocument, index: number) {
  const block = getEditableDocument(document).blocks[index];
  if (!Number.isInteger(index) || !block || !["paragraph", "heading"].includes(block.block)) {
    throw new Error("Select one top-level paragraph or heading for a proposal.");
  }
  if (block.block !== "paragraph" && block.block !== "heading") throw new Error("Unsupported proposal block.");
  return block;
}

/** AI output enters through native parsing and existing semantic operations. */
export function replaceBlockProposal(document: MystDocument, index: number, markdown: string): MystDocument {
  const original = proposalBlock(document, index);
  const fragment = parseNativeDocument(`---\nlitzio: 1\n---\n\n${markdown}`);
  const blocks = getEditableDocument(fragment).blocks;
  const replacement = proposalBlock(fragment, 0);
  if (blocks.length !== 1 || original.block !== replacement.block ||
      (original.block === "heading" && replacement.block === "heading" && original.level !== replacement.level)) {
    throw new Error("The proposal must keep one block of the same kind and heading level.");
  }
  const next = original.block === "paragraph"
    ? updateParagraphInlineContent(document, original.path, replacement.content)
    : updateHeadingInlineContent(document, original.path, replacement.content);
  // Whole-document native admission and canonical round trip, including references.
  parseNativeDocument(serializeNativeDocument(next));
  return next;
}
