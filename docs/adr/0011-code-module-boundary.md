# ADR-0011: Code module boundary

- Status: Accepted
- Decision date: 2026-10-30
- Last verified: 2026-11-16 — 현재 계약·코드와 삭제된 기능의 잔재를 정적으로 대조했다. 제품·브라우저·Desktop·AI 실행 재검증 없음.
- Authority: owner decisions in [Discussion #766](https://github.com/litzio/litzio/discussions/766) and [Discussion #767](https://github.com/litzio/litzio/discussions/767), under [AGENTS.md](../../AGENTS.md).
- Superseded by: [ADR-0020](0020-plugin-architecture.md)·[ADR-0022](0022-plugin-screen-code.md) — 실행·화면 연결. Core 의존 방향·문서 밖 자료·얇은 CLI 경계는 유지.

## Decision

The module depends on the public `@litzio/core` API;
Core neither imports the module nor knows its source format or data. Document
meaning, validation and canonical writing remain in Core, under
[ADR-0002](0002-document-persistence-semantic-ownership.md).

외부 형식 해석과 모듈 소유 자료는 문서 의미와 분리하고 CLI는 얇게 유지한다.
플러그인 실행·화면 연결은 [ADR-0020](0020-plugin-architecture.md)·[ADR-0022](0022-plugin-screen-code.md)로 대체됐다.

## Scope and consequences

Editor engine types, DOM and CSS remain private to Editor.
Unsupported source meaning must be reported explicitly by the converter rather than silently claimed as preserved native meaning.

## App conversion connections (#797)

이 절의 결정은 [ADR-0020](0020-plugin-architecture.md)·[ADR-0022](0022-plugin-screen-code.md)로 대체됐다.
