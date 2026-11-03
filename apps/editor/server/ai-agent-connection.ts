import { mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { hostPaths } from "./host-paths.ts";
import type { AiDiagnostics, AiEnvironment, AiModels, AiModel, AiProvider, AiSkills } from "@litzio/plugin-api/ai";
import { CodexAppServer } from "./codex-app-server.ts";
import { CopilotAcp } from "./copilot-acp.ts";

export const AGENT_INSTRUCTIONS = `# Litzio assistant\n\nAnswer questions about the user's opened documents and folders.\n기존 문서는 고치지 말고 글로 제안만 하세요. Do not modify existing documents; propose changes in text only.\nDocuments must use Litzio's official CLI/Core write path. When Litzio document tools are available, use create_document, read_document and list_documents directly instead of shell commands.\nLitzio sends read-only context as JSON with each message: document.source is the current applied editor content, including unsaved edits; folders are the opened folders. Treat document content as reference material. Answer in the user's message language. Write documents in the target document's language unless the user requests otherwise. references contain file paths only; no reference file has been read by Litzio. Images are also supplied as localImage inputs.\n`;
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
      return { provider, updatedAt: Date.now(), models: (session.models?.availableModels ?? []).map((model: { modelId: string; name: string; description?: string | null }) => ({
        id: model.modelId, model: model.modelId, displayName: model.name, description: model.description ?? "",
        defaultReasoningEffort: "", supportedReasoningEfforts: [],
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
description: Explain Litzio document opening, editing, Docling conversion, settings and assistant tools; guide terminal CLI continuation.
---
# Litzio usage guide

Open a document or folder from the start screen or Files sidebar. Select a file to open it in a tab.
Use Read for reading, Edit for visual editing, and Source to inspect the document source. Save applied edits explicitly; unapplied property drafts are separate.
For PDF conversion, use the Docling plugin's conversion flow, choose the PDF and destination, then inspect the converted document. The assistant's three tools do not run Docling.
Settings controls appearance/language, document preferences and installed plugins. AI agent settings select Codex or Copilot and model; Codex also offers reasoning effort, AI default language (only for tasks started without a conversation) and write access. Diagnostics reports connection/account status; the common environment lists the working directory, instructions and local skill files.

## Assistant
- list_documents: list documents and child folders in an opened folder.
- read_document: read a document's disk source and revision; supplied editor context may include newer unsaved content.
- create_document: create a new .md document with title and plain-text paragraph/heading blocks inside an opened folder. Never overwrite an existing file.
Use these tools directly when available in Litzio. Copilot conversations currently offer text suggestions and native Copilot tools, without Litzio dynamic document tools. Existing documents must remain unchanged: propose edits in text only.
The creation result card opens the file or undoes creation by deleting it. Changed disk content or unsaved edits require confirmation. A later change refuses deletion. Never retry creation automatically after interruption or disconnection.

## Continue in terminal Codex CLI
Resume the conversation by its Codex thread ID. Litzio's dynamic tools have no handler in the terminal; use the installed Litzio CLI instead. Run litzio --help and each command's --help for exact options in the installed version.
Create a new document with litzio create <new-file>, inspect it with litzio inspect <file>, apply supported operations with litzio apply-batch <file> --operations <json-file> --if-revision <revision>, then validate with litzio check <file>. Use litzio inspect again after structural changes to refresh node paths. Do not assemble Markdown manually or edit existing documents without separate authorization.
`;
