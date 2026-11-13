import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { createDocument, parseNativeDocument, serializeNativeDocument } from "./myst/native.ts";
import { updateDocumentTitle } from "./myst/title.ts";
import * as operations from "./operations.ts";
import { getEditableDocument } from "./editable.ts";
import type { DocumentTargetRef } from "./document-target.ts";

import { documentAuthoringSchema, DOCUMENT_AUTHORING_LIMITS } from "./document-authoring-input.ts";
export { documentAuthoringSchema, DOCUMENT_AUTHORING_LIMITS, DOCUMENT_AUTHORING_CONTRACT } from "./document-authoring-input.ts";
export type { DocumentAuthoringInput } from "./document-authoring-input.ts";
export type AuthoredDocument = { source: string; documentRevision: string; documentHash: string; inputs: { key: string; targets: DocumentTargetRef[] }[] };
export class DocumentAuthoringError extends Error {
  constructor(readonly code: "invalid-input" | "limit" | "unsupported-content") { super(`Document authoring failed: ${code}`); }
}

/** Pure document construction, never file IO. Targets address only the returned canonical snapshot. */
export async function authorDocument(raw: unknown, imageAssets: Readonly<Record<string, string>> = {}): Promise<AuthoredDocument> {
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
    const empty = createDocument();
    if (input.title !== undefined) document = updateDocumentTitle(document, input.title);
    for (const item of input.inputs) for (const block of item.blocks) {
      // Reuse semantic operations without repeatedly cloning the growing import.
      let part = empty;
      const index = part.children.length;
      switch (block.kind) {
        case "paragraph": part = operations.insertParagraph(part, index, block.text); break;
        case "heading": part = operations.insertHeading(part, index, block.level, block.text); break;
        case "list": part = operations.insertList(part, index, { ordered: block.ordered, start: block.start, items: block.items.map(text => ({ content: [{ kind: "text", text }] })) }); break;
        case "table": part = operations.insertTable(part, index, block.rows); break;
        case "figure": {
          const imageUrl = block.imageAsset === undefined ? block.imageUrl! : Object.hasOwn(imageAssets, block.imageAsset) ? imageAssets[block.imageAsset] : undefined;
          if (typeof imageUrl !== "string" || block.imageAsset !== undefined && !imageUrl) throw new Error("Unbound image asset");
          part = operations.insertFigure(part, index, { imageUrl, imageAlt: block.imageAlt, caption: block.caption }); break;
        }
        case "code": part = operations.insertCodeBlock(part, index, block); break;
        case "equation": part = operations.insertEquation(part, index, block.latex); break;
        case "divider": part = operations.insertDivider(part, index); break;
      }
      if ("enumerated" in block && block.enumerated !== undefined) part = operations.updateEnumeration(part, [index], block.enumerated);
      if ("enumerator" in block && block.enumerator !== undefined) part = operations.updateEnumerator(part, [index], block.enumerator);
      document.children.push(...part.children.slice(index));
    }
    source = serializeNativeDocument(document);
    const snapshot = parseNativeDocument(source);
    if (serializeNativeDocument(snapshot) !== source) throw new Error();
    paths = getEditableDocument(snapshot).blocks.map(block => block.path);
    if (paths.length !== input.inputs.reduce((sum, item) => sum + item.blocks.length, 0)) throw new Error();
  } catch { throw new DocumentAuthoringError("unsupported-content"); }
  if (bytes(source).length > DOCUMENT_AUTHORING_LIMITS.bytes) throw new DocumentAuthoringError("limit");
  const revision = bytesToHex(sha256(bytes(source)));
  let offset = 0;
  return { source, documentRevision: revision, documentHash: revision, inputs: input.inputs.map(item => ({ key: item.key,
    targets: item.blocks.map(() => ({ path: [...paths[offset++]!], documentRevision: revision, documentHash: revision })),
  })) };
}
