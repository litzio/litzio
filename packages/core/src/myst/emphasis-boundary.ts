import { createTokenizer } from "myst-parser";
import type { MystNode } from "./tree.ts";

const reader = createTokenizer({ extensions: { smartquotes: false } });
const decodes = new Map<number, boolean>();

/**
 * CommonMark closes `*`/`**` after inner punctuation only when the outer neighbour is
 * whitespace or punctuation (opening is symmetric). Korean particles attach directly, so
 * `**정확도(A)**를` stays literal text. Write that one outer character as a hexadecimal
 * character reference instead: it reads back as the same text and `&` is punctuation.
 * This follows mdast-util-to-markdown 2.x `encodeInfo`. Unicode symbols count as
 * punctuation so markdown-it 13 and CommonMark 0.31 readers agree.
 * A character whose reference does not read back as itself (control characters) is left
 * as is. Runs on the write-only clone, before `$`/`@` escaping, so text after the reference
 * is escaped in its own context; the full fingerprint round trip still decides.
 *
 * `alternateMarkers` is the writer's second attempt (#1831), see `hasMixedAdjacentMarks`.
 */
export function encodeEmphasisBoundaries(children: MystNode[], alternateMarkers = false): MystNode[] {
  const underscored = new Set<MystNode>();
  if (alternateMarkers) children.forEach((child, index) => {
    const before = children[index - 1];
    if (isMark(child) && isMark(before) && !underscored.has(before) && mixed(edge(before, "last"), edge(child, "first"))) {
      underscored.add(child);
    }
  });
  const result: MystNode[] = [];
  children.forEach((child, index) => {
    if (underscored.has(child)) {
      // The pinned writer has one emphasis marker per document: write this mark's markers as
      // raw output around its children, which the caller then prepares and writes in place.
      const marker = child.type === "strong" ? "__" : "_";
      result.push({ type: "html", value: marker }, ...encodeEmphasisBoundaries(child.children ?? [], true), { type: "html", value: marker });
      return;
    }
    if (child.type !== "text") { result.push(child); return; }
    const before = children[index - 1], after = children[index + 1];
    let value = String(child.value ?? "");
    let head: MystNode | undefined, tail: MystNode | undefined;
    const first = firstChar(value);
    const beforeEdge = isMark(before) ? edge(before, "last") : undefined;
    const closesBefore = isPunctuation(beforeEdge) || (beforeEdge !== undefined && isWordChar(beforeEdge) && underscored.has(before!));
    if (first && closesBefore && isWordChar(first) && encodable(first)) {
      head = { type: "html", value: reference(first) };
      value = value.slice(first.length);
    }
    const last = lastChar(value);
    const rest = last ? value.slice(0, -last.length) : "";
    // The writer turns a line ending (or a hard break) before raw output into a space, so the
    // reference carries a bare line ending. Spaces before that line ending, or a hard break,
    // would not survive: leave those as they are.
    const representable = !/[ \t]\n$/.test(rest) && !(rest === "" && before?.type === "break");
    if (last && isMark(after) && isPunctuation(edge(after, "first")) && isWordChar(last) && representable && encodable(last)) {
      const lineEnding = rest.endsWith("\n") ? "\n" : "";
      value = rest.slice(0, rest.length - lineEnding.length);
      tail = { type: "html", value: `${lineEnding}${reference(last)}` };
    }
    if (head) result.push(head);
    if (value) result.push({ ...child, value });
    if (tail) result.push(tail);
  });
  return result;
}

/**
 * Adjacent marks share one `*` run (`**정확도(A)***를*`). Whether that run closes the first
 * mark and opens the second depends on the reader's character classes and on the other runs
 * around it, so the writer first writes `*` everywhere and lets the pinned reader decide.
 * Only when that is refused and some adjacent marks meet with punctuation on one side and a
 * letter or digit on the other does it write again with `alternateMarkers`: the second mark
 * of each such pair uses `_` (`**정확도(A)**_를_`), as mdast-util-to-markdown 2.x does. `_`
 * cannot close inside a word, so a letter or digit after it is written as a reference too.
 * If that is refused as well, the first refusal stands.
 */
export function hasMixedAdjacentMarks(node: MystNode): boolean {
  const children = node.children ?? [];
  return children.some((child, index) => {
    const before = children[index - 1];
    return (isMark(child) && isMark(before) && mixed(edge(before, "last"), edge(child, "first"))) || hasMixedAdjacentMarks(child);
  });
}

/** One edge is punctuation and the other a letter or digit: the shared run may not do both. */
function mixed(left: string | undefined, right: string | undefined): boolean {
  if (left === undefined || right === undefined) return false;
  return (isPunctuation(left) && isWordChar(right)) || (isWordChar(left) && isPunctuation(right));
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

function reference(character: string): string {
  return `&#x${character.codePointAt(0)!.toString(16).toUpperCase()};`;
}

/** Whether the pinned reader decodes the reference back to this exact character. */
function encodable(character: string): boolean {
  const code = character.codePointAt(0)!;
  let result = decodes.get(code);
  if (result === undefined) {
    const tokens = reader.parseInline(reference(character), {})[0]?.children ?? [];
    result = tokens.map(token => token.content).join("") === character;
    decodes.set(code, result);
  }
  return result;
}
