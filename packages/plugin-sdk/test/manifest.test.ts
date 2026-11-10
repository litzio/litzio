import test from "node:test";
import assert from "node:assert/strict";
import { emptyReviewLedger, updateReviewLedger, evaluateReviewCompletion, reviewLedgerSchema, reviewLedgerChangeSchema } from "../src/index.ts";
import { authorDocument, readReviewDocument, validateReviewTargets, reviewCellsSchema, workspaceRequestSchema, reviewGroupTargetSchema } from "../src/index.ts";

test("review SDK binds public block and cell targets to the exact final canonical snapshot",async()=>{
  const authored=await authorDocument({inputs:[{key:"table",blocks:[{kind:"table",rows:[["a",""]]}]}]});
  const snapshot=readReviewDocument(authored.source), table=snapshot.document.blocks.find(block=>block.block==="table")!;
  assert.ok(table.block==="table");
  const targets=table.rows[0].cells.map(cell=>({path:[...cell.path],documentRevision:authored.documentRevision,documentHash:authored.documentHash}));
  validateReviewTargets(snapshot,[...authored.inputs[0].targets,...targets]);
  assert.throws(()=>validateReviewTargets(snapshot,[{...targets[0],documentRevision:"a".repeat(64)}]),/stale/);
  assert.throws(()=>validateReviewTargets(snapshot,[{...targets[0],path:[...targets[0].path,0]}]),/Invalid/);
  assert.equal(workspaceRequestSchema.parse({action:"workspace-material",kind:"cells",root:"root",workspace:"file",plugin:"fixture",job:"import",baseline:"a".repeat(64)}).action,"workspace-material");
  assert.ok(reviewCellsSchema.parse([{sourceLocator:{cell:null},locator:{cell:null},positions:[{row:0,column:1}],sourceText:"",text:"",disposition:"supported",regions:[],targets:[targets[1]]}]));
  assert.ok(reviewGroupTargetSchema.shape.documentTargets.parse(targets));
});

function reviewScenario() {
  let ledger = emptyReviewLedger(), content = 1, sequence = 0;
  const hash = () => content.toString(16).padStart(64,"0");
  const human = { actor:"person",reason:"Checked exact revised target",confirmed:true };
  const context = () => ({contentRevision:hash(),snapshotHash:hash(),current:true,requestId:"dc76af39-193b-4da6-b6c4-08ff5ef8ac26",revision:`r${++sequence}`,at:"2026-11-11T00:00:00Z",apply(){content++;return [{restore:true}];},undo(){content++;}});
  const change = (value:unknown) => ledger = updateReviewLedger(ledger,reviewLedgerChangeSchema.parse(value),context());
  const group = (id:string, targets:string[], reasonCode="text") => ({id,reasonCode,reason:"Observed difference",provider:"fixture",providerVersion:"1",sourceRevision:"a".repeat(64),contentRevision:hash(),createdAt:"2026-11-11T00:00:00Z",runId:`run-${id}`,representativeTargetId:targets[0],representativeReason:"Exact evidence",splitFrom:null,
    targets:targets.map(id=>({id,locator:{ref:id},pages:[1],regions:[],before:["old"],evidence:[{observation:"Source differs",materialRef:"page",materialHash:hash(),inspector:"fixture",scope:{pages:[1],targets:[id]}}],patch:{expectedBefore:["old"],expectedContentRevision:hash(),operations:[{ref:id,text:"new"}],after:["new"],supported:true,deferredReason:null},inspection:"uncertain",proposal:"proposed",result:null,resolved:false,history:[]}))});
  const decide = (kind:string,groupId:string,targetIds:string[],extra={}) => change({kind,groupId,targetIds,human,resolvesIssue:true,...extra});
  return {get ledger(){return ledger;},hash,human,context,change,group,decide};
}

for (const scenario of ["remaining", "split", "undo"] as const) test(`review supersede preserves history and restores approval after ${scenario}`, () => {
  const s=reviewScenario();
  s.change({kind:"groups-propose",groups:scenario==="split"?[s.group("ab",["a","b"])]:[s.group("a",["a"]),s.group("b",["b"])]});
  s.decide("groups-approve",scenario==="split"?"ab":"a",["a"],scenario==="split"?{remainderGroupId:"b"}:{});
  const oldGroup=scenario==="undo"?"a":"b", target=scenario==="undo"?"a":"b";
  if(scenario==="undo")s.decide("groups-undo","a",["a"]);
  assert.throws(()=>s.decide("groups-approve",oldGroup,[target]),/stale/);
  const history=structuredClone(s.ledger.groups.find(g=>g.id===oldGroup)!.targets[0]!.history);
  s.change({kind:"groups-propose",groups:[s.group("replacement",[target])],supersedes:[{groupId:oldGroup,targetIds:[target],replacementGroupId:"replacement"}]});
  const old=s.ledger.groups.find(g=>g.id===oldGroup)!.targets[0]!;
  assert.equal(old.proposal,"superseded");assert.deepEqual(old.history.slice(0,history.length),history);
  assert.deepEqual((old.history.at(-1) as any).supersededBy,{groupId:"replacement",targetIds:[target]});
  s.decide("groups-approve","replacement",[target]);
  assert.equal(s.ledger.groups.find(g=>g.id==="replacement")!.targets[0]!.result,"applied");
  if(scenario==="undo")s.decide("groups-reject","b",["b"]);
  assert.equal(evaluateReviewCompletion(s.ledger,s.hash(),s.hash(),true).incomplete.includes("open-or-uncertain-groups"),false);
  assert.throws(()=>s.change({kind:"groups-propose",groups:[s.group("invalid",[target])],supersedes:[{groupId:"replacement",targetIds:[target],replacementGroupId:"invalid"}]}),/open proposed/);
});

test("review duplicate targets require explicit supersede within the same reason",()=>{
  const s=reviewScenario();s.change({kind:"groups-propose",groups:[s.group("first",["a"])]});
  assert.throws(()=>s.change({kind:"groups-propose",groups:[s.group("duplicate",["a"])]}),/Duplicate open/);
  const renamedProvider=s.group("renamed-provider",["a"]);renamedProvider.provider="other";
  assert.throws(()=>s.change({kind:"groups-propose",groups:[renamedProvider]}),/Duplicate open/);
  const alias=s.group("alias",["alias"]);alias.targets[0]!.locator={ref:"a"};
  assert.throws(()=>s.change({kind:"groups-propose",groups:[alias]}),/Duplicate open/);
  const reassigned=s.group("reassigned",["a"]);reassigned.targets[0]!.locator={ref:"other"};
  assert.throws(()=>s.change({kind:"groups-propose",groups:[reassigned],supersedes:[{groupId:"first",targetIds:["a"],replacementGroupId:"reassigned"}]}),/preserve.*identity/);
  s.change({kind:"groups-propose",groups:[s.group("different-reason",["a"],"structure")]});
  s.decide("groups-reject","first",["a"]);
  assert.throws(()=>s.change({kind:"groups-propose",groups:[s.group("replace-rejected",["a"])],supersedes:[{groupId:"first",targetIds:["a"],replacementGroupId:"replace-rejected"}]}),/open proposed/);
  assert.ok(evaluateReviewCompletion(s.ledger,s.hash(),s.hash(),true).incomplete.includes("open-or-uncertain-groups"));
  s.decide("groups-reject","different-reason",["a"]);
  assert.equal(evaluateReviewCompletion(s.ledger,s.hash(),s.hash(),true).incomplete.includes("open-or-uncertain-groups"),false);
});

test("Undo refuses an open same-reason proposal before replay and succeeds after its rejection",()=>{
  const s=reviewScenario();s.change({kind:"groups-propose",groups:[s.group("A",["t4"])]});
  s.decide("groups-approve","A",["t4"]);
  const next=s.group("B",["t4"]);next.targets[0]!.before=["new"];next.targets[0]!.patch.expectedBefore=["new"];
  next.targets[0]!.patch.after=["newer"];next.targets[0]!.patch.operations[0]!.text="newer";
  s.change({kind:"groups-propose",groups:[next]});
  const before=structuredClone(s.ledger), contentBefore=s.hash();
  assert.throws(()=>s.decide("groups-undo","A",["t4"]),error=>{
    assert.match(String(error),/Duplicate open/);assert.match(String(error),/group "B"/);assert.match(String(error),/target "t4"/);return true;
  });
  assert.deepEqual(s.ledger,before,"refusing Undo must preserve every target and history entry");
  assert.equal(s.hash(),contentBefore,"refusing Undo must not invoke source replay");
  s.decide("groups-reject","B",["t4"]);
  s.decide("groups-undo","A",["t4"]);
  assert.equal(s.ledger.groups[0]!.targets[0]!.proposal,"proposed");
  assert.deepEqual(s.ledger.groups[0]!.targets[0]!.history.map(event=>event.action),["approved","undone"]);
  assert.equal(s.ledger.groups[1]!.targets[0]!.proposal,"rejected");
});

function comparedReviewScenario() {
  const s=reviewScenario(), hash=s.hash(), scope={pages:[1],targets:["figure"]};
  const lenses=["text","structure","reading","formula","table","picture","decoration"];
  s.change({kind:"required-checks",inventory:{contentRevision:hash,pages:[1],targets:["figure"],lenses,requiredChecks:[{id:"figure",kind:"picture",locator:{ref:"original"},pages:[1],regions:[],disposition:"supported",derivedFrom:["original"]}],complete:true},records:[]});
  s.change({kind:"inspection",records:lenses.map(lens=>({lens,runId:lens,contentRevision:hash,scope,state:"no-issue",evidence:"Complete coverage"})),comparisons:[{runId:"image",contentRevision:hash,scope,state:"compared",selected:true,withdrawn:null}]});
  const record={targetIds:["figure"],contentRevision:hash,result:"no-issue",method:"approved-comparison",human:s.human,runId:"image",approvedRun:{requestId:s.context().requestId,scope,contentRevision:hash,completed:true,resultRecorded:true},at:"2026-11-11T00:00:00Z"};
  const withdraw=()=>s.change({kind:"inspection",records:[],comparisons:[{runId:"image",contentRevision:hash,scope,state:"partial",selected:false,withdrawn:s.human}]});
  return {s,record,withdraw};
}
test("required confirmation rejects a withdrawn or incomplete latest comparison despite older success",()=>{
  const {s,record,withdraw}=comparedReviewScenario();
  s.change({kind:"inspection",records:[],comparisons:[{runId:"image",contentRevision:s.hash(),scope:{pages:[1],targets:["figure"]},state:"partial",selected:true,withdrawn:null}]});
  assert.throws(()=>s.change({kind:"required-checks",records:[record]}),/Completed approved/);
  withdraw();
  assert.throws(()=>s.change({kind:"required-checks",records:[record]}),/Completed approved/);
});
test("completion revalidates existing required confirmations against the latest run",()=>{
  const {s,record,withdraw}=comparedReviewScenario();s.change({kind:"required-checks",records:[record]});s.change({kind:"completion",human:s.human});
  withdraw();
  const completion=evaluateReviewCompletion(s.ledger,s.hash(),s.hash(),true);
  assert.equal(completion.ready,false);assert.ok(completion.incomplete.includes("required-checks-incomplete"));
  assert.deepEqual(completion.notComparedPages,[1]);
  assert.throws(()=>s.change({kind:"completion",human:s.human}),/conditions/);
  const otherRevision=structuredClone(s.ledger);otherRevision.comparisons.at(-1)!.contentRevision="b".repeat(64);
  assert.equal(evaluateReviewCompletion(otherRevision,s.hash(),s.hash(),true).ready,false,"latest run from another revision cannot revive older success");
  assert.throws(()=>updateReviewLedger(otherRevision,reviewLedgerChangeSchema.parse({kind:"required-checks",records:[record]}),s.context()),/Completed approved/);
  s.change({kind:"required-checks",records:[{...record,method:"direct",runId:null,approvedRun:null}]});
  s.change({kind:"completion",human:s.human});
  assert.equal(evaluateReviewCompletion(s.ledger,s.hash(),s.hash(),true).approved,true,"a new direct check satisfies the retained picture obligation");
  assert.deepEqual(evaluateReviewCompletion(s.ledger,s.hash(),s.hash(),true).notComparedPages,[1]);
});

test("portable review completion keeps inspection, required confirmation and optional comparison separate", () => {
  const hash = "a".repeat(64), human = { actor: "person", reason: "Confirmed exact scope", confirmed: true as const };
  const context = { contentRevision: hash, snapshotHash: hash, current: true, requestId: "dc76af39-193b-4da6-b6c4-08ff5ef8ac26", revision: "r1", at: "2026-11-11T00:00:00Z", apply: () => [], undo() {} };
  let ledger = emptyReviewLedger();
  assert.ok(evaluateReviewCompletion(ledger,hash,hash,true).incomplete.includes("inventory-incomplete-or-stale"));
  const change = (value: unknown) => { ledger = updateReviewLedger(ledger, reviewLedgerChangeSchema.parse(value), {...context, revision:`r${Number(ledger.revision.slice(1)) + 1 || 1}`}); };
  const inventory = { contentRevision: hash, pages: [1,2], targets: ["figure"], lenses: ["text","structure","reading","formula","table","picture","decoration"], complete: true,
    requiredChecks: [{ id:"figure", kind:"picture",locator:{ref:"original"},pages:[1],regions:[],disposition:"unsupported",derivedFrom:["original"] }] };
  change({kind:"required-checks",inventory,records:[]});
  change({kind:"inspection",records:inventory.lenses.map(lens=>({lens,runId:`run-${lens}`,contentRevision:hash,scope:{pages:[1,2],targets:["figure"]},state:"no-issue",evidence:"Full declared input and crops inspected"})),comparisons:[]});
  assert.deepEqual(evaluateReviewCompletion(ledger,hash,hash,true).incomplete,["required-checks-incomplete"],"viewing pages and completing lenses never confirms pictures");
  assert.throws(()=>change({kind:"required-checks",records:[{targetIds:["figure"],contentRevision:hash,result:"no-issue",method:"approved-comparison",human,runId:"run-image",approvedRun:null,at:context.at}]}),/Completed approved/);
  change({kind:"required-checks",records:[{targetIds:["figure"],contentRevision:hash,result:"no-issue",method:"direct",human,runId:null,approvedRun:null,at:context.at}]});
  assert.equal(evaluateReviewCompletion(ledger,hash,hash,true).ready,true);
  assert.deepEqual(evaluateReviewCompletion(ledger,hash,hash,true).notComparedPages,[1,2]);
  change({kind:"completion",human});
  assert.equal(evaluateReviewCompletion(ledger,hash,hash,true).approved,true);
  assert.equal(evaluateReviewCompletion(ledger,"b".repeat(64),hash,true).approved,false);
  assert.equal(evaluateReviewCompletion(ledger,hash,"b".repeat(64),true).approved,false);
  assert.equal(evaluateReviewCompletion(ledger,hash,hash,false).ready,false);
  change({kind:"inspection",records:[],comparisons:[{runId:"image",contentRevision:hash,scope:{pages:[1],targets:["figure"]},state:"partial",selected:true,withdrawn:null}]});
  assert.equal(ledger.approval,null); assert.ok(evaluateReviewCompletion(ledger,hash,hash,true).incomplete.includes("selected-comparison-incomplete"));
  assert.throws(()=>change({kind:"inspection",records:[],comparisons:[{runId:"image",contentRevision:hash,scope:{pages:[1],targets:["figure"]},state:"not-compared",selected:false,withdrawn:null}]}),/withdrawal requires human/);
  change({kind:"inspection",records:[],comparisons:[{runId:"image",contentRevision:hash,scope:{pages:[1],targets:["figure"]},state:"compared",selected:true,withdrawn:null}]});
  assert.equal(evaluateReviewCompletion(ledger,hash,hash,true).ready,true,"a later completed run supersedes its earlier partial status");
  change({kind:"required-checks",records:[{targetIds:["figure"],contentRevision:hash,result:"uncertain",method:"direct",human,runId:null,approvedRun:null,at:context.at}]});
  assert.ok(evaluateReviewCompletion(ledger,hash,hash,true).incomplete.includes("required-checks-incomplete"));
  assert.throws(()=>change({kind:"required-checks",inventory:{...inventory,requiredChecks:[]},records:[]}),/cannot lose/);
  assert.equal(reviewLedgerSchema.safeParse({...ledger,groups:[{id:"incomplete"}]}).success,false);
});
import { validateManifest, compileSchema, defaultJobOutput, HEALTH_CHECK_OUTPUT_SCHEMA, healthCheckResultSchema, reviewPageSchema } from "../src/index.ts";
const manifest = () => ({ schemaVersion: 1, id: "example.demo", tier: "community", publisher: { id: "example", name: "Example" }, name: "Demo", version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: {} });

test("review regions accept optional shared kinds and reject provider names as kinds", () => {
  const region = { id: "region", bbox: [0, 0, 10, 10], category: "Provider label", status: "supported" };
  const page = { generation: "g", sourceRevision: "s", pageNo: 1, width: 100, height: 100, origin: "TOPLEFT", unit: "pt", regions: [region] };
  assert.deepEqual(reviewPageSchema.parse(page).regions[0], region);
  for (const kind of ["heading", "text", "list", "table", "formula", "picture", "footnote", "code"]) {
    assert.deepEqual(reviewPageSchema.parse({ ...page, regions: [{ ...region, kind }] }).regions[0], { ...region, kind });
  }
  for (const kind of ["section_header", "decoration", "Heading", "", null, 1]) {
    assert.equal(reviewPageSchema.safeParse({ ...page, regions: [{ ...region, kind }] }).success, false);
  }
});
test("manifest rejects unsupported extensions, invalid identities, versions and unknown declarations before execution", () => {
  assert.equal(validateManifest(manifest()).id, "example.demo");
  for (const requiresSdk of ["0.1.0", "^0.1.0", "0.2.0", "^0.2.0", ">=0.2.0 <1.0.0", "^0.3.0", "^0.4.0", "^0.5.0"]) assert.ok(validateManifest({ ...manifest(), requiresSdk }));
  for (const requiresSdk of ["0.1.1", "^0.6.0", ">=1.0.0"]) assert.throws(() => validateManifest({ ...manifest(), requiresSdk }), /Unsupported SDK range/);
  for (const change of [{ settingsSchema: { type: "invalid" } }, { id: "../escape" }, { requiresSdk: "^2.0.0" }, { version: "bad" }, { entry: "../host.js" }, { contributes: { surprise: [] } }, { contributes: { jobs: [{ id: "import", title: "Import", accept: [".txt"], start: "start", status: "status", stop: "stop", resultKind: "native-document" }] } }, { contributes: { dataViews: [{ id: "table", operation: "read", version: 1 }] } }, { contributes: { generatedUi: [{ id: "ui", catalog: "table", schemaVersion: 1 }] } }, { contributes: { views: [{ id: "saved", definition: "view.json" }] } }, { contributes: { secretUses: [{ operation: "read", secret: "token" }] } }]) assert.throws(() => validateManifest({ ...manifest(), ...change }));
  assert.throws(() => compileSchema({ $ref: "https://example.test/schema" }));
  assert.throws(() => compileSchema({ type: "not-a-type" }));
  const job = { id: "export", title: "Export", accept: [".txt"], start: "start", status: "status", stop: "stop", resultKind: "file", resultExtension: ".bin" };
  const withJob = (value: unknown, requiresSdk = ">=0.2.0 <1.0.0") => ({ ...manifest(), requiresSdk, contributes: { jobs: [value], operations: ["start", "status", "stop"].map(id => ({ id, version: 1, effect: id === "status" ? "read" : "write", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "object" } })) } });
  const nativeJob = { id: "import", title: "Import", accept: [".txt"], start: "start", status: "status", stop: "stop", resultKind: "native-document" };
  const generated = withJob({ ...nativeJob, generatedDocument: "prepare" }, "^0.3.0");
  generated.contributes.operations.push({ id: "prepare", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "object" } });
  assert.ok(validateManifest(generated));
  const comparison = { ...generated, requiresSdk: "^0.4.0", contributes: { ...generated.contributes,
    jobs: [{ ...nativeJob, generatedDocument: "prepare", comparison: "compare" }],
    reviews: [{ id: "compare", title: "Compare", read: {operation:"example.demo.prepare",version:1} }] } };
  assert.ok(validateManifest(comparison));
  const workspace={...comparison,contributes:{...comparison.contributes,jobs:[{...comparison.contributes.jobs[0],workspace:true}]}};
  assert.equal(validateManifest(workspace).contributes.jobs[0].resultKind,"native-document");
  assert.throws(()=>validateManifest({...workspace,contributes:{...workspace.contributes,jobs:[{...nativeJob,workspace:true}]}}),/workspaces require/);
  assert.throws(() => validateManifest({...comparison,requiresSdk:"^0.3.0"}),/Comparison requires/);
  assert.throws(() => validateManifest({...comparison,contributes:{...comparison.contributes,reviews:[]}}),/Comparison requires/);
  assert.throws(() => validateManifest({ ...generated, requiresSdk: "^0.1.0" }), /Generated documents require SDK/);
  assert.throws(() => validateManifest({ ...generated, contributes: { ...generated.contributes, operations: generated.contributes.operations.slice(0, -1) } }), /host read provider/);
  for (const requiresSdk of ["0.1.0", "^0.1.0"]) {
    assert.throws(() => validateManifest(withJob(job, requiresSdk)), /File job results require SDK 0\.2\.0 or later in requiresSdk/);
    assert.ok(validateManifest(withJob(nativeJob, requiresSdk)));
  }
  const screen = { id: "jobs", title: "Jobs", icon: "LayoutDashboard", jobs: ["export"] };
  const withScreen = (requiresSdk: string, value = screen) => { const m = withJob(job, requiresSdk); return { ...m, contributes: { ...m.contributes, screens: [value] } }; };
  assert.equal(validateManifest(withScreen("^0.3.0")).contributes.screens[0]!.defaultViewIds.length, 0);
  assert.throws(() => validateManifest(withScreen("^0.2.0")), /Screen jobs require SDK/);
  assert.throws(() => validateManifest(withScreen("^0.3.0", { ...screen, jobs: ["missing"] })), /Undeclared screen job/);
  assert.throws(() => validateManifest(withScreen("^0.3.0", { ...screen, jobs: [] })), /Screen needs views or jobs/);
  const binding = validateManifest(withJob(job)).contributes.jobs[0];
  assert.equal(defaultJobOutput(binding, "nested/a.txt"), "nested/a.bin");
  assert.equal(defaultJobOutput({ ...binding, resultKind: "native-document" }, "docs/\uBCF4\uACE0\uC11C.docling"), "docs/\uBCF4\uACE0\uC11C.md");
  for (const resultExtension of [undefined, "bin", ".BIN", "../bin", ".tar.gz"]) assert.throws(() => validateManifest(withJob({ ...job, resultExtension })));
  assert.throws(() => validateManifest(withJob({ ...job, resultKind: "native-document" })));
});

test("settings allow incremental saves but reject top-level required fields", () => {
  const settingsSchema = { type: "object", properties: { address: { type: "string", minLength: 1 }, nested: { type: "object", properties: { value: { type: "string" } }, required: ["value"] } }, additionalProperties: false };
  assert.throws(() => validateManifest({ ...manifest(), settingsSchema: { ...settingsSchema, required: ["address"] } }), /settingsSchema.required.*empty.*one field at a time.*connection checks and operations/);
  for (const schema of [settingsSchema, { ...settingsSchema, required: [] }]) {
    const validate = compileSchema(validateManifest({ ...manifest(), settingsSchema: schema }).settingsSchema);
    assert.ok(validate({}));
    assert.ok(validate({ address: "https://example.test" }));
    assert.equal(validate({ address: "" }), false);
    assert.equal(validate({ address: 1 }), false);
    assert.equal(validate({ nested: {} }), false);
  }
});

test("declared secrets accept unique identifiers only", () => {
 const secret = { id: "token", title: "Access token", scope: "connection", required: true };
 assert.equal(validateManifest({ ...manifest(), requiresSdk: "^0.4.0", secrets: [secret] }).secrets.length, 1);
 assert.throws(() => validateManifest({ ...manifest(), secrets: [secret] }), /Secret titles require SDK/);
 assert.throws(() => validateManifest({ ...manifest(), requiresSdk: "^0.4.0", secrets: [{ id: "token", scope: "connection", required: true }] }));
 assert.throws(() => validateManifest({ ...manifest(), requiresSdk: "^0.4.0", secrets: [secret, secret] }));
});

test("read operation row schema is normalized and rejects invalid declarations", () => {
  const operation = { id: "read", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "array", items: { type: "object" } }, rowSchema: { points: { type: "number", label: "Points" } } };
  const withOperation = (op: unknown) => ({ ...manifest(), contributes: { operations: [op] } });
  assert.equal(validateManifest(withOperation(operation)).contributes.operations[0]!.rowSchema!.points.secret, false);
  assert.throws(() => validateManifest(withOperation({ ...operation, effect: "write" })));
  for (const name of ["group", "value", "a".repeat(81)]) assert.throws(() => validateManifest(withOperation({ ...operation, rowSchema: { [name]: { type: "number", label: "Points" } } })));
  assert.ok(validateManifest(withOperation({ ...operation, rowSchema: { ["a".repeat(80)]: { type: "number", label: "Points" } } })));

  assert.throws(() => validateManifest(withOperation({ ...operation, rowSchema: { points: { type: "number", label: "Points", date: true } } })));
});

test("v2 view and review contributions validate local bindings before entry execution", () => {
  const inputSchema = { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false };
  const read = { id: "search", version: 1, effect: "read", scope: "host", inputSchema, outputSchema: { type: "array" }, rowSchema: { title: { type: "string", label: "Title" } } };
  const write = { ...read, id: "change", effect: "write", rowSchema: undefined };
  const binding = (operation: string) => ({ operation: `example.demo.${operation}`, version: 1 });
  const review = { id: "review", title: "Review", read: binding("search"), propose: binding("change"), approve: binding("change"), reject: binding("change"), undo: binding("change") };
  const definition = { kind: "litzio-view", schemaVersion: 2, catalog: "litzio-v2", profile: "query", owner: manifest().id, title: "Search", refresh: "manual",
    sources: { stats: { kind: "operation", operation: "example.demo.search", version: 1, args: { query: "hello" } } },
    layout: { component: "Panel", direction: "vertical", children: [{ component: "Table", title: "Results", source: "stats", data: "/rows", columns: ["title"] }] } };
  const m = { ...manifest(), contributes: { operations: [read, write], views: [{ id: "search", title: "Search", definition }], reviews: [review] } };
  assert.equal(validateManifest(m).contributes.views[0]!.definition.profile, "query");
  assert.equal(validateManifest({ ...m, contributes: { operations: [read], reviews: [{ id: "compare", title: "Compare", read: binding("search") }] } }).contributes.reviews[0]!.propose, undefined);
  const screen = { id: "dashboard", title: "Dashboard", icon: "LayoutDashboard", defaultViewIds: ["search"], primary: true };
  const screened = { ...m, contributes: { ...m.contributes, screens: [screen] } };
  assert.equal(validateManifest(screened).contributes.screens[0].primary, true);
  const snapshot = structuredClone(screened) as any;
  snapshot.contributes.views[0].definition.refresh = "assistant";
  snapshot.contributes.views[0].definition.sources.stats = { kind: "assistant", generatedAt: "2026-11-06T00:00:00.000Z", rowSchema: { title: { type: "string", label: "Title" } }, rows: [{ title: "Saved result" }], provenance: [{ kind: "reference", label: "Source", refId: "ref-1" }] };
  assert.throws(() => validateManifest(snapshot));

  for (const change of [
    (v: any) => v.contributes.screens.push(screen),
    (v: any) => v.contributes.screens.push({ ...screen, id: "second" }),
    (v: any) => v.contributes.screens[0].defaultViewIds = ["missing"],
    (v: any) => v.contributes.screens[0].defaultViewIds = ["search", "search"],
    (v: any) => v.contributes.screens[0].icon = "https://example.test/icon",
    (v: any) => v.contributes.screens[0].route = "/custom",
    (v: any) => v.contributes.views[0].definition.owner = "other.plugin",
  ]) { const bad = structuredClone(screened); change(bad); assert.throws(() => validateManifest(bad)); }

  for (const change of [(v: any) => v.contributes.views[0].definition.profile = "review", (v: any) => v.contributes.views[0].definition.sources.stats.operation = "other.plugin.search",
    (v: any) => v.contributes.reviews[0].approve = binding("search"), (v: any) => v.contributes.reviews[0].read = binding("change"),
    (v: any) => v.contributes.reviews[0].approve.operation = "other.plugin.change", (v: any) => v.contributes.reviews[0].undo.version = 2,
    (v: any) => v.contributes.reviews[0].execute = binding("change")]) {
    const bad = structuredClone(m); change(bad); assert.throws(() => validateManifest(bad));
  }
});

test("health checks bind a host read accepting empty input and require the feature SDK", () => {
  const op = { id: "connection", version: 1, effect: "read", scope: "host", inputSchema: { type: "object", additionalProperties: false }, outputSchema: HEALTH_CHECK_OUTPUT_SCHEMA };
  const check = (operation: unknown = op, requiresSdk = ">=0.3.0 <1.0.0") => ({ ...manifest(), requiresSdk, contributes: { healthCheck: "connection", operations: [operation] } });
  assert.equal(validateManifest(check()).contributes.healthCheck, "connection");
  for (const requiresSdk of ["^0.1.0", "0.2.0"]) assert.throws(() => validateManifest(check(op, requiresSdk)), /Health checks require SDK/);
  for (const operation of [{ ...op, effect: "write" }, { ...op, id: "other" }, { ...op, inputSchema: { type: "object", required: ["url"], properties: { url: { type: "string" } } } }]) assert.throws(() => validateManifest(check(operation)));
  assert.deepEqual(healthCheckResultSchema.parse({ ok: true, message: "Connected" }), { ok: true, message: "Connected" });
  for (const value of [{ ok: true }, { ok: "yes", message: "Connected" }, { ok: true, message: "Connected", raw: {} }]) assert.throws(() => healthCheckResultSchema.parse(value));
});

test("link columns require a supported SDK feature contract", () => {
  const operation = { id: "read", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "array" }, rowSchema: { key: { type: "string", label: "Key", linkField: "url" }, url: { type: "string", label: "URL" } } };
  for (const requiresSdk of ["0.1.0", "^0.1.0", "0.2.0", "^0.2.0", ">=0.1.0 <0.3.0"]) assert.throws(() => validateManifest({ ...manifest(), requiresSdk, contributes: { operations: [operation] } }), /Link columns require SDK 0.3.0/);
  for (const requiresSdk of ["0.3.0", "^0.3.0", ">=0.3.0 <1.0.0"]) assert.ok(validateManifest({ ...manifest(), requiresSdk, contributes: { operations: [operation] } }));
});

test("plugin image paths require the feature SDK and remain artifact-relative", () => {
  for (const icon of ["icon.png", "assets/icon.svg"]) assert.equal(validateManifest({ ...manifest(), requiresSdk: "^0.3.0", icon }).icon, icon);
  assert.throws(() => validateManifest({ ...manifest(), icon: "icon.png" }), /SDK 0.3.0/);
  for (const icon of ["../icon.png", "/icon.png", "C:/icon.png", "https://example.test/icon.png", "a/../icon.svg", "icon.gif", "icon.svg?x", "a\\icon.png"]) assert.throws(() => validateManifest({ ...manifest(), requiresSdk: "^0.3.0", icon }));
});

test("input suggestions bind public text fields to same-plugin reads on SDK 0.3", () => {
 const source = {id:"search",version:1,effect:"read",scope:"host",inputSchema:{type:"object",properties:{person:{type:"string"}}},outputSchema:{type:"array"},rowSchema:{name:{type:"string",label:"Name"}},inputSuggestions:{person:"people"}};
 const people = {id:"people",version:1,effect:"read",scope:"host",inputSchema:{type:"object",properties:{query:{type:"string"}},required:["query"],additionalProperties:false},outputSchema:{type:"array"}};
 const input = { ...manifest(), requiresSdk:"^0.3.0", contributes:{operations:[source,people]} };
 assert.deepEqual(validateManifest(input).contributes.operations[0]?.inputSuggestions,{person:"people"});
 assert.throws(()=>validateManifest({...input,requiresSdk:"^0.2.0"}),/SDK 0.3/);
 assert.throws(()=>validateManifest({...input,contributes:{operations:[source,{...people,effect:"write"}]}}),/standalone host read/);
 assert.throws(()=>validateManifest({...input,contributes:{operations:[{...source,inputSuggestions:{missing:"people"}},people]}}),/public free-text/);
 assert.throws(()=>validateManifest({...input,contributes:{operations:[{...source,inputSchema:{type:"object",properties:{person:{type:"string",secret:true}}}},people]}}),/public free-text/);
});

test("input hints require public text and standalone empty-input reads", () => {
 const source = {id:"search",version:1,effect:"read",scope:"host",inputSchema:{type:"object",properties:{person:{type:"string"}}},outputSchema:{type:"array"},rowSchema:{name:{type:"string",label:"Name"}},inputHints:{person:"hint"}};
 const hint = {id:"hint",version:1,effect:"read",scope:"host",inputSchema:{type:"object",additionalProperties:false},outputSchema:{type:"object"}};
 const input = {...manifest(),requiresSdk:"^0.3.0",contributes:{operations:[source,hint]}};
 assert.deepEqual(validateManifest(input).contributes.operations[0]?.inputHints,{person:"hint"});
 assert.throws(()=>validateManifest({...input,requiresSdk:"^0.2.0"}),/SDK 0.3/);
 for (const property of [{type:"string",secret:true},{type:"string",writeOnly:true},{type:"string",enum:["x"]},{type:"number"}]) assert.throws(()=>validateManifest({...input,contributes:{operations:[{...source,inputSchema:{type:"object",properties:{person:property}}},hint]}}),/public free-text/);
 for (const target of [{...hint,effect:"write"},{...hint,rowSchema:{name:{type:"string",label:"Name"}}},{...hint,inputSchema:{type:"object",required:["query"],properties:{query:{type:"string"}}}}]) assert.throws(()=>validateManifest({...input,contributes:{operations:[source,target]}}),/standalone host read/);
});

test("default-hidden row columns use the unreleased SDK 0.3 contract", () => {
  const operation = { id: "read", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "array" }, rowSchema: { title: { type: "string", label: "Title" }, extra: { type: "number", label: "Extra", hidden: true } } };
  assert.throws(() => validateManifest({ ...manifest(), requiresSdk: "^0.2.0", contributes: { operations: [operation] } }), /Column visibility/);
  assert.equal(validateManifest({ ...manifest(), requiresSdk: "^0.3.0", contributes: { operations: [operation] } }).contributes.operations[0].rowSchema?.extra.hidden, true);
});
