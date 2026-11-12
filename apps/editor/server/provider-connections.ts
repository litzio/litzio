import { mkdirSync, writeFileSync, readdirSync, existsSync, readFileSync, lstatSync } from "node:fs";
import path from "node:path";
import { hostPaths, type HostRun } from "./host-paths.ts";
import { assistantCliEnvironment, hostCli } from "./assistant-cli.ts";
import type { AssistantDiagnostics, AssistantAccountUsage, AssistantEnvironment, AiModels, AiModel, AiProvider, AssistantSkills } from "../shared/assistant.ts";
import { CodexAppServer } from "./codex-app-server.ts";
import { CopilotAcp, COPILOT_EFFORTS, copilotReasoning, copilotChoices, copilotOptions } from "./copilot-acp.ts";

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
  readonly copilot: CopilotAcp;
  readonly templatesDirectory: string;
  private usageCache?: AssistantAccountUsage;
  private usageRead?: Promise<AssistantAccountUsage>;
  private accountRevision = 0;
  constructor(readonly cwd = assistantDirectory(), options?: ConstructorParameters<typeof CodexAppServer>[1], copilotOptions?: ConstructorParameters<typeof CopilotAcp>[1], run: HostRun = {}) {
    this.templatesDirectory = hostPaths(run).templates;
    this.client = new CodexAppServer(cwd, { ...options, env: () => assistantCliEnvironment(cwd, hostCli(run), options?.env?.() ?? process.env) }); this.copilot = new CopilotAcp(cwd, { ...copilotOptions, env: () => assistantCliEnvironment(cwd, hostCli(run), copilotOptions?.env?.() ?? process.env) });
    this.client.on("notification", method => {
      // Rate-limit notifications carry only one bucket. Refetch the full snapshot.
      if (method === "account/updated" || method === "account/rateLimits/updated") this.invalidateUsage();
    });
    this.client.on("disconnected", () => this.invalidateUsage());
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
  async models(provider: AiProvider = "codex"): Promise<AiModels> {
    if (provider === "copilot") {
      this.environment();
      const session = await this.copilot.catalog();
      const reasoning = copilotReasoning(session);
      const supportedReasoningEfforts = reasoning ? copilotChoices(reasoning).map(value => ({ reasoningEffort: value.value, description: value.description ?? "" }))
        : COPILOT_EFFORTS.map(reasoningEffort => ({ reasoningEffort, description: "" }));
      const available: { modelId: string; name: string; description?: string | null }[] = session.models?.availableModels ?? [];
      // Copilot may return auto twice. Retain the first provider description, and synthesize only if absent.
      const models = available.filter((model, index) => available.findIndex(value => value.modelId === model.modelId) === index);
      if (!models.some(model => model.modelId === "auto")) models.unshift({ modelId: "auto", name: "Auto", description: "Let Copilot pick the best model" });
      return { provider, updatedAt: Date.now(), copilot: copilotOptions(session), models: models.map(model => ({
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
    if (provider === "copilot") {
      this.environment();
      const result: AssistantDiagnostics = { provider, checkedAt: Date.now(), path: this.copilot.executable, version: null, connected: false, ...(storePowerShellOnly() ? { storePowerShellOnly: true } : {}) };
      try { result.version = await this.copilot.diagnose(); result.connected = true; } catch (error) { result.error = (error as Error).message; }
      return result;
    }
    this.environment();
    const result: AssistantDiagnostics = { provider: "codex", checkedAt: Date.now(), path: this.client.executable, version: await this.client.version(), connected: false, ...(storePowerShellOnly() ? { storePowerShellOnly: true } : {}) };
    try { await this.client.connect(); result.connected = true; }
    catch (error) { result.error = String((error as Error).message); return result; }
    const [usage, mcp] = await Promise.all([
      this.accountUsage(true), Promise.allSettled([this.mcp()]).then(([result]) => result),
    ]);
    Object.assign(result, usage);
    if (mcp.status === "fulfilled") result.mcp = mcp.value; else result.mcpError = mcp.reason.message;
    return result;
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
  async close() { const results = await Promise.allSettled([this.client.close(), this.copilot.close()]); for (const result of results) if (result.status === "rejected") throw result.reason; }
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
