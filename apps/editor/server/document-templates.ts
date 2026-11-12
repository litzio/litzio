import fs from "node:fs";
import path from "node:path";
import { createDocumentFromTemplate, getTemplateMetadata, parse, serialize, updateTemplateMetadata } from "@litzio/core";
import { decodeUtf8 } from "@litzio/file-commit";
import { validFileStem } from "../shared/file-operations.ts";
import type { SaveTemplateRequest, TemplateContent, TemplateLanguage, TemplateList } from "../shared/template-protocol.ts";
import { accessPath, LOCAL_FILE_ACCESS, type FileAccess, type RootAccess } from "./file-access.ts";
import { createDocumentSourceFile, type DocumentCreationReceipt } from "./document-create.ts";
import { resolveDocumentPath } from "./document-path.ts";
import { BUILTIN_TEMPLATES } from "./builtin-templates.ts";
import { hostPaths } from "./host-paths.ts";

export function templateLanguage(value: unknown = "en"): TemplateLanguage {
  if (value !== "ko" && value !== "en") throw Object.assign(new Error("Template language must be ko or en."),{errorKind:"invalid_input"});
  return value;
}

const identity = (name: string) => name.normalize("NFC").toLowerCase();
function builtins(language: TemplateLanguage): TemplateContent[] {
  return Object.entries(BUILTIN_TEMPLATES).map(([key, sources]) => {
    const source = serialize(parse(sources[language]));
    return { id: `builtin:${key}`, kind: "builtin", ...getTemplateMetadata(parse(source))!, source };
  });
}
function reserved(name: string): boolean {
  return ["ko", "en"].some(language => builtins(language as TemplateLanguage).some(item =>
    identity(item.name) === identity(name) || identity(item.id) === identity(name)));
}

/** Do not follow a substituted template folder or linked parent to user files. */
function realDirectory(directory: string): void {
  const parent = path.dirname(directory);
  if (parent !== directory) realDirectory(parent);
  const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error("Template directory must be a real directory.");
}

export function listTemplates(language: TemplateLanguage = "en", directory = hostPaths().templates): TemplateList {
  const templates: TemplateList["templates"] = builtins(language).map(({ source, ...item }) => item);
  const problems: TemplateList["problems"] = [];
  realDirectory(directory);
  if (fs.existsSync(directory)) for (const file of fs.readdirSync(directory).sort()) {
    if (path.extname(file).toLowerCase() !== ".md") continue;
    try {
      const full = path.join(directory, file);
      const stat = fs.lstatSync(full);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Template must be a regular file.");
      const meta = getTemplateMetadata(parse(decodeUtf8(fs.readFileSync(full))));
      if (!meta || !validFileStem(meta.name) || file !== `${meta.name}.md`) throw new Error("Template name must match its filename stem.");
      if (reserved(meta.name) || templates.some(item => identity(item.name) === identity(meta.name))) throw new Error("Template name already exists or is reserved.");
      templates.push({ ...meta, id: `user:${meta.name}`, kind: "user" });
    } catch (error) { problems.push({ file, error: error instanceof Error ? error.message : String(error) }); }
  }
  return { directory, templates, problems };
}

export function readTemplate(name: string, language: TemplateLanguage = "en", directory = hostPaths().templates): TemplateContent {
  if (typeof name !== "string" || !name) throw Object.assign(new Error("Template name or id is required."),{errorKind:"invalid_input"});
  const defaults = builtins(language);
  const item = defaults.find(item => item.id === name || identity(item.name) === identity(name));
  if (item) return item;
  const user = listTemplates(language, directory).templates.find(item => item.kind === "user" &&
    (item.id === name || identity(item.name) === identity(name)));
  if (!user) throw new Error("Template not found or invalid.");
  const file = path.join(directory, `${user.name}.md`);
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error("Template must be a regular file.");
  const source = serialize(parse(decodeUtf8(fs.readFileSync(file))));
  return { ...user, ...getTemplateMetadata(parse(source))!, source };
}

export function templateDocumentSource(name: string, language: TemplateLanguage = "en", directory = hostPaths().templates): string {
  return serialize(createDocumentFromTemplate(parse(readTemplate(name, language, directory).source)));
}

export function saveTemplate(request: SaveTemplateRequest, access: FileAccess = LOCAL_FILE_ACCESS, directory = hostPaths().templates): TemplateContent {
  if (!request || typeof request.name !== "string" || !validFileStem(request.name)) throw Object.assign(new Error("Template name must be a valid file stem."),{errorKind:"invalid_input"});
  if (typeof request.from !== "string" || !request.from.trim()) throw Object.assign(new Error("Source document path is required."),{errorKind:"invalid_input"});
  const { name } = request;
  if (reserved(name)) throw Object.assign(new Error("Template name is reserved for an app default."),{errorKind:"invalid_input"});
  const file = resolveDocumentPath(request.from, access);
  const document = parse(decodeUtf8(fs.readFileSync(accessPath(file, access))));
  const description = request.description ?? getTemplateMetadata(document)?.description ?? "";
  const source = serialize(updateTemplateMetadata(document, { name, description }));
  const inventory = listTemplates("en", directory);
  if (inventory.templates.some(item => identity(item.name) === identity(name)) ||
      (fs.existsSync(directory) && fs.readdirSync(directory).some(file => identity(file) === identity(`${name}.md`)))) throw Object.assign(new Error("Template already exists."),{errorKind:"conflict"});
  realDirectory(directory);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${name}.md`), source, { encoding: "utf8", flag: "wx" });
  return { id: `user:${name}`, kind: "user", name, description, source };
}

const string = { type: "string" };
const language = { type: "string", enum: ["ko", "en"] };
/** The template slice's shared inputs/results. Transports only adapt these Host operations. */
export const templateOperations = {
  list: { name: "list_templates", description: "List current Litzio template names and descriptions. Choose a template within the user request; no extra consent is needed. Never silently substitute a missing named template.", inputSchema: { type: "object", properties: { language }, additionalProperties: false } },
  read: { name: "read_template", description: "Read a Litzio template by id or name, preserving its structure.", inputSchema: { type: "object", properties: { template: string, language }, required: ["template"], additionalProperties: false } },
  create: { name: "create_document", description: "Create a new document from the user's authorized template. Never overwrites; returns a creation receipt for Open/Undo.", inputSchema: { type: "object", properties: { path: string, template: string, language }, required: ["path", "template"], additionalProperties: false } },
  save: { name: "save_template", description: "Save a disk document as a new user template. Confirm name, description and source first; never overwrites. Unsaved changes are not included.", inputSchema: { type: "object", properties: { name: string, from: string, description: string }, required: ["name", "from"], additionalProperties: false } },
};
export const templateTools = [templateOperations.list, templateOperations.read, templateOperations.save].map(spec => ({ type: "function", ...spec }));
export type TemplateScope = {
  access: FileAccess; directory?: string;
  /** Absent for local CLI/HTTP; null means a tool turn without opened folders. */
  folders?: RootAccess | null; permissionMode?: string;
};
export function executeTemplateOperation(operation: "list", input: unknown, scope?: TemplateScope): TemplateList;
export function executeTemplateOperation(operation: "read" | "save", input: unknown, scope?: TemplateScope): TemplateContent;
export function executeTemplateOperation(operation: "create", input: unknown, scope?: TemplateScope): DocumentCreationReceipt;
export function executeTemplateOperation(operation: keyof typeof templateOperations, input: unknown, scope: TemplateScope = { access: LOCAL_FILE_ACCESS }) {
  const spec = templateOperations[operation];
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !Object.hasOwn(spec.inputSchema.properties, key))) throw Object.assign(new Error("Unsupported template operation input."),{errorKind:"invalid_input"});
  const value = input as Record<string, unknown>;
  for (const [key, property] of Object.entries(spec.inputSchema.properties)) {
    if (value[key] !== undefined && property.type === "string" && typeof value[key] !== "string") throw Object.assign(new Error(`Invalid template ${key}.`),{errorKind:"invalid_input"});
  }
  if ("required" in spec.inputSchema && spec.inputSchema.required.some(key => typeof value[key] !== "string" || !(value[key] as string).trim())) throw Object.assign(new Error("Required template operation input is missing."),{errorKind:"invalid_input"});
  const lang = templateLanguage(value.language);
  if (operation === "list") return listTemplates(lang, scope.directory);
  if (operation === "read") return readTemplate(value.template as string, lang, scope.directory);
  if (scope.permissionMode !== undefined && scope.permissionMode !== "opened-folders" && scope.permissionMode !== "full-access") throw Object.assign(new Error("Template writes are read-only for this turn."),{errorKind:"forbidden"});
  const requested = (operation === "save" ? value.from : value.path) as string;
  const create = operation === "create";
  if (scope.folders !== undefined && !scope.folders) throw Object.assign(new Error("An opened folder is required."),{errorKind:"forbidden"});
  if (scope.folders !== undefined && !path.isAbsolute(requested)) throw Object.assign(new Error("Use an absolute path inside the current opened folder."),{errorKind:"invalid_input"});
  const file = accessPath(requested, scope.access, create);
  const target = scope.folders ? scope.folders.resolve(file, create) : file;
  if (operation === "save") return saveTemplate({ name: value.name as string, from: target, description: value.description as string | undefined }, scope.access, scope.directory);
  return createDocumentSourceFile(target, templateDocumentSource(value.template as string, lang, scope.directory), scope.access);
}
