import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Product-owned community supply, including declared sample assets; never imports plugin entries.
export const DESIGNATED_COMMUNITY_PLUGINS = [
  { id: "community.docling", folder: "docling", files: ["litzio-plugin.json", "package.json", "host.js", "conversion.js", "archive.js", "document.js", "review.js", "workspace.js", "lenses.js", "schema.js", "skills/review/SKILL.md", "schema/DoclingDocument-1.10.0.json", "schema/document.d.ts", "schema/LICENSE", "schema/README.md", "versions.js", "litzio-pdf-en-v1.json", "icon.svg", "ICON-LICENSE", "sample/lsr-1.1/LICENSES.md", "sample/lsr-1.1/LSR-1.1-standards-answer-key.pdf", "sample/lsr-1.1/LSR-1.1-standards-no-bookmarks.pdf", "sample/lsr-1.1/LSR-1.1-standards.pdf", "sample/lsr-1.1/README.md", "sample/lsr-1.1/SHA256SUMS", "sample/lsr-1.1/ground_truth/standards-no-bookmarks.json", "sample/lsr-1.1/ground_truth/standards.json", "sample/lsr-1.1/resources/fonts/DejaVu-LICENSE.txt", "sample/lsr-1.1/resources/fonts/Noto-CJK-LICENSE.txt"] },
  { id: "community.jira", folder: "jira", files: ["litzio-plugin.json", "package.json", "host.js", "icon.svg", "LICENSE-icon.txt"] },
];
const root = new URL(import.meta.url.endsWith(".ts") ? "../../../../community-plugins/" : "./community-plugins/", import.meta.url);
export const designatedPluginDirectories = () => DESIGNATED_COMMUNITY_PLUGINS.map(item => ({ id: item.id, directory: fileURLToPath(new URL(`${item.folder}/`, root)) }));

export function assertDesignatedPluginPayload(buildDirectory: string) {
  for (const item of DESIGNATED_COMMUNITY_PLUGINS) for (const file of item.files) {
    if (!existsSync(path.join(buildDirectory, "community-plugins", item.folder, file))) throw new Error(`The CLI build has no designated community payload: ${item.id}/${file}`);
  }
}
