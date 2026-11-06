import { canonicalCitation, citationContentError, type CitationContent } from "../citation.ts";
import { labelIdentifier } from "./label.ts";
import type { MystNode } from "./tree.ts";

const CITE_FIELDS = new Set(["type", "kind", "label", "identifier", "position"]);
const GROUP_FIELDS = new Set(["type", "kind", "children", "position"]);

/** Strict projection: upstream prefix/suffix/partial and unknown attributes have no native meaning. */
export function projectCitation(node: MystNode): CitationContent | undefined {
  const group = node.type === "citeGroup";
  if (!group && node.type !== "cite") return undefined;
  if (node.kind !== "narrative" && node.kind !== "parenthetical") return undefined;
  if (!group && node.kind !== "narrative") return undefined;
  if (group && (!Object.keys(node).every(key => GROUP_FIELDS.has(key)) || !node.children?.length)) return undefined;
  const children = group ? node.children! : [node];
  if (children.some(child => child.type !== "cite" || child.kind !== node.kind || typeof child.label !== "string" ||
    child.identifier !== labelIdentifier(child.label) || !Object.keys(child).every(key => CITE_FIELDS.has(key)))) return undefined;
  const content: CitationContent = { kind: "citation", role: group ? node.kind === "narrative" ? "cite:t" : "cite:p" : "cite",
    keys: children.map(child => String(child.label)) };
  return citationContentError(content) ? undefined : content;
}

export function citationToNode(input: CitationContent): MystNode {
  const content = canonicalCitation(input);
  const kind = content.role === "cite:p" ? "parenthetical" : "narrative";
  const children = content.keys.map(label => ({ type: "cite", kind, label, identifier: labelIdentifier(label) }));
  return content.role === "cite" ? children[0] : { type: "citeGroup", kind, children };
}
