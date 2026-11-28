import { structuralInlineContent, inlineContentToNodes, projectInlineContent } from "../inline.ts";
import { LIST_STYLES, type ListContent, type ListItemContent } from "../list.ts";
import type { MystNode } from "./tree.ts";

const LIST_FIELDS = new Set(["type", "ordered", "start", "style", "delimiter", "spread", "children", "position"]);
const ITEM_FIELDS = new Set(["type", "spread", "checked", "children", "position"]);
const PARAGRAPH_FIELDS = new Set(["type", "children", "position"]);

const hasOnly = (node: MystNode, fields: Set<string>) => Object.keys(node).every((key) => fields.has(key));

/**
 * List v1 authoring supports bullet lists, numbered lists and checklists whose items hold zero or
 * one paragraph of supported inline content, optionally followed by one nested list. A checklist
 * is a bullet list whose every item has a check state (GFM `- [ ]` / `- [x]`). Checkboxes on
 * numbered items or on only some items, items with several paragraphs or other blocks are
 * rejected by native admission (see `checklistShapeIssue`).
 */
export function supportedListContent(node: MystNode, preserveWhitespace = false): ListContent | undefined {
  if (node.type !== "list" || typeof node.ordered !== "boolean" || typeof node.spread !== "boolean" || !hasOnly(node, LIST_FIELDS)) {
    return undefined;
  }
  if (node.ordered ? !Number.isInteger(node.start) : node.start !== undefined) return undefined;
  if (node.ordered ? !LIST_STYLES.includes(node.style) || ![".", ")"].includes(node.delimiter)
    : node.style !== undefined || node.delimiter !== undefined) return undefined;
  const children = node.children ?? [];
  if (children.length === 0) return undefined;
  const checklist = typeof children[0].checked === "boolean";
  if (checklist && node.ordered) return undefined;
  const items: ListItemContent[] = [];
  for (const item of children) {
    if (item.type !== "listItem" || typeof item.spread !== "boolean" || !hasOnly(item, ITEM_FIELDS)) return undefined;
    if (checklist ? typeof item.checked !== "boolean" : item.checked !== undefined) return undefined;
    const children = [...(item.children ?? [])];
    const paragraph = children[0]?.type === "paragraph" ? children.shift() : undefined;
    const [nested, ...rest] = children;
    if ((paragraph && !hasOnly(paragraph, PARAGRAPH_FIELDS)) || rest.length > 0) return undefined;
    const content = paragraph ? projectInlineContent(paragraph) : [];
    if (!content || (paragraph && !preserveWhitespace && structuralInlineContent(content).length === 0)) return undefined;
    const list = nested === undefined ? undefined : supportedListContent(nested, preserveWhitespace);
    if (nested !== undefined && !list) return undefined;
    items.push({ content, ...(checklist ? { checked: item.checked } : {}), ...(list ? { list } : {}) });
  }
  const spacing = isLooseList(node) ? { loose: true } : {};
  if (checklist && spacing.loose) return undefined;
  return node.ordered ? { ordered: true, start: node.start, ...spacing,
    ...(node.style !== "decimal" ? { style: node.style } : {}),
    ...(node.delimiter !== "." ? { delimiter: node.delimiter } : {}), items }
    : { ordered: false, ...spacing, ...(checklist ? { checklist: true } : {}), items };
}

/** Only this list's direct gaps affect its CommonMark rendering. */
export function isLooseList(node: MystNode): boolean {
  const items = node.children ?? [];
  return (node.spread === true && items.length > 1) ||
    items.some(item => item.spread === true && (item.children?.length ?? 0) > 1);
}

/** The existing Markdown marker must be able to start on the next line of a paragraph. */
export function nestedListNeedsBlank(node: MystNode): boolean {
  const [paragraph, nested] = node.children ?? [];
  if (paragraph?.type !== "paragraph" || nested?.type !== "list") return false;
  const first = nested.children?.[0];
  const startsWithText = first?.checked !== undefined || first?.children?.[0]?.type === "paragraph";
  return !startsWithText || (nested.ordered && (nested.start !== 1 || nested.style !== "decimal"));
}

/** Why a parsed list cannot be a native checklist, at any nesting depth, or undefined.
 * Reported before the general refusal so the reason names the checkbox shape. */
export function checklistShapeIssue(node: MystNode): string | undefined {
  if (node.type === "list") {
    const items = node.children ?? [];
    // myst-parser reads checkboxes only in tight lists; a loose list keeps them as raw HTML.
    const loose = (item: MystNode) => item.children?.[0]?.type === "paragraph" && item.children[0].children?.[0]?.type === "html" &&
      String(item.children[0].children[0].value).includes("task-list-item-checkbox");
    const boxes = items.filter(item => item.checked !== undefined || loose(item)).length;
    if (boxes > 0 && node.ordered) return "Checkboxes are supported only in bullet lists (- [ ] item), not in numbered lists";
    if (boxes > 0 && boxes < items.length) return "A checklist needs a checkbox on every item; this list mixes items with and without checkboxes";
    if (items.some(loose)) return "Checklist items must not be separated by blank lines";
  }
  for (const child of node.children ?? []) {
    const issue = checklistShapeIssue(child);
    if (issue) return issue;
  }
  return undefined;
}

/** The MyST structure myst-parser produces for a Markdown list of this content. */
export function createListNode(list: ListContent, markdown = true): MystNode {
  const items = list.items.map((item): MystNode => {
    const node: MystNode = {
      type: "listItem",
      ...(list.checklist ? { checked: item.checked === true } : {}),
      children: [
        ...(item.content.length ? [{ type: "paragraph", children: inlineContentToNodes(item.content) }] : []),
        ...(item.list ? [createListNode(item.list, markdown)] : []),
      ],
    };
    node.spread = (markdown && nestedListNeedsBlank(node)) ||
      (list.loose === true && list.items.length === 1 && node.children!.length > 1);
    return node;
  });
  return {
    type: "list",
    ordered: list.ordered,
    ...(list.ordered ? { start: list.start ?? 1, style: list.style ?? "decimal", delimiter: list.delimiter ?? "." } : {}),
    spread: list.loose === true && items.length > 1 && !items.some(item => item.spread),
    children: items,
  };
}
