/**
 * External-conventions profile: CommonMark + GFM subset + `$` math + YAML frontmatter only.
 * No parser extension of our own: GitHub alerts, Pandoc attributes / fenced divs / citations,
 * Quarto cross-references and the HTML table are recognized by post-passes over the mdast
 * (with source positions), which markdown-rs can produce as well.
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
import remarkFrontmatter from "remark-frontmatter";
import { defaultHandlers, type Handle } from "mdast-util-to-markdown";
import type { Root } from "mdast";

const list: Handle = (node, parent, state, info) => {
  if (!node.ordered) return defaultHandlers.list(node, parent, state, info);
  const saved = state.options.bulletOrdered;
  state.options.bulletOrdered = node.data?.delimiter ?? ".";
  state.bulletLastUsed = undefined;
  try { return defaultHandlers.list(node, parent, state, info); }
  finally { state.options.bulletOrdered = saved; }
};

function gfmSubset(this: any) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(gfmFootnote(), gfmStrikethrough({ singleTilde: false }), gfmTable(), gfmTaskListItem());
  (data.fromMarkdownExtensions ??= []).push(gfmFootnoteFromMarkdown(), gfmStrikethroughFromMarkdown(), gfmTableFromMarkdown(), gfmTaskListItemFromMarkdown());
  (data.toMarkdownExtensions ??= []).push(gfmFootnoteToMarkdown(), gfmStrikethroughToMarkdown(), gfmTableToMarkdown({ tablePipeAlign: true }), gfmTaskListItemToMarkdown());
}

/** Literal text that the profile's conventions would otherwise read as syntax. */
function profileEscapes(this: any) {
  (this.data().toMarkdownExtensions ??= []).push({
    unsafe: [
      // Pandoc citation / Quarto cross-reference start.
      { character: "@", inConstruct: "phrasing", after: String.raw`[\p{L}\p{N}_{]`, unicode: true },
      // Pandoc attributes `{#id}` after headings, captions, images and display math.
      { character: "{", inConstruct: "phrasing" },
      // Fenced div fences (`:::`) and table caption lines (`: Caption`).
      { character: ":", atBreak: true },
    ],
  });
}

export const parser = unified().use(remarkParse).use(remarkFrontmatter).use(gfmSubset).use(remarkMath);

export const writer = unified()
  .use(remarkStringify, {
    bullet: "*", bulletOther: "-", emphasis: "*", strong: "*", fence: "`", rule: "-",
    listItemIndent: "one", incrementListMarker: true, handlers: { list },
  })
  .use(remarkFrontmatter).use(gfmSubset).use(remarkMath).use(profileEscapes);

export const parseMarkdown = (source: string) => parser.parse(source) as Root;
export const stringifyMarkdown = (tree: Root) => writer.stringify(tree);

/** Pandoc attribute block `{#id .class key="value"}`. */
export type Attributes = { id?: string; classes: string[]; values: Record<string, string> };

const PANDOC_ID = /^[\p{L}\p{N}_\-:.]+$/u;
const quote = (value: string) => `"${value.replace(/[\\"]/g, c => `\\${c}`)}"`;

export function formatAttributes({ id, classes, values }: Attributes): string {
  const parts = [
    ...(id === undefined ? [] : [PANDOC_ID.test(id) ? `#${id}` : `id=${quote(id)}`]),
    ...classes.map(name => `.${name}`),
    ...Object.entries(values).map(([key, value]) => `${key}=${quote(value)}`),
  ];
  return `{${parts.join(" ")}}`;
}

export function parseAttributes(text: string): Attributes | undefined {
  const match = /^\{(.*)\}$/s.exec(text);
  if (!match) return undefined;
  const out: Attributes = { classes: [], values: {} };
  const token = /\s*(?:#([^\s}"]+)|\.([^\s}"]+)|([A-Za-z][\w-]*)=(?:"((?:[^"\\]|\\.)*)"|([^\s}"]+)))/gy;
  let consumed = 0;
  let found: RegExpExecArray | null;
  while ((found = token.exec(match[1]))) {
    consumed = token.lastIndex;
    if (found[1] !== undefined) out.id = found[1];
    else if (found[2] !== undefined) out.classes.push(found[2]);
    else {
      const value = found[4] !== undefined ? found[4].replace(/\\(.)/g, "$1") : found[5];
      if (found[3] === "id") out.id = value; else out.values[found[3]] = value;
    }
  }
  return match[1].slice(consumed).trim() ? undefined : out;
}
