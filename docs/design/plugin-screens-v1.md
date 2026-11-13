# 플러그인 화면 코드 계약

- Status: Implemented
- Authority: [ADR-0022](../adr/0022-plugin-screen-code.md), [실행·제작 계약](plugin-stage1-v1.md).
- Last verified: 2026-11-13 — #1592 1-2 코드·대상 검사 대조.

## 화면 실행

플러그인의 유일한 화면 형식은 React JS/JSX 코드다. manifest의 screen은 artifact 내부 진입 파일이고 default export 컴포넌트는 `React`, `ui`, `invoke`, `saveDocument`를 받는다. React는 앱 인스턴스를 공유하고 CSS 토큰·글꼴은 같은 화면 트리에서 상속한다.

Host는 검증·reload 시 esbuild로 artifact 내부 의존성을 번들한다. 실행 시 npm 설치나 원격 import 해석을 하지 않는다. 활성 plugin만 화면 코드와 artifact digest revision을 제공한다. 대상 Host의 `/api/plugin-screens`는 화면 목록/코드만 반환하고 선언형 catalog·validate·query 실행 API는 없다. 클라이언트는 CSP script-src의 blob 모듈로 실행한다. 샌드박스·iframe·권한 모델·서명·버전 협상은 만들지 않는다.

`invoke(localOperationId,input)`는 자기 plugin과 해당 화면의 HostClient에 고정한다. 공개 작업은 schema·effect·receipt를 공유하고 화면 전용 handler는 JSON을 전달한다. Core 문서 의미나 공식 저장을 화면에서 우회하지 않는다. disable·reload·Host 교체·연결 해제 시 이전 화면을 내리고 새 revision을 받는다. 열린 화면은 2초마다 코드 없이 revision을 확인하며 변경 시 새 코드를 받는다. 파일 감시·자동 reload는 아니다. import/render/cleanup 오류는 해당 화면에서 격리한다. async/event 오류는 작성자가 catch해 Notice로 표시한다.

## 화면 부품

비서 제작의 조건 협의와 계획 문서는 [비서 계약](main-agent-v1.md#플러그인)을 따른다. 질문 카드나 계획을 위한 새 화면 기능은 추가하지 않는다.

기존 Button/Input/DataTable/Notice/Chart/Slider/Toolbar/SummaryCard/ScreenLayout과 앱의 토큰을 재사용한다. DataTable 행 타입은 DataTable 모듈이 소유하며 선언형 query 타입에 의존하지 않는다. 필요한 배치와 모양은 plugin이 정한다. 제공 부품 사용을 강제하지 않으며 디자인 품질을 자동 보장하지 않는다. 새 원본 대조·검수·문서 표시 부품은 공개하지 않았다.

## 새 문서 저장

`saveDocument({name,authoring,folder?,open?})`는 기존 Core DocumentAuthoringInput으로 새 `.md`를 만든다. 기본 위치는 화면 Host의 첫 열린 폴더다. folder를 지정하면 그 Host의 열린 폴더여야 하며, 열린 폴더가 없으면 거부한다. 경로는 대상 Host에서 해석한다. 다른 Host나 클라이언트 PC로 fallback하지 않는다.

공용 `PUT /api/document`와 CLI `create <path.md> --input <json-file> --format json`은 같은 createAuthoredDocumentFile을 사용한다. Core authorDocument의 의미·canonical round-trip과 file-commit의 임시 형제 파일 쓰기·fsync·배타적 hard-link 게시를 유지한다. 부분 쓰기/flush 실패는 최종 파일을 게시하지 않으며 기존 이름은 덮어쓰지 않는다. hard link 미지원 파일시스템은 우회하지 않고 실패한다. 기존 파일 수정·overwrite·별도 문서 형식·생성 문서 연결은 추가하지 않는다.

## 제거와 보관

선언형 query/catalog/form/defaultViewIds·rowSchema·입력 후보/힌트·jobs 패널·검수/원본 대조 틀과 기존 Docling을 2026-11-13 삭제했다. 단독 PDF 탭, 일반 문서 편집·저장·복구, 비서 변경 보기·Undo는 유지한다. 삭제 전 구현과 검증은 `archive/plugins-declarative-2026-11-13` 브랜치와 `archive/2026-11-13-plugins-declarative` 태그의 [계약](https://github.com/litzio/litzio/blob/archive/2026-11-13-plugins-declarative/docs/design/plugin-screens-v1.md)에 보관한다. 이전 캡처와 수락 기록은 현재 제공 기능이 아니다.
