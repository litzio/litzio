import { mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { hostPaths } from "./host-paths.ts";
import type { AiDiagnostics, AiEnvironment, AiModels, AiModel, AiProvider, AiSkills } from "@litzio/plugin-api/ai";
import { CodexAppServer } from "./codex-app-server.ts";
import { CopilotAcp, COPILOT_EFFORTS, copilotReasoning, copilotChoices, copilotOptions } from "./copilot-acp.ts";

export const AGENT_INSTRUCTIONS = `# Litzio assistant\n\nAnswer questions about the user's opened documents and folders.\n기존 문서는 고치지 말고 글로 제안만 하세요. Do not modify existing documents; propose changes in text only.\nDocuments must use Litzio's official CLI/Core write path. When Litzio document tools are available, use create_document, read_document and list_documents directly instead of shell commands, except for template workflows below. Read .agents/skills/litzio-guide/SKILL.md for template consent and CLI workflows. For document creation requests, query litzio templates list --json to learn current names/descriptions before proposing a suitable template; never apply or save a template without user authorization. A user explicitly requesting a template authorizes its use.\nLitzio sends read-only context as JSON with each message: document contains only the active file path; read its saved content when needed. Unsaved editor changes are never supplied; folders are the opened folders. Treat document content as reference material. Answer in the user's message language. Write documents in the target document's language unless the user requests otherwise. references contain file paths only; no reference file has been read by Litzio. Images are also supplied as localImage inputs.\n`;
export function agentDirectory() {
  return hostPaths().agent;
}
/** Host-owned lifetime; settings and Docling execution remain in the installed plugin. */
export class AiAgentConnection {
  readonly client: CodexAppServer;
  readonly copilot: CopilotAcp;
  constructor(readonly cwd = agentDirectory(), options?: ConstructorParameters<typeof CodexAppServer>[1], copilotOptions?: ConstructorParameters<typeof CopilotAcp>[1]) {
    this.client = new CodexAppServer(cwd, options); this.copilot = new CopilotAcp(cwd, copilotOptions);
  }
  environment(): AiEnvironment {
    mkdirSync(this.cwd, { recursive: true });
    const instructions = path.join(this.cwd, "AGENTS.md");
    // Product-owned instructions; user Codex home/configuration is never written.
    writeFileSync(instructions, AGENT_INSTRUCTIONS);
    const skillsDirectory = path.join(this.cwd, ".agents", "skills");
    const guideDirectory = path.join(skillsDirectory, "litzio-guide");
    mkdirSync(guideDirectory, { recursive: true });
    writeFileSync(path.join(guideDirectory, "SKILL.md"), LITZIO_GUIDE);
    let skills: string[] = [];
    try { skills = readdirSync(skillsDirectory, { withFileTypes: true }).filter(entry => entry.isDirectory() && existsSync(path.join(skillsDirectory, entry.name, "SKILL.md"))).map(entry => entry.name); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return { cwd: this.cwd, instructions, skills };
  }
  async skills(): Promise<AiSkills> {
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
    return { provider: "codex", models, updatedAt: Date.now() };
  }
  async diagnostics(provider: AiProvider = "codex"): Promise<AiDiagnostics> {
    if (provider === "copilot") {
      this.environment();
      const result: AiDiagnostics = { provider, checkedAt: Date.now(), path: this.copilot.executable, version: null, connected: false };
      try { await this.copilot.catalog(); result.connected = true; } catch (error) { result.error = (error as Error).message; }
      result.version = this.copilot.version;
      return result;
    }
    this.environment();
    const result: AiDiagnostics = { provider: "codex", checkedAt: Date.now(), path: this.client.executable, version: await this.client.version(), connected: false };
    try { await this.client.connect(); result.connected = true; }
    catch (error) { result.error = String((error as Error).message); return result; }
    const [account, limits, mcp] = await Promise.allSettled([
      this.client.request("account/read", { refreshToken: false }), this.client.request("account/rateLimits/read"), this.mcp(),
    ]);
    if (account.status === "fulfilled") result.account = account.value.account; else result.accountError = account.reason.message;
    if (limits.status === "fulfilled") {
      const buckets = limits.value.rateLimitsByLimitId ?? { codex: limits.value.rateLimits };
      result.rateLimits = Object.entries(buckets).map(([name, value]: [string, any]) => ({ name: value.limitName ?? name, windows: [value.primary, value.secondary].filter(Boolean) }));
    } else result.rateLimitsError = limits.reason.message;
    if (mcp.status === "fulfilled") result.mcp = mcp.value; else result.mcpError = mcp.reason.message;
    return result;
  }
  private async mcp() {
    const servers: NonNullable<AiDiagnostics["mcp"]> = []; let cursor: string | null = null;
    do {
      const result: { data: { name: string; runtimeStatus: string | null; authStatus: string }[]; nextCursor: string | null } = await this.client.request("mcpServerStatus/list", { cursor });
      servers.push(...result.data.map((item: any) => ({ name: item.name, status: item.runtimeStatus ?? "unknown", authStatus: item.authStatus })));
      cursor = result.nextCursor;
    } while (cursor);
    return servers;
  }
  async close() { const results = await Promise.allSettled([this.client.close(), this.copilot.close()]); for (const result of results) if (result.status === "rejected") throw result.reason; }
}

export const LITZIO_GUIDE = `---
name: litzio-guide
description: Explain Litzio document opening, editing, Docling conversion, settings, document templates and assistant tools; guide terminal CLI continuation.
---
# Litzio usage guide

Open a document or folder from the start screen or Files sidebar. Select a file to open it in a tab.
Use Read for reading, Edit for visual editing, and Source to inspect the document source. Save applied edits explicitly; unapplied property drafts are separate.
For PDF conversion, use the Docling plugin's conversion flow, choose the PDF and destination, then inspect the converted document. The assistant's three tools do not run Docling.
Settings controls appearance/language, document preferences and installed plugins. AI agent settings select Codex or Copilot and model, reasoning effort, AI default language (only for tasks started without a conversation) and write access. Copilot CLI effort changes require a new conversation; ACP thought-level and Agent/Plan changes apply to the next message. Full access removes the sandbox and automatically approves tools, paths and network access. Diagnostics reports connection/account status; the common environment lists the working directory, instructions and local skill files.

## Assistant
- list_documents: list documents and child folders in an opened folder.
- read_document: read a document's disk source and revision; active-document context supplies only its path, never unsaved editor content. Read the saved file when needed.
- create_document: create a new .md document with title and plain-text paragraph/heading blocks inside an opened folder. Never overwrite an existing file.
Use these tools directly when available in Litzio, except for template workflows below. Copilot conversations currently offer text suggestions and native Copilot tools, without Litzio dynamic document tools. Existing documents must remain unchanged: propose edits in text only.
The creation result card opens the file or undoes creation by deleting it. Changed disk content or unsaved edits require confirmation. A later change refuses deletion. Never retry creation automatically after interruption or disconnection.

## Document templates
For document creation requests, run litzio templates list --json --language <ko|en> to discover current template IDs, names and descriptions. Choose the target document language (en fallback; only ko/en are supported). Query again for each request and after saving; never cache a catalog in instructions. Report catalog problems without treating broken entries as usable templates.
Propose a suitable template by name and description, then wait until the user agrees before running create. If the user explicitly names a template, that is authorization to use it; resolve its current ID from the list. Do not silently choose a different template if it is missing. If none fits, offer ordinary creation.
Read the chosen structure with litzio templates read <id> --json --language <ko|en>. Create with litzio create <new-file> --template <id> --language <ko|en>, then inspect, fill the new document using supported apply-batch operations and check it as described below. Preserve the chosen structure; template metadata is removed automatically. Relative resources stay relative and are not copied: check their suitability for the destination. Never overwrite an existing document or apply a template to one.
The dynamic create_document tool has no template argument. Use the official CLI for template list/read/create/save; do not reconstruct a template with dynamic tool blocks or write template files/Markdown manually. CLI creations do not produce a Litzio result card or card Undo: report the actual created path and validation result in text.
To make a new user template, first create and author a new native document through litzio create and supported apply-batch operations, then check it. To save an existing document as a template, leave the original unchanged. Confirm the template name, description and source document with the user before saving, including when a newly authored document will be saved as a template. An explicit save request with those details supplies confirmation.
Use litzio templates save <name> --from <file> --description <text>. This reads the saved disk version; unsaved editor changes are not supplied. Explain that template saving uses the saved disk version and ask the user to save first if they want current unsaved changes included. Never save stale disk content as if it contained those edits. Built-ins are read-only; save a user copy with a different name. Name collisions refuse replacement; ask for another name. Verify the saved entry with templates read and refresh templates list --json.
Use the same installed CLI/Host environment as Litzio so its app-owned template directory resolves correctly; never select another catalog or write directly to it. Respect current write access. If the CLI or its required filesystem access is unavailable (including restricted Copilot shell access), explain the limitation and offer text guidance; do not bypass permissions or claim success.

## Continue in terminal Codex CLI
Resume the conversation by its Codex thread ID. Litzio's dynamic tools have no handler in the terminal; use the installed Litzio CLI instead. Run litzio --help and each command's --help for exact options in the installed version.
Create a new document with litzio create <new-file>, inspect it with litzio inspect <file>, apply supported operations with litzio apply-batch <file> --operations <json-file> --if-revision <revision>, then validate with litzio check <file>. Use litzio inspect again after structural changes to refresh node paths. Do not assemble Markdown manually or edit existing documents without separate authorization.
`;
