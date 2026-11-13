# ADR-0015: Shared Host operations for UI, HTTP, CLI and assistant tools

> 2026-11-13 소유자 결정(#1595): 다른 PC의 Host 등록·접속과 여러 Host UI는 삭제했다. 같은 PC의 공유 daemon·수동 다시 연결, CLI `--host <origin>`과 개발·검사용 독립 HTTP Host는 유지한다. 내부 hostId·연결 고정 client·취소/세대 보호와 저장/복구 형식은 이번 PR에서 바꾸지 않았다. 삭제 전 구현은 `archive/2026-11-13-plugins-declarative`에 보관한다. 아래 원격 관련 결정은 당시 기록이며 현재 제공 기능이 아니다.

- Status: Accepted
- Partially superseded by: [ADR-0021](0021-general-agent-assistant.md) — 1절의 필요 시 비서 도구 생성 결정을 CLI·스킬 기본과 창 연동 전용 도구로 대체하며, Host 공용 작업·CLI 필수는 유지한다.
- Amended by: [ADR-0020](0020-plugin-architecture.md)
- Decision date: 2026-11-04
- Last verified: 2026-11-05 — #1150·ADR-0017 전환과 ADR-0020의 재개 시 비서 관리 개정을 문서 대조. 제품 실행 검증 없음. 기존 구현 근거는 아래 기록과 Implemented 계약을 따른다.
- Previous verification: 2026-11-04 — #1132 승인·Discussion 기록과 관련 ADR/Implemented 계약의 문서 대조. 제품 실행이나 기능 이행 검증은 포함하지 않는다.
- Authority: [#1132 소유자 승인](https://github.com/litzio/litzio/issues/1132#issuecomment-6618888405), [종합과 결정 제안](https://github.com/litzio/litzio/issues/1132#issuecomment-6618863609), [Discussion #767 결정 기록](https://github.com/litzio/litzio/discussions/767#discussioncomment-19386313), under [AGENTS.md](../../AGENTS.md).
- Scope: 새 사용자 기능의 공용 작업·CLI·비서 도구 계약. 기존 기능은 아래 순서로 이행한다. 로컬 daemon 연결·수명은 ADR-0016에서 결정하며 편집 상태 공유는 계속 보류한다.

- Amendment date: 2026-11-05 — [ADR-0020 비서 제작 로드맵](0020-plugin-architecture.md#비서-플러그인-제작-로드맵2026-11-05-개정)에 따라 플러그인 관리의 건별 명시 승인을 제거하고 사용자에게 보이는 활동 기록으로 대체한다. secret 비노출·제품 고정 공식 목록·digest 신뢰 기록은 유지한다. AI 권한·공급자·모델 변경 금지와 문서 교정 승인은 그대로다. 현재 구현 변경 완료를 뜻하지 않는다.

## Amendment: 공유 로컬 daemon Host (2026-11-04, #1142)

[ADR-0016](0016-shared-local-daemon-host.md)은 소유자 승인에 따라 Desktop의 custom protocol·in-process Host·TCP 없음 경계를 공유 로컬 HTTP daemon으로 대체하고, 실행 중 daemon 자동 탐색·연결과 수명 정책을 결정한다. 로컬 daemon은 Root 제한 없이 동작한다. 2026-11-04 소유자의 최종 승인에 따라 현재 단계는 별도 인증이 없으며 인증 방식과 시점은 #1145에서 향후 검토한다. 제품/프로토콜 버전 분리와 자동 교체 금지, 종료·휴지통·샘플·origin 정책 및 기간 한정 테스트 예외는 해당 ADR을 따른다. ADR-0016 ③에 따라 수동 원격 daemon도 Root 제한 없이 실행할 수 있고 non-loopback 시작 시 무인증 접근 위험을 경고한다. Desktop daemon은 loopback 전용이다. 공유 편집 세션과 원격용 HTTPS·계정 체계는 계속 보류한다.

이 개정은 결정이며 PR1에서 제품 동작을 바꾸지 않는다. 아래 기존 transport·Root·인증·수명 서술은 개정 전 결정과 현재 구현의 기록이다. 충돌하는 결정에는 ADR-0016이 우선하며 구현 계약은 PR2~PR4에서 실제 변경과 함께 갱신한다.

## Amendment (2026-11-04, #1139)

The [owner-approved terminology amendment](https://github.com/litzio/litzio/issues/1139) defines daemon as a shared Host process separate from the UI, without deciding its lifetime. `daemon run` starts the independent foreground HTTP Host; Desktop retains its in-process Host. At that amendment, automatic discovery/connections, lifetime management and shared editing were deferred; ADR-0016 now decides local daemon discovery/connections and lifetime. Shared editing remains deferred. See the [HTTP Host terminology](../design/http-host-v1.md#host-and-daemon-terminology-1139). This amends the earlier blanket daemon deferral; it does not introduce those deferred capabilities.

## Context

문서 의미는 Core가 소유하지만 앱 기능은 화면·HTTP·CLI·비서 도구 중 일부에만 제공되어 왔다. 템플릿은 화면·HTTP·CLI에 있으나 비서는 셸 CLI 안내에 의존하고, CLI가 PATH에 없거나 템플릿 폴더에 셸 쓰기 권한이 없으면 작업을 이어 가지 못한다. CLI 생성 결과도 기존 비서의 결과 카드·되돌리기와 연결되지 않는다.

두 독립 조사는 기존 Core, 파일 교체, 템플릿 저장 함수와 플러그인 작업을 재사용하는 단계적 공용 작업 계약을 추천했다. 같은 함수를 쓰는 것과 실행 중인 Host의 상태를 함께 쓰는 것은 다르다. 현재 Desktop은 TCP 없는 in-process Host이며, 미저장 내용·Undo·표시 설정은 화면이 소유한다.

## Decision

### 1. 새 사용자 기능은 공용 작업과 CLI를 함께 제공한다

새 사용자 기능은 **Host 공용 작업(입력·결과·범위·receipt)** 으로 정의한다. 화면과 HTTP·CLI는 같은 정의와 실행 함수를 사용하는 얇은 인터페이스로 둔다. CLI 명령을 반드시 함께 제공하고, 비서에서 필요하면 같은 정의로 비서 도구를 만든다. 모든 작업을 자동으로 비서에 공개한다는 뜻은 아니다.

공용 정의에는 다음 경계를 드러낸다.

- **입력:** 대상과 동작을 명시하고 공용 실행 경로에서 검증한다. HTTP JSON, CLI 인자, provider 도구 형식의 변환은 각 인터페이스가 담당한다.
- **결과:** 성공·거부·실패를 구분하고 인터페이스가 같은 작업 결과를 보존한다. 실패를 성공 안내로 바꾸지 않는다.
- **범위:** 문서 경로·저장 snapshot/revision, Host Roots, 열린 폴더와 쓰기 권한, 앱 소유 저장소 또는 특정 클라이언트가 필요한지를 명시한다. 호출자가 권한을 주장하는 것만으로 범위를 넓히지 않는다.
- **receipt:** 실행 결과를 확인할 수 있는 근거를 반환한다. 새 문서 생성은 기존 path/revision/identity 결과를 재사용하고, 플러그인 작업은 기존 요청 기록을 재사용한다. 이를 이유로 모든 읽기 작업에 영속 기록이나 범용 ledger를 만들지는 않는다.

문서 의미와 유효성·canonical write는 계속 Core의 editor-neutral 연산이 소유한다. Host 공통화는 의미 처리를 Host로 옮기거나 CLI·비서에 Markdown/AST 처리를 복제하는 결정이 아니다. 기존 함수부터 재사용하며 범용 registry, schema 생성기나 backend infrastructure를 선제 도입하지 않는다.

cursor, focus, selection, toolbar, hover 등 Editor 전용 interaction은 기존대로 CLI parity 대상이 아니다. 특정 화면의 상태가 필요한 명령은 그 대상·필요 조건을 명시하며, 공용 작업을 정의했다는 이유로 상태를 Host 전역으로 옮기지 않는다. 기존 기능의 빈칸을 이번 결정 PR에서 모두 채우지는 않는다. 과거의 “문서 의미 연산이 아니므로 CLI 생략”을 새 사용자 기능의 생략 근거로 사용하지 않는다.

AI가 daemon 공식 기능으로 옮겨가는 결정은 [ADR-0017](0017-bundled-client-and-official-ai.md)을 따른다. #1137의 `plugins configure ai-agent` 등 AI 설정 CLI도 플러그인 명령에서 공식 설정 명령으로 옮기고 같은 공용 작업(입력·결과·범위·receipt)을 호출한다. AI 켜기/끄기 설정은 제공하지 않는다. AI 가용성은 사용 가능한 프로바이더로만 판단하며, 가용 프로바이더가 없으면 이유와 함께 신규 대화·aiTasks 요청을 거부하고 진행 작업에는 영향을 주지 않는다. 남는 공식 AI 설정은 공용 작업과 CLI로 제공하며, 비서의 AI 권한·프로바이더·모델 변경 금지는 유지한다. ③a에서 AI가 플러그인 경로 없이 동작하게 한 뒤 ③b에서 `plugins` CLI·설정의 플러그인 영역을 관련 기능과 함께 삭제한다. 이는 기능 제거이며 남는 공식 기능의 CLI 요구는 유지한다. 구체 명령 표기는 구현 PR에서 정하고 이 문서가 제공 완료를 뜻하지는 않는다.

### 2. 같은 작업 정의와 실행 중 Host 연결은 구분한다

현재 CLI는 공용 함수를 자기 프로세스에서 실행할 수 있다. 이것은 실행 중 Desktop/HTTP Host를 호출하거나 그 창의 편집 상태를 사용하는 기능이 아니다. ADR-0016은 Desktop의 로컬 daemon 자동 탐색·연결과 관리 CLI를 결정한다. 모든 기존 CLI 명령을 live daemon RPC로 바꾸는 방식은 결정하지 않는다. ADR-0004의 in-process·TCP 없음 경계는 그 ADR로 대체된다.

**Host 호출 실패나 timeout을 로컬 재실행으로 바꾸지 않는다.** 응답을 받지 못해도 Host에서 쓰기가 완료됐을 수 있으므로 실패 또는 결과 불확실로 반환한다. 실행 대상과 권한이 다른 로컬 경로로 전환해 중복 쓰기를 일으키지 않는다. ADR-0012의 UUID·uncertain·자동 재실행 금지 계약은 그대로 유지한다.

### 3. 결과 카드와 되돌리기는 기존 보호를 재사용한다

비서의 새 문서 생성은 기존 `create_document` 결과 카드와 guarded 되돌리기에 연결한다. 파일 identity/revision과 현재 창의 미저장·복구 보호를 유지한다. 생성 취소를 위한 파일 삭제, Editor의 문서 편집 Undo, 플러그인 작업의 되돌리기는 서로 다른 계약이다.

CLI stdout에 같은 receipt가 있다는 것만으로 다른 창에 결과 카드가 생기거나 편집 history에 들어가지는 않는다. 공용 작업 계약은 화면 소유 상태를 공유하는 계약이 아니다.

### 4. 향후 동시 편집을 위한 경계를 유지한다

여러 사용자 동시 편집은 단기 계획이 아니지만 유력한 미래 목표다. 지금 다음 조건을 유지한다.

- 공용 작업은 화면 상태를 가정하지 않는 명령으로 정의한다.
- 문서 의미는 Core의 editor-neutral 연산으로 유지한다.
- 화면 소유 상태인 미저장 내용·Undo·표시 설정과 열린 탭 등은 공유하지 않는다고 명시한다.
- daemon은 화면과 따로 실행되는 공용 Host 프로세스다. 로컬 수명 정책은 ADR-0016을 따른다.

공유 문서 모델, 화면 상태를 세션으로 옮길 범위, ADR-0001·0002와 인증은 동시 편집 결정 때 별도로 다룬다. 로컬 daemon 자동 탐색·연결과 수명 관리는 ADR-0016에서 결정하며 공유 편집 session/history는 계속 보류한다.

## Relationship to existing decisions

- [ADR-0001](0001-single-document-editor-architecture.md)·[ADR-0002](0002-document-persistence-semantic-ownership.md)·[ADR-0007](0007-editing-session-lifetime.md): single-document editor state, plain-text SSOT, Core 의미·쓰기, 명시적 Save와 클라이언트 복구를 유지한다.
- [ADR-0004](0004-desktop-host-distribution.md): Desktop custom protocol과 in-process Host·TCP 없음은 ADR-0016으로 대체한다. 설치형 CLI 통합을 켜는 것과 비서 child에 CLI 경로를 전달하는 것은 다르며 시스템 PATH 변경을 요구하지 않는다.
- [ADR-0005](0005-http-host.md): 공용 파일 handler와 Core 경계는 유지한다. 로컬 공유 daemon의 Root·인증은 ADR-0016을 따르며, 현재 고정 Root 전경 Host 계약은 구현 PR에서 갱신한다. 공용 작업이 새 persistence/backend나 다중 사용자 인증을 도입하지 않는다.
- [ADR-0012](0012-plugin-runtime-and-ui-contributions.md): 공용 설치·등록/요청 기록은 live controller나 편집 세션 공유가 아니다. worker 수명·요청 중복 방지·완료 결과 공개·uncertain/no-replay를 재사용하며 로컬 daemon 자동 탐색·연결과 수명 관리는 ADR-0016으로 정하고 공유 편집 세션 보류는 유지한다.
- [ADR-0013](0013-ai-agent-task-service.md)·[ADR-0014](0014-main-agent-app-server.md): 기존 AI 실행·연결·대화의 CLI 생략은 당시 구현 범위로 남긴다. 문서 의미 연산이 아니라는 이유로 향후 사용자 기능의 CLI를 생략하는 규칙은 이 ADR이 대체한다. 이 문서 PR은 해당 기존 기능의 CLI나 provider 연결을 구현하지 않는다.

## First case and follow-up

첫 사례는 [#1128 템플릿](https://github.com/litzio/litzio/issues/1128)이다. 목록·읽기·템플릿으로 새 문서·문서를 템플릿으로 저장을 공용 정의로 묶고 HTTP·CLI·Codex 동적 도구가 재사용한다. 기존 템플릿 함수와 문서 생성·카드·guarded 되돌리기를 연결한다. 비서의 제안 → 허락 → 적용 규칙을 유지하며, 템플릿은 Litzio 도구로, CLI는 터미널에서 이어서 작업할 때 쓰도록 안내한다. Host는 자기 CLI 경로를 비서 프로세스 PATH 앞에 전달하며 시스템 PATH는 바꾸지 않는다(서버·Desktop 공통).

현재 [템플릿](../design/document-templates-v1.md)·[비서](../design/main-agent-v1.md)의 Implemented 계약은 구현 사실을 설명한다. #1128 구현 PR에서 해당 계약을 갱신한다. 그다음 플러그인 켜기·끄기·설정의 CLI 빈칸을 채우고 [Copilot 연결 #1121](https://github.com/litzio/litzio/issues/1121)을 결정한다. 이번 결정은 그 기능들을 이미 제공한다는 선언이 아니다.

## Historical evidence

조사 원본은 아래 고정 커밋 링크로 보존한다. master의 유지 문서로 복사하지 않으며, 당시 조사·추정은 현재 요구사항이 아니다. 승인된 범위의 authority는 이 ADR과 #1132 소유자 승인이다.

- [Sol 조사 — f753d563](https://github.com/litzio/litzio/blob/f753d563036ef277e0e27393ac23f38b8b5f3eac/docs/reviews/interface-inventory-1132-2026-11-04.md)
- [Astra 조사 — 4f9607ee](https://github.com/litzio/litzio/blob/4f9607eec4497efc74ae615e86a4651fa4358263/docs/reviews/interface-inventory-1132-astra-2026-11-04.md)
