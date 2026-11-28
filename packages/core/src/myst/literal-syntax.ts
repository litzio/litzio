import { createTokenizer } from "myst-parser";
import { installedRule } from "./tokenizer-rule.ts";
import type { MystDocument, MystNode } from "./tree.ts";

// Source-only evidence, outside the semantic tree and canonical-write fingerprint.
// Operation-created text is literal text; only a parsed source can express unescaped syntax.
const sources = new WeakMap<MystDocument, { text: string; options: object; defined: Set<string> }>();

/** Parsed source evidence is shared by all literal-syntax diagnostics. */
export function rememberLiteralSource(document: MystDocument, text: string, options: object, defined: Set<string>): void {
  if (/[\[`*_]/.test(text)) sources.set(document, { text, options, defined });
}

export type LiteralSyntax =
  | { footnote: true; label: string }
  | { syntax: "reference-link" | "reference-image"; label: string; source: string }
  | { syntax: "inline-code" | "emphasis"; source: string; label?: never };

/** Source syntax silently parsed as literal text. MyST's inline positions are container-level,
 * so the tokenizer, not a search of decoded AST text, distinguishes escapes and syntax.
 * This diagnostic-only tokenizer runs the existing rules first: escape, code, math, links
 * and valid footnotes consume their input before the fallback below can see it. */
type CitationSyntax = { syntax: "citation"; source: string };
export function literalSyntaxDiagnostics(document: MystDocument): (LiteralSyntax & { path: number[]; line: number })[] {
  return sourceSyntaxDiagnostics(document).filter((item): item is LiteralSyntax & { path: number[]; line: number } =>
    !("syntax" in item) || item.syntax !== "citation");
}

export function citationShorthand(document: MystDocument) {
  if (!sources.get(document)?.text.includes("@")) return undefined;
  return sourceSyntaxDiagnostics(document).find(item => "syntax" in item && item.syntax === "citation");
}

/** Both kinds: literal syntax that reopening reports and citation shorthand that native admission rejects. */
export function sourceSyntaxDiagnostics(document: MystDocument): ((LiteralSyntax | CitationSyntax) & { path: number[]; line: number })[] {
  const source = sources.get(document);
  if (!source) return [];
  const tokenizer = createTokenizer(source.options);
  const backticks = installedRule(tokenizer.inline.ruler, "backticks");
  // MyST leaves bare URLs as text (linkify is off). Reuse markdown-it's URL
  // recognizer solely to suppress diagnostics there; do not change parsing options.
  // Public native admission and unresolvedReferences both reach this recognizer;
  // it requires the pinned linkify-it security backport, even with linkify off.
  const urls = new WeakMap<object, { index: number; lastIndex: number }[]>();
  const inUrl = (state: Parameters<typeof backticks>[0], position = state.pos): boolean => {
    let ranges = urls.get(state);
    if (!ranges) urls.set(state, ranges = tokenizer.linkify.match(state.src) ?? []);
    // The pinned linkify-it match merge emits ordered, non-overlapping ranges
    // (patches/linkify-it@4.0.1.patch). Lookahead can rewind state.pos, so search
    // independently rather than retaining a forward-only range cursor.
    let low = 0;
    let high = ranges.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const range = ranges[middle];
      if (position < range.index) high = middle - 1;
      else if (position >= range.lastIndex) low = middle + 1;
      else return true;
    }
    return false;
  };
  tokenizer.inline.ruler.at("backticks", (state, silent) => {
    const start = state.pos;
    const pending = state.pending;
    const matched = backticks(state, silent);
    // An unmatched run is appended to pending text; a real code span emits a token.
    if (!silent && matched && state.pending === pending + state.src.slice(start, state.pos) &&
        state.pos < state.posMax && !/\s/.test(state.src[state.pos]) && !inUrl(state, start)) {
      state.push("literal_syntax", "", 0).meta = {
        syntax: "inline-code", source: state.src.slice(start, state.pos),
      } satisfies LiteralSyntax;
    }
    return matched;
  });
  observeEmphasis(tokenizer, inUrl);
  tokenizer.inline.ruler.push("literal_syntax", (state, silent) => {
    if (state.src[state.pos] !== "[" && state.src[state.pos] !== "!") return false;
    if (inUrl(state)) return false;
    // Match markdown-it-footnote's label grammar: nonempty, no space, LF or closing ].
    const match = /^\[\^([^\] \n]+)\]/.exec(state.src.slice(state.pos, state.posMax));
    if (match && !source.defined.has(match[1])) {
      if (!silent) state.push("literal_syntax", "", 0).meta = { footnote: true, label: match[1] } satisfies LiteralSyntax;
      state.pos += match[0].length;
      return true;
    }
    // Label helpers call skipToken in silent mode. Diagnostics must not make failed
    // references look like real links during that lookahead, or recurse into themselves.
    // Inside a valid link, nested reference shapes are intentional display text.
    // Keep code and existing footnote diagnostics independent of this exclusion.
    // markdown-it 13 tracks linkLevel at runtime; the installed typings omit it.
    if (silent || (state as typeof state & { linkLevel: number }).linkLevel > 0) return false;
    const start = state.pos;
    const image = state.src[start] === "!";
    const opening = start + (image ? 1 : 0);
    if (state.src[opening] !== "[") return false;
    const textEnd = state.md.helpers.parseLinkLabel(state, opening, !image);
    // Citation-like brackets (including locators/prefixes) must not silently become
    // text when citations are disabled. Earlier rules already consumed actual links,
    // escapes, code and math. Escaping either the opening bracket or @ is literal.
    if (!image && textEnd > opening &&
        /(^|[^\\])(?:\\\\)*@[\w{]/.test(state.src.slice(opening + 1, textEnd))) {
      state.push("literal_syntax", "", 0).meta = {
        syntax: "citation", source: state.src.slice(opening, textEnd + 1),
      } satisfies CitationSyntax;
      state.pos = textEnd + 1;
      return true;
    }
    if (textEnd < 0 || textEnd + 1 >= state.posMax || state.src[textEnd + 1] !== "[") return false;
    const labelEnd = state.md.helpers.parseLinkLabel(state, textEnd + 1);
    if (labelEnd < 0) return false;
    const label = state.src.slice(textEnd + 2, labelEnd) || state.src.slice(opening + 1, textEnd);
    if (!label || state.env.references?.[state.md.utils.normalizeReference(label)]) return false;
    state.push("literal_syntax", "", 0).meta = {
      syntax: image ? "reference-image" : "reference-link", label, source: state.src.slice(start, labelEnd + 1),
    } satisfies LiteralSyntax;
    state.pos = labelEnd + 1;
    return true;
  });
  type Token = ReturnType<typeof tokenizer.parse>[number];
  const found: ((LiteralSyntax | CitationSyntax) & { line: number })[] = [];
  const visit = (tokens: Token[], initialLine = 1, initialFootnoteDepth = 0): void => {
    let line = initialLine;
    const skipped: boolean[] = [];
    let footnoteDepth = initialFootnoteDepth;
    for (const token of tokens) {
      if (token.map) line = token.map[0] + 1;
      if (token.nesting === 1) {
        // Role bodies are tokenized even for non-text roles such as {math} and {eq}.
        if (token.type === "footnote_open" || token.type === "footnote_reference_open") footnoteDepth++;
        skipped.push(token.type === "parsed_role_open" && !["del", "sub", "sup"].includes(token.info));
      }
      if (!skipped.includes(true)) {
        if (token.type === "literal_syntax" && (!footnoteDepth || token.meta.syntax === "citation"))
          found.push({ ...token.meta as LiteralSyntax | CitationSyntax, line });
        // Image children are alt text, not body text.
        if (token.children && token.type !== "image") visit(token.children, line, footnoteDepth);
      }
      if (token.nesting === -1) skipped.pop();
      if (token.type === "footnote_close" || token.type === "footnote_reference_close") footnoteDepth--;
    }
  };
  visit(tokenizer.parse(source.text, {}));
  if (found.length === 0) return [];
  // Only actual body text counts, including text in lifted directive captions. A
  // directive's tokenized body may instead have become non-text math or code.
  const textRanges = (node: MystNode, range = node.position): NonNullable<MystNode["position"]>[] => {
    if (["code", "inlineCode", "math", "inlineMath", "image", "crossReference"].includes(node.type)) return [];
    if (node.type === "text") return range ? [range] : [];
    return (node.children ?? []).flatMap(child => textRanges(child, node.position ?? range));
  };
  const lineBlocks = new Map<number, number>();
  document.children.forEach((node, index) => {
    for (const range of textRanges(node)) {
      for (let line = range.start.line; line <= range.end.line; line++) {
        // Keep the first containing block, as the original range scan did.
        if (!lineBlocks.has(line)) lineBlocks.set(line, index);
      }
    }
  });
  return found.flatMap(diagnostic => {
    const { line } = diagnostic;
    const index = lineBlocks.get(line);
    return index === undefined ? [] : [{ ...diagnostic, path: [index] }];
  });
}

const CJK = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function codePointBefore(text: string, position: number): number {
  const low = text.charCodeAt(position - 1);
  return low >= 0xDC00 && low <= 0xDFFF && position > 1 ? text.codePointAt(position - 2)! : low;
}

type Tokenizer = ReturnType<typeof createTokenizer>;
type InlineState = Parameters<Parameters<Tokenizer["inline"]["ruler"]["push"]>[1]>[0];
type Delimiter = InlineState["delimiters"][number];
type EmphasisRun = { start: number; length: number; open: boolean; close: boolean };

/** Emphasis runs MyST read as literal text only because of CommonMark's punctuation
 * flanking rule, as in `**정확도(Accuracy)**를`. The parser's own scanDelims and pairing
 * rule decide; the only change is the documented repair: the adjacent outside character
 * written as a character reference (punctuation `&`) when the inside character is punctuation.
 * A pair that pairs only after that repair, and not in the actual parse, warns. */
function observeEmphasis(tokenizer: Tokenizer, inUrl: (state: InlineState, position: number) => boolean): void {
  const emphasis = installedRule(tokenizer.inline.ruler, "emphasis");
  const balancePairs = installedRule(tokenizer.inline.ruler2, "balance_pairs");
  const runs = new WeakMap<Delimiter, EmphasisRun>();
  const flags = new WeakMap<Delimiter, { open: boolean; close: boolean }>();
  const { isWhiteSpace, isPunctChar, isMdAsciiPunct } = tokenizer.utils;
  const punctuation = (code: number) => isMdAsciiPunct(code) || isPunctChar(String.fromCharCode(code));
  const word = (code: number) => !isWhiteSpace(code) && !punctuation(code);
  tokenizer.inline.ruler.at("emphasis", (state, silent) => {
    const start = state.pos;
    const before = state.delimiters.length;
    if (!emphasis(state, silent)) return false;
    const marker = state.src.charCodeAt(start);
    const length = state.pos - start;
    const end = start + length;
    // Rescan with one outside character replaced, as a character reference would.
    // scanDelims reads only the run and one character on each side, so the copy
    // holds just those: a candidate costs the same however long its paragraph is.
    const rescan = (outside: number) => {
      const window = state.src.slice(start - 1, end + 1);
      const at = outside - (start - 1);
      const replaced = new state.md.inline.State(window.slice(0, at) + "&" + window.slice(at + 1), state.md, state.env, []);
      return replaced.scanDelims(1, marker === 0x2A);
    };
    const { can_open: open, can_close: close } = state.scanDelims(start, marker === 0x2A);
    // A run beside a backslash-escaped marker (`\**`) is partly literal by intent.
    const escaped = state.src.charCodeAt(start - 1) === marker;
    const run = {
      start, length,
      open: open || (!escaped && start > 0 && end < state.posMax && word(state.src.charCodeAt(start - 1)) &&
        punctuation(state.src.charCodeAt(end)) && rescan(start - 1).can_open),
      close: close || (!escaped && end < state.posMax && start > 0 && word(state.src.charCodeAt(end)) &&
        punctuation(state.src.charCodeAt(start - 1)) && rescan(end).can_close),
    };
    for (const delimiter of state.delimiters.slice(before)) runs.set(delimiter, run);
    return true;
  });
  const lists = (state: InlineState) =>
    [state.delimiters, ...state.tokens_meta.map(meta => meta?.delimiters ?? [])];
  // Pairing mutates open/close; keep the scanned flags for the repaired pairing below.
  tokenizer.inline.ruler2.before("balance_pairs", "literal_emphasis_flags", state => {
    for (const list of lists(state)) for (const delimiter of list) flags.set(delimiter, { open: delimiter.open, close: delimiter.close });
    return false;
  });
  tokenizer.inline.ruler2.after("balance_pairs", "literal_emphasis", state => {
    const found = new Map<string, LiteralSyntax>();
    for (const list of lists(state)) {
      const matched = new Set(list.flatMap((delimiter, index) => delimiter.end < 0 ? [] : [index, delimiter.end]));
      // A run that already serves real emphasis, as in `**(a)***x**`, is not literal.
      const used = new Set([...matched].map(index => runs.get(list[index])));
      const repaired = list.map(delimiter => {
        const run = runs.get(delimiter);
        return { ...delimiter, end: -1, ...(run ? { open: run.open, close: run.close } : flags.get(delimiter)) };
      });
      // The pairing rule reads only these two fields.
      balancePairs({ delimiters: repaired, tokens_meta: [] } as unknown as InlineState);
      repaired.forEach((opener, index) => {
        if (opener.end < 0 || matched.has(index) || matched.has(opener.end)) return;
        const first = runs.get(list[index]);
        const last = runs.get(list[opener.end]);
        if (!first || !last || used.has(first) || used.has(last)) return;
        // Only pairs blocked by the flanking rule; ordinary literal runs never pair here.
        const strictOpen = flags.get(list[index])!.open;
        const strictClose = flags.get(list[opener.end])!.close;
        if (strictOpen && strictClose) return;
        // Single `*`/`_` is often multiplication or code (`2*(3+4)* 5`, `α*(β+γ)*δ`).
        // The writing this diagnostic targets attaches a CJK particle or ending to one
        // side (`*(주의)*를`), so a single run warns only when the other side is already
        // a strict delimiter and the one repaired outside character is CJK.
        if (first.length < 2 || last.length < 2) {
          if (!strictOpen && !strictClose) return;
          const outside = strictOpen ? state.src.codePointAt(last.start + last.length)! : codePointBefore(state.src, first.start);
          if (!CJK.test(String.fromCodePoint(outside))) return;
        }
        if (inUrl(state, first.start) || inUrl(state, last.start)) return;
        found.set(`${first.start}:${last.start}`, {
          syntax: "emphasis", source: state.src.slice(first.start, last.start + last.length),
        });
      });
    }
    for (const meta of found.values()) state.push("literal_syntax", "", 0).meta = meta;
    return false;
  });
}
