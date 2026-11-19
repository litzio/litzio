# Activity Bar 최종 형태 세 시안 (#1812)

2026-11-19 (KST) · 브랜치 `spike/1812-activity-bar` · 태그 `spike/2026-11-19-activity-bar` · 기준 master `8239f603`

이 브랜치의 코드는 병합하지 않는다. 채택되면 master에서 새 이슈로 다시 구현한다.

## 확인하려는 질문

리치오의 Activity Bar 최종 형태로 세 시안 중 무엇이 소유자의 업무 흐름에 맞는가. 플러그인이 많아질 때(8~12개) 진입점이 어떻게 보이는가.

## 만든 것

개발 전용 URL 쿼리 `?activityBar=1|2|3`으로 같은 앱에서 세 시안을 바꿔 본다. 쿼리가 없으면 지금 화면이다. 테스트는 추가하지 않았다. 기존 Button(ghost·icon-sm), Tooltip, DropdownMenu, Popover, PanelHeader, Input, `.sidebar-tree-item` 행, `.settings-update-dot`, HostStatus와 기존 토큰(`--layout-sidebar-rail-width` 48px, `--layout-document-tab-height`, `--size-control-compact`)을 썼다.

| 파일 | 내용 |
| --- | --- |
| `apps/editor/src/shell/ActivityBarSpike.tsx` | 시안 스위치, 상시 막대(시안 1·2), 작업 화면 목록(검색칸+아이콘·이름 행), 작업 화면 패널(시안 2), 목록 팝업 버튼(시안 3), 검색·변경 자리 패널 |
| `apps/editor/src/App.tsx` | 막대와 사이드바를 감싸는 `activity-shell`, 열린 패널 상태, 템플릿 갤러리+플러그인 대표 화면 목록, 활성 탭 표시와 배지 예시(두 번째 플러그인) |
| `apps/editor/src/shell/Sidebar.tsx` | 시안 1·2에서 footer와 탐색기 머리의 접기 버튼을 없애고 다른 패널을 끼움. 시안 3에서 footer의 템플릿·플러그인 줄을 '작업 화면' 버튼 한 줄로 바꿈 |
| `apps/editor/src/styles.css` 끝의 SPIKE 블록 | 막대 폭·정렬, 선택·활성 표시, overlay 위치 |
| `apps/editor/src/views/view-screen-icon.ts` | 합성 플러그인 12개용 lucide 아이콘 이름 추가 |
| `spikes/1812-activity-bar/activity-bar-capture.browser.js` | 캡처 시나리오(테스트 아님) |

- **시안 1**: 48px 막대가 항상 보이고 오른쪽에 사이드바(240px)가 붙는다. 위: 탐색기·검색·변경. 구분선 아래: 템플릿 갤러리와 플러그인 대표 화면 아이콘, 높이가 모자라면 '더 보기'(⋯) 메뉴로 모음. 아래: 설정(업데이트 점 자리)·색 모드·Desktop 메뉴 자리·연결 상태 점. 열린 패널 아이콘을 다시 누르면 사이드바가 접힌다. 활성 탭인 화면 아이콘 아래에 짧은 선.
- **시안 2**: 같은 막대에 패널만(탐색기·작업 화면·검색·변경). '작업 화면' 패널에 PanelHeader·검색칸·템플릿 갤러리와 플러그인 목록.
- **시안 3**: 지금 구조 유지. footer의 템플릿·플러그인 줄을 '작업 화면' 버튼 하나로 바꾸고, 누르면 버튼 옆에 검색칸 있는 목록 팝업. 접힌 rail에도 같은 버튼(아이콘).
- 검색·변경 패널은 아직 없는 기능의 빈 자리다(PanelHeader와 한 줄 자리 표시만).

## 실행 방법

```sh
# 합성 시험 폴더(Git이 무시하는 tmp/)
d="tmp/activity-bar/시험 폴더"; mkdir -p "$d/참고" "$d/회의"
# 검사 계획.md · 요구사항 개요.md · 주간 보고.md · 참고/용어 정리.md · 회의/3차 회의.md 를 `litzio: 1` 머리말의 합성 문서로 만든다
cp spikes/1812-activity-bar/activity-bar-capture.browser.js apps/editor/test/
pnpm browser:test activity-bar-capture   # 캡처가 spikes/1812-activity-bar/captures/에 저장된다
rm apps/editor/test/activity-bar-capture.browser.js
```

직접 볼 때는 `pnpm dev` 뒤 주소에 `?activityBar=1`(또는 2, 3)을 붙인다. 플러그인 목록은 연결된 Host의 실제 대표 화면을 쓴다. 캡처는 `/api/plugin-screens` 응답을 합성 플러그인 8개 또는 12개로 바꿨다(기존 `plugin-screen-code` fixture 방식).

## 캡처

모두 합성 문서·시험 폴더, 라이트, 1440×900 기본. 실행 계정 줄은 '시험 계정'으로 바꾸고 문서 위치 요소는 가렸다.

| 캡처 | 조건 |
| --- | --- |
| [0-current-8-plugins](captures/0-current-8-plugins.png) | 지금 화면, 플러그인 8개, 사이드바 펼침 |
| [0-current-640x420-overlay](captures/0-current-640x420-overlay.png) | 지금 화면, 640×420 overlay (비교용 추가) |
| [1-1-explorer-document](captures/1-1-explorer-document.png) | 시안 1, 플러그인 8개, 탐색기, 문서 탭 활성, 배지 예시 |
| [1-2-collapsed-plugin-tab](captures/1-2-collapsed-plugin-tab.png) | 시안 1, 사이드바 접힘, 플러그인 화면 탭 활성 |
| [1-3-more-menu-12](captures/1-3-more-menu-12.png) | 시안 1, 플러그인 12개, 1440×700, '더 보기' 메뉴 |
| [1-4-640x700-overlay](captures/1-4-640x700-overlay.png) | 시안 1, 640×700 탐색기 overlay |
| [1-5-explorer-document-dark](captures/1-5-explorer-document-dark.png) | 1-1의 다크 |
| [2-1-explorer](captures/2-1-explorer.png) | 시안 2, 탐색기 패널 |
| [2-2-work-screens-12](captures/2-2-work-screens-12.png) | 시안 2, 작업 화면 패널, 플러그인 12개 |
| [2-3-640x700-overlay](captures/2-3-640x700-overlay.png) | 시안 2, 640×700 작업 화면 overlay |
| [3-1-expanded-popup-12](captures/3-1-expanded-popup-12.png) | 시안 3, 펼친 사이드바의 목록 팝업, 플러그인 12개 |
| [3-2-rail-popup-12](captures/3-2-rail-popup-12.png) | 시안 3, 접힌 rail의 목록 팝업 |
| [3-3-640x420-overlay](captures/3-3-640x420-overlay.png) | 시안 3, 640×420 overlay, 파일 트리 유지 확인 |

## 측정

| 조건 | 왼쪽 폭 | footer 높이 | 파일 트리 보이는 높이 |
| --- | ---: | ---: | ---: |
| 지금, 8개, 1440×900 | 240px | 308px | 140px(전부) |
| 지금, 8개, 640×420 overlay | 200px | 308px | **0px** |
| 시안 1·2, 1440×900 | 48+240=288px | 없음 | 140px |
| 시안 1·2, 640×700 overlay | 48px 예약, overlay 200px(x=48부터) | 없음 | 140px |
| 시안 3, 12개, 1440×900 | 240px | 84px(플러그인 0개일 때와 같음) | 140px |
| 시안 3, 12개, 640×420 overlay | 200px | 84px | 140px(전부) |

- 정렬: 모든 시안에서 PanelHeader·접힌 rail 머리·탭 줄이 y=40~73. 시안 1·2 막대의 첫 아이콘은 y=43~71로 같은 띠 가운데에 놓인다.
- 시안 1의 넘침: 1440×900에서는 13개(템플릿+12)가 다 들어간다. 1440×700에서는 11개가 보이고 2개가 '더 보기'로 간다.
- 합성 폴더는 파일 다섯 개·하위 폴더 둘이다. 큰 폴더나 여러 열린 폴더는 측정하지 않았다.

## 시안별 관찰

**시안 1 (막대에 패널+플러그인)**
- 좋은 점: 플러그인 화면이 한 번 클릭으로 열리고, 사이드바를 접어도 진입점이 남는다(1-2). 활성 탭 표시로 지금 어느 화면인지 막대에서 보인다. footer가 없어져 파일 트리 높이가 플러그인 수와 무관해진다.
- 아쉬운 점: 아이콘만으로는 12개를 구분하기 어렵고 이름은 Tooltip에서만 보인다. 막대가 위·가운데·아래 세 무리로 길어져, 플러그인이 늘면 창 높이에 따라 어떤 것이 '더 보기'로 들어가는지 바뀐다(1-3). 넓은 창에서 문서 열이 48px 좁아진다.
- 배지는 넘친 항목에 있으면 '더 보기'에 점을 합쳐 보이게 했지만, 배지가 무엇을 뜻하는지(진행·완료·알림)는 정하지 않았다.

**시안 2 (막대에 패널만, 작업 화면 패널)**
- 좋은 점: 막대가 패널 넷과 아래 무리로 짧고 안정적이다. 작업 화면 목록이 이름과 함께 보이고 검색할 수 있어 12개도 한눈에 읽힌다(2-2).
- 아쉬운 점: 화면을 열려면 패널 전환+행 선택 두 번이 필요하고, 작업 화면 패널을 여는 동안 파일 트리가 가려진다. 문서 작업 중 화면을 자주 바꾸면 탐색기와 왕복이 생긴다.
- 사이드바를 접으면 막대만 남아 진입점이 '작업 화면' 아이콘 하나로 줄어든다(시안 1보다 한 단계 더).

**시안 3 (지금 구조, 작업 화면 버튼과 팝업)**
- 좋은 점: 변경이 가장 작다. footer가 플러그인 수와 무관하게 84px로 고정되어 640×420에서도 파일 트리가 남는다(지금은 0px). 접힌 rail에도 같은 버튼이 있어 진입점이 사라지지 않는다.
- 아쉬운 점: 어떤 플러그인이 있는지는 팝업을 열어야 보이고, 활성 화면 표시는 팝업 안에서만 보인다. 검색·변경 같은 두 번째 패널이 생기면 결국 상시 막대를 다시 결정해야 한다.
- 팝업은 화면 아래쪽 버튼에서 위로 길게 열린다. 항목이 더 많아지면 팝업 안 스크롤이 생긴다(이번에는 13개까지만 확인).

## 구현하며 드러난 제약

- **폭**: 시안 1·2는 넓은 창에서 왼쪽이 288px이 된다(지금 240px). `--shell-sidebar`를 `rail+사이드바`로 바꿔 타이틀바 브랜드 칸과 문서 스크롤 여백이 따라가게 했다. 사이드바 폭 조절 손잡이가 막대 48px만큼 어긋나는지는 확인하지 않았다(`PanelResize`는 수정하지 않음).
- **정렬**: 막대 첫 아이콘을 탭 줄 띠에 맞추려면 막대 위쪽 여백을 `(탭 높이+선−컨트롤 높이)/2`로 계산해야 했다. 막대에는 머리 선을 두지 않았다.
- **overlay**: 막대와 사이드바를 한 감싸기(`activity-shell`, z-index 1) 안에 두면 overlay 사이드바가 탭 줄(z-index 2) 밑에 깔린다. overlay가 열렸을 때 감싸기의 z-index를 올려 해결했다. 바깥 클릭으로 overlay를 닫는 처리가 막대 클릭을 바깥으로 보지 않도록 `.activity-bar`를 예외에 넣어야 했다. 시안 1·2의 overlay는 x=48부터 열리고 막대는 계속 보인다(지금은 x=0부터 rail을 덮는다).
- **키보드**: 시안 1의 막대는 버튼마다 Tab 정지점이라 12개 플러그인이면 Tab이 17번 이상 걸린다. 실제 구현에는 막대 안 화살표 이동(roving focus)이 필요하다. Escape로 overlay를 닫는 처리는 포커스가 사이드바 안에 있을 때만 동작하고 막대 위에서는 동작하지 않는다. 지금의 접기 버튼이 없어져, overlay를 닫은 뒤 포커스를 돌려줄 곳(지금은 접기 버튼)을 막대 아이콘으로 다시 정해야 한다. 이번 스파이크는 이 포커스 복귀를 구현하지 않았다.
- **Desktop 메뉴**: 지금 Desktop 메뉴 아이콘도 ⋯라서 시안 1의 '더 보기'와 겹친다. 시안에서는 Desktop 메뉴 자리를 모니터 아이콘으로 바꿔 두었다(브라우저에서는 자리 버튼만, 실제 Desktop bridge는 확인하지 않음).
- **아이콘 목록**: 플러그인 manifest의 `icon` 이름은 지금 Editor가 아는 다섯 개(LayoutDashboard·Table·ChartColumn·FileText·Folder)만 보이고 나머지는 FileText로 떨어진다. 막대처럼 아이콘만으로 구분하는 시안에서는 아이콘 집합이 넓어야 한다(이번에는 12개를 임시 추가).
- **넘침 계산**: 시안 1의 '더 보기'는 가운데 무리의 높이를 ResizeObserver로 재서 들어가는 개수를 정한다. 측정 기준은 `--size-control-compact`+간격이다.

## 검증하지 않은 것

- 실제 플러그인 설치·실제 아이콘 artifact(SVG/PNG)·플러그인 화면 기능. 화면 목록 응답만 합성했다.
- 실제 Desktop(Electron) 창, 업데이트 점이 켜진 상태, 비서 패널이 열린 상태와의 조합.
- 스크린 리더 낭독, 키보드만으로의 전체 흐름, 명령 센터와의 역할 중복.
- 기존 브라우저 시나리오(editor-shell, layout-rules, folder-navigation, color-mode 등)는 시안 쿼리를 켠 상태로 돌리지 않았다. 쿼리 없는 기본 화면은 코드상 바뀌지 않도록 했지만 전체 suite로 확인하지 않았다.
- 큰 폴더, 여러 열린 폴더, 13개보다 많은 작업 화면, 높이 420px 미만.

## 현재 결정과 어긋나는 점

- #671 소유자 결정(2026-10-28): 상시 Activity Bar는 왼쪽 패널이 둘 이상 생길 때 도입한다. 시안 1·2는 검색·변경을 빈 자리로 두고 막대를 상시로 보여 준다. 시안 3만 이 결정 안에 있다.
- [Editor UX shell 계약](../../docs/design/editor-ux-shell-v1.md)의 접힌 rail(Files/Settings)과 footer(설정·색 모드·실행 계정) 배치: 시안 1·2는 footer와 탐색기 접기 버튼을 없애고 실행 계정 줄을 연결 상태 점으로 줄였다.
- [UI 결정표](../../docs/design/ui-decision-table-v1.md): 상시 막대(시안 1·2)와 작업 화면 목록 팝업(시안 3)은 새 표면 구조라 소유자 결정 대상이다. 이 스파이크가 그 결정 자료다.

## 추천

결론: **미정** (소유자 결정 전)

작업자 추천은 **시안 3을 1단계로, 두 번째 실제 패널이 생길 때 시안 2로 확장**하는 순서다. 지금 확인된 문제(footer가 파일 트리를 누름, 접으면 진입점이 사라짐)는 시안 3만으로 해결되고(640×420에서 트리 0px → 140px), 시안 3의 '작업 화면' 목록은 시안 2의 패널 내용과 같은 부품이라 나중에 옮길 수 있다. 시안 1의 한 번 클릭 장점은 같은 화면을 하루에 여러 번 오가는 실제 사용이 확인될 때 '고정한 몇 개만 막대에'라는 형태로 다시 볼 가치가 있다.
