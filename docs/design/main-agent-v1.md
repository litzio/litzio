# Main agent connection, settings and conversations

- Status: Implemented
- Minimum-version verification: 2026-11-03 ([#967](https://github.com/litzio/litzio/issues/967); connection, catalog and settings only, limitations below).
- Last verified: 2026-11-02 (#931 implementation 2, PR 2: 409 Editor tests, real Codex creation/card undo and skill discovery; earlier connection/Q&A evidence retained below).
- Scope: main-agent connection, Settings, shell-owned assistant panel and Codex conversations. Includes new-document result cards, guarded creation undo and the product-owned usage-guide skill.
- Authority: [ADR-0014](../adr/0014-main-agent-app-server.md), [#931](https://github.com/litzio/litzio/issues/931) owner decisions and approved v3.1 settings mockup.

## Connection and environment

The existing Host composition owns a lazy `CodexAppServer`. It resolves Codex
from PATH, checks version >= 0.141.0, spawns one stdio child, sends `initialize`
then `initialized`, and matches newline JSON-RPC responses by ID. Concurrent
requests share initialization. UTF-8 chunks may split characters. Provider
errors, malformed messages, process exit and request deadlines reject pending
work; no request is replayed automatically. A later explicit request can
initialize after a failed launch or an exited process. Malformed protocol output
closes the connection; that Host must restart before reconnecting.

The minimum is the first version providing all app-server contracts Litzio uses,
including the current function dynamic-tool registration format (#967). It is
raised only when a required contract changes, independently of the versions used
for actual verification recorded below. Older versions report an update requirement.

The user's environment, including any existing `CODEX_HOME`, is inherited.
No credential/configuration file is copied or written. The cwd is the branded
OS user-data directory plus `assistant` for packaged Desktop and distributed CLI;
Linux uses XDG data home and macOS uses Application Support. Source execution
(Vite, tsx CLI and development Electron) instead uses
`<checkout>/.litzio-dev/assistant`, alongside its isolated plugin/settings defaults
([runtime paths](plugin-runtime-v1.md#installation-and-api)). Built checkout
`packages/cli/dist/cli.mjs` retains distributed defaults. `LITZIO_AI_AGENT_CWD` explicitly overrides this directory
for local integration/testing. Litzio regenerates its product-owned `AGENTS.md`
there and lists folders containing `.agents/skills/<name>/SKILL.md`. The file
instructs the agent to leave existing documents intact and propose edits in text.
Litzio also regenerates `.agents/skills/litzio-guide/SKILL.md` here. It has name/description frontmatter and usage/CLI guidance, with no executable scripts.

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
example error rows, future providers, disabled model-add decoration are not presented as functioning features. The common skill list includes the generated `litzio-guide`; this filesystem inventory does not itself prove Codex discovery.

Contribution labels/descriptions are untranslated keys, translated by the shell
at render time. Plugin view strings use `host.text` during render. Starting in
Korean then selecting English no longer freezes the AI menu or description in
Korean; Docling uses the same metadata convention.

## Verification and remaining scope

### Minimum-version check (#967, 2026-11-03)

The 0.141.0 floor is based on the required app-server contracts, not a claim
of full-flow model execution on that version. A temporary local Codex 0.141.0
installation with an auth-only temporary `CODEX_HOME` confirmed connection,
model listing and settings save using `gpt-5.5` / `low`. Its catalog did not
include `gpt-6.1-sol`; recent models can only be selected in Codex versions whose
catalog knows them. The ChatGPT account rejected the listed `gpt-5.5` with
`model_not_found`, so successful conversation execution, document tools, steering
and continuation could not be verified on 0.141.0. The first immediate steer
attempt returned `no active turn to steer`; a later instrumented attempt
recorded model rejection and failed `turn/completed` before any tool or answer
progress, so no steer-contract difference was established. A restarted Host
restored that failed conversation, but there was no tool-result card to restore.
Actual full-flow verification remains on 0.166.0, as recorded below. An older
Codex may offer no model usable by the account; the owner accepts this limitation
and defers handling until it causes a real user problem. No model workaround or
additional test scenario is introduced. Original and temporary auth-file hashes
were identical after both version checks; temporary auth files were deleted.

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
closing the assistant restores the prior Outline choice. Escape dismisses an open
model/language chooser first, including while focus remains on its chip before
popup autofocus; a subsequent Escape closes the assistant. The assistant starts
at `--layout-assistant-width` (392px) and can be resized from 340 to 560px by
pointer or the focused separator's arrow keys. An explicit width is remembered
in origin-local preferences. Below 1100px it fills the space below the title
strip as an overlay; at the supported minimum 640px it is full width. Tab stays
inside the overlay, Escape/Close returns to the previous editing focus, and
ordinary editor state is retained. The notification center stays hidden and inert
while this modal is open. In the nonmodal layout, notifications sit to the left
of the assistant instead of over its composer (#970; see
[layout rules](editor-layout-rules-v1.md#notification-placement-beside-right-panels-970)).
The composer remains disabled until settings,
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

### Last conversation and history list (#974)

Opening the panel returns to the last viewed conversation, including after a page
reload. Its ID is an origin-local UI preference alongside panel width; the Host
history index and its title/folders/timestamps format are unchanged. Choosing New
conversation clears that preference. Reopening dismisses the history list and
shows the conversation. If automatic resumption fails (including a missing
thread), the panel quietly starts an empty conversation with settings defaults.
Connection/login failures retain their existing Settings guidance.

History entries use a semibold title, a separate locale-formatted date/time and
short folder names with full paths in the tooltip. Quiet dividers separate rows,
as in other shell/settings lists; long titles and names wrap within the panel.
No rename/delete actions or document-path metadata are added.

The fake `ai-agent` browser scenario checks selected older-thread restoration,
page reload, New conversation and failed automatic resume without model turns.
Same-state Korean Dark captures: 1440px [Before](assets/assistant-history-974/before-1440.png) /
[After](assets/assistant-history-974/after-1440.png), 640px
[Before](assets/assistant-history-974/before-640.png) /
[After](assets/assistant-history-974/after-640.png).
Reproduce with `pnpm browser:test ai-agent --screenshots` (history captures in
`tmp/974-evidence`). Captures are manual visual evidence.

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
Reasoning items with an empty or whitespace-only summary are omitted from work
details, both during streaming and when reopening history. If no other work items
remain, no disclosure is shown; the running status remains visible. Nonempty
summaries and tool/plan details retain their existing presentation. Raw reasoning
is never displayed.

#976 verification (2026-11-03): the fake stdio lifecycle checks summary deltas,
completion replacement (including multiple summary sections), empty summaries and
history resumption without raw reasoning. Codex 0.141.0 and 0.166.0 public
`TurnStartParams` / `ReasoningSummary` schemas accept `summary: "auto"` and
reasoning items carry `summary: string[]`. The 0.166.0
[client source](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/core/src/client.rs)
conditionally requests summaries based on provider/model support; `auto` does not
guarantee returned summary text. A single real 0.166.0 `gpt-6.1-sol` / `medium`
turn through the source Host classes and this checkout's `.litzio-dev/assistant`,
with inherited login/configuration, completed with no reasoning summary events
or reasoning items, including after resumption. This establishes an upstream
no-summary case, not the original reporter's unspecified model/effort. No dropped
summary was found in the tested Litzio paths. The fix is limited to the reproduced
empty disclosure; request policy and answer rendering are unchanged.

Same-state source captures: 1440px English Light [Before](assets/reasoning-976/before-1440.png) /
[After](assets/reasoning-976/after-1440.png), 640px Korean Dark
[Before](assets/reasoning-976/before-640.png) / [After](assets/reasoning-976/after-640.png).


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
command. Applying existing-document changes, Docling orchestration and other providers remain
outside this PR.


## Document tools (#931 implementation 2, PR 1)

The Host registers three function specs in `thread/start.dynamicTools` and handles
server-originated `item/tool/call` and the [structured questions](#structured-user-questions-983) added in #983; other requests still return `-32601`.
The small `agent-document-tools.ts` module validates input and invokes Core and
existing Host file reads/listing, independently of the Codex wire format. There
is no tool registry, plugin registration API, MCP server or provider abstraction.

| Tool | Input | JSON result |
| --- | --- | --- |
| `create_document` | `{path, title, blocks}`; absolute new `.md` path, title string, ordered `{type:"paragraph", text}` or `{type:"heading", level:1..6, text}` blocks; empty array allowed | `{path, revision, identity}` |
| `read_document` | `{path}`; absolute existing document path | `{path, source, revision}` from the existing Host read path |
| `list_documents` | `{path}`; absolute folder path | Existing one-level folder listing, retaining document and child-folder entries |

Creation calls `createDocument`, `updateDocumentTitle`, existing insertions,
`validateStructure` and final `serialize`, followed by exclusive `wx` publication.
Text is literal Core input, not a separate Markdown assembler. Unsupported fields
or blocks fail with Core's `invalid-operation` diagnostic; Core insertion and
canonical-write errors are returned without publishing a file. No new semantic
operation or CLI command is needed: this is an AI interface to existing semantics.

| Permission | Host enforcement |
| --- | --- |
| `writeAccess` | Captured at turn start; `read-only` refuses creation |
| Opened folders | Pinned `RootAccess` for that turn; no folders means no file tools |
| Host operator Roots | Existing `accessPath` checks, in addition to the turn boundary |
| Symlink escape/root replacement | Existing pinned Root identity and real-path checks |
| Existing file | Exclusive create, never overwrite |
| Steering/stale calls | Steering retains scope; thread/active turn IDs must match; completion and disconnect revoke scope |

The reply is `{contentItems:[{type:"inputText",text:JSON.stringify(result)}],success}`.
Failures return the same shape with `success:false` and `{error}` JSON text.
Codex stores the dynamic item. The Host snapshot retains `toolResult.success` and
`toolResult.contentItems`, including the JSON path/revision/identity, on live notifications
and history hydration. The existing progress view shows tool name and completion
or failure. The result cards and guarded undo below consume these receipts.

Codex **0.166.0** generated `ThreadResumeParams` has no `dynamicTools` field.
Litzio never sends it on resume. A real local test created `Hello.md` using
`create_document`, closed the owned app-server, resumed from a new process,
recovered the identical creation receipt and successfully invoked `read_document`
in a subsequent turn without re-registration. Thus tools registered at thread
creation persist for that thread in this version. Old threads created without
these tools are not retrofitted; start a new conversation to acquire them.
Terminal Codex CLI does not provide a Litzio tool handler. The owner chose CLI
usage guidance through a Litzio skill instead; the generated `litzio-guide` supplies that guidance.

Local evidence (2026-11-02): Codex 0.166.0, `gpt-6.1-sol`/`medium`, temporary
Host cwd and document folder, inherited user login. Creation and resumed reading
both completed using only the named dynamic tool, without shell/MCP calls.
`litzio check Hello.md` reported `structure valid` and `writeability ok`;
creation and read revision were
`0eb1d90f95a8a0f17517fe0aaca08d8217c082a333da01dc4f7b0172a79ca2dc`.
Both owned processes closed. User Codex configuration and the shared installation
folder were not modified by Litzio. Codex itself persists ordinary thread history.
Fixture tests cover success, read-only/outside/overwrite/symlink/unsupported-block
refusal, stale turn rejection, steering scope, unsupported server requests and
receipt recovery after a fresh process. Browser mocks verify tool progress only;
they are not proof of real execution.

## Created-document results and undo (#931 implementation 2, PR 2)

Successful structured `create_document` results supply each card's path and creation
revision and file identity (bigint dev/ino/birthtimeMs serialized as strings). Assistant prose, failed calls and other tools never create actionable cards.
Cards show the filename first (#1029). Distinct result paths in the conversation
with the same filename use only the distinguishing relative location within the
currently opened folder. Separate roots with identical relative locations include
the root location as needed; paths outside opened folders use a distinguishing
path suffix. Repeated receipts for the same path do not add location noise.
The full original path remains the focusable filename's accessible name and is
available through the shared Tooltip on hover or keyboard focus. Status, Open,
Undo and the deletion warning retain their existing behavior. This display-only
change adds no Core operation or CLI command.

Cards remain visible after Codex history resumption. Open uses the existing tab-opening
flow. Undo deletes the created file, as stated beside its controls; it never reruns
creation after interruption, disconnection or an ambiguous response.

| Current state | Undo behavior |
| --- | --- |
| Same created file, disk matches creation revision, no unsaved tabs or recovery records | Delete without confirmation |
| Changed disk revision, unsaved tab changes or retained recovery records | Ask once; Cancel preserves file, drafts and recovery records |
| Disk, tabs or recovery records changed again after the check/confirmation | Refuse; user must review and explicitly try again |
| File replaced, missing, identity absent or outside currently opened folders / Host Roots | Refuse and show the error |

Undo reuses `/api/file` and the existing `deleteFile` path. A nonmutating `checkOnly`
request returns the current revision and identity after the same scope checks. Creation
captures identity from the exclusive creation file descriptor. Both check and final
delete carry the creation identity as `expectedIdentity`; even an identical-content
replacement is refused. The final delete also carries the checked revision as
`expectedRevision`, checked immediately before removal.
Existing callers without a revision keep their behavior. File identity, symlink and
Root checks remain in force; Desktop retains its existing Trash callback.
The shell blocks document input during this operation, compares the open tab snapshot
and all retained recovery records again after confirmation, immediately before deletion.
Cancel preserves the records. Cleanup compares the checked recovery records inside its
existing IndexedDB transaction: records arriving or changing during the Host request
are preserved and reported, even if disk deletion has already completed. Ordinary
Explorer deletion retains its existing behavior. No new recovery or undo store is added.
The card captures its keyboard trigger before disabling it and restores focus after
pending clears (to the surviving card after deletion).
There is no undo journal or new persistence layer. A deleted receipt remains historical;
a fresh page may offer Undo again, which refuses a missing file.

The product-owned guide explains opening files/folders, Read/Edit/Source, Docling,
Settings and the three assistant tools. Terminal continuation uses existing `litzio`
create, inspect, apply-batch and check commands; it does not promise dynamic-tool
handlers in terminal Codex. Environment diagnostics list local skill names without
starting Codex. Runtime discovery is separately verified using
`skills/list({cwds:[cwd], forceReload:true})`.

AI UI execution and file deletion add no document semantic operation, so no new CLI
command is added. Existing Core/CLI semantics remain unchanged.

Verification on 2026-11-02: targeted file-operation, connection and browser-fixture
checks pass. The `ai-result` browser scenario uses synthetic conversation receipts
with real Host files/deletion: card open, history resumption, immediate clean undo,
unsaved-tab confirmation/Cancel/discard, and changed-disk confirmation.

A separate local browser run used real Codex 0.166.0 (`gpt-6.1-sol`, medium): a Korean
request created `live-created.md` with the dynamic tool, the card opened its content,
and card Undo deleted it, verified by the Host read failing afterward. The test used
a temporary `CODEX_HOME` and externally supplied in-memory authentication; no auth
file was copied and neither shared `.litzio` nor user `~/.codex` was written.
`skills/list({cwds:[cwd], forceReload:true})` found `litzio-guide`, enabled, at the
generated `.agents/skills/litzio-guide/SKILL.md` path. The owned Codex process closed.

| Capture | Evidence |
| --- | --- |
| 1440px English Light | [Cards](assets/assistant-results-931/result-1440-light-en.png) |
| 1440px Korean Dark | [Cards](assets/assistant-results-931/result-1440-dark-ko.png) |
| 640px Korean Dark | [Cards](assets/assistant-results-931/result-640-dark-ko.png) |
| Real Codex creation | [Opened result](assets/assistant-results-931/real-created.png) |
| Real Codex undo | [Deleted result](assets/assistant-results-931/real-undone.png) |

Compared with v3.1 mockup 03, the product uses its existing shell and shared button
styles, shows the full Host path rather than a sample relative folder, and keeps
actual dynamic-tool progress rather than fabricated CLI steps. The creation card
retains file/open/undo/delete explanation. Korean lines and long paths wrap within
the supported 640px overlay; the transcript scrolls independently of the composer.

Review corrections (PR #960): the original head reproduced both missing confirmation
for un-restored recovery work after reload/resume and deletion of a same-byte replacement.
Regression coverage now checks reload/Not now/history/Cancel preservation, changes to
recovery work while confirming, transactional preservation of late recovery work,
identity replacement before check and final deletion, and keyboard Escape focus return.
The previous real-Codex captures above predate these review corrections; identity receipt
transport is additionally covered by the fake stdio creation/history tests.

The review fix passed 409 Editor tests, workspace typecheck, Editor build and docs checks.
The `ai-result`, `recovery-storage`, `file-actions` and `ai-agent` browser regressions
cover the corrected guards. A local HMR module-instance mismatch in the existing
file-actions test was diagnosed from the timestamped recovery-storage import; a clean
Vite start retains the original assertions. Confirmation text explicitly names recovery
records: [1440px English](assets/assistant-results-931/confirm-review-1440.png) and
[640px Korean Dark](assets/assistant-results-931/confirm-review-640.png).

UI-owned reasoning-effort labels, MCP connection/authentication states and token units follow the display language, including plugin `host.text` rendering. Provider model names, descriptions, IDs and diagnostic payloads remain provider data. Translated labels retain the original option values and do not change the selected response language.

#975 source captures (1440px Light English / 640px Dark Korean):

- ai-1440-light-en.png: [Before](assets/ko-text-975/before-ai-1440-light-en.png) / [After](assets/ko-text-975/after-ai-1440-light-en.png).
- ai-640-dark-ko.png: [Before](assets/ko-text-975/before-ai-640-dark-ko.png) / [After](assets/ko-text-975/after-ai-640-dark-ko.png).

Assistant: [1440px](assets/ko-text-975/after-running-1440-light-en.png), [640px Korean](assets/ko-text-975/after-assistant-640-dark-ko.png). Conversation content and selected response language are preserved.

## Assistant answer display and copy (#982)

Assistant messages use the existing plain Markdown display parser (markdown-it,
dollar math and KaTeX), without Core admission or serialization. The same renderer
receives accumulated source during polling, on completion and after history resume.
Incomplete fences/math remain library input; invalid math exposes its source.
Raw HTML stays escaped text. Images show their alternative text without fetching;
Mermaid stays code and syntax highlighting is not enabled. HTTP(S) links use the
existing external opening path, other destinations do not navigate, and footnote
anchors are scoped to each mounted answer.

Copy answer writes the original Markdown; Copy code writes only that code block's
text. Shared compact buttons show Copied after clipboard success and a local error
if clipboard access fails. Long code, tables and display math scroll within the
answer. User messages, progress, polling and Codex history ownership are unchanged.
This is interface display only and adds no semantic operation or CLI command.

Verification: `plain-markdown.test.ts` covers escaped HTML, refused image loads and
unsafe links, isolated footnote IDs, cumulative incomplete syntax and invalid math.
The fake `ai-agent` browser scenario covers streaming completion, rendered history,
original-answer/code clipboard readback (OS newline normalization only), external
opening and unchanged ordinary-document editing. No real model turn is used.
`layout-rules` and `quiet-document` also passed. The same fake response supplies
these Korean Light/Dark captures; scroll position differs with rendered height.
The bottom captures expose math, links and copy controls below the long table.

| View | Before | After | After, bottom |
| --- | --- | --- | --- |
| 1440 Light | [Image](assets/assistant-markdown-982/before-1440-light.png) | [Image](assets/assistant-markdown-982/after-1440-light.png) | [Image](assets/assistant-markdown-982/after-1440-light-bottom.png) |
| 1440 Dark | [Image](assets/assistant-markdown-982/before-1440-dark.png) | [Image](assets/assistant-markdown-982/after-1440-dark.png) | [Image](assets/assistant-markdown-982/after-1440-dark-bottom.png) |
| 640 Light | [Image](assets/assistant-markdown-982/before-640-light.png) | [Image](assets/assistant-markdown-982/after-640-light.png) | [Image](assets/assistant-markdown-982/after-640-light-bottom.png) |
| 640 Dark | [Image](assets/assistant-markdown-982/before-640-dark.png) | [Image](assets/assistant-markdown-982/after-640-dark.png) | [Image](assets/assistant-markdown-982/after-640-dark-bottom.png) |

The shared Recovery copy control supplies the compact-button/Copied feedback pattern.
Visual inspection checked control padding/centering, Korean wrapping, theme contrast
and transcript/composer separation. Code, tables and math remain locally scrollable.
Reproduce after captures with `pnpm browser:test ai-agent --screenshots`; traces and
runtime fixture files are intentionally not committed.


After captures were refreshed after merging #979; its Korean effort labels are
preserved. Before captures retain the original pre-#979 base. The integrated
`ai-agent --screenshots` scenario passed with both localization and Markdown checks.


## Structured user questions (#983)

Host supports `item/tool/requestUserInput` alongside the existing document tool
calls. The assistant shows a separate question form with radio choices, an explicit
Other field when `isOther` is true, and masked free text for `isSecret`. Ordinary
answer text is never interpreted as interactive choices. Submission sends the
original JSON-RPC id and `{answers: {questionId: {answers: [value]}}}`.
Question IDs are opaque keys, including `constructor` and `__proto__`: UI state
uses Maps and Host accepts only own question keys and own `answers` fields.

A pending question belongs to one thread, turn and RPC id. It is kept in the live
conversation snapshot, not the history index, and survives polling and panel
closure. Host consumes it before replying, rejects duplicate/stale submissions,
and expires it on `serverRequest/resolved`, turn completion/failure, interruption,
or disconnection. The form locks while submitting. Approval requests and MCP
elicitation remain unsupported (-32601); `approvalPolicy: never` is unchanged.

The child starts with `app-server -c features.default_mode_request_user_input=true`.
This is a process-only config override and does not write the user's Codex config.
Official [config overrides](https://developers.openai.com/codex/config-advanced/)
and the pinned [0.166.0 feature definition](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/features/src/lib.rs)
confirm the flag and its false default. The same flag exists in
[0.141.0](https://github.com/openai/codex/blob/rust-v0.141.0/codex-rs/features/src/lib.rs);
question execution on that version is unverified and questions may not arrive.
This is conversation interaction, not a document semantic operation; CLI parity
is intentionally omitted. No approval queue, provider interface or request registry
is introduced.


Verification: the stdio fixture checks string and zero-valued numeric RPC ids,
exactly one response, invalid/stale answers and all expiration paths. The existing
`ai-agent` browser scenario covers selection, Other input, password masking,
polling, panel reopening and expiry, including `constructor` choice/Other
submissions and `__proto__` free text. The Host fixture also rejects inherited
answer keys/values. These regressions failed before the #994 review fix. A real source-run Codex 0.166.0 turn using
`gpt-6.1-sol` / `medium`, existing user login/config and this checkout's
`.litzio-dev/assistant` emitted request id `0`; Host replied with the selected
Blue option and the turn completed with `Blue`. The owned child was closed.

Visual evidence (shared Button and settings input patterns; no answer/progress
renderer changes):

| View | Before | After |
| --- | --- | --- |
| 1440px Light English | [Before](assets/assistant-questions-983/before-1440.png) | [After](assets/assistant-questions-983/after-1440.png) |
| 640px Dark Korean | [Before](assets/assistant-questions-983/before-640.png) | [After](assets/assistant-questions-983/after-640.png) |

Reproduce with `pnpm browser:test ai-agent --screenshots`. The question form
scrolls inside the transcript above the composer; controls, padding, Korean
wrapping and viewport bounds were visually inspected. Runtime traces are omitted.


#994 CI follow-up: `ai-agent` now holds its own recovery deletion through the
post-Save page reload after confirming both the committed dirty record and saved
disk text. This reproduced the CI failure before any question card or conversation
polling starts: the old recovery record excluded the remembered document from
startup restoration. Clean Save cleanup now uses the existing synchronous,
generation-bound acknowledgement ([Save contract](editing-session-save-v1.md#local-recovery-records-296-pr2)).
Question RPC arguments, focus and input handling are unchanged. The browser scenario
retains its original text assertion and also checks that no obsolete recovery prompt
appears; the storage scenario checks other-session and newer-edit preservation.


## Compact result paths (#1029)

Manual fixture captures, Korean, 100% zoom, 1000px height:

| View | Before | After |
| --- | --- | --- |
| 1440px Dark | [Before](assets/assistant-paths-1029/before-1440-dark-ko.png) | [After](assets/assistant-paths-1029/after-1440-dark-ko.png) |
| 640px Light | — | [After](assets/assistant-paths-1029/after-640-light-ko.png) |

The existing shell panel, card tokens, compact Button variants and shared Tooltip
are reused (as with the context-usage indicator and document draft indicator).
No new surface or control variant is introduced. The narrow panel retains its
existing overlay behavior. Visual review checks wrapping, status/action prominence,
warning visibility and transcript/composer separation.

Test design: extend the existing `ai-result` browser scenario for full-path
accessible names, keyboard Tooltip display and two synthetic same-name receipts
in different relative directories. Existing real Host Open/undo/confirmation
checks remain the integration protection; no real Codex run, new subprocess or
new scenario is added. Captures run only with `--screenshots` for manual review.
