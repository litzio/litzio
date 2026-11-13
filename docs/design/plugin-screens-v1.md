# 플러그인 화면 코드 계약

> 2026-11-13 소유자 결정(#1595): 다른 PC의 Host 등록·접속과 여러 Host UI는 삭제했다. 같은 PC의 공유 daemon·수동 다시 연결, CLI `--host <origin>`과 개발·검사용 독립 HTTP Host는 유지한다. 연결과 화면은 단일 Host로 정리했다. 작업·세션에 고정된 client와 취소/세대 보호는 유지하며, 저장·복구의 hostId·키·레코드는 PR 3까지 local 형식 그대로 둔다. 삭제 전 구현은 `archive/2026-11-13-plugins-declarative`에 보관한다. `multi-host`·`host-settings`의 삭제 전 검증/캡처 언급은 역사 기록이며 현재 실행 목록이 아니다. 로컬 회귀는 `local-host`·`document-tabs`·HTTP recovery를 따른다.

- Status: Implemented
- Authority: [ADR-0022](../adr/0022-plugin-screen-code.md), [실행·제작 계약](plugin-stage1-v1.md).
- Last verified: 2026-11-13 — #1592 1-2 코드·대상 검사 대조.

## 연결 수명

화면 목록과 진입 대상은 단일 연결이다. 화면을 열 때 client를 캡처하며 다른 연결로 자동 전환하지 않는다. 연결 주소가 바뀐 뒤 기존 invoke·saveDocument는 전송 전에 거절한다. 화면/tab의 기존 id/key는 유지하고 다시 그리는 것만으로 다른 client를 선택하지 않는다. 열린 폴더 범위와 새 문서 저장의 안전 조건은 유지한다.

## 화면 실행

플러그인의 유일한 화면 형식은 React JS/JSX 코드다. manifest의 screen은 artifact 내부 진입 파일이고 default export 컴포넌트는 `React`, `ui`, `invoke`, `saveDocument`, `pickPath`, `openDocument`를 받는다. React는 앱 인스턴스를 공유하고 CSS 토큰·글꼴은 같은 화면 트리에서 상속한다.

Host는 검증·reload 시 esbuild로 artifact 내부 의존성을 번들한다. 실행 시 npm 설치나 원격 import 해석을 하지 않는다. 활성 plugin만 화면 코드와 artifact digest revision을 제공한다. 대상 Host의 `/api/plugin-screens`는 화면 목록/코드만 반환하고 선언형 catalog·validate·query 실행 API는 없다. 클라이언트는 CSP script-src의 blob 모듈로 실행한다. 샌드박스·iframe·권한 모델·서명·버전 협상은 만들지 않는다.

`invoke(localOperationId,input)`는 자기 plugin과 해당 화면의 HostClient에 고정한다. 공개 작업은 schema·effect·receipt를 공유하고 화면 전용 handler는 JSON을 전달한다. Core 문서 의미나 공식 저장을 화면에서 우회하지 않는다. disable·reload·Host 교체·연결 해제 시 이전 화면을 내리고 새 revision을 받는다. 열린 화면은 2초마다 코드 없이 revision을 확인하며 변경 시 새 코드를 받는다. 파일 감시·자동 reload는 아니다. import/render/cleanup 오류는 해당 화면에서 격리한다. async/event 오류는 작성자가 catch해 Notice로 표시한다.

## 화면 부품

비서 제작의 조건 협의와 계획 문서는 [비서 계약](main-agent-v1.md#플러그인)을 따른다. 질문 카드나 계획을 위한 새 화면 기능은 추가하지 않는다.

기존 Button/Input/DataTable/Notice/Chart/Slider/Toolbar/SummaryCard/ScreenLayout과 앱의 토큰을 재사용한다. DataTable 행 타입은 DataTable 모듈이 소유하며 선언형 query 타입에 의존하지 않는다. 필요한 배치와 모양은 plugin이 정한다. 제공 부품 사용을 강제하지 않으며 디자인 품질을 자동 보장하지 않는다. 새 원본 대조·검수·문서 표시 부품은 공개하지 않았다.

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
