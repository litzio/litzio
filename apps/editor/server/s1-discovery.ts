// Unmerged #834 S1. Deliberately no crash recovery or installation integration.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

export const S1_PROTOCOL = "s1-1";
export type S1Instance = { pid: number; startedAt: string; instance: string; url: string; token: string };
export function s1Directory(): string {
  const value = process.env.LITZIO_S1_DIR;
  if (!value || !path.isAbsolute(value)) throw new Error("S1 requires an absolute LITZIO_S1_DIR under the OS temporary directory.");
  const relative = path.relative(fs.realpathSync(os.tmpdir()), path.resolve(value));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("S1 data must be in a dedicated temporary directory.");
  fs.mkdirSync(value, { recursive: true, mode: 0o700 });
  const real = fs.realpathSync(value);
  const realRelative = path.relative(fs.realpathSync(os.tmpdir()), real);
  if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) throw new Error("S1 directory escapes temporary storage.");
  if (process.platform === "win32") {
    const user = execFileSync("whoami", [], { encoding: "utf8", windowsHide: true }).trim();
    execFileSync("icacls", [real, "/inheritance:r", "/grant:r", `${user}:(OI)(CI)F`], { stdio: "ignore", windowsHide: true });
  } else fs.chmodSync(real, 0o700);
  return real;
}
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export function readS1(directory: string): S1Instance | undefined {
  try { return JSON.parse(fs.readFileSync(path.join(directory, "instance.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
}
export async function s1Request(instance: S1Instance, route: string, body?: unknown) {
  const response = await fetch(instance.url + route, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${instance.token}`, Origin: instance.url, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));
  return result;
}
export async function s1Health(instance: S1Instance) {
  const health = await s1Request(instance, "/s1/health");
  if (health.instance !== instance.instance || health.pid !== instance.pid || health.startedAt !== instance.startedAt) throw new Error("Daemon identity changed; refusing this discovery record.");
  return health;
}
export async function stopS1(instance: S1Instance, confirm = false) {
  const directory = s1Directory();
  await s1Request(instance, "/s1/stop", { instance: instance.instance, confirm });
  for (let i = 0; i < 100; i++) {
    if (readS1(directory)?.instance !== instance.instance) return;
    await delay(100);
  }
  throw new Error("Daemon shutdown was not confirmed.");
}
export async function ensureS1(cli: string, version: string, log: (message: string) => void) {
  const directory = s1Directory();
  let instance = readS1(directory);
  if (!instance) {
    const fd = fs.openSync(path.join(directory, "daemon.log"), "a", 0o600);
    try {
      const child = spawn(process.execPath, [cli, "daemon", "s1-run"], {
        detached: true, windowsHide: true, stdio: ["ignore", fd, fd],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", LITZIO_S1_PRODUCT: version },
      });
      child.on("error", error => log(`S1 child error: ${String(error)}`));
      child.unref();
    } finally { fs.closeSync(fd); }
    for (let i = 0; i < 150 && !instance; i++) { await delay(100); instance = readS1(directory); }
    if (!instance) throw new Error(`S1 startup failed. Inspect ${path.join(directory, "daemon.log")}; stale locks are not automatically removed.`);
  }
  const health = await s1Health(instance);
  if (health.protocolVersion !== (process.env.LITZIO_S1_CLIENT_PROTOCOL ?? S1_PROTOCOL)) {
    throw new Error(`Daemon protocol ${health.protocolVersion} is incompatible. Stop it explicitly and start a matching daemon.`);
  }
  if (health.productVersion !== version) {
    log(`WARNING: daemon ${health.productVersion}, Desktop ${version}; keeping connection. Restart choice: LITZIO_S1_RESTART=1; confirmation LITZIO_S1_CONFIRM_RESTART=1 (clients=${health.clients}, jobs may be running).`);
    if (process.env.LITZIO_S1_RESTART === "1") {
      if (process.env.LITZIO_S1_CONFIRM_RESTART !== "1") throw new Error("Restart needs explicit confirmation: other clients or jobs may be interrupted. Set LITZIO_S1_CONFIRM_RESTART=1.");
      await stopS1(instance, true);
      return ensureS1(cli, version, log);
    }
  }
  log(`S1 connected pid=${instance.pid} instance=${instance.instance} url=${instance.url}`);
  return instance;
}
