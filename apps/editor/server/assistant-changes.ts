import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parse, serialize, validateStructure } from "@litzio/core";
import { commitFile, createFile, decodeUtf8, textRevision } from "@litzio/file-commit";
import { accessPath, canonicalFilePath, type FileAccess, type RootAccess } from "./file-access.ts";
import { loadDocumentFile } from "./document-reader.ts";

export type PendingDocumentChange = { id: string; conversation: string; path: string; copy: string; revision: string };
type Scope = { folders: RootAccess | null; permissionMode: string; access: FileAccess };

/** Host-owned, conversation-scoped receipts. Copies are hidden siblings so relative assets keep their base. */
export class AssistantChanges {
  constructor(private directory: string, private access: FileAccess) {}
  private file(conversation: string, id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid pending change ID.");
    return path.join(this.directory, createHash("sha256").update(conversation).digest("hex"), `${id}.json`);
  }
  list(conversation: string): PendingDocumentChange[] {
    const directory = path.dirname(this.file(conversation, "0".repeat(64)));
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory).filter(name => name.endsWith(".json")).map(name => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")));
  }
  private get(conversation: string, id: string): PendingDocumentChange {
    const record: PendingDocumentChange = JSON.parse(fs.readFileSync(this.file(conversation, id), "utf8"));
    if (record.conversation !== conversation || record.id !== id) throw new Error("Pending change owner mismatch.");
    accessPath(record.path, this.access, true); accessPath(record.copy, this.access, true);
    return record;
  }
  start(conversation: string, requested: string, scope: Scope) {
    if (!["opened-folders", "full-access"].includes(scope.permissionMode)) throw new Error("This turn is read-only; no copy was created.");
    if (!scope.folders || !path.isAbsolute(requested)) throw new Error("An absolute path inside an opened folder is required.");
    const original = canonicalFilePath(scope.folders.resolve(accessPath(requested, scope.access)));
    if (path.basename(original).startsWith(".")) throw new Error("A pending copy cannot itself be staged.");
    const id = createHash("sha256").update(conversation).update("\0").update(original).digest("hex");
    const receipt = this.file(conversation, id);
    if (fs.existsSync(receipt)) return this.get(conversation, id);
    const document = loadDocumentFile(original, scope.access);
    // Refuse unsupported canonical semantics before creating any state.
    serialize(parse(document.source));
    const copy = path.join(path.dirname(original), `.litzio-change-${randomUUID()}.md`);
    scope.folders.resolve(accessPath(copy, scope.access, true), true);
    const record = { id, conversation, path: original, copy, revision: document.revision };
    fs.mkdirSync(path.dirname(receipt), { recursive: true });
    createFile(copy, document.source);
    try { createFile(receipt, JSON.stringify(record)); }
    catch (error) { fs.unlinkSync(copy); throw error; }
    return record;
  }
  preview(conversation: string, id: string) {
    const record = this.get(conversation, id);
    const before = decodeUtf8(fs.readFileSync(accessPath(record.path, this.access)));
    const source = decodeUtf8(fs.readFileSync(accessPath(record.copy, this.access)));
    const document = parse(source); validateStructure(document);
    const after = serialize(document);
    return { ...record, before, after, changed: textRevision(before) !== record.revision, missing: false,
      copyRevision: textRevision(source), diskRevision: textRevision(before) };
  }
  apply(conversation: string, id: string, copyRevision: string, diskRevision: string) {
    const preview = this.preview(conversation, id);
    if (preview.changed || preview.diskRevision !== diskRevision || preview.copyRevision !== copyRevision) throw new Error("The original or pending copy changed. Review the comparison again; nothing was applied.");
    // Core canonical serialization and the same revision-checked file replacement used by CLI/Save.
    commitFile(accessPath(preview.path, this.access), preview.after, preview.revision);
    this.discard(conversation, id);
    return { path: preview.path, revision: textRevision(preview.after), outcome: "applied" };
  }
  discard(conversation: string, id: string) {
    const record = this.get(conversation, id);
    fs.rmSync(accessPath(record.copy, this.access, true), { force: true });
    fs.unlinkSync(this.file(conversation, id));
    return { path: record.path, outcome: "discarded" };
  }
  clear(conversation: string) { for (const record of this.list(conversation)) this.discard(conversation, record.id); }
}
