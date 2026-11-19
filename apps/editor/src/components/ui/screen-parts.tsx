import type { ScreenSelectProps, ScreenChartProps, ScreenSliderProps, ScreenSummaryProps } from "@litzio/plugin-sdk";
import { useContext, useId, useState, type ReactNode } from "react";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ReferenceLine, ResponsiveContainer, Tooltip, Text, XAxis, YAxis } from "recharts";
import "./screen-parts.css";
import { createPortal } from "react-dom";
import { TaskHeaderSlots } from "./task-header.tsx";
import { SelectControl, SettingsProgress } from "./settings.tsx";
export function Select({ label, hideLabel = false, ...props }: ScreenSelectProps) {
  const id = useId();
  return <label className="screen-select" htmlFor={id}><span className={hideLabel ? "sr-only" : "type-item-name"}>{label}</span><SelectControl id={id} {...props} /></label>;
}

export function ScreenLayout({ description, status, actions, width = "full", fillHeight = false, children }: { title?: string; description?: string; status?: ReactNode; actions?: ReactNode; width?: "full" | "narrow"; fillHeight?: boolean; children: ReactNode }) {
  const slots = useContext(TaskHeaderSlots);
  const descriptionNode = description && <p className="screen-description">{description}</p>;
  return <>{slots?.description && createPortal(descriptionNode, slots.description)}{slots?.trailing && createPortal(<>{status}{actions}</>, slots.trailing)}<section className="screen-layout" data-width={width} data-fill-height={fillHeight || undefined}>{!slots && <>{descriptionNode}{status}{actions}</>}{children}</section></>;
}
export { Status } from "./status.tsx";
export function Steps({steps, current}: {steps: string[]; current: number}) {
  return <ol className="screen-steps type-body">{steps.map((step, index) => <li key={index} aria-current={index === current ? "step" : undefined} data-state={index < current ? "past" : index === current ? "current" : "remaining"}><span className="screen-step-number" aria-hidden="true">{index + 1}</span><span className={index === current ? "type-item-name" : "type-value-name"}>{step}</span></li>)}</ol>;
}
export function EmptyState({title, description, action}: {title: string; description?: string; action?: ReactNode}) {
  return <div className="screen-empty"><strong className="type-item-name">{title}</strong>{description && <p className="screen-description type-helper">{description}</p>}{action && <div>{action}</div>}</div>;
}
export function Progress({value, label}: {value?: number; label?: string}) {
  return <div className="screen-progress">{label && <span className="type-body">{label}</span>}<SettingsProgress aria-label={label} value={value} /></div>;
}
export function Toolbar({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="screen-toolbar" role={label ? "group" : undefined} aria-label={label}>{children}</div>;
}
export function SummaryCard({ label, value, description }: ScreenSummaryProps) {
  return <div className="screen-summary"><strong className="type-item-name">{label}</strong><span className="screen-summary-value type-category-title">{value}</span>{description && <span className="screen-description type-helper">{description}</span>}</div>;
}
export function Slider({ label, value, onValueChange, min, max, step = 1, disabled = false }: ScreenSliderProps) {
  return <BaseSlider.Root className="screen-slider" value={value} onValueChange={v => onValueChange(Array.isArray(v) ? v : [v])} min={min} max={max} step={step} disabled={disabled} thumbAlignment="edge">
    <div className="screen-toolbar"><BaseSlider.Label className="type-item-name">{label}</BaseSlider.Label><BaseSlider.Value className="type-body" /></div>
    <BaseSlider.Control className="screen-slider-control"><BaseSlider.Track className="screen-slider-track"><BaseSlider.Indicator className="screen-slider-indicator" />{value.map((_, index) => <BaseSlider.Thumb key={index} index={index} aria-label={value.length === 1 ? label : `${label} ${index + 1}`} className="screen-slider-thumb" />)}</BaseSlider.Track></BaseSlider.Control>
  </BaseSlider.Root>;
}
const CHART_RIGHT_MARGIN = 32;
const Y_AXIS_WIDTH = 60;
const TICK_LABEL_WIDTH = 220;
const TICK_GAP = 160;
const ENDPOINT_GAP = 24;
let measureContext: CanvasRenderingContext2D | null | undefined;
const TICK_FONT_SIZE = "var(--font-size-xs)";
/** Measures in the font Recharts Text uses to truncate tick labels (its style, inheriting the body font). */
function widestLabel(labels: string[]) {
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return TICK_LABEL_WIDTH;
  const context = measureContext;
  const probe = document.body.appendChild(document.createElement("span"));
  probe.style.fontSize = TICK_FONT_SIZE;
  const font = getComputedStyle(probe);
  context.font = `${font.fontStyle} ${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
  probe.remove();
  return labels.reduce((max, label) => Math.max(max, context.measureText(label).width), 0);
}
/**
 * Category-axis labels: the first label starts at its point and the last ends at its point, so both always fit;
 * intermediate labels are centered and only kept where the remaining width spaces them apart.
 * Point distance assumes band placement, the closer of band and point scales.
 */
function axisTicks(labels: string[], axisWidth: number) {
  const count = labels.length;
  const slot = Math.max(0, axisWidth) / count;
  const endpointDistance = count > 1 ? (count - 1) * slot : slot;
  const labelWidth = Math.max(0, Math.min(TICK_LABEL_WIDTH, Math.ceil(widestLabel(labels)), (endpointDistance - ENDPOINT_GAP) / 2));
  const spacing = 1.5 * labelWidth + TICK_GAP;
  const step = slot > 0 ? Math.max(1, Math.ceil(spacing / slot)) : count;
  const indexes = [0];
  for (let index = step; index < count - 1 && (count - 1 - index) * slot >= spacing; index += step) indexes.push(index);
  if (count > 1) indexes.push(count - 1);
  return { labelWidth, indexes };
}
export function Chart({ title, data, xKey, yKey, kind = "line", baseline, showValues = true, emptyMessage = "No data" }: ScreenChartProps) {
  const rows = data.filter(row => typeof row[yKey] === "number" && Number.isFinite(row[yKey]));
  const labels = showValues ? <LabelList dataKey={yKey} position="top" fill="var(--id-color-text)" /> : null;
  const [width, setWidth] = useState(0);
  const axis = rows.length ? axisTicks(rows.map(row => String(row[xKey])), width - CHART_RIGHT_MARGIN - Y_AXIS_WIDTH) : undefined;
  return <figure className="screen-chart" aria-label={title}><figcaption className="type-item-name">{title}</figcaption>{rows.length ? <ResponsiveContainer width="100%" height={300} minWidth={0} onResize={setWidth}>
    <ComposedChart data={rows} accessibilityLayer margin={{ top: 24, right: CHART_RIGHT_MARGIN, bottom: 8, left: 0 }}>
      <CartesianGrid stroke="var(--id-color-border-subtle)" vertical={false} />
      <XAxis dataKey={xKey} ticks={axis?.indexes.map(index => rows[index][xKey] as string | number)} interval={0} height={60} tick={({x, y, payload}) => <Text className="type-helper" style={{ fontSize: TICK_FONT_SIZE }} x={x} y={y} width={axis?.labelWidth} maxLines={1} verticalAnchor="start" textAnchor={payload.value === rows[0][xKey] ? "start" : payload.value === rows.at(-1)?.[xKey] ? "end" : "middle"} fill="var(--id-color-text-muted)">{String(payload.value)}</Text>} stroke="var(--id-color-border)" />
      <YAxis width={Y_AXIS_WIDTH} tick={{ fill: "var(--id-color-text-muted)" }} stroke="var(--id-color-border)" domain={["auto", "auto"]} />
      <Tooltip formatter={value => [value, title]} contentStyle={{ background: "var(--id-color-surface)", borderColor: "var(--id-color-border-subtle)", color: "var(--id-color-text)" }} itemStyle={{ color: "var(--id-color-text)" }} cursor={{ stroke: "var(--id-color-text-muted)", fill: "var(--id-color-surface-subtle)" }} />
      {baseline !== undefined && <ReferenceLine y={baseline} ifOverflow="extendDomain" stroke="var(--id-color-danger)" strokeDasharray="4 4" label={{ value: String(baseline), fill: "var(--id-color-danger)", position: "insideTopRight" }} />}
      {kind === "bar" ? <Bar dataKey={yKey} fill="var(--id-color-accent)" isAnimationActive={false}>{labels}</Bar> : <Line type="linear" dataKey={yKey} stroke="var(--id-color-accent)" strokeWidth={2} dot={{ fill: "var(--id-color-accent)" }} isAnimationActive={false}>{labels}</Line>}
    </ComposedChart>
  </ResponsiveContainer> : <p role="status" className="screen-description">{emptyMessage}</p>}</figure>;
}
