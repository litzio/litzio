import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { EventEmitter } from "node:events";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION, type RequestPermissionRequest, type RequestPermissionResponse } from "@agentclientprotocol/sdk";
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
    const child = spawn(command, this.options.args ?? ["--acp", "--deny-tool=shell", "--disable-builtin-mcps"],
      { cwd: this.cwd, shell, windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    child.stderr.on("data", () => {});
    const connection = new ClientSideConnection(() => ({
      requestPermission: async request => this.permission?.(request) ?? { outcome: { outcome: "cancelled" } },
      sessionUpdate: async params => { this.emit("update", params); },
    }), ndJsonStream(Writable.toWeb(child.stdin) as WritableStream<Uint8Array>, Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>));
    child.on("error", () => { void this.close().catch(() => {}); });
    child.stdin.on("error", () => {});
    void connection.closed.then(() => {
      this.probe = undefined; this.emit("disconnected", "Copilot ACP disconnected.");
      if (this.child === child) { this.ready = undefined; void stopAgentProcess(child).catch(() => {}); }
    });
    const initialized = await this.call(() => connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {}, clientInfo: { name: "Litzio", version: "0.0.0" } }));
    this.loadSession = initialized.agentCapabilities?.loadSession ?? false;
    return connection;
  }
  /** No prompt: reuse one catalog session until the process exits. */
  async catalog() {
    const client = await this.connect();
    return this.probe ??= this.call(() => client.newSession({ cwd: this.cwd, mcpServers: [] })).catch(error => { this.probe = undefined; throw error; });
  }
  async call<T>(operation: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([operation(), new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new Error("Copilot ACP request timed out.")); void this.close().catch(() => {}); }, this.options.timeoutMs ?? 15000); })]); }
    finally { clearTimeout(timer); }
  }
  close() { this.closed = true; return this.closing ??= this.stop(); }
  private async stop() { await stopAgentProcess(this.child); }
}
