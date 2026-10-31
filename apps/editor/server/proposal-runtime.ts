import { fork, spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getEditableDocument, parse, proposalBlock, replaceBlockProposal, serialize } from "@litzio/core";
import { digest, requestUuid, type Installation, type PluginStore } from "./plugin-store.ts";

export type ProposalInput = { id: string; source: string; index: number; instruction: string; adapter?: "codex" | "fake" };
export type ProposalReceipt = {
  id: string; fingerprint: string; owner: string; installation: Installation;
  status: "running" | "success" | "error" | "uncertain";
  result?: { markdown: string; before: string; after: string }; error?: string;
};
type Active = { child?: ChildProcess; stopped?: string; done: Promise<void> };

/** Trusted worker only. Tree termination is scoped to the process we forked. */
function terminate(child?: ChildProcess) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    const stop = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    stop.on("error", () => child.kill());
  } else { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
}
export class ProposalRuntime {
  private active = new Map<string, Active>();
  private closed = false;
  private fault?: Error;
  constructor(private store: PluginStore) {}
  async start(input: ProposalInput): Promise<ProposalReceipt> {
    if (this.closed) throw new Error("The proposal runtime is closing.");
    if (this.fault) throw this.fault;
    input = { ...input, id: requestUuid(input.id) };
    if (typeof input.source !== "string" || typeof input.instruction !== "string" || !input.instruction.trim() ||
        (input.adapter !== undefined && !["codex", "fake"].includes(input.adapter))) throw new Error("Source, block index and instruction are required.");
    const document = parse(input.source);
    const block = proposalBlock(document, input.index);
    const adapter = input.adapter ?? "codex";
    const fingerprint = digest(JSON.stringify({ source: input.source, index: input.index, instruction: input.instruction, adapter }));
    const { receipt, fresh } = this.store.admitProposal(input.id, fingerprint);
    if (fresh) {
      const execution: Active = { done: Promise.resolve() };
      this.active.set(input.id, execution);
      execution.done = this.execute(receipt, input, block, adapter, execution).finally(() => this.active.delete(input.id));
      void execution.done.catch(error => { this.fault = error instanceof Error ? error : new Error(String(error)); });
    }
    // Admission returns immediately. Accepted work drains independently of UI lifetime.
    return this.store.getProposal(input.id)!;
  }
  private async execute(receipt: ProposalReceipt, input: ProposalInput, block: ReturnType<typeof proposalBlock>, adapter: string, execution: Active) {
    const timeout = adapter === "fake" ? 1000 : 120_000;
    const timer = setTimeout(() => { execution.stopped = "AI proposal worker timed out. Request again."; terminate(execution.child); }, timeout);
    try {
      const entry = path.join(receipt.installation.directory, "worker.cjs");
      if (digest(await readFile(entry)) !== receipt.installation.sha256) throw new Error("Installed proposal worker hash mismatch.");
      if (this.closed || execution.stopped) throw new Error(execution.stopped ?? "The proposal runtime is closing.");
      const markdown = await new Promise<string>((resolve, reject) => {
        let result: unknown, failure: string | undefined;
        const child = fork(entry, [], { execPath: process.execPath, execArgv: [], windowsHide: true, detached: process.platform !== "win32",
          stdio: ["ignore", "ignore", "ignore", "ipc"], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
        execution.child = child;
        child.on("error", error => { failure = error.message; terminate(child); });
        child.on("message", (message: any) => {
          if (message?.type === "result") result = message.markdown;
          if (message?.type === "error") failure = String(message.error);
        });
        child.once("close", code => {
          if (execution.stopped || failure || code !== 0 || typeof result !== "string") reject(new Error(execution.stopped ?? failure ?? `AI worker failed (${code}).`));
          else resolve(result);
        });
        child.send({ operation: "propose", block, instruction: input.instruction, adapter }, error => { if (error) { failure = error.message; terminate(child); } });
      });
      if (execution.stopped) throw new Error(execution.stopped);
      const document = parse(input.source);
      const next = replaceBlockProposal(document, input.index, markdown);
      // Validation runs in Host/Core as well as at application, never in plugin-owned semantics.
      getEditableDocument(next);
      receipt.result = { markdown, before: serialize(document), after: serialize(next) };
      receipt.status = "success";
    } catch (error) { receipt.status = "error"; receipt.error = error instanceof Error ? error.message : String(error); }
    finally { clearTimeout(timer); this.store.finishProposal(receipt); }
  }
  async close() {
    this.closed = true;
    for (const execution of this.active.values()) { execution.stopped = "The proposal Host closed."; terminate(execution.child); }
    await Promise.all([...this.active.values()].map(item => item.done));
  }
}
