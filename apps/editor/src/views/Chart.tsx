import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ViewRow } from "@litzio/core/views";
import type { QueryLayout } from "@litzio/core/views-v2";
import { i18n } from "../i18n.ts";
import { Button } from "../components/ui/button.tsx";
import "./chart.css";

export type ChartPanel = Extract<QueryLayout["children"][number], { component: "Chart" }>;
type Cell = ViewRow[string];
const PALETTE = ["var(--id-color-accent-blue)", "var(--id-color-accent-teal)", "var(--id-color-accent-plum)", "var(--id-color-warning)", "var(--id-color-accent-green)", "var(--id-color-accent-violet)", "var(--id-color-accent-graphite)", "color-mix(in srgb, var(--id-color-accent-plum) 50%, var(--id-color-warning))"];
const LINE_TONE: Record<ChartPanel["lines"][number]["tone"], { color: string; dash?: string }> = {
  spec: { color: "var(--id-color-danger)", dash: "6 4" }, limit: { color: "var(--id-color-warning)", dash: "4 3" },
  center: { color: "var(--id-color-text-muted)" }, mean: { color: "var(--id-color-accent-blue)", dash: "2 3" },
};
const num = (v: Cell | undefined): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;

/** Round tick values to a "nice" step so labels stay short. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count, pow = 10 ** Math.floor(Math.log10(raw)), f = raw / pow;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * pow;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) ticks.push(Number(t.toPrecision(12)));
  return ticks;
}
export const formatNumber = (v: number) => Math.abs(v) >= 1000 ? v.toFixed(0) : Number(v.toPrecision(4)).toString();

type Series = { field: string; color: string };
function constant(rows: ViewRow[], field: string): number | null {
  for (const row of rows) { const v = num(row[field]); if (v !== null) return v; }
  return null;
}

export function Chart({ panel, rows, labels }: { panel: ChartPanel; rows: ViewRow[]; labels?: Record<string, string> }) {
  const id = useId();
  const label = (field: string) => labels?.[field] ?? field;
  const [xField, setX] = useState(panel.x[0]);
  const [ys, setYs] = useState<string[]>(panel.defaultY.length ? panel.defaultY : [panel.y[0]]);
  const [filterValues, setFilters] = useState<Record<string, string>>({});
  const [showLimits, setShowLimits] = useState(true);
  const base = useMemo(() => panel.rowFilter ? rows.filter(r => r[panel.rowFilter!.field] === panel.rowFilter!.value) : rows, [rows, panel]);
  const options = useMemo(() => Object.fromEntries(panel.filters.map(f => [f, [...new Set(base.map(r => r[f]).filter((v): v is string => typeof v === "string"))]])), [base, panel.filters]);
  const filtered = useMemo(() => base.filter(r => panel.filters.every(f => !filterValues[f] || r[f] === filterValues[f])), [base, panel.filters, filterValues]);
  const connected = (panel.connectWhen ?? panel.filters).every(f => !!filterValues[f]);
  const toggleY = (field: string) => setYs(cur => cur.includes(field) ? (cur.length > 1 ? cur.filter(f => f !== field) : cur) : [...cur, field]);
  if (!base.length) return <p className="chart-empty">{i18n.t("No chart data")}</p>;
  const caption = panel.caption ? base.map(r => r[panel.caption!]).find((v): v is string => typeof v === "string") : undefined;
  return <div className="chart" data-chart-type={panel.type}>
    {caption ? <p className="chart-caption">{caption}</p> : null}
    {panel.type === "line" ? <div className="chart-controls">
      {panel.x.length > 1 ? <label className="chart-field">{i18n.t("X axis")}<select className="form-select settings-select" aria-label={i18n.t("X axis")} value={xField} onChange={e => setX(e.target.value)}>{panel.x.map(f => <option key={f} value={f}>{label(f)}</option>)}</select></label> : null}
      {panel.y.length > 1 ? <div className="chart-field" role="group" aria-labelledby={`${id}-y`}><span id={`${id}-y`}>{i18n.t("Y axis")}</span>
        <div className="chart-chips">{panel.y.map((f, i) => <Button key={f} type="button" size="sm" variant="outline" className="chart-chip" aria-pressed={ys.includes(f)} onClick={() => toggleY(f)}><i aria-hidden="true" style={{ background: PALETTE[i % PALETTE.length] }} />{label(f)}</Button>)}</div></div> : null}
      {panel.filters.map(f => <label key={f} className="chart-field">{label(f)}<select className="form-select settings-select" aria-label={label(f)} value={filterValues[f] ?? ""} onChange={e => setFilters(cur => ({ ...cur, [f]: e.target.value }))}><option value="">{i18n.t("All")}</option>{options[f]!.map(v => <option key={v} value={v}>{v}</option>)}</select></label>)}
      {Object.keys(panel.limits).length ? <label className="chart-field chart-check"><input type="checkbox" checked={showLimits} onChange={e => setShowLimits(e.target.checked)} />{i18n.t("Spec limits")}</label> : null}
    </div> : null}
    {panel.type === "line"
      ? <div className="chart-stack">{ys.map(f => <Plot key={f} panel={panel} rows={filtered} xField={xField} series={{ field: f, color: PALETTE[panel.y.indexOf(f) % PALETTE.length] }} label={label} showLimits={showLimits} connected={connected} />)}</div>
      : <Bars panel={panel} rows={filtered} label={label} />}
  </div>;
}

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null); const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = ref.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => { const w = Math.floor(entry!.contentRect.width); if (w > 0) setWidth(w); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, width];
}
const M = { l: 56, r: 16, t: 14, b: 34 };

function Frame({ width, height, xs, ys, xLabel, yLabel, children, xTicks }: { width: number; height: number; xs: [number, number]; ys: [number, number]; xLabel: string; yLabel: string; xTicks?: number[]; children: (sx: (v: number) => number, sy: (v: number) => number) => React.ReactNode }) {
  const iw = width - M.l - M.r, ih = height - M.t - M.b;
  const sx = (v: number) => M.l + (xs[1] > xs[0] ? (v - xs[0]) / (xs[1] - xs[0]) : 0.5) * iw;
  const sy = (v: number) => M.t + ih - (ys[1] > ys[0] ? (v - ys[0]) / (ys[1] - ys[0]) : 0.5) * ih;
  const yt = niceTicks(ys[0], ys[1]), xt = xTicks ?? niceTicks(xs[0], xs[1], Math.max(3, Math.floor(iw / 90)));
  return <svg width={width} height={height} role="img" aria-label={yLabel} className="chart-svg">
    {yt.map(t => <g key={`y${t}`}><line x1={M.l} x2={width - M.r} y1={sy(t)} y2={sy(t)} className="chart-grid" /><text x={M.l - 6} y={sy(t)} dy="0.32em" textAnchor="end" className="chart-tick">{formatNumber(t)}</text></g>)}
    {xt.map(t => <g key={`x${t}`}><line x1={sx(t)} x2={sx(t)} y1={M.t} y2={M.t + ih} className="chart-grid" /><text x={sx(t)} y={M.t + ih + 14} textAnchor="middle" className="chart-tick">{formatNumber(t)}</text></g>)}
    <rect x={M.l} y={M.t} width={iw} height={ih} className="chart-frame" />
    {children(sx, sy)}
    <text x={M.l + iw / 2} y={height - 4} textAnchor="middle" className="chart-axis">{xLabel}</text>
    <text x={12} y={M.t + ih / 2} textAnchor="middle" className="chart-axis" transform={`rotate(-90 12 ${M.t + ih / 2})`}>{yLabel}</text>
  </svg>;
}

function Plot({ panel, rows, xField, series, label, showLimits, connected }: { panel: ChartPanel; rows: ViewRow[]; xField: string; series: Series; label(f: string): string; showLimits: boolean; connected: boolean }) {
  const [ref, width] = useWidth(); const [hover, setHover] = useState<number>();
  const height = 210;
  const pts = useMemo(() => rows.map(r => ({ r, x: num(r[xField]), y: num(r[series.field]) })).filter((p): p is { r: ViewRow; x: number; y: number } => p.x !== null && p.y !== null).sort((a, b) => a.x - b.x), [rows, xField, series.field]);
  const limits = showLimits ? panel.limits[series.field] : undefined;
  const refs = panel.lines.map(l => ({ ...l, value: constant(rows, l.field) })).filter(l => l.value !== null) as (ChartPanel["lines"][number] & { value: number })[];
  if (!pts.length) return <div ref={ref} className="chart-plot"><p className="chart-empty">{i18n.t("No chart data")}</p></div>;
  const yvals = [...pts.map(p => p.y), ...(limits ? [limits.lsl, limits.usl].filter((v): v is number => v !== undefined) : []), ...refs.map(l => l.value)];
  let lo = Math.min(...yvals), hi = Math.max(...yvals); const pad = (hi - lo || Math.abs(hi) || 1) * 0.08; lo -= pad; hi += pad;
  const xlo = pts[0]!.x, xhi = pts[pts.length - 1]!.x, xpad = (xhi - xlo || 1) * 0.02;
  const seps: { x: number; text: string }[] = [];
  if (panel.separator) { let prev: Cell | undefined; for (const p of pts) { const v = p.r[panel.separator]; if (prev !== undefined && v !== prev) seps.push({ x: p.x, text: String(v) }); if (v !== prev) prev = v; } }
  const first = panel.separator ? String(pts[0]!.r[panel.separator]) : "";
  const flagged = panel.flag ? pts.filter(p => p.r[panel.flag!] === true).length : 0;
  const h = hover === undefined ? undefined : pts[hover];
  return <div ref={ref} className="chart-plot">
    <Frame width={width} height={height} xs={[xlo - xpad, xhi + xpad]} ys={[lo, hi]} xLabel={label(xField)} yLabel={label(series.field)}>{(sx, sy) => <g onMouseLeave={() => setHover(undefined)} onMouseMove={e => {
      const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect(); const mx = e.clientX - box.left;
      let best = 0, d = Infinity; pts.forEach((p, i) => { const dd = Math.abs(sx(p.x) - mx); if (dd < d) { d = dd; best = i; } }); setHover(best);
    }}>
      <rect x={M.l} y={M.t} width={width - M.l - M.r} height={height - M.t - M.b} fill="transparent" />
      {seps.map(s => <g key={s.x}><line x1={sx(s.x)} x2={sx(s.x)} y1={M.t} y2={height - M.b} className="chart-sep" /><text x={sx(s.x) + 4} y={M.t + 10} className="chart-sep-label">{s.text}</text></g>)}
      {panel.separator ? <text x={M.l + 4} y={M.t + 10} className="chart-sep-label">{first}</text> : null}
      {limits ? [["LSL", limits.lsl], ["USL", limits.usl]].map(([name, v]) => typeof v === "number" ? <g key={name as string}><line x1={M.l} x2={width - M.r} y1={sy(v)} y2={sy(v)} stroke="var(--id-color-danger)" strokeDasharray="6 4" strokeWidth={1.25} /><text x={width - M.r - 2} y={sy(v) - 3} textAnchor="end" className="chart-limit-label" fill="var(--id-color-danger)">{name as string} {formatNumber(v)}</text></g> : null) : null}
      {refs.map(l => <g key={l.field}><line x1={M.l} x2={width - M.r} y1={sy(l.value)} y2={sy(l.value)} stroke={LINE_TONE[l.tone].color} strokeDasharray={LINE_TONE[l.tone].dash} strokeWidth={1.25} /><text x={width - M.r - 2} y={sy(l.value) - 3} textAnchor="end" className="chart-limit-label" fill={LINE_TONE[l.tone].color}>{l.label} {formatNumber(l.value)}</text></g>)}
      {connected ? <polyline fill="none" stroke={series.color} strokeWidth={1.5} points={pts.map(p => `${sx(p.x)},${sy(p.y)}`).join(" ")} /> : null}
      {pts.map((p, i) => { const bad = panel.flag ? p.r[panel.flag] === true : false;
        return <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={bad ? 4.5 : 2.6} fill={bad ? "var(--id-color-danger)" : series.color} stroke={bad ? "var(--id-color-surface)" : "none"} strokeWidth={1} data-flag={bad || undefined} />; })}
      {h ? <g><line x1={sx(h.x)} x2={sx(h.x)} y1={M.t} y2={height - M.b} className="chart-cursor" /><circle cx={sx(h.x)} cy={sy(h.y)} r={5} fill="none" stroke="var(--id-color-text)" strokeWidth={1.5} /></g> : null}
    </g>}</Frame>
    {panel.flag ? <p className="chart-note">{flagged ? i18n.t("{{count}} flagged points (red)", { count: flagged }) : i18n.t("No flagged points")}</p> : null}
    {h ? <div className="chart-tip" role="status">{[label(series.field) + ": " + formatNumber(h.y), label(xField) + ": " + formatNumber(h.x), ...panel.tooltip.map(f => `${label(f)}: ${h.r[f] ?? "—"}`)].join(" · ")}</div> : null}
  </div>;
}

function Bars({ panel, rows, label }: { panel: ChartPanel; rows: ViewRow[]; label(f: string): string }) {
  const [ref, width] = useWidth(); const height = 240;
  const countField = panel.y[0]!;
  const bins = rows.map(r => ({ a: num(r[panel.x[0]!]), b: num(r[panel.xEnd!]), n: num(r[countField]), c: panel.curve ? num(r[panel.curve]) : null })).filter((b): b is { a: number; b: number; n: number; c: number | null } => b.a !== null && b.b !== null && b.n !== null);
  const refs = panel.lines.map(l => ({ ...l, value: constant(rows, l.field) })).filter(l => l.value !== null) as (ChartPanel["lines"][number] & { value: number })[];
  if (!bins.length) return <div ref={ref}><p className="chart-empty">{i18n.t("No chart data")}</p></div>;
  const xs = [...bins.flatMap(b => [b.a, b.b]), ...refs.map(l => l.value)];
  const xlo = Math.min(...xs), xhi = Math.max(...xs), pad = (xhi - xlo) * 0.03;
  const ymax = Math.max(...bins.map(b => Math.max(b.n, b.c ?? 0))) * 1.12 || 1;
  return <div ref={ref} className="chart-plot"><Frame width={width} height={height} xs={[xlo - pad, xhi + pad]} ys={[0, ymax]} xLabel={label(panel.x[0]!)} yLabel={label(countField)}>{(sx, sy) => <g>
    {bins.map((b, i) => <rect key={i} x={sx(b.a) + 1} y={sy(b.n)} width={Math.max(1, sx(b.b) - sx(b.a) - 2)} height={sy(0) - sy(b.n)} fill="var(--id-color-accent-blue)" opacity={0.55} />)}
    {panel.curve ? <polyline fill="none" stroke="var(--id-color-accent-plum)" strokeWidth={2} points={bins.filter(b => b.c !== null).map(b => `${sx((b.a + b.b) / 2)},${sy(b.c!)}`).join(" ")} /> : null}
    {refs.map(l => <g key={l.field}><line x1={sx(l.value)} x2={sx(l.value)} y1={M.t} y2={height - M.b} stroke={LINE_TONE[l.tone].color} strokeDasharray={LINE_TONE[l.tone].dash} strokeWidth={1.5} /><text x={sx(l.value) + 3} y={M.t + 11} className="chart-limit-label" fill={LINE_TONE[l.tone].color}>{l.label} {formatNumber(l.value)}</text></g>)}
  </g>}</Frame>
    {panel.curve ? <p className="chart-note"><i className="chart-legend-bar" aria-hidden="true" />{label(countField)} <i className="chart-legend-line" aria-hidden="true" />{label(panel.curve)}</p> : null}
  </div>;
}
