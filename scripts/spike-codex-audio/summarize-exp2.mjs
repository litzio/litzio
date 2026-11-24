// Spike experiment 2: reads <root>/runs/*/result.json and prints the raw per-run table, the summary table and the
// pre-registered verdict inputs as Markdown. Failure kinds are a first guess; overrides.json (run -> {turn1, turn2})
// in <root> replaces them after reading the conversation by hand.
// Usage: node summarize-exp2.mjs <root>
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = process.argv[2];
const overrides = existsSync(path.join(root, "overrides.json")) ? JSON.parse(readFileSync(path.join(root, "overrides.json"), "utf8")) : {};
const runs = readdirSync(path.join(root, "runs")).sort().flatMap(name => {
  const file = path.join(root, "runs", name, "result.json");
  return existsSync(file) ? [{ name, ...JSON.parse(readFileSync(file, "utf8")) }] : [];
});
function guess(run, t) {
  if (!t) return run.error ? "그 밖(실행 오류)" : "실행 안 됨";
  if (t.ok) return "";
  if (t.stop === "timeout") return "시간 초과";
  if (t.stop === "question-pending") return "질문에서 멈춤";
  if (run.task === "plugin" && t.judgement?.plugins?.some(p => p.id !== "local.counter")) return "다른 ID로 설치";
  if (/[?？]|알려 ?주(시면|세요)/.test(t.lastAnswer ?? "") && !t.judgement?.changed) return "질문에서 멈춤";
  if (t.hostToolFailed >= 2) return "도구 인자 형식 오류의 반복";
  return "그 밖";
}
const median = xs => { const s = xs.filter(x => x !== undefined).sort((a, b) => a - b); if (!s.length) return undefined; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fmt = n => n === undefined ? "-" : Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const row = (run, t, i) => {
  const kind = overrides[run.name]?.[`turn${i}`] ?? guess(run, t);
  return { run: `${run.task}-${run.engine}-${run.name.split("-").at(-1)}`, turn: i, ok: !!t?.ok, kind, stop: t?.stop, seconds: t?.seconds, calls: t?.modelRequests,
    toolCalls: t?.modelToolCalls, hostItems: t?.hostToolItems, hostFailed: t?.hostToolFailed, input: t?.inputTokens, output: t?.outputTokens,
    first: t?.firstInput, last: t?.lastInput, missing: t?.missingUsage, reasoningReq: `${t?.requestsWithReasoning ?? 0}/${t?.modelRequests ?? 0}`,
    toolSearch: t?.toolSearchCalls, toolsAdded: t ? (t.toolsMax ?? 0) - (t.toolsFirst ?? 0) : undefined, names: (t?.modelToolCallNames ?? []).join(" ") };
};
const rows = runs.flatMap(run => [1, 2].map(i => row(run, run.turns?.[i - 1], i)));
console.log("| 실행 | 턴 | 성공 | 실패 종류 | 끝난 상태 | 시간(초) | 모델 호출 | 도구 호출(모델) | 도구 항목/실패(Host 기록) | 누적 입력 | 누적 출력 | 첫 요청 입력 | 마지막 요청 입력 | 생각 출력 요청 | tool_search / 붙은 도구 | 부른 도구 |");
console.log("| --- | ---: | --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- | --- | --- |");
for (const r of rows) console.log(`| ${r.run} | ${r.turn} | ${r.ok ? "O" : "X"} | ${r.kind || "-"} | ${r.stop ?? "-"} | ${fmt(r.seconds)} | ${fmt(r.calls)} | ${fmt(r.toolCalls)} | ${fmt(r.hostItems)}/${fmt(r.hostFailed)} | ${fmt(r.input)}${r.missing ? `(+${r.missing} 미보고)` : ""} | ${fmt(r.output)} | ${fmt(r.first)} | ${fmt(r.last)} | ${r.reasoningReq} | ${r.toolSearch ?? "-"} / ${r.toolsAdded ?? "-"} | ${r.names.slice(0, 160)} |`);
console.log("\n| 엔진 | 과제 | 턴 | 성공 | 누적 입력 중앙값(성공) | 누적 입력 중앙값(전체) | 모델 호출 중앙값 | 시간 중앙값(초) | 첫→마지막 요청 입력 중앙값 |");
console.log("| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");
const verdict = {};
for (const task of ["edit", "plugin"]) for (const turn of [1, 2]) for (const engine of ["copilot", "pi", "codex"]) {
  const rs = rows.filter(r => r.run.startsWith(`${task}-${engine}-`) && r.turn === turn);
  if (!rs.length) continue;
  const ok = rs.filter(r => r.ok);
  const s = { n: rs.length, ok: ok.length, inOk: median(ok.map(r => r.input)), inAll: median(rs.map(r => r.input)), calls: median(rs.map(r => r.calls)), sec: median(rs.map(r => r.seconds)), first: median(rs.map(r => r.first)), last: median(rs.map(r => r.last)) };
  (verdict[`${task}-${turn}`] ??= {})[engine] = s;
  console.log(`| ${engine} | ${task} | ${turn === 1 ? "본 과제" : "후속"} | ${s.ok}/${s.n} | ${fmt(s.inOk)} | ${fmt(s.inAll)} | ${fmt(s.calls)} | ${fmt(s.sec)} | ${fmt(s.first)} → ${fmt(s.last)} |`);
}
console.log("\n판정 입력(본 과제, 성공한 실행끼리):");
for (const task of ["edit", "plugin"]) {
  const v = verdict[`${task}-1`]; if (!v?.codex) continue;
  // Copilot's successful-run medians from the accepted runs of the prior spike.
  const baseline = task === "edit" ? { ok: 3, inOk: 36093 } : { ok: 1, inOk: 219218 };
  const ratio = v.codex.inOk === undefined ? undefined : v.codex.inOk / baseline.inOk;
  console.log(`- ${task}: 성공 copilot ${baseline.ok}/3, codex ${v.codex.ok}/${v.codex.n}; 누적 입력 중앙값 비율 codex/copilot = ${ratio === undefined ? "비교 불가(한쪽 성공 없음)" : (ratio * 100).toFixed(1) + "%"}`);
}
const kinds = {};
for (const r of rows) if (!r.ok) { const k = `${r.run.split("-").slice(0, 2).join("-")} 턴${r.turn}: ${r.kind}`; kinds[k] = (kinds[k] ?? 0) + 1; }
console.log("\n실패 종류:"); for (const [k, n] of Object.entries(kinds).sort()) console.log(`- ${k} ×${n}`);
