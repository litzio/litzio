import { isScalar } from "yaml";
import { DOCUMENT_STATUSES, type DocumentStatus } from "../status.ts";
import { DocumentWriteError } from "../write-error.ts";
import { FRONT_MATTER_FIELD } from "./constants.ts";
import { metadata } from "./metadata.ts";
import { serializeFor } from "./serialize.ts";
import { cloneDocument, type MystDocument } from "./tree.ts";

function check(value: unknown): asserts value is DocumentStatus {
  if (!DOCUMENT_STATUSES.includes(value as DocumentStatus)) throw new DocumentWriteError("Document status must be draft, review or approved", {
    code: "native-metadata", path: [0], action: "Use draft, review or approved; remove status for an ordinary document.",
  });
}
export function getDocumentStatus(document: MystDocument): DocumentStatus | undefined {
  if (document.children[0]?.[FRONT_MATTER_FIELD] !== true) return undefined;
  const { yaml } = metadata(document);
  if (!yaml.has("status")) return undefined;
  const field = yaml.get("status", true);
  const value: unknown = isScalar(field) ? field.value : undefined;
  check(value);
  return value;
}
/** null removes only status; it never restricts document editing. */
export function updateDocumentStatus(document: MystDocument, status: DocumentStatus | null): MystDocument {
  if (status !== null) check(status);
  const next = cloneDocument(document);
  const { node, yaml } = metadata(next);
  if (status === null) yaml.delete("status");
  else yaml.set("status", status);
  node.value = String(yaml);
  serializeFor(next, "document status cannot be preserved through canonical round-trip");
  return next;
}
