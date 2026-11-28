import { parentPort } from "node:worker_threads";
import { textRevision } from "@litzio/file-commit";
import { citationReport, type Document, type LocalWriteBaseline } from "@litzio/core";
import { readModel } from "./document-replay.ts";
import { DocumentSaveCache } from "./document-save-cache.ts";
import { prepareDocumentSave } from "./document-save-compute.ts";
import { documentDiagnostic, saveDiagnostic, type DocumentWork, type DocumentWorkReply, type SaveWork } from "./document-worker-protocol.ts";
import { changedBlocks, describeBlocks } from "./document-save-describe.ts";
import { localEdit } from "./document-local-edit.ts";
import { SaveContentError } from "../shared/save-error.ts";

/** The accepted model's nodes of the blocks this Save changed, when asked and the structure stayed. */
function described(work: SaveWork, disk: string, model: () => Document) {
  if (!work.describe) return {};
  const { path: _path, base, revision: _revision, ...edits } = work.request;
  const changed = changedBlocks(base.source === disk ? {} : base.savedEdits ?? {}, edits);
  return changed ? { blocks: describeBlocks(model(), changed) } : {};
}

const port = parentPort!;
const cache = new DocumentSaveCache(undefined, undefined, process.env.LITZIO_LOCAL_WRITE !== "0");
// Temporary #1986 verification state. A provisional model never enters the approval cache.
const candidates = new Map<string, LocalWriteBaseline>();
// The Host settles a prepared Save on this port before dispatching the next
// calculation. A failed commit discards the candidate instead of caching it.
let rememberCommitted: (() => void) | undefined;

port.on("message", (work: DocumentWork | { kind: "settle-save"; committed: boolean }) => {
  const previous = rememberCommitted;
  rememberCommitted = undefined;
  if (work.kind === "settle-save") {
    if (work.committed) previous?.();
    return;
  }
  const reply = (message: DocumentWorkReply) => port.postMessage(message);
  let fallback: string | undefined;
  try {
    switch (work.kind) {
      case "open": {
        let result;
        try { result = readModel(cache.open(work.path, work.source)); }
        catch { /* An unsupported Markdown file opens as text. */ }
        reply({ result });
        break;
      }
      case "bibliography":
        reply({ result: readModel(cache.opening(work.path, work.source) ?? work.source).bibliography.declarations });
        break;
      case "save": {
        const { path, disk, request } = work;
        const { path: _path, base, revision, ...edits } = request;
        fallback = work.local ? "no-confirmed-baseline" : undefined;
        if (work.local) {
          const opening = cache.opening(path, base.source);
          const baseline = cache.baseline(path, base.source, base.savedEdits, { source: disk, revision });
          if (opening && baseline) {
            try {
              const bibliography = edits.bibliography || base.savedEdits?.bibliography
                ? citationReport(opening.original).bibliography : [];
              const change = localEdit(opening.editable, bibliography, base.source === disk ? {} : base.savedEdits!, edits);
              const result = "reason" in change ? change : baseline.write(change.edit);
              if ("reason" in change) fallback = change.reason;
              else if ("reason" in result) fallback = result.reason;
              else {
                const { markdown, kind, blockCount } = result;
                rememberCommitted = () => candidates.set(path, result.baseline);
                reply({ result: { markdown, revision: textRevision(markdown), normalizedLineCount: 0, localWrite: { kind, blockCount, path: change.edit.path },
                  ...described(work, disk, () => result.baseline.model) } });
                break;
              }
            } catch { fallback = "unproven-edit"; }
          }
        }
        const { saved, snapshot, source, normalizedLineCount } = prepareDocumentSave(disk, revision, request, { path, cache });
        rememberCommitted = () => cache.remember(path, source, snapshot, edits, saved);
        reply({ result: { markdown: saved.markdown, revision: saved.revision, normalizedLineCount, fallback, ...described(work, disk, () => saved.document) } });
        break;
      }
      case "verify-local-write": {
        const { path, disk, request } = work.save;
        const candidate = candidates.get(path);
        candidates.delete(path);
        try {
          const { saved, snapshot, source } = prepareDocumentSave(disk, request.revision, request, { path, cache });
          if (saved.markdown !== work.expected) {
            reply({ result: { outcome: "different", markdown: saved.markdown, revision: saved.revision } });
            break;
          }
          const { path: _path, base: _base, revision: _revision, ...edits } = request;
          rememberCommitted = () => cache.remember(path, source, snapshot, edits, saved, candidate);
          reply({ result: { outcome: "equal" } });
        } catch (error) {
          if (!(error instanceof SaveContentError)) throw error;
          reply({ result: { outcome: "rejected", ...saveDiagnostic(error) } });
        }
        break;
      }
    }
  } catch (error) {
    reply({ error: documentDiagnostic(error), fallback });
  }
});
