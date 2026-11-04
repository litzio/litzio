# ADR-0012: Plugin runtime and UI contributions

- Status: Accepted
- Decision date: 2026-10-31
- Last verified: 2026-11-04 — #1142·ADR-0016 문서 개정 대조. runtime 검증 없음.
- Previous verification: 2026-10-31 (#853 Host worker and #857 UI manifest/assets/contributions, React compatibility, disposal/re-registration and failure-isolation verification; real Docling remains manual).
- Authority: owner approval in [Discussion #767](https://github.com/litzio/litzio/discussions/767#discussioncomment-19307920), under [AGENTS.md](../../AGENTS.md). Related: [ADR-0011](0011-code-module-boundary.md), [ADR-0004](0004-desktop-host-distribution.md), [ADR-0005](0005-http-host.md), [ADR-0007](0007-editing-session-lifetime.md), [staged Host decision #834](https://github.com/litzio/litzio/discussions/834#discussioncomment-19307667).
- Supersedes: the static/no-registration/no-dynamic-loading boundary and process-local-only conversion task state in ADR-0011; its Core, package, external-data and thin-interface boundaries remain Accepted.

This records an approved architectural direction. It does not adopt either spike
implementation. Current behavior remains described by the Implemented
[Docling conversion](../design/docling-conversion-v1.md),
[Docling comparison](../design/docling-compare-v1.md),
[Host worker plugins](../design/plugin-runtime-v1.md),
[Editor UX Shell](../design/editor-ux-shell-v1.md),
[Filesystem Host](../design/filesystem-host-boundary-v1.md) and
[HTTP Host](../design/http-host-v1.md) contracts until implementation PRs satisfy
the adoption conditions below and update the affected contracts.

## Amendment: 공유 로컬 daemon Host (2026-11-04, #1142)

[ADR-0016](0016-shared-local-daemon-host.md)은 소유자 승인에 따라 Desktop의 custom protocol·in-process Host·TCP 없음 경계를 공유 로컬 HTTP daemon으로 대체하고, 실행 중 daemon 자동 탐색·연결과 수명 정책을 결정한다. 로컬 daemon은 Root 제한 없이 사용자별 토큰 인증(Desktop Bearer·브라우저 쿠키)을 필수로 한다. 제품/프로토콜 버전 분리와 자동 교체 금지, 종료·휴지통·샘플·origin 정책 및 기간 한정 테스트 예외는 해당 ADR을 따른다. 공유 편집 세션과 원격 인증은 계속 보류한다.

이 개정은 결정이며 PR1에서 제품 동작을 바꾸지 않는다. 아래 기존 transport·Root·인증·수명 서술은 개정 전 결정과 현재 구현의 기록이다. 충돌하는 결정에는 ADR-0016이 우선하며 구현 계약은 PR2~PR4에서 실제 변경과 함께 갱신한다.

## Amendment (2026-11-04, #1139)

The [owner-approved terminology amendment](https://github.com/litzio/litzio/issues/1139) defines daemon as a shared Host process separate from the UI, without deciding its lifetime. `daemon run` starts the independent foreground HTTP Host; Desktop retains its in-process Host. At that amendment, automatic discovery/connections, lifetime management and shared editing were deferred; ADR-0016 now decides local daemon discovery/connections and lifetime. Shared editing remains deferred. See the [HTTP Host terminology](../design/http-host-v1.md#host-and-daemon-terminology-1139). This amends the earlier blanket daemon deferral; it does not introduce those deferred capabilities.

## Context

The owner wants AI agents to attach capabilities as plugins while Litzio is
running, with Docling as the first plugin. ADR-0011 established the first module's
dependency boundary, but its Host and Editor connections are static.

The [runtime spike](../reviews/docling-plugin-runtime-spike.md) exercised a
separate worker, shared user installation, request deduplication, failure
isolation and disable/drain through development Desktop and an independent
`litzio daemon run`. Its external Docling REST service was synthetic; actual server
conversion and packaged Desktop remain unverified.
The [UI spike](../reviews/docling-plugin-ui-spike.md) exercised live command/tab
contributions from installed ESM/CSS, API mismatch rejection and local UI fault
handling without a page reload. It did not move the sidebar, Settings or
conversion dialog to dynamic contributions. Both records remain Historical;
their unaccepted outlines describe the experiments' decision point.

Running plugins does not itself require connections to a shared running Host. The approved order in #834 is
the Docling plugin boundary, then AI-generated plugin installation and user
approval, then a shared local Host when client-independent task lifetime is
needed. This ADR decides only the first stage.

## Decision

### Internal protocol naming (#858)

The owner selected `litzio` as the internal code name in [Discussion #856](https://github.com/litzio/litzio/discussions/856). Workspace packages use `@litzio/*`; the shared worker/UI Host contract lives in `@litzio/plugin-api`, including the single `PLUGIN_UI` identifier table. API versions, manifest fields and generic routes/assets keep their existing values. Product labels, CLI command, Desktop transport and installed/data/plugin folders follow the separate [brand configuration](../guides/branding.md) (#859; official default Litzio). Repository references remain separately managed. This rename adds no compatibility aliases or migration.

### 1. Shared installation (original transport boundary amended by ADR-0016)

Before the ADR-0016 transition, Desktop keeps ADR-0004's in-process Host and configured Desktop origin (official default `litzio://app`) without a
TCP listener. `litzio daemon run` keeps ADR-0005's independent HTTP Host. Packaged Desktop and distributed CLI builds use a
common per-user plugin installation folder containing installed code, plugin
registration state and request records.

Under owner decision [#946](https://github.com/litzio/litzio/issues/946), source
execution (Vite, tsx CLI and unpackaged Electron) instead defaults to the
checkout-local, gitignored `.litzio-dev/` outside disposable `tmp/`. Known module
or build output locations determine the checkout, never launch cwd or Git discovery.
Plugin settings and main-agent cwd follow the same execution classification.
Environment overrides remain authoritative. The checkout's built
`packages/cli/dist/cli.mjs` is a distributed artifact and retains shared defaults.
Tests explicitly inject temporary paths. This changes defaults only, not
registration pinning or the packaged Desktop/HTTP Host sharing contract.

Plugin registration state and request records in that folder are the explicit
exception to the stateless Host scope in AGENTS.md and ADR-0005. Document file
handlers remain stateless; this exception does not introduce document/session
persistence or a general backend. Sharing installations and request records does
not provide a shared live task controller or editing session. Local running-Host discovery/connections and lifetime are now decided by ADR-0016; shared editing sessions remain deferred.

### 2. Host execution uses a separate worker and versioned boundaries

The Host runs plugin work in a separate worker process so worker failure does
not take down the Host or Editor. Worker manifest, UI manifest and their Host
API versions are separate contracts. Registration and admission validate the
applicable manifest and API compatibility; UI compatibility is checked before
loading its code. This ADR does not freeze the spikes' manifest schema or API
version numbers.

### 3. UI contributions use validated same-origin ESM/CSS and a narrow API

Each Host serves only the validated installed ESM/CSS from its own origin,
preserving its existing CSP. The Editor supplies its React instance and JSX
runtime, plus narrow reading and UI capabilities such as shared controls,
translation and shell navigation. Plugin code uses public Core read models and
the supplied reading surface. It does not directly import Editor internals,
Tiptap or ProseMirror, or acquire editor-engine state or ownership.

Loading and rendering failures are handled at the contribution boundary while
ordinary document editing retains its state. A shared renderer and a separate
worker are dependency/failure boundaries for trusted code, not an OS or UI
security sandbox.

### 4. Contributions attach and detach while the Editor runs

Commands and tab kinds connect dynamically without restarting the Host or
reloading the Editor. Disabling/unregistering rejects new work requests and
drains already accepted work. UI detachment does not silently cancel accepted
work or erase its request record.

Open contributed tabs keep their shell identity and context in an explicit
disabled state while plugin content is detached. Registration can restore the
view in the retained tab. Retaining this context is not a new document recovery
or startup-restoration guarantee under ADR-0007. Native ESM cannot be unloaded
from the current realm; detaching a view is not proof that its module memory or
all side effects have been disposed.

### 5. Request identity, recovery and publication fail closed

Request UUIDs prevent duplicate execution, including requests admitted through
different Hosts sharing the folder. Reusing an admitted UUID must not start
another execution; conflicting reuse is refused. After a restart, work whose
outcome cannot be established remains `uncertain` and is never automatically
replayed. Request records are not a persistent retry queue or resume service.

Only complete results are published. Failed or interrupted partial output stays
outside the public result. Stopping a local worker does not prove cancellation
of an external Docling server task or exactly-once completion there.

### 6. Core retains document semantics; Docling originals are preserved

Document meaning, validation and canonical writing remain Core-owned under
[ADR-0002](0002-document-persistence-semantic-ownership.md). Plugins use only
Core's public API. ADR-0011's package/dependency direction, external module data
and thin CLI boundary remain in force. Editor engine types remain in
`apps/editor` under [ADR-0001](0001-single-document-editor-architecture.md).

Docling source PDF/JSON is preserved. Corrections operate on a module-owned copy
and do not rewrite the original. This decision adds no Core semantic operation
or Core change; registration/execution interfaces remain thin module/Host
surfaces rather than another document implementation.

## Relationship to existing decisions

- **ADR-0011, partially Superseded:** replace the prohibitions on registration
  and dynamic loading in “Scope and consequences” and “App conversion
  connections”; extend process-local-only task snapshots with shared request
  records and uncertain/no-replay recovery. The original text remains as the
  static implementation's decision record; the remaining boundaries stay
  Accepted.
- **ADR-0005 and AGENTS.md, narrow extension:** allow only the common
  installation folder's plugin registration state and request records as the
  additional durable Host responsibility. Existing document Root/access rules
  continue to apply; installed validated plugin assets are served through the
  explicit plugin surface rather than arbitrary document file access.
- **ADR-0001/0002/0007 remain in force; ADR-0004 transport amended by ADR-0016:** editor-engine ownership, plain-text
  SSOT and Core writes, client-local unsaved
  editing recovery are unchanged.

## Adoption conditions

Implementation PRs must resolve and verify these conditions before claiming the
plugin boundary is adopted; the historical measurements do not satisfy them:

1. Convert through a real Docling server, preserving source PDF/JSON and
   publishing only a complete Core-valid result; synthetic REST is insufficient.
2. Verify the packaged Desktop alongside the independent `litzio daemon run` Host;
   development Electron does not establish packaged behavior.
3. Resolve lock/crash recovery and PID reuse so stale ownership cannot admit
   duplicate execution or misclassify interrupted work. Preserve `uncertain`
   and no automatic replay, and verify publication on supported platforms.
4. Define and verify React instance/JSX runtime and Host API compatibility for
   the injected UI contract, including refusal of incompatible contributions.
5. Define and verify disposal and re-registration handling for retained ESM
   module records, resource cleanup and repeated registration; native ESM
   unloading cannot be claimed. Preserve disabled-tab context and accepted-work
   lifetime through detachment.

## Host implementation progress (#853)

[Host worker plugins v1](../design/plugin-runtime-v1.md) implements the worker
manifest/API, common trusted installation, live register/unregister with drain,
UUID transactions, session-lock recovery independent of PID reuse, uncertain/no
replay and complete-result Host visibility. Synthetic shared Host tests include
Desktop protocol registration and execution by an independent HTTP process.
Required CI includes offline CLI and packaged Desktop worker smoke tests.
Original PDF/JSON and Core semantics remain unchanged. This code was written
anew; neither historical spike is adopted.

Condition 3 is implemented and automatically verified with SQLite crash rollback,
OS lock release, identical-live-PID owner replacement and exclusive marked output
publication on supported CI platforms. Publication means atomic Host visibility;
direct filesystem tools can observe a reserved directory during copying. Crash
leftovers remain private. See the contract for the check/use boundary.
Condition 1 remains a [manual real-service check](../test/README.md#docling-worker-runtime-853).
Condition 2 is covered by required Windows packaged CI, not a local packaging run.
Conditions 4 and 5, UI manifests/contributions, conversion-dialog migration, AI
installation/approval, OS sandbox and shared editing sessions remain outside #853. Local running-Host discovery/connections and lifetime are subsequently decided by ADR-0016, not implemented by #853. The full UI
plugin boundary is not claimed as adopted by this Host-only implementation.

## UI implementation progress (#857)

[Plugin UI contributions v1](../design/plugin-ui-v1.md) implements conditions 4
and 5. A brand-independent API 1/React 19 manifest is checked at registration and
before asset loading. A lexical ESM factory binds React/JSX imports to the exact
renderer instances supplied by the Host; no second React copy or global bridge
is introduced. Same-origin, hash-checked assets retain existing CSP on Desktop
and HTTP Host. Command Center, tab kinds and expanded-sidebar actions attach live.
Docling reuses its #815 reading/matching view through this boundary.

Detachment unmounts views before disposal/style removal and preserves disabled
tab identity and snapshot. Independent activation generations reject late loads
and detached calls. Re-registering identical content reuses the ESM URL but
creates a fresh activation; distinct revisions remain in the realm until window
close. ESM memory unloading is explicitly not claimed. Tests cover compatibility
refusal, late loading, disposer/style lifetime, render/evaluation failure and
ordinary document identity/unsaved input. Required packaged Desktop CI exercises
actual UI loading and re-registration alongside the shared Desktop/HTTP tests.

Conditions 4/5 are resolved for this trusted UI contract, while real-service
condition 1 remains manual. #869 subsequently migrates the conversion dialog, Docling settings and Host facade
into the independently built `plugins/docling` folder through the same contribution
boundary and a thin installed Host-operation entry. Settings plugin management and
official plugin install/update/removal remain subsequent work.
The AI agent framework will be a default-included provider-neutral plugin, and
Docling remains bundled until its official installation flow is available, per
the later decisions in Discussion #767. The AI plugin and official installer are
not implemented in #857.

## Non-decisions

- AI-generated plugin installation, user approval and automatic download flows.
- OS sandbox implementation. Initially only trusted local code is allowed;
  untrusted code is not allowed before OS sandbox validation.
- Shared editing sessions remain deferred. Local running-Host discovery/connections and lifetime management are now decided by [ADR-0016](0016-shared-local-daemon-host.md), with implementation in PR2~PR4 of #1142.
- Remote plugin deployment, a marketplace or Core changes.

## Consequences

This is the basis for runtime plugin attachment, with Docling proving the first
boundary. It does not authorize a general platform layer or migration of all
existing UI surfaces. Follow-up PRs implement the approved boundary and adoption
conditions, updating current design contracts with their actual behavior and
verification. Plugin installation and request history must remain separate from
native documents and unsaved editing recovery.
