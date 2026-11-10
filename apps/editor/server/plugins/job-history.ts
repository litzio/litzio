import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { commitFile, createFile, decodeUtf8 } from "@litzio/file-commit";
import { z } from "zod";
import type { JobSnapshot } from "@litzio/plugin-sdk";

export const JOB_HISTORY_LIMIT = 1000;
export const JOB_HISTORY_WARNING = "Job history was damaged. The original was preserved and an empty history was started.";
/** Only running requests owned by this daemon are exempt. Archived uncertainty
 * counts as ended history; keep the latest endings, including a just-finished
 * request that started long ago. Live ownership is never read from disk. */
export function retainJobHistory<T extends Pick<JobSnapshot, "requestId" | "state" | "startedAt" | "finishedAt" | "elapsedMs">>(jobs: readonly T[], liveRequestIds: ReadonlySet<string> = new Set()): T[] {
  const endedAt = (job: T) => job.finishedAt ?? (job.startedAt ?? 0) + job.elapsedMs;
  const newest = (a: T, b: T) => endedAt(b) - endedAt(a) || b.requestId.localeCompare(a.requestId);
  const running = (job: T) => job.state === "running" && liveRequestIds.has(job.requestId);
  return [...jobs.filter(running), ...jobs.filter(job => !running(job)).sort(newest).slice(0, JOB_HISTORY_LIMIT)].sort(newest);
}
// Explicit allowlist: never serialize plugin phase, errors, input payloads, or
// daemon-lifetime review/comparison references and document contents.
const entrySchema = z.strictObject({
  requestId: z.string().uuid(), plugin: z.string().min(1), job: z.string().min(1),
  root: z.string().min(1), file: z.string().optional(), output: z.string().optional(),
  startedAt: z.number().nonnegative(), finishedAt: z.number().nonnegative().optional(),
  elapsedMs: z.number().nonnegative(), state: z.enum(["running", "completed", "failed", "stopped", "uncertain"]),
  // Ignore supplied effects. They cannot weaken restored uncertainty advice and
  // are omitted by the explicit serialization allowlist below.
  effect: z.enum(["read", "write"]).optional(),
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
  load(): JobSnapshot[] {
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
    const jobs = retainJobHistory(parsed.jobs.map(({ effect: _effect, ...job }) => ({
      ...job, state: job.state === "running" ? "uncertain" as const : job.state,
      finishedAt: job.finishedAt ?? job.startedAt + job.elapsedMs,
      phase: job.state === "running" || job.state === "uncertain" ? "Observation lost" : job.state === "completed" ? "Completed" : job.state === "failed" ? "Failed" : "Stopped",
    })));
    this.save(jobs);
    return jobs;
  }
  save(jobs: JobSnapshot[], liveRequestIds: ReadonlySet<string> = new Set()) {
    const entries = retainJobHistory(jobs, liveRequestIds).reverse().map(job => entrySchema.parse({
      requestId: job.requestId, plugin: job.plugin, job: job.job, root: job.root,
      file: job.file, output: job.output, startedAt: job.startedAt, finishedAt: job.finishedAt,
      elapsedMs: job.elapsedMs, state: job.state, stopRequested: job.stopRequested,
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
