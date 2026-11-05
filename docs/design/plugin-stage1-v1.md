# 플러그인 1단계

- Status: Implemented
- Last verified: 2026-11-05 — SDK·Host·OneDrive fixture 검사. 브라우저·필수 CI 결과는 구현 PR에 기록한다.
- Authority: [ADR-0020](../adr/0020-plugin-architecture.md)의 소유자 1단계 개시. [ADR-0019](../adr/0019-plugin-tiers.md), [ADR-0015](../adr/0015-shared-host-operations.md), [ADR-0018](../adr/0018-desktop-remote-hosts.md)을 따른다.
- Scope: 최소 SDK, 명시적 로컬 등록·신뢰·활성화, 공용 작업·CLI·설정과 OneDrive. Jira와 동적 UI 스파이크는 후속이다.

> 2026-11-05 결정 개정: [ADR-0020 비서 제작 로드맵](../adr/0020-plugin-architecture.md#비서-플러그인-제작-로드맵2026-11-05-개정)은 하위 프로세스 reload·제작 키트·관리 건별 승인 제거와 활동 기록을 결정했다. 아래 매 호출 확인 등은 현재 구현의 기록이며 새 결정의 완료 증거가 아니다. 해당 구현 PR에서 함께 갱신한다.

## 경계와 manifest

`packages/plugin-sdk`는 React·Editor·Core AST 의존 없이 manifest, JSON Schema 검증과 공용 작업·폴더·계정 타입을 공급한다. `litzio-plugin.json`이 실행 선언이며 패키지 버전은 package.json과 일치해야 한다. ID, tier, publisher, SemVer SDK 범위, 패키지 안 entry, contributes와 settingsSchema를 import 전에 검증한다. JSON Schema는 Ajv, manifest는 Zod, 버전은 SemVer를 재사용한다. 외부 `$ref`와 알 수 없는 필드·중복 기여를 거부한다.

확장 자리는 `contributes.dataViews`, `generatedUi`, `views`, `secretUses`와 `secrets`다. 각 항목의 구조는 검증하지만 비어 있지 않으면 1단계 미지원으로 등록을 거부한다. secret 저장·입력·조회, 생성 UI·저장 뷰 runtime은 없다.

공용 작업은 id/version/effect/scope와 입력·결과 schema를 선언하고 같은 id의 handler를 연결한다. 1단계 기능 작업은 host scope만 지원하며 folder scope 선언은 미지원으로 거부한다. `activate(context)`는 operations/status/dispose를 반환한다. 미선언·누락 작업 handler는 활성화 실패다. 폴더 소스와 장식·계정은 선언한 기여의 상태 결과이며 앱 번들 아이콘만 표시한다. 폴더 열기는 기존 파일 Host가 검증한다. 문서 의미·공식 쓰기 경계는 변경하지 않는다.

## Host 상태와 호출

대상 daemon의 Host 설정 루트에 별도 plugins.json을 기록한다. `LITZIO_DATA_DIR` 또는 `LITZIO_PLUGINS_SETTINGS_FILE`로 격리할 수 있다. 임의 디렉터리 자동 탐색, SQLite, migration과 hot reload는 없다. 로컬 artifact 안의 파일을 digest로 묶고 패키지 밖 참조를 거부한다. 공식 공급 목록은 id·publisher와 제품이 검토한 artifact digest를 대조한다. 자칭 official 또는 변경 artifact는 공식 신뢰를 얻지 않는다.

등록 직후는 비활성이다. 기본 활성 정책은 미정이며 모든 플러그인은 명시적으로 활성화한다. 커뮤니티는 list에서 확인한 digest를 사용자가 trust한 뒤 enable한다. artifact가 달라지면 import하지 않는다. 교체는 daemon 재시작과 새 등록을 전제로 하며 자동 교체하지 않는다. 비활성화는 신규 호출을 먼저 차단하고 상태 기여를 숨긴 뒤 이미 접수한 호출을 drain하고 dispose한다. 설정과 열린 폴더·탭은 삭제하지 않는다. 모듈 unload나 OS 권한 격리는 보장하지 않는다.

`GET /api/plugins`는 목록, `POST /api/plugins`는 action과 해당 입력을 받는다. 관리 결과에는 목록과 requestId·operation·version·scope·outcome receipt가 있다. 기능 호출은 `action: invoke`, operation 완전 이름과 input을 받아 입력/출력 schema를 검사한다. Host 연결 실패 뒤 다른 Host나 로컬 실행으로 전환하거나 재전송하지 않는다.

CLI는 반드시 `--host <http(s) origin>`을 명시하고 daemon 프로토콜을 먼저 확인한다. JSON 결과는 대상 origin과 동일 Host 결과를 보존한다.

```text
plugins list --host <origin> --json
plugins unregister <id> --host <origin> --json
plugins register <artifact-directory> --host <origin> --json
plugins trust <id> --digest <digest> --host <origin> --json
plugins enable|disable <id> --host <origin> --json
plugins settings <id> [--file <json>] --host <origin> --json
operation invoke <pluginId.operationId> --input <json> --host <origin> --json
```

settings는 --file 없이 현재 일반 설정을 조회하며 변경은 비활성 상태에서만 받는다. 설정 UI는 기존 Settings 콘텐츠·Button·Input·SettingsSwitch·Dialog를 재사용한다. 목록은 Hosts 설정의 host-summary 행, 공통 settings-switch·Notice·Tooltip·Dialog와 HostStatus의 점/톤 스타일을 재사용한다. 이름·공급자/계층/신뢰 배지·설명을 왼쪽에 묶고 활성 토글은 같은 행 오른쪽 끝에 둔다. 상태는 지역화된 실행/감지 이름으로 표시하며 계정은 `계정: 라벨 (출처)`로 표시한다. 상단은 한 줄 경고와 상세 Tooltip이다. 목록은 공급 책임·신뢰·활성·실행과 오류를 구별하고 설명 창은 version·artifact digest를 표시한다. 비서는 별도 `manage_plugins` 도구로 같은 Host 함수를 호출한다. Codex dynamic tools에 연결하며 매 호출 기존 질문·답변 UI에서 대상과 내용을 확인하고 한 번 승인해야 한다. full-access도 생략하지 않는다. 중단·만료 시 실행하지 않는다. display 도구의 범위는 확대하지 않는다. 기존 Copilot adapter에는 새 도구 공급을 추가하지 않는다.

## OneDrive

`plugins/onedrive`는 SDK 타입과 Node API만 사용한다. `pnpm --filter @litzio/onedrive build`가 자체 실행 의존성을 포함한 artifact 디렉터리를 만든다. Host와 CLI는 OneDrive source를 import하지 않는다. artifact를 명시 등록·활성화한다.

Windows 환경 변수 OneDrive/OneDriveConsumer/OneDriveCommercial과 실재 폴더를 우선한다. HKCU Software/Microsoft/OneDrive/Accounts 직하위 계정의 UserFolder를 best-effort로 보완하며 중복 경로를 합친다. 조회 실패·불완전/없는 경로 수와 출처를 보존한다. UserEmail/DisplayName이 실제 조회된 경우만 표시하고, 그 밖에는 경로 기반 중립 라벨을 쓴다. raw 레지스트리 출력은 로그에 쓰지 않는다. SyncEngines, ini, WinRT, Graph/OAuth와 동기화 엔진은 사용하지 않는다. Linux 등 다른 OS에서는 지원하지 않음을 표시한다.

폴더 감지는 로그인이나 동기화 상태의 증거가 아니다. 유효 후보가 하나이고 기존 폴더·최근 폴더·문서 선택이 없을 때만 Explorer에서 열기 후보를 제안한다. 사용자가 기존 폴더 열기 경로로 연다. 복수 후보는 자동 선택하지 않으며 기존 폴더·탭을 덮지 않는다. 장식은 정확한 루트에 번들 Microsoft Fluent UI OneDrive 로고을 사용하고 자식에게 전파하지 않는다.

## 검증 경계

SDK 검사는 manifest와 미지원 확장·외부 schema를, Host 검사는 digest 신뢰·disable drain·설정 보존과 관리별 승인을 소유한다. OneDrive 검사는 주입한 환경·디렉터리·레지스트리로 단일/복수/없음/잔존을 검증하며 실제 계정에 의존하지 않는다. `pnpm browser:test http-plugins`는 격리된 production HTTP Host와 CLI·설정 UI 일치 및 비활성화 뒤 열린 폴더 보존을 확인한다. `--screenshots`는 수동 검토용 1440px·640px 설정·장식 캡처를 tmp/plugin-stage1에 남긴다. 필수 CI는 기존 전체 제품 판정을 유지한다.

1단계 UI는 로컬 Host만 지원한다. 원격 HostExplorer의 폴더 후보·장식 및 원격 Plugins 설정 UI는 이번 범위에 포함하지 않는다. CLI의 명시 대상 Host 계약과 구별한다. 누락된 artifact는 해당 플러그인만 artifact 없음으로 표시하며 다른 등록은 차단하지 않는다. unregister는 신규 요청 차단·진행 상태 조회/기능 작업 drain·dispose 뒤 등록과 일반 설정을 해제하고 artifact 파일은 삭제하지 않는다. 비서 unregister도 매 호출 명시 승인을 받는다. 상태 조회도 drain에 포함하며 비활성화 후 늦은 조회는 이전 폴더/장식을 반환하지 않는다.
