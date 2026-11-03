# Interface inventory #1132 — Astra 독립 조사

- Status: Historical (결정 자료이며 구현 계약 아님)
- Last verified: 2026-11-04, 코드·문서 정적 대조. 제품 실행·실제 AI 호출·패키징 검증 없음.
- 기준: `origin/master` = `893290e29f383bb04fb20bc50e9130077dc88764`. 브랜치 `research/1132-interface-inventory-astra`.
- 범위: #1132 본문, AGENTS.md, docs index, Accepted ADR 및 현행 계약, 현재 코드. 다른 조사 브랜치와 #1132 댓글은 읽지 않았다. 하위 agent 없음.
- 소유자의 명시적 지시에 따라 docs index에는 연결하지 않는다. 일반 문서 색인 규칙에 대한 이번 조사 산출물만의 예외다.

## 결론

**(b)를 축소한 단계적 공용 작업 계약을 추천한다. 자동 Host 탐색과 daemon은 첫 단계에서 제외한다.** 이미 Core 의미 연산, file-commit, 템플릿 저장 함수, 플러그인 invoke가 공유되고 있다. 필요한 것은 이를 새 플랫폼으로 감싸는 전면 재작성보다, 빠진 사용자 작업을 명시하고 같은 실행 함수에 화면·CLI·비서 진입점을 연결하는 일이다.

“새 기능은 CLI 필수”만으로는 결과 카드·권한·미저장 탭의 불일치가 해결되지 않는다. 반대로 “모든 UI 기능을 Host 작업으로 옮긴다”도 부적절하다. 문서 의미, 디스크 작업, 실행 중 작업, 특정 창의 interaction은 수명이 다르다. 창의 Undo와 복구는 operation registry를 만들어도 공유되지 않는다.

첫 사례는 #1128 템플릿이 적합하다. 현재는 **화면 갤러리·HTTP·CLI 모두 구현**되어 있으므로 이슈 본문의 “HTTP·CLI에만”은 이 기준 SHA에서는 오래된 설명이다. 빈칸은 비서의 템플릿 도구와 생성 receipt/카드다. 기존 템플릿 함수를 재사용하고 `create_document`의 생성 경로를 통합하면 작은 범위에서 효과를 확인할 수 있다. [T][DT][TG]

## 조사 범위와 표 읽는 법

아래 기능 표는 지원을 코드로 확인한 목록이지 실행 성공 보증이 아니다. `없음`은 Litzio의 명시적인 공개 명령/도구가 없다는 뜻이다. OS shell이나 임의 HTTP 요청으로 우회 가능한 것은 기능 parity로 세지 않는다. CLI 부재는 명령 목록과 dispatch [C], 비서 부재는 전체 동적 도구 배열 [DT]로 확인했다. Copilot 열은 Litzio 비서 안의 Copilot ACP를 뜻한다. 네이티브 Copilot shell/read 도구와 Litzio 전용 도구는 구별한다.

표의 약호는 말미의 **고정 SHA 파일·행 링크**다. UI 파일은 진입점, Host/CLI 파일은 dispatch와 실제 실행 경로를 함께 제시한다. HTTP `/api/*`는 별도 표시가 없으면 Desktop custom protocol에서도 같은 handler를 호출한다 [H][NET][DP].

## 기능별 현황

| 사용자 기능 | 화면(Editor UI) | Host HTTP / Desktop | CLI 명령 | Codex 동적 도구 | Copilot 사용 가능 여부 | 의미·검증 실제 소유자 |
| --- | --- | --- | --- | --- | --- | --- |
| 네이티브 문서 열기·읽기·검사 | 파일 선택, 탭, Source [S] | `GET /api/document`, `/api/document-source` [H] | `inspect`, `check` [C] (화면 열기 아님) | `read_document`: 저장 원문·revision [DT] | 참조 경로를 provider 내장 도구로 읽음. Litzio 도구 없음 [ACP] | Core native admission/read model; Host 경로·디코딩 [CORE][H][R] |
| 빈 문서 / 제목·본문을 가진 새 문서 | New 폴더/이름 흐름 [S] | `PUT /api/document` [H] | `create` + 편집/`apply-batch` [C] | `create_document`: 제목·평문 문단·heading만 [DT] | 전용 생성·receipt 없음. full access shell 가능성과 제품 지원은 별개 [ACP] | Core 생성/직렬화; 세 인터페이스가 exclusive create 각각 실행 [C][H][DT] |
| 본문·블록 편집(문단, 목록, 인용, 코드, 수식, Figure, 표, 미주, 참조) | Tiptap 문서 편집 [SESSION] | live 편집 endpoint는 없음. Save 때 `POST /api/document`의 SupportedEdits 재적용 [H][R] | `replace-text`, `insert-*`, `update-*`, `remove-*`, `move-*`, `apply-batch`, `format` [C] | 기존 문서 편집 도구 없음 [DT] | 기존 문서는 텍스트 제안만이라는 제품 지시; 강제 write 차단과는 다름 [ACP] | 의미·유효성 Core; Editor engine interaction; Host replay는 Core 호출 [CORE][R] |
| 제목·번호·참조 스타일 등 문서 설정 | DocumentSettings [DS] | 별도 settings 저장소 없음, 문서 Save [H][R] | `update-title`, `update-heading-numbering`, `update-reference-templates`, `update-numbering-mode`, `update-enumerator` [C] | 없음(생성 시 title만) [DT] | 전용 도구 없음 [ACP] | Core frontmatter/번호 의미, UI draft [CORE][DS] |
| 저장·외부 변경 충돌·source preview | 명시 Save, 비교/충돌 UI [S][SESSION] | `POST /api/document`, `POST /api/document-source`; revision 검사 [H] | 편집 즉시 commit, `--if-revision`, `--dry-run` [C] (열린 탭 Save 아님) | 별도 Save 없음; create 즉시 디스크 기록 [DT] | 열린 탭 Save 불가 [ACP] | Core canonical write + Host/CLI revision + 공용 file-commit [R][FC][C] |
| 비네이티브 .md / .txt 텍스트 편집 | TextDocumentTab [TEXT] | GET document의 text 분기, POST text save [H] | 일반 텍스트 편집 명령 없음; native CLI는 거부 [C] | read는 가능, edit 없음 [DT] | 경로 읽기는 가능, 제품 편집 도구 없음 [ACP] | Host native 여부 재검사 후 문자열 commit; Core native 의미와 별개 [H][FC] |
| 미저장 복구·Undo/Redo | IndexedDB 복구·Tiptap history [REC][SESSION] | source recovery preview는 있음. 복구 레코드/engine history 저장 서비스 없음 [H][REC] | 없음 [C] | 없음 [DT] | 없음 [ACP] | 창의 Editor/브라우저 로컬 저장소. Host는 disk revision만 검사 |
| 폴더 탐색·열린 폴더·새 폴더 | Sidebar/폴더 선택 [APP] | GET/POST `/api/folder`, GET `/api/folder-browse`, `/api/folder-places`, `/api/folder-version` [H] | 전용 명령 없음 [C] | `list_documents`: 한 단계 문서/폴더만; open/create folder 없음 [DT] | 경로 기반 내장 도구 조건부; 열린 폴더 UI 변경 없음 [ACP] | Host filesystem/RootAccess; 열린 폴더 목록은 UI preferences [ACCESS][PREF] |
| 파일 삭제·이름 변경·이미지 참조 재작성 | Explorer 작업, dirty 검사, 확인 [APP] | `DELETE/PATCH /api/file`; Desktop 삭제는 trash 주입 [FILES][DP] | 파일 작업 없음. `update-media-references`는 한 문서 의미 연산만 [C] | 없음 [DT] | 전용 도구 없음 [ACP] | Host 파일 orchestration + Core media reference 변경; UI가 현재 창 dirty 정보를 제출 [FILES] |
| 이미지 선택·붙여넣기·업로드·rollback | Figure/clipboard/drop [IMG] | `POST/DELETE /api/asset` (이미지 읽기는 `/document/` media 경로), `/api/figure-validation`, `/api/file-preview` [ASSET][H] | `insert-figure`, `update-figure`는 의미만; 업로드/receipt rollback 없음 [C] | 없음 [DT] | 전용 도구 없음 [ACP] | Host 경로/MIME/receipt, Core Figure, Editor history [ASSET][CORE][IMG] |
| 템플릿 목록·읽기·미리보기 | TemplateGallery [TG] | GET `/api/templates`, `/api/template` [H][T] | `templates list/read` [C] | **없음** [DT] | Codex skill picker 없음; 제한 모드 shell 경로도 막힘 [ACP] | Core template metadata; 공용 Host store의 이름·충돌·링크 검사 [T][CORE] |
| 템플릿에서 생성·현재 문서를 템플릿으로 저장 | 갤러리 생성, SaveTemplateDialog; dirty면 먼저 Save [TG][TS] | PUT document의 template/language; POST templates의 from/name [H][T] | `create --template`, `templates save --from` [C] | **없음**. 생성 지시는 CLI를 안내하며 create receipt가 안 생김 [GUIDE][DT] | 전용 경로 없음; full access의 shell 가능성이 동등한 UX를 뜻하지 않음 [ACP] | Core template 제거·보존; Host store + 각 create write path [T][C][H] |
| 표시 설정(테마·강조색·언어·폭·배경·표 줄바꿈) | Display/Settings [SET][PREF] | 일반 HTTP 설정 endpoint 없음. Desktop theme/background IPC는 창 표현 연동 [DESK] | 없음 [C] | 없음 [DT] | 없음 [ACP] | localStorage 및 화면; 문서 설정과 분리 [PREF] |
| 플러그인 목록·재등록·켜기/끄기 | PluginSettings, 기본 포함 버전 재등록 [PS] | GET/POST/PATCH/DELETE `/api/worker-plugins`; manifest 등록 가능 [H] | `plugins list`, `plugins reregister`; 일반 register/enable/disable 없음 [C] | 없음 [DT] | 없음 [ACP] | Host store/runtime의 manifest·hash·활성 상태·drain [PH][STORE] |
| 플러그인 설정·UI 기여 | 플러그인 설정/명령/탭; 동적 연결·해제 [PS][PUI] | `/api/ui-plugins`, 검증 asset surface; `/api/plugin-operation` 및 plugin routes [H][PH] | generic plugin invoke 명령 없음 [C] | plugin tool 자동 발견 없음 [DT] | 없음 [ACP] | Host 설치 검증; plugin 설정; Renderer activation/error boundary [PH][PUI] |
| Docling 서버 설정·기능 on/off·연결 확인 | Settings / Dashboard [DU] | `/api/docling-settings`, `-check`, `-features`, `-dashboard` [DH] | 전용 설정 명령 없음; convert-pdf에 `--server` [C] | 없음 [DT] | 전용 도구 없음 [ACP] | 플러그인 검증 + Host 경로/설정 주입 [DH][PH] |
| Docling 변환·취소·기록 | PDF 변환, Dashboard 결과/기록 [DU] | `/api/docling-conversion` GET/POST/DELETE, `-history` POST/DELETE [DH] | `docling convert`, `convert-pdf`; 일반 작업 목록/취소 명령 없음 [C] | 없음 [DT] | 없음 [ACP] | plugin 변환/Core 출력 검증; Host worker/SQLite 요청·publication [DH][PH][STORE] |
| Docling 대조·AI 검수·제안 승인/거절/되돌리기 | CompareView / ReviewPanel [DU] | `-compare`, `-review`, `-review-agent`, `-review-approve/reject/undo` [DH] | `add-correction`, `remove-correction`, `apply-corrections`만. 검수 시작/제안 결정 CLI 없음 [C] | 없음 [DT] | 비서 provider로 Copilot 선택해도 기능 검수는 Codex exec [ACP] | plugin 제안·기준값/낡음·교정 ledger, Core 결과 의미; Host AI service [DH][PH] |
| AI provider·모델·추론·언어·쓰기 범위·진단 | AI Settings, 명시 Save [AIUI] | `/api/ai-agent-settings`, `-models`, `-diagnostics`, `-environment` [PH][AIH] | Litzio 설정 명령 없음 [C] | 자기 설정 변경 도구 없음 [DT] | provider 선택/모델 대화 가능. Codex account/MCP 진단은 제외 [ACP] | plugin 설정 schema/저장 + Host live catalog/연결 정책 [AIH][PH] |
| AI 대화·기록·중단·steer·질문 | AssistantPanel [AP] | GET/POST `/api/ai-agent-conversations` (send/resume/interrupt/answer) [PH][CONV] | Litzio 대화 명령 없음; Codex CLI의 thread 재개는 다른 클라이언트 [C][GUIDE] | 대화를 관리하는 동적 도구 없음 [DT] | 대화/중단/조건부 history; active turn steer 없음 [ACP] | Host 연결·metadata index, provider transcript, 화면 composer [CONV][AP] |
| 스킬 선택·파일 참조 | `/` Codex skills, `@`/Explorer 참조 [AP] | `/api/ai-agent-skills`; 대화 입력 references, Host 재검사 [PH][CONV] | 전용 명령 없음 [C] | skill은 provider 입력, Litzio dynamic function 아님 [DT][GUIDE] | 파일 경로 참조 가능, Codex skills 선택 없음 [ACP] | Host scope·열린 폴더 검사 + provider skills, UI 선택 상태 [CONV] |
| 새 문서 결과 카드·생성 되돌리기 | receipt 카드 Open/Undo, 변경·dirty·복구 확인 [APP][GUIDE] | create 도구 receipt와 `/api/file` checkOnly/expectedRevision/expectedIdentity [DT][FILES] | CLI 생성에는 카드 receipt 없음 [C][GUIDE] | create 성공 결과만 기반 [DT][CONV] | Litzio 카드 없음 [ACP] | Host file identity/revision + 화면의 세션·복구 보호; 일반 engine Undo와 별개 |
| Desktop 업데이트·채널·CLI PATH 통합·OS 폴더 열기 | Desktop bridge 있을 때 Settings/About [SET] | `desktop:check/download/install/set-channel`, `cli-state/cli-set`, `open-folder` IPC; 일반 HTTP 아님 [DESK] | `--version`, `serve`만; 설치/업데이트 명령 없음 [C] | 없음 [DT] | 없음 [ACP] | Electron updater/preferences/CLI integration, 창 종료·dirty 승인 [DESK] |

## 구조 관찰

### 공유 중인 것과 직접 파일 경로

1. CLI `edit`는 read→parse→Core change→serialize→`commitFile`로 디스크를 직접 바꾼다. 실행 중 Desktop/HTTP Host 탐색도, 해당 창에 상태 전달도 없다. `--if-revision`은 디스크 revision에 대한 조건이며 미저장 탭 revision을 뜻하지 않는다 [C:974–1030].
2. CLI `create`는 직접 `writeFileSync(..., wx)`를 쓴다. Host `createDocumentFile`과 비서 `executeDocumentTool`에도 exclusive create가 각각 있다. Core 의미 중복은 아니지만 경로·오류·receipt 정책이 갈라질 지점이다 [C:993–999][H:131–157][DT:26–64].
3. 템플릿 CLI는 이미 `apps/editor/server/document-templates.ts`를 import한다. (b)의 “같은 함수를 직접 실행”은 이 기능에서는 상당 부분 실현되어 있다. 다만 CLI의 기본 로컬 접근과 HTTP의 RootAccess는 다르고, 템플릿으로 **문서 생성**하는 최종 쓰기는 여전히 별도다 [C:1,897–921][T].
4. Docling/플러그인 CLI는 `createPluginHost()` 후 installed facade `invoke()`를 호출한다. “CLI는 Host를 전혀 안 쓴다”는 설명은 부정확하다. 실행 중 앱의 Host를 호출하지 않을 뿐 **별도 Host composition을 생성**한다. 같은 설치/요청 기록을 써도 같은 live conversation/작업 제어기를 공유하는 것은 아니다 [C:923–960,1956–1972][PH].
5. source 실행은 checkout `.litzio-dev`, 배포 CLI/Desktop은 공용 사용자 경로다. source UI와 PATH의 배포 CLI를 혼용하면 같은 함수를 호출해도 다른 카탈로그/설정을 읽을 수 있다. 앱에 CLI를 함께 배포하는 것만으로 실행 대상이 맞춰지지 않는다 [PATHS].

### 검증·권한의 반복과 실제 경계

- Core admission/serialize를 여러 진입점에서 부르는 것은 올바른 재사용이다. 이를 없애거나 UI를 신뢰하는 방식으로 단순화하면 안 된다. CLI와 Host의 file-commit도 이미 공유된다 [CORE][R][FC].
- JSON schema와 실행 시 검증은 비서 도구 안에서도 따로 존재한다. HTTP body 검사, CLI flags 검사, 도구 schema를 한 정의에서 파생할 여지는 있으나 각 transport의 크기·Origin·인자 문법 검증은 남겨야 한다 [DT][H][NET][C].
- Host RootAccess, 열린 폴더 RootAccess, provider sandbox/ACP permission은 같은 권한의 단순 복제가 아니다. 각각 서버가 허용한 파일 범위, 이번 턴 맥락, provider 실행 권한이다. 공용 함수에 명시적 실행 context를 주되 이 교집합을 유지해야 한다 [ACCESS][DT][CONV].
- 파일 이름 규칙은 공용 file-operations에서 템플릿도 재사용한다. HTTP 경로 검증을 local CLI에 무조건 복사하기보다, local/remote의 정책 차이를 드러내야 한다 [T][FILES].
- 플러그인의 `routes`→operation mapping과 `operations`는 이미 작은 작업 목록이다. 그러나 입력은 `any`가 많고 Core CLI나 Codex tool schema를 생성하지 않는다. 이를 전 제품 범용 registry로 즉시 승격할 이유는 없다 [DH][AIH][PH].
- 소유자의 [#767 최신 결정](https://github.com/litzio/litzio/discussions/767#discussioncomment-19361943)은 AI sandbox 제한을 없애는 방향, 검수 자료 읽기를 Host 도구로 바꾸는 계획을 요구한다. 현재의 restricted/full-access와 Codex exec는 **구현 현황**이지 그 결정을 모두 이행한 결과가 아니다. 이번 제안은 새 sandbox를 추가하지 않는다. 동시에 기존 Root/native/revision/보존 계약을 제거하는 승인으로 해석하지 않는다.

### 화면 상태와 도구 정의

표시 preferences, 열린 폴더·탭 경로, recovery IndexedDB는 client/origin-local이다 [PREF][REC]. 대화 원문은 provider, 대화 index와 현재 연결은 Host, 마지막 선택/패널 배치는 화면이다 [CONV][GUIDE]. 업데이트는 Desktop 프로세스의 상태다 [DESK]. 이 상태들을 전부 Host 설정으로 옮기는 것은 기능 노출 이상의 제품 계약 변경이다.

동적 도구는 `documentTools`의 세 function spec이며 `thread/start.dynamicTools`로 전달한다. 호출은 `executeDocumentTool`이 실행하고 receipt는 대화 snapshot/history와 카드가 소비한다. CLI command catalog, HTTP routing, plugin operations에서 자동 생성되지 않는다 [DT][CONV]. Copilot의 `session/new`/load에는 `mcpServers: []`가 전달되므로 같은 tools를 쓰지 않는다 [ACP]. MCP adapter는 향후 선택지이지 현재 존재하는 기능이 아니다. Codex thread 재개 시 tool 재등록 제약도 있어 목록만 바꾸는 것으로 기존 thread까지 갱신된다고 약속하면 안 된다 [GUIDE:398–456].

## 선택지 비교 (규모는 추정)

아래 PR 수는 저장소 실제 일정이 아니라 기능·검증을 독립적으로 리뷰할 단위의 대략치다. 전면 parity는 행 수에 따라 더 커진다.

| 선택지 | 장점 | 단점·위험 | 계약/ADR 영향 | 대략 규모 및 지금 미룰 것 |
| --- | --- | --- | --- | --- |
| (a) 현 구조 + 모든 새 기능 CLI 필수 | 가장 작은 규칙 변경, 기존 Core/CLI 활용 | 정책만으로 기존 빈칸·schema drift·카드·경로 차이 안 풀림. UI interaction까지 명령화하면 비용만 증가 | AGENTS/CONTRIBUTING의 semantic parity 범위 확장. 기능별 Implemented 계약의 기존 생략 사유 재검토; ADR-0002/0004/0005 자체 변경 불필요 | 규칙 1 PR + 우선 빈칸당 1–2 PR. 전체 backfill 미룸 |
| (b) Host 작업 목록 + HTTP/CLI/도구 adapter, Host 있으면 원격·없으면 직접 | 입력/실행/결과 의미 공유, 이미 존재하는 plugin invoke·templates 재사용 | 자동 탐색의 대상 모호성, Host 응답 유실 후 로컬 fallback의 중복 쓰기, local/remote 권한 차이. Desktop은 현재 외부 호출 listener가 없음 | 작업/대상 선택 새 계약. Desktop 외부 transport를 넣으면 ADR-0004 개정 필요; HTTP/권한 ADR-0005, plugin 공개 계약 ADR-0012, tools ADR-0014 갱신. Core ownership 유지 | 첫 기능 2–3 PR + Host 연결/대상 선택 2–3 PR + provider adapter 1–2 PR. 전체 registry 자동 생성/광범위 이행 미룸 |
| (c) 별도 daemon, 앱·CLI·MCP 동일 API | 작업 수명·제어 대상 일치, client 종료 뒤 장기 작업과 재접속 토대 | 프로세스 발견·업데이트 호환·인증·재시작·이벤트·운영 추가. daemon만으로 미저장/Undo 해결 안 됨 | ADR-0004 in-process, 0005 stateless, 0012 무daemon 경계 변경. 공유 복구/lease까지 하면 0007·0001 경계 검토. 0002 plain-text/Core는 유지 | 최소 6–10 PR + 공유 편집 3–5 PR 추정. #834 ③ 실제 요구 전에는 전체 미룸 |
| **(d) 권고: 기능별 공용 작업 계약, 명시적 대상, daemon 유예** | 지금 빈칸을 작게 채움. HTTP/CLI/tool 실행을 공유하면서 UI session은 보존. 필요한 곳부터 (b)로 진행 | 첫 단계 CLI가 live 앱과 연결되지 않는 제한은 남음. 모든 기능의 일괄 동등성을 선언할 수 없음 | 우선 AGENTS의 app-operation parity와 예외 기록, template/main-agent 계약. ADR-0004/0005/0012 프로세스 모델 유지. 도구 확장은 ADR-0014 검토 | 템플릿 2 PR + Copilot adapter 1–2 PR 후 재평가. 자동 Host 탐색, daemon, 공유 undo, marketplace, auth platform 미룸 |

Paseo는 daemon을 제어하는 CLI와 명시적 `--host`/대상 선택, 네트워크 인증 경계를 갖는다. **“Host가 없으면 같은 함수로 로컬 실행”이 Paseo의 보편 동작이라는 근거는 없다.** 오히려 확인한 CLI 문서는 live-but-unreachable home을 offline identity로 바꾸지 않는 등 대상을 명시한다. Litzio (b)의 fallback은 독자적인 정책으로 설계해야 한다. [Paseo CLI](https://paseo.sh/docs/cli.md), [Paseo security](https://paseo.sh/docs/security.md) (2026-11-04 조회).

### 미저장 탭·결과·되돌리기·원격 권한

**미저장 탭:** 현재 비서 맥락도 저장 파일 경로만 넘긴다. 공용 작업의 기본 대상은 디스크 snapshot/revision으로 명시한다. 열려 있는 문서를 수정하는 기능을 추가하려면 현재 창의 dirty 확인과 승인 후 engine transaction 적용을 별도로 설계한다. 다른 창까지 모두 검사한다고 주장하지 않는다. daemon을 채택하더라도 lease·초안 보존 범위·명시 Save 정책의 별도 결정이 필요하다 [SESSION][GUIDE][FILES].

**결과 카드:** 결과를 성공 문자열로만 반환하지 말고 path/revision/identity를 포함한 현재 create receipt를 재사용한다. CLI와 도구가 같은 결과 형태를 반환해도 그 자체로 화면 카드가 생기지 않는다. 대화 turn에 귀속된 결과 전달이 있어야 한다. 오프라인 CLI의 결과는 stdout에 남고 화면 카드 자동 생성은 미지원으로 명시한다 [DT][CONV][GUIDE].

**되돌리기:** 생성 Undo는 파일 삭제 전 identity/revision, 현재 창 미저장·복구 상태를 확인하는 보상 작업이다. 문서 편집 Undo는 ProseMirror history다. Docling undo는 제안/교정 ledger 결정이다. 세 가지를 범용 `undo` 한 API로 합치지 않는다. raw CLI 파일 변경을 engine history에 넣을 수도 없다 [APP][SESSION][DH].

**권한/원격:** HTTP 서버 경로는 CLI 실행 PC 경로와 다르다. explicit Host를 지정했으면 연결 실패·403·timeout 때 local로 재실행하지 않는다. “실행 전 연결 불가”와 “실행 후 응답 유실”도 구분한다. Host RootAccess와 plugin app-owned store capability를 명시하고 arbitrary path로 승격하지 않는다. HTTP Origin/Host 검사는 인증이 아니며 현행 proxy/private-network 운영 계약을 유지한다. Desktop 외부 호출용 pipe/socket을 추가하는 경우도 인증/실행 대상/버전 식별을 별도 검토해야 한다 [NET][ACCESS][T].

앱 설정(표시 언어 등)을 자동화하려면 “어느 창/origin에 적용하는가”가 먼저다. 모든 표시 설정을 사용자 전역 Host 설정으로 바꾸는 결정과, 현재 창에 설정 요청을 전달하는 기능은 다르다. CLI 필수 규칙 때문에 이를 암묵적으로 결정하지 않는다.

## 추천 이행 순서와 완료 조건

1. **PR A: 템플릿 작업 계약과 현재 create 통합.** 기존 list/read/save/templateDocumentSource와 파일 create 함수를 재사용한다. 입력·출력·read/write 분류와 명시적 scope를 작게 정의한다. HTTP/CLI가 같은 함수에서 검증/결과를 얻도록 하고, 새 registry infrastructure는 만들지 않는다. CLI 기존 출력/exit code 변경은 명시한다. 기존 Core/native·이름 충돌·exclusive create·Root 검사를 유지한다.
2. **PR B: Codex 템플릿 도구와 생성 카드.** 같은 정의에서 list/read/save 및 template 생성 spec을 만들거나 기존 create를 최소 확장한다. template 생성도 file identity receipt를 돌려주고 기존 카드/guarded undo를 사용한다. 기존 문서 template save는 저장 snapshot만 받으며 unsaved 저장으로 오인하지 않도록 한다. 가짜 app-server/Host 검사와 기존 결과-card browser 시나리오에서 중복 이름·Root 밖 거부·카드 Open/Undo·변경된 파일 보존을 확인한다. 실제 AI 점검이 필요하면 저장소 기준 최저 비용 모델을 쓴다.
3. **후속: Copilot #1121.** 같은 작업 정의를 MCP로 노출하는 adapter를 제한된 작업으로 검증한다. ACP capability와 provider가 실제 tool call을 보내는지 확인하기 전 parity 완료를 선언하지 않는다. stdio MCP가 새 Host를 만들면 live 앱 scope/receipt가 또 갈라지므로 기존 Host로 위임되는 수명·context 경계를 정해야 한다. sandbox 확장 프로젝트와 묶지 않는다.
4. **다음 vertical slice: Docling 조회·변환/검수 시작.** 기존 plugin `operations`를 재사용하고 #767 최신 결정에 따라 자료 읽기를 Host 도구로 잇는다. 승인/거절은 사람 결정이라는 기존 경계를 유지한다. 모델이 요청한 `approve`를 사용자 승인으로 간주하지 않는다. 연결 변경에 ADR-0013/0014 갱신이 필요한 범위를 별도 승인한다.
5. **그때 live Host 연결을 결정.** 앱과 CLI 동일 작업 수명/카드가 실제 필요하면 explicit Host 연결부터 검증한다. Desktop in-process와 충돌하는 transport를 추가하기 전에 ADR-0004를 바꾼다. 자동 발견은 여러 Host·source/배포 경로·버전 차이·응답 유실에서 대상이 명확해진 뒤에만 고려한다.

AGENTS 규칙 후보: “새로운 headless 사용자 작업은 공용 실행 함수와 얇은 CLI를 제공한다. AI에서 호출할 필요가 있는 작업은 같은 입력/결과 계약으로 비서 도구를 제공한다. 화면 interaction·특정 창 상태·Desktop 전용 capability는 예외를 기록한다. Core는 계속 문서 의미를 소유한다.” **모든 HTTP endpoint를 자동으로 AI 도구로 공개하는 규칙은 권하지 않는다.** 설치·삭제·승인과 진단 읽기는 노출 정책이 다르다.

이는 [#834 승인 순서](https://github.com/litzio/litzio/discussions/834#discussioncomment-19307667)와 ADR-0012의 무daemon 단계에 맞는다. 실사용 수명 문제가 확인되기 전에 shared session, CRDT, 범용 event bus, 서비스 계정/RBAC, marketplace, 과거 데이터 migration을 추가하지 않는다.

## 계약과 결정 자료

선행 검토: [docs index](../README.md), [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md), [ADR-0004](../adr/0004-desktop-host-distribution.md), [ADR-0005](../adr/0005-http-host.md), [ADR-0006](../adr/0006-native-document-boundary.md), [ADR-0012](../adr/0012-plugin-runtime-and-ui-contributions.md). 현행 계약: [Main agent](../design/main-agent-v1.md), [Plugin runtime](../design/plugin-runtime-v1.md), [Plugin UI](../design/plugin-ui-v1.md), [Templates](../design/document-templates-v1.md), [HTTP Host](../design/http-host-v1.md), [Desktop distribution](../design/desktop-distribution-v1.md), [Filesystem Host](../design/filesystem-host-boundary-v1.md). Discussion #767/#834는 GraphQL 본문과 최근 댓글을 조회했다. #834 본문의 결정 전 제안과 이후 승인 순서를 구분했다.

## 근거 목록

각 링크는 조사 기준 SHA에 고정되어 있다. 경로 뒤 `#L`은 GitHub 코드 행이다. 대괄호 약호와 본문 `약호:행`은 같은 파일을 가리킨다.

- **C**: [packages/cli/src/cli.ts:174–286](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/packages/cli/src/cli.ts#L174-L286)
- **H**: [apps/editor/server/document-api.ts:97–550](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/document-api.ts#L97-L550)
- **NET**: [apps/editor/server/http-host.ts:40–127](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/http-host.ts#L40-L127)
- **DP**: [apps/desktop/src/host-protocol.ts:40–95](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/desktop/src/host-protocol.ts#L40-L95)
- **DT**: [apps/editor/server/agent-document-tools.ts:10–57](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/agent-document-tools.ts#L10-L57)
- **T**: [apps/editor/server/document-templates.ts:1–90](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/document-templates.ts#L1-L90)
- **TG**: [apps/editor/src/shell/TemplateGallery.tsx:19–126](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/shell/TemplateGallery.tsx#L19-L126)
- **TS**: [apps/editor/src/shell/SaveTemplateDialog.tsx:13–45](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/shell/SaveTemplateDialog.tsx#L13-L45)
- **S**: [apps/editor/src/document-session.ts:22–140](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/document-session.ts#L22-L140)
- **SESSION**: [apps/editor/src/useDocumentSession.ts:35–220](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/useDocumentSession.ts#L35-L220)
- **DS**: [apps/editor/src/shell/DocumentSettings.tsx:34–97](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/shell/DocumentSettings.tsx#L34-L97)
- **CORE**: [packages/core/src/index.ts:48–148](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/packages/core/src/index.ts#L48-L148)
- **R**: [apps/editor/server/document-replay.ts:90–130](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/document-replay.ts#L90-L130)
- **FC**: [packages/file-commit/src/index.ts:17–65](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/packages/file-commit/src/index.ts#L17-L65)
- **TEXT**: [apps/editor/src/TextDocumentTab.tsx:1–120](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/TextDocumentTab.tsx#L1-L120)
- **REC**: [apps/editor/src/recovery-storage.ts:1–115](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/recovery-storage.ts#L1-L115)
- **APP**: [apps/editor/src/App.tsx:600–670](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/App.tsx#L600-L670)
- **ACCESS**: [apps/editor/server/file-access.ts:6–145](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/file-access.ts#L6-L145)
- **PREF**: [apps/editor/src/preferences.ts:6–220](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/preferences.ts#L6-L220)
- **FILES**: [apps/editor/server/file-operations.ts:22–165](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/file-operations.ts#L22-L165)
- **IMG**: [apps/editor/src/image-assets.ts:44–100](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/image-assets.ts#L44-L100)
- **ASSET**: [apps/editor/server/asset-api.ts:254–282](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/asset-api.ts#L254-L282)
- **GUIDE**: [docs/design/main-agent-v1.md:398–540](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/docs/design/main-agent-v1.md#L398-L540)
- **ACP**: [apps/editor/server/ai-agent-conversations.ts:225–320](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/ai-agent-conversations.ts#L225-L320)
- **SET**: [apps/editor/src/shell/SettingsDialog.tsx:123–310](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/shell/SettingsDialog.tsx#L123-L310)
- **DESK**: [apps/desktop/src/main.ts:158–235](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/desktop/src/main.ts#L158-L235)
- **PS**: [apps/editor/src/PluginSettings.tsx:14–100](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/PluginSettings.tsx#L14-L100)
- **PUI**: [apps/editor/src/plugin-ui.tsx:1–149](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/plugin-ui.tsx#L1-L149)
- **PH**: [apps/editor/server/plugin-host.ts:22–189](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/plugin-host.ts#L22-L189)
- **STORE**: [apps/editor/server/plugin-store.ts:1–140](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/plugin-store.ts#L1-L140)
- **DU**: [plugins/docling/src/ui-plugin.tsx:1–160](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/plugins/docling/src/ui-plugin.tsx#L1-L160)
- **DH**: [plugins/docling/src/host.ts:75–165](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/plugins/docling/src/host.ts#L75-L165)
- **AIUI**: [plugins/ai-agent/src/ui.tsx:1–134](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/plugins/ai-agent/src/ui.tsx#L1-L134)
- **AIH**: [plugins/ai-agent/src/host.ts:15–60](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/plugins/ai-agent/src/host.ts#L15-L60)
- **AP**: [apps/editor/src/shell/AssistantPanel.tsx:160–250](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/shell/AssistantPanel.tsx#L160-L250)
- **CONV**: [apps/editor/server/ai-agent-conversations.ts:20–190](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/ai-agent-conversations.ts#L20-L190)
- **PATHS**: [apps/editor/server/host-paths.ts:1–24](https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/host-paths.ts#L1-L24)

[C]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/packages/cli/src/cli.ts#L174-L286
[H]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/document-api.ts#L97-L550
[NET]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/http-host.ts#L40-L127
[DP]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/desktop/src/host-protocol.ts#L40-L95
[DT]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/agent-document-tools.ts#L10-L57
[T]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/document-templates.ts#L1-L90
[TG]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/shell/TemplateGallery.tsx#L19-L126
[TS]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/shell/SaveTemplateDialog.tsx#L13-L45
[S]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/document-session.ts#L22-L140
[SESSION]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/useDocumentSession.ts#L35-L220
[DS]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/shell/DocumentSettings.tsx#L34-L97
[CORE]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/packages/core/src/index.ts#L48-L148
[R]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/document-replay.ts#L90-L130
[FC]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/packages/file-commit/src/index.ts#L17-L65
[TEXT]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/TextDocumentTab.tsx#L1-L120
[REC]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/recovery-storage.ts#L1-L115
[APP]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/App.tsx#L600-L670
[ACCESS]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/file-access.ts#L6-L145
[PREF]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/preferences.ts#L6-L220
[FILES]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/file-operations.ts#L22-L165
[IMG]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/image-assets.ts#L44-L100
[ASSET]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/asset-api.ts#L254-L282
[GUIDE]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/docs/design/main-agent-v1.md#L398-L540
[ACP]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/ai-agent-conversations.ts#L225-L320
[SET]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/shell/SettingsDialog.tsx#L123-L310
[DESK]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/desktop/src/main.ts#L158-L235
[PS]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/PluginSettings.tsx#L14-L100
[PUI]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/plugin-ui.tsx#L1-L149
[PH]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/plugin-host.ts#L22-L189
[STORE]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/plugin-store.ts#L1-L140
[DU]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/plugins/docling/src/ui-plugin.tsx#L1-L160
[DH]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/plugins/docling/src/host.ts#L75-L165
[AIUI]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/plugins/ai-agent/src/ui.tsx#L1-L134
[AIH]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/plugins/ai-agent/src/host.ts#L15-L60
[AP]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/shell/AssistantPanel.tsx#L160-L250
[CONV]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/ai-agent-conversations.ts#L20-L190
[PATHS]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/host-paths.ts#L1-L24

## 검증 기록과 한계

- 문서·코드·공개 자료 정적 조사만 수행했다. 다른 조사 결과, 제품 서버, 브라우저, 모델 실행, 로컬 패키징·제품 설치는 사용하지 않았다. 문서 검사 시 pnpm이 이 worktree의 의존성을 로컬 store에서 자동 준비했다(다운로드 없음).
- 사용자 공용 `.litzio`에 쓰지 않았다. 이번 작업이 시작한 background process/session은 없다.
- 제품 코드 변경 없음. 문서 한 파일만 산출한다. `git diff --check` 통과. `pnpm docs:check`는 이 파일의 index 직접 연결 누락 **1건으로 실패**했다. 요청된 index 제외 외 다른 문서 오류는 없었다.
- 유지 문서의 index 직접 연결 규칙은 알고 있으며, 이번에는 요청대로 연결하지 않는다. 따라서 `docs:check`의 index 누락을 성공으로 바꾸거나 검사 기준을 약화하지 않는다.
- 부재 판단은 이 SHA의 공개 목록/dispatch를 기준으로 한다. provider 자체 shell이나 미래 연결을 지원 사실로 세지 않았다. PR 규모·권고·예상 이득은 조사자의 판단이며 소유자 결정이나 구현 사실이 아니다.
