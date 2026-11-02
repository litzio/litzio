import { fileIdentity } from "../shared/file-operations.ts";
import { writeFileSync, openSync, fstatSync, closeSync } from "node:fs";
import path from "node:path";
import { createDocument, updateDocumentTitle, insertParagraph, insertHeading, bodyEndIndex, serialize, validateStructure, DocumentDiagnosticError } from "@litzio/core";
import { textRevision } from "@litzio/file-commit";
import { accessPath, RootAccess, type FileAccess } from "./file-access.ts";
import { loadEditorFile, listFolder } from "./document-api.ts";
import { resolveDocumentPath } from "./document-path.ts";

export type DocumentToolScope = { folders: RootAccess | null; writeAccess: string; access: FileAccess };
const string = { type: "string" };
export const documentTools = [
  { type: "function", name: "create_document", description: "Create a new Litzio .md document inside an opened folder. Never overwrites. Blocks are plain-text paragraphs or headings (level 1–6). Use this tool instead of shell commands.", inputSchema: { type: "object", properties: { path: string, title: string, blocks: { type: "array", items: { oneOf: [
    { type: "object", properties: { type: { const: "paragraph" }, text: string }, required: ["type", "text"], additionalProperties: false },
    { type: "object", properties: { type: { const: "heading" }, text: string, level: { type: "integer", minimum: 1, maximum: 6 } }, required: ["type", "text", "level"], additionalProperties: false },
  ] } } }, required: ["path", "title", "blocks"], additionalProperties: false } },
  { type: "function", name: "read_document", description: "Read a document's disk source and revision inside the opened folders.", inputSchema: { type: "object", properties: { path: string }, required: ["path"], additionalProperties: false } },
  { type: "function", name: "list_documents", description: "List documents and child folders one level inside an opened folder; hidden entries and symlinks are omitted.", inputSchema: { type: "object", properties: { path: string }, required: ["path"], additionalProperties: false } },
];

/** Provider-neutral Host operation. Core alone owns document meaning and serialization. */
export function executeDocumentTool(name: string, input: unknown, scope: DocumentToolScope) {
  if (!documentTools.some(tool => tool.name === name)) throw new Error("Unknown document tool.");
  const value = input as { path: string; title: string; blocks: { type: string; text: string; level: number }[] };
  const invalid = (message: string): never => { throw new DocumentDiagnosticError("invalid-operation", message); };
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.path !== "string" || !path.isAbsolute(value.path)) invalid("An absolute path is required.");
  const keys = name === "create_document" ? ["path", "title", "blocks"] : ["path"];
  if (Object.keys(value).some(key => !keys.includes(key))) invalid("Unsupported tool input.");
  if (!scope.folders) throw new Error("No opened folders for this turn.");
  const create = name === "create_document";
  if (create && scope.writeAccess !== "opened-folders") throw new Error("Document creation is read-only for this turn.");
  const file = scope.folders.resolve(accessPath(value.path, scope.access, create), create);
  if (name === "read_document") {
    const { path, source, revision } = loadEditorFile(file, scope.access);
    return { path, source, revision };
  }
  if (name === "list_documents") {
    const listing = listFolder(scope.folders.boundary(file), file, scope.access);
    return { ...listing, entries: listing.entries.filter(entry => entry.kind === "document" || entry.kind === "folder") };
  }
  if (typeof value.title !== "string" || !Array.isArray(value.blocks)) invalid("Title and blocks are required.");
  let document = updateDocumentTitle(createDocument(), value.title);
  for (const block of value.blocks) {
    if (!block || typeof block.text !== "string" || !["paragraph", "heading"].includes(block.type) ||
      Object.keys(block).some(key => !(block.type === "heading" ? ["type", "text", "level"] : ["type", "text"]).includes(key))) invalid("Unsupported body block.");
    document = block.type === "paragraph" ? insertParagraph(document, bodyEndIndex(document), block.text)
      : insertHeading(document, bodyEndIndex(document), block.level, block.text);
  }
  validateStructure(document);
  const source = serialize(document);
  const target = resolveDocumentPath(scope.folders.resolve(accessPath(file, scope.access, true), true), scope.access, true);
  const fd = openSync(target, "wx");
  try {
    writeFileSync(fd, source, { encoding: "utf8" });
    return { path: target, revision: textRevision(source), identity: fileIdentity(fstatSync(fd, { bigint: true })) };
  } finally { closeSync(fd); }
}
