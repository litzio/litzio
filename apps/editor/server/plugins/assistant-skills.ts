import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isMap, parseDocument } from "yaml";
import type { PluginManifest } from "@litzio/plugin-sdk";
import { canonicalFilePath } from "../file-access.ts";

const prefix = "litzio-plugin-";
const stagingPrefix = ".litzio-plugin-skills-";
// Manifest plugin IDs have no consecutive separators; dots become double hyphens.
const namespace = (plugin: string) => `${prefix}${plugin.replaceAll(".", "--")}---`;

function removeOwned(parent: string, name: string) {
  if (path.basename(name) !== name || name === "." || name === ".." ||
      path.relative(parent, canonicalFilePath(parent)) !== "") throw new Error("Invalid plugin skill cleanup path");
  const target = path.join(parent, name);
  const entry = lstatSync(target, { throwIfNoEntry: false });
  if (entry?.isSymbolicLink()) throw new Error("Invalid plugin skill cleanup path");
  rmSync(target, { recursive: true, force: true });
}

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
  constructor(assistantDirectory: string, private warn = console.warn) { this.directory = path.join(assistantDirectory, ".agents", "skills"); }
  clear(plugin?: string) {
    for (const [file, value] of this.labels) if (!plugin || value.plugin === plugin) this.labels.delete(file);
    for (const name of this.names(plugin)) {
      removeOwned(canonicalFilePath(this.directory), name);
    }
    const parent = path.dirname(this.directory);
    if (!plugin && existsSync(parent)) for (const name of readdirSync(parent)) {
      if (name.startsWith(stagingPrefix)) removeOwned(canonicalFilePath(parent), name);
    }
  }
  private names(plugin?: string) {
    const wanted = plugin ? namespace(plugin) : prefix;
    return existsSync(this.directory) ? readdirSync(this.directory).filter(name => (process.platform === "win32" ? name.toLowerCase() : name).startsWith(wanted)) : [];
  }
  install(directory: string, manifest: PluginManifest, commit: () => void = () => {}) {
    const previous = this.names(manifest.id);
    if (!previous.length && !manifest.contributes.skills.length) { commit(); return; }
    mkdirSync(this.directory, { recursive: true });
    // Stage outside the skill search path, on the same volume as the published directories.
    const parent = canonicalFilePath(path.dirname(this.directory));
    const stage = mkdtempSync(path.join(parent, stagingPrefix));
    const backup = path.join(stage, "previous");
    const published: string[] = [], saved: string[] = [];
    let cleanup = true;
    try {
      const entries = manifest.contributes.skills.map(skill => skillEntry(directory, manifest, skill));
      for (const entry of entries) {
        const target = path.join(stage, entry.name);
        cpSync(entry.source, target, { recursive: true });
        writeFileSync(path.join(target, "SKILL.md"), entry.text);
      }
      mkdirSync(backup);
      for (const name of previous) {
        renameSync(path.join(this.directory, name), path.join(backup, name));
        saved.push(name);
      }
      for (const { name } of entries) {
        renameSync(path.join(stage, name), path.join(this.directory, name));
        published.push(name);
      }
      commit();
      for (const name of previous) this.labels.delete(path.resolve(this.directory, name, "SKILL.md"));
      for (const { name, displayName } of entries) {
        this.labels.set(path.resolve(this.directory, name, "SKILL.md"), { plugin: manifest.id, displayName });
      }
    } catch (error) {
      cleanup = false;
      for (const name of published.reverse()) renameSync(path.join(this.directory, name), path.join(stage, name));
      for (const name of saved) renameSync(path.join(backup, name), path.join(this.directory, name));
      cleanup = true;
      throw error;
    } finally {
      try { if (cleanup) removeOwned(parent, path.basename(stage)); }
      catch { this.warn("Unable to clean up staged plugin skills"); }
    }
  }
}
