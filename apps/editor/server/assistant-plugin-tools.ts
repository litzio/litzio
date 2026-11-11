import type { DocumentToolScope } from "./assistant-document-tools.ts";
import { listFolder } from "./document-api.ts";
import { statSync } from "node:fs";
import { accessPath, canonicalFilePath, inside } from "./file-access.ts";
import { PLUGIN_REGISTRATION_CHANGED, pluginManagementSchema, jobRequestSchema, PLUGIN_JOBS } from "@litzio/plugin-sdk";
import type { PluginHost } from "./plugins/plugin-host.ts";
import { z } from "zod";
import { publicOperationError } from "./plugins/operation-result.ts";
import { workspaceRequestSchema, reviewLedgerChangeSchema, reviewLedgerSchema } from "@litzio/plugin-sdk";
import path from "node:path";
import { randomUUID } from "node:crypto";

const reviewPath = z.strictObject({path:z.string().min(1)});
/** Codex retains a thread's registered schemas. Keep in-use conversations callable after resume;
 * new registrations expose only path. Internal provider IDs are always rediscovered. */
function reviewInput(raw:unknown) {
  const value=raw as Record<string,unknown>;
  if(!value || typeof value!=="object" || Array.isArray(value) || "path" in value || !("root" in value && "workspace" in value))return raw;
  const {root,workspace,plugin,job,baseline,requestId,...fields}=value;
  const location=workspaceRequestSchema.options[0]!.omit({action:true}).parse({root,workspace,plugin,job});
  if(!path.isAbsolute(location.root) || path.isAbsolute(location.workspace))throw new Error("Expected an absolute Root and relative workspace");
  return {...fields,path:path.resolve(location.root,location.workspace)};
}

export const reviewDocumentTools = [{ type: "function", name: "read_review_document", description: "Read a prepared workspace summary by opened-folder-relative or contained absolute path. Returns revisions, progress and target counts; no full document, preparation or writes.", inputSchema: z.toJSONSchema(reviewPath) }];
export async function executeReadReviewDocument(host: ReviewHost, input: unknown, scope: DocumentToolScope) {
  const location=await resolveReview(host,reviewPath.parse(reviewInput(input)).path,scope);
  const result=await scopedReview(host,{...location,action:"workspace-read"},scope);
  if(result.receipt?.outcome!=="success")return result;
  return {workspace:result.workspace,baseline:result.baseline,documentRevision:result.documentRevision,contentRevision:result.contentRevision,
    cacheState:result.cacheState,completion:result.completion,receipt:result.receipt,
    summary:{pages:result.ledger?.inventory?.pages??[],targets:result.ledger?.inventory?.targets.length??0,
      groups:result.ledger?.groups.length??0,openTargets:result.ledger?.groups.flatMap((group:any)=>group.targets).filter((target:any)=>!target.resolved && target.proposal!=="superseded").length??0,
      checkedPages:result.record?.checkedPages??[],lenses:result.ledger?.inventory?.lenses??[],
      inspections:result.ledger?.inspections.length??0,requiredChecks:result.ledger?.inventory?.requiredChecks.length??0}};
}

const pluginOperationInput = z.strictObject({ operation: z.string().min(1), input: z.unknown().refine(value => value !== undefined) });
export const pluginOperationTools = [{ type: "function", name: "invoke_plugin_operation", description: "Invoke a declared assistant:true read operation or health check on this conversation's Host. Inspect manage_plugins list for full operation names and input schemas. Supply comparison targets as operation input, never settings. Read-only turns cannot invoke. No per-call approval. Activity contains metadata only; never supply secrets.", inputSchema: { type: "object", properties: { operation: { type: "string" }, input: {} }, required: ["operation", "input"], additionalProperties: false } }];

export async function executePluginOperationTool(host: PluginHost, input: unknown, scope: DocumentToolScope) {
  const activity: { operation?: string; outcome: string; at: number; receipt?: Awaited<ReturnType<PluginHost["invokeOperation"]>>["receipt"] } = { outcome: "refused", at: Date.now() };
  try {
    const args = pluginOperationInput.parse(input);
    // Only declared names may enter activity, never arbitrary input or output text.
    if (host.viewOperationOwner(args.operation)) activity.operation = args.operation;
    if (!["opened-folders", "full-access"].includes(scope.permissionMode))
      return { errorKind: "forbidden", error: "Plugin operations are unavailable in read-only turns.", activity };
    const result = await host.invokeAssistantOperation(args.operation, args.input);
    activity.outcome = result.receipt.outcome;
    activity.receipt = result.receipt;
    return { ...result, activity };
  } catch (error) {
    return { ...publicOperationError(error, "read"), activity };
  }
}

export const pluginTools = [{ type: "function", name: "manage_plugins", description: "Manage plugins on this Host. Management runs without per-call approval and is recorded in conversation activity. Never supply secrets. Use list to inspect artifacts, registrationId and digests. Trust and enable with trust:true require the registrationId you inspected.", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["list", "scaffold", "validate", "register", "trust", "enable", "disable", "reload", "unregister", "settings"] }, id: { type: "string" }, directory: { type: "string" }, template: { type: "string", enum: ["greet", "query", "file"] }, digest: { type: "string" }, registrationId: { type: "string" }, trust: { type: "boolean" }, settings: { type: "object", additionalProperties: true } }, required: ["action"], additionalProperties: false } }];
export async function executePluginTool(host: PluginHost, input: unknown, activity: (entry: { action: string; id?: string; outcome: "success" | "failure" }) => void, scope?: DocumentToolScope) {
  input = pluginManagementSchema.parse(input);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid plugin management input");
  const { action, ...args } = input as Record<string, any>;
  if (!["list", "scaffold", "validate", "register", "trust", "enable", "disable", "reload", "unregister", "settings"].includes(action) || Object.keys(args).some(key => !["template", "id", "directory", "digest", "registrationId", "trust", "settings"].includes(key))) throw new Error("Invalid plugin management action");
  try {
    let creationScope = scope?.folders;
    if (action === "scaffold") {
      if (!scope || !["opened-folders", "full-access"].includes(scope.permissionMode)) throw new Error("Plugin creation is read-only for this turn.");
      if (scope.permissionMode === "opened-folders" && args.directory === undefined) creationScope = host.authoringAccess(true);
      if (!creationScope) throw new Error("No writable folder for this turn.");
      if (args.directory !== undefined) args.directory = creationScope.resolve(accessPath(args.directory, scope.access, true), true);
    }
    const result = await host.invoke(action, args, action === "scaffold" ? creationScope : undefined);
    const value = result as { id?: string; receipt?: { outcome: string } };
    const entry = { action, id: value.id ?? args.id, outcome: value.receipt?.outcome === "failure" ? "failure" as const : "success" as const };
    activity(entry);
    return { result, ...(entry.outcome === "failure" ? { error: "Plugin validation failed; see result.errors." } : {}), activity: entry };
  } catch (error) { activity({ action, id: args.id, outcome: "failure" }); return { error: error instanceof Error && error.message === PLUGIN_REGISTRATION_CHANGED ? PLUGIN_REGISTRATION_CHANGED : "Plugin management failed; inspect plugin status.", activity: { action, id: args.id, outcome: "failure" } }; }
}

export const pluginJobTools = [{ type: "function", name: "plugin_jobs", description: "Start, observe, stop, read the result or list plugin jobs on this conversation's Host. Use the declared job bindings. Files and output are relative to the named Host Root. Generate one UUID for start; on uncertainty query that same requestId, never resend start. No per-call approval. Calls appear in conversation activity.", inputSchema: PLUGIN_JOBS.inputSchema }];
export async function executePluginJobTool(host: PluginHost, input: unknown, scope: import("./assistant-document-tools.ts").DocumentToolScope) {
  const parsed = jobRequestSchema.parse(input);
  if (parsed.action === "job-start" || parsed.action === "job-start-many" || parsed.action === "job-stop") {
    if (!["opened-folders", "full-access"].includes(scope.permissionMode)) throw new Error("Plugin job writes are read-only for this turn.");
    const root = "root" in parsed ? parsed.root : host.jobs.list().jobs.find(job => job.requestId === parsed.requestId)?.root;
    if (!root || !scope.folders) throw new Error("No opened folder for this job.");
    scope.folders.resolve(root);
  }
  const { action, ...args } = parsed;
  return host.invoke(action, args);
}

type ReviewHost = Pick<PluginHost,"generatedDocuments">;
type ReviewLocation = {root:string;workspace:string;plugin:string;job:string};
type MaterialRead = {documentRevision:string;contentRevision:string;scope:{pages:number[];targets:string[]}};
// The authorized turn owns observations. A new scope on the next turn cannot inherit reading proof.
const reviewRequests = new WeakMap<DocumentToolScope,Map<string,string>>();
const reviewReads = new WeakMap<DocumentToolScope,Map<string,{baseline:string;materials:MaterialRead[]}>>();
const locationKey = (location:ReviewLocation) => JSON.stringify([canonicalFilePath(path.resolve(location.root,location.workspace)),location.plugin,location.job]);
function observations(scope:DocumentToolScope) {
  let reads=reviewReads.get(scope);if(!reads){reads=new Map();reviewReads.set(scope,reads);}return reads;
}
async function findReviewWorkspaces(host:ReviewHost, scope:DocumentToolScope, requested?:string) {
  if(!scope.folders)throw new Error("No opened folders for this review.");
  const candidates:any[]=[], seen=new Set<string>();
  const visit=async(root:string,file:string):Promise<void>=>{
    file=scope.folders!.resolve(accessPath(file,scope.access));
    const key=canonicalFilePath(file);if(seen.has(key))return;seen.add(key);
    if(statSync(file).isDirectory()) {
      for(const entry of listFolder(root,file,scope.access).entries)await visit(root,entry.path);
    } else {
      const result=await host.generatedDocuments.execute({action:"workspace-find",root,path:file});
      candidates.push(...result.targets??[]);
    }
  };
  for(const root of scope.folders.roots) {
    const file=requested ? path.resolve(root,requested) : root;
    if(!inside(root,file))continue;
    try {await visit(root,file);} catch(error) {if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  }
  return {targets:candidates};
}
async function resolveReview(host:ReviewHost, requested:string, scope:DocumentToolScope):Promise<ReviewLocation> {
  const {targets}=await findReviewWorkspaces(host,scope,requested);
  if(targets.length!==1)throw new Error(`${targets.length ? "Ambiguous review workspace" : "No review workspace found"} for ${requested}. Candidates: ${JSON.stringify(targets)}. Use find_review_workspaces to find an opened-folder path.`);
  const {root,workspace,plugin,job}=targets[0];return {root,workspace,plugin,job};
}
const actionSchema = (action:string): any => workspaceRequestSchema.options.find((schema:any)=>schema.shape?.action?.value===action);
const materialInput = reviewPath.extend({kind:z.enum(["lenses","source-evidence","required-checks","groups","page"]),pageNo:z.number().int().positive().optional()});
const proposeInput = reviewPath.extend({change:reviewLedgerChangeSchema.options[0]!});
const inspectionInput = reviewPath.extend({records:z.array(reviewLedgerSchema.shape.inspections.element.omit({runId:true})).min(1).max(1000),imageRunId:z.string().min(1).optional()});
export const reviewImageQuestionSchema = reviewPath.extend({selection:actionSchema("workspace-image-estimate").shape.selection,estimateHash:z.string().regex(/^[a-f0-9]{64}$/)});
export const parseReviewImageQuestion = (raw:unknown) => reviewImageQuestionSchema.parse(reviewInput(raw));
const reviewInputs = {
  find_review_workspaces:z.strictObject({path:z.string().min(1).optional()}),
  read_review_material:materialInput,
  run_review_source_evidence:reviewPath.extend({pages:z.array(z.number().int().positive()).min(1).max(10000).optional()}),
  propose_review_groups:proposeInput,
  record_review_inspection:inspectionInput,
  estimate_review_images:reviewImageQuestionSchema.omit({estimateHash:true}),
  read_review_images:reviewPath.extend({runId:z.string().min(1),pageNo:z.number().int().positive(),target:z.string().min(1).optional()}),
};
const descriptions: Record<keyof typeof reviewInputs,string> = {
  find_review_workspaces:"Find workspace paths and providers inside opened folders. Optional path filters by file or folder; omitted searches all opened folders. No document contents.",
  read_review_material:"Read lenses, source-evidence candidates, required checks, groups, or page fragments with neighbors, provenance and current block correspondence. No images.",
  run_review_source_evidence:"Save source-evidence candidates for optional pages; no proposals or document changes. On uncertainty query the returned ID with read_review_request_status; never replay.",
  propose_review_groups:"Save validated proposed groups to the ledger; no approval or document changes. Never bypass rejection. On uncertainty query request status; never replay.",
  record_review_inspection:"Save inspections for actually read scopes; insufficient evidence is uncertain. No approval, required-check completion or document changes. Image comparison requires all approved images read this turn. On uncertainty query request status; never replay.",
  estimate_review_images:"Return page/region counts, estimated input tokens and estimateHash; no images. Submit selection and hash with request_litzio_user_input reviewImage; acceptance is not approval. Wait for the human answer and runId.",
  read_review_images:"Return page or target-region images for the human-approved runId and exact scope only; cannot self-confirm or expand approval.",
};
export const reviewAssistantTools: {type:string;name:string;description:string;inputSchema:object}[] = Object.entries(reviewInputs).map(([name,schema])=>({type:"function",name,description:descriptions[name as keyof typeof reviewInputs],inputSchema:z.toJSONSchema(schema)}));
reviewAssistantTools.push({type:"function",name:"read_review_request_status",description:"Observe the same requestId after an uncertain review write; never replay it.",inputSchema:z.toJSONSchema(reviewPath.extend({requestId:z.uuid()}))});

async function scopedReview(host:ReviewHost, input:any, scope:DocumentToolScope, writing=false) {
  if (writing && !["opened-folders","full-access"].includes(scope.permissionMode)) throw new Error('Review writes are unavailable in read-only turns. Change permission to "Opened folders" (열린 폴더) to save review results.');
  if (!scope.folders) throw new Error("No opened folders for this review.");
  const root=scope.folders.resolve(accessPath(input.root,scope.access));
  scope.folders.resolve(accessPath(path.resolve(root,input.workspace),scope.access));
  const key=locationKey(input), reads=observations(scope);
  if((writing || input.action==="workspace-image-read") && input.baseline===undefined && input.action!=="workspace-image-usage") {
    // Keep the last observed baseline: an external write after reading must still conflict.
    if(!reads.has(key)) {
      const read=await scopedReview(host,{root,workspace:input.workspace,plugin:input.plugin,job:input.job,action:"workspace-read"},scope);
      if(!reads.has(key))throw new Error(read.error??"Read a current review workspace before writing");
    }
    input={...input,baseline:reads.get(key)!.baseline};
  }
  const requestId=writing ? input.requestId??randomUUID() : undefined;
  try {
    const result=await host.generatedDocuments.execute({...input,root,...(requestId?{requestId}:{})});
    if(result.baseline && result.receipt?.outcome==="success")reads.set(key,{baseline:result.baseline,materials:reads.get(key)?.materials??[]});
    return result;
  } catch(error) {
    if(requestId)throw new Error(`${String(error)}. Review requestId: ${requestId}; query read_review_request_status, do not replay.`);
    throw error;
  }
}
export async function executeReviewAssistantTool(host:ReviewHost,name:string,input:unknown,scope:DocumentToolScope, delivered: {input:any;runId:string;documentRevision:string;scope:{pages:number[];targets:string[]}}[] = [], callId?:string) {
  if(name==="read_review_request_status") {
    const normalized=reviewInput(input) as Record<string,unknown>;
    const {requestId,path:requested}=reviewPath.extend({requestId:z.uuid()}).parse({...normalized,requestId:(input as any)?.requestId});
    const location=await resolveReview(host,requested,scope);
    await scopedReview(host,{...location,action:"workspace-read"},scope);
    const result=await host.generatedDocuments.execute({action:"workspace-status",requestId});
    if(result.receipt && result.receipt.scope!==location.root || result.workspace && ["plugin","job","workspace"].some(key=>result.workspace[key]!==location[key as keyof typeof location]))throw new Error("Review request belongs to another workspace");
    return result;
  }
  const schema=reviewInputs[name as keyof typeof reviewInputs];
  if(!schema)throw new Error("Unknown review assistant tool");
  const normalized=reviewInput(input);
  const parsed:any=schema.parse(normalized);
  if(name==="find_review_workspaces")return findReviewWorkspaces(host,scope,parsed.path);
  if(["run_review_source_evidence","propose_review_groups","record_review_inspection"].includes(name) && !["opened-folders","full-access"].includes(scope.permissionMode))throw new Error('Review writes are unavailable in read-only turns. Change permission to "Opened folders" (열린 폴더) to save review results.');
  const {path:requested,...fields}=parsed;
  const location=await resolveReview(host,requested!,scope), args={...location,...fields} as any;
  if(["run_review_source_evidence","propose_review_groups","record_review_inspection"].includes(name)) {
    let requests=reviewRequests.get(scope);if(!requests){requests=new Map();reviewRequests.set(scope,requests);}
    const legacyId=normalized!==input && (input as any)?.requestId!==undefined ? z.uuid().parse((input as any).requestId) : undefined;
    args.requestId=legacyId??(callId ? requests.get(callId)??randomUUID() : randomUUID());
    if(callId)requests.set(callId,args.requestId);
  }
  let action:string, extra:object={}, writing=false;
  if(name==="read_review_material") {
    const {kind,pageNo,...common}=args;
    if(kind==="page" && !pageNo || kind!=="page" && pageNo!==undefined)throw new Error("pageNo is required only for page material");
    action=({lenses:"workspace-lenses","source-evidence":"workspace-evidence","required-checks":"workspace-required-checks",groups:"workspace-groups-read",page:"workspace-material"} as any)[kind];
    const result=await scopedReview(host,{...common,action,...(kind==="page"?{pageNo}:{}),...(kind==="source-evidence"?{mode:"read"}:{})},scope);
    if(kind==="page" && result.material && result.receipt?.outcome==="success") {
      observations(scope).get(locationKey(location))!.materials.push({documentRevision:result.documentRevision,contentRevision:result.contentRevision,
        scope:{pages:result.material.pages,targets:result.material.items.map((item:any)=>item.self_ref)}});
    }
    return result;
  }
  if(name==="run_review_source_evidence"){action="workspace-evidence";extra={mode:"run"};writing=true;}
  else if(name==="propose_review_groups"){action="workspace-review-change";writing=true;}
  else if(name==="record_review_inspection") {
    const {records,imageRunId,...common}=args;
    const comparisons=[];
    // This validation read must not replace the baseline from the actual material read.
    const prior=observations(scope).get(locationKey(location));
    const state=await host.generatedDocuments.execute({...location,action:"workspace-read"});
    const material=prior?.materials.filter(read=>read.documentRevision===state.documentRevision && read.contentRevision===state.contentRevision)??[];
    if(!imageRunId && records.some((record:any)=>!(record.scope.pages.length || record.scope.targets.length) ||
      record.contentRevision!==state.contentRevision ||
      !record.scope.pages.every((page:number)=>material.some(read=>read.scope.pages.includes(page))) ||
      !record.scope.targets.every((target:string)=>material.some(read=>read.scope.targets.includes(target)))))throw new Error("Read page material for this workspace and revision in this turn before recording inspection");
    if(imageRunId){
      const run=state.ledger?.comparisons.findLast((run:any)=>run.runId===imageRunId);
      const approval=state.ledger?.inspections.find((r:any)=>r.runId===imageRunId && (()=>{try{return JSON.parse(r.evidence).format==="review-image-approval-1";}catch{return false;}})());
      const approved=approval?JSON.parse(approval.evidence):null;
      if(!run?.selected || run.withdrawn || approved?.documentRevision!==state.documentRevision || records.some((r:any)=>r.state==="not-inspected" || !r.scope.pages.length || r.scope.pages.some((p:number)=>!run.scope.pages.includes(p)) || r.scope.targets.some((t:string)=>!run.scope.targets.includes(t))))throw new Error("Inspection outside approved image scope/revision");
      if(!approved.images.every((image:any)=>delivered.some(d=>d.runId===imageRunId && d.documentRevision===state.documentRevision && ["root","workspace","plugin","job"].every(key=>d.input[key]===args[key]) && d.scope.pages.includes(image.page) && (image.target?d.scope.targets.includes(image.target):!d.scope.targets.length))))throw new Error("Read approved images before recording comparison");
      if(!run.scope.pages.every((p:number)=>records.some((r:any)=>r.scope.pages.includes(p))) || !run.scope.targets.every((t:string)=>records.some((r:any)=>r.scope.targets.includes(t))))throw new Error("Record the complete approved image scope, or leave it not compared");
      comparisons.push({...run,state:"compared"});
    }
    return scopedReview(host,{...common,action:"workspace-review-change",change:{kind:"inspection",comparisons,records:records.map((record:any)=>({...record,runId:imageRunId??randomUUID()}))}},scope,true);
  } else action=name==="estimate_review_images"?"workspace-image-estimate":"workspace-image-read";
  const result=await scopedReview(host,{...args,...extra,action},scope,writing);
  return name==="read_review_images" ? {...result,workspace:location} : result;
}

/** Called exclusively from the validated human-answer path, never a provider tool. */
export async function answerReviewImageQuestion(host:Pick<PluginHost,"generatedDocuments">, raw:unknown, scope:DocumentToolScope, actor:string, assertActive:()=>void) {
  const {estimateHash,path:requested,selection}=parseReviewImageQuestion(raw);
  const request={...await resolveReview(host,requested,scope),selection};
  const estimate=await scopedReview(host,{...request,action:"workspace-image-estimate"},scope);
  if(estimate.receipt.outcome!=="success" || estimate.estimateHash!==estimateHash)throw new Error("Image estimate changed; request a new human approval");
  assertActive();
  const runId=randomUUID();
  const result=await scopedReview(host,{root:request.root,workspace:request.workspace,plugin:request.plugin,job:request.job,action:"workspace-review-change",baseline:estimate.baseline,requestId:randomUUID(),change:{kind:"inspection",
    comparisons:[{runId,contentRevision:estimate.contentRevision,scope:request.selection,state:"not-compared",selected:true,withdrawn:null}],
    records:[{runId,lens:"source-evidence",contentRevision:estimate.contentRevision,scope:request.selection,state:"not-inspected",
      evidence:JSON.stringify({format:"review-image-approval-1",human:{actor,reason:"Approved displayed image estimate",confirmed:true},documentRevision:estimate.documentRevision,images:estimate.images,estimatedInputTokens:estimate.estimatedInputTokens})}] }},scope,true);
  if(result.receipt.outcome!=="success")throw new Error(`Image approval was not saved; query review request status ${result.receipt.requestId}`);
  return {runId,baseline:result.baseline,selection:request.selection};
}

/** Actual provider turn totals, not a fabricated per-image attribution. */
export async function recordReviewImageUsage(host:Pick<PluginHost,"generatedDocuments">,input:any,scope:DocumentToolScope,usage:unknown,turnId:string) {
  const {root,workspace,plugin,job}=input.input;
  const result=await scopedReview(host,{root,workspace,plugin,job,action:"workspace-image-usage",requestId:randomUUID(),runId:input.runId,scope:input.scope,turnId,usage},scope,true);
  if(result.receipt.outcome!=="success")throw new Error(`Image usage not saved; query request status ${result.receipt.requestId}`);
}
