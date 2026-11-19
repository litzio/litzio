# 2026-11-19 Activity Bar 시안 1 후속: 이름 표시와 고유 아이콘 (#1812)

- Status: Historical
- Date: 2026-11-19 (브랜치 마지막 커밋일, KST)
- 결론: **채택(1-L)** — 소유자 결정 2026-11-19.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

[앞 스파이크](2026-11-19-activity-bar.md)의 시안 1(항상 보이는 막대에 패널과 플러그인 아이콘)은 아이콘만으로 어떤 플러그인인지 알기 어려웠다. 아이콘 아래 이름(1-L)이나 플러그인 고유 아이콘·첫 글자 타일(1-T)로 이 문제가 풀리는지, 막대 폭이 늘어난 화면이 받아들일 만한지 확인한다(#1812).

## 무엇을 만들었나

앞 스파이크 브랜치 위에서 갈라져 개발 전용 쿼리 두 개를 더했다. 앞 시안 1·2·3은 그대로 남아 있다. 테스트는 추가하지 않았다.

- **1-L** (`?activityBar=1L`): 막대 폭 72px(`--space-16`+`--space-2`). 위 그룹(탐색기·검색·변경)과 가운데 그룹(템플릿 갤러리·플러그인)은 아이콘(20px) 아래에 한 줄 이름(12px). 길면 말줄임, 전체 이름은 Tooltip. 아래 그룹(설정·색 모드·Desktop·연결 상태)은 아이콘만. 열린 패널과 활성 화면은 아이콘+이름을 감싸는 선택 배경으로 표시.
- **1-T** (`?activityBar=1T`): 막대 폭 48px 그대로. 플러그인이 자기 SVG를 주면 그것을, 없으면 이름 첫 글자를 강조색 둥근 타일(20px)에 넣는다.
- **공통**: 1-L에도 같은 고유 아이콘·첫 글자 규칙을 적용했다. '더 보기'(⋯)는 짧은 메뉴 대신 검색칸+아이콘·이름 목록을 막대 바로 오른쪽에 연다. 목록에는 작업 화면 전체를 넣었다.

### 실행 방법

- 스파이크 브랜치에서 `pnpm dev` 뒤 주소에 `?activityBar=1L` 또는 `?activityBar=1T`를 붙인다.
- 캡처는 앞 스파이크와 같은 합성 시험 폴더로, 브랜치의 `spikes/1812-activity-bar-labels/activity-bar-labels-capture.browser.js`를 `apps/editor/test/`에 복사해 `pnpm browser:test activity-bar-labels-capture`로 찍었다. `/api/plugin-screens`를 합성 플러그인 8·12개로, `/api/plugins/icon`을 합성 SVG 여섯 개로 바꿨고 나머지 여섯은 아이콘 이름을 비워 첫 글자 타일이 되게 했다. 자세한 절차는 브랜치의 `spikes/1812-activity-bar-labels/SPIKE.md`에 있다.

## 결과·관찰

모두 합성 문서·시험 폴더, 한국어 UI로 확인했다. 오른쪽 개요 패널(256px)이 열린 기본 배치에서 잰 값이다('문서 영역'은 탭 줄 폭, '문서 열'은 활성 문서 본문 상자 폭).

| 조건 | 막대 | 사이드바 | 문서 영역 | 문서 열 |
| --- | ---: | ---: | ---: | ---: |
| 지금, 1440 | 없음 | 240 | 944 | 896 |
| 시안 1, 1440 | 48 | 240 | 896 | 864 |
| 1-T, 1440 | 48 | 240 | 896 | 864 |
| 1-L, 1440 | 72 | 240 | 872 | 840 |
| 지금, 640 (사이드바 닫힘) | rail 48 | — | 592 | 560 |
| 시안 1, 640 | 48 | — | 592 | 560 |
| 1-L, 640 | 72 | overlay 200 (x=72부터) | 568 | 536 |

- 정렬: PanelHeader·탭 줄은 모든 변형에서 y=40~73. 1-L은 아이콘만 이 띠 가운데에 맞추고 이름과 선택 배경은 띠 아래로 내려간다.
- 항목 간격: 1-L 항목 상자 48px, 52px 주기. 1-T는 28px 버튼, 32px 주기(앞 시안과 같음).
- 말줄임(60px 이름 칸, 한 줄 고정): '템플릿 갤러리'→'템플릿 갤...', '프로젝트 보고'→'프로젝트 ...'. 띄어쓰기 포함 5글자 이하 이름은 잘리지 않았다.
- 넘침: 1-L은 1440×900·8개면 9개(템플릿+8) 모두 보이고, 1440×700·12개면 5개만 보이고 8개가 '더 보기'로 갔다. 640×700·8개는 5개 보이고 4개 넘침. 1-T는 1440×900에서 13개 전부, 1440×700에서 11개 보이고 2개 넘침.
- 1-L: 막대만 보고 어떤 플러그인인지 알 수 있고, 첫 글자가 같은 플러그인도 이름으로 구분된다. 대가는 넓은 창에서 문서 영역이 지금보다 72px 줄고, 같은 창 높이에 들어가는 플러그인 수가 절반 가까이로 줄며, 6글자 이상 이름이 잘린다는 점이다. 640×700에서 겹침·잘림은 없었다.
- 1-T: 아이콘끼리는 확실히 달라 보이지만 '무엇인지'는 여전히 Tooltip이나 목록에서 봐야 안다. 강조색 타일과 플러그인 자체 색 SVG가 섞이면 막대가 알록달록해지고, 플러그인 SVG는 다크에서 대비가 약할 수 있었다(합성 예 하나에서 흐림). 아이콘이 없는 두 플러그인의 첫 글자가 같으면 타일이 같아진다.
- '더 보기' 목록: 12개를 이름으로 한 번에 훑을 수 있다. 막대 바로 오른쪽에 열려 탐색기 위를 덮고, 막대에 이미 보이는 항목도 목록에 반복된다.

### 검증하지 않은 것과 한계

- 실제 플러그인 설치와 manifest의 실제 SVG/PNG 아이콘. 아이콘 응답만 합성했다. PNG, 큰 그림, 투명 배경 없는 그림의 축소 모양은 보지 않았다.
- 한국어 외 언어 이름, 사용자 글꼴 크기 변경, 실제 Desktop(Electron) 창, Windows 배율 125·150%.
- 스크린 리더 낭독(이름은 `aria-hidden`, 버튼 `aria-label` 유지)과 막대 안 키보드 이동(roving focus). 둘 다 구현·확인하지 않았다.
- 기존 브라우저 시나리오를 시안 쿼리를 켠 상태로 돌리지 않았다. 쿼리 없는 기본 화면도 전체 suite로 확인하지 않았다.
- 첫 글자 타일은 막대와 '더 보기' 목록에만 적용했고 탭 줄·설정 화면에는 적용하지 않았다.

## 현재 결정과 어긋나는 점

- 앞 스파이크와 같다: [#671](https://github.com/litzio/litzio/issues/671)의 상시 Activity Bar 도입 조건, [Editor UX shell 계약](../design/editor-ux-shell-v1.md)의 rail·footer 배치, [UI 결정표](../design/ui-decision-table-v1.md)의 새 표면 구조.
- [플러그인 실행 계약](../design/plugin-stage1-v1.md)은 아이콘이 없을 때의 표시를 정하지 않았고 Editor는 지금 FileText로 떨어진다. 첫 글자 타일은 새 표시 규칙이다(1단계에서 제외됨).
- 72px 막대 폭은 기존 레이아웃 토큰(`--layout-sidebar-rail-width` 48px)에 없는 값이다. 채택에 따라 새 레이아웃 토큰이 필요하다.

## 결론/후속

- 결론: **채택(1-L)**.
- 작업자 추천은 1-T(48px+고유 아이콘·첫 글자 타일)였다. 통합 담당자는 1-L이 '알아보기' 문제를 실제로 푼다고 보고, 1-L의 약점(긴 이름 잘림, 컬러 아이콘이 섞인 막대)을 구현에서 고치는 보완을 추천했다.
- 소유자 결정(2026-11-19): 항상 보이는 72px Activity Bar에 패널과 플러그인 아이콘을 두고 아이콘 아래에 이름을 표시한다(1-L). 보완:
  1. 이름은 두 줄까지, 그래도 넘치면 말줄임과 Tooltip.
  2. 막대 안 아이콘은 단색으로 표시한다. 플러그인의 컬러 아이콘은 탭·설정 목록에서 그대로 쓴다.
  3. 넘치는 항목은 '더 보기' — 아이콘·이름·검색칸이 있는 목록.
- 첫 글자 표시는 1단계에서 제외한다. SDK가 아는 아이콘 이름이 다섯 개뿐이고 아이콘을 지정하지 않으면 기본 아이콘이 채워져 '아이콘 없는 플러그인'을 구분할 수 없기 때문이다. 플러그인 구분은 아이콘 아래 이름이 맡는다.
- 1단계에 넣지 않는 것: 검색·변경 패널, 배지, 사용자 고정·숨기기·순서 바꾸기, 플러그인 옆 패널 기여, 막대 위치 설정.
- 1단계 구현은 [#1817](https://github.com/litzio/litzio/issues/1817)에서 master 기준으로 다시 구현한다. 스파이크 코드는 병합하지 않는다.
- 관련 이슈: [#671](https://github.com/litzio/litzio/issues/671), [#1812](https://github.com/litzio/litzio/issues/1812), [#1817](https://github.com/litzio/litzio/issues/1817)

## 코드 위치

- 태그: [`spike/2026-11-19-activity-bar-labels`](https://github.com/litzio/litzio/tree/spike/2026-11-19-activity-bar-labels)
- 브랜치: [`spike/1812-activity-bar-labels`](https://github.com/litzio/litzio/tree/spike/1812-activity-bar-labels) (master 대비 커밋 2개, 첫 커밋은 앞 스파이크)
- 마지막 커밋: [`598dd559`](https://github.com/litzio/litzio/commit/598dd55917a4154aed7cba033c2d59fb7f900c0c)
- 원본 기록: [`spikes/1812-activity-bar-labels/SPIKE.md`](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar-labels/spikes/1812-activity-bar-labels/SPIKE.md)

## 스크린샷

master에는 이 스파이크의 이미지가 없다. 캡처는 태그에만 있다(모두 합성 문서).

- 1-L: [1440, 플러그인 8개](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar-labels/spikes/1812-activity-bar-labels/captures/1L-a-explorer-8.png), [사이드바 접음, 플러그인 화면 활성](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar-labels/spikes/1812-activity-bar-labels/captures/1L-b-collapsed-plugin-active.png), [1440×700, 12개 '더 보기' 목록](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar-labels/spikes/1812-activity-bar-labels/captures/1L-c-more-list-12.png), [640×700](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar-labels/spikes/1812-activity-bar-labels/captures/1L-d-640x700-overlay.png), [다크](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar-labels/spikes/1812-activity-bar-labels/captures/1L-e-explorer-8-dark.png)
- 1-T: [1440, 플러그인 12개](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar-labels/spikes/1812-activity-bar-labels/captures/1T-a-explorer-12.png), [1440×700, '더 보기' 목록](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar-labels/spikes/1812-activity-bar-labels/captures/1T-b-more-list-12.png)
