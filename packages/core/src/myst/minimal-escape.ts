import type { MystNode } from "./tree.ts";

// mdast-util-to-markdown's `unsafe` pattern shape and the parts of its state this handler uses.
type Unsafe = { character: string; before?: string; after?: string; atBreak?: boolean;
  inConstruct?: string | string[]; notInConstruct?: string | string[] };
type State = { unsafe: Unsafe[]; safe(value: string, config: object): string };

/** Characters whose upstream escape this module may narrow (`$` is Core's own escape). */
const CANDIDATE = /[_[&(#$]/;
const CANDIDATE_KEEPING_BRACKETS = /[_&(#$]/;
// Marked text nodes, by whether their brackets keep the upstream escapes.
const marked = new WeakMap<MystNode, boolean>();

/** Default MyST reads `[... @key ...]` as a bracket citation even with the `@` escaped, so a block
 * with any literal `@` keeps every bracket escaped. Core's own shorthand check sees only unescaped `@`. */
export function holdsAt(node: MystNode): boolean {
  return node.type === "text" ? String(node.value).includes("@") : (node.children ?? []).some(holdsAt);
}

/** Mark a text node on the write clone to be written with the narrowed rules.
 * Returns whether its value holds a character those rules can leave unescaped. */
export function markMinimalEscape(node: MystNode, keepBrackets: boolean): boolean {
  if (node.type !== "text" || !(keepBrackets ? CANDIDATE_KEEPING_BRACKETS : CANDIDATE).test(String(node.value))) return false;
  marked.set(node, keepBrackets);
  return true;
}

// The upstream rules that escape a character wherever it occurs, replaced below by rules for
// the positions where it can start syntax. The narrowed form is only a candidate: the canonical
// write keeps it for a block only when the whole document reads back the same, and otherwise
// writes that block with the upstream rules again. The GFM footnote extension adds its own `[`
// rule for phrasing, labels and references; the core label/reference rule still covers those two.
const replaced = (pattern: Unsafe): boolean => {
  const phrasing = pattern.inConstruct === "phrasing";
  switch (pattern.character) {
    case "_": return phrasing && !pattern.atBreak;
    case "[": return phrasing || (Array.isArray(pattern.inConstruct) && pattern.inConstruct.includes("phrasing")) ||
      (pattern.atBreak === true && pattern.inConstruct === undefined);
    case "&": return phrasing;
    case "(": return phrasing && pattern.before === "\\]";
    case "#": return (pattern.atBreak === true && pattern.after === undefined && pattern.inConstruct === undefined) ||
      pattern.inConstruct === "headingAtx";
    case "!": return phrasing && pattern.after === "\\[";
    default: return false;
  }
};
// Same constructs as upstream's `fullPhrasingSpans`, where these characters are literal anyway.
const notInConstruct = ["autolink", "destinationLiteral", "destinationRaw", "reference", "titleQuote", "titleApostrophe"];
const narrowedRules: Unsafe[] = [
  // An underscore between ASCII letters or digits cannot open or close emphasis.
  { character: "_", before: "[^A-Za-z0-9]", inConstruct: "phrasing", notInConstruct },
  { character: "_", after: "[^A-Za-z0-9]", inConstruct: "phrasing", notInConstruct },
  // Footnote references and citation shorthand can depend on other blocks.
  { character: "[", after: "[\\^@]", inConstruct: "phrasing", notInConstruct },
  // A task marker or footnote definition at a line start.
  { atBreak: true, character: "[", after: "(?:[ xX]\\]|\\^)" },
  // Only a terminated reference is a character reference.
  { character: "&", after: "(?:#[0-9]+|#[xX][0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]*);", inConstruct: "phrasing" },
  // An ATX heading needs whitespace or the line end after one to six signs, and its closing
  // sequence needs whitespace before it (`C#` ends a heading as text).
  { atBreak: true, character: "#", after: "#{0,5}(?:[ \\t\\r\\n]|$)" },
  { character: "#", before: "(?:^|[ \\t])", after: "#*(?:[\\r\\n]|$)", inConstruct: "headingAtx" },
  // `![[file]]` (an embed in some editors) cannot be an image without a following destination;
  // a single bracket keeps upstream's image guard.
  { character: "!", after: "\\[(?!\\[)", inConstruct: "phrasing", notInConstruct },
];
const narrowedLists = new WeakMap<Unsafe[], [Unsafe[], Unsafe[]]>();

/** Text handler for myst-to-md: upstream's own `safe`, with the narrowed rules for marked nodes. */
export function minimalEscapeText(node: MystNode, _parent: unknown, state: State, info: object): string {
  const keepBrackets = marked.get(node);
  if (keepBrackets === undefined) return state.safe(String(node.value), info);
  const full = state.unsafe;
  let lists = narrowedLists.get(full);
  if (!lists) {
    const narrow = (brackets: boolean) => [
      ...full.filter(pattern => !replaced(pattern) || (brackets && pattern.character === "[")),
      ...narrowedRules.filter(pattern => !brackets || pattern.character !== "["),
    ];
    narrowedLists.set(full, lists = [narrow(false), narrow(true)]);
  }
  state.unsafe = lists[keepBrackets ? 1 : 0];
  try { return state.safe(String(node.value), info); }
  finally { state.unsafe = full; }
}
