import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { brand } from "../../../brand.ts";
import { DAEMON_PROTOCOL, sameInstance, type DaemonHealth, type DaemonIdentity } from "./daemon-protocol.ts";

export type DaemonRecord = DaemonIdentity & { url: string };
export type DaemonChannel = "stable" | "beta" | "development";
export const daemonPort = (channel: DaemonChannel) => ({ stable: 43127, beta: 43128, development: 43129 })[channel];
export const daemonDirectory = (channel: DaemonChannel) => path.join(process.env.LITZIO_DAEMON_DIR ?? path.join(os.homedir(), brand.folders.shared, "daemon"), channel);

/** Tokens inherit only this user's directory permissions (POSIX mode or Windows ACL). */
export function prepareDaemonDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform === "win32") {
    const user = execFileSync("whoami", [], { encoding: "utf8", windowsHide: true }).trim();
    execFileSync("icacls", [directory, "/inheritance:r", "/grant:r", `${user}:(OI)(CI)F`], { stdio: "pipe", windowsHide: true });
  } else fs.chmodSync(directory, 0o700);
}

export function daemonToken(directory: string): string {
  const file = path.join(directory, "token");
  if (!fs.existsSync(file)) {
    const temp = path.join(directory, `${randomUUID()}.token.tmp`);
    fs.writeFileSync(temp, randomBytes(32).toString("base64url"), { flag: "wx", mode: 0o600 });
    try { fs.linkSync(temp, file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    finally { fs.unlinkSync(temp); }
  }
  const token = fs.readFileSync(file, "utf8");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Invalid daemon token file; inspect it before restarting.");
  return token;
}

export function readDaemonRecord(directory: string): DaemonRecord | undefined {
  try {
    const record = JSON.parse(fs.readFileSync(path.join(directory, "instance.json"), "utf8"));
    if (!Number.isSafeInteger(record.pid) || record.pid < 1 || typeof record.startedAt !== "string" || !Number.isFinite(Date.parse(record.startedAt)) ||
        typeof record.instanceId !== "string" || !record.instanceId || !/^http:\/\/127\.0\.0\.1:\d+$/.test(record.url)) throw new Error("Invalid daemon discovery record.");
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

export async function daemonRpc(record: DaemonRecord, token: string, route: string, body?: unknown, protocol = DAEMON_PROTOCOL) {
  const response = await fetch(record.url + route, { method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "X-Litzio-Protocol": protocol, Origin: record.url, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Daemon request failed (${response.status}).`);
  return result;
}

export async function inspectDaemon(record: DaemonRecord, token: string, productVersion: string, warn: (message: string) => void = console.error): Promise<DaemonHealth> {
  const health = await daemonRpc(record, token, "/daemon/health") as DaemonHealth;
  if (!sameInstance(record, health)) throw new Error("Daemon identity changed; refusing this discovery record.");
  if (health.protocolVersion !== DAEMON_PROTOCOL) throw new Error("Daemon protocol mismatch. Explicitly stop and start a matching daemon.");
  if (health.productVersion !== productVersion) warn(`WARNING: daemon product ${health.productVersion}, client ${productVersion}. Connection retained; restart explicitly with daemon stop --confirm then daemon start. Other clients/jobs may be interrupted.`);
  return health;
}

export async function stopDaemon(record: DaemonRecord, token: string, productVersion: string): Promise<void> {
  await inspectDaemon(record, token, productVersion);
  await daemonRpc(record, token, "/daemon/stop", { ...record, confirm: true });
}
