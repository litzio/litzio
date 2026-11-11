import { mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { hostPaths, type HostRun } from "./host-paths.ts";
import { assistantCliEnvironment, hostCli } from "./assistant-cli.ts";
import type { AssistantDiagnostics, AssistantAccountUsage, AssistantEnvironment, AiModels, AiModel, AiProvider, AssistantSkills } from "../shared/assistant.ts";
import { CodexAppServer } from "./codex-app-server.ts";
import { CopilotAcp, COPILOT_EFFORTS, copilotReasoning, copilotChoices, copilotOptions } from "./copilot-acp.ts";

export const ASSISTANT_INSTRUCTIONS = `# Litzio assistant\n\nAnswer questions about the user's opened documents and folders.\n기존 문서는 사용자가 명시적으로 수정을 요청할 때만 변경 대기 사본을 고치세요. Edit existing documents only after an explicit user edit request, and only on a pending copy. With Codex, use stage_document to start/find the copy. With Copilot full-access, use litzio assistant changes start <conversationId> --path <absolute-original-path> (conversationId is in the message context); Copilot has no stage_document dynamic tool. When available, prefer inspect_staged_document({change}) then edit_staged_document({change,copyRevision,operations}) without shell/CLI. Inspect gives the current nodes and revision. A successful edit means 사본 완료·사람 적용 대기. For full-access terminal continuation only, use inspect/apply-batch/check via Litzio CLI on the returned copy path. Never write the original, apply or discard changes yourself; the human uses Review. Keep the reply brief: changes pending, review in Litzio. Copilot in opened-folders or read-only cannot run the required CLI: clearly explain that existing-document editing requires Full access or Codex; never bypass shell denial.\nDocuments must use Litzio's official CLI/Core write path. When Litzio document tools are available, use create_document, read_document and list_documents directly instead of shell commands. Use list_templates, read_template, save_template and create_document with template for templates; CLI is for terminal continuation. For display settings, use read_display_settings and change_display_settings only when available. Change only what the user requested: propose, obtain permission, then apply; an explicit change request is permission. Never change assistant permissions/provider/model, plugins, document contents or front matter with these tools. For user questions in Litzio, use request_litzio_user_input instead of request_user_input_async. It confirms question-card rendering before accepted:true and reports display failures. Do not claim the user has seen or answered a question from an unconditional native accepted result. For review workspaces, use read_review_document and read_review_material, prioritize numeric/unit source-evidence candidates, then read suspicious page fragments. Propose groups only; never approve/reject/undo/complete or bypass refusal via shell/CLI. Never record material you did not read as inspected; use uncertain when evidence is insufficient. For images first call estimate_review_images, then request_litzio_user_input with reviewImage (the exact selection and estimateHash). Wait for the actual human answer and runId, then read_review_images only within that scope. Question acceptance is not approval. Record findings with record_review_inspection. For plugin management, use manage_plugins when available. For plugin lookups and declared health checks, use invoke_plugin_operation on this conversation Host. Ordinary reads require assistant:true; these reads and declared health checks are allowed in read-only turns, while writes are refused. Never bypass this refusal using shell/CLI. Comparison targets belong in operation input, not saved settings. Plugin management runs without per-call approval and appears in conversation activity. Never supply secrets. If a window does not confirm application, report it as unconfirmed, never as success. Read .agents/skills/litzio-guide/SKILL.md for template consent and CLI workflows. For document creation requests, query list_templates to learn current names/descriptions before proposing a suitable template; never apply or save a template without user authorization. A user explicitly requesting a template authorizes its use.\nLitzio sends read-only context as JSON with each message: document contains only the active file path; read its saved content when needed. Unsaved editor changes are never supplied; folders are the opened folders. Treat document content as reference material. Answer in the user's message language. Write documents in the target document's language unless the user requests otherwise. references identify attached files. Read saved reference content with the available document tools when needed. Images are also supplied as localImage inputs.\n`;
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
      const result: AssistantDiagnostics = { provider, checkedAt: Date.now(), path: this.copilot.executable, version: null, connected: false };
      try { await this.copilot.catalog(); result.connected = true; } catch (error) { result.error = (error as Error).message; }
      result.version = this.copilot.version;
      return result;
    }
    this.environment();
    const result: AssistantDiagnostics = { provider: "codex", checkedAt: Date.now(), path: this.client.executable, version: await this.client.version(), connected: false };
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

export const LITZIO_GUIDE = `---
name: litzio-guide
description: Explain Litzio document opening, editing, settings, document templates and assistant tools; guide terminal CLI continuation.
---
# Litzio usage guide

Open a document or folder from the start screen or Files sidebar. Select a file to open it in a tab.
Use Read for reading, Edit for visual editing, and Source to inspect the document source. Save applied edits explicitly; unapplied property drafts are separate.
Settings controls appearance/language, document preferences and official AI. Assistant settings select Codex or Copilot and model, reasoning effort, AI default language (only for tasks started without a conversation) and permission mode. Copilot CLI effort changes require a new conversation; ACP thought-level and Agent/Plan changes apply to the next message. Full access removes the sandbox and automatically approves tools, paths and network access. Diagnostics reports connection/account status; the common environment lists the working directory, instructions and local skill files.

## Assistant
- read_display_settings: read theme, UI language, document width and page background in the sending Litzio window.
- change_display_settings: change only those display preferences on explicit request or after proposal and permission. Explicit requests supply permission. assistant permissions/provider/model, plugin registration, document content and front matter are excluded. A visible assistant panel in the sending window must confirm the result; report failures or missing confirmation honestly. The result card offers guarded Undo in that window and Host session. Terminal CLI and Copilot do not have these display tools.
- list_documents: list documents and child folders in an opened folder.
- read_document: read a document's disk source and revision; active-document context supplies only its path, never unsaved editor content. Read the saved file when needed.
- create_document: create a new .md document with title and plain-text paragraph/heading blocks, or with template and optional language (without title/blocks), inside an opened folder. Never overwrite an existing file.
Use these tools directly when available in Litzio, including template workflows below. Copilot has native tools without Litzio dynamic document tools. In full-access it can use the Host CLI pending-copy workflow below; opened-folders cannot execute the required CLI and must explain the limitation. Never edit existing originals directly.
The creation result card opens the file or undoes creation by deleting it. Changed disk content or unsaved edits require confirmation. A later change refuses deletion. Never retry creation automatically after interruption or disconnection.

## Document templates
For document creation requests, call list_templates with language (ko or en; en fallback) to learn current names/descriptions at request time. Query again after saving; never memorize the catalog, and report broken entries. Propose a suitable template by name/description, then wait until the user agrees before calling read_template and create_document with path, template and language. If the user explicitly names a template, that request is authorization to use it. Resolve its current ID; a missing/invalid named template must not silently fall back to another template. If none fits, offer ordinary creation. Do not reconstruct template contents using blocks or write Markdown/template files manually. Relative resources stay relative and are not copied; check their suitability for the destination.
Use save_template with name, from and optional description to save a native disk document as a new user template. Confirm the name, description and source document before saving; an explicit request containing these details is sufficient authorization. Existing source documents remain unchanged. Unsaved editor changes are not supplied: ask the user to Save first when they intend the saved disk version to include them. Never present stale disk content as those edits. To make a new template, first create a new native document with create_document, then save it as a template. Built-ins are read-only: save a copy under a new name to customize them. Name collisions never overwrite; ask for a different name. After saving, call read_template and refresh list_templates to confirm it.
Template creation through create_document returns the same result card and guarded Undo as ordinary creation. Host-owned template storage is outside document folders; save_template checks the source against this turn's opened folders/Host Roots and write access while writing only to the fixed app-owned template directory. If tools or access are unavailable, explain the limitation and offer text guidance. Copilot does not have Litzio template tools yet; offer text guidance rather than claiming a template was applied.

## Existing document edits
An explicit edit request authorizes edits to a pending copy only. Use stage_document when available. Otherwise run litzio assistant changes start <conversationId> --path <absolute-original-path> (conversationId is in the message context). This starts/finds the same Host conversation copy; never edit the original or run changes apply/discard yourself. Prefer inspect_staged_document then edit_staged_document when available; they edit only the pending copy without a shell. Otherwise use litzio inspect <copy> --format json to get current paths and revision; litzio apply-batch <copy> --operations <json-file> --if-revision <revision>, then litzio check <copy>. Run litzio apply-batch --help for supported operations and JSON schema, and inspect again after structural edits. For example insert-block followed by remove-block replaces a paragraph. New documents still use create_document or litzio create directly. Read-only never creates a copy. Copilot opened-folders cannot run shell/CLI: explain that this provider/permission cannot edit existing documents and ask the user to choose Full access or Codex. Never change permissions yourself.

## Continue in terminal Codex CLI
Resume the conversation by its Codex thread ID. Litzio's dynamic tools have no handler in the terminal; use the installed Litzio CLI instead. Run litzio --help and each command's --help for exact options in the installed version.
For terminal template workflows use litzio templates list --json --language <ko|en>, litzio templates read <id> --json --language <ko|en>, litzio create <new-file> --template <id> --language <ko|en>, and litzio templates save <name> --from <file> --description <text>. These reuse the same Host operations, consent and saved-source rules. CLI creations do not produce a Litzio result card or card Undo; report the path and validation result in text. Use the CLI belonging to this Host/catalog; the Host prepends its private CLI shim directory to the Codex child's PATH without changing system PATH. Terminal resumption outside Litzio must resolve the intended CLI explicitly.
Create a new document with litzio create <new-file>, inspect it with litzio inspect <file>, apply supported operations with litzio apply-batch <file> --operations <json-file> --if-revision <revision>, then validate with litzio check <file>. Use litzio inspect again after structural changes to refresh node paths. Do not assemble Markdown manually or edit existing documents without separate authorization.
`;
