import { publicOperationError } from "./operation-result.ts";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { existsSync, statSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createFileFromPath } from "@litzio/file-commit";
import { JOB_START_FAILURE_MESSAGES, JOB_START_CONTRACT_MESSAGE, JOB_FILE_MAX_BYTES, defaultJobOutput, jobRequestSchema, jobUpdateSchema, type JobStartFailure, type BatchJobResult, type JobInput, type PluginErrorKind, type JobContribution, type JobSnapshot } from "@litzio/plugin-sdk";
import { RootAccess, accessPath, type FileAccess } from "../file-access.ts";
import { createDocumentSourceFile } from "../document-create.ts";
import { createAuthoredDocumentFile } from "../document-authoring.ts";
import { JobHistory, retainJobHistory } from "./job-history.ts";

type Record = { sourceRevision?: string; effects: Map<string, "read" | "write">; uncertainWrite?: boolean; detached?: boolean; staging?: string; observations?: Promise<void>; startedAt: number; finishedAt?: number; snapshot: JobSnapshot; binding: JobContribution; input: JobInput; access: RootAccess; pending: Promise<void>; stopping?: Promise<void> };
class StartRefused extends Error {
  constructor(readonly reason: JobStartFailure) { super(JOB_START_FAILURE_MESSAGES[reason.kind] + (reason.path ? ` ${reason.path}` : "")); }
}
/** Host-owned history; live observations never resume after restart. */
export class PluginJobs {
  private records = new Map<string, Record>();
  private archived = new Map<string, JobSnapshot>();
  private history?: JobHistory;
  private needsPersistence = false;
  constructor(private access: FileAccess, private declaration: (plugin: string, job: string) => JobContribution,
    private invoke: (name: string, input: unknown) => Promise<{ result?: unknown; error?: string; errorKind?: PluginErrorKind }>,
    private effect: (name: string) => "read" | "write", private publishReview?: (plugin: string, root: string, file: string, source: string, data: unknown) => NonNullable<JobSnapshot["result"]>["bundle"],
    private registerGenerated?: (plugin: string, job: string, root: string, source: string, file: string, revision: string, sourceRevision: string, inputs?: NonNullable<JobSnapshot["result"]>["inputs"]) => void,
    historyFile?: string) {
    if (historyFile) {
      this.history = new JobHistory(historyFile);
      for (const job of this.history.load()) {
        if (job.state === "uncertain") Object.assign(job, this.failure({ kind: "unavailable" }, "write"));
        this.archived.set(job.requestId, job);
      }
    }
  }
  private save() {
    const liveRequestIds = new Set([...this.records.values()].filter(record => !record.detached).map(record => record.snapshot.requestId));
    const jobs = retainJobHistory(this.snapshots(), liveRequestIds);
    const retained = new Set(jobs.map(job => job.requestId));
    for (const id of [...this.records.keys(), ...this.archived.keys()]) {
      if (retained.has(id)) continue;
      this.records.delete(id); this.archived.delete(id);
    }
    this.needsPersistence = true;
    this.history?.save(jobs, liveRequestIds);
    this.needsPersistence = false;
  }
  hasActive(plugin: string) {
    return [...this.records.values()].some(record => record.snapshot.plugin === plugin && ["running", "uncertain"].includes(record.snapshot.state));
  }
  private checkResult(job: JobSnapshot) {
    if (job.state !== "completed" || !job.result) throw new Error("Result is not available before completion");
    const file = accessPath(job.result.path, this.access);
    new RootAccess([accessPath(job.root, this.access)]).resolve(file);
    if (!statSync(file).isFile() || createHash("sha256").update(readFileSync(file)).digest("hex") !== job.result.revision) throw new Error("Job result changed; inspect the current file before opening it");
  }
  private async call(record: Record, operation: string) {
    const value = await this.invoke(`${record.snapshot.plugin}.${operation}`, record.input);
    if (value.error) throw Object.assign(new Error(value.error), { kind: value.errorKind });
    return jobUpdateSchema.parse(value.result);
  }
  private cleanup(record: Record) {
    if (record.staging) { rmSync(record.staging, { recursive: true, force: true }); record.staging = undefined; }
  }
  private async update(record: Record, update: ReturnType<typeof jobUpdateSchema.parse>, effect: "read" | "write") {
    const current = record.snapshot;
    if (record.detached || current.result || ["completed", "failed", "stopped"].includes(current.state)) return;
    if (update.state === "completed") {
      if (record.binding.resultKind === "file") {
        if (!record.staging || !update.file || update.file.path !== record.input.resultFile?.path || update.document || update.review) throw new Error("Invalid file result");
        accessPath(record.input.output, this.access, true);
        record.access.resolve(record.input.output, true);
        const revision = await createFileFromPath(record.input.output, update.file.path, JOB_FILE_MAX_BYTES, target => {
          if (record.detached || !record.staging) throw new Error("File result observation lost");
          accessPath(record.input.output, this.access, true);
          record.access.resolve(record.input.output, true);
          accessPath(target, this.access, true);
          record.access.resolve(target, true);
        });
        current.result = { kind: "file", path: record.input.output, revision };
      } else {
        if (update.file) throw new Error("Unexpected file result");
        if (!update.document) throw new Error("Completed job has no document");
        const checkSource = () => {
          if (record.sourceRevision && createHash("sha256").update(readFileSync(accessPath(record.input.file, this.access))).digest("hex") !== record.sourceRevision) throw new Error("Generated source changed during document creation");
        };
        checkSource();
        accessPath(record.input.output, this.access, true);
        const created: { path: string; revision: string; inputs?: Awaited<ReturnType<typeof createAuthoredDocumentFile>>["inputs"] } = "source" in update.document ? createDocumentSourceFile(record.input.output, update.document.source, record.access)
          : await createAuthoredDocumentFile(record.input.output, update.document, record.access, () => {
            if (record.detached) throw new Error("Document result observation lost");
            checkSource();
            accessPath(record.input.output, this.access, true);
          });
        current.result = { path: created.path, revision: created.revision, ...(created.inputs ? { inputs: created.inputs } : {}) };
        if (record.binding.resultKind === "native-document" && record.binding.generatedDocument) this.registerGenerated!(current.plugin, record.binding.id, current.root, record.input.file, created.path, created.revision, record.sourceRevision!, created.inputs);
        // Publication failure must not lose the successful document receipt or recreate it on status.
        record.finishedAt = Date.now();
        const bundle = update.review ? this.publishReview?.(current.plugin, current.root, created.path, record.input.file, update.review) : undefined;
        current.result = { path: created.path, revision: created.revision, ...(created.inputs ? { inputs: created.inputs } : {}), ...(record.binding.resultKind === "native-document" && record.binding.comparison ? { comparison: { root: current.root, document: path.relative(current.root, created.path).split(path.sep).join("/") } } : {}), ...(bundle ? { bundle, review: { plugin: current.plugin, review: update.review!.review, root: current.root, bundleRef: bundle.bundleRef, generation: bundle.generation } } : {}) };
      }
    }
    if (update.state !== "running") this.cleanup(record);
    if (["completed", "failed", "stopped"].includes(update.state)) record.finishedAt = Date.now();
    else if (update.state === "uncertain") record.finishedAt ??= Date.now();
    else record.finishedAt = undefined;
    const failure = update.state === "failed" || update.state === "uncertain";
    Object.assign(current, { state: update.state, phase: failure ? (update.state === "failed" ? "Failed" : "Observation lost") : update.phase, progress: update.progress,
      ...(failure ? this.failure({ kind: update.errorKind }, update.state === "uncertain" && record.uncertainWrite ? "write" : effect) : { errorKind: undefined, error: undefined }) });
  }
  private failure(cause: unknown, effect: "read" | "write") {
    const failure = publicOperationError(cause, effect);
    return { ...failure, error: failure.error + (effect === "write" ? " Query the same requestId; do not resend start." : "") };
  }
  private observe(record: Record, operation: string) {
    // A streamed commit yields; serialize observations so Stop/status cannot publish twice.
    return record.observations = (record.observations ?? Promise.resolve()).catch(() => {}).then(() => this.observeNow(record, operation)).finally(() => this.save());
  }
  private async observeNow(record: Record, operation: string) {
    if (record.detached || ["completed", "failed", "stopped"].includes(record.snapshot.state)) return;
    const effect = record.effects.get(operation)!;
    try {
      const update = await this.call(record, operation);
      if (operation === record.binding.start && update.state !== "running") throw Object.assign(new Error("Invalid start acknowledgement"), { startContract: true });
      await this.update(record, update, effect);
      if (["completed", "failed", "stopped"].includes(record.snapshot.state)) record.uncertainWrite = false;
      else if (effect === "write") record.uncertainWrite = true;
    } catch (cause) {
      this.cleanup(record);
      if (["completed", "failed", "stopped"].includes(record.snapshot.state)) return;
      if (effect === "write") record.uncertainWrite = true;
      const failure = this.failure(cause, record.uncertainWrite ? "write" : effect);
      if (record.detached && failure.errorKind !== "timeout") return;
      if (operation === record.binding.start && (failure.errorKind === "timeout" || (cause as { startContract?: boolean })?.startContract)) failure.error += " " + JOB_START_CONTRACT_MESSAGE;
      Object.assign(record.snapshot, { state: "uncertain", phase: "Observation lost", ...failure,
        ...(operation === record.binding.start ? { startFailure: { kind: "start_failed" } } : {}) });
      record.finishedAt ??= Date.now();
    }
  }
  private async startMany(input: { plugin: string; job: string; root: string; files: string[]; requestIds?: string[] }): Promise<{ files: BatchJobResult[]; receipt: { requestId: string; operation: string; version: number; scope: string; outcome: string } }> {
    if (input.requestIds && (input.requestIds.length !== input.files.length || new Set(input.requestIds).size !== input.requestIds.length)) throw new Error("Expected one unique requestId per file");
    const files = await Promise.all(input.files.map(async (file, index): Promise<BatchJobResult> => {
      const requestId = input.requestIds?.[index] ?? randomUUID();
      try {
        const value = await this.execute({ action: "job-start", plugin: input.plugin, job: input.job, root: input.root, file, requestId });
        return { file, requestId, job: "job" in value ? value.job : undefined };
      } catch (cause) {
        const startFailure: JobStartFailure = cause instanceof StartRefused ? cause.reason : { kind: publicOperationError(cause, "read").errorKind === "unavailable" ? "unavailable" : "other" };
        return { file, requestId, startFailure, ...publicOperationError(cause, "read"), error: JOB_START_FAILURE_MESSAGES[startFailure.kind] };
      }
    }));
    return { files, receipt: { requestId: randomUUID(), operation: "plugins.job-start-many", version: 1, scope: input.root, outcome: files.some(file => file.job?.state === "uncertain") ? "uncertain" : files.some(file => file.error) ? "failure" : "success" } };
  }
  async execute(raw: unknown) {
    const input = jobRequestSchema.parse(raw);
    if (this.needsPersistence) this.save();
    if (input.action === "job-start-many") return this.startMany(input);
    if (input.action === "job-list") return this.list(input.plugin);
    if (input.action === "job-start") {
      if (this.records.has(input.requestId) || this.archived.has(input.requestId)) throw new Error("Duplicate requestId; query status instead");
      const binding = this.declaration(input.plugin, input.job);
      const root = accessPath(input.root, this.access);
      const boundary = new RootAccess([root]);
      const relative = (value: string, create = false) => {
        if (path.isAbsolute(value) || /^[a-z]:|^\\\\/i.test(value)) throw new Error("Expected a Root-relative path");
        return boundary.resolve(path.join(root, value), create);
      };
      const file = accessPath(relative(input.file), this.access);
      if (!statSync(file).isFile() || !binding.accept.includes(path.extname(file).toLowerCase())) throw new StartRefused({ kind: "unsupported_input" });
      const desired = input.output ?? defaultJobOutput(binding, input.file);
      let output = accessPath(relative(desired, true), this.access, true);
      const occupied = (candidate: string) => existsSync(candidate) || this.snapshots().some(job => {
        const output = job.output && path.join(job.root, job.output);
        return output && (process.platform === "win32" ? output.toLowerCase() === candidate.toLowerCase() : output === candidate) && ["running", "uncertain"].includes(job.state);
      });
      // Same -N convention as createImageAsset. No await before records.set: allocation
      // and reservation are atomic within this daemon, including parallel batches.
      for (let sequence = 2; occupied(output); sequence++) {
        if (input.output) throw new StartRefused({ kind: "result_exists", path: desired });
        const extension = path.extname(desired);
        output = accessPath(relative(`${desired.slice(0, -extension.length)}-${sequence}${extension}`, true), this.access, true);
      }
      if (file === output) throw new Error("Output must preserve input");
      if (binding.resultKind === "file" && path.extname(output).toLowerCase() !== binding.resultExtension) throw new Error("Output extension must match resultExtension");
      const record: Record = { effects: new Map([binding.start, binding.status, binding.stop].map(operation => [operation, this.effect(`${input.plugin}.${operation}`)])), startedAt: Date.now(), snapshot: { requestId: input.requestId, plugin: input.plugin, job: input.job, root, file: input.file, elapsedMs: 0, state: "running", phase: "Starting", stopRequested: false }, binding, access: boundary, input: { requestId: input.requestId, root, file, output }, pending: Promise.resolve() };
      if (binding.resultKind === "native-document" && binding.generatedDocument) record.sourceRevision = createHash("sha256").update(readFileSync(file)).digest("hex");
      if (binding.resultKind === "file") {
        record.staging = mkdtempSync(path.join(tmpdir(), "litzio-job-result-"));
        try {
          const staged = path.join(record.staging, "result");
          writeFileSync(staged, "", { flag: "wx", mode: 0o600 });
          record.input.resultFile = { path: staged, maxBytes: JOB_FILE_MAX_BYTES };
        } catch (error) { this.cleanup(record); throw error; }
      }
      record.snapshot.output = path.relative(root, output).split(path.sep).join("/");
      this.records.set(input.requestId, record);
      try { this.save(); }
      catch (error) { this.records.delete(input.requestId); this.cleanup(record); throw error; }
      record.pending = this.observe(record, binding.start);
      await record.pending;
      return this.response(record, input.action);
    }
    const record = this.records.get(input.requestId);
    if (!record) {
      const job = this.archived.get(input.requestId);
      if (!job) throw new Error("Unknown requestId on this Host. Do not automatically restart the job.");
      if (input.action === "job-result") this.checkResult(job);
      return this.responseSnapshot(structuredClone(job), input.action);
    }
    if (input.action === "job-result") this.checkResult(record.snapshot);
    if (input.action === "job-stop") await this.stop(record);
    if (input.action === "job-status" && !record.snapshot.result && !record.detached && ["running", "uncertain"].includes(record.snapshot.state)) {
      await this.observe(record, record.binding.status);
    }
    return this.response(record, input.action);
  }
  private snapshot(record: Record): JobSnapshot {
    return { ...structuredClone(record.snapshot), startedAt: record.startedAt, finishedAt: record.finishedAt, elapsedMs: (record.finishedAt ?? Date.now()) - record.startedAt };
  }
  private snapshots() {
    return [...this.archived.values(), ...[...this.records.values()].map(record => this.snapshot(record))].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  }
  list(plugin?: string) {
    jobRequestSchema.parse({ action: "job-list", ...(plugin ? { plugin } : {}) });
    return { jobs: structuredClone(this.snapshots().filter(job => !plugin || job.plugin === plugin)), ...(this.history?.warning ? { warning: this.history.warning } : {}),
      receipt: { requestId: randomUUID(), operation: "plugins.job-list", version: 1, scope: "host", outcome: "success" } };
  }
  private response(record: Record, action: string) {
    return this.responseSnapshot(this.snapshot(record), action);
  }
  private responseSnapshot(job: JobSnapshot, action: string) {
    return { job, receipt: { requestId: job.requestId, operation: `plugins.${action}`, version: 1, scope: job.root, outcome: job.state === "uncertain" ? "uncertain" : "success" } };
  }
  private stop(record: Record) {
    if (!["running", "uncertain"].includes(record.snapshot.state)) return Promise.resolve();
    record.snapshot.stopRequested = true;
    this.save();
    if (record.detached) return Promise.resolve();
    return record.stopping ??= this.observe(record, record.binding.stop);
  }
  /** Process loss never proves cancellation or permits replay, even after reload. */
  lost(plugin?: string) {
    for (const record of this.records.values()) {
      if (record.detached || (plugin && record.snapshot.plugin !== plugin) || !["running", "uncertain"].includes(record.snapshot.state)) continue;
      record.detached = true;
      this.cleanup(record);
      record.uncertainWrite = true;
      record.finishedAt ??= Date.now();
      Object.assign(record.snapshot, { state: "uncertain", phase: "Observation lost", ...this.failure({ kind: "unavailable" }, "write") });
    }
    this.save();
  }
  async close(plugin?: string) {
    const records = [...this.records.values()].filter(record => !plugin || record.snapshot.plugin === plugin);
    await Promise.all(records.map(record => this.stop(record)));
    await Promise.all(records.map(record => record.pending));
    this.lost(plugin);
  }
}
