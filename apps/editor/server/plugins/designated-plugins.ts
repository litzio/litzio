import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Product-owned community supply. Runtime payload only; never imports plugin entries.
export const DESIGNATED_COMMUNITY_PLUGINS = [
  { id: "community.docling", folder: "docling", files: ["litzio-plugin.json", "package.json", "host.js", "conversion.js", "archive.js", "document.js", "review.js", "versions.js", "litzio-pdf-en-v1.json", "icon.svg", "ICON-LICENSE"] },
  { id: "community.jira", folder: "jira", files: ["litzio-plugin.json", "package.json", "host.js", "icon.svg", "LICENSE-icon.txt"] },
];
const root = new URL(import.meta.url.endsWith(".ts") ? "../../../../community-plugins/" : "./community-plugins/", import.meta.url);
export const designatedPluginDirectories = () => DESIGNATED_COMMUNITY_PLUGINS.map(item => ({ id: item.id, directory: fileURLToPath(new URL(`${item.folder}/`, root)) }));

export function assertDesignatedPluginPayload(buildDirectory: string) {
  for (const item of DESIGNATED_COMMUNITY_PLUGINS) for (const file of item.files) {
    if (!existsSync(path.join(buildDirectory, "community-plugins", item.folder, file))) throw new Error(`The CLI build has no designated community payload: ${item.id}/${file}`);
  }
}
