import { getSchema } from "@tiptap/core";
import { createEditorExtensions } from "./editor-schema.tsx";
import { prepareEditorSnapshot } from "./editor-snapshot.ts";
import { toTiptapDocument } from "./tiptap-document.ts";
import { RECOVERY_VERSION, recoveryStorage, type RecoveryRecord } from "./recovery-storage.ts";
import type { SessionSnapshot } from "./DocumentTab.tsx";
import type { HostClient } from "./host-client.ts";
import { readLocalWriteStatus } from "./useLocalWriteVerification.ts";

/** Reopening may find a receipt the closed tab could not observe. */
export async function discardConfirmedRecovery(record: RecoveryRecord, client: HostClient): Promise<boolean> {
  const snapshot = record.snapshot;
  if (record.version !== RECOVERY_VERSION || !snapshot || snapshot.kind === "text" ||
      typeof record.path !== "string" || snapshot.file?.path !== record.path) return false;
  const candidate = snapshot.candidateRevision;
  if (typeof candidate !== "string" || !/^[a-f0-9]{64}$/.test(candidate)) return false;
  try {
    const read = () => readLocalWriteStatus(client, record.path, candidate);
    let result = await read();
    if (result?.state === "pending") {
      await new Promise(resolve => setTimeout(resolve, 500));
      result = await read();
    }
    return (result?.state === "corrected" || (result?.state === "done" && result.verified === true))
      ? await recoveryStorage.discardConfirmed(record) : false;
  } catch { return false; }
}

export function prepareRecovery(record: RecoveryRecord): SessionSnapshot {
  if (record.version !== RECOVERY_VERSION || "hostId" in record) throw new Error("This recovery format is not supported by this editor version.");
  const snapshot = record.snapshot;
  if (snapshot?.kind === "text") {
    if (snapshot.file?.kind !== "text" || typeof record.id !== "string" || !record.id ||
        typeof record.path !== "string" || !/\.(md|txt)$/i.test(record.path) || snapshot.file.path !== record.path ||
        typeof snapshot.file.source !== "string" || typeof snapshot.text !== "string" ||
        typeof snapshot.savedSource !== "string" || snapshot.file.source !== snapshot.savedSource ||
        !/^[a-f0-9]{64}$/.test(snapshot.file.revision) || "editor" in snapshot || "savedEdits" in snapshot || "document" in snapshot.file) {
      throw new Error("The recovery opening source or saved checkpoint is incomplete.");
    }
    return structuredClone(snapshot);
  }
  if (typeof record.id !== "string" || !record.id || typeof record.path !== "string" || !record.path ||
      !snapshot?.file || (snapshot.file as { kind?: string }).kind === "text" || typeof snapshot.file.source !== "string" ||
      !Array.isArray(snapshot.file.document?.blocks) ||
      !/^[a-f0-9]{64}$/.test(snapshot.file.revision) || snapshot.file.path !== record.path ||
      (snapshot.savedEdits !== undefined && (!snapshot.savedEdits || typeof snapshot.savedEdits !== "object" || Array.isArray(snapshot.savedEdits)))) {
    throw new Error("The recovery opening source or saved checkpoint is incomplete.");
  }
  const opening = toTiptapDocument(snapshot.file.document);
  const schema = getSchema(createEditorExtensions(opening, () => {}));
  return { ...structuredClone(snapshot), editor: prepareEditorSnapshot(schema, opening, snapshot.editor) };
}
