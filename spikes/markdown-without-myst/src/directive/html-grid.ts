/**
 * The ADR-0024 HTML grid subset for complex tables, with `data-litzio` in place of `data-myst`.
 * Read with hast-util-from-html (parse5), the same parser family Core already uses.
 */
import { fromHtml } from "hast-util-from-html";
import type { Block, Inline } from "../model.ts";

type Cell = Record<string, any>;
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (text: string) => escape(text).replace(/"/g, "&quot;");

function inlineHtml(items: Inline[]): string {
  return items.map(item => {
    switch (item.kind) {
      case "text": return escape(item.text as string);
      case "break": return "<br>";
      case "strong": return `<strong>${inlineHtml(item.children as Inline[])}</strong>`;
      case "emphasis": return `<em>${inlineHtml(item.children as Inline[])}</em>`;
      case "delete": return `<del>${inlineHtml(item.children as Inline[])}</del>`;
      case "subscript": return `<sub>${inlineHtml(item.children as Inline[])}</sub>`;
      case "superscript": return `<sup>${inlineHtml(item.children as Inline[])}</sup>`;
      case "code": return `<code>${escape(item.value as string)}</code>`;
      case "link": return `<a href="${attr(item.url as string)}"${item.title !== undefined ? ` title="${attr(item.title as string)}"` : ""}>${inlineHtml(item.children as Inline[])}</a>`;
      case "math": return `<span data-litzio="math">${escape(item.value as string)}</span>`;
      case "reference": return `<span data-litzio="${item.role}">${escape(item.label as string)}</span>`;
      case "footnote": return `<span data-litzio="footnote">${escape(item.label as string)}</span>`;
      case "citation": return `<span data-litzio="${item.role}">${escape((item.keys as string[]).join(","))}</span>`;
      default: throw new Error(`grid: unsupported inline ${item.kind}`);
    }
  }).join("");
}

function listHtml(list: any): string {
  const open = list.ordered ? `<ol${list.start !== undefined && list.start !== 1 ? ` start="${list.start}"` : ""}>` : "<ul>";
  return open + list.items.map((item: any) => `<li>${inlineHtml(item.content)}${item.list ? listHtml(item.list) : ""}</li>`).join("") + (list.ordered ? "</ol>" : "</ul>");
}

export function gridHtml(block: Block): string {
  const rows = block.rows as { cells: Cell[] }[];
  const headerRows = block.headerRows as number;
  const row = (cells: Cell[]) => ["<tr>", ...cells.map(cell => {
    const tag = cell.header ? "th" : "td";
    const attrs = [cell.colspan !== 1 ? ` colspan="${cell.colspan}"` : "", cell.rowspan !== 1 ? ` rowspan="${cell.rowspan}"` : "",
      cell.align ? ` style="text-align: ${cell.align}"` : ""].join("");
    const body = (cell.blocks as any[]).map(b => b.kind === "paragraph" ? `<p>${inlineHtml(b.content)}</p>` : listHtml(b.list)).join("");
    return `<${tag}${attrs}>${body || "<p></p>"}</${tag}>`;
  }), "</tr>"];
  return ["<table>", "<thead>", ...rows.slice(0, headerRows).flatMap(r => row(r.cells)), "</thead>",
    ...(rows.length > headerRows ? ["<tbody>", ...rows.slice(headerRows).flatMap(r => row(r.cells)), "</tbody>"] : []),
    "</table>"].join("\n");
}

type HNode = { type: string; tagName?: string; value?: string; properties?: Record<string, any>; children?: HNode[] };

const MARKS: Record<string, string> = { strong: "strong", em: "emphasis", del: "delete", sub: "subscript", sup: "superscript" };
const text = (node: HNode): string => node.type === "text" ? node.value ?? "" : (node.children ?? []).map(text).join("");

function readInline(nodes: HNode[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    if (node.type === "text") {
      if (!node.value) continue;
      const last = out.at(-1);
      if (last?.kind === "text") last.text += node.value; else out.push({ kind: "text", text: node.value });
    } else if (node.type === "element" && node.tagName === "br") out.push({ kind: "break" });
    else if (node.type === "element" && MARKS[node.tagName!]) out.push({ kind: MARKS[node.tagName!], children: readInline(node.children ?? []) });
    else if (node.type === "element" && node.tagName === "code") out.push({ kind: "code", value: text(node) });
    else if (node.type === "element" && node.tagName === "a") out.push({ kind: "link", url: String(node.properties?.href ?? ""),
      ...(node.properties?.title !== undefined ? { title: String(node.properties.title) } : {}), children: readInline(node.children ?? []) });
    else if (node.type === "element" && node.tagName === "span") {
      const role = String(node.properties?.dataLitzio ?? "");
      const value = text(node);
      if (role === "math") out.push({ kind: "math", value });
      else if (["eq", "numref", "ref"].includes(role)) out.push({ kind: "reference", role, label: value });
      else if (role === "footnote") out.push({ kind: "footnote", label: value });
      else if (["cite", "cite:t", "cite:p"].includes(role)) out.push({ kind: "citation", role, keys: value.split(",") });
      else throw new Error(`grid: unsupported span ${role}`);
    } else throw new Error(`grid: unsupported inline ${node.tagName ?? node.type}`);
  }
  return out;
}

function readList(node: HNode): any {
  const ordered = node.tagName === "ol";
  return {
    ordered, ...(ordered ? { start: node.properties?.start ?? 1 } : {}),
    items: (node.children ?? []).filter(c => c.type === "element").map(li => {
      const children = li.children ?? [];
      const nested = children.find(c => c.type === "element" && (c.tagName === "ul" || c.tagName === "ol"));
      return { content: readInline(children.filter(c => c !== nested)), ...(nested ? { list: readList(nested) } : {}) };
    }),
  };
}

export function readGrid(html: string): Pick<Block, never> & { headerRows: number; rows: { cells: Cell[] }[] } {
  const root = fromHtml(html, { fragment: true }) as HNode;
  const table = root.children!.find(c => c.type === "element" && c.tagName === "table");
  if (!table || root.children!.some(c => c !== table && !(c.type === "text" && !c.value!.trim()))) throw new Error("grid: one table expected");
  const groups = (table.children ?? []).filter(c => c.type === "element");
  const thead = groups.find(g => g.tagName === "thead");
  const tbody = groups.find(g => g.tagName === "tbody");
  const rowsOf = (group?: HNode) => (group?.children ?? []).filter(c => c.type === "element" && c.tagName === "tr");
  const trs = [...rowsOf(thead), ...rowsOf(tbody)];
  const occupied: boolean[][] = [];
  const rows = trs.map((tr, r) => {
    occupied[r] ??= [];
    let column = 0;
    return { cells: (tr.children ?? []).filter(c => c.type === "element").map(td => {
      while (occupied[r][column]) column++;
      const rowspan = Number(td.properties?.rowSpan ?? 1), colspan = Number(td.properties?.colSpan ?? 1);
      for (let i = 0; i < rowspan; i++) for (let j = 0; j < colspan; j++) (occupied[r + i] ??= [])[column + j] = true;
      const align = /text-align:\s*(left|center|right)/.exec(String(td.properties?.style ?? ""))?.[1];
      const blocks = (td.children ?? []).filter(c => c.type === "element").map(b =>
        b.tagName === "p" ? { kind: "paragraph", content: readInline(b.children ?? []) } : { kind: "list", list: readList(b) });
      const cleaned = blocks.length === 1 && blocks[0].kind === "paragraph" && !(blocks[0] as any).content.length ? [] : blocks;
      const cell = { header: td.tagName === "th", ...(align ? { align } : {}), column, rowspan, colspan, blocks: cleaned,
        ...(cleaned.length === 1 && cleaned[0].kind === "paragraph" ? { content: (cleaned[0] as any).content } : {}) };
      column += colspan;
      return cell;
    }) };
  });
  return { headerRows: rowsOf(thead).length, rows };
}
