# ADR-0017: Desktop 번들 UI와 daemon 공식 AI 기능

- Status: Accepted
- Decision date: 2026-11-04
- Last verified: 2026-11-04 — #1150·#1142, 관련 ADR 및 Paseo `bfbd4d5` 사전 정적 조사 대조. 제품 실행 검증 없음.
- Authority: 2026-11-04 소유자 승인 결정, [#1150](https://github.com/litzio/litzio/issues/1150), under [AGENTS.md](../../AGENTS.md). AI 가용성과 플러그인·Docling 기능 제거·보관은 소유자 최종 결정이다. 플러그인 컨셉 재개발은 소유자가 명시적으로 개시할 때 다룬다.
- Scope: 같은 PC의 로컬 daemon, 공식 AI 이전과 플러그인·Docling 기능 제거·보관, 소유자 개시 후 컨셉 재개발, Desktop 번들 UI 전환. Accepted는 구현 완료를 뜻하지 않는다.
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

AI 에이전트는 기본 포함 플러그인에서 daemon의 공식 기능으로 흡수한다. AI 수명은 daemon 수명이며 [#1142 PR4 (#1151)](https://github.com/litzio/litzio/pull/1151)에서 완료한 연결·실행·중단·종료 계약을 그대로 가져온다. 화면 닫힘이나 연결 해제를 AI 종료 신호로 바꾸지 않는다. daemon 종료로 확정할 수 없는 진행 요청은 uncertain·결과 비공개·UUID 재실행 금지로 남기고, 명시적 사용자 취소와 이미 결정된 timeout은 구분한다. 소유 worker/provider 종료를 기다리며 기존 보호를 유지한다. PR4는 master에 병합되어 #1142가 닫혔으며 이 전환에서 새 수명 정책을 임의로 추가하지 않는다.

**소유자 최종 결정: AI는 항상 존재하는 공식 기능이며 AI를 끄는 버튼·스위치를 제공하지 않는다.** 사용 가능한 프로바이더가 있는지로만 AI 사용 가능 여부를 판단한다. 사용 가능한 프로바이더가 없으면 새 AI 작업(대화·`aiTasks` 요청)은 그 이유를 알리며 거부하고 이미 진행 중인 작업에는 영향을 주지 않는다. Docling 등 플러그인이 확인하던 AI 사용 가능 상태도 프로바이더 가용성으로 대체한다. 기존 “Codex 사용” 같은 켜기/끄기 설정은 남기지 않으며 하위 호환은 제공하지 않는다. #1137의 `plugins configure ai-agent` 등 AI 설정 CLI는 공식 설정 명령으로 옮기고 ADR-0015에 따라 입력·결과·범위·receipt를 공용 Host 작업으로 정의한다. 새 AI 사용자 기능은 공용 작업 + CLI를 제공하되 기존 기능 전체의 CLI화를 요구하지 않는다. 구체 명령 표기는 구현 PR에서 정하며 호환 alias나 과거 데이터 migration은 만들지 않는다. 비서는 AI 권한·프로바이더·모델과 플러그인을 변경하지 못한다는 기존 도구 원칙을 유지한다.

ADR-0013의 Host 중개 작업 메시지, provider-neutral 기능 요청, caller의 내용 검증과 baseline 확인, UUID·uncertain/no-replay 보호는 플러그인 컨셉 재개발 때 복원할 계약으로 기록만 한다. 공식 기능 전환을 문서 의미의 Host 이전이나 새 provider framework의 근거로 쓰지 않는다.

`aiTasks` 구현은 지금 유지할 필요가 없으며 아래 계약만 ADR에 기록한다. 다만 재작업 위험을 줄이기 위해 재개 때 복원할 최소 서비스 계약을 보존한다. caller별 조회·취소 제한, caller 활성 상태와 신규 요청 시 프로바이더 가용성 검사, receipt의 ID/caller/task/baseline 일치, uncertain·no-replay를 보존한다. 근거는 조사 기준 `plugin-host.ts`의 caller 경계와 Docling `structure-review.ts`의 receipt 검증이다. 새 범용 서비스 registry는 만들지 않는다.

기존 AI 플러그인 disable을 공식 기능의 설정 계약으로 옮기지 않는다. 프로바이더 가용성 변화 자체는 진행 작업의 취소·drain·provider 연결 종료 신호가 아니며, 기존 명시적 취소·timeout·daemon 종료 계약은 유지한다.

### 2. 플러그인·Docling 기능을 제거하고 삭제 직전 소스를 보관한다

소유자는 코어 기능의 핵심 전환에 집중하기 위해 플러그인 코드를 남기고 연결만 끊는 방식 대신 **기능 제거**를 결정했다. 플러그인 런타임·UI 기여·`plugins` CLI·설정의 플러그인 영역·Docling 플러그인과 관련 테스트·문서를 저장소에서 삭제한다. `@litzio/plugin-api`도 공식 AI 기능이 쓰지 않는 부분을 삭제한다. 공식 AI가 플러그인 경로 없이 동작하도록 먼저 이전하며, 그 뒤 삭제한다.

삭제 직전 master 커밋을 원격 보관 브랜치 **`archive/plugins-docling-2026-11`**로 남긴다. 보관 브랜치의 기준 SHA와 삭제 범위는 삭제 구현 PR에 기록한다. ③ 구현에서 원격 보관 SHA `ce90560aacaee2482d37c4b25e36e93060ed156c`를 확인했다. ③a·③b는 한 PR로 구현한다. `plugins/`, `packages/plugin-api/`, Host runtime·store·worker·aiTasks·UI 기여 로더, 관리 CLI·설정·Docling과 전용 테스트·fixture·문서를 제거한다. AI 계약은 `apps/editor/shared/ai.ts`, 공식 composition은 `apps/editor/server/ai-host.ts`, 설정 CLI는 `ai settings` / `ai configure --file`로 옮긴다. ④·⑤는 구현하지 않는다.

이는 테스트 기준 약화의 기간 한정 예외가 아니라 기능 제거다. ADR-0016 ⑥의 PR3 예외는 PR4에서 복구한 이력으로 남기며 연장하지 않는다. 제거되는 기능의 테스트·문서를 함께 삭제하고 코어·공식 AI·문서 유효성·데이터 보존·공식 write path의 검증은 유지한다. 기능 제거를 무관한 테스트 삭제 근거로 쓰지 않는다.

소유자는 이미 한 번 검증한 설계이므로 재개발 비용이 낮을 것으로 판단했다. 재개 때는 보관 코드를 참고 자료로 컨셉을 다시 개발하며 그대로 되살리는 것을 전제하지 않는다. 재개는 **소유자가 명시적으로 개시할 때** 진행한다. Docling도 새 구조 위 플러그인으로 재개발하고 공식 AI를 사용한다. fixture 통과만으로 Docling 품질이나 재개 완료를 선언하지 않는다.

**1단계와 #1150 코어 전환 완료 전에는 릴리스하지 않는다.** 그 뒤 플러그인 없는 제품의 릴리스 여부는 소유자가 정한다. 플러그인 재개발을 릴리스의 자동 선행 조건이나 자동 허용 조건으로 삼지 않는다.

### 3. Desktop UI 배포와 Host 연결을 분리한다

Desktop은 앱에 번들된 UI를 로드한다. 문서·AI 등 코어 Host 작업과 자산 접근은 HTTP Host API를 사용한다. Desktop bridge는 daemon 탐색·시작·종료·연결 정보와 기존 OS shell 기능을 유지하되 별도 문서 Host 경로가 되지 않는다. daemon은 브라우저용 웹 UI를 계속 제공한다.

Editor의 모든 Host 호출과 렌더링 URL은 대상 Host를 아는 Host 클라이언트를 거친다. 문서·폴더·복구·템플릿·비서 API와 폴링, 문서 이미지·미리보기 등 코어 자산 URL을 포함한다. 플러그인 API·CSS/ESM·자산 경로는 기능 제거 대상이며 재개발 때 다시 다룬다. 원문의 상대 URI는 보존하고 렌더링 경계에서 Host 주소를 적용한다. 문서에 daemon 절대 주소를 저장하지 않는다. 앱 UI의 BASE_URL을 Host 주소로 간주하지 않는다. 이 단계의 범위는 사전 조사된 29 fetch 호출식과 6 리소스 sink 중 플러그인 기능 제거 뒤 남는 코어 호출·자산의 전환이며 조사된 Desktop bridge 26곳은 HTTP로 옮기지 않는다. 다중 Host registry·relay·범용 transport는 만들지 않는다.

이번 연결 대상은 같은 PC의 로컬 daemon 하나다. 원격 Host 설정·여러 Host 동시 보기의 저장소나 화면을 미리 구현하지 않는다. daemon 중단 중에도 번들 화면과 연결 상태가 남아야 한다. ADR-0016의 수동 다시 연결·주체별 종료·명시적 종료, 제품/프로토콜 버전 정책과 Host 실패 시 로컬 재실행 금지는 유지한다.

Desktop origin을 daemon에 명시적으로 허용한다. 구현은 CORS·OPTIONS, 허용 methods/headers와 Origin 목록, 실제 HTTP Host authority 목록 및 CSP를 함께 다룬다. custom scheme의 UI origin을 TCP Host 목록에 섞거나 wildcard로 넓히지 않는다. 기존 쓰기 Origin 검사와 문서 SVG/HTML sandbox 보호를 유지하고, 문서 이미지·미리보기 등 코어 리소스의 cross-origin/CORP 전환을 검증한다. 플러그인 ESM/CSS 로드는 이번 전환 검증에서 제외하며 컨셉 재개발 때 결정·검증한다. 인증 방식·시점은 #1145에 남긴다.

ADR-0016의 고정 HTTP origin은 daemon에 유지한다. Desktop UI는 별도 번들 origin으로 전환한다. ADR-0012의 플러그인 same-origin UI 자산 규칙은 기능 제거 후 적용 대상이 없으며 번들 origin의 플러그인 ESM/CSS 경계는 재개 때 결정한다. ⑤의 scheme은 `litzio://app`이며 static UI 전용이다. API·플러그인 UI의 비호환 변경 때는 프로토콜 버전을 올린다. 제품 버전 차이는 경고, 프로토콜 불일치는 거부한다. 구 CLI daemon에 신 번들 UI 연결은 지원하지 않으며 호환 계층·capability 협상은 만들지 않는다. 기존 origin 저장소·설정·문서 데이터의 하위 호환과 migration은 포함하지 않는다.

### 4. 플러그인 컨셉 재개발 때 결정할 경계

기능 제거 후 daemon은 플러그인 worker·route·UI 기여 ESM/CSS를 로드·실행하지 않으며 Desktop 번들 UI도 플러그인 UI를 싣지 않는다. 이전의 “로컬 daemon에 등록된 신뢰 플러그인 UI만 특권 창에서 실행” 추천은 이번 코어 전환의 적용 규칙으로 확정하지 않는다.

소유자 재개 개시 때 `aiTasks` 계약 복원, 플러그인 UI 신뢰, 원격 Host 플러그인 UI 실행 방식(격리 iframe, 미실행 등), 번들 origin의 플러그인 ESM/CSS 로드 경계 및 Docling 재개발을 결정한다. 보관 코드의 기존 same-origin 전제를 자동 채택하지 않으며 Paseo의 원격 bundle 실행도 안전성 보증으로 채택하지 않는다.

## 이행 순서와 완료 조건

1. **#1142 PR4 — 완료:** #1151이 master에 병합되어 #1142가 닫혔다. 플러그인·AI daemon 수명, packaged Docling smoke 복구와 ⑥ 예외 종료, 같은 편집 세션의 재연결 보존 검증을 완료했다. 이 PR은 해당 master를 merge하여 PR4의 종료 기록과 후속 기능 제거·보관 결정을 함께 보존한다.
2. **ADR (이 PR):** 승인 결정과 기능 제거·보관·재개발 경계를 기록한다. 코드 변경 없음.
3. **③a AI 공식 기능 이전:** AI 에이전트를 daemon 공식 기능으로 이전하여 플러그인 경로 없이 동작하게 한다. 기존 수명·결과 불확실 보호와 프로바이더 가용성 규칙, 남는 설정 공용 작업·CLI를 제공한다.
4. **③b 플러그인·Docling 기능 제거 및 보관:** 삭제 직전 master를 원격 `archive/plugins-docling-2026-11`로 보관하고 플러그인 런타임·UI·관리 CLI/설정·Docling·관련 테스트·문서를 삭제한다. `@litzio/plugin-api`에서 공식 AI가 사용하지 않는 부분도 삭제한다. 보관 SHA와 삭제 범위·남는 공식 AI 검증을 기록한다.
5. **④ Host 클라이언트:** 기존 코어 동작을 바꾸지 않고 남는 Host 호출·리소스 URL을 대상 Host 문맥으로 모은다. 브라우저 경로도 유지한다. ④ 구현은 `apps/editor/src/host-client.ts`로 API와 코어 렌더링 URL을 모으며 기본 대상 `/`는 같은 serving origin을 유지한다. Desktop bridge·번들 UI·CORS는 변경하지 않는다.
6. **⑤ Desktop 번들 UI + daemon origin 허용:** daemon 중단 상태의 화면·수동 다시 연결, 정확한 Desktop 번들 origin 허용·OPTIONS, 기존 cross-site API/media 거부 및 CORP same-origin 규칙의 전환, 문서 이미지·미리보기와 Electron main-frame IPC 검사, 브라우저 접속을 검증한다. 플러그인 ESM/CSS는 로드하지 않는다. ⑤ 구현은 `litzio://app` static UI·main 확인 후 Host URL 설정·최초 연결 실패 화면과 수동 Reconnect·anonymous CORS 미디어를 제공한다. 새 origin 복구/충돌과 미가동 시작의 packaged 검사는 CI가 실행한다. ③과 ⑤를 한 PR로 합치지 않는다.
7. **소유자 개시 시 컨셉 재개발:** 보관 코드를 참고하여 위 서비스·UI 경계를 결정하고 Docling을 새 구조와 공식 AI에 연결한다. 소스를 그대로 복구하거나 fixture만으로 재개 완료를 선언하지 않는다.

복구 검증은 둘로 구분한다. #1142 PR4의 재연결은 같은 편집 세션의 미저장 내용·Undo → Save를 검증한다. Desktop 번들 UI 전환에서는 새 번들 origin에서 앱 종료·재시작 → Restore → Save 및 외부 변경 충돌을 별도로 검증한다. 과거 origin 데이터 이전은 없다.

ADR 채택 PR은 문서만 변경했다. 각 구현 PR이 해당 [HTTP Host](../design/http-host-v1.md), [Desktop distribution](../design/desktop-distribution-v1.md), [Main agent](../design/main-agent-v1.md), [Plugin runtime](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/plugin-runtime-v1.md), [Plugin UI](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/plugin-ui-v1.md), [Docling conversion](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/docling-conversion-v1.md) 계약을 실제 동작과 함께 갱신한다. 아직 구현되지 않은 결정을 Implemented 계약의 현재 동작으로 쓰지 않는다.

## Deferred

- 원격 Host 주소 설정과 여러 Host 동시 보기.
- 소유자 재개 개시 때 결정: aiTasks 계약 복원, 플러그인 UI 신뢰, 원격 Host 플러그인 UI 실행 방식, 번들 origin의 플러그인 로드 경계, Docling 재개발.
- 인증 방식·도입 시점, HTTPS·계정·권한 체계([#1145](https://github.com/litzio/litzio/issues/1145)). 현재 무인증 단계는 바꾸지 않는다.
- 공유 편집·미저장 내용·Undo/history의 공유. plain-text SSOT, Core 의미·valid write와 클라이언트 편집 세션 경계는 유지한다.
- ADR-0016 2단계 설치물·업데이트·제거와 daemon 통합 검증, 부팅 자동 시작·자동 복구·무중단 업데이트.
