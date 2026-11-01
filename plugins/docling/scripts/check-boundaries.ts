import path from "node:path";
import { sourceFiles, sourceImports } from "@litzio/plugin-api/build";

/** Feature modules may use only themselves, shared formats and public packages.
 * Composition belongs to the plugin entry points, never to another feature. */
export function checkFeatureBoundaries(source: string) {
  for (const area of ["conversion", "comparison", "shared"]) for (const file of sourceFiles(path.join(source, area))) {
    for (const name of sourceImports(file)) {
      if (!name.startsWith(".")) continue;
      const resolved = path.resolve(path.dirname(file), name);
      const resource = path.relative(path.dirname(source), resolved).split(path.sep)[0];
      if (area === "conversion" && ["profiles", "schema"].includes(resource) && resolved.endsWith(".json")) continue;
      const target = path.relative(source, resolved).split(path.sep)[0];
      if (target !== area && target !== "shared") throw new Error(`Docling ${area} cannot import ${name}: use shared file formats.`);
    }
  }
}
