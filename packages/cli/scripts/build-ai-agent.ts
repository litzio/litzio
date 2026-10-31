import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { PLUGIN_UI } from "@litzio/plugin-api/config";
import { buildPluginUi } from "./build-docling-worker.ts";

/** Local spike bundle only. No installer or packaging changes. */
export async function buildAiAgent(destination: string) {
  mkdirSync(destination, { recursive: true });
  await build({ entryPoints: [fileURLToPath(new URL("../../../plugins/ai-agent/worker.ts", import.meta.url))],
    outfile: path.join(destination, "worker.cjs"), bundle: true, platform: "node", format: "cjs", target: "node24", logLevel: "warning" });
  await buildPluginUi(fileURLToPath(new URL("../../../plugins/ai-agent/ui.tsx", import.meta.url)), destination);
  writeFileSync(path.join(destination, "manifest.json"), JSON.stringify({ id: "ai-agent", version: "proposal-spike-1", workerApi: 2, entry: "worker.cjs",
    ui: { api: PLUGIN_UI.api, reactMajor: PLUGIN_UI.reactMajor, script: PLUGIN_UI.script, style: PLUGIN_UI.style } }, null, 2) + "\n");
}
