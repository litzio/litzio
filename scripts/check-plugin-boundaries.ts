import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkPluginSources, sourceFiles, sourceImports } from "@litzio/plugin-api/build";

const root = fileURLToPath(new URL("../", import.meta.url));
checkPluginSources(path.join(root, "plugins/docling"));
for (const directory of ["apps/editor/src", "apps/editor/server", "apps/editor/shared", "apps/desktop/src", "packages/cli/src", "packages/core/src"]) {
  for (const file of sourceFiles(path.join(root, directory))) for (const name of sourceImports(file, file === path.join(root, "apps/editor/src/plugin-ui.tsx"))) {
    if (/^@litzio\/docling(?:\/|$)/u.test(name) || /(?:plugins|packages)[\\/]docling(?:[\\/]|$)/u.test(name)) {
      throw new Error(`Application/Host/CLI cannot import Docling directly: ${path.relative(root, file)}: ${name}`);
    }
  }
}
console.log("Plugin and application import boundaries passed.");
