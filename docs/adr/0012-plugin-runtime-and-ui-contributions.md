# ADR-0012: Plugin runtime and UI contributions

- Status: Accepted
- Amended by: [ADR-0020](0020-plugin-architecture.md)·[ADR-0022](0022-plugin-screen-code.md) — 실행·화면 기여. Core 의미·공식 쓰기 경계는 유지.
- Amended by: [ADR-0016](0016-shared-local-daemon-host.md) — 공유 로컬 HTTP daemon의 연결·Root·수명.
- Decision date: 2026-10-31
- Last verified: 2026-11-16 — 현재 계약·코드와 삭제된 기능의 잔재를 정적으로 대조했다. 제품·브라우저·Desktop·AI 실행 재검증 없음.
- Authority: owner approval in [Discussion #767](https://github.com/litzio/litzio/discussions/767#discussioncomment-19307920), under [AGENTS.md](../../AGENTS.md). Related: [ADR-0011](0011-code-module-boundary.md), [ADR-0004](0004-desktop-host-distribution.md), [ADR-0005](0005-http-host.md), [ADR-0007](0007-editing-session-lifetime.md), [staged Host decision #834](https://github.com/litzio/litzio/discussions/834#discussioncomment-19307667).
- Supersedes: the static/no-registration/no-dynamic-loading boundary and process-local-only conversion task state in ADR-0011; its Core, package, external-data and thin-interface boundaries remain Accepted.

현재 실행·제작은 [실행 계약](../design/plugin-stage1-v1.md), 화면은 [화면 코드 계약](../design/plugin-screens-v1.md)을 따른다.

## Decision

Document meaning, validation and canonical writing remain Core-owned under
[ADR-0002](0002-document-persistence-semantic-ownership.md). Plugins use only
Core's public API. ADR-0011's package/dependency direction, external module data
and thin CLI boundary remain in force. Editor engine types remain in
`apps/editor` under [ADR-0001](0001-single-document-editor-architecture.md).

그 밖의 실행·화면 기여 결정은 [ADR-0020](0020-plugin-architecture.md)·[ADR-0022](0022-plugin-screen-code.md)로 대체됐다.
