# ADR-0017: Desktop 번들 UI와 daemon 공식 AI 기능

- Status: Accepted
- Amended by: [ADR-0020](0020-plugin-architecture.md)
- Decision date: 2026-11-04
- Last verified: 2026-11-16 — 현재 계약·코드와 삭제된 기능의 잔재를 정적으로 대조했다. 제품·브라우저·Desktop·AI 실행 재검증 없음.
- Authority: 2026-11-04 소유자 승인 결정, [#1150](https://github.com/litzio/litzio/issues/1150), under [AGENTS.md](../../AGENTS.md).
- Scope: 같은 PC의 로컬 daemon, 공식 AI와 Desktop 번들 UI 전환. Accepted는 구현 완료를 뜻하지 않는다.
- Amends: [ADR-0012](0012-plugin-runtime-and-ui-contributions.md), [ADR-0013](0013-ai-agent-task-service.md), [ADR-0015](0015-shared-host-operations.md), [ADR-0016](0016-shared-local-daemon-host.md)의 아래 명시한 경계.

## 2026-11-14 개정

- Authority: 2026-11-14 소유자 결정(Q2 승인, #1595 목적 기준 재검토).

지금의 비서와 CLI로 끝내지 못하는 실제 플러그인 사례가 생길 때 소유자가 재개 여부와 최소 계약을 새로 정한다. 플러그인 재개만으로 새 서비스를 미리 설계하지 않는다. [제품 목적](../purpose.md#지금-하지-않는-것)을 따른다.

## Decision

### 1. AI는 daemon의 필수 공식 기능이다

AI 에이전트는 기본 포함 플러그인에서 daemon의 공식 기능으로 흡수한다. AI 수명은 daemon 수명이다. 화면 닫힘이나 연결 해제를 AI 종료 신호로 바꾸지 않는다. daemon 종료로 확정할 수 없는 진행 요청은 uncertain·결과 비공개·UUID 재실행 금지로 남기고, 명시적 사용자 취소와 이미 결정된 timeout은 구분한다. 소유 worker/provider 종료를 기다리며 기존 보호를 유지한다.

**소유자 최종 결정: AI는 항상 존재하는 공식 기능이며 AI를 끄는 버튼·스위치를 제공하지 않는다.** 사용 가능한 프로바이더가 있는지로만 AI 사용 가능 여부를 판단한다. 사용 가능한 프로바이더가 없으면 새 AI 작업(대화)은 그 이유를 알리며 거부하고 이미 진행 중인 작업에는 영향을 주지 않는다. AI 설정은 공식 설정 명령과 ADR-0015에 따라 입력·결과·범위·receipt를 공용 Host 작업으로 정의한다. 새 AI 사용자 기능은 공용 작업 + CLI를 제공하되 기존 기능 전체의 CLI화를 요구하지 않는다. 호환 alias나 과거 데이터 migration은 만들지 않는다. 비서는 AI 권한·프로바이더·모델을 변경하지 못한다는 기존 도구 원칙을 유지한다.

프로바이더 가용성 변화 자체는 진행 작업의 취소·drain·provider 연결 종료 신호가 아니며, 기존 명시적 취소·timeout·daemon 종료 계약은 유지한다.

### 2. 플러그인 결정의 대체 관계

이 절의 결정은 [ADR-0020](0020-plugin-architecture.md)·[ADR-0022](0022-plugin-screen-code.md)로 대체됐다.

### 3. Desktop UI 배포와 Host 연결을 분리한다

Desktop은 앱에 번들된 UI를 로드한다. 문서·AI 등 코어 Host 작업과 자산 접근은 HTTP Host API를 사용한다. Desktop bridge는 daemon 탐색·시작·종료·연결 정보와 기존 OS shell 기능을 유지하되 별도 문서 Host 경로가 되지 않는다. daemon은 브라우저용 웹 UI를 계속 제공한다.

Editor의 모든 Host 호출과 렌더링 URL은 대상 Host를 아는 Host 클라이언트를 거친다. 문서·폴더·복구·템플릿·비서 API와 폴링, 문서 이미지·미리보기 등 코어 자산 URL을 포함한다. 원문의 상대 URI는 보존하고 렌더링 경계에서 Host 주소를 적용한다. 문서에 daemon 절대 주소를 저장하지 않는다. 앱 UI의 BASE_URL을 Host 주소로 간주하지 않는다.

이 ADR의 #1150 전환 대상은 같은 PC의 로컬 daemon 하나다. daemon 중단 중에도 번들 화면과 연결 상태가 남아야 한다. ADR-0016의 수동 다시 연결·주체별 종료·명시적 종료, 제품/프로토콜 버전 정책과 Host 실패 시 로컬 재실행 금지는 유지한다.

Desktop origin을 daemon에 명시적으로 허용한다. 구현은 CORS·OPTIONS, 허용 methods/headers와 Origin 목록, 실제 HTTP Host authority 목록 및 CSP를 함께 다룬다. custom scheme의 UI origin을 TCP Host 목록에 섞거나 wildcard로 넓히지 않는다. 기존 쓰기 Origin 검사와 문서 SVG/HTML sandbox 보호를 유지하고, 문서 이미지·미리보기 등 코어 리소스의 cross-origin/CORP 전환을 검증한다. 인증 방식·시점은 #1145에 남긴다.

ADR-0016의 고정 HTTP origin은 daemon에 유지한다. Desktop UI는 별도 번들 origin으로 전환한다. Desktop scheme은 `litzio://app`이며 static UI 전용이다. 현재 프로토콜은 4다. API·플러그인 UI의 비호환 변경 때는 프로토콜 버전을 올린다. 제품 버전 차이는 경고, 프로토콜 불일치는 거부한다. 구 CLI daemon에 신 번들 UI 연결은 지원하지 않으며 호환 계층·capability 협상은 만들지 않는다. 기존 origin 저장소·설정·문서 데이터의 하위 호환과 migration은 포함하지 않는다.

### 4. 플러그인 컨셉 재개발 때 결정할 경계

이 절의 결정은 [ADR-0020](0020-plugin-architecture.md)·[ADR-0022](0022-plugin-screen-code.md)로 대체됐다. 선제 설계는 [2026-11-14 개정](#2026-11-14-개정)을 따른다.

## Deferred

- 인증 방식·도입 시점, HTTPS·계정·권한 체계([#1145](https://github.com/litzio/litzio/issues/1145)). 현재 무인증 단계는 바꾸지 않는다.
- 공유 편집·미저장 내용·Undo/history의 공유.
- 부팅 자동 시작·자동 복구·무중단 업데이트.
