import { endnoteOrder, planEndnoteLifecycle, type EndnoteBlock } from "@litzio/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { TiptapJSON } from "./tiptap-document.ts";

/** Whether this editor keeps every top-level block: a content-only editor's structure guard
 * (editor-schema.tsx) is installed. Commands then move the caret instead of adding blocks. */
export function isStructureLocked(state: EditorState): boolean {
  return state.plugins.some(plugin => plugin.spec.lockStructure === true);
}

/** Shown when a content-only editor refuses a change to endnote references. */
export const LOCKED_ENDNOTES_REJECTION = "This view cannot add, remove or reorder endnote references, because that would add, remove or move endnotes.";

/**
 * Whether Save keeps every endnote definition where it is, by Core's endnote rules: no definition
 * loses its last reference (planEndnoteLifecycle would remove it), the definitions keep their
 * endnote order (canonical write and parse place them by it), and no reference names a label
 * without a definition (the write would need a new one). Blocks are the same top-level blocks.
 */
export function keepsEndnotes(before: readonly EndnoteBlock[], after: readonly EndnoteBlock[]): boolean {
  const plan = planEndnoteLifecycle(before, after);
  if (plan.removeDefinitions.length || plan.removeReferences.length) return false;
  if (JSON.stringify(endnoteOrder(before)) !== JSON.stringify(endnoteOrder(after))) return false;
  const undefinedLabels = (blocks: readonly EndnoteBlock[]) => {
    const defined = new Set(blocks.flatMap(block => block.definition === undefined ? [] : [block.definition]));
    return new Set(blocks.flatMap(block => block.references.filter(label => !defined.has(label))));
  };
  const already = undefinedLabels(before);
  return [...undefinedLabels(after)].every(label => already.has(label));
}

function referencesIn(node: ProseMirrorNode): string[] {
  const references: string[] = [];
  node.descendants(child => { if (child.type.name === "footnoteReference") references.push(String(child.attrs.label)); });
  return references;
}

function editorEndnoteBlocks(doc: ProseMirrorNode): EndnoteBlock[] {
  const blocks: EndnoteBlock[] = [];
  doc.forEach(node => blocks.push({ ...(node.type.name === "footnoteDefinition" ? { definition: String(node.attrs.label) } : {}), references: referencesIn(node) }));
  return blocks;
}

/** keepsEndnotes for an editor change that keeps the top-level blocks. Only edited blocks can
 * change references, so ordinary typing compares just those. */
export function editorKeepsEndnotes(before: ProseMirrorNode, next: ProseMirrorNode): boolean {
  let changed = false;
  for (let index = 0; index < next.childCount && !changed; index++) {
    const previous = before.child(index), current = next.child(index);
    if (previous !== current && referencesIn(previous).join("\u0000") !== referencesIn(current).join("\u0000")) changed = true;
  }
  return !changed || keepsEndnotes(editorEndnoteBlocks(before), editorEndnoteBlocks(next));
}

/** Endnote blocks of an editor document as Save reads it (Tiptap JSON). */
export function endnoteBlocksOf(document: TiptapJSON): EndnoteBlock[] {
  const referencesOf = (node: TiptapJSON): string[] => [
    ...(node.type === "footnoteReference" ? [String(node.attrs?.label ?? "")] : []),
    ...(node.content ?? []).flatMap(referencesOf),
  ];
  return (document.content ?? []).map(node => ({
    ...(node.type === "footnoteDefinition" ? { definition: String(node.attrs?.label ?? "") } : {}),
    references: (node.content ?? []).flatMap(referencesOf),
  }));
}
