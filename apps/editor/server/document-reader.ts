import fs, { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { decodeUtf8, textRevision } from "@litzio/file-commit";
import { accessPath, inside, LOCAL_FILE_ACCESS, rootIdentity, type FileAccess } from "./file-access.ts";
import { resolveDocumentPath, resolveEditorPath } from "./document-path.ts";
import { readModel } from "./document-replay.ts";
import type { DocumentSaveCache } from "./document-save-cache.ts";
import type { DocumentFileResponse, EditorFileResponse, FolderBrowseResponse, FolderCrumb, FolderEntry, FolderResponse } from "../shared/document-protocol.ts";

/** Media a document can show from beside it, by extension; also what choosing an image lists. */
export const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
};

export const documentRevision = textRevision;

export function loadDocumentFile(requestedPath?: string, access: FileAccess = LOCAL_FILE_ACCESS): DocumentFileResponse {
  const filePath = resolveDocumentPath(requestedPath, access);
  const source = decodeUtf8(readFileSync(filePath));
  return { kind: "native", path: filePath, source, ...readModel(source), revision: documentRevision(source) };
}

export function editorFile(filePath: string, source: string, cache?: DocumentSaveCache): EditorFileResponse {
  const file = { path: filePath, source, revision: documentRevision(source) };
  if (path.extname(filePath).toLowerCase() === ".md") {
    try { return { ...file, kind: "native", ...readModel(cache?.open(filePath, source) ?? source) }; }
    catch { /* Core's existing admission is the only Markdown support decision. */ }
  }
  return { ...file, kind: "text" };
}

export function loadEditorFile(requestedPath?: string, access: FileAccess = LOCAL_FILE_ACCESS, cache?: DocumentSaveCache): EditorFileResponse {
  const filePath = resolveEditorPath(requestedPath, access);
  return editorFile(filePath, decodeUtf8(readFileSync(filePath)), cache);
}

const entryOrder = new Intl.Collator(undefined, { numeric: true });

/**
 * One level of a folder the user chose. Regular folders and files of every extension are listed:
 * hidden entries and symlinks are left out, and a requested folder must stay inside the chosen
 * one, symlinks resolved. Markdown admission is decided on Open. Nothing is remembered between requests.
 */
export function listFolder(requestedRoot: string | undefined, requestedPath?: string, access: FileAccess = LOCAL_FILE_ACCESS): FolderResponse {
  if (!requestedRoot?.trim()) throw new Error("folder path is required");
  const root = path.resolve(accessPath(requestedRoot.trim(), access));
  const folder = path.resolve(accessPath(requestedPath?.trim() || root, access));
  if (!inside(root, folder)) throw new Error("folder is outside the chosen folder");
  return readFolder(folder, "all", () => {
    if (!inside(fs.realpathSync(root), fs.realpathSync(folder))) throw new Error("folder symlink escapes the chosen folder");
    return { rootId: rootIdentity(root, access), root, path: folder, ...(path.relative(root, folder) === "" ? {} : { parent: path.dirname(folder) }) };
  });
}

/**
 * One level of any folder, for choosing which folder to open: folders and Markdown names,
 * and the folders from the filesystem root down to it. Choosing an image lists images instead of
 * Markdown files. Only names are returned, never content.
 */
export function browseFolder(requestedPath: string | undefined, access: FileAccess = LOCAL_FILE_ACCESS, files: FileKind = "document"): FolderBrowseResponse {
  if (!requestedPath?.trim()) throw new Error("folder path is required");
  const folder = path.resolve(accessPath(requestedPath.trim(), access));
  const boundary = access?.boundary(folder);
  return readFolder(folder, files, () => {
    const crumbs: FolderCrumb[] = [];
    for (let current = folder; ; current = path.dirname(current)) {
      const root = boundary ? path.relative(boundary, current) === "" : path.dirname(current) === current;
      crumbs.unshift({ name: root && !boundary ? current.replace(/[\\/]+$/, "") || current : path.basename(current) || current, path: current });
      if (root) break;
    }
    return { path: folder, crumbs };
  });
}

type FileKind = "document" | "image" | "pdf";
const fileKinds: Record<FileKind, (extension: string) => boolean> = {
  document: extension => extension === ".md" || extension === ".txt",
  image: extension => Object.hasOwn(MEDIA_TYPES, extension),
  pdf: extension => extension === ".pdf",
};

/** Reads one level after `check` accepts the folder; filesystem failures become plain messages. */
function readFolder<T>(folder: string, files: FileKind | "all", check: () => T): T & { entries: FolderEntry[] } {
  try {
    if (!statSync(folder).isDirectory()) throw new Error("folder path must point to a directory");
    const result = check();
    const entries = fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry): FolderEntry[] => {
      if (entry.name.startsWith(".")) return [];
      const extension = path.extname(entry.name).toLowerCase();
      const kind = entry.isDirectory() ? "folder" : !entry.isFile() ? undefined : files === "all"
        ? extension === ".md" || extension === ".txt" ? "document" : Object.hasOwn(MEDIA_TYPES, extension) ? "image" : "file"
        : fileKinds[files](extension) ? files === "pdf" ? "file" : files : undefined;
      if (!kind) return [];
      const item: FolderEntry = { name: entry.name, kind, path: path.join(folder, entry.name) };
      try {
        const metadata = statSync(item.path);
        item.modifiedAt = metadata.mtime.toISOString();
        if (kind !== "folder") item.size = metadata.size;
      } catch { /* Optional metadata must not fail the listing. */ }
      return [item];
    });
    entries.sort((a, b) => (a.kind === "folder" && b.kind !== "folder" ? -1 : b.kind === "folder" && a.kind !== "folder" ? 1 : entryOrder.compare(a.name, b.name)));
    return { ...result, entries };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new Error("folder does not exist");
    if (code === "ENOTDIR") throw new Error("folder path must point to a directory");
    if (code === "EACCES" || code === "EPERM") throw new Error("folder cannot be read: permission denied");
    throw error;
  }
}
