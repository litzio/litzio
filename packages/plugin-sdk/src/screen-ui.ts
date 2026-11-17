import type { NodePath } from "@litzio/core";

export type ScreenDocumentViewState = {
  state: "loading" | "ready" | "error" | "stale-target" | "target-not-found";
  revision?: string;
  message?: string;
};
export interface ScreenDocumentViewProps {
  path: string;
  target?: { revision: string; path: NodePath; highlight?: boolean };
  /** User scrolling only; top-level blocks, throttled with a final settled report. */
  onVisibleBlockChange?(block: { revision: string; path: NodePath }): void;
  /** Simple primary click only; links and text selection retain their behavior. */
  onBlockClick?(block: { revision: string; path: NodePath }): void;
  /** Change to explicitly reread the saved file. Target changes never reread. */
  reloadKey?: string | number;
  height?: number;
  label?: string;
  onStateChange?(state: ScreenDocumentViewState): void;
}

export interface ScreenChartProps {
  title: string; data: Record<string, unknown>[]; xKey: string; yKey: string;
  kind?: "line" | "bar"; baseline?: number; showValues?: boolean; emptyMessage?: string;
}
export interface ScreenSelectProps {
  label: string; value: string; onValueChange(value: string): void;
  options: {value: string; label: string}[]; disabled?: boolean; placeholder?: string;
}
export interface ScreenSliderProps {
  label: string; value: number[]; onValueChange(value: number[]): void;
  min: number; max: number; step?: number; disabled?: boolean;
}
export interface ScreenSummaryProps { label: string; value: string | number; description?: string }
/** Shared by the client binding and bundled authoring guidance. No renderer dependency. */
export const SCREEN_UI = {
  DocumentView: 'path:string inside this screen\'s opened folders; target?:{revision:string,path:Core NodePath,highlight?:boolean}; reloadKey?:string|number (change to reread saved file); height?:number (480px); label?:string; onStateChange?:({state,revision?,message?})=>void. States: loading/ready/error/stale-target/target-not-found. onVisibleBlockChange?:({revision,path})=>void (user vertical scrolling only, at most every 100ms plus final settled value); onBlockClick?:({revision,path})=>void (simple click, not links or text selection). Both report top-level Core paths and suppress stale snapshots. highlight:false aligns the target start to the viewport top without a highlight, including already visible targets. Programmatic movement and layout changes never emit scroll reports. Actual read-only Litzio renderer. Block and exact table-cell navigation/highlight. Endnote definition paths reveal the definition; a paragraph path containing its call reveals that paragraph. Layout changes (math, image/font loading, width) keep the target visible until the user scrolls inside the view. A new path/revision/reloadKey resumes following. A mismatched revision never navigates/highlights. No editing, save, polling or tab interaction.',
  Button: 'Standard button props; variant outline (when omitted)/default (explicit primary)/ghost/destructive, size default/sm/icon.',
  Input: 'Standard input props; wrap in a visible label.',
  Select: 'label:string, value:string, onValueChange(value:string), options:{value:string,label:string}[], optional disabled:boolean, placeholder:string. Single selection with label above the control.',
  Notice: 'children, optional tone="error"; catch async/event failures here.',
  DataTable: 'title:string, rows:object[], columns:string[], optional labels:{field:"Label"}, fields:{field:{type:"number"}}, rowKey:string (identity field), selectedKey?:string|number, onSelectRow?:(row)=>void. With onSelectRow, click or focus a row and press Enter/Space to select; links do not select. Caller owns selectedKey across sorting/filtering/pages.',
  Row: 'label:ReactNode, description?:ReactNode, children:ReactNode, kind?:"item"|"fact" (item by default). Name left, values/controls right; stacks in narrow containers. fact is a semantic definition pair; use code for paths/identifiers.',
  Section: 'title:string, description?:string, children:ReactNode. Group multiple Rows; description only when it changes the result. Do not repeat an item name or wrap a single item.',
  Status: 'tone:"ok"|"progress"|"warning"|"error"|"neutral", label:string, variant?:"pill"|"plain" (pill by default), hideIndicator?:boolean (false by default; omit the indicator for quiet completed work). Human language only, never raw state identifiers. A label pill on a quiet surface; ok uses a success-colored dot, progress uses an accent-colored spinning open ring (static with reduced motion); usable in header or body.',
  Steps: 'steps:string[], current:number (zero based). Display-only ordered list, aria-current="step" on current item.',
  EmptyState: 'title:string, optional description:string, action:ReactNode. One next action, usually a default Button.',
  Progress: 'optional value:number (0..1; omitted for indeterminate), label:string. Native progressbar with accent color.',
  ScreenLayout: 'children, optional description:string, status:ReactNode, actions:ReactNode, width:"full"|"narrow" (full by default); title:string accepted but not rendered. Frame owns title and sticky header; description/status/actions appear there. narrow centers a reading-width body.',
  Toolbar: 'children, optional label:string. Wrapping row aligned to the bottom of labeled inputs; buttons and inputs keep content width. Use separate toolbars for controls and summaries.',
  SummaryCard: 'label:string, value:string|number, optional description:string. Group cards in a separate Toolbar, away from controls; cards share height.',
  Slider: 'label:string, value:number[], onValueChange(values:number[]), min:number, max:number, optional step:number, disabled:boolean. One value selects a number; two select a range. Each thumb is keyboard accessible.',
  Chart: 'title:string, data:object[], xKey:string, yKey:string, optional kind:"line"|"bar" (line), baseline:number, showValues:boolean (true), emptyMessage:string. Full width, token colors, hover and keyboard values. Slice data with Slider for zoom.',
} as const;

export const SCREEN_UI_GUIDANCE = Object.entries(SCREEN_UI).map(([name, props]) => `ui.${name}: ${props}`).join('\n') + `
Design rules:
- The frame owns background, page padding and the screen title; do not add them yourself.
- Put screen status and main actions in ScreenLayout status/actions, in the header.
- Use ui.Row for a name and value/control; ui.Section for several rows. Do not repeat group/item names or group a single item.
- Use ui.Status with human language, never raw status identifiers.
- Use ui.Steps for ordered work, ui.EmptyState for one next action when empty, and ui.Progress with status text for long work.
- Use width="narrow" for one-step-at-a-time work; full for tables and charts.
- Button defaults to outline; use variant="default" for only the screen's one main action.
- Use destructive buttons and confirm() for dangerous actions; do not build inline confirmation buttons.
- Choose files with pickPath; do not use native file inputs.
- Use ui.Select for choices instead of native select.
- Use ui.DataTable row selection for picking an item; do not stack buttons.
- Use shared parts for headings and summaries. Keep ordinary values and prose normal.
- Use ui.DataTable at default density, fitting content within the screen width; declare numeric columns with fields type:"number".
- Put controls in ui.Toolbar; group summary cards in a separate ui.Toolbar.
- Use token variables for colors and spacing, never arbitrary hex or px values.
- Native inputs inherit the accent color; do not set their colors.
Document view example (inside Screen):
const [read,setRead]=React.useState(), [reload,setReload]=React.useState(0);
<ui.DocumentView path={absoluteDocumentPath} target={targetFromInspect} reloadKey={reload} onStateChange={setRead} height={480} />;
For paired scroll panes, prefer the pane currently receiving user input and ignore delayed settled reports from the other pane until the user returns to it. Use target={{revision,path,highlight:false}} for following an external source; onVisibleBlockChange and onBlockClick report {revision,path} to move that source back. Change reload to read an externally changed saved file. targetFromInspect is {revision:inspect.revision,path:inspect.nodes.find(n=>n.type==="cell").path}; that exact cell is highlighted. Wide tables reveal the cell using their own horizontal scroller and clip its highlight to that scroller. Manual horizontal or vertical scrolling pauses target following until the target or reload changes. A stale target is reported without navigation. Read state.revision before supplying new snapshot locators. The component is bound to this screen's Host/opened folders; no editor instance, unsaved state, tab control or PDF renderer is exposed. Use Screen's separate pickPath/openDocument actions for path selection and document tabs.
Each mounted DocumentView reads its own saved snapshot and creates its own read-only DocumentEditor/Tiptap instance, with separate read, rendering, layout and memory costs. Prefer mounting only the views currently needed. One fixed 407-block sample was measured; this is not a performance guarantee. Memory and responsiveness for several simultaneous views, including packaged Desktop, have not been verified.
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
