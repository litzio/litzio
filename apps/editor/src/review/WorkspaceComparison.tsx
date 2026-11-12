import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewView } from "@litzio/core/views-v2";
import type { HostClient } from "../host-client.ts";
import { ReviewRenderer, type ReviewAdapter, type ReviewSnapshot, type ReviewNavigation } from "./ReviewRenderer.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog.tsx";
import { Notice } from "../ui/primitives.tsx";
import { i18n } from "../i18n.ts";

import { WorkspaceReviewPanel, type WorkspaceReviewState } from "./WorkspaceReviewPanel.tsx";
import type { ReviewLedgerChange } from "@litzio/plugin-sdk";

export type WorkspaceTarget = {root:string;workspace:string;plugin:string;job:string};
export function WorkspaceComparison({client,target,onPending,onOpen,isDirty}: {client:HostClient;target:WorkspaceTarget;onPending?(pending:boolean):void;onOpen(path:string):void;isDirty?(path:string):boolean}) {
  const [adapter,setAdapter]=useState<ReviewAdapter>(),[dialog,setDialog]=useState(false),[ready,setReady]=useState(false),[problem,setProblem]=useState(""),[regenerate,setRegenerate]=useState(false),[epoch,setEpoch]=useState(0);
  const [reviewState,setReviewState]=useState<WorkspaceReviewState>(),[navigation,setNavigation]=useState<ReviewNavigation>(),[changing,setChanging]=useState(false);
  const comparison=useRef<ReviewSnapshot | undefined>(undefined);
  const baseline=useRef<string | undefined>(undefined), pendingCount=useRef(0), pendingChanged=useRef(onPending);pendingChanged.current=onPending;
  const request=useRef<(body:Record<string,unknown>)=>Promise<any>>(undefined);
  const mark=(busy:boolean)=>{if(busy){if(!pendingCount.current++)pendingChanged.current?.(true);}else if(!--pendingCount.current)pendingChanged.current?.(false);};
  useEffect(()=>{
    const controller=new AbortController();let tail=Promise.resolve(),savingTail=Promise.resolve(),pending:string|undefined,failed=false,progress:ReviewSnapshot["progress"];
    const images=new Map<string,string>();
    const send=(body:Record<string,unknown>)=>{
      const work=tail.then(async()=>{
        if(["workspace-compare","workspace-image"].includes(String(body.action))&&body.baseline)body={...body,baseline:baseline.current};
        if(["workspace-regenerate","workspace-review-change","workspace-evidence"].includes(String(body.action)) && body.requestId)pending=String(body.requestId);
        const response=await client.request("/api/reviews",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body.action==="workspace-status"?body:{...target,...body}),signal:controller.signal});
        const value=await response.json();controller.signal.throwIfAborted();
        if(!response.ok || body.action!=="workspace-status"&&(value.error || value.receipt&&value.receipt.outcome!=="success"))throw new Error(value.error??i18n.t("Data unavailable."));
        if(["workspace-regenerate","workspace-review-change","workspace-evidence"].includes(String(body.action)) && body.requestId)pending=undefined;
        return value;
      });tail=work.then(()=>{},()=>{});return work;
    };
    request.current=send;
    const read=async(pageNo?:number):Promise<ReviewSnapshot>=>{
      try { setProblem("");
      if(pending){const status=await send({action:"workspace-status",requestId:pending});if(status.state==="unknown" || !["success","failure"].includes(status.receipt?.outcome))throw new Error(`Outcome unknown. Check request ${pending}; do not repeat the change.`);pending=undefined;}
      const state=await send({action:"workspace-evidence",mode:"read"});setReviewState(state);baseline.current=state.baseline;setRegenerate(state.cacheState==="created-version");
      if(state.cacheState==="created-version")setProblem(i18n.t("This is the snapshot from an earlier generation contract. Regenerate explicitly to compare or change review progress."));
      if(["missing","invalid"].includes(state.cacheState)){
        pending=crypto.randomUUID();mark(true);
        try{await send({action:"workspace-open",baseline:baseline.current,requestId:pending});pending=undefined;}finally{mark(false);}
      }
      const value=await send({action:"workspace-compare",...(pageNo?{pageNo}:{})});baseline.current=value.workspaceBaseline;progress=value.progress;
      const sources:Record<string,string>={};
      for(const image of value.images){
        if(!images.has(image.revision)){const material=await send({action:"workspace-image",baseline:baseline.current,ref:image.revision});images.set(image.revision,`data:${material.mime};base64,${material.base64}`);}
        sources[`review-asset:${image.revision}`]=images.get(image.revision)!;
      }
      const snapshot={...value.snapshot,state:value.cacheState==="created-version"?"stale":value.state,workspaceBaseline:baseline.current,contentRevision:value.contentRevision,progress,imageSources:sources};
      comparison.current=snapshot;failed=false;setReady(true);return snapshot;
      } catch(error) {setProblem(error instanceof Error?error.message:String(error));throw error;}
    };
    setAdapter({read,async loadPage(snapshot,pageNo){
      const value=await send({action:"workspace-compare",baseline:baseline.current,pageNo});
      const geometry=(p:any)=>p&&{pageNo:p.pageNo,width:p.width,height:p.height,origin:p.origin,unit:p.unit,regions:p.regions};
      if(value.snapshot.documentHash!==snapshot.documentHash || JSON.stringify(geometry(value.snapshot.page))!==JSON.stringify(geometry(snapshot.pages?.find(page=>page.pageNo===pageNo))) || JSON.stringify(value.snapshot.mapping?.entries)!==JSON.stringify(snapshot.mapping?.entries))throw new Error("Workspace comparison changed");
      return value.snapshot.imageUrl;
    },async verify(snapshot){const state=await send({action:"workspace-read"});if(state.baseline!==baseline.current||state.documentRevision!==snapshot.documentRevision)throw new Error("Workspace changed");},
    async saveProgress(snapshot,pageNo,checked){
      if(failed)throw new Error("Refresh review data before continuing.");
      const pages=new Set(progress?.checkedPages??snapshot.progress?.checkedPages??[]);if(checked!==undefined){if(checked)pages.add(pageNo);else pages.delete(pageNo);}
      progress={checkedPages:[...pages].sort((a,b)=>a-b),lastPage:pageNo};const next=progress;mark(true);
      const work=savingTail.then(async()=>{if(failed)throw new Error("Refresh review data before continuing.");const id=crypto.randomUUID();pending=id;const saved=await send({action:"workspace-progress",baseline:baseline.current,requestId:id,progress:next});baseline.current=saved.baseline;pending=undefined;return {...snapshot,workspaceBaseline:baseline.current,progress:next};});
      savingTail=work.then(()=>{},()=>{});
      try{return await work;}catch(error){failed=true;setProblem(`Review progress was not confirmed. Request: ${pending}`);throw error;}finally{mark(false);}
    },async act(){throw new Error("Read-only workspace comparison");}});
    return()=>{controller.abort();request.current=undefined;};
  },[client,target.root,target.workspace,target.plugin,target.job]);
  const change=async(change:ReviewLedgerChange)=>{
    if(changing || pendingCount.current) return;
    setChanging(true);setReady(false);mark(true);setProblem("");
    try {const value=await request.current!({action:"workspace-review-change",baseline:baseline.current,requestId:crypto.randomUUID(),change});baseline.current=value.baseline;setEpoch(e=>e+1);}
    catch(error){setProblem(String((error as Error).message));setReady(false);}
    finally{mark(false);setChanging(false);}
  };
  const evidence=async()=>{
    if(changing || pendingCount.current) return;
    setChanging(true);setReady(false);mark(true);
    try {const value=await request.current!({action:"workspace-evidence",mode:"run",baseline:baseline.current,requestId:crypto.randomUUID()});baseline.current=value.baseline;setEpoch(e=>e+1);}
    catch(error){setProblem(String((error as Error).message));setReady(false);}
    finally{mark(false);setChanging(false);}
  };
  const loadMaterial=useCallback(async(pageNo:number)=>{
    const expected=baseline.current;
    const value=await request.current!({action:"workspace-material",pageNo});
    if(value.baseline!==expected || value.baseline!==baseline.current)throw new Error("Refresh review data before continuing.");
    return value.material;
  },[]);
  const loadThumbnail=useCallback(async(pageNo:number)=>{
    // Same serialized adapter queue and coherence checks as the continuous source.
    return comparison.current && adapter?.loadPage?.(comparison.current,pageNo);
  },[adapter]);
  const view:ReviewView={kind:"litzio-view",schemaVersion:2,catalog:"litzio-v2",profile:"review",title:target.workspace,refresh:"manual",sources:{review:{plugin:target.plugin,review:"compare",bundleRef:`${target.workspace}:${epoch}`}},layout:{component:"Panel",direction:"vertical",children:[{component:"SourceDocumentCompare",title:i18n.t("Source comparison"),source:"review"}]}};
  return <>{problem&&<Notice tone="warning">{problem}</Notice>}{adapter&&<WorkspaceReviewPanel state={reviewState} disabled={!ready||changing||regenerate||!!pendingCount.current||!!problem} onChange={change} onEvidence={evidence} onNavigate={setNavigation} loadMaterial={loadMaterial} loadThumbnail={loadThumbnail}><ReviewRenderer blocked={changing || !ready} navigation={navigation} view={view} adapter={adapter} actions={<>{regenerate&&<Button variant="outline" size="sm" disabled={!!pendingCount.current} onClick={()=>{const id=crypto.randomUUID();mark(true);void request.current!({action:"workspace-regenerate",baseline:baseline.current,requestId:id}).then(value=>{baseline.current=value.baseline;setRegenerate(false);setEpoch(epoch=>epoch+1);}).catch(error=>{setReady(false);setRegenerate(false);setProblem(`${error.message} · Request: ${id}`);}).finally(()=>mark(false));}}>{i18n.t("Regenerate review snapshot")}</Button>}<Button variant="outline" size="sm" disabled={!ready||regenerate||!!pendingCount.current} onClick={()=>{setProblem("");setDialog(true);}}>{i18n.t("Export current state…")}</Button></>} /></WorkspaceReviewPanel>}
    {dialog&&<WorkspaceExport onOpen={onOpen} isDirty={isDirty} onClose={()=>setDialog(false)} onRequest={async body=>{mark(true);try{return await request.current!(body.action==="workspace-status"?body:{...body,baseline:baseline.current});}finally{mark(false);}}} />}</>;
}

function WorkspaceExport({onRequest,onClose,onOpen,isDirty}:{onRequest(body:Record<string,unknown>):Promise<any>;onClose():void;onOpen(path:string):void;isDirty?(path:string):boolean}) {
  const [output,setOutput]=useState(""),[inspection,setInspection]=useState<any>(),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[exported,setExported]=useState<string>();
  const pending=useRef(false),focus=useRef<HTMLInputElement>(null),requestId=useRef<string | undefined>(undefined),uncertain=useRef(false);
  useEffect(()=>{let active=true;void onRequest({action:"workspace-export-check"}).then(value=>{if(active){setInspection(value);setOutput(value.output);}}).catch(error=>{if(active)setError(String(error.message));});return()=>{active=false;};},[]);
  const submit=async()=>{
    if(pending.current||uncertain.current)return;pending.current=true;setBusy(true);setError("");
    try {
      const check=await onRequest({action:"workspace-export-check",output});
      if(isDirty?.(check.path))throw new Error(i18n.t("Save or close the unsaved target document before exporting."));
      if(check.targetRevision!==null&&(!confirmed||inspection?.targetRevision!==check.targetRevision||inspection?.output!==check.output)){setInspection(check);setConfirmed(false);return;}
      requestId.current=crypto.randomUUID();uncertain.current=true;
      const result=await onRequest({action:"workspace-export",mode:"current",output,targetRevision:check.targetRevision,overwrite:check.targetRevision!==null,requestId:requestId.current});
      uncertain.current=false;setExported(result.path);
    } catch(error){setError(`${error instanceof Error?error.message:String(error)}${uncertain.current?` · Request: ${requestId.current}`:""}`);}
    finally{pending.current=false;setBusy(false);}
  };
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent showCloseButton={!busy} initialFocus={focus}>
    <form className="grid gap-3" onSubmit={event=>{event.preventDefault();void submit();}}><DialogHeader><DialogTitle>{i18n.t("Export current state…")}</DialogTitle><DialogDescription>{i18n.t("This exports a regular document in review. It does not mark review complete.")}</DialogDescription></DialogHeader>
      {exported?<><p>{exported}</p><Button type="button" onClick={()=>onOpen(exported)}>{i18n.t("Open document")}</Button></>:<><Input ref={focus} aria-label={i18n.t("Output file")} value={output} disabled={busy} onChange={event=>{setOutput(event.target.value);setConfirmed(false);}} />
      {inspection?.targetRevision!==null&&inspection?.targetRevision!==undefined&&<label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)} /> {i18n.t("Replace the existing document")}</label>}</>}
      {error&&<Notice tone="warning">{error}</Notice>}{uncertain.current&&<Button type="button" variant="outline" disabled={busy} onClick={()=>{setBusy(true);void onRequest({action:"workspace-status",requestId:requestId.current}).then(value=>{if(value.receipt?.outcome==="success"&&value.path){uncertain.current=false;setExported(value.path);setError("");}else setError("Outcome unknown. Read the target before continuing.");}).catch(error=>setError(String(error.message))).finally(()=>setBusy(false));}}>{i18n.t("Check request status")}</Button>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{i18n.t("Close")}</Button>{!exported&&<Button type="submit" disabled={busy||!output||uncertain.current}>{i18n.t("Export current state")}</Button>}</DialogFooter></form>
  </DialogContent></Dialog>;
}
