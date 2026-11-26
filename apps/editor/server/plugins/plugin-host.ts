import { availableHostCli } from "../host-cli.ts";
import type { PluginCli } from "@litzio/plugin-sdk";
import { installScreenDependencies, ScreenDependencyError } from "./screen-dependencies.ts";
import { compileScreen, bundleScreens } from "./screen-code.ts";
import { PluginSettingsError } from "../../shared/plugin-settings-error.ts";
import { PluginArtifactChangedError } from "../../shared/plugin-artifact-error.ts";
import { PLUGIN_OPERATION_UNAVAILABLE, type PluginActivation, type PluginActivationFailure } from "../../shared/plugin-activation.ts";
import { AssistantSkillValidationError, PluginAssistantSkills, validateAssistantSkills } from "./assistant-skills.ts";
import { PLUGIN_REGISTRATION_CHANGED } from "@litzio/plugin-sdk";
import { readPluginIcon } from "./plugin-icon.ts";
import { artifactDigestAsync } from "./artifact-digest.mjs";
import { InstalledArtifacts } from "./installed-artifacts.ts";
import { readPluginRegistrations, type GitHubRegistration, type InstalledPlugin, type PluginRegistration } from "./plugin-registrations.ts";
import { GitHubSource, GitHubSourceError, type GitHubLocation, type GitHubTarget } from "./github-source.ts";
import { rm } from "node:fs/promises";
import { PLUGIN_MANIFEST_MISSING, PLUGIN_SOURCE_MOVED, PLUGIN_SOURCE_READD_REQUIRED, PLUGIN_SOURCE_UNAVAILABLE } from "../../shared/plugin-registration-error.ts";
import { publicOperationError, publicOperationResult, publicInputIssues, safePluginValue } from "./operation-result.ts";
import { assertNoPluginSecrets } from "./secret-redaction.ts";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync, lstatSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";
import { accessPath, canonicalFilePath, inside, RootAccess, FileAccessError, LOCAL_FILE_ACCESS, type FileAccess } from "../file-access.ts";
import { scaffoldPlugin } from "./plugin-authoring.ts";
import { startPluginProcess, type PluginProcessActivationFailure } from "./plugin-process.ts";
import { parseGitHubSource, type GitHubTrack, healthCheckResultSchema, validateManifest, validatePluginSource, compileSchema, statusSchema, pluginManagementSchema, type PluginManifest, type PluginInstance } from "@litzio/plugin-sdk";
import { hostPaths } from "../host-paths.ts";
import { describeError } from "../daemon-log.ts";

import { WindowsPluginSecretStore, type PluginSecretStore } from "./secret-store.ts";


type ManifestIssue = { path: PropertyKey[]; code: string; message: string; issues?: ManifestIssue[] };
type ValidationDiagnostic = { file: string; line: number | null; column: number | null; kind: string; path?: string; message?: string; code?: string };
class MissingPluginManifestError extends Error {
  constructor() { super(PLUGIN_MANIFEST_MISSING); }
}
function validationDiagnostics(error: unknown, file: string): ValidationDiagnostic[] {
  if (error instanceof MissingPluginManifestError) return [{ file, line: null, column: null, kind: "Artifact or SDK/schema validation failed", message: error.message }];
  if (error instanceof GitHubSourceError) return [{ file: "GitHub source", line: null, column: null, kind: "GitHub source unavailable", path: "source", message: error.message, code: "github_source" }];
  if (error instanceof AssistantSkillValidationError) return [{ file: error.file, line: null, column: null, kind: "Assistant skill validation failed", path: error.field, message: error.message, code: "invalid_skill" }];
  if (file === "artifact directory") {
    const code = error instanceof FileAccessError ? "outside_plugin_scope" : (error as NodeJS.ErrnoException)?.code;
    const message = code === "installed_copy" ? (error as Error).message
      : error instanceof FileAccessError
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


function assertStoredSettings(manifest: PluginManifest, settings: Record<string, unknown>) {
  if (!compileSchema(manifest.settingsSchema)(settings)) throw new Error("Stored settings do not satisfy this artifact schema");
}
type Artifact = { manifest: PluginManifest; digest: string; entry: string; icon?: ReturnType<typeof readPluginIcon> };
/** structuredClone would turn the icon Buffer into a plain Uint8Array; nothing mutates the bytes. */
const copyArtifact = ({ icon, ...rest }: Artifact): Artifact => ({ ...structuredClone(rest), ...(icon ? { icon } : {}) });
/** Last source comparison. Memory only: every check reads the source again. */
type UpdateCheck = { currentVersion: string | null; sourceVersion: string | null; available: boolean; track?: GitHubTrack; error?: string };
/** What the record names as its source; local paths stay inside the Host. */
const sourceSummary = (record: InstalledPlugin) => record.github
  ? { kind: "github" as const, url: record.github.url, ...(record.github.path !== undefined ? { path: record.github.path } : {}), ...(record.github.track ? { track: record.github.track } : {}), local: !!record.sourceDirectory }
  : { kind: "local" as const };
/** Same GitHub source: owner and repository ignore case like GitHub; ref and folder do not. */
const sourceKey = (url: string) => { const { owner, repo, tree } = parseGitHubSource(url)!; return [owner.toLowerCase(), repo.toLowerCase(), ...tree].join("/"); };
/**
 * A local folder whose manifest names a GitHub repository is checked and updated from
 * GitHub. A kept registration keeps its pinned GitHub source; if the folder now names
 * another one, GitHub updates stop until the plugin is added again and trusted.
 * The applied tree stays known only while the folder holds that same content.
 */
function localOrigin(sourceDirectory: string, manifest: PluginManifest, kept: InstalledPlugin | undefined, sourceDigest: string): Pick<InstalledPlugin, "sourceDirectory" | "github"> {
  const pinned = kept?.github;
  // A trusted remote source stays recorded until the plugin is added again, even while the folder names none.
  if (!manifest.repository && !pinned) return { sourceDirectory };
  if (!pinned) { const url = manifest.repository!, { owner, repo } = parseGitHubSource(url)!; return { sourceDirectory, github: { url, owner, repo } }; }
  const { moved: _moved, commit, tree, ...source } = pinned;
  return { sourceDirectory, github: { ...source, ...(commit && tree && kept.sourceDigest === sourceDigest ? { commit, tree } : {}),
    ...(manifest.repository ? sourceKey(manifest.repository) !== sourceKey(pinned.url) ? { moved: manifest.repository } : {} : pinned.moved ? { moved: pinned.moved } : {}) } };
}
type Loaded = { manifest: PluginManifest; instance: PluginInstance; pending: Set<Promise<unknown>>; screens: Record<string, string> };
type Activation = { controller: AbortController; state: PluginActivation; manifest?: PluginManifest; done: Promise<void> };

type ManagementAttempt = {
  id?: string;
  stage: "artifact" | "dependencies" | "settings" | "screen" | "secrets" | "process" | "skills";
  processFailure?: PluginProcessActivationFailure;
};
export type PluginHostLogging = { log?: (message: string) => void; warn?: (message: string) => void };

const managementLogActions = new Set(["register", "install", "reload", "update", "enable", "disable", "unregister"]);
const exitDetails = (exit?: { code: number | null; signal: NodeJS.Signals | null }) =>
  exit?.code != null ? ` exitCode=${exit.code}` : exit?.signal ? ` signal=${exit.signal}` : "";

const safeManagementMessages = new Set([
  PLUGIN_MANIFEST_MISSING, PLUGIN_REGISTRATION_CHANGED, PLUGIN_SOURCE_READD_REQUIRED,
  PLUGIN_SOURCE_UNAVAILABLE,
  "Artifact changed; reload the plugin", "Artifact ID changed", "Invalid entry",
  "Plugin operation ID collision", "Plugin manifest must be a real file", "Invalid icon path",
  "Plugin is not registered", "Explicit plugin trust is required", "Plugin request failed",
  "Plugin disposal failed; reload to recover", "Disable the plugin before replacing its registration",
  "Stored settings do not satisfy this artifact schema", "Required plugin secret is not configured",
  "Plugin secrets unsupported on this Host (Windows required)",
  "Plugin source validation failed",
]);

function describeManagementError(error: unknown, stage: ManagementAttempt["stage"]) {
  if (!(error instanceof Error)) return describeError(error);
  // JSON, compilers, filesystem and secret-store errors can quote private input.
  // Log only Host-owned descriptions and omit stacks that can contain source text.
  const detail = error instanceof GitHubSourceError ? { name: "GitHubSourceError", message: error.logMessage }
    : error instanceof SyntaxError ? { name: "SyntaxError", message: "Invalid artifact syntax" }
    : error instanceof FileAccessError ? { name: "FileAccessError", message: "Plugin folder access was rejected" }
    : error.name === "ZodError" ? { name: "ZodError", message: `Plugin ${stage} validation failed` }
    : error.name === "ScreenCompileError" ? { name: "ScreenCompileError", message: "Plugin screen compilation failed" }
    : { name: "Error", message: `Plugin ${stage} step failed` };
  if (safeManagementMessages.has(error.message)) detail.message = error.message;
  else {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "EACCES" || code === "EPERM") detail.message += ` (${code})`;
  }
  return describeError(Object.assign(new Error(detail.message), { name: detail.name, stack: undefined }));
}

export class PluginHost {
  private installed: Record<string, PluginRegistration>;
  private artifacts = new Map<string, Artifact>();
  private reportedDigests = new Map<string, string>();
  private copies: InstalledArtifacts;
  private activating = new Map<string, Activation>();
  private loaded = new Map<string, Loaded>();
  private processes = new Map<string, PluginInstance>();
  private errors = new Map<string, { error: string; activationFailure?: PluginActivationFailure; activationFailedAtStartup?: true }>();
  private updates = new Map<string, { installationId: string; check: UpdateCheck }>();
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
  private github: GitHubSource;
  private slowActivationMs?: number;
  private readonly log?: PluginHostLogging["log"];
  private readonly warn: NonNullable<PluginHostLogging["warn"]>;
  constructor(private file = hostPaths().settingsFile("plugins"), options: PluginHostLogging & { access?: FileAccess; authoringDirectory?: string; assistantDirectory?: string; secrets?: PluginSecretStore; cli?: PluginCli | null; github?: GitHubSource; slowActivationMs?: number } = {}) {
    this.log = options.log;
    this.warn = options.warn ?? console.warn;
    this.slowActivationMs = options.slowActivationMs;
    this.github = options.github ?? new GitHubSource();
    this.copies = new InstalledArtifacts(file, this.warn);
    this.cli = options.cli === null ? undefined : options.cli ?? availableHostCli();
    this.assistantSkills = new PluginAssistantSkills(options.assistantDirectory ?? path.join(path.dirname(file), "assistant"), this.warn);
    this.authoringDirectory = options.authoringDirectory ?? hostPaths().plugins;
    this.access = options.access ?? LOCAL_FILE_ACCESS;
    this.secrets = options.secrets ?? new WindowsPluginSecretStore(`${file}.secrets`);
    this.installed = readPluginRegistrations(file) ?? {};
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
    const canonical = canonicalFilePath(directory);
    this.copies.assertOutside(canonical);
    return accessPath(canonical, creationScope);
  }
  private save(records = this.installed) {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(records, null, 2) + "\n", { flag: "wx" }); renameSync(temporary, this.file); }
    finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  private setRecord(id: string, record: InstalledPlugin) {
    const next = { ...this.installed, [id]: record };
    this.save(next);
    this.installed = next;
  }
  private installedDirectory(record: PluginRegistration | Pick<InstalledPlugin, "installationId">) {
    if (!("installationId" in record)) throw new Error(PLUGIN_SOURCE_READD_REQUIRED);
    return this.copies.directory(record.installationId);
  }
  private removeCopy(record: PluginRegistration | Pick<InstalledPlugin, "installationId">) {
    if (!("installationId" in record)) return;
    try { this.artifacts.delete(this.installedDirectory(record)); } catch { /* unavailable copy */ }
    this.copies.remove(record.installationId);
  }
  /** Loading reads the whole artifact, including node_modules, without holding the event loop. */
  private async artifact(directory: string, inspecting: (file: string) => void = () => {}, registered?: { id: string; record: PluginRegistration }) {
    directory = realpathSync(directory);
    const digest = await artifactDigestAsync(directory);
    if (this.log && registered && this.installed[registered.id] === registered.record && digest !== registered.record.digest) {
      const { id, record } = registered;
      if (this.reportedDigests.get(id) !== digest) {
        this.reportedDigests.set(id, digest);
        this.log(`plugin artifact changed plugin=${id} recorded=${record.digest.slice(0, 12)} observed=${digest.slice(0, 12)}`);
      }
    }
    const cached = this.artifacts.get(directory);
    if (cached?.digest === digest) {
      for (const file of ["litzio-plugin.json", "package.json", "host entry"]) inspecting(file);
      return copyArtifact(cached);
    }
    this.artifacts.delete(directory);
    inspecting("litzio-plugin.json");
    const manifest = validateManifest(readArtifactJson(path.join(directory, "litzio-plugin.json")));
    if (manifest.contributes.skills.length) inspecting("assistant skill");
    validateAssistantSkills(directory, manifest);
    let icon: Artifact["icon"];
    if (manifest.icon) { inspecting(manifest.icon); icon = readPluginIcon(directory, manifest.icon); }
    for (const screen of manifest.contributes.screens) if (screen.entry) { inspecting(screen.entry); compileScreen(directory, screen.entry); }
    inspecting("package.json");
    inspecting("host entry");
    const entry = realpathSync(path.join(directory, manifest.entry));
    if (path.relative(directory, entry).startsWith("..") || !statSync(entry).isFile()) throw new Error("Invalid entry");
    compileSchema(manifest.settingsSchema);
    for (const op of manifest.contributes.operations) { compileSchema(op.inputSchema); compileSchema(op.outputSchema); }
    this.artifacts.set(directory, { manifest, digest, entry, icon });
    return copyArtifact({ manifest, digest, entry, icon });
  }
  /** Only the Host writes installed copies, so calls reuse the digest checked when the copy was loaded. */
  private async installedArtifact(id: string, record: PluginRegistration, inspecting: (file: string) => void = () => {}) {
    const directory = realpathSync(this.installedDirectory(record)), cached = this.artifacts.get(directory);
    if (!cached) return this.artifact(directory, inspecting, { id, record });
    for (const file of ["litzio-plugin.json", "package.json", "host entry"]) inspecting(file);
    return copyArtifact(cached);
  }
  private assertOperationNamesAvailable(id: string, names: string[]) {
    const requested = new Set(names);
    for (const [otherId, other] of Object.entries(this.installed)) {
      if (otherId !== id && other.operationNames.some(name => requested.has(name))) throw new Error("Plugin operation ID collision");
    }
  }
  start() {
    const registrations = readPluginRegistrations(this.file);
    this.installed = registrations ?? {};
    let skillCleanupFailed = false;
    try { this.assistantSkills.clear(); } catch { skillCleanupFailed = true; }
    if (registrations) {
      const retained = new Set(Object.values(registrations).flatMap(record => "installationId" in record ? [record.installationId] : []));
      const sources = Object.values(registrations).flatMap(record => "installationId" in record ? record.sourceDirectory ? [record.sourceDirectory] : [] : [record.directory]);
      try { this.copies.cleanOrphans(retained, sources); }
      catch { this.warn("Unable to inspect Host plugin artifact storage for cleanup"); }
    }
    const startup = Object.entries(this.installed).filter(([id, record]) => "installationId" in record && record.enabled && !this.errors.has(id));
    return Promise.allSettled(startup.map(([id]) => this.enable(id, true))).then(() => {
      if (skillCleanupFailed && !this.closed) for (const id of Object.keys(this.installed)) {
        if (!this.errors.has(id)) this.errors.set(id, { error: "Assistant skill cleanup failed; reload to recover" });
      }
    });
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
  async icon(id: string, digest: string) {
    const record = this.record(id), artifact = await this.installedArtifact(id, record);
    if (artifact.manifest.id !== id || artifact.digest !== record.digest || record.digest !== digest || !artifact.icon || !record.trusted) throw new Error("Plugin icon unavailable");
    // Serve the bytes checked when the copy was loaded; the disk may have changed since.
    return artifact.icon;
  }
  async list() {
    return Promise.all(Object.entries(this.installed).map(async ([id, r]) => {
      if (!("installationId" in r)) {
        return { id, registrationId: r.registrationId, installed: true, enabled: false, running: false, status: null, error: PLUGIN_SOURCE_READD_REQUIRED };
      }
      const last = this.updates.get(id), update = last?.installationId === r.installationId ? last.check : undefined;
      let file = "artifact directory";
      try {
        const { manifest: m, digest } = await this.installedArtifact(id, r, current => { file = current; }), live = this.loaded.get(id);
        if (m.id !== id || digest !== r.digest) {
          return { id, registrationId: r.registrationId, installed: true, trusted: !!r.trusted, enabled: r.enabled, running: false, status: null,
            error: "Artifact changed; reload the plugin", artifactChanged: true, activationFailure: this.errors.get(id)?.activationFailure, source: sourceSummary(r) };
        }
        const observed = live ? await this.status(live) : null;
        const secrets = await this.secretStatus(id, m);
        const current = live && this.loaded.get(id) === live;
        const activation = current ? undefined : this.activation(id)?.state;
        const failure = activation ? undefined : this.errors.get(id);
        return { id, registrationId: r.registrationId, name: m.name, description: m.description, version: m.version ?? null, installed: true, trusted: !!r.trusted, enabled: r.enabled, running: !!current,
          iconDigest: m.icon && !!r.trusted ? digest : undefined, healthCheck: m.contributes.healthCheck, secrets, settings: r.settings, settingsSchema: m.settingsSchema, status: current ? observed : null,
          activation, error: failure?.error, activationFailure: failure?.activationFailure, activationFailedAtStartup: failure?.activationFailedAtStartup, digest, update, source: sourceSummary(r) };
      } catch (e) {
        const failure = this.errors.get(id);
        const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
        return { id, registrationId: r.registrationId, installed: true, enabled: r.enabled, running: false, update, source: sourceSummary(r),
          activationFailure: failure?.activationFailure, activationFailedAtStartup: missing ? undefined : failure?.activationFailedAtStartup,
          error: missing ? "Plugin artifact missing" : failure?.error ?? (e instanceof Error && e.name === "ScreenCompileError" ? e.message : "Plugin status unavailable"), status: null, errors: validationDiagnostics(e, file) };
      }
    }));
  }
  private activation(id: string) {
    const activation = this.activating.get(id);
    return activation?.controller.signal.aborted ? undefined : activation;
  }
  private cancelActivation(id: string) {
    this.activation(id)?.controller.abort(new Error(PLUGIN_OPERATION_UNAVAILABLE));
  }
  private trackActivation(id: string, activate: (activation: Activation) => Promise<void>) {
    if (this.closed) return Promise.reject(new Error(PLUGIN_OPERATION_UNAVAILABLE));
    const controller = new AbortController(), started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const timer = setTimeout(() => {
      activation.state = "slow";
      this.log?.(`plugin activation slow plugin=${id} elapsedMs=${elapsed()}`);
    }, this.slowActivationMs ?? 30_000);
    const done = Promise.resolve().then(() => activate(activation)).finally(() => {
      clearTimeout(timer);
      if (this.activating.get(id) === activation) this.activating.delete(id);
      if (activation.state === "slow") this.log?.(`plugin activation ended plugin=${id} elapsedMs=${elapsed()}`);
    });
    const activation: Activation = { controller, state: "loading", done };
    this.activating.set(id, activation);
    return done;
  }
  private enable(id: string, startup = false, attempt: ManagementAttempt = { stage: "artifact" }) {
    if (this.loaded.has(id)) return Promise.resolve();
    return this.activation(id)?.done ?? this.trackActivation(id, activation => this.enableInstalled(id, startup, attempt, activation));
  }
  private async enableInstalled(id: string, startup: boolean, attempt: ManagementAttempt, activation: Activation) {
    const started = performance.now();
    const signal = activation.controller.signal;
    try {
      const previous = this.record(id);
      if (!("installationId" in previous)) throw new Error(PLUGIN_SOURCE_READD_REQUIRED);
      const directory = this.installedDirectory(previous), artifact = await this.artifact(directory, undefined, { id, record: previous });
      if (artifact.manifest.id !== id) throw new Error("Artifact ID changed");
      if (!previous.trusted) throw new Error("Explicit plugin trust is required");
      if (artifact.digest !== previous.digest) throw new PluginArtifactChangedError();
      try {
        await this.activate({ ...previous, enabled: true }, directory, artifact, previous, false, attempt, activation);
      } catch (error) {
        if (!startup || signal.aborted || attempt.processFailure?.kind !== "processExit") throw error;
        this.log?.(`plugin startup activation retry plugin=${id}${exitDetails(attempt.processFailure)}`);
        attempt.processFailure = undefined;
        await this.activate({ ...previous, enabled: true }, directory, artifact, previous, false, attempt, activation);
      }
      if (startup) this.log?.(`plugin enable ok plugin=${id} source=${previous.sourceDirectory ? "local" : "github"} elapsedMs=${Math.round(performance.now() - started)}`);
    } catch (error) {
      signal.throwIfAborted();
      const processFailure = attempt.processFailure, kind = processFailure?.kind ?? "other";
      this.errors.set(id, { error: startup ? "Plugin activation failed" : String(error), activationFailure: kind,
        ...(startup && kind === "other" ? { activationFailedAtStartup: true } : {}) });
      if (startup) {
        const elapsedMs = Math.round(performance.now() - started);
        const exit = processFailure?.kind === "processExit" ? processFailure : undefined;
        this.warn(`Plugin startup activation failed: plugin=${id} kind=${kind} elapsedMs=${elapsedMs} stage=${attempt.stage}${exitDetails(exit)}`);
      }
      throw error;
    }
  }
  private async activate(record: InstalledPlugin, directory: string, artifact: Artifact, previous?: PluginRegistration, checkCandidate = false, attempt?: ManagementAttempt, activation?: Activation): Promise<void> {
    if (!activation) return this.trackActivation(artifact.manifest.id, current => this.activate(record, directory, artifact, previous, checkCandidate, attempt, current));
    const signal = activation.controller.signal;
    signal.throwIfAborted();
    const { manifest } = artifact, { id } = manifest;
    activation.manifest = manifest;
    if (attempt) attempt.stage = "settings";
    assertStoredSettings(manifest, record.settings);
    if (attempt) attempt.stage = "screen";
    const screens = Object.fromEntries(manifest.contributes.screens.filter(s => s.entry).map(s => [s.id, compileScreen(directory, s.entry!)]));
    if (attempt) attempt.stage = "secrets";
    const secrets = await this.runtimeSecrets(id, manifest);
    let candidate: PluginInstance | undefined;
    try {
      if (attempt) attempt.stage = "process";
      candidate = await startPluginProcess(artifact.entry, manifest, structuredClone(record.settings), secrets, exited => {
        if (!candidate || this.processes.get(id) !== candidate) return;
        this.loaded.delete(id); this.errors.set(id, { error: "Plugin process failed; reload to recover" });
        if (this.log) void exited.then(exit => this.log?.(`plugin process ${exit ? "exited" : "failed"} plugin=${id}${exitDetails(exit)}`));
        try { this.assistantSkills.clear(id); } catch { this.errors.set(id, { error: "Plugin process failed; skill cleanup failed" }); }
      }, directory, this.cli, {
        signal,
        onFailure: failure => { if (attempt) attempt.processFailure = failure; },
      });
      if (checkCandidate) statusSchema.parse(safePluginValue(await candidate.status(), Object.values(secrets)));
      signal.throwIfAborted();
      const oldLive = this.loaded.get(id), oldProcess = this.processes.get(id);
      if (attempt) attempt.stage = "skills";
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
      catch { this.warn("Previous plugin process disposal failed after activation"); }
    } finally {
      if (candidate && this.processes.get(id) !== candidate) {
        try { await candidate.dispose(); } catch { this.warn("Candidate plugin process disposal failed"); }
      }
    }
  }
  private async declaredSecret(id: string, name: string) {
    const m = (await this.installedArtifact(id, this.record(id))).manifest;
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
      await this.declaredSecret(id, name);
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
  private sourceDirectory(record: InstalledPlugin & { sourceDirectory: string }, creationScope: FileAccess = LOCAL_FILE_ACCESS) {
    const directory = this.artifactDirectory(record.sourceDirectory, creationScope);
    if (path.relative(record.sourceDirectory, directory) !== "") throw new Error("Plugin source directory changed");
    return directory;
  }
  /** Host-owned extraction folder beside the registration file, never inside installed copies. */
  private staging() { return path.join(path.resolve(`${this.file}.staging`), randomUUID()); }
  private npmData() {
    // Absolute here: npm resolves relative --cache and --logs-dir against the project folder.
    const npmFolder = path.resolve(path.dirname(this.file), "plugin-npm");
    return { cache: path.join(npmFolder, "cache"), logs: path.join(npmFolder, "logs") };
  }
  /** A downloaded plugin brings its node_modules, or a lockfile that npm ci reproduces without scripts. */
  private async prepareDependencies(directory: string) {
    const packageFile = path.join(directory, "package.json");
    if (!existsSync(packageFile) || existsSync(path.join(directory, "node_modules"))) return;
    if (!Object.keys((readArtifactJson(packageFile) as { dependencies?: Record<string, string> }).dependencies ?? {}).length) return;
    if (!["package-lock.json", "npm-shrinkwrap.json"].some(file => existsSync(path.join(directory, file)))) {
      throw GitHubSourceError.fromHost("This plugin declares dependencies without package-lock.json. Ask its author to commit the lockfile.");
    }
    try { await installScreenDependencies(directory, this.npmData(), "ci"); }
    catch (error) {
      throw new GitHubSourceError(error instanceof Error ? error.message : "Package download failed.",
        error instanceof ScreenDependencyError ? error.logMessage : "npm dependency installation failed.");
    }
  }
  /**
   * Download one commit's plugin folder into Host staging, prepare dependencies, then use
   * the same apply path as a local folder. Staging is removed whether or not it applies.
   */
  private async applyGitHub(source: GitHubSource, action: "register" | "install" | "reload" | "update", url: string, { location, target }: { location: GitHubLocation; target: Pick<GitHubTarget, "commit" | "tree" | "track"> },
    expectedId?: string, options: { sourceDirectory?: string; inspecting?: (file: string) => void; attempt?: ManagementAttempt } = {}) {
    const staging = this.staging();
    try {
      await source.download(location, target.commit, staging);
      const manifest = this.precheckSourceManifest(staging, options.inspecting, () => GitHubSourceError.fromHost("No litzio-plugin.json in this GitHub folder."));
      if (options.attempt) {
        options.attempt.id ??= manifest.id;
        options.attempt.stage = "dependencies";
      }
      await this.prepareDependencies(staging);
      if (options.attempt) options.attempt.stage = "artifact";
      const origin = {
        ...(options.sourceDirectory ? { sourceDirectory: options.sourceDirectory } : {}),
        // The resolved repository, folder and track are pinned; checks and updates never re-resolve the address.
        github: { url, owner: location.owner, repo: location.repo, ...(location.ref !== undefined ? { ref: location.ref } : {}), path: location.path, track: target.track, commit: target.commit, tree: target.tree },
      };
      return await this.applySource(action, staging, { expectedId, origin, inspecting: options.inspecting, attempt: options.attempt });
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
  /** The pinned folder, or for a local manifest not yet applied from GitHub, its repository resolved by this plugin ID. */
  private async githubTarget(source: GitHubSource, id: string, github: GitHubRegistration) {
    if (github.moved) throw GitHubSourceError.fromHost(PLUGIN_SOURCE_MOVED);
    if (github.path === undefined) {
      const resolved = await source.resolve(github.url, { track: github.track, id });
      if ("candidates" in resolved) throw GitHubSourceError.fromHost("Several folders at this GitHub address hold this plugin. Use its exact folder address.");
      return resolved;
    }
    const location = { owner: github.owner, repo: github.repo, ...(github.ref !== undefined ? { ref: github.ref } : {}), path: github.path };
    return { location, target: await source.target(location, github.track) };
  }
  /** New content means the source differs from what this registration last applied, whatever its version text says. */
  private async checkUpdate(id: string, source: GitHubSource): Promise<UpdateCheck> {
    const record = this.record(id);
    if (!("installationId" in record)) return { currentVersion: null, sourceVersion: null, available: false, error: PLUGIN_SOURCE_READD_REQUIRED };
    let currentVersion: string | null = null;
    try { currentVersion = (await this.installedArtifact(id, record)).manifest.version ?? null; } catch { /* list reports the installed copy */ }
    let check: UpdateCheck;
    if (record.github) {
      // Even a local installation follows its manifest repository for updates.
      try {
        const { target } = await this.githubTarget(source, id, record.github);
        check = { currentVersion, sourceVersion: target.version, available: target.tree !== record.github.tree, track: target.track };
      } catch (error) { check = { currentVersion, sourceVersion: null, available: false, error: error instanceof GitHubSourceError ? error.message : "GitHub update check failed." }; }
      this.updates.set(id, { installationId: record.installationId, check });
      return check;
    }
    try {
      if (!record.sourceDirectory) throw new Error(PLUGIN_SOURCE_UNAVAILABLE);
      const directory = this.sourceDirectory({ ...record, sourceDirectory: record.sourceDirectory });
      const available = this.copies.sourceDigest(directory) !== record.sourceDigest;
      let sourceVersion: string | null = null;
      try { sourceVersion = validateManifest(readArtifactJson(path.join(directory, "litzio-plugin.json"))).version ?? null; } catch { /* update reports diagnostics */ }
      check = { currentVersion, sourceVersion, available };
    } catch { check = { currentVersion, sourceVersion: null, available: false, error: PLUGIN_SOURCE_UNAVAILABLE }; }
    this.updates.set(id, { installationId: record.installationId, check });
    return check;
  }
  private async disable(id: string, attempt?: ManagementAttempt) {
    this.disabling.add(id);
    const activation = this.activating.get(id);
    this.cancelActivation(id);
    await activation?.done.catch(() => {});
    let skillCleanupError: unknown;
    try { this.assistantSkills.clear(id); } catch (error) { skillCleanupError = error; }
    const live = this.loaded.get(id), instance = this.processes.get(id); this.loaded.delete(id);
    if (attempt) attempt.stage = "process";
    try { await this.drainAndDispose(live, instance); }
    catch { this.errors.set(id, { error: "Plugin disposal failed; reload to recover" }); throw new Error("Plugin disposal failed; reload to recover"); }
    finally { this.processes.delete(id); }
    if (skillCleanupError) {
      if (attempt) attempt.stage = "skills";
      throw skillCleanupError;
    }
  }
  private async drainAndDispose(live?: Loaded, instance?: PluginInstance) {
    if (live) await Promise.allSettled([...live.pending]);
    await instance?.dispose();
  }
  /** Configuration changes restart the installed copy and never read the source. */
  private async changeConfiguration(id: string, change: () => Promise<void> | void) {
    const record = this.record(id);
    const activation = this.activation(id);
    const restart = record.enabled || Boolean(activation);
    if (restart) this.disabling.add(id);
    try {
      if (activation) {
        this.cancelActivation(id);
        await activation.done.catch(() => {});
      }
      await change();
      this.save();
      if (restart) {
        record.enabled = false;
        this.save();
        await this.disable(id);
        await this.enable(id);
      }
    } finally { this.disabling.delete(id); }
  }
  private precheckSourceManifest(directory: string, inspecting = (_file: string) => {},
    missing = () => new MissingPluginManifestError()) {
    const file = path.join(directory, "litzio-plugin.json");
    try {
      const entry = lstatSync(file, { throwIfNoEntry: false });
      if (!entry) throw missing();
      if (!entry.isFile()) throw new Error("Plugin manifest must be a real file");
      return validateManifest(readArtifactJson(file));
    } catch (error) {
      inspecting("litzio-plugin.json");
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw missing();
      throw error;
    }
  }
  /** Stage the same local snapshot for folder registration, install, reload and update. */
  private async applySource(action: "register" | "install" | "reload" | "update", sourceDirectory: string,
    { expectedId, inspecting = () => {}, origin, attempt }: { expectedId?: string; inspecting?: (file: string) => void; origin?: Pick<InstalledPlugin, "sourceDirectory" | "github">; attempt?: ManagementAttempt } = {}) {
    if (!origin) {
      const manifest = this.precheckSourceManifest(sourceDirectory, inspecting);
      if (attempt) attempt.id ??= manifest.id;
    }
    const copy = await this.copies.copy(sourceDirectory);
    let applied = false;
    try {
      inspecting("litzio-plugin.json");
      const manifest = validateManifest(readArtifactJson(path.join(copy.directory, "litzio-plugin.json")));
      const { id } = manifest;
      if (expectedId && id !== expectedId) throw new Error("Artifact ID changed");
      if (action !== "register") {
        const activation = this.activating.get(id);
        this.cancelActivation(id);
        await activation?.done.catch(() => {});
      }
      const previous = Object.hasOwn(this.installed, id) ? this.installed[id] : undefined;
      if (action === "register" && previous && "installationId" in previous && (previous.enabled || this.activation(id))) throw new Error("Disable the plugin before replacing its registration");
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
      const artifact = await this.artifact(copy.directory, inspecting);
      inspecting(artifact.manifest.entry);
      if (action === "install") {
        const errors = validatePluginSource(readFileSync(artifact.entry, "utf8"), artifact.manifest).map(issue => ({ file: artifact.manifest.entry, ...issue }));
        if (errors.length) return { id, errors };
      }
      const operationNames = manifest.contributes.operations.map(op => `${id}.${op.id}`);
      this.assertOperationNamesAvailable(id, operationNames);
      // Update keeps the registration's trust and on/off state; install and reload enable it.
      const kept = action === "update" ? previous : undefined;
      const active = kept ? kept.enabled && !!kept.trusted : action !== "register";
      const record: InstalledPlugin = { registrationId: (active || kept?.trusted) && previous && "installationId" in previous ? previous.registrationId : randomUUID(),
        installationId: copy.installationId, ...(origin ?? localOrigin(sourceDirectory, manifest, (action === "reload" || action === "update") && previous && "installationId" in previous ? previous : undefined, copy.sourceDigest)), sourceDigest: copy.sourceDigest,
        digest: artifact.digest, trusted: kept ? !!kept.trusted : active, enabled: active, settings: previous?.settings ?? {}, operationNames };
      if (active) await this.activate(record, copy.directory, artifact, previous, true, attempt);
      else {
        if (attempt) attempt.stage = "settings";
        assertStoredSettings(manifest, record.settings);
        this.setRecord(id, record);
        this.errors.delete(id);
      }
      applied = true;
      this.updates.delete(id);
      this.reportedDigests.delete(id);
      if (previous) this.removeCopy(previous);
      return { id };
    } finally {
      if (!applied) this.removeCopy(copy);
    }
  }
  /** The loaded manifest owns identity; never infer plugin IDs by splitting operation names. */
  viewOperationOwner(operation: string): string | undefined {
    return [...this.loaded.values()].find(live => live.manifest.contributes.operations.some(op => `${live.manifest.id}.${op.id}` === operation))?.manifest.id ??
      [...this.activating.keys()].find(id => this.activation(id) && (this.installed[id]?.operationNames.includes(operation) ||
        this.activation(id)?.manifest?.contributes.operations.some(op => `${id}.${op.id}` === operation)));
  }
  private async waitForActivation(id: string) {
    const activation = this.activation(id);
    if (!activation || this.loaded.has(id)) return;
    try { await activation.done; }
    catch { throw new Error(PLUGIN_OPERATION_UNAVAILABLE); }
    if (this.closed || this.disabling.has(id) || activation.controller.signal.aborted) throw new Error(PLUGIN_OPERATION_UNAVAILABLE);
  }
  viewScreens(includeCode = true) {
    const ready = [...this.loaded.values()].flatMap(live => live.manifest.contributes.screens.map(screen => ({ plugin: live.manifest.id, ...(live.screens[screen.id] ? { ...(includeCode ? { code: live.screens[screen.id] } : {}), codeRevision: this.record(live.manifest.id).digest } : {}), iconDigest: live.manifest.icon ? this.record(live.manifest.id).digest : undefined, ...screen })));
    const loading = [...this.activating.keys()].flatMap(id => {
      const activation = this.activation(id), record = this.installed[id];
      if (this.loaded.has(id) || !activation?.manifest || !record?.trusted || !("installationId" in record)) return [];
      return activation.manifest.contributes.screens.map(screen => ({
        ...screen, plugin: id, activation: activation.state, code: undefined, codeRevision: undefined, iconDigest: activation.manifest?.icon ? record.digest : undefined,
      }));
    });
    return [...ready.map(screen => ({ ...screen, activation: undefined })), ...loading];
  }
  /** Assistant admission is narrower than CLI invocation; execution/publication stay shared. */
  async invokeAssistantOperation(name: string, input: unknown) {
    const id = this.viewOperationOwner(name);
    if (id && !this.loaded.has(id)) {
      try { await this.waitForActivation(id); }
      catch { throw Object.assign(new Error(PLUGIN_OPERATION_UNAVAILABLE), { kind: "unavailable" }); }
    }
    const live = id ? this.loaded.get(id) : undefined;
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
    const id = screenOwner ?? this.viewOperationOwner(name);
    if (id && !this.loaded.has(id)) await this.waitForActivation(id);
    const live = id ? this.loaded.get(id) : undefined;
    const local = screenOwner && name.startsWith(`${screenOwner}.`) ? name.slice(screenOwner.length + 1) : undefined;
    const op = live?.manifest.contributes.operations.find(op => `${live.manifest.id}.${op.id}` === name) ??
      (local && live?.manifest.contributes.screens.some(screen => screen.entry) && Object.hasOwn(live.instance.operations, local) ?
        { id: local, version: 1, effect: "write" as const, scope: "host", assistant: false, inputSchema: {}, outputSchema: {} } : undefined);
    if (this.closed || !live || !op) throw new Error(PLUGIN_OPERATION_UNAVAILABLE);
    const record = this.record(live.manifest.id);
    if (!record.trusted || (await this.installedArtifact(live.manifest.id, record)).digest !== record.digest) throw new Error("Artifact changed; reload the plugin");
    if (this.disabling.has(live.manifest.id) || this.loaded.get(live.manifest.id) !== live) throw new Error("Plugin is stopping");
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
  invoke(action: string, args: { template?: "greet" | "screen" | "chart"; id?: string; directory?: string; digest?: string; registrationId?: string; trust?: boolean; settings?: Record<string, unknown>; operation?: string; version?: number; input?: unknown; name?: string; plugin?: string; job?: string; root?: string; file?: string; files?: string[]; requestIds?: string[]; output?: string; requestId?: string; source?: string; track?: GitHubTrack } = {}, creationScope: FileAccess = LOCAL_FILE_ACCESS): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("Plugin Host is closing"));
    if (action === "screen-invoke") return this.invokeOperation(args.operation!, args.input, undefined, args.plugin);
    if (action === "invoke") return this.invokeOperation(args.operation!, args.input);
    pluginManagementSchema.parse({ action, ...args });
    if (action === "list") return this.list().then(plugins => ({ plugins }));
    const github = this.github.forOperation();
    if (action === "source-plugins") return github.find(args.source!).then(found => ({ ...found,
      receipt: { requestId: randomUUID(), operation: "plugins.source-plugins", version: 1, scope: "host", outcome: "success" } }));
    const attempt: ManagementAttempt | undefined = this.log && managementLogActions.has(action) ? { id: args.id, stage: "artifact" } : undefined;
    let started: number, source: "github" | "local" | undefined;
    const logResult = (outcome: "success" | "failure", error?: unknown) => {
      if (!attempt) return;
      const operation = action === "unregister" ? "remove" : action;
      const elapsedMs = Math.round(performance.now() - started);
      const processFailure = attempt.processFailure;
      const detail = outcome === "failure"
        ? ` kind=${processFailure?.kind ?? "other"} stage=${attempt.stage}${exitDetails(processFailure?.kind === "processExit" ? processFailure : undefined)}: ${describeManagementError(error, attempt.stage)}`
        : "";
      this.log?.(`plugin ${operation} ${outcome === "success" ? "ok" : "failed"} plugin=${attempt.id ?? "(unknown)"}${source ? ` source=${source}` : ""} elapsedMs=${elapsedMs}${detail}`);
    };
    const interruptId = ["disable", "unregister", "reload", "update"].includes(action) ? args.id : undefined;
    // A reload candidate may be occupying the management queue while it activates.
    if (interruptId) this.cancelActivation(interruptId);
    let finishEnable: (() => Promise<unknown>) | undefined;
    const run = this.serial.then(async () => {
      if (this.closed) throw new Error("Plugin Host is closing");
      if (interruptId) {
        const activation = this.activating.get(interruptId);
        this.cancelActivation(interruptId);
        await activation?.done.catch(() => {});
      }
      started = performance.now();
      if (action === "register" || action === "install") source = args.source ? "github" : "local";
      let id = args.id!;
      const receipt = (outcome: "success" | "failure", error?: unknown) => {
        logResult(outcome, error);
        return { requestId: randomUUID(), operation: `plugins.${action}`, version: 1, scope: "host", outcome };
      };
      if (action === "install") {
        let file = "artifact directory";
        try {
          if (args.source) {
            file = "GitHub source";
            const resolved = await github.resolve(args.source, { track: args.track });
            if ("candidates" in resolved) return { valid: false, plugins: resolved.candidates, errors: [{ file, line: null, column: null, kind: "GitHub source unavailable", path: "source", code: "github_source",
              message: "This address holds several plugins. Install one with its folder address from plugins[].source." }], receipt: receipt("failure", GitHubSourceError.fromHost("This address holds several plugins. Install one with its folder address.")) };
            const result = await this.applyGitHub(github, "install", args.source, resolved, undefined, { inspecting: current => { file = current; }, attempt });
            id = result.id;
            if (result.errors) return { id, valid: false, errors: result.errors, receipt: receipt("failure", new Error("Plugin source validation failed")) };
            return { id, plugins: await this.list(), receipt: receipt("success") };
          }
          const requested = args.directory ?? path.join(this.authoringAccess().roots[0]!, id);
          const directory = this.artifactDirectory(requested, creationScope);
          const result = await this.applySource("install", directory, { expectedId: args.id, inspecting: current => { file = current; }, attempt });
          id = result.id;
          if (result.errors) return { id, valid: false, errors: result.errors, receipt: receipt("failure", new Error("Plugin source validation failed")) };
          return { id, plugins: await this.list(), receipt: receipt("success") };
        } catch (error) {
          return { id, valid: false, errors: validationDiagnostics(error, file), receipt: receipt("failure", error) };
        }
      }
      if (action === "scaffold") {
        const access = args.directory === undefined ? this.authoringAccess(true) : this.access;
        const expected = args.directory === undefined ? path.join(access!.roots[0]!, id) : undefined;
        const directory = args.directory ?? expected!;
        this.copies.assertOutside(directory);
        return { ...scaffoldPlugin(directory, id, access, creationScope, args.template, expected), receipt: receipt("success") };
      }
      if (action === "bundle" || action === "dependencies") {
        const directory = this.artifactDirectory(args.directory!, creationScope);
        // The target folder is outside installed copies; the files written there must be too.
        const outside = (file: string) => this.copies.assertOutside(file);
        if (action === "bundle") return { ...bundleScreens(directory, outside), receipt: receipt("success") };
        // Litzio chooses these npm write locations; other npm settings in the target folder are its author's.
        const npmData = this.npmData();
        for (const file of [path.join(directory, "node_modules"), path.join(directory, "package-lock.json"), npmData.cache, npmData.logs]) outside(file);
        return { ...await installScreenDependencies(directory, npmData), receipt: receipt("success") };
      }
      if (action === "validate") {
        const errors: ValidationDiagnostic[] = []; let manifestId: string | undefined;
        let file = "artifact directory";
        try {
          const directory = this.artifactDirectory(args.directory!);
          const a = await this.artifact(directory, current => { file = current; }); manifestId = a.manifest.id;
          errors.push(...validatePluginSource(readFileSync(a.entry, "utf8"), a.manifest).map(issue => ({ file: "host entry", ...issue })));
        } catch (error) {
          errors.push(...validationDiagnostics(error, file));
        }
        return { id: manifestId, valid: errors.length === 0, errors, limitations: "Static literal handlers only; computed output and activation behavior are checked at runtime.", receipt: receipt(errors.length ? "failure" : "success") };
      }
      if (action === "check-updates") {
        const ids = args.id === undefined ? Object.keys(this.installed) : [args.id];
        const updates = [];
        for (const id of ids) updates.push({ id, ...await this.checkUpdate(id, github) });
        return { updates, plugins: await this.list(), receipt: receipt(updates.some(update => update.error) ? "failure" : "success") };
      }
      if (action === "register") {
        if (args.source) {
          const resolved = await github.resolve(args.source, { track: args.track });
          if ("candidates" in resolved) throw GitHubSourceError.fromHost("This address holds several plugins. Choose one.");
          ({ id } = await this.applyGitHub(github, "register", args.source, resolved, undefined, { attempt }));
          return { id, plugins: await this.list(), receipt: receipt("success") };
        }
        const directory = this.artifactDirectory(args.directory!, creationScope);
        ({ id } = await this.applySource("register", directory, { attempt }));
        return { id, plugins: await this.list(), receipt: receipt("success") };
      } else {
        const r = this.record(id);
        if (attempt && "installationId" in r) source = r.github && (action === "update" || !r.sourceDirectory) ? "github" : "local";
        if (action === "trust" || action === "enable" && (args.trust || args.registrationId !== undefined)) {
          if (!args.registrationId || args.registrationId !== r.registrationId) throw new Error(PLUGIN_REGISTRATION_CHANGED);
        }
        if (action === "unregister") {
          r.enabled = false; this.save(); await this.disable(id, attempt);
          if (attempt) attempt.stage = "secrets";
          if (this.secrets.supported) await this.secrets.delete(id);
          if (attempt) attempt.stage = "artifact";
          this.redactionSecrets.delete(id);
          const next = { ...this.installed };
          delete next[id];
          this.save(next);
          this.installed = next;
          this.errors.delete(id);
          this.reportedDigests.delete(id);
          this.removeCopy(r);
          return { id, plugins: await this.list(), receipt: receipt("success") };
        } else if (action === "secret-status") {
          return { id, secrets: await this.secretStatus(id, (await this.installedArtifact(id, r)).manifest), receipt: { requestId: randomUUID(), operation: "plugins.secret-status", version: 1, scope: "host", outcome: "success" } };
        } else if (action === "secret-delete") {
          await this.declaredSecret(id, args.name!);
          await this.changeConfiguration(id, async () => {
            await this.secrets.delete(id, args.name!);
            if (!r.enabled) this.redactionSecrets.get(id)?.delete(args.name!);
          });
        } else if (action === "trust") {
          const a = await this.installedArtifact(id, r);
          if (a.manifest.id !== id || a.digest !== r.digest || args.digest !== undefined && args.digest !== a.digest) throw new Error("Artifact digest does not match");
          r.trusted = true;
        } else if (action === "enable") {
          if (args.trust) {
            if ((await this.installedArtifact(id, r)).manifest.id !== id) throw new Error("Artifact ID changed");
            r.trusted = true;
          }
          this.save();
          // Publish the enable receipt when activation settles without holding the management queue.
          const enabled = this.enable(id, false, attempt);
          void enabled.catch(() => {});
          finishEnable = async () => {
            await enabled;
            return { id, plugins: await this.list(), receipt: receipt("success") };
          };
          return;
        }
        else if (action === "reload" || action === "update") {
          if (!("installationId" in r)) throw new Error(PLUGIN_SOURCE_READD_REQUIRED);
          // The pinned source may disappear or become invalid without affecting the running copy.
          // Reload rereads the folder it was added from; update follows GitHub whenever the record names it.
          if (r.sourceDirectory && (action === "reload" || !r.github)) await this.applySource(action, this.sourceDirectory({ ...r, sourceDirectory: r.sourceDirectory }, creationScope), { expectedId: id, attempt });
          else if (r.github) {
            const { commit, tree, track, path: folder } = r.github;
            // Reload of a GitHub-only registration downloads the commit it applied again.
            const resolved = action === "reload" && commit && tree && track && folder !== undefined
              ? { location: { owner: r.github.owner, repo: r.github.repo, ...(r.github.ref !== undefined ? { ref: r.github.ref } : {}), path: folder }, target: { commit, tree, track } }
              : await this.githubTarget(github, id, r.github);
            await this.applyGitHub(github, action, r.github.url, resolved, id, { sourceDirectory: r.sourceDirectory, attempt });
          } else throw new Error(PLUGIN_SOURCE_UNAVAILABLE);
          return { id, plugins: await this.list(), receipt: receipt("success") };
        }
        else if (action === "disable") { r.enabled = false; this.save(); await this.disable(id, attempt); }
        else if (action === "settings") {
          if (args.settings === undefined) return { id, secrets: await this.secretStatus(id, (await this.installedArtifact(id, r)).manifest), settings: r.settings, settingsSchema: (await this.installedArtifact(id, r)).manifest.settingsSchema };
          const m = (await this.installedArtifact(id, r)).manifest;
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
      return { id, plugins: await this.list(), receipt: receipt("success") };
    });
    this.serial = run.catch(() => {});
    return run.then(value => finishEnable ? finishEnable() : value).catch(error => {
      logResult("failure", error);
      throw error;
    });
  }
  stopActivations() {
    this.closed = true;
    for (const id of this.activating.keys()) this.cancelActivation(id);
  }
  async close() {
    this.stopActivations();
    await this.serial;
    await Promise.allSettled([...this.activating.values()].map(activation => activation.done));
    const results = await Promise.allSettled([...this.processes.keys()].map(id => this.disable(id)));
    const errors = results.filter(result => result.status === "rejected").map(result => result.reason);
    this.redactionSecrets.clear();
    this.artifacts.clear();
    this.assistantSkills.clear();
    if (errors.length) throw new AggregateError(errors, "Plugin cleanup failed");
  }
}
