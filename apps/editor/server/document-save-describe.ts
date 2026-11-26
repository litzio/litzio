import { isDeepStrictEqual } from "node:util";
import { getEditableDocument, machineNodes, type Document } from "@litzio/core";
import type { SavedBlock, SupportedEdits } from "../shared/document-protocol.ts";

/** Edit lists located by an opening-snapshot path that keep the top-level structure. */
const IN_PLACE = ["headings", "paragraphs", "equations", "figures", "cells", "tableCaptions", "tableNotes",
  "admonitions", "quotes", "footnotes", "lists", "codes", "labels", "enumerators"] as const;
const STRUCTURAL = ["order", "headingLevels", "tables", "splits", "merges", "inserts", "deletes"] as const;

/**
 * Top-level blocks whose edits differ between the previously accepted cumulative edits and
 * this Save's. Only a Save that keeps the top-level structure is described: its opening
 * locators then address the saved document. Undefined when the structure may have changed.
 */
export function changedBlocks(previous: SupportedEdits, next: SupportedEdits): number[] | undefined {
  if (STRUCTURAL.some(key => next[key]?.length || previous[key]?.length) ||
      next.admonitions?.some(edit => edit.variant !== undefined)) return undefined;
  const changed = new Set<number>();
  for (const key of IN_PLACE) {
    const items = (edits: SupportedEdits) => new Map<string, unknown>(((edits[key] ?? []) as { path: number[] }[])
      .map(item => [JSON.stringify(item.path), item]));
    const before = items(previous), after = items(next);
    for (const [locator, item] of new Map([...before, ...after])) {
      if (!isDeepStrictEqual(before.get(locator), after.get(locator))) changed.add((item as { path: number[] }).path[0]!);
    }
  }
  return [...changed].sort((a, b) => a - b);
}

/** The accepted document's inspect nodes (as `inspect --format json`) for these top-level blocks. */
export function describeBlocks(document: Document, indices: readonly number[]): SavedBlock[] {
  const wanted = new Set(indices);
  const blocks = new Map<number, SavedBlock>();
  for (const node of machineNodes(getEditableDocument(document))) {
    const index = node.path[0]!;
    if (!wanted.has(index)) continue;
    let block = blocks.get(index);
    if (!block) blocks.set(index, block = { path: [index], nodes: [] });
    block.nodes.push(node);
  }
  return [...blocks.values()];
}
