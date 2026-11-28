import { diffLines } from "diff";

/** Count changed lines, treating a replacement as one change per paired line. */
export function countNormalizedLines(source: string, canonicalMarkdown: string): number {
  if (source === canonicalMarkdown) return 0;
  // When every line ending changes from CRLF to LF, the diff has no equal
  // lines and consists of one replacement. Avoid a quadratic search.
  if (source.endsWith("\r\n") && !/(?<!\r)\n/.test(source) &&
      canonicalMarkdown.endsWith("\n") && !canonicalMarkdown.includes("\r")) {
    return Math.max(source.split("\n").length, canonicalMarkdown.split("\n").length) - 1;
  }
  let count = 0, added = 0, removed = 0;
  for (const part of diffLines(source, canonicalMarkdown)) {
    if (part.added) added += part.count;
    else if (part.removed) removed += part.count;
    else {
      count += Math.max(added, removed);
      added = removed = 0;
    }
  }
  return count + Math.max(added, removed);
}
