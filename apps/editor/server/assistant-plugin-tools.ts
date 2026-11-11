import type { DocumentToolScope } from "./assistant-document-tools.ts";
import { accessPath } from "./file-access.ts";
import { PLUGIN_REGISTRATION_CHANGED, pluginManagementSchema, jobRequestSchema, PLUGIN_JOBS } from "@litzio/plugin-sdk";
import type { PluginHost } from "./plugins/plugin-host.ts";
import { z } from "zod";
import { publicOperationError } from "./plugins/operation-result.ts";
import { workspaceRequestSchema, reviewLedgerChangeSchema, reviewLedgerSchema } from "@litzio/plugin-sdk";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const reviewDocumentTools = [{ type: "function", name: "read_review_document", description: "Read the canonical document, revisions and progress of a prepared review workspace on this Host. Uses the common review reader; never pass an archive-internal or fake Markdown path. Does not prepare or write the workspace.", inputSchema: z.toJSONSchema(workspaceRequestSchema.options[0]!.omit({ action: true })) }];
export async function executeReadReviewDocument(host: Pick<PluginHost, "generatedDocuments">, input: unknown, scope: DocumentToolScope) {
  const parsed = workspaceRequestSchema.parse({ ...(input as object), action: "workspace-read" });
  if (parsed.action !== "workspace-read" || !scope.folders) throw new Error("No opened folders for this review.");
  const root = scope.folders.resolve(accessPath(parsed.root, scope.access));
  scope.folders.resolve(accessPath(path.resolve(root, parsed.workspace), scope.access));
  return host.generatedDocuments.execute(parsed);
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

const workspaceFields = workspaceRequestSchema.options[0]!.omit({action:true});
const writeFields = workspaceFields.extend({baseline:z.string().regex(/^[a-f0-9]{64}$/),requestId:z.uuid()});
const actionSchema = (action:string): any => workspaceRequestSchema.options.find((schema:any)=>schema.shape?.action?.value===action);
const materialInput = workspaceFields.extend({kind:z.enum(["lenses","source-evidence","required-checks","groups","page"]),pageNo:z.number().int().positive().optional()});
const proposeInput = writeFields.extend({change:reviewLedgerChangeSchema.options[0]!});
const inspectionInput = writeFields.extend({records:z.array(reviewLedgerSchema.shape.inspections.element.omit({runId:true})).min(1).max(1000),imageRunId:z.string().min(1).optional()});
export const reviewImageQuestionSchema = actionSchema("workspace-image-estimate").omit({action:true}).extend({estimateHash:z.string().regex(/^[a-f0-9]{64}$/)});
const reviewInputs = {
  read_review_material:materialInput,
  run_review_source_evidence:writeFields.extend({pages:z.array(z.number().int().positive()).min(1).max(10000).optional()}),
  propose_review_groups:proposeInput,
  record_review_inspection:inspectionInput,
  estimate_review_images:actionSchema("workspace-image-estimate").omit({action:true}),
  read_review_images:actionSchema("workspace-image-read").omit({action:true}),
};
const descriptions: Record<keyof typeof reviewInputs,string> = {
  read_review_material:"Read review lenses, source-evidence candidates (numeric/unit first), required picture/table checks, groups, or a page fragment with neighboring items, relations, original text/provenance and current block correspondence. No images.",
  run_review_source_evidence:"Run the common source-evidence operation and save candidates, never proposals or document changes. Generate one requestId; on uncertainty read status, never replay.",
  propose_review_groups:"Save proposed review groups only through the common validated operation. Does not approve or change the document. Target before-content must match; insert requires source evidence. Never bypass rejection. On uncertainty read status; never replay.",
  record_review_inspection:"Record only scopes you actually read. Use uncertain when evidence is insufficient. Cannot select/approve an image run, complete required checks or change documents. With imageRunId, record comparison results only after reading all approved images in this turn.",
  estimate_review_images:"Calculate selected page/region counts and estimated input tokens without returning images. Show the returned estimateHash and selection using request_litzio_user_input reviewImage. Acceptance is display only; wait for the human answer and its runId.",
  read_review_images:"Read only images selected by a real human question-card answer, using its runId and the latest workspace baseline. Pages require whole-page approval; target regions require that exact target/page. Cannot self-confirm. Record findings with record_review_inspection; provider turn usage is recorded separately.",
};
export const reviewAssistantTools = Object.entries(reviewInputs).map(([name,schema])=>({type:"function",name,description:descriptions[name as keyof typeof reviewInputs],inputSchema:z.toJSONSchema(schema)}));
reviewAssistantTools.push({type:"function",name:"read_review_request_status",description:"Observe the same requestId after an uncertain review write; never replay it.",inputSchema:z.toJSONSchema(workspaceFields.extend({requestId:z.uuid()}))});

async function scopedReview(host:Pick<PluginHost,"generatedDocuments">, input:any, scope:DocumentToolScope, writing=false) {
  if (writing && !["opened-folders","full-access"].includes(scope.permissionMode)) throw new Error("Review writes are unavailable in read-only turns.");
  if (!scope.folders) throw new Error("No opened folders for this review.");
  const root=scope.folders.resolve(accessPath(input.root,scope.access));
  scope.folders.resolve(accessPath(path.resolve(root,input.workspace),scope.access));
  return host.generatedDocuments.execute({...input,root});
}
export async function executeReviewAssistantTool(host:Pick<PluginHost,"generatedDocuments">,name:string,input:unknown,scope:DocumentToolScope, delivered: {input:any;runId:string;documentRevision:string;scope:{pages:number[];targets:string[]}}[] = []) {
  if(name==="read_review_request_status") {
    const {requestId,...location}=workspaceFields.extend({requestId:z.uuid()}).parse(input);
    await scopedReview(host,{...location,action:"workspace-read"},scope);
    const result=await host.generatedDocuments.execute({action:"workspace-status",requestId});
    if(result.receipt && result.receipt.scope!==accessPath(location.root,scope.access) || result.workspace && ["plugin","job","workspace"].some(key=>result.workspace[key]!==location[key as keyof typeof location]))throw new Error("Review request belongs to another workspace");
    return result;
  }
  const schema=reviewInputs[name as keyof typeof reviewInputs];
  if(!schema)throw new Error("Unknown review assistant tool");
  const args=schema.parse(input);
  let action:string, extra:object={}, writing=false;
  if(name==="read_review_material") {
    const {kind,pageNo,...common}=args;
    if(kind==="page" && !pageNo || kind!=="page" && pageNo!==undefined)throw new Error("pageNo is required only for page material");
    action=({lenses:"workspace-lenses","source-evidence":"workspace-evidence","required-checks":"workspace-required-checks",groups:"workspace-groups-read",page:"workspace-material"} as any)[kind];
    return scopedReview(host,{...common,action,...(kind==="page"?{pageNo}:{}),...(kind==="source-evidence"?{mode:"read"}:{})},scope);
  }
  if(name==="run_review_source_evidence"){action="workspace-evidence";extra={mode:"run"};writing=true;}
  else if(name==="propose_review_groups"){action="workspace-review-change";writing=true;}
  else if(name==="record_review_inspection") {
    const {records,imageRunId,...common}=args;
    const comparisons=[];
    if(imageRunId){
      const state=await scopedReview(host,{root:args.root,workspace:args.workspace,plugin:args.plugin,job:args.job,action:"workspace-read"},scope);
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
  return scopedReview(host,{...args,...extra,action},scope,writing);
}

/** Called exclusively from the validated human-answer path, never a provider tool. */
export async function answerReviewImageQuestion(host:Pick<PluginHost,"generatedDocuments">, raw:unknown, scope:DocumentToolScope, actor:string, assertActive:()=>void) {
  const {estimateHash,...request}=reviewImageQuestionSchema.parse(raw);
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
