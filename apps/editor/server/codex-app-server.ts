import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { StringDecoder } from "node:string_decoder";
import { launch, processLog, type Launch, type ProviderDaemonLog } from "./provider-daemon-log.ts";

type Message = { id?: number | string; method?: string; params?: any; result?: any; error?: { code?: number; message: string } };
/** Same newline JSON-RPC transport as the 10-28 spike; no provider framework. */
export class LineDecoder {
  private buffer = "";
  private text = new StringDecoder("utf8");
  constructor(private receive: (message: Message) => void) {}
  push(chunk: Buffer) {
    this.buffer += this.text.write(chunk);
    let end: number;
    while ((end = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, end).trim(); this.buffer = this.buffer.slice(end + 1);
      if (line) this.receive(JSON.parse(line));
    }
  }
}
function codexPath(): string | null {
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) for (const extension of extensions) {
    const file = path.join(directory.replace(/^"|"$/g, ""), `codex${extension}`);
    if (existsSync(file)) return file;
  }
  return null;
}
function command(bin: string) {
  const shell = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);
  return { bin: shell ? `"${bin}"` : bin, shell };
}
export class CodexAppServer extends EventEmitter {
  userInput?: (id: string | number, params: any, respond: (answers: unknown) => void) => void;
  approval?: (id: string | number, method: string, params: any, respond: (result: unknown) => void) => void;
  toolCall?: (params: any) => unknown;
  private child?: ChildProcessWithoutNullStreams;
  private ready?: Promise<void>;
  private closed = false;
  private closing?: Promise<void>;
  private nextId = 0;
  private pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  /** `log`: the Host's daemon log; `busy`: whether a Codex turn is in progress, for an unexpected exit's line. */
  constructor(readonly cwd: string, private options: { bin?: string; args?: string[]; timeoutMs?: number; env?: () => NodeJS.ProcessEnv; log?: ProviderDaemonLog; busy?: () => boolean } = {}) { super(); }
  get executable() { return this.options.bin ?? codexPath(); }
  async version(): Promise<string | null> {
    const bin = this.executable; if (!bin) return null;
    const cmd = command(bin);
    return new Promise(resolve => execFile(cmd.bin, ["--version"], { shell: cmd.shell, windowsHide: true, timeout: 5000 }, (error, out) => resolve(error ? null : out.trim())));
  }
  connect(): Promise<void> {
    if (this.closed) return Promise.reject(new Error("Codex app-server is closed."));
    return this.ready ??= this.initialize().catch(async error => { try { await this.stop(); } finally { this.ready = undefined; } throw error; });
  }
  private async initialize() {
    const state = launch(), log = processLog(this.options.log, "codex", "main");
    try { await this.launch(state); } catch (error) { log.failed(state, error); throw error; }
    log.started(state);
  }
  private async launch(state: Launch) {
    const bin = state.bin = this.executable;
    if (!bin) throw new Error("Codex CLI is unavailable on the Host.");
    const version = state.version = await this.version();
    if (!version) throw new Error("Codex CLI could not be executed on the Host.");
    const match = version?.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match || Number(match[1]) === 0 && Number(match[2]) < 141) throw new Error("Codex 0.141.0 or later is required.");
    state.stage = "spawn";
    if (this.closed) throw new Error("Codex app-server is closed.");
    const cmd = command(bin);
    const child = state.child = spawn(cmd.bin, this.options.args ?? ["app-server", "-c", "features.default_mode_request_user_input=true"], { cwd: this.cwd, shell: cmd.shell,
      windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"], env: this.options.env?.() });
    this.child = child;
    let initialized = false;
    const fail = (error: Error) => { for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); } this.pending.clear(); };
    const decoder = new LineDecoder(message => this.dispatch(message));
    child.stdout.on("data", (chunk: Buffer) => { try { decoder.push(chunk); } catch { fail(new Error("Invalid Codex app-server response.")); void this.close().catch(() => {}); } });
    child.stderr.on("data", () => {});
    child.stdin.on("error", fail); child.on("error", fail);
    child.once("close", () => {
      // Logged before the disconnect fails the conversation's turns.
      if (initialized && !stoppedByHost(child)) processLog(this.options.log, "codex", "main").exited(child, !!this.options.busy?.());
      fail(new Error("Codex app-server exited.")); this.emit("disconnected", "Codex app-server exited."); if (this.child === child) { this.child = undefined; if (initialized) this.ready = undefined; }
    });
    state.stage = "initialize";
    await this.call("initialize", { clientInfo: { name: "litzio", title: "Litzio", version: "0.0.0" }, capabilities: { experimentalApi: true } });
    this.write({ method: "initialized" });
    initialized = true;
  }
  private write(message: Message) { this.child?.stdin.write(JSON.stringify(message) + "\n"); }
  private dispatch(message: Message) {
    if (message.id !== undefined && message.method) {
      if (message.method === "item/tool/call" && this.toolCall) {
        const child = this.child;
        Promise.resolve().then(() => this.toolCall!(message.params)).then(result => {
          if (this.child === child) this.write({ id: message.id, result });
        }, error => {
          if (this.child === child) this.write({ id: message.id, result: { success: false, contentItems: [{ type: "inputText", text: JSON.stringify({ error: error.message }) }] } });
        });
        return;
      }
      if (message.method === "item/tool/requestUserInput" && this.userInput) {
        const child = this.child;
        try {
          this.userInput(message.id, message.params, answers => {
            if (this.child !== child || !child || child.exitCode !== null || child.stdin.destroyed || this.closed) throw new Error("Question expired.");
            this.write({ id: message.id, result: { answers } });
          });
        } catch (error) { this.write({ id: message.id, error: { code: -32602, message: (error as Error).message } }); }
        return;
      }
      if (["item/commandExecution/requestApproval", "item/fileChange/requestApproval", "mcpServer/elicitation/request"].includes(message.method) && this.approval) {
        const child = this.child;
        try { this.approval(message.id, message.method, message.params, result => {
          if (this.child !== child || !child || child.exitCode !== null || child.stdin.destroyed || this.closed) throw new Error("Question expired.");
          this.write({ id: message.id, result });
        }); } catch (error) { this.write({ id: message.id, error: { code: -32602, message: (error as Error).message } }); }
        return;
      }
      // Unknown extensions remain unsupported.
      this.write({ id: message.id, error: { code: -32601, message: "Unsupported client request." } }); return;
    }
    if (message.id !== undefined) {
      const waiter = this.pending.get(Number(message.id)); if (!waiter) return;
      this.pending.delete(Number(message.id)); clearTimeout(waiter.timer);
      // providerCode marks a provider's own error response for the daemon log; the message is unchanged.
      if (message.error) waiter.reject(Object.assign(new Error(message.error.message), { providerCode: message.error.code })); else waiter.resolve(message.result);
    } else if (message.method) this.emit("notification", message.method, message.params ?? {});
  }
  private call<T = any>(method: string, params: unknown): Promise<T> {
    if (!this.child || this.child.exitCode !== null) return Promise.reject(new Error("Codex app-server is not running."));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex request timed out: ${method}`)); }, this.options.timeoutMs ?? 15000);
      this.pending.set(id, { resolve, reject, timer }); this.write({ id, method, params });
    });
  }
  async request<T = any>(method: string, params: unknown = {}): Promise<T> { await this.connect(); return this.call<T>(method, params); }
  /** The next request launches the executable again. Caller must exclude active turns. */
  async restart() {
    if (this.closed) return;
    await this.ready?.catch(() => {});
    await this.stop();
  }
  close() {
    this.closed = true;
    // Retain a rejected shutdown promise so the owning Host observes cleanup failure.
    return this.closing ??= this.stop();
  }
  private async stop() {
    const child = this.child;
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error("Codex app-server is closing.")); } this.pending.clear();
    await stopAgentProcess(child);
  }
}

const hostStopped = new WeakSet<ChildProcessWithoutNullStreams>();
/** Whether the Host asked this process to stop, so its exit is expected. */
export function stoppedByHost(child: ChildProcessWithoutNullStreams) { return hostStopped.has(child); }

/** Close only the exact Host-owned stdio process tree and confirm its exit. */
export async function stopAgentProcess(child?: ChildProcessWithoutNullStreams) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  hostStopped.add(child);
  const exited = new Promise<void>(resolve => child.once("close", () => resolve()));
  // End stdin first, then terminate the exact owned tree if the child does not exit.
  child.stdin.end();
  let killerError: Error | undefined;
  const timer = setTimeout(() => {
    if (!child.pid) return;
    if (process.platform === "win32") {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
      killer.on("error", error => { killerError = error; });
    } else { try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") killerError = error as Error; } }
  }, 1000);
  try { await Promise.race([exited, new Promise<never>((_, reject) => { const timeout = setTimeout(() => reject(killerError ?? new Error("Could not confirm agent termination.")), 6000); void exited.then(() => clearTimeout(timeout)); })]); }
  finally { clearTimeout(timer); }
}
