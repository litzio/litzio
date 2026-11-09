import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, mkdirSync, copyFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { textRevision } from "@litzio/file-commit";
import { GeneratedDocuments } from "../server/plugins/generated-documents.ts";
import { RootAccess } from "../server/file-access.ts";
import { loadDocumentFile } from "../server/document-reader.ts";

test("generated document official writes keep source state first, reject conflicts and resume from files", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-generated-test-"));
  const previousStore = process.env.LITZIO_GENERATED_DOCUMENTS_SETTINGS_FILE;
  process.env.LITZIO_GENERATED_DOCUMENTS_SETTINGS_FILE = path.join(root, "host-state", "generated");
  const source = path.join(root, "source.bin"), document = path.join(root, "result.md");
  writeFileSync(source, JSON.stringify({ original: "immutable", edits: [] }));
  let failBuild = false, raceDocument = false, raceSource = false;
  const provider = async (_op: string, input: any) => {
    const record = JSON.parse(readFileSync(input.file, "utf8"));
    if (input.mode === "patch") {
      record.edits.push(...input.patches); writeFileSync(input.resultFile.path, JSON.stringify(record));
      if (raceSource) writeFileSync(source, "competitor source");
    }
    if (input.mode === "build") {
      if (failBuild) return { error: "injected failure" };
      if (raceDocument) writeFileSync(document, "competitor document");
      return { result: { authoring: { inputs: [{ key: "body", blocks: [{ kind: "paragraph", text: record.edits.at(-1)?.text ?? record.original }] }] }, images: [] } };
    }
    return { result: { record, items: [] } };
  };
  const access = new RootAccess([root]);
  const service = () => new GeneratedDocuments(access, () => ({ operation: "fixture.provider", version: 1, assertCurrent() {} }), provider);
  let host = service();
  const read = () => host.execute({ action: "generated-read", root, document: "result.md" });
  const patch = async (text: string, baseline = undefined as any) => host.execute({ action: "generated-patch", root, document: "result.md", baseline: baseline ?? (await read()).baseline, patches: [{ text }], requestId: randomUUID() });
  try {
    const opened = await host.execute({ action: "generated-open", root, document: "result.md", plugin: "fixture", job: "import", source: "source.bin",
      baseline: { sourceRevision: textRevision(readFileSync(source, "utf8")), documentRevision: null, linkRevision: null }, requestId: randomUUID() });
    assert.equal(opened.state, "generated");
    assert.equal(loadDocumentFile(document, access).managedGenerated, true);
    assert.equal((await read()).state, "generated");
    const old = (await read()).baseline;
    const first = await patch("corrected"); assert.equal(first.correctionsSaved, true); assert.equal(first.documentRegenerated, true);
    const bytes = readFileSync(source);
    assert.equal((await patch("stale", old)).state, "failed"); assert.deepEqual(readFileSync(source), bytes);
    failBuild = true;
    const failed = await patch("saved before failure");
    assert.equal(failed.state, "regeneration-required"); assert.equal(failed.correctionsSaved, true); assert.equal(failed.documentRegenerated, false);
    assert.match(readFileSync(document, "utf8"), /corrected/);
    assert.equal((await read()).state, "regeneration-required");
    assert.deepEqual(await host.execute({ action: "generated-status", requestId: failed.receipt.requestId }), failed);
    host = service(); failBuild = false;
    assert.equal((await host.execute({ action: "generated-status", requestId: failed.receipt.requestId })).state, "unknown");
    const current = await read();
    assert.equal((await host.execute({ action: "generated-regenerate", root, document: "result.md", baseline: current.baseline, requestId: randomUUID() })).state, "generated");
    assert.match(readFileSync(document, "utf8"), /saved before failure/);
    assert.equal((await patch("after restart")).state, "generated");
    raceDocument = true;
    const collision = await patch("durable correction");
    assert.equal(collision.correctionsSaved, true); assert.equal(collision.documentRegenerated, false);
    assert.equal(readFileSync(document, "utf8"), "competitor document"); raceDocument = false;
    raceSource = true;
    const sourceCollision = await patch("rejected correction");
    assert.equal(sourceCollision.correctionsSaved, false); assert.equal(readFileSync(source, "utf8"), "competitor source");
    assert.ok(!readdirSync(root).some(file => file.endsWith(".tmp")));
    // A copied source can be explicitly reconnected without a prior Host registry or sidecar.
    const copy = path.join(root, "handoff"); mkdirSync(copy); writeFileSync(source, bytes); copyFileSync(source, path.join(copy, "source.bin"));
    raceSource = false;
    const copied = await host.execute({ action: "generated-open", root: copy, document: "result.md", source: "source.bin", plugin: "fixture", job: "import", baseline: { sourceRevision: textRevision(bytes.toString()), documentRevision: null, linkRevision: null }, requestId: randomUUID() });
    assert.equal(copied.state, "generated"); assert.match(readFileSync(path.join(copy, "result.md"), "utf8"), /corrected/);
  } finally {
    if (previousStore === undefined) delete process.env.LITZIO_GENERATED_DOCUMENTS_SETTINGS_FILE; else process.env.LITZIO_GENERATED_DOCUMENTS_SETTINGS_FILE = previousStore;
    rmSync(root, { recursive: true, force: true });
  }
});
