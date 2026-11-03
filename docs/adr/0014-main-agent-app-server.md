# ADR-0014: Main agent through Host-owned CLI connections

- Status: Accepted
- Decision date: 2026-11-02
- Minimum-version verification: 2026-11-03 ([#967](https://github.com/litzio/litzio/issues/967); connection, catalog and settings only, limitations below).
- Copilot verification: 2026-11-03 (#1053; fake ACP/permission checks only, no real Copilot session or model call).
- Last verified: 2026-11-03 (#952 / #1047 PR A/B, user-message language versus task-only fallback; fake Host/worker/browser checks, no real model turn).
- Previous verification: 2026-11-02 (connection/settings and conversation implementation, fake stdio/Host and browser tests, one real Q&A turn with steering and read-only history resumption).
- Authority: [#931 owner decisions](https://github.com/litzio/litzio/issues/931), including the approved split into connection/settings and subsequent conversation PRs, under [ADR-0012](0012-plugin-runtime-and-ui-contributions.md).
- Partially supersedes: dedicated `CODEX_HOME` trigger 2 in [ADR-0013](0013-ai-agent-task-service.md).

## Decision

The main agent is a general assistant for opened documents and folders. Its Host
starts one `codex app-server` child lazily, initializes it once and reuses newline
JSON-RPC over stdio. The browser calls the existing same-origin Host transport;
it never starts Codex or connects to another daemon. The implementation starts
from the 10-28 spike's small transport, without a provider interface, adapter
factory, event bus, retry layer or registry. Codex 0.141.0 is the minimum version (#967 owner decision, 2026-11-03).
The floor is the first version with every app-server contract Litzio uses,
including the current `{type: "function", name, description, inputSchema}`
dynamic-tool registration format. Raise it only when a required contract changes.
The owner accepts the experimental protocol risk at this concept stage. The
[official app-server protocol](https://learn.chatgpt.com/docs/app-server) and
locally generated 0.166.0 schemas were originally checked for the implemented RPCs.

The 2026-11-03 Codex 0.141.0 check confirmed connection, model listing and
settings save with `gpt-5.5` / `low`. Its catalog omitted `gpt-6.1-sol`; the
ChatGPT account rejected the listed `gpt-5.5` with `model_not_found`. Successful
conversation execution, document tools, steering and continuation could therefore
not be verified on 0.141.0. The actual full-flow verification version remains
0.166.0. An older Codex may offer no model usable by the account; the owner
accepts this limitation and defers handling until it causes a real user problem.

Codex uses the user's existing login, configuration, instructions and sessions.
Litzio does not create or override `CODEX_HOME`, and does not apply the task
adapter's `--ignore-user-config`, `--ignore-rules` or `--ephemeral` isolation flags.
A separate home would break the intended continuity with ordinary Codex use and
require a second login. Introducing a resident agent therefore no longer triggers
ADR-0013 condition 2. This does not change the existing isolated Docling `exec`
task service or decide its other deferred isolation conditions.

The child cwd is `assistant` below the brand-configured user-data directory
(`%APPDATA%/<brand.folders.desktopData>/assistant` on Windows). Litzio owns an
`AGENTS.md` there, including **existing documents must not be edited; propose
changes in text only** and the official CLI/Core document write path. The product also owns `.agents/skills/litzio-guide/SKILL.md` with usage and terminal CLI guidance; local Litzio skills are listed from this cwd.
The assistant's `/` picker lists enabled skills from Codex `skills/list` for
this cwd alone, using the 0.141.0 `cwds` and `forceReload` parameters. Selection
sends explicit skill inputs alongside `$name` text; context JSON references
preserve skill name/path for history chips. RPC and loader errors are visible.
This adds no Litzio command palette or global skill/configuration writes.
Opened folders are additional access roots for conversation execution.
The sole main-agent write-scope setting is `writeAccess`, default
`opened-folders`, with `read-only` as the other value. Each new conversation turn applies that scope through Codex's sandbox policy.
Steering retains the active turn's scope. This never changes Docling's snapshot policy.

The #1053 owner decision (2026-11-03) adds `provider: "copilot"` beside
`codex` in the existing provider row. Host starts `copilot --acp` over stdio,
using the official ACP TypeScript SDK as Paseo does. Concrete Codex and Copilot
branches are sufficient; no provider registry, plugin API or adapter framework
is introduced. Codex model/effort defaults come from `model/list` and its
supported efforts. Existing feature tasks retain those Codex defaults through
the unchanged worker execution path when the assistant uses an ACP catalog model.

## Ownership and delivery boundary

The installed `ai-agent` plugin retains settings storage and UI. The existing
Host composition owns the app-server connection and its shutdown, adding concrete model, diagnostics, environment and conversation routes. There is no new plugin
contribution point or lifecycle API. Turning Codex off rejects new work, retains
existing task receipts and closes this Host's connection. Host shutdown awaits
owned process termination; a failure to establish termination is an error.

The shell owns the right docked panel, width and focus without a new plugin
contribution point. Codex owns thread content; Litzio stores only list metadata.
The panel uses short snapshot polling for summaries/tools, steering,
interruption and context usage. Model/effort defaults come from AI Settings;
per-conversation overrides do not change those defaults. Conversations follow the
user message language; document writing follows the target document language
unless explicitly requested otherwise. AI default language is used only for tasks
started without a conversation; no conversation-language selector is exposed. Existing-document editing, Docling integration, further providers, assistant tabs and an agent home
screen remain outside the current delivery.

CLI parity is intentionally omitted: connection, diagnostics and AI execution
are not document semantic operations. The shared Host surface is headless;
document semantics and their existing CLI/Core operations remain unchanged.

Current routes, settings and verification are defined by
[Main agent connection, settings and conversations](../design/main-agent-v1.md).


## Document tool decision (2026-11-02)

The owner's implementation-2 decision uses Codex dynamic tools for
`create_document`, `read_document` and `list_documents`. Host directly handles
`item/tool/call` on the same stdio connection; shell execution is unnecessary.
One small provider-neutral Host module validates inputs and calls existing Core
operations/read/list paths. No registry framework, MCP server or provider
abstraction is introduced. Host enforces captured turn write permission, opened
folders, operator Roots, real-path boundaries and exclusive new-file creation.
Steering keeps the running scope. Structured result content stays in Codex history
and is preserved by the Host snapshot, including creation path and revision.

The 0.166.0 resume type cannot register tools. A real fresh-process resume retained
both the original tool specifications and creation receipt, and a subsequent read
call succeeded. Threads originally started without tools require a new conversation;
Litzio does not claim retroactive registration. Terminal CLI resumption has no
Litzio tool handler: the owner's chosen alternative is usage guidance via a skill
(delivered with result cards/undo in implementation 2, PR 2). AI execution adds no semantic operation,
so separate CLI parity is omitted. Exact inputs, permissions and verification are
in the [implemented contract](../design/main-agent-v1.md#document-tools-931-implementation-2-pr-1).

## Copilot addition (#1053, 2026-11-03)

The owner authorizes Copilot for assistant conversations only. Models come from
ACP `session/new`; turns use `session/prompt`, streaming `session/update` and
`session/cancel`. Session history is provider-owned and reloaded only when
`loadSession` is advertised. Litzio keeps provider-tagged list metadata.
Codex feature tasks retain their saved model/effort defaults while Copilot is
selected. No Copilot model call was made during implementation.

Copilot has no Codex sandbox-policy equivalent. Host answers ACP permissions
with `allow_once` only for read/edit requests with absolute locations in the
captured opened folders and operator Roots; edits also require `opened-folders`.
Everything else is cancelled. CLI denies shell tools and disables built-in
MCP servers. This is permission mediation, not an OS filesystem/network sandbox:
Copilot's inherited settings, preauthorized tools and native execution remain
provider-controlled. The existing-document AGENTS.md rule remains an instruction.
Reasoning effort, Codex skills, account/usage diagnostics, live steering,
context usage and Litzio dynamic document tools are not emulated for Copilot.
See the [implemented Copilot contract](../design/main-agent-v1.md#copilot-conversations-1053)
for these differences and manual verification.
