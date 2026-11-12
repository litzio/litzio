import { PluginSettingsError } from "../../shared/plugin-settings-error.ts";
import { PluginAssistantSkills, validateAssistantSkills } from "./assistant-skills.ts";
import { designatedPluginDirectories } from "./designated-plugins.ts";
import { PLUGIN_REGISTRATION_CHANGED, inputHintResultSchema, inputSuggestionResultsSchema, inputOptionResultsSchema } from "@litzio/plugin-sdk";
import { readPluginIcon } from "./plugin-icon.ts";
import { artifactDigest } from "./artifact-digest.mjs";
import { OFFICIAL_PLUGINS, type OfficialPlugin } from "./official-plugins.ts";
import { publicOperationError, publicOperationResult, safePluginValue } from "./operation-result.ts";
import { assertNoPluginSecrets } from "./secret-redaction.ts";
import { type ViewOperation } from "@litzio/core/views";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync, lstatSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";
import { accessPath, canonicalFilePath, inside, RootAccess, LOCAL_FILE_ACCESS, type FileAccess } from "../file-access.ts";
import { scaffoldPlugin } from "./plugin-authoring.ts";
import { startPluginProcess } from "./plugin-process.ts";
import { healthCheckResultSchema, validateManifest, validatePluginSource, compileSchema, statusSchema, pluginManagementSchema, type PluginManifest, type PluginInstance } from "@litzio/plugin-sdk";
import { hostPaths } from "../host-paths.ts";

import { WindowsPluginSecretStore, type PluginSecretStore } from "./secret-store.ts";

import { PluginJobs } from "./jobs.ts";
import { PluginReviews } from "./reviews.ts";
import { GeneratedDocuments } from "./generated-documents.ts";

type Installed = { registrationId: string; directory: string; digest: string; trusted?: boolean; enabled: boolean; enabledChoice?: boolean; bundled?: boolean; settings: Record<string, unknown>; operationNames: string[] };
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
  readonly generatedDocuments: GeneratedDocuments;
  private secrets: PluginSecretStore;
  private redactionSecrets = new Map<string, Map<string, string>>();
  private secretValues(id: string) { return [...(this.redactionSecrets.get(id)?.values() ?? [])]; }
  private rememberSecret(id: string, name: string, value: string) {
    if (!this.redactionSecrets.has(id)) this.redactionSecrets.set(id, new Map());
    this.redactionSecrets.get(id)!.set(name, value);
  }
  private access: FileAccess;
  private supply: OfficialPlugin[];
  private designated: { id: string; directory: string }[];
  private assistantSkills: PluginAssistantSkills;
  skillDisplayName(file: string) { return this.assistantSkills.displayName(file); }
  readonly authoringDirectory: string;
  private authoringRoot?: RootAccess;
  constructor(private file = hostPaths().settingsFile("plugins"), options: { access?: FileAccess; authoringDirectory?: string; assistantDirectory?: string; secrets?: PluginSecretStore; officialPlugins?: OfficialPlugin[]; designatedPlugins?: { id: string; directory: string }[]; jobHistoryFile?: string } = {}) {
    this.assistantSkills = new PluginAssistantSkills(options.assistantDirectory ?? path.join(path.dirname(file), "assistant"));
    this.authoringDirectory = options.authoringDirectory ?? hostPaths().plugins;
    this.supply = options.officialPlugins ?? OFFICIAL_PLUGINS;
    this.designated = options.designatedPlugins ?? designatedPluginDirectories();
    this.access = options.access ?? LOCAL_FILE_ACCESS;
    this.secrets = options.secrets ?? new WindowsPluginSecretStore(`${file}.secrets`);
    this.generatedDocuments = new GeneratedDocuments(this.access, (plugin, job) => {
      const live = this.loaded.get(plugin), binding = live?.manifest.contributes.jobs.find(item => item.id === job);
      if(live && binding && (binding.resultKind!=="native-document" || !binding.generatedDocument))throw new Error(`Job ${plugin}.${job} does not create a review workspace or generated document. Use a native-document job with a generated-document provider.`);
      const operation = binding?.resultKind === "native-document" && binding.generatedDocument;
      const op = operation && live?.manifest.contributes.operations.find(item => item.id === operation);
      if (!live || !op || op.effect !== "read") throw new Error("Generated document provider unavailable");
      const assertCurrent = () => {
        if (this.closed || this.disabling.has(plugin) || this.loaded.get(plugin) !== live) throw new Error("Generated document provider changed");
        const record = this.record(plugin), artifact = this.artifact(record.directory);
        if (artifact.digest !== record.digest || !this.official(artifact.manifest, artifact.digest) && !record.trusted) throw new Error("Generated document provider trust changed");
      };
      assertCurrent(); return { operation: `${plugin}.${op.id}`, version: op.version, workspace: binding?.resultKind === "native-document" ? binding.workspace : undefined, comparison: binding?.resultKind === "native-document" ? binding.comparison : undefined, assertCurrent };
    }, (operation, input, version) => this.invokeOperation(operation, input, undefined, true, version), (...args) => this.reviews.publish(...args), input => this.reviews.execute(input), file => {
      const targets:{plugin:string;job:string;accept:string[]}[]=[];
      for(const [plugin,live] of this.loaded) for(const job of live.manifest.contributes.jobs) if(job.resultKind==="native-document"&&job.workspace&&(!file||job.accept.includes(path.extname(file).toLowerCase()))) targets.push({plugin,job:job.id,accept:job.accept});
      return targets;
    });
    this.reviews = new PluginReviews(this.access, (plugin, review) => {
      if (this.closed || this.disabling.has(plugin)) throw new Error("Plugin is stopping");
      const binding = this.loaded.get(plugin)?.manifest.contributes.reviews.find(r => r.id === review);
      if (!binding) throw new Error("Review unavailable");
      const live = this.loaded.get(plugin)!, record = this.record(plugin), current = this.artifact(record.directory);
      if (current.digest !== record.digest || !this.official(current.manifest, current.digest) && !record.trusted) throw new Error("Review artifact trust changed");
      if ([binding.read, binding.propose, binding.approve, binding.reject, binding.undo].some(b => b && !live.manifest.contributes.operations.some(op => `${plugin}.${op.id}` === b.operation && op.version === b.version))) throw new Error("Review operation unavailable");
      return binding;
    }, (name, input, version) => this.invokeOperation(name, input, undefined, true, version));
    this.jobs = new PluginJobs(options.access ?? LOCAL_FILE_ACCESS, (plugin, job) => { if (this.closed || this.disabling.has(plugin)) throw Object.assign(new Error("Plugin is stopping"), { kind: "unavailable" }); const binding = this.loaded.get(plugin)?.manifest.contributes.jobs.find(item => item.id === job); if (!binding) throw Object.assign(new Error("Job unavailable"), { kind: "unavailable" }); return binding; }, (name, input) => this.invokeOperation(name, input, undefined, true), name => {
      const operation = [...this.loaded.values()].flatMap(live => live.manifest.contributes.operations.map(op => ({ name: `${live.manifest.id}.${op.id}`, effect: op.effect }))).find(op => op.name === name);
      if (!operation) throw new Error("Job operation unavailable");
      return operation.effect;
    }, (plugin, root, file, source, data) => this.reviews.publish(plugin, root, file, source, data),
    (plugin, job, root, source, file, revision, sourceRevision, inputs) => this.generatedDocuments.register(plugin, job, root, source, file, revision, sourceRevision, inputs), options.jobHistoryFile ?? path.join(path.dirname(file), "plugin-jobs.json"));
    this.installed = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  }
  /** Check without creating anything, including when the data directory does not exist yet. */
  authoringPath(): string | undefined {
    let ancestor = path.dirname(path.resolve(this.authoringDirectory));
    const missing: string[] = [];
    while (!lstatSync(ancestor, { throwIfNoEntry: false })) {
      missing.unshift(path.basename(ancestor));
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw new Error("Plugin data parent is unavailable");
      ancestor = parent;
    }
    if (!statSync(ancestor).isDirectory()) throw new Error("Plugin data parent must be a directory");
    // Native realpath expands Windows 8.3 names and resolves aliases above the data folder.
    const data = path.join(canonicalFilePath(ancestor), ...missing);
    const directory = path.join(data, path.basename(this.authoringDirectory));
    const entry = lstatSync(directory, { throwIfNoEntry: false });
    if (entry && (entry.isSymbolicLink() || !entry.isDirectory())) return undefined;
    const real = entry ? canonicalFilePath(directory) : directory;
    // Read the realpath once; never grant a different sibling returned after a junction swap.
    if (path.relative(directory, real) !== "") return undefined;
    return directory;
  }
  /** Only scaffold may prepare directories. Existing roots stay pinned for the Host lifetime. */
  authoringAccess(create = false): RootAccess {
    const directory = this.authoringPath();
    if (!directory) throw new Error("Plugin authoring directory must not be a link or changed path");
    if (create && !this.authoringRoot) mkdirSync(directory, { recursive: true });
    // Recheck after mkdir before adopting a root, including an initially present junction.
    if (this.authoringPath() !== directory) throw new Error("Plugin authoring directory changed");
    this.authoringRoot ??= new RootAccess([directory]);
    this.authoringRoot.resolve(directory);
    return this.authoringRoot;
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
    if (manifest.contributes.skills.length) inspecting("assistant skill");
    validateAssistantSkills(directory, manifest);
    if (manifest.icon) { inspecting(manifest.icon); readPluginIcon(directory, manifest.icon); }
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
  private verifiedBundle(m: PluginManifest, digest: string) {
    return this.official(m, digest) || m.tier === "community" && this.designated.some(p => p.id === m.id);
  }
  private assertOperationNamesAvailable(id: string, names: string[]) {
    const requested = new Set(names);
    for (const [otherId, other] of Object.entries(this.installed)) {
      if (otherId !== id && other.operationNames.some(name => requested.has(name))) throw new Error("Plugin operation ID collision");
    }
  }
  async start() {
    let skillCleanupFailed = false;
    try { this.assistantSkills.clear(); } catch { skillCleanupFailed = true; }
    for (const item of this.supply) {
      const previous = this.installed[item.id];
      const record: Installed = { registrationId: previous?.registrationId ?? randomUUID(), directory: item.directory, digest: item.digest, enabled: previous?.enabledChoice ?? item.defaultEnabled, enabledChoice: previous?.enabledChoice, bundled: true, settings: previous?.settings ?? {}, operationNames: [] };
      this.installed[item.id] = record;
      try {
        const artifact = this.artifact(item.directory);
        if (artifact.manifest.id !== item.id || !this.official(artifact.manifest, artifact.digest)) throw new Error();
        record.operationNames = artifact.manifest.contributes.operations.map(op => `${item.id}.${op.id}`);
      } catch { this.errors.set(item.id, "Bundled plugin artifact verification failed"); }
    }

    for (const item of this.designated) {
      const previous = this.installed[item.id];
      if (previous && !previous.bundled) continue;
      const record: Installed = { registrationId: previous?.registrationId ?? randomUUID(), directory: item.directory, digest: "", trusted: previous?.trusted, enabled: previous?.enabled ?? false, enabledChoice: previous?.enabledChoice, bundled: true, settings: previous?.settings ?? {}, operationNames: [] };
      this.installed[item.id] = record;
      try {
        const artifact = this.artifact(item.directory);
        if (artifact.manifest.id !== item.id || artifact.manifest.tier !== "community") throw new Error();
        record.digest = artifact.digest;
        const names = artifact.manifest.contributes.operations.map(op => `${item.id}.${op.id}`);
        this.assertOperationNamesAvailable(item.id, names);
        record.operationNames = names;
      } catch (error) {
        this.errors.set(item.id, error instanceof Error && error.message === "Plugin operation ID collision" ? error.message : "Bundled plugin artifact verification failed");
      }
    }
    this.save();
    for (const [id, record] of Object.entries(this.installed)) if (record.enabled && !this.errors.has(id)) {
      try { await this.enable(id); } catch (error) { this.errors.set(id, "Plugin activation failed"); }
    }
    if (skillCleanupFailed) for (const id of Object.keys(this.installed)) {
      if (!this.errors.has(id)) this.errors.set(id, "Assistant skill cleanup failed; reload to recover");
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
  icon(id: string, digest: string) {
    const record = this.record(id), artifact = this.artifact(record.directory);
    if (artifact.manifest.id !== id || artifact.digest !== digest || !artifact.manifest.icon || (!this.official(artifact.manifest, digest) && !record.trusted)) throw new Error("Plugin icon unavailable");
    return readPluginIcon(record.directory, artifact.manifest.icon);
  }
  async list() {
    return Promise.all(Object.entries(this.installed).map(async ([id, r]) => {
      try {
        const { manifest: m, digest } = this.artifact(r.directory), live = this.loaded.get(id);
        if (m.id !== id) throw new Error("Artifact ID changed");
        const observed = live ? await this.status(live) : null;
        const current = live && this.loaded.get(id) === live;
        return { id, registrationId: r.registrationId, publisher: m.publisher, name: m.name, description: m.description, version: m.version, installed: true, bundled: !!r.bundled, official: this.official(m, digest), trusted: this.official(m, digest) || !!r.trusted, enabled: r.enabled, running: !!current,
          iconDigest: m.icon && (this.official(m, digest) || !!r.trusted) ? digest : undefined, folderSources: m.contributes.folderSources, healthCheck: m.contributes.healthCheck, jobs: m.contributes.jobs, secrets: await this.secretStatus(id, m), settings: r.settings, settingsSchema: m.settingsSchema, status: current ? observed : null, error: this.errors.get(id), digest };
      } catch (e) { return { id, registrationId: r.registrationId, installed: true, bundled: !!r.bundled, enabled: r.enabled, running: false, error: (e as NodeJS.ErrnoException).code === "ENOENT" ? "Plugin artifact missing" : "Plugin status unavailable", status: null }; }
    }));
  }
  private async enable(id: string): Promise<void> {
    const r = this.record(id), a = this.artifact(r.directory);
    if (a.manifest.id !== id) throw new Error("Artifact ID changed");
    if (r.bundled && !this.verifiedBundle(a.manifest, a.digest)) throw new Error("Bundled plugin artifact verification failed");
    const names = a.manifest.contributes.operations.map(op => `${id}.${op.id}`);
    this.assertOperationNamesAvailable(id, names);
    if (a.digest !== r.digest) {
      if (!r.trusted) throw new Error("Plugin trust is required");
      await this.reload(id);
      return;
    }
    if (!this.official(a.manifest, a.digest) && !r.trusted) throw new Error("Explicit plugin trust is required");
    r.operationNames = names;
    if (this.loaded.has(id)) return;
    if (!compileSchema(a.manifest.settingsSchema)(r.settings)) throw new Error("Stored settings do not satisfy this artifact schema");
    const secrets = await this.runtimeSecrets(id, a.manifest);
    const instance = await startPluginProcess(a.entry, a.manifest, structuredClone(r.settings), secrets, () => {
      this.loaded.delete(id); this.jobs.lost(id); this.errors.set(id, "Plugin process failed; reload to recover");
      try { this.assistantSkills.clear(id); } catch { this.errors.set(id, "Plugin process failed; skill cleanup failed"); }
    }, r.directory);
    this.processes.set(id, instance);
    this.loaded.set(id, { manifest: a.manifest, instance, pending: new Set() });
    this.disabling.delete(id);
    this.errors.delete(id);
    try { this.assistantSkills.install(r.directory, a.manifest); }
    catch { this.errors.set(id, "Assistant skill installation failed; reload to recover"); }
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
    let skillCleanupError: unknown;
    try { this.assistantSkills.clear(id); } catch (error) { skillCleanupError = error; }
    await this.jobs.close(id);
    const live = this.loaded.get(id), instance = this.processes.get(id); this.loaded.delete(id);
    if (live) await Promise.allSettled([...live.pending]);
    if (instance) {
      try { await instance.dispose(); }
      catch { this.errors.set(id, "Plugin disposal failed; reload to recover"); throw new Error("Plugin disposal failed; reload to recover"); }
      finally { this.processes.delete(id); }
    }
    if (skillCleanupError) throw skillCleanupError;
  }
  private async reload(id: string) {
    const r = this.record(id);
    r.enabled = false; this.save();
    try {
      await this.disable(id);
      const a = this.artifact(r.directory);
      if (a.manifest.id !== id) throw new Error("Artifact ID changed");
      if (r.bundled && !this.verifiedBundle(a.manifest, a.digest)) throw new Error("Bundled plugin artifact verification failed");
      if (!this.official(a.manifest, a.digest) && !r.trusted) throw new Error("Explicit plugin trust is required");
      const names = a.manifest.contributes.operations.map(op => `${id}.${op.id}`);
      this.assertOperationNamesAvailable(id, names);
      r.digest = a.digest; r.operationNames = names;
      await this.enable(id); r.enabled = true; r.enabledChoice = true;
    } catch (error) { this.errors.set(id, String(error)); this.save(); throw error; }
  }
  /** Block job admission before the first asynchronous store write through reload. */
  private async changeConfiguration(id: string, change: () => Promise<void> | void) {
    if (this.jobs.hasActive(id)) {
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
    return [...[...this.loaded.values()].flatMap(live => live.manifest.contributes.operations
      .filter(op => op.effect === "read" && op.rowSchema)
      .map(op => ({ operation: `${live.manifest.id}.${op.id}`, version: op.version, rowSchema: op.rowSchema!, inputSchema: op.inputSchema, ...(op.inputSuggestions ? { inputSuggestions: Object.fromEntries(Object.entries(op.inputSuggestions).map(([field, target]) => [field, { operation: `${live.manifest.id}.${target}`, version: live.manifest.contributes.operations.find(candidate => candidate.id === target)!.version }])) } : {}), ...(op.inputOptions ? { inputOptions: Object.fromEntries(Object.entries(op.inputOptions).map(([field, binding]) => [field, { operation: `${live.manifest.id}.${binding.operation}`, version: live.manifest.contributes.operations.find(candidate => candidate.id === binding.operation)!.version, depends: binding.depends }])) } : {}), ...(op.inputHints ? { inputHints: Object.fromEntries(Object.entries(op.inputHints).map(([field, target]) => [field, { operation: `${live.manifest.id}.${target}`, version: live.manifest.contributes.operations.find(candidate => candidate.id === target)!.version }])) } : {}), validateArgs: (args: unknown) => !!compileSchema(op.inputSchema)(args) })))];
  }
  /** The loaded manifest owns identity; never infer plugin IDs by splitting operation names. */
  viewOperationOwner(operation: string): string | undefined {
    return [...this.loaded.values()].find(live => live.manifest.contributes.operations.some(op => `${live.manifest.id}.${op.id}` === operation))?.manifest.id;
  }
  viewContributions() {
    return [...this.loaded.values()].flatMap(live => live.manifest.contributes.views.map(view => ({ plugin: live.manifest.id, ...view })));
  }
  viewScreens() {
    return [...this.loaded.values()].flatMap(live => live.manifest.contributes.screens.map(screen => ({ plugin: live.manifest.id, iconDigest: live.manifest.icon ? this.record(live.manifest.id).digest : undefined, ...screen })));
  }
  /** Registered namespaces remain valid even while a plugin is disabled. */
  hasViewOwner(id: string): boolean { return Object.hasOwn(this.installed, id); }
  /** Assistant admission is narrower than CLI invocation; execution/publication stay shared. */
  async invokeAssistantOperation(name: string, input: unknown) {
    const live = [...this.loaded.values()].find(live => live.manifest.contributes.operations.some(op => `${live.manifest.id}.${op.id}` === name));
    const op = live?.manifest.contributes.operations.find(op => `${live.manifest.id}.${op.id}` === name);
    if (this.closed || !live || !op) throw Object.assign(new Error("Plugin operation unavailable"), { kind: "unavailable" });
    if (op.effect !== "read" || !op.assistant && live.manifest.contributes.healthCheck !== op.id)
      throw Object.assign(new Error("Plugin operation is not available to the assistant"), { kind: "forbidden" });
    const secrets = this.secretValues(live.manifest.id);
    const reply = await this.invokeOperation(name, input);
    if ("error" in reply) return reply;
    try {
      // The common path masks values and preserves schema keys. Before AI
      // publication, refuse any remaining literal secret anywhere in the JSON.
      assertNoPluginSecrets(reply.result, secrets);
      return reply;
    } catch (error) {
      return { ...publicOperationError(error, "read"), receipt: { ...reply.receipt, outcome: "failure" } };
    }
  }
  async invokeOperation(name: string, input: unknown, folder?: string, jobCall = false, version?: number) {
    const live = [...this.loaded.values()].find(v => v.manifest.contributes.operations.some(op => `${v.manifest.id}.${op.id}` === name));
    const op = live?.manifest.contributes.operations.find(op => `${live.manifest.id}.${op.id}` === name);
    if (!live || !op) throw new Error("Operation unavailable or plugin disabled");
    if (version !== undefined && op.version !== version) throw new Error("Review operation version unavailable");
    if (version === undefined && live.manifest.contributes.reviews.some(r => [r.read, r.propose, r.approve, r.reject, r.undo].some(b => b?.operation === name))) throw new Error("Use the common review dispatcher");
    if (!jobCall && this.disabling.has(live.manifest.id)) throw new Error("Plugin is stopping");
    if (!jobCall && live.manifest.contributes.jobs.some(job => [job.start, job.status, job.stop].includes(op.id))) throw new Error("Use job start/status/stop with a requestId");
    if (!jobCall && live.manifest.contributes.jobs.some(job => job.resultKind === "native-document" && job.generatedDocument === op.id)) throw new Error("Use the common generated document dispatcher");
    const record = this.record(live.manifest.id), current = this.artifact(record.directory);
    if (current.digest !== record.digest || !this.official(current.manifest, current.digest) && !record.trusted) throw new Error("Artifact changed; reload the plugin");
    if (op.scope === "folder") throw new Error("Folder-scoped plugin operations are unsupported in stage 1");
    if (!compileSchema(op.inputSchema)(input)) throw new Error("Invalid operation input");
    const requestId = randomUUID();
    const run = Promise.resolve().then(() => live.instance.operations[op.id]!(input)); live.pending.add(run);
    try {
      const result = publicOperationResult(op, await run, this.secretValues(live.manifest.id));
      if (live.manifest.contributes.operations.some(source => Object.values(source.inputSuggestions ?? {}).includes(op.id))) inputSuggestionResultsSchema.parse(result);
      if (live.manifest.contributes.operations.some(source => Object.values(source.inputOptions ?? {}).some(binding => binding.operation === op.id))) inputOptionResultsSchema.parse(result);
      if (live.manifest.contributes.operations.some(source => Object.values(source.inputHints ?? {}).includes(op.id))) inputHintResultSchema.parse(result);
      if (live.manifest.contributes.healthCheck === op.id) healthCheckResultSchema.parse(result);
      return { result, receipt: { requestId, operation: name, version: op.version, scope: folder ?? "host", outcome: "success" } };
    } catch (error) {
      return { ...publicOperationError(error, op.effect), receipt: { requestId, operation: name, version: op.version, scope: folder ?? "host", outcome: op.effect === "write" ? "uncertain" : "failure" } };
    } finally { live.pending.delete(run); }
  }
  invoke(action: string, args: { template?: "greet" | "query" | "file"; id?: string; directory?: string; digest?: string; registrationId?: string; trust?: boolean; settings?: Record<string, unknown>; operation?: string; version?: number; input?: unknown; name?: string; plugin?: string; job?: string; root?: string; file?: string; files?: string[]; requestIds?: string[]; output?: string; requestId?: string } = {}, creationScope: FileAccess = LOCAL_FILE_ACCESS): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("Plugin Host is closing"));
    if (action.startsWith("job-")) return this.jobs.execute({ action, ...args });
    if (action === "input-hint") {
      const live = [...this.loaded.values()].find(live => live.manifest.contributes.operations.some(source => Object.values(source.inputHints ?? {}).some(target => `${live.manifest.id}.${target}` === args.operation)));
      const op = live?.manifest.contributes.operations.find(op => `${live.manifest.id}.${op.id}` === args.operation);
      if (!op || op.effect !== "read" || args.version !== op.version) return Promise.reject(new Error("Input hint operation unavailable"));
      return this.invokeOperation(args.operation!, {}, undefined, false, op.version);
    }
    if (action === "suggest") {
      const live = [...this.loaded.values()].find(live => live.manifest.contributes.operations.some(source => Object.values(source.inputSuggestions ?? {}).some(target => `${live.manifest.id}.${target}` === args.operation)));
      const op = live?.manifest.contributes.operations.find(op => `${live.manifest.id}.${op.id}` === args.operation);
      if (!op || op.effect !== "read" || args.version !== op.version) return Promise.reject(new Error("Suggestion operation unavailable"));
      return this.invokeOperation(args.operation!, args.input, undefined, false, op.version);
    }
    if (action === "options") {
      const live = [...this.loaded.values()].find(live => live.manifest.contributes.operations.some(source => Object.values(source.inputOptions ?? {}).some(binding => `${live.manifest.id}.${binding.operation}` === args.operation)));
      const op = live?.manifest.contributes.operations.find(op => `${live.manifest.id}.${op.id}` === args.operation);
      if (!op || op.effect !== "read" || args.version !== op.version) return Promise.reject(new Error("Input option operation unavailable"));
      return this.invokeOperation(args.operation!, args.input ?? {}, undefined, false, op.version);
    }
    if (action === "invoke") return this.invokeOperation(args.operation!, args.input);
    pluginManagementSchema.parse({ action, ...args });
    if (action === "list") return this.list().then(plugins => ({ plugins }));
    const run = this.serial.then(async () => {
      let id = args.id!;
      const receipt = (outcome: "success" | "failure") => ({ requestId: randomUUID(), operation: `plugins.${action}`, version: 1, scope: "host", outcome });
      if (action === "scaffold") {
        const access = args.directory === undefined ? this.authoringAccess(true) : this.access;
        const expected = args.directory === undefined ? path.join(access!.roots[0]!, id) : undefined;
        const directory = args.directory ?? expected!;
        return { ...scaffoldPlugin(directory, id, access, creationScope, args.template, expected), receipt: receipt("success") };
      }
      if (action === "validate") {
        const errors: { file: string; line: number | null; column: number | null; kind: string }[] = []; let manifestId: string | undefined;
        let file = "artifact";
        try {
          const requested = path.resolve(args.directory!), expected = this.authoringPath();
          const authored = inside(this.authoringDirectory, requested) || expected !== undefined && inside(expected, requested);
          const access = authored ? this.authoringAccess() : this.access;
          const directory = authored ? canonicalFilePath(requested) : requested;
          const a = this.artifact(accessPath(directory, access), current => { file = current; }); manifestId = a.manifest.id;
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
        this.assertOperationNamesAvailable(id, [...names]);
        const previous = Object.hasOwn(this.installed, a.manifest.id) ? this.installed[a.manifest.id] : undefined;
        if (previous?.enabled) throw new Error("Disable the plugin before replacing its registration");
        this.installed[a.manifest.id] = { registrationId: randomUUID(), directory, digest: a.digest, enabled: false, settings: previous?.settings ?? {}, operationNames: [...names] };
      } else {
        const r = this.record(id);
        if (r.bundled && action === "unregister") throw new Error("Bundled plugins can only be disabled");
        if (r.bundled && action === "trust" && this.supply.some(p => p.id === id)) throw new Error("Official plugins can only be disabled");
        if (!this.supply.some(p => p.id === id) && (action === "trust" || action === "enable" && (args.trust || args.registrationId !== undefined))) {
          if (!args.registrationId || args.registrationId !== r.registrationId) throw new Error(PLUGIN_REGISTRATION_CHANGED);
        }
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
          if (a.manifest.id !== id || args.digest !== undefined && args.digest !== a.digest) throw new Error("Artifact digest does not match");
          r.trusted = true;
        } else if (action === "enable") {
          if (args.trust) {
            if (this.supply.some(p => p.id === id)) throw new Error("Official plugins can only be disabled");
            if (this.artifact(r.directory).manifest.id !== id) throw new Error("Artifact ID changed");
            r.trusted = true;
          }
          r.enabledChoice = true; this.save();
          try { await this.enable(id); r.enabled = true; }
          catch (error) { this.errors.set(id, String(error)); throw error; }
        }
        else if (action === "reload") {
          await this.reload(id);
        }
        else if (action === "disable") { r.enabledChoice = false; r.enabled = false; this.save(); await this.disable(id); }
        else if (action === "settings") {
          if (args.settings === undefined) return { id, secrets: await this.secretStatus(id, this.artifact(r.directory).manifest), settings: r.settings, settingsSchema: this.artifact(r.directory).manifest.settingsSchema };
          const m = this.artifact(r.directory).manifest;
          const validate = compileSchema(m.settingsSchema);
          if (!validate(args.settings)) {
            const properties = m.settingsSchema.properties as Record<string, { title?: string }> | undefined;
            const detail = validate.errors?.map(error => {
              let message = error.message ?? "Invalid value";
              for (const [key, field] of Object.entries(properties ?? {})) message = message.replaceAll(`'${key}'`, `'${field.title ?? key}'`);
              return message;
            }).join("; ");
            throw new PluginSettingsError(`Invalid settings: ${detail ?? "Invalid value"}`, (validate.errors ?? []).map(error => ({
              keyword: error.keyword,
              path: error.keyword === "required" ? `${error.instancePath}/${String(error.params.missingProperty).replaceAll("~", "~0").replaceAll("/", "~1")}` : error.instancePath,
            })));
          }
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
    this.assistantSkills.clear();
    if (errors.length) throw new AggregateError(errors, "Plugin cleanup failed");
  }
}
