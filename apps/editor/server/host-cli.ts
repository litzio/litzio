import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import type { HostRun } from "./host-paths.ts";

export type HostCli = { bin: string; args: string[] };
declare const __LITZIO_CLI_BUILD__: unknown;

/** Known Host build locations, never a PATH lookup for a potentially different installation. */
export function hostCli(run: HostRun = {}): HostCli {
  if (run.cli) return run.cli;
  if (typeof __LITZIO_CLI_BUILD__ !== "undefined") return { bin: process.execPath, args: [fileURLToPath(new URL("./cli.mjs", import.meta.url))] };
  const root = run.checkoutRoot ?? fileURLToPath(new URL("../../../", import.meta.url));
  return { bin: process.execPath, args: ["--import", pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href, path.join(root, "packages/cli/src/cli.ts")] };
}

