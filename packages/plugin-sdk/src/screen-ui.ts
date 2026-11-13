import type { NodePath } from "@litzio/core";

export type ScreenDocumentViewState = {
  state: "loading" | "ready" | "error" | "stale-target" | "target-not-found";
  revision?: string;
  message?: string;
};
export interface ScreenDocumentViewProps {
  path: string;
  target?: { revision: string; path: NodePath };
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
export interface ScreenSliderProps {
  label: string; value: number[]; onValueChange(value: number[]): void;
  min: number; max: number; step?: number; disabled?: boolean;
}
export interface ScreenSummaryProps { label: string; value: string | number; description?: string }
/** Shared by the client binding and bundled authoring guidance. No renderer dependency. */
export const SCREEN_UI = {
  DocumentView: 'path:string inside this screen\'s opened folders; target?:{revision:string,path:Core NodePath}; reloadKey?:string|number (change to reread saved file); height?:number (480px); label?:string; onStateChange?:({state,revision?,message?})=>void. States: loading/ready/error/stale-target/target-not-found. Actual read-only Litzio renderer. Block navigation; valid table-cell paths reveal/highlight the whole table. A mismatched revision never navigates/highlights. No editing, save, polling or tab interaction.',
  Button: 'Standard button props; variant default/secondary/outline/ghost, size default/sm/icon.',
  Input: 'Standard input props; wrap in a visible label.',
  Notice: 'children, optional tone="error"; catch async/event failures here.',
  DataTable: 'title:string, rows:object[], columns:string[], optional labels:{field:"Label"}, fields:{field:{type:"number"}}.',
  ScreenLayout: 'children, optional description:string and title:string (omit title when the page already names this screen). Inherited background, full-width body, no extra page padding.',
  Toolbar: 'children, optional label:string. Wrapping row; buttons and labeled inputs keep content width.',
  SummaryCard: 'label:string, value:string|number, optional description:string. Put several cards inside Toolbar.',
  Slider: 'label:string, value:number[], onValueChange(values:number[]), min:number, max:number, optional step:number, disabled:boolean. One value selects a number; two select a range. Each thumb is keyboard accessible.',
  Chart: 'title:string, data:object[], xKey:string, yKey:string, optional kind:"line"|"bar" (line), baseline:number, showValues:boolean (true), emptyMessage:string. Full width, token colors, hover and keyboard values. Slice data with Slider for zoom.',
} as const;

export const SCREEN_UI_GUIDANCE = Object.entries(SCREEN_UI).map(([name, props]) => `ui.${name}: ${props}`).join('\n') + `
Document view example (inside Screen):
const [read,setRead]=React.useState(), [reload,setReload]=React.useState(0);
<ui.DocumentView path={absoluteDocumentPath} target={targetFromInspect} reloadKey={reload} onStateChange={setRead} height={480} />;
Change reload to read an externally changed saved file. targetFromInspect is {revision:inspect.revision,path:inspect.nodes.find(n=>n.type==="cell").path}; the whole containing table is highlighted. A stale target is reported without navigation. Read state.revision before supplying new snapshot locators. The component is bound to this screen's Host/opened folders; no file picker, editor instance, unsaved state, tab control or PDF renderer is exposed.
Prefer these components; custom SVG/styles and external libraries remain allowed. Buttons use content width (Toolbar), not grid stretch. Inherit background and font. Color: var(--id-color-text), var(--id-color-text-muted), var(--id-color-accent), var(--id-color-danger), var(--id-color-surface); SVG stroke/fill accept these same var() values. Spacing: var(--space-2), var(--space-3), var(--space-4); typography: var(--font-size-sm), var(--font-size-start-title). Keep table/chart full width with minWidth:0; DataTable owns horizontal scroll. The page owns title, padding and scrolling. See ScreenLayout before adding another heading.
Example body (inside Screen with React/ui/invoke supplied):
const [rows,setRows]=React.useState([]), [error,setError]=React.useState("");
return <ui.ScreenLayout description="Measurements over time">
  <ui.Toolbar><ui.Button onClick={()=>invoke("load").then(setRows).catch(e=>setError(e.message))}>Refresh</ui.Button><ui.SummaryCard label="Total" value={rows.reduce((s,r)=>s+r.value,0)}/></ui.Toolbar>
  {error && <ui.Notice tone="error">{error}</ui.Notice>}
  <ui.Chart title="Measurements" data={rows} xKey="time" yKey="value" baseline={15}/>
  <ui.DataTable title="Measurements" rows={rows} columns={["time","value"]} fields={{value:{type:"number"}}}/>
</ui.ScreenLayout>;
`;
