import { ZodError } from "zod";
import { authoredDocumentRequestSchema } from "@litzio/plugin-sdk";
import { ImageValidationError, validateImage } from "./image-validation.ts";
import { isMarkedAsUntransferable, parentPort } from "node:worker_threads";
import { authorDocument, DocumentAuthoringError } from "@litzio/core";

/** Validate the same SDK image/key contract for document creation and regeneration. */
function validatedAuthoringRequest(raw: unknown) {
  const input = authoredDocumentRequestSchema.parse(raw);
  const referenced = new Set(input.authoring.inputs.flatMap(input => input.blocks.flatMap(block => block.kind === "figure" && block.imageAsset !== undefined ? [block.imageAsset] : [])));
  if (referenced.size !== input.images.length || input.images.some(image => !referenced.has(image.key))) throw new Error("Image keys must match Figure asset references");
  const images = input.images.map(image => {
    const bytes = Buffer.from(image.base64, "base64");
    if (bytes.toString("base64") !== image.base64) throw new Error("Invalid image base64");
    validateImage(image.mime, bytes);
    return { key: image.key, mime: image.mime, bytes };
  });
  return { authoring: input.authoring, images };
}

parentPort!.on("message", async ({ id, raw, imageAssets }: { id: number; raw: unknown; imageAssets?: Record<string, string> }) => {
  try {
    if (imageAssets === undefined) {
      const result = validatedAuthoringRequest(raw);
      parentPort!.postMessage({ id, result }, result.images.map(image => image.bytes.buffer as ArrayBuffer).filter(buffer => !isMarkedAsUntransferable(buffer)));
    } else parentPort!.postMessage({ id, result: await authorDocument(raw, imageAssets) });
  } catch (error) {
    parentPort!.postMessage({ id, error: error instanceof ZodError ? { issues: error.issues }
      : error instanceof ImageValidationError ? { status: error.status, message: error.message }
      : error instanceof DocumentAuthoringError ? { code: error.code, diagnostics: error.diagnostics }
      : { message: error instanceof Error ? error.message : String(error) } });
  }
});
