# Editor UX Shell v1

#1174 PR1: tab lookup and folder state use `(hostId, Host-returned path)` identity;
remembered navigation and per-document table preferences are stored per hostId.
The runtime still exposes only `local`, with the existing surfaces and interactions.
Host registration, routing and Host sections/labels follow ADR-0018 PR2–4.
Old path-only preferences are ignored without migration. See the
[session identity contract](editing-session-save-v1.md#host-scoped-identity-1174-pr1).


#1150 ③ (2026-11-04): AI는 daemon 공식 기능이며 Settings → AI agent에서 관리한다. 공통 Button·SettingsSelect·Dialog와 기존 설정 화면 배치를 재사용한다. 플러그인 등록/관리/기여 탭·Docling은 제거했다. 아래 플러그인·Docling 관련 과거 캡처/검증 서술은 현재 기능이 아니며 [보관 소스](https://github.com/litzio/litzio/tree/archive/plugins-docling-2026-11) (`ce90560a`)의 기록이다. 현재 AI 계약은 [Main agent](main-agent-v1.md), 결정은 [ADR-0017](../adr/0017-bundled-client-and-official-ai.md)을 따른다. Host 클라이언트와 Desktop 번들 UI는 [HTTP Host 계약](http-host-v1.md#desktop-bundled-origin-1150-⑤)을 따른다.

- Status: Implemented
- Last verified: 2026-11-13 (검증 이력 분류·이동과 링크 대조. 기존 계약 문구 보존; 제품·브라우저·Desktop 재실행 없음).
- Run-as verification: 2026-11-05 — #1199 Windows Host health/capability·CLI lifecycle and two-Host persistent Chrome fixture; 1440px/640px footer captures. Actual Windows Desktop to Linux connection remains unverified.
- Host identity verification: 2026-11-05 (#1174 PR1: targeted Editor unit tests, workspace typecheck, boundaries/docs and persistent-Chrome recovery/storage/structure, document-tabs, folder-memory and file-actions; no multi-Host connection or packaged Desktop execution).


- Scope: existing Editor interactions. [Visual Language](editor-visual-language-v1.md) and [Layout Rules v1](editor-layout-rules-v1.md) define presentation and geometry.


Brand defaults and packager overrides follow [the branding guide](../guides/branding.md) (#859). Product identity is separate from the fixed internal Host API; earlier verification records do not establish a migration from old Beta builds.

검증 이력은 [별도 기록](../reviews/editor-ux-shell-history-2026-11.md)에 보존한다.


## Read / Edit / Source (#849)

Native document tabs start in **Edit** and expose **Read | Edit | Source**
(**읽기 | 편집 | 소스**) in their owning group's tab row. The Command Center exposes
**View: Read / Edit / Source** through the same handlers. Each tab retains its own
view while switching or moving between groups; reopening starts in Edit. This is
window-memory presentation state, absent from document settings, saved content,
recovery snapshots and restored-tab preferences. Text-mode tabs expose none of these
three switches or commands.

Read uses the same mounted `DocumentEditor`, projection, NodeViews and single
Tiptap/ProseMirror state as Edit, with `setEditable(false)`. Block hover/selection,
keyboard movement, native text selection/copy, reading previews and Outline remain
available. Browser Find/Print/zoom shortcuts retain their native defaults while the
reading surface has focus. Navigation within Read, including notification/problem navigation, stays
in Read. Since ProseMirror skips editable key handling, a Read-only DOM bridge
forwards navigation to the existing keymaps and uses ProseMirror selection APIs at
selected block boundaries. Text caret movement/extension delegates to the browser's
native Selection and maps back through ProseMirror's public position/selection APIs;
no alternate renderer or editor engine is introduced.

In Read, clicking text after a selected preview must move the reading caret
normally (#815). Edit's guard against a focus-only caret replacing its temporarily
non-editable preview selection applies only while the engine is editable.

Read hides authoring tools, formatting, block/table actions, document settings and
property forms, and disables Save (button, shortcut, command and close-confirmation
Save). A transaction filter additionally refuses every document-changing transaction,
including explicit commands, Undo/Redo and late form callbacks. Native paste/drop
cannot insert text, HTML or image assets. Reload/close keep their existing work-loss
confirmation; Cancel returns to Read, and saving requires returning to Edit first.

Unapplied forms stay mounted with their owners' draft values and registration. Read
suspends authoring UI and renders applied Equation/Mermaid source instead of the
draft. Its tab-row draft indicator remains visible; Edit restores the forms and
values. Clicking Read or opening the Command Center does not complete metadata as
an outside click. View changes do not acknowledge Save, reset history or write
recovery records. Applied work, dirty state and revision are unchanged.

`DocumentEditor`'s `readOnly` prop is also the rendering/navigation boundary for
module consumers. The removed Docling comparison used a thin `ReadOnlyDocument`
adapter in fixed Read without view controls (#815). Its optional engine-neutral
geometry and selection callbacks connected that surface to the module's source matching;
see [Docling comparison](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/docling-compare-v1.md). These view-only changes need no
Core/CLI operation.

## Plain text mode (#817)

Existing `.txt` and Core-incompatible `.md` files open automatically in a separate
text tab. Under #939, non-native `.md` defaults to a view-only Markdown reading
screen with Read/Text segments in the existing tab row; Text reveals the existing
monospace textarea. `.txt` still opens directly in Text without a view toggle.
The reading screen renders the current buffer, including unsaved edits. Switching
views keeps the textarea mounted and preserves its input and editing session.
A short localized notice identifies the non-native text kind. There are no
formatting/block tools, native Visual/Source views, document settings, Outline or
native pre-save comparison.

The display uses the patched markdown-it 13.0.2 with tables, disabled task-list
checkboxes, footnotes and dollar math rendered by existing KaTeX (`trust: false`).
Raw HTML is disabled (`html: false`); HTML is displayed as escaped text rather than
accepted into the DOM. Relative images use the existing Host media route and its
Root checks; HTTP(S) images can display. Other image schemes are refused. External
HTTP(S) links use the existing external opening path; relative document links do
not navigate. Footnote links navigate only inside the reading surface. Mermaid
stays a code block. Rejected MyST directives may appear as ordinary text or code
blocks: this is a generic Markdown display, not a native-document conversion.
The reading screen reuses native Read's `document-column`, `document` paper and
`document-editor` typography, including the global Page style (Paper/Flat), document
width, margins and light/dark tokens. Markdown headings, paragraphs, lists,
quotes, tables, code and equations use the existing native classes. No Core
admission, rewrite or serialization is involved. Native authoring controls,
numbered captions and the empty frontmatter title slot are not synthesized.
Markdown images retain a display-only max-width rule and KaTeX overflow containment.
Outline remains unavailable: the existing shell panel consumes native editor
positions and session callbacks, so reuse would require changes beyond the text tab.

Text editing shares the same `document-column` and `document` paper, body width
and padding as Read, so switching views keeps the page position and text origin.
The textarea has no border, corner radius, separate background or box focus ring;
its caret follows the native document convention. It grows with the buffer and the
document viewport owns scrolling. Line numbers are not included.
Both `.md` and `.txt` textareas use soft wrapping, including long unbroken tokens,
without horizontal scrolling or inserting stored newlines. Text editing shares
the document word-break token (Korean words stay together), also used by plain
Markdown tight-list items and table cells, with overflow-wrap
as an emergency fallback for unbroken identifiers. The mounted textarea
retains cursor, Undo, dirty state and Save/recovery behavior. Its monospace font,
size and line height follow the existing native Source convention; there is no wrap
toggle.

#1343 comparison evidence (same body, localhost fixtures; account footer masked):

| View | 1440px English Light | 640px Korean Dark |
| --- | --- | --- |
| Native Read reference (unchanged) | [Reference](assets/plain-markdown-1343/after-compare-native-1440.png) | [Reference](assets/plain-markdown-1343/after-compare-native-640.png) |
| Markdown Read before / after | [Before](assets/plain-markdown-1343/before-compare-markdown-1440.png) / [After](assets/plain-markdown-1343/after-compare-markdown-1440.png) | [Before](assets/plain-markdown-1343/before-compare-markdown-640.png) / [After](assets/plain-markdown-1343/after-compare-markdown-640.png) |
| Long-line Text before / after | [Before](assets/plain-markdown-1343/before-compare-edit-1440.png) / [After](assets/plain-markdown-1343/after-compare-edit-1440.png) | [Before](assets/plain-markdown-1343/before-compare-edit-640.png) / [After](assets/plain-markdown-1343/after-compare-edit-640.png) |

The common implementation follows the UI decision table's existing document
surface and Button/CopyButton controls. Native engine-owned title, table handles,
numbered captions and code language editing are intentionally absent from the
display-only Markdown surface; these account for spacing differences around those
controls. No new shared interaction or token system is introduced. The text-mode
browser scenario checks paper/flat preference, native surface classes, long-line
scrollWidth/clientWidth for both file types, Undo and exact Save/Reload source.
Capture-only comparison traversal runs only with `--screenshots`.

Earlier #939 evidence:
`pnpm browser:test text-mode --screenshots` reproduces the display evidence:
[1440px Light](assets/plain-markdown-939/1440-light.png),
[640px Light](assets/plain-markdown-939/640-light.png), and
[640px Korean Dark](assets/plain-markdown-939/640-dark-ko.png). The same scenario
checks the default Read view, headings/table/Host image rendering, unsaved-buffer
Read/Text switching and existing Save/recovery/conflict behavior.
The existing tab row retains Save, status and file actions. Other extensions retain
their existing preview/information behavior. Explorer and Command Center include
`.txt` files; native marker hints remain hints, never admission rules.
See [document kinds](document-support-v1.md#text-files-in-the-editor-817) and
[Save/recovery protection](editing-session-save-v1.md#text-editing-sessions-817).
The native Source screen remains read-only canonical Markdown from Core; it is not
the text editor and never provides a raw native-document replacement path.

## Docling comparison tabs (#769)

The command, tab kind and expanded-sidebar footer action now come from the
[versioned UI contribution contract](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/plugin-ui-v1.md) (#857). The shell owns tab
identity/group placement and generic folder navigation. Disabled contributed
tabs retain their context, can be moved/closed, and reconstruct their content on
re-registration without a page reload. They create no editing/recovery session.

The sidebar opens the read-only module tab described in
[Docling comparison](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/docling-compare-v1.md), under [ADR-0011](../adr/0011-code-module-boundary.md).
Its entry sits in the sidebar footer above Settings, separate from Explorer's
empty-state help and folder navigation. Collapse Explorer → Open folder retains
its existing Tab order; the collapsed rail exposes Explorer, Color mode and Settings.
After Explorer's file navigation, the footer's Tab order is Template gallery → Settings → Color mode → Desktop menu (Desktop only) → active Host execution account → TopBar. The account stop exposes the full value and permission explanation through the shared tooltip.
The rail keeps Settings, Color mode and Desktop menu above the bottom execution-account status.
It shares tab navigation/closing while remaining outside document editing,
Save/recovery sessions and startup tab restoration.

## Two editor groups (#488 phase 1)

There are at most two editor groups, in fixed equal columns separated by a 1px
structural boundary. Each has its own scrolling tablist and active-document
Read/Edit/Source, Save/status and File actions at the right. The title strip is shared.
Pointer or keyboard focus in a group's tabs, actions or document makes that group
the target of Outline, Command Center and shell shortcuts. Both documents remain
independently scrollable and editable. The focused group's tab row uses the existing
selected-surface color as a cue; individual tab selection keeps its accent marker.
Equal filenames keep their distinguishing parent-folder labels across both groups.

Floating editor controls stay inside their owning group's native document viewport,
excluding its scrollbar: text formatting, slash/insert/block menus and inline link,
reference and citation forms. Their existing 8px inset applies on each side. The shared
bounds helper caps width/height before measuring and placing the overlay, so long menus
wrap or scroll within the group. It observes that viewport as well as the overlay;
window resize, group resize/movement and document scrolling refit the same controls.
Single-group mode retains the previous window/header bounds and CSS size limits.

Open to the right is available in tab context menus, document File actions, Explorer
document context menus and Command Center. It targets the right group, creating it
when necessary. Move to other group is available from tab/File menus and Command
Center when two groups exist. There was no tab drag interaction to extend; these
commands provide keyboard and pointer movement. An ordinary document Open targets
the focused group. Selecting an existing tab in Command Center focuses its owner.
Opening an already open document in another group moves that same tab. No second
session, editor, undo history, property draft or recovery record is created. Moving
the last tab out of a group, closing it or deleting its file removes the empty group.

Each group needs **440px**, derived from the supported 640px desktop viewport minus
the existing 200px narrow expanded Explorer. Split documents use the existing narrow
paper trailing inset (16px), preserving the 80px starting gutter. The available
document area must be at least **881px** (2 × 440px + 1px boundary), after the current
Explorer and docked Outline reservations. Split commands are disabled below this
width. Resizing the window or opening a side panel below this limit merges both tab
lists in left-to-right order and retains the focused active tab. Tabs stay mounted;
unsaved content, drafts, history and each document's scroll position survive. Widening
the window does not split again automatically.

Group layout is page memory. The existing [navigation-only tab memory](editing-session-save-v1.md#tab-navigation-memory-383)
continues to remember flattened tab order and the focused active path, without a new
preference format or recovery mechanism. Reload restores those documents in one
group through the existing Host validation and recovery precedence. No stored-data
migration, Core semantic operation or CLI surface is needed for this editor interaction.
Derived screens, a third group and divider dragging remain outside phase 1.

## Title strip and tab-row actions (#695)

The shared title strip is always exactly one `--layout-header-row` (40px): brand,
Find documents and commands, and Desktop caption reservation. Search shrinks within
its remaining width, yielding secondary location then shortcut then label; below a
22rem available title container it becomes a named search icon button. Its tooltip,
shortcut and accessible name remain unchanged. One 1px DOM bottom separator spans
the entire viewport at y=39, including the native caption reservation.

The second row is always 32px plus its 1px boundary, including the start screen with
no document. Only the tablist scrolls horizontally; Read/Edit/Source, layout toggles,
status, Save and File actions stay fixed at the right of that row. At viewport widths
up to 1024px the less frequent Wide document toggle moves into ⋯ as a checked menu
item. Outline remains a direct button so its overlay Escape/focus-return path remains
stable. Document actions (including Save, views, split/layout controls and File actions)
are hidden when the group has no active document tab, including the empty start
screen and plugin tabs (#973). Text document tabs retain their existing subset of
actions. Pending document work retains its disabled guards. No special tab is added.

Each row receives the actions and status of its own active document. #488 phase 1
adds the groups described above. Existing independent tab sessions, Save/shortcut,
Source, Reload/discard, Compare, Copy path, Command center and error/conflict
MessageArea paths are retained. Explorer → search → document tabs → document actions →
content follows DOM keyboard order. Tabs retain roving navigation, close and dirty dots.

When tabs are partially or fully outside the scrolling list, a fixed compact
button shows their count (#972). Its localized accessible name and tooltip explain
that these tabs are hidden. The shared dropdown lists their names (including
same-name folder disambiguation) and dirty dots; pointer or keyboard selection
activates and reveals the chosen tab. Each split group owns its list. Resizing and
activation reveal the active tab without scrolling document content. Existing
close/move/open-right and #973 action visibility remain unchanged.

A fixed 16px status slot next to Save shows a small filled dot for unsaved work,
a check for saved, a progress glyph during operations, or a warning glyph on failure.
The complete localized status stays in the polite live region and native tooltip.
A clean Ready state leaves the slot blank; status transitions move no action.
MessageArea can add notification height below these two fixed rows. It does not
change the title-strip or tab-row height. Document semantics and CLI are unaffected.

The native overlay height and actual Windows overlay pixels remain #694's scope;
#695 preserves env(titlebar-area-*) reservation and drag/no-drag boundaries. Both
issues touch title-strip geometry, so integration must retain this fixed 40px row
and #694's separate overlay fix.

Same-state manual captures use base master `bbfdd948` and this implementation in
this worktree, Vite origin 127.0.0.1:5173, persistent Windows Chrome, English UI,
Paper, bundled Pretendard/fonts ready, DPR/zoom 1 and 900px height. Three tabs are
open; technical-2 is active with the same unsaved heading edit, scroll 0 and no
focus/hover. Open means Sidebar and Outline open; below 1424px Outline overlays.
Local verification: Editor 335/335; final shell/token checks 39/39, workspace typecheck,
production Editor build and docs checks. Four persistent-Chrome launches were used:
first manual-tour URL error, successful Before tour, After + layout-rules (then the
old long-filename width assertion failed), final After + quiet-document (then a
flex-shrunk test probe in document-tabs failed). The filename assertion now checks
readable visible text, full close-target containment and exact path tooltip. The
probe now resists flex shrinking so it measures the actual 16px token; actual icon,
focus and target checks retain their original values. The latter correction and
remaining browser suites are verified by PR CI. Local runs 3/4 stopped at the first
failure to prevent worker restarts exceeding the four-launch cap; the temporary
maxFailures setting and capture scenario are removed. No retry, timeout increase,
skip or permanent runner change is introduced. Before each launch BadPasswordAttempts
was 1/2/2/2. Desktop packaging/update/uninstall and Edge remain CI-only.

These 16 pairs are manual evidence. Every After measures a 40px title strip plus
33px tab row and a continuous 1px DOM separator. Before records the previous
wrapping rather than claiming it meets the new two-row contract. Native overlay
painting is not verified. [Before geometry](assets/tab-row-695/before-geometry.json),
[After geometry](assets/tab-row-695/after-geometry.json), and
[environment/source/image hashes](assets/tab-row-695/capture-metadata.json).

| Width / theme / panels | Before | After |
| --- | --- | --- |
| 640-light-closed | [Before](assets/tab-row-695/before-640-light-closed.png) | [After](assets/tab-row-695/after-640-light-closed.png) |
| 640-light-open | [Before](assets/tab-row-695/before-640-light-open.png) | [After](assets/tab-row-695/after-640-light-open.png) |
| 640-dark-closed | [Before](assets/tab-row-695/before-640-dark-closed.png) | [After](assets/tab-row-695/after-640-dark-closed.png) |
| 640-dark-open | [Before](assets/tab-row-695/before-640-dark-open.png) | [After](assets/tab-row-695/after-640-dark-open.png) |
| 1024-light-closed | [Before](assets/tab-row-695/before-1024-light-closed.png) | [After](assets/tab-row-695/after-1024-light-closed.png) |
| 1024-light-open | [Before](assets/tab-row-695/before-1024-light-open.png) | [After](assets/tab-row-695/after-1024-light-open.png) |
| 1024-dark-closed | [Before](assets/tab-row-695/before-1024-dark-closed.png) | [After](assets/tab-row-695/after-1024-dark-closed.png) |
| 1024-dark-open | [Before](assets/tab-row-695/before-1024-dark-open.png) | [After](assets/tab-row-695/after-1024-dark-open.png) |
| 1234-light-closed | [Before](assets/tab-row-695/before-1234-light-closed.png) | [After](assets/tab-row-695/after-1234-light-closed.png) |
| 1234-light-open | [Before](assets/tab-row-695/before-1234-light-open.png) | [After](assets/tab-row-695/after-1234-light-open.png) |
| 1234-dark-closed | [Before](assets/tab-row-695/before-1234-dark-closed.png) | [After](assets/tab-row-695/after-1234-dark-closed.png) |
| 1234-dark-open | [Before](assets/tab-row-695/before-1234-dark-open.png) | [After](assets/tab-row-695/after-1234-dark-open.png) |
| 1440-light-closed | [Before](assets/tab-row-695/before-1440-light-closed.png) | [After](assets/tab-row-695/after-1440-light-closed.png) |
| 1440-light-open | [Before](assets/tab-row-695/before-1440-light-open.png) | [After](assets/tab-row-695/after-1440-light-open.png) |
| 1440-dark-closed | [Before](assets/tab-row-695/before-1440-dark-closed.png) | [After](assets/tab-row-695/after-1440-dark-closed.png) |
| 1440-dark-open | [Before](assets/tab-row-695/before-1440-dark-open.png) | [After](assets/tab-row-695/after-1440-dark-open.png) |

## Explorer name (#703)

The left Sidebar is named **Explorer / 탐색기**. Its heading, empty-region name,
Command center file-result category and expand/collapse command use this name.
The expanded control is **Collapse Explorer / 탐색기 접기**; the collapsed rail
control is **Expand Explorer / 탐색기 펼치기**, for both accessible name and tooltip.
The shortcut guide contains no Sidebar-specific entry or binding to rename.
The folder-menu command **Open in File Explorer / 파일 탐색기에서 열기** (#487)
still names the Windows application and keeps its existing wording.
Only display strings change: icons, geometry, command IDs, keyboard/focus behavior,
mounted tree and document semantics remain unchanged. No Core/CLI operation is needed.
This naming supersedes the Files wording in earlier verification records and captures.

Same-state manual comparison: Windows persistent Chrome through `pnpm browser:test`,
1440×900, English, light theme/OS, DPR 1, viewport scale 1, default 100% zoom, bundled
Pretendard after `document.fonts.ready`, technical-document fixture, no opened folder,
Sidebar expanded, Outline docked, scroll 0, focus blurred, pointer at (1439, 899).
Before is `a1be38ce063a10bf5068d077e07b8884455967e4`; After is the same worktree with
this PR's naming changes. Captures are manual review evidence, not pixel assertions.

| Representative expanded state | Before | After |
| --- | --- | --- |
| 1440×900 | [Files](assets/explorer-label-703/before-1440.png) | [Explorer](assets/explorer-label-703/after-1440.png) |

## Document scroll container (#488 phase 0)

Each mounted document tab owns one native `.document-scroll` viewport. Hiding a tab retains
its scroll position with its existing editor/session; closing it releases that element. Visual
and Source share the tab's viewport. No scroll position is persisted across application reloads.
`documentScrollContainer` is the single lookup for the owning viewport; shell actions can use
the focused surface, including the document start surface. #488 phase 1 bounds each
visible document's viewport to its editor group; hidden tabs keep their viewport.

The viewport spans the window width **below the measured tab row** (#694 follow-up).
Since #1183/#1182, Base UI ScrollArea hides native scrollbar paint while preserving
the native viewport. Its always-visible-when-needed overlay track stays within the
document's existing trailing inset, before docked navigation or at each split group's
edge ([geometry and captures](editor-layout-rules-v1.md#alignment-and-ownership)). The root does
not scroll; the DOM title strip and its bottom boundary extend across the whole viewport.
This removes interruption caused by the root scrollbar. Browser geometry/captures do not
verify native window-control overlay painting; overlay height, Settings gutter and native
pixel verification belong to [#694](https://github.com/litzio/litzio/issues/694). Its content keeps
the existing Sidebar/Document panel insets, centered column, paper dimensions and measured
header clearance. No scrollbar width is added to shell columns or panel offsets;
overflow changes therefore leave paper, tab actions and navigation geometry unchanged.
Base UI observes viewport/content size and native scroll events for its thumb.
Sidebar and Outline retain their independent
scrolling. Only the visible Visual editor subscribes to document scrolling for Outline/Tables/Figures;
the same reading line, reveal pin and bottom-of-document behavior are retained.

Native DOM `scrollIntoView` and ProseMirror's ancestor scrolling now reach the owning viewport:
Outline, Find/Command center, save refusal locations (#578), cross references/endnotes, caret
reveal, list/block movement and scroll preservation retain their existing paths. Block handles
and local overlay bounds retain their capturing scroll listeners, which receive descendant
container and horizontal-table scrolling. Portaled Base UI popovers explicitly use the owning viewport as their
collision boundary, allow the library's sticky shift when resize/scroll moves the anchor out of
view, and retain its anchor/scroll tracking. Native drag edge scrolling uses
the document viewport. No per-block scroll listeners or independent editor engine are added.

PageUp/PageDown, Space/Shift+Space and Home/End also scroll the active document when focus is
in the surrounding shell. Editable controls, modal/menu keys, native button/link activation,
and independent scrollable file/Outline lists keep their own keyboard behavior. Print media
releases the fixed viewport and its overflow, removes shell navigation, and exposes the whole
active document in normal flow. Hidden tabs remain hidden.

## Explorer path copying (#1336)

File, folder and opened-folder header context menus offer Copy path and Copy relative
path before file mutations. The full path belongs to the target Host; relative paths
start at the opened folder, use `/`, and use `.` for that folder itself. The header
More menu shares these actions; the separately maintained child-folder More menu is
unchanged. Clipboard success and failure use the existing App path-copy notifications.
This Editor clipboard interaction has no CLI counterpart.

Self-reviewed Korean/Dark evidence: [1440px](assets/copy-path-1336/copy-path-1440-ko-dark.png)
and [640px](assets/copy-path-1336/copy-path-640-ko-dark.png). Captured with the file-actions
browser fixture at DPR 1; Host addresses are masked. This is visual review evidence,
not owner visual approval or a real remote-Host acceptance test.

## Folder context menus (#1011 / #1012)

Right-clicking an opened root header offers New document, New folder, Open folder,
Open in File Explorer (when supported), Refresh and Close folder through the shared
ContextMenu. Its action definitions are shared with the existing header + and More
menu; the + remains the New document shortcut. Existing More-button keyboard access
and shared ContextMenu Shift+F10/Menu-key handling remain available.

Right-clicking Explorer blank space uses that root's actions when exactly one root
is open. With zero or multiple roots it offers only Open folder, avoiding an ambiguous
creation destination. File menus retain their target-specific actions. Child-folder
right-click (#1064) reuses the same definitions for New document, New folder and
Open in File Explorer (when supported), targeting the clicked folder exactly.
Refresh is omitted because the existing handler refreshes opened roots only; Open
folder and Close folder remain root-only. Rename and move are not offered. #1401 adds the child-folder Trash action below. No new common interaction
is introduced; this is the existing U20/P10 action-menu surface without exceptions.

## Folder Explorer menu (#487)

When the Host exposes `openFolderInExplorer`, every opened root's More actions menu adds
**Open in File Explorer** / **파일 탐색기에서 열기** between Open folder and Refresh.
Each child-folder row also offers More actions with this command. It uses the shared compact
button and action menu components; activating it does not expand/collapse the folder.
Vite and HTTP have no capability and display neither the command nor child-folder menu buttons.
Folder right-click menus remain outside the body-menu scope of #223. Failure shows the existing localized error surface.
Closing a folder synchronizes Desktop's active roots without closing its documents.

Browser verification uses a stand-in Desktop bridge and checks root/child paths, browser absence,
close synchronization and failure notification; it does not execute Explorer. A 1440px menu
capture is retained in the [menu screenshot](../reviews/assets/reveal-folder-487-1440.png).
Actual Windows root/child Explorer launches and a deleted-folder failure are manual acceptance
items (not run). See the [Desktop boundary](desktop-distribution-v1.md#open-folders-in-file-explorer-487).


## Child-folder Trash (#1401)

Only child folders below an opened Root offer Delete folder… through the existing
ContextMenu and row More actions menu. Both use the same target actions; the opened Root
still offers Close folder only. `host-capabilities.fileDeletion` must be `trash`.
Otherwise Delete folder… remains unavailable with a hover/focus Tooltip explaining that
OS Trash is required. No permanent folder deletion or assistant tool is provided.

The shared DangerConfirmation names the folder and counts all contained files (including
hidden files). Cancel has initial focus. Bounded inspection can show “at least N” and an
incomplete count. Native documents under the chosen Root but outside the target that reference
its images are named as a warning, without blocking. Unreadable/non-native documents and
inspection limits produce an explicit incomplete-reference warning.

Unsaved opened documents in this window refuse deletion with their names and save-first
guidance. After saving, confirmation moves the entire folder once through the Host OS adapter.
Confirmation carries a complete folder-state revision; a subsequent content/list change refuses
and asks the user to close and confirm again. Incomplete bounded state inspection disables the
move rather than authorizing an unchecked folder. Success closes its saved tabs, removes matching local recovery records and refreshes loaded
parent listings. Focus moves to the next surviving row, the preceding row, or the Root toggle.
Opened Root preferences are unchanged; descendant cache entries are no longer reachable.
A failed or interrupted OS call may have moved some items: retain tabs/recovery and tell the
user to inspect the source and OS Trash before retrying. Other windows use the existing file
operation boundary. [Host/CLI receipt](filesystem-host-boundary-v1.md#child-folder-trash-1401).

Menu comparison at the same target, Korean Dark, 900px height, DPR 1 and 100% zoom:
[1440px before](assets/folder-trash-1401/before-menu-1440-ko-dark.png) /
[after](assets/folder-trash-1401/after-menu-1440-ko-dark.png),
[640px before](assets/folder-trash-1401/before-menu-640-ko-dark.png) /
[after](assets/folder-trash-1401/after-menu-640-ko-dark.png).
Before uses FolderTree from base `431c85b7` temporarily restored in the same checkout and
persistent profile, with the existing file-actions scenario; all working files were restored.
The before menu has no folder deletion. After uses the trash-capable rename fixture.

Manual visual evidence: [1440px Korean Dark](assets/folder-trash-1401/1440-ko-dark.png)
and [640px Korean Dark](assets/folder-trash-1401/640-ko-dark.png). Alignment, clipping, Korean wording and dark-theme controls were visually checked in both captures. These use persistent Windows
Chrome and a rename adapter for the whole scratch folder, not a real OS Trash invocation.
The existing DangerConfirmation, ContextMenu, DropdownMenu, Tooltip, danger token and Button
variants are reused without a new surface or interaction exception. Other destructive surfaces
(file deletion, creation Undo and Settings removal) keep the same Cancel-first confirmation.

## File context menu (#505 / #504 PR A)

Each file tree row (native/foreign document, image or other file) offers Rename… and Delete file…
in a shared Base UI ContextMenu. Right click and focused-row Shift+F10 / Menu key open the
same menu in every Host. These file targets suppress the browser context menu;
the document body follows the [block context-menu boundary](#body-block-context-menu-223),
while Outline retains native behavior; child-folder rows, opened root headers and
Explorer blank space follow the folder context-menu contract above. There are no new ellipsis,
toolbar, F2 or Delete entries. Target-local data supplies IDs, labels, icons, visibility and execution;
there is no global registry. Keyboard menu navigation is independent of tree arrows; Escape
restores the target row. Choosing an action hands focus to its shared dialog.

Rename uses a small dialog with the selected stem and a separate immutable extension, matching
New file shell controls. Cancel/Escape/outside dismissal restores the row. Invalid names and
collisions retain input and show the reason. Image rename updates saved native Figure references
under the opened folder. Dirty referring tabs in this window refuse with document names and
save-first guidance; clean affected tabs reload before the dialog closes. Skipped unreadable or
non-native Markdown files are named in a notice. [Host checking and rollback](filesystem-host-boundary-v1.md#referenced-image-rename-504-pr-b)
include saved and applied unsaved work; [session behavior](editing-session-save-v1.md#referenced-image-rename-504)
defines the same-window boundary and other-window Save conflicts.

Deletion names the file and distinguishes permanent deletion in Vite from OS Trash on
the HTTP daemon and Desktop. An open dirty document additionally says its unsaved changes will be discarded and
uses Delete and discard changes. Cancel has initial focus. The shared danger confirmation blocks
dismissal while pending and keeps failures visible. Success closes the deleted document's tab,
removes all local recovery records for that path and focuses the adjacent visible tree item (next,
then previous; the folder disclosure if empty). An inactive deletion leaves the active tab intact.

Rename updates open tab paths, session locators and matching recovery record/snapshot paths
without rereading the file or replacing its Tiptap editor. Unsaved content, property drafts, selection
and Undo/Redo remain. Existing Figure NodeViews, future image uploads and asset callbacks read
the new locator. Both operations update remembered tab navigation and loaded parent listings.
After Rename, focus returns to the renamed row, including when it first appears as the dialog
closes. The file-operation inert guard is removed in the same DOM commit, before the Explorer's
layout focus restoration (#999).
Recovery storage failure after a completed disk operation is reported explicitly for manual review.

### Image rename guidance (#504)

The existing rename dialog and danger text now ask the user to save the named referring tabs.
No control geometry, toolbar placement or style tokens change. `file-actions` checks refusal
for an inactive dirty tab and a property-only draft, preserving that work. After Save/Cancel it
checks clean active/inactive reference tabs immediately after completion (without polling or a
manual reload), Source-to-Visual refresh, a subsequent real Save, skipped-file notice, and a
second window's 409 Save conflict with its local edits retained. Host unit tests inject failures
at preflight, publication, document commit, image unlink and rollback, including case-only names
and an external revision change. All actual file mutations use OS temporary directories.

| Dirty-reference guidance, same state | Before | After |
| --- | --- | --- |
| 1440×900 | [Before](assets/image-rename-504/before-1440.png) | [After](assets/image-rename-504/after-1440.png) |
| 640×900 | [Before](assets/image-rename-504/before-640.png) | [After](assets/image-rename-504/after-640.png) |

Captured on Windows Chrome with the checkout-owned persistent profile, Vite at
`http://127.0.0.1:5173`, English UI, light OS/System theme, DPR 1, 100% zoom and bundled
Pretendard after `document.fonts.ready`. `ref.md` has an applied unsaved caption edit, `b.md`
is active, and the rename dialog has attempted `diagram.svg → updated.svg`. Both widths
keep text/actions inside the dialog. The longer save-first guidance wraps without clipping.
Actual HEAD was `d04c0e2302818b2123f2bcdf4356715fb68aa31a` with this PR's working changes.
For Before only App/locales were temporarily restored from that HEAD; the new Host remained
and refused the same dirty reference. These are controlled UI comparisons, not a full old-Host
behavior comparison. After restores this PR's App/locales. Only these four small images are
committed; regenerable traces/logs/full screenshot sets remain ignored.

## Document settings placement (#554)

The Sidebar browses opened folders and documents. Under #580's owner decision, the
existing heading numbering, reference style and bibliography connection live in a
collapsed **Document settings / 문서 설정** block at the very top of the paper,
before the title. Its one-line summary shows heading numbering, reference style and
connected bibliography filenames. Expanding shows grouped field rows with labels,
controls and short descriptions. Reference style offers actual Figure/Table/Equation
examples in each choice, including Korean. The body renders a field list and has no
placement dependency; bibliography uses a dedicated renderer within that list. This
is an Editor UI structure, not a Core field registry or #606 metadata implementation.

The block is outside ProseMirror content, like Add a title. It cannot enter document
text, Copy, caret navigation or Undo. Opening/collapsing it leaves document state,
selection, history and property drafts intact. Enter/Space operates the disclosure;
Tab reaches each control; menu arrow keys select a style; Escape within the block
collapses it and focuses its disclosure. A menu first handles its own Escape.
Expansion starts collapsed for each newly opened tab and lasts only for that tab's
session; tab switches and Visual/Source switches preserve it, without writing a
preference or document setting. Read-only documents show only the value summary;
the start screen and Source show no block. Pending work disables field controls,
including choices in an already-open portaled reference-style menu.

The TopBar Document settings button and its modal are removed. Command center
`Document settings…` closes its overlay, scrolls to the block, expands it and focuses
its disclosure. It retains its existing no-document/busy/Source availability. A document
without a connected bibliography file hides the bibliography row. When a bibliography is
connected, the row opens the existing connection dialog and returns focus to that row's
Connect button after selection or dismissal. The existing References-region connection
and the command-center `Connect bibliography…` item remain available.

Settings still use the same editor/Core operations, dirty indication, Save and save
failure handling. No Core/CLI operation, file format or device preference changes.
Wide document belongs to the tab-row actions, folding into ⋯ at narrow widths (#695).
The title strip stays 40px at all supported widths; search retains #556's reduction order
before becoming icon-only. Verification widths follow ADR-0010: 1440px and 640px, keyboard and pointer,
light/dark and paper/white backgrounds. Current UI verification supersedes #554's
placement; the following #554 measurements and captures are historical evidence.

#580 local verification (2026-10-27): Editor **302/302**, workspace typecheck, production
Editor build and docs/whitespace checks; targeted shell/command/Settings, heading,
reference/bibliography, Source, tab and layout browser checks (**18/18** passed).
The open-menu Save guard follow-up passed bibliography-connection, cross-reference
and inline-document-settings (**3/3**) with Editor typecheck and docs checks.
After integrating master `d04c0e2` (#601), Editor **302/302**, workspace typecheck/build,
focus-caret, file-actions, editor-shell, command-center, inline-document-settings,
layout-rules, desktop-updates, ui-language and document-tabs passed. The caret
scenario follows the new disclosure Tab stop without changing its restoration
assertions; file-actions selects ProseMirror paragraphs rather than settings hints.
The visual matrix restores its incoming display preferences in finally.

Review follow-up (2026-10-27, PR #607 P2): a settings disclosure can move document
content while a short paper and its editor keep the same sizes. The existing gutter
ResizeObserver now also observes the settings block and uses its unchanged measurement
path for controls and hover extent. The reading Outline likewise reschedules its
existing reporter when that block resizes. Table tools remain relative to their own
table canvas; heading scroll margin still follows the measured sticky header. Inline
text menus dismiss on outside interaction, while property popovers keep their DOM
anchors. No document transaction, new measurement framework or Core/CLI change.
The inline-document-settings regression measures expand→hover and collapse→hover after
two animation frames, with no body click/input, transaction or resize. A minimum-height
1440×1200 fixture verifies unchanged paper/editor sizes, actual block/control/hover
alignment, reading-line changes and table row/column alignment. The original 1440/640px
language/theme/background matrix remains in the same scenario.
Short-paper comparison: [Before](assets/inline-settings-580/review-before-expanded.png),
[After](assets/inline-settings-580/review-after-expanded.png). Before highlights the
old paragraph position above the actual block; After follows the actual paragraph.
Follow-up verification: Editor **302/302**, workspace typecheck, production build,
docs/whitespace and **8/8** browser scenarios passed: inline-document-settings,
outline, quiet-document, layout-rules, table-authoring, focus-caret, editor-shell
and block-move. The passing browser result records the actual geometry for all
three short-document states; full generated results remain in ignored tmp.
Integration with master `a8c874a` (#610 / #602) retains the permanent Sidebar rail
and 640px minimum, removes both obsolete TopBar openers, and keeps the inline
settings handoff and position-change observers. Editor **302/302**, workspace
typecheck/build, docs/whitespace, quiet-document with screenshots and **13/13**
conflict-related browser scenarios passed. Supported-width captures remain 1440/640px.
A subsequent integration of master `b7a6444` (#609 image-reference rename) keeps both
sets of current translations and removes its retired refusal key. Editor **314/314**,
workspace typecheck/build/docs and file-actions, inline-document-settings, editor-shell,
command-center, desktop-updates, ui-language and layout-rules (**7/7**) passed.

 The dedicated
`inline-document-settings` scenario adds unique per-tab/new-open/reload expansion,
read-only summary, content/selection/history isolation, keyboard/menu Escape and
notation-preview coverage. Its geometry matrix covers English/Korean, Light/Dark,
Paper/Flat at 1440×900 and 640×900; the same run creates optional manual
captures. Existing semantic Save→Reload and failed-Save checks stay in their original
scenarios. Edge, HTTP and packaged Desktop run in required CI.

Same-state manual comparison: persistent Windows Chrome, DPR 1, zoom 1, bundled
Pretendard, clean `technical-1.md`, three open tabs, document-tabs folder, scroll top,
English/Light/Paper unless named otherwise. Before uses master `053f7c8`; After is
#580 including master `d04c0e2` (#601); its file actions are not attributed to this
settings change. In Before, “collapsed” means the document with its settings dialog closed.
The filename/tab/Sidebar state is the same; TopBar and title movement are the intended
placement change. Native and shared menu captures use their real open controls.

| State | Before 1440px | After 1440px | Before 640px | After 640px |
| --- | --- | --- | --- | --- |
| Collapsed | [Before](assets/inline-settings-580/before-1440-collapsed.png) | [After](assets/inline-settings-580/after-en-light-paper-1440-collapsed.png) | [Before](assets/inline-settings-580/before-640-collapsed.png) | [After](assets/inline-settings-580/after-en-light-paper-640-collapsed.png) |
| Expanded | [Before](assets/inline-settings-580/before-1440-expanded.png) | [After](assets/inline-settings-580/after-en-light-paper-1440-expanded.png) | [Before](assets/inline-settings-580/before-640-expanded.png) | [After](assets/inline-settings-580/after-en-light-paper-640-expanded.png) |
| Notation menu | [Before](assets/inline-settings-580/before-1440-menu.png) | [After](assets/inline-settings-580/after-en-light-paper-1440-menu.png) | [Before](assets/inline-settings-580/before-640-menu.png) | [After](assets/inline-settings-580/after-en-light-paper-640-menu.png) |

Additional manual review: [Korean/Dark/Flat at 640px](assets/inline-settings-580/after-ko-dark-flat-640-menu.png),
[Korean/Light/Flat at 1440px](assets/inline-settings-580/after-ko-light-flat-1440-expanded.png).
Recreate After with `pnpm browser:test inline-document-settings --screenshots`;
full output remains in ignored `tmp/inline-settings-580`. Only representative small
PNGs are retained here; owner mockups and generated browser traces are not committed.

## Dedicated Settings screen (#594)

Historical surface and verification below: #1032 supersedes the full-screen modal,
Back action, navigation footer and initial focus described here. Current behavior
is [Settings task tab](#settings-task-tab-1032). Preference/save contracts remain.

Settings from the Sidebar or command center covers the entire app with an opaque,
viewport-sized screen. The document shell stays mounted beneath it: tabs, independent
editor instances, unapplied drafts, selection, Undo history and scroll remain intact.
Back to document / 문서로 돌아가기 names the active file and its unsaved state;
without a document the same control reads Back to start / 시작 화면으로 돌아가기.
Back and Escape restore the opener's focus. Entry focuses Back. The existing modal
boundary still blocks Save and command-center shortcuts and prevents document interaction.

The named navigation uses buttons with `aria-current="page"`: Appearance & language /
표시·언어, Saving & recovery / 저장·복구, and Desktop-only About & updates / 정보·업데이트.
Ordinary entry starts at Appearance; an update notice's View opens About. Theme, page style, language and
accent changes apply immediately, with profile-local preference storage and failure notices.
Theme offers Light / Dark (라이트 / 다크). Startup reads the OS once when no choice is saved; later OS changes do not change the saved choice. `litzio.theme` belongs to `preferences.ts` localStorage,
never document content or Host preferences. Unavailable storage retains the current-page
choice and shows the same style of localized persistence alert as accent/language.
Page style offers Paper / Flat (종이 / 평면), defaulting to Paper.
Flat makes canvas and paper one surface, including one dark surface in Dark theme.
The paper's edge, elevation and corners disappear without moving or resizing content, in Visual
and Source and at either document width. `litzio.pageBackground` is profile-local localStorage,
read before styles/UI by the existing theme initialization path. Unknown/unavailable storage
falls back to Paper; a failed write keeps the live choice and shows a localized alert.
The same editor instances, drafts, selection and history remain mounted across theme and page-background changes.
See [Visual Language](editor-visual-language-v1.md#surfaces-and-themes) for surface roles and
startup/native synchronization, its [palette rules](editor-visual-language-v1.md#tokens-and-palette) for contrast, and the [Historical theme record](../reviews/editor-visual-language-history-2026-10-30.md#theme-verification-and-captures) for visual evidence. This presentation choice
adds no Core operation or CLI command.
Recovery retains its explanation, count and confirmed Clear all; individual records stay
on the start screen. Desktop channel, status, release notes and update actions keep their
existing bridge and restart guards. Settings search remains outside the implemented scope;
Wide document stays in the document tab-row actions (#695).

The navigation footer explains that heading numbers, reference style and bibliography
belong to each document. Settings has no Open document settings entry (#669).
The inline block above the document title and Command center's `Document settings…`
remain the entry points. Settings dismissal resolves the original
opener or the currently visible Sidebar toggle.

Implementation/verification scope: Editor shell, shared controls and bundled Korean/English
copy only; no new Core operation or CLI command. Reuse the existing language, recovery,
command-center and Desktop-update scenarios; extend their interface coverage for full-screen
bounds, keyboard navigation/focus, state retention and 1440/390/375px layout. Run Editor
tests, workspace typecheck, build, docs check and layout-rules/quiet-document regressions.
Keep only the representative small captures below in Git; generated traces, full browser
results, scratch fixtures and downloaded owner mockups stay outside the commit.

Local verification (2026-10-27): Editor 297/297 and Desktop 47/47 tests, workspace
typecheck, Editor production build, docs and whitespace checks passed. Targeted browser
coverage: ui-language, desktop-updates, recovery, recovery-storage, command-center,
editor-shell, layout-rules and quiet-document. The existing layout helper now gates the
screen's Back focus rather than the old popup's language selector; its deliberate delayed
focus assertion remains. The Desktop scenario also crosses 1440→390px while Settings
is open: if the old Sidebar opener disappears, Back/Escape focuses the visible Expand
sidebar control. Review follow-up: the same viewport traversal includes the Document
settings link and Escape, in both languages, with dismissal at 390px or after returning
to 1440px. Before the fix, the first linked-dialog case failed with focus on BODY;
the shared dismissal-time resolver retains the original visible opener or selects the
current Sidebar toggle. Follow-up local checks passed: the expanded desktop-updates
scenario, ui-language, command-center, editor-shell and layout-rules, Editor 297/297,
workspace typecheck, production build, docs and whitespace checks. Packaged Desktop
and install/update execution remain required CI checks.

Manual comparison: Windows Chrome, bundled Pretendard Variable, DPR 1, zoom 1,
1440×900 and 390×900, English, content scroll 0, clean `updates.md`, mock Desktop
version 0.2.0 / Stable / idle and zero recovery records. Before is master
`987ae137ce0615b51b682fffefe040fca4cec872`; After is this change. Before shows the
initial language focus; After shows the selected category. The original popup contains
all three groups and requires vertical scrolling. After covers Sidebar, tabs, document
and Outline; on phones navigation stacks above content and all controls remain reachable.
The same geometry assertions cover Korean and 375px (18 language/width/category states);
the additional captures remain in `tmp/desktop-visual`. Capture with
`pnpm browser:test desktop-updates --screenshots`; these images support manual review,
while geometry, keyboard and editor-state checks provide automated coverage.

| State | 1440px | 390px |
| --- | --- | --- |
| Before: combined popup | [Before](assets/settings-screen-594/settings-before-1440.png) | [Before](assets/settings-screen-594/settings-before-390.png) |
| Appearance & language | [After](assets/settings-screen-594/settings-en-appearance-1440.png) | [After](assets/settings-screen-594/settings-en-appearance-390.png) |
| Saving & recovery | [After](assets/settings-screen-594/settings-en-recovery-1440.png) | [After](assets/settings-screen-594/settings-en-recovery-390.png) |
| About & updates | [After](assets/settings-screen-594/settings-en-about-1440.png) | [After](assets/settings-screen-594/settings-en-about-390.png) |

## Sidebar and native title bar (#582 / #605)

The approved explorer layout puts only **Explorer / 탐색기** and Collapse Explorer in the header.
Each opened folder shows **New document… / 새 문서…** and its More actions
menu (New folder…, Open folder…, Refresh, Close folder, in that order). There is no additional New document row while
a folder is open. Empty Explorer retains Open folder… and New document…; the latter first
chooses a folder, then opens the existing filename form. Start and command-center entries
use the same New document… name. Folder selection and creation semantics are unchanged.
Cancel returns to the invoking button; if opening the first folder removed that empty-state
button, the visible Sidebar toggle receives focus. Menu-originated dialogs return to that
folder's More actions trigger. Each opened root has the same chevron and name (no folder icon),
regular typography, 28px row and spacing as child folders, at visual depth zero, without extra
heading or inter-section gaps. Root actions remain visible without hover. The full opened-root header uses the same
rounded hover surface (`--id-color-surface-hover`, `--id-radius-md`) as child-folder rows
(#1113), with no text movement or changes to focus, height, actions or context menus. File type icons remain in the leading slot, with
file/folder names at the same visual depth aligned; folders use that slot for their chevron. Children start
one visual step deeper. Root-only actions stay right-aligned on that row; long names ellipsize
with the full path in `title`. Existing section/disclosure/tree/treeitem semantics, ARIA levels
and #425 collapse memory remain unchanged. Tab order follows the visual order from disclosure
through the two actions to the retained tree stop.

Hover verification (#1113): the existing `folder-navigation` scenario compares root and
child hover backgrounds and checks exactly unchanged name geometry at 1440px and 640px.
Manual Windows persistent Chrome captures use English/Light at 1440×812 and Korean/Dark
at 640×812, after fonts load, with the pointer over the root name:
[1440 before](assets/root-hover-1113/before-1440.png) /
[after](assets/root-hover-1113/after-1440.png),
[640 before](assets/root-hover-1113/before-640.png) /
[after](assets/root-hover-1113/after-640.png).
Before images replay the prior transparent header background on the same page via a
temporary CSS override; after images use product CSS. This manual capture override is
absent from the regression. Row alignment, action spacing and clipping were reviewed;
existing tree and Outline rows retain their shared hover token. No new component or
native-row exception is introduced; collapsed rail is outside this change.

The first row is one full-width title strip (#647): the existing Desktop SVG icon and
**`Litzio`** at the left, shared search in the remaining width, and native caption
buttons at the right in Desktop. HTTP Host uses the same arrangement with zero caption
reservation and no native window dragging. The brand follows the Explorer width; collapsing
Explorer retains only the icon. The Explorer icon button (Expand Explorer, #671) stays in the 48px rail on
the second row, directly below the icon: this preserves its Explorer-navigation location,
28px target, accessible name, aria-expanded and keyboard focus return without making the
brand an additional action. DOM tab order follows Explorer controls, title-strip search, document tabs, document actions/content, then
document navigation; the brand adds no tab stop.

Explorer / Collapse and the Outline / Tables / Figures tab row begin directly below the title
strip, aligned with the document tab row and its bottom boundary. The separate visible
Outline title row is removed; the panel keeps its accessible Outline heading. Docking,
width, overlay dismissal and list navigation are unchanged. Below the docking width the
opened panel continues to overlay below the entire measured sticky header, leaving the
document tabs, messages and title-strip controls usable.

The title strip stays 40px at every supported width. Document actions and compact status
belong to the fixed tab row ([#695](#title-strip-and-tab-row-actions-695)). CSS Window Controls Overlay geometry
reserves native caption width in the title strip once, independently of Outline state.
Its single 1px bottom separator spans the full viewport, including the reservation (#635/#636).
The second-row headers are not drag regions. Title-strip empty space and brand drag the
native window and retain native double-click maximize; controls use no-drag. Shared UI
portal popups, positioners and dialog backdrops also use no-drag, including Command Center
and Recovery. Dropdown/context menus retain Base UI's outside interaction without an added
full-screen pointer-catching backdrop. While any shared menu is open, the title strip and
TopBar themselves use no-drag; closing it restores dragging. Full-screen Settings retains
its own 40px drag header, caption reservation and no-drag body. Existing surface-subtle and
native caption color synchronization remain unchanged. Native drag/double-click behavior
requires packaged Desktop verification; browser mocks inspect geometry and CSS boundaries.

The active filename sets `document.title` to `<filename> — Litzio`, or `Litzio` without
a document, including tab switches, renames and last-tab closure. Outline retains #590's
toggle-only close and Escape/focus behavior; its second-row tabs name the navigation choices, with no new navigation mode here. These changes are interface-only: no Core semantic
operation or CLI parity command is needed.

Local verification (2026-10-27): Editor/Desktop tests, workspace typecheck and Editor build;
folder-navigation, new-document, editor-shell, layout-rules, ui-language, desktop-updates,
document-tabs and quiet-document browser scenarios. The first folder-navigation run exposed
BODY focus after the removed empty-state opener; the existing shell fallback now returns to
the Sidebar toggle. Language-menu verification waits for the opened menu before inspecting
its translated item. No assertion or timeout was relaxed.

Review follow-up verification (2026-10-27): folder-navigation compares root/child typography,
row height, visual indentation, always-visible same-row actions and zero section gaps at
1440/1024/640px, with multiple roots and long Korean/unbroken names. Existing section-memory
and keyboard tests remain. Desktop mock checks 40px Settings and a representative 138px caption
reservation with a long filename at 1440/640px. At 640×480 the Command Center search overlaps
the wrapped header; popup/backdrop no-drag, typing and outside dismissal are checked, along
with the shared menu boundaries and temporary header drag exclusion/restoration. Folder/file
regressions exercise single-click menu switching and successive context-menu targeting. Native
mouse behavior remains a manual item below.

Same-state browser captures: clean base `9dd7af40f30aa43bcce8ab0f8dc5e26dfba10055`
versus this implementation, persistent Windows Chrome, Vite `127.0.0.1:5173`, English,
Light/Paper/Blue, DPR 1, zoom 1, bundled Pretendard, scroll 0, empty Files with the same document.
`pnpm browser:test quiet-document --screenshots` produced both pairs; regenerated traces and
the larger capture matrix remain uncommitted.

| Viewport | Before | After |
| --- | --- | --- |
| 1440×1000 | [PNG](assets/sidebar-titlebar-582-605/before-1440.png) | [PNG](assets/sidebar-titlebar-582-605/after-1440.png) |
| 640×1000 | [PNG](assets/sidebar-titlebar-582-605/before-640.png) | [PNG](assets/sidebar-titlebar-582-605/after-640.png) |

Opened-folder review from `folder-navigation --screenshots`: [1440px](assets/sidebar-titlebar-582-605/folder-1440.png),
[640px](assets/sidebar-titlebar-582-605/folder-640.png), [menu](assets/sidebar-titlebar-582-605/folder-menu.png).
Multiple opened roots: [1440px](assets/sidebar-titlebar-582-605/folders-1440.png),
[640px](assets/sidebar-titlebar-582-605/folders-640.png).
These additional After captures show icon-free folder rows with two same-row actions. The
640px root-name column is 79px in this capture, displaying more text than the previous
folder-icon/three-button layout; no new functionality is introduced.

Native drag, double-click
maximize, maximized spacing, rendered caption colors and taskbar/Alt+Tab presentation need
manual Windows confirmation; browser bridge/geometry checks do not claim native proof.

## Structure

Every Host has a Sidebar footer Settings entry in both expanded and collapsed states (also available through the command center), opening the [dedicated Settings screen](#dedicated-settings-screen-594). The start screen adds a minimal recovery list/empty state; matching Open offers the newest record in a shared recovery dialog. Standing recording failures use MessageArea. The [recovery contract](editing-session-save-v1.md#local-recovery-records-296-pr2) owns retention and lifecycle. The typed Desktop bridge additionally provides About and update notice/actions. Update notices do not take editor focus. Version/channel/progress/retry/restart policy is defined by [Desktop distribution](desktop-distribution-v1.md).

The document is the primary surface. Each document tab keeps one Tiptap/ProseMirror document state owning selection, history and editing; typed blocks use NodeViews and overlays.

The shell has three responsibilities: the Sidebar on the left browses opened folders and files (which document), the document column in the center is authoring (what is edited), and the Document panel on the right is navigation inside the open document (where in it).

| Area | Current behavior |
| --- | --- |
| Sidebar | Explorer and Collapse Explorer in the header, followed by file navigation; no duplicate New document row with opened folders (#582). There is no Explorer / Display switch. The collapsed 48px rail contains an Explorer icon button at the document-tab row and an icon-only Settings button at the bottom (#671). The Explorer icon restores file navigation; its accessible name and tooltip remain Expand Explorer (탐색기 펼치기), describing the action rather than only naming the panel. Settings uses the same entry component and screen as the expanded footer, at the same vertical position; Back/Escape returns focus to its opening button. Both rail actions are keyboard reachable, have localized names/tooltips and are Desktop no-drag targets. An always-visible Activity bar and additional panels are future work. Explorer contains the opened folders (#112, [ADR-0009](../adr/0009-multiple-opened-folders.md)), each a non-overlapping root section in opening order (ancestor absorption takes the first absorbed position; [#702](#non-overlapping-opened-folders-702)), or, without any, guidance followed by the browser's recent folders (name, full path in `title`): one click lists that folder like Open folder, without opening a document. User-controlled collapse/expand, with a 48px rail when collapsed. No workspace or placeholder navigation. Each folder heading names its folder (disclosure button and name, full path in `title`; [section visibility](#collapsible-folder-sections-425)) with `+` (New document…) and a `⋯` menu containing New folder…, Open folder…, Refresh and Close folder (removes only that folder; tabs stay open). Open folder… adds an unrelated folder; one already open is listed again in place. A descendant is revealed in its ancestor tree, and a new ancestor absorbs its descendant sections ([#702](#non-overlapping-opened-folders-702)). With no opened folder, the empty Explorer panel offers Open folder… and New document…. Below each heading is a folder tree; file listing and activation follow [Folder files and image preview](#folder-files-and-image-preview-217). A `.md` file whose leading frontmatter lacks the native marker stays listed in subtle text with its own icon, and its tooltip and accessible description say it is not an Litzio document; opening it automatically selects text mode (#817) ([Folder listing](filesystem-host-boundary-v1.md#folder-listing-v1-112)). On explicit active-document path changes, the containing sections and folders above it expand in each opened folder containing it; a document elsewhere adds nothing to the trees. The opened folders' paths are browser preferences: on start they are listed again in order, and one the Host refuses or no longer has is left out quietly. Child-folder expansion is page state only. Root section collapse is an origin-specific preference restored on Reload/Desktop restart; startup document restoration respects it. Opening document settings or collapsing the sidebar retains the mounted tree, its expansion, scroll and keyboard stop, without listing again. The tree takes the remaining height and scrolls by itself; the open document uses the shared selected surface/text with 600 semibold as a non-color cue, without a left marker there and Close folder removes it. Keyboard: Up/Down, Home/End move through visible items; Right expands a folder or moves into it; Left collapses it or moves to the parent; Enter or Space opens a document or toggles a folder. Explorer does not list the open document separately: the tab row and TopBar name it. |
| Document settings | Collapsed value summary at the top of the paper, before the title and outside ProseMirror (#580). Expands into grouped field rows for Number headings (H1–H6), Reference style (Default, Concise, Formal, Korean; unmatched values show Custom) with notation previews, and Connect bibliography…. Reuses existing operations, history, dirty indication and Save under the [numbering](heading-numbering-v1.md) and [bibliography](citations-v1.md#connect-and-disconnect-bibliography-files-438) contracts. Command center reveals/expands/focuses it. Field controls disable during pending work; Source/start omit the block and read-only shows only summary. Escape inside collapses and focuses the disclosure; the style menu handles its own Escape first. Bibliography uses the existing connection dialog with return to the row’s Connect button. Expansion is per-tab session only. Opening/collapsing preserves editor instance, selection, history and unapplied drafts. App Settings remains separate and has no document-settings entry (#669). |
| Document panel | Outline, Tables and Figures navigation (#613), with 600 semibold, themed surface and segment shadow for the selected tab, muted inactive labels and reserved semibold label width (#620), titled Outline, with no internal close button (#590). The tab-row Outline toggle opens and closes it. The outline is derived from the editor document, indents 12px per level below H1 up to three levels and wraps labels to two lines, marks the section being read with selected background/text and 600 semibold (no left marker, #515); a hidden semibold copy reserves its two-line text extent to prevent selection height jumps. The current item stays inside the list's visible area. The list scrolls by itself and is never written to the document. Table/Figure items reuse the body caption prefix and Core reference template (for example `Table 1. Caption`), including in Korean UI; a missing caption shows only the number. At 1424px and wider the panel is docked and starts open; below 1424px it starts closed and, opened, overlays the document below the sticky header instead of narrowing it, so Save, File actions and the Outline toggle stay usable; Escape closes it and returns focus to the tab-row Outline toggle. The docking width is independent of the 1024px narrow sidebar. Entering the overlay layout always closes it. Returning to docked restores the user's last explicit docked open/closed choice, or opens by default if none exists. Overlay interactions do not overwrite that choice. Open/closed is page memory only and resets on reload; no persistent preference is added. |
| TopBar | Shared single-row brand/search/caption strip; document actions and compact status belong to their owning tab row. See [#695](#title-strip-and-tab-row-actions-695) for responsive search, menu guards and status. Save, Source, Compare, Reload/discard, Copy path and layout preferences retain their existing operations and shortcuts. |
| Document tabs | Fixed second row below the title strip, with a flat current accent marker (#581). Filename, dirty dot, close button and full-path tooltip; same-named files show the distinguishing parent folder. Only the tablist scrolls; its active-document actions remain fixed to its right (#695). Accessible tablist/tab/tabpanel relationships, Left/Right/Home/End switching and Delete to close remain. Closing selects the right neighbour, else left; an inactive close keeps the current tab. |
| MessageArea | Registers load/save errors, conflict and temporary notices with the window NotificationCenter; renders no row below tabs. Same-source/context/severity/type notifications form a collapsible counted group when there are multiple items; singleton rows retain existing actions. Dismissing the last item collapses the center and returns focus to its button; manually opening the empty center still shows its empty state (#1005, #986; grouping and lifecycle details in P07). Table deletion retains its existing five-second notice and Undo lifecycle. Unapplied draft context instead appears as a separate short status immediately left of Save in the owning tab row (#839): text at 1440px, icon at 640px/compact, full Save/Source explanation on hover/focus and in the accessible name. It stays available in Read, Edit and Source, takes no document height, and has no jump-to-draft action. [P07](ui-patterns-v1.md#p07-입력-오류와-알림-센터) owns the message classification. |
| Document | Continuous white writing surface with a subtle edge on a muted canvas, extending at least to the bottom of the viewport minus its outer gap. Block tools occupy its gutter. Empty editable documents expose a first-line hint and `+`. No fixed formatting toolbar. |

General file navigation is Open folder… followed by choosing a `.md` or `.txt` file in the sidebar tree; there is no full-file-path dialog (#190). Closing the folder dialog returns focus to the control that opened it. Open folder uses an in-app [folder picker](folder-picker-v1.md), with path completion, breadcrumbs, Up, New folder, recent folders and starting places. Navigating never opens a folder: Enter or Open applies the typed path to the sidebar. A document clicked in the folder opens through Open and its checks ([Folder listing v1](filesystem-host-boundary-v1.md#folder-listing-v1-112)). Source previews canonical Markdown read-only. Long source lines, including unbroken URLs/words, soft-wrap to the available width without horizontal scrolling (#476). Line numbers count Markdown lines only; continuations align with their line's text and have no new number. Wrapping changes no document text or saved content, inserts no copied characters or line breaks, and the generated numbers are never copied. Native selection/Copy retains its existing omission of the terminal newline in Chromium. Source does not replace or reconstruct that tab's visual editor state. Pending Source work blocks switching tabs within its group. Unapplied drafts remain unsaved while Save/Source use applied content; Reload explicitly confirms discarding local work. See [Editing session and Save v1](editing-session-save-v1.md). Clean loaded state is silent; document changes/drafts show `Unsaved changes`. `Saved` is shown only following a successful save with no remaining edits. Saving/errors/conflict retain their meaning; there is no autosave.

Opening another document or the folder heading's `+` opens a new tab after Host success; an already-open
normalized path activates its existing tab in the requested group without a Host GET when the requested path matches exactly. Other
spellings still use Host normalization. Neither Open/New nor tab switching asks to discard work. Switching
retains history, block property drafts, selection, scroll and view; transient inline link/math inputs
close on blur as within one document. Pending Save/Source/assets block tab switching within their group; Open/New and close confirmation retain their operation guards. Focus can still move between visible documents. **Save / Don't save / Cancel** is used for closing one dirty tab. Failed Save, Cancel, or newer
applied edits after Save keep that tab. Inactive tabs keep their state with overlays and measurement
suspended. Browser unload and Desktop close/update inspect all tabs. See the
[editing-session contract](editing-session-save-v1.md#switching-and-recovery).

On Reload or Desktop restart, flattened tab paths, order and focused active identity are restored in one group from browser
preferences, after opened-folder restoration. Missing/refused/non-native documents are quietly
excluded; no document content, cursor or undo is remembered here. Explicit URL/Desktop launch paths
win over remembered tabs, and unsaved recovery records retain their existing review flow rather than
being opened automatically from disk. Restoration alone does not rewrite preferences; successful
user Open/New, Close, recovery Restore or tab selection remembers the current list. An empty list
keeps the start screen. See [startup precedence and recovery](editing-session-save-v1.md#tab-navigation-memory-383).

A folder heading's `+` opens the New filename form without work-loss confirmation. Its Location field shows the destination and lists the
opened folders and every sub-folder their trees have listed, each named from its opened folder
(`docs`, `docs\guides`). Overlapping trees contribute each Host-normalized path only once: the first
occurrence in opened-folder order, then tree order, supplies its position and label. It starts at the open document's folder when that is inside the
heading's folder, otherwise at that folder. Expanding or collapsing folders never changes it.
New asks for a filename, adds `.md` if omitted and uses the existing creation checks; success
opens the document in a new tab and lists its folder again. When the modal closes after successful creation,
focus moves to the first paragraph for immediate typing. Cancel/Escape, including after a
rejected creation, returns focus to the New button.
The start screen, Files area and command center also enter this same creation flow (#553).
See [Folder New](folder-picker-v1.md#new-document-in-a-sidebar-folder).
The folder menu's New folder… uses the same Location and starting destination for a folder name;
success shows the folder in the tree; creation and cancellation return focus to the same More actions trigger. See [New folder](folder-picker-v1.md#new-folder).

### New document entry (#553)

The start screen says **Start an Litzio document / Litzio 문서 시작하기**, with purpose-focused
guidance about creating or continuing an Litzio document. **New document… / 새 문서…** is the
primary text button, followed by the secondary **Open folder… / 폴더 열기…**. Empty Files has the
same actions; opened folders collect their creation actions in the folder heading (#582). The command center offers **New document… / 새 문서…**
with Korean and English document/file aliases, available without an open document and disabled
during pending work or a close confirmation.

With no opened folder, New document opens the existing FolderDialog, including New folder.
Successful Open adds the Host-normalized folder to the Sidebar and recent/opened preferences,
then, after the picker closes, opens the existing filename form in that exact folder. Cancelling
the picker opens nothing. Cancelling the filename leaves the selected folder open and creates
no document. Both cancellations return focus to the invoking control, or the Sidebar toggle if opening the first folder removed that control. A failed location stays
in the picker; a failed creation stays in the filename form.

With opened folders, the common entry defaults to the current document's containing folder in
its opened tree, or the first opened folder if none contains that document. The per-folder `+`
retains its section-specific default. The form is titled **New document / 새 문서** and explains
the `.md` suffix once. All entries reuse Host/Core creation and the existing tab/focus protections;
no temporary untitled document, autosave, new semantic operation or CLI command is introduced.

The folder-tree hook owns the live opened list and the preference derived from it. User Open/Close
remembers the latest reduced list; if startup restoration is pending, writing waits until every
remembered path has been tried. Restoration alone leaves preferences unchanged, including paths
the Host no longer lists. A user Open/Close of the same Host-normalized path wins over a late
restoration response, so a closed folder stays closed. Successful explicit Open/Close always
remembers that browser tab's current list, including a same-path Open after another tab saved a
different list. Tree expansion and listing updates never write preferences. See
[Folder picker behavior](folder-picker-v1.md#behavior).

Behavior change (sidebar chrome cleanup): the sidebar no longer has the old Open…, Open folder…
and New button row; #582 now collects those entries in folder headings or the empty Files state. There is no separate current-document row. The app-level New, which took a full
file path in any existing directory, is removed rather than moved: a document is created by
opening its folder and using the folder's `+`. The separate full-file-path Open file entry is also
removed (#190); the shared document loader, Host file APIs and Desktop `.md` arguments remain.
Folder navigation changes no document meaning, so this removal adds no Core operation or CLI command.

## Document navigation lists (#613)

The Outline panel retains an accessible heading. Its first visible row, aligned with the document tabs (#647), is a full-width
row that shares the document-tab height and offers Outline, Tables and Figures without counts (#700). The row
reuses the Visual/Source Button and segmented-control tokens, outside the title-strip drag region.
It works in both docked and overlay layouts, independently of native caption-button space.

The segments are keyboard-accessible tabs linked to their panels; only the selected list
mounts its items. Arrow Left/Right,
Home and End switch tabs; each list retains the outline's Arrow Up/Down, Home/End and
Enter/Space navigation. Empty lists have localized guidance. The chosen list is page-local
state, with no new preference or persistence.

Tables and figures show the existing Core-computed caption number and caption text;
captionless targets show only the number. Both reuse the outline's two-line clamp,
current-item styling, scroll tracking and Visual-view reveal path. Equations are excluded.
This is Editor navigation only: existing Core read-model projections and numbering suffice,
so no semantic operation, Core read-model extension or CLI command is added.

The existing navigation store and reveal path own all three lists. `panel-lists` verifies
live edits, numbering, click/keyboard/Source navigation, current-item tracking, empty guidance,
Korean labels and 1440px/640px light/dark geometry. Existing `outline`, `document-tabs`,
`folder-navigation`, `layout-rules` and `quiet-document` regressions pass. The document-tab
and recovery tests now count tabs inside the Documents tablist, retaining exact count/order assertions
when navigation tabs are also visible. Editor tests (316), workspace typecheck, Editor build,
documentation and whitespace checks pass. Packaging/platform coverage stays in CI.

For #700, 1440×900 Chrome captures show the count-free [Tables](assets/panel-tabs-700/tables-1440.png) and [Figures](assets/panel-tabs-700/figures-1440.png) tabs with the existing lists.

## Boundaries

No workspace, recursive filesystem scan, folder watch, filesystem-wide or document-content search, accounts, autosave, new block semantics, overlay framework or persistence architecture is introduced. The right-side Document panel hosts Outline, Tables and Figures navigation: no properties inspector, AI panel, References panel or generic panel/extension framework is introduced. Buttons enter through the Base UI `components/ui/button`; Notice remains a separate presentation primitive.

Browser procedures and repeatable scratch preparation: [TEST_GUIDE](../test/TEST_GUIDE.md). Actual shell evidence: [#176 review](../reviews/editor-shell-176-2026-10-13.md); earlier visual evidence: [review record](editor-visual-refinement-v1-review.md).

## UI display language (#256)

Settings in Web, HTTP Host and Desktop offers `한국어` and `English`, always written in their own languages. An explicit `litzio.uiLanguage` preference wins; without a valid choice, a Korean first preferred browser/app language selects Korean and other languages select English. Both translations are bundled using i18next/react-i18next; there is no translation network request. If local preference storage fails, the current choice still applies and Settings explains that it may not persist.

Changes apply immediately to UI text, accessible names and the page `lang`. Menus support Korean and English search aliases regardless of display language. Operation IDs such as `saving` and `saved-pending` (also exposed by `data-operation`) are independent of translated status text. Translation cannot enable Save, switch documents or bypass work-loss protection.

Existing Admonition labels also update without a document edit. Block-handle accessible names translate the displayed block kind while preserving engine type IDs, and foreign-document tooltips translate their explanation while retaining the literal path.

The mounted editor, document, tabs, selection, history and unapplied property drafts survive language changes. Decorations are refreshed without a document transaction; NodeViews update their UI independently. Document text, labels, computed reference/caption notation and canonical Markdown do not change. No Core operation or CLI command is added: UI language is a local display preference, not a document semantic operation.

Application messages retain translation keys and parameters when stored. Save failures retain their submitted snapshot and are formatted at display time, so their location still refers to the failed submission. Core/Host/library diagnostic details retain their original text; the UI translates the surrounding context and phase-specific guidance without interpreting English reasons or duplicating validation rules. CLI diagnostics and OS-owned dialogs are outside this UI translation boundary.

Short input errors (#819) translate known Core label syntax messages at the shared `FieldError` display boundary. Label-property refusals use the existing structured `label-conflict`, `invalid-label` and `invalid-reference` codes to select Editor copy, including duplicate automatic heading IDs and labels that cannot name a reference target; no validation rule or Core/CLI diagnostic is changed. Unknown field errors retain their original detail. Citation-specific forms remain frozen under ADR-0008.

640px Dark/Korean, the same rejected Figure label and persistent Chrome on port 5281: [Before](assets/label-errors-819/before-640-dark-ko.png) / [After](assets/label-errors-819/after-640-dark-ko.png).

Verification and implementation scope are recorded in the [#256 plan](ui-language-256-plan.md).

## Local accent color (#559)

Settings offers six named presets: Blue (default), Violet, Plum, Teal, Green and Graphite.
The accent control (#617) is one named radio group (Accent color / 포인트 색): six
small circles form one row, without option boxes, check marks or individual visible
names. Each radio retains its translated accessible name and title tooltip. Only the
selected color name appears beside the row; an offset outer ring marks selection.
Tab enters the selected option; arrow keys move and select, with native radio state
and a visible keyboard focus ring. Swatches use the same theme-specific token values
as the actual accents. Storage failure retains the live choice and existing alert.
There is no free color picker. The choice applies immediately to interactions, selection
background/text, focus, primary actions, links/references and generated heading/Outline numbers.
Information states are neutral; danger and warning retain their meanings. Values and contrast
requirements belong to [Visual Language](editor-visual-language-v1.md#tokens-and-palette).

The existing browser/origin preference path stores only a preset ID in
`litzio.accentColor`, independent of documents and the Host. Vite, HTTP and Desktop
profiles/origins do not share it. Startup applies a valid stored choice before mounting
the first UI. Missing, unknown or unreadable preferences use Blue. A storage failure
keeps the live choice and Settings explains that it lasts for the current page.
Changes preserve the mounted editor, tabs, content, selection, history and property drafts.
This display preference needs no Core operation or CLI command.

## Folder refresh (#494)

Each opened folder's More actions menu offers Refresh before Close folder. Refresh reuses the
one-level Host listing path for that root and its reachable, already loaded child listings,
including cached collapsed children. Never-loaded folders are not read. The command center has
one Refresh folder command per opened root, identified by its full path and using the same handler.
Refresh keeps section/child expansion, current document selection, tabs, editor state and preferences.
Removed entries disappear and new entries appear in the refreshed listings; existing Host errors
remain explicit and late responses retain the newest-request guard.

### Automatic folder refresh (#927)

External file/folder additions, deletions and renames update the reachable, already loaded
listings through the same refresh path. The Host uses recursive `fs.watch` with a 150ms debounce;
the visible browser checks a small change version every 2 seconds over the existing HTTP transport.
This avoids adding a persistent connection protocol. Watches are transient 15-second leases renewed
by checks; closing a root, hiding the page or disconnecting stops renewal and releases the watcher.
Unsupported or missed watch events are covered by refreshing every 60 seconds while visible and
on window focus/visibility return. Browser timings are adjustable together in `FOLDER_REFRESH`.

Automatic refresh keeps cached rows mounted without loading indicators, errors interrupting the
user, disclosure changes, preference writes or focus/scroll commands. Surviving rows retain selection
and keyboard focus; open rename inputs and editor/tab state are untouched. Never-loaded folders stay
lazy, including collapsed folders. Manual refresh continues to expose Host errors. Open document
content stays mounted. #969 adds open-document byte revision checks to these same requests;
outside opened folders, checks occur only on window focus/visibility return. External-change
and Save-conflict notifications offer the existing explicit Reload (with unsaved-work confirmation)
and #655 comparison. Save-time 409 remains the final guard; no overwrite or automatic merge is offered.
Core and CLI parity do not
apply to this Editor display operation.

When Litzio creates a file/folder or creates/rolls back an image asset (paste/drop or Choose…),
its already loaded parent listings are refreshed through the same loader without expanding folders.
This includes the document directory when a new assets directory appears. Unloaded asset listings
remain lazy.

Actual 1280×720 English menu comparison: [Before](assets/folder-refresh-494/before.png) /
[After](assets/folder-refresh-494/after.png). Both use this checkout, the same persistent Windows
Chrome profile, dedicated Vite origin (127.0.0.1:5194), default DPR 1 and the same document/folder
state. Before restores only Sidebar.tsx from base ff37a32; After uses this change. Direct review
confirms the added shared menu row/icon fits without moving surrounding chrome. Large regenerated
traces, full scenario captures and logs remain under ignored tmp/.

The extended folder-navigation fails with the base Sidebar's Close-only menu and passes after the
change. It checks root/loaded-child additions and removals, no unread-folder requests, document
selection/editor content/selection/tabs, preference preservation and command refresh while the
section is collapsed. image-assets now starts in a directory with no assets folder, checks that
paste reveals it and that later drop updates its loaded listing, retaining existing real-file
Save/Reload/rollback coverage. The existing reducer test also covers expansion retained on refresh
failure; command-center's navigation check follows the second enabled match rather than a fixed
command's old result position.

#1125 verification: `folder-navigation` fails on the original name click and passes with
name collapse/expand, single-toggle double-click behavior, root-menu isolation and the existing
keyboard, persistence and geometry checks. No CSS or layout change. Same-state English Light
captures at 1440px ([before](assets/root-name-1125/before-1440.png) /
[after](assets/root-name-1125/after-1440.png)) and 640px
([before](assets/root-name-1125/before-640.png) /
[after](assets/root-name-1125/after-640.png)) use this checkout's persistent Chrome,
812px height and DPR 1. Korean Dark 640px was also reviewed through the existing
`folder-navigation --screenshots` capture path. Generated traces remain under ignored `tmp/`.

## Collapsible folder sections (#425)

An opened folder without remembered section collapse starts expanded. The chevron beside its name is a native compact ghost button,
with localized `Collapse folder <name>` / `Expand folder <name>` labels and tooltips, `aria-expanded`
and `aria-controls` naming that section's tree. Single-clicking the name also toggles the same section and remembered collapse state (#1125).
Right-click, root action buttons and the second click of a double-click do not toggle it.
Existing non-selectable folder-name text styling is unchanged.
The name adds no keyboard stop; the native disclosure retains Enter/Space.
The name remains the section/tree title and its
full path remains in `title`. The chevron points right when collapsed and down when expanded,
like subfolder chevrons. New document… (`+`) and More actions (`⋯`, New folder…, Open folder…, Refresh and Close folder)
remain visible and usable when the section is collapsed. Empty-folder help is hidden with the tree.
Tab order within a section is disclosure → New document… → More actions → the tree's single
retained keyboard stop when expanded. Enter/Space toggle; collapsed tree items are outside Tab and
the accessibility tree. Tree arrow/Home/End behavior is unchanged.

Section visibility belongs to the existing folder-tree state. Collapsing neither lists
folders nor clears cached entries, child expansion, tree scroll or keyboard position. Relisting
the same root, switching tools/sidebar layout, and opening/closing other roots retain it. Closing
that root clears its collapse record, so a later Open starts expanded. Open of a root still in the
live list is a relist and preserves its section state. Reload and Desktop restart instead restore
remembered section collapse under the owner-approved
[ADR-0009 persistence amendment](../adr/0009-multiple-opened-folders.md#amendment-2026-10-25-remember-collapsed-folder-sections-425).

The origin-specific localStorage key `litzio.collapsedFolderSections` contains a JSON array of
Host-normalized root paths, in opened-folder order; for example `["/work/docs"]`. Only collapsed,
currently opened roots are written. Expanded roots, child-folder expansion and listings are not
stored. Vite, Desktop and HTTP origins do not share the preference. It grants no filesystem access:
the Host authorizes and lists every restored root before its remembered collapse is applied.

Restoration alone never writes either navigation preference. Missing/refused/unopened roots have
no live collapse state; stale stored records are pruned on the next explicit write, matching
#370's restoration-only boundary. User Open/Close, section toggle and navigation reveal write the
current reduced collapsed-root list. During startup those writes wait for all remembered roots
to settle, retaining pending roots and user changes. There is no last-written-value cache: each
explicit action writes even if this tab previously saved that same array and another tab has since
overwritten it. Tabs retain independent live views; the latest action writes its own current list,
without a storage-event synchronization service. Child listing/expansion alone never writes.
Unavailable storage leaves the live page usable without persistence.

Manual collapse is allowed even for the active document: its tree current background is hidden with
the tree, while the document tab and TopBar still identify it. Expanding restores the current background.
The existing reveal trigger is unchanged: changing the active document path (including selecting
an inactive tab/search result), creating a document, or creating a folder reveals it in every
containing opened root. Reveal now also expands those sections. Relisting an already-open root
may reveal child folders as before but respects the section's manual collapse. Selecting the
already-active document does not change its path and therefore does not undo manual collapse.
This follows the existing active-path reveal, rather than continuously forcing the current tree
visible on each render or listing response.

Reveal expansion is remembered, including when a containing section was already expanded locally:
the user's document navigation should survive restart and supersede another tab's older collapse.
Startup document/tab restoration is distinguished from explicit navigation: it may list/expand
the current document's child ancestors as before, but never expands a remembered collapsed section
or writes section preferences. Otherwise restoring the active document would erase the very
collapse being restored. Selecting the already-active document still changes no active path.

Command-center search still collects all reachable cached document listings regardless of section
or subfolder visibility (#400 / #384); searching never expands a section or makes Host requests.
Opening a different result uses the same reveal described above. No new search source, Core
semantic operation or CLI command is needed: this is interface navigation state.

Historical section decisions and captures: [Section persistence decision and verification](../reviews/editor-ux-shell-history-2026-11.md#section-persistence-decision-and-verification-2026-10-25) and [Section disclosure verification and captures](../reviews/editor-ux-shell-history-2026-11.md#section-disclosure-verification-and-captures).

## Sidebar Open folder entry (#385)

Historical placement decision: #385 moved Open folder into the header. The owner-approved
[#582 amendment](../adr/0009-multiple-opened-folders.md#amendment-2026-10-27-explorer-sidebar-582)
supersedes that placement with the [explorer layout](#sidebar-and-native-title-bar-582--605).
The picker, handler, add/relist behavior, preferences and command-center entry remain unchanged.

Historical sidebar captures and verification: [Sidebar entry capture evidence](../reviews/editor-ux-shell-history-2026-11.md#sidebar-entry-capture-evidence-385).

## Start without a document (#174)

When startup leaves no open document tabs, the document column shows the start instead of an
editor. A Host response without a default document does not prevent the Editor from restoring tabs.
Explicit paths, tab memory, recovery and the Vite fallback follow the
[session startup contract](editing-session-save-v1.md#tab-navigation-memory-383).
It is the app's start, not a document (#298): it sits on the
canvas without the document paper, under the product mark and name. It offers Open folder… (primary), the
recent folders from the folder picker (name, then full path) and, when the Host offers one, the
sample. Choosing a recent folder lists it in the sidebar like Open folder; the start stays until
a document is chosen in the sidebar. Choosing a folder never discards current edits or drafts;
choosing another file or New preserves existing sessions under the
[session protection contract](editing-session-save-v1.md#switching-and-recovery). Open sample document
opens the Host's writable sample for the current UI language through Open and its checks. Its
temporary notice explains that edits reset to the bundled original on the next app start. The sample is opened only on request. Without a document the TopBar keeps its Find documents and commands action, with `No file opened` only as optional secondary information; Save, File actions and the views
stay unavailable. Document settings is absent; the TopBar local-width toggle remains available. No error is shown. With nothing to lose, the Desktop app's
update restart check allows the restart unless a document is opening. Closing the last document tab returns here while keeping the folder tree and preferences. Host start
information is retained, including localized sample paths supplied alongside a Desktop launch file
or the development fallback. HTTP offers allowed server folders, filters recent folders to
those roots and has no sample fallback. The start writes nothing and changes no document
semantics, so it has no CLI counterpart.

## Folder files and image preview (#217)

Files lists every regular non-hidden file, including extensionless files; symlinks/junctions stay excluded.
Markdown retains existing document/native admission and tab behavior. Images use the image icon and
read-only preview description; other files use the generic file icon and explicit editing-unavailable
description. Mouse and Enter/Space share the same dispatch. Image/file selection opens a transient
shared Dialog, preserving the existing editor, selection, Undo, dirty work and property drafts.
Other files show name/path and an editing-unavailable explanation only. Image loading/failure stays
inside the dialog; closing or Escape returns focus to its tree row. The modal blocks Save shortcuts.
The image picker remains independent. See the [Host preview contract](filesystem-host-boundary-v1.md#read-only-folder-preview-217).

## Command center (#363)

The TopBar button leads with a search icon and `Find documents and commands` / `문서·명령 찾기` (#556). Its accessible name also names that action. The current document location/name is optional muted secondary information; the tab row already identifies the file. The full path remains in the secondary information's tooltip. Click or Ctrl/Cmd+/
opens a search dialog near the top center. Type `>` to list commands only.
Ctrl/Cmd+P and Ctrl/Cmd+Shift+P are no longer intercepted: browser printing retains its default behavior.
The shortcut uses the character with a guarded opaque-IME fallback, exact modifiers and no active IME composition; other modal dialogs
still block opening the center and Save behind them.
The input searches opened tab names/paths, Markdown documents already listed in the sidebar and
existing shell command names, including their Korean/English aliases. It does not search document
contents. The bounded listing scope is defined below (#384); #363's no-index/no-scan boundary remains.
The placeholder explicitly names open tabs, loaded documents and commands in both languages (#556).
No-match guidance explains that unread subfolders contribute no documents until expanded, and
Refresh updates already loaded listings; it does not claim that Refresh recursively reads unopened folders.

Commands reuse Open folder, Save, Reload, Copy path, Read/Edit/Source, Outline, sidebar, document width
and app/document Settings handlers and their current availability, plus the history and read-only shortcut guide below (#471). Switching to an opened document reuses tab
activation: no document read/write, new editor state or implicit save. Pending operations retain the
same switching and document-action restrictions; unavailable results remain visibly disabled.
Without an open document, the center still offers folder/settings/view-layout commands.

**Connect bibliography…** (#473, owner decision 2026-10-26) opens the same candidate Dialog as
the **Document settings** bibliography row (while a declaration is connected) and the connect
button in a visible References area.
It shares the document settings restrictions (no document, pending work, Source), without
requiring an editor caret. Selection stages the existing bibliography declaration edit; Save
applies it. See [bibliography connections](citations-v1.md#connect-and-disconnect-bibliography-files-438).

Base UI Combobox owns keyboard/pointer highlighting, selection and IME handling inside the shared
Dialog. Filtering highlights the first match; the first Down moves to the next available result.
Hover moves the same active highlight, using selected surface/text without a marker and the shared control radius (#515); arrows continue from
that item. Enter runs the chosen item. The search input autofocuses on mount so typing immediately
after the opening shortcut goes to search, including before the Dialog's deferred initial focus.
Selecting a Visual document focuses its editor after tab activation and modal dismissal, preserving
its selection and allowing immediate typing; this applies to a newly opened or retained tab and
reselecting the active tab. A tab retained in read-only Source keeps that view and tab-button focus.
Escape/outside dismissal returns to the invoking control or editor without changing its
selection/history/property drafts.
A selected command closes the center before opening its target dialog; that dialog owns focus.
Outline and sidebar commands hand focus to their surviving toggle, including when the invoking
control was inside the panel being hidden. Collapsing the sidebar keeps its rail toggle available for focus return.
Other dialogs retain their shortcuts, and Ctrl/Cmd+S cannot save behind the center.
No-match feedback and controls are translated with the existing UI language.

This is Editor shell navigation and existing-history dispatch. It adds no semantic operation or CLI command;
Core and the existing file/session handlers remain authoritative. There is no command plugin system,
recent-command persistence, filesystem index or independent document-content implementation.

### Action and search scope (#556)

The owner-approved change prioritizes the search action and truthful loaded-list scope, with
label matches before detail-only matches. It preserves #554's 56rem / 48px single-row boundary,
160px minimum, centered button and #571's exact-name command selection helper. Secondary location
yields before the shortcut; only then may the action label ellipsize. This is shell presentation
and navigation, so Core semantics, CLI and Host APIs need no changes.

Manual comparison uses the same initial technical document, clean state, English UI, persistent
Windows Chrome profile, Vite origin and 900px viewport height. Before is master `cc2fb2d`; After
uses #556. These captures are visual evidence, separate from automatic geometry assertions:

| Width | Before | After |
| --- | --- | --- |
| 1440px | [Before](assets/command-find-556/before-1440.png) | [After](assets/command-find-556/after-1440.png) |
| 390px | [Before](assets/command-find-556/before-390.png) | [After](assets/command-find-556/after-390.png) |

The existing shell unit test covers normalized label/detail ordering, ties, aliases, empty queries
and command-only mode. The existing command-center browser scenario checks both languages' scope
copy alongside its unchanged cached-folder/no-request, focus, IME and Save/Reload protections.
Layout-rules retains the 32-case bilingual/panel matrix and fails if secondary information remains
while the action is clipped. Its first run caught exactly that product defect at 1440px with a
collapsed Sidebar; the action now reserves its width while secondary location is shown. Failure
artifacts remain in ignored `tmp/layout-failure-556`; no assertion or timeout was weakened.
Local Editor tests (295/295), workspace typecheck, Editor build, docs/whitespace checks and
command-center, editor-shell and corrected layout-rules browser scenarios passed. Chrome's
checkout-owned persistent profile was reused; Edge and packaged Desktop are left to PR CI.
The first PR CI run (`40387087410`, head `e5aceb0`) exposed two old visibility assumptions:
file-preview waited for the now-optional TopBar filename, and quiet-document required that filename
to remain over 100px. Both now inspect the visible selected document tab. Quiet-document retains
the full-path tooltip, filename-width, content containment and end-scroll assertions; file-preview
retains active-file identity and all preview state/focus checks. These are contract-aligned selector
updates, not reduced assertions. Downloaded CI artifacts are kept under ignored `tmp/ci-556-shard3`
and `tmp/ci-556-shard4`. The corrected file-preview and quiet-document scenarios both passed locally.

### History commands and keyboard shortcut guide (#471)

`Undo` / `되돌리기` and `Redo` / `다시 실행` act on the active Visual document's
existing Tiptap keyboard path, one invocation at a time. Undo gives Markdown input-rule reversal
precedence just like Ctrl/Cmd+Z: after `## ` converts a paragraph to a heading, it restores the
typed `## ` including the space and its caret. Otherwise Undo/Redo use the existing native history.
The command center and opaque-IME fallback share the same visible-key dispatch through the engine
keymaps; no second matcher, input-rule implementation or captured/replayed transaction is added.
The table-deletion notice retains its native Undo for the specific deletion, guarded by the exact
post-deletion document identity. Command-center Undo/Redo changes that identity and revokes the
table-deletion notice/action through the same transaction invalidation; it cannot revive a stale
notice action. Redo of a referenced table's deletion can still show the ordinary reference warning.
They remain visible but disabled without
an active Visual document, while busy, or when that history has no corresponding step.
They do not require an editor-origin opener: clicking the TopBar center can dispatch history.
After the center releases its modal focus, the command runs and synchronously focuses the
same editor. Other tabs' history and unapplied property forms are not separate history targets.
The Save, Undo and Redo rows show their shared platform labels (Ctrl+S/Z/Y, or ⌘S/Z/Y).
The guide also shows the existing Ctrl/Cmd+Shift+Z redo alternative.

`Keyboard shortcuts` / `키보드 단축키` opens a read-only shared Dialog after the center
closes. The guide is a curated list of useful Litzio editing shortcuts (#496), with short
English/Korean names and shared platform labels, rather than an inventory of every binding:

- General: Command center Ctrl/Cmd+/, Save Ctrl/Cmd+S.
- Editing: Undo Ctrl/Cmd+Z; Redo Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z; New block Enter;
  Edit selected Figure, Table, block Equation or inline math Enter (#557);
  Apply properties Ctrl+Enter on Windows/Linux or Cmd+Enter on macOS within a properties form (#576);
  Line break Shift+Enter (supported prose blocks, not headings);
  Tab/Shift+Tab increases/decreases heading level at a caret or indents/outdents a list item;
  Ctrl/Cmd+Shift+8 and Ctrl/Cmd+Shift+7 toggle Bullet list / Numbered list;
  Code block Ctrl/Cmd+Alt+C; Go to document end Ctrl/Cmd+End.
- Formatting: bold Ctrl/Cmd+B, italic Ctrl/Cmd+I, strikethrough Ctrl/Cmd+Shift+S,
  inline code Ctrl/Cmd+E, link Ctrl/Cmd+', subscript Ctrl/Cmd+, and superscript Ctrl/Cmd+.
- Tables: Next / previous cell Tab/Shift+Tab.

Keyboard-layout aliases, separate macOS-only variants, basic OS editing/navigation keys and
menu/dialog navigation are omitted from the guide. Their registered behavior is unchanged.

Labels use `shortcuts.ts`, also consumed by the existing shell matchers and formatting tooltips;
Tiptap retains ownership of its keymaps. Editor unit coverage checks every displayed binding
against enabled Core, Tiptap and application keymaps or the existing shell handlers, on Windows
and macOS. A focused presence check protects the curated commands above, without requiring every
registered binding, layout alias, item count or markup. Escape, outside dismissal or Close returns focus to the center's original opener
(editor when opened there, otherwise the invoking control). The shared dialog surface, compact
Close control, spacing, typography and viewport-bounded scroll are reused. The guide reuses the
existing wide Folder dialog width token. At 1280/1440px each entry has its name left and keys
right on one line; at 375px rows may wrap within the viewport without horizontal overflow.
It creates no document/history change and has no opening shortcut. These are Editor history,
focus and help interactions, so they introduce no Core operation or CLI command. Desktop Hangul
IME delivery of Ctrl+Y/Ctrl+Z reuses the guarded matcher integrated from [#481](https://github.com/litzio/litzio/pull/481).

Historical command-center captures and keyboard probes: [Command center verification](../reviews/editor-ux-shell-history-2026-11.md#command-center-verification-363) and [Command center keyboard verification](../reviews/editor-ux-shell-history-2026-11.md#command-center-keyboard-verification-386).

### Caret insertion commands (part of #439)

`Insert citation…` / `인용 삽입…` and `Insert cross-reference…` / `상호 참조 삽입…`
open the existing Citation and Reference forms at the retained Visual editor caret. They need
no slash or preceding whitespace, including directly after Korean text. Availability reuses
the slash menu's schema-backed inline caret eligibility and the existing session busy/view
restrictions. The center must be opened while editor content itself has focus; forms,
property controls (including their buttons), popovers, node-view controls and other shell
controls cannot use a retained body selection to insert. Code, Source and non-caret
selections cannot insert.
Known limitation ([#416](https://github.com/litzio/litzio/issues/416)): the engine may not yet have read a selection made within a few tens of milliseconds of the shortcut.
The center releases modal focus before opening the form. Escape returns to the same editor
caret without a document/history change; Apply uses the existing insertion function, returns
editor focus and creates one undo step. Outside dismissal retains the clicked control's focus.

Scope: reuse forms, semantic operations and inline eligibility; no new Core/CLI operation is
needed for this interface entry point. No shortcut or slash-trigger change is included.
Shortcut combinations remain an owner decision, so #439 stays open. Completion requires the
extended `citation-authoring` browser regression (Korean caret, Escape, Undo/Redo and actual
Save → Reload), Editor tests, typecheck/build, docs and diff checks.

Historical insertion regressions and focus-origin evidence: [Caret insertion verification](../reviews/editor-ux-shell-history-2026-11.md#caret-insertion-verification-439).

### Listed document search (#384)

The source is the in-memory listing cache reachable from the roots of **all currently opened sidebar
folders** ([ADR-0009](../adr/0009-multiple-opened-folders.md)). Starting at each root, follow folder
entries in the current parent listings and collect each reached listing's `document` entries,
regardless of expansion or sidebar visibility. A subfolder whose contents have never been listed
contributes no files. If a parent is relisted without a child folder, that disconnected child's
retained cache stops contributing immediately. Restoring the child entry makes its retained listing
reachable again, including while collapsed. Search does not change the sidebar's cache preservation
or expansion behavior. Closing a root removes its contribution. Candidate collection and path sorting
run only while the center is open and are memoized until the opened-folder trees change.
Search itself neither requests Host listings/document reads nor expands folders, recursively lists
the filesystem, builds an index or stores the search source in preferences.

Results use the Host-resolved path as identity: an opened tab replaces that file's listing result,
and overlapping opened roots yield one file result. Opened tabs keep tab order and show `Opened tab`
with the full path; unopened Markdown follows in full-path locale sort order and shows `Files` with
its full path. Existing commands follow in their existing order before filtering. For a nonempty query,
matches whose label contains every query word come before matches requiring detail/path or aliases
(#556). Existing order is stable inside each grade; an empty query and `>` alone retain original order.
Case/width normalization, all-word matching across name/path/aliases and the `>` commands-only mode
remain. Filtering always searches **all** candidates before presentation.
The existing height-bounded, scrolling Combobox renders only the first 50 matches in that order.
A persistent count status shows the full match count, including zero. Above 50 it shows the visible
and total counts with guidance to type more to narrow the search, in Korean or English. Base UI's
always-mounted `Combobox.Status` supplies a polite, atomic live region, including its initial text
announcement handling. Base UI still owns highlight, arrows and Enter within the displayed matches;
there are no page controls. To reach a match outside the first 50, narrow the query: filtering still
searches the entire source. This explicit presentation limit replaces the earlier pagination decision
without changing source scope or shell action handlers. #556 adds only the two match grades above; no search index,
virtualization library or document-content command is introduced.

As in Files, a listed Markdown file with `native: false` remains selectable but uses subtle text,
the crossed-file icon and `Not an Litzio document` explanation (also accessible). This keeps the
same admission explanation available through either navigation entry. The existing Host/Core
admission check remains authoritative even for a listing marked native. Images, other regular files
and folders are omitted: they are preview/navigation entries rather than editable documents and
retain their existing sidebar entry points.

Selecting an unopened file closes the center before calling the same `openFolderDocument` handler
as the sidebar, including existing operation/continuation restrictions, retained dirty tabs and
property drafts, admission refusal and recovery flows. A successful open focuses the mounted Visual
editor; an admission/recovery dialog owns its focus. Opening a file may relist/reveal its folders
through the existing open path; those requests are not search-time discovery. Opened-tab selection
keeps #386's synchronous tab activation and Dialog final-focus behavior, including Source tabs.
This is Editor navigation, so no Core operation or CLI command is added.

Historical listed-search verification, measurements and result-limit decisions: [Listed document search verification](../reviews/editor-ux-shell-history-2026-11.md#listed-document-search-verification-384), [Listed search review follow-up](../reviews/editor-ux-shell-history-2026-11.md#listed-search-review-follow-up-384) and [Listed search result-limit follow-up](../reviews/editor-ux-shell-history-2026-11.md#listed-search-result-limit-follow-up-384).

### Open ordinary links (#725)

An ordinary click keeps editing and never opens a link. Ctrl/Cmd+single click on an ordinary
link mark opens an absolute http(s) URL with `window.open(url, "_blank", "noopener")`.
The web Host opens a new tab; Desktop's existing `setWindowOpenHandler` sends it to the
system browser. Composition, selection drags, multi-clicks and read-only endnotes do not open links.
The existing Link form also has a keyboard-accessible **Open / 열기** button using its current
URL input, without applying that draft to the document. Relative paths, fragments, incomplete
URLs and other schemes disable Open; its wrapper tooltip explains that only external http(s)
links can be opened. Authoring and preserving those links remain unchanged. This is Editor-only
interaction; no Core operation or CLI command is needed.

2026-10-29 verification: Editor tests (339), workspace typecheck and Editor build passed.
The existing `link-authoring` browser scenario covers plain/modified clicks, IME, selection
drag, read-only endnotes, disabled destinations and the keyboard Open action without applying
its draft. A real new tab has a null `window.opener`; existing authoring/Save/Reload checks remain.
Local `layout-rules` and `quiet-document` checks cover the surrounding shared controls.
Desktop's existing main-process dispatch was inspected; packaged Desktop/Edge execution is left to CI.

The following manual-review captures use Windows persistent Chrome, English UI, Light/Paper,
900px viewport height, DPR/zoom 1, bundled Pretendard ready, the same fresh `links.md` scratch
document and selected OpenAI link, URL-input focus and pointer at (0,0). Before uses the original
Link form from base `7f6ba127803ad456f57b7c2d8688e638cf6040cb`; After uses this implementation.
Both use the updated fixture including the read-only endnote. Capture through
`pnpm browser:test link-authoring --screenshots`; generated traces/logs remain in ignored `tmp/`.
The extra compact outline button wraps with the existing form controls without widening the form.

| Width | Before | After |
| --- | --- | --- |
| 1440px | [Before](assets/open-link-725/before-en-1440.png) | [After](assets/open-link-725/after-en-1440.png) |
| 640px | [Before](assets/open-link-725/before-en-640.png) | [After](assets/open-link-725/after-en-640.png) |

### Relative image link previews (#731)

An ordinary Markdown link to a document-relative PNG, JPG/JPEG, GIF, WebP or SVG
shows an image preview on pointer hover throughout the Visual document, including
read-only endnote definitions. Keyboard reading follows the existing editor selection:
an empty text selection inside an image-link mark shows its preview while the editor
has focus. Moving the caret outside the link, selecting a range, editing or composition
closes it. Links retain ordinary StarterKit rendering and editing: no extra Tab stop,
anchor-element focus or Enter/Tab interception. Click placement, double-click word
selection, drag selection, Korean composition, link authoring and Undo stay unchanged.
Destinations use the existing Figure Host resolver and document locator, including
its access boundary. Missing or undecodable images show **Image not found /
이미지를 찾을 수 없음**. Absolute paths, fragments, http(s) destinations and other
schemes have no preview; hover/focus never requests a remote image. Click behavior
remains the [ordinary-link contract](#open-ordinary-links-725).

The display-only overlay reuses the editor overlay surface, border, typography and
shadow, with 8px padding, a 320px width cap and 240px image-height cap (adjustable
tokens). It fits the owning split group's viewport through `useOverlayBounds`,
follows document scrolling, and closes when its anchor scrolls out of view. Escape,
pointer exit, blur, pointer down, editing and composition dismiss it. It is pointer
transparent and never moves focus, changes selection or writes document content.
No new syntax, Core operation, CLI command or Host API is introduced. Image rename
retargeting, printing/export and remote images are outside this feature.

### Endnote and citation reading previews (#752)

Body endnote references show their current definition on hover; citation chips show the matching
bibliography entries in key order, using the same formatted parts and readiness as References.
Missing definitions, missing keys and unchecked bibliography retain the existing status messages.
These previews replace the chips' native title tooltips. Endnote previews show the definition without
a visible navigation hint (#773); the resolved original chip exposes a link role and retains its
accessible name describing navigation. Endnote click still reveals its definition;
citation click/selection and its explicit Edit button keep their existing behavior.

The same `ReadingPreview` observer handles image links and both chip kinds. A focused editor's
collapsed text caret touching either side of a chip, or native atomic selection of that chip, shows
the same content. There are no added Tab stops, focus transfers, selection changes or transactions.
Typing, document updates and composition close the preview until a subsequent reading gesture;
range selection, Escape, blur, pointer down/exit and scrolling the anchor out of view also close it.
Existing editor keyboard, pointer and IME handling owns all input and selection.

Endnote inline content uses schema mark serialization and existing math/reference/citation display
calculations, without an editor instance or editable NodeViews. Image links keep their formatted
link text in this static preview; their original definition still supports #731 image hover.
Preview links are display-only spans, so there are no focusable or editable descendants.
Both kinds share #731's pointer-transparent surface, spacing, `useOverlayBounds`, split-group
viewport fitting and adjustable reading width/height tokens (20rem / 15rem). Longer content is
clipped to the preview cap; the original definition or References list remains the full reading
surface. No Core operation, CLI command, saved syntax or Host API is added because this is
Editor-only presentation.

`reference-preview` covers hover without state changes, both caret sides/native atom selection,
range dismissal, existing endnote navigation, real citation-click typing/Undo, text-caret Korean
composition, rich static content, unresolved states, list/table chips, scroll dismissal and
1440/640px split bounds. `image-link-preview`, `citations`, `footnotes`, `citation-authoring`,
`layout-rules` and `quiet-document` retain their interface regressions. CDP composition is not
a manual native Windows IME/candidate-window check.

Manual captures use the same fixture, pointer targets, scroll top and persistent Chrome profile
at 1440×900 / 640×900, DPR/zoom 1, English Light/Paper and bundled Pretendard. Before restores
the runtime sources from base `35cbfdfb`; After uses this implementation. The
[capture metadata](assets/reference-preview-752/capture-metadata.json) records the environment.
Only representative PNGs are retained; traces and generated logs stay outside Git.

| Preview | Width | Before | After |
| --- | --- | --- | --- |
| Endnote | 1440 | [PNG](assets/reference-preview-752/before-endnote-1440.png) | [PNG](assets/reference-preview-752/after-endnote-1440.png) |
| Endnote | 640 | [PNG](assets/reference-preview-752/before-endnote-640.png) | [PNG](assets/reference-preview-752/after-endnote-640.png) |
| Citation | 1440 | [PNG](assets/reference-preview-752/before-citation-1440.png) | [PNG](assets/reference-preview-752/after-citation-1440.png) |
| Citation | 640 | [PNG](assets/reference-preview-752/before-citation-640.png) | [PNG](assets/reference-preview-752/after-citation-640.png) |

The `image-link-preview` browser scenario covers hover and keyboard caret movement,
read-only endnotes, quote/list/table links, missing and undecodable images, zero
remote requests, scrolling and split-group bounds. It also compares actual pointer
editing of body/list/table image links with an ordinary link: click then type, native
double-click and drag selection, Korean composition through Chromium's IME protocol,
Ctrl/Cmd+' link authoring and Undo. It never repairs focus or selection before those
input checks. The click/caret regression fails on the original preview implementation
(`33c3bf2b67b7f814dd4083b3a02798d3f680101d`). Native Core admission and canonical round-trip were checked
before implementation with `[^n]: [그림 보기](https://github.com/litzio/litzio/blob/archive/2026-11-13-plugins-declarative/docs/design/assets/footnote-110.png)`; the link's
URL/text and stable reserialization are already supported.

Manual-review pairs below use base `a5c1c702f375712a5bdd9e3962ec6c7e137e9f9f`
and this implementation, the same `image-link-preview/links.md` scratch fixture,
Local diagram hover, scroll top, Windows persistent Chrome, English Light/Paper,
1440/640 × 900px, DPR/zoom 1 and bundled Pretendard ready. Before was captured
with the base rendering; After is reproducible with
`pnpm browser:test image-link-preview --screenshots`. Generated logs/traces stay in
ignored `tmp/`; only these small review PNGs are retained.

| Width | Before | After |
| --- | --- | --- |
| 1440px | [Before](assets/image-link-preview-731/before-1440.png) | [After](assets/image-link-preview-731/after-1440.png) |
| 640px | [Before](assets/image-link-preview-731/before-640.png) | [After](assets/image-link-preview-731/after-640.png) |

### Shortcut contract (#381)

Undo/Redo from nonediting shell focus targets only the active Visual document (#772),
using the existing editor keymap and focus/selection policy. Editable fields and open
modal/Settings surfaces keep their own keys; Source/comparison/read-only tabs, busy
sessions and composition do not dispatch document history. The authoritative boundaries
are in [Shared history](document-editing-v1.md#shared-history-and-editing-boundaries).

The [shared shortcut definitions](../../apps/editor/src/shortcuts.ts) own characters, IME fallback keys, modifiers,
platform labels and `aria-keyshortcuts`. TopBar, selection toolbar, shortcut guide and command-center
items consume those definitions. Existing Bold/Italic tooltip notation is retained. Outline still has no shortcut.
The link shortcut runs in ProseMirror's existing `handleKeyDown` path only for a supported text
selection, uses the same link draft/form as the toolbar, and retains link-range expansion, URL
validation, Apply/Remove, Escape and blur dismissal. Apply/Remove/Escape return focus synchronously
through ProseMirror, so a previous form cannot later blur a newly opened link form. It does nothing behind a modal or during IME
composition. No Core operation or CLI counterpart is needed for this focus/selection interaction.

Selection follows [#378](https://github.com/litzio/litzio/issues/378). The two-key bindings are
**Ctrl/Cmd+/** (slash character) for the center and **Ctrl/Cmd+'** (apostrophe character)
for links. Neither uses Alt/AltGr or Shift. The old Ctrl/Cmd+Alt+Shift+P/K bindings are removed;
Ctrl/Cmd+P and Ctrl/Cmd+Shift+P remain unhandled so browser printing is preserved.

The official [Chrome](https://support.google.com/chrome/answer/157179?hl=en),
[Edge](https://support.microsoft.com/en-us/edge/keyboard-shortcuts-in-microsoft-edge),
[Windows](https://support.microsoft.com/en-gb/accessibility/windows/keyboard-shortcuts-in-windows) and
[macOS](https://support.apple.com/en-us/102650) lists were checked on 2026-10-24.
The selected bindings have no listed browser or global system default. Apple's Cmd+/ toggles the
status bar in Finder only; it does not apply when Chrome/Edge has focus. The
[Microsoft Korean layout](https://learn.microsoft.com/en-us/globalization/keyboards/kbdkor.html)
includes unshifted slash (after period) and apostrophe (after semicolon, before Enter).
Literal `event.key` must be `/` or `'`. A different character at the same position is not a shortcut;
full-width punctuation is a different character too. Only `Process` or `Unidentified` may fall back
to `event.code` (`Slash` / `Quote`), and active composition is still ignored.
Left Ctrl is recommended on Korean layouts where right Ctrl is Hanja conversion. No input-source
switching shortcut is claimed. No Core or CLI semantics change.

Historical shortcut candidates, delivery probes and captures: [Earlier two-key candidate audit](../reviews/editor-ux-shell-history-2026-11.md#earlier-two-key-candidate-audit-381-historical-physical-only-implementation) and [Earlier three-modifier verification and captures](../reviews/editor-ux-shell-history-2026-11.md#earlier-three-modifier-verification-and-captures-381-historical).

#### Keyboard-layout safety (#381 review follow-up)

Browser accelerators are also checked conservatively: `keyCode` must be the definition's unshifted
punctuation virtual key (191 for `/`, 222 for `'`), unspecified (0), or IME Process (229).
Other native mappings are passed through, even if an IME reports an opaque key or the visible
character matches. This is necessary because French AZERTY apostrophe uses digit 4: character-only
matching would compete with Ctrl+4. A German `Process`/`Unidentified` event with VK_MINUS (189)
must likewise retain browser zoom. Chromium derives browser accelerators from the
[Windows virtual key](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/ui/content_accelerators/accelerator_util.cc),
not just the DOM character. The numeric guard deliberately uses the legacy field for this supported
Chromium boundary; [Windows virtual-key definitions](https://learn.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes)
identify those values. Unknown native mappings fail closed rather than claiming cross-layout support.

Shift remains disallowed. We do not introduce Ctrl/Cmd+Shift+7 or any other layout-dependent alias:
the displayed two-key bindings must not grow an unverified browser/OS accelerator. Layouts requiring
Shift, AltGr, or a reserved virtual key use the existing Command center / Link buttons instead.
The tooltip, ARIA and command-item definitions remain unchanged and denote characters, not universal
physical positions. Depending on the layout, the character can be on another key; not every layout
has a usable unshifted, unreserved keyboard combination. No automatic remapping is claimed.

Official layouts: [US](https://learn.microsoft.com/en-us/globalization/keyboards/kbdus),
[Korean](https://learn.microsoft.com/en-us/globalization/keyboards/kbdkor),
[German](https://learn.microsoft.com/en-us/globalization/keyboards/kbdgr),
[French legacy AZERTY](https://learn.microsoft.com/en-us/globalization/keyboards/kbdfr).

| Layout / event | Center | Link | Browser behavior |
| --- | --- | --- | --- |
| US, Korean literal `/` / `'`, VK 191 / 222 | Opens | Opens | No listed default replaced |
| Korean opaque `Process` / `Unidentified`, Slash / Quote, VK 229 / 0 / matching punctuation | Opens | Opens | Composition still ignored; other physical codes passed through |
| German Slash-position `-`, VK 189; Quote-position `ä` | Does not open | Does not open | Ctrl+- zoom preserved |
| German Shift+7 `/`; Shift+Backslash `'` | Does not open | Does not open | Shift aliases deliberately unavailable; use buttons |
| French Slash-position `!`; Quote-position `ù` | Does not open | Does not open | Different characters passed through |
| French Shift+Period `/`; digit-4 apostrophe | Does not open | Does not open | Ctrl+4 tab switch preserved; use buttons |
| Opaque key masking VK_MINUS / VK_4 | Does not open | Does not open | Browser zoom / tab switch preserved |

Historical layout-specific failures and browser probes: [Shortcut layout verification](../reviews/editor-ux-shell-history-2026-11.md#shortcut-layout-verification-381).

## Writing interactions

- The [document title](document-editing-v1.md#document-title-255) is a plain frontmatter string edited above the body. Empty/absent values show an empty input with Add a title placeholder. Every H1–H6 is a body section with ordinary movement, conversion and reference controls; no title is inferred from body position (#722).
- Hover or keyboard focus reveals the current block's `+` and drag/action handle. Pointer travel into tools preserves them; hover does not change document state. On devices without hover, tools remain visible. A single empty editable paragraph is the starting-state exception: its `+` is always visible, its drag handle hidden, and a non-persistent hint says `Start writing, or type / to add a block.` Typing hides the hint; undo restores it. Clicking the paper below the content continues writing through the existing editor operation.
- `+` and `/` share supported insert commands, grouped by dividers with an icon and, as a key chip, the Markdown shortcut that makes the same block: Text (Paragraph, Heading 1–6, including without a search query; #575), Lists, Blocks (Note, Warning, Quote, Divider), Technical (Code block, Equation, Figure, Table); slash also offers Endnote ([Endnotes](footnotes-v1.md)) and actual Equation/Figure/Table targets and section references. H1 is a body insert choice; the separate title input writes frontmatter (#722). The block menu groups conversions, table, section and block actions the same way. Slash keeps editor focus. Gutter-opened menus focus their first item. The command center has inline citation/reference insertion, but no heading insertion items.
- Slash reference choices show computed display numbers with caption summaries (Equation: label), and search caption words, labels, kinds and display prefix/number; template-based forms such as `Figure 2`, `식 (3)` and `Table 1` remain one slash query. Section choices keep their heading names and creation behavior. Ordering and overflow use the existing shared menu; see [reference search and menu names](section-references-v1.md#editor).
- `/ref`, `/reference` and `/참조` list all reference kinds, including unlabeled headings. Figure and Table kind keywords (`figure` / `그림`, `table` / `표`) match their respective kinds. Empty queries retain labeled targets only, and unrelated queries do not list references unless their labels, captions or heading words match.
- Body Paragraph/Heading menus convert between prose and H1–H6 while preserving inline content; line breaks prevent conversion to a Heading. Tab/Shift+Tab changes level within H1–H6; Markdown `# ` creates a body H1. Title metadata remains independent. See [document title](document-editing-v1.md#document-title-255). Admonition menus change among the standard kinds.
- Block action menu exposes existing supported deletion, and for a table adding a row below or a column right of the caret's cell; a table's own action bar below it holds Edit (label), Table actions and Delete table; handle drag reorders through the existing editor operation. Unsupported document structures reject [native admission](document-support-v1.md). [Endnotes](footnotes-v1.md#editor) follow their first reference: their handle opens block actions but does not drag, they have no `+`, and a dragged block lands in the body.
- Text selection in supported paragraphs, headings, quotes, simple admonitions, table cells and Figure/Table captions offers Bold, Italic, Strikethrough, Subscript, Superscript, Inline code, Link, Inline Math and Cross-reference. Each button's tooltip names it with its shortcut where one exists (Bold Ctrl/Cmd+B, Italic Ctrl/Cmd+I, Strikethrough Ctrl/Cmd+Shift+S, Inline code Ctrl/Cmd+E, Link Ctrl/Cmd+'); Cross-reference uses a bookmark icon, as do reference choices in the slash menu. Ctrl/Cmd+, and Ctrl/Cmd+. toggle subscript and superscript; applying one replaces the other. Tab moves from the selection into the toolbar (in table cells and lists Tab keeps its cell/indent meaning); Escape or Shift+Tab returns with the selection unchanged.
- Figure selection shows the selection outline only. Explicit Edit, selected Enter or double-click on its image surface (including the pending frame and image-load error) opens Image/Alt text/Label fields. All captions are edited directly in the document; caption double-click keeps normal text selection. Metadata Apply preserves the live caption and its formatting. Figure metadata survives keyboard selection/focus movement. Done and pointer dismissal apply; Escape cancels. Core validation failure preserves values. The anchored popover, explicit replacement/rename and Mermaid source-entry contracts are in [Figure properties](figure-authoring-v1.md#anchored-figure-properties-757); cancelling never removes the Figure.
- `/figure` and `+` insert an empty Figure without opening its properties; the caret starts in its caption. Image-less Figures, with or without caption or label, remain as pending Figures with a dashed `No content yet` frame. Clicking the frame selects the Figure; existing Edit connects an image URL later. Pending Figures retain normal Figure metadata, numbering and references and are included in Save/Source. See [Figure authoring](figure-authoring-v1.md).
- Equations, Tables, inline math and section labels use the shared explicit properties form; Figure metadata uses the #757 popover described above: selecting a block opens no panel; Edit opens its explicit form (Equation in its document block with LaTeX, draft preview, number and label; Figure in a popover with image, alt text and label), with Apply/Cancel and Escape. Figure image surfaces, block/inline formula previews and Table metadata offer double-click through the same path; Enter on a selected Figure, Table or math node also opens properties (#557). Figure/Table caption and cell double-click keeps native text selection. Inline math has an explicit Cancel button and retains its unapplied draft on outside focus, Save/Source and tab switching. Edit, double-click and selected Enter focus the first field; closing retains a text selection inside the block or returns a [caret after the block](document-editing-v1.md#continuous-editing), so subsequent typing preserves it. Opening properties and focus restoration change neither document nor history; double-click while already editing leaves the existing form untouched. Unapplied changes retain the block-local notice and an explicit applied-only Save/Source notice.
- Authoring restrictions, reference chips, caption text and errors stay visible. Authoring metadata is hidden at rest and revealed during interaction; actual labels remain explicit in properties/editing. Figure, Equation and every Table number are computed for display and never written into their text. Table numbers do not depend on caption or Label; [all tables use numbered directives](table-caption-v1.md). The [Number headings](heading-numbering-v1.md) checkbox in Document settings optionally numbers H1–H6 body sections in the document and Outline, leaves the frontmatter title unnumbered, and saves MyST numbering settings only.

### Body block context menu (#223)

In editable Visual view, secondary click on a body block opens its existing block menu
at the pointer, including Table, Figure and Equation. Shift+F10 and the Menu key inside
the editor open the current block's same menu by the caret. It shares the gutter menu's
items, icons, disabled reasons, command execution and Undo/Redo; no separate action data,
clipboard items, Core operation or CLI command is introduced. The shared CommandMenu
fits inside the owning document viewport, including its right/bottom edges and panels.
Its shared surface is portaled beyond the fixed document scroll viewport, at the same
menu stacking level as file/tab action menus above the floating notification center.
An in-document origin retains its scroll/group bounds and endnote interaction ownership;
Table menus keep their existing Popover portal. A lower-right Delete row remains visible
and clickable without moving or changing the notification button.

A secondary click inside nonempty selected text retains that selection and the browser
menu. Outside the selected glyphs it moves the caret to the clicked text position or
selects the rendered atomic block before opening its menu. An inline NodeView (math,
citation or cross-reference) retains the engine's inline selection while its enclosing
block supplies the menu; Escape followed by typing preserves the surrounding content.
Inputs and code/equation source editing retain native menus; keyboard context-menu
entry with selected text also stays native. Read view, read-only documents and unavailable block targets never
suppress the browser menu. Folder/Outline and existing file/tab menus are unchanged.

The menu focuses its first enabled item. Escape and dismissal return focus to the
editor with its retained selection; clicking another control/document position keeps
the ordinary focus/caret handoff. Applying an action uses its existing selection and
history behavior. `read-view` verifies pointer/keyboard entry, handle-menu parity,
native boundaries, selection/focus return and conversion Undo/Redo. It also exercises
contextmenu before secondary mouseup (Linux ordering): the engine's later pointer
handling must not take focus from the menu or prevent Escape from closing it.
The 640px Dark/Korean case also clicks Delete where its row overlaps the notification
button, checks that the menu owns that hit and Undo restores the paragraph, and retains
the notification button's geometry and collapsed state.

Manual same-state evidence: [1440px Before](assets/body-context-223/before-1440.png) /
[After](assets/body-context-223/after-1440.png), [640px Dark/Korean Before](assets/body-context-223/before-640.png) /
[After](assets/body-context-223/after-640.png). [Capture conditions and hashes](assets/body-context-223/capture-metadata.json)
and the [manual capture script](assets/body-context-223/capture.browser.js) distinguish visual
inspection from automated assertions and owner approval. Gutter, file and tab menus were
also inspected at both widths; only the four representative comparison images are retained.

### Unified action menus (#516)

Owner decision D2/M1 (2026-10-26, [#507](https://github.com/litzio/litzio/issues/507)):
block `⠿`/body context menus, `+`, slash and table row/column/table menus reuse `CommandMenu` with
action-specific 16px pinned lucide line icons, labels, optional real hints and group
separators. `+`/slash retain their Markdown-input hints as key chips; block actions
gain no invented keyboard shortcuts. Delete, Delete section, Delete table and
Delete row/column use the danger text/icon token and danger hover surface. Disabled
rows keep native disabled semantics and are skipped by arrow navigation; fixed-block
and draft reasons are exposed as accessible descriptions and tooltips. Boundary moves
also explain their direction: `There is no body block above this one.` /
`There is no body block below this one.` (Korean: `위로 이동할 본문 블록이 없습니다.` /
`아래로 이동할 본문 블록이 없습니다.`), using both tooltip and accessible description.
Fixed endnote reasons retain their priority. Otherwise an active properties
draft's Apply or Cancel reason precedes the boundary reason, so the menu explains
the user action needed before movement can become available.

Body Paragraph/Heading conversions offer H1–H6 and Paragraph for headings, excluding
the current level. Frontmatter title is not a block conversion target. No Duplicate
or list conversion is added.

Numbered-list block handles offer **List format / 목록 형식** (#734). It opens one
shared action-menu list with `1.`, `1)`, `a.`, `a)`, `A.`, `A)`, `i.`, `i)`, `I.`,
`I)` preview labels and a check on the current format. Bullet-list menus omit this
entry. Selection applies to the handle's top-level list, preserving its start,
items and nested lists' independent formats; cursor position does not retarget it.
One format change is one engine transaction and one Undo. Save uses the existing
Core `updateList` replay and its [ordered-format contract](document-support-v1.md#ordered-list-formats-734),
also available through CLI `--list` JSON. Choosing the current format leaves history
unchanged. The Editor renders each list's effective style and delimiter, including
nested lists, and its typed clipboard retains both through paste. Split, merge,
item deletion and Undo retain the containing list's attributes. Direct `a) ` typing
input rules and external HTML/PDF rendering are outside this change.

Move up / Move down swap the block with its adjacent body block through the same
reorder transaction as drag, with one-step Undo. They are disabled at boundaries,
for endnotes, and while that block
has an active properties draft, using the drag restriction reasons. Nothing moves
into endnotes. The leading H1 has no special movement restriction. A heading moves as one block; the existing separately
named Move section up/down and Delete section retain their section meaning. Save
uses the existing Core `moveBlock` replay (CLI `move-block`); no new Core operation
or CLI command is needed. Delete paths, reference warnings and the table deletion
notice/Undo stay unchanged.

Gutter/table menus focus their first enabled row; Escape restores their opener.
Slash highlight/navigation and pointer selection keep focus in the editor.
Base UI File actions/folder menus share the 28px minimum row height, 4px/12px padding,
8px gap, 6px radius and 16px icon slot; their existing focus/highlight owner remains.

Manual same-state evidence at 1440×900, English, fresh `tables.md`, first-row focus,
pointer away: block [before](assets/unified-menus-516/before-block.png) /
[after](assets/unified-menus-516/after-block.png), `+`
[before](assets/unified-menus-516/before-insert.png) /
[after](assets/unified-menus-516/after-insert.png), table
[before](assets/unified-menus-516/before-table.png) /
[after](assets/unified-menus-516/after-table.png). These captures are manual visual
review evidence, not automated screenshot assertions. Baseline: master
`325704e73871303b70aa4c73fc930eb2f975b8c1`.

Verification: new block-move, structural-block-authoring and table-authoring browser
assertions failed on that unchanged master (missing moves, missing block icons/danger,
missing table icons respectively). After implementation, those scenarios plus
basic-blocks, document-title, footnotes, layout-rules and quiet-document passed in
one serial persistent Chrome run in this worktree. The final block-move run also
checks that moving a heading swaps only that block and compares saved/reloaded
content order. Editor tests (290/290), workspace typecheck, Editor build, documentation
and whitespace checks passed. The final block-move/editor-shell/folder-navigation
run passed, including Base UI menu keyboard behavior. The `+` before/after PNGs
are byte-identical. The temporary manual capture scenario was removed.

Review correction (#523): on `842965f`, new boundary tooltip/accessible-description
assertions failed for both first-body Move up and last-body Move down (both values
were absent). The corrected browser scenario checks both English and Korean reasons,
then retains the existing move/Undo/Save→Reload coverage. Movement semantics are
unchanged; the existing command rejection metadata supplies the missing explanation.
The re-review regression on `7284bd6` also reproduced boundary reasons hiding an
open Equation draft's reason at both body edges. `block-move` now opens real drafts
in the first and last body Equations and checks the draft reason in both tooltip
and accessible description before retaining the existing boundary/Undo/Save coverage.

### Default heading choices (#575)

The default `+` and slash insert lists show Heading 2–6 in their existing Text
order. Search aliases and group order stay unchanged. #722 later expands body insertion to H1.
This changes Editor command discovery only; no Core semantic operation or CLI
surface is needed.

Same-state slash captures use the basic-blocks scratch document, English UI,
installed Windows Chrome, Pretendard, DPR 1 and default zoom at 1440×844 and
390×844. Before runs the unchanged command implementation from
`97a73bb55aa93f31d67ed6b043cfaaa468ad29e4`; After includes this change.
The menu moves upward to stay in the viewport as the list grows. At these sizes
all choices fit; basic-blocks checks every choice's viewport bounds during arrow
navigation, wrapping, editor focus and the existing H5 insertion/Save → Reload.

| Width | Before | After |
| --- | --- | --- |
| 1440px | [Before](assets/slash-heading-575/before-1440.png) | [After](assets/slash-heading-575/after-1440.png) |
| 390px | [Before](assets/slash-heading-575/before-390.png) | [After](assets/slash-heading-575/after-390.png) |

### Nested inline slash menu (#377)

The reference target form closes on Escape and outside pointer interaction, including when
the document has no labeled targets and the form has no autofocus control. Outside dismissal
preserves the clicked destination's focus; Escape returns focus to the editor. This applies
to both selection-toolbar insertion and an unresolved reference's editor, without changing
document content, and leaves slash insertion available without Reload (#427).

Implementation scope: expose existing inline insertion paths on Core-backed editable inline
surfaces. Preserve top-level paragraph order/search/keys; omit block commands everywhere else.
No new Core semantic operation, CLI command, search ranking or gutter `+` change is needed.
Completion requires menu/insertion regressions and actual Save → Reload, including a citation-only
list item (#366), plus Editor tests, typecheck/build and documentation checks.

| Caret location | Citation / document reference | Endnote | Existing Core save contract |
| --- | --- | --- | --- |
| Top-level paragraph | Yes; existing full menu | Yes | Paragraph inline content |
| List item, including nested lists | Yes; inline menu only | Yes | `updateList` with typed item content; [native List contract](document-support-v1.md#supported-meaning) |
| Quote / simple admonition | Yes; inline menu only | Yes | `updateQuoteInlineContent` / `updateAdmonitionInlineContent` |
| Endnote definition | Yes; inline menu only | No | `updateFootnoteDefinition` permits citations/references and refuses footnote references |
| Table header/body cell | Yes; inline menu only | Yes | `updateTableCell` |
| Figure caption | Yes; inline menu only | Yes | `updateFigure` with inline caption content |
| Table caption | Yes; inline menu only | Yes | `updateTableCaption` with inline caption content |
| Body heading (H1–H6) | Yes; inline menu only | Yes | `updateHeadingInlineContent` |
| Code / property fields | No menu | No menu | Code and fields keep literal input |

The Editor schema mirrors these existing Core inline contracts (in particular, a definition
excludes `footnoteReference`). Menu eligibility and the existing endnote insertion guard use
that schema; the Editor introduces no new semantic rule. Figure/list Save uses the existing
typed content operations even though the dedicated Core `insertFootnote`/`insertCitation`
addressing surface does not include those locations. The same `insertCitation`, `insertReference`
and `insertEndnote` paths serve all locations. Arrows, Enter and Escape keep the shared menu's
existing behavior. See [citations](citations-v1.md), [references](section-references-v1.md) and
[endnotes](footnotes-v1.md) for their persistent contracts.

List and Figure round-trip validation compares the completed intermediate footnote snapshot that
`serializeFor` already verifies. This lets the existing Save replay edit a list before adding
its new definitions, just as other inline operations do. It still compares block count,
list structure, exact inline content and canonical stability; final writes still reject
missing definitions. No new persistent document combination is introduced.

Code block edits can be saved together with new endnote references (#393). Core compares
the code block round-trip count with the same completed footnote snapshot used for
serialization, matching the list and Figure checks. Save replay order is unchanged;
final writes still require real definitions. The literal `/` code probe in
`citation-authoring` remains separate from this Core/replay regression coverage.

### Source wrapping (#476)

Source soft wrapping is a CSS-only presentation change. The existing source-line spans, literal
newlines and generated gutter numbers remain; no Core/CLI semantic operation is needed.
`pre-wrap` preserves source whitespace, `overflow-wrap: anywhere` wraps unbroken text, and the
existing gutter width is reserved outside the wrapping text. Numbers remain on each source
line's first row. There is no clipping or document write.

## Outline docking verification #552

The docking boundary is 89rem (1424px): 240px Sidebar + 256px Outline + 928px Standard
column. At 1280–1423px the Outline starts closed and opens as an overlay. Explicit docked
open/closed choices survive resizing in page memory; entering overlay closes it without
replacing that choice. Reload restores the default. This is Editor interaction only;
Core/CLI semantics and persistent preferences do not change.

## Outline toggle only #590

The internal Hide outline button is removed. The TopBar Outline toggle remains the panel's
open/close control; overlay Escape still closes it and returns focus to that toggle.
Command Center Show/Hide outline commands remain available. Title, list navigation, docking,
page-memory choices and reload defaults are unchanged. This is Editor interaction only;
Core/CLI operations are not applicable. The Sidebar Collapse sidebar button is unchanged.

## Figure image filename (#652)

The Figure properties popover places File name (without extension) in collapsed Advanced, using
the existing shared Input and inline error surface. The explicit Rename action performs the Host
operation; Done/outside completion applies ordinary properties without renaming. Filename drafts
and errors reopen Advanced. See [Figure properties](figure-authoring-v1.md#anchored-figure-properties-757). It reuses the #504 Host rename,
other-document protection and notices. Eligibility and failure behavior are specified in
[Figure file name](document-editing-v1.md#figure-file-name-652); history and checkpoints in
[Figure-form image rename](editing-session-save-v1.md#figure-form-image-rename-652).
The Host chooses readable upload defaults without an extra paste dialog: drop retains even
`image.png`, while paste uses document numbering for unnamed/generic images and retains real
descriptive file names. No CLI surface is added because no new semantic operation is introduced.


## Desktop log folder (#712)

Desktop Settings → About & updates also offers **Open log folder** / **로그 폴더 열기**
(#712), using the existing small secondary button. It disables during the request and
shows a localized failure notice on error. This control is absent from HTTP Host and
Vite; the [Desktop diagnostic contract](desktop-distribution-v1.md#log-folder-and-process-diagnostics-712)
owns its fixed path, IPC and logging behavior.

## Settings document entry removal (#669)

The entry-removal decision remains current; full-screen bounds and Back-action
verification below are historical, superseded by [#1032](#settings-task-tab-1032).

Settings no longer offers Open document settings. Its navigation footer retains the
per-document explanation without an empty control container. The document's own
inline disclosure and Command center entry remain available; this shell-only change
adds no Core operation or CLI command.

Same-state captures use installed Windows Chrome with the checkout-owned persistent
profile, English UI, Dark theme, Paper style, DPR 1, 100% zoom and a 900px viewport
height. The Desktop bridge is the existing browser-test stand-in; no installed-app
settings or PATH are changed. Before source: `23d178a3c4d19a20cda28991cdb9b911e451a7c8`.
Manual comparison confirms the footer still contains its explanation at 1440px, and
at 640px the content moves upward into the space released by the removed button.

| Viewport | Before | After |
| --- | --- | --- |
| 1440 x 900 | [Before](assets/settings-doc-link-669/before-1440.png) | [After](assets/settings-doc-link-669/after-1440.png) |
| 640 x 900 | [Before](assets/settings-doc-link-669/before-640.png) | [After](assets/settings-doc-link-669/after-640.png) |

The existing `desktop-updates` scenario checks entry absence, full-screen bounds,
category access, overflow and reachable controls in both languages at both widths.
Its document-settings checks now use Command center and retain disclosure focus,
resize and Escape coverage. `ui-language` uses the inline disclosure after leaving
Settings while preserving its draft/history checks.


## Collapsed rail Files and Settings (#671)

The owner decision is recorded in [#671](https://github.com/litzio/litzio/issues/671).
The 48px rail keeps Files on the document-tab row and Settings at the expanded
footer's vertical position. The same Settings entry has a text or icon-only variant,
so a later #665 indicator can apply to both; no update indicator is implemented here.
The title strip, caption reservation and drag areas from #647 remain unchanged.
This is shell interaction only; no Core semantic operation or CLI command is needed.

Before/After uses master `c8debf3fb9a6a0ab8ceb16e6dd19bf3eecf677da` and this change in the same
checkout, Vite origin (`127.0.0.1:5319`) and checkout-owned persistent Windows Chrome
profile through `pnpm browser:test`. English, technical-document fixture, no opened
folder, collapsed Files, 900px height, DPR 1, 100% zoom, bundled Pretendard and scroll 0.
Desktop is a renderer bridge mock with a representative 138px caption reservation;
native dragging and packaged Desktop are left to existing CI/manual checks.
Captures are manual review evidence, separate from browser assertions.

| Host / theme | 1440px Before / After | 640px Before / After |
| --- | --- | --- |
| browser / light | [Before](assets/rail-671/before-browser-1440-light.png) / [After](assets/rail-671/after-browser-1440-light.png) | [Before](assets/rail-671/before-browser-640-light.png) / [After](assets/rail-671/after-browser-640-light.png) |
| browser / dark | [Before](assets/rail-671/before-browser-1440-dark.png) / [After](assets/rail-671/after-browser-1440-dark.png) | [Before](assets/rail-671/before-browser-640-dark.png) / [After](assets/rail-671/after-browser-640-dark.png) |
| desktop / light | [Before](assets/rail-671/before-desktop-1440-light.png) / [After](assets/rail-671/after-desktop-1440-light.png) | [Before](assets/rail-671/before-desktop-640-light.png) / [After](assets/rail-671/after-desktop-640-light.png) |
| desktop / dark | [Before](assets/rail-671/before-desktop-1440-dark.png) / [After](assets/rail-671/after-desktop-1440-dark.png) | [Before](assets/rail-671/before-desktop-640-dark.png) / [After](assets/rail-671/after-desktop-640-dark.png) |

Verification for #671: Editor unit tests (324), typecheck, Editor production build,
docs and whitespace checks pass. Existing editor-shell checks rail keyboard order,
Settings dismissal focus and Files activation; desktop-updates measures the same
footer position in both states, bounded targets and no-drag alongside the unchanged
#647 header matrix, and opens Desktop Settings from the collapsed rail with Back/Escape
focus return. The layout-rules, quiet-document and command-center scenarios retain
their existing geometry, visual and command/focus protection. Across all eight
Before/After pairs, pixel differences are confined to the rail (x=17–30); document,
title strip and right panel pixels are identical.


## Localized feature samples (#528)

Desktop and the development Editor offer **Open sample document** on the start screen and in
Command center. The command is also available with a document open, uses the current UI language
at dispatch time and preserves existing tabs through ordinary Open. Korean and English notes have
the same structure and supported features: heading numbering and section references, formatted
inline content, links and math, nested bullet/ordered lists, code, quote and admonitions, a labeled
captioned table, numbered equation, asset image and Mermaid Figure, references with authored
templates, endnote, citation and a local BibTeX bibliography. Most content is a worked, illustrative
48 V converter current-loop design note, with explicit separation between assumptions and tests.
The reference book's bibliographic data is verified against its
[publisher record](https://link.springer.com/book/10.1007/978-3-030-43881-4).

When sample preparation fails, the Host omits sample paths and reports a sample problem alongside
the ordinary startup response. The Editor keeps opening the argument/restored document or shows
the ordinary start screen, with a standing translated warning. A folder conflict explicitly says
the existing folder was kept. No sample command or start action is shown for an unavailable sample;
this is separate from document Open admission and does not show a native-document refusal Alert.

The Host supplies writable copies; [sample distribution](desktop-distribution-v1.md#native-sample)
defines version replacement. HTTP Host omits the sample command and start offer. Changing UI
language affects the next selection, not an open document's content or editor state.

Manual capture review uses the existing `command-center --screenshots` path at 1440×900 and
640×900 with both languages, the checkout-owned persistent Chrome profile and fully loaded
fonts and image/Mermaid content. The sample feature assertions use Core's read model rather than
source string matching. No document semantics or supported syntax are extended.


| Sample | 1440px | 640px |
| --- | --- | --- |
| Korean, title/table | [Capture](assets/feature-samples-528/sample-ko-1440.png) | [Capture](assets/feature-samples-528/sample-ko-640.png) |
| Korean, image/equation | [Capture](assets/feature-samples-528/sample-ko-1440-image.png) | [Capture](assets/feature-samples-528/sample-ko-640-image.png) |
| Korean, Mermaid/list | [Capture](assets/feature-samples-528/sample-ko-1440-mermaid.png) | [Capture](assets/feature-samples-528/sample-ko-640-mermaid.png) |
| English, title/table | [Capture](assets/feature-samples-528/sample-en-1440.png) | [Capture](assets/feature-samples-528/sample-en-640.png) |
| English, image/equation | [Capture](assets/feature-samples-528/sample-en-1440-image.png) | [Capture](assets/feature-samples-528/sample-en-640-image.png) |
| English, Mermaid/list | [Capture](assets/feature-samples-528/sample-en-1440-mermaid.png) | [Capture](assets/feature-samples-528/sample-en-640-mermaid.png) |

Manual review confirmed title/paragraph wrapping, table columns, image/equation/caption containment
and readable Mermaid/list content at both supported widths. Captures retain the pre-existing
Command center scenario tabs. No shell geometry, typography or token values changed.
The first new browser assertion incorrectly waited for an inline SVG; Mermaid intentionally renders
an SVG data-URL image. The assertion was corrected to observe that actual image, without changing
product behavior or timeout/console criteria. The rerun passed. Windows `BadPasswordAttempts`
was 4 before the initial launch and 5 afterward; additional runs waited until it returned to 0.

The local `open-files` scenario initially retained the old sample notice text and stopped before
its later Save-error assertions. Its expected notice is updated to the new version-preservation
wording. Under the owner's subsequent no-repeat/browser-counter rule, that scenario is not
repeated locally; the final PR CI must verify the corrected assertion.

## Non-overlapping opened folders (#702)

The [2026-10-29 ADR-0009 amendment](../adr/0009-multiple-opened-folders.md#amendment-2026-10-29-non-overlapping-roots-702)
replaces nested Sidebar sections. A successful Open of a descendant expands the existing section,
its intermediate folders and the requested folder. The row is selected, focused after the picker
closes and scrolled into the Files panel; a collapsed sidebar opens. The notice reads
“이미 열린 폴더 {{name}} 안에 있습니다” / “Already inside the opened folder {{name}}.”
Same-root Open still relists in place and respects manual section collapse.

Opening an ancestor replaces its descendant sections at their first position. Cached listings and
child expansion move into the ancestor; each absorbed section's visibility becomes its child-folder
expansion. Missing intermediate branches are listed lazily. Unrelated sections, open tabs, active
path, dirty content and editor history remain. Late requests for removed sections cannot overwrite
the new tree. Recent Open uses this same path. Restoring nested saved roots reduces them in either
order without notices/focus or preference writes, retaining the surviving root's saved visibility;
explicit navigation remembers the final reduced list after all restoration requests settle (#367).

Containment uses the existing Host-normalized text and separator boundaries, with no new case,
symlink, junction or UNC identity policy (#372 remains deferred). This is Editor navigation only;
no Core/CLI semantic operation, document write or Host state is added.

Manual review captures from the same final folder-navigation scenario, Windows installed Chrome,
checkout-owned persistent profile, 1440×900, English, Light theme, DPR 1 / 100% zoom. These show
sequential navigation states, not a same-state visual redesign comparison. Shared selected-surface,
text and semibold tokens style the selected folder row; geometry and control sizes are unchanged.

| State | Capture |
| --- | --- |
| Parent opened: two child sections absorbed, child expansion and dirty active tab retained | [1440px](assets/non-overlapping-roots-702/parent-1440.png) |
| Deep child opened: existing root expanded, requested row selected and notice visible | [1440px](assets/non-overlapping-roots-702/child-1440.png) |

Local browser launches are capped at four for this change. Launch 1 stopped on a new test helper
that attempted to use a hidden menu after sidebar collapse; launch 2 exposed finalFocus stealing
focus after onClosed selected the requested row. Both were corrected without relaxing assertions;
launch 3 passed folder-navigation and produced these captures. Launch counters before runs 1–3
were 1, 2, 2 respectively. No packaged Desktop, install/update/uninstall, Edge or fresh-profile probe
was run locally. Host normalization, system PATH/registry and installed Litzio user data are unchanged.

Launch 4 (counter 2) passed folder-memory, layout-rules, quiet-document, document-tabs,
editor-shell and reveal-folder. Command-center stopped at its legacy wait for a separate alpha
root after opening that descendant. Its helper now accepts the surviving root or a contained
folder row and explicitly checks one section with alpha expanded. This correction is left to
required PR CI; no fifth local browser execution is performed. The final local counter is 2.
Final focused folder-tree/shell tests (48), Editor typecheck and production build pass.

## Docling server and conversion (#797)

Settings reaches the module's Docling entry through Plugins for Host-owned server configuration,
connection checking and the Korean administration guide. Explorer PDF context menus
and Command Center's Convert with Docling share a PDF picker/explicit conversion
confirmation flow. Progress and Stop waiting live in the Docling dashboard (#942).
The shared notification center offers named completion/failure actions alongside
stale comparison warnings.
See the [conversion contract](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/docling-conversion-v1.md#app-pdf-conversion-797) for
setting lifetime, output naming, limits and explicit completion navigation. Existing
Appearance/recovery settings and ordinary document actions retain their contracts.

## Color mode entry (#798)

Expanded Explorer combines Settings (left-aligned gear and label) and a right-aligned icon-only theme toggle on one footer row (#1042). The collapsed rail shows the two icon buttons stacked. The theme button displays the current Light/Sun or Dark/Moon state in its icon, localized accessible name and tooltip. Click, Enter or Space toggles immediately between the two choices and retains button focus. Settings' update dot stays separate. Command Center offers the same two choices with English and Korean search aliases.

All three entry points share the live App choice, `writeTheme` storage and `applyTheme`, including the Desktop bridge. Settings retains its existing selection markup with two choices. Failed storage retains the live choice and displays the localized Settings alert or notification-center error. Accent/page style remain in Settings. This device display preference has no Core operation or CLI parity requirement.

`pnpm browser:test color-mode` checks first OS resolution, persistence across reload and later OS changes, footer geometry, keyboard toggling, Settings and bilingual command parity, and storage refusal. This replaces the old menu-specific radio/focus checks because that menu is removed. The existing `ui-language` assertions retain explicit theme/native-control synchronization. No exhaustive combinations or subprocess tests are added.

Manual `--screenshots` writes 1440px Light/English and 640px Dark/Korean expanded, rail and Settings captures to `tmp/theme-1042/`. Same-state Before/After captures are reviewed for vertical alignment, spacing, clipping and localized labels. Existing ghost Button `sm`/`icon-sm` and Lucide icons are reused; the approved whole-screen transition is the only animation exception. Other Settings row structure is unchanged for #1033.

## Document table display (#902)

Table display choices are identified by Host ID and document path; the default remains device-wide.

Settings → Appearance & language sets the new-document table default (Wrap long text /
Single line). Paths without an override follow it. Table block menus have a separate
View group with a document-scoped checkbox; the command center provides the same
label and current value in Edit, Read and plugin comparison tabs. These actions
change only device preferences, never editor history or document files. Default-valued
overrides are removed. Successful Rename transfers the path preference with the tab
and session locator. Reopening restores it. See [table presentation](table-interaction-v1.md#per-document-table-presentation-902).

#912 visual evidence: [1440px rows](assets/color-mode-912/after-1440-rows.png),
[640px Korean Dark rows](assets/color-mode-912/after-640-rows.png),
[1440px menu](assets/color-mode-912/after-1440-expanded.png),
[640px menu](assets/color-mode-912/after-640-expanded.png),
[1440px rail](assets/color-mode-912/after-1440-rail.png),
[640px rail](assets/color-mode-912/after-640-rail.png).
Before: [1440px](assets/color-mode-912/before-1440-expanded.png),
[640px](assets/color-mode-912/before-640-expanded.png). Same scratch document,
900px height, persistent Chrome profile and bundled fonts; captures are manual evidence.

## Installed plugin inventory (#947)

App Settings adds the Host-owned Plugins category alongside Appearance & language,
Saving & recovery. Contributed plugin settings are reached inside this list
(#1007), with Back to plugins returning there. It uses the same content geometry,
section rows, actions and confirmation dialog. Full installation paths and
revisions wrap inside the hover/keyboard-focus information tooltip. Inventory
and the explicit app-default re-registration contract are defined in
[Plugin UI contributions](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/plugin-ui-v1.md#host-owned-plugin-settings-947) and
[Host worker plugins](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/plugin-runtime-v1.md#plugin-inventory-and-explicit-default-registration-947).

## Document action visibility (#973)

The `plugin-ui` browser scenario checks the empty screen, active plugin tab,
Ctrl+S without a document, and the native document's retained unsaved work.
Startup harness readiness accepts the actual start screen as well as a ready
document; it no longer requires an empty screen's hidden document status.

Same-state manual review (1440px English Light / 640px Korean Dark):

| State | Before | After |
| --- | --- | --- |
| empty 1440 | [Before](assets/document-actions-973/before/empty-1440.png) | [After](assets/document-actions-973/after/empty-1440.png) |
| empty 640 | [Before](assets/document-actions-973/before/empty-640.png) | [After](assets/document-actions-973/after/empty-640.png) |
| plugin 1440 | [Before](assets/document-actions-973/before/plugin-1440.png) | [After](assets/document-actions-973/after/plugin-1440.png) |
| plugin 640 | [Before](assets/document-actions-973/before/plugin-640.png) | [After](assets/document-actions-973/after/plugin-640.png) |

#973 visibility follows document tab identity, including newly created, restored and
still-loading document tabs. Session readiness disables actions; it does not hide them.


## Hidden tab navigation (#972)

The fixed count button reuses the shared file/action DropdownMenu. Its 28px target
leaves room for tab identity at 640px; overflowing tabs use 4px internal padding
and gaps, and their lists yield the horizontal inset
while retaining a 1px end gutter for rounded browser scroll extents. Active-tab
reveal uses actual fractional bounds and scrolls only its own tablist. Same-name
labels, dirty state, close, move and open-right operations remain unchanged.
At 640px the existing minimum-group-width rule merges groups; overflow is also
verified independently in two groups at 1280px, without changing that rule.

| View | Before | After |
| --- | --- | --- |
| 1440px | [Before](assets/tab-overflow-972/before-1440.png) | [After](assets/tab-overflow-972/after-1440.png) |
| 640px | [Before](assets/tab-overflow-972/before-640.png) | [After](assets/tab-overflow-972/after-640.png) |
| Korean Dark 640px | [Before](assets/tab-overflow-972/before-640-dark-ko.png) | [Menu](assets/tab-overflow-972/after-640-dark-ko-menu.png) |

Captures use the same startup document plus eight scratch technical documents,
900px height, an expanded Explorer, and the final technical document active.
They are manual visual evidence, separate from the document-tabs keyboard and
editor-groups pointer regressions and the layout-rules/quiet-document assertions.

## Settings task tab (#1032)

Owner decision [#1026](https://github.com/litzio/litzio/issues/1026) replaces the
Back to document screen with a single Host-owned Settings task tab. Explorer,
title strip and ordinary document tabs remain accessible. Sidebar and Command
Center open it in the focused group; reopening selects its existing group without
moving or duplicating it. The ordinary tab context menu moves it to the right or
the other group. The same narrow-area merge rule applies. During window-level document loading,
file navigation/operations or a pending continuation, Settings entry is disabled in Sidebar,
Command Center and the Assistant setup action, consistently with other task entries.
Settings opens only after those controls become available; clicks are not queued.
Tab-owned Save/Source work retains the existing ability to open Settings diagnostics
and have restart refused by the live pending-work guard.

Command Center provides keyboard entry. Tab-row arrows/Home/End switch between
Settings and documents; Tab enters its close control and category navigation.
Delete or the close button closes the tab and focuses the neighboring tab.
Escape from Settings content or its tab closes it, selects the still-open task
from which Settings was entered, and returns focus to the connected opener (or
Explorer toggle). If that task has closed, the ordinary neighboring tab remains. Nested dialogs retain their own Escape boundary.
Opening Settings dismisses the narrow Assistant overlay so the task tab is
reachable; the wide docked Assistant remains available and keeps its own Escape.
Settings does not trap focus or own document Save/Undo. Ctrl+S while Settings owns
focus does not save a hidden document; a visible document in the other group keeps
its own Save and editing operations. Settings and Dialog reuse the same native
`beforeinput` history boundary: an Undo/Redo started in Settings may modify its own
inputs, but cannot transfer focus or history edits into a document draft in the
other visible group. This does not trap focus or prevent normal document editing.

Like Plugin tabs, Settings has no document session, dirty indicator, recovery
record or startup restoration. Switching away keeps its mounted category and
unsaved settings drafts; closing discards view-local drafts. Applied app preferences
remain stored independently. Assistant settings retain explicit Save and Docling retains
field-exit saving. Metadata outside-pointer completion excludes the Settings tab and Sidebar entry.
Ordinary document-tab pointer switching retains its existing outside-apply behavior;
keyboard switching retains drafts. Closing Settings selects its ordinary neighbor.
Document input, drafts and Undo history stay with their mounted
editing sessions and are never saved by opening or closing Settings.

The Host owns heading, category navigation, scroll and bounded content column;
built-in and contributed categories supply content inside that frame. Existing
Button, select, Input and settings styles are reused. The tab row consistently uses the existing compact gap/inset tokens, keeping
label widths independent of the overflow button's visibility;
otherwise adding the short Korean Settings label could repeatedly toggle overflow
and move its close target. No public Plugin API or
common settings-row blocks are added (#1033 owns those). Container width, including
split groups, selects the stacked layout. Redundant return-document and category
explanation prose is removed; document identity/dirty state remains in its tab.

Manual visual evidence (English, 1000px height):

| State | 1440px Light | 640px Dark |
| --- | --- | --- |
| Before | [Full-screen Settings](assets/settings-tab-1032/before-1440-light.png) | [Full-screen Settings](assets/settings-tab-1032/before-640-dark.png) |
| After | [Settings tab](assets/settings-tab-1032/after-1440-light.png) | [Settings tab](assets/settings-tab-1032/after-640-dark.png) |

[Two groups: document beside Settings](assets/settings-tab-1032/after-two-groups.png).
Captures are manual review evidence, separate from automated assertions. Direct
review found no horizontal clipping at 640px and confirmed the shared shell and
independently visible document in two groups. The [capture body](assets/settings-tab-1032/capture.browser.js)
was run manually through `pnpm browser:test plugin-settings --screenshots` with a
temporary replacement of that scenario body, then restored; it is not CI coverage. Existing
Settings and tab browser scenarios cover navigation, retained document state and
settings save behavior rather than enumerating all theme/category combinations.

Review correction for PR #1046: `continuous-editing` now keeps a document source
input and the Docling server address visible in two groups during native Undo/Redo.
The regression failed before the shared history boundary was applied. `docling-server`
holds startup document GET to assert disabled Settings entry, then waits for the
actual enabled control after Reload. `document-tabs` verifies actual focus on
existing-group reentry; `ui-language` checks Save accent in document context.
Steady-state layout and the reviewed captures are unchanged.

## Plugin settings navigation (#1007)

The top-level Settings navigation contains Appearance & language, Saving &
recovery, Plugins and (Desktop) About & updates. Installed plugin settings are
children reached from the Plugins list, with Back to plugins returning there.
The Plugins navigation item stays current in a plugin detail view. Direct
openSettings contributions still select their detail view. A missing contribution
during feature reactivation does not discard the view; confirmed registration
loss returns to Plugins. Disabled installations remain in the list with their
switch off and cannot enter settings. Installation identifiers are accessible on
hover and keyboard focus; see [plugin management](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/plugin-ui-v1.md#host-owned-plugin-settings-947).

## Template gallery task tab (#936 phase 2)

Sidebar and command center open a single Template gallery tab in the existing
editor groups. It can be closed or moved like Settings, without a document Save,
recovery record or Outline. Reentry selects its owning group; other document tabs
retain their draft and scroll state. The command center also provides Save as
template… for a saved native document. The [template contract](document-templates-v1.md#editor-gallery-phase-2)
owns card preview, name errors, folder access and creation behavior.

## Narrow Explorer overlay (#1455)

Explorer and Assistant use the existing 1100px Assistant boundary through the shared
Adjustable value `--layout-navigation-overlay-breakpoint` in `styles/tokens.css`.
This preserves their existing wide docking at 1440px without adding another breakpoint;
the Document panel retains its independent 89rem boundary. Below 1100px Explorer
starts collapsed, including on reload and every transition from a wide window. Opening
it overlays the document from the title strip to the bottom, with the existing width,
surface and shadow. The document keeps all space beside the 48px control rail (592px at
the minimum 640px window); Explorer expansion consumes no extra document width.

File activation (local or remote, including PDF), task navigation (Settings, Template
gallery and plugin screens), outside pointer and Escape dismiss the
overlay and return focus to its toggle. A subsequently activated document or outside
control may take focus through its normal action. Portalled menus/dialogs keep their
own dismissal boundary and do not collapse Explorer underneath their return target.
The tree stays mounted; folder expansion and scroll state remain. Wide-window user
collapse/expand choices survive narrow-window use; overlay choices do not replace them.
Both navigation overlays reuse z-index 4; the later-painted right Document panel wins
any overlap. At 640px their default widths leave both usable. Assistant remains modal
above them at z-index 20 and makes the underlying shell inert. No new Host operation,
document meaning or CLI interaction is introduced.

Manual review: persistent Windows Chrome, Korean, 100% zoom, DPR 1, 1000px height,
default product fonts and Plum palette; source baseline `ba5589eb`. Fixture Host identity
is synthetic. Screenshots contain no local path or real account. Captures are separate
from automatic assertions and owner visual approval.

| State | Before Light / Dark | After Light / Dark |
| --- | --- | --- |
| 1440px docked | [Light](assets/narrow-explorer-1455/before-1440-light.png) / [Dark](assets/narrow-explorer-1455/before-1440-dark.png) | [Light](assets/narrow-explorer-1455/after-1440-light.png) / [Dark](assets/narrow-explorer-1455/after-1440-dark.png) |
| 640px default | [Light](assets/narrow-explorer-1455/before-640-default-light.png) / [Dark](assets/narrow-explorer-1455/before-640-default-dark.png) | [Light](assets/narrow-explorer-1455/after-640-default-light.png) / [Dark](assets/narrow-explorer-1455/after-640-default-dark.png) |
| 640px Explorer open | [Light](assets/narrow-explorer-1455/before-640-open-light.png) / [Dark](assets/narrow-explorer-1455/before-640-open-dark.png) | [Light](assets/narrow-explorer-1455/after-640-open-light.png) / [Dark](assets/narrow-explorer-1455/after-640-open-dark.png) |
| 640px document tab + Outline | [Light](assets/narrow-explorer-1455/before-640-document-panel-light.png) / [Dark](assets/narrow-explorer-1455/before-640-document-panel-dark.png) | [Light](assets/narrow-explorer-1455/after-640-document-panel-light.png) / [Dark](assets/narrow-explorer-1455/after-640-document-panel-dark.png) |

`folder-navigation` checks narrow entry, unchanged document bounds, Escape/outside/file
activation and focus, 1099/1100px boundary and wide choice restoration. `panel-lists`
checks simultaneous navigation overlays and Assistant's modal priority. Existing
`layout-rules` checks retain all 640px geometry assertions, dismissing the intentional
overlay before operating the covered document gutter and reopening for sidebar geometry.
These extend existing scenarios because the new risk is browser layout/focus integration;
they add no subprocess or exhaustive theme matrix. Manual captures use a temporary
scenario body via `pnpm browser:test ... --screenshots`, restored before automated runs.
The capture-only `folder-navigation` body omits its expected HTTP-error exercises, so
the runner reports those missing expected failures; this is not an automated regression
pass. The restored four-scenario run passed (about 2.5 minutes). Visual review confirmed
unchanged 1440px docking and bounded controls/scroll surfaces in both themes at 640px.

CI follow-up keeps the expanded Explorer resize handle and all existing geometry
assertions. Scenarios explicitly reopen the default-collapsed Explorer before using
its files/actions; title-strip branding checks the rail's icon-only presentation.
The selection-overlay fixture adds two preceding paragraphs so its bottom-edge anchor
can still scroll into position in the wider document. The table fixture adds two more
columns: its former twelve-column 432px table now fits the 464px content area, so fourteen
columns restore the same horizontal-overflow/last-column checks. No pass criterion or
timeout is reduced. The Assistant stacking check uses fixture settings/models/diagnostics,
without requiring a provider account.

Queue follow-up (2026-11-10): both the [passing PR run](https://github.com/litzio/litzio/actions/runs/42777652115)
and [failed queue run](https://github.com/litzio/litzio/actions/runs/42778881526) ran
`file-preview` in the same full-layout shard. The queue trace shows the 640px resize
returning before the matchMedia/React commit: Expand Explorer was still reported hidden,
then the tree disappeared between row focus and Enter. Browser navigation now waits for
the shell's responsive mode to match the shared breakpoint before inspecting expansion.
Keyboard preview still opens Explorer with Enter and checks actual focus; its draft,
selection, Undo and dialog assertions and existing timeouts remain unchanged.
The same resize/read pattern was checked across common folder navigation, file actions,
visual states, document scroll, Assistant, Desktop and layout scenarios. Local Windows
persistent Chrome ran all 97 Editor scenarios in eight sequential shards with
`LITZIO_TEST_LAYOUT_SCOPE=full`: 8/8 passed, 2069.5 seconds total. This covers the queue's
Editor browser scope, not packaged Desktop or external services.

Command Center queue follow-up (2026-11-10): [PR CI](https://github.com/litzio/litzio/actions/runs/42785763527)
and [queue CI](https://github.com/litzio/litzio/actions/runs/42786967180) used the same
full-layout shard and identical source tree. The local 97/97 run and PR CI passed;
queue CI failed the 1024px centering assertion. Its trace places the two separate
coordinate reads immediately after resize; the failure capture shows the resulting
search correctly centered. The old trace does not record the measured rectangles. A temporary
local probe held media-query delivery until between those reads and reproduced a
76px false error, while each layout's same-frame geometry had 0px error. The probe
was removed. The existing scenario now waits for the shared responsive mode and reads
both rectangles in one browser evaluation. The search-area centering contract, less
than 1px tolerance, clipping assertions, widths and timeouts remain unchanged. This
corrects the measurement race; it does not change product layout. Local full-layout
`command-center`, `layout-rules` and `editor-shell` passed (3/3, about two minutes),
along with workspace typecheck and documentation checks.

## Multiple Host shell (#1174 PR4)

2026-11-13 소유자 결정(#1595): 다른 PC의 Host 등록·접속과 여러 Host UI는 삭제했다. 같은 PC의 공유 daemon·수동 다시 연결, CLI `--host <origin>`과 개발·검사용 독립 HTTP Host는 유지한다. 연결과 화면은 단일 Host로 정리했다. 작업·세션에 고정된 client와 취소/세대 보호는 유지하며, 저장·복구의 hostId·키·레코드는 PR 3까지 local 형식 그대로 둔다. 삭제 전 구현은 `archive/2026-11-13-plugins-declarative`에 보관한다.

탐색기는 로컬 폴더만 표시하며 Host 필터/선택기는 없다. 비서는 로컬 대화로 바로 들어가고 템플릿·플러그인 화면에도 Host 드롭다운이 없다. 단일 Host의 탭/경로·활성 대상과 caption·Local 라벨은 이번 PR에서 유지한다. 기존 Sidebar·Settings·AssistantPanel 배치와 공통 control을 재사용하며 새로운 표면이나 예외 스타일은 없다.

1440px 라이트 전후(브라우저 fixture, 실제 원격/AI 수락 아님):

| 화면 | 이전 | 이후 |
| --- | --- | --- |
| 설정 | [이전](assets/remote-host-removal/before-settings.png) | [이후](assets/remote-host-removal/after-settings.png) |
| 탐색기 | [이전](assets/remote-host-removal/before-explorer.png) | [이후](assets/remote-host-removal/after-explorer.png) |
| 비서 | [이전](assets/remote-host-removal/before-assistant.png) | [이후](assets/remote-host-removal/after-assistant.png) |

검증: `pnpm browser:test local-host`의 연결 중→단절→연결 회복, document-tabs의 부분 복원/기억 보존·늦은 열기 취소·다른 탭 저장, HTTP recovery의 daemon 재시작·Save/Reload/409, 기존 file-actions·assistant·template-gallery 검사. 원격의 같은 경로 구분/등록/제거/교차 Host 복원 순서는 기능과 함께 제거했다. 로컬 직렬 초기 복원을 원격 병렬 복원과 같은 보호라고 주장하지 않는다.

## Remote Host settings (#1174 PR3b)

2026-11-13 삭제했다. 설정에는 원격 Hosts 카테고리가 없다. 공통 HostStatus는 탐색기 아래 로컬 연결 관측에 유지한다. 상태 점 CSS는 공급자 표시와 공유한다. 당시 등록·제거·재시작 계약은 `archive/2026-11-13-plugins-declarative`의 이 문서에 보관한다.

## 활성 Host 실행 계정 (#1199)

사이드바 맨 아래 한 줄은 단일 연결의 상태와 실행 계정을 표시한다. 여러 Host의 라벨·Local 탭 배지는 표시하지 않는다. 관측 대상은 같은 PC의 로컬 Host다. 기존 설정·테마·메뉴 행은 그 바로 위에 둔다. Host 선택기는 제공하지 않는다.

Desktop의 로컬 Host 상태도  관측 완료 5초 뒤 읽기 전용 health/capability 검사를 반복한다(#1487). 시작 시 한 번 실패한 관측이 계속 남지 않으며, 다음 성공에서 상태·실행 계정을 복원한다. 첫 실패의 닿지 않음/이유 표시는 유지한다. daemon 탐색·spawn·수동 다시 연결과 별개의 상태 관측이며 상세 계약은 [Desktop distribution](desktop-distribution-v1.md)을 따른다.

공통 HostStatus 상태 점·Tooltip과 기존 control 높이·간격·문자색 토큰을 사용한다. 연결된 Host의 `identity.runAs`만 표시하며 연결되지 않거나 계정이 없는 Host는 상태만 표시한다. 축소된 사이드바에서는 상태 점과 툴팁을 사용한다. 백그라운드 서비스·실행 계정과 설명은 툴팁으로 제공한다. 한국어 명칭은 **실행 계정**, 설명은 “이 Host의 파일 작업과 비서 실행은 이 계정 권한으로 수행됩니다”이다. 접속자 신원은 제공하지 않는다.

640px 이상에서 한 줄 말줄임을 사용하며 전체 계정은 키보드 focus/hover 툴팁으로 확인한다. 공통 구현은 HostStatus/Tooltip이며 별도 아이콘·팔레트·상호작용 예외는 없다.

검증 캡처: [1440px 원격 Host](assets/host-run-as-1199/1440.png), [640px 로컬 Host](assets/host-run-as-1199/640.png). 두 Host fixture이며 실제 원격 OS 연결 증거가 아니다.

## Document read lifetime and Host isolation (#1243)

Explicit Open is owned by App per destination group with its captured HostClient and path.
It does not acquire the window operation lock or disable other tabs' navigation, Open or Save.
The destination group's status reports Opening until the read finishes or is cancelled, instead of
leaving the previous document's Ready status visible. An in-flight session Save/Source/asset operation
retains its own status priority. This presentation does not acquire a group navigation or Save lock.
When all notification producers have been removed, the notification center clears its live-region
announcement too; a completed or cancelled Open leaves no obsolete progress announcement.
Selecting a tab, opening another document in that group, closing its tab, or choosing Cancel
in the existing notification cancels the pending Open. A superseded response cannot admit a tab.
File rename/delete invalidates pending Open on the same Host and path before any asynchronous work,
including descendant paths for a folder target. Different tabs retain their independent sessions.
A failed or uncertain mutation does not revive an invalidated read; opening again is explicit.
Document GET and its bibliography read share a 15-second timeout and AbortSignal.
Mounted native/text sessions cancel their reads on disposal; startup restoration cancels on effect cleanup.
Save remains session-owned, never automatically retries, preserves uncertain acknowledgements,
and keeps input entered after submission unsaved. The opening HostClient remains fixed for the session.

## Read-only PDF tabs (#1337)

Explorer activation of a `.pdf` opens a read-only task tab identified by Host and path. Reopening activates the existing tab. It uses DocumentTabs close, grouping and Host work accounting, without document admission, drafts, Save or startup tab restoration. The tab owns its fetch, pdf.js document and worker lifetime; closing aborts the fetch and destroys the document/worker.

The first viewer supports vertical scrolling, zoom buttons, Ctrl+wheel, fit width, current/total pages, page-number navigation (Enter or field exit), and text selection/copy. Only pages within 800px of the viewport render canvas/text; inactive tabs release their rendered surfaces. Each canvas dimension is bounded to 4096 pixels with DPR at most 2. Paper stays white in dark mode; the surrounding surface follows theme. Unavailable/damaged/over-25-MiB files and password PDFs show fixed localized notices.

Upstream viewer CSS is scoped to the PDF viewer to avoid changing the app shell. The app bundles pdfjs-dist 5.6.205 and a same-origin worker, CMaps and standard fonts. Eval and WASM are disabled. Only canvas and TextLayer APIs are used: no scripting manager, annotation/form layer, link service, printing, search, thumbnails or editing. CSP and Electron webPreferences are unchanged. This Editor-only reading interaction adds no CLI command; byte delivery extends the existing Host preview API.

### 검수 대조 문서 편집 (#1533)

검수 작업공간의 문서 쪽은 기존 DocumentEditor와 compact Button을 재사용한 Edit/Save/Cancel을 제공한다. Save 단축키는 Ctrl+S이며 편집기 Undo/Redo를 사용한다. 미저장 편집 중 닫기와 비교 새로고침·검수 기록 변경은 기존 pending 보호로 막고, 저장 실패는 초안을 유지한 채 Notice로 표시한다. 별도 승인 단계는 없다. [저장·대응·기록 수준 Undo와 화면 캡처](docling-review-stage3.md#검수-정본-직접-편집--1533)를 따른다.

## 단일 연결 화면 확인 (#1595 PR 2)

연결 ID 선택·갤러리 대상·원격 opener/control·Host 라벨 배지를 제거했다. 문서·PDF·화면 탭의 id/key는 유지해 열린 편집기의 초안과 history를 remount로 잃지 않는다. 비서·템플릿·폴더의 일반 동작은 같은 client 경계와 공용 부품을 사용한다. 새 UI 부품이나 상호작용 예외는 없다.

1440px 라이트의 [변경 전](assets/assistant-screen-removal/after-1440-light.png)은 #1612에서 캡처한 동일 baseline 화면이며 [변경 후](assets/single-host-connection/after-1440-light.png)는 이번 시나리오 실행으로 확인한다.
