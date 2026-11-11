import type { NodePath } from "./document.ts";
import { insertBlock } from "./operations.ts";
import { createRequirementNode, isRequirementNode, readRequirement, requirementContentError, type RequirementContent } from "./myst/requirement.ts";
import { parse } from "./myst/parse.ts";
import { serialize, serializeFor } from "./myst/serialize.ts";
import { cloneDocument, getNode, type MystDocument } from "./myst/tree.ts";
import { DocumentDiagnosticError } from "./write-error.ts";
import { getEditableDocument } from "./editable.ts";
import { normativeStrength, splitSentences } from "./requirements.ts";
import { labelIdentifier, targetIdentifiers } from "./myst/label.ts";

const FAILURE = "requirement cannot round-trip losslessly through canonical Markdown";

function requirementIds(document: MystDocument, except?: number): Map<string, number> {
  const ids = new Map<string, number>();
  document.children.forEach((node, index) => {
    if (index === except || !isRequirementNode(node)) return;
    const read = readRequirement(node);
    if ("content" in read) ids.set(read.content.id, index);
  });
  return ids;
}

function assertRoundTrip(document: MystDocument, index: number, content: RequirementContent): void {
  const markdown = serializeFor(document, FAILURE);
  const reparsed = parse(markdown);
  const read = reparsed.children[index] ? readRequirement(reparsed.children[index]) : { error: "missing" };
  if (!("content" in read) || JSON.stringify(read.content) !== JSON.stringify(content) || serialize(reparsed) !== markdown) {
    throw new DocumentDiagnosticError("round-trip-mismatch", FAILURE);
  }
}

/** Insert a top-level requirement block. Requirement IDs are unique within a document. */
export function insertRequirement(document: MystDocument, index: number, content: RequirementContent): MystDocument {
  const error = requirementContentError(content);
  if (error) throw new DocumentDiagnosticError("invalid-operation", error);
  if (requirementIds(document).has(content.id)) throw new DocumentDiagnosticError("invalid-operation", `requirement ID ${content.id} already exists in this document`);
  const next = insertBlock(document, index, createRequirementNode(content));
  assertRoundTrip(next, index, content);
  return next;
}

/** Change attributes, title, body or links of one requirement. Its persistent ID never changes. */
export function updateRequirement(document: MystDocument, path: NodePath, changes: Partial<RequirementContent>): MystDocument {
  const node = getNode(document, path);
  const read = isRequirementNode(node) ? readRequirement(node) : { error: "not a requirement block" };
  if (path.length !== 1 || !("content" in read)) throw new DocumentDiagnosticError("invalid-operation", `updateRequirement requires a requirement at [${path.join(",")}]`);
  if (changes.id !== undefined && changes.id !== read.content.id) {
    throw new DocumentDiagnosticError("invalid-operation", `requirement ID is persistent and cannot change (${read.content.id})`);
  }
  const content: RequirementContent = { ...read.content, ...changes, id: read.content.id };
  const error = requirementContentError(content);
  if (error) throw new DocumentDiagnosticError("invalid-operation", error);
  const next = cloneDocument(document);
  next.children[path[0]] = createRequirementNode(content);
  assertRoundTrip(next, path[0], content);
  return next;
}

const CLAUSE = /^(\d+(?:\.\d+)*)\.?\s/;

/**
 * Give every normative standard paragraph (one with shall/should/may) that has no `(label)=` target
 * a persistent anchor `std-<clause>-p<n>` (n = paragraph ordinal inside the clause). Existing
 * anchors are never changed. 
 */
export function assignAnchors(document: MystDocument): MystDocument {
  const editable = getEditableDocument(document);
  const used = targetIdentifiers(document);
  const inserts: { index: number; label: string }[] = [];
  let clause = "0", ordinal = 0, labelled = false;
  for (const block of editable.blocks) {
    if (block.block === "target") { labelled = true; continue; }
    if (block.block === "heading") {
      clause = CLAUSE.exec(block.text)?.[1] ?? clause; ordinal = 0;
    } else if (block.block === "paragraph") {
      ordinal++;
      if (!labelled && splitSentences(block.text).some(sentence => normativeStrength(sentence))) {
        let label = `std-${clause.replace(/\./g, "-")}-p${ordinal}`;
        for (let suffix = 2; used.has(labelIdentifier(label) ?? label); suffix++) label = `std-${clause.replace(/\./g, "-")}-p${ordinal}-${suffix}`;
        used.add(labelIdentifier(label) ?? label);
        inserts.push({ index: block.path[0], label });
      }
    }
    labelled = false;
  }
  if (!inserts.length) return document;
  const next = cloneDocument(document);
  for (const { index, label } of [...inserts].reverse()) next.children.splice(index, 0, { type: "mystTarget", label });
  serializeFor(next, "anchors cannot round-trip losslessly through canonical Markdown");
  return next;
}
