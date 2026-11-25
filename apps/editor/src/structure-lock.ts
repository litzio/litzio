import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { TiptapJSON } from "./tiptap-document.ts";

/** Whether this editor keeps every top-level block: a content-only editor's structure guard
 * (editor-schema.tsx) is installed. Commands then move the caret instead of adding blocks. */
export function isStructureLocked(state: EditorState): boolean {
  return state.plugins.some(plugin => plugin.spec.lockStructure === true);
}

/** Shown when a content-only editor refuses a change to endnote references. */
export const LOCKED_ENDNOTES_REJECTION = "This view cannot add, remove or move endnote references.";

/**
 * Endnote references by place: for each node holding references inline (a paragraph, heading,
 * list item paragraph, table cell, caption, …), its child-index path from the document and the
 * labels it holds, in order. Save completes endnotes from references (removing, adding or
 * reordering definitions), so content editing keeps this map exactly. Keyed by place, the
 * comparison does not depend on the order in which a reader visits the document.
 */
type ReferencePlaces = Map<string, string>;

type Tree = { type: string; label: string; items: Tree[] };

function placesOf(root: Tree, prefix: readonly number[]): ReferencePlaces {
  const places: ReferencePlaces = new Map();
  const visit = (node: Tree, path: readonly number[]) => {
    const labels = node.items.filter(child => child.type === "footnoteReference").map(child => child.label);
    if (labels.length) places.set(path.join(","), labels.join("\u0000"));
    node.items.forEach((child, index) => visit(child, [...path, index]));
  };
  visit(root, prefix);
  return places;
}

function samePlaces(before: ReferencePlaces, after: ReferencePlaces): boolean {
  return before.size === after.size && [...before].every(([place, labels]) => after.get(place) === labels);
}

function editorTree(node: ProseMirrorNode): Tree {
  const items: Tree[] = [];
  node.forEach(child => items.push(editorTree(child)));
  return { type: node.type.name, label: String(node.attrs.label ?? ""), items };
}

function jsonTree(node: TiptapJSON): Tree {
  return { type: node.type ?? "", label: String(node.attrs?.label ?? ""), items: (node.content ?? []).map(jsonTree) };
}

/** An editor change keeps the endnote references of every place. Top-level blocks are the same
 * blocks, so only blocks the change replaced are compared. */
export function editorKeepsEndnoteReferences(before: ProseMirrorNode, next: ProseMirrorNode): boolean {
  for (let index = 0; index < next.childCount; index++) {
    const previous = before.child(index), current = next.child(index);
    if (previous !== current && !samePlaces(placesOf(editorTree(previous), [index]), placesOf(editorTree(current), [index]))) return false;
  }
  return true;
}

/** The submitted editor document keeps the endnote references of every place of the opening one. */
export function keepsEndnoteReferences(opening: TiptapJSON, submitted: TiptapJSON): boolean {
  return samePlaces(placesOf(jsonTree(opening), []), placesOf(jsonTree(submitted), []));
}
