# Assistant connection, settings and conversations

- Status: Implemented
- New-conversation isolation verification (#1548, 2026-11-12): the existing assistant browser scenario reproduces Stop → New conversation → model change → paced typing with a retained first submission lacking provider-history proof. Before the fix its receipt restored the old conversation and the next send carried the old ID; after ownership association the send has no ID and a different conversation is created. Fixture provider/Host validation only, no real AI call or frequency measurement.
- Host assembly (#1246): `host-services.ts` composes independent plugin and view services and lazily initializes the assistant. Plugin management/secret routes belong to `plugin-service.ts`; views receive that same plugin runtime explicitly through `view-service.ts`. Assistant shutdown closes only its provider/conversation resources; Host shutdown closes plugins independently, including when assistant initialization or shutdown fails. Views retain no separate runtime resources. Concurrent/repeated Host close calls share one shutdown promise, including its failure. A send waiting for plugin startup rechecks assistant shutdown before provider admission. Request paths, lazy plugin start, receipts and stored formats are unchanged.
- Dynamic UI removal (#1341, 2026-11-09): assistant view tools, generation/correction, material snapshots, result cards, favorites and saved views are removed. Ordinary conversations, references, document tools and requestUserInput remain. Retained plugin screens/query/Table and review boundaries are defined in [Plugin screens v1](plugin-screens-v1.md); [Generated views v1](generated-views-v1.md) is Historical.
- Instruction verification: 2026-11-12 — 한국어 지시문과 현행 도구 정의 대조, provider/Host/review 대상 단위 검사 및 Codex gpt-6-luna low 사본 편집·템플릿 생성 확인. 실제 AI는 임시 문서·로컬 Host만 확인하며 UI·패키지 검증은 포함하지 않는다.
- Last verified: 2026-11-12 — #1530 retains unanswered async questions across turn end and reuses ordinary message send for answers; fake Host/provider and browser validation only. Previous 2026-11-10 — #1443의 질문 메타데이터·답변·기록과 Codex 0.167.0/gpt-6-luna low의 실제 Host·브라우저 전달/수신/재열기를 확인. Copilot ACP 미지원 거부는 fixture, 실제 원격 연결·Copilot AI 호출은 미검증.
- Previous shell verification: 2026-11-05 — master 303e9a1의 Host 등록·탭·비서·템플릿 진입 정적 대조와 문서 검사.
- Terminology: [제품 용어집](../contributing/terminology.md); PR B completed the assistant code/API naming transition.
- Official AI transition: 2026-11-04 (#1150 ③). `assistant-host.ts` composes connections/conversations directly; the official AI itself requires no registration, manifest or plugin worker. Owner-initiated ADR-0020 plugin management is a separate Host feature (see Plugin stage 1 below). Settings use the built-in Settings → Assistant category with the shared Button, SettingsSelect and Dialog components. No UI pattern exception. Protocol version 4 refuses older daemons.
- Historical PR4 daemon lifetime verification: 2026-11-04 — existing fake app-server/HTTP, shutdown/uncertain/no-replay, CLI ownership subprocess tests and persistent Chrome reconnect preservation. PR4's packaged worker/native comparison was required Windows CI then; #1150 ③ removed that feature. Current Windows CI retains packaged Desktop and main/CLI license-notice checks in the startup/sample smoke.
- Assistant naming (#1168 PR B): 2026-11-05. CLI, HTTP routes, feature types/files and settings use assistant; `permissionMode` retains the same values and behavior. Settings use `assistant.json`, `LITZIO_ASSISTANT_SETTINGS_FILE` and `LITZIO_ASSISTANT_CWD`. There are no aliases, old-key acceptance or data migrations. Protocol 4 rejects v3 before connecting because its settings/routes differ.
- Saved-file context (#1106): 2026-11-04 owner decision; fake Host/protocol, existing assistant browser and Korean 1440px/640px Light/Dark capture checks, no real model turn.
- Copilot options/full access (#1091): 2026-11-03; fake ACP/Codex/Host checks, existing assistant browser and 1440px/640px Korean Dark captures; one real no-prompt catalog session only.
- Minimum-version verification: 2026-11-03 ([#967](https://github.com/litzio/litzio/issues/967); connection, catalog and settings only, limitations below).
- Message roles verified: 2026-11-03 (#1048/#1051; fixture captures and turn-copy browser checks below).
- Host settings integration: 2026-11-03 (#1070 merge; target unit/type checks and existing fake assistant browser case, 1440px/640px Korean Dark captures; no real Copilot call).
- Provider Save verification: 2026-11-03 (#1069 review correction; reproduced stale dock state before the fix, then existing fake browser case passed with Save/new conversation).
- Composer input verification: 2026-11-03 (#1087; delayed-caret ordering reproduced before the fix; existing fixture browser scenario, no real model call).
- Copilot verification: 2026-11-03 (#1053; fake ACP and task-default boundary, existing assistant browser scenario and 1440px Light / 640px Dark Korean captures; no real Copilot session or model call).
- Previous execution verification: 2026-11-03 (#1047 PR A/B / #984 / #952: fake stdio/Host, worker prompt, browser and manual 1440 Light / 640 Dark Korean captures; no real model turn).
- Previous verification: 2026-11-02 (#931 implementation 2, PR 2: 409 Editor tests, real Codex creation/card undo and skill discovery; earlier connection/Q&A evidence retained below).
- Display settings (#1120): 2026-11-04; fixed Host/screen allowlist, fake stdio/HTTP and browser checks; no real model call.
- Template operations verification: 2026-11-04 (#1128: shared Host operations, fake dynamic-tool/receipt-history and child PATH execution; no real model call; packaged behavior is CI-only).
- Scope: main-agent connection, Settings, shell-owned assistant panel and Codex/Copilot conversations. Includes new-document result cards, guarded creation undo and the product-owned usage-guide skill.
- Authority: [ADR-0014](../adr/0014-main-agent-app-server.md), [#931](https://github.com/litzio/litzio/issues/931) owner decisions and approved v3.1 settings mockup.

The Codex-specific RPCs and policies below apply to Codex. Copilot differences
are defined in [Copilot conversations](#copilot-conversations-1053).

> 2026-11-05 결정 개정: [ADR-0020 비서 제작 로드맵](../adr/0020-plugin-architecture.md#비서-플러그인-제작-로드맵2026-11-05-개정)은 하위 프로세스 reload·제작 키트·관리 건별 승인 제거와 활동 기록을 결정했다. 아래 매 호출 확인 등은 현재 구현의 기록이며 새 결정의 완료 증거가 아니다. 해당 구현 PR에서 함께 갱신한다.

## 비서 자율성 원칙 (#1500, 2026-11-11)

소유자 승인 원칙이며 이후 비서 기능과 리뷰의 기준이다. 단계 계획과 진행은 [#1500](https://github.com/litzio/litzio/issues/1500)을 따른다.

- 자율성은 되돌릴 수 있는가로 정한다. 읽기·분석, 사본 수정·제안·검사 기록, 새 문서 생성은 비서가 스스로 한다. 원본(SSOT) 반영은 사람의 [적용] 한 번, Docling 검수 교정은 비서가 즉시 적용하며 Undo·완료는 사람, 큰 비용·외부 전송은 사람에게 확인한다.
- 보호 장치는 작업별 확정 경계에 둔다. 그 경계에서 Host가 유효성·권한·revision·결과 기록을 책임지고, 비서와 화면은 같은 공용 계약을 재사용한다. 내부 식별자(baseline·requestId 등)는 Host가 채우고 사람과 모델에게 요구하지 않는다.
- 비서에게 새 제약을 걸 때는 구체적 위험, 정상 작업에 주는 영향, 대체 경로를 함께 설명한다([AGENTS.md](../../AGENTS.md)). 읽기와 사본 변경은 막기보다 수행 방법을 먼저 찾는다.
- [적용]은 정상 경로에서 Host가 통제한다. 전체 접근에서는 비서가 셸로 원본을 고치는 것까지 기술적으로 막지 않으며, 이 부분은 지침으로 지키는 약속이다.
- 공통 작업 레지스트리·범용 승인 엔진은 만들지 않는다. 같은 도구 등록·권한 매핑·오류 변환을 반복 수정하거나 비서 연결 누락 회귀가 되풀이될 때 검토한다. 그 전까지 새 Host 작업은 입력·결과·범위·효과(읽기/쓰기/파괴)·receipt·비서 노출 여부를 설계 문서에 적는다.
- 비서 도구의 입력·결과 계약은 공급자 중립으로 둔다. Codex와 Copilot은 같은 Host 도구 정의·실행 함수를 쓴다.
- 비서 수락 시험: 모델 없는 Host·Core 단위 검사, 일상 점검은 Codex `gpt-6.1-terra` high, 핵심 업무 수락은 Codex `gpt-6.1-sol` medium(소유자 주력). 문서 수정 과제의 완료 상태는 '사본 완료·사람 적용 대기'다.
- 직접 수정(사본 없이 원본 반영)은 수정 전 원본 보존, 원본 revision·파일 identity 검사, 성공·실패·불확실 receipt, 조건부 복원, 미저장 Editor 충돌 처리, 위임 범위 표시가 갖춰진 뒤 '이번 작업의 원본 반영까지 위임했는가'를 기준으로 재검토한다.

### 실패 분류와 자율 복구 (4단계)

공용 비서 dispatch는 Codex dynamic tools와 Copilot MCP에 같은 성공 transport 상태와 실패 시 `receipt.outcome` (`failure|uncertain`), `errorKind` (`invalid_input|conflict|forbidden|unavailable|uncertain`), `recovery`를 반환한다. 기존 작업 receipt와 requestId는 보존한다. 플러그인 공개 오류의 auth/forbidden은 forbidden, 나머지 가용성 오류는 unavailable로 비서 출력에서 매핑하며 플러그인 내부 계약은 유지한다. 새 오류 클래스·승인 엔진·자동 재시도 실행기는 없다.

- `invalid_input`: 보고된 입력과 도구 schema를 확인하고 수정한 새 요청을 보낸다. 검수 후보가 여럿이면 `candidates`와 `find_review_workspaces`로 스스로 좁힌다. 의도가 끝내 모호할 때만 묻는다.
- `conflict`: 사본은 `inspect_staged_document({change})`, 검수는 `read_review_document({path})`, 플러그인 관리는 `manage_plugins({action:"list"})`로 최신 상태를 읽고 재분석한다. 새 revision/baseline/등록 정보를 써서 새 요청을 보낸다.
- `forbidden`: 필요한 열린 폴더/Full access 또는 서비스 자격·권한, 사람의 검수 결정을 안내한다. 비서가 권한을 바꾸거나 승인 경계를 우회하지 않는다. 읽기 전용 플러그인 도구에 쓰기 권한을 늘려도 private/write 작업은 허용되지 않는다.
- `unavailable`: 대상·플러그인 목록이나 원래 창의 화면 상태를 안전하게 재조회하고 가능한 공식 경로를 찾는다.
- `uncertain`: 쓰기를 자동 재실행하지 않는다. 검수는 기존 requestId로 `read_review_request_status`, 플러그인 job은 `job-status`부터 조회한다. 배치 시작은 바깥 receipt ID가 아니라 `files[]` 중 uncertain 작업의 개별 requestId에 대해 `recovery.queries`의 상태 조회를 수행한다. 상태 도구가 없는 사본 편집은 사본을 다시 inspect하고 결과를 대조한다. 상태 미발견은 무쓰기 증거가 아니다.

알려진 후속: 원본 변경 후 사본 재기준화와 수락 시험은 미구현이다. 적용 시 충돌 검사가 원본을 보존하며, 현재 비서는 `read_document`·`inspect_staged_document`로 원본과 제안을 대조하고 사람이 제안을 보존·검토 후 Discard하고 재요청하도록 안내할 수 있다. 비서의 자동 discard·재기준화는 제공하지 않는다.

화면 조작의 기존 최상위 `outcome`도 같은 실패 receipt/errorKind로 매핑한다. `completed`와 `remaining`은 보존하고 충돌·불확실 결과는 `read_screen_context`로 현재 창을 대조한다. 기존 미저장 확인은 사람 결정으로 남으며, 화면 조작 timeout/취소를 성공으로 반환하거나 자동 재실행하지 않는다.

`recovery`는 action, 가능한 tool/arguments, 필요한 requestId와 행동 설명을 담는다. 안전한 읽기·입력 수정·충돌 재분석은 사용자 확인 없이 비서가 수행한다. 알 수 없는 쓰기 예외는 uncertain으로 보수적으로 공개한다. 이 분류는 비서 결과 전달 계약이며 공용 CLI 작업이나 Core 의미를 새로 구현하지 않는다. 실제 모델 수락 근거와 미확인 범위는 PR에 따로 기록한다.

## 비서 뷰 기능 제거 (#1341, 2026-11-09)

#1306에서 전용 Generate view·Ask assistant 진입을 제거한 뒤, #1341에서 일반 Send의
view_catalog/propose_view와 내부 Host/CLI 생성·교정·자료/출처·결과 카드·즐겨찾기를 제거했다.
아래 생성 관련 실행·캡처 기록은 Historical이며 현재 제공 기능이나 검증 경로를 뜻하지 않는다.
남는 플러그인 화면·조회·표와 review 경계는 [플러그인 화면 계약](plugin-screens-v1.md)을 따른다.

일반 대화는 첨부하지 않은 현재 문서의 경로만 전달한다. 활성 검수 대조 탭은 대상 Host가 같은 경우 별도 `reviewWorkspace:{path}`를 참고 맥락으로 전달한다. 이 맥락은 권한이나 검수 도구의 실행 조건이 아니다. 현재 문서 본문이나 이전 도구 결과를
뷰 생성용 snapshot으로 자동 수집하지 않는다. 명시적 파일 참조와 문서 읽기 도구는 유지한다.
사용자 데이터 migration은 없다.

## 공급자 원본 로그 외부 열기 (#1304)

현재 비서 대화의 두 아이콘은 공통 ghost/icon-sm Button, Lucide ExternalLink/FolderOpen,
Tooltip을 사용한다. 원본 로그를 메모장에서 열거나 탐색기에서 파일을 선택한다.
대화가 없으면 두 버튼을 비활성화하며 먼저 메시지를 보내도록 안내한다.
브라우저와 원격 Host에서는 이유를 tooltip으로 표시하고 비활성화한다.
새 로그 열람 화면·대화 복사·본문 진단 기록·문서 쓰기는 만들지 않는다.

Host 공용 작업은 `assistantConversation { action: "provider-log", id, provider }`다.
같은 `/api/assistant/conversations` POST를 호출하는
`litzio assistant provider-log <id> <codex|copilot> --host <origin>` CLI는
해당 Host의 검증된 `{ available: true, id, provider, path, checkedAt }`를 반환한다. 조회만 수행하고 OS를 열지 않는다.
불가 결과는 `{ available: false, reason }`이며 unknown/missing/denied/unverified를 구별한다.
다른 Host나 로컬 계정으로 fallback하지 않으며 불가 결과·오류는 nonzero다.
Desktop main은 renderer 경로/URL을 받지 않고 `local`·대화 ID·provider·open/reveal만 받아,
자신이 연결한 로컬 daemon의 identity를 확인한 뒤 동일 작업을 호출하고 원본을 재검사한다.
OS 부작용은 이 명시적 Desktop 조작에만 있다. 원격 파일의 로컬 열기는 지원하지 않는다.

Host는 자신의 Litzio 대화 인덱스에서 ID와 provider를 먼저 확인한다.
Codex는 `thread/read { threadId, includeTurns: false }`의 ID·path와 파일 첫
`session_meta.payload.id`를 대조한다. **Codex Thread.path는 unstable 필드**이며,
필드 부재·공급자 인증/연결 실패·검증 실패 시 경로를 추정하거나 다른 세션으로 대체하지 않는다.
Copilot은 Host 환경의 `COPILOT_HOME` 또는 기본 `~/.copilot`을 고정하고
`session-state/<sessionId>/events.jsonl` 첫 `session.start.data.sessionId`를 확인한다.
[공식 Copilot 디렉터리 계약](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference)을 따른다.
설정/인증 파일을 읽거나 root를 검색하지 않는다. ACP session/load 지원은 capability에 의존하며
resume 가능 여부가 로그 파일 존재를 보장하지 않는다.

메타데이터 검사는 최대 64 KiB의 첫 줄만 사용한다. 잘못된 UUID·다른 ID·provider·누락·접근 거부,
symlink/junction이 포함된 경로·hardlink·일반 파일이 아닌 대상·UNC/ADS를 거부한다.
로그가 없거나 비활성화·삭제되었으면 다른 파일로 대체하지 않는다.
파일 검증 시점과 외부 앱의 실제 읽기 사이의 파일 변경까지 원자적으로 고정하는 기능은 없다.

Windows의 고정 `%SystemRoot%/System32/notepad.exe`에 인자 배열로 검증된 파일 하나만 전달한다.
셸 실행·임의 앱/코드/HTML 실행·`.jsonl` 연결 앱·`codex://` 등록에 의존하지 않는다.
앱 실행 오류는 위치 표시를 안내하며 위치 표시는 같은 검증을 다시 한 뒤
Electron showItemInFolder로 전달한다. UI는 실행 요청을 내용 열람 성공이라고 표시하지 않는다.
탐색기 API 역시 표시 완료 acknowledgement를 제공하지 않는다.
공급자 로그를 삭제·이동하지 않는다. 외부 편집기의 저장 기능은 해당 앱의 동작이다.

검증: 기존 assistant Host 테스트를 확장해 ID/provider/RPC와 메타데이터 불일치,
누락·거부·junction 및 같은 HTTP 작업의 CLI 호출을 확인했다.
Desktop fixture는 같은 경로라도 remote 요청을 OS 호출 전에 거부하며 명시적 open/reveal과
실행 실패를 확인한다. 기존 assistant 브라우저 회귀와 별도의 짧은 provider-session-log fixture는 무조작 시 열기 없음·
대화 없는 상태·브라우저 비활성화와 명시적 bridge 호출을 확인한다.
[1440px](assets/provider-log-1304/provider-log-1440-dark-ko.png)·
[640px](assets/provider-log-1304/provider-log-640-dark-ko.png) 한국어 다크 캡처와
[대화 없음](assets/provider-log-1304/no-conversation-640-dark-ko.png)은 비민감 합성 대화의 패널 crop이다.
실제 Litzio 생성 합성 Codex 세션(gpt-6-luna/low)의 완료와 원본 검증을 확인했다.
별도 합성 JSONL은 이 PC의 메모장 창 제목에서 파일 이름을 확인했으며 시험 창·파일은 정리했다.
실제 공급자 원본을 OS에서 여는 통합 시험, Copilot 신규 실제 호출, 실제 원격 연결 및 ACL 거부는
이번 실행에서 확인하지 않았다. Copilot 1.0.106·Codex 0.166.0의 합성 원본 일치 연구는
이슈에 제공된 선행 근거다. 모든 최종 모델 입력·도구 결과·실패·취소가 무손실이라는 보장은 없다.

## Host 대상 고정 (#1174 PR2)

비서 표면은 mount 시 Host client를 고정한다. 생성·resume·poll·발화·중단·표시 결과·모델·진단 요청은 같은 client를 사용하며 활성 탭·필터를 요청 주소로 사용하지 않는다. 마지막 대화 ID도 hostId별로 기억한다. 설정 표면 역시 선택한 Host의 client를 고정한다. 연결 해제나 화면 종료가 원격 실행 취소를 뜻하지 않는다.

`assistant-reference-handoff.ts`의 훅은 App의 참조 요청 생성·소비 확인·새 대화 초기화와 대화 Host 선택을 소유한다. AssistantPanel은 요청의 hostId가 대화 Host와 일치할 때만 참조를 추가하고, 처리한 요청을 원래 객체로 확인한다. 훅은 현재 요청과 같은 객체의 확인만 초기화하므로 이전 요청의 확인이 새 요청을 지우지 않는다.

운영 비서는 로컬·등록된 원격 Host를 선택할 수 있다. PR4의 AssistantHostChooser에서 대상을 선택하고 Host별 패널에 고정한다. 다른 Host 참조를 전역 fallback으로 합치지 않는다.


## Connection and environment

The existing Host composition owns a lazy `CodexAppServer`. It resolves Codex
from PATH, checks version >= 0.141.0, spawns one stdio child, sends `initialize`
then `initialized`, and matches newline JSON-RPC responses by ID. Concurrent
requests share initialization. UTF-8 chunks may split characters. Provider
errors, malformed messages, process exit and request deadlines reject pending
work; no request is replayed automatically. A later explicit request can
initialize after a failed launch or an exited process. Malformed protocol output
closes the connection; that Host must restart before reconnecting.

The minimum is the first version providing all app-server contracts Litzio uses,
including the current function dynamic-tool registration format (#967). It is
raised only when a required contract changes, independently of the versions used
for actual verification recorded below. Older versions report an update requirement.

The user's environment, including any existing `CODEX_HOME`, is inherited.
No credential/configuration file is copied or written. The cwd is the branded
OS user-data directory plus `assistant` for packaged Desktop and distributed CLI;
Linux uses XDG data home and macOS uses Application Support. Source execution
(Vite, tsx CLI and development Electron) instead uses
`<checkout>/.litzio-dev/assistant`, alongside its isolated official settings defaults
). Built checkout
`packages/cli/dist/cli.mjs` retains distributed defaults. `LITZIO_ASSISTANT_CWD` explicitly overrides this directory
for local integration/testing. Litzio regenerates its product-owned `AGENTS.md`
there and lists folders containing `.agents/skills/<name>/SKILL.md`. The file
instructs the agent to edit existing documents through a pending copy and leave application/discard to the human comparison UI.
Litzio also regenerates `.agents/skills/litzio-guide/SKILL.md` here. It has name/description frontmatter and usage/CLI guidance, with no executable scripts.

### 제품 지시문 구성 (2026-11-12)

지시문을 튜닝할 때는 [비서 AGENTS.md](../../apps/editor/server/assistant/AGENTS.md)와 [litzio-guide SKILL.md](../../apps/editor/server/assistant/litzio-guide/SKILL.md)를 고친다. 두 파일이 한국어 지시문 원본이며 `provider-connections.ts`의 `ASSISTANT_INSTRUCTIONS`와 `LITZIO_GUIDE`는 이 내용을 사용한다. `ASSISTANT_INSTRUCTIONS`는 매 턴 필요한 맥락·언어, 공식 write path와 사본 편집, 화면 조작, 비동기 질문, 공급자 승인, 검수 즉시 교정, 플러그인과 실패 복구를 소유한다. `LITZIO_GUIDE`는 앱 사용법·템플릿·터미널 CLI 참고 절차를 소유하며 같은 규칙을 반복하지 않는다. 도구·명령·필드 식별자는 원문을 유지한다. 사본 편집 Host 도구가 보이면 셸·CLI를 사용하지 않으며, CLI 절차는 Host 도구가 없는 터미널 이어하기에만 적용한다.

개발 실행(tsx/Vite)은 모듈 상대 경로의 Markdown을 읽는다. CLI 빌드(`packages/cli/scripts/build.ts`)는 같은 파일 내용을 esbuild define으로 정적으로 포함하므로 배포 HTTP Host는 런타임 Markdown 경로에 의존하지 않는다. Desktop 빌드는 이 CLI 배포본을 `apps/desktop/build/cli`에 복사하며 daemon은 그 번들을 사용한다. 지시문 변경 후 개발 서버를 다시 시작하고 배포본은 다시 빌드한다. source 환경 생성 검사와 외부 디렉터리의 CLI HTTP·Windows packaged daemon 검사가 생성된 두 파일을 원본 Markdown 전체와 비교한다. Windows packaged 실행은 merge queue의 기존 검사에서 확인한다.

검수는 `apply_review_groups`로 즉시 교정하고 사람은 Undo·재지시·직접 수정한다. 이미지 읽기는 사전 승인 없이 수행한다. 질문의 `accepted:true`는 대화 저장이며 렌더 확인이 아니고, 턴 종료 뒤 답변은 후속 메시지로 온다. 권한 요청은 공급자 승인 카드로 전달한다. 템플릿과 요청된 표시 설정의 별도 사전 동의는 제거하되 사본 적용/버리기, 공식 write path, 불확실 쓰기 no replay, 비밀 값과 조직 정책 경계는 유지한다.

The shared daemon owns provider connections and in-memory conversations. Closing
a Desktop window, assistant panel or browser does not stop a turn while that
daemon remains alive. Another client at its origin lists/resumes the same
conversation and sees current progress without starting another turn. Display
tools remain bound to the sending window and cannot silently move to another
client. Unsaved document content, Undo and selection remain client-local.

Closing the daemon ends stdin, waits for exit and terminates the exact owned
provider process tree if needed. Shutdown failure is surfaced. Provider loss marks
live conversation turns failed; no request is automatically replayed. The removed durable `aiTasks` uncertain/no-replay contract remains recorded in ADR-0017 for owner-initiated redevelopment. Provider history
is loaded only by explicit resume after daemon restart. Desktop owns only a
daemon it launched; a CLI daemon survives Desktop close under
[ADR-0016](../adr/0016-shared-local-daemon-host.md). There is no controller across
different Host processes.

## Settings and read routes

With no saved Assistant settings, source checkout execution uses `gpt-6-luna` / `low`
for inexpensive development checks (#1058). The Host reuses the source/packaged
run distinction that selects `.litzio-dev`; installed Desktop and distributed
HTTP Host retain `gpt-6.1-sol` / `medium`. Existing saved settings take priority
and are never overwritten by these defaults. New assistant conversations and
their initial model/effort selection use the same Assistant settings response.

The official `assistant.json` settings file stores (installed defaults shown):

```json
{
  "provider": "codex",
  "model": "gpt-6.1-sol",
  "reasoningEffort": "medium",
  "permissionMode": "opened-folders",
  "responseLanguage": "ko"
}
```

`GET/PUT /api/assistant/settings` and `litzio assistant settings` / `litzio assistant configure --file <json-file>` call the same `createAssistantHost().invoke` operations. Input is the complete official settings object; unknown keys (including the old permission key and enable/provider switches) are refused. Scope is the selected Host's settings path. The returned persisted snapshot is the operation result/receipt; no new ledger or assistant management tool is added. CLI source execution uses local Host storage, as the former management CLI did. Model/provider/effort changes require a current provider catalog pair. Invalid input or a failed write preserves the previous file; writes use an exclusive temporary sibling and rename.

AI is always a daemon feature. Both supported providers are inspectable and selectable without enable switches. Diagnostics report actual executable, connection and account availability. A new conversation/turn with an unavailable selected provider fails with its reason; Litzio never silently substitutes another provider or model. Existing turns, steering, interruption, display replies and history reads do not depend on the current availability/default settings. Changing defaults does not dispose connections, erase conversations or cancel admitted turns; choices apply to the next conversation/turn. Daemon shutdown alone closes its owned provider connections and awaits exit. No settings, registrations or installed files from the removed plugin system are migrated or cleaned.

Each UI change saves a complete snapshot through the existing sequential request queue; errors retain the draft and show a localized alert. Successful saves refresh the assistant defaults while retaining its current conversation. The model dialog retains catalog search, refresh and diagnostics.

`permissionMode` is the single assistant permission-mode value (`opened-folders`,
`read-only` or `full-access`). Each new turn supplies the current opened-folder paths
as `workspaceWrite.writableRoots`, uses `readOnly`, or disables the sandbox with
`dangerFullAccess`. Host path checks run before
passing folder/document context to Codex. The dedicated cwd remains Codex's
workspace; OS temporary write exceptions remain disabled. Opened folders enables network access;
read-only keeps network access disabled. Approval policy is `on-request` in restricted modes and `never` in Full access.
Provider approvals use the existing question cards (see #1536 below). User Codex
configuration, MCP servers and login remain inherited. The existing-document
rule is an agent instruction, not a new document-edit enforcement system.
Steering retains the running turn's scope; new folder/settings choices apply to
the next turn.

AI default language offers Korean, English and Japanese. Its initial value follows
Host OS / browser language, with English fallback, independently of display language.
Changing the language automatically persists it.
It applies only to tasks started without a conversation, is pinned in the task's
execution receipt, and reaches the worker prompt. Conversations follow the user's
message language; document writing follows the target document language unless
explicitly requested otherwise. There is no per-conversation language state or selector.
Model/effort defaults still initialize each new conversation.

| Route | Response |
| --- | --- |
| `GET /api/assistant/skills` | `{ skills, errors }`; enabled Codex skills for the assistant cwd, loader errors retained. |
| `GET /api/assistant/models` | `{ provider, models, updatedAt }`; paginated `model/list`, visible models and supported reasoning efforts. |
| `GET /api/assistant/diagnostics` | Codex executable/version, app-server initialization, `account/read`, `account/rateLimits/read`, paginated `mcpServerStatus/list`, check time and individual errors. |
| `GET /api/assistant/environment` | `{ cwd, instructions, skills }`; Litzio-owned environment, without starting app-server. |

These official Host reads use the existing route/JSON transport and add no extension lifecycle
API. Diagnostics keep partial successes: an account/rate-limit/MCP error is not
presented as a successful probe. Unknown MCP runtime status is not inferred from
authentication status. Model discovery and a connected process do not prove
that an account can execute every returned model. No login/token mutation route
or arbitrary JSON-RPC proxy is exposed.

## Settings UI

The flow always shows Codex and GitHub Copilot rows with name/status, diagnostics
without enable switches; the row opens a searchable model dialog with supported efforts, default
marker, update time and refresh. Diagnostics is a separate subview with return
navigation. Defaults are provider, model, that model's supported effort and AI default language.
The common environment shows cwd, `AGENTS.md` and actual Litzio skills.

The existing Settings content/control widths, colors, type and shared modal
focus behavior are reused. Model results have a bounded scroll area. Both
English Light at 1440px and Korean Dark at 640px retain visible controls and
no horizontal overflow. Relative to the static mockup, the existing product
Settings shell supplies navigation; #1109 replaces explicit Save with automatic saving. Mockup
example error rows, further providers, disabled model-add decoration are not presented as functioning features. The common skill list includes the generated `litzio-guide`; this filesystem inventory does not itself prove Codex discovery.

## Verification and remaining scope

### Minimum-version check (#967, 2026-11-03)

The 0.141.0 floor is based on the required app-server contracts, not a claim
of full-flow model execution on that version. A temporary local Codex 0.141.0
installation with an auth-only temporary `CODEX_HOME` confirmed connection,
model listing and settings save using `gpt-5.5` / `low`. Its catalog did not
include `gpt-6.1-sol`; recent models can only be selected in Codex versions whose
catalog knows them. The ChatGPT account rejected the listed `gpt-5.5` with
`model_not_found`, so successful conversation execution, document tools, steering
and continuation could not be verified on 0.141.0. The first immediate steer
attempt returned `no active turn to steer`; a later instrumented attempt
recorded model rejection and failed `turn/completed` before any tool or answer
progress, so no steer-contract difference was established. A restarted Host
restored that failed conversation, but there was no tool-result card to restore.
Actual full-flow verification remains on 0.166.0, as recorded below. An older
Codex may offer no model usable by the account; the owner accepts this limitation
and defers handling until it causes a real user problem. No model workaround or
additional test scenario is introduced. Original and temporary auth-file hashes
were identical after both version checks; temporary auth files were deleted.

`provider-connections.test.ts` runs a fake Node child speaking newline JSON-RPC:
one process/initialization, UTF-8 splits, notifications, catalog pagination,
partial diagnostics, errors/timeouts/process loss and confirmed shutdown.
`ai-task.test.ts` checks real Host routes with that child, shared defaults reaching
the old worker, persistent settings and preserved receipts across changes/off.
The Host test starts the fake app-server before unregistering through HTTP and
asserts process exit while accepted exec work remains running and cancellable.
It also disables Codex with its catalog connection already closed.
The `assistant` browser scenario mocks metadata/settings responses, checks
language-switch regression, model filtering/efforts, refresh, diagnostics,
provider toggle payloads with unsaved model/effort drafts and a disconnected
catalog, automatic saving, re-entry, 640px layout and ordinary document preservation.
Browser mocks do not prove account readiness or Host persistence.

Representative captures from that same local browser run (four PNGs, about
289 KiB total; traces, generated protocol files and raw account data are not
committed):

| View | Capture |
| --- | --- |
| Settings, 1440px English Light | [Image](assets/ai-connection-931/ai-1440-light-en.png) |
| Models, 1440px English Light | [Image](assets/ai-connection-931/models-1440-light-en.png) |
| Settings, 640px Korean Dark | [Image](assets/ai-connection-931/ai-640-dark-ko.png) |
| Diagnostics, 640px Korean Dark | [Image](assets/ai-connection-931/diagnostics-640-dark-ko.png) |

Reproduce with `pnpm browser:test assistant --screenshots` against the local Host.
The earlier settings surface is recorded in [#930's capture](assets/ai-settings-930/after-ai-1440-light-en.png).

One real Codex 0.166.0 check used `gpt-6.1-sol` / `medium`, the user's existing
login and the generated cwd instructions. It returned `Litzio 연결 확인 완료`
in 12,643 ms, with eight discovered models and no diagnostic errors. Its owned
app-server closed afterward. This is connection evidence, not folder-Q&A or
document-writing verification; it is the earlier connection/settings evidence.

## Assistant panel and conversations (#931 PR 2)

The shell owns the right panel, its width and focus. The title-strip Assistant
button, command center and `Ctrl+Shift+Y` (`Cmd+Shift+Y` on macOS) open it.
IME composing/Process/229 events do not open the panel. The search remains
centered in the title strip with space reserved for the Assistant button; in a
narrow native-caption region the button keeps its accessible name and shows
only its icon. `Ctrl+Shift+A` is deliberately avoided because Chrome owns it. The assistant
and Outline share the right-side space: opening Outline replaces the assistant;
closing the assistant restores the prior Outline choice. Escape dismisses an open
model/effort chooser first, including while focus remains on its chip before
popup autofocus; a subsequent Escape closes the assistant. The assistant starts
at `--layout-assistant-width` (392px) and can be resized from 340 to 560px by
pointer or the focused separator's arrow keys. An explicit width is remembered
in origin-local preferences. Below 1100px it fills the space below the title
strip as an overlay; at the supported minimum 640px it is full width. Tab stays
inside the overlay, Escape/Close returns to the previous editing focus, and
ordinary editor state is retained. The notification center stays hidden and inert
while this modal is open. In the nonmodal layout, notifications sit to the left
of the assistant instead of over its composer (#970; see
[layout rules](editor-layout-rules-v1.md#notification-placement-beside-right-panels-970)).
The composer remains disabled until settings,
diagnostics and any conversation resumption succeed. Initial focus completes at
that point only while the panel is still open and no later focus move has occurred;
slow setup does not steal focus from a control the user selected meanwhile.
Plugin removal hides the entry and panel;
Codex being off/unavailable or needing login gives an AI Settings entry instead
of an enabled composer. The same Settings page provides Codex diagnostics.

One conversation is one persistent Codex thread. A new thread is created on its
first message with `ephemeral: false`, so it can also be resumed by ID in the
user's ordinary Codex CLI. Litzio atomically writes ID, title, folders, provider, write access and
created/updated times to `assistant/conversations.json`. Messages, results and
progress are owned by Codex. Choosing history calls `thread/resume` and pages
`thread/turns/list` with full items. Current snapshots are held only in Host
memory. A disconnected process marks active work failed and explicit resumption
reloads Codex history; no model request is automatically replayed.

### Last conversation and history list (#974)

Opening the panel returns to the last viewed conversation, including after a page
reload. Its ID is an origin-local UI preference alongside panel width; the Host
history index and its title/folders/timestamps format are unchanged. Choosing New
conversation clears that preference. Reopening dismisses the history list and
shows the conversation. If automatic resumption fails (including a missing
thread), the panel quietly starts an empty conversation with settings defaults.
Connection/login failures retain their existing Settings guidance.

History entries use a semibold title, a separate locale-formatted date/time and
short folder names with full paths in the tooltip. Quiet dividers separate rows,
as in other shell/settings lists; long titles and names wrap within the panel.
No rename/delete actions or document-path metadata are added.

The fake `assistant` browser scenario checks selected older-thread restoration,
page reload, New conversation and failed automatic resume without model turns.
Same-state Korean Dark captures: 1440px [Before](assets/assistant-history-974/before-1440.png) /
[After](assets/assistant-history-974/after-1440.png), 640px
[Before](assets/assistant-history-974/before-640.png) /
[After](assets/assistant-history-974/after-640.png).
Reproduce with `pnpm browser:test assistant --screenshots` (history captures in
`tmp/974-evidence`). Captures are manual visual evidence.

`GET /api/assistant/conversations` lists metadata; `?id=…` reads a loaded snapshot.
`POST` accepts `send`, `resume` and `interrupt` actions. These are concrete
official Assistant Host routes, not an arbitrary JSON-RPC proxy or a new UI contribution
point. The selected AI provider must be available for new conversation calls.

Each send captures the current opened folders and active document path only,
for both native and text tabs. The assistant reads saved content from disk when
needed; unsaved applied content and unapplied drafts are never injected and no
`appliedSource()` preparation runs for a conversation. This owner decision
(2026-11-04, #1106) reduces token usage and keeps document save refusal independent
of message sending. Litzio neither forces nor automatically performs Save.
When the active document has unsaved changes, the existing context row shows
“Using saved version”; its shared Tooltip explains on hover/keyboard focus that
unsaved changes are excluded. The document path remains available there.
Neither editor-engine objects nor a second Markdown implementation cross the Host
boundary. The two user-input text parts carry the message and a marked read-only
JSON context; the UI hides the context part when hydrating history. References
are restored from the same JSON context, including existing conversation history.

#1106 reproduced a real trailing Shift+Enter canonical-source refusal before the
change, then verified path-only sending in the existing fake assistant scenario.
Host protocol tests check that source fields are not forwarded; existing reference,
image and history tests remain. Small manual capture evidence (generated traces
are excluded):

| Korean view | Before | After |
| --- | --- | --- |
| 1440px Light | [Image](assets/assistant-saved-context-1106/1106-before-1440.png) | [Image](assets/assistant-saved-context-1106/1106-after-1440-light.png) |
| 640px Light | [Image](assets/assistant-saved-context-1106/1106-before-640.png) | [Image](assets/assistant-saved-context-1106/1106-after-640-light.png) |

Dark: [1440px](assets/assistant-saved-context-1106/1106-after-1440-dark.png),
[640px](assets/assistant-saved-context-1106/1106-after-640-dark.png),
[keyboard-focused explanation](assets/assistant-saved-context-1106/1106-tooltip-640-dark.png).
The context row retains its alignment and height; the 640px overlay and explanation
fit inside the viewport. The before reproduction used a longer unsaved paragraph;
after captures use a minimal trailing-hard-break fixture and fake answer.


A single nonoverlapping snapshot poll (100ms target start-to-start during running work or a pending send, 600ms after each idle read) while the tab is visible and the panel
is open or has ongoing work/input/submission observation (#1424) delivers
message deltas, tool names/statuses, plans and reasoning **summaries**. Raw
reasoning content is never included in the UI snapshot. Polling reuses the
existing JSON transport and adds no streaming infrastructure. It continues during
a pending send (#1417), pauses while the tab is hidden or setup is incomplete
or failed. Visibility restoration schedules one loop; repeated visibility events
cannot overlap an in-flight snapshot. It ignores responses after switching the
owning scope or while the tab is hidden. Closing the panel retains observation;
closed idle conversations stop polling. Running work continues
when the panel closes. Model and effort are locked while running; a submitted
message uses `turn/steer` with the expected turn ID. Stop uses `turn/interrupt`
and retains partial results. #1541 shows reasoning/tool/plan rows individually
inside the ordered answer flow. Each row starts collapsed and expands on demand.
Empty reasoning summaries have no row. A separate live phase label remains while
running even without summary events. Provider raw reasoning is not projected.

#976 verification (2026-11-03): the fake stdio lifecycle checks summary deltas,
completion replacement (including multiple summary sections), empty summaries and
history resumption without raw reasoning. Codex 0.141.0 and 0.166.0 public
`TurnStartParams` / `ReasoningSummary` schemas accept `summary: "auto"` and
reasoning items carry `summary: string[]`. The 0.166.0
[client source](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/core/src/client.rs)
conditionally requests summaries based on provider/model support; `auto` does not
guarantee returned summary text. A single real 0.166.0 `gpt-6.1-sol` / `medium`
turn through the source Host classes and this checkout's `.litzio-dev/assistant`,
with inherited login/configuration, completed with no reasoning summary events
or reasoning items, including after resumption. This establishes an upstream
no-summary case, not the original reporter's unspecified model/effort. No dropped
summary was found in the tested Litzio paths. The fix is limited to the reproduced
empty disclosure; request policy and answer rendering are unchanged.

Same-state source captures: 1440px English Light [Before](assets/reasoning-976/before-1440.png) /
[After](assets/reasoning-976/after-1440.png), 640px Korean Dark
[Before](assets/reasoning-976/before-640.png) / [After](assets/reasoning-976/after-640.png).


The composer opens individual conversation choices directly through the shared
DropdownMenu/DropdownMenuItem controls. The context ring below the input uses the latest token-usage
notification and model context window, exposes numbers on hover/focus, and
recommends a new conversation at 80%. Its Codex account/quota supplement follows
[Context account and usage](#context-account-and-usage-1446). Codex owns automatic compaction. Replies
remain text; existing-document changes are suggestions with no Apply action.

The browser scenario uses fake metadata/conversation responses to check settings
default-language persistence and absence of per-conversation language overrides, width controls,
open/close/focus (including first-open keyboard input and delayed setup without
focus theft), hidden/off/failed-setup polling suspension and nonoverlapping
visibility restoration, saved-document path context, deltas, steering, interruption,
collapsed completion, history resumption, token usage, disabled/login/missing
states and the 640px Korean Dark overlay. Headless tests run real newline RPC
against the fixture, including scope, persistent metadata, paginated history,
UTF-8, process loss and Host route admission. These mocks do not prove real
account/tool availability.

A real Codex 0.166.0 `gpt-6.1-sol`/`medium` turn plus one steering message finished
in 30,379ms. It identified the folder file's `Atlas` and the unsaved editor
context's `Hana`, and included the steering marker `STEER-931`; the disk still
contained `Mira`. The inherited Windows shell failed with
`CreateProcessAsUserW failed: 5`; the user's inherited Node MCP read the folder
file successfully. Thus this proves folder/context Q&A and steering in that
local environment, not general shell execution. A separate read-only resume
recovered the same answer, Korean language and 31,207/475,000 token usage without
a second model turn. All owned app-server processes were closed.

Representative product captures from the same automated scenario (mock data):

| State | Capture |
| --- | --- |
| Closed document view, 1440px English Light | [Image](assets/assistant-931/closed-1440-light-en.png) |
| Running/steered, 1440px English Light | [Image](assets/assistant-931/running-1440-light-en.png) |
| History, 1440px English Light | [Image](assets/assistant-931/history-1440-light-en.png) |
| Resumed/stopped, 640px Korean Dark | [Image](assets/assistant-931/assistant-640-dark-ko.png) |
| Login guidance, 640px Korean Dark | [Image](assets/assistant-931/setup-640-dark-ko.png) |

The closed/open pair shows document-space changes for this newly added panel;
it is not a historical screenshot. Compared with the static v3.1 mockup, the
existing product shell, shared select popover, native notification control and
plain-text responses supply the real controls/content. No example file links,
future providers or new-document actions are fabricated.

AI execution is not a semantic document operation, so this work adds no CLI
command. Applying existing-document changes, Docling orchestration and providers
beyond Codex/Copilot remain outside the current delivery. Copilot was added in
[#1053](#copilot-conversations-1053).


### On-demand screen context (#1500 stage 2)

Codex dynamic tools and Copilot HTTP MCP expose the same `read_screen_context` definition (empty input) to read metadata from the window that sent the admitted turn. It uses the existing conversation/window identity and visible-panel polling path, with a 10-second Host deadline charged for poll transit time. Another window cannot see or satisfy the request. Fake ACP plus an SDK MCP client verify definition parity, successful Copilot window-owned response, rejection of another window, isolation from an unrelated Codex disconnect and explicit failure without a window; no real Copilot call was made for this merge. Closed, hidden, disconnected or unresponsive windows fail explicitly; cancellation, turn end and daemon shutdown discard pending requests. Host keeps only in-flight requests, not shared screen state.

The window supplies its focused group's active tab (or null), all opened tabs and opened folders with Host identities. Tab metadata includes kind, title, Host, path/target where applicable, and unsaved flag. Kinds cover native document, text, PDF, review, comparison, staged comparison, plugin screen, plugin jobs, settings and template gallery. App-wide settings have no document Host (null). No unsaved body, selection, plugin inputs or result contents are supplied. Paths on another Host remain metadata, never an access grant. The existing per-message saved document path context remains; a null document directs the assistant to query screen metadata rather than assume a document is active.

This read is autonomous and provides no UI manipulation. It is Editor-specific tab/focus context, excluded from CLI parity under AGENTS.md and ADR-0015; no CLI command is added. Copilot MCP uses the same Host dispatch and originating-window identity; an absent window fails explicitly instead of inventing screen state. The assistant uses the existing generic tool activity surface; no new visual component or layout exception is introduced.

### Concrete screen actions (#1500 stage 3)

`close_tabs` accepts `tabIds` (one or more IDs from `read_screen_context`, or `"all"`); `open_folder` accepts `hostId` and `path`; `close_folders` accepts `folders` (Host/path pairs, or `"all"`). These provider-neutral definitions join the same Host dynamic tool array as screen reads. They only affect the sending window, never another window, and need no extra permission-mode confirmation. They are reversible Editor interactions, exempt from CLI parity under AGENTS.md / ADR-0015. No generic UI executor is provided.

The window rechecks live tab IDs, unsaved editor state and operation guards, using the existing tab-close confirmation flow. A dirty tab remains pending human confirmation; bulk close stops initiating closes after that confirmation opens. Folder actions use existing local/remote folder opening and closing functions and Host access rules; closing folders leaves document tabs intact. Screen reads include the connected remote explorers' opened roots as well as local roots.

Results contain `outcome`, `completed` targets and `remaining` targets with reasons. Outcomes are `success`, `invalid_input`, `conflict`, `forbidden`, `unavailable`, or `uncertain`; missing/busy tabs and pending unsaved confirmation are conflicts. Opening failures retain the existing path's error reason as unavailable. No persistent receipt or document write is created. Host keeps only in-flight requests, verifies conversation/window ownership, and expires requests after 10 seconds. Timeout, cancellation and lost responses are uncertain: inspect screen state before deciding a next action. The window caches replies by request ID so a lost acknowledgement cannot execute the action twice. Existing generic tool activity is the only UI surface; no layout or visual exception is added. Codex dynamic tools and Copilot HTTP MCP use the same `tools` array and `executeTool` dispatch (#1509), including all three screen actions. Both capture the admitted turn's `displayClient`; the window executes the same App handler and rechecks live targets and unsaved state, regardless of provider. ACP end/disconnect cancels only its conversations' pending actions; an unrelated Codex disconnect does not cancel Copilot actions. Fake ACP plus the SDK MCP client verify definition parity, action forwarding, originating-window isolation, conflict result preservation, absent-window classification and end-of-turn cancellation without any real Copilot call.

## Document tools (#931 implementation 2, PR 1)

The Host registers document specs, the three [template specs](#template-workflows-936-phase-3) and the two
[display-setting specs](#assistant-display-settings-1120) in `thread/start.dynamicTools` and handles
server-originated `item/tool/call` and the [structured questions](#structured-user-questions-983) added in #983; command/file approvals and MCP elicitation use the same question-card response path (#1536). Unknown extensions still return `-32601`.
The small `assistant-document-tools.ts` module validates input and invokes Core and
existing Host file reads/listing, independently of the Codex wire format. There
is no tool registry, plugin registration API, MCP server or provider abstraction.

| Tool | Input | JSON result |
| --- | --- | --- |
| `create_document` | `{path, title, blocks}` or `{path, title, operations}` or `{path, template, language?}` (mutually exclusive); operations uses shared apply-batch on an empty titled document before creation; absolute new `.md` path, title string, ordered `{type:"paragraph", text}` or `{type:"heading", level:1..6, text}` blocks; empty array allowed | `{path, source, revision, identity}` |
| `read_document` | `{path}`; absolute existing document path | `{path, source, revision}` from the existing Host read path |
| `list_documents` | `{path}`; absolute folder path | Existing one-level folder listing, retaining document and child-folder entries |

Block creation calls `createDocument`, `updateDocumentTitle`, existing insertions,
`validateStructure` and final `serialize`, followed by the common `document-create.ts` exclusive `wx` publication. Template creation delegates to the shared template operation and Core template semantics.
Text is literal Core input, not a separate Markdown assembler. Unsupported fields
or blocks fail with Core's `invalid-operation` diagnostic; Core insertion and
canonical-write errors are returned without publishing a file. No new semantic
operation or CLI command is needed: this is an AI interface to existing semantics.

| Permission | Host enforcement |
| --- | --- |
| `permissionMode` | Captured at turn start; `read-only` refuses creation |
| Opened folders / Read-only | Pinned `RootAccess`; outside paths return a concrete instruction to open the folder or select Full access |
| Full access | Host tools may access outside opened folders; Host operator Roots still apply |
| Host operator Roots | Existing `accessPath` checks, in addition to the turn boundary |
| Symlink escape/root replacement | Existing pinned Root identity and real-path checks |
| Existing file | Exclusive create, never overwrite |
| Steering/stale calls | Steering retains scope; thread/active turn IDs must match; completion and disconnect revoke scope |

The reply is `{contentItems:[{type:"inputText",text:JSON.stringify(result)}],success}`.
Failures return the same shape with `success:false` and `{error}` JSON text.
Codex stores the dynamic item. The Host snapshot retains `toolResult.success` and
small `toolResult.contentItems`, including the JSON path/revision/identity, on live notifications
and history hydration. Results over 16 KiB are represented by omitted/byte-count metadata;
creation receipts retain path/revision/identity for Open/Undo. This is a display projection,
not a change to model-facing results or provider history. The transport boundary also projects
already-loaded conversations for GET, resume, send and submission lookup; the 8 MiB response
limit remains unchanged. The existing progress view shows tool name and completion
or failure. The result cards and guarded undo below consume these receipts.

Codex **0.166.0** generated `ThreadResumeParams` has no `dynamicTools` field.
Litzio never sends it on resume. A real local test created `Hello.md` using
`create_document`, closed the owned app-server, resumed from a new process,
recovered the identical creation receipt and successfully invoked `read_document`
in a subsequent turn without re-registration. Thus tools registered at thread
creation persist for that thread in this version. Old threads created without
these tools are not retrofitted; start a new conversation to acquire them.
Terminal Codex CLI does not provide a Litzio tool handler. The owner chose CLI
usage guidance through a Litzio skill instead; the generated `litzio-guide` supplies that guidance.

Local evidence (2026-11-02): Codex 0.166.0, `gpt-6.1-sol`/`medium`, temporary
Host cwd and document folder, inherited user login. Creation and resumed reading
both completed using only the named dynamic tool, without shell/MCP calls.
`litzio check Hello.md` reported `structure valid` and `writeability ok`;
creation and read revision were
`0eb1d90f95a8a0f17517fe0aaca08d8217c082a333da01dc4f7b0172a79ca2dc`.
Both owned processes closed. User Codex configuration and the shared installation
folder were not modified by Litzio. Codex itself persists ordinary thread history.
Fixture tests cover success, read-only/outside/overwrite/symlink/unsupported-block
refusal, stale turn rejection, steering scope, unsupported server requests and
receipt recovery after a fresh process. Browser mocks verify tool progress only;
they are not proof of real execution.


## Assistant display settings (#1120)

Codex threads created with this version register two additional fixed functions:
`read_display_settings({})` and `change_display_settings({changes})`. The sole
allowlist is `shared/assistant-display.ts`: `theme` (light/dark), `uiLanguage`
(ko/en), `documentWidth` (standard/wide), and `pageBackground` (paper/flat).
Unknown keys/values and extra tool arguments fail before a screen request is made.
AI permissions/provider/model, plugins, navigation, document content and front
matter are excluded. Document write scope is unchanged; these appearance-only
operations also work in read-only turns and without opened folders. They add no
Core semantic operation, CLI command, MCP server, registry or public Plugin API.
Copilot uses the same Host display handler when sent from a Litzio window; terminal sessions have no originating window. Start a new Codex
conversation to acquire the added specs; existing thread registrations are not
retrofitted.

Generated AGENTS.md directs requested display changes without an extra proposal or permission step (Refs #1542). The fixed Host allowlist is enforced independently. The tool description still carries the former proposal wording until #1542 updates that surface.

`AgentDisplayRequests` owns provider-neutral validation, volatile pending requests
and change receipts. Codex's `item/tool/call` is only its current adapter. The
Host never reads browser storage or writes a settings file. Each send supplies
an in-memory window ID generated with `crypto.getRandomValues` (also available
on non-localhost HTTP); a new turn pins that ID, and steering retains it. The
existing nonoverlapping visible-panel snapshot poll supplies this ID and
receives only its pending `displayRequest`. A `display-result` action returns
validated live before/after values and any application/storage failure. A
missing originating ID refuses immediately. A closed/hidden panel, hidden tab,
lost connection or lost acknowledgement expires after 10 seconds with an
**unconfirmed** result; it never reports success. The Host uses its monotonic
clock for the deadline and acknowledgement check. Each snapshot carries only
the remaining duration, `validForMs`, rather than an absolute wall-clock time.
The screen records `performance.now()` before starting the poll and checks the
elapsed time against that duration both on receipt and immediately before
applying. Charging the entire round trip conservatively includes network delay
and queued screen work; starting a new lifetime on receipt would revive delayed
snapshots. Neither machine compares the other machine's clock origin. A slow
round trip can refuse early, but cannot extend the Host deadline. Interruption,
turn completion, disconnection and Host shutdown
cancel pending work. Application and acknowledgement are not atomic: a timeout
or cancellation can follow a live change, so the error advises inspecting the
window before another explicit request. No automatic tool retry occurs. Within
a mounted screen, repeated snapshots retransmit a cached reply without applying
the same request again.

Multiple windows/tabs never compete to claim a request: only the window that
sent the original turn can apply it or undo its receipt. A later turn can use a
different sending window; steering cannot transfer an in-flight turn. Reload
creates a new window ID; previous pending work and Undo cannot transfer to it.
Only the target window's live display changes. Existing origin-localStorage
sharing remains: other windows can read the saved defaults on their next load,
but their live React/DOM state is not broadcast or overwritten.

The screen uses existing preference writers, theme/language APIs and shell width
state, independently of document Save/history. The live choice remains usable
when storage is unavailable, as with manual Settings, but the tool returns
`success:false` and the actual before/after values with a persistence error.
Successful reads return the current four values. Changes return
`{requestId,before,after,changed,error?}` in the existing dynamic-tool receipt;
Codex retains it for history. A no-op has no change card. Changed values (including
partially applied failures) use the existing assistant-result card and shared
outline Button, with localized before → after labels and Undo. UI language
names use the same native 한국어 / English labels as Settings. No new surface,
control variant or destructive styling is needed for a display preference.

`display-undo` looks up the Host's receipt instead of trusting browser-provided
old values, then sends an inverse request to that same window. It compares only
the changed keys against their recorded after values; later manual or assistant
changes to those keys refuse Undo, while unrelated choices remain intact. A
successful Undo is consumed in Host memory. Receipts/cards survive in Codex
history, but Undo capability and its UI marker are volatile: after Host restart
or page reload a retained card's Undo reports unavailable. This action is
separate from document Undo. Failures leave a retryable action and show the
reason in the panel.

Verification reuses the existing fake app-server child and HTTP Host tests for
registration, read/change receipts, denied settings and another window's reply,
request expiry/cancellation and guarded inverse requests. The existing `recovery`
browser case disables secure-context-only `randomUUID` and protects application
startup when that API is absent; its assertions are unchanged. An existing `assistant`
browser case exercises the actual poll → live settings → acknowledgement path,
card and Undo, Settings reflection, manual-change conflict, document-draft
preservation and no AI-settings write. It adds no subprocess, exhaustive matrix,
real model call, runner retry or timeout override. Captures are opt-in manual
visual evidence from `pnpm browser:test assistant --screenshots` under
`tmp/1120-evidence` at 1440px and 640px (Korean Dark after application); generated
large generated artifacts are not committed.

Same-state Korean Dark visual evidence (fixed fake conversation/receipt, no model
call): 1440px [Before](assets/assistant-display-1120/before-1440.png) /
[After](assets/assistant-display-1120/after-1440.png), 640px
[Before](assets/assistant-display-1120/before-640.png) /
[After](assets/assistant-display-1120/after-640.png). Before uses the pre-change
AssistantPanel from the branch base; After uses this implementation. Both use
the same stored display preferences, document and conversation data. The manual
capture-only fixture was temporary and is not part of CI.

## Template workflows (#936 phase 3)

Since #1128, templates use the shared Host operations in
[Document templates](document-templates-v1.md#shared-host-operations-and-assistant-1128).
`list_templates({language?})`, `read_template({template,language?})` and
`save_template({name,from,description?})` are registered alongside the existing
functions. `create_document({path,template,language?})` is an alternative to its
title/blocks form. It yields the same structured creation receipt and result card,
with guarded Undo. Start a new conversation for the added tool specifications.

List/read use the Host's fixed catalog and need no opened folders. Save/create
require the captured turn's write access and pinned folder/Host Root checks for
the source/destination document. Save writes only the app-owned template directory,
so opened-folder shell access to that directory is unnecessary. A template is not
applied to an existing document; its original and source document remain intact.

`litzio-guide` requires a fresh template lookup, selection within the creation request and direct application without extra consent (Refs #1542). Missing named templates never silently fall back. Save uses name/source and optional description, asks only for missing information, uses the saved disk version, then reads back and refreshes the catalog. Unsaved content must be saved first if intended. Both providers expose the same Host template tools.

CLI instructions now serve terminal continuation. Before Codex launch the Host
prepends a private `<assistant cwd>/bin/<CLI identity>` launcher for its own CLI to the child PATH,
without changing Host/system/user PATH or optional Desktop CLI integration.
Source, distributed HTTP and packaged Desktop resolve their own runtime/CLI and
retain source versus installed catalog classification. Desktop supplies its
bundled CLI location explicitly and uses Electron RunAsNode only in the CLI
launcher. This is function reuse, not a live CLI connection or shared editing state.

The existing fake app-server test verifies registration, input/scope refusals,
app-owned saving, template receipt history/resume and a real CLI read from the
fake Codex child's PATH. Core/CLI/HTTP tests own document semantics and adapter
behavior; `assistant-result` uses an actual template creation receipt for the existing
Open/guarded Undo path. No real model call is made for #1128.

## Created-document results and undo (#931 implementation 2, PR 2)

Successful structured `create_document` results supply each card's path and creation
revision and file identity (bigint dev/ino/birthtimeMs serialized as strings). Assistant prose, failed calls and other tools never create actionable cards.
Cards show the filename first (#1029). Distinct result paths in the conversation
with the same filename use only the distinguishing relative location within the
currently opened folder. Separate roots with identical relative locations include
the root location as needed; paths outside opened folders use a distinguishing
path suffix. Repeated receipts for the same path do not add location noise.
The full original path remains the focusable filename's accessible name and is
available through the shared Tooltip on hover or keyboard focus. Status, Open,
Undo and the deletion warning retain their existing behavior. This display-only
change adds no Core operation or CLI command.

Cards remain visible after Codex history resumption. Open uses the existing tab-opening
flow. Undo deletes the created file, as stated beside its controls; it never reruns
creation after interruption, disconnection or an ambiguous response.

| Current state | Undo behavior |
| --- | --- |
| Same created file, disk matches creation revision, no unsaved tabs or recovery records | Delete without confirmation |
| Changed disk revision, unsaved tab changes or retained recovery records | Ask once; Cancel preserves file, drafts and recovery records |
| Disk, tabs or recovery records changed again after the check/confirmation | Refuse; user must review and explicitly try again |
| File replaced, missing, identity absent or outside currently opened folders / Host Roots | Refuse and show the error |

Undo reuses `/api/file` and the existing `deleteFile` path. A nonmutating `checkOnly`
request returns the current revision and identity after the same scope checks. Creation
captures identity from the exclusive creation file descriptor. Both check and final
delete carry the creation identity as `expectedIdentity`; even an identical-content
replacement is refused. The final delete also carries the checked revision as
`expectedRevision`, checked immediately before removal.
Existing callers without a revision keep their behavior. File identity, symlink and
Root checks remain in force; Desktop retains its existing Trash callback.
The shell blocks document input during this operation, compares the open tab snapshot
and all retained recovery records again after confirmation, immediately before deletion.
Cancel preserves the records. Cleanup compares the checked recovery records inside its
existing IndexedDB transaction: records arriving or changing during the Host request
are preserved and reported, even if disk deletion has already completed. Ordinary
Explorer deletion retains its existing behavior. No new recovery or undo store is added.
The card captures its keyboard trigger before disabling it and restores focus after
pending clears (to the surviving card after deletion).
There is no undo journal or new persistence layer. A deleted receipt remains historical;
a fresh page may offer Undo again, which refuses a missing file.

The product-owned guide explains opening files/folders, Read/Edit/Source,
Settings and the assistant document/template tools. Terminal continuation uses existing `litzio`
create, inspect, apply-batch and check commands; it does not promise dynamic-tool
handlers in terminal Codex. Environment diagnostics list local skill names without
starting Codex. Runtime discovery is separately verified using
`skills/list({cwds:[cwd], forceReload:true})`.

AI UI execution and file deletion add no document semantic operation, so no new CLI
command is added. Existing Core/CLI semantics remain unchanged.

Verification on 2026-11-02: targeted file-operation, connection and browser-fixture
checks pass. The `assistant-result` browser scenario uses synthetic conversation receipts
with real Host files/deletion: card open, history resumption, immediate clean undo,
unsaved-tab confirmation/Cancel/discard, and changed-disk confirmation.

A separate local browser run used real Codex 0.166.0 (`gpt-6.1-sol`, medium): a Korean
request created `live-created.md` with the dynamic tool, the card opened its content,
and card Undo deleted it, verified by the Host read failing afterward. The test used
a temporary `CODEX_HOME` and externally supplied in-memory authentication; no auth
file was copied and neither shared `.litzio` nor user `~/.codex` was written.
`skills/list({cwds:[cwd], forceReload:true})` found `litzio-guide`, enabled, at the
generated `.agents/skills/litzio-guide/SKILL.md` path. The owned Codex process closed.

| Capture | Evidence |
| --- | --- |
| 1440px English Light | [Cards](assets/assistant-results-931/result-1440-light-en.png) |
| 1440px Korean Dark | [Cards](assets/assistant-results-931/result-1440-dark-ko.png) |
| 640px Korean Dark | [Cards](assets/assistant-results-931/result-640-dark-ko.png) |
| Real Codex creation | [Opened result](assets/assistant-results-931/real-created.png) |
| Real Codex undo | [Deleted result](assets/assistant-results-931/real-undone.png) |

Compared with v3.1 mockup 03, the product uses its existing shell and shared button
styles, shows the full Host path rather than a sample relative folder, and keeps
actual dynamic-tool progress rather than fabricated CLI steps. The creation card
retains file/open/undo/delete explanation. Korean lines and long paths wrap within
the supported 640px overlay; the transcript scrolls independently of the composer.

Review corrections (PR #960): the original head reproduced both missing confirmation
for un-restored recovery work after reload/resume and deletion of a same-byte replacement.
Regression coverage now checks reload/Not now/history/Cancel preservation, changes to
recovery work while confirming, transactional preservation of late recovery work,
identity replacement before check and final deletion, and keyboard Escape focus return.
The previous real-Codex captures above predate these review corrections; identity receipt
transport is additionally covered by the fake stdio creation/history tests.

The review fix passed 409 Editor tests, workspace typecheck, Editor build and docs checks.
The `assistant-result`, `recovery-storage`, `file-actions` and `assistant` browser regressions
cover the corrected guards. A local HMR module-instance mismatch in the existing
file-actions test was diagnosed from the timestamped recovery-storage import; a clean
Vite start retains the original assertions. Confirmation text explicitly names recovery
records: [1440px English](assets/assistant-results-931/confirm-review-1440.png) and
[640px Korean Dark](assets/assistant-results-931/confirm-review-640.png).

UI-owned reasoning-effort labels, MCP connection/authentication states and token units follow the display language, including official settings rendering. Provider model names, descriptions, IDs and diagnostic payloads remain provider data. Translated labels retain the original option values and do not change the selected response language.

#975 source captures (1440px Light English / 640px Dark Korean):

- ai-1440-light-en.png: [Before](assets/ko-text-975/before-ai-1440-light-en.png) / [After](assets/ko-text-975/after-ai-1440-light-en.png).
- ai-640-dark-ko.png: [Before](assets/ko-text-975/before-ai-640-dark-ko.png) / [After](assets/ko-text-975/after-ai-640-dark-ko.png).

Assistant: [1440px](assets/ko-text-975/after-running-1440-light-en.png), [640px Korean](assets/ko-text-975/after-assistant-640-dark-ko.png). Conversation content and selected response language are preserved.

## Assistant answer display and copy (#982)

Assistant messages use the existing plain Markdown display parser (markdown-it,
dollar math and KaTeX), without Core admission or serialization.
Assistant-only texmath brackets (#1098) render `\( … \)` inline and `\[ … \]`
as display math through the same dollar-math KaTeX renderer and styles. Inline,
fenced and indented code remain literal. Ordinary Markdown reading is unchanged. The same renderer
receives accumulated source during polling, on completion and after history resume.
Incomplete fences/math remain library input; invalid math exposes its source.
Raw HTML stays escaped text. Images show their alternative text without fetching;
Mermaid stays code and syntax highlighting is not enabled. HTTP(S) links use the
existing external opening path, other destinations do not navigate, and footnote
anchors are scoped to each mounted answer.

Copy answer writes the original Markdown of all assistant messages in that turn,
in their existing order, joined with two LF characters between messages (#1048,
#1051). It excludes user messages, work details and result receipts. The single
turn action follows answers, result cards and status/error text; while streaming
it copies the accumulated answer so far. Turns without nonblank answer text offer
no answer action. Copy code still writes only that code block's text. Shared
CopyButton uses the existing ghost/icon-sm Button and Tooltip for the turn action;
code blocks retain their text button. The action is always visible, has an
accessible name, keyboard focus ring and hover/focus tooltip. Success changes the
icon to Check and announces Copied; clipboard failures remain local alerts. Long
code, tables and display math scroll within the answer. Progress, polling and Codex history ownership are unchanged.
This is interface display only and adds no semantic operation or CLI command.
Shared CopyButton also supports browsers without Clipboard API access (for example,
non-local HTTP) via the temporary-textarea browser copy fallback defined in
[Code body copy](document-editing-v1.md#code-body-copy-991) (#1049). If both paths
fail, the existing local manual-copy alert remains.

#1098 visual verification: the fixed `assistant` response was captured through
`pnpm browser:test assistant --screenshots` before/after enabling bracket math.
[1440 Light before](assets/assistant-bracket-math-1098/before-1440-light.png) /
[after](assets/assistant-bracket-math-1098/after-1440-light.png),
[640 Korean Dark before](assets/assistant-bracket-math-1098/before-640-dark.png) /
[after](assets/assistant-bracket-math-1098/after-640-dark.png).
Existing answer layout, copy controls, wrapping and internal overflow are retained;
no new surface or control exception is introduced. The renderer unit test owns
syntax/code/plain-reading boundaries; the existing browser scenario checks rendered
bracket math, original-source clipboard readback and history with no model call.

Verification: `plain-markdown.test.ts` covers escaped HTML, refused image loads and
unsafe links, isolated footnote IDs, cumulative incomplete syntax and invalid math.
The fake `assistant` browser scenario covers streaming completion, rendered history,
original-answer/code clipboard readback (OS newline normalization only), external
opening and unchanged ordinary-document editing. No real model turn is used.
`layout-rules` and `quiet-document` also passed. The same fake response supplies
these Korean Light/Dark captures; scroll position differs with rendered height.
The bottom captures expose math, links and copy controls below the long table.

| View | Before | After | After, bottom |
| --- | --- | --- | --- |
| 1440 Light | [Image](assets/assistant-markdown-982/before-1440-light.png) | [Image](assets/assistant-markdown-982/after-1440-light.png) | [Image](assets/assistant-markdown-982/after-1440-light-bottom.png) |
| 1440 Dark | [Image](assets/assistant-markdown-982/before-1440-dark.png) | [Image](assets/assistant-markdown-982/after-1440-dark.png) | [Image](assets/assistant-markdown-982/after-1440-dark-bottom.png) |
| 640 Light | [Image](assets/assistant-markdown-982/before-640-light.png) | [Image](assets/assistant-markdown-982/after-640-light.png) | [Image](assets/assistant-markdown-982/after-640-light-bottom.png) |
| 640 Dark | [Image](assets/assistant-markdown-982/before-640-dark.png) | [Image](assets/assistant-markdown-982/after-640-dark.png) | [Image](assets/assistant-markdown-982/after-640-dark-bottom.png) |

The shared Recovery copy control supplies the compact-button/Copied feedback pattern.
Visual inspection checked control padding/centering, Korean wrapping, theme contrast
and transcript/composer separation. Code, tables and math remain locally scrollable.
Reproduce after captures with `pnpm browser:test assistant --screenshots`; traces and
runtime fixture files are intentionally not committed.


After captures were refreshed after merging #979; its Korean effort labels are
preserved. Before captures retain the original pre-#979 base. The integrated
`assistant --screenshots` scenario passed with both localization and Markdown checks.


### Message roles and turn actions (#1048, #1051)

User messages are right-aligned, content-sized bubbles capped at 85% of the
transcript width, using surface-subtle, radius-md and existing spacing tokens.
Assistant answers remain left-aligned Markdown prose without a bubble. Named
`Your message` / `Assistant response` groups expose the distinction to assistive
technology. Work disclosure, plan content, result cards (#1029) and code copy
(#991) retain their own actions; the turn copy sits after the complete turn.
This remains interface display only, with no Core operation or CLI addition.

Manual review: Windows persistent Chrome, Korean, 100% zoom, same fixture and
1000px height. Each view includes a user message, two assistant messages, collapsed
work/plan details and a creation result. The manual capture body was removed from
the automatic scenario. Checked bubble alignment/width, prose/action distinction,
card controls, contrast and clipping at both widths.

| View | Before | After |
| --- | --- | --- |
| 1440px Light Korean | [Before](assets/assistant-roles-1051/before-1440-light-ko.png) | [After](assets/assistant-roles-1051/after-1440-light-ko.png) |
| 640px Dark Korean | [Before](assets/assistant-roles-1051/before-640-dark-ko.png) | [After](assets/assistant-roles-1051/after-640-dark-ko.png) |

Test design: extend the existing `assistant` fixture scenario, without real Codex
calls or a new scenario/matrix. Its original single-answer/code clipboard and
history checks remain. The added split-answer case protects named role groups,
one action after all turn content, keyboard Tab/Enter and focus tooltip, and the
joined original Markdown clipboard value. CSS geometry is visually reviewed rather
than asserting fixed pixel positions. Shared Editor tests/typecheck/build and
layout-rules/quiet-document protect integration and existing visual constraints.

## Structured user questions (#983)

Host supports `item/tool/requestUserInput` alongside the existing document tool
calls. The assistant shows a separate question form with radio choices, an explicit
Other field when `isOther` is true, and masked free text for `isSecret`. Ordinary
answer text is never interpreted as interactive choices. Submission sends the
original JSON-RPC id and `{answers: {questionId: {answers: [value]}}}`.
Question IDs are opaque keys, including `constructor` and `__proto__`: UI state
uses Maps and Host accepts only own question keys and own `answers` fields.

A blocking question belongs to one thread, turn and RPC id. Since #1443 its
question/answer interaction is also retained in the conversation index (secret
answers are masked there); provider message content remains provider-owned.
The pending RPC callback remains live-memory only and survives polling and panel
closure. Host consumes it before replying, rejects duplicate/stale submissions,
and expires the blocking request on `serverRequest/resolved`, turn completion/failure,
interruption or disconnection. History retains the question and its answer or
expiry. Async questions follow the [#1443 contract](#async-questions-and-answer-history-1443).
The form locks while submitting. Approval requests and MCP elicitation now follow
the same blocking-card lifecycle (#1536); restricted modes use `on-request`.

The child starts with `app-server -c features.default_mode_request_user_input=true`.
This is a process-only config override and does not write the user's Codex config.
Official [config overrides](https://developers.openai.com/codex/config-advanced/)
and the pinned [0.166.0 feature definition](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/features/src/lib.rs)
confirm the flag and its false default. The same flag exists in
[0.141.0](https://github.com/openai/codex/blob/rust-v0.141.0/codex-rs/features/src/lib.rs);
question execution on that version is unverified and questions may not arrive.
This is conversation interaction, not a document semantic operation. #1443 adds
explicit-Host CLI conversation read/resume and answer through the same operations;
Question acceptance requires persistence, without a render acknowledgement. No approval queue or new
provider interface is introduced.


Verification: the stdio fixture checks string and zero-valued numeric RPC ids,
exactly one response, invalid/stale answers and all expiration paths. The existing
`assistant` browser scenario covers selection, Other input, password masking,
polling, panel reopening and expiry, including `constructor` choice/Other
submissions and `__proto__` free text. The Host fixture also rejects inherited
answer keys/values. These regressions failed before the #994 review fix. A real source-run Codex 0.166.0 turn using
`gpt-6.1-sol` / `medium`, existing user login/config and this checkout's
`.litzio-dev/assistant` emitted request id `0`; Host replied with the selected
Blue option and the turn completed with `Blue`. The owned child was closed.

Visual evidence (shared Button and settings input patterns; no answer/progress
renderer changes):

| View | Before | After |
| --- | --- | --- |
| 1440px Light English | [Before](assets/assistant-questions-983/before-1440.png) | [After](assets/assistant-questions-983/after-1440.png) |
| 640px Dark Korean | [Before](assets/assistant-questions-983/before-640.png) | [After](assets/assistant-questions-983/after-640.png) |

Reproduce with `pnpm browser:test assistant --screenshots`. The question form
scrolls inside the transcript above the composer; controls, padding, Korean
wrapping and viewport bounds were visually inspected. Runtime traces are omitted.


#994 CI follow-up: `assistant` now holds its own recovery deletion through the
post-Save page reload after confirming both the committed dirty record and saved
disk text. This reproduced the CI failure before any question card or conversation
polling starts: the old recovery record excluded the remembered document from
startup restoration. Clean Save cleanup now uses the existing synchronous,
generation-bound acknowledgement ([Save contract](editing-session-save-v1.md#local-recovery-records-296-pr2)).
Question RPC arguments, focus and input handling are unchanged. The browser scenario
retains its original text assertion and also checks that no obsolete recovery prompt
appears; the storage scenario checks other-session and newer-edit preservation.


## Compact result paths (#1029)

Manual fixture captures, Korean, 100% zoom, 1000px height:

| View | Before | After |
| --- | --- | --- |
| 1440px Dark | [Before](assets/assistant-paths-1029/before-1440-dark-ko.png) | [After](assets/assistant-paths-1029/after-1440-dark-ko.png) |
| 640px Light | — | [After](assets/assistant-paths-1029/after-640-light-ko.png) |

The existing shell panel, card tokens, compact Button variants and shared Tooltip
are reused (as with the context-usage indicator and document draft indicator).
No new surface or control variant is introduced. The narrow panel retains its
existing overlay behavior. Visual review checks wrapping, status/action prominence,
warning visibility and transcript/composer separation.

Test design: extend the existing `assistant-result` browser scenario for full-path
accessible names, keyboard Tooltip display and two synthetic same-name receipts
in different relative directories. Existing real Host Open/undo/confirmation
checks remain the integration protection; no real Codex run, new subprocess or
new scenario is added. Captures run only with `--screenshots` for manual review.


## File references (#1047 PR A, #984, #952)

Explorer's file context menu **Add to chat** opens the composer draft on the
file's Host (#1253). Folders cannot be added. Paths are deduplicated and at most
10 file references are allowed. A conversation fixed to another Host rejects the
handoff without replacing its draft; start a conversation on the file's Host first.
`@` is ordinary message text and never starts folder enumeration or file search.
The `/` Codex skill picker retains candidates, scroll position and highlighted
item across unrelated shell renders and conversation snapshots (#1108). Arrow
keys / Enter select, Escape dismisses, and pointer selection retains composer focus.

#1253 verification (2026-11-06): existing `assistant` and `multi-host` persistent
Chrome scenarios cover ordinary `@` text without folder queries, explicit local/remote
attachment, Host mismatch rejection and remote send rejection preserving text/chips.
Existing provider tests own limit/deduplication/RootAccess/hidden/deleted/symlink checks.
These are HTTP fixtures and fake providers, not real OneDrive or remote OS acceptance.
Historical integration with #1301/#1306 (2026-11-06) preserved the ordinary Send view-tool
route and removal of dedicated generation buttons, Copilot model/effort rejection
recovery without automatic retry, and this Host-bound reference draft. Existing
`assistant`, `multi-host` and production-HTTP `generated-views` scenarios cover the
combined paths; provider/Host unit tests retain the lower-layer checks. These are
synthetic provider/HTTP checks, not proof of actual model answer delivery or
OneDrive performance. The earlier #1181 live-probe limitations remain unchanged.

Manual composer captures: 1440px English Light
[Before](assets/explicit-references-1253/before-1440.png) /
[After](assets/explicit-references-1253/after-1440.png), 640px Korean Dark
[Before](assets/explicit-references-1253/before-640.png) /
[After](assets/explicit-references-1253/after-640.png).
The baseline panel was temporarily restored for Before; both sides use the same
local Explorer attachment and `@document` draft. The capture fixture supplies only
synthetic Hosts (`Local`/`Remote`), account (`demo-user`), paths
(`C:/demo/notes/document.txt`), saved text and model (`Demo model`). No mask hides
product controls, Explorer or Host context; no real model or remote machine is used.

Explicit remote Explorer handoff, using the unchanged product ContextMenu and chip:

| Width / theme | File context menu | Attached result |
| --- | --- | --- |
| 1440px English Light | [Add to chat](assets/explicit-references-1253/remote-menu-1440.png) | [Remote chip](assets/explicit-references-1253/remote-result-1440.png) |
| 640px Korean Dark | [채팅에 추가](assets/explicit-references-1253/remote-menu-640.png) | [Remote chip](assets/explicit-references-1253/remote-result-640.png) |

Capture uses a temporary synthetic scenario through `pnpm browser:test assistant --screenshots`,
then restores the regression body and current panel source. The shortened run intentionally
omits the normal scenario's expected HTTP failures, so it is manual visual evidence,
not a passing regression run. No capture-only CI loop is added.
Visual inspection checks chip/remove-control alignment, input padding, readable Korean,
Explorer menu placement and panel/control clipping at both widths. The candidate row
disappears; the existing skill picker, Explorer menu and chip presentation are unchanged.
The eight images linked here replace the earlier masked images at the current branch
surface. This does not establish deletion from earlier commits or external caches.
These captures precede integration of #1306: the dedicated Generate view button
visible in them is removed in the integrated UI; the approved Explorer/Host attachment
layout remains unchanged. Current ordinary-Send view behavior follows the
[current removal contract](#비서-뷰-기능-제거-1341-2026-11-09).

Removable chips above the input show only file names; shared Tooltip exposes the
full path on hover/focus. No file-type-specific presentation or read indicator is
used. New conversation clears the draft. Sending snapshots the draft into a message row; confirmed rejection retains that row with explicit Retry (see #1417 below). A reference-only
message is valid, including steering an active turn.

Host checks both opened-folder RootAccess and its own access policy. Each relative
path segment must appear in Explorer's current listing: hidden entries, symlinks,
directories, unavailable files and paths outside opened folders are rejected.
Checks run again immediately before submission. All files, including `.md` and
`.txt`, remain path descriptors in `references:[{path,name,kind}]` in the existing
`Litzio read-only context (JSON)` text. PNG/JPEG/WebP/GIF additionally send
`{type:"localImage",path}`. No file content conversion or upload store is added.
The active document is likewise supplied only as a path; the assistant reads its saved file when needed (#1106).
References do not extend document-editing permissions or a running turn's scope.

The public conversation input takes `references?: string[]`; user items expose
`references?: AssistantFileReference[]`. Both live `itemFrom` and paginated resumed history
restore chips from context JSON, including Codex legacy history that concatenates text inputs into one string, without a second transcript store. Historical
chips remain path metadata if files move or disappear; they do not resend files.
This is shell/Host context, not document semantics, so no Core/CLI operation is added.
The `/` skill picker is a separate PR B and remains outside this delivery.

Verification extends existing fake stdio/Host tests for context + localImage,
send/steer/live/resume, reference-only sends, duplicate/limit, deleted/hidden files
and scope rejection. The existing `assistant` browser scenario owns Explorer →
composer, no folder lookup on `@`, deduplication/removal, reference-only steer,
chip restoration, and no conversation-language control. Worker prompt tests own
language injection; receipt tests retain retry identity after settings changes.
No real model turn or new browser process framework is used.

Manual visuals use the same persistent Chrome runner separately from normal tests:
1440×1000 Light/English and 640×1000 Dark/Korean, Plum, 100% zoom.
[1440 Before](assets/assistant-references-1047/before-1440-light-en.png) /
[1440 After](assets/assistant-references-1047/after-1440-light-en.png),
[640 Before](assets/assistant-references-1047/before-640-dark-ko.png) /
[640 After](assets/assistant-references-1047/after-640-dark-ko.png).
Shared ContextMenu, Button, Tooltip and existing shell tokens are reused; candidate
listbox keyboard ownership is local to the composer. No new plugin UI surface.

Visual inspection: file names, remove buttons, text input and model/effort control remain visible at both widths, with no horizontal overflow. Dark/Korean retains legible chip borders and close controls. The 1440 After also includes the extra reference-only steering message used to verify the feature; the document and assistant width are unchanged.

Protocol evidence: [0.141.0 UserMessageItem::message](https://github.com/openai/codex/blob/rust-v0.141.0/codex-rs/protocol/src/items.rs#L269) concatenates input text, and [thread history](https://github.com/openai/codex/blob/rust-v0.141.0/codex-rs/app-server-protocol/src/protocol/thread_history.rs#L1107) returns it as one text input. The fake paginated history models this shape; live notifications retain separate inputs.

## Copilot conversations (#1053)

- Authority: owner-approved #1053 addition to ADR-0014, 2026-11-03.
- Verification: fake ACP child covers initialize, model catalog, streamed turn,
  cancellation, read-only/opened-folder permission responses and failed prompt.
  #1091 additionally checks Auto, CLI/config effort, Agent/Plan, full access and
  preserved restricted permission paths. One real Copilot 1.0.105 initialize/catalog
  session returned duplicate Auto models, Agent/Plan/Autopilot and allow_all=off,
  without a thought-level config. No prompt/model call was made. Actual model
  execution and permissions remain owner checks.

The Default AI provider select offers both supported providers. Changing it fetches that
provider's catalog and automatically saves the first available model/effort.
Host validates changed model/effort against the provider's current response. Copilot's catalog is
`session/new.models.availableModels`, deduplicated by ID retaining the first entry.
If absent, `auto` is prepended as **Auto**, **Let Copilot pick the best model**, matching
Copilot/Paseo's returned catalog. One no-prompt
catalog session is reused per connection. Connected means transport/session
readiness only, not confirmed login, model entitlement or available quota.
Login stays in the user's Copilot CLI. Account/rate-limit/MCP diagnostics are
Codex-only. Disable/unregister/Host shutdown closes both owned CLI connections.
Saving a provider switch closes the old connections; active work is disconnected
and is never replayed. A successful AI-settings PUT also refreshes an already
open assistant through the official AI HTTP transport. The panel
rereads settings/catalog/diagnostics; when provider changes it drops the old
conversation, running/pending state, remembered selection and composer selections,
then uses the new provider's defaults for a fresh conversation. Late old-provider
poll/send responses cannot restore discarded state. Refreshing settings does not
autofocus the assistant input. Same-provider saves refresh configuration without discarding the current conversation or its
model/effort overrides. Failed saves do not refresh the panel. No public Plugin
API, event bus or provider framework is added.

Copilot uses `copilot --acp` with the user's environment and the same Litzio-owned
cwd/AGENTS.md. The official ACP SDK owns NDJSON framing and request dispatch.
The advertised model config option selects a returned model through
`session/set_config_option` before `session/prompt`; its complete response replaces
the conversation's options. Legacy sessions without a model config option use
`session/set_model` and its config updates.
`session/update` text/thought/tool updates feed existing panel snapshots. Prompt
errors and disconnection mark a turn failed. Stop sends `session/cancel`;
a second message waits until the current turn ends (no steering emulation).
Request failures during initialization, catalog/session creation and session setup
preserve ACP's string `message` as an Error for the existing Host error response,
rather than displaying `[object Object]`. Provider error `data` is not serialized.
Provider-tagged conversation indexes are filtered to the selected provider.
Codex `/` skill selection and `skills/list` remain Codex-only; Copilot does not
query that catalog or send Codex skill inputs.
`session/load`, when advertised, replays provider-owned history; otherwise
resumption reports an explicit error and a new conversation remains available.

The user message includes product instructions, opened-folder paths, the active
document path and validated reference paths. It reads saved file content on demand;
unsaved native/text editor content is excluded (#1106). Copilot receives image
references as paths, without Codex localImage inputs. Native Copilot tools may
read references. Copilot receives the same Host tool definitions and dispatch as Codex through HTTP MCP (#1500); Codex skill selection remains unavailable. Existing-document editing uses pending copies as described below; the CLI write path still requires Copilot full-access until the Host copy-edit tools land. The settings hide Codex skills and diagnostics. No context limit is inferred when ACP does not report one.

### Copilot Host tools over HTTP MCP (#1500)

The existing daemon HTTP listener serves `/api/assistant/mcp/<random-session-token>`.
Codex dynamicTools and MCP tools/list read one Host-owned array and both execute
through one provider-neutral dispatch. Future tools added to that array therefore
reach both providers. MCP adds the required top-level object type to object-union schemas without changing their constraints or Host validation. No second document/plugin registry is maintained.

ACP newSession/loadSession receive an HTTP server named `litzio_host`, including an Origin header equal to the endpoint origin. This passes the existing daemon POST Origin policy without exceptions. A session already loaded in the current CLI process retains its endpoint and in-memory history; sends and explicit resume do not call loadSession again (#1521). After process/Host restart, loadSession restores it once with a new endpoint; CLIs without loadSession must start a new conversation. Model, mode and advertised configuration changes still apply before each prompt; launch-setting changes still restart the process as described below.
The Host generates each endpoint token and binds it to one provider session. Each admitted turn supplies a fresh turn ID, folders, permission mode and originating window from Host state. Tool arguments cannot select another conversation, turn or permission. Setup and idle sessions permit discovery; execution requires the current matching active turn. Completion, failure and cancellation clear turn authority while keeping the loaded session endpoint idle. A later turn reuses that endpoint with only its newly admitted scope. Failed session creation/load, conversation deletion, disconnection and shutdown revoke endpoints. Configuration rejection leaves a successfully loaded session idle for correction.
This is conversation isolation, not daemon authentication (#1145 remains deferred).

Copilot 1.0.109 refused MCP calls with host_policy before sending ACP permissions.
`--allow-tool=litzio_host` skips only this provider approval, and every MCP execution still checks Host scope.
The shared request_litzio_user_input tool supports structured questions over HTTP MCP.
Native ACP question extensions remain unsupported; ACP permissions use blocking cards (#1536).
The cwd litzio-guide skill is discovered by Copilot; instructions are also injected
in the prompt. This change does not consolidate those instruction sources.

Verification (2026-11-11): fake ACP plus real SDK HTTP clients protect tool discovery,
folder isolation, permission hints, cancellation and endpoint rotation. Two real
Auto prompts: the first discovered tools but host_policy denied them; the second
completed list_documents and read_document with shell denied. Those two probes used a direct createServer → MCP handler and did not test the daemon Host/Origin gate. Review found missing Origin headers; before fixing them, a new real startHttpHost regression reproduced 403 Request origin is not allowed. It now uses the exact ACP-supplied headers to discover and invoke read_document in an admitted active turn, while missing/foreign Origins remain refused. A follow-up real Copilot Auto prompt through startHttpHost completed list_documents and read_document and returned Daemon MCP probe, with shell denied and built-in MCPs no longer disabled. This used one additional prompt. Small localhost reads do not establish long sessions, remote Hosts or real plugin/image workflows.

#1547 verification (2026-11-12): Copilot CLI 1.0.109 Auto over the real daemon
received the `litzio_host` HTTP configuration and discovered the staged-document tools.
The reported complete tool refusal was not reproduced on this head. The baseline
created and inspected a pending copy, but guessed unsupported text replacement
options four times before succeeding. The shared edit-tool description now supplies
an executable `update-node-text` example with `path`, exact current `from` text and
`to` replacement, available to both providers without a shell. The existing fake ACP
and HTTP MCP regression executes that published example through the copy-only path.
A second real Auto prompt completed stage/inspect/edit without failed tool calls;
the saved original stayed byte-identical and the pending copy contained the requested
paragraph. After Host restart, real session/load received the new HTTP endpoint and
Origin header. Two prompts total; no reasoning-effort option was advertised by Auto.
These small localhost checks do not establish long sessions, remote Hosts or managed
organization policies. HTTP MCP and server-scoped tool permission are standard
[Copilot CLI capabilities](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers);
[ACP session setup](https://agentclientprotocol.com/protocol/session-setup) supplies
MCP servers on both new and load. No additional trust/allowlist setting was needed
in this run; managed allowlists still apply when configured by an organization.



ACP permission mediation captures each turn's `permissionMode` and opened folders.
Read/search inside the opened folders and Host roots is automatic. Opened-folders
also automatically permits location-bearing file tools within that scope and fetch
without locations. Known Litzio MCP metadata is an approval hint only; execution
independently checks Host scope. Every other active-turn request, including shell,
outside locations and unknown-location tools, waits on a question card. The exact
ACP option ID is returned, including allow_always or reject options when offered.
Full access automatically chooses allow_once or allow_always and sends allow_all=on
when advertised. Restricted turns send allow_all=off. Shell is no longer denied by
a launch flag. Copilot has no OS sandbox; inherited provider preauthorizations may
bypass permission requests. This is permission mediation, not Codex sandbox parity.

Docling and its feature-task exec adapter were removed in #1150 ③.
The removed feature-task settings (`codexTaskSettings`) are not retained.
Official settings store the selected provider/model/reasoning effort and accept
full-access; no migration of earlier saved settings is included.

UI uses the shared SettingsSelect for provider/model/effort/language/permission mode.
Providers have no enable switches; all defaults save automatically. Permission mode defaults to
full-access (only absent saved values; saved settings stay unchanged) and also offers read-only and opened-folders. A shared hover/keyboard-focus Tooltip description
explains each permission mode and the Copilot containment limitation; Full access removes the Codex sandbox and automatically approves tools,
paths and network access; no permanent warning is shown. Codex full-access turns use
`sandboxPolicy: {type:"dangerFullAccess"}` and `approvalPolicy:"never"`; steering keeps
the captured active-turn scope. Document tools still use their existing opened-folder,
Host Root and exclusive-new-file boundaries. These are not general shell tools.
Copilot hides only Codex-specific skills/diagnostics. The existing model Dialog/provider summary
remain; official AI reuses shared settings row widths (P05/P12).
Manual owner checks: Host login, available model selection, conversation and
history, Stop, and read-only/opened-folder writes with the user's configuration.
### Copilot choices and application timing (#1091)

The composer uses separate compact outline Buttons with direct common
DropdownMenu/DropdownMenuItem choices for provider, model, reasoning effort, write access and
(Copilot only) advertised Agent/Plan. Model buttons use the catalog display name.
Current values use the existing Check convention and aria-current; menu boundaries
and item faces use existing control/surface/text tokens (#1110/#1124). No new common interaction,
Plugin UI contribution or mode default setting is added. Only exact Agent/Plan short
or protocol IDs are accepted by Host; Autopilot, Allow All and Auto Accept are absent.
Full access is controlled exclusively by permissionMode. UI controls are locked during
an active turn. Model/mode changes apply at the next message, with `session/set_mode`
for the selected mode. Each new conversation starts with Agent when advertised.

A `thought_level` select (or reasoning/thought-level config ID) supplies values and
current default, flattened from ACP option groups as in Paseo. Host applies it with
`session/set_config_option` before the prompt. An advertised model config option
without a thought-level option means that selected model has no configurable
reasoning effort: Host sends no reasoning config and the composer hides that
selector. It does not reinterpret a removed model option as CLI fallback.
Legacy sessions without either a model config or thought-level option use CLI
`none|minimal|low|medium|high|xhigh|max`, default medium, without guessing model support.
The CLI fallback locks effort after a conversation starts; the hover explains that a
new conversation is required. New-conversation effort or full-access launch changes
restart the owned process lazily, never while any Copilot turn is active. Prior
sessions require advertised loadSession to continue after a restart. No model work
is replayed. The index stores `copilotCliReasoningEffort` only for CLI-fallback
conversations, beside the provider/title/folder metadata; Codex's index is unchanged.
History resume restores that saved effort and the current write-access launch
settings before `session/load`. If arguments differ, the existing child must exit
before its replacement starts. A conflicting active Copilot turn rejects resumption
with a visible error rather than interrupting that turn or adopting its effort.
Records without a saved CLI effort cannot resume a fallback session and report that
a new conversation is required; no past-data migration or guessed default is added.
The saved value is also enforced on subsequent sends, including after Host restart.

ACP-config efforts are validated after model selection against the actual
conversation session's latest advertised choices. Its config updates may differ
from the separate catalog session. The catalog supplies initial defaults only;
its effort list cannot veto a newly advertised conversation value. Only the CLI
fallback uses the fixed seven-value validation. Settings defaults affect new conversations; active conversations retain
their effort selection. ACP config updates are retained for subsequent validation.
Model setup publishes the latest options and provider current effort to the
conversation snapshot even when a subsequent setting is rejected. Polling can
therefore restore choices after Auto → a model with different reasoning support.
The composer preserves the user's requested effort across Copilot model changes;
it does not replace it with a catalog default or automatically retry an invalid
value. The existing choice tooltip reports the provider's current value separately.
An invalid request retains the submitted message row and readable error until the user
selects an advertised value and sends again.

#1181 verification (2026-11-06): the owner observed Copilot 1.0.105 rejecting an
Auto reasoning configuration while model/session lookup succeeded; that version's
config event history was not recorded. A later owner check on 1.0.106 observed
reasoning disappearing after Auto selection. These are distinct observations.
Fake stdio regressions cover supported-model effort updates and Auto's removed
option, plus readable RPC errors without provider data. A separate local PATH
1.0.106 probe completed a minimal Auto prompt with no received assistant text;
it is not evidence of successful real answer delivery. No account/default settings
were changed. The composer reuses the existing AssistantChoice Button/menu pattern
and omits unavailable choices; no new surface or UI pattern exception is added.

The original #1091 manual review used SettingsSelect and composer Button/Popover with no
new common implementation or UI exception. Korean Dark, 1440×1000 and 640×1000,
same fixture state: Before uses master `080f7bc1` UI and a rebuilt plugin; After
uses #1091 UI. Captures are manual review only, not pixel assertions.

| Surface | 1440px Before / After | 640px Before / After |
| --- | --- | --- |
| Settings | [Before](assets/copilot-options-1091/before/copilot-1440-dark-ko.png) / [After](assets/copilot-options-1091/after/copilot-1440-dark-ko.png) | [Before](assets/copilot-options-1091/before/copilot-640-dark-ko.png) / [After](assets/copilot-options-1091/after/copilot-640-dark-ko.png) |
| Composer choices | [Before](assets/copilot-options-1091/before/copilot-options-1440-dark-ko.png) / [After](assets/copilot-options-1091/after/copilot-options-1440-dark-ko.png) | [Before](assets/copilot-options-1091/before/copilot-options-640-dark-ko.png) / [After](assets/copilot-options-1091/after/copilot-options-640-dark-ko.png) |

Alignment, spacing, legibility and clipping were reviewed in both widths. The
640px settings content scrolls vertically; the composer popup remains in view.
Reproduce After with `pnpm browser:test assistant --screenshots`. Before uses the
same screenshot-only popup traversal against the original UI; no extra scenario
is retained. The initial baseline attempt retained a newer built plugin; rebuilding
the original source produced the reviewed Before captures.

Owner checks include every effort value/model combination, Auto routing, Agent/Plan
switches, next-message versus new-conversation timing, history after launch changes,
and full-access shell/path/URL execution for both providers. Fake tests do not prove
model entitlement, usage, actual sandbox enforcement or inherited CLI permissions.

Implementation reference: [Paseo Copilot ACP](https://github.com/getpaseo/paseo/blob/main/packages/server/src/server/agent/providers/copilot-acp-agent.ts),
[Paseo transport](https://github.com/getpaseo/paseo/blob/main/packages/server/src/server/agent/providers/acp-agent.ts),
[providers](https://paseo.sh/docs/supported-providers),
[GitHub ACP](https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server).


## Codex skill selection (#1047 PR B)

Typing `/` at a word boundary opens the inline skill candidate surface.
Plugin candidates show the Host-provided manifest name and original skill name (`Plugin · skill`); search includes the label. Internal names, tokens and Codex inputs remain unchanged.
The Host calls `skills/list({cwds:[assistantCwd],forceReload:true})` using only
parameters supported by Codex 0.141.0. Only enabled skills returned for that cwd
appear, with name and description, filtered by the typed query. Loading, empty
results, RPC failures and per-skill loading errors remain visible in the candidate
surface. Opened folders do not add skill discovery roots. No installation,
enablement, global configuration write or Litzio command palette is introduced.

Click or Arrow/Enter selects a skill; Escape closes candidates before the panel.
Selection inserts `$<name>` in text and adds a removable path-tooltip chip using
the file-reference Button/Tooltip implementation. `/` is only selection syntax.
Both file and skill selection apply the caret together with the updated composer
text, before subsequent input. A deferred paint callback must not move the caret
back into text the user has already typed. Reopening file candidates clears the
previous lookup's results with the new query, so retired options cannot signal
readiness while the new lookup is starting (#1087).
The public conversation input adds `skills?: {name,path}[]`. Host validates each
selection against the enabled catalog and sends `{type:"skill",name,path}` with
`$<name>` text on start and steer. Selection follows whitespace-delimited
`$name` tokens in the current input text: deleting a selected token removes its
chip and explicit input; clicking a chip's X removes all corresponding tokens
as well. Only selected skills whose tokens remain at send time are sent. Host
also filters selections by those tokens and never appends a missing token;
retained name/path pairs are still checked against the enabled catalog.

Skills persist as `{name,path,kind:"skill"}` in the existing context JSON
`references` array. Live and paginated history therefore restore chips without
assuming Codex returns skill inputs in thread history. They are historical
references, not automatic inputs on later turns. File references retain their
existing validation and image handling. No document semantics change, so Core
and CLI additions are intentionally unnecessary.

Verification: the existing fake app-server covers enabled filtering, exact cwd
and request fields, start/steer input, missing/disabled selection rejection,
RPC and per-skill errors, and flattened history with skill items omitted. The
existing assistant browser scenario covers ordinary paced typing and clicking,
description display, chip/token removal in both directions, deleted-token
start/steer payloads, send metadata, history chips and visible list
failure. Host tests own protocol assertions; browser assertions own interaction.
No real model turn or exhaustive combination matrix is added. The 640px skill
candidate/chip sequence runs only with `--screenshots` for manual review.

Manual captures from `pnpm browser:test assistant --screenshots` use the product
surface and persistent Chrome profile: [1440 Light list](assets/assistant-skills-1047/list-1440-light-en.png),
[1440 Light chip](assets/assistant-skills-1047/chip-1440-light-en.png),
[640 Dark Korean list](assets/assistant-skills-1047/list-640-dark-ko.png),
[640 Dark Korean chip](assets/assistant-skills-1047/chip-640-dark-ko.png).
The existing file-reference captures above provide the preceding composer state.

### Conversation choices (#1110 / #1124)

Owner decision (2026-11-04): `AssistantConversationInput` accepts optional `provider` and
`permissionMode` overrides from the user's composer selections. These never write
Assistant settings or change global defaults. New conversation restores the global
provider/model/effort/access defaults together with that provider's catalog; closing
and reopening the panel preserves unsent choices. The picker contains both supported AI providers without enable switches. Host send/resume reports an unavailable selected provider with its reason, independently of the global default. Model catalogs and diagnostics inspect both providers; the provider is pinned when the first message creates a session. Both UI and Host
reject changing an existing session's provider. Its disabled button remains
explainable through the common Tooltip on hover or keyboard focus.

Permission mode is captured at each new turn. Steering preserves the running turn's
scope; an explicit later selection takes effect on the next turn. The history
index stores the last applied write access and provider. The index is inside the
assistant-writable cwd and is not approval authority. The current Host's in-memory
conversation retains a user-approved override through resume. After Host restart,
a stored grant can only restore at or below the current global default in the order
read-only < opened-folders < full-access; invalid values use that default. The
sanitized value is also returned to the UI. Elevation beyond that cap requires a
fresh explicit selection in this Host session. This bounds restored state instead
of adding a second persistent grant store or assuming a sibling directory is
outside every opened folder. No past-data migration is added. The existing permission checks and
Copilot launch rules still apply. No assistant tool can change these choices:
the concrete user-facing send route owns overrides, while model tool dispatch
remains restricted to the existing document tools. No language selector or Core
semantic operation is added; this is Host conversation state, with no CLI document
operation parity requirement.

Shared implementation: outline Button, Tooltip, DropdownMenu and DropdownMenuItem;
no new common interaction or style system. NewDialog's existing `form-select`
already supplies the shared control border and opaque surface, so it needs no
parallel visual patch. Browser checks protect composer wiring and real computed
contrast; Host protocol checks protect scope, provider pinning and resume. No real
model call is required.


Manual visual evidence: Windows persistent Chrome, same fake catalog and unsaved
document, 1440×900 Light/English and 640×900 Dark/Korean. The existing
`pnpm browser:test assistant` runner used a temporary capture-only block (removed
from the automatic scenario) to open Model directly. Before images retain the original native-list defect;
after images show the review follow-up direct menu.
No screenshots-only loop was added to CI. Alignment, padding, viewport bounds,
Korean wrapping, current-value checks and open-menu readability were reviewed directly.
The DOM contrast assertions cover rendered menu surfaces/items, not OS-native options.

| View | Before | After |
| --- | --- | --- |
| 1440 Light | [Combined popup](assets/assistant-choices-1110/before-1440.png) | [Separate choices](assets/assistant-choices-1110/after-1440-closed.png), [Direct menu](assets/assistant-choices-1110/after-1440.png) |
| 640 Korean Dark | [White-on-white native list](assets/assistant-choices-1110/before-640-list.png) | [Separate choices](assets/assistant-choices-1110/after-640-closed.png), [Direct menu](assets/assistant-choices-1110/after-640-list.png) |

The shared expanded-button CSS incorrectly removed outline borders as well as
ghost borders. Removing that redundant reset lets each existing Button variant
own its border; ghost remains transparent. No NewDialog styling is changed.

## Official provider settings (#1150 ③)

`AssistantSettings` lives in `apps/editor/shared/assistant.ts`. The daemon owns settings and its provider connections directly. The removed enable switches, plugin transport and Codex feature-task defaults have no compatibility aliases. Both providers remain inspectable; the selected provider's real availability controls new work, while current turns and tools retain their lifecycle. Existing settings controls, ordered autosave and failed-save recovery remain covered by the fake `assistant` browser scenario.

Verification: full workspace tests/typecheck, boundaries, docs, Editor/CLI build, fake assistant/assistant-result browser scenarios, and production HTTP recovery/reconnect/Save/conflict. Packaging and platform distribution are CI-only; no paid AI call, install/update/uninstall or user-data migration was run.

Manual visual review, 1440px English Light and 640px Korean Dark: [wide](assets/official-ai-1150/ai-1440-light-en.png), [narrow](assets/official-ai-1150/ai-640-dark-ko.png). Reuses SettingsSelect, Button and Dialog with existing shell geometry. No new interaction or UI pattern exception.

Independent-review follow-up: generated `litzio-guide` frontmatter and instructions describe only retained features; the environment regeneration test rejects removed Docling/convert-pdf guidance. Provider rows retain the common ghost Button with explicit start alignment, following the left-aligned label convention in Appearance/Recovery; obsolete toggle CSS is removed. The wide/narrow captures above are refreshed for this alignment fix. Desktop license assertions are preserved in the existing packaged startup/sample smoke and run only in required Windows CI.

Review follow-up (#1131): the existing Host test first reproduced a forged
`full-access` history entry becoming `dangerFullAccess` after a fresh Host resume
and a send with no override. It now checks read-only restoration/sending, a safe UI
snapshot and a valid same-Host elevated override surviving resume. Steering still
retains the active turn's scope. No real model call or extra subprocess suite is added.

HTTP scope: under [ADR-0005](../adr/0005-http-host.md), an allowed HTTP caller is
trusted as the single operator (including operator-managed proxy authentication
or private network access). Its explicit send `permissionMode` is treated as a user
selection. The Host does not prove a browser click or distinguish that trusted
caller's custom HTTP request from the UI. This change adds no approval service,
identity system or protection against a hostile operator/administrator. In contrast,
assistant-writable history is never accepted as authority to elevate a grant.

#1159: User-facing settings and messages consistently use Assistant (비서); provider names remain Codex and GitHub Copilot. Existing Settings components are reused.

Verification captures: [1440px English Light](assets/editor-1159/ai-1440-light-en.png), [640px Korean Dark](assets/editor-1159/ai-640-dark-ko.png).

`litzio assistant configure` validation errors name the invalid field and its allowed values or reason, including provider model/effort catalog restrictions. Validation rules are unchanged.

## Terminology alignment (#1168 PR A)

The [terminology glossary](../contributing/terminology.md) defines Assistant, AI provider and Permission mode. Current code/API/CLI names remain unchanged pending PR B. UI uses Background service (daemon in the status title), while CLI and documentation retain daemon. Settings use the existing SettingsSelect, native hover and conversation Tooltip without a UI pattern exception. Permission descriptions distinguish sandboxed Codex tools from Copilot permission mediation and inherited preauthorizations. Unused disabled-assistant locale declarations were removed; availability errors retain their actual cause.

Verification (2026-11-04): persistent Chrome `pnpm browser:test assistant --screenshots` passed, along with boundaries/docs checks, full typecheck, Editor tests (411 passed, one skipped) and build. Fake providers verify interface behavior without live model calls. Visual review: [1440px English](assets/terminology-1168/settings-1440-en.png), [640px Korean dark](assets/terminology-1168/settings-640-ko-dark.png), [640px permission control](assets/terminology-1168/permissions-640-ko-dark.png). Existing layout and overflow assertions remain intact.

## Conversation Host selection (#1174 PR4)

The shell selects the Host before mounting a new conversation surface. Once initial connection
observations settle, one connected candidate is selected directly, even if more Hosts are registered.
Several connected candidates open the existing Dialog with one Button per registered Host.
Each row uses the shared HostStatus dot and localized state name. Unreachable/connecting
Hosts remain listed but disabled; the focusable tooltip wrapper explains why they cannot start
a conversation. Connection changes never retarget an existing conversation. Choosing
another Host requires New conversation; the selector cannot retarget an existing conversation.
The conversation context always displays its fixed Host label. Its tooltip explains that files
and AI run in the target Host's OS-account context.

The panel is keyed by Host and uses that Host's bound client for settings/catalog/history,
references and execution. Active tabs and the Explorer visibility filter cannot change it.
Only a document from the same Host is included in the current-document context. Each Host’s
Explorer refuses adding a reference to a conversation fixed to another Host. Each queued
Explorer reference carries its Host ID; a panel accepts only its own Host and acknowledges
consumption so remounting or choosing a new conversation cannot replay the request. A fresh Host
selection clears that Host's last-conversation shortcut before creating the new surface;
the server's history is preserved. New conversation remains available after connection/setup
failure, while pending or active execution still prevents it.

Common Dialog/Button/Tooltip and existing panel behavior are reused. `pnpm browser:test multi-host`
checks disabled-unreachable selection and its tooltip, single-available-candidate bypass, visible
fixed Host and remote settings routing after local tab/filter changes
using fixture responses; it performs no real AI call. Settings and registration UI integration
remain PR3b's responsibility; remote panels do not dispatch the local Settings shortcut.

## Plugin stage 1 (ADR-0020)

Owner-initiated stage 1 provides [the shared plugin management contract](plugin-stage1-v1.md). Management is a separate Codex tool without per-call confirmation. Its action, target plugin ID and success/failure appear in the existing conversation tool activity and result, without settings values or secrets. `reload` uses the same Host operation as CLI. Display tools remain restricted to their existing fields. Plugin execution belongs to the target Host; Secret values are supplied only through the settings UI and passed privately to the target plugin runtime; assistant management cannot input or retrieve them. View runtime contributions remain unsupported.

K1 플러그인 파일 작업은 Codex dynamic tool `plugin_jobs`로 SDK 공용 start/status/stop/result/list를 제공한다([계약](plugin-stage1-v1.md#k1-파일-작업)). 건별 승인은 없고 turn의 기존 tool 활동에 작업·성공/실패·결과가 남는다. 쓰기 모드와 열린 폴더 범위, 대상 Host 및 응답 상실 뒤 같은 ID 조회/no replay는 유지한다. Copilot은 #1500의 HTTP MCP 경로로 같은 도구를 사용한다.

Codex `invoke_plugin_operation`은 현재 대화 Host의 `assistant:true` 읽기 작업과 manifest 연결 확인을 같은 공용 실행 경로로 호출한다([계약](plugin-stage1-v1.md#비서의-플러그인-읽기-호출-1425)). 읽기 전용 turn에서도 이 조회와 연결 확인을 허용한다(#1500 5단계). 쓰기·비공개 일반 작업은 turn 권한과 무관하게 거부하며 필요한 선언과 전용 경로를 안내한다. plugin_jobs 시작·중지와 검수 쓰기의 권한은 유지한다. `manage_plugins`는 읽기 전용 turn에서 list·validate·settings 조회만 허용하며, 관리 쓰기는 거부하고 Opened folders 또는 Full access로 변경하도록 안내한다. 두 쓰기 권한의 동작은 바꾸지 않는다. 출력 검증·secret 제거·고정 오류 분류와 receipt를 유지하며 활동에는 작업·시각·결과 상태·receipt만 남긴다. 입력·출력 원문은 활동이나 재개된 활동에 포함하지 않는다.

### 플러그인 제작 문맥

Codex의 Host 플러그인 관리 도구는 `scaffold`와 `validate`를 포함한다. 각 turn에 번들 제작 스킬을 함께 제공하며 별도 설치 없이 제작 요청에서 사용한다. register 활동은 실제 manifest ID를 기록한다. 관리별 승인은 없으며 설정값·secret은 활동에 기록하지 않는다. 현재 SDK 규격과 정적 검증 한계·생성/수정 후 reload 절차는 [플러그인 1단계 계약](plugin-stage1-v1.md#비서-제작-키트)을 따른다.

## Model input and visible history (#1270)

Both providers carry the exact user message in the structured Litzio context. File/document paths, selected skill references and plugin authoring instructions are model input only. Live and resumed conversation API user items restore only the original message and reference chips, including when provider history flattens text inputs. Internal instruction bodies are never conversation bubbles. Provider-owned transcripts retain model inputs; Litzio does not copy them into its conversation index. No migration or historical-format compatibility is provided.

### Dynamic view material snapshots (D4)

Historical: this view-generation material/provenance path was removed in #1341. The following describes the earlier implementation.

The app supplies its registered Host identity and opaque Root IDs from existing folder listings. The Host recomputes each ID from filesystem identity and checks the existing opened-folder boundary before reading attached saved files. These bytes and completed public tool results are bounded read-only context, separate from the human transcript. Unsaved editor content is not sent. Corrections retain the initial snapshot and selected model. Cards, document views and plugin screens share provenance and complete-row inspection; source opening rechecks Root identity before using the existing document-open path and its unsaved-work protection. Display identities are not authentication or factual verification.

Ordinary attachment and tool-result delivery does not depend on optional dynamic-view text capture. Codex localImage and Copilot path references are preserved for images. Capture failures are described separately as unavailable view context while ordinary sends and completed reads keep their original results. Generate/propose still reject unsupported or oversized text snapshots explicitly; view limits never become ordinary document-read limits.


### Organization permission requirements (#1416)

The Codex model catalog reads the official `configRequirements/read` request and exposes only
whether `allowedSandboxModes` permits `danger-full-access`; no organization identifiers are returned.
Settings and composer disable Full access with a reason in the existing permission Tooltip.
Servers that report an unsupported method keep the choice available. A turn-start rejection
for DangerFullAccess outside the allowed sandbox set retries once with opened-folders, only after an explicit turn/start RPC rejection before execution with no active turn. Transport failures and execution errors are never retried. The conversation remembers opened-folders, including resume; global settings remain unchanged. The panel shows the status with a hover/focus explanation. An explicit different permission on a subsequent turn clears the remembered fallback notice; steering keeps the active turn scope.
A rejected submission retains its message row with an explicit Restore to input action; existing conversation history remains available.
Requirements can change after discovery; the turn rejection remains authoritative.

Protocol reference: [official app-server admin requirements](https://learn.chatgpt.com/docs/app-server#read-admin-requirements-configrequirementsread).

Verification: Host tests cover workspaceWrite network enabled with unchanged roots/temp exclusions,
read-only network disabled, Copilot fetch allowed only in opened-folders with edit boundaries and
shell denial retained, requirements discovery/fallback, sanitized rejection and same-conversation retry.
The representative assistant browser scenario checks disabled Full access and Tab-focus network/policy
help using the shared Tooltip and existing selection controls (no new interaction exception).
[Permission Tooltip capture](assets/permissions-1416/permission-tooltip.png) is a synthetic local fixture.
One real gpt-6-luna/low turn completed, but all three shell commands (localhost HTTP GET,
inside write, outside write) failed before execution with `CreateProcessAsUserW failed: 5`.
No HTTP hit or file creation occurred; actual network success and sandbox write containment remain
unverified on this PC. The organization-managed account path is fixture-only; no such account was available.


## Optimistic assistant submissions (#1417)

The composer owns a temporary submission row (text, selected references, target Host and
conversation) and generates a random `submissionId` before POST. It immediately shows
that row and clears the composer. New typing/attachments during the request remain a
separate draft and are never cleared by its response. Reference-only input, first and
existing conversations, Codex steer and Copilot sends use the same path. Copilot still
blocks input submission during an active response; there is no follow-up queue.

`assistantConversation` send with `submissionId` returns
`{submission:{id,status,conversationId?,itemId?,error?},conversation?}`. The existing
GET/`assistantConversations` accepts `submissionId` to return the same envelope,
including a first conversation whose POST acknowledgement was lost. Legacy callers
without a submission ID retain their conversation response. This is the existing
Host conversation operation, not a new document semantic operation or CLI command.
User items expose `submissionId`: Codex carries it in the Host context envelope and
restores it from both notifications and CLI-owned resumed history; Copilot assigns it
to its Host user item and includes it in the prompt context for history restoration.
User items expose `userMessageSource` for diagnostics; it is not a preservation gate.
Only the submission ID correlates temporary and provider rows; equal text never merges them.
A correlated user row retires the local row immediately, including a Host-created Copilot row.
Accepted receipts show the submitted message immediately even before the provider row arrives (#1526).
Provider history owns subsequent replay; turn completion failure is displayed on the turn and does
not revoke submission admission or require keeping a second local transcript.

Host receipts distinguish pending, accepted, rejected and unknown. Pre-dispatch validation/setup
failure is rejected and can be retried explicitly with the same ID after correcting settings.
Within a Host lifetime, already-dispatched IDs (pending, accepted or unknown) return their existing
result. Unknown Retry first queries the existing submission operation; it sends only if that lookup
confirms pre-dispatch rejection. Accepted/pending results are observed without sending. If the Host
still reports unknown (including after restart), Retry never POSTs the forgotten ID. The existing
receipt error shows "Unable to confirm acceptance" beside Retry, with a separate "Send as new"
button. Only that explicit choice sends the original text/references with a new ID; its hover
Tooltip explains that the previous request may already have run. No new state or store is added.
Concurrent duplicate requests share the original promise. No request
is automatically replayed. The send transport waits up to 10 seconds for admission, independently
of the provider turn's lifetime. Connection loss and timeout retain the message and a Retry button;
Retry queries that same ID to reconcile the result; definite rejection permits resending it.
There is no Restore to input or Check conversation workflow. A separate composer draft and its references survive Retry and Discard.
The existing snapshot poll observes active turns; only pending submissions need receipt polling.

Local rows belong to the target Host, provider and conversation. A first send without a conversation
ID remains in that new-conversation scope only until a receipt identifies its owner (#1551).
New conversation, provider changes and history selection invalidate earlier poll updates and hide
other owners' rows. Closing/reopening the panel or switching Hosts retains App memory. Page reload,
App unmount and Host restart do not provide durable submission recovery or cross-restart ID deduplication.

New conversation and history navigation are available while a response runs. They do not interrupt
it. Codex supports steer on the active turn. ACP has no steer operation, so Copilot active-prompt
submission remains disabled; after completion the same composer sends the next prompt. Provider
selection remains tied to its conversation; model, effort, permission and mode changes stay locked
while running because those changes cannot be applied to the admitted turn. Deleting an active
conversation and applying/discarding copies retain their existing guards. Host selection never
silently changes and document revision checks are unchanged.

Verification (#1542, first PR): existing Host/provider tests protect concurrent duplicate IDs,
explicit retry after pre-dispatch rejection, uncertain retry without a second provider call, actual Host restart with a forgotten ID, steer,
and admission independent of turn failure/history replay. The existing browser scenario covers
Retry with a separate draft, active-turn New conversation/history navigation and #1551 isolation.
The multi-host scenario also verifies that Retry retains the remote Host, submission ID and
references without overwriting a new remote draft.
The browser reproduces response loss followed by forgetting the Host receipts, then verifies
query-only Retry and explicit new-ID sending with the original text and an intact separate draft.
The restart regression failed before the fix. These are fixture checks; live provider results are recorded in the PR. Screen relay, display and
attachment simplification remain the second PR scope of #1542.

Current manual self-review: [Retry at 1440px](assets/assistant-relay-1542/retry-1440.png),
and [unknown after restart with the Send as new Tooltip](assets/assistant-relay-1542/restart-retry-1440.png),
English Light, persistent Chrome fixture. Uses existing inline outline/ghost sm Buttons;
no new surface, geometry or visual exception. This is not owner visual approval.

Earlier #1417 captures are historical: [1440 Before](assets/assistant-send-1417/before-1440.png) /
[After](assets/assistant-send-1417/after-1440.png). Their restoration controls have been replaced.


## Assistant button status (#1424)

The existing top-bar ghost `sm` Button summarizes the selected conversation Host
while its panel is closed. It uses the shared Tooltip, `agent-dot` geometry and
existing theme roles: an outlined `text-muted` circle for Working, a filled accent
circle for Completed (unread), and a warning square for Needs your attention.
Shape supplements color; the localized accessible name and keyboard/hover Tooltip
explain the status without adding persistent text or changing the button size.
Attention takes priority over work and completion: structured `userInput` questions,
failed turns, and unresolved rejected/unknown submissions require checking the
existing panel actions. Provider approvals use the existing question-card history (#1536), with no separate approval queue.

Conversation snapshots and #1417 submission receipts remain the source of truth.
Closing the panel neither invalidates an in-flight send nor creates another poller.
The same nonoverlapping observer (100ms target for running work/pending sends, 600ms idle) continues for running work, questions and
pending submissions while the browser tab is visible and initial setup has admitted the work. Rejected/unknown submissions wait for explicit Retry. Idle
closed conversations stop polling. Hidden tabs and failed/incomplete setup still
pause it. Closing a setup refresh retains observation of already-admitted work.
Closed-panel observation omits `displayClient` and never applies display
requests, including a snapshot already in flight when closing; the existing
visible-panel display-setting authority and expiry remain unchanged.

A completed turn not yet viewed produces the unread marker. Opening the panel
acknowledges it; closing again does not restore it. Indicators are hidden while
the panel is open, where the actual transcript/question/recovery action is visible.
The read marker is local panel presentation memory, cleared with that scope, and
is neither a Host job state nor persistent unread history. The indicator concerns
the current conversation, not an aggregate of other Hosts or history. New scope
selection/unmount removes its summary. There are no OS notifications or sounds.

Verification extends the existing `assistant` scenario for a hidden first-send
receipt (one send), hidden question arrival, hidden display-change refusal,
completion acknowledgement/re-close, and accessible status/keyboard Tooltip.
Existing submission recovery, provider selection and visibility tests are retained;
`assistant-result`, `layout-rules` and `quiet-document` cover adjacent integration
and geometry. These are synthetic Host/browser fixtures, with no live model call,
remote Host, packaged Desktop or background-tab completion-latency proof.

Manual evidence: Windows persistent Chrome, 1440×1000 and 640×1000, English,
Light/Dark, DPR 1, 100% zoom, bundled Pretendard. Before is master `d4527731`
(the merged #1417 implementation). Captures are native top-bar crops so OS account
labels and local paths outside the relevant surface are excluded. The synthetic
conversation and viewport/theme are the same before and after.

| View | Before (working, no marker) | Working | Attention | Completed | Acknowledged |
| --- | --- | --- | --- | --- | --- |
| 1440px Light | [Image](assets/assistant-status-1424/before-1440-light-working.png) | [Image](assets/assistant-status-1424/after-1440-light-working.png) | [Image](assets/assistant-status-1424/after-1440-light-attention.png) | [Image](assets/assistant-status-1424/after-1440-light-completed.png) | [Image](assets/assistant-status-1424/after-1440-light-acknowledged.png) |
| 1440px Dark | [Image](assets/assistant-status-1424/before-1440-dark-working.png) | [Image](assets/assistant-status-1424/after-1440-dark-working.png) | [Image](assets/assistant-status-1424/after-1440-dark-attention.png) | [Image](assets/assistant-status-1424/after-1440-dark-completed.png) | [Image](assets/assistant-status-1424/after-1440-dark-acknowledged.png) |
| 640px Light | [Image](assets/assistant-status-1424/before-640-light-working.png) | [Image](assets/assistant-status-1424/after-640-light-working.png) | [Image](assets/assistant-status-1424/after-640-light-attention.png) | [Image](assets/assistant-status-1424/after-640-light-completed.png) | [Image](assets/assistant-status-1424/after-640-light-acknowledged.png) |
| 640px Dark | [Image](assets/assistant-status-1424/before-640-dark-working.png) | [Image](assets/assistant-status-1424/after-640-dark-working.png) | [Image](assets/assistant-status-1424/after-640-dark-attention.png) | [Image](assets/assistant-status-1424/after-640-dark-completed.png) | [Image](assets/assistant-status-1424/after-640-dark-acknowledged.png) |

The [manual capture script](assets/assistant-status-1424/capture.browser.js) runs
outside the stable suite using `pnpm browser:test quiet-document --screenshots`;
restore the original scenario after capture. These images are manual self-review
evidence, not pixel assertions or owner visual approval.
The [capture geometry](assets/assistant-status-1424/geometry.json) records a constant
109.36×28px button in every state and both widths/themes. Self-review found no
clipping or search/button movement. Resolved state colors against the captured
header background measure at least 5.75:1 (the outlined work marker uses its border
color); the dot remains 6px. Pixel-edge antialiasing is not this contrast calculation.

## Assistant reading and progress (#1436, #1440)

The existing Host conversation, turn/item statuses, `userInput` and #1417 submission
receipts remain authoritative. No new Host state, provider loop or CLI operation
is introduced: scroll and disclosure are Editor interactions under ADR-0015.
The existing #1424 observer and attention priority are unchanged.

- The transcript follows new output while at the bottom (2px rounding tolerance).
  User scrolling away retains the reading position, including within the previous
  180px follow threshold. Upward wheel intent releases following before a deferred
  resize can compete with the scroll event, only when upward scrolling is possible.
  Other scrolling uses the actual native scroll position; typing or clicking empty
  space does not detach following.
  Reaching the bottom, explicitly jumping there or sending
  a message resumes following. Conversation/history navigation starts at the end;
  hiding/reopening the same panel retains its reading choice. Resize and deferred
  Markdown/math layout follow only when already following.
- An outline small Button with ArrowDown appears above the composer while away.
  Changed conversation content adds “New content”; unchanged polls do not. Its
  separate row inside the reading area leaves the composer fixed and does not
  cover transcript content. It never steals keyboard focus.
- #1541 supersedes the response-wide work disclosure from #1436/#1440/#1492.
  Assistant answers, reasoning summaries, plans and tool steps appear in provider
  item order. Each step is a separate single-line native details/summary, initially
  collapsed, with its own transient expansion choice retained across snapshots.
  Turn completion closes the rows; each can be reopened afterward. Thinking shows provider summary/thought text; Shell shows the
  command and bounded output in a monospace block. File changes show paths, MCP
  calls show server/tool and arguments, and ACP tools show title/kind/content.
  Codex raw reasoning content is never projected; only its summary is available.
- Reasoning labels use Thinking… (생각 중…) only while active, and Thinking
  (생각) after the step. Interrupted pending/running tools display Stopped.
- Running rows use a spinner, completed rows a kind icon and failed/declined rows
  a warning icon. Summary text ellipsizes. Each expanded tool detail is limited to
  16,000 characters with an explicit truncation notice; it does not alter tool results.
  A separate live phase line remains while awaiting provider events or user input.
- Disclosure releases bottom-follow; existing reading/jump behavior, answer copy,
  question cards, permission cards and pending changes retain their own contracts.
  No setting, persistent expansion store or Host/CLI operation is added.
- The assistant surface reuses native details, Lucide icons and compact spacing
  tokens from the UI decision table. Paseo's ThoughtSlot/ToolCallSlot and tool-call
  detail rendering were studied from a shallow local checkout; implementation is
  kept local to the existing transcript, without its virtualization infrastructure.
  Source: [Paseo agent stream](https://github.com/getpaseo/paseo/blob/68818067f2a55c5655dc43f380a143fe4cb7ebb6/packages/app/src/agent-stream/view.tsx).

#1541 validation (2026-11-12): provider/Host tests, assistant browser regression,
full typecheck, boundaries, Editor build and docs checks. A real Codex gpt-6-luna
low turn ran one Shell command and retained its output; real Copilot Auto (the only
model offered by this PC's ACP catalog) retained thought chunks, a completed shell
step and output. Neither returned separate raw reasoning in the projected items.
Short local turns do not prove long-session or remote performance.
Manual 1440px Korean evidence (synthetic transcript; Host identity masked):
[Light thinking](assets/assistant-timeline-1541/light-thinking.png),
[Light running](assets/assistant-timeline-1541/light-running.png),
[Light expanded](assets/assistant-timeline-1541/light-expanded.png),
[Light completed](assets/assistant-timeline-1541/light-completed.png),
[Dark thinking](assets/assistant-timeline-1541/dark-thinking.png),
[Dark running](assets/assistant-timeline-1541/dark-running.png),
[Dark expanded](assets/assistant-timeline-1541/dark-expanded.png),
[Dark completed](assets/assistant-timeline-1541/dark-completed.png).
Rows, icons, command wrapping, failure color and independent expansion were
visually reviewed against the Paseo row behavior; owner visual approval is separate.

### Reference study and validation

Paseo source was inspected at `48a1497fc0abb654dde264850d6bf4088ac34ac1`:
[turn summary](https://github.com/getpaseo/paseo/blob/48a1497fc0abb654dde264850d6bf4088ac34ac1/packages/app/src/agent-stream/turn-collapse/summary-line.tsx),
[expansion ownership](https://github.com/getpaseo/paseo/blob/48a1497fc0abb654dde264850d6bf4088ac34ac1/packages/app/src/tool-calls/expansion.ts),
[bottom anchor](https://github.com/getpaseo/paseo/blob/48a1497fc0abb654dde264850d6bf4088ac34ac1/packages/app/src/agent-stream/bottom-anchor-controller.ts),
and [disclosure hold](https://github.com/getpaseo/paseo/blob/48a1497fc0abb654dde264850d6bf4088ac34ac1/docs/agent-stream-disclosure.md).
The public lifecycle documentation also identifies AgentStreamView as the common
rendering surface. In the installed Windows Paseo UI, the active synthetic work
conversation showed compact collapsed tool rows and a running footer. Scrolling
up exposed its downward jump button. Expansion retention and re-stick rules above
are source evidence; they were not fully exercised live in Paseo. No private
Paseo screenshots are published.

Adopted: compact summaries, explicit disclosure choice, separating following from
reading, a jump control, and releasing the viewport on disclosure. Not adopted:
Paseo virtual-list/native anchoring machinery, plugin renderers, separate per-tool
expansion stores or latest-tool auto-opening. Litzio uses a native transcript; #1541 replaces response-wide disclosure with
individually collapsed steps.

The existing assistant browser case adds one targeted streaming sequence for
large one-poll growth, reading within 180px of the end, new-content notification,
explicit rejoin, phase changes and retained expansion. Existing question choice,
free text and #1424 attention checks now also verify placement outside details.
These are client integration risks, so there is no duplicate Core/Host test matrix.
Shell and token checks remain the existing ones. Localhost fixture success does
not establish long real conversations, remote transport, Copilot live behavior,
actual approval interactions or owner visual approval.

Manual product captures (1440px and 640px, Korean, Light/Dark) use the separate
[capture procedure](assets/assistant-progress-1436/capture.browser.js); the baseline
is `96f7ede6` and after captures use this PR's implementation. Native panel crops
exclude local paths and OS identity. Files in the same directory use
`before/after-{width}-{theme}-{state}.png`: tool, question, reading and expanded.
The work header, question form and jump control use existing surface/text/border
roles, Button sizes and spacing tokens; no adjustable preference or new palette.

| Viewport/theme | Before | Collapsed tool | Question | Reading/new content | Expanded |
| --- | --- | --- | --- | --- | --- |
| 1440 Light | [Image](assets/assistant-progress-1436/before-1440-light-tool.png) | [Image](assets/assistant-progress-1436/after-1440-light-tool.png) | [Image](assets/assistant-progress-1436/after-1440-light-question.png) | [Image](assets/assistant-progress-1436/after-1440-light-reading.png) | [Image](assets/assistant-progress-1436/after-1440-light-expanded.png) |
| 1440 Dark | [Image](assets/assistant-progress-1436/before-1440-dark-tool.png) | [Image](assets/assistant-progress-1436/after-1440-dark-tool.png) | [Image](assets/assistant-progress-1436/after-1440-dark-question.png) | [Image](assets/assistant-progress-1436/after-1440-dark-reading.png) | [Image](assets/assistant-progress-1436/after-1440-dark-expanded.png) |
| 640 Light | [Image](assets/assistant-progress-1436/before-640-light-tool.png) | [Image](assets/assistant-progress-1436/after-640-light-tool.png) | [Image](assets/assistant-progress-1436/after-640-light-question.png) | [Image](assets/assistant-progress-1436/after-640-light-reading.png) | [Image](assets/assistant-progress-1436/after-640-light-expanded.png) |
| 640 Dark | [Image](assets/assistant-progress-1436/before-640-dark-tool.png) | [Image](assets/assistant-progress-1436/after-640-dark-tool.png) | [Image](assets/assistant-progress-1436/after-640-dark-question.png) | [Image](assets/assistant-progress-1436/after-640-dark-reading.png) | [Image](assets/assistant-progress-1436/after-640-dark-expanded.png) |

Self-review found no header/control overlap or horizontal overflow in these four
viewport/theme combinations. Opening long details deliberately scrolls within the
transcript; the question remains outside the disclosure. A baseline capture also
emitted the existing ResizeObserver undelivered-notifications warning, so that
warning is not evidence of a regression introduced by this change.

### #1443 protocol diagnosis (not fixed here)

Historical diagnosis from #1436; the implementation is now defined in
[Async questions and answer history](#async-questions-and-answer-history-1443).

Two actual gpt-6-luna/low calls on Codex 0.167.0 asked the reported travel question.
The first requested synchronous input and ended with UNAVAILABLE. The second
requested the title/options async form. Its actual `item/started` and
`item/completed` carried `agentMessage` with `delivery: "async"` and a structured
`questions` array. No `item/tool/requestUserInput` server request occurred, no Host
`userInput` was populated, and the turn completed. The sanitized observed shape
is in [question-protocol.json](assets/assistant-progress-1436/question-protocol.json).

`assistant-conversations.ts:itemFrom` preserves the message text but drops these
question/delivery fields. The Host's question/answer callback instead expects a
server request with correlated requestId/turnId and id/header/question/isOther/
isSecret/options objects. This is a provider-to-Host contract gap requiring a
separate shared protocol/answer-lifetime change, not a question hidden in details.
The text itself remained available. The original fully invisible question and
`accepted:true` result were not reproduced, and structured answer delivery and
resumed question/answer history were not established. #1443 stays open; this PR
neither closes it nor claims the existing synchronous fixture proves async input.
The [official app-server documentation](https://learn.chatgpt.com/docs/app-server)
also describes user-input requests as a distinct experimental request; the live
async item observation above is the evidence for the additional shape.

## Async questions and answer history (#1443)

A Codex `agentMessage` with `delivery: "async"` and structured `questions` is a
question item, not ordinary assistant answer text or folded work detail. Host
preserves its original text, delivery and original title/options as
`question.sourceQuestions`, alongside normalized form fields. No Markdown or
ordinary prose is guessed to be a question. Multiple question items retain their
own origin turn and request/item ID. `conversation.userInput` is only the first
pending question projection for existing polling and #1424 attention; it is not
another owner. Question forms and their answered history remain outside details.

The conversation owns question status and correlated answers. The atomic conversation
index stores these interactions; provider turns/text remain provider-owned. Resume
merges records by origin turn/item ID. Since #1530, unanswered async questions stay
pending across completion, interruption, failure, disconnection and reopen, including
daemon restart. Changing the default provider does not close them. Any window viewing
the conversation can answer them; hidden panels and history navigation impose no
answer lock. Answered/uncertain cards remain read-only.
Blocking callbacks remain live-memory RPCs and expire on resolution, turn end or
disconnection; they are not converted into follow-up messages. This preserves their
original secret-answer boundary and avoids replaying an obsolete RPC.
Secret blocking answers are masked in the index; the actual answer goes only to
the original provider callback.

The existing `assistantConversation { action: "answer", id, turnId, requestId,
answers }` validates exact own keys and one nonempty answer per question. It
consumes the pending interaction before dispatch, preventing duplicate delivery.
A blocking answer uses its exact RPC id. An async answer reuses the ordinary message send path: `turn/steer` while a turn
is active, or `turn/start` after completion, interruption or failure. The message
retains its originating question and turn IDs even when a later turn is active. Its user
message carries
`Litzio question answers (JSON)` with origin IDs, question text and answers. Host
retains that relation rather than displaying an unlabelled answer or raw JSON.
A failed/unknown async send is not automatically replayed. Explicit history resume
can reconcile a provider-recorded correlated answer; until then uncertainty remains
visible and #1424 requires attention. An accepted transport receipt is not proof
that a model has semantically used an answer.

CLI uses those same HTTP operations on an explicit Host:

```text
litzio assistant conversation <id> --host <origin>
litzio assistant answer <id> --file <answers.json> --host <origin>
```

`conversation` explicitly resumes/reads without starting a turn. The answer file is
`{ "turnId": "...", "requestId": "...", "answers": { "0": { "answers": ["음식 탐방"] } } }`.
Host rejection/uncertainty is nonzero; no local fallback, independent parser or
automatic retry exists.

### Question acceptance (#1530)

`request_litzio_user_input` accepts title/options questions and returns
`accepted:true` immediately after saving them in the conversation. Invalid input or
persistence failure returns `accepted:false`. Acceptance does not require a window,
render confirmation or a 10-second display deadline, and does not prove user attention
or model use of an answer. Native Codex async question events use the same retained
question/answer path. Copilot uses the shared Host question tool over HTTP MCP (#1536).

### Provider scope and validation

Codex fake stdio/HTTP/CLI and browser tests cover metadata, exact question IDs,
choices/free text, active-turn steering, follow-up turns, index/history merge,
restart, duplicate prevention and cross-conversation rejection. The #1530 regression
first failed with `Question expired.` when answering after completion. Blocking RPC
expiry and secret masking remain covered separately. No real AI invocation was
performed for #1530; fixture delivery is not proof of model use.

The following #1443 evidence describes historical verification before #1530:
The metadata test failed before implementation: the item was `assistant` instead
of `question`. Existing blocking/prototype-key/expiry checks remain.

Copilot: ACP SDK 0.17.1 has no native interactive-question callback; unsupported
session/request_user_input still receives -32601. The supported shared Host MCP
request_litzio_user_input tool now creates the same async question records as Codex.
This does not claim support for undocumented native ACP question extensions.

Actual Codex 0.167.0 + gpt-6-luna/low was driven through the actual Host and bundled
browser UI using the issue's travel question plus a free-text request. Rendering
acknowledgement preceded tool acceptance; the answer POST occurred while the turn
was in progress. The model replied `RECEIVED: 음식 탐방 / 아이와 쉬는 시간을 넣어 주세요.`
Explicit provider-history resume restored the same question and both answers.
[Sanitized proof](assets/assistant-question-1443/real-proof.json),
[actual pending card](assets/assistant-question-1443/real-pending-1440-light.png) and
[actual reopened record](assets/assistant-question-1443/real-reopened-1440-light.png)
contain only synthetic content. The helper Host/provider/browser processes were
closed. This does not establish real Copilot, remote/long-running sessions or
physical human attention; the native tool's unconditional receipt remains as above.

The existing provider/Host tests protect transport, persistence and CLI boundaries.
The focused `assistant-question` browser case protects DOM placement outside
folded details, hidden-panel attention/no acknowledgement, render gating,
choice/free-text interaction and reopened history. It is appended to the stable
suite without shifting existing shard positions; it does not duplicate Core rules.
Manual capture uses a separate [procedure](assets/assistant-question-1443/capture.browser.js),
not a screenshot-only CI loop. Same native form/Button/Input and surface/spacing
roles as #983/#1436; no new palette, control geometry or modal. Self-review found
no overlap or horizontal overflow at the supported widths. Owner visual approval
and an actual non-local connection are separate.

Before captures use the Host conversation mapping and bundled UI from parent
`5fd8dd08`, driven by the same synthetic native async travel question event.
The original text survives but no question card or pending-input projection exists.
Historical captures exercise the former Host-tool rendering acknowledgement;
the question content is the same, while the transport is explicitly different.

| View | Before: working question text | After: working question card | Answered record after reopening |
| --- | --- | --- | --- |
| 1440 Light | [Image](assets/assistant-question-1443/before-1440-light.png) | [Image](assets/assistant-question-1443/pending-1440-light.png) | [Image](assets/assistant-question-1443/reopened-1440-light.png) |
| 1440 Dark | [Image](assets/assistant-question-1443/before-1440-dark.png) | [Image](assets/assistant-question-1443/pending-1440-dark.png) | [Image](assets/assistant-question-1443/reopened-1440-dark.png) |
| 640 Light | [Image](assets/assistant-question-1443/before-640-light.png) | [Image](assets/assistant-question-1443/pending-640-light.png) | [Image](assets/assistant-question-1443/reopened-640-light.png) |
| 640 Dark | [Image](assets/assistant-question-1443/before-640-dark.png) | [Image](assets/assistant-question-1443/pending-640-dark.png) | [Image](assets/assistant-question-1443/reopened-640-dark.png) |

## Context account and usage (#1446)

The Context ring keeps the conversation's token usage first. On hover or keyboard
focus, Codex adds **Account** (login type, email and plan) and **Usage and limits**
(bucket name, each window's duration, percent used and reset time). Settings and the
ring share `AssistantAccount` / `AssistantRateLimits`, their translations and local
date formatting. Login methods use localized ChatGPT login / API key login labels,
not provider enum values. Durations split into localized days, hours and minutes
(300 minutes → 5 hours; 10080 minutes → 7 days). Reset times use local 24-hour
hours/minutes, adding the locale's numeric month/day only when not today; year and
seconds are omitted. Each quota window remains one unbroken line and the existing
Tooltip uses the standard max-w-md width limit. A logged-out account shows the
existing Host login notice; API-key login shows only its label. Neither state shows
quota rows. Copilot ACP provides no
account/quota diagnostic in the current integration, so its ring retains context only.

The existing target-Host diagnostics operation accepts
`summary=account-usage&provider=codex`. This hover-only projection reads just
`account/read` (`refreshToken:false`) and `account/rateLimits/read` through the
Host's existing daemon-lifetime app-server connection, without executable-version,
model or MCP discovery. Account and quota display fields are explicitly projected;
provider account IDs, tokens and other fields are not forwarded. No authentication
file or ChatGPT website usage API is read. Full Settings diagnostics still refreshes
and exposes its existing individual errors; the tooltip projection returns only
short Unavailable errors and never changes conversation state.

`ProviderConnections` owns a 60-second in-memory cache, including partial failures,
and shares concurrent reads. Official `account/rateLimits/updated` and
`account/updated` notifications invalidate it; disconnect also invalidates it. A
notification contains one rate-limit bucket, so the next read refetches the complete
multi-bucket snapshot rather than replacing the whole display with that bucket.
An account change during a read discards the old result. The tooltip reads when
opened and checks every five seconds only while visible, reusing the Host cache;
closing/hiding it or switching provider aborts the UI read and stops polling.
This is an Editor hover interaction over the existing diagnostics operation, not a
new document semantic operation or assistant tool.

Public references: [Paseo account usage CLI](https://github.com/getpaseo/paseo/blob/main/public-docs/cli.md#account-usage)
separates account quota windows/reset times from an agent's token use and caches
Host reads. Litzio reuses that distinction with a shorter 60-second cache and keeps
its existing Settings wording. Codex's [account protocol source](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/account.rs)
defines the rate-limit read and update payloads; the current Copilot ACP connection
only supplies models/modes/effort and session events, not account quota diagnostics.

Common implementation: the existing ring, shared Base UI Tooltip and current
foreground/background, border and spacing tokens. No new surface, persistent chrome,
control dimensions or common interaction exception. The same pattern in AI Settings
was checked and now shares the two display components.

Verification uses fake provider stdio/HTTP responses only: the existing connection
checks cover caching/expiry, concurrent reads, notification invalidation, multi-bucket
preservation and field projection; the assistant browser scenario covers pointer and
keyboard display, both windows, failure without disabling chat, logged-out/API-key
states and Copilot omission. No real AI request, real account quota, remote Host
connection or owner visual approval is claimed.

Manual native crops (1440/640px, English, 100% zoom, light/dark, synthetic account):
[1440 light Before](assets/assistant-usage-1446/before-1440-light.png) /
[After](assets/assistant-usage-1446/after-1440-light.png),
[1440 dark Before](assets/assistant-usage-1446/before-1440-dark.png) /
[After](assets/assistant-usage-1446/after-1440-dark.png),
[640 light Before](assets/assistant-usage-1446/before-640-light.png) /
[After](assets/assistant-usage-1446/after-640-light.png),
[640 dark Before](assets/assistant-usage-1446/before-640-dark.png) /
[After](assets/assistant-usage-1446/after-640-dark.png).
[Capture procedure](assets/assistant-usage-1446/capture.browser.js) excludes unrelated
Host labels and paths; all account values use `example.invalid` fixtures.
[Capture metadata and image hashes](assets/assistant-usage-1446/capture-metadata.json)
record the baseline and fixture conditions.

## Business account usage (#1453)

The existing Codex account/usage projection also supports Business snapshots whose
`primary` and `secondary` windows are null. Alongside period windows, each shared
rate-limit bucket can contain `planType`, `individualLimit` (limit, used,
remainingPercent, resetsAt), `credits` (hasCredits, unlimited, balance), and
`spendControlReached`. Host explicitly projects only these display fields; numeric
strings in limit/used/balance become finite numbers, preserving decimal usage until
rendering. No provider identifiers are copied or added to fixtures or logs. Both
multi-bucket and single-bucket responses use the same conversion. Existing official
RPCs, target-Host ownership, 60-second cache and notification invalidation are unchanged.

Settings and the Context tooltip share `AssistantRateLimits`: **Individual limit**
shows rounded integer usage/limit, used percentage derived from remainingPercent
(or usage/limit when remainingPercent is absent), and the existing compact local
reset time. Remaining percentage is a separate short line. Credit status is
**Credits available**, **No credits** or **Unlimited credits**, with the balance
when supplied; no currency/unit is invented. A reached spending limit adds a short
bold warning. The plan type accompanies the bucket name. Period windows remain
visible when present, including alongside individual limits. A successful snapshot
without any usable quota/credit/spending information says **No usage information**;
lookup failures still say **Unavailable**. All new wording is bundled in English/Korean.
The current Tooltip and its max-w-md width, typography and surface tokens are reused.

Regression evidence: before implementation, the added Business fixture produced
only `{name: 'Codex', windows: []}` and the shared renderer showed only the Codex
heading; both existing targeted tests failed. The updated provider and shell checks
cover the owner-reported null-window/string-number shape, multi/single-bucket
responses, period/individual coexistence, rounding, credit states/balance, warning
and empty information. The assistant browser scenario supplements its period-limit
hover check with the Business fields and row-clipping check. Tests and captures use
fake accounts and values only; real Business quota, backend timing and owner visual
approval are not established by these fixtures.

Manual native crops (1440/640px, English, light/dark, fixed date, synthetic Business
account; warning and balance deliberately enabled to show those states):
[1440 light Before](assets/assistant-usage-1453/before-1440-light.png) /
[After](assets/assistant-usage-1453/after-1440-light.png),
[1440 dark Before](assets/assistant-usage-1453/before-1440-dark.png) /
[After](assets/assistant-usage-1453/after-1440-dark.png),
[640 light Before](assets/assistant-usage-1453/before-640-light.png) /
[After](assets/assistant-usage-1453/after-640-light.png),
[640 dark Before](assets/assistant-usage-1453/before-640-dark.png) /
[After](assets/assistant-usage-1453/after-640-dark.png).
[Capture procedure](assets/assistant-usage-1453/capture.browser.js) and
[metadata/hashes](assets/assistant-usage-1453/capture-metadata.json) record fixture
conditions. Captures exclude unrelated Host identity and local paths.

## Review workspace tools (#1462 stage 5)

Codex registers the common review read/material, source-evidence run, immediate correction application, inspection, image-read and request-status tools. [The plugin contract](plugin-stage1-v1.md#비서-국소-제안-1462-5단계) defines their inputs, CLI parity and boundaries. The assistant applies corrections without a question or human approval using `apply_review_groups`; rejection/Undo/completion retain human paths.

2026-11-12 owner decision (#1529): image reads need no estimate, question or human preapproval. `read_review_images {path,pageNo,target?}` returns the valid page or target regions directly. The returned runId correlates measurement and inspection only; it grants no permission. Workspace/file baseline, document revision and page/target validity remain checked. Actual provider turn usage is recorded separately without per-image attribution and never gates reads.

`record_review_inspection` uses material actually returned in this conversation at the current workspace and document/content revision, including previous turns. Image inspections record inspected subsets cumulatively using the returned image runId; unread or uninspected portions remain not compared. Summary/inventory alone is no reading proof. Correction application is immediate (#1531); rejection/Undo/completion retain human paths. Invalid proposal input retains existing validation reasons with `invalid_input`, field paths/expected formats or current revision/baseline when known. No new validation rule is introduced.

The image-estimate card and its special question linkage are removed. Ordinary async questions follow the retained-question lifecycle in #1530 above. The earlier image-card captures document the removed UI, not current behavior.



### Pending existing-document edits (#1494)

Only an explicit user edit request authorizes editing an existing document. The Assistant starts or finds a conversation-owned pending copy and prefers the shell-free Host tools below to edit that copy. Existing CLI semantic operations (`inspect`, `apply-batch --operations <json-file> --if-revision <revision>`, `check`) remain available for full-access terminal continuation. It never edits the original or applies/discards a pending copy. New documents are still created immediately. Read-only turns cannot create copies. Both Codex and Copilot support opened-folders and full-access through the same Host tools. Copilot opened-folders asks before shell execution; the Host tools require no shell exception. Read-only turns may inspect existing copies but cannot create or edit them.

Host receipts live under the Assistant directory, scoped by conversation; copies are hidden `.litzio-change-<uuid>.md` siblings of the original. This keeps copies within opened folder grants and preserves relative images/attachments. The existing hidden-entry filtering omits copies from document lists and Explorer-backed search. Assistant working-directory copies would change the relative asset base and fall outside document roots. Pending records survive Host restart. Deleting a Host conversation removes its copies; provider-owned history is not deleted.

`stage_document({path})` is the shared Host start/find tool for Codex and Copilot. It returns the original path, copy path, base revision and change ID. Terminal continuation can use `litzio assistant changes start <conversationId> --path <absolute-path>` through the Host-owned CLI shim. Message context includes conversationId; the shim propagates the selected Host Assistant directory. No assistant apply tool exists.

The shared Host conversation actions are `changes-list`, `changes-start`, `changes-preview`, `changes-apply`, `changes-discard`. Scope is the selected Host and conversation ID; preview/apply/discard also take `change`. Apply requires the preview's `copyRevision` and `diskRevision`; the original must still match the creation revision. The result is an applied path/revision receipt or discarded path receipt. An original or pending-copy change refuses writing and requires refreshed comparison. There is no force overwrite or partial apply.

CLI parity: `litzio assistant changes <list|start|preview|apply|discard> <conversationId> [--path <absolute-original>] [--change <id>] [--copy-revision <hash> --disk-revision <hash>] [--host <origin>]`. Explicit Host uses HTTP with no fallback/replay; local invocation uses the same Host operations/storage. Assistant instructions prohibit self-application; consent remains an instruction contract, as with existing document creation.

Pending targets and Review are compact fixed rows immediately above the composer, outside the scrolling transcript (#1539). The selected Host/conversation's changes-list includes current copyRevision. The window keeps its pre-turn revision baseline and, once a response ends, automatically opens each new or revised copy through the same Review tab path once. While a new send awaits its turn snapshot, changes-list may refresh the rows but cannot consume the pre-turn baseline or open a comparison. Unchanged polls and later turns without copy edits do not reopen comparisons. Initial resting history only populates rows. Automatic opening preserves composer focus, including the narrow overlay while typing. When focus is inside an editable document, automatic opening uses the existing group background action and keeps that document active; explicit Review still selects the comparison. With composer focus or no document editing in progress, automatic opening brings the comparison forward. Review opens an existing task tab with SourceCompare/VisualCompare and Core block comparison, plus whole-document Apply/Discard. Relative assets render using the original path. Apply serializes/validates through Core and uses the common revision-checked file commit. Open editor drafts are preserved; the UI refuses application while that document has unsaved edits, and ordinary external-change detection and Save revision checks remain in force. After successful Apply, the sending window reloads the matching clean open document through its existing session load path (#1540). After this succeeds, it closes the pending comparison through the existing tab-close path and selects the original in its existing group, or opens the original if it is not already open (#1552). Successful Discard only closes the comparison; the existing close path restores focus to the remaining active tab. Refused or failed operations retain the comparison and its reason. A new local edit or busy session during the request prevents that reload and is reported beside the successful disk outcome. The automatic native reload also rechecks hasUnsavedChanges (including unapplied drafts) immediately before installing the GET response, retaining any edits entered during the read and the existing disk-applied/reload guidance. Explicit discard-and-reload semantics are unchanged. Unsaved-edit and original-change reasons/actions appear beside Apply; Host errors remain visible there with refreshed comparison. During an active Assistant turn the Host refuses application/discard. No edit history, partial apply, new permission system or shared editing session is introduced.

Verification layers: Host tests protect persistence, permission refusal, hidden sibling discovery, CLI semantic edits, stale preview/copy and original conflicts. Browser tests protect the pending card, comparison tab, Core visual comparison and unsaved editor guard. These synthetic checks do not claim a live model invocation or Copilot sandbox equivalence.


`litzio assistant delete <id> --host <origin>` calls the Host conversation deletion action; it refuses active turns, removes pending copies and the Host index entry, and does not delete provider-owned history.

Visual review uses the existing task-tab, Button and comparison patterns without a common-interaction exception: [1440px before](assets/assistant-changes-1494/before-1440.png), [pending card](assets/assistant-changes-1494/pending-1440.png), [1440px comparison](assets/assistant-changes-1494/compare-1440.png), [640px Korean dark](assets/assistant-changes-1494/compare-640-ko-dark.png). Captures use synthetic document/provider data; the local Host identity is masked. Controls, wrapping, comparison scrolling and narrow overlay return were checked. The new browser scenario is registered in the stable suite and fixture selection. Host/CLI tests own disk revision and persistence defects; browser coverage owns tab admission, unsaved-editor refusal and Discard, without duplicating disk fault combinations or introducing extra subprocesses. Targeted Host/provider/fixture tests completed in 14 seconds; the browser capture run completed in 19 seconds. No paid AI call or packaged Desktop validation was run locally.


### Pending change review verification (#1539, #1540)

The existing assistant-changes browser scenario reproduces #1540 with a fake provider: Apply writes the scratch original and reports success, but before the fix its open editor still showed `Alpha.` instead of `Proposed change.`. This establishes the stale open-tab defect, not the exact cause of every owner report. The extended scenario checks the fixed composer rows, turn-end opening, preserved input focus, no repeated reopening, same-copy revision updates, clean-tab reload and existing unsaved/Discard guards. #1552 extends this same scenario to check successful Apply closing the comparison and showing the original (including when no original tab is open), successful Discard closing the comparison, and refusal retaining the tab. The existing tab close/focus and document open paths are reused without new controls or a shared-interaction exception. Host coverage checks list copy revisions; disk conflict/Core protections remain unchanged. Independent-review follow-up reproduces the pending-GET overwrite in two groups at 1920px and the foreground-tab takeover while typing in another document; the same browser scenario now checks edit preservation, existing guidance, background opening and explicit Review selection. No new state, confirmation step or capture surface was added.

One real Codex `gpt-6-luna` / `low` / Full access turn on a synthetic Korean paragraph used read_document → stage_document → inspect_staged_document → edit_staged_document. Two invalid operation inputs were corrected within that turn; the final copy contained the requested Tuesday wording and the original stayed unchanged. No direct-original write was observed, so provider instructions were unchanged. The installed Copilot CLI exposed only `auto`; the owner confirmed Auto as this environment's cheapest choice. One Auto / low / Full access turn, run before integrating #1537, left the original unchanged and created no pending copy: it reported that Litzio staging/edit tools were unavailable and declined the edit. Copilot editing success therefore remains unverified; no direct-original write was observed and instructions were unchanged. The missing-tool connection is outside this UI fix.

Visual evidence uses the existing Button ghost/sm, Tooltip, composer and comparison task tab, with existing spacing/text/surface tokens and no new shared interaction exception: [1440px light](assets/assistant-changes-1539/light-1440.png), [1440px dark](assets/assistant-changes-1539/dark-1440.png). Synthetic provider/document data and masked Host identity are used. Captures are a separate manual review, not CI success artifacts. Direct inspection confirmed composer row/control alignment, unclipped filenames and Korean controls, and light/dark contrast.


With default full-access, shell access can modify originals. Waiting for human [Apply] is an instruction contract, not technical shell containment.

### Shell-free pending-copy operations (#1500, stage 0b)

The shared tool array exposes `inspect_staged_document({change})` and `edit_staged_document({change, copyRevision, operations})` beside `stage_document` through Codex dynamic tools and Copilot HTTP MCP (#1509). Both use the same dispatch; the MCP lease supplies the conversation/turn and the Host rechecks active turn, folder scope and receipt ownership. Inputs and receipts are provider-neutral; the active turn supplies the conversation, opened folders and permission. There is no path input or original-apply tool. Inspect reuses CLI inspect's current node paths/text/numbering and returns `copyRevision`. Edit takes the existing apply-batch JSON array (command plus options); inspect again after structural edits. A successful result means **사본 완료·사람 적용 대기**.

Host actions `changes-inspect` and `changes-edit` share that implementation. CLI parity is `litzio assistant changes inspect <conversationId> --change <id>` and `litzio assistant changes edit <conversationId> --change <id> --copy-revision <hash> --operations <json-file>`, optionally `--host <origin>`. Failure/uncertain receipts exit nonzero; no automatic replay occurs.

The Node Host adapter `document-edit-commands.ts` owns the extracted CLI JSON/flag conversion and Core operation dispatch; CLI imports it as it already imports other shared Host operations. Core still owns document semantics. No new operations are introduced. All operations and canonical validation complete before the single revision-checked copy commit. A failed step identifies its one-based operation number and reason, and writes nothing. Receipts reuse `outcome: success|failure|uncertain` and `errorKind: invalid_input|conflict|forbidden|unavailable|uncertain`: malformed/failed operations, stale revision, denied scope, missing receipt/copy, or unconfirmed commit respectively. Inspect does not require edit permission; edit rejects read-only turns and rechecks both original and copy against current folders. Copies cannot redirect writes through a symlink to the original. Human Apply retains its existing original/copy revision checks.

Host tests protect atomic failure, revision conflict, ownership, permissions and commit uncertainty. Existing CLI regression tests protect the extracted conversion behavior. Actual model evidence is recorded in the PR separately from these synthetic tests. The existing fake-provider HTTP MCP test verifies the shared descriptors, copy-only success, atomic failure, revision conflicts, change-ID ownership, read-only refusal and ended-turn revocation. It does not establish a real Copilot invocation. New semantic operations, partial Apply and original writes remain outside stage 0b.

### Structured creation and editing (#1500, stage 1)

`create_document({path,title,operations})` applies the same `document-edit-commands.ts` batch conversion used by CLI and pending-copy edits to an empty Core document in memory. All operations and canonical serialization complete before exclusive file creation; no intermediate empty file or pending copy is created. The existing paragraph/heading `blocks` input remains available, but cannot be combined with `operations`. Template input remains separate. This avoids a second per-block authoring schema and preserves the existing CLI/Core semantic boundary.

Tables, lists, figures and captions use existing `insert-table`, `insert-list`, `insert-figure`, `update-figure`, `update-table-caption`, `update-table-cell` commands; existing code, equation, quote and admonition operations are also available. Inspect pending-copy paths again after structural edits. Host scope/effect is new-file creation or conversation-owned copy writes only; original application stays with the human. CLI parity is the existing `create` plus `apply-batch`, and `assistant changes edit`. Shared document tool definitions remain provider-neutral.

Ordinary creation adds `receipt.outcome:success` to its existing path/source/revision/identity receipt. Creation failures use `receipt.outcome:failure|uncertain` and `errorKind:invalid_input|conflict|forbidden|unavailable|uncertain`; existing target is conflict, bad operations are invalid_input, denied scope is forbidden, missing parent is unavailable and unconfirmed I/O is uncertain. Do not replay uncertain writes.

Creation and copy-edit success also report a separate `readiness` array for Figure assets: path, label, source and status `available|missing_or_unreadable|unavailable|unchecked|pending|embedded`. Canonical validity does not establish image existence or decoding. Host document-relative media resolution and access checks determine availability; outside-directory references are unavailable, remote/absolute sources are unchecked, missing/unreadable local files warn without blocking valid document writes, as with CLI check. Figure operations alone do not generate or copy image files. Use `import_document_image` before inserting a local image. Asset checks are point-in-time file checks, not rendered-image verification.

## Smooth assistant output (#1522, #1523)

Snapshot reads apply conversation content before window work or acknowledgements.
Submission lookups run independently and do not replace an already selected
conversation's newer snapshot. Each read path is nonoverlapping, including across
observer restarts. Window work is serialized separately; existing request IDs,
cached replies, deadlines, visibility and scope invalidation remain authoritative.
No message is automatically resent. A slow read can exceed the 100ms target;
reads never overlap to catch up.

The conversation retains the complete received answer. Only an active answer's
rendered slice is paced, using a roughly 150ms backlog horizon, at most 60Hz,
and grapheme-safe cuts. Unsupported segmentation renders the complete source.
Completion, interruption and failure show the exact source immediately; replacement
text resets pacing and unmount cancels its frame. Copy at turn end uses the complete
conversation. Existing bottom-follow, reader detachment, turn/item identities and
work disclosure ownership remain unchanged. The existing panel, Button, Tooltip and
native details are reused; no new surface or common interaction exception is added.
This behavior was implemented independently from the observed Paseo behavior;
Paseo source was not copied. SSE/WebSocket push is outside this change; reconsider
it separately if remote Host use still shows gaps.

Synthetic fake-Codex 1440px captures (no account or real AI call):
[accepted before provider observation, before](assets/assistant-smooth-1523/before-1440-light.png),
[accepted after](assets/assistant-smooth-1523/after-1440-light.png),
[streamed output, Korean Dark](assets/assistant-smooth-1523/after-1440-dark-ko.png).
The OS-account footer is masked. Alignment, spacing, clipping and Korean wrapping
were visually inspected. Existing 640px assertions remain in the assistant browser
scenario; the panel layout and supported minimum width are unchanged.

### #1529 verification (2026-11-12)

Fixed LSR conversion results were reused; no conversion was run. The existing Host/provider test covers direct image delivery, no question, invalid pages/targets, current revision rejection, returned-material history across turns and proposal error details. These protect Host/provider integration rather than image quality. The small existing review-tools test covers previous-turn text material and usage; the general question browser regression remains unchanged.

One actual Codex `gpt-6-luna`/`low` turn called `read_review_images` once, returned one image with success, and completed with `IMAGE_READ_OK`. This verifies image transport only, not findings or inspection quality. Before removing preapproval, the #1527 fake provider reproduced immediate turn completion after question-tool return and rejection of the human answer. Code inspection of [Codex dynamic response forwarding](https://github.com/openai/codex/blob/d7840f9f22f330dd67e0a1638f66591ae221df36/codex-rs/app-server/src/dynamic_tools.rs) and [Core response waiting](https://github.com/openai/codex/blob/d7840f9f22f330dd67e0a1638f66591ae221df36/codex-rs/core/src/tools/handlers/dynamic.rs) found response/cancellation waiting without a dynamic-tool timer. Litzio's 15-second outbound RPC timer is separate from inbound tool calls. No actual multi-minute human-wait test was run; #1529 removes that wait entirely.

### Retained question UI evidence (#1530)

The existing AssistantQuestion form, compact Button/Input and theme tokens are reused;
no new surface or geometry exception is introduced. Manual fixture captures show an
answerable question after its turn has completed, followed by reopened answer history:
[1440 Light pending](assets/assistant-question-1530/pending-1440-light.png),
[1440 Dark pending](assets/assistant-question-1530/pending-1440-dark.png),
[1440 Light history](assets/assistant-question-1530/reopened-1440-light.png),
[1440 Dark history](assets/assistant-question-1530/reopened-1440-dark.png).
These are manual review evidence, not owner visual approval or a real model response.


## Provider approvals (#1536)

Restricted Codex turns use approvalPolicy on-request; Full access keeps never.
Command execution and file-change approvals use blocking question cards with allow,
reject and session allow. MCP elicitation offers accept/reject; form content can be
entered as JSON and is validated with the MCP SDK JSON Schema validator before the
answer is consumed. URL elicitation displays the supplied URL; Litzio does not open
it automatically. Elicitation answer content is masked in the conversation index.
No timer or extra approval lifetime is added: the inbound provider RPC owns the
wait. Resolution, interruption, completion, disconnect and shutdown release it.
Callbacks are correlated by conversation, turn and typed RPC ID; parallel approvals
and duplicate responses do not cross-deliver. Pending callbacks are never restored
from disk. Cards remain in conversation history after the RPC ends.

Full access document and review Host tools use the selected Host's file policy
without the conversation's opened-folder limit. Discovery without a path still
starts at the opened folders. Restricted Host tools retain that limit and return
an actionable reason to change permission or open the containing folder, rather
than introducing a second Host approval state. Original revision checks, staged
copy review, secret/private plugin-operation restrictions and Host selection remain.
Permission records carry approval:true. AssistantQuestion renders their allow,
session-allow and reject choices as compact buttons: one click or Enter sends the
provider choice immediately, using the same submission lock and response path.
Title, target path and answer history remain in the card. General questions and
elicitation forms that collect values keep their existing selection/input and
submit flow. The UI reuses AssistantQuestion, compact Button and existing tokens.


#1536 verification (2026-11-12): fake Codex and ACP cover allow, reject, session
allow, cancellation, typed request IDs, validated elicitation and unchanged staged
copy/Host boundaries. An actual Codex gpt-6-luna/low opened-folder turn issued one
approval card, received allow-once through the Host answer operation and read an
outside-folder scratch file. One actual Copilot Auto/low turn issued two permission
cards and completed the same read. Its ACP catalog offered only Auto, so no cheaper
named model could be selected. These probes used Host answers, not UI clicks;
they do not establish long waits, remote Hosts or real MCP elicitation. Browser
fixture clicks separately verify the existing card UI at 1440px in both themes.
[Light capture](assets/assistant-provider-approvals/approval-1440-light.png) and
[dark capture](assets/assistant-provider-approvals/approval-1440-dark.png) omit local account identity.
Owner visual approval is not claimed.

## Immediate review corrections (#1531, 2026-11-12)

The owner decision supersedes the 11-11 proposal-only/human-approval plan. `apply_review_groups {path,change}` accepts the existing groups-propose schema (including supersedes) and calls shared groups-apply with Host-supplied assistant attribution. Proposal validation and Core application share one candidate and atomic commit. Before/locator validation, observed baseline, request status and no automatic replay remain unchanged. History records assistant separately from human evidence. People see applied corrections, Undo them and request further edits in conversation; after Undo the assistant supersedes the reopened proposal when correcting again. Page-exclusion proposals keep their human review path. Completion and required checks are unchanged. Direct editing of the workspace document is a follow-up; no edit entry is added here. General staged document editing (#1494) is unchanged.

### Image assets (#1554, #1555)

`import_document_image({path,source})` copies an absolute Host image source into the original document's `assets/` folder and returns `{path,receipt:{outcome:"success"}}`. Codex dynamic tools and Copilot HTTP MCP expose the same definition. CLI parity is `litzio assistant import-image <absolute-document> --source <absolute-image>`, executing the same Host operation locally. The CLI acts with its process filesystem access, not a conversation grant.

The operation reuses Editor image validation and exclusive publication, preserving descriptive names and allocating `-2`, `-3` on collisions. PNG/JPEG/GIF/WebP and existing byte limits apply. It changes no document text. Assets are copied immediately next to the original; pending copies share that directory, so comparison media resolves from the original path. Copy discard/Undo leaves these add-only assets. This avoids an additional deferred asset lifecycle. Insert the returned relative path with `insert-figure` on the pending copy, then leave Apply to the human.

Read-only turns refuse imports. Opened-folders mode checks both target and source; outside-folder sources return `forbidden` with the existing #1537 recovery: open the containing folder or choose Full access and retry. No independent Host grant is added. Full access still obeys Host fixed Roots. Source attachments and generated files use their absolute Host paths under the same policy.

On the #1543 baseline, Host regressions confirm that valid Figures with available, missing and outside-directory local references survive preview and Apply: asset readiness does not block canonical writes. The original owner-reported no-apply symptom was not reproduced by these inputs. Existing revision/unsaved-work/active-response refusals remain enforced and reported; missing-image rendering falls back to source comparison without certifying an image preview. The browser regression additionally imports an image through the shared tool, edits the copy, decodes it in comparison, applies via the revision-checked Host operation and verifies the refreshed original image. This fixture evidence is separate from real provider verification.

A separate synthetic raw Markdown image (`![Desk](images/writing-desk.png)`, outside a Figure) does reproduce Core `Unsupported native content: image` refusal. This is not proof that the owner's copy used that syntax. Preview and Apply now retain the Core reason and tell the human to discard/recreate the copy with supported document tools (`insert-figure` for images); the original stays unchanged. Malformed copies cannot be repaired by semantic operations that require a valid native input, so the guidance does not promise in-place repair. Existing comparison error rendering shows this refusal while Apply remains unavailable.
