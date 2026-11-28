import { structuralInlineContent, projectInlineContent, type InlineContent } from "../inline.ts";
import type { MystNode } from "./tree.ts";

/** MyST's standard admonition kinds. The generic `admonition` directive needs a title and is not authored. */
export const ADMONITION_VARIANTS = [
  "note", "tip", "hint", "important", "seealso", "attention", "caution", "warning", "danger", "error",
] as const;
export type AdmonitionVariant = typeof ADMONITION_VARIANTS[number];

const SIMPLE_VARIANTS = new Set<string>(ADMONITION_VARIANTS);
const ADMONITION_FIELDS = new Set(["type", "kind", "children", "position"]);
const PARAGRAPH_FIELDS = new Set(["type", "children", "position"]);

const githubAlerts = {
  note: "NOTE", tip: "TIP", important: "IMPORTANT", warning: "WARNING", danger: "CAUTION",
} as const;

export function githubAlertTag(kind: unknown): string | undefined {
  const entry = Object.entries(githubAlerts).find(([variant]) => variant === kind);
  return entry?.[1];
}

/** The raw header distinguishes a real marker from decoded escape/entity text. */
export function recognizeGitHubAlert(quote: MystNode, lines: readonly string[]): MystNode | undefined {
  const position = quote.position!;
  const header = /^ {0,3}>[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i.exec(lines[position.start.line - 1]);
  if (!header || lines.slice(position.start.line, position.end.line).some(line => !/^ {0,3}>/.test(line))) return;
  const [first, second, ...rest] = quote.children ?? [];
  if (first?.type !== "paragraph" || rest.length) return;
  const [opening, ...remainder] = first.children ?? [];
  const marker = `[!${header[1]}]`;
  if (opening?.type !== "text" || typeof opening.value !== "string") return;
  let body: MystNode;
  if (opening.value === marker && remainder.length === 0 && second?.type === "paragraph") {
    body = second;
  } else if (!second && opening.value.startsWith(marker + "\n")) {
    const content = opening.value.slice(marker.length + 1);
    body = { ...first, children: [...(content ? [{ ...opening, value: content }] : []), ...remainder] };
  } else if (!second && opening.value === marker && remainder[0]?.type === "break") {
    body = { ...first, children: remainder.slice(1) };
  } else return;
  const kind = Object.entries(githubAlerts).find(([, tag]) => tag === header[1].toUpperCase())?.[0];
  const node: MystNode = { ...quote, type: "admonition", kind, children: [body] };
  return supportedAdmonitionContent(node) ? node : undefined;
}

export function isAdmonitionVariant(variant: string): variant is AdmonitionVariant {
  return SIMPLE_VARIANTS.has(variant);
}

/** The deliberately narrow MyST shape that can be edited without flattening admonition semantics. */
export function supportedAdmonitionContent(node: MystNode): InlineContent[] | undefined {
  if (node.type !== "admonition" || typeof node.kind !== "string" || !SIMPLE_VARIANTS.has(node.kind) ||
      !Object.keys(node).every((key) => ADMONITION_FIELDS.has(key))) return undefined;
  const children = node.children ?? [];
  if (children.length === 0) return [];
  if (children.length !== 1) return undefined;
  const paragraph = children[0];
  if (paragraph.type !== "paragraph" || !Object.keys(paragraph).every((key) => PARAGRAPH_FIELDS.has(key))) {
    return undefined;
  }
  const content = projectInlineContent(paragraph);
  if (!content || structuralInlineContent(content).length === 0) return undefined;
  return content;
}
