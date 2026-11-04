import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { brand } from "../../../brand.ts";
import { DAEMON_PROTOCOL, sameInstance, type DaemonHealth, type DaemonIdentity } from "./daemon-protocol.ts";

export type DaemonRecord = DaemonHealth & { url: string };
export type DaemonChannel = "stable" | "beta" | "development";
export function daemonUser(): string {
  if (process.platform !== "win32") return `uid:${os.userInfo().uid}`;
  const result = execFileSync("whoami", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true });
  const sid = result.match(/"(S-1-(?:\d+-)+\d+)"\s*$/)?.[1];
  if (!sid) throw new Error("Cannot determine the Windows user SID for the daemon origin.");
  return `sid:${sid}`;
}

/** Stable user slots below the dynamic-port range; never probe or silently select a new origin. */
export function daemonPort(channel: DaemonChannel, user = daemonUser()): number {
  const slot = createHash("sha256").update(`${brand.appId}\0${user}`).digest().readUInt32BE(0) % 8192;
  return 20000 + slot * 3 + ({ stable: 0, beta: 1, development: 2 })[channel];
}
export const daemonDirectory = (channel: DaemonChannel) => path.join(process.env.LITZIO_DAEMON_DIR ?? path.join(os.homedir(), brand.folders.shared, "daemon"), channel);

/** OS process creation identity; an HTTP timeout is never evidence of a dead owner. */
export function processStart(pid: number): string | undefined {
  try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return; throw error; }
  if (process.platform === "win32") {
    const value = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' -ErrorAction Stop; if ($p) { $p.CreationDate.ToUniversalTime().Ticks }`], { encoding: "utf8", windowsHide: true }).trim();
    return value || undefined;
  }
  if (process.platform === "linux") {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      return `${fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()}:${stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]}`;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  }
  return execFileSync("ps", ["-p", String(pid), "-o", "lstart="], { encoding: "utf8" }).trim() || undefined;
}

/** Only start/reconnect calls this: no background restart and no process killing. */
export function reclaimStaleDaemon(directory: string): boolean {
  const lock = path.join(directory, "daemon.lock"), file = path.join(directory, "instance.json");
  let bytes: string;
  try { bytes = fs.readFileSync(lock, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  const owner = JSON.parse(bytes) as DaemonIdentity & { processStartedAt: string };
  if (!Number.isSafeInteger(owner.pid) || owner.pid < 1 || !owner.processStartedAt) throw new Error("Invalid daemon lock; inspect it before restarting.");
  if (processStart(owner.pid) === owner.processStartedAt) return false;
  const record = readDaemonRecord(directory);
  if (record && !sameInstance(record, owner)) throw new Error("Discovery and lock identity differ; refusing cleanup.");
  if (fs.readFileSync(lock, "utf8") !== bytes) throw new Error("Daemon lock changed during stale inspection.");
  if (record) fs.unlinkSync(file);
  fs.unlinkSync(lock);
  return true;
}

/** Keep instance records and locks private to the OS user; this is not HTTP authentication. */
export function prepareDaemonDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform === "win32") {
    const user = execFileSync("whoami", [], { encoding: "utf8", windowsHide: true }).trim();
    execFileSync("icacls", [directory, "/inheritance:r", "/grant:r", `${user}:(OI)(CI)F`], { stdio: "pipe", windowsHide: true });
  } else fs.chmodSync(directory, 0o700);
}

export function readDaemonRecord(directory: string): DaemonRecord | undefined {
  try {
    const record = JSON.parse(fs.readFileSync(path.join(directory, "instance.json"), "utf8"));
    if (!["desktop", "cli-start", "cli-run"].includes(record.launcher) || !Number.isSafeInteger(record.pid) || record.pid < 1 || typeof record.startedAt !== "string" || !Number.isFinite(Date.parse(record.startedAt)) ||
        typeof record.instanceId !== "string" || !record.instanceId ||
        ![record.processStartedAt, record.productVersion, record.protocolVersion, record.daemonHome, record.executable].every(value => typeof value === "string" && value.length > 0) ||
        !Array.isArray(record.roots) || !record.roots.every((root: unknown) => typeof root === "string") || typeof record.nonLoopback !== "boolean" ||
        (record.log !== undefined && typeof record.log !== "string") || !/^http:\/\/127\.0\.0\.1:\d+$/.test(record.url)) throw new Error("Invalid daemon discovery record.");
    return record;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
}

export function acquireDaemonLock(file: string, identity: DaemonIdentity): () => void {
  let fd: number;
  try { fd = fs.openSync(file, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Daemon lock exists. Inspect status/logs; never kill a process or remove a lock based only on its PID.");
    throw error;
  }
  try { fs.writeFileSync(fd, JSON.stringify(identity)); } finally { fs.closeSync(fd); }
  return () => {
    const current = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!sameInstance(current, identity)) throw new Error("Daemon lock ownership changed; refusing cleanup.");
    fs.unlinkSync(file);
  };
}

export async function daemonRpc(record: DaemonRecord, route: string, body?: unknown, protocol = DAEMON_PROTOCOL) {
  const response = await fetch(record.url + route, { method: body === undefined ? "GET" : "POST",
    headers: { "X-Litzio-Protocol": protocol, Origin: record.url, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Daemon request failed (${response.status}).`);
  return result;
}

export async function inspectDaemon(record: DaemonRecord, productVersion: string, warn: (message: string) => void = console.error): Promise<DaemonHealth> {
  let health: DaemonHealth;
  try { health = await daemonRpc(record, "/daemon/health") as DaemonHealth; }
  catch (error) { throw new Error(`Recorded daemon (pid ${record.pid}, ${record.url}) is not responding or incompatible: ${(error as Error).message}. Inspect its log; use the matching CLI to stop/restart it.`, { cause: error }); }
  if (!sameInstance(record, health)) throw new Error("Daemon identity changed; refusing this discovery record.");
  if (health.protocolVersion !== DAEMON_PROTOCOL) throw new Error("Daemon protocol mismatch. Use the CLI matching the running daemon to stop it, or Ctrl+C in its foreground terminal; then start the desired version.");
  if (health.productVersion !== productVersion) warn(`WARNING: daemon product ${health.productVersion}, client ${productVersion}. Connection retained; restart explicitly with daemon stop --confirm then daemon start. Other clients/jobs may be interrupted.`);
  return health;
}

export async function stopDaemon(record: DaemonRecord, productVersion: string): Promise<void> {
  await inspectDaemon(record, productVersion);
  await daemonRpc(record, "/daemon/stop", { ...record, confirm: true });
}
