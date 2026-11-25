// Read private evidence locally and render a summary without paths or raw model text.
import fs from "node:fs";
import path from "node:path";
import { tasks } from "./tasks.mjs";

const [evidence, mode = "progress", annotationsFile, extendedRepeats = "5"] = process.argv.slice(2);
if (!evidence || !["progress", "trace", "publish"].includes(mode) || !["3", "5"].includes(extendedRepeats)) {
  throw new Error("Usage: tsx review.mjs <evidence> <progress|trace|publish> [annotations.json] [extended repeats]");
}
const parseFile = file => JSON.parse(fs.readFileSync(file, "utf8"));
const manual = annotationsFile ? parseFile(annotationsFile) : {};
const labels = [
  "대상 미발견", "이미지 열기 생략", "판독 오류", "리치오 도구·CLI 미호출", "잘못된 도구",
  "도구 인자 오류", "오류 후 복구 실패·반복", "직접 쓰기에서 의미 훼손", "일부만 실행", "그 밖",
];
const planned = tasks.flatMap(task => Array.from({ length: Number(task.id[0] < "7" ? 5 : extendedRepeats) },
  (_, i) => ({ task, trial: `${task.id}-${i + 1}` })));
const finished = [];
for (const { task, trial } of planned) {
  const dir = path.join(evidence, trial);
  const file = path.join(dir, "result.json");
  if (!fs.existsSync(file)) continue;
  const result = parseFile(file);
  if (!result.stop || result.error || !result.modelRequests || !result.judgement) continue;
  const annotations = manual[trial];
  const items = result.conversation.turns.flatMap(turn => turn.items);
  const calls = result.requests.flatMap(req => req.toolCalls ?? []);
  const tools = calls.map(({ name, args }) => toolLabel(name, args));
  const ok = annotations?.ok ?? result.judgement.ok;
  const failures = annotations?.failures ?? [];
  if (ok && failures.length) throw new Error(`${trial}: success with failure labels`);
  if (failures.some(label => !labels[label - 1])) throw new Error(`${trial}: unknown failure label`);
  finished.push({ task, trial, result, annotations, items, calls, tools, ok, failures });
}

function toolLabel(name, args) {
  if (!/^[\w-]+$/.test(name)) return "도구";
  const base = name.replace(/^litzio_host-/, "");
  if (base !== "powershell") return base;
  const command = /\b(?:litzio(?:\.cmd)?|LITZIO_ASSISTANT_CLI)[ "'\\]*\s+(inspect|check|apply-batch|append|help|insert-[\w-]+|update-[\w-]+)\b/i.exec(args)?.[1] ??
    /\b(Get-Content|Set-Content|Add-Content|Get-ChildItem|Move-Item|Import-Csv|Measure-Object|python|node)\b/i.exec(args)?.[1];
  return command ? `PowerShell \`${command}\`` : "PowerShell";
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sequence(tools) {
  const repeats = [];
  for (const name of tools) {
    const previous = repeats.at(-1);
    if (previous?.name === name) previous.count++;
    else repeats.push({ name, count: 1 });
  }
  return repeats.map(({ name, count }) => count > 1 ? `${name} ×${count}` : name).join(" → ") || "없음";
}

function grade(count, n) {
  if (n === 3) return "등급 보류(3회)";
  return ["안 됨", "안 됨", "흔들림", "흔들림", "대체로 됨", "안정"][count];
}

if (mode === "trace") {
  for (const entry of finished) {
    const { trial, result, items, calls, ok } = entry;
    const { judgement } = result;
    console.log(JSON.stringify({ trial, ok, stop: result.stop, seconds: result.seconds, tokens: result.inputTokens,
      missingUsage: result.missingUsage, imageParts: result.requests.map(r => r.imageParts), calls,
      verdict: { ...judgement, documents: judgement.documents.map(({ file, missing, valid, canonicalMatch, check }) =>
        ({ file, missing, valid, canonicalMatch, check: !valid && check })) },
      tools: items.filter(i => i.kind === "tool" || i.kind === "question").map(i =>
        ({ text: i.text, work: i.work?.kind, status: i.status, detail: (i.work?.detail ?? "").slice(0, 1200), question: i.question?.form?.questions })),
    }));
  }
} else {
  const elapsed = finished.reduce((sum, row) => sum + row.result.seconds, 0);
  console.log(`완료 ${finished.length}/${planned.length} · 턴 관측 합 ${(elapsed / 60).toFixed(1)}분`);
  console.log("| 계단 | 과제 | 성공 | 등급 | 시간 중앙값(초) | 입력 토큰 중앙값 |");
  console.log("| --- | --- | ---: | --- | ---: | ---: |");
  for (const task of tasks) {
    const group = finished.filter(row => row.task.id === task.id), n = group.length;
    if (!n) continue;
    const count = group.filter(row => row.ok).length, target = task.id[0] < "7" ? 5 : Number(extendedRepeats);
    const tokens = median(group.map(row => row.result.inputTokens)).toLocaleString("en-US");
    const missing = group.filter(row => row.result.missingUsage).length;
    console.log(`| ${task.id[0]} | ${task.id} ${task.name} | ${count}/${n} | ${n === target ? grade(count, n) : "측정 중"} | ${median(group.map(row => row.result.seconds)).toFixed(1)} | ${tokens}${missing ? "†" : ""} |`);
  }
  if (mode === "publish") {
    if (finished.length !== planned.length) throw new Error("The planned trials are incomplete.");
    for (const { trial, ok, annotations, failures, task } of finished) {
      if (!ok && (!failures.length || typeof annotations?.claim !== "boolean")) throw new Error(`${trial}: review the failure and completion claim.`);
      if (task.script && typeof annotations?.script !== "boolean") throw new Error(`${trial}: review script execution.`);
      if (task.script && !annotations.script && ok) throw new Error(`${trial}: missing script execution.`);
    }
    const manualCount = finished.filter(row => row.annotations?.ambiguous).length;
    const claims = finished.filter(row => row.annotations?.claim).map(row => row.trial);
    console.log(`\n수동 판정 ${manualCount}회, 완료 주장과 결과 불일치 ${claims.length}회(${claims.join(", ")}).`);
    console.log(labels.map((label, i) => `${i + 1} ${label} ${finished.filter(row => row.failures.includes(i + 1)).length}`).join(" · "));
    console.log("\n| 실행 | 성공 | 초 | 모델 요청 | 입력 토큰 합 | 도구 순서 | 실패 분류 |");
    console.log("| --- | --- | ---: | ---: | ---: | --- | --- |");
    for (const { trial, result, tools, ok, failures } of finished) {
      console.log(`| ${trial} | ${ok ? "성공" : "실패"} | ${result.seconds.toFixed(2)} | ${result.modelRequests} | ${result.inputTokens}${result.missingUsage ? "†" : ""} | ${sequence(tools)} | ${failures.join(", ") || "—"} |`);
    }
  }
}
