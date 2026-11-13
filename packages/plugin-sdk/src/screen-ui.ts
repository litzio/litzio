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
Prefer these components; custom SVG/styles and external libraries remain allowed. Buttons use content width (Toolbar), not grid stretch. Inherit background and font. Color: var(--id-color-text), var(--id-color-text-muted), var(--id-color-accent), var(--id-color-danger), var(--id-color-surface); SVG stroke/fill accept these same var() values. Spacing: var(--space-2), var(--space-3), var(--space-4); typography: var(--font-size-sm), var(--font-size-start-title). Keep table/chart full width with minWidth:0; DataTable owns horizontal scroll. The page owns title, padding and scrolling. See ScreenLayout before adding another heading.
Screen also receives pickPath({kind:"pdf"|"folder"|"document",initialPath?}) -> Promise<{path,kind}|null> and openDocument({path}) -> Promise<{status:"opened",path}|{status:"refused",path,message}>. initialPath is a starting folder (default: first opened folder). Use only paths within this screen's opened folders. PDF/.md file selection or folder selection never opens another sidebar folder. User cancel returns null; read failures reject; reload/unmount or any opened-folder list change aborts pending selection with AbortError. Catch failures in Notice. openDocument supports .md only, retains unsaved tabs and never moves to a target position. Example inside Screen: const picked=await pickPath({kind:"document"}); if(picked) { const opened=await openDocument({path:picked.path}); if(opened.status==="refused")setError(opened.message); } For a destination use pickPath({kind:"folder"}), then saveDocument({name:"result.md",authoring,folder:picked.path,open:true}); creation returns its receipt plus opening, whose refusal must never trigger recreating the document.
Example body (inside Screen with React/ui/invoke supplied):
const [rows,setRows]=React.useState([]), [error,setError]=React.useState("");
return <ui.ScreenLayout description="Measurements over time">
  <ui.Toolbar><ui.Button onClick={()=>invoke("load").then(setRows).catch(e=>setError(e.message))}>Refresh</ui.Button><ui.SummaryCard label="Total" value={rows.reduce((s,r)=>s+r.value,0)}/></ui.Toolbar>
  {error && <ui.Notice tone="error">{error}</ui.Notice>}
  <ui.Chart title="Measurements" data={rows} xKey="time" yKey="value" baseline={15}/>
  <ui.DataTable title="Measurements" rows={rows} columns={["time","value"]} fields={{value:{type:"number"}}}/>
</ui.ScreenLayout>;
`;
