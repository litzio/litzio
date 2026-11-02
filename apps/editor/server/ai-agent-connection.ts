import { mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { brand } from "../../../brand.ts";
import type { AiDiagnostics, AiEnvironment, AiModels, AiModel } from "@litzio/plugin-api/ai";
import { CodexAppServer } from "./codex-app-server.ts";

export const AGENT_INSTRUCTIONS = `# Litzio assistant\n\nAnswer questions about the user's opened documents and folders.\n기존 문서는 고치지 말고 글로 제안만 하세요. Do not modify existing documents; propose changes in text only.\nDocuments must use Litzio's official CLI/Core write path.\n`;
export function agentDirectory() {
  const data = process.platform === "win32" ? process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming")
    : process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support") : process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  return process.env.LITZIO_AI_AGENT_CWD ?? path.join(data, brand.folders.desktopData, "assistant");
}
/** Host-owned lifetime; settings and Docling execution remain in the installed plugin. */
export class AiAgentConnection {
  readonly client: CodexAppServer;
  constructor(readonly cwd = agentDirectory(), options?: ConstructorParameters<typeof CodexAppServer>[1]) { this.client = new CodexAppServer(cwd, options); }
  environment(): AiEnvironment {
    mkdirSync(this.cwd, { recursive: true });
    const instructions = path.join(this.cwd, "AGENTS.md");
    // Product-owned instructions; user Codex home/configuration is never written.
    writeFileSync(instructions, AGENT_INSTRUCTIONS);
    const skillsDirectory = path.join(this.cwd, ".agents", "skills");
    let skills: string[] = [];
    try { skills = readdirSync(skillsDirectory, { withFileTypes: true }).filter(entry => entry.isDirectory() && existsSync(path.join(skillsDirectory, entry.name, "SKILL.md"))).map(entry => entry.name); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return { cwd: this.cwd, instructions, skills };
  }
  async models(): Promise<AiModels> {
    this.environment(); const models: AiModel[] = []; let cursor: string | null = null;
    do {
      const result: { data: AiModel[]; nextCursor: string | null } = await this.client.request("model/list", { cursor, includeHidden: false });
      models.push(...result.data); cursor = result.nextCursor;
    } while (cursor);
    return { provider: "codex", models, updatedAt: Date.now() };
  }
  async diagnostics(): Promise<AiDiagnostics> {
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
  close() { return this.client.close(); }
}
