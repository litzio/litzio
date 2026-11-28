import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { LocalWriteKind } from "@litzio/core";
import { commitFile, createFile, FileChangedError, textRevision } from "@litzio/file-commit";
import type { LocalWriteStatus } from "../shared/document-protocol.ts";
import type { DocumentResults, SaveWork } from "./document-worker-protocol.ts";

// Temporary #1986 counters. Increase the rules version with a fix that restarts the count.
const rulesVersion = 3;
type KindCounts = { completed: number; mismatches: number; documents: string[]; largeDocuments: string[];
  firstCounted: string | null; lastMismatch: string | null };
const emptyKind = (): KindCounts => ({
  completed: 0, mismatches: 0, documents: [], largeDocuments: [], firstCounted: null, lastMismatch: null,
});
const empty = () => ({ rulesVersion, paragraph: emptyKind(), cell: emptyKind(), fallback: {} as Record<string, number> });
type Counts = ReturnType<typeof empty>;

export class LocalWriteVerification {
  readonly enabled = process.env.LITZIO_LOCAL_WRITE !== "0";
  readonly pending = new Map<string, string>();
  private readonly verified = new Map<string, string>();
  // Kept for the lifetime of the Host, including through a worker restart.
  readonly disabled = new Map<string, { revision: string; status: Exclude<LocalWriteStatus, { state: "pending" } | { state: "done" }> }>();

  constructor(private readonly file: string, private readonly warn: (message: string) => void) {}

  status(path: string, revision: string): LocalWriteStatus {
    const failure = this.disabled.get(path);
    if (failure?.revision === revision) return failure.status;
    if (this.pending.get(path) === revision) return { state: "pending" };
    return { state: "done", ...(this.verified.get(path) === revision ? { verified: true } : {}) };
  }

  statistics() {
    const { paragraph, cell, fallback } = this.read().counts;
    const summarize = ({ documents, largeDocuments, ...counts }: KindCounts) => ({
      ...counts, documents: documents.length, largeDocuments: largeDocuments.length,
    });
    return { enabled: this.enabled, rulesVersion, paragraph: summarize(paragraph), cell: summarize(cell),
      documents: new Set([...paragraph.documents, ...cell.documents]).size,
      largeDocuments: new Set([...paragraph.largeDocuments, ...cell.largeDocuments]).size, fallback };
  }

  countFallback(reason: string) {
    if (this.enabled) this.update(counts => { counts.fallback[reason] = (counts.fallback[reason] ?? 0) + 1; });
  }

  complete(save: SaveWork, candidate: DocumentResults["save"], full: DocumentResults["verify-local-write"],
    diskMatches: (markdown: string) => boolean, correct: (markdown: string, revision: string) => void): boolean {
    const { path, disk, request } = save;
    const { revision, markdown, localWrite } = candidate;
    const { kind, blockCount } = localWrite!;
    const mismatch = full.outcome !== "equal";
    if (mismatch) {
      let corrected = false;
      const correctedRevision = full.outcome === "different" ? full.revision : request.revision;
      try {
        if (diskMatches(markdown)) {
          correct(full.outcome === "different" ? full.markdown : disk, revision);
          corrected = true;
        }
      } catch { /* A concurrent change or file error can prevent correction. */ }
      this.disabled.set(path, { revision, status: full.outcome === "rejected"
        ? { state: "rejected", revision: correctedRevision, reason: full.reason, failure: full.failure }
        : corrected ? { state: "corrected", revision: correctedRevision } : { state: "uncorrected" } });
      this.report(kind, blockCount, localWrite!.path, `${full.outcome}/${corrected ? "corrected" : "uncorrected"}`);
    } else {
      this.verified.delete(path);
      this.verified.set(path, revision);
      // Receipts are disposable, like the worker's approval cache.
      if (this.verified.size > 64) this.verified.delete(this.verified.keys().next().value!);
    }
    this.count(path, kind, blockCount, mismatch);
    // A foreground Save can supersede the candidate before its comparison runs.
    return !mismatch && diskMatches(markdown);
  }

  failed(path: string, candidate: DocumentResults["save"]) {
    this.disabled.set(path, { revision: candidate.revision, status: { state: "uncorrected" } });
    this.report(candidate.localWrite!.kind, candidate.localWrite!.blockCount, candidate.localWrite!.path, "verification-unavailable");
  }

  private count(path: string, kind: LocalWriteKind, blockCount: number, mismatch: boolean) {
    const fingerprint = createHash("sha256").update(path, "utf8").digest("hex");
    const day = new Date().toISOString().slice(0, 10);
    this.update(counts => {
      const record = counts[kind];
      record.completed++;
      if (mismatch) {
        record.mismatches++;
        record.lastMismatch = day;
      }
      record.firstCounted ??= day;
      if (!record.documents.includes(fingerprint)) record.documents.push(fingerprint);
      if (blockCount >= 2_000 && !record.largeDocuments.includes(fingerprint)) record.largeDocuments.push(fingerprint);
    });
  }

  private report(kind: LocalWriteKind, blockCount: number, location: readonly number[], reason: string) {
    // Core's body paths start at 1. Cell row/column offsets start at 0.
    const [block, row, column] = location;
    this.warn(`verify-local-write: ${kind}, ${reason}, ${blockCount} blocks, block ${block}${kind === "cell" ? `, row ${row + 1}, column ${column + 1}` : ""}`);
  }

  private read(): { counts: Counts; revision?: string } {
    let source: string;
    try { source = readFileSync(this.file, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { counts: empty() };
      throw error;
    }
    const stored = JSON.parse(source) as Counts;
    return { counts: stored.rulesVersion === rulesVersion ? stored : empty(), revision: textRevision(source) };
  }

  private update(change: (counts: Counts) => void) {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      // Manual and local daemons may share app data. Retry when another write wins.
      for (let attempt = 0; attempt < 3; attempt++) {
        const { counts, revision } = this.read();
        change(counts);
        const source = JSON.stringify(counts) + "\n";
        try {
          if (revision === undefined) createFile(this.file, source);
          else commitFile(this.file, source, revision);
          return;
        } catch (error) {
          if (!(error instanceof FileChangedError) && (error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
      }
    } catch { /* Save acknowledgements and corrections do not depend on diagnostics. */ }
    this.warn("verify-local-write: counters could not be recorded");
  }
}
