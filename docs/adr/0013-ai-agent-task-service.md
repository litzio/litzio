# ADR-0013: AI agent plugin and Host-mediated task service

- Status: Accepted
- Decision date: 2026-11-02
- Last verified: 2026-11-02 (#880 implementation and local fake-adapter/runtime checks; documentation updated for owner acceptance and the deferred Codex-home isolation decision, without further runtime checks).
- Authority: owner approval on 2026-11-02, following the B scope in [Discussion #767](https://github.com/litzio/litzio/discussions/767), under [ADR-0012](0012-plugin-runtime-and-ui-contributions.md).
- Scope: default-included, removable AI execution plugin; no document semantic operation.

## Decision

`plugins/ai-agent` registers an AI task execution service with the Host. Feature
plugins obtain it from the Host instead of importing one another or knowing an
AI provider. Disabling the agent removes the service; ordinary editing and other
plugins keep working. Already accepted work drains independently of UI lifetime.

Each task is a serializable request/result message with a caller-created UUID,
calling plugin, task name, feature instructions, material files, small input,
result JSON Schema and opaque caller baseline. Messages do not depend on a chat
tab, a selected model or a global mutable agent. No task registry is introduced.

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

Codex and a test-only fake adapter are the initial implementations. Settings
shows adapter and availability/login status. The current Codex global-instruction
limitation and verification boundary are explicit in the
[runtime contract](../design/plugin-runtime-v1.md#ai-task-service-880).

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
2. A resident main agent is introduced.
3. Global instructions cause an actual result-interference problem in the owner's
   environment.

## Not decided or implemented

Conversation UI, user instructions, provider/credential selection, other
providers, document-edit proposals, task registration, streaming, automatic
retry, MCP/ACP/A2A, multi-agent features, Docling review and official plugin
distribution remain outside B. CLI parity is intentionally omitted: AI execution
is not a document semantic operation. Headless execution uses the shared Host
HTTP surface.
