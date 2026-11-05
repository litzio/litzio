import { diffArrays } from "diff";
import type { NodePath } from "./document.ts";
import { getEditableDocument } from "./editable.ts";
import type { MystDocument } from "./myst/tree.ts";
import { semanticFingerprint } from "./myst/fingerprint.ts";
import { metadata } from "./myst/metadata.ts";
import type { EditableBlock } from "./editable.ts";

export type BlockChange = { kind: "added" | "removed" | "changed"; before?: NodePath; after?: NodePath; details: string[] };
export type DocumentComparison = { changes: BlockChange[]; documentChanged: boolean };

// Explanations use the neutral projection without locators or derived display text.
// Equality below uses the existing full canonical semantic fingerprint, never hashes.
function semantic(value: unknown, projection = true): unknown {
  if (Array.isArray(value)) return value.map(child => semantic(child, projection));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !projection || !["path", "editable", "text"].includes(key) || key === "text" && !("content" in value))
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, semantic(child, projection)]));
  return value;
}
const key = (value: unknown) => JSON.stringify(semantic(value));
function details(before: EditableBlock, after: EditableBlock): string[] {
  const a = semantic(before) as Record<string, unknown>, b = semantic(after) as Record<string, unknown>;
  const changes = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(field => key(a[field]) !== key(b[field]))
    .map(field => `${field}: ${JSON.stringify(a[field]) ?? "(none)"} → ${JSON.stringify(b[field]) ?? "(none)"}`);
  return changes.length ? changes : ["Block attributes changed"];
}

/** Snapshot-relative paths; moves remain removal + addition. No source formatting diff. */
export function compareDocuments(before: MystDocument, after: MystDocument): DocumentComparison {
  const a = getEditableDocument(before), b = getEditableDocument(after);
  if (a.blocks.length + b.blocks.length > 10000) throw new Error("Visual comparison exceeds 10000 blocks. Use source comparison.");
  const fingerprint = (document: MystDocument, block: EditableBlock) => JSON.stringify(semanticFingerprint({ type: "root", children: [document.children[block.path[0]]] }));
  const ak = a.blocks.map(block => fingerprint(before, block)), bk = b.blocks.map(block => fingerprint(after, block));
  if (ak.join("").length + bk.join("").length > 2000000) throw new Error("Visual comparison exceeds semantic size budget. Use source comparison.");
  const oldKeys = new Set(ak), nextKeys = new Set(bk);
  const sequence = diffArrays(ak, bk, { timeout: 500 });
  if (!sequence) throw new Error("Visual comparison timed out. Use source comparison.");
  const changes: BlockChange[] = [];
  let old = 0, next = 0;
  for (let i = 0; i < sequence.length; i++) {
    const group = sequence[i], count = group.value.length;
    const following = sequence[i + 1];
    if (group.removed && following?.added && count === following.value.length &&
      group.value.every((fingerprint, offset) => !nextKeys.has(fingerprint) && !oldKeys.has(following.value[offset]) && a.blocks[old + offset].block === b.blocks[next + offset].block)) {
      for (let offset = 0; offset < count; offset++) changes.push({ kind: "changed", before: a.blocks[old + offset].path,
        after: b.blocks[next + offset].path, details: details(a.blocks[old + offset], b.blocks[next + offset]) });
      old += count; next += count; i++; continue;
    }
    if (group.removed) for (let offset = 0; offset < count; offset++) changes.push({ kind: "removed", before: a.blocks[old + offset].path, details: [a.blocks[old + offset].block] });
    if (group.added) for (let offset = 0; offset < count; offset++) changes.push({ kind: "added", after: b.blocks[next + offset].path, details: [b.blocks[next + offset].block] });
    if (!group.added) old += count;
    if (!group.removed) next += count;
  }
  return { changes, documentChanged: JSON.stringify(semantic(metadata(before).yaml.toJSON(), false)) !== JSON.stringify(semantic(metadata(after).yaml.toJSON(), false)) };
}
