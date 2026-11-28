import { countNormalizedLines } from "@litzio/core";
import { textRevision as documentRevision } from "@litzio/file-commit";
import type { SaveRequest, SupportedEdits } from "../shared/document-protocol.ts";
import { prepareReplay, replayEdits, SaveContentError } from "./document-replay.ts";
import type { DocumentSaveCache } from "./document-save-cache.ts";

/** Internal file helpers may replay directly against a supplied disk snapshot. HTTP always requires a session. */
export type FileSaveRequest = SupportedEdits & { path?: string; revision?: string; base?: SaveRequest["base"] };

const DOCUMENT_CONFLICT_MESSAGE = "Document changed outside the editor. Your edits are kept. Use Source to copy applied content, or Reload to discard local changes and open the disk version.";

export class DocumentConflictError extends Error {
  constructor() {
    super(DOCUMENT_CONFLICT_MESSAGE);
    this.name = "DocumentConflictError";
  }
}

export function verifySaveRevision(source: string, expectedRevision: string | undefined): string {
  const revision = documentRevision(source);
  if (expectedRevision !== revision) throw new DocumentConflictError();
  return revision;
}

/** Calculate from the disk snapshot without replacing the file or remembering an approval. */
export function prepareDocumentSave(disk: string, revision: string, request: FileSaveRequest, memo?: { path: string; cache: DocumentSaveCache }) {
  const { base } = request;
  if (base !== undefined && (!base || typeof base.source !== "string")) throw new Error("invalid session source");
  const source = base?.source ?? disk;
  let snapshot: ReturnType<typeof prepareReplay> | undefined;
  const opening = () => snapshot ??= memo?.cache.opening(memo.path, source) ?? prepareReplay(source);
  // A different opening is admissible only if the previously approved edits reproduce
  // actual disk bytes, from a checked memo or a fresh replay.
  if (source !== disk) {
    const edits = base?.savedEdits;
    if (!edits) throw new DocumentConflictError();
    const previous = memo?.cache.approved(memo.path, source, edits, { source: disk, revision }) ?? replayEdits(opening(), edits);
    if (previous.markdown !== disk) throw new DocumentConflictError();
  }
  const result = replayCurrent(opening, request);
  // When disk differs from the opening source, the checked previous replay above
  // already proved that disk is a canonical write.
  const canonical = source === disk ? result.snapshot.normalizationSource : undefined;
  const normalizedLineCount = canonical === undefined ? 0 : countNormalizedLines(disk, canonical);
  return { source, ...result, normalizedLineCount };
}

export function replayCurrent(opening: () => ReturnType<typeof prepareReplay>, edits: SupportedEdits) {
  try {
    const snapshot = opening();
    const result = replayEdits(snapshot, edits);
    return { snapshot, saved: { ...result, revision: documentRevision(result.markdown) } };
  } catch (error) {
    if (error instanceof SaveContentError) throw error;
    throw new SaveContentError(error instanceof Error ? error.message : String(error), undefined, { cause: error });
  }
}
