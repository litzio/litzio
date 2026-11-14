# 문서 안 표 조작 방식 참고 조사

조사일: 2026-11-14. 제품 구현 변경 없음. D=공식 문서 확인, O=직접 관찰, ?=확인하지 못함. 문서가 hover를 설명해도 공간 예약이나 무밀림까지 입증하는 것은 아니다. 표 데이터베이스와 문서 표는 구분했다.

## 한 쪽 요약

| 서비스 / 근거 | 1 위치 · 2 등장 | 3 쉬는 여백 / 일반 문단 대비 | 4 밀림·겹침 | 5 행·열 추가 | 6 가로 스크롤 | 7 읽기 전용 | 8 키보드 | 9 번호·캡션·제목 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Notion simple table D [N] | 첫 행/열 셀 hover의 점 손잡이, 아래/오른쪽 +, 표 hover 메뉴 | ? | ? | 아래/오른쪽 +, 우하단 drag | ? | 공개 페이지 직접 관찰 못함 | ? | 별도 자동 번호·캡션 관계 ? |
| Google Docs D [G] | 왼쪽 열/위 행 hover drag, 셀 우클릭·Format 메뉴 | ? | ? | 우클릭 위/아래/좌/우 | ? | ? | 이번 자료로 구조 조작 단축키 ? | 셀 병합 제목 가능, 별도 캡션 관계 ? |
| Word 웹 D [Ww] | 셀 클릭 때 화면 상단 Ribbon Table Tools | ? | Ribbon은 본문 밖. 실제 본문 밀림 ? | Layout 삽입 명령 | ? | Reading View→Edit 전환 필요 | ? | ? |
| Word 데스크톱 D [Wd] | 셀 클릭 때 상단 Table Layout/Design | ? | Ribbon 경로는 표 주변을 쓰지 않음. 실제 밀림 ? | Ribbon 위/아래/좌/우 | ? | ? | 마지막 셀 Tab으로 행 추가 [Wk] | 자동 캡션 기능과 도구 관계 이번 조사 ? |
| Confluence Cloud D [C] | 위쪽 열 선/왼쪽 행 선 hover 삽입, 아래 table toolbar | ? | ? | 선 옆 삽입 옵션, 마지막 셀 Tab | header sticky는 세로 기능, 열 도구 가로 동작 ? | published 정렬 가능 [C2], 편집 도구 여백 ? | 마지막 셀 Tab | ? |
| Coda D [Co] | hover: 우상단 +, 아래 New row, 행 왼쪽 작은 + | ? | ? | 아래 New row/행 옆 +/열 메뉴 | ? | ? | ? | 문서 내 데이터 테이블. 제목과 도구의 정확 위치 ? |
| Craft D [Cr] | 셀 우클릭, 표 왼쪽 block handle, 열 경계 hover resize | ? | ? | 우클릭 삽입 메뉴 | ? | ? | 전체 표 block 선택 후 Delete, 행열 키보드 parity ? | ? |
| Obsidian Live Preview D [Ob] | 셀 우클릭, 표 옆 추가 UI는 공식 release 설명 | ? (테마별 측정 안 함) | ? | 우클릭 행열 추가·삭제, 옆면 클릭 [Ob2] | ? | ? | Insert Table command palette, 구조 단축키 ? | Markdown 표, 별도 캡션 관계 ? |
| Typora D [Ty] | 셀 커서 때 표 머리글 위 tooltip, 우클릭, 위/왼 테두리 drag | ? (테마 영향) | ? | Ctrl+Enter/Tab 행, 열 우클릭, tooltip 크기 선택 | ? | export/읽기 전용 미측정 | Ctrl+Enter, Tab, 행 삭제 단축키 | ? |
| Dropbox Paper D [P] | 셀 클릭 때 바깥 selectors, 위 +·왼 + | ? | ? | + 클릭/drag로 여러 개 | 표 가로 스크롤 지원. 도구 동기화 ? | ? | ? | ? |
| Tiptap enhanced Table Node O/D [T] | 위/왼 손잡이, 아래/오른쪽 긴 추가 막대. hover/셀 선택 | wrapper 위16/아래24px. 일반 문단 비교 미측정 | 안정 rest/hover/selected에서 위치·높이 동일. 손잡이 표 바깥 | 12px 긴 막대 | 좁은 폭/overflow 미측정 | ? | 공식 insertion grid keyboard 지원. 손잡이 전체 parity 미검증 | 예제에 별도 번호/캡션 없음 |
| BlockNote D [B] | floating table handles를 editor 컨테이너에 portal | ? | flow 밖 배치 방식 확인. 실제 밀림·겹침 ? | 실제 예제 조작 못함 | clip/portal 설정 가능, 가로 동작 ? | ? | ? | ? |
| ProseMirror tables demo O/D [PM] | 상단 예제 메뉴, 셀 선택. 이번 hover에서 별도 버튼 못 봄 | 표 wrapper의 앞뒤 gap 미측정 | rest/hover/selected 모두 y211.69, h175px | 모듈 addRow/addColumn 명령. 예제 메뉴 경로 전체 미검증 | ? | ? | goToNextCell API 존재. 실제 키 바인딩 미검증 | 예제에 번호/캡션 없음 |
| Lexical playground D [L] | 표 플러그인/예제 존재. 직접 표 조작 중 시간 초과 | ? | ? | ? | ? | ? | ? | ? |

관찰한 방식은 크게 세 갈래다. **상단 Ribbon·우클릭 메뉴**(Word, Docs의 메뉴 경로)는 행열 추가 버튼을 표 위아래에 둘 필요를 줄인다. **표 바깥의 작은 도구와 가장자리 추가 UI**(Notion·Paper의 문서 설명, 직접 본 Tiptap)는 문맥 가까운 조작을 제공한다. **포털로 띄우는 도구**(BlockNote 문서)는 문서 flow와 도구의 수명을 분리한다. 이 분류는 배치 패턴이며 모든 서비스가 여백 0 또는 무밀림이라는 결론은 아니다.

리치오는 두 번째 방식에 해당하면서 번호·레이블 행, 열 손잡이, 캡션 뒤 행 추가까지 넉넉히 예약한다. 직접 본 Tiptap도 작은 고정 여백을 사용했다. 따라서 ‘다른 서비스는 모두 여백 예약이 없다’는 가설은 지지되지 않는다. 도구를 flow 밖에 두거나 본문 밖 메뉴로 보내면 등장 자체의 재배치를 피할 수 있지만 글자와의 충돌은 별도 해결해야 한다.

## 리치오에 적용할 후보와 추천 (구현하지 않음)

1. **작은 고정 바깥 gutter + 메뉴 중심 추가**: 행열 손잡이는 표 바깥으로, 행열 추가의 주 경로는 기존 메뉴·키보드로 제공한다. 번호·레이블 행과 캡션은 내용으로 유지하고 속성 버튼은 대상 가까운 모서리에 둔다. 대가: + 버튼의 즉시 발견성이 줄고, 640px·넓은 표에서 스크롤/좌표·키보드 경로를 확인해야 한다.
2. **현재 예약 영역을 유지하되 도구 치수를 줄이는 방향**: Tiptap에서 관찰한 12px 도구와 작은 고정 wrapper 여백을 참고한다. 대가: 리치오의 최소 hit target과 대비·키보드 포커스 기준을 그대로 옮길 수 없으며 번호행까지 있는 리치오는 같은 수치를 쓸 근거가 없다.

추천은 1을 다음 설계 검토의 출발점으로 삼는 것이다. 표 위 번호·레이블 행과 아래 캡션이 있는 리치오에서는 테두리 overlay가 내용을 가릴 위험이 있고, 메뉴를 재사용하는 방식이 이 위험을 줄인다. 기존 ‘도구 표시·숨김이 문서 높이를 바꾸지 않음’은 유지한다. 지금은 공식 자료와 두 예제 관찰에 근거한 후보 추천이며, 새 시안·제품 구현·계약 변경은 하지 않았다. 최종 선택 전에 640px, 캡션, 연속 표, 키보드와 가로 스크롤의 직접 검토가 필요하다.

## 직접 관찰 기록

Playwright에 이미 설치된 bundled Chromium을 headless로 한 번만 시작했다. 설치형 Chrome·저장소 재사용 프로필·소유자 계정/쿠키는 사용하지 않았고 로그인·제출은 하지 않았다. 1440×1000, 기본 DPR. 공개 예제의 실제 렌더링 DOM 좌표이며 실제 앱/계정 화면 수락 결과가 아니다.

- ProseMirror: 표 x24, y211.6875, w768, h175. rest→hover→cell click 모두 동일. `prosemirror-{rest,hover,selected}.png`.
- Tiptap Table Node: 안정된 표 x432, y189.59375, w384.15625, h165. 세 상태 동일. wrapper x416, y173.59375, w576, h205 → 표보다 위16/아래24px. 열 손잡이 y174..186, 표 top189.59보다 3.59px 위에서 끝남. 행 손잡이 x417..429, 표 left432보다 3px 왼쪽에서 끝남. 아래 추가 막대 y358.59..370.59, 표 아래4px 간격, 높이12px. 오른쪽 추가 막대 x820..832, 표 오른쪽 약3.84px 간격, 폭12px. `tiptap-stable-{rest,hover,selected}.png`.
- Tiptap stable-rest는 문단을 클릭하고 포인터를 바깥으로 옮긴 상태. DOM에 추가 막대가 남아 있으며 ‘쉬면 모든 도구가 숨는다’고 판정하지 않았다. 투명도·pointer target의 전수 검증은 하지 않았다.
- Tiptap 최초 로딩 rest y157.59→selected y189.59의 32px 차이는 상단 toolbar가 뒤늦게 나타난 초기 렌더링 상태다. 안정화 후 재측정은 이동 0이었다. 초기 파일 `tiptap-{rest,hover,selected}.png`로 hover 재배치를 주장하지 않는다.
- BlockNote basic 예제는 문서·코드는 로드됐으나 표 예제를 조작하지 못했다. Lexical 초기 playground는 로드됐으나 Insert 메뉴 조작 중 node 도구가 30초 timeout으로 kernel을 reset했다. 브라우저를 다시 시작하지 않았다. 이후 bundled Chromium 프로세스가 없는 것을 확인했다.
- 공개 Notion 페이지 보기 모드, BlockNote/Lexical 표, 좁은 폭·가로 스크롤·직접 키보드 검증은 완료하지 못했다. px 수치를 추정해서 채우지 않았다.
- 캡처는 `tmp/table-tools-reference/`에 미커밋으로 보존한다. 공식 이미지/동영상을 직접 실행한 화면처럼 기록하지 않는다.

## 공식 출처와 문서 확인 범위

각 링크는 편집 UI 기능에 대한 근거다. 여백·밀림·픽셀 수치의 근거는 위의 O 기록에만 있다.

- [N: Notion Format your page / Simple tables](https://www.notion.com/help/columns-headings-and-dividers): 아래/오른쪽 hover +, 우하단 drag, 행열 첫 셀 hover 점 메뉴, 셀 우측 메뉴, 표 hover fit-to-width. 데이터베이스 table view와 구분.
- [G: Google Docs Add and edit tables](https://support.google.com/docs/answer/1696711?hl=en): 우클릭 행열 추가·삭제, 위 행/왼 열 hover drag, 셀 스타일과 표 옵션. 문서가 text wrap용 margin을 설명하는 것은 편집 도구 예약 공간과 다르다.
- [Ww: Word web add columns and rows](https://support.microsoft.com/en-us/word/add-columns-and-rows-to-a-table): Reading View→Edit, 셀 클릭 후 Ribbon Table Tools, Layout 삽입.
- [Wd: Word desktop add cells/rows/columns](https://support.microsoft.com/en-us/word/add-a-cell-row-or-column-to-a-table-in-word): 셀 클릭 후 상단 contextual Table Layout/Design, 삽입 명령.
- [Wk: Word keyboard shortcuts](https://support.microsoft.com/en-us/accessibility/word/keyboard-shortcuts-in-word): 마지막 셀 Tab의 행 추가. 실제 단축키 실행은 안 함.
- [C: Confluence Cloud tables](https://support.atlassian.com/confluence-cloud/docs/simplify-data-with-tables/): 위쪽 열 선/왼 행 선 hover insert, 마지막 셀 Tab. 세로 sticky header를 가로 도구 고정의 근거로 쓰지 않음.
- [C2: Atlassian tables guide](https://www.atlassian.com/software/confluence/resources/guides/best-practices/make-tables): 아래 table toolbar, published 페이지 정렬.
- [Co: Coda Overview Tables](https://help.coda.io/hc/en-us/articles/39555768266893-Overview-Tables): hover 아래 New row/행 왼 +/우상단 열 + 및 열 우클릭. 데이터 중심 테이블이므로 리치오 plain 문서 표와 차이 있음.
- [Cr: Craft Tables](https://support.craft.do/en/write-and-edit/tables): 우클릭 구조 변경, 왼쪽 block handle, Mac/Web 열 경계 resize. Craft.io 작업관리 서비스와 혼동하지 않음.
- [Ob: Obsidian advanced syntax](https://obsidian.md/help/advanced-syntax), [Ob2: 공식 1.5 release](https://obsidian.md/bn/changelog/2023-12-26-desktop-v1.5.3/): Live Preview 우클릭 구조 변경/정렬/이동, 표 옆 클릭 추가. Bases 표와 구분. 예전 release 기능 설명이 현재 geometry를 보장하지 않음.
- [Ty: Typora Table Editing](https://support.typora.io/Table-Editing/): 셀 커서일 때 머리글 위 tooltip, Ctrl+Enter/Tab, 우클릭 열 추가, 위/왼 테두리 drag. 테마별 gap 미검증.
- [P: Dropbox Paper tables](https://help.dropbox.com/view-edit/create-table): 셀 클릭 후 바깥 selectors, 위/왼 + 클릭·drag, 가로 스크롤 지원.
- [T: Tiptap enhanced Table Node](https://tiptap.dev/docs/ui-components/node-components/table-node), [직접 예제](https://template.tiptap.dev/preview/tiptap-node/table-node): enhanced UI와 [기본 Table extension](https://tiptap.dev/docs/editor/extensions/nodes/table)은 별개다. UI를 Core extension의 기본 보장으로 일반화하지 않음.
- [B: BlockNote UI components](https://www.blocknotejs.org/docs/react/components), [Tables](https://www.blocknotejs.org/docs/features/blocks/tables): floating table handles의 portal/clip 수명과 표 기능 설정. 직접 hover 상태 미확인.
- [PM: ProseMirror tables repository](https://github.com/ProseMirror/prosemirror-tables), [공식 연결 demo](https://prosemirror-tables.netlify.app/): 모듈 API와 예제 관찰을 구분.
- [L: Lexical table package](https://lexicaljs.org/docs/packages/lexical-table), [playground](https://playground.lexical.dev/): 패키지/예제 존재 확인. 표 도구 배치·여백·키보드는 확인하지 못함.

관찰 해석 주의: Tiptap 버튼 좌표는 DOM geometry다. screenshot 시점의 opacity/transition과 실제 hit test를 전수 검사하지 않았으므로 좌표가 있는 모든 버튼이 rest에서도 눈에 보인다고 말하지 않는다. stable-selected PNG에서 선택 셀과 희미한 상단 손잡이를 확인했다. stable-hover PNG에는 조작 UI가 뚜렷하지 않아 hover 가시성의 수락 증거로 사용하지 않는다. measurements.json은 kernel reset 전 도구 출력에서 옮겨 적은 좌표이며 원본 자동 저장 결과가 아니다.

정리: bundled Chromium 프로세스는 남아 있지 않다. 단일 세션의 임시 profile/artifacts 폴더는 사용자 허용에 따라 보존했고 위치는 tmp/table-tools-reference/cleanup.txt에 기록했다. 재귀 삭제 명령은 사용하지 않았다.
