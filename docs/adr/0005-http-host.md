# ADR-0005: Standalone HTTP Host

- Status: Accepted
- Amended by: [ADR-0016](0016-shared-local-daemon-host.md) — 공유 로컬 HTTP daemon의 연결·Root·수명.
- Last verified: 2026-11-16 — 현재 계약·코드와 삭제된 기능의 잔재를 정적으로 대조했다. 제품·브라우저·Desktop·AI 실행 재검증 없음.
- Authority: architectural decision under [AGENTS.md](../../AGENTS.md). Related: [ADR-0002](0002-document-persistence-semantic-ownership.md), [ADR-0004](0004-desktop-host-distribution.md), [HTTP Host contract](../design/http-host-v1.md).
- Decision date: 2026-10-13

## Context

[#186](https://github.com/litzio/litzio/issues/186) requires a production Editor served from a workstation or Linux server, without Vite or Electron, and selection among separate operator-approved document folders. The existing local file handlers have no server-wide root allowlist. Desktop's custom protocol remains appropriate for the installed Windows app.

## Decision

- Add a thin CLI `daemon run` entry to a Node HTTP transport in `apps/editor/server` (official command `litzio daemon run` under [#1139](https://github.com/litzio/litzio/issues/1139); product names follow the [brand configuration](../guides/branding.md)). Reuse the document/asset handlers, Core semantics and File commit. Extract the existing production static-file helper for Desktop and HTTP. No new backend package or web framework.
- Root 필수 결정은 [ADR-0016](0016-shared-local-daemon-host.md)의 선택 Root로 대체됐다.
- A root grants file access; it is not the selected sidebar folder or a Workspace. Open Folder chooses one allowed root or descendant at a time; since [ADR-0009](0009-multiple-opened-folders.md) the sidebar may keep several such folders open, each still checked against the roots. HTTP starts without a document and exposes only allowed starting places and breadcrumbs.
- Bind to loopback by default. Enforce Host/Origin checks, bounded request bodies and timeouts. Remote access belongs behind operator-controlled authentication or a trusted private network; the application does not implement accounts or authentication. A configured public origin never comes from forwarded request headers.
- Ship a relocatable Node CLI bundle and production Editor in a local npm tarball. Runtime needs supported Node.js, without a source checkout, pnpm, tsx, Vite or Electron. CI artifacts are not a public registry release.

## Consequences

Three transports reuse the same stateless file handlers. HTTP file state is startup configuration and an asset-receipt signing key; documents remain plain-text files. Core gains no HTTP, filesystem or editor-engine types. This adds a Host launch command, not a document semantic operation.

Root validation does not create an OS sandbox against a hostile filesystem administrator. File commit's existing check/use race boundary remains. Protect all proxy routes, including HTML, static assets, API and media, and restrict direct upstream access. Exact limits, deployment settings and supported platforms are in the [HTTP contract](../design/http-host-v1.md).

## Non-decisions

Accounts, multi-user collaboration, autosave, document databases, Git/PR/tag switching, dynamic root management, Docker images and NAS-specific installers are outside this decision. Desktop distribution and updates remain governed by ADR-0004.
