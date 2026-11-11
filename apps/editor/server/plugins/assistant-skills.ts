import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isMap, parseDocument } from "yaml";
import type { PluginManifest } from "@litzio/plugin-sdk";

const prefix = "litzio-plugin-";
// Manifest plugin IDs have no consecutive separators; dots become double hyphens.
const namespace = (plugin: string) => `${prefix}${plugin.replaceAll(".", "--")}---`;

function skillEntry(directory: string, manifest: PluginManifest, skill: PluginManifest["contributes"]["skills"][number]) {
  const source = realpathSync(path.join(directory, skill.directory));
  const relative = path.relative(realpathSync(directory), source);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Skill directory must stay inside package");
  const text = readFileSync(path.join(source, "SKILL.md"), "utf8");
  const frontmatter = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!frontmatter) throw new Error("Skill requires YAML frontmatter");
  const document = parseDocument(frontmatter[1]);
  const name = `${namespace(manifest.id)}${skill.id}`;
  if (document.errors.length || !isMap(document.contents) || typeof document.get("name") !== "string" || !String(document.get("name")).trim() || typeof document.get("description") !== "string" || !String(document.get("description")).trim() || name.length > 64) throw new Error("Invalid skill name or description");
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
