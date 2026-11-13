import { statSync, lstatSync } from "node:fs";
import path from "node:path";
import type { AssistantAttachments } from "./assistant-attachments.ts";
import { accessPath, RootAccess, type FileAccess } from "./file-access.ts";
import { listFolder, MEDIA_TYPES } from "./document-api.ts";

/** Restricted turns reuse Explorer visibility; full access still rejects links and respects Host Roots. */
export function checkedReferences(value: string[], folders: string[], access: FileAccess, permissionMode: string | undefined, attachments?: AssistantAttachments, owner?: string) {
  if (!Array.isArray(value)) throw new Error("Invalid file references.");
  const scope = folders.length ? new RootAccess(folders) : null;
  const references: import("../shared/assistant.ts").AssistantFileReference[] = [];
  for (const requested of value) {
    const attachment = attachments?.reference(requested, owner);
    if (attachment) { if (!references.some(file => file.path === attachment.path)) references.push(attachment); continue; }
    if (permissionMode === "full-access") {
      if (typeof requested !== "string" || !path.isAbsolute(requested)) throw new Error("Invalid file reference path.");
      const resolved = accessPath(requested, access);
      for (let current = resolved; ; current = path.dirname(current)) {
        if (lstatSync(current).isSymbolicLink()) throw new Error("File reference is unavailable.");
        if (path.dirname(current) === current) break;
      }
      if (!statSync(resolved).isFile()) throw new Error("File reference is unavailable.");
      const extension = path.extname(resolved).toLowerCase();
      const kind = extension === ".md" || extension === ".txt" ? "document" : Object.hasOwn(MEDIA_TYPES, extension) ? "image" : "file";
      if (!references.some(file => path.relative(file.path, resolved) === "")) references.push({ path: resolved, name: path.basename(resolved), kind });
      continue;
    }
    if (typeof requested !== "string" || !path.isAbsolute(requested) || !scope) throw new Error("File reference is outside opened folders.");
    const resolved = accessPath(accessPath(requested, scope), access);
    const root = folders.find(folder => { const relative = path.relative(folder, resolved); return relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); });
    if (!root) throw new Error("File reference is outside opened folders.");
    let folder = root;
    const segments = path.relative(root, resolved).split(path.sep);
    let entry;
    for (const [index, name] of segments.entries()) {
      entry = listFolder(root, folder, access).entries.find(file => path.relative(file.path, path.join(folder, name)) === "");
      if (!entry || (index < segments.length - 1 ? entry.kind !== "folder" : entry.kind === "folder")) throw new Error("File reference is unavailable.");
      folder = entry.path;
    }
    if (!references.some(file => path.relative(file.path, resolved) === "")) references.push({ path: resolved, name: entry!.name, kind: entry!.kind });
  }
  return references;
}
