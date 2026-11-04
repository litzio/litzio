# ADR-0005: Standalone HTTP Host

- Status: Accepted
- Last verified: 2026-11-04 — #1142·ADR-0016 문서 개정 대조. runtime 검증 없음.
- Previous verification: 2026-10-31 (documentation-only ADR-0012 exception for plugin registration state and request records; no new runtime verification).
- Previous verification: 2026-10-13 (Node-only package, shared Host and real browser Save/Reload verification; Windows/Linux CI required).
- Authority: architectural decision under [AGENTS.md](../../AGENTS.md). Related: [ADR-0002](0002-document-persistence-semantic-ownership.md), [ADR-0004](0004-desktop-host-distribution.md), [HTTP Host contract](../design/http-host-v1.md).
- Decision date: 2026-10-13

## Amendment: 공유 로컬 daemon Host (2026-11-04, #1142)

[ADR-0016](0016-shared-local-daemon-host.md)은 소유자 승인에 따라 Desktop의 custom protocol·in-process Host·TCP 없음 경계를 공유 로컬 HTTP daemon으로 대체하고, 실행 중 daemon 자동 탐색·연결과 수명 정책을 결정한다. 로컬 daemon은 Root 제한 없이 사용자별 토큰 인증(Desktop Bearer·브라우저 쿠키)을 필수로 한다. 제품/프로토콜 버전 분리와 자동 교체 금지, 종료·휴지통·샘플·origin 정책 및 기간 한정 테스트 예외는 해당 ADR을 따른다. 2026-11-04의 ADR-0016 ③ 추가 승인에 따라 수동 원격 daemon도 동일한 토큰 링크·쿠키 인증을 사용할 수 있다. 공유 편집 세션과 원격용 HTTPS·계정 체계는 계속 보류한다.

이 개정은 결정이며 PR1에서 제품 동작을 바꾸지 않는다. 아래 기존 transport·Root·인증·수명 서술은 개정 전 결정과 현재 구현의 기록이다. 충돌하는 결정에는 ADR-0016이 우선하며 구현 계약은 PR2~PR4에서 실제 변경과 함께 갱신한다.

## Context

[#186](https://github.com/litzio/litzio/issues/186) requires a production Editor served from a workstation or Linux server, without Vite or Electron, and selection among separate operator-approved document folders. The existing local file handlers have no server-wide root allowlist. Desktop's custom protocol remains appropriate for the installed Windows app.

## Decision

- Add a thin CLI `daemon run` entry to a Node HTTP transport in `apps/editor/server` (official command `litzio daemon run` under [#1139](https://github.com/litzio/litzio/issues/1139); product names follow the [brand configuration](../guides/branding.md)). Reuse the document/asset handlers, Core semantics and File commit. Extract the existing production static-file helper for Desktop and HTTP. No new backend package or web framework.
- Require one or more existing `--root` directories at startup. Apply the fixed allowlist in the shared file operations, checking both normalized paths and real filesystem targets. HTTP cannot fall back to unrestricted access. Vite and Desktop explicitly select their existing local policy.
- A root grants file access; it is not the selected sidebar folder or a Workspace. Open Folder chooses one allowed root or descendant at a time; since [ADR-0009](0009-multiple-opened-folders.md) the sidebar may keep several such folders open, each still checked against the roots. HTTP starts without a document and exposes only allowed starting places and breadcrumbs.
- Bind to loopback by default. Enforce Host/Origin checks, bounded request bodies and timeouts. Remote access belongs behind operator-controlled authentication or a trusted private network; the application does not implement accounts or authentication. A configured public origin never comes from forwarded request headers.
- Ship a relocatable Node CLI bundle and production Editor in a local npm tarball. Runtime needs supported Node.js, without a source checkout, pnpm, tsx, Vite or Electron. CI artifacts are not a public registry release.

## Consequences

Three transports reuse the same stateless file handlers. HTTP file state is startup configuration and an asset-receipt signing key; documents remain plain-text files. [ADR-0011](0011-code-module-boundary.md#app-conversion-connections-797) adds the explicitly scoped Docling device setting and one transient module task (#797); this is not document persistence or a job backend. [ADR-0012](0012-plugin-runtime-and-ui-contributions.md) additionally permits only plugin registration state and request records in the common installation folder as an exception to this stateless Host scope. Core gains no HTTP, filesystem or editor-engine types. This adds a Host launch command, not a document semantic operation.

Root validation does not create an OS sandbox against a hostile filesystem administrator. File commit's existing check/use race boundary remains. Protect all proxy routes, including HTML, static assets, API and media, and restrict direct upstream access. Exact limits, deployment settings and supported platforms are in the [HTTP contract](../design/http-host-v1.md).

## Non-decisions

Accounts, multi-user collaboration, autosave, document databases, Git/PR/tag switching, dynamic root management, Docker images and NAS-specific installers are outside this decision. Desktop distribution and updates remain governed by ADR-0004.
