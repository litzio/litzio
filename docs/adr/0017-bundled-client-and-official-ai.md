# ADR-0017: Desktop 번들 UI와 daemon 공식 AI 기능

- Status: Accepted
- Decision date: 2026-11-04
- Last verified: 2026-11-04 — #1150·#1142, 관련 ADR 및 Paseo `bfbd4d5` 사전 정적 조사 대조. 제품 실행 검증 없음.
- Authority: 2026-11-04 소유자 승인 결정, [#1150](https://github.com/litzio/litzio/issues/1150), under [AGENTS.md](../../AGENTS.md). 아래 플러그인 UI 신뢰 규칙만 소유자 확인 대기인 추천이다.
- Scope: 같은 PC의 로컬 daemon, 공식 AI 흡수와 Docling 분리·재연결, Desktop 번들 UI 전환. Accepted는 구현 완료를 뜻하지 않는다.
- Amends: [ADR-0012](0012-plugin-runtime-and-ui-contributions.md), [ADR-0013](0013-ai-agent-task-service.md), [ADR-0015](0015-shared-host-operations.md), [ADR-0016](0016-shared-local-daemon-host.md)의 아래 명시한 경계.

## Context and evidence

[Discussion #767](https://github.com/litzio/litzio/discussions/767)의 사용 형태 ②는 화면 하나에 Host 하나를 가정하지 않는다. #1142 PR3의 Desktop은 daemon이 내보낸 UI를 로드하므로, 이후 원격 Host로 확장하면 preload/IPC가 있는 창에서 원격 서버가 제공한 앱 코드를 실행하게 된다. UI 배포와 Host 주소를 분리해야 한다. 이번에는 원격 연결이나 여러 Host 화면을 구현하지 않는다.

Paseo 사전 조사는 `getpaseo/paseo@bfbd4d5175e35d5389457cf62cda69dcdd699771`의 정적 소스에 한정한다. 앱 번들 UI와 daemon API 분리는 참고하지만 relay·SSH·fleet 구조나 자동 재연결 정책은 도입하지 않는다.

- [Desktop main](https://github.com/getpaseo/paseo/blob/bfbd4d5175e35d5389457cf62cda69dcdd699771/packages/desktop/src/main.ts), [packaging](https://github.com/getpaseo/paseo/blob/bfbd4d5175e35d5389457cf62cda69dcdd699771/packages/desktop/electron-builder.yml): 앱 UI를 번들하고 custom scheme으로 로드한다.
- [Host runtime](https://github.com/getpaseo/paseo/blob/bfbd4d5175e35d5389457cf62cda69dcdd699771/packages/app/src/runtime/host-runtime.ts): Host별 client와 연결 문맥을 유지한다.
- [Plugin registry](https://github.com/getpaseo/paseo/blob/bfbd4d5175e35d5389457cf62cda69dcdd699771/packages/app/src/plugins/registry.ts), [bundle evaluation](https://github.com/getpaseo/paseo/blob/bfbd4d5175e35d5389457cf62cda69dcdd699771/packages/app/src/plugins/evaluate.ts): Host의 client bundle도 실행한다. 따라서 번들 앱만으로 “원격 Host 코드는 Desktop에서 실행되지 않는다”는 보증은 성립하지 않는다. contextIsolation과 Node 차단도 renderer JavaScript 실행 차단은 아니다.

Litzio 조사 기준은 master `3ffe557381c250f1a095996761d24de6b232ce86`이다. Editor의 문서·폴더·복구·템플릿·비서·플러그인 호출은 개별 fetch/helper에 흩어져 있다. Figure·Markdown 이미지, 파일 미리보기, 플러그인 imageUrl·CSS·ESM은 렌더링/동적 로드 URL이므로 fetch wrapper만 바꾸면 빠진다. 이 목록은 이행 점검 범위이며 호출식 수를 영속 계약으로 고정하지 않는다.

## Decision

### 1. AI는 daemon의 필수 공식 기능이다

AI 에이전트는 기본 포함 플러그인에서 daemon의 공식 기능으로 흡수한다. AI 수명은 daemon 수명이며 [#1142 PR4 (#1151)](https://github.com/litzio/litzio/pull/1151)에서 정리하는 연결·실행·중단·종료 계약을 그대로 가져온다. 화면 닫힘이나 연결 해제를 AI 종료 신호로 바꾸지 않는다. daemon 종료로 확정할 수 없는 진행 요청은 uncertain·결과 비공개·UUID 재실행 금지로 남기고, 명시적 사용자 취소와 이미 결정된 timeout은 구분한다. 소유 worker/provider 종료를 기다리며 기존 보호를 유지한다. PR4 완료 전 임의로 새 수명 정책을 정하지 않는다.

설정의 **AI 사용** 스위치로 켜고 끈다. 플러그인 활성/비활성으로 표현하지 않는다. #1137의 `plugins configure ai-agent` 등 AI 설정 CLI는 공식 설정 명령으로 옮기고 ADR-0015에 따라 입력·결과·범위·receipt를 공용 Host 작업으로 정의한다. 구체 명령 표기는 구현 PR에서 정하며 호환 alias나 과거 데이터 migration은 만들지 않는다. 비서는 AI 권한·프로바이더·모델과 플러그인을 변경하지 못한다는 기존 도구 원칙을 유지한다.

ADR-0013의 Host 중개 작업 메시지, provider-neutral 기능 요청, caller의 내용 검증과 baseline 확인, UUID·uncertain/no-replay 보호는 유지한다. 공식 기능 전환을 문서 의미의 Host 이전이나 새 provider framework의 근거로 쓰지 않는다.

### 2. Docling은 핵심 부가 기능인 플러그인으로 남는다

Docling은 daemon 전환 기간에 기본 설치와 CI에서 분리한다. 이 기간에는 Docling을 사용할 수 없다. 플러그인 실행 기반은 fixture 플러그인으로 계속 검증한다. AI 흡수를 이유로 플러그인 실행 기반까지 제거하지 않는다.

전환 뒤 새 구조 위에 Docling 플러그인을 재연결하고 공식 AI 기능을 사용하게 한다. ADR-0016 ⑥의 소유자 기간 한정 예외를 이 기간까지 연장한다. 목적은 수명·배포 경계 전환이며 실패를 숨기는 일반 테스트 축소가 아니다. 분리 전 CI 시간과 제외 목록·복구 대상을 기록하고, Docling 재연결·관련 테스트 복구·필수 CI 전체 통과를 예외 종료 및 전환 완료 조건으로 삼는다. **재연결까지 릴리스를 중단하며 예외 적용 중에는 완료나 릴리스 가능 상태로 보고하지 않는다.** 문서 유효성·데이터 보존·공식 write path와 무관한 테스트는 완화하지 않는다.

### 3. Desktop UI 배포와 Host 연결을 분리한다

Desktop은 앱에 번들된 UI를 로드한다. 문서·AI·플러그인 등 Host 작업과 자산 접근은 HTTP Host API를 사용한다. Desktop bridge는 daemon 탐색·시작·종료·연결 정보와 기존 OS shell 기능을 유지하되 별도 문서 Host 경로가 되지 않는다. daemon은 브라우저용 웹 UI를 계속 제공한다.

Editor의 모든 Host 호출과 렌더링 URL은 대상 Host를 아는 Host 클라이언트를 거친다. 문서·폴더·복구·템플릿·비서·플러그인 API와 폴링, 문서 이미지·미리보기·플러그인 CSS/ESM·자산 URL도 포함한다. 원문의 상대 URI는 보존하고 렌더링 경계에서 Host 주소를 적용한다. 문서에 daemon 절대 주소를 저장하지 않는다. 앱 UI의 BASE_URL을 Host 주소로 간주하지 않는다.

이번 연결 대상은 같은 PC의 로컬 daemon 하나다. 원격 Host 설정·여러 Host 동시 보기의 저장소나 화면을 미리 구현하지 않는다. daemon 중단 중에도 번들 화면과 연결 상태가 남아야 한다. ADR-0016의 수동 다시 연결·주체별 종료·명시적 종료, 제품/프로토콜 버전 정책과 Host 실패 시 로컬 재실행 금지는 유지한다.

Desktop origin을 daemon에 명시적으로 허용한다. 구현은 CORS·OPTIONS, 허용 methods/headers와 Origin 목록, 실제 HTTP Host authority 목록 및 CSP를 함께 다룬다. custom scheme의 UI origin을 TCP Host 목록에 섞거나 wildcard로 넓히지 않는다. 기존 쓰기 Origin 검사와 미디어 sandbox 보호를 유지하고, cross-origin 이미지/CSS의 CORP 및 ESM MIME·상대 import·React 의존성도 검증한다. API/미디어 접근 허용과 실행 가능한 플러그인 UI 허용을 구분한다. 인증 방식·시점은 #1145에 남긴다.

ADR-0016의 고정 HTTP origin은 daemon에 유지한다. Desktop UI는 별도 번들 origin으로 전환하고 ADR-0012의 same-origin UI 자산 규칙은 이 Desktop 경계에서 명시적으로 개정한다. 정확한 scheme 표기는 구현 PR에서 정한다. 기존 origin 저장소·설정·문서 데이터의 하위 호환과 migration은 포함하지 않는다.

### 4. 플러그인 UI 신뢰 규칙 — 추천, 소유자 확인 대기

이 절은 승인된 1~3절과 구분하는 추천이며 PR 본문에서 확인을 요청한다. Desktop의 특권 창(preload/IPC)에서는 앱 번들 코드와 **로컬 daemon에 등록된 신뢰 플러그인 UI만** 실행한다. 원격 Host 플러그인 UI 실행 방식(격리 iframe, 미실행 등)은 원격 연결 착수 때 결정한다.

이 추천은 현재 로컬 연결 전환을 막지 않는다. 이후 원격 Host를 연결하더라도 그 Host의 플러그인 UI는 별도 신뢰·격리 결정 전까지 사용할 수 없다. Paseo의 원격 bundle 실행을 안전성 보증으로 채택하지 않는다.

## 이행 순서와 완료 조건

1. **#1142 PR4:** 플러그인·AI 수명 계약과 기존 한정 테스트 복구를 먼저 완료한다. 같은 파일의 개정은 PR4 병합 뒤 master를 merge하여 양쪽을 보존한다.
2. **AI 흡수 + Docling 분리:** 공식 AI 설정 공용 작업과 CLI를 제공하고, Docling 미제공·CI 제외 범위와 측정·복구 조건을 기록한다. fixture로 플러그인 기반을 계속 검증한다.
3. **Host 클라이언트:** 기존 동작을 바꾸지 않고 모든 Host 호출·리소스 URL을 대상 Host 문맥으로 모은다. 브라우저 경로의 동작도 유지한다.
4. **Desktop 번들 UI + daemon origin 허용:** daemon 중단 상태의 화면·수동 다시 연결, HTTP 호출·미디어·플러그인 자산 및 브라우저 접속을 검증한다.
5. **Docling 재연결:** 새 구조와 공식 AI로 플러그인을 복구하고 제외 테스트 및 필수 CI 전체 통과를 확인해 예외와 릴리스 중단을 끝낸다.

이 PR은 문서만 변경한다. 각 구현 PR이 해당 [HTTP Host](../design/http-host-v1.md), [Desktop distribution](../design/desktop-distribution-v1.md), [Main agent](../design/main-agent-v1.md), [Plugin runtime](../design/plugin-runtime-v1.md), [Plugin UI](../design/plugin-ui-v1.md), [Docling conversion](../design/docling-conversion-v1.md) 계약을 실제 동작과 함께 갱신한다. 아직 구현되지 않은 결정을 Implemented 계약의 현재 동작으로 쓰지 않는다.

## Deferred

- 원격 Host 주소 설정과 여러 Host 동시 보기.
- 원격 Host 플러그인 UI 신뢰·격리·실행 방식.
- 인증 방식·도입 시점, HTTPS·계정·권한 체계([#1145](https://github.com/litzio/litzio/issues/1145)). 현재 무인증 단계는 바꾸지 않는다.
- 공유 편집·미저장 내용·Undo/history의 공유. plain-text SSOT, Core 의미·valid write와 클라이언트 편집 세션 경계는 유지한다.
- ADR-0016 2단계 설치물·업데이트·제거와 daemon 통합 검증, 부팅 자동 시작·자동 복구·무중단 업데이트.
