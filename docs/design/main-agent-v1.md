# Main agent connection and settings

- Status: Implemented
- Last verified: 2026-11-02 (#931 connection/settings: fake stdio process and Host tests, targeted browser scenario, one real Codex response).
- Scope: main-agent connection and Settings only. No conversation panel or thread HTTP API is implemented here.
- Authority: [ADR-0014](../adr/0014-main-agent-app-server.md), [#931](https://github.com/litzio/litzio/issues/931) owner decisions and approved v3.1 settings mockup.

## Connection and environment

The existing Host composition owns a lazy `CodexAppServer`. It resolves Codex
from PATH, checks version >= 0.166.0, spawns one stdio child, sends `initialize`
then `initialized`, and matches newline JSON-RPC responses by ID. Concurrent
requests share initialization. UTF-8 chunks may split characters. Provider
errors, malformed messages, process exit and request deadlines reject pending
work; no request is replayed automatically. A later explicit request can
initialize after a failed launch or an exited process. Malformed protocol output
closes the connection; that Host must restart before reconnecting.

The user's environment, including any existing `CODEX_HOME`, is inherited.
No credential/configuration file is copied or written. The cwd is the branded
OS user-data directory plus `assistant`; Linux uses XDG data home and macOS uses
Application Support. `LITZIO_AI_AGENT_CWD` explicitly overrides this directory
for local integration/testing. Litzio regenerates its product-owned `AGENTS.md`
there and lists folders containing `.agents/skills/<name>/SKILL.md`. The file
instructs the agent to leave existing documents intact and propose edits in text.
No usage-guide skill is installed in this PR.

Closing the owning Host ends stdin, waits for exit and terminates the exact
owned process tree if needed. Shutdown failure is surfaced. The connection is
not a daemon or a shared controller across Hosts.

## Settings and read routes

The `ai-agent` plugin's existing settings file stores:

```json
{
  "provider": "codex",
  "enabled": true,
  "model": "gpt-6.1-sol",
  "reasoningEffort": "medium",
  "writeAccess": "opened-folders"
}
```

`GET/PUT /api/ai-agent-settings` retains the existing atomic sibling-write/rename.
Changed model/effort pairs must occur in the current `model/list` response; no
hard-coded effort list or model fallback is used. Save failures retain the UI
draft. The persisted model may be shown as unavailable until a valid catalog
selection is saved. Turning the provider off/on does not require a catalog read
when the model/effort are unchanged. Off refuses new feature tasks and model or
diagnostic queries, while retained UUID receipts stay readable/replayable and
running tasks retain their existing cancellation path. This Host's app-server
closes when its settings request disables Codex; ordinary editing is unaffected.

`writeAccess` is the single main-agent write-scope value (`opened-folders` or
`read-only`). This phase stores it but exposes no thread execution endpoint.
The conversation implementation will apply it to opened-folder access; it does
not grant file access through these metadata routes or alter the Docling policy.

| Route | Response |
| --- | --- |
| `GET /api/ai-agent-models` | `{ provider, models, updatedAt }`; paginated `model/list`, visible models and supported reasoning efforts. |
| `GET /api/ai-agent-diagnostics` | Codex executable/version, app-server initialization, `account/read`, `account/rateLimits/read`, paginated `mcpServerStatus/list`, check time and individual errors. |
| `GET /api/ai-agent-environment` | `{ cwd, instructions, skills }`; Litzio-owned environment, without starting app-server. |

These concrete Host reads require the installed AI plugin to be enabled. They
use the existing route/JSON transport and add no plugin contribution/lifecycle
API. Diagnostics keep partial successes: an account/rate-limit/MCP error is not
presented as a successful probe. Unknown MCP runtime status is not inferred from
authentication status. Model discovery and a connected process do not prove
that an account can execute every returned model. No login/token mutation route
or arbitrary JSON-RPC proxy is exposed.

Existing Docling AI tasks still use `exec`, snapshots, original permissions,
receipts and cancellation. Only `{ model, reasoningEffort }` from the shared
defaults enters their worker request. Provider settings do not change a previously
admitted task or its UUID identity. See [AI task service](plugin-runtime-v1.md#ai-task-service-880).

## Settings UI

The v3.1 flow is a Codex row with status dot/summary, diagnostics and enable
switch; the row opens a searchable model dialog with supported efforts, default
marker, update time and refresh. Diagnostics is a separate subview with return
navigation. Defaults are provider, model and that model's supported effort.
The common environment shows cwd, `AGENTS.md` and actual Litzio skills.

The existing Settings content/control widths, colors, type and shared modal
focus behavior are reused. Model results have a bounded scroll area. Both
English Light at 1440px and Korean Dark at 640px retain visible controls and
no horizontal overflow. Relative to the static mockup, the existing product
Settings shell supplies navigation, and #930's explicit Save remains. Mockup
example error rows, future providers, disabled model-add decoration and guide
skill examples are not presented as functioning features.

Contribution labels/descriptions are untranslated keys, translated by the shell
at render time. Plugin view strings use `host.text` during render. Starting in
Korean then selecting English no longer freezes the AI menu or description in
Korean; Docling uses the same metadata convention.

## Verification and remaining scope

`ai-agent-connection.test.ts` runs a fake Node child speaking newline JSON-RPC:
one process/initialization, UTF-8 splits, notifications, catalog pagination,
partial diagnostics, errors/timeouts/process loss and confirmed shutdown.
`ai-task.test.ts` checks real Host routes with that child, shared defaults reaching
the old worker, persistent settings and preserved receipts across changes/off.
The `ai-agent` browser scenario mocks metadata/settings responses, checks
language-switch regression, model filtering/efforts, refresh, diagnostics,
provider toggle, re-entry, 640px layout and ordinary document preservation.
Browser mocks do not prove account readiness or Host persistence.

Representative captures from that same local browser run (four PNGs, about
289 KiB total; traces, generated protocol files and raw account data are not
committed):

| View | Capture |
| --- | --- |
| Settings, 1440px English Light | [Image](assets/ai-connection-931/ai-1440-light-en.png) |
| Models, 1440px English Light | [Image](assets/ai-connection-931/models-1440-light-en.png) |
| Settings, 640px Korean Dark | [Image](assets/ai-connection-931/ai-640-dark-ko.png) |
| Diagnostics, 640px Korean Dark | [Image](assets/ai-connection-931/diagnostics-640-dark-ko.png) |

Reproduce with `pnpm browser:test ai-agent --screenshots` against the local Host.
The earlier settings surface is recorded in [#930's capture](assets/ai-settings-930/after-ai-1440-light-en.png).

One real Codex 0.166.0 check used `gpt-6.1-sol` / `medium`, the user's existing
login and the generated cwd instructions. It returned `Litzio 연결 확인 완료`
in 12,643 ms, with eight discovered models and no diagnostic errors. Its owned
app-server closed afterward. This is connection evidence, not folder-Q&A or
document-writing verification. No second model call is needed for this PR.

The right panel, opened-document context, thread metadata/history/resume,
steering/interruption and context ring are assigned to PR 2 after this PR merges.
No panel hook, thread store or conversation API is prebuilt here. AI execution
is not a semantic document operation, so there is no new CLI command.
