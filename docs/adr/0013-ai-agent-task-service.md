# ADR-0013: AI agent plugin and Host-mediated task service

- Status: Accepted
- Decision date: 2026-11-02
- Last verified: 2026-11-02 (#880 implementation and local fake-adapter/runtime checks; documentation updated for owner acceptance and the deferred Codex-home isolation decision, without further runtime checks).
- CLI policy clarification: 2026-11-04 — documentation-only alignment with [ADR-0015](0015-shared-host-operations.md); no runtime change.
- Authority: owner approval on 2026-11-02, following the B scope in [Discussion #767](https://github.com/litzio/litzio/discussions/767), under [ADR-0012](0012-plugin-runtime-and-ui-contributions.md).
- Scope: default-included, removable AI execution plugin; no document semantic operation.

## Amendment (2026-11-04, #1150)

[ADR-0017](0017-bundled-client-and-official-ai.md)은 기본 포함·제거 가능한 AI 플러그인 결정을 항상 존재하는 daemon 공식 기능으로 대체한다. AI 켜기/끄기 설정은 없고 프로바이더 가용성으로 신규 대화·aiTasks 요청을 판단한다. 가용 프로바이더가 없으면 이유를 알리며 신규 요청을 거부하고 진행 작업에는 영향을 주지 않는다. 먼저 AI가 플러그인 경로 없이 동작하도록 이전한 뒤 플러그인 시스템·Docling과 관련 코드·테스트·문서를 삭제하며 직전 master는 원격 보관 브랜치에 남긴다. aiTasks 구현을 지금 유지할 필요는 없지만 Host 중개 메시지, caller별 조회·취소·활성 검사, ID/caller/task/baseline receipt와 uncertain/no-replay는 소유자 개시 후 컨셉 재개발 때 복원할 계약으로 기록한다. 아래는 전환 전 기록이며 실제 구현·문서 제거는 구현 PR에서 한다.

## Decision

`plugins/ai-agent` registers an AI task execution service with the Host. Feature
plugins obtain it from the Host instead of importing one another or knowing an
AI provider. Disabling the agent removes the service; ordinary editing and other
plugins keep working. Already accepted work drains independently of UI lifetime.

Each task is a serializable request/result message with a caller-created UUID,
calling plugin, task name, feature instructions, material files, small input,
result JSON Schema and opaque caller baseline. Messages do not depend on a chat
tab or a global mutable agent. The AI agent alone selects execution settings; feature messages never select a model. No task registry is introduced.

The agent combines common instructions before feature instructions and validates
only the result's JSON shape. The caller owns content validation and rejecting
stale results. Provider failure, timeout, cancellation, format violation and
uncertain outcomes stay distinct. Only complete, validated results from an
exited worker become visible. Existing request receipts, ownership locks and
UUID deduplication apply; there is no automatic replay or retry.

The adapter runs in a per-request OS temporary snapshot containing only requested
files. Tool commands can read/search the snapshot, with writes and network
disabled. Required OS/tool runtime paths remain readable. Schema and answer files
live in a separate control folder. Permission settings belong to the adapter;
this does not decide future broader access. Normal completion/failure/cancellation
cleans both folders; the next Host initialization cleans exact recorded
dead-owner leftovers without replaying work.

Codex and a test-only fake adapter are the initial implementations. Owner decision
#930 added shared model/effort defaults for all AI tasks (`gpt-6.1-sol`, `medium`).
#931 replaces the initial free input with the discovered model/effort list and
provider diagnostics under [ADR-0014](0014-main-agent-app-server.md). Values use
the existing plugin settings file and are snapshotted at admission. Each receipt
records execution settings, start/end timestamps, duration, status and failure;
results remain serializable for future conversation UI. An uncertain owner-loss
end timestamp records observation, not a confirmed provider exit. The current Codex global-instruction
limitation and verification boundary are explicit in the
[runtime contract](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/plugin-runtime-v1.md#ai-task-service-880).

## Limitations and follow-up

Codex 0.164.0 can still include personal global `~/.codex/AGENTS.md` instructions
despite the adapter's isolation flags. On 2026-11-02 the owner reported clearing
that file in their environment. Other users' personal global instructions can
still enter the context; clearing one environment does not remove this
structural limitation.

The owner deferred a dedicated Codex home: set `CODEX_HOME` to a dedicated folder
under Litzio's brand-configured user-data directory, requiring an initial login
there. Introduce it when the first of these conditions occurs:

1. Someone other than the owner uses Litzio with AI features, and no later than
   a public distribution that includes the AI agent.
2. **Superseded by [ADR-0014](0014-main-agent-app-server.md):** introducing a resident
   main agent does not create a dedicated home. It reuses the user's existing
   Codex environment, with a separate Litzio cwd, to preserve ordinary Codex use
   and avoid a second login. The existing task service is unchanged.
3. Global instructions cause an actual result-interference problem in the owner's
   environment.

## Not decided or implemented

The connection/settings portion of the main agent is now covered by
[ADR-0014](0014-main-agent-app-server.md) and its
[implemented contract](../design/main-agent-v1.md). Model free input from #930
is replaced by the discovered model/effort list; feature tasks retain the
same shared defaults and execution path.

Conversation UI, user instructions, provider/credential selection, other
providers, document-edit proposals, task registration, streaming, automatic
retry, MCP/ACP/A2A, multi-agent features and official plugin
distribution remain outside B. B intentionally shipped without a CLI surface;
headless execution uses the shared Host HTTP surface. This records the delivered
scope, not a standing exemption for non-semantic features. Since 2026-11-04,
[ADR-0015](0015-shared-host-operations.md) requires a shared Host operation and
CLI for new user features. It does not backfill this service in the decision PR.
