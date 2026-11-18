# Editor Layout Rules v1

- Status: Implemented
- Last verified: 2026-11-16 — DESIGN.md와 중복·검증 기록을 정리하고 관련 표현을 코드와 정적 대조했다. 제품·브라우저 실행 재검증 없음.
- Scope: Editor shell, document, block tools and control geometry.
- Pattern targets: UI 작업 전 [UI 패턴](ui-patterns-v1.md)의 사용처·확정 목표·불일치를 확인한다.
- [Visual Language](editor-visual-language-v1.md) owns color, typography, surfaces and state expression.

- Viewport alignment: The shell uses a fixed title strip and tab row. Search becomes icon-only below a 22rem available title container; Wide document folds into ⋯ at viewport widths up to 1024px. Settings, Sidebar and Outline docking breakpoints remain unchanged.

This document owns alignment axes, spacing, control dimensions and deliberate geometry exceptions. UI principles and decision rules follow [DESIGN.md](../../DESIGN.md).

## Supported viewport and input

Viewport support and the 640px acceptance rule follow [DESIGN.md — Layout](../../DESIGN.md#layout) and [ADR-0010](../adr/0010-supported-viewport-and-input.md). Capture at 1440px by default; capture at 640px when the change alters layout there. Existing no-hover fallbacks do not create a touch requirement.

## Alignment and ownership

- Document scrollbars (#1183/#1182): Base UI 1.8.0 ScrollArea retains the native
  `.document-scroll` viewport and its scrollTop/client bounds. Its 12px overlay track
  occupies the existing 16px trailing document inset, before docked navigation (or
  at the owning split group's edge), below the measured tabs. It consumes no layout
  width and is present whenever the viewport overflows, without hover/idle hiding.
  Short documents have no track. Hidden tabs retain native scroll state; pressing a
  track in another group focuses that group without replacing the viewport/editor.
  Overlay navigation retains its existing document occlusion and stacking priority.
  The 1424px docking boundary, 928px Standard column and centered content axis remain
  unchanged. Native print flow releases both the frame and viewport; the track is hidden.

- Editing flow-block bar (#1022) reuses BlockHandles’ top-level geometry, with absolute
  top/height and no reflow or transition. Its left edge is the text edge minus the
  existing `--space-block-hover-inline`; only thickness and pale accent color add
  adjustable tokens. The existing gutter safety gap keeps insertion/drag handles
  clear; heading-level cues remain farther left. Hover outline and Edit/metadata
  retain their position and behavior. No bar is painted on framed blocks, in Read,
  during drag, or outside document focus. [State scope](editor-visual-language-v1.md#state-rules).

- Heading-depth cues (#887/#886) occupy the existing absolute block gutter and center on
  each heading's first line, independently of its level, number or wrapping. They reserve
  no space within the established gutter. In Edit they change neither text rectangles
  nor document scroll height. The row's
  visible insertion/drag handles take precedence over its cue, including keyboard focus and an open block menu.

- Frontmatter title (#786) keeps the existing H1-line-height minimum slot. The small empty
  hint's line box matches that slot and centers vertically; empty-state height is explicit
  to prevent a fractional intrinsic-size shift when typing begins. The title focus outline
  uses `--space-1` outward offset for visible inner clearance without adding padding,
  resizing the field or moving the following body. This also applies to entered titles.

- Editor groups (#488 phase 1) use equal fixed columns with a 1px structural divider.
  Each needs 440px, the existing 640px supported viewport less the 200px narrow Explorer.
  Available document area must therefore reach 881px before splitting. A narrower
  area merges groups without unmounting tabs or losing their editing/scroll state.
  Split paper uses the existing 80px starting gutter and 16px narrow trailing inset;
  each native scrollbar belongs to its group. The shared title strip stays 40px;
  both tab rows stay 32px plus the boundary. See the [group contract](editor-ux-shell-v1.md#two-editor-groups-488-phase-1).
  Floating editor controls fit and cap their size to the owning document's visible
  content viewport in both single and split layouts. Exclude Sidebar, docked or
  overlay Outline/Tables/Figures panels, padding and native scrollbars. Keep the
  existing 8px edge inset for inline forms, menus and reading previews; property
  popovers retain their existing library collision spacing and placement rules.
  Resize, group movement and panel/Sidebar changes recompute the boundary.
  Selection tools, inline link/reference/citation forms, slash menus and reading
  previews clear their text/chip anchor vertically (#838). Prefer the existing
  side, flip when space is insufficient, and constrain tall content to the
  roomier side. Selection tools and slash menus hide when their anchor leaves
  the content viewport; scrolling back restores them without changing the engine
  selection. Editing forms retain their existing draft and viewport access when
  their anchor is offscreen; reading previews retain their existing dismissal.
  Hidden selection tools do not intercept Tab. A height-constrained slash menu
  reveals its keyboard-active choice through its own scroll, preserving the
  document's scroll position and the menu's scroll offset during refitting.

- The bottom Settings icon carries an 8px update dot in the same icon slot in both expanded Sidebar and collapsed rail (#665), without changing button targets or footer placement. Dot activation opens About & updates; its update actions receive an inset accent outline and selected-surface background. See the [update contract and captures](../reviews/desktop-distribution-history-2026-11.md#settings-update-cue-verification-665).

- Folder sections retain a 28px compact disclosure target (#425) around the 16px chevron,
  followed by the same name slot as subfolder rows (#582); folder rows have no folder icon. It rotates like
  subfolder chevrons and stays clear of the always-visible right-hand actions. The single-line
  name/title rules below apply. Collapsing hides only the tree/empty help; controls remain reachable at
  desktop and 200px narrow-sidebar widths. See the
  [section contract](editor-ux-shell-v1.md#collapsible-folder-sections-425).

- The Sidebar header contains Explorer and the compact Collapse Explorer button, or only Expand Explorer in the collapsed rail. Each root row shows New document… and More actions (New folder…, Open folder…, Refresh, Close folder). Empty Explorer retains Open folder… and New document…. See [#582 / #605](editor-ux-shell-v1.md#sidebar-and-native-title-bar-582--605).

- Sidebar icons use a 16px slot and 8px label gap. A tree row has one 16px leading slot (chevron for folders, retained type icon for files) and an 8px name gap; folder and file names at the same visual depth share one text start within 1px. Each level indents 12px, at most five levels; deeper names keep that indent and ellipsize, with the full path in `title`.
- Each opened folder is its own accessible section in the order opened (#235), visually continuous with its child rows and the next root, without extra heading or section gaps. One opened folder keeps its heading in place while its tree scrolls; with several, the Explorer panel scrolls them together as one list, so every heading and item stays reachable without overlapping.
- Each opened root folder is presented as a depth-zero folder row, using the same chevron and name without a folder icon, 14px regular type, 20px line height, 28px row height and icon/label gaps as child folder rows. Its New document / More actions group stays at the right of the same row, with 4px before the group and no gaps between its 28px ghost buttons. The root name uses the same single-line ellipsis as tree entries; its full path remains in `title` and its full name in accessible section/disclosure/tree labels. This owner-approved #582 revision supersedes #218's full root-name wrapping. Child entries start one visual indentation step below the root, retaining the existing 12px step/cap. This visual depth does not change the section, disclosure button, tree/treeitem roles, ARIA levels or #425 state. Tab order follows disclosure, New document, More actions, then the tree's retained keyboard stop.
- The full-width title strip and Settings header are always `--layout-header-row` (40px). Explorer and docked Document navigation align with the tab row: `--layout-document-tab-height` (32px) plus a 1px bottom boundary. Search shrinks or becomes icon-only; title/status/actions never wrap into extra rows.
- The document tab row sits below the title strip, including when no document is open. Its 32px tablist scrolls within the space left by fixed active-document actions; the wrapper owns the 1px structural boundary. Activation fills the token height, close remains 28px and focus rings fit inside. Tabs ellipsize and retain horizontal keyboard reveal. Save stays outside the scroller at the right. Header measurement uses the tab row for navigation clearance and overlay bounds. Draft context takes no header/document height (#839): the owning tab row shows a focusable informational status immediately left of Save, separately from the dirty dot. At 1440px it shows the short label; at 640px and in compact groups it uses a centered 16px icon in a 28px slot. Hover/focus reveals the full Save/Source explanation, also included in the accessible name. Both views retain the same position and native scroll when the status appears/disappears; no blank row is reserved without a draft.
- The title strip has one 1px bottom separator across the full viewport, including the native caption reservation in every Outline state (#635/#636/#647). Document scrolling moved below the header in #488 phase 0, so the native scrollbar no longer interrupts the title strip. The reservation reduces the search container's usable content width; it does not shorten the separator. The brand occupies the current Explorer width, showing the existing Desktop SVG at 28px with the configured product-name text, or only the icon when collapsed. The Explorer header and docked Outline tabs share the document tabs' top and bottom boundaries. Expand remains in the second-row rail, preserving its target and Explorer focus path.
- Windows native overlay paint ends before that separator: its height is `--layout-header-row` minus `--border-width` (39px), while both title strip and Settings retain 40px overall (#694). The main-process value is checked against resolved CSS tokens and OS-composed pixels by Windows packaged CI; DOM border geometry alone cannot detect native occlusion. See [Desktop title-bar contract](desktop-distribution-v1.md#integrated-windows-title-bar-605).
- TopBar retains its 20px inline inset. Search is centered in the remaining title-strip area with a 28rem cap and a 32px control; below 22rem available width it becomes a 32px icon button. Location yields before shortcut, then the action label. The full path/shortcut remain in tooltips. The scrolling tablist uses 4px inline insets; tab-row actions use 8px inline insets, 12px between view/file groups and 4px within groups. A fixed 16px status slot beside Save retains the complete live text and tooltip without moving controls.
- Document settings sits above the title, outside ProseMirror (#580); TopBar has no document-settings button. View controls (Visual/Source, Wide document, Outline) and file action groups keep their order, separated by 12px between groups and 4px within groups. Visual/Source is one segmented control: a 28px track with 2px padding holding two 24px segments. Visual/Source raised faces and shadows do not affect layout; document tabs instead use a flat surface with a bottom accent marker (#581). Both retain independent inset focus rings; tab text stays at 0px movement. Current Explorer/Outline/+·slash rows intentionally use 600 semibold as a non-color cue, so glyph widths may change. Explorer retains ellipsis; Outline reserves its semibold text extent with a hidden copy and keeps single-line ellipsis to avoid row-height jumps. Hover/focus preserve the current weight and existing insets.
- The document column centers in the area remaining between the sidebar and the Document panel. Its maximum width is `--layout-content-width` (928px), or `--layout-content-width-wide` (1280px) with the Wide document preference, with 16px outer insets; it never exceeds the available area. Both values are [adjustable values](editor-visual-language-v1.md#adjustable-values-and-preferences). Wide changes only the column width: the content axis, 80px gutter and block rules stay the same.
- Document owns the 80px starting gutter: 8px edge + 28px control + 4px gap + 28px control + 12px safety. Trailing inset is 80px, becoming 16px at ≤1024px.
- The white document surface fills at least the viewport below the measured sticky header, less two outer insets. The column's 16px canvas gap surrounds it; an inset 1px edge changes no width. Long documents grow naturally and end with the adjustable writing end space (`--layout-document-end-space`) as bottom padding. The blank paper below the actual editor content remains clickable to continue writing.
- All top-level block wrappers share the content axis. Block-internal content may inset or center. Controls overlay the gutter and never shift text. The pointer-hover extent starts from the drag-source rectangle (content axis, block top/height, trailing document inset), expanded by `--space-block-hover-inline` (8px left/right) and `--space-block-hover-block` (4px above/below). This uses 8px of the 12px gutter safety, leaving 4px before the handle, and keeps neighboring extents separate within the existing block gaps. The hover corner radius is `--id-radius-block-hover` (small radius plus space-1 and the shared border width, currently 9px). Figure/Equation/table/endnote selected/editing overlays use the same expanded rectangle, radius and inset stroke width; their accent stroke paints above hover when both coincide. The inset strokes share the overlay outer radius. No content border/padding is added: text moves 0px. Hover uses the original vertical block range anywhere inside the document host, including its gutter controls; expansion does not activate the gaps. Gutter, hover and drag geometry observe both the paper and editor content, so content resizing inside a minimum-height paper still updates the handles and overlays. The hover extent is recomputed under the pointer on layout/scroll/transactions, independently of selection; geometry updates do not switch its controls to the selection.
- DocumentView uses the same expansion from the measured top-level block edges, keeping the outline inside the paper's inline padding and separate from the scrollbars. LinkedDocumentView applies that rectangle to each source box and each linked document block. The source outline's spacing, radius and inset stroke follow the source scale. An active outline paints above the source's classification marks without taking space or input from them. Ribbons meet the source outline's right edge and the document outline's left edge at their full vertical spans, clipped at each viewport's ends. The ribbon takes pointer input along its visible path outside the scrollbars.
- #990: Outline/Tables/Figures content starts `--space-4` below its tab boundary,
  aligning its first row with Explorer and the paper top at default docked widths
  (y=89 at 1440×900). Overlay panels retain that tab-to-content gap. Empty navigation
  messages use `--space-1` block padding and label line-height; Explorer empty help is unchanged.
- #1025: expanded Explorer and the Document panel share the Assistant's pointer-captured
  separator and 20px Left/Right keyboard steps. Each remembers its width independently in
  device localStorage, outside document state. Explorer bounds are 200–280px, additionally
  capped to leave 440px of document area at narrow widths; Document panel bounds are
  240–280px. Bounds live in Adjustable values. Defaults, the 48px collapsed rail and
  the 1424px docking boundary stay unchanged. At the docking boundary, both maximum
  widths leave 864px for the document area; default widths still leave 928px. Settings
  category width uses its existing default token independently of Explorer resizing.
- Expanded sidebar width is `--layout-sidebar-width` (240px), or `--layout-sidebar-width-narrow` (200px, so a short folder name fits beside its actions) at ≤1024px; both are [adjustable values](editor-visual-language-v1.md#adjustable-values-and-preferences). It is 48px when collapsed. Below the shared Explorer/Assistant `--layout-navigation-overlay-breakpoint` (1100px), Explorer starts collapsed and expands as a fixed overlay below the title strip; the document always keeps the space beside the 48px rail. The existing 1100px Assistant boundary is reused instead of adding another breakpoint. Both consume this Adjustable value through matchMedia and shell classes (CSS media queries cannot consume custom properties). Each entry into the narrow layout starts closed; returning wide restores the user's explicit docked choice. File selection, outside pointer and Escape close Explorer with focus return; nested menus/dialogs dismiss first. Its shadow and z-index 4 reuse the Document panel overlay; the later-painted right panel wins any overlap, and the modal Assistant remains above both at z-index 20 with background inert. See [shell contract](editor-ux-shell-v1.md#narrow-explorer-overlay-1455). The collapsed rail contains Expand Explorer and the shared Settings footer (#671/#703). Color mode sits beside Settings in expanded Explorer and immediately above it in the rail, using shared 28px ghost buttons and a 4px gap; Settings remains bottom-aligned (#798). Folder-specific New/Close actions appear in expanded file navigation; Open folder is in each folder menu, or in empty Explorer. Document settings uses 14px labels, 12px descriptions/previews, 16px native checkboxes and shared 28px actions. Grouped rows align on the adjustable label column, stacking labels above controls at narrow desktop widths. Its summary ellipsizes secondary values with a full-value tooltip. Long filenames wrap in the expanded body; controls and menu stay within the viewport at 640px. The body is position-independent. Label-column width and title separation are Adjustable values in tokens.css.
- The Document panel is `--layout-document-panel-width` (256px, an adjustable value) and docks at 1424px and wider; closed, it takes no width. The docking width is separate from the 1024px narrow sidebar so the document keeps a readable width beside both panels: at 1424px, 1424 − 240 − 256 = 928px remains, preserving the Standard column (736px of text after outer and inner insets). At 1280–1423px it stays closed by default, preserving the 928px Standard column and single-row TopBar; the former 1280px docking rule left only 592px of text. Below 1424px the panel never takes grid width: opened, it overlays at its width against the right edge (at most the viewport), from the bottom of the sticky header (title strip and tab row, measured as `--app-header-height`) to the bottom of the viewport, and the document keeps its width. When resizing below the docking width, CSS immediately hides any still-mounted docked panel until the media-query state update closes it, so its header cannot overflow the zero-width column. Explicitly opened overlays remain visible. Returning to the docked layout restores the user's last explicit docked open/closed choice, or opens by default if none exists. Overlay interactions do not replace that docked choice; each transition into overlay starts closed. This choice lives only in page memory and resets on reload. The docking width is a media query (`width < 89rem` in `styles.css` and `PANEL_OVERLAY_LAYOUT` in `App.tsx`), not an adjustable value.

The Document panel's Outline / Tables N / Figures N segments form its first visible row, aligned with document tabs (#647), with `--layout-document-tab-height` content and a 1px bottom boundary. They reuse
the Visual/Source 28px track and 24px Button segments; the three labels divide the available
width with the existing compact inline spacing. View segments use 600 semibold for the current value under [DESIGN.md — Typography](../../DESIGN.md#typography), and reserve that label width, so changing selection never moves the track or neighboring controls (#620). The list keeps single-line ellipsis and
semibold extent reservation. Overflow uses ellipsis; the full title remains in the native `title` tooltip and accessible name (#719). Heading/table/figure reveal uses the same measured-header
scroll margin. The accessible Outline heading remains visually hidden; overlay placement stays below the whole measured header.

Desktop reserves native caption-button width using CSS `env(titlebar-area-x)` and
`env(titlebar-area-width)`; ordinary browser tabs reserve no width. The full-width title strip carries that reservation independently of Outline state; search shrinks or becomes an icon within the remaining width. Tab-row actions remain below it. Title-strip empty areas are drag regions and
interactive descendants are no-drag. No fixed caption-button width is used in production.
The Command Center entry centers in that remaining title-strip search area (`.top-bar`),
after the Explorer brand/rail and before any native caption reservation. This applies
in both docked and overlay layouts; the Assistant action reserves equal space on both
sides of search so it does not move that center.

Figure metadata (#757, #1626) is anchored to the full Figure and caption, below when its
largest preview fits and otherwise on the roomier side, with its width/height capped to the owning group's available viewport. Single-group
Sidebar/Outline padding and native scrollbar are excluded. `--layout-figure-popover-width` and
`--size-figure-property-thumbnail-max-width`, `--size-figure-property-thumbnail-max-height`
and `--space-figure-popover-gap` are adjustable; spacing and control dimensions reuse the shared
tokens. Label and Number share a two-column row at both wide and supported narrow widths.
The Number track and Label input share a height and vertical center (#760); revealing the
fixed input or its warning does not stretch the Label field. Media previews retain their own
aspect ratio within the maximum width/height, without a fixed box or letterbox fill.
Across image,
Mermaid, table, Equation and section-label metadata, the Done action row is nearest the target: last
when above it, first when below it. Media is on the opposite edge. DOM and Tab order follow
the visual order; keyed fields retain drafts and restore native focus/selection when the side changes.
Expanded Advanced retains the collapsed label-line clearance before the next row.
Above placement also clears the absolute metadata line.
See [Figure properties](figure-authoring-v1.md#anchored-figure-properties-757).

Metadata reserves the **maximum preview only for direction selection**, not as an empty
visible box. Rendering/decode does not choose a new side. Scroll, window resize and owning-group
boundary changes choose again. Base UI still owns anchors, available size, horizontal collision,
focus and dismissal. Its metadata-only zero-height positioner and the top popup's CSS translation
keep the facing corner fixed in the same layout as a decoded image, without waiting for a later
ResizeObserver position update. Other popovers keep their existing sizing/positioning.
Only the body scrolls at the height limit, leaving the shared action row available.

Mermaid source editing (#1625) keeps its existing full-column `PropertyForm` layout.
Only the source draft preview reserves `--layout-mermaid-source-preview-height` (15rem)
and scrolls overflow inside a focusable native region. Pending, failed and tall renders
cannot change the action row or following caption position. This is a fixed extent,
not a minimum height that a large SVG can exceed. Metadata thumbnails retain the
intrinsic-ratio/no-letterbox rule above; block/inline Equation rendering is synchronous.

## Controls and spacing

Document scrolling belongs to the active tab's viewport below the measured tab row
header (#488 phase 0, #694 follow-up). Its native scrollbar stays at the window's right edge
only below that header. The DOM title-strip border spans the viewport, removing the root
scrollbar interruption; scrollbar width is reserved only in the lower layout. Native window-control
overlay height and actual Windows pixels in document/Settings are verified by [#694](https://github.com/litzio/litzio/issues/694).
Navigation clearance is
the viewport's top plus the target's scroll margin, preserving the existing physical header
clearance. Sidebar and Outline retain their independent scroll regions. See the
[scroll contract](editor-ux-shell-v1.md#document-scroll-container-488-phase-0).

- The [Settings task tab](editor-ux-shell-v1.md#settings-task-tab-1032) retains the shell title strip,
  Explorer and task tabs, with the existing 240px category navigation and a bounded
  680px content column (`--layout-settings-content-width`) inside its editor group.
  The task-tab frame follows [DESIGN.md — Layout](../../DESIGN.md#layout). Label/description and control columns share row axes; selectors use the adjustable
  `--layout-settings-control-width` (240px) and existing 32px control tokens. Content uses
  the 64px inline/32px block spacing scale; below 768px the named category list stacks above
  content with 24px content insets and single-column rows. The body scrolls inside the
  task content area, keeping the shell tabs reachable. #488 keeps the root viewport locked and places document
  scrolling below the header; Base UI respects that lock without a reserved root gutter.
  Settings and document separators must both reach the window edge. #694 changes neither
  the lock nor document scrolling, and its OS pixel checks allow no gutter exception.
  Accent choices (#617) use one row of six 20px circles (compact control size minus
  space-2), 28px radio targets with 8px between circles. Only the current color name appears to
  the right, in 12/16px muted text with an 8px gap. This fits the 240px control axis
  and the 640px viewport. There are no option boxes or names under each circle.

- The [shared file dialog](folder-picker-v1.md#behavior) uses navigation, places, a list that fills the remaining height and a selection footer. Width and height use the existing picker layout tokens and fit the supported viewport. At 640px dates are hidden; selected names remain available through full-path titles.

- B1 (#514): standard controls/inputs 32px (`--size-control`); compact controls/actions/fields 28px (`--size-control-compact`); control radius 6px (`--id-radius-md`); text-button inline padding 12px; centered line icons 16px. Component selection follows [DESIGN.md — Components](../../DESIGN.md#components). Measure actual rendered height after transitions complete. Typography follows [Visual Language](editor-visual-language-v1.md#typography); role-specific exceptions and reasons are in [Deliberate control exceptions](#deliberate-control-exceptions).
- Existing 4/8/12/16/20/24/32/48/64px spacing scale remains. The paper starts 16px below the header; its adjustable top block padding is 32px (16px at ≤1024px), keeping the content start at 48px (32px at ≤1024px), before block margins.
- Typography follows [Visual Language](editor-visual-language-v1.md#typography); changing document type never changes UI control metrics.
- Paragraph/block gaps: 16px. Heading before/after: 32/12px. Figure and Table caption gap: the shared adjustable `--space-document-caption` (8px by default).
- Mermaid's editable-only kind badge shares the out-of-flow metadata row: left badge and right number/label are vertically centered with the existing 8px gap. The label truncates before the badge; hover/selection never changes block height or Edit position. An extra compact-control-height top gap clears the padded badge from the preceding selected outline (#846; [Figure contract](figure-authoring-v1.md#mermaid-editor)).
- Figure and Equation authoring metadata takes no layout space. Tables retain only the number/label content row above the grid in Edit and Read (#1481). Current-row/column tool faces cross the grid border while their normal compact-control pointer targets stay outside text. The outside layer follows scrolling without reserving height/width. Upper Properties remains near the corner and moves along the same metadata row if a narrow column handle would overlap their targets; metadata truncates clear of that group. [Table contract](table-interaction-v1.md#whole-table-tools-793) owns visibility and keyboard behavior.
- Ordinary 16px block and 8px caption spacing is not enlarged for tools. Table row/column menu handles retain 28px square targets and localized names/tooltips; the small face is separate from that target. Breadcrumbs, code language and other UI controls keep their existing geometry and owners.

- Endnote definitions: one trailing region, 16/24px text, 24px number inset and space before/after the region, 8px between definitions. Only the first has a 1px rule, 12px to the 12/16px `미주` label, then 8px to the definition. Original source disclosures keep their existing dimensions; the [Endnotes contract](footnotes-v1.md#endnotes-presentation) defines display order and source conversion.
- `components/ui` and legacy native primitives share product tokens; refs, events and selection are preserved.

### Deliberate control exceptions

| Role | Exception and reason |
| --- | --- |
| Title slot, inline math/reference/link content, endnote reference/return numbers | Document-sized text, not 32px toolbar actions. Preserve body/title/superscript typography, line height and content radii. Their editing forms use ordinary UI fields/actions. |
| Block metadata label chip | Content-sized shared 12/16px metadata with existing space-1 inline padding and small radius. Keeps Figure/Equation's out-of-flow gap and Table's metadata row; no enlarged invisible target covers adjacent document text. Native button Enter/Space and inset focus ring retain keyboard entry (#847). |
| Section-label edit | Content-sized 12px monospace metadata with its existing 4px radius; preserves the out-of-flow heading annotation. Its property form follows B1. |
| Inline reference/citation edit and citation-key remove | Retain the existing 18px corner edit / 16px chip remove targets, 12px icons, zero icon line box and 4px radius. Enlarged invisible targets could cover neighboring document text or keys; preserving selection, wrapping and line height is safer. Accessible names and keyboard focus rings remain. This is a deliberate tiny-target exception, not permission for new toolbar actions. |
| Table row/column handles | 28px-high targets with 16px line icons and localized address names/tooltips (#517). Both targets are 28px square and centered on the corresponding column/row boundary; visible faces use the smaller table-tool token. State expression follows [Visual Language](editor-visual-language-v1.md#state-rules) and [Table interaction](table-interaction-v1.md). |
| Breadcrumbs and wrapping list/menu rows | At least 28px; actionable paths and translated multi-line content may grow rather than truncate or overflow. Breadcrumbs use 4px inline padding to keep long paths reachable. |
| File tree, Outline, recent-folder/picker options and menu primitives | Retain their navigation/selection/focus owners and token-backed row geometry. They are not generic fixed-height action buttons. Command center results retain 36/56px and 4px radius for one/two-line result navigation; CommandMenu rows follow the shared 6px menu rule. |
| Document tabs and close slot | Use the adjustable 32px navigation row, a full-height activation area, 28px close target with a 16px icon and the existing roving keyboard owner. State expression follows [Visual Language](editor-visual-language-v1.md#state-rules). |
| Visual/Source and Outline/Tables/Figures | The documented 24px inner segment sits inside a 28px track; measure the whole segmented control. Outline navigation reuses these Button faces, selected/focus tokens and typography in its own document-tab-height row below the drag header (#613). |
| Native checkboxes | 16px OS checkbox inside an associated label target of at least 28px; retain native accessibility, accent and focus behavior. |
| Accent swatch radios | Six 20px circles in 28px circular targets, with 8px between circles (4px inside each target edge). Size is compact control minus space-2; no new size token. Only the selected name appears to the right, with a space-2 gap. State and focus follow [Visual Language](editor-visual-language-v1.md#state-rules). |
| Picker path input | 20px inner line box inside the recognizable 32px/6px field wrapper; the wrapper owns boundary and focus. |
| Multiline LaTeX/recovery fields | Block source minimum 80px, inline math minimum 64px, recovery minimum 128px, retaining editable/copyable multi-line content rather than a one-line action size. Recovery's 4px field radius remains a specific existing treatment. |
| Content/surface radii | Existing 4px content, 8px popover, 12px dialog and 6px paper radii express content/surface hierarchy; the shared 6px radius is a control rule. |

## Exceptions and checks

- TopBar prioritizes its search action, with optional muted location/name; the full unchanged address remains in the secondary information title.
- Tables wrap prose within the document width first. Cells use `overflow-wrap: break-word`, preserving ordinary word widths for intrinsic sizing; an inline-size container caps each cell’s intrinsic maximum at `max(28px, 50cqi)` so a long URL alone need not expand the table. At table scroller widths up to 30rem, inline cell padding uses 8px instead of 12px to leave room for intact words (#901). Cells keep the adjustable `--size-table-cell-min-width` (28px). Tables whose word widths and cell minima cannot fit scroll inside their block, while Table 1 fits at 640px with Explorer expanded (#901). Multiple columns of very long identifiers can still scroll; ordinary word preservation takes priority ([table contract](table-interaction-v1.md#cell-wrapping-897)). Formulas scroll inside their block, with a thin scrollbar where the platform draws one and a fade (`--size-overflow-fade`) at an edge with more content; the fade follows the scroll position and is absent without overflow. Source soft-wraps Markdown lines, including unbroken text, within the available width without horizontal scrolling (#476). Each source line has one gutter number; continuation rows align with its text, leaving the number gutter clear. Wrapping is display-only and preserves source text/Copy. Overlay contents may scroll if viewport height demands it. Never hide overflow on the whole document or restyle KaTeX internals to make measurements pass.
- Overlay positioning respects the viewport and sticky header. Required controls must exist and stay reachable.
- `new-document.browser.js` checks the empty surface at 1440 and 768px, first hint and insert visibility without hover, New focus, immediate typing/undo, blank-paper click, actual empty Save/Source and real-file Save → Reload. Cancel and rejected New return to the opening control without creating a file.
- CI scope (#1009 F08): local/unset `LITZIO_TEST_LAYOUT_SCOPE` and release run the full matrices below. Ordinary PRs use `representative` unless the [CI layout paths](../../scripts/ci-execution-policy.mjs) are affected. Representative layout geometry retains 1440/1424/1423/1280/1279/1025/1024/705/704/640px with expanded sidebar, plus collapsed sidebar at 1440/640px; overlay checks retain 1423/1024/704px, inline settings retain 1440/640px, and the TopBar matrix retains all four boundary widths and both panel/sidebar states in Korean. English/Korean UI isolation, delayed narrow Settings focus (#541), 640px keyboard/menu checks, explicit docking transitions and wide-document persistence remain unconditional. Full-only widths/locales continue to run on shell/CSS/Desktop changes and release. Desktop bridge geometry retains all four widths and both sidebar states, with light theme/138px caption reservation; 640px also retains both Outline states. Other theme/reservation/panel combinations remain in the full run; bridge theme propagation and contrast assertions remain unconditional.
- `layout-rules.browser.js` measures real scratch documents at 1440, 1424, 1423, 1280, 1279, 1025, 1024, 768, 705, 704 and 640px with sidebar open/collapsed and a folder shown. No-element results fail. It checks the sidebar and docked panel widths against their variables, 16px sidebar icons and top-level tree icon/text alignment, the overlay at 1423, 1280, 1279, 1024, 768 and 704px (document width unchanged, no sideways scroll, top at the header's bottom, Save, File actions and the Outline toggle uncovered, Escape returns focus to the Outline toggle) and that hiding the docked panel widens the centering area by its width. Boundary checks preserve the 928px Standard column at 1424px and a single-row TopBar at 1280–1424px, retain explicit docked open/closed choices through resize, keep overlay dismissal separate, and reset the choice on reload. At 640px with the Sidebar expanded and collapsed, every tab-row action remains inside the viewport on the fixed second row with no sideways page scroll, in reading order, 4px apart within a group and at least 12px between groups; Wide document remains available in ⋯; the Reload menu stays inside the viewport. At 1920px it toggles Wide document in the tab-row actions and checks the column against `--layout-content-width-wide` (capped by the area), centering, the shared axis, the text inset, unmoved TopBar controls and the preference surviving a reload without changing document content/dirty state. It also checks inline document settings/control bounds and Escape disclosure focus at 1920/1440/1280/1024/768/640px (#580). The block uses the document content axis, independently of Sidebar width. An additional English/Korean matrix at 1280/1423/1424/1440px covers both Sidebar states and both Outline states, asserting 40px height, centered placement, 160px minimum command button, visible controls without overlap and secondary-location/shortcut/action reduction order.
- No change to Core/CLI, document semantics, save API, Tiptap state architecture or backend persistence.

## Form content viewport #782

`documentContentBounds` shares FigureProperties' content-boundary calculation with
`useOverlayBounds` (link/reference/citation forms, selection toolbar, menus and reading
previews) and `BlockProperties` (inline math). Figure, table and section-label metadata now share
`MetadataProperties` with target-wide anchoring and Done completion (#791).
The width cap lets existing fields/actions wrap inside the available area. Form
appearance, anchor alignment, confirmation and draft behavior keep their contracts.
The opening focus target stays stable through the boundary measurement render;
existing `property-drafts` and `inline-math-authoring` focus checks verify this.
This is Editor interaction only; Core/CLI semantics are unchanged.

The `cross-reference` regression checks 1440×900 and 640×900 with Outline open/closed,
including the 640px overlay panel and an expanded Sidebar. It opens actual targets
near the visible right edge, checks each form and enabled control against document
bounds, and hit-tests controls to detect covering panels. The same section-label
form also stays usable while Outline changes. `editor-groups` checks reference and
link forms in both columns; 640px retains the existing automatic single-group merge.

## Table display choice (#902)

The default remains the wrapping geometry in [Cell wrapping](table-interaction-v1.md#cell-wrapping-897).
The device's per-document single-line choice removes the cell intrinsic maximum and
uses nowrap, with the existing local scroller, edge fades and measured handles.
It introduces no new document gutters or control sizes. Settings uses the existing
select row; the table block menu separates its View checkbox from mutation groups.

## Title-strip notifications (#1644)

The owner approved the compact Bell beside Assistant in the existing title strip.
The closed button is entirely above every document viewport; no document bottom
strip, scroll-height reservation or minimum-height change is introduced. The same
window-scoped button remains available for documents, plugin screens and Settings.
It reserves an icon slot beside Assistant and the native caption-control reservation.
The command action keeps its existing detail-reduction order and remains available.

The button uses the shared compact icon Button and Tooltip, neutral/severity colors
and a count badge. Its name/tooltip is Notifications; the accessible description
retains the localized severity/count or empty state. Registry, polite announcement,
grouping, dismissals, progress/actions and error auto-expansion keep their owners.
The nonediting notification DOM/history boundary remains outside `.app-shell`;
its fixed title-strip coordinates match the reserved chrome slot. Native no-drag
and the narrow modal assistant's hidden/inert boundary remain in effect.

NotificationCenter owns one presentation state: closed, automatic or manual. One
registry, contents tree, announcement, grouping/dismissal state and focus owner are
shared; the two presentations never render duplicate notification rows.

New errors, warnings and named progress/actions use the master's panel-aware
bottom-right card appearance and list rectangle. The former bottom bell/gap area
is left clear; the persistent bell itself exists only in the title strip. Automatic
cards are named regions, not dialogs, and keep the master's temporary, dismissible
body overlap without covering the Save/Reload/view toolbar. They do not move focus
or dismiss on document focus changes. If the user is already reading a manual list,
new causes update it without moving its location or focus. Bell activation collapses
an expanded presentation; activation while closed opens the manual list.

The existing Base UI Popover anchors only the manual list below the bell and fits
it within the viewport. It is a named nonmodal Notifications dialog, distinct from
Save/New/Reload modal dialogs. Focus-only document navigation keeps it open; outside
pointer dismissal and Escape close it. Escape from a focused notification action
returns to the bell. Closed contents remain a hidden native list for the existing
producer lifecycle, with no mounted popup to block Settings Escape. The narrow
modal assistant hides/inerts both presentations through the shared external outlet.

The bell is centered in the 40px title strip beside Assistant with an 8px action gap.

At 640px + 138px native-caption reservation, Assistant becomes an icon, the command
button is at least 160px and all three rectangles are disjoint and left of caption
controls. At 1440px Assistant keeps its label. The adjustable transition is
`--layout-assistant-label-breakpoint` (30rem), resolved by the existing TopBar
ResizeObserver rather than a repeated container-query literal.
