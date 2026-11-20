import { DocumentDiagnosticError } from "../write-error.ts";
import type { InlineContent } from "../inline.ts";
import { inlineContentToNodes, projectInlineContent } from "../inline.ts";
import { updateLabel } from "../operations.ts";
import { labelAvailability, labelIdentifier } from "./label.ts";
import { createFigureNode } from "./figure.ts";
import { createTableNode, tableBlockNode } from "./table.ts";
import type { MystDocument, MystNode } from "./tree.ts";

/** Current document order, including non-target blocks separating section labels from headings.
 * Only headings need content: MyST derives their implicit target IDs from it. */
export type LabelRenameBlock = {
  block: string;
  label?: string;
  level?: number;
  content?: InlineContent[];
};
export type LabelRenameReference = Extract<InlineContent, { kind: "reference" }> | { kind: "link"; url: string };

/** Plan reference attribute changes for a live interface snapshot, without requiring its
 * unfinished body content to be writable. Target lookup, refusal and reference rewriting use
 * the same MyST operation as updateLabel; this is not a second reference resolver.
 * Indices address the supplied reference list, never persistent document identities.
 * The caller must supply every target block and role/link reference in the current snapshot. */
export function planLabelRename(blocks: readonly LabelRenameBlock[], index: number, label: string,
  references: readonly LabelRenameReference[]): { index: number; reference: LabelRenameReference }[] {
  const targets = targetContext(blocks);
  const queries: MystNode[] = references.map(reference => {
    const content: InlineContent = reference.kind === "link"
      ? { ...reference, children: [{ kind: "text", text: "link" }] } : reference;
    return { type: "paragraph", children: inlineContentToNodes([content]) };
  });
  // Queries precede the target context so a trailing, unattached target cannot attach to one.
  const document: MystDocument = { type: "root", children: [...queries, ...targets] };
  const next = updateLabel(document, [references.length + index], label, { updateReferences: true });
  return references.flatMap<{ index: number; reference: LabelRenameReference }>((before, index) => {
    const after = projectInlineContent(next.children[index])![0];
    if (before.kind === "link" && after.kind === "link") {
      return before.url === after.url ? [] : [{ index, reference: { kind: "link" as const, url: after.url } }];
    }
    if (before.kind === "reference" && after.kind === "reference") {
      return before.label === after.label ? [] : [{ index, reference: after }];
    }
    throw new DocumentDiagnosticError("invalid-reference", "label rename changed reference kind");
  });
}

/** The MyST target context of a live interface snapshot: headings keep their content for
 * implicit IDs, labeled blocks keep their label, other blocks only keep their place. */
function targetContext(blocks: readonly LabelRenameBlock[]): MystNode[] {
  return blocks.map(block => {
    const name = block.label ?? "";
    const attrs = name ? { label: name, identifier: labelIdentifier(name) } : {};
    switch (block.block) {
      case "heading": return { type: "heading", depth: block.level ?? 1, children: inlineContentToNodes(block.content ?? []) };
      case "target": return { type: "mystTarget", label: name };
      case "equation": return { type: "math", value: "x", ...attrs };
      case "figure": return { ...createFigureNode({ imageUrl: "", imageAlt: "", caption: "" }), ...attrs };
      case "table": return tableBlockNode(createTableNode([[[{ kind: "text", text: "x" }]]]), [], name, attrs.identifier);
      default: return { type: "paragraph", children: [{ type: "text", value: "x" }] };
    }
  });
}

/** Refuse labels a paste would add to a live interface snapshot when they name another target,
 * with the same MyST target availability as updateLabel (and Save). `pasted` indexes the
 * labeled blocks the paste adds; other blocks' existing duplicates never refuse the paste. */
export function assertPastedLabelsAvailable(blocks: readonly LabelRenameBlock[], pasted: readonly number[]): void {
  const available = labelAvailability({ type: "root", children: targetContext(blocks) });
  for (const index of pasted) {
    const label = blocks[index]?.label;
    if (label) available(label, [index]);
  }
}
