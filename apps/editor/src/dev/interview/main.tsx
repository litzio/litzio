import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, Background, Controls, MarkerType, applyNodeChanges, type Node, type ReactFlowInstance } from '@xyflow/react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FileText, GitBranch, MessageSquare, Sparkles } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '../../index.css';
import './style.css';
const NativeReport = lazy(() => import('./NativeReport'));

function Work() {
  const [s, set] = useState<any>(); const [answers, setAnswers] = useState<Record<string,string>>({});
  const [message, setMessage] = useState(''); const [comment, setComment] = useState(''); const [selected, select] = useState('');
  const [pending, busy] = useState(false); const [error, fail] = useState(''); const [dark, theme] = useState(true);
  const [nodes, setNodes] = useState<Node[]>([]); const flow = useRef<ReactFlowInstance | null>(null);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => { fetch('/spike-api/state').then(async r => {const v = await r.json(); if (!r.ok) throw new Error(v.error); set(v); setAnswers(v.answers);}).catch(e => fail(e.message)); }, []);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => {
    if (!s?.graph) return;
    setNodes(s.graph.nodes.map((n: any, i: number) => ({ id: n.id, position: { x: (i % 3) * 280, y: Math.floor(i / 3) * 210 }, data: { label: <><span className="node-number">{String(i+1).padStart(2,'0')}</span><strong>{n.label}</strong><small>{n.detail}</small></> }, style: { width: 240, animationDelay: `${i * 100}ms` } })));
    const timer = setTimeout(() => flow.current?.fitView({ padding: .18, duration: reduced ? 0 : 850 }), 200);
    return () => clearTimeout(timer);
  }, [s?.graph]);
  async function act(path: string, value: any) {
    busy(true); fail('');
    try { const r = await fetch('/spike-api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: s.revision, ...value }) }); const next = await r.json(); if (!r.ok) throw new Error(next.error); set(next); if (path === 'revise') setComment(''); setMessage(''); }
    catch(e) { fail(String((e as Error).message)); }
    finally { busy(false); }
  }
  if (!s) return <p role={error ? 'alert' : 'status'}>{error || '작업을 열고 있습니다…'}</p>;
  const edges = (s.graph?.edges ?? []).map((e: any, i: number) => ({ ...e, id: `edge-${i}`, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed }, style: { animationDelay: `${350+i*120}ms` } }));
  return <div className="work">
    <header><div className="brand"><FileText size={21}/> Litzio <span>함께 만드는 보고서</span></div><Button variant="ghost" onClick={() => theme(!dark)}>{dark ? '밝게' : '어둡게'}</Button></header>
    <main>
      <div className="eyebrow">IDEA → STRUCTURE → DOCUMENT</div>
      <h1>{s.document ? '생각이 보고서가 되었습니다.' : s.graph ? s.graph.title : s.form ? s.form.title : '어떤 이야기를 정리할까요?'}</h1>
      <p className="intro">질문으로 생각을 모으고, 흐름을 함께 다듬은 뒤 한 편의 문서로 만듭니다.</p>
      <nav aria-label="보고서 진행"><span className={!s.graph ? 'current' : ''}>01 인터뷰</span><span className={s.graph && !s.document ? 'current' : ''}>02 흐름 다듬기</span><span className={s.document ? 'current' : ''}>03 보고서</span></nav>
      <div className="workspace">
        <section className="canvas" aria-label="보고서 작업 영역">
          {!s.form && <div className="welcome"><Sparkles size={42}/><h2>대화 한 줄에서 시작하세요</h2><p>목적에 맞는 질문을 비서가 준비합니다.</p></div>}
          {s.form && <details className={'interview ' + (s.graph ? 'folded' : '')} open={!s.graph}><summary><Sparkles size={16}/> 인터뷰 · {s.form.questions.length}개의 질문 <span>{s.graph ? '입력 내용 보기' : '생각을 들려주세요'}</span></summary><form onSubmit={e => {e.preventDefault(); void act('flow', { answers });}}><div className="fields">{s.form.questions.map((q: any, i: number) => <label key={q.id}><b>{String(i+1).padStart(2,'0')} / {q.label}</b><textarea aria-label={q.label} placeholder={q.hint} required value={answers[q.id] ?? ''} disabled={pending || !!s.graph} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })}/></label>)}</div>{!s.graph && <Button type="submit" disabled={pending}>입력 완료 · 흐름 만들기 <GitBranch size={16}/></Button>}</form></details>}
          {pending && <div className="waiting" role="status"><span className="pulse"/>비서가 {s.graph ? '의견을 반영' : s.form ? '흐름을 구성' : '질문을 준비'}하고 있습니다… <Button variant="ghost" onClick={() => void fetch('/spike-api/cancel',{method:'POST',body:'{}'})}>중단</Button></div>}
          {s.graph && !s.document && <div className="flow-stage" key={s.revision}><div className="flow-meta"><span><GitBranch size={16}/> 함께 다듬는 흐름</span><span>버전 {s.revision} · 노드를 선택해 의견을 남기세요</span></div><div className="flow"><ReactFlow nodes={nodes} edges={edges} colorMode={dark ? 'dark' : 'light'} onNodesChange={changes => setNodes(n => applyNodeChanges(changes,n))} onNodeClick={(_,n) => select(n.id)} onInit={v => {flow.current = v;}} fitView nodesConnectable={false} deleteKeyCode={null}><Background gap={22}/><Controls showInteractive={false}/></ReactFlow></div><div className="node-list" aria-label="의견을 남길 노드">{s.graph.nodes.map((n:any) => <Button key={n.id} variant={selected === n.id ? 'secondary' : 'ghost'} aria-pressed={selected === n.id} onClick={() => select(n.id)}>{n.label}</Button>)}</div></div>}
          {s.document && <article className="report"><div className="receipt"><FileText size={18}/> {s.document.name}<span>저장 · 재읽기 확인</span></div><Suspense fallback={<p role="status">문서를 열고 있습니다…</p>}><NativeReport source={s.document.source} name={s.document.name}/></Suspense></article>}
        </section>
        <aside aria-label="비서와 대화"><h2><MessageSquare size={17}/> 같은 작업, 이어지는 대화</h2><div className="messages">{s.history.length ? s.history.map((h: any,i:number) => <div key={i} className={'message '+h.role}><small>{h.role === 'user' ? '나' : '비서'}</small><p>{h.text}</p></div>) : <div className="message assistant"><small>비서</small><p>만들고 싶은 보고서의 주제를 알려주세요. 목적에 맞는 질문부터 함께 시작하겠습니다.</p></div>}</div>
        {error && <p className="error" role="alert">{error}</p>}
        {!s.document && <form className="composer" onSubmit={e => {e.preventDefault(); if (!s.form) void act('start', { message }); else if (!s.graph) { if (message.trim() === '입력 완료') void act('flow', { answers, message }); else fail('폼을 작성한 뒤 “입력 완료”라고 알려주세요.'); } else void act('revise', {nodeId: selected, message: comment});}}>
          {s.graph ? <><label>노드 의견 <Input readOnly aria-label="선택한 노드" value={s.graph.nodes.find((n:any) => n.id === selected)?.label ?? '위 흐름에서 노드를 선택하세요'}/></label><textarea aria-label="노드 의견" placeholder="이 단계에서 바꾸고 싶은 점은?" value={comment} onChange={e=>setComment(e.target.value)} disabled={pending}/></> : <textarea aria-label="비서에게 메시지" placeholder={s.form ? '입력 완료' : '예: 동네 도서 교환 행사 보고서 만들어 줘'} value={message} onChange={e=>setMessage(e.target.value)} disabled={pending}/>}
          <Button type="submit" disabled={pending || (s.graph ? !selected || !comment.trim() : !message.trim())}>{s.graph ? '의견 전달' : '보내기'}</Button>
        </form>}
        {s.graph && !s.document && <div className="approval"><p>입력 내용과 마지막 흐름을 확인했나요?</p><Button disabled={pending} onClick={() => void act('approve', { approved: true })}>이대로 승인하고 보고서 만들기</Button></div>}
        {s.comments.length > 0 && <details className="comments"><summary>노드별 의견 {s.comments.length}개</summary>{s.comments.map((c:any) => <p key={c.id}><b>{c.nodeId} · v{c.revision}</b><br/>{c.text}</p>)}</details>}
        </aside>
      </div>
    </main><footer>한빛 연구실 · 보고서 작업</footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Work/>);
