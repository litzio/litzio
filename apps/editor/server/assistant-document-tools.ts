import { importDocumentImageAsset } from "./asset-api.ts";
import { COMMAND_OPTIONS, isEditCommand, applyDocumentBatch } from "./document-edit-commands.ts";
import path from "node:path";
import { createDocument, updateDocumentTitle, insertParagraph, insertHeading, bodyEndIndex, serialize, validateStructure, DocumentDiagnosticError } from "@litzio/core";
import { createDocumentSourceFile } from "./document-create.ts";
import { executeTemplateOperation, templateOperations } from "./document-templates.ts";
import { accessPath, FileAccessError, RootAccess, type FileAccess } from "./file-access.ts";
import { figureReadiness } from "./figure-readiness.ts";
import { loadEditorFile, listFolder } from "./document-api.ts";

export type DocumentToolScope = { folders: RootAccess | null; permissionMode: string; access: FileAccess; directory?: string };
const string = { type: "string" };
const operations = { type: "array", minItems: 1, items: { type: "object", properties: { command: { type: "string", enum: Object.keys(COMMAND_OPTIONS).filter(isEditCommand) } }, required: ["command"], additionalProperties: true } };
const structuredHelp = "Use existing apply-batch commands: insert-table {at:'end',cells:[['Name','Status'],['A','Done']],caption:'Summary'}, insert-list {at:'end',list:{ordered:false,items:[{content:[{kind:'text',text:'Item'}]}]}}, insert-figure {at:'end',image:'images/chart.png',caption:'Chart',alt:'Chart'}, update-figure {path:'2',caption:'Revised'}, update-table-caption {path:'1',text:'Summary'}, update-table-cell {path:'1,0,0',text:'Name'}. Also supports existing code, equation, quote, admonition and other CLI/Core commands. import_document_image is a convenient way to copy images and obtain relative paths. Regardless of insertion method, run litzio check to verify figure paths. Report asset readiness separately.";
export const documentTools = [
  { type: "function", name: "import_document_image", description: "Copy an existing image file into the target document assets folder and return its relative path for insert-figure. Adds a file immediately without changing document text; the asset remains until explicitly removed. Never overwrites. Requires opened-folders or full-access; outside-folder sources require opening the containing folder or Full access.", inputSchema: { type: "object", properties: { path: string, source: string }, required: ["path", "source"], additionalProperties: false } },
  { type: "function", name: "create_document", description: "Create a new Litzio .md document immediately. Restricted modes require an opened folder; full-access permits outside paths within Host Roots. Never overwrites. Supply title and either operations (applied to an empty document before creation) or plain-text paragraph/heading blocks. Do not combine operations and blocks. Alternatively supply path, template and optional language for an authorized template (without title/blocks/operations). " + structuredHelp, inputSchema: { type: "object", properties: { ...templateOperations.create.inputSchema.properties, title: string, operations, blocks: { type: "array", items: { oneOf: [
    { type: "object", properties: { type: { const: "paragraph" }, text: string }, required: ["type", "text"], additionalProperties: false },
    { type: "object", properties: { type: { const: "heading" }, text: string, level: { type: "integer", minimum: 1, maximum: 6 } }, required: ["type", "text", "level"], additionalProperties: false },
  ] } } }, required: ["path"], additionalProperties: false } },
  { type: "function", name: "read_document", description: "Read a document's disk source and revision within opened folders in restricted modes, or within Host Roots in full-access.", inputSchema: { type: "object", properties: { path: string }, required: ["path"], additionalProperties: false } },
  { type: "function", name: "list_documents", description: "List documents and child folders one level within opened folders in restricted modes, or within Host Roots in full-access; hidden entries and symlinks are omitted.", inputSchema: { type: "object", properties: { path: string }, required: ["path"], additionalProperties: false } },
];

/** Provider-neutral Host operation. Core alone owns document meaning and serialization. */
export function executeDocumentTool(name: string, input: unknown, scope: DocumentToolScope) {
  try { return execute(name, input, scope); }
  catch (error) {
    if (name !== "create_document" && name !== "import_document_image") throw error;
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as NodeJS.ErrnoException).code;
    const classified = (error as {errorKind?: string})?.errorKind;
    const errorKind = classified && ["invalid_input", "conflict", "forbidden", "unavailable", "uncertain"].includes(classified) ? classified : error instanceof FileAccessError || ["EACCES", "EPERM"].includes(code ?? "") || /read-only|No opened folders/.test(message) ? "forbidden"
      : /file already exists/.test(message) ? "conflict"
      : code === "ENOENT" || /parent directory does not exist/.test(message) ? "unavailable"
      : code ? "uncertain" : "invalid_input";
    return { receipt: { outcome: errorKind === "uncertain" ? "uncertain" : "failure" }, errorKind, error: message };
  }
}

function execute(name: string, input: unknown, scope: DocumentToolScope) {
  if (!documentTools.some(tool => tool.name === name)) throw new Error("Unknown document tool.");
  if (name === "create_document" && input && typeof input === "object" && "template" in input) return executeTemplateOperation("create", input, scope);
  const value = input as { path: string; title: string; operations?: unknown; blocks: { type: string; text: string; level: number }[] };
  const invalid = (message: string): never => { throw new DocumentDiagnosticError("invalid-operation", message); };
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.path !== "string" || !path.isAbsolute(value.path)) invalid("An absolute path is required.");
  const keys = name === "import_document_image" ? ["path", "source"] : name === "create_document" ? ["path", "title", "blocks", "operations"] : ["path"];
  if (Object.keys(value).some(key => !keys.includes(key))) invalid("Unsupported tool input.");
  if (!scope.folders) throw Object.assign(new Error("No opened folders for this turn."),{errorKind:"forbidden"});
  if (name === "import_document_image") {
    if (!["opened-folders", "full-access"].includes(scope.permissionMode)) throw Object.assign(new Error("Image import is read-only for this turn."), { errorKind: "forbidden" });
    const source = (input as { source: string }).source;
    if (typeof source !== "string" || !path.isAbsolute(source)) invalid("An absolute image source path is required.");
    const target = scope.folders.resolve(accessPath(value.path, scope.access));
    const file = scope.folders.resolve(accessPath(source, scope.access));
    return importDocumentImageAsset(target, file, scope.access);
  }
  const create = name === "create_document";
  if (create && scope.permissionMode !== "opened-folders" && scope.permissionMode !== "full-access") throw Object.assign(new Error("Document creation is read-only for this turn."),{errorKind:"forbidden"});
  const file = scope.folders.resolve(accessPath(value.path, scope.access, create), create);
  if (name === "read_document") {
    const { path, source, revision } = loadEditorFile(file, scope.access);
    return { path, source, revision };
  }
  if (name === "list_documents") {
    const listing = listFolder(scope.folders.boundary(file), file, scope.access);
    return { ...listing, entries: listing.entries.filter(entry => entry.kind === "document" || entry.kind === "folder") };
  }
  if (typeof value.title !== "string" || (("operations" in value) === ("blocks" in value))) invalid("Title and exactly one of blocks or operations are required.");
  let document = updateDocumentTitle(createDocument(), value.title);
  if ("operations" in value) {
    const result = applyDocumentBatch(serialize(document), value.operations);
    const readiness = figureReadiness(result.markdown, file, scope.access);
    return { ...createDocumentSourceFile(scope.folders.resolve(accessPath(file, scope.access, true), true), result.markdown, scope.access), receipt: { outcome: "success" }, readiness };
  }
  if (!Array.isArray(value.blocks)) invalid("Blocks must be an array.");
  for (const block of value.blocks) {
    if (!block || typeof block.text !== "string" || !["paragraph", "heading"].includes(block.type) ||
      Object.keys(block).some(key => !(block.type === "heading" ? ["type", "text", "level"] : ["type", "text"]).includes(key))) invalid("Unsupported body block.");
    document = block.type === "paragraph" ? insertParagraph(document, bodyEndIndex(document), block.text)
      : insertHeading(document, bodyEndIndex(document), block.level, block.text);
  }
  validateStructure(document);
  const source = serialize(document);
  const readiness = figureReadiness(source, file, scope.access);
  return { ...createDocumentSourceFile(scope.folders.resolve(accessPath(file, scope.access, true), true), source, scope.access), receipt: { outcome: "success" }, readiness };
}


/** Full access removes conversation folder limits; the selected Host policy still applies. */
export function documentFolders(folders: string[], permissionMode: string, access: FileAccess): DocumentToolScope["folders"] {
  if (permissionMode === "full-access") return new class extends RootAccess {
    override readonly roots = folders;
    override resolve(value: string, create = false) { return accessPath(value, access, create); }
    override boundary(value: string) { return access instanceof RootAccess ? access.boundary(value) : path.parse(value).root; }
  }(folders.length ? folders : [process.cwd()]);
  if (!folders.length) return null;
  const limited = new RootAccess(folders), resolve = limited.resolve.bind(limited);
  limited.resolve = (value, create = false) => {
    try { return resolve(value, create); }
    catch (error) { if (error instanceof FileAccessError) throw Object.assign(new Error('Path is outside this turn opened folders. Ask the user to choose Full access or open the containing folder, then retry.'), { errorKind: "forbidden" }); throw error; }
  };
  return limited;
}
