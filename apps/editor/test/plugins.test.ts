import { publicOperationResult } from "../server/plugins/operation-result.ts";
import { rowSchema, completedReviewSchema } from "@litzio/plugin-sdk";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { artifactDigest } from "../server/plugins/artifact-digest.mjs";
import { PluginHost } from "../server/plugins/plugin-host.ts";
import { executePluginTool } from "../server/assistant-plugin-tools.ts";
import { DOCUMENT_AUTHORING_LIMITS as limits, getEditableDocument, parse } from "@litzio/core";

// Interpretation/loss/limit tests stay in-process. Existing http-plugins owns
// SDK runtime admission, official K1 storage and the browser result boundary.
async function doclingConverter() {
  const source = readFileSync(new URL("../../../community-plugins/docling/document.js", import.meta.url), "utf8");
  const review = readFileSync(new URL("../../../community-plugins/docling/review.js", import.meta.url), "utf8");
  const reviewUrl = "data:text/javascript;base64," + Buffer.from(review.replace('"@litzio/plugin-sdk"', JSON.stringify(import.meta.resolve("@litzio/plugin-sdk")))).toString("base64");
  const converter = await import("data:text/javascript;base64," + Buffer.from(source.replace('"./review.js"', JSON.stringify(reviewUrl)).replace('"@litzio/plugin-sdk"', JSON.stringify(import.meta.resolve("@litzio/plugin-sdk")))).toString("base64"));
  return {...converter,...await import(reviewUrl)};
}
const doclingFixture = () => JSON.parse(readFileSync(new URL("../../../community-plugins/docling/fixtures/document.json", import.meta.url), "utf8"));

test("Docling corrections replay by self_ref with last assignment winning before the existing converter", async () => {
  const { convertDocument } = await doclingConverter();
  const original = doclingFixture(), before = JSON.stringify(original);
  const result = await convertDocument(original, "a".repeat(64), [
    { type: "text", self_ref: "#/texts/4", text: "superseded" },
    { type: "text", self_ref: "#/texts/4", text: "Corrected text" },
    { type: "kind", self_ref: "#/texts/4", kind: "heading", level: 6 },
    { type: "kind", self_ref: "#/texts/1", kind: "paragraph" },
    { type: "exclude", self_ref: "#/groups/0", excluded: true },
    { type: "exclude", self_ref: "#/texts/1", excluded: false },
    { type: "cell", self_ref: "#/tables/0", cell: 0, text: "Corrected merged cell" },
  ]);
  assert.equal(JSON.stringify(original), before);
  assert.match(result.source, /###### Corrected text/);
  assert.doesNotMatch(result.source, /First item|Nested item|superseded|## Converted PDF/);
  assert.match(result.source, /Converted PDF/);
  assert.match(result.source, /Corrected merged cell/);
  const roles = doclingFixture(); roles.pictures[0].children = [];
  const reclassified = await convertDocument(roles, "a".repeat(64), [
    { type: "kind", self_ref: "#/texts/0", kind: "heading", level: 1 },
    { type: "kind", self_ref: "#/texts/7", kind: "heading", level: 3 },
  ]);
  assert.match(reclassified.source, /# RUNNING HEADER/);
  assert.match(reclassified.source, /### Figure 1: Original caption/);
  for (const patch of [{ type: "kind", self_ref: "#/texts/4", kind: "heading", level: 7 }, { type: "cell", self_ref: "#/tables/0", cell: 9, text: "bad" }, { type: "text", self_ref: "#/texts/999", text: "bad" }]) {
    await assert.rejects(convertDocument(original, "a".repeat(64), [patch]));
  }
});

test("Docling comparison uses immutable provenance, final targets and portable progress only", async () => {
  const {convertDocument,comparison,setProgress,emptyReview} = await doclingConverter();
  const doc = doclingFixture(), original = JSON.stringify(doc), record = emptyReview();
  doc.texts[1].prov = [{page_no:1,bbox:{l:10,t:800,r:100,b:780,coord_origin:"BOTTOMLEFT"}}];
  doc.texts[0].prov = [{page_no:1,bbox:{l:10,t:10,r:100,b:20,coord_origin:"TOPLEFT"}}];
  const authored = await convertDocument(doc,"source");
  const material = completedReviewSchema.parse(comparison({document:doc},record,authored.report,{generation:"generation",sourceRevision:"revision",result:{revision:authored.report.documentRevision}}));
  assert.deepEqual(material.pages[0].regions.find(r=>r.id === "region-texts-1-0")!.bbox,[10,42,100,62]);
  assert.ok(material.pages[0].regions.some(r=>r.status === "decoration"));
  assert.ok(material.mapping!.entries.some(e=>e.targets.length === 0));
  assert.ok(material.mapping!.entries.some(e=>e.targets.some(t=>t.documentRevision === authored.report.documentRevision)));
  setProgress(doc,record,{checkedPages:[1],lastPage:1});
  assert.deepEqual(record,{patches:[],checkedPages:[1],lastPage:1,approval:null});
  assert.throws(()=>setProgress(doc,record,{checkedPages:[2],lastPage:2}),/Invalid/);
  assert.throws(()=>setProgress(doc,record,{checkedPages:[1,1],lastPage:1}),/Invalid/);
  delete doc.texts[1].prov; delete doc.texts[0].prov;
  assert.equal(JSON.stringify(doc),original);
});

test("Docling converter preserves source identity, native blocks, shared targets and item losses without mutating original", async () => {
  const { convertDocument } = await doclingConverter();
  const doc = doclingFixture(), before = JSON.stringify(doc);
  const { source, report } = await convertDocument(doc, "a".repeat(64));
  assert.equal(JSON.stringify(doc), before);
  const blocks = getEditableDocument(parse(source)).blocks;
  assert.ok(source.includes("{table}"));
  assert.ok(source.includes("{figure}"));
  assert.ok(source.includes("print(1)"));
  assert.ok(source.includes("E = mc^2"));
  assert.ok(!source.includes("RUNNING HEADER"));
  const item = (ref: string) => report.items.find((item: any) => item.self_ref === ref);
  assert.equal(report.sourceHash, "a".repeat(64));
  assert.equal(item("#/texts/0").status, "furniture");
  assert.equal(item("#/texts/0").targets.length, 0);
  assert.deepEqual(item("#/pictures/0").targets, item("#/texts/7").targets);
  assert.deepEqual(item("#/tables/0").cells[0].positions, [{ row: 0, column: 0 }, { row: 0, column: 1 }]);
  assert.deepEqual(item("#/tables/0").cells[0].targets, [item("#/tables/0").targets[0]]);
  assert.deepEqual(item("#/texts/9").targets, item("#/tables/0").targets);
  for (const entry of report.items) for (const target of entry.targets) {
    assert.equal(target.documentRevision, report.documentRevision);
    assert.equal(target.documentHash, report.documentHash);
    assert.ok(blocks.some(block => JSON.stringify(block.path) === JSON.stringify(target.path)));
  }
  for (const kind of ["merged-cell", "multi-row-header", "nested-list", "picture-image", "unsupported"]) assert.ok(report.losses.some((loss: any) => loss.kind === kind));
  assert.match(report.summary, /병합 칸 반복 1/);
  assert.match(report.summary, /다단 헤더 계층 소실 1/);
  assert.doesNotMatch(report.summary, /(?:^| · )표 \d|(?:^| · )[^·]+ 0(?: · |$)/);
  const plain = { schema_name: "DoclingDocument", body: { children: [{ $ref: "#/texts/0" }] }, texts: [{ self_ref: "#/texts/0", label: "text", text: "Plain paragraph" }] };
  assert.equal((await convertDocument(plain, "a".repeat(64))).report.summary, "");
  const roles = doclingFixture();
  roles.tables[0].data.table_cells[0].row_header = true;
  roles.texts[2].marker = "a)";
  const roleSummary = (await convertDocument(roles, "a".repeat(64))).report.summary;
  assert.match(roleSummary, /표 셀 역할 소실 1/);
  assert.match(roleSummary, /목록 표식 미보존 1/);
  // Adjacent list items intentionally share the first item's native list target.
  doc.groups[1].children = [{ $ref: "#/texts/2" }, { $ref: "#/texts/3" }]; doc.groups.splice(2);
  doc.texts[3].marker = "4.";
  const combined = await convertDocument(doc, "a".repeat(64));
  assert.deepEqual(combined.report.items.find((i: any) => i.self_ref === "#/texts/2").targets, combined.report.items.find((i: any) => i.self_ref === "#/texts/3").targets);
  assert.equal((await convertDocument(doc, "a".repeat(64))).source, combined.source);
});

test("Docling caption numbers are conservative, kind-specific and duplicate-safe", async () => {
  const { readCaptionNumber, convertDocument } = await doclingConverter();
  for (const [text, kind, number, caption] of [
    ["Figure 6: Source caption", "figure", "6", "Source caption"], ["Fig. 2 Example", "figure", "2", "Example"],
    ["그림 3", "figure", "3", ""], ["Table 2-1. Values", "table", "2-1", "Values"], ["표 4: 값", "table", "4", "값"],
  ]) assert.deepEqual(readCaptionNumber(text, kind), { enumerator: number, caption });
  for (const text of ["Figure IV: Roman", "Figure A: Letter", "Table 2: Wrong kind", "Figure 2.1a: Suffix", "Figure 2/3: Ambiguous", "Figure 2 - 1: Ambiguous", "Figure 2 . 1: Ambiguous", "No source number"] ) {
    const value = readCaptionNumber(text, "figure");
    assert.equal(value.caption, text); assert.equal(value.enumerator, undefined); assert.ok(value.reason);
  }
  const doc = doclingFixture();
  const ref = `#/texts/${doc.texts.length}`;
  doc.texts.push({ self_ref: ref, label: "caption", text: "Figure 1: Duplicate" });
  doc.pictures.push({ self_ref: "#/pictures/1", label: "picture", captions: [{ $ref: ref }], children: [{ $ref: ref }] });
  doc.body.children.push({ $ref: "#/pictures/1" });
  const converted = await convertDocument(doc, "a".repeat(64));
  const figures = getEditableDocument(parse(converted.source)).blocks.filter((b: any) => b.block === "figure");
  assert.ok(figures.every((b: any) => b.enumerator === undefined && b.enumerated === false));
  assert.equal(converted.report.losses.filter((l: any) => l.kind === "caption-number").length, 2);
  assert.match(converted.source, /Figure 1: Original caption/);
});

test("Docling images use shared authoring and reports bind only to final Host targets", async () => {
  const { convertDocument } = await doclingConverter();
  const doc = doclingFixture(), png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
  doc.pictures[0].image = { uri: "data:image/png;base64," + png, mimetype: "image/png", dpi: 72, size: { width: 1, height: 1 } };
  const before = JSON.stringify(doc), value = await convertDocument(doc, "a".repeat(64));
  assert.equal(JSON.stringify(doc), before);
  assert.deepEqual(value.document.images, [{ key: "#/pictures/0", mime: "image/png", base64: png }]);
  assert.ok(!value.report.losses.some((l: any) => l.kind === "picture-image"));
  const { authorDocument } = await import("@litzio/core");
  const final = await authorDocument(value.document.authoring, { "#/pictures/0": "./assets/final.png" });
  const report = value.bindReport({ inputs: final.inputs, revision: final.documentRevision });
  assert.equal(report.documentRevision, final.documentRevision);
  assert.ok(report.items.flatMap((i: any) => i.targets).every((t: any) => t.documentRevision === final.documentRevision));
  assert.throws(() => value.bindReport({ inputs: [], revision: final.documentRevision }), /Final Host/);
  const wrong = structuredClone(final.inputs); wrong[0].key = "wrong";
  assert.throws(() => value.bindReport({ inputs: wrong, revision: final.documentRevision }), /Final Host/);
});

test("Docling converter refuses whole input on limits and invalid graph/grid instead of truncating", async () => {
  const { convertDocument } = await doclingConverter();
  const rejects = async (change: (doc: any) => void, reason: RegExp) => {
    const doc = doclingFixture(); change(doc);
    await assert.rejects(convertDocument(doc, "a".repeat(64)), (error: any) => reason.test(error.conversionReason));
  };
  await rejects(d => { d.tables[0].data.num_rows = 101; }, /100 rows/);
  await rejects(d => { d.tables[0].data.num_cols = 33; }, /32 columns/);
  await rejects(d => { d.tables[0].data.table_cells.push(d.tables[0].data.table_cells[0]); }, /Overlapping/);
  await rejects(d => { d.tables[0].data.table_cells[0].col_span = 1; }, /span/);
  await rejects(d => { d.body.children.push(d.body.children[0]); }, /Duplicate or cyclic/);
  await rejects(d => { d.body.children[0].$ref = "#/texts/999"; }, /Invalid source reference/);
  await rejects(d => { d.texts[4].text = "x".repeat(16385); }, /16384/);
  await rejects(d => {
    for (let i = 0; i < limits.inputs; i++) d.texts.push({ self_ref: `#/texts/${d.texts.length}`, label: "text", text: "Orphan" });
  }, new RegExp(`input limit.*${limits.inputs}`));
  await rejects(d => {
    for (let i = 0; i < Math.ceil(limits.bytes / 16000); i++) { const ref = `#/texts/${d.texts.length}`; d.texts.push({ self_ref: ref, label: "text", text: "x".repeat(16000) }); d.body.children.push({ $ref: ref }); }
  }, new RegExp(`byte limit.*${limits.bytes}`));
});
test("Docling envelope keeps original PDF/JSON hashes independent of the reserved opaque review entry", async () => {
  const archive = await import(new URL("../../../community-plugins/docling/archive.js", import.meta.url).href);
  const { PDF_PROFILE } = await import(new URL("../../../community-plugins/docling/conversion.js", import.meta.url).href);
  const sourceBytes = Buffer.from("%PDF-1.4 synthetic fixture");
  const bytes = archive.createDoclingArchiveFromResult({ sourceName: "fixture.pdf", sourceBytes, serverVersions: { "docling-serve": "1.32.0" }, openapiBytes: Buffer.from("{}"), profile: PDF_PROFILE,
    task: { id: "fixture", startedAt: "2026-11-09T00:00:00Z", completedAt: "2026-11-09T00:01:00Z" }, resultBody: Buffer.from(JSON.stringify({ status: "success", errors: [], document: { json_content: doclingFixture() } })) });
  const original = archive.readDoclingArchive(bytes);
  assert.ok(original.sourcePdf.equals(sourceBytes));
  assert.ok(!bytes.includes(Buffer.from("pages/1.png")));
  const reviewBytes = Buffer.from('{"opaque":"future review shape"}');
  const withReservedEntry = archive.createDoclingArchive({ manifest: original.manifest, documentJson: original.documentJson, sourceBytes, reviewBytes });
  const reread = archive.readDoclingArchive(withReservedEntry);
  const manifestBytes = Buffer.from(JSON.stringify(original.manifest) + "\n");
  const formatted = archive.readDoclingArchive(archive.createDoclingArchive({manifest:original.manifest,manifestBytes,documentJson:original.documentJson,sourceBytes,reviewBytes}));
  const saved = archive.readDoclingArchive(archive.rewriteReview(formatted,Buffer.from(JSON.stringify({patches:[],checkedPages:[1],lastPage:1,approval:null}))));
  assert.deepEqual(saved.manifestBytes,manifestBytes); assert.deepEqual(saved.sourcePdf,original.sourcePdf); assert.equal(saved.documentJson,original.documentJson);
  assert.deepEqual(reread.manifest, original.manifest);
  assert.equal(reread.documentJson, original.documentJson);
  assert.ok(reread.reviewBytes.equals(reviewBytes));
  assert.throws(() => archive.rewriteReview({...formatted,documentJson:formatted.documentJson+" "},reviewBytes), /Original changed/);
  assert.throws(() => archive.rewriteReview({...formatted,sourcePdf:Buffer.from("%PDF-tampered")},reviewBytes), /Original changed/);
  assert.throws(() => archive.rewriteReview({...formatted,manifestBytes:Buffer.from("{}")},reviewBytes), /Original changed/);
  assert.throws(() => archive.createDoclingArchive({ manifest: original.manifest, documentJson: original.documentJson, sourceBytes: Buffer.from("%PDF-tampered"), reviewBytes }), /Original PDF mismatch/);
  assert.throws(() => archive.createDoclingArchive({ manifest: original.manifest, documentJson: original.documentJson + " ", sourceBytes, reviewBytes }), /Invalid DoclingDocument/);
});

test("local artifact trust, activation, admission, drain, settings persistence and assistant activity", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugins-"));
  const directory = path.join(root, "artifact"); mkdirSync(directory);
  const manifest = { schemaVersion: 1, id: "litzio.onedrive", tier: "official", publisher: { id: "litzio", name: "Litzio" }, name: "Fixture", version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: { operations: [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "string" } }] }, settingsSchema: { type: "object", properties: { label: { type: "string" } }, additionalProperties: false } };
  writeFileSync(path.join(directory, "litzio-plugin.json"), JSON.stringify(manifest));
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
  writeFileSync(path.join(directory, "host.js"), `export function activate(c){return {operations:{read:async()=>{await new Promise(r=>setTimeout(r,50));return c.settings.label ?? "done"}},status:()=>({available:true,message:"Fixture",folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
  const host = new PluginHost(path.join(root, "state.json"), { officialPlugins: [] });
  try {
    await host.invoke("register", { directory });
    const collision = path.join(root, "collision"); mkdirSync(collision);
    writeFileSync(path.join(collision, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
    writeFileSync(path.join(collision, "host.js"), "throw new Error('Must not import conflicting plugin')");
    writeFileSync(path.join(collision, "litzio-plugin.json"), JSON.stringify({ ...manifest, id: "litzio", contributes: { operations: [{ ...manifest.contributes.operations[0], id: "onedrive.read" }] } }));
    await assert.rejects(host.invoke("register", { directory: collision }), /collision/);
    const registered = (await host.list())[0]!;
    assert.equal(registered.running, false); assert.equal(registered.official, false);
    await assert.rejects(host.invoke("enable", { id: manifest.id }), /trust/);
    await host.invoke("trust", { id: manifest.id, registrationId: registered.registrationId });
    await host.invoke("enable", { id: manifest.id });
    const admitted = host.invokeOperation("litzio.onedrive.read", {});
    const disabling = host.invoke("disable", { id: manifest.id });
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(host.invokeOperation("litzio.onedrive.read", {}), /disabled/);
    await disabling; assert.equal((await admitted).result, "done");
    await host.invoke("settings", { id: manifest.id, settings: { label: "saved" } });
    assert.deepEqual((await host.list())[0]?.settings, { label: "saved" });
    const activities: unknown[] = [];
    await executePluginTool(host, { action: "enable", id: manifest.id }, entry => { activities.push(entry); });
    assert.deepEqual(activities, [{ action: "enable", id: manifest.id, outcome: "success" }]);
    assert.equal((await host.list())[0]?.running, true);
    await executePluginTool(host, { action: "settings", id: manifest.id, settings: { label: "live" } }, () => {});
    assert.equal((await host.invokeOperation("litzio.onedrive.read", {})).result, "live");
    writeFileSync(path.join(directory, "extra.js"), "// updated artifact");
    await host.invoke("settings", { id: manifest.id, settings: { label: "recovered" } });
    assert.equal((await host.list())[0]!.trusted, true);
    assert.equal((await host.list())[0]?.running, true);
    assert.equal((await host.invokeOperation("litzio.onedrive.read", {})).result, "recovered");
    await host.invoke("disable", { id: manifest.id });
    const { statSync, utimesSync } = await import("node:fs");
    const entry = path.join(directory, "host.js"), metadata = statSync(entry);
    writeFileSync(entry, readFileSync(entry, "utf8").replace('"done"', '"edit"'));
    utimesSync(entry, metadata.atime, metadata.mtime);
    assert.equal((await host.list())[0]!.trusted, true);
    writeFileSync(path.join(directory, "extra.js"), "changed");
    await host.invoke("enable", { id: manifest.id });
    assert.equal(new PluginHost(path.join(root, "state.json")) instanceof PluginHost, true);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});
import { fileURLToPath, pathToFileURL } from "node:url";
import { ProviderConnections } from "../server/provider-connections.ts";
import { AssistantConversations } from "../server/assistant-conversations.ts";
import { RootAccess } from "../server/file-access.ts";
test("Codex management runs without approval and exposes activity in the existing tool result", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-activity-"));
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url))] }, undefined, { packaged: false, checkoutRoot: root });
  const host = new PluginHost(path.join(root, "plugins.json"));
  const conversations = new AssistantConversations(connection, new RootAccess([root]), host);
  try {
    const settings = { provider: "codex" as const, permissionMode: "full-access" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
    const conversation = await conversations.send({ message: "Inspect plugins", folders: [root], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings, "window-a");
    for (const action of ["list", "scaffold", "reload"]) {
      const response: any = await connection.client.request("fixture/tool", { threadId: conversation.id, tool: "manage_plugins", arguments: action === "list" ? { action } : action === "scaffold" ? { action, directory: path.join(root, "scaffolded"), id: "local.fixture" } : { action, id: "missing.plugin" } });
      assert.equal(conversations.current(conversation.id).userInput, undefined);
      assert.equal(response.result.success, action !== "reload");
      assert.match(response.result.contentItems[0].text, /activity/);
      assert.ok(conversations.current(conversation.id).turns.flatMap(t => t.items).some(item => item.text.includes(`plugins.${action}`)));
    }
    await connection.client.request("fixture/finish", { threadId: conversation.id });
    const restored = await conversations.resume(conversation.id, settings);
    assert.ok(restored.turns.flatMap(t => t.items).some(item => item.text === "plugins.reload (missing.plugin): failure"));
  } finally { await connection.close(); await host.close(); rmSync(root, { recursive: true, force: true }); }
});

function lifecycleFixture(root: string, id: string, code = "export function activate(){return {operations:{},status:()=>({available:true,message:'Fixture',folders:[],decorations:[],accounts:[]}),dispose(){}}}") {
  const directory = path.join(root, id); mkdirSync(directory);
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
  writeFileSync(path.join(directory, "litzio-plugin.json"), JSON.stringify({ schemaVersion: 1, id, tier: "community", publisher: { id: "fixture", name: "Fixture" }, name: id, version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: {} }));
  writeFileSync(path.join(directory, "host.js"), code);
  return directory;
}
test("missing artifact affects only its registration; unregister records activity and leaves artifact files alone", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-missing-plugin-")), host = new PluginHost(path.join(root, "state.json"));
  try {
    const a = lifecycleFixture(root, "fixture.a"), b = lifecycleFixture(root, "fixture.b");
    await host.invoke("register", { directory: a }); rmSync(a, { recursive: true });
    await host.invoke("register", { directory: b });
    assert.match((await host.list()).find(p => p.id === "fixture.a")!.error!, /artifact missing/);
    await executePluginTool(host, { action: "unregister", id: "fixture.a" }, () => {});
    await host.invoke("unregister", { id: "fixture.b" });
    assert.equal((await host.list()).length, 0);
    assert.doesNotThrow(() => readFileSync(path.join(b, "host.js")));
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});
test("disable drains admitted status observations and their late results cannot restore contributions", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-status-drain-")), host = new PluginHost(path.join(root, "state.json"));
  try {
    const marker = path.join(root, "started"), release = path.join(root, "release"), disposed = path.join(root, "disposed");
    const directory = lifecycleFixture(root, "fixture.slow", `import {existsSync,writeFileSync} from 'node:fs'; let calls=0; export function activate(){return {operations:{},async status(){if(calls++>0){writeFileSync(${JSON.stringify(marker)},'');while(!existsSync(${JSON.stringify(release)}))await new Promise(r=>setTimeout(r,10))}return {available:true,message:'Fixture',folders:[],decorations:[],accounts:[]}},dispose(){writeFileSync(${JSON.stringify(disposed)},'')}}}`);
    await host.invoke("register", { directory });
    await host.invoke("trust", { id: "fixture.slow", registrationId: (await host.list())[0]!.registrationId });
    await host.invoke("enable", { id: "fixture.slow" });
    const observation = host.list();
    while (!existsSync(marker)) await new Promise(r => setTimeout(r, 10));
    let disabled = false;
    const stopping = host.invoke("disable", { id: "fixture.slow" }).then(() => { disabled = true; });
    await new Promise(r => setImmediate(r));
    assert.equal(disabled, false); assert.equal(existsSync(disposed), false);
    assert.equal((await host.list())[0]!.status, null);
    writeFileSync(release, ''); await stopping;
    assert.equal(existsSync(disposed), true);
    const late = (await observation)[0]!;
    assert.equal(late.running, false); assert.equal(late.enabled, false); assert.equal(late.status, null);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("Windows DPAPI uses an isolated Host/account namespace, persists ciphertext and rejects other OSes", async () => {
  const { WindowsPluginSecretStore } = await import("../server/plugins/secret-store.ts");
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-secrets-"));
  const unsupported = new WindowsPluginSecretStore(root, "linux");
  try {
    assert.equal(unsupported.supported, false);
    await assert.rejects(unsupported.set("p", "token", "value"), /unsupported/);
    await assert.rejects(unsupported.read("p", "token"), /unsupported/);
    await assert.rejects(unsupported.delete("p"), /unsupported/);
    const { createHash } = await import("node:crypto");
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    const file = path.join(root, hash("p"), hash("token"));
    // File-only status validation is testable on every OS without DPAPI.
    const envelopeStore = new WindowsPluginSecretStore(root, "win32");
    mkdirSync(path.dirname(file), { recursive: true });
    // Exact independent-review reproduction: a header with empty mandatory fields.
    const emptyEnvelope = Buffer.alloc(84);
    emptyEnvelope.writeUInt32LE(1, 0);
    Buffer.from("d08c9ddf0115d1118c7a00c04fc297eb", "hex").copy(emptyEnvelope, 4);
    emptyEnvelope.writeUInt32LE(1, 20);
    writeFileSync(file, emptyEnvelope);
    await assert.rejects(envelopeStore.status("p", "token"), /unavailable/);
    await envelopeStore.delete("p", "token");
    if (process.platform !== "win32") return;
    const store = new WindowsPluginSecretStore(root), value = 'isolated-token-"-한글';
    await store.set("p", "token", value);
    const originalRead = store.read.bind(store);
    store.read = async () => { throw new Error("status must not decrypt"); };
    assert.equal(await store.status("p", "token"), true);
    store.read = originalRead;
    assert.equal(await store.read("p", "token"), value);
    assert.equal(await store.read("q", "token"), undefined);
    assert.equal(await new WindowsPluginSecretStore(path.join(root, "other-host")).read("p", "token"), undefined);
    assert.equal(await new WindowsPluginSecretStore(root).read("p", "token"), value);
    const { readdirSync } = await import("node:fs");
    for (const name of readdirSync(root, { recursive: true, withFileTypes: true })) if (name.isFile()) assert.equal(readFileSync(path.join(name.parentPath, name.name)).includes(Buffer.from(value)), false);
    const ciphertext = readFileSync(file);
    // Mutate the real Protect output, retaining the rest of its envelope.
    const cipherOffset = 48 + ciphertext.readUInt32LE(44);
    const saltOffset = cipherOffset + 8;
    const hmacKeyOffset = saltOffset + 4 + ciphertext.readUInt32LE(saltOffset);
    const hashOffset = hmacKeyOffset + 4 + ciphertext.readUInt32LE(hmacKeyOffset);
    const hmacOffset = hashOffset + 8;
    const dataOffset = hmacOffset + 4 + ciphertext.readUInt32LE(hmacOffset);
    const signatureOffset = dataOffset + 4 + ciphertext.readUInt32LE(dataOffset);
    for (const [offset, value] of [[cipherOffset, 0], [cipherOffset + 4, 0], [hashOffset, 0], [hashOffset + 4, 0], [saltOffset, 0], [hmacOffset, 0], [dataOffset, 0], [signatureOffset, 0], [dataOffset, 0xffffffff]]) {
      const invalid = Buffer.from(ciphertext); invalid.writeUInt32LE(value!, offset!);
      writeFileSync(file, invalid);
      await assert.rejects(store.status("p", "token"), /unavailable/);
    }
    for (const invalid of [ciphertext.subarray(0, -1), Buffer.concat([ciphertext, Buffer.from([0])])]) {
      writeFileSync(file, invalid);
      await assert.rejects(store.status("p", "token"), /unavailable/);
    }
    writeFileSync(file, ciphertext);
    assert.equal(await store.status("p", "token"), true);
    const damaged = Buffer.from(ciphertext); damaged[damaged.length - 1]! ^= 1;
    writeFileSync(file, damaged);
    assert.equal(await store.status("p", "token"), true);
    await assert.rejects(store.read("p", "token"), /unavailable/);
    await assert.rejects(store.status("p", "token"), /unavailable/);
    writeFileSync(file, ciphertext);
    assert.equal(await store.status("p", "token"), true);
    writeFileSync(file, "malformed");
    await assert.rejects(store.status("p", "token"), /unavailable/);
    await store.delete("p", "token"); assert.equal(await store.status("p", "token"), false);
    await store.set("p", "token", "new-value"); await store.delete("p"); assert.equal(await store.status("p", "token"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("secret admission, runtime plugin scope, non-disclosure and unregister cleanup", async () => {
  const { safePluginValue } = await import("../server/plugins/secret-redaction.ts");
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-secret-host-"));
  const values = new Map<string, string>(), broken = new Set<string>();
  const store = { supported: true, async read(p: string, n: string) { return values.get(`${p}/${n}`); }, async status(p: string, n: string) { if (broken.has(`${p}/${n}`)) throw new Error("raw-store-error-private"); return values.has(`${p}/${n}`); }, async set(p: string, n: string, v: string) { values.set(`${p}/${n}`, v); broken.delete(`${p}/${n}`); }, async delete(p: string, n?: string) { for (const key of values.keys()) if (n ? key === `${p}/${n}` : key.startsWith(`${p}/`)) { values.delete(key); broken.delete(key); } } };
  const host = new PluginHost(path.join(root, "state.json"), { secrets: store }), value = 'fixture-PAT-"-private';
  try {
    for (const id of ["example.first", "example.second"]) {
      const directory = path.join(root, id); mkdirSync(directory);
      writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
      writeFileSync(path.join(directory, "litzio-plugin.json"), JSON.stringify({ schemaVersion: 1, id, tier: "community", publisher: { id: "example", name: "Example" }, name: id, version: "0.1.0", requiresSdk: ">=0.4.0 <1.0.0", entry: "host.js", contributes: { operations: [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: {}, outputSchema: {} }] }, secrets: [{ id: "pat", title: "Access token", scope: "connection", required: true }] }));
      writeFileSync(path.join(directory, "host.js"), `export function activate(c){ if(Object.keys(c.secrets).join()!=='pat')throw Error('scope');return {operations:{read:(input)=>{if(input.fail)throw Error(c.secrets.pat);return {echo:c.secrets.pat}}},status:()=>({available:true,message:c.secrets.pat,folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
      await host.invoke("register", { directory });
      await assert.rejects(host.setSecret(id, "undeclared", value), /Undeclared/);
      await host.setSecret(id, "pat", id === "example.first" ? value : "second-private-PAT");
      const plugin = (await host.list()).find(p => p.id === id)!;
      await host.invoke("trust", { id, registrationId: plugin.registrationId }); await host.invoke("enable", { id });
      assert.equal(JSON.stringify(await host.invokeOperation(`${id}.read`, {})).includes(id === "example.first" ? value : "second-private-PAT"), false);
    }
    assert.equal(JSON.stringify(await host.invokeOperation("example.first.read", { fail: true })).includes(value), false);
    assert.equal(JSON.stringify(await host.list()).includes(value), false);
    assert.deepEqual(safePluginValue({ value }, [value]), { value: "[secret]" });
    assert.equal(safePluginValue(`error ${value}`, [value]), "error [secret]");
    assert.equal(readFileSync(path.join(root, "state.json"), "utf8").includes(value), false);
    await host.setSecret("example.first", "pat", "replacement-private");
    assert.equal(values.get("example.first/pat"), "replacement-private");
    assert.equal((await host.list()).find(p => p.id === "example.first")!.running, true);
    assert.deepEqual((await host.invokeOperation("example.first.read", {})).result, { echo: "[secret]" });
    await host.invoke("disable", { id: "example.first" });
    broken.add("example.first/pat");
    const damaged = (await host.list()).find(p => p.id === "example.first")!;
    assert.equal(damaged.name, "example.first"); assert.equal(damaged.digest?.length, 64);
    assert.deepEqual(damaged.secrets?.declarations, [{ id: "pat", title: "Access token", scope: "connection", required: true, configured: false, error: "Secret unavailable or damaged" }]);
    assert.equal((await host.list()).find(p => p.id === "example.second")!.secrets?.declarations[0]?.configured, true);
    assert.equal(JSON.stringify(await host.invoke("secret-status", { id: "example.first" })).includes("raw-store-error-private"), false);
    await host.invoke("secret-delete", { id: "example.first", name: "pat" });
    assert.equal("error" in (await host.list()).find(p => p.id === "example.first")!.secrets!.declarations[0]!, false);
    await host.setSecret("example.first", "pat", value);
    assert.equal((await host.list()).find(p => p.id === "example.first")!.secrets?.declarations[0]?.configured, true);
    await host.invoke("secret-delete", { id: "example.first", name: "pat" });
    assert.equal(await store.status("example.first", "pat"), false);
    await assert.rejects(host.invoke("enable", { id: "example.first" }), /not configured/);
    assert.equal(await store.status("example.second", "pat"), true);
    await host.invoke("unregister", { id: "example.second" }); assert.equal(values.size, 0);
    const { WindowsPluginSecretStore } = await import("../server/plugins/secret-store.ts");
    const unsupportedHost = new PluginHost(path.join(root, "unsupported.json"), { secrets: new WindowsPluginSecretStore(path.join(root, "unsupported-secrets"), "linux") });
    try {
      await unsupportedHost.invoke("register", { directory: path.join(root, "example.first") });
      const p = (await unsupportedHost.list())[0]!;
      await unsupportedHost.invoke("trust", { id: p.id, registrationId: p.registrationId });
      await assert.rejects(unsupportedHost.setSecret(p.id, "pat", value), /unsupported/);
      await assert.rejects(unsupportedHost.invoke("enable", { id: p.id }), /unsupported/);
      assert.equal((await unsupportedHost.list())[0]!.secrets?.supported, false);
    } finally { await unsupportedHost.close(); }

  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("Host streams stay intact while synchronous and asynchronous plugin output is discarded", async () => {
  const { spawnSync } = await import("node:child_process");
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-logs-"));
  try {
    const directory = lifecycleFixture(root, "fixture.logs", `export async function activate(){console.log('private-log');process.stderr.write('private-log');await new Promise(r=>setTimeout(r,1));console.log('private-log');return {operations:{},status:()=>({}),dispose(){console.log('private-log')}}}`);
    const redaction = new URL("../server/plugins/secret-redaction.ts", import.meta.url).href;
    const transport = new URL("../server/plugins/plugin-process.ts", import.meta.url).href;
    const script = `import assert from 'node:assert/strict'; const out=process.stdout.write, err=process.stderr.write; await import(${JSON.stringify(redaction)}); assert.equal(process.stdout.write,out); assert.equal(process.stderr.write,err); const {startPluginProcess}=await import(${JSON.stringify(transport)}); const plugin=await startPluginProcess(${JSON.stringify(path.join(directory, "host.js"))},{contributes:{operations:[]}}, {}, {}, ()=>{}); await plugin.dispose(); console.log('host-visible');`;
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), "host-visible"); assert.equal(result.stderr, "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("operation invoke publishes declared public rows and refuses row-type mismatches", async () => {
  const knownSecret = "row-boundary-known-private";
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-operation-rows-"));
  const directory = path.join(root, "artifact"); mkdirSync(directory);
  const manifest = { secrets: [{ id: "pat", title: "Access token", scope: "connection", required: true }], schemaVersion: 1, id: "fixture.rows", tier: "community", publisher: { id: "fixture", name: "Fixture" }, name: "Rows", version: "0.1.0", requiresSdk: ">=0.3.0 <1.0.0", entry: "host.js", contributes: { operations: [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: { type: "object", properties: { mode: { type: "string" } }, additionalProperties: false }, outputSchema: { type: "array", items: { type: "object" } }, rowSchema: { points: { type: "number", label: "Points" }, caption: { type: "string", label: "Caption", linkField: "url" }, url: { type: "string", label: "URL" }, token: { type: "string", label: "Token", secret: true } } }] } };
  writeFileSync(path.join(directory, "litzio-plugin.json"), JSON.stringify(manifest));
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
  writeFileSync(path.join(directory, "host.js"), `export function activate(){return {operations:{read:({mode})=>{if(mode?.startsWith("error:")) throw Object.assign(new Error("raw-response credential-private"), {kind:mode.slice(6),response:"credential-private"}); return [{points:mode==="wrong-number"?"3":-3,caption:"row-boundary-known-private",url:"https://example.test/issue/1",token:mode==="wrong-secret"?4:"private",extra:"undeclared"}]} },status:()=>({available:true,message:"Rows",folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
  const host = new PluginHost(path.join(root, "plugins.json"), { secrets: { supported: true, async read() { return knownSecret; }, async set() {}, async status() { return true; }, async delete() {} } });
  try {
    await host.invoke("register", { directory }); const record = (await host.list())[0]!;
    await host.invoke("trust", { id: record.id, registrationId: record.registrationId }); await host.invoke("enable", { id: record.id });
    const invoke = (mode?: string) => host.invoke("invoke", { operation: "fixture.rows.read", input: mode ? { mode } : {} }) as Promise<any>;
    const valid = await invoke(); assert.equal(valid.receipt.outcome, "success"); assert.deepEqual(valid.result, [{ points: -3, caption: "[secret]", url: "https://example.test/issue/1" }]);
    await host.invoke("reload", { id: record.id });
    assert.deepEqual((await invoke()).result, valid.result);
    const { PLUGIN_ERROR_KINDS, PLUGIN_ERROR_MESSAGES } = await import("@litzio/plugin-sdk");
    for (const kind of [...PLUGIN_ERROR_KINDS, "credential-private"] as const) {
      const failure = await invoke(`error:${kind}`);
      const expected = kind === "credential-private" ? "failed" : kind;
      assert.equal(failure.errorKind, expected);
      assert.equal(failure.error, PLUGIN_ERROR_MESSAGES[expected]);
      assert.equal(failure.receipt.outcome, "failure");
      assert.ok(!JSON.stringify(failure).includes("private"));
      assert.ok(!JSON.stringify(failure).includes("raw-response"));
    }
    const { executeViewOperation } = await import("../server/views.ts");
    const { viewRequest } = await import("../src/views/view-api.ts");
    const view = { kind: "litzio-view", title: "Rows", refresh: "manual", schemaVersion: 2, catalog: "litzio-v2", profile: "query", owner: "fixture.rows", sources: { stats: { kind: "operation", operation: "fixture.rows.read", version: 1, args: { mode: "error:auth" } } }, layout: { component: "Panel", direction: "vertical", children: [{ component: "Table", title: "Rows", source: "stats", data: "/rows", columns: ["points"] }] } };
    const failedView = await executeViewOperation({ action: "run", view }, { access: new RootAccess([root]), plugins: host });
    assert.equal(failedView.errorKind, "auth", failedView.error); assert.equal(failedView.error, PLUGIN_ERROR_MESSAGES.auth);
    const client = { request: async () => new Response(JSON.stringify(failedView)) } as unknown as import("../src/host-client.ts").HostClient;
    await assert.rejects(viewRequest(client, {}), error => error instanceof Error && "kind" in error && error.kind === "auth" && !error.message.includes("private"));
    for (const mode of ["wrong-number", "wrong-secret"]) {
      const refused = await invoke(mode); assert.equal(refused.receipt.outcome, "failure"); assert.ok(!("result" in refused)); assert.ok(!JSON.stringify(refused).includes("private")); assert.equal(refused.errorKind, "failed"); assert.ok(!refused.error.includes("retrying a write"));
    }
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("K1 assistant job tools use shared definitions without per-call consent and leave activity", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-job-tool-"));
  const connection = new ProviderConnections(path.join(root, "assistant"), { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url))] }, undefined, { packaged: false, checkoutRoot: root });
  const host = new PluginHost(path.join(root, "plugins.json"));
  const conversations = new AssistantConversations(connection, new RootAccess([root]), host);
  try {
    const settings = { provider: "codex" as const, permissionMode: "full-access" as const, model: "gpt-6.1-sol", reasoningEffort: "medium" };
    const conversation = await conversations.send({ message: "List plugin jobs", folders: [root], model: settings.model, reasoningEffort: settings.reasoningEffort }, settings, "window-a");
    const response = await connection.client.request("fixture/tool", { threadId: conversation.id, tool: "plugin_jobs", arguments: { action: "job-list" } }) as any;
    assert.equal(response.result.success, true);
    assert.equal(conversations.current(conversation.id).userInput, undefined);
    const activity = conversations.current(conversation.id).turns.flatMap(turn => turn.items).find(item => item.text === "plugin_jobs · job-list");
    assert.equal(activity?.status, "completed"); assert.equal(activity?.toolResult?.success, true);
  } finally { await connection.close(); await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("subprocess isolation, fresh artifact reload, trust failure recovery and crash status", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-reload-")), host = new PluginHost(path.join(root, "state.json"));
  const marker = path.join(root, "disposed");
  const code = (label: string, crash = false) => `import {writeFileSync} from 'node:fs'; export function activate(){${crash ? "setTimeout(()=>process.exit(7),100);" : ""}return {operations:{},status:()=>({available:true,message:${JSON.stringify(label)}+':'+process.pid,folders:[],decorations:[],accounts:[]}),dispose(){writeFileSync(${JSON.stringify(marker)},'disposed')}}}`;
  try {
    const directory = lifecycleFixture(root, "fixture.reload", code("first"));
    await host.invoke("register", { directory });
    const trust = async () => host.invoke("trust", { id: "fixture.reload", registrationId: (await host.list())[0]!.registrationId });
    await trust(); await host.invoke("enable", { id: "fixture.reload" });
    const first = (await host.list())[0]!.status!.message;
    assert.notEqual(first.split(':')[1], String(process.pid));
    writeFileSync(path.join(directory, "host.js"), code("second"));
    await host.invoke("reload", { id: "fixture.reload" });
    assert.equal(readFileSync(marker, "utf8"), "disposed");
    assert.equal((await host.list())[0]!.running, true);
    await host.invoke("reload", { id: "fixture.reload" });
    const second = (await host.list())[0]!.status!.message;
    assert.match(second, /^second:/); assert.notEqual(first.split(':')[1], second.split(':')[1]);
    writeFileSync(path.join(directory, "host.js"), "throw new Error('private error')");
    await trust(); await assert.rejects(host.invoke("reload", { id: "fixture.reload" }), /request failed/);
    assert.equal((await host.list())[0]!.running, false);
    writeFileSync(path.join(directory, "host.js"), code("recovered"));
    await trust(); await host.invoke("reload", { id: "fixture.reload" });
    assert.match((await host.list())[0]!.status!.message, /^recovered:/);
    writeFileSync(path.join(directory, "host.js"), code("crash", true));
    await trust(); await host.invoke("reload", { id: "fixture.reload" });
    // Process exit notification can follow a rejected status RPC on a busy Host.
    const deadline = Date.now() + 5000;
    let failed = (await host.list())[0]!;
    while (!/process failed/.test(failed.error ?? "") && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 25));
      failed = (await host.list())[0]!;
    }
    assert.equal(failed.running, false); assert.match(failed.error!, /process failed/);
    await new Promise(r => setTimeout(r, 100)); assert.equal((await host.list())[0]!.running, false);
    writeFileSync(path.join(directory, "host.js"), code("final"));
    await trust(); await host.invoke("reload", { id: "fixture.reload" });
    assert.match((await host.list())[0]!.status!.message, /^final:/);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});


test("a stalled write times out as uncertain; failed disposal can recover on the next reload", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-timeout-")), host = new PluginHost(path.join(root, "state.json"));
  try {
    const directory = lifecycleFixture(root, "fixture.timeout", `export function activate(){return {operations:{write:()=>new Promise(()=>{})},status:()=>({available:true,message:'ready',folders:[],decorations:[],accounts:[]}),dispose(){throw new Error('private')}}}`);
    const file = path.join(directory, "litzio-plugin.json"), manifest = JSON.parse(readFileSync(file, 'utf8'));
    manifest.contributes.operations = [{id:'write',version:1,effect:'write',scope:'host',inputSchema:{type:'object'},outputSchema:{type:'object'}}];
    writeFileSync(file, JSON.stringify(manifest));
    await host.invoke("register", {directory});
    await host.invoke("trust", {id:'fixture.timeout',registrationId:(await host.list())[0]!.registrationId});
    await host.invoke("enable", {id:'fixture.timeout'});
    await assert.rejects(host.invoke("reload", {id:'fixture.timeout'}), /disposal failed/);
    assert.equal((await host.list())[0]!.running, false);
    await host.invoke("reload", {id:'fixture.timeout'});
    const result = await host.invokeOperation('fixture.timeout.write', {});
    assert.equal(result.receipt.outcome, 'uncertain');
    assert.equal('errorKind' in result && result.errorKind, 'timeout');
    assert.match('error' in result ? result.error : '', /Check the target before retrying a write/);
    assert.equal((await host.list())[0]!.running, false);
    assert.match((await host.list())[0]!.error!, /process failed/);
  } finally {await host.close(); rmSync(root, {recursive:true, force:true});}
});


test("Host shutdown closes every child even when one dispose fails", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-plugin-close-")), host = new PluginHost(path.join(root, "state.json"));
  const marker = path.join(root, 'disposed');
  try {
    for (const [id, dispose] of [['fixture.bad', "throw new Error('private')"], ['fixture.good', `writeFileSync(${JSON.stringify(marker)},'done')`]]) {
      const directory = lifecycleFixture(root, id!, `import {writeFileSync} from 'node:fs'; export function activate(){return {operations:{},status:()=>({available:true,message:'ready',folders:[],decorations:[],accounts:[]}),dispose(){${dispose}}}}`);
      await host.invoke('register', {directory});
      await host.invoke('trust', {id, registrationId:(await host.list()).find(p=>p.id===id)!.registrationId});
      await host.invoke('enable', {id});
    }
    await assert.rejects(host.close(), /cleanup failed/);
    assert.equal(readFileSync(marker, 'utf8'), 'done');
    assert.ok((await host.list()).every(p=>!p.running));
  } finally {await host.close(); rmSync(root, {recursive:true, force:true});}
});


test("secret IPC admission is per plugin at activation, and reload reads fresh values without exposing errors", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-secret-ipc-"));
  const values = new Map([['fixture.secret/pat', 'first-private-token'], ['fixture.other/pat', 'other-private-token']]);
  const reads: string[] = [];
  const store = { supported: true, async read(id: string, name: string) { reads.push(`${id}/${name}`); return values.get(`${id}/${name}`); }, async status(id: string, name: string) {return values.has(`${id}/${name}`);}, async set(id: string, name: string, value: string) {values.set(`${id}/${name}`,value);}, async delete() {} };
  const host = new PluginHost(path.join(root, 'state.json'), { secrets: store });
  try {
    const directory = lifecycleFixture(root, 'fixture.secret', `export function activate(c){
      console.log(c.secrets.pat); process.stderr.write(c.secrets.pat);
      if (!Object.isFrozen(c.secrets) || Object.keys(c.secrets).join() !== 'pat') throw Error('scope');
      if(c.secrets.pat === 'throw-private-token') throw Error(c.secrets.pat);
      return {operations:{read:(input)=>{if(input.fail)throw Error(c.secrets.pat);return {version:c.secrets.pat==='first-private-token'?1:c.secrets.pat==='second-private-token'?2:0}}},status:()=>({available:true,message:c.secrets.pat,folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
    const file = path.join(directory,'litzio-plugin.json'), manifest = JSON.parse(readFileSync(file,'utf8'));
    manifest.requiresSdk = '>=0.4.0 <1.0.0';
    manifest.secrets = [{id:'pat',title:'Access token',scope:'connection',required:true}];
    manifest.contributes.operations = [{id:'read',version:1,effect:'read',scope:'host',inputSchema:{},outputSchema:{}}];
    writeFileSync(file,JSON.stringify(manifest));
    await host.invoke('register',{directory});
    await assert.rejects(host.invoke('enable',{id:'fixture.secret'}),/trust/);
    await host.invoke('trust',{id:'fixture.secret',registrationId:(await host.list())[0]!.registrationId});
    assert.deepEqual(reads, []);
    await host.invoke('enable',{id:'fixture.secret'});
    assert.deepEqual((await host.invokeOperation('fixture.secret.read',{})).result,{version:1});
    assert.deepEqual(reads,['fixture.secret/pat']);
    assert.equal(JSON.stringify(await host.invokeOperation('fixture.secret.read',{fail:true})).includes('first-private-token'),false);
    assert.equal(JSON.stringify(await host.list()).includes('first-private-token'),false);
    await host.invoke('disable',{id:'fixture.secret'});
    await host.setSecret('fixture.secret','pat','second-private-token');
    await host.invoke('reload',{id:'fixture.secret'});
    assert.deepEqual((await host.invokeOperation('fixture.secret.read',{})).result,{version:2});
    assert.deepEqual(reads,['fixture.secret/pat','fixture.secret/pat']);
    await host.invoke('disable',{id:'fixture.secret'});
    await host.setSecret('fixture.secret','pat','throw-private-token');
    await assert.rejects(host.invoke('reload',{id:'fixture.secret'}), error => error instanceof Error && error.message === 'Plugin request failed');
    assert.equal(JSON.stringify(await host.list()).includes('throw-private-token'),false);
    assert.equal((await host.list())[0]!.running,false);
  } finally {await host.close();rmSync(root,{recursive:true,force:true});}
});

test("authoring: scaffold, nonexecuting validation, attach, invoke and fresh reload", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-authoring-"));
  const host = new PluginHost(path.join(root, "state.json")), directory = path.join(root, "greeting"), id = "local.greeting";
  const activity: any[] = [];
  const scope = { folders: new RootAccess([root]), access: new RootAccess([root]), permissionMode: "opened-folders" };
  try {
    await executePluginTool(host, { action: "scaffold", directory, id }, e => activity.push(e), scope);
    const entry = path.join(directory, "host.js"), source = readFileSync(entry, "utf8");
    assert.equal(JSON.parse(readFileSync(path.join(directory, "litzio-plugin.json"), "utf8")).requiresSdk, ">=0.4.0 <1.0.0");
    assert.match(source, /import .* from "@litzio\/plugin-sdk"/);
    assert.match(readFileSync(path.join(directory, "plugin-sdk.d.ts"), "utf8"), /PluginContext/);
    // Even an artifact-local SDK must never replace the Host's public runtime.
    const localSdk = path.join(directory, "node_modules/@litzio/plugin-sdk");
    mkdirSync(localSdk, { recursive: true });
    writeFileSync(path.join(localSdk, "package.json"), JSON.stringify({ type: "module", exports: "./index.js" }));
    writeFileSync(path.join(localSdk, "index.js"), 'throw new Error("Artifact SDK must not load");');

    await assert.rejects(host.invoke("scaffold", { directory, id }));
    assert.equal(readFileSync(entry, "utf8"), source);
    const validate = () => host.invoke("validate", { directory }) as Promise<any>;
    assert.equal((await validate()).valid, true);
    const marker = path.join(root, "executed");
    writeFileSync(entry, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'bad');\n` + source);
    assert.equal((await validate()).valid, true); assert.equal(existsSync(marker), false);
    writeFileSync(entry, source.replace('greet:', 'undeclared:'));
    const invalid = await executePluginTool(host, { action: "validate", directory }, e => activity.push(e));
    assert.equal(invalid.activity.outcome, "failure");
    assert.match(JSON.stringify(invalid), /Missing handler/); assert.match(JSON.stringify(invalid), /Undeclared operation handler/);
    writeFileSync(entry, source.replace('({ greeting: "Hello, " + name + "!" })', '({ greeting: 42 })'));
    assert.match(JSON.stringify(await validate()), /Output schema mismatch/);
    const manifestFile = path.join(directory, "litzio-plugin.json"), manifest = readFileSync(manifestFile, "utf8");
    writeFileSync(manifestFile, manifest.replace('"type": "string"', '"type": "invalid"'));
    assert.equal((await validate()).valid, false);

    writeFileSync(manifestFile, manifest.replace(/"requiresSdk": "[^"]+"/, '"requiresSdk": "999.0.0"'));
    assert.equal((await validate()).valid, false);
    await assert.rejects(host.invoke("register", { directory }));
    // An unchanged pre-0.2 scaffold's exact requirement remains executable.
    writeFileSync(manifestFile, manifest.replace(/"requiresSdk": "[^"]+"/, '"requiresSdk": "0.1.0"')); writeFileSync(entry, source);
    await executePluginTool(host, { action: "register", directory }, e => activity.push(e));
    assert.deepEqual(activity.at(-1), { action: "register", id, outcome: "success" });
    const trust = async () => host.invoke("trust", { id, registrationId: (await host.list())[0]!.registrationId });
    await trust(); await host.invoke("enable", { id });
    assert.deepEqual((await host.invokeOperation(`${id}.greet`, { name: "World" })).result, { greeting: "Hello, World!" });
    writeFileSync(entry, source.replace('Hello, ', 'Welcome, '));
    assert.equal((await validate()).valid, true);
    await trust(); await host.invoke("reload", { id });
    assert.deepEqual((await host.invokeOperation(`${id}.greet`, { name: "World" })).result, { greeting: "Welcome, World!" });
    // Internal package imports fail even if an artifact supplies a matching package.
    const internal = path.join(directory, "node_modules/@litzio/core");
    mkdirSync(internal, { recursive: true });
    writeFileSync(path.join(internal, "package.json"), JSON.stringify({ type: "module", exports: "./index.js" }));
    writeFileSync(path.join(internal, "index.js"), 'export const forbidden = true;');
    writeFileSync(entry, 'import "@litzio/core";\n' + source);
    await trust(); await assert.rejects(host.invoke("reload", { id }), /request failed/);
    assert.equal(existsSync(marker), false);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});


import { createPluginService } from "../server/plugin-service.ts";
import { pluginCli } from "../../../packages/cli/src/plugins.ts";
import { DAEMON_PROTOCOL } from "../shared/daemon-version.ts";

test("Host SDK runtime is one self-contained JavaScript module with only Node builtin imports", async () => {
  const { buildSdkRuntime } = await import("../../../packages/cli/scripts/plugin-sdk.ts");
  const { isBuiltin } = await import("node:module");
  const result = await buildSdkRuntime();
  assert.equal(result.outputFiles!.length, 1, "SDK must not emit shared chunks");
  for (const output of Object.values(result.metafile.outputs)) {
    for (const dependency of output.imports) {
      assert.ok(dependency.external && isBuiltin(dependency.path), `SDK must be self-contained: ${dependency.path}`);
    }
  }
  const runtime = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles![0]!.contents).toString("base64")}`);
  assert.equal(runtime.SDK_VERSION, "0.4.0");
  assert.equal(JSON.parse(readFileSync(new URL("../../../packages/plugin-sdk/package.json", import.meta.url), "utf8")).version, runtime.SDK_VERSION);
  assert.equal(typeof runtime.PluginOperationError, "function");
});

test("runtime import boundary checks resolved real paths, including aliases into the Host checkout", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-import-boundary-"));
  const host = new PluginHost(path.join(root, "state.json")), id = "fixture.imports";
  const source = `import { SDK_VERSION } from '@litzio/plugin-sdk';
import {basename} from 'node:path'; import {message} from './local.js'; import {value} from 'fixture-dependency';
export function activate(){return {operations:{},status:()=>({available:true,message:[SDK_VERSION,basename('okay'),message,value].join('/'),folders:[],decorations:[],accounts:[]}),dispose(){}}}`;
  // A legitimate artifact can itself live under the checkout boundary.
  const checkoutTmp = fileURLToPath(new URL("../../../tmp/", import.meta.url));
  mkdirSync(checkoutTmp, { recursive: true });
  const checkoutScratch = mkdtempSync(path.join(checkoutTmp, "import-boundary-"));
  const directory = lifecycleFixture(checkoutScratch, id, source), entry = path.join(directory, "host.js");
  const target = fileURLToPath(new URL("../../../packages/core/src/label.ts", import.meta.url));
  try {
    writeFileSync(path.join(directory, "local.js"), "export const message = 'local';");
    const dependency = path.join(directory, "node_modules/fixture-dependency");
    mkdirSync(dependency, { recursive: true });
    writeFileSync(path.join(dependency, "package.json"), JSON.stringify({ type: "module", exports: "./index.js" }));
    writeFileSync(path.join(dependency, "index.js"), "export const value = 'dependency';");
    await host.invoke("register", { directory });
    const trust = async () => host.invoke("trust", { id, registrationId: (await host.list())[0]!.registrationId });
    await trust(); await host.invoke("enable", { id });
    assert.match((await host.list())[0]!.status!.message, /okay\/local\/dependency$/);
    // Keep the link outside the artifact: artifact admission independently rejects links.
    // This reaches the runtime resolver and proves that realpath, not lexical path, is checked.
    const alias = path.join(root, "host-source-alias");
    symlinkSync(path.dirname(target), alias, process.platform === "win32" ? "junction" : "dir");
    const attempts = [
      path.relative(directory, target).replaceAll("\\", "/"),
      pathToFileURL(target).href,
      pathToFileURL(path.join(alias, "label.ts")).href,
      path.relative(directory, path.join(alias, "label.ts")).replaceAll("\\", "/"),
      ...(process.platform === "win32" ? [pathToFileURL(target.toUpperCase()).href] : []),
    ];
    for (const specifier of attempts) {
      writeFileSync(entry, `import ${JSON.stringify(specifier)};\n` + source);
      await trust();
      await assert.rejects(host.invoke("reload", { id }), /request failed/, specifier);
      assert.equal((await host.list())[0]!.running, false);
    }
    writeFileSync(entry, `import {createRequire} from 'node:module'; createRequire(import.meta.url)(${JSON.stringify(target)});\n` + source);
    await trust(); await assert.rejects(host.invoke("reload", { id }), /request failed/);
    // Restore the ordinary SDK + artifact + dependency imports after all refusals.
    writeFileSync(entry, source); await trust(); await host.invoke("reload", { id });
    assert.match((await host.list())[0]!.status!.message, /okay\/local\/dependency$/);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); rmSync(checkoutScratch, { recursive: true, force: true }); }
});

test("scaffold enforces Host roots and the active assistant turn write scope before creation", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-scaffold-access-"));
  const allowed = path.join(root, "allowed"), opened = path.join(allowed, "opened");
  mkdirSync(allowed); mkdirSync(opened);
  const access = new RootAccess([allowed]);
  const assistant = createPluginService(access, path.join(root, "plugins.json"));
  const host = new PluginHost(path.join(root, "turn-plugins.json"), { access });
  const scope = { access, folders: new RootAccess([opened]), permissionMode: "opened-folders" };
  const activities: unknown[] = [];
  try {
    const outside = path.join(root, "outside");
    await assert.rejects(assistant.invoke("pluginsManage", { action: "scaffold", directory: outside, id: "local.outside" }), /outside/);
    assert.equal(existsSync(outside), false);
    const attempt = async (directory: string, turnScope: typeof scope | undefined) => {
      const result = await executePluginTool(host, { action: "scaffold", directory, id: "local.scope" }, e => activities.push(e), turnScope);
      assert.equal(result.activity.outcome, "failure"); assert.equal(existsSync(directory), false);
    };
    await attempt(path.join(allowed, "not-opened"), scope);
    await attempt(path.join(opened, "readonly"), { ...scope, permissionMode: "read-only" });
    await attempt(path.join(opened, "no-scope"), undefined);
    await attempt(outside, { ...scope, permissionMode: "full-access" });
    const directory = path.join(opened, "valid");
    const result = await executePluginTool(host, { action: "scaffold", directory, id: "local.valid" }, e => activities.push(e), scope);
    assert.equal(result.activity.outcome, "success"); assert.equal(existsSync(path.join(directory, "host.js")), true);
  } finally { await assistant.close(); await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("validation diagnostics never expose source values through Host, assistant, CLI or logs", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-validation-redaction-"));
  const host = new PluginHost(path.join(root, "state.json"));
  const directory = path.join(root, "artifact"), secret = "SYNTHETIC_SECRET_MUST_NOT_ESCAPE_91";
  const captured: string[] = [];
  const stdout = t.mock.method(process.stdout, "write", ((value: string) => { captured.push(String(value)); return true; }) as typeof process.stdout.write);
  const stderr = t.mock.method(process.stderr, "write", ((value: string) => { captured.push(String(value)); return true; }) as typeof process.stderr.write);
  t.mock.method(globalThis, "fetch", async (url: URL, init?: RequestInit) => {
    if (url.pathname === "/daemon/health") return new Response(JSON.stringify({ protocolVersion: DAEMON_PROTOCOL }));
    const { action, ...args } = JSON.parse(init!.body as string);
    return new Response(JSON.stringify(await host.invoke(action, args)));
  });
  try {
    await host.invoke("scaffold", { directory, id: "local.redaction" });
    const manifest = readFileSync(path.join(directory, "litzio-plugin.json"), "utf8");
    const source = readFileSync(path.join(directory, "host.js"), "utf8");
    const activities: unknown[] = [];
    const check = async (file: string) => {
      const result: any = await host.invoke("validate", { directory });
      assert.equal(result.valid, false); assert.ok(result.errors.length);
      assert.equal(result.errors[0].file, file);
      assert.ok(Object.hasOwn(result.errors[0], "line")); assert.ok(Object.hasOwn(result.errors[0], "column"));
      assert.equal(JSON.stringify(result).includes(secret), false);
      const tool = await executePluginTool(host, { action: "validate", directory }, e => activities.push(e));
      assert.equal(tool.activity.outcome, "failure"); assert.equal(JSON.stringify(tool).includes(secret), false);
      assert.equal(await pluginCli(["plugins", "validate", directory, "--host", "http://127.0.0.1:5180", "--json"]), 1);
      assert.equal(captured.join("").includes(secret), false); assert.equal(JSON.stringify(activities).includes(secret), false);
    };
    writeFileSync(path.join(directory, "litzio-plugin.json"), `{ "token": "${secret}", broken }`);
    await check("litzio-plugin.json");
    writeFileSync(path.join(directory, "litzio-plugin.json"), manifest);
    writeFileSync(path.join(directory, "host.js"), `const ${secret} = ;`);
    await check("host entry");
    writeFileSync(path.join(directory, "host.js"), source.replace("greet:", `"${secret}":`));
    await check("host entry");
  } finally { stdout.mock.restore(); stderr.mock.restore(); await host.close(); rmSync(root, { recursive: true, force: true }); }
});


test("short secrets preserve keys and leave the plugin scope on replacement, deletion and unregister", async () => {
  const { safePluginValue } = await import("../server/plugins/secret-redaction.ts");
  assert.deepEqual(safePluginValue({ id: "id", defaultCandidate: ["secret-long", "a.b"] }, ["id", "secret", "secret-long", "a.b"]), { id: "[secret]", defaultCandidate: ["[secret]", "[secret]"] });
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-redaction-scope-")), values = new Map<string, string>();
  const store = { supported: true, async read(p: string, n: string) { return values.get(`${p}/${n}`); }, async status(p: string, n: string) { return values.has(`${p}/${n}`); }, async set(p: string, n: string, v: string) { values.set(`${p}/${n}`, v); }, async delete(p: string, n?: string) { for (const key of values.keys()) if (n ? key === `${p}/${n}` : key.startsWith(`${p}/`)) values.delete(key); } };
  const host = new PluginHost(path.join(root, "state.json"), { secrets: store });
  try {
    const dirs: string[] = [];
    for (const id of ["fixture.a", "fixture.b"]) {
      const directory = lifecycleFixture(root, id, `export function activate(){return {operations:{read:input=>{if(input.fail)throw Error('raw-log-private');return {id:input.value,defaultCandidate:true}}},status:()=>({available:true,message:'id',folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
      dirs.push(directory);
      const file = path.join(directory, "litzio-plugin.json"), m = JSON.parse(readFileSync(file, "utf8"));
      m.requiresSdk = ">=0.4.0 <1.0.0";
      m.secrets = [{ id: "pat", title: "Access token", scope: "connection", required: false }, { id: "other", title: "Access token", scope: "connection", required: false }];
      m.contributes.operations = [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: {}, outputSchema: { type: "object", required: ["id", "defaultCandidate"], additionalProperties: false, properties: { id: { type: "string" }, defaultCandidate: { type: "boolean" } } } }];
      writeFileSync(file, JSON.stringify(m));
      await host.invoke("register", { directory });
      await host.invoke("trust", { id, registrationId: (await host.list()).find(p => p.id === id)!.registrationId });
    }
    await host.setSecret("fixture.a", "pat", "id"); await host.setSecret("fixture.a", "other", "raw-log-private");
    await host.invoke("enable", { id: "fixture.a" }); await host.invoke("enable", { id: "fixture.b" });
    const check = async (id: string, value: string, expected: string) => assert.deepEqual((await host.invokeOperation(`${id}.read`, { value })).result, { id: expected, defaultCandidate: true });
    await check("fixture.a", "id", "[secret]"); await check("fixture.b", "id", "id");
    assert.equal((await host.list()).find(p => p.id === "fixture.a")!.status!.message, "[secret]");
    await check("fixture.a", "raw-log-private", "[secret]");
    const activities: unknown[] = [];
    const tool = await executePluginTool(host, { action: "list" }, e => activities.push(e));
    const failure = await host.invokeOperation("fixture.a.read", { fail: true });
    assert.equal(JSON.stringify(failure).includes("raw-log-private"), false);
    assert.equal(JSON.stringify([tool, activities]).includes("raw-log-private"), false);
    await host.invoke("disable", { id: "fixture.a" }); await host.setSecret("fixture.a", "pat", "replacement"); await host.invoke("enable", { id: "fixture.a" });
    await check("fixture.a", "id", "id");
    await host.invoke("disable", { id: "fixture.a" }); await host.invoke("secret-delete", { id: "fixture.a", name: "pat" }); await host.invoke("enable", { id: "fixture.a" });
    await check("fixture.a", "replacement", "replacement");
    await host.invoke("unregister", { id: "fixture.a" });
    await host.invoke("register", { directory: dirs[0] }); await host.invoke("trust", { id: "fixture.a", registrationId: (await host.list()).find(p => p.id === "fixture.a")!.registrationId }); await host.invoke("enable", { id: "fixture.a" });
    await check("fixture.a", "raw-log-private", "raw-log-private");
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

// Host policy combinations belong here; browser coverage owns the folder picker and toggle wiring.
test("bundled defaults follow supply until an explicit choice; update verification cannot be bypassed", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-bundled-"));
  const directory = lifecycleFixture(root, "fixture.bundled");
  const file = path.join(directory, "litzio-plugin.json");
  const manifest = JSON.parse(readFileSync(file, "utf8")); manifest.tier = "official";
  writeFileSync(file, JSON.stringify(manifest));
  const supply = [{ id: manifest.id, publisher: "fixture", directory, digest: artifactDigest(directory), defaultEnabled: false }];
  const state = path.join(root, "state.json");
  let host = new PluginHost(state, { officialPlugins: supply });
  try {
    await host.start(); assert.equal((await host.list())[0]!.enabled, false);
    // Saving unrelated settings must not turn a default into an explicit choice.
    await host.invoke("settings", { id: manifest.id, settings: {} }); await host.close();
    supply[0]!.defaultEnabled = true;
    host = new PluginHost(state, { officialPlugins: supply }); await host.start();
    assert.equal((await host.list())[0]!.running, true);
    await host.invoke("disable", { id: manifest.id }); await host.close();
    host = new PluginHost(state, { officialPlugins: supply }); await host.start();
    assert.equal((await host.list())[0]!.enabled, false);
    await host.invoke("enable", { id: manifest.id }); await host.close();
    supply[0]!.defaultEnabled = false;
    host = new PluginHost(state, { officialPlugins: supply }); await host.start();
    assert.equal((await host.list())[0]!.running, true);
    await assert.rejects(host.invoke("unregister", { id: manifest.id }), /disabled/);
    await assert.rejects(host.invoke("register", { directory }), /app only/);
    await host.close(); writeFileSync(path.join(directory, "tampered.js"), "changed");
    host = new PluginHost(state, { officialPlugins: supply }); await host.start();
    const status = (await host.list())[0]!;
    assert.equal(status.official, false); assert.equal(status.running, false); assert.match(status.error!, /verification/);
    await assert.rejects(host.invoke("trust", { id: manifest.id, registrationId: status.registrationId }), /disabled/);
    await assert.rejects(host.invoke("enable", { id: manifest.id }), /verification/);
    await assert.rejects(host.invoke("enable", { id: manifest.id, trust: true }), /disabled/);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});


test("plugin service shutdown waits for startup and confirms the started child exits once", async t => {
  const { createPluginService } = await import("../server/plugin-service.ts");
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-start-close-"));
  const file = path.join(root, "state.json");
  const directory = lifecycleFixture(root, "fixture.start", `export function activate(){return {operations:{},status:()=>({available:true,message:String(process.pid),folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
  const seed = new PluginHost(file, { officialPlugins: [] });
  try {
    await seed.invoke("register", { directory });
    await seed.invoke("trust", { id: "fixture.start", registrationId: (await seed.list())[0]!.registrationId });
    await seed.invoke("enable", { id: "fixture.start" });
  } finally { await seed.close(); }
  const service = createPluginService(null, file);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const start = service.host.start.bind(service.host);
  t.mock.method(service.host, "start", async () => { await start(); entered(); await gate; });
  const cleanup = t.mock.method(service.host, "close", service.host.close.bind(service.host));
  t.after(async () => { release(); await service.close(); rmSync(root, { recursive: true, force: true }); });
  const starting = service.start();
  await waiting;
  const pid = Number((await service.host.list()).find(plugin => plugin.id === "fixture.start")!.status!.message);
  assert.ok(pid > 0); assert.doesNotThrow(() => process.kill(pid, 0));
  let closed = false;
  const closing = service.close();
  void closing.then(() => { closed = true; });
  assert.equal(service.close(), closing);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, false, "startup owns its resources until it settles");
  await assert.rejects(service.start(), /closing/);
  release(); await starting; await closing;
  await service.close();
  assert.equal(cleanup.mock.callCount(), 1);
  assert.throws(() => process.kill(pid, 0), "shutdown confirms the exact child has exited");
});

test("health check publication enforces the SDK result even with a permissive plugin schema", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-health-"));
  const host = new PluginHost(path.join(root, "state.json"), { officialPlugins: [] });
  try {
    const directory = lifecycleFixture(root, "fixture.health", `export function activate(c){return {operations:{connection:()=>c.settings.invalid ? {ok:true,message:'fixed',raw:'private service response'} : {ok:false,message:'Service unavailable'}},status:()=>({available:true,message:'ready',folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
    const file = path.join(directory, "litzio-plugin.json"), manifest = JSON.parse(readFileSync(file, "utf8"));
    manifest.requiresSdk = ">=0.3.0 <1.0.0";
    manifest.settingsSchema = { type: "object", properties: { invalid: { type: "boolean" } } };
    manifest.contributes = { healthCheck: "connection", operations: [{ id: "connection", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "object" } }] };
    writeFileSync(file, JSON.stringify(manifest));
    await host.invoke("register", { directory });
    await host.invoke("trust", { id: manifest.id, registrationId: (await host.list())[0]!.registrationId });
    await host.invoke("enable", { id: manifest.id });
    const valid = await host.invokeOperation("fixture.health.connection", {});
    assert.deepEqual(valid.result, { ok: false, message: "Service unavailable" });
    assert.equal(valid.receipt.outcome, "success");
    await host.invoke("settings", { id: manifest.id, settings: { invalid: true } });
    const invalid = await host.invokeOperation("fixture.health.connection", {});
    assert.equal(invalid.receipt.outcome, "failure");
    assert.equal(invalid.result, undefined);
    assert.ok(!JSON.stringify(invalid).includes("private service response"));
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("Jira activates with empty ordinary settings and guides connection setup", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-jira-empty-"));
  const host = new PluginHost(path.join(root, "state.json"), { officialPlugins: [], designatedPlugins: [], secrets: {
    supported: true, async read() { return "synthetic-pat"; }, async status() { return true; }, async set() {}, async delete() {},
  } });
  try {
    const directory = path.resolve("../../community-plugins/jira");
    await host.invoke("register", { directory });
    const id = "community.jira";
    await host.invoke("trust", { id, registrationId: (await host.list()).find(p => p.id === id)!.registrationId });
    await host.invoke("enable", { id });
    const connection = await host.invokeOperation(`${id}.connection`, {});
    assert.deepEqual(connection.result, { ok: false, message: "Jira 주소를 입력하세요." });
    for (const [operation, input] of [["issues", {}], ["jql", { jql: "project = MOCK" }], ["detail", { key: "MOCK-1" }], ["current-account", {}], ["users", { query: "mo" }], ["projects", { query: "mo" }]] as const) {
      const result = await host.invokeOperation(`${id}.${operation}`, input);
      assert.ok("errorKind" in result);
      assert.equal(result.errorKind, "not_found");
      assert.equal(result.error, "Target not found. Check the target address or identifier.");
    }
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("Jira artifact filters reject malformed dates/JQL controls and detail preserves bounded text and comment range", async t => {
  const source = readFileSync(new URL("../../../community-plugins/jira/host.js", import.meta.url), "utf8");
  const { activate } = await import("data:text/javascript;base64," + Buffer.from(source.replace('"@litzio/plugin-sdk"', JSON.stringify(import.meta.resolve("@litzio/plugin-sdk")))).toString("base64"));
  let calls: URL[] = [], body: any = { startAt: 0, total: 0, issues: [] };
  t.mock.method(globalThis, "fetch", async (url: string) => { calls.push(new URL(url)); return new Response(JSON.stringify(body)); });
  const plugin = activate({ settings: { baseUrl: "https://jira.example.com/jira" }, secrets: { pat: "synthetic" } });
  t.after(() => plugin.dispose());
  for (const input of [{ dateFrom: "2026-02-29" }, { dateTo: "2026-13-01" }, { dateFrom: "2026-11-09", dateTo: "2026-11-01" }, { project: 'X" OR true' }, { reporter: "user\nOR true" }]) {
    await assert.rejects(plugin.operations.issues(input));
  }
  assert.equal(calls.length, 0);
  await plugin.operations.issues({ dateField: "생성일", reporter: 'name"\\x', project: "MOCK", dateFrom: "2024-02-29", dateTo: "2024-02-29" });
  assert.equal(calls[0]!.searchParams.get("jql"), 'assignee = currentUser() AND resolution = Unresolved AND project = "MOCK" AND reporter = "name\\"\\\\x" AND created >= "2024-02-29" AND created < "2024-03-01" ORDER BY updated DESC');
  await assert.rejects(plugin.operations.jql({ jql: " " }));
  await assert.rejects(plugin.operations.jql({ jql: "x".repeat(4001) }));
  const offsets: number[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get("jql"), "project = MOCK ORDER BY updated DESC");
    assert.equal(query.get("fields"), "summary,status,assignee,reporter,created,updated,priority,issuetype,resolution,duedate,components,labels");
    assert.equal(query.get("maxResults"), String(500 - Number(query.get("startAt"))));
    const startAt = Number(query.get("startAt")); offsets.push(startAt);
    return new Response(JSON.stringify({ startAt, maxResults: 2, total: 4, issues: Array.from({length: startAt === 0 ? 2 : 1}, (_, i) => ({key: `MOCK-${startAt+i+1}`, fields:{summary:"Fixture", created:"2025-12-31T23:30:00.000+0000", updated:"2026-01-01T01:30:00.000+0000", duedate:"2026-01-02"}})) }));
  });
  const result = await plugin.operations.jql({jql:"project = MOCK ORDER BY updated DESC"});
  assert.equal(result.truncated, false); assert.equal(result.total, 4);
  const rows = result.rows;
  assert.deepEqual(rows.map((r: any) => r.key), ["MOCK-1", "MOCK-2", "MOCK-3", "MOCK-4"]);
  const localTime = (value: string) => {
    const d = new Date(value), pad = (v: number) => String(v).padStart(2, "0");
    return `${pad(d.getFullYear() % 100)}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  assert.equal(rows[0].created, localTime("2025-12-31T23:30:00Z"));
  assert.equal(rows[0].updated, localTime("2026-01-01T01:30:00Z"));
  assert.ok(rows[0].created < rows[0].updated);
  assert.equal(rows[0].dueDate, "26-01-02");
  assert.equal(rows[0].assignee, "—");
  assert.deepEqual(offsets, [0, 2, 3]);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({errorMessages:["RAW-JIRA-SENTINEL"]}), {status:400}));
  await assert.rejects(plugin.operations.jql({jql:"project ="}), (e: any) => e.kind === "failed" && !e.message.includes("SENTINEL"));
  body = { key: "MOCK-1", fields: { description: null } };
  t.mock.method(globalThis, "fetch", async (url: string) => new Response(JSON.stringify(url.includes("/comment?") ? { startAt: 0, total: 0, comments: [] } : body)));
  const detail = await plugin.operations.detail({ key: "MOCK-1" });
  assert.equal(detail.description, ""); assert.equal(detail.commentsTotal, 0); assert.equal(detail.commentsReturned, 0);
  t.mock.method(globalThis, "fetch", async (url: string) => new Response(JSON.stringify(url.includes("/comment?") ? { startAt: 0, total: 1, comments: [{ id: "1", body: "Comment", created: "2026-01-01T01:30:00.000+0000", updated: "2026-01-01T02:30:00.000+0000" }] } : body)));
  const withComment = await plugin.operations.detail({ key: "MOCK-1" });
  assert.equal(withComment.comments[0].created, localTime("2026-01-01T01:30:00Z"));
  assert.equal(withComment.comments[0].updated, localTime("2026-01-01T02:30:00Z"));
  body.fields.description = {};
  await assert.rejects(plugin.operations.detail({ key: "MOCK-1" }));
});

test("registered icons enforce image bounds, artifact links and digest trust", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-icons-")), host = new PluginHost(path.join(root, "state.json"));
  try {
    const directory = lifecycleFixture(root, "fixture.icon");
    const manifestFile = path.join(directory, "litzio-plugin.json"), icon = path.join(directory, "icon.svg");
    const manifest = { ...JSON.parse(readFileSync(manifestFile, "utf8")), requiresSdk: ">=0.4.0 <1.0.0", icon: "icon.svg" };
    writeFileSync(manifestFile, JSON.stringify(manifest));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="blue"/></svg>';
    for (const invalid of [svg.replace('width="16"', 'width="257"'), svg.replace('height="16"', 'height="0"'), '<html/>', svg + ' '.repeat(65536), '<svg']) {
      writeFileSync(icon, invalid); await assert.rejects(host.invoke("register", { directory }));
    }
    writeFileSync(icon, svg);
    await host.invoke("register", { directory });
    const digest = (await host.list())[0]!.digest!;
    assert.throws(() => host.icon(manifest.id, digest), /unavailable/);
    await host.invoke("trust", { id: manifest.id, registrationId: (await host.list())[0]!.registrationId, digest });
    assert.equal(host.icon(manifest.id, digest).mime, "image/svg+xml");
    assert.equal(host.icon(manifest.id, digest).bytes.toString(), svg);
    writeFileSync(icon, svg.replace('blue', 'red'));
    assert.throws(() => host.icon(manifest.id, digest), /unavailable/);
    const updatedDigest = (await host.list())[0]!.digest!;
    assert.equal((await host.list())[0]!.iconDigest, updatedDigest);
    assert.equal(host.icon(manifest.id, updatedDigest).mime, "image/svg+xml");
    rmSync(icon); const linked = path.join(directory, "linked");
    symlinkSync(directory, linked, "junction");
    await assert.rejects(host.invoke("register", { directory }), /linked/);
    rmSync(linked);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFYQAAAAASUVORK5CYII=", "base64");
    writeFileSync(manifestFile, JSON.stringify({ ...manifest, icon: "icon.png" }));
    writeFileSync(path.join(directory, "icon.png"), png); await host.invoke("register", { directory });
    png.writeUInt32BE(257, 16); writeFileSync(path.join(directory, "icon.png"), png);
    await assert.rejects(host.invoke("register", { directory }), /dimensions/);
    writeFileSync(path.join(directory, "icon.png"), "not png"); await assert.rejects(host.invoke("register", { directory }), /PNG/);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("suggestion admission and generic CLI invocation share validated results", async () => {
 const root=mkdtempSync(path.join(os.tmpdir(),"litzio-suggestions-"));
 const host=new PluginHost(path.join(root,"state.json"),{officialPlugins:[]});
 const directory=path.join(root,"artifact");mkdirSync(directory);
 const operations=[{id:"search",version:1,effect:"read",scope:"host",inputSchema:{type:"object",properties:{person:{type:"string"}}},outputSchema:{type:"array"},rowSchema:{name:{type:"string",label:"Name"}},inputSuggestions:{person:"people"},inputHints:{person:"hint"}},{id:"people",version:1,effect:"read",scope:"host",inputSchema:{type:"object",properties:{query:{type:"string"}},required:["query"],additionalProperties:false},outputSchema:{type:"array"}}];
 operations.push({id:"hint",version:1,effect:"read",scope:"host",inputSchema:{type:"object"},outputSchema:{type:"object"}} as any);
 writeFileSync(path.join(directory,"litzio-plugin.json"),JSON.stringify({schemaVersion:1,id:"fixture.people",tier:"community",publisher:{id:"fixture",name:"Fixture"},name:"Fixture",version:"0.1.0",requiresSdk:"^0.3.0",entry:"host.js",contributes:{operations}}));
 writeFileSync(path.join(directory,"package.json"),JSON.stringify({type:"module",version:"0.1.0"}));
 writeFileSync(path.join(directory,"host.js"),`export function activate(){return {operations:{hint:({bad})=>({text:bad?"x".repeat(513):"Current user"}),search:()=>[],people:({query})=>query==='bad'?[{value:'missing label'}]:[{value:'id',label:'Example person'}]},status:()=>({available:true,message:'',folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
 try {
  await host.invoke("register",{directory});
  await host.invoke("trust",{id:"fixture.people",registrationId:(await host.list())[0]!.registrationId});
  await host.invoke("enable",{id:"fixture.people"});
  assert.deepEqual(host.viewOperations().find(op=>op.operation==='fixture.people.search')?.inputSuggestions,{person:{operation:'fixture.people.people',version:1}});
  assert.deepEqual(host.viewOperations().find(op=>op.operation==='fixture.people.search')?.inputHints,{person:{operation:'fixture.people.hint',version:1}});
  for (const action of ["invoke","input-hint"]) assert.deepEqual((await host.invoke(action,{operation:"fixture.people.hint",version:1,input:{}}) as any).result,{text:"Current user"});
  assert.equal((await host.invoke("invoke",{operation:"fixture.people.hint",input:{bad:true}}) as any).receipt.outcome,"failure");
  await assert.rejects(host.invoke("input-hint",{operation:"fixture.people.hint",version:2}),/unavailable/);
  await assert.rejects(host.invoke("input-hint",{operation:"fixture.people.search",version:1}),/unavailable/);
  const input={operation:"fixture.people.people",version:1,input:{query:"ex"}};
  for(const action of ["invoke","suggest"]) assert.deepEqual((await host.invoke(action,input) as any).result,[{value:"id",label:"Example person"}]);
  await assert.rejects(host.invoke("suggest",{...input,version:2}),/unavailable/);
  assert.equal((await host.invoke("invoke",{...input,input:{query:"bad"}}) as any).receipt.outcome,"failure");
  await assert.rejects(host.invoke("suggest",{operation:"fixture.people.search",input:{}}),/unavailable/);
 } finally { await host.close();rmSync(root,{recursive:true,force:true}); }
});


test("registration trust survives updates and restart, but not removal", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-registration-trust-"));
  const file = path.join(root, "state.json");
  let host = new PluginHost(file, { officialPlugins: [], designatedPlugins: [] });
  try {
    const directory = lifecycleFixture(root, "fixture.trust"), id = "fixture.trust";
    await host.invoke("register", { directory });
    const originalRegistration = (await host.list())[0]!.registrationId;
    assert.equal((await host.list())[0]!.trusted, false);
    await assert.rejects(host.invoke("enable", { id }), /trust/);
    assert.equal((await host.list())[0]!.trusted, false);
    await host.invoke("enable", { id, registrationId: (await host.list())[0]!.registrationId, trust: true });
    assert.equal((await host.list())[0]!.trusted, true);
    assert.equal((await host.list())[0]!.running, true);
    writeFileSync(path.join(directory, "update.txt"), "updated");
    assert.equal((await host.list())[0]!.trusted, true);
    await host.invoke("reload", { id });
    await host.close(); host = new PluginHost(file, { officialPlugins: [], designatedPlugins: [] });
    await host.start();
    assert.equal((await host.list())[0]!.running, true);
    assert.equal((await host.list())[0]!.registrationId, originalRegistration);
    await host.invoke("unregister", { id });
    await host.invoke("register", { directory });
    const approval = (await host.list())[0]!;
    assert.equal(approval.trusted, false);
    await host.invoke("unregister", { id });
    await host.invoke("register", { directory });
    assert.equal((await host.list())[0]!.trusted, false);
    await assert.rejects(host.invoke("enable", { id }), /trust/);
    const replacement = (await host.list())[0]!;
    assert.notEqual(replacement.registrationId, approval.registrationId);
    assert.equal(replacement.digest, approval.digest, "identical bytes still belong to a new registration");
    const unchanged = readFileSync(file, "utf8");
    for (const action of ["trust", "enable"]) {
      await assert.rejects(host.invoke(action, { id, registrationId: approval.registrationId, ...(action === "enable" ? { trust: true } : {}) }), /registration changed/i);
      assert.equal(readFileSync(file, "utf8"), unchanged);
    }
    await assert.rejects(host.invoke("enable", { id, trust: true }), /registration changed/i);
    assert.equal((await host.list())[0]!.trusted, false);
    assert.equal((await host.list())[0]!.running, false);
    await host.invoke("trust", { id, registrationId: (await host.list())[0]!.registrationId });
    const beforeReplacement = (await host.list())[0]!;
    const other = path.join(root, "other"); mkdirSync(other);
    const replacementDirectory = lifecycleFixture(other, id);
    await host.invoke("register", { directory: replacementDirectory });
    await assert.rejects(host.invoke("enable", { id, registrationId: beforeReplacement.registrationId, trust: true }), /registration changed/i);
    assert.equal((await host.list())[0]!.trusted, false);
    const fresh = (await host.list())[0]!;
    await host.invoke("enable", { id, registrationId: fresh.registrationId, trust: true });
    assert.equal((await host.list())[0]!.running, true);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("row result envelopes validate coverage and preserve only declared public fields", () => {
  const op = { outputSchema: {}, rowSchema: rowSchema.parse({ name: { type: "string", label: "Name" }, extra: { type: "number", label: "Extra", hidden: true }, token: { type: "string", label: "Token", secret: true } }) };
  const rows = [{ name: "Row", extra: 4, token: "private", undeclared: "no" }];
  const clean = [{ name: "Row", extra: 4 }];
  assert.deepEqual(publicOperationResult(op, rows, []), clean);
  for (const meta of [{ truncated: true }, { truncated: true, total: 20 }, { truncated: false, total: 1 }]) {
    assert.deepEqual(publicOperationResult(op, { rows, ...meta }, []), { rows: clean, ...meta });
  }
  for (const meta of [{}, { truncated: "yes" }, { truncated: true, total: 0 }, { truncated: true, total: 1 }, { truncated: false, total: 2 }, { truncated: true, total: -1 }, { truncated: true, total: 1.5 }]) assert.throws(() => publicOperationResult(op, { rows, ...meta }, []));
});

// Supply/trust policy is exercised here; HTTP browser coverage owns the confirmation UI.
test("designated community supply requires trust, persists across updates and yields to folder registration", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-designated-"));
  const directory = lifecycleFixture(root, "fixture.designated");
  const manifestFile = path.join(directory, "litzio-plugin.json");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  manifest.contributes.operations = [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: {}, outputSchema: { type: "string" } }];
  manifest.settingsSchema = { type: "object", properties: { label: { type: "string" } }, additionalProperties: false };
  writeFileSync(manifestFile, JSON.stringify(manifest));
  const marker = path.join(root, "imported.txt");
  const entry = path.join(directory, "host.js");
  writeFileSync(entry, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'imported');\n` + readFileSync(entry, "utf8").replace("operations:{}", "operations:{read:()=>'designated'}"));
  const designatedPlugins = [{ id: "fixture.designated", directory }];
  const state = path.join(root, "state.json");
  const options = { officialPlugins: [], designatedPlugins };
  let host = new PluginHost(state, options);
  const item = async () => (await host.list()).find(p => p.id === "fixture.designated")!;
  try {
    await host.start();
    assert.ok(await item(), "designated supply is present without registration");
    assert.equal((await item()).bundled, true);
    assert.equal((await item()).official, false);
    assert.equal((await item()).trusted, false);
    assert.equal((await item()).enabled, false);
    await assert.rejects(host.invoke("enable", { id: "fixture.designated" }), /trust/);
    await assert.rejects(host.invoke("unregister", { id: "fixture.designated" }), /disabled/);
    assert.equal(existsSync(marker), false, "listing and rejected enable never import the community entry");
    await host.invoke("settings", { id: "fixture.designated", settings: { label: "saved" } });
    const registrationId = (await item()).registrationId;
    await assert.rejects(host.invoke("enable", { id: "fixture.designated", trust: true, registrationId: "00000000-0000-0000-0000-000000000000" }), /registration/i);
    await host.invoke("enable", { id: "fixture.designated", trust: true, registrationId });
    assert.equal((await item()).running, true);
    assert.equal(readFileSync(marker, "utf8"), "imported");
    await host.close();
    writeFileSync(path.join(directory, "updated.txt"), "app update changes digest");
    const { cpSync } = await import("node:fs");
    const updated = path.join(root, "updated-app"); cpSync(directory, updated, { recursive: true });
    designatedPlugins[0]!.directory = updated;
    host = new PluginHost(state, options); await host.start();
    assert.deepEqual((await item()).settings, { label: "saved" });
    assert.equal((await item()).registrationId, registrationId);
    assert.equal((await item()).running, true);
    await host.invoke("disable", { id: "fixture.designated" });
    await host.invoke("register", { directory });
    assert.equal((await item()).bundled, false);
    assert.equal((await item()).trusted, false);
    await host.close(); host = new PluginHost(state, options); await host.start();
    assert.equal((await item()).bundled, false);
    await host.invoke("unregister", { id: "fixture.designated" });
    await host.close(); host = new PluginHost(state, options); await host.start();
    assert.equal((await item()).bundled, true);
    assert.equal((await item()).trusted, false);
    assert.equal((await item()).enabled, false);
    // Remove an override, then admit a different plugin whose dotted operation
    // occupies the returning supply's full name before the next Host start.
    await host.invoke("register", { directory });
    await host.invoke("unregister", { id: "fixture.designated" });
    const rivalDirectory = lifecycleFixture(root, "fixture", "export function activate(){return {operations:{'designated.read':()=> 'rival'},status:()=>({available:true,message:'rival',folders:[],decorations:[],accounts:[]}),dispose(){}}}");
    const rivalFile = path.join(rivalDirectory, "litzio-plugin.json");
    const rivalManifest = JSON.parse(readFileSync(rivalFile, "utf8"));
    rivalManifest.contributes.operations = [{ ...manifest.contributes.operations[0], id: "designated.read" }];
    writeFileSync(rivalFile, JSON.stringify(rivalManifest));
    await host.invoke("register", { directory: rivalDirectory });
    const rival = (await host.list()).find(p => p.id === "fixture")!;
    await host.invoke("enable", { id: rival.id, registrationId: rival.registrationId, trust: true });
    await host.close();
    const { unlinkSync } = await import("node:fs"); unlinkSync(marker);
    host = new PluginHost(state, options); await host.start();
    assert.equal((await item()).error, "Plugin operation ID collision");
    assert.equal((await item()).running, false);
    assert.equal(existsSync(marker), false, "conflicting supply is not imported on startup");
    assert.equal((await host.list()).find(p => p.id === rival.id)!.running, true);
    await assert.rejects(host.invoke("enable", { id: "fixture.designated", registrationId: (await item()).registrationId, trust: true }), /Plugin operation ID collision/);
    assert.equal((await item()).running, false);
    assert.equal(existsSync(marker), false, "rejected enable cannot import the conflicting entry");
    assert.equal((await host.invokeOperation("fixture.designated.read", {})).result, "rival");
    await host.invoke("unregister", { id: rival.id });
    await host.invoke("enable", { id: "fixture.designated" });
    assert.equal((await host.invokeOperation("fixture.designated.read", {})).result, "designated");
    await assert.rejects(host.invoke("register", { directory: rivalDirectory }), /Plugin operation ID collision/);
  } finally { await host.close(); }
});

test("designated distribution payload check rejects a missing runtime file", async () => {
  const { DESIGNATED_COMMUNITY_PLUGINS, assertDesignatedPluginPayload } = await import("../server/plugins/designated-plugins.ts");
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-supply-check-"));
  assert.throws(() => assertDesignatedPluginPayload(root), /community.docling/);
  for (const item of DESIGNATED_COMMUNITY_PLUGINS) {
    const folder = path.join(root, "community-plugins", item.folder); mkdirSync(folder, { recursive: true });
    assert.ok(!item.files.some(file => file.includes("fixtures")));
    for (const file of item.files) writeFileSync(path.join(folder, file), "payload");
  }
  assertDesignatedPluginPayload(root);
  const { unlinkSync } = await import("node:fs");
  unlinkSync(path.join(root, "community-plugins", "docling", "conversion.js"));
  assert.throws(() => assertDesignatedPluginPayload(root), /conversion.js/);
});
