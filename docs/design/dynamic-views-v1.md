# 동적 뷰 재정의 v1

> #1341(2026-11-09)에서 비서 생성·즐겨찾기·snapshot·통계·차트 기능을 제거했다. 아래는 당시 구현/제안과 검증 기록이며 현재 요구사항이 아니다. 남는 플러그인 화면·조회·표는 [현재 계약](plugin-screens-v1.md), review는 [플러그인 1단계](plugin-stage1-v1.md)를 따른다. 상태·후속 링크를 확인했으며 과거 실험을 다시 실행했다는 뜻이 아니다.

- Status: Historical
- Last verified: 2026-11-09 — Historical 상태·후속 계약 링크 대조. 과거 시험 재실행 아님.
- Previous verification: 2026-11-06 — 소유자 정정(열 상한 제거·Chart/Panel·예시 분리·열별 정렬/필터) 반영. `b49c5d51`의 Core views-v2, shared/view-generation, Views·V6 계약과 #1241 결정, #1254를 정적 대조. 외부 공식 문서 조사. 제품 실행·AI 수락 시험 없음.
- Authority: [ADR-0020 개정안](../adr/0020-plugin-architecture.md#동적-뷰-재정의-개정안-2026-11-06), 2026-11-06 소유자 확정 결정. 세부 API·한도·수명은 이 설계의 제안이다.
- Scope: 연결 데이터·비서 데이터, 표시 위치, 플러그인 화면, 비서 경로와 구현 분할. 현재 구현은 [Generated views](generated-views-v1.md), 공용 review는 [catalog v2](catalog-v2.md). 본 문서의 v1은 설계 첫 판이며 wire schemaVersion 1로의 복귀가 아니다.

## 구현 상태

D1의 Core/SDK 두 source·owner·출처·inline snapshot·canonical·공개 한도·열 상한 제거·Chart/Panel schema와 screens 선언은 구현했다. 현재 실행 계약과 공용 진입점은 [Generated views의 D1 절](generated-views-v1.md#d1-dynamic-data-contract-core-and-sdk)을 따른다. D2의 두 source Host·CLI 실행·snapshot 저장/재열기·owner 및 출처 목록 대조·전송 한도는 [Generated views의 D2 절](generated-views-v1.md#d2-dynamic-data-host-and-cli)에 구현했다. V7의 Chart/Panel renderer는 [Generated views의 V7 절](generated-views-v1.md#v7-chart-and-panel-renderer)에 구현 계약을 기록한다. D4의 비서 자료 경로 및 최종 통합 수락은 이 상태에 포함하지 않는다. 문서 전체는 후속 구현 설계로 유지한다.

D3는 앱 위치·SDK 화면 소비·owner별 즐겨찾기와 공통 읽기 표 조작을 구현했다. 현재 앱 계약은 [Generated views의 D3 절](generated-views-v1.md#d3-앱-위치와-읽기-표)을 따른다. D4 생성 결과 전달 및 D2/V7의 통합 수락은 이 상태에 포함하지 않는다.


## 정의와 경계

동적 뷰는 **비서가 사용자의 요청에 맞춰 만들고, 사용자와 함께 보며 다듬는 표현 수단**이다. 특정 기능, 데이터 제공자, 표시 위치로 정의하지 않는다. 현재 문서·여러 문서·폴더·플러그인 자료를 표현하며 문서 통계는 이를 사용하는 화면 중 하나다.

렌더링은 앱 번들 카탈로그와 제품 공통 부품만 사용한다. 비서는 HTML·CSS·실행 코드를 만들지 않는다. 필요한 부품은 앱 카탈로그에 추가한다. 뷰 생성·열기·조회·즐겨찾기는 원본 문서를 바꾸지 않는다. 기존 review profile의 승인·Undo는 별도의 공용 검토 기능이며 이번 비서 데이터·보기 탭에 그 쓰기 권한을 넣지 않는다. #1241 A안대로 기존 제품 화면의 코드는 유지하고, 명세는 구성·label·자료·작업 binding만 소유한다.

| 데이터 | 생성과 갱신 | 가공과 저장 |
| --- | --- | --- |
| 연결 데이터 | 대상 Host의 공개 읽기 작업으로 조회, 명시적 수동 새로고침 | 기존 filter → groupBy/aggregate → sort → limit만. 즐겨찾기는 명세·args를 저장하며 결과는 저장하지 않음 |
| 비서 데이터 | 비서가 문서·대화·참조·도구 결과를 읽고 요약·계산한 값. 갱신은 비서에게 다시 요청 | 계산식 금지 규칙을 비서의 계산 과정에 적용하지 않음. 명세에는 완성된 행과 출처를 저장. 자동 새로고침 없음 |

비서가 여러 문서의 매출을 합치고 환율·대화의 가정을 사용해 비교 값을 만드는 경우도 비서 데이터다. SQL/조인/수식 엔진을 Core나 renderer에 추가하지 않고 비서가 만든 결과를 표시한다. `method`에는 계산식과 가정을 plain text로 설명할 수 있지만 실행하지 않는다. 정확도는 모델 특성이며 Litzio는 형식·binding만 검증한다.

## 명세와 canonical 형식

현재 `schemaVersion: 2`, `catalog: litzio-v2`, query/review profile을 기반으로 query의 `sources.stats`를 두 종류로 확장한다. 연결 source는 `{kind:"operation", operation, version, args}`로 명시하고 비서 source는 아래 형식을 쓴다. query의 최상위 `owner`를 필수화한다. review 형식은 변경하지 않는다. 이전 파일 reader·migration·자동 필드 보충은 만들지 않으며 거부된 파일은 보존한다. catalog endpoint가 현재 schema와 한도를 공개하고 생성기는 항상 그 schema를 사용한다.

### 예시: 여러 문서의 합계 명세

예시는 부품 이름이나 별도 부품 종류가 아니다. 아래는 부품 목록과 분리한 사용 예시다.

```json
{
  "kind": "litzio-view",
  "schemaVersion": 2,
  "catalog": "litzio-v2",
  "profile": "query",
  "owner": "litzio.assistant",
  "title": "두 문서의 월별 합계",
  "refresh": "assistant",
  "sources": {
    "stats": {
      "kind": "assistant",
      "generatedAt": "2026-11-06T00:00:00.000Z",
      "rowSchema": {
        "month": {"type":"string","label":"월"},
        "total": {"type":"number","label":"합계"}
      },
      "rows": [{"month":"2026-10","total":300}],
      "provenance": [
        {"kind":"document","label":"매출 A","hostId":"host-a","rootId":"root-a","path":"reports/a.md","revision":"revision-a"},
        {"kind":"document","label":"매출 B","hostId":"host-a","rootId":"root-a","path":"reports/b.md","revision":"revision-b"}
      ],
      "method": "두 문서의 같은 월 매출을 합산했다. 단위는 원이다."
    }
  },
  "layout": {"component":"Panel","direction":"vertical","children":[
    {"component":"Table","title":"합계","source":"stats","data":"/rows","columns":["month","total"]}
  ]}
}
```

예시: 위 참조 ID·revision은 형태만 보이며 실제 자료를 가리키지 않는다. 실제 참조는 앱/Host가 공급한 값을 사용한다. 연결 source는 `refresh: manual`, 비서 source는 `refresh: assistant`만 허용한다. 비서 source에는 form, args, operation, transform을 허용하지 않는다. 행 순서는 비서가 준 순서를 보존하며 차트에 필요한 정렬도 명세 제출 전에 끝낸다. query 하나는 하나의 데이터 집합을 유지한다. 복합 출처를 비서가 하나의 schema/rows로 합칠 수 있으므로 여러 원본 요구를 단일 원본으로 제한하지 않는다. 서로 독립된 여러 실시간 작업의 join·혼합 새로고침은 이번 범위에 없다.

### 출처와 크기

`provenance`는 1~64개 목록이며 source 전체에 적용한다. 행별 근거가 필요하면 일반 공개 열로 출처 label을 담을 수 있다. 문서 항목은 `kind,label,hostId,rootId,path,revision`을 갖는다. path는 해당 Root 상대 경로이며 절대 경로·상위 탈출·URL은 거부한다. hostId/rootId는 앱이 알고 있는 identity이며 접속 URL·자격 증명이 아니다. 읽은 revision을 기록하고 원문 저장은 하지 않는다. 저장되지 않은 편집 내용은 문서 revision인 척하지 않고 `kind: reference`로 표시한다.

문서 이외의 항목은 `{kind:"conversation"|"reference"|"tool",label,refId}`이며 tool에는 `hostId,operation,requestId`를 추가한다. refId는 기존 참조/대화 항목/공개 도구 결과의 식별자이고 자료 원문이나 실행 가능한 URL이 아니다. Host는 현재 요청에 공급된 참조 목록과 일치하는지 propose 때 확인한다. CLI 수동 제출은 형식만 확인할 수 있으므로 응답에 `provenanceStatus: unverified`를 반환한다. 이 상태는 명세의 신뢰 인증이 아니며 저장 파일을 다시 열 때도 unverified로 취급한다. 이것은 내용 검증 성공을 뜻하지 않는다. open/run은 원래 참조가 사라져도 저장 행을 표시하며 출처 열기의 가용성을 별도로 판단한다. 알 수 없는 Host를 자동 등록·재바인딩하지 않는다.

| 항목 | 연결 데이터 | 비서 데이터 |
| --- | --- | --- |
| 입력 및 canonical UTF-8 명세 | 32 KiB | 1 MiB (전체 명세, 행·출처 포함) |
| 행 | 2,000 | 10,000 |
| 공개 필드 / 표시 열 | 개수 상한 없음 | 개수 상한 없음 |
| leaf | 8 | 8 |
| scalar string / label | 기존 512 / 160자 | 4,096 / 160자 |
| method | 없음 | 선택 plain text, 4,096자 |

Table의 12열 제한과 간접 제한이 되는 rowSchema의 64필드 개수 제한을 제거한다. 열은 하나 이상의 고유한 공개 필드여야 하지만 최대 개수는 두지 않는다. 데이터 규모는 행 수·전체 용량으로 제한하고, 넓은 표는 패널 안에서 가로 스크롤한다. 자동 열 삭제·두 표 분할은 하지 않는다. 타입·문자 길이·binding 검증은 유지한다. 이는 초기 구현 상한 제안이며 처리 속도 보증이 아니다. 바이트·행·문자 제한을 모두 만족해야 한다. HTTP body, provider output 수집, 결과 카드 저장/전달, CLI 파일 읽기에도 같은 상한을 적용하고 한도 초과는 명시적으로 실패한다. 조용한 잘라내기·표 샘플로의 대체는 하지 않는다. 모델 context/output 한도가 더 작으면 그 요청은 완료 불가로 표시하며 모델을 자동 교체하지 않는다. 전체 행은 공통 표의 페이지 단위 표시로 펼쳐 볼 수 있어야 한다.

Core가 strict union, unknown 필드, rowSchema의 공개 scalar 타입·nullable·유한 숫자·UTC date, 행/필드 일치, component binding과 한도를 검증한다. 연결 작업의 secret 필드 제거는 기존 Host 공개 결과 경계를 유지한다. 비서 rowSchema의 secret 필드는 허용하지 않는다. 내용의 사실성·출처 주장 진실성을 schema 성공으로 보증하지 않는다. canonical은 기존 key code-unit 정렬·배열 순서 보존·기본값 정규화·2칸 들여쓰기·마지막 LF를 재사용한다. 원본과 canonical 모두 바이트 상한을 검사한다.

### 저장과 공용 작업

즐겨찾기는 기존 `.view.json` 새 파일 생성과 `view.validate/propose/save/open/list/run` 및 CLI를 재사용한다. 비서 데이터는 rows·rowSchema·provenance·method·generatedAt을 명세와 함께 저장하며 `.snapshot.json`을 별도로 요구하지 않는다. 연결 데이터의 명세 저장과 별도 snapshot 의미는 유지한다. 같은 이름 거부·원본 보존·컬렉션당 200개 상한도 유지한다.

소유 namespace는 `owner`다. 연결 source는 등록된 operation 소유자와 일치해야 한다. 비서 source는 요청을 시작한 플러그인 화면의 pluginId, 통계 화면은 `litzio.statistics`, 일반 대화·문서 보기에서는 `litzio.assistant`다. 저장 대상 Host와 namespace는 요청 시작에 고정하고 데이터의 출처 Host와 구별한다. Host가 현재 요청의 owner를 검증하며 CLI는 `--plugin <owner>`를 명시한다. plugin-owned save는 등록된 플러그인 namespace만 허용한다. 비활성화·제거가 저장 파일을 지우지는 않는다.

`view run`의 비서 source는 외부 조회·재계산 없이 Core rows와 fields, provenance, `generatedAt`, receipt를 반환한다. Root 없이 실행할 수 있고 `--input`은 거부한다. 연결 source는 기존 입력 대체·Root 검사·수동 조회를 유지한다. `open`은 두 종류 모두 조회하지 않는다. CLI에는 화면 열기 부작용이 없다. UI 위치·선택 탭·focus는 명세나 파일에 넣지 않는다.

## 표시 위치와 수명

상호작용의 단일 기준은 [UI 패턴의 제안 절](ui-patterns-v1.md#동적-뷰-재정의의-표시-패턴-제안)이다. 아래는 #1254에 따른 상태 소유권이다.

| 위치/상태 | 소유자와 identity | 수명·해제 |
| --- | --- | --- |
| 새 작업 탭 | 앱의 tab ID, 고정 Host·owner·definition | 탭 닫기까지. 문서 Save/복구와 독립, 앱 재시작 자동 복원 없음 |
| 우측 `보기` 탭 | 앱의 문서 탭 ID별 보기 상태, 시작 Host·Root·문서 참조 | 개요·표·그림 옆에 추가. 다른 문서로 전환해도 그 문서의 상태를 덮지 않음. 문서 탭 닫기로 해제; 다중 문서 자료도 최초 표시 탭에 귀속 |
| 플러그인 자기 화면 | 앱의 `(Host,pluginId,screenId)` 및 화면 인스턴스 | 기본 뷰·임시 생성 뷰·해당 plugin 즐겨찾기를 함께 표시. 화면 닫기/Host 선택 변경은 요청 취소·임시 상태 해제, 저장 파일 유지 |
| 생성 요청 | daemon 비서의 conversationId·requestId, 앱의 destination generation token | 기존 시도당 180초 timeout 유지 (최초+교정 최대 3시도). 중단·대상 닫기·새 요청은 token 무효화. 늦은 결과는 해당 위치에 적용하지 않음 |
| 결과 카드 | 기존 대화 항목 | 대화 수명을 따름. 대상 창이 없어져도 유효한 기존 카드의 명세는 새 탭으로 열 수 있음. 대화가 사라져도 즐겨찾기는 독립 |
| 즐겨찾기 | 저장 대상 Host의 owner namespace | 명시 삭제까지. 출처 소멸·플러그인 비활성화로 삭제하지 않음 |

문서 전환·숨김은 완료 결과를 새 문서에 적용시키지 않는다. 숨겨진 보기에서 진행 중 생성은 원래 대상에만 완료할 수 있다. 생성 완료 확인용 기존 polling은 요청 수명 안에서만 유지하며 데이터 자동 새로고침 polling은 하지 않는다. 닫힌 대상에는 자동 재생성·새 탭 생성이 없다. 원격 Host 연결 해제는 진행 요청을 실패/취소 처리하고 마지막 검증 결과는 오래된 자료로 남긴다. 다시 연결해도 조회·생성을 자동 반복하지 않는다. 비서 대화 수명과 플러그인 reload 수명은 서로 종료시키지 않는다.

## 플러그인 화면 기여와 진입점

SDK의 기존 `contributes.views`에 선언된 기본 query 뷰를 참조하는 `contributes.screens`를 추가한다.

> 예시: 화면 기여 — `{id:"dashboard",title:"Jira",icon:"LayoutDashboard",defaultViewIds:["issues"],primary:true}`

 화면 ID는 plugin 안에서 고유, primary는 최대 하나, defaultViewIds는 1~8개 고유 ID이며 같은 plugin의 선언된 query view만 참조한다. icon은 앱 번들 allowlist key다. SDK는 entry 실행 전에 중복·미정의 ID·다른 plugin 소유 연결 source를 거부한다. 플러그인 UI 코드·route 문자열·원격 자산은 받지 않는다.

Host catalog는 활성 기여를 `{plugin,id,title,icon,defaultViewIds,primary}`로 공개한다. 화면 body는 기본 뷰 선택과 공통 renderer를 사용하고 앱이 header·Host picker·닫기·오류·수명을 맡는다. 기본 뷰는 항상 다시 선택할 수 있고 즐겨찾기로 덮어쓰지 않는다. screens가 없는 플러그인은 기존 공개 operation의 기본 조회 UI를 유지한다. 설정·계정은 설정 화면에 남긴다.

앱 사이드바의 기능 영역에 primary 화면을 플러그인마다 한 항목으로 표시한다. 같은 플러그인이 여러 Host에 있어도 항목을 중복하지 않고 화면 header에서 Host를 선택한다. 명령 찾기에는 모든 화면을 `플러그인명: 화면명 열기`로 등록하고 플러그인 목록에는 `화면 열기`를 제공한다. 선택 Host가 offline이면 다른 Host로 fallback하지 않는다. 비활성화는 진입점을 숨기고 열린 화면을 unavailable로 표시한다. 목록에서 보관된 즐겨찾기 열기는 남겨 비서 snapshot은 읽을 수 있게 하고, 연결 source 조회는 차단한다. reload 성공 뒤에도 기존 요청을 재전송하지 않는다.

문서 통계 버튼은 같은 사이드바 기능 영역의 내장 항목으로 둔다. 통계 화면에는 통계 namespace 즐겨찾기만 표시한다. 일반 비서 데이터의 `litzio.assistant` 즐겨찾기는 대화의 뷰 열기 메뉴와 `보기` 탭에서 접근한다. 플러그인 즐겨찾기는 그 플러그인 화면 안에서 다루며 전역 통계 허브나 별도 플러그인 dashboard DB를 만들지 않는다.

## 비서 경로

2026-11-06 소유자 정정: 명시적 Generate view 및 Ask assistant UI 진입점은 제거한다.
아래 전용 생성 경로 설명은 내부 기능/설계 기록이며 현재 제품의 버튼 요구사항이 아니다.
일반 대화와 결과 카드·새 탭·즐겨찾기를 사용한다. 현재 구현은
[생성 버튼 제거 계약](generated-views-v1.md#명시적-생성-버튼-제거-2026-11-06)을 따른다.

1. **일반 대화:** 현재 Host catalog와 Root 내 참조 첨부 경계를 사용한다. 비서가 허용된 기존 도구로 자료를 읽고 연결 명세 또는 비서 행을 만든 다음 공용 propose로 검증한다. 여러 문서·도구 결과의 합성은 비서가 수행한다. 첨부 경계 밖 Root/Host를 새로 탐색하는 권한을 추가하지 않는다. 이미 대화에 있는 다른 출처의 텍스트를 합성하면 reference로 기록하며 자동 파일 읽기와 구별한다.
2. **Generate view:** 같은 선택 모델을 유지한다. 현재 assistant-conversations는 viewGeneration에서 references/folders/document를 비운다. D4는 이를 우회하지 않고 생성 요청 준비 단계에 기존 checkedReferences 검사를 재사용하는 자료 snapshot 수집을 추가한다. 기존 도구 없는 최종 명세 생성 경로에 Host가 해석한 첨부 자료와 공개 도구 결과 snapshot을 context로 공급한다. 현재의 “Never include data/hostId” 지시는 source 종류별 지시로 바꾼다. 문서 참조의 hostId만 허용하며 operation args나 임의 URL에 허용하지 않는다. 자료가 없으면 일반 대화에서 읽거나 참조를 첨부하도록 안내한다. 이 경로 자체가 plugin 설치·외부 작업·파일 쓰기를 수행하지 않는다.
3. **우측 보기:** 현재 문서 참조를 제안하고 사용자가 기존 열린 Root 범위의 추가 참조를 붙일 수 있다. `비서에게 요청`은 위 생성 경로와 같은 context·validation·카드를 쓰고 destination만 해당 문서의 보기로 고정한다. 기존 뷰 수정 요청은 현재 명세와 행을 함께 전달한다. 갱신은 새 결과 카드이며 기존 즐겨찾기를 덮어쓰지 않는다.

Codex의 view_catalog/propose_view, Copilot의 현재 CLI 대안과 양 공급자의 Generate view를 유지한다. 별도 provider 도구 지원을 완료로 주장하지 않는다. 최초 시도 뒤 검증 오류 자가 교정은 **최대 2회**이며 각 실패와 교정을 보인다. 교정에는 해당 요청의 자료와 진단만 전달한다. transport/provider 오류는 교정 횟수로 재시도하지 않는다. 모델을 바꾸거나 실패 원인을 숨겨 다른 차트로 대체하지 않는다. 필요한 공개 proposal 입력·결과·CLI는 D2가 함께 제공한다.

## 카탈로그 부품

| 부품 이름 | 공통 옵션과 binding |
| --- | --- |
| `Table` | columns로 공개 필드 선택. 열 개수 상한 없음. 기본 열별 정렬·필터는 명세 옵션이 아닌 제품 공통 동작 |
| `Chart` | `type: "bar" 또는 "line" 또는 "scatter"`, source/data/x/y/title와 공통 `options` 객체 |
| `Panel` | `direction: "vertical" 또는 "horizontal"`, children |

그래프 종류가 늘면 Chart의 type 값을 추가하고, 배치 방향이 늘면 Panel의 direction 값으로 다룬다. 종류별 부품 이름을 늘리지 않는다. 종류별 고유 옵션은 공통 options 객체 안에서 type별 strict schema로 검증하며 알 수 없는 옵션은 거부한다. 이번 범위에서 필요하지 않은 옵션·CSS·실행 코드·범용 확장 bag은 만들지 않는다. options 생략은 기본 동작이다.

D1은 기존 V1~V6의 BarChart/VerticalPanel 계약과 기본 명세·생성 schema·소비 코드를 Chart(type:bar)/Panel(direction:vertical)로 함께 바꾼다. LineChart/ScatterChart/HorizontalPanel이라는 별도 부품은 도입하지 않는다. 예전 형태를 읽는 alias·하위 호환·migration은 없다. 기존 파일을 거부하더라도 보존한다.

V7은 Chart의 line/scatter와 Panel의 horizontal 동작을 확장하며 4단계 보류와 분리한다. line은 숫자 또는 날짜 x, 숫자 y의 단일 series이며 순서·중복 x·null 단절을 Core가 검증한다. 비서 행은 x 오름차순이어야 하며 잘못된 순서는 교정 대상으로 반환한다. scatter는 유한 숫자 x/y, 중복 좌표 허용, null 좌표는 표시 제외하고 제외 건수를 값 목록에 알린다. 점을 선으로 연결하거나 회귀선·보간·새 통계를 계산하지 않는다. bar는 기존 부호·영점 기준 동작을 유지한다. 각 type은 같은 원자료 값 목록을 제공한다.

Panel의 horizontal은 두 자식·한 단계·전체 leaf 8개를 유지하고 가용 renderer 폭 960px 미만에서 세로로 접는다. 창 폭이 아니라 실제 배치 폭을 쓴다. 우측 보기에서는 세로 표시가 기본이다. review의 넓은 대조 화면은 별도 작업 탭을 유지한다. [공통 UI 패턴](ui-patterns-v1.md), [Layout Rules](editor-layout-rules-v1.md), [Visual Language](editor-visual-language-v1.md)를 재사용하고 새 스타일 DSL은 만들지 않는다.

### 데이터 표의 기본 보기 조작

Table은 별도 명세 opt-in 없이 열별 정렬·필터를 제공한다. 동작의 단일 기준은 [데이터 표 정렬·필터](ui-patterns-v1.md#데이터-표-정렬필터-제안)다. 정렬은 오름차순 → 내림차순 → 원래 순서, 필터는 열 머리글에서 타입별로 설정하며 여러 열은 AND로 결합한다. 화면의 정렬·필터는 원자료·명세·Core sort/filter를 바꾸지 않으며 CLI parity 대상이 아니다. 서버 페이지가 있는 연결 데이터는 불러온 행에만 적용하고 그 범위를 안내한다. 즐겨찾기에 이 상태를 저장하지 않고 열 때마다 원래 순서·필터 없음으로 시작한다.

### 예시: 갤러리 사용 사례

이 절의 이름은 부품이 아니라 같은 Table의 사용 예시다. D3에서 `apps/editor/src/dev/ui-gallery.tsx`의 Five columns/Twelve columns 제목을 각각 `Table — 예시: 좁은 표`, `Table — 예시: 넓은 표(가로 스크롤)`로 고친다. `Table — 예시: 열별 정렬·필터`도 제공한다. 열 개수는 예시 자료의 특성일 뿐 제한이나 variant 이름이 아니다. 모든 예시·fixture 제목과 설명에는 `예시:`를 붙이고 부품 목록과 별도 절/영역에 배치한다.

## 구현 분할과 완료 조건

각 행은 sol 작업자 한 명의 PR이다. 이 설계 PR은 제품 코드를 변경하거나 작업자를 실행하지 않는다. 기존 V1~V6 기능은 재사용하되 D1이 부품 계약과 소비 코드를 새 형태로 바꾼다.

| PR | 범위·파일 소유 | 완료 기준 | 의존 |
| --- | --- | --- | --- |
| D1 Core·SDK 계약 | views-v2, SDK screens schema, 공개 limits | 두 source·owner·출처·canonical·1 MiB/10,000행 경계, Table 열/공개 필드 개수 상한 제거, Chart/Panel 계약과 기존 V1~V6 소비 경로 전환, unknown/잘못된 binding 거부. 기존 Core/SDK 검사 보완 | 설계 수락 후 선행 |
| D2 Host·CLI | server/views, view-service, plugin catalog, CLI view | 두 source validate/propose/save/open/run의 동일 결과·receipt, owner 확인·snapshot 저장/재열기·disabled 보존, body/출력 한도 관통 | D1 |
| D3 앱 위치·화면 | Views 진입점·shell·우측 보기·SDK 화면 소비·제품 공통 Table·ui-gallery | 3개 위치·진입점·Host 수명·즐겨찾기 namespace, 공통 Table 정렬·타입별 열 필터·불러온 행 범위·접근성·상태 비저장, 넓은 표 가로 스크롤 및 갤러리 예시 제목을 실제 조작으로 확인 | D1 뒤 D2/D4/V7과 병렬, 통합은 D2 |
| D4 비서 context·카드 | shared/view-generation, assistant adapters·번들 제작 안내 | 기존 열린 Root 범위의 여러 문서+공개 도구 결과 합성, 두 source 안내·출처·행 펼치기, 최대 2회 교정·취소·timeout·출력 한도, 일반 대화/Generate view/보기 연결 | D1 뒤 병렬, 통합은 D2/D3 |
| V7 Chart type·Panel direction 확장 | 공통 Chart/Panel과 Core type별 options schema | line 순서·중복/null, scatter 좌표/null, accessible 값 목록, 실제 배치 폭별 세로 접기. UI·CLI 값 동일 | D1 후 즉시 병렬; 4단계 진입 조건과 독립 |

D1이 공통 schema를 먼저 병합하고 V7은 Chart type·Panel direction과 해당 옵션/렌더링만 확장한다. D1이 bar/vertical 소비 코드 전환까지 완료해 중간 PR의 동작을 유지한다. D3가 Views 진입점과 공통 UI 패턴·결정표 갱신을 소유한다. D4는 D3가 제공하는 destination token 계약만 소비한다. D2/D4는 provider 수집→HTTP→receipt/카드→파일까지 출력 한도를 함께 검토하고, D3/D4는 180초 timeout·중단·닫힘·늦은 결과를 함께 확인한다. 문서의 각 절은 해당 구현 PR에서만 Implemented 계약으로 옮긴다.

최종 수락은 일반 대화에서 기존 열린 Root 범위의 두 문서와 도구 결과로 계산한 표·선/산점도를 만들고, 새 탭·보기·플러그인 화면에서 동일 행을 확인하며, 비서 데이터 즐겨찾기를 다시 열어 재계산 없이 같은 값·출처가 남는 흐름이다. 별도로 연결 데이터 수동 새로고침과 플러그인별 즐겨찾기 격리를 확인한다. `pnpm browser:test` 기존 시나리오를 보완하며 640px 이상 데스크톱과 실제 우측 영역 폭을 확인한다. 실제 AI 시험은 Codex gpt-6-luna low를 쓴다. 예시: fixture의 검증 근거와 브라우저/실제 AI/외부 서비스 근거는 구분한다. 원격 Host·큰 자료를 시험하지 않았다면 그 조건은 미확인으로 남긴다. 필수 CI 통과와 작업자가 시작한 프로세스 정리도 완료 조건이다.

## 참고 사례와 선택

2026-11-06 공식 자료 기준, [Copilot in Excel](https://support.microsoft.com/en-us/excel/copilot/visualize-your-data-with-copilot-in-excel)의 자연어 차트 요청과 다시 요청해 다듬는 흐름, [Notion chart](https://www.notion.com/help/charts)의 같은 데이터에 대한 여러 표현, [Obsidian Bases](https://help.obsidian.md/bases)의 데이터와 저장 뷰 분리를 따른다. [VS Code](https://code.visualstudio.com/api/extension-guides/tree-view)의 선언형 화면 기여와 [Paseo](https://paseo.sh/docs/plugins/reference.md)의 screen·sidebar·Command Center 진입점, 앱 소유 header/Host picker/닫기, 선택 Host 고정 방식을 따른다. Paseo의 임의 React Native 화면 body는 소유자가 정한 번들 카탈로그 제한 때문에 채택하지 않는다. Obsidian의 수식 런타임이나 Copilot의 원본 workbook 편집도 이 읽기 전용 뷰에 도입하지 않는다. 제품 전체를 JSON UI로 전환하지 않으며 자료 정확도는 모델 결과 안내와 출처/행 열람으로 설명한다. 문서 조사이며 이들 제품의 직접 사용 시험은 아니다.

## 결정 항목

추가 소유자 결정 요청은 없다. 확정된 제품 방향을 재질문하지 않는다. 추천 세부안은 1 MiB/10,000행·64출처, query 단일 결과 집합, 기존 v2 확장, 기존 열린 Root 참조 경계, plugin 화면별 namespace와 문서 탭별 보기 수명이다. **그래서 무엇이 안 되는가:** 무제한 자료, 여러 실시간 source 자동 join, Root 밖 자동 자료 수집, 자동 재계산, 플러그인 임의 화면 코드, 이전 저장 파일 migration은 제공하지 않는다. 더 큰 자료가 실제로 막히면 측정 근거로 한도를 별도 개정한다.
