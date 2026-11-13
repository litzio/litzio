import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { validateImage } from "./image-validation.ts";
import { ASSET_TYPES } from "../shared/asset-policy.ts";
import { ASSISTANT_TRANSPORT_LIMITS } from "../shared/assistant-limits.ts";
import type { AssistantFileReference } from "../shared/assistant.ts";

export type AttachmentRecord = { file: string; digest: string; identity: string; owner?: string };
type Record = AttachmentRecord;
const identity = (stat: fs.BigIntStats) => `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
/** Only exact, Host-issued files receive the opened-folder exception. */
export class AssistantAttachments {
  private records: Record[];
  private readonly directory: string;
  private readonly index: string;
  constructor(cwd: string) {
    this.directory = path.join(cwd, "attachments");
    this.index = path.join(cwd, "conversations.json");
    fs.mkdirSync(this.directory, { recursive: true });
    this.records = fs.existsSync(this.index) ? JSON.parse(fs.readFileSync(this.index, "utf8")).flatMap((entry: any) => entry.attachments ?? []) : [];
    this.assertDirectory();
    // Unsent drafts have no index entry. Remove only our generated image files.
    for (const name of fs.readdirSync(this.directory)) {
      const file = path.join(this.directory, name);
      if (/^clipboard-[a-f0-9-]{36}\.(png|jpg|gif|webp)$/.test(name) && !this.records.some(record => record.file === file)) {
        if (fs.lstatSync(file).isSymbolicLink()) throw new Error("Attachment is unavailable.");
        fs.unlinkSync(file);
      }
    }
  }
  private assertDirectory() {
    for (let current = this.directory; ; current = path.dirname(current)) {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error("Attachment directory is unavailable.");
      if (path.dirname(current) === current) break;
    }
  }
  private persist() {
    if (!fs.existsSync(this.index)) return;
    const entries = JSON.parse(fs.readFileSync(this.index, "utf8")).map((entry: any) => {
      const { attachments: _previous, ...info } = entry;
      const attachments = this.records.filter(record => record.owner === entry.id);
      return { ...info, ...(attachments.length ? { attachments } : {}) };
    });
    const temporary = `${this.index}.${randomUUID()}.tmp`;
    try { fs.writeFileSync(temporary, JSON.stringify(entries), { flag: "wx" }); fs.renameSync(temporary, this.index); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  private bytes(record: Record) {
    if (path.dirname(record.file) !== this.directory) throw new Error("Attachment is unavailable.");
    for (let current = record.file; ; current = path.dirname(current)) {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error("Attachment is unavailable.");
      if (path.dirname(current) === current) break;
    }
    const stat = fs.statSync(record.file, { bigint: true });
    if (!stat.isFile() || identity(stat) !== record.identity) throw new Error("Attachment is unavailable.");
    const bytes = fs.readFileSync(record.file);
    if (createHash("sha256").update(bytes).digest("hex") !== record.digest) throw new Error("Attachment is unavailable.");
    return bytes;
  }
  upload(args: { mime: string; data: string; id?: string }) {
    if (!args || Object.keys(args).some(key => !["action", "mime", "data", "id"].includes(key)) || typeof args.data !== "string") throw new Error("Invalid image upload.");
    const bytes = Buffer.from(args.data, "base64");
    if (bytes.toString("base64") !== args.data) throw new Error("Invalid image upload.");
    validateImage(args.mime, bytes, ASSISTANT_TRANSPORT_LIMITS.requestBytes);
    // No caller-controlled file name or directory is used.
    const file = path.join(this.directory, `clipboard-${randomUUID()}.${ASSET_TYPES[args.mime]}`);
    this.assertDirectory();
    fs.writeFileSync(file, bytes, { flag: "wx" });
    this.records.push({ file, identity: identity(fs.statSync(file, { bigint: true })), digest: createHash("sha256").update(bytes).digest("hex"), ...(args.id ? { owner: args.id } : {}) });
    try { this.persist(); }
    catch (error) { this.records.pop(); fs.unlinkSync(file); throw error; }
    return { path: file, name: path.basename(file), kind: "image", pastedImage: true } as AssistantFileReference;
  }
  reference(file: string, owner?: string): AssistantFileReference | undefined {
    const record = this.records.find(record => record.file === file);
    if (!record) return;
    if (record.owner && record.owner !== owner) throw new Error("Attachment belongs to another conversation.");
    this.bytes(record);
    return { path: file, name: path.basename(file), kind: "image", pastedImage: true };
  }
  claim(files: string[], owner: string) {
    if (!files.some(file => this.records.some(record => record.file === file))) return;
    for (const file of files) {
      const record = this.records.find(record => record.file === file);
      if (record) { this.reference(file, owner); record.owner = owner; }
    }
    this.persist();
  }
  owned(owner: string) { return this.records.filter(record => record.owner === owner); }
  remove(owner: string) { this.prune(record => record.owner === owner); }
  discardDrafts() { this.prune(record => !record.owner); }
  private prune(matches: (record: Record) => boolean) {
    if (!this.records.some(matches)) return;
    for (const record of this.records.filter(matches)) {
      try { this.bytes(record); fs.unlinkSync(record.file); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    this.records = this.records.filter(record => !matches(record));
    this.persist();
  }
  images(files: AssistantFileReference[]) {
    return files.filter(file => this.records.some(record => record.file === file.path)).map(file => {
      const record = this.records.find(record => record.file === file.path)!;
      const mimeType = Object.entries(ASSET_TYPES).find(([, extension]) => file.path.endsWith(`.${extension}`))![0];
      return { type: "image" as const, mimeType, data: this.bytes(record).toString("base64") };
    });
  }
}
