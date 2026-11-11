import { COMMAND_OPTIONS, isEditCommand } from "./document-edit-commands.ts";
import path from "node:path";
import { createDocument, updateDocumentTitle, insertParagraph, insertHeading, bodyEndIndex, serialize, validateStructure, DocumentDiagnosticError } from "@litzio/core";
import { createDocumentSourceFile } from "./document-create.ts";
import { executeTemplateOperation, templateOperations } from "./document-templates.ts";
import { accessPath, RootAccess, type FileAccess } from "./file-access.ts";
import { loadEditorFile, listFolder } from "./document-api.ts";

export type DocumentToolScope = { folders: RootAccess | null; permissionMode: string; access: FileAccess; directory?: string; changes?: import("./assistant-changes.ts").AssistantChanges; conversation?: string };
const string = { type: "string" };
export const documentTools = [
  { type: "function", name: "inspect_staged_document", description: "Read current pending-copy nodes, paths and copyRevision by change ID. Inspect again after structural edits.", inputSchema: { type: "object", properties: { change: string }, required: ["change"], additionalProperties: false } },
  { type: "function", name: "edit_staged_document", description: "Apply an atomic Litzio apply-batch to this conversation pending copy only. Requires the inspected copyRevision. Each operation uses command plus its apply-batch options, e.g. {command:'update-node-text',path:'1',from:'old',to:'new'} or {command:'insert-block',at:'end',text:'text'}. Paths are comma-separated node indices. A failed operation writes nothing. Success means copy complete, awaiting human Apply; never original applied.", inputSchema: { type: "object", properties: { change: string, copyRevision: string, operations: { type: "array", minItems: 1, items: { type: "object", properties: { command: { type: "string", enum: Object.keys(COMMAND_OPTIONS).filter(isEditCommand) } }, required: ["command"], additionalProperties: true } } }, required: ["change", "copyRevision", "operations"], additionalProperties: false } },
  { type: "function", name: "stage_document", description: "Start or find this conversation's pending copy of an existing document, only after an explicit edit request. Use inspect_staged_document and edit_staged_document without a shell; never edit the original. Applying and discarding belong to the human review UI.", inputSchema: { type: "object", properties: { path: string }, required: ["path"], additionalProperties: false } },
  { type: "function", name: "create_document", description: "Create a new Litzio .md document inside an opened folder. Never overwrites. Blocks are plain-text paragraphs or headings (level 1–6). Alternatively supply path, template and optional language for an authorized template (without title/blocks). Use this tool instead of shell commands.", inputSchema: { type: "object", properties: { ...templateOperations.create.inputSchema.properties, title: string, blocks: { type: "array", items: { oneOf: [
    { type: "object", properties: { type: { const: "paragraph" }, text: string }, required: ["type", "text"], additionalProperties: false },
    { type: "object", properties: { type: { const: "heading" }, text: string, level: { type: "integer", minimum: 1, maximum: 6 } }, required: ["type", "text", "level"], additionalProperties: false },
  ] } } }, required: ["path"], additionalProperties: false } },
  { type: "function", name: "read_document", description: "Read a document's disk source and revision inside the opened folders.", inputSchema: { type: "object", properties: { path: string }, required: ["path"], additionalProperties: false } },
  { type: "function", name: "list_documents", description: "List documents and child folders one level inside an opened folder; hidden entries and symlinks are omitted.", inputSchema: { type: "object", properties: { path: string }, required: ["path"], additionalProperties: false } },
];

/** Provider-neutral Host operation. Core alone owns document meaning and serialization. */
export function executeDocumentTool(name: string, input: unknown, scope: DocumentToolScope) {
  if (!documentTools.some(tool => tool.name === name)) throw new Error("Unknown document tool.");
  if (name === "inspect_staged_document" || name === "edit_staged_document") {
    if (!scope.changes || !scope.conversation) return { receipt: { outcome: "failure" }, errorKind: "unavailable", error: "Pending changes unavailable." };
    return scope.changes.edit(scope.conversation, name === "inspect_staged_document" ? "inspect" : "edit", input, scope);
  }
  if (name === "create_document" && input && typeof input === "object" && "template" in input) return executeTemplateOperation("create", input, scope);
  const value = input as { path: string; title: string; blocks: { type: string; text: string; level: number }[] };
  const invalid = (message: string): never => { throw new DocumentDiagnosticError("invalid-operation", message); };
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.path !== "string" || !path.isAbsolute(value.path)) invalid("An absolute path is required.");
  const keys = name === "create_document" ? ["path", "title", "blocks"] : ["path"];
  if (Object.keys(value).some(key => !keys.includes(key))) invalid("Unsupported tool input.");
  if (!scope.folders) throw new Error("No opened folders for this turn.");
  const create = name === "create_document";
  if (create && scope.permissionMode !== "opened-folders" && scope.permissionMode !== "full-access") throw new Error("Document creation is read-only for this turn.");
  if (name === "stage_document") {
    if (!scope.changes || !scope.conversation) throw new Error("Pending changes unavailable.");
    return scope.changes.start(scope.conversation, value.path, scope);
  }
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
  return createDocumentSourceFile(scope.folders.resolve(accessPath(file, scope.access, true), true), source, scope.access);
}
