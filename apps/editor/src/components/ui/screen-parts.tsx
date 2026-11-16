import type { ScreenSelectProps, ScreenChartProps, ScreenSliderProps, ScreenSummaryProps } from "@litzio/plugin-sdk";
import { useContext, useId, type ReactNode } from "react";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ReferenceLine, ResponsiveContainer, Tooltip, Text, XAxis, YAxis } from "recharts";
import "./screen-parts.css";
import { createPortal } from "react-dom";
import { TaskHeaderSlots } from "./task-header.tsx";
import { SelectControl, SettingsProgress } from "./settings.tsx";
export function Select({ label, ...props }: ScreenSelectProps) {
  const id = useId();
  return <label className="screen-select" htmlFor={id}>{label}<SelectControl id={id} {...props} /></label>;
}

export function ScreenLayout({ description, status, actions, width = "full", children }: { title?: string; description?: string; status?: ReactNode; actions?: ReactNode; width?: "full" | "narrow"; children: ReactNode }) {
  const slots = useContext(TaskHeaderSlots);
  const descriptionNode = description && <p className="screen-description">{description}</p>;
  return <>{slots?.description && createPortal(descriptionNode, slots.description)}{slots?.trailing && createPortal(<>{status}{actions}</>, slots.trailing)}<section className="screen-layout" data-width={width}>{!slots && <>{descriptionNode}{status}{actions}</>}{children}</section></>;
}
export { Status } from "./status.tsx";
export function Steps({steps, current}: {steps: string[]; current: number}) {
  return <ol className="screen-steps">{steps.map((step, index) => <li key={index} aria-current={index === current ? "step" : undefined} data-state={index < current ? "past" : index === current ? "current" : "remaining"}><span className="screen-step-number" aria-hidden="true">{index + 1}</span><span>{step}</span></li>)}</ol>;
}
export function EmptyState({title, description, action}: {title: string; description?: string; action?: ReactNode}) {
  return <div className="screen-empty"><strong className="type-item-name">{title}</strong>{description && <p className="screen-description type-helper">{description}</p>}{action && <div>{action}</div>}</div>;
}
export function Progress({value, label}: {value?: number; label?: string}) {
  return <div className="screen-progress">{label && <span>{label}</span>}<SettingsProgress aria-label={label} value={value} /></div>;
}
export function Toolbar({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="screen-toolbar" role={label ? "group" : undefined} aria-label={label}>{children}</div>;
}
export function SummaryCard({ label, value, description }: ScreenSummaryProps) {
  return <div className="screen-summary"><strong className="type-item-name">{label}</strong><span className="screen-summary-value type-body">{value}</span>{description && <span className="screen-description type-helper">{description}</span>}</div>;
}
export function Slider({ label, value, onValueChange, min, max, step = 1, disabled = false }: ScreenSliderProps) {
  return <BaseSlider.Root className="screen-slider" value={value} onValueChange={v => onValueChange(Array.isArray(v) ? v : [v])} min={min} max={max} step={step} disabled={disabled} thumbAlignment="edge">
    <div className="screen-toolbar"><BaseSlider.Label>{label}</BaseSlider.Label><BaseSlider.Value /></div>
    <BaseSlider.Control className="screen-slider-control"><BaseSlider.Track className="screen-slider-track"><BaseSlider.Indicator className="screen-slider-indicator" />{value.map((_, index) => <BaseSlider.Thumb key={index} index={index} aria-label={value.length === 1 ? label : `${label} ${index + 1}`} className="screen-slider-thumb" />)}</BaseSlider.Track></BaseSlider.Control>
  </BaseSlider.Root>;
}
export function Chart({ title, data, xKey, yKey, kind = "line", baseline, showValues = true, emptyMessage = "No data" }: ScreenChartProps) {
  const rows = data.filter(row => typeof row[yKey] === "number" && Number.isFinite(row[yKey]));
  const labels = showValues ? <LabelList dataKey={yKey} position="top" fill="var(--id-color-text)" /> : null;
  return <figure className="screen-chart" aria-label={title}><figcaption>{title}</figcaption>{rows.length ? <ResponsiveContainer width="100%" height={300} minWidth={0}>
    <ComposedChart data={rows} accessibilityLayer margin={{ top: 24, right: 32, bottom: 8, left: 0 }}>
      <CartesianGrid stroke="var(--id-color-border-subtle)" vertical={false} />
      <XAxis dataKey={xKey} interval="preserveStartEnd" minTickGap={220} height={60} tick={({x, y, payload}) => <Text x={x} y={y} width={220} maxLines={1} verticalAnchor="start" textAnchor={payload.value === rows[0][xKey] ? "start" : payload.value === rows.at(-1)?.[xKey] ? "end" : "middle"} fill="var(--id-color-text-muted)">{String(payload.value)}</Text>} stroke="var(--id-color-border)" />
      <YAxis tick={{ fill: "var(--id-color-text-muted)" }} stroke="var(--id-color-border)" domain={["auto", "auto"]} />
      <Tooltip contentStyle={{ background: "var(--id-color-surface)", borderColor: "var(--id-color-border-subtle)", color: "var(--id-color-text)" }} itemStyle={{ color: "var(--id-color-text)" }} cursor={{ stroke: "var(--id-color-text-muted)", fill: "var(--id-color-surface-subtle)" }} />
      {baseline !== undefined && <ReferenceLine y={baseline} ifOverflow="extendDomain" stroke="var(--id-color-danger)" strokeDasharray="4 4" label={{ value: String(baseline), fill: "var(--id-color-danger)", position: "insideTopRight" }} />}
      {kind === "bar" ? <Bar dataKey={yKey} fill="var(--id-color-accent)" isAnimationActive={false}>{labels}</Bar> : <Line type="linear" dataKey={yKey} stroke="var(--id-color-accent)" strokeWidth={2} dot={{ fill: "var(--id-color-accent)" }} isAnimationActive={false}>{labels}</Line>}
    </ComposedChart>
  </ResponsiveContainer> : <p role="status" className="screen-description">{emptyMessage}</p>}</figure>;
}
