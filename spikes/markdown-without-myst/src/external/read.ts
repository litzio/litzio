/**
 * External-conventions Markdown → mdast (CommonMark/GFM/math only) → post-passes → comparison model.
 * Every convention outside CommonMark/GFM/math is recognized from mdast plus source positions,
 * so the same passes can run over markdown-rs output. Fails closed with `Unsupported`.
 */
import { parse as parseYaml } from "yaml";
import { decodeString } from "micromark-util-decode-string";
import type { Block, Inline, Model } from "../model.ts";
import { Unsupported } from "../directive/read.ts";
import { parseAttributes, parseMarkdown, type Attributes } from "./format.ts";
import { ALERT_OF } from "./write.ts";

type Node = Record<string, any>;
const KIND_OF_ALERT = Object.fromEntries(Object.entries(ALERT_OF).map(([kind, alert]) => [alert, kind]));
const REFERENCE_ROLE: Record<string, string> = { "eq-": "eq", "fig-": "numref", "tbl-": "numref", "sec-": "ref" };
const KEY = String.raw`(?:\{[^}]*\}|[\p{L}\p{N}_](?:[\p{L}\p{N}_]|[:.#$%&\-+?<>~/](?=[\p{L}\p{N}_]))*)`;
// A bracket group may follow a word (`note[@a]`); a bare `@key` may not (`a@b.c` is text).
const CITATION = new RegExp(String.raw`(?<!\\)\[(@${KEY}(?:;\s*@${KEY})*)\]|(?<![\\\p{L}\p{N}_\[])@(${KEY})`, "gu");
const LIST_STYLES = new Set(["lower-alpha", "upper-alpha", "lower-roman", "upper-roman"]);

class Reader {
  constructor(readonly source: string) {}

  raw(node: Node): string { return this.source.slice(node.position.start.offset, node.position.end.offset); }

  /** `raw` of a paragraph that is a single fence line `::: {…}` or `:::`. */
  fence(node: Node): Attributes | "close" | undefined {
    if (node?.type !== "paragraph") return undefined;
    const raw = this.raw(node);
    if (raw === ":::") return "close";
    const match = /^::: (\{.*\})$/.exec(raw);
    if (!match) return undefined;
    const attributes = parseAttributes(match[1]);
    if (!attributes) throw new Unsupported("attributes", `div ${raw}`);
    return attributes;
  }

  /** Trailing unescaped ` {…}` of the last text child (heading, caption line, display math). */
  trailingAttributes(children: Node[]): { attributes: Attributes; children: Node[] } | undefined {
    const last = children.at(-1);
    if (last?.type !== "text") return undefined;
    const raw = this.raw(last);
    const match = /(?:^| )(\{[^{}]*\})$/.exec(raw);
    if (!match || raw[match.index + (match[0].startsWith(" ") ? 1 : 0) - 1] === "\\") return undefined;
    const attributes = parseAttributes(match[1]);
    if (!attributes) return undefined;
    const decoded = decodeString(match[0]);
    if (!last.value.endsWith(decoded)) throw new Unsupported("attributes", "attribute text");
    const value = last.value.slice(0, -decoded.length);
    const end = { offset: last.position.end.offset - match[0].length };
    return { attributes, children: [...children.slice(0, -1), ...(value ? [{ ...last, value, position: { start: last.position.start, end } }] : [])] };
  }

  inline(input: Node[], context: { inCell?: boolean } = {}): Inline[] {
    // micromark can split text at `[` / `]`; a citation such as `[@a]` may span several text nodes.
    const nodes: Node[] = [];
    for (const node of input) {
      const last = nodes.at(-1);
      if (node.type === "text" && last?.type === "text" && last.position.end.offset === node.position.start.offset) {
        nodes[nodes.length - 1] = { ...last, value: last.value + node.value, position: { start: last.position.start, end: node.position.end } };
      } else nodes.push(node);
    }
    const out: Inline[] = [];
    const push = (item: Inline) => {
      const last = out.at(-1);
      if (item.kind === "text" && last?.kind === "text") last.text = (last.text as string) + item.text; else out.push(item);
    };
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      switch (node.type) {
        case "text": this.citations(node).forEach(push); break;
        case "break": push({ kind: "break" }); break;
        case "inlineMath": push({ kind: "math", value: node.value }); break;
        case "inlineCode": push({ kind: "code", value: node.value }); break;
        case "strong": case "emphasis": case "delete": push({ kind: node.type, children: this.inline(node.children, context) }); break;
        case "link": push({ kind: "link", url: node.url, ...(node.title != null ? { title: node.title } : {}), children: this.inline(node.children, context) }); break;
        case "footnoteReference": push({ kind: "footnote", label: node.label ?? node.identifier }); break;
        case "html": {
          const tag = /^<(sub|sup)>$/.exec(node.value);
          if (tag) {
            const close = nodes.findIndex((other, j) => j > i && other.type === "html" && other.value === `</${tag[1]}>`);
            if (close < 0) throw new Unsupported("html", `unclosed <${tag[1]}>`);
            push({ kind: tag[1] === "sub" ? "subscript" : "superscript", children: this.inline(nodes.slice(i + 1, close), context) });
            i = close;
          } else if (context.inCell && /^<br\s*\/?>$/i.test(node.value)) push({ kind: "break" });
          else if (node.value === "<!---->" && /^inline(Math|Code)$/.test(nodes[i - 1]?.type) && /^inline(Math|Code)$/.test(nodes[i + 1]?.type)) { /* separator */ }
          else throw new Unsupported("html", `inline HTML ${JSON.stringify(node.value.slice(0, 30))}`);
          break;
        }
        case "image": throw new Unsupported("image", "inline image outside a figure");
        case "linkReference": case "imageReference": throw new Unsupported("reference-link", "reference-style link");
        default: throw new Unsupported("inline-other", node.type);
      }
    }
    return out;
  }

  /** Pandoc citations and Quarto cross-references inside one text node, found in its unescaped source. */
  citations(node: Node): Inline[] {
    if (!node.value.includes("@")) return [{ kind: "text", text: node.value }];
    const raw = this.raw(node);
    const out: Inline[] = [];
    const literal: string[] = [];
    let last = 0;
    const text = (segment: string) => {
      const value = decodeString(segment.replace(/\r?\n[ \t>]*/g, "\n"));
      literal.push(value);
      if (value) out.push({ kind: "text", text: value });
    };
    const key = (k: string) => k.startsWith("{") ? k.slice(1, -1) : k;
    for (const match of raw.matchAll(CITATION)) {
      text(raw.slice(last, match.index));
      last = match.index + match[0].length;
      literal.push(match[0]);
      if (match[1] !== undefined) {
        const keys = match[1].split(/;\s*/).map(k => key(k.slice(1)));
        if (keys.some(k => /^(?:eq|fig|tbl|sec)-/.test(k))) throw new Unsupported("reference-bracket", match[0]);
        out.push({ kind: "citation", role: "cite:p", keys });
      } else {
        const label = key(match[2]);
        const prefix = Object.keys(REFERENCE_ROLE).find(p => label.startsWith(p));
        out.push(prefix ? { kind: "reference", role: REFERENCE_ROLE[prefix], label } : { kind: "citation", role: "cite:t", keys: [label] });
      }
    }
    text(raw.slice(last));
    // Decoded segments and markers must reproduce the parser's text; otherwise do not guess.
    const rebuilt = literal.join("");
    if (rebuilt !== node.value) throw new Unsupported("citation-parse", JSON.stringify(node.value.slice(0, 60)));
    return out;
  }

  list(node: Node, style?: string): Record<string, unknown> {
    const items = node.children as Node[];
    const checks = items.map(item => item.checked);
    const checklist = !node.ordered && checks.length > 0 && checks.every(c => typeof c === "boolean");
    if (!checklist && checks.some(c => typeof c === "boolean")) throw new Unsupported("list", "partial or numbered checklist");
    let delimiter: string | undefined;
    if (node.ordered) {
      const first = items[0].position.start.offset;
      delimiter = /^\d+([.)])/.exec(this.source.slice(first, first + 12))?.[1];
    }
    return {
      ordered: node.ordered === true,
      ...(checklist ? { checklist: true } : {}),
      ...(node.ordered ? { start: node.start ?? 1 } : {}),
      ...(style ? { style } : {}),
      ...(delimiter === ")" ? { delimiter: ")" } : {}),
      items: items.map(item => {
        const children = item.children as Node[];
        let index = 0;
        let content: Inline[] = [];
        if (children[index]?.type === "paragraph" && !this.fence(children[index])) content = this.inline(children[index++].children);
        let nested: Record<string, unknown> | undefined;
        const open = this.fence(children[index]);
        if (open && open !== "close") {
          nested = this.styledList(open, children.slice(index + 1, index + 2));
          if (this.fence(children[index + 2]) !== "close") throw new Unsupported("nesting", "list style div");
          index += 3;
        } else if (children[index]?.type === "list") nested = this.list(children[index++]);
        if (index !== children.length) throw new Unsupported("nesting", `list item holds ${children.slice(index).map(c => c.type).join(",")}`);
        return { content, ...(checklist ? { checked: item.checked } : {}), ...(nested ? { list: nested } : {}) };
      }),
    };
  }

  styledList(attributes: Attributes, inner: Node[]): Record<string, unknown> {
    const [style, ...rest] = attributes.classes;
    if (inner.length !== 1 || inner[0].type !== "list" || !inner[0].ordered || !LIST_STYLES.has(style) || rest.length || attributes.id || Object.keys(attributes.values).length) {
      throw new Unsupported("div", "list style div");
    }
    return this.list(inner[0], style);
  }

  numberFields(attributes: Attributes, what: string, extraClass?: string) {
    const classes = attributes.classes.filter(name => name !== extraClass);
    const { enumerator, ...rest } = attributes.values;
    if (Object.keys(rest).length || classes.some(name => name !== "unnumbered")) throw new Unsupported("attributes", `${what} attributes`);
    return {
      ...(enumerator !== undefined ? { enumerator } : {}),
      ...(classes.includes("unnumbered") ? { enumerated: false } : {}),
      label: attributes.id,
    };
  }

  simpleCells(table: Node) {
    return (table.children as Node[]).map((row, rowIndex) => ({
      cells: (row.children as Node[]).map((cell, cellIndex) => ({
        content: this.inline(cell.children, { inCell: true }), header: rowIndex === 0,
        ...(table.align?.[cellIndex] ? { align: table.align[cellIndex] } : {}),
      })),
    }));
  }

  /** A complex grid: HTML skeleton chunks with Markdown blocks inside cells. Returns blocks consumed. */
  complexGrid(nodes: Node[], start: number): { grid: Record<string, unknown>; end: number } {
    const rows: { cells: Record<string, unknown>[] }[] = [];
    const occupied: boolean[][] = [];
    let headerRows = 0, group = "", cell: Record<string, any> | undefined, done = false, i = start;
    for (; i < nodes.length && !done; i++) {
      const node = nodes[i];
      if (node.type !== "html") {
        if (!cell) throw new Unsupported("table", `${node.type} outside a cell`);
        if (node.type === "paragraph") cell.blocks.push({ kind: "paragraph", content: this.inline(node.children) });
        else if (node.type === "list") cell.blocks.push({ kind: "list", list: this.list(node) });
        else throw new Unsupported("table", `${node.type} in a cell`);
        continue;
      }
      const tag = /<(\/?)(table|thead|tbody|tr|th|td)((?:\s+[a-z]+="[^"]*")*)\s*>/g;
      let consumed = 0;
      for (const match of node.value.matchAll(tag)) {
        if (node.value.slice(consumed, match.index).trim()) throw new Unsupported("table", "text between tags");
        consumed = match.index + match[0].length;
        const [, close, name, attrs] = match;
        if (!close && (name === "thead" || name === "tbody")) group = name;
        else if (!close && name === "tr") { rows.push({ cells: [] }); if (group === "thead") headerRows++; }
        else if (!close && (name === "th" || name === "td")) {
          const r = rows.length - 1;
          occupied[r] ??= [];
          let column = 0;
          while (occupied[r][column]) column++;
          const get = (key: string) => new RegExp(`${key}="([^"]*)"`).exec(attrs)?.[1];
          const rowspan = Number(get("rowspan") ?? 1), colspan = Number(get("colspan") ?? 1);
          for (let a = 0; a < rowspan; a++) for (let b = 0; b < colspan; b++) (occupied[r + a] ??= [])[column + b] = true;
          const align = /text-align: (left|center|right)/.exec(get("style") ?? "")?.[1];
          cell = { header: name === "th", ...(align ? { align } : {}), column, rowspan, colspan, blocks: [] };
          rows[r].cells.push(cell);
        } else if (close && (name === "th" || name === "td")) {
          if (cell && cell.blocks.length === 1 && cell.blocks[0].kind === "paragraph") cell.content = cell.blocks[0].content;
          cell = undefined;
        } else if (close && name === "table") done = true;
      }
      if (node.value.slice(consumed).trim()) throw new Unsupported("table", "text after tags");
    }
    if (!done) throw new Unsupported("table", "unclosed table");
    return { grid: { grid: "complex", headerRows, rows }, end: i };
  }

  /** `: Caption {attrs}` paragraph after a grid (Pandoc table caption). */
  captionLine(node: Node | undefined): { caption?: Inline[]; attributes?: Attributes } | undefined {
    if (node?.type !== "paragraph") return undefined;
    const first = node.children[0];
    // Pandoc caption: a colon followed by a space (or alone). `:::` is a fenced div, not a caption.
    if (first?.type !== "text" || !/^:(?: |$)/.test(this.raw(first)) || !first.value.startsWith(":")) return undefined;
    const shift = (n: Node, count: number) => ({ ...n, value: n.value.slice(count), position: { start: { offset: n.position.start.offset + count }, end: n.position.end } });
    let children = [shift(first, 1), ...node.children.slice(1)];
    const trailing = this.trailingAttributes(children);
    if (trailing) children = trailing.children;
    if (children[0]?.type === "text" && children[0].value.startsWith(" ")) children[0] = shift(children[0], 1);
    children = children.filter(c => !(c.type === "text" && c.value === ""));
    return { ...(children.length ? { caption: this.inline(children) } : {}), ...(trailing ? { attributes: trailing.attributes } : {}) };
  }

  table(nodes: Node[], start: number, divAttributes?: Attributes): { block: Block; end: number } {
    let end: number;
    let grid: Record<string, unknown>;
    if (nodes[start].type === "table") { grid = { rows: this.simpleCells(nodes[start]) }; end = start + 1; }
    else ({ grid, end } = this.complexGrid(nodes, start));
    const line = this.captionLine(nodes[end]);
    if (line) end++;
    if (divAttributes && line?.attributes) throw new Unsupported("attributes", "table attributes twice");
    const attributes = divAttributes ?? line?.attributes ?? { classes: [], values: {} };
    const { label, ...numbers } = this.numberFields(attributes, "table", "table");
    const notes: Inline[][] = [];
    if (divAttributes) {
      for (; end < nodes.length; end++) {
        if (nodes[end].type !== "paragraph") throw new Unsupported("nesting", `table note ${nodes[end].type}`);
        notes.push(this.inline(nodes[end].children));
      }
    }
    return {
      block: { block: "table", ...numbers, ...grid, ...(notes.length ? { notes } : {}), ...(label ? { label } : {}), ...(line?.caption ? { caption: line.caption } : line && !line.caption ? {} : {}) },
      end,
    };
  }

  figure(attributes: Attributes, inner: Node[]): Block {
    const { label, ...numbers } = this.numberFields(attributes, "figure", "figure");
    const children = [...inner];
    let contentKind = "none", imageUrl = "", imageAlt = "", mermaidSource: string | undefined;
    const first = children[0];
    if (first?.type === "paragraph" && first.children[0]?.type === "image") {
      const [image, ...rest] = first.children;
      if (image.alt || image.title != null) throw new Unsupported("attributes", "figure image description or title");
      if (rest.length) {
        const trailing = this.trailingAttributes(rest);
        const { "fig-alt": alt, ...others } = trailing?.attributes.values ?? {};
        if (!trailing || trailing.children.length || trailing.attributes.id || trailing.attributes.classes.length || Object.keys(others).length) throw new Unsupported("attributes", "image attributes");
        imageAlt = alt ?? "";
      }
      contentKind = "image"; imageUrl = image.url; children.shift();
    } else if (first?.type === "code" && first.lang === "mermaid" && !first.meta) {
      contentKind = "mermaid"; mermaidSource = first.value; children.shift();
    }
    if (children.length > 1 || (children[0] && children[0].type !== "paragraph")) throw new Unsupported("nesting", "figure content");
    return {
      block: "figure", ...numbers, label: label ?? "", contentKind, ...(mermaidSource !== undefined ? { mermaidSource } : {}), imageUrl, imageAlt,
      caption: { content: children[0] ? this.inline(children[0].children) : [] },
    };
  }

  div(attributes: Attributes, inner: Node[]): Block {
    if (attributes.id?.startsWith("fig-") || attributes.classes.includes("figure")) return this.figure(attributes, inner);
    if (inner[0]?.type === "table" || (inner[0]?.type === "html" && inner[0].value.startsWith("<table>"))) {
      const { block, end } = this.table(inner, 0, attributes);
      if (end !== inner.length) throw new Unsupported("nesting", "table div");
      return block;
    }
    if (inner.length === 1 && inner[0].type === "math") {
      const { label, enumerated, ...numbers } = this.numberFields(attributes, "equation");
      if (enumerated === false) throw new Unsupported("attributes", "unnumbered equation");
      return { block: "equation", ...numbers, latex: inner[0].value, label: label ?? "" };
    }
    if (attributes.classes.length === 1 && LIST_STYLES.has(attributes.classes[0])) return { block: "list", ...this.styledList(attributes, inner) };
    throw new Unsupported("div", `div ${JSON.stringify(attributes)}`);
  }

  blocks(nodes: Node[]): Block[] {
    const out: Block[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const fence = this.fence(node);
      if (fence === "close") throw new Unsupported("div", "stray closing fence");
      if (fence) {
        const close = nodes.findIndex((other, j) => j > i && this.fence(other) === "close");
        if (close < 0) throw new Unsupported("div", "unclosed div");
        if (nodes.slice(i + 1, close).some(other => this.fence(other))) throw new Unsupported("div", "nested div");
        out.push(this.div(fence, nodes.slice(i + 1, close)));
        i = close;
        continue;
      }
      switch (node.type) {
        case "heading": {
          const trailing = this.trailingAttributes(node.children);
          if (trailing) {
            const { id, classes, values } = trailing.attributes;
            if (!id || classes.length || Object.keys(values).length) throw new Unsupported("attributes", "heading attributes");
            out.push({ block: "target", label: id });
          }
          out.push({ block: "heading", level: node.depth, content: this.inline(trailing?.children ?? node.children) });
          break;
        }
        case "paragraph": {
          const children = node.children as Node[];
          if (children.length === 1 && children[0].type === "image") throw new Unsupported("image", "image paragraph outside a figure");
          if (children[0]?.type === "inlineMath" && this.raw(node).startsWith("$$") && children.length === 2) {
            const trailing = this.trailingAttributes(children.slice(1));
            if (trailing && !trailing.children.length) {
              const { label, enumerated, ...numbers } = this.numberFields(trailing.attributes, "equation");
              if (enumerated === false) throw new Unsupported("attributes", "unnumbered equation");
              out.push({ block: "equation", ...numbers, latex: children[0].value, label: label ?? "" });
              break;
            }
          }
          out.push({ block: "paragraph", content: this.inline(children) });
          break;
        }
        case "blockquote": {
          const paragraph = node.children[0];
          const first = paragraph?.type === "paragraph" ? paragraph.children[0] : undefined;
          const marker = first?.type === "text" ? /^\[!([A-Za-z]+)\](?:\n|$)/.exec(this.raw(first)) : null;
          if (marker && node.children.length === 1) {
            const kind = KIND_OF_ALERT[marker[1].toUpperCase()];
            if (!kind) throw new Unsupported("admonition-kind", marker[1]);
            const value = first.value.replace(/^\[![A-Za-z]+\]\n?/, "");
            const after = this.raw(first).slice(marker[0].length);
            const offset = first.position.start.offset + marker[0].length + (/^[ 	>]*/.exec(after)?.[0].length ?? 0);
            const rest = [...(value ? [{ ...first, value, position: { start: { offset }, end: first.position.end } }] : []), ...paragraph.children.slice(1)];
            out.push({ block: "admonition", variant: kind, content: this.inline(rest) });
            break;
          }
          if (node.children.length > 1 || (node.children[0] && node.children[0].type !== "paragraph")) throw new Unsupported("nesting", "quote");
          out.push({ block: "quote", content: node.children[0] ? this.inline(node.children[0].children) : [] });
          break;
        }
        case "list": out.push({ block: "list", ...this.list(node) }); break;
        case "table": { const { block, end } = this.table(nodes, i); out.push(block); i = end - 1; break; }
        case "html": {
          if (node.value.startsWith("<table>")) { const { block, end } = this.table(nodes, i); out.push(block); i = end - 1; break; }
          if (node.value === "<!-- end list -->" && nodes[i - 1]?.type === "list" && nodes[i + 1]?.type === "list") break;
          throw new Unsupported("html", "block HTML");
        }
        case "math": out.push({ block: "equation", latex: node.value, label: "" }); break;
        case "code":
          if (node.meta) throw new Unsupported("attributes", "code meta");
          out.push({ block: "code", language: node.lang ?? "", code: node.value }); break;
        case "thematicBreak": out.push({ block: "divider" }); break;
        case "footnoteDefinition":
          if (node.children.length !== 1 || node.children[0].type !== "paragraph") throw new Unsupported("nesting", "footnote definition");
          out.push({ block: "footnote", label: node.label ?? node.identifier, content: this.inline(node.children[0].children) });
          break;
        case "definition": throw new Unsupported("reference-link", "link definition");
        default: throw new Unsupported("block-other", node.type);
      }
    }
    return out;
  }
}

export function readDocument(source: string, options: { requireMarker?: boolean } = {}): Model {
  const text = source.replace(/^﻿/, "");
  return mdastToModel(parseMarkdown(text) as Node, text, options);
}

export function mdastToModel(tree: Node, text: string, { requireMarker = true }: { requireMarker?: boolean } = {}): Model {
  const children = tree.children as Node[];
  let frontmatter: Record<string, unknown> = {};
  let start = 0;
  if (children[0]?.type === "yaml") { frontmatter = (parseYaml(children[0].value) ?? {}) as Record<string, unknown>; start = 1; }
  if (requireMarker && frontmatter.litzio !== 1) throw new Unsupported("marker", "missing litzio: 1");
  return { frontmatter, blocks: new Reader(text).blocks(children.slice(start)) };
}
