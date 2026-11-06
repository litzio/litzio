# 플러그인 1단계

- Status: Implemented
- Host assembly (#1246): `host-services.ts` composes independent plugin and view services and lazily initializes the assistant. Plugin management/secret routes belong to `plugin-service.ts`; views receive that same plugin runtime explicitly through `view-service.ts`. Assistant shutdown closes only its provider/conversation resources; Host shutdown closes plugins independently, including when assistant initialization or shutdown fails. Views retain no separate runtime resources. Concurrent/repeated Host close calls share one shutdown promise, including its failure. A send waiting for plugin startup rechecks assistant shutdown before provider admission. Request paths, lazy plugin start, receipts and stored formats are unchanged.
- Last verified: 2026-11-06 — V4 승인 내용 고정·snapshot baseline·K1 status 완료 fixture와 대상 회귀 검사, 전체 typecheck 확인. V5 브라우저 통합은 미검증.
- Verification #1287: 2026-11-06 — OneDrive 탐색기 자동 표시·비활성화 목록 제거의 HTTP browser fixture 검증. 실제 계정 동기화는 미검증.
- Previous verification: 2026-11-06 — #1244 플러그인별 값 마스킹·키 보존·삭제·로그 비노출과 #1245 접수/작업 수명 분리·실제 10초 초과 subprocess 회귀. 기존 검증: 2026-11-05 SDK·Host·OneDrive fixture, 제작 lifecycle·CLI·실제 Codex 두 모델 및 http-plugins 검사. 필수 CI 결과는 구현 PR에 기록한다.
- Authority: [ADR-0020](../adr/0020-plugin-architecture.md)의 소유자 1단계 개시. [ADR-0019](../adr/0019-plugin-tiers.md), [ADR-0015](../adr/0015-shared-host-operations.md), [ADR-0018](../adr/0018-desktop-remote-hosts.md)을 따른다.
- Scope: 최소 SDK, 명시적 로컬 등록·신뢰·활성화, 공용 작업·CLI·설정과 OneDrive, 비서 제작 키트. Jira와 동적 UI 스파이크는 후속이다.

2026-11-05 소유자 제작 로드맵 결정 2·5에 따라 아래 하위 프로세스·reload·관리별 승인 제거를 구현한다. 같은 결정은 ADR-0020의 비서 제작 로드맵 개정에 기록되어 있다.

## 경계와 manifest

`packages/plugin-sdk`는 React·Editor·Core AST 의존 없이 manifest, JSON Schema 검증과 공용 작업·폴더·계정 타입을 공급한다. `litzio-plugin.json`이 실행 선언이며 패키지 버전은 package.json과 일치해야 한다. ID, tier, publisher, SemVer SDK 범위, 패키지 안 entry, contributes와 settingsSchema를 import 전에 검증한다. JSON Schema는 Ajv, manifest는 Zod, 버전은 SemVer를 재사용한다. 외부 `$ref`와 알 수 없는 필드·중복 기여를 거부한다.

확장 자리 `contributes.dataViews`, `generatedUi`, `secretUses`는 비어 있지 않으면 미지원으로 등록을 거부한다. 카탈로그 V1에서 `contributes.views:[{id,title,definition}]`는 inline query v2 명세만 받고, `contributes.reviews:[{id,title,read,propose?,approve?,reject?,undo?}]`는 `{operation,version}` binding을 받는다. 같은 플러그인의 완전 이름 `<plugin-id>.<operation-id>`와 등록 version만 허용하며 view는 rowSchema 읽기, review read는 read, 나머지는 write여야 한다. unknown action·cross-plugin·effect/version 불일치는 entry 전에 거부한다. [Core/SDK v2 계약](generated-views-v1.md#catalog-v2-contract-layer-v1)을 SDK가 재노출한다. 실제 Host dispatch·기본 UI·CLI와 승인 경계 연결은 V2/V4 범위다. `secrets`는 중복 없는 id·connection scope·required 선언을 지원한다. secret 값 조회 API와 생성 UI·저장 뷰 runtime은 없다.

공용 작업은 id/version/effect/scope와 입력·결과 schema를 선언하고 같은 id의 handler를 연결한다. 1단계 기능 작업은 host scope만 지원하며 folder scope 선언은 미지원으로 거부한다. `activate(context)`는 operations/status/dispose를 반환한다. 미선언·누락 작업 handler는 활성화 실패다. 폴더 소스와 장식·계정은 선언한 기여의 상태 결과이며 앱 번들 아이콘만 표시한다. 폴더 열기는 기존 파일 Host가 검증한다. 문서 의미·공식 쓰기 경계는 변경하지 않는다.

## Host 상태와 호출

대상 daemon의 Host 설정 루트에 별도 plugins.json을 기록한다. `LITZIO_DATA_DIR` 또는 `LITZIO_PLUGINS_SETTINGS_FILE`로 격리할 수 있다. 임의 디렉터리 자동 탐색, SQLite, migration과 자동 파일 감시 reload는 없다. 로컬 artifact 안의 파일을 digest로 묶고 패키지 밖 참조를 거부한다. 공식 공급 목록은 id·publisher와 제품이 검토한 artifact digest를 대조한다. 자칭 official 또는 변경 artifact는 공식 신뢰를 얻지 않는다.

공식 번들 플러그인은 목록에 자동 표시되고 기본 상태는 공급 항목의 `defaultEnabled`(현재 `false`)를 따르며, 사용자의 명시적 선택이 우선한다. 외부 플러그인은 명시적으로 등록하고 list에서 확인한 digest를 trust한 뒤 enable한다. 사용자와 비서 모두 digest 신뢰 작업을 실행할 수 있다. 외부 artifact가 달라지면 새 digest를 trust한 뒤 reload한다. 자동 교체하지 않는다. 비활성화는 신규 호출을 먼저 차단하고 상태 기여를 숨긴 뒤 이미 접수한 호출을 drain하고 dispose한다. 설정과 열린 폴더·탭은 보존한다. 단, 아래 OneDrive 자동 표시 폴더는 탐색기 목록에서 제거하며 원본 파일과 열린 탭은 보존한다. OS 권한 격리는 보장하지 않는다.

플러그인마다 daemon의 Node 하위 프로세스 하나를 사용한다. Node IPC 채널의 요청 ID로 activate·invoke·status·dispose와 응답을 연결하며 stdout/stderr와 플러그인 예외 원문은 전달하지 않는다. 별도 bootstrap 파일 없이 번들 안의 고정 코드로 시작하므로 설치된 CLI도 같은 경로를 쓴다. 각 RPC 응답은 10초 후 실패하며 프로세스를 종료한다. 접수된 K1 백그라운드 작업 수명에는 이 제한이 적용되지 않는다. 읽기 실패는 failure, 쓰기 실패는 기존 uncertain receipt를 유지하고 자동 재전송하지 않는다.

`reload`는 신규 요청 차단 → 접수한 상태·기능 요청 drain → dispose → 프로세스 종료 확인 → 현재 artifact 재검증 → digest 신뢰 확인 → 새 프로세스 시작 순서다. daemon 재시작 없이 같은 ID의 수정 artifact를 반영한다. ID 변경과 작업 이름 충돌은 거부한다. 실패하면 비활성·오류 상태로 남고 수정·신뢰 후 다시 reload하면 회복한다. dispose 실패도 프로세스를 종료한 뒤 보고하며 다음 reload가 가능하다. 예기치 않은 하위 프로세스 종료는 실행 실패로 표시하고 자동 재시작하지 않는다.

`GET /api/plugins`는 목록, `POST /api/plugins`는 action과 해당 입력을 받는다. 관리 결과에는 목록과 requestId·operation·version·scope·outcome receipt가 있다. 기능 호출은 `action: invoke`, operation 완전 이름과 input을 받아 입력/출력 schema를 검사한다. Host 연결 실패 뒤 다른 Host나 로컬 실행으로 전환하거나 재전송하지 않는다.

CLI는 반드시 `--host <http(s) origin>`을 명시하고 daemon 프로토콜을 먼저 확인한다. JSON 결과는 대상 origin과 동일 Host 결과를 보존한다.

```text
plugins scaffold <new-absolute-directory> --id <plugin-id> --host <origin> --json
plugins validate <artifact-directory> --host <origin> --json
plugins list --host <origin> --json
plugins unregister <id> --host <origin> --json
plugins register <artifact-directory> --host <origin> --json
plugins trust <id> --digest <digest> --host <origin> --json
plugins enable|disable|reload <id> --host <origin> --json
plugins settings <id> [--file <json>] --host <origin> --json
operation invoke <pluginId.operationId> --input <json> --host <origin> --json
```

settings는 --file 없이 현재 일반 설정을 조회하며 변경은 비활성 상태에서만 받는다. 설정 UI는 기존 Settings 콘텐츠·Button·Input·SettingsSwitch·Dialog를 재사용한다. 목록은 Hosts 설정의 host-summary 행, 공통 settings-switch·Notice·Tooltip·Dialog와 HostStatus의 점/톤 스타일을 재사용한다. 이름·공급자/계층/신뢰 배지·설명을 왼쪽에 묶고 활성 토글은 같은 행 오른쪽 끝에 둔다. 상태는 지역화된 실행/감지 이름으로 표시하며 계정은 `계정: 라벨 (출처)`로 표시한다. 상단은 한 줄 경고와 상세 Tooltip이다. 목록은 공급 책임·신뢰·활성·실행과 오류를 구별하고 설명 창은 version·artifact digest를 표시한다. 비서는 별도 `manage_plugins` 도구로 같은 Host 함수를 호출한다. Codex dynamic tools에 연결하며 관리별 승인 질문 없이 실행한다. 작업·대상 ID·성공/실패를 기존 대화 도구 활동 항목과 도구 결과에 남긴다. 도구 결과는 Codex 대화 이력에서도 확인할 수 있다. 활동 기록에는 설정값·secret·artifact 예외 원문을 넣지 않는다. display 도구의 범위는 확대하지 않는다. 기존 Copilot adapter에는 새 도구 공급을 추가하지 않는다.

## OneDrive

`plugins/onedrive`는 SDK 타입과 Node API만 사용한다. `pnpm --filter @litzio/onedrive build`가 자체 실행 의존성을 포함한 artifact 디렉터리를 만든다. Host와 CLI는 OneDrive source를 import하지 않는다. 공식 artifact는 앱에 포함해 자동 표시하며 사용자가 토글로 활성화한다.

Windows 환경 변수 OneDrive/OneDriveConsumer/OneDriveCommercial과 실재 폴더를 우선한다. HKCU Software/Microsoft/OneDrive/Accounts 직하위 계정의 UserFolder를 best-effort로 보완하며 중복 경로를 합친다. 조회 실패·불완전/없는 경로 수와 출처를 보존한다. UserEmail/DisplayName이 실제 조회된 경우만 표시하고, 그 밖에는 경로 기반 중립 라벨을 쓴다. raw 레지스트리 출력은 로그에 쓰지 않는다. SyncEngines, ini, WinRT, Graph/OAuth와 동기화 엔진은 사용하지 않는다. Linux 등 다른 OS에서는 지원하지 않음을 표시한다.

폴더 감지는 로그인이나 동기화 상태의 증거가 아니다. 활성화된 OneDrive가 감지한 모든 폴더를 로컬 Explorer에 자동 표시한다. 기존 파일 Host의 폴더 검증·FolderTree를 재사용하고 기존 폴더·탭을 덮지 않는다. 자동 표시의 소유자는 앱의 폴더 상태이며 일반 열린 폴더 기억 목록에 저장하지 않는다. 비활성화하면 자동 표시한 폴더를 탐색기 목록에서 제거하며 디스크의 원본 폴더·문서와 열린 탭은 보존한다. 자동 상위 루트가 기존 수동 하위 폴더를 화면에서 합쳐 표시해도 수동 루트의 소유권·기억 목록·접힘/펼침 상태는 보존하고, 자동 루트 제거 시 수동 트리를 복원한다. 활성 상태에서 새로고침해도 일반 폴더 기억 목록으로 같은 수동 루트를 먼저 복원한다. 감지 루트 자체를 일반 폴더로 직접 추가한 뒤 비활성화하는 예외는 #1287 범위 밖이다. 앱의 플러그인 상태 조회는 가장 최근 시작한 요청의 결과·오류만 반영하고 관리 시작·구독 해제 시 이전 요청을 무효화한다. Host가 활성 상태로 생성한 응답의 전달이 비활성화 완료 뒤로 늦어져도 이전 폴더·토글을 복원하지 않는다. 수동 전후 캡처: [1440px Before](assets/onedrive-explorer-1287/before-1440.png) / [After](assets/onedrive-explorer-1287/after-1440.png), [640px 한국어 Dark Before](assets/onedrive-explorer-1287/before-640-ko-dark.png) / [After](assets/onedrive-explorer-1287/after-640-ko-dark.png). 같은 활성 상태와 격리된 두 후보를 수정 전·후 코드에서 촬영했다. 기존 FolderTree와 OneDrive 아이콘을 재사용하며 새 표면·공통 패턴 예외는 없다. 행 정렬·여백·패널 잘림과 한국어 줄바꿈을 확인했다.

장식은 정확한 루트에 번들 Microsoft Fluent UI OneDrive 로고을 사용하고 자식에게 전파하지 않는다.

## 검증 경계

SDK 검사는 manifest와 미지원 확장·외부 schema를, Host 검사는 digest 신뢰·disable drain·설정 보존·하위 프로세스 수명·reload 회복과 비서 활동 기록을 소유한다. OneDrive 검사는 주입한 환경·디렉터리·레지스트리로 단일/복수/없음/잔존을 검증하며 실제 계정에 의존하지 않는다. `pnpm browser:test http-plugins`는 격리된 production HTTP Host와 CLI·설정 UI 일치 및 OneDrive 활성화·새로고침 후 복수 폴더 자동 표시, 비활성화 후 목록 제거와 원본 폴더 보존을 확인한다. OneDrive 상태는 격리된 후보로 대체하고 실제 폴더 목록은 HTTP Host로 검증하므로 실제 계정 동기화의 증거는 아니다. 커뮤니티 fixture의 수동 폴더 보존 검사도 유지한다. `--screenshots`는 수동 검토용 1440px·640px 설정·장식 캡처를 tmp/plugin-stage1에 남긴다. 필수 CI는 기존 전체 제품 판정을 유지한다.

1단계 UI는 로컬 Host만 지원한다. 원격 HostExplorer의 폴더 후보·장식 및 원격 Plugins 설정 UI는 이번 범위에 포함하지 않는다. CLI의 명시 대상 Host 계약과 구별한다. 누락된 artifact는 해당 플러그인만 artifact 없음으로 표시하며 다른 등록은 차단하지 않는다. unregister는 신규 요청 차단·진행 상태 조회/기능 작업 drain·dispose 뒤 등록과 일반 설정을 해제하고 artifact 파일은 삭제하지 않는다. 비서 unregister도 승인 질문 없이 실행하고 활동 기록을 남긴다. 상태 조회도 drain에 포함하며 비활성화 후 늦은 조회는 이전 폴더/장식을 반환하지 않는다.

## Secret 저장과 실행 전달 (로드맵 1c)

입력은 앱 번들 Plugins 설정 Dialog의 password Input과 명시적 저장 버튼만 제공한다. 설정 변경처럼 비활성 상태에서 저장·삭제하며 입력은 전송 직후 비운다. `POST /api/plugins/secrets`는 id/name/value를 받아 configured만 반환하는 사용자 설정 전용 경계다. 비서 도구·공용 관리 schema·CLI에 값 입력/조회 작업을 공급하지 않는다. CLI는 `plugins secret-status <id>`와 `plugins secret-delete <id> <name>`에 명시적 `--host <origin> --json`을 붙인다. receipt에는 값이 없다. 목록은 supported와 선언별 configured를 반환한다. 읽기/복호화 실패는 해당 선언의 configured=false와 값 없는 일반 오류로 표시하며 다른 선언·플러그인 정보는 유지한다. 설정 UI는 이름과 사용 불가/손상 상태를 남기고, 비활성 상태에서 삭제·재입력할 수 있다. 비Windows는 지원하지 않음으로 표시하고 값 저장/필요 기능 활성화를 거부한다.

Windows PowerShell의 기본 .NET ProtectedData를 통해 DPAPI CurrentUser를 사용한다. 새 Node 네이티브 addon이나 Electron API 의존은 없다. 상수 스크립트 argv에는 값이 없고 JSON stdin/파이프로만 전달한다. 호출마다 프로세스 시작 비용이 있으므로 저장·상태 확인·활성화 시에만 사용하며 기능 작업마다 호출하지 않는다. Windows API 실패는 일반 오류로 바꾸고 평문 fallback은 없다. 비대화형 daemon의 실행 OS 계정에서 동작하며 사용자 프로필/DPAPI 접근 실패 시 사용 불가다.

암호문 파일 ACL은 부모 디렉터리에서 상속되며, 별도 ACL은 설정하지 않는다. 암호문은 해당 Host의 plugins 설정 파일 옆 `.secrets` 디렉터리에 플러그인 id·secret id 해시 파일로 원자 교체한다. 이 Host 저장 경로와 id/name을 추가 entropy로 묶으므로 Host 간 자동 동기화/복사는 지원하지 않는다. 현재 연결은 플러그인당 하나다. 여러 연결별 secret은 후속 계약이며 일반 설정에 값을 넣지 않는다. unregister는 artifact 유무와 무관하게 해당 플러그인 저장소를 지운 뒤 등록을 해제한다. 비활성화는 보존한다.

내부 `PluginSecretStore`만 read를 가지며 실행 직전 해당 manifest 선언만 읽어 `activate(context).secrets`의 읽기 전용 map에 전달한다. 이 map은 신뢰·schema 확인 뒤 프로세스를 시작할 때 해당 플러그인에만 activate IPC로 전달한다. argv·환경 변수·등록 설정에는 넣지 않는다. reload는 값을 다시 읽으며, 자식의 context.secrets는 읽기 전용 map이다. required 값이 없으면 실행을 거부한다. 하위 프로세스의 stdout/stderr를 버리고 IPC 오류는 고정 메시지만 반환하여 값이 로그로 흐르지 않게 한다. Host로 나가는 상태·결과는 해당 Host 인스턴스·플러그인의 알려진 문자열 값만 정리하며 객체 키는 보존한다. 마스킹 값은 secret 이름별로 교체하고 삭제·unregister 시 제거한다. Host stdout/stderr는 교체하지 않으며 자식 출력 폐기와 공개 결과 경계로 비노출을 유지한다. 또한 activation/operation 오류 원문은 공개하지 않는다. 신뢰 코드의 직접 파일 쓰기·직접 OS 접근·변형된 값 유출을 막는 sandbox는 아니다.

검증은 주입 저장소로 선언·범위·설정 여부·삭제·unregister·응답 비노출을 검사한다. Windows에서는 임시 디렉터리의 실제 DPAPI 암호문·재시작 조회·삭제를 검사하고 finally로 제거한다. 기존 quality/Windows Desktop unit CI의 전체 검사에 같은 Host 검사가 포함되며, HTTP CI의 양 OS는 production UI/CLI 경계를 검사한다. OS 전역 Credential Manager는 변경하지 않는다.

화면 근거: [1440 이전](assets/plugin-secrets-1075/secrets-before-1440.png) / [이후](assets/plugin-secrets-1075/secrets-1440.png), [640 이전](assets/plugin-secrets-1075/secrets-before-640.png) / [이후](assets/plugin-secrets-1075/secrets-640.png). 동일한 production 설정 Dialog에서 새 secret section만 숨긴 이전 기준과 복원한 이후를 비교한다. 실제 과거 checkout 실행 캡처는 아니다. 값은 합성 fixture이고 저장 뒤 입력이 비워진 상태다.

## Read operation row schema (#1218)

읽기 작업의 선택적 `rowSchema`는 [Generated views v1](generated-views-v1.md#operation-row-schema-1218)을 따른다. 이는 일반 읽기 작업의 출력 선언이며 `generatedUi/views` 기여나 SDK folder scope를 개방하지 않는다. Core가 타입·날짜·표시 라벨·secret 제한과 가공을 소유한다.

하위 프로세스 invoke 결과도 공용 `PluginHost.invokeOperation → publicOperationResult`에서 알려진 값 정리(`safePluginValue`)·outputSchema 검증·Core `parseOperationRows`의 타입 검증과 secret 필드 제거를 거친 뒤에만 공개한다. CLI·비서·view·즐겨찾기는 이 경로를 재사용하며 reload도 이 경계를 바꾸지 않는다. status 결과는 `safePluginValue → statusSchema`를 거친다.

## K1 파일 작업

2026-11-05 로드맵 1(e): `contributes.jobs`에 id/title, 확장자 accept(예: `.txt`), start/status/stop 작업 ID와 `resultKind: native-document`를 선언한다. 세 binding은 등록된 operation이어야 하며 start는 write다. 일반 `operation invoke`로 이 binding을 직접 실행할 수 없다. 입력·결과 JSON schema 검사는 기존 기능 호출과 동일하다. SDK `jobRequestSchema`, `jobUpdateSchema`, `JobSnapshot`이 공용 작업의 정의다.

`POST /api/plugins`의 job-start는 plugin/job/requestId(UUID)/root/file/output을 받는다. file과 output은 대상 Host Root 상대 경로다. Host의 접근 정책과 real-path Root 검사를 모두 통과해야 하며 입력은 accept와 일치하는 실제 파일이어야 한다. Desktop 파일 업로드나 로컬 fallback은 없다. 결과는 새 `.md` 문서로만 생성하며 기존 파일·입력 원본을 덮어쓰지 않는다.

Host는 실행 전에 requestId를 메모리에 기록하고 중복 start를 거부한다. running/completed/failed/stopped/uncertain, phase, 선택적 done/total, stopRequested를 유지한다. start handler는 작업을 접수하고 10초 RPC 응답 제한 안에 running을 반환한다. 긴 작업의 완료 Promise를 반환하지 않는다. requestId별 상태를 자식 프로세스에 보관하고 백그라운드 작업의 성공·실패를 status로 공개한다. 백그라운드 Promise의 rejection도 잡아 failed/errorKind로 기록한다. Host는 접수 응답을 기다린 뒤 job-start 결과를 반환하며 접수 실패는 uncertain이다. 작업 수명 자체의 Host 상한은 없다. start가 제한을 넘기면 timeout 분류와 SDK JOB_START_CONTRACT_MESSAGE 고정 제작 안내를 반환하고 자식을 종료한다. running 외 접수 결과는 failed 분류와 같은 제작 안내로 거부한다. status/stop handler는 같은 requestId/root/file/output을 받는다. handler 결과는 state/phase/progress/errorKind와 완료 시 document.source다. Host가 완료 결과의 native source를 Core 기반 공식 생성 경로로 검증·생성한 뒤에만 path/revision을 공개한다. 완료 전 document/source/부분 결과는 UI·CLI로 공개하지 않는다. 결과 문서 생성 실패도 uncertain으로 남겨 확인 없이 다시 쓰지 않는다.

job-status/job-stop/job-result는 같은 requestId만 받는다. stopRequested는 취소 요청이며 stopped와 다르다. 플러그인이 stopped를 확인할 때만 실제 중단으로 표시한다. disable/reload/종료는 신규 접수를 막고 작업에 중단을 요청한 뒤 진행 RPC를 drain하고 dispose·자식 종료를 수행한다. stop/dispose는 플러그인이 소유한 작업과 자원을 정리해야 한다. 중단 응답에서 completed/failed/stopped가 확인되면 유지하고, 미확정 running/uncertain은 unavailable 분류의 uncertain과 같은 ID 조회/no-replay 안내로 남긴다. crash도 즉시 활성 작업을 같은 uncertain으로 표시한다. reload 후 새 프로세스에 작업을 재접수하거나 복원하지 않으며 같은 ID 조회는 Host의 보존된 snapshot을 반환한다. 하위 프로세스 IPC 요청은 앞 절의 10초 제한을 따르며 초과하면 프로세스를 종료하고 관찰을 uncertain으로 남긴다. start/status/stop도 `invokeOperation → publicOperationResult`를 통해 같은 결과 검증·secret 정리를 받는다. K1 상태와 중단·관찰 처리는 plugin-service가 소유한 단일 PluginHost/PluginJobs에 둔다. host-services는 상태를 복제하지 않으며 전체 종료에서 plugin-service.close → PluginHost.close를 호출해 미확정 작업을 같은 uncertain/no-replay로 정리한다. 비서만 종료할 때는 K1 작업을 종료하지 않는다. 메모리 기록은 daemon 수명에 한정된다. 재시작 후 unknown ID는 재실행 근거가 아니다. 영속 queue/DB/scheduler는 없다.

```text
plugins start <pluginId> --input <json-file> --host <origin> --json
plugins status|stop|result <requestId> --host <origin> --json
jobs list [pluginId] --host <origin> --json
```

start 파일은 job/requestId/root/file/output을 담는다. CLI는 앱과 같은 공용 작업·receipt를 호출하며 결과가 앱 탭을 생성하지 않는다. 응답 유실 뒤 start를 재전송하지 않고 status로 같은 ID를 조회한다.

명령 센터의 Plugin jobs는 현재 문서/작업 탭 Host에 고정된 앱 번들 기본 UI다. 공통 Button/Input/Notice, 기존 뷰 페이지 레이아웃과 Host 폴더 목록을 재사용한다. 열린 대상 Host 폴더 안에서 파일을 선택하고 실행·상태·중단·완료 문서 열기를 제공한다. 결과 열기는 기존 Host-aware 문서 열기와 미저장 보호를 따른다. requestId는 내부에서 생성·관리하며 입력란으로 노출하지 않는다. Host의 `job-list`는 플러그인별 진행 중·최근 작업과 경과 시간을 daemon 메모리에서 반환한다. 작업 화면을 다시 열면 이 목록으로 진행 중 작업을 복원해 관찰하고 최근 작업을 선택할 수 있다. 브라우저 자체 요청 ID 저장소나 재입력에 의존하지 않는다. 활성 작업 화면에서만 1초 간격으로 겹치지 않게 조회하고, 숨김/탭 닫기 시 타이머와 요청을 정리한다. 화면 닫기는 실행 취소가 아니다. 연결/응답 상실은 uncertain으로 표시하며 폴링을 멈춘다. uncertain일 때만 상태 다시 확인 버튼을 보여 내부의 같은 ID로 조회한다. Host의 명확한 4xx 실행 거부는 실패와 이유를 표시하고 입력 수정을 허용한다. 연결 실패·5xx·응답 유실과 구분한다. 저장된 데이터 뷰의 자동 조회 금지 계약은 그대로다.

검증 fixture는 `apps/editor/test/fixtures/job-plugin`이다. 텍스트 파일을 세 단계 처리하고 native source를 Host에 돌려준다. FAIL/UNCERTAIN으로 시작하는 입력은 각각 실패/불확실을 재현한다. 중단 요청은 먼저 접수되고 다음 상태 조회에서 실제 stopped가 확인된다. 실제 Docling 변환·품질 증거는 아니다. 실제 11초 작업의 완료·실패·중단·reload/disable·crash 및 긴 start Promise 거부는 기본 CI의 plugin-jobs.test.ts에서 검증한다. Host 수명·중복·출력 공개·Root 경계는 `plugin-jobs.test.ts`, HTTP CLI/UI 연결·결과 열기·Stop은 `pnpm browser:test plugin-jobs`가 소유한다. 수동 캡처는 `pnpm browser:test plugin-jobs --screenshots`의 `tmp/plugin-jobs/completed-1440.png`, `completed-640.png`에 남긴다.

K1 기본 UI는 `SettingsSelect`/`SettingsInput`의 라벨·control 높이·간격과 `HostStatus`의 점·톤을 재사용한다. 상태를 지역화해 한 번만 표시하고 진행 중 phase와 경과 시간을 옆에 둔다. 취소 버튼은 실행 중에만, 접수 뒤에는 취소 요청됨, 실제 stopped 뒤에는 취소됨으로 구분한다. 상위 폴더 복귀는 하위 폴더를 탐색한 경우에만 명확한 라벨로 보인다. 공용 `components/ui/Progress`는 ARIA progressbar와 제품 surface/accent·간격 토큰을 쓰며 기본 브라우저 progress를 사용하지 않는다. 숫자 진행량과 결과 열기는 별도 간격·행으로 분리한다.

Codex 비서는 SDK `PLUGIN_JOBS` 공용 정의를 그대로 쓰는 `plugin_jobs` 도구로 start/status/stop/result/list를 호출한다. 건별 확인은 없고 기존 turn 활동 목록에 작업·성공/실패·결과를 남긴다. start/stop은 기존 대화의 쓰기 모드·열린 폴더 범위를 지키며 secret이나 공식 목록 변경 권한은 추가하지 않는다. 실제 모델 호출 없이 app-server fixture로 도구 노출·승인 없음·활동 기록을 검증한다. Copilot의 별도 dynamic-tool 공급은 이 단계에서 추가하지 않는다. `plugin-jobs.test.ts`는 Editor 기본 test 명령에 포함하며 동시 동일 ID/별도 ID 시작, 완료와 Stop 경합, daemon 재시작 뒤 unknown/no replay를 보호한다.

입력 선택은 `(Root, 상대 경로)` 쌍이다. 파일·폴더 선택은 해당 Host가 반환한 자식 이름으로 상대 경로를 구성하며 절대 경로 문자열을 잘라 재해석하지 않는다. Root 선택이나 최근 작업 이동으로 Root가 바뀌면 파일·탐색 폴더·이전 목록을 초기화하며, 새 Root에서 명시적으로 다시 선택하기 전에는 실행하지 않는다. 같은 이름의 파일이 다른 Root에 존재해도 자동 재바인딩하지 않는다.


## Host 제공 SDK 런타임 (#1271)

`@litzio/plugin-sdk`는 npm 게시·tarball 배포하지 않는다. Host가 실행 시점에 제공하며 플러그인 단독 실행은 지원하지 않는다. SDK 버전은 Host에 묶인다. manifest의 `requiresSdk`가 Host `SDK_VERSION`을 허용하지 않으면 기존 SDK/protocol 불일치 거부 정책에 따라 validate·등록·활성화를 거부한다. 자식은 로드한 SDK 버전과 Host 버전도 비교하며 자동 호환이나 대체 SDK를 사용하지 않는다.

개발 실행은 최초 활성화 때 공개 SDK entry를 메모리 JS 번들로 빌드해 Host 수명 동안 재사용한다. 개발·배포 모두 같은 entry를 코드 분할 없이 자기완결 JS 모듈 하나로 번들한다. 배포 빌드는 `plugin-sdk.mjs`로 CLI에 포함하고 Desktop의 `build/cli`에도 복사한다. Node 공식 `registerHooks`가 플러그인 코드 로드 전에 SDK root import를 이 런타임으로 연결한다. 저장소 밖·다른 드라이브도 file URL 또는 메모리 URL을 사용하므로 artifact 위치에 의존하지 않는다. artifact의 node_modules에 다른 SDK가 있어도 Host 제공본이 항상 우선한다. `@litzio/core` 등 다른 내부 패키지와 SDK subpath import는 거부하며 필요한 공개 API는 SDK root가 재노출한다. resolve 훅은 이름 검사 뒤 Node가 해석한 file URL을 OS 경로로 변환하고 절대 경로·realpath로 정규화한다. Windows에서는 대소문자를 통일하고 path.relative의 디렉터리 경계·다른 드라이브 판정을 사용한다. 상대 경로·file URL·symlink/junction 별칭으로 접근해도 개발 Host의 checkout 또는 배포 Host의 설치 번들 디렉터리 안이면 거부한다(Desktop은 resources 디렉터리). Host 제공 단일 SDK 런타임 파일 자체만 예외다. SDK는 Node 내장 모듈 외의 런타임 import나 공유 chunk가 없다. 부모 URL은 createRequire 등으로 호출자가 지정할 수 있으므로 내부 접근의 신뢰 근거로 사용하지 않는다. SDK URL을 부모로 지정한 createRequire.resolve/require도 같은 실제 경로 검사를 받는다. artifact 자체 실제 디렉터리 안의 모듈은 checkout 안에서 제작한 경우에도 허용한다. Node 내장 모듈과 Host 내부를 가리키지 않는 artifact 자체 node_modules도 허용한다. artifact 안의 symlink는 기존 등록 검사에서 계속 거부한다. 정적 validate는 import graph를 실행하지 않으므로 이 경계의 판정은 활성화와 실제 import 시점에 수행한다. 일반 제3자 의존성은 기존처럼 artifact에 번들할 수 있다. 플러그인은 ADR-0020의 신뢰 코드이며 이 차단은 실수로 내부 API에 의존하는 것을 막는 계약 강제이지 sandbox나 보안 경계가 아니다. fs로 파일을 직접 읽어 eval하는 의도적 우회는 범위 밖이다.

scaffold는 SDK_VERSION과 PluginOperationError import 예시, context용 JSDoc, 외부 편집기의 starter 타입 힌트 `plugin-sdk.d.ts`와 `jsconfig.json`을 포함한다. 선언 파일은 예시용 공개 API 부분집합이며 런타임 사본이 아니다. SDK 자체는 설치·번들하지 않는다. 새 scaffold는 대상 Host의 정확한 SDK_VERSION을 requiresSdk에 기록한다.

`pnpm editor`의 Vite SSR도 같은 개발 SDK 공급 경로를 사용한다. checkout tooling의 동적 import는 Node 런타임에서 실행하며 Vite 분석 대상에서 명시적으로 제외한다. `vite-plugins.test.ts`는 실제 Vite 설정의 HTTP Host에서 저장소 밖 artifact의 SDK import·활성화·상태 반환과 분석 경고 부재를 검사한다. `pnpm browser:test vite-plugins`는 Vite에서 없는 경로·잘못된 artifact의 오류 표시와 정상 OneDrive 등록 후 비활성 목록 표시·활성화를 확인한다. 이 검사는 OneDrive artifact를 먼저 빌드하며 SDK 외부 import 검사는 별도의 임시 artifact로 수행한다.

개발 Host의 외부 임시 artifact 수명 테스트는 로컬 SDK보다 Host 제공본 우선, 비호환 manifest 거부, 내부 import 거부와 reload를 검증한다. CLI offline packaged 검사와 Windows Desktop packaged 검사는 외부 scaffold→validate→등록→trust→enable→invoke를 실행한다. 이는 SDK 공급 경계 fixture이며 Jira·Docling 실제 서비스 수락 완료가 아니다.

## 비서 제작 키트

`scaffold`는 대상 Host의 새 절대 디렉터리에 manifest·package.json·ESM host.js와 편집기 타입 힌트를 생성한다. 생성 직전 Host RootAccess의 새 경로 검사를 적용한다. 비서 호출은 turn의 opened folders와 Host Root를 모두 검사하며 read-only turn·열린 폴더 없는 turn을 거부한다. full-access도 이 공용 생성 경로의 Root/열린 폴더 제약을 생략하지 않는다. 부모 디렉터리는 존재해야 하며, 이미 있는 디렉터리(빈 디렉터리 포함)는 거부하고 덮어쓰지 않는다. 최소 greet 읽기 작업과 inline 입력·출력 schema 예시를 포함한다. 대상 Host SDK_VERSION 요구, 패키지/manifest 버전 일치와 community 계층을 사용하며 자동 등록·신뢰·실행은 하지 않는다.

`validate`는 artifact 경계·manifest/SDK 범위·버전·JSON Schema 컴파일과 entry 구문, 선언 작업과 literal handler 일치를 검사한다. 결과는 `valid`, 원문 없는 `errors`(고정 파일 역할, 1-based 줄/열 또는 위치 불명 null, 고정 오류 종류), 검사 한계와 Host receipt다. 실패는 failure receipt와 CLI 종료 코드 1로 반환한다. 코드를 import/실행하지 않으며 등록 상태도 바꾸지 않는다. JSON/JavaScript/schema/parser/fs 예외 원문·stack·파일 내용·사용자 정의 handler 이름을 진단에 복사하지 않는다. 같은 정리된 결과를 비서 도구와 CLI가 반환하고, 활동에는 결과 요약만 남긴다. 정적 검사를 위해 entry는 named `export function activate`의 직접 return 객체 안에 하나의 literal `operations` 객체와 literal 함수 handler를 둔다. 동적 등록은 검증 불가 오류다. 정적으로 알려진 JSON 반환값은 출력 schema와 비교하지만, 계산된 반환값·activation·dispose 동작은 실제 enable/invoke/reload에서만 검증된다. validate 통과는 실행 성공의 보증이 아니다.

`manage_plugins`도 scaffold/validate를 같은 정의로 호출한다. register 활동에는 인자로 받지 않는 실제 manifest ID를 결과에서 가져와 남긴다. validation 오류는 결과에서 읽되 활동 요약에는 원문을 쓰지 않는다. Codex의 각 대화 turn에 앱 번들의 제한된 제작 스킬을 문맥으로 제공한다(전역 Codex 스킬 설치 없음). 스킬은 SDK·manifest·공용 작업/schema 예시, 파일 수정 권한·secret 비노출, validate/register/trust/enable/invoke 및 수정 후 validate/trust/reload/invoke 절차와 금지 항목을 설명한다. master에 병합된 secret 선언과 사용자 설정 UI 입력·읽기 전용 context.secrets, 읽기 작업 rowSchema, K1 jobs 바인딩·상태·결과 열기를 안내한다. generatedUi/views/dataViews/secretUses 확장은 계속 예시로 제공하지 않는다. Copilot 도구 공급 범위는 그대로다.

자동 검사는 기존 Host 플러그인 테스트에서 생성→정적 검증→등록→신뢰→활성→호출→수정→재검증→신뢰→reload→결과 변경을 같은 Host로 확인한다. 이 subprocess 사례는 실제 캐시 교체·daemon 무재시작을 보호한다. handler 누락·미선언 handler·잘못된 schema·literal 출력 불일치와 비실행·덮어쓰기 거부도 확인한다.

## 작업 실패 공개 분류 (#1233)

SDK `PluginOperationError(kind)` 또는 같은 `kind` 속성의 예외로 `auth`(인증 확인), `forbidden`(권한 문의), `not_found`(주소·ID 확인), `unavailable`(나중에 재시도), `timeout`(연결 확인), `failed`(설정·대상 확인)를 전달한다. HTTP 상태 매핑은 플러그인이 담당한다. 알 수 없는 kind, 일반 예외와 출력 검증 실패는 `failed`다. 하위 프로세스 제한 시간 초과는 `timeout`, 그 외 프로세스 실패는 `failed`다.

Host의 `publicOperationError`는 `errorKind`와 SDK의 고정 `PLUGIN_ERROR_MESSAGES`만 공개한다. 예외 원문·stack·응답 본문·임의 안내는 IPC와 공개 결과에 전달하지 않는다. 읽기 실패 receipt는 failure, 쓰기는 uncertain이며 쓰기에만 대상 확인 후 쓰기 재시도 안내를 덧붙인다. CLI·비서 도구는 동일 결과를 반환하고, 현재 뷰 새로고침 오류는 `[errorKind]`와 같은 고정 문구를 표시한다. 기존 Notice를 재사용하며 새 카탈로그 요소는 만들지 않는다.

K1 반환형 실패도 같은 공개 오류 경계를 따른다. handler는 오류 문자열 대신 `errorKind`만 지정하며 알 수 없거나 누락된 분류는 `failed`다. `failed`·`uncertain`의 phase와 오류 안내는 Host 고정값이며 plugin phase·예외 원문을 복사하지 않는다. 기존 `error` 필드는 허용하지 않으며 잘못된 결과는 고정 `failed` 안내의 uncertain으로 남긴다. job-status·job-list·화면·비서가 같은 정규화된 snapshot을 받는다.

K1 호출은 등록 시 manifest의 start/status/stop read·write 효과를 기록하고 오류 정규화에도 유지한다. 쓰기 실패에는 고정 대상 확인 안내와 `Query the same requestId; do not resend start.`를 함께 붙인다. 쓰기 결과가 uncertain인 동안 후속 읽기 조회도 실패하거나 uncertain을 반환하면 이 안전 안내를 유지한다. 원문·stack은 복사하지 않는다.

## V4 공용 review Host·CLI

K1 완료의 선택 `jobUpdate.review`는 SDK `completedReviewSchema`를 따른다. review, bundle(generation/documentRevision/documentHash/sourceRevision와 선택 mappingRevision), pages, 선택 mapping, images(ref/Root 상대 path/SHA-256 revision)를 전달한다. sourceRevision은 K1 입력 파일 SHA-256, documentRevision/hash는 Core canonical 출력 revision이다. Host는 문서 생성 후 모든 자료를 검증하고 `result.bundle`에 Host 발급 bundleRef/documentRef를 공개한다. Root·generation·revision·이미지 검증 실패 시 bundle은 공개하지 않으며 이미 생성된 결과 문서를 보존하고 uncertain으로 남긴다. 완료 전 자료는 공개하지 않는다.

`POST /api/reviews`는 PluginHost 소유 dispatcher다. 입력은 action(read/propose/approve/reject/undo/status), plugin/review/root/bundleRef/generation이다. read는 kind(bundle/document/page/mapping/proposals/image)와 pageNo를 선택하고 data/baseline/state/receipt를 반환한다. 문서는 bundle의 canonical source snapshot이며 stale 자료를 현재 파일처럼 반환하지 않는다. image는 검증한 PNG의 mime/base64 data/width/height다. 현재 PNG만 지원하며 다른 형식은 거부한다. Core REVIEW_LIMITS의 JSON·목록·영역·이미지 byte/pixel 상한을 적용하고 초과나 미지원 continuation은 자르지 않고 거부한다. 자료 참조에 임의 파일 경로·URL을 받지 않는다.

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

일반 대화 view_catalog와 Generate view는 shared/view-generation.ts의 단일 schema/instruction을 사용한다. query/InputForm과 함께 명시적으로 제공된 같은 Host 완료 bundle의 review 명세를 허용한다. Host view.validate/propose는 실제 bundle·Root 접근·기여 가용성을 확인하며 저장·자료 반환·plugin 조회·문서 변경을 실행하지 않는다. review 제안의 pending 제출과 뷰 명세 propose를 구별하며 비서 승인/Undo 도구를 추가하지 않는다. 제작 스킬도 같은 범위와 참조 발명 금지를 안내한다.

V3/V5와 CLI는 단일 POST /api/reviews dispatcher를 사용한다. source의 bundleRef는 Host가 보관한 generation에 고정되며 generation을 명시한 요청은 일치해야 한다. read에서 pageNo를 주고 kind를 생략하면 snapshot/receipt를 반환한다. snapshot은 bundle/page/선택 mapping/proposals, document-reader의 Core document/revision/hash/path, baseline/pageCount와 선택 PNG imageUrl을 조립한다. 이미지 byte/pixel 제한과 JSON 자료 제한을 각각 적용하며 imageUrl은 일시적 읽기 결과로만 사용한다. 다른 자료 읽기는 기존 kind 선택을 쓴다. 변경·status는 같은 requestId·baseline 계약을 유지한다. source·문서가 외부에서 바뀌면 snapshot은 실제 revision으로 불일치를 드러내어 V5가 action을 막으며 Host도 commit 직전에 다시 거부한다. 이전 map을 새 문서에 재연결하지 않는다. HTTP/CLI·비서 stdio fixture 통과를 실제 브라우저·외부 서비스·Docling 수락으로 간주하지 않는다.

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

기본값 전환·명시적 선택·변조 차단은 Host 단위 검사, 첫 실행 표시·토글·외부 폴더 선택 연결은 `http-plugins`, 배포물 안 공급·실행은 CI packaged 검사에서 확인한다. 수동 1440 캡처는 `pnpm browser:test http-plugins --screenshots`의 `docs/design/assets/bundled-plugins-1279/bundled-1440.png`에 남긴다. 이는 localhost와 fixture 검증이며 실제 OneDrive 계정 동기화의 증거는 아니다.

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
| table | rows(string[][]) | 첫 행 header, 직사각형 표 |
| figure | imageUrl, imageAlt, caption | 기존 Core Figure, 빈 URL은 pending |
| code | language, code | 코드 블록 |
| equation | latex | display 수식 |
| divider | 없음 | 구분선 |

모든 텍스트는 기존 Core literal text 연산을 통과한다. Markdown 문자열을 의미로 파싱하지 않는다. 기존 연산의 공백·개행 정규화와 native write 거부 규칙을 그대로 따른다. rich inline, 중첩 목록, 임의 HTML/AST/원본 Markdown, 외부 형식 변환과 이미지 복사·생성은 이 최소 API의 입력이 아니다. title도 기존 Core 단일 행 title 제약을 따른다. 지원하지 않는 의미를 자동으로 평탄화하거나 일부만 성공으로 반환하지 않는다.

`DOCUMENT_AUTHORING_LIMITS`는 입력 JSON과 출력 canonical source 각각 UTF-8 262144 bytes, 입력 200개, 전체 블록 500개, 문자열 16384 UTF-16 code units, 표 100행×32열이다. unknown 필드·중복 key·잘못된 요소/Unicode·schema 상한 위반은 `DocumentAuthoringError.code="invalid-input"`, byte 상한 초과는 `limit`, Core의 의미·round-trip 거부는 `unsupported-content`로 Promise가 reject된다. 오류에는 입력 원문을 포함하지 않으며 부분 결과를 반환하지 않는다. `documentAuthoringSchema`는 구조 검증용이고 byte·Core 검증은 함수 실행에서 추가한다.

반환 source는 canonical serialize→parse→serialize가 안정적인 native 문서다. 각 target은 `{path,documentRevision,documentHash}`이며 최종 재파싱 snapshot의 Core read-model 최상위 블록을 가리킨다. revision과 hash는 동일한 canonical source UTF-8 SHA-256(hex)으로 Host `textRevision`과 같다. 해시는 순수 JS 라이브러리로 계산하며 Node 전용 API나 secure context의 `crypto.subtle`에 의존하지 않는다. key는 원본 입력의 식별자이고 path는 persistent identity가 아니다. 저장 뒤 같은 source/revision에서만 참조가 유효하며 편집 후 새 revision에 자동 재연결하지 않는다. 참조 없는 입력도 `{key,targets:[]}`로 반환한다. 원본 영역·mapping 자료는 플러그인이 이 target을 사용해 별도로 구성하고 #1317의 전역 유일 영역 ID·bundle 범위 검증을 따른다.

저장은 기존 K1 status 완료의 `document:{source: authored.source}`를 사용한다. 공용 `plugins job-start/job-status/job-result` HTTP/CLI·requestId·Root·충돌·receipt 경로를 유지하며 새 저장 endpoint나 직접 파일 쓰기를 만들지 않는다. start는 계속 running 접수만 반환한다. 문서 저장 이후 review 발행은 별개 단계이고 기존 uncertain·같은 requestId 확인·start 무재전송 계약을 유지한다.

검증은 기존 Core native suite에서 최소 요소·입력 키별 0/N 참조·canonical 재처리와 거부를 확인한다. 기존 K1 suite의 대표 외부 artifact subprocess(약 2초)는 SDK import만 사용해 생성→Host 공식 저장→재파싱·revision/path 대조와 원본 보존을 확인한다. Core 조합을 subprocess에서 반복하지 않는다. master의 #1318과 #1317 최종 결합은 기존 `reviews.test.ts`의 읽기 전용 K1 완료 경로에서 공개 SDK 생성→공식 저장→입력 key별 target으로 대조 발행→Host·실제 CLI snapshot 재조회와 revision/path 일치를 확인한다. 같은 SDK 생성 문서를 외부 변경한 뒤 원래 byte로 복원해도 stale을 유지하는 통합 경계를 함께 보호한다. 새 subprocess를 추가하지 않고 기존 완료·CLI 읽기를 보완하며 삭제·일시적 오류 분류는 Host 단위 검사가 소유한다. Docling 품질·대규모 paging·과거 형식 호환은 검증 범위가 아니다.
