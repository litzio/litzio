# Docling comparison v1

- Status: Implemented
- Review UI verified: 2026-11-02 (#900; fake adapter, real C1 Host operations, persistent Chrome).
- Plugin-folder verification: 2026-11-01 (#869; unchanged comparison scenario on Windows persistent Chrome, 1440/640px capture path).
- Last verified: 2026-10-31 (#815 fixed Read surface/reverse correspondence; #857 dynamic UI contribution with unchanged comparison behavior).
- Authority: owner decisions in [#766](https://github.com/litzio/litzio/discussions/766), [#767](https://github.com/litzio/litzio/discussions/767), [#769](https://github.com/litzio/litzio/issues/769), under [ADR-0011](../adr/0011-code-module-boundary.md).

The Docling plugin contributes its sidebar footer's **Docling** dashboard,
comparison tab kind and conversion command through [Plugin UI contributions](plugin-ui-v1.md).
Its dashboard's Open conversion folder action opens the shared folder picker for
a conversion folder containing `document.md` and `document.docling-map.json`.
The picker shows the comparison-specific description in English and Korean,
without the folder-opening hint about choosing documents in the sidebar (#840).
Ordinary folder opening, including the new-document location flow, keeps that hint.
It opens a **conversion folder · Docling comparison** tab. The folder name leads
so that the identifying text remains visible when a narrow tab is ellipsized.
The accessible name and the tab button's `title` contain the full title.
The folder name identifies
the result even when the source JSON's name is only `source`; equal folder names
use the shortest distinguishing parent suffix among open comparisons. Ordinary
document tab naming is unchanged. Opening the same conversion
selects its existing comparison tab. An ordinary editable tab of the same file
is independent. Comparison tabs have no Save, draft, recovery or mutation session.
Closing one needs no unsaved-change decision. They are not restored at startup.
Disabling the plugin unmounts its content but retains the same shell tab and
opening snapshot with a disabled message. Re-registration reconstructs the view
without reloading the window; transient source selection/scroll reset.
The module entry stays outside Explorer's folder navigation and empty-state help.
It does not interrupt Collapse Explorer → Open folder keyboard order and is hidden
with the other Explorer navigation when the sidebar collapses.
The footer's keyboard sequence after file navigation is Docling → Settings.
Docling opens the [plugin dashboard](docling-conversion-v1.md#plugin-dashboard-and-feature-selection-871);
its Open conversion folder quick action enters the existing comparison picker.
Disabling comparison removes that picker/tab kind, retaining open tabs in the
same disabled state as plugin detachment. Re-enabling restores their snapshots.
The empty-state help therefore describes only file browsing, separately from the comparison action
([#799](https://github.com/litzio/litzio/issues/799), sidebar item only).

## Structure review panel (#900)

The bounded panel has independently scrolling proposal list and details below the two comparison panes lists pending,
approved, rejected and inapplicable proposals, with stale source separately marked.
Selecting a proposal reveals its original refs using the existing source selection
and connector style and highlights measured right-hand blocks, without accessing
Editor DOM or importing its internals. Merge proposals select both original refs.
The details show kind, the actual original target text (both refs for a merge),
AI-provided page/text evidence separately, reason, Before (original label/level
and current approved changes), After (proposed values), and validation failures.
Approval/rejection are explicit; approved entries offer Undo approval. Stale and
inapplicable entries cannot be approved. Host C1 validation remains authoritative.
Approval and undo load a fresh document/map before clearing the panel's busy state;
no tab reopening, automatic AI rerun or document editing session is introduced.
Disabled review or absent AI service shows a reason and hides proposal controls.

`docling-review` uses synthetic PDF data and the fake AI adapter, exercising Run,
Cancel, proposal selection, approval/rejection/undo and immediate refreshed heading
DOM after busy completion. 1440px English Light and 640px Korean Dark captures
cover wrapping and panel/pane geometry. Real AI suggestion accuracy remains manual.
Self-reviewed captures: [1440px panel](assets/docling-review-900/review-1440-light-en.png),
[640px panel](assets/docling-review-900/review-640-dark-ko.png),
[1440px dashboard](assets/docling-review-900/dashboard-1440-light-en.png),
[640px dashboard](assets/docling-review-900/dashboard-640-dark-ko.png).
[Capture metadata](assets/docling-review-900/capture-metadata.json) records the source,
hashes, review and the intermittent Windows C1 directory-publication EPERM seen
in earlier local attempts. Those attempts rolled back with visible errors;
no automatic retry or weaker assertion was added. Later complete runs passed.

The left pane displays original page images with source bboxes using the map v1
page sizes and each bbox's TOPLEFT/BOTTOMLEFT origin. Categories have token colors
and a legend; decoration is dashed and unsupported is dotted. Selecting a region
shows its source ref, status, reason and conversion notes, and reveals the target
when the map matches. Counts include every map item, including groups and items
without provenance; only elements with provenance have source boxes.

The right pane uses the ordinary `DocumentEditor` in its fixed **Read** mode
([#849](editor-ux-shell-v1.md#read--edit--source-849)), with no Read/Edit/Source
switches in the comparison group's tab row. It reuses block hover, selection,
keyboard movement, text selection/copy and reading previews. Authoring controls
are hidden, and the same engine transaction filter rejects document changes.
For heading-depth inspection (#886/#887), this surface explicitly requests the Host's
optional `ReadingSurfaceProps.showHeadingLevels`. Decorative `H1`–`H6` cues remain
visible in a constant 48px inspection gutter, centered on the first line with localized hover text.
They do not enter text selection/copy, the document model or serialization. Ordinary Read
surfaces omit them. The cue stays 12px clear of the ordinary expanded block outline.
Heading connectors enter above the inspection gutter and curve to the measured block edge,
never the cue. Their endpoints and synchronization anchors still use measured block positions;
the reading layout callback recomputes them when the inset changes wrapping. Source boxes,
matching and the synchronization algorithm are unchanged. Heading sizes and word-break rules
are unchanged, including the existing mid-word wrapping of long titles at 640px.
The shell's thin reading-surface adapter supplies the public Core read model;
the module receives only block/recursive list-item positions and the current
snapshot selection key through callbacks, never Editor DOM or engine types.
All source matching, source inspection state and scrolling stay in `plugins/docling`.
The Endnotes
action reveals trailing definitions. Source notes retain their original language.

Selecting a converted block (or placing the reading caret in it) highlights its
source bboxes and visible connections, shows conversion notes and reveals its
first provenance region, even with synchronized scrolling off. Multiple source
items merged into one target are selected together. A list caret addresses its
specific recursive item; a whole-list selection addresses its items. Direct
block/list/endnote targets take precedence over container groups, captions and
picture-pixel descendants, so selecting a picture does not expand all its internal
text mappings. Source-side selection still inspects individual descendants and
reveals the document target without changing the engine selection. Clicking the
same document block again restores its source selection. A text range or a target
without a matching source clears the previous source highlight. Stale maps never
follow right-side selections. The map v1 format remains unchanged.

Visible regions connect to visible document targets. Scroll synchronization is on
by default. Picture descendants mapped as `image-content` share the picture's
connection at rest. Selecting an individual descendant's source box reveals its
own highlighted connection and original conversion notes; selecting another box
hides that individual connection again. All source boxes, mapping entries and
counts remain intact. Picture captions keep their separate correspondence.
This is temporary inspection state in the comparison tab, with no saved setting.
Scroll synchronization can be disabled. Monotonically increasing correspondence anchors
drive scrolling in either direction. Endnotes/groups remain clickable links but
are excluded from scroll anchors when their order differs from the body.
Images mount only for pages intersecting the source viewport; page-size placeholders
retain whole-document scroll geometry. Only visible links are drawn. The Host
parses/validates the sidecar once per open; no repeated source JSON parsing runs
on the browser scroll path.

A Markdown SHA-256 mismatch appears in the shared bottom-right notification
center, following owner P07 in [#777](https://github.com/litzio/litzio/issues/777).
It expands without taking focus, can be collapsed/dismissed and offers Go to
problem. Open comparison tabs contribute warnings to one window-level center;
switching tabs does not resurrect a dismissed cause. Go to problem selects its
comparison tab, and closing that tab removes its cause. Source regions and the current document remain readable; stale targets,
links and synchronized scrolling are disabled. Reconvert, close and reopen to use
fresh correspondence. Invalid format/coordinates/targets refuse opening with a
folder-picker error.

Comparison always uses two side-by-side panes and assumes a wide desktop window.
This is the explicit #769 exception to [ADR-0010](../adr/0010-supported-viewport-and-input.md):
640px usability/layout verification is not a target. Pane contents shrink and
scroll without overflowing the application shell.

UI uses shared controls/tokens and adopted P11 checkbox/P12 file picker patterns.
Bbox overlays, correspondence wires and the conversion-note strip are new
comparison-specific visual patterns, not generic Editor conventions.
Confirmation state, SQLite, correction UI, AI proposals, source mutation and post-edit
relinking are outside this contract. No new CLI command is needed for read-only UI;
headless conversion and [approved correction replay](docling-conversion-v1.md#approved-correction-records-and-replay-876)
remain separate plugin operations. Replay keeps original source regions and updates
the map/document hashes together; close/reopen loads the regenerated snapshot.

Brand defaults and packager overrides follow [the branding guide](../guides/branding.md) (#859). Product identity is separate from the fixed internal Host API; earlier verification records do not establish a migration from old Beta builds.

## Verification on 2026-10-30

Public NIST (11 pages) and the declared synthetic supplement exercise opening,
exact visible bbox/link counts, BOTTOMLEFT/TOPLEFT coordinates, decoration and
unsupported regions, list targets, read-only engine rejection, endnotes, both
scroll directions, sync off, stale warning/dismissal and tab group movement.
The shared Host test checks Root denial, non-GET refusal, stale snapshots and
remote/data/traversal page-image refusal. Existing Editor, layout-rules,
quiet-document, editor-groups and production HTTP Save/recovery/conflict checks
also pass. Manual 1440px review captures live separately from assertion tests;
they cover first view, figure/table/equation/endnotes and stale Light/Dark states.

The private local IEEE 1547 input was converted with the CLI and opened whole:
138 page placeholders, 1,436 native blocks, 2,728 converted map items, 373
decorations and 11 unsupported items. At 1440×1000 in persistent headless Chrome,
one observed open took 3,676ms. Initial source page images: 2; peak during a
120-frame full-range scroll: 3. Frame intervals were p50 16.9ms, p95 24.5ms,
maximum 137ms, with one observed 123ms long task. The scroll reached the last
page. GC-normalized JavaScript heap grew from 50,772,516 to 69,500,812 bytes
(about 17.9MiB); this excludes decoded image/GPU/native browser memory.
This is one local responsiveness observation, not a sustained 60fps or memory
ceiling guarantee. The native document is rendered whole; page pixels and wires
are viewport-bounded. IEEE content and screenshots are not committed.

### Fixed Read and reverse selection (#815)

The existing `docling-compare` scenario reproduced right-picture selection leaving
page 1 in view instead of revealing page 9, and visible disabled view switches in
the comparison header. It now covers fixed Read/no switches, figure/table/equation
source selection, repeated figure selection after source-child inspection,
ArrowLeft navigation, hover, typing/explicit-transaction rejection, recursive list
caret selection/range clearing, sync-on selection and stale-map selection.
Existing source-to-document, grouped picture links, scroll sync,
endnotes and comparison-group assertions remain in that scenario. Docling unit
coverage checks merged sources, recursive list keys and direct-target precedence.
The ordinary `read-view` regression also reproduces and protects pointer caret
movement from a selected preview: Edit's temporary non-editable-DOM guard must
not trap the selection in actual Read.

1440px English Light and 640px Korean Dark before/after captures use the same
page, source selection and subsequent right-figure click. The after captures show the right figure
selected together with its source bbox and highlighted connection. Alignment,
clipping, Korean wrapping and shell containment are manually reviewed under the
existing wide comparison exception; no mobile layout is introduced.
[Capture conditions and hashes](assets/docling-compare-815/capture-metadata.json)
record the baseline and rendering environment. Full local evidence remains in
`tmp/815-evidence`; these captures are not owner visual approval.

| Viewport / theme / language | Before | After |
| --- | --- | --- |
| 1440×1000 / light / English | [PNG](assets/docling-compare-815/before-1440-light-en.png) | [PNG](assets/docling-compare-815/after-1440-light-en.png) |
| 640×1000 / dark / Korean | [PNG](assets/docling-compare-815/before-640-dark-ko.png) | [PNG](assets/docling-compare-815/after-640-dark-ko.png) |

### Comparison polish (#799)

The existing `docling-compare` regression reproduces the two remaining defects
against base `17ca748d`: a `Docling comparison · source` title and 116 visible
connections to the NIST page 9 picture instead of its picture/caption pair.
It now checks the bundle titles, grouped wires, individual child selection and
return to the picture connection. Empty Explorer help and the comparison entry's
separate footer/keyboard order remain covered without another sidebar rearrangement.
Owner review of the 640px Korean capture found that the mode prefix hid the bundle
name. The title now puts the bundle first, retaining parent suffix disambiguation
and full accessible/tooltip names. `docling-compare --screenshots` verifies the
title and refreshes the representative captures below; the converted document's
existing narrow-column word wrapping is unchanged.

Representative product captures use the #784 public bundle, Windows persistent
Chrome, DPR 1 / 100% zoom, bundled Pretendard, sync off, page 9 and the picture
selected. Each pair uses the same viewport, theme, language and scroll/selection
state. Both themes were also inspected at both widths; 640px checks shell
containment and Korean wrapping while retaining the wide side-by-side exception above.

| Viewport / theme / language | Before | After |
| --- | --- | --- |
| 1440×1000 / light / English | [PNG](assets/docling-compare-799/before-1440-light-en.png) | [PNG](assets/docling-compare-799/after-1440-light-en.png) |
| 640×1000 / dark / Korean | [PNG](assets/docling-compare-799/before-640-dark-ko.png) | [PNG](assets/docling-compare-799/after-640-dark-ko.png) |

P11's existing transient source selection supplies the individual highlight;
P12's folder picker and the footer's Settings/file-navigation boundary stay intact.
No new generic control, saved document meaning or CLI operation is introduced.
