import type { EditableBlock, EditableDocument } from "./editable.ts";
import type { InlineContent } from "./inline.ts";
import { formatSource, REQUIREMENT_STATUSES, REQUIREMENT_STRENGTHS, REQUIREMENT_TYPES, type RequirementSource } from "./myst/requirement.ts";
import { requirementBlocks } from "./requirements.ts";

/**
 * ReqIF export of a system requirements document (spike).
 *
 * ReqIF 1.2 (OMG formal/2016-07-01) keeps the machine-readable schema of 1.0.1: namespace
 * `http://www.omg.org/spec/ReqIF/20110401/reqif.xsd` and a fixed `REQ-IF-VERSION` of "1.0".
 *
 * Mapping:
 * - SPECIFICATION: the document; SPEC-HIERARCHY follows the heading outline;
 * - SPEC-OBJECT "Section" per heading, "Information" per other block (text as XHTML),
 *   "Requirement" per requirement block (ID, Title, Text XHTML, Status, Type, Strength, Source);
 * - SPEC-OBJECT "SourceSpan" per linked standard span (document, anchor, sentence, hash; no standard text)
 *   and a SPEC-RELATION "TraceToStandard" from each requirement to each span;
 * - SPEC-RELATION "Parent" for requirement parent links.
 */
export type ReqifOptions = { title?: string; creationTime?: string; language?: string; toolVersion?: string };

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const NAMESPACE = "http://www.omg.org/spec/ReqIF/20110401/reqif.xsd";
const XHTML = "http://www.w3.org/1999/xhtml";
const ID_SAFE = (value: string) => value.replace(/[^A-Za-z0-9._-]/g, "_");

function inline(items: InlineContent[]): string {
  return items.map(item => {
    switch (item.kind) {
      case "text": return esc(item.text);
      case "break": return "<xhtml:br/>";
      case "math": case "code": return `<xhtml:code>${esc(item.value)}</xhtml:code>`;
      case "strong": return `<xhtml:strong>${inline(item.children)}</xhtml:strong>`;
      case "emphasis": return `<xhtml:em>${inline(item.children)}</xhtml:em>`;
      case "delete": return `<xhtml:del>${inline(item.children)}</xhtml:del>`;
      case "subscript": return `<xhtml:sub>${inline(item.children)}</xhtml:sub>`;
      case "superscript": return `<xhtml:sup>${inline(item.children)}</xhtml:sup>`;
      case "link": return inline(item.children);
      case "reference": return esc(item.label);
      case "footnote": return `<xhtml:sup>${esc(item.label)}</xhtml:sup>`;
      default: return "";
    }
  }).join("");
}

function listXhtml(list: Extract<EditableBlock, { block: "list" }>): string {
  const render = (content: { ordered: boolean; items: { content: InlineContent[]; list?: typeof content }[] }): string =>
    `<xhtml:${content.ordered ? "ol" : "ul"}>${content.items.map(item => `<xhtml:li>${inline(item.content)}${item.list ? render(item.list) : ""}</xhtml:li>`).join("")}</xhtml:${content.ordered ? "ol" : "ul"}>`;
  return render(list);
}

/** XHTML (ReqIF subset) for a non-requirement, non-heading block; undefined when it carries no content. */
function informationXhtml(block: EditableBlock): string | undefined {
  switch (block.block) {
    case "paragraph": return `<xhtml:p>${inline(block.content)}</xhtml:p>`;
    case "quote": return `<xhtml:blockquote><xhtml:p>${inline(block.content)}</xhtml:p></xhtml:blockquote>`;
    case "admonition": return `<xhtml:p><xhtml:strong>${esc(block.variant)}</xhtml:strong>: ${inline(block.content)}</xhtml:p>`;
    case "list": return listXhtml(block);
    case "code": return `<xhtml:pre>${esc(block.code)}</xhtml:pre>`;
    case "equation": return `<xhtml:p><xhtml:code>${esc(block.latex)}</xhtml:code></xhtml:p>`;
    case "table": {
      const cell = (tag: string, content: InlineContent[]) => `<xhtml:${tag}>${inline(content)}</xhtml:${tag}>`;
      const [head, ...rows] = block.rows;
      return `<xhtml:table>${head ? `<xhtml:thead><xhtml:tr>${head.cells.map(item => cell("th", item.content)).join("")}</xhtml:tr></xhtml:thead>` : ""}<xhtml:tbody>${rows.map(row => `<xhtml:tr>${row.cells.map(item => cell("td", item.content)).join("")}</xhtml:tr>`).join("")}</xhtml:tbody></xhtml:table>`;
    }
    default: return undefined;
  }
}

function bodyXhtml(body: string): string {
  return body.split("\n\n").filter(Boolean).map(paragraph => `<xhtml:p>${esc(paragraph).replace(/\n/g, "<xhtml:br/>")}</xhtml:p>`).join("") || "<xhtml:p></xhtml:p>";
}

type Attr = { name: string; datatype: string; kind: "STRING" | "XHTML" | "INTEGER" | "ENUMERATION"; };
/** ReqIF's customary attribute names (Polarion, DOORS, StrictDoc): ForeignID, Name/ChapterName, Text. */
const LONG_NAME: Record<string, string> = { "section.Title": "ReqIF.ChapterName", "requirement.Title": "ReqIF.Name", "requirement.ID": "ReqIF.ForeignID", "span.ID": "ReqIF.ForeignID", "requirement.Text": "ReqIF.Text", "information.Text": "ReqIF.Text" };

export function exportReqif(system: EditableDocument, options: ReqifOptions = {}): string {
  const time = options.creationTime ?? new Date().toISOString();
  const title = options.title ?? system.title ?? "System requirements";
  const language = options.language ?? "ko";
  const enumerations: [string, readonly string[]][] = [["Status", REQUIREMENT_STATUSES], ["Type", REQUIREMENT_TYPES], ["Strength", REQUIREMENT_STRENGTHS]];
  const enumId = (kind: string, value: string) => `EV-${kind}-${ID_SAFE(value)}`;
  const types: Record<string, { id: string; name: string; attrs: Attr[] }> = {
    section: { id: "T-Section", name: "Section", attrs: [{ name: "Title", datatype: "DT-String", kind: "STRING" }] },
    information: { id: "T-Information", name: "Information", attrs: [{ name: "Text", datatype: "DT-XHTML", kind: "XHTML" }] },
    requirement: { id: "T-Requirement", name: "Requirement", attrs: [
      { name: "ID", datatype: "DT-String", kind: "STRING" }, { name: "Title", datatype: "DT-String", kind: "STRING" },
      { name: "Text", datatype: "DT-XHTML", kind: "XHTML" }, { name: "Status", datatype: "DT-Status", kind: "ENUMERATION" },
      { name: "Type", datatype: "DT-Type", kind: "ENUMERATION" }, { name: "Strength", datatype: "DT-Strength", kind: "ENUMERATION" },
      { name: "Source", datatype: "DT-String", kind: "STRING" }] },
    span: { id: "T-SourceSpan", name: "SourceSpan", attrs: [
      { name: "ID", datatype: "DT-String", kind: "STRING" },
      { name: "Document", datatype: "DT-String", kind: "STRING" }, { name: "Anchor", datatype: "DT-String", kind: "STRING" },
      { name: "Sentence", datatype: "DT-Integer", kind: "INTEGER" }, { name: "Hash", datatype: "DT-String", kind: "STRING" }] },
  };
  const attrId = (type: string, name: string) => `AD-${types[type].name}-${name}`;
  const value = (type: string, name: string, kind: Attr["kind"], content: string) => {
    const definition = `<ATTRIBUTE-DEFINITION-${kind}-REF>${attrId(type, name)}</ATTRIBUTE-DEFINITION-${kind}-REF>`;
    if (kind === "XHTML") return `<ATTRIBUTE-VALUE-XHTML><DEFINITION>${definition}</DEFINITION><THE-VALUE><xhtml:div>${content}</xhtml:div></THE-VALUE></ATTRIBUTE-VALUE-XHTML>`;
    if (kind === "ENUMERATION") return `<ATTRIBUTE-VALUE-ENUMERATION><DEFINITION>${definition}</DEFINITION><VALUES><ENUM-VALUE-REF>${content}</ENUM-VALUE-REF></VALUES></ATTRIBUTE-VALUE-ENUMERATION>`;
    return `<ATTRIBUTE-VALUE-${kind} THE-VALUE="${esc(content)}"><DEFINITION>${definition}</DEFINITION></ATTRIBUTE-VALUE-${kind}>`;
  };
  const object = (id: string, type: string, name: string, values: string[]) =>
    `<SPEC-OBJECT IDENTIFIER="${id}" LAST-CHANGE="${time}" LONG-NAME="${esc(name)}"><TYPE><SPEC-OBJECT-TYPE-REF>${types[type].id}</SPEC-OBJECT-TYPE-REF></TYPE><VALUES>${values.join("")}</VALUES></SPEC-OBJECT>`;

  const objects: string[] = [];
  const relations: string[] = [];
  const spans = new Map<string, string>();
  const requirementObject = new Map<string, string>();
  type Node = { object: string; children: Node[]; level: number };
  const root: Node = { object: "", children: [], level: 0 };
  const stack: Node[] = [root];
  let counter = 0;
  const add = (id: string, level: number): void => {
    const node: Node = { object: id, children: [], level };
    stack.at(-1)!.children.push(node);
    if (level > 0) stack.push(node);
  };
  for (const block of system.blocks) {
    if (block.block === "heading") {
      while (stack.length > 1 && stack.at(-1)!.level >= block.level) stack.pop();
      const id = `O-Section-${++counter}`;
      objects.push(object(id, "section", block.text, [value("section", "Title", "STRING", block.text)]));
      add(id, block.level);
    } else if (block.block === "requirement") {
      const id = `O-${ID_SAFE(block.id)}`;
      requirementObject.set(block.id, id);
      objects.push(object(id, "requirement", block.title, [
        value("requirement", "ID", "STRING", block.id), value("requirement", "Title", "STRING", block.title),
        value("requirement", "Text", "XHTML", bodyXhtml(block.body)),
        value("requirement", "Status", "ENUMERATION", enumId("Status", block.status)),
        value("requirement", "Type", "ENUMERATION", enumId("Type", block.type)),
        value("requirement", "Strength", "ENUMERATION", enumId("Strength", block.strength)),
        value("requirement", "Source", "STRING", block.sources.map(formatSource).join(" "))]));
      stack.at(-1)!.children.push({ object: id, children: [], level: 0 });
    } else {
      const xhtml = informationXhtml(block);
      if (!xhtml) continue;
      const id = `O-Info-${++counter}`;
      objects.push(object(id, "information", "", [value("information", "Text", "XHTML", xhtml)]));
      stack.at(-1)!.children.push({ object: id, children: [], level: 0 });
    }
  }
  const spanObject = (source: RequirementSource): string => {
    const key = formatSource(source);
    let id = spans.get(key);
    if (!id) {
      id = `O-Span-${spans.size + 1}`;
      spans.set(key, id);
      objects.push(object(id, "span", key, [value("span", "ID", "STRING", `${source.document}#${source.anchor}~s${source.sentence}`), value("span", "Document", "STRING", source.document), value("span", "Anchor", "STRING", source.anchor),
        value("span", "Sentence", "INTEGER", String(source.sentence)), value("span", "Hash", "STRING", source.hash)]));
    }
    return id;
  };
  let relationCount = 0;
  const relation = (type: string, from: string, to: string) => relations.push(`<SPEC-RELATION IDENTIFIER="R-${++relationCount}" LAST-CHANGE="${time}"><TYPE><SPEC-RELATION-TYPE-REF>${type}</SPEC-RELATION-TYPE-REF></TYPE><SOURCE><SPEC-OBJECT-REF>${from}</SPEC-OBJECT-REF></SOURCE><TARGET><SPEC-OBJECT-REF>${to}</SPEC-OBJECT-REF></TARGET></SPEC-RELATION>`);
  for (const block of requirementBlocks(system)) {
    const from = requirementObject.get(block.id);
    if (!from) continue;
    for (const source of block.sources) relation("RT-TraceToStandard", from, spanObject(source));
    for (const parent of block.parents) { const to = requirementObject.get(parent); if (to) relation("RT-Parent", from, to); }
  }
  let hierarchy = 0;
  const render = (node: Node): string => `<SPEC-HIERARCHY IDENTIFIER="H-${++hierarchy}" LAST-CHANGE="${time}"><OBJECT><SPEC-OBJECT-REF>${node.object}</SPEC-OBJECT-REF></OBJECT>${node.children.length ? `<CHILDREN>${node.children.map(render).join("")}</CHILDREN>` : ""}</SPEC-HIERARCHY>`;
  const definition = (type: string, attr: Attr) => {
    const ref = attr.kind === "ENUMERATION" ? `<TYPE><DATATYPE-DEFINITION-ENUMERATION-REF>${attr.datatype}</DATATYPE-DEFINITION-ENUMERATION-REF></TYPE>`
      : `<TYPE><DATATYPE-DEFINITION-${attr.kind}-REF>${attr.datatype}</DATATYPE-DEFINITION-${attr.kind}-REF></TYPE>`;
    return `<ATTRIBUTE-DEFINITION-${attr.kind} IDENTIFIER="${attrId(type, attr.name)}" LAST-CHANGE="${time}" LONG-NAME="${LONG_NAME[`${type}.${attr.name}`] ?? attr.name}"${attr.kind === "ENUMERATION" ? ' MULTI-VALUED="false"' : ""}>${ref}</ATTRIBUTE-DEFINITION-${attr.kind}>`;
  };
  const specTypes = Object.entries(types).map(([key, type]) =>
    `<SPEC-OBJECT-TYPE IDENTIFIER="${type.id}" LAST-CHANGE="${time}" LONG-NAME="${type.name}"><SPEC-ATTRIBUTES>${type.attrs.map(attr => definition(key, attr)).join("")}</SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE>`);
  const relationTypes = [["RT-TraceToStandard", "TraceToStandard"], ["RT-Parent", "Parent"]].map(([id, name]) => `<SPEC-RELATION-TYPE IDENTIFIER="${id}" LAST-CHANGE="${time}" LONG-NAME="${name}"/>`);
  const datatypes = [
    `<DATATYPE-DEFINITION-STRING IDENTIFIER="DT-String" LAST-CHANGE="${time}" LONG-NAME="String" MAX-LENGTH="4096"/>`,
    `<DATATYPE-DEFINITION-XHTML IDENTIFIER="DT-XHTML" LAST-CHANGE="${time}" LONG-NAME="XHTML"/>`,
    `<DATATYPE-DEFINITION-INTEGER IDENTIFIER="DT-Integer" LAST-CHANGE="${time}" LONG-NAME="Integer" MAX="100000" MIN="0"/>`,
    ...enumerations.map(([name, values]) => `<DATATYPE-DEFINITION-ENUMERATION IDENTIFIER="DT-${name}" LAST-CHANGE="${time}" LONG-NAME="${name}"><SPECIFIED-VALUES>${values.map((item, index) =>
      `<ENUM-VALUE IDENTIFIER="${enumId(name, item)}" LAST-CHANGE="${time}" LONG-NAME="${item}"><PROPERTIES><EMBEDDED-VALUE KEY="${index}" OTHER-CONTENT="${item}"/></PROPERTIES></ENUM-VALUE>`).join("")}</SPECIFIED-VALUES></DATATYPE-DEFINITION-ENUMERATION>`),
  ];
  const spec = (id: string, name: string, children: Node[]) => `<SPECIFICATION IDENTIFIER="${id}" LAST-CHANGE="${time}" LONG-NAME="${esc(name)}"><TYPE><SPECIFICATION-TYPE-REF>ST-Document</SPECIFICATION-TYPE-REF></TYPE>${children.length ? `<CHILDREN>${children.map(render).join("")}</CHILDREN>` : ""}</SPECIFICATION>`;
  const specification = spec("S-1", title, root.children) + (spans.size ? spec("S-2", `${title} — referenced standard spans`, [...spans.values()].map(object => ({ object, children: [], level: 0 }))) : "");
  const body = `<REQ-IF-CONTENT><DATATYPES>${datatypes.join("")}</DATATYPES><SPEC-TYPES>${specTypes.join("")}${relationTypes.join("")}<SPECIFICATION-TYPE IDENTIFIER="ST-Document" LAST-CHANGE="${time}" LONG-NAME="Document"/></SPEC-TYPES><SPEC-OBJECTS>${objects.join("")}</SPEC-OBJECTS>${relations.length ? `<SPEC-RELATIONS>${relations.join("")}</SPEC-RELATIONS>` : ""}<SPECIFICATIONS>${specification}</SPECIFICATIONS></REQ-IF-CONTENT>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<REQ-IF xmlns="${NAMESPACE}" xmlns:xhtml="${XHTML}" xml:lang="${language}"><THE-HEADER><REQ-IF-HEADER IDENTIFIER="H-0"><CREATION-TIME>${time}</CREATION-TIME><REQ-IF-TOOL-ID>Litzio requirements spike</REQ-IF-TOOL-ID><REQ-IF-VERSION>1.0</REQ-IF-VERSION><SOURCE-TOOL-ID>Litzio</SOURCE-TOOL-ID><TITLE>${esc(title)}</TITLE></REQ-IF-HEADER></THE-HEADER><CORE-CONTENT>${body}</CORE-CONTENT></REQ-IF>\n`;
}
