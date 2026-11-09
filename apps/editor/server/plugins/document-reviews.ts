import { createHash, randomUUID } from "node:crypto";
import { readFileSync, existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { parse, serialize, hasNativeMarker } from "@litzio/core";
import { commitFile, createFile, decodeUtf8, textRevision } from "@litzio/file-commit";
import { documentReviewRecordSchema, documentReviewRequestSchema, documentReviewBuildSchema, documentReviewValidationSchema,
  type DocumentReviewRecord, type DocumentReviewBaseline, type JobContribution, type OperationReceipt } from "@litzio/plugin-sdk";
import { RootAccess, accessPath, type FileAccess } from "../file-access.ts";

const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const revision = (file: string) => existsSync(file) ? hash(file) : null;
const json = (record: DocumentReviewRecord) => JSON.stringify(record, null, 2) + "\n";
/** File contents own durable state. Only admission locks and request receipts live in the daemon. */
export class DocumentReviews {
  private busy = new Set<string>();
  private requests = new Map<string, unknown>();
  constructor(private access: FileAccess, private declaration: (plugin: string, job: string) => { operation: string; version: number },
    private invoke: (operation: string, input: unknown, version: number) => Promise<{ result?: unknown; error?: string }>) {}
  private paths(root: string, document: string) {
    root = accessPath(root, this.access);
    const boundary = new RootAccess([root]);
    const resolve = (file: string, create = false) => accessPath(boundary.resolve(file, create), this.access, create);
    const relative = (file: string, create = false) => {
      if (path.isAbsolute(file) || /^[a-z]:|^\\\\/i.test(file)) throw new Error("Expected a Root-relative path");
      return resolve(path.join(root, file), create);
    };
    const file = relative(document, true);
    if (path.extname(file).toLowerCase() !== ".md") throw new Error("Expected a Markdown document");
    const recordFile = resolve(file + ".review.json", true);
    const key = path.join(realpathSync(path.dirname(file)), path.basename(file));
    return { file, recordFile, key: process.platform === "win32" ? key.toLowerCase() : key, resolve, relative };
  }
  private readRecord(file: string) {
    if (statSync(file).size > 1024 ** 2) throw new Error("Review record exceeds 1 MiB");
    return documentReviewRecordSchema.parse(JSON.parse(decodeUtf8(readFileSync(file))));
  }
  private async call(record: DocumentReviewRecord, source: string, mode: "validate" | "build") {
    const binding = this.declaration(record.plugin, record.job);
    const result = await this.invoke(binding.operation, { file: source, patches: record.patches, mode }, binding.version);
    if (result.error) throw new Error("Review plugin unavailable or rejected the input");
    this.declaration(record.plugin, record.job);
    return mode === "validate" ? documentReviewValidationSchema.parse(result.result) : documentReviewBuildSchema.parse(result.result);
  }
  private canonical(source: string) {
    if (Buffer.byteLength(source) > 262144 || !hasNativeMarker(source)) throw new Error("Invalid generated document");
    const canonical = serialize(parse(source));
    if (canonical !== source || serialize(parse(canonical)) !== canonical) throw new Error("Generated source must be stable canonical Markdown");
    return source;
  }
  async execute(raw: unknown): Promise<any> {
    const input = documentReviewRequestSchema.parse(raw);
    if (input.action === "generated-status") return structuredClone(this.requests.get(input.requestId) ?? { state: "unknown", guidance: "No receipt on this daemon. Read the files; never automatically replay a patch." });
    const p = this.paths(input.root, input.document);
    if (input.action !== "generated-read" && this.requests.has(input.requestId)) throw new Error("Duplicate requestId; query review status");
    if (this.busy.has(p.key)) throw new Error("Review operation in progress; read again after it finishes");
    this.busy.add(p.key);
    let reviewSaved = false, documentRegenerated = false;
    const requestId = input.action === "generated-read" ? randomUUID() : input.requestId;
    const receipt = (outcome: OperationReceipt["outcome"]): OperationReceipt => ({ requestId, operation: `review.${input.action.slice(10)}`, version: 1, scope: input.root, outcome });
    if (input.action !== "generated-read") this.requests.set(requestId, { state: "pending", receipt: receipt("uncertain") });
    try {
      const opening = input.action === "generated-open";
      const record: DocumentReviewRecord = opening ? {
        plugin: input.plugin, job: input.job, source: { path: "", hash: input.baseline.sourceHash }, patches: [], checkedPages: [], lastPage: null, approval: null,
      } : this.readRecord(p.recordFile);
      const source = opening ? p.relative(input.source) : p.resolve(path.resolve(path.dirname(p.recordFile), record.source.path));
      if (source === p.file || source === p.recordFile) throw new Error("Review source must be separate from its results");
      if (opening) record.source.path = path.relative(path.dirname(p.recordFile), source).split(path.sep).join("/");
      const baseline = (): DocumentReviewBaseline => ({ sourceHash: hash(p.resolve(source)), reviewRevision: revision(p.resolve(p.recordFile, true)), documentRevision: revision(p.resolve(p.file, true)) });
      const before = baseline();
      const check = (expected: DocumentReviewBaseline) => {
        if (JSON.stringify(baseline()) !== JSON.stringify(expected) || expected.sourceHash !== record.source.hash) throw new Error("Review baseline conflict; read again before writing");
      };
      check(before);
      if (input.action !== "generated-read") {
        if (JSON.stringify(before) !== JSON.stringify(input.baseline)) throw new Error("Review baseline conflict; read again before writing");
        if (opening && before.reviewRevision !== null) throw new Error("Review already exists; read it instead");
        if (input.action === "generated-patch") record.patches.push(...input.patches);
        const text = json(documentReviewRecordSchema.parse(record));
        if (Buffer.byteLength(text) > 1024 ** 2) throw new Error("Review record exceeds 1 MiB");
        await this.call(record, source, "validate");
        check(before);
        if (opening || input.action === "generated-patch") {
          // Progress editing is not exposed yet; corrections invalidate prior page checks.
          record.checkedPages = []; record.lastPage = null;
          const next = json(record);
          if (before.reviewRevision === null) createFile(p.resolve(p.recordFile, true), next);
          else commitFile(p.resolve(p.recordFile), next, before.reviewRevision);
          reviewSaved = true;
          before.reviewRevision = textRevision(next);
        }
      }
      const built = await this.call(record, source, "build") as { source: string };
      const canonical = this.canonical(built.source);
      check(before);
      if (input.action === "generated-read") {
        const details = await this.call(record, source, "validate"); check(before);
        return { record, baseline: before, state: before.documentRevision === textRevision(canonical) ? "generated" : "regeneration-required", ...details, receipt: receipt("success") };
      }
      if (before.documentRevision === null) createFile(p.resolve(p.file, true), canonical);
      else commitFile(p.resolve(p.file), canonical, before.documentRevision);
      documentRegenerated = true;
      const result = { record, baseline: baseline(), state: "generated", reviewSaved, documentRegenerated, path: p.file, revision: textRevision(canonical), receipt: receipt("success") };
      this.requests.set(requestId, result); return structuredClone(result);
    } catch (error) {
      const result = { state: reviewSaved ? "regeneration-required" : "failed", reviewSaved, documentRegenerated,
        error: error instanceof Error ? error.message : "Review failed", guidance: "Read the current files before the next write. Query this requestId after a lost response; never automatically resend patches.", receipt: receipt("failure") };
      if (input.action !== "generated-read") this.requests.set(requestId, result);
      return result;
    } finally { this.busy.delete(p.key); }
  }
  /** K1 native jobs opt into the same record-first path, including its failure receipt. */
  async create(plugin: string, binding: JobContribution, root: string, source: string, file: string) {
    const result = await this.execute({ action: "generated-open", plugin, job: binding.id, root,
      source: path.relative(root, source), document: path.relative(root, file),
      baseline: { sourceHash: hash(source), reviewRevision: null, documentRevision: null }, requestId: randomUUID() });
    if (!result.documentRegenerated) throw new Error(result.reviewSaved ? "Review saved; document regeneration required" : "Review creation failed");
    return { path: result.path as string, revision: result.revision as string };
  }
}
