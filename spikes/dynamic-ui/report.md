# 동적 UI 스파이크

- 날짜: 2026-11-05. 브랜치 `spike/dynamic-ui`. 병합·제품 출시용 구현이 아니다. PR 없음.
- 결론: **비서 생성 UI와 저장 뷰가 같은 Core 명세와 같은 React 렌더러를 사용하는 경로를 확인했다.** 저장은 정의 고정이며 데이터 고정이 아니다.
- 기존 AssistantPanel/provider adapter에 통합하지 않고 독립 스파이크 화면의 비서 패널에서 실제 Codex CLI를 호출했다. 실제 Copilot 공급자·원격 Host·외부 API 검증은 없다.
- 전체 설정 이전은 불가. 읽기 정보만 공통 Table로 표현했으며 상호작용은 카탈로그에 없다.

## 명세 v0와 카탈로그

정확한 canonical 예시는 [example.view.json](example.view.json). 아래는 같은 의미의 축약 예시다.

```json
{
  "kind":"litzio-view","schemaVersion":0,"catalog":"litzio-spike-v0",
  "title":"폴더별 문서 수","refresh":"manual",
  "sources":{"stats":{"operation":"folder.statistics","version":1,
    "args":{"sort":"folder","descending":false}}},
  "layout":{"component":"VerticalPanel","children":[
    {"component":"Table","title":"문서 수","source":"stats","data":"/rows","columns":["folder","documents"]},
    {"component":"BarChart","title":"문서 수","source":"stats","data":"/rows","x":"folder","y":"documents"}
  ]}
}
```

- 앱 번들 Table·BarChart·VerticalPanel만 허용. BarChart는 native meter로 그린 최소 막대 표시다. chart framework나 새 editor engine 없음.
- 바인딩은 `stats → operation(version 1, typed args) → /rows`만. 통계 출력은 `folder:string`, `documents:number`, `headings:number`, `modified:ISO|null`이다.
- `.md` native 문서를 Core로 parse하고 Core read model의 heading block 수를 합산한다. 문서 frontmatter title 수와 heading 수는 다르다. 다른 형식·손상 문서는 실패시키며 빈 성공으로 바꾸지 않는다.
- 폴더 상대경로 exact filter, 필드별 sort와 descending만 지원. 임의 수식·transform·URL·Host ID·secret은 없다.
- 설정 비교용 내장 `app.about-fixture`는 `setting,value`만 반환한다. 통계 필드와 교차 바인딩을 Core가 거부한다. 실제 Desktop 상태라고 주장하지 않는다.
- 명세 16 KiB, 패널 6개, 결과 100행, 파일 1 MiB, 문서 1000개, 순회 entry 2000개·깊이 12 제한. 숨김 디렉터리·symlink를 순회하지 않는다.

## Core·Host·Editor 경계와 데이터 원천 선택

- Core `packages/core/src/views`: Zod strict schema, 바인딩 유효성, canonical key 정렬·JSON parse/serialize. 기존 Zod를 재사용하고 dependency와 lockfile에 선언했다.
- Host `apps/editor/server/view-spike.ts`: 열린 fixture Root 고정, 실제 파일 읽기, Core read model 집계, 결과·receipt, view.validate/open/save/run. CLI와 UI가 같은 함수를 호출한다.
- Editor `src/views/Renderer.tsx`: 데이터와 명세를 검증해 React로 표시한다. 생성/저장/설정 모두 같은 컴포넌트다. HTTP는 기존 HostClient를 사용해 로컬 origin에 고정했다.
- 내장 읽기 작업을 선택했다. 1단계 SDK는 folder scope·generatedUi·views를 명시적으로 거부한다. fixture plugin을 쓰려면 SDK 범위 확장이나 OS 경로 우회가 필요하므로 스파이크 목적보다 커진다. SDK·OneDrive 코드는 변경하지 않았다.
- 조회는 네트워크·secret 없이 로컬 파일만 읽는다. 모델 호출만 기존 Codex 인증/네트워크를 사용한다. 문서 원문·통계 결과는 모델에 보내지 않고 카탈로그와 alpha/beta 별칭만 보냈다.
- 공용 경로 `C:\Users\swBaek\.litzio`에 쓰지 않았다. Host 설정·모델 출력·fixture는 checkout의 tmp 아래에 둔다. Codex 자체 인증 저장소를 대체하지는 않았다.

## CopilotKit 개념 정리와 Litzio 적용 판단

공식 문서와 GitHub 소스를 직접 확인한 뒤 설계를 재점검했다. 이전 조사 요약만으로 판단하지 않았다.

- [useCopilotAction](https://docs.copilotkit.ai/reference/v1/hooks/useCopilotAction): 앱이 parameter/handler/render를 등록하고 에이전트가 이름과 인자를 선택한다. `render`의 React 구현은 앱 소유다. 현재 문서는 v1 deprecated와 v2 전환을 안내한다.
- [useHumanInTheLoop](https://docs.copilotkit.ai/reference/v1/hooks/useHumanInTheLoop): 기존 `renderAndWaitForResponse`는 사용자 응답을 기다리는 상호작용이다. `respond`가 있는 실행 상태에서 응답하고 취소도 명시한다. 렌더 완료가 승인 완료는 아니다.
- [useFrontendTool v2](https://docs.copilotkit.ai/reference/hooks/useFrontendTool): frontend handler는 브라우저에서 실행한다. Litzio의 파일·plugin 작업은 Host에 남기고 UI는 제안 표시와 사용자 입력만 맡긴다.
- [useCopilotReadable](https://docs.copilotkit.ai/reference/v1/hooks/useCopilotReadable): 앱 상태를 설명과 직렬화 값으로 context에 등록하고 조건에 따라 제거한다. 스파이크는 schema와 허용 폴더 별칭만 노출해 이 원리를 적용했다.
- [CoAgents/shared state](https://docs.copilotkit.ai/coagents/shared-state): UI와 agent의 양방향 상태 연결이다. Litzio 문서 SSOT나 저장 뷰 파일을 shared agent state로 대체하는 근거가 아니다.
- [AG-UI events](https://docs.ag-ui.com/concepts/events): RunStarted/Finished/Error, ToolCallStart/Args/End/Result와 StateSnapshot/Delta를 구별한다. 부분 인자 스트리밍은 명세 검증 완료가 아니므로 스파이크는 최종 JSON을 받은 뒤 검증·렌더한다.
- [AG-UI tools](https://docs.ag-ui.com/concepts/tools): backend 작업은 backend 정의, frontend 도구는 `RunAgentInput.tools`로 전달한다. 모든 Host 작업을 browser handler로 옮기는 구조를 채택하지 않는다.
- [backend interrupt 승인](https://docs.copilotkit.ai/ms-agent-dotnet/human-in-the-loop/interrupt-flow): backend 작업의 승인 규칙은 backend가 소유한다. 스파이크 모델은 저장하지 못하며 사용자가 경로를 입력하고 저장 버튼을 눌러야 한다. 제품의 매번 승인받는 plugin 관리 계약을 대체하지 않는다.
- 직접 읽은 소스 기준 commit: `ef7de960e5c3a614213a57438e8b4fa962604324`. [v1 action](https://github.com/CopilotKit/CopilotKit/blob/ef7de960e5c3a614213a57438e8b4fa962604324/packages/react-core/src/v1-deprecated/hooks/use-copilot-action.ts), [readable](https://github.com/CopilotKit/CopilotKit/blob/ef7de960e5c3a614213a57438e8b4fa962604324/packages/react-core/src/v1-deprecated/hooks/use-copilot-readable.ts), [v2 frontend tool](https://github.com/CopilotKit/CopilotKit/blob/ef7de960e5c3a614213a57438e8b4fa962604324/packages/react-core/src/v2/hooks/use-frontend-tool.tsx)에서 legacy hook 위임, context 등록/해제, 앱 render 등록을 확인했다.
- **라이브러리 도입은 보류한다.** 빌려 온 것은 앱 소유 render·최소 상태 노출·검증 후 표시·사용자 실행 구분이다. 원격 JS/CSS는 금지하며 CopilotKit이 그 금지를 대신 보장한다고 해석하지 않는다. 기존 Codex app-server/Copilot ACP와 직접 연결, 저장/재실행·revision 계약을 해결한다는 근거가 없고 현재 검증에는 런타임 추가가 불필요하다.

## 실제 AI 비교와 신뢰도

- 소유자 예외: **모델별 생성 UI 지시 이행 능력 비교**를 위해 Codex `gpt-6-luna`와 `gpt-6.1-sol` 두 개를 사용했다. 둘 다 `model_reasoning_effort=low`를 명시했다.
- 동일한 catalog·context·요청 문자열, 독립 ephemeral CLI 실행. 각 모델×요청 1회인 작은 표본이다. 출력 강제 schema 옵션 없이 JSON을 제안받고 Core로 검증했다. schema는 같아도 Codex가 주입한 기본 문맥·캐시량은 모델별로 달랐다.
- 최종 카탈로그 기준 재측정 결과만 아래와 [comparison.json](evidence/comparison.json)에 기록했다. 초기 카탈로그 조사 실행은 비교 표에서 제외했다.

| 요청 | 모델 (low) | 첫 검증 | 바인딩/집계 | 자연 오류 후 수정 | 초 | 입력/출력 토큰 |
| --- | --- | --- | --- | --- | ---: | ---: |
| 문서 수 표 | luna | 통과 | folder/documents 정확 | 불필요 | 7.332 | 23387/111 |
| 문서 수 표+막대 | luna | 통과 | x=folder,y=documents 정확 | 불필요 | 8.480 | 23392/143 |
| beta 제목 수·내림차순 | luna | 통과 | folder=beta,headings desc 정확 | 불필요 | 7.061 | 23398/117 |
| authorEmail 요구 | luna | 명세 대신 명시 거부 | 필드 발명 없음 | 불필요 | 5.995 | 23394/42 |
| 문서 수 표 | sol | 통과 | folder/documents 정확 | 불필요 | 7.176 | 20019/111 |
| 문서 수 표+막대 | sol | 통과 | x=folder,y=documents 정확 | 불필요 | 8.041 | 20024/143 |
| beta 제목 수·내림차순 | sol | 통과 | folder=beta,headings desc 정확 | 불필요 | 8.313 | 24089/117 |
| authorEmail 요구 | sol | 명세 대신 명시 거부 | 필드 발명 없음 | 불필요 | 7.291 | 24085/37 |

- 자연 발생 검증 오류는 없었으므로 수정 성공률을 만들지 않았다. 별도로 두 모델에 같은 잘못된 `columns:[authorEmail]` 명세와 실제 Core 오류를 주입했다. 각각 한 번에 folder/documents로 수정하고 검증 통과: luna 6.230초, 19551/111 tokens; sol 7.048초, 20242/111 tokens. 명세 오류 거부와 모델 복구를 구별한다.
- CLI JSONL에서 usage·cached input·reasoning output을 수집했다. 위 값은 cached input을 포함하며 금액 청구 정보는 얻지 못했다. 모든 실행에서 shell command 실행 0개를 확인했다. reasoning output은 모두 0으로 보고됐다.
- **기본 모델 권고: luna low.** 이 표본에서는 품질 차이가 없고 허용 요청·거부·수정 모두 성공했다. 소유자가 정한 최저비용 기본값을 뒤집을 근거가 없다. 평균 응답은 luna 7.217초, sol 7.705초지만 캐시·실행 문맥 차이가 있어 속도 우열을 일반화하지 않는다. 복잡한 다중 source·긴 대화·도구 선택 신뢰도는 미검증이다.

## 저장·재실행·설정 시험

- `view.save`는 Core canonical JSON만 쓰며 rows·Host URL·LLM 대화를 저장하지 않는다. 신규 파일은 `wx` 예약 뒤 기존 file-commit, 기존 파일은 expected revision 검사·temporary sibling·rename을 사용한다. 경로는 RootAccess로 제한한다.
- 이 신규 예약 방식에는 프로세스 강제 종료 시 빈 파일이 남을 수 있다. 본 구현 전 file-commit의 신규 파일 생성 계약을 결정해야 한다. atomic compare-and-swap 보장도 기존 경로에 없다.
- 브라우저에서 실제 생성 → 저장 → 다시 열기 → 수동 새로고침을 클릭했다. 재열기 직후 행은 0개이며 LLM/조회 자동 호출이 없다. 새로고침 뒤 생성 패널과 저장 패널의 텍스트가 같다. 같은 `ViewRenderer`가 사용된다.
- `litzio view run <file> --root <opened-folder> --json`의 rows와 UI run rows를 전체 비교했다: alpha 문서 1/heading 5, beta 문서 2/heading 10, modified까지 일치. receipt의 requestId·시각은 실행마다 다르다. 직접 파일을 추가한 Host 검사에서는 재실행 문서 수가 1→2로 변했다.
- CLI는 checkout의 `pnpm cli view ...`로 실행했다. production daemon/설치 패키지/원격 `--host`에는 연결하지 않은 로컬 스파이크이다. validate/save/run 모두 같은 Host 구현을 호출한다.
- 정보·업데이트 카테고리는 같은 명세·렌더러로 Version/Release channel/Update status를 fixture read operation에서 표시했다. 실제 설정과 비교할 때 로그 폴더, CLI 설치, 채널 radio, check/download/restart, release notes, 진행률, 오류/retry, busy/disabled가 표현되지 않는다. 읽기 표시만 가능하며 기존 SettingsDialog는 수정하지 않았다.
- 공통 Button/Input·제품 token을 재사용했다. 승인된 스파이크 비교 표면만 별도로 배치했고 기존 UI를 바꾸지 않았다. 세로 패널은 flex column, 표는 native table이다.

## 보안·검증 결과와 한계

- Core 검사 통과: unknown component/prop, HTML, JS handler, CSS prop, javascript URL, 임의 URL args, 미등록 작업, 비허용 필드/result path, 비숫자 chart y, 미지원 schema version, 과대 명세·101행 결과를 거부했다. renderer는 React text로 표시하며 raw HTML/eval/import/fetch binding이 없다.
- Host 검사 통과: 신규 중복 저장·stale revision·Root 밖 쓰기/읽기 거부, canonical 재열기, 현재 파일 변경 반영. 신뢰한 Node 코드의 악성 행위 격리·OS sandbox를 증명하는 시험은 아니다.
- `pnpm exec tsx --test packages/core/test/views.test.ts apps/editor/test/view-spike.test.ts`, Core/Editor/CLI typecheck, `pnpm boundaries:check`, `pnpm docs:check`, Editor production build, `git diff --check` 통과.
- `pnpm browser:test dynamic-ui-spike --screenshots` 통과. 추가 모델 바인딩·거부·수정/CLI-UI 데이터 비교는 `scripts/dynamic-ui-verify.ts`로 통과. 전체 regression/packaged Desktop/필수 PR CI는 실행하지 않았다. PR 없음.
- 초회 브라우저 하네스에서 VM에 없는 URL 사용으로 실패해 수정했다. boundary checker의 직접 fetch 금지도 발견하여 기존 HostClient로 교체했다. 판정 기준·timeout·retry를 완화하지 않았다.
- 보존 캡처는 1440px 폭: [생성](captures/01-generated-1440.png), [저장](captures/02-saved-1440.png), [재열기](captures/03-reopened-1440.png), [설정](captures/04-settings-1440.png). 마지막은 전체 높이 캡처다. 모델 생성 대기만 실제 외부 응답에 맞춰 90초로 제한했다.

## 재현과 ADR-0020 보완·소유자 결정

- `pnpm install --frozen-lockfile`; `pnpm exec tsx scripts/dynamic-ui-prepare.ts`; `pnpm exec tsx scripts/dynamic-ui-eval.ts`.
- `LITZIO_VIEW_SPIKE=1`, `LITZIO_VIEW_ROOT=<checkout>/tmp/dynamic-ui/fixture`, `LITZIO_VIEW_EVIDENCE=<checkout>/tmp/dynamic-ui/evidence`, plugin/assistant 설정 경로·assistant cwd를 checkout tmp로 지정하고 `pnpm editor`. `/dynamic-ui-spike`에서 사용한다.
- `pnpm browser:test dynamic-ui-spike --screenshots`; `pnpm exec tsx scripts/dynamic-ui-verify.ts`. Codex CLI 로그인과 지정 모델 사용 권한이 필요하며 생성은 유료 AI 호출이다.
- 본 구현 순서 추천: Core v1·범위 결정 → 공용 Host 작업·CLI·file-commit 신규 생성 → 기존 비서 양 provider의 render/승인/오류 adapter → 실제 저장 뷰 탭 → 필요 시 외부 조회 1개. 스파이크 코드를 그대로 제품에 병합하지 않는다.

| 소유자 결정/ADR 보완 | 추천 | 그래서 무엇이 안 되는가 |
| --- | --- | --- |
| 열기와 조회 시점 | ADR대로 열기는 정의만, 별도 수동 실행 | 열기만으로 최신 데이터 표시 보장 불가 |
| v1 binding·catalog 확장 | 작업별 출력 schema와 finite field만 허용 | 임의 계산·HTML·외부 component 추가 불가 |
| 데이터 원천 | 본 구현은 승인된 SDK folder scope를 먼저 설계 | 이번 내장 통계로 plugin genUI 지원 완료 주장 불가 |
| 설정 이전 범위 | 읽기 상태만 먼저; action/selection은 별도 계약 | 전체 Settings를 표/차트로 대체 불가 |
| provider 통합 | 기존 Codex/Copilot adapter에서 최종 spec 이벤트와 validate 오류 공유 | CLI 스파이크로 양 provider 통합 완료 주장 불가 |
| 승인·실패 receipt | path/revision과 실행별 승인, 원인별 실패·패널 오류 확정 | UI render를 저장 승인으로 취급 불가 |
| 최초 파일 생성 | file-commit의 exclusive create 계약 결정 | 빈 예약 파일 crash 문제를 완료로 숨길 수 없음 |
| 모델 기본값 | luna low, 실패 시 명시 오류·필요 시 사용자 선택 | sol 자동 재시도로 성공률 부풀리기 불가 |
| CopilotKit 도입 | 개념만 차용, 직접 호환 필요가 생기면 별도 검증 | remote JS·새 runtime·저장 SSOT 대체를 묵시 도입 불가 |

- 정리 완료: persistent browser context와 모델 호출은 종료했다. Ctrl+C 뒤 남은 이번 작업의 Vite PID 12572는 경로·부모 PID를 확인해 명시 종료했다. 5173 LISTEN과 해당 checkout의 임시 browser/model/Vite 프로세스가 남지 않았음을 확인했다.
