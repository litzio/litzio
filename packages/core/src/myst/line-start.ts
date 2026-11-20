import { createTokenizer } from "myst-parser";
import { OPTIONS } from "./parse.ts";
import type { MystNode } from "./tree.ts";

/**
 * MyST block syntax that paragraph text can start a physical line with, and that the pinned
 * writer does not protect: a block break (`+++`), a comment (`%`), a colon fence (`:::`) and a
 * line that is a whole target (`(label)=`). Read there, the text becomes a block or ends the
 * paragraph, and the canonical write is refused. The pinned parser decides whether a line
 * starting with one of these characters is such syntax (`(측정)=` is not a target), so this
 * module does not restate MyST's grammar.
 *
 * The writer's second attempt writes the first character of such a line with a backslash
 * escape (`\+++`, `\%`, `\:::`, `\(label)=`). Every one is ASCII punctuation, which CommonMark
 * (and so markdown-it, myst-parser, mystmd, Sphinx's MyST and GitHub) reads back as that same
 * character, and none of these block rules starts with a backslash. Only documents the plain
 * write refused take this attempt; the full fingerprint round trip still decides, and if it
 * refuses too the first refusal stands.
 */
const reader = createTokenizer(OPTIONS);

/** Whether the physical line starting at `position` reads as a block rather than paragraph text. */
function blockSyntax(value: string, position: number): boolean {
  if (!"+%:(".includes(value[position] ?? "\n")) return false;
  const end = value.indexOf("\n", position);
  return reader.parse(value.slice(position, end < 0 ? undefined : end), {})[0]?.type !== "paragraph_open";
}

/** Whether any paragraph text starts a line with that syntax, so a second attempt can help. */
export function hasLineStartSyntax(node: MystNode): boolean {
  const visit = (parent: MystNode, start: boolean): boolean => (parent.children ?? []).some((child, index, siblings) => {
    if (child.type === "text") {
      const value = String(child.value ?? "");
      return lineStarts(value, start && index === 0 || siblings[index - 1]?.type === "break" || endsLine(siblings[index - 1]))
        .some(position => blockSyntax(value, position));
    }
    return visit(child, child.type === "paragraph");
  });
  return visit(node, false);
}

/**
 * Escape line-start syntax in a prepared paragraph's inline content (`startsLine` for the
 * paragraph's own children: its first text starts a line). Marks and links are entered: their
 * text after a line break starts a line as well. Code, math and roles keep their own writers.
 *
 * The writer turns a line ending before raw output into a space, so the escape carries the
 * line ending: a soft break moves into it, and a hard break before it is written raw as `\`
 * and a line ending.
 */
export function encodeLineStarts(children: MystNode[], startsLine: boolean): MystNode[] {
  const result: MystNode[] = [];
  children.forEach((child, index) => {
    if (child.type !== "text") {
      result.push(INLINE_CONTAINERS.has(child.type) && child.children
        ? { ...child, children: encodeLineStarts(child.children, false) } : child);
      return;
    }
    const value = String(child.value ?? "");
    const previous = result.at(-1);
    const start = startsLine && index === 0 || previous?.type === "break" || endsLine(previous);
    let from = 0;
    for (const position of lineStarts(value, start)) {
      if (!blockSyntax(value, position)) continue;
      let lineEnding = "";
      if (position > 0) {
        // The soft break inside this text.
        if (position - 1 > from) result.push({ ...child, value: value.slice(from, position - 1) });
        lineEnding = "\n";
      } else if (result.at(-1)?.type === "break") {
        result.pop();
        lineEnding = "\\\n";
      } else if (endsLine(result.at(-1))) {
        // A soft break at the end of the text before.
        const before = result.pop()!;
        const text = String(before.value).slice(0, -1);
        if (text) result.push({ ...before, value: text });
        lineEnding = "\n";
      }
      result.push({ type: "html", value: `${lineEnding}\\${value[position]}` });
      from = position + 1;
    }
    if (from < value.length) result.push(from ? { ...child, value: value.slice(from) } : child);
  });
  return result;
}

const INLINE_CONTAINERS = new Set(["strong", "emphasis", "delete", "link"]);

function endsLine(node: MystNode | undefined): boolean {
  return node?.type === "text" && String(node.value ?? "").endsWith("\n");
}

function lineStarts(value: string, start: boolean): number[] {
  const positions = start ? [0] : [];
  for (let index = value.indexOf("\n"); index >= 0; index = value.indexOf("\n", index + 1)) positions.push(index + 1);
  return positions.filter(position => position < value.length);
}
