import { parentPort } from "node:worker_threads";
import { readModel } from "./document-replay.ts";
import { DocumentSaveCache } from "./document-save-cache.ts";
import { prepareDocumentSave } from "./document-save-compute.ts";
import { documentDiagnostic, type DocumentWork, type DocumentWorkReply } from "./document-worker-protocol.ts";

const port = parentPort!;
const cache = new DocumentSaveCache();
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
      case "check-text": {
        let native = false;
        try { readModel(work.source); native = true; }
        catch { /* Same admission as Editor Open. */ }
        reply({ result: native });
        break;
      }
      case "save": {
        const { path, disk, request } = work;
        const { saved, snapshot, source } = prepareDocumentSave(disk, request.revision, request, { path, cache });
        const { path: _path, base: _base, revision: _revision, ...edits } = request;
        rememberCommitted = () => cache.remember(path, source, snapshot, edits, saved);
        reply({ result: { markdown: saved.markdown, revision: saved.revision } });
        break;
      }
    }
  } catch (error) {
    reply({ error: documentDiagnostic(error) });
  }
});
