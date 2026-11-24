import { mkdirSync, writeFileSync, readdirSync, existsSync, readFileSync, lstatSync, rmSync } from "node:fs";
import path from "node:path";
import { hostPaths, type HostRun } from "./host-paths.ts";
import { assistantCliEnvironment, hostCli } from "./assistant-cli.ts";
import { DEFAULT_OLLAMA_URL, type AssistantDiagnostics, type AssistantAccountUsage, type AssistantEnvironment, type AiModels, type AiModel, type AiProvider, type AssistantSkills, type ProviderCli } from "../shared/assistant.ts";
import { CodexAppServer } from "./codex-app-server.ts";
import { ProviderUpdates } from "./provider-updates.ts";
import { CopilotAcp, COPILOT_EFFORTS, copilotReasoning, copilotChoices, copilotOptions, type CopilotOllama } from "./copilot-acp.ts";
import { AI_PROVIDERS, providerCli, providerEngine } from "./provider-engine.ts";
import { PLUGIN_AUTHORING_SKILL_FILE, PLUGIN_AUTHORING_SKILL_NAME } from "./plugins/authoring-skill.ts";

// Distribution builds inline the Markdown; tsx/Vite read the same source files.
declare const __LITZIO_ASSISTANT_INSTRUCTIONS__: string | undefined;
declare const __LITZIO_ASSISTANT_GUIDE__: string | undefined;

export const ASSISTANT_INSTRUCTIONS = typeof __LITZIO_ASSISTANT_INSTRUCTIONS__ === "string"
  ? __LITZIO_ASSISTANT_INSTRUCTIONS__
  : readFileSync(new URL("./assistant/AGENTS.md", import.meta.url), "utf8");
export function assistantDirectory() {
  return hostPaths().assistant;
}
/** Provider connections share the official Assistant Host's daemon lifetime. */
export class ProviderConnections {
  readonly client: CodexAppServer;
  /** ACP connections, one Copilot CLI process each: the GitHub account and Ollama. A process starts only when used. */
  readonly copilot: CopilotAcp;
  readonly ollama: CopilotAcp;
  readonly templatesDirectory: string;
  private usageCache?: AssistantAccountUsage;
  private usageRead?: Promise<AssistantAccountUsage>;
  private accountRevision = 0;
  /** Host settings owner: the Ollama provider's address. */
  ollamaUrl: () => string = () => DEFAULT_OLLAMA_URL;
  /** Host plugin owner: whether this Host offers plugins, and with them the plugin authoring skill. */
  pluginAuthoring = false;
  /** Conversation owner: whether a turn of this provider is in progress. */
  providerBusy: (provider: AiProvider) => boolean = () => false;
  readonly updates: ProviderUpdates;
  /** Providers whose CLI was updated and whose connection has not launched it yet. */
  private updated = new Set<AiProvider>();
  private relaunching = new Map<AiProvider, Promise<void>>();
  constructor(readonly cwd = assistantDirectory(), options?: ConstructorParameters<typeof CodexAppServer>[1], copilotOptions?: ConstructorParameters<typeof CopilotAcp>[1], run: HostRun = {}, hostOrigin?: () => string | undefined) {
    this.templatesDirectory = hostPaths(run).templates;
    this.client = new CodexAppServer(cwd, { ...options, env: () => assistantCliEnvironment(cwd, hostCli(run), options?.env?.() ?? process.env, hostOrigin?.()) }); const acpEnv = () => assistantCliEnvironment(cwd, hostCli(run), copilotOptions?.env?.() ?? process.env, hostOrigin?.());
    this.copilot = new CopilotAcp(cwd, { ...copilotOptions, env: acpEnv }); this.ollama = new CopilotAcp(cwd, { ...copilotOptions, ...(process.env.LITZIO_SPIKE_PI_ACP ? { bin: process.execPath, args: [process.env.LITZIO_SPIKE_PI_ACP] } : {}), env: acpEnv, local: true }); // spike: pi-acp in place of `copilot --acp`
    this.client.on("notification", method => {
      // Rate-limit notifications carry only one bucket. Refetch the full snapshot.
      if (method === "account/updated" || method === "account/rateLimits/updated") this.invalidateUsage();
    });
    this.client.on("disconnected", () => this.invalidateUsage());
    this.updates = new ProviderUpdates(cli => cli === "copilot" ? this.copilot.executable : this.client.executable);
  }
  /** The ACP connection a provider's conversations use. */
  acp(provider: AiProvider): CopilotAcp {
    if (providerEngine(provider) !== "acp") throw new Error(`AI provider ${provider} has no ACP connection.`);
    return provider === "ollama" ? this.ollama : this.copilot;
  }
  /**
   * Runs an executable's own update on this Host, once for every connection that uses it.
   * `reread` re-reads diagnostics once each connection's relaunch decision is made.
   */
  updateCli(cli: ProviderCli, reread: () => void) {
    return this.updates.start(cli, async succeeded => {
      const providers = AI_PROVIDERS.filter(provider => providerCli(provider) === cli);
      if (succeeded) for (const provider of providers) this.updated.add(provider);
      // Each connection relaunches when it alone is idle; a busy one defers only itself.
      const relaunched = succeeded ? await Promise.all(providers.map(provider => this.relaunchUpdated(provider))) : [];
      reread();
      return relaunched.includes(false);
    });
  }
  /**
   * After an update, the next idle moment launches the new executable; an admitted turn or a send on its way is never
   * interrupted. A send that arrives while the relaunch runs waits for it.
   */
  async relaunchUpdated(provider: AiProvider, busy = this.providerBusy(provider)): Promise<boolean> {
    await this.relaunching.get(provider);
    if (!this.updated.has(provider) || busy) return false;
    this.updated.delete(provider);
    // An unconfirmed stop fails only callers waiting on it; the next request launches anew.
    const relaunch = (providerEngine(provider) === "acp" ? this.acp(provider).restart() : this.client.restart()).catch(() => {}).finally(() => this.relaunching.delete(provider));
    this.relaunching.set(provider, relaunch);
    await relaunch;
    return true;
  }
  private invalidateUsage() { this.accountRevision++; this.usageCache = undefined; }
  async accountUsage(refresh = false): Promise<AssistantAccountUsage> {
    if (!refresh && this.usageCache && Date.now() - this.usageCache.checkedAt < 60_000) return this.usageCache;
    if (this.usageRead) { await this.usageRead; return this.accountUsage(); }
    const accountRevision = this.accountRevision;
    this.usageRead = (async () => {
      this.environment();
      const [account, limits] = await Promise.allSettled([
        this.client.request("account/read", { refreshToken: false }), this.client.request("account/rateLimits/read"),
      ]);
      const result: AssistantAccountUsage = { provider: "codex", checkedAt: Date.now() };
      if (account.status === "fulfilled") {
        const value = account.value.account;
        // Never forward provider IDs, tokens or unrecognized account fields.
        result.account = value ? value.type === "chatgpt" ? { type: value.type, email: value.email, planType: value.planType } : { type: value.type } : null;
      } else result.accountError = account.reason.message;
      if (limits.status === "fulfilled") result.rateLimits = usageBuckets(limits.value.rateLimitsByLimitId ?? { codex: limits.value.rateLimits });
      else result.rateLimitsError = limits.reason.message;
      if (accountRevision === this.accountRevision) this.usageCache = result;
      return result;
    })().finally(() => { this.usageRead = undefined; });
    const result = await this.usageRead;
    return accountRevision === this.accountRevision ? result : this.accountUsage();
  }
  environment(): AssistantEnvironment {
    mkdirSync(this.cwd, { recursive: true });
    const instructions = path.join(this.cwd, "AGENTS.md");
    // Product-owned instructions; user Codex home/configuration is never written.
    writeFileSync(instructions, ASSISTANT_INSTRUCTIONS);
    const skillsDirectory = path.join(this.cwd, ".agents", "skills");
    const guideDirectory = path.join(skillsDirectory, "litzio-guide");
    mkdirSync(guideDirectory, { recursive: true });
    writeFileSync(path.join(guideDirectory, "SKILL.md"), LITZIO_GUIDE);
    const authoringDirectory = path.join(skillsDirectory, PLUGIN_AUTHORING_SKILL_NAME);
    if (this.pluginAuthoring) {
      mkdirSync(authoringDirectory, { recursive: true });
      writeFileSync(path.join(authoringDirectory, "SKILL.md"), PLUGIN_AUTHORING_SKILL_FILE);
    } else rmSync(path.join(authoringDirectory, "SKILL.md"), { force: true });
    let skills: string[] = [];
    try { skills = readdirSync(skillsDirectory, { withFileTypes: true }).filter(entry => entry.isDirectory() && existsSync(path.join(skillsDirectory, entry.name, "SKILL.md"))).map(entry => entry.name); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return { cwd: this.cwd, instructions, skills };
  }
  async skills(): Promise<AssistantSkills> {
    this.environment();
    const result = await this.client.request("skills/list", { cwds: [this.cwd], forceReload: true });
    const entry = result.data.find((value: any) => value.cwd === this.cwd);
    if (!entry) throw new Error("Codex returned no skills for the assistant directory.");
    return { skills: entry.skills.filter((skill: any) => skill.enabled).map(({ name, path, description }: any) => ({ name, path, description })), errors: entry.errors };
  }
  /**
   * An Ollama session lists only its launch model, so the Host reads the Ollama list itself. A probe launches with the
   * running process's model when it is still listed, otherwise the first one.
   */
  async ollamaCatalog(url: string, listed?: string[]): Promise<{ launch: CopilotOllama; models: string[] }> {
    const models = listed ?? await ollamaModels(url);
    if (!models.length) throw new Error(`No models are installed in Ollama at ${url}.`);
    const current = this.ollama.ollama;
    return { models, launch: { url, model: current?.url === url && models.includes(current.model) ? current.model : models[0]! } };
  }
  /** `ollamaUrl` is the Ollama address to read; a send passes the one it started with. */
  async models(provider: AiProvider = "codex", inspectAcp?: "fresh" | "recent", ollamaUrl = this.ollamaUrl()): Promise<AiModels> {
    if (providerEngine(provider) === "acp") {
      this.environment();
      const acp = this.acp(provider);
      const ollama = provider === "ollama" ? await this.ollamaCatalog(ollamaUrl) : undefined;
      // The running process keeps its address until its next launch; read another address with a probe.
      const session = inspectAcp === "fresh" ? (await acp.inspect(ollama?.launch)).session
        : (inspectAcp === "recent" ? acp.recentlyInspectedSession(ollama?.launch) : undefined)
          ?? (acp.ollama?.url === ollama?.launch.url ? await acp.catalog() : (await acp.inspect(ollama?.launch)).session);
      const reasoning = copilotReasoning(session);
      const supportedReasoningEfforts = reasoning ? copilotChoices(reasoning).map(value => ({ reasoningEffort: value.value, description: value.description ?? "" }))
        : COPILOT_EFFORTS.map(reasoningEffort => ({ reasoningEffort, description: "" }));
      const available: { modelId: string; name: string; description?: string | null }[] = session.models?.availableModels ?? [];
      // Copilot may return auto twice. Retain the first provider description, and synthesize only if absent.
      // Auto is GitHub's account routing, so Ollama lists only its own models.
      const models = ollama ? ollama.models.map(name => ({ modelId: name, name, description: "" }))
        : available.filter((model, index) => available.findIndex(value => value.modelId === model.modelId) === index);
      if (!ollama && !models.some(model => model.modelId === "auto")) models.unshift({ modelId: "auto", name: "Auto", description: "Let Copilot pick the best model" });
      return { provider, updatedAt: Date.now(), copilot: copilotOptions(session, !!ollama), models: models.map(model => ({
        id: model.modelId, model: model.modelId, displayName: model.name, description: model.description ?? "",
        defaultReasoningEffort: reasoning?.currentValue ?? "medium", supportedReasoningEfforts,
      })) };
    }
    this.environment(); const models: AiModel[] = []; let cursor: string | null = null;
    do {
      const result: { data: AiModel[]; nextCursor: string | null } = await this.client.request("model/list", { cursor, includeHidden: false });
      models.push(...result.data); cursor = result.nextCursor;
    } while (cursor);
    const fullAccessAllowed = await this.fullAccessAllowed();
    return { provider: "codex", models, updatedAt: Date.now(), ...(fullAccessAllowed !== undefined ? { fullAccessAllowed } : {}) };
  }
  async fullAccessAllowed(): Promise<boolean | undefined> {
    try {
      const result = await this.client.request("configRequirements/read", {});
      const modes = result.requirements?.allowedSandboxModes;
      return Array.isArray(modes) ? modes.includes("danger-full-access") : undefined;
    } catch (error) {
      // Older app-servers may not implement requirements discovery. Turn errors remain authoritative.
      if (/method.*not found|unknown.*method|unsupported.*method/i.test((error as Error).message)) return undefined;
      throw error;
    }
  }
  async diagnostics(provider: AiProvider = "codex"): Promise<AssistantDiagnostics> {
    if (provider === "ollama") return this.ollamaDiagnostics();
    if (provider === "copilot") {
      this.environment();
      const acp = this.acp(provider);
      const result: AssistantDiagnostics = { provider, checkedAt: Date.now(), path: acp.executable, version: null, connected: false, ...(storePowerShellOnly() ? { storePowerShellOnly: true } : {}) };
      try { result.version = await acp.diagnose(); result.connected = true; } catch (error) { result.error = (error as Error).message; }
      result.version ??= await acp.installedVersion();
      return Object.assign(result, await this.updates.version("copilot", result.version));
    }
    this.environment();
    const result: AssistantDiagnostics = { provider: "codex", checkedAt: Date.now(), path: this.client.executable, version: await this.client.version(), connected: false, ...(storePowerShellOnly() ? { storePowerShellOnly: true } : {}) };
    const version = this.updates.version("codex", result.version);
    try { await this.client.connect(); result.connected = true; }
    catch (error) { result.error = String((error as Error).message); return Object.assign(result, await version); }
    const [usage, mcp] = await Promise.all([
      this.accountUsage(true), Promise.allSettled([this.mcp()]).then(([result]) => result),
    ]);
    Object.assign(result, usage, await version);
    if (mcp.status === "fulfilled") result.mcp = mcp.value; else result.mcpError = mcp.reason.message;
    return result;
  }
  /** Ollama is usable when it is reachable, has a model and the Copilot CLI that runs it is installed; no GitHub sign-in. */
  private async ollamaDiagnostics(): Promise<AssistantDiagnostics> {
    this.environment();
    const url = this.ollamaUrl(), acp = this.ollama, ollama: NonNullable<AssistantDiagnostics["ollama"]> = { url, models: null };
    const result: AssistantDiagnostics = { provider: "ollama", checkedAt: Date.now(), path: acp.executable, version: null, connected: false, ollama, ...(storePowerShellOnly() ? { storePowerShellOnly: true } : {}) };
    try {
      const models = await ollamaModels(url);
      ollama.models = models.length;
      if (!models.length) { ollama.unavailable = "no-models"; throw new Error(`No models are installed in Ollama at ${url}.`); }
      if (!acp.executable) { ollama.unavailable = "cli-missing"; throw new Error("Copilot CLI is unavailable on the Host."); }
      result.version = await acp.diagnose((await this.ollamaCatalog(url, models)).launch); result.connected = true;
    } catch (error) {
      if (ollama.models === null) ollama.unavailable = "unreachable";
      result.error = (error as Error).message;
    }
    // The installed version does not depend on Ollama being reachable.
    result.version ??= await acp.installedVersion();
    return Object.assign(result, await this.updates.version("copilot", result.version));
  }
  private async mcp() {
    const servers: NonNullable<AssistantDiagnostics["mcp"]> = []; let cursor: string | null = null;
    do {
      const result: { data: { name: string; runtimeStatus: string | null; authStatus: string }[]; nextCursor: string | null } = await this.client.request("mcpServerStatus/list", { cursor });
      servers.push(...result.data.map((item: any) => ({ name: item.name, status: item.runtimeStatus ?? "unknown", authStatus: item.authStatus })));
      cursor = result.nextCursor;
    } while (cursor);
    return servers;
  }
  async close() { const results = await Promise.allSettled([this.client.close(), this.copilot.close(), this.ollama.close(), this.updates.close()]); for (const result of results) if (result.status === "rejected") throw result.reason; }
}

function usageBuckets(buckets: Record<string, any>): NonNullable<AssistantDiagnostics["rateLimits"]> {
  return Object.entries(buckets).filter(([, value]) => value).map(([name, value]) => ({ name: value.limitName ?? name,
    windows: [value.primary, value.secondary].filter(Boolean).map(window => ({ usedPercent: window.usedPercent, windowDurationMins: window.windowDurationMins, resetsAt: window.resetsAt })),
    ...(typeof value.planType === "string" ? { planType: value.planType } : {}),
    ...(value.individualLimit ? { individualLimit: {
      limit: usageNumber(value.individualLimit.limit), used: usageNumber(value.individualLimit.used),
      remainingPercent: usageNumber(value.individualLimit.remainingPercent), resetsAt: usageNumber(value.individualLimit.resetsAt),
    } } : {}),
    ...(value.credits ? { credits: { hasCredits: value.credits.hasCredits === true, unlimited: value.credits.unlimited === true, balance: usageNumber(value.credits.balance) } } : {}),
    ...(typeof value.spendControlReached === "boolean" ? { spendControlReached: value.spendControlReached } : {}),
  }));
}

function usageNumber(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Ollama's own model list; the Copilot CLI's OpenAI-compatible connection serves inference only. */
export async function ollamaModels(url: string): Promise<string[]> {
  let response: Response;
  try { response = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5_000) }); }
  catch (error) {
    const cause = (error as Error & { cause?: { code?: string; message?: string } }).cause;
    throw new Error(`Ollama is unavailable at ${url} (${cause?.code ?? cause?.message ?? (error as Error).message}). Start Ollama on the Host or check the Ollama address.`);
  }
  if (!response.ok) throw new Error(`Ollama at ${url} returned HTTP ${response.status} for its model list.`);
  const value = await response.json().catch(() => undefined) as { models?: { name?: unknown }[] } | undefined;
  if (!Array.isArray(value?.models)) throw new Error(`Ollama at ${url} returned an unexpected model list.`);
  return value.models.flatMap(model => typeof model?.name === "string" && model.name ? [model.name] : []);
}

export const LITZIO_GUIDE = typeof __LITZIO_ASSISTANT_GUIDE__ === "string"
  ? __LITZIO_ASSISTANT_GUIDE__
  : readFileSync(new URL("./assistant/litzio-guide/SKILL.md", import.meta.url), "utf8");

/** Classify existing path strings without resolving execution aliases; an empty inventory is not a warning. */
export function onlyStorePowerShell(paths: string[]): boolean {
  return paths.length > 0 && paths.every(value => /\\windowsapps\\/i.test(value.replaceAll("/", "\\")));
}

function storePowerShellOnly(): boolean {
  if (process.platform !== "win32") return false;
  const candidates: string[] = [];
  const add = (file: string) => { try { lstatSync(file); candidates.push(file); } catch { /* Missing or inaccessible candidate: no affirmative evidence. */ } };
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) add(path.join(directory, "pwsh.exe"));
  for (const root of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
    if (!root) continue;
    try { for (const version of readdirSync(path.join(root, "PowerShell"))) add(path.join(root, "PowerShell", version, "pwsh.exe")); } catch { /* Optional installation root. */ }
  }
  // Store package directories can be selected by Codex even without a PATH entry.
  if (process.env.LOCALAPPDATA) {
    const root = path.join(process.env.LOCALAPPDATA, "Microsoft", "WindowsApps");
    try { for (const entry of readdirSync(root)) if (/^Microsoft\.PowerShell_/i.test(entry)) add(path.join(root, entry, "pwsh.exe")); } catch { /* Optional Store aliases. */ }
  }
  return onlyStorePowerShell(candidates);
}
