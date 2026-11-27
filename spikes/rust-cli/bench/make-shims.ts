// Creates the two shipped launch shims for the benchmark, without touching PATH or the registry.
// Usage: pnpm exec tsx make-shims.ts <work-dir> <electron.exe> <cli.mjs>
// - assistant shim: the real assistantCliEnvironment() output (cmd -> Electron cli.cjs -> spawnSync Electron cli.mjs)
// - desktop shim: CLI_SHIM's lines with absolute paths instead of the app junction (cmd -> Electron cli.mjs)
// NOTE: the assistant shim directory contains a `runtime` junction to Electron's folder.
// Remove it with a non-recursive `rmdir` before deleting <work-dir>.
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { assistantCliEnvironment } from "../../../apps/editor/server/assistant-cli.ts";

const [work, electron, cli] = process.argv.slice(2).map(value => path.resolve(value));
const env = assistantCliEnvironment(path.join(work, "assistant-shim"), { bin: electron, args: [cli] }, {});
const desktop = path.join(work, "desktop-shim");
mkdirSync(desktop, { recursive: true });
writeFileSync(path.join(desktop, "litzio.cmd"), ["@echo off", "setlocal DisableDelayedExpansion", 'set "ELECTRON_RUN_AS_NODE=1"',
  `"${electron}" --disable-warning=DEP0040 "${cli}" %*`, "exit /b %errorlevel%", ""].join("\r\n"));
console.log(JSON.stringify({ assistantShim: env.LITZIO_ASSISTANT_CLI, desktopShim: path.join(desktop, "litzio.cmd") }));
