import type { ScreenChartProps, ScreenSliderProps, ScreenSummaryProps } from "@litzio/plugin-sdk";
import type { ReactNode } from "react";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./screen-parts.css";

export function ScreenLayout({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  return <section className="screen-layout">{title && <h2 className="screen-layout-title">{title}</h2>}{description && <p className="screen-description">{description}</p>}{children}</section>;
}
export function Toolbar({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="screen-toolbar" role={label ? "group" : undefined} aria-label={label}>{children}</div>;
}
export function SummaryCard({ label, value, description }: ScreenSummaryProps) {
  return <div className="screen-summary"><span className="screen-description">{label}</span><strong>{value}</strong>{description && <span className="screen-description">{description}</span>}</div>;
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
      <XAxis dataKey={xKey} tick={{ fill: "var(--id-color-text-muted)" }} stroke="var(--id-color-border)" />
      <YAxis tick={{ fill: "var(--id-color-text-muted)" }} stroke="var(--id-color-border)" domain={["auto", "auto"]} />
      <Tooltip contentStyle={{ background: "var(--id-color-surface)", borderColor: "var(--id-color-border-subtle)", color: "var(--id-color-text)" }} itemStyle={{ color: "var(--id-color-text)" }} cursor={{ stroke: "var(--id-color-text-muted)", fill: "var(--id-color-surface-subtle)" }} />
      {baseline !== undefined && <ReferenceLine y={baseline} ifOverflow="extendDomain" stroke="var(--id-color-danger)" strokeDasharray="4 4" label={{ value: String(baseline), fill: "var(--id-color-danger)", position: "insideTopRight" }} />}
      {kind === "bar" ? <Bar dataKey={yKey} fill="var(--id-color-accent)" isAnimationActive={false}>{labels}</Bar> : <Line type="linear" dataKey={yKey} stroke="var(--id-color-accent)" strokeWidth={2} dot={{ fill: "var(--id-color-accent)" }} isAnimationActive={false}>{labels}</Line>}
    </ComposedChart>
  </ResponsiveContainer> : <p role="status" className="screen-description">{emptyMessage}</p>}</figure>;
}
