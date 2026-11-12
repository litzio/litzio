import { editorFile } from "./document-reader.ts";
import { readFileSync, statSync } from "node:fs";
import { parsePatch } from "diff";
import { commitFile, decodeUtf8, textRevision } from "@litzio/file-commit";
import { accessPath, canonicalFilePath, RootAccess, type FileAccess } from "./file-access.ts";

const maxBytes = 1024 * 1024;
/** Owned by one conversation; never persisted or reconstructed from provider history. */
export class AssistantFileChanges {
  private records = new Map<string, { path: string; before: string; after: string; roots: RootAccess; undone?: boolean } | null>();
  private acp = new Map<string, { path: string; oldText: string | null; newText: string }[]>();
  copilot(turn: string, item: string, content: any[] | null | undefined, completed: boolean, folders: string[]) {
    const itemKey = this.key(turn, item);
    if (content) this.acp.set(itemKey, content.filter(part => part.type === "diff"));
    if (!completed) return [];
    const parts = this.acp.get(itemKey) ?? []; this.acp.delete(itemKey);
    return parts.flatMap(part => {
      if (typeof part.oldText !== "string") {
        try { this.records.set(this.key(turn, this.checked(part.path, new RootAccess(folders))), null); }
        catch { /* Outside or deleted path: no capture. */ }
        return [];
      }
      const target = this.record(turn, part.path, part.oldText, part.newText, folders);
      return target ? [target] : [];
    });
  }
  constructor(private access: FileAccess) {}
  private key(turn: string, file: string) { return JSON.stringify([turn, file]); }
  private checked(file: string, roots: RootAccess) { return canonicalFilePath(accessPath(accessPath(file, roots), this.access)); }
  private read(file: string) {
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > maxBytes) throw new Error("Comparison unavailable for this file.");
    const text = decodeUtf8(readFileSync(file));
    if (text.includes("\0")) throw new Error("Comparison unavailable for binary files.");
    return text;
  }
  codex(turn: string, change: any, folders: string[]) {
    let key: string | undefined;
    try {
      const roots = new RootAccess(folders), target = this.checked(change.path, roots);
      key = this.key(turn, target);
      if (change.kind?.type !== "update" || change.kind.move_path || typeof change.diff !== "string" || Buffer.byteLength(change.diff) > 2 * maxBytes) throw new Error("Unsupported change.");
      const after = this.read(target);
      // Provider start notifications can be delivered after the disk write.
      const before = applyDeclaredDiff(after, change.diff, true);
      if (!Buffer.from(applyDeclaredDiff(before, change.diff, false), "utf8").equals(Buffer.from(after, "utf8"))) throw new Error("Diff mismatch.");
      return this.record(turn, change.path, before, after, folders);
    } catch { if (key) this.records.set(key, null); return false; }
  }
  record(turn: string, file: string, before: string, after: string, folders: string[]) {
    let key: string | undefined;
    try {
      const roots = new RootAccess(folders), target = this.checked(file, roots);
      key = this.key(turn, target);
      if (this.records.has(key) && this.records.get(key) === null) return false;
      if (typeof before !== "string" || typeof after !== "string" || Buffer.byteLength(before) > maxBytes || Buffer.byteLength(after) > maxBytes || before.includes("\0") || after.includes("\0")) throw new Error("Unsupported text.");
      if (this.read(target) !== after) throw new Error("Result mismatch.");
      const previous = this.records.get(key);
      if (previous && (previous.after !== before || previous.undone)) { this.records.set(key, null); return false; }
      this.records.set(key, { path: target, before: previous?.before ?? before, after, roots });
      return target;
    } catch { if (key) this.records.set(key, null); return false; }
  }
  compare(turn: string, file: string, folders: string[]) {
    const record = this.records.get(this.key(turn, this.checked(file, new RootAccess(folders))));
    if (!record || record.undone) throw new Error("This change is unavailable in this Host session.");
    this.checked(record.path, new RootAccess(folders));
    const after = this.read(this.checked(record.path, record.roots));
    return { before: record.before, after, sourceOnly: editorFile(record.path, record.before).kind !== "native" || editorFile(record.path, after).kind !== "native", changed: false, missing: false };
  }
  undo(turn: string, file: string, folders: string[]) {
    const comparison = this.compare(turn, file, folders);
    const record = this.records.get(this.key(turn, this.checked(file, new RootAccess(folders))))!;
    if (comparison.after !== record.after) throw new Error("The file changed after the assistant edit. Undo was refused.");
    commitFile(this.checked(record.path, record.roots), record.before, textRevision(record.after));
    record.undone = true;
    return { path: file, revision: textRevision(record.before) };
  }
}

/** Compare and replace only the declared spans; parsing never authorizes offset search. */
function applyDeclaredDiff(source: string, diff: string, reverse: boolean): string {
  const patches = parsePatch(diff);
  // Retain declared counts: parsePatch can normalize a missing single line to zero.
  const headers = [...diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*$/gm)];
  if (patches.length !== 1 || !headers.length || patches[0]!.hunks.length !== headers.length) throw new Error("Invalid diff hunks.");
  const input = source.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const output: string[] = [];
  let cursor = 0, oldEnd = 0, newEnd = 0;
  for (const [index, hunk] of patches[0]!.hunks.entries()) {
    const header = headers[index]!;
    const [oldStart, oldCount, newStart, newCount] = [Number(header[1]), Number(header[2] ?? 1), Number(header[3]), Number(header[4] ?? 1)];
    if (![oldStart, oldCount, newStart, newCount].every(value => Number.isSafeInteger(value) && value > 0) ||
        hunk.oldStart !== oldStart || hunk.newStart !== newStart || hunk.oldLines !== oldCount || hunk.newLines !== newCount ||
        oldStart - 1 < oldEnd || newStart - 1 < newEnd) throw new Error("Unanchored or unordered diff hunk.");
    const oldLines: string[] = [], newLines: string[] = [];
    let previous = "";
    for (const line of hunk.lines) {
      const operation = line[0];
      if (operation === "\\") {
        if (line.replace(/\r$/, "") !== "\\ No newline at end of file" || !previous) throw new Error("Invalid diff newline marker.");
        if (previous !== "+") oldLines[oldLines.length - 1] = oldLines.at(-1)!.slice(0, -1);
        if (previous !== "-") newLines[newLines.length - 1] = newLines.at(-1)!.slice(0, -1);
        previous = "";
      } else {
        if (operation !== " " && operation !== "-" && operation !== "+") throw new Error("Invalid diff line.");
        const content = line.slice(1) + "\n";
        if (operation !== "+") oldLines.push(content);
        if (operation !== "-") newLines.push(content);
        previous = operation;
      }
    }
    if (oldLines.length !== oldCount || newLines.length !== newCount) throw new Error("Diff line count mismatch.");
    const expected = reverse ? newLines : oldLines, replacement = reverse ? oldLines : newLines;
    const start = (reverse ? newStart : oldStart) - 1, destination = (reverse ? oldStart : newStart) - 1;
    if (start < cursor || start + expected.length > input.length || expected.some((line, offset) => input[start + offset] !== line)) throw new Error("Diff span mismatch.");
    output.push(...input.slice(cursor, start));
    if (output.length !== destination) throw new Error("Inconsistent diff positions.");
    output.push(...replacement);
    cursor = start + expected.length;
    oldEnd = oldStart - 1 + oldCount; newEnd = newStart - 1 + newCount;
  }
  output.push(...input.slice(cursor));
  if (output.slice(0, -1).some(line => !line.endsWith("\n"))) throw new Error("Non-final diff newline marker.");
  return output.join("");
}
