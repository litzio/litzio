# 플러그인 1단계

- Status: Implemented
- Verification #1434: 2026-11-10 — Host 기본 제작 위치의 생성·등록·실제 subprocess 호출·수정/reload, 열린 폴더 없는 turn의 sandbox 요청, 읽기 전용 거부·명시 경로 범위, hostPaths의 개발/배포/환경 override와 CLI 전달 fixture, 전체 typecheck·production build 확인. 실제 AI 제작·원격 Host 통신·설치형 앱 실행은 미검증.
- Verification #1408: 2026-11-10 — 공용 PDF 대조·진행 저장 Host/CLI, SDK/Docling 단위 검사와 대표 HTTP 브라우저·기존 review 회귀 확인. 실제 docling-serve의 작은 합성 PDF를 변환해 1440px·한국어 Dark 640px 대조/확인 저장을 확인했으며 복잡한 PDF 품질·의미 동등성은 미검증.
- Verification #1366: 2026-11-09 — SDK/OneDrive/Host·folder-tree tests, typecheck, CLI/Editor production build and HTTP folder/icon regressions; 1440px and Korean dark 640px before/after review. Real account synchronization is unverified.
- Verification #1346: 2026-11-09 — SDK/Host icon validation and digest-trust tests, Editor typecheck, production CLI/Editor build, HTTP browser fixture with SVG script non-execution; 1440px and Korean dark 640px visual inspection. External plugin artwork/service adoption is unverified.
- Verification #1334: 2026-11-09 — SDK 선언·기능 버전 거부, Host 고정 결과 검증, Vite 설정 성공/오류·비활성·정보 진입, production HTTP 사이드바·secret·복구 fixture, typecheck와 CLI build 확인. 외부 서비스 연결은 미검증.
- Verification #1326: 2026-11-09 — K1 file 결과·공개 SDK·Host/CLI/browser fixture와 native/review 회귀, typecheck/build 확인. 실제 Docling 산출물 크기·변환 품질은 미검증.
- Host assembly (#1246): `host-services.ts` composes independent plugin and view services and lazily initializes the assistant. Plugin management/secret routes belong to `plugin-service.ts`; views receive that same plugin runtime explicitly through `view-service.ts`. Assistant shutdown closes only its provider/conversation resources; Host shutdown closes plugins independently, including when assistant initialization or shutdown fails. Views retain no separate runtime resources. Concurrent/repeated Host close calls share one shutdown promise, including its failure. A send waiting for plugin startup rechecks assistant shutdown before provider admission. Request paths, lazy plugin start, receipts and stored formats are unchanged.
- Last verified: 2026-11-06 — V4 승인 내용 고정·snapshot baseline·K1 status 완료 fixture와 대상 회귀 검사, 전체 typecheck 확인. V5 브라우저 통합은 미검증.
- Verification #1287: 2026-11-06 — OneDrive 탐색기 자동 표시·비활성화 목록 제거의 HTTP browser fixture 검증. 실제 계정 동기화는 미검증.
- Previous verification: 2026-11-06 — #1244 플러그인별 값 마스킹·키 보존·삭제·로그 비노출과 #1245 접수/작업 수명 분리·실제 10초 초과 subprocess 회귀. 기존 검증: 2026-11-05 SDK·Host·OneDrive fixture, 제작 lifecycle·CLI·실제 Codex 두 모델 및 http-plugins 검사. 필수 CI 결과는 구현 PR에 기록한다.
- Authority: [ADR-0020](../adr/0020-plugin-architecture.md)의 소유자 1단계 개시. [ADR-0019](../adr/0019-plugin-tiers.md), [ADR-0015](../adr/0015-shared-host-operations.md), [ADR-0018](../adr/0018-desktop-remote-hosts.md)을 따른다.
- Scope: 최소 SDK, 명시적 로컬 등록·신뢰·활성화, 공용 작업·CLI·설정과 OneDrive, 비서 제작 키트. Jira와 동적 UI 스파이크는 후속이다.

2026-11-05 소유자 제작 로드맵 결정 2·5에 따라 아래 하위 프로세스·reload·관리별 승인 제거를 구현한다. 같은 결정은 ADR-0020의 비서 제작 로드맵 개정에 기록되어 있다.

## 경계와 manifest

`packages/plugin-sdk`는 React·Editor·Core AST 의존 없이 manifest, JSON Schema 검증과 공용 작업·폴더·계정 타입을 공급한다. `litzio-plugin.json`이 실행 선언이며 패키지 버전은 package.json과 일치해야 한다. ID, tier, publisher, SemVer SDK 범위, 패키지 안 entry, contributes와 settingsSchema를 import 전에 검증한다. JSON Schema는 Ajv, manifest는 Zod, 버전은 SemVer를 재사용한다. 외부 `$ref`와 알 수 없는 필드·중복 기여를 거부한다.

확장 자리 `contributes.dataViews`, `generatedUi`, `secretUses`는 비어 있지 않으면 미지원으로 등록을 거부한다. 카탈로그 V1에서 `contributes.views:[{id,title,definition}]`는 inline query v2 명세만 받고, `contributes.reviews:[{id,title,read,propose?,approve?,reject?,undo?}]`는 `{operation,version}` binding을 받는다. 같은 플러그인의 완전 이름 `<plugin-id>.<operation-id>`와 등록 version만 허용하며 view는 rowSchema 읽기, review read는 read, 나머지는 write여야 한다. unknown action·cross-plugin·effect/version 불일치는 entry 전에 거부한다. [Core/SDK 조회 계약](plugin-screens-v1.md#core-명세와-조회)을 SDK가 재노출한다. 실제 Host dispatch·기본 UI·CLI와 승인 경계 연결은 V2/V4 범위다. `secrets`는 중복 없는 id·connection scope·required 선언을 지원한다. secret 값 조회 API와 생성 UI·저장 뷰 runtime은 없다.

공용 작업은 id/version/effect/scope와 입력·결과 schema를 선언하고 같은 id의 handler를 연결한다. 1단계 기능 작업은 host scope만 지원하며 folder scope 선언은 미지원으로 거부한다. `activate(context)`는 operations/status/dispose를 반환한다. 미선언·누락 작업 handler는 활성화 실패다. 폴더 소스와 장식·계정은 선언한 기여의 상태 결과다. SDK 0.3.0의 `FolderDecoration.icon: "plugin"`은 해당 플러그인의 manifest `icon`을 사용하며 이미지가 없으면 장식을 생략한다. 폴더 열기는 기존 파일 Host가 검증한다. 문서 의미·공식 쓰기 경계는 변경하지 않는다.

## Host 상태와 호출

대상 daemon의 Host 설정 루트에 별도 plugins.json을 기록한다. `LITZIO_DATA_DIR` 또는 `LITZIO_PLUGINS_SETTINGS_FILE`로 격리할 수 있다. 임의 디렉터리 자동 탐색, SQLite, migration과 자동 파일 감시 reload는 없다. 로컬 artifact 안의 파일을 digest로 묶고 패키지 밖 참조를 거부한다. 공식 공급 목록은 id·publisher와 제품이 검토한 artifact digest를 대조한다. 자칭 official 또는 변경 artifact는 공식 신뢰를 얻지 않는다.

공식 번들 플러그인은 목록에 자동 표시되고 기본 상태는 공급 항목의 `defaultEnabled`(현재 `false`)를 따르며, 사용자의 명시적 선택이 우선한다. 외부 플러그인은 명시적으로 등록하고 처음 켤 때 등록된 플러그인을 신뢰한다. 신뢰는 ID와 그 등록에 저장하며 artifact digest에 묶지 않는다. UI는 스위치를 처음 켤 때 공통 Dialog로 확인하고 확인 시 같은 enable 작업에서 신뢰 기록과 켜기를 함께 처리한다. 취소하면 요청을 보내지 않아 신뢰·활성 상태가 바뀌지 않는다. Host는 등록마다 새 `registrationId`를 발급하고 목록으로 반환한다. 이 값은 artifact 업데이트·reload·Host 재시작 동안 유지되며 제거 후 재추가·등록 교체 때 바뀐다. 신뢰 작업과 신뢰를 함께 기록하는 enable은 사용자가 확인한 `registrationId`를 반드시 보내야 한다. Host는 관리 직렬화 안에서 현재 값과 대조하고, 없거나 다르면 `Plugin registration changed. Review the plugin and confirm again.` 사유로 상태 변경 전에 거부한다. UI는 창을 열 때의 값을 보내며 거부 시 창을 닫고 목록을 다시 확인하도록 안내한다. 새 등록으로 승인을 자동 전환하지 않는다. CLI는 list에서 확인한 값으로 `trust <id> --registration <registrationId>` 후 `enable <id>` 또는 `enable <id> --trust --registration <registrationId>`를 쓴다. CLI는 누락된 값을 자동 조회하여 승인하지 않는다. 선택적인 `trust --digest`는 현재 파일 지문 대조용이며 신뢰의 수명은 바꾸지 않는다. 사용자와 비서는 같은 Host 작업을 쓴다. 업데이트 뒤 다시 확인하지 않는다. 이는 컨셉 검증 단계의 제한이다. 제거 후 재추가 또는 등록 교체는 다시 신뢰해야 한다. 외부 artifact가 달라지면 검증 후 reload한다. 자동 교체하지 않는다. 비활성화는 신규 호출을 먼저 차단하고 상태 기여를 숨긴 뒤 이미 접수한 호출을 drain하고 dispose한다. 설정과 열린 폴더·탭은 보존한다. 단, 아래 플러그인 자동 표시 폴더는 탐색기 목록에서 제거하며 원본 파일과 열린 탭은 보존한다. OS 권한 격리는 보장하지 않는다.

플러그인마다 daemon의 Node 하위 프로세스 하나를 사용한다. Node IPC 채널의 요청 ID로 activate·invoke·status·dispose와 응답을 연결하며 stdout/stderr와 플러그인 예외 원문은 전달하지 않는다. 별도 bootstrap 파일 없이 번들 안의 고정 코드로 시작하므로 설치된 CLI도 같은 경로를 쓴다. 각 RPC 응답은 10초 후 실패하며 프로세스를 종료한다. 접수된 K1 백그라운드 작업 수명에는 이 제한이 적용되지 않는다. 읽기 실패는 failure, 쓰기 실패는 기존 uncertain receipt를 유지하고 자동 재전송하지 않는다.

`reload`는 신규 요청 차단 → 접수한 상태·기능 요청 drain → dispose → 프로세스 종료 확인 → 현재 artifact 재검증 → 등록 신뢰 확인(공식 번들은 공급 digest 검증 유지) → 새 프로세스 시작 순서다. daemon 재시작 없이 같은 ID의 수정 artifact를 반영한다. ID 변경과 작업 이름 충돌은 거부한다. 실패하면 비활성·오류 상태로 남고 수정 후 다시 reload하면 회복한다. dispose 실패도 프로세스를 종료한 뒤 보고하며 다음 reload가 가능하다. 예기치 않은 하위 프로세스 종료는 실행 실패로 표시하고 자동 재시작하지 않는다.

`GET /api/plugins`는 목록, `POST /api/plugins`는 action과 해당 입력을 받는다. 관리 결과에는 목록과 requestId·operation·version·scope·outcome receipt가 있다. 기능 호출은 `action: invoke`, operation 완전 이름과 input을 받아 입력/출력 schema를 검사한다. Host 연결 실패 뒤 다른 Host나 로컬 실행으로 전환하거나 재전송하지 않는다.

CLI는 반드시 `--host <http(s) origin>`을 명시하고 daemon 프로토콜을 먼저 확인한다. JSON 결과는 대상 origin과 동일 Host 결과를 보존한다.

```text
plugins scaffold [new-absolute-directory] --id <plugin-id> --host <origin> --json
plugins validate <artifact-directory> --host <origin> --json
plugins list --host <origin> --json
plugins unregister <id> --host <origin> --json
plugins register <artifact-directory> --host <origin> --json
plugins trust <id> --registration <registrationId> [--digest <digest>] --host <origin> --json
plugins enable|disable|reload <id> --host <origin> --json
plugins settings <id> [--file <json>] --host <origin> --json
operation invoke <pluginId.operationId> --input <json> --host <origin> --json
```

settings는 --file 없이 현재 일반 설정을 조회한다. 일반 설정과 secret 저장·삭제는 활성 상태에서도 받으며, 저장 후 기존 reload 경로로 새 값을 적용한다. 해당 플러그인의 K1 작업이 running 또는 uncertain이면 변경 전에 이유를 반환하고 기존 값을 보존한다(비활성 상태도 동일). 검사부터 저장·reload까지 신규 작업 접수를 차단하며 기존 drain·uncertain/no-replay 수명은 바꾸지 않는다. reload 실패 시 저장된 새 값은 유지하고 기존 reload 오류·비활성 상태로 남는다. 디스크 artifact 변경 뒤에는 기존 켜기 또는 reload의 ID·작업 이름 충돌·등록 신뢰 검증을 거쳐 새 설정으로 실행한다. 등록 신뢰는 유지하며 공식 번들 artifact 검증은 그대로 유지한다. 설정 UI는 기존 Settings 콘텐츠·Button·Input·SettingsSwitch·Dialog를 재사용한다. 목록은 Hosts 설정의 host-summary 행, 공통 settings-switch·Notice·Tooltip·Dialog와 HostStatus의 점/톤 스타일을 재사용한다. 이름·공식/커뮤니티 배지 하나·설명을 왼쪽에 묶고 활성 토글은 같은 행 오른쪽 끝에 둔다. 플러그인 상태는 오류·사용할 수 없음 등 문제만 표시하고 정상 실행·꺼짐은 스위치로 표현한다. 폴더 감지 상태는 folderSources를 선언한 플러그인만 표시하며 계정은 `계정: 라벨 (출처)`로 표시한다. 상단은 한 줄 경고와 상세 Tooltip이다. 목록은 공급 책임·활성과 오류를 구별하고 설정 창 상세 정보는 만든 곳·신뢰 여부·현재 artifact digest를 표시한다. 비서는 별도 `manage_plugins` 도구로 같은 Host 함수를 호출한다. Codex dynamic tools에 연결하며 관리별 승인 질문 없이 실행한다. 작업·대상 ID·성공/실패를 기존 대화 도구 활동 항목과 도구 결과에 남긴다. 도구 결과는 Codex 대화 이력에서도 확인할 수 있다. 활동 기록에는 설정값·secret·artifact 예외 원문을 넣지 않는다. display 도구의 범위는 확대하지 않는다. 기존 Copilot adapter에는 새 도구 공급을 추가하지 않는다.

일반 설정 검증 실패는 Host가 validator keyword와 JSON Pointer 필드 경로를 settingsIssues로 전달한다. required는 누락된 필드 경로를 포함한다. CLI의 기존 영어 상세 오류와 비서의 일반 실패 결과는 유지한다. 앱은 영어 원문을 해석하지 않고 locale의 쉬운 오류 문구로 해당 필드에 표시한다. 알려지지 않은 오류는 고정된 일반 문구로 표시한다. 기존 FieldError·Input을 재사용하며 공통 UI 예외는 없다.

시각 확인: [640px 한국어 오류](assets/plugin-settings-1407/error-640-ko.png). 합성 설정 fixture이며 외부 서비스 연결 성공의 증거는 아니다.

#1320 화면 확인: 기존 설정 Dialog·Input·SettingsSwitch·Button·Notice를 재사용하며 공통 패턴 예외는 없다. 활성 상태 입력을 같은 fixture로 수정 전·후 확인했다. [1440px 이전](assets/plugin-settings-1320/before-1440.png) / [이후](assets/plugin-settings-1320/after-1440.png), [한국어 Dark 640px 이전](assets/plugin-settings-1320/before-640.png) / [이후](assets/plugin-settings-1320/after-640.png). 행 정렬·여백·잘림·한국어 줄바꿈을 수동 확인했다. Host 검사에서 running·uncertain 변경 거부와 원본 보존, 기존 secret 비노출을 검증하며 HTTP 브라우저 검사는 활성 일반 설정 UI/CLI와 secret UI 저장·CLI 삭제 후 새 실행값을 확인한다. 실제 외부 서비스 연결 성공의 증거는 아니다.

## OneDrive

`plugins/onedrive`는 SDK 타입과 Node API만 사용한다. `pnpm --filter @litzio/onedrive build`가 자체 실행 의존성을 포함한 artifact 디렉터리를 만든다. Host와 CLI는 OneDrive source를 import하지 않는다. 공식 artifact는 앱에 포함해 자동 표시하며 사용자가 토글로 활성화한다.

Windows 환경 변수 OneDrive/OneDriveConsumer/OneDriveCommercial과 실재 폴더를 우선한다. HKCU Software/Microsoft/OneDrive/Accounts 직하위 계정의 UserFolder를 best-effort로 보완하며 중복 경로를 합친다. 조회 실패·불완전/없는 경로 수와 출처를 보존한다. UserEmail/DisplayName이 실제 조회된 경우만 표시하고, 그 밖에는 경로 기반 중립 라벨을 쓴다. raw 레지스트리 출력은 로그에 쓰지 않는다. SyncEngines, ini, WinRT, Graph/OAuth와 동기화 엔진은 사용하지 않는다. Linux 등 다른 OS에서는 지원하지 않음을 표시한다.

폴더 감지는 로그인이나 동기화 상태의 증거가 아니다. 활성화되어 실행 중인 플러그인이 status.folders로 알린 모든 폴더를 ID와 무관하게 로컬 Explorer에 자동 표시한다. OneDrive도 같은 경로를 사용한다. defaultCandidate는 기존처럼 빈 탐색기에서 단일 후보를 제안할 때만 쓰며 자동 표시는 모든 폴더에 적용한다. 기존 파일 Host의 폴더 검증·FolderTree를 재사용하고 기존 폴더·탭을 덮지 않는다. 자동 표시의 소유자는 앱의 폴더 상태이며 일반 열린 폴더 기억 목록에 저장하지 않는다. 비활성화하면 자동 표시한 폴더를 탐색기 목록에서 제거하며 디스크의 원본 폴더·문서와 열린 탭은 보존한다. 자동 상위 루트가 기존 수동 하위 폴더를 화면에서 합쳐 표시해도 수동 루트의 소유권·기억 목록·접힘/펼침 상태는 보존하고, 자동 루트 제거 시 수동 트리를 복원한다. 활성 상태에서 새로고침해도 일반 폴더 기억 목록으로 같은 수동 루트를 먼저 복원한다. 감지 루트 자체를 일반 폴더로 직접 추가한 뒤 비활성화하는 예외는 #1287 범위 밖이다. 앱의 플러그인 상태 조회는 가장 최근 시작한 요청의 결과·오류만 반영하고 관리 시작·구독 해제 시 이전 요청을 무효화한다. Host가 활성 상태로 생성한 응답의 전달이 비활성화 완료 뒤로 늦어져도 이전 폴더·토글을 복원하지 않는다. 수동 전후 캡처: [1440px Before](assets/onedrive-explorer-1287/before-1440.png) / [After](assets/onedrive-explorer-1287/after-1440.png), [640px 한국어 Dark Before](assets/onedrive-explorer-1287/before-640-ko-dark.png) / [After](assets/onedrive-explorer-1287/after-640-ko-dark.png). 같은 활성 상태와 격리된 두 후보를 수정 전·후 코드에서 촬영했다. 당시 기존 FolderTree와 내장 OneDrive 아이콘을 재사용했으며 새 표면·공통 패턴 예외는 없다. 행 정렬·여백·패널 잘림과 한국어 줄바꿈을 확인했다.

장식은 정확한 루트에 제공 플러그인의 manifest 아이콘을 사용하고(같은 루트에 여러 제공자가 있으면 목록의 첫 이미지 제공자), 자식에게 전파하지 않는다. OneDrive 0.1.1은 기존 Microsoft Fluent UI OneDriveLogoIcon 실루엣을 파란색(#0078D4) SVG로 제공한다. MIT 라이선스 고지를 플러그인 소스와 빌드 artifact에 포함하며 Editor 내장 OneDrive 아이콘은 없다. build가 manifest·아이콘·고지를 artifact에 복사하고 digest를 재생성한다.

### 공통 폴더 기여와 아이콘 검증 (#1366)

기존 `http-plugins`의 커뮤니티 fixture가 수동 폴더와 다른 폴더를 알리도록 보완했다. 변경 전 production 빌드는 두 루트 기대에 한 루트만 표시해 실패했고, 변경 후에는 자동 표시·장식 이미지 로드·비활성화 후 수동 폴더 보존을 검사한다. OneDrive 단위 검사는 일반화된 장식 값을 확인한다. 기존 `plugin-jobs`는 해당 플러그인의 탭·사이드바·설정 이미지 연결을 확인하며, 공식 OneDrive 이미지가 추가되어도 다른 플러그인 이미지와 혼동하지 않도록 행 범위를 명시한다. 새 시나리오·subprocess·전수 조합은 추가하지 않았다. 실제 계정 로그인·동기화 검증은 아니다.

수동 전후 비교는 같은 두 격리 후보·활성 상태, Windows 설치형 Chrome의 checkout별 persistent profile, DPR 1·zoom 100%, 900px 높이에서 촬영했다. Before는 `2325f358`의 production 빌드이며 After는 #1366 구현이다. 목록과 이미지 로드를 기다린 뒤 촬영했고 Host 계정은 가렸다. 기존 FolderTree의 아이콘 칸과 설정 plugin-heading, 공통 PluginIcon을 재사용하며 예외는 없다. 1440px 영어 라이트와 640px 한국어 다크에서 세로 중심·여백·잘림·배지 줄바꿈과 파란 아이콘의 식별을 확인했다. 소유자의 최종 시각 승인을 대신하지 않는다.

| 화면 | 변경 전 | 변경 후 |
| --- | --- | --- |
| Explorer 1440px | [Before](assets/folder-plugins-1366/before-explorer-1440.png) | [After](assets/folder-plugins-1366/after-explorer-1440.png) |
| Explorer 640px 한국어 다크 | [Before](assets/folder-plugins-1366/before-explorer-640-ko-dark.png) | [After](assets/folder-plugins-1366/after-explorer-640-ko-dark.png) |
| Settings 1440px | [Before](assets/folder-plugins-1366/before-settings-1440.png) | [After](assets/folder-plugins-1366/after-settings-1440.png) |
| Settings 640px 한국어 다크 | [Before](assets/folder-plugins-1366/before-settings-640-ko-dark.png) | [After](assets/folder-plugins-1366/after-settings-640-ko-dark.png) |

## 검증 경계

SDK 검사는 manifest와 미지원 확장·외부 schema를, Host 검사는 등록 신뢰·disable drain·설정 보존·하위 프로세스 수명·reload 회복과 비서 활동 기록을 소유한다. OneDrive 검사는 주입한 환경·디렉터리·레지스트리로 단일/복수/없음/잔존을 검증하며 실제 계정에 의존하지 않는다. `pnpm browser:test http-plugins`는 격리된 production HTTP Host와 CLI·설정 UI 일치 및 OneDrive 활성화·새로고침 후 복수 폴더 자동 표시, 비활성화 후 목록 제거와 원본 폴더 보존을 확인한다. OneDrive 상태는 격리된 후보로 대체하고 실제 폴더 목록은 HTTP Host로 검증하므로 실제 계정 동기화의 증거는 아니다. 커뮤니티 fixture의 수동 폴더 보존 검사도 유지한다. `--screenshots`는 수동 검토용 1440px·640px 설정·장식 캡처를 tmp/plugin-stage1에 남긴다. 필수 CI는 기존 전체 제품 판정을 유지한다.

1단계 UI는 로컬 Host만 지원한다. 원격 HostExplorer의 폴더 후보·장식 및 원격 Plugins 설정 UI는 이번 범위에 포함하지 않는다. CLI의 명시 대상 Host 계약과 구별한다. 누락된 artifact는 해당 플러그인만 artifact 없음으로 표시하며 다른 등록은 차단하지 않는다. unregister는 신규 요청 차단·진행 상태 조회/기능 작업 drain·dispose 뒤 등록과 일반 설정을 해제하고 artifact 파일은 삭제하지 않는다. 비서 unregister도 승인 질문 없이 실행하고 활동 기록을 남긴다. 상태 조회도 drain에 포함하며 비활성화 후 늦은 조회는 이전 폴더/장식을 반환하지 않는다.

목록 성능(#1348): Host는 실제 디렉터리별 최신 content digest에 manifest·entry 검증과 스키마 컴파일 성공 결과를 캐시한다. digest 변경은 전체 검증을 다시 수행하며 실패 결과는 캐시하지 않는다. 반환값은 복제하여 캐시 오염을 막는다. artifact 변경 판정과 공식 공급 검증은 매번 파일 내용을 해시한다. mtime·크기 기반 digest 캐시는 같은 크기와 timestamp 복원/해상도에 따른 변경 누락 가능성이 있어 사용하지 않는다. 기존 동시 파일 변경과 검증/실행 사이의 경합 한계는 바뀌지 않는다. 관리 응답의 목록은 같은 Host의 화면 구독자에게 전달하여 불필요한 재조회를 없애고, 목록 없는 변경 이벤트는 기존처럼 새로 조회한다.

## Secret 저장과 실행 전달 (로드맵 1c)

입력은 앱 번들 Plugins 설정 Dialog의 password Input과 명시적 저장 버튼만 제공한다. 설정 변경처럼 활성 상태에서도 저장·삭제하고 기존 reload로 적용하며 입력은 전송 직후 비운다. `POST /api/plugins/secrets`는 id/name/value를 받아 configured만 반환하는 사용자 설정 전용 경계다. 비서 도구·공용 관리 schema·CLI에 값 입력/조회 작업을 공급하지 않는다. CLI는 `plugins secret-status <id>`와 `plugins secret-delete <id> <name>`에 명시적 `--host <origin> --json`을 붙인다. receipt에는 값이 없다. 목록은 supported와 선언별 configured를 반환한다. 상태 확인은 암호문 파일의 DPAPI envelope 형식(알고리즘·키/해시 길이·필수 salt/HMAC·비어 있지 않은 block 정렬 암호문과 해시 길이 서명·전체 길이 일치)만 검사하며 복호화하지 않는다. 구조가 맞더라도 서명 진위와 복호화 가능 여부는 목록에서 판정하지 않고 실행/reload 시 확인한다. 실행/reload의 복호화 실패는 Host 수명 동안 해당 암호문의 SHA-256에 묶어 기억하여 목록에 손상으로 표시한다. 파일 교체·삭제 또는 성공적인 복호화는 이 결과를 무효화한다. 아직 복호화하지 않은 정상 형식 암호문의 암호학적 손상은 실행 시점에 판명된다. 읽기/복호화 실패는 해당 선언의 configured=false와 값 없는 일반 오류로 표시하며 다른 선언·플러그인 정보는 유지한다. 설정 UI는 이름과 사용 불가/손상 상태를 남기고, 진행 중이거나 불확실한 K1 작업이 없으면 삭제·재입력할 수 있다. 비Windows는 지원하지 않음으로 표시하고 값 저장/필요 기능 활성화를 거부한다.

Windows PowerShell의 기본 .NET ProtectedData를 통해 DPAPI CurrentUser를 사용한다. 새 Node 네이티브 addon이나 Electron API 의존은 없다. 상수 스크립트 argv에는 값이 없고 JSON stdin/파이프로만 전달한다. 호출마다 프로세스 시작 비용이 있으므로 저장·활성화/reload 시에만 사용하며 목록·상태 확인이나 기능 작업마다 호출하지 않는다. Windows API 실패는 일반 오류로 바꾸고 평문 fallback은 없다. 비대화형 daemon의 실행 OS 계정에서 동작하며 사용자 프로필/DPAPI 접근 실패 시 사용 불가다.

암호문 파일 ACL은 부모 디렉터리에서 상속되며, 별도 ACL은 설정하지 않는다. 암호문은 해당 Host의 plugins 설정 파일 옆 `.secrets` 디렉터리에 플러그인 id·secret id 해시 파일로 원자 교체한다. 이 Host 저장 경로와 id/name을 추가 entropy로 묶으므로 Host 간 자동 동기화/복사는 지원하지 않는다. 현재 연결은 플러그인당 하나다. 여러 연결별 secret은 후속 계약이며 일반 설정에 값을 넣지 않는다. unregister는 artifact 유무와 무관하게 해당 플러그인 저장소를 지운 뒤 등록을 해제한다. 비활성화는 보존한다.

내부 `PluginSecretStore`만 read를 가지며 실행 직전 해당 manifest 선언만 읽어 `activate(context).secrets`의 읽기 전용 map에 전달한다. 이 map은 신뢰·schema 확인 뒤 프로세스를 시작할 때 해당 플러그인에만 activate IPC로 전달한다. argv·환경 변수·등록 설정에는 넣지 않는다. reload는 값을 다시 읽으며, 자식의 context.secrets는 읽기 전용 map이다. required 값이 없으면 실행을 거부한다. 하위 프로세스의 stdout/stderr를 버리고 IPC 오류는 고정 메시지만 반환하여 값이 로그로 흐르지 않게 한다. Host로 나가는 상태·결과는 해당 Host 인스턴스·플러그인의 알려진 문자열 값만 정리하며 객체 키는 보존한다. 마스킹 값은 secret 이름별로 교체하고 삭제·unregister 시 제거한다. Host stdout/stderr는 교체하지 않으며 자식 출력 폐기와 공개 결과 경계로 비노출을 유지한다. 또한 activation/operation 오류 원문은 공개하지 않는다. 신뢰 코드의 직접 파일 쓰기·직접 OS 접근·변형된 값 유출을 막는 sandbox는 아니다.

검증은 주입 저장소로 선언·범위·설정 여부·삭제·unregister·응답 비노출을 검사한다. Windows에서는 임시 디렉터리의 실제 DPAPI 암호문·재시작 조회·삭제를 검사하고 finally로 제거한다. 기존 quality/Windows Desktop unit CI의 전체 검사에 같은 Host 검사가 포함되며, HTTP CI의 양 OS는 production UI/CLI 경계를 검사한다. OS 전역 Credential Manager는 변경하지 않는다.

화면 근거: [1440 이전](assets/plugin-secrets-1075/secrets-before-1440.png) / [이후](assets/plugin-secrets-1075/secrets-1440.png), [640 이전](assets/plugin-secrets-1075/secrets-before-640.png) / [이후](assets/plugin-secrets-1075/secrets-640.png). 동일한 production 설정 Dialog에서 새 secret section만 숨긴 이전 기준과 복원한 이후를 비교한다. 실제 과거 checkout 실행 캡처는 아니다. 값은 합성 fixture이고 저장 뒤 입력이 비워진 상태다.

## Read operation row schema (#1218)

읽기 작업의 선택적 `rowSchema`는 [조회 계약](plugin-screens-v1.md#core-명세와-조회)을 따른다. 이는 일반 읽기 작업의 출력 선언이며 `generatedUi/views` 기여나 SDK folder scope를 개방하지 않는다. Core가 타입·날짜·표시 라벨·secret 제한과 가공을 소유한다.

하위 프로세스 invoke 결과도 공용 `PluginHost.invokeOperation → publicOperationResult`에서 알려진 값 정리(`safePluginValue`)·outputSchema 검증·Core `parseOperationRows`의 타입 검증과 secret 필드 제거를 거친 뒤에만 공개한다. CLI·비서·플러그인 조회는 이 경로를 재사용하며 reload도 이 경계를 바꾸지 않는다. status 결과는 `safePluginValue → statusSchema`를 거친다.

## K1 파일 작업

2026-11-05 로드맵 1(e): `contributes.jobs`에 id/title, 확장자 accept(예: `.txt`), start/status/stop 작업 ID와 `resultKind: native-document` 또는 `resultKind: file`·`resultExtension`(예: `.docling`)을 선언한다. 결과 확장자는 점 하나와 소문자 영숫자로 구성한다. 세 binding은 등록된 operation이어야 하며 start는 write다. 일반 `operation invoke`로 이 binding을 직접 실행할 수 없다. 입력·결과 JSON schema 검사는 기존 기능 호출과 동일하다. SDK `jobRequestSchema`, `jobUpdateSchema`, `JobSnapshot`이 공용 작업의 정의다.

`POST /api/plugins`의 job-start는 plugin/job/requestId(UUID)/root/file과 선택 output을 받는다. file과 output은 대상 Host Root 상대 경로다. Host의 접근 정책과 real-path Root 검사를 모두 통과해야 하며 입력은 accept와 일치하는 실제 파일이어야 한다. Desktop 파일 업로드나 로컬 fallback은 없다. native-document는 새 `.md` 문서로 생성한다. file은 선언 확장자와 output의 확장자(대소문자 정규화)가 일치해야 한다. 모두 기존 파일·입력 원본을 덮어쓰지 않는다. SDK 0.3.0에서 output 생략 시 입력의 마지막 확장자를 결과 확장자로 바꾸고 같은 폴더를 유지한다(`docs/a.pdf` → `docs/a.docling`, `docs/a.docling` → `docs/a.md`). 기존 이름이나 running/uncertain 작업의 예약과 겹치면 이미지 이름과 같은 `-N` 관례로 `a-2.md`, `a-3.md` 순서의 빈 이름을 고른다. Host는 await 전에 이름 선택과 작업 기록을 완료해 같은 배치·진행 중 작업의 이름을 예약한다. 최종 생성은 기존 exclusive create 경로이며 외부 writer의 후발 경합도 덮어쓰지 않고 uncertain으로 남긴다. 명시적 output은 자동 변경하지 않고 충돌 시 거부한다. 화면은 SDK `defaultJobOutput`을 기본값으로 사용하고 CLI는 생략한 output을 Host에 맡긴다. 실제 정해진 Root 상대 경로는 `JobSnapshot.output`으로 접수·목록·상태·CLI에 반환하고 작업 패널의 결과 경로 열에 표시한다. 기존 `result.md` 호환은 제공하지 않는다.

일괄 접수의 파일별 거부는 SDK `JobStartFailure`의 정해진 kind만 반환한다: `result_exists`(명시적 결과 경로 충돌, Root 상대 path 포함), `unsupported_input`, `unavailable`(꺼짐·미실행), `start_failed`(플러그인 접수 실패), `other`. `startFailure`는 Host가 생성하며 플러그인 예외 원문을 포함하지 않는다. 기존 `PluginErrorKind`와 고정 오류 안내는 그대로 유지한다. 접수 전 거부는 파일별 failure, 접수 응답 실패는 `JobSnapshot.startFailure`와 uncertain·동일 ID 조회 안내를 유지한다. 작업 패널은 공통 Info Tooltip에 지역화된 사유와 경로를 표시하고 hover·keyboard focus로 접근한다. CLI의 여러 `--file` 시작도 같은 파일별 결과를 받는다.

Host는 실행 전에 requestId를 메모리에 기록하고 중복 start를 거부한다. running/completed/failed/stopped/uncertain, phase, 선택적 done/total, stopRequested를 유지한다. start handler는 작업을 접수하고 10초 RPC 응답 제한 안에 running을 반환한다. 긴 작업의 완료 Promise를 반환하지 않는다. requestId별 상태를 자식 프로세스에 보관하고 백그라운드 작업의 성공·실패를 status로 공개한다. 백그라운드 Promise의 rejection도 잡아 failed/errorKind로 기록한다. Host는 접수 응답을 기다린 뒤 job-start 결과를 반환하며 접수 실패는 uncertain이다. 작업 수명 자체의 Host 상한은 없다. start가 제한을 넘기면 timeout 분류와 SDK JOB_START_CONTRACT_MESSAGE 고정 제작 안내를 반환하고 자식을 종료한다. running 외 접수 결과는 failed 분류와 같은 제작 안내로 거부한다. status/stop handler는 같은 requestId/root/file/output을 받는다. handler 결과는 state/phase/progress/errorKind와 완료 시 document.source다. Host가 완료 결과의 native source를 Core 기반 공식 생성 경로로 검증·생성한 뒤에만 path/revision을 공개한다. 완료 전 document/source/부분 결과는 UI·CLI로 공개하지 않는다. 결과 문서 생성 실패도 uncertain으로 남겨 확인 없이 다시 쓰지 않는다.

job-status/job-stop/job-result는 같은 requestId만 받는다. stopRequested는 취소 요청이며 stopped와 다르다. 플러그인이 stopped를 확인할 때만 실제 중단으로 표시한다. disable/reload/종료는 신규 접수를 막고 작업에 중단을 요청한 뒤 진행 RPC를 drain하고 dispose·자식 종료를 수행한다. stop/dispose는 플러그인이 소유한 작업과 자원을 정리해야 한다. 중단 응답에서 completed/failed/stopped가 확인되면 유지하고, 미확정 running/uncertain은 unavailable 분류의 uncertain과 같은 ID 조회/no-replay 안내로 남긴다. crash도 즉시 활성 작업을 같은 uncertain으로 표시한다. reload 후 새 프로세스에 작업을 재접수하거나 복원하지 않으며 같은 ID 조회는 Host의 보존된 snapshot을 반환한다. 하위 프로세스 IPC 요청은 앞 절의 10초 제한을 따르며 초과하면 프로세스를 종료하고 관찰을 uncertain으로 남긴다. start/status/stop도 `invokeOperation → publicOperationResult`를 통해 같은 결과 검증·secret 정리를 받는다. K1 상태와 중단·관찰 처리는 plugin-service가 소유한 단일 PluginHost/PluginJobs에 둔다. host-services는 상태를 복제하지 않으며 전체 종료에서 plugin-service.close → PluginHost.close를 호출해 미확정 작업을 같은 uncertain/no-replay로 정리한다. 비서만 종료할 때는 K1 작업을 종료하지 않는다. 메모리 기록은 daemon 수명에 한정된다. 재시작 후 unknown ID는 재실행 근거가 아니다. 영속 queue/DB/scheduler는 없다.

```text
plugins start <pluginId> --input <json-file> --host <origin> --json
plugins status|stop|result <requestId> --host <origin> --json
jobs list [pluginId] --host <origin> --json
```

start 파일은 job/requestId/root/file과 선택 output을 담는다. CLI는 앱과 같은 공용 작업·receipt를 호출하며 결과가 앱 탭을 생성하지 않는다. 응답 유실 뒤 start를 재전송하지 않고 status로 같은 ID를 조회한다.

명령 센터의 Plugin jobs는 현재 문서/작업 탭 Host에 고정된 앱 번들 기본 UI다. 공통 Button/Input/Notice, 기존 뷰 페이지 레이아웃과 Host 폴더 목록을 재사용한다. 열린 대상 Host 폴더 안에서 파일을 선택하고 실행·상태·중단·완료 문서 열기를 제공한다. 결과 열기는 기존 Host-aware 문서 열기와 미저장 보호를 따른다. requestId는 내부에서 생성·관리하며 입력란으로 노출하지 않는다. Host의 `job-list`는 플러그인별 진행 중·최근 작업과 경과 시간을 daemon 메모리에서 반환한다. 작업 화면을 다시 열면 이 목록으로 진행 중 작업을 복원해 관찰하고 최근 작업을 선택할 수 있다. 브라우저 자체 요청 ID 저장소나 재입력에 의존하지 않는다. 활성 작업 화면에서만 1초 간격으로 겹치지 않게 조회하고, 숨김/탭 닫기 시 타이머와 요청을 정리한다. 화면 닫기는 실행 취소가 아니다. 연결/응답 상실은 uncertain으로 표시하며 폴링을 멈춘다. uncertain일 때만 상태 다시 확인 버튼을 보여 내부의 같은 ID로 조회한다. Host의 명확한 4xx 실행 거부는 실패와 이유를 표시하고 입력 수정을 허용한다. 연결 실패·5xx·응답 유실과 구분한다. 저장된 데이터 뷰의 자동 조회 금지 계약은 그대로다.

검증 fixture는 `apps/editor/test/fixtures/job-plugin`이다. 텍스트 파일을 세 단계 처리하고 native source를 Host에 돌려준다. FAIL/UNCERTAIN으로 시작하는 입력은 각각 실패/불확실을 재현한다. 중단 요청은 먼저 접수되고 다음 상태 조회에서 실제 stopped가 확인된다. 실제 Docling 변환·품질 증거는 아니다. 실제 11초 작업의 완료·실패·중단·reload/disable·crash 및 긴 start Promise 거부는 기본 CI의 plugin-jobs.test.ts에서 검증한다. Host 수명·중복·출력 공개·Root 경계는 `plugin-jobs.test.ts`, HTTP CLI/UI 연결·결과 열기·Stop은 `pnpm browser:test plugin-jobs`가 소유한다. 수동 캡처는 `pnpm browser:test plugin-jobs --screenshots`의 `tmp/plugin-jobs/completed-1440.png`, `completed-640.png`에 남긴다.

K1 기본 UI는 `SettingsSelect`/`SettingsInput`의 라벨·control 높이·간격과 `HostStatus`의 점·톤을 재사용한다. 상태를 지역화해 한 번만 표시하고 진행 중 phase와 경과 시간을 옆에 둔다. 취소 버튼은 실행 중에만, 접수 뒤에는 취소 요청됨, 실제 stopped 뒤에는 취소됨으로 구분한다. 상위 폴더 복귀는 하위 폴더를 탐색한 경우에만 명확한 라벨로 보인다. 공용 `components/ui/Progress`는 ARIA progressbar와 제품 surface/accent·간격 토큰을 쓰며 기본 브라우저 progress를 사용하지 않는다. 숫자 진행량과 결과 열기는 별도 간격·행으로 분리한다.

Codex 비서는 SDK `PLUGIN_JOBS` 공용 정의를 그대로 쓰는 `plugin_jobs` 도구로 start/status/stop/result/list를 호출한다. 건별 확인은 없고 기존 turn 활동 목록에 작업·성공/실패·결과를 남긴다. start/stop은 기존 대화의 쓰기 모드·열린 폴더 범위를 지키며 secret이나 공식 목록 변경 권한은 추가하지 않는다. 실제 모델 호출 없이 app-server fixture로 도구 노출·승인 없음·활동 기록을 검증한다. Copilot의 별도 dynamic-tool 공급은 이 단계에서 추가하지 않는다. `plugin-jobs.test.ts`는 Editor 기본 test 명령에 포함하며 동시 동일 ID/별도 ID 시작, 완료와 Stop 경합, daemon 재시작 뒤 unknown/no replay를 보호한다.

입력 선택은 `(Root, 상대 경로)` 쌍이다. 파일·폴더 선택은 해당 Host가 반환한 자식 이름으로 상대 경로를 구성하며 절대 경로 문자열을 잘라 재해석하지 않는다. Root 선택이나 최근 작업 이동으로 Root가 바뀌면 파일·탐색 폴더·이전 목록을 초기화하며, 새 Root에서 명시적으로 다시 선택하기 전에는 실행하지 않는다. 같은 이름의 파일이 다른 Root에 존재해도 자동 재바인딩하지 않는다.


### 일반 파일 하나 (#1326)

파일 형식의 생성·해석은 플러그인 소유다. Host는 start 전에 OS 임시 폴더의 고유 디렉터리와 파일을 만들고 SDK `JobInput.resultFile:{path,maxBytes}`를 세 handler에 전달한다. 플러그인은 이 path에만 결과 바이트를 쓰고 writer를 닫은 뒤 `completed`와 `file:{path:input.resultFile.path}`를 반환한다. document/review 동시 반환, 다른 path와 비정규 파일은 거부한다. 대용량 바이트·base64를 IPC에 넣지 않는다. staging은 공식 Root 쓰기 권한이 아니며 output에 직접 쓰는 것도 허용하지 않는다. trusted Node child가 sandbox가 아니라는 기존 경계는 유지한다.

Host는 `packages/file-commit`의 `createFileFromPath`로 staging을 크기가 제한된 stream으로 Host 전용 결과 sibling에 복사하고 SHA-256을 계산한다. flush 후 기존 createFile과 같은 hard-link 방식으로 새 이름을 원자적으로 게시한다. 기존 이름은 경합 중 생겨도 교체하지 않으며 hard-link 미지원 파일시스템은 실패한다. staging inode를 직접 게시하지 않아 플러그인의 뒤늦은 쓰기가 결과를 바꾸지 못한다. 게시 직전에 요청 Root·Host 접근 정책과 실제 target을 재확인한다. 결과는 `result:{kind:"file",path,revision}`이며 revision은 저장 바이트의 SHA-256이다. 기존 native-document result 모양과 대조 자료 계약은 유지한다.

상한 `JOB_FILE_MAX_BYTES`는 **2 GiB (2,147,483,648 bytes)**다. 페이지당 수 MiB인 수백 장의 이미지 zip을 수용하면서 단일 결과의 무제한 증가를 막는 초기 한도이며 실제 Docling 크기 측정치는 아니다. metadata 사전 검사와 복사 중 byte counter가 모두 한도를 강제한다. 작업 중 디스크 사용량 quota는 아니며 초과 staging은 완료 시 거부·정리한다. OS 임시 폴더를 택해 Root 부모 쓰기 권한을 요구하지 않고 선택 Root가 볼륨 루트여도 동작한다. 다른 볼륨이어도 복사 목적 sibling은 Root와 같은 파일시스템이므로 최종 게시는 원자적이다. peak 임시 공간은 staging + sibling이며 IPC/메모리에 결과 전체를 적재하지 않는다.

완료·실패·stopped·uncertain·RPC 오류·프로세스 상실에서 Host가 staging을 제거한다. 복사·flush·검증·게시 실패도 sibling을 제거하고 기존 uncertain/no-replay를 유지한다. 불확실해져 정리된 file 작업은 나중 completed 응답으로 게시하지 않는다. 같은 ID 관찰·중단은 유지하되 자동 재시작·복원은 없다. 같은 requestId 관찰은 순서대로 처리해 비동기 복사 중 status/stop이 중복 게시하지 않는다. Host 프로세스의 강제 종료·전원 상실 뒤 임시 파일 scavenging은 제공하지 않는다(기존 file-commit crash 경계).

화면은 기존 작업 탭·SettingsInput/SettingsSelect·Button/Notice를 재사용한다. file 완료는 저장된 Host 경로와 기존 `CopyButton`을 제공하며 형식을 해석하거나 문서 열기로 보내지 않는다. native-document의 결과 문서 열기는 유지한다. 새 표면 구조·공통 상호작용 예외는 없다. CopyButton은 기존 비서 답변·코드 복사와 같은 구현이다.

대표 검증은 기존 외부 SDK K1 subprocess 안에서 native 생성 회귀와 file 성공·동명 보존·확장자/Root 거부·실패/중단/불확실/프로세스 상실 정리·중복 관찰을 확인한다. 상한의 Host 연결은 초과 metadata로 검사하고 실제 작은 byte 한도·성장 중 초과·복사 snapshot 독립성·게시 실패 정리는 file-commit 단위 검사가 소유한다. 기존 plugin-jobs browser fixture를 보완해 HTTP·실제 CLI·화면의 같은 기본 이름과 파일 결과 경로를 확인한다. 특정 포맷 생성·대규모 실제 변환 품질·zip 내부 대조는 검증 범위 밖이다.

수동 시각 검토: [1440 이전](assets/k1-file-result/before-1440.png) / [이후](assets/k1-file-result/after-1440.png), [한국어 다크 1440 이전](assets/k1-file-result/before-ko-dark-1440.png) / [이후](assets/k1-file-result/after-ko-dark-1440.png), [한국어 다크 640 이전](assets/k1-file-result/before-ko-dark-640.png) / [이후](assets/k1-file-result/after-ko-dark-640.png). 같은 Host의 같은 완료 file snapshot에 대해 이전은 이 PR 직전 `PluginJobs.tsx`만 사용한 UI, 이후는 이 PR의 UI다. 이전 UI는 파일에도 문서 열기를 표시했고 이후는 저장 경로·복사를 제공한다. 새 파일 결과는 이전 master Host가 만들 수 없어 Host·SDK는 두 캡처 모두 이 PR 구현을 사용했다. 정렬·여백·긴 경로 줄바꿈·잘림·한국어 640px·다크를 확인했다. 로컬 계정 표기만 촬영 중 DOM text에서 치환하고 즉시 복원했다. [촬영 스크립트](assets/k1-file-result/capture.browser.js)는 성공한 plugin-jobs Host를 유지한 채 기존 `ui-gallery.browser.js`를 임시 백업·대체하여 `LITZIO_BROWSER_URL=<대상 origin> pnpm browser:test ui-gallery --screenshots`로 실행한 뒤 원본을 복원한다. CI 자동 판정에는 포함하지 않는다.

## Host 제공 SDK 런타임 (#1271)

`@litzio/plugin-sdk`는 npm 게시·tarball 배포하지 않는다. Host가 실행 시점에 제공하며 플러그인 단독 실행은 지원하지 않는다. SDK 버전은 Host에 묶인다. 자식은 실제 로드한 SDK_VERSION과 Host SDK_VERSION의 일치를 확인하며 대체 SDK를 사용하지 않는다. manifest 호환성은 아래의 지원 계약 판정으로 validate·등록·활성화에서 동일하게 검사한다.

### SDK 버전과 호환 판정

SDK `0.3.0`은 Litzio `v0.0.2-beta.9`와 함께 공개했다([준비 기록](../releases/v0.0.2-beta.9.md)). 다음 미릴리스 SDK는 `0.4.0`이다. SDK는 별도 npm 패키지 게시 없이 해당 Host가 제공한다.

공개 SDK 기능의 버전은 공개 릴리스 사이에 한 번만 올린다. 릴리스 뒤 첫 SDK 기능 PR이 다음 minor를 열고, 다음 공개 릴리스 전까지 들어오는 기능은 모두 그 번호를 함께 쓴다. `SDK_VERSION`과 `packages/plugin-sdk/package.json`을 일치시키며 기능별 최소 SDK 요구 검사는 각 기능에 유지한다. 버그 수정은 patch다. 호환되지 않는 변경의 표시 방법은 실제로 그런 변경이 필요할 때 정한다. 현재 Host는 이전 계약을 계속 지원하되 #1396의 title 없는 secret manifest 호환은 제공하지 않는다.

`requiresSdk`는 필요한 기능이 처음 제공된 계약 버전 이상의 범위를 선언한다. 현재 권장 표기는 `>=최소기능버전 <1.0.0`이다. 새 scaffold의 기본은 `>=0.4.0 <1.0.0`이며 일반 파일 결과를 쓰는 플러그인도 최소 `0.2.0`을 요구한다. Host는 file 기여가 있으면 해당 기능을 제공하는 지원 계약(`0.2.0` 이상)도 requiresSdk가 허용하는지 검사한다. 현재 `0.1.0` 또는 `^0.1.0`만 허용하는 file manifest는 SDK 요구 오류로 validate·등록·활성화에서 거부한다. 기존 native-document 등 이전 기능만 쓰는 exact·caret `0.1.0` 선언은 계속 허용한다. 기존 기능만 쓰는 플러그인은 해당 기능의 최소 계약 버전을 유지할 수 있다(예: `>=0.1.0 <1.0.0`).

공통 호환 검사는 Host가 현재 구현하는 실제 계약 버전 목록 중 하나가 `requiresSdk` SemVer 범위를 만족하는지 확인한다. 선언한 기능별 최소 계약 검사도 함께 통과해야 한다. `0.3.0` Host의 목록은 `0.1.0`, `0.2.0`, `0.3.0`이다. 따라서 이전 scaffold의 정확한 `0.1.0`, 기존 `^0.1.0` 선언도 수정 없이 계속 로드된다. 추가 릴리스에서는 구현을 유지하는 이전 계약을 목록에 남긴다. 아직 제공하지 않은 `0.5.0`이나 가상의 `0.1.1`을 범위 보간으로 지원한다고 간주하지 않는다. 일반 파일 결과 등 새 기능으로 전환하는 플러그인은 해당 작업에서 최소 요구를 올린다.

개발 실행은 최초 활성화 때 공개 SDK entry를 메모리 JS 번들로 빌드해 Host 수명 동안 재사용한다. 개발·배포 모두 같은 entry를 코드 분할 없이 자기완결 JS 모듈 하나로 번들한다. 배포 빌드는 `plugin-sdk.mjs`로 CLI에 포함하고 Desktop의 `build/cli`에도 복사한다. Node 공식 `registerHooks`가 플러그인 코드 로드 전에 SDK root import를 이 런타임으로 연결한다. 저장소 밖·다른 드라이브도 file URL 또는 메모리 URL을 사용하므로 artifact 위치에 의존하지 않는다. artifact의 node_modules에 다른 SDK가 있어도 Host 제공본이 항상 우선한다. `@litzio/core` 등 다른 내부 패키지와 SDK subpath import는 거부하며 필요한 공개 API는 SDK root가 재노출한다. resolve 훅은 이름 검사 뒤 Node가 해석한 file URL을 OS 경로로 변환하고 절대 경로·realpath로 정규화한다. Windows에서는 대소문자를 통일하고 path.relative의 디렉터리 경계·다른 드라이브 판정을 사용한다. 상대 경로·file URL·symlink/junction 별칭으로 접근해도 개발 Host의 checkout 또는 배포 Host의 설치 번들 디렉터리 안이면 거부한다(Desktop은 resources 디렉터리). Host 제공 단일 SDK 런타임 파일 자체만 예외다. SDK는 Node 내장 모듈 외의 런타임 import나 공유 chunk가 없다. 부모 URL은 createRequire 등으로 호출자가 지정할 수 있으므로 내부 접근의 신뢰 근거로 사용하지 않는다. SDK URL을 부모로 지정한 createRequire.resolve/require도 같은 실제 경로 검사를 받는다. artifact 자체 실제 디렉터리 안의 모듈은 checkout 안에서 제작한 경우에도 허용한다. Node 내장 모듈과 Host 내부를 가리키지 않는 artifact 자체 node_modules도 허용한다. artifact 안의 symlink는 기존 등록 검사에서 계속 거부한다. 정적 validate는 import graph를 실행하지 않으므로 이 경계의 판정은 활성화와 실제 import 시점에 수행한다. 일반 제3자 의존성은 기존처럼 artifact에 번들할 수 있다. 플러그인은 ADR-0020의 신뢰 코드이며 이 차단은 실수로 내부 API에 의존하는 것을 막는 계약 강제이지 sandbox나 보안 경계가 아니다. fs로 파일을 직접 읽어 eval하는 의도적 우회는 범위 밖이다.

scaffold는 SDK_VERSION과 PluginOperationError import 예시, context용 JSDoc, 외부 편집기의 starter 타입 힌트 `plugin-sdk.d.ts`와 `jsconfig.json`을 포함한다. 선언 파일은 예시용 공개 API 부분집합이며 런타임 사본이 아니다. SDK 자체는 설치·번들하지 않는다. 새 scaffold의 requiresSdk 기본값은 위 SDK 버전 규칙을 따른다.

`pnpm editor`의 Vite SSR도 같은 개발 SDK 공급 경로를 사용한다. checkout tooling의 동적 import는 Node 런타임에서 실행하며 Vite 분석 대상에서 명시적으로 제외한다. `vite-plugins.test.ts`는 실제 Vite 설정의 HTTP Host에서 저장소 밖 artifact의 SDK import·활성화·상태 반환과 분석 경고 부재를 검사한다. `pnpm browser:test vite-plugins`는 Vite에서 없는 경로·잘못된 artifact의 오류 표시와 정상 OneDrive 등록 후 비활성 목록 표시·활성화를 확인한다. 이 검사는 OneDrive artifact를 먼저 빌드하며 SDK 외부 import 검사는 별도의 임시 artifact로 수행한다.

개발 Host의 외부 임시 artifact 수명 테스트는 로컬 SDK보다 Host 제공본 우선, 비호환 manifest 거부, 내부 import 거부와 reload를 검증한다. CLI offline packaged 검사와 Windows Desktop packaged 검사는 외부 scaffold→validate→등록→trust→enable→invoke를 실행한다. 이는 SDK 공급 경계 fixture이며 Jira·Docling 실제 서비스 수락 완료가 아니다.

## 비서 제작 키트

`scaffold`는 대상 Host의 새 디렉터리에 manifest·package.json·ESM host.js와 편집기 타입 힌트를 생성한다. `directory` 생략 시 `hostPaths().plugins`(templates와 같은 사용자 데이터 base의 `plugins/`) 아래 플러그인 ID를 이름으로 새 폴더를 만든다. 필요한 기본 부모 폴더는 scaffold 쓰기 시점에만 Host가 준비하며 이름이 이미 있으면 빈 폴더도 거부하고 덮어쓰지 않는다. 원격 Host는 그 Host의 데이터 위치를 쓰며 개발 실행의 `.litzio-dev`와 `LITZIO_DATA_DIR`도 기존 hostPaths 규칙을 따른다. 문서 폴더의 기존 artifact를 옮기지는 않는다.

비서의 `opened-folders` turn은 이 기본 plugins 폴더를 추가 쓰기 위치로 받아 열린 문서 폴더 없이도 기본 scaffold·파일 수정·validate·등록·신뢰·활성·호출을 이어 갈 수 있다. Host는 plugins 폴더의 링크·정션을 거부하고, 사용자 데이터 폴더와 plugins 폴더의 실제 경로를 대조한 뒤 앱 소유 RootAccess 경계를 별도로 고정한다. 생성 대상도 같은 실제 경로 경계로 검사하며, 기본 scaffold와 이 폴더의 validate는 문서 Host Root 밖에서도 허용한다. sandbox에는 실제 경로로 확인한 plugins 경로만 넣고, 아직 없으면 기존 조상의 실제 경로 아래 새 경로만 계산한다. turn 준비·validate는 데이터 폴더나 plugins 폴더를 만들지 않는다. 문서 도구의 opened folders 범위는 넓히지 않는다. read-only turn의 scaffold와 파일 수정은 계속 거부한다. full-access sandbox와 scaffold의 기존 Root/열린 폴더 제약은 바꾸지 않는다. `directory`를 명시하면 기존 Host RootAccess의 새 경로 검사와 비서 turn의 열린 폴더 검사를 모두 적용한다. 명시 경로의 부모는 존재해야 하며 기존 디렉터리는 덮어쓰지 않는다.

선택적 `template: greet | query | file`은 생략 시 greet다. CLI `plugins scaffold [directory] --id <id> [--template greet|query|file]`와 비서 `manage_plugins`가 같은 공용 작업을 사용하고 결과의 `directory`로 실제 생성 위치를 반환한다. CLI도 경로를 생략하면 대상 Host가 기본 위치를 선택한다. greet는 화면 없는 간단한 작업 하나로 충분할 때 쓴다. query는 연결 설정·확인, 표시 이름을 가진 선택적 비밀키, 기본/추가 조건과 결과 표를 제공한다. 외부 서비스 없이 예제 데이터로 실행하며 연결 값이 없으면 고정 안내를 준다. file은 `.txt` 대문자 변환과 `.upper` 파일 결과, 시작·상태·중단, 파일별 진행을 기존 K1으로 제공한다. 두 템플릿의 주석은 데이터/변환 교체 지점을 알린다. `settingsSchema.required`는 사용하지 않고 화면 배치는 기존 공통 화면에 맡긴다. 새 화면 종류 선언이나 workflow engine은 없다. 대상 Host SDK_VERSION 요구, 패키지/manifest 버전 일치와 community 계층을 사용하며 자동 등록·신뢰·실행은 하지 않는다.

`validate`는 artifact 경계·manifest/SDK 범위·버전·JSON Schema 컴파일과 entry 구문, 선언 작업과 literal handler 일치를 검사한다. 결과는 `valid`, 원문 없는 `errors`(고정 파일 역할, 1-based 줄/열 또는 위치 불명 null, 고정 오류 종류), 검사 한계와 Host receipt다. 실패는 failure receipt와 CLI 종료 코드 1로 반환한다. 코드를 import/실행하지 않으며 등록 상태도 바꾸지 않는다. JSON/JavaScript/schema/parser/fs 예외 원문·stack·파일 내용·사용자 정의 handler 이름을 진단에 복사하지 않는다. 같은 정리된 결과를 비서 도구와 CLI가 반환하고, 활동에는 결과 요약만 남긴다. 정적 검사를 위해 entry는 named `export function activate`의 직접 return 객체 안에 하나의 literal `operations` 객체와 literal 함수 handler를 둔다. 동적 등록은 검증 불가 오류다. 정적으로 알려진 JSON 반환값은 출력 schema와 비교하지만, 계산된 반환값·activation·dispose 동작은 실제 enable/invoke/reload에서만 검증된다. validate 통과는 실행 성공의 보증이 아니다.

`manage_plugins`도 scaffold/validate를 같은 정의로 호출한다. register 활동에는 인자로 받지 않는 실제 manifest ID를 결과에서 가져와 남긴다. validation 오류는 결과에서 읽되 활동 요약에는 원문을 쓰지 않는다. Codex의 각 대화 turn에 앱 번들의 제한된 제작 스킬을 문맥으로 제공한다(전역 Codex 스킬 설치 없음). 스킬은 SDK·manifest·공용 작업/schema 예시, 파일 수정 권한·secret 비노출, validate/register/trust/enable/invoke 및 수정 후 validate/reload/invoke 절차와 금지 항목을 설명한다. master에 병합된 secret 선언과 사용자 설정 UI 입력·읽기 전용 context.secrets, 읽기 작업 rowSchema, K1 jobs 바인딩·상태·결과 열기를 안내한다. generatedUi/views/dataViews/secretUses 확장은 계속 예시로 제공하지 않는다. Copilot 도구 공급 범위는 그대로다.

자동 검사는 기존 Host 플러그인 테스트에서 문서 Root 밖 기본 위치·열린 폴더 없는 opened-folders turn의 생성→정적 검증→등록→신뢰→활성→호출→수정→재검증→신뢰→reload→결과 변경을 같은 Host로 확인한다. 이 subprocess 사례는 실제 캐시 교체·daemon 무재시작을 보호한다. handler 누락·미선언 handler·잘못된 schema·literal 출력 불일치와 비실행·기본 이름 충돌·읽기 전용 거부·명시 경로의 기존 권한 검사도 확인한다. Windows 정션의 초기 plugins 경계/생성 대상 이탈 거부와 읽기 전용 validate의 폴더 비생성도 보호한다. provider fixture는 열린 폴더가 없을 때 plugins 폴더만 추가되고 정션이면 turn/start 전에 거부하는 sandbox 요청을, CLI fixture는 경로를 생략해 Host에 전달하는 입력을 검증한다. 실제 AI 제작·원격 통신·설치형 앱 실행의 완료 근거는 아니다.

### 제작 템플릿 실행 확인 (#1397)

2026-11-10 실제 제품 비서(Codex gpt-6-luna, low)에 외부 서비스 없는 조회·파일 처리 제작을 각각 맡겼다. 첫 조회 결과는 설정/비밀키를 제거했고 첫 파일 결과는 manifest 필수 선언을 누락하여 validate에 실패했다. 선언을 보존하도록 후속 요청했고, 파일 실행에서 비서가 추가한 exclusive-create 쓰기가 이미 존재하는 Host staging 파일에 실패하여 추가로 수정 요청했다. 비서가 직접 복구했으며 검증자가 artifact나 화면을 수동 수정하지 않았다. 이 관측을 번들 제작 안내의 선언 보존·staging 쓰기 설명에 반영했다. 첫 시도만으로 제작 성공한 증거로 해석하지 않는다.

복구 결과는 두 artifact 모두 validate·등록·신뢰·활성화 후 실제 HTTP Host에서 조회/변환을 실행했다. query는 기본/추가 조건·표·선택적 연결 설정/비밀키와 healthCheck, file은 `.txt`→`.upper`·K1 세 작업·파일별 진행/결과를 유지했다. 임시 browser scenario를 기존 `pnpm browser:test` runner와 persistent Chrome으로 실행하고 원래 scenario 파일은 복원했다. [조회 1440px](assets/plugin-templates-1397/query-1440.png) / [한국어 다크 640px](assets/plugin-templates-1397/query-640.png), [파일 1440px](assets/plugin-templates-1397/file-1440.png) / [한국어 다크 640px](assets/plugin-templates-1397/file-640.png)에서 상단 입력·전체 폭 결과·정렬·줄바꿈·표 내부 스크롤을 확인했다. 기존 공통 QueryInputs·DataTable·PluginJobPanel을 사용하며 새 UI 예외는 없다. 계정·Root 선택은 mask했다. 외부 서비스·배포·secret 저장·소유자 시각 승인은 이 실행으로 검증하지 않았다. 상세 요청과 최초 실패·후속 결과는 PR에 기록한다.


### 기준 모델 재검증 (#1421)

2026-11-10 소유자 결정으로 비서 플러그인 제작 검증은 Codex `gpt-6.1-terra`, 추론 강도 `high`를 기준으로 한다. 다른 실제 AI 응답 확인은 AGENTS.md의 `gpt-6-luna`/`low` 기본값을 유지한다.

격리된 Host·데이터 폴더와 열린 폴더 권한에서 실제 제품 `AssistantConversations`·번들 제작 안내·`manage_plugins`로 조회와 파일 처리를 각각 한 번 실행했다. 요청은 [PR #1418](https://github.com/litzio/litzio/pull/1418)의 문장을 그대로 사용하고 새 artifact 경로만 바꿨다. 외부 서비스·자격 증명은 사용하지 않았다. HTTP origin을 비서에게 제공하지 않았으므로 비서는 실제 조회·변환을 미확인으로 보고했고, 검증자가 같은 생성 artifact를 격리 HTTP Host에 올려 공통 화면에서 직접 실행했다.

| 항목 | Luna low (#1418) | Terra high (#1421) |
| --- | --- | --- |
| 조회 첫 요청 | validate·등록·신뢰·활성 성공, 설정/비밀키 제거 | validate·등록·신뢰·활성 성공, 선언 보존 |
| 파일 첫 요청 | scope/screens/K1 입력 누락으로 validate 실패 | validate·등록·신뢰·활성 성공, 선언 보존 |
| 후속 요청 | 조회 1회, 파일 2회(선언 복구·staging 쓰기 수정) | 조회 0회, 파일 0회 |
| 공통 화면 실행 | 후속 복구 뒤 조회 3행·파일 완료 | 첫 요청 산출물 그대로 조회 2행·파일 완료 |
| 사람이 artifact/화면 수정 | 없음 | 없음 |

Terra의 두 결과는 SDK 정규화 후 템플릿과 contributes가 동일했다. 조회의 선택적 workspace 설정·제목을 가진 token 비밀키·healthCheck·views/screens, 파일의 host scope·start/status/stop 전체 K1 입력(output/resultFile 포함)·jobs/screens를 보존했다. 두 host.js도 현재 템플릿과 byte 단위로 같았고, 파일 manifest의 표시 이름만 비서가 바꿨다. 두 validate 결과는 `valid:true`, `errors:[]`였으며 등록·신뢰·활성·실행 중 상태를 확인했다. 두 turn에서 각각 PowerShell 읽기 도구 한 번이 failed로 관측되었으나 각각 같은 turn에서 node_repl로 읽고 완료했다. 실패 원인은 확정하지 않았다. 사용자 후속 요청이나 artifact 복구는 없었다.

`pnpm browser:test plugin-columns --screenshots`의 임시 시나리오로 persistent Chrome과 OS 할당 포트의 실제 HTTP Host를 사용했다(1개 통과, 약 10초). 시나리오는 실행 후 복원했고 커밋하지 않았다. 공통 QueryInputs·DataTable에서 예제 두 행, PluginJobPanel에서 완료·진행 1/1·example.upper 결과를 확인했다. 저장 결과는 `HELLO EXAMPLE`과 줄바꿈이며 원본 `Hello example`과 줄바꿈은 보존됐다. 1440px English/light [조회](assets/plugin-authoring-1421/query-1440.png)와 [파일](assets/plugin-authoring-1421/file-1440.png)의 입력·표 정렬, 여백, 잘림을 직접 검토했다. 계정·Root 선택은 mask했다. 기존 공통 화면을 그대로 사용하며 새 UI 예외는 없다.

이는 모델별 한 번씩의 관측이며 모델 우열의 통제 실험이 아니다. Terra에는 #1418 실패 이후 선언 보존·staging 쓰기가 보강된 현재 번들 안내가 제공됐다. 새 안내 보완이나 재시험은 필요하지 않았다. secret 저장·실제 외부 연결·대용량 처리·다른 OS·패키지 Desktop과 소유자의 직접 시각 승인은 미검증이다. 요청 원문·대화·harness·manifest 비교는 로컬 임시 근거로 보관하며 로컬 식별자가 있는 원문과 재생성 가능한 대형 근거는 커밋하지 않는다.

## 작업 실패 공개 분류 (#1233)

SDK `PluginOperationError(kind)` 또는 같은 `kind` 속성의 예외로 `auth`(인증 확인), `forbidden`(권한 문의), `not_found`(주소·ID 확인), `unavailable`(나중에 재시도), `timeout`(연결 확인), `failed`(설정·대상 확인)를 전달한다. HTTP 상태 매핑은 플러그인이 담당한다. 알 수 없는 kind, 일반 예외와 출력 검증 실패는 `failed`다. 하위 프로세스 제한 시간 초과는 `timeout`, 그 외 프로세스 실패는 `failed`다.

Host의 `publicOperationError`는 `errorKind`와 SDK의 고정 `PLUGIN_ERROR_MESSAGES`만 공개한다. 예외 원문·stack·응답 본문·임의 안내는 IPC와 공개 결과에 전달하지 않는다. 읽기 실패 receipt는 failure, 쓰기는 uncertain이며 쓰기에만 대상 확인 후 쓰기 재시도 안내를 덧붙인다. CLI·비서 도구는 동일 결과를 반환하고, 현재 뷰 새로고침 오류는 `[errorKind]`와 같은 고정 문구를 표시한다. 기존 Notice를 재사용하며 새 카탈로그 요소는 만들지 않는다.

K1 반환형 실패도 같은 공개 오류 경계를 따른다. handler는 오류 문자열 대신 `errorKind`만 지정하며 알 수 없거나 누락된 분류는 `failed`다. `failed`·`uncertain`의 phase와 오류 안내는 Host 고정값이며 plugin phase·예외 원문을 복사하지 않는다. 기존 `error` 필드는 허용하지 않으며 잘못된 결과는 고정 `failed` 안내의 uncertain으로 남긴다. job-status·job-list·화면·비서가 같은 정규화된 snapshot을 받는다.

K1 호출은 등록 시 manifest의 start/status/stop read·write 효과를 기록하고 오류 정규화에도 유지한다. 쓰기 실패에는 고정 대상 확인 안내와 `Query the same requestId; do not resend start.`를 함께 붙인다. 쓰기 결과가 uncertain인 동안 후속 읽기 조회도 실패하거나 uncertain을 반환하면 이 안전 안내를 유지한다. 원문·stack은 복사하지 않는다.

## V4 공용 review Host·CLI

K1 완료의 선택 `jobUpdate.review`는 SDK `completedReviewSchema`를 따른다. review, bundle(generation/documentRevision/documentHash/sourceRevision와 선택 mappingRevision), pages, 선택 mapping, images(ref/Root 상대 path/SHA-256 revision)를 전달한다. sourceRevision은 K1 입력 파일 SHA-256, documentRevision/hash는 Core canonical 출력 revision이다. Host는 문서 생성 후 모든 자료를 검증하고 `result.bundle`에 Host 발급 bundleRef/documentRef를 공개한다. Root·generation·revision·이미지 검증 실패 시 bundle은 공개하지 않으며 이미 생성된 결과 문서를 보존하고 uncertain으로 남긴다. 완료 전 자료는 공개하지 않는다.

`POST /api/reviews`는 PluginHost 소유 dispatcher다. 입력은 action(read/propose/approve/reject/undo/status), plugin/review/root/bundleRef/generation이다. read는 kind(bundle/document/page/mapping/proposals/image)와 pageNo를 선택하고 data/baseline/state/receipt를 반환한다. 문서는 bundle의 canonical source snapshot이며 stale 자료를 현재 파일처럼 반환하지 않는다. image는 검증한 PNG의 mime/base64 data/width/height다. image kind는 PNG만 지원하며 다른 이미지 형식은 거부한다. PDF 원본은 아래 SDK 0.4.0의 별도 pdf 자료를 사용한다. Core REVIEW_LIMITS의 JSON·목록·영역·이미지 byte/pixel 상한을 적용하고 초과나 미지원 continuation은 자르지 않고 거부한다. 자료 참조에 임의 파일 경로·URL을 받지 않는다.

변경에는 requestId(UUID), baseline과 선택 proposalId/input을 더한다. baseline은 문서·제안 revision과 원본/map revision이다. Host는 plugin 실행 전과 commit 직전에 문서·원본·이미지를 재검사하고 bundle별 동시 변경을 거부한다. binding ID/version·가용성·artifact 신뢰를 매번 확인하며 일반 operation invoke로 review binding을 호출할 수 없다. propose 결과는 Core ReviewProposal의 pending만 허용하고 target snapshot·baseline을 검사하며 기여의 action 제한을 유지한다. reject는 문서를 바꾸지 않는다.

현재 공용 적용 결과는 `{kind:"text",path,from,to}`다. Host가 proposal target과 일치하는 Core snapshot path에 기존 `updateNodeTextAtPath`를 호출하고 canonical serialize 후 file-commit의 revision 보호·temporary sibling·rename으로 저장한다. 임의 source·파일 쓰기 요청은 받지 않는다. Undo는 Host가 보관한 역연산을 같은 Core operation으로 수행하고 승인 전 canonical source와 정확히 일치할 때만 commit한다. 빈 문자열 역연산·지원하지 않는 변경 종류는 거부한다. 승인/Undo 뒤 다른 제안은 stale, 이전 map은 unavailable이며 새 baseline/changedDocumentRefs/proposals/receipt를 반환한다. Docling 저장·재처리 방식은 정하지 않는다.

requestId는 plugin 호출 전에 기록한다. 관찰 유실은 고정 오류 안내와 uncertain이며 같은 ID 변경은 재실행하지 않고 status로 결과만 확인한다. daemon 재시작 뒤 확인할 수 없는 결과는 unknown이며 실행 허가가 아니다. bundle·제안·Undo·요청 관찰은 PluginHost/daemon 수명 소유다. 다른 Host/Root/generation으로 재바인딩하지 않는다. 비서에 approve/undo 전용 도구를 추가하지 않는다.

```text
review <read|propose|approve|reject|undo|status> <pluginId> <reviewId> --input <json-file> --root <root> --host <origin> --json
```

CLI는 같은 dispatcher를 호출한다. JSON은 bundleRef/generation과 동작별 kind/pageNo 또는 requestId/baseline/proposalId/input을 담는다. 명시 CLI의 action/plugin/review/root가 적용되며 응답 유실을 자동 재전송하지 않는다. `reviews.test.ts`는 제품 HTTP Host·실제 CLI·plugin subprocess·K1 완료·파일 승인/거절/Undo와 Root/Host/generation·stale·no-replay를 검증한다. 공용 fixture이며 실제 Docling 제작·변환 품질이나 V5 브라우저 통합의 완료 근거가 아니다.

### V4 승인 내용 고정과 snapshot baseline

제안 접수 시 Host는 단일 target과 plain before/after에서 지원하는 text 연산의 path/from/to를 별도 보관한다. 승인 응답의 세 값이 이 고정 연산과 정확히 일치해야 하며 실제 저장에도 Host 보관 연산만 쓴다. plugin에 전달하는 문서·제안 입력은 복사본이다. 지원하지 않는 typed/다중 target 제안은 읽기·거절을 유지하되 승인을 허용하지 않는다. before/after와 고정 연산은 baseline 갱신으로 변경하지 않는다.

성공한 propose/reject/approve/undo마다 proposalRevision을 한 번 갱신하고, 반환 snapshot의 stale이 아닌 모든 제안 baseline을 응답 baseline과 동일하게 갱신한다. propose/reject는 documentRevision/sourceRevision/mappingRevision을 바꾸지 않는다. approve/undo는 commit한 canonical source의 documentRevision/hash를 bundle과 해당 제안 target에 함께 반영한다. 현재 text 연산은 대상 path를 유지하므로 해당 제안의 target만 새 문서 snapshot에 연결한다. 다른 제안은 stale로 남기며 이전 baseline/target을 최신 문서에 임의 연결하지 않는다. 재조회한 proposals와 변경 응답은 같은 baseline 계약을 따른다. 이전 requestId status는 당시 결과 snapshot을 보존하며 최신 snapshot 대신 사용하지 않는다.

승인 후 Undo의 proposal.baseline은 새 documentRevision·proposalRevision과 현재 sourceRevision/mappingRevision으로 비교한다. 이전 map은 여전히 폐기하며 없는 map을 새 문서에 맞는 것처럼 만들지 않는다. V5 통합에서는 문서/bundle/baseline/제안 target의 유효성과 map 탐색 가용성을 분리해야 한다. map 부재/continuation은 원본↔문서 이동을 막되, 현재 문서와 일치하는 제안의 승인·거절·Undo를 일괄 stale로 만들지 않는다. 실제 문서·원본 revision 불일치는 계속 모든 관련 변경을 막는다.

K1 review HTTP fixture는 start에서 running 접수만 반환하고 자료를 공개하지 않는다. 이후 status의 completed 응답을 기존 Host 문서 생성·bundle 검증/공개 경로에 연결한다. #1259 접수·완료 분리의 source-of-truth를 유지하며 별도 수명 규칙을 구현하지 않는다.

### V4·V6 공용 생성과 V3/V5 transport

#1341에서 비서 명세 생성·제안·저장 경로는 제거했다. review는 완료 작업 결과와 기존 전용 HTTP/CLI 진입점을 유지한다. 공통 view.validate는 같은 Host의 실제 완료 bundle 참조를 확인하며 조회·문서 변경을 실행하지 않는다. [현재 화면 계약](plugin-screens-v1.md)을 따른다.

V3/V5와 CLI는 단일 POST /api/reviews dispatcher를 사용한다. source의 bundleRef는 Host가 보관한 generation에 고정되며 generation을 명시한 요청은 일치해야 한다. read에서 pageNo를 주고 kind를 생략하면 snapshot/receipt를 반환한다. snapshot은 bundle/page/선택 mapping/proposals, document-reader의 Core document/revision/hash/path, baseline/pageCount와 선택 PNG imageUrl 또는 PDF 자료를 조립한다. 이미지 byte/pixel 제한과 JSON 자료 제한을 각각 적용하며 imageUrl은 일시적 읽기 결과로만 사용한다. 다른 자료 읽기는 기존 kind 선택을 쓴다. 변경·status는 같은 requestId·baseline 계약을 유지한다. source·문서가 외부에서 바뀌면 snapshot은 실제 revision으로 불일치를 드러내어 V5가 action을 막으며 Host도 commit 직전에 다시 거부한다. 이전 map을 새 문서에 재연결하지 않는다. HTTP/CLI·비서 stdio fixture 통과를 실제 브라우저·외부 서비스·Docling 수락으로 간주하지 않는다.

### 화면의 변경 결과 관찰과 페이지 없는 K4

미확정 변경의 소유자는 Host의 PluginReviews이며 bundle/proposal별로 관리한다. 유효한 approve/reject/undo를 접수할 때 requestId와 action/receipt를 plugin 호출 전에 잠근다. 결과가 확정되지 않은 동안 같은 제안의 모든 후속 변경은 다른 requestId라도 code:confirmation-required, Verification required 안내와 기존 pending.requestId를 반환한다. status 조회나 탭 종료만으로 이 잠금을 해제하지 않는다. 성공한 변경 결과가 확정될 때만 잠금을 해제하고 이후에는 제안 상태·baseline으로 중복을 거부한다. plugin/저장 관찰 실패는 기존 uncertain 결과와 잠금을 유지한다.

snapshot.unresolved는 proposalId/action/requestId/receipt/verification와 고정 guidance 목록이며, 미확정 제안의 published actions는 모두 allowed:false다. 따라서 다른 탭·재개방·앱 새로고침도 Host가 반환한 같은 잠금과 ID를 받는다. 화면의 ReviewObservation은 전송 중 표시와 Host 관찰의 임시 cache일 뿐 잠금의 권한 원본이 아니다. read는 snapshot의 Host 잠금을 복원한다. verification:pending인 요청만 Check request status에서 같은 ID를 조회하며, verification:unavailable은 결과 문서 직접 확인으로 안내한다. unknown/uncertain·통신 실패·다른 ID 응답은 새 변경을 허용하지 않는다. 화면 저장소는 쓰지 않는다. daemon 재시작 후 요청 결과는 unknown이고 이전 bundle/제안은 복원하지 않으므로 해당 변경의 새 ID 재접수도 거부한다. unknown을 실행 허가로 해석하지 않는다.

SDK pages:[] 완료 bundle도 snapshot을 제공한다. 이 경우 page는 없고 pageCount는 0이며 문서·baseline·제안은 그대로 반환한다. 화면은 페이지 controls와 원본↔문서 탐색만 비활성으로 두고 K4의 목록·상세·유효한 승인/거절/Undo는 유지한다. 존재하는 페이지 목록에서 잘못된 pageNo를 요청하면 계속 거부한다. 공용 Button/Notice/Tooltip과 기존 Read를 쓰며 새 surface나 스타일 예외를 추가하지 않는다.

회귀: 제품 HTTP/CLI fixture는 페이지 없는 K4와 세 변경의 응답 유실, 같은 ID의 unknown/uncertain 확인 및 확정 결과 복구를 검증한다. review-v5 브라우저 fixture는 실제 createReviewAdapter를 사용해 불확실 요청의 status 확인 전 버튼 잠금과 같은 ID 유지, 정상 복구 뒤 Undo, 페이지 없는 review의 승인/Undo를 확인한다. 실제 외부 서비스·Docling 수락은 별도다.


### 미확정 결과의 확인 가능 여부

Host가 verification을 소유한다. 아직 원래 호출이 진행 중이면 pending과 nextAction:check-status, 같은 ID 조회/no-replay 안내를 반환한다. 호출이 끝났으나 결과를 확정하지 못한 실패와 결과 기록이 없는 unknown은 unavailable과 nextAction:open-document를 반환한다. unavailable은 재조회로 해결되는 진행 상태가 아니며 잠금은 그대로 유지한다. status와 snapshot.unresolved, 후속 변경 거부가 이 구분을 동일하게 전달한다.

화면은 unavailable일 때 “Status checks cannot resolve this outcome. Do not repeat this change.”를 짧게 표시하고 기존 결과 문서 열기 동작을 “Open result document” 버튼으로 제공한다. Tooltip에는 공용 고정 guidance “Status checks cannot resolve this outcome. Do not repeat this change. Open the result document and inspect it.”를 둔다. 불필요한 status 반복은 하지 않으며 변경 권한도 복구하지 않는다. 기존 snapshot의 결과 경로로 문서를 열고, Host가 모르는 경로를 발명하지 않는다. CLI JSON도 같은 verification/guidance/nextAction을 그대로 전달하고 Host가 확인한 documentPath가 있으면 함께 제공한다. daemon 재시작으로 경로까지 모르면 경로는 반환하지 않는다.

제품 fixture는 진행 중 pending, 종료된 uncertain의 unavailable, 재시작 unknown의 unavailable과 잠금 유지를 검증한다. 실제 CLI status에서 unknown/uncertain의 공용 안내·행동 코드를 확인한다. review-v5 브라우저 검사는 unavailable 안내·tooltip·결과 문서 열기와 이후 변경 버튼 잠금 유지, status 재조회 중단을 확인한다.

## 공식 번들 공급과 외부 폴더 추가 (#1279)

공식 OneDrive는 개발 실행·CLI·Desktop에 artifact를 포함하고 Host 시작 때 등록 없이 Settings → Plugins 및 공용 `plugins list`/비서 `manage_plugins` 목록에 표시한다. 기본은 꺼짐이다. 제품 공급 목록 `OFFICIAL_PLUGINS` 항목의 `defaultEnabled` 하나로 기본값을 바꾼다. Host는 사용자 선택 `enabledChoice`를 저장해 기본값보다 우선하고, 선택 전에는 설정 저장·재시작을 거쳐도 공급 기본값을 따른다. 기본값이 켜짐으로 바뀌면 선택하지 않은 사용자만 자동 활성화한다.

OneDrive 빌드는 공용 artifact digest 계산으로 artifact 밖 `digest.json`을 생성한다. CLI 빌드는 매번 OneDrive를 빌드해 artifact와 digest를 함께 복사하고 npm 배포 파일 목록에 포함한다. Desktop은 이 CLI 산출물 전체를 사용한다. 개발 `pnpm editor`도 OneDrive를 먼저 빌드한다. Host는 공급 목록 id·publisher·digest를 대조하며 불일치·누락은 오류 행으로 남기고 실행·trust 우회를 막는다. 공식 플러그인은 앱 업데이트와 함께만 갱신하며 등록 교체·unregister는 불가하고 끄기만 제공한다. 비활성화의 설정·secret·열린 탭 보존 계약은 유지하며 OneDrive 자동 표시 폴더만 위 계약에 따라 목록에서 제거한다.

외부 플러그인은 “플러그인 추가…”에서 기존 Host 측 `FolderDialog`로 artifact 폴더를 선택한다. Settings의 별도 절대 경로 입력란은 제거한다. 기존 Button·FolderDialog·설정 행과 토글을 재사용하며 새 공통 UI 패턴은 없다. 폴더 탐색은 현재 Host client를 통해 수행하고 로컬 PC 파일 선택 창으로 대체하지 않는다. 1단계 설정 UI의 로컬 Host 범위는 유지하며 원격 UI를 새로 개방하지 않는다. CLI `plugins register <directory>`와 비서 도구의 외부 경로·trust·enable·unregister는 기존 공용 작업을 유지한다.

사용자가 추가한 플러그인의 설정 Dialog에는 기존 destructive Button의 “제거”를 제공한다(#1413). 기본 포함(`bundled`) 플러그인에는 제공하지 않는다. 기존 DangerConfirmation으로 대상 이름과 실행 중이면 먼저 끄기, 설정·비밀값 삭제, 폴더는 디스크에 보존, 재추가 시 신뢰 재확인을 알린다. 취소에 초기 초점을 두고 취소하면 설정으로 돌아간다. 확인하면 기존 Host `unregister`를 호출하고 성공 시 목록에서 제거해 추가 버튼으로 초점을 돌린다. 실패는 기존 오류 표시로 알리고 목록에 남긴다. 같은 ID의 지정 복사본은 아래 계약대로 다음 Host 시작에 복귀한다. 새 공용 작업이나 폴더 삭제는 없다. 기존 `vite-plugins`는 기본 포함의 제거 행동 부재와 사용자 추가 플러그인의 확인·취소·활성 상태 제거를 검증한다. Windows persistent Chrome의 한국어 Dark [1440px 설정](assets/remove-plugin-1413/settings-1440.png)·[확인](assets/remove-plugin-1413/confirm-1440.png), [640px 설정](assets/remove-plugin-1413/settings-640.png)·[확인](assets/remove-plugin-1413/confirm-640.png)은 같은 fixture 상태이며 실제 외부 서비스의 검증은 아니다. 공통 Button·DangerConfirmation·settings-actions를 재사용하고 새 공통 UI 예외는 없다.

기본값 전환·명시적 선택·변조 차단은 Host 단위 검사, 첫 실행 표시·토글·외부 폴더 선택 연결은 `http-plugins`, 배포물 안 공급·실행은 CI packaged 검사에서 확인한다. 수동 1440 캡처는 `pnpm browser:test http-plugins --screenshots`의 `docs/design/assets/bundled-plugins-1279/bundled-1440.png`에 남긴다. 이는 localhost와 fixture 검증이며 실제 OneDrive 계정 동기화의 증거는 아니다.

### 지정 커뮤니티 공급 (#1391)

제품 고정 `DESIGNATED_COMMUNITY_PLUGINS` 한 곳에서 지정 ID·폴더·실행 파일 목록을 관리한다. 초기 Docling·Jira는 개발 실행·CLI·Desktop에 포함되어 등록 없이 목록에 나타나며 계속 커뮤니티로 표시한다. 사용자·비서·설정으로 지정 목록을 바꾸지 않는다. 처음에는 꺼짐·미신뢰이며 기존 신뢰 확인을 거친 뒤에만 entry를 실행한다. 같은 등록의 신뢰·켜기/끄기·설정·secret은 재시작과 앱 업데이트에도 유지한다. 공식 공급 id·publisher·digest 검증은 별도로 유지한다.

지정 복사본은 unregister를 거부하고 끄기만 허용한다. 같은 ID를 폴더에서 등록하면 그 등록이 우선한다(활성이면 먼저 끈다). 등록 교체는 새 registrationId로 다시 신뢰하며, 외부 등록을 제거하면 다음 Host 시작에 꺼짐·미신뢰 지정 복사본을 다시 표시한다. 외부 등록 제거의 기존 설정·secret 삭제 계약은 유지한다. 지정 복사본이 시작 시 복귀할 때 기존 등록과 operation ID가 충돌하면 목록에 `Plugin operation ID collision` 오류로 남기고 활성화도 거부하며, 먼저 등록된 플러그인의 실행은 유지한다. 공용 plugins 작업·CLI list·비서 도구가 같은 상태를 사용하며 새 명령은 없다.

CLI는 지정 목록의 실행 파일·아이콘 고지만 복사하고 fixtures·개발 타입·설명서는 포함하지 않는다. npm files에 community-plugins를 포함하며 Desktop 빌드는 지정 파일 누락을 거부한다. Host 단위 검사는 신뢰 차단·등록 교체/복귀·업데이트를, 기존 http-plugins는 확인창 연결을, packaged 검사는 배포 파일과 목록을 보호한다. 실제 설치본 실행은 이 작업의 로컬 검증 범위 밖이다.

시각 검토는 기존 PluginSettings 목록·토글·신뢰 Dialog·FolderDialog를 재사용하며 새 공통 구현 예외는 없다. Windows persistent Chrome의 1440px English/Light와 640px 한국어/Dark에서 행 중심·여백·줄바꿈·스크롤·잘림을 확인했다. [1440px 이전](assets/designated-plugins-1391/before-1440.png)·[이후](assets/designated-plugins-1391/after-1440.png), [640px 이전](assets/designated-plugins-1391/before-640.png)·[이후](assets/designated-plugins-1391/after-640.png)는 지정 복사본이 꺼져 있는 목록이며 외부 서비스 성공이나 실제 설치본의 근거가 아니다.

### 읽기 전용 대조 자료 (#1317)

review 기여는 read가 필수이며 propose/approve/reject/undo는 선택이다. Host는 선언하지 않은 변경을 plugin 호출 전에 거부한다. 기존 review 화면·Read·Button·Notice를 재사용하며 새 화면이나 공통 상호작용 예외는 없다.

K1 result.review는 같은 Host에서 재조회할 plugin/review/root/bundleRef/generation을 제공한다. result.bundle의 문서 참조도 유지한다. 발행은 canonical 파일의 revision/hash와 Core read model의 실제 block path를 함께 대조한다. 영역 ID는 페이지 안뿐 아니라 발행 자료 전체에서 유일해야 한다. 여러 페이지의 같은 이름은 plugin이 page 식별자를 포함한 opaque ID로 구분한다. 미지원 continuation이나 기존 JSON/목록/PNG 상한 초과는 거부한다.

모든 read는 문서·원본·이미지를 확인하며 불일치를 본 bundle은 같은 Host 수명 동안 stale을 유지한다. snapshot에도 응답 state를 전달하고 Editor adapter가 stale을 보존하므로 뒤늦은 ready 응답이나 이전 byte 복원으로 탐색을 재활성화하지 않는다. 바뀐 이미지는 전달하지 않는다. 새로 발행·검증한 bundle을 명시적으로 열어야 다시 사용할 수 있다. disable/unregister 동안 조회를 거부하고 reload·재활성 후 같은 신뢰 artifact의 기존 bundle은 다시 확인할 수 있다. daemon 재시작 후 복원하지 않는다.

자료 삭제·경로 종류 변경·접근 권한 상실(ENOENT/ENOTDIR/EISDIR/EACCES/EPERM/ELOOP), 고정 Root 접근 거부와 실제 revision/hash 불일치는 조회 전 경로 검사에서도 해당 bundle의 stale을 기록하고 원래 접근 오류는 유지한다. 삭제된 문서는 snapshot을 반환하지 않으며 같은 바이트로 복원해도 기존 bundle은 stale이다. 복구한 자료는 새 bundle을 명시적으로 발행해 사용할 수 있다. 잘못된 Host/Root/generation 요청은 bundle 검사 전에 거부하며 다른 bundle을 무효화하지 않는다. EBUSY·자원 부족 등 그 밖의 일시적 I/O 오류는 실패로 전달하고 stale로 고정하지 않는다.

문서 생성 후 발행 실패는 uncertain과 이미 생성한 result.path/revision을 보존한다. 같은 requestId 조회는 이를 재생성하거나 start를 재전송하지 않는다. 문서 결과와 대조 자료 발행 성공을 구분한다. 이 범위는 K1 단일 원본→새 문서이며 Docling 해석·대규모 paging·과거 형식 호환을 포함하지 않는다.

검증 근거: `pnpm browser:test review-v5 --screenshots`의 [1440 이전](assets/readonly-review-1317/review-readonly-1440-before.png)·[이후](assets/readonly-review-1317/review-readonly-1440.png), [다크 1440 이전](assets/readonly-review-1317/review-readonly-dark-1440-before.png)·[이후](assets/readonly-review-1317/review-readonly-dark-1440.png), [다크 640 이전](assets/readonly-review-1317/review-readonly-dark-640-before.png)·[이후](assets/readonly-review-1317/review-readonly-dark-640.png). 같은 snapshot의 Host stale 응답이 이전에는 무시되고 이후에는 탐색을 막는 차이다. 한국어 문서·같은 행 정렬·여백·패널 내 스크롤·잘림과 다크 톤을 확인했다. 640px는 기존 넓은 비교 안내를 유지한다. review 화면의 기존 영문 안내는 지역화하지 않았으며 새 대조 화면을 설계하지 않았다.

## 공개 SDK의 중립 문서 생성 (#1316)

Core `authorDocument(input)`을 공개 `@litzio/plugin-sdk`에서 제공한다. Promise 결과는 `{source, documentRevision, documentHash, inputs:[{key,targets:[]}]}`다. 외부 플러그인은 내부 패키지·AST·Markdown 구현 없이 이 함수로 생성하며, 파일 쓰기 권한이나 저장 receipt를 얻는 함수는 아니다. 원본의 해석·지원 여부 분류는 플러그인, 문서 의미·유효성·canonical 직렬화는 Core, Root·경로·충돌·실제 저장은 Host가 소유한다.

입력은 `{title?, inputs:[{key,blocks:[]}]} ` JSON 값이다. key는 비어 있지 않은 최대 512자 문자열이며 요청 전체에서 유일하다. 하나의 입력은 여러 블록 또는 빈 배열을 가질 수 있고, 결과는 key로 찾아야 한다. `__proto__` 같은 키도 객체 속성으로 사용하지 않는다. 입력의 blocks 순서가 문서 순서이며 결과 배열 순서 자체는 대응의 식별자가 아니다.

| kind | 입력 필드 | 의미 |
| --- | --- | --- |
| paragraph | text | literal 본문 |
| heading | level(1–6), text | 제목 |
| list | ordered, start?, items(string[]) | 중첩 없는 bullet/번호 목록, 최대 100항목 |
| table | rows(string[][]), enumerator?, enumerated? | 첫 행 header, 직사각형 표 |
| figure | imageUrl 또는 imageAsset, imageAlt, caption, enumerator?, enumerated? | 기존 Core Figure, 빈 URL은 pending |
| code | language, code | 코드 블록 |
| equation | latex, enumerator? | display 수식 |
| divider | 없음 | 구분선 |

모든 텍스트는 기존 Core literal text 연산을 통과한다. Markdown 문자열을 의미로 파싱하지 않는다. 기존 연산의 공백·개행 정규화와 native write 거부 규칙을 그대로 따른다. rich inline, 중첩 목록, 임의 HTML/AST/원본 Markdown, 외부 형식 변환은 이 API의 입력이 아니다. imageAsset은 함께 넘긴 이미지의 key이며 `authorDocument(input, imageAssets)`의 두 번째 인자 `{[key]: relativePath}`로 해석한다. imageUrl과 imageAsset은 정확히 하나만 지정한다. 경로가 없는 asset은 거부한다. Core는 바이트 검사·파일 IO를 하지 않는다. Figure·Table·Equation의 선택적 enumerator는 기존 updateEnumerator와 직렬화·번호 계산을 사용한다. Figure·Table의 선택 `enumerated:false`는 표준 MyST 번호 없음으로 직렬화하며 자동 카운터에서 제외한다(#1383). false와 비어 있지 않은 enumerator를 함께 지정하면 거부한다. 번호를 캡션에서 추측하거나 제거하지 않는다. title도 기존 Core 단일 행 title 제약을 따른다. 지원하지 않는 의미를 자동으로 평탄화하거나 일부만 성공으로 반환하지 않는다.

`DOCUMENT_AUTHORING_LIMITS`는 입력 JSON과 출력 canonical source 각각 UTF-8 4 MiB (4,194,304 bytes), 입력 5,000개, 전체 블록 5,000개, 문자열 16384 UTF-16 code units, 표 100행×32열이다. unknown 필드·중복 key·잘못된 요소/Unicode·schema 상한 위반은 `DocumentAuthoringError.code="invalid-input"`, byte 상한 초과는 `limit`, Core의 의미·round-trip 거부는 `unsupported-content`로 Promise가 reject된다. 오류에는 입력 원문을 포함하지 않으며 부분 결과를 반환하지 않는다. `documentAuthoringSchema`는 구조 검증용이고 byte·Core 검증은 함수 실행에서 추가한다.

반환 source는 canonical serialize→parse→serialize가 안정적인 native 문서다. 각 target은 `{path,documentRevision,documentHash}`이며 최종 재파싱 snapshot의 Core read-model 최상위 블록을 가리킨다. revision과 hash는 동일한 canonical source UTF-8 SHA-256(hex)으로 Host `textRevision`과 같다. 해시는 순수 JS 라이브러리로 계산하며 Node 전용 API나 secure context의 `crypto.subtle`에 의존하지 않는다. key는 원본 입력의 식별자이고 path는 persistent identity가 아니다. 저장 뒤 같은 source/revision에서만 참조가 유효하며 편집 후 새 revision에 자동 재연결하지 않는다. 참조 없는 입력도 `{key,targets:[]}`로 반환한다. 원본 영역·mapping 자료는 플러그인이 이 target을 사용해 별도로 구성하고 #1317의 전역 유일 영역 ID·bundle 범위 검증을 따른다.

기존 K1 status 완료의 `document:{source: authored.source}`는 유지한다. 이미지가 있는 결과는 `document:{authoring: DocumentAuthoringInput, images:[{key,mime,base64}]}`로 반환한다. Host가 이미지 경로를 바인딩한 뒤 같은 Core 함수를 호출하고 공식 새 파일 생성으로 저장한다. 이 분기의 최종 문서 revision은 K1 저장 receipt를 따른다. K1 result.inputs는 이미지 경로를 바인딩한 최종 문서의 key별 targets(각 path/revision/hash)를 호출자에게 반환한다(#1383). 원본 source 결과에는 inputs를 추측해 추가하지 않는다. 플러그인의 원본→블록 해석은 바뀌지 않으며 Core/Host가 특정 외부 형식을 알지 않는다. 공용 `plugins job-start/job-status/job-result` HTTP/CLI·requestId·Root·충돌·receipt 경로를 유지하며 새 저장 endpoint나 직접 파일 쓰기를 만들지 않는다. start는 계속 running 접수만 반환한다. 문서 저장 이후 review 발행은 별개 단계이고 기존 uncertain·같은 requestId 확인·start 무재전송 계약을 유지한다.

검증은 기존 Core native suite에서 최소 요소·입력 키별 0/N 참조·canonical 재처리와 거부를 확인한다. 기존 K1 suite의 대표 외부 artifact subprocess(약 2초)는 SDK import만 사용해 생성→Host 공식 저장→재파싱·revision/path 대조와 원본 보존을 확인한다. Core 조합을 subprocess에서 반복하지 않는다. master의 #1318과 #1317 최종 결합은 기존 `reviews.test.ts`의 읽기 전용 K1 완료 경로에서 공개 SDK 생성→공식 저장→입력 key별 target으로 대조 발행→Host·실제 CLI snapshot 재조회와 revision/path 일치를 확인한다. 같은 SDK 생성 문서를 외부 변경한 뒤 원래 byte로 복원해도 stale을 유지하는 통합 경계를 함께 보호한다. 새 subprocess를 추가하지 않고 기존 완료·CLI 읽기를 보완하며 삭제·일시적 오류 분류는 Host 단위 검사가 소유한다. Docling 품질·대규모 paging·과거 형식 호환은 검증 범위가 아니다.


## 공용 문서 이미지·긴 문서 확장 (#1371)

beta.9와 함께 공개하는 SDK `0.3.0`에 포함한다(마지막 공개 제품 v0.0.2-beta.8의 SDK는 0.1.0). Word/HTML 가져오기, CLI 및 비서의 구조화 문서 작성이 같은 의미·저장 작업을 사용할 수 있다. 기존 K1 start/running·status/completed·Root·원본 보존·새 파일 충돌 거부 계약은 유지한다. 원문 source 완료도 UTF-8 4 MiB로 제한한다.

- `images`는 key가 유일한 최대 256개다. Figure의 imageAsset 참조와 정확히 일치해야 한다. MIME은 PNG/JPEG/GIF/WebP이며 정규 base64, 디코딩 후 이미지당 10 MiB와 기존 complete-container 검증을 사용한다. SVG는 이 저장 경로로 받지 않는다.
- 전체 완료 document JSON은 `JOB_DOCUMENT_MAX_BYTES` 32 MiB다. child가 IPC 전 검사하고 Host가 다시 검사한다. 문서 authoring JSON과 canonical source는 별도로 각각 4 MiB다. K1 HTTP 요청은 기존 작은 요청이며 응답에는 문서 바이트가 아닌 작업 snapshot/저장 receipt만 싣는다. 기존 10초 RPC는 접수·관찰 한 번의 예산이고 문서 작성은 계속 start에서 접수한 background 작업에서 해야 한다.
- Host는 문서 폴더의 실제 `assets/`에 기존 이미지 검증·exclusive hard-link 게시·충돌 처리·미게시 임시 파일 정리를 재사용한다. 이름은 정리된 문서 stem(최대 8 Unicode code points), 전체 문서 파일명 SHA-256, 이미지 SHA-256·MIME 확장자다. 같은 이름 앞부분을 가진 서로 다른 문서는 파일명이 겹치지 않으며, 같은 문서·동일 bytes의 재생성은 같은 경로를 재사용한다. 다른 내용과 충돌하면 기존 suffix 규칙을 쓰고, 같은 bytes가 있으면 그 경로를 재사용한다. 문서에는 `./assets/...`를 쓴다. 같은 문서 이름으로 다시 만들 때 이미지가 늘지 않는다. K1 기본 결과는 앞 절의 입력 옆 이름·충돌 시 `-N` 규칙을 따른다. 명시적 output이 이미 있으면 접수 전에 `result_exists`로 거부하며 기존 문서와 이미지를 보존한다. 같은 명시적 경로로 재생성하려면 결과 문서를 삭제한 뒤 새 요청을 한다. 접수 후 외부 writer가 결과 파일을 만든 경합은 exclusive 게시가 거부하고 uncertain으로 남기며, 기존 문서와 이미 게시·재사용한 이미지는 보존한다.
- 완전히 게시한 작성 이미지는 다른 CLI/Host process가 즉시 재사용할 수 있는 폴더 파일이며 실패 요청의 독점 소유가 아니다. 문서 생성·게시 검증에 실패해도 게시 이미지를 삭제하지 않고 rollback receipt도 발급하지 않는다. 따라서 실패 뒤 미참조 이미지가 assets/에 남을 수 있다. 미게시 임시 파일만 소유권 검사 후 정리하며 자동 고아 이미지 삭제·process 간 lock·작업 복원은 추가하지 않는다. 편집기 붙여넣기/드롭의 기존 서명 receipt와 rollback 삭제는 그대로다.

CLI는 기존 `plugins start/status/result --host <origin> --json`으로 같은 K1 경로를 사용한다. 플러그인 없는 작성은 `litzio create report.md --input request.json --format json`으로 같은 Host 생성 함수를 호출한다. request.json은 `{authoring,images}`이며 바이트가 담긴 입력 파일은 artifact 밖에 둔다. template/language와 input은 함께 지정할 수 없다. 결과 receipt의 inputs는 최종 경로·revision에 맞는 Core targets다. 문서 의미와 Markdown 조립은 CLI에 없다.

### 상한 근거와 검증 범위

2026-11-09 로컬 IEEE 1547-2018의 138쪽 추출 자료를 읽기 전용으로 측정했다. texts 2,937·tables 71·pictures 29·groups 73, 총 3,110항목이며 텍스트 UTF-8 336,522 bytes다. 최대 텍스트 4,236 UTF-16 units, 표 44행·9열이므로 문자열 16,384와 표 100행·32열은 올리지 않았다. 입력/블록 5,000과 JSON/source 4 MiB는 이 자료의 항목 수와 JSON overhead를 수용하는 유한 상한이다. 10,000개 단순 문단 경계 시험은 약 24초라 채택하지 않았다.

Core가 개별 문단으로 보존할 수 있는 2,934개 텍스트의 용량 probe는 입력 JSON 502,654 bytes·canonical source 342,568 bytes로 성공했다. 개별 사전 검증·작성·재파싱 전체 약 21초였으며 다른 로컬 검사와 동시 실행한 값이다. 이는 실제 자료의 용량 근거이며 전체 변환·성능 보증이 아니다. 나머지 3개 텍스트는 기존 literal round-trip 제약으로 거부됐고 원본 변환기는 표 56의 겹친 셀을 거부했다. 원본/변환기나 거부 기준을 고치지 않았으며 원문·대용량 재생성 자료는 커밋하지 않는다.

기존 Core native suite는 번호·이미지 바인딩·정확한 입력/블록·문자열·표·byte 경계를 소유한다. 기존 K1 외부 artifact subprocess를 보완해 실제 SDK→이미지 저장/재사용→문서 실패 시 게시 이미지 보존·잘못된 이미지 거부를 확인한다. 별도 module instance 두 개가 독립 CLI/Host의 process-local 상태를 모델링하는 낮은 계층 검사는 같은 24자 접두어의 다른 문서와 같은 문서 경로 양쪽에서 실패/성공 조합을 고정한다. 수정 전 성공 문서의 이미지 ENOENT를 재현했고, 수정 후 보존을 확인한다. 실제 subprocess·긴 문서 지연 없이 공유 filesystem의 재사용·삭제 경계를 보호한다. CLI executable 대표 사례는 JSON 입력·같은 공용 경로의 실제 파일·충돌 보존을 검증한다. 기존 plugin-jobs 브라우저는 결과 Figure의 실제 image load와 고정 번호를 확인하고 production http-host는 Save/Reload·충돌을 확인한다. UI 구현은 바뀌지 않으며 새 subprocess fixture·suite·timeout·retry는 추가하지 않는다. 실제 가져오기 서비스·원본 충실도는 별도 수락이다.

## screens·views의 내용 우선 표시 (#1329)

manifest 화면은 기존 ViewWorkspace로 기본 뷰 내용을 바로 표시하며 단일 Host·현재 단일 기본 뷰의 선택 장치를 숨긴다. host 범위 읽기 작업의 조회에는 열린 폴더가 필요하지 않다. 폴더 선택·HTTP/CLI 실행·receipt와 검증 범위는 [플러그인 화면 계약](plugin-screens-v1.md)을 따른다. SDK·manifest의 기본 query 정의는 유지하고 저장 뷰 파일 열기/쓰기는 제거했다.

## 플러그인 설정과 연결 확인 (#1334)

일반 설정은 빈 값 `{}`에서 시작해 항목별로 저장하며, Host는 저장과 활성화 때마다 전체 `settingsSchema`를 검사한다. `settingsSchema.required`는 사용하지 않으며 SDK 검증기는 비어 있지 않은 최상위 `required`를 거부한다. 항목별 `type`, `minLength` 등의 형식 제약은 허용한다. `default`는 저장되지 않으므로 코드에서 기본값을 처리한다. 연결에 필요한 값이 없으면 연결 확인과 작업에서 고정 안내를 반환하고 예외 원문은 공개하지 않는다.

`validate` 통과는 설정 흐름을 증명하지 않는다. 빈 설정에서 항목을 하나씩 저장하고 설정 창을 다시 열어 값 유지를 확인한다. 비밀값 저장·활성화·연결 확인은 각각 확인하며 수행하지 못한 단계는 미확인으로 보고한다.

표시 이름은 manifest `name` 하나다. `screens[].title`은 사이드바·탭에만 사용한다. 설정 `title`은 라벨, `description`은 Tooltip 도움말이다. 목록은 제목·공식/커뮤니티 배지 하나·설명과 오른쪽 톱니·스위치, 아래 상태·계정으로 고정한다. 설정 창은 이름·버전·설명 → 일반 설정(manifest properties 순서) → secret → 연결 확인 → 상세(만든 곳·신뢰 여부·digest) 순서다. 화면 이동 버튼이나 “동작 · 이름” 합성 라벨은 설정 화면에 두지 않는다.

외부 서비스 플러그인은 `contributes.healthCheck`에 같은 manifest의 operation ID를 선언한다. SDK 0.3.0 이상을 요구해야 한다. 예: `requiresSdk: ">=0.3.0 <1.0.0", contributes: { healthCheck: "connection", operations: [...] }`. 해당 작업은 `{}` 입력을 받는 독립적인 host 범위 read이며 job/review 바인딩으로 겸용하지 않는다. outputSchema에는 SDK `HEALTH_CHECK_OUTPUT_SCHEMA`를 사용하고 `HealthCheckResult` (`{ ok: boolean, message: string }`, 추가 필드 없음, 안내 1~300자)를 반환한다. message는 작성자가 만든 고정된 안전 안내이며 원문 응답·secret을 담지 않는다. Host는 secret 정리와 operation outputSchema 검증 후 SDK 고정 형식도 검사한다.

설정 UI와 CLI `operation invoke <pluginId>.connection --input <empty-object.json> --host <origin> --json`은 같은 공용 operation·receipt·저장된 설정·secret을 사용한다. 따라서 별도 CLI 명령은 추가하지 않는다. `{ok:false}`도 정상 완료한 진단 결과이며 receipt success와 서비스 연결 성공은 구별한다. UI는 실행 중 중복 실행을 막고 결과를 연결됨/오류와 안내로 표시한다. 비활성/미실행이면 사유 Tooltip과 비활성 버튼을 보인다. 기존 하위 프로세스 RPC 10초 제한과 안전 오류를 사용하며 UI 요청은 15초로 제한한다. 확인 뒤 목록 상태를 다시 읽어 시간 초과·종료된 프로세스의 버튼 가용성도 갱신한다. 같은 설정의 목록 재조회는 확인 결과를 보존하고 설정 변경·창 닫기·Host 교체 시 이전 표시를 버린다. Docling/Jira 선언은 각 플러그인 후속 작업이며 이번 검증은 fixture다.

## 링크 열 SDK 0.3.0 (#1332)

현재 SDK_VERSION과 패키지 버전은 `0.4.0`이며 Host는 `0.1.0`, `0.2.0`, `0.3.0`, `0.4.0` 계약을 구현한다. 기존 exact/caret 0.1 및 0.2 플러그인은 유지한다. 공개 read rowSchema의 string 열은 `linkField:"url"`로 같은 행의 다른 공개 string 필드를 링크 대상으로 지정한다. 링크 선언이 있으면 requiresSdk가 0.3.0 이상인 실제 지원 계약을 허용해야 하며 validate·등록·활성화에서 동일하게 거부한다. 권장 범위는 `>=0.3.0 <1.0.0`이다. 일반 파일 기능의 최소 버전은 여전히 0.2.0이다. 표시·키보드·URL 허용 및 행 보존은 [Table 링크 계약](plugin-screens-v1.md#공통-table과-링크)을 따른다.

## 플러그인 화면 작업 패널 (#1340)

SDK `0.3.0`(beta.9와 함께 공개)에 `screens[].jobs`를 함께 제공한다. SDK 기능 추가는 릴리스 사이 한 번 버전을 올리고 같은 미릴리스 버전에 합친다. 이 기능은 `requiresSdk`가 0.3.0 이상 구현 계약을 허용해야 한다.

```json
{"id":"dashboard","title":"Dashboard","icon":"LayoutDashboard","jobs":["convert","document"],"defaultViewIds":["status"],"primary":true}
```

jobs는 같은 플러그인의 K1 ID만 참조하며 중복·미선언 ID를 거부한다. 작업만 있는 화면도 허용한다. 실행 자체가 독립된 화면 목적이므로 불필요한 조회 뷰를 강제하지 않는다. jobs/defaultViewIds 중 하나는 비어 있지 않아야 한다. 앱의 공통 작업 패널을 기존 조회 뷰 위에 세로로 배치한다. 비서 생성·즐겨찾기 없이 플러그인, Host, 열린 폴더만으로 동작한다.

Host `plugins.job-start-many` v1 입력은 `{action:"job-start-many",plugin,job,root,files}`다. files는 중복 없는 Root 상대 경로 1–50개다. 선택적 requestIds는 파일과 같은 순서·수의 고유 UUID이며 전송 전 생성하면 응답 유실 때도 같은 ID를 조회할 수 있다. 결과는 `{files:[{file,requestId,job}|{file,requestId,errorKind,error,startFailure}],receipt}`다. 파일마다 기존 K1 요청을 독립 실행하며 접수 실패가 다른 파일을 막지 않는다. 접수한 snapshot 중 uncertain이 있으면 receipt uncertain, 그 외 하나라도 거부하면 failure, 모두 접수하면 success다. 파일별 running/uncertain은 각 snapshot으로 확인하며 start를 자동 재전송하지 않는다. 큐·스케줄러·재시작 복원은 없다. 기본 결과는 `defaultJobOutput`으로 입력 확장자를 결과 확장자(file의 선언 확장자 또는 native-document의 `.md`)로 교체하고 상대 부모를 보존한다. 이미 존재하거나 running/uncertain 작업이 예약한 이름이면 앞 K1 절의 `-N` 규칙으로 새 이름을 예약한다. 실제 이름은 snapshot의 `output`으로 반환한다. 기존 단일 시작·명시적 output의 접수 전 충돌 거부 계약은 유지한다.

CLI는 같은 Host 작업을 호출한다.

```sh
litzio plugins start example.plugin --job convert --root <root> --file a.pdf --file b.pdf --host <origin> --json
```

앱 패널은 여러 작업을 나란히 고르는 공통 ChoiceGroup(이름·accept → resultExtension 또는 native-document의 .md 표시, 여러 줄 허용, 단일 작업은 선택 숨김), 열린 폴더 선택(현재 폴더 재선택은 읽어 둔 파일 목록을 유지), accept 필터 체크 목록과 기존 하위 폴더 탐색을 쓴다. 실행할 때 파일 선택을 비우며 실패/불확실을 자동 재시도하지 않는다. Host snapshot의 startedAt(접수 시각)으로 정렬해 외부 CLI 작업을 나중에 발견해도 플러그인 전체의 daemon 수명 기록을 최신순으로 파일·작업·상태·단계·경과·행동 표에 표시한다. running 동안 활성 화면에서 1초마다 기존 상태 작업으로 관찰하며 응답 유실은 uncertain이다. 중단/상태 재확인과 native 결과 열기는 기존 공통 Plugin jobs 부품을 재사용한다. opaque file은 기존 K1 계약대로 경로·복사를 제공한다. 의미를 모르는 파일에 문서 열기를 제공하지 않는다.

#1395: 폴더·입력 파일·시작 버튼을 기존 surface-subtle 입력 영역으로 묶고 결과 표는 전체 폭 내부 가로 스크롤을 유지한다. 폴더 이름은 짧게 표시하며 전체 경로는 hover·keyboard focus Tooltip과 접근 가능한 이름에 남긴다. 시작 버튼은 선택 작업 이름, 옆에는 선택 파일 수를 표시한다. 폴더 없음·지원 파일 없음(accept 안내)·미선택은 다음 행동 안내 하나를 제공하고 버튼의 설명과 연결하며 키보드로 접근할 수 있다. 작업이 없으면 빈 표 머리글을 숨긴다. 상태 배지는 공통 Host semantic tone과 상태 글자를 사용한다. 실제 done/total만 Progress로 표시하고 진행량 없는 실행은 단계·불확정 표시만 쓴다. 결과 열은 ‘결과 파일’이며 native 결과 열기와 opaque 경로·복사는 유지한다. 작업 연결·새 SDK/Host 계약은 없다.

검증은 기존 job-plugin fixture의 SDK/Host 검사 및 `plugin-jobs` 브라우저 시나리오에 집중한다. 공통 패널 자체의 fixture는 실제 Docling 변환 품질을 검증하지 않는다. [Docling 0.0.2](../../community-plugins/docling/README.md)는 같은 패널에 PDF 변환·문서 만들기를 선언하고 설정 healthCheck를 사용한다. 중복 연결 표는 제거하며 API 키 서버는 지원하지 않는다. Docling은 서버 동시 처리 실패를 피하도록 플러그인 프로세스 안에서 PDF 서버 요청을 한 건씩 처리하며 대기 중 중단을 지원한다. Host 큐는 추가하지 않는다. 자동 http-plugins는 가짜 서버만 사용하며 실제 컨테이너 두 PDF 수락은 화면 또는 CLI로 별도 확인한다. Docling 적용의 [1440px](assets/docling-002/dashboard-1440.png)·[한국어 다크 640px](assets/docling-002/dashboard-640.png)는 경로·계정 표기를 마스킹한 수동 시각 근거다. 수동 캡처는 `pnpm browser:test plugin-jobs --screenshots`의 `tmp/plugin-jobs/panel-1440.png`, `panel-640.png`다.

2026-11-09 수동 검토: [1440px](assets/plugin-job-panel-1340/panel-1440.png), [한국어 다크 640px](assets/plugin-job-panel-1340/panel-640.png), [640px 표 오른쪽 끝](assets/plugin-job-panel-1340/panel-640-end.png). 기존 #1330 화면의 간소화된 구조를 유지하며 패널·표 정렬, 여백, 한국어·다크, 640px 내부 가로 스크롤을 확인했다. 계정·폴더 경로는 촬영 시 마스킹했다. 기존 plugin-jobs에 다중 시작·부분 충돌·CLI·행 중단·결과 열기를 보완했으며 재검토 로컬 실행은 약 1.3분(HTTP 복구 포함 2개)이다. K1 15개(응답 역전 회귀 포함), 관련 typecheck/build·문서 검사를 통과했다. 브라우저에서는 실패/완료 행 높이 일치, 중첩 세로 스크롤 없음과 Tab focus Tooltip의 실제 표시도 확인했다. fixture 성공은 실제 Docling 수락이 아니다.

#1342 재검토 보완: 앱의 행별 `JobObservations` 세대가 사용자 상태 재확인·중단보다 오래된 polling 성공/오류를 모두 무시한다. 사용자 작업 응답 대기 중에는 같은 행의 polling을 보류하고 이후 다시 관찰한다. Host 작업은 직렬화하지 않으며 기존 공용 Plugin jobs에도 같은 보호를 적용한다. 제어 Promise 단위 회귀에서 관찰 보류 → 중단 접수 반영 → 오래된 성공/오류 도착 → 중단 상태 유지와 새 관찰 재개를 검증한다. 고정 대기나 브라우저 fault 시나리오는 추가하지 않는다.

작업 섹션 제목은 ‘작업’이며 실패·불확실 안내는 행의 Info 아이콘 Tooltip으로 표시한다. 키보드 focus로 같은 안내를 연다. 결과 열기는 ghost/sm ‘열기’와 파일 이름을 포함한 접근성 이름을 쓴다. 파일 선택과 표는 내용 높이대로 펼쳐 페이지가 세로 스크롤을 소유하고 표에는 내부 가로 스크롤만 둔다. 즐겨찾기 영역은 #1341에서 제거했다.

### Jira 커뮤니티 0.0.4 읽기 사례 (#1350, #1362)

저장소의 community-plugins/jira는 독립 배포 전 임시 커뮤니티 artifact다. JQL 검색 v1과 같은 경로 위의 간편 검색 issues v4(프로젝트·보고자·기간 기준·시작/종료일) 두 기본 뷰와 기본 7열은 기존 InputForm/Table 계약을 사용한다. 추가 후보 필드는 공개 행 스키마·데이터로 유지하고 표시 columns에서 제외한다. detail v1은 host read·assistant 작업으로 설명과 최근 생성 댓글 최대 10개, 키·URL·조회 시각·댓글 전체 수/반환 범위·본문 잘림을 반환한다. CLI operation invoke와 비서는 같은 operation을 사용하며 별도 상세 화면·Jira 쓰기·SDK 확장은 없다. 검색은 필요한 fields만 페이지당 최대 500건씩 순차 요청하고 서버의 실제 반환 건수로 진행한다. 전체 8초·최대 500행·Host 10초 RPC 예산은 유지한다. Created·Updated·댓글·조회 시각은 Host PC 현지 `YY-MM-DD HH:mm`, dueDate는 `YY-MM-DD`다. 상한·오류·정렬 한계·검증 경계의 상세 계약은 [Jira README](../../community-plugins/jira/README.md#005-검색과-상세-계약)를 따른다.

#1395 수동 시각 검토: [1440px 변경 전](assets/plugin-file-jobs-1395/before-1440.png) / [변경 후](assets/plugin-file-jobs-1395/after-1440.png), [한국어 다크 640px 변경 전](assets/plugin-file-jobs-1395/before-640.png) / [변경 후](assets/plugin-file-jobs-1395/after-640.png). 같은 fixture·완료/중단/불확실 상태의 화면에서 입력 면 구분·정렬·줄바꿈·표 내부 스크롤을 확인했다. 경로와 계정은 마스킹했다. K1 16개, plugin-jobs와 HTTP 복구 2개(약 1.6분), 대표 layout-rules/quiet-document 2개, typecheck·CLI/Editor build·문서 검사를 통과했다. 추가 UI 단언은 기존 시나리오의 빈 상태·키보드 안내·형식 선택지·파일 수·시작 이름을 보호하며 별도 subprocess나 전수 조합을 추가하지 않았다. 실제 Docling 변환 품질은 미검증이다.


## Plugin image icon (#1346)

Optional manifest `icon` (SDK 0.3.0) names one artifact-relative PNG or SVG file, using slash-separated filename segments. URLs, absolute/traversal paths, links and other formats are refused at validation/registration. The icon is limited to 64 KiB and positive dimensions at most 256 x 256 pixels; SVG requires explicit numeric pixel width/height and the SVG namespace (no DTD). These bounds allow small high-density icons for the existing 16px controls without accepting document-sized assets. Existing PNG container validation and an XML parser validate the format; SVG is never inserted as markup.

The entire artifact, including the icon, contributes to its content digest. GET `/api/plugins/icon?id=<plugin>&digest=<digest>` serves only the declared file of a registered artifact whose registration is trusted (including unchanged digest verification for official supply). It returns fixed image/png or image/svg+xml, nosniff and no-store; Content-Disposition attachment prevents standalone SVG document navigation. No arbitrary file path is accepted. An icon request must match the current artifact digest. Community updates retain registration trust; removed or replaced registrations require trust again. Invalid images and stale digest requests remain rejected.

Explorer folder decorations, default folder suggestions, sidebar plugin entries, plugin screen tabs and Settings plugin rows share the bundled PluginIcon component (decorative 16px img, contained aspect ratio). It fetches using the owning Host client and revokes its blob URL on replacement/unmount. Local and remote Hosts use the same path; the application CSP is unchanged (existing blob: img-src). SVG scripts cannot execute in img context. Missing/unavailable icons retain screens[].icon / existing defaults; plugin settings rows without images retain their existing name layout. DocumentTabs, existing sidebar entry and plugin-heading flex layout/tokens are reused; no new common interaction or exception. External plugin artwork and Docling/Jira adoption are outside this change; tests use original synthetic fixture art.

Visual evidence: [screen 1440](assets/plugin-icon-1346/screen-1440.png), [settings 1440](assets/plugin-icon-1346/settings-1440.png), [screen Korean dark 640](assets/plugin-icon-1346/screen-640-ko-dark.png), [settings Korean dark 640](assets/plugin-icon-1346/settings-640-ko-dark.png). Host identity is masked; no real external service is involved.


## 입력 후보 (#1352, SDK 0.3.0)

조회 operation은 `inputSuggestions: { person: "people" }`로 각 입력 필드의 후보 작업 ID를
선언할 수 있다. 필드는 해당 operation inputSchema의 공개 자유 문자열이며 query form의
TextInput에서 사용한다. 후보 작업은 같은 manifest에 등록한 독립 host read operation이다.
job/review 작업은 사용할 수 없다. SDK 버전은 beta.9와 함께 공개하는 0.3.0을 유지한다.

후보 작업 입력은 `{query: string}`, 결과는 `[{value: string, label: string}]`이다.
최대 32개이며 value는 중복 없는 1~512자의 한 줄 문자열, label은 1~512자다.
Host는 기존 input/output schema 검사와 secret 정리를 수행한 뒤 고정 결과 형식을 검사한다.
SDK `inputSuggestionResultsSchema`를 공개한다. 결과 오류는 operation failure로 반환한다.
CLI `operation invoke <pluginId>.people --input <query.json> --host <origin> --json`도 같은 작업과
receipt를 사용한다. 앱의 `/api/plugins` `action:"suggest"`는 현재 선언된 후보 read와 version이 일치할 때만 허용한다.
따라서 catalog를 읽은 뒤 reload로 선언이 바뀌어도 임의 write를 실행하지 않는다.

Host catalog는 조회 작업에 필드별 완전 이름·version `inputSuggestions`를 제공한다.
앱은 2글자 이상 입력 후 250ms 멈췄을 때 해당 Host에 요청한다. 조합 중 요청하지 않으며
한글 조합 종료 값을 사용한다. 입력 변경·Host 교체·필드 해제는 이전 요청을 취소하고 늦은
응답을 버린다. 실패·빈 결과는 후보만 비우며 자유 입력과 본 조회를 막지 않는다.
키보드/포인터 선택과 popup 동작은 앱 번들의 Base UI Autocomplete가 소유한다.
선택 시 label을 보여 주는 목록에서 value를 입력한다. 후보 상태는 필드 수명에만 존재하고
view 정의·문서·설정에 저장하지 않는다. Jira 필드 적용과 실제 Jira 연결 검증은 후속 범위다.

검사: SDK manifest 검사는 공개 필드·같은 플러그인 read·SDK 범위를 보호한다. 기존 plugins
Host 검사에 후보 전용 admission, generic invoke 결과와 고정 결과 거부를 보완한다.
단일 fixture 플러그인을 실제 기존 하위 프로세스 경로로 실행하는 이유는 schema 검사 뒤
secret 정리와 공개 결과 검증의 연결을 확인하기 위해서다. 기존 ui-gallery browser 시나리오는
QueryInputs fixture로 선택·자유 입력·실패·지연 응답·한글 조합을 확인한다. 조합 이벤트만
IME를 모사하며 나머지는 일반 입력·클릭을 사용한다. 전수 조합이나 실제 AI 호출은 없다.


시각 검토는 같은 fixture에서 후보 바인딩을 끈 기존 Input과 후보를 켠 상태를 비교했다.
1440px Light [이전](assets/input-suggestions-1352/before-1440.png) /
[이후](assets/input-suggestions-1352/after-1440.png), 640px Korean Dark
[이전](assets/input-suggestions-1352/before-640.png) /
[이후](assets/input-suggestions-1352/after-640.png).
입력·지우기 버튼의 세로 정렬, 내부 여백, popup 폭·잘림과 한국어 표시·다크 대비를 직접
확인했다. 기존 Input/SettingsSelect 폼과 동일한 control 크기를 사용한다. 캡처는 수동
검토용이며 자동 검사의 판정 근거가 아니다. 전체 제품 화면·원격 Host·실제 Jira 수락을
뜻하지 않는다. browser 대표 시나리오는 로컬 48초에 완료했다.

### 공통 조회 입력 안내 (#1370)

beta.9와 함께 공개하는 SDK 0.3.0의 `inputHints`는 조회 operation의 공개 자유 문자열 입력을 같은 플러그인의 독립 host read 작업에 연결한다. 빈 객체 입력, `{text}` 출력(1–512자), 현재 version·trust·secret 정리·공용 CLI invoke를 사용한다. 입력값을 채우거나 조회를 실행하지 않는다. 상세는 [플러그인 화면 계약](plugin-screens-v1.md#collapsible-query-inputs-and-dynamic-guidance-1370)을 따른다.

## Generated document correction and regeneration (#1364)

`native-document` jobs may declare `generatedDocument:<operation-id>` on SDK 0.3.0. This Host read provider prepares results, without plugin write authority. The common generated document dispatcher is its only invocation path. It receives Host-admitted file paths and mode `read`, `patch`, or `build`. Read/patch return `{record:object,items:object[]}`; record/item semantics belong to the plugin. Patch also receives ordered opaque patches and a Host-created resultFile `{path,maxBytes}`. It prepares the entire candidate file there, never writes the source. Build returns the existing `{authoring,images}` request. Host does not interpret source suffixes, archive entries, corrections, or original hashes. Word import/OCR and HTML import can use the same contracts.

Host owns Root admission, plugin trust/lifetime revalidation, request receipts, source/document admission locks and official publication. Opaque replacements reuse file-commit streaming with revision checks before copying and immediately before rename; the staging inode is never published. Other uses include plugin-owned import bundles and non-document caches. Regeneration reuses K1 Core authoring/image storage, then revision-checked replacement. CSV reports and imported Word documents can use it. Existing file-commit check and rename remain separate operations, not cross-process atomic compare-and-swap.

The source-format state stays in the plugin-owned source file. Host stores only `{plugin,job,source,generatedFrom,generatedRevision}` connections under its `generated-documents.json.d` settings directory, indexed by the filesystem-reported canonical document path identity (Windows native real paths, matching the RootAccess boundary; no JavaScript Unicode case folding). It places no sidecars in the document folder or metadata in Markdown. Atomic Save keeps this logical identity. App reset includes these connections. K1 generation creates a connection; explicit open reconstructs it when only the source is handed to another Host. Moving/renaming a document can disconnect its warning; automatic relocation/retention cleanup is not implemented. A connection warns, without locking Save. Another use is warning before editing a periodically refreshed data report.

`POST /api/reviews` actions `generated-open/read/patch/regenerate/status` are also exposed by `litzio review open|read|patch|regenerate|status --input <json> --host <origin> --json`. read takes `{root,document}`; open also takes plugin/job/source, requestId and baseline. patch takes baseline, requestId and opaque patches; regenerate takes baseline/requestId; status takes requestId only. Baseline is `{sourceRevision,documentRevision,linkRevision}` (SHA-256; absent document/Host connection are null). Source is Root-relative for open and stored relative to the document afterward.

Patch publishes the source first, then builds/replaces the document and updates the connection. correctionsSaved/documentRegenerated distinguish each stage. If regeneration fails after saving corrections, state is regeneration-required and edits remain durable; explicit regenerate uses read's new baseline. read reports generated, regeneration-required or externally-modified by comparing the current revisions with the last generated revisions. An explicitly refreshed baseline admits regeneration over direct edits; stale baselines and changes during the request are refused. Receipts live for the daemon lifetime; status returns unknown after restart. Never replay edits automatically after a lost response; read the source state instead. Pages/progress/approval, comparison and correction forms are outside this step.

Editor uses the existing warning Notice with a keyboard/hover Tooltip for the overwrite explanation; CLI semantic edits print the warning on stderr and keep JSON stdout valid. No new dialog, editor engine or document syntax is introduced. Regeneration always replaces the explicitly connected document path; it never calls K1's collision-name allocator or creates a -N copy.

#1364 검증: 원본 불변·수정 의미는 기존 Docling converter 검사에서, opaque revision 교체는 file-commit 검사에서, source-first 저장·충돌·실패 분리·재시작은 subprocess 없는 generated-documents Host 검사에서 확인한다. 기존 CLI suite에 직접 편집 경고/저장/JSON preview를 보완하고, 기존 http-plugins에 실제 SDK artifact→공식 저장→CLI 수정→Editor Reload 및 직접 Save 경고를 연결했다. 별도 subprocess fixture·서버나 timeout/retry 증가는 없다. 기존 CLI subprocess 경로의 read/patch 두 호출은 dispatcher 연결과 실제 실행 파일 JSON 경계를 확인한다. 새 Host 검사는 약 0.6초, 관련 Host/K1/이미지/Vite 82개는 약 49초다. 실제 docling-serve 1.32.0의 작은 PDF로 네 수정·Host 재시작·단일 .docling 인계와 원본 PDF/JSON byte/hash 보존을 별도로 확인했다. 긴 문서의 지연·품질과 다른 PC/OS의 실제 인계는 미검증이다.

공통 UI 선택은 Notice warning과 Tooltip이며 별도 표면·control 예외는 없다. [1440px 이전](assets/docling-review-1364/before-1440.png) / [이후](assets/docling-review-1364/after-1440.png), [한국어 dark 640px 이전](assets/docling-review-1364/before-640.png) / [이후](assets/docling-review-1364/after-640.png), keyboard focus 상세 [1440px](assets/docling-review-1364/detail-1440.png) / [640px](assets/docling-review-1364/detail-640.png)는 같은 생성 내용을 관리 표시 유무로 비교한 수동 시각 근거다. 경고의 여백·정렬·잘림·한국어·다크·스크롤바와 PluginSettings의 같은 span Tooltip 패턴을 확인했다. Host 계정 표시는 마스킹했다.

Windows identity regression (#1387 review): NTFS-distinct ASCII k and U+212A KELVIN SIGN names must not share a connection or an admission lock. The Host test reproduced the pre-fix collision, then verifies rejection of read/regenerate through the unconnected file, preservation of its bytes, independent concurrent reads, ordinary Windows case aliases and identity retention after atomic Save. This filesystem-level check adds no subprocess or browser scenario. For an absent destination, admission conservatively serializes creation within its actual parent until the filesystem supplies the leaf spelling.

Official replacement also resolves Windows targets using native realpath, retaining the existing on-disk filename spelling when a case alias is saved. This avoids generating a new connection identity on Save and avoids a separate NTFS Unicode conversion table or post-commit metadata migration. The Windows regression saves both ASCII and Kelvin-sign names through case aliases, then verifies Reload/read/regenerate and the warning. Explicit file renames retain the documented connection limitation.

## 플러그인 조회 표 열과 결과 범위 (#1351)

beta.9와 함께 공개하는 SDK `0.3.0`의 read `rowSchema` 필드에 선택적 `hidden:boolean`을 제공한다. `true`는 기본 숨김 후보, `false`는 기본 표시다. 생략하면 manifest의 해당 Table.columns 기본 표시를 유지한다. 이 선언은 `requiresSdk`가 실제 지원하는 0.3.0 계약을 허용해야 한다. secret 필드는 계속 공개하지 않는다. 기본 숨김은 접근 권한이 아니며 공개 행 데이터는 CLI에도 포함된다.

rowSchema 작업은 기존 행 배열 또는 `{rows, truncated, total?}`를 반환한다. 플러그인의 `outputSchema`도 실제 반환 형태를 선언해야 한다. SDK의 `OperationRowResult` 타입과 `operationRowResultSchema`를 제공하며 Host 공용 반환 경계에서 행 제한·공개 필드·잘림 정보를 검증한다. truncated는 필수 boolean, total은 선택적 0 이상의 safe integer다. total을 알면 반환 행 수 이상이어야 하며 truncated=true면 더 크고 false면 같아야 한다. 배열은 범위 정보 미제공이며 전체 결과라고 보증하지 않는다. 별도 paging·재조회 API는 추가하지 않는다.

`operation invoke` CLI는 같은 envelope를 result에 보존한다. 조회 Host/`view run --json`은 표의 가공된 rows와 별도로 `coverage:{truncated,total?,returned}`를 제공한다. returned는 원본 반환 행 수로 필터·집계·limit 전 수다. 기존 2,000행 상한은 유지하며 이를 넘는 결과를 Host가 조용히 잘라 주지 않는다.

Editor의 플러그인 비집계 조회 표는 표시·숨김 여부와 관계없이 manifest의 공개 rowSchema 선언 순서로 열 후보를 제공하고 기본 hidden 및 Table.columns 선언을 따른다. 표의 기본 열 순서는 Table.columns를 유지하고 추가 열은 rowSchema 순서로 뒤에 붙인다. 메뉴는 체크 상태나 표 순서와 관계없이 rowSchema 선언 순서를 유지한다. 열 선택은 브라우저 UI preference로 Host·플러그인·화면·표별 저장하며 화면 없는 조회는 operation을 사용한다. 문서·Host·플러그인 설정에 쓰지 않는다. 재조회와 재열기에서 선택을 유지하고 없어진 필드는 무시한다. 모든 열을 숨기면 열 선택 행동을 유지한다. 저장 실패는 화면 경고로 알린다. 집계 표는 파생 group/value 의미를 유지한다.

조회 시각은 기존 receipt에 표시하고 잘린 결과는 기존 표 위 건수 줄에 `표시 행 / 조회 행 · 전체 M건` 또는 `표시 행 / 조회 행 · 일부만 표시`로 합쳐 알린다. 잘리지 않으면 기존 건수 표시를 유지한다. 상세 설명은 hover/키보드 focus Tooltip에 둔다. 기존 Button ghost/sm·DropdownMenu·Base UI Menu.CheckboxItem·MENU_ITEM_CLASS·Tooltip·DataTable을 재사용하며 새 공통 상호작용 예외는 없다. Jira 적용은 별도 작업이며 이번 검증은 fixture다.

검증은 기존 SDK manifest 검사(기능 버전), plugins 반환 경계 검사(범위 정합·secret 제거), views의 기존 실제 child·HTTP·CLI parity 검사(coverage 전달)를 보완한다. 새 subprocess는 없다. `plugin-columns` 브라우저 시나리오는 로컬 fixture catalog/result로 기본·추가 열, 재열기 지속, 전체 수 미제공을 검사하며 UI 배선 결함을 담당한다. 실행 소비자는 기존 browser stable suite다. 실제 Jira 연결·대규모 데이터 수락 증거는 아니다.

수동 시각 검토: 1440px [이전](assets/plugin-table-1351/before-1440.png) / [이후](assets/plugin-table-1351/after-1440.png), 한국어 다크 640px [이전](assets/plugin-table-1351/before-640.png) / [이후](assets/plugin-table-1351/after-640.png), 열 선택 메뉴 [1440px](assets/plugin-table-1351/menu-1440.png) / [640px](assets/plugin-table-1351/menu-640.png). 동일 fixture이며 계정 표시는 단색으로 가렸다. 기존 표 내부 가로 스크롤, 행 정렬·여백·한국어 줄바꿈·메뉴 가용 영역을 확인했다. 기존 메뉴와 Button·Tooltip 공통 구현을 사용하며 예외는 없다. 해당 시나리오는 로컬 약 24초(캡처 포함)다.

#1351 캡처 재검토: fixture rowSchema가 Reporter를 첫 번째로 선언해 메뉴 맨 위에 나타났다. fixture를 Key·Title·Status·Reporter·Priority 순서로 바로잡고, 체크 변경 전후에도 선언 순서가 유지되는지 기존 browser 시나리오에서 검사한다. 제품 renderer에 표시·숨김별 정렬을 추가하지 않는다. 잘림 정보는 DataTable의 기존 건수 상태 줄 한 곳에 합치며 전체 수 제공/미제공·잘리지 않은 결과와 중복 없는 표시를 검사한다. 기존 Tooltip·표 부품을 재사용하며 새 상호작용 예외는 없다. 동일 시나리오의 1440px·한국어 다크 640px 캡처를 갱신했다.

최신 master의 Jira 0.0.3과 결합한 Windows CI에서 표가 Table.columns 대신 rowSchema 순서로 배치되는 회귀를 확인했다. 메뉴 순서는 유지하면서 기본 표 열 순서를 보존하도록 수정했다. 두 선언 순서가 다른 대표 fixture에서 수정 전 실패·수정 후 통과를 확인했고, 기존 Windows `http-plugins`(실제 Jira artifact와 로컬 mock)와 HTTP 복구 검사도 2개 통과했다(약 2.2분). 단언·timeout·재시도 기준은 변경하지 않았다. Jira 소스는 master 병합 외에 수정하지 않았다.

#1357 병합 뒤의 현재 화면에서는 Favorites·생성·통계·차트를 제공하지 않는다. 열 선택 저장은 브라우저 UI preference만 사용하며 저장 뷰 파일과 무관하다. Host/CLI coverage 전달 검사는 제거된 저장 뷰 API를 복원하지 않고 현재 query-only 경로의 기존 fixture를 보완한다. 입력 자동완성·등록 단위 신뢰 계약도 유지한다. 갱신된 1440px·한국어 다크 640px after/menu 캡처는 Favorites가 없는 현재 화면이다.

## 연결 설정 피드백 (#1396, SDK 0.4.0)

secret 선언은 `{id,title,description?,scope:"connection",required}`다. `title`은 필수 사용자 표시 이름,
`description`은 일반 설정과 같은 Tooltip 안내다. secret ID는 화면에 표시하지 않는다.
이 선언은 SDK 0.4.0 이상을 requiresSdk 범위에 포함해야 한다. 과거 title 없는 manifest 호환은 제공하지 않는다.

일반 설정은 포커스 이탈 자동 저장, boolean은 변경 즉시 저장하며 칸 가까이에 저장 중·저장됨·실패를 표시한다.
Dialog가 초안·칸별 상태를 소유하고 Host가 저장값을 소유한다. 기존 Host의 SDK schema validator 결과와 저장 작업을
사용하며 FieldError·aria-invalid·aria-describedby로 오류를 연결한다. 실패 시 입력을 보존한다. 저장값을 재조회하면 편집하지 않은 칸은 갱신하되 편집 중·저장 실패 초안은 유지한다.
같은 Dialog의 저장은 순차 처리해 앞선 저장값을 포함한다. 연결 확인은 진행 중 저장을 기다리며
저장 실패가 남아 있으면 실행하지 않는다. 저장된 설정을 쓴다는 안내는 hover·keyboard focus Tooltip으로 제공한다.
secret 명시 저장은 유지한다. UI·CLI plugins settings·비서 manage_plugins는 기존 공용 Host 상태를 공유한다.

기존 Dialog·Input·SettingsSwitch·FieldError·Tooltip·상태 글자 스타일을 재사용한다. 새 표면·공통 상호작용 예외는 없다.

시각 검토: [1440 이전](assets/plugin-connection-1396/before-1440.png) /
[이후](assets/plugin-connection-1396/after-1440.png),
[640 한국어 다크 이전](assets/plugin-connection-1396/before-640.png) /
[이후](assets/plugin-connection-1396/after-640.png).
같은 SDK 0.4.0 Host fixture에 이전 UI만 적용한 비교이며 외부 서비스·실제 secret 성공 근거가 아니다.
QueryInputs의 필드 오류 연결과 기존 SettingsSwitch 행 정렬을 대조하고 여백·잘림·한국어 줄바꿈을 확인했다.
기존 vite-plugins 브라우저 검사에 저장 거부/입력 보존·확인 차단과 보류 저장 완료 후 확인을 추가했다.
이 결함은 blur/click 및 React 갱신 순서가 있어 브라우저가 주 검증 계층이다. 기존 CI 경로를 쓰며 새 subprocess는 없다.
SDK 필수 title·기능 버전 검사는 manifest 단위 검사가 담당한다.

production CSP는 유지하며 설정 검증은 Host에서 수행한다. 브라우저에서 코드 생성 validator를 실행하지 않는다.

## PDF 원본 대조와 확인 기록 (#1408, SDK 0.4.0)

미공개 SDK 0.4.0에 함께 포함한다. native-document job은 `generatedDocument`와 같은 플러그인의 review ID인 `comparison`을 선언할 수 있다. 둘과 review read binding 및 최소 SDK를 entry 전에 검사한다. 완료 result의 `comparison:{root,document}`만으로 앱이 공통 ‘원본 대조’ 결과 행동을 제공한다. 플러그인 이름 분기나 플러그인 UI 코드는 없다.

`review compare --input <file> --host <origin> --json`과 `POST /api/reviews`의 `generated-compare`는 `{root,document,pageNo?}`를 받는다. Host 연결의 마지막 생성 revision·source revision과 현재 저장 파일이 일치할 때만 연다. Host가 보관한 최종 authoring inputs/targets를 provider의 `mode:compare`에 result(path/revision/inputs), generation, sourceRevision, pageNo와 Host 소유 PNG staging 파일로 전달한다. comparison을 선언한 provider의 모든 mode에는 Host가 전후 검증하는 sourceRevision도 전달한다(SDK 0.4.0). provider는 이를 키로 활성화 수명의 검증된 원본·대응을 재사용할 수 있다. provider는 같은 변환 경로로 원본 항목 대응을 계산하고 기존 `completedReviewSchema`의 pages/images/mapping을 반환한다. 선택한 페이지 이미지 하나를 지정 staging에 닫아 쓰며 SHA-256과 16MiB 제한을 적용한다. Host는 검증한 PNG 바이트를 메모리에 보유해 snapshot `imageUrl`로 일시 제공한다. Root 상대 이미지를 사용하는 기존 완료 review와 같은 발행·Core block path·PNG 컨테이너/픽셀 검증을 거친다. 공용 review의 PDF schema나 PDF renderer는 추가하지 않는다. Docling은 변환 시 페이지 PNG를 원본 JSON 안에 포함하고, 화면 진입은 서버 호출·PDF 재렌더링 없이 기존 이미지·bbox를 사용한다. 좌표는 Docling page.size의 pt/TOPLEFT로 정규화해 이미지 크기에 비례 배치한다.

snapshot에 regionPages(영역 ID→페이지), generatedBaseline과 progress(checkedPages/lastPage)를 함께 반환한다. 최초 진입은 lastPage를 사용한다. 문서 블록 선택은 대응 영역이 있는 페이지로 이동한다. 없는 대응은 없는 것으로 표시한다. 오른쪽은 기존 DocumentEditor readOnly preview의 저장된 문서이며 열린 편집 탭의 draft를 참조하지 않는다. 선택 전·페이지 읽기·저장·다시 읽기에서 현재 baseline을 검사하고 불일치나 저장 실패 뒤 대응/확인 행동을 막는다. 다시 읽은 새 generation만 탐색한다. K4 제안/승인 부품은 이 대조 layout에 넣지 않는다.

`review progress --input <file> --host <origin> --json`은 같은 dispatcher의 `generated-progress`다. 입력은 root/document, read/compare가 반환한 generatedBaseline을 baseline으로, UUID requestId와 `progress:{checkedPages:number[],lastPage:number|null}`다. provider의 `mode:progress`는 기록만 변경한 전체 source를 Host staging 파일에 쓴다. Host는 source/document/link baseline을 재검사하고 공식 전체 파일 교체 후 연결의 generatedFrom만 갱신한다. 문서와 final targets를 재생성하지 않는다. 화면은 확인 저장을 접수 순서대로 처리하며 저장 완료를 기다리지 않고 다음 페이지를 읽는다. 저장 중에는 상태를 표시하고 대응 선택을 막는다. 대조 탭 닫기·창 unload·Desktop 재시작은 기존 작업 중 보호를 재사용해 대기 중 기록을 취소하지 않는다. Host는 progress 교체를 준비하는 동안 이전의 일관된 baseline으로 읽기를 허용하고, 실제 교체 전에 그 읽기가 끝날 때까지 기다린다. 교체 중 새 읽기는 새 baseline을 기다린다. 수정·재생성 등 다른 쓰기의 배타성은 유지한다. 결과는 progressSaved/baseline/receipt이고 실패는 명시적으로 반환한다. 응답 유실은 같은 generated-status를 읽고 자동 재전송하지 않는다. source 교체 후 연결 저장 실패는 progressSaved와 regeneration-required를 돌려준다. 문서 재생성은 기존 regenerate 작업이다.

최종 inputs는 Host 연결 자료에 보관되며 최대 4MiB다. 검수 기록은 source 파일에만 있다. source 하나를 옮겨 기존 generated-open/새 K1 생성을 수행하면 새 연결/출력 revision과 대응을 얻고 확인 위치를 이어간다. 이전 `.docling` 파일의 호환은 지원 범위가 아니다. 이전 review의 PNG 계약과 K4 변경 경계는 유지한다.

### #1408 검증·화면 근거

기존 SDK manifest 검사에 comparison의 최소 버전·기여 누락 거부를 보완했다. 기존 generated-documents 검사는 문서/수정 목록을 건드리지 않는 진행 저장, 이전 baseline·저장 중 외부 변경 거부와 같은 requestId status를 확인한다. 기존 reviews 검사는 staged PNG hash·Root 상대 자료·stale 거부와 K4 bundle 보존을 확인한다. 기존 generated-documents 검사에 느린 진행 저장과 동시에 읽는 경우의 publication 순서를 보완했다. 서로 다른 결함은 저장 지연이 탐색을 막거나 서로 다른 revision의 snapshot을 섞는 것이며, 주 검증 계층은 subprocess 없는 Host 작업이다. Docling 낮은 계층은 좌표 원점 변환·없는 targets·진행 범위·중복 거부와 원본 PDF/JSON/manifest의 byte 보존을 보호한다. 새 subprocess·suite·전수 조합은 추가하지 않았다.

기존 http-plugins의 대표 경로에서 공개 SDK→K1→완료 행동→기존 PNG 이미지→양방향 선택과 다른 페이지 reveal→확인 저장→CLI compare→탭 재진입의 연결을 검사했다(HTTP 복구 포함 2개, 약 2.4분). focus/selection이 한 클릭에서 연속 발생해도 같은 baseline 검증을 공유하고 최신 선택을 유지한다. 합성 PDF/Docling JSON fixture의 연결 검증이며 변환 정확도 증거가 아니다. 기존 review-v5, layout-rules·quiet-document도 통과했다. Host/review/플러그인 대상 45개, SDK 11개, CLI remote-host 6개와 typecheck·CLI/Editor production build·docs/diff 검사를 통과했다.

초기 보조 검토는 `fixtures/create-acceptance.py`의 한 페이지 PDF를 실제 docling-serve 1.32.0으로 변환해 수행했다. 최종 수락·표시 방식 비교는 아래의 보관 NIST 11쪽/합성 1쪽을 사용했다. 원본 대조·확인 저장과 최소 640px 페이지 가로 넘침 부재를 확인했다. 컨테이너는 중지했으며 다른 컨테이너를 조작하지 않았다. 코드/수식 인식 품질·원본과의 의미 동등성은 보증하지 않는다. 서버 지연은 자동 회귀에 넣지 않았다.

`LITZIO_DOCLING_REAL_ARCHIVE`와 `LITZIO_DOCLING_COMPARE_CAPTURE=1`, `LITZIO_DOCLING_COMPARE_PAGE=5`를 지정해 `pnpm browser:test http-plugins --screenshots`로 재현한다. Before는 같은 현재 Host·입력·완료 상태에서 origin/master `8cf7ef27`의 PluginJobs 결과 행동만 복원한 production UI다(`LITZIO_DOCLING_COMPARE_BEFORE=1`). 이전에는 대조 진입 자체가 없으므로 완료 작업 행을, After는 새 대조에 진입해 확인한 상태를 촬영했다. 최종 전후 캡처는 같은 NIST 입력·완료 작업을 사용한다. 1440×1000 Light/English와 640×1000 Dark/Korean, 동일 checkout의 persistent Chrome·100% zoom이며 계정/절대 경로는 가렸다. 기존 Button/Notice/Read/PageSurface와 내부 스크롤을 사용하며, 640px의 문서 최소 폭 440px는 기존 두 Editor 그룹과 같은 기준이다. 한 글자 줄바꿈·행 정렬·여백·다크 대비와 패널 내부 스크롤을 검토했다. 소유자 시각 승인을 대신하지 않는다.

| 화면 | 변경 전 | 변경 후 |
| --- | --- | --- |
| 1440px | [Before](assets/docling-1408/before-1440.png) | [After](assets/docling-1408/after-1440.png) |
| 한국어 Dark 640px | [Before](assets/docling-1408/before-640.png) | [After](assets/docling-1408/after-640.png) |
### #1408 표시 방식·규모 측정

보관 fixture의 NIST SP 1108r4 발췌 11쪽(원본 4,768,831B)과 보충 합성 1쪽(2,650B)을 현재 고정 프로필과 실제 docling-serve 1.32.0으로 변환했다. 과거 document.md/산출물은 계약으로 쓰지 않았으며 PDF/큰 산출물을 추가 커밋하지 않았다. 합성 PDF는 영어 구조·URL 등의 보충 사례로, 한국어 UI 검증과는 다르다. 컨테이너는 이 이름 하나만 start/stop했고 종료 후 stop했다.

아래는 최적화 전 비교 시제품의 실측이다. Windows persistent Chrome, 1440×1100, 완료 결과 행동 클릭→이미지 decode/canvas paint와 두 animation frame까지 다섯 번 측정했다. 전환은 기존의 blocking progress+compare를 포함한다. 변환은 각 1회이며 워밍업·1초 polling의 영향이 있어 A가 변환을 가속한다고 해석하지 않는다. MB는 십진수다.

| 방식 | 첫 표시 ms: NIST / 합성 (첫 1회; 5회 중앙) | 페이지 1→2 중앙 | 변환 s: NIST / 합성; .docling 크기 | 코드·계약·정확성/인계 |
|---|---|---|---|---|
| **A: 서버 페이지 PNG를 .docling에 보관 — 선택** | 1957;1909 / 445;372 | 2584ms (합성 1쪽: 미측정) | 46.16 / 7.30; 17.55MB / 334KB | 생산 코드 +311/-77, 22파일; 새 의존성 0; 기존 PNG review 재사용. 한 파일·오프라인 인계 가능. Docling 이미지와 bbox 같은 좌표계 |
| A: 열 때 Docling 서버에서 생성 | E2E 미측정 | 미측정 | 전체 프로필 재변환 원천 시간은 위 A 값; 보관 크기는 B와 같게 가능 | 서버 요청·대기 수명 추가, 서버 없는 인계 불가. 전체 재변환 대신 별도 경량 API의 시간은 미측정 |
| B: pdf.js 직접 canvas + bbox | 2486;1806 / 586;455 | 2351ms | 49.07 / 9.51; 6.95MB / 24KB | 생산 코드 +326/-74, 22파일; 새 의존성 0; PDF 자료/SDK 필드 추가. 한 파일 인계 가능. PDF crop/rotation과 Docling 좌표 일치 필요 |
| B: pdf.js→PNG→기존 img 자리 | E2E 미측정; PNG encode+decode 중앙 25.9 / 14.8ms 추가 | 미측정 | B와 동일 | 공용 PDF 전달 계약은 여전히 필요. 완성 시제품의 LOC는 미측정; 추가 PNG 변환/상태 필요 |

첫 진입과 합성 표시에서 A가 빠르고, NIST warmed 중앙의 차이는 103ms(첫 표시)·233ms(전환)였다. 차이가 작을 때 코드와 계약이 적은 안을 우선해 A를 선택했다. 시제품 B→A 전환은 생산 코드 9파일 +43/-61로, PDF 표시 helper·PDF SDK/Host 자료 경로를 버리는 비용도 포함한다. 최종 성능·비동기 저장 보완까지 포함한 생산 코드는 22파일 +421/-96다. 이 추가 비용은 A/B에 공통인 생성 문서 읽기·기록 저장 경로다. 새 의존성과 플러그인 전용 Core/Host 분기는 없다. 두 문서의 페이지는 Rotate=0, CropBox=MediaBox이고 NIST 마지막 쪽은 가로 방향이다. 회전·다른 crop 좌표계의 실측은 없다. A는 서버의 같은 페이지 크기로 bbox를 비례 표시하며 NIST 5쪽 넓은 표와 합성 표의 실제 대응을 아래 캡처에서 확인했다. 원본과의 문서 전체 의미 동등성을 뜻하지 않는다.

공통 지연 원인은 페이지마다 전체 봉투/JSON을 검증·복사하고 SDK authoring과 대응을 재계산한 뒤, 진행 저장 후 다시 compare를 호출하던 경로였다. Host가 전후 hash 검사하는 source revision별로 활성화 수명의 원본 한 개와 같은 원본 hash/patches의 authoring을 재사용하고, 패치 복사에서 불변 pages를 제외했다. 기록 재작성은 검증된 원본 PDF/JSON/manifest의 hash를 다시 확인하며 불변 항목을 그대로 pack한다. 외부 변경이면 캐시를 버리며 공식 revision 검사·전체 교체를 유지한다. NIST 동일 경로 5회에서 첫 표시 중앙 1909→960ms, 페이지 1→2 중앙 2584→1099ms였다.

200쪽 용량 시험은 NIST의 PDF 페이지와 embedded 페이지 PNG를 반복한 **합성 봉투**다. 파일은 199,842,050B, JSON 194,968,771B이며 원래 439개 항목만 첫 11쪽에 둔다. 200쪽 실제 변환·내용 품질의 증거가 아니다. 확인 한 번 저장 API는 17.001→3.134초(각 1회)였고 중간 캐시 수정은 3.468초였다. 2초를 넘으므로 UI 저장은 순차 비동기로 처리한다. 같은 200쪽 파일의 실제 브라우저에서 첫 표시 3.003초, 저장 중 다음 페이지 표시 2.708초, 확인 저장 응답 4.310초로 페이지가 먼저 표시됐다. 동시 읽기 비용 때문에 단독 API보다 저장이 길었다. 저장 상태를 보이고 실패하면 확인·대응을 막아 다시 읽게 한다. 원본·수정 목록·생성 문서는 확인 저장으로 바뀌지 않는다.

PNG 실험은 NIST의 원본 7,943,538B→무손실 optimize 4,808,043B, 72dpi 축소 2,665,556B; 합성은 232,539→133,676/88,406B였다. Pillow의 두 최적화를 합친 시간은 2.98초/0.15초이며 실제 서버 72dpi 변환 시간은 미측정이다. 좌표 비례 배치는 같지만 72dpi는 확대 시 작은 표 글자가 흐려진다. 원본 JSON/ImageRef를 재인코딩하지 않고 기존 144dpi를 유지한다. 남은 비용은 수백 MB 전체 교체와 디스크 IO다. 향후 선택지는 생성 시 낮은 images_scale의 품질 수락, 보관 전 서버 PNG 압축 개선, 또는 PDF 직접 표시를 다시 비교하는 것이며 이 PR에서 저장 형식을 재설계하지 않는다.

[측정 원자료](assets/docling-1408/measurements.json)에는 반복값과 미측정을 구분했다. 서버 지연·성능 측정을 CI의 고정 시간 단언으로 추가하지 않았다. 기존 Host 검사의 저장/읽기 admission·publication 순서와 기존 대표 브라우저의 저장 중 이동·닫기 보호·실패 표시를 보완하며 새 subprocess·무거운 suite는 추가하지 않는다.

[NIST 넓은 표 1440px](assets/docling-1408/after-1440.png) · [NIST 한국어 Dark 640px](assets/docling-1408/after-640.png) · [보충 합성 표 1440px](assets/docling-1408/synthetic-1440.png)

비동기 기록 저장 중 대조 탭을 닫으면 아직 전송하지 않은 기록이 취소되는 경로를 대표 브라우저에서 먼저 재현했다. 기존 작업 중 닫기·beforeunload/재시작 보호를 재사용해 수정하고 같은 경로의 닫기 시도를 보완했다. CLI에는 창 수명 동작을 추가하지 않는다.
