import { publicOperationError } from "./operation-result.ts";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { statSync } from "node:fs";
import { JOB_START_CONTRACT_MESSAGE, jobRequestSchema, jobUpdateSchema, type PluginErrorKind, type JobContribution, type JobSnapshot } from "@litzio/plugin-sdk";
import { RootAccess, accessPath, type FileAccess } from "../file-access.ts";
import { createDocumentSourceFile } from "../document-create.ts";

type Record = { effects: Map<string, "read" | "write">; uncertainWrite?: boolean; detached?: boolean; startedAt: number; finishedAt?: number; snapshot: JobSnapshot; binding: JobContribution; input: { requestId: string; root: string; file: string; output: string }; access: RootAccess; pending: Promise<void>; stopping?: Promise<void> };
/** Daemon-lifetime observations only; no queue, scheduler or replay ledger. */
export class PluginJobs {
  private records = new Map<string, Record>();
  constructor(private access: FileAccess, private declaration: (plugin: string, job: string) => JobContribution,
    private invoke: (name: string, input: unknown) => Promise<{ result?: unknown; error?: string; errorKind?: PluginErrorKind }>,
    private effect: (name: string) => "read" | "write") {}
  private async call(record: Record, operation: string) {
    const value = await this.invoke(`${record.snapshot.plugin}.${operation}`, record.input);
    if (value.error) throw Object.assign(new Error(value.error), { kind: value.errorKind });
    return jobUpdateSchema.parse(value.result);
  }
  private update(record: Record, update: ReturnType<typeof jobUpdateSchema.parse>, effect: "read" | "write") {
    const current = record.snapshot;
    if (record.detached || ["completed", "failed", "stopped"].includes(current.state)) return;
    if (update.state === "completed") {
      if (!update.document) throw new Error("Completed job has no document");
      accessPath(record.input.output, this.access, true);
      const created = createDocumentSourceFile(record.input.output, update.document.source, record.access);
      current.result = { path: created.path, revision: created.revision };
    }
    if (["completed", "failed", "stopped"].includes(update.state)) record.finishedAt = Date.now();
    const failure = update.state === "failed" || update.state === "uncertain";
    Object.assign(current, { state: update.state, phase: failure ? (update.state === "failed" ? "Failed" : "Observation lost") : update.phase, progress: update.progress,
      ...(failure ? this.failure({ kind: update.errorKind }, update.state === "uncertain" && record.uncertainWrite ? "write" : effect) : { errorKind: undefined, error: undefined }) });
  }
  private failure(cause: unknown, effect: "read" | "write") {
    const failure = publicOperationError(cause, effect);
    return { ...failure, error: failure.error + (effect === "write" ? " Query the same requestId; do not resend start." : "") };
  }
  private async observe(record: Record, operation: string) {
    const effect = record.effects.get(operation)!;
    try {
      const update = await this.call(record, operation);
      if (operation === record.binding.start && update.state !== "running") throw Object.assign(new Error("Invalid start acknowledgement"), { startContract: true });
      this.update(record, update, effect);
      if (["completed", "failed", "stopped"].includes(record.snapshot.state)) record.uncertainWrite = false;
      else if (effect === "write") record.uncertainWrite = true;
    } catch (cause) {
      if (["completed", "failed", "stopped"].includes(record.snapshot.state)) return;
      if (effect === "write") record.uncertainWrite = true;
      const failure = this.failure(cause, record.uncertainWrite ? "write" : effect);
      if (record.detached && failure.errorKind !== "timeout") return;
      if (operation === record.binding.start && (failure.errorKind === "timeout" || (cause as { startContract?: boolean })?.startContract)) failure.error += " " + JOB_START_CONTRACT_MESSAGE;
      Object.assign(record.snapshot, { state: "uncertain", phase: "Observation lost", ...failure });
    }
  }
  async execute(raw: unknown) {
    const input = jobRequestSchema.parse(raw);
    if (input.action === "job-list") return this.list(input.plugin);
    if (input.action === "job-start") {
      if (this.records.has(input.requestId)) throw new Error("Duplicate requestId; query status instead");
      const binding = this.declaration(input.plugin, input.job);
      const root = accessPath(input.root, this.access);
      const boundary = new RootAccess([root]);
      const relative = (value: string, create = false) => {
        if (path.isAbsolute(value) || /^[a-z]:|^\\\\/i.test(value)) throw new Error("Expected a Root-relative path");
        return boundary.resolve(path.join(root, value), create);
      };
      const file = accessPath(relative(input.file), this.access), output = accessPath(relative(input.output, true), this.access, true);
      if (!statSync(file).isFile() || !binding.accept.includes(path.extname(file).toLowerCase())) throw new Error("Unsupported input file");
      if (file === output) throw new Error("Output must preserve input");
      const record: Record = { effects: new Map([binding.start, binding.status, binding.stop].map(operation => [operation, this.effect(`${input.plugin}.${operation}`)])), startedAt: Date.now(), snapshot: { requestId: input.requestId, plugin: input.plugin, job: input.job, root, elapsedMs: 0, state: "running", phase: "Starting", stopRequested: false }, binding, access: boundary, input: { requestId: input.requestId, root, file, output }, pending: Promise.resolve() };
      this.records.set(input.requestId, record);
      record.pending = this.observe(record, binding.start);
      await record.pending;
      return this.response(record, input.action);
    }
    const record = this.records.get(input.requestId);
    if (!record) throw new Error("Unknown requestId on this daemon. Do not automatically restart the job.");
    if (input.action === "job-result" && record.snapshot.state !== "completed") throw new Error("Result is not available before completion");
    if (input.action === "job-stop") await this.stop(record);
    if (input.action === "job-status" && !record.detached && ["running", "uncertain"].includes(record.snapshot.state)) {
      await this.observe(record, record.binding.status);
    }
    return this.response(record, input.action);
  }
  private snapshot(record: Record) {
    return { ...structuredClone(record.snapshot), elapsedMs: (record.finishedAt ?? Date.now()) - record.startedAt };
  }
  list(plugin?: string) {
    jobRequestSchema.parse({ action: "job-list", ...(plugin ? { plugin } : {}) });
    return { jobs: [...this.records.values()].filter(record => !plugin || record.snapshot.plugin === plugin).reverse().map(record => this.snapshot(record)),
      receipt: { requestId: randomUUID(), operation: "plugins.job-list", version: 1, scope: "host", outcome: "success" } };
  }
  private response(record: Record, action: string) {
    return { job: this.snapshot(record), receipt: { requestId: record.snapshot.requestId, operation: `plugins.${action}`, version: 1, scope: record.snapshot.root, outcome: record.snapshot.state === "uncertain" ? "uncertain" : "success" } };
  }
  private stop(record: Record) {
    if (!["running", "uncertain"].includes(record.snapshot.state)) return Promise.resolve();
    record.snapshot.stopRequested = true;
    if (record.detached) return Promise.resolve();
    return record.stopping ??= this.observe(record, record.binding.stop);
  }
  /** Process loss never proves cancellation or permits replay, even after reload. */
  lost(plugin?: string) {
    for (const record of this.records.values()) {
      if (record.detached || (plugin && record.snapshot.plugin !== plugin) || !["running", "uncertain"].includes(record.snapshot.state)) continue;
      record.detached = true;
      record.uncertainWrite = true;
      Object.assign(record.snapshot, { state: "uncertain", phase: "Observation lost", ...this.failure({ kind: "unavailable" }, "write") });
    }
  }
  async close(plugin?: string) {
    const records = [...this.records.values()].filter(record => !plugin || record.snapshot.plugin === plugin);
    await Promise.all(records.map(record => this.stop(record)));
    await Promise.all(records.map(record => record.pending));
    this.lost(plugin);
  }
}
