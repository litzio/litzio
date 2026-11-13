# 카탈로그 v2

> 2026-11-14 정적 상태 확인: 아래 “현재”·“유지된”·“후속”은 당시 시점을 뜻한다. 2026-11-13 선언형·조회/자동 form·공용 검수 틀은 삭제됐다. 현행 계약은 [실행·제작](plugin-stage1-v1.md)과 [화면 코드](plugin-screens-v1.md)이며 아래 계획·검증을 재도입 요구로 쓰지 않는다. 제품 재실행 없음.

- Status: Historical
- Last verified: 2026-11-09 — #1341 제거 결정과 남은 구현 경계 대조. 과거 외부 서비스 수락 시험 재실행은 아님.
- Authority: [ADR-0020](../adr/0020-plugin-architecture.md), [#1341](https://github.com/litzio/litzio/issues/1341).
- Scope: 카탈로그 v2 설계 중 당시 유지된 query/InputForm/Table·K2/K3/K4·V5의 경계와 후속 수락. 현재 실행 계약은 [플러그인 화면](plugin-screens-v1.md)과 [플러그인 1단계](plugin-stage1-v1.md)가 소유한다.

## 범위 정리

2026-11-09 소유자 결정으로 비서 뷰 생성·교정·출처/assistant source·snapshot·즐겨찾기·문서 통계·Chart·가로 Panel을 제거했다. 기존 설계의 이 기능들과 저장/제안 단계는 후속 요구사항이 아니다. 일반 비서 대화·문서 도구·requestUserInput과 플러그인 기본 화면·연결 확인·작업 패널은 유지한다.

2026-11-09 당시 유지한 v2 요소는 다음과 같다.

| 영역 | 당시 계약 | 검증 경계 |
| --- | --- | --- |
| 조회 | 등록 Host read operation/version/owner, schema 기반 입력, 수동 실행, 안전한 오류/receipt | [plugin screens](https://github.com/litzio/litzio/blob/archive/2026-11-13-plugins-declarative/docs/design/plugin-screens-v1.md#core-명세와-조회) |
| 입력·표 | 공개 scalar InputForm, 세로 Panel/Table, 정렬·필터·링크 | [공통 Table](https://github.com/litzio/litzio/blob/archive/2026-11-13-plugins-declarative/docs/design/plugin-screens-v1.md#공통-table과-링크) |
| K2/K3 | 완료 bundle의 Host 참조, 페이지·영역·mapping, 기존 문서 Read와 원본의 대응 | [review Host](https://github.com/litzio/litzio/blob/archive/2026-11-13-plugins-declarative/docs/design/plugin-stage1-v1.md#v4-공용-review-hostcli) |
| K4 | pending 제안, 사용자 approve/reject/undo, baseline/stale·uncertain 관찰, Core 공식 write path | [변경 관찰](https://github.com/litzio/litzio/blob/archive/2026-11-13-plugins-declarative/docs/design/plugin-stage1-v1.md#화면의-변경-결과-관찰과-페이지-없는-k4) |
| V5 | PageSurface·SourceDocumentCompare·ReviewList·ReviewDetail, 읽기 전용 대조 | [공용 대조](ui-patterns-v1.md#공용-원본-대조와-변경-제안-catalog-v5-1241-a안) |

뷰 명세의 검증과 문서 변경 제안은 다르다. `view validate`는 문서를 변경하지 않으며 review의 propose/approve/undo는 별도 Host 공용 작업이다. 임의 client 코드·query write 버튼·문서 의미의 UI 전용 구현·새 workflow engine은 도입하지 않는다.

## 구현과 수락

Core 의미, SDK 등록, Host/CLI, 브라우저 fixture는 각 계약에 기록된 범위만 증명한다. Docling 실제 변환·재처리·교정과 실제 외부 서비스 수락, 비서가 플러그인을 제작하는 4단계 수락은 별도다. 로드맵을 현재 구현 완료로 간주하지 않는다.

## 과거 설계와 근거

종전 설계의 조사·수락 실패·PR 분할·실행 예제는 [제거 직전 보관본](https://github.com/litzio/litzio/blob/archive/dynamic-ui-2026-11/docs/design/catalog-v2.md)에 있다. 비서 생성·저장 뷰 계약은 [Historical 기록](generated-views-v1.md), 동적 뷰 재정의는 [Historical 제안](dynamic-views-v1.md)이다. 새 동적 UI는 [소유자의 업무·탐색·판단 순환 기준](https://github.com/litzio/litzio/discussions/767#discussioncomment-19481395)으로 별도 정의한다.

## #1408의 한정 구현

생성 문서 PDF 대조·페이지 확인 기록은 [구현 계약](https://github.com/litzio/litzio/blob/archive/2026-11-13-plugins-declarative/docs/design/plugin-stage1-v1.md#pdf-원본-대조와-확인-기록-1408-sdk-040)을 따른다. K2/K3의 기존 페이지 이미지·bbox renderer와 V4 snapshot을 재사용하며 확인 기록 작업을 추가했다. Docling의 화면 내 수정·완료 승인은 구현하지 않았으며 이 Draft 전체나 후속 수락 시험의 완료를 뜻하지 않는다.

2026-11-13: 해당 선언형·Docling·검수 기능은 삭제했다. 현재 계획이 아니며 보관 브랜치 `archive/plugins-declarative-2026-11-13`, 태그 `archive/2026-11-13-plugins-declarative`에서 당시 소스를 확인한다.
