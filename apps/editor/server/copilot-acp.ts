import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { EventEmitter } from "node:events";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION, type RequestPermissionRequest, type RequestPermissionResponse, type NewSessionResponse, type SessionConfigOption } from "@agentclientprotocol/sdk";
import type { AiCopilotOptions } from "../shared/assistant.ts";
import { stopAgentProcess } from "./codex-app-server.ts";

/** Concrete Copilot stdio connection, following Paseo's copilot --acp integration. */
export class CopilotAcp extends EventEmitter {
  permission?: (request: RequestPermissionRequest) => RequestPermissionResponse | Promise<RequestPermissionResponse>;
  private child?: ChildProcessWithoutNullStreams;
  private ready?: Promise<ClientSideConnection>;
  private closing?: Promise<void>;
  private closed = false;
  private stopping?: Promise<void>;
  private diagnostic?: CopilotAcp;
  private diagnosis?: Promise<string | null>;
  private probe?: Promise<Awaited<ReturnType<ClientSideConnection["newSession"]>>>;
  version: string | null = null;
  loadSession = false;
  reasoningEffort = "medium";
  fullAccess = false;
  readonly sessions = new Map<string, NewSessionResponse>();
  constructor(readonly cwd: string, private options: { bin?: string; args?: string[]; timeoutMs?: number; env?: () => NodeJS.ProcessEnv } = {}) { super(); }
  get executable() {
    if (this.options.bin) return this.options.bin;
    for (const directory of (process.env.PATH ?? "").split(path.delimiter)) for (const ext of process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""]) {
      const file = path.join(directory.replace(/^"|"$/g, ""), `copilot${ext}`); if (existsSync(file)) return file;
    }
    return null;
  }
  async connect() {
    await this.stopping;
    if (this.closed) return Promise.reject(new Error("Copilot ACP is closed."));
    return this.ready ??= this.initialize().catch(async error => { await this.stop(); this.ready = undefined; throw error; });
  }
  private async initialize() {
    const bin = this.executable; if (!bin) throw new Error("Copilot CLI is unavailable on the Host.");
    const shell = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin), command = shell ? `"${bin}"` : bin;
    this.version = await new Promise<string | null>(resolve => execFile(command, ["--version"], { shell, windowsHide: true, timeout: 5000 }, (error, out) => resolve(error ? null : out.trim())));
    if (this.closed) throw new Error("Copilot ACP is closed.");
    const child = spawn(command, [...(this.options.args ?? []), "--acp", "--allow-tool=litzio_host", "--reasoning-effort", this.reasoningEffort],
      { cwd: this.cwd, env: this.options.env?.() ?? process.env, shell, windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
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
    let initialized = false;
    const disconnected = (message: string) => {
      if (this.child !== child) return;
      this.child = undefined; if (initialized) this.ready = undefined; this.probe = undefined;
      this.sessions.clear(); this.loadSession = false; this.version = null;
      this.stopping = stopAgentProcess(child);
      void this.stopping.catch(() => {});
      this.emit("disconnected", message);
    };
    child.on("error", error => disconnected(error.message));
    child.stdin.on("error", error => disconnected(error.message));
    child.once("exit", (code, signal) => disconnected(`Copilot ACP exited (code ${code}, signal ${signal}).`));
    child.once("close", (code, signal) => disconnected(`Copilot ACP exited (code ${code}, signal ${signal}).`));
    void connection.closed.then(() => disconnected(`Copilot ACP stream closed (code ${child.exitCode}, signal ${child.signalCode}).`));
    const response = await this.call(() => connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {}, clientInfo: { name: "Litzio", version: "0.0.0" } }));
    if (this.child !== child) throw new Error("Copilot ACP disconnected during initialization.");
    this.loadSession = response.agentCapabilities?.loadSession ?? false;
    initialized = true;
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
    let onDisconnect: (message: string) => void = () => {};
    const disconnected = new Promise<never>((_, reject) => {
      onDisconnect = message => reject(new Error(message));
      this.once("disconnected", onDisconnect);
    });
    try { return await Promise.race([disconnected, operation(), new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new Error("Copilot ACP request timed out.")); }, this.options.timeoutMs ?? 15000); })]); }
    catch (error) {
      // ACP rejects RPC failures with plain {code, message, data} objects.
      // Host boundaries preserve Error.message; never stringify provider data.
      if (error instanceof Error) throw error;
      const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "Copilot ACP request failed.";
      throw new Error(message);
    }
    finally { clearTimeout(timer); this.off("disconnected", onDisconnect); }
  }
  /** Independent probe: diagnostics must never disconnect an admitted turn. */
  diagnose(): Promise<string | null> {
    if (this.closed) return Promise.reject(new Error("Copilot ACP is closed."));
    if (this.diagnosis) return this.diagnosis;
    const probe = this.diagnostic = new CopilotAcp(this.cwd, this.options);
    probe.reasoningEffort = this.reasoningEffort; probe.fullAccess = this.fullAccess;
    return this.diagnosis = (async () => {
      try { await probe.catalog(); return probe.version; }
      finally { try { await probe.close(); } finally { this.diagnostic = undefined; this.diagnosis = undefined; } }
    })();
  }
  close() {
    this.closed = true;
    return this.closing ??= (async () => {
      const results = await Promise.allSettled([this.stop(), this.diagnostic?.close()]);
      for (const result of results) if (result.status === "rejected") throw result.reason;
    })();
  }
  private async stop() { await this.stopping; await stopAgentProcess(this.child); }
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
export function copilotModelOption(session: Pick<NewSessionResponse, "configOptions">) {
  return session.configOptions?.find((option): option is SelectOption => option.type === "select" && (option.category === "model" || option.id === "model"));
}
export function copilotOptions(session: NewSessionResponse): AiCopilotOptions {
  const mode = session.configOptions?.find((option): option is SelectOption => option.type === "select" && option.category === "mode");
  const modes = session.modes?.availableModes ?? (mode ? copilotChoices(mode).map(value => ({ id: value.value, name: value.name, description: value.description })) : []);
  // Only protocol Agent/Plan IDs (or their short forms). Names alone cannot authorize a mode.
  const safe = modes.filter(mode => /^(agent|plan)$/.test(mode.id) || /^https:\/\/agentclientprotocol.com\/protocol\/session-modes#(agent|plan)$/.test(mode.id));
  const reasoning = copilotReasoning(session);
  const config = !!reasoning || !!copilotModelOption(session);
  return { ...(config ? { reasoningEfforts: reasoning ? copilotChoices(reasoning).map(value => ({ reasoningEffort: value.value, description: value.description ?? "" })) : [] } : {}), reasoningEffortSource: config ? "config" : "cli",
    modes: safe.map(mode => ({ id: mode.id, name: mode.name, description: mode.description ?? "" })),
    currentMode: session.modes?.currentModeId ?? mode?.currentValue ?? "" };
}
