import * as C from "../../../packages/core/src/index.ts";
import { union, type Link } from "./path-map.ts";

// BEGIN measured B
export function pairs(document: C.Document) {
  const blocks = C.getEditableDocument(document).blocks;
  return blocks.flatMap((block, i) => block.block === "target" ? [] : [{
    block, id: blocks[i - 1]?.block === "target" ? blocks[i - 1].label : undefined,
    target: blocks[i - 1]?.block === "target" ? blocks[i - 1].path[0] : undefined,
  }]);
}
export function split(document: C.Document, id: string, newId: string, offset: number, links: Map<string, Link>) {
  const { block } = pairs(document).find(p => p.id === id)!;
  document = C.splitParagraph(document, block.path, offset);
  document = C.insertTarget(document, block.path[0] + 1, newId);
  const link = { ...links.get(id)!, estimated: true };
  links.set(id, link); links.set(newId, structuredClone(link));
  return document;
}
export function merge(document: C.Document, id: string, links: Map<string, Link>, merged: Map<string, string>) {
  const all = pairs(document), i = all.findIndex(p => p.id === id);
  const front = all[i - 1].id!;
  document = C.removeBlock(document, all[i].target!);
  document = C.mergeParagraphWithPrevious(document, [all[i].block.path[0] - 1]);
  links.set(front, union(links.get(front)!, links.get(id)!));
  links.delete(id); merged.set(id, front);
  return document;
}
export function move(document: C.Document, id: string, to: number) {
  const all = pairs(document), from = all.findIndex(p => p.id === id);
  const at = all[from].target!;
  if (from < to) {
    const end = all[to].block.path[0];
    document = C.moveBlock(document, at, end);
    return C.moveBlock(document, at, end);
  }
  const start = all[to].target!;
  document = C.moveBlock(document, at, start);
  return C.moveBlock(document, at + 1, start + 1);
}
export function remove(document: C.Document, id: string, links: Map<string, Link>, deleted: Link[]) {
  const { block, target } = pairs(document).find(p => p.id === id)!;
  document = C.removeBlock(document, block.path[0]);
  document = C.removeBlock(document, target!);
  deleted.push(links.get(id)!); links.delete(id);
  return document;
}
// Text correction, conversion and cell correction leave IDs and links unchanged.
// END measured B
