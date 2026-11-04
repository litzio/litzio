import { openSync, writeFileSync, fstatSync, closeSync, statSync } from "node:fs";
import path from "node:path";
import { parse, serialize } from "@litzio/core";
import { textRevision } from "@litzio/file-commit";
import { fileIdentity } from "../shared/file-operations.ts";
import { accessPath, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";
import { resolveDocumentPath } from "./document-path.ts";

/** Canonical admission before exclusive creation; receipt identifies the file actually written. */
export function createDocumentSourceFile(requestedPath: string, source: string, access: FileAccess = LOCAL_FILE_ACCESS) {
  source = serialize(parse(source));
  if (!requestedPath?.trim()) throw new Error("document path is required");
  const file = resolveDocumentPath(requestedPath, access, true);
  try { if (!statSync(path.dirname(file)).isDirectory()) throw new Error(); }
  catch { throw new Error("parent directory does not exist"); }
  let fd: number;
  try { fd = openSync(accessPath(file, access, true), "wx"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("file already exists");
    throw error;
  }
  try {
    writeFileSync(fd, source, { encoding: "utf8" });
    return { path: file, source, revision: textRevision(source), identity: fileIdentity(fstatSync(fd, { bigint: true })) };
  } finally { closeSync(fd); }
}

export type DocumentCreationReceipt = ReturnType<typeof createDocumentSourceFile>;
