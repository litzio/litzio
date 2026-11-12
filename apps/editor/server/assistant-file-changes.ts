import { editorFile } from "./document-reader.ts";
import { readFileSync, statSync } from "node:fs";
import { applyPatch, reversePatch, parsePatch } from "diff";
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
    return parts.filter(part => {
      if (typeof part.oldText !== "string") {
        try { this.records.set(this.key(turn, this.checked(part.path, new RootAccess(folders))), null); }
        catch { /* Outside or deleted path: no capture. */ }
        return false;
      }
      return this.record(turn, part.path, part.oldText, part.newText, folders);
    }).map(part => part.path);
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
      const patch = `--- before\n+++ after\n${change.diff}`;
      // Provider start notifications can be delivered after the disk write.
      const before = applyPatch(after, reversePatch(parsePatch(patch)[0]!), { autoConvertLineEndings: false });
      if (typeof before !== "string" || applyPatch(before, patch, { autoConvertLineEndings: false }) !== after) throw new Error("Diff mismatch.");
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
      return true;
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
