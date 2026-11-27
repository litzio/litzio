/**
 * Candidate-format Markdown → mdast (remark) → comparison model. Fails closed: anything
 * outside the mapping throws `Unsupported` with a category, like Core's native admission.
 */
import { parse as parseYaml } from "yaml";
import type { Block, Inline, Model } from "../model.ts";
import { parseMarkdown, parseMetaAttributes } from "./format.ts";
import { readGrid } from "./html-grid.ts";

type Node = Record<string, any>;

export class Unsupported extends Error {
  constructor(readonly category: string, message: string) { super(`${category}: ${message}`); }
}

const ADMONITIONS = new Set(["attention", "caution", "danger", "error", "hint", "important", "note", "seealso", "tip", "warning"]);
const CITE_ROLES: Record<string, string> = { cite: "cite", "cite-t": "cite:t", "cite-p": "cite:p" };
const BREAK_HTML = /^<br\s*\/?>$/i;

/** Plain text of a directive label that must not contain formatting. */
function plainLabel(node: Node, what: string): string {
  const children = node.children ?? [];
  if (!children.every((c: Node) => c.type === "text")) throw new Unsupported("inline-directive", `${what} label must be plain text`);
  return children.map((c: Node) => c.value).join("");
}

function pushText(out: Inline[], value: string) {
  if (!value) return;
  const last = out.at(-1);
  if (last?.kind === "text") last.text = (last.text as string) + value; else out.push({ kind: "text", text: value });
}

export function readInline(nodes: Node[], context: { inCell?: boolean; source?: string } = {}): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "text": pushText(out, node.value); break;
      case "break": out.push({ kind: "break" }); break;
      case "inlineMath": out.push({ kind: "math", value: node.value }); break;
      case "inlineCode": out.push({ kind: "code", value: node.value }); break;
      case "strong": case "emphasis": case "delete":
        out.push({ kind: node.type, children: readInline(node.children, context) }); break;
      case "link":
        out.push({ kind: "link", url: node.url, ...(node.title != null ? { title: node.title } : {}), children: readInline(node.children, context) });
        break;
      case "footnoteReference": out.push({ kind: "footnote", label: node.label ?? node.identifier }); break;
      case "html":
        if (context.inCell && BREAK_HTML.test(node.value)) { out.push({ kind: "break" }); break; }
        throw new Unsupported("html", `inline HTML ${JSON.stringify(node.value.slice(0, 40))}`);
      case "textDirective": {
        const name = node.name as string;
        const hasAttributes = Object.keys(node.attributes ?? {}).length > 0;
        if (name === "math") {
          if (hasAttributes) throw new Unsupported("inline-directive", "math attributes");
          out.push({ kind: "math", value: plainLabel(node, name) });
        } else if (name === "sub" || name === "sup") {
          if (hasAttributes) throw new Unsupported("inline-directive", `${name} attributes`);
          out.push({ kind: name === "sub" ? "subscript" : "superscript", children: readInline(node.children, context) });
        } else if (name === "eq" || name === "numref" || name === "ref") {
          if (hasAttributes) throw new Unsupported("inline-directive", `${name} attributes`);
          out.push({ kind: "reference", role: name, label: plainLabel(node, name) });
        } else if (CITE_ROLES[name]) {
          if (hasAttributes) throw new Unsupported("inline-directive", `${name} attributes`);
          out.push({ kind: "citation", role: CITE_ROLES[name], keys: plainLabel(node, name).split(",") });
        } else if (!hasAttributes && !(node.children?.length) && context.source !== undefined &&
          context.source.slice(node.position.start.offset, node.position.end.offset) === `:${name}`) {
          // `Note:see`, `10:30`: an unknown bare directive without label or attributes is literal text.
          pushText(out, `:${name}`);
        } else throw new Unsupported("inline-directive", `unknown text directive :${name}`);
        break;
      }
      case "image": throw new Unsupported("image", "inline image outside a figure");
      case "linkReference": case "imageReference": throw new Unsupported("reference-link", "reference-style link");
      default: throw new Unsupported("inline-other", node.type);
    }
  }
  return out;
}

function onlyParagraph(children: Node[], what: string, source: string): Inline[] {
  if (children.length === 0) return [];
  if (children.length === 1 && children[0].type === "paragraph") return readInline(children[0].children, { source });
  throw new Unsupported("nesting", `${what} holds ${children.map(c => c.type).join(",")}`);
}

function numberFields(attributes: Record<string, string>, what: string) {
  const { id, enumerator, enumerated, ...rest } = attributes;
  if (Object.keys(rest).length) throw new Unsupported("attributes", `${what} attributes ${Object.keys(rest).join(",")}`);
  if (enumerated !== undefined && enumerated !== "true" && enumerated !== "false") throw new Unsupported("attributes", `${what} enumerated=${enumerated}`);
  return { id, enumerator, enumerated: enumerated === undefined ? undefined : enumerated === "true" };
}

function readList(node: Node, source: string, style?: string): Record<string, unknown> {
  const items = node.children as Node[];
  const checks = items.map(item => item.checked);
  const checklist = !node.ordered && checks.length > 0 && checks.every(c => typeof c === "boolean");
  if (!checklist && checks.some(c => typeof c === "boolean")) throw new Unsupported("list", "partial or numbered checklist");
  let delimiter: string | undefined;
  if (node.ordered) {
    // mdast has no delimiter; the source marker after the digits holds it.
    const first = items[0].position.start.offset;
    delimiter = /^\d+([.)])/.exec(source.slice(first, first + 12))?.[1];
  }
  return {
    ordered: node.ordered === true,
    ...(checklist ? { checklist: true } : {}),
    ...(node.ordered ? { start: node.start ?? 1 } : {}),
    ...(style && style !== "decimal" ? { style } : {}),
    ...(delimiter === ")" ? { delimiter: ")" } : {}),
    items: items.map(item => {
      const children = item.children as Node[];
      let index = 0;
      const out: Record<string, unknown> = { content: [] };
      if (children[index]?.type === "paragraph") out.content = readInline(children[index++].children, { source });
      if (checklist) out.checked = item.checked;
      let nestedStyle: string | undefined;
      if (children[index]?.type === "leafDirective" && children[index].name === "list") nestedStyle = listStyle(children[index++]);
      if (children[index]?.type === "list") out.list = readList(children[index++], source, nestedStyle);
      if (index !== children.length) throw new Unsupported("nesting", `list item holds ${children.slice(index).map(c => c.type).join(",")}`);
      // Key order as in Core's projection.
      return { content: out.content, ...(checklist ? { checked: out.checked } : {}), ...(out.list ? { list: out.list } : {}) };
    }),
  };
}

const LIST_STYLES = new Set(["decimal", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman"]);
function listStyle(node: Node): string | undefined {
  const { style, ...rest } = node.attributes ?? {};
  if (Object.keys(rest).length || node.children?.length) throw new Unsupported("attributes", "list directive");
  if (style !== undefined && !LIST_STYLES.has(style)) throw new Unsupported("attributes", `list style ${style}`);
  return style;
}

function tableCells(table: Node, source: string) {
  return (table.children as Node[]).map((row, rowIndex) => ({
    cells: (row.children as Node[]).map((cell, cellIndex) => ({
      content: readInline(cell.children, { inCell: true, source }),
      header: rowIndex === 0,
      ...(table.align?.[cellIndex] ? { align: table.align[cellIndex] } : {}),
    })),
  }));
}

function readTable(node: Node, source: string): Block {
  if (node.type === "table") return { block: "table", rows: tableCells(node, source) };
  const children = node.children as Node[];
  let index = 0;
  let caption: Inline[] | undefined;
  if (children[0]?.data?.directiveLabel) throw new Unsupported("attributes", "table directive label");
  if (children[0]?.type === "paragraph" && (children[1]?.type === "table" || children[1]?.type === "html")) caption = readInline(children[index++].children, { source });
  const grid = children[index++];
  const notes = children.slice(index).map(note => {
    if (note.type !== "paragraph") throw new Unsupported("nesting", `table note ${note.type}`);
    return readInline(note.children, { source });
  });
  const { id, enumerator, enumerated } = numberFields(node.attributes ?? {}, "table");
  const fields = {
    block: "table",
    ...(enumerator !== undefined ? { enumerator } : {}),
    ...(enumerated !== undefined ? { enumerated } : {}),
  };
  const details = { ...(notes.length ? { notes } : {}), ...(id ? { label: id } : {}), ...(caption !== undefined ? { caption } : {}) };
  if (grid?.type === "table") return { ...fields, rows: tableCells(grid, source), ...details };
  if (grid?.type === "html") return { ...fields, grid: "complex", ...readGrid(grid.value), ...details };
  throw new Unsupported("table", "table directive without a grid");
}

function readFigure(node: Node, source: string): Block {
  const children = [...node.children] as Node[];
  const { id, enumerator, enumerated } = numberFields(node.attributes ?? {}, "figure");
  let contentKind = "none", imageUrl = "", imageAlt = "", mermaidSource: string | undefined;
  const first = children[0];
  if (first?.type === "paragraph" && first.children.length === 1 && first.children[0].type === "image") {
    const image = first.children[0];
    if (image.title != null) throw new Unsupported("attributes", "image title");
    contentKind = "image"; imageUrl = image.url; imageAlt = image.alt ?? ""; children.shift();
  } else if (first?.type === "code" && first.lang === "mermaid" && !first.meta) {
    contentKind = "mermaid"; mermaidSource = first.value; children.shift();
  }
  const caption = onlyParagraph(children, "figure caption", source);
  return {
    block: "figure",
    ...(enumerator !== undefined ? { enumerator } : {}),
    ...(enumerated !== undefined ? { enumerated } : {}),
    label: id ?? "", contentKind, ...(mermaidSource !== undefined ? { mermaidSource } : {}), imageUrl, imageAlt,
    caption: { content: caption },
  };
}

function readBlock(node: Node, source: string, pendingStyle: { value?: string; boundary?: boolean }): Block[] {
  switch (node.type) {
    case "heading": return [{ block: "heading", level: node.depth, content: readInline(node.children, { source }) }];
    case "paragraph": {
      if (node.children.length === 1 && node.children[0].type === "image") throw new Unsupported("image", "image paragraph outside a figure");
      return [{ block: "paragraph", content: readInline(node.children, { source }) }];
    }
    case "blockquote": return [{ block: "quote", content: onlyParagraph(node.children, "quote", source) }];
    case "footnoteDefinition": {
      if (node.children.length !== 1 || node.children[0].type !== "paragraph") throw new Unsupported("nesting", "footnote definition");
      return [{ block: "footnote", label: node.label ?? node.identifier, content: readInline(node.children[0].children, { source }) }];
    }
    case "thematicBreak": return [{ block: "divider" }];
    case "math": {
      const attributes = parseMetaAttributes(node.meta);
      if (!attributes) throw new Unsupported("attributes", `math meta ${node.meta}`);
      const { id, enumerator } = numberFields(attributes, "equation");
      return [{ block: "equation", ...(enumerator !== undefined ? { enumerator } : {}), latex: node.value, label: id ?? "" }];
    }
    case "code":
      if (node.meta) throw new Unsupported("attributes", "code meta");
      return [{ block: "code", language: node.lang ?? "", code: node.value }];
    case "list": {
      const style = pendingStyle.value; pendingStyle.value = undefined;
      if (style && !node.ordered) throw new Unsupported("list", "style on a bullet list");
      return [{ block: "list", ...readList(node, source, style) }];
    }
    case "table": return [readTable(node, source)];
    case "containerDirective": {
      if (node.name === "table") return [readTable(node, source)];
      if (node.name === "figure") return [readFigure(node, source)];
      if (ADMONITIONS.has(node.name)) {
        if (Object.keys(node.attributes ?? {}).length || node.children[0]?.data?.directiveLabel) throw new Unsupported("attributes", "admonition title/attributes");
        return [{ block: "admonition", variant: node.name, content: onlyParagraph(node.children, "admonition", source) }];
      }
      throw new Unsupported("block-directive", `unknown container :::${node.name}`);
    }
    case "leafDirective": {
      if (node.name === "target") {
        const { id, ...rest } = node.attributes ?? {};
        if (!id || Object.keys(rest).length || node.children?.length) throw new Unsupported("attributes", "target");
        return [{ block: "target", label: id }];
      }
      if (node.name === "list") { pendingStyle.value = listStyle(node) ?? "decimal"; return []; }
      throw new Unsupported("block-directive", `unknown leaf ::${node.name}`);
    }
    case "html": throw new Unsupported("html", "block HTML");
    case "definition": throw new Unsupported("reference-link", "link definition");
    case "yaml": throw new Unsupported("frontmatter", "frontmatter not first");
    default: throw new Unsupported("block-other", node.type);
  }
}

export type ReadOptions = { requireMarker?: boolean };

export function mdastToModel(tree: Node, source: string, { requireMarker = true }: ReadOptions = {}): Model {
  const children = tree.children as Node[];
  let frontmatter: Record<string, unknown> = {};
  let start = 0;
  if (children[0]?.type === "yaml") { frontmatter = (parseYaml(children[0].value) ?? {}) as Record<string, unknown>; start = 1; }
  if (requireMarker && frontmatter.litzio !== 1) throw new Unsupported("marker", "missing litzio: 1");
  const blocks: Block[] = [];
  const pending: { value?: string } = {};
  for (const node of children.slice(start)) {
    if (pending.value !== undefined && node.type !== "list") throw new Unsupported("list", "list directive not before a list");
    blocks.push(...readBlock(node, source, pending));
  }
  if (pending.value !== undefined) throw new Unsupported("list", "list directive at the end");
  return { frontmatter, blocks };
}

export function readDocument(source: string, options?: ReadOptions): Model {
  const text = source.replace(/^﻿/, "");
  return mdastToModel(parseMarkdown(text), text, options);
}
