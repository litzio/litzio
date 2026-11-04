# ADR-0017: Desktop 번들 UI와 daemon 공식 AI 기능

- Status: Accepted
- Decision date: 2026-11-04
- Last verified: 2026-11-04 — #1150·#1142, 관련 ADR 및 Paseo `bfbd4d5` 사전 정적 조사 대조. 제품 실행 검증 없음.
- Authority: 2026-11-04 소유자 승인 결정, [#1150](https://github.com/litzio/litzio/issues/1150), under [AGENTS.md](../../AGENTS.md). AI 가용성과 플러그인 시스템 전체 일시 중단은 소유자 최종 결정이다. 플러그인 UI 경계와 Docling 제외 종료의 적용은 소유자가 개시하는 플러그인 재개 때 다룬다.
- Scope: 같은 PC의 로컬 daemon, 공식 AI 흡수와 플러그인 시스템 일시 중단·소유자 개시 후 재개, Desktop 번들 UI 전환. Accepted는 구현 완료를 뜻하지 않는다.
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

**소유자 최종 결정: AI는 항상 존재하는 공식 기능이며 AI를 끄는 버튼·스위치를 제공하지 않는다.** 사용 가능한 프로바이더가 있는지로만 AI 사용 가능 여부를 판단한다. 사용 가능한 프로바이더가 없으면 새 AI 작업(대화·`aiTasks` 요청)은 그 이유를 알리며 거부하고 이미 진행 중인 작업에는 영향을 주지 않는다. Docling 등 플러그인이 확인하던 AI 사용 가능 상태도 프로바이더 가용성으로 대체한다. 기존 “Codex 사용” 같은 켜기/끄기 설정은 남기지 않으며 하위 호환은 제공하지 않는다. #1137의 `plugins configure ai-agent` 등 AI 설정 CLI는 공식 설정 명령으로 옮기고 ADR-0015에 따라 입력·결과·범위·receipt를 공용 Host 작업으로 정의한다. 새 AI 사용자 기능은 공용 작업 + CLI를 제공하되 기존 기능 전체의 CLI화를 요구하지 않는다. 구체 명령 표기는 구현 PR에서 정하며 호환 alias나 과거 데이터 migration은 만들지 않는다. 비서는 AI 권한·프로바이더·모델과 플러그인을 변경하지 못한다는 기존 도구 원칙을 유지한다.

ADR-0013의 Host 중개 작업 메시지, provider-neutral 기능 요청, caller의 내용 검증과 baseline 확인, UUID·uncertain/no-replay 보호는 플러그인 재개 때 복원할 계약으로 기록한다. 공식 기능 전환을 문서 의미의 Host 이전이나 새 provider framework의 근거로 쓰지 않는다.

`aiTasks` 구현은 플러그인 중단 기간에 유지할 필요가 없다. 다만 재작업 위험을 줄이기 위해 재개 때 복원할 최소 서비스 계약을 보존한다. caller별 조회·취소 제한, caller 활성 상태와 신규 요청 시 프로바이더 가용성 검사, receipt의 ID/caller/task/baseline 일치, uncertain·no-replay를 보존한다. 근거는 조사 기준 `plugin-host.ts`의 caller 경계와 Docling `structure-review.ts`의 receipt 검증이다. 새 범용 서비스 registry는 만들지 않는다.

기존 AI 플러그인 disable을 공식 기능의 설정 계약으로 옮기지 않는다. 프로바이더 가용성 변화 자체는 진행 작업의 취소·drain·provider 연결 종료 신호가 아니며, 기존 명시적 취소·timeout·daemon 종료 계약은 유지한다.

### 2. 플러그인 시스템 전체를 일시 중단한다

지금은 코어 기능의 핵심 전환 단계이므로 Docling만 분리하지 않고 플러그인 시스템 전체를 접어 둔다. daemon은 플러그인을 로드·실행하지 않는다. worker 실행, 플러그인 UI 기여 ESM/CSS 로드, 플러그인 route를 연결하지 않으며 Desktop 번들 UI에도 플러그인 UI를 싣지 않는다. `plugins` CLI 명령과 설정 화면의 플러그인 영역은 제공하지 않거나 “일시 중단” 상태로 둔다. 플러그인 코드는 저장소에 남기되 연결하지 않는다.

플러그인 테스트는 이 기간 제외하며 fixture 플러그인 런타임 검증도 재개 때로 옮긴다. ADR-0016 ⑥의 기간 한정 소유자 예외를 플러그인 시스템 전체와 관련 테스트로 확대한다. 제외 전 CI 시간·제외 목록·복구 대상을 기록한다. 문서 유효성·데이터 보존·공식 write path와 무관한 테스트 기준은 완화하지 않는다.

**중단 기간의 종료 조건은 소유자가 명시적으로 플러그인 재개를 개시하는 것이다.** 그때까지 Docling은 사용할 수 없고 릴리스하지 않는다. Desktop 전환이나 fixture 통과만으로 자동 재개하거나 재개 완료를 선언하지 않는다. 재개 시 Docling을 새 구조 위 플러그인으로 다시 붙이고 공식 AI를 사용하게 한다. Docling 제외 종료의 구체 적용과 재개 완료·릴리스 재개 판정은 플러그인 재개 때 정한다.

재개 때 fixture는 등록 성공만이 아니라 실제 worker 실행·drain·중단 후 uncertain/no-replay·완료 결과 공개, 실제 ESM/CSS 로드·비활성화/재등록과 공식 AI 서비스 호출을 검증한다. fixture는 Docling 변환·검수 품질을 대신하지 않으며 fixture 통과만으로 재개 완료를 선언하지 않는다.

### 3. Desktop UI 배포와 Host 연결을 분리한다

Desktop은 앱에 번들된 UI를 로드한다. 문서·AI 등 코어 Host 작업과 자산 접근은 HTTP Host API를 사용한다. Desktop bridge는 daemon 탐색·시작·종료·연결 정보와 기존 OS shell 기능을 유지하되 별도 문서 Host 경로가 되지 않는다. daemon은 브라우저용 웹 UI를 계속 제공한다.

Editor의 모든 Host 호출과 렌더링 URL은 대상 Host를 아는 Host 클라이언트를 거친다. 문서·폴더·복구·템플릿·비서 API와 폴링, 문서 이미지·미리보기 등 코어 자산 URL을 포함한다. 플러그인 API·CSS/ESM·자산 URL은 중단하며 재개 때 다룬다. 원문의 상대 URI는 보존하고 렌더링 경계에서 Host 주소를 적용한다. 문서에 daemon 절대 주소를 저장하지 않는다. 앱 UI의 BASE_URL을 Host 주소로 간주하지 않는다. 이 단계의 범위는 사전 조사된 29 fetch 호출식과 6 리소스 sink 중 플러그인 중단 뒤 남는 코어 호출·자산의 전환이며 조사된 Desktop bridge 26곳은 HTTP로 옮기지 않는다. 다중 Host registry·relay·범용 transport는 만들지 않는다.

이번 연결 대상은 같은 PC의 로컬 daemon 하나다. 원격 Host 설정·여러 Host 동시 보기의 저장소나 화면을 미리 구현하지 않는다. daemon 중단 중에도 번들 화면과 연결 상태가 남아야 한다. ADR-0016의 수동 다시 연결·주체별 종료·명시적 종료, 제품/프로토콜 버전 정책과 Host 실패 시 로컬 재실행 금지는 유지한다.

Desktop origin을 daemon에 명시적으로 허용한다. 구현은 CORS·OPTIONS, 허용 methods/headers와 Origin 목록, 실제 HTTP Host authority 목록 및 CSP를 함께 다룬다. custom scheme의 UI origin을 TCP Host 목록에 섞거나 wildcard로 넓히지 않는다. 기존 쓰기 Origin 검사와 문서 SVG/HTML sandbox 보호를 유지하고, 문서 이미지·미리보기 등 코어 리소스의 cross-origin/CORP 전환을 검증한다. 플러그인 ESM/CSS 로드는 이번 전환 검증에서 제외하며 재개 때 결정·검증한다. 인증 방식·시점은 #1145에 남긴다.

ADR-0016의 고정 HTTP origin은 daemon에 유지한다. Desktop UI는 별도 번들 origin으로 전환한다. ADR-0012의 플러그인 same-origin UI 자산 규칙은 중단 기간 적용 대상이 없으며 번들 origin의 플러그인 ESM/CSS 경계는 재개 때 결정한다. 정확한 scheme 표기는 구현 PR에서 정한다. API·플러그인 UI의 비호환 변경 때는 프로토콜 버전을 올린다. 제품 버전 차이는 경고, 프로토콜 불일치는 거부한다. 구 CLI daemon에 신 번들 UI 연결은 지원하지 않으며 호환 계층·capability 협상은 만들지 않는다. 기존 origin 저장소·설정·문서 데이터의 하위 호환과 migration은 포함하지 않는다.

### 4. 플러그인 UI 신뢰 경계는 재개 때 결정·적용한다

중단 기간에는 로컬·원격 여부와 무관하게 플러그인 UI를 로드하지 않는다. 이전의 “로컬 daemon에 등록된 신뢰 플러그인 UI만 특권 창에서 실행” 추천은 이번 전환의 적용 규칙으로 확정하지 않는다. 플러그인 재개 때 원격 Host 플러그인 UI 실행 방식(격리 iframe, 미실행 등)과 번들 origin의 플러그인 ESM/CSS 로드 경계·신뢰 규칙을 결정한다. Paseo의 원격 bundle 실행을 안전성 보증으로 채택하지 않는다.

## 이행 순서와 완료 조건

1. **#1142 PR4:** 플러그인·AI 수명 계약과 기존 한정 테스트 복구를 먼저 완료한다. 같은 파일의 개정은 PR4 병합 뒤 master를 merge하여 양쪽을 보존한다.
2. **ADR (이 PR):** 승인 결정과 일시 중단·재개 경계를 기록한다. 코드 변경 없음.
3. **AI 흡수 + 플러그인 시스템 일시 중단:** 공식 AI와 설정 공용 작업·CLI를 제공하고, 플러그인 worker·route·UI·관리 CLI/설정 연결을 중단한다. 테스트 제외 범위와 측정·재개 시 복원할 계약을 기록한다. fixture 실행 검증은 재개 때 수행한다.
4. **Host 클라이언트:** 기존 코어 동작을 바꾸지 않고 남는 Host 호출·리소스 URL을 대상 Host 문맥으로 모은다. 브라우저 경로도 유지한다.
5. **Desktop 번들 UI + daemon origin 허용:** daemon 중단 상태의 화면·수동 다시 연결, 정확한 Desktop 번들 origin 허용·OPTIONS, 기존 cross-site API/media 거부 및 CORP same-origin 규칙의 전환, 문서 이미지·미리보기와 Electron main-frame IPC 검사, 브라우저 접속을 검증한다. 플러그인 ESM/CSS는 로드하지 않는다. ③과 ⑤를 한 PR로 합치지 않는다.
6. **소유자 개시 시 플러그인 재개·Docling 재연결:** UI 신뢰·번들 origin 경계와 제외 종료의 적용을 결정하고, 보존한 서비스 계약·fixture 및 관련 테스트를 복원한다. 새 구조 위 Docling과 공식 AI 연결·품질을 확인하며 fixture만으로 재개 완료를 선언하지 않는다.

복구 검증은 둘로 구분한다. #1142 PR4의 재연결은 같은 편집 세션의 미저장 내용·Undo → Save를 검증한다. Desktop 번들 UI 전환에서는 새 번들 origin에서 앱 종료·재시작 → Restore → Save 및 외부 변경 충돌을 별도로 검증한다. 과거 origin 데이터 이전은 없다.

이 PR은 문서만 변경한다. 각 구현 PR이 해당 [HTTP Host](../design/http-host-v1.md), [Desktop distribution](../design/desktop-distribution-v1.md), [Main agent](../design/main-agent-v1.md), [Plugin runtime](../design/plugin-runtime-v1.md), [Plugin UI](../design/plugin-ui-v1.md), [Docling conversion](../design/docling-conversion-v1.md) 계약을 실제 동작과 함께 갱신한다. 아직 구현되지 않은 결정을 Implemented 계약의 현재 동작으로 쓰지 않는다.

## Deferred

- 원격 Host 주소 설정과 여러 Host 동시 보기.
- 플러그인 재개 때 결정/적용: 원격 Host 플러그인 UI 신뢰·격리·실행 방식, 번들 origin의 플러그인 ESM/CSS 로드 경계, Docling 제외 종료의 적용·재개 완료 판정.
- 인증 방식·도입 시점, HTTPS·계정·권한 체계([#1145](https://github.com/litzio/litzio/issues/1145)). 현재 무인증 단계는 바꾸지 않는다.
- 공유 편집·미저장 내용·Undo/history의 공유. plain-text SSOT, Core 의미·valid write와 클라이언트 편집 세션 경계는 유지한다.
- ADR-0016 2단계 설치물·업데이트·제거와 daemon 통합 검증, 부팅 자동 시작·자동 복구·무중단 업데이트.
