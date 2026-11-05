import { inlineContentText, type EditableBlock, type EditableDocument, type InlineContent } from "@litzio/core";
import type { CompareRow } from "./comparison-rows.ts";
import { i18n } from "./i18n.ts";
const clip = (value: string) => value.length > 160 ? `${value.slice(0, 80)}…${value.slice(-80)}` : value;
function inline(content: InlineContent[]): string {
  return content.map(item => {
    if (item.kind === "link") return `${inline(item.children)} (${item.url}${item.title ? ` · ${item.title}` : ""})`;
    if (item.kind === "strong") return `${i18n.t("Bold")}(${inline(item.children)})`;
    if (item.kind === "emphasis") return `${i18n.t("Italic")}(${inline(item.children)})`;
    return inlineContentText([item]);
  }).join("");
}
function value(block: EditableBlock | undefined, field: string): string {
  if (!block) return "";
  const item = (block as unknown as Record<string, unknown>)[field];
  if (field === "content" || field === "caption") {
    const content = Array.isArray(item) ? item : item && typeof item === "object" && "content" in item ? item.content : [];
    return clip(inline(content as InlineContent[]));
  }
  return item === undefined ? "∅" : clip(String(item));
}
/** Format Core's selected fields using neutral read data; never decide equality here. */
export function comparisonDescription(row: CompareRow, before: EditableDocument, after: EditableDocument): string {
  if (!row.change) return i18n.t("Unchanged context");
  if (row.change.kind !== "changed") return `${row.number}. ${i18n.t(row.change.kind)}`;
  const a = before.blocks.find(block => block.path.join(",") === row.before?.join(","));
  const b = after.blocks.find(block => block.path.join(",") === row.after?.join(","));
  const details = row.change.details.map(detail => {
    const field = detail.split(":", 1)[0];
    const labels = { level: i18n.t("Heading level"), content: i18n.t("Text, formatting and links"), caption: i18n.t("Caption"),
      imageUrl: i18n.t("Image path"), imageAlt: i18n.t("Alt text"), latex: i18n.t("Equation source"), mermaidSource: i18n.t("Mermaid source"),
      label: i18n.t("Label"), enumerator: i18n.t("Fixed number"), code: i18n.t("Code"), language: i18n.t("Language") };
    if (field === "rows") return i18n.t("Table rows or cells changed.");
    const label = labels[field as keyof typeof labels];
    return label ? `${label}: ${value(a, field)} → ${value(b, field)}` : i18n.t("Block properties changed. See Source for details.");
  });
  return `${row.number}. ${i18n.t("changed")}: ${details.join("; ")}`;
}


/** Short label for the fields Core selected; detailed values stay in the tooltip. */
export function comparisonSummary(row: CompareRow): string {
  if (!row.change) return "";
  if (row.change.kind === "added") return i18n.t("Block added");
  if (row.change.kind === "removed") return i18n.t("Block removed");
  const fields = row.change.details.map(detail => detail.split(":", 1)[0]);
  if (fields.length === 1 && fields[0] === "content") return i18n.t("Text changed");
  if (fields.length === 1 && fields[0] === "level") return i18n.t("Heading level changed");
  return i18n.t("Block changed");
}
