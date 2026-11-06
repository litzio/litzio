import { mkdirSync, writeFileSync, readFileSync, readdirSync, renameSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";
import type { AssistantTransmission } from "./assistant-transmissions.ts";

/** Host-local receipts. Not conversation history, and never automatically replayed. */
export class AssistantTransmissionLog {
  private failures = 0;
  private closed = false;
  close() { this.closed = true; }
  constructor(readonly directory: string) {}
  record = (event: AssistantTransmission) => {
    if (this.closed) return;
    const { payload, ...metadata } = event;
    try {
      if (existsSync(path.join(this.directory, `${event.id}.deleted`))) return;
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      const body = path.join(this.directory, `${event.id}.body`);
      if (event.status === "attempted") {
        writeFileSync(`${body}.tmp`, JSON.stringify(payload), { flag: "wx", mode: 0o600 });
        renameSync(`${body}.tmp`, body);
      }
      const file = path.join(this.directory, `${event.id}.json`), temporary = `${file}.tmp`;
      try {
        writeFileSync(temporary, JSON.stringify({ ...metadata, complete: existsSync(body) }), { mode: 0o600 });
        renameSync(temporary, file);
      } finally { if (existsSync(temporary)) unlinkSync(temporary); }
      // A separate CLI process can delete while synchronous writes are in progress.
      // Recheck after publication so that a completed deletion cannot be resurrected.
      if (existsSync(path.join(this.directory, `${event.id}.deleted`))) {
        if (existsSync(body)) unlinkSync(body);
        if (existsSync(file)) unlinkSync(file);
      }
    } catch { this.failures++; } // Disk full/permissions must never mask provider execution.
  };
  invoke(args: { action?: string; id?: string; offset?: number; conversationId?: string } = {}) {
    const action = args.action ?? "list";
    if (args.offset !== undefined && (!Number.isSafeInteger(args.offset) || args.offset < 0)) throw new Error("Invalid transmission offset.");
    if (action === "list") {
      const entries: Omit<AssistantTransmission, "payload">[] = [];
      const names = existsSync(this.directory) ? readdirSync(this.directory) : [];
      const incomplete = names.filter(name => /^[0-9a-f-]{36}\.(body(\.tmp)?|json\.tmp)$/.test(name)
        && !names.includes(`${name.slice(0, 36)}.json`)).map(name => name.slice(0, 36));
      for (const name of names.filter(name => /^[0-9a-f-]{36}\.json$/.test(name))) {
        try {
          const entry = JSON.parse(readFileSync(path.join(this.directory, name), "utf8"));
          if (!args.conversationId || entry.conversationId === args.conversationId) {
            const { sources: _sources, ...summary } = entry;
            entries.push(summary);
          }
        } catch { this.failures++; incomplete.push(name.slice(0, 36)); }
      }
      return { incomplete: [...new Set(incomplete)], entries: entries.sort((a, b) => b.at - a.at).slice(args.offset ?? 0, (args.offset ?? 0) + 50), nextOffset: (args.offset ?? 0) + 50 < entries.length ? (args.offset ?? 0) + 50 : null, failures: this.failures,
        scope: "Litzio sends only; provider internal history and final model input are unobserved. Retained until deleted on this Host." };
    }
    if (!args.id || !/^[0-9a-f-]{36}$/.test(args.id)) throw new Error("Invalid transmission ID.");
    const file = path.join(this.directory, `${args.id}.json`), body = path.join(this.directory, `${args.id}.body`);
    if (action === "delete") {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      writeFileSync(path.join(this.directory, `${args.id}.deleted`), "", { mode: 0o600 });
      // Remove raw content first; a failure leaves its metadata for another deletion attempt.
      if (existsSync(body)) unlinkSync(body);
      if (existsSync(`${body}.tmp`)) unlinkSync(`${body}.tmp`);
      if (existsSync(file)) unlinkSync(file);
      if (existsSync(`${file}.tmp`)) unlinkSync(`${file}.tmp`);
      return { receipt: { id: args.id, outcome: "success", deleted: true } };
    }
    if (action !== "read") throw new Error("Invalid transmission action.");
    const offset = args.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid transmission offset.");
    const metadata = JSON.parse(readFileSync(file, "utf8"));
    // Page JSON text by UTF-16 characters; no truncation or lost UTF-8 bytes across pages.
    const text = readFileSync(body, "utf8"), end = Math.min(offset + 65536, text.length);
    return { metadata, text: text.slice(offset, end), nextOffset: end < text.length ? end : null };
  }
}
