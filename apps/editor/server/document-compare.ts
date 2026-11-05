import { compareDocuments, getEditableDocument, parse, type DocumentComparison, type EditableDocument } from "@litzio/core";
import { textRevision } from "@litzio/file-commit";

export type CompareResult = DocumentComparison & { before: EditableDocument; after: EditableDocument; receipt: { beforeRevision: string; afterRevision: string } };
/** Read-only source snapshots, no file access, session, or persistent receipt. */
export const compareOperation = { name: "compare_documents", scope: "supplied source snapshots", writes: false } as const;
export function executeCompareOperation(input: unknown): CompareResult {
  if (!input || typeof input !== "object" || !("before" in input) || !("after" in input) || typeof input.before !== "string" || typeof input.after !== "string") throw new Error("before and after source strings are required");
  if (input.before.length + input.after.length > 1000000) throw new Error("Visual comparison exceeds 1000000 characters. Use source comparison.");
  const before = parse(input.before), after = parse(input.after);
  return { ...compareDocuments(before, after), before: getEditableDocument(before), after: getEditableDocument(after),
    receipt: { beforeRevision: textRevision(input.before), afterRevision: textRevision(input.after) } };
}
