// Host authoring thread entry. Runs Core authoring unchanged; no file IO here.
import { parentPort } from "node:worker_threads";
import { authorDocument, DocumentAuthoringError } from "@litzio/core";

parentPort!.on("message", async ({ id, raw, imageAssets }: { id: number; raw: unknown; imageAssets: Record<string, string> }) => {
  try { parentPort!.postMessage({ id, result: await authorDocument(raw, imageAssets) }); }
  catch (error) {
    parentPort!.postMessage({ id, error: error instanceof DocumentAuthoringError ? { code: error.code, diagnostics: error.diagnostics }
      : { message: error instanceof Error ? error.message : String(error) } });
  }
});
