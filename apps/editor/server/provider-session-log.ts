import { openSync, readSync, closeSync, lstatSync, realpathSync, fstatSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import type { AiProvider } from "../shared/assistant.ts";

export const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function copilotLogRoot() { return path.resolve(process.env.COPILOT_HOME || path.join(homedir(), ".copilot")); }

/** Inspect only the bounded first metadata record, never collect the transcript. */
export function validateProviderLog(file: string, provider: AiProvider, id: string): string {
  if (!sessionIdPattern.test(id) || !path.isAbsolute(file) || /^[\\/]{2}/.test(file) || path.extname(file) !== ".jsonl" || file.includes("\0") || (process.platform === "win32" && file.slice(2).includes(":"))) throw new Error("Invalid provider log location.");
  let current = path.resolve(file);
  while (true) {
    if (lstatSync(current).isSymbolicLink()) throw new Error("Linked provider logs are unsupported.");
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  const real = realpathSync(file);
  if (!lstatSync(real).isFile()) throw new Error("Provider log is not a regular file.");
  const fd = openSync(real, "r");
  try {
    if (!fstatSync(fd).isFile() || fstatSync(fd).nlink !== 1) throw new Error("Provider log is not a regular unlinked file.");
    const bytes = Buffer.alloc(65536); const count = readSync(fd, bytes, 0, bytes.length, 0);
    const end = bytes.subarray(0, count).indexOf(10);
    if (end < 0) throw new Error("Provider log metadata is unavailable.");
    const first = JSON.parse(bytes.subarray(0, end).toString("utf8"));
    if (provider === "codex" ? first.type !== "session_meta" || first.payload?.id !== id : first.type !== "session.start" || first.data?.sessionId !== id) throw new Error("Provider log belongs to another session.");
    return real;
  } finally { closeSync(fd); }
}
