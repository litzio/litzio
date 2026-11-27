/** Comparison model → mdast → candidate-format Markdown. */
import { stringify as stringifyYaml } from "yaml";
import type { Block, Inline, Model } from "../model.ts";
import { metaAttributes, stringifyMarkdown } from "./format.ts";
import { gridHtml } from "./html-grid.ts";

type Node = Record<string, any>;

export const CITE_NAMES: Record<string, string> = { cite: "cite", "cite:t": "cite-t", "cite:p": "cite-p" };

export function inlineToMdast(items: Inline[], context: { inCell?: boolean } = {}): Node[] {
  const out: Node[] = [];
  for (const item of items) {
    // `$a$$b$` reads as one span: an inline math right after another is written `:math[b]`.
    if (item.kind === "math" && out.at(-1)?.type === "inlineMath") {
      out.push({ type: "textDirective", name: "math", attributes: {}, children: [{ type: "text", value: item.value }] });
      continue;
    }
    out.push(inlineNode(item, context));
  }
  return out;
}

function inlineNode(item: Inline, context: { inCell?: boolean }): Node {
  {
    switch (item.kind) {
      case "text": return { type: "text", value: item.text };
      case "break": return context.inCell ? { type: "html", value: "<br>" } : { type: "break" };
      case "math": return { type: "inlineMath", value: item.value };
      case "code": return { type: "inlineCode", value: item.value };
      case "strong": case "emphasis": case "delete":
        return { type: item.kind, children: inlineToMdast(item.children as Inline[], context) };
      case "subscript": case "superscript":
        return { type: "textDirective", name: item.kind === "subscript" ? "sub" : "sup", attributes: {},
          children: inlineToMdast(item.children as Inline[], context) };
      case "link":
        return { type: "link", url: item.url, title: item.title ?? null, children: inlineToMdast(item.children as Inline[], context) };
      case "reference":
        return { type: "textDirective", name: item.role, attributes: {}, children: [{ type: "text", value: item.label }] };
      case "footnote":
        return { type: "footnoteReference", identifier: String(item.label).toLowerCase(), label: item.label };
      case "citation":
        return { type: "textDirective", name: CITE_NAMES[item.role as string], attributes: {},
          children: [{ type: "text", value: (item.keys as string[]).join(",") }] };
      default: throw new Error(`write: unsupported inline ${item.kind}`);
    }
  }
}

const paragraph = (content: Inline[], context = {}): Node => ({ type: "paragraph", children: inlineToMdast(content, context) });

function numberAttributes(block: Block, label: string | undefined): Record<string, string> {
  return {
    ...(label ? { id: label } : {}),
    ...(block.enumerator !== undefined ? { enumerator: String(block.enumerator) } : {}),
    ...(block.enumerated !== undefined ? { enumerated: String(block.enumerated) } : {}),
  };
}

type ListModel = { ordered: boolean; checklist?: boolean; start?: number; style?: string; delimiter?: string;
  items: { content: Inline[]; checked?: boolean; list?: ListModel }[] };

function listNode(list: ListModel): Node {
  return {
    type: "list", ordered: list.ordered, start: list.ordered ? list.start ?? 1 : null, spread: false,
    data: { delimiter: list.delimiter ?? "." },
    children: list.items.map(item => ({
      type: "listItem", spread: false, checked: list.checklist ? item.checked === true : null,
      children: [
        ...(item.content.length ? [paragraph(item.content)] : []),
        ...(item.list ? listWithStyle(item.list) : []),
      ],
    })),
  };
}

/** A non-decimal style is a `::list{style=…}` line before the list. */
function listWithStyle(list: ListModel, boundary = false): Node[] {
  const style = list.ordered && list.style && list.style !== "decimal" ? list.style : undefined;
  const marker = style || boundary ? [{ type: "leafDirective", name: "list", attributes: style ? { style } : {}, children: [] }] : [];
  return [...marker, listNode(list)];
}

function tableNodes(block: Block): Node {
  const rows = block.rows as { cells: Record<string, any>[] }[];
  const label = block.label as string | undefined;
  const caption = block.caption as Inline[] | undefined;
  const notes = (block.notes as Inline[][] | undefined) ?? [];
  const wrapped = caption !== undefined || label || notes.length || block.enumerator !== undefined || block.enumerated !== undefined;
  let grid: Node;
  if (block.grid === "complex") {
    grid = { type: "html", value: gridHtml(block) };
  } else {
    grid = {
      type: "table", align: rows[0].cells.map(cell => cell.align ?? null),
      children: rows.map(row => ({ type: "tableRow", children: row.cells.map(cell => ({
        type: "tableCell", children: inlineToMdast(cell.content, { inCell: true }) })) })),
    };
  }
  if (!wrapped && block.grid !== "complex") return grid;
  return {
    type: "containerDirective", name: "table", attributes: numberAttributes(block, label),
    children: [
      // The caption is the paragraph before the grid, notes are the paragraphs after it. (A directive
      // label `[caption]` would be closer to MyST, but mdast-util-directive 3.2.1 does not apply
      // phrasing escapes inside labels: a caption with a backtick reads back as code.)
      ...(caption !== undefined ? [paragraph(caption)] : []),
      grid,
      ...notes.map(note => paragraph(note)),
    ],
  };
}

function blockToMdast(block: Block): Node[] {
  switch (block.block) {
    case "heading": return [{ type: "heading", depth: block.level, children: inlineToMdast(block.content as Inline[]) }];
    case "paragraph": return [paragraph(block.content as Inline[])];
    case "admonition": {
      const content = block.content as Inline[];
      return [{ type: "containerDirective", name: block.variant, attributes: {}, children: content.length ? [paragraph(content)] : [] }];
    }
    case "quote": {
      const content = block.content as Inline[];
      return [{ type: "blockquote", children: content.length ? [paragraph(content)] : [] }];
    }
    case "footnote":
      return [{ type: "footnoteDefinition", identifier: String(block.label).toLowerCase(), label: block.label,
        children: [paragraph(block.content as Inline[])] }];
    case "divider": return [{ type: "thematicBreak" }];
    case "figure": {
      const children: Node[] = [];
      if (block.contentKind === "image") children.push({ type: "paragraph", children: [{ type: "image", url: block.imageUrl, alt: block.imageAlt, title: null }] });
      if (block.contentKind === "mermaid") children.push({ type: "code", lang: "mermaid", meta: null, value: block.mermaidSource });
      const caption = (block.caption as { content: Inline[] }).content;
      if (caption.length) children.push(paragraph(caption));
      return [{ type: "containerDirective", name: "figure", attributes: numberAttributes(block, block.label as string), children }];
    }
    case "equation":
      return [{ type: "math", meta: metaAttributes(numberAttributes(block, block.label as string)) || null, value: block.latex }];
    case "table": return [tableNodes(block)];
    case "list": return listWithStyle(block as unknown as ListModel);
    case "code": return [{ type: "code", lang: block.language || null, meta: null, value: block.code }];
    case "target": return [{ type: "leafDirective", name: "target", attributes: { id: block.label }, children: [] }];
    default: throw new Error(`write: unsupported block ${block.block}`);
  }
}

export function modelToMdast(model: Model): Node {
  const children: Node[] = [{ type: "yaml", value: stringifyYaml(model.frontmatter).replace(/\n$/, "") }];
  let previous: Block | undefined;
  for (const block of model.blocks) {
    let nodes = blockToMdast(block);
    // Two ordered lists with the same delimiter would merge; a bare `::list` keeps them apart.
    if (block.block === "list" && previous?.block === "list" && block.ordered && previous.ordered &&
      (block.delimiter ?? ".") === (previous.delimiter ?? ".") && nodes[0].type !== "leafDirective") {
      nodes = listWithStyle(block as unknown as ListModel, true);
    }
    children.push(...nodes);
    previous = block;
  }
  return { type: "root", children };
}

export function writeDocument(model: Model): string {
  return stringifyMarkdown(modelToMdast(model) as any);
}
