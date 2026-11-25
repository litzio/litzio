import { createHash } from "node:crypto";
import { LocalWriteBaseline } from "@litzio/core";
import { serialize } from "node:v8";
import type { SupportedEdits } from "../shared/document-protocol.ts";
import { prepareReplay, type replayEdits } from "./document-replay.ts";

type Snapshot = ReturnType<typeof prepareReplay>;
type Opening = { source: string; snapshot: Snapshot; bytes: number; baseline?: LocalWriteBaseline };
type Saved = ReturnType<typeof replayEdits> & { revision: string };
type Approval = { openingFingerprint: string; editsFingerprint: string; saved: Saved; bytes: number; baseline?: LocalWriteBaseline };
type Entry = { opening?: Opening; approval?: Approval; bytes: number };

function fingerprint(value: string | Uint8Array): string {
  // Hash UTF-16 so an unpaired surrogate in a submitted string cannot alias U+FFFD.
  const hash = createHash("sha256");
  return (typeof value === "string" ? hash.update(value, "utf16le") : hash.update(value)).digest("hex");
}

function editsFingerprint(edits: SupportedEdits): string | undefined {
  // Preserve the parsed JSON value exactly, including keys, array order and numbers.
  // JSON.stringify would collapse values such as an overflowing number and null.
  try { return fingerprint(serialize(edits)); }
  catch { return undefined; }
}

function payloadBytes(value: unknown): number {
  try { return serialize(value).byteLength; }
  catch { return Infinity; }
}

/** A Host-local, disposable memo. File revisions always come from actual disk bytes. */
export class DocumentSaveCache {
  private readonly entries = new Map<string, Entry>();
  private bytes = 0;

  constructor(private readonly maxEntries = 16, private readonly maxBytes = 64 * 1024 * 1024,
    private readonly localWrite = false) {}

  opening(path: string, source: string): Snapshot | undefined {
    const opening = this.entries.get(path)?.opening;
    return opening?.source === source ? opening.snapshot : undefined;
  }

  open(path: string, source: string): Snapshot {
    const entry = this.entries.get(path);
    if (entry?.opening?.source === source) return entry.opening.snapshot;
    const snapshot = prepareReplay(source);
    const baseline = this.localWrite ? LocalWriteBaseline.fromCanonical(source, snapshot.original) : undefined;
    this.set(path, this.measureOpening(source, snapshot, baseline), entry?.approval);
    return snapshot;
  }

  approved(path: string, source: string, edits: SupportedEdits, disk: { source: string; revision: string }): Saved | undefined {
    return this.approval(path, source, edits, disk)?.saved;
  }

  baseline(path: string, source: string, edits: SupportedEdits | undefined, disk: { source: string; revision: string }) {
    if (source !== disk.source) return edits && this.approval(path, source, edits, disk)?.baseline;
    const opening = this.entries.get(path)?.opening;
    return opening?.source === source ? opening.baseline : undefined;
  }

  private approval(path: string, source: string, edits: SupportedEdits, disk: { source: string; revision: string }) {
    const entry = this.entries.get(path)?.approval;
    if (entry?.saved.revision !== disk.revision || entry.saved.markdown !== disk.source ||
        entry.openingFingerprint !== fingerprint(source) || entry.editsFingerprint !== editsFingerprint(edits)) return;
    return entry;
  }

  remember(path: string, source: string, snapshot: Snapshot, edits: SupportedEdits, saved: Saved,
    confirmed?: LocalWriteBaseline): void {
    const editsKey = editsFingerprint(edits);
    const opening = this.entries.get(path)?.opening;
    const baseline = confirmed ?? (this.localWrite ? LocalWriteBaseline.fromCanonical(saved.markdown, saved.document) : undefined);
    const approval = editsKey === undefined ? undefined : {
      openingFingerprint: fingerprint(source),
      editsFingerprint: editsKey,
      saved,
      baseline,
      bytes: 256 + saved.markdown.length * 2 + payloadBytes(saved.document) + (baseline ? payloadBytes(baseline) : 0),
    };
    this.set(path, opening?.snapshot === snapshot ? opening : this.measureOpening(source, snapshot), approval);
  }

  private measureOpening(source: string, snapshot: Snapshot, baseline?: LocalWriteBaseline): Opening {
    return { source, snapshot, baseline, bytes: source.length * 2 + payloadBytes(snapshot) + (baseline ? payloadBytes(baseline) : 0) };
  }

  private set(path: string, opening: Opening | undefined, approval: Approval | undefined): void {
    this.delete(path);
    const pathBytes = path.length * 2;
    if (opening && pathBytes + opening.bytes > this.maxBytes) opening = undefined;
    if (approval && pathBytes + (opening?.bytes ?? 0) + approval.bytes > this.maxBytes) approval = undefined;
    if (!opening && !approval) return;
    const bytes = pathBytes + (opening?.bytes ?? 0) + (approval?.bytes ?? 0);
    this.entries.set(path, { opening, approval, bytes });
    this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      this.delete(this.entries.keys().next().value!);
    }
  }

  private delete(path: string): void {
    this.bytes -= this.entries.get(path)?.bytes ?? 0;
    this.entries.delete(path);
  }
}
