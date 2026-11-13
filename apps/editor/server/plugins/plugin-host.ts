import { installScreenDependencies } from "./screen-dependencies.ts";
import { compileScreen, bundleScreens } from "./screen-code.ts";
import { PluginSettingsError } from "../../shared/plugin-settings-error.ts";
import { AssistantSkillValidationError, PluginAssistantSkills, validateAssistantSkills } from "./assistant-skills.ts";
import { PLUGIN_REGISTRATION_CHANGED } from "@litzio/plugin-sdk";
import { readPluginIcon } from "./plugin-icon.ts";
import { artifactDigest } from "./artifact-digest.mjs";
import { publicOperationError, publicOperationResult, safePluginValue } from "./operation-result.ts";
import { assertNoPluginSecrets } from "./secret-redaction.ts";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync, lstatSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";
import { accessPath, canonicalFilePath, inside, RootAccess, LOCAL_FILE_ACCESS, type FileAccess } from "../file-access.ts";
import { scaffoldPlugin } from "./plugin-authoring.ts";
import { startPluginProcess } from "./plugin-process.ts";
import { healthCheckResultSchema, validateManifest, validatePluginSource, compileSchema, statusSchema, pluginManagementSchema, type PluginManifest, type PluginInstance } from "@litzio/plugin-sdk";
import { hostPaths } from "../host-paths.ts";

import { WindowsPluginSecretStore, type PluginSecretStore } from "./secret-store.ts";


type ManifestIssue = { path: PropertyKey[]; code: string; message: string; issues?: ManifestIssue[] };
type ValidationDiagnostic = { file: string; line: number | null; column: number | null; kind: string; path?: string; message?: string; code?: string };
function validationDiagnostics(error: unknown, file: string): ValidationDiagnostic[] {
  if (error instanceof AssistantSkillValidationError) return [{ file: error.file, line: null, column: null, kind: "Assistant skill validation failed", path: error.field, message: error.message, code: "invalid_skill" }];
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


type Installed = { registrationId: string; directory: string; digest: string; trusted?: boolean; enabled: boolean; settings: Record<string, unknown>; operationNames: string[] };
type Loaded = { manifest: PluginManifest; instance: PluginInstance; pending: Set<Promise<unknown>>; screens: Record<string, string> };
export class PluginHost {
  private installed: Record<string, Installed>;
  private artifacts = new Map<string, { manifest: PluginManifest; digest: string; entry: string }>();
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
  private assistantSkills: PluginAssistantSkills;
  skillDisplayName(file: string) { return this.assistantSkills.displayName(file); }
  readonly authoringDirectory: string;
  private authoringRoot?: RootAccess;
  constructor(private file = hostPaths().settingsFile("plugins"), options: { access?: FileAccess; authoringDirectory?: string; assistantDirectory?: string; secrets?: PluginSecretStore;  } = {}) {
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
    return result;
  }
  icon(id: string, digest: string) {
    const record = this.record(id), artifact = this.artifact(record.directory);
    if (artifact.manifest.id !== id || artifact.digest !== digest || !artifact.manifest.icon || !record.trusted) throw new Error("Plugin icon unavailable");
    return readPluginIcon(record.directory, artifact.manifest.icon);
  }
  async list() {
    return Promise.all(Object.entries(this.installed).map(async ([id, r]) => {
      let file = "artifact";
      try {
        const { manifest: m, digest } = this.artifact(r.directory, current => { file = current; }), live = this.loaded.get(id);
        if (m.id !== id) throw new Error("Artifact ID changed");
        const observed = live ? await this.status(live) : null;
        const current = live && this.loaded.get(id) === live;
        return { id, registrationId: r.registrationId, name: m.name, description: m.description, installed: true, trusted: !!r.trusted, enabled: r.enabled, running: !!current,
          iconDigest: m.icon && !!r.trusted ? digest : undefined, healthCheck: m.contributes.healthCheck, secrets: await this.secretStatus(id, m), settings: r.settings, settingsSchema: m.settingsSchema, status: current ? observed : null, error: this.errors.get(id), digest };
      } catch (e) { return { id, registrationId: r.registrationId, installed: true, enabled: r.enabled, running: false, error: (e as NodeJS.ErrnoException).code === "ENOENT" ? "Plugin artifact missing" : this.errors.get(id) ?? (e instanceof Error && e.name === "ScreenCompileError" ? e.message : "Plugin status unavailable"), status: null, errors: validationDiagnostics(e, file) }; }
    }));
  }
  private async enable(id: string): Promise<void> {
    const r = this.record(id), a = this.artifact(r.directory);
    if (a.manifest.id !== id) throw new Error("Artifact ID changed");
    const names = a.manifest.contributes.operations.map(op => `${id}.${op.id}`);
    this.assertOperationNamesAvailable(id, names);
    if (a.digest !== r.digest) {
      if (!r.trusted) throw new Error("Plugin trust is required");
      await this.reload(id);
      return;
    }
    if (!r.trusted) throw new Error("Explicit plugin trust is required");
    r.operationNames = names;
    if (this.loaded.has(id)) return;
    if (!compileSchema(a.manifest.settingsSchema)(r.settings)) throw new Error("Stored settings do not satisfy this artifact schema");
    const screens = Object.fromEntries(a.manifest.contributes.screens.filter(s => s.entry).map(s => [s.id, compileScreen(r.directory, s.entry!)]));
    const secrets = await this.runtimeSecrets(id, a.manifest);
    const instance = await startPluginProcess(a.entry, a.manifest, structuredClone(r.settings), secrets, () => {
      this.loaded.delete(id); this.errors.set(id,"Plugin process failed; reload to recover");
      try { this.assistantSkills.clear(id); } catch { this.errors.set(id, "Plugin process failed; skill cleanup failed"); }
    }, r.directory);
    this.processes.set(id, instance);
    this.loaded.set(id, { manifest: a.manifest, instance, pending: new Set(), screens });
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
  private async runtimeSecrets(id: string, m: PluginManifest, remember = true) {
    if (!this.secrets.supported) {
      if (m.secrets.some(s => s.required)) throw new Error("Plugin secrets unsupported on this Host (Windows required)");
      return Object.freeze({} as Record<string, string>);
    }
    if (remember) this.redactionSecrets.set(id, new Map());
    const secrets: Record<string, string> = {};
    for (const s of m.secrets) {
      const value = await this.secrets.read(id, s.id);
      if (value !== undefined) { if (remember) this.rememberSecret(id, s.id, value); secrets[s.id] = value; }
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
      if (!r.trusted) throw new Error("Explicit plugin trust is required");
      const names = a.manifest.contributes.operations.map(op => `${id}.${op.id}`);
      this.assertOperationNamesAvailable(id, names);
      r.digest = a.digest; r.operationNames = names;
      await this.enable(id); r.enabled = true;
    } catch (error) { this.errors.set(id, String(error)); this.save(); throw error; }
  }
  /** Serialize settings/secret replacement with reload. */
  private async changeConfiguration(id: string, change: () => Promise<void> | void) {
    const enabled = this.record(id).enabled;
    if (enabled) this.disabling.add(id);
    try {
      await change();
      this.save();
      if (enabled) await this.reload(id);
    } finally { if (enabled) this.disabling.delete(id); }
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
    const record = this.record(live.manifest.id), current = this.artifact(record.directory);
    if (current.digest !== record.digest || !record.trusted) throw new Error("Artifact changed; reload the plugin");
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
        let file = "artifact";
        let candidate: PluginInstance | undefined;
        try {
          const requested = args.directory ?? path.join(this.authoringAccess().roots[0]!, id);
          const directory = accessPath(requested, inside(this.authoringDirectory, path.resolve(requested)) ? this.authoringAccess() : this.access);
          accessPath(directory, creationScope);
          file = "litzio-plugin.json";
          const manifest = validateManifest(readArtifactJson(path.join(directory, file)));
          const codeScreens = manifest.contributes.screens.filter(screen => screen.entry);
          const hasDependencies = existsSync(path.join(directory, "package.json")) && Object.keys((readArtifactJson(path.join(directory, "package.json")) as { dependencies?: Record<string, string> }).dependencies ?? {}).length > 0;
          const hasBundle = codeScreens.some(screen => existsSync(path.join(directory, screen.entry!.replace(/\.[^.]+$/, ".bundle.js"))));
          if (codeScreens.length && (hasDependencies || hasBundle)) bundleScreens(directory);
          const a = this.artifact(directory, current => { file = current; });
          const errors = validatePluginSource(readFileSync(a.entry, "utf8"), a.manifest).map(issue => ({ file: a.manifest.entry, ...issue }));
          if (errors.length) return { valid: false, errors, receipt: receipt("failure") };
          id = a.manifest.id;
          if (args.id && args.id !== id) throw new Error("Artifact ID changed");
          const names = a.manifest.contributes.operations.map(op => `${id}.${op.id}`);
          this.assertOperationNamesAvailable(id, names);
          const previous = Object.hasOwn(this.installed, id) ? this.installed[id] : undefined;
          const settings = previous?.settings ?? {};
          if (!compileSchema(a.manifest.settingsSchema)(settings)) throw new Error("Stored settings do not satisfy this artifact schema");
          const screens = Object.fromEntries(codeScreens.map(screen => [screen.id, compileScreen(directory, screen.entry!)]));
          const secrets = await this.runtimeSecrets(id, a.manifest, false);
          file = a.manifest.entry;
          // Prepare the replacement before touching the active registration or process.
          candidate = await startPluginProcess(a.entry, a.manifest, structuredClone(settings), secrets, () => {
            if (!candidate || this.processes.get(id) !== candidate) return;
            this.loaded.delete(id); this.errors.set(id,"Plugin process failed; reload to recover");
      try { this.assistantSkills.clear(id); } catch { this.errors.set(id, "Plugin process failed; skill cleanup failed"); }
          }, directory);
          statusSchema.parse(await candidate.status());
          await this.disable(id);
          this.installed[id] = { registrationId: previous?.registrationId ?? randomUUID(), directory, digest: a.digest, trusted: true, enabled: true, settings, operationNames: names };
          this.redactionSecrets.set(id, new Map(Object.entries(secrets)));
          this.processes.set(id, candidate);
          this.loaded.set(id, { manifest: a.manifest, instance: candidate, pending: new Set(), screens });
          this.disabling.delete(id); this.errors.delete(id);
          this.save();
          try { this.assistantSkills.install(directory, a.manifest); }
          catch { this.errors.set(id, "Assistant skill installation failed; reload to recover"); }
          return { id, plugins: await this.list(), receipt: receipt("success") };
        } catch (error) {
          const errors = validationDiagnostics(error, file);
          if (candidate && this.processes.get(id) !== candidate) {
            try { await candidate.dispose(); }
            catch (cleanupError) { errors.push(...validationDiagnostics(cleanupError, file)); }
          }
          return { id, valid: false, errors, receipt: receipt("failure") };
        }
      }
      if (action === "scaffold") {
        const access = args.directory === undefined ? this.authoringAccess(true) : this.access;
        const expected = args.directory === undefined ? path.join(access!.roots[0]!, id) : undefined;
        const directory = args.directory ?? expected!;
        return { ...scaffoldPlugin(directory, id, access, creationScope, args.template, expected), receipt: receipt("success") };
      }
      if (action === "bundle" || action === "dependencies") {
        const requested = path.resolve(args.directory!);
        const authored = inside(this.authoringDirectory, requested);
        const directory = accessPath(requested, authored ? this.authoringAccess() : this.access);
        accessPath(directory, creationScope);
        return { ...(action === "dependencies" ? await installScreenDependencies(directory) : bundleScreens(directory)), receipt: receipt("success") };
      }
      if (action === "validate") {
        const errors: ValidationDiagnostic[] = []; let manifestId: string | undefined;
        let file = "artifact";
        try {
          const requested = path.resolve(args.directory!), expected = this.authoringPath();
          const authored = inside(this.authoringDirectory, requested) || expected !== undefined && inside(expected, requested);
          const access = authored ? this.authoringAccess() : this.access;
          const directory = authored ? canonicalFilePath(requested) : requested;
          const a = this.artifact(accessPath(directory, access), current => { file = current; }); manifestId = a.manifest.id;
          errors.push(...validatePluginSource(readFileSync(a.entry, "utf8"), a.manifest).map(issue => ({ file: "host entry", ...issue })));
        } catch (error) {
          errors.push(...validationDiagnostics(error, file));
        }
        return { id: manifestId, valid: errors.length === 0, errors, limitations: "Static literal handlers only; computed output and activation behavior are checked at runtime.", receipt: receipt(errors.length ? "failure" : "success") };
      }
      if (action === "register") {
        const directory = realpathSync(args.directory!), a = this.artifact(directory);
        id = a.manifest.id;
        const names = new Set(a.manifest.contributes.operations.map(operation => `${a.manifest.id}.${operation.id}`));
        this.assertOperationNamesAvailable(id, [...names]);
        const previous = Object.hasOwn(this.installed, a.manifest.id) ? this.installed[a.manifest.id] : undefined;
        if (previous?.enabled) throw new Error("Disable the plugin before replacing its registration");
        this.installed[a.manifest.id] = { registrationId: randomUUID(), directory, digest: a.digest, enabled: false, settings: previous?.settings ?? {}, operationNames: [...names] };
      } else {
        const r = this.record(id);
        if (action === "trust" || action === "enable" && (args.trust || args.registrationId !== undefined)) {
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
            if (this.artifact(r.directory).manifest.id !== id) throw new Error("Artifact ID changed");
            r.trusted = true;
          }
          this.save();
          try { await this.enable(id); r.enabled = true; }
          catch (error) { this.errors.set(id, String(error)); throw error; }
        }
        else if (action === "reload") {
          await this.reload(id);
        }
        else if (action === "disable") { r.enabled = false; this.save(); await this.disable(id); }
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
