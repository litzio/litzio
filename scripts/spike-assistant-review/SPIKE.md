# 정답을 제공한 비서의 변환 문서 수정

공개 합성 PDF의 고정 변환본에서 정답 제공 뒤 저장 결과가 111/111에 도달하는지 확인했다. A는 수정 14건의 목록, B는 작성자가 변환 전에 만든 정답 JSON이다. Codex Terra high와 Sol medium을 조건별 한 번씩 사용했다. 제품 변경은 없다.

## 재현

[기준 변환 절차](https://github.com/litzio/litzio/blob/1a434500d66fac045d2d5406b2a062c309d6b094/scripts/spike-assistant-review/SPIKE.md)에 따라 플러그인 `7f162d0e513ed085976b6a77c12e9fe4fab7c8b8`의 복사본과 현재 checkout의 CLI를 준비한다. `convert.mjs`와 `score.mjs`는 이전 버전을 사용한다. [기준 오류](baseline-differences.json)와 [채점 규칙](rubric.md)도 같다. 변환 직후는 80/111이다.

```powershell
pnpm exec tsx scripts/spike-assistant-review/convert.mjs
node scripts/spike-assistant-review/score.mjs
node scripts/spike-assistant-review/answer.mjs
# 위 명령으로 111/111을 확인하고 확인본을 바로 지운다.
# B 실행 전에는 A 목록을 임시 작업 위치에서도 지운다.
Remove-Item -LiteralPath 'tmp/assistant-review/고칠 곳 목록.md'
pnpm exec tsx scripts/spike-assistant-review/run.mjs b-sol --preflight
# 아래 두 명령은 각각 유료 대화 하나를 시작한다.
pnpm exec tsx scripts/spike-assistant-review/run.mjs b-sol
pnpm exec tsx scripts/spike-assistant-review/run.mjs b-terra
# B의 두 대화가 끝난 뒤 A를 준비하고 같은 방식으로 시작한다.
node scripts/spike-assistant-review/answer.mjs
pnpm exec tsx scripts/spike-assistant-review/run.mjs a-sol
pnpm exec tsx scripts/spike-assistant-review/run.mjs a-terra
```

실제 실행에서 A Sol의 첫 Host는 대화 제출 전 연결이 실패했다. 허용된 1회 재시도인 `a-sol-retry`에서 대화가 시작됐다. B의 사용 파일은 바이트가 같은 `standards.json`과 픽스처 설명이다. A에는 [고칠 곳 목록](answer-sheet.md)을 넣었다. 각 대화는 새 격리 Host와 사본에서 한 턴, 전체 접근, 최대 15분, 승인 미응답으로 진행했다. 완성된 확인본과 채점기를 열린 폴더에 포함하지 않았다.

```powershell
node scripts/spike-assistant-review/score.mjs <회차>
pnpm exec tsx scripts/spike-assistant-review/integrity.mjs <회차>
pnpm exec tsx scripts/spike-assistant-review/browser.mjs a-terra a-sol-retry b-terra b-sol
node scripts/spike-assistant-review/collect.mjs <회차> <해당-Codex-rollout> <scenario-result.json>
```

새 그림은 원본에서 왼쪽 축 제목과 눈금 네 개를 포함하는지 사람이 확인한 뒤 `visual-findings.json`에 해시를 기록한다. 이는 기존 채점기의 수동 판정 절차다. CLI `inspect`로 독립 수식과 표 안 수식의 LaTeX를 확인했다. 원시 대화·사본과 화면 캡처는 로컬 결과다.

## 결과 및 한계

[회차별 결과](results.json)에 도구 순서와 통과 여부, 엔진의 실제 effort, 14개 항목의 판정을 남겼다. A는 Terra 111/111·Sol 109/111, B는 Terra 106/111·Sol 102/111이었다. 고정 채점상 기존 정답 손상은 A 두 건과 B Terra에서 0, B Sol에서 5였다. B Sol의 다섯 주석은 현재 제품의 표 자체 주석으로 이동한 것이며 문장은 보존됐다. 현재 Host에는 이전 측정 뒤 추가된 표 주석 기능이 있다. A Sol도 Route 주석 두 개를 이 형태로 저장했다.

공식 `check`는 모두 유효했다. 네 사본을 격리 Host에서 열었다. B Terra의 세 독립 수식은 인라인으로 렌더되고 그림 K.2의 세로축 제목·눈금 값은 사라졌다. B Sol의 표 2는 펼친 수식 칸 두 곳이 비었다. 모든 사본에서 원본 대응 revision은 오래된 상태였다. 하나의 합성 표본과 조건·모델당 한 회이므로 결과를 반복 성능으로 해석할 수 없다. 파싱·비교에 쓸 파일과 단일 턴 조건이 앞의 두 턴 실험과 달랐고 표 주석 기능도 바뀌었다.

## 현재 결정과 어긋나는 점

없음. [범용 비서 ADR](../../docs/adr/0021-general-agent-assistant.md)의 활성 문서 경로와 전체 접근을 사용했다. 이전과 비교하기 위해 유지한 표 주석 채점 방식과 이번 Host가 지원하는 표 주석 저장 형식이 다르다.

## 추천

미정. 사람이 편집 범위와 목표 구조를 지정하고 저장 뒤 해당 구조와 변경 범위를 확인하는 절차를 다른 표본에서 반복 검증할 것을 추천한다.
