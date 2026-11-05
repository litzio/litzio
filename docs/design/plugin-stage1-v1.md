# 플러그인 1단계

- Status: Implemented
- Host assembly (#1246): `host-services.ts` composes independent plugin and view services and lazily initializes the assistant. Plugin management/secret routes belong to `plugin-service.ts`; views receive that same plugin runtime explicitly through `view-service.ts`. Assistant shutdown closes only its provider/conversation resources; Host shutdown closes plugins independently, including when assistant initialization or shutdown fails. Views retain no separate runtime resources. Request paths, lazy plugin start, receipts and stored formats are unchanged.
- Last verified: 2026-11-06 — #1244 플러그인별 마스킹·키 보존·삭제·로그 비노출 회귀 및 Editor typecheck. 기존 검증: 2026-11-05 SDK·Host·OneDrive fixture, 제작 lifecycle·CLI·실제 Codex 두 모델 및 http-plugins 검사. 필수 CI 결과는 구현 PR에 기록한다.
- Authority: [ADR-0020](../adr/0020-plugin-architecture.md)의 소유자 1단계 개시. [ADR-0019](../adr/0019-plugin-tiers.md), [ADR-0015](../adr/0015-shared-host-operations.md), [ADR-0018](../adr/0018-desktop-remote-hosts.md)을 따른다.
- Scope: 최소 SDK, 명시적 로컬 등록·신뢰·활성화, 공용 작업·CLI·설정과 OneDrive, 비서 제작 키트. Jira와 동적 UI 스파이크는 후속이다.

2026-11-05 소유자 제작 로드맵 결정 2·5에 따라 아래 하위 프로세스·reload·관리별 승인 제거를 구현한다. 같은 결정은 ADR-0020의 비서 제작 로드맵 개정에 기록되어 있다.

## 경계와 manifest

`packages/plugin-sdk`는 React·Editor·Core AST 의존 없이 manifest, JSON Schema 검증과 공용 작업·폴더·계정 타입을 공급한다. `litzio-plugin.json`이 실행 선언이며 패키지 버전은 package.json과 일치해야 한다. ID, tier, publisher, SemVer SDK 범위, 패키지 안 entry, contributes와 settingsSchema를 import 전에 검증한다. JSON Schema는 Ajv, manifest는 Zod, 버전은 SemVer를 재사용한다. 외부 `$ref`와 알 수 없는 필드·중복 기여를 거부한다.

확장 자리 `contributes.dataViews`, `generatedUi`, `secretUses`는 비어 있지 않으면 미지원으로 등록을 거부한다. 카탈로그 V1에서 `contributes.views:[{id,title,definition}]`는 inline query v2 명세만 받고, `contributes.reviews:[{id,title,read,propose,approve,reject,undo}]`는 `{operation,version}` binding을 받는다. 같은 플러그인의 완전 이름 `<plugin-id>.<operation-id>`와 등록 version만 허용하며 view는 rowSchema 읽기, review read는 read, 나머지는 write여야 한다. unknown action·cross-plugin·effect/version 불일치는 entry 전에 거부한다. [Core/SDK v2 계약](generated-views-v1.md#catalog-v2-contract-layer-v1)을 SDK가 재노출한다. 실제 Host dispatch·기본 UI·CLI와 승인 경계 연결은 V2/V4 범위다. `secrets`는 중복 없는 id·connection scope·required 선언을 지원한다. secret 값 조회 API와 생성 UI·저장 뷰 runtime은 없다.

공용 작업은 id/version/effect/scope와 입력·결과 schema를 선언하고 같은 id의 handler를 연결한다. 1단계 기능 작업은 host scope만 지원하며 folder scope 선언은 미지원으로 거부한다. `activate(context)`는 operations/status/dispose를 반환한다. 미선언·누락 작업 handler는 활성화 실패다. 폴더 소스와 장식·계정은 선언한 기여의 상태 결과이며 앱 번들 아이콘만 표시한다. 폴더 열기는 기존 파일 Host가 검증한다. 문서 의미·공식 쓰기 경계는 변경하지 않는다.

## Host 상태와 호출

대상 daemon의 Host 설정 루트에 별도 plugins.json을 기록한다. `LITZIO_DATA_DIR` 또는 `LITZIO_PLUGINS_SETTINGS_FILE`로 격리할 수 있다. 임의 디렉터리 자동 탐색, SQLite, migration과 자동 파일 감시 reload는 없다. 로컬 artifact 안의 파일을 digest로 묶고 패키지 밖 참조를 거부한다. 공식 공급 목록은 id·publisher와 제품이 검토한 artifact digest를 대조한다. 자칭 official 또는 변경 artifact는 공식 신뢰를 얻지 않는다.

등록 직후는 비활성이다. 기본 활성 정책은 미정이며 모든 플러그인은 명시적으로 활성화한다. 커뮤니티는 list에서 확인한 digest를 trust한 뒤 enable한다. 사용자와 비서 모두 digest 신뢰 작업을 실행할 수 있다. artifact가 달라지면 새 digest를 trust한 뒤 reload한다. 자동 교체하지 않는다. 비활성화는 신규 호출을 먼저 차단하고 상태 기여를 숨긴 뒤 이미 접수한 호출을 drain하고 dispose한다. 설정과 열린 폴더·탭은 삭제하지 않는다. OS 권한 격리는 보장하지 않는다.

플러그인마다 daemon의 Node 하위 프로세스 하나를 사용한다. Node IPC 채널의 요청 ID로 activate·invoke·status·dispose와 응답을 연결하며 stdout/stderr와 플러그인 예외 원문은 전달하지 않는다. 별도 bootstrap 파일 없이 번들 안의 고정 코드로 시작하므로 설치된 CLI도 같은 경로를 쓴다. 각 요청은 10초 후 실패하며 프로세스를 종료한다. 읽기 실패는 failure, 쓰기 실패는 기존 uncertain receipt를 유지하고 자동 재전송하지 않는다.

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

`plugins/onedrive`는 SDK 타입과 Node API만 사용한다. `pnpm --filter @litzio/onedrive build`가 자체 실행 의존성을 포함한 artifact 디렉터리를 만든다. Host와 CLI는 OneDrive source를 import하지 않는다. artifact를 명시 등록·활성화한다.

Windows 환경 변수 OneDrive/OneDriveConsumer/OneDriveCommercial과 실재 폴더를 우선한다. HKCU Software/Microsoft/OneDrive/Accounts 직하위 계정의 UserFolder를 best-effort로 보완하며 중복 경로를 합친다. 조회 실패·불완전/없는 경로 수와 출처를 보존한다. UserEmail/DisplayName이 실제 조회된 경우만 표시하고, 그 밖에는 경로 기반 중립 라벨을 쓴다. raw 레지스트리 출력은 로그에 쓰지 않는다. SyncEngines, ini, WinRT, Graph/OAuth와 동기화 엔진은 사용하지 않는다. Linux 등 다른 OS에서는 지원하지 않음을 표시한다.

폴더 감지는 로그인이나 동기화 상태의 증거가 아니다. 유효 후보가 하나이고 기존 폴더·최근 폴더·문서 선택이 없을 때만 Explorer에서 열기 후보를 제안한다. 사용자가 기존 폴더 열기 경로로 연다. 복수 후보는 자동 선택하지 않으며 기존 폴더·탭을 덮지 않는다. 장식은 정확한 루트에 번들 Microsoft Fluent UI OneDrive 로고을 사용하고 자식에게 전파하지 않는다.

## 검증 경계

SDK 검사는 manifest와 미지원 확장·외부 schema를, Host 검사는 digest 신뢰·disable drain·설정 보존·하위 프로세스 수명·reload 회복과 비서 활동 기록을 소유한다. OneDrive 검사는 주입한 환경·디렉터리·레지스트리로 단일/복수/없음/잔존을 검증하며 실제 계정에 의존하지 않는다. `pnpm browser:test http-plugins`는 격리된 production HTTP Host와 CLI·설정 UI 일치 및 비활성화 뒤 열린 폴더 보존을 확인한다. `--screenshots`는 수동 검토용 1440px·640px 설정·장식 캡처를 tmp/plugin-stage1에 남긴다. 필수 CI는 기존 전체 제품 판정을 유지한다.

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

Host는 실행 전에 requestId를 메모리에 기록하고 중복 start를 거부한다. running/completed/failed/stopped/uncertain, phase, 선택적 done/total, stopRequested를 유지한다. start handler는 긴 Promise를 반환할 수 있다. status/stop handler는 같은 requestId/root/file/output을 받는다. handler 결과는 state/phase/progress/errorKind와 완료 시 document.source다. Host가 완료 결과의 native source를 Core 기반 공식 생성 경로로 검증·생성한 뒤에만 path/revision을 공개한다. 완료 전 document/source/부분 결과는 UI·CLI로 공개하지 않는다. 결과 문서 생성 실패도 uncertain으로 남겨 확인 없이 다시 쓰지 않는다.

job-status/job-stop/job-result는 같은 requestId만 받는다. stopRequested는 취소 요청이며 stopped와 다르다. 플러그인이 stopped를 확인할 때만 실제 중단으로 표시한다. disable/종료는 작업에 중단을 요청하고 진행 start 호출을 drain한 뒤 기존 dispose를 수행한다. 하위 프로세스 IPC 요청은 앞 절의 10초 제한을 따르며 초과하면 프로세스를 종료하고 관찰을 uncertain으로 남긴다. start/status/stop도 `invokeOperation → publicOperationResult`를 통해 같은 결과 검증·secret 정리를 받는다. 메모리 기록은 daemon 수명에 한정된다. 재시작 후 unknown ID는 재실행 근거가 아니다. 영속 queue/DB/scheduler는 없다.

```text
plugins start <pluginId> --input <json-file> --host <origin> --json
plugins status|stop|result <requestId> --host <origin> --json
jobs list [pluginId] --host <origin> --json
```

start 파일은 job/requestId/root/file/output을 담는다. CLI는 앱과 같은 공용 작업·receipt를 호출하며 결과가 앱 탭을 생성하지 않는다. 응답 유실 뒤 start를 재전송하지 않고 status로 같은 ID를 조회한다.

명령 센터의 Plugin jobs는 현재 문서/작업 탭 Host에 고정된 앱 번들 기본 UI다. 공통 Button/Input/Notice, 기존 뷰 페이지 레이아웃과 Host 폴더 목록을 재사용한다. 열린 대상 Host 폴더 안에서 파일을 선택하고 실행·상태·중단·완료 문서 열기를 제공한다. 결과 열기는 기존 Host-aware 문서 열기와 미저장 보호를 따른다. requestId는 내부에서 생성·관리하며 입력란으로 노출하지 않는다. Host의 `job-list`는 플러그인별 진행 중·최근 작업과 경과 시간을 daemon 메모리에서 반환한다. 작업 화면을 다시 열면 이 목록으로 진행 중 작업을 복원해 관찰하고 최근 작업을 선택할 수 있다. 브라우저 자체 요청 ID 저장소나 재입력에 의존하지 않는다. 활성 작업 화면에서만 1초 간격으로 겹치지 않게 조회하고, 숨김/탭 닫기 시 타이머와 요청을 정리한다. 화면 닫기는 실행 취소가 아니다. 연결/응답 상실은 uncertain으로 표시하며 폴링을 멈춘다. uncertain일 때만 상태 다시 확인 버튼을 보여 내부의 같은 ID로 조회한다. Host의 명확한 4xx 실행 거부는 실패와 이유를 표시하고 입력 수정을 허용한다. 연결 실패·5xx·응답 유실과 구분한다. 저장된 데이터 뷰의 자동 조회 금지 계약은 그대로다.

검증 fixture는 `apps/editor/test/fixtures/job-plugin`이다. 텍스트 파일을 세 단계 처리하고 native source를 Host에 돌려준다. FAIL/UNCERTAIN으로 시작하는 입력은 각각 실패/불확실을 재현한다. 중단 요청은 먼저 접수되고 다음 상태 조회에서 실제 stopped가 확인된다. 실제 Docling 변환·품질 증거는 아니다. Host 수명·중복·출력 공개·Root 경계는 `plugin-jobs.test.ts`, HTTP CLI/UI 연결·결과 열기·Stop은 `pnpm browser:test plugin-jobs`가 소유한다. 수동 캡처는 `pnpm browser:test plugin-jobs --screenshots`의 `tmp/plugin-jobs/completed-1440.png`, `completed-640.png`에 남긴다.

K1 기본 UI는 `SettingsSelect`/`SettingsInput`의 라벨·control 높이·간격과 `HostStatus`의 점·톤을 재사용한다. 상태를 지역화해 한 번만 표시하고 진행 중 phase와 경과 시간을 옆에 둔다. 취소 버튼은 실행 중에만, 접수 뒤에는 취소 요청됨, 실제 stopped 뒤에는 취소됨으로 구분한다. 상위 폴더 복귀는 하위 폴더를 탐색한 경우에만 명확한 라벨로 보인다. 공용 `components/ui/Progress`는 ARIA progressbar와 제품 surface/accent·간격 토큰을 쓰며 기본 브라우저 progress를 사용하지 않는다. 숫자 진행량과 결과 열기는 별도 간격·행으로 분리한다.

Codex 비서는 SDK `PLUGIN_JOBS` 공용 정의를 그대로 쓰는 `plugin_jobs` 도구로 start/status/stop/result/list를 호출한다. 건별 확인은 없고 기존 turn 활동 목록에 작업·성공/실패·결과를 남긴다. start/stop은 기존 대화의 쓰기 모드·열린 폴더 범위를 지키며 secret이나 공식 목록 변경 권한은 추가하지 않는다. 실제 모델 호출 없이 app-server fixture로 도구 노출·승인 없음·활동 기록을 검증한다. Copilot의 별도 dynamic-tool 공급은 이 단계에서 추가하지 않는다. `plugin-jobs.test.ts`는 Editor 기본 test 명령에 포함하며 동시 동일 ID/별도 ID 시작, 완료와 Stop 경합, daemon 재시작 뒤 unknown/no replay를 보호한다.

입력 선택은 `(Root, 상대 경로)` 쌍이다. 파일·폴더 선택은 해당 Host가 반환한 자식 이름으로 상대 경로를 구성하며 절대 경로 문자열을 잘라 재해석하지 않는다. Root 선택이나 최근 작업 이동으로 Root가 바뀌면 파일·탐색 폴더·이전 목록을 초기화하며, 새 Root에서 명시적으로 다시 선택하기 전에는 실행하지 않는다. 같은 이름의 파일이 다른 Root에 존재해도 자동 재바인딩하지 않는다.


## 비서 제작 키트

`scaffold`는 대상 Host의 새 절대 디렉터리에 manifest·package.json·ESM host.js를 생성한다. 생성 직전 Host RootAccess의 새 경로 검사를 적용한다. 비서 호출은 turn의 opened folders와 Host Root를 모두 검사하며 read-only turn·열린 폴더 없는 turn을 거부한다. full-access도 이 공용 생성 경로의 Root/열린 폴더 제약을 생략하지 않는다. 부모 디렉터리는 존재해야 하며, 이미 있는 디렉터리(빈 디렉터리 포함)는 거부하고 덮어쓰지 않는다. 최소 greet 읽기 작업과 inline 입력·출력 schema 예시를 포함한다. SDK 0.1.0 호환 범위, 패키지/manifest 버전 일치와 community 계층을 사용하며 자동 등록·신뢰·실행은 하지 않는다.

`validate`는 artifact 경계·manifest/SDK 범위·버전·JSON Schema 컴파일과 entry 구문, 선언 작업과 literal handler 일치를 검사한다. 결과는 `valid`, 원문 없는 `errors`(고정 파일 역할, 1-based 줄/열 또는 위치 불명 null, 고정 오류 종류), 검사 한계와 Host receipt다. 실패는 failure receipt와 CLI 종료 코드 1로 반환한다. 코드를 import/실행하지 않으며 등록 상태도 바꾸지 않는다. JSON/JavaScript/schema/parser/fs 예외 원문·stack·파일 내용·사용자 정의 handler 이름을 진단에 복사하지 않는다. 같은 정리된 결과를 비서 도구와 CLI가 반환하고, 활동에는 결과 요약만 남긴다. 정적 검사를 위해 entry는 named `export function activate`의 직접 return 객체 안에 하나의 literal `operations` 객체와 literal 함수 handler를 둔다. 동적 등록은 검증 불가 오류다. 정적으로 알려진 JSON 반환값은 출력 schema와 비교하지만, 계산된 반환값·activation·dispose 동작은 실제 enable/invoke/reload에서만 검증된다. validate 통과는 실행 성공의 보증이 아니다.

`manage_plugins`도 scaffold/validate를 같은 정의로 호출한다. register 활동에는 인자로 받지 않는 실제 manifest ID를 결과에서 가져와 남긴다. validation 오류는 결과에서 읽되 활동 요약에는 원문을 쓰지 않는다. Codex의 각 대화 turn에 앱 번들의 제한된 제작 스킬을 문맥으로 제공한다(전역 Codex 스킬 설치 없음). 스킬은 SDK·manifest·공용 작업/schema 예시, 파일 수정 권한·secret 비노출, validate/register/trust/enable/invoke 및 수정 후 validate/trust/reload/invoke 절차와 금지 항목을 설명한다. master에 병합된 secret 선언과 사용자 설정 UI 입력·읽기 전용 context.secrets, 읽기 작업 rowSchema, K1 jobs 바인딩·상태·결과 열기를 안내한다. generatedUi/views/dataViews/secretUses 확장은 계속 예시로 제공하지 않는다. Copilot 도구 공급 범위는 그대로다.

자동 검사는 기존 Host 플러그인 테스트에서 생성→정적 검증→등록→신뢰→활성→호출→수정→재검증→신뢰→reload→결과 변경을 같은 Host로 확인한다. 이 subprocess 사례는 실제 캐시 교체·daemon 무재시작을 보호한다. handler 누락·미선언 handler·잘못된 schema·literal 출력 불일치와 비실행·덮어쓰기 거부도 확인한다.

## 작업 실패 공개 분류 (#1233)

SDK `PluginOperationError(kind)` 또는 같은 `kind` 속성의 예외로 `auth`(인증 확인), `forbidden`(권한 문의), `not_found`(주소·ID 확인), `unavailable`(나중에 재시도), `timeout`(연결 확인), `failed`(설정·대상 확인)를 전달한다. HTTP 상태 매핑은 플러그인이 담당한다. 알 수 없는 kind, 일반 예외와 출력 검증 실패는 `failed`다. 하위 프로세스 제한 시간 초과는 `timeout`, 그 외 프로세스 실패는 `failed`다.

Host의 `publicOperationError`는 `errorKind`와 SDK의 고정 `PLUGIN_ERROR_MESSAGES`만 공개한다. 예외 원문·stack·응답 본문·임의 안내는 IPC와 공개 결과에 전달하지 않는다. 읽기 실패 receipt는 failure, 쓰기는 uncertain이며 쓰기에만 대상 확인 후 쓰기 재시도 안내를 덧붙인다. CLI·비서 도구는 동일 결과를 반환하고, 현재 뷰 새로고침 오류는 `[errorKind]`와 같은 고정 문구를 표시한다. 기존 Notice를 재사용하며 새 카탈로그 요소는 만들지 않는다.

K1 반환형 실패도 같은 공개 오류 경계를 따른다. handler는 오류 문자열 대신 `errorKind`만 지정하며 알 수 없거나 누락된 분류는 `failed`다. `failed`·`uncertain`의 phase와 오류 안내는 Host 고정값이며 plugin phase·예외 원문을 복사하지 않는다. 기존 `error` 필드는 허용하지 않으며 잘못된 결과는 고정 `failed` 안내의 uncertain으로 남긴다. job-status·job-list·화면·비서가 같은 정규화된 snapshot을 받는다.

K1 호출은 등록 시 manifest의 start/status/stop read·write 효과를 기록하고 오류 정규화에도 유지한다. 쓰기 실패에는 고정 대상 확인 안내와 `Query the same requestId; do not resend start.`를 함께 붙인다. 쓰기 결과가 uncertain인 동안 후속 읽기 조회도 실패하거나 uncertain을 반환하면 이 안전 안내를 유지한다. 원문·stack은 복사하지 않는다.
