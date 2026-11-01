import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { buildPluginUi, checkPluginSources } from "@litzio/plugin-api/build";
import { PLUGIN_UI } from "@litzio/plugin-api/config";
import { AI_TASK } from "@litzio/plugin-api/ai";

export async function buildPlugin(destination: string) {
  checkPluginSources(fileURLToPath(new URL("../", import.meta.url)));
  mkdirSync(destination, { recursive: true });
  for (const entry of ["host", "worker"]) {
    const result = await build({ entryPoints: [fileURLToPath(new URL(`../src/${entry}.ts`, import.meta.url))], bundle: true,
      platform: "node", format: "cjs", target: "node24", write: false, logLevel: "warning" });
    writeFileSync(path.join(destination, `${entry}.cjs`), result.outputFiles[0].contents);
  }
  await buildPluginUi(fileURLToPath(new URL("../src/ui.tsx", import.meta.url)), destination);
  writeFileSync(path.join(destination, "manifest.json"), JSON.stringify({ id: AI_TASK.plugin,
    version: createHash("sha256").update("ai-task-v1").digest("hex"), workerApi: 1, entry: "worker.cjs", tasks: [AI_TASK.service],
    services: [AI_TASK.service], host: { api: 1, entry: "host.cjs" }, routes: [AI_TASK.route, AI_TASK.statusRoute],
    ui: { api: PLUGIN_UI.api, reactMajor: PLUGIN_UI.reactMajor, script: PLUGIN_UI.script },
  }, null, 2) + "\n");
}
if (import.meta.main) await buildPlugin(path.resolve(process.argv[2] ?? "dist"));
