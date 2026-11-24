// Spike experiment 2: runs the real Copilot CLI with the same home isolation the pi wrapper uses (HOME/USERPROFILE
// pointed at a temporary folder), so neither engine reads the user's ~/.agents/skills or home instruction files.
// The Host launches `node copilot-home-wrapper.mjs <copilot args>` through LITZIO_SPIKE_PI_ACP; arguments, stdio and
// the Host's environment (COPILOT_PROVIDER_*, COPILOT_MODEL) pass through unchanged.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const home = process.env.SPIKE_COPILOT_HOME;
if (!home) { console.error("SPIKE_COPILOT_HOME is required"); process.exit(2); }
mkdirSync(home, { recursive: true });
const bin = process.env.SPIKE_COPILOT_BIN ?? (process.env.PATH ?? "").split(path.delimiter).map(d => path.join(d.replace(/^"|"$/g, ""), "copilot.exe")).find(existsSync);
if (!bin) { console.error("copilot.exe not found"); process.exit(2); }
const child = spawn(bin, process.argv.slice(2), { stdio: "inherit", windowsHide: true, env: { ...process.env, HOME: home, USERPROFILE: home } });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
