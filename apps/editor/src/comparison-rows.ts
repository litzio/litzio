import type { BlockChange, EditableDocument, NodePath } from "@litzio/core";
export type CompareRow = { before?: NodePath; after?: NodePath; change?: BlockChange; number?: number; fold?: number };
const key = (path: NodePath) => path.join(",");
/** Layout only. Unchanged sequence gaps come from Core's ordered change paths. */
export function comparisonRows(before: EditableDocument, after: EditableDocument, changes: BlockChange[]): CompareRow[] {
  const rows: CompareRow[] = []; let a = 0, b = 0;
  for (const [index, change] of changes.entries()) {
    let old = change.before ? before.blocks.findIndex(block => key(block.path) === key(change.before!)) : undefined;
    let next = change.after ? after.blocks.findIndex(block => key(block.path) === key(change.after!)) : undefined;
    if (old === undefined) old = a + (next! - b);
    if (next === undefined) next = b + (old - a);
    while (a < old && b < next) rows.push({ before: before.blocks[a++].path, after: after.blocks[b++].path });
    rows.push({ ...change, change, number: index + 1 });
    if (change.before) a++;
    if (change.after) b++;
  }
  while (a < before.blocks.length && b < after.blocks.length) rows.push({ before: before.blocks[a++].path, after: after.blocks[b++].path });
  // Collapse unchanged runs, keeping exactly one context block next to a change.
  let fold = 0;
  for (let start = 0; start < rows.length;) {
    if (rows[start].change) { start++; continue; }
    let end = start; while (end < rows.length && !rows[end].change) end++;
    const from = start + (start > 0 ? 1 : 0), to = end - (end < rows.length ? 1 : 0);
    if (to > from) { for (let index = from; index < to; index++) rows[index].fold = fold; fold++; }
    start = end;
  }
  return rows;
}
