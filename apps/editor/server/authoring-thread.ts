import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { DocumentAuthoringError, type AuthoredDocument } from "@litzio/core";

// One Host-owned thread runs Core authoring so the main thread keeps serving
// requests and health. It holds no state between calls and keeps the process
// alive only while a call is pending; the Host process lifetime ends it.
type Pending = { resolve(result: AuthoredDocument): void; reject(error: Error): void };
let current: { worker: Worker; pending: Map<number, Pending> } | undefined;
let nextId = 0;

function start() {
  // Checkout runs (tsx, Vite) load the TypeScript entry through tsx; built CLI and
  // Desktop bundles ship `authoring-worker.mjs` beside the chunk that contains this code.
  const entry = new URL(import.meta.url.endsWith(".ts") ? "./authoring-worker.ts" : "./authoring-worker.mjs", import.meta.url);
  const worker = entry.pathname.endsWith(".ts")
    ? new Worker(`require(${JSON.stringify(createRequire(import.meta.url).resolve("tsx/esm/api"))}).register(); import(${JSON.stringify(entry.href)});`, { eval: true })
    : new Worker(fileURLToPath(entry));
  const thread = { worker, pending: new Map<number, Pending>() };
  worker.unref();
  const stop = (cause: unknown) => {
    if (current === thread) current = undefined;
    for (const call of thread.pending.values()) call.reject(new Error("Document authoring stopped before completion; nothing was saved.", { cause }));
    thread.pending.clear();
  };
  worker.on("message", ({ id, result, error }: { id: number; result?: AuthoredDocument; error?: { code?: DocumentAuthoringError["code"]; diagnostics?: DocumentAuthoringError["diagnostics"]; message?: string } }) => {
    const call = thread.pending.get(id);
    if (!call) return;
    thread.pending.delete(id);
    if (!thread.pending.size) worker.unref();
    if (!error) call.resolve(result!);
    else call.reject(error.code ? new DocumentAuthoringError(error.code, error.diagnostics) : new Error(error.message));
  });
  worker.on("error", stop);
  worker.on("messageerror", stop);
  worker.on("exit", code => stop(new Error(`Authoring thread exited with code ${code}`)));
  return thread;
}

/** Core `authorDocument` on the Host authoring thread; same result and errors. */
export function authorDocumentInThread(raw: unknown, imageAssets: Readonly<Record<string, string>>): Promise<AuthoredDocument> {
  const thread = current ??= start();
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    thread.pending.set(id, { resolve, reject });
    thread.worker.ref();
    try { thread.worker.postMessage({ id, raw, imageAssets }); }
    catch (error) { thread.pending.delete(id); if (!thread.pending.size) thread.worker.unref(); reject(error as Error); }
  });
}

/** Ends the current thread; pending calls fail and the next call starts a new thread. */
export async function stopAuthoringThread() {
  await current?.worker.terminate();
}
