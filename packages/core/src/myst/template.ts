import { isMap, isScalar, Scalar } from "yaml";
import { DocumentWriteError } from "../write-error.ts";
import { serializeFor } from "./serialize.ts";
import { metadata } from "./metadata.ts";
import { cloneDocument, type MystDocument } from "./tree.ts";
import { assertUnicode } from "./unicode.ts";

export type TemplateMetadata = { name: string; description: string };

function invalid(): never {
  throw new DocumentWriteError("Template metadata requires only name (non-empty) and description, both single-line strings", {
    code: "native-metadata", path: [0], action: "Use template: { name: ..., description: ... } with single-line strings.",
  });
}

function check(value: unknown): asserts value is TemplateMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== 2 || !("name" in value) || !("description" in value)) invalid();
  for (const field of [value.name, value.description]) {
    if (typeof field !== "string" || /[\r\n\v\f\u0085\u2028\u2029]/u.test(field)) invalid();
    assertUnicode(field, [0]);
  }
  if (!(value.name as string).trim()) invalid();
}

export function getTemplateMetadata(document: MystDocument): TemplateMetadata | undefined {
  const { yaml } = metadata(document);
  if (!yaml.has("template")) return undefined;
  const field = yaml.get("template", true);
  if (!isMap(field) || field.items.length !== 2 || field.items.some(pair =>
    !isScalar(pair.key) || !["name", "description"].includes(String(pair.key.value)) ||
    !isScalar(pair.value) || pair.value.type === Scalar.BLOCK_LITERAL || pair.value.type === Scalar.BLOCK_FOLDED)) invalid();
  const value: unknown = { name: field.get("name"), description: field.get("description") };
  check(value);
  return value;
}

/** null removes only template metadata; title, numbering, bibliography and body are retained. */
export function updateTemplateMetadata(document: MystDocument, value: TemplateMetadata | null): MystDocument {
  if (value !== null) check(value);
  const next = cloneDocument(document);
  const { node, yaml } = metadata(next);
  if (value === null) yaml.delete("template");
  else yaml.set("template", value);
  node.value = String(yaml);
  serializeFor(next, "template metadata cannot be preserved through canonical round-trip");
  return next;
}

export function createDocumentFromTemplate(document: MystDocument): MystDocument {
  if (!getTemplateMetadata(document)) invalid();
  return updateTemplateMetadata(document, null);
}
