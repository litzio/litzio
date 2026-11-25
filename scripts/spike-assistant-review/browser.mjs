import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isolatedHostEnvironment } from "../../test/helpers/isolated-host-environment.ts";
import { DAEMON_PROTOCOL } from "../../apps/editor/shared/daemon-version.ts";

const dir = path.resolve("tmp/assistant-review");
const browser = path.join(dir, "browser");
mkdirSync(browser, { recursive: true });
const stage = mkdtempSync(path.join(browser, "copies-"));
const names = process.argv.slice(2);
const entries = [];
for (const name of names.length ? names : ["baseline", ...readdirSync(path.join(dir, "runs"))]) {
  const state = path.join(dir, "runs", name, "state.json");
  const before = path.join(dir, "baseline/LSR-1.1-standards/LSR-1.1-standards.md");
  if (name !== "baseline" && !existsSync(state)) continue;
  const source = name === "baseline" ? before : JSON.parse(readFileSync(state, "utf8")).document;
  if (!existsSync(source)) continue;
  const folder = path.join(stage, name);
  if (existsSync(folder)) throw Error("Use a fresh browser staging folder.");
  cpSync(path.dirname(source), folder, { recursive: true });
  entries.push({ name, file: path.join(folder, path.basename(source)), output: path.join(browser, name) });
}
const scenario = "spike-assistant-review";
const testFile = path.resolve("apps/editor/test", scenario + ".browser.js");
const template = readFileSync(new URL("./browser-scenario.js", import.meta.url), "utf8");
writeFileSync(testFile, template.replace("__REVIEW_ENTRIES__", () => JSON.stringify(entries)), { flag: "wx" });
const root = mkdtempSync(path.join(os.tmpdir(), "litzio-review-browser-"));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^LITZIO_/i.test(key)));
Object.assign(env, isolatedHostEnvironment(root));
const socket = net.createServer().listen(0, "127.0.0.1");
await once(socket, "listening");
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const url = "http://127.0.0.1:" + port;
const cli = path.resolve("packages/cli/dist/cli.mjs");
const host = spawn(process.execPath, [cli, "daemon", "run", "--root", stage, "--port", String(port)], {
  env, cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
const alive = () => host.exitCode === null && host.signalCode === null;
const exited = once(host, "exit");
let log = "";
host.stdout.on("data", c => { log += c; });
host.stderr.on("data", c => { log += c; });
const healthRequest = () => fetch(url + "/daemon/health", { headers: { "x-litzio-protocol": DAEMON_PROTOCOL } }).then(r => r.json());
try {
  for (let i = 0; !log.includes("HTTP:"); i++) {
    if (!alive() || i === 120) throw Error("Visual Host did not start.");
    await delay(250);
  }
  const health = await healthRequest();
  if (health.pid !== host.pid) throw Error("Visual Host identity mismatch.");
  const runner = spawn("pnpm browser:test " + scenario, { shell: true, env: { ...env, LITZIO_BROWSER_URL: url }, windowsHide: true, stdio: "inherit" });
  const [code] = await once(runner, "exit");
  process.exitCode = code ?? 1;
} finally {
  try {
    if (alive()) {
      const health = await healthRequest();
      if (health.pid !== host.pid) throw Error("Visual Host identity mismatch.");
      await fetch(url + "/daemon/stop", {
        method: "POST", headers: { Origin: url, "Content-Type": "application/json", "x-litzio-protocol": DAEMON_PROTOCOL },
        body: JSON.stringify({ ...health, confirm: true }), signal: AbortSignal.timeout(10_000),
      });
      await Promise.race([exited, delay(10_000, undefined, { ref: false })]);
    }
  } finally {
    if (alive()) {
      if (process.platform === "win32") execFileSync("taskkill.exe", ["/PID", String(host.pid), "/T", "/F"], { windowsHide: true });
      else host.kill();
      await exited;
    }
    unlinkSync(testFile);
    writeFileSync(path.join(browser, "host.log"), log);
  }
}
