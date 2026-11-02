# Plugin UI contributions v1

- Status: Implemented
- Complete Docling UI boundary verified: 2026-11-01 (#869: settings/file-action/activation-view migration, unchanged conversion and comparison browser assertions at 1440/640px, English Light/Korean Dark).
- Last verified: 2026-10-31 (#857; shared Host, boundary, activation and browser checks; packaged Desktop runs in required CI).
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
| `Input`, `Dialog`, button variant | Existing shell controls and modal focus/portal behavior, with plugin-owned content. |
| `pickFile`, `openExternalLink` | Existing Host PDF picker and external-link opener. The plugin supplies labels and completion action. |
| `requestJson` | Same-origin Host method/body transport; shares Root checks and abort/rejection on detach. |
| `setBusy`, `notify` | Activation-scoped file-action busy state and shared notifications, including reveal action. |
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
keeping the order before Settings. Its comparison picker, titles, stale-map
warnings and #815 fixed Read/bidirectional matching remain unchanged.

A UI listing may include registration `features` booleans. Changing them detaches
and reactivates only that plugin under the same disposal and retained-tab rules.
Shell-owned file/folder pickers share their originating activation's abort signal.
Detachment closes them, discards selected paths and pending picker callbacks,
and returns focus to a connected opener or the existing sidebar toggle. A late
picker completion cannot invoke a detached activation. This does not cancel
accepted worker requests or close retained contributed tabs.
Docling filters its conversion commands, PDF actions, settings/dialog and comparison
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
falls back to Appearance when its contributed category disappears. File actions
are filtered by declared extension and respect activation busy state.

Optional `jobRoute: "api/<name>"` declares a Host job snapshot to observe before
UI assets finish loading. The loader retains completion only after observing a
running job. It hands the current read to the activated view, so a held initial
status cannot be bypassed by a second read or prematurely enable Start. Polling
after activation is plugin-owned. Failed reads retry only GET; no automatic POST
or startup restoration is introduced. Observation stops on detach/failure/handoff.

Settings plugin management, official plugin installation/update/removal, a general
plugin OS sandbox and daemon remain outside these changes. Docling remains bundled until its official installation flow exists.
No new Core semantics or semantic CLI command is introduced. Existing headless
conversion and shared Host registration APIs remain available without a view.

#900 composes Docling's review panel entirely inside its plugin using existing
`readJson`/`requestJson`, controls and reading-layout callbacks. Original-ref
selection and measured-block highlighting need no new Host UI contribution point.
C1 Host operations own decisions and regeneration; the plugin rereads the pair
before completing approval/undo. Recreated Docling comparison views reread the
current generation rather than treating retained shell data as current. Error
responses after publication and failed refresh reads trigger GET-only reconciliation
of the comparison and proposals; no approval/undo is replayed. Review feature changes use the same activation
lifecycle as conversion/comparison. No Editor internal import or CLI is added.

## Verification

`ai-agent` (#880) verifies the contributed status-only Settings section at 1440px
English Light and 640px Korean Dark, matching Docling's existing Settings geometry.
It uses a synthetic status response without a model/account call, and verifies
that disabling the real bundled plugin removes its category/service while the
same ordinary document DOM and unsaved draft remain editable. Optional
`--screenshots` captures both sections for manual alignment/wrapping/theme review.
The status shows adapter, executable/login availability and login requirement;
there are no provider, credential, permission or user-instruction controls.

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
