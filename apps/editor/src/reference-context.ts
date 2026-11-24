import type { LabelRenameBlock } from "@litzio/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { fromTiptapContent } from "./tiptap-inline.ts";

/** Live block order and heading content for Core's reference lookup and rename plan. */
export function referenceContext(doc: ProseMirrorNode): LabelRenameBlock[] {
  const blocks: LabelRenameBlock[] = [];
  doc.forEach(node => blocks.push({
    block: node.type.name === "labelTarget" ? "target" : node.type.name === "footnoteDefinition" ? "footnote" : node.type.name,
    label: node.attrs.label, level: node.attrs.level,
    ...(node.type.name === "heading" ? { content: fromTiptapContent({ type: "doc", content: [{ type: "paragraph", content: node.toJSON().content }] }) } : {}),
  }));
  return blocks;
}
