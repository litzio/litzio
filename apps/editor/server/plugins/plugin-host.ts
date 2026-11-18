import { availableHostCli } from "../host-cli.ts";
import type { PluginCli } from "@litzio/plugin-sdk";
import { installScreenDependencies } from "./screen-dependencies.ts";
import { compileScreen, bundleScreens } from "./screen-code.ts";
import { PluginSettingsError } from "../../shared/plugin-settings-error.ts";
import { AssistantSkillValidationError, PluginAssistantSkills, validateAssistantSkills } from "./assistant-skills.ts";
import { PLUGIN_REGISTRATION_CHANGED } from "@litzio/plugin-sdk";
import { readPluginIcon } from "./plugin-icon.ts";
import { artifactDigest } from "./artifact-digest.mjs";
import { InstalledArtifacts } from "./installed-artifacts.ts";
import { publicOperationError, publicOperationResult, publicInputIssues, safePluginValue } from "./operation-result.ts";
import { assertNoPluginSecrets } from "./secret-redaction.ts";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync, lstatSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";
import { accessPath, canonicalFilePath, inside, RootAccess, FileAccessError, LOCAL_FILE_ACCESS, type FileAccess } from "../file-access.ts";
import { scaffoldPlugin } from "./plugin-authoring.ts";
import { startPluginProcess } from "./plugin-process.ts";
import { healthCheckResultSchema, validateManifest, validatePluginSource, compileSchema, statusSchema, pluginManagementSchema, type PluginManifest, type PluginInstance } from "@litzio/plugin-sdk";
import { hostPaths } from "../host-paths.ts";

import { WindowsPluginSecretStore, type PluginSecretStore } from "./secret-store.ts";


type ManifestIssue = { path: PropertyKey[]; code: string; message: string; issues?: ManifestIssue[] };
type ValidationDiagnostic = { file: string; line: number | null; column: number | null; kind: string; path?: string; message?: string; code?: string };
function validationDiagnostics(error: unknown, file: string): ValidationDiagnostic[] {
  if (error instanceof AssistantSkillValidationError) return [{ file: error.file, line: null, column: null, kind: "Assistant skill validation failed", path: error.field, message: error.message, code: "invalid_skill" }];
  if (file === "artifact directory") {
    const code = error instanceof FileAccessError ? "outside_plugin_scope" : (error as NodeJS.ErrnoException)?.code;
    const message = error instanceof FileAccessError
      ? "Expected a directory inside the pinned plugin authoring folder or allowed Host folders, and the active write scope."
      : code === "ENOENT" || code === "ENOTDIR" ? "Expected an existing plugin directory; a directory or parent is missing."
      : code === "EACCES" || code === "EPERM" ? "Expected a readable plugin directory; filesystem access was denied."
      : "Expected a real plugin directory with unchanged authoring roots; check directory links and Host access.";
    return [{ file, line: null, column: null, kind: "Artifact directory rejected", path: "directory", message, code: typeof code === "string" && /^[a-zA-Z_]+$/.test(code) ? code : "invalid_artifact_directory" }];
  }
  const value = error as { name?: string; message?: string; loc?: { file?: string; line: number; column: number }; jsonLocation?: { line: number; column: number }; issues?: ManifestIssue[] };
  if (value?.name === "ScreenCompileError") return [{ file: value.loc?.file ?? file, line: value.loc?.line ?? null, column: value.loc ? value.loc.column + 1 : null, kind: "Screen compilation failed", message: value.message }];
  if (value?.name === "ZodError" && value.issues) {
    const expand = (issues: ManifestIssue[], prefix: PropertyKey[] = []): ValidationDiagnostic[] => issues.flatMap(issue => {
      const parts = [...prefix, ...issue.path];
      if (issue.code === "invalid_key" && issue.issues) return expand(issue.issues, parts);
      return [{ file, line: null, column: null, kind: "Manifest schema violation", path: parts.reduce<string>((text, part) => typeof part === "number" ? `${text}[${part}]` : text ? `${text}.${String(part)}` : String(part), "") || "$", message: issue.message, code: issue.code }];
    });
    return expand(value.issues);
  }
  const location = /line (\d+) column (\d+)/.exec(value?.message ?? "");
  return [{ file, line: value?.jsonLocation?.line ?? value?.loc?.line ?? (location ? Number(location[1]) : null), column: value?.jsonLocation?.column ?? (value?.loc ? value.loc.column + 1 : location ? Number(location[2]) : null), kind: error instanceof SyntaxError ? file === "host entry" ? "JavaScript syntax error" : "JSON syntax error" : "Artifact or SDK/schema validation failed", ...(error instanceof SyntaxError ? { path: "$", message: "Invalid syntax; correct the indicated location.", code: "invalid_syntax" } : {}) }];
}
function readArtifactJson(file: string): unknown {
  const source = readFileSync(file, "utf8");
  try { return JSON.parse(source); }
  catch (error) {
    if (error instanceof SyntaxError) {
      const match = /position (\d+)/.exec(error.message);
      const offset = match ? Number(match[1]) : /end of JSON/i.test(error.message) ? source.length : undefined;
      if (offset !== undefined) {
        const lines = source.slice(0, offset).split("\n");
        Object.assign(error, { jsonLocation: { line: lines.length, column: lines.at(-1)!.length + 1 } });
      }
    }
    throw error;
  }
}


type Installed = { registrationId: string; installationId: string; sourceDirectory: string; sourceDigest: string; digest: string; trusted?: boolean; enabled: boolean; settings: Record<string, unknown>; operationNames: string[] };
type Artifact = { manifest: PluginManifest; digest: string; entry: string };
type Loaded = { manifest: PluginManifest; instance: PluginInstance; pending: Set<Promise<unknown>>; screens: Record<string, string> };
export class PluginHost {
  private installed: Record<string, Installed>;
  private artifacts = new Map<string, Artifact>();
  private copies: InstalledArtifacts;
  private loaded = new Map<string, Loaded>();
  private processes = new Map<string, PluginInstance>();
  private errors = new Map<string, string>();
  private serial: Promise<unknown> = Promise.resolve();
  private closed = false;
  private disabling = new Set<string>();
  private secrets: PluginSecretStore;
  private redactionSecrets = new Map<string, Map<string, string>>();
  private secretValues(id: string) { return [...(this.redactionSecrets.get(id)?.values() ?? [])]; }
  private rememberSecret(id: string, name: string, value: string) {
    if (!this.redactionSecrets.has(id)) this.redactionSecrets.set(id, new Map());
    this.redactionSecrets.get(id)!.set(name, value);
  }
  private access: FileAccess;
  private cli?: PluginCli;
  private assistantSkills: PluginAssistantSkills;
  skillDisplayName(file: string) { return this.assistantSkills.displayName(file); }
  readonly authoringDirectory: string;
  private authoringRoot?: RootAccess;
  constructor(private file = hostPaths().settingsFile("plugins"), options: { access?: FileAccess; authoringDirectory?: string; assistantDirectory?: string; secrets?: PluginSecretStore; cli?: PluginCli | null; } = {}) {
    this.copies = new InstalledArtifacts(file);
    this.cli = options.cli === null ? undefined : options.cli ?? availableHostCli();
    this.assistantSkills = new PluginAssistantSkills(options.assistantDirectory ?? path.join(path.dirname(file), "assistant"));
    this.authoringDirectory = options.authoringDirectory ?? hostPaths().plugins;
    this.access = options.access ?? LOCAL_FILE_ACCESS;
    this.secrets = options.secrets ?? new WindowsPluginSecretStore(`${file}.secrets`);
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
  /** Use the same pinned directory for configured aliases and scaffold's canonical result. */
  private artifactDirectory(requested: string, creationScope: FileAccess = LOCAL_FILE_ACCESS): string {
    requested = path.resolve(requested);
    const expected = this.authoringPath();
    const authored = inside(this.authoringDirectory, requested) || expected !== undefined && inside(expected, requested);
    const access = authored ? this.authoringAccess() : this.access;
    const directory = accessPath(authored ? canonicalFilePath(requested) : requested, access);
    return accessPath(canonicalFilePath(directory), creationScope);
  }
  private save(records = this.installed) {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(records, null, 2) + "\n", { flag: "wx" }); renameSync(temporary, this.file); }
    finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  private setRecord(id: string, record: Installed) {
    const next = { ...this.installed, [id]: record };
    this.save(next);
    this.installed = next;
  }
  private installedDirectory(record: Pick<Installed, "installationId">) { return this.copies.directory(record.installationId); }
  private removeCopy(record: Pick<Installed, "installationId">) {
    try { this.artifacts.delete(this.installedDirectory(record)); } catch { /* unavailable copy */ }
    this.copies.remove(record.installationId);
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
    const manifest = validateManifest(readArtifactJson(path.join(directory, "litzio-plugin.json")));
    if (manifest.contributes.skills.length) inspecting("assistant skill");
    validateAssistantSkills(directory, manifest);
    if (manifest.icon) { inspecting(manifest.icon); readPluginIcon(directory, manifest.icon); }
    for (const screen of manifest.contributes.screens) if (screen.entry) { inspecting(screen.entry); compileScreen(directory, screen.entry); }
    inspecting("package.json");
    inspecting("host entry");
    const entry = realpathSync(path.join(directory, manifest.entry));
    if (path.relative(directory, entry).startsWith("..") || !statSync(entry).isFile()) throw new Error("Invalid entry");
    compileSchema(manifest.settingsSchema);
    for (const op of manifest.contributes.operations) { compileSchema(op.inputSchema); compileSchema(op.outputSchema); }
    this.artifacts.set(directory, { manifest, digest, entry });
    return structuredClone({ manifest, digest, entry });
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
    this.save();
    try { this.copies.cleanOrphans(new Set(Object.values(this.installed).map(record => record.installationId))); }
    catch { console.warn("Unable to inspect Host plugin artifact storage for cleanup"); }
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
    const secrets = this.secretValues(live.manifest.id);
    const result = statusSchema.parse(safePluginValue(await live.instance.status(), secrets));
    return result;
  }
  icon(id: string, digest: string) {
    const record = this.record(id), artifact = this.artifact(this.installedDirectory(record));
    if (artifact.manifest.id !== id || artifact.digest !== record.digest || record.digest !== digest || !artifact.manifest.icon || !record.trusted) throw new Error("Plugin icon unavailable");
    return readPluginIcon(this.installedDirectory(record), artifact.manifest.icon);
  }
  async list() {
    return Promise.all(Object.entries(this.installed).map(async ([id, r]) => {
      let file = "artifact directory";
      try {
        const { manifest: m, digest } = this.artifact(this.installedDirectory(r), current => { file = current; }), live = this.loaded.get(id);
        if (m.id !== id || digest !== r.digest) {
          return { id, registrationId: r.registrationId, installed: true, enabled: r.enabled, running: false, status: null, error: "Artifact changed; reload the plugin" };
        }
        const observed = live ? await this.status(live) : null;
        const current = live && this.loaded.get(id) === live;
        return { id, registrationId: r.registrationId, name: m.name, description: m.description, version: m.version ?? null, installed: true, trusted: !!r.trusted, enabled: r.enabled, running: !!current,
          iconDigest: m.icon && !!r.trusted ? digest : undefined, healthCheck: m.contributes.healthCheck, secrets: await this.secretStatus(id, m), settings: r.settings, settingsSchema: m.settingsSchema, status: current ? observed : null, error: this.errors.get(id), digest };
      } catch (e) { return { id, registrationId: r.registrationId, installed: true, enabled: r.enabled, running: false, error: (e as NodeJS.ErrnoException).code === "ENOENT" ? "Plugin artifact missing" : this.errors.get(id) ?? (e instanceof Error && e.name === "ScreenCompileError" ? e.message : "Plugin status unavailable"), status: null, errors: validationDiagnostics(e, file) }; }
    }));
  }
  private async enable(id: string) {
    const previous = this.record(id);
    const directory = this.installedDirectory(previous), artifact = this.artifact(directory);
    if (artifact.manifest.id !== id) throw new Error("Artifact ID changed");
    if (!previous.trusted) throw new Error("Explicit plugin trust is required");
    if (artifact.digest !== previous.digest) throw new Error("Artifact changed; reload the plugin");
    if (!this.loaded.has(id)) await this.activate({ ...previous, enabled: true }, directory, artifact, previous);
  }
  private async activate(record: Installed, directory: string, artifact: Artifact, previous?: Installed, checkCandidate = false) {
    const { manifest } = artifact, { id } = manifest;
    if (!compileSchema(manifest.settingsSchema)(record.settings)) throw new Error("Stored settings do not satisfy this artifact schema");
    const screens = Object.fromEntries(manifest.contributes.screens.filter(s => s.entry).map(s => [s.id, compileScreen(directory, s.entry!)]));
    const secrets = await this.runtimeSecrets(id, manifest);
    let candidate: PluginInstance | undefined;
    try {
      candidate = await startPluginProcess(artifact.entry, manifest, structuredClone(record.settings), secrets, () => {
        if (!candidate || this.processes.get(id) !== candidate) return;
        this.loaded.delete(id); this.errors.set(id, "Plugin process failed; reload to recover");
        try { this.assistantSkills.clear(id); } catch { this.errors.set(id, "Plugin process failed; skill cleanup failed"); }
      }, directory, this.cli);
      if (checkCandidate) statusSchema.parse(safePluginValue(await candidate.status(), Object.values(secrets)));
      const oldLive = this.loaded.get(id), oldProcess = this.processes.get(id);
      this.assistantSkills.install(directory, manifest, () => {
        const current = Object.hasOwn(this.installed, id) ? this.installed[id] : undefined;
        if (current !== previous) throw new Error(PLUGIN_REGISTRATION_CHANGED);
        this.setRecord(id, record);
      });
      this.redactionSecrets.set(id, new Map(Object.entries(secrets)));
      this.processes.set(id, candidate);
      this.loaded.set(id, { manifest, instance: candidate, pending: new Set(), screens });
      this.disabling.delete(id);
      this.errors.delete(id);
      // Remaining calls belong to the previous process even after routing switches.
      try { await this.drainAndDispose(oldLive, oldProcess); }
      catch { console.warn("Previous plugin process disposal failed after activation"); }
    } finally {
      if (candidate && this.processes.get(id) !== candidate) {
        try { await candidate.dispose(); } catch { console.warn("Candidate plugin process disposal failed"); }
      }
    }
  }
  private declaredSecret(id: string, name: string) {
    const m = this.artifact(this.installedDirectory(this.record(id))).manifest;
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
      if (value !== undefined) secrets[s.id] = value;
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
    const live = this.loaded.get(id), instance = this.processes.get(id); this.loaded.delete(id);
    try { await this.drainAndDispose(live, instance); }
    catch { this.errors.set(id, "Plugin disposal failed; reload to recover"); throw new Error("Plugin disposal failed; reload to recover"); }
    finally { this.processes.delete(id); }
    if (skillCleanupError) throw skillCleanupError;
  }
  private async drainAndDispose(live?: Loaded, instance?: PluginInstance) {
    if (live) await Promise.allSettled([...live.pending]);
    await instance?.dispose();
  }
  /** Configuration changes restart the installed copy and never read the source. */
  private async changeConfiguration(id: string, change: () => Promise<void> | void) {
    const record = this.record(id);
    if (record.enabled) this.disabling.add(id);
    try {
      await change();
      this.save();
      if (record.enabled) {
        record.enabled = false;
        this.save();
        await this.disable(id);
        try { await this.enable(id); }
        catch (error) { this.errors.set(id, String(error)); throw error; }
      }
    } finally { this.disabling.delete(id); }
  }
  /** Stage the same local snapshot for folder registration, install and reload. */
  private async applySource(action: "register" | "install" | "reload", sourceDirectory: string, expectedId?: string,
    inspecting: (file: string) => void = () => {}) {
    const copy = this.copies.copy(sourceDirectory);
    let applied = false;
    try {
      inspecting("litzio-plugin.json");
      const manifest = validateManifest(readArtifactJson(path.join(copy.directory, "litzio-plugin.json")));
      const { id } = manifest;
      if (expectedId && id !== expectedId) throw new Error("Artifact ID changed");
      const previous = Object.hasOwn(this.installed, id) ? this.installed[id] : undefined;
      if (action === "register" && previous?.enabled) throw new Error("Disable the plugin before replacing its registration");
      if (action === "reload" && !previous?.trusted) throw new Error("Explicit plugin trust is required");

      const screens = manifest.contributes.screens.filter(screen => screen.entry);
      inspecting("package.json");
      const packageFile = path.join(copy.directory, "package.json");
      const dependencies = existsSync(packageFile) &&
        Object.keys((readArtifactJson(packageFile) as { dependencies?: Record<string, string> }).dependencies ?? {}).length > 0;
      const hasBundle = screens.some(screen => existsSync(path.join(copy.directory, screen.entry!.replace(/\.[^.]+$/, ".bundle.js"))));
      // Bundled distributions need no npm tree. Rebuild from editable sources when
      // local dependencies are available, or when a dependency-free bundle exists.
      if (screens.length && (dependencies ? existsSync(path.join(copy.directory, "node_modules")) : hasBundle)) {
        bundleScreens(copy.directory);
      }
      const artifact = this.artifact(copy.directory, inspecting);
      inspecting(artifact.manifest.entry);
      if (action === "install") {
        const errors = validatePluginSource(readFileSync(artifact.entry, "utf8"), artifact.manifest).map(issue => ({ file: artifact.manifest.entry, ...issue }));
        if (errors.length) return { id, errors };
      }
      const operationNames = manifest.contributes.operations.map(op => `${id}.${op.id}`);
      this.assertOperationNamesAvailable(id, operationNames);
      const active = action !== "register";
      const record = { registrationId: active && previous ? previous.registrationId : randomUUID(),
        installationId: copy.installationId, sourceDirectory, sourceDigest: copy.sourceDigest,
        digest: artifact.digest, trusted: active, enabled: active, settings: previous?.settings ?? {}, operationNames };
      if (active) await this.activate(record, copy.directory, artifact, previous, true);
      else {
        this.setRecord(id, record);
        this.errors.delete(id);
      }
      applied = true;
      if (previous) this.removeCopy(previous);
      return { id };
    } finally {
      if (!applied) this.removeCopy(copy);
    }
  }
  /** The loaded manifest owns identity; never infer plugin IDs by splitting operation names. */
  viewOperationOwner(operation: string): string | undefined {
    return [...this.loaded.values()].find(live => live.manifest.contributes.operations.some(op => `${live.manifest.id}.${op.id}` === operation))?.manifest.id;
  }
  viewScreens(includeCode = true) {
    return [...this.loaded.values()].flatMap(live => live.manifest.contributes.screens.map(screen => ({ plugin: live.manifest.id, ...(live.screens[screen.id] ? { ...(includeCode ? { code: live.screens[screen.id] } : {}), codeRevision: this.record(live.manifest.id).digest } : {}), iconDigest: live.manifest.icon ? this.record(live.manifest.id).digest : undefined, ...screen })));
  }
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
  async invokeOperation(name: string, input: unknown, folder?: string, screenOwner?: string) {
    const live = screenOwner ? this.loaded.get(screenOwner) : [...this.loaded.values()].find(v => v.manifest.contributes.operations.some(op => `${v.manifest.id}.${op.id}` === name));
    const local = screenOwner && name.startsWith(`${screenOwner}.`) ? name.slice(screenOwner.length + 1) : undefined;
    const op = live?.manifest.contributes.operations.find(op => `${live.manifest.id}.${op.id}` === name) ??
      (local && live?.manifest.contributes.screens.some(screen => screen.entry) && Object.hasOwn(live.instance.operations, local) ?
        { id: local, version: 1, effect: "write" as const, scope: "host", assistant: false, inputSchema: {}, outputSchema: {} } : undefined);
    if (!live || !op) throw new Error("Operation unavailable or plugin disabled");
    if (this.disabling.has(live.manifest.id)) throw new Error("Plugin is stopping");
    const record = this.record(live.manifest.id);
    if (!record.trusted || artifactDigest(this.installedDirectory(record)) !== record.digest) throw new Error("Artifact changed; reload the plugin");
    if (op.scope === "folder") throw new Error("Folder-scoped plugin operations are unsupported in stage 1");
    const requestId = randomUUID();
    const validate = compileSchema(op.inputSchema);
    if (!validate(input)) {
      const inputIssues = publicInputIssues(validate.errors, op.inputSchema, this.secretValues(live.manifest.id));
      const message = "Invalid operation input: " + inputIssues.map(issue => `${issue.path}: ${issue.reason}`).join(" ");
      return { errorKind: "invalid_input", error: message, inputIssues, receipt: { requestId, operation: name, version: op.version, scope: folder ?? "host", outcome: "refused" } };
    }
    const secrets = this.secretValues(live.manifest.id);
    const run = Promise.resolve().then(() => live.instance.operations[op.id]!(input)); live.pending.add(run);
    try {
      const result = publicOperationResult(op, await run, secrets);
      if (live.manifest.contributes.healthCheck === op.id) healthCheckResultSchema.parse(result);
      return { result, receipt: { requestId, operation: name, version: op.version, scope: folder ?? "host", outcome: "success" } };
    } catch (error) {
      return { ...publicOperationError(error, op.effect, secrets), receipt: { requestId, operation: name, version: op.version, scope: folder ?? "host", outcome: op.effect === "write" ? "uncertain" : "failure" } };
    } finally { live.pending.delete(run); }
  }
  invoke(action: string, args: { template?: "greet" | "screen" | "chart"; id?: string; directory?: string; digest?: string; registrationId?: string; trust?: boolean; settings?: Record<string, unknown>; operation?: string; version?: number; input?: unknown; name?: string; plugin?: string; job?: string; root?: string; file?: string; files?: string[]; requestIds?: string[]; output?: string; requestId?: string } = {}, creationScope: FileAccess = LOCAL_FILE_ACCESS): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("Plugin Host is closing"));
    if (action === "screen-invoke") return this.invokeOperation(args.operation!, args.input, undefined, args.plugin);
    if (action === "invoke") return this.invokeOperation(args.operation!, args.input);
    pluginManagementSchema.parse({ action, ...args });
    if (action === "list") return this.list().then(plugins => ({ plugins }));
    const run = this.serial.then(async () => {
      let id = args.id!;
      const receipt = (outcome: "success" | "failure") => ({ requestId: randomUUID(), operation: `plugins.${action}`, version: 1, scope: "host", outcome });
      if (action === "install") {
        let file = "artifact directory";
        try {
          const requested = args.directory ?? path.join(this.authoringAccess().roots[0]!, id);
          const directory = this.artifactDirectory(requested, creationScope);
          const result = await this.applySource("install", directory, args.id, current => { file = current; });
          id = result.id;
          if (result.errors) return { id, valid: false, errors: result.errors, receipt: receipt("failure") };
          return { id, plugins: await this.list(), receipt: receipt("success") };
        } catch (error) {
          return { id, valid: false, errors: validationDiagnostics(error, file), receipt: receipt("failure") };
        }
      }
      if (action === "scaffold") {
        const access = args.directory === undefined ? this.authoringAccess(true) : this.access;
        const expected = args.directory === undefined ? path.join(access!.roots[0]!, id) : undefined;
        const directory = args.directory ?? expected!;
        return { ...scaffoldPlugin(directory, id, access, creationScope, args.template, expected), receipt: receipt("success") };
      }
      if (action === "bundle" || action === "dependencies") {
        const directory = this.artifactDirectory(args.directory!, creationScope);
        return { ...(action === "dependencies" ? await installScreenDependencies(directory) : bundleScreens(directory)), receipt: receipt("success") };
      }
      if (action === "validate") {
        const errors: ValidationDiagnostic[] = []; let manifestId: string | undefined;
        let file = "artifact directory";
        try {
          const directory = this.artifactDirectory(args.directory!);
          const a = this.artifact(directory, current => { file = current; }); manifestId = a.manifest.id;
          errors.push(...validatePluginSource(readFileSync(a.entry, "utf8"), a.manifest).map(issue => ({ file: "host entry", ...issue })));
        } catch (error) {
          errors.push(...validationDiagnostics(error, file));
        }
        return { id: manifestId, valid: errors.length === 0, errors, limitations: "Static literal handlers only; computed output and activation behavior are checked at runtime.", receipt: receipt(errors.length ? "failure" : "success") };
      }
      if (action === "register") {
        const directory = this.artifactDirectory(args.directory!, creationScope);
        ({ id } = await this.applySource("register", directory));
        return { id, plugins: await this.list(), receipt: receipt("success") };
      } else {
        const r = this.record(id);
        if (action === "trust" || action === "enable" && (args.trust || args.registrationId !== undefined)) {
          if (!args.registrationId || args.registrationId !== r.registrationId) throw new Error(PLUGIN_REGISTRATION_CHANGED);
        }
        if (action === "unregister") {
          r.enabled = false; this.save(); await this.disable(id);
          if (this.secrets.supported) await this.secrets.delete(id);
          this.redactionSecrets.delete(id);
          const next = { ...this.installed };
          delete next[id];
          this.save(next);
          this.installed = next;
          this.errors.delete(id);
          this.removeCopy(r);
          return { id, plugins: await this.list(), receipt: receipt("success") };
        } else if (action === "secret-status") {
          return { id, secrets: await this.secretStatus(id, this.artifact(this.installedDirectory(r)).manifest), receipt: { requestId: randomUUID(), operation: "plugins.secret-status", version: 1, scope: "host", outcome: "success" } };
        } else if (action === "secret-delete") {
          this.declaredSecret(id, args.name!);
          await this.changeConfiguration(id, async () => {
            await this.secrets.delete(id, args.name!);
            if (!r.enabled) this.redactionSecrets.get(id)?.delete(args.name!);
          });
        } else if (action === "trust") {
          const a = this.artifact(this.installedDirectory(r));
          if (a.manifest.id !== id || a.digest !== r.digest || args.digest !== undefined && args.digest !== a.digest) throw new Error("Artifact digest does not match");
          r.trusted = true;
        } else if (action === "enable") {
          if (args.trust) {
            if (this.artifact(this.installedDirectory(r)).manifest.id !== id) throw new Error("Artifact ID changed");
            r.trusted = true;
          }
          this.save();
          try { await this.enable(id); }
          catch (error) { this.errors.set(id, String(error)); throw error; }
        }
        else if (action === "reload") {
          // The pinned source may disappear or become invalid without affecting the running copy.
          const directory = this.artifactDirectory(r.sourceDirectory, creationScope);
          if (path.relative(r.sourceDirectory, directory) !== "") throw new Error("Plugin source directory changed");
          await this.applySource("reload", directory, id);
          return { id, plugins: await this.list(), receipt: receipt("success") };
        }
        else if (action === "disable") { r.enabled = false; this.save(); await this.disable(id); }
        else if (action === "settings") {
          if (args.settings === undefined) return { id, secrets: await this.secretStatus(id, this.artifact(this.installedDirectory(r)).manifest), settings: r.settings, settingsSchema: this.artifact(this.installedDirectory(r)).manifest.settingsSchema };
          const m = this.artifact(this.installedDirectory(r)).manifest;
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
