# 카탈로그 v2 — 검색 입력과 원본 대조·교정

- Status: Draft
- Last verified: 2026-11-06 — 소유자 정정에 따라 K2~K4를 공용 요소로 한정하고 4단계를 비서 제작 수락 시험으로 명확화. 코드·외부 문서 대조는 2026-11-05의 `d2b87e97b4845aeba1ddc65cedcbc74495e0cd84` 기준이며 제품 실행·시각 검증은 하지 않았다.
- Authority: [ADR-0020](../adr/0020-plugin-architecture.md)의 카탈로그 v2 개정안. 기존 Accepted 결정을 유지하며, 아래 새 계약은 구현 전 제안이다.
- Scope: 로드맵 3단계 공용 카탈로그 설계와 4단계 비서 제작 수락 시험의 진입 조건. Docling 구현 지시가 아니며 제품 코드·플러그인 제작·설치·migration은 이 문서 PR에 포함하지 않는다.
- Related: [현재 생성 뷰](generated-views-v1.md), [플러그인·K1](plugin-stage1-v1.md), [ADR-0015](../adr/0015-shared-host-operations.md), [오류 계약 #1233](https://github.com/litzio/litzio/issues/1233).

## 근거와 현재 부족한 것

소유자 조사 파일은 `C:\Projects\litzio\tmp\research\`의 `stage2-jira-acceptance.md`, `authoring-roadmap-brief.md`, `docling-ui-contracts.md`, `dynamic-ui-spike.md`, `plugin-arch-b-genui.md`다. 로컬 조사 파일은 현재 계약이 아니다. 다른 checkout의 검토자도 판단할 수 있도록 필요한 결과를 아래에 요약한다.

2단계는 부분 성공·전체 수락 실패다. 비서 제작·등록·신뢰·활성·조회·무재시작 수정은 성공했으나 검색 폼과 키/요약/상태/담당자/갱신일의 5열 단일 표를 표현하지 못했다. 401/403/404/500은 같은 `View source failed`였다. CLI 저장 → 즐겨찾기 새 탭 → 수동 조회 → CLI/UI 데이터 일치는 확인했으나 원래 채팅의 Generate view 진입은 미검증이다. delay는 약 1.9초 후 성공했으므로 timeout 수락 증거가 아니다. 실패 활동 10개를 모델 교정 10회나 제품 결함 10개로 계산하지 않는다.

| 근거 | 이번 설계의 대응 | 완료를 주장하지 않는 것 |
| --- | --- | --- |
| (B), 시나리오 4: 6개 별도 뷰로 프리셋 대체, 5열을 두 표로 분할 | InputForm과 12열 상한 | 여러 뷰를 만든 것만으로 검색 폼 수락 통과 아님 |
| (A1), 시나리오 5: 오류 원인 소실 | #1233 결과를 SourceState로 표시 | 이 문서가 오류 계약 구현이나 timeout 시험을 대신하지 않음 |
| (C), 시나리오 6: 공통 view와 플러그인 기여 혼동·재붙여넣기 | 스킬 보강과 명세를 직접 여는 결과 카드 | 모델 성능 향상·실제 Copilot 제작 완료 보장 아님 |
| (A2): Root picker 부모 요청 403 | 별도 제품 결함 조사 | 카탈로그 변경이나 테스트 완화로 우회하지 않음 |
| (A3): schema 변경 후 옛 즐겨찾기 거부 | 파일 보존·새 뷰 필요 안내 | 하위 호환·migration 추가 안 함 |
| (D): 제한을 뒤늦게 발견, 셸/도구 실패 혼재 | 생성 전에 catalog 확인·공용 검증 진단 | 모든 실패를 문서나 모델 단독 원인으로 단정하지 않음 |

현재 [Core views](../../packages/core/src/views.ts)는 `schemaVersion:1`, `catalog:litzio-v1`, 단일 `sources.stats`, `VerticalPanel` 아래 Table/BarChart다. `VIEW_LIMITS`는 32 KiB·8패널·2000행이며 Table의 4열 제한은 schema에 별도로 박혀 있다. 공개 row schema는 최대 64필드다. 폼·임의 action·K2~K4 데이터는 지원하지 않는다. 즐겨찾기는 플러그인 source도 `litzio.statistics` 컬렉션을 쓰며 SDK `generatedUi/views/dataViews`는 거부한다. v2 구현에서 이 차이를 해소하고 현재 계약도 함께 갱신한다.

## 참고 사례와 선택

[Paseo](https://paseo.sh/docs/plugins/reference)는 screen/sidebar 진입점과 workspace tab panel을 기여하고 daemon의 schema 검증 RPC로 실행을 분리한다. **Paseo를 우선 따라** 기여 ID·대상 Host·기본 진입점·별도 작업 탭·해제 시 정리라는 모델을 쓴다. 다만 Paseo의 실행 가능한 client React 코드까지 따르지는 않는다. 앱 번들 카탈로그만 허용한다는 소유자 결정이 우선한다. [VS Code](https://code.visualstudio.com/api/references/contribution-points#contributes.views)의 ID/name/container 선언처럼 위치와 내용을 구별하되 임의 webview·새 확장 컨테이너는 도입하지 않는다. [A2UI v0.9.1](https://a2ui.org/specification/v0.9.1-basic-catalog-implementation-guide/)의 TextField/ChoicePicker/DateTimeInput·Button처럼 입력 상태와 명시 action을 분리하지만 스트리밍 surface·표현식·범용 양방향 모델은 채택하지 않는다. [CopilotKit](https://docs.copilotkit.ai/generative-ui/your-components/interactive)의 앱 소유 render와 명시 respond 개념만 차용한다. 라이브러리·브라우저 업무 실행·agent shared state를 문서 SSOT로 쓰는 방식은 채택하지 않는다. 이는 공식 문서 정적 비교이며 각 제품의 실행 검증이 아니다.

## 공통 구조와 기여 경계

v2는 `kind:litzio-view`, `schemaVersion:2`, `catalog:litzio-v2`, `refresh:manual`로 정의한다. v1 자동 변환이나 호환 reader는 만들지 않는다. 미지원 명세는 파일을 보존하고 새 뷰가 필요함을 알린다. 새 버전 숫자는 호환성 약속이 아니라 명시적 거부를 위한 식별자다.

- Core: 명세 strict schema, 입력 binding, typed 자료 계약, 정적 검증·canonical JSON·기존 가공 의미. SDK는 중립 타입을 재노출한다.
- Host: 실제 등록 operation과 effect/schema/가용성 검증, Root·자료 참조 검증, 실행·오류 정리·receipt·저장. 앱은 결과를 다시 계산하지 않는다.
- 앱: 번들 renderer·일시적 입력/선택·focus·scroll. 같은 명세는 기본 UI·생성 탭·즐겨찾기에서 같은 renderer를 쓴다.
- 플러그인: 서비스별 인자 의미와 조회, 원본 자료 해석·문서 변경 제안. Editor 내부 타입·DOM·ProseMirror position을 공개 계약으로 쓰지 않는다.

단일 source 제한을 유지한다. `profile:query`는 기존 `sources.stats` 읽기 작업과 `/rows`만 사용한다. `profile:review`는 등록된 한 review 기여의 완료 bundle을 source로 사용한다. review 자료를 row 배열에 억지로 넣지 않는다. 두 profile은 같은 envelope·저장·렌더 체계를 쓰되 허용 컴포넌트/동작이 다르다. 여러 작업 조인·의존 DAG·범용 화면 DSL은 없다.

SDK의 최소 신규 기여는 `contributes.views:[{id,title,definition}]`와 `contributes.reviews:[{id,title,read,propose,approve,reject,undo}]`다. 이름은 이 설계의 제안이며 현재 API가 아니다. views의 definition은 query profile의 v2 명세만 받는다. reviews의 binding은 같은 플러그인의 등록 operation ID/version이어야 하며 read는 read, 나머지는 write다. 미지원 action이나 다른 플러그인의 write binding은 거부한다. review binding은 K1처럼 공용 review 작업을 통해서만 호출하고 일반 invoke로 승인 경계를 우회하지 못한다.

모든 플러그인은 기존 작업 탭을 쓰는 기본 진입점이 항상 있다. 명시 views는 기본 탭에서 고르는 조회 화면이고, 선언이 없으면 앱이 상태·가용 작업·K1 진입을 표시한다. rowSchema가 있는 읽기 작업은 지원 입력 타입에 대해 폼과 첫 12개 공개 필드의 표를 기본 제공한다(더 많은 필드가 있음을 안내). 미지원 입력 schema는 실행 폼을 발명하지 않고 이유와 CLI 경로를 표시한다. 비활성 상태도 기본 진입점에서 이유를 볼 수 있다. 생성·즐겨찾기는 별도 새 탭이며 기본 UI를 덮지 않는다. 설정 화면은 기존 위치에 남긴다.

즐겨찾기의 소유 plugin은 query의 등록 operation 또는 review 기여에서 Host가 결정한다. 내장 통계만 `litzio.statistics`를 쓴다. `view list/open/run --name`에는 `--plugin <id>` 선택을 추가하고 save는 source의 소유자와 일치하는지 확인한다. 저장은 `<Host settings directory>/plugins/<pluginId>/views/<name>.view.json`의 신규 생성만 허용한다. 임의 경로·다른 Host 자동 연결·기존 파일 덮어쓰기는 없다. 기존 200개/컬렉션 상한을 유지한다.

## 입력 control과 operation 인자

InputForm은 query source당 하나, 필드 최대 8개와 실행 버튼 하나다. 컨트롤은 `field`로 operation inputSchema의 **최상위 scalar 속성 하나**에 직접 연결한다. UI 별칭→별도 변수 저장소나 문자열 보간은 없다. args가 값의 유일한 명세 표현이다.

| control | 허용 schema와 의미 | 제외 |
| --- | --- | --- |
| Select | string/number/boolean enum의 단일 선택, 최대 32개. 표시명은 schema title 또는 escape한 값. JSON 타입 유지 | 원격 options 조회, 다른 필드에 따른 조건부 options, 다중 선택 |
| TextInput | 한 줄 string, 최대 512자와 schema의 더 작은 maxLength 적용 | password/secret, script, 자동 JQL 조합 |
| DateInput | string + `format:date`, 유효한 `YYYY-MM-DD`를 그대로 전달 | 브라우저 시간대로 임의 UTC 변환, 상대 날짜 계산식 |
| NumberInput | 유한 number/integer, schema minimum/maximum 적용 | locale 문자열을 Host 인자로 저장, 계산식 |
| Checkbox | boolean | null을 false로 치환 |
| SubmitButton | 같은 source를 현재 인자로 수동 run. Enter도 동일 경로 | 임의 operation 선택, write 호출, 입력 중 자동 조회 |

필수 여부·enum·범위·설명은 operation schema를 원본으로 한다. 명세가 더 느슨하게 재정의할 수 없다. optional 입력은 명시적 지우기로 args에서 속성을 제거하고, 빈 문자열은 실제 문자열 값으로 구별한다. nullable이 허용되면 ‘값 없음’으로 null을 명시한다. required 입력이 비어 있으면 명세 구조는 저장할 수 있으나 실행은 막고 해당 필드에 오류를 연결한다. 정적 validate는 없는 필수 입력을 `needs-input`으로 반환하고, **실행 validate는 전체 effective args에 원래 JSON Schema validator를 반드시 적용**한다. missing 허용은 form으로 선언된 필수 속성에만 해당한다. 알 수 없는 필드·잘못된 타입/enum은 저장 때도 거부한다. 중첩 object/array·조건부 schema의 폼 생성은 미지원이며, 이미 유효한 고정 args의 읽기 명세는 유지할 수 있다.

JQL 프리셋은 예를 들어 `preset: assigned-open | reported-open | assigned-all` enum으로 선언하고 플러그인이 실제 JQL로 해석한다. 자유 JQL을 제공하려면 작업이 별도의 string 입력을 선언해야 한다. renderer나 모델이 JQL/날짜 범위 의미를 만들어내지 않는다. 날짜 입력은 필터의 UTC timestamp와 별개다. 날짜만의 포함 범위·서비스 시간대는 operation이 정의하고 실행 조건/receipt에 알린다.

아래는 v2 제안 예시다. 현재 v1 validator로 실행할 수 없다.

```json
{
  "kind": "litzio-view", "schemaVersion": 2, "catalog": "litzio-v2",
  "profile": "query", "title": "내 이슈", "refresh": "manual",
  "sources": {"stats": {"operation": "example.jira.search", "version": 1,
    "args": {"preset": "assigned-open"}, "filters": [], "limit": 2000}},
  "form": {"component": "InputForm", "source": "stats", "fields": [
    {"component": "Select", "field": "preset"},
    {"component": "TextInput", "field": "text"},
    {"component": "DateInput", "field": "updatedSince"}
  ], "submit": {"component": "SubmitButton", "label": "검색"}},
  "layout": {"component": "VerticalPanel", "children": [
    {"component": "Table", "title": "검색 결과", "source": "stats", "data": "/rows",
      "columns": ["key", "summary", "status", "assignee", "updated"]}
  ]}
}
```

입력 수정은 탭의 초안 args만 바꾼다. 실행 시 그 값을 고정해 Host로 보내고 receipt는 그 요청에 대응한다. 실행 중 추가 입력은 금지하지 않되 이전 결과에 ‘검색 조건 변경됨’을 표시한다. 늦은 응답은 새 요청 결과를 덮지 못하며 새 데이터 조회를 자동 시작하지 않는다. 조회 실패 시 이전 결과를 남길 경우 ‘이전 조회 결과’와 조회 시각을 반드시 표시한다.

★ 즐겨찾기에 추가는 **현재 폼 입력**을 args로 저장한다. 조회 결과·오류·선택·requestId는 저장하지 않는다. 아직 실행하지 않은 조건도 저장할 수 있음을 이름 dialog에 알린다. 다시 열면 입력값만 복원하며 조회하지 않는다. 영속 가능 입력은 공개 비밀 아닌 값에 한정하고 secret 선언/credential 입력은 폼·명세·비서 문맥에 넣지 않는다.

CLI 확장: `view run <file> --input <args.json> --root <root> --host <origin> --json`. `--input`이 있으면 source args **전체를 대체**한다(부분 merge 없음). 생략하면 저장 args를 사용한다. UI와 같은 Host 입력 해석·검증·Core 가공·receipt를 사용한다. `operation invoke`에 같은 args 파일을 주면 가공 전 원자료, `view run`은 그 자료에 명세 가공을 적용한 결과다. `view save ... --input <args.json>`도 같은 전체 대체 규칙으로 새 즐겨찾기를 만들며 원파일을 바꾸지 않는다.

## 표·배치·한도

Table은 **1~12개의 고유 공개 열**을 허용한다. 5열 Jira 요구와 제한적인 상세 조회 여유를 함께 충족하고, 64개 schema 필드 전체를 기본 표시하는 것을 피하는 상한이다. 숨은 열·자동 열 삭제·두 표 분할은 하지 않는다. 상한은 schema 하드코딩 대신 공개 `VIEW_LIMITS.columns`와 생성 context에 함께 노출한다.

| 가용 폭 | 동작 |
| --- | --- |
| 640px 창 | 폼은 한 열로 접고 실행 버튼을 유지. 표는 패널 안 가로 스크롤, 페이지 전체 overflow 금지. 모든 열을 키보드/포인터로 도달 가능 |
| 960px 창 | 가용 패널 폭이 충분할 때 폼은 두 열. 표의 긴 요약은 줄바꿈, 식별자·날짜는 읽을 수 있는 폭을 유지하고 부족하면 내부 스크롤 |
| 1440px 창 | Jira 5열은 일반적인 값으로 한 표에서 읽기 가능. 12열/긴 값은 여전히 내부 스크롤 허용. 창 폭만 보고 강제로 축소하지 않음 |

container 실제 폭을 기준으로 처리하며 Explorer/비서 패널이 열린 경우도 포함한다. 열 최소 폭은 식별자/일반 값 8rem, 요약 같은 긴 텍스트 16rem, timestamp 12rem의 앱 기본 정책으로 시작한다. 숫자 단위는 토큰으로 두고 구현 PR에서 대표 자료로 확인한다. 명세가 CSS 폭을 주입하지 않는다. 행 높이는 내용에 따라 늘고 생략된 값은 키보드 접근 가능한 기존 Tooltip/상세 표시로 전체를 읽을 수 있어야 한다.

`HorizontalPanel`은 최대 두 자식, 한 단계만 허용하고 가용 폭 960px 미만에서 세로 순서로 접는다. 전체 leaf panel 8개 제한은 유지한다. `LineChart`는 단일 series, 숫자 또는 날짜 x와 숫자 y만 허용한다. Core의 명시 sort 후 순서대로 그리며 중복 x는 거부, null은 단절로 표시한다. 보간·누적·다중 축·추세 계산은 없다. Table/BarChart와 동일 데이터 및 접근 가능한 값 목록을 쓴다. 선 차트·가로 배치는 로드맵 범위에 남기되 2단계 실패로 계수하지 않으며 Docling 진입의 선행 조건으로 삼지 않는다.

명세 32 KiB, leaf 8개, rows 2000개, 필터 8개, label 160자와 scalar string 512자는 유지한다. 정렬·필터·제한·groupBy 하나(날짜 day/week/month)·count/sum/avg/min/max만 유지한다. review의 이미지/문서/map/proposals는 명세에 inline으로 넣지 않고 Host 자료로 읽는다. 페이지 자료는 요청당 1페이지·최대 2000영역, map/proposal 목록은 요청당 2000항목·1 MiB JSON을 상한으로 하고 continuation으로 이어 읽는다. 초과 페이지는 명시적 미지원 오류로 표시하며 조용히 잘라내지 않는다. 이미지 요청은 16 MiB·25 megapixel 이하로 검증하고 활성 페이지 주변만 로드한다. 이는 초기 자원 상한이며 실제 PDF 수락에서 미달하면 측정·계약 개정을 먼저 한다.

## 안전한 오류와 화면 상태

`SourceState`는 명세가 임의 문구/색을 공급하는 패널이 아니라 Host 실행 결과를 표시하는 앱 번들 상태 요소다. `idle / needs-input / loading / success / empty / failure / uncertain / unavailable`을 구분한다. 실패를 empty로 바꾸지 않는다. source 하나의 실패는 표·차트 양쪽에 같은 원인으로 연결하되 상단에 중복 없이 한 번 표시한다.

| #1233의 의미 범주 | 앱 고정 안내와 동작 |
| --- | --- |
| 인증 필요 | ‘인증 정보를 확인하세요’ + 대상 Host의 기존 Plugins 설정 열기. 채팅에서 secret을 묻지 않음 |
| 권한 없음 | ‘이 작업에 필요한 권한을 확인하세요’. 권한 요청 대행·자동 재시도 없음 |
| 대상 없음 | ‘대상 또는 검색 조건을 확인하세요’. 입력을 보존 |
| 서비스 오류 | ‘서비스에서 요청을 처리하지 못했습니다’. 읽기만 명시적 재조회 가능 |
| 시간 초과 | ‘제한 시간 안에 응답을 확인하지 못했습니다’. read는 수동 재조회, write/결과 불확실은 상태 확인 안내 |

#1233이 **분류 타입·안전한 고정 메시지/행동 코드·publicOperationResult 정리·receipt 및 CLI/비서 일치**를 소유한다. 이 문서는 이름이 확정되지 않은 별도 error enum을 구현시키지 않는다. HTTP 401 등을 renderer에서 추측하거나 예외 문자열에서 분류하지 않는다. 미분류 오류는 안전한 일반 실패 안내를 쓰며 원문 body·stack·secret·인증 헤더·서비스 URL을 표시하지 않는다. 사용자에게 보이는 상세에는 operation/version·시각·request ID 같은 안전한 receipt만 둔다. validation/버전 불일치/비활성 플러그인은 서비스 5종과 별도로 안내한다. 연결 상실 후 write 성공 여부를 모르면 분류가 timeout이어도 outcome은 uncertain이고 자동 재전송하지 않는다.

## K2·K3·K4 공용 요소

공용 요소의 검증 ID는 G1 파일 작업 완료 자료 연결, G2 페이지·영역 대조, G3 원본↔문서 탐색, G4 문서 변경 제안·승인·거절·Undo·갱신이다. 아래는 특정 플러그인의 저장·재처리 방식이나 변경 종류를 가정하지 않는 번들 화면과 Host 계약이다. 4단계는 비서가 Docling 플러그인을 만들어 이 요소들을 연결하는 수락 시험이며 Docling 제품 구현 단계가 아니다. 공용 fixture 검증은 그 실제 제작·변환 품질 판정이 아니다.

| 요소 | 최소 입력/출력 계약 | 막히는 수락 시나리오 |
| --- | --- | --- |
| K1 연결 보완 | 완료 결과에 Host가 검증한 `bundleRef`, document/source/map revision 참조. start/status/stop/result 및 no-replay 유지 | G1→G2: 현재 K1은 native 문서만 반환하므로 원본 이미지/map 전달이 없음 |
| K2 `PageSurface` | pageNo, width/height, imageRef, sourceRevision, regions(id/bbox/category/status/reason). bbox는 source page 좌표·TOPLEFT/BOTTOMLEFT와 단위 명시. 출력은 region/page 선택 | G2: 전체 페이지 이미지·bbox·장식/미지원/이미지 없음 확인 불가 |
| K3 `SourceDocumentCompare` | K2 + 기존 Read. 동일 generation의 documentRef/revision/hash, mappingRevision, 다대다 sourceIds→Core 중립 target refs | G3: 선택·강조/reveal 및 stale 거부가 없음 |
| K4 `ReviewList`/`ReviewDetail` | proposal id/kind/targets, 근거·plain/typed before/after, baseline, 상태, 허용 action과 불가 사유. 사용자 approve/reject/undo → 새 baseline·receipt | G4: 어떤 근거로 무엇이 적용됐는지·충돌·Undo를 검증할 수 없음 |

review source는 `{plugin,review,bundleRef}`만 영속한다. bundleRef는 Host가 발급하고 같은 Host의 현재 Root/완료 결과에 대해 해석하는 불투명 참조다. 파일 URL·원격 서비스 URL·image data URL이 아니다. 다른 Host에 복사한 즐겨찾기는 자동 재바인딩하지 않는다. 페이지·문서·map 읽기는 Host가 경로와 결과 소유 범위를 매번 확인한다. 자료 read에 revision을 포함해 다른 generation을 섞지 않는다. 완료 bundle의 원본 자료는 검토에 필요한 최소 파일만 보존하며 범용 자산 서버·DB를 만들지 않는다.

K2는 원본 좌표·단위·원점과 페이지 자료를, K3는 동일 generation의 documentRef/revision/hash와
mappingRevision·중립 target ref를, K4는 proposal·baseline·action 가용성과 receipt를 binding한다.
페이지 선택·원점 변환·대응 강조/reveal·최소 대조 폭·승인/Undo·갱신 중·stale/unavailable의
동작은 [공용 review UI 패턴](ui-patterns-v1.md#공용-원본-대조와-변경-제안-catalog-v5-1241-a안)을 따른다.
명세는 이러한 동작을 재정의하지 않는다. Host는 baseline을 적용 직전 재검사하고 Core operation과
공식 write path로 적용한다. review.propose는 pending만 제출하며 승인과 Undo는 사용자만 실행한다.

공용 작업 후보는 `review.read/propose/approve/reject/undo/status`다. read는 bundle과 자료 종류/page/continuation을 입력받고 데이터·baseline·receipt를 반환한다. 변경은 bundle/proposal 또는 entry ID, baseline, requestId를 입력받고 새 baseline·changedDocumentRefs·receipt를 반환한다. status는 같은 requestId 결과를 확인한다. CLI `review <action> <pluginId> <reviewId> --input <file> --root <root> --host <origin> --json`를 같은 정의로 제공한다. 승인 CLI는 사용자의 명시 실행이며 비서에는 approve/undo 자동 실행 도구를 노출하지 않는다. 선택·hover·zoom·scroll은 parity 대상이 아니지만 자료 읽기·제안·승인·거절·Undo는 대상이다.

Docling 교정의 저장·재처리 방식은 4단계로 미룸.

Host는 공식 write path의 revision 보호와 실패 시 데이터 보존을 유지한다. 결과를 확인하지 못하면 uncertain으로 표시하고 같은 requestId의 상태만 확인하며 변경을 자동 재전송하지 않는다. daemon 재시작 후 request 결과를 확인할 수 없으면 unknown이지 재실행 허가가 아니다. 공용 검토 계약은 특정 플러그인의 저장 구조나 재처리 알고리즘을 정하지 않는다.

## 제작 스킬 개선 목록과 직접 열기

제품에 번들된 [authoring-skill.ts](../../apps/editor/server/plugins/authoring-skill.ts)를 해당 구현 PR에서 보강한다. 이 문서 PR은 제품 문자열도 변경하지 않는다.

1. **공통 view 경로:** rowSchema 읽기 작업 → Host 카탈로그 → Core validate → 공용 view save/run → 앱 renderer. SDK 기여와 공통 view 지원을 별개로 설명하고 현재 지원 version을 먼저 확인한다. v2 병합 전에 새 `contributes.views/reviews` 예시를 제공하지 않는다.
2. **한도 사전 확인:** 실제 catalog에서 12열/8패널/폼 8입력/32 KiB와 operation input/output을 읽고 한 번의 대표 명세를 검증한다. v1 Host라면 4열 제한을 정직하게 알리고 5열 수락을 두 표로 대체해 성공 선언하지 않는다. 제거된 필드의 즐겨찾기는 새 명세가 필요하다.
3. **일반 채팅 vs Generate view:** 일반 채팅은 제작·수정·등록 도구 사용, Generate view는 선택한 같은 모델의 읽기 전용 최종 명세 생성이다. Generate view turn에서 plugin 설치나 작업 실행을 시도하지 않는다. 검증 오류 교정은 보이게 최대 2회, provider/transport 오류는 별도 실패이며 모델 자동 교체 없음.
4. **Windows 호출:** 실행 가능한 절대 CLI와 명시 Host를 제공하고 argv JSON 대신 UTF-8 파일을 쓴다. `Invoke-Expression`, POSIX heredoc, PATH 추측을 쓰지 않는다. 아래 예시는 PowerShell 7이며 입력/뷰 파일은 artifact 밖에 둬 digest를 바꾸지 않는다.
5. **검증 주장:** schema 검증, 실제 invoke, 브라우저 확인, 실제 외부 서비스/AI 결과를 구별한다. 비서가 화면을 보지 않았다면 화면 검증 완료라고 쓰지 않는다. 사용자가 고른 모델은 유지하되 개발 수락 시험의 실제 AI 호출은 저장소 기준 Luna low를 쓴다.

현재 지원 경로의 예시(자리표시자는 실제 대상·존재하는 CLI로 교체, 이 문서에서 실행하지 않음):

```powershell
$cliPath = 'C:\Projects\litzio\packages\cli\dist\cli.mjs'
$targetHost = 'http://127.0.0.1:5197'
$inputPath = 'C:\Work\scratch\jira-input.json'
$viewPath = 'C:\Work\scratch\jira.view.json'
@{ preset = 'assigned-open' } | ConvertTo-Json | Set-Content -LiteralPath $inputPath -Encoding utf8NoBOM
& node $cliPath operation invoke example.jira.search --input $inputPath --host $targetHost --json
& node $cliPath view validate $viewPath --host $targetHost --json
& node $cliPath view save $viewPath --name 'my-issues' --host $targetHost --json
& node $cliPath view run $viewPath --root 'C:\Work\documents' --host $targetHost --json
```

v2 구현 뒤 추가할 예시(현재 CLI에서는 미지원):

```powershell
& node $cliPath view run $viewPath --input $inputPath --root 'C:\Work\documents' --host $targetHost --json
& node $cliPath view list --plugin example.jira --host $targetHost --json
& node $cliPath view open 'my-issues' --plugin example.jira --host $targetHost --json
```

**재붙여넣기 제거:** 일반 제작 대화에서도 공용 `view.propose`로 완성 명세를 검증하고 활동 결과에 ‘뷰 열기’를 제공한다. 입력은 명세, 결과는 검증된 명세·receipt이며 저장·조회는 하지 않는다. CLI `view propose <file> --host <origin> --json`도 같은 결과를 반환하지만 앱 탭을 자동 생성하지 않는다. 앱에서 사용자가 결과 카드의 열기를 누르면 원래 Host에 고정된 새 탭을 연다. 모델이 HTML 링크나 임의 tab action을 출력하지 않는다. 기존 display 도구의 권한을 넓히지 않는다. Generate view도 동일 검증 결과를 소비한다. 실패 진단은 기존 최대 2회 교정 흐름으로 전달하고 그 이상은 중단·수정 안내한다. 저장을 요청받았다면 공용 save 후 같은 카드에 즐겨찾기 열기 대상으로 표시한다. 사용자가 완성 JSON을 채팅에 다시 붙일 필요가 없다. CLI 대안은 스킬 즉시 개선으로 안내 가능하지만 이 카드 경로 완료 전에는 통합 UX가 완료된 것으로 보지 않는다.

## 구현 분할과 검증 책임

각 행은 sol 작업자 한 명의 PR 단위다. 이 문서 PR은 작업자를 실행하지 않는다. 계약 PR V1을 먼저 병합한 뒤 병렬 작업하며 공통 파일 충돌은 아래 소유권으로 제한한다. 구현 시 [테스트 지침](../contributing/test-design.md)에 따라 기존 보호를 우선 보완하고 필수 CI를 모두 통과한다.

| PR | 범위·주 소유 파일 | 완료 기준과 주 검증 계층 | 의존 / 시점 |
| --- | --- | --- | --- |
| V1 Core·SDK v2 계약 | Core views의 query/review 명세·입력·한도·중립 refs, SDK views/reviews 타입. 실제 화면·Docling 없음 | Core에서 canonical 왕복, input 타입/누락, 12열 경계, unknown action·secret binding·cross-profile 거부. SDK entry 전 기여 검증 | 설계 수락 후 첫 PR. 4단계 전 필수 |
| V2 Host·CLI 조회/저장·기본 기여 | server/views·plugin view 등록, CLI views. plugin namespace·input 대체·view.propose | HTTP/CLI 같은 args/rows/receipt, 신규 저장·입력 복원·조회 없는 open, 가용성 재검사. renderer 계산 없음 | V1. V3/V4/V5와 병렬. 4단계 전 필수 |
| V3 폼·12열·상태 renderer | apps/editor/src/views 및 공통 상태 adapter | 실제 조작으로 6프리셋 중 대표 전환·5열/12열·입력 저장/열기, 640/960/1440 폭. #1233 5종 고정 상태·secret 원문 비노출. 기존 generated-views 시나리오 보완 | V1; 통합 완료는 V2 + #1233 필요. 4단계 전 필수 |
| V4 review Host·CLI/K1 완료 자료 | 공용 review dispatcher·자료 읽기·K1 bundle 공개, CLI review | 공용 fixture로 Core operation·공식 write path 연결, Root 밖/다른 Host·혼합 자료 거부, baseline/stale·충돌·응답 유실 no-replay 확인. 완료된 이미지/map refs만 공개 | V1. #1233 오류 타입 소비. V5와 병렬. 4단계 전 필수 |
| V5 K2/K3/K4 번들 화면 | 공용 PageSurface/SourceDocumentCompare/ReviewList·Detail, 기존 Read 연결 | 공용 fixture로 이미지/bbox·양방향 선택·불필요 점프 없음·stale 차단·승인/거절/Undo/갱신 중 표시. 실제 1440px 대조, 좁은 창 안내 | V1; 공용 fixture로 병렬 진행, 통합 완료는 V4. 4단계 전 필수 |
| V6 제작 스킬·비서 결과 카드 | authoring-skill·assistant view 결과 연결·관련 계약 | 일반 제작→validated 결과 카드→새 탭에 재붙여넣기 없음. Generate view와 도구 범위 구별, 2회 cap·중단/닫기/늦은 결과 폐기. 스킬 PowerShell 예시 확인 | V2/V3. 문안 초안은 병렬 가능. 4단계 전 필수 |
| V7 LineChart·HorizontalPanel | chart/layout renderer와 Core 해당 union 보완 | 순서·중복 x·null 단절은 Core, 실제 접근성·두 열→세로 전환은 browser. 라이브러리는 기존 자산 우선 | V1 이후 병렬 가능, **4단계 진입 뒤 가능**. 로드맵 3단계 전체 완료에는 필요 |

V1에서 공통 contract/schema를 소유하고, V2는 조회용 Host/CLI, V4는 review/K1용 Host/CLI를 소유한다. V3·V5는 별도 renderer 파일을 쓰며 공통 Views 진입점 통합은 V3 소유다. V6가 비서·스킬 파일을 단독 수정한다. `docs/README.md`·기존 Implemented 계약의 각 절은 해당 동작 구현 PR에서 갱신한다. 아직 미구현인 이 문서 전체를 첫 PR만으로 Implemented로 바꾸지 않는다.

4단계 시작 gate는 V1~V6 + #1233이다. Jira 재수락에서 검색 폼·5열 단일 표·오류 구분·즐겨찾기 입력 복원·수동 run·CLI rows 일치를 확인하고, 공용 review fixture가 G1~G4를 연결해야 한다. 기존 Root picker 결함으로 runner가 실패하면 별도 수정/원인 확인이 필요하며 통과로 계산하지 않는다. 이후 **4단계는 비서가 Docling 플러그인을 만드는 수락 시험**이며 이 구현 분할에 Docling 제품 구현을 추가하지 않는다. V4/V5 공용 fixture 통과를 그 실제 수락으로 대체하지 않는다.

4단계 전에는 실제 교정 저장·재처리를 검증하지 않는다.

다중 페이지 검수 grid/제외 승인·AI 자동 검수 연결·연속 동기 스크롤·다중 PDF/queue·압축 bundle·템플릿 재구성·다중 series/축·설정 동적 UI 이전은 4단계 최소 흐름 뒤로 미룬다. K4 자료 계약의 선택 페이지/제외 표시는 미래 action을 미리 실행시키는 권한이 아니다.

## 소유자 결정과 직접 정한 사항

소유자 결정 필요 항목: 없음.

나머지 작은 결정은 직접 정했다: 12열 상한(5열 요구와 표시 비용), 8필드 단일 form·전체 args 대체(별도 상태 DSL 불필요), 단일 source 유지(조인 요구 없음), 1024px 대조 최소 폭(확정된 넓은 화면 전제), 앱 기존 작업 탭·공통 control 재사용, V7을 Docling 선행 조건에서 분리(시험에서 요구되지 않음). 이 PR의 제안 수락으로 함께 검토할 공개 API/상호작용이며 별도 선호 질문으로 쪼개지 않는다. 이미 결정된 기본 UI·새 탭·저장 위치·수동 조회·모델 선택·2회 교정·원격 코드 금지·migration 없음은 재결정 항목이 아니다.

공통 구현은 DocumentTabs/ViewRenderer, SettingsSelect/SettingsInput/Button/Notice/Dialog 및 기존 Read를 재사용한다. [UI 결정표](ui-decision-table-v1.md)·[UI 패턴](ui-patterns-v1.md)의 입력 오류·적용·범위 규칙과 [Layout Rules](editor-layout-rules-v1.md)·[Visual Language](editor-visual-language-v1.md)의 높이/간격/톤을 따른다. 새 번들 PageSurface와 대조/교정 조합은 기존 표로 표현할 수 없는 K2~K4 때문에 필요한 예외다. 새 색·임의 CSS·별도 Editor를 도입하지 않는다. 구현 PR에서 생성 뷰·Plugin jobs·설정 입력의 같은 패턴 사용처를 함께 확인하고 Before/After 수동 근거를 남긴다.

### V5 fixture 구현 상태

[공용 review renderer](../../apps/editor/src/review/ReviewRenderer.tsx)가 V1 중립 자료 계약과
기존 Read를 조합한다. 선택·승인·pending/applied·stale/unavailable·Undo·갱신 중·폭 안내의
동작 소유권은 [UI 패턴](ui-patterns-v1.md#공용-원본-대조와-변경-제안-catalog-v5-1241-a안)에 둔다.
명세에는 자료와 binding만 남긴다. V4 Host·CLI 통합과 V3 진입점 연결은 아직 검증하지 않았다.
