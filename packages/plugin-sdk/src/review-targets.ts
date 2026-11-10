import { readCanonicalDocument, resolveDocumentTarget } from "@litzio/core";
import { generatedTargetSchema } from "./generated-document.ts";

/** Read the exact canonical snapshot; providers obtain cell paths only from this Core model. */
export const readReviewDocument = readCanonicalDocument;

/** Shared final-snapshot validation for mappings, materials and proposed targets. */
export function validateReviewTargets(snapshot: ReturnType<typeof readReviewDocument>, targets: unknown[]) {
  for (const raw of targets) {
    const target = generatedTargetSchema.parse(raw);
    if (target.documentRevision !== snapshot.documentRevision || target.documentHash !== snapshot.documentRevision || !resolveDocumentTarget(snapshot.document, target.path)) throw new Error("Invalid or stale review target");
  }
}
