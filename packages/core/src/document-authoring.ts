import { z } from "zod";
import { createDocument, parseNativeDocument, serializeNativeDocument } from "./myst/native.ts";
import { updateDocumentTitle } from "./myst/title.ts";
import * as operations from "./operations.ts";
import { getEditableDocument } from "./editable.ts";
import type { DocumentTargetRef } from "./views-v2.ts";

export const DOCUMENT_AUTHORING_LIMITS = { bytes: 262144, inputs: 200, blocks: 500, string: 16384, tableRows: 100, tableColumns: 32 } as const;
const text = z.string().max(DOCUMENT_AUTHORING_LIMITS.string).refine(value => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value));
const block = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("paragraph"), text }),
  z.strictObject({ kind: z.literal("heading"), level: z.number().int().min(1).max(6), text }),
  z.strictObject({ kind: z.literal("list"), ordered: z.boolean(), start: z.number().int().positive().optional(), items: z.array(text).min(1).max(100) }),
  z.strictObject({ kind: z.literal("table"), rows: z.array(z.array(text).min(1).max(DOCUMENT_AUTHORING_LIMITS.tableColumns)).min(1).max(DOCUMENT_AUTHORING_LIMITS.tableRows) }),
  z.strictObject({ kind: z.literal("figure"), imageUrl: text, imageAlt: text, caption: text }),
  z.strictObject({ kind: z.literal("code"), language: text, code: text }),
  z.strictObject({ kind: z.literal("equation"), latex: text }),
  z.strictObject({ kind: z.literal("divider") }),
]);
export const documentAuthoringSchema = z.strictObject({ title: text.optional(), inputs: z.array(z.strictObject({
  key: text.min(1).max(512), blocks: z.array(block).max(DOCUMENT_AUTHORING_LIMITS.blocks),
})).max(DOCUMENT_AUTHORING_LIMITS.inputs) }).superRefine((value, ctx) => {
  if (new Set(value.inputs.map(input => input.key)).size !== value.inputs.length) ctx.addIssue({ code: "custom", message: "Duplicate input key" });
  if (value.inputs.reduce((sum, input) => sum + input.blocks.length, 0) > DOCUMENT_AUTHORING_LIMITS.blocks) ctx.addIssue({ code: "custom", message: "Too many blocks" });
});
export type DocumentAuthoringInput = z.infer<typeof documentAuthoringSchema>;
export type AuthoredDocument = { source: string; documentRevision: string; documentHash: string; inputs: { key: string; targets: DocumentTargetRef[] }[] };
export class DocumentAuthoringError extends Error {
  constructor(readonly code: "invalid-input" | "limit" | "unsupported-content") { super(`Document authoring failed: ${code}`); }
}

/** Pure document construction, never file IO. Targets address only the returned canonical snapshot. */
export async function authorDocument(raw: unknown): Promise<AuthoredDocument> {
  let json: string | undefined;
  try { json = JSON.stringify(raw); } catch { throw new DocumentAuthoringError("invalid-input"); }
  if (json === undefined) throw new DocumentAuthoringError("invalid-input");
  const bytes = (value: string) => new TextEncoder().encode(value);
  if (bytes(json).length > DOCUMENT_AUTHORING_LIMITS.bytes) throw new DocumentAuthoringError("limit");
  // Parse the JSON value, so inherited properties and non-JSON values cannot become authored fields.
  const parsed = documentAuthoringSchema.safeParse(JSON.parse(json));
  if (!parsed.success) throw new DocumentAuthoringError("invalid-input");
  const input = parsed.data;
  let source: string;
  let paths: (readonly number[])[];
  try {
    let document = createDocument();
    if (input.title !== undefined) document = updateDocumentTitle(document, input.title);
    for (const item of input.inputs) for (const block of item.blocks) {
      const index = document.children.length;
      switch (block.kind) {
        case "paragraph": document = operations.insertParagraph(document, index, block.text); break;
        case "heading": document = operations.insertHeading(document, index, block.level, block.text); break;
        case "list": document = operations.insertList(document, index, { ordered: block.ordered, start: block.start, items: block.items.map(text => ({ content: [{ kind: "text", text }] })) }); break;
        case "table": document = operations.insertTable(document, index, block.rows); break;
        case "figure": document = operations.insertFigure(document, index, block); break;
        case "code": document = operations.insertCodeBlock(document, index, block); break;
        case "equation": document = operations.insertEquation(document, index, block.latex); break;
        case "divider": document = operations.insertDivider(document, index); break;
      }
    }
    source = serializeNativeDocument(document);
    const snapshot = parseNativeDocument(source);
    if (serializeNativeDocument(snapshot) !== source) throw new Error();
    paths = getEditableDocument(snapshot).blocks.map(block => block.path);
    if (paths.length !== input.inputs.reduce((sum, item) => sum + item.blocks.length, 0)) throw new Error();
  } catch { throw new DocumentAuthoringError("unsupported-content"); }
  if (bytes(source).length > DOCUMENT_AUTHORING_LIMITS.bytes) throw new DocumentAuthoringError("limit");
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes(source));
  const revision = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
  let offset = 0;
  return { source, documentRevision: revision, documentHash: revision, inputs: input.inputs.map(item => ({ key: item.key,
    targets: item.blocks.map(() => ({ path: [...paths[offset++]!], documentRevision: revision, documentHash: revision })),
  })) };
}
