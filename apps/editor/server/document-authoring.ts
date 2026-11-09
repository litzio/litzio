import path from "node:path";
import { authorDocument } from "@litzio/core";
import { authoredDocumentRequestSchema } from "@litzio/plugin-sdk";
import { createDocumentSourceFile } from "./document-create.ts";
import { createDocumentImageAsset } from "./asset-api.ts";
import { validateImage } from "./image-validation.ts";
import { accessPath, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";

/** Shared K1/CLI document construction and exclusive publication, never plugin file IO. */
export async function createAuthoredDocumentFile(file: string, raw: unknown, access: FileAccess = LOCAL_FILE_ACCESS, beforePublish: () => void = () => {}) {
  file = path.resolve(accessPath(file, access, true));
  if (path.extname(file).toLowerCase() !== ".md") throw new Error("document path must point to a .md file");
  accessPath(path.dirname(file), access);
  beforePublish();
  const input = authoredDocumentRequestSchema.parse(raw);
  const referenced = new Set(input.authoring.inputs.flatMap(input => input.blocks.flatMap(block => block.kind === "figure" && block.imageAsset !== undefined ? [block.imageAsset] : [])));
  if (referenced.size !== input.images.length || input.images.some(image => !referenced.has(image.key))) throw new Error("Image keys must match Figure asset references");
  const images = input.images.map(image => {
    const bytes = Buffer.from(image.base64, "base64");
    if (bytes.toString("base64") !== image.base64) throw new Error("Invalid image base64");
    validateImage(image.mime, bytes);
    return { ...image, bytes };
  });
  const bindings: Record<string, string> = Object.create(null);
  // Completed image files can be reused by another CLI/Host process immediately.
  // Retain them on failure; only unpublished temporary files are request-owned.
  for (const image of images) {
    bindings[image.key] = createDocumentImageAsset(file, image.mime, image.bytes, access).path;
  }
  const authored = await authorDocument(input.authoring, bindings);
  beforePublish();
  return { ...createDocumentSourceFile(file, authored.source, access), inputs: authored.inputs };
}
