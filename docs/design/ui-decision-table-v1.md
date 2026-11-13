# UI 결정표와 실행 예제

#1150 ③ (2026-11-04): AI는 daemon 공식 기능이며 Settings → AI agent에서 관리한다. 공통 Button·SettingsSelect·Dialog와 기존 설정 화면 배치를 재사용한다. 플러그인 등록/관리/기여 탭·Docling은 제거했다. 아래 보관 소스를 가리키는 플러그인·Docling 과거 캡처/검증은 당시 기록이며 [보관 소스](https://github.com/litzio/litzio/tree/archive/plugins-docling-2026-11) (`ce90560a`)의 기록이다. 현재 재개된 플러그인·workspace 계약은 [플러그인 1단계](plugin-stage1-v1.md)를 따른다. 현재 AI 계약은 [Main agent](main-agent-v1.md), 결정은 [ADR-0017](../adr/0017-bundled-client-and-official-ai.md)을 따른다. Host 클라이언트와 Desktop 번들 UI는 [HTTP Host 계약](http-host-v1.md#desktop-bundled-origin-1150-⑤)을 따른다.

| 상황 | 표면 | 사용할 구현 | 동작 | 대표 사용처 | 예외 |
| --- | --- | --- | --- | --- | --- |
| Copilot 사용량 확인 (#1581) | 기존 컨텍스트 링 hover/focus | AssistantUsageTooltip·Base UI Tooltip·기존 토큰 | 컨텍스트와 세션 보고값 표시, 계정 한도 미제공 명시 | [Copilot 사용량](main-agent-v1.md#질문과-사용량) | 없음 |
| 문제 목록에서 검수한다 (#1462 6-2) | 승인된 A 배치: 목록·가운데 제안/기존 대조·접힌 쪽 칸 | 기존 ReviewRenderer, Button sm/ghost/outline, Input, Checkbox(Base UI), Notice, Tooltip, native details/Lucide chevron·탐색기 행 선택 | 기존 evidence/그룹 판단/필수 확인 작업과 블록 제외 묶음, 비서 승인 권한 추가 없음 | [6-2 화면](docling-review-stage3.md#6단계-최소-검수-화면--6-2) | 배치는 소유자 승인. 새 공통 control/token 예외 없음. 큰 머리글·하단 반복 설명 없음 |
| 파일 없는 검수 snapshot을 대조·중간 내보내기한다 (#1462 P1b) | 기존 comparison 작업 탭·명시 export Dialog | ReviewRenderer/DocumentEditor readOnly preview·Dialog/Input/Button/checkbox | 내부 source/이미지·effective 대응, 실제 파일 열기는 export 결과만, revision/overwrite·미저장 보호 | [P1b](docling-review-stage3.md#p1b-내부-대조이미지명시-export) | 기존 공통 구현, 새 token/control 예외 없음. 완료 승인/final export는 후속 |

| 생성 문서에서 대조를 다시 연다 (#1465) | 기존 문서 안내·탐색기 | warning Notice + ghost sm Button, ContextMenu + PanelRightOpen, 여러 문서는 기존 Dialog/Button | Host 연결을 조회해 기존 대조 탭 열기·재생성 안내 | [생성 문서 진입점](plugin-stage1-v1.md#생성-문서-대조-진입점-1465) | 새 화면 종류 없음. 최근 검수 진행률 목록은 공용 schema/binding 부재로 미제공 |
| Desktop 창을 숨기거나 완전 종료한다 (#1448) | Windows 트레이 | Electron Tray/Menu + 기존 brand icon·native dialog | 열기·종료, 최초 백그라운드 안내·설정 보존, 종료 시 작업 중단 안내와 기존 미저장 보호 | [Desktop 트레이 계약](desktop-distribution-v1.md#close-to-tray-1448) | 소유자가 승인한 OS 표면으로 renderer 공통 부품 밖이다. 창은 같은 편집 세션을 유지하며 실제 native 시각·패키지 수락은 미확인 |
| 비서 질문에 답하고 기록을 확인한다 (#1443) | 기존 대화 본문, 과정 밖 | AssistantQuestion + native fieldset/radio + 공용 Input/Button | 선택·직접 입력, 렌더 확인 뒤 수락, 답변 후 같은 카드에 기록 | [질문 계약](main-agent-v1.md#질문과-사용량) | 기존 대화·질문 소유권 유지. 공용 Host 질문은 Copilot 지원, native ACP 질문 확장은 미지원 |
| 비서의 작업 과정과 새 내용을 읽는다 (#1436/#1440/#1492) | 기존 대화 패널 | native details/summary + outline sm Button + Lucide ArrowDown | 과정 기본 접힘·턴의 마지막 카드 뒤 현재 단계·hover/focus Tooltip, 위로 읽을 때 위치 유지·새 내용 알림·명시적 하단 이동 | [읽기·진행 계약](main-agent-v1.md#대화와-표시) | 사용자 질문·선택·확인은 과정 밖에 표시. 화면 내부 interaction이며 Host 상태·CLI 작업 추가 없음 |
| 닫힌 비서의 작업·완료·답변 필요를 확인한다 (#1424) | 기존 상단 비서 버튼 | ghost sm Button + Tooltip + agent-dot, 기존 text-muted/accent/warning 토큰 | 빈 원은 작업 중, 채운 원은 완료(읽지 않음), 사각형은 확인·답변 필요. 열면 완료를 확인 처리하며 열린 동안 표시는 숨김 | [비서 상태](main-agent-v1.md#대화와-표시) | 기존 대화·제출 관측을 재사용하며 새 작업 상태·OS 알림·소리 없음 |
| 조회 폼의 드문 조건을 숨긴다 (#1370) | 기존 조회 폼 | QueryInputs + Button/Input/FieldError | 선택 advanced 입력만 접기·지정값 요약·오류 자동 펼침, 수동 조회 유지 | [추가 조건](ui-patterns-v1.md#공통-조회-폼의-추가-조건-1370) | 새로운 공통 접기 상호작용, JobPanel에는 자동 적용하지 않음 |
| 플러그인 폴더를 장식한다 (#1366) | 기존 Explorer 폴더 행 | PluginIcon + 기존 16px 아이콘 칸 | 제공 플러그인의 manifest 이미지, 없으면 생략 | FolderTree·Sidebar; 설정·탭과 같은 PluginIcon | 없음 |
| 플러그인 설정에 진입한다 (#1334) | Plugins 목록 행 오른쪽 끝 | ghost icon Button + Tooltip(설정/Settings), 그 뒤 settings-switch | 이름을 포함한 aria-label; 설정이 없어도 정보 열기; 화면 이동은 사이드바 | PluginSettings | 없음 |
| 문서 스크롤 위치를 표시·조작한다 (#1183/#1182) | 기존 문서 viewport의 trailing inset | DocumentScroll + 설치된 Base UI 1.8.0 ScrollArea, 기존 border-strong/text-muted 토큰 | 네이티브 scrollTop·키보드·선택·ProseMirror 유지, overflow일 때 항상 표시 | Native/Source/일반 Markdown 읽기/시작 화면 | 문서 영역 한정. 다른 스크롤 표면은 유지하며 Monaco 엔진·휠 모델을 이식하지 않는다. [geometry·승인된 시각과 합성 식별 표시 캡처](editor-layout-rules-v1.md#alignment-and-ownership). |
| 원본과 Read를 대조하고 변경 제안을 검토한다 | 별도 review 작업 탭 (#1408 완료 작업 진입) | [ReviewRenderer](../../apps/editor/src/review/ReviewRenderer.tsx), Button·Notice·Lucide·DocumentEditor readOnly preview | [공용 대조·승인 패턴](ui-patterns-v1.md#공용-원본-대조와-변경-제안-catalog-v5-1241-a안) | K2/K3/K4 fixture·생성 문서 원본 대조 | bbox·강조 overlay는 원본 좌표 대응에 필요하다. 생성 문서 대조는 640px 이상 내부 스크롤, 기존 K4는 1024px 안내를 유지한다. |
| 플러그인 화면에서 여러 파일 작업을 시작한다 (#1340) | 기존 플러그인 화면, 조회 뷰 위 | PluginJobPanel + 기존 SettingsSelect/Button/체크박스, K1 상태·행동·파일 탐색, view-table-scroll | 파일별 독립 시작·플러그인 작업만 최신순·활성 화면의 진행 작업 polling | [화면 K1 패널](plugin-stage1-v1.md#플러그인-화면-작업-패널-1340) | 공통 상호작용 예외 없음. 작업만 있는 화면 허용; 비서 생성·즐겨찾기 의존 없음. |
| 플러그인 파일 작업의 진행·결과를 확인한다 | 기존 작업 탭 | SettingsSelect/SettingsInput/Button/Notice + 공용 Progress + HostStatus 점·톤 | 진행 화면 한정 polling · uncertain에서만 다시 확인 · Host 목록으로 재진입 · 완료 결과만 열기 | [K1](plugin-stage1-v1.md#k1-파일-작업) | 범용 작업 UI 엔진은 만들지 않는다. Progress는 재사용할 기존 공용 막대가 없어 작은 ARIA·토큰 컴포넌트로 추가한다. |
| 내장 통계와 생성·즐겨찾기 뷰를 연다 | 기존 작업 탭 | DocumentTabs + Views/ViewRenderer, Button/Input/Dialog/Notice, native table/meter와 제품 토큰 | 기본 표 유지 · 제안은 새 탭 · 새 이름 저장 · 목록 열기는 명세만 · 수동 새로고침 | [Plugin views](generated-views-v1.md) | 읽기 전용 뷰는 문서 Save/복구 세션이 없다. SDK 기여 확장은 하지 않는다. |
| 문서 내용을 읽고 편집한다 | 문서 본문 | 기존 Tiptap editor / NodeView와 Core operation | 직접 입력은 즉시 적용·Undo · 디스크는 Save · 미저장 닫기는 Save/Don't save/Cancel ([저장 계약](editing-session-save-v1.md#switching-and-recovery), [P04](ui-patterns-v1.md#p04-적용취소완료)) | [DocumentEditor](../../apps/editor/src/DocumentEditor.tsx) | 별도 editor engine을 만들지 않는다. [미적용 초안](editing-session-save-v1.md#applied-content-and-drafts)은 직접 본문 입력과 다르다. |
| 대상의 작은 속성을 고치며 본문 문맥을 유지한다 | 대상에 붙는 작은 편집면 | 기존 속성 폼과 Popover | Metadata는 Edit로 진입 · Done/유효한 바깥 pointer 적용·Esc 취소 · 오류는 초안 유지 ([P03](ui-patterns-v1.md#p03-편집-진입), [P04](ui-patterns-v1.md#p04-적용취소완료)) | [MetadataProperties](../../apps/editor/src/metadata-properties.tsx) | 바깥 적용은 클릭 위치 focus 유지. 링크·교차참조의 명시적 Apply/Cancel, [미주](footnotes-v1.md#editor), [인용 동결](../adr/0008-citations-and-bibliography.md)은 [P04](ui-patterns-v1.md#p04-적용취소완료)의 별도 경계다. |
| 독립 작업을 열어 다른 문서와 오간다 | 작업 탭 | 기존 탭 / Plugin `TabKind` | Settings는 Sidebar·명령 센터, Plugin은 명령·sidebar/openTab으로 진입 · 오류는 탭/알림에 표시 · Plugin 탭에는 Save/복구 세션 없음 ([탭 수명](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/plugin-ui-v1.md#contributions-lifetime-and-failures)) | [Docling UI 등록](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/plugins/docling/src/ui-plugin.tsx) | 문서 탭은 별도 [편집 세션](editing-session-save-v1.md#editor-ownership)을 갖는다. 집계·작업 목록을 문서 본문처럼 꾸미지 않는다. |
| 문서를 보며 보조 작업을 동시에 한다 | 도킹 패널 | 기존 shell 패널 · 답변 동작은 CopyButton icon-sm + Tooltip | 사용자 오른쪽 말풍선·AI 왼쪽 본문, turn 끝 복사 1개 ([역할 구분](main-agent-v1.md#대화와-표시)) · Assistant로 진입 · Esc는 열린 선택 팝업부터 닫음 · 좁은 창 Escape/Close는 이전 편집 focus 복귀 ([비서 계약](main-agent-v1.md#대화와-표시)) | [AssistantPanel](../../apps/editor/src/shell/AssistantPanel.tsx) | 좁은 창의 modal 전환은 [현재 패널 계약](main-agent-v1.md#대화와-표시)을 따른다. 파일 참조는 대상 Host의 Explorer ContextMenu에서 초안 칩으로 추가하며(`@` 검색 제거, #1253), `/` Codex 스킬은 기존 후보 UI·칩·경로 Tooltip을 사용한다([스킬 계약](main-agent-v1.md#현재-한계)). Button·Tooltip을 재사용한다([#1047 계약](main-agent-v1.md#대화와-표시)). 범용 Plugin 패널 API는 없다. |
| 현재 작업에서 확인이나 별도 입력 경계가 필요하다 | 모달 | Dialog / DangerConfirmation / 기존 파일 picker | 제목→대상→명시적 동작 · 안전한 취소·focus 복귀 · busy 중복 실행 방지 ([P12](ui-patterns-v1.md#p12-모달파일복구설정-범위)) | [FolderDialog](../../apps/editor/src/shell/FolderDialog.tsx) | 확인·파일 선택만으로 제한하는 새 규칙은 없다. 파일·복구에 metadata의 바깥 적용을 이식하지 않는다([P12](ui-patterns-v1.md#p12-모달파일복구설정-범위)). |
| 앱 전체 설정을 바꾼다 | 작업 탭 | Host Settings / Plugin settings contribution | 앱 설정은 즉시 반영 · 문서 Save와 분리 · 선택값 저장 오류는 입력 피드백 ([P12](ui-patterns-v1.md#p12-모달파일복구설정-범위), [P07](ui-patterns-v1.md#p07-입력-오류와-알림-센터)) | [SettingsDialog](../../apps/editor/src/shell/SettingsDialog.tsx) | [AI 설정의 순차 자동 저장](main-agent-v1.md#연결과-설정), [Docling field exit 저장](ui-patterns-v1.md#p12-모달파일복구설정-범위)의 저장 시점은 각 계약을 따른다. [#1032 탭 수명·키보드·캡처](editor-ux-shell-v1.md#settings-task-tab-1032)를 따른다. |

- Status: Implemented
- Last verified: 2026-11-06 — #1298 왼쪽 탐색·native option 역할, ui-gallery 회귀·타입·문서·토큰 검사·Editor build 및 1440px Light/640px Korean Dark 캡처 확인.
- Scope: 에이전트의 기존 UI 선택과 소유자의 개발 갤러리 검토. [#1013 승인 범위](https://github.com/litzio/litzio/issues/1013#issuecomment-6594406926).
- Authority: [AGENTS.md](../../AGENTS.md), [Visual Language](editor-visual-language-v1.md), [Layout Rules](editor-layout-rules-v1.md), [UI Patterns](ui-patterns-v1.md). 기존 기본 경로의 안내이며 새 시각·행동 규범이 아니다. UI Patterns의 승인된 미구현 목표는 제공 중인 구현과 구별한다.

## 작업 순서

표에서 표면을 고른 뒤 아래 구현·예제·실제 사용처를 읽는다. 기존 토큰·variant·아이콘 관례 안의 선택은 묻지 않고 정한다. 새 표면 구조·기존 계약 변경·새 공통 상호작용·공개 Plugin API 변경만 소유자에게 올린다. 결과에는 선택한 공통 구현과 예외 이유를 적는다.

문서의 읽기 여백과 앱 조작 밀도를 구별한다. 문맥 속성은 대상과 연결하고, AI 보조 작업은 문서와 함께 확인하며, 전역 설정의 전체 화면을 작은 속성 폼에 복제하지 않는다. 규범은 [Direction](editor-visual-language-v1.md#direction)과 [Alignment and ownership](editor-layout-rules-v1.md#alignment-and-ownership)에 있다. 큰 배치 변경은 실제 화면에서 검토한다.

## 공통 규칙

### 최소 폭 검수 (#1455)

640px은 최소 지원 폭이다. 검수 기준은 **깨지지 않음**(의도하지 않은 겹침·잘림·조작 불가 없음)이며, 1440px과 같은 동시 정보량이나 배치 완성도를 요구하지 않는다. 여러 패널을 나란히 보는 화면은 좁은 폭에서 기본 동작과 넓은 창 권장 안내만 보장한다. 의도한 탐색기·비서·문서 패널 오버레이는 각 닫기·포커스 계약을 따른다. 캡처는 1440px이 기본이며 640px은 배치가 바뀌는 변경에서만 남긴다. 이미 있는 640px 자동 검사와 단언은 유지한다. [소유자 결정 #1455](https://github.com/litzio/litzio/issues/1455), [레이아웃 계약](editor-layout-rules-v1.md#supported-viewport-and-input)을 따른다.

탐색기는 기존 Sidebar·Button·Tooltip·트리와 문서 패널의 fixed overlay·shadow 토큰을 재사용한다. 비서와 같은 1100px 경계(공용 Adjustable value)를 쓰며 넓은 창의 도킹 선택은 보존한다. 새 공통 표면이나 상호작용 예외는 없다. [동작과 캡처](editor-ux-shell-v1.md#narrow-explorer-overlay-1455).

[shadcn 공식 스킬](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md)에서 현재 Base UI·제품 토큰 구성과 맞는 항목만 채택한다. 스킬은 설치하지 않으며 레지스트리 기본 외형을 가져오지 않는다. Litzio의 기존 권한 문서가 우선한다.

- Dialog에 `DialogTitle`을 둔다. 시각적으로 숨길 때는 `sr-only`를 사용한다([현재 Dialog 구성](../../apps/editor/src/components/ui/dialog.tsx), [단축키 제목](../../apps/editor/src/shell/KeyboardShortcutsDialog.tsx)).
- 입력 오류는 컨트롤의 `aria-invalid`와 연결된 오류문으로 표현한다([NewDialog](../../apps/editor/src/shell/NewDialog.tsx), [FieldError](../../apps/editor/src/ui/primitives.tsx)). 현재 공통 Field wrapper가 없으므로 `data-invalid`를 필수로 요구하지 않는다. 기존 불일치는 [P07](ui-patterns-v1.md#p07-입력-오류와-알림-센터)의 범위를 따른다.
- 새 flex/grid 형제 배치는 `space-x/y-*` 대신 토큰에 맞는 `gap-*`를 쓴다([DialogHeader/Footer](../../apps/editor/src/components/ui/dialog.tsx)).
- Tailwind로 같은 폭·높이를 지정할 때 `size-*`를 사용한다. 컨트롤 크기는 새 수치 대신 기존 size variant·토큰을 고른다([Button](../../apps/editor/src/components/ui/button.tsx)).

**선택지 묶음:** 한 묶음에서 하나를 고르는 값은 [ChoiceGroup](../../apps/editor/src/components/ui/choice-group.tsx)을 사용한다. 기존 Base UI Button 기반 view-toggle을 일반화해 토큰·28px track과 label 폭 예약을 재사용한다. 필수 단일 선택이며 재선택은 해제하지 않는다. 기존처럼 Tab은 각 버튼을 방문하고 Enter/Space로 선택한다. 화살표 선택이나 다중 선택은 현재 사용처에 없으므로 추가하지 않는다. 독립 서식·폭·Outline 토글, 탭·메뉴·문서 selection은 각 소유자의 계약을 유지한다. Plugin에는 공개하지 않는다(#1028).

## 공통 구현

아래 import는 `apps/editor` 내부용이다. [ADR-0022](../adr/0022-plugin-screen-code.md)에 따라 플러그인 화면 코드는 제공받은 ui.Button/Input/DataTable/Notice와 상속 토큰을 기본으로 사용한다. 기존 카탈로그 v2 명세도 유지한다. 앱 번들 renderer가 제품 공통 부품으로 그린다([ADR-0020](../adr/0020-plugin-architecture.md), [catalog-v2](catalog-v2.md), [ui-patterns](ui-patterns-v1.md)). 아래 Plugin Host 열은 보관된 API의 역사적 참조다. 실행 가능한 예제는 [ui-gallery.tsx](../../apps/editor/src/dev/ui-gallery.tsx)의 이름 있는 함수이며 상단 import와 함께 재사용한다. 예제의 로컬 상태 처리를 제품의 저장·초안 처리로 복사하지 않는다.

| 구현 / 실행 예제 함수 | 용도 / 비사용 | Editor import | Plugin Host | 대표 사용처 / 권한 문서 |
| --- | --- | --- | --- | --- |
| Button / `ControlExamples` | 일반 동작·compact·아이콘 버튼 / 탭·목록의 키보드 소유권 대체 아님 | `import { Button } from "@/components/ui/button"` | `host.Button`: default/secondary/ghost, default/sm만; 모든 Editor props가 공개된 것은 아님 | [Sidebar](../../apps/editor/src/shell/Sidebar.tsx), [공통 컨트롤](editor-visual-language-v1.md#shared-controls), [의도적 예외](editor-layout-rules-v1.md#deliberate-control-exceptions) |
| ChoiceGroup / `ChoiceGroupExamples` | 이름 있는 필수 단일 선택 / 독립 토글·탭·메뉴 대체 아님 | `import { ChoiceGroup } from "@/components/ui/choice-group"` | 미제공 | [NumberField](../../apps/editor/src/numbering-properties.tsx), [DocumentActions](../../apps/editor/src/shell/DocumentActions.tsx), 갤러리 선택 도구 |
| Input / `ControlExamples` | 한 줄 입력과 연결된 label·오류문 / multiline editor·select·checkbox 대체 아님 | `import { Input } from "@/components/ui/input"` | `host.Input` | [ServerSettings](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/plugins/docling/src/conversion/ServerSettings.tsx), [P05](ui-patterns-v1.md#p05-입력칸placeholder위계), [P07](ui-patterns-v1.md#p07-입력-오류와-알림-센터) |
| Dialog / `SurfaceExamples` | 독립 입력·focus 경계 / 단순 속성마다 새 모달을 만들지 않음 | `import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"` | `host.Dialog`: open/onClose/title/description/returnFocus/children/footer; primitive API와 다름 | [ConversionDialog](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/plugins/docling/src/conversion/ConversionDialog.tsx), [P12](ui-patterns-v1.md#p12-모달파일복구설정-범위) |
| Popover / `SurfaceExamples` | anchor 옆의 작은 표면 / 초안·적용 의미를 제공하는 engine 아님 | `import { Popover, PopoverContent } from "@/components/ui/popover"`; 예제 trigger는 `@base-ui/react/popover` | 미제공 | [MetadataProperties](../../apps/editor/src/metadata-properties.tsx), [P01](ui-patterns-v1.md#p01-속성-편집-표면과-위치), [가용 영역](editor-layout-rules-v1.md#form-content-viewport-782) |
| 설정 화면 레시피 | Host 콘텐츠 열 안에 SettingsRow/Switch/Select/Input/Action 조합; 값·저장 시점은 호출자 소유 | `import { SettingsRow, SettingsSwitch, SettingsSelect, SettingsInput, SettingsAction } from "@/components/ui/settings"` | `host.SettingsRow/Switch/Select/Input/Action` | [본체 Settings](../../apps/editor/src/shell/SettingsDialog.tsx), AI·Docling Settings; [API 필드](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/plugin-ui-v1.md#host-settings-rows-and-declarative-menus-1033) |
| DropdownMenu / `MenuExamples` | trigger에서 작업 선택 / 값 선택·자유 입력 폼 대체 아님 | `import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"` | `host.Menu({ label, items })`: id/label/run(returnFocus), optional disabled/danger/description; Host가 기존 DropdownMenu로 그림 | [Sidebar](../../apps/editor/src/shell/Sidebar.tsx), [P10](ui-patterns-v1.md#p10-메뉴와-선택-도구) |
| ContextMenu / `MenuExamples` | 대상의 우클릭·Shift+F10 작업 / 주 동작의 유일한 진입점으로 사용하지 않음 | `import { ContextMenu } from "@/components/ui/context-menu"` | 미제공 | [DocumentTabs](../../apps/editor/src/shell/DocumentTabs.tsx), [P10](ui-patterns-v1.md#p10-메뉴와-선택-도구) |
| Tooltip / `ControlExamples`, `MenuExamples` | hover·keyboard focus 도움말 / label·필수 안내·오류문 대체 아님 | `import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"` | 미제공 | [main의 TooltipProvider](../../apps/editor/src/main.tsx), [상태 규칙](editor-visual-language-v1.md#state-rules) |
| DangerConfirmation / `SurfaceExamples` | 파괴적 동작, Cancel 초기 focus·복귀 / 일반 정보 팝업 대체 아님 | `import { DangerConfirmation } from "@/components/ui/danger-confirmation"` | 미제공; `host.Dialog`와 동일 API가 아님 | [공통 구현](../../apps/editor/src/components/ui/danger-confirmation.tsx), [P12](ui-patterns-v1.md#p12-모달파일복구설정-범위) |
| NotificationCenter / `NotificationExample` | 창 단위 작업·문서 알림·같은 종류 묶음 / 입력 오류 대체나 화면마다 center 추가 금지 | 제품에서는 `import { useNotifications } from "@/components/ui/notification-center"`; 직접 center 렌더링은 격리된 갤러리 예제용 | `host.notify(notice)` / `host.notify(null)` | [MessageArea](../../apps/editor/src/shell/MessageArea.tsx), [P07](ui-patterns-v1.md#p07-입력-오류와-알림-센터) |
| 아이콘 / `ControlExamples` | 기존 동작의 Lucide 아이콘과 접근성 이름 / 새 SVG 체계·장식 의미 추가 아님 | `import { FileText, FolderOpen, Pencil, Plus, Settings, Trash2, MoreHorizontal } from "lucide-react"` | Host 아이콘 API 미제공 | [Sidebar](../../apps/editor/src/shell/Sidebar.tsx), [Controls and spacing](editor-layout-rules-v1.md#controls-and-spacing) |

플러그인 실행 예제는 [ConversionDialog](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/plugins/docling/src/conversion/ConversionDialog.tsx)와 [ServerSettings](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/plugins/docling/src/conversion/ServerSettings.tsx)를 사용한다. 설정 행과 선언형 Menu는 [#1033 API](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/plugin-ui-v1.md#host-settings-rows-and-declarative-menus-1033)를 따른다. 범용 Toggle·Popover는 공개하지 않는다. native 탭·행 버튼은 [기존 예외](editor-layout-rules-v1.md#deliberate-control-exceptions)를 확인한다.

## 갤러리 열기와 검토

Plugin views 범주는 query(InputForm, Table, Chart, Panel)와 review(PageSurface, SourceDocumentCompare, ReviewList, ReviewDetail)의 실제 제품 renderer를 사용한다. 메모리 fixture와 adapter만 사용하며 Host 호출·저장은 없다. query/review와 개별 상태를 ChoiceGroup으로 선택한다. review의 refreshing은 Refresh data를 눌러 이전 자료 유지 상태를 확인하고, Changes에서 항목을 선택하면 Details와 메모리 적용·Undo를 확인한다. 외부 서비스나 실제 저장 성공을 증명하는 fixture는 아니다.

수동 검토(2026-11-06, Windows persistent Chrome, 1440×1100, English, Plum): query [Light](assets/generated-views-1241/query-1440-light.png) / [Dark](assets/generated-views-1241/query-1440-dark.png), [인증 오류](assets/generated-views-1241/error-1440-dark.png), 원본 대조 [Light](assets/generated-views-1241/review-1440-light.png) / [Dark](assets/generated-views-1241/review-1440-dark.png), 상세·동작 [Light](assets/generated-views-1241/details-1440-light.png) / [Dark](assets/generated-views-1241/details-1440-dark.png). 입력 간격·테마 대비·12열 overflow와 검토 전후 표시를 확인했다. 원본 이미지는 없는 fixture로 영역 표시를 확인했다. #1278 검토 후 안내를 영역 좌표계 밖으로 이동하고 [단독 PageSurface Light](assets/generated-views-1241/page-1440-light.png) / [Dark](assets/generated-views-1241/page-1440-dark.png)를 추가했다. query·오류·대조·상세 캡처도 갱신했다. Search 배치 차이는 갤러리 wrapper가 제품의 `.form-actions.view-query-actions`를 누락한 것이며 같은 마지막 행·오른쪽 정렬로 수정했다. 상태 선택 label은 읽기 쉬운 표시명으로 바꿨다. `pnpm browser:test ui-gallery --screenshots`의 임시 촬영 body를 실행한 뒤 자동 검사 body를 복원했다. 자동 검사에는 범주 진입·이전 자료 유지·필드 오류·재실행 금지 안내의 대표 연결만 추가하며 픽셀 판정은 없다.

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
| UiGallery Theme·Example state | 필수 단일 선택 → ChoiceGroup | 메모리상의 한 값; 제품 공통 토큰 사용. 범주는 #1298의 왼쪽 탐색으로 이동 |
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


#1110/#1124: 비서 대화 선택은 기존 outline Button·Tooltip·DropdownMenu와 DropdownMenuItem을 재사용한다.
단추에서 목록이 바로 열리며 현재 값은 기존 Check 아이콘·aria-current로 표시한다.
경계는 border-control, 목록은 surface/text 토큰을 따른다. radio wrapper를 추가하지 않는다. 새 공통 상호작용 예외는 없다.
프로바이더 고정·다음 turn 권한·기록 복원은 [비서 계약](main-agent-v1.md#현재-한계)을 따른다.

## AI provider settings (#1109)

공식 Settings → AI agent에서 SettingsSelect, ghost Button과 모델 Dialog를 재사용한다.
#1150 ③에서 enable Switch와 플러그인 영역을 제거했다. 프로바이더 행은 이름·실제 상태와
진단을 표시하며 기존 설정 화면 geometry와 자동 저장을 유지한다. 새 공통 상호작용 예외는 없다.
타입은 코드가, 자동 저장 동작은 [비서 설정 계약](main-agent-v1.md#연결과-설정)이 근거다. 과거 캡처는 해당 문서의 고정 커밋 이력에 보존한다.

## Desktop daemon (#1142 PR3)

기존 Sidebar footer의 ghost/icon-sm Button·Ellipsis와 DropdownMenu를 재사용한다. 메뉴에는 브라우저에서 열기와 daemon 종료를 둔다. 종료 확인은 기존 main의 native confirmation 경계를 재사용하며 항상 연결된 탭·진행 작업의 중단을 안내한다. About 설정은 SettingsRow와 기존 details disclosure로 상태·주소·주체·버전 및 상세 진단을 표시한다. 연결 끊김은 기존 NotificationCenter·Button으로 다시 연결을 제공한다. 새로운 화면 구조·공통 UI·Plugin API 예외는 없다. 1440px/640px 캡처는 PR 검증 근거로 남긴다.

검증: `pnpm browser:test desktop-updates --screenshots`의 persistent Chrome, English/Light, 1440×1000 및 640×1000. 동일 production 컴포넌트와 native boundary stand-in을 사용했다. 메뉴 열기, 주소·주체·버전 표시, 종료 후 끊김 알림/다시 연결을 자동 검사와 함께 확인했다. 실제 native stop 확인은 main wiring 검사, daemon 종료는 실제 subprocess 검사로 별도 보호한다. 새 메뉴는 기존 Tab 순서를 보존하도록 Settings·Color mode 뒤에 둔다.

| Surface | 1440px | 640px |
| --- | --- | --- |
| Menu | [capture](assets/desktop-daemon-1142/daemon-menu-1440.png) | [capture](assets/desktop-daemon-1142/daemon-menu-640.png) |
| Status | [capture](assets/desktop-daemon-1142/daemon-status-1440.png) | [capture](assets/desktop-daemon-1142/daemon-status-640.png) |
| Disconnected | [capture](assets/desktop-daemon-1142/daemon-disconnected-1440.png) | [capture](assets/desktop-daemon-1142/daemon-disconnected-640.png) |

시각 점검: 640px 설정의 기존 세로 전환, 주소 줄바꿈, 메뉴의 화면 안 배치, 끊김 본문·행동 및 닫기 버튼의 잘림 없음을 확인했다. 기존 공통 UI를 그대로 사용했으며 새 예외는 없다.


## Desktop bundled connection (#1150 ⑤)

기존 DesktopMenu의 NotificationCenter·ghost/sm Button과 About의 SettingsRow를 그대로
쓴다. 최초 연결 중·실패와 제품 버전 경고도 같은 창 단위 알림이며 새 표면·공통 구현
예외는 없다. 비서의 연결 알림과 기존 daemon 끊김 알림을 함께 확인했다.

Windows dev Electron, English/Light, 앱 번들 `litzio://app/index.html`, 1440×1000 및
640×1000에서 검토했다. 최초 daemon 미가동 시작은 이전에 화면 자체가 없어서 같은
상태의 Before 캡처가 없다. 기존 연결 끊김 표면의 Before는 위 #1142 캡처를 유지한다.

| 상태 | 1440px | 640px |
| --- | --- | --- |
| 최초 연결 실패 / CLI 안내·Reconnect | [capture](assets/desktop-bundled-1150/disconnected-1440.png) | [capture](assets/desktop-bundled-1150/disconnected-640.png) |
| 같은 화면의 수동 재연결 완료 | [capture](assets/desktop-bundled-1150/connected-1440.png) | [capture](assets/desktop-bundled-1150/connected-640.png) |

본문·긴 오류의 줄바꿈, Reconnect·알림 닫기, 640px 콘텐츠/Sidebar의 잘림 없음을 확인했다.
새 origin의 복구 [실행 기록](assets/desktop-bundled-1150/recovery-proof.json)은 dev Electron의
앱 프로세스 강제 종료·일반 닫기/재시작 → Restore → Save/Reload·외부 409를 기록한다.
패키징/설치 검증이 아니다. 패키지 검사는 PR CI가 담당한다. 촬영은 일회성 dev 수동
검토이며 CI 성공 캡처용 순회를 추가하지 않았다.


## Pre-save comparison (#1201)

Visual/Source uses the existing ChoiceGroup; Previous/Next and Close use Button and
the existing comparison Dialog. Both snapshots reuse DocumentEditor with the shared
Read boundary and Read NodeViews. One shared compact summary per changed pair and
the comparison information icon use the existing Button/Tooltip components. Removed
and added surfaces and `−`/`+` markers reuse the Source comparison convention.
The sole control exception is the unchanged-run
disclosure: a native button owned by a ProseMirror decoration widget, using existing
spacing/surface/border/focus tokens and aria-expanded. Keeping it in the editor's
position mapping avoids a second React editor or detached DOM ownership. Its keyboard
activation is covered by the existing pre-save browser scenario. Details and scope:
[Editing session and Save](editing-session-save-v1.md#pre-save-visual-comparison-1201).

Recovery Compare reuses the same VisualCompare, ChoiceGroup, diff markers and
ComparisonInfo Tooltip without adding another renderer. Its existing Restore/Delete/
Not now controls and plaintext copy retain their behavior. See the
[recovery display contract](editing-session-save-v1.md#recovery-visual-comparison-1201).

## Catalog query renderer V3 (#1241 A안)

공통 구현: `views/QueryViewPage.tsx`의 조회 상태 조합과 `views/source-state.ts`의 고정 오류 adapter,
`views/QueryInputs.tsx`의 scalar binding. 별도 동적 UI 부품군 없이 Input/Button/Notice/
FieldError, SettingsSelect의 `form-select settings-select` 레시피와 기존 Lucide 아이콘을 쓴다.
사용처는 플러그인 기본 화면이다. 폴더 선택 자체 CSS 제거, 첫 조회/loading·이전 결과
표시, 원문 오류/중복 오류 제거, source별 단일 빈 상태, 문자 별 아이콘 제거를 함께 적용한다.
SettingsSelect wrapper는 설정 행 배치이므로 조회 form은 같은 control 레시피를 직접 조합한다.
Plugin jobs는 기존 Notice/Button/공통 progress, Settings는 SettingsSelect/SettingsInput을
유지하며 조회 입력을 저장 설정으로 취급하지 않는다. 동작 규칙은 [조회 패턴](ui-patterns-v1.md#query-renderer-v3)이 소유한다.

#1263 보완: 값 지우기는 Input 안의 ghost/icon-sm + Lucide X/Tooltip, optional boolean은
SettingsSelect 레시피의 Any/Yes/No, 날짜는 공통 Input의 ISO 텍스트/형식 tooltip을 사용한다.
폼 행동은 기존 `.form-actions`, 가로 스크롤 발견성은 문서 표의 thin scrollbar recipe를 재사용한다.
`view-label.ts`는 label이 없는 식별자의 표시 fallback만 맡으며 schema/바인딩을 확장하지 않는다.

#1263 차단 결함 보완: 공통 Views는 CatalogView를 query/review로 분기해 각각 QueryViewPage와
V5 ReviewRenderer를 mount한다. Core ViewInputError의 field diagnostics를 기존 FieldError에
연결한다. JSON Schema 의미를 UI에 복제하지 않으며 Core의 CSP-safe 해석 compiler를 사용한다.

## 동적 뷰 D3 공통 구현

#1341에서 비서 생성·즐겨찾기·출처·Chart 예제를 제거했다. InputForm·세로 Panel·DataTable·review 예제는 `Plugin views`, 조회 교체/가용성 예제는 `Query lifetime`으로 유지한다. 현재 조합은 [플러그인 화면 계약](plugin-screens-v1.md)을 따른다. 새 공통 표면·interaction 예외는 없다.

## 갤러리 탐색과 네이티브 목록 (#1298)

갤러리는 왼쪽 탐색에서 Controls / Surfaces / Menus / Notifications / Plugin views /
Tables / Query lifetime 묶음을 선택한다. 기본 묶음은 Controls다. Button ghost/sm과
Settings의 `settings-navigation` 현재 항목(`aria-current="page"`) 패턴을 재사용한다.
Theme·Example state는 기존 ChoiceGroup을 유지하며, 반복 상태 안내는 키보드로도 열 수
있는 Example guidance disclosure에 둔다. 선택한 묶음의 예제 상태는 전환 시 초기화하고
테마·상태 선택은 갤러리 수명 동안 유지한다. 별도 공통 navigation 컴포넌트나 탭 계약은 만들지 않는다.

필터는 제품 공통 DataTable/Popover와 native `.form-select`를 유지한다. Windows Chrome에서
`color-scheme: dark`만으로 펼침 목록의 흰 배경과 상속한 밝은 글자가 함께 나타나는 것을
수정 전 캡처로 재현했다. 공통 `.form-select option`에 기존 surface/text 역할을 함께 지정한다.
같은 레시피를 사용하는 SettingsSelect·조회 입력도 이 규칙을 공유하며, 문서 의미·저장·CLI는 바뀌지 않는다.

수동 검토: Windows persistent Chrome, 100% zoom, 1000px 높이. 1440px English Light
[변경 전](assets/gallery-navigation-1298/before-1440.png) /
[변경 후](assets/gallery-navigation-1298/after-1440.png), 640px Korean Dark
[변경 전](assets/gallery-navigation-1298/before-640.png) /
[변경 후](assets/gallery-navigation-1298/after-640.png).
필터 네이티브 펼침 목록 [Dark 변경 전](assets/gallery-navigation-1298/before-native-popup.png) /
[Dark 변경 후](assets/gallery-navigation-1298/after-native-640.png) /
[Light 변경 후](assets/gallery-navigation-1298/after-native-1440.png).
실제 Chrome 캡처에 목록이 포함된 것을 직접 보고 옵션 대비, 행 정렬·입력 여백·사이드바와
패널 경계·640px 테이블 내부 가로 스크롤을 확인했다. DOM 단언을 네이티브 픽셀 검증으로
취급하지 않는다. Windows의 모든 브라우저/OS 조합이나 패키지된 Desktop의 네이티브 목록은
이 캡처로 검증하지 않았으며 Settings 실제 화면도 별도로 촬영하지 않았다.

기존 `ui-gallery` 회귀에 묶음 이동/현재 항목/다른 예제 비노출, 공통 옵션의 paired 역할,
빈 값 필터 실제 적용을 보완한다. CSS 연결과 갤러리 탐색이 주된 브라우저 검증 계층이다.
기존 정렬·범위 필터/뷰 수명·차트 회귀는 유지한다. 새 subprocess나 전수 조합은 없으며,
촬영은 임시 scenario body로 `pnpm browser:test ui-gallery --screenshots`를 실행하고 원래
회귀 body를 복원하는 별도 수동 검토다. 외부 Host/AI 수락이나 OS별 전수 검증을 뜻하지 않는다.


### 플러그인 화면 간소화 (#1329)

플러그인 작업 탭의 ViewWorkspace/QueryViewPage와 Button·Notice·기존 간격·글자 토큰을 유지한다. 단일 Host·단일 기본 조회의 선택 장치는 숨기며 조회는 Host 범위다. #1341에서 문서 우측 Views·생성·즐겨찾기를 제거했다. 현재 기준은 [플러그인 화면 계약](plugin-screens-v1.md)이다. 새 표면·공통 interaction 예외는 없다.

## PDF reading choice (#1337)

Explorer PDF activation uses the existing task tab rather than the transient image dialog: multiple pages require sustained reading and navigation. DocumentTabs, Button, Tooltip, Input and Notice are reused. The source paper remains white in dark mode; only the surrounding surface follows theme. The fixed `--id-color-pdf-paper` role expresses this approved source-color exception and adds no common interaction. Behavior and limits: [shell contract](editor-ux-shell-v1.md#read-only-pdf-tabs-1337), [Host boundary](filesystem-host-boundary-v1.md#pdf-byte-preview-1337).


## 플러그인 입력 후보 (#1352)

자유 입력 + 서버 후보는 Base UI Autocomplete를 사용한다. QueryInputs의 기존 Input
render와 label·FieldError·지우기 버튼을 재사용한다. popup은 Popover와 같은 token·portal·
경계 충돌 배치를 사용하며 목록과 키보드 동작은 Base UI가 소유한다. 자체 키보드 처리는 없다.
상태 안내나 설명 표면을 추가하지 않으며 후보 실패는 입력을 막지 않는다. 기존 Settings의
고정 선택과 조회 Select는 유지한다. 새 공통 상호작용의 예외는 없고 소유자 승인 범위의
Autocomplete adapter만 추가한다. 동작은 [입력 후보 계약](plugin-stage1-v1.md#입력-후보-1352-sdk-030)을 따른다.
