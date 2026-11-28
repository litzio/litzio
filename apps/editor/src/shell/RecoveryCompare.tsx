import { getHostClient, type HostClient } from "../host-client.ts";
import { useCallback, useMemo } from "react";
import { createDocumentRequests } from "../document-session.ts";
import { i18n } from "../i18n.ts";
import { prepareRecovery, recoverySaveRequest, requestRecoveryPreview } from "../recovery-restore.ts";
import { recoveryText, type RecoveryRecord } from "../recovery-storage.ts";
import { toTiptapDocument } from "../tiptap-document.ts";
import type { DocumentFileResponse, SaveRequest } from "../../shared/document-protocol.ts";
import SourceCompare, { type Comparison } from "./SourceCompare.tsx";

async function compare(record: RecoveryRecord, signal: AbortSignal, client: HostClient): Promise<Comparison> {
  let save: SaveRequest | undefined;
  let bibliography: DocumentFileResponse["bibliography"], bibliographyRoot: string | undefined;
  let fallback = "";
  try {
    const snapshot = prepareRecovery(record);
    if (snapshot.kind === "text") {
      const result = await requestRecoveryPreview(client, record.path, undefined, signal);
      return { before: result.disk?.source ?? "", after: snapshot.text, fallback: "",
        changed: Boolean(result.disk && result.disk.revision !== snapshot.file.revision), missing: result.disk === null };
    }
    bibliography = snapshot.file.bibliography;
    bibliographyRoot = snapshot.file.bibliographyRoot;
    save = recoverySaveRequest(snapshot);
  } catch (error) { fallback = error instanceof Error ? error.message : String(error); }
  const result = await requestRecoveryPreview(client, record.path, save, signal);
  fallback ||= result.error ?? "";
  let before = result.disk?.source ?? "";
  let after = result.markdown ?? record.recoveryText;
  if (fallback) {
    if (result.disk) {
      if (!result.disk.document) throw new Error(result.disk.error);
      const editorDocument = toTiptapDocument(result.disk.document);
      // Identical salvage traversal to newly recorded recovery copies; no Markdown conversion.
      before = recoveryText({ file: { path: record.path, source: result.disk.source, revision: result.disk.revision, document: result.disk.document, endnotesInPlace: true, normalizationPending: false }, editor: { editorDocument, savedDocument: editorDocument } });
    }
    after = record.recoveryText;
  }
  if (!fallback && result.disk && bibliography?.declarations.length) {
    // Recovery stores declarations, never .bib bytes. Reuse the Read dependency boundary.
    bibliography = { ...bibliography, sources: await createDocumentRequests(client).requestBibliography(
      record.path, result.disk.revision, bibliography.declarations, bibliographyRoot, signal) };
  }
  const acknowledged = record.snapshot?.file?.revision;
  return { before, after, fallback, bibliography, changed: Boolean(result.disk && acknowledged && result.disk.revision !== acknowledged), missing: result.disk === null };
}

export default function RecoveryCompare({ record }: { record: RecoveryRecord }) {
  const client = useMemo(() => getHostClient(), []);
  const load = useCallback((signal: AbortSignal) => { return compare(record, signal, client); }, [record, client]);
  return <SourceCompare load={load} recovery visual={{ client, path: record.path,
    unsupported: record.snapshot?.kind === "text" ? i18n.t("Text sessions use Source comparison.") : undefined }} />;
}
