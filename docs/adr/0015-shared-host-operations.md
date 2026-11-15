# ADR-0015: Shared Host operations for UI, HTTP, CLI and assistant tools

- Status: Accepted
- Amended by: [ADR-0016](0016-shared-local-daemon-host.md) — 공유 로컬 HTTP daemon의 연결·Root·수명.
- Partially superseded by: [ADR-0021](0021-general-agent-assistant.md) — 1절의 필요 시 비서 도구 생성 결정을 CLI·스킬 기본으로 대체하며, Host 공용 작업·CLI 필수는 유지한다.

- Amended by: [ADR-0020](0020-plugin-architecture.md)
- Decision date: 2026-11-04
- Last verified: 2026-11-16 — 현재 계약·코드와 삭제된 기능의 잔재를 정적으로 대조했다. 제품·브라우저·Desktop·AI 실행 재검증 없음.
- Authority: [#1132 소유자 승인](https://github.com/litzio/litzio/issues/1132#issuecomment-6618888405), [종합과 결정 제안](https://github.com/litzio/litzio/issues/1132#issuecomment-6618863609), [Discussion #767 결정 기록](https://github.com/litzio/litzio/discussions/767#discussioncomment-19386313), under [AGENTS.md](../../AGENTS.md).
- Scope: 새 사용자 기능의 공용 작업·CLI·비서 도구 계약. 로컬 daemon 연결·수명은 ADR-0016에서 결정하며 편집 상태 공유는 계속 보류한다.

## 2026-11-14 개정

- Authority: 2026-11-14 소유자 결정(Q1 승인, #1595 목적 기준 재검토).

미래 동시 편집 대비는 지금 하지 않는다. 실제 충돌 사례가 확인될 때 다시 논의하며 [제품 목적](../purpose.md#지금-하지-않는-것)의 재논의 조건을 따른다. 1~3절의 공용 작업·CLI·Core 의미 소유·클라이언트 상태 분리·결과 불확실 보호는 유지한다.

## Context

문서 의미는 Core가 소유하지만 앱 기능은 화면·HTTP·CLI·비서 도구 중 일부에만 제공되어 왔다. 템플릿은 화면·HTTP·CLI에 있으나 비서는 셸 CLI 안내에 의존하고, CLI가 PATH에 없거나 템플릿 폴더에 셸 쓰기 권한이 없으면 작업을 이어 가지 못한다. CLI 생성 결과도 기존 비서의 결과 카드·되돌리기와 연결되지 않는다.

두 독립 조사는 기존 Core, 파일 교체, 템플릿 저장 함수와 플러그인 작업을 재사용하는 단계적 공용 작업 계약을 추천했다. 같은 함수를 쓰는 것과 실행 중인 Host의 상태를 함께 쓰는 것은 다르다. 미저장 내용·Undo·표시 설정은 화면이 소유한다.

## Decision

### 1. 새 사용자 기능은 공용 작업과 CLI를 함께 제공한다

새 사용자 기능은 **Host 공용 작업(입력·결과·범위·receipt)** 으로 정의한다. 화면과 HTTP·CLI는 같은 정의와 실행 함수를 사용하는 얇은 인터페이스로 둔다. CLI 명령을 반드시 함께 제공한다. 비서 도구 기준은 [ADR-0021](0021-general-agent-assistant.md)을 따른다.

공용 정의에는 다음 경계를 드러낸다.

- **입력:** 대상과 동작을 명시하고 공용 실행 경로에서 검증한다. HTTP JSON, CLI 인자, provider 도구 형식의 변환은 각 인터페이스가 담당한다.
- **결과:** 성공·거부·실패를 구분하고 인터페이스가 같은 작업 결과를 보존한다. 실패를 성공 안내로 바꾸지 않는다.
- **범위:** 문서 경로·저장 snapshot/revision, Host Roots, 열린 폴더와 쓰기 권한, 앱 소유 저장소 또는 특정 클라이언트가 필요한지를 명시한다. 호출자가 권한을 주장하는 것만으로 범위를 넓히지 않는다.
- **receipt:** 실행 결과를 확인할 수 있는 근거를 반환한다. 새 문서 생성은 기존 path/revision/identity 결과를 재사용한다. 이를 이유로 모든 읽기 작업에 영속 기록이나 범용 ledger를 만들지는 않는다.

문서 의미와 유효성·canonical write는 계속 Core의 editor-neutral 연산이 소유한다. Host 공통화는 의미 처리를 Host로 옮기거나 CLI·비서에 Markdown/AST 처리를 복제하는 결정이 아니다. 기존 함수부터 재사용하며 범용 registry, schema 생성기나 backend infrastructure를 선제 도입하지 않는다.

cursor, focus, selection, toolbar, hover 등 Editor 전용 interaction은 기존대로 CLI parity 대상이 아니다. 특정 화면의 상태가 필요한 명령은 그 대상·필요 조건을 명시하며, 공용 작업을 정의했다는 이유로 상태를 Host 전역으로 옮기지 않는다. 기존 기능의 빈칸을 이번 결정 PR에서 모두 채우지는 않는다. 과거의 “문서 의미 연산이 아니므로 CLI 생략”을 새 사용자 기능의 생략 근거로 사용하지 않는다.

### 2. 같은 작업 정의와 실행 중 Host 연결은 구분한다

현재 CLI는 공용 함수를 자기 프로세스에서 실행할 수 있다. 이것은 실행 중 Desktop/HTTP Host를 호출하거나 그 창의 편집 상태를 사용하는 기능이 아니다. ADR-0016은 Desktop의 로컬 daemon 자동 탐색·연결과 관리 CLI를 결정한다. 모든 기존 CLI 명령을 live daemon RPC로 바꾸는 방식은 결정하지 않는다. ADR-0004의 in-process·TCP 없음 경계는 그 ADR로 대체된다.

**Host 호출 실패나 timeout을 로컬 재실행으로 바꾸지 않는다.** 응답을 받지 못해도 Host에서 쓰기가 완료됐을 수 있으므로 실패 또는 결과 불확실로 반환한다. 실행 대상과 권한이 다른 로컬 경로로 전환해 중복 쓰기를 일으키지 않는다.

### 3. 결과 카드와 되돌리기는 기존 보호를 재사용한다

비서의 새 문서 생성은 기존 `create_document` 결과 카드와 guarded 되돌리기에 연결한다. 파일 identity/revision과 현재 창의 미저장·복구 보호를 유지한다. 생성 취소를 위한 파일 삭제와 Editor의 문서 편집 Undo는 서로 다른 계약이다.

CLI stdout에 같은 receipt가 있다는 것만으로 다른 창에 결과 카드가 생기거나 편집 history에 들어가지는 않는다. 공용 작업 계약은 화면 소유 상태를 공유하는 계약이 아니다.

### 4. 향후 동시 편집을 위한 경계를 유지한다

이 절의 미래 대비 의무는 [2026-11-14 개정](#2026-11-14-개정)으로 대체됐다.

## Relationship to existing decisions

공용 작업의 문서 의미는 [ADR-0002](0002-document-persistence-semantic-ownership.md), 로컬 연결·수명은 [ADR-0016](0016-shared-local-daemon-host.md), 공식 AI는 [ADR-0017](0017-bundled-client-and-official-ai.md), 비서 도구 기준은 [ADR-0021](0021-general-agent-assistant.md)을 따른다.

## Historical evidence

조사 원본은 아래 고정 커밋 링크로 보존한다. master의 유지 문서로 복사하지 않으며, 당시 조사·추정은 현재 요구사항이 아니다. 승인된 범위의 authority는 이 ADR과 #1132 소유자 승인이다.

- [Sol 조사 — f753d563](https://github.com/litzio/litzio/blob/f753d563036ef277e0e27393ac23f38b8b5f3eac/docs/reviews/interface-inventory-1132-2026-11-04.md)
- [Astra 조사 — 4f9607ee](https://github.com/litzio/litzio/blob/4f9607eec4497efc74ae615e86a4651fa4358263/docs/reviews/interface-inventory-1132-astra-2026-11-04.md)
