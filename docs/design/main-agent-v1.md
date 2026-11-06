# Assistant connection, settings and conversations

- Status: Implemented
- Host assembly (#1246): `host-services.ts` composes independent plugin and view services and lazily initializes the assistant. Plugin management/secret routes belong to `plugin-service.ts`; views receive that same plugin runtime explicitly through `view-service.ts`. Assistant shutdown closes only its provider/conversation resources; Host shutdown closes plugins independently, including when assistant initialization or shutdown fails. Views retain no separate runtime resources. Request paths, lazy plugin start, receipts and stored formats are unchanged.
- Generated views (#1210): Generate view uses the selected provider/model/effort and existing conversation, sends a finite catalog context with bounded snapshots of checked saved attachments and completed public tool results, validates completed output through Core/Host and opens a new task tab. Validation errors are visible and returned to the same conversation at most twice; transport/provider failure has no fallback. Generation is read-only and app tools are blocked. Stop and the 180-second deadline abort pending fetches and release controls; a prepared Host handle retains cancellation until the exact provider turn is known. App-owned generation progress/errors support English and Korean. See [Generated views v1](generated-views-v1.md) for manual refresh, favorites, bounds and actual Codex/fake Copilot verification.
- Last verified: 2026-11-05 — master 303e9a1의 Host 등록·탭·비서·템플릿 진입 코드를 정적 대조. 문서 검사 수행; 실제 원격 연결·제품 실행은 재검증하지 않음.
- Terminology: [제품 용어집](../contributing/terminology.md); PR B completed the assistant code/API naming transition.
- Official AI transition: 2026-11-04 (#1150 ③). `assistant-host.ts` composes connections/conversations directly; the official AI itself requires no registration, manifest or plugin worker. Owner-initiated ADR-0020 plugin management is a separate Host feature (see Plugin stage 1 below). Settings use the built-in Settings → Assistant category with the shared Button, SettingsSelect and Dialog components. No UI pattern exception. Protocol version 4 refuses older daemons.
- Historical PR4 daemon lifetime verification: 2026-11-04 — existing fake app-server/HTTP, shutdown/uncertain/no-replay, CLI ownership subprocess tests and persistent Chrome reconnect preservation. PR4's packaged worker/native comparison was required Windows CI then; #1150 ③ removed that feature. Current Windows CI retains packaged Desktop and main/CLI license-notice checks in the startup/sample smoke.
- Assistant naming (#1168 PR B): 2026-11-05. CLI, HTTP routes, feature types/files and settings use assistant; `permissionMode` retains the same values and behavior. Settings use `assistant.json`, `LITZIO_ASSISTANT_SETTINGS_FILE` and `LITZIO_ASSISTANT_CWD`. There are no aliases, old-key acceptance or data migrations. Protocol 4 rejects v3 before connecting because its settings/routes differ.
- Saved-file context (#1106): 2026-11-04 owner decision; fake Host/protocol, existing assistant browser and Korean 1440px/640px Light/Dark capture checks, no real model turn.
- Copilot options/full access (#1091): 2026-11-03; fake ACP/Codex/Host checks, existing assistant browser and 1440px/640px Korean Dark captures; one real no-prompt catalog session only.
- Minimum-version verification: 2026-11-03 ([#967](https://github.com/litzio/litzio/issues/967); connection, catalog and settings only, limitations below).
- Message roles verified: 2026-11-03 (#1048/#1051; fixture captures and turn-copy browser checks below).
- Host settings integration: 2026-11-03 (#1070 merge; target unit/type checks and existing fake assistant browser case, 1440px/640px Korean Dark captures; no real Copilot call).
- Provider Save verification: 2026-11-03 (#1069 review correction; reproduced stale dock state before the fix, then existing fake browser case passed with Save/new conversation).
- Composer input verification: 2026-11-03 (#1087; delayed-caret ordering reproduced before the fix; existing fixture browser scenario, no real model call).
- Copilot verification: 2026-11-03 (#1053; fake ACP and task-default boundary, existing assistant browser scenario and 1440px Light / 640px Dark Korean captures; no real Copilot session or model call).
- Previous execution verification: 2026-11-03 (#1047 PR A/B / #984 / #952: fake stdio/Host, worker prompt, browser and manual 1440 Light / 640 Dark Korean captures; no real model turn).
- Previous verification: 2026-11-02 (#931 implementation 2, PR 2: 409 Editor tests, real Codex creation/card undo and skill discovery; earlier connection/Q&A evidence retained below).
- Display settings (#1120): 2026-11-04; fixed Host/screen allowlist, fake stdio/HTTP and browser checks; no real model call.
- Template operations verification: 2026-11-04 (#1128: shared Host operations, fake dynamic-tool/receipt-history and child PATH execution; no real model call; packaged behavior is CI-only).
- Scope: main-agent connection, Settings, shell-owned assistant panel and Codex/Copilot conversations. Includes new-document result cards, guarded creation undo and the product-owned usage-guide skill.
- Authority: [ADR-0014](../adr/0014-main-agent-app-server.md), [#931](https://github.com/litzio/litzio/issues/931) owner decisions and approved v3.1 settings mockup.

The Codex-specific RPCs and policies below apply to Codex. Copilot differences
are defined in [Copilot conversations](#copilot-conversations-1053).

> 2026-11-05 결정 개정: [ADR-0020 비서 제작 로드맵](../adr/0020-plugin-architecture.md#비서-플러그인-제작-로드맵2026-11-05-개정)은 하위 프로세스 reload·제작 키트·관리 건별 승인 제거와 활동 기록을 결정했다. 아래 매 호출 확인 등은 현재 구현의 기록이며 새 결정의 완료 증거가 아니다. 해당 구현 PR에서 함께 갱신한다.

## 명시적 생성 버튼 제거 (2026-11-06)

소유자 결정으로 composer의 Generate view와 전용 요청을 준비하는 Ask assistant 버튼을
통계·생성 탭·문서 우측 보기·플러그인 화면에서 제거했다. 아래 Generate view 관련 기록은
유지된 내부 Host/CLI 생성 기능과 과거 검증 기록이며 현재 UI 진입점을 뜻하지 않는다.
일반 Send 대화의 view_catalog/propose_view, 검증 결과 카드·새 탭·즐겨찾기는 유지한다.
Copilot 일반 대화에는 동적 뷰 도구가 없으며 기존 CLI 대안의 한계도 그대로다.

일반 대화는 첨부하지 않은 현재 문서의 경로만 전달한다. 현재 문서 본문을 자동 snapshot으로
수집하지 않는다. 명시적으로 첨부한 저장 UTF-8 자료와 이전의 성공한 공개 도구 결과는 선택적
뷰 context로 전달될 수 있다. 이 context의 1 MiB/64개 출처 상한은 일반 문서 읽기의 상한이
아니며, 초과해도 원래 첨부/도구 결과는 보존하고 뷰 context만 unavailable로 표시한다.
전용 내부 생성 경로의 저장 현재 문서 자동 첨부와 구분한다. 사용자 데이터 migration은 없다.

## Host 대상 고정 (#1174 PR2)

비서 표면은 mount 시 Host client를 고정한다. 생성·resume·poll·발화·중단·표시 결과·모델·진단 요청은 같은 client를 사용하며 활성 탭·필터를 요청 주소로 사용하지 않는다. 마지막 대화 ID도 hostId별로 기억한다. 설정 표면 역시 선택한 Host의 client를 고정한다. 연결 해제나 화면 종료가 원격 실행 취소를 뜻하지 않는다.

`assistant-reference-handoff.ts`의 훅은 App의 참조 요청 생성·소비 확인·새 대화 초기화와 대화 Host 선택을 소유한다. AssistantPanel은 요청의 hostId가 대화 Host와 일치할 때만 참조를 추가하고, 처리한 요청을 원래 객체로 확인한다. 훅은 현재 요청과 같은 객체의 확인만 초기화하므로 이전 요청의 확인이 새 요청을 지우지 않는다.

운영 비서는 로컬·등록된 원격 Host를 선택할 수 있다. PR4의 AssistantHostChooser에서 대상을 선택하고 Host별 패널에 고정한다. 다른 Host 참조를 전역 fallback으로 합치지 않는다.


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
`<checkout>/.litzio-dev/assistant`, alongside its isolated official settings defaults
). Built checkout
`packages/cli/dist/cli.mjs` retains distributed defaults. `LITZIO_ASSISTANT_CWD` explicitly overrides this directory
for local integration/testing. Litzio regenerates its product-owned `AGENTS.md`
there and lists folders containing `.agents/skills/<name>/SKILL.md`. The file
instructs the agent to leave existing documents intact and propose edits in text.
Litzio also regenerates `.agents/skills/litzio-guide/SKILL.md` here. It has name/description frontmatter and usage/CLI guidance, with no executable scripts.

The shared daemon owns provider connections and in-memory conversations. Closing
a Desktop window, assistant panel or browser does not stop a turn while that
daemon remains alive. Another client at its origin lists/resumes the same
conversation and sees current progress without starting another turn. Display
tools remain bound to the sending window and cannot silently move to another
client. Unsaved document content, Undo and selection remain client-local.

Closing the daemon ends stdin, waits for exit and terminates the exact owned
provider process tree if needed. Shutdown failure is surfaced. Provider loss marks
live conversation turns failed; no request is automatically replayed. The removed durable `aiTasks` uncertain/no-replay contract remains recorded in ADR-0017 for owner-initiated redevelopment. Provider history
is loaded only by explicit resume after daemon restart. Desktop owns only a
daemon it launched; a CLI daemon survives Desktop close under
[ADR-0016](../adr/0016-shared-local-daemon-host.md). There is no controller across
different Host processes.

## Settings and read routes

With no saved Assistant settings, source checkout execution uses `gpt-6-luna` / `low`
for inexpensive development checks (#1058). The Host reuses the source/packaged
run distinction that selects `.litzio-dev`; installed Desktop and distributed
HTTP Host retain `gpt-6.1-sol` / `medium`. Existing saved settings take priority
and are never overwritten by these defaults. New assistant conversations and
their initial model/effort selection use the same Assistant settings response.

The official `assistant.json` settings file stores (installed defaults shown):

```json
{
  "provider": "codex",
  "model": "gpt-6.1-sol",
  "reasoningEffort": "medium",
  "permissionMode": "opened-folders",
  "responseLanguage": "ko"
}
```

`GET/PUT /api/assistant/settings` and `litzio assistant settings` / `litzio assistant configure --file <json-file>` call the same `createAssistantHost().invoke` operations. Input is the complete official settings object; unknown keys (including the old permission key and enable/provider switches) are refused. Scope is the selected Host's settings path. The returned persisted snapshot is the operation result/receipt; no new ledger or assistant management tool is added. CLI source execution uses local Host storage, as the former management CLI did. Model/provider/effort changes require a current provider catalog pair. Invalid input or a failed write preserves the previous file; writes use an exclusive temporary sibling and rename.

AI is always a daemon feature. Both supported providers are inspectable and selectable without enable switches. Diagnostics report actual executable, connection and account availability. A new conversation/turn with an unavailable selected provider fails with its reason; Litzio never silently substitutes another provider or model. Existing turns, steering, interruption, display replies and history reads do not depend on the current availability/default settings. Changing defaults does not dispose connections, erase conversations or cancel admitted turns; choices apply to the next conversation/turn. Daemon shutdown alone closes its owned provider connections and awaits exit. No settings, registrations or installed files from the removed plugin system are migrated or cleaned.

Each UI change saves a complete snapshot through the existing sequential request queue; errors retain the draft and show a localized alert. Successful saves refresh the assistant defaults while retaining its current conversation. The model dialog retains catalog search, refresh and diagnostics.

`permissionMode` is the single assistant permission-mode value (`opened-folders`,
`read-only` or `full-access`). Each new turn supplies the current opened-folder paths
as `workspaceWrite.writableRoots`, uses `readOnly`, or disables the sandbox with
`dangerFullAccess`. Host path checks run before
passing folder/document context to Codex. The dedicated cwd remains Codex's
workspace; OS temporary write exceptions and network access are disabled in
the restricted turn policies. Approval policy is `never`; unsupported client requests are
rejected, rather than opening an unimplemented approval dialog. User Codex
configuration, MCP servers and login remain inherited. The existing-document
rule is an agent instruction, not a new document-edit enforcement system.
Steering retains the running turn's scope; new folder/settings choices apply to
the next turn.

AI default language offers Korean, English and Japanese. Its initial value follows
Host OS / browser language, with English fallback, independently of display language.
Changing the language automatically persists it.
It applies only to tasks started without a conversation, is pinned in the task's
execution receipt, and reaches the worker prompt. Conversations follow the user's
message language; document writing follows the target document language unless
explicitly requested otherwise. There is no per-conversation language state or selector.
Model/effort defaults still initialize each new conversation.

| Route | Response |
| --- | --- |
| `GET /api/assistant/skills` | `{ skills, errors }`; enabled Codex skills for the assistant cwd, loader errors retained. |
| `GET /api/assistant/models` | `{ provider, models, updatedAt }`; paginated `model/list`, visible models and supported reasoning efforts. |
| `GET /api/assistant/diagnostics` | Codex executable/version, app-server initialization, `account/read`, `account/rateLimits/read`, paginated `mcpServerStatus/list`, check time and individual errors. |
| `GET /api/assistant/environment` | `{ cwd, instructions, skills }`; Litzio-owned environment, without starting app-server. |

These official Host reads use the existing route/JSON transport and add no extension lifecycle
API. Diagnostics keep partial successes: an account/rate-limit/MCP error is not
presented as a successful probe. Unknown MCP runtime status is not inferred from
authentication status. Model discovery and a connected process do not prove
that an account can execute every returned model. No login/token mutation route
or arbitrary JSON-RPC proxy is exposed.

## Settings UI

The flow always shows Codex and GitHub Copilot rows with name/status, diagnostics
without enable switches; the row opens a searchable model dialog with supported efforts, default
marker, update time and refresh. Diagnostics is a separate subview with return
navigation. Defaults are provider, model, that model's supported effort and AI default language.
The common environment shows cwd, `AGENTS.md` and actual Litzio skills.

The existing Settings content/control widths, colors, type and shared modal
focus behavior are reused. Model results have a bounded scroll area. Both
English Light at 1440px and Korean Dark at 640px retain visible controls and
no horizontal overflow. Relative to the static mockup, the existing product
Settings shell supplies navigation; #1109 replaces explicit Save with automatic saving. Mockup
example error rows, further providers, disabled model-add decoration are not presented as functioning features. The common skill list includes the generated `litzio-guide`; this filesystem inventory does not itself prove Codex discovery.

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

`provider-connections.test.ts` runs a fake Node child speaking newline JSON-RPC:
one process/initialization, UTF-8 splits, notifications, catalog pagination,
partial diagnostics, errors/timeouts/process loss and confirmed shutdown.
`ai-task.test.ts` checks real Host routes with that child, shared defaults reaching
the old worker, persistent settings and preserved receipts across changes/off.
The Host test starts the fake app-server before unregistering through HTTP and
asserts process exit while accepted exec work remains running and cancellable.
It also disables Codex with its catalog connection already closed.
The `assistant` browser scenario mocks metadata/settings responses, checks
language-switch regression, model filtering/efforts, refresh, diagnostics,
provider toggle payloads with unsaved model/effort drafts and a disconnected
catalog, automatic saving, re-entry, 640px layout and ordinary document preservation.
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

Reproduce with `pnpm browser:test assistant --screenshots` against the local Host.
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
model/effort chooser first, including while focus remains on its chip before
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
user's ordinary Codex CLI. Litzio atomically writes ID, title, folders, provider, write access and
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

The fake `assistant` browser scenario checks selected older-thread restoration,
page reload, New conversation and failed automatic resume without model turns.
Same-state Korean Dark captures: 1440px [Before](assets/assistant-history-974/before-1440.png) /
[After](assets/assistant-history-974/after-1440.png), 640px
[Before](assets/assistant-history-974/before-640.png) /
[After](assets/assistant-history-974/after-640.png).
Reproduce with `pnpm browser:test assistant --screenshots` (history captures in
`tmp/974-evidence`). Captures are manual visual evidence.

`GET /api/assistant/conversations` lists metadata; `?id=…` reads a loaded snapshot.
`POST` accepts `send`, `resume` and `interrupt` actions. These are concrete
official Assistant Host routes, not an arbitrary JSON-RPC proxy or a new UI contribution
point. The selected AI provider must be available for new conversation calls.

Each send captures the current opened folders and active document path only,
for both native and text tabs. The assistant reads saved content from disk when
needed; unsaved applied content and unapplied drafts are never injected and no
`appliedSource()` preparation runs for a conversation. This owner decision
(2026-11-04, #1106) reduces token usage and keeps document save refusal independent
of message sending. Litzio neither forces nor automatically performs Save.
When the active document has unsaved changes, the existing context row shows
“Using saved version”; its shared Tooltip explains on hover/keyboard focus that
unsaved changes are excluded. The document path remains available there.
Neither editor-engine objects nor a second Markdown implementation cross the Host
boundary. The two user-input text parts carry the message and a marked read-only
JSON context; the UI hides the context part when hydrating history. References
are restored from the same JSON context, including existing conversation history.

#1106 reproduced a real trailing Shift+Enter canonical-source refusal before the
change, then verified path-only sending in the existing fake assistant scenario.
Host protocol tests check that source fields are not forwarded; existing reference,
image and history tests remain. Small manual capture evidence (generated traces
are excluded):

| Korean view | Before | After |
| --- | --- | --- |
| 1440px Light | [Image](assets/assistant-saved-context-1106/1106-before-1440.png) | [Image](assets/assistant-saved-context-1106/1106-after-1440-light.png) |
| 640px Light | [Image](assets/assistant-saved-context-1106/1106-before-640.png) | [Image](assets/assistant-saved-context-1106/1106-after-640-light.png) |

Dark: [1440px](assets/assistant-saved-context-1106/1106-after-1440-dark.png),
[640px](assets/assistant-saved-context-1106/1106-after-640-dark.png),
[keyboard-focused explanation](assets/assistant-saved-context-1106/1106-tooltip-640-dark.png).
The context row retains its alignment and height; the 640px overlay and explanation
fit inside the viewport. The before reproduction used a longer unsaved paragraph;
after captures use a minimal trailing-hard-break fixture and fake answer.


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


The composer opens individual conversation choices directly through the shared
DropdownMenu/DropdownMenuItem controls. The context ring below the input uses the latest token-usage
notification and model context window, exposes numbers on hover/focus, and
recommends a new conversation at 80%. Codex owns automatic compaction. Replies
remain text; existing-document changes are suggestions with no Apply action.

The browser scenario uses fake metadata/conversation responses to check settings
default-language persistence and absence of per-conversation language overrides, width controls,
open/close/focus (including first-open keyboard input and delayed setup without
focus theft), hidden/off/failed-setup polling suspension and nonoverlapping
visibility restoration, saved-document path context, deltas, steering, interruption,
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
command. Applying existing-document changes, Docling orchestration and providers
beyond Codex/Copilot remain outside the current delivery. Copilot was added in
[#1053](#copilot-conversations-1053).


## Document tools (#931 implementation 2, PR 1)

The Host registers document specs, the three [template specs](#template-workflows-936-phase-3) and the two
[display-setting specs](#assistant-display-settings-1120) in `thread/start.dynamicTools` and handles
server-originated `item/tool/call` and the [structured questions](#structured-user-questions-983) added in #983; other requests still return `-32601`.
The small `assistant-document-tools.ts` module validates input and invokes Core and
existing Host file reads/listing, independently of the Codex wire format. There
is no tool registry, plugin registration API, MCP server or provider abstraction.

| Tool | Input | JSON result |
| --- | --- | --- |
| `create_document` | `{path, title, blocks}` or `{path, template, language?}` (mutually exclusive); absolute new `.md` path, title string, ordered `{type:"paragraph", text}` or `{type:"heading", level:1..6, text}` blocks; empty array allowed | `{path, source, revision, identity}` |
| `read_document` | `{path}`; absolute existing document path | `{path, source, revision}` from the existing Host read path |
| `list_documents` | `{path}`; absolute folder path | Existing one-level folder listing, retaining document and child-folder entries |

Block creation calls `createDocument`, `updateDocumentTitle`, existing insertions,
`validateStructure` and final `serialize`, followed by the common `document-create.ts` exclusive `wx` publication. Template creation delegates to the shared template operation and Core template semantics.
Text is literal Core input, not a separate Markdown assembler. Unsupported fields
or blocks fail with Core's `invalid-operation` diagnostic; Core insertion and
canonical-write errors are returned without publishing a file. No new semantic
operation or CLI command is needed: this is an AI interface to existing semantics.

| Permission | Host enforcement |
| --- | --- |
| `permissionMode` | Captured at turn start; `read-only` refuses creation |
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


## Assistant display settings (#1120)

Codex threads created with this version register two additional fixed functions:
`read_display_settings({})` and `change_display_settings({changes})`. The sole
allowlist is `shared/assistant-display.ts`: `theme` (light/dark), `uiLanguage`
(ko/en), `documentWidth` (standard/wide), and `pageBackground` (paper/flat).
Unknown keys/values and extra tool arguments fail before a screen request is made.
AI permissions/provider/model, plugins, navigation, document content and front
matter are excluded. Document write scope is unchanged; these appearance-only
operations also work in read-only turns and without opened folders. They add no
Core semantic operation, CLI command, MCP server, registry or public Plugin API.
Copilot and terminal sessions have no display-tool handler. Start a new Codex
conversation to acquire the added specs; existing thread registrations are not
retrofitted.

Generated AGENTS.md and litzio-guide require proposal → permission → application;
an explicit user change request supplies permission. Consent is an agent
instruction, rather than a natural-language permission parser. The fixed Host
allowlist is enforced independently of those instructions.

`AgentDisplayRequests` owns provider-neutral validation, volatile pending requests
and change receipts. Codex's `item/tool/call` is only its current adapter. The
Host never reads browser storage or writes a settings file. Each send supplies
an in-memory window ID generated with `crypto.getRandomValues` (also available
on non-localhost HTTP); a new turn pins that ID, and steering retains it. The
existing nonoverlapping visible-panel 600ms snapshot poll supplies this ID and
receives only its pending `displayRequest`. A `display-result` action returns
validated live before/after values and any application/storage failure. A
missing originating ID refuses immediately. A closed/hidden panel, hidden tab,
lost connection or lost acknowledgement expires after 10 seconds with an
**unconfirmed** result; it never reports success. The Host uses its monotonic
clock for the deadline and acknowledgement check. Each snapshot carries only
the remaining duration, `validForMs`, rather than an absolute wall-clock time.
The screen records `performance.now()` before starting the poll and checks the
elapsed time against that duration both on receipt and immediately before
applying. Charging the entire round trip conservatively includes network delay
and queued screen work; starting a new lifetime on receipt would revive delayed
snapshots. Neither machine compares the other machine's clock origin. A slow
round trip can refuse early, but cannot extend the Host deadline. Interruption,
turn completion, disconnection and Host shutdown
cancel pending work. Application and acknowledgement are not atomic: a timeout
or cancellation can follow a live change, so the error advises inspecting the
window before another explicit request. No automatic tool retry occurs. Within
a mounted screen, repeated snapshots retransmit a cached reply without applying
the same request again.

Multiple windows/tabs never compete to claim a request: only the window that
sent the original turn can apply it or undo its receipt. A later turn can use a
different sending window; steering cannot transfer an in-flight turn. Reload
creates a new window ID; previous pending work and Undo cannot transfer to it.
Only the target window's live display changes. Existing origin-localStorage
sharing remains: other windows can read the saved defaults on their next load,
but their live React/DOM state is not broadcast or overwritten.

The screen uses existing preference writers, theme/language APIs and shell width
state, independently of document Save/history. The live choice remains usable
when storage is unavailable, as with manual Settings, but the tool returns
`success:false` and the actual before/after values with a persistence error.
Successful reads return the current four values. Changes return
`{requestId,before,after,changed,error?}` in the existing dynamic-tool receipt;
Codex retains it for history. A no-op has no change card. Changed values (including
partially applied failures) use the existing assistant-result card and shared
outline Button, with localized before → after labels and Undo. UI language
names use the same native 한국어 / English labels as Settings. No new surface,
control variant or destructive styling is needed for a display preference.

`display-undo` looks up the Host's receipt instead of trusting browser-provided
old values, then sends an inverse request to that same window. It compares only
the changed keys against their recorded after values; later manual or assistant
changes to those keys refuse Undo, while unrelated choices remain intact. A
successful Undo is consumed in Host memory. Receipts/cards survive in Codex
history, but Undo capability and its UI marker are volatile: after Host restart
or page reload a retained card's Undo reports unavailable. This action is
separate from document Undo. Failures leave a retryable action and show the
reason in the panel.

Verification reuses the existing fake app-server child and HTTP Host tests for
registration, read/change receipts, denied settings and another window's reply,
request expiry/cancellation and guarded inverse requests. The existing `recovery`
browser case disables secure-context-only `randomUUID` and protects application
startup when that API is absent; its assertions are unchanged. An existing `assistant`
browser case exercises the actual poll → live settings → acknowledgement path,
card and Undo, Settings reflection, manual-change conflict, document-draft
preservation and no AI-settings write. It adds no subprocess, exhaustive matrix,
real model call, runner retry or timeout override. Captures are opt-in manual
visual evidence from `pnpm browser:test assistant --screenshots` under
`tmp/1120-evidence` at 1440px and 640px (Korean Dark after application); generated
large generated artifacts are not committed.

Same-state Korean Dark visual evidence (fixed fake conversation/receipt, no model
call): 1440px [Before](assets/assistant-display-1120/before-1440.png) /
[After](assets/assistant-display-1120/after-1440.png), 640px
[Before](assets/assistant-display-1120/before-640.png) /
[After](assets/assistant-display-1120/after-640.png). Before uses the pre-change
AssistantPanel from the branch base; After uses this implementation. Both use
the same stored display preferences, document and conversation data. The manual
capture-only fixture was temporary and is not part of CI.

## Template workflows (#936 phase 3)

Since #1128, templates use the shared Host operations in
[Document templates](document-templates-v1.md#shared-host-operations-and-assistant-1128).
`list_templates({language?})`, `read_template({template,language?})` and
`save_template({name,from,description?})` are registered alongside the existing
functions. `create_document({path,template,language?})` is an alternative to its
title/blocks form. It yields the same structured creation receipt and result card,
with guarded Undo. Start a new conversation for the added tool specifications.

List/read use the Host's fixed catalog and need no opened folders. Save/create
require the captured turn's write access and pinned folder/Host Root checks for
the source/destination document. Save writes only the app-owned template directory,
so opened-folder shell access to that directory is unnecessary. A template is not
applied to an existing document; its original and source document remain intact.

Generated AGENTS.md and `litzio-guide` require a fresh template lookup and
proposal → permission → application. Explicit template requests supply consent;
missing names never fall back. Save requires name/description/source confirmation,
uses the saved disk version, then reads back and refreshes the catalog. Unsaved
content must be saved first if intended. Copilot offers text guidance only.

CLI instructions now serve terminal continuation. Before Codex launch the Host
prepends a private `<assistant cwd>/bin/<CLI identity>` launcher for its own CLI to the child PATH,
without changing Host/system/user PATH or optional Desktop CLI integration.
Source, distributed HTTP and packaged Desktop resolve their own runtime/CLI and
retain source versus installed catalog classification. Desktop supplies its
bundled CLI location explicitly and uses Electron RunAsNode only in the CLI
launcher. This is function reuse, not a live CLI connection or shared editing state.

The existing fake app-server test verifies registration, input/scope refusals,
app-owned saving, template receipt history/resume and a real CLI read from the
fake Codex child's PATH. Core/CLI/HTTP tests own document semantics and adapter
behavior; `assistant-result` uses an actual template creation receipt for the existing
Open/guarded Undo path. No real model call is made for #1128.

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

The product-owned guide explains opening files/folders, Read/Edit/Source,
Settings and the assistant document/template tools. Terminal continuation uses existing `litzio`
create, inspect, apply-batch and check commands; it does not promise dynamic-tool
handlers in terminal Codex. Environment diagnostics list local skill names without
starting Codex. Runtime discovery is separately verified using
`skills/list({cwds:[cwd], forceReload:true})`.

AI UI execution and file deletion add no document semantic operation, so no new CLI
command is added. Existing Core/CLI semantics remain unchanged.

Verification on 2026-11-02: targeted file-operation, connection and browser-fixture
checks pass. The `assistant-result` browser scenario uses synthetic conversation receipts
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
The `assistant-result`, `recovery-storage`, `file-actions` and `assistant` browser regressions
cover the corrected guards. A local HMR module-instance mismatch in the existing
file-actions test was diagnosed from the timestamped recovery-storage import; a clean
Vite start retains the original assertions. Confirmation text explicitly names recovery
records: [1440px English](assets/assistant-results-931/confirm-review-1440.png) and
[640px Korean Dark](assets/assistant-results-931/confirm-review-640.png).

UI-owned reasoning-effort labels, MCP connection/authentication states and token units follow the display language, including official settings rendering. Provider model names, descriptions, IDs and diagnostic payloads remain provider data. Translated labels retain the original option values and do not change the selected response language.

#975 source captures (1440px Light English / 640px Dark Korean):

- ai-1440-light-en.png: [Before](assets/ko-text-975/before-ai-1440-light-en.png) / [After](assets/ko-text-975/after-ai-1440-light-en.png).
- ai-640-dark-ko.png: [Before](assets/ko-text-975/before-ai-640-dark-ko.png) / [After](assets/ko-text-975/after-ai-640-dark-ko.png).

Assistant: [1440px](assets/ko-text-975/after-running-1440-light-en.png), [640px Korean](assets/ko-text-975/after-assistant-640-dark-ko.png). Conversation content and selected response language are preserved.

## Assistant answer display and copy (#982)

Assistant messages use the existing plain Markdown display parser (markdown-it,
dollar math and KaTeX), without Core admission or serialization.
Assistant-only texmath brackets (#1098) render `\( … \)` inline and `\[ … \]`
as display math through the same dollar-math KaTeX renderer and styles. Inline,
fenced and indented code remain literal. Ordinary Markdown reading is unchanged. The same renderer
receives accumulated source during polling, on completion and after history resume.
Incomplete fences/math remain library input; invalid math exposes its source.
Raw HTML stays escaped text. Images show their alternative text without fetching;
Mermaid stays code and syntax highlighting is not enabled. HTTP(S) links use the
existing external opening path, other destinations do not navigate, and footnote
anchors are scoped to each mounted answer.

Copy answer writes the original Markdown of all assistant messages in that turn,
in their existing order, joined with two LF characters between messages (#1048,
#1051). It excludes user messages, work details and result receipts. The single
turn action follows answers, result cards and status/error text; while streaming
it copies the accumulated answer so far. Turns without nonblank answer text offer
no answer action. Copy code still writes only that code block's text. Shared
CopyButton uses the existing ghost/icon-sm Button and Tooltip for the turn action;
code blocks retain their text button. The action is always visible, has an
accessible name, keyboard focus ring and hover/focus tooltip. Success changes the
icon to Check and announces Copied; clipboard failures remain local alerts. Long
code, tables and display math scroll within the answer. Progress, polling and Codex history ownership are unchanged.
This is interface display only and adds no semantic operation or CLI command.
Shared CopyButton also supports browsers without Clipboard API access (for example,
non-local HTTP) via the temporary-textarea browser copy fallback defined in
[Code body copy](document-editing-v1.md#code-body-copy-991) (#1049). If both paths
fail, the existing local manual-copy alert remains.

#1098 visual verification: the fixed `assistant` response was captured through
`pnpm browser:test assistant --screenshots` before/after enabling bracket math.
[1440 Light before](assets/assistant-bracket-math-1098/before-1440-light.png) /
[after](assets/assistant-bracket-math-1098/after-1440-light.png),
[640 Korean Dark before](assets/assistant-bracket-math-1098/before-640-dark.png) /
[after](assets/assistant-bracket-math-1098/after-640-dark.png).
Existing answer layout, copy controls, wrapping and internal overflow are retained;
no new surface or control exception is introduced. The renderer unit test owns
syntax/code/plain-reading boundaries; the existing browser scenario checks rendered
bracket math, original-source clipboard readback and history with no model call.

Verification: `plain-markdown.test.ts` covers escaped HTML, refused image loads and
unsafe links, isolated footnote IDs, cumulative incomplete syntax and invalid math.
The fake `assistant` browser scenario covers streaming completion, rendered history,
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
Reproduce after captures with `pnpm browser:test assistant --screenshots`; traces and
runtime fixture files are intentionally not committed.


After captures were refreshed after merging #979; its Korean effort labels are
preserved. Before captures retain the original pre-#979 base. The integrated
`assistant --screenshots` scenario passed with both localization and Markdown checks.


### Message roles and turn actions (#1048, #1051)

User messages are right-aligned, content-sized bubbles capped at 85% of the
transcript width, using surface-subtle, radius-md and existing spacing tokens.
Assistant answers remain left-aligned Markdown prose without a bubble. Named
`Your message` / `Assistant response` groups expose the distinction to assistive
technology. Work disclosure, plan content, result cards (#1029) and code copy
(#991) retain their own actions; the turn copy sits after the complete turn.
This remains interface display only, with no Core operation or CLI addition.

Manual review: Windows persistent Chrome, Korean, 100% zoom, same fixture and
1000px height. Each view includes a user message, two assistant messages, collapsed
work/plan details and a creation result. The manual capture body was removed from
the automatic scenario. Checked bubble alignment/width, prose/action distinction,
card controls, contrast and clipping at both widths.

| View | Before | After |
| --- | --- | --- |
| 1440px Light Korean | [Before](assets/assistant-roles-1051/before-1440-light-ko.png) | [After](assets/assistant-roles-1051/after-1440-light-ko.png) |
| 640px Dark Korean | [Before](assets/assistant-roles-1051/before-640-dark-ko.png) | [After](assets/assistant-roles-1051/after-640-dark-ko.png) |

Test design: extend the existing `assistant` fixture scenario, without real Codex
calls or a new scenario/matrix. Its original single-answer/code clipboard and
history checks remain. The added split-answer case protects named role groups,
one action after all turn content, keyboard Tab/Enter and focus tooltip, and the
joined original Markdown clipboard value. CSS geometry is visually reviewed rather
than asserting fixed pixel positions. Shared Editor tests/typecheck/build and
layout-rules/quiet-document protect integration and existing visual constraints.

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
`assistant` browser scenario covers selection, Other input, password masking,
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

Reproduce with `pnpm browser:test assistant --screenshots`. The question form
scrolls inside the transcript above the composer; controls, padding, Korean
wrapping and viewport bounds were visually inspected. Runtime traces are omitted.


#994 CI follow-up: `assistant` now holds its own recovery deletion through the
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

Test design: extend the existing `assistant-result` browser scenario for full-path
accessible names, keyboard Tooltip display and two synthetic same-name receipts
in different relative directories. Existing real Host Open/undo/confirmation
checks remain the integration protection; no real Codex run, new subprocess or
new scenario is added. Captures run only with `--screenshots` for manual review.


## File references (#1047 PR A, #984, #952)

Explorer's file context menu **Add to chat** opens the composer draft on the
file's Host (#1253). Folders cannot be added. Paths are deduplicated and at most
10 file references are allowed. A conversation fixed to another Host rejects the
handoff without replacing its draft; start a conversation on the file's Host first.
`@` is ordinary message text and never starts folder enumeration or file search.
The `/` Codex skill picker retains candidates, scroll position and highlighted
item across unrelated shell renders and conversation snapshots (#1108). Arrow
keys / Enter select, Escape dismisses, and pointer selection retains composer focus.

#1253 verification (2026-11-06): existing `assistant` and `multi-host` persistent
Chrome scenarios cover ordinary `@` text without folder queries, explicit local/remote
attachment, Host mismatch rejection and remote send rejection preserving text/chips.
Existing provider tests own limit/deduplication/RootAccess/hidden/deleted/symlink checks.
These are HTTP fixtures and fake providers, not real OneDrive or remote OS acceptance.
Integration with #1301/#1306 (2026-11-06) preserves the ordinary Send view-tool
route and removal of dedicated generation buttons, Copilot model/effort rejection
recovery without automatic retry, and this Host-bound reference draft. Existing
`assistant`, `multi-host` and production-HTTP `generated-views` scenarios cover the
combined paths; provider/Host unit tests retain the lower-layer checks. These are
synthetic provider/HTTP checks, not proof of actual model answer delivery or
OneDrive performance. The earlier #1181 live-probe limitations remain unchanged.

Manual composer captures: 1440px English Light
[Before](assets/explicit-references-1253/before-1440.png) /
[After](assets/explicit-references-1253/after-1440.png), 640px Korean Dark
[Before](assets/explicit-references-1253/before-640.png) /
[After](assets/explicit-references-1253/after-640.png).
The baseline panel was temporarily restored for Before; both sides use the same
local Explorer attachment and `@document` draft. The capture fixture supplies only
synthetic Hosts (`Local`/`Remote`), account (`demo-user`), paths
(`C:/demo/notes/document.txt`), saved text and model (`Demo model`). No mask hides
product controls, Explorer or Host context; no real model or remote machine is used.

Explicit remote Explorer handoff, using the unchanged product ContextMenu and chip:

| Width / theme | File context menu | Attached result |
| --- | --- | --- |
| 1440px English Light | [Add to chat](assets/explicit-references-1253/remote-menu-1440.png) | [Remote chip](assets/explicit-references-1253/remote-result-1440.png) |
| 640px Korean Dark | [채팅에 추가](assets/explicit-references-1253/remote-menu-640.png) | [Remote chip](assets/explicit-references-1253/remote-result-640.png) |

Capture uses a temporary synthetic scenario through `pnpm browser:test assistant --screenshots`,
then restores the regression body and current panel source. The shortened run intentionally
omits the normal scenario's expected HTTP failures, so it is manual visual evidence,
not a passing regression run. No capture-only CI loop is added.
Visual inspection checks chip/remove-control alignment, input padding, readable Korean,
Explorer menu placement and panel/control clipping at both widths. The candidate row
disappears; the existing skill picker, Explorer menu and chip presentation are unchanged.
The eight images linked here replace the earlier masked images at the current branch
surface. This does not establish deletion from earlier commits or external caches.
These captures precede integration of #1306: the dedicated Generate view button
visible in them is removed in the integrated UI; the approved Explorer/Host attachment
layout remains unchanged. Current ordinary-Send view behavior follows the
[#1306 contract](#명시적-생성-버튼-제거-2026-11-06).

Removable chips above the input show only file names; shared Tooltip exposes the
full path on hover/focus. No file-type-specific presentation or read indicator is
used. New conversation clears the draft. Failed sends retain it. A reference-only
message is valid, including steering an active turn.

Host checks both opened-folder RootAccess and its own access policy. Each relative
path segment must appear in Explorer's current listing: hidden entries, symlinks,
directories, unavailable files and paths outside opened folders are rejected.
Checks run again immediately before submission. All files, including `.md` and
`.txt`, remain path descriptors in `references:[{path,name,kind}]` in the existing
`Litzio read-only context (JSON)` text. PNG/JPEG/WebP/GIF additionally send
`{type:"localImage",path}`. No file content conversion or upload store is added.
The active document is likewise supplied only as a path; the assistant reads its saved file when needed (#1106).
References do not extend document-editing permissions or a running turn's scope.

The public conversation input takes `references?: string[]`; user items expose
`references?: AssistantFileReference[]`. Both live `itemFrom` and paginated resumed history
restore chips from context JSON, including Codex legacy history that concatenates text inputs into one string, without a second transcript store. Historical
chips remain path metadata if files move or disappear; they do not resend files.
This is shell/Host context, not document semantics, so no Core/CLI operation is added.
The `/` skill picker is a separate PR B and remains outside this delivery.

Verification extends existing fake stdio/Host tests for context + localImage,
send/steer/live/resume, reference-only sends, duplicate/limit, deleted/hidden files
and scope rejection. The existing `assistant` browser scenario owns Explorer →
composer, no folder lookup on `@`, deduplication/removal, reference-only steer,
chip restoration, and no conversation-language control. Worker prompt tests own
language injection; receipt tests retain retry identity after settings changes.
No real model turn or new browser process framework is used.

Manual visuals use the same persistent Chrome runner separately from normal tests:
1440×1000 Light/English and 640×1000 Dark/Korean, Plum, 100% zoom.
[1440 Before](assets/assistant-references-1047/before-1440-light-en.png) /
[1440 After](assets/assistant-references-1047/after-1440-light-en.png),
[640 Before](assets/assistant-references-1047/before-640-dark-ko.png) /
[640 After](assets/assistant-references-1047/after-640-dark-ko.png).
Shared ContextMenu, Button, Tooltip and existing shell tokens are reused; candidate
listbox keyboard ownership is local to the composer. No new plugin UI surface.

Visual inspection: file names, remove buttons, text input and model/effort control remain visible at both widths, with no horizontal overflow. Dark/Korean retains legible chip borders and close controls. The 1440 After also includes the extra reference-only steering message used to verify the feature; the document and assistant width are unchanged.

Protocol evidence: [0.141.0 UserMessageItem::message](https://github.com/openai/codex/blob/rust-v0.141.0/codex-rs/protocol/src/items.rs#L269) concatenates input text, and [thread history](https://github.com/openai/codex/blob/rust-v0.141.0/codex-rs/app-server-protocol/src/protocol/thread_history.rs#L1107) returns it as one text input. The fake paginated history models this shape; live notifications retain separate inputs.

## Copilot conversations (#1053)

- Authority: owner-approved #1053 addition to ADR-0014, 2026-11-03.
- Verification: fake ACP child covers initialize, model catalog, streamed turn,
  cancellation, read-only/opened-folder permission responses and failed prompt.
  #1091 additionally checks Auto, CLI/config effort, Agent/Plan, full access and
  preserved restricted permission paths. One real Copilot 1.0.105 initialize/catalog
  session returned duplicate Auto models, Agent/Plan/Autopilot and allow_all=off,
  without a thought-level config. No prompt/model call was made. Actual model
  execution and permissions remain owner checks.

The Default AI provider select offers both supported providers. Changing it fetches that
provider's catalog and automatically saves the first available model/effort.
Host validates changed model/effort against the provider's current response. Copilot's catalog is
`session/new.models.availableModels`, deduplicated by ID retaining the first entry.
If absent, `auto` is prepended as **Auto**, **Let Copilot pick the best model**, matching
Copilot/Paseo's returned catalog. One no-prompt
catalog session is reused per connection. Connected means transport/session
readiness only, not confirmed login, model entitlement or available quota.
Login stays in the user's Copilot CLI. Account/rate-limit/MCP diagnostics are
Codex-only. Disable/unregister/Host shutdown closes both owned CLI connections.
Saving a provider switch closes the old connections; active work is disconnected
and is never replayed. A successful AI-settings PUT also refreshes an already
open assistant through the official AI HTTP transport. The panel
rereads settings/catalog/diagnostics; when provider changes it drops the old
conversation, running/pending state, remembered selection and composer selections,
then uses the new provider's defaults for a fresh conversation. Late old-provider
poll/send responses cannot restore discarded state. Refreshing settings does not
autofocus the assistant input. Same-provider saves refresh configuration without discarding the current conversation or its
model/effort overrides. Failed saves do not refresh the panel. No public Plugin
API, event bus or provider framework is added.

Copilot uses `copilot --acp` with the user's environment and the same Litzio-owned
cwd/AGENTS.md. The official ACP SDK owns NDJSON framing and request dispatch.
The advertised model config option selects a returned model through
`session/set_config_option` before `session/prompt`; its complete response replaces
the conversation's options. Legacy sessions without a model config option use
`session/set_model` and its config updates.
`session/update` text/thought/tool updates feed existing panel snapshots. Prompt
errors and disconnection mark a turn failed. Stop sends `session/cancel`;
a second message waits until the current turn ends (no steering emulation).
Request failures during initialization, catalog/session creation and session setup
preserve ACP's string `message` as an Error for the existing Host error response,
rather than displaying `[object Object]`. Provider error `data` is not serialized.
Provider-tagged conversation indexes are filtered to the selected provider.
Codex `/` skill selection and `skills/list` remain Codex-only; Copilot does not
query that catalog or send Codex skill inputs.
`session/load`, when advertised, replays provider-owned history; otherwise
resumption reports an explicit error and a new conversation remains available.

The user message includes product instructions, opened-folder paths, the active
document path and validated reference paths. It reads saved file content on demand;
unsaved native/text editor content is excluded (#1106). Copilot receives image
references as paths, without Codex localImage inputs. Native Copilot tools may
read references. Litzio dynamic document tools/result cards and Codex skill
selection are not exposed. Existing-document editing remains text suggestions
only. The settings hide Codex skills and diagnostics. No context limit is inferred when ACP does not report one.

ACP permission mediation captures each turn's `permissionMode` and opened folders.
Only read/edit requests carrying absolute paths inside those folders and Host
Roots can receive the returned `allow_once` option. Edits additionally require
`opened-folders`; `read-only` denies them. Missing paths, execution, network and
unknown requests are cancelled in restricted access. The owner-approved `full-access`
value instead selects an allow_once (or allow_always) response for every active-turn
request, including tool execution, paths outside opened folders and URLs. Like Paseo,
Host sends `allow_all=on` when advertised; Agent/Plan remains the selected session
mode. Restricted turns send `allow_all=off`. CLI flags deny shell tools in restricted
access and permit them in full access; built-in MCP servers remain disabled. Unlike Codex, this does not install an OS sandbox or
override every inherited Copilot permission/MCP configuration. Preauthorized
provider actions may not ask Host for permission. Users must verify their CLI
configuration; these settings are not represented as equivalent containment.

Docling and its feature-task exec adapter were removed in #1150 ③.
The removed feature-task settings (`codexTaskSettings`) are not retained.
Official settings store the selected provider/model/reasoning effort and accept
full-access; no migration of earlier saved settings is included.

UI uses the shared SettingsSelect for provider/model/effort/language/permission mode.
Providers have no enable switches; all defaults save automatically. Permission mode defaults to
opened-folders and also offers read-only and Full access. A native hover description
explains each permission mode and the Copilot containment limitation; Full access removes the Codex sandbox and automatically approves tools,
paths and network access; no permanent warning is shown. Codex full-access turns use
`sandboxPolicy: {type:"dangerFullAccess"}` and `approvalPolicy:"never"`; steering keeps
the captured active-turn scope. Document tools still use their existing opened-folder,
Host Root and exclusive-new-file boundaries. These are not general shell tools.
Copilot hides only Codex-specific skills/diagnostics. The existing model Dialog/provider summary
remain; official AI reuses shared settings row widths (P05/P12).
Manual owner checks: Host login, available model selection, conversation and
history, Stop, and read-only/opened-folder writes with the user's configuration.
### Copilot choices and application timing (#1091)

The composer uses separate compact outline Buttons with direct common
DropdownMenu/DropdownMenuItem choices for provider, model, reasoning effort, write access and
(Copilot only) advertised Agent/Plan. Model buttons use the catalog display name.
Current values use the existing Check convention and aria-current; menu boundaries
and item faces use existing control/surface/text tokens (#1110/#1124). No new common interaction,
Plugin UI contribution or mode default setting is added. Only exact Agent/Plan short
or protocol IDs are accepted by Host; Autopilot, Allow All and Auto Accept are absent.
Full access is controlled exclusively by permissionMode. UI controls are locked during
an active turn. Model/mode changes apply at the next message, with `session/set_mode`
for the selected mode. Each new conversation starts with Agent when advertised.

A `thought_level` select (or reasoning/thought-level config ID) supplies values and
current default, flattened from ACP option groups as in Paseo. Host applies it with
`session/set_config_option` before the prompt. An advertised model config option
without a thought-level option means that selected model has no configurable
reasoning effort: Host sends no reasoning config and the composer hides that
selector. It does not reinterpret a removed model option as CLI fallback.
Legacy sessions without either a model config or thought-level option use CLI
`none|minimal|low|medium|high|xhigh|max`, default medium, without guessing model support.
The CLI fallback locks effort after a conversation starts; the hover explains that a
new conversation is required. New-conversation effort or full-access launch changes
restart the owned process lazily, never while any Copilot turn is active. Prior
sessions require advertised loadSession to continue after a restart. No model work
is replayed. The index stores `copilotCliReasoningEffort` only for CLI-fallback
conversations, beside the provider/title/folder metadata; Codex's index is unchanged.
History resume restores that saved effort and the current write-access launch
settings before `session/load`. If arguments differ, the existing child must exit
before its replacement starts. A conflicting active Copilot turn rejects resumption
with a visible error rather than interrupting that turn or adopting its effort.
Records without a saved CLI effort cannot resume a fallback session and report that
a new conversation is required; no past-data migration or guessed default is added.
The saved value is also enforced on subsequent sends, including after Host restart.

ACP-config efforts are validated after model selection against the actual
conversation session's latest advertised choices. Its config updates may differ
from the separate catalog session. The catalog supplies initial defaults only;
its effort list cannot veto a newly advertised conversation value. Only the CLI
fallback uses the fixed seven-value validation. Settings defaults affect new conversations; active conversations retain
their effort selection. ACP config updates are retained for subsequent validation.
Model setup publishes the latest options and provider current effort to the
conversation snapshot even when a subsequent setting is rejected. Polling can
therefore restore choices after Auto → a model with different reasoning support.
The composer preserves the user's requested effort across Copilot model changes;
it does not replace it with a catalog default or automatically retry an invalid
value. The existing choice tooltip reports the provider's current value separately.
An invalid request retains the message draft and readable error until the user
selects an advertised value and sends again.

#1181 verification (2026-11-06): the owner observed Copilot 1.0.105 rejecting an
Auto reasoning configuration while model/session lookup succeeded; that version's
config event history was not recorded. A later owner check on 1.0.106 observed
reasoning disappearing after Auto selection. These are distinct observations.
Fake stdio regressions cover supported-model effort updates and Auto's removed
option, plus readable RPC errors without provider data. A separate local PATH
1.0.106 probe completed a minimal Auto prompt with no received assistant text;
it is not evidence of successful real answer delivery. No account/default settings
were changed. The composer reuses the existing AssistantChoice Button/menu pattern
and omits unavailable choices; no new surface or UI pattern exception is added.

The original #1091 manual review used SettingsSelect and composer Button/Popover with no
new common implementation or UI exception. Korean Dark, 1440×1000 and 640×1000,
same fixture state: Before uses master `080f7bc1` UI and a rebuilt plugin; After
uses #1091 UI. Captures are manual review only, not pixel assertions.

| Surface | 1440px Before / After | 640px Before / After |
| --- | --- | --- |
| Settings | [Before](assets/copilot-options-1091/before/copilot-1440-dark-ko.png) / [After](assets/copilot-options-1091/after/copilot-1440-dark-ko.png) | [Before](assets/copilot-options-1091/before/copilot-640-dark-ko.png) / [After](assets/copilot-options-1091/after/copilot-640-dark-ko.png) |
| Composer choices | [Before](assets/copilot-options-1091/before/copilot-options-1440-dark-ko.png) / [After](assets/copilot-options-1091/after/copilot-options-1440-dark-ko.png) | [Before](assets/copilot-options-1091/before/copilot-options-640-dark-ko.png) / [After](assets/copilot-options-1091/after/copilot-options-640-dark-ko.png) |

Alignment, spacing, legibility and clipping were reviewed in both widths. The
640px settings content scrolls vertically; the composer popup remains in view.
Reproduce After with `pnpm browser:test assistant --screenshots`. Before uses the
same screenshot-only popup traversal against the original UI; no extra scenario
is retained. The initial baseline attempt retained a newer built plugin; rebuilding
the original source produced the reviewed Before captures.

Owner checks include every effort value/model combination, Auto routing, Agent/Plan
switches, next-message versus new-conversation timing, history after launch changes,
and full-access shell/path/URL execution for both providers. Fake tests do not prove
model entitlement, usage, actual sandbox enforcement or inherited CLI permissions.

Implementation reference: [Paseo Copilot ACP](https://github.com/getpaseo/paseo/blob/main/packages/server/src/server/agent/providers/copilot-acp-agent.ts),
[Paseo transport](https://github.com/getpaseo/paseo/blob/main/packages/server/src/server/agent/providers/acp-agent.ts),
[providers](https://paseo.sh/docs/supported-providers),
[GitHub ACP](https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server).


## Codex skill selection (#1047 PR B)

Typing `/` at a word boundary opens the inline skill candidate surface.
The Host calls `skills/list({cwds:[assistantCwd],forceReload:true})` using only
parameters supported by Codex 0.141.0. Only enabled skills returned for that cwd
appear, with name and description, filtered by the typed query. Loading, empty
results, RPC failures and per-skill loading errors remain visible in the candidate
surface. Opened folders do not add skill discovery roots. No installation,
enablement, global configuration write or Litzio command palette is introduced.

Click or Arrow/Enter selects a skill; Escape closes candidates before the panel.
Selection inserts `$<name>` in text and adds a removable path-tooltip chip using
the file-reference Button/Tooltip implementation. `/` is only selection syntax.
Both file and skill selection apply the caret together with the updated composer
text, before subsequent input. A deferred paint callback must not move the caret
back into text the user has already typed. Reopening file candidates clears the
previous lookup's results with the new query, so retired options cannot signal
readiness while the new lookup is starting (#1087).
The public conversation input adds `skills?: {name,path}[]`. Host validates each
selection against the enabled catalog and sends `{type:"skill",name,path}` with
`$<name>` text on start and steer. Selection follows whitespace-delimited
`$name` tokens in the current input text: deleting a selected token removes its
chip and explicit input; clicking a chip's X removes all corresponding tokens
as well. Only selected skills whose tokens remain at send time are sent. Host
also filters selections by those tokens and never appends a missing token;
retained name/path pairs are still checked against the enabled catalog.

Skills persist as `{name,path,kind:"skill"}` in the existing context JSON
`references` array. Live and paginated history therefore restore chips without
assuming Codex returns skill inputs in thread history. They are historical
references, not automatic inputs on later turns. File references retain their
existing validation and image handling. No document semantics change, so Core
and CLI additions are intentionally unnecessary.

Verification: the existing fake app-server covers enabled filtering, exact cwd
and request fields, start/steer input, missing/disabled selection rejection,
RPC and per-skill errors, and flattened history with skill items omitted. The
existing assistant browser scenario covers ordinary paced typing and clicking,
description display, chip/token removal in both directions, deleted-token
start/steer payloads, send metadata, history chips and visible list
failure. Host tests own protocol assertions; browser assertions own interaction.
No real model turn or exhaustive combination matrix is added. The 640px skill
candidate/chip sequence runs only with `--screenshots` for manual review.

Manual captures from `pnpm browser:test assistant --screenshots` use the product
surface and persistent Chrome profile: [1440 Light list](assets/assistant-skills-1047/list-1440-light-en.png),
[1440 Light chip](assets/assistant-skills-1047/chip-1440-light-en.png),
[640 Dark Korean list](assets/assistant-skills-1047/list-640-dark-ko.png),
[640 Dark Korean chip](assets/assistant-skills-1047/chip-640-dark-ko.png).
The existing file-reference captures above provide the preceding composer state.

### Conversation choices (#1110 / #1124)

Owner decision (2026-11-04): `AssistantConversationInput` accepts optional `provider` and
`permissionMode` overrides from the user's composer selections. These never write
Assistant settings or change global defaults. New conversation restores the global
provider/model/effort/access defaults together with that provider's catalog; closing
and reopening the panel preserves unsent choices. The picker contains both supported AI providers without enable switches. Host send/resume reports an unavailable selected provider with its reason, independently of the global default. Model catalogs and diagnostics inspect both providers; the provider is pinned when the first message creates a session. Both UI and Host
reject changing an existing session's provider. Its disabled button remains
explainable through the common Tooltip on hover or keyboard focus.

Permission mode is captured at each new turn. Steering preserves the running turn's
scope; an explicit later selection takes effect on the next turn. The history
index stores the last applied write access and provider. The index is inside the
assistant-writable cwd and is not approval authority. The current Host's in-memory
conversation retains a user-approved override through resume. After Host restart,
a stored grant can only restore at or below the current global default in the order
read-only < opened-folders < full-access; invalid values use that default. The
sanitized value is also returned to the UI. Elevation beyond that cap requires a
fresh explicit selection in this Host session. This bounds restored state instead
of adding a second persistent grant store or assuming a sibling directory is
outside every opened folder. No past-data migration is added. The existing permission checks and
Copilot launch rules still apply. No assistant tool can change these choices:
the concrete user-facing send route owns overrides, while model tool dispatch
remains restricted to the existing document tools. No language selector or Core
semantic operation is added; this is Host conversation state, with no CLI document
operation parity requirement.

Shared implementation: outline Button, Tooltip, DropdownMenu and DropdownMenuItem;
no new common interaction or style system. NewDialog's existing `form-select`
already supplies the shared control border and opaque surface, so it needs no
parallel visual patch. Browser checks protect composer wiring and real computed
contrast; Host protocol checks protect scope, provider pinning and resume. No real
model call is required.


Manual visual evidence: Windows persistent Chrome, same fake catalog and unsaved
document, 1440×900 Light/English and 640×900 Dark/Korean. The existing
`pnpm browser:test assistant` runner used a temporary capture-only block (removed
from the automatic scenario) to open Model directly. Before images retain the original native-list defect;
after images show the review follow-up direct menu.
No screenshots-only loop was added to CI. Alignment, padding, viewport bounds,
Korean wrapping, current-value checks and open-menu readability were reviewed directly.
The DOM contrast assertions cover rendered menu surfaces/items, not OS-native options.

| View | Before | After |
| --- | --- | --- |
| 1440 Light | [Combined popup](assets/assistant-choices-1110/before-1440.png) | [Separate choices](assets/assistant-choices-1110/after-1440-closed.png), [Direct menu](assets/assistant-choices-1110/after-1440.png) |
| 640 Korean Dark | [White-on-white native list](assets/assistant-choices-1110/before-640-list.png) | [Separate choices](assets/assistant-choices-1110/after-640-closed.png), [Direct menu](assets/assistant-choices-1110/after-640-list.png) |

The shared expanded-button CSS incorrectly removed outline borders as well as
ghost borders. Removing that redundant reset lets each existing Button variant
own its border; ghost remains transparent. No NewDialog styling is changed.

## Official provider settings (#1150 ③)

`AssistantSettings` lives in `apps/editor/shared/assistant.ts`. The daemon owns settings and its provider connections directly. The removed enable switches, plugin transport and Codex feature-task defaults have no compatibility aliases. Both providers remain inspectable; the selected provider's real availability controls new work, while current turns and tools retain their lifecycle. Existing settings controls, ordered autosave and failed-save recovery remain covered by the fake `assistant` browser scenario.

Verification: full workspace tests/typecheck, boundaries, docs, Editor/CLI build, fake assistant/assistant-result browser scenarios, and production HTTP recovery/reconnect/Save/conflict. Packaging and platform distribution are CI-only; no paid AI call, install/update/uninstall or user-data migration was run.

Manual visual review, 1440px English Light and 640px Korean Dark: [wide](assets/official-ai-1150/ai-1440-light-en.png), [narrow](assets/official-ai-1150/ai-640-dark-ko.png). Reuses SettingsSelect, Button and Dialog with existing shell geometry. No new interaction or UI pattern exception.

Independent-review follow-up: generated `litzio-guide` frontmatter and instructions describe only retained features; the environment regeneration test rejects removed Docling/convert-pdf guidance. Provider rows retain the common ghost Button with explicit start alignment, following the left-aligned label convention in Appearance/Recovery; obsolete toggle CSS is removed. The wide/narrow captures above are refreshed for this alignment fix. Desktop license assertions are preserved in the existing packaged startup/sample smoke and run only in required Windows CI.

Review follow-up (#1131): the existing Host test first reproduced a forged
`full-access` history entry becoming `dangerFullAccess` after a fresh Host resume
and a send with no override. It now checks read-only restoration/sending, a safe UI
snapshot and a valid same-Host elevated override surviving resume. Steering still
retains the active turn's scope. No real model call or extra subprocess suite is added.

HTTP scope: under [ADR-0005](../adr/0005-http-host.md), an allowed HTTP caller is
trusted as the single operator (including operator-managed proxy authentication
or private network access). Its explicit send `permissionMode` is treated as a user
selection. The Host does not prove a browser click or distinguish that trusted
caller's custom HTTP request from the UI. This change adds no approval service,
identity system or protection against a hostile operator/administrator. In contrast,
assistant-writable history is never accepted as authority to elevate a grant.

#1159: User-facing settings and messages consistently use Assistant (비서); provider names remain Codex and GitHub Copilot. Existing Settings components are reused.

Verification captures: [1440px English Light](assets/editor-1159/ai-1440-light-en.png), [640px Korean Dark](assets/editor-1159/ai-640-dark-ko.png).

`litzio assistant configure` validation errors name the invalid field and its allowed values or reason, including provider model/effort catalog restrictions. Validation rules are unchanged.

## Terminology alignment (#1168 PR A)

The [terminology glossary](../contributing/terminology.md) defines Assistant, AI provider and Permission mode. Current code/API/CLI names remain unchanged pending PR B. UI uses Background service (daemon in the status title), while CLI and documentation retain daemon. Settings use the existing SettingsSelect, native hover and conversation Tooltip without a UI pattern exception. Permission descriptions distinguish sandboxed Codex tools from Copilot permission mediation and inherited preauthorizations. Unused disabled-assistant locale declarations were removed; availability errors retain their actual cause.

Verification (2026-11-04): persistent Chrome `pnpm browser:test assistant --screenshots` passed, along with boundaries/docs checks, full typecheck, Editor tests (411 passed, one skipped) and build. Fake providers verify interface behavior without live model calls. Visual review: [1440px English](assets/terminology-1168/settings-1440-en.png), [640px Korean dark](assets/terminology-1168/settings-640-ko-dark.png), [640px permission control](assets/terminology-1168/permissions-640-ko-dark.png). Existing layout and overflow assertions remain intact.

## Conversation Host selection (#1174 PR4)

The shell selects the Host before mounting a new conversation surface. Once initial connection
observations settle, one connected candidate is selected directly, even if more Hosts are registered.
Several connected candidates open the existing Dialog with one Button per registered Host.
Each row uses the shared HostStatus dot and localized state name. Unreachable/connecting
Hosts remain listed but disabled; the focusable tooltip wrapper explains why they cannot start
a conversation. Connection changes never retarget an existing conversation. Choosing
another Host requires New conversation; the selector cannot retarget an existing conversation.
The conversation context always displays its fixed Host label. Its tooltip explains that files
and AI run in the target Host's OS-account context.

The panel is keyed by Host and uses that Host's bound client for settings/catalog/history,
references and execution. Active tabs and the Explorer visibility filter cannot change it.
Only a document from the same Host is included in the current-document context. Each Host’s
Explorer refuses adding a reference to a conversation fixed to another Host. Each queued
Explorer reference carries its Host ID; a panel accepts only its own Host and acknowledges
consumption so remounting or choosing a new conversation cannot replay the request. A fresh Host
selection clears that Host's last-conversation shortcut before creating the new surface;
the server's history is preserved. New conversation remains available after connection/setup
failure, while pending or active execution still prevents it.

Common Dialog/Button/Tooltip and existing panel behavior are reused. `pnpm browser:test multi-host`
checks disabled-unreachable selection and its tooltip, single-available-candidate bypass, visible
fixed Host and remote settings routing after local tab/filter changes
using fixture responses; it performs no real AI call. Settings and registration UI integration
remain PR3b's responsibility; remote panels do not dispatch the local Settings shortcut.

## Plugin stage 1 (ADR-0020)

Owner-initiated stage 1 provides [the shared plugin management contract](plugin-stage1-v1.md). Management is a separate Codex tool without per-call confirmation. Its action, target plugin ID and success/failure appear in the existing conversation tool activity and result, without settings values or secrets. `reload` uses the same Host operation as CLI. Display tools remain restricted to their existing fields. Plugin execution belongs to the target Host; Secret values are supplied only through the settings UI and passed privately to the target plugin runtime; assistant management cannot input or retrieve them. View runtime contributions remain unsupported.

K1 플러그인 파일 작업은 Codex dynamic tool `plugin_jobs`로 SDK 공용 start/status/stop/result/list를 제공한다([계약](plugin-stage1-v1.md#k1-파일-작업)). 건별 승인은 없고 turn의 기존 tool 활동에 작업·성공/실패·결과가 남는다. 쓰기 모드와 열린 폴더 범위, 대상 Host 및 응답 상실 뒤 같은 ID 조회/no replay는 유지한다. 이 추가는 Copilot custom dynamic-tool 공급을 구현한 증거가 아니다.

### 플러그인 제작 문맥

Codex의 Host 플러그인 관리 도구는 `scaffold`와 `validate`를 포함한다. 각 turn에 번들 제작 스킬을 함께 제공하며 별도 설치 없이 제작 요청에서 사용한다. register 활동은 실제 manifest ID를 기록한다. 관리별 승인은 없으며 설정값·secret은 활동에 기록하지 않는다. 현재 SDK 규격과 정적 검증 한계·생성/수정 후 reload 절차는 [플러그인 1단계 계약](plugin-stage1-v1.md#비서-제작-키트)을 따른다.

## Model input and visible history (#1270)

Both providers carry the exact user message in the structured Litzio context. File/document paths, selected skill references, plugin authoring instructions and Generate view catalog/correction context are model input only. Live and resumed conversation API user items restore only the original message and reference chips, including when provider history flattens text inputs. Internal instruction bodies are never conversation bubbles. Generate view correction continues to use the existing short correction status. Provider-owned transcripts retain model inputs; Litzio does not copy them into its conversation index. No migration or historical-format compatibility is provided.

### Dynamic view material snapshots (D4)

The app supplies its registered Host identity and opaque Root IDs from existing folder listings. The Host recomputes each ID from filesystem identity and checks the existing opened-folder boundary before reading attached saved files. These bytes and completed public tool results are bounded read-only context, separate from the human transcript. Unsaved editor content is not sent. Corrections retain the initial snapshot and selected model. Cards, document views and plugin screens share provenance and complete-row inspection; source opening rechecks Root identity before using the existing document-open path and its unsaved-work protection. Display identities are not authentication or factual verification.

Ordinary attachment and tool-result delivery does not depend on optional dynamic-view text capture. Codex localImage and Copilot path references are preserved for images. Capture failures are described separately as unavailable view context while ordinary sends and completed reads keep their original results. Generate/propose still reject unsupported or oversized text snapshots explicitly; view limits never become ordinary document-read limits.
