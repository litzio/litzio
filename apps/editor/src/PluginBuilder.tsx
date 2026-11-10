import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./components/ui/button.tsx";
import { Input } from "./components/ui/input.tsx";
import type { HostClient } from "./host-client.ts";
import { PLUGIN_BUILDER, type BuilderApproveResult, type BuilderDecision, type BuilderDecisionEdit, type BuilderPlan, type BuilderTurnRequest, type BuilderTurnResult, type BuilderWidget } from "../shared/plugin-builder.ts";
import "./plugin-builder.css";

/** "플러그인 만들기": the assistant interviews, the client renders only the closed widget set from shared/plugin-builder.ts. */
type Chat = { role: "user" | "assistant"; text: string; meta?: string };
const STATUS = { confirmed: "확정", open: "미정", proposed: "제안" } as const;
const EXAMPLES = ["리치오 저장소의 GitHub 이슈를 보는 플러그인을 만들고 싶어", "Confluence 플러그인을 만들고 싶어"];

export function PluginBuilder({ client, hostId, active }: { client: HostClient; hostId: string; active: boolean }) {
  const [reply, setReply] = useState<BuilderTurnResult>();
  const [chat, setChat] = useState<Chat[]>([]);
  const [draft, setDraft] = useState(EXAMPLES[0]!);
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [decisions, setDecisions] = useState<BuilderDecision[]>([]);
  const [pending, setPending] = useState<BuilderDecisionEdit[]>([]);
  const [busy, setBusy] = useState<"" | "turn" | "approve">("");
  const [problem, setProblem] = useState("");
  const [tab, setTab] = useState<"flow" | "spec" | "preview">("flow");
  const [result, setResult] = useState<BuilderApproveResult>();
  const [editing, setEditing] = useState<string>();
  const session = useRef<string | undefined>(undefined);
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "end" }); }, [chat, busy]);

  const post = async (body: unknown) => {
    const response = await client.request(PLUGIN_BUILDER.route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(300_000) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? "요청에 실패했어요.");
    return value;
  };
  const turn = async (request: BuilderTurnRequest, userText?: string) => {
    setBusy("turn"); setProblem("");
    if (userText) setChat(previous => [...previous, { role: "user", text: userText }]);
    try {
      const next: BuilderTurnResult = await post({ ...request, sessionId: session.current, edits: pending });
      session.current = next.sessionId; setPending([]);
      setReply(next); setDecisions(next.decisions); setEditing(undefined);
      setValues(Object.fromEntries(next.round.widgets.map(widget => [widget.id, widget.defaults])));
      setChat(previous => [...previous, { role: "assistant", text: next.message, meta: next.backend.mode === "codex" ? `Codex ${next.backend.model} · ${next.backend.effort} · ${(next.turnMs / 1000).toFixed(1)}초` : `대본 모드${next.backend.fallbackReason ? " (대체)" : ""}` }]);
    } catch (error) { setProblem((error as Error).message); }
    finally { setBusy(""); }
  };
  const start = () => { if (draft.trim()) void turn({ action: "turn", intent: "start", message: draft.trim() }, draft.trim()); };
  const summary = (widgets: BuilderWidget[]) => widgets.map(widget => { const v = values[widget.id] ?? []; return `${widget.label}: ${widget.options.length ? v.map(item => widget.options.find(o => o.value === item)?.label ?? item).join(", ") || "—" : widget.type === "toggle" ? (v[0] === "true" ? "켜짐" : "꺼짐") : v[0] || "—"}`; }).join(" · ");
  const submit = () => { if (reply) void turn({ action: "turn", intent: "answers", answers: values }, summary(reply.round.widgets)); };
  const saveEdit = (id: string, value: string, status: BuilderDecision["status"]) => {
    const edit = { id, value, status };
    setPending(previous => [...previous.filter(item => item.id !== id), edit]);
    setDecisions(previous => previous.map(item => item.id === id ? { ...item, value, status, userEdited: true } : item));
    setChat(previous => [...previous, { role: "user", text: `${id} 수정: ${value} (${STATUS[status]})`, meta: "다음 질문에 반영돼요" }]);
    setEditing(undefined);
  };
  const approve = async () => {
    setBusy("approve"); setProblem("");
    try {
      const outcome: BuilderApproveResult = await post({ action: "approve", sessionId: session.current });
      setResult(outcome); window.dispatchEvent(new Event("plugins-changed"));
      setChat(previous => [...previous, { role: "assistant", text: outcome.ok ? "플러그인을 만들고 설치·활성화했어요. 사용 방법을 확인해 보세요." : `설치를 끝내지 못했어요. ${outcome.limitation ?? "단계별 결과를 확인해 주세요."}`, meta: "승인 후 생성" }]);
    } catch (error) { setProblem((error as Error).message); }
    finally { setBusy(""); }
  };
  const openScreen = () => {
    if (!result?.pluginId || !reply) return;
    window.dispatchEvent(new CustomEvent("open-plugin-screen", { detail: { plugin: result.pluginId, id: "issues", title: reply.plan.spec.pluginName || "GitHub 이슈", icon: "Table", defaultViewIds: ["issues"], primary: true, hostId } }));
  };

  const phase = result ? "done" : !reply ? "start" : reply.phase;
  return <div className="pb" data-testid="plugin-builder" data-phase={phase} data-active={active ? "true" : "false"}>
    <header><h1>플러그인 만들기{reply?.plan.spec.pluginName ? ` · ${reply.plan.spec.pluginName}` : ""}</h1>
      {reply ? <span className="pb-backend" data-mode={reply.backend.mode} title={reply.backend.fallbackReason}>{reply.backend.mode === "codex" ? `Codex · ${reply.backend.model} · ${reply.backend.effort}` : reply.backend.fallbackReason ? "대본 모드 · Codex 대체" : "대본 모드"}</span> : null}</header>

    <section className="pb-card pb-chatcol" aria-label="비서"><h2>비서</h2>
      <div className="pb-scroll pb-chat" role="log" aria-live="polite">
        {chat.map((item, index) => <div key={index} className="pb-msg" data-role={item.role}>{item.text}{item.meta ? <small>{item.meta}</small> : null}</div>)}
        {busy === "turn" ? <div className="pb-busy">비서가 다음 질문을 만들고 있어요…</div> : null}
        <div ref={chatEnd} />
      </div>
    </section>

    <section className="pb-card" aria-label="진행 화면">
      {phase === "start" ? <div className="pb-start">
        <h2>무엇을 만들고 싶으세요?</h2>
        <p className="pb-intro">비서가 모호한 부분을 질문으로 되묻고, 정한 내용이 오른쪽 결정요소에 쌓여요. 승인하기 전에는 아무것도 만들지 않아요.</p>
        <textarea aria-label="만들고 싶은 플러그인" value={draft} onChange={event => setDraft(event.target.value)} />
        <div className="pb-chips">{EXAMPLES.map(example => <Button key={example} size="sm" variant="outline" onClick={() => setDraft(example)}>{example.length > 24 ? `${example.slice(0, 22)}…` : example}</Button>)}</div>
        <div className="pb-row"><Button onClick={start} disabled={!draft.trim() || !!busy}>인터뷰 시작</Button>{busy === "turn" ? <span className="pb-busy">비서가 질문을 만들고 있어요…</span> : null}</div>
      </div> : null}

      {phase === "interview" && reply ? <>
        <h2>{reply.round.title}<span className="pb-dots" aria-label={`${reply.round.step}/${reply.round.totalSteps} 단계`}>{Array.from({ length: reply.round.totalSteps }, (_, index) => <i key={index} data-on={index < reply.round.step ? "true" : "false"} />)}</span></h2>
        <div className="pb-scroll" key={`${reply.turn}`}>
          {reply.round.intro ? <p className="pb-intro">{reply.round.intro}</p> : null}
          {reply.round.widgets.map(widget => <WidgetView key={widget.id} widget={widget} value={values[widget.id] ?? []} onChange={value => setValues(previous => ({ ...previous, [widget.id]: value }))} />)}
          {reply.round.notice ? <div className="pb-notice" data-tone={/않|없|제약|한계/.test(reply.round.notice) ? "warning" : "info"}>{reply.round.notice}</div> : null}
        </div>
        <div className="pb-actions"><p>{pending.length ? `결정 ${pending.map(item => item.id).join(", ")} 수정이 다음 질문에 반영돼요.` : ""}</p><Button onClick={submit} disabled={!!busy}>{busy === "turn" ? "생각하는 중…" : "다음"}</Button></div>
      </> : null}

      {phase === "plan" && reply ? <PlanView plan={reply.plan} tab={tab} setTab={setTab} busy={busy === "approve"} onApprove={() => void approve()} onBack={() => void turn({ action: "turn", intent: "revise" }, "인터뷰로 돌아갈게요")} /> : null}

      {phase === "done" && result && reply ? <ResultView result={result} spec={reply.plan.spec} onOpen={openScreen} /> : null}
      {problem ? <div className="pb-notice" role="alert" data-tone="warning" style={{ margin: "var(--space-3) var(--space-5)" }}>{problem}</div> : null}
    </section>

    <section className="pb-card" aria-label="결정요소"><h2>결정요소<span className="pb-badge">{decisions.length}</span></h2>
      <div className="pb-scroll pb-decisions" data-testid="decision-panel">
        {!decisions.length ? <p className="pb-help">인터뷰에서 정해지는 내용이 여기에 쌓여요.</p> : null}
        {decisions.map(decision => <DecisionCard key={decision.id} decision={decision} editing={editing === decision.id} onEdit={() => setEditing(decision.id)} onCancel={() => setEditing(undefined)} onSave={saveEdit} disabled={!!busy || phase === "done"} />)}
      </div>
    </section>
  </div>;
}

function WidgetView({ widget, value, onChange }: { widget: BuilderWidget; value: string[]; onChange(value: string[]): void }) {
  const id = `pb-${widget.id}`;
  if (widget.type === "text") return <div className="pb-field"><label className="pb-label" htmlFor={id}>{widget.label}</label><Input id={id} value={value[0] ?? ""} placeholder={widget.placeholder} onChange={event => onChange([event.target.value])} />{widget.help ? <p className="pb-help">{widget.help}</p> : null}</div>;
  if (widget.type === "toggle") { const on = value[0] === "true"; return <div className="pb-toggle"><div><div className="pb-label" id={id}>{widget.label}</div>{widget.help ? <p className="pb-help">{widget.help}</p> : null}</div><button type="button" role="switch" aria-checked={on} aria-labelledby={id} className="pb-switch" onClick={() => onChange([on ? "false" : "true"])} /></div>; }
  const multi = widget.type === "multi";
  const chips = multi && widget.options.length > 4 || widget.options.every(option => !option.description) && widget.options.length > 3;
  return <fieldset className="pb-field"><legend>{widget.label}</legend>{widget.help ? <p className="pb-help">{widget.help}</p> : null}
    <div className="pb-options" data-layout={chips ? "chips" : "rows"} role={multi ? "group" : "radiogroup"} aria-label={widget.label}>
      {widget.options.map(option => { const checked = value.includes(option.value);
        return <button key={option.value} type="button" role={multi ? "checkbox" : "radio"} aria-checked={checked} className="pb-option"
          onClick={() => onChange(multi ? (checked ? value.filter(item => item !== option.value) : [...value, option.value]) : [option.value])}>
          <span className="pb-mark" aria-hidden="true" /><span><strong>{option.label}</strong>{option.description ? <span className="pb-desc">{option.description}</span> : null}</span></button>; })}
    </div></fieldset>;
}

function DecisionCard({ decision, editing, disabled, onEdit, onCancel, onSave }: { decision: BuilderDecision; editing: boolean; disabled: boolean; onEdit(): void; onCancel(): void; onSave(id: string, value: string, status: BuilderDecision["status"]): void }) {
  const [value, setValue] = useState(decision.value), [status, setStatus] = useState(decision.status);
  useEffect(() => { if (editing) { setValue(decision.value); setStatus(decision.status); } }, [editing]);
  return <article className="pb-decision" data-edited={decision.userEdited ? "true" : "false"} data-decision={decision.id}>
    <header><b>{decision.id}</b>{decision.title}<span className="pb-badge" data-status={decision.status}>{STATUS[decision.status]}</span></header>
    {editing ? <div className="pb-edit">
      <Input aria-label={`${decision.id} 값`} value={value} onChange={event => setValue(event.target.value)} />
      <select aria-label={`${decision.id} 상태`} value={status} onChange={event => setStatus(event.target.value as BuilderDecision["status"])}>{(Object.keys(STATUS) as (keyof typeof STATUS)[]).map(key => <option key={key} value={key}>{STATUS[key]}</option>)}</select>
      <div className="pb-row"><Button size="sm" onClick={() => value.trim() && onSave(decision.id, value.trim(), status)}>저장</Button><Button size="sm" variant="ghost" onClick={onCancel}>취소</Button></div>
    </div> : <>
      <p>{decision.value}</p>
      {decision.reason ? <p className="pb-why">{decision.reason}</p> : null}
      <div className="pb-row">{decision.userEdited ? <span className="pb-badge" data-edited="true">내가 수정</span> : null}<Button size="sm" variant="ghost" className="pb-linkbtn" disabled={disabled} onClick={onEdit} aria-label={`${decision.id} 수정`}>수정</Button></div>
    </>}
  </article>;
}

const NODE = { w: 144, h: 56, gx: 44, gy: 22, gv: 40 };
function layout(plan: BuilderPlan) {
  const incoming = new Map<string, number>(plan.nodes.map(node => [node.id, 0]));
  plan.edges.forEach(edge => incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1));
  const level = new Map<string, number>();
  const visit = (id: string, depth: number) => { if ((level.get(id) ?? -1) >= depth || depth > plan.nodes.length) return; level.set(id, depth); plan.edges.filter(edge => edge.from === id).forEach(edge => visit(edge.to, depth + 1)); };
  plan.nodes.filter(node => !incoming.get(node.id)).forEach(node => visit(node.id, 0));
  plan.nodes.forEach(node => { if (!level.has(node.id)) level.set(node.id, 0); });
  const rows = new Map<number, string[]>();
  plan.nodes.forEach(node => { const depth = level.get(node.id)!; rows.set(depth, [...(rows.get(depth) ?? []), node.id]); });
  const depth = Math.max(...rows.keys()) + 1, span = Math.max(...[...rows.values()].map(ids => ids.length));
  // A long chain would shrink to unreadable text; stack it top-down instead.
  const vertical = depth > 4;
  const pos = new Map<string, { x: number; y: number }>();
  for (const [d, ids] of rows) ids.forEach((id, index) => pos.set(id, vertical ? { x: 24 + index * (NODE.w + NODE.gx), y: 24 + d * (NODE.h + NODE.gv) } : { x: 24 + d * (NODE.w + NODE.gx), y: 24 + index * (NODE.h + NODE.gy) }));
  const columns = vertical ? span : depth, lines = vertical ? depth : span;
  return { pos, vertical, width: 48 + columns * (NODE.w + NODE.gx) - NODE.gx, height: vertical ? 48 + lines * (NODE.h + NODE.gv) - NODE.gv : 48 + lines * (NODE.h + NODE.gy) - NODE.gy };
}

function PlanView({ plan, tab, setTab, busy, onApprove, onBack }: { plan: BuilderPlan; tab: "flow" | "spec" | "preview"; setTab(tab: "flow" | "spec" | "preview"): void; busy: boolean; onApprove(): void; onBack(): void }) {
  const { pos, vertical, width, height } = useMemo(() => layout(plan), [plan]);
  const spec = plan.spec;
  const tabs = [["flow", "흐름도"], ["spec", "생성 사양"], ["preview", "화면 미리보기"]] as const;
  return <>
    <h2>개발 계획</h2>
    <div className="pb-tabs" role="tablist">{tabs.map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className="pb-tab" onClick={() => setTab(key)}>{label}</button>)}</div>
    <div className="pb-scroll">
      <p className="pb-intro">{plan.summary}</p>
      {tab === "flow" ? <div className="pb-flow" data-testid="plan-flow"><svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width }} role="img" aria-label="플러그인 동작 흐름">
        <defs><marker id="pb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--id-color-text-muted)" /></marker></defs>
        {plan.edges.map((edge, index) => { const a = pos.get(edge.from)!, b = pos.get(edge.to)!;
          const down = vertical ? b.y > a.y : b.x > a.x;
          const x1 = vertical ? (down ? a.x + NODE.w / 2 : a.x + NODE.w / 2) : down ? a.x + NODE.w : a.x + NODE.w / 2, y1 = vertical ? (down ? a.y + NODE.h : a.y) : down ? a.y + NODE.h / 2 : (b.y > a.y ? a.y + NODE.h : a.y);
          const x2 = vertical ? b.x + NODE.w / 2 : down ? b.x : b.x + NODE.w / 2, y2 = vertical ? (down ? b.y : b.y + NODE.h) : down ? b.y + NODE.h / 2 : (b.y > a.y ? b.y : b.y + NODE.h);
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          const d = !down ? `M${x1},${y1} L${x2},${y2}` : vertical ? `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}` : `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
          return <g key={index}><path className="pb-edge" markerEnd="url(#pb-arrow)" d={d} />{edge.label ? <text className="pb-edge-label" x={vertical ? mx + 6 : mx} y={vertical ? my : my - 5} textAnchor={vertical ? "start" : "middle"}>{edge.label}</text> : null}</g>; })}
        {plan.nodes.map(node => { const p = pos.get(node.id)!; return <g key={node.id} className="pb-node" data-kind={node.kind} transform={`translate(${p.x},${p.y})`}>
          <rect width={NODE.w} height={NODE.h} rx="10" /><text x={NODE.w / 2} y={node.detail ? 24 : 34} textAnchor="middle">{node.label}</text>{node.detail ? <text className="pb-sub" x={NODE.w / 2} y={42} textAnchor="middle">{node.detail.length > 22 ? `${node.detail.slice(0, 21)}…` : node.detail}</text> : null}</g>; })}
      </svg></div> : null}
      {tab === "spec" ? <dl className="pb-spec" data-testid="plan-spec">
        <dt>템플릿</dt><dd>{spec.template}</dd><dt>저장소</dt><dd>{spec.repo || "—"}</dd><dt>인증</dt><dd>{spec.auth === "none" ? "없음 (공개 API · 읽기 전용)" : "토큰(PAT) — 이 Host에서는 생성 불가"}</dd>
        <dt>기본 상태</dt><dd>{spec.state}</dd><dt>라벨 · 담당자</dt><dd>{spec.labels || "라벨 없음"} · {spec.assignee || "담당자 없음"}</dd><dt>열</dt><dd>{spec.columns.join(", ")}</dd><dt>개수</dt><dd>{spec.pageSize}</dd>
        {spec.openQuestions.length ? <><dt>미해결</dt><dd>{spec.openQuestions.join(" / ")}</dd></> : null}</dl> : null}
      {tab === "preview" ? <div className="pb-flow" style={{ background: "var(--id-color-surface)" }}><table className="pb-table" data-testid="plan-preview"><thead><tr>{spec.columns.map(column => <th key={column}>{COLUMN_LABEL[column] ?? column}</th>)}</tr></thead>
        <tbody>{[0, 1, 2].map(row => <tr key={row}>{spec.columns.map(column => <td className="pb-skel" key={column}>{column === "number" ? "#…" : "▬▬▬"}</td>)}</tr>)}</tbody></table><p className="pb-help" style={{ padding: "var(--space-3)" }}>열 구성 미리보기예요. 실제 값은 설치 후 {spec.repo || "저장소"}에서 읽어 와요.</p></div> : null}
    </div>
    <div className="pb-actions"><p>승인하면 플러그인을 만들고 설치·활성화해요.</p><Button variant="outline" onClick={onBack} disabled={busy}>인터뷰로 돌아가기</Button><Button onClick={onApprove} disabled={busy}>{busy ? "만드는 중…" : "승인하고 만들기"}</Button></div>
  </>;
}
const COLUMN_LABEL: Record<string, string> = { number: "번호", title: "제목", state: "상태", author: "작성자", labels: "라벨", assignee: "담당자", comments: "댓글", updated: "수정일", created: "생성일" };

function ResultView({ result, spec, onOpen }: { result: BuilderApproveResult; spec: BuilderPlan["spec"]; onOpen(): void }) {
  const columns = spec.columns.filter(column => result.sample?.rows[0]?.[column] !== undefined);
  return <>
    <h2>{result.ok ? "플러그인을 만들었어요" : "설치를 끝내지 못했어요"}</h2>
    <div className="pb-scroll" data-testid="builder-result">
      <ol className="pb-steps">{result.steps.map(step => <li key={step.id} data-ok={step.ok}><span>{step.label}{step.detail ? <><br /><small>{step.detail}</small></> : null}</span></li>)}</ol>
      {result.limitation ? <div className="pb-notice" data-tone="warning">{result.limitation}</div> : null}
      {result.sample ? <><div className="pb-label">실제 조회 결과 · {spec.repo} ({result.sample.rows.length}건{result.sample.truncated ? "+ · 첫 페이지" : ""})</div>
        <div className="pb-flow" style={{ background: "var(--id-color-surface)" }}><table className="pb-table"><thead><tr>{columns.map(column => <th key={column}>{COLUMN_LABEL[column]}</th>)}</tr></thead>
          <tbody>{result.sample.rows.map((row, index) => <tr key={index}>{columns.map(column => <td key={column} className={(row[column] ?? "").length <= 12 ? "pb-short" : undefined}>{row[column]}</td>)}</tr>)}</tbody></table></div></> : null}
      {result.howTo.length ? <><div className="pb-label">간단 사용 방법</div><ol className="pb-howto" data-testid="how-to">{result.howTo.map(line => <li key={line}>{line}</li>)}</ol></> : null}
    </div>
    <div className="pb-actions"><p>{result.pluginId ?? ""}</p>{result.ok ? <Button onClick={onOpen}>플러그인 화면 열기</Button> : null}</div>
  </>;
}
