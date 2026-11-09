import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, mkdirSync, copyFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { commitFile, textRevision } from "@litzio/file-commit";
import { GeneratedDocuments } from "../server/plugins/generated-documents.ts";
import { RootAccess } from "../server/file-access.ts";
import { loadDocumentFile } from "../server/document-reader.ts";
import { generatedDocumentIdentity, isManagedGeneratedDocument } from "../server/generated-document.ts";

test("filesystem-distinct Unicode document names keep separate connections and admission locks across atomic Save", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-generated-unicode-"));
  const previous = process.env.LITZIO_GENERATED_DOCUMENTS_SETTINGS_FILE;
  process.env.LITZIO_GENERATED_DOCUMENTS_SETTINGS_FILE = path.join(root, "state", "generated");
  const ordinary = path.join(root, "k.md"), managed = path.join(root, "\u212a.md");
  const sourceA = path.join(root, "a.bin"), sourceB = path.join(root, "b.bin");
  writeFileSync(ordinary, "ordinary document"); writeFileSync(managed, "separate document");
  writeFileSync(sourceA, "source A"); writeFileSync(sourceB, "source B");
  let hold = false, release = () => {};
  const host = new GeneratedDocuments(new RootAccess([root]), () => ({ operation: "fixture.provider", version: 1, assertCurrent() {} }), async (_operation, raw) => {
    const input = raw as { mode: string; file: string };
    if (hold && input.mode === "read" && input.file === sourceB) await new Promise<void>(resolve => { release = resolve; });
    return { result: input.mode === "build" ? { authoring: { inputs: [{ key: "body", blocks: [{ kind: "paragraph", text: "generated from source" }] }] }, images: [] } : { record: {}, items: [] } };
  });
  const open = (document: string, source: string) => host.execute({ action: "generated-open", root, document, source,
    plugin: "fixture", job: "import", baseline: { sourceRevision: textRevision(readFileSync(path.join(root, source), "utf8")), documentRevision: textRevision(readFileSync(path.join(root, document), "utf8")), linkRevision: null }, requestId: randomUUID() });
  const read = (document: string) => host.execute({ action: "generated-read", root, document });
  try {
    const connected = await open("\u212a.md", "b.bin");
    assert.equal(connected.state, "generated");
    assert.notEqual(generatedDocumentIdentity(ordinary), generatedDocumentIdentity(managed));
    assert.equal(isManagedGeneratedDocument(ordinary), false);
    await assert.rejects(read("k.md"), { code: "ENOENT" });
    await assert.rejects(host.execute({ action: "generated-regenerate", root, document: "k.md", requestId: randomUUID(),
      baseline: { sourceRevision: connected.baseline.sourceRevision, documentRevision: textRevision("ordinary document"), linkRevision: connected.baseline.linkRevision } }), { code: "ENOENT" });
    assert.equal(readFileSync(ordinary, "utf8"), "ordinary document");
    assert.equal((await open("k.md", "a.bin")).state, "generated");
    const identity = generatedDocumentIdentity(managed), before = readFileSync(managed, "utf8");
    commitFile(managed, before + "\nDirect edit.\n", textRevision(before));
    assert.equal(generatedDocumentIdentity(managed), identity);
    assert.equal(isManagedGeneratedDocument(managed), true);
    assert.equal((await read("\u212a.md")).state, "externally-modified");
    if (process.platform === "win32") {
      assert.equal(generatedDocumentIdentity(path.join(root, "\u212a.MD")), identity);
      assert.equal(isManagedGeneratedDocument(path.join(root, "\u212a.MD")), true);
    }
    hold = true;
    const pending = read("\u212a.md");
    try {
      assert.equal((await read("k.md")).state, "generated");
      if (process.platform === "win32") await assert.rejects(read("\u212a.MD"), /operation in progress/);
    } finally { hold = false; release(); await pending; }
    const newRequest = (document: string, source: string) => ({ action: "generated-open", root, document, source, plugin: "fixture", job: "import", requestId: randomUUID(),
      baseline: { sourceRevision: textRevision(readFileSync(path.join(root, source), "utf8")), documentRevision: null, linkRevision: null } });
    hold = true;
    const creating = host.execute(newRequest("fresh.md", "b.bin"));
    try { await assert.rejects(host.execute(newRequest("FRESH.MD", "a.bin")), /operation in progress/); }
    finally { hold = false; release(); assert.equal((await creating).state, "generated"); }
    if (process.platform === "win32") assert.equal(generatedDocumentIdentity(path.join(root, "fresh.md")), generatedDocumentIdentity(path.join(root, "FRESH.MD")));
  } finally {
    if (previous === undefined) delete process.env.LITZIO_GENERATED_DOCUMENTS_SETTINGS_FILE; else process.env.LITZIO_GENERATED_DOCUMENTS_SETTINGS_FILE = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

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
