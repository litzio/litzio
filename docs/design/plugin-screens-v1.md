# 플러그인 화면 코드 계약

- Status: Implemented
- Authority: [ADR-0022](../adr/0022-plugin-screen-code.md), [실행·제작 계약](plugin-stage1-v1.md).
- Last verified: 2026-11-17 — DocumentView의 SDK props·제작 안내·문서 계약을 대조하고 합성 화면의 양방향 스크롤·클릭·배율·위치 알림·stale 억제·UI gallery를 Windows persistent Chrome으로 검증했다. 실제 AI 제작·실제 PDF 대조·packaged Desktop 수락·소유자 시각 승인은 포함하지 않는다.

## 연결 수명

화면 목록과 진입 대상은 단일 연결이다. 화면을 열 때 client를 캡처하며 다른 연결로 자동 전환하지 않는다. 연결 주소가 바뀐 뒤 기존 invoke·saveDocument는 전송 전에 거절한다. 화면/tab의 기존 id/key는 유지하고 다시 그리는 것만으로 다른 client를 선택하지 않는다. 열린 폴더 범위와 새 문서 저장의 안전 조건은 유지한다.

다른 클라이언트에서 플러그인을 설치·활성화·비활성화·제거·reload한 뒤 창에 다시 focus하거나 창이 다시 보이게 되면 기존 화면 목록을 다시 읽어 사이드바를 갱신한다(#1490). 같은 창의 변경은 기존 plugins-changed 통로로 갱신한다. 새 주기 조회는 추가하지 않는다. 열린 화면의 기존 2초 revision 확인과 비활성화·제거 시 Unavailable 표시는 유지한다.

지금 하지 않는 것: Host push 통로와 focus 전환 없이 나란히 열린 모든 창의 즉시 동기화. 다시 볼 조건: 여러 클라이언트 동시 사용이 실제 불편으로 보고될 때.

## 화면 실행

플러그인의 유일한 화면 형식은 React JS/JSX 코드다. manifest의 screen은 artifact 내부 진입 파일이고 default export 컴포넌트는 `React`, `ui`, `invoke`, `saveDocument`, `pickPath`, `openDocument`, `confirm`를 받는다. React는 앱 인스턴스를 공유하고 CSS 토큰·글꼴은 같은 화면 트리에서 상속한다.

Host는 검증·reload 시 esbuild로 artifact 내부 의존성을 번들한다. 실행 시 npm 설치나 원격 import 해석을 하지 않는다. 활성 plugin만 화면 코드와 artifact digest revision을 제공한다. 대상 Host의 `/api/plugin-screens`는 화면 목록/코드만 반환하고 선언형 catalog·validate·query 실행 API는 없다. 클라이언트는 CSP script-src의 blob 모듈로 실행한다. 샌드박스·iframe·권한 모델·서명·버전 협상은 만들지 않는다.

`invoke(localOperationId,input)`는 자기 plugin과 해당 화면의 HostClient에 고정한다. 공개 작업은 schema·effect·receipt를 공유하고 화면 전용 handler는 JSON을 전달한다. Core 문서 의미나 공식 저장을 화면에서 우회하지 않는다. disable·reload·Host 교체·연결 해제 시 이전 화면을 내리고 새 revision을 받는다. 열린 화면은 2초마다 코드 없이 revision을 확인하며 변경 시 새 코드를 받는다. 파일 감시·자동 reload는 아니다. import/render/cleanup 오류는 해당 화면에서 격리한다. async/event 오류는 작성자가 catch해 Notice로 표시한다.

invoke 실패는 Error.message에 Host가 정리한 텍스트를 담고 code(명시적 PluginPublicError일 때), errorKind, inputIssues, receipt를 덧붙인다. 예: `invoke("lookup", input).catch(e => setError(e.code ? e.code + ": " + e.message : e.message))`. Notice의 자식 텍스트로 표시하고 innerHTML로 삽입하지 않는다. 입력 진단의 필드 경로·이유와 공개 오류의 code/message 제한은 [실행 계약](plugin-stage1-v1.md#호출자에게-전달하는-실패-1634)을 따른다. 성공 반환값은 계속 result이며 receipt를 씌우지 않는다. 실패 receipt가 uncertain이면 대상을 확인한 뒤 재시도 여부를 결정한다.

## 화면 부품

비서 제작의 조건 협의와 계획 문서는 [비서 계약](main-agent-v1.md#플러그인)을 따른다. 질문 카드나 계획을 위한 새 화면 기능은 추가하지 않는다.

기존 Button/Input/Select/DataTable/Notice/Chart/Slider/Toolbar/SummaryCard/ScreenLayout과 앱의 토큰을 재사용한다. DataTable 행 타입은 DataTable 모듈이 소유하며 선언형 query 타입에 의존하지 않는다. 작업 탭의 틀은 템플릿 갤러리와 같은 surface·space-6 여백·제목 typography를 공유하며 전체 폭과 스크롤을 소유한다. 화면 제목은 manifest에서 한 번만 그리고 ScreenLayout의 title은 표시하지 않는다. ScreenLayout은 설명·상태·동작을 머리에, 내용을 본문에 그린다. 본문은 기본 전체 폭이며 narrow를 선택하면 기존 읽기 폭으로 가운데 정렬한다.

ui.ContextMenu는 기존 공통 ContextMenu를 사용한다. trigger는 focus 가능한 ReactElement, actions는 `{id,label,icon,visible?,disabled?,disabledReason?,danger?,run}` 배열이며 전체 메뉴의 disabled도 받는다. icon은 ReactNode이고 글자만 쓰면 null로 둔다. 비활성 이유는 기존 hover·keyboard focus tooltip을 쓴다. 구분선·하위 메뉴는 지원하지 않는다. 우클릭·Shift+F10·메뉴 키로 열고 Esc·바깥 클릭으로 닫는다. 항목 실행 후 명시적으로 다른 곳으로 focus를 옮기지 않았으면 trigger로 복귀한다. 메뉴는 주 동작의 유일한 진입점이 아니며 같은 동작을 화면 버튼에도 둔다.

ui.Button의 변형은 outline/default/ghost/destructive다. 생략 변형은 outline이며 주된 동작 하나에만 default를 명시한다. 과거 secondary 입력은 오류 없이 outline으로 그린다. Toolbar는 이름표가 달린 입력칸과 버튼을 아래쪽에 맞춘다. 요약 카드는 조작용과 별도의 Toolbar에 묶으며 같은 높이를 쓴다. DataTable은 공용 기본 밀도를 쓰며 폭은 내용에 맞추되 부모 폭을 넘으면 내부 가로 스크롤을 사용한다. 표 전체의 최소 폭은 두지 않고 셀은 기존 이름표 폭과 space-6의 합을 최소 폭, reading-preview-width를 최대 폭으로 사용한다. 긴 값은 셀 안에서 줄바꿈하며 fields의 number 열은 머리와 셀 모두 오른쪽 정렬한다. 정렬·필터 동작은 유지한다. 브라우저 기본 radio·checkbox·range·progress는 앱 루트의 포인트 색을 상속한다.

DataTable의 열 이름은 읽기 전용 값 이름 역할이며 정렬·필터 단추가 있어도 값과 시작선(숫자는 끝선)이 같다. 스크롤 상자 전체에는 focus 테두리를 그리지 않고, 행 선택 표는 현재 선택 행(없으면 첫 행), 그 밖의 표는 현재 칸에 표시한다. 링크·정렬·필터의 키보드 동작은 유지한다. 진행 문구·그래프 값은 본문, 축 이름·개수는 보조, 입력 이름표·그래프 제목·빈 상태 제목은 항목 이름 역할을 쓴다.

행이 없는 DataTable의 빈 안내는 표와 같은 폭을 쓰며, 한 열의 좁은 표에서도 안내 문구가 줄바꿈된다. 빈 안내의 문구와 status 역할은 유지한다.
플러그인 내용 영역(screen-layout)의 h2는 type-section-title, h3·h4는 type-item-name과 기존 간격 토큰으로 소제목 위계를 표현한다. 화면 틀 제목과 템플릿 갤러리의 제목 규칙은 유지한다.

제작자·비서에게 전달하는 디자인 안내의 단일 출처는 SDK의 SCREEN_UI_GUIDANCE다. authoring skill은 이 문자열을 그대로 포함한다. 제공 부품 사용을 강제하지 않으며 디자인 품질을 자동 보장하지 않는다. 읽기 전용 문서에는 DocumentView를, 자료와 문서 블록을 대응해서 볼 때는 [LinkedDocumentView](#자료와-문서-블록의-연결-띠)를 사용한다.

플러그인 부품 갤러리 1440px 수동 비교: Select [밝음 전](assets/plugin-screen-controls-1717/before-select-light.png)·[후](assets/plugin-screen-controls-1717/after-select-light.png), [어두움 전](assets/plugin-screen-controls-1717/before-select-dark.png)·[후](assets/plugin-screen-controls-1717/after-select-dark.png). ContextMenu [밝음](assets/plugin-screen-controls-1717/menu-light.png)·[어두움](assets/plugin-screen-controls-1717/menu-dark.png). 소유자 시각 승인은 포함하지 않는다.

대표 시각 비교(합성 플러그인, Windows persistent Chrome):

| 화면 | 변경 전 | 현재 |
| --- | --- | --- |
| DocumentView 1440 밝음 | [Before](assets/plugin-screen-consistency-1663/before-document-view-wide-1440-light.png) | [After](assets/plugin-screen-consistency-1663/after-document-view-wide-1440-light.png) |
| DocumentView 1440 어두움 | [Before](assets/plugin-screen-consistency-1663/before-document-view-wide-1440-dark.png) | [After](assets/plugin-screen-consistency-1663/after-document-view-wide-1440-dark.png) |
| DocumentView 640 밝음 | [Before](assets/plugin-screen-consistency-1663/before-document-view-wide-640-light.png) | [After](assets/plugin-screen-consistency-1663/after-document-view-wide-640-light.png) |
| 비서 질문 라디오 | [Before](assets/plugin-screen-consistency-1663/before-radio.png) | [After](assets/plugin-screen-consistency-1663/after-radio.png) |

같은 조건의 템플릿 갤러리: [Before](assets/plugin-screen-consistency-1663/before-consistency-gallery.png), [After](assets/plugin-screen-consistency-1663/after-consistency-gallery.png). 캡처는 수동 비교 근거이며 실제 AI 제작·소유자 시각 승인은 포함하지 않는다.

ui.Select는 label/value/onValueChange/options({value,label}[])와 선택적인 disabled/placeholder를 받는 단일 선택이다. SettingsSelect와 같은 SelectControl·스타일을 쓰고 이름표는 기본적으로 입력칸처럼 위에 둔다. hideLabel?:boolean은 필수 label을 접근성 이름으로 유지하면서 시각적으로만 숨긴다. 버튼과 나란한 도구 줄(Toolbar·ScreenLayout actions)에서만 쓰며 설정·폼에서는 이름을 보인다. 값이 없으면 placeholder로 무엇을 고르는지 알린다.

ui.DataTable의 rowKey는 행 식별 field다. onSelectRow(row)가 있을 때만 행을 클릭하거나 focus 후 Enter/Space로 선택한다. selectedKey(string|number)는 호출자가 소유하며 정렬·필터·페이지가 바꾸지 않는다. 선택 행은 aria-selected와 기존 선택 표면 토큰, hover는 hover 표면 토큰으로 표시한다. 셀 링크는 행 선택을 일으키지 않는다.

ui.Chart의 가로축 이름은 한 줄로 표시하며 긴 이름은 말줄임하고 표시 간격을 확보한다. 전체 값은 기존 hover·키보드 tooltip으로 확인한다. 날짜 문자열의 형식은 바꾸지 않는다. tooltip은 그래프 컨테이너 안에 가두므로 숨겨진 tooltip의 이전 좌표가 창 축소 후 작업 화면의 가로 스크롤을 만들지 않는다.

`confirm({title:string,message?:string,confirmLabel:string}) -> Promise<boolean>`은 기존 DangerConfirmation을 연다. 취소에 초기 focus를 두며 취소·Esc는 false, 위험 확인 버튼은 true다. 화면 reload/unmount 시 대기 요청은 pickPath처럼 AbortError로 거절한다. 중복 확인 요청은 Error로 거절한다. 일반 확인 변형은 없다.

### 머리 구역과 작업 흐름

화면 틀과 템플릿 갤러리는 TaskHeader를 공유한다. 제목은 기존 task-surface-title 크기·굵기·시작선을 유지한다. 설명은 제목 아래, 상태와 동작은 오른쪽에 놓이며 640px에서는 아래 줄로 내려간다. 머리는 sticky이며 본문과 구분선으로 나뉜다. 설정의 목록+상세 구조는 별도다.

`ui.ScreenLayout({description?,status?,actions?,width?,fillHeight?,children})`의 description은 머리에 표시한다. status에는 ui.Status, actions에는 ui.Button을 넣으며 채운 주 동작은 화면에 하나다. title은 받아도 그리지 않는다. width는 기본 full, narrow는 기존 settings-content-width 토큰으로 가운데 정렬한 읽기 폭이다. 표·그래프 중심은 full, 한 가지씩 진행하는 화면은 narrow를 쓴다.

루트 ScreenLayout에서 `fillHeight={true}`를 지정하면 본문은 머리 아래의 높이가 정해진 flex 열(column)이 된다. 작업 칸은 `flex: 1; min-height: 0`으로 맞추고 각 칸에 스크롤을 둔다. 탭은 작업 영역의 최소 높이(12rem)도 확보할 수 없을 때만 콘텐츠에 접근하도록 스크롤된다. 기본값 false는 콘텐츠 높이에 따라 기존처럼 탭을 스크롤한다. [갤러리 채우기 예제](assets/screen-fill-height-1742/screen-fill-after-1440x1000-light.png)는 문서와 자료 칸을 같은 높이로 표시한다.

- `ui.Status({tone,label,variant?,hideIndicator?})`: tone은 ok/progress/warning/error/neutral. 표시와 사람의 말로 된 글자의 알약이다. 원래 상태 식별자는 label로 넘기지 않는다. variant는 기본 pill이며 plain은 바탕과 안쪽 여백 없이 같은 점·색·고리를 쓴다. HostStatus도 이 부품의 plain을 쓴다. progress는 작게 도는 열린 고리이며 움직임 줄이기 설정에서는 정지한다. 다른 tone은 채운 점을 쓴다. hideIndicator는 기본 false이며 반복되는 완료 줄은 neutral/plain과 true를 함께 써 점 없이 보조 글씨로 표시한다. ok는 정상 의미 색(`--id-color-success`), neutral은 보조 글씨 색, progress는 포인트, warning/error는 기존 의미 색으로 표시와 글씨를 그린다. 바탕은 조용한 표면(`--id-color-surface-subtle`)을 유지한다. 본문에서도 쓸 수 있다.
- `ui.Steps({steps,current})`: 문자열 목록과 0부터 시작하는 현재 단계. 지난·현재·남은 단계를 구별하고 목록의 현재 항목은 aria-current="step"이다. 기본 위치는 머리 아래 내용 맨 위이며 클릭 이동은 없다.
- `ui.EmptyState({title,description?,action?})`: 보조 표면·점선 테두리·가운데 정렬로 다음에 할 한 가지를 안내한다.
- `ui.Progress({value?,label?})`: 기존 native progress와 포인트 색을 사용한다. value는 0..1, 생략하면 진행 정도를 모르는 상태다. progressbar 역할과 값·접근성 이름을 제공한다. 오래 걸리는 작업은 진행과 상태 문구를 함께 표시한다.

직접 스타일과 자유로운 구성은 계속 허용하며 화면 종류·상단 탭·구성 검사나 경고는 제공하지 않는다.

## 읽기 전용 문서 보기

`ui.DocumentView({path,target?,reloadKey?,scale?,height?,label?,onStateChange?,onVisibleBlockChange?,onBlockClick?,onVisibleBlockLayoutChange?})`는 이 화면의 고정 HostClient와 열린 폴더에 묶인다. path는 열린 폴더 안의 Host 절대 경로다. 상대 경로·폴더 밖·점 경로 탈출은 오류다. 파일 읽기는 기존 document GET 및 bibliography 읽기 경로를 쓰며 다른 Host나 로컬 경로로 fallback하지 않는다. 일반 문서 탭과 동일한 DocumentEditor를 readOnly/preview로 사용해 그림·수식·표·참조·테마를 표시한다. 블록 호버 테두리도 읽기 전용 문서 탭과 같이 유지하며, 문서 보기의 본문 여백을 기준으로 블록 영역을 감싼다. 문서가 없거나 지원하지 않는 형식이면 오류 상태를 보여 준다. 표는 번호·레이블 행을 유지하고 조작 도구용 여백을 예약하지 않는다([표 간격](table-interaction-v1.md#whole-table-tools-793), #1481). 화면 reload·언마운트·경로/다시 읽기 변경 시 이전 요청을 취소하고 늦은 응답은 표시하지 않는다.

- `target?: {revision:string,path:NodePath,highlight?:boolean}`: CLI `inspect --format json` 또는 Host 읽기 출력의 Core NodePath 배열을 그대로 받는다. 저장본 revision과 같을 때만 해당 블록 또는 표 셀에 이동·강조 규칙을 적용한다. 블록은 편집기의 블록 선택 윤곽을, 표 셀은 실제 렌더링 영역에 편집기의 현재 셀 윤곽을 사용한다. 미주 정의 경로는 뒤로 배치된 정의를, 호출이 들어 있는 문단 경로는 그 문단을 가리킨다. 인라인 호출 자체의 별도 경로·글자 범위·중첩 목록 항목 단위 탐색은 제공하지 않는다. 지원하지 않거나 없는 경로는 target-not-found로 알리고 강조하지 않는다.
- `target.highlight?: boolean`: 기본 true는 대상을 강조하고 보이는 영역을 벗어나면 이동한다. false는 강조 없이 대상 시작을 보기 위쪽에 맞춘다(문서 끝의 스크롤 한도 내에서). 이미 보이는 대상도 정렬하며 레이아웃 변화에도 사용자 스크롤 전까지 정렬을 유지한다.
- `onVisibleBlockChange?({revision,path})`: 사용자가 wheel·세로 스크롤 키·스크롤바로 직접 움직여 맨 위에 보이는 최상위 블록이 바뀌면 알린다. 스크롤 중에는 100ms보다 자주 호출하지 않고 멈추면 마지막 값을 한 번 더 알린다. target 이동·다시 읽기·레이아웃 변화는 알리지 않는다.
- `onBlockClick?({revision,path})`: 기본 포인터의 단순 클릭을 즉시 보고하고 최상위 블록 경로를 알린다. 더블클릭은 첫 클릭이 한 번 보고되고 두 번째 클릭은 보고되지 않는다. 표 셀은 표, 중첩 목록 항목은 최상위 목록 경로다. 끌어서 고르기·Shift+클릭·링크·참조·각주 번호는 보고하지 않고 기존 동작을 유지한다. 두 알림은 저장본 revision과 target revision이 다른 stale 상태에서 발생하지 않는다. 화면 코드가 알림으로 바깥 자료를 이동하고 highlight:false target으로 문서 보기를 따라오게 할 수 있다. 양쪽을 연결할 때 현재 사용자가 조작하는 영역은 화면 코드가 소유하고, 반대쪽의 늦은 마지막 알림이 그 조작을 덮지 않게 한다. target 변경은 저장본을 다시 읽지 않는다. reloadKey 변경은 보기를 다시 생성해 글자 선택을 끊을 수 있으므로 누른 블록 알림에는 바깥 자료의 이동만 연결하는 편이 안전하다.
- `onVisibleBlockLayoutChange?(layout: ScreenDocumentViewLayout)`: `ScreenDocumentViewLayout = { revision?: string; height: number; blocks: { path: NodePath; top: number; bottom: number }[] }`. 보이는 영역과 교차하는 최상위 블록만 문서 순서로 알린다. top·bottom은 내부 보이는 영역의 위쪽 가장자리(테두리 안쪽)를 0으로 한 CSS px이며, 걸친 블록은 음수 또는 height보다 큰 값을 가진다. height는 보이는 영역의 clientHeight다. 사용자 스크롤·target 이동·그림/수식/글꼴 로딩·폭/높이 변경·재읽기의 배치 변경을 모두 반영한다. animation frame당 최대 한 번, 값이 바뀔 때만 알린다. 읽는 중·오류·stale에는 빈 blocks를 알리며 저장본을 읽기 전에는 revision을 생략하고 영역이 없으면 height는 0이다. 같은 빈 상태는 반복하지 않는다. target-not-found라도 유효한 저장본의 위치는 보고한다. 화면 전체 좌표·가로 좌표·표 칸·중첩 블록은 제공하지 않는다. 대응 항목의 띠는 [LinkedDocumentView](#자료와-문서-블록의-연결-띠)를 사용한다.
- `reloadKey?: string|number`: 값을 바꾸면 저장본을 다시 읽는다. target 변경이나 현재 문서를 여전히 포함하는 무관한 폴더 목록 변경은 다시 읽지 않는다. 현재 문서가 열린 폴더 범위에서 빠지면 요청을 취소하고 표시를 지운다. polling·자동 변경 추적·오래된 경로 자동 재대응은 없다. 새 저장본의 revision이 target과 다르면 stale-target으로 알리고 이동·강조하지 않는다.
- `scale?: number`: 기본 1, 0.4~1 범위로 맞춘다(NaN은 1). 문서 보기 안의 문서에만 CSS zoom을 적용해 글자·그림·표·수식을 함께 줄이고 본문은 폭에 맞춰 다시 흐른다. 그림(Mermaid 포함)과 표는 배율 1의 가용 폭을 기준으로 줄이므로 넓은 그림이 축소 뒤에도 보기 폭을 채우지 않는다. transform 축소는 빈 여백과 레이아웃 크기를 남기므로 쓰지 않고, 글꼴 변수만 줄이는 방식은 그림·수식을 함께 줄이지 못하므로 쓰지 않는다. 강조는 축소 영역 밖에서 실제 CSS px로 그린다. 배율 변경 시 보던 최상위 블록을 유지하고, 다음 target 변경부터 다시 대상 이동을 따른다. 편집기 본체·저장본에는 영향이 없다.
- `height?: number | "fill"`: 숫자는 내부 스크롤 영역 높이(px)이며 기본은 480이다. `"fill"`은 높이가 정해진 부모를 채우고 내부에서 스크롤한다. `ScreenLayout`의 채우기 모드에서 문서 보기 옆의 칸도 같은 높이로 둘 수 있다. 외부 폭·배치는 플러그인이 정한다. `label?:string`은 접근성 이름(기본 Document preview)이다.
- `onStateChange?({state,revision?,message?})`: loading/ready/error/stale-target/target-not-found를 전달한다. 저장본을 읽으면 revision을 제공한다. 기존 문서 탭의 미저장 내용이 아닌 저장본 revision이다.

대상 이동은 처음 측정한 좌표에 고정하지 않는다. 렌더러가 수식·그림·글꼴·셀 배치 및 폭 변화를 관측해 좌표를 다시 보고하면, 대상이 내부 뷰포트에서 벗어났을 때 다시 보이게 한다. 넓은 표의 셀은 기존 표 자체의 가로 스크롤 상자 안에서 이동하고 강조도 그 상자에 맞춰 잘린다. 문서 보기나 플러그인 화면 전체를 가로로 이동시키지 않는다. 대상을 새로 지정하거나 저장본을 읽은 직후에도 강조할 대상이 이미 보이면 현재 스크롤 위치에서 강조만 한다. 사용자가 보기 또는 표 안에서 wheel·가로/세로 스크롤 키·스크롤바로 직접 스크롤하면 같은 대상에 대한 자동 위치 맞춤은 중단하고 강조 좌표만 갱신한다. 경로·revision·reloadKey가 바뀌거나 대상을 해제한 뒤 다시 지정하면 자동 위치 맞춤을 재개한다. 뷰포트보다 큰 대상은 시작 부분을 보여 준다. 임의의 시간 대기나 문서 의미 변경은 없다.

SDK props에는 엔진·DOM 타입이 없다. 편집·저장·복구·독립 편집 세션·검수 상태·대응 저장소·화면 전체 좌표·가로 좌표·셀/중첩 블록 좌표·연결선·PDF·탭 조작은 넣지 않는다. 화면 상호작용이므로 별도 CLI 명령은 만들지 않으며 읽기는 기존 inspect를 사용한다. UI gallery의 Document view는 합성 snapshot을 사용하는 같은 부품의 예제다. 새 색/대화/일반 상호작용 없이 기존 paper·간격·accent·warning Notice를 사용한다.

넓은 그림·표 축소(합성 자료·1440px 밝음): [1 전](assets/document-view-scale-1728/before-1.png) · [1 후](assets/document-view-scale-1728/after-1.png) · [0.5 전](assets/document-view-scale-1728/before-0.5.png) · [0.5 후](assets/document-view-scale-1728/after-0.5.png).

배율 갤러리(합성 자료·1440px): [밝음 1](assets/document-view-scale-1720/light-1-before-1440.png) · [밝음 0.5](assets/document-view-scale-1720/light-0.5-before-1440.png) · [어두움 1](assets/document-view-scale-1720/dark-1-before-1440.png) · [어두움 0.5](assets/document-view-scale-1720/dark-0.5-before-1440.png). [640px 한국어 밝음](assets/document-view-scale-1720/ko-light-640.png) · [어두움](assets/document-view-scale-1720/ko-dark-640.png). 그림 아래까지 스크롤한 표본: [밝음 1](assets/document-view-scale-1720/light-1-after-1440.png) · [밝음 0.5](assets/document-view-scale-1720/light-0.5-after-1440.png) · [어두움 1](assets/document-view-scale-1720/dark-1-after-1440.png) · [어두움 0.5](assets/document-view-scale-1720/dark-0.5-after-1440.png).

양방향 이동 갤러리(합성 자료·persistent Chrome): [1440 밝음 전](assets/document-view-scroll-1709/before-1440-light.png) · [1440 밝음 후](assets/document-view-scroll-1709/after-1440-light.png) · [1440 어두움 후](assets/document-view-scroll-1709/after-1440-dark.png) · [640 밝음](assets/document-view-scroll-1709/after-640-light.png) · [640 어두움](assets/document-view-scroll-1709/after-640-dark.png). 좁은 폭에서는 목록과 문서 보기를 세로로 배치한다. 두 영역을 나란히 비교할 때는 넓은 창을 권장한다. 공통 Toolbar·Button·Status·DocumentView를 재사용하며 새 표면·토큰은 없다. 소유자 시각 승인이나 실제 PDF 대조 검증은 포함하지 않는다.

블록 호버의 합성 표본(1440px): [갤러리 변경 전](assets/document-view-hover-1712/before-1440-dark.png) · [갤러리](assets/document-view-hover-1712/after-1440-dark.png), [두 열 화면 변경 전](assets/document-view-hover-1712/before-plugin-1440-light.png) · [두 열 화면](assets/document-view-hover-1712/after-plugin-1440-light.png).

기본 문서 보기의 기존 합성 표본: [1440 밝음](assets/plugin-document-view-1592/1440-light.png), [1440 어두움](assets/plugin-document-view-1592/1440-dark.png), [640 밝음](assets/plugin-document-view-1592/640-light.png). 왼쪽 원본 영역은 플러그인이 만든 placeholder이며 PDF viewer가 아니다. 이는 2026-11-13 캡처의 연결 복구이고 이번 실행 검증이나 소유자 시각 승인이 아니다.

셀 강조의 시각 확인 표본: [1440 밝음](assets/plugin-document-view-targets-1592/1440-light.png), [1440 어두움](assets/plugin-document-view-targets-1592/1440-dark.png), [640 밝음](assets/plugin-document-view-targets-1592/640-light.png), [640 어두움](assets/plugin-document-view-targets-1592/640-dark.png). 1440에서는 플러그인 화면의 절반을 문서 보기에 사용한다.

12열 표 마지막 셀의 가로 이동·강조 표본: [1440 밝음](assets/plugin-document-view-targets-1592/wide-1440-light.png), [1440 어두움](assets/plugin-document-view-targets-1592/wide-1440-dark.png), [640 밝음](assets/plugin-document-view-targets-1592/wide-640-light.png), [640 어두움](assets/plugin-document-view-targets-1592/wide-640-dark.png). 표 안에서만 가로로 이동하고 바깥 문서 보기는 가로로 넘치지 않는다.

각 DocumentView는 저장본을 따로 읽고 읽기 전용 DocumentEditor/Tiptap 인스턴스를 만든다. 한 화면에 여러 개를 동시에 mount하면 읽기·렌더링·레이아웃과 메모리 비용도 각각 든다. 현재 필요한 보기만 mount하도록 구성하는 것을 권장한다. 407블록의 고정 합성 표본과 단일 보기에서 최초 강조 약 1.45초(화면 코드 변경 감지 포함), 캐시가 있는 일반 재읽기 후 이동 169ms를 관측했다. 이는 성능 보장이나 여러 문서의 비교 측정이 아니다. 메모리·여러 보기 동시 표시의 응답성과 packaged Desktop에서의 동시 표시 동작은 검증하지 않았다.

## 자료와 문서 블록의 연결 띠

`ui.LinkedDocumentView({document,revision,source,sourceLabel,sourceRef?,sourceScale?,items,selectedId?,onSelect})`는 화면 코드가 그리는 자료 영역과 기존 DocumentView를 나란히 배치한다. `document`는 위 DocumentView props 전체를 받는다. `source`는 React 내용이며 이 부품이 스크롤 영역과 높이를 제공한다. `sourceLabel`은 자료 영역의 접근성 이름이고, `sourceRef`에는 그 스크롤 영역 요소(해제 시 null)가 전달된다. 필요하면 화면 코드가 ref로 자료의 스크롤을 읽거나 옮긴다.

`document.height: "fill"`을 넘기고 부모가 높이를 정하면 두 영역이 그 높이를 채운다. `<ui.ScreenLayout fillHeight>`의 본문에 바로 두면 도구 줄 아래 남은 높이를 사용한다. 좁은 영역의 세로 배치에서는 남은 높이를 두 스크롤 영역이 나눈다. 부모 높이 변경으로 보이는 끝점이 바뀌면 띠도 다시 그린다.

- `items`는 `{id,label,path,boxes,colorToken}` 배열이다. 각 항목에 고유한 문자열 `id`, 이름 `label`, 저장본의 최상위 Core NodePath와 한 개 이상의 상자를 전달한다. 상자 `{left,top,width,height}`는 테두리 안쪽의 스크롤 원점을 기준으로 배율이 이미 적용된 내용 CSS px다. 스크롤 위치는 빼지 않는다. `sourceScale`은 자료 쪽 윤곽의 확대 여백·선 두께·모서리 배율이며 기본값은 1이다. `colorToken`은 기본 띠에 쓸 `--id-color-*` 토큰 이름이다.
- 화면은 자료의 이름 있는 선택 버튼에 `data-linked-item={id}`와 `aria-pressed={selectedId === id}`를 지정한다. 이 버튼의 클릭과 Enter/Space, 대응하는 문서 블록 클릭과 이름 있는 키보드 선택 버튼, 띠의 거터 클릭이 `onSelect(id)`를 호출한다. Tab은 문서 보기에서 현재 보이는 연결 블록의 버튼을 방문하고, 버튼이 포커스되면 블록 위에 표시한다. 다른 블록은 보기를 스크롤한 뒤 방문할 수 있다. 문서 블록에 여러 항목이 연결되면 그중 선택된 항목을, 없으면 배열의 첫 항목을 사용한다. 띠 자체는 접근성 트리에서 제외한다.
- 선택 상태와 스크롤은 호출자가 제어한다. `selectedId`만 바꾸면 윤곽과 띠가 바뀐다. `document.target`, `sourceRef`, 기존 클릭·스크롤·배치 알림을 조합해 양쪽을 이동할 수 있다. 연결 상태는 저장본 `revision`과 일치할 때 활성화되며, 읽는 중·오류·stale target에서는 연결 띠와 선택 동작을 비운다.
- 보이는 양쪽 상자 사이에 채움 띠를 그린다. 올림·키보드 focus·선택은 [블록 윤곽](editor-visual-language-v1.md#블록-윤곽과-연결-띠)을 양쪽에 표시한다. 한쪽만 보이는 활성 짝은 띠가 보이지 않는 쪽의 위·아래 가장자리를 가리킨다. 띠와 윤곽의 끝은 각 스크롤 영역의 보이는 높이에 맞춰 잘린다. 자료의 분류 표시는 화면 코드가 그리고 윤곽은 그 위에 그린다. 좁은 영역에서는 자료와 문서 보기를 세로로 놓으며, 각 영역의 선택은 계속 사용할 수 있다.

[개발 갤러리의 Linked document view](../../apps/editor/src/dev/document-view-example.tsx)는 합성 자료의 공개 props와 앱의 Button·Toolbar를 사용한다.

| 합성 갤러리 | 밝음 | 어두움 |
| --- | --- | --- |
| 1440px 선택 | [캡처](assets/linked-document-view-1709/after-1440-light-selected.png) | [캡처](assets/linked-document-view-1709/after-1440-dark-selected.png) |
| 1440px 올림 | [캡처](assets/linked-document-view-1709/after-1440-light-hover.png) | [캡처](assets/linked-document-view-1709/after-1440-dark-hover.png) |
| 1440px 화면 밖 짝 | [캡처](assets/linked-document-view-1709/after-1440-light-offscreen.png) | [캡처](assets/linked-document-view-1709/after-1440-dark-offscreen.png) |
| 640px 한국어 | [캡처](assets/linked-document-view-1709/after-640-ko-light.png) | [캡처](assets/linked-document-view-1709/after-640-ko-dark.png) |

## 파일·폴더 선택과 문서 열기

화면은 `pickPath({kind:"pdf"|"folder"|"document"|"file",initialPath?,extensions?})`와 `openDocument({path})`를 받는다. Host/창 식별자는 없다. kind:"file"의 extensions는 선택적인 점 포함 확장자 배열(예: [".csv",".json"])이며 대소문자 구분 없이 목록을 거른다. 생략하면 확장자 없는 파일을 포함한 모든 파일을 보여 준다. 화면 상호작용이므로 별도 CLI 명령은 추가하지 않는다.

열린 폴더 범위 확인은 경로 문자열 기준이며 폴더 안의 링크를 따라간 실제 위치까지는 보장하지 않는다. Host의 허용 Root 제한은 그대로 적용된다. 이 한계는 pickPath 결과·openDocument·saveDocument에 공통이다. 예를 들어 Host가 A·B를 허용하고 화면에는 A만 열려 있을 때 A 안의 junction이 B를 가리키면, 그 주소를 통한 선택·열기·하위 폴더 저장이 B에 도달할 수 있다. Host가 A만 허용하면 기존 실제 경로 검증이 이를 거부한다. 화면의 열린 폴더 범위는 보안 경계가 아니다.

- pickPath는 기존 FolderDialog를 화면의 고정 client·현재 열린 폴더에 묶는다. initialPath는 탐색을 시작할 폴더의 Host 절대 경로이며 기본은 첫 열린 폴더다. PDF, 폴더, .md 문서 또는 일반 파일을 선택한다. 일반 파일은 기존 Folder listing의 `/api/folder`를 열린 Root에 고정해 재사용하며 숨김·정렬·허용 범위 규칙을 그대로 따른다. 나머지 종류는 기존 folder-browse를 쓴다. 파일 내용은 브라우저로 전달하지 않으며 플러그인은 받은 경로를 Node invoke에 넘겨 읽는다. 성공은 `{path,kind}`, 사용자 취소는 null, 읽기 실패·잘못된 초기 경로·중복 호출은 Error로 거부한다. 화면 reload/unmount·열린 폴더 목록 변경은 AbortError로 거부하고 읽기를 취소한다. 경로는 선택 직전에도 확인하며 열린 폴더 밖은 돌려주지 않는다. 새 폴더 열기·만들기와 최근 폴더 기록은 하지 않는다.
- openDocument는 .md 문서만 같은 Host의 기존 탭 열기 경로로 연다. 열린 폴더의 실제 식별자를 확인하고, 비동기 읽기 뒤에도 폴더 소속과 화면 수명을 확인한다. `{status:"opened",path}` 또는 `{status:"refused",path,message}`로 응답한다. reload/unmount의 취소는 AbortError다. 기존 미저장 탭은 그대로 활성화하고 저장본으로 교체하지 않는다. 대상 위치 이동은 제공하지 않는다.
- saveDocument의 open:true도 이 경로를 쓴다. 생성 성공 뒤에는 항상 생성 receipt를 유지하며 `opening:{status:"opened"|"refused",path,message?}`를 추가한다. 열기 거부·오류·화면 취소가 생성 실패로 바뀌지 않는다. opening이 refused여도 생성은 완료됐으므로 재시도하지 말고 receipt.path를 표시한다. open이 없거나 false면 opening도 없다. 생성 자체의 오류·통신 중단은 기존대로 reject하며 자동 재시도하지 않는다.

UI 갤러리 Screen parts의 Screen path selection은 합성 Host의 선택·폴더 범위 변경 예제다. 기존 FolderDialog·Dialog·Button·경로 필드·스크롤을 재사용하며 새 공통 표면이나 토큰은 추가하지 않는다.

선택 창의 배치·선택·탐색·정렬·키보드는 [공통 선택 창 계약](folder-picker-v1.md#behavior)을 따른다.

## 새 문서 저장

`saveDocument({name,authoring,images?,folder?,open?})`는 [공식 문서 작성 입력](document-support-v1.md#공식-문서-작성-입력)의 Core DocumentAuthoringInput으로 새 `.md`를 만든다. images는 SDK AuthoredDocumentRequest의 기존 `{key,mime,base64}[]` 입력을 그대로 사용하고 figure의 imageAsset key에 연결한다. 누락하면 빈 배열이다. key 대응·base64·이미지 검증과 기존 제한(그림당 10 MiB, 최대 256개, 전체 작성 요청 32 MiB)은 공통 작성 경로가 적용한다. 문서 게시 실패 뒤 완성된 공유 가능 asset은 남을 수 있다. 기본 위치는 화면 Host의 첫 열린 폴더다. folder를 지정하면 그 Host의 열린 폴더 또는 그 하위 폴더여야 하며, 열린 폴더가 없으면 거부한다. 허용 범위를 확인한 뒤 없는 하위 폴더를 만든다. 실패하면 이번 요청이 만든 빈 폴더만 지우고 다른 내용이나 완성된 공유 asset이 있으면 보존한다. 그림 이름은 아래 공식 문서 작성 입력의 key 규칙을 따른다. 경로는 대상 Host에서 해석한다. 다른 Host나 클라이언트 PC로 fallback하지 않는다.

공용 `PUT /api/document`와 CLI `create <path.md> --input <json-file> --format json`은 같은 createAuthoredDocumentFile을 사용한다. Core authorDocument의 의미·canonical round-trip과 file-commit의 임시 형제 파일 쓰기·fsync·배타적 hard-link 게시를 유지한다. 부분 쓰기/flush 실패는 최종 파일을 게시하지 않으며 기존 이름은 덮어쓰지 않는다. hard link 미지원 파일시스템은 우회하지 않고 실패한다. 기존 파일 수정·overwrite·별도 문서 형식·생성 문서 연결은 추가하지 않는다.

정상 의미 색 확인(#1678, 1440px):

| 화면 | 밝음 | 어두움 |
| --- | --- | --- |
| 다섯 상태 · 기본 Plum | [보기](assets/status-success-1678/status-gallery-plum-light.png) | [보기](assets/status-success-1678/status-gallery-plum-dark.png) |
| Green의 ok 점·progress 고리 비교 | [보기](assets/status-success-1678/status-gallery-green-light.png) | [보기](assets/status-success-1678/status-gallery-green-dark.png) |
| 플러그인 화면 머리 | [보기](assets/status-success-1678/plugin-header-light.png) | [보기](assets/status-success-1678/plugin-header-dark.png) |
| Host 연결됨 · 기본 Plum | [보기](assets/status-success-1678/status-host-light.png) | [보기](assets/status-success-1678/status-host-dark.png) |

Green에서는 ok와 progress의 색조 차이가 작아 색만으로 구별하기 어렵다. label도 함께 읽어야 하며 이 비교를 소유자가 확인해야 한다. 캡처는 합성 화면의 비교 근거이고 소유자 시각 승인을 뜻하지 않는다.

## 공용 정보 부품

`ui.Row({label,description?,children,kind?})`는 본체 SettingsRow와 동일한 Row 구현이다. 기본 item의 이름은 type-item-name, 읽기 전용 fact의 이름은 type-value-name, 값은 type-body다. 이름은 왼쪽, 값·컨트롤은 오른쪽 끝에 놓이고 여러 컨트롤은 가로로 놓인다. 값 자리는 내용 폭이며 행 폭의 60% 안에서 줄바꿈한다. 이름은 나머지 폭을 사용한다. select와 텍스트 입력칸만 기존 `--layout-settings-control-width` 토큰을 자신의 폭으로 사용한다. 부모 폭이 좁으면 아래 왼쪽으로 내려가므로 narrow 열에서도 동작한다. fact는 각 줄마다 dl/dt/dd 한 쌍으로 만든다. 혼합 Section과 단독 줄에도 유효한 정의 목록 의미를 보존하기 위해서다. 숫자·날짜·버전은 tabular-nums, 경로·식별자는 code로 감싸 mono 보조 크기를 쓴다. Row가 code 안의 문자열을 `/`, `\`, `.`, `-`, `_` 뒤의 wbr 요소로 나눠 먼저 그 위치에서 줄바꿈하고, 구분자 없는 긴 조각만 글자 단위로 접는다. 보이지 않는 문자를 넣지 않아 복사한 원문은 그대로다. 행 자체를 focus 대상으로 만들지 않으며 내부 컨트롤의 label·Tab 순서를 보존한다.

`ui.Section({title,description?,children})`은 여러 줄의 묶음이다. 이름은 type-group-title과 아래 구분선이며 묶음 간 간격은 space-6이다. 항목 하나에는 묶음을 만들지 않고 항목 이름을 제목으로 반복하지 않는다. description은 결과를 바꾸는 설명만 준다.

플러그인 h2는 type-section-title, h3·h4는 type-item-name의 역할 정의를 공유한다. 문서 보기 안 제목은 제외한다. SummaryCard의 이름·설명은 item-name·helper이며 값은 범주 제목과 같은 글씨(type-category-title)를 쓴다.

PanelHeader는 본체 패널의 구역 제목·아이콘·오른쪽 동작과 heading level을 제공한다. PanelHeader의 높이는 문서 탭 줄의 기존 토큰을 쓰며 제목·동작은 세로 가운데다. 작업 탭 제목은 TaskHeader가 계속 소유한다. 좌우 여백·구분선은 shared-parts.css에서 공유하되 TaskHeader의 높이·세로 여백은 별도이며 패널 머리에 적용하지 않는다. 본체의 패널별 좌우 여백은 내용의 시작선에 맞춘다. 문서 패널의 탐색 탭은 구조를 유지하고 PanelHeader와 높이·구분선을 맞춘다.

### 공용 부품 비교 캡처 (#1690)

한국어 합성 화면을 persistent Chrome으로 확인했다. 실제 AI 호출·실제 변환 업무·packaged Desktop·소유자 시각 승인은 포함하지 않는다. 설정의 작업 폴더는 로컬 식별자 노출을 피하려고 가렸다. Before는 변경 전 소스, After는 같은 시나리오의 공용 부품 적용 결과다.

| 대상 | 1440 밝음 | 1440 어두움 | 640 밝음 |
| --- | --- | --- | --- |
| 갤러리 | [전](assets/settings-parts-1685/before-gallery-1440-light.png) / [후](assets/settings-parts-1685/gallery-1440-light.png) | [전](assets/settings-parts-1685/before-gallery-1440-dark.png) / [후](assets/settings-parts-1685/gallery-1440-dark.png) | [전](assets/settings-parts-1685/before-gallery-640-light.png) / [후](assets/settings-parts-1685/gallery-640-light.png) |
| 플러그인 full | [전](assets/settings-parts-1685/before-plugin-full-1440-light.png) / [후](assets/settings-parts-1685/plugin-full-1440-light.png) | [전](assets/settings-parts-1685/before-plugin-full-1440-dark.png) / [후](assets/settings-parts-1685/plugin-full-1440-dark.png) | [전](assets/settings-parts-1685/before-plugin-full-640-light.png) / [후](assets/settings-parts-1685/plugin-full-640-light.png) |
| 플러그인 narrow | [전](assets/settings-parts-1685/before-plugin-narrow-1440-light.png) / [후](assets/settings-parts-1685/plugin-narrow-1440-light.png) | [전](assets/settings-parts-1685/before-plugin-narrow-1440-dark.png) / [후](assets/settings-parts-1685/plugin-narrow-1440-dark.png) | [전](assets/settings-parts-1685/before-plugin-narrow-640-light.png) / [후](assets/settings-parts-1685/plugin-narrow-640-light.png) |

갤러리의 좁은 열은 창 폭과 무관한 부모 폭 검증이다. 이름 시작선·값 끝선·select 폭·버튼 두 개·긴 경로 줄바꿈은 자동 geometry 비교와 캡처를 함께 확인한다. 각 줄은 focus를 가로채지 않고 내부 컨트롤만 Tab으로 방문한다. Status 진행 고리는 공통 motion-safe 전환 규칙과 reduced motion을 따른다.

설정 다섯 범주와 플러그인 설정 창의 현재 전후 근거는 [설정 패턴](ui-patterns-v1.md#설정의-묶음과-줄)을 따른다.

## 화면 글씨 역할 검토

Windows persistent Chrome에서 한국어 앱으로 공용 부품·합성 플러그인 예제와 앱 화면을 비교했다. 실제 AI 호출·설치형 Desktop·소유자 시각 승인은 포함하지 않는다. 갤러리 자체의 예제 문구는 영어를 유지한다. 캡처에서 로컬 계정·경로 영역은 가렸다.

| 화면 | 1440 밝음 전 / 후 | 1440 어두움 전 / 후 | 640 밝음 전 / 후 |
| --- | --- | --- | --- |
| 화면 흐름 | [전](assets/plugin-parts-rest-1687/before-Screen-parts-1440-light.png) / [후](assets/plugin-parts-rest-1687/after-Screen-parts-1440-light.png) | [전](assets/plugin-parts-rest-1687/before-Screen-parts-1440-dark.png) / [후](assets/plugin-parts-rest-1687/after-Screen-parts-1440-dark.png) | [전](assets/plugin-parts-rest-1687/before-Screen-parts-640-light.png) / [후](assets/plugin-parts-rest-1687/after-Screen-parts-640-light.png) |
| 그래프 | [전](assets/plugin-parts-rest-1687/before-chart-1440-light.png) / [후](assets/plugin-parts-rest-1687/after-chart-1440-light.png) | [전](assets/plugin-parts-rest-1687/before-chart-1440-dark.png) / [후](assets/plugin-parts-rest-1687/after-chart-1440-dark.png) | [전](assets/plugin-parts-rest-1687/before-chart-640-light.png) / [후](assets/plugin-parts-rest-1687/after-chart-640-light.png) |
| 표 | [전](assets/plugin-parts-rest-1687/before-table-1440-light.png) / [후](assets/plugin-parts-rest-1687/after-table-1440-light.png) | [전](assets/plugin-parts-rest-1687/before-table-1440-dark.png) / [후](assets/plugin-parts-rest-1687/after-table-1440-dark.png) | [전](assets/plugin-parts-rest-1687/before-table-640-light.png) / [후](assets/plugin-parts-rest-1687/after-table-640-light.png) |
| 파일 선택 | [전](assets/plugin-parts-rest-1687/before-picker-1440-light.png) / [후](assets/plugin-parts-rest-1687/after-picker-1440-light.png) | [전](assets/plugin-parts-rest-1687/before-picker-1440-dark.png) / [후](assets/plugin-parts-rest-1687/after-picker-1440-dark.png) | [전](assets/plugin-parts-rest-1687/before-picker-640-light.png) / [후](assets/plugin-parts-rest-1687/after-picker-640-light.png) |
| 대화상자 | [전](assets/plugin-parts-rest-1687/before-dialog-1440-light.png) / [후](assets/plugin-parts-rest-1687/after-dialog-1440-light.png) | [전](assets/plugin-parts-rest-1687/before-dialog-1440-dark.png) / [후](assets/plugin-parts-rest-1687/after-dialog-1440-dark.png) | [전](assets/plugin-parts-rest-1687/before-dialog-640-light.png) / [후](assets/plugin-parts-rest-1687/after-dialog-640-light.png) |
| 위험 확인 | [전](assets/plugin-parts-rest-1687/before-danger-1440-light.png) / [후](assets/plugin-parts-rest-1687/after-danger-1440-light.png) | [전](assets/plugin-parts-rest-1687/before-danger-1440-dark.png) / [후](assets/plugin-parts-rest-1687/after-danger-1440-dark.png) | [전](assets/plugin-parts-rest-1687/before-danger-640-light.png) / [후](assets/plugin-parts-rest-1687/after-danger-640-light.png) |
| 메뉴 | [전](assets/plugin-parts-rest-1687/before-menu-1440-light.png) / [후](assets/plugin-parts-rest-1687/after-menu-1440-light.png) | [전](assets/plugin-parts-rest-1687/before-menu-1440-dark.png) / [후](assets/plugin-parts-rest-1687/after-menu-1440-dark.png) | [전](assets/plugin-parts-rest-1687/before-menu-640-light.png) / [후](assets/plugin-parts-rest-1687/after-menu-640-light.png) |
| 오류 알림 | [전](assets/plugin-parts-rest-1687/before-notifications-1440-light.png) / [후](assets/plugin-parts-rest-1687/after-notifications-1440-light.png) | [전](assets/plugin-parts-rest-1687/before-notifications-1440-dark.png) / [후](assets/plugin-parts-rest-1687/after-notifications-1440-dark.png) | [전](assets/plugin-parts-rest-1687/before-notifications-640-light.png) / [후](assets/plugin-parts-rest-1687/after-notifications-640-light.png) |
| 시작 | [전](assets/plugin-parts-rest-1687/before-start-1440-light.png) / [후](assets/plugin-parts-rest-1687/after-start-1440-light.png) | [전](assets/plugin-parts-rest-1687/before-start-1440-dark.png) / [후](assets/plugin-parts-rest-1687/after-start-1440-dark.png) | [전](assets/plugin-parts-rest-1687/before-start-640-light.png) / [후](assets/plugin-parts-rest-1687/after-start-640-light.png) |
| 새 문서 | [전](assets/plugin-parts-rest-1687/before-new-1440-light.png) / [후](assets/plugin-parts-rest-1687/after-new-1440-light.png) | [전](assets/plugin-parts-rest-1687/before-new-1440-dark.png) / [후](assets/plugin-parts-rest-1687/after-new-1440-dark.png) | [전](assets/plugin-parts-rest-1687/before-new-640-light.png) / [후](assets/plugin-parts-rest-1687/after-new-640-light.png) |
| 명령 센터 | [전](assets/plugin-parts-rest-1687/before-commands-1440-light.png) / [후](assets/plugin-parts-rest-1687/after-commands-1440-light.png) | [전](assets/plugin-parts-rest-1687/before-commands-1440-dark.png) / [후](assets/plugin-parts-rest-1687/after-commands-1440-dark.png) | [전](assets/plugin-parts-rest-1687/before-commands-640-light.png) / [후](assets/plugin-parts-rest-1687/after-commands-640-light.png) |
| 단축키 | [전](assets/plugin-parts-rest-1687/before-shortcuts-1440-light.png) / [후](assets/plugin-parts-rest-1687/after-shortcuts-1440-light.png) | [전](assets/plugin-parts-rest-1687/before-shortcuts-1440-dark.png) / [후](assets/plugin-parts-rest-1687/after-shortcuts-1440-dark.png) | [전](assets/plugin-parts-rest-1687/before-shortcuts-640-light.png) / [후](assets/plugin-parts-rest-1687/after-shortcuts-640-light.png) |
| 템플릿 | [전](assets/plugin-parts-rest-1687/before-templates-1440-light.png) / [후](assets/plugin-parts-rest-1687/after-templates-1440-light.png) | [전](assets/plugin-parts-rest-1687/before-templates-1440-dark.png) / [후](assets/plugin-parts-rest-1687/after-templates-1440-dark.png) | [전](assets/plugin-parts-rest-1687/before-templates-640-light.png) / [후](assets/plugin-parts-rest-1687/after-templates-640-light.png) |
| 문서 주변 도구 | [전](assets/plugin-parts-rest-1687/before-editor-tools-1440-light.png) / [후](assets/plugin-parts-rest-1687/after-editor-tools-1440-light.png) | [전](assets/plugin-parts-rest-1687/before-editor-tools-1440-dark.png) / [후](assets/plugin-parts-rest-1687/after-editor-tools-1440-dark.png) | [전](assets/plugin-parts-rest-1687/before-editor-tools-640-light.png) / [후](assets/plugin-parts-rest-1687/after-editor-tools-640-light.png) |

종이 안 글씨는 역할 계측에서 제외한다.
