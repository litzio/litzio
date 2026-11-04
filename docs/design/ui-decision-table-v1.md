# UI 결정표와 실행 예제

| 상황 | 표면 | 사용할 구현 | 동작 | 대표 사용처 | 예외 |
| --- | --- | --- | --- | --- | --- |
| 문서 내용을 읽고 편집한다 | 문서 본문 | 기존 Tiptap editor / NodeView와 Core operation | 직접 입력은 즉시 적용·Undo · 디스크는 Save · 미저장 닫기는 Save/Don't save/Cancel ([저장 계약](editing-session-save-v1.md#switching-and-recovery), [P04](ui-patterns-v1.md#p04-적용취소완료)) | [DocumentEditor](../../apps/editor/src/DocumentEditor.tsx) | 별도 editor engine을 만들지 않는다. [미적용 초안](editing-session-save-v1.md#applied-content-and-drafts)은 직접 본문 입력과 다르다. |
| 대상의 작은 속성을 고치며 본문 문맥을 유지한다 | 대상에 붙는 작은 편집면 | 기존 속성 폼과 Popover | Metadata는 Edit로 진입 · Done/유효한 바깥 pointer 적용·Esc 취소 · 오류는 초안 유지 ([P03](ui-patterns-v1.md#p03-편집-진입), [P04](ui-patterns-v1.md#p04-적용취소완료)) | [MetadataProperties](../../apps/editor/src/metadata-properties.tsx) | 바깥 적용은 클릭 위치 focus 유지. 링크·교차참조의 명시적 Apply/Cancel, [미주](footnotes-v1.md#editor), [인용 동결](../adr/0008-citations-and-bibliography.md)은 [P04](ui-patterns-v1.md#p04-적용취소완료)의 별도 경계다. |
| 독립 작업을 열어 다른 문서와 오간다 | 작업 탭 | 기존 탭 / Plugin `TabKind` | Settings는 Sidebar·명령 센터, Plugin은 명령·sidebar/openTab으로 진입 · 오류는 탭/알림에 표시 · Plugin 탭에는 Save/복구 세션 없음 ([탭 수명](plugin-ui-v1.md#contributions-lifetime-and-failures)) | [Docling UI 등록](../../plugins/docling/src/ui-plugin.tsx) | 문서 탭은 별도 [편집 세션](editing-session-save-v1.md#editor-ownership)을 갖는다. 집계·작업 목록을 문서 본문처럼 꾸미지 않는다. |
| 문서를 보며 보조 작업을 동시에 한다 | 도킹 패널 | 기존 shell 패널 · 답변 동작은 CopyButton icon-sm + Tooltip | 사용자 오른쪽 말풍선·AI 왼쪽 본문, turn 끝 복사 1개 ([역할 구분](main-agent-v1.md#message-roles-and-turn-actions-1048-1051)) · Assistant로 진입 · Esc는 열린 선택 팝업부터 닫음 · 좁은 창 Escape/Close는 이전 편집 focus 복귀 ([비서 계약](main-agent-v1.md#assistant-panel-and-conversations-931-pr-2)) | [AssistantPanel](../../apps/editor/src/shell/AssistantPanel.tsx) | 좁은 창의 modal 전환은 [현재 패널 계약](main-agent-v1.md#assistant-panel-and-conversations-931-pr-2)을 따른다. 파일 참조는 `@` 후보와 Explorer ContextMenu가 같은 초안 칩을 사용하며, `/` Codex 스킬도 같은 후보 UI·칩·경로 Tooltip을 사용한다([스킬 계약](main-agent-v1.md#codex-skill-selection-1047-pr-b)). Button·Tooltip을 재사용한다([#1047 계약](main-agent-v1.md#file-references-1047-pr-a-984-952)). 범용 Plugin 패널 API는 없다. |
| 현재 작업에서 확인이나 별도 입력 경계가 필요하다 | 모달 | Dialog / DangerConfirmation / 기존 파일 picker | 제목→대상→명시적 동작 · 안전한 취소·focus 복귀 · busy 중복 실행 방지 ([P12](ui-patterns-v1.md#p12-모달파일복구설정-범위)) | [FolderDialog](../../apps/editor/src/shell/FolderDialog.tsx) | 확인·파일 선택만으로 제한하는 새 규칙은 없다. 파일·복구에 metadata의 바깥 적용을 이식하지 않는다([P12](ui-patterns-v1.md#p12-모달파일복구설정-범위)). |
| 앱 전체 설정을 바꾼다 | 작업 탭 | Host Settings / Plugin settings contribution | 앱 설정은 즉시 반영 · 문서 Save와 분리 · 선택값 저장 오류는 입력 피드백 ([P12](ui-patterns-v1.md#p12-모달파일복구설정-범위), [P07](ui-patterns-v1.md#p07-입력-오류와-알림-센터)) | [SettingsDialog](../../apps/editor/src/shell/SettingsDialog.tsx) | [AI 설정의 순차 자동 저장](main-agent-v1.md#settings-and-read-routes), [Docling field exit 저장](ui-patterns-v1.md#p12-모달파일복구설정-범위)의 저장 시점은 각 계약을 따른다. [#1032 탭 수명·키보드·캡처](editor-ux-shell-v1.md#settings-task-tab-1032)를 따른다. |

- Status: Implemented
- Last verified: 2026-11-03 — 구현·공개 API 대조, 타입·문서·토큰 검사, production build와 개발 갤러리 연결·Light/Dark 캡처 확인.
- Scope: 에이전트의 기존 UI 선택과 소유자의 개발 갤러리 검토. [#1013 승인 범위](https://github.com/litzio/litzio/issues/1013#issuecomment-6594406926).
- Authority: [AGENTS.md](../../AGENTS.md), [Visual Language](editor-visual-language-v1.md), [Layout Rules](editor-layout-rules-v1.md), [UI Patterns](ui-patterns-v1.md). 기존 기본 경로의 안내이며 새 시각·행동 규범이 아니다. UI Patterns의 승인된 미구현 목표는 제공 중인 구현과 구별한다.

## 작업 순서

표에서 표면을 고른 뒤 아래 구현·예제·실제 사용처를 읽는다. 기존 토큰·variant·아이콘 관례 안의 선택은 묻지 않고 정한다. 새 표면 구조·기존 계약 변경·새 공통 상호작용·공개 Plugin API 변경만 소유자에게 올린다. 결과에는 선택한 공통 구현과 예외 이유를 적는다.

문서의 읽기 여백과 앱 조작 밀도를 구별한다. 문맥 속성은 대상과 연결하고, AI 보조 작업은 문서와 함께 확인하며, 전역 설정의 전체 화면을 작은 속성 폼에 복제하지 않는다. 규범은 [Direction](editor-visual-language-v1.md#direction)과 [Alignment and ownership](editor-layout-rules-v1.md#alignment-and-ownership)에 있다. 큰 배치 변경은 실제 화면에서 검토한다.

## 공통 규칙

[shadcn 공식 스킬](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md)에서 현재 Base UI·제품 토큰 구성과 맞는 항목만 채택한다. 스킬은 설치하지 않으며 레지스트리 기본 외형을 가져오지 않는다. Litzio의 기존 권한 문서가 우선한다.

- Dialog에 `DialogTitle`을 둔다. 시각적으로 숨길 때는 `sr-only`를 사용한다([현재 Dialog 구성](../../apps/editor/src/components/ui/dialog.tsx), [단축키 제목](../../apps/editor/src/shell/KeyboardShortcutsDialog.tsx)).
- 입력 오류는 컨트롤의 `aria-invalid`와 연결된 오류문으로 표현한다([NewDialog](../../apps/editor/src/shell/NewDialog.tsx), [FieldError](../../apps/editor/src/ui/primitives.tsx)). 현재 공통 Field wrapper가 없으므로 `data-invalid`를 필수로 요구하지 않는다. 기존 불일치는 [P07](ui-patterns-v1.md#p07-입력-오류와-알림-센터)의 범위를 따른다.
- 새 flex/grid 형제 배치는 `space-x/y-*` 대신 토큰에 맞는 `gap-*`를 쓴다([DialogHeader/Footer](../../apps/editor/src/components/ui/dialog.tsx)).
- Tailwind로 같은 폭·높이를 지정할 때 `size-*`를 사용한다. 컨트롤 크기는 새 수치 대신 기존 size variant·토큰을 고른다([Button](../../apps/editor/src/components/ui/button.tsx)).

**선택지 묶음:** 한 묶음에서 하나를 고르는 값은 [ChoiceGroup](../../apps/editor/src/components/ui/choice-group.tsx)을 사용한다. 기존 Base UI Button 기반 view-toggle을 일반화해 토큰·28px track과 label 폭 예약을 재사용한다. 필수 단일 선택이며 재선택은 해제하지 않는다. 기존처럼 Tab은 각 버튼을 방문하고 Enter/Space로 선택한다. 화살표 선택이나 다중 선택은 현재 사용처에 없으므로 추가하지 않는다. 독립 서식·폭·Outline 토글, 탭·메뉴·문서 selection은 각 소유자의 계약을 유지한다. Plugin에는 공개하지 않는다(#1028).

## 공통 구현

아래 import는 `apps/editor` 내부용이다. 플러그인은 Editor 내부를 import하지 않고 주입된 [UiHost](../../packages/plugin-api/src/ui.ts)를 사용한다([Plugin API 경계](plugin-ui-v1.md#renderer-and-api-surface)). 실행 가능한 예제는 [ui-gallery.tsx](../../apps/editor/src/dev/ui-gallery.tsx)의 이름 있는 함수이며 상단 import와 함께 재사용한다. 예제의 로컬 상태 처리를 제품의 저장·초안 처리로 복사하지 않는다.

| 구현 / 실행 예제 함수 | 용도 / 비사용 | Editor import | Plugin Host | 대표 사용처 / 권한 문서 |
| --- | --- | --- | --- | --- |
| Button / `ControlExamples` | 일반 동작·compact·아이콘 버튼 / 탭·목록의 키보드 소유권 대체 아님 | `import { Button } from "@/components/ui/button"` | `host.Button`: default/secondary/ghost, default/sm만; 모든 Editor props가 공개된 것은 아님 | [Sidebar](../../apps/editor/src/shell/Sidebar.tsx), [공통 컨트롤](editor-visual-language-v1.md#shared-controls), [의도적 예외](editor-layout-rules-v1.md#deliberate-control-exceptions) |
| ChoiceGroup / `ChoiceGroupExamples` | 이름 있는 필수 단일 선택 / 독립 토글·탭·메뉴 대체 아님 | `import { ChoiceGroup } from "@/components/ui/choice-group"` | 미제공 | [NumberField](../../apps/editor/src/numbering-properties.tsx), [DocumentActions](../../apps/editor/src/shell/DocumentActions.tsx), 갤러리 선택 도구 |
| Input / `ControlExamples` | 한 줄 입력과 연결된 label·오류문 / multiline editor·select·checkbox 대체 아님 | `import { Input } from "@/components/ui/input"` | `host.Input` | [ServerSettings](../../plugins/docling/src/conversion/ServerSettings.tsx), [P05](ui-patterns-v1.md#p05-입력칸placeholder위계), [P07](ui-patterns-v1.md#p07-입력-오류와-알림-센터) |
| Dialog / `SurfaceExamples` | 독립 입력·focus 경계 / 단순 속성마다 새 모달을 만들지 않음 | `import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"` | `host.Dialog`: open/onClose/title/description/returnFocus/children/footer; primitive API와 다름 | [ConversionDialog](../../plugins/docling/src/conversion/ConversionDialog.tsx), [P12](ui-patterns-v1.md#p12-모달파일복구설정-범위) |
| Popover / `SurfaceExamples` | anchor 옆의 작은 표면 / 초안·적용 의미를 제공하는 engine 아님 | `import { Popover, PopoverContent } from "@/components/ui/popover"`; 예제 trigger는 `@base-ui/react/popover` | 미제공 | [MetadataProperties](../../apps/editor/src/metadata-properties.tsx), [P01](ui-patterns-v1.md#p01-속성-편집-표면과-위치), [가용 영역](editor-layout-rules-v1.md#form-content-viewport-782) |
| 설정 화면 레시피 | Host 콘텐츠 열 안에 SettingsRow/Switch/Select/Input/Action 조합; 값·저장 시점은 호출자 소유 | `import { SettingsRow, SettingsSwitch, SettingsSelect, SettingsInput, SettingsAction } from "@/components/ui/settings"` | `host.SettingsRow/Switch/Select/Input/Action` | [본체 Settings](../../apps/editor/src/shell/SettingsDialog.tsx), AI·Docling Settings; [API 필드](plugin-ui-v1.md#host-settings-rows-and-declarative-menus-1033) |
| DropdownMenu / `MenuExamples` | trigger에서 작업 선택 / 값 선택·자유 입력 폼 대체 아님 | `import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"` | `host.Menu({ label, items })`: id/label/run(returnFocus), optional disabled/danger/description; Host가 기존 DropdownMenu로 그림 | [Sidebar](../../apps/editor/src/shell/Sidebar.tsx), [P10](ui-patterns-v1.md#p10-메뉴와-선택-도구) |
| ContextMenu / `MenuExamples` | 대상의 우클릭·Shift+F10 작업 / 주 동작의 유일한 진입점으로 사용하지 않음 | `import { ContextMenu } from "@/components/ui/context-menu"` | 미제공 | [DocumentTabs](../../apps/editor/src/shell/DocumentTabs.tsx), [P10](ui-patterns-v1.md#p10-메뉴와-선택-도구) |
| Tooltip / `ControlExamples`, `MenuExamples` | hover·keyboard focus 도움말 / label·필수 안내·오류문 대체 아님 | `import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"` | 미제공 | [main의 TooltipProvider](../../apps/editor/src/main.tsx), [상태 규칙](editor-visual-language-v1.md#state-rules) |
| DangerConfirmation / `SurfaceExamples` | 파괴적 동작, Cancel 초기 focus·복귀 / 일반 정보 팝업 대체 아님 | `import { DangerConfirmation } from "@/components/ui/danger-confirmation"` | 미제공; `host.Dialog`와 동일 API가 아님 | [공통 구현](../../apps/editor/src/components/ui/danger-confirmation.tsx), [P12](ui-patterns-v1.md#p12-모달파일복구설정-범위) |
| NotificationCenter / `NotificationExample` | 창 단위 작업·문서 알림·같은 종류 묶음 / 입력 오류 대체나 화면마다 center 추가 금지 | 제품에서는 `import { useNotifications } from "@/components/ui/notification-center"`; 직접 center 렌더링은 격리된 갤러리 예제용 | `host.notify(notice)` / `host.notify(null)` | [MessageArea](../../apps/editor/src/shell/MessageArea.tsx), [P07](ui-patterns-v1.md#p07-입력-오류와-알림-센터) |
| 아이콘 / `ControlExamples` | 기존 동작의 Lucide 아이콘과 접근성 이름 / 새 SVG 체계·장식 의미 추가 아님 | `import { FileText, FolderOpen, Pencil, Plus, Settings, Trash2, MoreHorizontal } from "lucide-react"` | Host 아이콘 API 미제공 | [Sidebar](../../apps/editor/src/shell/Sidebar.tsx), [Controls and spacing](editor-layout-rules-v1.md#controls-and-spacing) |

플러그인 실행 예제는 [ConversionDialog](../../plugins/docling/src/conversion/ConversionDialog.tsx)와 [ServerSettings](../../plugins/docling/src/conversion/ServerSettings.tsx)를 사용한다. 설정 행과 선언형 Menu는 [#1033 API](plugin-ui-v1.md#host-settings-rows-and-declarative-menus-1033)를 따른다. 범용 Toggle·Popover는 공개하지 않는다. native 탭·행 버튼은 [기존 예외](editor-layout-rules-v1.md#deliberate-control-exceptions)를 확인한다.

## 갤러리 열기와 검토

`pnpm editor` 실행 후 개발 서버의 `/ui-gallery`를 연다(기본 `http://localhost:5173/ui-gallery`). 범주, Light/Dark, Default/Hover·focus/Disabled/Error를 선택한다. Hover·focus는 포인터와 Tab으로 실제 상태를 확인한다. 지원되는 예제에만 disabled·error를 적용하며 선택 도구는 계속 사용할 수 있다. 테마 변경은 이 페이지의 메모리에만 적용한다.

생산 컴포넌트·CSS·토큰을 사용한다. 예제는 문서·설정·플러그인 요청을 쓰지 않는다. 제품 화면의 배치·selection·Undo·저장 계약을 검증하는 대체 화면은 아니다. 갤러리 shell만 개발 전용 CSS를 사용한다.

`main.tsx`의 `import.meta.env.DEV` 분기에서 동적 import하고 Tailwind의 source 검색에서 `src/dev`를 제외한다. `pnpm --filter @litzio/editor build` 후 `apps/editor/dist`의 JS/CSS에 `ui-gallery`, `Litzio UI gallery`, `gallery-dialog-name`이 없는지 확인한다. 개발 연결은 `pnpm browser:test ui-gallery`가 실제 Dialog 열기·닫기·focus 복귀로 검사한다. 외형은 수동 Light/Dark 검토이며 전수 조합·픽셀 CI를 추가하지 않는다([테스트 설계](../contributing/test-design.md)).

수동 검토: Windows persistent Chrome, 1440×1100, English, Plum, 100% zoom. [Light](assets/ui-gallery-1013/gallery-1440-light.png) / [Dark](assets/ui-gallery-1013/gallery-1440-dark.png) / [오류 상태](assets/ui-gallery-1013/gallery-error-dark.png). 버튼 정렬·입력 여백·상태 구별·잘림을 확인했다. 기존 화면 변경이 아닌 새 개발 화면이므로 Before 캡처는 없다.

## 선택지 분류와 검증 (#1034)

`apps/editor/src`의 `aria-pressed`, active/selected 조건과 view-toggle 사용처를 조사했다. 현재 같은 역할의 다중 선택 묶음은 없다.

| 사용처 | 분류 / 처리 | 이유 |
| --- | --- | --- |
| NumberField (그림·Mermaid·표·수식) | 필수 단일 선택 → ChoiceGroup | Automatic / Fixed 초안 값과 기존 콜백 유지 |
| DocumentActions | 필수 단일 선택 → ChoiceGroup | Read / Edit / Source 및 Markdown Text 보기; disabled·접근성 이름 유지 |
| UiGallery 범주·Theme·Example state | 필수 단일 선택 → ChoiceGroup | 메모리상의 한 값; 제품 공통 토큰 사용 |
| SelectionToolbar | 독립 서식 토글 유지 | Bold/Italic/Strike/Subscript/Superscript/Code는 editor mark 명령, Link는 편집 진입 |
| DocumentActions Wide / Outline | 독립 토글 유지 | 각각 별도의 표시 환경설정·패널 열기 |
| TableTools 행/열 손잡이 | 문서 selection·메뉴 anchor 유지 | 가변 문서 좌표, row/column selection과 메뉴 키보드 소유권 |
| DocumentPanel / DocumentTabs | 탭 예외 유지 | tablist/tabpanel 연결, roving focus와 Arrow/Home/End 계약 |
| CommandMenu / FolderDialog / Sidebar | 메뉴·listbox·tree 유지 | active item은 명령 탐색·파일/폴더 탐색이며 선택지 버튼 묶음이 아님 |
| BlockHandles / NodeView / DocumentTab / PluginTab | 대상·문서 활성 상태 유지 | hover/문서 selection/표시 수명; 선택지 컨트롤이 아님 |

검사 설계: 기존 `read-view`, `text-mode`, `figure-authoring`는 실제 문서 보기와 NumberField의 초안·저장 연결을 보호한다. 기존 `ui-gallery`에 공통 구현의 Tab 이동, Enter/Space, 필수 선택 재선택·disabled를 대표 한 묶음으로 추가한다. Core 의미는 변경하지 않으며 전수 조합·새 subprocess·CI 성공 캡처를 추가하지 않는다. Editor 단위 검사·typecheck/build·문서/토큰 검사를 함께 실행한다. Browser/HTTP/Desktop의 나머지 필수 검사는 PR CI가 담당한다.

수동 캡처는 Windows persistent Chrome, 1440×1000, English, 같은 문서·고정 번호 속성 및 갤러리의 같은 상태다. `pnpm browser:test numbering-mode --screenshots`로 일시적인 촬영용 body를 실행한 뒤 원래 시나리오를 복원했다. 자동 검사에 촬영 순회를 넣지 않았다.

| 화면 | Light Before / After | Dark Before / After |
| --- | --- | --- |
| 문서 보기·번호 속성 | [Before](assets/choice-group-1034/before-document-light.png) / [After](assets/choice-group-1034/after-document-light.png) | [Before](assets/choice-group-1034/before-document-dark.png) / [After](assets/choice-group-1034/after-document-dark.png) |
| 갤러리 | [Before](assets/choice-group-1034/before-gallery-light.png) / [After](assets/choice-group-1034/after-gallery-light.png) | [Before](assets/choice-group-1034/before-gallery-dark.png) / [After](assets/choice-group-1034/after-gallery-dark.png) |

시각 점검: 문서 보기와 번호 세그먼트는 전후 동일한 정렬·높이·대비를 유지했다. 갤러리는 같은 토큰의 quiet track과 선택 면으로 통일했으며 control 높이와 글자 대비·잘림을 점검했다. 문서 Light Before 하단의 Mermaid는 비동기 렌더 중이며 변경 대상 세그먼트 밖의 차이다.

## 알림 묶음 (#1005, #986)

기존 NotificationCenter와 ghost/sm·icon-sm Button, Lucide chevron/X 및 제품 토큰을
재사용한다. 묶음은 내부 목록의 disclosure이며 새 표면·Plugin API는 추가하지 않는다.
원인별 숨김·재발과 위치 이동은 기존 등록 경로를 유지한다. 등록 출처·문맥·심각도·
기존 유형 값으로 묶으며, singleton과 유형 불명 메시지의 보수적 묶음 기준은
[P07 계약과 전후 캡처](ui-patterns-v1.md#같은-종류-묶음과-마지막-닫기-1005-986)를 따른다.
기존 native 행/폼 예외를 확장하지 않으며 새 공통 구현 예외는 없다.

## 범위 밖

기존 컴포넌트 리디자인·반복 조합 공통화·플러그인 검사 확대는 이 결정표의 제공 기능이 아니다. [Settings 탭](https://github.com/litzio/litzio/issues/1026), [Docling 요약](https://github.com/litzio/litzio/issues/1027), [AI 결과 경로](https://github.com/litzio/litzio/issues/1029)는 별도 작업이다.

## 플러그인 관리 설정 (#1007)

플러그인 목록은 SettingsSwitch로 이름·버전·상태와 켜기·끄기를 표시하고,
SettingsRow와 기존 Button으로 해당 플러그인의 설정에 진입한다. 최상위 분류에
플러그인별 항목을 추가하지 않으며, 상세 화면에서 목록으로 돌아간다.
설치 revision·경로·기본 버전 일치 여부는 기존 Tooltip과 공통 정보 버튼으로
hover·keyboard focus에서 확인한다. 기본 버전 재등록은 기존 확인 Dialog를 유지한다.
새 공통 컴포넌트·공개 Plugin API 예외는 없다.

## AI provider settings (#1109)

기존 플러그인 설정 표면에서 SettingsSelect와 SettingsSwitch, ghost Button 및
모델 Dialog를 재사용한다. 승인된 프로바이더 한 줄 배치에서 Switch의 기존 행 label은
접근성을 유지한 채 시각적으로 숨겨 이름·상태 → 진단 → 토글 순서를 만든다.
새 공통 UI API는 추가하지 않는다. 공개 AI 설정 타입 변경과 자동 저장 계약은
[Main agent settings](main-agent-v1.md#independent-provider-settings-1109)에 기록한다.
