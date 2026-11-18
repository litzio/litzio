# Litzio Design

- Status: Implemented
- Last verified: 2026-11-16 — 문서·토큰·공통 부품·검사 코드의 정적 대조. 화면 실행 검증은 포함하지 않는다.
- Authority: [AGENTS.md](AGENTS.md)의 제약과 [리치오의 목적](docs/purpose.md), Accepted ADR을 따르는 UI 원칙과 부품 선택 기준이다.

## Overview

문서가 주인공이다. 가만히 있을 때는 문서이고, 조작할 때만 도구가 보인다.
도구가 나타나도 본문과 주변 컨트롤은 밀리지 않는다. 읽고 쓰는 위치를 유지하기 위해서다.

화면의 모든 요소는 “이것을 한다” 아니면 “이것을 안다”에 쓰인다.
꾸미기 위한 요소는 두지 않는다. 상시 표시는 상태·대상·지금 할 수 있는 행동만이다.
설명은 hover와 keyboard focus로 보인다. 사용자가 지금 하는 일에 집중하게 하기 위해서다.

일관성은 눈으로 맞추지 않고 재사용으로 얻는다. 세 곳 이상에서 쓰이는 요소는 공통 부품이다.
값은 [tokens.css](apps/editor/src/styles/tokens.css) 한 곳에서만 바뀐다.
화면마다 비슷한 값을 다시 정하면 같은 역할의 표현이 갈라지기 때문이다.

리치오만의 방식을 만들지 않는다. 기본은 Paseo·VS Code 같은 참고 서비스의 관례다.
다르게 하려면 이유가 있어야 한다. 익숙한 조작을 다시 배우게 하지 않기 위해서다.

UI 작업은 이 문서를 먼저 읽고 [결정표](docs/design/ui-decision-table-v1.md)에서 표면과 공통 구현을 고른다.
기존 부품의 사용법과 화면별 동작은 아래 세부 계약을 따른다.

## Colors

색은 값 대신 역할로 고른다. 제품 색 값·밝음과 어두움 테마·포인트 색 프리셋은 모두
[tokens.css](apps/editor/src/styles/tokens.css)가 소유한다. 소비 화면에 색 값을 복사하지 않는다.
Plum·Blue·Violet·Teal·Green·Graphite 프리셋도 같은 역할을 바꾸므로 화면별 팔레트를 만들지 않는다.

`--id-color-text`는 내용과 이름, `--id-color-text-muted`는 보조 글씨,
`--id-color-text-subtle`은 더 조용한 metadata에 쓴다. 중요한 내용을 흐리게 숨기지 않는다.

`--id-color-paper`는 문서, `--id-color-canvas`는 그 주변 바탕이다.
`--id-color-surface`는 입력·메뉴·대화상자 같은 표면이며 `--id-color-surface-subtle`과
`--id-color-surface-muted`는 주변 틀과 보조 면을 구분한다. 문서와 도구의 역할을 색으로 분리한다.

`--id-color-border`와 `--id-color-border-subtle`은 구조 구분,
`--id-color-border-control`은 입력 경계, `--id-color-border-focus`는 키보드 focus다.
구조선과 입력 가능한 경계를 같은 강도로 그리지 않는다.

`--id-color-interaction`과 `--id-color-accent`는 포인트 색이다.
주 동작·선택·링크·focus에 쓰며, hover·pressed·selected 면은 각각의 surface 토큰을 쓴다.
선택 상태와 keyboard focus는 별개로 보인다. 현재 값과 다음 조작 위치가 다르기 때문이다.
목록·트리·표처럼 여러 줄을 가진 부품은 focus를 상자 전체가 아니라 현재 줄에 표시한다. 상자 테두리는 어느 줄에 있는지 알려 주지 못하고, 창을 열 때마다 큰 강조를 만들기 때문이다.

`--id-color-danger`와 `--id-color-surface-danger`는 위험·오류,
`--id-color-warning`과 `--id-color-surface-warning`은 경고에 쓴다.
`--id-color-success`는 정상·성공·연결됨 같은 상태의 점과 글씨에 쓴다.
`--id-color-info`는 중립 정보다. 단순 안내를 포인트 색이나 위험색으로 강조하지 않는다.

라디오·체크박스·진행 표시 같은 브라우저 기본 입력 요소도 포인트 색 토큰을 쓴다.
기본 요소와 공통 부품이 같은 선택 의미를 보여야 하기 때문이다.

토큰 밖의 UI 색 값은 쓰지 않는다. [visual-tokens.test.ts](apps/editor/test/visual-tokens.test.ts)는
검사 대상 소비 코드의 색 리터럴과 지정 Tailwind 팔레트 사용을 잡는다.
원본 이미지·PDF의 색은 UI 팔레트로 바꾸지 않는다.

## Typography

앱 서체는 `--font-family-sans`의 Pretendard 계열, 코드·식별자는 `--font-family-mono`를 쓴다.
화면마다 크기·굵기·색을 직접 조합하지 않고 아래 역할을 고른다.
토큰의 px 값은 [tokens.css](apps/editor/src/styles/tokens.css), 공용 class와 기존 class의 연결은
[type-roles.css](apps/editor/src/styles/type-roles.css) 한 곳에서 정한다.

| 역할 / 공용 class | 크기 토큰 | 굵기 토큰 | 색 토큰 (`--id-color-`) |
| --- | --- | --- | --- |
| 화면 제목 / `type-screen-title` (화면에 한 번) | `--font-size-xl` | `--font-weight-semibold` | `text` |
| 범주 제목 / `type-category-title` | `--font-size-lg` | `--font-weight-semibold` | `text` |
| 구역 이름 / `type-section-title` | `--font-size-md` | `--font-weight-semibold` | `text` |
| 묶음 이름 / `type-group-title` | `--font-size-xs` | `--font-weight-semibold` | `text-muted`, 아래 `border-subtle` 구분선 |
| 다루는 항목의 이름 / `type-item-name` | `--font-size-sm` | `--font-weight-semibold` | `text` |
| 읽기만 하는 값의 이름 / `type-value-name` | `--font-size-sm` | `--font-weight-normal` | `text-muted` |
| 본문·값 / `type-body` | `--font-size-sm` | `--font-weight-normal` | `text` |
| 보조 / `type-helper` | `--font-size-xs` | `--font-weight-normal` | `text-muted` |
| 버튼·탭·메뉴 항목 / `type-control` | `--font-size-sm` | `--font-weight-medium` | 상태에 따름 |

앱의 기본 글씨는 14px·400이며 굵기는 400·500·600 셋, 최소 크기는 12px이다.
의미 색(위험·경고·정상·포인트)은 역할의 색 자리를 대신할 수 있다.
선택된 탭·항목과 ChoiceGroup의 현재 값은 기존 상태 표시인 600을 유지한다.
이름과 상태를 한 줄에 섞지 않는다. 대상과 지금의 상태를 따로 읽게 하기 위해서다.

앱 화면에서 역할 표에 없는 크기·굵기·색 조합, 부모의 상대 크기(`em`, `%`, `smaller`),
700 굵기를 새로 쓰지 않는다. `small`·`kbd`는 보조 크기, `code`는 본문 크기,
`strong`·`b`는 600을 기본으로 한다.

문서 본문과 앱 화면의 타이포그래피는 따로다. 문서는 `--font-family-document`,
`--font-size-document`, `--line-height-document`와 문서 제목·caption·표·코드 전용 토큰을 쓴다.
문서 내용의 강조·상대 크기는 문서 규칙을 따르며 앱 역할로 바꾸지 않는다.
문서 취향을 바꿔도 버튼·설정 행의 글씨는 바뀌지 않는다.

## Layout

창은 공용 머리줄, 왼쪽 탐색기, 그룹별 탭 줄과 본문, 도킹 패널로 구성한다.
문서 탐색과 비서는 각자의 패널 수명과 폭을 유지한다. 탭 안 내용이 창의 틀을 다시 만들지 않는다.
창의 동작은 [Editor UX Shell](docs/design/editor-ux-shell-v1.md)이 소유한다.

화면 종류마다 바탕과 여백이 정해져 있다. 문서는 종이다.
문서 폭과 안쪽 여백은 `--layout-content-width`, `--layout-content-width-wide`,
`--layout-document-inline-padding`, `--layout-document-block-padding`을 따른다.
도구를 위한 여백과 본문 축을 화면별로 다시 계산하지 않는다.

작업 탭인 설정·템플릿 갤러리·플러그인 화면은 같은 바탕(`--id-color-surface`)을 쓴다.
화면의 바깥 여백은 `--space-6`이며 화면 제목의 위치도 같다.
바탕·바깥 여백·제목 위치는 화면 틀이 소유하고 화면 내용이나 플러그인이 정하지 않는다.
템플릿 갤러리와 플러그인 작업 탭의 머리는 제목과 설명, 상태, 동작을 가진 고정 구역이다.
내용을 스크롤해도 머리는 남으며 구분선으로 본문과 나눈다.
설정처럼 목록+상세 구조인 화면은 그 안에서 탐색 열과 자체 여백을 가진 내용 열을 나눈다.
내용 열의 최대 폭은 `--layout-settings-content-width`를 따른다.
내용이 바뀌어도 같은 종류의 화면이라는 감각을 유지하기 위해서다.

한 줄의 컨트롤은 입력칸의 선에 맞춘다. 이름표가 붙은 입력칸 옆 버튼도 입력칸에 맞춘다.
행의 컨트롤은 오른쪽 선에 정렬한다. 글자 높이나 이름표 위치에 버튼을 맞추지 않는다.

간격은 `--space-1`, `--space-2`, `--space-3`, `--space-4`, `--space-5`,
`--space-6`, `--space-8`, `--space-12`, `--space-16`의 단계에서 고른다.
가까운 조작, 묶음 내부, 묶음 사이를 구별하되 화면마다 비슷한 숫자를 추가하지 않는다.
정확한 축·간격·예외는 [Layout Rules](docs/design/editor-layout-rules-v1.md)를 따른다.

지원 범위는 최소 640px의 데스크톱급 창과 키보드·포인터 입력이다([ADR-0010](docs/adr/0010-supported-viewport-and-input.md)).
640px의 기준은 깨지지 않는 것이다. 의도하지 않은 겹침·잘림·도달할 수 없는 조작이 없어야 한다.
넓은 창과 같은 정보를 동시에 배치할 필요는 없다.

## Elevation & Depth

그림자는 문서와 겹침 표면의 깊이를 구별할 때 쓴다. 장식용 카드마다 그림자를 추가하지 않는다.
종이는 `--shadow-paper`, 메뉴·팝오버·대화상자는 `--shadow-overlay`를 쓴다.
선택 segment의 작은 높이 차이는 `--shadow-segment`가 맡는다.

팝오버는 대상 옆의 짧은 작업, 메뉴는 동작 선택, 대화상자는 독립 입력·확인에 쓴다.
공통 부품의 portal과 겹침 처리를 재사용한다. 임의의 z-index로 다른 표면을 덮지 않는다.
알림은 공용 알림 센터를 쓴다. 화면마다 별도의 떠 있는 알림 층을 만들지 않는다.

## Motion

움직임은 나타남·사라짐·상태 변화에만 쓴다. 0.25초를 넘지 않으며 값은 공통 토큰에서 정한다.
글을 쓰는 도중에 키보드로 여닫는 표면은 닫는 즉시 사라지며, 사람이 입력하는 속도에서 입력을 문서로 돌려준다.
배치를 바꾸는 속성은 움직이지 않는다. 접히는 구역은 CSS로 가능한 높이 전환만 예외로 둔다.
운영체제의 움직임 줄이기를 따른다. 장식 반복, 튀는 곡선, focus 표시의 전환은 쓰지 않는다.

## Shapes

`--id-radius-sm`, `--id-radius-md`, `--id-radius-lg`, `--id-radius-xl`은
작은 내용·컨트롤·팝오버·대화상자의 모서리 역할을 구분한다.
종이는 `--id-radius-paper`를 쓴다. 표면의 역할을 화면별 둥글기 취향으로 바꾸지 않는다.

문서 블록의 올림·선택·대응은 편집기, 문서 보기, 플러그인 화면의 자료 쪽 모두 같은 [블록 윤곽 토큰](docs/design/editor-visual-language-v1.md#블록-윤곽과-연결-띠)을 쓴다. 나란히 보이는 짝을 선택하면 양쪽 윤곽이 연결 띠를 따라 이어진다.

`--size-control`은 기본 컨트롤, `--size-control-compact`는 조밀한 도구,
`--size-icon-slot`은 아이콘 칸이다. 보이는 아이콘 크기로 클릭 영역을 줄이지 않는다.
문서 안 작은 참조나 표 손잡이의 예외는 Layout Rules의 명시된 예외를 따른다.

## Components

새 부품을 만들기 전에 [components/ui](apps/editor/src/components/ui/)를 읽는다.
같은 역할이면 기존 부품을 재사용한다. 시각적 일관성과 focus 동작을 함께 유지하기 위해서다.

[Button](apps/editor/src/components/ui/button.tsx)의 사용자용 종류는 넷이다.
채움은 `default`, 테두리는 `outline`,
무테는 `ghost`, 빨간 테두리는 `destructive`다.
`table-handle`은 표 도구 전용 변형이며 일반 동작 버튼의 다섯 번째 종류로 쓰지 않는다.

채워진 주 버튼은 한 화면에 하나, 그 화면의 주된 동작에만 쓴다.
새로고침·불러오기·필터 같은 보조 동작은 테두리 버튼이다. 주 동작의 위치가 흐려지지 않게 한다.
무테는 닫기·펼치기처럼 틀의 일부인 조작에 쓴다.

위험한 동작은 빨간 테두리 버튼이다. 채운 빨강은 쓰지 않는다.
`destructive`는 테마 바탕과 위험색 글씨·테두리, hover의 위험 보조 면을 쓴다.
실행 전 [DangerConfirmation](apps/editor/src/components/ui/danger-confirmation.tsx)을 거치고 기본 focus는 취소다.
실수로 파괴적 동작을 확정하지 않게 하기 위해서다.

한 화면의 제목은 한 번만 나온다. 탭과 화면 틀이 가진 제목을 내부 콘텐츠가 다시 제목으로 반복하지 않는다.
대상의 이름을 중복해 시각적 위계를 늘리지 않기 위해서다.

한 줄 입력은 [Input](apps/editor/src/components/ui/input.tsx)을 쓴다.
이름표는 항상 식별 가능하게 두며 placeholder로 대체하지 않는다. 입력 목적과 값은 다른 정보다.

짧은 필수 단일 선택은 [ChoiceGroup](apps/editor/src/components/ui/choice-group.tsx),
설정의 on/off와 많은 값 선택은 [SettingsSwitch·SettingsSelect](apps/editor/src/components/ui/settings.tsx)를 쓴다.
ChoiceGroup을 문서 탭이나 서식 토글로 쓰지 않는다. 선택 값과 탐색·명령은 역할이 다르다.

동작 목록은 [DropdownMenu](apps/editor/src/components/ui/dropdown-menu.tsx),
대상별 우클릭·키보드 메뉴는 [ContextMenu](apps/editor/src/components/ui/context-menu.tsx)를 쓴다.
값을 고르는 설정 행을 동작 메뉴로 바꾸지 않는다.

대상 옆 속성은 [Popover](apps/editor/src/components/ui/popover.tsx), 독립된 입력은
[Dialog](apps/editor/src/components/ui/dialog.tsx), 파괴 확인은 DangerConfirmation을 쓴다.
설명은 [Tooltip](apps/editor/src/components/ui/tooltip.tsx)으로 hover·keyboard focus에서 제공한다.
Tooltip이 입력 이름표나 필수 오류 안내를 대신하지 않는다.

창 단위 문제·작업 알림은 [useNotifications](apps/editor/src/components/ui/notification-center.tsx)로 등록한다.
입력 오류는 해당 필드 곁에 둔다. 작업 전체 문제와 입력을 고칠 위치가 다르기 때문이다.

데이터 표는 [DataTable](apps/editor/src/components/DataTable.tsx)의 기본 밀도를 쓰고, 폭은 내용에 맞추되 화면 폭을 넘지 않는다.
화면마다 글씨·행 간격을 줄이지 않는다. 숫자 열은 오른쪽 정렬이다. 같은 자리의 수치를 비교하기 위해서다.
열 제목은 그 열의 값과 같은 선에서 시작하고, 오른쪽 정렬 열은 같은 선에서 끝난다. 제목과 값을 같은 열로 읽고 비교하기 위해서다.
문서 안 표의 의미와 편집은 문서 표 계약을 따른다.

설정은 [SettingsRow·SettingsSwitch·SettingsSelect](apps/editor/src/components/ui/settings.tsx)로 이름·설명·컨트롤을 배치한다.
플러그인 화면도 공통 부품과 화면 틀의 바탕·여백·제목 규칙을 따른다.
[screen-parts.tsx](apps/editor/src/components/ui/screen-parts.tsx)의 화면 부품별 사용법은
[플러그인 화면 계약](docs/design/plugin-screens-v1.md)이 소유한다.

같은 종류의 정보는 본체와 플러그인에서 같은 공용 부품으로 만든다.

- 줄은 `Row`(`SettingsRow`는 같은 구현의 별칭, 플러그인은 `ui.Row`)다. 이름은 왼쪽 선, 값·컨트롤은 오른쪽 끝 선에 맞춘다. 비교할 위치를 일정하게 하기 위해서다. 좁은 부모에서는 값이 이름 아래의 왼쪽 선으로 내려간다.
- 여러 줄의 묶음은 `Section`(`ui.Section`)이다. 묶음 이름과 항목 이름을 중복하지 않고, 항목 하나에는 묶음을 만들지 않는다. 불필요한 위계를 줄이기 위해서다. 설명은 결과를 바꾸는 경우만 상시 표시한다.
- 패널 머리는 `PanelHeader`다. 구역 이름은 왼쪽, 동작은 오른쪽이다. 패널 머리는 문서 탭 줄과 같은 높이로 세 열의 아래 경계를 한 선에 맞추며, `TaskHeader`와는 좌우 여백과 구분선을 공유한다. 좌우 여백은 패널 내용의 기존 시작선에 맞춘다. 같은 구역 경계를 같은 모양으로 읽게 하기 위해서다. 대화상자는 Dialog 구조를 유지하고 제목만 `type-section-title`을 쓴다.
- 상태는 `Status`(`ui.Status`)의 점과 사람의 말로 표시하고 원래 상태 값을 그대로 보이지 않는다. 색에 의존하지 않고 이해하게 하기 위해서다. `ok`는 정상·완료, `progress`는 처리 중(도는 고리), `warning`은 확인 필요, `error`는 실패, `neutral`은 대기·중립이다. 알약 `pill`과 바탕 없는 `plain`은 같은 표시를 쓴다.

## Do's and Don'ts

- 채운 주 버튼을 여러 개 두지 않는다. 하나만 남기고 보조 동작은 테두리로 쓴다.
- 위험 버튼을 빨강으로 채우지 않는다. 빨간 테두리와 취소 focus의 확인 대화상자를 쓴다.
- 설명·선택지를 굵게 강조하지 않는다. 이름과 ChoiceGroup의 현재 값 상태 표시에만 굵기를 쓰고 나머지는 보통 굵기로 둔다.
- 이름과 상태를 한 줄에 섞지 않는다. 이름과 상태를 별도로 배치한다.
- 화면 내용을 띄울 때 본문이나 주변 도구를 밀지 않는다. 공통 겹침 표면과 기존 여백을 쓴다.
- 작업 탭의 바탕·여백을 콘텐츠나 플러그인이 정하지 않는다. 화면 틀에 맡긴다.
- 이름표를 기준으로 옆 버튼을 정렬하지 않는다. 입력칸의 선과 행 오른쪽 선에 맞춘다.
- 데이터 표는 기본 밀도를 쓰고, 폭은 내용에 맞추되 화면 폭을 넘지 않는다. 숫자는 오른쪽 정렬한다.
- 브라우저 기본 입력 요소를 별도 포인트 색으로 두지 않는다. 공통 포인트 색 토큰을 쓴다.
- 제목을 콘텐츠 안에서 반복하지 않는다. 한 화면에 한 번만 표시한다.
- 토큰 밖 UI 색 리터럴·지정 Tailwind 팔레트를 쓰지 않는다. 역할 토큰을 쓴다(자동 검사).
- 공용 컨트롤 치수 대신 임의의 숫자 치수를 쓰지 않는다. 치수 토큰과 명시된 예외를 쓴다(자동 검사).
- 사유 없는 native button을 추가하지 않는다. Button 또는 이유가 등록된 기존 예외를 쓴다(자동 검사).

자동 검사는 [visual-tokens.test.ts](apps/editor/test/visual-tokens.test.ts)의 대상 소비 코드·예외 범위에 적용된다.
화면의 모든 의미·정렬·시각적 적합성을 자동 판정한다는 뜻은 아니다.

### 알려진 불일치


## 패턴별 기준 화면

같은 종류의 화면을 만들 때 다음 파일의 공통 구현과 동작을 본보기로 삼는다.
알려진 불일치는 그대로 복제하지 않고 위 규칙을 따른다.

| 만들 화면·패턴 | 본보기 파일 | 확인할 부분 |
| --- | --- | --- |
| 이름·값 줄과 묶음 | [shared-parts-example.tsx](apps/editor/src/dev/shared-parts-example.tsx) | item·fact·좁은 열, 이름 시작선과 값 끝선, 상태 두 variant |
| 설정 화면·설정 행 | [SettingsDialog.tsx](apps/editor/src/shell/SettingsDialog.tsx) | 목록+상세 구조의 탐색 열과 내용 열, Row·Section·Status와 기기 설정 |
| 카드 목록 작업 탭 | [TemplateGallery.tsx](apps/editor/src/shell/TemplateGallery.tsx) | 목록과 미리보기·생성의 분리 |
| 파일·폴더 선택 대화상자 | [FolderDialog.tsx](apps/editor/src/shell/FolderDialog.tsx) | 목록 선택·탐색, 위치와 확정 footer |
| 위험 확인 | [danger-confirmation.tsx](apps/editor/src/components/ui/danger-confirmation.tsx) | 취소 초기 focus와 pending 중 실행 방지 |
| 속성 팝오버 | [metadata-properties.tsx](apps/editor/src/metadata-properties.tsx) | 대상 anchor와 문서 가용 영역 |
| 드롭다운·컨텍스트 메뉴 | [dropdown-menu.tsx](apps/editor/src/components/ui/dropdown-menu.tsx), [context-menu.tsx](apps/editor/src/components/ui/context-menu.tsx) | 공유 메뉴 면과 동작 행 |
| 알림 | [notification-center.tsx](apps/editor/src/components/ui/notification-center.tsx) | 창 단위 등록과 공통 표시 |
| 도킹 패널 | [AssistantPanel.tsx](apps/editor/src/shell/AssistantPanel.tsx) | PanelHeader·Status plain·완료 표시 생략, 도킹·좁은 창 오버레이와 focus 경계 |
| 데이터 표 | [DataTable.tsx](apps/editor/src/components/DataTable.tsx) | 공통 필터·정렬, 제목과 값의 시작·끝선, 현재 행·칸 focus |
| 플러그인 화면 | [PluginScreenCode.tsx](apps/editor/src/views/PluginScreenCode.tsx) | TaskHeader·ScreenLayout과 상태·단계·빈 상태·진행 부품, 고정 client의 화면 수명 |

## 세부 계약

- [UI 결정표와 갤러리](docs/design/ui-decision-table-v1.md)는 표면·공통 구현 선택과 개발 갤러리를 소유한다.
- [UI 패턴](docs/design/ui-patterns-v1.md)은 반복 동작의 확정 목표·기준 구현·사용처와 불일치 추적을 소유한다.
- [Visual Language](docs/design/editor-visual-language-v1.md)는 토큰·팔레트·서체·표면·테마·상태 표현을 소유한다.
- [Layout Rules](docs/design/editor-layout-rules-v1.md)는 정렬·간격·control 치수와 geometry 예외를 소유한다.
- [Editor UX Shell](docs/design/editor-ux-shell-v1.md)은 창·탭·패널·작성 interaction과 focus 동작을 소유한다.
- [플러그인 화면 계약](docs/design/plugin-screens-v1.md)은 화면 코드·공통 부품 API와 Host·문서 연결 경계를 소유한다.
