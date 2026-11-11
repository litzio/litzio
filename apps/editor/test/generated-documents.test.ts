import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, mkdirSync, copyFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { commitFile, textRevision } from "@litzio/file-commit";
import { GeneratedDocuments } from "../server/plugins/generated-documents.ts";
import { RootAccess, canonicalFilePath } from "../server/file-access.ts";
import { loadDocumentFile } from "../server/document-reader.ts";
import { generatedDocumentIdentity, generatedDocumentLinkPath, isManagedGeneratedDocument } from "../server/generated-document.ts";
import { emptyReviewLedger, updateReviewLedger, workspaceSnapshotSchema, type ReviewGroupTarget } from "@litzio/plugin-sdk";

test("generic workspace groups preserve source and history through partial decisions, Undo, failures and CLI JSON", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-review-groups-")), file = path.join(root, "review.bin");
  const digest = (value: unknown) => textRevision(JSON.stringify(value));
  const original = { pdf: "%PDF-immutable", json: "immutable source JSON" };
  writeFileSync(file, JSON.stringify({ original, edits: [], ledger: emptyReviewLedger(), snapshot: null }));
  let fail = "";
  const provider = async (_operation: string, input: any) => {
    const record = JSON.parse(readFileSync(input.file, "utf8"));
    const contentRevision = digest(record.edits);
    if (input.mode === fail) throw new Error("Injected candidate failure");
    const state = () => ({ record, ledger: record.ledger, items: [], snapshot: record.snapshot, cacheState: record.snapshot ? "current" : "missing" });
    if (input.mode === "workspace-read") return { result: state() };
    if (input.mode === "workspace-prepare") {
      if (input.change) record.ledger = updateReviewLedger(record.ledger, input.change, {
        contentRevision, snapshotHash: digest(record.snapshot), current: true, requestId: input.requestId, revision: input.revision, at: input.at,
        apply(target: ReviewGroupTarget) { record.edits.push(...target.patch.operations); return [{ restore: "original" }]; },
        undo(_target, inverse) { record.edits.push(...inverse); },
      });
      const preserveSnapshot = contentRevision === digest(record.edits) && !!record.snapshot;
      writeFileSync(input.resultFile.path, JSON.stringify(record));
      return { result: preserveSnapshot ? { preserveSnapshot: true } : {
        // A derived input can own several Core targets. A merged input represents both source IDs.
        build: { authoring: { inputs: record.edits.length ? [{ key: "merged:a+b", blocks: [{kind:"paragraph", text: JSON.stringify(record.edits)}] }] : [{ key: "split:a", blocks: [{kind:"paragraph",text:"First"},{kind:"paragraph",text:"Second"}] }] }, images: [] },
        imageRefs: [], contentRevision: digest(record.edits), adapterVersion: "generic-1",
      } };
    }
    if (input.mode === "workspace-seal") {
      record.snapshot = workspaceSnapshotSchema.parse({ ...input.snapshot, cacheKey: digest(input.snapshot) });
      record.lineage = Object.fromEntries(input.snapshot.inputs.flatMap((item:any) => (item.key === "split:a" ? ["a"] : ["a","b"]).map(id => [id,item.targets])));
      writeFileSync(input.resultFile.path, JSON.stringify(record)); return { result: state() };
    }
    throw new Error("Unexpected provider mode");
  };
  const service = () => new GeneratedDocuments(new RootAccess([root]), () => ({ workspace: true, operation: "fixture", version: 1, assertCurrent() {} }), provider);
  let host = service();
  const base = { root, workspace: "review.bin", plugin: "fixture", job: "import" };
  const read = () => host.execute({ ...base, action: "workspace-groups-read" });
  const mutate = (change: unknown, baseline = textRevision(readFileSync(file,"utf8")), requestId = randomUUID()) => host.execute({ ...base, action: "workspace-review-change", change, baseline, requestId });
  const human = { actor: "human", reason: "Reviewed exact target and change", confirmed: true };
  try {
    const wrongJob=new GeneratedDocuments(new RootAccess([root]),()=>({workspace:false,operation:"fixture",version:1,assertCurrent(){}}),provider);
    const wrongJobResult=await wrongJob.execute({...base,action:"workspace-read"});
    assert.equal(wrongJobResult.receipt.outcome,"failure");assert.match(wrongJobResult.error,/does not create a review workspace/);
    const opened = await host.execute({ ...base, action: "workspace-open", baseline: textRevision(readFileSync(file,"utf8")), requestId: randomUUID() });
    assert.equal(opened.receipt.outcome, "success", JSON.stringify(opened));
    assert.equal(opened.snapshot.inputs[0].targets.length, 2, "one source binds to multiple final Core targets");
    assert.deepEqual(opened.record.lineage.a,opened.snapshot.inputs[0].targets);
    await mutate({kind:"required-checks",inventory:{contentRevision:opened.contentRevision,pages:[1],targets:["a"],lenses:[{kind:"text",required:true,scope:{pages:[1],targets:["a"]},extracted:true}],requiredChecks:[],complete:true},records:[]});
    await mutate({kind:"inspection",records:[{lens:"text",runId:"run-initial",contentRevision:opened.contentRevision,scope:{pages:[1],targets:["a"]},state:"no-issue",evidence:"Complete fixture scope"}],comparisons:[]});
    const completed=await mutate({kind:"completion",human});
    assert.equal(completed.completion.approved,true,JSON.stringify(completed));
    assert.equal(completed.completion.snapshotHash,digest(opened.snapshot));
    const approvedBytes=readFileSync(file), changedMapping=JSON.parse(approvedBytes.toString());
    changedMapping.snapshot.cacheKey="b".repeat(64);writeFileSync(file,JSON.stringify(changedMapping));
    assert.equal((await read()).completion.approved,false,"unchanged Markdown cannot preserve approval across a different snapshot binding");
    writeFileSync(file,approvedBytes);
    const target = (id: string) => ({ id, locator: { source: id }, pages: [1], regions: [], before: ["old"],
      evidence: [{ observation: "Original differs", materialRef: "page-1", materialHash: "a".repeat(64), inspector: "fixture/1", scope: { pages: [1], targets: [id] } }],
      patch: { expectedBefore: ["old"], expectedContentRevision: opened.contentRevision, operations: [{ text: "new", source: id }], after: ["new"], supported: true, deferredReason: null },
      inspection: "uncertain", proposal: "proposed", result: null, resolved: false, history: [] });
    const group = { id: "g1", reasonCode: "text", reason: "Wrong text", provider: "fixture", providerVersion: "1", sourceRevision: "a".repeat(64), contentRevision: opened.contentRevision,
      createdAt: new Date().toISOString(), runId: "run", representativeTargetId: "a", representativeReason: "Visible difference", splitFrom: null, targets: [target("a"), target("b")] };
    const proposed = await mutate({kind:"groups-propose",groups:[group]});
    assert.equal(proposed.receipt.outcome,"success", JSON.stringify(proposed)); assert.deepEqual(proposed.snapshot,opened.snapshot);
    assert.equal(proposed.ledger.approval,null);
    const before = readFileSync(file);
    assert.equal((await mutate({kind:"groups-approve",groupId:"g1",targetIds:["a"],human,resolvesIssue:true})).receipt.outcome,"failure");
    assert.deepEqual(readFileSync(file),before,"partial decisions require an explicit remainder identity");
    const rejected = await mutate({kind:"groups-reject",groupId:"g1",targetIds:["b"],remainderGroupId:"g2",human,resolvesIssue:false});
    assert.equal(rejected.ledger.groups[0].targets[0].resolved,false,"rejecting a real issue does not resolve it");
    assert.equal(rejected.ledger.groups[1].splitFrom,"g1");
    fail="workspace-prepare";
    assert.equal((await mutate({kind:"groups-approve",groupId:"g2",targetIds:["a"],human,resolvesIssue:true})).receipt.outcome,"failure");
    fail="";
    const fs = (await import("node:fs")).default, { syncBuiltinESMExports } = await import("node:module");
    // File commit resolves aliases (including Windows 8.3 temp roots) before rename.
    const rename = fs.renameSync, beforeCommit = readFileSync(file), commitTarget = canonicalFilePath(file);
    const fault = t.mock.method(fs,"renameSync",(from: import("node:fs").PathLike,to: import("node:fs").PathLike)=>{if(to===commitTarget)throw Object.assign(new Error("Injected commit failure"),{code:"EACCES"});return rename(from,to);});
    syncBuiltinESMExports();
    try {
      const failed = await mutate({kind:"groups-approve",groupId:"g2",targetIds:["a"],human,resolvesIssue:true});
      assert.equal(failed.error,"Injected commit failure");
      assert.equal(failed.errorKind,"uncertain");
      assert.equal(failed.receipt.outcome,"uncertain");assert.deepEqual(readFileSync(file),beforeCommit);
      await assert.rejects(mutate({kind:"groups-approve",groupId:"g2",targetIds:["a"],human,resolvesIssue:true}),/Uncertain workspace/);
      await host.execute({action:"workspace-status",requestId:failed.receipt.requestId}); await read();
    } finally {fault.mock.restore();syncBuiltinESMExports();}
    const requestId=randomUUID();
    const approved = await mutate({kind:"groups-approve",groupId:"g2",targetIds:["a"],human,resolvesIssue:true},rejected.baseline,requestId);
    assert.equal(approved.receipt.outcome,"success",JSON.stringify(approved));
    assert.equal(approved.snapshot.inputs[0].key,"merged:a+b");
    assert.equal(approved.snapshot.inputs[0].targets.length,1,"many source IDs bind to the same final Core target");
    assert.deepEqual(approved.record.lineage.a,approved.record.lineage.b);
    assert.equal(approved.record.lineage.a[0].documentRevision,approved.documentRevision);
    assert.deepEqual(approved.record.original,original); assert.notEqual(approved.documentRevision,opened.documentRevision);
    assert.equal((await host.execute({action:"workspace-status",requestId})).receipt.outcome,"success");
    await assert.rejects(mutate({kind:"groups-undo",groupId:"g2",targetIds:["a"],human},approved.baseline,requestId),/Duplicate requestId/);
    const staleWorkspace=await mutate({kind:"groups-undo",groupId:"g2",targetIds:["a"],human},opened.baseline);
    assert.equal(staleWorkspace.receipt.outcome,"failure");
    assert.equal(staleWorkspace.errorKind,"conflict");
    const undone = await mutate({kind:"groups-undo",groupId:"g2",targetIds:["a"],human});
    const histories = undone.ledger.groups[1].targets[0].history;
    assert.deepEqual(histories.map((h:any)=>h.action),["approved","undone"]);
    assert.equal(histories[1].undoOf,histories[0].id); assert.equal(undone.ledger.groups[1].targets[0].resolved,false);
    assert.deepEqual(undone.record.edits.slice(0,approved.record.edits.length),approved.record.edits,"Undo appends, never erases ledger entries");
    host = service(); assert.equal((await host.execute({action:"workspace-status",requestId})).state,"unknown");
    assert.deepEqual((await read()).ledger,undone.ledger);

    // One real CLI subprocess covers argument parsing, HTTP dispatch and stdout JSON, without a daemon or AI process.
    const { createServer } = await import("node:http"), { spawn } = await import("node:child_process");
    const { DAEMON_PROTOCOL } = await import("../shared/daemon-version.ts");
    const server = createServer(async (req,res) => {
      res.setHeader("Content-Type","application/json");
      if(req.url==="/daemon/health") { res.end(JSON.stringify({protocolVersion:DAEMON_PROTOCOL})); return; }
      try { let body="";for await(const chunk of req)body+=chunk;res.end(JSON.stringify(await host.execute(JSON.parse(body)))); }
      catch(error){res.statusCode=400;res.end(JSON.stringify({error:String(error)}));}
    });
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    try {
      const input=path.join(root,"input.json"), replacement=structuredClone(group);
      replacement.id="cli-replacement";replacement.targets=[replacement.targets[0]!];replacement.contentRevision=undone.contentRevision;
      replacement.targets[0]!.patch.expectedContentRevision=undone.contentRevision;
      writeFileSync(input,JSON.stringify({...base,baseline:undone.baseline,requestId:randomUUID(),change:{groups:[replacement],supersedes:[{groupId:"g2",targetIds:["a"],replacementGroupId:replacement.id}]}}));
      const address=server.address() as {port:number};
      const cli = spawn(process.execPath,["--import","tsx",path.resolve("../../packages/cli/src/cli.ts"),"review","groups","propose","--input",input,"--host",`http://127.0.0.1:${address.port}`,"--json"],{windowsHide:true});
      let stdout="",stderr="";cli.stdout.on("data",b=>stdout+=b);cli.stderr.on("data",b=>stderr+=b);
      const exit=await new Promise<number|null>((resolve,reject)=>{cli.on("error",reject);cli.on("exit",resolve);});
      assert.equal(exit,0,stderr+stdout);
      const fromCli=JSON.parse(stdout);assert.deepEqual(fromCli.ledger.groups[0],undone.ledger.groups[0]);
      assert.deepEqual(fromCli.ledger.groups[1].targets[0].history.map((event:any)=>event.action),["approved","undone","superseded"]);
      assert.equal(fromCli.ledger.groups[2].id,replacement.id);assert.equal(fromCli.ledger.groups[1].targets[0].history.at(-1).supersededBy.groupId,replacement.id);
    } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

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
    if (process.platform === "win32") for (const [file, name] of [[managed, "\u212a.MD"], [ordinary, "K.MD"]]) {
      const alias = path.join(root, name!), expected = generatedDocumentIdentity(file!);
      assert.equal(generatedDocumentIdentity(alias), expected);
      assert.equal(isManagedGeneratedDocument(alias), true);
      const current = readFileSync(alias, "utf8");
      commitFile(alias, current + "\nSaved through a case alias.\n", textRevision(current));
      assert.equal(generatedDocumentIdentity(alias), expected);
      assert.equal(isManagedGeneratedDocument(alias), true);
      assert.equal(loadDocumentFile(alias, new RootAccess([root])).managedGenerated, true);
      const reloaded = await read(name!);
      assert.equal(reloaded.state, "externally-modified");
      assert.equal((await host.execute({ action: "generated-regenerate", root, document: name, baseline: reloaded.baseline, requestId: randomUUID() })).state, "generated");
      assert.equal(isManagedGeneratedDocument(alias), true);
    }
    const beforeQueuedRead = await read("\u212a.md");
    hold = true;
    const pending = read("\u212a.md");
    let queued: Promise<any> | undefined, readFinished = false;
    try {
      assert.equal((await read("k.md")).state, "generated");
      queued = read(process.platform === "win32" ? "\u212a.MD" : "\u212a.md").then(value => { readFinished = true; return value; });
      await Promise.resolve(); assert.equal(readFinished, false, "reopening waits for the previous read");
      await assert.rejects(host.execute({ action: "generated-regenerate", root, document: "\u212a.md", requestId: randomUUID(), baseline: (await read("k.md")).baseline }), /operation in progress/);
    } finally {
      hold = false; release(); await pending;
      const reread = await queued;
      assert.equal(reread.state, beforeQueuedRead.state);
      assert.deepEqual(reread.baseline, beforeQueuedRead.baseline);
    }
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
  let progressGate: Promise<void> | undefined, readGate: Promise<void> | undefined, progressEntered: (() => void) | undefined, readEntered: (() => void) | undefined;
  const provider = async (_op: string, input: any) => {
    const record = JSON.parse(readFileSync(input.file, "utf8"));
    if (input.mode === "patch") {
      record.edits.push(...input.patches); writeFileSync(input.resultFile.path, JSON.stringify(record));
      if (raceSource) writeFileSync(source, "competitor source");
    }
    if (input.mode === "progress") {
      progressEntered?.(); if (progressGate) await progressGate;
      if (raceDocument) writeFileSync(document,"competitor document");
      record.progress = input.progress; writeFileSync(input.resultFile.path, JSON.stringify(record));
      if (raceSource) writeFileSync(source, "competitor source");
    }
    if (input.mode === "read") { readEntered?.(); if (readGate) await readGate; }
    if (input.mode === "build") {
      if (failBuild) return { error: "injected failure" };
      if (raceDocument) writeFileSync(document, "competitor document");
      return { result: { authoring: { inputs: [{ key: "body", blocks: [{ kind: "paragraph", text: record.edits.at(-1)?.text ?? record.original }] }] }, images: [] } };
    }
    return { result: { record, items: [] } };
  };
  const access = new RootAccess([root]);
  let comparison = true;
  const service = () => new GeneratedDocuments(access, () => ({ operation: "fixture.provider", version: 1, comparison: comparison ? "inspect" : undefined, assertCurrent() {} }), provider);
  let host = service();
  const read = () => host.execute({ action: "generated-read", root, document: "result.md" });
  const patch = async (text: string, baseline = undefined as any) => host.execute({ action: "generated-patch", root, document: "result.md", baseline: baseline ?? (await read()).baseline, patches: [{ text }], requestId: randomUUID() });
  try {
    const opened = await host.execute({ action: "generated-open", root, document: "result.md", plugin: "fixture", job: "import", source: "source.bin",
      baseline: { sourceRevision: textRevision(readFileSync(source, "utf8")), documentRevision: null, linkRevision: null }, requestId: randomUUID() });
    assert.equal(opened.state, "generated");
    assert.equal(loadDocumentFile(document, access).managedGenerated, true);
    const find = (locator?: string, scope = root) => host.execute({ action: "generated-find", root: scope, ...(locator ? { path: locator } : {}) });
    const expectedConnection = { match: "source", root: generatedDocumentIdentity(root), document: "result.md", source: "source.bin", plugin: "fixture", job: "import" };
    assert.deepEqual((await find("source.bin")).documents, [expectedConnection]);
    assert.deepEqual((await find("result.md")).documents, [{ ...expectedConnection, match: "document" }]);
    if (process.platform === "win32") assert.deepEqual((await find("RESULT.MD")).documents, [{ ...expectedConnection, match: "document" }]);
    assert.equal((await find()).receipt.operation, "review.find");
    assert.equal((await find()).receipt.outcome, "success");
    assert.deepEqual((await find("unconnected.bin")).documents, []);
    await assert.rejects(find("../outside.bin"), /outside/);
    await assert.rejects(find(source), /Root-relative/);
    const child = path.join(root, "child"); mkdirSync(child);
    assert.deepEqual((await find(undefined, child)).documents, [], "Root-scoped lookup does not disclose parent connections");
    comparison = false;
    assert.deepEqual((await find()).documents, [], "only jobs declaring comparison are discoverable");
    comparison = true;
    // Discovery survives a Host restart and stale bytes; the comparison owns revision validation.
    host = service();
    const originalSource = readFileSync(source);
    writeFileSync(source, "stale input");
    assert.deepEqual((await find("source.bin")).documents, [expectedConnection]);
    assert.equal((await host.execute({ action: "generated-compare", root, document: "result.md" })).state, "regeneration-required");
    rmSync(source);
    assert.deepEqual((await find("source.bin")).documents, [expectedConnection]);
    assert.equal((await host.execute({ action: "generated-compare", root, document: "result.md" })).state, "regeneration-required");
    writeFileSync(source, originalSource);
    const linkPath = generatedDocumentLinkPath(document), linkBytes = readFileSync(linkPath);
    writeFileSync(linkPath, "malformed connection");
    assert.deepEqual((await find()).documents, []);
    writeFileSync(linkPath, linkBytes);
    assert.equal((await read()).state, "generated");
    const old = (await read()).baseline;
    const first = await patch("corrected"); assert.equal(first.correctionsSaved, true); assert.equal(first.documentRegenerated, true);
    const originalDocument = readFileSync(document), beforeProgress = await read(), progressId = randomUUID();
    const progress = await host.execute({action:"generated-progress",root,document:"result.md",baseline:beforeProgress.baseline,progress:{checkedPages:[1],lastPage:1},requestId:progressId});
    assert.equal(progress.progressSaved,true); assert.deepEqual(readFileSync(document),originalDocument);
    assert.equal((await read()).state,"generated");
    assert.deepEqual(JSON.parse(readFileSync(source,"utf8")).edits,beforeProgress.record.edits);
    assert.equal((await host.execute({action:"generated-status",requestId:progressId})).progressSaved,true);
    // A slow progress preparation permits coherent reads. Publication waits for those
    // readers, and reads arriving at publication observe the new baseline.
    let releaseProgress!: () => void, releaseRead!: () => void;
    progressGate = new Promise<void>(resolve => { releaseProgress = resolve; });
    const entered = new Promise<void>(resolve => { progressEntered = resolve; });
    const concurrentBaseline = (await read()).baseline;
    let savedConcurrent = false;
    const concurrentSave = host.execute({action:"generated-progress",root,document:"result.md",baseline:concurrentBaseline,progress:{checkedPages:[],lastPage:1},requestId:randomUUID()}).then(value => { savedConcurrent = true; return value; });
    await entered;
    readGate = new Promise<void>(resolve => { releaseRead = resolve; });
    const reading = new Promise<void>(resolve => { readEntered = resolve; });
    const concurrentRead = read(); await reading;
    releaseProgress(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(savedConcurrent,false);
    const afterPublication = read();
    releaseRead(); await concurrentRead;
    assert.equal((await concurrentSave).progressSaved,true);
    assert.equal((await afterPublication).baseline.sourceRevision,(await read()).baseline.sourceRevision);
    progressGate = readGate = undefined; progressEntered = readEntered = undefined;
    const staleProgress = await host.execute({action:"generated-progress",root,document:"result.md",baseline:beforeProgress.baseline,progress:{checkedPages:[],lastPage:null},requestId:randomUUID()});
    assert.equal(staleProgress.receipt.outcome,"failure");
    const bytes = readFileSync(source);
    raceDocument = true;
    const racingProgress = await host.execute({action:"generated-progress",root,document:"result.md",baseline:(await read()).baseline,progress:{checkedPages:[],lastPage:null},requestId:randomUUID()});
    assert.equal(racingProgress.receipt.outcome,"failure"); assert.deepEqual(readFileSync(source),bytes);
    assert.equal(readFileSync(document,"utf8"),"competitor document");
    raceDocument = false; writeFileSync(document,originalDocument);

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
