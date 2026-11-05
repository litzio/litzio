import { publicOperationResult, safePluginValue } from "./operation-result.ts";
import { builtinViewOperations, type ViewOperation } from "@litzio/core/views";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, lstatSync, realpathSync, statSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";
import { scaffoldPlugin } from "./plugin-authoring.ts";
import { startPluginProcess } from "./plugin-process.ts";
import { validateManifest, validatePluginSource, compileSchema, statusSchema, pluginManagementSchema, type PluginManifest, type PluginInstance } from "@litzio/plugin-sdk";
import { hostPaths } from "../host-paths.ts";

import { WindowsPluginSecretStore, type PluginSecretStore } from "./secret-store.ts";
import { rememberSecret, withPluginCode } from "./secret-redaction.ts";

import { PluginJobs } from "./jobs.ts";
import { LOCAL_FILE_ACCESS, type FileAccess } from "../file-access.ts";

type Installed = { directory: string; digest: string; trustedDigest?: string; enabled: boolean; settings: Record<string, unknown>; operationNames: string[] };
type Loaded = { manifest: PluginManifest; instance: PluginInstance; pending: Set<Promise<unknown>> };
// Product-maintained supply list. Publisher metadata alone never establishes official supply.
export const OFFICIAL_PLUGINS = [{ id: "litzio.onedrive", publisher: "litzio", digest: "c49adb338b4c0470f48af3f6a90c8d5d36cc66dd54b9e809de59c3794d0b6a7c" }];
export class PluginHost {
  private installed: Record<string, Installed>;
  private loaded = new Map<string, Loaded>();
  private processes = new Map<string, PluginInstance>();
  private errors = new Map<string, string>();
  private serial: Promise<unknown> = Promise.resolve();
  private closed = false;
  private disabling = new Set<string>();
  readonly jobs: PluginJobs;
  private secrets: PluginSecretStore;
  constructor(private file = hostPaths().settingsFile("plugins"), options: { access?: FileAccess; secrets?: PluginSecretStore } = {}) {
    this.secrets = options.secrets ?? new WindowsPluginSecretStore(`${file}.secrets`);
    this.jobs = new PluginJobs(options.access ?? LOCAL_FILE_ACCESS, (plugin, job) => { if (this.closed || this.disabling.has(plugin)) throw new Error("Plugin is stopping"); const binding = this.loaded.get(plugin)?.manifest.contributes.jobs.find(item => item.id === job); if (!binding) throw new Error("Job unavailable"); return binding; }, (name, input) => this.invokeOperation(name, input, undefined, true));
    this.installed = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  }
  private save() {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(this.installed, null, 2) + "\n", { flag: "wx" }); renameSync(temporary, this.file); }
    finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  private artifact(directory: string) {
    directory = realpathSync(directory);
    const hash = createHash("sha256");
    const walk = (dir: string) => { for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      if (lstatSync(file).isSymbolicLink()) throw new Error("Artifact must contain real files, not linked dependencies");
      const relative = path.relative(directory, realpathSync(file));
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Package reference escapes artifact");
      const metadata = statSync(file);
      hash.update(JSON.stringify([path.relative(directory, file).replaceAll("\\", "/"), metadata.isDirectory() ? "directory" : "file", metadata.isDirectory() ? 0 : metadata.size]));
      if (metadata.isDirectory()) walk(file); else hash.update(readFileSync(file));
    } };
    walk(directory);
    const manifest = validateManifest(JSON.parse(readFileSync(path.join(directory, "litzio-plugin.json"), "utf8")));
    if (JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")).version !== manifest.version) throw new Error("Package and manifest versions differ");
    const entry = realpathSync(path.join(directory, manifest.entry));
    if (path.relative(directory, entry).startsWith("..") || !statSync(entry).isFile()) throw new Error("Invalid entry");
    compileSchema(manifest.settingsSchema);
    for (const op of manifest.contributes.operations) { compileSchema(op.inputSchema); compileSchema(op.outputSchema); }
    return { manifest, digest: hash.digest("hex"), entry };
  }
  private official(m: PluginManifest, digest: string) { return m.tier === "official" && OFFICIAL_PLUGINS.some(p => p.id === m.id && p.publisher === m.publisher.id && p.digest === digest); }
  async start() {
    for (const [id, record] of Object.entries(this.installed)) if (record.enabled) {
      try { await this.enable(id); } catch (error) { this.errors.set(id, "Plugin activation failed"); }
    }
  }
  private async status(live: Loaded) {
    const run = this.readStatus(live);
    live.pending.add(run);
    try { return await run; } finally { live.pending.delete(run); }
  }
  private async readStatus(live: Loaded) {
    const result = statusSchema.parse(safePluginValue(await withPluginCode(() => live.instance.status())));
    for (const [key, declaration] of [["folders", "folderSources"], ["decorations", "folderDecorations"], ["accounts", "accounts"]] as const) {
      if (result[key].length && !live.manifest.contributes[declaration].length) throw new Error("Undeclared status contribution");
      if (new Set(result[key].map(item => item.id)).size !== result[key].length) throw new Error("Duplicate status identity");
    }
    for (const folder of [...result.folders, ...result.decorations]) {
      if (!path.isAbsolute(folder.path) || !statSync(folder.path).isDirectory()) throw new Error("Invalid contributed folder");
      folder.path = realpathSync(folder.path);
    }
    return result;
  }
  async list() {
    return Promise.all(Object.entries(this.installed).map(async ([id, r]) => {
      try {
        const { manifest: m, digest } = this.artifact(r.directory), live = this.loaded.get(id);
        const observed = live ? await this.status(live) : null;
        const current = live && this.loaded.get(id) === live;
        return { id, publisher: m.publisher, name: m.name, description: m.description, version: m.version, installed: true, official: this.official(m, digest), trusted: this.official(m, digest) || r.trustedDigest === digest, enabled: r.enabled, running: !!current,
          jobs: m.contributes.jobs, secrets: await this.secretStatus(id, m), settings: r.settings, settingsSchema: m.settingsSchema, status: current ? observed : null, error: this.errors.get(id), digest };
      } catch (e) { return { id, installed: true, enabled: r.enabled, running: false, error: (e as NodeJS.ErrnoException).code === "ENOENT" ? "Plugin artifact missing" : "Plugin status unavailable", status: null }; }
    }));
  }
  private async enable(id: string) {
    const r = this.record(id), a = this.artifact(r.directory);
    if (a.digest !== r.digest) throw new Error("Artifact changed; trust the current digest and reload");
    if (!this.official(a.manifest, a.digest) && r.trustedDigest !== a.digest) throw new Error("Explicit digest-bound trust is required");
    if (this.loaded.has(id)) return;
    if (!compileSchema(a.manifest.settingsSchema)(r.settings)) throw new Error("Stored settings do not satisfy this artifact schema");
    const secrets = await this.runtimeSecrets(id, a.manifest);
    const instance = await startPluginProcess(a.entry, a.manifest, structuredClone(r.settings), secrets, () => {
      this.loaded.delete(id); this.errors.set(id, "Plugin process failed; reload to recover");
    });
    this.processes.set(id, instance);
    this.loaded.set(id, { manifest: a.manifest, instance, pending: new Set() });
    this.disabling.delete(id);
    this.errors.delete(id);
  }
  private declaredSecret(id: string, name: string) {
    const m = this.artifact(this.record(id).directory).manifest;
    if (!m.secrets.some(s => s.id === name)) throw new Error("Undeclared plugin secret");
    return m;
  }
  private async secretStatus(id: string, m: PluginManifest) {
    return { supported: this.secrets.supported, declarations: await Promise.all(m.secrets.map(async s => {
      try { return { ...s, configured: this.secrets.supported && await this.secrets.status(id, s.id) }; }
      catch { return { ...s, configured: false, error: "Secret unavailable or damaged" }; }
    })) };
  }
  private async runtimeSecrets(id: string, m: PluginManifest) {
    if (!this.secrets.supported) {
      if (m.secrets.some(s => s.required)) throw new Error("Plugin secrets unsupported on this Host (Windows required)");
      return Object.freeze({} as Record<string, string>);
    }
    const secrets: Record<string, string> = {};
    for (const s of m.secrets) {
      const value = await this.secrets.read(id, s.id);
      if (value !== undefined) { rememberSecret(value); secrets[s.id] = value; }
      else if (s.required) throw new Error("Required plugin secret is not configured");
    }
    return Object.freeze(secrets);
  }
  /** App settings input only. Deliberately absent from management/assistant schemas. */
  setSecret(id: string, name: string, value: string): Promise<unknown> {
    const run = this.serial.then(async () => {
      if (this.closed) throw new Error("Plugin Host is closing");
      this.declaredSecret(id, name);
      if (!this.secrets.supported) throw new Error("Plugin secrets unsupported on this Host (Windows required)");
      if (this.record(id).enabled) throw new Error("Disable the plugin before changing secrets");
      if (typeof value !== "string" || !value.length || Buffer.byteLength(value) > 16384) throw new Error("Invalid secret input");
      rememberSecret(value);
      await this.secrets.set(id, name, value);
      return { configured: true, receipt: { requestId: randomUUID(), operation: "plugins.secret-set", version: 1, scope: "host", outcome: "success" } };
    });
    this.serial = run.catch(() => {}); return run;
  }
  private record(id: string) { if (!Object.hasOwn(this.installed, id)) throw new Error("Plugin is not registered"); return this.installed[id]!; }
  private async disable(id: string) {
    this.disabling.add(id);
    await this.jobs.close(id);
    const live = this.loaded.get(id), instance = this.processes.get(id); this.loaded.delete(id);
    if (live) await Promise.allSettled([...live.pending]);
    if (instance) {
      try { await instance.dispose(); }
      catch { this.errors.set(id, "Plugin disposal failed; reload to recover"); throw new Error("Plugin disposal failed; reload to recover"); }
      finally { this.processes.delete(id); }
    }
  }
  viewOperations(): ViewOperation[] {
    return [...builtinViewOperations, ...[...this.loaded.values()].flatMap(live => live.manifest.contributes.operations
      .filter(op => op.effect === "read" && op.rowSchema)
      .map(op => ({ operation: `${live.manifest.id}.${op.id}`, version: op.version, rowSchema: op.rowSchema!, inputSchema: op.inputSchema, validateArgs: (args: unknown) => !!compileSchema(op.inputSchema)(args) })))];
  }
  async invokeOperation(name: string, input: unknown, folder?: string, jobCall = false) {
    const live = [...this.loaded.values()].find(v => v.manifest.contributes.operations.some(op => `${v.manifest.id}.${op.id}` === name));
    const op = live?.manifest.contributes.operations.find(op => `${live.manifest.id}.${op.id}` === name);
    if (!live || !op) throw new Error("Operation unavailable or plugin disabled");
    if (!jobCall && this.disabling.has(live.manifest.id)) throw new Error("Plugin is stopping");
    if (!jobCall && live.manifest.contributes.jobs.some(job => [job.start, job.status, job.stop].includes(op.id))) throw new Error("Use job start/status/stop with a requestId");
    const record = this.record(live.manifest.id), current = this.artifact(record.directory);
    if (current.digest !== record.digest || !this.official(current.manifest, current.digest) && record.trustedDigest !== current.digest) throw new Error("Artifact trust changed; trust the current digest and reload");
    if (op.scope === "folder") throw new Error("Folder-scoped plugin operations are unsupported in stage 1");
    if (!compileSchema(op.inputSchema)(input)) throw new Error("Invalid operation input");
    const requestId = randomUUID();
    const run = Promise.resolve().then(() => withPluginCode(() => live.instance.operations[op.id]!(input))); live.pending.add(run);
    try {
      const result = publicOperationResult(op, await run);
      return { result, receipt: { requestId, operation: name, version: op.version, scope: folder ?? "host", outcome: "success" } };
    } catch {
      return { error: "Plugin operation did not return a valid result. Check the target before retrying a write.", receipt: { requestId, operation: name, version: op.version, scope: folder ?? "host", outcome: op.effect === "write" ? "uncertain" : "failure" } };
    } finally { live.pending.delete(run); }
  }
  invoke(action: string, args: { id?: string; directory?: string; digest?: string; settings?: Record<string, unknown>; operation?: string; input?: unknown; name?: string; plugin?: string; job?: string; root?: string; file?: string; output?: string; requestId?: string } = {}): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("Plugin Host is closing"));
    if (action.startsWith("job-")) return this.jobs.execute({ action, ...args });
    if (action === "invoke") return this.invokeOperation(args.operation!, args.input);
    pluginManagementSchema.parse({ action, ...args });
    if (action === "list") return this.list().then(plugins => ({ plugins }));
    const run = this.serial.then(async () => {
      let id = args.id!;
      const receipt = (outcome: "success" | "failure") => ({ requestId: randomUUID(), operation: `plugins.${action}`, version: 1, scope: "host", outcome });
      if (action === "scaffold") return { ...scaffoldPlugin(args.directory!, id), receipt: receipt("success") };
      if (action === "validate") {
        const errors: string[] = []; let manifestId: string | undefined;
        try {
          const a = this.artifact(args.directory!); manifestId = a.manifest.id;
          errors.push(...validatePluginSource(readFileSync(a.entry, "utf8"), a.manifest));
        } catch (error) { errors.push(String(error)); }
        return { id: manifestId, valid: errors.length === 0, errors, limitations: "Static literal handlers only; computed output and activation behavior are checked at runtime.", receipt: receipt(errors.length ? "failure" : "success") };
      }
      if (action === "register") {
        const directory = realpathSync(args.directory!), a = this.artifact(directory);
        id = a.manifest.id;
        const names = new Set(a.manifest.contributes.operations.map(operation => `${a.manifest.id}.${operation.id}`));
        if (builtinViewOperations.some(op => names.has(op.operation))) throw new Error("Plugin operation ID collides with built-in operation");
        for (const [otherId, other] of Object.entries(this.installed)) {
          if (otherId !== a.manifest.id && (other.operationNames ?? []).some(name => names.has(name))) throw new Error("Plugin operation ID collision");
        }
        const previous = Object.hasOwn(this.installed, a.manifest.id) ? this.installed[a.manifest.id] : undefined;
        if (previous?.enabled) throw new Error("Disable the plugin before replacing its registration");
        this.installed[a.manifest.id] = { directory, digest: a.digest, enabled: false, settings: previous?.settings ?? {}, operationNames: [...names] };
      } else {
        const r = this.record(id);
        if (action === "unregister") {
          r.enabled = false; this.save(); await this.disable(id);
          if (this.secrets.supported) await this.secrets.delete(id);
          delete this.installed[id]; this.errors.delete(id);
        } else if (action === "secret-status") {
          return { id, secrets: await this.secretStatus(id, this.artifact(r.directory).manifest), receipt: { requestId: randomUUID(), operation: "plugins.secret-status", version: 1, scope: "host", outcome: "success" } };
        } else if (action === "secret-delete") {
          this.declaredSecret(id, args.name!);
          if (r.enabled) throw new Error("Disable the plugin before changing secrets");
          await this.secrets.delete(id, args.name!);
        } else if (action === "trust") {
          const a = this.artifact(r.directory);
          if (a.manifest.id !== id || args.digest !== a.digest) throw new Error("Artifact digest does not match");
          r.trustedDigest = a.digest;
        } else if (action === "enable") { try { await this.enable(id); r.enabled = true; } catch (error) { this.errors.set(id, String(error)); throw error; } }
        else if (action === "reload") {
          r.enabled = false; this.save();
          try {
            await this.disable(id);
            const a = this.artifact(r.directory);
            if (a.manifest.id !== id) throw new Error("Artifact ID changed");
            if (!this.official(a.manifest, a.digest) && r.trustedDigest !== a.digest) throw new Error("Explicit digest-bound trust is required");
            const names = a.manifest.contributes.operations.map(op => `${id}.${op.id}`);
            if (builtinViewOperations.some(op => names.includes(op.operation))) throw new Error("Plugin operation ID collides with built-in operation");
            for (const [otherId, other] of Object.entries(this.installed)) if (otherId !== id && other.operationNames.some(name => names.includes(name))) throw new Error("Plugin operation ID collision");
            r.digest = a.digest; r.operationNames = names;
            await this.enable(id); r.enabled = true;
          } catch (error) { this.errors.set(id, String(error)); this.save(); throw error; }
        }
        else if (action === "disable") { r.enabled = false; this.save(); await this.disable(id); }
        else if (action === "settings") {
          if (args.settings === undefined) return { id, secrets: await this.secretStatus(id, this.artifact(r.directory).manifest), settings: r.settings, settingsSchema: this.artifact(r.directory).manifest.settingsSchema };
          const m = this.artifact(r.directory).manifest;
          if (!args.settings || !compileSchema(m.settingsSchema)(args.settings)) throw new Error("Invalid settings; secrets are unsupported");
          if (this.loaded.has(id)) throw new Error("Disable the plugin before changing settings");
          r.settings = structuredClone(args.settings);
        } else throw new Error("Unknown plugin management action");
      }
      this.save();
      return { id, plugins: await this.list(), receipt: { requestId: randomUUID(), operation: `plugins.${action}`, version: 1, scope: "host", outcome: "success" } };
    });
    this.serial = run.catch(() => {}); return run;
  }
  async close() {
    this.closed = true; await this.serial;
    const results = await Promise.allSettled([...this.processes.keys()].map(id => this.disable(id)));
    const errors = results.filter(result => result.status === "rejected").map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, "Plugin cleanup failed");
  }
}
