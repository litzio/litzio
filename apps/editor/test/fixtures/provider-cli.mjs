// Fake installed provider CLI: --version, --help and its own `update`; other arguments run the given provider fixture.
// The state file holds { version, help, update: "ok" | "fail" | "hang", next, updates }.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const [stateFile, command, ...rest] = process.argv.slice(2);
const state = JSON.parse(readFileSync(stateFile, "utf8"));
if (command === "--version") process.stdout.write(`codex-cli ${state.version}\n`);
else if (command === "--help") process.stdout.write(`Usage: cli [OPTIONS]\n\nCommands:\n  exec    Run\n${state.help === false ? "" : "  update  Update to the latest version\n"}`);
else if (command === "update") {
  writeFileSync(stateFile, JSON.stringify({ ...state, updates: (state.updates ?? 0) + 1 }));
  if (state.update === "hang") setInterval(() => {}, 60_000);
  else if (state.update === "fail") { process.stdout.write("Checking for updates...\n"); process.stderr.write("\x1b[31merror:\x1b[0m release download failed\n"); process.exitCode = 3; }
  else {
    writeFileSync(stateFile, JSON.stringify({ ...state, updates: (state.updates ?? 0) + 1, version: state.next ?? state.version }));
    process.stdout.write(`Updated to ${state.next ?? state.version}\n`);
  }
} else {
  const child = spawn(process.execPath, [command, ...rest], { stdio: "inherit" });
  child.on("exit", code => process.exit(code ?? 1));
}
