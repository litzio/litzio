import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { decodeUtf8, textRevision } from "@litzio/file-commit";
import { provenanceSchema, VIEW_LIMITS, type ViewProvenance } from "@litzio/core/views-v2";
import type { AssistantConversation, AssistantConversationInput, AssistantFileReference } from "../shared/assistant.ts";
import { VIEW_GENERATION_CONTEXT_BYTES } from "../shared/view-generation.ts";
import { accessPath, inside, RootAccess, type FileAccess } from "./file-access.ts";

export type ViewMaterial = { provenance: ViewProvenance; text: string };
/** Inputs have already passed checkedReferences. Recheck access immediately before reading. */
export function collectViewMaterials(input: AssistantConversationInput, references: AssistantFileReference[], folders: string[], access: FileAccess, conversation?: AssistantConversation): ViewMaterial[] {
  const materials: ViewMaterial[] = [];
  const context = input.viewContext;
  if (context && (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(context.owner) || !Array.isArray(context.roots) || context.roots.some(root => !folders.includes(root.path)))) throw new Error("Invalid view context roots or owner.");
  let bytes = 0;
  const add = (material: ViewMaterial) => {
    bytes += Buffer.byteLength(JSON.stringify(material), "utf8");
    if (bytes > VIEW_GENERATION_CONTEXT_BYTES || materials.length >= VIEW_LIMITS.provenance) throw new Error("View material exceeds context limit. Attach fewer references.");
    materials.push(material);
  };
  for (const reference of references) {
    const boundary = new RootAccess(folders);
    const file = accessPath(accessPath(reference.path, boundary), access);
    if (statSync(file).size > VIEW_GENERATION_CONTEXT_BYTES) throw new Error("View material exceeds context limit.");
    const source = readFileSync(file);
    if (source.length > VIEW_GENERATION_CONTEXT_BYTES) throw new Error("View material exceeds context limit.");
    const text = decodeUtf8(source);
    const root = context?.roots.find(root => inside(root.path, file));
    const provenance = provenanceSchema.parse(root ? { kind: "document", label: reference.name, hostId: context!.hostId, rootId: root.id, path: path.relative(root.path, file).split(path.sep).join("/"), revision: textRevision(text) }
      : { kind: "reference", label: reference.name, refId: randomUUID() });
    add({ provenance, text });
  }
  // Only completed public dynamic tool results, never commands, reasoning or provider internals.
  for (const turn of conversation?.turns ?? []) for (const item of turn.items) {
    if (turn.status !== "completed" || item.kind !== "tool" || item.toolResult?.success !== true) continue;
    for (const part of item.toolResult.contentItems) {
      if (part.type !== "inputText" || !part.text) continue;
      let result: any; try { result = JSON.parse(part.text); } catch { continue; }
      const receipt = result?.receipt;
      if (receipt?.outcome !== "success" || typeof receipt.operation !== "string" || !context || receipt.operation.startsWith("view.")) continue;
      const provenance = provenanceSchema.safeParse({ kind: "tool", label: receipt.operation, refId: item.id, hostId: context.hostId, operation: receipt.operation, requestId: receipt.requestId });
      if (provenance.success) add({ provenance: provenance.data, text: part.text });
    }
  }
  if (input.viewDefinition !== undefined) {
    const size = Buffer.byteLength(JSON.stringify(input.viewDefinition), "utf8");
    if (bytes + size > VIEW_GENERATION_CONTEXT_BYTES) throw new Error("View material exceeds context limit.");
  }
  return materials;
}
