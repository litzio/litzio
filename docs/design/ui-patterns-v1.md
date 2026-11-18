# 반복 UI 패턴 v1

역할: 반복 UI의 현재 동작·기준 구현·사용처와 알려진 불일치를 관리한다. UI 원칙은 [DESIGN.md](../../DESIGN.md), 시각 표현은 [Visual Language](editor-visual-language-v1.md), 배치·치수는 [Layout Rules](editor-layout-rules-v1.md)를 따른다.

- Status: Implemented
- Last verified: 2026-11-16 — #1662 문서·현재 코드·연결 계약과 불일치 이슈 상태를 정적으로 대조했다. 제품·브라우저 실행 재검증 없음.
- Scope: Editor 반복 UI의 현재 기준과 사용처. 미구현 목표는 알려진 불일치에서 구분한다.
- Authority: [AGENTS.md](../../AGENTS.md), [ADR-0001](../adr/0001-single-document-editor-architecture.md), [ADR-0010](../adr/0010-supported-viewport-and-input.md), [#777 소유자 결정][decision]. 기능별 세부 동작은 연결된 Implemented 계약이 소유한다.

## 사용과 갱신

UI 작업 전에 해당 패턴과 같은 패턴을 쓰는 다른 사용처를 확인한다. U ID와 파일·화면의 대응은 [사용처 지도][usage]를 재사용한다. 기준 구현은 명시한 부분의 본보기이며 컴포넌트 전체의 적합성을 뜻하지 않는다.

구현 PR은 해당 패턴의 현재 기준과 관련 계약을 갱신한다. 새 불일치는 ID·패턴·사용처·목표·후속 이슈를 등록한다. 열린 이슈는 남기고, 닫힌 이슈는 코드가 목표를 충족하는지 확인한 뒤 목록에서 지운다. 이슈 없는 항목은 확인 전까지 남긴다. 과거 결정·대안·검증은 [인벤토리][inventory]와 Git 이력에서 확인한다.

## P01 속성 편집 표면과 위치

- **목적·사용/비사용:** 짧은 속성은 대상 문맥 안에서 고친다. 긴 원문, 미주 본문, 문서·앱 전체 설정을 작은 속성 팝오버에 넣지 않는다.
- **현재 기준:** [MetadataProperties](../../apps/editor/src/metadata-properties.tsx)를 그림·표·수식·절 label이 공유하며 대상 전체(절 label은 연결된 제목)에 붙인다. `documentContentBounds`를 공유하는 작은 폼의 콘텐츠 경계(#782), Mermaid 원문의 본문 폭, 미주 in-place와 문서/앱 설정의 범위 분리.
- **사용처:** U01–U11 그림·수식·표·미주·inline/절 label, U12 제목, U13 문서 설정, U22 앱 설정.

짧은 metadata와 긴 원문·미주·설정의 경계를 구별한다. 자동 우측 inspector를 열지 않는다. 레이블과 번호는 그림·Mermaid·표·수식의 속성 팝오버와 Mermaid·수식 원문 폼에서 같은 2열 배치를 쓴다. 좁은 팝오버에서는 번호 선택지가 잘리지 않도록 레이블 칸이 먼저 줄어든다. 한국어 1440px 밝음 전후(구현 자체 점검): 표 속성 [전](assets/object-editing-1706/layout-before-table-properties.png) / [후](assets/object-editing-1706/layout-after-table-properties.png), 수식 원문 [전](assets/object-editing-1706/layout-before-equation-source.png) / [후](assets/object-editing-1706/layout-after-equation-source.png), Mermaid 원문 [전](assets/object-editing-1706/layout-before-mermaid-source.png) / [후](assets/object-editing-1706/layout-after-mermaid-source.png). metadata label 칩도 클릭·Enter/Space로 같은 폼의 Label에 진입한다. 동작 행 방향·DOM/Tab 순서·focus 복구와 intrinsic preview는 [metadata 계약](figure-authoring-v1.md#stable-metadata-actions-1626), 비동기 원문 preview의 높이 예약·내부 스크롤은 [Mermaid 계약](figure-authoring-v1.md#mermaid-editor)을 따른다.

## P02 자동·고정 번호

- **목적·사용/비사용:** 그림·표·블록 수식의 번호 지정에 쓴다. 제목 번호 설정이나 새 Core 문서 모드를 만들지 않는다.
- **현재 기준:** [NumberField][number]를 이미지/pending·Mermaid 속성·표·블록 수식·Mermaid 원문의 다섯 폼에서 공유한다(#776). 자동/고정 세그먼트, 고정일 때만 값 입력, 빈 고정의 완료 차단·입력칸 오류와 자동 선택으로만 해제를 동일하게 제공한다. 자동 상태는 해당 블록의 고정값을 제외하여 Core가 계산한 번호를 "자동 번호: N"으로 짧게 표시한다. 아직 적용하지 않은 선택의 결과와 이미 자동으로 적용된 번호에 같은 문구를 쓴다. Core/CLI의 빈 enumerator 제거와 비차단 혼합·중복 경고는 유지한다.
- **사용처:** U01–U05 그림·수식·표의 번호 폼, U14 번호 입력·집계.

문서 설정은 SettingsRow·SettingsSelect·SettingsSwitch의 두 열 속성 표로 상태·제목 번호·캡션 번호·상호 참조 표기·연결된 참고문헌을 표시한다. 행 높이와 오른쪽 조작 시작선을 맞추며 설명은 hover·keyboard focus에서 제공한다. 상태가 있으면 접힌 머리줄과 읽기 전용 요약에도 Status를 표시한다. 자동·고정·혼합 표시와 일괄 전환·Undo는 [번호 계약](heading-numbering-v1.md#fixed-numbers-720)을 따른다.

## P03 편집 진입

표·그림·Mermaid·블록 수식은 같은 객체 도구 줄을 쓴다. 첫 버튼은 항상 **속성**(Properties)이고 레이블·번호·대체 텍스트의 팝오버를 연다. 내용을 본문에서 직접 고칠 수 없는 객체만 그 옆에 내용 동작을 둔다. Mermaid·수식은 **원문 편집**(Edit source), 이미지가 있는 그림은 **이미지 교체**(Replace image)다. 표는 칸을 본문에서 직접 고치므로 속성만 있다. 버튼 이름은 여는 것을 말하며 대상 없는 "편집"을 쓰지 않는다. 도구 줄은 hover·키보드 focus·선택·속성 편집 중에 같은 위치에 나타난다. 문서 폭이 30rem 이하인 블록에서는 버튼이 아이콘만 보이고 이름은 툴팁과 접근성 이름으로 남는다. 가운데 놓인 수식·이미지를 가리지 않기 위해서다. 아이콘은 블록 메뉴의 같은 항목과 같다. 포인터로 누를 때 focus를 블록 안으로 옮기지 않아, 폼을 닫으면 caret이 객체 뒤로 돌아간다. inline 콘텐츠 자체를 큰 UI 버튼으로 바꾸지 않는다.

더블클릭과 선택 뒤 Enter는 그 객체의 내용 동작을 연다. 수식·Mermaid는 원문 폼, 내용 편집면이 따로 없는 이미지·빈 그림·표는 속성이다. 레이블 칩은 속성의 Label로 들어간다. 여백 손잡이·우클릭·Shift+F10의 블록 메뉴는 맨 위에 도구 줄과 같은 이름의 항목을 둔다.

같은 문서·같은 상태의 한국어 1440px 밝음 전후(#1706). 소유자가 2026-11-17 시안을 승인했다. 캡처는 수동 검토 자료이며 자동 검사와 별개다.

| 화면 | 전 | 후 |
| --- | --- | --- |
| 표, 칸에 커서 | [PNG](assets/object-editing-1706/entry-before-table.png) | [PNG](assets/object-editing-1706/entry-after-table.png) |
| 표의 기타 메뉴 | [PNG](assets/object-editing-1706/entry-before-table-menu.png) | [PNG](assets/object-editing-1706/entry-after-table-menu.png) |
| 이미지 | [PNG](assets/object-editing-1706/entry-before-image.png) | [PNG](assets/object-editing-1706/entry-after-image.png) |
| 이미지 속성 | [PNG](assets/object-editing-1706/entry-before-image-properties.png) | [PNG](assets/object-editing-1706/entry-after-image-properties.png) |
| Mermaid | [PNG](assets/object-editing-1706/entry-before-mermaid.png) | [PNG](assets/object-editing-1706/entry-after-mermaid.png) |
| Mermaid 속성 | [PNG](assets/object-editing-1706/entry-before-mermaid-properties.png) | [PNG](assets/object-editing-1706/entry-after-mermaid-properties.png) |
| 수식 | [PNG](assets/object-editing-1706/entry-before-equation.png) | [PNG](assets/object-editing-1706/entry-after-equation.png) |
| 수식 속성 | [PNG](assets/object-editing-1706/entry-before-equation-properties.png) | [PNG](assets/object-editing-1706/entry-after-equation-properties.png) |

그 밖의 후 화면: [이미지 교체](assets/object-editing-1706/entry-after-image-replace.png), [이미지 블록 메뉴](assets/object-editing-1706/entry-after-image-menu.png), [빈 그림 속성](assets/object-editing-1706/entry-after-pending-properties.png), [어두움](assets/object-editing-1706/entry-after-mermaid-properties-dark.png), [640px 아이콘](assets/object-editing-1706/entry-after-image-640.png), [영어](assets/object-editing-1706/entry-after-image-en.png).

- **목적·사용/비사용:** 선택·읽기와 편집 시작을 구별한다. 선택만으로 속성 폼을 열거나 더블클릭만을 유일한 진입으로 삼지 않는다.
- **현재 기준:** [그림][figure-view]·[수식][equation-view] NodeView와 [표](table-interaction-v1.md#whole-table-tools-793)의 객체 도구 줄, [미주][footnote-view] 상시 버튼과 [미주 계약](footnotes-v1.md#editor)의 예외.
- **사용처:** U01–U12 그림·원문·표·미주·inline·절 label·직접 본문 입력, U17 선택 toolbar.

코드 블록의 상시 Copy code와 언어 control은 [복사 계약](document-editing-v1.md#code-body-copy-991)을 따른다.

## P04 적용·취소·완료

- **목적·사용/비사용:** 편집을 언제 문서에 반영하는지 드러낸다. 파일 생성·삭제·복구에 metadata의 바깥 클릭 적용 규칙을 쓰지 않는다(P12).
- **현재 기준:** 그림·표·수식·절 label이 공유하는 `MetadataProperties`의 Done·Esc 취소·유효한 바깥 pointer 적용. 키보드 focus/Save만으로 적용하지 않으며 오류 때 폼·값을 유지하고, 바깥 적용은 클릭한 위치의 focus를 유지하며, 포인터 탭 전환으로 문서가 숨겨져도 해당 문서의 완료를 마친다. 별도 dialog 안의 Cancel·Keep editing·Settings 클릭과 읽기 전환·명령 센터 열기(#849)는 바깥 완료에서 제외하고 폼·초안을 유지한다. 표의 번호 입력은 P02 그대로다. 기존 [FigureProperties][figure]의 image chooser·busy guard와 [PropertyForm][forms]을 쓰는 원문/인라인 수식의 명시적 적용·취소. [미주](footnotes-v1.md#editor)의 완료/취소(Done/Cancel)와 기존 in-place·바깥 적용·키보드 동작. 링크·교차참조는 Apply/Cancel·Esc 취소·바깥 클릭 유지이며, 변경된 초안은 같은 문서의 다른 폼과 독립적으로 기존 draft 안내·Save/Source의 적용 내용 구분·탭 전환 보존·close 보호에 참여한다([초안 계약](editing-session-save-v1.md#applied-content-and-drafts)). 인용은 보이는 Cancel 없이 blur로 닫히는 기존 동작을 유지한다.
- **사용처:** U01–U13 문서 안 편집·설정, U23–U24 파일 작업·미저장 확인과의 경계.

속성 팝오버에는 필드와 Done만 있다. 팝오버가 열린 채 도구 줄의 원문 편집을 누르면 수식·Mermaid 모두 유효한 label·번호를 먼저 적용하고 원문 폼을 연다. 그 객체의 도구 줄 클릭은 바깥 클릭 적용으로 치지 않는다. 원문 취소는 그 뒤의 초안만 버린다. 오류·열린 폼 재진입은 초안을 유지하고 원문 편집 중 metadata 진입은 숨긴다([편집 계약](document-editing-v1.md#continuous-editing)). 미주의 Enter 적용/Shift+Enter 줄바꿈은 [미주 계약](footnotes-v1.md#editor)을 따른다.

## P05 입력칸·placeholder·위계

- **목적·사용/비사용:** 짧은 속성 입력을 찾기 쉽게 하되 중첩 경계를 줄인다. 문서 입력·원문·모달 전체에 경계 제거를 전파하지 않는다.
- **현재 기준:** [그림 속성 필드][figure-view]의 subtle fill·hover/focus border를 `PropertyForm`/`BlockProperties`의 표·절 label·수식/원문 metadata와 링크의 짧은 text field에 공유한다. label은 상시 표시하며 기존 32px field·28px action·6px radius와 token을 사용한다. 원문 textarea(인라인 LaTeX 포함), 제목·caption과 독립 모달의 핵심 입력은 기존 경계를 유지한다. 교차참조의 target은 text field가 아닌 select로 기존 경계·후보 동작을 유지한다. 인용은 전용 변경 없이 공용 스타일만 따른다(ADR-0008 동결).
- **사용처:** U01–U14 문서 속성·inline·설정, U19 코드 언어·callout, U22–U23 앱 설정·파일 모달.

비서 입력창은 같은 자리의 공통 `Button`(`icon-sm`) 하나를 유지한다(#1485). 대기 중에는 전송, 응답 중 빈 입력에는 중지, 글·첨부가 있으면 진행 중 작업에 추가한다. steer를 지원하지 않는 Copilot은 응답 중 항상 중지다. 전송은 기본 variant·ArrowUp, 중지는 outline·Square를 쓰며 접근 가능한 이름·Tooltip도 함께 바뀐다.

Copilot 선택도 Host SettingsSelect·모델 Dialog를 사용하며 Codex 전용
skills·진단 항목은 숨긴다. 같은 SettingsSelect로 추론 강도·쓰기 범위를 표시하고 기존 비서 DropdownMenu에서 Agent/Plan을 고른다([비서 계약](main-agent-v1.md#권한-모드)).

공식 [AI 설정](main-agent-v1.md)은 Appearance/Recovery와 같은 Settings
콘텐츠·control 폭과 공용 Input/select/Button을 사용한다. 프로바이더의 이름·상태는
공용 ghost Button에 `justify-start`를 명시해 각 행의 같은 왼쪽 축에 놓고 진단은 오른쪽에 둔다.
저장 중·실패는 기존 status/alert로 보이며 저장 완료 상시 문구는 두지 않는다.
목록 대화상자는 기존 Dialog의 닫기·포커스 복귀를 사용한다.

placeholder는 예시·빈 값 표시이며 label·필수 조건을 대신하지 않는다. 필요한 제약은 label 가까이 둔다. AI 설정의 값·자동 저장은 [비서 계약](main-agent-v1.md#연결과-설정)이 소유한다.

## P06 빈 상태와 작성 시작

- **목적·사용/비사용:** 무엇이 비었는지와 다음 행동을 보여 준다. UI 안내를 실제 문서 콘텐츠로 저장하거나 빈 작성 자리를 모두 숨기지 않는다.
- **현재 기준:** [DocumentTitle](../../apps/editor/src/document-title.tsx)은 기존 title slot 높이를 유지하며 작은 UI 서체의 `제목 추가(선택)` / `Add a title (optional)`을 보이고, 입력 즉시 제목 서체로 전환한다. [pending Figure][figure-view]는 `이미지 선택` / `Mermaid 작성` 버튼으로 기존 picker·원문 편집을 연다. 선택 진입·취소만으로 문서 내용을 확정하지 않는다. [빈 caption hint](editor-visual-language-v1.md#state-rules), 빈 본문의 작성 안내와 빈 목록의 항목 안내는 기존 규칙을 유지한다. 검색·자원 목록의 빈 결과와는 구별한다.
- **사용처:** U01/U03–U06 빈 그림·원문·표·미주, U12 제목·본문, U21 검색/탐색, U23/U25 파일·참고문헌 빈 상태.

## P07 입력 오류와 알림 센터

- **목적·사용/비사용:** 고칠 입력과 문서·앱 문제를 구별하고 문제 위치로 이동시킨다. 입력칸 오류를 알림 센터만으로 대체하지 않으며 저장 거부/허용 정책을 바꾸지 않는다.
- **배치:** [Layout Rules의 알림 배치](editor-layout-rules-v1.md#title-strip-notifications-1644)를 따른다.
- **현재 기준:** [NotificationCenter](../../apps/editor/src/components/ui/notification-center.tsx)는 창의 App 인스턴스에 하나만 둔다(#792). 알림이 없어도 중립 버튼이 항상 보이고, 열면 “알림 없음” / “No notifications”를 표시한다. 열린 모든 문서의 적용된 번호 경고·저장 실패·지속 파일/Host 오류·앱 메시지와 적용된 Mermaid 렌더 실패를 모은다. 문서 이름과 문제 위치 이동을 제공하며 위치 없는 앱 메시지는 이동 없이 표시한다. [MessageArea](../../apps/editor/src/shell/MessageArea.tsx)는 기존 메시지의 등록·일회 안내 만료를 맡는다. 미적용 초안의 Save/Source 범위 설명은 아래 탭 줄 상태 표시로 제공한다(#839 소유자 결정). 문서 상단/번호 폼 대신 센터에 경고를 표시하며 저장 실패의 기술적 상세·다중 위치 탐색과 문서 안 빨간 테두리는 유지한다.
- **현재 생명주기:** 새 경고·오류만 focus 없이 목록을 펼친다. 원인별 안정적인 ID를 쓰며 샘플 준비·복구 저장소 등 독립 원인을 합치지 않는다. 토글의 이름·툴팁은 “알림” / “Notifications”이며, 접근성 설명은 알림이 있으면 최고 심각도·개수, 없으면 “알림: 없음” / “Notifications: none”을 포함하고, 새 항목은 펼침과 독립된 polite live region에서 한 번 알린다. 접은 목록은 항목 제거·안내 추가로 다시 펼쳐지지 않는다. 마지막 알림이 없어지면 자동으로 접으며, 사용자가 마지막 항목을 닫으면 알림 버튼으로 focus를 돌린다(#986). 같은 종류가 둘 이상이면 접힌 묶음으로 모으고 한 항목이면 기존 행을 유지한다(#1005; 아래 기준). 일회 안내는 기존 5초 수명과 Undo를 유지한다. 원인 제거 시 항목을 없애고, 닫은 원인은 탭 전환·무관한 편집에서 숨김을 유지하다가 제거 후 재발하면 다시 표시한다. 탭을 닫으면 그 탭의 원인도 제거한다. 알림·접힘·숨김은 창 메모리에만 두고 문서·복구 기록에 쓰지 않는다. 저장 실패는 기존 계약대로 다음 성공한 Save가 해소하며, 편집 후 위치가 낡으면 재저장을 안내한다. Core/Host의 저장 허용·거부를 재판정하지 않는다.
- **남기는 문맥 표시:** 미적용 초안은 탭 줄의 저장 버튼 왼쪽에 `미적용 초안` / `Unapplied draft` 상태로 표시한다. 1440px에서는 글자, 640px 및 compact 그룹에서는 아이콘만 보인다. hover·keyboard focus 시 기존 Save/Source 안내 전문을 보여 주며 접근성 이름에도 짧은 이름과 전문을 포함한다. 읽기·편집·소스 모두 같은 문서의 상태를 표시하고 기존 미저장 점과 구분한다. 일회 안내·알림 센터 항목·초안 위치 이동 동작으로 만들지 않는다. 표시·해제 시 문서 좌표와 native scroll이 변하지 않으며 초안이 없는 평소에도 문서 위 빈 공간을 확보하지 않는다. 입력칸 오류·Mermaid **초안** 미리보기 오류는 폼에 유지한다. 파일 picker의 경로/이름 오류·Settings 선택값 저장 오류는 해당 입력 피드백이다. 열린 Source/Recovery 비교 등의 읽기 실패는 그 화면 상태를 설명하는 P12 문맥 정보여서 화면 안에 둔다. 참고문헌 completeness는 ADR-0008 동결 범위를 유지한다. 블록의 짧은 미리보기 불가 표시는 위치 표식이며 상세 실패를 중복 출력하지 않는다. 폼 입력칸 연결은 아래 현재 기준을 따른다.
- **진행 알림 정리:** Open 완료·취소처럼 모든 알림 producer가 제거되어 빈 상태로 돌아오면 polite live region의 이전 안내문도 지운다. 정상 문서 열기 뒤의 초기 무음 계약을 유지하며, 경고·오류의 재발 안내는 기존 원인 수명을 따른다.
- **현재 기준 — 입력칸:** `FieldError`의 짧은 오류문을 해당 입력 바로 아래에 두고, 입력의 `aria-invalid`와 고유한 `aria-describedby`로 연결하며 거절된 값을 보존한다. 그림의 label·이미지 경로·alt·파일 이름, Mermaid 원문의 빈 값·label, 수식·표·절 label, 인라인 LaTeX·링크 URL과 기존 NumberField 오류가 이 표현을 쓴다. label 중복은 Core 거절을 표시하고 번호 제출 규칙은 #776 그대로다. 특정 입력으로 귀속할 수 없는 폼 내부 Host/검증 실패 Notice는 폼 문맥에 유지하고, 적용 문서 경고는 위 창 단위 센터로 보낸다. 기존 인용 오류 동작은 동결 범위로 유지한다.
- **사용처:** U01–U16 문서 폼·번호·메시지·렌더 실패, U22–U25 설정·파일·복구·참고문헌 알림.

### 같은 종류 묶음과 마지막 닫기

같은 등록 출처·문서 문맥·심각도·기존 메시지 유형의 알림이 둘 이상이면
기본 접힌 한 묶음으로 표시한다. `numbering-warning`, `mermaid-error` 등 기존
`testId`를 생산자가 이미 제공하는 유형 값으로 재사용한다. 유형을 특정하지 않는
error/notice/writeability-warning 및 유형 없는 메시지는 문구도 같아야 묶는다.
다른 문서나 등록 출처는 합치지 않는다. 등록 API·원인 ID·문서 의미는 변경하지 않는다.

묶음은 종류와 개수, 문서 대상을 표시한다. 기존 ghost/sm Button과 Lucide chevron으로
Enter/Space·클릭 펼치기/접기를 제공하고 `aria-expanded`/`aria-controls`로 연결한다.
묶음의 문서 문맥은 머리글에 한 번만 표시하고 내부 항목에서는 반복하지 않는다.
단일 알림은 기존 문맥 줄을 유지한다. 펼치면 원래 항목의 위치 이동·개별 닫기를 제공하며, 묶음의 X는 그 묶음만 닫는다.
한 항목만 남으면 기존 행으로 표시한다. 닫힌 원인의 재발 규칙은 기존과 같고,
묶음 펼침 상태도 창 메모리에만 둔다. 개별 닫기 뒤에는 남은 목록 동작으로 focus를
복귀시킨다. 마지막 항목을 닫으면 센터를 접고 알림 버튼으로 focus를 돌린다.
자연 해소·만료로 비면 센터는 접되, 센터 밖에서 편집 중인 focus는 유지한다.
빈 센터 버튼을 직접 열면 #837의 빈 상태 안내를 계속 볼 수 있다.

비서 상태·접수·질문은 [대화와 표시](main-agent-v1.md#대화와-표시), 계정·컨텍스트·사용량은 [질문과 사용량](main-agent-v1.md#질문과-사용량)을 따른다. 공급자 연결·설정 요청 실패는 입력 오류가 아닌 `Notice tone="error"`다. 진단의 일반 label/값은 UI 14/20, 경로·프로토콜은 mono metadata 12/16이다. Host 주소 설명은 12/18, About daemon 값·facts는 Row fact의 type-value-name·type-body를 쓴다. Host footer는 Settings와 같은 16px 슬롯·padding·8px 간격이며 6px 상태 점은 슬롯 중앙에 둔다. 읽기 전용 실행 계정도 Tab focus·Tooltip을 유지한다.

계정·한도는 Context 링의 hover/keyboard-focus Tooltip과 AI Settings에서 같은 부품으로 표시한다. 날짜는 당일이면 시각만, 그 외에는 숫자 월/일과 시각으로 표시하고 연도·초를 생략한다. 로그인 방법과 기간은 지역화한다. 한도 행은 max-w-md Tooltip 안에서 한 줄을 유지한다. 조회 실패는 Tooltip의 짧은 Unavailable이며 전송을 막거나 대화 오류로 보내지 않는다. 성공한 빈 응답은 No usage information으로 표시한다. 개별 잔여량·과금 경고도 같은 짧은 표현을 사용하며 과금 경고는 기존 대비 면 안의 bold text로 표시한다.

## P08 읽기 미리보기

미주 미리보기는 이동 안내 문구 없이 본문을 표시하고 원래 참조의 접근성 이름·클릭 이동을 유지한다([읽기 계약](editor-ux-shell-v1.md#endnote-and-citation-reading-previews-752)).

- **현재 기준:** [ReadingPreview](../../apps/editor/src/ReadingPreview.tsx)의 공통 폭 상한·간격·그룹 경계, Esc dismiss, 입력 중 억제와 focus/selection 비탈취를 유지한다. 오류도 읽기 정보다. 카드 안 Edit/Apply·재귀 preview를 넣지 않으며 긴 콘텐츠를 임의로 생략하지 않는다.

- **목적·사용/비사용:** 미주·인용·상대 이미지 링크를 읽는 중 문맥을 보충한다. 편집 폼이나 일반 URL/교차참조 tooltip·이동을 같은 카드로 바꾸지 않는다.
- **사용처:** U15 미주·인용·이미지 링크 읽기, U08–U10 링크·인용·교차참조의 읽기 진입 경계.

## P09 metadata와 블록 도구

편집기 본문과 읽기 전용 문서 보기는 같은 블록 윤곽으로 블록의 범위를 표시한다. `ui.LinkedDocumentView`는 문서 보기와 자료 영역 양쪽의 대응 항목에 같은 윤곽을 적용한다. [상태 색](editor-visual-language-v1.md#블록-윤곽과-연결-띠)과 [배치 기준](editor-layout-rules-v1.md#alignment-and-ownership)을 따른다.

- **목적·사용/비사용:** 짧은 속성과 구조 작업의 진입을 구분한다. 표의 행·열 선택 도구나 미주 복귀 번호를 일반 metadata 도구로 대체하지 않는다.
- **현재 기준:** [그림][figure-view]·[수식][equation-view] NodeView의 객체 도구 줄(P03)과 높이를 차지하지 않는 metadata. [표 #793](table-interaction-v1.md#whole-table-tools-793)은 가로 스크롤 밖 상단 행에 속성 버튼과 metadata를 둔다. 표 전용 기타 메뉴는 없으며 삭제는 다른 객체처럼 블록 메뉴와 선택 뒤 Delete로 한다. 표는 앞 문단·열 핸들과 겹치지 않도록 상단 행의 공간을 항상 확보하며 도구 표시로 본문 높이를 바꾸지 않는다. 행·열 손잡이를 표시해도 캡션 간격은 유지한다. 본문 폭 원문 폼은 속성 팝오버와 별도 표면이다(#788).
- **사용처:** U01–U06 그림·수식·표·미주, U11 절 label, U18 블록/표 구조 도구.
- **본문 진입 (#223):** 본문 우클릭과 편집기 안 Shift+F10·메뉴 키도 U18의 기존 여백 핸들 블록 메뉴를 연다. 표·그림·수식도 같은 항목·명령·Undo/Redo를 쓰고, 그 앞에 객체 도구 줄과 같은 이름의 속성·내용 항목이 온다([본문 메뉴 계약](editor-ux-shell-v1.md#body-block-context-menu-223)).

편집 모드 제목 깊이 H1–H6은 왼쪽 여백에 상시 표시하고 같은 줄 블록 핸들이 보일 때만 숨긴다. 읽기·소스·텍스트 모드에서는 숨긴다. 표현은 [Visual Language 상태 규칙](editor-visual-language-v1.md#state-rules)이 소유한다. 글 흐름의 focus 막대 범위도 해당 계약을 따른다.

Mermaid 종류 배지는 metadata 서체·text 대비·muted 표면을 사용하며 선택 상태에는 interaction-soft fill·interaction border를 더한다. 상단 공간을 확보해 앞 블록 선택 테두리와 겹치지 않는다.

## P10 메뉴와 선택 도구

ContextMenu 항목 실행 뒤 닫힐 때 focus가 메뉴 안이나 body에 남아 있으면 trigger로 복귀한다. 동작이 메뉴 밖 입력칸·대화상자 등으로 focus를 옮겼으면 유지한다. 사라졌거나 focus를 받을 수 없는 trigger에는 복귀하지 않는다. 항목 실행 없는 Esc·바깥 클릭의 닫기 동작은 기존 공통 부품을 따른다.

- **현재 기준:** [CommandMenu](../../apps/editor/src/CommandMenu.tsx)와 [공용 메뉴 행](editor-ux-shell-v1.md#unified-action-menus-516)을 유지한다. 같은 action의 icon·문구·disabled 이유를 맞춘다. 값 선택에는 current check, 서식에는 pressed, 실행에는 동사를 쓴다. 검색 active와 선택된 값은 구별한다.

- **목적·사용/비사용:** 동작·값 선택·검색을 구별한다. combobox·tree·toolbar를 모양 때문에 하나의 menu로 합치지 않는다.
- **선택지 묶음 (#1034):** 문서 보기·번호 방식·갤러리는 기존 Button 세그먼트를 일반화한 내부 ChoiceGroup을 사용한다. 필수 단일 선택과 Tab/Enter/Space 계약·토큰을 보존한다. U17 독립 서식, U18 표 selection/메뉴, U21 탭 키보드 소유권은 그대로 유지한다([선택지 분류](ui-decision-table-v1.md#선택지-분류)).
- **추가 사용처 (#798):** Sidebar 하단 설정 바로 아래 별도 색상 모드 행(#912)은 고정 SunMoon 아이콘과 오른쪽의 흐린 현재 값을 표시하며 접히면 색상 모드 이름의 아이콘만 보인다. 메뉴는 공용 menu surface·행과 Base UI radio 선택을 사용한다. 현재 값의 check와 키보드 focus를 구별하며 Settings·명령 센터와 같은 저장·적용 경로를 쓴다([계약·검증](editor-ux-shell-v1.md#color-mode-entry-798)).
- **메뉴 쌓임 (#223):** 공용 CommandMenu는 고정 문서 viewport의 stacking context 밖 Portal에서 파일·탭 메뉴와 같은 층을 쓰므로 알림 버튼이 행을 가리지 않는다. 원래 문서의 위치·스크롤·그룹 경계와 미주 소유권을 유지하며, 표는 기존 Popover Portal을 유지한다. 알림 버튼의 위치·동작은 바꾸지 않는다.
- **사용처:** U17 서식 toolbar, U18 블록·표 메뉴, U19 코드 언어/callout, U20 파일·탭 메뉴, U21 검색·탐색, U09–U10 인용·참조 후보.
- **본문 메뉴 경계 (#223):** U18은 마우스 위치 또는 현재 블록의 커서 옆에서 같은 CommandMenu를 쓰고 문서 viewport 안으로 배치한다. 선택된 글자 안·입력칸·코드/수식 원문·읽기/읽기 전용에서는 기본 메뉴를 유지하며 클립보드 항목은 추가하지 않는다. 선택 밖 우클릭은 대상 커서/블록으로 이동한다. Esc·닫기는 편집기 선택/focus를 복원하고 다른 control 클릭은 정상 focus 인계를 유지한다. 파일·탭 우클릭과 폴더·Outline은 바꾸지 않는다.
- **선택·overlay 위치 (#838):** 선택 툴바는 선택 글자를 가리지 않도록 위 공간이 부족하면 아래로 뒤집고, 선택이 콘텐츠 viewport 밖이면 숨긴다. 스크롤로 돌아오면 기존 선택의 툴바를 다시 보인다. 같은 경계 훅의 링크·교차참조·인용 폼, slash 메뉴와 읽기 미리보기도 대상과 겹치지 않는 쪽에 배치한다. 초안의 유지·적용·Esc 취소는 P04 그대로다. 치수·화면 밖 폼의 기존 접근은 [Layout Rules](editor-layout-rules-v1.md#alignment-and-ownership)를 따른다.

하위 폴더 삭제·휴지통 미지원 이유와 트리 키보드는 [Shell 계약](editor-ux-shell-v1.md#child-folder-trash-1401), Codex 스킬 후보는 [비서 계약](main-agent-v1.md#현재-한계)을 따른다. 숨은 탭 목록은 공용 DropdownMenu로 가려진 탭 수·이름·미저장 상태를 제공하며 키보드 선택으로 탭을 드러낸다.

## P11 선택값·보기·탐색

- **목적·사용/비사용:** 값의 수와 의미에 맞는 선택 표현을 쓴다. 겉모양이 같아도 문서 값·보기 모드·탐색의 role과 저장 범위를 합치지 않는다.
- **현재 기준:** [DocumentActions](../../apps/editor/src/shell/DocumentActions.tsx)의 `읽기 | 편집 | 소스` / `Read | Edit | Source` 보기 segment(#849, 28px track, 탭별 일시 상태). 읽기는 기존 편집기의 입력·도구를 막고 초안을 유지하며, 일반 Markdown 텍스트 탭은 읽기/편집을 제공하고 다른 텍스트 종류에는 전환을 보이지 않는다([계약](editor-ux-shell-v1.md#read--edit--source-849)). [DocumentSettings](../../apps/editor/src/shell/DocumentSettings.tsx)의 문서 값, Settings의 기기 설정. 보기·탐색의 toggle/tablist와 문서 draft는 서로 다른 의미다.
- **사용처:** U09–U10 인용·참조 값, U13–U14 문서 설정·번호, U19–U22 언어/종류·메뉴·보기/탐색·앱 설정.

비서 패널(#931, #1047 PR A)은 U22 AI 설정과 같은 모델·강도 선택을 공유
개별 outline Button에서 공통 DropdownMenu·DropdownMenuItem 목록을 바로 연다(#1110/#1124).
현재 값은 기존 Check 아이콘과 aria-current로 표시하며 radio 상호작용을 추가하지 않는다.
패널의 프로바이더·모델·강도·쓰기 범위·Copilot 모드는 해당 대화에만 적용한다.
프로바이더는 대화 생성 뒤 잠그고 쓰기 범위는 다음 turn부터 적용한다. 실행 중 모델·강도는 잠근다.
대화 언어 선택은 없으며 사용자 메시지 언어를 따른다. U22의 AI 기본 언어는
대화 없이 시작된 작업에만 적용한다. 파일은 Explorer의 ContextMenu **채팅에 추가**로
제거 가능한 초안 칩에 추가하며 `@`는 일반 글자다. 칩에는 파일 이름, 공용 Tooltip에는 전체
경로를 표시한다([현재 계약](main-agent-v1.md#대화와-표시)).

대화 기록은 semibold 제목과 별도 시각·폴더 보조 줄, 전체 경로 Tooltip을 사용한다. 마지막 대화 기억은 [단일 연결 계약](main-agent-v1.md#대화와-표시)을 따른다.

표 보기 값의 문서별 기기 환경설정·checkbox 메뉴·Settings 기본값은 [표 계약](table-interaction-v1.md#per-document-table-presentation-902)이 소유한다. 템플릿 갤러리의 고정 client·목록·미리보기·생성은 [갤러리 계약](document-templates-v1.md#editor-gallery-phase-2)이 소유한다.

## P12 모달·파일·복구·설정 범위

- **현재 기준:** 기존 [UnsavedChangesDialog](../../apps/editor/src/shell/UnsavedChangesDialog.tsx), [DangerConfirmation](../../apps/editor/src/components/ui/danger-confirmation.tsx), 파일 dialog·비교 화면을 유지한다. 제목→대상→설명/문제→명시적 동사 action, 안전한 취소·focus 복귀, busy 중 중복 실행 방지가 기준이다. 앱 Settings는 문서와 오가는 단일 작업 탭, file preview·단축키는 읽기 dialog다.

- **목적·사용/비사용:** 파일·복구·파괴 작업은 대상과 결과를 확인한다. metadata의 Done/바깥 적용을 이식하거나 기기 설정을 문서 Save에 묶지 않는다.
- **사용처:** U22 앱 설정, U23 파일/폴더 picker·새 이름, U24 미저장·삭제·저장/복구 비교, U25 미리보기·단축키·참고문헌 연결.
- **키보드 경계 (#831):** 공용 Dialog는 native Undo/Redo가 modal 밖 입력·초안으로 이동하거나 수정하는 것을 차단한다. modal 안 입력의 자체 Undo/Redo는 유지하고, Escape는 활성 modal만 닫아 바깥 미적용 초안을 보존한다. 명령 센터도 같은 경계를 쓴다. #1032의 Settings 작업 탭도 같은 beforeinput 경계를 재사용하여 두 그룹에서 Settings 입력의 Undo/Redo가 다른 그룹의 문서 초안으로 이동하지 않게 하며, Settings 입력 자체의 native history는 유지한다. 비모달 알림 센터의 문서 history는 유지한다. [현재 Undo 계약](document-editing-v1.md#shared-history-and-editing-boundaries).

설정 탭의 화면 틀은 [DESIGN.md Layout](../../DESIGN.md#layout), 탭 수명·초안 보존·설정 저장 경계는 [Shell 계약](editor-ux-shell-v1.md#settings-task-tab-1032)을 따른다. 파일·폴더 삭제는 [Shell 계약](editor-ux-shell-v1.md#child-folder-trash-1401), 앱 초기화는 [초기화 계약](app-reset-v1.md)을 따른다. 실행 계정은 [Shell 계약](editor-ux-shell-v1.md#활성-host-실행-계정-1199)이 소유한다.

저장·복구 비교의 800px 이하 변경 블록 라벨·문맥 한 번 표시는 [비교 계약](editing-session-save-v1.md#pre-save-visual-comparison-1201)을 따른다. PDF는 transient 이미지 Dialog와 달리 [읽기 작업 탭](editor-ux-shell-v1.md#read-only-pdf-tabs-1337)을 쓴다. 공급자 원본 로그는 별도 열람면 없이 기존 Button·Tooltip으로 외부 열기·파일 위치를 제공하며 [Desktop 지원 경계](main-agent-v1.md#현재-한계)를 따른다.

플러그인 화면의 파일·PDF·문서·폴더 선택도 U23의 기존 FolderDialog를 재사용한다. 목록·이동 줄·시작 위치·선택 footer의 공통 배치와 조작은 [선택 창 계약](folder-picker-v1.md)을 따른다. 일반 파일의 Root 범위·필터·취소는 [화면 계약](plugin-screens-v1.md#파일폴더-선택과-문서-열기)을 따른다.

### 플러그인 설정

플러그인 목록은 공통 상태 점/톤과 톱니·스위치 배치를 사용하며 꺼진 플러그인도 정보·설정에 진입한다. 화면 진입은 사이드바이며 설정에 화면 이동 버튼이나 “동작 · 이름” 합성 라벨을 두지 않는다.

목록은 이름 아래에 버전과 설명을 표시한다. 설정 창은 이름·설명 → schema 선언 순서의 일반 설정 → secret → 연결 확인 → 제거 → 접힌 상세(신뢰·digest) 순서다. 일반 설정과 secret의 title은 label, description은 hover/keyboard-focus Tooltip이다. 목록의 실행 중·설치됨·오류·사용 불가는 Status plain으로 표시하고 켜짐은 기존 스위치로 조작한다. 폭은 settings-content-width와 viewport 양쪽 16px 여백을 사용한다.

일반 설정은 Dialog 안의 Row·Input·SettingsSwitch·FieldError를 사용한다. 필드별 저장 중·저장됨·실패를 가까이에 표시하고 실패 시 초안을 보존한다. 연결 확인은 순차 저장 완료 뒤 저장값으로 실행하며 저장 실패·꺼짐·미실행이면 막고 이유를 Tooltip으로 보인다. secret은 password Input에 명시적으로 저장한 뒤 비우며 값을 재조회하거나 비서에 입력하지 않는다. 목록 갱신은 picker 초안·focus를 초기화하지 않으며 선택한 등록이 외부에서 제거될 때만 Dialog를 닫고 Notice를 보인다.

첫 켜기 확인의 registrationId·신뢰 수명과 secret 저장은 [플러그인 계약](plugin-stage1-v1.md#수명과-공용-작업), [설정·비밀값 계약](plugin-stage1-v1.md#설정비밀값비서-지침)이 소유한다. PluginIcon은 사이드바·탭·제목 행의 장식용 16px img를 공유하고 비율을 contain하며 기존 화면 아이콘으로 fallback한다. 형식·크기·Host 전달은 [신분증 계약](plugin-stage1-v1.md#신분증), 화면 부품은 [화면 계약](plugin-screens-v1.md#화면-부품)이 소유한다.

### 비서 질문과 보조 작업

탐색기와 비서의 펼친 머리는 PanelHeader를 쓰고 접힌 탐색기는 기존 레일을 유지한다. 패널 머리와 문서 패널의 탭 줄은 가운데 문서 탭 줄의 높이 토큰을 함께 써 아래 경계를 맞춘다. 이름과 동작은 세로 가운데이며 좌우 여백은 내용의 기존 시작선에 맞춘다(탐색기 목록 줄의 안쪽 시작선, 비서의 맥락·대화 시작선). TaskHeader와는 좌우 여백·구분선만 공유하고 작업 탭의 높이·세로 여백은 별도로 유지한다. 비서 도구 줄은 native details/summary와 plain Status를 쓰며 완료에는 점을 표시하지 않는다. outline sm Button·Lucide ArrowDown을 재사용한다.

좁은 창 비서의 Tab·Escape·이전 편집 focus 복귀와 넓은 창 비모달 패널은 [비서 계약](main-agent-v1.md#대화와-표시)을 따른다. 질문은 과정 밖의 기존 AssistantQuestion fieldset/radio·Input/Button을 사용하며 답변 뒤 같은 카드에 읽기 전용 기록을 남긴다. 끝난 차단 RPC는 입력을 닫고 콜백을 복원하지 않는다. 렌더 확인은 카드가 mount된 창에서만 보내고 숨김 패널·기록 목록에서는 보내지 않는다([질문 계약](main-agent-v1.md#질문과-사용량)).

### 비서 패널 시각 확인 (#1686)

fixture 공급자로 한국어의 1440px 밝음·어두움과 640px 밝음을 확인했다. 실제 AI 호출이나 소유자 시각 승인은 포함하지 않는다. 경로·실행 계정은 촬영 시 가렸다. 탐색기 접기/펼치기의 키보드 focus, 보이는 머리의 높이·여백·구분선 비교와 도구 상태 문구·tone은 브라우저 검사로 보호한다. 파일 트리와 좁은 창의 기존 overlay 수명은 유지한다.

| 화면 | 1440 밝음 전 / 후 | 1440 어두움 전 / 후 | 640 밝음 전 / 후 |
| --- | --- | --- | --- |
| 빈 비서 | [전](assets/panel-headers-assistant-1686/before-empty-1440-light-ko.png) / [후](assets/panel-headers-assistant-1686/after-empty-1440-light-ko.png) | [전](assets/panel-headers-assistant-1686/before-empty-1440-dark-ko.png) / [후](assets/panel-headers-assistant-1686/after-empty-1440-dark-ko.png) | [전](assets/panel-headers-assistant-1686/before-empty-640-light-ko.png) / [후](assets/panel-headers-assistant-1686/after-empty-640-light-ko.png) |
| 문서 패널 | [전](assets/panel-headers-assistant-1686/before-document-1440-light-ko.png) / [후](assets/panel-headers-assistant-1686/after-document-1440-light-ko.png) | [전](assets/panel-headers-assistant-1686/before-document-1440-dark-ko.png) / [후](assets/panel-headers-assistant-1686/after-document-1440-dark-ko.png) | [전](assets/panel-headers-assistant-1686/before-document-640-light-ko.png) / [후](assets/panel-headers-assistant-1686/after-document-640-light-ko.png) |
| 도구 상태 | [전](assets/panel-headers-assistant-1686/before-work-1440-light-ko.png) / [후](assets/panel-headers-assistant-1686/after-work-1440-light-ko.png) | [전](assets/panel-headers-assistant-1686/before-work-1440-dark-ko.png) / [후](assets/panel-headers-assistant-1686/after-work-1440-dark-ko.png) | [전](assets/panel-headers-assistant-1686/before-work-640-light-ko.png) / [후](assets/panel-headers-assistant-1686/after-work-640-light-ko.png) |
| 질문·결과 | [전](assets/panel-headers-assistant-1686/before-cards-1440-light-ko.png) / [후](assets/panel-headers-assistant-1686/after-cards-1440-light-ko.png) | [전](assets/panel-headers-assistant-1686/before-cards-1440-dark-ko.png) / [후](assets/panel-headers-assistant-1686/after-cards-1440-dark-ko.png) | [전](assets/panel-headers-assistant-1686/before-cards-640-light-ko.png) / [후](assets/panel-headers-assistant-1686/after-cards-640-light-ko.png) |
| 대화 기록 | [전](assets/panel-headers-assistant-1686/before-history-1440-light-ko.png) / [후](assets/panel-headers-assistant-1686/after-history-1440-light-ko.png) | [전](assets/panel-headers-assistant-1686/before-history-1440-dark-ko.png) / [후](assets/panel-headers-assistant-1686/after-history-1440-dark-ko.png) | [전](assets/panel-headers-assistant-1686/before-history-640-light-ko.png) / [후](assets/panel-headers-assistant-1686/after-history-640-light-ko.png) |

640px 탐색기: [전](assets/panel-headers-assistant-1686/before-explorer-640-light-ko.png) / [후](assets/panel-headers-assistant-1686/after-explorer-640-light-ko.png).

## 알려진 불일치

공통 표현의 남은 불일치는 [DESIGN.md의 알려진 불일치](../../DESIGN.md#알려진-불일치)에서 추적한다. 이 목록은 전 화면 실행·시각 승인을 뜻하지 않는다.

## 데이터 표 정렬·필터

현재 공용 [DataTable](../../apps/editor/src/components/DataTable.tsx)의 화면 조작이다. 갤러리의 Tables와 코드 화면 부품이 사용하며 모든 제품 표의 동작을 뜻하지 않는다.

### 정렬

별도 명세 설정 없이 기본 제공한다. 열 머리글의 정렬 버튼을 누르면 해당 열의 오름차순 → 내림차순 → 원래 순서로 순환한다. 다른 열을 선택하면 그 열의 오름차순으로 바뀌며 한 번에 한 열만 정렬한다. 원래 순서는 부품에 전달된 행 순서다. 동률은 이 순서를 보존한다.

숫자는 수치, 날짜는 유효한 날짜/시각 값, 문자열은 현재 UI 언어의 locale 비교, boolean은 false < true로 비교한다. null·빈 문자열은 두 방향 모두 끝에 두며 0·false는 빈 값이 아니다. 공백 문자열을 자동으로 빈 값으로 바꾸지 않는다. 원자료는 수정하지 않고 표시용 행 인덱스만 정렬한다. 정렬된 열에는 방향 표시와 `aria-sort`를 제공하며 미정렬은 none으로 표현한다. 버튼은 Enter/Space로 조작 가능하고 focus 표시를 유지한다. 별도 필터 버튼 조작이 정렬을 함께 바꾸지 않아야 한다.

### 열별 필터

표 위 전체 텍스트 검색 상자 대신 각 열 머리글의 필터 버튼에서 공통 popover를 연다. 필터 버튼에는 열 이름을 포함한 접근 가능한 이름, 열림 상태·적용 여부를 제공한다. 키보드로 열기·입력·선택·적용·닫기가 가능하며 Escape로 닫으면 해당 버튼에 focus를 돌려준다. 수정 초안은 적용/취소로 확정하고 잘못된 범위는 공통 필드 오류로 표시하며 기존 적용 조건을 유지한다.

| 값 타입 | 기본 조건 |
| --- | --- |
| 문자열 | 기본은 고유값 체크 목록(값 선택), 대소문자 구분 없는 포함 텍스트로 전환 가능. 목록이 길면 목록 안에서 검색하며 검색은 후보를 좁힐 뿐 행 조건을 별도로 추가하지 않음 |
| 숫자·날짜 | 이상·이하의 양끝 포함 범위. 한쪽만 입력 가능, 하한 > 상한은 오류. 날짜는 타입의 날짜/시각을 비교하고 원자료를 문자열 정렬하지 않음 |
| boolean | Any / Yes / No. Any는 모든 비어 있지 않은 값, Yes는 true, No는 false |
| 공통 빈 값 | 활성 필터에 `빈 값 포함` 선택 제공. 빈 값은 null 또는 빈 문자열이며 선택 여부로만 통과 결정 |

필터가 없으면 빈 값도 포함한 모든 행을 보여 준다. 값 선택 모드의 새 초안만 전체 고유값과 빈 값 포함으로 시작한다. 포함 텍스트·숫자·날짜 범위의 새 초안은 빈 값 포함을 기본 해제한다. 새 문자열 초안을 값 선택에서 포함 텍스트로 바꿀 때도 기본 해제하되 사용자가 직접 바꾼 빈 값 선택은 유지한다. 어느 모드든 조건 입력 없이 적용하면 필터 없음으로 유지하며, 값 선택에서 모든 값과 빈 값을 다시 포함하면 필터를 제거한다. 이미 적용된 필터는 다시 열 때 모드·조건·빈 값 선택을 보존한다. 빈 값만 보고 싶으면 값 목록의 비어 있지 않은 항목을 모두 해제하고 빈 값 포함을 선택한다. 범위·boolean 필터에서도 같은 효과를 선택할 수 있는 `빈 값만` 선택을 제공한다. 고유값 후보는 현재 불러온 원행에서 구하며 다른 열의 필터 때문에 후보를 없애지 않는다. 목록 선택은 typed 값으로 비교한다. 문자열 포함 텍스트만 대소문자를 구분하지 않고, 고유값 선택은 원값 그대로 구별한다.

여러 열은 AND로 결합한다. 적용된 열 머리글에는 필터 표시를 남기며 조건이 있을 때만 `모든 필터 지우기`를 제공한다. 이 버튼은 정렬을 바꾸지 않는다. 필터 후 정렬하고 그 뒤 화면 페이지를 나눈다. 결과 행 수는 표시 대상 수 / 불러온 원행 수로 표시하고 결과가 없으면 공통 빈 상태를 쓴다. 전체 텍스트 검색 상자는 이번 구현 요구에 넣지 않는다.

### 상태·페이지·저장 경계

정렬·필터 상태는 앱의 표 인스턴스가 소유하는 화면 보기 조작이다. 원자료·호출 입력를 변경하지 않으며 추가 Host 조회를 일으키지 않는다. AGENTS의 Editor 전용 interaction으로 CLI parity 대상이 아니다. 다시 mount할 때마다 원래 순서·필터 없음으로 시작한다. 행 또는 열이 바뀌면 상태를 초기화한다. UI locale 변경은 현재 문자열 정렬을 다시 비교한다.

### 예시: 갤러리와 검증

갤러리의 좁은 표·넓은 표·열별 정렬·필터 예제는 숫자·날짜·문자열·boolean, null/빈 문자열·동률·여러 열 조건을 포함한다. 열 개수는 부품 이름이나 상한이 아니다.

공통 부품·갤러리에서 동작을 확인한다. 실제 조작으로 정렬 순환·키보드·aria-sort, 열 필터 AND·빈 값·초기화·행 수·빈 상태·불러온 행 안내을 확인한다. 원자료·Core 결과 불변을 확인하며 화면 locale 비교를 Core 계산 규칙에 이식하지 않는다. 타입 조합 검사는 공통 부품 계층에 모으고 같은 경우를 모든 화면에서 반복하지 않는다.

[decision]: https://github.com/litzio/litzio/issues/777#issuecomment-6510554436
[inventory]: ../reviews/ui-pattern-inventory-777.md
[usage]: ../reviews/ui-pattern-inventory-777.md#사용처-지도
[figure-view]: ../../apps/editor/src/node-views/figure-view.tsx
[equation-view]: ../../apps/editor/src/node-views/equation-view.tsx
[footnote-view]: ../../apps/editor/src/node-views/footnote-definition-view.tsx
[figure]: ../../apps/editor/src/figure-properties.tsx
[forms]: ../../apps/editor/src/block-properties.tsx
[number]: ../../apps/editor/src/numbering-properties.tsx

## 공용 정보 표시

이름·값과 컨트롤 한 줄은 Row, 여러 줄의 묶음은 Section, 패널 머리는 PanelHeader, 점과 사람의 말로 된 상태는 Status를 쓴다. 본체와 플러그인은 같은 구현이며 [DESIGN 규칙](../../DESIGN.md#components)과 [화면 API](plugin-screens-v1.md#공용-정보-부품)를 따른다. 현재 본보기는 개발 갤러리 Shared parts다. 기존 SettingsRow 사용처는 Row 별칭으로 함께 바뀐다. 설정 사실 목록·묶음도 같은 Row·Section·Status를 사용하며, 패널 머리·비서 상태는 같은 PanelHeader·Status를 사용한다. 플러그인 제작 템플릿과 갤러리의 화면 예제는 Row·Section·Status plain을 쓴다. 대화상자는 구역 제목, 필드 이름은 항목 이름, 설명은 본문 크기의 흐린 글씨를 쓴다. 파일 선택 창의 묶음 이름·열 제목·선택 footer, 템플릿 갤러리, 시작 화면, 메뉴·알림은 공용 글씨 역할에 연결한다. 사용법은 hover에 두고 저장·복사·손실 범위 안내는 상시 표시한다.

### 설정의 묶음과 줄

설정 다섯 범주와 플러그인 설정 창은 Row·Section·Status plain을 사용한다. 이름은 왼쪽 선,
값과 컨트롤은 내용 폭(행 폭의 60% 이내)으로 오른쪽 끝 선에 맞추며 좁은 부모에서는 이름 아래로 내려간다. 선택·텍스트 입력 컨트롤은 기존 공용 폭을 유지한다. 단일 항목에는
묶음을 만들지 않는다. 정보·업데이트는 로컬 백그라운드 서비스(상태·주소·로그 폴더·상세),
업데이트(버전·현재 상태·동작, 릴리스 채널), 단독 CLI 줄 순서다. 채널은 선택 컨트롤 하나와
선택한 채널 설명만 표시한다. CLI의 PATH 안내는 버튼 hover와 켠 직후의 결과 안내로 보인다.
비서는 AI 공급자·기본값·공통 작업 환경으로 묶고 적용 시점은 기본값 묶음 설명,
대화 없는 작업 범위는 AI 기본 언어 줄 설명에 둔다. 복구 보존·제외 범위는 상시 남긴다.

한국어 전후 캡처(합성 Desktop bridge, 실제 AI 호출 없음):

| 화면 | 1440 밝음 | 1440 어두움 | 640 밝음 |
| --- | --- | --- | --- |
| 표시·언어 | [전](assets/settings-parts-1685/before-settings-appearance-1440-light.png) / [후](assets/settings-parts-1685/after-settings-appearance-1440-light.png) | [전](assets/settings-parts-1685/before-settings-appearance-1440-dark.png) / [후](assets/settings-parts-1685/after-settings-appearance-1440-dark.png) | [전](assets/settings-parts-1685/before-settings-appearance-640-light.png) / [후](assets/settings-parts-1685/after-settings-appearance-640-light.png) |
| 저장·복구 | [전](assets/settings-parts-1685/before-settings-recovery-1440-light.png) / [후](assets/settings-parts-1685/after-settings-recovery-1440-light.png) | [전](assets/settings-parts-1685/before-settings-recovery-1440-dark.png) / [후](assets/settings-parts-1685/after-settings-recovery-1440-dark.png) | [전](assets/settings-parts-1685/before-settings-recovery-640-light.png) / [후](assets/settings-parts-1685/after-settings-recovery-640-light.png) |
| 플러그인 | [전](assets/settings-parts-1685/before-settings-plugins-1440-light.png) / [후](assets/settings-parts-1685/after-settings-plugins-1440-light.png) | [전](assets/settings-parts-1685/before-settings-plugins-1440-dark.png) / [후](assets/settings-parts-1685/after-settings-plugins-1440-dark.png) | [전](assets/settings-parts-1685/before-settings-plugins-640-light.png) / [후](assets/settings-parts-1685/after-settings-plugins-640-light.png) |
| 비서 | [전](assets/settings-parts-1685/before-settings-assistant-1440-light.png) / [후](assets/settings-parts-1685/after-settings-assistant-1440-light.png) | [전](assets/settings-parts-1685/before-settings-assistant-1440-dark.png) / [후](assets/settings-parts-1685/after-settings-assistant-1440-dark.png) | [전](assets/settings-parts-1685/before-settings-assistant-640-light.png) / [후](assets/settings-parts-1685/after-settings-assistant-640-light.png) |
| 정보·업데이트 | [전](assets/settings-parts-1685/before-settings-about-1440-light.png) / [후](assets/settings-parts-1685/after-settings-about-1440-light.png) | [전](assets/settings-parts-1685/before-settings-about-1440-dark.png) / [후](assets/settings-parts-1685/after-settings-about-1440-dark.png) | [전](assets/settings-parts-1685/before-settings-about-640-light.png) / [후](assets/settings-parts-1685/after-settings-about-640-light.png) |
| 플러그인 설정 창 | [전](assets/settings-parts-1685/before-plugin-settings-1440-light.png) / [후](assets/settings-parts-1685/after-plugin-settings-1440-light.png) | [전](assets/settings-parts-1685/before-plugin-settings-1440-dark.png) / [후](assets/settings-parts-1685/after-plugin-settings-1440-dark.png) | [전](assets/settings-parts-1685/before-plugin-settings-640-light.png) / [후](assets/settings-parts-1685/after-plugin-settings-640-light.png) |

플러그인 목록은 기존 Row의 이름 아래 설명 자리에 설치본 버전을 먼저 표시한다. 이어지는 설명과 오른쪽 Status·설정·스위치는 같은 Row 안에 둔다. [한국어 1440px 밝음 기준 화면](assets/plugin-installed-copy-1750/after-1440-light.png).

시작 화면의 복구 기록 목록: 1440 밝음 [전](assets/settings-parts-1685/before-recovery-list-1440-light.png) / [후](assets/settings-parts-1685/after-recovery-list-1440-light.png), 1440 어두움 [전](assets/settings-parts-1685/before-recovery-list-1440-dark.png) / [후](assets/settings-parts-1685/after-recovery-list-1440-dark.png), 640 밝음 [전](assets/settings-parts-1685/before-recovery-list-640-light.png) / [후](assets/settings-parts-1685/after-recovery-list-640-light.png). 캡처의 로컬 경로는 가렸다.

표시·언어의 기기 저장 범위(표시 언어·포인트 색)와 새 문서 표 기본값 설명은 항목 이름의 title로 제공한다. 업데이트 idle 안내는 점 없는 보조 설명이며, 실제 업데이트 상태만 짧은 Status plain으로 표시하고 버전·진행률·실패 사유 등 기존 상세 설명은 별도로 유지한다.

설정 줄의 끝 선과 문서 탭 높이의 패널 머리를 함께 확인한 통합 화면: [1440 밝음](assets/settings-parts-1685/merged-panel-settings-1440-light.png), [1440 어두움](assets/settings-parts-1685/merged-panel-settings-1440-dark.png).
