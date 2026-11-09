import { randomBytes } from "node:crypto";
import path from "node:path";
import { realpathSync } from "node:fs";
import { authorDocument } from "@litzio/core";
import { authoredDocumentRequestSchema } from "@litzio/plugin-sdk";
import { createDocumentSourceFile } from "./document-create.ts";
import { createDocumentImageAsset, rollbackDocumentImageAsset } from "./asset-api.ts";
import { validateImage } from "./image-validation.ts";
import { accessPath, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";
import type { AssetRollbackRequest } from "../shared/asset-protocol.ts";

// Host-process, directory-scoped publication only. A failed creator must finish its
// rollback before another creator can reuse those images. No persistent job queue.
const publications = new Map<string, Promise<unknown>>();

/** Shared K1/CLI document construction and exclusive publication, never plugin file IO. */
export async function createAuthoredDocumentFile(file: string, raw: unknown, access: FileAccess = LOCAL_FILE_ACCESS, beforePublish: () => void = () => {}) {
  file = path.resolve(accessPath(file, access, true));
  if (path.extname(file).toLowerCase() !== ".md") throw new Error("document path must point to a .md file");
  const directory = realpathSync(accessPath(path.dirname(file), access));
  const previous = publications.get(directory) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
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
    const key = randomBytes(32), rollbacks: AssetRollbackRequest[] = [];
    const bindings: Record<string, string> = Object.create(null);
    try {
      for (const image of images) {
        const created = createDocumentImageAsset(file, image.mime, image.bytes, key, access);
        bindings[image.key] = created.path;
        if (created.rollbackToken) rollbacks.push({ documentPath: file, path: created.path, rollbackToken: created.rollbackToken });
      }
      const authored = await authorDocument(input.authoring, bindings);
      beforePublish();
      return { ...createDocumentSourceFile(file, authored.source, access), inputs: authored.inputs };
    } catch (error) {
      const failures: unknown[] = [];
      for (const receipt of rollbacks.reverse()) {
        try { rollbackDocumentImageAsset(receipt, key, access); } catch (failure) { failures.push(failure); }
      }
      if (failures.length) throw new AggregateError([error, ...failures], "Document creation failed; image rollback incomplete");
      throw error;
    }
  });
  publications.set(directory, pending);
  try { return await pending; }
  finally { if (publications.get(directory) === pending) publications.delete(directory); }
}
