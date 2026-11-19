import type { MystNode } from "./tree.ts";

/**
 * CommonMark closes `*`/`**` after inner punctuation only when the outer neighbour is
 * whitespace or punctuation (opening is symmetric). Korean particles attach directly, so
 * `**정확도(A)**를` stays literal text. Write that one outer character as a hexadecimal
 * character reference instead: it reads back as the same text and `&` is punctuation.
 * This follows mdast-util-to-markdown 2.x `encodeInfo`. Unicode symbols count as
 * punctuation so markdown-it 13 and CommonMark 0.31 readers agree.
 * Runs on the write-only clone; the full fingerprint round trip still decides.
 */
export function encodeEmphasisBoundaries(children: MystNode[]): MystNode[] {
  const result: MystNode[] = [];
  children.forEach((child, index) => {
    if (child.type !== "text") { result.push(child); return; }
    const before = children[index - 1], after = children[index + 1];
    let value = String(child.value ?? "");
    let head: MystNode | undefined, tail: MystNode | undefined;
    const first = firstChar(value);
    if (first && isMark(before) && isPunctuation(edge(before, "last")) && isWordChar(first)) {
      head = characterReference(first);
      value = value.slice(first.length);
    }
    const last = lastChar(value);
    if (last && isMark(after) && isPunctuation(edge(after, "first")) && isWordChar(last)) {
      tail = characterReference(last);
      value = value.slice(0, -last.length);
    }
    if (head) result.push(head);
    if (value) result.push({ ...child, value });
    if (tail) result.push(tail);
  });
  return result;
}

function isMark(node: MystNode | undefined): node is MystNode {
  return node?.type === "strong" || node?.type === "emphasis";
}

/** The inner character next to a mark's delimiter. Inline nodes other than text and
 * nested marks (code, math, links, roles, references) are written starting and ending
 * with punctuation. */
function edge(node: MystNode, side: "first" | "last"): string | undefined {
  if (node.type === "text") return side === "first" ? firstChar(String(node.value ?? "")) : lastChar(String(node.value ?? ""));
  if (isMark(node)) {
    const children = node.children ?? [];
    const child = side === "first" ? children[0] : children.at(-1);
    return child ? edge(child, side) : undefined;
  }
  return "`";
}

function isPunctuation(character: string | undefined): boolean {
  return character !== undefined && /^[\p{P}\p{S}]$/u.test(character);
}

function isWordChar(character: string): boolean {
  return !/^\s$/u.test(character) && !isPunctuation(character);
}

function firstChar(value: string): string | undefined {
  const code = value.codePointAt(0);
  return code === undefined ? undefined : String.fromCodePoint(code);
}

function lastChar(value: string): string | undefined {
  if (!value) return undefined;
  const low = value.charCodeAt(value.length - 1);
  return low >= 0xdc00 && low <= 0xdfff && value.length > 1 ? value.slice(-2) : value.slice(-1);
}

function characterReference(character: string): MystNode {
  return { type: "html", value: `&#x${character.codePointAt(0)!.toString(16).toUpperCase()};` };
}
