import { statSync } from "node:fs";
import path from "node:path";
import { authorDocument, parse, serialize } from "@litzio/core";
import { createFile, textRevision } from "@litzio/file-commit";
import { fileIdentity } from "../shared/file-operations.ts";
import { accessPath, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";
import { resolveDocumentPath } from "./document-path.ts";

/** Canonical admission before exclusive creation; receipt identifies the file actually written. */
export function createDocumentSourceFile(requestedPath: string, source: string, access: FileAccess = LOCAL_FILE_ACCESS) {
  return publishDocumentSourceFile(requestedPath, serialize(parse(source)), access);
}

/** Core authoring has already admitted and verified the canonical source. */
export async function createDocumentFromAuthoring(
  requestedPath: string, raw: unknown, imageAssets: Readonly<Record<string, string>>, access: FileAccess, beforePublish: () => void,
) {
  const authored = await authorDocument(raw, imageAssets);
  beforePublish();
  return { ...publishDocumentSourceFile(requestedPath, authored.source, access), inputs: authored.inputs };
}

function publishDocumentSourceFile(requestedPath: string, source: string, access: FileAccess) {
  if (!requestedPath?.trim()) throw new Error("document path is required");
  const file = resolveDocumentPath(requestedPath, access, true);
  try { if (!statSync(path.dirname(file)).isDirectory()) throw new Error(); }
  catch { throw new Error("parent directory does not exist"); }
  try { createFile(accessPath(file, access, true), source); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw Object.assign(new Error("file already exists"),{errorKind:"conflict"});
    throw error;
  }
  return { path: file, source, revision: textRevision(source), identity: fileIdentity(statSync(accessPath(file, access), { bigint: true })) };
}

export type DocumentCreationReceipt = ReturnType<typeof createDocumentSourceFile>;
