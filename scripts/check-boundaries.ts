import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
for (const base of ["apps/editor/src", "apps/editor/server", "apps/editor/shared", "apps/desktop/src", "packages/cli/src", "packages/core/src"]) {
  for (const file of fs.readdirSync(path.join(root, base), { recursive: true }).filter(name => /\.tsx?$/.test(name))) {
    const source = fs.readFileSync(path.join(root, base, file), "utf8");
    if (/@litzio\/(?:plugin-api|docling|ai-agent)|(?:from|import\()\s*["'][^"']*plugins\//.test(source)) throw new Error(`Removed plugin dependency: ${base}/${file}`);
    if (base === "packages/core/src" && /(?:from|import\()\s*["'](?:@tiptap|prosemirror|[^"']*apps\/editor)/.test(source)) throw new Error(`Core editor dependency: ${file}`);
  }
}
console.log("Core and official application boundaries passed.");
