# Editor UX Shell v1 — 검증 이력

- Status: Historical
- Moved: 2026-11-13
- Last verified: 2026-11-13 (원문 이동과 현재 계약 링크 확인; 과거 실험 재실행 없음).
- Authority: 당시 검증 기록. 현재 규칙은 [원래 계약](../design/editor-ux-shell-v1.md)을 따른다.

당시 수치·캡처·실행 범위와 한계를 보존한다. 현재 요구사항이나 현재 기능의 증명이 아니다.

## Previous verification metadata

- Image-link preview verification: 2026-10-29 (#731; [contract and captures](../design/editor-ux-shell-v1.md#relative-image-link-previews-731)).
- Link opening verification: 2026-10-29 (#725; [contract and captures](../design/editor-ux-shell-v1.md#open-ordinary-links-725)).
- Editor groups verification: 2026-10-29 (#488 phase 1; Editor 341 tests, workspace typecheck/build, related browser regressions and [group/visual evidence](../design/editor-ux-shell-v1.md#two-editor-groups-488-phase-1)).
- Tab-row actions update: 2026-10-29 (#695; [current contract and evidence](../design/editor-ux-shell-v1.md#title-strip-and-tab-row-actions-695)).
- Non-overlapping roots verification: 2026-10-29 (#702: Editor 338 unit tests, typecheck/build; persistent Chrome folder-navigation/memory, layout-rules, quiet-document, document-tabs, editor-shell and reveal-folder; [behavior and captures](../design/editor-ux-shell-v1.md#non-overlapping-opened-folders-702)).
- Document scroll verification: 2026-10-29 (#488 phase 0; [container contract and evidence](../design/editor-ux-shell-v1.md#document-scroll-container-488-phase-0)).
- Feature sample verification: 2026-10-28 (#528 Core read-model coverage, canonical CLI check/format, Desktop version unit tests, existing Command center browser entry and manual 1440/640px Korean/English captures; packaged execution deferred to CI).
- Last verified: 2026-10-28 (#637: block Equation editing moves into the document; inline math retains its popover).
- Explorer naming update: 2026-10-29 (#703: Explorer / 탐색기 replaces the Files panel name; [contract and captures](../design/editor-ux-shell-v1.md#explorer-name-703)).
- Collapsed rail update: 2026-10-28 (#671: Files and shared Settings entry; [contract and captures](../design/editor-ux-shell-v1.md#collapsed-rail-files-and-settings-671)).
- Settings entry update: 2026-10-28 (#669: remove the Settings-only document-settings entry; [contract and captures](../design/editor-ux-shell-v1.md#settings-document-entry-removal-669)).
- Brand title-strip update: 2026-10-28 (#647 owner-approved composition; targeted verification recorded in the PR).
- Previous shell verification: 2026-10-27 (#582 / #605: Editor 315 tests, Desktop 48 tests, typecheck/build and targeted persistent-Chrome regressions; [contract and captures](../design/editor-ux-shell-v1.md#sidebar-and-native-title-bar-582--605)).
- Image rename verification: 2026-10-27 (#504: targeted file-actions browser flow; [1440px/640px save-first guidance comparison](../design/editor-ux-shell-v1.md#image-rename-guidance-504)).
- Property Apply verification: 2026-10-27 (#576: shared Ctrl/Cmd+Enter submission, validation/busy guards, IME/modifier exclusions and prose hard-break isolation; Editor tests and targeted Windows Chrome browser regressions, with Apple platform emulation rather than native macOS).
- Property-entry update: 2026-10-27 (#557: shared selection/Enter/double-click and explicit property drafts; see [Continuous editing](../design/document-editing-v1.md#continuous-editing)).
- Command find verification: 2026-10-27 (#556: Editor 295 tests, typecheck/build/docs, command-center/editor-shell/layout-rules/quiet-document/file-preview; [scope and captures](../design/editor-ux-shell-v1.md#action-and-search-scope-556)).
- Document settings verification: 2026-10-27 (#580: inline settings, per-tab expansion, notation previews and existing document operations; [integration, checks and captures](../design/editor-ux-shell-v1.md#document-settings-placement-554)).
- New-document entry verification: 2026-10-27 (#553: Editor 291 tests, workspace typecheck/build/docs; new-document, command-center, folder-navigation, editor-shell, ui-language, layout-rules and quiet-document; [behavior and visual comparison](../design/editor-ux-shell-v1.md#new-document-entry-553)).
- Folder refresh verification: 2026-10-26 (#494: Editor 291 tests, typecheck/build, folder-tree failure guard and folder-navigation/image-assets/command-center/folder-memory/layout-rules/quiet-document; actual menu comparison below).
- Menu verification: 2026-10-26 (#516: action icons/danger tokens, adjacent block movement/Undo/Save→Reload, title/endnote/draft/boundary restrictions, conversions and slash editor focus; [contract and evidence](../design/editor-ux-shell-v1.md#unified-action-menus-516)).
- Body-heading verification: 2026-10-26 (#472: Editor 287/287, typecheck/build, docs check and new-document, structural-block-authoring, document-title, basic-blocks, markdown-input browser regressions; persistent Chrome in the implementation worktree).
- Double-click verification: 2026-10-26 (#470: figure-authoring and equation-insertion browser regressions verify the shared Edit path, focus, draft/history preservation and native Figure-caption word selection).
- Previous verification: 2026-10-27 (#590: internal Outline close button removed; [verification and comparison](../design/editor-ux-shell-v1.md#outline-toggle-only-590)).
- Previous verification: 2026-10-26 (#515 P1/P3 owner review correction: contrast-qualified tab edges, 600 list cue and stable Outline row extent; targeted regressions and [1440/390px comparison](editor-visual-language-history-2026-10-30.md#selection-cue-review-correction-515)).
- Previous verification: 2026-10-26 (#515: owner A1 raised tab groups and background-only current lists; targeted browser regressions, Editor tests/typecheck/build and [1440/390px manual comparison](editor-visual-language-history-2026-10-30.md#selection-expression-verification-515)).
- Previous verification: 2026-10-26 (#496: curated shortcut guide, Windows/macOS binding validity, desktop single-line rows and phone overflow; [verification and Before/After](editor-ux-shell-history-2026-11.md#curated-shortcut-guide-496)).
- Previous verification: 2026-10-26 (#471 and #485 review follow-up after merging master d3cfd58: Editor tests, workspace typecheck, Editor build, command-center/layout-rules/quiet-document/continuous-editing/markdown-input browser regressions, input-rule parity and complete keymap audit; [verification](editor-ux-shell-history-2026-11.md#shortcut-guide-verification-471)).
- Source wrapping verification: 2026-10-26 (#476: Source soft wrapping; Editor tests/typecheck/build, Source/layout/quiet-document browser checks and [1440/375px Before/After](../design/editor-ux-shell-v1.md#source-wrapping-476)).
- Table deletion verification: 2026-10-26 (#474 / PR #486 review: transient table deletion/Undo through MessageArea, including revocation when Source starts; table-authoring, source-view-pending and bilingual cross-reference browser regressions, typecheck/build and [captures](../design/table-interaction-v1.md#table-deletion-notice-verification-474)).
- Previous verification: 2026-10-26 (#473: Display/command-center bibliography connection and conditional References; [verification and product captures](citations-history-2026-11.md#conditional-references-verification-473)).
- Previous verification: 2026-10-26 (Sidebar summary checked against the file-listing contract and implementation; incoming heading links checked; no Editor/browser/Desktop re-execution).

### Read view verification and captures (2026-10-31)

`read-view` covers the mutation boundary and retained drafts/recovery, including a
validation result arriving during Read; it also compares block/text keyboard movement
with Edit and verifies real pointer selection/Copy, previews, Outline, commands,
independent tab/groups, close protection and reopening. The related Source/property,
group, Command Center, text-mode, layout, quiet-document and focus regressions retain
their existing assertions. A 640px English filename regression was caught before
compact segment insets were reduced to the existing navigation-panel spacing.

The paired controls use the same `fields.md`, English/Light, top scroll and persistent
Chrome profile. Read uses applied `reading.md` content with a retained Mermaid draft;
Korean/Dark and split groups are separate states. Alignment, padding, clipping,
Korean UI word boundaries, themes and the same segment pattern in Document navigation
were manually inspected. [Capture conditions and hashes](../design/assets/read-view-849/capture-metadata.json)
record the baseline and source/image hashes; these are visual evidence, not owner approval.

| State | 1440px | 640px |
| --- | --- | --- |
| Previous Edit controls | [Before](../design/assets/read-view-849/before-1440.png) | [Before](../design/assets/read-view-849/before-640.png) |
| Read/Edit/Source controls | [After](../design/assets/read-view-849/after-controls-1440.png) | [After](../design/assets/read-view-849/after-controls-640.png) |
| Read with retained draft | [English Light](../design/assets/read-view-849/after-1440-light-en.png) | [Korean Dark](../design/assets/read-view-849/after-640-dark-ko.png) |
| Independent split groups | [Source / Read](../design/assets/read-view-849/split-1440.png) | Groups merge under the existing minimum-width rule. |

### Group verification and visual evidence

The #718 review follow-up reproduces a first-paragraph selection at the right edge
of the left group, 1440×900 with Explorer and docked Outline open. Before correction,
the group ended at x=711.5 but the 294px toolbar reached x=877.171875; five trailing
buttons failed native `elementFromPoint` hit tests. The same assertion now measures
x=409.5…703.5 and all nine actions are reachable. Tab traverses every action and Enter
opens the final Cross-reference form; pointer activation verifies that same trailing
action and Link. Reference/Link/Citation forms and slash/block menus also assert their
owning group bounds, including keyboard-active menu items. These checks supplement the
existing group/session regression without changing its timeout or retry policy.

Same-state manual [before](../design/assets/editor-groups-488/toolbar-before-1440.png) /
[after](../design/assets/editor-groups-488/toolbar-after-1440.png) captures use head `74cdecda`,
then this correction, the same persistent Windows Chrome/profile, English/light,
1440×900, DPR/zoom 1, bundled Pretendard and the selected `link` in `DC-link voltage`.
The existing 1440/640px single-group comparisons below remain unchanged.
The follow-up reran `quiet-document --screenshots` at both widths and matched those
PNG hashes. `editor-groups`, `link-authoring`, `cross-reference`, `citation-authoring`,
`basic-blocks` and `layout-rules` pass with the shared bounds correction.

`editor-groups` verifies retained editor identity, content/selection/property drafts,
Undo/Redo, independent native scroll, group Save/Source, focused shortcut/Command Center/
Outline, ordinary Open relocation without rereading, Explorer Open to the right,
empty-group/dirty-close guards, narrow merging and navigation-only Reload. A held
Host Open response also verifies that actual focus can change groups during loading;
the immediate focus assertion failed before separating focus from operation guards.
Existing same-tab navigation-memory regression caught a misplaced early return; it
still verifies explicit selection overwrites stale shared memory, without changing
Save or restoration write boundaries. Neither test criterion was relaxed.

Final local `editor-groups` and `quiet-document --screenshots` pass. The related
`document-tabs`, `document-scroll`, `command-center`, `editor-shell`, `source-view`,
`save-session` and `layout-rules` scenarios pass. Temporary local stop-after-first-failure
prevented automatic worker relaunches during diagnosis and is absent from the PR.
No retries or timeout changes were added. Edge and packaged Desktop remain CI-only.

The same-state Quiet Document pairs below use base `7f6ba127803ad456f57b7c2d8688e638cf6040cb`
and this implementation, Vite 127.0.0.1:5294, checkout-owned persistent installed Windows
Chrome, English/light UI, bundled Pretendard loaded, DPR/zoom 1 and 1000px height.
They retain the existing single-group document, panel and interaction state. The
Before/After PNG hashes match at both widths. The
additional 900px-high group captures show two different document scroll positions at
1440px and their lossless single-group merge at 640px; these are feature evidence,
not same-state comparisons. At 1440px with both side panels open, each group measures
471.5px, separated by 1px, and both viewports end at y=900. Their shared message/header
bottom is y=120 in the captured draft-notice state.

| State | Before | After |
| --- | --- | --- |
| Quiet Document, 1440px | [Before](../design/assets/editor-groups-488/before-1440.png) | [After](../design/assets/editor-groups-488/after-1440.png) |
| Quiet Document, 640px | [Before](../design/assets/editor-groups-488/before-640.png) | [After](../design/assets/editor-groups-488/after-640.png) |
| Two groups / narrow merge | — | [1440px split](../design/assets/editor-groups-488/groups-1440.png) · [640px merged](../design/assets/editor-groups-488/groups-640.png) |

### Scroll migration verification

Before is master `a1be38ce063a10bf5068d077e07b8884455967e4`; After is this phase-0 implementation.
The persistent Chrome runner captured the clean Before `tmp/quiet-document/quiet-document.md`,
English, Pretendard loaded, 900px height, at scroll top and 420px, in light/dark themes,
1440/640px widths and all four Sidebar/Outline open/closed combinations. Full 32-pair evidence
is in [the asset directory](../design/assets/document-scroll-488). The final After capture is collected
by the Linux CI geometry matrix because the five local browser runs were already used when
the scrollbar/header completion criteria were extended. Cross-platform rasterization differs;
the unchanged Host's default-locale filename collation also orders the Korean-named fixture
differently on Windows and Linux. These platform differences are not scroll-layout changes;
the geometry assertions verify that the scrollbar begins at the header bottom, ends at the
viewport bottom, and the title-strip border reaches the full window width at both sizes and
all captured states, while the root remains unscrolled. Representative top pairs:

| Theme / width | Sidebar open, Outline open | Sidebar closed, Outline closed |
| --- | --- | --- |
| Light / 1440 | [Before](../design/assets/document-scroll-488/before-light-1440-open-open-top.png) / [After](../design/assets/document-scroll-488/after-light-1440-open-open-top.png) | [Before](../design/assets/document-scroll-488/before-light-1440-closed-closed-top.png) / [After](../design/assets/document-scroll-488/after-light-1440-closed-closed-top.png) |
| Dark / 1440 | [Before](../design/assets/document-scroll-488/before-dark-1440-open-open-top.png) / [After](../design/assets/document-scroll-488/after-dark-1440-open-open-top.png) | [Before](../design/assets/document-scroll-488/before-dark-1440-closed-closed-top.png) / [After](../design/assets/document-scroll-488/after-dark-1440-closed-closed-top.png) |
| Light / 640 | [Before](../design/assets/document-scroll-488/before-light-640-open-open-top.png) / [After](../design/assets/document-scroll-488/after-light-640-open-open-top.png) | [Before](../design/assets/document-scroll-488/before-light-640-closed-closed-top.png) / [After](../design/assets/document-scroll-488/after-light-640-closed-closed-top.png) |
| Dark / 640 | [Before](../design/assets/document-scroll-488/before-dark-640-open-open-top.png) / [After](../design/assets/document-scroll-488/after-dark-640-open-open-top.png) | [Before](../design/assets/document-scroll-488/before-dark-640-closed-closed-top.png) / [After](../design/assets/document-scroll-488/after-dark-640-closed-closed-top.png) |

The screenshots preserve geometry and content placement; they are not byte-identical pixel
assertions. Some header text and dark scrolled document text have different antialiasing under
the container compositor. Existing layout and overlay geometry checks remain authoritative for
their measured contracts; captures are the manual visual evidence.

The final [32-state geometry record](../design/assets/document-scroll-488/geometry.json) and After PNGs
come from [CI run 40778182959](https://github.com/litzio/litzio/actions/runs/40778182959),
product code `93e4b9a36e1de344a3b11a9c5fbcc5096fff7214`, Linux pinned Chromium
154.0.8037.0. All measured states have root scroll 0, root height 900px, a 1px title-strip
bottom border reaching exactly 640/1440px, and a document viewport starting at the measured
header bottom (73/122/130px, depending on width/Sidebar state) and ending at 900px.

Browser assertions migrated without changing their tolerances or retry/timeout/skip policies:

- `document-tabs`: save/read each tab's actual scrollTop while retaining editor identity,
  JSON, selection, draft, Undo and no-load-on-switch assertions.
- `outline`: drive document scrolling and read its end/position from the viewport, using
  `scrollTop + clientHeight >= scrollHeight - 2` for the same 2px end tolerance; retain
  current-item visibility, list scroll, selection and editor-options stability assertions.
- `new-document`: read writing scroll and scroll to the viewport's end; retain the same
  visible caret/last-line end space and exact saved-source checks.
- `save-error`: use viewport scrollTop for offscreen-cell navigation; retain editor/cell
  selection and measured highlight/header geometry checks.
- `ui-language`: compare document viewport position across Settings instead of window position.
- `panel-lists`, `command-center`, `table-authoring`: direct scroll setup at the same target
  positions; retain current target/reveal/editing assertions. Geometry queries in `layout-rules`,
  `new-document` and `table-authoring` now select the active tab's column because hidden tabs
  also own a column. The measured-header clearance calculation now adds the container top
  to its scroll margin: the same header + 32px physical target, at the same 0.5px tolerance.
- `scenarios.spec`, `citations`, `file-preview`, `folder-navigation`, `footnotes`, `layout-rules`,
  `open-files`, `quiet-document`, `recovery`, `source-view` and manual capture sections:
  reset the document viewport instead of the window. Other assertions are unchanged.

The new `document-scroll` boundary scenario checks shell-focus reading keys, native Source
PageDown, wheel/drag edge scrolling, stationary shell chrome, zero window scroll, right-edge
viewport, scrollbar restricted below tabs, full-width title-strip border, and unclipped
full-document print flow. Its measured 32-state matrix also produces the CI captures without
a separate capture-only tour. The existing 4-shard CI suite is the full
regression gate. Local packaged Desktop, install/update/uninstall and Edge/profile probes are
excluded from this task's validation scope.

### File action verification and captures

`pnpm browser:test file-actions --screenshots` uses scratch fixtures and the checkout-owned
persistent Chrome profile. The scenario verifies mouse and keyboard input, native
menu boundaries, collision/reference refusal, editor identity/no reread, Undo/Redo, Save at the new
path, recovery relocation/deletion, active/inactive deletion and adjacent focus. It also checks
existing Figure image URLs and a subsequent real image upload after rename.

Review regressions run actual file operations only in the checkout's OS temporary fixture folder.
Two-window tests hold the other editor's first recovery write until deletion/rename completes,
then require its old-path ticket to be refused. The storage scenario separately verifies that
unrelated tickets and post-operation edits still work. Selected UI captures below retain the
original implementation state; these review corrections do not change menu/dialog presentation.

Captures: Windows Chrome, English UI, 100% zoom, DPR 1, 1440×900 / 640×900, bundled Pretendard.
Before uses master `7e935cf4592ee6a4135fd069a31a638d2a768c7b` Sidebar in this merged worktree (controlled rollback of the file menu); After restores the PR Sidebar in the same state.
1440 uses light OS preference; 640 uses dark OS preference. The default System theme resolves each preference using the current #595 light/dark roles. Full traces and logs stay in
ignored `tmp/file-actions-evidence`; only the selected small captures are retained here.

| Surface | 1440px (light OS) | 640px (dark OS) |
| --- | --- | --- |
| Before: file tree, no product context menu | [Before](../design/assets/file-actions-505/before-1440.png) | [Before](../design/assets/file-actions-505/before-640.png) |
| Context menu | [After](../design/assets/file-actions-505/after-menu-1440.png) | [After](../design/assets/file-actions-505/after-menu-640.png) |
| Delete confirmation | [After](../design/assets/file-actions-505/after-delete-1440.png) | [After](../design/assets/file-actions-505/after-delete-640.png) |
| Rename input | [After](../design/assets/file-actions-505/after-rename-1440.png) | [After](../design/assets/file-actions-505/after-rename-640.png) |


### Historical #554 verification

Local verification: Editor **295/295**, workspace typecheck, Editor build, docs check and
whitespace check passed. Fourteen targeted browser scenarios passed across the integrated run
and focused follow-ups: editor-shell, layout-rules, quiet-document, source-view-pending,
bibliography-connection, cross-reference, outline, folder-navigation, visual-states, open-files,
ui-language, bibliography, citation-authoring and new-document. After integrating #571, the
command-center scenario checks both document-settings aliases, focus return and both width
commands using exact command names; the shell scenario retains its dialog/editor-state checks.
The layout scenario checks 32
English/Korean combinations of 1280/1423/1424/1440px, expanded/collapsed Sidebar and open/closed
Outline (docked from 1424px, overlay below it): 48px TopBar, centered button of at least 160px,
visible controls without overlap, and the folder/shortcut/filename reduction order.

Earlier separate failure: `command-center` timed out opening app Settings after its synthetic
IME sequence (`run('settings')`, then line 413), including on clean master
`34436c7cf0240fd2ebf0dcdaa74b3c5a226f7066` with the same checkout, origin and persistent profile.
PR #571 resolved the test-helper ambiguity: folder paths also match settings, so the helper
selects the exact named command before Enter. Its dedicated settings-path fixture is retained.
No timeout, immediate assertion or IME criterion was weakened. Edge and packaged Desktop run in CI.

Same-state manual comparison (Korean UI, the default technical document, clean loaded state):

| Width | Before: Sidebar Display | After: Document settings | After: shell |
| --- | --- | --- | --- |
| 1440px | [Before](../design/assets/document-settings-554/before-1440.png) | [After](../design/assets/document-settings-554/after-1440.png) | [Shell](../design/assets/document-settings-554/after-shell-1440.png) |
| 390px | [Before](../design/assets/document-settings-554/before-390.png) | [After](../design/assets/document-settings-554/after-390.png) | [Shell](../design/assets/document-settings-554/after-shell-390.png) |

Captures were made through `pnpm browser:test` using this checkout's persistent Chrome profile.
Before uses `ff37a32`; After includes master integration through `a414cb5` (#553/#555/#559/#552/#568/#565), so unrelated merged color and document-type changes are not attributed to #554.
At phone width the former full-screen Sidebar is replaced by the shared viewport-capped modal;
the underlying document remains in place. These images support manual layout review; automated
checks separately assert geometry, operations, availability and focus. Historical Display captures
below retain their original date and behavior.

### Brand title-strip verification and captures (#647)

Scope: existing shell composition only; no command/menu, document semantic operation or CLI
surface. Reuse the configured `brand.icons.png` through the `@brand-icon` Vite asset alias, without duplicating
or redesigning it. Completion requires aligned second rows, icon-only collapsed branding,
preserved keyboard/focus/Files actions and panel behavior, 640px containment, caption
reservation and portal/menu drag boundaries. Related existing browser scenarios carry the
geometry, interaction and accessibility checks; packaged Desktop runs in required CI.

Manual Before/After captures use base `5ecc9a985540a16b298082e7693f66ca67800f17`
and this change in the same worktree, Vite origin `http://127.0.0.1:5277`, installed Windows
Chrome and the checkout-owned persistent profile. Both use `tmp/quiet-document/quiet-document.md`,
English UI with Korean/English document content, bundled Pretendard, 900px height, DPR 1,
zoom 1, scroll 0, blurred focus and pointer outside the document. All fonts/images are loaded.
A temporary capture-only driver ran through `pnpm browser:test desktop-updates --screenshots`;
it is not an automated assertion or a maintained scenario. The full matrix, measurements,
logs and traces remain in ignored `tmp/titlebar-647`; only representative PNG pairs are kept.
At 640px an opened Outline retains its overlay placement below the whole sticky header;
second-row alignment applies to the docked panel. Desktop captures simulate 138px caption
reservation; they do not show or prove native caption-button rendering or native dragging.

| State | 1440px Before / After | 640px Before / After |
| --- | --- | --- |
| Both open, Light | [Before](../design/assets/brand-titlebar-647/before-1440-light-both.png) / [After](../design/assets/brand-titlebar-647/after-1440-light-both.png) | [Before](../design/assets/brand-titlebar-647/before-640-light-both.png) / [After](../design/assets/brand-titlebar-647/after-640-light-both.png) |
| Files collapsed, Dark | [Before](../design/assets/brand-titlebar-647/before-1440-dark-left-collapsed.png) / [After](../design/assets/brand-titlebar-647/after-1440-dark-left-collapsed.png) | [Before](../design/assets/brand-titlebar-647/before-640-dark-left-collapsed.png) / [After](../design/assets/brand-titlebar-647/after-640-dark-left-collapsed.png) |
| Outline closed, Light | [Before](../design/assets/brand-titlebar-647/before-1440-light-right-closed.png) / [After](../design/assets/brand-titlebar-647/after-1440-light-right-closed.png) | [Before](../design/assets/brand-titlebar-647/before-640-light-right-closed.png) / [After](../design/assets/brand-titlebar-647/after-640-light-right-closed.png) |
| Desktop reservation, Dark | [Before](../design/assets/brand-titlebar-647/before-1440-dark-desktop.png) / [After](../design/assets/brand-titlebar-647/after-1440-dark-desktop.png) | [Before](../design/assets/brand-titlebar-647/before-640-dark-desktop.png) / [After](../design/assets/brand-titlebar-647/after-640-dark-desktop.png) |

#### New document visual comparison

Before is clean base `ff37a32e273dfad90bde84a9c30e2a28ec5e3af3`; After is that base plus #553.
Both use the same checkout-owned persistent headless Windows Chrome profile and Vite origin
`127.0.0.1:5173`, bundled Pretendard, DPR/viewport scale/CSS zoom 1, scroll top, no focused control
and pointer at the top right. A Host start response with no sample/recent/recovery is used for
both. These are manual product captures, separate from automated assertions; the temporary
capture-only walk is removed before commit. Shared Button sizes, spacing and surfaces follow
[Layout Rules](../design/editor-layout-rules-v1.md#controls-and-spacing) and
[Visual Language](../design/editor-visual-language-v1.md); capture procedure follows [Visual change review](../test/README.md#reviewing-a-visual-change). No new token or CSS is needed.

| Language / viewport | Before | After |
| --- | --- | --- |
| English / 1440×900 | [PNG](../design/assets/new-document-553/new-entry-before-en-1440.png) | [PNG](../design/assets/new-document-553/new-entry-after-en-1440.png) |
| English / 390×900 | [PNG](../design/assets/new-document-553/new-entry-before-en-390.png) | [PNG](../design/assets/new-document-553/new-entry-after-en-390.png) |
| Korean / 1440×900 | [PNG](../design/assets/new-document-553/new-entry-before-ko-1440.png) | [PNG](../design/assets/new-document-553/new-entry-after-ko-1440.png) |
| Korean / 390×900 | [PNG](../design/assets/new-document-553/new-entry-before-ko-390.png) | [PNG](../design/assets/new-document-553/new-entry-after-ko-390.png) |

Direct review confirms reachable primary/secondary text actions and readable Korean/English guidance
at both widths, with the existing Sidebar header unchanged. The browser assertions cover the three
entries, Korean/English command aliases, location cancellation, New folder → filename handoff,
Host-normalized Sidebar/destination agreement, filename cancellation and immediate focus, real-file
Save/Reload, and preservation of an existing unsaved tab. The initial chained-dialog attempt failed
the direct filename-focus assertion: the outgoing picker restored focus to the start button.
The handoff now waits for closing completion, suppresses that return only during handoff, and uses
the filename field as explicit initial focus. No timeout, retry or polling allowance was increased.
Windows BadPasswordAttempts was 0 before the first profile launch, 3 at subsequent pre-run checks,
and 5 before the final integrated run; the persistent profile was reused. Traces and capture-only
scripts remain uncommitted. After integrating master `3a8be3e` (#552), Editor 291 tests,
workspace typecheck, Editor build, docs/whitespace and new-document/command-center/layout-rules/
quiet-document passed again. Its docking change leaves the captured 1440/390px states unchanged.
The later master `425eab7` (#494) integration retains the Refresh callback and its shared
folder-creation refresh, alongside New document. Editor tests/typecheck/build/docs are rechecked;
browser integration coverage is left to PR CI because the final local account counter reached 6.
No Edge, packaged Desktop or alternate-profile probe is run locally.

### Navigation list comparison

Actual Windows Chrome 156.0.8078.48 captures use this checkout's persistent profile and
runner-owned Vite origin `127.0.0.1:5173`, English UI, bundled Pretendard after fonts/images
load, DPR/viewport scale/CSS zoom 1, scroll top, blurred controls and pointer outside the
document. Before is product code at `d926c8ad4c9c530b4417997fb46999ce20738dd6`;
After is that HEAD with #613's working changes. Both use the same three-table/three-figure
scratch document, including empty and long captions. Before has only the heading list;
each new list is compared with that baseline. The capture-only runner script is removed;
traces, logs and regenerable full output remain in ignored `tmp/`.

| State | 1440×900 Light | 640×900 Dark |
| --- | --- | --- |
| Before | [PNG](../design/assets/panel-lists-613/before-1440.png) | [PNG](../design/assets/panel-lists-613/before-640.png) |
| Outline | [After](../design/assets/panel-lists-613/after-outline-1440.png) | [After](../design/assets/panel-lists-613/after-outline-640.png) |
| Tables | [After](../design/assets/panel-lists-613/after-tables-1440.png) | [After](../design/assets/panel-lists-613/after-tables-640.png) |
| Figures | [After](../design/assets/panel-lists-613/after-figures-1440.png) | [After](../design/assets/panel-lists-613/after-figures-640.png) |

Direct review confirms the header/drag area remains separate, all segments fit the panel,
and captionless numbers, current-item cues and two-line long captions remain readable in
both modes. Browser tests verify simulated native caption-width reservation and CSS drag
regions; actual native dragging and Windows caption buttons are not browser proof.

## Evidence and history

### Verification record

- Documentation verification: 2026-10-26 (start-screen conditions and Open/New protection compared with App.tsx and the session contract; no new browser execution).
- Outline input verification: 2026-10-25 (#362: retain heading-row identity while preceding text shifts engine positions; navigation, current-section geometry and document semantics unchanged. [Windows measurements and preservation evidence](editor-input-performance-2026-10-25.md)).
- Reference dismissal verification: 2026-10-25 (#427: no-target selection form and unresolved-reference form, Escape/outside pointer dismissal and subsequent slash insertion in cross-reference; Editor 280/280, typecheck/build).
- Result-limit verification: 2026-10-24 (#384 integration decision: first 50 matches, persistent bilingual live counts and query narrowing instead of pages; [new evidence](editor-ux-shell-history-2026-11.md#listed-search-result-limit-follow-up-384)).
- Search review verification: 2026-10-24 (#384: reachable cached listings after parent relisting, bounded/paged 2,000-document search and #397 restored-tab integration; [measurements and regression scope](editor-ux-shell-history-2026-11.md#listed-search-review-follow-up-384)).
- Layout-safe shortcut verification: 2026-10-24 (#381 review follow-up: character matching, guarded opaque-IME fallback, German zoom and French tab-switch preservation; supersedes physical-only matching).
- Two-key shortcut verification: 2026-10-24 (#381 follow-up: headed Chrome/Edge candidate delivery and cancellation; Chrome/Edge product regressions, Electron candidate/action smoke, Editor/Desktop tests and typecheck/build; macOS documentation review only).
- Shortcut verification: 2026-10-24 (#381: Editor tests, Chrome/Edge command-center and link-authoring integration, Electron shortcut smoke, typecheck/build and docs; native browser-chrome verification remains unconfirmed as detailed below).
- Last verified: 2026-10-25 (#425 owner persistence decision: Editor tests/typecheck/build, folder-memory/navigation/command-center/document-tabs/editor-shell/quiet-document; [restoration evidence](editor-ux-shell-history-2026-11.md#section-persistence-decision-and-verification-2026-10-25)).
- Previous verification: 2026-10-25 (#425: collapsible folder sections; Editor tests/typecheck/build, folder-navigation/folder-memory/command-center/editor-shell/layout-rules/ui-language/quiet-document and [desktop/phone captures](editor-ux-shell-history-2026-11.md#section-disclosure-verification-and-captures)).
- Previous verification: 2026-10-24 (#385: Sidebar header entry, Close-only folder menus; folder-navigation browser check, Editor tests/typecheck/build and [same-state desktop/phone evidence](../design/editor-ux-shell-v1.md#sidebar-open-folder-entry-385)).
- Previous verification: 2026-10-24 (#383 review integration: command-center focus on restored tabs and recovery-dialog modality with #391/#392; document-tabs/recovery/command-center browser regressions).
- Listed-document search verification: 2026-10-24 (#384: cached sidebar listings, native admission, path deduplication and new-editor focus; command-center and related browser regressions, Editor tests and typecheck/build; [evidence](editor-ux-shell-history-2026-11.md#listed-document-search-verification-384)).
- Previous verification: 2026-10-24 (#386: immediate command-center search typing and document focus; command-center/editor-shell/document-tabs/ui-language/layout-rules/quiet-document browser regressions, Editor tests and typecheck/build).
- Code/endnote save verification: 2026-10-24 (#393: Core intermediate-snapshot regressions and Editor Save replay with a new endnote, code edit and existing definition edit; no UI change).
- Nested inline verification: 2026-10-24 (#377: Editor slash eligibility tests, Core list/Figure intermediate-footnote regressions, and actual citation-authoring menu/insertion/Save → Reload on all locations below, including a citation-only list item).
- Previous verification: 2026-10-24 (#383: Reload restores document tab paths/order/active identity; recovery priority and explicit startup routing; document-tabs/recovery/recovery-structure browser regressions).
- Previous verification: 2026-10-24 (#367 cross-tab follow-up: explicit same-path Open remembers the active tab's list after another tab writes; tree-only no-write and Reload checks; folder-memory browser regression).
- Previous verification: 2026-10-24 (#367 review follow-up: same-path Close survives late restoration/Reload, tree-only updates do not rewrite paths; folder-memory browser regression).
- Previous verification: 2026-10-24 (#367: folder restoration/Open/Close response-order and Reload checks, unique nested New file/folder destinations; folder-memory browser regression).
- Previous verification: 2026-10-23 (#363 command center; Editor tests, typecheck/build, command-center/editor-shell/document-tabs/ui-language/layout-rules/quiet-document browser checks; [actual captures](editor-ux-shell-history-2026-11.md#command-center-verification-363)).
- Previous verification: 2026-10-23 (#235 [ADR-0009](../adr/0009-multiple-opened-folders.md): several opened folders as separate Sidebar sections, Open adds, per-folder Close, restored paths and outermost-folder location/New; Editor unit tests and stable browser suite).
- Previous verification: 2026-10-22 (#217: all-file Sidebar listing, bounded read-only image preview; Host/Editor/Desktop protocol tests and actual Vite/production HTTP browser regressions).
- Previous verification: 2026-10-20 (#256: bundled Korean/English settings, live language changes and editing preservation; `ui-language` browser scenario and Editor tests).
- Previous verification: 2026-10-19 (#255: document title area, Add a title, fixed title handle and Enter below the title; `document-title` browser scenario).
- Previous verification: 2026-10-19 (#298: the start without a document sits on the canvas with the product mark, apart from the paper; open-files, recovery, document-tabs and the stable suite; same-state captures against `e265e1c`: 1440px [before](../design/assets/start-screen-298/before-1440.png)/[after](../design/assets/start-screen-298/after-1440.png), 375px [before](../design/assets/start-screen-298/before-375.png)/[after](../design/assets/start-screen-298/after-375.png)).
- Previous verification: 2026-10-19 (#321: phone-width sidebar closed without a rail or covering the whole screen, opened from the TopBar; browser checks).
- Previous verification: 2026-10-17 (UX review: location identity, recent folders and unsupported files in Files, overlay sidebar below 640px, Copy path, tooltips, table Edit placement and Source lines; stable browser suite and captures in the [review](editor-ux-review-2026-10-17.md)).
- Previous verification: 2026-10-16 (#296 PR2: shared recovery Settings, start list, matching-document prompt and standing failure surface; real Vite recovery UI checks).
- Previous verification: 2026-10-16 (#204: tab row, active shell and retained sessions; browser checks and user-approved 1440/375px captures in the [review](document-tabs-204-2026-10-16.md)). Previous verification: 2026-10-15 (#281: cross-reference, section-reference, table-authoring, pending-figure, layout-rules and quiet-document browser checks; actual 1440px slash-menu Before/After). Previous verification: 2026-10-15 (#275 Equation/Figure/Table/section-label property-close caret, Apply/typing and insertion/Cancel/Escape browser regressions; ADR-0006 native admission wording compared with code/tests). Previous verification: 2026-10-13 (#176: Files/Display switching, tree/selection/history/draft preservation, File actions and Reload focus, unavailable settings; browser results and actual captures in the [#176 review](editor-shell-176-2026-10-13.md)).

### Section persistence decision and verification (2026-10-25)

The repository owner changed #425 after the initial implementation: remember only root section
collapse across Reload/Desktop restart. The earlier no-section-persistence decision and the
verification records below describe that earlier implementation and remain intact.

The extended folder-memory failed on unmodified head `7a45f2bc0f8bb40751193851d3cd093ccc422fdd`:
`Collapse remembers the root: collapsed preference [], expected [...]` and
`Reload must restore the active document section collapsed`. This test now covers stored root
format, active-document Reload, expand/Reload, Close/reopen, missing/unopened record pruning on
the next action, restoration-only zero writes, delayed-root collapse/expand/Close races, and
the #370 two-tab order including reveal of an already-expanded local section after another tab's
collapse. Original opened-folder memory regressions remain in the same scenario.

After the change, Editor tests pass 280/280 and typecheck/build pass. The final related run covers
folder-memory, command-center, document-tabs and editor-shell (4/4); folder-navigation with
screenshots and quiet-document with actual glyph-font assertions each pass separately (1/1).
The persistence scenarios include both user collapse and user expansion while a later root is
pending, and same-path Close winning over an older restoration. Existing source fixture guards
and expected-error classification are unchanged. Build warnings remain the existing externalized
punycode/large bundle warnings. No platform installer or live Desktop restart is claimed by these
local browser checks; Desktop uses the same origin-specific preference path and required CI.

Real Reload captures: [1440px](../design/assets/sidebar-collapse-425/restored-collapsed-1440.png) and
[375px](../design/assets/sidebar-collapse-425/restored-collapsed-375.png), with
[capture metadata](../design/assets/sidebar-collapse-425/persistence-environment.json). These use capture
HEAD `7a45f2bc0f8bb40751193851d3cd093ccc422fdd` plus this persistence change; source SHA-256
identifies the exact implementation. Same worktree-owned Vite/persistent Windows Chrome, measured
DPR/viewport scale/CSS zoom 1, bundled Pretendard, scroll 0, blurred focus and no dialog/menu.
Direct review confirms the first section remains collapsed after Reload, the other section's
tree remains visible, and names/actions/document geometry match the existing collapsed view.
The earlier disclosure captures and their metadata below remain historical evidence.

The first persistence CI at `e9d58bbdb0626f1c6e481685e6687970dfaa7ed9`
([run 40136117318](https://github.com/litzio/litzio/actions/runs/40136117318)) passed quality,
Desktop/HTTP and browser shard 1/2, including folder-memory; shard 2/2 passed folder-navigation
but failed file-preview's phone archive-row click. Its input-events artifact shows Escape targeting
the still-focused tree row, then focus moving to Expand sidebar: the preview image was visible
before the modal's initial focus, and the sidebar closed too. The unchanged local file-preview
passes. The viewport preview case now explicitly asserts modal focus ownership (within 5 seconds)
before its Escape. This adds a readiness assertion without forcing focus, reopening the sidebar,
changing product behavior or weakening the existing preview/content checks. Capture sources are
unchanged; the new test-only head needs its own final checks and CI, recorded in the PR.

### Section disclosure verification and captures

The clean base's existing folder-navigation and quiet-document checks passed. Before product
edits, the extended folder-navigation failed with `Opened folder section must expose an expanded
toggle button`; command-center stopped at the absent toggle as well. Later expected HTTP failures
were not reached in those early exits. An initial implementation run also exposed a test locator
mistake: modal background controls are excluded from default role queries. Its inspection locator
now includes hidden controls while the center is open; no product assertion/timeout was weakened.

The final folder-navigation checks Enter/Space and Tab/reverse Tab, whole-tree/empty-help hiding,
retained child expansion/current marker/scroll/keyboard stop without Host listing, collapsed New
file/New folder/Close, relisting including the active document, unrelated-root Open/Close, Reload,
and 28px target/long-name geometry at 1440/1024/375px. Folder-memory verifies no preference write
on collapse and preservation through relist; command-center verifies cached-file search without
expansion/Host requests, active-result preservation and different-result reveal. Existing
editor-shell/layout-rules/ui-language also pass. Editor tests: 278/278; typecheck, Editor build,
docs/diff checks pass. The build retains its existing punycode externalization/bundle-size warnings.

Same-state product captures below use base HEAD `108d134a04228001ada41944e41dec8ac2a227b9`.
After is that HEAD plus the implementation, identified by source SHA-256 in
[capture metadata](../design/assets/sidebar-collapse-425/environment.json). All use this worktree's own
Vite and persistent headless Windows Chrome profile. Before uses the runner's default DPR 1 with
no zoom override; After measures DPR/viewport scale/CSS zoom 1. Both wait for fonts; quiet-document
checks actual bundled Pretendard glyph fonts. Files is selected, the sidebar expanded, scroll 0,
focus blurred, pointer at the right edge and no dialog/menu present.

| Width | Before | After, expanded | After, first section collapsed |
| --- | --- | --- | --- |
| 1440×812 | [Before](../design/assets/sidebar-collapse-425/before-1440.png) | [Expanded](../design/assets/sidebar-collapse-425/after-1440.png) | [Collapsed](../design/assets/sidebar-collapse-425/collapsed-1440.png) |
| 375×812 | [Before](../design/assets/sidebar-collapse-425/before-375.png) | [Expanded](../design/assets/sidebar-collapse-425/after-375.png) | [Collapsed](../design/assets/sidebar-collapse-425/collapsed-375.png) |

Direct review: heading/name/action positions and document layout remain aligned. The root icon
becomes a quiet chevron; only the selected section's contents disappear. Other sections move up
naturally, and all three folder actions remain reachable in the full-screen phone sidebar.
The 200px sidebar and wrapped Korean/unbroken names retain their geometry and reachable targets.
These are visual/navigation checks, not new document semantics or platform packaging evidence.

The first full CI at implementation head `6e5bf3f1df5689088efaeb7e635640a20277c092`
([run 40133576414](https://github.com/litzio/litzio/actions/runs/40133576414)) passed quality,
Desktop/HTTP and browser shard 2/2, but shard 1/2 failed in cross-reference: its partial button-name
query also matched the new `Collapse folder cross-reference` control. The unchanged scenario
reproduced that strict-mode ambiguity locally. Scope its existing selection-toolbar action to
that toolbar with the exact accessible name; the same scenario then passes. No product code,
assertion/timeout or capture source changed. The failure remains historical evidence; the new
head requires its own full CI result, recorded in the PR.

### Sidebar entry capture evidence (#385)

Same-worktree real browser Before/After captures, with the sidebar expanded, Files selected and no menu/dialog open:

| State | 1440 × 812 | 375 × 812 (full-screen sidebar) |
| --- | --- | --- |
| No folder | [Before](../design/assets/sidebar-open-folder-385/before-empty-1440.png) / [After](../design/assets/sidebar-open-folder-385/after-empty-1440.png) | [Before](../design/assets/sidebar-open-folder-385/before-empty-375.png) / [After](../design/assets/sidebar-open-folder-385/after-empty-375.png) |
| One folder | [Before](../design/assets/sidebar-open-folder-385/before-one-1440.png) / [After](../design/assets/sidebar-open-folder-385/after-one-1440.png) | [Before](../design/assets/sidebar-open-folder-385/before-one-375.png) / [After](../design/assets/sidebar-open-folder-385/after-one-375.png) |
| Several folders | [Before](../design/assets/sidebar-open-folder-385/before-several-1440.png) / [After](../design/assets/sidebar-open-folder-385/after-several-1440.png) | [Before](../design/assets/sidebar-open-folder-385/before-several-375.png) / [After](../design/assets/sidebar-open-folder-385/after-several-375.png) |

Capture base HEAD: `359b7121e2b910998c89808b3c112c2d16490b06`. After images use that HEAD plus this PR's Sidebar/styles implementation; [capture metadata](../design/assets/sidebar-open-folder-385/environment.json) identifies the exact source hashes and measured After environment. Both use the same checkout-owned Vite origin and persistent headless Windows Chrome profile; no second checkout or temporary profile. The runner's default DPR is 1 with no zoom override. After records measured DPR 1, visual viewport scale 1 and CSS zoom 1; Before used the same unmodified runner configuration. Scroll is 0, pointer at the right edge, focus blurred before capture. Bundled Pretendard fonts are checked by quiet-document's CDP glyph-font assertions; screenshots wait for `document.fonts.ready`.

Direct visual review: the header opener stays beside Collapse, the product name remains readable, and the empty panel loses its duplicate action. Folder headings/tree indentation retain their alignment. At phone width the same header controls remain inside the full-screen sidebar; at 1024px the 200px sidebar's controls remain reachable without overflow. The 28px target, 16px icon and 4px group gap reuse product tokens; no adjustable value was added.

Before implementation, the added folder-navigation check failed with `Sidebar header must always expose one Open folder entry with zero opened folders`. Its early exit also left later expected HTTP-error checks unreached. After implementation the zero/one/several header-position, per-folder Close-only menu, Open and focus checks pass. Related regressions and required CI are recorded in the PR; previous verification entries elsewhere in this document remain unchanged.

### Caret insertion verification (#439)

Verification: the extended browser scenario failed before implementation because `Insert citation…`
was absent. After implementation it checks Korean text in the middle of a sentence, literal slash
behavior, both forms' Escape/content/caret/focus restoration, single-step Undo/Redo and exact
Save → Reload content, Korean command search, availability on every listed inline surface and
refusal in code/non-caret selections. The existing command-center, layout-rules and quiet-document
scenarios also pass. Editor tests pass 281/281; repository typecheck, Editor build, docs and diff
checks pass. Build retains the existing externalized `punycode` and bundle-size warnings.

The review follow-up reproduces the form-button gap on head `9d8893b`: Tab from the
Citation key to Add, open the center, and assert both insert commands are disabled. Before
the focus-origin guard this fails because Insert citation remains enabled. The same browser
scenario now compares an allowed ordinary paragraph caret with a selected range in that
paragraph, independently of code restrictions. Allowed-surface checks also open and Escape
the real Citation form before continuing the existing slash insertion.

### Shortcut layout verification (#381)

At pre-fix `e2ee863`, the revised shell test failed on German zoom, and existing browser scenarios
failed with `German zoom shortcut was intercepted` and `Layout-specific key was intercepted by Link`.
The current scenarios cover literal US punctuation, Korean opaque IME keys/composition, German
minus/umlaut and shifted variants, and French characters/digit-4 apostrophe. The original immediate
search typing, modal blocking, shared labels/ARIA and prior-link-form focus regression are retained.

Headed installed Chrome 155.0.8059.85 and Edge 155.0.4283.62 were additionally sent layout-specific
CDP key/code/virtual-key tuples. Both an ordinary input and the actual Editor retained German Ctrl+-:
DPR 1 → 0.899999976 for `-`, `Process`, and `Unidentified` with Slash / VK 189, without opening the
center. After Ctrl+0 reset, literal and opaque US/Korean center/link cases opened their existing UI.
French apostrophe / digit-4 VK 52, including opaque variants, still activated browser tab 4 without
opening Link. German/French shifted or umlaut characters did not open the forms. These are protocol
reproductions against official layouts, not hardware/OS layout switching. No native UI was screen
automated. The same checkout-owned Chrome and fixed Edge profiles were reused and zoom reset.

#### Earlier two-key candidate audit (#381, historical physical-only implementation)

The following US-key probe and its recorded results predate the layout-safety fix above. They do
not establish safety on German/French layouts; the review follow-up supersedes that inference.

Each row below was sent with Playwright to an input in a **headed installed** Windows Chrome
155.0.8059.85 and Edge 155.0.4283.62, then to Electron 44.7.0 / Chromium 152.0.7977.130.
`received/cancelled` means exactly one trusted, cancelable keydown arrived with the expected physical
code, `preventDefault()` set `defaultPrevented`, input focus/value stayed unchanged and no browser
tab was added. Electron has a null application menu, so no menu accelerator claims these keys.

| Candidate (Ctrl; Cmd on macOS) | Chrome official / Windows probe | Edge official / Windows probe | Electron | Korean IME / physical key | Decision |
| --- | --- | --- | --- | --- | --- |
| / (Slash) | No listed default; received/cancelled | No listed default; received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | **Center**; shares the slash command cue |
| ' (Quote) | No listed default; received/cancelled | No listed default; received/cancelled | received/cancelled; no menu | Present beside Enter, no AltGr/Shift | **Link**; easy home-row key, no existing editor binding |
| ; (Semicolon) | No listed browser default; received/cancelled | No listed browser default; received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: macOS Cmd+; finds misspellings |
| \ (Backslash) | No listed default; received/cancelled | PDF fit mode; received/cancelled on HTML input | received/cancelled; no menu | Present; may have won-sign keycap | Reserve PDF behavior; clearer unused alternatives exist |
| [ (BracketLeft) | Cmd+[ is Back; Windows received/cancelled | PDF rotation, Cmd+[ Back; Windows received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: macOS browser navigation |
| ] (BracketRight) | Cmd+] is Forward; Windows received/cancelled | PDF rotation, Cmd+] Forward; Windows received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: macOS browser navigation |
| Grave accent (Backquote) | No listed browser default; received/cancelled | No listed browser default; received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: macOS window switching |
| , (Comma) | Cmd+, Settings; Windows received/cancelled | No listed default; received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: browser preferences / existing Subscript |
| . (Period) | No listed default; received/cancelled | No listed default; received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: existing Superscript |

Known reserved letter combinations (print P/Shift+P, address search K/E/L, new/close tabs N/T/W,
DevTools, Edge sidebar/Collections) are excluded using the official lists rather than opening native
UI. Ctrl+Alt variants are excluded for AltGr; Space variants are excluded for IME switching.
Two punctuation combinations pass, so additional Shift+letter/F-key bindings are unnecessary.

Reproduce the browser delivery audit from this checkout with
`pnpm exec tsx apps/editor/test/browser/shortcut-probe.ts chrome` and then `... msedge`.
The script closes its context in `finally` and writes raw event results to `tmp/shortcut-probe-*.json`.
Chrome reuses the runner's existing checkout hash profile; Edge reuses its one fixed `-edge` sibling.
`LITZIO_BROWSER_CHANNEL=msedge pnpm browser:test command-center link-authoring` reuses that same
Edge profile for product integration. Run channels sequentially, never with temporary profiles.

This proves page delivery/cancellation for protocol-injected keys in these installed Windows builds,
not hardware keyboard routing through every OS hook. No print/address/native UI was screen-automated.
macOS is a documentation-level review only; custom global hotkeys and nonstandard compact keyboard
layouts are outside this evidence. The full-width key/code cases are synthetic IME-state regressions,
not a claim that Playwright toggled the OS IME. Browser defaults remain supported by official lists,
with actual delivery/focus evidence for each punctuation candidate.

Before changing the bindings at `e60ef78`, the revised shell test failed on the new physical key;
`command-center` failed waiting for the Slash-opened input and `link-authoring` failed its shortcut
label assertion. After the change: Editor 277/277, Desktop 40/40 and typecheck/build passed;
Chrome `command-center`, `link-authoring`, `layout-rules`, `quiet-document` and Edge's two shortcut
scenarios passed. Electron passed center opening/typing and existing link-form Apply. The queued
previous-link-form focus regression and #386 immediate search/document focus assertions remain.

Same-worktree `quiet-document --screenshots`, 100% zoom / DPR 1, bundled font, same rest state:

| Viewport | Before (three modifiers) | After (two keys) |
| --- | --- | --- |
| 1440×1000 | [Before](../design/assets/shortcuts-381/after-1440.png) | [After](../design/assets/shortcuts-381/two-key-after-1440.png) |
| 375×1000 | [Before](../design/assets/shortcuts-381/after-375.png) | [After](../design/assets/shortcuts-381/two-key-after-375.png) |

The existing shortcut chip is shorter; control placement, document typography and responsive rules
are retained. The earlier verification record below is historical and is not rewritten as new proof.

#### Earlier three-modifier verification and captures (#381, historical)

Windows Chrome 155.0.8059.85 passed `command-center`, `link-authoring`, `layout-rules` and
`quiet-document`; Edge 155.0.4283.62 passed the two shortcut scenarios using the same checkout-owned
persistent profile sequentially. These exercise actual renderer keyboard dispatch, Korean key values
with physical codes, composition exclusion, tooltips/ARIA, modal blocking and real file Save → Reload.
Printing is checked by uncancelled `Ctrl+P` / `Ctrl+Shift+P` events with no center opening.
Electron 44.7.0 (Chromium 152.0.7977.130) staged-app smoke passed center opening/typing, link opening/Apply
and a null application menu. Desktop tests passed 40/40; Editor tests passed 277/277.

Native browser chrome (including the actual print window and address bar) is **not verified**:
Computer Use stopped because it could not determine the browser URL confidently enough for policy.
No native key was sent after that stop. Runtime integration success and official default-shortcut
lists are separate evidence; this record does not claim a completed native browser/OS collision audit.
Initial headed Chrome and the first CI run exposed a link-form focus timeout after Remove: a queued
Tiptap `focus()` could blur the next form. A regression holds only frames queued by Remove and
releases them after opening the next form; it failed before the fix and passes with synchronous
ProseMirror focus return on Apply/Remove/Escape. The exploratory headed layout scenario also
observed a 15px native-scrollbar difference; the standard runner passes unchanged assertions.
No browser-runner or command-center focus-policy change is introduced by #381. The full CI also
exposed a platform-label test isolation race: a recorded deletion offered recovery after Reload and
covered Settings. Waiting for an actual deletion record reproduced it locally. The cross-reference
scenario now Saves its scratch edits and observes removal of that path's recovery record before the
platform-only Reload; product recovery behavior and existing assertions are unchanged.

Same-path `quiet-document --screenshots` product comparison at base `c587663` and #381 implementation,
Windows Chrome, DPR 1 / 100% zoom, bundled Pretendard, scroll top, equivalent rest state:

| Viewport | Before | After |
| --- | --- | --- |
| 1440×1000 | [Before](../design/assets/shortcuts-381/before-1440.png) | [After](../design/assets/shortcuts-381/after-1440.png) |
| 375×1000 | [Before](../design/assets/shortcuts-381/before-375.png) | [After](../design/assets/shortcuts-381/after-375.png) |

The base product files were temporarily restored and the implementation reapplied in the same
worktree; no other checkout or Chrome profile was created. Only the existing shortcut chip/tooltip
text changes. Document layout and control positions retain the Visual Language rules.

### Command center verification (#363)

Clean-base captures were taken at `4b55e5506ea85a3ef4bc1c99f92c2e5b7f18e710` before product
edits. The same `quiet-document` fixture, 100% zoom, loaded fonts/images and scroll-top state
were captured after implementation. The 768px header now uses two rows; document typography and
horizontal geometry remain unchanged. New-center captures show real opened documents, not a mockup.

| State | Before | After | Viewport |
| --- | --- | --- | --- |
| Quiet Document, wide | [Before](../design/assets/command-center-363/before-1440.png) | [After](../design/assets/command-center-363/after-1440.png) | 1440×1000 |
| Quiet Document, narrow | [Before](../design/assets/command-center-363/before-768.png) | [After](../design/assets/command-center-363/after-768.png) | 768×1000 |
| Center search | — | [Opened documents and commands](../design/assets/command-center-363/search-1440.png) | 1440×900 |
| Phone | — | [Entry](../design/assets/command-center-363/center-375.png), [Korean command search](../design/assets/command-center-363/search-ko-375.png) | 375×900 |

`command-center` checks no-document/disabled/no-match states, cancel preserving the editor and
selection, command-only shortcut, IME and Save shortcut ownership, modal focus handoff, dirty tab
and property-draft retention, Undo/Redo, real Save/Reload, pending-Save restrictions, view switching,
equal filenames, Korean/English search and 1440/1024/768/375px bounds. Existing `editor-shell`,
`document-tabs`, `ui-language`, `layout-rules` and `quiet-document` also passed. Editor tests
(272), typecheck/build, documentation and whitespace checks passed. No Core/CLI semantics changed.

### Command center keyboard verification (#386)

At base `a61dff5b32b6c6d36b8c8d225539700b07789589`, on Windows Chrome in the same worktree,
Ctrl+P followed immediately by typing `technical` lost its first character to the editor in 3 of
12 attempts. The Dialog schedules initial focus on the next animation frame; mounting the search
input with autofocus closes that gap while retaining the Dialog's focus/dismissal handling.
Document selection focused the tab button, so immediate typing failed for both retained and newly
opened tabs, including selecting the active tab again. Selection now activates the tab together with
dismissal and supplies its existing editor focus target to the Dialog's final-focus handling.

The first-Down and missing-hover reports were not reproduced: ten search attempts covered direct
typing (`> o`, `> s`, `technical`), fill, replacing a query and searching after no matches. Down moved
to the next result. Seven pointer attempts moved the same active highlight and showed the existing
selected surface. No navigation, hover, style, search-scope or shortcut-mapping change was made.

The existing `command-center` scenario failed before the fix for immediate search typing and both
document focus cases. It now sends real keyboard input while delaying the next animation frame,
checks both opening shortcuts, first Down, hover appearance/shared active item, arrows after hover,
and immediate typing/Undo after retained/newly opened/active-tab selection. Source view, editor
state/history/property drafts, cancellation, panel hiding and command/modal focus handoff remain
covered. A repeat of the unthrottled typing probe passed all 12 attempts after the fix. Related
`editor-shell`, `document-tabs`, `ui-language`, `layout-rules` and `quiet-document` checks also passed.
No Core operation or CLI command is needed for these Editor-only focus interactions.

### Listed document search verification (#384)

The extended `command-center` scenario failed against base `144e34af8ec75c1d14fad045f76440d8da72aead`
before product edits: `Sidebar-listed unopened document missing from search`. Actual Windows Chrome
[before](../design/assets/command-center-384/before.png) / [after](../design/assets/command-center-384/after.png) captures
show the same `technical` query, opened `technical-1.md`, listed scratch folder and 1280×720 viewport
(default DPR/100% zoom, bundled Pretendard). Both came from this same worktree and its existing
persistent browser profile; no extra checkout or temporary Chrome profile was used.

The scenario now checks tab/file distinction and ordering without result truncation, no Host request
while searching, unloaded-child exclusion, collapsed-child inclusion, overlapping-root and tab-path
deduplication, image/other-file exclusion, immediate typing/Undo after opening a file, retained dirty
work, busy restrictions and the real non-native refusal with unchanged active document. The existing
#386 immediate search/tab-focus and Source/IME/modal/history/draft checks remain. New-editor focus
runs after Tiptap's Strict Mode DOM reattachment in a cancellable microtask; the browser check adds
no focus polling or reload before typing. The visual change reuses the existing result layout,
selected surface and sidebar subtle-text/crossed-file treatment; no adjustable value is introduced.

### Listed search review follow-up (#384)

The existing scenario failed on reviewed head `4fdb5bc8ffc8f91403d58a84c4ba50ab934b497f`
with `Disconnected child cache remained searchable after parent relisting`. It now expands/collapses
`alpha`, removes that entry from the next parent response, verifies the sidebar and search omit it,
then restores the parent entry and verifies its preserved collapsed listing is searchable again.
The folder-tree reducer/cache lifecycle is unchanged; search reuses `knownFolders` for reachability.

Performance measurements used 2,000 synthetic native document entries in one existing scratch folder,
one initial document tab, collapsed sidebar, 1280×720, the same worktree/persistent Windows headless
Chrome/Vite development setup and no CPU throttling. Three trials measured Control+P and real `b`,
`u`, `l` key presses through two subsequent animation frames; unique search used `fill('bulk-1999')`.
These are local end-to-end observations including Playwright overhead, not production benchmarks or
fixed timing gates. The after run includes #397 on `cda1397` (subsequent changes add tests/evidence).

| Measurement | Reviewed implementation | After follow-up |
| --- | --- | --- |
| Open, three trials (ms) | 1387 / 1085 / 1031 | 333 / 256 / 204 |
| Real b/u/l input, nine key presses (ms) | 395–831 | 35–72 |
| Unique search, three trials (ms) | 204 / 171 / 168 | 64 / 53 / 55 |
| Chrome CPU samples with React render/commit frames, extra open + b/u/l run | about 1926 ms | about 188 ms |
| Samples within filter / App, same profile | about 6 / 12 ms | about 6 / 15 ms |

The sampling profile identified result rendering/commit as the main input bottleneck, rather than
text matching. The source also regenerated all file candidates during closed-center App renders.
Open-only memoized collection/sorting removes that unnecessary work; the 50-row page bounds rendering
without limiting full-scope filtering or making late results unreachable. The sampled totals are
stack categories, not isolated component timings; idle/native/other work is not listed above.
The [before](../design/assets/command-center-384/profile-before.json) and
[after](../design/assets/command-center-384/profile-after.json) summaries retain all trial values and top samples.

The existing `command-center` scenario now also supplies the synthetic 2,000-entry listing, checks
visible range/total, real Tab/Enter previous/next access and within-page arrows, no Host requests,
query narrowing to the final document, actual open and immediate editor typing/Undo. Only that last
target is a real scratch file; there is no 2,000-file fixture or timing assertion. Existing restored-tab
checks in `document-tabs` also verify one `Opened tab` result per restored path. Actual pagination at
[1280px](../design/assets/command-center-384/paged-1280.png) and [375px](../design/assets/command-center-384/paged-375.png)
uses existing footer typography/spacing, shared Button controls and tokens, with no new adjustable value.

### Listed search result-limit follow-up (#384)

After the review approved `5dfb690`, the integration owner selected a simpler presentation: the first
50 matches, a full count at every size, and explicit narrowing guidance above 50, without page controls.
The current [listed-search contract](../design/editor-ux-shell-v1.md#listed-document-search-384) supersedes the pagination behavior
recorded in the preceding verification; those earlier measurements and captures remain historical evidence.
Reachability, open-only/tree-state memoization, full-source matching and result order are unchanged.

The existing 2,000-entry browser check now verifies the first/last displayed paths, the 50-row bound,
real ArrowDown access to the 50th match and existing wrap/stay behavior at that boundary. It checks
the overflow guidance, counts of 10/0/1 after query changes, and the same mounted polite/atomic live
status throughout. Korean command search also checks its translated count. Narrowing to the final
file still opens it with immediate editor typing/Undo, with no Host request during search. These are
DOM/keyboard accessibility checks, not a claim of manual screen-reader verification.

The same three-trial probe and 2,000-document fixture described above ran after merging #402. The
worktree, persistent Chrome profile, 1280×720 viewport, collapsed sidebar, one initial tab and no CPU
throttling were retained. The current worktree's Vite server used port 5174 because another worktree
already owned 5173; its `/api/document` path was checked before measurement.

| Measurement | First-50 presentation |
| --- | --- |
| Open, three trials (ms) | 348 / 325 / 278 |
| Real b/u/l input, nine key presses (ms) | 52–89 |
| Unique search, three trials (ms) | 66 / 59 / 67 |
| React render/commit CPU samples, extra open + b/u/l run | about 371 ms |
| Filter / App samples, same profile | about 8 / 17 ms |

The [raw summary](../design/assets/command-center-384/profile-limited.json) retains each value and sampled
stacks. This local development observation includes Playwright overhead and has no timing threshold;
it does not claim a speed improvement over the earlier bounded pagination run. Actual first-50
captures at [1280px](../design/assets/command-center-384/limited-1280.png) and
[375px](../design/assets/command-center-384/limited-375.png) retain the same query/first selection as the earlier
paged captures, with existing footer typography/spacing and no new adjustable style value.

### Curated shortcut guide (#496)

The owner corrected #485's complete-list requirement: keep useful editing commands concise,
reuse existing bindings/platform labels and a wide Dialog, and replace exhaustive omission
coverage with displayed-binding validity plus curated-command presence. Scope is help content,
presentation, translations and existing tests; no new shortcuts or Core/CLI semantics.

Before changing product code, the extended `command-center` assertions failed on base
`6352fa661b5e4583db75597e70c146cd4e815646`: English/Korean 1440px rows wrapped (including
Redo and heading/list entries) and the Russian-layout alias appeared in both languages at
1440/375px. The existing phone overflow assertion already passed; it remains protected.
After the change, `command-center --screenshots` passes: English entries stay one line at
1280/1440px, Korean entries at 1440px, the alias is absent, and both languages fit at 375px.
Every row is measured against its label's single-line height, without a fixed row count.
Editor tests (290), workspace typecheck, Editor build, docs/whitespace checks and the existing
`layout-rules quiet-document` browser regressions also pass. Windows/macOS keymap
validity and shared labels are unit checks; no native macOS keyboard run is claimed.

Manual visual review only: same worktree/server (`127.0.0.1:5206`), installed Chrome with
the checkout-owned persistent profile, DPR 1, 100% zoom and bundled Pretendard. Each pair
uses the same document, language, viewport, guide scroll 0 and keyboard-focused Close control.
The 1440px guide widens from the default 384px to the existing 672px Folder dialog token;
labels and multiple key hints now share a row. At 375px the 343px popup retains its viewport
inset, shows the shorter list and keeps Close reachable. Surface, font, spacing and focus
treatment follow [Visual Language](../design/editor-visual-language-v1.md); capture procedure follows [Visual change review](../test/README.md#reviewing-a-visual-change).
Captures are review evidence, not screenshot-based automated assertions.

| Language / viewport | Before | After |
| --- | --- | --- |
| English, 1440×900 | [Before](../design/assets/shortcut-guide-496/before-en-1440.png) | [After](../design/assets/shortcut-guide-496/after-en-1440.png) |
| English, 375×900 | [Before](../design/assets/shortcut-guide-496/before-en-375.png) | [After](../design/assets/shortcut-guide-496/after-en-375.png) |
| Korean, 1440×900 | [Before](../design/assets/shortcut-guide-496/before-ko-1440.png) | [After](../design/assets/shortcut-guide-496/after-ko-1440.png) |
| Korean, 375×900 | [Before](../design/assets/shortcut-guide-496/before-ko-375.png) | [After](../design/assets/shortcut-guide-496/after-ko-375.png) |

### Shortcut guide verification (#471)

The extended `command-center` scenario failed against the baseline with `Undo command and
Keyboard shortcuts entry are missing`. The shared-label unit assertion also failed with
`bold tooltip must read the shared label` when run against the baseline toolbar. Both pass
with this change. The browser scenario verifies exact one-step Undo/Redo, active-tab targeting,
disabled empty/busy/Source history, shortcut hints, read-only guide content (including Shift+Enter),
Escape/Close/outside dismissal and focus restoration to the editor or original focused control.
It also measures English and Korean guide overflow at phone width without depending on screenshots.

Local checks: Editor suite (287 tests), workspace typecheck, Editor build, documentation/whitespace
checks, and `pnpm browser:test command-center --screenshots`, `layout-rules quiet-document`,
and `quiet-document --screenshots` passed. Build retains the existing punycode externalization and
large-chunk warnings. Desktop packaging and other-platform coverage are left to required CI;
macOS labels are unit-checked, without claiming a native macOS keyboard run.

Captures use this worktree's server at `http://127.0.0.1:5199`, Windows installed Chrome and its
checkout-owned persistent profile, DPR 1, 100% zoom and bundled Pretendard. The baseline is
`c2329159016cdae6183885bd24de2bd8a8046e1e`; After uses the same base with this PR's changes.
Quiet Document is at rest after fonts/images load, with the same scroll position. History uses
the same original document, text/formatting history and `> Undo` query at 1280×720. Initial runs
that reused another worktree's server on 5173 are excluded from this evidence.

| State | Before | After / new guide | Viewport |
| --- | --- | --- | --- |
| History command | [Before](../design/assets/shortcut-guide-471/history-before.png) | [After](../design/assets/shortcut-guide-471/history-after.png) | 1280×720 |
| Quiet Document at rest | [Before](../design/assets/shortcut-guide-471/quiet-before.png) | [After](../design/assets/shortcut-guide-471/quiet-after.png) | 1440×1000 |
| Shortcut guide, English | — | [Desktop](../design/assets/shortcut-guide-471/guide-1440.png) / [Phone](../design/assets/shortcut-guide-471/guide-375.png) | 1440×900 / 375×900 |
| Shortcut guide, Korean | — | [Phone](../design/assets/shortcut-guide-471/guide-ko-375.png) | 375×900 |

Visual inspection confirms grouped, readable entries and accessible Close controls inside the viewport.
The existing modal surface, spacing, type and key-label treatment are retained, with no new CSS token.

#### Review follow-up: history parity

After merging master `d3cfd58` (#481), the new command-center comparison failed with
`command Undo lost the input-rule space: ##The converter…`. It compares keyboard and command
Undo on identical file state after a real `## ` input-rule conversion, then compares Redo after
a native history Undo, including document, selection, availability and immediate editor focus.
The corrected `command-center` and existing `markdown-input` (opaque-IME input-rule Undo) scenarios
pass. `continuous-editing` initially stopped at an unrelated ambiguous Equation Apply locator,
before reaching its history probes; its next unchanged run passed, including the #481 history probes.

#### Review follow-up: complete keymap audit (historical, superseded by #496)

The following records #485's earlier full inventory and omission test. The curated contract
above replaces that display requirement; registered key behavior remains unchanged.

The omission check failed against the earlier guide with `Undocumented Windows bindings`, including
the list toggles, code toggle, document end and the other previously unlisted editing keys. It now
compares the guide against registered keymaps for both `Win32` and `MacIntel`, restoring the platform
after each test. No keymap is added or overridden to make the guide match.

| Audited source | Existing bindings represented in the guide |
| --- | --- |
| Tiptap Core `Keymap` | Enter/Mod+Enter, selection, deletion/join aliases and macOS Ctrl/Option aliases |
| Enabled StarterKit marks, hard break and history | Bold/Italic case aliases, strike, hard breaks, Undo/Redo including Russian-layout aliases |
| Explicit Code/Subscript/Superscript/List extensions | Inline formatting, list toggles, list indentation/split/delete, code toggle/indent/newline/boundary exit |
| `document-interaction.ts` | Clipboard admission, heading/table Tab, Enter, deletion, document end and final-block navigation; opaque IME uses the same matcher and history dispatch |
| `document-title.tsx`, `markdown-input-rules.ts`, `DocumentEditor.tsx` | Metadata title input/history, input-rule Undo precedence, selection-toolbar Tab, slash menu and link shortcut |
| Shell, selection/property/citation forms and shared dialogs | Navigation, completion, activation, tab close, cancellation and focus return in their existing contexts |

The macOS extra document-end key is Cmd+ArrowDown; Cmd+End remains listed because it is also
registered. Core's literal Ctrl+H/D/A/E and Option deletion aliases are not relabeled as Cmd.
Disabled StarterKit blockquote/heading/horizontal-rule/underline extensions contribute no guide
entries. Native browser text navigation is retained; the guide's clipboard entries describe the
existing real clipboard paths rather than registering new browser shortcuts.

Local follow-up verification: Editor tests 288 passed; shell tests 29 passed after the final audit
check; workspace typecheck, Editor build, docs and whitespace checks passed. The final sequential
browser runs passed `command-center --screenshots` and `layout-rules quiet-document continuous-editing
markdown-input`, using this worktree's 5199 server and its existing persistent Chrome profile.
The initial Equation Apply locator failure above did not require a test or product change.

The expanded guide remains in the same viewport-bounded shared Dialog and scrolls to its lower
groups. New assertions scroll to and verify list/code/document-end hints and reach the final
navigation entry at 1440px and 375px without horizontal overflow. These review captures retain
the existing Windows/Chrome/DPR/font/zoom environment, on merge `edf169a` plus the review fixes;
the initial captures above remain historical evidence of the first implementation.

| Expanded guide state | 1440×900 | 375×900 |
| --- | --- | --- |
| English, top | [Desktop](../design/assets/shortcut-guide-471/guide-complete-1440.png) | [Phone](../design/assets/shortcut-guide-471/guide-complete-375.png) |
| English, scrolled to code/navigation | [Desktop](../design/assets/shortcut-guide-471/guide-complete-code-1440.png) | [Phone](../design/assets/shortcut-guide-471/guide-complete-code-375.png) |
| Korean, top | — | [Phone](../design/assets/shortcut-guide-471/guide-complete-ko-375.png) |

#### Integration with Source wrapping and table-deletion notices

Master `9dfd724` (#483/#486) was merged after review approval of `2cb2409`. Both Source wrapping
and shortcut-guide verification histories are preserved. The shared Korean `Undo` key uses master's
`되돌리기`; the command-center `실행 취소` search alias remains. The notice keeps its doc-identity
guarded native history Undo, while command history retains the shared keyboard dispatch.

Editor tests (289), workspace typecheck, Editor build and documentation/whitespace checks passed.
The requested single local `command-center table-authoring` browser run passed command-center;
the added table integration check initially failed because it incorrectly required every notice
to disappear after Redo. Its trace showed one remaining table, editor focus and one notice.
The reference-deletion handler explains that ordinary warning: Redo deletes a referenced table.
The corrected assertion checks that the stale table-deletion Undo action is absent **and** the
reference warning remains. This correction is verified by the required CI, without another local
browser run. All existing table-notice cases and the new command Undo restoration passed locally.

### Filename form verification (#652)

Host unit tests cover sanitized hints, generic-name classification, MIME suffixes, Korean,
sequence gaps/collisions, Unicode rejection and signed rollback after rename. The existing
`image-assets` browser scenario covers native clipboard names, original drop names, rename
refusal without partial properties, saved and just-pasted Figure rename, immediate Undo/Redo
paths, and Save/Reload. The engine regression separately covers deletion history and a new
attachment reusing an old filename. The 1440px/640px captures below use the same technical
sample, local SVG and open properties state; the new field uses existing control geometry.

| Viewport | Before | After |
| --- | --- | --- |
| 1440 x 900 | [Before](../design/assets/image-names-652/before-1440.png) | [After](../design/assets/image-names-652/after-1440.png) |
| 640 x 900 | [Before](../design/assets/image-names-652/before-640.png) | [After](../design/assets/image-names-652/after-640.png) |

Local verification: Editor unit suite (320 passed), final history/block-command regressions
(36 passed), Host image/file tests (43 passed), workspace typecheck, Editor/CLI production
builds and docs checks passed. Persistent Chrome `image-assets`, `figure-authoring`,
`file-actions`, `layout-rules`, `quiet-document` and production `http-host` (including process
crash recovery) passed. Packaged Desktop and Edge are left to CI. The packaged Desktop asset
assertion now expects its supplied `paste.png` hint. A transient Vite ResizeObserver notification
was logged on the last image-assets run; its console/behavior assertions passed.


Review follow-up (#654): the existing image-assets scenario now saves an equivalent Image
spelling before rename and checks immediate Undo/Redo paths plus actual Host 200 responses.
It opens two Figure forms together, retains Alt/Label drafts while following untouched Image
paths, and separately preserves an explicitly edited Image draft. Generic `image.png` drop
keeps its stem while native clipboard paste keeps document numbering. Host tests cover source
validation and inode-confirmed historical spellings, including remote/out-of-scope non-matches.
The same browser scenario observes the actual post-rename recovery record, reloads, uses Restore
work, checks all image paths against real files, and completes Save/Reload with the same applied
content. The review's non-blocking record-disappearance observation was not reproduced in this
flow; no separate recovery defect or cause is asserted. Existing recovery browser regressions
also pass. Local follow-up: targeted unit tests 79, Editor unit tests 320, workspace typecheck,
Editor/CLI build, docs checks and Vite image-assets/figure-authoring/file-actions/recovery pass.


### Source wrapping verification (#476)

Same-state captures use base `c232915` in this worktree at 1440×900 and 375×900, on the same
checkout-owned persistent headless Windows Chrome profile and Vite origin (`127.0.0.1:5177`).
Both show clean `wrapping.md` in Source, scroll top, no selection/focus, pointer at the top right,
after `document.fonts.ready`. DPR, visual viewport scale and CSS zoom are 1. Source retains its
existing Consolas / Courier New / monospace stack, 14px/20px; the shell retains bundled Pretendard.
After uses the base plus this CSS change; [Before evidence](../design/assets/source-wrap-476/before.json)
and [After results](../design/assets/source-wrap-476/after.json) record the measurements and source hashes.

| Viewport | Before | After | Source scrollWidth / clientWidth, Before → After |
| --- | --- | --- | --- |
| 1440×900 | [Before](../design/assets/source-wrap-476/before-1440.png) | [After](../design/assets/source-wrap-476/after-1440.png) | 5160 / 800 → 800 / 800 |
| 375×900 | [Before](../design/assets/source-wrap-476/before-375.png) | [After](../design/assets/source-wrap-476/after-375.png) | 5131 / 311 → 311 / 311 |

Direct visual review: the paragraph and unbroken URL now continue vertically within the paper.
The first and continuation rows share the original text axis, leaving the number gutter clear;
the next source line receives the next number. The phone view uses normal vertical scrolling.
Controls, monospace typography, paper and document insets retain their previous appearance.
Captures are manual-review evidence only.
The unchanged Visual view's Quiet Document 1440px rest captures are byte-identical:
[Before](../design/assets/source-wrap-476/quiet-before-1440.png) /
[After](../design/assets/source-wrap-476/quiet-after-1440.png).

The extended `source-view` assertions fail with the original CSS at both widths, then pass after
the change. There are still 13 source lines; the paragraph occupies 6/16 visual rows and the URL
7/19 rows at 1440/375px. Whole-source DOM text, native selection and native clipboard preserve the
same source characters and indentation with no numbered text or inserted wrap newlines.
Chromium's existing native selection/Copy omission of the terminal newline is unchanged.
Disk contents and clean status remain unchanged. Existing canonical Source/Save/Reload,
unapplied drafts and Visual history checks also pass.

Editor tests (286/286), workspace typecheck, Editor build, visual-token and documentation checks
pass, alongside `source-view`, `source-view-pending`, `layout-rules` and `quiet-document`.
The build retains its existing large-chunk advisory. The existing 2000/5000-block
[performance fixture and measurement](../reviews/editor-input-performance-2026-10-25.md)
measure typing/Save rather than Source rendering; this change adds no Source timing gate or
performance claim.


### Outline docking evidence (#552)

`layout-rules` measures the boundary with the Sidebar expanded and collapsed: the Standard
column remains 928px at 1279/1280/1423/1424/1440px and the TopBar stays 48px at
1280/1423/1424px. At #552 it checked docked closure from both Hide outline and the TopBar toggle (the internal button was removed in #590; current coverage uses the TopBar toggle),
explicit reopening, overlay dismissal, return to docked, and reload default restoration.
`outline` retains docked keyboard/navigation coverage at 1440px; `command-center` retains
Show/Hide outline and focus coverage. The endnote Outline-exclusion check explicitly opens
and closes the 1280px overlay. `quiet-document --screenshots` retains typography,
editing and visual checks with its Outline isolation explicitly above the docking boundary.
The initial outline/quiet-document failures assumed a default-open Outline at 1280px;
artifacts showed loaded documents and no console errors. Their setup now uses 1440px,
without removing their Outline assertions. CI also exposed a Command Center setup race:
after resizing into docked layout, the test now waits for its default-open panel rather
than conditionally toggling while the media-query update is pending.

Same-state captures below use the real Windows installed Chrome persistent profile,
English UI with mixed Korean/English fixture text, bundled Pretendard (font assertions pass),
100% browser zoom, DPR 1, viewport height 1000px, expanded Sidebar with no open folder,
Standard column, scroll at top, and the same selected Equation with no pointer hover.
Before product source: `ff37a32e273dfad90bde84a9c30e2a28ec5e3af3`; After: this PR's source.
Only representative PNG pairs are retained; generated traces, full captures and logs stay in `tmp/`.
Manual comparison confirms the wider text at 1280px, single-row header and closed Outline
below 1424px, and the preserved Standard column with docked Outline at 1424px.

| Viewport | Before | After |
| --- | --- | --- |
| 1280 × 1000 | [Before](../design/assets/toc-docking-552/before-1280.png) | [After](../design/assets/toc-docking-552/after-1280.png) |
| 1423 × 1000 | [Before](../design/assets/toc-docking-552/before-1423.png) | [After](../design/assets/toc-docking-552/after-1423.png) |
| 1424 × 1000 | [Before](../design/assets/toc-docking-552/before-1424.png) | [After](../design/assets/toc-docking-552/after-1424.png) |


### Outline toggle evidence (#590)

Verification: Editor tests (297), typecheck, Editor build, docs check and the `layout-rules`,
`outline`, `command-center` browser scenarios passed. The existing layout scenario now uses
the TopBar toggle for docked closure and overlay dismissal, retaining resize/choice/reload
assertions, overlay Escape focus return, and a 48px vertically centered Outline header check.
Outline list focus-exit tracking and command dismissal from a focused heading remain covered.
The new button-absence unit assertion failed against the original implementation first.

Same-state captures: Windows installed Chrome, checkout-owned persistent profile, English UI,
bundled Pretendard, DPR 1, 100% zoom, 900px viewport height, Standard document width,
quiet-document fixture at scroll top, Outline open, pointer outside the document. Sidebar is
expanded at 1440px and closed at 390px. Before source: `1cd199cda9b70318586a6264cadc7044a4b8e57e`;
After: this PR. Manual comparison confirms the close button alone disappears and the title,
list and document geometry remain in place. Generated traces/logs stay in `tmp/outline-590`.

| Viewport | Before | After |
| --- | --- | --- |
| 1440 × 900 | [Before](../design/assets/outline-toggle-590/before-1440.png) | [After](../design/assets/outline-toggle-590/after-1440.png) |
| 390 × 900 | [Before](../design/assets/outline-toggle-590/before-390.png) | [After](../design/assets/outline-toggle-590/after-390.png) |



## Additional previous verification metadata

- File operations verification: 2026-10-27 (#505 / #504 PR A: Editor/Host/Desktop unit tests, workspace typecheck, production Editor build and targeted persistent-Chrome browser checks; packaged Desktop is CI-only).
- List-format verification: 2026-10-29 (#734: explicit handle target, all ten choices/current check, single Undo, typed clipboard and Host Save→Reload; English/Korean 1440px and 640px manual captures).
