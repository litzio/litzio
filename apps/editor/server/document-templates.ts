import fs from "node:fs";
import path from "node:path";
import { createDocumentFromTemplate, getTemplateMetadata, parse, serialize, updateTemplateMetadata } from "@litzio/core";
import { decodeUtf8 } from "@litzio/file-commit";
import { validFileStem } from "../shared/file-operations.ts";
import type { SaveTemplateRequest, TemplateContent, TemplateLanguage, TemplateList } from "../shared/template-protocol.ts";
import { accessPath, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";
import { resolveDocumentPath } from "./document-path.ts";
import { BUILTIN_TEMPLATES } from "./builtin-templates.ts";
import { hostPaths } from "./host-paths.ts";

export function templateLanguage(value: unknown = "en"): TemplateLanguage {
  if (value !== "ko" && value !== "en") throw new Error("Template language must be ko or en.");
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
  if (typeof name !== "string" || !name) throw new Error("Template name or id is required.");
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
  if (!request || typeof request.name !== "string" || !validFileStem(request.name)) throw new Error("Template name must be a valid file stem.");
  if (typeof request.from !== "string" || !request.from.trim()) throw new Error("Source document path is required.");
  const { name } = request;
  if (reserved(name)) throw new Error("Template name is reserved for an app default.");
  const file = resolveDocumentPath(request.from, access);
  const document = parse(decodeUtf8(fs.readFileSync(accessPath(file, access))));
  const description = request.description ?? getTemplateMetadata(document)?.description ?? "";
  const source = serialize(updateTemplateMetadata(document, { name, description }));
  const inventory = listTemplates("en", directory);
  if (inventory.templates.some(item => identity(item.name) === identity(name)) ||
      (fs.existsSync(directory) && fs.readdirSync(directory).some(file => identity(file) === identity(`${name}.md`)))) throw new Error("Template already exists.");
  realDirectory(directory);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${name}.md`), source, { encoding: "utf8", flag: "wx" });
  return { id: `user:${name}`, kind: "user", name, description, source };
}
