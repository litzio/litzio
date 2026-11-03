import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { EventEmitter } from "node:events";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION, type RequestPermissionRequest, type RequestPermissionResponse, type NewSessionResponse, type SessionConfigOption } from "@agentclientprotocol/sdk";
import type { AiCopilotOptions } from "@litzio/plugin-api/ai";
import { stopAgentProcess } from "./codex-app-server.ts";

/** Concrete Copilot stdio connection, following Paseo's copilot --acp integration. */
export class CopilotAcp extends EventEmitter {
  permission?: (request: RequestPermissionRequest) => RequestPermissionResponse;
  private child?: ChildProcessWithoutNullStreams;
  private ready?: Promise<ClientSideConnection>;
  private closing?: Promise<void>;
  private closed = false;
  private probe?: Promise<Awaited<ReturnType<ClientSideConnection["newSession"]>>>;
  version: string | null = null;
  loadSession = false;
  reasoningEffort = "medium";
  fullAccess = false;
  readonly sessions = new Map<string, NewSessionResponse>();
  constructor(readonly cwd: string, private options: { bin?: string; args?: string[]; timeoutMs?: number } = {}) { super(); }
  get executable() {
    if (this.options.bin) return this.options.bin;
    for (const directory of (process.env.PATH ?? "").split(path.delimiter)) for (const ext of process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""]) {
      const file = path.join(directory.replace(/^"|"$/g, ""), `copilot${ext}`); if (existsSync(file)) return file;
    }
    return null;
  }
  connect() {
    if (this.closed) return Promise.reject(new Error("Copilot ACP is closed."));
    return this.ready ??= this.initialize().catch(async error => { await this.stop(); this.ready = undefined; throw error; });
  }
  private async initialize() {
    const bin = this.executable; if (!bin) throw new Error("Copilot CLI is unavailable on the Host.");
    const shell = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin), command = shell ? `"${bin}"` : bin;
    this.version = await new Promise<string | null>(resolve => execFile(command, ["--version"], { shell, windowsHide: true, timeout: 5000 }, (error, out) => resolve(error ? null : out.trim())));
    if (this.closed) throw new Error("Copilot ACP is closed.");
    const child = spawn(command, [...(this.options.args ?? []), "--acp", ...(!this.fullAccess ? ["--deny-tool=shell"] : []), "--disable-builtin-mcps", "--reasoning-effort", this.reasoningEffort],
      { cwd: this.cwd, shell, windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    child.stderr.on("data", () => {});
    const connection = new ClientSideConnection(() => ({
      requestPermission: async request => this.permission?.(request) ?? { outcome: { outcome: "cancelled" } },
      sessionUpdate: async params => {
        const session = this.sessions.get(params.sessionId), update = params.update;
        if (session && update.sessionUpdate === "config_option_update") session.configOptions = update.configOptions;
        if (session && update.sessionUpdate === "current_mode_update" && session.modes) session.modes.currentModeId = update.currentModeId;
        this.emit("update", params);
      },
    }), ndJsonStream(Writable.toWeb(child.stdin) as WritableStream<Uint8Array>, Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>));
    child.on("error", () => { void this.close().catch(() => {}); });
    child.stdin.on("error", () => {});
    void connection.closed.then(() => {
      if (this.child === child) {
        this.probe = undefined; this.sessions.clear(); this.emit("disconnected", "Copilot ACP disconnected.");
        this.ready = undefined; void stopAgentProcess(child).catch(() => {});
      }
    });
    const initialized = await this.call(() => connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {}, clientInfo: { name: "Litzio", version: "0.0.0" } }));
    this.loadSession = initialized.agentCapabilities?.loadSession ?? false;
    return connection;
  }
  /** No prompt: reuse one catalog session until the process exits. */
  async catalog() {
    const client = await this.connect();
    return this.probe ??= this.call(() => client.newSession({ cwd: this.cwd, mcpServers: [] })).then(session => this.remember(session)).catch(error => { this.probe = undefined; throw error; });
  }
  remember(session: NewSessionResponse) { this.sessions.set(session.sessionId, session); return session; }
  /** CLI fallback is fixed for a conversation. Caller must exclude active turns before restarting. */
  async useLaunchSettings(effort: string, fullAccess: boolean) {
    if (!COPILOT_EFFORTS.includes(effort)) throw new Error("Invalid Copilot reasoning effort.");
    if (effort === this.reasoningEffort && fullAccess === this.fullAccess) return;
    const client = this.ready ? await this.ready : undefined;
    await this.stop();
    if (client) await client.closed;
    this.ready = undefined; this.probe = undefined; this.reasoningEffort = effort; this.fullAccess = fullAccess;
  }
  async call<T>(operation: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([operation(), new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new Error("Copilot ACP request timed out.")); void this.close().catch(() => {}); }, this.options.timeoutMs ?? 15000); })]); }
    finally { clearTimeout(timer); }
  }
  close() { this.closed = true; return this.closing ??= this.stop(); }
  private async stop() { await stopAgentProcess(this.child); }
}

export const COPILOT_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
type SelectOption = Extract<SessionConfigOption, { type: "select" }>;
export function copilotReasoning(session: Pick<NewSessionResponse, "configOptions">) {
  return session.configOptions?.find((option): option is SelectOption => option.type === "select" &&
    (option.category === "thought_level" || ["reasoning_effort", "reasoning", "thought_level"].includes(option.id)));
}
export function copilotChoices(option: SelectOption) {
  return option.options.flatMap(value => "value" in value ? [value] : value.options);
}
export function copilotOptions(session: NewSessionResponse): AiCopilotOptions {
  const mode = session.configOptions?.find((option): option is SelectOption => option.type === "select" && option.category === "mode");
  const modes = session.modes?.availableModes ?? (mode ? copilotChoices(mode).map(value => ({ id: value.value, name: value.name, description: value.description })) : []);
  // Only protocol Agent/Plan IDs (or their short forms). Names alone cannot authorize a mode.
  const safe = modes.filter(mode => /^(agent|plan)$/.test(mode.id) || /^https:\/\/agentclientprotocol.com\/protocol\/session-modes#(agent|plan)$/.test(mode.id));
  const reasoning = copilotReasoning(session);
  return { ...(reasoning ? { reasoningEfforts: copilotChoices(reasoning).map(value => ({ reasoningEffort: value.value, description: value.description ?? "" })) } : {}), reasoningEffortSource: reasoning ? "config" : "cli",
    modes: safe.map(mode => ({ id: mode.id, name: mode.name, description: mode.description ?? "" })),
    currentMode: session.modes?.currentModeId ?? mode?.currentValue ?? "" };
}
