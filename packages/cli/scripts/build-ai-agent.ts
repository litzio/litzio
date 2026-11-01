// First-party composition only. Runtime callers never import plugin implementations.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
export async function buildAiAgent(destination: string) {
  execFileSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../../../plugins/ai-agent/scripts/build.ts", import.meta.url)), path.resolve(destination)], { windowsHide: true, stdio: "pipe" });
}
if (import.meta.main) await buildAiAgent(fileURLToPath(new URL("../../../tmp/ai-agent-worker", import.meta.url)));
