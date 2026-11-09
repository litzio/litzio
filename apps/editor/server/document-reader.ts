import { readFileSync } from "node:fs";
import { isManagedGeneratedDocument } from "./generated-document.ts";
import path from "node:path";
import { decodeUtf8, textRevision } from "@litzio/file-commit";
import { LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";
import { resolveDocumentPath, resolveEditorPath } from "./document-path.ts";
import { readModel } from "./document-replay.ts";
import type { DocumentFileResponse, EditorFileResponse } from "../shared/document-protocol.ts";

/** Media a document can show from beside it, by extension; also what choosing an image lists. */
export const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
};

export const documentRevision = textRevision;

export function loadDocumentFile(requestedPath?: string, access: FileAccess = LOCAL_FILE_ACCESS): DocumentFileResponse {
  const filePath = resolveDocumentPath(requestedPath, access);
  const source = decodeUtf8(readFileSync(filePath));
  return { kind: "native", path: filePath, source, ...readModel(source), revision: documentRevision(source), managedGenerated: isManagedGeneratedDocument(filePath, access) };
}

export function editorFile(filePath: string, source: string): EditorFileResponse {
  const file = { path: filePath, source, revision: documentRevision(source) };
  if (path.extname(filePath).toLowerCase() === ".md") {
    try { return { ...file, kind: "native", ...readModel(source) }; }
    catch { /* Core's existing admission is the only Markdown support decision. */ }
  }
  return { ...file, kind: "text" };
}

export function loadEditorFile(requestedPath?: string, access: FileAccess = LOCAL_FILE_ACCESS): EditorFileResponse {
  const filePath = resolveEditorPath(requestedPath, access);
  return { ...editorFile(filePath, decodeUtf8(readFileSync(filePath))), managedGenerated: isManagedGeneratedDocument(filePath, access) };
}
