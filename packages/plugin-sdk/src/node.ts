/** Saved files on this PC only; no Host connection or unsaved Editor state. */
import { readFileSync } from "node:fs";
import { parse, serializeChange, type Document } from "@litzio/core";
import { assertUnicode, decodeUtf8, textRevision, commitFile, FileChangedError } from "@litzio/file-commit";
export { FileChangedError } from "@litzio/file-commit";

function readSource(file: string): { revision: string; source: string } {
  assertUnicode(file);
  const source = decodeUtf8(readFileSync(file));
  return { revision: textRevision(source), source };
}

export function readDocument(file: string): { revision: string; document: Document } {
  const { source, revision } = readSource(file);
  return { revision, document: parse(source) };
}

/** Reconcile and validate through Core, then replace through revision-checked file-commit. */
export function writeDocument(file: string, document: Document, expectedRevision: string): { revision: string } {
  const original = readSource(file);
  if (original.revision !== expectedRevision) throw new FileChangedError(file);
  const markdown = serializeChange(parse(original.source), () => document);
  commitFile(file, markdown, expectedRevision);
  return { revision: textRevision(markdown) };
}
