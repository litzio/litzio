# 2026-11-19 Activity Bar 최종 형태 세 시안 (#1812)

- Status: Historical
- Date: 2026-11-19 (브랜치 마지막 커밋일, KST)
- 결론: **채택(시안 1 방향, 후속 1-L로 구체화)** — 소유자 결정 2026-11-19.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

리치오의 Activity Bar 최종 형태로 세 시안 중 무엇이 소유자의 업무 흐름에 맞는지, 플러그인이 많아질 때(8~12개) 진입점이 어떻게 보이는지 확인한다(#1812).

## 무엇을 만들었나

같은 앱에서 개발 전용 URL 쿼리로 세 시안을 바꿔 보게 했다. 쿼리가 없으면 지금 화면이다. 기존 공통 부품(Button, Tooltip, DropdownMenu, Popover, PanelHeader, Input, 사이드바 트리 행)과 기존 레이아웃 토큰만 썼고 테스트는 추가하지 않았다.

- **시안 1** (`?activityBar=1`): 48px 막대가 항상 보이고 오른쪽에 사이드바(240px). 위: 탐색기·검색·변경. 가운데: 템플릿 갤러리와 플러그인 대표 화면 아이콘(한 번 클릭으로 열림, 이름은 Tooltip), 높이가 모자라면 '더 보기'(⋯) 메뉴. 아래: 설정·색 모드·Desktop 메뉴 자리·연결 상태 점. 활성 화면 아이콘에 표시선.
- **시안 2** (`?activityBar=2`): 같은 막대에 패널만(탐색기·작업 화면·검색·변경). '작업 화면' 패널에 검색칸과 템플릿 갤러리·플러그인 목록.
- **시안 3** (`?activityBar=3`): 지금 구조 유지. 사이드바 footer의 템플릿·플러그인 줄을 '작업 화면' 버튼 하나로 바꾸고, 누르면 검색칸 있는 목록 팝업. 접힌 rail에도 같은 버튼.
- 검색·변경 패널은 아직 없는 기능의 빈 자리다.

### 실행 방법

- 스파이크 브랜치에서 `pnpm dev` 뒤 주소에 `?activityBar=1`(또는 `2`, `3`)을 붙인다. 플러그인 목록은 연결된 Host의 실제 대표 화면을 쓴다.
- 캡처는 Git이 무시하는 `tmp/` 아래에 합성 시험 폴더(문서 다섯 개, 하위 폴더 둘)를 만들고, 브랜치의 `spikes/1812-activity-bar/activity-bar-capture.browser.js`를 `apps/editor/test/`에 복사해 `pnpm browser:test activity-bar-capture`로 찍었다. 이때 `/api/plugin-screens` 응답을 합성 플러그인 8개 또는 12개로 바꿨다. 자세한 절차는 브랜치의 `spikes/1812-activity-bar/SPIKE.md`에 있다.

## 결과·관찰

모두 합성 문서·시험 폴더로 확인했다.

| 조건 | 왼쪽 폭 | footer 높이 | 파일 트리 보이는 높이 |
| --- | ---: | ---: | ---: |
| 지금, 플러그인 8개, 1440×900 | 240px | 308px | 140px(전부) |
| 지금, 플러그인 8개, 640×420 overlay | 200px | 308px | **0px** |
| 시안 1·2, 1440×900 | 48+240=288px | 없음 | 140px |
| 시안 1·2, 640×700 overlay | 막대 48px, overlay 200px(x=48부터) | 없음 | 140px |
| 시안 3, 플러그인 12개, 1440×900 | 240px | 84px(플러그인 0개와 같음) | 140px |
| 시안 3, 플러그인 12개, 640×420 overlay | 200px | 84px | 140px(전부) |

- 정렬: 모든 시안에서 PanelHeader·접힌 rail 머리·탭 줄이 y=40~73이고, 시안 1·2 막대의 첫 아이콘은 같은 띠 가운데(y=43~71)에 놓였다.
- 시안 1의 넘침: 1440×900에서는 13개(템플릿+12)가 다 들어가고, 1440×700에서는 11개가 보이고 2개가 '더 보기'로 갔다.
- 시안 1: 플러그인 화면이 한 번에 열리고 사이드바를 접어도 진입점과 활성 표시가 남는다. 다만 아이콘만으로는 12개를 구분하기 어렵고, 창 높이에 따라 '더 보기'로 가는 항목이 달라지며, 넓은 창에서 문서 영역이 48px 좁아진다.
- 시안 2: 막대가 짧고 안정적이며 목록에서 이름과 검색이 된다. 화면을 열려면 두 번 눌러야 하고 그동안 파일 트리가 가려진다.
- 시안 3: 변경이 가장 작고 footer가 84px로 고정되어 640×420에서도 파일 트리가 남는다. 어떤 플러그인이 있는지와 활성 화면은 팝업을 열어야 보인다.
- 구현하며 드러난 제약
  - 시안 1·2는 넓은 창에서 왼쪽이 288px가 되어 타이틀바 브랜드 칸과 문서 여백 계산이 막대 폭을 따라가야 했다.
  - 막대와 사이드바를 한 감싸기에 두면 overlay가 탭 줄 밑에 깔려, overlay가 열렸을 때 z-index를 올려야 했다.
  - 막대 버튼마다 Tab 정지점이라 플러그인 12개면 Tab이 17번 이상 걸린다. 실제 구현에는 막대 안 화살표 이동(roving focus)과 overlay를 닫은 뒤의 포커스 복귀 지점이 필요하다. 스파이크는 이를 구현하지 않았다.
  - 지금 Desktop 메뉴 아이콘(⋯)이 '더 보기'와 겹쳐 시안에서는 모니터 아이콘으로 바꿨다.
  - Editor가 아는 플러그인 아이콘 이름은 다섯 개뿐이고 나머지는 FileText로 떨어진다. 시안에서는 12개를 임시로 더했다.

### 검증하지 않은 것과 한계

- 실제 플러그인 설치와 실제 아이콘 파일, 플러그인 화면 기능. 화면 목록 응답만 합성했다.
- 실제 Desktop(Electron) 창, 업데이트 점이 켜진 상태, 비서 패널과의 조합.
- 스크린 리더 낭독, 키보드만으로의 전체 흐름, 명령 센터와의 역할 중복.
- 기존 브라우저 시나리오를 시안 쿼리를 켠 상태로 돌리지 않았다. 쿼리 없는 기본 화면도 전체 suite로 확인하지 않았다.
- 사이드바 폭 조절 손잡이가 막대 폭만큼 어긋나는지.
- 큰 폴더, 여러 열린 폴더, 13개보다 많은 작업 화면, 높이 420px 미만.

## 현재 결정과 어긋나는 점

- [#671](https://github.com/litzio/litzio/issues/671) 소유자 결정(2026-10-28)은 상시 Activity Bar를 왼쪽 패널이 둘 이상 생길 때 도입하기로 했다. 시안 1·2는 검색·변경을 빈 자리로 두고 막대를 상시로 보여 준다. 시안 3만 이 결정 안에 있다. 이번 소유자 결정(시안 1 방향)으로 도입 조건이 바뀌었다.
- [Editor UX shell 계약](../design/editor-ux-shell-v1.md)의 접힌 rail과 footer(설정·색 모드·실행 계정) 배치: 시안 1·2는 footer와 탐색기 접기 버튼을 없애고 실행 계정 줄을 연결 상태 점으로 줄였다.
- [UI 결정표](../design/ui-decision-table-v1.md): 상시 막대와 작업 화면 목록 팝업은 새 표면 구조라 소유자 결정 대상이며, 이 스파이크가 그 결정 자료다.

## 결론/후속

- 결론: **채택(시안 1 방향, 후속 1-L로 구체화)**.
- 작업자 추천은 시안 3을 1단계로 하고 두 번째 실제 패널이 생길 때 시안 2로 넓히는 순서였다. 소유자는 시안 1을 골랐고, "어떤 플러그인인지 직관적으로 알기 어렵다"는 의견에 따라 이름 표시(1-L)와 고유 아이콘(1-T) 후속 스파이크를 만들었다. 최종 형태는 [후속 기록](2026-11-19-activity-bar-labels.md)의 1-L이다.
- 소유자 결정(2026-11-19): 항상 보이는 72px Activity Bar, 아이콘 아래 이름(1-L). 보완: 이름 두 줄까지, 막대 안 아이콘 단색, '더 보기'는 아이콘·이름·검색 목록. 첫 글자 표시는 SDK 아이콘 기본값 때문에 1단계에서 제외한다.
- 1단계 구현은 [#1817](https://github.com/litzio/litzio/issues/1817)에서 master 기준으로 다시 구현한다. 스파이크 코드는 병합하지 않는다.
- 관련 이슈: [#671](https://github.com/litzio/litzio/issues/671), [#1812](https://github.com/litzio/litzio/issues/1812), [#1817](https://github.com/litzio/litzio/issues/1817)

## 코드 위치

- 태그: [`spike/2026-11-19-activity-bar`](https://github.com/litzio/litzio/tree/spike/2026-11-19-activity-bar)
- 브랜치: [`spike/1812-activity-bar`](https://github.com/litzio/litzio/tree/spike/1812-activity-bar) (master 대비 커밋 1개)
- 마지막 커밋: [`0c6e895e`](https://github.com/litzio/litzio/commit/0c6e895ec83d22a0b9d7538b9b964c50c19f7f62)
- 원본 기록: [`spikes/1812-activity-bar/SPIKE.md`](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar/spikes/1812-activity-bar/SPIKE.md)

## 스크린샷

master에는 이 스파이크의 이미지가 없다. 캡처는 태그에만 있다(모두 합성 문서, 1440×900 라이트 기본).

- [지금 화면, 플러그인 8개](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar/spikes/1812-activity-bar/captures/0-current-8-plugins.png), [지금 화면, 640×420](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar/spikes/1812-activity-bar/captures/0-current-640x420-overlay.png)
- 시안 1: [탐색기](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar/spikes/1812-activity-bar/captures/1-1-explorer-document.png), [사이드바 접음](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar/spikes/1812-activity-bar/captures/1-2-collapsed-plugin-tab.png), [12개 '더 보기'](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar/spikes/1812-activity-bar/captures/1-3-more-menu-12.png), [640×700](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar/spikes/1812-activity-bar/captures/1-4-640x700-overlay.png), [다크](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar/spikes/1812-activity-bar/captures/1-5-explorer-document-dark.png)
- 시안 2: [탐색기](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar/spikes/1812-activity-bar/captures/2-1-explorer.png), [작업 화면 12개](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar/spikes/1812-activity-bar/captures/2-2-work-screens-12.png), [640×700](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar/spikes/1812-activity-bar/captures/2-3-640x700-overlay.png)
- 시안 3: [펼친 사이드바 팝업](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar/spikes/1812-activity-bar/captures/3-1-expanded-popup-12.png), [접힌 rail 팝업](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar/spikes/1812-activity-bar/captures/3-2-rail-popup-12.png), [640×420](https://github.com/litzio/litzio/blob/spike/2026-11-19-activity-bar/spikes/1812-activity-bar/captures/3-3-640x420-overlay.png)
