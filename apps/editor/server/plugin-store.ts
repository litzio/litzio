import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ConversionJob } from "@litzio/plugin-api/worker";
import { AI_TASK, type AiTaskJob } from "@litzio/plugin-api/ai";
import { PLUGIN_UI, type UiManifest, type UiRegistration } from "@litzio/plugin-api/config";

export type WorkerManifest = { id: string; version: string; workerApi?: 1; entry?: "worker.cjs"; tasks?: (typeof AI_TASK.service)[]; services?: (typeof AI_TASK.service)[]; ui?: UiManifest; host?: { api: 1; entry: "host.cjs" }; routes?: string[] };
export type Installation = WorkerManifest & { directory: string; sha256: string; revision: string; hostHash?: string; uiHashes?: Record<string, string>; enabled: boolean; features?: Record<string, boolean> };
type RuntimeJob = ConversionJob | AiTaskJob;
export const isAiJob = (job: RuntimeJob): job is AiTaskJob => "kind" in job && job.kind === "ai-task";
export type Receipt<J extends RuntimeJob = ConversionJob> = { job: J; fingerprint: string; owner: string; installation: Installation; staging?: string;
  temporary?: { snapshot: string; control: string };
  inputs?: string[];
  status: "running" | "success" | "error" | "cancelled" | "uncertain"; hidden?: boolean };
export const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
function workerManifest(value: unknown): WorkerManifest {
  const manifest = value as WorkerManifest;
  if (!manifest || typeof manifest.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/u.test(manifest.id) ||
      typeof manifest.version !== "string" || !/^[\w.+-]{1,128}$/u.test(manifest.version) ||
      (manifest.entry !== undefined || manifest.workerApi !== undefined ? manifest.workerApi !== 1 || manifest.entry !== "worker.cjs" : !manifest.ui)) {
    throw new Error("Invalid worker manifest or incompatible worker Host API (expected 1).");
  }
  if (manifest.ui !== undefined && (!manifest.ui || manifest.ui.api !== PLUGIN_UI.api || manifest.ui.reactMajor !== PLUGIN_UI.reactMajor ||
      manifest.ui.script !== PLUGIN_UI.script || (manifest.ui.style !== undefined && manifest.ui.style !== PLUGIN_UI.style) ||
      (manifest.ui.jobRoute !== undefined && !/^api\/[a-z0-9-]+$/u.test(manifest.ui.jobRoute)))) {
    throw new Error("Invalid UI manifest or incompatible UI Host API / React major.");
  }
  if (manifest.host !== undefined && (manifest.host?.api !== 1 || manifest.host.entry !== "host.cjs")) throw new Error("Incompatible plugin Host API (expected 1).");
  if (manifest.routes !== undefined && (!manifest.host || !Array.isArray(manifest.routes) || manifest.routes.some(route => typeof route !== "string" || !/^\/api\/[a-z0-9-]+$/u.test(route)))) throw new Error("Invalid plugin Host routes.");
  for (const key of ["tasks", "services"] as const) if (manifest[key] !== undefined && (!Array.isArray(manifest[key]) || manifest[key]!.length !== 1 || manifest[key]![0] !== AI_TASK.service || !manifest.entry || !manifest.host)) throw new Error("Invalid AI task capability.");
  return { id: manifest.id, version: manifest.version, workerApi: manifest.workerApi, entry: manifest.entry,
    ...(manifest.tasks ? { tasks: manifest.tasks } : {}), ...(manifest.services ? { services: manifest.services } : {}),
    ...(manifest.host ? { host: { api: manifest.host.api, entry: manifest.host.entry }, routes: manifest.routes } : {}),
    ...(manifest.ui ? { ui: { api: manifest.ui.api, reactMajor: manifest.ui.reactMajor, script: manifest.ui.script, ...(manifest.ui.style ? { style: manifest.ui.style } : {}), ...(manifest.ui.jobRoute ? { jobRoute: manifest.ui.jobRoute } : {}) } } : {}) };
}
export function requestUuid(value: unknown): string {
  if (typeof value !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(value)) throw new Error("A request UUID is required.");
  return value.toLowerCase();
}

/** Only registration and request receipts are durable. SQLite's OS locks release
 * on crash; ownership never depends on a PID, clock, heartbeat or stale timeout.
 * Use a local per-user filesystem, not a network share. */
export class PluginStore {
  private db: DatabaseSync;
  private lease?: DatabaseSync;
  readonly owner = randomUUID();
  constructor(readonly directory: string) {
    mkdirSync(path.join(directory, "owners"), { recursive: true });
    this.db = new DatabaseSync(path.join(directory, "runtime.sqlite"));
    this.db.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS plugins (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
  }
  private transaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = action(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  list(): Installation[] { return this.db.prepare("SELECT value FROM plugins ORDER BY id").all().map(row => JSON.parse(row.value as string)); }
  register(manifestFile: string, onlyIfMissing = false, checkPath: (file: string) => void = () => {}): Installation {
    const manifest = workerManifest(JSON.parse(readFileSync(manifestFile, "utf8")));
    const files = new Map<string, Buffer>();
    for (const name of [manifest.entry, manifest.host?.entry, manifest.ui?.script, manifest.ui?.style]) if (name) {
      const file = path.join(path.dirname(manifestFile), name); checkPath(file);
      files.set(name, readFileSync(file));
    }
    const sha256 = digest(files.get("worker.cjs") ?? "");
    const hostHash = manifest.host ? digest(files.get(manifest.host.entry)!) : undefined;
    const uiHashes = manifest.ui ? Object.fromEntries([...files].filter(([name]) => name === manifest.ui?.script || name === manifest.ui?.style).map(([name, bytes]) => [name, digest(bytes)])) : undefined;
    const revision = digest(JSON.stringify({ manifest, sha256, hostHash, uiHashes }));
    const directory = path.join(this.directory, "installed", revision);
    mkdirSync(path.dirname(directory), { recursive: true });
    const temporary = `${directory}.${randomUUID()}.tmp`;
    mkdirSync(temporary);
    try {
      for (const [name, bytes] of files) writeFileSync(path.join(temporary, name), bytes, { flag: "wx" });
      try { renameSync(temporary, directory); }
      catch (error) { if (!existsSync(directory)) throw error; }
      for (const [name, bytes] of files) if (digest(readFileSync(path.join(directory, name))) !== digest(bytes)) throw new Error("Installed plugin hash mismatch.");
    } finally { rmSync(temporary, { recursive: true, force: true }); }
    return this.transaction(() => {
      const existing = this.list().find(item => item.id === manifest.id);
      if (onlyIfMissing && existing) return existing;
      const value: Installation = { ...manifest, directory, sha256, revision, hostHash, uiHashes, enabled: true, ...(existing?.features ? { features: existing.features } : {}) };
      this.db.prepare("INSERT OR REPLACE INTO plugins VALUES (?, ?)").run(manifest.id, JSON.stringify(value));
      return value;
    });
  }
  uiList(): UiRegistration[] {
    return this.list().filter(item => item.enabled && item.ui).map(item => ({ id: item.id, revision: item.revision, ui: item.ui!, ...(item.features ? { features: item.features } : {}) }));
  }
  setFeatures(id: string, features: Record<string, boolean>) {
    if (!features || typeof features !== "object" || Array.isArray(features) || Object.entries(features).some(([key, value]) => !/^[a-z][a-z0-9-]*$/u.test(key) || typeof value !== "boolean")) throw new Error("Invalid plugin features.");
    return this.transaction(() => {
      const item = this.list().find(item => item.id === id);
      if (!item?.enabled) throw new Error("Plugin is disabled.");
      item.features = { ...item.features, ...features };
      this.db.prepare("UPDATE plugins SET value=? WHERE id=?").run(JSON.stringify(item), id);
      return item.features;
    });
  }
  history(plugin: string): Receipt[] {
    const ids = this.db.prepare("SELECT id FROM requests").all().map(row => row.id as string);
    return ids.map(id => this.get(id)).filter((receipt): receipt is Receipt => !!receipt && receipt.installation.id === plugin && !receipt.hidden)
      .sort((a, b) => b.job.startedAt - a.job.startedAt);
  }
  aiHistory(deadOwnersOnly = false): Receipt<AiTaskJob>[] {
    return this.db.prepare("SELECT id FROM requests").all().map(row => this.getRecord(row.id as string)!)
      .filter((receipt): receipt is Receipt<AiTaskJob> => isAiJob(receipt.job) && (!deadOwnersOnly || !this.ownerAlive(receipt.owner)));
  }
  forget(id: string, plugin: string) {
    this.get(id); // Resolve dead ownership before testing the status.
    this.transaction(() => {
      const receipt = this.read(requestUuid(id));
      if (!receipt || receipt.installation.id !== plugin || receipt.status !== "uncertain") throw new Error("Only an uncertain request record can be cleared.");
      receipt.hidden = true; // Retain the UUID tombstone: clearing must never permit replay.
      this.save(receipt);
    });
  }
  hostEntry(id: string): string {
    const item = this.list().find(item => item.id === id);
    if (!item?.host) throw new Error("Plugin Host operations are unavailable.");
    workerManifest(item);
    const file = path.join(item.directory, item.host.entry);
    if (digest(readFileSync(file)) !== item.hostHash) throw new Error("Installed Host entry hash mismatch.");
    return file;
  }
  uiAsset(id: string, revision: string, name: string): Buffer {
    const item = this.list().find(item => item.id === id && item.enabled && item.revision === revision);
    if (!item?.ui || (name !== item.ui.script && name !== item.ui.style) || !item.uiHashes?.[name]) throw new Error("UI plugin asset is unavailable.");
    const bytes = readFileSync(path.join(item.directory, name));
    if (digest(bytes) !== item.uiHashes[name]) throw new Error("Installed UI asset hash mismatch.");
    return bytes;
  }
  unregister(id: string): void {
    this.transaction(() => {
      const item = this.list().find(item => item.id === id);
      if (!item) throw new Error("Worker plugin is not registered.");
      item.enabled = false;
      this.db.prepare("UPDATE plugins SET value=? WHERE id=?").run(JSON.stringify(item), id);
    });
  }
  private holdOwnership(): void {
    if (this.lease) return;
    const lease = new DatabaseSync(path.join(this.directory, "owners", `${this.owner}.sqlite`));
    lease.exec("CREATE TABLE owner (id TEXT); BEGIN IMMEDIATE");
    this.lease = lease;
  }
  requestOwner(): string { this.holdOwnership(); return this.owner; }
  isRequestOwnerAlive(owner: string): boolean { return this.ownerAlive(owner); }
  private ownerAlive(owner: string): boolean {
    if (owner === this.owner && this.lease) return true;
    const file = path.join(this.directory, "owners", `${requestUuid(owner)}.sqlite`);
    try { statSync(file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
    const probe = new DatabaseSync(file);
    try { probe.exec("BEGIN IMMEDIATE; ROLLBACK"); return false; }
    catch (error) {
      if ((error as { errcode?: number }).errcode === 5) return true; // SQLITE_BUSY
      throw error; // I/O/corruption is not proof of a dead owner.
    } finally { probe.close(); }
  }
  private read(id: string): Receipt<RuntimeJob> | null {
    const row = this.db.prepare("SELECT value FROM requests WHERE id=?").get(id);
    return row ? JSON.parse(row.value as string) : null;
  }
  private save(receipt: Receipt<RuntimeJob>) {
    this.db.prepare("INSERT OR REPLACE INTO requests VALUES (?, ?)").run(receipt.job.id, JSON.stringify(receipt));
  }
  get(id: string): Receipt | null {
    const receipt = this.getRecord(id);
    return receipt && !isAiJob(receipt.job) ? receipt as Receipt : null;
  }
  getAi(id: string): Receipt<AiTaskJob> | null {
    const receipt = this.getRecord(id);
    return receipt && isAiJob(receipt.job) ? receipt as Receipt<AiTaskJob> : null;
  }
  private getRecord(id: string): Receipt<RuntimeJob> | null {
    return this.transaction(() => {
      const receipt = this.read(requestUuid(id));
      if (receipt?.status === "running" && !this.ownerAlive(receipt.owner)) {
        receipt.status = "uncertain"; receipt.job.state = "error";
        if (isAiJob(receipt.job)) {
          receipt.job.error = "AI task outcome is uncertain after Host interruption; it is never automatically retried.";
          receipt.job.failure = "uncertain"; delete receipt.job.result;
        } else {
          receipt.job.error = "Conversion outcome is uncertain after Host interruption; it is never automatically retried. The server task may continue.";
          receipt.job.failure = { code: "output", taskId: receipt.job.progress.taskId };
        }
        this.save(receipt);
      }
      return receipt;
    });
  }
  admit(job: ConversionJob, fingerprint: string, plugin: string): { receipt: Receipt; fresh: boolean };
  admit(job: AiTaskJob, fingerprint: string, plugin: string): { receipt: Receipt<AiTaskJob>; fresh: boolean };
  admit(job: RuntimeJob, fingerprint: string, plugin: string): { receipt: Receipt<RuntimeJob>; fresh: boolean } {
    this.holdOwnership();
    return this.transaction(() => {
      const existing = this.read(job.id);
      if (existing) {
        if (existing.fingerprint !== fingerprint || existing.installation.id !== plugin || isAiJob(job) !== isAiJob(existing.job)) throw new Error("Request UUID conflicts with an admitted conversion or AI task.");
        return { receipt: existing, fresh: false };
      }
      const installation = this.list().find(item => item.id === plugin && item.enabled);
      if (!installation) throw new Error("The Docling worker plugin is not registered.");
      if (isAiJob(job) && !this.list().some(item => item.id === job.caller && item.enabled)) throw new Error("AI task caller plugin is unavailable.");
      workerManifest(installation);
      if (isAiJob(job) && !installation.tasks?.includes(AI_TASK.service) || !isAiJob(job) && installation.tasks?.includes(AI_TASK.service)) throw new Error("Worker task capability mismatch.");
      if (!installation.entry || !/^[a-f\d]{64}$/u.test(installation.sha256) || !/^[a-f\d]{64}$/u.test(installation.revision) ||
        installation.directory !== path.join(this.directory, "installed", installation.revision)) throw new Error("Invalid installed worker location.");
      const receipt: Receipt<RuntimeJob> = { job, fingerprint, owner: this.owner, installation, status: "running" };
      this.save(receipt);
      return { receipt, fresh: true };
    });
  }
  update(receipt: Receipt<RuntimeJob>) {
    this.transaction(() => {
      const current = this.read(receipt.job.id);
      if (current?.owner !== this.owner || current.status !== "running") throw new Error("Conversion ownership was lost.");
      this.save(receipt);
    });
  }
  close() { this.lease?.close(); this.lease = undefined; this.db.close(); }
}
