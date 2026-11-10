import path from "node:path";
import { authorDocument, parse, serialize, updateMediaReferences } from "@litzio/core";
import { createHash } from "node:crypto";
import { authoredDocumentRequestSchema } from "@litzio/plugin-sdk";
import { commitFile } from "@litzio/file-commit";
import { createDocumentSourceFile } from "./document-create.ts";
import { createDocumentImageAsset } from "./asset-api.ts";
import { validateImage } from "./image-validation.ts";
import { accessPath, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";

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

/** Shared K1/CLI document construction and exclusive publication, never plugin file IO. */
export async function createAuthoredDocumentFile(file: string, raw: unknown, access: FileAccess = LOCAL_FILE_ACCESS, beforePublish: () => void = () => {}) {
  return publishAuthoredDocumentFile(file, raw, access, beforePublish);
}

/** Regeneration uses identical authoring/image semantics with revision-checked replacement. */
export async function regenerateAuthoredDocumentFile(file: string, raw: unknown, revision: string, access: FileAccess = LOCAL_FILE_ACCESS, beforePublish: () => void = () => {}) {
  return publishAuthoredDocumentFile(file, raw, access, beforePublish, revision);
}

async function publishAuthoredDocumentFile(file: string, raw: unknown, access: FileAccess, beforePublish: () => void, revision?: string) {
  file = path.resolve(accessPath(file, access, true));
  if (path.extname(file).toLowerCase() !== ".md") throw new Error("document path must point to a .md file");
  accessPath(path.dirname(file), access);
  beforePublish();
  const { input, images } = validatedAuthoringRequest(raw);
  const bindings: Record<string, string> = Object.create(null);
  // Completed image files can be reused by another CLI/Host process immediately.
  // Retain them on failure; only unpublished temporary files are request-owned.
  for (const image of images) {
    bindings[image.key] = createDocumentImageAsset(file, image.mime, image.bytes, access).path;
  }
  const authored = await authorDocument(input.authoring, bindings);
  beforePublish();
  if (revision !== undefined) {
    commitFile(accessPath(file, access), authored.source, revision);
    return { path: file, revision: authored.documentRevision, inputs: authored.inputs };
  }
  return { ...createDocumentSourceFile(file, authored.source, access), inputs: authored.inputs };
}
