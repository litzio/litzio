import type { IncomingMessage, ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";

type LogStream = { write(text: string): unknown; on?(event: "error", listener: (error: Error) => void): unknown };
const guarded = new WeakSet<object>();

/** One timestamped line in the daemon's output; Desktop and `daemon start` redirect it to daemon.log. */
export function daemonLog(message: string, stream: LogStream = process.stdout): void {
  // Like console.log: a closed reader (EPIPE) or failed write never fails a request or shutdown.
  if (stream.on && !guarded.has(stream)) { guarded.add(stream); stream.on("error", () => {}); }
  try { stream.write(`${new Date().toISOString()} ${message}\n`); } catch { /* the line is lost, not the work */ }
}

export const DAEMON_LOG_ROTATE_BYTES = 1_000_000;
export const SLOW_REQUEST_MS = 2_000;
export const EVENT_LOOP_STALL_MS = 1_000;
const STACK_FRAMES = 8;

/** Keep only file names: directories can carry the account name and user folders. */
export function shortenPaths(text: string): string {
  return text
    .replace(/file:\/\//g, "")
    .replace(/(?<![A-Za-z])[A-Za-z]:[\\/](?:[^\\/\r\n:*?"<>|]*[\\/])*/g, "")
    .replace(/\\\\(?:[^\\/\r\n:*?"<>|]*[\\/])+/g, "")
    .replace(/(?<![\w.:/-])\/(?:[^/\s:'"()]+\/)+/g, "");
}

/** Name, message and the first stack frames on one line, without directories. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return shortenPaths(`non-error value ${typeof error}`);
  const frames = (error.stack ?? "").split("\n").filter(line => /^\s+at /.test(line)).slice(0, STACK_FRAMES).map(line => line.trim());
  return shortenPaths([`${error.name}: ${error.message.replace(/\s*\r?\n\s*/g, " ")}`, ...frames].join(" | "));
}

/**
 * Consecutive events of one group print once; the next different event or end() of that
 * group prints how many more times it repeated. Memory only, like the rest of the log.
 */
export function repeatLog(write: (message: string) => void, limit = 64) {
  const runs = new Map<string, { key: string; count: number }>();
  const end = (group: string): boolean => {
    const run = runs.get(group);
    if (!run) return false;
    runs.delete(group);
    if (run.count) write(`repeated ${run.count} more time${run.count === 1 ? "" : "s"}: ${run.key}`);
    return true;
  };
  return {
    report(group: string, key: string, message = key): void {
      const run = runs.get(group);
      if (run?.key === key) { run.count++; return; }
      end(group);
      // Bounded: the oldest open run ends (printing its count) before a new one starts.
      if (runs.size >= limit) end(runs.keys().next().value!);
      write(message);
      runs.set(group, { key, count: 0 });
    },
    end,
    flush(): void { for (const group of [...runs.keys()]) end(group); },
  };
}

/** Requests that last as long as the work they carry: an agent's Host tool call waits for its plugin or document work. */
export const LONG_RUNNING_ROUTES = ["/api/assistant/mcp/"] as const;
// Path segments that carry user file names or a lease token.
const OPAQUE_ROUTES = ["/document/", "/api/assistant/mcp/"] as const;

/** Method and path only: queries, bodies, headers and response text never reach the log. */
export function logRoute(target = ""): string {
  let pathname: string;
  try { pathname = new URL(target, "http://localhost").pathname; } catch { return "(invalid)"; }
  const opaque = OPAQUE_ROUTES.find(prefix => pathname.startsWith(prefix));
  return opaque ? `${opaque}*` : pathname.length > 200 ? `${pathname.slice(0, 200)}…` : pathname;
}

/**
 * Records failed (5xx, or 4xx on a state-changing method), slow and aborted requests.
 * Requests refused before or without a known route record "(unmatched)" instead of their path.
 * A request of the same method and path that needs no record ends that path's repeat run.
 */
export function requestRecorder(write: (message: string) => void, slowMs = SLOW_REQUEST_MS) {
  const runs = repeatLog(write);
  const record = (req: IncomingMessage, res: ServerResponse, ms: number, failure: { error: unknown } | undefined, routed: boolean) => {
    const method = req.method ?? "?", route = routed ? logRoute(req.url) : "(unmatched)", group = `${method} ${route}`;
    const finished = res.writableFinished, status = res.statusCode, time = `${Math.round(ms)}ms`;
    if (failure || (finished && (status >= 500 || (status >= 400 && method !== "GET" && method !== "HEAD")))) {
      const key = `request failed ${group} ${finished ? status : "incomplete"}`;
      runs.report(group, key, `${key} in ${time}${failure ? `: ${describeError(failure.error)}` : ""}`);
    } else if (!finished) runs.report(group, `request aborted ${group}`, `request aborted ${group} after ${time}`);
    else if (ms >= slowMs && !LONG_RUNNING_ROUTES.some(prefix => route.startsWith(prefix))) runs.report(group, `request slow ${group}`, `request slow ${group} ${status} in ${time}`);
    else runs.end(group);
  };
  return { record, flush: runs.flush };
}

/** Timer drift: a blocked event loop delays every timer by the length of the block. */
export function watchEventLoop(report: ReturnType<typeof repeatLog>, thresholdMs = EVENT_LOOP_STALL_MS, intervalMs = 200): () => void {
  let expected = performance.now() + intervalMs;
  const timer = setInterval(() => {
    const now = performance.now(), late = now - expected;
    expected = now + intervalMs;
    if (late > thresholdMs) report.report("stall", "event loop stalled", `event loop stalled for ${(late / 1000).toFixed(1)}s`);
    else report.end("stall");
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
