import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ReviewLedger, ReviewLedgerChange } from "@litzio/plugin-sdk";
import type { ReviewAdapter, ReviewNavigation } from "./ReviewRenderer.tsx";
import { ChevronRight, FileText, Image, Table2, PanelRightOpen, PanelRightClose, ScanText } from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { Checkbox } from "../components/ui/checkbox.tsx";
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
  const [page, setPage] = useState(1), [excludedPages, setExcludedPages] = useState<number[]>([]), [exclusionNote,setExclusionNote]=useState("");
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
  const decide = (action:"approve"|"reject"|"undo") => group && target && !(action === "approve" && groupExclusionReason) && onChange({ kind:`groups-${action}`,groupId:group.id,targetIds:group.reasonCode === "page-exclusion" ? group.targets.map(t=>t.id) : [target.id],remainderGroupId:crypto.randomUUID(),human,resolvesIssue:action === "approve" });
  const groupsByKind=new Map<string,NonNullable<typeof ledger>["groups"]>();
  for(const group of ledger?.groups ?? []) {
    const label=groupLabel(group);
    groupsByKind.set(label,[...(groupsByKind.get(label) ?? []),group]);
  }
  const decisionActions = target?.proposal === "approved" ? ["undo"] as const : target?.proposal === "proposed" ? ["approve","reject"] as const : [];
  const proposalReason=exclusionNote.trim() || `${excludedPages.join(", ")}쪽 블록 제외`;
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
        evidence:[{observation:proposalReason,materialRef:`pages:${excludedPages.join(",")}`,materialHash:state.contentRevision,inspector:"human",scope:{pages:excludedPages,targets:[item.self_ref]}}],
        patch:{expectedBefore:[before],expectedContentRevision:state.documentRevision,operations:[{type:"exclude",self_ref:item.self_ref,excluded:true}],after:[{excluded:true,blocks:[]}],supported:true,deferredReason:null},
        inspection:"uncertain" as const,proposal:"proposed" as const,result:null,resolved:false,history:[]}];
    });
    if(overlapping){setLocalError("대응 블록이 겹쳐 묶음 제외할 수 없습니다.");return;}
    if (!targets.length) return;
    const id=crypto.randomUUID();
    await onChange({kind:"groups-propose",groups:[{id,reasonCode:"page-exclusion",reason:proposalReason,provider:"human",providerVersion:"1",sourceRevision:state.contentRevision,contentRevision:state.documentRevision,createdAt:new Date().toISOString(),runId:id,representativeTargetId:targets[0].id,representativeReason:proposalReason,splitFrom:null,targets}],supersedes:[]});
    setSelection({kind:"group",group:id,target:targets[0].id});setExcludedPages([]);setReason("");setExclusionNote("");
    // The selected page group uses the same central human decision controls.
  };
  const row=(key:string,label:string,active:boolean,icon:ReactNode,onClick:()=>void)=>
    <Button key={key} variant="ghost" size="sm" className="sidebar-tree-item workspace-review-row" title={label} aria-current={active ? "page":undefined} disabled={disabled} onClick={onClick}>{icon}<span className="sidebar-tree-name">{label}</span></Button>;
  return <div className="workspace-review">
    <aside className="workspace-review-list" aria-label="문제 묶음·후보">
      <header className="workspace-review-heading"><strong>문제·후보</strong><Tooltip><TooltipTrigger render={<Button size="icon-xs" variant="ghost" aria-label="원문 검사" disabled={disabled} onClick={()=>void onEvidence()} />}><ScanText /></TooltipTrigger><TooltipContent>원문 검사</TooltipContent></Tooltip></header>
      {!ledger?.groups.length && !state?.evidence?.candidates?.length && <Notice>등록된 문제가 없습니다.</Notice>}
      {state?.evidence && <small>{state.evidence.documentRevision !== state.documentRevision ? "이전 문서의 후보" : state.evidence.status === "unavailable-image-pdf" ? "텍스트 검사 불가" : `원문 후보 ${state.evidence.candidates.length}`}</small>}
      {state?.evidence?.candidates.map((c:any)=>row(`candidate-${c.id}`,`${c.priority === "numeric-unit" ? "숫자·단위":"원문 차이"} · ${c.page ?? "—"}쪽`,selection?.kind === "candidate" && selection.id === c.id,<ScanText aria-hidden="true" />,()=>{++selectionEpoch.current;setSelection({kind:"candidate",id:c.id});setReason("");onNavigate({path:c.unsupported.find((t:any)=>t.path)?.path,pageNo:c.page ?? undefined});}))}
      {[...groupsByKind].map(([label,groups])=><ReviewDisclosure key={label} title={label} count={groups.reduce((n,g)=>n+(g.reasonCode === "page-exclusion" ? 1:g.targets.length),0)} open>{groups.flatMap(g=>(g.reasonCode === "page-exclusion" ? g.targets.slice(0,1):g.targets).map(t=>row(`${g.id}-${t.id}`,`${g.reasonCode === "page-exclusion" ? [...new Set(g.targets.flatMap(t=>t.pages))].join(",") : t.pages.join(",")}쪽 · ${proposalState(t.proposal)}`,selection?.kind === "group" && selection.group === g.id && selection.target === t.id,<FileText aria-hidden="true" />,()=>select({kind:"group",group:g.id,target:t.id},t.locator,t.pages[0]))))}</ReviewDisclosure>)}
      <ReviewDisclosure title="그림·표 필수 확인" open>{ledger?.inventory?.requiredChecks.map((c,index)=>{
        const record=ledger.checks.findLast(r=>r.targetIds.includes(c.id)&&r.contentRevision===state?.contentRevision);
        return row(c.id,`${c.kind === "table" ? "표":"그림"} ${index+1} · ${c.pages.length ? `${c.pages.join(",")}쪽` : "쪽 미지정"} · ${record ? record.result === "no-issue" ? "확인함":"판단 불가":"미확인"}`,check?.id===c.id,c.kind === "table" ? <Table2 aria-hidden="true" />:<Image aria-hidden="true" />,()=>select({kind:"check",id:c.id},c.locator,c.pages[0]));
      })}</ReviewDisclosure>
      <ReviewDisclosure title="검사 기록">{ledger?.inspections.map((record,index)=><p key={index} title={record.evidence}>{record.lens} · {record.scope.pages.join(",")}쪽 · {record.state}</p>)}</ReviewDisclosure>
    </aside>
    <main className="workspace-review-center">{localError && <Notice tone="warning">{localError}</Notice>}
      <ReviewDisclosure className="workspace-review-proposal" title={check ? "사람 필수 확인":candidate ? "원문 차이 후보":target?.result === "applied" ? "적용된 교정":"검수 제안"} open key={JSON.stringify(selection)}>
        {(target || candidate || check) && <div className="workspace-review-proposal-body">
        {target && <>{groupExclusionReason && <Tooltip><TooltipTrigger render={<span tabIndex={0} />}>쪽 제외 불가</TooltipTrigger><TooltipContent>{groupExclusionReason}</TooltipContent></Tooltip>}<div className="review-before-after"><div><small>변경 전</small><p>{group?.reasonCode === "page-exclusion" ? `${group.targets.length}개 블록 포함`:previewValue(target.patch.expectedBefore)}</p></div><div><small>{target.result === "applied" ? "적용 후":"제안"}</small><p>{group?.reasonCode === "page-exclusion" ? `${group.targets.length}개 블록 제외`:previewValue(target.patch.after)}</p></div></div><ReviewDisclosure title="근거·기록"><p>{group?.reason}</p>{target.evidence.map((e,i)=><p key={i}>{e.observation}</p>)}{target.history.map(h=><p key={h.id}>{h.assistant ? "비서":"사람"} · {h.action} · {h.human?.reason ?? h.assistant?.reason}</p>)}{target.patch.deferredReason && <p>{target.patch.deferredReason}</p>}</ReviewDisclosure></>}
        {candidate && <div className="review-before-after"><p>원본: {candidate.missing.map((t:any)=>t.text).join(" ")}</p><p>문서: {candidate.unsupported.map((t:any)=>t.text).join(" ")}</p></div>}
        {(!!decisionActions.length || check) && <div className="workspace-review-decisions">
          <Input aria-label="판단 사유" placeholder="판단 사유" value={reason} disabled={disabled} onChange={e=>setReason(e.target.value)} />
          {decisionActions.map(action=>{const unavailable=disabled || !reason.trim() || action === "approve" && (!target!.patch.supported || !!groupExclusionReason);return <Button key={action} size="sm" variant={action === "approve" && !unavailable ? "default":"outline"} disabled={unavailable} onClick={()=>void decide(action)}>{({approve:"승인",reject:"거절",undo:"되돌리기"})[action]}</Button>;})}
          {check && (["no-issue","uncertain"] as const).map(result=><Button key={result} size="sm" variant="outline" disabled={disabled || !reason.trim()} onClick={()=>void onChange({kind:"required-checks",records:[{targetIds:[check.id],contentRevision:state!.contentRevision,result,method:"direct",human,runId:null,approvedRun:null,at:new Date().toISOString()}]})}>{result === "no-issue" ? "직접 확인 기록":"판단 불가 기록"}</Button>)}
        </div>}
        </div>}
      </ReviewDisclosure>
      {children}
    </main>
    <aside className="workspace-review-pages" data-open={pagesOpen} aria-label="쪽 선택·제외">
      <header className="workspace-review-heading">{pagesOpen && <strong>쪽</strong>}<Tooltip><TooltipTrigger render={<Button size="icon-xs" variant="ghost" aria-label={pagesOpen ? "쪽 접기":"쪽 펼치기"} aria-expanded={pagesOpen} onClick={()=>setPagesOpen(!pagesOpen)} />}>{pagesOpen ? <PanelRightClose />:<PanelRightOpen />}</TooltipTrigger><TooltipContent>{pagesOpen ? "쪽 접기":"쪽 펼치기"}</TooltipContent></Tooltip></header>
      {pagesOpen && <><div className="workspace-review-thumbnails">{ledger?.inventory?.pages.map(n=><div key={n}><Button variant="ghost" size="sm" className="workspace-review-page-button" aria-label={`${n}쪽 보기`} aria-pressed={page===n} onClick={()=>{++selectionEpoch.current;setPage(n);onNavigate({pageNo:n});}}><Thumbnail page={n} load={loadThumbnail} /></Button><label><Checkbox aria-label={`${n}쪽 제외 선택`} checked={excludedPages.includes(n)} disabled={disabled} onCheckedChange={checked=>setExcludedPages(checked?[...excludedPages,n]:excludedPages.filter(p=>p!==n))} />{n}쪽 제외</label></div>)}</div>
      {!!excludedPages.length && <div className="workspace-review-exclude"><ReviewDisclosure title="사유"><Input aria-label="쪽 제외 사유" placeholder="선택 입력" value={exclusionNote} disabled={disabled} onChange={e=>setExclusionNote(e.target.value)} /></ReviewDisclosure><Tooltip><TooltipTrigger render={<span tabIndex={exclusionReason ? 0 : undefined} aria-label={exclusionReason ? "쪽 제외 불가" : undefined} />}><Button size="sm" variant="outline" disabled={disabled || !!exclusionReason} onClick={()=>void exclude()}>제외 묶음 만들기</Button></TooltipTrigger><TooltipContent>{exclusionReason ?? "선택한 쪽의 대응 블록을 제외하는 제안을 만듭니다."}</TooltipContent></Tooltip></div>}
      <ReviewDisclosure title="제외 범위"><p>선택한 쪽의 전체 대응 블록을 제외합니다. 다른 쪽과 공유한 블록도 포함되며 Undo로 복원합니다.</p></ReviewDisclosure>
    </>}</aside>
  </div>;
}
function ReviewDisclosure({title,count,open,className="",children}:{title:string;count?:number;open?:boolean;className?:string;children?:ReactNode}) {
  return <details className={`workspace-review-disclosure ${className}`} open={open}><summary className="workspace-review-heading"><ChevronRight className="workspace-review-chevron" aria-hidden="true" /><span>{title}</span>{count!==undefined && <small>{count}</small>}</summary>{children}</details>;
}
function proposalState(value:string){return ({proposed:"검토 대기",approved:"적용됨",rejected:"거절함",superseded:"대체됨"} as Record<string,string>)[value] ?? value;}
function groupLabel(group:ReviewLedger["groups"][number]) {
  if(group.reasonCode === "kind")return `${previewValue(group.targets[0]?.patch.expectedBefore)} → ${previewValue(group.targets[0]?.patch.after)}`;
  return ({text:"글자 교정",cell:"표 칸 교정","page-exclusion":"쪽 제외"} as Record<string,string>)[group.reasonCode] ?? group.reason;
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
