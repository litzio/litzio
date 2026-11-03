# 템플릿 갤러리 화면 스파이크 #936

- Status: Historical
- Date: 2026-11-04
- Scope: `spike/936-template-gallery` 전용 비교 시안. 병합·PR 대상이 아니며 제품 계약이 아니다.
- Authority: [#936 소유자 결정](https://github.com/litzio/litzio/issues/936), [UI 결정표](../design/ui-decision-table-v1.md), [UI 패턴](../design/ui-patterns-v1.md), [Layout Rules](../design/editor-layout-rules-v1.md), [Visual Language](../design/editor-visual-language-v1.md), [ADR-0010](../adr/0010-supported-viewport-and-input.md).

2026-11-04 추가 소유자 피드백에 따라 **C 카드 + hover/focus 미리보기**를 추가했다. 현재 기본 진입은 C이며 A/B는 최초 비교 기록으로 보존한다. 아래 A/B 추천은 당시 판단이다. 최신 검토는 문서 끝의 C 절을 따른다.

## 범위와 재현

`pnpm editor` 뒤 `/template-gallery?variant=a&theme=light` 또는 `/template-gallery?variant=b&theme=dark`를 연다. 상단 개발 도구에서 A/B·테마·빈 상태를 바꾼다. `empty=1`로 빈 상태에 직접 진입할 수 있다. 한국어 mock 데이터는 기본 2종과 사용자 4종이다. 긴 이름·긴 설명을 포함한다.

두 안 모두 사이드바의 템플릿 갤러리 → 독립 작업 탭을 제안한다. 작업 폴더를 누르면 시작 화면으로 전환하며 갤러리 버튼으로 다시 진입한다. 설정 탭(SettingsDialog)·Docling Dashboard와 같은 전체 화면 작업의 배치를 참고했다. 이 개발 화면의 사이드바·탭은 시안을 설명하는 모형이며 실제 App 탭 상태와 연결하지 않았다. 설정 아이콘도 맥락 표시다.

템플릿 선택 → 미리보기 → **이 템플릿으로 새 문서** → 저장 폴더·파일 이름 선택 → 위치 선택 완료까지 메모리 상태로 동작한다. 기본본의 읽기 전용·복사 사용과 사용자 원본 보존을 명시한다. 폴더 목록도 mock이다. 실제 파일 picker·파일 생성·템플릿 관리·Core/CLI/Host API는 연결하지 않았다. 미리보기는 고정 fixture의 내용을 보여주며 Markdown renderer나 문서 의미 처리를 구현하지 않는다. 빈 상태는 기본본까지 없는 극단 상태이며 정상 기본 제공의 부재를 뜻하지 않는다.

## 구조 비교

| 안 | 구조 | 장점 | 비용 |
| --- | --- | --- | --- |
| A | 기본/사용자 세로 목록 + 오른쪽 즉시 미리보기 | 목록 맥락을 유지하고 여러 템플릿을 빠르게 비교한다. 생성 행동이 늘 같은 위치에 있다. | 640px에서 두 열이 좁아 긴 설명·제목이 여러 줄이다. 목록과 미리보기가 함께 길어진다. |
| B | 기본/사용자 카드 갤러리 → 별도 전체 폭 상세 → 목록으로 | 구역 제목 썸네일로 구조를 먼저 훑고, 상세는 640px에서도 넓게 읽는다. | 생성 전에 상세 진입 1회가 추가된다. 카드 높이는 긴 설명에 맞춰 늘어나 짧은 카드의 여백이 남는다. |

**추천은 B.** 현재 규모(6종)에서는 카드 탐색 비용이 작고 최소 지원 폭에서 내용과 생성 행동을 읽기 쉽다. A는 종류를 자주 바꿔 비교할 때 유리하지만 좁은 열의 읽기 비용이 크다. 이 추천은 소유자의 채택 결정을 대신하지 않는다.

## 외부 관례 조사 (2026-11-04)

- [Notion: Start with a template](https://www.notion.com/help/start-with-a-template)는 기본 템플릿을 자기 용도에 맞게 채택·수정하는 흐름을 설명한다. [Template guide](https://www.notion.com/fi/help/guides/the-ultimate-guide-to-notion-templates)는 갤러리에서 찾은 뒤 명시적 `Start with this template` 행동을 안내한다. B의 탐색→상세→사용 단계와 두 안의 명시적 생성 행동에 참고했다. Notion의 화면을 그대로 복제한 것은 아니다.
- [Microsoft Word: document templates](https://word.cloud.microsoft/create/en/templates/)는 템플릿 탐색·검색과 원본의 복사 사용을 설명한다. [Save a document as a template](https://support.microsoft.com/en-us/word/save-a-word-document-as-a-template)는 권장 구역·본문을 미리 담는 관례를 설명한다. A의 이름·설명 목록과 내용 구조의 동시 확인, B의 구역 썸네일에 참고했다. A의 좌우 배치는 이 관례와 Litzio 작업 탭을 조합한 제안이다. Word의 별도 파일 형식은 도입하지 않는다.

## 공통 구현과 예외

Button(default/secondary/ghost), Input, ChoiceGroup, Dialog·DialogTitle·DialogDescription·DialogFooter와 Lucide 아이콘을 재사용했다. 색·서체·간격·radius는 기존 역할 토큰을 사용한다. 개발 CSS는 `src/dev`에 두고 기존 개발 갤러리와 같은 DEV 동적 import로만 연결한다. 생산 JS/CSS에서 `template-gallery`, `tg-shell`과 시안 문구가 제외되는 것을 확인했다.

목록/카드는 대상 탐색 버튼이며 ChoiceGroup으로 의미를 바꾸지 않았다. ChoiceGroup은 개발용 시안 선택에만 쓴다. Base UI Dialog가 modal·focus 경계를 소유한다. B의 목록→상세 이동과 복귀 focus, 템플릿 카드/선택 미리보기 배치가 **새 상호작용 제안**이다. 공통 컴포넌트나 공개 Plugin API로 추가하지 않았다. 제품 채택 시에는 소유자 결정과 실제 탭·파일 picker 연결이 필요하다. Core 의미를 추가하지 않았으므로 CLI parity 대상이 없다.

## 캡처와 점검

Windows persistent Chrome, 100% zoom, Plum, 한국어, 1440×1100 Light / 640×1100 Dark. 각 안의 기본·긴 항목 선택·저장 위치·빈 상태 4개씩 총 16장이다. 아래 기본 캡처는 viewport이며 긴 목록의 나머지는 main 영역을 스크롤한다. 촬영 후 같은 행의 세로 중심, 카드 내 여백, 한국어 어절 줄바꿈, 가로 잘림·가림, 좁은 화면·다크와 모달 footer 정렬을 직접 검토했다. A의 좁은 열과 B 카드의 여백은 비교 결과로 남겼다.

| 상태 | A 1440 Light / 640 Dark | B 1440 Light / 640 Dark |
| --- | --- | --- |
| 기본 | [1440](assets/template-gallery-936/a-1440-light.png) / [640](assets/template-gallery-936/a-640-dark.png) | [1440](assets/template-gallery-936/b-1440-light.png) / [640](assets/template-gallery-936/b-640-dark.png) |
| 긴 항목 선택·미리보기 | [1440](assets/template-gallery-936/a-1440-light-long.png) / [640](assets/template-gallery-936/a-640-dark-long.png) | [1440](assets/template-gallery-936/b-1440-light-long.png) / [640](assets/template-gallery-936/b-640-dark-long.png) |
| 저장 위치 | [1440](assets/template-gallery-936/a-1440-light-save.png) / [640](assets/template-gallery-936/a-640-dark-save.png) | [1440](assets/template-gallery-936/b-1440-light-save.png) / [640](assets/template-gallery-936/b-640-dark-save.png) |
| 빈 상태 | [1440](assets/template-gallery-936/a-1440-light-empty.png) / [640](assets/template-gallery-936/a-640-dark-empty.png) | [1440](assets/template-gallery-936/b-1440-light-empty.png) / [640](assets/template-gallery-936/b-640-dark-empty.png) |

[촬영 body](assets/template-gallery-936/capture.browser.js)는 수동 근거이며 테스트를 추가하지 않았다. runner의 `--screenshots` 허용 목록에 새 이름을 추가하는 대신 기존 `quiet-document.browser.js`를 백업하고 촬영 body로 잠시 교체해 `pnpm browser:test quiet-document --screenshots`로 실행한 뒤 원본을 복원했다. 자동 회귀 통과로 해석하지 않는다. 최초 새 capture 이름은 runner의 허용 목록 검사에서 거부되어 브라우저가 시작되지 않았다. 최종 촬영 실행은 폴더 선택·완료 동작까지 순회했다.

검증: Editor typecheck, production build, docs checker, visual token checker, diff whitespace. 실제 문서 생성·기존 Editor 탭 연결·API 통합은 미검증이다. 로컬 패키징·설치·업데이트·제거·Edge는 실행하지 않았다. runner의 격리된 플러그인/AI/Docling 경로를 사용했고 공용 `.litzio`에는 쓰지 않았다. runner가 시작한 서버와 persistent context는 teardown으로 종료했다.
## C — 카드 + hover/focus 읽기 미리보기 (추가 소유자 피드백)

`/template-gallery?variant=c&theme=light` 또는 `theme=dark`. `variant` 생략도 C다. A/B의 배치·본문·캡처는 추가로 다듬지 않았다. 상시 미리보기·별도 상세 진입 대신 카드의 preview 면에 hover 또는 Tab focus가 오면 비모달 Popover를 연다. 새 문서 행동은 카드 하단의 별도 버튼으로 두어 hover 표면 안으로 진입하지 않아도 실행할 수 있다.

렌더링 경로는 `@litzio/core`의 `parse → getEditableDocument → DocumentEditor(readOnly)`다. `src/dev/templates/0.md`–`5.md`는 일반 Litzio 문서이며 제목·절·문단·목록·표·inline/display 수식이 섞여 있다. 6개 모두 Core `serialize(parse(source))`로 canonicalize하고 다시 parse했다. 별도 Markdown renderer·AST 처리·semantic operation은 만들지 않았다. 실제 읽기 화면의 표·번호·KaTeX를 그대로 쓴다. 저장/Host API는 여전히 mock이다.

공통 `Popover`/`PopoverContent`와 Base UI `Popover.Trigger(openOnHover)`를 사용한다. 기존 `TooltipProvider`의 delay 0, `ReadingPreview`의 즉시 pointer 표시 관례에 맞춰 hover delay/closeDelay를 0으로 지정했다. Base UI가 anchor 배치·flip·shift·포인터의 popup 이동·focus 경계를 소유한다. 1440에서는 카드 옆, 640에서는 위/아래를 우선한다. width 560px을 viewport/available-width로 제한하고 높이는 available-height 안에 맞춰 **본문 내부 스크롤**을 둔다. 포인터가 카드와 팝업을 벗어나면 닫힌다. focus로도 열리며 Escape로 닫고 카드에 focus를 돌린다. Escape 복귀가 재오픈을 일으키지 않도록 해당 focus 1회를 억제한다. Tab으로 이름 있는 스크롤 region에 들어가 PageDown으로 읽을 수 있다. 실제 포인터 이탈·Tab 진입·PageDown·Escape 닫힘을 촬영 body에서 순회했다.

이는 **새 hover 상호작용의 시안**이다. 기존 미주 ReadingPreview 자체는 문서 안의 참조에 결합되어 있고 pointer-transparent overlay이므로 그대로 감싸 쓰지 않았다. 기존 읽기 renderer와 공통 Popover를 조합했다. renderer 내부 타입·Core·공개 Plugin API는 변경하지 않았다. 긴 제목의 어절 줄바꿈은 preview 안의 기존 title textarea에만 CSS로 적용했다.

### 구현 비용과 접근성 경계

- 현 시안은 열린 미리보기 한 개에 readOnly Tiptap editor를 mount한다. renderer 재구현 비용은 피하지만 hover마다 editor 생성 비용이 든다. 고정 소형 6종에서만 확인했으며 대형 문서·저사양 지연·캐싱은 측정하지 않았다. 이 비용을 숨기기 위한 별도 renderer나 선제 캐시 계층은 추가하지 않았다.
- 640px에서 문서 전체를 동시에 보여줄 수 없다. viewport 밖으로 잘리는 대신 내부 스크롤이며, 표·수식을 보는 scrolled 캡처를 따로 남겼다. Popover가 주변 카드를 일시적으로 덮는다. 팝업이 열린 카드 바깥으로 움직이면 닫히는 것은 의도한 동작이다.
- 키보드 focus·Tab 스크롤·PageDown·Escape는 직접 확인했다. 기존 읽기 renderer의 readOnly title textarea·본문 focus stop도 유지된다. screen reader 실기, 고배율, 대형 문서의 포커스 이동은 미검증이며 채택 시 추가 접근성 확인이 필요하다.

### 추가 캡처와 검증

같은 Windows persistent Chrome, Plum, 한국어, 1440×1100 Light·640×1100 Dark. 아래 12장은 추가 소유자 피드백 이후의 C다. 원본 16장과 구분한다.

| 상태 | 1440 Light | 640 Korean Dark |
| --- | --- | --- |
| 카드 목록 | [1440](assets/template-gallery-936/c-1440-light.png) | [640](assets/template-gallery-936/c-640-dark.png) |
| hover 열린 상태 | [1440](assets/template-gallery-936/c-1440-light-hover.png) | [640](assets/template-gallery-936/c-640-dark-hover.png) |
| Tab focus 열린 상태 | [1440](assets/template-gallery-936/c-1440-light-focus.png) | [640](assets/template-gallery-936/c-640-dark-focus.png) |
| 키보드 본문 스크롤 | [1440](assets/template-gallery-936/c-1440-light-keyboard-scroll.png) | [640](assets/template-gallery-936/c-640-dark-keyboard-scroll.png) |
| 긴 이름 카드 hover | [1440](assets/template-gallery-936/c-1440-light-long-hover.png) | [640](assets/template-gallery-936/c-640-dark-long-hover.png) |
| 저장 위치 선택 | [1440](assets/template-gallery-936/c-1440-light-save.png) | [640](assets/template-gallery-936/c-640-dark-save.png) |

[추가 촬영 body](assets/template-gallery-936/hover-capture.browser.js)를 기존 runner에 잠시 넣어 실행하고 원본을 복원했다. 회귀 테스트를 추가하지 않았다. 수동 촬영 보완 중 이름 없는 generic role을 찾던 locator가 timeout으로 실패해 스크롤 영역을 접근성 이름이 있는 region으로 명시하고 다시 확인했다. 실패를 통과로 세지 않았다. 최종 촬영 후 행 정렬·컨트롤 간격·긴 한국어·어절 줄바꿈·가로 잘림·popup viewport 경계·dark·640px 및 스크롤을 직접 점검했다.

기존 Editor typecheck·visual token checker·production build·docs checker·whitespace 검사를 실행했다. 개발 화면·fixture는 production JS/CSS에 들어가지 않는다. 실제 파일 생성·템플릿 API 통합은 미검증이며 공용 사용자 폴더에 쓰지 않았다. 직접 시작한 runner의 서버·브라우저는 종료했다.
