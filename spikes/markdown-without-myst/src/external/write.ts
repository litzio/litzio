/** Comparison model → external-conventions Markdown. `raw` nodes are written verbatim. */
import { stringify as stringifyYaml } from "yaml";
import type { Block, Inline, Model } from "../model.ts";
import { Unsupported } from "../directive/read.ts";
import { formatAttributes, stringifyMarkdown, type Attributes } from "./format.ts";

type Node = Record<string, any>;
const raw = (value: string): Node => ({ type: "html", value });

/** GitHub alert kinds for Litzio's five authorable kinds; the others use Obsidian-style custom kinds. */
export const ALERT_OF: Record<string, string> = {
  note: "NOTE", tip: "TIP", important: "IMPORTANT", warning: "WARNING", danger: "CAUTION",
  hint: "HINT", seealso: "SEEALSO", attention: "ATTENTION", error: "ERROR",
  // `caution` has no free name: GitHub's CAUTION is Litzio's danger.
};
export const REFERENCE_PREFIX: Record<string, string[]> = { eq: ["eq-"], numref: ["fig-", "tbl-"], ref: ["sec-"] };
const SIMPLE_KEY = /^[\p{L}\p{N}_](?:[\p{L}\p{N}_]|[:.#$%&\-+?<>~/](?=[\p{L}\p{N}_]))*$/u;
const KEY_CONTINUES = /^(?:[\p{L}\p{N}_]|[:.#$%&\-+?<>~/][\p{L}\p{N}_])/u;
const WORD_END = /[\p{L}\p{N}_]$/u;

const citeKey = (key: string, next: Inline | undefined) =>
  SIMPLE_KEY.test(key) && !(next?.kind === "text" && KEY_CONTINUES.test(next.text as string)) ? `@${key}` : `@{${key}}`;

export function inlineToMdast(items: Inline[], context: { inCell?: boolean } = {}): Node[] {
  const out: Node[] = [];
  items.forEach((item, index) => {
    const next = items[index + 1];
    const previous = items[index - 1];
    const atWordEnd = previous?.kind === "text" && WORD_END.test(previous.text as string);
    switch (item.kind) {
      case "text": out.push({ type: "text", value: item.text }); break;
      case "break": out.push(context.inCell ? raw("<br>") : { type: "break" }); break;
      case "math": case "code": {
        // `$a$$b$` and `` `a``b` `` read as one span: the classic empty-comment separator.
        if (out.at(-1)?.type === "inlineMath" || out.at(-1)?.type === "inlineCode") out.push(raw("<!---->"));
        out.push({ type: item.kind === "math" ? "inlineMath" : "inlineCode", value: item.value });
        break;
      }
      case "strong": case "emphasis": case "delete":
        out.push({ type: item.kind, children: inlineToMdast(item.children as Inline[], context) }); break;
      case "subscript": case "superscript": {
        const tag = item.kind === "subscript" ? "sub" : "sup";
        out.push(raw(`<${tag}>`), ...inlineToMdast(item.children as Inline[], context), raw(`</${tag}>`));
        break;
      }
      case "link":
        out.push({ type: "link", url: item.url, title: item.title ?? null, children: inlineToMdast(item.children as Inline[], context) }); break;
      case "reference": {
        const label = item.label as string;
        if (!REFERENCE_PREFIX[item.role as string].some(prefix => label.startsWith(prefix))) {
          throw new Unsupported("label-prefix", `{${item.role}} reference to "${label}" needs a ${REFERENCE_PREFIX[item.role as string].join("/")} label`);
        }
        if (atWordEnd) throw new Unsupported("citation-after-word", "@ reference right after a letter");
        out.push(raw(citeKey(label, next)));
        break;
      }
      case "footnote": out.push({ type: "footnoteReference", identifier: String(item.label).toLowerCase(), label: item.label }); break;
      case "citation": {
        const keys = item.keys as string[];
        if (keys.some(key => /^(?:eq|fig|tbl|sec)-/.test(key))) throw new Unsupported("citation-key-prefix", "citation key looks like a cross-reference");
        if (item.role === "cite:p") out.push(raw(`[${keys.map(key => citeKey(key, undefined)).join("; ")}]`));
        else {
          if (keys.length > 1) throw new Unsupported("citation-narrative-group", `${item.role} with ${keys.length} keys`);
          if (atWordEnd) throw new Unsupported("citation-after-word", "@ citation right after a letter");
          out.push(raw(citeKey(keys[0], next)));
        }
        break;
      }
      default: throw new Error(`write: unsupported inline ${item.kind}`);
    }
  });
  return out;
}

const paragraph = (content: Inline[], context = {}): Node => ({ type: "paragraph", children: inlineToMdast(content, context) });
const div = (attributes: Attributes, children: Node[]): Node[] => [raw(`::: ${formatAttributes(attributes)}`), ...children, raw(":::")];

function numbered(block: Block, label: string | undefined, prefix: string, extraClass?: string): Attributes {
  const classes: string[] = [];
  if (extraClass && !(label && label.startsWith(prefix))) classes.push(extraClass);
  if (block.enumerated === false) classes.push("unnumbered");
  return {
    ...(label ? { id: label } : {}), classes,
    values: block.enumerator !== undefined ? { enumerator: String(block.enumerator) } : {},
  };
}
const hasAttributes = (a: Attributes) => a.id !== undefined || a.classes.length > 0 || Object.keys(a.values).length > 0;

type ListModel = { ordered: boolean; checklist?: boolean; start?: number; style?: string; delimiter?: string;
  items: { content: Inline[]; checked?: boolean; list?: ListModel }[] };

function listNode(list: ListModel): Node {
  return {
    type: "list", ordered: list.ordered, start: list.ordered ? list.start ?? 1 : null, spread: false,
    data: { delimiter: list.delimiter ?? "." },
    children: list.items.map(item => {
      const styled = item.list && listStyle(item.list);
      return {
        type: "listItem", spread: Boolean(styled), checked: list.checklist ? item.checked === true : null,
        children: [...(item.content.length ? [paragraph(item.content)] : []), ...(item.list ? styledList(item.list) : [])],
      };
    }),
  };
}
const listStyle = (list: ListModel) => list.ordered && list.style && list.style !== "decimal" ? list.style : undefined;
/** No CommonMark/GFM list marker carries a style: a fenced div with the style as its class. */
function styledList(list: ListModel): Node[] {
  const style = listStyle(list);
  return style ? div({ classes: [style], values: {} }, [listNode(list)]) : [listNode(list)];
}

function gridNodes(block: Block): Node[] {
  const rows = block.rows as { cells: Record<string, any>[] }[];
  if (block.grid !== "complex") {
    return [{
      type: "table", align: rows[0].cells.map(cell => cell.align ?? null),
      children: rows.map(row => ({ type: "tableRow", children: row.cells.map(cell => ({
        type: "tableCell", children: inlineToMdast(cell.content, { inCell: true }) })) })),
    }];
  }
  // HTML skeleton, Markdown cell content between blank lines (CommonMark HTML blocks end there).
  const out: Node[] = [];
  let chunk: string[] = ["<table>"];
  const flush = () => { if (chunk.length) out.push(raw(chunk.join("\n"))); chunk = []; };
  const headerRows = block.headerRows as number;
  const group = (name: string, list: { cells: Record<string, any>[] }[]) => {
    chunk.push(`<${name}>`);
    for (const row of list) {
      chunk.push("<tr>");
      for (const cell of row.cells) {
        const tag = cell.header ? "th" : "td";
        const attrs = [cell.colspan !== 1 ? ` colspan="${cell.colspan}"` : "", cell.rowspan !== 1 ? ` rowspan="${cell.rowspan}"` : "",
          cell.align ? ` style="text-align: ${cell.align}"` : ""].join("");
        if (!cell.blocks.length) { chunk.push(`<${tag}${attrs}></${tag}>`); continue; }
        chunk.push(`<${tag}${attrs}>`);
        flush();
        for (const b of cell.blocks) out.push(b.kind === "paragraph" ? paragraph(b.content) : listNode(b.list));
        chunk.push(`</${tag}>`);
      }
      chunk.push("</tr>");
    }
    chunk.push(`</${name}>`);
  };
  group("thead", rows.slice(0, headerRows));
  if (rows.length > headerRows) group("tbody", rows.slice(headerRows));
  chunk.push("</table>");
  flush();
  return out;
}

function tableNodes(block: Block): Node[] {
  const label = block.label as string | undefined;
  const caption = block.caption as Inline[] | undefined;
  const notes = (block.notes as Inline[][] | undefined) ?? [];
  const attributes = numbered(block, label, "tbl-");
  const grid = gridNodes(block);
  const captionLine = (withAttributes: boolean) => caption === undefined && !(withAttributes && hasAttributes(attributes)) ? [] : [{ type: "paragraph", children: [
    raw(":"), ...(caption?.length ? [{ type: "text", value: " " }, ...inlineToMdast(caption)] : []),
    ...(withAttributes && hasAttributes(attributes) ? [raw(` ${formatAttributes(attributes)}`)] : []),
  ] }];
  // Pandoc/Quarto: `: Caption {#tbl-x}` after the grid. Notes need a container: a fenced div.
  if (notes.length || (caption === undefined && hasAttributes(attributes))) {
    return div({ ...attributes, classes: [...attributes.classes, ...(label?.startsWith("tbl-") ? [] : ["table"])] },
      [...grid, ...captionLine(false), ...notes.map(note => paragraph(note))]);
  }
  return [...grid, ...captionLine(true)];
}

function equationNodes(block: Block): Node[] {
  const label = block.label as string;
  const latex = block.latex as string;
  const attributes = numbered(block, label || undefined, "eq-");
  if (!hasAttributes(attributes)) return [{ type: "math", meta: null, value: latex }];
  // Quarto: `$$ … $$ {#eq-x}` in one paragraph. remark-math (and markdown-rs) read a `$$` line as a
  // math fence, so a multi-line, empty or `$`-holding equation goes into a fenced div instead.
  if (latex && !/[\n$]/.test(latex) && latex.trim() === latex) return [{ type: "paragraph", children: [raw(`$$${latex}$$ ${formatAttributes(attributes)}`)] }];
  return div(attributes, [{ type: "math", meta: null, value: latex }]);
}

function figureNodes(block: Block): Node[] {
  const children: Node[] = [];
  if (block.contentKind === "image") {
    children.push({ type: "paragraph", children: [{ type: "image", url: block.imageUrl, alt: "", title: null },
      ...(block.imageAlt ? [raw(formatAttributes({ classes: [], values: { "fig-alt": block.imageAlt as string } }))] : [])] });
  }
  if (block.contentKind === "mermaid") children.push({ type: "code", lang: "mermaid", meta: null, value: block.mermaidSource });
  const caption = (block.caption as { content: Inline[] }).content;
  if (caption.length) children.push(paragraph(caption));
  return div(numbered(block, (block.label as string) || undefined, "fig-", "figure"), children);
}

function blockToMdast(block: Block, previous: Block | undefined): Node[] {
  switch (block.block) {
    case "heading": {
      const children = inlineToMdast(block.content as Inline[]);
      if (previous?.block === "target") children.push(raw(` ${formatAttributes({ id: previous.label as string, classes: [], values: {} })}`));
      return [{ type: "heading", depth: block.level, children }];
    }
    case "paragraph": return [paragraph(block.content as Inline[])];
    case "admonition": {
      const kind = ALERT_OF[block.variant as string];
      if (!kind) throw new Unsupported("admonition-kind", `no alert name for ${block.variant}`);
      const content = inlineToMdast(block.content as Inline[]);
      if (content[0]?.type === "text") content[0] = { ...content[0], value: `\n${content[0].value}` };
      else if (content.length) content.unshift({ type: "text", value: "\n" });
      return [{ type: "blockquote", children: [{ type: "paragraph", children: [raw(`[!${kind}]`), ...content] }] }];
    }
    case "quote": {
      const content = block.content as Inline[];
      return [{ type: "blockquote", children: content.length ? [paragraph(content)] : [] }];
    }
    case "footnote":
      return [{ type: "footnoteDefinition", identifier: String(block.label).toLowerCase(), label: block.label, children: [paragraph(block.content as Inline[])] }];
    case "divider": return [{ type: "thematicBreak" }];
    case "figure": return figureNodes(block);
    case "equation": return equationNodes(block);
    case "table": return tableNodes(block);
    case "list": return styledList(block as unknown as ListModel);
    case "code": return [{ type: "code", lang: block.language || null, meta: null, value: block.code }];
    case "target": return [];
    default: throw new Error(`write: unsupported block ${block.block}`);
  }
}

export function modelToMdast(model: Model): Node {
  const children: Node[] = [{ type: "yaml", value: stringifyYaml(model.frontmatter).replace(/\n$/, "") }];
  model.blocks.forEach((block, index) => {
    const previous = model.blocks[index - 1];
    if (block.block === "target" && model.blocks[index + 1]?.block !== "heading") {
      throw new Unsupported("target-not-heading", "a section label is a heading attribute");
    }
    // Pandoc's documented separator for two consecutive lists of the same kind.
    if (block.block === "list" && previous?.block === "list" && block.ordered && previous.ordered &&
      (block.delimiter ?? ".") === (previous.delimiter ?? ".") && !listStyle(block as any) && !listStyle(previous as any)) {
      children.push(raw("<!-- end list -->"));
    }
    children.push(...blockToMdast(block, previous));
  });
  return { type: "root", children };
}

export function writeDocument(model: Model): string {
  return stringifyMarkdown(modelToMdast(model) as any);
}

/**
 * Migration-style label rename to the Quarto prefixes (fig-, tbl-, eq-, sec-), applied to targets,
 * semantic references and fragment links together. Used only for the "external-renamed" run.
 */
export function prefixLabels(model: Model): Model {
  const maps: Record<string, Map<string, string>> = { figure: new Map(), table: new Map(), equation: new Map(), target: new Map() };
  const PREFIX: Record<string, string> = { figure: "fig-", table: "tbl-", equation: "eq-", target: "sec-" };
  const used = new Set<string>();
  const rename = (kind: string, label: string) => {
    if (!label) return label;
    if (maps[kind].has(label)) return maps[kind].get(label)!;
    let next = label.startsWith(PREFIX[kind]) ? label : PREFIX[kind] + label;
    next = next.replace(/[^\p{L}\p{N}_\-:.]+/gu, "-");
    while (used.has(next)) next += "-1";
    used.add(next);
    maps[kind].set(label, next);
    return next;
  };
  const blocks = structuredClone(model.blocks);
  for (const block of blocks) if (maps[block.block] && typeof block.label === "string") block.label = rename(block.block, block.label);
  const lookup = (role: string, label: string) => {
    const kinds = role === "eq" ? ["equation"] : role === "numref" ? ["figure", "table"] : ["target"];
    for (const kind of kinds) if (maps[kind].has(label)) return maps[kind].get(label)!;
    return rename(kinds[0], label);
  };
  const visit = (value: any): any => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    if (value.kind === "reference") value.label = lookup(value.role, value.label);
    if (value.kind === "link" && typeof value.url === "string" && value.url.startsWith("#")) {
      const label = value.url.slice(1);
      for (const map of Object.values(maps)) if (map.has(label)) { value.url = `#${map.get(label)}`; break; }
    }
    Object.values(value).forEach(visit);
  };
  visit(blocks);
  return { ...model, blocks };
}
