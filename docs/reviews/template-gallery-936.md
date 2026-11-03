# 템플릿 갤러리 화면 스파이크 #936

- Status: Historical
- Date: 2026-11-04
- Scope: `spike/936-template-gallery` 전용 비교 시안. 병합·PR 대상이 아니며 제품 계약이 아니다.
- Authority: [#936 소유자 결정](https://github.com/litzio/litzio/issues/936), [UI 결정표](../design/ui-decision-table-v1.md), [UI 패턴](../design/ui-patterns-v1.md), [Layout Rules](../design/editor-layout-rules-v1.md), [Visual Language](../design/editor-visual-language-v1.md), [ADR-0010](../adr/0010-supported-viewport-and-input.md).

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
