# Guided tour spike (document writing)

- Status: Historical
- Last verified: 2026-11-11 (실제 headless Chrome 1440×900에서 5단계 전체·차단·Esc 확인; 좁은 화면·Desktop·실제 한국어 IME 입력은 확인하지 않았다).
- Scope: 스파이크 증거. 투어 엔진·계약을 제품 결정으로 정하지 않는다. 푸시·PR 없음.
- Current authority: [Editor layout rules](../design/editor-layout-rules-v1.md)와 [Visual language](../design/editor-visual-language-v1.md)(토큰·장식 애니메이션 금지), [UI 결정표](../design/ui-decision-table-v1.md).

- Baseline: `3e12029` (master). 브랜치 `spike/guided-tour`.
- Question: 리치오 화면 위에 영역을 강조하고 나머지를 막는 안내 레이어로 "문서 작성 첫걸음" 투어를 Command Center에서 시작할 수 있는가.

## Shape

- 진입점: Command Center의 "도움말: 문서 작성 둘러보기" (`document-writing-tour`). 열린 폴더 안에 `litzio-tour-practice-<시각>.md`를 새로 만들어 열고 투어를 시작한다. 기존 문서는 건드리지 않는다. 열린 폴더가 없으면 안내 메시지만 보인다.
- `apps/editor/src/tour/`
  - `tour.ts`: 순수 엔진. 단계 데이터, 문서 진행 판정(`probeDocument`), 상태 전이(`reduceTour`), 카드 배치(`placeCard`).
  - `anchors.ts`: 닫힌 앵커 목록. 투어는 선택자가 아니라 `TourAnchorId`로만 가리킨다. 안정적인 훅이 없던 세 곳(제목 입력, 문서 본문, 개요 패널)에만 `data-litzio-anchor`를 붙였다.
  - `GuidedTour.tsx`·`tour.css`: 스포트라이트 레이어. 토큰만 사용하고 장식 애니메이션이 없다.
  - `document-writing-tour.ts`: 5단계 데이터.
- `DocumentEditor` 핸들에 `tourProbe()`·`onTourChange()`를 추가했다. 문서를 바꾸지 않고 엔진 상태만 읽는다.
- 문서 내용 의미(Core)·Host·CLI는 바꾸지 않았다. 투어는 Editor 전용 안내이며 CLI 대응 대상이 아니다.

## Steps and the mechanism each uses

| # | 강조 | 실제 수단 | 넘어가는 조건 |
| --- | --- | --- | --- |
| 1 제목 | 제목 입력 | `DocumentTitle` 입력, Enter가 본문으로 이동 | 제목이 있고 제목 입력에서 커서가 나갔을 때 자동 |
| 2 장 제목 | 본문 첫 줄 (활성 영역: 본문 전체) | `## ` + 공백 Markdown 입력 규칙 또는 `/` → 제목 N | 글자가 있는 제목이 생기면 '다음' 잠금 해제 |
| 3 개요 | 오른쪽 개요 패널 (닫혀 있으면 연다) | 개요 패널 | '다음' |
| 4 표 | 블록 `+` 버튼 (활성 영역: 본문 전체) | `/` → 표 또는 `+` 메뉴 → 표 | 표가 생기면 자동 |
| 5 참조 | 본문 전체 | `/절` → "절 참조: …" | 상호 참조가 생기면 '완료' 잠금 해제 |

## Adapted from the proposal

- 2단계: Tab 키 제목 수준(#189)은 현재 master에 없다. 실제 수단인 `## ` 입력 규칙과 `/` 메뉴로 안내한다.
- 5단계: 새 표는 레이블이 비어 있어 `/` 메뉴의 참조 목록에 "표 1"이 나오지 않는다. 표 속성의 레이블을 지정하면 "표 1"로 참조할 수 있다(카드 문구에 안내). 투어는 레이블이 필요 없는 "절 참조"로 마친다. 표 레이블 입력까지 안내하려면 표 속성 폼을 가리키는 하위 단계가 더 필요하다.
- 4단계의 강조 대상 `+`는 호버·커서 위치에 따라 보이는 블록 컨트롤이다. 보이지 않을 때는 강조 테두리 없이 안내 카드만 보인다.

## Blocking and exit

- 활성 영역(구멍) 밖의 포인터 입력(pointerdown, mousedown, click, contextmenu 등)과 키 입력은 캡처 단계에서 거부한다. 안내 카드와 `.ui-portal`(`/` 메뉴·블록 메뉴)은 허용한다.
- Command Center·비서 단축키는 App 수준에서 투어 동안 일시 중지한다. 저장 단축키는 그대로다.
- Esc 또는 '건너뛰기'가 즉시 종료한다. 연습 탭을 떠나도 종료한다.
- 위치는 `requestAnimationFrame` 측정으로 창 크기·스크롤·패널 변화를 따라간다. 1440→1100px 변경에서 강조 테두리가 대상과 4px 이내로 일치함을 확인했다.

## Gaps

- 스크린 리더·키보드 전용 경로(카드로 포커스 이동)는 구현하지 않았다. 카드는 `role="region"`과 `aria-live`만 가진다.
- 640px 미만과 비서 오버레이가 열린 좁은 화면(`inert`)은 확인하지 않았다. 시작 시 비서를 닫는다.
- 플러그인이 자기 투어를 넣는 SDK 계약, 비서가 화면 요소를 가리키는 `highlight_ui` 도구는 범위 밖이다.
- 실행마다 연습 문서가 하나씩 쌓인다. 정리는 사용자가 한다.
- 입력 거부는 이벤트 캡처 기반이다. 포인터 이벤트 이전에 등록된 App 수준 캡처 리스너는 막을 수 없어 단축키는 App에서 직접 확인한다.
