// "Cold Host": restart the isolated Host and time the FIRST CLI call after it is healthy.
// Usage: node cold.mjs <config.json> <restarts> <out.json>
// The Host runs under Electron-as-Node like the installed daemon; every data, daemon and
// reset-guard folder comes from the config (never the user's). Stopped through /daemon/stop.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
const restarts = Number(process.argv[3] ?? 6);
const port = new URL(config.host).port;
const base = { ...process.env, LITZIO_DATA_DIR: config.dataDir, LITZIO_RESET_DIR: config.resetDir, LITZIO_DAEMON_DIR: config.daemonDir };
delete base.ELECTRON_RUN_AS_NODE;
const plugins = ["plugins", "list", "--host", config.host, "--json"];
const clients = {
  "desktop-shim": () => ["cmd.exe", ["/d", "/s", "/c", `"${[config.desktopShim, ...plugins].map(v => /\s/.test(v) ? `"${v}"` : v).join(" ")}"`], true],
  rust: () => [config.rust, plugins, false],
};
const time = name => {
  const [file, argv, verbatim] = clients[name]();
  const started = process.hrtime.bigint();
  const result = spawnSync(file, argv, { env: base, windowsHide: true, windowsVerbatimArguments: verbatim, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${name}: ${result.stdout}${result.stderr}`);
  return Number(process.hrtime.bigint() - started) / 1e6;
};
const health = async () => {
  try { const r = await fetch(`${config.host}/daemon/health`, { headers: { "X-Litzio-Protocol": "4", Connection: "close" } }); return r.ok ? await r.json() : undefined; }
  catch { return undefined; }
};

const rows = [];
for (let i = 0; i < restarts; i++) {
  if (await health()) throw new Error("port already in use");
  const host = spawn(config.electron, ["--disable-warning=DEP0040", config.cli, "daemon", "run", "--root", path.dirname(config.doc), "--port", port],
    { env: { ...base, ELECTRON_RUN_AS_NODE: "1", LITZIO_ASSISTANT_CWD: config.assistantDir }, stdio: "ignore", windowsHide: true });
  const launched = Date.now();
  let identity;
  while (!(identity = await health())) { if (Date.now() - launched > 60_000) throw new Error("Host did not start"); await new Promise(r => setTimeout(r, 50)); }
  const order = i % 2 === 0 ? ["desktop-shim", "rust"] : ["rust", "desktop-shim"];
  const row = { restart: i + 1, hostReadyMs: Date.now() - launched, first: order[0] };
  for (const name of order) row[name] = +time(name).toFixed(1);
  rows.push(row);
  console.log(JSON.stringify(row));
  await fetch(`${config.host}/daemon/stop`, { method: "POST", headers: { "Content-Type": "application/json", "X-Litzio-Protocol": "4", Origin: config.host, Connection: "close" },
    body: JSON.stringify({ ...identity, confirm: true }) });
  await new Promise(resolve => host.once("exit", resolve));
}
writeFileSync(process.argv[4], JSON.stringify(rows, null, 2));
