import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { createDocument, parseNativeDocument, serializeNativeDocument } from "./myst/native.ts";
import { updateDocumentTitle } from "./myst/title.ts";
import * as operations from "./operations.ts";
import { getEditableDocument } from "./editable.ts";
import { assertLabelAvailable } from "./myst/label.ts";
import { endnotePlacement, footnoteWriteIssue } from "./myst/footnote.ts";
import { unresolvedReferences } from "./references.ts";
import { writeIssueOf } from "./write-error.ts";
import type { DocumentTargetRef } from "./document-target.ts";

import { documentAuthoringSchema, DOCUMENT_AUTHORING_LIMITS } from "./document-authoring-input.ts";
export { documentAuthoringSchema, DOCUMENT_AUTHORING_LIMITS, DOCUMENT_AUTHORING_CONTRACT } from "./document-authoring-input.ts";
export type { DocumentAuthoringInput } from "./document-authoring-input.ts";
export type AuthoredDocument = { source: string; documentRevision: string; documentHash: string; inputs: { key: string; targets: DocumentTargetRef[] }[] };
export class DocumentAuthoringError extends Error {
  constructor(readonly code: "invalid-input" | "limit" | "unsupported-content",
    readonly diagnostics: { path: (string | number)[]; reason: string }[] = []) {
    super(`Document authoring failed: ${code}${diagnostics.map(d => `; ${d.path.join(".")}: ${d.reason}`).join("")}`);
  }
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
  if (!parsed.success) throw new DocumentAuthoringError("invalid-input", parsed.error.issues.map(issue => ({ path: issue.path.map(key => typeof key === "symbol" ? String(key) : key), reason: issue.message })));
  const input = parsed.data;
  let source: string;
  let paths: (readonly number[])[];
  let location: (string | number)[] = [];
  const locations: (string | number)[][] = [];
  try {
    let document = createDocument();
    const empty = createDocument();
    if (input.title !== undefined) document = updateDocumentTitle(document, input.title);
    const authoredNodes: typeof document.children = [];
    for (const [inputIndex, item] of input.inputs.entries()) for (const [blockIndex, block] of item.blocks.entries()) {
      location = ["inputs", inputIndex, "blocks", blockIndex];
      // Reuse semantic operations without repeatedly cloning the growing import.
      let part = empty;
      const index = part.children.length;
      switch (block.kind) {
        case "paragraph": part = operations.insertParagraph(part, index, block.content ?? block.text!); break;
        case "heading": part = operations.insertHeading(part, index, block.level, block.content ?? block.text!); break;
        case "quote": part = operations.insertQuote(part, index, block.content ?? [{ kind: "text", text: block.text! }]); break;
        case "admonition": part = operations.insertAdmonition(part, index, block.variant, block.content ?? [{ kind: "text", text: block.text! }]); break;
        case "footnote": part = operations.insertFootnoteDefinition(part, index, block.label, block.content ?? [{ kind: "text", text: block.text! }]); break;
        case "target": part = operations.insertTarget(part, index, block.label); break;
        case "list": part = operations.insertList(part, index, { ordered: block.ordered, start: block.start, style: block.style, delimiter: block.delimiter,
          items: block.items.map(item => typeof item === "string" ? { content: [{ kind: "text", text: item }] } : item) }); break;
        case "table":
          part = operations.insertTable(part, index, block.rows, block.align);
          if (block.caption !== undefined) part = operations.updateTableCaption(part, [index], block.caption);
          break;
        case "figure": {
          const imageUrl = block.imageAsset === undefined ? block.imageUrl! : Object.hasOwn(imageAssets, block.imageAsset) ? imageAssets[block.imageAsset] : undefined;
          if (typeof imageUrl !== "string" || block.imageAsset !== undefined && !imageUrl) throw new Error("Unbound image asset");
          part = operations.insertFigure(part, index, { imageUrl, imageAlt: block.imageAlt, caption: block.caption }); break;
        }
        case "code": part = operations.insertCodeBlock(part, index, block); break;
        case "equation": part = operations.insertEquation(part, index, block.latex); break;
        case "divider": part = operations.insertDivider(part, index); break;
      }
      if ("label" in block && block.kind !== "footnote" && block.kind !== "target" && block.label !== undefined)
        part = operations.updateLabel(part, [index], block.label);
      if ("enumerated" in block && block.enumerated !== undefined) part = operations.updateEnumeration(part, [index], block.enumerated);
      if ("enumerator" in block && block.enumerator !== undefined) part = operations.updateEnumerator(part, [index], block.enumerator);
      const nodes = part.children.slice(index);
      authoredNodes.push(...nodes);
      locations.push([...location]);
      document.children.push(...nodes);
    }
    for (const [index, node] of document.children.entries()) {
      location = locations[index - 1] ?? [];
      if (typeof node.label === "string" && node.type !== "footnoteDefinition") assertLabelAvailable(document, node.label, [index]);
    }
    const noteIssue = footnoteWriteIssue(document);
    if (noteIssue) {
      location = locations[(noteIssue.path?.[0] ?? 1) - 1] ?? [];
      throw new Error(noteIssue.reason);
    }
    const missing = unresolvedReferences(document)[0];
    if (missing) {
      location = locations[missing.path[0] - 1] ?? [];
      throw new Error(`Unresolved reference: ${"label" in missing ? missing.label : "syntax"}`);
    }
    document.children = endnotePlacement(document);
    source = serializeNativeDocument(document);
    const snapshot = parseNativeDocument(source);
    if (serializeNativeDocument(snapshot) !== source) throw new Error();
    const snapshotPaths = getEditableDocument(snapshot).blocks.map(block => block.path);
    if (snapshotPaths.length !== authoredNodes.length) throw new Error("Authored block boundaries changed during serialization");
    paths = authoredNodes.map(node => snapshotPaths[document.children.indexOf(node) - 1]);
    if (paths.length !== input.inputs.reduce((sum, item) => sum + item.blocks.length, 0)) throw new Error();
  } catch (error) { throw new DocumentAuthoringError("unsupported-content", [{ path: location, reason: writeIssueOf(error).reason }]); }
  if (bytes(source).length > DOCUMENT_AUTHORING_LIMITS.bytes) throw new DocumentAuthoringError("limit");
  const revision = bytesToHex(sha256(bytes(source)));
  let offset = 0;
  return { source, documentRevision: revision, documentHash: revision, inputs: input.inputs.map(item => ({ key: item.key,
    targets: item.blocks.map(() => ({ path: [...paths[offset++]!], documentRevision: revision, documentHash: revision })),
  })) };
}
