import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ReviewLedger, ReviewLedgerChange } from "@litzio/plugin-sdk";
import type { ReviewAdapter, ReviewNavigation } from "./ReviewRenderer.tsx";
import { ScanText } from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
import { pageExclusionReason } from "./workspace-review.ts";
import { Notice } from "../ui/primitives.tsx";

// Host read results are retained by the mounted workspace adapter, never persisted by this UI.
export type WorkspaceReviewState = { ledger: ReviewLedger; items: any[]; snapshot: any; document: any; documentRevision: string; contentRevision: string; evidence?: any };
type Selection = { kind: "group"; group: string; target: string } | { kind: "candidate"; id: number } | { kind: "check"; id: string };
export function WorkspaceReviewPanel({ state, disabled, onChange, onEvidence, onNavigate, loadMaterial, loadThumbnail, children }: {
  state?: WorkspaceReviewState; disabled: boolean; onChange(change: ReviewLedgerChange): Promise<void>;
  onEvidence(): Promise<void>; onNavigate(value: ReviewNavigation): void; loadMaterial(page:number):Promise<any>; loadThumbnail(page: number): Promise<string | undefined>; children: ReactNode;
}) {
  const [selection, setSelection] = useState<Selection>(), [reason, setReason] = useState(""), [pagesOpen, setPagesOpen] = useState(false);
  const [page, setPage] = useState(1), [excludedPages, setExcludedPages] = useState<number[]>([]);
  const ledger = state?.ledger;
  const group = selection?.kind === "group" ? ledger?.groups.find(g => g.id === selection.group) : undefined;
  const target = selection?.kind === "group" ? group?.targets.find(t => t.id === selection.target) : undefined;
  const candidate = selection?.kind === "candidate" ? state?.evidence?.candidates.find((c:any) => c.id === selection.id) : undefined;
  const check = selection?.kind === "check" ? ledger?.inventory?.requiredChecks.find(c => c.id === selection.id) : undefined;
  const human = { actor: "person", reason: reason.trim(), confirmed: true as const };
  const selectionEpoch=useRef(0),[localError,setLocalError]=useState("");
  const locate = async (locator:any, pageNo?:number) => {
    const token=++selectionEpoch.current;
    try {
      const material=await loadMaterial(pageNo ?? 1);
      if(token!==selectionEpoch.current)return;
      const item=material.items.find((item:any)=>item.self_ref===locator.self_ref);
      onNavigate({ path:item?.correspondence?.targets[0]?.path ?? locator.anchorPath, pageNo });
    } catch {setLocalError("자료를 새로고침한 뒤 계속하세요.");}
  };
  const select = (next:Selection, locator:any, pageNo?:number) => { setSelection(next); setReason(""); setLocalError(""); void locate(locator,pageNo); };
  const groupExclusionReason = group?.reasonCode === "page-exclusion" ? pageExclusionReason(state,group.targets.flatMap(t=>t.pages)) : undefined;
  const decide = (action:"approve"|"reject"|"undo") => group && target && !(action === "approve" && groupExclusionReason) && onChange({ kind:`groups-${action}`,groupId:group.id,targetIds:[target.id],remainderGroupId:crypto.randomUUID(),human,resolvesIssue:action === "approve" });
  const pageGroup = ledger?.groups.findLast(g => g.reasonCode === "page-exclusion" && g.targets.some(t => t.pages.includes(page)));
  const exclusionReason = pageExclusionReason(state,excludedPages);
  const exclude = async () => {
    if (!state || !excludedPages.length || exclusionReason) return;
    // A proposal addresses existing Host bindings; Core still owns deletion, rebinding and Undo.
    const bindings=new Map<string,number[][]>();
    try {
      for(const page of excludedPages){
        const material=await loadMaterial(page);
        if(material.insertions?.some((item:any)=>item.regions.some((region:any)=>excludedPages.includes(region.page)))){setLocalError("삽입 블록이 있어 이 쪽을 제외할 수 없습니다.");return;}
        for(const item of material.items)bindings.set(item.self_ref,item.correspondence?.targets.map((t:any)=>t.path) ?? []);
      }
    } catch {setLocalError("자료를 새로고침한 뒤 계속하세요.");return;}
    const seen = new Set<string>();let overlapping=false;
    const targets = [...state.items].sort((a,b)=>(bindings.get(b.self_ref)?.length ?? 0)-(bindings.get(a.self_ref)?.length ?? 0)).filter(item => item.pages.some((p:number) => excludedPages.includes(p)) && !item.excluded).flatMap(item => {
      const paths = bindings.get(item.self_ref) ?? [];
      if (!paths.length) return [];
      if(paths.some((path:number[])=>seen.has(JSON.stringify(path)))){if(!paths.every((path:number[])=>seen.has(JSON.stringify(path))))overlapping=true;return [];}
      paths.forEach((path:number[])=>seen.add(JSON.stringify(path)));
      const blocks = paths.map((path:number[])=>state.document.blocks.find((b:any)=>JSON.stringify(b.path)===JSON.stringify(path)));
      const before = {excluded:false,blocks:JSON.parse(JSON.stringify(blocks,(key,value)=>key === "path" ? undefined:value))};
      return [{id:crypto.randomUUID(),locator:{self_ref:item.self_ref},pages:item.pages,regions:[],before:[before],
        evidence:[{observation:human.reason,materialRef:`pages:${excludedPages.join(",")}`,materialHash:state.contentRevision,inspector:"human",scope:{pages:excludedPages,targets:[item.self_ref]}}],
        patch:{expectedBefore:[before],expectedContentRevision:state.documentRevision,operations:[{type:"exclude",self_ref:item.self_ref,excluded:true}],after:[{excluded:true,blocks:[]}],supported:true,deferredReason:null},
        inspection:"uncertain" as const,proposal:"proposed" as const,result:null,resolved:false,history:[]}];
    });
    if(overlapping){setLocalError("대응 블록이 겹쳐 묶음 제외할 수 없습니다.");return;}
    if (!targets.length) return;
    const id=crypto.randomUUID();
    await onChange({kind:"groups-propose",groups:[{id,reasonCode:"page-exclusion",reason:human.reason,provider:"human",providerVersion:"1",sourceRevision:state.contentRevision,contentRevision:state.documentRevision,createdAt:new Date().toISOString(),runId:id,representativeTargetId:targets[0].id,representativeReason:human.reason,splitFrom:null,targets}],supersedes:[]});
    setSelection({kind:"group",group:id,target:targets[0].id});setExcludedPages([]);
    // Explicit second action approves the complete page group shown in the page panel.
  };
  return <div className="workspace-review">
    <aside className="workspace-review-list" aria-label="문제 묶음·후보">
      <div className="review-toolbar"><strong>문제·후보</strong><Tooltip><TooltipTrigger render={<Button size="icon" variant="ghost" aria-label="원문 검사" disabled={disabled} onClick={()=>void onEvidence()} />}><ScanText /></TooltipTrigger><TooltipContent>원문 검사</TooltipContent></Tooltip></div>
      {!ledger?.groups.length && !state?.evidence?.candidates?.length && <Notice>등록된 문제가 없습니다.</Notice>}
      {state?.evidence && <small>{state.evidence.documentRevision !== state.documentRevision ? "이전 문서의 후보" : state.evidence.status === "unavailable-image-pdf" ? "텍스트 검사 불가" : `원문 후보 ${state.evidence.candidates.length}`}</small>}
      {state?.evidence?.candidates.map((c:any)=><Button key={c.id} size="sm" variant={selection?.kind === "candidate" && selection.id === c.id ? "secondary":"ghost"} title={c.priority === "numeric-unit" ? "숫자·단위 차이 우선":"원문 차이 보조 후보 · 미판정"} onClick={()=>{++selectionEpoch.current;setSelection({kind:"candidate",id:c.id});setReason("");onNavigate({path:c.unsupported.find((t:any)=>t.path)?.path,pageNo:c.page ?? undefined});}}>{c.priority === "numeric-unit" ? "숫자·단위":"원문 차이"} · {c.page ?? "—"}쪽</Button>)}
      {ledger?.groups.map(g=><details key={g.id} open><summary title={g.reason}>{({kind:"종류",text:"글자",cell:"표 칸","page-exclusion":"쪽 제외"} as Record<string,string>)[g.reasonCode] ?? "교정 제안"} · {g.targets.length}</summary>{g.targets.map(t=><Button key={t.id} size="sm" variant={target?.id === t.id ? "secondary":"ghost"} disabled={disabled} onClick={()=>select({kind:"group",group:g.id,target:t.id},t.locator,t.pages[0])}>{t.pages.join(",")}쪽 · {({proposed:"검토 대기",approved:"승인함",rejected:"거절함",superseded:"대체됨"})[t.proposal]}</Button>)}</details>)}
      <details open><summary>그림·표 필수 확인</summary>{ledger?.inventory?.requiredChecks.map((c,index)=>{
        const record=ledger.checks.findLast(r=>r.targetIds.includes(c.id)&&r.contentRevision===state?.contentRevision);
        return <Button key={c.id} size="sm" variant={check?.id===c.id?"secondary":"ghost"} disabled={disabled} onClick={()=>select({kind:"check",id:c.id},c.locator,c.pages[0])}>{c.kind === "table" ? "표":"그림"} {index+1} · {c.pages.length ? `${c.pages.join(",")}쪽` : "쪽 미지정"} · {record ? record.result === "no-issue" ? "확인함":"판단 불가":"미확인"}</Button>;
      })}</details>
      <details><summary>검사 기록</summary>{ledger?.inspections.map((record,index)=><p key={index} title={record.evidence}>{record.lens} · {record.scope.pages.join(",")}쪽 · {record.state}</p>)}</details>
    </aside>
    <main className="workspace-review-center">{localError && <Notice tone="warning">{localError}</Notice>}
      {(target || candidate || check) && <details className="workspace-review-proposal" open key={JSON.stringify(selection)}><summary>{target ? "검수 제안":check ? "사람 필수 확인":"원문 차이 후보"}</summary>
        {target && <>{groupExclusionReason && <Tooltip><TooltipTrigger render={<span tabIndex={0} />}>쪽 제외 불가</TooltipTrigger><TooltipContent>{groupExclusionReason}</TooltipContent></Tooltip>}<div className="review-before-after"><div><small>변경 전</small><p>{previewValue(target.patch.expectedBefore)}</p></div><div><small>제안</small><p>{previewValue(target.patch.after)}</p></div></div><details><summary>근거·기록</summary><p>{group?.reason}</p>{target.evidence.map((e,i)=><p key={i}>{e.observation}</p>)}{target.history.map(h=><p key={h.id}>{h.action} · {h.human?.reason}</p>)}{target.patch.deferredReason && <p>{target.patch.deferredReason}</p>}</details></>}
        {candidate && <div className="review-before-after"><p>원본: {candidate.missing.map((t:any)=>t.text).join(" ")}</p><p>문서: {candidate.unsupported.map((t:any)=>t.text).join(" ")}</p></div>}
        {(target || check) && <><Input aria-label="판단 사유" placeholder="판단 사유" value={reason} disabled={disabled} onChange={e=>setReason(e.target.value)} /><div className="review-toolbar">
          {target && <>{(["approve","reject","undo"] as const).map(action=><Button key={action} size="sm" variant={action === "approve" ? "default":"outline"} disabled={disabled || !reason.trim() || (action === "undo" ? target.proposal !== "approved" : target.proposal !== "proposed") || action === "approve" && (!target.patch.supported || !!groupExclusionReason)} onClick={()=>void decide(action)}>{({approve:"승인",reject:"거절",undo:"되돌리기"})[action]}</Button>)}</>}
          {check && (["no-issue","uncertain"] as const).map(result=><Button key={result} size="sm" variant="outline" disabled={disabled || !reason.trim()} onClick={()=>void onChange({kind:"required-checks",records:[{targetIds:[check.id],contentRevision:state!.contentRevision,result,method:"direct",human,runId:null,approvedRun:null,at:new Date().toISOString()}]})}>{result === "no-issue" ? "직접 확인 기록":"판단 불가 기록"}</Button>)}
        </div></>}
      </details>}
      {children}
    </main>
    <aside className="workspace-review-pages" data-open={pagesOpen} aria-label="쪽 선택·제외"><Button size="sm" variant="ghost" aria-label={pagesOpen ? "쪽 접기":"쪽 펼치기"} aria-expanded={pagesOpen} onClick={()=>setPagesOpen(!pagesOpen)}>{pagesOpen ? "쪽 접기":"쪽"}</Button>{pagesOpen && <>
      <div className="workspace-review-thumbnails">{ledger?.inventory?.pages.map(n=><div key={n}><Button size="sm" variant={page===n?"secondary":"ghost"} onClick={()=>{++selectionEpoch.current;setPage(n);onNavigate({pageNo:n});}}><Thumbnail page={n} load={loadThumbnail} />{n}쪽</Button><label><input type="checkbox" checked={excludedPages.includes(n)} disabled={disabled} onChange={e=>setExcludedPages(e.target.checked?[...excludedPages,n]:excludedPages.filter(p=>p!==n))} /> 제외 선택</label></div>)}</div>
      <details><summary>제외 범위</summary><p>선택한 쪽의 전체 대응 블록을 제외합니다. 다른 쪽과 공유한 블록도 포함되며 Undo로 복원합니다.</p></details>
      <Input aria-label="쪽 제외 사유" placeholder="제외 사유" value={reason} disabled={disabled} onChange={e=>setReason(e.target.value)} />
      <Tooltip><TooltipTrigger render={<span tabIndex={exclusionReason ? 0 : undefined} aria-label={exclusionReason ? "쪽 제외 불가" : undefined} />}><Button size="sm" variant="outline" disabled={disabled || !reason.trim() || !excludedPages.length || !!exclusionReason} onClick={()=>void exclude()}>제외 묶음 만들기</Button></TooltipTrigger><TooltipContent>{exclusionReason ?? "선택한 쪽의 대응 블록을 제외하는 제안을 만듭니다."}</TooltipContent></Tooltip>
      {pageGroup && <div className="review-toolbar">{(["approve","undo"] as const).map(action=><Button key={action} size="sm" variant="outline" disabled={disabled||!reason.trim()||action === "approve" && !!pageExclusionReason(state,pageGroup.targets.flatMap(t=>t.pages))||!pageGroup.targets.every(t=>t.proposal===(action==="approve"?"proposed":"approved"))} onClick={()=>void onChange({kind:`groups-${action}`,groupId:pageGroup.id,targetIds:pageGroup.targets.map(t=>t.id),human,resolvesIssue:action==="approve"})}>{action==="approve"?"쪽 묶음 승인":"쪽 묶음 되돌리기"}</Button>)}</div>}
    </>}</aside>
  </div>;
}
function Thumbnail({page,load}:{page:number;load(page:number):Promise<string|undefined>}) {
  const ref=useRef<HTMLSpanElement>(null),[image,setImage]=useState<string>();
  useEffect(()=>{let active=true;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();void load(page).then(value=>{if(active)setImage(value);}).catch(()=>{});} });if(ref.current)observer.observe(ref.current);return()=>{active=false;observer.disconnect();};},[page,load]);
  return <span ref={ref} className="workspace-review-thumbnail">{image&&<img src={image} alt={`원본 ${page}쪽 썸네일`} />}</span>;
}

function previewValue(value:unknown):string {
  if(Array.isArray(value))return value.map(previewValue).join(" · ");
  if(value && typeof value === "object") {
    const v=value as Record<string,unknown>;
    if(typeof v.excluded === "boolean")return v.excluded ? "블록 제외":"검수에 포함";
    if(typeof v.text === "string")return v.text;
    if(v.kind === "heading")return `제목 ${v.level ?? ""}`.trim();
    if(typeof v.kind === "string")return ({paragraph:"문단",heading:"제목"} as Record<string,string>)[v.kind] ?? v.kind;
    return "구조 변경";
  }
  return value == null ? "없음":String(value);
}
