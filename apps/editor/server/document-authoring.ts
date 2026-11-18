import path from "node:path";
import fs from "node:fs";
import { parse, serialize, updateMediaReferences } from "@litzio/core";
import { createHash } from "node:crypto";
import { authoredDocumentRequestSchema } from "@litzio/plugin-sdk";
import { commitFile } from "@litzio/file-commit";
import { createDocumentFromAuthoring, createDocumentSourceFile } from "./document-create.ts";
import { createDocumentImageAsset, documentImageMatches } from "./asset-api.ts";
import { validateImage } from "./image-validation.ts";
import { authorDocumentInThread } from "./authoring-thread.ts";
import { accessPath, canonicalFilePath, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";

/** Validate the same SDK image/key contract for file publication and embedded review snapshots. */
export function validatedAuthoringRequest(raw: unknown) {
  const input = authoredDocumentRequestSchema.parse(raw);
  const referenced = new Set(input.authoring.inputs.flatMap(input => input.blocks.flatMap(block => block.kind === "figure" && block.imageAsset !== undefined ? [block.imageAsset] : [])));
  if (referenced.size !== input.images.length || input.images.some(image => !referenced.has(image.key))) throw new Error("Image keys must match Figure asset references");
  const images = input.images.map(image => {
    const bytes = Buffer.from(image.base64, "base64");
    if (bytes.toString("base64") !== image.base64) throw new Error("Invalid image base64");
    validateImage(image.mime, bytes);
    return { ...image, bytes };
  });
  return { input, images };
}

/** Publish a validated embedded canonical snapshot using the existing asset and Core write paths. */
export function exportReviewDocumentFile(file: string, source: string, images: { mime: string; bytes: Buffer; revision: string }[], access: FileAccess, check: () => void, revision: string | null) {
  file = accessPath(file, access, true);
  check();
  const replacements = new Map<string,string>();
  for (const image of images) {
    validateImage(image.mime,image.bytes);
    if (createHash("sha256").update(image.bytes).digest("hex") !== image.revision) throw new Error("Review image changed");
    replacements.set(`review-asset:${image.revision}`,createDocumentImageAsset(file,image.mime,image.bytes,access).path);
  }
  const exported = serialize(updateMediaReferences(parse(source),[...replacements].map(([from,to])=>({from,to}))));
  check();
  if (revision !== null) { commitFile(file,exported,revision); return {path:file,revision:createHash("sha256").update(exported).digest("hex")}; }
  return createDocumentSourceFile(file,exported,access);
}

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
  const { input, images } = validatedAuthoringRequest(raw);
  return inArrivalOrder(file, () => publishInOrder(file, input, images, access, beforePublish, revision));
}

async function publishInOrder(file: string, input: ReturnType<typeof validatedAuthoringRequest>["input"], images: ReturnType<typeof validatedAuthoringRequest>["images"],
  access: FileAccess, beforePublish: () => void, revision?: string) {
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
      bindings[image.key] = createDocumentImageAsset(file, image.mime, image.bytes, access, revision === undefined ? image.key : undefined).path;
    }
    // Other requests run while the thread computes: right before the document is
    // published, every figure it references must still be the bytes placed for it.
    const checked = () => {
      beforePublish();
      for (const image of images) if (!documentImageMatches(file, bindings[image.key]!, image.bytes, access))
        throw Object.assign(new Error("A figure image changed while the document was being built; the document was not saved."), { errorKind: "conflict" });
    };
    if (revision === undefined) return await createDocumentFromAuthoring(file, input.authoring, bindings, access, checked);
    const authored = await authorDocumentInThread(input.authoring, bindings);
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
