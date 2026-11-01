import { fork, spawn, type ChildProcess } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { AI_TASK, type AiTaskJob, type AiTaskRequest, type AiTaskRecord, type AiWorkerRequest, type JsonValue, type AiFailure } from "@litzio/plugin-api/ai";
import { brand } from "../../../brand.ts";
import { digest, PluginStore, requestUuid, type Receipt } from "./plugin-store.ts";

type Execution = { child?: ChildProcess; stopped?: "timeout" | "cancelled"; done: Promise<void>; stop(): void };
const temporaryPrefix = `${brand.appName}-ai-task-`;

/** Uses the existing installation/receipt store and its OS ownership lock. */
export class AiTaskRuntime {
  private active = new Map<string, Execution>();
  private closed = false;
  private fault?: Error;
  constructor(private store: PluginStore, private checkPath: (file: string) => void = () => {}) {
    // Only exact, recorded, dead-owner directories in the OS temp root are eligible.
    try {
      for (const receipt of store.aiHistory(true)) if (receipt.status === "uncertain" && receipt.temporary) {
        for (const [kind, file] of Object.entries(receipt.temporary)) {
          this.checkTemporary(file, receipt.job.id, kind);
          rmSync(file, { recursive: true, force: true });
        }
      }
    } catch (error) { this.fault = error instanceof Error ? error : new Error(String(error)); }
  }
  private checkTemporary(file: string, id: string, kind: string) {
    if (!path.isAbsolute(file) || path.dirname(file) !== os.tmpdir() || !path.basename(file).startsWith(`${temporaryPrefix}${id}-`) ||
      !path.basename(file).endsWith(`-${kind}`) || !["snapshot", "control"].includes(kind)) throw new Error("Invalid recorded AI temporary path.");
  }
  current(id: string): AiTaskRecord | null {
    id = requestUuid(id);
    if (this.fault) throw this.fault;
    const receipt = this.store.getAi(id);
    if (!receipt) return null;
    for (const file of receipt.inputs ?? []) this.checkPath(file);
    return { job: receipt.job, status: receipt.status, canCancel: this.active.has(id) };
  }
  async start(request: AiTaskRequest, timeoutMs: number, plugin: string): Promise<AiTaskRecord> {
    if (this.closed) throw new Error("The AI task runtime is closing.");
    if (this.fault) throw this.fault;
    request = structuredClone(request); request.id = requestUuid(request.id);
    const materials = await Promise.all(request.materials.map(async file => {
      this.checkPath(file.path); return { ...file, sha256: digest(await readFile(file.path)) };
    }));
    if (this.closed) throw new Error("The AI task runtime is closing.");
    const fingerprint = digest(JSON.stringify({ request, materials }));
    const job: AiTaskJob = { kind: "ai-task", id: request.id, caller: request.caller, task: request.task, baseline: request.baseline, startedAt: Date.now(), state: "running" };
    const { receipt, fresh } = this.store.admit(job, fingerprint, plugin);
    if (fresh) {
      const base = path.join(os.tmpdir(), `${temporaryPrefix}${job.id}-${randomUUID()}`);
      receipt.temporary = { snapshot: `${base}-snapshot`, control: `${base}-control` }; receipt.inputs = materials.map(file => file.path);
      this.store.update(receipt);
      const execution: Execution = { done: Promise.resolve(), stop: () => {} };
      this.active.set(job.id, execution);
      execution.done = this.execute(receipt, { type: "ai-task", request, materials, temporary: receipt.temporary }, execution, timeoutMs).finally(() => this.active.delete(job.id));
      void execution.done.catch(error => { this.fault = error instanceof Error ? error : new Error(String(error)); });
    }
    return this.current(job.id)!;
  }
  private async execute(receipt: Receipt<AiTaskJob>, work: AiWorkerRequest, execution: Execution, timeoutMs: number) {
    const { job, installation } = receipt;
    let result: JsonValue | undefined, failure: AiFailure = "provider", message = "AI worker failed.", timer: ReturnType<typeof setTimeout> | undefined;
    let providerPid: number | undefined;
    const stopProvider = async () => {
      if (!providerPid) return;
      if (process.platform !== "win32") {
        try { process.kill(-providerPid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
        return;
      }
      try { process.kill(providerPid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return; throw error; }
      await new Promise<void>((resolve, reject) => {
        const killer = spawn("taskkill.exe", ["/PID", String(providerPid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.once("error", reject); killer.once("close", code => code === 0 ? resolve() : reject(new Error("Could not confirm provider process termination.")));
      });
    };
    try {
      if (!installation.tasks?.includes(AI_TASK.service) || !installation.entry) throw new Error("Worker does not support AI tasks.");
      const entry = path.join(installation.directory, installation.entry);
      if (digest(readFileSync(entry)) !== installation.sha256) throw new Error("Installed worker hash mismatch.");
      if (execution.stopped || this.closed) throw new Error("AI task stopped before worker launch.");
      await new Promise<void>((resolve, reject) => {
        let complete = false, workerError: Error | undefined, watchdog: ReturnType<typeof setTimeout> | undefined;
        const child = fork(entry, [], { execPath: process.execPath, execArgv: [], windowsHide: true,
          stdio: ["ignore", "ignore", "ignore", "ipc"], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
        execution.child = child;
        execution.stop = () => {
          if (child.connected) child.send({ type: "cancel" }, () => {});
          // A failed worker must not make cancellation falsely appear complete.
          watchdog ??= setTimeout(() => {
            if (process.platform === "win32" && child.pid) {
              const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
              killer.on("error", error => { workerError = error; });
            } else child.kill("SIGKILL");
          }, 5000);
        };
        timer = setTimeout(() => { execution.stopped = "timeout"; execution.stop(); }, timeoutMs);
        child.on("error", error => { workerError = error; child.kill(); });
        child.on("message", (value: any) => {
          if (value?.type === "provider-process" && Number.isSafeInteger(value.pid) && value.pid > 0) providerPid = value.pid;
          if (value?.type === "complete") { complete = true; result = value.result; }
          if (value?.type === "failure") {
            failure = ["provider", "timeout", "cancelled", "format", "uncertain"].includes(value.failure) ? value.failure : "provider";
            message = typeof value.message === "string" ? value.message : message;
          }
        });
        child.once("close", async code => {
          clearTimeout(watchdog);
          try { await stopProvider(); } catch (error) { failure = "uncertain"; reject(error); return; }
          if (complete && code === 0 && !execution.stopped && result !== undefined) resolve();
          else reject(workerError ?? new Error(message));
        });
        child.send(work, error => { if (error) { workerError = error; child.kill(); } });
        if (execution.stopped || this.closed) execution.stop();
      });
      job.result = result; job.state = "success"; receipt.status = "success";
    } catch (error) {
      const outcome = failure as AiFailure;
      job.state = outcome === "uncertain" ? "error" : execution.stopped === "cancelled" ? "cancelled" : "error";
      receipt.status = outcome === "uncertain" ? "uncertain" : job.state;
      job.failure = outcome === "uncertain" ? "uncertain" : execution.stopped ?? outcome; job.error = error instanceof Error ? error.message : String(error);
      delete job.result;
    } finally {
      clearTimeout(timer);
      try {
        if (receipt.status !== "uncertain") for (const [kind, file] of Object.entries(work.temporary)) { this.checkTemporary(file, job.id, kind); await rm(file, { recursive: true, force: true }); }
      } catch (error) {
        job.state = "error"; receipt.status = "error"; job.failure = "provider"; delete job.result;
        job.error = `AI temporary cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
      }
      job.finishedAt = Date.now(); this.store.update(receipt);
    }
  }
  async cancel(id: string): Promise<AiTaskRecord> {
    id = requestUuid(id);
    const record = this.current(id), execution = this.active.get(id);
    if (!record) throw new Error("AI request is unavailable.");
    if (record.status === "running" && !execution) throw new Error("Only the owning Host can cancel this AI task.");
    if (execution) { execution.stopped = "cancelled"; execution.stop(); await execution.done; }
    return this.current(id)!;
  }
  async close() {
    this.closed = true;
    const active = [...this.active.values()];
    for (const execution of active) { execution.stopped = "cancelled"; execution.stop(); }
    const results = await Promise.allSettled(active.map(execution => execution.done));
    const failed = results.find(result => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    if (this.fault) throw this.fault;
  }
}
