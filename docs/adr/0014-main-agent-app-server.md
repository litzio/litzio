# ADR-0014: Main agent through Codex app-server

- Status: Accepted
- Decision date: 2026-11-02
- Last verified: 2026-11-02 (connection/settings and conversation implementation, fake stdio/Host and browser tests, one real Q&A turn with steering and read-only history resumption).
- Authority: [#931 owner decisions](https://github.com/litzio/litzio/issues/931), including the approved split into connection/settings and subsequent conversation PRs, under [ADR-0012](0012-plugin-runtime-and-ui-contributions.md).
- Partially supersedes: dedicated `CODEX_HOME` trigger 2 in [ADR-0013](0013-ai-agent-task-service.md).

## Decision

The main agent is a general assistant for opened documents and folders. Its Host
starts one `codex app-server` child lazily, initializes it once and reuses newline
JSON-RPC over stdio. The browser calls the existing same-origin Host transport;
it never starts Codex or connects to another daemon. The implementation starts
from the 10-28 spike's small transport, without a provider interface, adapter
factory, event bus, retry layer or registry. Codex 0.166.0 is the minimum version.
The owner accepts the experimental protocol risk at this concept stage. The
[official app-server protocol](https://learn.chatgpt.com/docs/app-server) and
locally generated 0.166.0 schemas were checked for the implemented RPCs.

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
changes in text only** and the official CLI/Core document write path. No guide
skill is fabricated: installed Litzio skills are listed from this cwd.
Opened folders are additional access roots for conversation execution.
The sole main-agent write-scope setting is `writeAccess`, default
`opened-folders`, with `read-only` as the other value. Each new conversation turn applies that scope through Codex's sandbox policy.
Steering retains the active turn's scope. This never changes Docling's snapshot policy.

Names and serialized settings include `provider: "codex"`; the UI renders a
provider row. Other providers and a generalized provider architecture are not
implemented. The agent owns shared model/effort defaults, selected from
`model/list` and its supported efforts. Existing feature tasks continue to use
those defaults through the unchanged worker execution path.

## Ownership and delivery boundary

The installed `ai-agent` plugin retains settings storage and UI. The existing
Host composition owns the app-server connection and its shutdown, adding concrete model, diagnostics, environment and conversation routes. There is no new plugin
contribution point or lifecycle API. Turning Codex off rejects new work, retains
existing task receipts and closes this Host's connection. Host shutdown awaits
owned process termination; a failure to establish termination is an error.

The shell owns the right docked panel, width and focus without a new plugin
contribution point. Codex owns thread content; Litzio stores only list metadata.
The panel uses short snapshot polling for summaries/tools, steering,
interruption and context usage. Model/effort defaults and response language
come from AI Settings; per-conversation overrides do not change those defaults. New-document results/undo, guide skill content, existing-document
editing, Docling integration, other providers, assistant tabs and an agent home
screen remain outside the current delivery.

CLI parity is intentionally omitted: connection, diagnostics and AI execution
are not document semantic operations. The shared Host surface is headless;
document semantics and their existing CLI/Core operations remain unchanged.

Current routes, settings and verification are defined by
[Main agent connection, settings and conversations](../design/main-agent-v1.md).
