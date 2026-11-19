import { createTokenizer } from "myst-parser";
import type { MystNode } from "./tree.ts";

const reader = createTokenizer({ extensions: { smartquotes: false } });
const { isMdAsciiPunct, isPunctChar, isWhiteSpace } = reader.utils;
const decodes = new Map<number, boolean>();

/**
 * CommonMark closes `*`/`**` after inner punctuation only when the outer neighbour is
 * whitespace or punctuation (opening is symmetric). Korean particles attach directly, so
 * `**정확도(A)**를` stays literal text. Write that one outer character as a hexadecimal
 * character reference instead: it reads back as the same text and `&` is punctuation.
 * This follows mdast-util-to-markdown 2.x `encodeInfo`. Unicode symbols count as
 * punctuation so markdown-it 13 and CommonMark 0.31 readers agree. The pinned markdown-it 13
 * counts only ASCII and Unicode P punctuation, one UTF-16 unit at a time, so it also fails
 * where a symbol or a supplementary character touches the mark (`**(a)**😀`); the second
 * attempt encodes those too.
 * A character whose reference does not read back as itself (control characters) is left
 * as is. Runs on the write-only clone, before `$`/`@` escaping, so text after the reference
 * is escaped in its own context; the full fingerprint round trip still decides.
 *
 * `alternate` is the writer's second attempt, see `hasAlternateBoundaries`.
 */
export function encodeEmphasisBoundaries(children: MystNode[], alternate = false): MystNode[] {
  const underscored = new Set<MystNode>();
  if (alternate) children.forEach((child, index) => { if (switchable(children, index)) underscored.add(child); });
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
    const intraword = beforeEdge !== undefined && isWordChar(beforeEdge) && underscored.has(before!);
    if (first && (breaks(beforeEdge, first, "after", alternate) || (intraword && isWordChar(first))) && encodable(first)) {
      head = { type: "html", value: reference(first) };
      value = value.slice(first.length);
    }
    const last = lastChar(value);
    const rest = last ? value.slice(0, -last.length) : "";
    // The writer turns a line ending (or a hard break) before raw output into a space, so the
    // reference carries a bare line ending. Spaces before that line ending, or a hard break,
    // would not survive: leave those as they are.
    const representable = !/[ \t]\n$/.test(rest) && !(rest === "" && before?.type === "break");
    if (last && isMark(after) && breaks(edge(after, "first"), last, "before", alternate) && representable && encodable(last)) {
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
 * Whether the writer may try `alternate` after the plain output is refused. The plain output
 * (`*` markers, references by CommonMark 0.31 classes) is written first and kept whenever the
 * pinned reader reads it back unchanged; a second attempt changes only refused documents, and
 * if it is refused as well the first refusal stands. It does two things:
 * - Two adjacent marks share one `*` run (`**정확도(A)***를*`), which may not close the first mark
 *   and open the second when punctuation meets a letter or digit. The second mark of such a
 *   pair uses `_` (`**정확도(A)**_를_`), as mdast-util-to-markdown 2.x does. `_` cannot close
 *   inside a word, so a letter or digit after it is written as a reference too.
 * - An outer character is also encoded where any of `readers` fails (`**(a)**&#x1F600;`).
 * Readers merge chains of three or more adjacent marks differently, and `readers` disagree on
 * symbols and supplementary characters, so no notation is safe for all of them there: a chain
 * is never switched, and a document with any adjacent marks the readers judge differently
 * (`**→***a.*`) gets no second attempt.
 */
export function hasAlternateBoundaries(node: MystNode): boolean {
  let candidate = false;
  const visit = (parent: MystNode): boolean => (parent.children ?? []).every((child, index, children) => {
    const before = children[index - 1], after = children[index + 1];
    if (isMark(child) && isMark(before)) {
      const left = edge(before, "last"), right = edge(child, "first");
      if (new Set(readers.map(reader => mixed(reader, left, right))).size > 1) return false;
      if (switchable(children, index)) candidate = true;
    }
    if (child.type === "text") {
      const value = String(child.value ?? ""), first = firstChar(value), last = lastChar(value);
      if (first && isMark(before) && breaks(edge(before, "last"), first, "after", true)) candidate = true;
      if (last && isMark(after) && breaks(edge(after, "first"), last, "before", true)) candidate = true;
    }
    return visit(child);
  });
  return visit(node) && candidate;
}

type Kind = "space" | "punctuation" | "word";
type Reader = (character: string, unit: number) => Kind;

/** How readers class the character beside a delimiter run: CommonMark 0.31 (and
 * markdown-it 14.3) by code point with Unicode symbols as punctuation; the pinned
 * markdown-it 13 by the UTF-16 unit beside the run without symbols; markdown-it 14.1 by
 * that unit with symbols. */
const readers: Reader[] = [
  character => /^\s$/u.test(character) ? "space" : isPunctuation(character) ? "punctuation" : "word",
  (_, unit) => isWhiteSpace(unit) ? "space" : isMdAsciiPunct(unit) || isPunctChar(String.fromCharCode(unit)) ? "punctuation" : "word",
  (_, unit) => isWhiteSpace(unit) ? "space" : isMdAsciiPunct(unit) || isPunctuation(String.fromCharCode(unit)) ? "punctuation" : "word",
];

function kind(reader: Reader, character: string, side: "start" | "end"): Kind {
  return reader(character, side === "start" ? character.charCodeAt(0) : character.charCodeAt(character.length - 1));
}

/**
 * Whether the delimiter between a mark's inner edge and the touching outer character cannot
 * close (`side` "after": outer text follows the mark) or open ("before"). The plain output
 * judges by CommonMark 0.31 classes; with `alternate`, a failure for any reader counts.
 */
function breaks(inner: string | undefined, outer: string, side: "before" | "after", alternate: boolean): boolean {
  if (inner === undefined) return false;
  const [innerSide, outerSide] = side === "after" ? ["end", "start"] as const : ["start", "end"] as const;
  return (alternate ? readers : readers.slice(0, 1))
    .some(reader => kind(reader, inner, innerSide) === "punctuation" && kind(reader, outer, outerSide) === "word");
}

/** The second of exactly two adjacent marks whose shared run cannot close one and open the
 * other, for every reader alike. */
function switchable(children: MystNode[], index: number): boolean {
  const before = children[index - 1], child = children[index];
  if (!isMark(child) || !isMark(before) || isMark(children[index - 2]) || isMark(children[index + 1])) return false;
  const left = edge(before, "last"), right = edge(child, "first");
  return readers.every(reader => mixed(reader, left, right));
}

/** One edge is punctuation and the other a letter or digit, for this reader. */
function mixed(reader: Reader, left: string | undefined, right: string | undefined): boolean {
  if (left === undefined || right === undefined) return false;
  const l = kind(reader, left, "end"), r = kind(reader, right, "start");
  return (l === "punctuation" && r === "word") || (l === "word" && r === "punctuation");
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
