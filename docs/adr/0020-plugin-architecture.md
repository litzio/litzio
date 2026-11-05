# ADR-0020: 플러그인 구조와 공통 생성 UI·저장 뷰

- Status: Accepted
- Decision date: 2026-11-05
- Last verified: 2026-11-05 — 소유자 승인·정정과 관련 ADR·조사 문서 대조. 생성 UI 스파이크 보고서와 소유자 보완 결정 대조 포함. 제품 실행·설치·인증 재검증 없음.
- Authority: 2026-11-05 소유자 결정, under [AGENTS.md](../../AGENTS.md). 관련 보류 이슈: [#1075](https://github.com/litzio/litzio/issues/1075).
- Scope: 재개 시 사용할 저장소·Host·기여·UI·저장 구조의 결정. Accepted는 구현 착수·완료가 아니다. 1단계 OneDrive도 소유자가 따로 개시한다.
- Amends: [ADR-0019](0019-plugin-tiers.md)의 계층·공통 SDK·Host·번들 UI 경계를 구체화한다. [ADR-0012](0012-plugin-runtime-and-ui-contributions.md)·[ADR-0015](0015-shared-host-operations.md)·[ADR-0017](0017-bundled-client-and-official-ai.md)의 재개 시 실행·UI·비서 관리 경계는 아래 관계 절을 따른다.

## 배경과 근거

네 사례(OneDrive, GitHub/GitLab, Docling, Jira)를 같은 제작·실행·표시·저장 계약으로 설명한다. 특정 기능을 먼저 제품에 심고 나중에 플러그인으로 일반화하지 않는다. 문서 의미는 Core, 실행·연결·자격 증명은 대상 Host, 렌더러는 앱이 소유한다.

입력은 2026-11-05의 `C:\Projects\litzio\tmp\research\plugin-architecture-proposal.md` 및 같은 폴더의 `plugin-arch-a-structure.md`, `plugin-arch-b-genui.md`다. 제안·정적 조사이며 실행 증명이 아니다. 보관 소스 기준은 `archive/plugins-docling-2026-11`의 `ce90560aacaee2482d37c4b25e36e93060ed156c`다. 제안서의 비서 관리 금지 추천과 저장 설명은 아래 소유자 정정으로 대체한다. 외부 프레임워크의 기능·안전성·직접 호환을 이 ADR로 보증하지 않는다.

## 결정

### ① 하나의 SDK·패키지 규격과 공급 책임에 따른 저장소

공식 소스는 monorepo `plugins/<id>`, 커뮤니티 소스는 독립 저장소를 기본으로 한다. 두 계층은 같은 SDK·manifest·검증·권한을 쓴다. `tier`는 manifest 한 줄이며 ID·작업·설정·뷰 형식은 계층에 의존하지 않는다. 공식 승격은 유지 책임 인수와 **Host가 확인하는 공식 공급 목록** 갱신이 필요하다. 자칭 `official`은 확인되지 않으면 커뮤니티 신뢰 절차를 따른다. 번들 여부·신뢰·활성 상태는 각각 별도 기록이며 기본 활성값은 미정이다.

재개 단계에 맞춰 다음 위치를 사용한다. 경로는 책임 배치이며 지금 디렉터리를 만들라는 지시가 아니다.

```text
packages/plugin-sdk/           # manifest·공용 작업·기여 타입/검증과 Host SDK
packages/core/src/views/       # 공통 UI 명세·뷰 의미/검증/canonical JSON (뷰 단계)
apps/editor/server/plugins/    # 설치·신뢰·상태·로딩·작업 연결
apps/editor/src/plugins/       # 앱 번들 설정·계정·폴더 기여 표시
apps/editor/src/views/         # 생성 UI와 저장 뷰의 공통 앱 렌더러 (뷰 단계)
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

### ③ 대상 daemon의 in-process 신뢰 코드와 별도 상태

최초 runtime은 대상 daemon 안의 trusted Node 모듈이다. 설치 목록·상태·일반 설정은 그 Host가 소유하며 임의 폴더 자동 탐색은 하지 않는다. installed/trusted/enabled/available/running을 구분한다. 커뮤니티는 설치 직후 실행 차단하고 **명시적 신뢰와 활성화가 모두 있어야** entry를 import한다. 신뢰는 설치 산출물 digest에 연결하고 변경된 산출물은 다시 확인한다.

활성화는 `activate(context)`와 기여 연결, 비활성화는 신규 작업 차단·기여 숨김 후 이미 받은 작업 drain과 `dispose()`다. 진행 작업을 자동 취소하지 않는다. 설정·secret·저장 뷰·열린 문서는 보존하고 해당 source만 사용 불가로 표시한다. 모듈 unload·폭주 정지는 보장하지 않는다. 실패하면 오류·재시작 필요를 알리며 패키지 교체는 drain 후 daemon 재시작으로 시작한다.

요청·결과·receipt는 [ADR-0018](0018-desktop-remote-hosts.md)의 대상 Host 고정을 따른다. 원격 폴더·계정은 원격 Host OS 계정의 것이다. 제품 버전 차이 경고·프로토콜 불일치 거부도 유지한다.

**그래서 무엇이 안 되는가:** 오류·악성 코드·무한 루프로부터 daemon, OS 파일·네트워크·자격 증명을 격리하지 않는다. 신뢰 후 안전 실행 보증, hot reload, 강제 안전 종료, Desktop 전역 실행·다른 Host fallback은 없다. 비활성화로 비서를 끄거나 저장 데이터를 삭제하지 않는다.

### ④ 자격 증명은 최초 Windows OS 저장소만 사용한다

2026-11-05 로드맵 1c 구현: 현재 단일 연결의 `(Host 저장 경로, pluginId, secretId)`를 Windows DPAPI CurrentUser로 보호한다. 다중 connectionId는 구현하지 않는다. 선택 근거·입력/상태/삭제·실행 전달 계약은 [1단계 계약](../design/plugin-stage1-v1.md#secret-저장과-실행-전달-로드맵-1c)을 따른다. 아래 연결별 키 설명은 다중 연결 도입 시의 방향이다.

대상 Host OS 계정의 저장소에 `(pluginId, connectionId, secretId)`로 보관한다. Windows Credential Manager 같은 기존 저장 API를 재사용하되 라이브러리·비대화형 계정 접근은 실제 검증한다. 지원 저장소가 없으면 secret 필요 기능을 사용 불가로 둔다. 일반 설정은 연결별 BaseURL·별칭을 담고 화면·결과에는 값 대신 설정 여부만 반환한다.

**secret 입력은 사용자가 앱 설정 UI에서 직접 한다.** 비서는 설정 화면으로 안내할 수 있지만 값을 입력받거나 읽지 않는다. argv·일반 설정 export·로그·비서 인자/결과·뷰·스냅샷에 PAT를 남기지 않는다. BaseURL의 userinfo·token query도 허용하지 않는다. 외부 API 인증·오류 응답은 Host 경계에서 정리한다.

**그래서 무엇이 안 되는가:** 평문 fallback, Desktop 전역 토큰, Host 간 자격 증명 동기화, 비서의 secret 값 열람·대화 보관은 없다. Windows 저장소 지원만으로 모든 원격 OS의 PAT 기능을 제공하지 않는다. 신뢰한 코드로부터 secret을 격리한다는 보증이나 #1145 인증 보류 해제도 아니다.

### ⑤ 최소 기여와 공용 작업·CLI·승인받는 비서 관리

[ADR-0015](0015-shared-host-operations.md)에 따라 새 기능과 관리 작업은 입력·결과·범위·receipt의 공용 정의와 CLI를 함께 제공한다. CLI는 공통 invoke를 연결하고 필요한 비서 도구도 같은 정의를 재사용한다. 다음 이름은 계약을 설명하는 후보이며 현재 명령이 아니다.

| 기여 지점 | 최소 계약 | 제한 |
| --- | --- | --- |
| 공용 작업 | ID/version·입출력 schema·effect·scope·handler·receipt | 조회/변경 구분, 호출 시 Host가 신뢰·활성·입력·범위 재검사 |
| 폴더 소스 | Host가 id/path/label/defaultCandidate 반환 | 기존 파일 Host가 검증·열기; 새 VFS 없음 |
| 폴더 장식 | 정확한 폴더 identity와 번들 icon key | 자식 전체 자동 장식·원격 실행 자산 없음 |
| 설정·계정 | JSON Schema form·설명·상태 작업 | 신뢰/활성/가용성·라벨·secret 설정 여부; 임의 React 코드 없음 |
| 기본 UI | 모든 플러그인에 항상 제공하는 앱 번들 컴포넌트의 선언형 검색 폼·결과 표 등 | 동적 UI로 영구 교체하거나 저장 뷰로 덮어쓰지 않음 |
| 데이터 뷰 | 읽기 작업 결과 schema와 공통 UI 명세 | 앱 카탈로그의 Table·BarChart·세로 패널부터 |
| 저장된 뷰 | 공통 `view.validate/save/run`, 선택적 preset | 플러그인별 dashboard DB·별도 저장 API 없음 |

`plugins list/register/trust/enable/disable/settings`, `operation invoke <id> --input <file> --host <target> --json`을 같은 정의로 연결한다. 비서는 **설치·신뢰·활성화·비활성화·설정**을 제어할 수 있어야 한다. 관리 작업은 `assistant` opt-in 여부를 이유로 모두 감추지 않고 공용 정의에서 비서 도구를 제공한다. 다만 **실행할 때마다 사용자의 명시적 허락**을 받으며 기존 비서 쓰기 승인 흐름을 재사용한다. 대상 Host·플러그인·변경 내용을 제시하고 승인받은 작업만 실행한다. 전체 접근·기존 신뢰·이전 승인도 이 매번 승인 조건을 생략하지 않는다. secret 값 변경은 사용자 직접 설정 UI 경로를 따른다.

기능 작업은 검토된 필요한 작업만 비서에 노출한다. schema 표시만으로 provider 연결이 완성되는 것은 아니며 Codex/Copilot adapter의 실제 호출 검증이 필요하다. 결과·receipt는 성공/거부/실패/결과 불확실, 대상·request ID·작업 version·필요한 path/revision을 구분한다. 쓰기는 공식 write path·revision 보호를 따르고 네트워크 실패 뒤 자동 재전송하지 않는다.

**그래서 무엇이 안 되는가:** 무허가 제어·자동 승인·묵시적 승인·포괄적 사전 승인, secret 도구 공개, UI만의 기능·관리, 별도 문서 의미 구현은 없다. 비서의 플러그인 제작도 장차 명시적 허락 아래 제어할 방향이지만 이번 범위 밖이며 제작·빌드·설치 자동화를 착수하지 않는다.

### ⑥ 생성 UI와 저장된 뷰는 같은 명세·같은 앱 렌더러다

**고정 UI는 동적 UI를 멈춰 놓은 것이다.** 대화 중 비서가 생성한 일시적 UI와 이름 붙여 저장한 뷰는 같은 UI 명세, 같은 앱 렌더러를 사용한다. 저장은 그 명세를 `.view.json` 파일로 고정하는 일이다. Litzio 안에서 생성 UI와 저장된 뷰는 같은 형태로 보이고 다룰 수 있어야 한다. 저장 뷰를 다시 열 때 LLM 재생성은 없다. 정의 고정과 데이터 고정은 구별한다.

```json
{
  "kind": "litzio-view", "schemaVersion": 1,
  "catalog": "litzio-dashboard-v1", "title": "진행 중 이슈", "refresh": "manual",
  "sources": {"issues": {"operation": "example.jira.issues", "version": 1,
    "args": {"connection": "team-jira", "filter": "assigned-to-me"}}},
  "panels": [{"component": "Table", "source": "issues", "data": "/rows"}]
}
```

위 JSON은 공통 형식 초안이다. 비서는 카탈로그·작업 schema 안에서 명세를 제안하고 Host가 검증·실행하며 앱이 렌더링한다. 최초 카탈로그는 앱 번들의 Table·BarChart·세로 패널이며 새 컴포넌트는 앱 변경으로 공급한다. 원격 JS/CSS는 금지한다. unknown component/prop/action, HTML·임의 URL fetch·수식 eval은 거부하고 결과 path·typed args·크기를 검증하며 텍스트는 escape한다.

Core는 일시적·저장 명세의 구조·바인딩·정적 유효성·canonical serialization을 함께 소유한다. Host는 실제 operation/schema·연결·가용성을 검증·실행하고 `packages/file-commit`의 새 파일 안전 생성을 재사용한다. 저장 뷰는 항상 새 이름으로 만들고 같은 이름이 있으면 거부한다. Editor·CLI·플러그인은 parser나 의미를 별도로 만들지 않는다. 파일은 대상 Host가 소유한다. 즐겨찾기 저장 위치는 아래 확정 결정에 따라 Host의 플러그인별 데이터 폴더다. 문서 데이터 읽기는 선택한 Root 경계를 유지한다. 사람이 읽는 plain-text 파일이 SSOT이며 DB·캐시는 원본이 아니다.

데이터는 기본적으로 질의를 다시 실행하되 **수동 새로고침**으로 실행한다. 파일을 열었다는 이유로 자동 조회·polling하지 않는다. `currentUser`는 해당 Host 연결 계정, 상대 기간은 실행 시각 기준임을 표시하고 실제 대상·계정 라벨·해석된 기간·조회 시각·작업 version을 receipt에 남긴다. `.view.json`에는 query·필터·표현·연결 별칭을 저장하며 기본적으로 rows는 복제하지 않는다.

데이터까지 고정하려면 별도 `.snapshot.json`에 같은 UI 표현과 실행 데이터·조회 시각·해석 조건·작업 version·receipt를 담아 정적으로 표시한다. 스냅샷은 질의 재실행 권한이 아니다. 뷰·스냅샷에 secret·Host URL·Desktop 등록 hostId를 넣지 않는다. 실행 대상은 열린 파일의 Host 문맥 또는 CLI 명시 대상이다. 다른 Host로 복사하면 연결 별칭이 같아도 계정 표시를 확인해 명시적으로 바인딩하기 전에는 실행하지 않는다.

`view validate`, `view save`(항상 새 이름으로 생성, 같은 이름은 거부), `view run --host … --json`은 공통 정의로 제공하며 CLI run은 데이터·패널별 오류·receipt를 반환한다. 미지원 버전·비활성 플러그인·계정 없음·조회 실패는 파일을 보존하고 이유를 표시한다. 일부 source 실패를 전체 성공·빈 데이터로 바꾸지 않는다.

**그래서 무엇이 안 되는가:** 대화용과 고정 대시보드용의 별도 UI 형식·렌더러, 저장 뷰를 여는 LLM 재생성, 원격 component 설치·임의 JS/CSS 실행은 없다. 기본 저장만으로 과거 숫자를 고정하거나 자동 실시간 대시보드가 되지 않는다. Markdown 삽입·범용 transform DSL·scheduler·과거 형식 migration은 이번 범위 밖이다.

### ⑦ OneDrive는 감지된 폴더와 확인 가능한 라벨부터 표시한다

대상 Windows Host의 환경 변수·실재 폴더와 확인 가능한 라벨·경로·정보 출처를 사용한다. 기존 선택/기억 폴더가 없고 유효 후보가 하나일 때만 기본 폴더 후보를 적용한다. 여러 후보는 사용자가 고른다. 기존 폴더·탭을 덮거나 비활성화하면서 닫지 않는다.

**그래서 무엇이 안 되는가:** 환경 변수·폴더 존재만으로 로그인·이메일·동기화 정상 상태를 확정하지 않는다. 미확인 이메일 추정, Desktop 계정을 원격 계정으로 표시, Linux Host에서 Windows 탐지 지원 표시는 없다. OAuth·동기화 엔진을 선제 구현하지 않는다.

### ⑧ 구조 승인과 구현 착수는 별개다

이번 변경은 문서만이며 **1단계 OneDrive는 소유자가 따로 개시한다.** 각 구현 PR은 필요한 최소 기능·Implemented 계약·대상 검사·필수 CI를 함께 완료한다.

| 단계 | 최소 범위 | 완료 근거·제한 |
| --- | --- | --- |
| 1: OneDrive | 최소 manifest/SDK, 로컬 등록·Host 켜기/끄기, 폴더·아이콘·상태·설정·CLI·승인받는 관리 도구 | 실제 Windows 단일/복수/없는 폴더, CLI/UI 일치·기존 폴더 보존, 커뮤니티 신뢰 차단·관리별 승인 검증. secret·생성 UI·범용 job system은 만들지 않음 |
| 2: Jira 한 조회 | Windows secret, 읽기 작업, 공통 Table·BarChart·생성 UI와 저장/재실행 | 실제 PAT/API·비서 adapter, CLI/UI 데이터 일치, 같은 렌더러·LLM 없는 재열기, Host 혼선 거부·secret 비노출·오류·저장 이름 충돌. 스냅샷 export는 실제 요구 시 추가 |
| 3: 외부 제작·사례 확장 | 독립 checkout의 SDK build/register, Docling 최소 변환·검수, GitHub/GitLab 한 조회씩 | 내부 import 없는 설치·실행, valid write·원본 보존, 장기 작업 실패/uncertain·실제 변환 품질. 부족 계약만 그때 추가 |

**그래서 무엇이 안 되는가:** Accepted·#1075 참조를 구현 재개·보류 해제·릴리스 승인으로 해석하지 않는다. OneDrive 성공으로 전체 SDK·저장 뷰·외부 제작 가능성을 완료 선언하지 않는다. CopilotKit/AG-UI/A2UI 전체 채택도 이번에 결정하지 않는다.

## 생성 UI 스파이크 결과에 따른 보완

- Amendment date: 2026-11-05 — 소유자 결정 1~7과 추가 결정(설정 이전 보류·기본 UI/동적 UI 관계) 반영. 독립 검토 후 신규 저장 전용과 제한된 동일 모델 오류 수정 규칙을 명확히 했다. 후속 소유자 결정으로 가공 (나), 즐겨찾기 용어, Host의 플러그인별 데이터 폴더 저장과 1단계 새 탭 표시를 확정했다. Status는 Accepted를 유지한다.
- 근거: [동적 UI 스파이크 브랜치](https://github.com/litzio/litzio/tree/spike/dynamic-ui), 확인 head `28b298cd01b13e1b1cf7711c54e89ce7195f4d14`의 조사 보고서 `tmp/research/dynamic-ui-spike.md`. 스파이크는 역사적 실험이며 제품 구현 계약이 아니다.
- 검증 범위: 독립 화면의 실제 Codex 호출, 같은 Core 명세·앱 렌더러, 생성→저장→재열기→수동 조회와 CLI 데이터 일치를 보고서로 대조했다. 이번 문서 작업에서 재실행하지 않았다. 기존 비서 통합·실제 Copilot·원격 Host·외부 API·설치 제품·필수 PR CI의 실행 증거로 사용하지 않는다.

### 확정한 결정

1. 저장 뷰를 열면 **명세만 표시**한다. LLM 재생성·데이터 조회는 하지 않으며, 데이터는 사용자가 수동 실행(새로고침)할 때 조회한다. 저장은 정의 고정이며 데이터 고정이 아니다.
2. 바인딩과 카탈로그는 **작업별 출력 schema의 정해진 필드만** 허용한다. source·결과 path·Table 열·BarChart 축의 타입을 검증한다. HTML·외부 컴포넌트는 허용하지 않는다. 가공 범위는 아래 소유자 확정 (나)를 따른다.
3. **설정 화면 이전은 보류한다.** 동적 UI가 안정된 뒤 선택한다. 스파이크는 읽기 정보만 표현했고 버튼·선택·진행률·재시도 같은 조작을 표현하지 못했다. 조작 컴포넌트(버튼 → 공용 작업 호출, 필요 시 승인)를 추가하는 시점에도 다시 검토한다. 이번 결정은 보류이며 동적 UI 안정 후 선택한다.
4. **생성 UI는 비서 기능**이다. 본 구현에서 기존 Codex·Copilot 공급자 adapter가 최종 명세 이벤트와 검증 오류를 공유하고 같은 앱 렌더러로 연결한다. 부분 스트리밍 명세는 검증 완료로 취급하지 않는다. 독립 Codex CLI 스파이크는 이 통합을 완료하지 않았다.
5. **file-commit에 새 파일 안전 생성을 추가**한다. 이는 동적 UI 상태를 항상 새 이름으로 저장하는 기반이다. 임시 파일에 완성된 내용을 쓴 뒤 같은 이름이 없을 때만 확정한다. 중복이면 기존 파일을 보존하고 실패하며 예약용 빈 파일을 남기지 않는다. 기존 저장된 뷰를 수정하는 경로는 별도로 미룬다. 다른 공식 변경 경로의 revision 보호는 유지한다. 스파이크의 빈 파일 예약 방식을 그대로 채택하지 않는다.
6. **모델은 사용자가 비서 창에서 고른다.** 생성 UI만의 별도 기본 모델 정책은 없다. 실패하면 명시적 오류를 표시한다. **허용:** 검증 오류를 같은 대화의 같은 모델에 돌려줘 고치게 하는 흐름은 최대 2회로 제한하고 오류·수정 시도를 사용자에게 표시한다. 스파이크는 이 오류 반환·수정 흐름을 검증했다. **금지:** 사용자 모르게 반복하는 자동 재시도와 다른 모델로 바꾸는 재시도. 스파이크 보고서의 luna low 기본값 권고는 채택하지 않는다.
7. **CopilotKit은 개념만 차용하고 라이브러리는 도입하지 않는다.** 앱이 렌더 컴포넌트를 소유하고 에이전트는 명세만 제안한다. 최소 상태만 노출하고 검증 후 표시하며, 렌더와 사용자 실행·승인을 구분한다. 문서 SSOT를 agent shared state로 대체하지 않는다.

### 플러그인 기본 UI와 동적 UI의 관계

모든 플러그인에는 **기본 UI가 항상 있다.** 기본 UI는 앱 번들 컴포넌트로 선언한다. 예를 들어 Jira에는 이슈 검색 폼과 결과 표가 원래 있다. 동적 UI는 이 기본 UI를 대체하지 않고 참여한다.

2026-11-05 소유자 결정으로 **1단계는 (a) 새 탭으로 표시**한다. 기본 UI를 건드리지 않아 단순하고 안전하다. 본 구현 1단계는 내장 문서 통계 작업의 기본 UI(표)를 먼저 두고 비서가 만든 동적 UI를 새 탭으로 연다. **(b) 기본 UI의 특정 패널 표현 변경**(예: 결과 표를 차트로)은 이후 단계 후보로 남긴다.

사용자 동작은 **★ 즐겨찾기에 추가**, 플러그인 UI의 진입점은 **즐겨찾기 목록**이다. 즐겨찾기 뷰는 이름이 있는 동적 UI 상태(명세 + 질의)를 고정한 것이며 목록에서 다시 불러온다. 기존의 “저장된 뷰”와 같은 개념의 사용자 표시 이름이고, 파일 형식은 기존 결정의 `.view.json`이다. 기본 UI는 덮어쓰지 않는다. 새 이름으로만 추가하며 결정 5의 새 파일 안전 생성으로 이름 충돌 시 기존 파일을 보존한다.

**저장 위치 — 소유자 확정:** 문서 폴더가 아니라 Host의 플러그인별 데이터 폴더에 `.view.json` 파일로 둔다. 사용자가 저장 위치를 고르지 않는다. plain-text이므로 읽을 수 있고 CLI `view run`도 그대로 사용한다. 정확한 폴더·목록 관리 세부는 1단계 구현에서 정하되 별도 DB나 registry를 미리 결정하지 않는다.

**그래서 무엇이 안 되는가(저장 위치):** 즐겨찾기는 탐색기의 문서 폴더에 보이지 않고 문서 저장소(Git 등)에 자동으로 함께 저장되지 않는다. 문서 폴더로 내보내기는 필요할 때 별도 기능으로 추가한다.

**그래서 무엇이 안 되는가:** 동적 UI로 기본 UI를 영구 교체할 수 없고 저장된 뷰가 기본 UI를 덮어쓸 수 없다. 동적 UI 저장을 기존 파일 덮어쓰기로 연결하지 않는다. 기존 파일용 revision 계약은 다른 공식 변경 경로의 보호이며 이 저장 정책을 우회하지 않는다.

### 명세 v0 예시와 본 구현 경계

아래는 스파이크의 축약 예시이며 제품 v1이나 저장 호환성 약속이 아니다. v1 검증·canonical 의미는 Core에서 확정한다.

```json
{
  "kind": "litzio-view", "schemaVersion": 0, "catalog": "litzio-spike-v0",
  "title": "폴더별 문서 수", "refresh": "manual",
  "sources": {"stats": {"operation": "folder.statistics", "version": 1, "args": {}}},
  "layout": {"component": "VerticalPanel", "children": [
    {"component": "Table", "source": "stats", "data": "/rows", "columns": ["folder", "documents"]}
  ]}
}
```

생성 UI [본 구현 1단계 #1210](https://github.com/litzio/litzio/issues/1210)는 Core 명세 v1(검증·canonical), Host 공용 작업과 CLI `view validate/save/run`, file-commit 새 파일 안전 생성, 비서 양 공급자 adapter, `.view.json` 기본 통계 표, 새 탭으로 동적 UI 표시, ★ 즐겨찾기에 추가, 즐겨찾기 목록 불러오기와 수동 새로고침이다. 데이터는 폴더 문서 통계 같은 **내장 읽기 작업**으로 시작한다. 이는 위 ⑧의 플러그인 1단계 OneDrive와 별도 범위이며 Jira·SDK folder scope·플러그인 generatedUi/views 확장을 선행 조건으로 삼지 않는다. 현재 [플러그인 1단계 계약](../design/plugin-stage1-v1.md)의 미지원 선언은 그대로 유효하다.

완료 기준은 비서 창에서 생성 → 저장 → 다시 열기 → 새로고침 → CLI 결과 일치와 아래 보안 거부 회귀다. 실행별 request ID·시각 차이는 구분하고 데이터·패널 오류·대상·receipt 의미를 비교한다. 구현 PR에서 [비서 계약](../design/main-agent-v1.md)과 새 동작 계약을 함께 갱신한다.

### 가공 범위 — (나) 확정

2026-11-05 소유자는 (나)를 확정했다. 작업별 출력 schema의 정해진 필드에 대해 정렬, 필터(같음·포함·범위), 개수 제한과 **필드 하나로 묶기(groupBy, 날짜는 일·주·월 단위)**, **count/sum/avg/min/max**를 허용한다. 계산은 Core가 정해진 방식으로만 수행하며 UI·CLI가 별도 계산 의미를 구현하지 않는다.

여러 필드 조인, 사용자 정의 수식, 백분위 같은 고급 통계, 계산식은 허용하지 않는다. 범용 transform DSL·임의 코드 실행도 도입하지 않는다. #1210은 이 범위를 명세·검증·렌더·CLI 계약에 반영하고 집계 결과의 UI/CLI 일치를 검증한다.

### 보안 거부 목록

- 알 수 없는 component/prop/action, HTML·JS handler·CSS·원격 JS/CSS·외부 컴포넌트, javascript URL·임의 URL fetch·eval·임의 코드 실행을 거부한다. 여러 필드 조인·사용자 정의 수식·백분위 같은 고급 통계·계산식도 거부한다. 텍스트는 escape해 표시한다.
- 미등록 작업·미지원 schema/catalog/operation version·typed args 위반, 출력 schema 밖 필드·다른 작업 필드와의 교차 바인딩·잘못된 result path·비숫자 chart 축을 거부한다.
- 명세·패널·결과·파일·순회 크기 제한을 두고 초과를 거부한다. v0의 측정용 한도를 제품 v1의 고정값으로 삼지 않는다.
- Root 밖 읽기/쓰기·신규 중복 저장을 거부한다. 저장된 뷰의 기존 파일 수정 경로는 별도로 미룬다. secret·Host URL·Desktop hostId를 명세나 결과 스냅샷에 저장하지 않으며 Host 간 자동 fallback·재바인딩을 하지 않는다.
- 검증 실패·일부 source 실패를 성공이나 빈 데이터로 숨기지 않는다. 렌더 완료를 실행·저장 승인으로 취급하지 않는다. 신뢰한 Node 코드의 OS sandbox나 악성 코드 격리를 보장하지 않는다.

**그래서 무엇이 안 되는가:** 열기만으로 최신 데이터가 보장되지 않으며 자동 조회·polling·LLM 재생성·다른 모델 자동 재시도는 없다. 임의 필드 발명·HTML·외부 컴포넌트와 기본 UI의 영구 교체·덮어쓰기는 안 된다. 설정 화면 이전은 동적 UI 안정 후 선택할 보류 사항이다. 내장 통계 성공으로 플러그인 생성 UI·Jira·양 공급자 제품 통합 완료를 선언하지 않는다. 스파이크 코드를 그대로 병합하거나 CopilotKit runtime을 추가하지 않는다.

## 네 사례 대응과 남는 요구

| 사례·계층 | 공통 기여·가능한 동작 | 해당 단계에서 남는 요구 |
| --- | --- | --- |
| OneDrive·공식 | 폴더 소스/장식·설정·계정 상태, 기본 폴더 후보 | 실제 Windows 감지·확인 가능한 라벨. 폴더 존재는 로그인 증거가 아님 |
| GitHub/GitLab·공식 후보 | 연결·secret·계정·조회·공통 뷰로 프로젝트/커밋/외부 WorkItem 표시 | PAT/API·pagination 검증. 영속 WorkItem 연결 의미는 Core operation 결정 필요; 자동 양방향 동기화 제외 |
| Docling·커뮤니티 | 변환·검수 작업·공식 AI·CLI·비서·결과 뷰 | 장기 작업·취소·요청 identity·uncertain/no-replay·부분 결과 비공개·Core 적용·원본 보존. 원본 비교 UI는 표/차트로 충분하지 않아 앱 번들 표면 별도 결정 |
| Jira·커뮤니티 후보 | BaseURL/secret·계정·조회→생성 UI→저장 뷰→LLM 없는 재실행 | 배포별 API·권한·pagination·changelog 검증. 재할당/재오픈/미완료/시간대 등 지표 정의는 typed args와 plugin operation이 소유; chart·LLM 임의 계산 제외 |

후보 계층은 자동 확정하지 않으며 계층을 바꿔도 계약은 같다. 네 사례가 이 문서만으로 모두 구현되거나 검증되었다는 뜻은 아니다.

## 보관 코드의 교훈과 하지 않는 것

보관 코드는 참고 자료이며 그대로 복원하지 않는다. source 직접 import 금지, 공식 쓰기·원본 보존, 요청 identity·중복 거부·uncertain/no-replay, disable 신규 차단·drain, 완료 결과만 공개하는 의미는 필요한 시나리오에서 유지·검증한다.

보관 최종 runtime은 SQLite/OS lock이며 초기 spike의 JSON/PID 기록과 다르다. worker/host/UI entry·React major·단일 AI service가 묶인 옛 manifest, 제품 버전 종속 플러그인 버전, 원격 ESM/CSS loader, 비서를 플러그인으로 만드는 구조는 복원하지 않는다. 범용 SQLite registry/lease/receipt ledger·worker orchestration·sandbox·세밀한 권한 엔진·marketplace·서명·자동 업데이트·플러그인별 dashboard DB는 선제 구축하지 않는다. 과거 fixture·synthetic REST·UI spike를 실제 Docling·외부 SDK·현재 Desktop의 실행 증명으로 재사용하지 않는다.

## 기존 결정과의 관계·검증

- **ADR-0019 구체화:** `pluginTier` 후보 대신 manifest 초안은 `tier`를 사용한다. 같은 SDK·공급 책임·별도 신뢰/활성·Host 소유를 유지하며 실행 모델·Windows secret·공통 UI/저장·관리별 승인을 정한다.
- **ADR-0012 개정:** 재개 시 별도 worker·same-origin ESM/CSS·live 코드 교체 대신 in-process 신뢰 코드·앱 카탈로그·재시작 교체를 따른다. 과거 구현 기록은 보존하고 Core 의미·공식 쓰기·원본·결과 불확실 보호는 유지한다.
- **ADR-0017 개정:** ADR-0017의 비서 플러그인 변경 금지를 삭제하고, 재개 시 ⑤의 매번 사용자 명시 승인을 받는 관리로 대체한다. AI 권한·공급자·모델 변경 허용으로 확대하지 않는다. 기능 제거·보관·공식 AI와 별도 재개 조건은 유지한다. 현재 [비서 계약](../design/main-agent-v1.md)은 display 도구에서 플러그인을 제외하며 관리 도구를 제공하지 않는다. 구현 PR에서 별도 관리 도구와 승인 흐름을 함께 반영하고 display 도구의 허용 범위는 넓히지 않는다.
- **ADR-0015 일부 개정·ADR-0018 유지:** ADR-0015의 비서 플러그인 변경 금지를 삭제하고, 재개 시 ⑤의 매번 명시 승인받는 관리로 대체한다. AI 권한·공급자·모델 변경 금지와 새 기능·관리의 공용 정의·CLI 의무는 유지한다. ADR-0018의 대상 Host·receipt·버전 경계와 번들 script 정책을 따른다. 호환 계층·Host 간 자동 이동·공유 편집을 추가하지 않는다.

이 문서 PR은 소유자 결정·비지원 경계·용어·색인을 대조하고 `pnpm docs:check`와 필수 CI로 확인한다. 제품 실행·설치·credential·원격 연결은 수행하지 않는다. 실제 구현 시 기존 테스트를 우선 보완하고 각 단계의 고유 위험을 확인하며, 브라우저 검증은 `pnpm browser:test`와 저장소의 세션 정리 규칙을 따른다.
