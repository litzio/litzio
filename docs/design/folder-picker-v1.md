# Folder picker v1

- Status: Implemented
- Scope: Host folder, plugin path and Figure image selection in the shared FolderDialog.
- Authority: [ADR-0009](../adr/0009-multiple-opened-folders.md), [Editor shell](editor-ux-shell-v1.md), [Host boundary](filesystem-host-boundary-v1.md).

<a id="folder-presentation-522"></a>
<a id="option-a-verification-522"></a>

## Behavior

Browser and Desktop use the same Dialog, Button and Input components, Lucide icons and product tokens. There is no OS picker. The dialog has a title, navigation bar, a left starting-place/recent-folder column, a central scrollable list, and a selected-name/action footer. The list takes the available height. Width and height are bounded by the viewport, including the minimum supported 640px width. Dates are hidden at narrow widths. There is no resize handle.

- Click selects a row without navigating. Double-click or list Enter enters a folder, or confirms an eligible file. Folder mode confirms the selected folder, or the current location when no row is selected. The Open label names that target. File mode requires a selection; confirmation on a folder navigates there. Ineligible files are omitted. The footer shows the selected name and allowed file types.
- Starting places come from the Host (Home, Documents, drives, or allowed roots). Recent folders appear only for callers supplying them. The containing starting place is marked. Successful folder opening alone updates the existing recent preference; browsing changes no sidebar or document.
- Back/Forward keep dialog-local history. Up and breadcrumbs navigate within the Host/root boundary. Alt+Left/Right/Up are equivalent. Backspace in the list goes to the parent.
- Click the empty address area or press Ctrl+L to edit the path. Typed prefixes filter candidates; Up/Down and Tab/Right retain completion. Escape cancels address editing and returns to the list without closing the dialog. Enter navigates to a typed folder, or resolves a pasted file path to its containing folder and selects the file. Quoted paths are accepted. A folder path can still be opened directly.
- Initial focus is the list. Its single-selection listbox uses aria-activedescendant, arrow keys, Home/End, type-ahead and Enter. Metadata does not introduce interactive cells, so a grid's two-dimensional keyboard model is unnecessary. Tab follows navigation, places, list and footer controls. Column buttons sort name/date/size with aria-sort; folders always precede files. Sorting is local to one opening.
- New folder, where available, accepts a name in a row inside the list. Success refreshes that location and selects the created folder without entering it. Escape first cancels naming. Portable-name and overwrite rules remain in the Host contract.
- Reading, empty-folder and failure states appear in the list area. Out-of-root path errors remain visible. Cancel and dialog Escape leave the document/sidebar unchanged and restore the invoking control's focus. Pending operations prevent duplicate submission.
- Folder access, non-overlapping opened roots, restoration and recent preferences retain [the shell contract](editor-ux-shell-v1.md#non-overlapping-opened-folders-702) and ADR-0009. This is interface navigation; no Core operation or CLI command is introduced.

<a id="active-image-preview-480"></a>

## Choosing an image

Figure image choice reuses the identical layout and lists the existing supported image types. Only the selected image is previewed, through `/api/file-preview`; no thumbnails or new endpoint are added. The preview is on the right, retaining list height and intrinsic image proportions. Failed/late previews do not block selection or replace a newer selection. The short footer note about copying external images to assets remains because it changes the result of confirmation. Host linking/copying rules follow [image choice](filesystem-host-boundary-v1.md#image-choice-v1-208).

## Visual reference

The shared component is rendered with synthetic Host paths and entries for manual comparison. These captures establish layout, not real-file/plugin workflow acceptance. The existing browser scenarios exercise those integrations separately. Windows persistent Chrome, Korean UI, 900px height; the approved static mockup was reviewed in folder/file/empty states and both themes. Product tokens take precedence over mockup values.

| State | 1440 light | 1440 dark | 640 light |
| --- | --- | --- | --- |
| Selected folder | [1440 light](assets/file-dialog-1676/folder-1440-light.png) | [1440 dark](assets/file-dialog-1676/folder-1440-dark.png) | [640 light](assets/file-dialog-1676/folder-640-light.png) |
| Selected PDF | [1440 light](assets/file-dialog-1676/file-1440-light.png) | [1440 dark](assets/file-dialog-1676/file-1440-dark.png) | [640 light](assets/file-dialog-1676/file-640-light.png) |
| Image preview | [1440 light](assets/file-dialog-1676/image-1440-light.png) | [1440 dark](assets/file-dialog-1676/image-1440-dark.png) | [640 light](assets/file-dialog-1676/image-640-light.png) |
| Empty folder | [1440 light](assets/file-dialog-1676/empty-1440-light.png) | [1440 dark](assets/file-dialog-1676/empty-1440-dark.png) | [640 light](assets/file-dialog-1676/empty-640-light.png) |
| Address editing | [1440 light](assets/file-dialog-1676/path-1440-light.png) | [1440 dark](assets/file-dialog-1676/path-1440-dark.png) | [640 light](assets/file-dialog-1676/path-640-light.png) |
| New folder name | [1440 light](assets/file-dialog-1676/new-folder-1440-light.png) | [1440 dark](assets/file-dialog-1676/new-folder-1440-dark.png) | [640 light](assets/file-dialog-1676/new-folder-640-light.png) |

## Exclusions

No native picker, upload, rename/delete/move, tree inside the dialog, search, watcher, workspace file,
new persistence service or other file-picker UI. Copying is limited to the image choice above. (Each opened folder is shown as a lazily listed tree in the sidebar; see
[Folder listing v1](filesystem-host-boundary-v1.md#folder-listing-v1-112).) The separate full-file-path dialog is removed (#190). No CLI parity command:
choosing a folder is interface/Host navigation, not a document semantic operation.

## New document in a sidebar folder

- Start-screen, empty Files and command-center **New document…**, reuse this
  filename form (#553). Without an opened folder, the existing folder picker (including New
  folder) first selects and opens the location; after it closes, the filename form starts in
  that Host-normalized folder. Cancelling the picker opens nothing; cancelling the filename
  creates nothing and keeps the selected folder open. With opened folders, the common entry
  starts at the current document's folder in its opened tree, otherwise the first opened folder.
  The per-folder `+` retains its own section-specific default. See
  [New document entry](editor-ux-shell-v1.md#new-document-entry-553).
- The sidebar folder heading has a `+` (New document…) beside its `⋯` menu (New folder…, Open folder…, Refresh and Close folder).
- `+` opens the filename form without an unsaved-work confirmation. Success adds a new tab; existing
  sessions and drafts remain. Cancelling or failed creation adds nothing. The shared **Save / Don't
  save / Cancel** confirmation belongs to closing a dirty tab. See
  [Switching and recovery](editing-session-save-v1.md#switching-and-recovery).
- The New dialog's Location field shows and chooses the destination: all opened folders and
  every sub-folder listed in their trees so far, expanded or not. Each Host-normalized path appears
  once. In opened-folder order, then tree order, the first occurrence supplies its position and label
  (named from that opened folder). Opened roots do not overlap (#702).
  It starts at the open document's folder when that is inside the chosen folder, otherwise at
  the chosen folder. No hidden state chooses it: expanding or collapsing folders does not.
  A folder deeper than the tree has listed appears once its parent is expanded.
- The dialog accepts a single filename.
  An omitted `.md` suffix is added; separators and `.`/`..` are rejected so this
  entry point cannot choose another directory. All New entries reuse this form; the former
  top-level full-path New was removed with the [sidebar chrome cleanup](editor-ux-shell-v1.md#structure).
- Creation uses the existing Host API and Core's canonical empty Markdown. Success
  opens a new document tab and lists its folder again, so it appears in the tree. On close, a successful
  New focuses its first paragraph; Cancel/Escape or a rejected New returns focus to the New button
  (see [New document entry](editor-ux-shell-v1.md#new-document-entry-553)). Existing files, pending
  operations keep their existing protections. Cancel/Escape in the filename form creates nothing.
- No workspace state or new Core/CLI operation is needed:
  this change supplies a destination to the existing document-creation flow.

Folder New coverage includes root/sub-folder creation, cancellation, rejected names, existing-file protection, unsaved work, real-file Save → Reload and narrow-layout reachability.

## New folder

- Both entry points create one folder directly inside an existing folder through the
  [Host folder creation](filesystem-host-boundary-v1.md#folder-creation-v1). Nothing is replaced:
  an existing file or folder of that name is an error. The name is a single portable name (rules
  in the Host contract); the dialogs reject separators and `.`/`..` before asking the Host.
- The sidebar menu's New folder… uses the New dialog form: the same Location choices and starting
  destination as New file, then a folder name. Success expands the folders above the new folder
  and lists them again, so it appears (collapsed) and is at once a New file destination. The open
  document, unsaved work and drafts are untouched, so New folder is not blocked by them. Closing
  returns focus to the same More actions trigger after creation or cancellation.
- No Core operation or CLI command: a folder holds documents but is not document content.
  Headless creation is the shell's `mkdir`, as for [folder listing](filesystem-host-boundary-v1.md#folder-listing-v1-112).

## Verification

The Host listing test covers browsing/crumbs; the Host creation test covers portable names, overwrite refusal and missing parents. The folder browser regression covers keyboard navigation, cancellation, recent-folder reload, quoted paths, errors, delayed responses, New folder in the picker and sidebar, and the sidebar/document flow. Preserve source fixtures when running these checks.

Future changes follow the [verification matrix](../../CONTRIBUTING.md#verification-matrix) and required CI. Keep the Host boundary, shell description and manual guide aligned, and close owned verification processes.
