import type { NodePath, machineNodes } from "@litzio/core";
import type { ScreenDocumentViewChange } from "./document-view-change.ts";

/** One top-level block of a Save the Host accepted: its nodes as `inspect --format json` lists them. */
export type ScreenDocumentSavedBlock = { path: NodePath; nodes: ReturnType<typeof machineNodes> };

export type ScreenDocumentViewState = {
  state: "loading" | "ready" | "error" | "stale-target" | "target-not-found";
  revision?: string;
  message?: string;
};
/** Content editing of one mounted DocumentView. revision is the latest saved revision this view read or saved. */
export type ScreenDocumentEditState = {
  state: "clean" | "unsaved" | "saving" | "failed" | "conflict";
  revision: string;
  message?: string;
};
/** Vertical CSS pixels relative to the visible content edge of this DocumentView. */
export type ScreenDocumentViewLayout = {
  revision?: string;
  height: number;
  blocks: { path: NodePath; top: number; bottom: number }[];
};
/** A change screen code is writing through the official write path, shown by the view first.
 * Set saved (the written revision) or failed (the reason) on the same request when the write ends. */
export type ScreenDocumentViewApply = {
  request: string | number;
  /** The saved revision the change starts from: the view's latest. */
  revision: string;
  change: ScreenDocumentViewChange;
  saved?: string;
  failed?: string;
};
/** pending: shown and waiting for the write; saved: the view now holds the written file;
 * failed: the view went back to its last saved state; refused: nothing was shown. */
export type ScreenDocumentApplyState = { request: string | number; state: "pending" | "saved" | "failed" | "refused"; revision: string; message?: string };
export interface ScreenDocumentViewProps {
  /** All scrolling and layout changes, once per frame only when changed. Empty while loading/error/stale. */
  onVisibleBlockLayoutChange?(layout: ScreenDocumentViewLayout): void;
  path: string;
  /** top places the target's top edge this many visible CSS px below the viewport content edge
   * (the onVisibleBlockLayoutChange origin), whether or not it is already visible.
   * With top, change request (e.g. a click count) to place an unchanged target again after user scrolling;
   * equal values never move the view, even as a new object. */
  target?: { revision: string; path: NodePath; highlight?: boolean; top?: number; request?: string | number };
  /** User scrolling only; top-level blocks, throttled with a final settled report. */
  onVisibleBlockChange?(block: { revision: string; path: NodePath }): void;
  /** Reports a simple primary click immediately. Double-click reports its first click once, not its second.
   * Drag selection, Shift+click, links, references and footnote numbers are not reported.
   * Target changes do not reread; reloadKey remounts the view and can clear text selection.
   * Prefer moving only external material from this callback.
   */
  onBlockClick?(block: { revision: string; path: NodePath }): void;
  /** Change to explicitly reread the saved file. Target changes never reread. */
  reloadKey?: string | number;
  /** Reflowing preview reduction, clamped to 0.4..1; defaults to 1. */
  scale?: number;
  /** Scroll viewport height in pixels (default 480), or fill a height set by the parent. */
  height?: number | "fill";
  label?: string;
  onStateChange?(state: ScreenDocumentViewState): void;
  /** Edit content inside the existing blocks: their number, order and kind (heading level,
   * Admonition kind) and table rows and columns stay. Saved through the official write path
   * when the edited block is left, focus leaves the view, Ctrl+S is pressed or an edit form applies. */
  editContent?: boolean;
  onEditStateChange?(state: ScreenDocumentEditState): void;
  /** Each Save this view made, once the Host accepted it. Paths of previousRevision stay valid for revision.
   * blocks: the top-level blocks this Save changed, as the Host read them from the accepted document
   * (document order; omitted when the Host could not describe the Save). */
  onSave?(save: { previousRevision: string; revision: string; blocks?: ScreenDocumentSavedBlock[] }): void;
  /** Show a change (documentViewChange) before its write; the view holds input and correspondences
   * until saved or failed. A new request value is a new change. */
  apply?: ScreenDocumentViewApply;
  onApplyStateChange?(state: ScreenDocumentApplyState): void;
}

export interface ScreenLinkedDocumentItem {
  id: string;
  label: string;
  path: NodePath;
  /** Boxes in the source scroll area's content coordinates, after source scaling (CSS px). */
  boxes: readonly { left: number; top: number; width: number; height: number }[];
  colorToken: `--id-color-${string}`;
}

export interface ScreenLinkedDocumentViewProps<SourceContent = unknown> {
  document: ScreenDocumentViewProps;
  /** Saved revision to which the item paths refer. */
  revision: string;
  source: SourceContent;
  sourceLabel: string;
  sourceRef?(viewport: HTMLDivElement | null): void;
  /** Scales source outline geometry, not the source content or supplied boxes. Defaults to 1. */
  sourceScale?: number;
  items: readonly ScreenLinkedDocumentItem[];
  selectedId?: string;
  onSelect(id: string): void;
}

export interface ScreenChartProps {
  title: string; data: Record<string, unknown>[]; xKey: string; yKey: string;
  kind?: "line" | "bar"; baseline?: number; showValues?: boolean; emptyMessage?: string;
}
export interface ScreenSelectProps {
  label: string; hideLabel?: boolean; value: string; onValueChange(value: string): void;
  options: {value: string; label: string}[]; disabled?: boolean; placeholder?: string;
}
export interface ScreenSliderProps {
  label: string; value: number[]; onValueChange(value: number[]): void;
  min: number; max: number; step?: number; disabled?: boolean;
}
export interface ScreenSummaryProps { label: string; value: string | number; description?: string }
export interface ScreenItemListItem {
  id: string;
  label: string;
  /** Same tones as ui.Status; label is human language. */
  status?: { tone: "ok" | "progress" | "warning" | "error" | "neutral"; label: string };
  /** Short texts; the same index lines up in every row. Use null to leave a position empty. */
  details?: readonly (string | null)[];
  /** Group id from groups. */
  group?: string;
}
export interface ScreenItemListGroup { id: string; title: string; collapsed?: boolean }
export interface ScreenItemListProps {
  items: readonly ScreenItemListItem[];
  /** Shown in this order. Only the initial collapsed state is an input; the list remembers later changes. */
  groups?: readonly ScreenItemListGroup[];
  onOpen(item: ScreenItemListItem): void;
  /** Keeps the status mark and its accessible name, hiding the status text when group titles already state it. */
  hideStatusLabel?: boolean;
}
/** The way back from a screen showing one item of a list; the plugin decides what returning shows. */
export interface ScreenLayoutBack {
  /** Name of the place to return to, such as the list. */
  label: string;
  onBack(): void;
  disabled?: boolean;
}
/** Shared by the client binding and bundled authoring guidance. No renderer dependency. */
export const SCREEN_UI = {
  LinkedDocumentView: 'document:DocumentView props, revision:string (paths refer to this saved revision), source:ReactNode, sourceLabel:string, sourceRef?:(viewport:HTMLDivElement|null)=>void, sourceScale?:number (outline scale, defaults to 1), items:{id:string,label:string,path:top-level Core NodePath,boxes:{left:number,top:number,width:number,height:number}[],colorToken:--id-color-*}[], selectedId?:string, onSelect:(id:string)=>void. Supply source boxes in post-scale scroll content CSS px and mark named source buttons with data-linked-item={id}. Source buttons, mapped document blocks and pointer hit areas of bands report the item ID; document blocks also provide a named keyboard action. Set selectedId in your screen and use document.target or sourceRef to move either viewport; document.target.top = box.top - source scrollTop brings the document pair level with a chosen source box; increment document.target.request on each choice. Mapping and bands are only active for the saved revision. document.height: "fill" fills the parent height, including as a direct child of ScreenLayout with fillHeight. Narrow layouts stack the panes.',
  ContextMenu: 'trigger:ReactElement (focusable target), actions:{id:string,label:string,icon:ReactNode (null for text only),visible?:boolean,disabled?:boolean,disabledReason?:string,danger?:boolean,run():void}[], disabled?:boolean. Shared target menu: right-click, Shift+F10 or ContextMenu key; Escape/outside closes. After an action, restores trigger focus unless the action moved focus elsewhere. No separators or submenus.',
  DocumentView: 'path:string inside this screen\'s opened folders; target?:{revision:string,path:Core NodePath,highlight?:boolean,top?:number,request?:string|number}; reloadKey?:string|number (change to reread saved file; with editContent, changes of reloadKey, path or editContent follow the same save-first rule below); height?:number|"fill" (480px by default; fill uses a height set by the parent); scale?:number (1; clamped to 0.4..1). Reduces text/images/tables/math with reflow at the view width; geometry remains viewport CSS pixels and the current top block is retained on scale changes. label?:string; onStateChange?:({state,revision?,message?})=>void. States: loading/ready/error/stale-target/target-not-found. onVisibleBlockChange?:({revision,path})=>void (user vertical scrolling only, at most every 100ms plus final settled value); onBlockClick?:({revision,path})=>void (simple primary click reported immediately; double-click reports first click once, not second; no drag selection, Shift+click, links, references or footnote numbers). Both report top-level Core paths and suppress stale snapshots. highlight:false aligns the target start to the viewport top without a highlight, including already visible targets. target.top places the target top that many visible CSS px below the viewport content top (same origin as onVisibleBlockLayoutChange top), visible or not, within the document scroll limits; differences up to 8px do not move; highlight then only changes the highlight and never scrolls, before or after user scrolling. It keeps the placement through layout and viewport size changes until the user scrolls. With top, a change of revision, path, top or request places the target again; equal values never move the view, even in a new object, so change request (e.g. a click count) to place the same target again after user scrolling. Programmatic movement and layout changes never emit scroll reports. onVisibleBlockLayoutChange?:({revision?:string,height:number,blocks:{path:Core NodePath,top:number,bottom:number}[]})=>void reports intersecting top-level blocks after any scrolling (including target) or layout change, at most once per animation frame and only when changed. Vertical CSS pixels relative to the viewport content top; partially visible blocks can extend outside 0..height. Loading/error/stale emits an empty list (revision omitted until loaded, height 0 without viewport). Use LinkedDocumentView to draw shared correspondence bands. Actual Litzio renderer, read-only unless editContent. Block and exact table-cell navigation/highlight (in a table with merged cells, a cell path names the column where the cell starts). Endnote definition paths reveal the definition; a paragraph path containing its call reveals that paragraph. Layout changes (math, image/font loading, width) keep the target visible until the user scrolls inside the view. A new path/revision/reloadKey resumes following. A mismatched revision never navigates/highlights. No polling or tab interaction. editContent?:boolean edits text, table cells, math, list items and captions in place; blocks keep their number, order and kind (heading level, Admonition kind) and tables their rows and columns. A table with merged cells, several header rows or cell blocks shows its spans, paragraphs and lists; its cells are read-only in this version, while its caption and notes stay editable. Refused changes (splitting, merging, adding, removing or changing blocks) leave the document unchanged with a short notice. There is no separate edit button. The view saves through the official revision-checked write path when the user leaves the edited top-level block, moves focus out of the view, presses Ctrl+S or applies an edit form (document tabs save only on Ctrl+S); one Save at a time. onEditStateChange?:({state:"clean"|"unsaved"|"saving"|"failed"|"conflict",revision:string,message?:string})=>void. onSave?:({previousRevision,revision,blocks?})=>void after each accepted Save; blocks lists the top-level blocks that Save changed as {path,nodes}, nodes being the accepted document nodes in the inspect --format json shape (omitted if the Host could not describe it), so keeping correspondences needs no reread. If the Host check that follows a quick Save corrects or refuses it, onStateChange reports the new or previous revision as for any other change; read the saved document then. When the view turns to conflict, do not use blocks received before it: realign from the revision onStateChange reports after reading again. apply?:{request,revision,change,saved?,failed?} shows a change screen code is writing itself (writeDocument in its Node code) before the write ends: change comes from documentViewChange(before,after) of @litzio/plugin-sdk, revision is the latest saved revision of the view. The view replaces only the changed blocks, holds input and pauses targets, highlights, reports and LinkedDocumentView bands, and reports onApplyStateChange?:({request,state,revision,message?}) pending. Set saved to the written revision on the same request: the view reads that file in the background without being recreated and continues from it (state saved, revision); set failed to the reason: the view goes back to its last saved state and shows the reason (state failed). It refuses (state refused, nothing shown) while loading, with unsaved or saving edits, for another revision or while another change is pending; reread with reloadKey after such a write. An input method composition delays the change until it ends. Removing apply before the outcome puts the view back; a new request while one waits is refused and the shown change keeps waiting for the outcome on its own request. Saving never recreates the view: paths stay the same, and target.revision, LinkedDocumentView revision and reports keep working with any revision this view saved; reports carry the latest revision. A file changed elsewhere gives conflict: edits stay, nothing is overwritten, and the view offers reading again (discarding the edits). A reloadKey, path or editContent change while edits are unsaved saves first and reads again only if that Save succeeds; after editContent is turned off, targets of the revisions this view saved stay valid while the file is still at its last Save. A document without blocks takes no input. Endnote references cannot be added, removed or moved: every paragraph, cell, caption or list item keeps its endnote reference labels as read; the text around them and endnote text stay editable. Saves keep top-level structure, but screens that keep correspondences must not rely on it: check block kinds in the nodes of blocks when given, and read the saved document when blocks is omitted or a correction or refusal changed the revision.',
  Button: 'Standard button props; variant outline (when omitted)/default (explicit primary)/ghost/destructive, size default/sm/icon.',
  Input: 'Standard input props; wrap in a visible label.',
  Select: 'label:string, value:string, onValueChange(value:string), options:{value:string,label:string}[], optional disabled:boolean, placeholder:string. Single selection with label above the control by default. hideLabel?:boolean visually hides the required accessible label for inline toolbar buttons.',
  Notice: 'children, optional tone="error"; catch async/event failures here.',
  DataTable: 'title:string, rows:object[], columns:string[], optional labels:{field:"Label"}, fields:{field:{type:"number"}}, rowKey:string (identity field), selectedKey?:string|number, onSelectRow?:(row)=>void. With onSelectRow, click or focus a row and press Enter/Space to select; links do not select. Caller owns selectedKey across sorting/filtering/pages.',
  ItemList: 'items:{id:string,label:string,status?:{tone:"ok"|"progress"|"warning"|"error"|"neutral",label:string},details?:(string|null)[],group?:string}[], groups?:{id:string,title:string,collapsed?:boolean}[] (shown in this order; collapsed is only the initial state), onOpen:(item)=>void, hideStatusLabel?:boolean. Rows of items people open, such as documents or tasks: status mark, name, then short details; use ui.DataTable instead for data compared by value. The same details index lines up in every row; use null for an empty position. Whole rows open on click or Enter; Arrow keys/Home/End move between rows and group titles. Group titles collapse and show the item count while collapsed. Items without a known group come first, untitled. hideStatusLabel keeps the mark and its accessible name when group titles already state the status. Renders nothing when items is empty; show ui.EmptyState yourself. Fills its parent width; narrow parents move details below the name.',
  Row: 'label:ReactNode, description?:ReactNode, children:ReactNode, kind?:"item"|"fact" (item by default). Name left, values/controls right; stacks in narrow containers. fact is a semantic definition pair; use code for paths/identifiers.',
  Section: 'title:string, description?:string, children:ReactNode. Group multiple Rows; description only when it changes the result. Do not repeat an item name or wrap a single item.',
  Status: 'tone:"ok"|"progress"|"warning"|"error"|"neutral", label:string, variant?:"pill"|"plain" (pill by default), hideIndicator?:boolean (false by default; omit the indicator for quiet completed work). Human language only, never raw state identifiers. A label pill on a quiet surface; ok uses a success-colored dot, progress uses an accent-colored spinning open ring (static with reduced motion); usable in header or body.',
  Steps: 'steps:string[], current:number (zero based). Display-only ordered list, aria-current="step" on current item.',
  EmptyState: 'title:string, optional description:string, action:ReactNode. One next action, usually a default Button.',
  Progress: 'optional value:number (0..1; omitted for indeterminate), label:string. Native progressbar with accent color.',
  ScreenLayout: 'children, optional description:string, status:ReactNode, actions:ReactNode, back:{label:string,onBack():void,disabled?:boolean}, width:"full"|"narrow" (full by default); title:string accepted but not rendered. Frame owns title and sticky header; description/status/actions appear there. back draws a return button labeled with the place to return to at the header left, before the other header controls; onBack decides what to show. narrow centers a reading-width body. With fillHeight?:boolean (default false) on the root ScreenLayout, the remaining tab space is a bounded flex column; use flex:1 and min-height:0 for your panes and give each pane its own scroll area.',
  Toolbar: 'children, optional label:string. Wrapping row aligned to the bottom of labeled inputs; buttons and inputs keep content width. Use separate toolbars for controls and summaries.',
  SummaryCard: 'label:string, value:string|number, optional description:string. Group cards in a separate Toolbar, away from controls; cards share height.',
  Slider: 'label:string, value:number[], onValueChange(values:number[]), min:number, max:number, optional step:number, disabled:boolean. One value selects a number; two select a range. Each thumb is keyboard accessible.',
  Chart: 'title:string, data:object[], xKey:string, yKey:string, optional kind:"line"|"bar" (line), baseline:number, showValues:boolean (true), emptyMessage:string. Full width, token colors, hover and keyboard values. Slice data with Slider for zoom.',
} as const;

export const SCREEN_UI_GUIDANCE = Object.entries(SCREEN_UI).map(([name, props]) => `ui.${name}: ${props}`).join('\n') + `
Design rules:
- The frame owns background, page padding and the screen title; do not add them yourself.
- Put screen status and main actions in ScreenLayout status/actions, in the header.
- A screen showing one item opened from a list gives the way back to the list with ScreenLayout back; do not add a separate button doing the same in actions.
- Use ui.Row for a name and value/control; ui.Section for several rows. Do not repeat group/item names or group a single item.
- Use ui.Status with human language, never raw status identifiers.
- Use ui.Steps for ordered work, ui.EmptyState for one next action when empty, and ui.Progress with status text for long work.
- Use width="narrow" for one-step-at-a-time work; full for tables and charts.
- Button defaults to outline; use variant="default" for only the screen's one main action.
- Use destructive buttons and confirm() for dangerous actions; do not build inline confirmation buttons.
- Choose files with pickPath; do not use native file inputs.
- Use ui.Select for choices instead of native select. hideLabel is only for toolbars alongside buttons; show labels in settings/forms. When no value is selected, supply a placeholder describing the choice.
- Menus are never the only entry to a main action; provide the same action as a screen button.
- Use ui.ItemList for items people open, such as documents or tasks, and ui.DataTable (row selection for picking a row) for data compared by value; do not stack buttons.
- Use shared parts for headings and summaries. Keep ordinary values and prose normal.
- Use ui.DataTable at default density, fitting content within the screen width; declare numeric columns with fields type:"number".
- Put controls in ui.Toolbar; group summary cards in a separate ui.Toolbar.
- Use token variables for colors and spacing, never arbitrary hex or px values.
- Native inputs inherit the accent color; do not set their colors.
Document view example (inside Screen):
const [read,setRead]=React.useState(), [reload,setReload]=React.useState(0);
<ui.DocumentView path={absoluteDocumentPath} target={targetFromInspect} reloadKey={reload} onStateChange={setRead} height={480} />;
For paired scroll panes, prefer the pane currently receiving user input and ignore delayed settled reports from the other pane until the user returns to it. Use target={{revision,path,highlight:false}} for following an external source; onVisibleBlockChange and onBlockClick report {revision,path} to move that source back. onBlockClick reports a simple primary click immediately; a double-click reports its first click once and not its second. Drag selection, Shift+click, links, references and footnote numbers are not reported. Target changes do not reread the snapshot; reloadKey remounts the view and can clear text selection, so prefer moving only external material from onBlockClick. Change reload to read an externally changed saved file. targetFromInspect is {revision:inspect.revision,path:inspect.nodes.find(n=>n.type==="cell").path}; that exact cell is highlighted. Wide tables reveal the cell using their own horizontal scroller and clip its highlight to that scroller. Manual horizontal or vertical scrolling pauses target following until the target or reload changes. A stale target is reported without navigation. Read state.revision before supplying new snapshot locators. The component is bound to this screen's Host/opened folders; no editor instance, unsaved state, tab control or PDF renderer is exposed. Use Screen's separate pickPath/openDocument actions for path selection and document tabs.
Each mounted DocumentView reads its own saved snapshot and creates its own DocumentEditor/Tiptap instance, with separate read, rendering, layout and memory costs. Prefer mounting only the views currently needed. One fixed 407-block sample was measured; this is not a performance guarantee. Memory and responsiveness for several simultaneous views, including packaged Desktop, have not been verified.
Prefer these components; custom SVG/styles and external libraries remain allowed. Buttons use content width (Toolbar), not grid stretch. Inherit background and font. Color: var(--id-color-text), var(--id-color-text-muted), var(--id-color-accent), var(--id-color-danger), var(--id-color-success), var(--id-color-surface); SVG stroke/fill accept these same var() values. Motion uses var(--duration-fast), var(--duration-normal) and var(--ease-motion); do not set durations directly. Spacing: var(--space-2), var(--space-3), var(--space-4); typography: var(--font-size-sm), var(--font-size-xl). Keep charts full width and tables fitted to content within the screen width with minWidth:0; DataTable owns horizontal scroll. The work-tab frame owns title, padding, background and scrolling; ScreenLayout supplies header description/status/actions and body.
Use h2–h4 for in-screen subheadings to receive the default styling.
Screen also receives confirm({title:string,message?:string,confirmLabel:string}) -> Promise<boolean>. This is a destructive confirmation dialog, initially focused on Cancel. Cancel/Escape returns false, confirm returns true. Reload/unmount rejects pending confirmation with AbortError, like pickPath. Catch failures in Notice.
Screen also receives pickPath({kind:"pdf"|"folder"|"document"|"file",initialPath?,extensions?}) -> Promise<{path,kind}|null> and openDocument({path}) -> Promise<{status:"opened",path}|{status:"refused",path,message}>. initialPath is a starting folder (default: first opened folder). Use only paths within this screen's opened folders. File selection or folder selection never opens another sidebar folder. For kind:"file", extensions is an optional array of dotted extensions (e.g. [".csv",".json"]), matched case-insensitively; omit it to list all files. Only file accepts extensions. File contents stay in Node: const picked=await pickPath({kind:"file",extensions:[".csv"]}); if(picked) await invoke("import",{path:picked.path}); User cancel returns null; read failures reject; reload/unmount or any opened-folder list change aborts pending selection with AbortError. Catch failures in Notice. openDocument supports .md only, retains unsaved tabs and never moves to a target position. Example inside Screen: const picked=await pickPath({kind:"document"}); if(picked) { const opened=await openDocument({path:picked.path}); if(opened.status==="refused")setError(opened.message); } For a destination use pickPath({kind:"folder"}), then saveDocument({name:"result.md",authoring,folder:picked.path,open:true}); creation returns its receipt plus opening, whose refusal must never trigger recreating the document.
Opened-folder scope checks compare path strings, not the physical destination behind directory/file links (including junctions). This applies to pickPath, openDocument and saveDocument. The Host's allowed-Root real-path restriction still applies; the screen's opened-folder scope is not a security boundary.
Example body (inside Screen with React/ui/invoke supplied):
const [kind,setKind]=React.useState("line");
const [rows,setRows]=React.useState([]), [error,setError]=React.useState("");
return <ui.ScreenLayout description="Measurements over time" status={<ui.Status variant="plain" tone="neutral" label={rows.length ? "Loaded" : "Ready"}/>} actions={<ui.Button variant="default" onClick={()=>invoke("load").then(setRows).catch(e=>setError(e.message))}>Load measurements</ui.Button>}>
  {error && <ui.Notice tone="error">{error}</ui.Notice>}
  {!rows.length ? <ui.EmptyState title="Load measurements to begin"/> : <>
  <ui.Toolbar><ui.Select label="Chart" value={kind} options={[{value:"line",label:"Line"},{value:"bar",label:"Bar"}]} onValueChange={setKind}/></ui.Toolbar>
  <ui.Section title="Dataset"><ui.Row kind="fact" label="Records">{rows.length}</ui.Row><ui.Row kind="fact" label="Chart style">{kind === "line" ? "Line" : "Bar"}</ui.Row></ui.Section>
  <ui.Toolbar><ui.SummaryCard label="Total" value={rows.reduce((s,r)=>s+r.value,0)}/></ui.Toolbar>
  <ui.Chart kind={kind} title="Measurements" data={rows} xKey="time" yKey="value" baseline={15}/>
  <ui.DataTable title="Measurements" rows={rows} columns={["time","value"]} labels={{time:"Time",value:"Value"}} fields={{value:{type:"number"}}}/>
  </>}
</ui.ScreenLayout>;
`;
