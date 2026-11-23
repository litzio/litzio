# UI 결정표와 실행 예제

| 상황 | 표면 | 사용할 구현 | 동작 | 대표 사용처 | 예외 |
| --- | --- | --- | --- | --- | --- |
| 공개 GitHub 주소에서 플러그인을 추가한다 (#1750) | Plugins 목록 머리의 [GitHub에서 추가…]와 Dialog | outline sm Button·Dialog·Input·native radio·ChoiceGroup(릴리스/브랜치)·FieldError·Tooltip | 주소 입력 → [찾기] → 플러그인 고르기 → 따라갈 대상 → [추가]; 정식 Release에 없는 플러그인은 릴리스 비활성; 추가 뒤 행 설명에 `GitHub <저장소/폴더> · 릴리스|브랜치`, 로컬은 `로컬 폴더` | [플러그인 설정 패턴](ui-patterns-v1.md#플러그인-설정) | 새 부품·토큰 없음. 폴더 선택 창은 단일 선택 listbox 계약(#1676)이라 주소 입력을 섞지 않고 같은 줄의 별도 Dialog로 연다. 따라갈 대상 설명은 Tooltip |
| 플러그인 하나의 업데이트를 확인·적용한다 (#1750) | 행 ⚙ 설정 Dialog의 동작 줄([제거] 왼쪽) | outline sm Button(업데이트 확인·업데이트)·Status plain·Info Tooltip | 그 등록만 확인, 결과(최신·새 버전/새 내용·확인 오류)를 같은 줄에 보이고 새 내용이면 [업데이트] | [플러그인 설정 패턴](ui-patterns-v1.md#플러그인-설정) | 새 부품·토큰 없음. 목록 머리의 전체 확인과 행의 [업데이트]는 그대로 |
| 플러그인의 출처 업데이트를 확인·적용한다 (#1750) | Plugins 목록 머리와 기존 행 | outline sm Button(업데이트 확인·업데이트)·Status plain·Info Tooltip | 머리에서 전체 확인, 새 내용이 있는 행만 버전 아래 경고 상태와 오른쪽 [업데이트], 설치·원본 버전과 실패 사유는 Tooltip, 모두 최신이면 버튼 옆 정상 상태 | [플러그인 설정 패턴](ui-patterns-v1.md#플러그인-설정) | 새 부품·토큰 없음. 앱 업데이트의 Status·버튼 관례를 따르며 행마다 있을 수 있어 채운 버튼 대신 테두리 |
| 문서 설정 (#1721) | 문서 위의 기존 접힘 구역 | SettingsRow·SettingsSelect·SettingsSwitch·Status·Button | 상태 표시·변경, 같은 높이의 두 열 속성 표, 선택지 안 참조 미리보기 | [문서 설정](editor-ux-shell-v1.md#document-settings-placement-554) | 기존 토큰으로 문서 전용 왼쪽 조작 축을 맞춤; 새 공통 부품·토큰 없음 |
| Host 폴더·파일·이미지 선택 (#1676) | 공통 모달 | FolderDialog·Dialog·Button·Input·Lucide·기존 토큰 | 한 번 클릭 선택, 두 번 클릭 이동/확정, 위치 기록·정렬·목록 키보드·선택 footer | [선택 창 계약](folder-picker-v1.md) | 단일 선택 listbox 유지. 이미지 미리보기는 오른쪽, 새 이름은 목록 안의 행 |
| 표의 행·열을 조작한다 (#1481) | 표 테두리의 현재 행·열 손잡이 | 기존 Button·Popover·CommandMenu·명시 대상 명령 | caret/도구 키보드 focus 때 표시, hover만은 숨김. 표시용 대상 강조는 선택이 아님 | [표 상호작용](table-interaction-v1.md) | 내용 크기 불변 |
| 짧은 속성 팝오버의 preview가 늦게 완성된다 (#1626) | 기존 대상 부착 metadata | MetadataProperties·Base UI·기존 compact Button/토큰 | 대상 가까운 동작 행에 Done, 반대쪽 intrinsic preview; 최대 크기로 방향 선택, 렌더만으로 flip하지 않음 | 그림·Mermaid·표·수식·절 label, [공통 계약](figure-authoring-v1.md#stable-metadata-actions-1626) | DOM/Tab은 시각 순서. 고정 preview 틀·pointerdown 제출 없음. 긴 원문은 기존 별도 폼 |
| Mermaid 원문 preview가 비동기로 완성된다 (#1625) | 기존 본문 폭 원문 폼 | PropertyForm·MermaidPreview·기존 토큰, native overflow/keyboard scroll | preview 높이를 예약해 표준 Apply 클릭과 뒤 caption 위치 유지 | [Mermaid Editor](figure-authoring-v1.md#mermaid-editor) | 작은 metadata 썸네일은 기존 intrinsic-ratio/no-letterbox 유지. 새 표면·클릭 우회 없음 |
| 플러그인 화면 안에서 저장본을 읽고 위치를 확인한다 (#1592) | 화면 소유의 내부 스크롤 영역 | ui.DocumentView + 기존 DocumentEditor readOnly/preview, paper·accent·Notice | 같은 Host/열린 폴더, 명시 다시 읽기, revision이 같은 블록·개별 표 셀 이동/강조. 배치·폭 변화를 따라가되 사용자 스크롤 뒤에는 멈춤 | UI gallery → Document view; [화면 계약](plugin-screens-v1.md#읽기-전용-문서-보기) | 새 editor/세션/검수 틀 없음. 폭·원문 배치는 플러그인 소유 |
| 플러그인 화면에서 경로 선택·기존 문서 열기 (#1592) | 기존 FolderDialog·일반 문서 탭 | FolderDialog의 PDF/폴더/.md 선택·기존 openFile·Button/Input | 고정 client·열린 폴더 소속·취소·미저장 보호, 생성 receipt와 opening 결과 구분 | UI gallery → Screen parts → Screen path selection; [화면 계약](plugin-screens-v1.md#파일폴더-선택과-문서-열기) | 새 색/대화/창 상태 API 없음. 폴더 열기와 선택 분리 |
| 플러그인 코드 화면의 그래프·구간·요약 (#1592 2-3) | 기존 플러그인 작업 탭 | Chart(Recharts), Slider(Base UI), Toolbar, SummaryCard, ScreenLayout, 기존 Button/Input/Select(SelectControl)/DataTable(행 선택)/Notice, DangerConfirmation(confirm) | 토큰 색·전체 폭 그래프·hover/키보드 값·단일/구간 선택 | UI gallery → Screen parts; [화면 계약](plugin-screens-v1.md#화면-부품) | 자체 화면 코드 허용, 디자인 강제 없음. 기존 부품이 없어 그래프·슬라이더 wrapper와 작은 배치 부품 추가 |
| 탐색기·작업 화면·설정에 진입한다 (#1817) | 창 왼쪽 끝의 항상 보이는 작업 막대(72px) | ghost Button·Tooltip·Popover+Input(더 보기)·DropdownMenu(Desktop)·Lucide·PluginIcon 단색·HostStatus | 위: 탐색기 열기/접기, 가운데: 템플릿 갤러리·플러그인 대표 화면(활성 탭 선택 표시), 넘치면 '더 보기' 검색 목록, 아래: 설정·색 모드·Desktop 메뉴·연결 점; 세로 toolbar 하나의 Tab 정지점과 화살표 이동 | [작업 막대](editor-ux-shell-v1.md#activity-bar-671--1817) | 위·가운데 항목은 20px 아이콘과 두 줄 이름으로 compact control보다 큰 64px 폭 항목; 막대 안 플러그인 그림은 한 가지 색 |
| 창의 알림을 확인한다 (#1644) | 머리줄 Assistant 옆 종·수동 popover, 자동 카드는 탭 줄 아래 오른쪽 위 (#1806) | compact ghost icon Button·Tooltip·기존 Base UI Popover | 종은 문서와 비겹침·수동 목록은 종 아래 overlay·자동 카드는 머리줄·탭 줄 동작과 비겹침, focus를 가져가지 않음·목록 Escape는 종 복귀 | [알림 배치](editor-layout-rules-v1.md#title-strip-notifications-1644), [P07](ui-patterns-v1.md#p07-입력-오류와-알림-센터) | 소유자 승인 위치 변경. 문서 높이·최소 높이 불변, 비편집 history 경계는 shell 밖에 유지 |
| Copilot 사용량 확인 (#1581) | 기존 컨텍스트 링 hover/focus | AssistantUsageTooltip·Base UI Tooltip·기존 토큰 | 컨텍스트와 세션 보고값 표시, 계정 한도 미제공 명시 | [Copilot 사용량](main-agent-v1.md#질문과-사용량) | 없음 |

| Desktop 창을 숨기거나 완전 종료한다 (#1448) | Windows 트레이 | Electron Tray/Menu + 기존 brand icon·native dialog | 열기·종료, 최초 백그라운드 안내·설정 보존, 종료 시 작업 중단 안내와 기존 미저장 보호 | [Desktop 트레이 계약](desktop-distribution-v1.md#close-to-tray-1448) | 소유자가 승인한 OS 표면으로 renderer 공통 부품 밖이다. 창은 같은 편집 세션을 유지하며 실제 native 시각·패키지 수락은 미확인 |
| 비서 질문에 답하고 기록을 확인한다 (#1443) | 기존 대화 본문, 과정 밖 | AssistantQuestion + native fieldset/radio + 공용 Input/Button | 선택·직접 입력, 렌더 확인 뒤 수락, 답변 후 같은 카드에 기록 | [질문 계약](main-agent-v1.md#질문과-사용량) | 기존 대화·질문 소유권 유지. 공용 Host 질문은 Copilot 지원, native ACP 질문 확장은 미지원 |
| 비서의 작업 과정과 새 내용을 읽는다 (#1436/#1440/#1492) | 기존 대화 패널 | native details/summary + outline sm Button + Lucide ArrowDown | 과정 기본 접힘·턴의 마지막 카드 뒤 현재 단계·hover/focus Tooltip, 위로 읽을 때 위치 유지·새 내용 알림·명시적 하단 이동 | [읽기·진행 계약](main-agent-v1.md#대화와-표시) | 사용자 질문·선택·확인은 과정 밖에 표시. 화면 내부 interaction이며 Host 상태·CLI 작업 추가 없음 |
| 닫힌 비서의 작업·완료·답변 필요를 확인한다 (#1424) | 기존 상단 비서 버튼 | ghost sm Button + Tooltip + agent-dot, 기존 text-muted/accent/warning 토큰 | 빈 원은 작업 중, 채운 원은 완료(읽지 않음), 사각형은 확인·답변 필요. 열면 완료를 확인 처리하며 열린 동안 표시는 숨김 | [비서 상태](main-agent-v1.md#대화와-표시) | 기존 대화·제출 관측을 재사용하며 새 작업 상태·OS 알림·소리 없음 |
| 플러그인 설정에 진입한다 (#1334) | Plugins 목록 행 오른쪽 끝 | ghost icon Button + Tooltip(설정/Settings), 그 뒤 settings-switch | 이름을 포함한 aria-label; 설정이 없어도 정보 열기; 화면 이동은 작업 막대 | PluginSettings | 없음 |
| 문서 스크롤 위치를 표시·조작한다 (#1183/#1182) | 기존 문서 viewport의 trailing inset | DocumentScroll + 설치된 Base UI 1.8.0 ScrollArea, 기존 border-strong/text-muted 토큰 | 네이티브 scrollTop·키보드·선택·ProseMirror 유지, overflow일 때 항상 표시 | Native/Source/일반 Markdown 읽기/시작 화면 | 문서 영역 한정. 다른 스크롤 표면은 유지하며 Monaco 엔진·휠 모델을 이식하지 않는다. [geometry·승인된 시각과 합성 식별 표시 캡처](editor-layout-rules-v1.md#alignment-and-ownership). |
| 문서 내용을 읽고 편집한다 | 문서 본문 | 기존 Tiptap editor / NodeView와 Core operation | 직접 입력은 즉시 적용·Undo · 디스크는 Save · 미저장 닫기는 Save/Don't save/Cancel ([저장 계약](editing-session-save-v1.md#switching-and-recovery), [P04](ui-patterns-v1.md#p04-적용취소완료)) | [DocumentEditor](../../apps/editor/src/DocumentEditor.tsx) | 별도 editor engine을 만들지 않는다. [미적용 초안](editing-session-save-v1.md#applied-content-and-drafts)은 직접 본문 입력과 다르다. |
| 대상의 작은 속성을 고치며 본문 문맥을 유지한다 | 대상에 붙는 작은 편집면 | 기존 속성 폼과 Popover | Metadata는 객체 도구 줄의 속성으로 진입 · Done/유효한 바깥 pointer 적용·Esc 취소 · 오류는 초안 유지 ([P03](ui-patterns-v1.md#p03-편집-진입), [P04](ui-patterns-v1.md#p04-적용취소완료)) | [MetadataProperties](../../apps/editor/src/metadata-properties.tsx) | 바깥 적용은 클릭 위치 focus 유지. 링크·교차참조의 명시적 Apply/Cancel, [미주](footnotes-v1.md#editor), [인용 동결](../adr/0008-citations-and-bibliography.md)은 [P04](ui-patterns-v1.md#p04-적용취소완료)의 별도 경계다. |
| 독립 작업을 열어 다른 문서와 오간다 | 작업 탭 | 기존 탭 / ViewWorkspace | Settings·템플릿 갤러리·Plugin은 작업 막대·명령 센터로 진입 · 오류는 탭/알림에 표시 · Plugin 탭에는 Save/복구 세션 없음 ([탭 수명](plugin-screens-v1.md#연결-수명)) | [화면 코드](plugin-screens-v1.md) | 문서 탭은 별도 [편집 세션](editing-session-save-v1.md#editor-ownership)을 갖는다. 집계·작업 목록을 문서 본문처럼 꾸미지 않는다. |
| 문서를 보며 보조 작업을 동시에 한다 | 도킹 패널 | 기존 shell 패널 · 답변 동작은 CopyButton icon-sm + Tooltip | 사용자 오른쪽 말풍선·AI 왼쪽 본문, turn 끝 복사 1개 ([역할 구분](main-agent-v1.md#대화와-표시)) · Assistant로 진입 · Esc는 열린 선택 팝업부터 닫음 · 좁은 창 Escape/Close는 이전 편집 focus 복귀 ([비서 계약](main-agent-v1.md#대화와-표시)) | [AssistantPanel](../../apps/editor/src/shell/AssistantPanel.tsx) | 좁은 창의 modal 전환은 [현재 패널 계약](main-agent-v1.md#대화와-표시)을 따른다. 파일 참조는 대상 Host의 Explorer ContextMenu에서 초안 칩으로 추가하며(`@` 검색 제거, #1253), `/` Codex 스킬은 기존 후보 UI·칩·경로 Tooltip을 사용한다([스킬 계약](main-agent-v1.md#현재-한계)). Button·Tooltip을 재사용한다([#1047 계약](main-agent-v1.md#대화와-표시)). 범용 Plugin 패널 API는 없다. |
| 현재 작업에서 확인이나 별도 입력 경계가 필요하다 | 모달 | Dialog / DangerConfirmation / 기존 파일 picker | 제목→대상→명시적 동작 · 안전한 취소·focus 복귀 · busy 중복 실행 방지 ([P12](ui-patterns-v1.md#p12-모달파일복구설정-범위)) | [FolderDialog](../../apps/editor/src/shell/FolderDialog.tsx) | 확인·파일 선택만으로 제한하는 새 규칙은 없다. 파일·복구에 metadata의 바깥 적용을 이식하지 않는다([P12](ui-patterns-v1.md#p12-모달파일복구설정-범위)). |
| 앱 전체 설정을 바꾼다 | 작업 탭 | Settings / PluginSettings | 앱 설정은 즉시 반영 · 문서 Save와 분리 · 선택값 저장 오류는 입력 피드백 ([P12](ui-patterns-v1.md#p12-모달파일복구설정-범위), [P07](ui-patterns-v1.md#p07-입력-오류와-알림-센터)) | [SettingsDialog](../../apps/editor/src/shell/SettingsDialog.tsx) | [AI 설정의 순차 자동 저장](main-agent-v1.md#연결과-설정)의 저장 시점은 각 계약을 따른다. [#1032 탭 수명·키보드·캡처](editor-ux-shell-v1.md#settings-task-tab-1032)를 따른다. |

- Status: Implemented
- Last verified: 2026-11-16 — #1662 문서·현재 코드·연결 계약을 정적으로 대조했다. 제품·브라우저 실행 재검증 없음.
- Scope: 에이전트의 기존 UI 선택과 소유자의 개발 갤러리 검토. [#1013 승인 범위](https://github.com/litzio/litzio/issues/1013#issuecomment-6594406926).
- Authority: [DESIGN.md](../../DESIGN.md), [AGENTS.md](../../AGENTS.md), [Visual Language](editor-visual-language-v1.md), [Layout Rules](editor-layout-rules-v1.md), [UI Patterns](ui-patterns-v1.md). 기존 기본 경로의 안내이며 새 시각·행동 규범이 아니다. 미구현 불일치는 DESIGN.md와 UI Patterns의 연결된 목록에서 확인한다.

## 작업 순서

표에서 표면을 고른 뒤 아래 구현·예제·실제 사용처를 읽는다. 기존 토큰·variant·아이콘 관례 안의 선택은 묻지 않고 정한다. 새 표면 구조·기존 계약 변경·새 공통 상호작용·공개 Plugin API 변경만 소유자에게 올린다. 결과에는 선택한 공통 구현과 예외 이유를 적는다.

UI 원칙과 화면 종류별 바탕·여백은 [DESIGN.md](../../DESIGN.md)를 따른다. 큰 배치 변경은 실제 화면에서 검토한다.

## 공통 규칙

### 최소 폭 검수

지원 폭·깨지지 않음의 기준은 [DESIGN.md Layout](../../DESIGN.md#layout)을 따른다. 캡처는 1440px이 기본이며 640px은 배치가 바뀌는 변경에서만 남긴다. 기존 640px 자동 단언은 유지한다. 여러 패널의 의도한 overlay·닫기·focus와 넓은 창 권장 안내는 [레이아웃 계약](editor-layout-rules-v1.md#supported-viewport-and-input), [탐색기 계약](editor-ux-shell-v1.md#narrow-explorer-overlay-1455)을 따른다.

[shadcn 공식 스킬](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md)에서 현재 Base UI·제품 토큰 구성과 맞는 항목만 채택한다. 스킬은 설치하지 않으며 레지스트리 기본 외형을 가져오지 않는다. Litzio의 기존 권한 문서가 우선한다.

- Dialog에 `DialogTitle`을 둔다. 시각적으로 숨길 때는 `sr-only`를 사용한다([현재 Dialog 구성](../../apps/editor/src/components/ui/dialog.tsx), [단축키 제목](../../apps/editor/src/shell/KeyboardShortcutsDialog.tsx)).
- 입력 오류는 컨트롤의 `aria-invalid`와 연결된 오류문으로 표현한다([NewDialog](../../apps/editor/src/shell/NewDialog.tsx), [FieldError](../../apps/editor/src/ui/primitives.tsx)). 현재 공통 Field wrapper가 없으므로 `data-invalid`를 필수로 요구하지 않는다. 기존 불일치는 [P07](ui-patterns-v1.md#p07-입력-오류와-알림-센터)의 범위를 따른다.
- 새 flex/grid 형제 배치는 `space-x/y-*` 대신 토큰에 맞는 `gap-*`를 쓴다([DialogHeader/Footer](../../apps/editor/src/components/ui/dialog.tsx)).
- Tailwind로 같은 폭·높이를 지정할 때 `size-*`를 사용한다. 컨트롤 크기는 새 수치 대신 기존 size variant·토큰을 고른다([Button](../../apps/editor/src/components/ui/button.tsx)).

**선택지 묶음:** 부품 선택은 [DESIGN.md Components](../../DESIGN.md#components)를 따른다. [ChoiceGroup](../../apps/editor/src/components/ui/choice-group.tsx)의 세부 동작은 다음과 같다. 기존 Base UI Button 기반 view-toggle을 일반화해 토큰·28px track과 label 폭 예약을 재사용한다. 필수 단일 선택이며 재선택은 해제하지 않는다. 기존처럼 Tab은 각 버튼을 방문하고 Enter/Space로 선택한다. 화살표 선택이나 다중 선택은 현재 사용처에 없으므로 추가하지 않는다. 독립 서식·폭·Outline 토글, 탭·메뉴·문서 selection은 각 소유자의 계약을 유지한다. Plugin에는 공개하지 않는다(#1028).

## 공통 구현

아래 import는 `apps/editor` 내부용이다. [ADR-0022](../adr/0022-plugin-screen-code.md)에 따라 플러그인 화면 코드는 제공받은 ui.Button/Input/DataTable/Notice와 상속 토큰을 기본으로 사용한다. 화면 코드와 제공 부품의 현재 계약은 [플러그인 화면 계약](plugin-screens-v1.md)과 [UI 패턴](ui-patterns-v1.md)을 따른다. 실행 가능한 예제는 [ui-gallery.tsx](../../apps/editor/src/dev/ui-gallery.tsx)의 이름 있는 함수이며 상단 import와 함께 재사용한다. 예제의 로컬 상태 처리를 제품의 저장·초안 처리로 복사하지 않는다.

| 구현 / 실행 예제 함수 | 용도 / 비사용 | Editor import | 대표 사용처 / 권한 문서 |
| --- | --- | --- | --- |
| Button / `ControlExamples` | 일반 동작·compact·아이콘 버튼 / 탭·목록의 키보드 소유권 대체 아님 | `import { Button } from "@/components/ui/button"` | [Sidebar](../../apps/editor/src/shell/Sidebar.tsx), [공통 컨트롤](editor-visual-language-v1.md#shared-controls), [의도적 예외](editor-layout-rules-v1.md#deliberate-control-exceptions) |
| ChoiceGroup / `ChoiceGroupExamples` | 이름 있는 필수 단일 선택 / 독립 토글·탭·메뉴 대체 아님 | `import { ChoiceGroup } from "@/components/ui/choice-group"` | [NumberField](../../apps/editor/src/numbering-properties.tsx), [DocumentActions](../../apps/editor/src/shell/DocumentActions.tsx), 갤러리 선택 도구 |
| Input / `ControlExamples` | 한 줄 입력과 연결된 label·오류문 / multiline editor·select·checkbox 대체 아님 | `import { Input } from "@/components/ui/input"` | [PluginSettings](../../apps/editor/src/PluginSettings.tsx), [P05](ui-patterns-v1.md#p05-입력칸placeholder위계), [P07](ui-patterns-v1.md#p07-입력-오류와-알림-센터) |
| Dialog / `SurfaceExamples` | 독립 입력·focus 경계 / 단순 속성마다 새 모달을 만들지 않음 | `import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"` | [NewDialog](../../apps/editor/src/shell/NewDialog.tsx), [P12](ui-patterns-v1.md#p12-모달파일복구설정-범위) |
| Popover / `SurfaceExamples` | anchor 옆의 작은 표면 / 초안·적용 의미를 제공하는 engine 아님 | `import { Popover, PopoverContent } from "@/components/ui/popover"`; 예제 trigger는 `@base-ui/react/popover` | [MetadataProperties](../../apps/editor/src/metadata-properties.tsx), [P01](ui-patterns-v1.md#p01-속성-편집-표면과-위치), [가용 영역](editor-layout-rules-v1.md#form-content-viewport-782) |
| 설정 화면 레시피 | 설정 콘텐츠 열의 SettingsRow/Switch/Select; 자유 입력·동작은 Input/Button으로 조합하며 값·저장 시점은 호출자 소유 | `import { SettingsRow, SettingsSwitch, SettingsSelect } from "@/components/ui/settings"` | [본체 Settings](../../apps/editor/src/shell/SettingsDialog.tsx), 비서 설정 |
| DropdownMenu / `MenuExamples` | trigger에서 작업 선택 / 값 선택·자유 입력 폼 대체 아님 | `import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"` | [Sidebar](../../apps/editor/src/shell/Sidebar.tsx), [P10](ui-patterns-v1.md#p10-메뉴와-선택-도구) |
| ContextMenu / `MenuExamples` | 대상의 우클릭·Shift+F10 작업 / 주 동작의 유일한 진입점으로 사용하지 않음 | `import { ContextMenu } from "@/components/ui/context-menu"` | [DocumentTabs](../../apps/editor/src/shell/DocumentTabs.tsx), [P10](ui-patterns-v1.md#p10-메뉴와-선택-도구) |
| Tooltip / `ControlExamples`, `MenuExamples` | hover·keyboard focus 도움말 / label·필수 안내·오류문 대체 아님 | `import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"` | [main의 TooltipProvider](../../apps/editor/src/main.tsx), [상태 규칙](editor-visual-language-v1.md#state-rules) |
| DangerConfirmation / `SurfaceExamples` | 파괴적 동작, Cancel 초기 focus·복귀 / 일반 정보 팝업 대체 아님 | `import { DangerConfirmation } from "@/components/ui/danger-confirmation"` | [공통 구현](../../apps/editor/src/components/ui/danger-confirmation.tsx), [P12](ui-patterns-v1.md#p12-모달파일복구설정-범위) |
| NotificationCenter / `NotificationExample` | 창 단위 작업·문서 알림·같은 종류 묶음 / 입력 오류 대체나 화면마다 center 추가 금지 | 제품에서는 `import { useNotifications } from "@/components/ui/notification-center"`; 직접 center 렌더링은 격리된 갤러리 예제용 | [MessageArea](../../apps/editor/src/shell/MessageArea.tsx), [P07](ui-patterns-v1.md#p07-입력-오류와-알림-센터) |
| 아이콘 / `ControlExamples` | 기존 동작의 Lucide 아이콘과 접근성 이름 / 새 SVG 체계·장식 의미 추가 아님 | `import { FileText, FolderOpen, Pencil, Plus, Settings, Trash2, MoreHorizontal } from "lucide-react"` | [Sidebar](../../apps/editor/src/shell/Sidebar.tsx), [Controls and spacing](editor-layout-rules-v1.md#controls-and-spacing) |

## 갤러리 열기와 검토

갤러리의 Tables·Screen parts는 현재 공용 부품의 합성 자료 예제이며 외부 서비스나 저장 성공의 증거가 아니다.

`pnpm editor` 실행 후 개발 서버의 `/ui-gallery`를 연다(기본 `http://localhost:5173/ui-gallery`). 범주, Light/Dark, Default/Hover·focus/Disabled/Error를 선택한다. Hover·focus는 포인터와 Tab으로 실제 상태를 확인한다. 지원되는 예제에만 disabled·error를 적용하며 선택 도구는 계속 사용할 수 있다. 테마 변경은 이 페이지의 메모리에만 적용한다.

생산 컴포넌트·CSS·토큰을 사용한다. 예제는 문서·설정·플러그인 요청을 쓰지 않는다. 제품 화면의 배치·selection·Undo·저장 계약을 검증하는 대체 화면은 아니다. 갤러리 shell만 개발 전용 CSS를 사용한다.

`main.tsx`의 `import.meta.env.DEV` 분기에서 동적 import하고 Tailwind의 source 검색에서 `src/dev`를 제외한다. `pnpm --filter @litzio/editor build` 후 `apps/editor/dist`의 JS/CSS에 `ui-gallery`, `Litzio UI gallery`, `gallery-dialog-name`이 없는지 확인한다. 개발 연결은 `pnpm browser:test ui-gallery`가 실제 Dialog 열기·닫기·focus 복귀로 검사한다. 외형은 수동 Light/Dark 검토이며 전수 조합·픽셀 CI를 추가하지 않는다([테스트 설계](../contributing/test-design.md)).

## 선택지 분류

현재 선택지의 역할 분류다. 같은 역할의 다중 선택 묶음은 없다.

| 사용처 | 분류 / 처리 | 이유 |
| --- | --- | --- |
| NumberField (그림·Mermaid·표·수식) | 필수 단일 선택 → ChoiceGroup | Automatic / Fixed 초안 값과 기존 콜백 유지 |
| DocumentActions | 필수 단일 선택 → ChoiceGroup | Read / Edit / Source 및 Markdown Text 보기; disabled·접근성 이름 유지 |
| UiGallery Theme·Example state | 필수 단일 선택 → ChoiceGroup | 메모리상의 한 값; 제품 공통 토큰 사용. 범주는 왼쪽 탐색 사용 |
| SelectionToolbar | 독립 서식 토글 유지 | Bold/Italic/Strike/Subscript/Superscript/Code는 editor mark 명령, Link는 편집 진입 |
| DocumentActions Wide / Outline | 독립 토글 유지 | 각각 별도의 표시 환경설정·패널 열기 |
| TableTools 행/열 손잡이 | 문서 selection·메뉴 anchor 유지 | 가변 문서 좌표, row/column selection과 메뉴 키보드 소유권 |
| DocumentPanel / DocumentTabs | 탭 예외 유지 | tablist/tabpanel 연결, roving focus와 Arrow/Home/End 계약 |
| CommandMenu / FolderDialog / Sidebar | 메뉴·listbox·tree 유지 | active item은 명령 탐색·파일/폴더 탐색이며 선택지 버튼 묶음이 아님 |
| BlockHandles / NodeView / DocumentTab / PluginTab | 대상·문서 활성 상태 유지 | hover/문서 selection/표시 수명; 선택지 컨트롤이 아님 |

## 화면별 구현 선택

#1110/#1124: 비서 대화 선택은 기존 outline Button·Tooltip·DropdownMenu와 DropdownMenuItem을 재사용한다.
현재 값은 Check·aria-current로 표시한다. 대화별 선택·권한·복원은 [비서 계약](main-agent-v1.md#현재-한계)을 따른다.

| 상황 | 공통 구현·예외 | 동작을 소유하는 계약 |
| --- | --- | --- |
| 알림 묶음 | NotificationCenter의 내부 disclosure·ghost Button | [P07 묶음·마지막 닫기](ui-patterns-v1.md#같은-종류-묶음과-마지막-닫기) |
| AI 설정 | SettingsSelect·ghost Button·모델 Dialog·Input·FieldError(Ollama 주소) | [비서 설정](main-agent-v1.md#연결과-설정), [P05](ui-patterns-v1.md#p05-입력칸placeholder위계) |
| Desktop 연결·진단·종료 | DesktopMenu의 NotificationCenter·Button·DropdownMenu, About의 SettingsRow·details, main의 native 종료 확인 | [Desktop 로컬 연결](desktop-distribution-v1.md#desktop-local-connection), [공유 daemon](desktop-distribution-v1.md#shared-daemon-desktop) |
| 저장·복구 비교 | VisualCompare·DocumentEditor Read NodeView·ChoiceGroup·Button·Tooltip; unchanged-run disclosure만 ProseMirror decoration 소유 native button 예외. editor 위치 mapping 안에 유지 | [저장 비교](editing-session-save-v1.md#pre-save-visual-comparison-1201), [복구 비교](editing-session-save-v1.md#recovery-visual-comparison-1201) |
| PDF 읽기 | task tab·DocumentTabs·Button·Tooltip·Input·Notice. 원본 종이는 테마와 무관하게 흰색 PDF paper 역할 | [Shell PDF](editor-ux-shell-v1.md#read-only-pdf-tabs-1337), [Host](filesystem-host-boundary-v1.md#pdf-byte-preview-1337) |
| 자료와 문서 블록 대조 | 플러그인 `ui.LinkedDocumentView`와 기존 DocumentView·Button·블록 윤곽. 자료 내용과 분류 표시는 화면 코드가 제공 | [연결 띠 계약](plugin-screens-v1.md#자료와-문서-블록의-연결-띠) |
| 템플릿 목록·미리보기 | task tab·카드·읽기 Popover·이름 Dialog, metadata 편집 폼과 구별 | [템플릿 갤러리](document-templates-v1.md#editor-gallery-phase-2) |

### 갤러리 탐색과 네이티브 목록

왼쪽 탐색은 Controls / Surfaces / Menus / Notifications / Tables / Screen parts를 선택하며 기본은 Controls다. ghost/sm Button과 Settings의 settings-navigation·aria-current 패턴을 쓴다. Theme·Example state는 ChoiceGroup이며 안내는 키보드로 여는 Example guidance disclosure에 둔다. 묶음 전환은 해당 예제 상태를 초기화하고 테마·상태 선택은 갤러리 수명 동안 유지한다.

필터는 DataTable·Popover·native form-select를 사용한다. 공통 form-select option은 surface/text 역할을 함께 지정해 네이티브 펼침 목록의 대비를 유지한다. SettingsSelect·DataTable도 같은 레시피를 공유한다.

## 범위 밖

기존 컴포넌트 리디자인·반복 조합 공통화·플러그인 검사 확대는 이 결정표의 제공 기능이 아니다.

## 이름·값과 상태 부품 선택

| 표시할 정보 | 공통 구현 | 갤러리 |
| --- | --- | --- |
| 이름과 값·설정 한 줄 | Row (SettingsRow는 같은 구현), ui.Row | Shared parts의 item·fact·좁은 열 |
| 여러 줄의 묶음 | Section, ui.Section | Shared parts의 표시 방식 |
| 패널의 구역 머리 | PanelHeader; 작업 탭은 TaskHeader | Shared parts의 머리 |
| 사람의 말로 된 상태 | Status, ui.Status; HostStatus도 같은 표시 | Shared parts의 pill·plain × 다섯 tone |

규칙과 남은 화면 적용은 [DESIGN Components](../../DESIGN.md#components)를 따른다.
