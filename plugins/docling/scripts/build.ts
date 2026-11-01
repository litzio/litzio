import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { PLUGIN_UI } from "@litzio/plugin-api/config";
import { buildPluginUi, checkPluginSources } from "@litzio/plugin-api/build";
import { checkFeatureBoundaries } from "./check-boundaries.ts";

/** A self-contained trusted worker, also shipped beside the relocatable CLI. */
export async function buildPlugin(destination: string) {
  checkPluginSources(fileURLToPath(new URL("../", import.meta.url)));
  checkFeatureBoundaries(fileURLToPath(new URL("../src", import.meta.url)));
  mkdirSync(destination, { recursive: true });
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../src/worker.ts", import.meta.url))],
    bundle: true, platform: "node", format: "cjs", target: "node24", write: false,
    legalComments: "inline", logLevel: "warning",
  });
  const bytes = result.outputFiles[0].contents;
  writeFileSync(path.join(destination, "worker.cjs"), bytes);
  const host = await build({ entryPoints: [fileURLToPath(new URL("../src/host.ts", import.meta.url))], bundle: true, platform: "node", format: "cjs", target: "node24", write: false, logLevel: "warning" });
  writeFileSync(path.join(destination, "host.cjs"), host.outputFiles[0].contents);
  await buildPluginUi(fileURLToPath(new URL("../src/ui-plugin.tsx", import.meta.url)), destination);
  writeFileSync(path.join(destination, "manifest.json"), JSON.stringify({
    id: "docling", version: createHash("sha256").update(bytes).digest("hex"),
    workerApi: 1, entry: "worker.cjs", host: { api: 1, entry: "host.cjs" },
    routes: ["/api/docling-settings", "/api/docling-check", "/api/docling-conversion", "/api/docling-compare", "/api/docling-dashboard", "/api/docling-features", "/api/docling-history"],
    ui: { api: PLUGIN_UI.api, reactMajor: PLUGIN_UI.reactMajor, script: PLUGIN_UI.script, style: PLUGIN_UI.style, jobRoute: "api/docling-conversion" },
  }, null, 2) + "\n");
}

if (import.meta.main) await buildPlugin(path.resolve(process.argv[2] ?? "dist"));
