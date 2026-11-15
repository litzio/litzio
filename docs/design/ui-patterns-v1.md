# 반복 UI 패턴 v1

역할: 반복 UI 동작의 확정 목표·현재 기준·불일치를 관리하며, 시각 표현은 [Visual Language](editor-visual-language-v1.md), 배치·치수는 [Layout Rules](editor-layout-rules-v1.md)를 따른다.

- Status: Draft
- Last verified: 2026-11-16 — #1650 문서 전체와 현재 코드·계약을 정적으로 대조했다. 제품·브라우저 실행 재검증 없음.
- Scope: Editor 반복 UI의 **확정된 목표**, 현재 기준 구현과 알려진 불일치. Draft는 미구현 목표를 Implemented 계약으로 표시하지 않기 위한 상태이며 소유자 결정을 재논의한다는 뜻이 아니다.
- Authority: [AGENTS.md](../../AGENTS.md), [ADR-0001](../adr/0001-single-document-editor-architecture.md), [ADR-0010](../adr/0010-supported-viewport-and-input.md), [#777 소유자 결정][decision]. 현재 동작은 각 Implemented 계약을 따른다. 이 목표가 바꾸는 현재 동작은 아래 후속 이슈에서 구현하고 같은 PR에서 해당 계약을 갱신한다.

## 사용과 갱신

UI 작업 전에 해당 패턴과 **같은 패턴을 쓰는 다른 사용처**를 읽고 확인한다. 새 불일치를 발견하면 같은 PR에서 아래 목록에 ID·패턴·사용처·목표·후속 이슈를 등록한다. 일부 화면에만 먼저 적용하면 나머지 화면의 후속 이슈를 등록한다.

구현 PR은 해당 패턴 절의 현재 기준과 관련 Implemented 계약·검증 근거를 갱신한다. 불일치의 진행 상태는 연결된 GitHub 이슈의 열림·닫힘으로 관리하며 공유 표에 해결/미해결을 표시하거나 구현 진행에 따라 행을 수정·삭제하지 않는다. 목록은 고정된 추적 정보만 유지하고, 새 불일치나 목표·범위·이슈 연결이 바뀔 때 갱신한다([#806](https://github.com/litzio/litzio/issues/806)).

U ID와 파일·화면·캡처의 대응은 [사용처 지도][usage]를 재사용한다. 아래 기준 구현은 **명시한 부분만** 목표에 맞는 현재 구현이며, 컴포넌트 전체가 모든 패턴을 충족한다는 뜻이 아니다. 알려진 불일치 없음은 이 조사 범위에서의 판단이며 전체 동작 재검증을 뜻하지 않는다. 목표의 대안과 과거 근거는 인벤토리에 남긴다.

치수·정렬은 [Layout Rules](editor-layout-rules-v1.md), 색·서체·상태는 [Visual Language](editor-visual-language-v1.md)를 함께 따른다. 지원 최소 폭은 640px이며 키보드·포인터 접근을 유지한다. 문서 의미·Save 허용 여부를 UI가 재해석하지 않는다.

## P01 속성 편집 표면과 위치

- **목적·사용/비사용:** 짧은 속성은 대상 문맥 안에서 고친다. 긴 원문, 미주 본문, 문서·앱 전체 설정을 작은 속성 팝오버에 넣지 않는다.
- **목표:** 짧은 metadata는 대상 전체에 붙는 팝오버, 긴 수식·Mermaid 원문은 본문 폭, 미주는 현재 자리. 문서 설정은 문서 상단, 앱 Settings는 전용 화면이다. 모든 작은 편집면은 Sidebar·Outline을 제외한 해당 문서 콘텐츠 viewport 안에 둔다. 자동 우측 inspector를 열지 않는다.
- **목표:** 블록 수식 label·번호의 작은 진입을 원문 편집과 분리하되 원문 폼에서 둘을 함께 고치는 경로도 유지한다.
- **현재 기준:** [MetadataProperties](../../apps/editor/src/metadata-properties.tsx)를 그림·표·수식·절 label이 공유하며 대상 전체(절 label은 연결된 제목)에 붙인다(#791). `documentContentBounds`를 공유하는 작은 폼의 콘텐츠 경계(#782), Mermaid 원문의 본문 폭, 미주 in-place와 문서/앱 설정의 범위 분리.
- **사용처:** U01–U11 그림·수식·표·미주·inline/절 label, U12 제목, U13 문서 설정, U22 앱 설정.
- **결정·불일치:** [소유자 결정 P01][decision]. 표·절 label의 [D03](#알려진-불일치)은 #791에서 구현했다. 수식의 상단 metadata 진입과 직접 원문 진입 D04는 #788에서 분리했다([현재 계약](document-editing-v1.md#continuous-editing)). 작은 폼의 가용 영역·교차참조 가림 D02는 #782에서 해결했다. 단일/두 그룹 모두 Sidebar·Outline·스크롤바를 제외하며 겹쳐 열린 Outline도 제외한다. [검증·전후 캡처](editor-layout-rules-v1.md#form-content-viewport-782)를 따른다.

상단 metadata 라벨 칩은 클릭 또는 키보드 Enter/Space로 Edit와 같은 팝오버를 열고
Label 입력칸에 focus를 준다(#847). 이미지/pending Figure·Mermaid·수식·표가 같은 진입을
공유한다. Edit의 기존 첫 focus와 원문 진입은 유지한다.

#1626 소유자 결정: 짧은 metadata 다섯 종류(그림·Mermaid·표·수식·절 label)의 동작 행은
대상에 가까운 모서리로 통일한다. 위로 열리면 마지막, 아래로 열리면 첫 행이며 미리보기는
반대쪽이다. Replace/Edit source와 Done을 한 행에 둔다. DOM·Tab 순서는 시각 순서와 같고
기존 진입 focus·단축키·취소/완료 뒤 복귀를 유지한다. 방향 전환은 같은 필드를 이동하고
필요하면 native focus·선택 범위를 복구한다. 미리보기 최대 크기로 방향만 미리 정하며 실제
썸네일은 고정 높이 없이 원래 비율을 유지한다. 렌더 완료는 방향을 바꾸지 않고 scroll·resize·
그룹 경계 변경은 다시 계산한다. [공통 계약·근거](figure-authoring-v1.md#stable-metadata-actions-1626).

#1625의 Mermaid 원문 폼은 기존 `PropertyForm`·`MermaidPreview` 안에서 preview 높이를
예약하고 큰 결과를 내부 스크롤로 본다. 비동기 렌더 완료가 Apply/Cancel·label·번호·caption을
밀지 않으며 키보드 스크롤과 표준 클릭/제출을 유지한다. 원문의 본문 폭과 기존 위치는 그대로다.
수식은 동기 렌더이며, 작은 그림·Mermaid metadata 썸네일은 기존 intrinsic-ratio/no-letterbox
결정을 유지한다. [계약·전후 캡처](figure-authoring-v1.md#mermaid-editor)를 따른다.

## P02 자동·고정 번호

- **목적·사용/비사용:** 그림·표·블록 수식의 번호 지정에 쓴다. 제목 번호 설정이나 새 Core 문서 모드를 만들지 않는다.
- **목표:** 이미지/pending·Mermaid 속성·표·수식·Mermaid 원문의 다섯 폼을 자동/고정 세그먼트로 통일한다. 고정일 때만 값 입력을 보이고 빈 값이면 완료를 막는다. 해제는 자동 선택으로만 한다. 자동 상태에는 자동으로 적용했을 때 받을 번호를 짧게 보여 준다.
- **현재 기준:** [NumberField][number]를 이미지/pending·Mermaid 속성·표·블록 수식·Mermaid 원문의 다섯 폼에서 공유한다(#776). 자동/고정 세그먼트, 고정일 때만 값 입력, 빈 고정의 완료 차단·입력칸 오류와 자동 선택으로만 해제를 동일하게 제공한다. 자동 상태는 해당 블록의 고정값을 제외하여 Core가 계산한 번호를 "자동 번호: N"으로 짧게 표시한다. 아직 적용하지 않은 선택의 결과와 이미 자동으로 적용된 번호에 같은 문구를 쓴다. Core/CLI의 빈 enumerator 제거와 비차단 혼합·중복 경고는 유지한다.
- **사용처:** U01–U05 그림·수식·표의 번호 폼, U14 번호 입력·집계.
- **결정·불일치:** [소유자 결정 P02][decision], [현재 번호 계약](heading-numbering-v1.md#fixed-numbers-720). D01은 #776에서 해소했다. 문서 경고 전달은 P07/D07.

문서 설정은 #892부터 Core 판정의 자동·고정·혼합을 표시하고 ‘모두 자동으로’와
‘모두 고정으로’를 제공한다. 고정은 기존 고정값을 유지하고 변경 전 표시 번호로
누락만 채운다. 각 일괄 전환은 Undo 한 번으로 복원된다. 혼합은 부록 등에서 의도적으로
사용할 수 있고 저장을 막지 않는다. 누락 알림의 ‘지금 번호로 고정’은 해당 대상만 채운다.
새 문서 옵션과 제목 번호는 추가하지 않는다.

#991의 코드 블록은 기존 상시 언어 control 옆에 상시 Copy code를 제공한다.
편집·읽기와 일반 Markdown 읽기에서 키보드 접근 가능한 동일 문구·복사 성공/실패
피드백을 사용하며, 비서 답변의 #982 패턴을 따른다. [복사 계약](document-editing-v1.md#code-body-copy-991).

## P03 편집 진입

- **목적·사용/비사용:** 선택·읽기와 편집 시작을 구별한다. 선택만으로 속성 폼을 열거나 더블클릭만을 유일한 진입으로 삼지 않는다.
- **목표:** 일반 블록은 hover·키보드 focus·선택에서 같은 위치의 Edit를 제공한다. 그림·수식·표의 위치는 P09로 맞춘다. 미주는 상시 Edit와 버튼 전용 진입을 유지한다. inline 콘텐츠 자체를 큰 UI 버튼으로 바꾸지 않는다.
- **현재 기준:** [그림][figure-view]·[수식][equation-view] NodeView와 [표](table-interaction-v1.md#whole-table-tools-793)의 상단 Edit 노출, [미주][footnote-view] 상시 버튼과 [미주 계약](footnotes-v1.md#editor)의 예외.
- **사용처:** U01–U12 그림·원문·표·미주·inline·절 label·직접 본문 입력, U17 선택 toolbar.
- **결정·불일치:** [소유자 결정 P03][decision]. 표는 #793에서 상단 Edit/metadata 행으로 맞췄으며 D08은 원래 목표의 추적 연결로 보존한다. 수식의 상단 Edit는 작은 metadata, 본문 수식 더블클릭·선택 후 Enter는 직접 원문 진입이다(#788/D04). 미주 예외는 불일치가 아니다.

## P04 적용·취소·완료

- **목적·사용/비사용:** 편집을 언제 문서에 반영하는지 드러낸다. 파일 생성·삭제·복구에 metadata의 바깥 클릭 적용 규칙을 쓰지 않는다(P12).
- **목표:** 짧은 metadata는 Done·Esc 취소·유효한 바깥 pointer 클릭 적용이다. keyboard focus 이동만으로 적용하지 않고 오류면 초안을 유지한다. 원문·복합 inline은 Apply/Cancel·Esc 취소·바깥 클릭 초안 유지다. 링크·교차참조에도 Cancel을 보이고 명시적으로 마칠 때까지 초안을 유지한다. 인용은 [ADR-0008 동결](../adr/0008-citations-and-bibliography.md)에 따라 기존 동작을 유지한다. 직접 본문·제목·caption·문서 설정은 즉시 적용+Undo이며 디스크 저장은 Save다.
- **목표·예외:** 미주는 in-place·바깥 적용·취소와 Enter 적용/Shift+Enter 줄바꿈을 유지하고 버튼을 완료/취소(Done/Cancel)로 부른다.
- **현재 기준:** 그림·표·수식·절 label이 공유하는 `MetadataProperties`의 Done·Esc 취소·유효한 바깥 pointer 적용(#791). 키보드 focus/Save만으로 적용하지 않으며 오류 때 폼·값을 유지하고, 바깥 적용은 클릭한 위치의 focus를 유지하며, 포인터 탭 전환으로 문서가 숨겨져도 해당 문서의 완료를 마친다. 별도 dialog 안의 Cancel·Keep editing·Settings 클릭과 읽기 전환·명령 센터 열기(#849)는 바깥 완료에서 제외하고 폼·초안을 유지한다. 표의 번호 입력은 P02 그대로다. 기존 [FigureProperties][figure]의 image chooser·busy guard와 [PropertyForm][forms]을 쓰는 원문/인라인 수식의 명시적 적용·취소. [미주](footnotes-v1.md#editor)의 완료/취소(Done/Cancel)와 기존 in-place·바깥 적용·키보드 동작. 링크·교차참조는 Apply/Cancel·Esc 취소·바깥 클릭 유지이며, 변경된 초안은 같은 문서의 다른 폼과 독립적으로 기존 draft 안내·Save/Source의 적용 내용 구분·탭 전환 보존·close 보호에 참여한다([초안 계약](editing-session-save-v1.md#applied-content-and-drafts)). 인용은 보이는 Cancel 없이 blur로 닫히는 기존 동작을 유지한다.
- **사용처:** U01–U13 문서 안 편집·설정, U23–U24 파일 작업·미저장 확인과의 경계.
- **결정·불일치:** [소유자 결정 P04][decision]. 표·절 label D03은 #791에서 구현했다(`property-drafts`의 Done·오류 유지·바깥 클릭 뒤 본문 입력·키보드 Save 검사와 [1440px 표 Before](assets/label-popover-791/before/table-1440.png)/[After](assets/label-popover-791/after/table-1440.png)·[640px 절 label Before](assets/label-popover-791/before/section-640.png)/[After](assets/label-popover-791/after/section-640.png); Light/영어·Dark/한국어 [촬영 metadata](assets/label-popover-791/capture-metadata.json)). 수식 metadata D04는 #788에서 분리했다. metadata의 원문 편집은 유효한 label·번호를 먼저 적용하고 원문 폼을 열며, 원문 취소는 그 뒤의 초안만 버린다. 오류·열린 폼 재진입은 초안을 유지하고 원문 편집 중에는 metadata 진입을 숨긴다([현재 계약](document-editing-v1.md#continuous-editing)). `equation-insertion`·`property-drafts`가 경로 전환·취소·Undo, Done·바깥 pointer·dialog 제외·키보드 Save를 검증한다. 링크·교차참조 초안 D05는 #790에서 구현했다. 미주 명칭 D10은 #787에서 해결했다.
- **링크·교차참조 검증 #790:** `link-authoring`/`cross-reference`가 바깥 이동·재진입·독립 폼·미주·Save/Source·탭·close 보호와 실제 Save/Reload를 확인한다. [1440px 링크 Before](assets/inline-forms-790/before-1440-link.png) / [After](assets/inline-forms-790/after-1440-link.png), [640px 한국어 Dark 교차참조 Before](assets/inline-forms-790/before-640-reference.png) / [After](assets/inline-forms-790/after-640-reference.png)는 수동 시각 근거다. 두 폼의 두 폭 전체 캡처·해시는 [촬영 정보](assets/inline-forms-790/capture-metadata.json), 재현 절차는 [촬영 스크립트](assets/inline-forms-790/capture.browser.js)에 있다. 기존 draft 안내로 늘어난 높이는 실제 레이아웃 결과다.

- **수식 화면 근거 #788:** [1440px Before](assets/equation-metadata-788/before-1440.png) / [After](assets/equation-metadata-788/after-1440.png), [640px Dark·한국어 Before](assets/equation-metadata-788/before-640.png) / [After](assets/equation-metadata-788/after-640.png). 같은 문서·label·고정 번호로 촬영했으며 원문 폼과 팝오버의 배치·스크롤 차이는 실제 제품 결과다. [촬영 정보·해시](assets/equation-metadata-788/capture-metadata.json)와 [재현 스크립트](assets/equation-metadata-788/capture.browser.js)를 보존한다.

## P05 입력칸·placeholder·위계

비서 입력창은 같은 자리의 공통 `Button`(`icon-sm`) 하나를 유지한다(#1485). 대기 중에는 전송, 응답 중 빈 입력에는 중지, 글·첨부가 있으면 진행 중 작업에 추가한다. steer를 지원하지 않는 Copilot은 응답 중 항상 중지다. 전송은 기본 variant·ArrowUp, 중지는 outline·Square를 쓰며 접근 가능한 이름·Tooltip도 함께 바뀐다.

#1053의 Copilot 선택도 #1033의 Host SettingsSelect·모델 Dialog를 사용하며 Codex 전용
skills·진단 항목은 숨긴다. #1091은 같은 SettingsSelect로 추론 강도·쓰기 범위를 표시하고 기존 비서 DropdownMenu에서 Agent/Plan을 고른다([비서 계약](main-agent-v1.md#권한-모드)).

#1150 ③의 공식 [AI 설정](main-agent-v1.md)은 Appearance/Recovery와 같은 Settings
콘텐츠·control 폭과 공용 Input/select/Button을 사용한다. 프로바이더의 이름·상태는
공용 ghost Button에 `justify-start`를 명시해 각 행의 같은 왼쪽 축에 놓고 진단은 오른쪽에 둔다.
모든 기본값은 순차 자동 저장한다.
저장 중·실패는 기존 status/alert로 보이며 저장 완료 상시 문구는 두지 않는다.
목록 대화상자는 기존 Dialog의 닫기·포커스 복귀를 사용한다. 한국어 시작 후 English
전환, 1440px Light·640px Dark의 목록·진단·입력칸을 `assistant` 시나리오에서 확인한다.

- **목적·사용/비사용:** 짧은 속성 입력을 찾기 쉽게 하되 중첩 경계를 줄인다. 문서 입력·원문·모달 전체에 경계 제거를 전파하지 않는다.
- **목표:** 짧은 text field는 subtle fill + hover/focus border, label은 항상 표시한다. 원문은 code surface, 경로·새 이름 같은 독립 모달 핵심 입력은 상시 경계를 유지한다. placeholder는 예시/빈 값 표시이며 label·필수 조건을 대신하지 않는다. 필요한 제약은 label 가까이, 오류는 P07을 따른다.
- **현재 기준:** [그림 속성 필드][figure-view]의 subtle fill·hover/focus border를 `PropertyForm`/`BlockProperties`의 표·절 label·수식/원문 metadata와 링크의 짧은 text field에 공유한다(#789). label은 상시 표시하며 기존 32px field·28px action·6px radius와 token을 사용한다. 원문 textarea(인라인 LaTeX 포함), 제목·caption과 독립 모달의 핵심 입력은 기존 경계를 유지한다. 교차참조의 target은 text field가 아닌 select로 기존 경계·후보 동작을 유지한다. 인용은 전용 변경 없이 공용 스타일만 따른다(ADR-0008 동결).
- **사용처:** U01–U14 문서 속성·inline·설정, U19 코드 언어·callout, U22–U23 앱 설정·파일 모달.
- **결정·불일치:** [소유자 결정 P05][decision]. D09의 구현·검증은 #789. `short-field-errors`가 1440px Light·영어 / 640px Dark·한국어에서 필드 rest·hover·focus, 오류 연결·위치와 값 보존을 검사한다. 같은 scratch 문서·잘못된 label로 비교한 [1440px 표 Before](assets/short-fields-789/before-1440-table.png) / [After](assets/short-fields-789/after-1440-table.png), [640px 그림 Before](assets/short-fields-789/before-640-figure.png) / [After](assets/short-fields-789/after-640-figure.png)는 [촬영 스크립트](assets/short-fields-789/capture.browser.js)와 [metadata·해시](assets/short-fields-789/capture-metadata.json)로 묶은 수동 시각 검토 근거다. 오류문 축소에 따른 폼 높이·위치 차이는 실제 배치 결과이며 이미지 재배치가 아니다.

## P06 빈 상태와 작성 시작

- **목적·사용/비사용:** 무엇이 비었는지와 다음 행동을 보여 준다. UI 안내를 실제 문서 콘텐츠로 저장하거나 빈 작성 자리를 모두 숨기지 않는다.
- **목표:** 빈 제목은 기존 slot 높이를 유지한 작은 ‘제목 추가(선택)’이며 입력하면 title typography를 쓴다. title과 H1은 분리한다. pending Figure에는 ‘이미지 선택 / Mermaid 작성’ 진입을 보이며 진입만으로 내용을 확정하지 않는다. 빈 caption의 muted italic hint·선택 시 숨김·번호/최소 클릭 영역은 유지한다. 빈 검색·자원 목록은 작성 빈칸과 구별한다.
- **현재 기준:** [DocumentTitle](../../apps/editor/src/document-title.tsx)은 기존 title slot 높이를 유지하며 작은 UI 서체의 `제목 추가(선택)` / `Add a title (optional)`을 보이고, 입력 즉시 제목 서체로 전환한다. [pending Figure][figure-view]는 `이미지 선택` / `Mermaid 작성` 버튼으로 기존 picker·원문 편집을 연다. 선택 진입·취소만으로 문서 내용을 확정하지 않는다. [빈 caption hint](editor-visual-language-v1.md#state-rules), 빈 본문의 작성 안내와 빈 목록의 항목 안내는 기존 규칙을 유지한다. 검색·자원 목록의 빈 결과와는 구별한다.
- **사용처:** U01/U03–U06 빈 그림·원문·표·미주, U12 제목·본문, U21 검색/탐색, U23/U25 파일·참고문헌 빈 상태.
- **결정·불일치:** [소유자 결정 P06][decision]. D06은 [#786](https://github.com/litzio/litzio/issues/786)에서 해소했다. [제목 계약](document-editing-v1.md#document-title-255)·[그림 계약](figure-authoring-v1.md#editor-session-states)과 [전후 캡처](figure-authoring-v1.md#empty-authoring-entry-786)를 따른다. 기존 caption·선택·clipboard 규칙은 유지한다.

## P07 입력 오류와 알림 센터

#1424의 [비서 상단 상태](main-agent-v1.md#대화와-표시)는 기존 Button·Tooltip과
상태 토큰을 사용한다. 닫힌 패널의 작업·읽지 않은 완료·확인/답변 필요를 작은 모양과
접근성 이름으로 구별한다. 완료는 패널을 열어 확인하며, 질문과 실패의 실제 복구 동작은
비서 패널에 남는다. 알림 센터·OS 알림·소리로 복제하지 않는다.

#1522·#1523의 [비서 접수·출력](main-agent-v1.md#대화와-표시)은
정상 접수를 일반 사용자 행으로 표시하고 실패·실제 불확실 상태에만 기존 Button·Tooltip
복구 행동을 둔다. 같은 패널의 질문·실패 표시와 진행 details를 재사용하며 새 알림 표면은 없다.
합성 1440px 전후·한국어 Dark 캡처와 기존 640px 검사는 연결된 계약의 근거를 따른다.

#1292 비서 공통 작업 환경·공급자 진단은 일반 label/값에 UI 14/20,
경로·프로토콜에 mono metadata 12/16을 사용한다. 공급자 연결 실패와 설정 요청 실패는
기존 `Notice tone="error"`로 표시하며 특정 입력의 오류로 재분류하지 않는다.
같은 설정 패턴인 Host 주소는 공통 description 12/18, About daemon 값·facts는
공통 SettingsRow/facts 16/24를 사용한다([fixture 측정](assets/ui-consistency-1292-synthetic/host-about-roles.json)).
이 공용 표면의 read-only 타이포 변경은 이번 비서 진단 적용 범위에 포함하지 않는다. 본문·제목·안내 문구를 일괄 축소하지 않는다.
Host footer는 Settings와 같은 16px 슬롯·padding·8px 간격을 사용하고,
6px 상태 점은 슬롯 가운데에 둔다. 읽기 전용 실행 계정은 Tab focus·Tooltip을 유지한다.

수동 검토(2026-11-06, Windows persistent Chrome, base `3de135cb`, 합성 Host/account/path·Desktop bridge·AI fixture):
[1440 환경 Before](assets/ui-consistency-1292-synthetic/before-1440-light-environment.png) /
[After](assets/ui-consistency-1292-synthetic/after-1440-light-environment.png),
[640 긴 경로 Before](assets/ui-consistency-1292-synthetic/before-640-dark-environment.png) /
[After](assets/ui-consistency-1292-synthetic/after-640-dark-environment.png),
[1440 오류 Before](assets/ui-consistency-1292-synthetic/before-1440-light-error-focus.png) /
[After](assets/ui-consistency-1292-synthetic/after-1440-light-error-focus.png),
[640 오류·focus Before](assets/ui-consistency-1292-synthetic/before-640-dark-error-focus.png) /
[After](assets/ui-consistency-1292-synthetic/after-640-dark-error-focus.png),
[footer focus Before](assets/ui-consistency-1292-synthetic/before-1440-light-footer-focus.png) /
[After](assets/ui-consistency-1292-synthetic/after-1440-light-footer-focus.png),
[640 접힘 Before](assets/ui-consistency-1292-synthetic/before-640-dark-collapsed.png) /
[After](assets/ui-consistency-1292-synthetic/after-640-dark-collapsed.png).
[Before 측정](assets/ui-consistency-1292-synthetic/before-measurements.json) /
[After 측정](assets/ui-consistency-1292-synthetic/after-measurements.json): 펼침 점 중심 x23→33,
Settings 중심 x33 유지. Tab으로 진단 실행·Host footer에 도달했다.
`pnpm browser:test quiet-document --screenshots`에 임시 수동 촬영 body를 적용하고 원래 regression을 복원했다.
이 캡처는 실제 공급자 연결·설치 앱 성공이나 픽셀 자동 단언을 뜻하지 않는다.
알림 위치 이동의 `notification-center` 검사는 기존 `tableCell` selection 기대값을 유지하며
`NotificationScope`의 다음 animation frame 이동이 완료된 상태를 기다린다. #1293 merge-group 실패
artifact에는 즉시 단언 실패 뒤 같은 클릭의 selection이 `tableCell`로 도달한 기록이 있어,
기본 timeout이나 제품 동작을 바꾸지 않고 단언 시점만 보완했다.

- **목적·사용/비사용:** 고칠 입력과 문서·앱 문제를 구별하고 문제 위치로 이동시킨다. 입력칸 오류를 알림 센터만으로 대체하지 않으며 저장 거부/허용 정책을 바꾸지 않는다.
- **목표 — 입력칸:** 고칠 수 있는 오류는 입력 아래의 짧은 오류문, `aria-invalid`·설명 연결과 값 보존을 따른다. 색만으로 상태를 구별하지 않고 적용 불가·저장 가능을 문장으로 구분한다.
- **목표 — 창 단위:** 머리줄 Assistant 옆 compact 아이콘 **하나**가 가장 높은 심각도(경고 주황·오류 빨강)와 개수를 나타내며 스크롤바와 겹치지 않는다. 문서·앱 알림(번호 경고, 저장 실패, 파일·Host 오류, Mermaid 렌더 실패, 앱 메시지)을 모으고 항목마다 ‘문제 위치로 이동’을 둔다. 번호 경고는 적용된 문서 기준임을 명시한다.
- **머리줄 배치 (#1644):** 닫힌 종은 문서 영역과 겹치지 않는다. 종으로 연 수동 목록은 viewport 안에 맞추는 비모달 Popover이며 본문 가림은 정상이다. 자동 오류·진행 카드는 master의 오른쪽 아래 위치·모습으로 유지해 Save·Reload·보기 전환을 가리지 않는다. 단일 표시 상태와 내용·focus 소유자를 공유한다. 문서·플러그인·Settings에서 같은 위치를 쓰고 문서 높이·최소 높이는 바꾸지 않는다. #1003의 닫힌 종 겹침 허용을 대체한다. 목록을 검사하지 않는 시나리오는 공통 하네스에서 알림 센터를 숨긴다.
- **목표 — 생명주기:** 새 경고·오류가 생기면 포커스를 가져오지 않고 목록을 자동으로 펼치며 사용자가 접을 수 있다. 일회성 안내는 펼치지 않는다. 알림이 없어도 버튼을 항상 표시하고 심각도 색·개수 없이 중립 상태로 둔다. 접근성 설명은 알림이 없음을 말하며, 사용자가 열면 한·영으로 짧은 빈 상태 안내를 보인다. 빈 상태 자체는 focus를 가져가거나 자동으로 펼쳐지지 않는다. 해결된 항목은 자동 제거하고 사용자가 닫은 항목은 같은 원인이 다시 생길 때까지 숨긴다.
- **현재 기준:** [NotificationCenter](../../apps/editor/src/components/ui/notification-center.tsx)는 창의 App 인스턴스에 하나만 둔다(#792). #837의 소유자 결정(2026-10-31)에 따라 알림이 없어도 중립 버튼이 항상 보이고, 열면 “알림 없음” / “No notifications”를 표시한다. 열린 모든 문서의 적용된 번호 경고·저장 실패·지속 파일/Host 오류·앱 메시지와 적용된 Mermaid 렌더 실패를 모은다. 문서 이름과 문제 위치 이동을 제공하며 위치 없는 앱 메시지는 이동 없이 표시한다. [MessageArea](../../apps/editor/src/shell/MessageArea.tsx)는 기존 메시지의 등록·일회 안내 만료를 맡는다. 미적용 초안의 Save/Source 범위 설명은 아래 탭 줄 상태 표시로 제공한다(#839 소유자 결정). 문서 상단/번호 폼 경고는 센터로 옮겼으며 저장 실패의 기술적 상세·다중 위치 탐색과 문서 안 빨간 테두리는 유지한다.
- **현재 생명주기:** 새 경고·오류만 focus 없이 목록을 펼친다. 원인별 안정적인 ID를 쓰며 샘플 준비·복구 저장소 등 독립 원인을 합치지 않는다. 토글의 이름·툴팁은 “알림” / “Notifications”이며, 접근성 설명은 알림이 있으면 최고 심각도·개수, 없으면 “알림: 없음” / “Notifications: none”을 포함하고, 새 항목은 펼침과 독립된 polite live region에서 한 번 알린다. 접은 목록은 항목 제거·안내 추가로 다시 펼쳐지지 않는다. 마지막 알림이 없어지면 자동으로 접으며, 사용자가 마지막 항목을 닫으면 알림 버튼으로 focus를 돌린다(#986). 같은 종류가 둘 이상이면 접힌 묶음으로 모으고 한 항목이면 기존 행을 유지한다(#1005; 아래 기준). 일회 안내는 기존 5초 수명과 Undo를 유지한다. 원인 제거 시 항목을 없애고, 닫은 원인은 탭 전환·무관한 편집에서 숨김을 유지하다가 제거 후 재발하면 다시 표시한다. 탭을 닫으면 그 탭의 원인도 제거한다. 알림·접힘·숨김은 창 메모리에만 두고 문서·복구 기록에 쓰지 않는다. 저장 실패는 기존 계약대로 다음 성공한 Save가 해소하며, 편집 후 위치가 낡으면 재저장을 안내한다. Core/Host의 저장 허용·거부를 재판정하지 않는다.
- **남기는 문맥 표시:** #839의 2026-10-31 소유자 결정에 따라 미적용 초안은 탭 줄의 저장 버튼 왼쪽에 `미적용 초안` / `Unapplied draft` 상태로 표시한다. 1440px에서는 글자, 640px 및 compact 그룹에서는 아이콘만 보인다. hover·keyboard focus 시 기존 Save/Source 안내 전문을 보여 주며 접근성 이름에도 짧은 이름과 전문을 포함한다. 읽기·편집·소스 모두 같은 문서의 상태를 표시하고 기존 미저장 점과 구분한다. 일회 안내·알림 센터 항목·초안 위치 이동 동작으로 만들지 않는다. 표시·해제 시 문서 좌표와 native scroll이 변하지 않으며 초안이 없는 평소에도 문서 위 빈 공간을 확보하지 않는다. 입력칸 오류·Mermaid **초안** 미리보기 오류는 폼에 유지한다. 파일 picker의 경로/이름 오류·Settings 선택값 저장 오류는 해당 입력 피드백이다. 열린 Source/Recovery 비교 등의 읽기 실패는 그 화면 상태를 설명하는 P12 문맥 정보여서 화면 안에 둔다. 참고문헌 completeness는 ADR-0008 동결 범위를 유지한다. 블록의 짧은 미리보기 불가 표시는 위치 표식이며 상세 실패를 중복 출력하지 않는다. 폼 입력칸 연결은 기존 연결과 D09 범위를 따른다.
- **진행 알림 정리 (#1243):** Open 완료·취소처럼 모든 알림 producer가 제거되어 빈 상태로 돌아오면 polite live region의 이전 안내문도 지운다. 정상 문서 열기 뒤의 초기 무음 계약을 유지하며, 경고·오류의 재발 안내는 기존 원인 수명을 따른다.
- **검증:** `notification-center`는 항상 보이는 중립 빈 상태·한영 안내·초기 접힘·무음 live region, 심각도·개수, 자동 펼침/접기, focus/selection 유지, 해결·닫기·재발, 비활성 탭 위치 이동, 창 격리와 일회 안내를 검증한다. 1440/640px·light/dark·한국어 [시각 근거](#notification-center-792)를 함께 확인한다.
- **초안 상태 검증 (#839):** `draft-notice-layout`에서 절 label 한 글자 입력·되돌림·취소의 문서 좌표·scrollTop 불변, 탭 줄 바로 아래의 문서 viewport와 기존 paper 간격, Source 첫 줄의 가림 없음, 전문 tooltip의 hover/focus와 접근성 이름을 검사한다. 수정 전 상단 띠는 1440px에서 47px, 640px에서 67px 문서를 밀었다. 새 상태 표시는 두 폭 모두 이동 0px이며 평소 추가 공간도 0px다. [1440px 평소 Before](assets/draft-notice-839/before-1440-idle.png) / [After](assets/draft-notice-839/after-1440-idle.png), [초안 Before](assets/draft-notice-839/before-1440-draft.png) / [After](assets/draft-notice-839/after-1440-draft.png), [640px 평소 Before](assets/draft-notice-839/before-640-idle.png) / [After](assets/draft-notice-839/after-640-idle.png), [초안 Before](assets/draft-notice-839/before-640-draft.png) / [After](assets/draft-notice-839/after-640-draft.png), [640px 전문](assets/draft-notice-839/after-640-explanation.png), [Source](assets/draft-notice-839/after-640-source.png), [촬영 조건·해시](assets/draft-notice-839/capture-metadata.json). 탭·저장·더보기 간격과 잘림, 정렬, 한국어 어절 줄바꿈·다크는 자기 캡처에서 확인한 수동 근거다.
- **현재 기준 — 입력칸 (#789):** `FieldError`의 짧은 오류문을 해당 입력 바로 아래에 두고, 입력의 `aria-invalid`와 고유한 `aria-describedby`로 연결하며 거절된 값을 보존한다. 그림의 label·이미지 경로·alt·파일 이름, Mermaid 원문의 빈 값·label, 수식·표·절 label, 인라인 LaTeX·링크 URL과 기존 NumberField 오류가 이 표현을 쓴다. label 중복은 Core 거절을 표시하고 번호 제출 규칙은 #776 그대로다. 특정 입력으로 귀속할 수 없는 폼 내부 Host/검증 실패 Notice는 폼 문맥에 유지하고, 적용 문서 경고는 위 창 단위 센터로 보낸다. 기존 인용 오류 동작은 동결 범위로 유지한다. `short-field-errors`에서 수정 전 오류 연결 검사 실패와 수정 후 통과를 확인했다(2026-10-30).
- **사용처:** U01–U16 문서 폼·번호·메시지·렌더 실패, U22–U25 설정·파일·복구·참고문헌 알림.
- **결정·불일치:** [소유자 결정 P07][decision]이 인벤토리의 scope별 요약 추천을 대체한다. 알림이 없으면 숨긴다는 이전 목표는 [#837](https://github.com/litzio/litzio/issues/837)의 소유자 결정으로 대체했다. 알림 센터의 추적은 D07, 입력칸 오류는 D09다.

### 같은 종류 묶음과 마지막 닫기 (#1005, #986)

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

검증은 기존 `notification-center` 끝에 실제 번호 경고 두 개가 있는 scratch 문서를
여는 경로를 보완했다. 클릭·Space/Enter로 펼치기·접기, 두 번째 위치로 이동,
개별 닫기 후 singleton 전환·마지막 닫기와 버튼 focus·빈 상태 열기를 확인한다.
Reload 시 이전 fixture의 복구 안내를 사람이 선택하는 Not now로 닫고, 같은 원인의
묶음 전체 닫기도 확인한다. 새 경로는 내부 상태 주입·고정 대기·전수 조합을 쓰지 않는다.
주 검증 계층은 브라우저이며, 기존 Editor token/layout 검사는 공통 UI 규범을 보호한다.
문서 의미를 변경하지 않아 Core/CLI operation·중복 테스트는 추가하지 않는다.

수동 시각 검토는 자동 성공 검사의 촬영 순회와 분리했다. Windows persistent Chrome,
한국어, DPR 1·100%, 같은 `groups.md`, Pretendard 로드 후 촬영했다.

| 화면 | Before | After 묶임 | After 펼침 |
| --- | --- | --- | --- |
| 1440×900 Light | [PNG](assets/notification-groups-1005/before-1440-light-ko.png) | [PNG](assets/notification-groups-1005/after-1440-light-ko-grouped.png) | [PNG](assets/notification-groups-1005/after-1440-light-ko-expanded.png) |
| 640×900 Dark | [PNG](assets/notification-groups-1005/before-640-dark-ko.png) | [PNG](assets/notification-groups-1005/after-640-dark-ko-grouped.png) | [PNG](assets/notification-groups-1005/after-640-dark-ko-expanded.png) |

시각 점검: 1440px Light·640px Dark 모두 묶음 제목·닫기·개수와 펼친 위치 이동/닫기
동작이 잘리지 않음을 확인했다. 펼친 640px 목록은 기존 센터의 스크롤·폭 경계에
들어가며, 펼친 목록의 본문 overlay는 허용하며 닫힌 종은 #1644의 머리줄 배치를 따른다.

### 빈 알림 센터 시각 근거 (#837)

Windows Chrome의 checkout별 persistent profile, Vite `http://127.0.0.1:5281`,
DPR 1·100% 확대, Pretendard 로드 후 같은 `fixed.md`의 알림 없는 상태다.
Before는 시작 HEAD `1b4cff58d5ac7f432ac74b4ed886ddc814d14dbc`에서 빈 센터 표시 단언이 실패한 상태이며, After는 #837 구현이다.
이 #837/#970 캡처는 이전 하단 배치의 이력이다. 현재 위치는 #1644 머리줄 계약을 따른다.
당시 오른쪽 패널이 없으면 창 오른쪽 32px 간격과 문서 끝 여백을 유지했다.
#970부터 Outline(도킹·오버레이)과 비모달 비서가 열리면 패널 왼쪽을 기준으로
같은 간격을 두며 목록 폭도 남은 영역 안으로 제한한다. 비서의 좁은 창 모달에서는
기존 알림 숨김·inert 경계를 유지한다. `notification-center` 시나리오에서
빈 안내·중립색·초기 접힘·focus 유지·문서 끝 선택 도구 표시를 확인했다.

| 폭 | Before dark (한국어) | After dark 닫힘 (한국어) | After dark 열림 (한국어) | After light 열림 (영어) |
| --- | --- | --- | --- | --- |
| 1440 | [PNG](assets/notification-center-837/before-1440-dark-ko.png) | [PNG](assets/notification-center-837/after-1440-dark-ko-closed.png) | [PNG](assets/notification-center-837/after-1440-dark-ko-open.png) | [PNG](assets/notification-center-837/after-1440-light-en-open.png) |
| 640 | [PNG](assets/notification-center-837/before-640-dark-ko.png) | [PNG](assets/notification-center-837/after-640-dark-ko-closed.png) | [PNG](assets/notification-center-837/after-640-dark-ko-open.png) | [PNG](assets/notification-center-837/after-640-light-en-open.png) |

#969의 바깥 변경·저장 충돌도 같은 센터에 모으며, 기존 Button의 보조·ghost 동작으로
디스크에서 다시 불러오기와 읽기 전용 비교를 제공한다. Reload의 작업 유실 확인과
#655 비교 화면을 재사용한다. `external-change` 브라우저 검사는 실제 외부 쓰기,
409·비교·Reload 확인, 창 복귀 확인과 1440/640px 한국어 다크 테마를 검증한다.

<a id="notification-center-792"></a>

### 알림 센터 시각 근거 (#792)

동일한 `fixed.md`의 표 고정 번호를 해제한 적용 문서 상태, Windows Chrome의 checkout별 persistent profile,
Vite `http://127.0.0.1:5292`, DPR 1·100% 확대, Pretendard 로드 후 문서 scroll top 0이다.
Before는 이 브랜치의 시작 HEAD `644b2d7b3e5639b3be000bced5cf048a7ccb9532`에서 제품 소스만 복원해 새 회귀의 실패를 확인한 상태다.
After는 #792 작업 소스로 촬영했다. source/disk 쓰기 없이 번호 경고의 전달 위치만 비교한다.

| 폭 | Before | After light | After dark (한국어) |
| --- | --- | --- | --- |
| 1440 | [PNG](assets/notification-center-792/before-1440.png) | [PNG](assets/notification-center-792/after-1440-light-en.png) | [PNG](assets/notification-center-792/after-1440-dark-ko.png) |
| 640 | [PNG](assets/notification-center-792/before-640.png) | [PNG](assets/notification-center-792/after-640-light-en.png) | [PNG](assets/notification-center-792/after-640-dark-ko.png) |

같은 행의 정렬·패딩, 한국어 줄바꿈과 창/스크롤바 여유를 자기 캡처에서 확인했다.
접힌 센터의 투명 영역은 pointer를 통과시키며 활성 팝오버·모달은 센터 위에 둔다.
목록은 Explorer 오른쪽 경계를 넘지 않으며 이동 버튼 글자는 메시지 왼쪽 축에 맞춘다.
저장 실패 표식·초안 입력 오류·모달 문맥 정보는 위 분류대로 남긴다.

## P08 읽기 미리보기

- **목적·사용/비사용:** 미주·인용·상대 이미지 링크를 읽는 중 문맥을 보충한다. 편집 폼이나 일반 URL/교차참조 tooltip·이동을 같은 카드로 바꾸지 않는다.
- **목표·현재 기준:** [ReadingPreview](../../apps/editor/src/ReadingPreview.tsx)의 공통 폭 상한·간격·그룹 경계, Esc dismiss, 입력 중 억제와 focus/selection 비탈취를 유지한다. 오류도 읽기 정보다. 카드 안 Edit/Apply·재귀 preview를 넣지 않으며 긴 콘텐츠 생략은 이번 결정에 포함되지 않는다.
- **사용처:** U15 미주·인용·이미지 링크 읽기, U08–U10 링크·인용·교차참조의 읽기 진입 경계.
- **결정·불일치:** [소유자 결정 P08][decision], [현재 읽기 계약](editor-ux-shell-v1.md#endnote-and-citation-reading-previews-752). 채택 목표와 알려진 불일치 없음. 미주 미리보기는 이동 안내 문구 없이 본문을 표시하고 원래 참조의 접근성 이름과 클릭 이동을 유지한다([#773](https://github.com/litzio/litzio/issues/773), `reference-preview` 검증). 같은 패턴의 인용·이미지 링크 표면과 동작은 유지한다.

## P09 metadata와 블록 도구

#1022의 문서 focus 보조 막대는 U12 글 흐름(단락·제목·최상위 목록)에만 표시한다.
U01–U06의 자체 경계와 인용문의 왼쪽 선을 확인해 중복 막대를 제외했다.
기존 U18 gutter·Edit/metadata 도구는 그대로이며 [범위·시각 근거](editor-visual-language-v1.md#editing-block-bar-verification-1022)를 따른다.

제목 깊이 표시(#887/#886)는 편집 모드에서 왼쪽 여백에
`H1`–`H6`을 상시 표시한다. 같은 줄의 블록 핸들이 보일 때만 숨기며 도구와 본문을
움직이지 않는다. 일반 읽기·소스·텍스트 모드에서는 표시하지 않는다. Mermaid 종류
배지와 같이 문서 밖 장식이며 공용 metadata 크기·줄 간격을 쓴다. 제목 표시는
절 label과 같은 고정폭 서체·subtle text로 더 조용하게 표현하며 배경 면을 추가하지 않는다.
접근성·번역·조절 값은 [Visual Language](editor-visual-language-v1.md#state-rules)를 따른다.

- **목적·사용/비사용:** 짧은 속성과 구조 작업의 진입을 구분한다. 표의 행·열 선택 도구나 미주 복귀 번호를 일반 metadata 도구로 대체하지 않는다.
- **목표:** 그림·수식·표 속성 진입은 같은 위쪽 Edit/metadata 행에 둔다. 표 행·열·Append 도구는 grid에, 하단 독립 Delete는 More/actions에 둔다. 도구 표시로 본문 높이를 바꾸지 않고 번호/label을 폼 제목에 반복하지 않는다. 미주 우측 버튼과 복귀 번호는 예외다. 넓은 표에서도 가로 스크롤 전에 도구에 접근하고 caption을 가리지 않아야 한다.
- **현재 기준:** [그림][figure-view]·[수식][equation-view] NodeView의 상단 도구와 높이를 차지하지 않는 metadata. [표 #793](table-interaction-v1.md#whole-table-tools-793)은 가로 스크롤 밖 상단 행에 Edit/More·metadata를 두고, Delete는 More 메뉴에 둔다. 표는 앞 문단·열 핸들과 겹치지 않도록 상단 행의 공간을 항상 확보하며 도구 표시로 본문 높이를 바꾸지 않는다. 행·열·Append와 caption 간격은 유지한다. 수식도 같은 상단 Edit/metadata 행에서 작은 속성을 열며, 본문 폭 원문 폼은 별도 경로로 유지한다(#788).
- **사용처:** U01–U06 그림·수식·표·미주, U11 절 label, U18 블록/표 구조 도구.
- **본문 진입 (#223):** 본문 우클릭과 편집기 안 Shift+F10·메뉴 키도 U18의 기존 여백 핸들 블록 메뉴를 연다. 표·그림·수식도 같은 항목·명령·Undo/Redo를 쓰며 속성 도구 배치와 표시 규칙은 유지한다([본문 메뉴 계약](editor-ux-shell-v1.md#body-block-context-menu-223)).
- **결정·불일치:** [소유자 결정 P09][decision]은 #517/#721 배치를 바꾼다. 표 배치 D08의 현재 계약·1440/640px 캡처·키보드/가로 스크롤 검증은 [표 도구 기록](table-interaction-v1.md#whole-table-tools-793)에 연결한다. 수식 metadata D04와 미주 예외는 유지한다.

Mermaid의 상시 종류 배지는 공용 metadata 서체, 일반 text 대비, muted 표면과 기존
padding을 쓴다. 선택하면 interaction-soft fill과 interaction border를 더한다(#846).
상단 여유를 항상 확보해 앞 블록의 선택 테두리와 겹치지 않는다.
기존 `mermaid-authoring`이 1440px Light/영어·640px Dark/한국어에서 네 라벨 패턴의 진입,
배지 상태와 인접 테두리 분리, 문서·history 보존을 검사한다.
[전후 캡처와 조건](assets/block-meta-846-847/capture-metadata.json)은 자동 단언과 구별하는
수동 시각 근거다.

## P10 메뉴와 선택 도구

#1401의 하위 폴더 삭제는 기존 ContextMenu·DropdownMenu의 같은 대상별 행동 목록과
danger 항목을 공유한다. 휴지통 미지원 항목은 실행을 막고 hover·focus Tooltip으로 이유를
설명한다. 트리의 단일 Tab 정지점을 유지하며 키보드는 기존 Shift+F10/Menu 경로를 쓴다.
U23 폴더 메뉴와 U24 파일 삭제를 함께 대조했고, 다른 메뉴를 위한 새 registry나 interaction은
추가하지 않았다. [현재 계약](editor-ux-shell-v1.md#child-folder-trash-1401).

비서 입력창의 `/` Codex 스킬 후보는 inline listbox와
Button·Tooltip·초안 칩을 사용한다. 스킬은 이름·설명을 표시하고 선택하면
`$name`과 경로 칩을 추가한다. 설치·활성화 메뉴는 없다.
[현재 계약](main-agent-v1.md#현재-한계).

- **목적·사용/비사용:** 동작·값 선택·검색을 구별한다. combobox·tree·toolbar를 모양 때문에 하나의 menu로 합치지 않는다.
- **목표·현재 기준:** [CommandMenu](../../apps/editor/src/CommandMenu.tsx)와 [공용 메뉴 행](editor-ux-shell-v1.md#unified-action-menus-516)을 유지한다. 같은 action의 icon·문구·disabled 이유를 맞춘다. 값 선택에는 current check, 서식에는 pressed, 실행에는 동사를 쓴다. 검색 active와 선택된 값은 구별한다.
- **선택지 묶음 (#1034):** 문서 보기·번호 방식·갤러리는 기존 Button 세그먼트를 일반화한 내부 ChoiceGroup을 사용한다. 필수 단일 선택과 Tab/Enter/Space 계약·토큰을 보존한다. U17 독립 서식, U18 표 selection/메뉴, U21 탭 키보드 소유권은 그대로 유지한다([분류·검사·Light/Dark 전후 근거](ui-decision-table-v1.md#선택지-분류와-검증-1034)).

- **추가 사용처 (#798):** Sidebar 하단 설정 바로 아래 별도 색상 모드 행(#912)은 고정 SunMoon 아이콘과 오른쪽의 흐린 현재 값을 표시하며 접히면 색상 모드 이름의 아이콘만 보인다. 메뉴는 공용 menu surface·행과 Base UI radio 선택을 사용한다. 현재 값의 check와 키보드 focus를 구별하며 Settings·명령 센터와 같은 저장·적용 경로를 쓴다([계약·검증](editor-ux-shell-v1.md#color-mode-entry-798)).
- **메뉴 쌓임 (#223):** 공용 CommandMenu는 고정 문서 viewport의 stacking context 밖 Portal에서 파일·탭 메뉴와 같은 층을 쓰므로 알림 버튼이 행을 가리지 않는다. 원래 문서의 위치·스크롤·그룹 경계와 미주 소유권을 유지하며, 표는 기존 Popover Portal을 유지한다. 알림 버튼의 위치·동작은 바꾸지 않는다.
- **사용처:** U17 서식 toolbar, U18 블록·표 메뉴, U19 코드 언어/callout, U20 파일·탭 메뉴, U21 검색·탐색, U09–U10 인용·참조 후보.
- **본문 메뉴 경계 (#223):** U18은 마우스 위치 또는 현재 블록의 커서 옆에서 같은 CommandMenu를 쓰고 문서 viewport 안으로 배치한다. 선택된 글자 안·입력칸·코드/수식 원문·읽기/읽기 전용에서는 기본 메뉴를 유지하며 클립보드 항목은 추가하지 않는다. 선택 밖 우클릭은 대상 커서/블록으로 이동한다. Esc·닫기는 편집기 선택/focus를 복원하고 다른 control 클릭은 정상 focus 인계를 유지한다. 파일·탭 우클릭과 폴더·Outline은 바꾸지 않는다. `read-view`가 이 경계와 핸들 메뉴 일치·Undo/Redo를 검증한다.
- **선택·overlay 위치 (#838):** 선택 툴바는 선택 글자를 가리지 않도록 위 공간이 부족하면 아래로 뒤집고, 선택이 콘텐츠 viewport 밖이면 숨긴다. 스크롤로 돌아오면 기존 선택의 툴바를 다시 보인다. 같은 경계 훅의 링크·교차참조·인용 폼, slash 메뉴와 읽기 미리보기도 대상과 겹치지 않는 쪽에 배치한다. 초안의 유지·적용·Esc 취소는 P04 그대로다. 치수·화면 밖 폼의 기존 접근은 [Layout Rules](editor-layout-rules-v1.md#alignment-and-ownership)를 따른다.
- **#838 검증·시각 근거:** `selection-toolbar`가 상단 선택 가림, 스크롤 밖 숨김·복귀, 링크 Esc 뒤 실제 제목 클릭·URL 보존, 하단 읽기 미리보기·기존 참조/인용 폼·slash 메뉴의 위치를 검사한다. [1440px Before](assets/selection-toolbar-838/before-1440.png) / [After](assets/selection-toolbar-838/after-1440.png), [640px Before](assets/selection-toolbar-838/before-640.png) / [After](assets/selection-toolbar-838/after-640.png), [640px 한국어 Dark](assets/selection-toolbar-838/after-640-dark-ko.png)에서 정렬·패딩·선택 가림·경계 잘림을 자체 점검했다. [촬영 조건·해시](assets/selection-toolbar-838/capture-metadata.json)는 수동 시각 근거이며 소유자 승인을 대신하지 않는다.
- **결정·불일치:** [소유자 결정 P10][decision]. 메뉴 역할 자체의 알려진 불일치 없음. 표 Delete는 #793에서 상단 More의 기존 공용 danger 메뉴 항목으로 통합했다. 행·열의 명시적 대상, disabled 제한, 삭제·Undo 의미와 키보드 Enter/화살표/Esc 동작은 유지한다(P09/D08).

탭 줄의 숨은 탭 목록(#972)은 파일·탭 메뉴와 같은 공용 DropdownMenu를 사용한다.
가려진 탭 수와 이름·미저장 표시를 제공하고 키보드 선택으로 해당 탭을 드러낸다.

## P11 선택값·보기·탐색

- **목적·사용/비사용:** 값의 수와 의미에 맞는 선택 표현을 쓴다. 겉모양이 같아도 문서 값·보기 모드·탐색의 role과 저장 범위를 합치지 않는다.
- **목표:** 짧은 상호배타 값은 segment, 많은 값은 선택 메뉴, on/off는 checkbox를 기본으로 한다. 번호 field는 32px, shell view track은 28px이다. current와 keyboard focus의 단서는 독립적으로 유지한다.
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
경로를 표시한다. `assistant` 시나리오가 선택·중복·제거·참조만 보내기와 복원을
검증한다([현재 계약](main-agent-v1.md#대화와-표시)).

#974의 비서 대화 기록은 제목을 semibold 주 문구로, 현지화한 시각과 폴더 이름을
별도 보조 줄로 표시한다. 전체 경로는 tooltip으로 유지하며 항목은 공용 subtle
구분선과 목록 여백을 쓴다. 마지막 대화 선택은 origin별 UI 환경설정이며 새 대화는
기존 버튼으로 시작한다([현재 계약](main-agent-v1.md#대화와-표시)).

템플릿 갤러리는 단일 연결에서 시작 시점의 client를 유지한다. Host 선택기는 없으며 목록·미리보기·생성 picker·이름 Dialog·생성 탭이 같은 client를 쓴다. 현재 [템플릿 계약](document-templates-v1.md)을 따른다.

## P12 모달·파일·복구·설정 범위

#1461의 U22 플러그인 추가는 U23의 공통 FolderDialog를 유지하며, 목록 갱신으로 입력 초안과
focus를 초기화하지 않는다. App의 이미지 picker와 같은 고정 client의 안정된 조회 콜백을 사용한다.
선택한 플러그인이 외부에서 제거될 때만 기존 Dialog를 닫고 Notice로 안내한다.
`http-plugins`에서 갱신 응답 반영 뒤 초안·focus 보존과 외부 제거 안내를 확인한다.
새 표면·control·시각 토큰 예외는 없으며 [현재 계약](plugin-stage1-v1.md)을 따른다.

#1401은 U23의 폴더 메뉴에서 U24의 기존 DangerConfirmation을 연다. 일반 파일 삭제,
생성 Undo와 Settings의 복구 삭제에서 쓰는 Cancel 초기 focus·pending 방지·
살아남는 항목으로 복귀를 유지한다. 폴더는 미저장 문서를 버리는 선택 없이 저장을 요구한다.
저장된 탭·복구 정리는 성공 receipt 뒤에만 수행하고 실패·불확실 결과는 보존한다.
한국어 다크 1440/640px 캡처를 수동 검토했고, `file-actions`·`recovery-storage`에서
취소·미저장 거부·저장 후 닫기와 Host/폴더 경계의 복구 정리를 확인했다.
[현재 계약](editor-ux-shell-v1.md#child-folder-trash-1401).

- **#1285 현재 구현·검증:** 설정 → 저장·복구의 [앱 초기화](app-reset-v1.md)는 기존 Settings·`DangerConfirmation`을 재사용한다. U16의 복구 삭제와 같은 Cancel 초기 focus·복귀를 유지하며, 삭제/유지 범위와 실제 경로·빈 폴더 옵션은 확인 모달 안에 둔다. 기존 일반 파일 삭제/복구의 의미는 바꾸지 않는다. 로컬 browser의 native bridge stand-in으로 확인/취소·실제 Editor pending-work 거부 연결을 검사하고 1440px Light·640px 한국어 Dark 캡처를 검토했다. 실제 파일 삭제/종료는 별도 fixture/helper 계층, 실제 Electron 경로는 Windows CI에 둔다.

플러그인 설정: Plugins 설정의 secret 입력은 기존 Dialog·Input(password)·Button·Notice를 재사용한다. AI 설정·일반 플러그인 설정과 같은 설정 표면이며, 민감 값은 blur 자동 저장 대신 명시적 저장 후 즉시 비운다. 값 재조회와 비서 입력은 없다. 현재 계약·검증은 [Plugin stage 1](plugin-stage1-v1.md)을 따른다.

#1199의 사이드바 맨 아래 실행 계정 줄은 기존 Host 설정·탐색기의 HostStatus와
공용 Tooltip을 재사용한다. 설정·테마·메뉴 행은 바로 위에 유지한다.
계정은 단일 연결의 관측을 따르며 실행 계정·권한 설명은
hover/keyboard focus 툴팁으로 확인한다. [Shell 계약](editor-ux-shell-v1.md#활성-host-실행-계정-1199)을 따른다.

- **목적·사용/비사용:** 파일·복구·파괴 작업은 대상과 결과를 확인한다. metadata의 Done/바깥 적용을 이식하거나 기기 설정을 문서 Save에 묶지 않는다.
- **목표·현재 기준:** 기존 [UnsavedChangesDialog](../../apps/editor/src/shell/UnsavedChangesDialog.tsx), [DangerConfirmation](../../apps/editor/src/components/ui/danger-confirmation.tsx), 파일 dialog·비교 화면을 유지한다. 제목→대상→설명/문제→명시적 동사 action, 안전한 취소·focus 복귀, busy 중 중복 실행 방지가 기준이다. 앱 Settings는 문서와 오가는 단일 작업 탭, file preview·단축키는 읽기 dialog다.
- **사용처:** U22 앱 설정, U23 파일/폴더 picker·새 이름, U24 미저장·삭제·저장/복구 비교, U25 미리보기·단축키·참고문헌 연결.
- **키보드 경계 (#831):** 공용 Dialog는 native Undo/Redo가 modal 밖 입력·초안으로 이동하거나 수정하는 것을 차단한다. modal 안 입력의 자체 Undo/Redo는 유지하고, Escape는 활성 modal만 닫아 바깥 미적용 초안을 보존한다. 명령 센터도 같은 경계를 쓴다. #1032의 Settings 작업 탭도 같은 beforeinput 경계를 재사용하여 두 그룹에서 Settings 입력의 Undo/Redo가 다른 그룹의 문서 초안으로 이동하지 않게 하며, Settings 입력 자체의 native history는 유지한다. 비모달 알림 센터의 문서 history는 유지한다. [현재 Undo 계약](document-editing-v1.md#shared-history-and-editing-boundaries).

비서 패널(#931)의 좁은 창 오버레이는 U24/U25 dialog처럼 Tab 경계·Escape 닫기와
이전 편집 focus 복귀를 유지한다. 넓은 창에서는 비모달 오른쪽 패널이며 문서 상태를
유지한다. 처음 사용 안내는 U22의 기존 AI 설정·진단으로 연결한다. `assistant`가
미저장 문서 보존·focus 복귀와 640px 한국어 Dark의 가림/잘림을 검증한다
([현재 계약](main-agent-v1.md#대화와-표시)).

## 알려진 불일치

1단계 관찰에서 식별한 차이와 후속 목표의 추적 목록이다. 해결된 항목도 ID와 이슈 연결을 유지한다. 진행 상태는 후속 이슈의 열림·닫힘으로, 현재 구현·계약·검증은 해당 패턴 절에서 확인한다. #777은 이 문서와 추적 등록까지이며 첫 구현은 #776이다.

| ID · 패턴 | 사용처 · 목표 | 후속 이슈 |
| --- | --- | --- |
| D01 · P02/P11 | U01–U05 다섯 폼의 자동/고정 세그먼트·빈 고정 차단·자동 표시 번호를 공용 NumberField로 통일 | [#776](https://github.com/litzio/litzio/issues/776) |
| D02 · P01 | U10 교차참조·U08 링크와 U05/U07/U11 폼의 경계를 가용 콘텐츠 viewport로 통일. U09 인용은 공용 훅 변경만 포함하며 동결 기능 전용 변경은 제외 | [#782](https://github.com/litzio/litzio/issues/782) |
| D03 · P01/P04 | U05 표·U11 절 label의 대상 전체 팝오버·Done/바깥 pointer 적용·Esc 취소 ([현재 계약](#p04-적용취소완료)) | [#791](https://github.com/litzio/litzio/issues/791) |
| D04 · P01/P03/P04/P09 | U04 수식의 작은 metadata 진입을 원문 폼 진입과 분리 ([현재 계약](document-editing-v1.md#continuous-editing)) | [#788](https://github.com/litzio/litzio/issues/788) |
| D05 · P04 | U08 링크·U10 교차참조의 명시적 적용/취소와 초안 유지. U09 인용은 ADR-0008 동결로 제외 | [#790](https://github.com/litzio/litzio/issues/790) |
| D06 · P06 | U12 빈 제목에 선택적 제목 추가 안내, U01 pending Figure에 이미지 선택 / Mermaid 작성 진입 제공. 기존 caption·본문·목록의 빈 상태와 선택·clipboard 의미 유지 | [#786](https://github.com/litzio/litzio/issues/786) |
| D07 · P02/P07/P12 | U03/U14/U16의 적용 문서·지속 앱 문제를 창별 센터로 집계하고 위치 이동·해결/닫기/재발 처리. 입력·열린 비교 화면의 문맥 오류는 유지 | [#792](https://github.com/litzio/litzio/issues/792) |
| D08 · P03/P09/P10 | U05 표의 상단 속성 진입·동작 메뉴 삭제 ([계약·검증](table-interaction-v1.md#whole-table-tools-793)) | [#793](https://github.com/litzio/litzio/issues/793) |
| D09 · P05/P07 | U03–U05/U07–U11 짧은 속성 필드의 fill과 U01–U11 필드 오류 연결 통일(기존 연결은 보존) | [#789](https://github.com/litzio/litzio/issues/789) |
| D10 · P04 | U06 완료/취소(Done/Cancel), 그림과 같은 번역 재사용·기존 동작 유지 | [#787](https://github.com/litzio/litzio/issues/787) |

[decision]: https://github.com/litzio/litzio/issues/777#issuecomment-6510554436
[inventory]: ../reviews/ui-pattern-inventory-777.md
[usage]: ../reviews/ui-pattern-inventory-777.md#사용처-지도
[figure-view]: ../../apps/editor/src/node-views/figure-view.tsx
[equation-view]: ../../apps/editor/src/node-views/equation-view.tsx
[footnote-view]: ../../apps/editor/src/node-views/footnote-definition-view.tsx
[figure]: ../../apps/editor/src/figure-properties.tsx
[forms]: ../../apps/editor/src/block-properties.tsx
[number]: ../../apps/editor/src/numbering-properties.tsx

## Table view preference usage (#902, P10 / P11)

The table block menu uses a checkbox row with current check in a separate View group
(P10). The command center uses the same document-scoped action label and reports
the current value. Settings uses a two-option default selector (P11). This is a
path-scoped device preference shared by Edit, Read and comparison; it is independent
of document drafts, Save and Undo. See [table contract](table-interaction-v1.md#per-document-table-presentation-902).

#973: 문서가 없는 시작 화면과 플러그인 탭에서는 탭 줄의 문서 동작 묶음을 숨긴다.
일반 텍스트 문서의 지원 동작은 유지한다([현재 계약](editor-ux-shell-v1.md#title-strip-and-tab-row-actions-695)).

#1032: Settings는 Host가 머리·범주 탐색·스크롤·콘텐츠 열을 소유하고 각 범주는 내용만
그린다. 기존 Button·탭·입력 토큰과 [공용 설정 행 컴포넌트](../../apps/editor/src/components/ui/settings.tsx)를 재사용한다.
Settings 탭·진입의 pointer 이동은 metadata 바깥 적용 대신 탐색으로 처리해 초안을 보존한다. 일반 문서 탭 pointer 이동의 기존 바깥 적용은 유지한다.
앱 표시 설정의 즉시 반영과 AI의 순차 자동 저장은 문서 Save와 분리한다.
탭 사이 이동은 설정 초안을 유지하며 닫기·재시작은 미저장 설정 초안을 복원하지 않는다.
[탭 수명·키보드·전후 캡처](editor-ux-shell-v1.md#settings-task-tab-1032).

#990/#1025: 문서 탐색의 빈 상태는 기존 P06 안내를 유지하고 탭 아래 간격과 label
행 높이만 맞춘다. Explorer·문서 탐색·비서는 같은 내부 separator 손잡이를 공유한다.
독립 localStorage 너비는 문서 초안·Save와 분리하며 Settings 범주 열은 바꾸지 않는다.
[너비 제한과 배치](editor-layout-rules-v1.md#alignment-and-ownership)를 따른다.

#1106: 비서의 활성 문서에 미저장 변경이 있으면 기존 맥락 행에 짧게 저장된 버전 사용을
표시한다. 설명·경로는 공용 Tooltip의 hover·keyboard focus로 확인한다. 같은 패널의
context-usage·참조 경로 안내를 재사용하며 새 표면·공통 상호작용 예외는 없다.
[현재 계약](main-agent-v1.md#대화와-표시)을 따른다.

## Template gallery application (#936 phase 2)

The [gallery contract](document-templates-v1.md#editor-gallery-phase-2) applies the
existing task-tab shell, P12 independent Dialog boundary for saving a template and
P07 field feedback/Notice for naming and catalog errors. Settings remains the
comparison surface for independent tasks. Common Popover
owns the approved C hover/focus reading preview; it is not a metadata edit form.
One retained read-only DocumentEditor replaces preview content, with a short open
delay, keyboard-scroll region and Escape focus return. Cards expose creation
outside the preview. Descriptions stay on hover/focus; only the Built-in badge is
persistent. Existing tokens and Button variants apply; no public Plugin API is added.

#1159: U22 Settings와 비서 패널의 사용자 표시 이름은 비서(Assistant)로 통일한다. 기존 Settings·Dialog·Input을 유지하며 U23 새 문서와 이름 변경의 `.md` 중복 방지를 확인했다. [현재 계약](main-agent-v1.md), [Root picker 계약](http-host-v1.md#allowed-roots-and-open-folder).

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

부품 목록과 별도 영역에 `Table — 예시: 좁은 표`, `Table — 예시: 넓은 표(가로 스크롤)`, `Table — 예시: 열별 정렬·필터`를 둔다. 기존 Five columns/Twelve columns는 예시 제목으로 교체하며 열 개수는 부품 이름이나 상한이 아니다. 예시: fixture에는 숫자·날짜·문자열·boolean과 null/빈 문자열, 동률, 여러 열 조건을 포함한다.

공통 부품·갤러리에서 동작을 확인한다. 실제 조작으로 정렬 순환·키보드·aria-sort, 열 필터 AND·빈 값·초기화·행 수·빈 상태·불러온 행 안내을 확인한다. 원자료·Core 결과 불변을 확인하며 화면 locale 비교를 Core 계산 규칙에 이식하지 않는다. 타입 조합 검사는 공통 부품 계층에 모으고 같은 경우를 모든 화면에서 반복하지 않는다.

## 비서 공급자 원본 로그 (#1304)

기존 비서 패널에서 공통 Button ghost/icon-sm·Tooltip과 Lucide ExternalLink/FolderOpen을
재사용한다. 현재 대화의 메모장 열기·파일 위치 표시만 제공하며 새 열람 표면이나 공통 UI 예외는 없다.
브라우저·대화 부재는 tooltip과 disabled로 설명한다.
현재 지원 경계는 [비서 계약](main-agent-v1.md#현재-한계)을 따른다.

## PDF reading (#1337)

Multi-page PDF reading uses the existing task tab and DocumentTabs, while transient images retain FilePreviewDialog. The viewer reuses Button ghost/sm and icon-sm, Tooltip, Input and Notice, with Lucide zoom icons and existing theme surfaces. No new common interaction is introduced; PDF page surfaces are white to preserve source colors. The toolbar shows reading controls and page state only. 1440px light and 640px Korean dark are the manual visual checks in `pnpm browser:test file-preview --screenshots`.

## 플러그인 설정 고정 규칙 (#1334)

현재 목록은 공통 상태 점/톤과 톱니·스위치 배치를 사용하며, 비활성 플러그인도 정보와 설정에 진입한다. 설정 화면에는 플러그인 화면 이동 버튼을 두지 않는다. 화면 진입은 사이드바이며 “동작 · 이름” 합성 라벨은 금지한다.

설정 창 순서는 이름·버전·설명 → settingsSchema.properties 선언 순서의 일반 설정 → secret → 연결 확인 → 접힌 상세(신뢰 여부·digest)다. 설정 title은 라벨, description은 Tooltip 안내다. 화면에는 상태·대상·행동을 상시 표시한다. 연결 확인은 저장된 설정으로 실행하며 실행 중 표시, 연결됨/오류와 고정 안내를 제공한다. 꺼짐·미실행이면 버튼을 비활성화하고 Tooltip으로 이유를 보인다. 기존 Button·Tooltip·Dialog·Notice·settings 행·HostStatus 스타일을 재사용하며 새 공통 상호작용 예외는 없다.

설정 창 폭 후속 확인: 기존 `--layout-settings-content-width` 토큰(42.5rem)과 viewport 양쪽 16px 여백을 사용한다. 별도 크기 체계는 추가하지 않는다. URL·secret 입력과 긴 한국어 연결 안내를 포함한 detail 캡처를 갱신했고 1440px/640px에서 가로 overflow 없이 표시된다. 일반 설정의 Dialog 초안·저장 상태·실패 보존은 #1396의 연결 설정 계약을 따른다.

## Plugin icon images (#1346)

PluginIcon shares the same decorative 16px img in existing sidebar entries, DocumentTabs and plugin-heading rows. Existing flex alignment, spacing tokens and screen icon fallbacks remain; no new surface or common interaction. Image aspect ratio is contained. The [plugin contract](plugin-stage1-v1.md) owns format, bounds, trust and Host delivery. Fixture captures cover 1440px and Korean dark 640px; external-service icon artwork is separate.

## 플러그인 목록과 첫 켜기 확인 (#1379)

신뢰 여부·현재 digest는 설정 창 상세 정보에 둔다. 오류·사용할 수 없음만 플러그인 상태 줄에 표시하고 정상 실행·꺼짐은 기존 스위치로 표현한다. 처음 켜기는 기존 Dialog·Button·Notice로 확인하고, 취소 시 변경하지 않는다. 확인 요청은 창을 열 때 본 registrationId에 한정한다. 그동안 등록이 교체됐으면 Host의 구분된 거부 사유를 지역화해 알리고 창을 닫는다. 갱신된 목록에서 사용자가 다시 켜야 하며 이전 승인을 새 등록으로 옮기지 않는다. 신뢰 수명은 [플러그인 계약](plugin-stage1-v1.md)을 따른다. 새 공통 상호작용 예외는 없다. 설정 창의 접힌 상세 패턴을 재사용한다.

## 플러그인 연결 설정 (#1396)

기존 설정 Dialog, Input·SettingsSwitch와 FieldError·aria-invalid·aria-describedby 패턴을 재사용한다.
칸별 저장 중·저장됨·실패를 가까이에 표시하고 실패 시 초안을 보존한다. secret title은 라벨,
description은 Tooltip이다. 연결 확인은 순차 저장 완료 뒤 저장값으로 실행하고 실패 시 막는다.
상시 설명 대신 기존 hover·keyboard focus Tooltip을 유지한다. 새 표면·공통 상호작용 예외는 없다.
실행 계약은 [플러그인 1단계](plugin-stage1-v1.md)를 따른다.

## 비서의 읽기 위치와 작업 과정 (#1436/#1440)

기존 도킹 패널·native details/summary·outline sm Button·Lucide ArrowDown을 재사용한다.
대화·제출·상단 상태의 소유자는 그대로이며, 화면 내부의 접힘·스크롤 추적만 추가한다.
작업 과정은 진행 중에도 접히고 머리에 현재 단계만 짧게 표시한다. 질문·선택지와 필요한
사용자 행동은 항상 과정 밖에 남긴다. 새 내용은 읽던 위치를 덮어쓰지 않으며 하단 이동을
명시적으로 제공한다.
상단 비서 버튼(#1424)의 답변 필요 우선순위와 기존 AssistantQuestion을 함께 확인한다.

같은 UI 선택은 기존 U22 설정의 Button/Tooltip 및 패널의 native details와 대조했다.
공통 palette·spacing·control 치수 예외는 없다. 현재 동작은 [비서 계약](main-agent-v1.md#대화와-표시)을 따른다.
당시 진단·합성 캡처는 [축소 전 기록](https://github.com/litzio/litzio/blob/422e0c1e5499678623a7f5d2be0ad28e4f90a132/docs/design/main-agent-v1.md#assistant-reading-and-progress-1436-1440)에 있으며 소유자 시각 승인을 대신하지 않는다.

## 비서 질문·답변 기록 (#1443)

기존 AssistantQuestion의 native fieldset/radio·공용 Input/Button을 재사용한다.
작업 중 질문과 선택지·직접 입력은 과정 밖에 보이며, 답변 후에는 같은 카드에 질문과
답변 전달 상태를 읽기 전용으로 남긴다. 접기를 통해 필수 입력을 숨기지 않는다.
일반 비동기 질문은 턴 종료 뒤에도 답할 수 있고 후속 메시지로 전달한다. 공급자 차단 질문·승인은
원래 RPC가 끝나면 입력을 닫고 기록만 남긴다. 끝난 RPC의 콜백은 기록에서 복원하지 않는다.
상단 #1424 표시는 같은 대화의 pending/unknown 질문에서 계산한다.
카드 렌더링 확인은 사용자에게 별도 버튼을 요구하지 않고, 실제 카드가 mount된 창에서만
보낸다. 숨김 패널·기록 목록은 확인하지 않는다. 같은 대화를 연 다른 창도 확인할 수 있다.
U22의 기존 비서 질문과 비교했으며
새 공통 컨트롤·모달·시각 토큰 예외는 없다. 공용 Host 질문은 Copilot에도 제공하며
native ACP 질문 확장은 지원하지 않는다. [현재 계약](main-agent-v1.md#질문과-사용량).

## Assistant Context account and usage (#1446, P07 / P12)

The existing Context ring keeps its shared hover/keyboard-focus Tooltip. Account
and quota details appear only during interaction, using current Tooltip colors,
spacing and borders; no shell/control geometry changes. AI Settings (U22) and the
assistant panel share `AssistantAccount` / `AssistantRateLimits`, including login
state, email/plan and localized day/hour/minute durations, percent-used and compact
reset wording (today: time only; otherwise numeric month/day and time; no year or
seconds). Login method labels are localized. Quota rows stay on one line in the
standard max-w-md Tooltip. Failure stays as a short
Unavailable in this tooltip and does not enter chat errors or disable sending.
Copilot shows reported context and session usage; its current ACP integration has no account
quota diagnostic. No common interaction exception was introduced.

The [current contract](main-agent-v1.md#질문과-사용량) summarizes usage display.
Cache ownership and fixture evidence remain in the [earlier record](https://github.com/litzio/litzio/blob/422e0c1e5499678623a7f5d2be0ad28e4f90a132/docs/design/main-agent-v1.md#context-account-and-usage-1446).
Captures are manual review evidence, not owner visual approval.

## Business usage details (#1453, P07 / P12)

AI Settings (U22) and the Context ring retain the shared account/quota display and
Tooltip. Individual quota/remaining credit states and spending warnings use short
localized text and the existing compact reset format; period rows still use the
same component. Empty successful snapshots explicitly say No usage information.
The warning uses bold text within the existing contrasting surface, without a new
color or control. The [current contract](main-agent-v1.md#질문과-사용량) summarizes usage display.
Business response details and fixture evidence remain in the [earlier record](https://github.com/litzio/litzio/blob/422e0c1e5499678623a7f5d2be0ad28e4f90a132/docs/design/main-agent-v1.md#business-account-usage-1453).
No common interaction exception or new persistent chrome was introduced.

### 좁은 저장·복구 비교 라벨 (#1499)

U24의 기존 SourceCompare/VisualCompare와 ChoiceGroup을 재사용한다. 800px 이하에서는
열 머리글을 숨기고 변경 블록 앞에 현재 파일/미리보기 라벨을 표시한다. 변경 없는 문맥 블록은 라벨 없이 한 번만 표시하며 기존 접기 동작을 유지한다.
넓은 화면의 두 열 배치와 기존 간격·서체 토큰은 유지하며 새 표면·상호작용 예외는 없다.
한국어 Visual 선택은 ‘시각적 비교’다. [비교 계약](editing-session-save-v1.md#pre-save-visual-comparison-1201)을 따른다.

동일한 저장 비교 fixture의 Windows persistent Chrome 수동 캡처:
[640px 한국어 다크 Before](assets/compare-labels-1499/before-640.png) /
[After](assets/compare-labels-1499/after-640.png),
[1440px 한국어 Light Before](assets/compare-labels-1499/before-1440.png) /
[After](assets/compare-labels-1499/after-1440.png).

캡처의 로컬 경로는 가렸으며 비교 콘텐츠는 변경하지 않았다. 640px 다크의 라벨/내용 구분·한국어 줄바꿈과 1440px의 열 정렬·여백·잘림을 수동 확인했다.

추가 시각 확인: 좁은 폭의 열 머리글은 숨기고 변경 블록에만 라벨을 표시한다.
변경 없는 문맥과 동일한 문서 제목은 좁은 폭에서 한 번만 표시한다. 양쪽 full editor state와
기존 문맥 접기는 유지한다. 넓은 화면은 열 머리글만 사용한다.
위 저장·비서 After 캡처를 갱신했고 [복구 640px 한국어 다크](assets/compare-labels-1499/recovery-640.png)를 추가했다.
세 화면의 머리글 중복 제거·변경 라벨·문맥 한 번 표시·잘림·한국어 줄바꿈을 확인했다.
저장 비교의 기존 복구 기록 불변 단언은 최초 실패 후 전후 기록 진단을 추가했으며,
동일 단언은 이후 통과했다. 최초 실패의 원인은 확정하지 않았다.
복구의 문맥 양쪽 표시 전제는 새 요구에 맞게 한 번 표시 검사로 바꾸고 변경 블록 대응 검사는 유지했다.

## 플러그인 코드 화면 부품 (#1592 2-3)

현재 기준은 [화면 계약](plugin-screens-v1.md#화면-부품)과 UI gallery의 Screen parts다. 코드 화면에 기존 Button·Input·DataTable·Notice를 제공한다. 그래프·구간 선택에 기존 공용 구현은 없어 Recharts·Base UI Slider wrapper를 추가했다. Toolbar·SummaryCard·ScreenLayout은 기존 space·typography·subtle border를 조합하며 페이지 여백·제목 소유권을 중복하지 않는다. 강제 규칙이나 선언 문법을 추가하지 않는다. [실제 비서 전후 검토](../reviews/plugin-screen-code-1592.md#2-3--화면-부품과-디자인-안내)에 당시 표 열 배치·카드 높이 차이와 소유자 시각 승인 경계를 기록했다. #1592 후속에서는 코드 화면 표의 경계를 내용 폭으로 한정하고 Toolbar의 카드 높이·시작선을 맞췄다.

### 표 도구 표시 (#1481)

표는 caret이 격자 안이거나 해당 표 도구에 키보드 focus가 있을 때 현재 행·열 도구를 보여 준다. hover만으로 표시하지 않으며, 도구 표시·메뉴 열림은 문서 크기를 바꾸지 않는다. 메뉴 대상 강조는 선택이 아니다. 기존 Button·Popover·명시 대상 명령을 재사용한다. [표 계약](table-interaction-v1.md)이 배치·키보드·caption 예외를 소유한다.
