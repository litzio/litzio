import { applyDocumentBatch, machineNodes } from "./document-edit-commands.ts";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parse, serialize, validateStructure, getEditableDocument, numberingReport } from "@litzio/core";
import { FileChangedError, commitFile, createFile, decodeUtf8, textRevision } from "@litzio/file-commit";
import { FileAccessError, accessPath, canonicalFilePath, type FileAccess, type RootAccess } from "./file-access.ts";
import { loadDocumentFile } from "./document-reader.ts";

export type PendingDocumentChange = { id: string; conversationId: string; path: string; copy: string; revision: string };
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
    if (record.conversationId !== conversation || record.id !== id) throw new Error("Pending change owner mismatch.");
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
    const record = { id, conversationId: conversation, path: original, copy, revision: document.revision };
    fs.mkdirSync(path.dirname(receipt), { recursive: true });
    createFile(copy, document.source);
    try { createFile(receipt, JSON.stringify(record)); }
    catch (error) { fs.unlinkSync(copy); throw error; }
    return record;
  }
  /** Shared Host operation: only a conversation-owned pending copy, never a caller path. */
  edit(conversation: string, action: "inspect" | "edit", input: unknown, scope: Scope) {
    const fail = (errorKind: string, error: string) => ({ receipt: { outcome: errorKind === "uncertain" ? "uncertain" : "failure" }, errorKind, error });
    const value = input as { change: string; copyRevision?: string; operations?: unknown };
    const keys = action === "inspect" ? ["change"] : ["change", "copyRevision", "operations"];
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)) ||
        typeof value.change !== "string" || !/^[a-f0-9]{64}$/.test(value.change) ||
        (action === "edit" && (typeof value.copyRevision !== "string" || !/^[a-f0-9]{64}$/.test(value.copyRevision) || !Array.isArray(value.operations) || !value.operations.length)))
      return fail("invalid_input", "Expected change ID and, for edit, copyRevision and non-empty operations.");
    if (action === "edit" && !["opened-folders", "full-access"].includes(scope.permissionMode)) return fail("forbidden", "This turn is read-only.");
    if (!scope.folders) return fail("forbidden", "No opened folders for this turn.");
    let copy: string, source: string;
    try {
      const record = this.get(conversation, value.change);
      scope.folders.resolve(accessPath(record.path, scope.access, true), true);
      copy = scope.folders.resolve(accessPath(record.copy, scope.access));
      // A changed symlink must never redirect a copy write onto the original.
      if (canonicalFilePath(copy) === canonicalFilePath(record.path) || fs.lstatSync(copy).isSymbolicLink()) return fail("forbidden", "Pending copy identity changed.");
      source = decodeUtf8(fs.readFileSync(copy));
    } catch (error) {
      return fail(error instanceof FileAccessError || ["EACCES", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "") ? "forbidden" : "unavailable", String(error));
    }
    const copyRevision = textRevision(source);
    if (action === "inspect") {
      try {
        const document = getEditableDocument(parse(source));
        return { receipt: { outcome: "success" }, change: value.change, copyRevision, title: document.title ?? null, nodes: machineNodes(document), numbering: numberingReport(document.blocks) };
      } catch (error) { return fail("invalid_input", String(error)); }
    }
    if (copyRevision !== value.copyRevision) return fail("conflict", "Pending copy changed; inspect again. Nothing was written.");
    let result: ReturnType<typeof applyDocumentBatch>;
    try { result = applyDocumentBatch(source, value.operations); }
    catch (error) { return fail("invalid_input", String(error)); }
    try {
      commitFile(copy, result.markdown, copyRevision);
      return { receipt: { outcome: "success" }, change: value.change, copyRevision: textRevision(result.markdown), applied: result.applied };
    } catch (error) {
      return fail(error instanceof FileChangedError ? "conflict" : error instanceof FileAccessError ? "forbidden" : "uncertain", String(error));
    }
  }
  preview(conversation: string, id: string) {
    const record = this.get(conversation, id);
    let before = "", missing = false;
    try { before = decodeUtf8(fs.readFileSync(accessPath(record.path, this.access))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; missing = true; }
    const source = decodeUtf8(fs.readFileSync(accessPath(record.copy, this.access)));
    const document = parse(source); validateStructure(document);
    const after = serialize(document);
    return { ...record, before, after, changed: missing || textRevision(before) !== record.revision, missing,
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
