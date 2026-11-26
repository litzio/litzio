import path from "node:path";
import fs from "node:fs";
import { commitFile } from "@litzio/file-commit";
import { createDocumentFromAuthoring } from "./document-create.ts";
import { createDocumentImageAsset, documentImageMatches } from "./asset-api.ts";
import { authorDocumentInThread, validateAuthoringInThread } from "./authoring-thread.ts";
import { accessPath, canonicalFilePath, rootIdentity, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";

/** Shared Host/CLI document construction and exclusive publication, never plugin file IO. */
export async function createAuthoredDocumentFile(file: string, raw: unknown, access: FileAccess = LOCAL_FILE_ACCESS, beforePublish: () => void = () => {}) {
  return publishAuthoredDocumentFile(file, raw, access, beforePublish);
}

/** Regeneration uses identical authoring/image semantics with revision-checked replacement. */
export async function regenerateAuthoredDocumentFile(file: string, raw: unknown, revision: string, access: FileAccess = LOCAL_FILE_ACCESS, beforePublish: () => void = () => {}) {
  return publishAuthoredDocumentFile(file, raw, access, beforePublish, revision);
}

// Authoring computes off the main thread, so writes to one target path are taken
// in arrival order: a later request cannot publish before an earlier one settles.
// Other processes are still checked at publication (exclusive create, revision).
const targetWrites = new Map<string, Promise<unknown>>();
function inArrivalOrder<T>(file: string, task: () => Promise<T>): Promise<T> {
  // The real target: junctions and other aliases of one file share a key. Missing
  // folders (created by this request) join the real path of the nearest existing one.
  let real: string | undefined, rest: string[] = [];
  for (let at = file; real === undefined;) {
    try { real = path.join(canonicalFilePath(at), ...rest); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || path.dirname(at) === at) throw error;
      rest = [path.basename(at), ...rest]; at = path.dirname(at);
    }
  }
  const key = process.platform === "win32" ? real.toLowerCase() : real;
  const result = (targetWrites.get(key) ?? Promise.resolve()).then(task);
  const settled = result.then(() => {}, () => {});
  targetWrites.set(key, settled);
  void settled.then(() => { if (targetWrites.get(key) === settled) targetWrites.delete(key); });
  return result;
}

async function publishAuthoredDocumentFile(file: string, raw: unknown, access: FileAccess, beforePublish: () => void, revision?: string) {
  file = path.resolve(access ? access.resolve(file, true, revision === undefined) : accessPath(file, access, true));
  if (path.extname(file).toLowerCase() !== ".md") throw new Error("document path must point to a .md file");
  beforePublish();
  // Missing descendants may be created, but their existing ancestor must survive validation.
  let parent = path.dirname(file);
  while (!fs.lstatSync(parent, { throwIfNoEntry: false }) && path.dirname(parent) !== parent) parent = path.dirname(parent);
  const real = canonicalFilePath(parent), identity = rootIdentity(parent, access);
  const checkParent = () => {
    beforePublish();
    try {
      if (canonicalFilePath(parent) === real && rootIdentity(parent, access) === identity) return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" && (error as NodeJS.ErrnoException).code !== "ENOTDIR") throw error;
    }
    throw Object.assign(new Error("The target folder changed while the document was being built; the document was not saved."), { errorKind: "conflict" });
  };
  return inArrivalOrder(file, () => publishInOrder(file, raw, access, checkParent, revision));
}

async function publishInOrder(file: string, raw: unknown, access: FileAccess, beforePublish: () => void, revision?: string) {
  const validated = await validateAuthoringInThread(raw);
  const images = validated.images.map(({ key, mime, bytes }) => ({ key, mime, bytes: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) }));
  beforePublish();
  const created: { directory: string; owner: fs.BigIntStats }[] = [];
  try {
    const missing: string[] = [];
    for (let directory = path.dirname(file); !fs.existsSync(directory); directory = path.dirname(directory)) {
      if (path.dirname(directory) === directory) fs.statSync(directory); // An unavailable drive/root cannot be created.
      missing.unshift(directory);
    }
    if (revision !== undefined && missing.length) throw new Error("Parent must be an existing directory.");
    for (const directory of missing) {
      try {
        fs.mkdirSync(accessPath(directory, access, true));
        created.push({ directory, owner: fs.lstatSync(directory, { bigint: true }) });
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      accessPath(directory, access);
    }
    accessPath(path.dirname(file), access);
    if (images.length) {
      const directory = path.join(path.dirname(file), "assets");
      try {
        fs.mkdirSync(accessPath(directory, access, true));
        created.push({ directory, owner: fs.lstatSync(directory, { bigint: true }) });
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    const bindings: Record<string, string> = Object.create(null);
    // Completed image files can be reused by another CLI/Host process immediately.
    // Retain them on failure; only unpublished temporary files are request-owned.
    for (const image of images) {
      bindings[image.key] = (await createDocumentImageAsset(file, image.mime, image.bytes, access, revision === undefined ? image.key : undefined)).path;
    }
    // Other requests run while the thread computes: right before the document is
    // published, every figure it references must still be the bytes placed for it.
    const checked = () => {
      beforePublish();
      for (const image of images) if (!documentImageMatches(file, bindings[image.key]!, image.bytes, access))
        throw Object.assign(new Error("A figure image changed while the document was being built; the document was not saved."), { errorKind: "conflict" });
    };
    if (revision === undefined) return await createDocumentFromAuthoring(file, validated.authoring, bindings, access, checked);
    const authored = await authorDocumentInThread(validated.authoring, bindings);
    checked();
    commitFile(accessPath(file, access), authored.source, revision);
    return { path: file, revision: authored.documentRevision, inputs: authored.inputs };
  } catch (error) {
    // Only remove this request's unchanged, empty directories. Completed shared
    // assets (and anything another writer placed here) deliberately keep them alive.
    for (const { directory, owner } of created.reverse()) {
      try {
        const current = fs.lstatSync(accessPath(directory, access), { bigint: true });
        if (!current.isSymbolicLink() && current.dev === owner.dev && current.ino === owner.ino && current.birthtimeMs === owner.birthtimeMs) fs.rmdirSync(directory);
      } catch (cleanup) {
        if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes((cleanup as NodeJS.ErrnoException).code ?? "")) throw new Error("Document creation failed; folder cleanup failed.", { cause: error });
      }
    }
    throw error;
  }
}
