import { exactHttpOrigin } from "../shared/http-origin.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { brand } from "../../../brand.ts";
import { processStart } from "./daemon-state.ts";
import type { HostWorkSummary } from "../shared/desktop-bridge.ts";
import { DAEMON_PROTOCOL } from "./daemon-protocol.ts";

export class RemoteHostRefusal extends Error {}
export type RemoteHost = { hostId: string; origin: string; label: string };
export const remoteHostsFile = () => path.join(process.env.LITZIO_DATA_DIR ?? path.join(os.homedir(), brand.folders.shared), "desktop", "remote-hosts.json");

export function remoteHostOrigin(value: string): string {
  try { return exactHttpOrigin(value); } catch (error) { throw new RemoteHostRefusal((error as Error).message); }
}
function labelText(value: string): string {
  if (!value.trim() || /[\x00-\x1f\x7f]/.test(value)) throw new RemoteHostRefusal("Expected a nonempty label without control characters.");
  return value.trim();
}

type DesktopWorkOwner = { pid: number; processStartedAt: string; summary: HostWorkSummary[] | null };
type DesktopWorkOwners = Record<string, DesktopWorkOwner>;
let desktopProcessStartedAt: string | undefined;
const desktopOwnerId = (userData: string) => {
  const profile = path.resolve(userData);
  return createHash("sha256").update(process.platform === "win32" ? profile.toLowerCase() : profile).digest("hex");
};

/** Desktop-local operations shared by CLI and Desktop settings. No daemon control. */
export class RemoteHostRegistry {
  private startedProfiles = new Set<string>();
  constructor(readonly file = remoteHostsFile()) {}
  list(): RemoteHost[] {
    let source: string;
    try { source = fs.readFileSync(this.file, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const rows: unknown = JSON.parse(source);
    if (!Array.isArray(rows)) throw new Error("Invalid remote Host registry.");
    const ids = new Set<string>(), origins = new Set<string>();
    return rows.map(row => {
      if (!row || typeof row.hostId !== "string" || !row.hostId || typeof row.origin !== "string" || typeof row.label !== "string" || remoteHostOrigin(row.origin) !== row.origin || labelText(row.label) !== row.label || ids.has(row.hostId) || origins.has(row.origin)) throw new Error("Invalid remote Host registry.");
      ids.add(row.hostId); origins.add(row.origin);
      return { hostId: row.hostId, origin: row.origin, label: row.label };
    });
  }
  private change<T>(operation: (rows: RemoteHost[]) => T): T {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const lock = this.file + ".lock", temporary = this.file + "." + randomUUID() + ".tmp";
    const processStartedAt = desktopProcessStartedAt ??= processStart(process.pid);
    if (!processStartedAt) throw new Error("Cannot identify registry lock owner.");
    let fd;
    try { fd = fs.openSync(lock, "wx", 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const bytes = fs.readFileSync(lock, "utf8"), owner = JSON.parse(bytes);
      if (!Number.isSafeInteger(owner.pid) || owner.pid < 1 || typeof owner.processStartedAt !== "string" || !owner.processStartedAt) throw new RemoteHostRefusal("Invalid registry lock owner; inspect the lock before changing registrations.");
      if (processStart(owner.pid) === owner.processStartedAt) throw new RemoteHostRefusal("Registry is being changed by a live owner; retry after it finishes.");
      throw new RemoteHostRefusal(`Registry lock owner has exited: ${lock}. Inspect the lock, delete it after verification, then retry.`);
    }
    try {
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, processStartedAt }));
      const rows = this.list(), result = operation(rows);
      fs.writeFileSync(temporary, JSON.stringify(rows, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      fs.renameSync(temporary, this.file);
      return result;
    } finally { fs.rmSync(temporary, { force: true }); fs.closeSync(fd); fs.unlinkSync(lock); }
  }
  desktopWorkFile(userData: string): string {
    const started = desktopProcessStartedAt ??= processStart(process.pid);
    if (!started) throw new RemoteHostRefusal("Cannot identify the Desktop process creation time.");
    return path.join(this.file + ".work", `${desktopOwnerId(userData)}.${process.pid}.${encodeURIComponent(started)}.json`);
  }
  private workIdentity(name: string) {
    const match = /^([a-f0-9]{64})\.(\d+)\.(.+)\.json$/.exec(name);
    if (!match || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) < 1) throw new Error("Invalid Desktop owner filename.");
    return { ownerId: match[1], pid: Number(match[2]), processStartedAt: decodeURIComponent(match[3]) };
  }
  private readWorkOwner(file: string): DesktopWorkOwner {
    const owner = JSON.parse(fs.readFileSync(file, "utf8")) as DesktopWorkOwner;
    if (!owner || !Number.isSafeInteger(owner.pid) || owner.pid < 1 || typeof owner.processStartedAt !== "string" || !owner.processStartedAt ||
      !(owner.summary === null || (Array.isArray(owner.summary) && owner.summary.every(row => row && typeof row.hostId === "string" && row.hostId && Number.isSafeInteger(row.openWork) && row.openWork >= 0 && Number.isSafeInteger(row.recovery) && row.recovery >= 0) && new Set(owner.summary.map(row => row.hostId)).size === owner.summary.length))) throw new Error("Invalid Desktop owner summary.");
    return owner;
  }
  private workOwners(): DesktopWorkOwners {
    const owners: DesktopWorkOwners = {};
    try {
      for (const name of fs.readdirSync(this.file + ".work")) {
        // Interrupted temporary siblings are never committed summaries or locks.
        if (/\.json\.[a-f0-9-]+\.tmp$/.test(name)) continue;
        const identity = this.workIdentity(name);
        const owner = this.readWorkOwner(path.join(this.file + ".work", name));
        if (identity.pid !== owner.pid || identity.processStartedAt !== owner.processStartedAt) throw new Error("Desktop owner identity differs from its filename.");
        owners[name] = owner;
      }
    } catch (error) { throw new RemoteHostRefusal("Desktop owner summaries cannot be read. Open each Desktop profile to inspect and recover its own summary.", { cause: error }); }
    return owners;
  }
  /** Publish this run before touching old entries; a locked previous summary cannot hide us. */
  desktopWork(userData: string, summary: HostWorkSummary[] | null, warn: (message: string) => void = () => {}) {
    const file = this.desktopWorkFile(userData);
    const identity = { pid: process.pid, processStartedAt: desktopProcessStartedAt! };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!this.startedProfiles.has(file)) {
      fs.writeFileSync(file, JSON.stringify({ ...identity, summary: null }), { flag: "wx", mode: 0o600 });
      this.startedProfiles.add(file);
      // Only this profile's next run retires dead entries. A failed cleanup is conservative:
      // the new live entry already exists, and the old summary still protects recovery.
      for (const name of fs.readdirSync(path.dirname(file))) {
        if (!name.startsWith(desktopOwnerId(userData) + ".") || name === path.basename(file) || name.endsWith(".tmp")) continue;
        try {
          const previous = this.workIdentity(name);
          if (processStart(previous.pid) !== previous.processStartedAt) fs.unlinkSync(path.join(path.dirname(file), name));
        } catch (error) { warn(`Previous Desktop work entry retained: ${String(error)}`); }
      }
      if (summary === null) return;
    }
    const temporary = file + "." + randomUUID() + ".tmp";
    try {
      fs.writeFileSync(temporary, JSON.stringify({ ...identity, summary }), { flag: "wx", mode: 0o600 });
      fs.renameSync(temporary, file);
    } finally { fs.rmSync(temporary, { force: true }); }
  }
  cliRemovalProof(hostId: string) { return this.ownerRemovalProof(hostId); }
  desktopRemovalProof(hostId: string, userData: string) { return this.ownerRemovalProof(hostId, path.basename(this.desktopWorkFile(userData))); }
  private ownerRemovalProof(hostId: string, currentEntry?: string) {
    const owners = this.workOwners();
    if (!owners || !Object.keys(owners).length) throw new RemoteHostRefusal("Removal refused: Desktop work/recovery protection cannot be verified. Open Desktop to inspect Host work and recovery, then quit and retry.");
    let workCleared = true, recoveryCleared = true;
    for (const [entry, owner] of Object.entries(owners)) {
      let currentStart;
      try { currentStart = processStart(owner.pid); }
      catch (error) { throw new RemoteHostRefusal("Cannot verify a Desktop owner's process identity. Inspect that profile before removal.", { cause: error }); }
      if (currentStart === owner.processStartedAt && (entry !== currentEntry || owner.pid !== process.pid)) throw new RemoteHostRefusal("A Desktop profile is running. Close Host work and recovery in every profile, quit all Desktops, then retry.");
      if (!owner.summary) throw new RemoteHostRefusal("Desktop work/recovery protection cannot be verified. Open each Desktop profile to inspect it.");
      // A dead owner or reused PID never discards that profile's work/recovery records.
      const work = owner.summary.find(row => row.hostId === hostId);
      workCleared &&= !work || work.openWork === 0;
      recoveryCleared &&= !work || work.recovery === 0;
    }
    return { confirmed: true, workCleared, recoveryCleared };
  }
  get(hostId: string): RemoteHost {
    const host = this.list().find(row => row.hostId === hostId);
    if (!host) throw new RemoteHostRefusal("Unknown registered hostId.");
    return host;
  }
  register(origin: string, label: string) {
    origin = remoteHostOrigin(origin); label = labelText(label);
    return this.change(rows => {
      if (rows.some(row => row.origin === origin)) throw new RemoteHostRefusal("Origin is already registered.");
      const host = { hostId: randomUUID(), origin, label }; rows.push(host);
      return { outcome: "success", host, saved: true, restartRequired: true } as const;
    });
  }
  rename(hostId: string, label: string) {
    label = labelText(label);
    return this.change(rows => {
      const host = rows.find(row => row.hostId === hostId);
      if (!host) throw new RemoteHostRefusal("Unknown registered hostId.");
      host.label = label;
      return { outcome: "success", host, saved: true } as const;
    });
  }
  /** The UI owner must check live work/recovery and hold that protection through this call.
   * CLI cannot provide this proof from command-line flags. Absent proof always refuses. */
  remove(hostId: string, protection?: (host: RemoteHost) => { confirmed: boolean; workCleared: boolean; recoveryCleared: boolean }) {
    return this.change(rows => {
      const index = rows.findIndex(row => row.hostId === hostId);
      if (index < 0) throw new RemoteHostRefusal("Unknown registered hostId.");
      const proof = protection?.(rows[index]);
      if (!proof?.confirmed || !proof.workCleared || !proof.recoveryCleared) throw new RemoteHostRefusal("Removal refused: Desktop work/recovery protection cannot be verified. Close Host tabs, resolve recovery in Desktop, then quit Desktop and try again.");
      const [host] = rows.splice(index, 1);
      return { outcome: "success", host, saved: true, restartRequired: true } as const;
    });
  }
  async status(hostId: string, productVersion: string) {
    const host = this.get(hostId);
    const context = { host, observation: "cli-probe", windowObserved: false, restartRequired: true } as const;
    return { ...context, ...await checkRemoteHost(host.origin, productVersion) };
  }
}

/** Read-only address observation shared by Desktop registration and CLI. Never saves a Host. */
export async function checkRemoteHost(value: string, productVersion: string) {
  const origin = remoteHostOrigin(value);
  try {
    const response = await fetch(origin + "/daemon/health", { headers: { "X-Litzio-Protocol": DAEMON_PROTOCOL }, redirect: "error", signal: AbortSignal.timeout(5000) });
    if (response.status === 409) return { origin, windowObserved: false, outcome: "refused", state: "protocol-mismatch" } as const;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const health = await response.json() as { protocolVersion?: string; productVersion?: string };
    if (health.protocolVersion !== DAEMON_PROTOCOL) return { origin, windowObserved: false, outcome: "refused", state: "protocol-mismatch" } as const;
    if (typeof health.productVersion !== "string") throw new Error("Invalid health response.");
    return { origin, windowObserved: false, outcome: "success", state: "connected", protocolVersion: health.protocolVersion, productVersion: health.productVersion,
      ...(health.productVersion !== productVersion ? { warning: `Host product ${health.productVersion}, client ${productVersion}` } : {}) } as const;
  } catch (error) { return { origin, windowObserved: false, outcome: "failure", state: "unreachable", reason: (error as Error).message } as const; }
}
