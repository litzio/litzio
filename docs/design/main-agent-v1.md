# Main agent connection, settings and conversations

- Status: Implemented
- Last verified: 2026-11-02 (#931 PR 2: fake stdio/Host tests, the `ai-agent` browser scenario, one real folder/document Q&A with steering and a separate history read).
- Scope: main-agent connection, Settings, shell-owned assistant panel and Codex conversations. New-document results/undo and the usage-guide skill remain subsequent work.
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
  "writeAccess": "opened-folders",
  "responseLanguage": "ko"
}
```

`GET/PUT /api/ai-agent-settings` retains the existing atomic sibling-write/rename.
Changed model/effort pairs must occur in the current `model/list` response; no
hard-coded effort list or model fallback is used. Save failures retain the UI
draft. The persisted model may be shown as unavailable until a valid catalog
selection is saved. Turning the provider off/on does not require a catalog read
when the model/effort are unchanged. The switch writes only enablement against
the last stored settings; unsaved model/effort drafts remain in the form until
explicit Save. A disconnected catalog therefore does not prevent switching off.
The model dialog's default marker reflects the stored model. Off refuses new
feature tasks and model or
diagnostic queries, while retained UUID receipts stay readable/replayable and
running tasks retain their existing cancellation path. This Host's app-server
closes when its settings request disables Codex or `DELETE /api/worker-plugins`
unregisters `ai-agent`. The Host awaits process exit before acknowledging that
unregistration; accepted exec work retains its drain/cancellation path.
Ordinary editing is unaffected.

`writeAccess` is the single main-agent write-scope value (`opened-folders` or
`read-only`). Each new turn supplies the current opened-folder paths as
`workspaceWrite.writableRoots`, or uses `readOnly`. Host path checks run before
passing folder/document context to Codex. The dedicated cwd remains Codex's
workspace; OS temporary write exceptions and network access are disabled in
this turn policy. Approval policy is `never`; unsupported client requests are
rejected, rather than opening an unimplemented approval dialog. User Codex
configuration, MCP servers and login remain inherited. The existing-document
rule is an agent instruction, not a new document-edit enforcement system.
Steering retains the running turn's scope; new folder/settings choices apply to
the next turn. Docling's separate execution policy is unchanged.

Response language choices are Korean, English, Japanese and Follow document
language. Until explicitly saved, the initial choice uses the current Litzio
display language (Korean or English). Explicit Save persists it with the other
AI settings; provider enablement does not silently save a language draft.
Each new conversation starts from these defaults. Composer changes affect only
that conversation and travel with its next message. Its last sent language is
recovered from Codex history; no extra Litzio transcript is stored.

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
navigation. Defaults are provider, model, that model's supported effort and response language.
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
The Host test starts the fake app-server before unregistering through HTTP and
asserts process exit while accepted exec work remains running and cancellable.
It also disables Codex with its catalog connection already closed.
The `ai-agent` browser scenario mocks metadata/settings responses, checks
language-switch regression, model filtering/efforts, refresh, diagnostics,
provider toggle payloads with unsaved model/effort drafts and a disconnected
catalog, explicit Save, re-entry, 640px layout and ordinary document preservation.
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
document-writing verification; it is the earlier connection/settings evidence.

## Assistant panel and conversations (#931 PR 2)

The shell owns the right panel, its width and focus. The title-strip Assistant
button, command center and `Ctrl+Shift+Y` (`Cmd+Shift+Y` on macOS) open it.
IME composing/Process/229 events do not open the panel. The search remains
centered in the title strip with space reserved for the Assistant button; in a
narrow native-caption region the button keeps its accessible name and shows
only its icon. `Ctrl+Shift+A` is deliberately avoided because Chrome owns it. The assistant
and Outline share the right-side space: opening Outline replaces the assistant;
closing the assistant restores the prior Outline choice. The assistant starts
at `--layout-assistant-width` (392px) and can be resized from 340 to 560px by
pointer or the focused separator's arrow keys. An explicit width is remembered
in origin-local preferences. Below 1100px it fills the space below the title
strip as an overlay; at the supported minimum 640px it is full width. Tab stays
inside the overlay, Escape/Close returns to the previous editing focus, and
ordinary editor state is retained. The composer remains disabled until settings,
diagnostics and any conversation resumption succeed. Initial focus completes at
that point only while the panel is still open and no later focus move has occurred;
slow setup does not steal focus from a control the user selected meanwhile.
Plugin removal hides the entry and panel;
Codex being off/unavailable or needing login gives an AI Settings entry instead
of an enabled composer. The same Settings page provides Codex diagnostics.

One conversation is one persistent Codex thread. A new thread is created on its
first message with `ephemeral: false`, so it can also be resumed by ID in the
user's ordinary Codex CLI. Litzio atomically writes only ID, title, folders and
created/updated times to `assistant/conversations.json`. Messages, results and
progress are owned by Codex. Choosing history calls `thread/resume` and pages
`thread/turns/list` with full items. Current snapshots are held only in Host
memory. A disconnected process marks active work failed and explicit resumption
reloads Codex history; no model request is automatically replayed.

`GET /api/ai-agent-conversations` lists metadata; `?id=…` reads a loaded snapshot.
`POST` accepts `send`, `resume` and `interrupt` actions. These are concrete
AI-plugin Host routes, not an arbitrary JSON-RPC proxy or a new UI contribution
point. The installed/enabled provider gates all new conversation calls.

Each send captures the current opened folders and active document. Native
unsaved applied content uses the existing Core-backed `appliedSource()` path;
unapplied node-view drafts are excluded, just as in Source. A text tab supplies
its current text. Neither editor-engine objects nor a second Markdown
implementation cross the Host boundary. The two user-input text parts carry the
message and a marked read-only JSON context; the UI hides the context part when
hydrating history. `document` response language follows the supplied document,
or the user's language when none is open.

A single nonoverlapping 600ms snapshot poll while the panel is open and the tab
is visible delivers
message deltas, tool names/statuses, plans and reasoning **summaries**. Raw
reasoning content is never included in the UI snapshot. Polling reuses the
existing JSON transport and adds no streaming infrastructure. It pauses during
an action, while the tab is hidden, and while Codex is off or setup is incomplete
or failed. Visibility restoration schedules one loop; repeated visibility events
cannot overlap an in-flight snapshot. It ignores responses after closing/switching
or while hidden. Running work continues
when the panel closes. Model and effort are locked while running; a submitted
message uses `turn/steer` with the expected turn ID. Stop uses `turn/interrupt`
and retains partial results. Finished work details collapse to one line.

The composer has model/effort and language chips using the shared Popover and
select controls. The context ring below the input uses the latest token-usage
notification and model context window, exposes numbers on hover/focus, and
recommends a new conversation at 80%. Codex owns automatic compaction. Replies
remain text; existing-document changes are suggestions with no Apply action.

The browser scenario uses fake metadata/conversation responses to check settings
language persistence versus per-conversation overrides, width controls,
open/close/focus (including first-open keyboard input and delayed setup without
focus theft), hidden/off/failed-setup polling suspension and nonoverlapping
visibility restoration, unsaved Core Source context, deltas, steering, interruption,
collapsed completion, history resumption, token usage, disabled/login/missing
states and the 640px Korean Dark overlay. Headless tests run real newline RPC
against the fixture, including scope, persistent metadata, paginated history,
UTF-8, process loss and Host route admission. These mocks do not prove real
account/tool availability.

A real Codex 0.166.0 `gpt-6.1-sol`/`medium` turn plus one steering message finished
in 30,379ms. It identified the folder file's `Atlas` and the unsaved editor
context's `Hana`, and included the steering marker `STEER-931`; the disk still
contained `Mira`. The inherited Windows shell failed with
`CreateProcessAsUserW failed: 5`; the user's inherited Node MCP read the folder
file successfully. Thus this proves folder/context Q&A and steering in that
local environment, not general shell execution. A separate read-only resume
recovered the same answer, Korean language and 31,207/475,000 token usage without
a second model turn. All owned app-server processes were closed.

Representative product captures from the same automated scenario (mock data):

| State | Capture |
| --- | --- |
| Closed document view, 1440px English Light | [Image](assets/assistant-931/closed-1440-light-en.png) |
| Running/steered, 1440px English Light | [Image](assets/assistant-931/running-1440-light-en.png) |
| History, 1440px English Light | [Image](assets/assistant-931/history-1440-light-en.png) |
| Resumed/stopped, 640px Korean Dark | [Image](assets/assistant-931/assistant-640-dark-ko.png) |
| Login guidance, 640px Korean Dark | [Image](assets/assistant-931/setup-640-dark-ko.png) |

The closed/open pair shows document-space changes for this newly added panel;
it is not a historical screenshot. Compared with the static v3.1 mockup, the
existing product shell, shared select popover, native notification control and
plain-text responses supply the real controls/content. No example file links,
future providers or new-document actions are fabricated.

AI execution is not a semantic document operation, so this work adds no CLI
command. New-document creation results/undo, the usage-guide skill, applying
existing-document changes, Docling orchestration and other providers remain
outside this PR.
