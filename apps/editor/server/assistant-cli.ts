import { hostPaths } from "./host-paths.ts";
import { mkdirSync, writeFileSync, lstatSync, readlinkSync, unlinkSync, symlinkSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { brand } from "../../../brand.ts";

export { hostCli, type HostCli as AssistantCli } from "./host-cli.ts";
import type { HostCli as AssistantCli } from "./host-cli.ts";

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
  const env: NodeJS.ProcessEnv = { ...inherited, LITZIO_PLUGINS: hostPaths().plugins, LITZIO_ASSISTANT_CWD: cwd, LITZIO_ASSISTANT_CLI: path.resolve(directory, brand.cliCommand + (process.platform === "win32" ? ".cmd" : "")) };
  const key = Object.keys(env).find(key => key.toUpperCase() === "PATH") ?? "PATH";
  env[key] = directory + path.delimiter + (env[key] ?? "");
  return env;
}
