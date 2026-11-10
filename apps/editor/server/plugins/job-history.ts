import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { commitFile, createFile, decodeUtf8 } from "@litzio/file-commit";
import { z } from "zod";
import type { JobSnapshot } from "@litzio/plugin-sdk";

export const JOB_HISTORY_LIMIT = 1000;
export const JOB_HISTORY_WARNING = "Job history was damaged. The original was preserved and an empty history was started.";
/** Internal metadata records the admitted operation effect; never consult a new
 * plugin registration to reconstruct advice for an old request. */
export type JobHistorySnapshot = JobSnapshot & { effect: "read" | "write" };

/** Unfinished requests are never evicted to make room for terminal history.
 * The target cap is soft only when unfinished requests alone exceed it. */
export function retainJobHistory<T extends Pick<JobSnapshot, "requestId" | "state" | "startedAt">>(jobs: readonly T[]): T[] {
  const newest = (a: T, b: T) => (b.startedAt ?? 0) - (a.startedAt ?? 0) || b.requestId.localeCompare(a.requestId);
  const unfinished = jobs.filter(job => job.state === "running" || job.state === "uncertain");
  const terminal = jobs.filter(job => job.state !== "running" && job.state !== "uncertain").sort(newest);
  return [...unfinished, ...terminal.slice(0, Math.max(0, JOB_HISTORY_LIMIT - unfinished.length))].sort(newest);
}
// Explicit allowlist: never serialize plugin phase, errors, input payloads, or
// daemon-lifetime review/comparison references and document contents.
const entrySchema = z.strictObject({
  requestId: z.string().uuid(), plugin: z.string().min(1), job: z.string().min(1),
  root: z.string().min(1), file: z.string().optional(), output: z.string().optional(),
  startedAt: z.number().nonnegative(), finishedAt: z.number().nonnegative().optional(),
  elapsedMs: z.number().nonnegative(), state: z.enum(["running", "completed", "failed", "stopped", "uncertain"]),
  effect: z.enum(["read", "write"]),
  stopRequested: z.boolean(),
  result: z.strictObject({ kind: z.enum(["native-document", "file"]).optional(), path: z.string().min(1), revision: z.string().regex(/^[a-f0-9]{64}$/) }).optional(),
});
const historySchema = z.strictObject({ version: z.literal(1), jobs: z.array(entrySchema) }).superRefine((value, ctx) => {
  if (new Set(value.jobs.map(job => job.requestId)).size !== value.jobs.length) ctx.addIssue({ code: "custom", message: "Duplicate requestId" });
});

/** One Host owns this file. Synchronous publication serializes every snapshot
 * across concurrent job observations, including lost() from process callbacks. */
export class JobHistory {
  warning?: string;
  constructor(private file: string) {}
  load(): JobHistorySnapshot[] {
    if (!existsSync(this.file)) return [];
    const bytes = readFileSync(this.file);
    let parsed: z.infer<typeof historySchema>;
    try { parsed = historySchema.parse(JSON.parse(decodeUtf8(bytes))); }
    catch {
      // If preservation fails, fail startup rather than overwrite the original.
      renameSync(this.file, `${this.file}.corrupt-${randomUUID()}`);
      this.warning = JOB_HISTORY_WARNING;
      console.warn(JOB_HISTORY_WARNING);
      this.save([]);
      return [];
    }
    const jobs = retainJobHistory(parsed.jobs).map(job => ({
      ...job, state: job.state === "running" ? "uncertain" as const : job.state,
      phase: job.state === "running" || job.state === "uncertain" ? "Observation lost" : job.state === "completed" ? "Completed" : job.state === "failed" ? "Failed" : "Stopped",
    }));
    this.save(jobs);
    return jobs;
  }
  save(jobs: JobHistorySnapshot[]) {
    const entries = retainJobHistory(jobs).reverse().map(job => entrySchema.parse({
      requestId: job.requestId, plugin: job.plugin, job: job.job, root: job.root,
      file: job.file, output: job.output, startedAt: job.startedAt, finishedAt: job.finishedAt,
      elapsedMs: job.elapsedMs, state: job.state, effect: job.effect, stopRequested: job.stopRequested,
      result: job.result ? { kind: job.result.kind, path: job.result.path, revision: job.result.revision } : undefined,
    }));
    const text = JSON.stringify({ version: 1, jobs: entries }, null, 2) + "\n";
    mkdirSync(path.dirname(this.file), { recursive: true });
    if (existsSync(this.file)) {
      const revision = createHash("sha256").update(readFileSync(this.file)).digest("hex");
      commitFile(this.file, text, revision);
    } else createFile(this.file, text);
  }
}
