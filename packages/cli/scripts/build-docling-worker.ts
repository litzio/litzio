// First-party bundle composition only. Plugin sources/tooling remain plugin-owned.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAiAgent } from "./build-ai-agent.ts";
export { buildPluginUi } from "@litzio/plugin-api/build";
export async function buildDoclingWorker(destination: string) {
  execFileSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../../../plugins/docling/scripts/build.ts", import.meta.url)), path.resolve(destination)], { windowsHide: true, stdio: "pipe" });
}
// Source-checkout CLI commands also have their default-included plugin ready.
if (import.meta.main) {
  await buildDoclingWorker(fileURLToPath(new URL("../../../tmp/docling-worker", import.meta.url)));
  await buildAiAgent(fileURLToPath(new URL("../../../tmp/ai-agent-worker", import.meta.url)));
}
