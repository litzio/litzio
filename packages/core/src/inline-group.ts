import type { InlineContent } from "./inline.ts";

export type InlineMark = { key: string; wrap: (children: InlineContent[]) => InlineContent };
export type InlineLeaf = { item: InlineContent; marks: InlineMark[] };

const markOrder = ["strong", "emphasis", "delete", "subscript", "superscript"];

export function orderInlineMarks(marks: InlineMark[]): InlineMark[] {
  const rank = (mark: InlineMark) => mark.key.startsWith("link ") ? markOrder.length : markOrder.indexOf(mark.key);
  return marks.sort((a, b) => rank(a) - rank(b));
}

/** Keep the longest mark run outermost and keep each contiguous link target together. */
export function groupInlineLeaves(leaves: InlineLeaf[]): InlineContent[] {
  const result: InlineContent[] = [];
  let index = 0;
  while (index < leaves.length) {
    const leaf = leaves[index];
    if (leaf.marks.length === 0) {
      result.push(leaf.item);
      index++;
      continue;
    }
    let best = leaf.marks[0];
    let end = index;
    for (const mark of leaf.marks) {
      let next = index;
      while (next < leaves.length && leaves[next].marks.some(other => other.key === mark.key)) next++;
      if (!mark.key.startsWith("link ")) {
        while (next > index && next < leaves.length && sharedLink(leaves[next - 1], leaves[next])) next--;
      }
      if (next > end) {
        best = mark;
        end = next;
      }
    }
    const inner = leaves.slice(index, end).map(leaf => ({
      ...leaf, marks: leaf.marks.filter(mark => mark.key !== best.key),
    }));
    result.push(best.wrap(groupInlineLeaves(inner)));
    index = end;
  }
  return result;
}

function sharedLink(left: InlineLeaf, right: InlineLeaf): boolean {
  return left.marks.some(mark => mark.key.startsWith("link ") && right.marks.some(other => other.key === mark.key));
}
