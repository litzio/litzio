import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { StringDecoder } from "node:string_decoder";
import { observeTransmission, type TransmissionObserver, type AssistantTransmission } from "./assistant-transmissions.ts";

class ProviderRejection extends Error {}

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
export function codexPath(): string | null {
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
  transmission?: TransmissionObserver;
  userInput?: (id: string | number, params: any, respond: (answers: unknown) => void) => void;
  toolCall?: (params: any) => unknown;
  private child?: ChildProcessWithoutNullStreams;
  private ready?: Promise<void>;
  private closed = false;
  private closing?: Promise<void>;
  private nextId = 0;
  private pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  constructor(readonly cwd: string, private options: { bin?: string; args?: string[]; timeoutMs?: number; env?: () => NodeJS.ProcessEnv } = {}) { super(); }
  get executable() { return this.options.bin ?? codexPath(); }
  async version(): Promise<string | null> {
    const bin = this.executable; if (!bin) return null;
    const cmd = command(bin);
    return new Promise(resolve => execFile(cmd.bin, ["--version"], { shell: cmd.shell, windowsHide: true, timeout: 5000 }, (error, out) => resolve(error ? null : out.trim())));
  }
  connect(): Promise<void> {
    if (this.closed) return Promise.reject(new Error("Codex app-server is closed."));
    return this.ready ??= this.initialize().catch(async error => { await this.stop(); this.ready = undefined; throw error; });
  }
  private async initialize() {
    const bin = this.executable;
    if (!bin) throw new Error("Codex CLI is unavailable on the Host.");
    const version = await this.version();
    if (!version) throw new Error("Codex CLI could not be executed on the Host.");
    const match = version?.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match || Number(match[1]) === 0 && Number(match[2]) < 141) throw new Error("Codex 0.141.0 or later is required.");
    if (this.closed) throw new Error("Codex app-server is closed.");
    const cmd = command(bin);
    const child = spawn(cmd.bin, this.options.args ?? ["app-server", "-c", "features.default_mode_request_user_input=true"], { cwd: this.cwd, shell: cmd.shell,
      windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"], env: this.options.env?.() });
    this.child = child;
    let initialized = false;
    const fail = (error: Error) => { for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); } this.pending.clear(); };
    const decoder = new LineDecoder(message => this.dispatch(message));
    child.stdout.on("data", (chunk: Buffer) => { try { decoder.push(chunk); } catch { fail(new Error("Invalid Codex app-server response.")); void this.close().catch(() => {}); } });
    child.stderr.on("data", () => {});
    child.stdin.on("error", fail); child.on("error", fail);
    child.once("close", () => { fail(new Error("Codex app-server exited.")); this.emit("disconnected", "Codex app-server exited."); if (this.child === child) { this.child = undefined; if (initialized) this.ready = undefined; } });
    await this.call("initialize", { clientInfo: { name: "litzio", title: "Litzio", version: "0.0.0" }, capabilities: { experimentalApi: true } });
    this.write({ method: "initialized" });
    initialized = true;
  }
  private write(message: Message) { this.child?.stdin.write(JSON.stringify(message) + "\n"); }
  private dispatch(message: Message) {
    if (message.id !== undefined && message.method) {
      if (message.method === "item/tool/call" && this.toolCall) {
        const child = this.child;
        const reply = (result: unknown) => {
          if (this.child !== child) return;
          const serialized = JSON.stringify({ id: message.id, result });
          const report = observeTransmission(this.transmission, { provider: "codex", method: "item/tool/call/result",
            conversationId: message.params?.threadId, turnId: message.params?.turnId, tool: message.params?.tool, requestId: message.id, sources: [{ kind: "tool-result", label: message.params?.tool ?? "tool", bytes: Buffer.byteLength(JSON.stringify(result), "utf8") }] }, serialized);
          if (!child || child.exitCode !== null || child.stdin.destroyed) { report("uncertain"); return; }
          child.stdin.write(serialized + "\n", error => report(error ? "uncertain" : "written"));
        };
        Promise.resolve().then(() => this.toolCall!(message.params)).then(result => {
          reply(result);
        }, error => {
          reply({ success: false, contentItems: [{ type: "inputText", text: JSON.stringify({ error: error.message }) }] });
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
      // All other server requests (including approvals) remain unsupported.
      this.write({ id: message.id, error: { code: -32601, message: "Unsupported client request." } }); return;
    }
    if (message.id !== undefined) {
      const waiter = this.pending.get(Number(message.id)); if (!waiter) return;
      this.pending.delete(Number(message.id)); clearTimeout(waiter.timer);
      if (message.error) waiter.reject(new ProviderRejection(message.error.message)); else waiter.resolve(message.result);
    } else if (message.method) this.emit("notification", message.method, message.params ?? {});
  }
  private call<T = any>(method: string, params: unknown, sources?: AssistantTransmission["sources"]): Promise<T> {
    if (!this.child || this.child.exitCode !== null) return Promise.reject(new Error("Codex app-server is not running."));
    const id = ++this.nextId;
    const serialized = JSON.stringify({ id, method, params });
    const scope = params as any;
    const report = ["thread/start", "turn/start", "turn/steer"].includes(method)
      ? observeTransmission(this.transmission, { provider: "codex", method, requestId: id,
        sources: sources ?? [{ kind: "automatic", label: method, bytes: Buffer.byteLength(serialized, "utf8") }], conversationId: scope?.threadId, turnId: scope?.expectedTurnId }, serialized) : undefined;
    return new Promise((resolve, reject) => {
      const failed = (error: Error) => { report?.(error instanceof ProviderRejection ? "rejected" : "uncertain"); reject(error); };
      const timer = setTimeout(() => { this.pending.delete(id); failed(new Error(`Codex request timed out: ${method}`)); }, this.options.timeoutMs ?? 15000);
      this.pending.set(id, { resolve: result => { report?.("acknowledged", result?.turn?.id ?? result?.turnId, result?.thread?.id ?? scope?.threadId); resolve(result); }, reject: failed, timer });
      this.child!.stdin.write(serialized + "\n");
    });
  }
  async request<T = any>(method: string, params: unknown = {}, sources?: AssistantTransmission["sources"]): Promise<T> { await this.connect(); return this.call<T>(method, params, sources); }
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

/** Close only the exact Host-owned stdio process tree and confirm its exit. */
export async function stopAgentProcess(child?: ChildProcessWithoutNullStreams) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
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
