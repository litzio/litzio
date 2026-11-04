import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_AI_SETTINGS, type AiExecutionSettings } from "../shared/ai.ts";
import { brand } from "../../../brand.ts";

declare const __LITZIO_CLI_BUILD__: unknown;
export type HostRun = { packaged?: boolean; checkoutRoot?: string; cli?: import("./assistant-cli.ts").AssistantCli };

/** Known source module location; bundled Desktop supplies its build/app-relative root. */
export function hostPaths(run: HostRun = {}, env: NodeJS.ProcessEnv = process.env) {
  const packaged = run.packaged ?? (typeof __LITZIO_CLI_BUILD__ !== "undefined");
  const base = env.LITZIO_DATA_DIR ?? (packaged ? path.join(os.homedir(), brand.folders.shared)
    : path.join(run.checkoutRoot ?? fileURLToPath(new URL("../../../", import.meta.url)), ".litzio-dev"));
  const data = process.platform === "win32" ? env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming")
    : process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support") : env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  return {
    aiDefaults: (packaged ? DEFAULT_AI_SETTINGS : { model: "gpt-6-luna", reasoningEffort: "low" }) as AiExecutionSettings,
    templates: path.join(base, "templates"),
    settingsFile: (id: string) => env[`LITZIO_${id.toUpperCase().replaceAll("-", "_")}_SETTINGS_FILE`] ?? path.join(base, `${id}.json`),
    agent: env.LITZIO_AI_AGENT_CWD ?? path.join(packaged ? path.join(data, brand.folders.desktopData) : base, "assistant"),
  };
}
