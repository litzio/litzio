import { inspectEvidence, evidenceMaterialSchema, renderEvidenceImage } from "./review-evidence.ts";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { authorDocument, parse, serialize, getEditableDocument } from "@litzio/core";
import { commitFileFromPath, textRevision } from "@litzio/file-commit";
import { REVIEW_AUTHORING_CONTRACT, JOB_FILE_MAX_BYTES, workspaceRequestSchema, workspaceStateSchema, workspaceSnapshotSchema, evaluateReviewCompletion, type WorkspaceSnapshot } from "@litzio/plugin-sdk";
import { validatedAuthoringRequest, exportReviewDocumentFile } from "../document-authoring.ts";
import { validateImage } from "../image-validation.ts";
import { readModel } from "../document-replay.ts";
import { FileAccessError, RootAccess, accessPath, canonicalFilePath, type FileAccess } from "../file-access.ts";

type Provider = { workspace?:boolean; operation: string; version: number; comparison?: string; assertCurrent(): void };
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const revision = (file: string) => { if (statSync(file).size > JOB_FILE_MAX_BYTES) throw new Error("Workspace exceeds Host limit"); return hash(readFileSync(file)); };

/** Source formats remain opaque. The Host owns canonical validation, admission and one-file commit. */
export class ReviewWorkspaces {
  private requests = new Map<string, unknown>();
  private admissions = new Map<string, {done:Promise<void>;release():void}>();
  private unsettled = new Map<string, { requestId: string; checked: boolean }>();
  constructor(private access: FileAccess, private declaration: (plugin: string, job: string) => Provider,
    private invoke: (operation: string, input: unknown, version: number) => Promise<{ result?: unknown; error?: string }>,
    private busy: Set<string>,
    private publish?: (plugin:string,root:string,file:string,source:string,raw:unknown,image?:Buffer,embedded?:{source:string})=>any,
    private readComparison?: (input:unknown)=>Promise<any>,
    private find?: (file?:string)=>{plugin:string;job:string;accept:string[]}[]) {}

  async execute(raw: unknown): Promise<any> {
    const input = workspaceRequestSchema.parse(raw);
    if (input.action === "workspace-status") {
      for (const lock of this.unsettled.values()) if (lock.requestId === input.requestId) lock.checked = true;
      return structuredClone(this.requests.get(input.requestId) ?? { state: "unknown", guidance: "Read the workspace; never automatically replay writes." });
    }
    const root = accessPath(input.root, this.access), boundary = new RootAccess([root]);
    if (input.action === "workspace-find") {
      const receipt={requestId:randomUUID(),operation:"review.workspace-find",version:1,scope:root,outcome:"success"};
      if(!input.path)return {providers:this.find?.()??[],receipt};
      const file=accessPath(boundary.resolve(path.isAbsolute(input.path)?input.path:path.join(root,input.path)),this.access);
      return {targets:(this.find?.(canonicalFilePath(file))??[]).map(target=>({...target,root,workspace:path.relative(root,file),baseline:revision(file)})),receipt};
    }
    if (path.isAbsolute(input.workspace) || /^[a-z]:|^\\\\/i.test(input.workspace)) throw new Error("Expected a Root-relative workspace");
    const file = accessPath(boundary.resolve(path.join(root, input.workspace)), this.access), key = canonicalFilePath(file);
    const writing = !(input.action === "workspace-evidence" && input.mode === "read") && !["workspace-material","workspace-image-estimate","workspace-image-read","workspace-read","workspace-compare","workspace-image","workspace-export-check", "workspace-groups-read", "workspace-lenses", "workspace-inspection", "workspace-required-checks", "workspace-completion"].includes(input.action), requestId = "requestId" in input ? input.requestId : randomUUID();
    if (writing && this.requests.has(requestId)) throw Object.assign(new Error("Duplicate requestId; query status"),{errorKind:"uncertain",receipt:{requestId,outcome:"uncertain"}});
    const unsettled = this.unsettled.get(key);
    if (writing && unsettled) throw Object.assign(new Error(`Uncertain workspace request ${unsettled.requestId}; query its status and read the workspace before changing it`),{errorKind:"uncertain",receipt:{requestId:unsettled.requestId,outcome:"uncertain"}});
    if (this.busy.has(key)) {
      const current=this.admissions.get(key);
      if((!writing || input.action==="workspace-image-usage")&&current){await current.done;return this.execute(raw);}
      throw new Error("Workspace operation in progress");
    }
    this.busy.add(key);
    let release!:()=>void;
    this.admissions.set(key,{done:new Promise<void>(resolve=>{release=resolve;}),release:()=>release()});
    const receipt = (outcome: "success" | "failure" | "uncertain") => ({ requestId, operation: `review.${input.action}`, version: 1, scope: root, outcome });
    if (writing) this.requests.set(requestId, { state: "pending", receipt: receipt("uncertain") });
    let staging: string | undefined, publishing = false, saved = false;
    let evidence: Awaited<ReturnType<typeof inspectEvidence>> | undefined;
    try {
      const provider = this.declaration(input.plugin, input.job), before = revision(file);
      if(!provider.workspace)throw new Error(`Job ${input.plugin}.${input.job} does not create a review workspace. Choose a workspace provider job.`);
      const check = () => { provider.assertCurrent(); accessPath(boundary.resolve(file), this.access); if (revision(file) !== before) throw Object.assign(new Error("Workspace baseline conflict; read before writing"),{errorKind:"conflict"}); };
      const call = async (mode: string, target = file, extra = {}) => {
        check();
        const response = await this.invoke(provider.operation, { mode, file: target, sourceRevision: revision(target), ...extra }, provider.version);
        check(); if (response.error) throw Object.assign(new Error("Workspace provider unavailable or rejected input"),{errorKind:"unavailable"});
        return response.result;
      };
      if ("baseline" in input && input.baseline !== undefined && input.baseline !== before) throw Object.assign(new Error("Workspace baseline conflict; read before writing"),{errorKind:"conflict"});
      const original = workspaceStateSchema.parse(await call("workspace-read"));
      if (original.snapshot) {
        try { validateSnapshot(original.snapshot); }
        catch { original.snapshot = null; original.cacheState = "invalid"; }
      }
      const result = (state: typeof original, baseline: string, saved: boolean) => ({ ...state, baseline, workspace: { plugin: input.plugin, job: input.job, root, workspace: input.workspace },
        ...(state.snapshot ? { document: readModel(state.snapshot.source).document, documentRevision: state.snapshot.documentRevision, contentRevision: state.snapshot.contentRevision } : {}),
        ...(input.action === "workspace-evidence" ? { evidence: evidence ?? readEvidence(state.ledger?.inspections ?? []) } : {}),
        completion: state.ledger ? evaluateReviewCompletion(state.ledger, state.snapshot?.contentRevision ?? "", state.snapshot ? hash(Buffer.from(JSON.stringify(state.snapshot))) : null, state.cacheState === "current" && !this.unsettled.has(key)) : "not-evaluated", saved, receipt: receipt("success") });
      if (["workspace-read", "workspace-groups-read", "workspace-lenses", "workspace-inspection", "workspace-required-checks", "workspace-completion"].includes(input.action)) {
        // Only an explicit status lookup followed by a validated file reread resolves an uncertain publication.
        check();
        if (unsettled?.checked) this.unsettled.delete(key);
        return result(original, before, false);
      }
      if (input.action === "workspace-evidence" && input.mode === "read") { check(); return result(original, before, false); }
      if (input.action === "workspace-material") {
        if (!original.snapshot) throw new Error("Current review document required");
        const material = await call("workspace-review-material", file, {pageNo:input.pageNo});
        return {material, baseline:before, documentRevision:original.snapshot.documentRevision, contentRevision:original.snapshot.contentRevision, receipt:receipt("success")};
      }
      if (input.action === "workspace-image-estimate") {
        if (!original.snapshot || original.cacheState !== "current" || !original.ledger?.inventory) throw new Error("Current review inventory required");
        const selection = input.selection, inventory = original.ledger.inventory;
        if (selection.pages.some(p=>!inventory.pages.includes(p)) || selection.targets.some(t=>!inventory.targets.includes(t))) throw new Error("Unknown image selection");
        const images: {page:number;target?:string;bbox:number[]}[] = [];
        let textCharacters = 0;
        for (const page of selection.pages) {
          const material:any = await call("workspace-review-material",file,{pageNo:page});
          textCharacters += JSON.stringify(material).length;
          if (!selection.targets.length) {
            const size=material.pageSizes.find((p:any)=>p.page===page);
            if (!size) throw new Error("Image page unavailable");
            images.push({page,bbox:[0,0,size.width,size.height]});
          } else for (const region of material.regions) if (region.page===page && selection.targets.includes(region.target)) images.push(region);
        }
        if(images.some(image=>image.bbox.some(n=>!Number.isFinite(n)) || image.bbox[2]!<=image.bbox[0]! || image.bbox[3]!<=image.bbox[1]! || Math.ceil((image.bbox[2]!-image.bbox[0]!)*2)*Math.ceil((image.bbox[3]!-image.bbox[1]!)*2)>16_000_000))throw new Error("Image pixel limit exceeded or invalid region; select a smaller scope");
        if (!images.length || selection.targets.some(target=>!images.some(image=>image.target===target))) throw new Error("Selection has no image regions");
        // Model-independent planning heuristic, not billed usage. Include repeated neighboring text conservatively.
        const estimatedInputTokens = textCharacters + images.reduce((n,image)=>n+85+170*Math.ceil((image.bbox[2]!-image.bbox[0]!)*2/512)*Math.ceil((image.bbox[3]!-image.bbox[1]!)*2/512),0);
        const estimate = {baseline:before,documentRevision:original.snapshot.documentRevision,contentRevision:original.snapshot.contentRevision,selection,images,
          pageCount:selection.pages.length,regionCount:images.length,estimatedInputTokens,estimation:"Text characters plus 85+170 per 512px image tile at 2x; heuristic, model-dependent, not billed tokens"};
        if (JSON.stringify({images,documentRevision:estimate.documentRevision}).length > 8000) throw new Error("Image approval record limit; select a smaller scope");
        return {...estimate,estimateHash:hash(Buffer.from(JSON.stringify(estimate))),receipt:receipt("success")};
      }
      if (input.action === "workspace-image-read") {
        const run = [...(original.ledger?.comparisons??[])].reverse().find(run=>run.runId===input.runId);
        const approval = original.ledger?.inspections.find(record=>record.runId===input.runId && (()=>{try{return JSON.parse(record.evidence).format==="review-image-approval-1";}catch{return false;}})());
        const approved = approval ? JSON.parse(approval.evidence) : null;
        if (!run?.selected || run.withdrawn || run.contentRevision!==original.snapshot?.contentRevision || approved?.documentRevision!==original.snapshot?.documentRevision) throw new Error("Human image approval required for this document revision");
        const image = approved.images.find((image:any)=>image.page===input.pageNo && image.target===input.target);
        if (!image) throw new Error("Image outside human-approved scope");
        // A target may span several regions; return each approved region, never the containing page.
        const selected = approved.images.filter((image:any)=>image.page===input.pageNo && image.target===input.target);
        const material=evidenceMaterialSchema.parse(await call("workspace-evidence-material"));
        const images=[];
        for(const image of selected) images.push({...image,...await renderEvidenceImage(material,image.page,image.bbox)});
        check(); return {runId:input.runId,images,documentRevision:original.snapshot!.documentRevision,receipt:receipt("success")};
      }
      let evidenceChange: unknown;
      if(input.action==="workspace-image-usage") {
        const run=[...(original.ledger?.comparisons??[])].reverse().find(run=>run.runId===input.runId);
        if(!original.snapshot || original.cacheState!=="current" || !run || input.scope.pages.some(p=>!run.scope.pages.includes(p)) || input.scope.targets.some(t=>!run.scope.targets.includes(t)))throw new Error("Usage requires an existing image run and its scope");
        evidenceChange={kind:"inspection",comparisons:[],records:[{runId:input.runId,lens:"source-evidence",contentRevision:original.snapshot.contentRevision,scope:input.scope,state:"not-inspected",
          evidence:JSON.stringify({format:"review-image-usage-1",source:"provider-turn-total-not-per-image",turnId:input.turnId,usage:input.usage})}]};
      }
      if (input.action === "workspace-evidence" && input.mode === "run") {
        if (!original.snapshot || original.cacheState !== "current") throw new Error("Current workspace document required");
        const material = evidenceMaterialSchema.parse(await call("workspace-evidence-material"));
        evidence = await inspectEvidence(original.snapshot.source, material, input.pages);
        check();
        // Existing inspection evidence is bounded text. Chunk the observation without extending the ledger.
        const serialized = JSON.stringify(evidence), chunks = serialized.match(/[\s\S]{1,3000}/g) ?? [];
        evidenceChange = { kind: "inspection", comparisons: [], records: chunks.map((data, part) => ({
          lens: "source-evidence", runId: requestId, contentRevision: original.snapshot!.contentRevision,
          scope: { pages: evidence!.pages, targets: [] }, state: "uncertain",
          evidence: JSON.stringify({ format: "source-evidence-1", part, total: chunks.length, data }),
        })) };
      }
      const image = async (ref:string) => {
        const expected=original.snapshot?.images.find(image=>image.revision===ref);
        if (!expected) throw new Error("Unknown workspace image");
        const value:any=await call("workspace-material",file,{ref});
        const bytes=Buffer.from(value.base64,"base64");
        if(bytes.length>10*1024*1024 || bytes.toString("base64")!==value.base64 || hash(bytes)!==ref || value.revision!==ref || value.mime!==expected.mime) throw new Error("Mixed workspace image");
        validateImage(value.mime,bytes); return {...value,bytes};
      };
      if (input.action === "workspace-image") { const value=await image(input.ref); return {mime:value.mime,base64:value.base64,revision:value.revision,baseline:before,receipt:receipt("success")}; }
      if (input.action === "workspace-compare") {
        if (!original.snapshot || !provider.comparison || !this.publish || !this.readComparison) throw new Error("Workspace comparison unavailable; explicitly regenerate the snapshot");
        staging=mkdtempSync(path.join(tmpdir(),"litzio-review-workspace-"));
        const candidate=path.join(staging,"candidate"); writeFileSync(candidate,"",{flag:"wx"});
        const generation=randomUUID();
        // Older, intact snapshots remain readable. Do not reconstruct old correspondence with a new adapter.
        const material:any=original.cacheState==="created-version" ? {review:provider.comparison,bundle:{generation,documentRevision:original.snapshot.documentRevision,documentHash:original.snapshot.documentRevision,sourceRevision:before},pages:[],images:[]}
          : await call("workspace-material",file,{pageNo:input.pageNo,generation,resultFile:{path:candidate,maxBytes:16*1024*1024}});
        if(material.review!==provider.comparison || original.cacheState!=="created-version"&&(material.images?.length!==1 || material.images[0].path!==candidate || statSync(candidate).size>16*1024*1024)) throw new Error("Invalid workspace comparison material");
        const bundle=this.publish(input.plugin,root,file,file,material,material.images.length?readFileSync(candidate):undefined,{source:original.snapshot.source});
        const pageNo=input.pageNo ?? Number(original.record.lastPage??1);
        const comparison=await this.readComparison({action:"read",plugin:input.plugin,review:provider.comparison,root,bundleRef:bundle.bundleRef,pageNo});
        check(); return {...comparison,workspaceBaseline:before,contentRevision:original.snapshot.contentRevision,completion:"not-evaluated",cacheState:original.cacheState,images:original.snapshot.images,progress:{checkedPages:original.record.checkedPages,lastPage:original.record.lastPage},receipt:receipt("success")};
      }
      if (input.action === "workspace-export-check" || input.action === "workspace-export") {
        if (!original.snapshot) throw new Error("Workspace snapshot unavailable");
        if (original.cacheState !== "current") throw new Error("Explicit regeneration is required before exporting this snapshot");
        const workspaceName=path.relative(canonicalFilePath(root),canonicalFilePath(file));
        const relative=input.output??path.join(path.dirname(workspaceName),`${path.basename(workspaceName,path.extname(workspaceName))}-검수중.md`);
        if(path.isAbsolute(relative)||/^[a-z]:|^\\\\/i.test(relative)) throw new Error("Expected a Root-relative export path");
        const output=accessPath(boundary.resolve(path.join(root,relative),true),this.access,true);
        if(path.extname(output).toLowerCase()!==".md"||canonicalFilePath(output,true)===key) throw new Error("Expected a separate Markdown export path");
        const targetRevision=()=>existsSync(output)?hash(readFileSync(output)):null;
        if(input.action==="workspace-export-check") return {output:relative,path:output,targetRevision:targetRevision(),baseline:before,receipt:receipt("success")};
        if(input.targetRevision!==targetRevision() || input.targetRevision!==null&&!input.overwrite) throw new Error("Export target conflict; inspect and explicitly confirm overwrite");
        const targetKey=canonicalFilePath(output,true);
        if(this.busy.has(targetKey)) throw new Error("Export target operation in progress");
        this.busy.add(targetKey);
        try {
          const images=await Promise.all([...new Set(original.snapshot.images.map(image=>image.revision))].map(image));
          const outputCheck=()=>{check();accessPath(boundary.resolve(output,true),this.access,true);if(targetRevision()!==input.targetRevision)throw new Error("Export target conflict");};
          const exported=exportReviewDocumentFile(output,original.snapshot.source,images,this.access,outputCheck,input.targetRevision);
          const value={...exported,mode:"current",completion:"not-evaluated",workspaceSaved:false,receipt:receipt("success")};
          this.requests.set(requestId,value);return value;
        } finally {this.busy.delete(targetKey);}
      }
      if (!writing || input.action === "workspace-open" && ["current", "created-version"].includes(original.cacheState)) {
        check(); const value = result(original, before, false); if (writing) this.requests.set(requestId, value); return value;
      }
      if (["workspace-patch", "workspace-progress", "workspace-review-change"].includes(input.action) && original.cacheState !== "current") throw new Error("Explicit regeneration is required before changing this workspace");
      staging = mkdtempSync(path.join(tmpdir(), "litzio-review-workspace-"));
      const candidate = path.join(staging, "candidate"); writeFileSync(candidate, "", { flag: "wx", mode: 0o600 });
      const resultFile = { path: candidate, maxBytes: JOB_FILE_MAX_BYTES };
      const plan: any = await call("workspace-prepare", file, { resultFile, ...("patches" in input ? { patches: input.patches } : {}), ...("progress" in input ? { progress: input.progress } : {}),
        ...("change" in input || evidenceChange ? { change: evidenceChange ?? ("change" in input ? input.change : undefined), requestId, revision: randomUUID(), at: new Date().toISOString() } : {}) });
      if (typeof plan.rejection === "string") throw new Error(plan.rejection);
      let expected: Omit<WorkspaceSnapshot, "cacheKey"> | undefined;
      const preserveSnapshot = input.action === "workspace-progress" || input.action === "workspace-evidence" || input.action === "workspace-image-usage" || input.action === "workspace-review-change" && plan.preserveSnapshot === true;
      if (plan.snapshot) {
        // Providers may update a saved document through SDK Core operations. Never rebuild it from its source format.
        const snapshot = workspaceSnapshotSchema.parse(plan.snapshot);
        validateSnapshot(snapshot);
        if (original.snapshot && (snapshot.contentRevision !== original.snapshot.contentRevision ||
            JSON.stringify(snapshot.images) !== JSON.stringify(original.snapshot.images))) throw new Error("Document update changed immutable source bindings");
        const { cacheKey: _key, ...canonical } = snapshot;
        expected = canonical;
      } else if (!preserveSnapshot) {
        const { input: build, images } = validatedAuthoringRequest(plan.build);
        // An internal image identity addresses bytes supplied by the provider, never an external path/URL.
        if (build.authoring.inputs.some(item => item.blocks.some(block => block.kind === "figure" && block.imageAsset === undefined && block.imageUrl !== ""))) throw new Error("Workspace images require stable asset bindings");
        const bindings: Record<string, string> = Object.create(null);
        const imageRefs = images.map(image => {
          const ref = plan.imageRefs?.find((ref: any) => ref.key === image.key);
          const digest = hash(image.bytes);
          if (!ref || ref.revision !== digest || ref.mime !== image.mime) throw new Error("Mixed workspace image binding");
          bindings[image.key] = `review-asset:${digest}`;
          return ref;
        });
        if (plan.imageRefs?.length !== images.length) throw new Error("Unbound workspace image");
        const authored = await authorDocument(build.authoring, bindings);
        expected = { source: authored.source, documentRevision: authored.documentRevision, inputs: authored.inputs, contentRevision: plan.contentRevision,
          adapterVersion: plan.adapterVersion, authoringContract: REVIEW_AUTHORING_CONTRACT, images: imageRefs };
        await call("workspace-seal", candidate, { snapshot: expected, sealInput: plan.sealInput, resultFile });
      }
      const prepared = workspaceStateSchema.parse(await call("workspace-read", candidate));
      if (!prepared.snapshot || prepared.cacheState !== "current") throw new Error("Candidate has no current validated snapshot");
      validateSnapshot(prepared.snapshot);
      const { cacheKey: _cacheKey, ...actual } = prepared.snapshot;
      if (expected && JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Provider changed the Host canonical snapshot");
      if (preserveSnapshot && JSON.stringify(prepared.snapshot) !== JSON.stringify(original.snapshot)) throw new Error("Review metadata changed the canonical snapshot");
      check();
      const after = await commitFileFromPath(file, candidate, before, JOB_FILE_MAX_BYTES, () => { check(); publishing = true; });
      saved = true;
      const value = result(prepared, after, true); this.requests.set(requestId, value); return value;
    } catch (error) {
      if (publishing && !saved) this.unsettled.set(key, { requestId, checked: false });
      const value = { state: publishing && !saved ? "uncertain" : "failed", saved, errorKind: publishing && !saved ? "uncertain" : (error as any)?.errorKind ?? (error instanceof FileAccessError || ["EACCES","EPERM"].includes((error as NodeJS.ErrnoException)?.code ?? "") ? "forbidden" : "invalid_input"), error: error instanceof Error ? error.message : "Workspace operation failed",
        guidance: "Read the workspace before another write. After a lost response query this requestId; never automatically resend.", receipt: receipt(publishing && !saved ? "uncertain" : "failure") };
      if (writing) this.requests.set(requestId, value); return value;
    } finally {
      this.busy.delete(key);
      this.admissions.delete(key);release();
      if (staging) { unlinkSync(path.join(staging, "candidate")); rmdirSync(staging); }
    }
  }
}

function validateSnapshot(snapshot: WorkspaceSnapshot) {
  if (Buffer.byteLength(snapshot.source) > 4 * 1024 * 1024 || textRevision(snapshot.source) !== snapshot.documentRevision) throw new Error("Mixed workspace document revision");
  const parsed = parse(snapshot.source);
  if (serialize(parsed) !== snapshot.source) throw new Error("Workspace source is not canonical");
  const paths = new Set(getEditableDocument(parsed).blocks.map(block => JSON.stringify(block.path))), seen = new Set<string>();
  if (new Set(snapshot.inputs.map(item => item.key)).size !== snapshot.inputs.length) throw new Error("Duplicate workspace input key");
  for (const item of snapshot.inputs) for (const target of item.targets) {
    const key = JSON.stringify(target.path);
    if (target.documentHash !== snapshot.documentRevision || target.documentRevision !== snapshot.documentRevision || !paths.has(key) || seen.has(key)) throw new Error("Mixed workspace targets");
    seen.add(key);
  }
  if (seen.size !== paths.size) throw new Error("Incomplete workspace targets");
}

function readEvidence(inspections: {lens:string;runId:string;evidence:string}[]) {
  const candidate = (i: typeof inspections[number]) => { try { return i.lens === "source-evidence" && JSON.parse(i.evidence).format === "source-evidence-1"; } catch { return false; } };
  const latest = [...inspections].reverse().find(candidate);
  if (!latest) return null;
  const parts = inspections.filter(i => candidate(i) && i.runId === latest.runId).map(i => JSON.parse(i.evidence));
  if (parts.some((p,i) => p.format !== "source-evidence-1" || p.part !== i || p.total !== parts.length)) throw new Error("Incomplete source evidence inspection");
  return JSON.parse(parts.map(p => p.data).join(""));
}
