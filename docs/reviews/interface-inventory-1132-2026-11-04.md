# 화면·Host·CLI·비서 인터페이스 현황과 선택지 (#1132)

- Status: Draft
- Last verified: 2026-11-04 — 아래 기준 커밋의 문서·코드 정적 대조 및 GitHub 이슈/Discussion 조회. 제품 실행·브라우저·실제 AI·패키징 검증은 하지 않았다.
- Scope: [결정 이슈 #1132](https://github.com/litzio/litzio/issues/1132)의 조사·제안. 현재 계약이나 구현 착수 승인이 아니다.
- 기준: `origin/master`와 이 브랜치의 조사 시작 HEAD `893290e29f383bb04fb20bc50e9130077dc88764`. 이후 master 변경은 이 표에 포함하지 않는다.
- 색인 예외: 소유자의 이번 조사 지시대로 결정 전 초안은 `docs/README.md`에 연결하지 않는다. 일반 문서 거버넌스와 `docs:check`의 직접 색인 규칙에 대한 **이번 산출물의 명시적 예외**이며 검사 코드를 바꾸지 않는다.

## 판단 요약

**(b)의 공통 작업 함수·정의부터 작게 도입하고, 실행 중 Host 연결은 별도 단계로 결정하는 안을 추천한다.** Core 의미 처리는 이미 공통이다. 빈칸은 주로 파일 작업의 조합, 앱 설정, 플러그인·AI 실행과 클라이언트 상태에 있다. “새 기능은 CLI 필수”만으로는 HTTP·비서·Copilot의 누락과 서로 다른 권한·결과 처리를 막지 못한다.

반대로 공통 작업 목록이 있다고 곧바로 데몬이 필요하지는 않다. 현재 Desktop은 in-process protocol Host이며 TCP listener가 없다([H2]). 동일 함수를 headless CLI에서도 실행하는 것과 **실행 중인 그 Host의 상태를 사용**하는 것은 다른 기능이다. 미저장 탭·표시 설정·편집 Undo는 현재 클라이언트 소유다([U3], [U4], [U6]). API 통일만으로 이 상태가 공유되지는 않는다.

첫 사례는 [#1128 템플릿](https://github.com/litzio/litzio/issues/1128)이 적절하다. 저장소·Core 함수가 이미 HTTP/CLI에 공유돼 있고([T1], [T2]), 비서의 셸 의존과 생성 결과 카드 누락을 한 범위에서 확인할 수 있다. 공통화의 성공 기준은 도구 개수가 아니라 **같은 입력·권한·거부·생성 receipt를 모든 해당 인터페이스가 보존하는지**다.

## 읽은 결정과 현재 권위

진입점은 [AGENTS.md](../../AGENTS.md), [docs index](../README.md), [문서 거버넌스](../contributing/documentation-governance.md)다. ADR 목록에서 다음 경계를 확인했다.

| 근거 | 이번 판단에 적용한 경계 |
| --- | --- |
| [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md) | plain-text SSOT, Core의 의미·검증·canonical write. Host 작업 공통화가 의미 처리를 Host로 옮기는 것은 아니다. |
| [ADR-0004](../adr/0004-desktop-host-distribution.md) | Desktop custom protocol, 기존 handler in-process 재사용, TCP 없음. CLI 통합은 별도 Node 실행 shim이며 실행 중 창의 API 클라이언트가 아니다. |
| [ADR-0005](../adr/0005-http-host.md) | 독립 HTTP Host, 시작 시 고정 Root, 단일 운영자·외부 접근 통제, 문서/session store 없음. |
| [ADR-0006](../adr/0006-native-document-boundary.md) | Core native admission; #817의 별도 text 편집 예외. CLI가 범용 text editor라는 뜻은 아니다. |
| [ADR-0001](../adr/0001-single-document-editor-architecture.md) / [0007](../adr/0007-editing-session-lifetime.md) / [0009](../adr/0009-multiple-opened-folders.md) | 한 문서의 Tiptap state, 명시적 Save·클라이언트 복구, 열린 폴더는 UI 탐색 상태. |
| [ADR-0012](../adr/0012-plugin-runtime-and-ui-contributions.md) | 데몬 없이 공유 설치·등록/요청 기록, worker·UI 기여, UUID·drain·uncertain·자동 재실행 금지. 기록 공유는 live controller 공유가 아니다. |
| [ADR-0013](../adr/0013-ai-agent-task-service.md) / [0014](../adr/0014-main-agent-app-server.md) | 기능 AI 작업 서비스와 Host 소유 비서 연결은 서로 다른 실행 경로. 현재 AI CLI parity 생략은 의도된 결정이다. |

요청된 Implemented 계약인 [main-agent](../design/main-agent-v1.md), [plugin-runtime](../design/plugin-runtime-v1.md), [plugin-ui](../design/plugin-ui-v1.md), [templates](../design/document-templates-v1.md), [HTTP Host](../design/http-host-v1.md), [Desktop distribution](../design/desktop-distribution-v1.md), [filesystem boundary](../design/filesystem-host-boundary-v1.md)를 코드와 대조했다.

Discussion은 `gh api graphql`로 본문과 댓글을 읽었다. [#767의 승인 순서](https://github.com/litzio/litzio/discussions/767#discussioncomment-19307357)는 플러그인 실행 경계 → AI 생성 플러그인 설치/승인 → 필요할 때 공유 Host다. [2026-11-01 컨셉 결정](https://github.com/litzio/litzio/discussions/767#discussioncomment-19321896)은 별도 배포·서명·카탈로그를 보류했다. [#834 후속 결정](https://github.com/litzio/litzio/discussions/834#discussioncomment-19307667)은 실행 중 플러그인만으로 데몬을 정당화하지 않고 공유 편집·클라이언트 독립 작업 수명을 나중으로 둔다. #834 본문의 이전 경로명·정적 모듈 설명은 당시 조사이며 ADR-0012 이후 현황으로 쓰지 않았다.

[2026-11-03 Docling AI 결정](https://github.com/litzio/litzio/discussions/767#discussioncomment-19361943)은 자료 읽기를 Host 도구로 옮기고 sandbox 제한을 없애는 구현 계획을 별도 승인받도록 했다. 현재 코드는 아직 별도 exec/snapshot 경로다([A4], [A6]). 이를 이미 구현된 app-server 검수로 표기하지 않는다. 과거 문서 제안 스파이크도 [master 채택 보류](https://github.com/litzio/litzio/discussions/767#discussioncomment-19323901)이므로 기존 문서 수정 기능으로 세지 않는다.

## 기능 현황 표

`✓`는 코드 경로가 있다는 뜻이며 실제 계정·외부 서비스·패키지 실행 성공을 뜻하지 않는다. `△`는 부분 지원/간접 경로, `—`는 아래의 전체 dispatcher·도구 목록에서 제품 surface가 없는 경우다. `해당 없음`은 클라이언트 상호작용이라 독립 headless 연산과 다른 경우다. 각 근거 ID는 문서 끝의 **기준 커밋 파일·행 링크**다. CLI 칸의 명령에는 `litzio` 접두어를 생략했다.

Copilot 칸은 **비서에서 제품 기능을 호출하는지**다. `안내만`은 Litzio 도구가 없다는 뜻이며 네이티브 파일 도구·full-access 셸의 잠재 능력을 제품 지원으로 세지 않는다. 전체 제약 근거는 [A2], [A3], [A5]다.

### 문서·파일·템플릿

| 사용자 기능 | 화면 (Editor UI) | Host HTTP / Desktop protocol 경로 | CLI 명령 | Codex 동적 도구 | Copilot | 의미·검증의 실제 위치 |
| --- | --- | --- | --- | --- | --- | --- |
| 문서 열기·Reload·디스크 읽기 | ✓ 탭 open/reload [U1] | ✓ `GET /api/document`; native/text 판정 [D1] | △ `inspect <file> [--json]`, `check`; 창 열기 아님 [C1] | ✓ `read_document`: 저장 파일 source/revision만 [B1] | △ 네이티브 read로 저장 파일; 제품 도구 없음 [A2] | Core parse/read model [K1], Host decoding·경로 [D1] |
| 빈 native 문서 만들기 | ✓ 폴더의 New → open [U1], [U7] | ✓ `PUT /api/document` [D2] | ✓ `create <file>` exclusive write [C1] | ✓ `create_document` 제목+문단/제목 blocks [B1] | 안내만 [A2] | Core create/serialize [K1]; 파일 생성은 현재 각 adapter [D1], [C1], [B1] |
| 본문·블록 편집 (문단/제목/표/그림/수식/목록/코드/참조 등) | ✓ single state·폼·history [U2] | △ `POST /api/document`로 SupportedEdits replay/save; CLI command별 route 아님 [D2], [D3] | ✓ 개별 insert/update/remove/move, `format`, `replace-text`, `apply-batch`, `--dry-run`, `--if-revision` [C2], [C3] | — 기존 문서 수정 없음; 생성 blocks도 문단·제목만 [B1], [A1] | 글로 제안; 제품 편집 연산 없음 [A2] | Core operations/validation/serializer [K1]; UI projection·history는 Editor, replay 조합은 Host [D3] |
| 명시적 Save·충돌 거부 | ✓ 모든 탭별 dirty/draft 보호 [U1], [U7] | ✓ `POST /api/document` revision 검사·공용 file commit [D1], [D2] | △ 편집 명령이 즉시 디스크 commit; 별도 “열린 탭 Save” 없음 [C1], [C3] | — 열린 탭 Save 없음 [B1] | 안내만 [A2] | Core 의미 [K1]; file-commit 파일교체 [F1]; Host revision/replay [D1], [D3] |
| Source·변경 미리보기·검사 | ✓ native Source 읽기 전용 [U1] | ✓ `POST /api/document-source`, Figure validation [D2] | ✓ `check`, `inspect`, 편집 `--dry-run` (완전 동일 출력 아님) [C1], [C3] | △ `read_document`는 디스크 source, 미저장 Source/검사 도구 없음 [B1] | △ 저장 파일 read, 미저장 내용 없음 [A2] | Core 검증 [K1], Host preview/replay [D1], [D3] |
| 비호환 `.md`·`.txt` 텍스트 편집 | ✓ 별도 text session [U1] | ✓ GET/POST document의 text 분기 [D1], [D2] | — native CLI로는 거부; 범용 text-write 명령 없음 [C1] | △ read 가능, text 수정 도구 없음 [B1] | △ 네이티브 read; 제품 text editor 제어 없음 [A2] | native 구분 Core, text bytes/revision Host+file-commit [D1], [F1] |
| 미저장 복구·탭 탐색 복원 | ✓ IndexedDB 복구, localStorage paths [U3], [U4] | △ recovery preview는 있지만 레코드 보관 API 없음 [D1], [D2] | — 클라이언트 저장소·탭 없음 [C1], [C2] | — [B1] | 안내만 [A2] | Editor recovery storage/restore; Host는 실제 저장 가능성 재검증 [U4], [D1] |
| 폴더 열기·목록·탐색·파일 미리보기 | ✓ picker/sidebar [U7] | ✓ `GET /api/folder`, `/api/folder-browse`, `/api/folder-places`, `/api/file-preview` [D2], [D4] | — 앱의 열린 폴더·탐색 명령 없음 [C1], [C2] | △ `list_documents` 열린 폴더 한 단계, hidden/symlink 제외; UI open 아님 [B1] | △ 네이티브 read, UI open 없음 [A2] | Host 파일 접근/Root/list [D4], [F2]; 열린 목록은 UI [U3] |
| 새 폴더·파일 삭제·이름 변경 (이미지 참조 갱신 포함) | ✓ sidebar/폼 [U7] | ✓ `POST /api/folder`, `DELETE/PATCH /api/file`; Desktop 삭제는 Trash 주입 [D2], [D4], [H2] | △ `update-media-references`는 단일 문서 의미만; mkdir/delete/파일 rename 없음 [C2] | — [B1] | 안내만 [A2] | Host 파일 orchestration·dirty hints·rollback [F3]; 참조 의미 Core [K1] |
| 이미지 선택·붙여넣기·업로드·rollback·표시 | ✓ Figure/clipboard/drop [U2] | ✓ `/api/asset` POST/DELETE, `/document/*` GET/HEAD [F4], [D2], [H1] | △ `insert-figure`/`update-figure`는 문서 의미; asset 작업 없음 [C2] | — 생성 blocks에 Figure 없음 [B1] | 안내만 [A2] | Host MIME·경로·receipt [F4]; Figure 의미 Core [K1] |
| 템플릿 목록·읽기·미리보기 | ✓ gallery + retained reading preview [U8] | ✓ `GET /api/templates`, `/api/template` [D2] | ✓ `templates list/read [--json] [--language]` [C1] | — 셸 CLI 안내만, 전용 도구 없음 [B1], [A1] | 안내만; 제한 모드 shell denied [A3] | 공용 Host store·이름/파일 검증 [T1]; Core metadata/admission [K2] |
| 템플릿으로 새 문서 | ✓ gallery → 폴더·이름 [U8], [U7] | ✓ `PUT /api/document {path,template,language}` [D2] | ✓ `create --template ... --language ...` [C1] | — `create_document`에 template 인자 없음; 셸 생성은 카드 없음 [B1], [U6] | 안내만 [A2] | Core createDocumentFromTemplate [K2], 공용 source 함수 [T1], 파일 생성 adapter 분리 |
| 문서를 템플릿으로 저장 | ✓ Save first + 이름/설명 Dialog [U9], [U12] | ✓ `POST /api/templates {name,from,description?}` [D2] | ✓ `templates save <name> --from <file>` [C1] | — 셸 CLI 안내; 앱 templates 경로가 writableRoots 밖일 수 있음 [A1], [A2] | 안내만 [A2] | Core metadata [K2]; store exclusive create·disk source·고정 app directory [T1], [T2] |
| 문서 설정 (제목·번호·참조 스타일·bibliography) | ✓ 문서 설정·제목 편집 [U10], [U2] | △ 별도 settings store 없이 SupportedEdits Save; bibliography 읽기는 GET [D2], [D3] | ✓ `update-title`, `update-heading-numbering`, `update-numbering-mode`, `update-reference-templates`, `update-bibliography` [C2] | △ 생성 title만, 기존 문서 설정 도구 없음 [B1] | 글로 제안 [A2] | 문서 의미 Core [K1]; 편집 초안·session UI [U2] |

### 앱·플러그인·Docling·AI·배포

| 사용자 기능 | 화면 (Editor UI) | Host HTTP / Desktop protocol 경로 | CLI 명령 | Codex 동적 도구 | Copilot | 의미·검증의 실제 위치 |
| --- | --- | --- | --- | --- | --- | --- |
| 표시 설정 (theme/accent/언어/폭/배경/table wrap) | ✓ Settings·로컬 선호 [U3], [U7] | — 공용 preferences route 없음; Desktop theme IPC는 native chrome 반영 [H3] | — [C1], [C2] | — 세 도구뿐 [B1] | 안내만 [A2] | 화면/localStorage. Markdown 문서 설정과 별개 [U3] |
| 플러그인 목록·번들 재등록 | ✓ Plugins 정보·Register again [U11] | ✓ `GET/POST /api/worker-plugins`; POST bundled 또는 trusted manifest [D2] | ✓ `plugins list [--json]`, `plugins reregister <id>`; 임의 manifest 등록 명령 아님 [C1] | — [B1] | 안내만 [A2] | Host store manifest/hash/API/등록 SQLite; load에서 재검증 [P1], [P4] |
| 플러그인 끄기·켜기·설정·기능 flags | ✓ switch/detail + 기여 설정 [U11], [P3] | ✓ DELETE off, PATCH enabled=true; plugin-operation/configure·features [D2], [P1], [G1] | — enable/disable/configure 명령 없음 [C1] | — [B1] | 안내만 [A2] | Host lifecycle/drain + 플러그인 settings validators [P1], [G1], [A4] |
| 공식 플러그인 다운로드·별도 업데이트·제거 | — 번들 재등록/off를 설치/삭제로 부르지 않음 [U11] | — 등록 disable은 bytes/receipts 제거 아님 [P2] | — `reregister`만 [C1] | — [B1] | 안내만 [A2] | 컨셉 결정으로 보류; 현재 store는 trusted local registration [P2] |
| Docling JSON→native / PDF 변환 | ✓ PDF dialog/dashboard [G2] | ✓ `/api/docling-conversion` GET/POST/DELETE; generic plugin-operation도 가능 [G1], [D2] | ✓ `docling convert ... --output`, `convert-pdf ... --output --server [--timeout]` [C1], [C4] | — 플러그인 호출 도구 없음 [B1], [A1] | 안내만 [A2] | 플러그인 변환·schema·Core 공개 API; Host worker/UUID/publication [G1], [P2] |
| Docling 연결·서버 설정·대시보드·이력·취소 | ✓ 플러그인 UI [G2] | ✓ settings/check/dashboard/features/history; 취소는 소유 Host 조건 [G1] | △ 변환 옵션은 있으나 dashboard/history/cancel/settings 명령 없음 [C1], [C4] | — [B1] | 안내만 [A2] | 플러그인 서버 설정·기능 gate + runtime receipts/owner [G1], [P1], [P2] |
| Docling 대조·페이지 검토 | ✓ plugin tab/ReadingSurface [G2] | ✓ GET `/api/docling-compare`; 원본 media는 기존 route [G1], [D2] | — 대조/탭 명령 없음 [C1] | — [B1] | 안내만 [A2] | 플러그인 map/source read 검증 + Host native/media admission [G1] |
| Docling AI 구조 검수·제안 조회/승인/거절/Undo | ✓ dashboard·review panel [G2] | ✓ `/api/docling-review`, `-approve`, `-reject`, `-undo`, `-review-agent` [G1] | — AI review/approve/reject 명령 없음 [C1], [C4] | — 비서에서 실행 불가 [B1], [A1] | — 대화 provider 선택과 별개로 기능 작업은 Codex exec [A4], [A5] | 플러그인 StructureReviewer·proposal freshness, AI task schema/receipt, Core 재생성 [G3], [G1], [A4] |
| Docling 교정 ledger 추가·삭제·재적용 | △ 승인/Undo는 review UI; 임의 entry 편집 화면 아님 [G2] | ✓ plugin-operation `add/remove/apply-corrections` [G1], [D2] | ✓ `docling add-correction --entry`, `remove-correction`, `apply-corrections` [C1] | — [B1] | 안내만 [A2] | 플러그인 correction replay/폴더 교체, 원본 보존·Core write [G1], [G4] |
| AI 기본 설정·모델·진단·환경 | ✓ AI plugin settings + diagnostics [A4], [U5] | ✓ settings GET/PUT, models/diagnostics/environment GET [P1], [A1] | — 제품 명령 없음; 외부 `codex` 명령과 다름 [C1], [C2] | — 자기 설정용 Litzio 도구 없음 [B1] | ✓ 대화 provider/model 설정; 계정/limit/MCP 진단은 Codex만 [A5] | plugin settings 저장·검증 + Host catalog 검증·연결 [A4], [P1], [A1] |
| 비서 대화·이력·Stop·Codex steer·구조화 질문 | ✓ shell AssistantPanel [U5] | ✓ `/api/ai-agent-conversations` GET/POST send/resume/interrupt/answer [P1], [A2] | — Litzio CLI 대화 명령 없음; Codex thread ID로 외부 CLI 이어 쓰기는 별개 [C1], [A2] | 해당 없음: 도구를 호출하는 비서 자체; request_user_input은 별도 RPC [A2] | △ ACP 대화/resume 지원 시/Stop; steer·Codex 구조화 질문과 동일 계약 아님 [A2], [A3], [A5] | Host conversation index/scope·provider transcript; 화면은 polling/표시 [A2], [U5] |
| 스킬 목록·선택·사용법 안내 | ✓ Codex `/` picker + 환경 정보 [U5] | ✓ GET `/api/ai-agent-skills`, environment; Codex skills/list [P1], [A1] | — Litzio 명령 없음; 생성된 guide에 CLI 안내 [C1], [A1] | △ 스킬 입력은 `{type:skill,name,path}`; 별도 동적 관리 도구 아님 [A2] | △ 공통 AGENTS 안내, Codex picker/skill inputs 없음 [A5] | Host guide 생성·catalog 검증, skill 실행 의미는 provider [A1], [A2] |
| 파일·이미지 참조 `@`/첨부·활성 파일 맥락 | ✓ composer chips/drop [U5] | △ conversation send의 references/folders/document path 검증; 미저장 내용 제외 [A2] | — composer 참조 명령 없음 [C1] | △ `read_document` 저장 파일; Codex localImage 입력은 별도 [B1], [A2] | △ 경로 참조, Codex localImage/skills 입력 없음 [A5] | Host 경로/scope 검증, provider read, UI 선택 상태 [A2], [U5] |
| AI 기능 작업 서비스 (Docling 소비) | △ 기능 플러그인 UI, 일반 task 작성 화면 없음 [G2] | ✓ ai-task-service/status/settings/tasks GET/POST/DELETE [A4], [D2] | — 의도적 생략 [C1] | — 서비스 호출 도구 없음 [B1] | — feature tasks는 기존 Codex adapter [A4], [A5] | Host runtime admission/hash/schema/cancel + AI worker adapter [A4], [P2] |
| 생성 결과 카드 Open·Undo | ✓ 성공 create_document receipt만 카드 [U6] | △ 생성은 tool callback; Undo는 `DELETE /api/file` checkOnly/revision/identity [F3], [U7] | — CLI 생성은 카드·tab/recovery 검사 없음 [C1], [U6] | △ create receipt 제공; Undo 동적 도구 없음 [B1], [U6] | — Litzio cards 없음 [A5] | UI tab/recovery 확인 + Host identity/revision 삭제; editor Ctrl+Z와 별개 [U6], [U7], [F3] |
| Desktop 업데이트·채널·재시작·로그 폴더 | ✓ Desktop bridge 있을 때만 [H3] | Desktop IPC `desktop:check/download/install/set-channel/open-log-folder`; HTTP route 없음 [H3] | — updater 명령 없음; `--version`은 배포 식별 [C5] | — [B1] | 안내만 [A2] | Electron UpdateController/preferences·live editor restart handshake [H3], [H4] |
| Desktop CLI 통합 on/off | ✓ 설치형 Settings [H3] | Desktop IPC `desktop:cli-state/cli-set`; HTTP에 없음 [H3] | △ 실행할 CLI 배포는 있지만 자기 PATH 통합 제어 명령 없음 [C5] | — [B1] | 안내만 [A2] | Desktop CliIntegration·Windows 환경, 제품 명령은 기존 CLI [H5] |

**주요 빈칸:** 템플릿은 HTTP/CLI/UI에 있지만 비서 도구·카드가 없고, 표시 설정은 클라이언트에만 있다. 플러그인 등록 목록/번들 재등록만 CLI에 있으며 켜기/끄기/설정은 빠져 있다. Docling 변환·수동 ledger는 CLI에 있지만 검수·승인/거절·이력 제어는 HTTP/UI 중심이다. AI 연결/설정/대화는 HTTP/UI이며 비서가 호출할 제품 도구는 문서 세 가지뿐이다. Copilot에는 그 세 가지조차 연결되지 않았다. 단, cursor·focus·뷰 미리보기·폼 초안·Ctrl+Z의 CLI 부재를 곧바로 결함으로 분류하지 않는다.

진행 중 변경과도 구별한다. 조회 시 [PR #1123](https://github.com/litzio/litzio/pull/1123)은 OPEN이며 표시 설정 두 도구와 해당 창 request/reply·guarded Undo를 제안한다. 이 기준 커밋에는 아직 없다. 병합되면 표시 설정 행·도구 수·client 전달 선례를 갱신해야 하며, 그 구현을 무시하고 범용 이벤트 계층을 새로 만들 이유는 없다. [#1121](https://github.com/litzio/litzio/issues/1121)은 Copilot MCP 연결 방식·공통 정의·대화별 권한·카드 연결을 결정 전으로 남긴다.

## 구조 관찰

### CLI 직접 실행과 Host 경계

1. **문서 CLI:** `readFileSync` → Core parse/operation/serialize → `commitFile`, 생성은 `writeFileSync(..., wx)`다([C1], [C2], [C3]). 실행 중 Host를 찾거나 호출하지 않는다. `--if-revision`은 사용자가 읽은 기준을 지키고 commit도 CLI가 읽은 revision을 다시 검사한다. UI의 미저장 탭·recovery·history에는 접근하지 않는다. 외부 쓰기 뒤 UI Save의 revision 충돌 방어는 남지만, 이것은 미저장 작업을 함께 편집했다는 뜻이 아니다.
2. **템플릿 CLI:** 이미 `apps/editor/server/document-templates.ts`의 같은 store를 직접 import한다. save의 FileAccess 인자를 생략하므로 LOCAL_FILE_ACCESS다([C1], [T1], [F2]). 실행 중 HTTP Host의 고정 Roots가 적용되는 클라이언트는 아니다. 같은 OS 사용자라도 source `.litzio-dev`와 distributed 사용자 경로가 다를 수 있다([P2], [T2]).
3. **Docling·plugins CLI:** CLI 프로세스 안에서 새 `createPluginHost()`를 만들고 installed facade/store를 사용한다([C1], [C4], [P1]). 이는 Host 구현을 재사용하는 좋은 선례지만 **기존 Desktop/serve 인스턴스에 접속하지 않는다**. 등록/receipt는 공유 가능해도 transient session, active cancel controller, 비서 stdio 연결은 별개다. CLI 종료와 무관한 장시간 작업을 이 구조가 보장하지 않는다.
4. **Desktop CLI shim:** `ELECTRON_RUN_AS_NODE=1`로 별도 CLI를 실행하는 배포 경로다. PATH 설정을 켜도 실행 중 창과 연결되지 않는다([H5]). 원격 브라우저 PC의 PATH를 켜는 문제와 Host 쪽 비서 프로세스의 PATH 문제도 구별해야 한다. 비서 child는 서버/Host PC에서 실행된다([A1], [H1]). #1128의 CLI 경로 주입은 Host child 환경 문제를 해결하지만 동적 도구 공통화 자체는 아니다.

### 공통 검증과 중복을 구분

| 종류 | 현재 근거 | 판단 |
| --- | --- | --- |
| 문서 의미·canonical validation | Core 공개 API [K1], [K2], 모든 공식 저장에서 재호출 | 의도된 단일 소유권. UI의 빠른 피드백과 Host 저장 시 재검증은 제거할 중복이 아니다. |
| 파일 교체 revision/temp/rename | Host/CLI 모두 file-commit [D1], [C3], [F1] | 이미 공통. 새 Host registry가 이를 재구현하면 악화된다. |
| 새 문서 생성 정책/receipt | HTTP createDocumentFile, CLI create, 비서 executeDocumentTool 각각 exclusive write [D1], [C1], [B1] | Core는 같지만 파일 생성 조합·입력 검증·반환값이 갈라져 있다. #1128에서 공통 생성 결과 path/revision/identity를 우선 정리할 가치가 있다. |
| transport 입력/operation 입력 | document API JSON 분기 [D2], CLI flags/changeFor [C1], [C2], dynamic schema + 수동 검사 [B1] | flags/JSON parsing은 adapter 책임으로 유지. 도메인 인자·권한 검증은 공통 함수에서 한 번 정의하고, 외부 schema와 runtime validator가 어긋나지 않게 한다. |
| 접근 범위 | HTTP RootAccess [F2], Codex shell sandbox/turn scope [A2], document tool opened folders∩Host Roots [B1], Copilot permission [A2] | 서로 다른 경계가 겹친 것이며 전부 중복 버그는 아니다. 공통 정책 입력을 만들어도 HTTP Origin/Host, provider sandbox, UI 확인을 하나로 뭉개지 않는다. |
| 플러그인 선언·작업 명칭 | manifest routes + HostPlugin.routes/operations [P3], [P1], [G1]; CLI subcommands [C1]; 비서 목록 [B1] | 명칭/노출이 여러 군데 따로 있다. generic invoke가 이미 있으나 operation별 schema·권한·노출 목록이 통합돼 있지 않다. |
| 세 transport route | 현재 HTTP/desktop/Vite는 `/api/*`를 shared handler로 포워딩 [H1], [H2], [H6] | #834 당시의 “route 목록 중복”을 현재 그대로 인용하면 틀린다. 남는 차이는 Origin/body/static/asset와 Desktop Trash 등의 adapter capability다. |

HTTP는 인증이 내장되지 않은 단일 운영자 Host다. Host/Origin allowlist는 사용자 인증이 아니며 RootAccess는 OS sandbox가 아니다([H1], [F2], [HTTP 계약](../design/http-host-v1.md#http-and-remote-access)). CLI 직접 실행은 OS 계정 권한으로 동작한다. 비서 `full-access`도 **동적 문서 도구의 opened-folder/Host Root 검사**를 없애지는 않지만, 모델의 일반 셸까지 해당 검사로 감싸지는 않는다([B1], [A2], [A5]). 기존 문서 수정 금지는 현재 지침이므로 보안적 강제 보장으로 서술할 수 없다.

### 화면에만 있는 상태와 동적 도구

- preferences는 theme/accent/언어/폭/배경/table wrap, 최근·열린 폴더/접힘·탭 paths를 origin-local localStorage에 둔다([U3]). 비서 마지막 대화 ID는 AssistantPanel의 localStorage, composer 첨부·선택은 view state다([U5]). Desktop updater/channel 등의 preferences.json과도 별개다([H3]). “설정”이라는 단어만으로 하나의 Host 설정 파일로 합칠 근거는 없다.
- 미저장 적용 내용은 editor state와 클라이언트 IndexedDB recovery에 있고, history·selection·미적용 property draft는 복구 보장의 대상이 아니다([U2], [U4], [ADR-0007](../adr/0007-editing-session-lifetime.md)). 비서에는 active path와 저장 파일 맥락을 보내며 현재 미저장 본문을 보내지 않는다([A2]).
- `documentTools`는 `{type:"function", name, description, inputSchema}`의 수동 배열 세 개다. `thread/start.dynamicTools`에 전달하고 Host `toolCall` callback이 활성 thread/turn/namespace를 확인한 뒤 `executeDocumentTool()`을 호출한다. scope는 열린 folders, writeAccess, Host FileAccess이며 turn에 고정한다([B1], [A2]). 이 목록은 Core/CLI command catalog나 PluginHost.operations에서 생성되지 않는다.
- 결과는 JSON text content로 provider에 반환된다. UI는 성공 `create_document` tool result의 path/revision을 카드로 읽고 identity를 Undo에 사용한다([A2], [U6]). 셸이 같은 파일을 만들었다는 텍스트를 카드로 승격하지 않는다. 현재 CLI·HTTP create 응답도 이 카드용 receipt와 같은 계약은 아니다.
- MCP 서버는 Litzio가 노출하지 않는다. Codex가 사용자 환경의 MCP를 상속하는 것은 별개다([A1], [A2]). Copilot은 ACP 세션에 `mcpServers: []`, restricted shell deny와 별도 permission mediation을 쓰며 Litzio 동적 도구 adapter가 없다([A3], [A7]). 이름이 비슷한 provider tool을 제품 parity로 세지 않는다.

## 선택지 비교 (아래 규모는 추정)

PR 수는 이 표의 빈칸을 모두 없애는 견적이 아니다. 각 선택지의 기반과 대표 기능을 리뷰 가능한 단위로 나눈 **정적 조사 기반 예상 범위**이며 일정 약속이 아니다.

| 선택지 | 이점 | 남는 문제·비용 | 바뀌는 계약·예상 규모 |
| --- | --- | --- | --- |
| (a) 현 구조 + 새 기능 CLI 필수 | 제일 빠름. offline CLI·Desktop TCP 없음·현재 검증 재사용. | CLI만 생겨도 비서/HTTP/Copilot 빈칸은 남음. 의미 외 앱 작업의 schema/권한/receipt 분산, PATH/셸 의존, UI 상태 불일치 지속. “모든 UI 기능”을 CLI로 만들면 scope만 커짐. | 정책/예외 기준 1 PR, 템플릿·표시 설정 등 당면 누락 2–4 PR 추정. AGENTS 및 ADR-0014의 의도적 CLI 생략과 새 규칙 적용 범위를 정리. transport/lifetime ADR은 유지. |
| (b) Host 공통 작업 정의 + HTTP/CLI/비서 adapter, live Host가 없으면 같은 함수 직접 실행 | 의미는 Core에 유지하면서 domain 입력·권한·오류·receipt를 재사용. 기존 template store/plugin invoke 활용. standalone CLI도 유지 가능. | live Host 식별/접속과 target client 지정은 새 일. live/offline capability가 다르며 양쪽 구현을 별도로 유지하면 drift. UI prefs/history는 함수 공유로 해결되지 않음. 실패 뒤 local fallback은 중복 실행 위험. | 공통 함수·템플릿 pilot은 2–3 PR; client-local 동작/CLI 연결·대표 plugin adapter까지 3–6 PR 추가, 합계 5–9 PR 추정. 공통 작업 contract, templates/main-agent/runtime·CLI 문서, AGENTS 갱신. Desktop live transport 선택 시 ADR-0004 개정 필요. 문서/session store를 넣지 않으면 0002/0005/0007/0012의 핵심 유지. |
| (c) 별도 daemon, 앱·CLI·MCP가 같은 API client | 실제 controller 한 개, client-independent task lifetime·Desktop/Web 간 제어의 기반. offline fallback 모호성을 줄이고 state 권위를 명시할 수 있음. | 기동/탐색/IPC·credential·업데이트 version skew·shutdown·이벤트·task recovery가 추가됨. session 공유까지 원하면 lease/fencing·draft 범위가 별도 큰 문제. common operation 정의는 여전히 필요. | 기반/Desktop·HTTP 연결·task lifetime·automation 8–12 PR 이상 추정. 미저장 이어 쓰기는 추가 2–4 PR 추정. 새 process-model ADR, 0004/0005/0007/0012/0014·AGENTS 개정. 0002 plain-text SSOT와 0001 engine 소유권은 유지. |

### (a)를 택한다면

규칙은 “새 **headless 가능한 제품 작업**은 CLI surface를 제공하고 생략 이유를 명시한다”로 써야 한다. Core semantic operation에 관한 기존 규칙은 이미 있다. cursor·hover·focus·폼 초안은 제외하고, 표시 설정처럼 **특정 클라이언트 대상 명령**은 독립적인 분류를 둬야 한다. 규칙을 소급해 지금 표의 모든 빈칸을 즉시 구현하는 방식은 추천하지 않는다.

미저장 탭은 계속 UI 소유, CLI 수정은 외부 파일 변경이다. 결과 카드/Undo·remote HTTP 정책도 통일되지 않는다. #1128에 전용 도구를 추가할 수는 있으나 다음 기능에서 같은 wiring이 반복된다.

### (b)의 최소 계약과 live/offline 차이

다음은 **제안**이다. 새 범용 backend package나 거대한 schema compiler부터 만들 필요는 없다.

1. 작업별 이름·입력 runtime validation·handler·필요 capability·결과/오류를 가까이 둔다. 기존 Core operation, template store, plugin invoke를 handler가 호출한다. HTTP/CLI/model tool은 표현만 변환한다. 명세의 공통화는 provider별 tool format까지 동일하다는 뜻이 아니다.
2. 실행 context에는 document Roots, 고정 app-owned template/settings capability, write scope, 현재 client 식별 여부를 구분한다. caller JSON의 “권한 있음” 값을 그대로 믿지 않는다. HTTP 경로는 실제 Host가 구성한 Roots를 사용하고 headless local은 명시적 OS-user context로 실행한다. privileged local CLI의 범위를 HTTP client에 전파하지 않는다.
3. offline에서 가능한 것은 disk read/create/edit·templates·독립 plugin 작업이다. 특정 창의 표시 설정·open tab·미저장 편집·client 확인이 필요한 Undo는 client가 없으면 명시적으로 불가로 반환한다. 임의 창/기본 브라우저 설정을 조용히 바꾸지 않는다. 공유 registry에 “client 필요” 표시를 둔다고 client 통신이 구현된 것은 아니다.
4. live 연결은 처음에 **명시 endpoint/Host 선택**으로 한정하고, 자동 탐색은 후속으로 둔다. 여러 serve/여러 checkout/다른 Roots/버전이 있을 수 있다. Desktop에는 연결 endpoint 자체가 없으므로 named pipe 등 로컬 IPC를 선택할지, ADR-0004를 바꾸어 HTTP를 둘지 소유자 결정이 필요하다. 공통 함수 pilot에 이를 끼워 넣지 않는다.
5. endpoint가 지정되거나 요청을 보낸 뒤의 timeout/connection loss는 실패/불확실로 반환한다. **로컬 실행으로 재시도하지 않는다.** Host가 전혀 선택되지 않았을 때만 허용된 offline handler를 실행한다. plugin 작업은 기존 UUID receipts/no-replay를 재사용한다. 모든 파일 작업에 새 durable journal을 선제 도입하지 않는다.
6. CLI 출력은 JSON/exit code, HTTP는 transport status, Codex는 dynamic result로 변환하되 같은 작업 결과를 보존한다. MCP가 실제 필요해질 때 해당 노출을 추가한다. `POST /api/plugin-operation`을 통째로 모델에게 넘기거나 설치/설정 변경을 모든 agent에 자동 공개하지 않는다. 노출 여부·사용자 승인·실제 scope 검사와 공통 handler는 별개다.

**미저장 문서와 Undo:** 기존 문서 수정은 disk operation과 active editor proposal/apply를 분리한다. 후자는 사용자가 승인하고 기준 revision/session이 맞을 때 일반 editor transaction으로 적용해야 Ctrl+Z를 유지할 수 있다. disk commit을 했다고 그 창 history에 삽입하지 않는다. 새 문서 receipt는 생성 카드에 재사용할 수 있지만 카드 Undo의 tab/recovery 확인은 해당 창과 기존 `/api/file` 경계를 계속 통과해야 한다([U6], [U7], [F3]). CLI에서 생성 receipt를 받는 것만으로 다른 창에 카드가 생긴다고 약속하지 않는다. 카드 전달/ack가 필요해질 때 client 대상 계약을 추가한다. 다른 창의 아직 기록되지 않은 초안까지 현재 Host가 확인한다는 보장도 추가하지 않는다.

**표시 설정:** #1120/#1123 문제를 풀려면 “현재 대화가 속한 창의 theme 변경” 같은 client-target command와 확인 응답이 필요하다. client-local prefs를 서버 전역 defaults로 바꾸는 것은 다른 결정이다. remote HTTP의 브라우저 localStorage를 서버 CLI가 직접 쓸 수 없다는 제한을 숨기지 않는다.

### (c)와 Paseo 비교

2026-11-04 [Paseo CLI 문서](https://paseo.sh/docs/cli.md)는 CLI를 daemon API의 client로 설명하며 `--host`/`--home`으로 대상 daemon을 고른다. 이것을 “daemon 없으면 동일 함수를 offline 실행한다”의 근거로 삼을 수는 없다. 그 fallback은 Litzio 선택지 (b)의 독자 제안이다. [Paseo security](https://paseo.sh/docs/security.md)는 WebSocket client/server, direct/relay 연결, Host allowlist와 선택적 password를 설명한다. relay·pairing·auth 운영 전체를 공통 API의 필수 조건으로 가져올 이유는 없다. 두 원문은 Markdown fetch를 지원하지 않는 웹 도구 대신 PowerShell `Invoke-WebRequest`로 읽었다.

데몬은 앱 종료 뒤 작업 수명과 공통 live controller가 실제 요구일 때 유용하다. 그러나 미저장 문서를 자동으로 없애거나 plain-text 명시적 저장을 대체하지 않는다. #834의 single-writer lease/snapshot 방향을 채택하려면 권한 이전, stale writer fencing, 복구 초안 범위, 재연결·Host restart와 history 초기화를 결정해야 한다. CRDT나 history 공유를 지금 구현할 근거는 없다. 결과 카드를 어느 client가 보고, 끊어진 client의 승인을 누가 대신할지 역시 별도 문제다.

**원격 HTTP 접속:** 세 안 모두 현재 외부 access-controlled proxy와 Root 경계를 유지해야 한다. 데몬 선택만으로 인증이 생기지 않는다. client 권한을 넓히는 remote command/설치/AI full access를 새로 노출한다면 해당 권한 경계를 결정해야 하지만, 이번 조사에서 계정·RBAC·relay·마켓플레이스까지 설계할 필요는 없다.

## 추천 이행 순서와 멈춤 기준

1. **결정 PR (1개):** (b)의 단계적 채택과 headless CLI 원칙/예외를 문서화한다. operation 의미/파일 side effect/클라이언트 명령을 구분하고 지금은 daemon·automatic discovery·session store를 도입하지 않는다고 정한다. 새 작업 목록 계약은 권위 문서로 색인한다. 이 조사 초안 자체는 승인된 계약으로 승격하지 않는다.
2. **템플릿 pilot (#1128, 1–2개):** list/read/save와 create-from-template의 기존 함수를 얇은 정의로 묶는다. CLI/HTTP가 재사용하고 Codex에 `list_templates`, `read_template`, `save_template`, create의 template 인자를 제공한다(명칭은 결정 시 확정). 생성은 기존 card receipt의 path/revision/identity를 반환한다. 생성 전 템플릿 제안→허락→적용 및 저장 전 disk source 확인을 보존한다. #1128의 Host child PATH 주입은 보조 경로이며 도구의 실행을 셸에 의존시키지 않는다. #1123과 같은 등록 파일을 고치므로 병합 순서를 확인한다.
3. **범위 증명 후 확장 (2–3개 추정):** 실제 필요가 있는 plugin enable/disable/settings, Docling status/review 도구를 기존 `invoke` 위로 붙인다. AI 검수는 #767의 app-server 전환 결정과 맞춰 별도 범위를 승인받는다. 승인/거절을 모델이 사용자 대신 실행하지 않게 한다. Copilot은 [#1121](https://github.com/litzio/litzio/issues/1121)의 adapter 결정을 먼저 하고 동일 handler를 쓰되 native arbitrary-file edit를 parity로 취급하지 않는다.
4. **live CLI (1–3개 추정):** 대상 Host 선택/버전·capability 협상·무응답 처리와 Desktop IPC 결정을 따로 한다. client-local 작업을 실제로 CLI에서 요구할 때만 client-target/ack를 넣는다. 운영자가 지정한 원격 Host 실패를 local fallback으로 숨기지 않는다.
5. 앱을 닫아도 작업 지속·Desktop↔Web live 제어/미저장 이어 쓰기가 가까운 필수 시나리오가 되면 #834 단계 ③을 다시 연다. 그때 Desktop in-process와 daemon을 영구 이중 경로로 둘지부터 결정한다.

pilot의 완료 기준은 기존 Core/template 보호를 유지하면서 HTTP·CLI·dynamic tool의 동일 template identity/source, duplicate/no-overwrite·Root 거부, 제한된 비서의 app-owned template 저장, 생성 receipt와 카드 Undo가 일관적인지 확인하는 것이다. 유효성은 공통 handler/Core 계층에서, CLI는 인자/JSON/exit, HTTP는 boundary, 비서는 turn scope/result, 브라우저는 card/tab/recovery 고유 위험만 검증한다. 같은 실패를 모든 계층에서 반복하거나 실제 AI 모델 호출로 routine 검증을 대체하지 않는다. 이는 향후 검증 제안이며 이번에 실행한 테스트가 아니다.

컨셉 단계에서 미룰 것은 범용 daemon/platform, 자동 Host 탐색·모든 command 자동 생성, multi-user 권한 체계, marketplace/서명/배포·플러그인 sandbox, 공유 session/history, durable 범용 command queue다. 공식 write 유효성·데이터 보존·기존 Root/revision/receipt 검사는 미루는 대상이 아니다.

## 이번 산출물 검증

- `pnpm docs:check`: 실패 1건. 이 초안의 `docs/README.md` 직접 링크 누락만 보고됐다. 요청대로 색인·검사 코드에는 손대지 않았다. 그 외 local link/anchor 오류는 보고되지 않았다.
- `git diff --check`: 통과. 기준 소스 링크의 파일 존재·행 범위와 표의 참조 정의를 정적으로 대조했다.
- 제품 코드·설정·공용 사용자 `.litzio` 변경 없음. 제품 실행·브라우저·실제 AI·로컬 패키징/설치/Edge 실행 없음. 문서 검사에 필요한 worktree 의존성은 pnpm이 로컬 캐시에서 자동 준비했다. 테스트용 background server/session은 시작하지 않았다.

## 정적 조사 근거 (기준 커밋의 파일·행)

표의 ID는 아래 링크로 파일과 행을 고정한다. 부재는 해당 시점의 전체 CLI dispatcher/command switch([C1], [C2], [C4]), 전체 dynamic tool 배열([B1]), Copilot 연결([A2], [A3])을 함께 대조했다. 구현에 별도 headless 함수가 있다는 사실을 CLI 명령 또는 모델 도구가 있다고 확대하지 않았다.

- [K1] `packages/core/src/index.ts:52–140` — Core 공개 의미/parse/serialize/validation.
- [K2] `packages/core/src/index.ts:145–148` — template metadata와 create-from-template.
- [C1] `packages/cli/src/cli.ts:860–1010` — templates/plugins/docling/문서 dispatcher와 직접 생성·읽기.
- [C2] `packages/cli/src/cli.ts:1103–1365` — semantic command → Core 함수 매핑.
- [C3] `packages/cli/src/cli.ts:1018–1040` / `1425–1454` — dry-run/commit·batch revision과 validation.
- [C4] `packages/cli/src/cli.ts:1955–1988` — PDF plugin invoke, 별도 serve startup.
- [C5] `packages/cli/src/cli.ts:860–890` — 공통 version/help.
- [D1] `apps/editor/server/document-api.ts:97–260` — load/text/create/revision/preview/save helpers.
- [D2] `apps/editor/server/document-api.ts:261–541` — shared HTTP/protocol dispatcher와 method별 실행.
- [D3] `apps/editor/server/document-replay.ts:90–145` / `538–574` — Core-backed read/replay/serialize와 오류.
- [D4] `apps/editor/server/document-api.ts:580–717` — folder list/browse/places/create.
- [B1] `apps/editor/server/agent-document-tools.ts:1–57` — 동적 도구 세 가지와 전체 scope/파일 생성 구현.
- [A1] `apps/editor/server/ai-agent-connection.ts:8–126` — 생성 지침/skill·환경/catalog/진단.
- [A2] `apps/editor/server/ai-agent-conversations.ts:20–49`, `85–195`, `215–295`, `383–386` — tool callback/등록/scope/provider/context/결과.
- [A3] `apps/editor/server/copilot-acp.ts:33–80` — ACP launch·제한 flags/연결.
- [A4] `plugins/ai-agent/src/host.ts:23–47` / `plugins/ai-agent/src/adapters.ts` — settings/task service 및 별도 exec 정책.
- [A5] `docs/design/main-agent-v1.md:834–918` — provider별 현재 계약·permission 한계.
- [A6] `plugins/ai-agent/src/adapters.ts:15–85` — 실제 Codex exec/snapshot sandbox 정책.
- [A7] `apps/editor/server/ai-agent-conversations.ts:215–295` — Copilot prompt/scope·permission mediation.
- [P1] `apps/editor/server/plugin-host.ts:28–189` — installed facade/services/agent operations와 generic invoke/route.
- [P2] `docs/design/plugin-runtime-v1.md:11–75`, `146–202`, `260–399` — 저장·권한·요청/소유권·AI 현재 계약.
- [P3] `packages/plugin-api/src/host.ts` / `docs/design/plugin-ui-v1.md:38–189` — 공개 Host operation/UI 기여 계약.
- [P4] `apps/editor/server/plugin-store.ts:69–258` — 실제 등록·enable/disable·SQLite owner·admission 검증.
- [P5] `apps/editor/server/plugin-runtime.ts:20–157` — process-local controller·worker 실행/취소·종료.
- [G1] `plugins/docling/src/host.ts:17–174` — HTTP route·generic operation과 CLI용 facade.
- [G2] `plugins/docling/src/ui-plugin.tsx` / `Dashboard.tsx` / `ReviewPanel.tsx` — 기여 등록·결과·검수 화면.
- [G3] `plugins/docling/src/structure-review.ts` / `conversion/correction-files.ts` — 제안·승인·교정 재생성.
- [G4] `plugins/docling/src/conversion/correction-files.ts:46–142` — ledger 추가·삭제와 폴더 재생성.
- [T1] `apps/editor/server/document-templates.ts:12–90` — 공용 catalog/read/create source/save 검증.
- [T2] `apps/editor/server/host-paths.ts` — source/distributed 앱 데이터 경로.
- [F1] `packages/file-commit/src/index.ts` — revision·preflight·파일 교체 공통 구현.
- [F2] `apps/editor/server/file-access.ts:6–138` — local policy와 HTTP RootAccess.
- [F3] `apps/editor/server/file-operations.ts:47–60`, `90–217` — identity/revision 삭제·rename/rollback.
- [F4] `apps/editor/server/asset-api.ts` — MIME/asset 업로드·서명 receipt rollback.
- [H1] `apps/editor/server/http-host.ts:32–102` — Root Host composition·HTTP admission·공용 dispatcher.
- [H2] `apps/desktop/src/host-protocol.ts:55–90` — in-process forwarding·Trash capability.
- [H3] `apps/desktop/src/main.ts:174–238` / `apps/desktop/src/preload.ts:14–40` — trusted IPC·bridge.
- [H4] `apps/desktop/src/updates.ts` / `main.ts:154–172` — UpdateController와 editor restart check.
- [H5] `apps/desktop/src/cli-integration.ts` / `docs/design/desktop-distribution-v1.md:77–153` — 별도 Node CLI shim·opt-in PATH.
- [H6] `apps/editor/vite.config.ts:62–90` — dev adapter 공용 dispatcher.
- [U1] `apps/editor/src/document-session.ts:25–137` — open/create/save/Source browser transport.
- [U2] `apps/editor/src/DocumentEditor.tsx:282–385`, `435–445`, `565–589` — single state/history와 문서 설정 적용.
- [U3] `apps/editor/src/preferences.ts:1–220` — client-local display/navigation/table wrap.
- [U4] `apps/editor/src/recovery-storage.ts:1–99` / `docs/adr/0007-editing-session-lifetime.md` — client recovery 경계.
- [U5] `apps/editor/src/shell/AssistantPanel.tsx:21–114`, `170–263` — conversation·composer·설정/참조/skill UI.
- [U6] `apps/editor/src/shell/AssistantPanel.tsx:300–321`, `390–405` — 생성 카드 및 receipt 판정.
- [U7] `apps/editor/src/App.tsx:600–680`, `1110–1240`, `1450–1459` — 파일/Undo·사용자 작업·비서 연결.
- [U8] `apps/editor/src/shell/TemplateGallery.tsx:19–107` — gallery 읽기·미리보기·생성 callback.
- [U9] `apps/editor/src/shell/SaveTemplateDialog.tsx:13–40` — template save UI.
- [U10] `apps/editor/src/shell/DocumentSettings.tsx:35–79` — 문서 번호·참조 설정 UI.
- [U11] `apps/editor/src/PluginSettings.tsx:22–137` — plugin list·toggle·재등록 UI.
- [U12] `apps/editor/src/App.tsx:848–890`, `1154–1166` — 템플릿 생성과 Save-first UI gate.

[A6]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/plugins/ai-agent/src/adapters.ts#L15-L85
[A7]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/ai-agent-conversations.ts#L215-L295
[P4]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/plugin-store.ts#L69-L258
[P5]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/plugin-runtime.ts#L20-L157
[G4]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/plugins/docling/src/conversion/correction-files.ts#L46-L142
[U12]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/App.tsx#L848-L890

[K1]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/packages/core/src/index.ts#L52-L140
[K2]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/packages/core/src/index.ts#L145-L148
[C1]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/packages/cli/src/cli.ts#L860-L1010
[C2]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/packages/cli/src/cli.ts#L1103-L1365
[C3]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/packages/cli/src/cli.ts#L1018-L1040
[C4]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/packages/cli/src/cli.ts#L1955-L1988
[C5]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/packages/cli/src/cli.ts#L860-L890
[D1]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/document-api.ts#L97-L260
[D2]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/document-api.ts#L261-L541
[D3]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/document-replay.ts#L90-L145
[D4]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/document-api.ts#L580-L717
[B1]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/agent-document-tools.ts#L1-L57
[A1]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/ai-agent-connection.ts#L8-L126
[A2]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/ai-agent-conversations.ts#L20-L195
[A3]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/copilot-acp.ts#L33-L80
[A4]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/plugins/ai-agent/src/host.ts#L23-L47
[A5]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/docs/design/main-agent-v1.md#L834-L918
[P1]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/plugin-host.ts#L28-L189
[P2]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/docs/design/plugin-runtime-v1.md#L11-L399
[P3]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/packages/plugin-api/src/host.ts#L1-L34
[G1]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/plugins/docling/src/host.ts#L17-L174
[G2]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/plugins/docling/src/ui-plugin.tsx#L1-L165
[G3]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/plugins/docling/src/structure-review.ts#L1-L180
[T1]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/document-templates.ts#L12-L90
[T2]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/host-paths.ts#L1-L24
[F1]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/packages/file-commit/src/index.ts#L1-L65
[F2]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/file-access.ts#L6-L138
[F3]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/file-operations.ts#L47-L217
[F4]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/asset-api.ts#L1-L200
[H1]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/server/http-host.ts#L32-L102
[H2]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/desktop/src/host-protocol.ts#L55-L90
[H3]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/desktop/src/main.ts#L174-L238
[H4]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/desktop/src/updates.ts#L1-L183
[H5]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/desktop/src/cli-integration.ts#L1-L169
[H6]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/vite.config.ts#L62-L90
[U1]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/document-session.ts#L25-L137
[U2]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/DocumentEditor.tsx#L282-L589
[U3]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/preferences.ts#L1-L220
[U4]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/recovery-storage.ts#L1-L99
[U5]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/shell/AssistantPanel.tsx#L21-L263
[U6]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/shell/AssistantPanel.tsx#L300-L405
[U7]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/App.tsx#L600-L680
[U8]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/shell/TemplateGallery.tsx#L19-L107
[U9]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/shell/SaveTemplateDialog.tsx#L13-L40
[U10]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/shell/DocumentSettings.tsx#L35-L79
[U11]: https://github.com/litzio/litzio/blob/893290e29f383bb04fb20bc50e9130077dc88764/apps/editor/src/PluginSettings.tsx#L22-L137
