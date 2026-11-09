# ADR-0020: 플러그인 구조와 기본 화면

- Status: Accepted
- Decision date: 2026-11-05
- Last verified: 2026-11-06 — 소유자 정정으로 카탈로그 v2의 K2~K4를 공용 요소에 한정하고 4단계는 비서 제작 수락 시험임을 명시. 코드·2단계 수락 보고서·외부 공식 문서 대조는 2026-11-05 `d2b87e97` 기준. 제품 실행·설치·인증 재검증 없음.
- Authority: 2026-11-05 소유자 결정, under [AGENTS.md](../../AGENTS.md). 관련 보류 이슈: [#1075](https://github.com/litzio/litzio/issues/1075).
- Scope: 재개 시 사용할 저장소·Host·기여·UI·저장 구조의 결정. Accepted는 구현 완료가 아니다. 별도 개시된 OneDrive 구현과 후속 비서 제작 로드맵을 구분한다.
- Amends: [ADR-0019](0019-plugin-tiers.md)의 계층·공통 SDK·Host·번들 UI 경계를 구체화한다. [ADR-0012](0012-plugin-runtime-and-ui-contributions.md)·[ADR-0015](0015-shared-host-operations.md)·[ADR-0017](0017-bundled-client-and-official-ai.md)의 재개 시 실행·UI·비서 관리 경계는 아래 관계 절을 따른다.

## 배경과 근거

2026-11-06 동적 뷰의 새 정의와 두 데이터 종류에 관한 소유자 결정은 아래 [개정안](#동적-뷰-재정의-개정안-2026-11-06)에 정리했다. 당시 Proposed였던 이 절은 #1341에서 종료한 Historical 기록이다. 현재 플러그인 화면·조회·표 계약은 [플러그인 화면 계약](../design/plugin-screens-v1.md)을 따른다.

네 사례(OneDrive, GitHub/GitLab, Docling, Jira)를 같은 제작·실행·표시·저장 계약으로 설명한다. 특정 기능을 먼저 제품에 심고 나중에 플러그인으로 일반화하지 않는다. 문서 의미는 Core, 실행·연결·자격 증명은 대상 Host, 렌더러는 앱이 소유한다.

입력은 2026-11-05의 `<local-research>/plugin-architecture-proposal.md` 및 같은 폴더의 `plugin-arch-a-structure.md`, `plugin-arch-b-genui.md`다. 제안·정적 조사이며 실행 증명이 아니다. 보관 소스 기준은 `archive/plugins-docling-2026-11`의 `ce90560aacaee2482d37c4b25e36e93060ed156c`다. 제안서의 비서 관리 금지 추천과 저장 설명은 아래 소유자 정정으로 대체한다. 외부 프레임워크의 기능·안전성·직접 호환을 이 ADR로 보증하지 않는다.

## 결정

### ① 하나의 SDK·패키지 규격과 공급 책임에 따른 저장소

2026-11-06 소유자 결정 (#1271): 공개 SDK는 npm/tarball 배포 없이 Host가 실행 시점에 제공한다. 플러그인 단독 실행은 지원하지 않으며 SDK 버전은 Host에 묶인다. 구체 공급·import 우선순위는 [1단계 계약](../design/plugin-stage1-v1.md#host-제공-sdk-런타임-1271)을 따른다. 플러그인은 신뢰 코드이며 내부 import 차단은 실수로 내부 API에 의존하는 것을 막는 계약 강제이지 sandbox·보안 경계가 아니다. fs로 직접 읽어 eval하는 의도적 우회는 범위 밖이다.

공식 소스는 monorepo `plugins/<id>`, 커뮤니티 소스는 독립 저장소를 기본으로 한다. 두 계층은 같은 SDK·manifest·검증·권한을 쓴다. `tier`는 manifest 한 줄이며 ID·작업·설정·뷰 형식은 계층에 의존하지 않는다. 공식 승격은 유지 책임 인수와 **Host가 확인하는 공식 공급 목록** 갱신이 필요하다. 자칭 `official`은 확인되지 않으면 커뮤니티 신뢰 절차를 따른다. 번들 여부·신뢰·활성 상태는 각각 별도 기록이며 기본 활성값은 미정이다.

2026-11-09 소유자 승인 예외 ([#1321](https://github.com/litzio/litzio/issues/1321)): 개념 검증 동안 Docling 개인 플러그인 소스는 `community-plugins/docling/`에 둔다. 커뮤니티 계층이며 공식 공급 목록·Desktop 번들·기본 활성화에 포함하지 않는다. pnpm workspace에서 제외하고 외부 scaffold 구조 및 Host 제공 공개 `@litzio/plugin-sdk`만 사용한다. 독립 배포·유지 책임이 필요해지면 해당 디렉터리를 독립 저장소로 분리하며 Litzio 내부 import나 workspace 의존을 분리 전제로 추가하지 않는다. 서버 주소 설정·수동 연결 조회에 이어 #1322의 정정 범위는 PDF → 원본 `.docling` 보관과 `.docling` → Litzio 문서 만들기의 두 작업이다. 두 작업은 공개 SDK의 K1 일반 파일/native-document 결과로 구현하며 형식 해석은 플러그인에 둔다. 형식·변환 규칙·검증 한계는 플러그인 안내를 따른다. 사용·검증 경계는 [플러그인 안내](../../community-plugins/docling/README.md)를 따른다.

2026-11-09 같은 소유자 승인 예외 ([#1328](https://github.com/litzio/litzio/issues/1328))로 Jira도 `community-plugins/jira/`에 두며 위와 같은 workspace·공식 공급·번들 제외 및 공개 SDK 경계를 따른다. 설정·PAT·번호 기반 조회와 검증 범위는 [Jira 안내](../../community-plugins/jira/README.md)를 따른다.

재개 단계에 맞춰 다음 위치를 사용한다. 경로는 책임 배치이며 지금 디렉터리를 만들라는 지시가 아니다.

```text
packages/plugin-sdk/           # manifest·공용 작업·기여 타입/검증과 Host SDK
packages/core/src/views/       # 공통 UI 명세·뷰 의미/검증/canonical JSON (뷰 단계)
apps/editor/server/plugins/    # 설치·신뢰·상태·로딩·작업 연결
apps/editor/src/plugins/       # 앱 번들 설정·계정·폴더 기여 표시
apps/editor/src/views/         # 플러그인 기본 화면·공통 렌더러 (당시 생성·저장 뷰 단계는 #1341에서 종료)
plugins/onedrive/              # 공식; 공개 SDK만 사용
community repository/         # manifest, package.json, src/host.ts, test/, dist/host.js
```

설치 단위는 manifest·빌드된 Host entry·실행 의존성을 포함한 패키지이며 초기에는 로컬 산출물 등록만 제공한다. SDK는 React·Tiptap·Editor 내부 import 없이 사용할 수 있어야 한다. Host·CLI shell은 개별 플러그인 source를 직접 import하지 않는다.

**그래서 무엇이 안 되는가:** 계층별 SDK·특권 API, `official/`·`community/` 패키지 분리, 자칭 tier나 번들 여부에 따른 자동 실행은 없다. 빈 확장 디렉터리, Git/npm 자동 설치·marketplace·외부 SDK 배포망은 선제 구축하지 않는다.

### ② manifest는 실행 전 검증하는 선언이다

런타임 SSOT는 `litzio-plugin.json`, `package.json`은 빌드·의존성·배포용이다. 중복 버전은 빌드에서 일치시킨다. 다음은 필드 초안이며 구현된 API가 아니다. 세부 이름·schema는 해당 구현 PR에서 필요한 범위로 확정한다.

```json
{
  "schemaVersion": 1,
  "id": "example.jira",
  "tier": "community",
  "publisher": {"id": "example", "name": "Example"},
  "name": "Jira",
  "version": "0.1.0",
  "requiresSdk": ">=0.1.0 <0.2.0",
  "entry": "dist/host.js",
  "contributions": {
    "operations": [{"id": "issues", "version": 1, "effect": "read", "assistant": true,
      "inputSchema": "schemas/issues-input.json", "outputSchema": "schemas/issues-output.json"}],
    "folderSources": [], "folderDecorations": [], "accounts": [], "views": []
  },
  "settingsSchema": "schemas/settings.json",
  "secrets": [{"id": "pat", "scope": "connection", "required": true}]
}
```

`id`는 계층·저장소와 독립이며 작업 완전 이름은 `<pluginId>.<operationId>`다. publisher는 공급 메타데이터이지 인증 증명이 아니다. manifest schema, 플러그인 릴리스, SDK 요구 범위, 작업 version, UI schema/catalog version은 구분한다. 기존 JSON Schema validator·SemVer 라이브러리를 재사용한다. 충돌 ID, 알 수 없는 기여, 잘못된 schema, 누락 handler, 패키지 밖 참조, 미지원 SDK는 entry import 전에 거부한다. 참조 파일·handler는 패키지에 있어야 하고 코드도 선언된 기여만 연결한다.

**그래서 무엇이 안 되는가:** manifest 밖 등록, 원격 schema 다운로드·`$ref`, manifest에 PAT 값·trusted/enabled/bundled 상태 저장, 제품 버전의 플러그인 버전 복사는 없다. secret 선언은 OS 권한 제한이나 격리 장치가 아니다.

### ③ 대상 daemon의 하위 프로세스 신뢰 코드와 별도 상태

**2026-11-05 개정:** 최초 in-process 결정은 daemon 하위 프로세스의 trusted Node 코드로 대체한다. 아래 비서 제작 로드맵의 reload 계약을 따른다. 설치 목록·상태·일반 설정은 그 Host가 소유하며 임의 폴더 자동 탐색은 하지 않는다. installed/trusted/enabled/available/running을 구분한다. 커뮤니티는 설치 직후 실행 차단하고 **명시적 신뢰와 활성화가 모두 있어야** entry를 import한다. 신뢰는 설치 산출물 digest에 연결하고 변경된 산출물은 다시 확인한다.

활성화는 `activate(context)`와 기여 연결, 비활성화는 신규 작업 차단·기여 숨김 후 이미 받은 작업 drain과 `dispose()`다. 일반 operation은 drain하며, K1 파일 작업은 [1단계 계약](../design/plugin-stage1-v1.md#k1-파일-작업)에 따라 중단을 요청하고 미확정 상태는 uncertain으로 남긴다. 설정·secret·열린 문서는 보존하고 해당 source만 사용 불가로 표시한다. reload는 정지 → 정리 → 다시 불러오기 → 시작이며 daemon은 재시작하지 않는다. 실패하면 오류를 표시하고 실패 상태로 남긴다. 안전한 폭주 정지는 보장하지 않는다.

요청·결과·receipt는 [ADR-0018](0018-desktop-remote-hosts.md)의 대상 Host 고정을 따른다. 원격 폴더·계정은 원격 Host OS 계정의 것이다. 제품 버전 차이 경고·프로토콜 불일치 거부도 유지한다.

**그래서 무엇이 안 되는가:** 오류·악성 코드·무한 루프로부터 daemon, OS 파일·네트워크·자격 증명을 격리하지 않는다. 신뢰 후 안전 실행 보증, 무중단 코드 교체, 강제 안전 종료, Desktop 전역 실행·다른 Host fallback은 없다. 비활성화로 비서를 끄거나 저장 데이터를 삭제하지 않는다.

### ④ 자격 증명은 최초 Windows OS 저장소만 사용한다

2026-11-05 로드맵 1c 구현: 현재 단일 연결의 `(Host 저장 경로, pluginId, secretId)`를 Windows DPAPI CurrentUser로 보호한다. 다중 connectionId는 구현하지 않는다. 선택 근거·입력/상태/삭제·실행 전달 계약은 [1단계 계약](../design/plugin-stage1-v1.md#secret-저장과-실행-전달-로드맵-1c)을 따른다. 아래 연결별 키 설명은 다중 연결 도입 시의 방향이다.

대상 Host OS 계정의 저장소에 `(pluginId, connectionId, secretId)`로 보관한다. Windows Credential Manager 같은 기존 저장 API를 재사용하되 라이브러리·비대화형 계정 접근은 실제 검증한다. 지원 저장소가 없으면 secret 필요 기능을 사용 불가로 둔다. 일반 설정은 연결별 BaseURL·별칭을 담고 화면·결과에는 값 대신 설정 여부만 반환한다.

**secret 입력은 사용자가 앱 설정 UI에서 직접 한다.** 비서는 설정 화면으로 안내할 수 있지만 값을 입력받거나 읽지 않는다. argv·일반 설정 export·로그·비서 인자/결과·뷰·스냅샷에 PAT를 남기지 않는다. BaseURL의 userinfo·token query도 허용하지 않는다. 외부 API 인증·오류 응답은 Host 경계에서 정리한다.

**그래서 무엇이 안 되는가:** 평문 fallback, Desktop 전역 토큰, Host 간 자격 증명 동기화, 비서의 secret 값 열람·대화 보관은 없다. Windows 저장소 지원만으로 모든 원격 OS의 PAT 기능을 제공하지 않는다. 신뢰한 코드로부터 secret을 격리한다는 보증이나 #1145 인증 보류 해제도 아니다.

### ⑤ 최소 기여와 공용 작업·CLI·활동 기록을 남기는 비서 관리

[ADR-0015](0015-shared-host-operations.md)에 따라 새 기능과 관리 작업은 입력·결과·범위·receipt의 공용 정의와 CLI를 함께 제공한다. CLI는 공통 invoke를 연결하고 필요한 비서 도구도 같은 정의를 재사용한다. 다음 이름은 계약을 설명하는 후보이며 현재 명령이 아니다.

| 기여 지점 | 최소 계약 | 제한 |
| --- | --- | --- |
| 공용 작업 | ID/version·입출력 schema·effect·scope·handler·receipt | 조회/변경 구분, 호출 시 Host가 신뢰·활성·입력·범위 재검사 |
| 폴더 소스 | Host가 id/path/label/defaultCandidate 반환 | 기존 파일 Host가 검증·열기; 새 VFS 없음 |
| 폴더 장식 | 정확한 폴더 identity와 번들 icon key | 자식 전체 자동 장식·원격 실행 자산 없음 |
| 설정·계정 | JSON Schema form·설명·상태 작업 | 신뢰/활성/가용성·라벨·secret 설정 여부; 임의 React 코드 없음 |
| 기본 UI | 모든 플러그인에 항상 제공하는 앱 번들 컴포넌트의 선언형 검색 폼·결과 표 등 | 동적 UI로 영구 교체하거나 저장 뷰로 덮어쓰지 않음 |
| 데이터 뷰 | 읽기 작업 결과 schema와 공통 UI 명세 | 현재 Table·세로 패널; 당시 BarChart 계획은 #1341에서 종료 |
| 기본 화면 조회 | 공통 `view.validate/run`, manifest의 기본 정의 | 저장 뷰 파일·별도 dashboard DB 없음 |

`plugins list/register/trust/enable/disable/settings`, `operation invoke <id> --input <file> --host <target> --json`을 같은 정의로 연결한다. 비서는 **설치·신뢰·활성화·비활성화·설정**을 제어할 수 있어야 한다. 관리 작업은 `assistant` opt-in 여부를 이유로 모두 감추지 않고 공용 정의에서 비서 도구를 제공한다. **2026-11-05 개정:** 건마다 받던 명시 승인은 제거하며, 대상 Host·플러그인·변경 내용과 결과를 사용자에게 보이는 활동 기록으로 남긴다. 비서는 digest 신뢰 단계를 실행할 수 있지만 제품에 고정된 공식 공급 목록은 바꾸지 못한다. secret 값 변경은 사용자 직접 설정 UI 경로를 따른다.

기능 작업은 검토된 필요한 작업만 비서에 노출한다. schema 표시만으로 provider 연결이 완성되는 것은 아니며 Codex/Copilot adapter의 실제 호출 검증이 필요하다. 결과·receipt는 성공/거부/실패/결과 불확실, 대상·request ID·작업 version·필요한 path/revision을 구분한다. 쓰기는 공식 write path·revision 보호를 따르고 네트워크 실패 뒤 자동 재전송하지 않는다.

**그래서 무엇이 안 되는가:** secret 도구 공개, 공식 목록 변경, UI만의 기능·관리, 별도 문서 의미 구현은 없다. 종전의 제작 범위 밖 결정은 아래 제작 키트와 4단계 로드맵으로 대체한다. 승인 제거로 비서가 사용자 확인 없이 신뢰 코드를 설치·실행할 수 있으며 활동 기록은 이를 사전에 막지 않는다.

### ⑥ 생성 UI와 저장된 뷰는 같은 명세·같은 앱 렌더러다

**2026-11-09 개정 (#1341): 이 절의 비서 생성 UI·저장 뷰 결정을 종료한다.** 비서 생성·교정·출처/assistant source·snapshot·즐겨찾기·오른쪽 Views 탭·문서 통계·Chart·가로 Panel을 제거했다. 기존 경험은 [소유자의 목적](https://github.com/litzio/litzio/discussions/767#discussioncomment-19481395)을 이루지 못했다. 과거 소스와 실행 기록은 [보관본](https://github.com/litzio/litzio/tree/archive/dynamic-ui-2026-11) 및 [Historical 계약](../design/generated-views-v1.md)에 유지한다.

플러그인 기본 화면은 동적 UI와 구분한다. manifest screens·등록 read operation·입력 폼·공통 Table·링크·수동 조회와 jobs 패널, 완료 bundle의 review·V5 대조는 유지한다. 문서 의미는 Core, 실행/receipt는 Host, 상호작용은 앱 번들 컴포넌트가 소유한다. CLI는 view run·validate를 제공한다. 현재 형식·제한·소유권은 [플러그인 화면 계약](../design/plugin-screens-v1.md)을 따른다. 저장 파일 열기/쓰기·migration은 제공하지 않는다.

새 동적 UI는 업무 중 어떤 화면을 받고 무엇을 바꾸며 다음 작업이 어떻게 달라지는지를 먼저 정의한다. 과거 뷰 제안과 현재 화면, 표 정렬·필터와 업무 범위, 조회 인자와 AI에게 돌려줄 판단을 구분한다. 범용 이벤트 버스·workflow engine·UI DSL·앱 전체 JSON 전환·임의 HTML/React 실행을 먼저 만들지 않는다. 협의형 기능의 완료는 사용자 결정이 다음 AI 작업과 결과에 반영된 실행 기록으로 판단한다. 렌더링·검증·저장·CI만으로 완료를 주장하지 않는다.

### ⑦ OneDrive는 감지된 폴더와 확인 가능한 라벨부터 표시한다

대상 Windows Host의 환경 변수·실재 폴더와 확인 가능한 라벨·경로·정보 출처를 사용한다. 기존 선택/기억 폴더가 없고 유효 후보가 하나일 때만 기본 폴더 후보를 적용한다. 여러 후보는 사용자가 고른다. 기존 폴더·탭을 덮거나 비활성화하면서 닫지 않는다.

**그래서 무엇이 안 되는가:** 환경 변수·폴더 존재만으로 로그인·이메일·동기화 정상 상태를 확정하지 않는다. 미확인 이메일 추정, Desktop 계정을 원격 계정으로 표시, Linux Host에서 Windows 탐지 지원 표시는 없다. OAuth·동기화 엔진을 선제 구현하지 않는다.

### ⑧ 최초 단계 구분과 개정 로드맵

최초 결정은 OneDrive 별도 개시를 요구했다. 이후 소유자가 개시한 현재 구현은 [플러그인 1단계](../design/plugin-stage1-v1.md)를 따른다. 아래 표는 최초 순서를 보존한 기록이며, 후속 작업 순서·수락 기준은 아래 비서 제작 로드맵으로 대체한다. 이번 개정 PR은 문서만 변경한다. 각 구현 PR은 필요한 최소 기능·Implemented 계약·대상 검사·필수 CI를 함께 완료한다.

| 단계 | 최소 범위 | 완료 근거·제한 |
| --- | --- | --- |
| 1: OneDrive | 최소 manifest/SDK, 로컬 등록·Host 켜기/끄기, 폴더·아이콘·상태·설정·CLI·승인받는 관리 도구 | 실제 Windows 단일/복수/없는 폴더, CLI/UI 일치·기존 폴더 보존, 커뮤니티 신뢰 차단·관리별 승인 검증. secret·생성 UI·범용 job system은 만들지 않음 |
| 2: Jira 한 조회 (과거 계획; 생성·저장·Chart 범위는 #1341에서 종료) | Windows secret, 읽기 작업, 공통 Table·BarChart·생성 UI와 저장/재실행 | 실제 PAT/API·비서 adapter, CLI/UI 데이터 일치, 같은 렌더러·LLM 없는 재열기, Host 혼선 거부·secret 비노출·오류·저장 이름 충돌. 스냅샷 export는 실제 요구 시 추가 |
| 3: 외부 제작·사례 확장 | 독립 checkout의 SDK build/register, Docling 최소 변환·검수, GitHub/GitLab 한 조회씩 | 내부 import 없는 설치·실행, valid write·원본 보존, 장기 작업 실패/uncertain·실제 변환 품질. 부족 계약만 그때 추가 |

**그래서 무엇이 안 되는가:** Accepted·#1075 참조를 구현 재개·보류 해제·릴리스 승인으로 해석하지 않는다. OneDrive 성공으로 전체 SDK·저장 뷰·외부 제작 가능성을 완료 선언하지 않는다. CopilotKit/AG-UI/A2UI 전체 채택도 이번에 결정하지 않는다.

## 생성 UI 스파이크 결과에 따른 보완

#1341에서 종료한 생성·저장 뷰의 과거 결정이다. [당시 기록](https://github.com/litzio/litzio/blob/archive/dynamic-ui-2026-11/docs/adr/0020-plugin-architecture.md)과 [현재 플러그인 화면 계약](../design/plugin-screens-v1.md)을 구분한다.

### 확정한 결정

#1341에서 종료한 생성·저장 뷰의 과거 결정이다. [당시 기록](https://github.com/litzio/litzio/blob/archive/dynamic-ui-2026-11/docs/adr/0020-plugin-architecture.md)과 [현재 플러그인 화면 계약](../design/plugin-screens-v1.md)을 구분한다.

### 플러그인 기본 UI와 동적 UI의 관계

#1341에서 종료한 생성·저장 뷰의 과거 결정이다. [당시 기록](https://github.com/litzio/litzio/blob/archive/dynamic-ui-2026-11/docs/adr/0020-plugin-architecture.md)과 [현재 플러그인 화면 계약](../design/plugin-screens-v1.md)을 구분한다.

### 명세 v0 예시와 본 구현 경계

#1341에서 종료한 생성·저장 뷰의 과거 결정이다. [당시 기록](https://github.com/litzio/litzio/blob/archive/dynamic-ui-2026-11/docs/adr/0020-plugin-architecture.md)과 [현재 플러그인 화면 계약](../design/plugin-screens-v1.md)을 구분한다.

### 가공 범위 — (나) 확정

#1341에서 종료한 생성·저장 뷰의 과거 결정이다. [당시 기록](https://github.com/litzio/litzio/blob/archive/dynamic-ui-2026-11/docs/adr/0020-plugin-architecture.md)과 [현재 플러그인 화면 계약](../design/plugin-screens-v1.md)을 구분한다.

### 작업별 출력 schema 일반화 (#1218)

#1341에서 종료한 생성·저장 뷰의 과거 결정이다. [당시 기록](https://github.com/litzio/litzio/blob/archive/dynamic-ui-2026-11/docs/adr/0020-plugin-architecture.md)과 [현재 플러그인 화면 계약](../design/plugin-screens-v1.md)을 구분한다.

### 보안 거부 목록

#1341에서 종료한 생성·저장 뷰의 과거 결정이다. [당시 기록](https://github.com/litzio/litzio/blob/archive/dynamic-ui-2026-11/docs/adr/0020-plugin-architecture.md)과 [현재 플러그인 화면 계약](../design/plugin-screens-v1.md)을 구분한다.

## 비서 플러그인 제작 로드맵(2026-11-05 개정)

- Amendment date: 2026-11-05 — 소유자 결정으로 실행 모델·제작 범위·관리 승인·후속 순서를 개정한다. Status는 Accepted를 유지한다. 앞의 최초 단계 표와 스파이크 당시 판단은 역사적 근거이며 이 절이 후속 방향의 authority다.
- 근거: 소유자 원문 `<local-research>/authoring-roadmap-brief.md`, 같은 폴더의 `plugin-architecture-proposal.md`, `dynamic-ui-spike.md`, `docling-ui-contracts.md`. 조사 초안의 JSON 키는 확정 API가 아니다.
- 실행 모델 참고: [Paseo public-docs/plugins/index.md 58행](https://github.com/getpaseo/paseo/blob/66676d49e6336a75837abec247871553a7658c35/public-docs/plugins/index.md#L58) 및 [229–239행](https://github.com/getpaseo/paseo/blob/66676d49e6336a75837abec247871553a7658c35/public-docs/plugins/index.md#L229-L239). 로컬 고정 checkout과 문서를 대조했으며 Paseo runtime을 실행하지 않았다.

### 목표·단계와 수락 시험

최종 목표는 **비서가 Litzio 안에서 Jira·Docling 같은 플러그인을 스스로 만들어 붙이는 것**이다. 다음 수락 시험은 앞으로 구현에서 충족할 기준이며 이 문서 PR의 실행 결과가 아니다. 기존 OneDrive 1단계와 아래 로드맵 1단계는 구분한다.

| 단계 | 범위 | 수락 시험 |
| --- | --- | --- |
| 1: 기반(병렬) | (a) 하위 프로세스+reload, (b) [#1218](https://github.com/litzio/litzio/issues/1218)의 작업별 출력 schema 기반 일반화, (c) Windows OS secret 저장, (d) 비서 제작 키트, (e) K1 | daemon 재시작 없이 변경 반영·정리 및 reload 실패 상태 확인; 허용 작업 출력만 바인딩하고 잘못된 schema 거부; secret UI 입력·비서 비노출·평문 fallback 거부; scaffold→validate→reload를 같은 Host 작업과 CLI로 수행; 파일 한 개의 긴 작업 실패/uncertain·대기 중단·완료 결과 열기 확인 |
| 2: 첫 제작 | 비서가 `<mockup-server-repo>`의 목업 Jira 읽기 플러그인 제작, 요구 인터뷰는 대화로 진행 | **비서가 목업 Jira 읽기 플러그인을 만든다**: 제작·검증·등록·신뢰·활성·조회까지 수행하고 기본 UI와 CLI 결과 일치, 활동 기록·오류·secret 비노출을 확인 |
| 3: 카탈로그 v2 | 2단계에서 막힌 폼·버튼·선 차트·가로 배치와 K2·K3·K4 | 작업 schema 기반 폼/버튼 호출과 차트·배치, 페이지/영역 표시·선택, 양방향 대응·stale 차단, 교정 승인/거절/Undo·원본 보존을 확인 |
| 4: 비서 제작 수락 시험 | 비서가 Docling 플러그인 제작, K1~K4 연결. 제품 구현 지시 아님 | PDF 입력→변환 상태→완료 결과→페이지 이미지/Read 좌우 대조→교정 검토를 수행; 실제 변환·Core valid write·원본 보존·uncertain/no-replay와 CLI 공용 작업을 확인 |

**그래서 무엇이 안 되는가:** 목업 Jira 성공은 실제 Jira 배포별 인증·권한·pagination이나 Docling 품질의 증명이 아니다. 1단계에서 카탈로그 v2·Docling 전체를 구현하지 않는다. Accepted·문서 PR을 구현 완료·릴리스 승인으로 해석하지 않는다.

### 하위 프로세스 reload와 제작 키트

플러그인은 daemon의 하위 프로세스에서 실행한다. reload는 정지 → 정리 → 다시 불러오기 → 시작이며 daemon을 재시작하지 않는다. reload 실패는 실패 상태와 오류로 남기고 성공으로 숨기지 않는다. 진행 작업의 drain·uncertain/no-replay, 설정·secret·문서 보존은 유지한다. 저장 뷰 보존 서술은 #1341 이전의 기록이다.

제작 키트는 **비서용 플러그인 제작 스킬과 `plugins scaffold/validate/reload` 공용 작업**이다. 스킬은 공개 SDK·manifest·기여·검증·기본 UI·오류 확인 절차를 안내하고 세 작업은 ADR-0015의 입력·결과·범위·receipt 및 CLI를 함께 제공한다. validate는 실행 전 선언·패키지·schema 경계를 확인하며 코드 안전성을 증명하지 않는다.

**그래서 무엇이 안 되는가:** 하위 프로세스는 sandbox가 아니며 신뢰 코드의 OS 파일·네트워크·자격 증명 접근을 격리하지 않는다. 무중단 교체·자동 복구 성공·악성 코드 안전 실행을 보장하지 않는다. 제작 키트를 범용 패키지 배포망이나 자체 parser/editor engine으로 확대하지 않는다.

### 관리 승인 대신 활동 기록

설치·신뢰·활성화·비활성화·설정·reload 등 비서 플러그인 관리에서 건마다 받던 명시 승인을 제거한다. 필요하면 이후 별도 결정으로 다시 붙인다. 대상 Host·플러그인·작업·변경 내용·실행 시각·성공/거부/실패/불확실 및 receipt를 사용자에게 보이는 활동 기록으로 남긴다. 승인 대신 가시성으로 대응한다.

secret 값은 사용자가 설정 UI에서만 입력하며 비서는 읽거나 기록하지 못한다. 공식 목록은 제품에 고정되어 비서가 바꾸지 못한다. digest 신뢰 기록은 유지하며 비서가 신뢰 단계를 실행할 수 있다. 산출물 변경은 새 digest로 신뢰를 다시 기록한다.

**그래서 무엇이 안 되는가:** **비서가 사용자 확인 없이 신뢰 코드를 설치·실행할 수 있게 된다.** 잘못 생성하거나 선택한 코드가 Host OS 권한으로 실행될 위험을 수용하며 활동 기록은 예방 장벽이나 격리가 아니다. 이 결정은 플러그인 관리의 건별 승인만 제거하며 AI 권한·공급자·모델 변경 금지나 아래 K4의 문서 교정 승인을 제거하지 않는다. 2026-11-05 로드맵 1단계에서 건별 확인 제거·활동 기록을 구현했다. 현재 범위와 검증은 [플러그인 1단계](../design/plugin-stage1-v1.md#비서-제작-키트)를 따른다.

### K1과 카탈로그 v2·Docling 화면

K1은 **파일 입력·긴 작업 상태·결과 열기** 계약이다. 대상 Host Root의 파일을 Host가 재검증하고 start/status/stop/result-read를 공용 작업·CLI·비서에 연결한다. 실행은 빠르게 작업 identity를 반환하고 running/completed/failed/stopped/uncertain, 단계·경과·오류를 구분한다. 실제 진행량이 없으면 가짜 백분율을 만들지 않는다. 대기 중단과 서버 취소 요청·취소 완료를 구분하고 응답 상실은 상태 조회로 확인하며 자동 재전송하지 않는다. 완료 전 부분 결과는 공개하지 않고 완료 결과 참조를 기존 문서/폴더 열기에 연결한다. Core 공식 write path·이름 충돌 보호·원본 보존을 따른다.

**그래서 무엇이 안 되는가(K1):** Desktop 로컬 파일을 원격 Host 경로로 해석하거나 로컬 fallback하지 않는다. 첫 단계에서 로컬→원격 업로드·범용 scheduler/queue/DB를 만들지 않는다. 작업 상태 관찰을 저장 뷰 자동 polling의 허가로 확대하지 않으며 CLI 실행이 앱 탭을 자동으로 만들지는 않는다.

3단계 카탈로그 v2에는 다음 앱 번들 계약을 넣는다. 플러그인은 데이터·참조·작업 binding을 선언하며 원격 React/JS/CSS를 공급하지 않는다.

- **K2 페이지·영역:** Host가 제공하는 페이지 이미지, bbox 좌표 단위·원점, 장식·미지원·제외와 페이지 선택을 표현한다. 제외는 원본 삭제가 아니다.
- **K3 원본↔문서 대응:** 원본 영역과 Read 문서 블록의 다대다 대응·양방향 선택/강조·필요한 reveal을 제공한다. revision/hash가 맞지 않는 map은 stale로 표시하고 대상 이동·교정 적용을 막는다. 없는 대응을 발명하지 않는다.
- **K4 문서 변경 검토:** 문서·제안 baseline과 참조 자료의 revision, 근거·전후·pending/stale/inapplicable 및 승인/거절/Undo를 표현하는 공용 번들 화면과 Host 계약이다. 비서는 제안하고 사용자 승인 후 적용한다. 변경 적용·되돌리기는 Core operation과 공식 write path를 사용하며 적용 직전 baseline/stale 검사와 결과를 다시 읽는 동안의 갱신 중 표시를 유지한다. 특정 플러그인의 저장·재처리 방식이나 교정 종류를 가정하지 않는다.

Docling 교정의 저장·재처리 방식은 4단계로 미룸.

Docling 화면은 **왼쪽 페이지 이미지, 오른쪽 Read 문서의 좌우 대조**이며 넓은 화면을 전제로 한다([#891](https://github.com/litzio/litzio/issues/891) 방향 유지). 앱의 기존 Read·문서 열기·비서·변경 비교를 재사용한다.

**그래서 무엇이 안 되는가(K2~K4·화면):** PDF 텍스트 검색·주석·좁은 화면 최적화·대조 내 직접 편집은 하지 않는다. 표/차트나 native 문서 diff가 PDF provenance mapping을 대신하지 않는다. stale 자료를 현재 대응으로 표시하거나 관리 승인 제거를 교정 자동 적용으로 확대하지 않는다. 별도 PDF 엔진·Editor·플러그인 React runtime을 만들지 않는다.

## 카탈로그 v2 개정안 — 2단계 수락 결과 반영

#1341에서 생성·저장·Chart/가로 Panel 부분을 종료했다. 유지된 입력·Table·K2/K3/K4·V5 범위와 과거 수락 기록은 [정리된 설계](../design/catalog-v2.md)를 따른다. 실제 외부 서비스 수락이나 후속 비서 제작 단계를 구현 완료로 간주하지 않는다.

## 네 사례 대응과 남는 요구

| 사례·계층 | 공통 기여·가능한 동작 | 해당 단계에서 남는 요구 |
| --- | --- | --- |
| OneDrive·공식 | 폴더 소스/장식·설정·계정 상태, 기본 폴더 후보 | 실제 Windows 감지·확인 가능한 라벨. 폴더 존재는 로그인 증거가 아님 |
| GitHub/GitLab·공식 후보 | 연결·secret·계정·조회·공통 뷰로 프로젝트/커밋/외부 WorkItem 표시 | PAT/API·pagination 검증. 영속 WorkItem 연결 의미는 Core operation 결정 필요; 자동 양방향 동기화 제외 |
| Docling·커뮤니티 | 변환·검수 작업·공식 AI·CLI·비서·결과 뷰 | 장기 작업·취소·요청 identity·uncertain/no-replay·부분 결과 비공개·Core 적용·원본 보존. 원본 비교 UI는 표/차트로 충분하지 않으며 개정 로드맵의 K2~K4·페이지 이미지 좌우 대조를 따름 |
| Jira·커뮤니티 후보 | BaseURL/secret·계정·기본 화면 입력→수동 조회→공통 Table | 배포별 API·권한·pagination·changelog 검증. 재할당/재오픈/미완료/시간대 등 지표 정의는 typed args와 plugin operation이 소유; chart·LLM 임의 계산 제외 |

후보 계층은 자동 확정하지 않으며 계층을 바꿔도 계약은 같다. 네 사례가 이 문서만으로 모두 구현되거나 검증되었다는 뜻은 아니다.

## 보관 코드의 교훈과 하지 않는 것

보관 코드는 참고 자료이며 그대로 복원하지 않는다. source 직접 import 금지, 공식 쓰기·원본 보존, 요청 identity·중복 거부·uncertain/no-replay, disable 신규 차단·drain, 완료 결과만 공개하는 의미는 필요한 시나리오에서 유지·검증한다.

보관 최종 runtime은 SQLite/OS lock이며 초기 spike의 JSON/PID 기록과 다르다. worker/host/UI entry·React major·단일 AI service가 묶인 옛 manifest, 제품 버전 종속 플러그인 버전, 원격 ESM/CSS loader, 비서를 플러그인으로 만드는 구조는 복원하지 않는다. 범용 SQLite registry/lease/receipt ledger·worker orchestration·sandbox·세밀한 권한 엔진·marketplace·서명·자동 업데이트·플러그인별 dashboard DB는 선제 구축하지 않는다. 과거 fixture·synthetic REST·UI spike를 실제 Docling·외부 SDK·현재 Desktop의 실행 증명으로 재사용하지 않는다.

## 기존 결정과의 관계·검증

- **ADR-0019 구체화:** `pluginTier` 후보 대신 manifest 초안은 `tier`를 사용한다. 같은 SDK·공급 책임·별도 신뢰/활성·Host 소유를 유지하며 실행 모델·Windows secret·공통 UI/저장·관리 활동 기록을 정한다.
- **ADR-0012 개정:** 재개 시 별도 worker·same-origin ESM/CSS·live 코드 교체 대신 daemon 하위 프로세스 신뢰 코드·앱 카탈로그·reload를 따른다. 과거 구현 기록은 보존하고 Core 의미·공식 쓰기·원본·결과 불확실 보호는 유지한다.
- **ADR-0017 개정:** ADR-0017의 비서 플러그인 변경 금지를 삭제하고, 재개 시 ⑤의 건별 승인 없이 활동 기록을 남기는 관리로 대체한다. AI 권한·공급자·모델 변경 허용으로 확대하지 않는다. 기능 제거·보관·공식 AI와 별도 재개 조건은 유지한다. 현재 관리 도구는 [비서 제작 키트 계약](../design/plugin-stage1-v1.md#비서-제작-키트)에 따라 건별 확인 없이 활동 기록을 남긴다. [비서 계약](../design/main-agent-v1.md)의 일반 display 도구 허용 범위나 K4 교정 승인까지 넓히지 않는다.
- **ADR-0015 일부 개정·ADR-0018 유지:** ADR-0015의 비서 플러그인 변경 금지를 삭제하고, 재개 시 ⑤의 건별 승인 없이 활동 기록을 남기는 관리로 대체한다. AI 권한·공급자·모델 변경 금지와 새 기능·관리의 공용 정의·CLI 의무는 유지한다. ADR-0018의 대상 Host·receipt·버전 경계와 번들 script 정책을 따른다. 호환 계층·Host 간 자동 이동·공유 편집을 추가하지 않는다.

이 문서 PR은 소유자 결정·비지원 경계·용어·색인을 대조하고 `pnpm docs:check`와 필수 CI로 확인한다. 제품 실행·설치·credential·원격 연결은 수행하지 않는다. 실제 구현 시 기존 테스트를 우선 보완하고 각 단계의 고유 위험을 확인하며, 브라우저 검증은 `pnpm browser:test`와 저장소의 세션 정리 규칙을 따른다.

## 공식 번들 공급과 외부 폴더 추가 (#1279)

공식 OneDrive는 개발 실행·CLI·Desktop에 artifact를 포함하고 Host 시작 때 등록 없이 Settings → Plugins 및 공용 `plugins list`/비서 `manage_plugins` 목록에 표시한다. 기본은 꺼짐이다. 제품 공급 목록 `OFFICIAL_PLUGINS` 항목의 `defaultEnabled` 하나로 기본값을 바꾼다. Host는 사용자 선택 `enabledChoice`를 저장해 기본값보다 우선하고, 선택 전에는 설정 저장·재시작을 거쳐도 공급 기본값을 따른다. 기본값이 켜짐으로 바뀌면 선택하지 않은 사용자만 자동 활성화한다.

OneDrive 빌드는 공용 artifact digest 계산으로 artifact 밖 `digest.json`을 생성한다. CLI 빌드는 매번 OneDrive를 빌드해 artifact와 digest를 함께 복사하고 npm 배포 파일 목록에 포함한다. Desktop은 이 CLI 산출물 전체를 사용한다. 개발 `pnpm editor`도 OneDrive를 먼저 빌드한다. Host는 공급 목록 id·publisher·digest를 대조하며 불일치·누락은 오류 행으로 남기고 실행·trust 우회를 막는다. 공식 플러그인은 앱 업데이트와 함께만 갱신하며 등록 교체·unregister는 불가하고 끄기만 제공한다. 비활성화의 설정·secret·열린 폴더 보존 계약은 유지한다.

외부 플러그인은 “플러그인 추가…”에서 기존 Host 측 `FolderDialog`로 artifact 폴더를 선택한다. Settings의 별도 절대 경로 입력란은 제거한다. 기존 Button·FolderDialog·설정 행과 토글을 재사용하며 새 공통 UI 패턴은 없다. 폴더 탐색은 현재 Host client를 통해 수행하고 로컬 PC 파일 선택 창으로 대체하지 않는다. 1단계 설정 UI의 로컬 Host 범위는 유지하며 원격 UI를 새로 개방하지 않는다. CLI `plugins register <directory>`와 비서 도구의 외부 경로·trust·enable·unregister는 기존 공용 작업을 유지한다.

기본값 전환·명시적 선택·변조 차단은 Host 단위 검사, 첫 실행 표시·토글·외부 폴더 선택 연결은 `http-plugins`, 배포물 안 공급·실행은 CI packaged 검사에서 확인한다. 수동 1440 캡처는 `pnpm browser:test http-plugins --screenshots`의 `docs/design/assets/bundled-plugins-1279/bundled-1440.png`에 남긴다. 이는 localhost와 fixture 검증이며 실제 OneDrive 계정 동기화의 증거는 아니다.

## 동적 뷰 재정의 개정안 (2026-11-06)

2026-11-09 #1341로 종료했다. [Historical 제안](../design/dynamic-views-v1.md)을 현재 구현 요구사항으로 사용하지 않는다. 새 업무별 UI는 위 ⑥의 목적·소유자 기준으로 별도 정의한다.
