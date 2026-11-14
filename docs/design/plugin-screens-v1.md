# 플러그인 화면 코드 계약

> 2026-11-13 소유자 결정(#1595): 다른 PC의 Host 등록·접속과 여러 Host UI는 삭제했다. 같은 PC의 공유 daemon·수동 다시 연결, CLI `--host <origin>`과 개발·검사용 독립 HTTP Host는 유지한다. 연결과 화면은 단일 Host로 정리했다. 작업·세션에 고정된 client와 취소/세대 보호는 유지한다. 기억·복구는 새 namespace에서 path로 식별하고 옛 기록을 자동 변환·삭제하지 않는다. 삭제 전 구현은 `archive/2026-11-13-plugins-declarative`에 보관한다. `multi-host`·`host-settings`의 삭제 전 검증/캡처 언급은 역사 기록이며 현재 실행 목록이 아니다. 로컬 회귀는 `local-host`·`document-tabs`·HTTP recovery를 따른다.

- Status: Implemented
- Authority: [ADR-0022](../adr/0022-plugin-screen-code.md), [실행·제작 계약](plugin-stage1-v1.md).
- Last verified: 2026-11-14 — #1634 invoke 오류의 code/message·진단·receipt 전달 추가.
- Previous verification: 2026-11-14 — #1592 DocumentView 셀·지연 배치·폭 변경·미주 탐색을 격리 HTTP Host의 브라우저 시나리오로 확인.

## 연결 수명

화면 목록과 진입 대상은 단일 연결이다. 화면을 열 때 client를 캡처하며 다른 연결로 자동 전환하지 않는다. 연결 주소가 바뀐 뒤 기존 invoke·saveDocument는 전송 전에 거절한다. 화면/tab의 기존 id/key는 유지하고 다시 그리는 것만으로 다른 client를 선택하지 않는다. 열린 폴더 범위와 새 문서 저장의 안전 조건은 유지한다.

## 화면 실행

플러그인의 유일한 화면 형식은 React JS/JSX 코드다. manifest의 screen은 artifact 내부 진입 파일이고 default export 컴포넌트는 `React`, `ui`, `invoke`, `saveDocument`, `pickPath`, `openDocument`를 받는다. React는 앱 인스턴스를 공유하고 CSS 토큰·글꼴은 같은 화면 트리에서 상속한다.

Host는 검증·reload 시 esbuild로 artifact 내부 의존성을 번들한다. 실행 시 npm 설치나 원격 import 해석을 하지 않는다. 활성 plugin만 화면 코드와 artifact digest revision을 제공한다. 대상 Host의 `/api/plugin-screens`는 화면 목록/코드만 반환하고 선언형 catalog·validate·query 실행 API는 없다. 클라이언트는 CSP script-src의 blob 모듈로 실행한다. 샌드박스·iframe·권한 모델·서명·버전 협상은 만들지 않는다.

`invoke(localOperationId,input)`는 자기 plugin과 해당 화면의 HostClient에 고정한다. 공개 작업은 schema·effect·receipt를 공유하고 화면 전용 handler는 JSON을 전달한다. Core 문서 의미나 공식 저장을 화면에서 우회하지 않는다. disable·reload·Host 교체·연결 해제 시 이전 화면을 내리고 새 revision을 받는다. 열린 화면은 2초마다 코드 없이 revision을 확인하며 변경 시 새 코드를 받는다. 파일 감시·자동 reload는 아니다. import/render/cleanup 오류는 해당 화면에서 격리한다. async/event 오류는 작성자가 catch해 Notice로 표시한다.

invoke 실패는 Error.message에 Host가 정리한 텍스트를 담고 code(명시적 PluginPublicError일 때), errorKind, inputIssues, receipt를 덧붙인다. 예: `invoke("lookup", input).catch(e => setError(e.code ? e.code + ": " + e.message : e.message))`. Notice의 자식 텍스트로 표시하고 innerHTML로 삽입하지 않는다. 입력 진단의 필드 경로·이유와 공개 오류의 code/message 제한은 [실행 계약](plugin-stage1-v1.md#호출자에게-전달하는-실패-1634)을 따른다. 성공 반환값은 계속 result이며 receipt를 씌우지 않는다. 실패 receipt가 uncertain이면 대상을 확인한 뒤 재시도 여부를 결정한다.

## 화면 부품

비서 제작의 조건 협의와 계획 문서는 [비서 계약](main-agent-v1.md#플러그인)을 따른다. 질문 카드나 계획을 위한 새 화면 기능은 추가하지 않는다.

기존 Button/Input/DataTable/Notice/Chart/Slider/Toolbar/SummaryCard/ScreenLayout과 앱의 토큰을 재사용한다. DataTable 행 타입은 DataTable 모듈이 소유하며 선언형 query 타입에 의존하지 않는다. 필요한 배치와 모양은 plugin이 정한다. 제공 부품 사용을 강제하지 않으며 디자인 품질을 자동 보장하지 않는다. 읽기 전용 문서 표시는 아래 DocumentView를 제공한다. 원본 대조·검수 틀은 제공하지 않는다.

## 읽기 전용 문서 보기

`ui.DocumentView({path,target?,reloadKey?,height?,label?,onStateChange?})`는 이 화면의 고정 HostClient와 열린 폴더에 묶인다. path는 열린 폴더 안의 Host 절대 경로다. 상대 경로·폴더 밖·점 경로 탈출은 오류다. 파일 읽기는 기존 document GET 및 bibliography 읽기 경로를 쓰며 다른 Host나 로컬 경로로 fallback하지 않는다. 일반 문서 탭과 동일한 DocumentEditor를 readOnly/preview로 사용해 그림·수식·표·참조·테마를 표시한다. 문서가 없거나 지원하지 않는 형식이면 오류 상태를 보여 준다. 화면 reload·언마운트·경로/다시 읽기 변경 시 이전 요청을 취소하고 늦은 응답은 표시하지 않는다.

- `target?: {revision:string,path:NodePath}`: CLI `inspect --format json` 또는 Host 읽기 출력의 Core NodePath 배열을 그대로 받는다. 저장본 revision과 같을 때만 해당 블록 또는 표 셀로 내부 스크롤을 이동하고 강조한다. 셀 경로는 그 셀의 실제 렌더링 영역을 강조한다. 미주 정의 경로는 뒤로 배치된 정의를, 호출이 들어 있는 문단 경로는 그 문단을 가리킨다. 인라인 호출 자체의 별도 경로·글자 범위·중첩 목록 항목 단위 탐색은 제공하지 않는다. 지원하지 않거나 없는 경로는 target-not-found로 알리고 강조하지 않는다.
- `reloadKey?: string|number`: 값을 바꾸면 저장본을 다시 읽는다. target 변경이나 현재 문서를 여전히 포함하는 무관한 폴더 목록 변경은 다시 읽지 않는다. 현재 문서가 열린 폴더 범위에서 빠지면 요청을 취소하고 표시를 지운다. polling·자동 변경 추적·오래된 경로 자동 재대응은 없다. 새 저장본의 revision이 target과 다르면 stale-target으로 알리고 이동·강조하지 않는다.
- `height?: number`: 내부 스크롤 영역 높이(px), 기본 480. 외부 폭·배치는 플러그인이 정한다. `label?:string`은 접근성 이름(기본 Document preview)이다.
- `onStateChange?({state,revision?,message?})`: loading/ready/error/stale-target/target-not-found를 전달한다. 저장본을 읽으면 revision을 제공한다. 기존 문서 탭의 미저장 내용이 아닌 저장본 revision이다.

대상 이동은 처음 측정한 좌표에 고정하지 않는다. 렌더러가 수식·그림·글꼴·셀 배치 및 폭 변화를 관측해 좌표를 다시 보고하면, 대상이 내부 뷰포트에서 벗어났을 때 다시 보이게 한다. 넓은 표의 셀은 기존 표 자체의 가로 스크롤 상자 안에서 이동하고 강조도 그 상자에 맞춰 잘린다. 문서 보기나 플러그인 화면 전체를 가로로 이동시키지 않는다. 이미 보이는 대상은 매 측정마다 맨 위로 옮기지 않는다. 사용자가 보기 또는 표 안에서 wheel·가로/세로 스크롤 키·스크롤바로 직접 스크롤하면 같은 대상에 대한 자동 위치 맞춤은 중단하고 강조 좌표만 갱신한다. 경로·revision·reloadKey가 바뀌거나 대상을 해제한 뒤 다시 지정하면 자동 위치 맞춤을 재개한다. 뷰포트보다 큰 대상은 시작 부분을 보여 준다. 임의의 시간 대기나 문서 의미 변경은 없다.

SDK props에는 엔진·DOM 타입이 없다. 편집·저장·복구·독립 편집 세션·검수 상태·대응 저장소·동기 스크롤·연결선·PDF·탭 조작은 넣지 않는다. 화면 상호작용이므로 별도 CLI 명령은 만들지 않으며 읽기는 기존 inspect를 사용한다. UI gallery의 Document view는 합성 snapshot을 사용하는 같은 부품의 예제다. 새 색/대화/일반 상호작용 없이 기존 paper·간격·accent·warning Notice를 사용한다.

셀 강조의 시각 확인 표본: [1440 밝음](assets/plugin-document-view-targets-1592/1440-light.png), [1440 어두움](assets/plugin-document-view-targets-1592/1440-dark.png), [640 밝음](assets/plugin-document-view-targets-1592/640-light.png), [640 어두움](assets/plugin-document-view-targets-1592/640-dark.png). 1440에서는 플러그인 화면의 절반을 문서 보기에 사용한다.

12열 표 마지막 셀의 가로 이동·강조 표본: [1440 밝음](assets/plugin-document-view-targets-1592/wide-1440-light.png), [1440 어두움](assets/plugin-document-view-targets-1592/wide-1440-dark.png), [640 밝음](assets/plugin-document-view-targets-1592/wide-640-light.png), [640 어두움](assets/plugin-document-view-targets-1592/wide-640-dark.png). 표 안에서만 가로로 이동하고 바깥 문서 보기는 가로로 넘치지 않는다.

각 DocumentView는 저장본을 따로 읽고 읽기 전용 DocumentEditor/Tiptap 인스턴스를 만든다. 한 화면에 여러 개를 동시에 mount하면 읽기·렌더링·레이아웃과 메모리 비용도 각각 든다. 현재 필요한 보기만 mount하도록 구성하는 것을 권장한다. 407블록의 고정 합성 표본과 단일 보기에서 최초 강조 약 1.45초(화면 코드 변경 감지 포함), 캐시가 있는 일반 재읽기 후 이동 169ms를 관측했다. 이는 성능 보장이나 여러 문서의 비교 측정이 아니다. 메모리·여러 보기 동시 표시의 응답성과 packaged Desktop에서의 동시 표시 동작은 검증하지 않았다.

## 파일·폴더 선택과 문서 열기

화면은 `pickPath({kind:"pdf"|"folder"|"document",initialPath?})`와 `openDocument({path})`를 받는다. Host/창 식별자나 임의 확장자 필터는 없다. 화면 상호작용이므로 별도 CLI 명령은 추가하지 않는다.

열린 폴더 범위 확인은 경로 문자열 기준이며 폴더 안의 링크를 따라간 실제 위치까지는 보장하지 않는다. Host의 허용 Root 제한은 그대로 적용된다. 이 한계는 pickPath 결과·openDocument·saveDocument에 공통이다. 예를 들어 Host가 A·B를 허용하고 화면에는 A만 열려 있을 때 A 안의 junction이 B를 가리키면, 그 주소를 통한 선택·열기·하위 폴더 저장이 B에 도달할 수 있다. Host가 A만 허용하면 기존 실제 경로 검증이 이를 거부한다. 화면의 열린 폴더 범위는 보안 경계가 아니다.

- pickPath는 기존 FolderDialog를 화면의 고정 client·현재 열린 폴더에 묶는다. initialPath는 탐색을 시작할 폴더의 Host 절대 경로이며 기본은 첫 열린 폴더다. PDF, 폴더, .md 문서만 선택한다. 성공은 `{path,kind}`, 사용자 취소는 null, 읽기 실패·잘못된 초기 경로·중복 호출은 Error로 거부한다. 화면 reload/unmount·열린 폴더 목록 변경은 AbortError로 거부하고 읽기를 취소한다. 경로는 선택 직전에도 확인하며 열린 폴더 밖은 돌려주지 않는다. 새 폴더 열기·만들기와 최근 폴더 기록은 하지 않는다.
- openDocument는 .md 문서만 같은 Host의 기존 탭 열기 경로로 연다. 열린 폴더의 실제 식별자를 확인하고, 비동기 읽기 뒤에도 폴더 소속과 화면 수명을 확인한다. `{status:"opened",path}` 또는 `{status:"refused",path,message}`로 응답한다. reload/unmount의 취소는 AbortError다. 기존 미저장 탭은 그대로 활성화하고 저장본으로 교체하지 않는다. 대상 위치 이동은 제공하지 않는다.
- saveDocument의 open:true도 이 경로를 쓴다. 생성 성공 뒤에는 항상 생성 receipt를 유지하며 `opening:{status:"opened"|"refused",path,message?}`를 추가한다. 열기 거부·오류·화면 취소가 생성 실패로 바뀌지 않는다. opening이 refused여도 생성은 완료됐으므로 재시도하지 말고 receipt.path를 표시한다. open이 없거나 false면 opening도 없다. 생성 자체의 오류·통신 중단은 기존대로 reject하며 자동 재시도하지 않는다.

UI 갤러리 Screen parts의 Screen path selection은 합성 Host의 선택·폴더 범위 변경 예제다. 기존 FolderDialog·Dialog·Button·경로 필드·스크롤을 재사용하며 새 공통 표면이나 토큰은 추가하지 않는다.

## 새 문서 저장

`saveDocument({name,authoring,images?,folder?,open?})`는 [공식 문서 작성 입력](document-support-v1.md#공식-문서-작성-입력)의 Core DocumentAuthoringInput으로 새 `.md`를 만든다. images는 SDK AuthoredDocumentRequest의 기존 `{key,mime,base64}[]` 입력을 그대로 사용하고 figure의 imageAsset key에 연결한다. 누락하면 빈 배열이다. key 대응·base64·이미지 검증과 기존 제한(그림당 10 MiB, 최대 256개, 전체 작성 요청 32 MiB)은 공통 작성 경로가 적용한다. 문서 게시 실패 뒤 완성된 공유 가능 asset은 남을 수 있다. 기본 위치는 화면 Host의 첫 열린 폴더다. folder를 지정하면 그 Host의 열린 폴더 또는 그 하위 폴더여야 하며, 열린 폴더가 없으면 거부한다. 경로는 대상 Host에서 해석한다. 다른 Host나 클라이언트 PC로 fallback하지 않는다.

공용 `PUT /api/document`와 CLI `create <path.md> --input <json-file> --format json`은 같은 createAuthoredDocumentFile을 사용한다. Core authorDocument의 의미·canonical round-trip과 file-commit의 임시 형제 파일 쓰기·fsync·배타적 hard-link 게시를 유지한다. 부분 쓰기/flush 실패는 최종 파일을 게시하지 않으며 기존 이름은 덮어쓰지 않는다. hard link 미지원 파일시스템은 우회하지 않고 실패한다. 기존 파일 수정·overwrite·별도 문서 형식·생성 문서 연결은 추가하지 않는다.

## 제거와 보관

선언형 query/catalog/form/defaultViewIds·rowSchema·입력 후보/힌트·jobs 패널·검수/원본 대조 틀과 기존 Docling을 2026-11-13 삭제했다. 단독 PDF 탭, 일반 문서 편집·저장·복구, 비서 변경 보기·Undo는 유지한다. 삭제 전 구현과 검증은 `archive/plugins-declarative-2026-11-13` 브랜치와 `archive/2026-11-13-plugins-declarative` 태그의 [계약](https://github.com/litzio/litzio/blob/archive/2026-11-13-plugins-declarative/docs/design/plugin-screens-v1.md)에 보관한다. 이전 캡처와 수락 기록은 현재 제공 기능이 아니다.
