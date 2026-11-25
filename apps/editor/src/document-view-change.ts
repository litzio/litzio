import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { TiptapJSON } from "./tiptap-document.ts";

/**
 * A plugin document view shows a change before its official write (#1995): top-level blocks are
 * replaced outside history, the structure lock and the read-only boundary, and the write's result
 * later becomes the view's opening snapshot. Only the transaction objects built here are changes:
 * no meta name or value marks them, so no other transaction (input, paste, an input rule, an
 * assistant edit, or one copying another's metas) can pass as one.
 */
const changes = new WeakMap<Transaction, { baseline?: TiptapJSON }>();

/** Document attributes a change sets; null removes one. */
export type DocumentViewAttrs = { title: string | null; status: string | null; headingNumbering: unknown; referenceTemplates: object | null };
const ATTRS = ["title", "status", "headingNumbering", "referenceTemplates"] as const;

export function isDocumentViewChange(tr: Transaction): boolean {
  return changes.has(tr);
}

/** The new opening snapshot a rebase transaction carries. */
export function documentViewBaseline(tr: Transaction): TiptapJSON | undefined {
  return changes.get(tr)?.baseline;
}

const differs = (a: unknown, b: unknown) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);

function attrsOf(doc: ProseMirrorNode): DocumentViewAttrs {
  return Object.fromEntries(ATTRS.map(name => [name, doc.attrs[name] ?? null])) as DocumentViewAttrs;
}

/** Replace top-level blocks [from, from + removed) with `nodes` and set the document attributes.
 * Returns the transaction and what it replaced, for putting it back. Throws on a range or node
 * the schema does not accept, before anything is applied. */
export function replaceTopLevel(state: EditorState, from: number, removed: number, nodes: readonly TiptapJSON[], attrs: DocumentViewAttrs) {
  const { doc, schema } = state;
  if (!Number.isInteger(from) || !Number.isInteger(removed) || from < 0 || removed < 0 || from + removed > doc.childCount) {
    throw new Error("The change does not fit this document.");
  }
  const replaced: TiptapJSON[] = [];
  let start = 0;
  for (let index = 0; index < from; index++) start += doc.child(index).nodeSize;
  let end = start;
  for (let index = from; index < from + removed; index++) {
    replaced.push(doc.child(index).toJSON() as TiptapJSON);
    end += doc.child(index).nodeSize;
  }
  const content = nodes.map(node => {
    const created = schema.nodeFromJSON(node);
    created.check();
    return created;
  });
  const tr = state.tr.replaceWith(start, end, content);
  for (const name of ATTRS) if (differs(doc.attrs[name], attrs[name])) tr.setDocAttribute(name, attrs[name] ?? null);
  if (tr.doc.childCount === 0) throw new Error("The change leaves no blocks.");
  tr.doc.check();
  tr.setMeta("addToHistory", false);
  changes.set(tr, {});
  return { tr, replaced, attrs: attrsOf(doc) };
}

/**
 * Make `projection` (a Core read model's editor projection) the opening snapshot. Blocks that
 * already show the same content only take its locators; the others are replaced by it. The
 * structure guard takes `projection` as its baseline (editor-schema.tsx).
 */
export function rebaseTopLevel(state: EditorState, projection: TiptapJSON) {
  const { doc, schema } = state;
  const fresh = (projection.content ?? []).map(node => schema.nodeFromJSON(node));
  const same = (current: ProseMirrorNode, next: ProseMirrorNode) => current.type === next.type &&
    current.type.create({ ...current.attrs, sourcePath: next.attrs.sourcePath }, current.content, current.marks).eq(next);
  let head = 0;
  while (head < doc.childCount && head < fresh.length && same(doc.child(head), fresh[head]!)) head++;
  let tail = 0;
  while (tail < doc.childCount - head && tail < fresh.length - head &&
    same(doc.child(doc.childCount - 1 - tail), fresh[fresh.length - 1 - tail]!)) tail++;
  const tr = state.tr;
  // Locators first, positions of the kept blocks do not move.
  let position = 0;
  for (let index = 0; index < doc.childCount; index++) {
    const node = doc.child(index);
    const next = index < head ? fresh[index] : index >= doc.childCount - tail ? fresh[fresh.length - (doc.childCount - index)] : undefined;
    if (next && node.attrs.sourcePath !== next.attrs.sourcePath) tr.setNodeAttribute(position, "sourcePath", next.attrs.sourcePath);
    position += node.nodeSize;
  }
  let start = 0;
  for (let index = 0; index < head; index++) start += doc.child(index).nodeSize;
  let end = start;
  for (let index = head; index < doc.childCount - tail; index++) end += doc.child(index).nodeSize;
  if (end > start || fresh.length - tail > head) tr.replaceWith(start, end, fresh.slice(head, fresh.length - tail));
  for (const name of ATTRS) {
    const value = projection.attrs?.[name] ?? null;
    if (differs(doc.attrs[name], value)) tr.setDocAttribute(name, value);
  }
  tr.setMeta("addToHistory", false);
  changes.set(tr, { baseline: projection });
  return { tr, replaced: doc.childCount - head - tail };
}
