# Plugin screens and queries v1

- Status: Implemented
- Last verified: 2026-11-09 — #1341 제거 범위와 Core/Host/앱 코드를 대조. 실행 검증은 해당 PR의 검사·캡처 기록을 따른다.
- Authority: [ADR-0020](../adr/0020-plugin-architecture.md), [플러그인 1단계](plugin-stage1-v1.md), [#1341](https://github.com/litzio/litzio/issues/1341).
- Scope: 플러그인 기본 화면·수동 조회·입력 폼·공통 표. 비서 생성 UI와 저장 뷰 계약이 아니다.

## 화면과 수명

manifest `contributes.screens`는 id/title/icon, `defaultViewIds`, 선택적 `jobs`, `primary`를 선언한다. 기본 query 정의는 같은 플러그인의 `contributes.views`에 있으며 화면은 그 정의를 직접 사용한다. `.view.json`·`.snapshot.json` 파일을 저장하거나 열지 않는다. 이전 저장 파일의 migration·호환 읽기는 제공하지 않는다.

앱은 연결된 Host별 카탈로그에서 화면을 찾고 사이드바·명령 센터로 진입한다. 단일 Host와 단일 기본 뷰의 선택 control은 숨긴다. 여러 기본 뷰는 명시적으로 선택하며, 이미 열린 기본 조회의 입력·행은 화면을 오가는 동안 보존한다. 정의 또는 Host 교체는 이전 조회를 취소하고 새 인스턴스로 시작한다. 연결 해제·기여 비활성화는 새 실행을 막는다.

`ViewWorkspace`는 화면 선택과 작업 패널, `Views`는 query/review 분기, `QueryViewPage`는 입력·조회 상태, `ViewRenderer`·`ViewPanels`는 세로 배치와 공통 `DataTable`을 소유한다. review renderer는 `ReviewViewPage`·`ReviewRenderer`와 `/api/reviews`를 사용하며 [review Host·CLI 계약](plugin-stage1-v1.md#v4-공용-review-hostcli)을 따른다. `screens[].jobs`는 [공통 작업 패널](plugin-stage1-v1.md#플러그인-화면-작업-패널-1340)을 따른다.

### 공통 화면 틀 (#1393)

플러그인 작업 탭에서는 문서 전용 오른쪽 탐색 패널과 그 예약 폭을 숨긴다. 탭 종류로 판단하며 플러그인별 예외를 두지 않는다. 문서 탭으로 돌아오면 기존 패널 열림 선택과 폭을 복원한다. 패널 preference나 마운트된 작업·조회 상태를 초기화하지 않는다.

`ViewWorkspace`가 페이지 여백(`--space-6`)과 세로 스크롤을 소유한다. 내부 조회 페이지에는 여백을 더하지 않아 작업 패널·조회 입력·결과의 왼쪽 시작선을 맞춘다. 표는 기존 내부 가로 스크롤로 전체 열을 보존하고 640px에서 페이지 자체를 가로로 넘치게 하지 않는다.

화면 제목은 manifest screen.title 하나이며 기존 24px `--font-size-start-title`·semibold·text 토큰을 사용한다. 여러 기본 조회의 선택 버튼은 유지하되 ‘기본 뷰’라는 내부 구성 제목과 선택된 조회의 별도 페이지 제목은 표시하지 않는다. 단일 Host 이름은 조회마다 반복하지 않고, 복수 Host 선택 control은 유지한다. 작업 패널의 ‘작업’ 제목도 반복하지 않는다. #1395의 파일 처리 화면은 상단 surface-subtle 입력 영역과 전체 폭 결과 표로 나누며, 작업 선택·상태·진행·결과 행동은 [공통 작업 패널](plugin-stage1-v1.md#플러그인-화면-작업-패널-1340)을 따른다. 결과 표의 내용 구분 제목과 접근 가능한 표 이름은 유지한다. 기존 Button·SettingsSelect·Notice·DataTable을 재사용하며 새 표면·공통 상호작용 예외는 없다.

2026-11-10 수동 화면 확인: 같은 Jira·Docling manifest와 합성 응답, persistent Chrome·전용 HTTP Host로 제목 위계·시작선·정렬·줄바꿈·잘림을 비교했다. 1440px Jira 기본 7열은 화면 폭 안에 들어오고, 한국어 다크 640px에서는 표 내부 가로 스크롤을 유지한다. 계정·선택 control은 촬영 시 mask했다. 실제 외부 서비스·변환 품질이나 소유자의 시각 승인을 뜻하지 않는다.

| 화면 | 1440px 변경 전 / 후 | 640px 한국어 다크 변경 전 / 후 |
| --- | --- | --- |
| Jira | [전](assets/plugin-shell-1393/before-jira-1440.png) / [후](assets/plugin-shell-1393/jira-1440.png) | [전](assets/plugin-shell-1393/before-jira-640.png) / [후](assets/plugin-shell-1393/jira-640.png) |
| Docling | [전](assets/plugin-shell-1393/before-docling-1440.png) / [후](assets/plugin-shell-1393/docling-1440.png) | [전](assets/plugin-shell-1393/before-docling-640.png) / [후](assets/plugin-shell-1393/docling-640.png) |

## Core 명세와 조회

`@litzio/core/views-v2`의 `queryViewSchema`·`operationQueryViewSchema`는 schemaVersion 2, catalog `litzio-v2`, profile `query`, owner, refresh `manual`을 사용한다. 유일한 query source는 `sources.stats`의 `kind:operation`, 등록 operation/version/args다. 입력 폼은 선택 사항이며 layout은 세로 Panel의 Table 목록이다. Chart·가로 Panel·assistant source·inline rows·출처는 받지 않는다. unknown component/prop/action, HTML·JS/CSS·표현식·URL fetch는 허용하지 않는다.

`VIEW_LIMITS`는 정의 32 KiB·최대 8개 표·최대 8개 공개 scalar 입력과 기존 operation 행 한도를 유지한다. Table 열 수 상한은 없으며 중복·비공개 필드 바인딩은 거부한다. Core가 구조·바인딩·입력·행 타입·canonical JSON을 소유하고, Host는 현재 등록·활성·operation owner/version/schema를 다시 확인한다. secret 행 필드는 공개하지 않는다.

필터(eq/contains/range) → groupBy+aggregate(count/sum/avg/min/max) → sort → limit는 Core의 유일한 계산 경로다. 날짜는 UTC day/week/month로 묶으며 group/value 출력 필드를 사용한다. 별도 renderer 계산·join·표현식은 없다.

## 입력과 상태

InputForm은 inputSchema 최상위 공개 scalar 필드에 Select·TextInput·DateInput·NumberInput·Checkbox를 직접 연결하고 SubmitButton 하나로 실행한다. source args가 유일한 입력 값이다. optional 부재·빈 문자열·null·false는 구분한다. 고정 nested args는 지원하지만 form의 복합/조건부 schema·secret/writeOnly/password 입력은 거부한다. schema의 허용 capability 검사를 우회하지 않는다.

Core `validateViewInputs`의 static 검증은 폼에 선언한 필수 입력의 누락만 `needs-input`으로 허용한다. execute 검증은 전체 원본 schema와 operation validator를 적용하며 coercion/default 삽입은 하지 않는다. 브라우저는 CSP-safe compiler, Host는 기본 compiler를 사용하고 공개 필드 경로·keyword 기반의 같은 진단을 소비한다.

화면을 열 때는 조회하지 않는다. 사용자의 새로고침·Submit만 Host 실행을 요청한다. idle/loading/success/empty/needs-input/failure/uncertain/unavailable을 구분한다. 이전 결과가 있을 때 오류·입력 변경·재조회 중에는 이전 결과임을 시각과 함께 표시한다. field 오류는 고정 조언을 쓰며 원문·입력 값·secret을 노출하지 않는다. Source 오류 분류는 [공용 작업 실패](plugin-stage1-v1.md#작업-실패-공개-분류-1233)를 따른다. 취소·교체 뒤 늦은 응답은 결과를 되살리지 못한다.

## Plugin input suggestions (#1352)

TextInput optionally consumes its source operation's catalog `inputSuggestions` metadata.
Bindings are owned and validated by the plugin manifest, not persisted in form definitions.
The shared Host operation/CLI contract and request lifetime are defined in
[plugin input suggestions](plugin-stage1-v1.md#입력-후보-1352-sdk-030).
Other scalar controls and the manual query action retain their behavior.

## 공통 Table과 링크

DataTable은 읽기 전용이며 열별 정렬·필터·pagination과 입력 순서의 안정성을 소유한다. null은 빈 값, 0·false는 값이다. 표 내부 가로 스크롤로 모든 열을 유지하고 최소 640px 창에서 페이지 자체의 가로 넘침을 만들지 않는다. 화면의 정렬·필터는 operation args 또는 문서 의미를 바꾸지 않는다. [Table 패턴](ui-patterns-v1.md#데이터-표-정렬필터-제안)을 따른다.

공개 string 필드의 `linkField`는 다른 공개 string 필드를 가리킨다. 같은 행의 대상이 유효한 절대 HTTP(S) URL일 때만 새 창 링크로 표시하며 `noopener,noreferrer`를 사용한다. 잘못된 URL·누락·null·집계 결과는 일반 텍스트다. URL은 원래 행에 보존되고 렌더러가 숨은 fetch나 임의 action을 추가하지 않는다.

## Host와 CLI

`POST /api/views`는 내부 화면 발견용 `catalog`, `validate`, `run`만 제공한다. catalog는 공개 operation schema와 현재 contributes.views/screens를 반환한다. validate는 query 입력/owner 또는 review의 실제 Host bundle 참조를 확인하고 canonical 정의를 반환한다. run은 query 정의와 선택적 전체 대체 input을 받아 등록된 Host 범위 read operation을 한 번 실행한다. 폴더 Root는 필요하지 않으며 receipt.scope는 host다. 결과는 args/fields/rows/receipt이며 파일 target·저장 경로가 없다.

CLI는 얇은 `view validate <file> --host <origin> --json`와 `view run <file> [--input <args.json>] --host <origin> --json`만 제공한다. validate의 선택적 `--plugin`은 owner를 추가 확인한다. JSON 파일은 사용자가 검증·실행할 정의 입력이며 앱 저장 뷰 파일 열기 기능이 아니다. 저장·목록·재열기·명세 제안·CLI catalog는 없다.

## 남은 제한

앱 안 review 진입은 현재 없음(CLI·API로만 열림), Docling 대조 화면 작업에서 추가. 이 제거 PR은 제품 진입 버튼을 추가하지 않는다. 기존 V5 fixture·review renderer/API/CLI를 유지한다.

## 제거와 검증 경계

#1341에서 비서 뷰 생성·결과 카드·교정·자료/출처, 즐겨찾기·snapshot, 우측 Views 탭·문서 통계·folder.statistics, Chart·가로 Panel과 관련 예제를 제거했다. requestUserInput·일반 대화·문서 도구·플러그인 연결 확인·작업 패널·review는 유지한다. 제거 직전 소스는 [archive/dynamic-ui-2026-11](https://github.com/litzio/litzio/tree/archive/dynamic-ui-2026-11)에 보관되어 있다. [소유자의 재구축 기준](https://github.com/litzio/litzio/discussions/767#discussioncomment-19481395)은 향후 별도 작업의 출발점이며 새 DSL·workflow engine 구현을 승인하지 않는다.

Core·SDK는 schema와 입력·행·링크 의미, Host/CLI 검사는 같은 args·오류·receipt, 브라우저는 플러그인 진입·입력 focus·조회/늦은 응답·표·V5 대조를 보호한다. 합성 fixture·localhost 통과는 실제 외부 Jira/Docling 서비스·실제 AI 응답·배포 수락의 증거가 아니다.

## 화면 확인 (#1341)

[1440px 제거 표면](assets/plugin-screens-1341/removed-surfaces-1440.png)에서 왼쪽 문서 통계와 오른쪽 Views 탭이 없고 기존 문서 탐색만 남음을 확인했다. [1440px 플러그인 진입](assets/plugin-screens-1341/plugin-screen-1440.png)과 [640px 한국어 다크](assets/plugin-screens-1341/plugin-screen-640-ko-dark.png)는 기본 입력 폼·수동 조회 진입을 유지한다. 정렬·간격·한 열 전환과 페이지 가로 넘침을 확인했다. manifest 제공 영문 label은 그대로 표시된다. 합성 카탈로그·문서와 기존 persistent Chrome을 사용한 로컬 화면이며 실제 Jira/Docling 서비스나 AI 응답의 수락 증거는 아니다. Host 계정은 촬영 시 mask했다.

실제 커뮤니티 artifact와 합성 서비스의 [Docling 0.0.2 작업 패널 1440px](assets/plugin-screens-1341/docling-1440.png) / [한국어 다크 640px](assets/plugin-screens-1341/docling-640-ko-dark.png), [Jira 0.0.3 표·링크 1440px](assets/plugin-screens-1341/jira-1440.png) / [한국어 다크 640px](assets/plugin-screens-1341/jira-640-ko-dark.png)도 확인했다. Docling은 설정 healthCheck로 폴더 없이 연결을 확인하며, 화면에는 작업 패널·파일별 결과·아이콘을 제공한다. 같은 Root를 다시 선택해도 파일 목록을 유지한다. Jira 입력·표·링크도 유지된다. Host 계정/경로는 mask했고 화면의 계정·이슈 값은 합성 fixture다. 실제 외부 서비스 연결·문서 변환 품질의 근거로 사용하지 않는다.

## 열 선택과 결과 범위 (#1351)

플러그인 조회 표의 기본·추가 열, 브라우저 UI 선택 저장과 잘림 정보의 단일 건수 줄 표시는 [플러그인 표 계약](plugin-stage1-v1.md#플러그인-조회-표-열과-결과-범위-1351)을 따른다. 즐겨찾기·생성·통계·차트는 복원하지 않는다.

## Collapsible query inputs and dynamic guidance (#1370)

SDK 0.3.0 (to be released with Litzio beta.9) permits optional `advanced: true` on InputForm fields. Only optional fields collapse; required fields always remain visible. Order within each region follows fields. The tab owns expansion; collapsing preserves args and removes hidden controls from keyboard navigation. The closed form shows every specified secondary value, including defaults, false, zero, null and valid empty strings. Hidden errors expand the region and focus the first invalid control. Submission remains manual, with the existing previous-result warning. Opted-in forms use three columns at content widths >=800px, two above 640px, otherwise one; the final submit row stays right aligned.

Read operations with rowSchema may declare `inputHints: { field: "hint-operation" }` alongside inputSuggestions. The target is a same-plugin standalone host read accepting `{}`, with no rowSchema or job/review binding. The public free-text field cannot be secret/writeOnly, enum/const or formatted. Host catalog exposes full operation/version bindings. The `input-hint` dispatcher accepts only declared, enabled, current-version targets and invokes them with `{}`; ordinary CLI operation invoke returns the same receipt/result. Result is exactly `{text: string}` (1–512 characters), after ordinary output validation and secret redaction. Empty TextInput displays this text as placeholder and accessible description; it never writes args. Hint response state belongs to the field/Host/binding, is discarded across binding changes/unmount, and failure leaves ordinary manual input available. No automatic query or saved placeholder data.

Jira 0.0.5는 기본 Key·제목·Status·Assignee·Reporter·Created·Updated 7열과 Priority·유형·Resolution·마감일·Components·Labels 추가 후보를 선언한다. 같은 검색 경로에서 최대 500행을 반환하고 Jira total로 잘림 여부와 전체 건수를 전달한다. 기존 PluginQueryTable·DataTable 건수 줄·DropdownMenu를 재사용하며 새 상호작용 예외는 없다.

#1370 수동 시각 검토: 1440px [기본](assets/search-form-1370/default-1440.png) / [접힌 요약](assets/search-form-1370/collapsed-1440.png) / [열 메뉴](assets/search-form-1370/columns-1440.png), 한국어 다크 640px [기본](assets/search-form-1370/default-640-ko-dark.png) / [접힌 요약](assets/search-form-1370/collapsed-640-ko-dark.png) / [열 메뉴](assets/search-form-1370/columns-640-ko-dark.png). 입력 정렬·여백, 요약 줄바꿈, 메뉴 가용 높이와 표 내부 가로 스크롤을 확인했다. 이전 단계의 캡처와 달리 즐겨찾기가 없는 현재 화면이다. 합성 Jira·PAT와 전용 포트의 격리 Host이며 실제 회사 Jira나 소유자 시각 승인을 뜻하지 않는다.
