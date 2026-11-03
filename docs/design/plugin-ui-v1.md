# Plugin UI contributions v1

- Status: Implemented
- Complete Docling UI boundary verified: 2026-11-01 (#869: settings/file-action/activation-view migration, unchanged conversion and comparison browser assertions at 1440/640px, English Light/Korean Dark).
- Last verified: 2026-11-03 (#1033; Host settings/menu integration, targeted browser checks, typecheck/build and captures; packaged Desktop runs in required CI).
- Authority: [ADR-0012](../adr/0012-plugin-runtime-and-ui-contributions.md), [Discussion #767](https://github.com/litzio/litzio/discussions/767) and [brand-neutral Host API decision #856](https://github.com/litzio/litzio/discussions/856).

Brand defaults and packager overrides follow [the branding guide](../guides/branding.md) (#859). Product identity is separate from the fixed internal Host API; earlier verification records do not establish a migration from old Beta builds.

## Manifest and assets

The brand-independent `@litzio/plugin-api` contract owns the identifiers in
`src/config.ts`: UI API 1, React major 19, `/api/ui-plugins`, `ui.mjs`, `ui.css`.
These are protocol identifiers, independent of a packager's product name.
The #858 internal rename places this contract under `@litzio/plugin-api`; the
neutral manifest fields, API numbers, routes and asset names keep their values.
Product identifiers/folders are not migrated.

The [shared installation manifest](plugin-runtime-v1.md) may contain
`ui: { api: 1, reactMajor: 19, script: "ui.mjs", style: "ui.css" }`.
Style is optional. A UI-only plugin may omit both worker fields. When present,
the worker pair retains its own API 1 validation. Registration checks compatibility
before copying any code. HTTP Root checks cover the source manifest and every
declared file, including real-path/symlink resolution. The immutable installation
revision hashes the validated manifest plus worker/UI hashes; request admission
still pins worker bytes independently. Installation is trusted local code, without
download, marketplace or an approval UI.

`GET /api/ui-plugins` returns enabled `{ id, revision, ui }` records without local
installation paths. `?id=…&revision=…&asset=ui.mjs` (or `ui.css`) serves only the
currently enabled revision's declared, hash-checked bytes. Disabled, obsolete,
undeclared, traversing, missing or changed assets are refused. Responses use the
proper JS/CSS MIME, `nosniff` and `Cache-Control: no-store`. Vite, HTTP serve and
the in-process Desktop protocol use the same handler. Production CSP remains
`script-src 'self'`; no eval, global React bridge, remote URL or Desktop TCP
listener is added. Discovery seeds the bundled Docling installation only if absent;
explicit disable and pinned registrations survive later discovery/app updates.

## Renderer and API surface

Settings contribution `label` and `description`, like command labels, are
untranslated message keys. The shell translates them at render time; plugin
view content calls `host.text` during render. #931 fixes AI-agent activation in
Korean followed by English: pretranslating metadata froze the Korean text and
caused double translation. Docling already follows this convention.

The UI ESM exports `activate(host)` and returns commands, sidebar actions, tab
kinds, optional settings sections/file actions/activation view and a mandatory `dispose()`. The build wraps a CommonJS bundle in a lexical
factory whose two external imports bind to **the exact Host React and JSX runtime
objects**. Nothing evaluates a string or loads a second React. Both registration
and Editor activation reject a different UI API or React major before requesting
assets. API 1 requires React 19; the Host supplies its installed minor/patch.
Changing major requires a new compatibility decision/API. This is verified by
actual plugin hooks and the production renderer, not just a version string.

| Supplied API | Purpose / boundary |
| --- | --- |
| `api`, `React`, `jsx` | Version and renderer instance injection. |
| `ReadingSurface`, `Button` | Fixed Read mode with public Core document/path, neutral block/list positions and selection keys; shared small ghost control. No editor DOM/state/commands. |
| `text`, `imageUrl` | Current translation and existing document-relative media route. |
| `readJson` | GET-only same-origin `/api/<route>` with Host Root checks; aborted/rejected on detach. |
| `pickFolder`, `openTab` | Shared folder picker and plugin-scoped shell tab navigation. |
| `SettingsRow`, `SettingsSwitch`, `SettingsSelect`, `SettingsInput`, `SettingsAction` | Complete Host settings rows; label, description and control alignment are shared with built-in Settings. Caller owns values and persistence. |
| `Menu` | Declarative action items rendered by the existing Host DropdownMenu, including dismissal and focus return. |
| `Input`, `Dialog`, button variant | Existing shell controls and modal focus/portal behavior, with plugin-owned content. |
| `pickFile`, `openExternalLink` | Existing Host PDF picker and external-link opener. The plugin supplies labels and completion action. |
| `requestJson` | Same-origin Host method/body transport; shares Root checks and abort/rejection on detach. |
| `setBusy`, `notify` | Activation-scoped file-action busy state and shared notifications, including reveal action and optional translated `actionLabel`. |
| `initialJob`, `initialJobRead` | Handoff from the manifest-declared `jobRoute` observation while assets load. |
| `features` | Registration feature snapshot; changes use existing detach/reactivate handling. |
| `openSettings`, `openDocument`, `openFolder` | Plugin-scoped Settings navigation, ordinary editor and Explorer opening. No editor state is exposed. |

The generic contribution shapes contain no AI provider, document mutation or
editor engine. #880's default-included AI plugin contributes an ordinary Settings
section through this boundary; its Host service is documented in
[the runtime contract](plugin-runtime-v1.md#ai-task-service-880). Plugin source
and erased type imports are checked with the existing Babel parser, and the
transitive esbuild graph rejects Editor/Tiptap/ProseMirror/renderer internals.
Core is used only through its public exports. The parser is a build-only dependency.

## Contributions, lifetime and failures

The Editor observes registration with sequential 500ms reads. Each plugin loads
independently; a slow/broken one does not block another. Identical observations
preserve all activations. A changed/removed plugin first loses commands/sidebar
entries and unmounts its views, then calls its disposer and removes its stylesheet.
Other plugins and ordinary editing sessions keep their mounted identities. A
late load cannot activate a detached revision. Detached Host methods reject use;
pending supplied reads are aborted. Plugin actions/open failures and invalid
activation results are contained, and a per-tab React error boundary contains
render/lifecycle exceptions. Errors appear in their tab or shared notification
center. Ordinary documents keep their unsaved input and remain editable.

Commands live in Command Center; sidebar actions use the existing expanded
Explorer footer before Settings; tab kinds live in the existing two-group shell.
Shell-owned tab identity, kind, path, data snapshot and label remain when disabled.
The disabled tab can be moved or closed normally and has no Save/recovery session.
Re-registering reconstructs the view in the same tab; view-local selection and
scroll reset. Snapshot data is retained, not silently reread. Contributed tabs
are not restored at startup. #871 changes Docling's footer entry to its dashboard,
keeping the order before Settings. #995 adds the separate Docling Page review
tab kind using the same openTab/TabKind API. Folder-title disambiguation compares
peers within the same plugin and kind, so two views of one result do not expand
both titles to the full absolute path; dashboard result menus and comparison
toolbars open it. Docling itself rereads all mounted views of the changed folder
after a correction; no generic cross-plugin event API is added. Its comparison picker, titles, stale-map
warnings and #815 fixed Read/bidirectional matching remain unchanged.

A UI listing may include registration `features` booleans. Changing them detaches
and reactivates only that plugin under the same disposal and retained-tab rules.
Shell-owned file/folder pickers share their originating activation's abort signal.
Detachment closes them, discards selected paths and pending picker callbacks,
and returns focus to a connected opener or the existing sidebar toggle. A late
picker completion cannot invoke a detached activation. This does not cancel
accepted worker requests or close retained contributed tabs.
Docling keeps its Settings contribution reachable for feature selection (#932),
including when conversion is off. It filters conversion commands, PDF actions,
server controls/dialog and comparison
tab kind by those flags, retaining the dashboard. A comparison is disabled while
its tab kind is absent and restores its original snapshot on re-enabling.

Native ESM records **cannot be unloaded**. Same-content re-registration uses the
same revision URL/module record but invokes a fresh activation. Different content
revisions retain their evaluated modules until the window closes; restarting the
window is the way to reclaim these records. Disposers must release timers,
listeners and other activation resources; views release their React resources on
unmount. Docling's existing observer/frame cleanup is retained. This is a trusted
dependency/failure boundary, not a sandbox for infinite loops, arbitrary global
DOM/CSS mutation, uncaught asynchronous plugin code or resource exhaustion.
Detachment never cancels an accepted worker or deletes its receipts.

#869 moves Docling's settings category, PDF file action, polling, conversion dialog
and completion/error handling into its plugin. The shell renders generic settings
sections and an activation view using the same controls, geometry, focus return
and notification center. Disable unmounts those views before disposal; settings
returns to the Plugins list when its registration disappears. File actions
are filtered by declared extension and respect activation busy state.

Optional `jobRoute: "api/<name>"` declares a Host job snapshot to observe before
UI assets finish loading. The loader retains completion only after observing a
running job. It hands the current read to the activated view, so a held initial
status cannot be bypassed by a second read or prematurely enable Start. Polling
after activation is plugin-owned. Failed reads retry only GET; no automatic POST
or startup restoration is introduced. Observation stops on detach/failure/handoff.

Official plugin installation/update/removal, a general
plugin OS sandbox and daemon remain outside these changes. Docling remains bundled until its official installation flow exists.
No new Core semantics or semantic CLI command is introduced. Existing headless
conversion and shared Host registration APIs remain available without a view.

#900 composes Docling's review panel entirely inside its plugin using existing
`readJson`/`requestJson`, controls and reading-layout callbacks. Original-ref
selection and measured-block highlighting need no new Host UI contribution point.
C1 Host operations own decisions and regeneration; the plugin rereads the pair
before completing approval/undo. Recreated Docling comparison views reread the
current generation rather than treating retained shell data as current. Error
responses after publication and failed refresh reads trigger GET-only reconciliation.
Docling's document recovery is separate from proposal polling: three total reads
with one-second retry intervals, then a terminal notice and manual Reload comparison.
Unmount cancels waits; no approval/undo is replayed. Review feature changes use the same activation
lifecycle as conversion/comparison. No Editor internal import or CLI is added.

## Verification

`ai-agent` (#931) verifies the contributed Settings section at 1440px
English Light and 640px Korean Dark, matching Docling's existing Settings geometry.
It uses synthetic settings/model/diagnostics responses without a model/account call, and verifies
that disabling the real bundled plugin removes its category/service while the
same ordinary document DOM and unsaved draft remain editable. Optional
`--screenshots` captures both sections for manual alignment/wrapping/theme review.
It also checks Korean activation followed by English, model search/efforts,
diagnostics, enablement and re-entry. The current settings contract is
[Main agent connection and settings](main-agent-v1.md); credentials and user
instruction editing are not exposed. The following captures record #880's
earlier status-only view.

Self-reviewed representative captures: [1440px English Light](assets/ai-agent-880/ai-1440-light-en.png)
and [640px Korean Dark](assets/ai-agent-880/ai-640-dark-ko.png). The paired Docling
reference captures are reproducible with the same scenario; alignment, spacing,
clipping and Korean wrapping were reviewed at both widths.

`plugin-ui` checks live commands/sidebar/tab activation, injected React hooks,
same-module reuse, disposal/style removal, retained tabs, render/load/API failures,
no page navigation and the exact ordinary document DOM/unsaved input across faults.
`docling-compare` keeps the #815 selection/read-only regressions and 1440/640px
English Light/Korean Dark capture path. Shared tests verify actual Desktop and
HTTP asset routes/CSP, hash/path/disable/revision refusal, invalid registration,
late-load detachment, independent activations and runtime/type import boundaries.
Packaged Desktop's Docling smoke also opens the dynamically loaded comparison
and exercises disable/re-register under its real CSP. Real Docling service fidelity
remains the separate [manual check](../test/README.md#docling-worker-runtime-853).

## Named notification actions (#942)

`UiNotice.actionLabel?: string` names the single existing `reveal` action. Plugins
pass a `host.text`-translated label. Omission retains Go to problem and existing
notification behavior. This additive optional field does not change the UI API
version. There are no multiple actions or plugin-provided notification renderers.
A named action unfolds once when its notice arrives, without moving focus, and
announces its message/action politely, including errors. Existing unnamed errors
retain their alert semantics. Docling owns its five-second start/concurrency timer
and persistent completion/failure notices; see [conversion lifecycle](docling-conversion-v1.md#app-pdf-conversion-797).

During feature-driven UI reactivation, Settings retains its selected plugin category
while the Host still lists that UI registration. A missing contribution alone is
not proof of removal. Settings confirms absence through the existing registration
GET before returning to Plugins; failed reads preserve the selection. Actual
unregistration/disable still selects Plugins (#1007).

## Host-owned plugin settings (#947)

Settings includes a built-in Plugins category, independent of contributed settings.
Each plugin occupies one Host SettingsSwitch row: readable name (Docling / localized
AI agent for bundled plugins, otherwise the plugin ID), semver version and
Enabled/Off/Error on the left; a ghost gear button and switch at the right edge.
The current manifest has no display-name field. Full revision, installation path,
default-match status and errors remain accessible on information-button hover/focus.
The gear is named “<name> settings”, disabled with an explanatory tooltip when off.
While UI contributions load, the row shows Loading and disables the gear. A plugin
with loaded contributions but no settings can still open its information screen.

The gear opens one plugin detail screen, including plugins without contributed
settings. Host owns Back to plugins, the plugin heading, all contributed settings,
then Information (version, short revision with full title, path and default match)
using Host SettingsRow labels and muted supplementary values. Back uses a left arrow
ghost button aligned to the title edge. Bundled plugins have an App default row
with a Register again action; matching revisions disable it with a reason tooltip.
Disabled gears retain the same borderless ghost appearance. Cancellation sends no request;
confirmation calls the existing Host registration path. Back restores focus to the gear.
No separate Settings or registration action rows appear in the inventory.

Disabling uses DELETE; enabling uses PATCH and preserves the pinned revision,
directory and feature flags. Errors do not claim successful activation. Direct
openSettings entry still works. Feature-driven reactivation preserves the selected
plugin while installed/enabled; actual disable returns to the list. SettingsRow,
SettingsSwitch, ghost Button and Tooltip are reused without a new common component
or public Plugin API. Document semantics are unchanged; no semantic CLI is needed.

`plugin-settings` verifies cancellation, confirmation and the real Host POST/GET,
with 1440px English Light and 640px Korean Dark captures including long paths.

Self-reviewed captures: [1440px English Light](assets/plugin-settings-947/plugins-1440.png),
[640px Korean Dark](assets/plugin-settings-947/plugins-640-dark-ko.png),
[640px scrolled details](assets/plugin-settings-947/plugins-640-dark-ko-details.png)
and [confirmation](assets/plugin-settings-947/confirm-640-dark-ko.png).
Paths use a disposable test store; the mismatching revision is synthetic while
confirmation and the resulting inventory use the actual Host.

## Settings task host (#1032)

Settings contributions now render inside the Host-owned task tab, sharing its
heading, category navigation, scroll and content column. `openSettings` keeps the
same API and selects the existing Settings tab and requested category. Tab switches
keep the mounted contribution and its local draft; closing unmounts it. Like
contributed task tabs, Settings is absent from startup restoration and document
Save/recovery. Registration loss returns to the Plugins list. [Lifecycle, keyboard and captures](editor-ux-shell-v1.md#settings-task-tab-1032).

## Host settings rows and declarative menus (#1033)

The injected components reuse the built-in Settings row, Input, Button and native
select/checkbox keyboard behavior. Row labels preserve heading navigation as well
as the native label/control association. `SettingsSwitch` is a labeled native checkbox
with switch semantics and Host styling; it is only exposed as a complete settings
row, not a general Toggle. Settings screens compose these rows inside the existing
Host content column. Custom content (for example accent swatches) uses `SettingsRow`.

- Row: `label`, optional `description`, `children`, `testId`.
- Switch: row metadata plus `checked`, `onChange(boolean)`, optional `disabled`.
- Select: row metadata plus `value`, `options: { value, label, lang? }[]` (preserving language-option pronunciation),
  `onChange(string)`, optional `disabled`.
- Input: row metadata plus `value`, `onChange(string)`, optional `onBlur`,
  `onEnter`, `disabled`, `invalid`, `describedBy`. Text remains caller-controlled.
- Action: row metadata plus `actionLabel`, `run`, optional `disabled`, `variant` (secondary/default).
  Switch/Select/Input/Action do not accept custom children.
- Menu: accessible trigger `label` and `items`. Each item has `id`, `label`,
  `run(returnFocus)` and optional `disabled`, `danger`, `description`.
  `returnFocus` is the Host trigger, which remains mounted after the menu closes;
  actions opening a picker/dialog pass it on as their return target. Description preserves
  unavailable reasons and Docling review status without exposing menu primitives.
  The Host owns the compact ellipsis trigger, portal, viewport fitting, keyboard
  dismissal and focus restoration. No custom trigger, Popover or generic Toggle
  is public. Labels/descriptions are translated by the caller with `host.text`.

AI enablement still saves immediately using stored defaults; model, effort and
language drafts still require Save. Docling feature switches save immediately,
and its server address still saves on field exit; Enter/Check connection persist
before checking. Built-in preferences retain their current device persistence.
Docling result menus retain page review, document/folder opening, review start /
cancel, retry and uncertain-record clearing with their existing enablement rules.
Review status, execution metadata, summary, counts and errors accompany Run review
as its description; opening the menu observes the existing mounted review state.
These are UI contributions, with no Core semantics or CLI document operation.


Verification: Editor tests (419), workspace typecheck, Editor build, documentation,
import-boundary and token checks; targeted persistent Chrome scenarios
`ai-agent`, `docling-server`, `docling-dashboard`, `docling-review`,
`docling-review-recovery`, `docling-review-retry`, `layout-rules`, `quiet-document`,
`ui-language` (including the existing Korean settings-heading assertion).
The menu Retry → Cancel focus loss was reproduced before the trigger handoff fix;
the same action then returned focus to the mounted trigger. The existing dashboard
scenario retains this regression. Feature reactivation waits for actual control
detachment, without retries, longer timeouts or weaker assertions.

Manual captures: Windows persistent Chrome, 100% zoom, 1440×1000 English Light /
640×1000 Korean Dark. Settings Before uses the base implementation; Menu Before
rebuilds the base Dashboard/ReviewPanel/CSS against the same Host, then restores
the implementation. Menus show a completed synthetic result; elapsed times and
other scratch receipt counts differ between runs. Server addresses reflect each
scratch fixture, not a live service. Only representative PNGs are
kept; builds, traces, test stores and generated logs remain uncommitted.

| Surface | 1440px Before / After | 640px Korean Dark Before / After |
| --- | --- | --- |
| AI settings | [Before](assets/host-settings-1033/before-ai-1440-light-en.png) / [After](assets/host-settings-1033/after-ai-1440-light-en.png) | [Before](assets/host-settings-1033/before-ai-640-dark-ko.png) / [After](assets/host-settings-1033/after-ai-640-dark-ko.png) |
| Docling settings | [Before](assets/host-settings-1033/before-docling-1440-light-en.png) / [After](assets/host-settings-1033/after-docling-1440-light-en.png) | [Before](assets/host-settings-1033/before-docling-640-dark-ko.png) / [After](assets/host-settings-1033/after-docling-640-dark-ko.png) |
| Result menu | [Before](assets/host-settings-1033/before-menu-1440.png) / [After](assets/host-settings-1033/after-menu-1440.png) | [Before](assets/host-settings-1033/before-menu-640.png) / [After](assets/host-settings-1033/after-menu-640.png) |

Built-in settings: [1440px](assets/host-settings-1033/after-appearance-1440.png) /
[640px](assets/host-settings-1033/after-appearance-640.png).
Narrow content remains reachable through the Host scroll:
[AI lower rows](assets/host-settings-1033/after-ai-640-scrolled.png) /
[Docling address and action](assets/host-settings-1033/after-docling-640-scrolled.png).
Inspection checked row centers, control text padding, viewport/menu fitting,
Korean word wrapping and scroll reachability against the built-in Settings pattern.
Accent swatches retain custom content in SettingsRow; task-specific model cards,
diagnostics and review state are caller-owned. No generic Toggle/Popover, theme
state/persistence or AI service API is added.


Review follow-up (#1070): SettingsSelect explicitly uses the existing 14px/20px
UI control tokens. The AI plugin's native provider-button disabled/focus styles
are scoped to that button and do not override Host Button/SettingsAction states.
The 1440px English Light and 640px Korean Dark Appearance captures above were
refreshed after confirming that selected-value text matches the row labels.
No public props or permanent tests were added.

## Plugin management verification (#1007)

Existing plugin-settings and plugin-ui scenarios cover details on hover/keyboard
focus, disable/enable with the same pinned installation, restored contributions,
list → plugin settings → list, and the retained #947 default-registration dialog.
Host tests extend the existing disable case with same-revision reactivation.
No new scenario or exhaustive cross-product is added. Other settings callers use
the same list entry; their feature and draft assertions remain intact.

Manual review uses 1440px English Light and 640px Korean Dark, matching the
built-in settings rows. Before/After evidence:
[1440 Before](assets/plugin-settings-1007/before-1440.png) /
[After](assets/plugin-settings-1007/after-1440.png),
[640 Before](assets/plugin-settings-1007/before-640-dark-ko.png) /
[After](assets/plugin-settings-1007/after-640-dark-ko.png).

## Plugin row and version follow-up (#1007, #1090)

Bundled manifest version is the app semver from `apps/desktop/package.json` at
build time. Host revision continues to identify manifest/file contents and install
paths and default matching; the displayed version is never a content hash.
Independent plugin version/compatibility/update policy remains #867.

Manual 1440px English Light and 640px Korean Dark review:
[1440 before](assets/plugin-settings-1007/row-before-1440.png) /
[after](assets/plugin-settings-1007/row-after-1440.png),
[640 before](assets/plugin-settings-1007/row-before-640.png) /
[after](assets/plugin-settings-1007/row-after-640.png),
[1440 detail](assets/plugin-settings-1007/row-detail-1440.png) /
[640 detail](assets/plugin-settings-1007/row-detail-640.png).

[1440 information](assets/plugin-settings-1007/row-information-1440.png) /
[640 information](assets/plugin-settings-1007/row-information-640.png).

Inventory refresh correction (#1081, #1093): an open Plugins list previously kept
its initial installation snapshot after external API/CLI re-registration. The
existing UI registry's registration/activation changes now invalidate that snapshot.
Settings tab re-entry, window focus and returning to a visible browser tab also
reread inventory, including plugins without UI contributions. Local switches and
registration retain their immediate refresh. Superseded reads are aborted; no new
polling loop is added. The existing docling-dashboard path requires the externally
re-registered row to be checked, its gear enabled, and contributed settings usable.
