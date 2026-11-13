import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isMap, parseDocument } from "yaml";
import type { PluginManifest } from "@litzio/plugin-sdk";

const prefix = "litzio-plugin-";
// Manifest plugin IDs have no consecutive separators; dots become double hyphens.
const namespace = (plugin: string) => `${prefix}${plugin.replaceAll(".", "--")}---`;

export class AssistantSkillValidationError extends Error {
  constructor(readonly file: string, readonly field: string, message: string) {
    super(`${file}: ${field}: ${message}`);
    this.name = "AssistantSkillValidationError";
  }
}

function skillEntry(directory: string, manifest: PluginManifest, skill: PluginManifest["contributes"]["skills"][number]) {
  const file = `${skill.directory}/SKILL.md`;
  const fail = (field: string, message: string): never => { throw new AssistantSkillValidationError(file, field, message); };
  let source: string;
  try { source = realpathSync(path.join(directory, skill.directory)); }
  catch { return fail("directory", "Expected an existing artifact-local skill directory."); }
  const relative = path.relative(realpathSync(directory), source);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail("directory", "Expected a directory inside the artifact.");
  let text: string;
  try { text = readFileSync(path.join(source, "SKILL.md"), "utf8"); }
  catch { return fail("SKILL.md", "Expected a readable UTF-8 SKILL.md file."); }
  const frontmatter = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!frontmatter) return fail("frontmatter", "Expected YAML between opening and closing --- lines at the start of SKILL.md.");
  const document = parseDocument(frontmatter[1]);
  if (document.errors.length) fail("frontmatter", `Invalid YAML (${document.errors.map(error => error.code).join(", ")}); expected a mapping with name and description strings.`);
  if (!isMap(document.contents)) fail("frontmatter", "Expected a YAML mapping with name and description strings.");
  for (const field of ["name", "description"]) {
    const value = document.get(field);
    if (typeof value !== "string" || !value.trim()) fail(field, "Expected a non-empty YAML string.");
  }
  const name = `${namespace(manifest.id)}${skill.id}`;
  if (name.length > 64) fail("skills.id", `Installed name '${name}' has ${name.length} characters; maximum is 64. Shorten the manifest plugin id or skills.id (litzio-plugin- + plugin id with dots replaced by -- + --- + skills.id).`);
  const displayName = `${manifest.name} · ${String(document.get("name")).trim()}`;
  document.set("name", name);
  return { source, name, displayName, text: `---\n${document.toString()}---\n${text.slice(frontmatter[0].length)}` };
}

/** Non-executing artifact validation; artifactDigest already refuses links/escapes. */
export function validateAssistantSkills(directory: string, manifest: PluginManifest) {
  for (const skill of manifest.contributes.skills) skillEntry(directory, manifest, skill);
}

/** Only this Host's reserved prefix is managed; guide/user skill folders are preserved. */
export class PluginAssistantSkills {
  private directory: string;
  private labels = new Map<string, { plugin: string; displayName: string }>();
  displayName(file: string) { return this.labels.get(path.resolve(file))?.displayName; }
  constructor(assistantDirectory: string) { this.directory = path.join(assistantDirectory, ".agents", "skills"); }
  clear(plugin?: string) {
    for (const [file, value] of this.labels) if (!plugin || value.plugin === plugin) this.labels.delete(file);
    if (!existsSync(this.directory)) return;
    for (const name of readdirSync(this.directory)) if ((process.platform === "win32" ? name.toLowerCase() : name).startsWith(plugin ? namespace(plugin) : prefix)) {
      rmSync(path.join(this.directory, name), { recursive: true, force: true });
    }
  }
  install(directory: string, manifest: PluginManifest) {
    this.clear(manifest.id);
    try {
      for (const skill of manifest.contributes.skills) {
        const entry = skillEntry(directory, manifest, skill);
        mkdirSync(this.directory, { recursive: true });
        const target = path.join(this.directory, entry.name);
        cpSync(entry.source, target, { recursive: true });
        writeFileSync(path.join(target, "SKILL.md"), entry.text);
        this.labels.set(path.resolve(target, "SKILL.md"), { plugin: manifest.id, displayName: entry.displayName });
      }
    } catch (error) { this.clear(manifest.id); throw error; }
  }
}
