// Spike benchmark: wall time of one CLI invocation per launch path.
// Usage (all paths absolute):
//   node bench.mjs <config.json> [runs]
// config: { electron, node, cli, rust, host, doc, greet, dataDir, resetDir, assistantShim, desktopShim }
// Every child gets LITZIO_DATA_DIR=<dataDir> and LITZIO_RESET_DIR=<resetDir>, so no user data folder is read or written.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
const runs = Number(process.argv[3] ?? 20);
const env = { ...process.env, LITZIO_DATA_DIR: config.dataDir, LITZIO_RESET_DIR: config.resetDir };
delete env.ELECTRON_RUN_AS_NODE;
const asNode = { ...env, ELECTRON_RUN_AS_NODE: "1" };

const commands = {
  "plugins-list": ["plugins", "list", "--host", config.host, "--json"],
  "operation-invoke": ["operation", "invoke", "sample-greet.greet", "--input", config.greet, "--host", config.host, "--json"],
  "local-write-statistics": ["local-write-statistics", "--host", config.host, "--json"],
  inspect: ["inspect", config.doc, "--format", "json"],
  check: ["check", config.doc, "--format", "json"],
  // Not read-only: takes the app-reset writer guard like every write command, but commits nothing.
  "edit-dry-run": ["update-title", config.doc, "--text", "Title", "--dry-run", "--format", "json"],
  version: ["--version"],
};
const hostCommands = new Set(["plugins-list", "operation-invoke", "local-write-statistics"]);

// Each launcher: (args) => [file, argv, env]. cmd.exe launchers mirror the shipped .cmd shims.
const launchers = {
  node: args => [config.node, [config.cli, ...args], env],
  electron: args => [config.electron, ["--disable-warning=DEP0040", config.cli, ...args], asNode],
  "desktop-shim": args => ["cmd.exe", ["/d", "/s", "/c", `"${[config.desktopShim, ...args].map(quote).join(" ")}"`], env],
  "assistant-shim": args => ["cmd.exe", ["/d", "/s", "/c", `"${[config.assistantShim, ...args].map(quote).join(" ")}"`], env],
  rust: args => [config.rust, args, env],
};
function quote(value) { return /[\s"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value; }

function once(launcher, args) {
  const [file, argv, childEnv] = launchers[launcher](args);
  const started = process.hrtime.bigint();
  const result = spawnSync(file, argv, { env: childEnv, windowsHide: true, windowsVerbatimArguments: file === "cmd.exe", encoding: "utf8" });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.status !== 0) throw new Error(`${launcher} ${args.join(" ")} exited ${result.status}: ${result.stderr || result.stdout}`);
  return ms;
}

/** Startup only: a no-op script in the same runtime. */
const empty = {
  node: () => [config.node, ["-e", "0"], env],
  electron: () => [config.electron, ["-e", "0"], asNode],
  cmd: () => ["cmd.exe", ["/d", "/c", "exit 0"], env],
};
function emptyOnce(name) {
  const [file, argv, childEnv] = empty[name]();
  const started = process.hrtime.bigint();
  const result = spawnSync(file, argv, { env: childEnv, windowsHide: true });
  if (result.status !== 0) throw new Error(`${name} empty exited ${result.status}`);
  return Number(process.hrtime.bigint() - started) / 1e6;
}

/** Host round trip without process start: the same requests from an already running process.
 * Connection: close gives each request a new connection, as a fresh CLI process has. */
async function httpOnce(name) {
  const origin = new URL(config.host).origin;
  const started = process.hrtime.bigint();
  if (name === "local-write-statistics") {
    await (await fetch(`${origin}/api/local-write-statistics`, { headers: { "X-Litzio-Protocol": "4", Connection: "close" } })).json();
  } else {
    const health = await fetch(`${origin}/daemon/health`, { headers: { "X-Litzio-Protocol": "4", Connection: "close" } });
    await health.json();
    const body = name === "plugins-list" ? { action: "list" }
      : { action: "invoke", operation: "sample-greet.greet", input: JSON.parse(readFileSync(config.greet, "utf8")) };
    await (await fetch(`${origin}/api/plugins`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Connection: "close" }, body: JSON.stringify(body) })).json();
  }
  return Number(process.hrtime.bigint() - started) / 1e6;
}

const stats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = q => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  return { n: sorted.length, median: +at(0.5).toFixed(1), p95: +at(0.95).toFixed(1), min: +sorted[0].toFixed(1) };
};

const samples = {};
const add = (key, ms) => (samples[key] ??= []).push(ms);
const cases = [];
for (const name of Object.keys(empty)) cases.push([`empty/${name}`, () => emptyOnce(name)]);
for (const launcher of ["node", "electron", "desktop-shim", "assistant-shim"]) {
  for (const command of Object.keys(commands)) cases.push([`${launcher}/${command}`, () => once(launcher, commands[command])]);
}
for (const command of hostCommands) cases.push([`rust/${command}`, () => once("rust", commands[command])]);

// Warm-up (discarded), then interleave cases round-robin so drift affects all equally.
for (const [, run] of cases) { run(); run(); }
for (const name of hostCommands) { await httpOnce(name); await httpOnce(name); }
for (let i = 0; i < runs; i++) {
  for (const [key, run] of cases) add(key, run());
  for (const name of hostCommands) add(`http-in-process/${name}`, await httpOnce(name));
}
const report = Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, stats(values)]));
const out = process.argv[4];
if (out) writeFileSync(out, JSON.stringify({ runs, report, raw: samples }, null, 2));
for (const [key, value] of Object.entries(report)) console.log(`${key.padEnd(40)} median ${String(value.median).padStart(7)}  p95 ${String(value.p95).padStart(7)}  min ${String(value.min).padStart(7)}`);
