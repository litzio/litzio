import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { executeReviewAssistantTool, executeReadReviewDocument, reviewAssistantTools } from "../server/assistant-plugin-tools.ts";
import { AssistantConversations, conversationForDisplay } from "../server/assistant-conversations.ts";
import { RootAccess } from "../server/file-access.ts";

test("text inspection requires material actually delivered at the current revision across turns", async () => {
  const root=mkdtempSync(path.join(tmpdir(),"review-tools-"));
  try {
    writeFileSync(path.join(root,"a.docling"),"fixture");
    const location={root,workspace:"a.docling",plugin:"fixture",job:"workspace"};
    const scope={folders:new RootAccess([root]),permissionMode:"opened-folders",access:null};
    const comparisons:any[]=[];const calls:any[]=[], ids=new Set<string>();let baseline="a".repeat(64), documentRevision="b".repeat(64), fail=false, ambiguous=false;
    const host:any={generatedDocuments:{execute:async(input:any)=>{
      calls.push(input);
      if(input.action==="workspace-find")return {targets:ambiguous?[location,{...location,plugin:"other"}]:[location]};
      if(input.action==="workspace-status")return {receipt:{scope:root},workspace:location};
      if(input.action==="workspace-review-change") {
        if(ids.has(input.requestId))throw new Error("Duplicate requestId; query status");ids.add(input.requestId);
        if(fail)throw new Error("Publication uncertain");
        if(input.baseline!==baseline)throw new Error("Workspace baseline conflict");
        comparisons.push(...input.change.comparisons??[]);
      }
      return {baseline,documentRevision,contentRevision:"c".repeat(64),receipt:{outcome:"success"},workspace:location,
        material:{pages:[1,2],items:[{self_ref:"target-1"}]},ledger:{inventory:{pages:[1,2,3],targets:["target-1"],requiredChecks:[]},groups:[],inspections:[],comparisons}};
    }}};
    const invoke=(name:string,args:any,turn=scope,callId?:string)=>executeReviewAssistantTool(host,name,{path:"a.docling",...args},turn,[],callId);
    const record={lens:"text",contentRevision:"c".repeat(64),scope:{pages:[1],targets:[]},state:"no-issue",evidence:"Read actual page"};
    await executeReadReviewDocument(host,{path:"a.docling"},scope);
    await assert.rejects(invoke("record_review_inspection",{records:[record]}),/Read page material/);
    await invoke("read_review_material",{kind:"page",pageNo:1});
    await invoke("record_review_inspection",{records:[record]},scope,"record-once");
    await assert.rejects(invoke("record_review_inspection",{records:[record]},scope,"record-once"),/Duplicate requestId/);
    await assert.rejects(invoke("record_review_inspection",{records:[{...record,scope:{pages:[3],targets:[]}}]}),/Read page material/);
    await executeReviewAssistantTool(host,"record_review_inspection",{path:"a.docling",records:[record]},{...scope},[{workspace:location,documentRevision,contentRevision:"c".repeat(64),material:{pages:[1],items:[]}}]);
    const imageHistory=[{workspace:location,documentRevision,contentRevision:"c".repeat(64),runId:"images",images:[{page:1,target:"target-1"},{page:2,target:"target-1"}]}];
    const imageRecord=(pages:number[],history=imageHistory)=>executeReviewAssistantTool(host,"record_review_inspection",{path:"a.docling",imageRunId:"images",records:[{...record,scope:{pages,targets:["target-1"]}}]},scope,history);
    await imageRecord([1]);assert.deepEqual(comparisons.at(-1).scope.pages,[1],"a partial record does not require all delivered images");
    await imageRecord([2]);assert.deepEqual(comparisons.at(-1).scope.pages,[1,2],"later inspected subsets accumulate");
    assert.equal(comparisons.at(-1).selected,false,"measurement never selects a human approval gate");
    await assert.rejects(imageRecord([3]),/Read the recorded image scope/);
    await assert.rejects(imageRecord([1],[{...imageHistory[0],workspace:{...location,workspace:"other.docling"}}]),/Read the recorded image scope/);
    const wholePageScopes=[];
    for(const [runId,sequence] of [["partial-whole",[["target-1"],[]]],["whole-partial",[[],["target-1"]]]] as const) {
      const history=[{workspace:location,documentRevision,contentRevision:"c".repeat(64),runId,images:[{page:1}]}];
      for(const targets of sequence)await executeReviewAssistantTool(host,"record_review_inspection",{path:"a.docling",imageRunId:runId,records:[{...record,scope:{pages:[1],targets:[...targets]}}]},scope,history);
      wholePageScopes.push(comparisons.at(-1).scope);
    }
    assert.deepEqual(wholePageScopes,[{pages:[1],targets:[]},{pages:[1],targets:[]}],"whole-page coverage contains target subsets in either recording order");
    baseline="d".repeat(64);
    await assert.rejects(invoke("record_review_inspection",{records:[record]}),/baseline conflict/,"Host retains observed baseline across external writes");
    documentRevision="e".repeat(64);
    await assert.rejects(invoke("record_review_inspection",{records:[record]}),/Read page material/,"old document material cannot prove current reading");
    await invoke("read_review_material",{kind:"page",pageNo:1});fail=true;
    let uncertain="";try{await invoke("record_review_inspection",{records:[record]});}catch(error){uncertain=String(error);}
    assert.match(uncertain,/Publication uncertain.*requestId: [a-f0-9-]{36}/);
    const requestId=/requestId: ([a-f0-9-]{36})/.exec(uncertain)![1];await invoke("read_review_request_status",{requestId});
    await assert.rejects(invoke("record_review_inspection",{records:[record]},{...scope,permissionMode:"read-only"}),/Opened folders/);
    ambiguous=true;await assert.rejects(invoke("read_review_material",{kind:"page",pageNo:1}),/Ambiguous.*Candidates:.*other/);ambiguous=false;
    await assert.rejects(invoke("read_review_material",{kind:"page",pageNo:1,path:path.join(root,"..","outside.docling")}),/No review workspace found/);
    const discovered=await invoke("find_review_workspaces",{});assert.equal(discovered.targets.length,1);
    await executeReadReviewDocument(host,{path:path.join(root,"a.docling")},scope);
    const resumedRead=await executeReadReviewDocument(host,location,scope);
    assert.equal(resumedRead.documentRevision,documentRevision,"a resumed provider may retain the previous registered tool schema");
    fail=false;
    const legacyRequest={...location,baseline,requestId:"00000000-0000-4000-8000-000000000001",records:[record]};
    await executeReviewAssistantTool(host,"record_review_inspection",legacyRequest,scope);
    await assert.rejects(executeReviewAssistantTool(host,"record_review_inspection",legacyRequest,scope),/Duplicate requestId/);
    assert.ok(calls.some(input=>input.action==="workspace-review-change" && input.baseline && input.requestId));
    for(const tool of reviewAssistantTools.filter(tool=>tool.name!=="read_review_request_status"))assert.ok(!["root","plugin","job","baseline","requestId"].some(key=>key in ((tool.inputSchema as any).properties??{})));
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("usage unions all delivered image scopes for a run without counting turn tokens twice", async () => {
  const root=mkdtempSync(path.join(tmpdir(),"review-usage-"));
  try {
    writeFileSync(path.join(root,"a.docling"),"fixture");
    const location={root,workspace:"a.docling",plugin:"fixture",job:"workspace"};
    const calls:any[]=[];
    const instance:any={closed:false,plugins:{generatedDocuments:{execute:async(input:any)=>{calls.push(input);return {receipt:{outcome:"success"}};}}},scopes:new Map(),reviewUsageWrites:new Set(),save:()=>{}};
    const usage={inputTokens:100,outputTokens:10};
    const turn={id:"turn",items:[1,2].map(page=>({id:`review-image-${page}`,toolResult:{contentItems:[{text:JSON.stringify({input:location,runId:"run",scope:{pages:[page],targets:[`target-${page}`]},providerUsage:usage})}]}}))};
    (AssistantConversations.prototype as any).saveReviewUsage.call(instance,{id:"conversation",folders:[root],permissionMode:"opened-folders"},turn);
    await Promise.all(instance.reviewUsageWrites);
    assert.equal(calls.length,1);
    assert.deepEqual(calls[0].scope,{pages:[1,2],targets:["target-1","target-2"]});
    assert.deepEqual(calls[0].usage,usage);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("display projects already-loaded large results while preserving creation receipts and provider data", () => {
  const source="x".repeat(9*1024*1024), receipt={path:"/created.md",revision:"a".repeat(64),identity:{rootId:"fixture"}};
  const conversation:any={id:"loaded",turns:[{id:"turn",items:[{id:"tool",text:"create_document",kind:"tool",toolResult:{success:true,contentItems:[{type:"inputText",text:JSON.stringify({...receipt,source})}]}}]}]};
  const display=conversationForDisplay(conversation), parts=display.turns[0]!.items[0]!.toolResult!.contentItems;
  assert.deepEqual(JSON.parse(parts[0]!.text!),receipt);
  assert.ok(JSON.parse(parts[1]!.text!).omitted);
  assert.ok(Buffer.byteLength(JSON.stringify(display))<1024);
  assert.equal(JSON.parse(conversation.turns[0].items[0].toolResult.contentItems[0].text).source,source);
  conversation.turns[0].items.push({id:"material",text:"read_review_material",kind:"tool",toolResult:{success:true,contentItems:[{type:"inputText",text:JSON.stringify({workspace:{root:"/root",workspace:"a.docling",plugin:"fixture",job:"review"},documentRevision:"b".repeat(64),contentRevision:"c".repeat(64),material:{pages:[1],items:[{self_ref:"target",text:source}]}})}]}});
  const retained=JSON.parse(conversationForDisplay(conversation).turns[0]!.items[1]!.toolResult!.contentItems[0]!.text!);
  assert.deepEqual(retained.material,{pages:[1],items:[{self_ref:"target"}]},"display projection retains returned material identity across history resume");
  assert.equal(retained.documentRevision,"b".repeat(64));
});
