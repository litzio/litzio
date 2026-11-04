import { mkdirSync, writeFileSync, lstatSync, readlinkSync, unlinkSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { brand } from "../../../brand.ts";
import type { HostRun } from "./host-paths.ts";

export type AssistantCli = { bin: string; args: string[] };
declare const __LITZIO_CLI_BUILD__: unknown;

/** Known Host build locations, never a PATH lookup for a potentially different installation. */
export function hostCli(run: HostRun = {}): AssistantCli {
  if (run.cli) return run.cli;
  if (typeof __LITZIO_CLI_BUILD__ !== "undefined") return { bin: process.execPath, args: [fileURLToPath(new URL("./cli.mjs", import.meta.url))] };
  const root = run.checkoutRoot ?? fileURLToPath(new URL("../../../", import.meta.url));
  return { bin: process.execPath, args: ["--import", pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href, path.join(root, "packages/cli/src/cli.ts")] };
}

/** Private launch shim: no registry, user/system PATH or optional Desktop integration changes. */
export function assistantCliEnvironment(cwd: string, cli: AssistantCli, inherited: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  // Desktop and HTTP may share an assistant cwd but must retain their own CLI/runtime.
  const identity = createHash("sha256").update(JSON.stringify(cli)).digest("hex").slice(0, 16);
  const directory = path.join(cwd, "bin", identity), runtime = path.join(directory, "runtime");
  mkdirSync(directory, { recursive: true });
  const entry = lstatSync(runtime, { throwIfNoEntry: false });
  if (entry && !entry.isSymbolicLink()) throw new Error("Assistant CLI runtime must be a link.");
  if (entry && path.resolve(readlinkSync(runtime)) !== path.dirname(cli.bin)) unlinkSync(runtime);
  if (!lstatSync(runtime, { throwIfNoEntry: false })) symlinkSync(path.dirname(cli.bin), runtime, process.platform === "win32" ? "junction" : "dir");
  // JS carries Unicode paths/arguments; the Windows batch source contains no absolute paths.
  writeFileSync(path.join(directory, "cli.cjs"), `const { spawnSync } = require("node:child_process");\nconst result = spawnSync(${JSON.stringify(cli.bin)}, [...${JSON.stringify(cli.args)}, ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });\nif (result.error) { console.error(result.error.message); process.exitCode = 1; } else process.exitCode = result.status ?? 1;\n`);
  const binary = path.basename(cli.bin);
  if (process.platform === "win32") writeFileSync(path.join(directory, `${brand.cliCommand}.cmd`), `@echo off\r\nsetlocal DisableDelayedExpansion\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"%~dp0runtime\\${binary}" "%~dp0cli.cjs" %*\r\nexit /b %errorlevel%\r\n`);
  else writeFileSync(path.join(directory, brand.cliCommand), `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec "$(dirname "$0")/runtime/${binary}" "$(dirname "$0")/cli.cjs" "$@"\n`, { mode: 0o755 });
  const env = { ...inherited };
  const key = Object.keys(env).find(key => key.toUpperCase() === "PATH") ?? "PATH";
  env[key] = directory + path.delimiter + (env[key] ?? "");
  return env;
}
