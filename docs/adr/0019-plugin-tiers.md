# ADR-0019: 공식 플러그인과 커뮤니티 플러그인

- Status: Accepted
- Amended by: [ADR-0022](0022-plugin-screen-code.md) — 플러그인 화면 선언·원격 script 한정 경계를 대체한다.
- Amended by: [ADR-0020](0020-plugin-architecture.md)
- Decision date: 2026-11-05
- Last verified: 2026-11-16 — 현재 계약·코드와 삭제된 기능의 잔재를 정적으로 대조했다. 제품·브라우저·Desktop·AI 실행 재검증 없음.
- Authority: 2026-11-05 소유자 승인 결정, under [AGENTS.md](../../AGENTS.md). 관련 보류 이슈: [#1075](https://github.com/litzio/litzio/issues/1075).
- Scope: 플러그인 계층·책임·Host·UI·공용 작업의 개념 결정만 기록한다. Accepted는 구현 착수나 구현 완료를 뜻하지 않는다.
- Amends: [ADR-0012](0012-plugin-runtime-and-ui-contributions.md)의 재개 시 플러그인 분류·신뢰·UI 경계. [ADR-0017](0017-bundled-client-and-official-ai.md)의 재개 시 결정할 개념을 보완하며 기능 제거·보관·명시적 재개 조건은 유지한다.

## 2026-11-09 신뢰 단위 개정 (#1379)

[소유자 결정 #1379](https://github.com/litzio/litzio/issues/1379)에 따라 신뢰는 등록된 플러그인(ID와 그 등록) 단위다. 처음 켤 때 한 번 확인하고 업데이트 뒤에는 다시 확인하지 않는다. 제거 후 재추가·등록 교체는 다시 신뢰해야 한다. UI·CLI·비서는 같은 Host 작업을 사용한다. [실행 계약](../design/plugin-stage1-v1.md)을 따른다.

## 결정 ①~⑧

### ① 계층은 공식 공급·유지 책임으로 구분한다

**공식 플러그인(Official plugin)** 은 Litzio가 공식 공급·유지 책임을 맡는 플러그인이다. 그 책임을 맡지 않는 플러그인은 **커뮤니티 플러그인(Community plugin)** 으로 분류한다. 공식 개발자가 작성한 개인·실험 플러그인도 커뮤니티 계층일 수 있다.

따라서 작성자의 소속이나 소유자 작업에서의 중요도만으로 공식 계층을 지정할 수 없다. 공식 계층이라는 이름으로 번들 여부·기본 활성화·특권을 추론할 수도 없다.

### ② 이름과 배포·실행 상태를 구별한다

`@litzio/core` 문서 엔진과 혼동되는 “코어 플러그인”은 쓰지 않는다. 이름은 공식 플러그인 / Official plugin, 커뮤니티 플러그인 / Community plugin으로 정한다. 코드 키 후보는 `pluginTier: 'official' | 'community'`이며 manifest 필드를 지금 확정하거나 구현하지 않는다.

공급자(Publisher)는 플러그인 공급 주체이며 비서의 AI 공급자(provider)와 구별한다. 기본 포함(Bundled)은 배포물에 들어 있다는 뜻으로 계층과 독립이다. 활성화/비활성화는 실행 상태이며 설치됨·신뢰함·사용 가능과 구별한다.

따라서 기본 포함이라는 이유로 공식 계층 또는 활성 상태로 간주하지 않는다. 비활성화를 제거·자격 증명 폐기·기존 작업 취소와 같은 동작으로 취급하지 않는다. 구체 상태 전이·기본 상태·제거 정책은 재개 때 필요한 범위로 결정한다.

### ③ 같은 manifest·SDK·권한을 사용한다

두 계층은 같은 manifest·SDK·권한과 검증 기준을 사용한다. 공식 전용 내부 API는 없다. 향후 커뮤니티 플러그인은 기본 실행을 차단하고 명시적 신뢰 기록 뒤 활성화하게 한다. 비서도 신뢰 단계를 실행할 수 있다([ADR-0020](0020-plugin-architecture.md)). 신뢰와 활성화는 별도 개념이다.

따라서 공식 계층에만 내부 API 우회를 허용할 수 없다. 실행 차단은 sandbox가 아니며, 신뢰 후 실행한 코드의 OS 권한·파일·네트워크·자격 증명 격리를 보장하지 않는다. 계층 분류나 별도 프로세스를 격리 보증으로 설명할 수 없다. 이 결정으로 세밀한 권한 엔진이나 sandbox를 구현하지 않는다.

### ④ 실행과 자격 증명은 대상 Host가 소유한다

플러그인은 Host(daemon) 소유이며 실행과 자격 증명은 대상 Host의 OS 계정 문맥에 있다. Desktop은 Host에 연결하는 클라이언트이며 전역 플러그인 실행 주체나 자격 증명 저장소로 확장하지 않는다.

따라서 Desktop 전역 토큰, Host 간 자격 증명 공유, Host 간 자동 작업 이동은 없다. Desktop에만 설치된 플러그인은 원격 Host에서 실행되지 않는다. 연결 실패를 다른 Host 실행으로 대체하지 않는다. 자격 증명 저장 방식·OAuth 흐름은 이번에 설계하지 않으며 기존 인증 보류([#1145](https://github.com/litzio/litzio/issues/1145))를 해제하지 않는다.

### ⑤ 최초 UI는 앱 번들과 공용 작업 API로 구성한다

이 절의 결정은 [ADR-0020](0020-plugin-architecture.md)·[ADR-0022](0022-plugin-screen-code.md)로 대체됐다.

### ⑥ 플러그인 기능과 관리에도 공용 작업·CLI 규칙을 적용한다

[ADR-0015](0015-shared-host-operations.md)에 따라 두 계층의 새 사용자 기능은 Host 공용 작업의 입력·결과·범위·receipt로 정의하고 CLI 명령을 반드시 함께 제공한다. 설치·활성화·설정도 대상이며, 비서 도구는 필요할 때 같은 정의로 제공한다. 대상 Host와 실행 결과를 결과·receipt에 보존한다. 문서 의미·검증·canonical write는 Core가 소유한다.

버전은 ADR-0016의 프로토콜 불일치 거부·제품 버전 차이 경고 정책을 따른다. 구체 SDK/API 요구 형식은 재개 때 정한다.

따라서 UI만 제공하는 플러그인 기능·관리 작업, 플러그인·CLI·Editor의 별도 문서 의미 구현, 공식 write path 우회는 허용하지 않는다. 장기 호환 계층·임의 구버전 자동 호환은 만들지 않는다. 이번 개념 결정을 범용 operation registry나 모든 작업의 비서 자동 공개 요구로 확대하지 않는다.

### ⑦ 비서는 제품 기능이며 Docling은 공식 플러그인이 아니다

비서(Assistant)는 ADR-0017의 플러그인과 무관한 제품 기능이다. 플러그인 계층·차단·활성 상태로 비서의 존재나 가용성을 결정하지 않는다. 비서 가용성은 기존 AI 공급자 가용성 계약을 유지한다.

### ⑧ 이번 결정은 개념 기록이며 구현 재개가 아니다

이 절의 결정은 [ADR-0020](0020-plugin-architecture.md)·[ADR-0022](0022-plugin-screen-code.md)로 대체됐다.

## 기존 결정과의 관계

공용 작업·CLI는 [ADR-0015](0015-shared-host-operations.md), Host 연결·버전은 [ADR-0016](0016-shared-local-daemon-host.md), 비서 관리는 [ADR-0020](0020-plugin-architecture.md), 화면 코드는 [ADR-0022](0022-plugin-screen-code.md)를 따른다.
