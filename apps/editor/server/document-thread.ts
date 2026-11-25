import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { documentWorkError, type DocumentResults, type DocumentWork, type DocumentWorkReply } from "./document-worker-protocol.ts";

const COMPUTATION_TIMEOUT_MS = 60_000;

export class DocumentThreadError extends Error {}

type Call = {
  work: DocumentWork;
  reject(error: unknown): void;
  accept(result: DocumentResults[keyof DocumentResults]): boolean;
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

  constructor(private readonly logging?: { log?(message: string): void; warn?(message: string): void }) {}

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

  read<K extends Exclude<DocumentWork["kind"], "save">>(work: Extract<DocumentWork, { kind: K }>, signal: AbortSignal): Promise<DocumentResults[K]> {
    return this.run(work, signal, result => result as DocumentResults[K]);
  }

  /** The Host performs the synchronous commit before telling the worker to memoize. */
  save(work: Extract<DocumentWork, { kind: "save" }>, signal: AbortSignal, commit: (result: DocumentResults["save"]) => void): Promise<DocumentResults["save"]> {
    return this.run(work, signal, value => {
      const result = value as DocumentResults["save"];
      commit(result);
      return result;
    });
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

  private run<T>(work: DocumentWork, signal: AbortSignal, receive: (result: DocumentResults[keyof DocumentResults]) => T): Promise<T> {
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
        work, reject,
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
    const call = this.waiting.values().next().value;
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
      if ("error" in reply) call.reject(documentWorkError(reply.error));
      else {
        const committed = call.accept(reply.result);
        if (call.work.kind === "save") {
          try { worker.postMessage({ kind: "settle-save", committed }); }
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
