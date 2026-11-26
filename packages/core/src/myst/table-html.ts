import {
  defaultTreeAdapter as html, ErrorCodes, parseFragment, Tokenizer,
  type DefaultTreeAdapterTypes, Token,
} from "parse5";
import { inlineContentToNodes, type InlineContent } from "../inline.ts";
import { canonicalCitation } from "../citation.ts";
import type { ListContent } from "../list.ts";
import { createListNode } from "./list.ts";
import { locateTableCells, tableGridError, tableInline, tableList } from "./table-grid.ts";
import type { MystNode } from "./tree.ts";

type Element = DefaultTreeAdapterTypes.Element;
type Child = DefaultTreeAdapterTypes.ChildNode;

const MARKS = {
  strong: "strong", em: "emphasis", del: "delete", sub: "subscript", sup: "superscript",
} as const;

/** HTML's tree builder can silently discard tags or recreate, move and close nodes. */
function readTree(source: string, reject: (reason: string) => never): Child[] {
  if (/\n[ \t]*\n/.test(source)) reject("The HTML table grid cannot contain a blank line");
  const fragment = parseFragment(source, {
    sourceCodeLocationInfo: true,
    onParseError(error) {
      // Literal CR is encoded as &#13; by the canonical writer.
      if (error.code === ErrorCodes.controlCharacterReference &&
          /&#(?:0*13|x0*d);$/i.test(source.slice(source.lastIndexOf("&#", error.startOffset), error.startOffset))) return;
      reject("Invalid table HTML: " + error.code);
    },
  });
  const tokens: Token.TagToken[] = [];
  const tag = (token: Token.TagToken) => tokens.push(token);
  const ignore = () => {};
  const tokenizer = new Tokenizer({ sourceCodeLocationInfo: true }, {
    onStartTag: tag, onEndTag: tag, onEof: ignore,
    onWhitespaceCharacter: ignore, onCharacter: ignore, onNullCharacter: ignore,
    onComment: () => reject("HTML comments are outside the table subset"),
    onDoctype: () => reject("HTML doctypes are outside the table subset"),
  });
  tokenizer.write(source, true);
  let index = 0;
  let offset = 0;
  function match(tag: string, range: Token.Location | undefined, type: Token.TokenType): void {
    const token = tokens[index++];
    if (!range || token?.type !== type || token.tagName !== tag ||
        token.location?.startOffset !== range.startOffset || token.location.endOffset !== range.endOffset) {
      reject("Table tags must be explicit, balanced and in source order");
    }
    advance(range);
  }
  function advance(range: Token.Location | undefined | null): void {
    if (!range || range.startOffset !== offset) reject("HTML parser inserted, dropped or moved table content");
    offset = range.endOffset;
  }
  function visit(child: Child): void {
    if (html.isTextNode(child)) { advance(child.sourceCodeLocation); return; }
    if (!html.isElementNode(child)) reject("Unsupported table HTML node");
    const { tagName, sourceCodeLocation: location } = child;
    match(tagName, location?.startTag, Token.TokenType.START_TAG);
    child.childNodes.forEach(visit);
    if (tagName !== "br") match(tagName, location?.endTag, Token.TokenType.END_TAG);
  }
  fragment.childNodes.forEach(visit);
  if (index !== tokens.length || offset !== source.length) reject("Unexpected content around the HTML table grid");
  return fragment.childNodes;
}

export function readTableHtml(source: string, path: number[], line?: number): MystNode {
  const reject = (reason: string): never => tableGridError(reason, path, line);
  const structure = (children: Child[], allowed: string[]): Element[] => children.flatMap(child => {
    if (html.isTextNode(child) && /^[\t\n\f\r ]*$/.test(child.value)) return [];
    if (!html.isElementNode(child) || !allowed.includes(child.tagName)) reject("Expected " + allowed.join(" or ") + " in table HTML");
    return [child as Element];
  });
  const attrs = (node: Element, ...allowed: string[]): Map<string, string> => {
    if (node.attrs.some(attr => !allowed.includes(attr.name))) reject("Unsupported attribute on <" + node.tagName + ">");
    return new Map(node.attrs.map(attr => [attr.name, attr.value]));
  };
  const literal = (node: Element): string => node.childNodes.map(child => html.isTextNode(child)
    ? child.value : reject("<" + node.tagName + "> accepts text only")).join("");
  const positive = (value: string | undefined): number => {
    if (value === undefined) return 1;
    if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
      reject("Table spans and list starts must be positive decimal integers");
    }
    return Number(value);
  };
  function inline(children: Child[]): InlineContent[] {
    return children.map((child): InlineContent => {
      if (html.isTextNode(child)) return { kind: "text", text: child.value };
      if (!html.isElementNode(child)) return reject("Unsupported table inline node");
      const tag = child.tagName;
      if (tag === "br") { attrs(child); return { kind: "break" }; }
      if (tag === "code") { attrs(child); return { kind: "code", value: literal(child) }; }
      if (tag === "a") {
        const attributes = attrs(child, "href", "title");
        const url = attributes.get("href") ?? reject("Table link requires href");
        const title = attributes.get("title");
        return { kind: "link", url, ...(title !== undefined ? { title } : {}), children: inline(child.childNodes) };
      }
      if (tag === "span") {
        const role = attrs(child, "data-myst").get("data-myst");
        const value = literal(child);
        switch (role) {
          case "math": return { kind: "math", value };
          case "eq": case "numref": case "ref": return { kind: "reference", role, label: value };
          case "footnote": return { kind: "footnote", label: value };
          case "cite": case "cite:t": case "cite:p": return { kind: "citation", role, keys: value.split(",").map(key => key.trim()) };
          default: return reject("Unsupported table data-myst role");
        }
      }
      if (Object.hasOwn(MARKS, tag)) {
        attrs(child);
        return { kind: MARKS[tag as keyof typeof MARKS], children: inline(child.childNodes) };
      }
      return reject("Unsupported table inline tag <" + tag + ">");
    });
  }
  function list(node: Element): ListContent {
    const ordered = node.tagName === "ol";
    const attributes = ordered ? attrs(node, "start") : attrs(node);
    const items = structure(node.childNodes, ["li"]).map(item => {
      attrs(item);
      const nested = item.childNodes.at(-1);
      if (nested && html.isElementNode(nested) && ["ul", "ol"].includes(nested.tagName)) {
        return { content: inline(item.childNodes.slice(0, -1)), list: list(nested) };
      }
      return { content: inline(item.childNodes) };
    });
    return { ordered, ...(ordered ? { start: positive(attributes.get("start")) } : {}), items };
  }
  const roots = structure(readTree(source, reject), ["table"]);
  if (roots.length !== 1) reject("Expected one complete HTML table grid");
  attrs(roots[0]);
  const groups = structure(roots[0].childNodes, ["thead", "tbody"]);
  if (groups[0]?.tagName !== "thead" || groups.length > 2 || (groups[1] && groups[1].tagName !== "tbody")) {
    reject("Expected thead followed by an optional tbody");
  }
  const rowGroups = groups.map(group => {
    attrs(group);
    const rows = structure(group.childNodes, ["tr"]);
    if (!rows.length) reject("Table row groups cannot be empty");
    return rows;
  });
  const rows = rowGroups.flatMap((group, index) => group.map(row => {
    attrs(row);
    const cells = structure(row.childNodes, [index === 0 ? "th" : "td"]);
    const children: MystNode[] = cells.map(cell => {
      const attributes = attrs(cell, "rowspan", "colspan", "style");
      const style = attributes.get("style");
      const align = style === undefined ? undefined : /^[\t\n\f\r ]*text-align[\t\n\f\r ]*:[\t\n\f\r ]*(left|center|right)[\t\n\f\r ]*;?[\t\n\f\r ]*$/.exec(style)?.[1];
      if (style !== undefined && !align) reject("Only text-align: left, center or right is supported on table cells");
      const blocks = structure(cell.childNodes, ["p", "ul", "ol"]);
      if (!blocks.length) reject("An empty table cell requires an empty <p>");
      return {
        type: "tableCell", ...(index === 0 ? { header: true } : {}),
        rowspan: positive(attributes.get("rowspan")), colspan: positive(attributes.get("colspan")),
        ...(align !== undefined ? { align } : {}),
        children: blocks.map(block => {
          if (block.tagName !== "p") return createListNode(list(block));
          attrs(block);
          return { type: "paragraph", children: inlineContentToNodes(inline(block.childNodes)) };
        }),
      };
    });
    return { type: "tableRow", children };
  }));
  const table = { type: "table", headerRows: rowGroups[0].length, children: rows };
  locateTableCells(table, path);
  return table;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll("\n", "&#10;").replaceAll("\r", "&#13;").replaceAll("\t", "&#9;");
}

function attribute(name: string, value: string | number): string {
  return " " + name + '="' + escapeHtml(String(value)).replaceAll('"', "&quot;") + '"';
}

function writeInline(content: InlineContent[]): string {
  const span = (role: string, value: string) => "<span" + attribute("data-myst", role) + ">" + escapeHtml(value) + "</span>";
  return content.map(item => {
    switch (item.kind) {
      case "text": return escapeHtml(item.text);
      case "break": return "<br>";
      case "code": return "<code>" + escapeHtml(item.value) + "</code>";
      case "math": return span("math", item.value);
      case "reference": return span(item.role, item.label);
      case "footnote": return span("footnote", item.label);
      case "citation": return span(canonicalCitation(item).role, item.keys.join(","));
      case "link": return "<a" + attribute("href", item.url) + (item.title === undefined ? "" : attribute("title", item.title)) +
        ">" + writeInline(item.children) + "</a>";
      case "strong": case "emphasis": case "delete": case "subscript": case "superscript": {
        const tag = Object.entries(MARKS).find(([, kind]) => kind === item.kind)![0];
        return "<" + tag + ">" + writeInline(item.children) + "</" + tag + ">";
      }
    }
  }).join("");
}

function writeList(list: ListContent): string {
  const tag = list.ordered ? "ol" : "ul";
  const start = list.ordered && list.start !== 1 ? attribute("start", list.start!) : "";
  return "<" + tag + start + ">" + list.items.map(item =>
    "<li>" + writeInline(item.content) + (item.list ? writeList(item.list) : "") + "</li>").join("") + "</" + tag + ">";
}

export function writeTableHtml(table: MystNode, path: number[]): string {
  const lines = ["<table>", "<thead>"];
  const rows = table.children!;
  for (const [rowIndex, row] of rows.entries()) {
    if (rowIndex === table.headerRows) lines.push("</thead>", "<tbody>");
    lines.push("<tr>");
    for (const cell of row.children!) {
      const tag = cell.header ? "th" : "td";
      const attrs = (cell.rowspan === 1 ? "" : attribute("rowspan", cell.rowspan)) +
        (cell.colspan === 1 ? "" : attribute("colspan", cell.colspan)) +
        (cell.align === undefined ? "" : attribute("style", "text-align: " + cell.align));
      const cellPath = [...path, rowIndex, cell.column];
      const body = cell.children!.map(block => block.type === "paragraph"
        ? "<p>" + writeInline(tableInline(block, cellPath)) + "</p>" : writeList(tableList(block, cellPath))).join("");
      lines.push("<" + tag + attrs + ">" + body + "</" + tag + ">");
    }
    lines.push("</tr>");
  }
  lines.push(rows.length === table.headerRows ? "</thead>" : "</tbody>", "</table>");
  return lines.join("\n");
}
