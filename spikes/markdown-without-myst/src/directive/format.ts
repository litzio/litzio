/**
 * The candidate format: CommonMark + a GFM subset + math + generic directives + YAML frontmatter,
 * read and written by the unified/remark family. Fixed writer options make output canonical.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { gfmFootnote } from "micromark-extension-gfm-footnote";
import { gfmStrikethrough } from "micromark-extension-gfm-strikethrough";
import { gfmTable } from "micromark-extension-gfm-table";
import { gfmTaskListItem } from "micromark-extension-gfm-task-list-item";
import { gfmFootnoteFromMarkdown, gfmFootnoteToMarkdown } from "mdast-util-gfm-footnote";
import { gfmStrikethroughFromMarkdown, gfmStrikethroughToMarkdown } from "mdast-util-gfm-strikethrough";
import { gfmTableFromMarkdown, gfmTableToMarkdown } from "mdast-util-gfm-table";
import { gfmTaskListItemFromMarkdown, gfmTaskListItemToMarkdown } from "mdast-util-gfm-task-list-item";
import remarkMath from "remark-math";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import { defaultHandlers, type Handle } from "mdast-util-to-markdown";
import type { Root } from "mdast";

// Ordered lists keep their own delimiter. The default writer alternates `.` / `)` between
// adjacent lists, which would change meaning; the writer inserts a `::list` boundary instead.
const list: Handle = (node, parent, state, info) => {
  if (!node.ordered) return defaultHandlers.list(node, parent, state, info);
  const saved = state.options.bulletOrdered;
  state.options.bulletOrdered = node.data?.delimiter ?? ".";
  state.bulletLastUsed = undefined;
  try { return defaultHandlers.list(node, parent, state, info); }
  finally { state.options.bulletOrdered = saved; }
};

/**
 * GFM without autolink literals (bare URLs stay text, as with Core's disabled linkify) and
 * without single-tilde strikethrough. Tables, task lists, footnotes and `~~` stay.
 */
function gfmSubset(this: any) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(gfmFootnote(), gfmStrikethrough({ singleTilde: false }), gfmTable(), gfmTaskListItem());
  (data.fromMarkdownExtensions ??= []).push(gfmFootnoteFromMarkdown(), gfmStrikethroughFromMarkdown(), gfmTableFromMarkdown(), gfmTaskListItemFromMarkdown());
  (data.toMarkdownExtensions ??= []).push(gfmFootnoteToMarkdown(), gfmStrikethroughToMarkdown(), gfmTableToMarkdown({ tablePipeAlign: true }), gfmTaskListItemToMarkdown());
}

// No lookahead after a known name: the next character may itself be escaped (`:sub\_`), which
// ends the directive name in the output even though `_` is a name character in the text.
// micromark-extension-directive 4.0.0 also accepts a tab inside a name (`:x\t{b}` → name "x\t").
const KNOWN_NAME_OR_LABELLED = String.raw`sub|sup|eq|numref|ref|math|cite|[\w\t-]+[\[{]`;

/**
 * Escaping of `:` (mdast-util-directive 3.2.1 workarounds, measured in this spike):
 * - The upstream rule escapes every `:` before a letter or digit (`10\:30`). The reader keeps an
 *   unknown bare `:name` as text, so only known names and `:name[` / `:name{` need the escape.
 * - The upstream rule has `before: [^:]`; when the previous character is itself escaped
 *   (`\$:sub`), the writer drops the `:` escape and the text reads back as a directive.
 * - Image alt is plain text in mdast: a directive inside it vanishes, so every `:name` is escaped there.
 */
function colonEscapes(this: any) {
  const extensions = (this.data().toMarkdownExtensions ??= []);
  for (const extension of extensions) {
    for (const rule of extension.unsafe ?? []) {
      if (rule.character === ":" && rule.after === String.raw`[^\s\p{P}\p{S}]`) {
        rule.after = KNOWN_NAME_OR_LABELLED;
        delete rule.before;
      }
    }
  }
  extensions.push({ unsafe: [{ character: ":", inConstruct: "label", after: String.raw`[\w-]` }] });
}

export const parser = unified().use(remarkParse).use(remarkFrontmatter).use(gfmSubset).use(remarkMath).use(remarkDirective);

export const writer = unified()
  .use(remarkStringify, {
    bullet: "*", bulletOther: "-", emphasis: "*", strong: "*", fence: "`", rule: "-",
    listItemIndent: "one", incrementListMarker: true, handlers: { list },
  })
  .use(remarkFrontmatter).use(gfmSubset).use(remarkMath).use(remarkDirective).use(colonEscapes);

export function parseMarkdown(source: string): Root {
  return parser.parse(source) as Root;
}

export function stringifyMarkdown(tree: Root): string {
  return writer.stringify(tree);
}

/**
 * Attribute text for math fence meta: `{#id key="value"}`. The fence meta is decoded once
 * (character references, backslash escapes) by the parser, so values use backslash escapes
 * that the writer doubles.
 */
export function metaAttributes(attributes: Record<string, string>): string {
  const parts = Object.entries(attributes).map(([key, value]) =>
    key === "id" && /^[A-Za-z0-9_-]+$/.test(value) ? `#${value}` : `${key}="${value.replace(/[\\"]/g, (c) => `\\${c}`)}"`);
  return parts.length ? `{${parts.join(" ")}}` : "";
}

export function parseMetaAttributes(meta: string | null | undefined): Record<string, string> | undefined {
  if (!meta) return {};
  const match = /^\{(.*)\}$/.exec(meta.trim());
  if (!match) return undefined;
  const out: Record<string, string> = {};
  const pattern = /\s*(?:#([A-Za-z0-9_-]+)|([A-Za-z][A-Za-z0-9_-]*)="((?:[^"\\]|\\.)*)")/gy;
  const rest = match[1];
  let found: RegExpExecArray | null;
  let consumed = 0;
  while ((found = pattern.exec(rest))) {
    consumed = pattern.lastIndex;
    if (found[1] !== undefined) out.id = found[1];
    else out[found[2]] = found[3].replace(/\\(.)/g, "$1");
  }
  if (rest.slice(consumed).trim()) return undefined;
  return out;
}
