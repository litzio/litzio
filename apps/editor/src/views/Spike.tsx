import { useEffect, useState } from "react";
import { validateView, type View, type ViewRow } from "@litzio/core";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { ViewRenderer } from "./Renderer.tsx";
import { createHostClient } from "../host-client.ts";
import "./spike.css";
const localSpike = createHostClient(window.location.origin);
async function invoke(input: unknown) {
  const response = await localSpike.request("/api/view-spike", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
export function Spike() {
  const [root, setRoot] = useState(""), [file, setFile] = useState(""), [model, setModel] = useState("gpt-6-luna"), [request, setRequest] = useState("1");
  const [view, setView] = useState<View | null>(null), [rows, setRows] = useState<ViewRow[]>([]), [saved, setSaved] = useState<View | null>(null), [savedRows, setSavedRows] = useState<ViewRow[]>([]);
  const [revision, setRevision] = useState<string | null>(null), [status, setStatus] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [settings, setSettings] = useState(false);
  useEffect(() => { invoke({ action: "catalog" }).then(c => { setRoot(c.root); setFile(c.root + "/report.view.json"); }).catch(e => setStatus(String(e))); }, []);
  const task = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { setStatus(String(e)); } finally { setBusy(false); } };
  const settingsView = { kind: "litzio-view", schemaVersion: 0, catalog: "litzio-spike-v0", title: "정보·업데이트 (fixture)", refresh: "manual", sources: { stats: { operation: "app.about-fixture", version: 1, args: {} } }, layout: { component: "VerticalPanel", children: [{ component: "Table", title: "정보 표시 시험", source: "stats", data: "/rows", columns: ["setting", "value"] }] } };
  const [settingsRows, setSettingsRows] = useState<ViewRow[]>([]);
  return <main className="view-spike"><header><div><small>LITZIO · DYNAMIC UI SPIKE · v0</small><h1>같은 명세, 같은 화면</h1></div><Button variant="secondary" onClick={() => void task(async () => { setSettingsRows((await invoke({ action: "run", view: settingsView })).rows); setSettings(true); })}>설정 카테고리 시험</Button></header>
    <p>열린 폴더: {root} · 로컬 전용 · 수동 조회</p><div className="view-workspace"><aside aria-label="비서 패널"><h2>비서</h2><p>실제 Codex 호출 · low · 카탈로그와 폴더 별칭만 노출</p>
      <label>모델<select value={model} onChange={e => setModel(e.target.value)}><option>gpt-6-luna</option><option>gpt-6.1-sol</option></select></label>
      <label>동일 요청 세트<select value={request} onChange={e => setRequest(e.target.value)}><option value="0">문서 수 표</option><option value="1">문서 수 표와 막대</option><option value="2">beta 제목 수 · 내림차순</option><option value="3">미지원 authorEmail</option></select></label>
      <Button disabled={busy} onClick={() => void task(async () => { const p = await invoke({ action: "proposal", model, request }); setMessage(p.request); if (p.error) throw new Error(p.error); if (!p.proposal.view) { setView(null); setStatus(p.proposal.unsupported); return; } const v = validateView(p.proposal.view); await invoke({ action: "validate", view: v }); setView(v); setRows((await invoke({ action: "run", view: v })).rows); setStatus(`${model} / low · 검증 통과`); })}>{busy ? "처리 중…" : "생성"}</Button>
      <p className="view-request">{message}</p>{view && <ViewRenderer spec={view} data={rows} />}
    </aside><article aria-label="저장된 뷰"><h2>저장된 뷰</h2><label>저장·열기 경로<Input value={file} onChange={e => { setFile(e.target.value); setRevision(null); }} /></label><div className="view-actions">
      <Button disabled={!view || busy} onClick={() => void task(async () => { const result = await invoke({ action: "save", view, path: file, expectedRevision: revision }); setRevision(result.revision); setStatus("저장 완료 · " + result.revision); })}>저장</Button>
      <Button variant="secondary" disabled={busy} onClick={() => void task(async () => { const result = await invoke({ action: "open", path: file }); setSaved(result.view); setRevision(result.revision); setSavedRows([]); setStatus("다시 열기 완료 · LLM 호출 없음 · 수동 새로고침 대기"); })}>다시 열기</Button>
      <Button variant="secondary" disabled={!saved || busy} onClick={() => void task(async () => { const result = await invoke({ action: "run", view: saved }); setSavedRows(result.rows); setStatus("수동 새로고침 완료 · " + result.receipt.operation); })}>새로고침</Button></div>
      {saved ? <ViewRenderer spec={saved} data={savedRows} /> : <p>명세만 저장합니다. 다시 열고 새로고침하면 현재 데이터를 읽습니다.</p>}
      {settings && <section aria-label="설정 비교"><ViewRenderer spec={settingsView} data={settingsRows} /><p>기존 화면 기준: Version · 로그 폴더 열기 · CLI 설치 · Release channel · 업데이트 상태와 실행</p><p>판정: 읽기 정보만 표현 가능. 카테고리 전체 이전 불가. 선택·버튼·진행률·오류·Desktop 실행은 현재 카탈로그에 없습니다. 실제 설정 화면은 변경하지 않았습니다.</p></section>}
    </article></div><p role="status">{status}</p></main>;
}
