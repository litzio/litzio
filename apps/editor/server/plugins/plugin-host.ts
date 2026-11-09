import { artifactDigest } from "./artifact-digest.mjs";
import { OFFICIAL_PLUGINS, type OfficialPlugin } from "./official-plugins.ts";
import { publicOperationError, publicOperationResult, safePluginValue } from "./operation-result.ts";
import { builtinViewOperations, type ViewOperation } from "@litzio/core/views";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";
import { accessPath, LOCAL_FILE_ACCESS, type FileAccess } from "../file-access.ts";
import { scaffoldPlugin } from "./plugin-authoring.ts";
import { startPluginProcess } from "./plugin-process.ts";
import { healthCheckResultSchema, validateManifest, validatePluginSource, compileSchema, statusSchema, pluginManagementSchema, type PluginManifest, type PluginInstance } from "@litzio/plugin-sdk";
import { hostPaths } from "../host-paths.ts";

import { WindowsPluginSecretStore, type PluginSecretStore } from "./secret-store.ts";

import { PluginJobs } from "./jobs.ts";
import { PluginReviews } from "./reviews.ts";

type Installed = { directory: string; digest: string; trustedDigest?: string; enabled: boolean; enabledChoice?: boolean; bundled?: boolean; settings: Record<string, unknown>; operationNames: string[] };
type Loaded = { manifest: PluginManifest; instance: PluginInstance; pending: Set<Promise<unknown>> };
export class PluginHost {
  private installed: Record<string, Installed>;
  private artifacts = new Map<string, { manifest: PluginManifest; digest: string; entry: string }>();
  private loaded = new Map<string, Loaded>();
  private processes = new Map<string, PluginInstance>();
  private errors = new Map<string, string>();
  private serial: Promise<unknown> = Promise.resolve();
  private closed = false;
  private disabling = new Set<string>();
  readonly jobs: PluginJobs;
  readonly reviews: PluginReviews;
  private secrets: PluginSecretStore;
  private redactionSecrets = new Map<string, Map<string, string>>();
  private secretValues(id: string) { return [...(this.redactionSecrets.get(id)?.values() ?? [])]; }
  private rememberSecret(id: string, name: string, value: string) {
    if (!this.redactionSecrets.has(id)) this.redactionSecrets.set(id, new Map());
    this.redactionSecrets.get(id)!.set(name, value);
  }
  private access: FileAccess;
  private supply: OfficialPlugin[];
  constructor(private file = hostPaths().settingsFile("plugins"), options: { access?: FileAccess; secrets?: PluginSecretStore; officialPlugins?: OfficialPlugin[] } = {}) {
    this.supply = options.officialPlugins ?? OFFICIAL_PLUGINS;
    this.access = options.access ?? LOCAL_FILE_ACCESS;
    this.secrets = options.secrets ?? new WindowsPluginSecretStore(`${file}.secrets`);
    this.reviews = new PluginReviews(this.access, (plugin, review) => {
      if (this.closed || this.disabling.has(plugin)) throw new Error("Plugin is stopping");
      const binding = this.loaded.get(plugin)?.manifest.contributes.reviews.find(r => r.id === review);
      if (!binding) throw new Error("Review unavailable");
      const live = this.loaded.get(plugin)!, record = this.record(plugin), current = this.artifact(record.directory);
      if (current.digest !== record.digest || !this.official(current.manifest, current.digest) && record.trustedDigest !== current.digest) throw new Error("Review artifact trust changed");
      if ([binding.read, binding.propose, binding.approve, binding.reject, binding.undo].some(b => b && !live.manifest.contributes.operations.some(op => `${plugin}.${op.id}` === b.operation && op.version === b.version))) throw new Error("Review operation unavailable");
      return binding;
    }, (name, input, version) => this.invokeOperation(name, input, undefined, true, version));
    this.jobs = new PluginJobs(options.access ?? LOCAL_FILE_ACCESS, (plugin, job) => { if (this.closed || this.disabling.has(plugin)) throw new Error("Plugin is stopping"); const binding = this.loaded.get(plugin)?.manifest.contributes.jobs.find(item => item.id === job); if (!binding) throw new Error("Job unavailable"); return binding; }, (name, input) => this.invokeOperation(name, input, undefined, true), name => {
      const operation = [...this.loaded.values()].flatMap(live => live.manifest.contributes.operations.map(op => ({ name: `${live.manifest.id}.${op.id}`, effect: op.effect }))).find(op => op.name === name);
      if (!operation) throw new Error("Job operation unavailable");
      return operation.effect;
    }, (plugin, root, file, source, data) => this.reviews.publish(plugin, root, file, source, data));
    this.installed = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  }
  private save() {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(this.installed, null, 2) + "\n", { flag: "wx" }); renameSync(temporary, this.file); }
    finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  private artifact(directory: string, inspecting: (file: string) => void = () => {}) {
    directory = realpathSync(directory);
    const digest = artifactDigest(directory);
    const cached = this.artifacts.get(directory);
    if (cached?.digest === digest) {
      for (const file of ["litzio-plugin.json", "package.json", "host entry"]) inspecting(file);
      return structuredClone(cached);
    }
    this.artifacts.delete(directory);
    inspecting("litzio-plugin.json");
    const manifest = validateManifest(JSON.parse(readFileSync(path.join(directory, "litzio-plugin.json"), "utf8")));
    inspecting("package.json");
    if (JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")).version !== manifest.version) throw new Error("Package and manifest versions differ");
    inspecting("host entry");
    const entry = realpathSync(path.join(directory, manifest.entry));
    if (path.relative(directory, entry).startsWith("..") || !statSync(entry).isFile()) throw new Error("Invalid entry");
    compileSchema(manifest.settingsSchema);
    for (const op of manifest.contributes.operations) { compileSchema(op.inputSchema); compileSchema(op.outputSchema); }
    this.artifacts.set(directory, { manifest, digest, entry });
    return structuredClone({ manifest, digest, entry });
  }
  private official(m: PluginManifest, digest: string) { return m.tier === "official" && this.supply.some(p => p.id === m.id && p.publisher === m.publisher.id && p.digest === digest); }
  async start() {
    for (const item of this.supply) {
      const previous = this.installed[item.id];
      const record: Installed = { directory: item.directory, digest: item.digest, enabled: previous?.enabledChoice ?? item.defaultEnabled, enabledChoice: previous?.enabledChoice, bundled: true, settings: previous?.settings ?? {}, operationNames: [] };
      this.installed[item.id] = record;
      try {
        const artifact = this.artifact(item.directory);
        if (artifact.manifest.id !== item.id || !this.official(artifact.manifest, artifact.digest)) throw new Error();
        record.operationNames = artifact.manifest.contributes.operations.map(op => `${item.id}.${op.id}`);
      } catch { this.errors.set(item.id, "Bundled plugin artifact verification failed"); }
    }

    for (const [id, record] of Object.entries(this.installed)) if (record.enabled && !this.errors.has(id)) {
      try { await this.enable(id); } catch (error) { this.errors.set(id, "Plugin activation failed"); }
    }
  }
  private async status(live: Loaded) {
    const run = this.readStatus(live);
    live.pending.add(run);
    try { return await run; } finally { live.pending.delete(run); }
  }
  private async readStatus(live: Loaded) {
    const result = statusSchema.parse(safePluginValue(await live.instance.status(), this.secretValues(live.manifest.id)));
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
        return { id, publisher: m.publisher, name: m.name, description: m.description, version: m.version, installed: true, bundled: !!r.bundled, official: this.official(m, digest), trusted: this.official(m, digest) || r.trustedDigest === digest, enabled: r.enabled, running: !!current,
          healthCheck: m.contributes.healthCheck, jobs: m.contributes.jobs, secrets: await this.secretStatus(id, m), settings: r.settings, settingsSchema: m.settingsSchema, status: current ? observed : null, error: this.errors.get(id), digest };
      } catch (e) { return { id, installed: true, bundled: !!r.bundled, enabled: r.enabled, running: false, error: (e as NodeJS.ErrnoException).code === "ENOENT" ? "Plugin artifact missing" : "Plugin status unavailable", status: null }; }
    }));
  }
  private async enable(id: string): Promise<void> {
    const r = this.record(id), a = this.artifact(r.directory);
    if (r.bundled && !this.official(a.manifest, a.digest)) throw new Error("Bundled plugin artifact verification failed");
    if (a.digest !== r.digest) {
      if (r.trustedDigest !== a.digest) throw new Error("Artifact changed; trust the current digest and reload");
      await this.reload(id);
      return;
    }
    if (!this.official(a.manifest, a.digest) && r.trustedDigest !== a.digest) throw new Error("Explicit digest-bound trust is required");
    if (this.loaded.has(id)) return;
    if (!compileSchema(a.manifest.settingsSchema)(r.settings)) throw new Error("Stored settings do not satisfy this artifact schema");
    const secrets = await this.runtimeSecrets(id, a.manifest);
    const instance = await startPluginProcess(a.entry, a.manifest, structuredClone(r.settings), secrets, () => {
      this.loaded.delete(id); this.jobs.lost(id); this.errors.set(id, "Plugin process failed; reload to recover");
    }, r.directory);
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
    this.redactionSecrets.set(id, new Map());
    const secrets: Record<string, string> = {};
    for (const s of m.secrets) {
      const value = await this.secrets.read(id, s.id);
      if (value !== undefined) { this.rememberSecret(id, s.id, value); secrets[s.id] = value; }
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
      if (typeof value !== "string" || !value.length || Buffer.byteLength(value) > 16384) throw new Error("Invalid secret input");
      await this.changeConfiguration(id, async () => {
        await this.secrets.set(id, name, value);
        if (!this.record(id).enabled) this.rememberSecret(id, name, value);
      });
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
  private async reload(id: string) {
    const r = this.record(id);
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
      await this.enable(id); r.enabled = true; r.enabledChoice = true;
    } catch (error) { this.errors.set(id, String(error)); this.save(); throw error; }
  }
  /** Block job admission before the first asynchronous store write through reload. */
  private async changeConfiguration(id: string, change: () => Promise<void> | void) {
    if (this.jobs.list(id).jobs.some(job => job.state === "running" || job.state === "uncertain")) {
      throw new Error("Plugin has running or uncertain jobs; settings and secrets were not changed");
    }
    const enabled = this.record(id).enabled;
    if (enabled) this.disabling.add(id);
    try {
      await change();
      this.save();
      if (enabled) await this.reload(id);
    } finally { if (enabled) this.disabling.delete(id); }
  }
  viewOperations(): ViewOperation[] {
    return [...builtinViewOperations, ...[...this.loaded.values()].flatMap(live => live.manifest.contributes.operations
      .filter(op => op.effect === "read" && op.rowSchema)
      .map(op => ({ operation: `${live.manifest.id}.${op.id}`, version: op.version, rowSchema: op.rowSchema!, inputSchema: op.inputSchema, validateArgs: (args: unknown) => !!compileSchema(op.inputSchema)(args) })))];
  }
  /** The loaded manifest owns identity; never infer plugin IDs by splitting operation names. */
  viewOperationOwner(operation: string): string | undefined {
    return [...this.loaded.values()].find(live => live.manifest.contributes.operations.some(op => `${live.manifest.id}.${op.id}` === operation))?.manifest.id;
  }
  viewContributions() {
    return [...this.loaded.values()].flatMap(live => live.manifest.contributes.views.map(view => ({ plugin: live.manifest.id, ...view })));
  }
  viewScreens() {
    return [...this.loaded.values()].flatMap(live => live.manifest.contributes.screens.map(screen => ({ plugin: live.manifest.id, ...screen })));
  }
  /** Registered namespaces remain valid even while a plugin is disabled. */
  hasViewOwner(id: string): boolean { return Object.hasOwn(this.installed, id); }
  async invokeOperation(name: string, input: unknown, folder?: string, jobCall = false, version?: number) {
    const live = [...this.loaded.values()].find(v => v.manifest.contributes.operations.some(op => `${v.manifest.id}.${op.id}` === name));
    const op = live?.manifest.contributes.operations.find(op => `${live.manifest.id}.${op.id}` === name);
    if (!live || !op) throw new Error("Operation unavailable or plugin disabled");
    if (version !== undefined && op.version !== version) throw new Error("Review operation version unavailable");
    if (version === undefined && live.manifest.contributes.reviews.some(r => [r.read, r.propose, r.approve, r.reject, r.undo].some(b => b?.operation === name))) throw new Error("Use the common review dispatcher");
    if (!jobCall && this.disabling.has(live.manifest.id)) throw new Error("Plugin is stopping");
    if (!jobCall && live.manifest.contributes.jobs.some(job => [job.start, job.status, job.stop].includes(op.id))) throw new Error("Use job start/status/stop with a requestId");
    const record = this.record(live.manifest.id), current = this.artifact(record.directory);
    if (current.digest !== record.digest || !this.official(current.manifest, current.digest) && record.trustedDigest !== current.digest) throw new Error("Artifact trust changed; trust the current digest and reload");
    if (op.scope === "folder") throw new Error("Folder-scoped plugin operations are unsupported in stage 1");
    if (!compileSchema(op.inputSchema)(input)) throw new Error("Invalid operation input");
    const requestId = randomUUID();
    const run = Promise.resolve().then(() => live.instance.operations[op.id]!(input)); live.pending.add(run);
    try {
      const result = publicOperationResult(op, await run, this.secretValues(live.manifest.id));
      if (live.manifest.contributes.healthCheck === op.id) healthCheckResultSchema.parse(result);
      return { result, receipt: { requestId, operation: name, version: op.version, scope: folder ?? "host", outcome: "success" } };
    } catch (error) {
      return { ...publicOperationError(error, op.effect), receipt: { requestId, operation: name, version: op.version, scope: folder ?? "host", outcome: op.effect === "write" ? "uncertain" : "failure" } };
    } finally { live.pending.delete(run); }
  }
  invoke(action: string, args: { id?: string; directory?: string; digest?: string; settings?: Record<string, unknown>; operation?: string; input?: unknown; name?: string; plugin?: string; job?: string; root?: string; file?: string; files?: string[]; requestIds?: string[]; output?: string; requestId?: string } = {}, creationScope: FileAccess = LOCAL_FILE_ACCESS): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("Plugin Host is closing"));
    if (action.startsWith("job-")) return this.jobs.execute({ action, ...args });
    if (action === "invoke") return this.invokeOperation(args.operation!, args.input);
    pluginManagementSchema.parse({ action, ...args });
    if (action === "list") return this.list().then(plugins => ({ plugins }));
    const run = this.serial.then(async () => {
      let id = args.id!;
      const receipt = (outcome: "success" | "failure") => ({ requestId: randomUUID(), operation: `plugins.${action}`, version: 1, scope: "host", outcome });
      if (action === "scaffold") return { ...scaffoldPlugin(args.directory!, id, this.access, creationScope), receipt: receipt("success") };
      if (action === "validate") {
        const errors: { file: string; line: number | null; column: number | null; kind: string }[] = []; let manifestId: string | undefined;
        let file = "artifact";
        try {
          const a = this.artifact(accessPath(args.directory!, this.access), current => { file = current; }); manifestId = a.manifest.id;
          errors.push(...validatePluginSource(readFileSync(a.entry, "utf8"), a.manifest).map(issue => ({ file: "host entry", ...issue })));
        } catch (error) {
          // Read only numeric location metadata. Parser/Ajv/Zod/fs messages may contain source or secret values.
          const value = error as { loc?: { line?: number; column?: number }; message?: string; name?: string };
          const location = typeof value?.message === "string" ? /line (\d+) column (\d+)/.exec(value.message) : null;
          const line = Number.isInteger(value?.loc?.line) ? value.loc!.line! : location ? Number(location[1]) : null;
          const column = Number.isInteger(value?.loc?.column) ? value.loc!.column! + 1 : location ? Number(location[2]) : null;
          errors.push({ file, line, column, kind: error instanceof SyntaxError ? file === "host entry" ? "JavaScript syntax error" : "JSON syntax error" : value?.name === "ZodError" ? "Manifest schema violation" : "Artifact or SDK/schema validation failed" });
        }
        return { id: manifestId, valid: errors.length === 0, errors, limitations: "Static literal handlers only; computed output and activation behavior are checked at runtime.", receipt: receipt(errors.length ? "failure" : "success") };
      }
      if (action === "register") {
        const directory = realpathSync(args.directory!), a = this.artifact(directory);
        id = a.manifest.id;
        if (this.supply.some(p => p.id === id)) throw new Error("Official plugins update with the app only");
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
        if (r.bundled && ["unregister", "trust"].includes(action)) throw new Error("Official plugins can only be disabled");
        if (action === "unregister") {
          r.enabled = false; this.save(); await this.disable(id);
          if (this.secrets.supported) await this.secrets.delete(id);
          this.redactionSecrets.delete(id);
          delete this.installed[id]; this.errors.delete(id);
        } else if (action === "secret-status") {
          return { id, secrets: await this.secretStatus(id, this.artifact(r.directory).manifest), receipt: { requestId: randomUUID(), operation: "plugins.secret-status", version: 1, scope: "host", outcome: "success" } };
        } else if (action === "secret-delete") {
          this.declaredSecret(id, args.name!);
          await this.changeConfiguration(id, async () => {
            await this.secrets.delete(id, args.name!);
            if (!r.enabled) this.redactionSecrets.get(id)?.delete(args.name!);
          });
        } else if (action === "trust") {
          const a = this.artifact(r.directory);
          if (a.manifest.id !== id || args.digest !== a.digest) throw new Error("Artifact digest does not match");
          r.trustedDigest = a.digest;
        } else if (action === "enable") { r.enabledChoice = true; this.save(); try { await this.enable(id); r.enabled = true; } catch (error) { this.errors.set(id, String(error)); throw error; } }
        else if (action === "reload") {
          await this.reload(id);
        }
        else if (action === "disable") { r.enabledChoice = false; r.enabled = false; this.save(); await this.disable(id); }
        else if (action === "settings") {
          if (args.settings === undefined) return { id, secrets: await this.secretStatus(id, this.artifact(r.directory).manifest), settings: r.settings, settingsSchema: this.artifact(r.directory).manifest.settingsSchema };
          const m = this.artifact(r.directory).manifest;
          if (!args.settings || !compileSchema(m.settingsSchema)(args.settings)) throw new Error("Invalid settings; secrets are unsupported");
          await this.changeConfiguration(id, () => { r.settings = structuredClone(args.settings!); });
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
    this.redactionSecrets.clear();
    this.artifacts.clear();
    if (errors.length) throw new AggregateError(errors, "Plugin cleanup failed");
  }
}
