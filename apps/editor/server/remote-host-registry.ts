import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { brand } from "../../../brand.ts";
import { DAEMON_PROTOCOL } from "./daemon-protocol.ts";

export class RemoteHostRefusal extends Error {}
export type RemoteHost = { hostId: string; origin: string; label: string };
export const remoteHostsFile = () => path.join(process.env.LITZIO_DATA_DIR ?? path.join(os.homedir(), brand.folders.shared), "desktop", "remote-hosts.json");

/** Exact HTTP origin only, also safe to interpolate into CSP source lists. */
export function remoteHostOrigin(value: string): string {
  if (!/^https?:\/\/[^/?#]+\/?$/i.test(value) || value !== value.trim() || /[\s\\*;"'<>]/.test(value)) throw new RemoteHostRefusal("Expected an exact http(s) origin.");
  let url: URL;
  try { url = new URL(value); } catch { throw new RemoteHostRefusal("Expected an exact http(s) origin."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash || value.includes("?") || value.includes("#")) throw new RemoteHostRefusal("Expected an http(s) origin without credentials, path, query or fragment.");
  // URL parsing can decode host escapes and map Unicode (for example %2a or ＊) to
  // CSP syntax. Validate the canonical source too, before it can reach disk/CSP.
  if (!/^https?:\/\/[^/?#]+\/?$/i.test(url.origin) || /[\s\\*;"'<>]/.test(url.origin)) throw new RemoteHostRefusal("Expected an exact http(s) origin.");
  return url.origin;
}
function labelText(value: string): string {
  if (!value.trim() || /[\x00-\x1f\x7f]/.test(value)) throw new RemoteHostRefusal("Expected a nonempty label without control characters.");
  return value.trim();
}

/** Desktop-local operations shared by CLI and the future settings surface. No daemon control. */
export class RemoteHostRegistry {
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
    const fd = fs.openSync(lock, "wx", 0o600);
    try {
      const rows = this.list(), result = operation(rows);
      fs.writeFileSync(temporary, JSON.stringify(rows, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      fs.renameSync(temporary, this.file);
      return result;
    } finally { fs.rmSync(temporary, { force: true }); fs.closeSync(fd); fs.unlinkSync(lock); }
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
      if (!proof?.confirmed || !proof.workCleared || !proof.recoveryCleared) throw new RemoteHostRefusal("Removal refused: Desktop work/recovery protection cannot be verified. CLI removal is unavailable until PR3b provides the protected work/recovery check; keep this registration until then.");
      const [host] = rows.splice(index, 1);
      return { outcome: "success", host, saved: true, restartRequired: true } as const;
    });
  }
  async status(hostId: string, productVersion: string) {
    const host = this.get(hostId);
    const context = { host, observation: "cli-probe", windowObserved: false, restartRequired: true } as const;
    try {
      const response = await fetch(host.origin + "/daemon/health", { headers: { "X-Litzio-Protocol": DAEMON_PROTOCOL }, redirect: "error", signal: AbortSignal.timeout(5000) });
      if (response.status === 409) return { ...context, outcome: "refused", state: "protocol-mismatch" } as const;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const health = await response.json() as { protocolVersion?: string; productVersion?: string };
      if (health.protocolVersion !== DAEMON_PROTOCOL) return { ...context, outcome: "refused", state: "protocol-mismatch" } as const;
      if (typeof health.productVersion !== "string") throw new Error("Invalid health response.");
      return { ...context, outcome: "success", state: "connected", protocolVersion: health.protocolVersion, productVersion: health.productVersion,
        ...(health.productVersion !== productVersion ? { warning: `Host product ${health.productVersion}, client ${productVersion}` } : {}) } as const;
    } catch (error) { return { ...context, outcome: "failure", state: "unreachable", reason: (error as Error).message } as const; }
  }
}
