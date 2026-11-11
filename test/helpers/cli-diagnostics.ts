import fs from "node:fs";
import path from "node:path";
import type { ChildProcess } from "node:child_process";

const tailBytes = 8192;
/** Failure-only file reads; never load a potentially large daemon log into memory. */
function fileTail(file: string): string {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    const bytes = Buffer.alloc(Math.min(size, tailBytes));
    const read = fs.readSync(fd, bytes, 0, bytes.length, Math.max(0, size - bytes.length));
    return bytes.subarray(0, read).toString("utf8");
  } catch (error) { return `[unavailable: ${(error as NodeJS.ErrnoException).code ?? String(error)}]`; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

/** Observe existing events only: no polling, extra pipes, processes or success output. */
export class CliDiagnostics {
  private readonly args: readonly string[];
  private readonly started = performance.now();
  private readonly at = new Date().toISOString();
  private readonly events: { event: string; ms: number; detail?: unknown }[] = [];
  constructor(args: readonly string[]) { this.args = args; this.mark("launch requested"); }
  mark(event: string, detail?: unknown): void {
    this.events.push({ event, ms: Math.round(performance.now() - this.started), ...(detail === undefined ? {} : { detail }) });
  }
  observe(child: ChildProcess): void {
    child.once("spawn", () => this.mark("spawn", { pid: child.pid }));
    child.stdout?.once("data", () => this.mark("first stdout"));
    child.stderr?.once("data", () => this.mark("first stderr"));
    child.once("exit", (code, signal) => this.mark("exit", { code, signal }));
    child.once("close", (code, signal) => this.mark("close", { code, signal }));
  }
  snapshot(directory: string): Record<string, string> {
    return Object.fromEntries(["daemon.lock", "instance.json", "daemon.log"].map(name => [name, fileTail(path.join(directory, name))]));
  }
  format(stdout: string, stderr: string, state?: unknown): string {
    return `CLI failure diagnostics: ${JSON.stringify({ args: this.args, launchedAt: this.at, events: this.events,
      stdoutTail: stdout.slice(-tailBytes), stderrTail: stderr.slice(-tailBytes), state })}`;
  }
}
