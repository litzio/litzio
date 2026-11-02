import { Ajv } from "ajv";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AiFailure, AiTaskRecord, AiTaskService, JsonValue } from "@litzio/plugin-api/ai";
import type { PluginHostContext } from "@litzio/plugin-api/host";
import { checkDoclingCorrection, type DoclingCorrection, type DoclingCorrections } from "./conversion/corrections.ts";
import { addDoclingCorrection, PublishedCorrectionCleanupError, readFolderCorrections, removeDoclingCorrection, updateConversionFolder } from "./conversion/correction-files.ts";
import { loadDoclingImages } from "./conversion/files.ts";
import { sha256 } from "./shared/map.ts";

export const REVIEW_FILE = "structure-review.json";
const TASK = "docling-structure-review";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const now = () => new Date().toISOString();
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const read = (file: string) => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(file));
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

type Change = DoclingCorrection extends infer C ? C extends DoclingCorrection ? Pick<C, "self_ref" | "operation" | "value" | "reason"> : never : never;
export type ReviewSuggestion = Change & { evidence: { page: number; text: string }[] };
type Baseline = { sourceSha256: string; correctionsSha256: string };
type ProposalState = "pending" | "approved" | "rejected" | "inapplicable";
export type ReviewProposal = {
  id: string; taskId: string; baseline: Baseline; createdAt: string; suggestion: ReviewSuggestion;
  state: ProposalState; validationError?: string; history: { state: "approved" | "rejected" | "pending"; at: string }[];
};
type ReviewTask = {
  id: string; owner: string; baseline: Baseline; startedAt: string; finishedAt?: string;
  status: "running" | "success" | "error" | "cancelled" | "uncertain"; failure?: AiFailure; error?: string;
};
export type StructureReview = {
  format: "litzio-docling-structure-review"; version: 1; updatedAt: string;
  task: ReviewTask | null; proposals: ReviewProposal[];
};

const objectSchema = (properties: Record<string, JsonValue>): Record<string, JsonValue> => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});
const suggestionSchema = {
  anyOf: [
    ["heading", { level: { type: ["integer", "null"], minimum: 1, maximum: 6 } }],
    ["merge-paragraphs", { next: { type: "string" } }],
    ["furniture", { label: { type: "string", enum: ["text", "page_header", "page_footer"] } }],
  ].map(([operation, value]) => objectSchema({
    self_ref: { type: "string" }, operation: { type: "string", const: operation as string },
    value: objectSchema(value as Record<string, JsonValue>), reason: { type: "string", minLength: 1 },
    evidence: { type: "array", minItems: 1, items: objectSchema({ page: { type: "integer", minimum: 1 }, text: { type: "string", minLength: 1 } }) },
  })),
};
export const structureReviewSchema = objectSchema({ proposals: { type: "array", items: suggestionSchema } });
const validateResult = new Ajv({ strict: true }).compile<{ proposals: ReviewSuggestion[] }>(structureReviewSchema);
const validateSuggestion = new Ajv({ strict: true }).compile<ReviewSuggestion>(suggestionSchema);
export const structureReviewInstruction = `Review the WHOLE original DoclingDocument using the current approved corrections and rejected proposals.
Read only the needed parts of document.json, corrections.json and rejected-proposals.json; use search or jq rather than dumping the whole document.
Find ONLY: (1) heading depth and heading versus body text, (2) body paragraphs split across consecutive pages, (3) body versus page header/footer classification.
Use original self_ref values. Account for the ordered current corrections and do not repeat rejected proposals. Do not inspect images, evaluate equations, rewrite text, or propose other changes.
Return proposals with self_ref, operation/value matching the corrections format, a reason, and evidence containing page numbers and literal original text fragments.
heading {level:1..6} sets a heading; {level:null} makes body text. merge-paragraphs {next:"#/texts/N"} merges consecutive body leaves across consecutive pages. furniture {label:"text"|"page_header"|"page_footer"} changes label/layer.
Targets must be nonempty unassociated text leaves. A classification conflicts with an earlier classification of that ref. Consumed merge continuations cannot be targeted. Do not assume that label, content_layer and reading-tree placement are the same fact.
These are suggestions for human approval, never approved corrections. Return an empty proposals array if no supported change is justified.`;

function baseline(ledger: DoclingCorrections): Baseline {
  return { sourceSha256: ledger.source.sha256, correctionsSha256: sha256(JSON.stringify(ledger)) };
}
function validBaseline(value: Baseline) {
  return value && [value.sourceSha256, value.correctionsSha256].every(x => typeof x === "string" && /^[a-f0-9]{64}$/u.test(x));
}
function readReview(folder: string): StructureReview {
  const file = path.join(folder, REVIEW_FILE);
  if (!existsSync(file)) return { format: "litzio-docling-structure-review", version: 1, updatedAt: now(), task: null, proposals: [] };
  const data = JSON.parse(read(file)) as StructureReview;
  const date = (x: string) => typeof x === "string" && Number.isFinite(Date.parse(x));
  const fail = () => { throw new Error("Invalid Docling structure review file/version"); };
  if (!data || data.format !== "litzio-docling-structure-review" || data.version !== 1 || !date(data.updatedAt) || !Array.isArray(data.proposals)) fail();
  if (data.task !== null && (!data.task || !uuid.test(data.task.id) || !uuid.test(data.task.owner) || !validBaseline(data.task.baseline) || !date(data.task.startedAt) ||
    !["running", "success", "error", "cancelled", "uncertain"].includes(data.task.status))) fail();
  const ids = new Set<string>();
  for (const p of data.proposals) {
    if (!p || !uuid.test(p.id) || ids.has(p.id) || !uuid.test(p.taskId) || !validBaseline(p.baseline) || !date(p.createdAt) ||
      !["pending", "approved", "rejected", "inapplicable"].includes(p.state) || !validateSuggestion(p.suggestion) ||
      (p.state === "inapplicable" && typeof p.validationError !== "string") || !Array.isArray(p.history) ||
      p.history.some(h => !h || !["approved", "rejected", "pending"].includes(h.state) || !date(h.at))) fail();
    ids.add(p.id);
  }
  return data;
}
function writeReview(staging: string, review: StructureReview) {
  review.updatedAt = now(); writeFileSync(path.join(staging, REVIEW_FILE), json(review), "utf8");
}
function correction(proposal: ReviewProposal, at = now()): DoclingCorrection {
  const { evidence, ...change } = proposal.suggestion;
  return { ...change, id: `review-${proposal.id}`, aiEvidence: json(evidence).trim(), approvedAt: at };
}
const materialNames = ["document.json", "corrections.json", "rejected-proposals.json"];
const materialFile = (id: string, name: string) => `.structure-review-${id}-${name}`;
function removeMaterials(staging: string, id: string) {
  for (const name of materialNames) rmSync(path.join(staging, materialFile(id, name)), { force: true });
}

/** Docling owns domain validation/state; all provider execution stays in the injected service. */
export class StructureReviewer {
  private services: Map<string, AiTaskService>;
  constructor(private host: PluginHostContext, private requireConversion: () => void) {
    this.services = (host.session.get("review-services") ?? new Map()) as Map<string, AiTaskService>;
    host.session.set("review-services", this.services);
  }
  private folder(value: string) {
    if (typeof value !== "string" || !value.trim()) throw new Error("Choose a Docling conversion folder.");
    return realpathSync.native(this.host.resolvePath(path.resolve(value)));
  }
  private beforePublish(folder: string) { this.host.resolvePath(folder); this.host.resolvePath(path.dirname(folder)); }
  private source(folder: string, ledger = readFolderCorrections(folder)) {
    const input = realpathSync.native(this.host.resolvePath(path.resolve(folder, ledger.source.file)));
    return { input, text: read(input), ledger };
  }
  private sourceHash(folder: string, ledger = readFolderCorrections(folder)): string | null {
    const input = this.host.resolvePath(path.resolve(folder, ledger.source.file), true);
    try { return sha256(readFileSync(input)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  private check(folder: string, p: ReviewProposal) {
    if (this.sourceHash(folder) !== p.baseline.sourceSha256) throw new Error("The original DoclingDocument changed; this proposal is stale.");
    const { input, text, ledger } = this.source(folder);
    if (sha256(text) !== p.baseline.sourceSha256) throw new Error("The original DoclingDocument changed; this proposal is stale.");
    const { images } = loadDoclingImages(input, text, path.dirname(input) === folder);
    checkDoclingCorrection(text, ledger, correction(p), { images });
  }
  private service(taskId?: string) { return this.host.aiTasks() ?? (taskId ? this.services.get(taskId) : undefined); }
  private receipt(service: AiTaskService, task: ReviewTask): AiTaskRecord | null {
    const value = service.current(task.id);
    if (value && (value.job.id !== task.id || value.job.kind !== "ai-task" || value.job.caller !== "docling" || value.job.task !== TASK || value.job.baseline !== JSON.stringify(task.baseline))) throw new Error("AI review receipt does not match its id/caller/task/baseline.");
    return value;
  }
  private refresh(folder: string): StructureReview {
    const review = readReview(folder), task = review.task;
    if (!task || task.status !== "running") return review;
    const service = this.service(task.id);
    if (!service) return review;
    const receipt = this.receipt(service, task);
    if (!receipt) {
      // B reads materials before recording a receipt. Use the shared runtime OS
      // lock, not the observing Host's memory/PID, to establish owner loss.
      try { if (this.host.isRequestOwnerAlive(task.owner)) return review; }
      catch { return review; } // Unknown liveness: retain inputs for a later observation.
    }
    if (receipt?.status === "running") return review;
    try { updateConversionFolder(folder, () => {
      const current = readReview(folder);
      if (current.task?.id !== task.id || current.task.status !== "running") return () => {};
      const active = current.task;
      active.status = receipt?.status ?? "uncertain"; active.finishedAt = now();
      if (receipt?.job.failure) active.failure = receipt.job.failure;
      if (receipt?.job.error) active.error = receipt.job.error;
      if (!receipt) { active.failure = "uncertain"; active.error = "AI review admission/outcome is uncertain; it will not be replayed automatically."; }
      if (receipt?.status === "success") {
        if (!validateResult(receipt.job.result)) { active.status = "error"; active.failure = "format"; active.error = "AI structure review result violates its JSON Schema."; }
        else {
          const ledger = readFolderCorrections(folder), snapshot = read(path.join(folder, materialFile(task.id, "document.json")));
          if (sha256(snapshot) !== task.baseline.sourceSha256) throw new Error("Structure review material SHA-256 mismatch.");
          const input = this.host.resolvePath(path.resolve(folder, ledger.source.file), true);
          const { images } = loadDoclingImages(input, snapshot, path.dirname(input) === folder);
          const proposals = receipt.job.result.proposals.map(suggestion => {
            const p: ReviewProposal = { id: randomUUID(), taskId: task.id, baseline: task.baseline, createdAt: now(), suggestion, state: "pending", history: [] };
            try { checkDoclingCorrection(snapshot, ledger, correction(p), { images }); }
            catch (error) { p.state = "inapplicable"; p.validationError = message(error); }
            return p;
          });
          current.proposals = current.proposals.filter(p => p.state !== "pending" || p.history.length > 0).concat(proposals);
        }
      }
      return staging => { writeReview(staging, current); removeMaterials(staging, task.id); };
    }, () => this.beforePublish(folder)); }
    catch (error) {
      if (error instanceof PublishedCorrectionCleanupError) this.services.delete(task.id);
      throw error;
    }
    this.services.delete(task.id);
    return readReview(folder);
  }
  list(value: string) {
    const folder = this.folder(value), review = this.refresh(folder);
    const sourceSha256 = this.sourceHash(folder);
    const service = this.service(review.task?.id);
    const receipt = review.task?.status === "running" && service ? this.receipt(service, review.task) : null;
    const ledger = readFolderCorrections(folder);
    const original = sourceSha256 === ledger.source.sha256 ? JSON.parse(this.source(folder, ledger).text) : {};
    return { available: !!this.host.aiTasks(), task: review.task, canCancel: receipt?.canCancel ?? false,
      proposals: review.proposals.map(p => {
        const originalItem = original.texts?.find((item: { self_ref: string }) => item.self_ref === p.suggestion.self_ref);
        const nextRef = p.suggestion.operation === "merge-paragraphs" ? p.suggestion.value.next : undefined;
        return { ...p, stale: sourceSha256 !== p.baseline.sourceSha256,
          before: { text: originalItem?.text as string | undefined,
            nextText: original.texts?.find((item: { self_ref: string }) => item.self_ref === nextRef)?.text as string | undefined,
            label: originalItem?.label as string | undefined, level: originalItem?.level as number | undefined,
            corrections: ledger.entries.filter(entry => entry.self_ref === p.suggestion.self_ref).map(({ operation, value }) => ({ operation, value })) } };
      }) };
  }
  async start(value: string, requestId: string) {
    this.requireConversion();
    const folder = this.folder(value), id = typeof requestId === "string" ? requestId.toLowerCase() : "";
    if (!uuid.test(id)) throw new Error("A review request UUID is required.");
    const service = this.host.aiTasks();
    if (!service) return { ...this.list(folder), available: false, error: "AI agent is disabled; the AI task service is unavailable." };
    const previous = this.refresh(folder);
    if (previous.task?.id === id) return this.list(folder); // Observation never re-executes an admitted or uncertain request.
    if (previous.task?.status === "running") throw new Error("A structure review is already running for this conversion.");
    let task: ReviewTask, cleanupError: PublishedCorrectionCleanupError | undefined;
    try { updateConversionFolder(folder, () => {
      const current = readReview(folder);
      if (current.task?.status === "running") throw new Error("A structure review is already running for this conversion.");
      const { text, ledger } = this.source(folder);
      if (sha256(text) !== ledger.source.sha256) throw new Error("Docling correction source SHA-256 mismatch; reconvert the changed original before review.");
      task = { id, owner: this.host.requestOwner(), baseline: baseline(ledger), startedAt: now(), status: "running" }; current.task = task;
      return staging => {
        writeFileSync(path.join(staging, materialFile(id, "document.json")), text, "utf8");
        writeFileSync(path.join(staging, materialFile(id, "corrections.json")), json(ledger), "utf8");
        writeFileSync(path.join(staging, materialFile(id, "rejected-proposals.json")), json(current.proposals.filter(p => p.state === "rejected").map(p => p.suggestion)), "utf8");
        writeReview(staging, current);
      };
    }, () => this.beforePublish(folder)); }
    catch (error) {
      if (!(error instanceof PublishedCorrectionCleanupError)) throw error;
      cleanupError = error; // Inputs are public: finish admission before reporting cleanup.
    }
    this.services.set(id, service);
    try {
      await service.start({ id, caller: "docling", task: TASK, instruction: structureReviewInstruction,
        materials: materialNames.map(name => ({ path: path.join(folder, materialFile(id, name)), name })),
        input: {}, schema: structureReviewSchema, baseline: JSON.stringify(task!.baseline) });
    } catch (error) {
      const errors: unknown[] = cleanupError ? [cleanupError, error] : [error];
      try { updateConversionFolder(folder, () => {
        const current = readReview(folder);
        if (current.task?.id !== id) throw new Error("Structure review changed during AI admission.");
        current.task.status = "uncertain"; current.task.failure = "uncertain"; current.task.error = message(error); current.task.finishedAt = now();
        return staging => { writeReview(staging, current); removeMaterials(staging, id); };
      }, () => this.beforePublish(folder)); }
      catch (recordingError) { errors.push(recordingError); }
      this.services.delete(id);
      if (errors.length === 1) throw error;
      throw new AggregateError(errors, errors.map(message).join("; "), { cause: error });
    }
    if (cleanupError) throw cleanupError;
    return this.list(folder);
  }
  async cancel(value: string) {
    const folder = this.folder(value), review = readReview(folder);
    if (!review.task) throw new Error("No structure review task exists.");
    if (review.task.status !== "running") return this.list(folder);
    const service = this.service(review.task.id);
    if (!service) return { ...this.list(folder), error: "AI agent is disabled; the AI task service is unavailable." };
    this.receipt(service, review.task); await service.cancel(review.task.id);
    return this.list(folder);
  }
  decide(value: string, id: string, action: "approve" | "reject" | "undo") {
    this.requireConversion();
    const folder = this.folder(value);
    this.refresh(folder);
    const review = readReview(folder), p = review.proposals.find(p => p.id === id);
    if (!p) throw new Error("Structure review proposal does not exist.");
    const expected = json(review);
    const beforePublish = () => {
      this.beforePublish(folder);
      if (json(readReview(folder)) !== expected) throw new Error("Structure review changed after it was read; nothing was written.");
    };
    if (action === "reject") {
      if (!["pending", "inapplicable"].includes(p.state)) throw new Error("Only an unapproved proposal can be rejected.");
      p.state = "rejected"; p.history.push({ state: "rejected", at: now() });
      updateConversionFolder(folder, () => { beforePublish(); return staging => writeReview(staging, review); }, beforePublish);
    } else {
      if (p.state !== (action === "undo" ? "approved" : "pending")) throw new Error("Proposal is not in the required approval state.");
      if (action === "approve") this.check(folder, p);
      const at = now(); p.state = action === "approve" ? "approved" : "pending"; p.history.push({ state: p.state, at });
      const options = { resolveSource: (file: string) => this.host.resolvePath(file), beforePublish, updateFiles: (staging: string) => writeReview(staging, review) };
      if (action === "approve") addDoclingCorrection(folder, correction(p, at), options);
      else removeDoclingCorrection(folder, `review-${p.id}`, options);
    }
    return this.list(folder);
  }
}
