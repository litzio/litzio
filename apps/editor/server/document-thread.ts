import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { documentWorkError, type DocumentResults, type DocumentWork, type DocumentWorkReply } from "./document-worker-protocol.ts";
import { LocalWriteVerification } from "./document-local-verification.ts";

const COMPUTATION_TIMEOUT_MS = 60_000;

export class DocumentThreadError extends Error {}

type Call = {
  work: DocumentWork;
  reject(error: unknown): void;
  accept(result: DocumentResults[keyof DocumentResults]): boolean;
  remember?: () => boolean;
  fallback?: string;
  dispose(): void;
};

/** One lazy computation thread per Host. Keep pending requests here and dispatch one
 * at a time, so foreground work need not sit behind a backlog in the worker mailbox. */
export class DocumentThread {
  private worker?: Worker;
  private stopping?: Promise<number>;
  private closed = false;
  private started = false;
  private readonly waiting = new Set<Call>();
  private readonly saves = new Map<string, Promise<void>>();
  private active?: Call;
  private timer?: NodeJS.Timeout;
  readonly localWrite?: LocalWriteVerification;

  constructor(private readonly logging?: { log?(message: string): void; warn?(message: string): void }, statisticsFile?: string) {
    if (statisticsFile) this.localWrite = new LocalWriteVerification(statisticsFile, message =>
      (logging?.warn ?? logging?.log)?.(message));
  }

  /** Hold a path through the disk read, computation and publication. Each
   * different path can submit computation independently of this ordering. */
  inSaveOrder<T>(path: string, task: () => Promise<T>): Promise<T> {
    const result = (this.saves.get(path) ?? Promise.resolve()).then(() => {
      if (this.closed) throw new DocumentThreadError("The Host is closing.");
      return task();
    });
    const settled = result.then(() => {}, () => {});
    this.saves.set(path, settled);
    void settled.then(() => {
      if (this.saves.get(path) === settled) this.saves.delete(path);
    });
    return result;
  }

  read<K extends Exclude<DocumentWork["kind"], "save" | "verify-local-write">>(work: Extract<DocumentWork, { kind: K }>, signal: AbortSignal): Promise<DocumentResults[K]> {
    return this.run(work, signal, result => result as DocumentResults[K]);
  }

  /** The Host performs the synchronous commit before telling the worker to memoize. */
  save(work: Extract<DocumentWork, { kind: "save" }>, signal: AbortSignal, commit: (result: DocumentResults["save"]) => void,
    diskMatches?: (markdown: string) => boolean, correct?: (markdown: string, revision: string) => void): Promise<DocumentResults["save"]> {
    const verification = this.localWrite;
    const fallback = verification?.pending.has(work.path) ? "verification-pending"
      : verification?.disabled.has(work.path) ? "verification-disabled-for-document" : undefined;
    const save = { ...work, local: Boolean(verification?.enabled && !fallback && diskMatches && correct) };
    return this.run(save, signal, value => {
      const result = value as DocumentResults["save"];
      commit(result);
      if (result.localWrite && verification && diskMatches && correct) {
        verification.pending.set(save.path, result.revision);
        setImmediate(() => { void this.verifyLocalWrite(save, result, verification, diskMatches, correct); });
      }
      return result;
    }, { fallback });
  }

  private async verifyLocalWrite(save: Extract<DocumentWork, { kind: "save" }>, candidate: DocumentResults["save"],
    verification: LocalWriteVerification, diskMatches: (markdown: string) => boolean,
    correct: (markdown: string, revision: string) => void): Promise<void> {
    const { path } = save;
    const { revision, markdown } = candidate;
    let attempt = 0;
    try {
      while (!this.closed) {
        let promote = false;
        try {
          await this.run({ kind: "verify-local-write", save, expected: markdown }, new AbortController().signal, value => {
            promote = verification.complete(save, candidate, value as DocumentResults["verify-local-write"], diskMatches, correct);
          }, { remember: () => promote });
          return;
        } catch {
          if (this.closed) return;
          if (attempt++ === 0) continue; // Recompute the exact request after a worker exit.
          verification.failed(path, candidate);
          return;
        }
      }
    } finally {
      if (verification.pending.get(path) === revision) verification.pending.delete(path);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    const error = new DocumentThreadError("The Host is closing.");
    for (const call of this.waiting) {
      call.dispose();
      call.reject(error);
    }
    this.waiting.clear();
    this.finish()?.reject(error);
    if (this.worker) this.stop(this.worker);
    await this.stopping;
    await Promise.all(this.saves.values());
  }

  private run<T>(work: DocumentWork, signal: AbortSignal, receive: (result: DocumentResults[keyof DocumentResults]) => T,
    options?: Pick<Call, "remember" | "fallback">): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.closed) throw new DocumentThreadError("The Host is closing.");
      signal.throwIfAborted();
      const abort = () => {
        if (this.active === call) {
          this.finish();
          this.stop(this.worker!);
        } else this.waiting.delete(call);
        call.dispose();
        reject(signal.reason);
      };
      const call: Call = {
        work, reject, ...options,
        accept: value => {
          try {
            signal.throwIfAborted();
            resolve(receive(value));
            return true;
          } catch (error) { reject(error); return false; }
        },
        dispose: () => signal.removeEventListener("abort", abort),
      };
      signal.addEventListener("abort", abort, { once: true });
      this.waiting.add(call);
      this.dispatch();
    });
  }

  private dispatch(): void {
    if (this.closed || this.active || this.stopping) return;
    let call: Call | undefined;
    for (const waiting of this.waiting) {
      call ??= waiting;
      if (waiting.work.kind !== "verify-local-write") { call = waiting; break; }
    }
    if (!call) return;
    this.waiting.delete(call);
    this.active = call;
    try {
      const worker = this.worker ??= this.start();
      worker.ref();
      this.timer = setTimeout(() => this.fail(worker, "calculation timed out"), COMPUTATION_TIMEOUT_MS);
      worker.postMessage(call.work);
    } catch {
      if (this.worker) this.fail(this.worker, "could not send a request");
      else {
        this.logFailure("could not start");
        this.finish()?.reject(new DocumentThreadError("The document worker could not start. Try again."));
        queueMicrotask(() => this.dispatch());
      }
    }
  }

  private start(): Worker {
    // Use the same source/CLI entry resolution as the Host authoring thread.
    const entry = new URL(import.meta.url.endsWith(".ts") ? "./document-worker.ts" : "./document-worker.mjs", import.meta.url);
    const worker = entry.pathname.endsWith(".ts")
      ? new Worker(`require(${JSON.stringify(createRequire(import.meta.url).resolve("tsx/esm/api"))}).register(); import(${JSON.stringify(entry.href)});`, { eval: true })
      : new Worker(fileURLToPath(entry));
    worker.on("message", (reply: DocumentWorkReply) => {
      if (this.worker !== worker) return;
      const call = this.finish();
      if (!call) return;
      if (call.work.kind === "save") {
        const fallback = call.fallback ?? ("error" in reply ? reply.fallback : (reply.result as DocumentResults["save"]).fallback);
        if (fallback) this.localWrite?.countFallback(fallback);
      }
      if ("error" in reply) call.reject(documentWorkError(reply.error));
      else {
        const committed = call.accept(reply.result);
        if (call.work.kind === "save" || call.work.kind === "verify-local-write") {
          try { worker.postMessage({ kind: "settle-save", committed: committed && (call.remember?.() ?? true) }); }
          catch { this.fail(worker, "could not settle a save"); }
        }
      }
      this.dispatch();
    });
    worker.on("error", error => this.fail(worker, `thread error (${error.name})`));
    worker.on("messageerror", () => this.fail(worker, "could not receive a result"));
    worker.on("exit", code => this.fail(worker, `thread exited (${code})`));
    this.logging?.log?.(`document worker ${this.started ? "restarted" : "started"}`);
    this.started = true;
    return worker;
  }

  private finish(): Call | undefined {
    clearTimeout(this.timer);
    this.timer = undefined;
    const call = this.active;
    this.active = undefined;
    call?.dispose();
    this.worker?.unref();
    return call;
  }

  private fail(worker: Worker, reason: string): void {
    if (this.worker !== worker) return;
    this.logFailure(reason);
    this.finish()?.reject(new DocumentThreadError(`The document worker stopped: ${reason}. Try again.`));
    this.stop(worker);
  }

  private logFailure(reason: string): void {
    (this.logging?.warn ?? this.logging?.log)?.(`document worker failed: ${reason}`);
  }

  private stop(worker: Worker): void {
    this.worker = undefined;
    const stopping = this.stopping = worker.terminate();
    void stopping.then(() => {
      this.stopping = undefined;
      this.dispatch();
    }, () => this.logFailure("could not terminate"));
  }
}
