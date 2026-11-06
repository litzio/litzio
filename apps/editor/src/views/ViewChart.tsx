import { useState } from "react";
import type { z } from "zod";
import type { chartSchema, ViewRow } from "@litzio/core/views";
import { Button } from "../components/ui/button.tsx";
import { i18n } from "../i18n.ts";
import "./view-charts.css";

type Chart = z.infer<typeof chartSchema>;
type Label = (field: string, value: ViewRow[string]) => string;

// Normalize before subtraction so opposite finite extremes cannot overflow.
function axis(values: number[]) {
  const min = Math.min(...values), max = Math.max(...values);
  const scale = Math.max(1, Math.abs(min), Math.abs(max));
  return { min, max, at: (value: number) => min === max ? 50 : (value / scale - min / scale) / (max / scale - min / scale) * 100 };
}
function Plot({ chart, rows, label, fields }: { chart: Chart; rows: ViewRow[]; label: Label; fields?: Record<string, string> }) {
  const points = rows.map(row => ({ x: row[chart.x] === null ? null : typeof row[chart.x] === "number" ? row[chart.x] as number : Date.parse(String(row[chart.x])), y: row[chart.y] as number | null }));
  const visible = points.filter((p): p is { x: number; y: number } => p.x !== null && p.y !== null);
  if (!visible.length) return null;
  const xs = axis(points.flatMap(p => p.x === null ? [] : [p.x])), ys = axis(visible.map(p => p.y));
  let path = "", connected = false;
  for (const p of points) {
    if (p.x === null || p.y === null) { connected = false; continue; }
    path += `${connected ? "L" : "M"}${xs.at(p.x) * 6},${(100 - ys.at(p.y)) * 2.4} `;
    connected = true;
  }
  return <div className="view-plot"><svg viewBox="-6 -6 612 252" aria-hidden="true">
    {chart.type === "line" && <path d={path} className="view-plot-line" />}
    {visible.map((p, i) => <circle key={i} cx={xs.at(p.x) * 6} cy={(100 - ys.at(p.y)) * 2.4} r="3" />)}
  </svg><div className="view-plot-range"><span>{String(ys.min)} – {String(ys.max)} · {fields?.[chart.y] ?? chart.y}</span><span>{label(chart.x, rows[points.findIndex(p => p.x === xs.min)][chart.x])} – {label(chart.x, rows[points.findIndex(p => p.x === xs.max)][chart.x])} · {fields?.[chart.x] ?? chart.x}</span></div></div>;
}

function Bars({ rows, chart, label }: { rows: ViewRow[]; chart: Chart; label: Label }) {
  const values = rows.map(row => Number(row[chart.y]));
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const positions = axis([min, max]), zero = min === max ? 0 : positions.at(0);
  return <div className="view-bars">{rows.map((row, i) => {
    const value = values[i], end = min === max ? zero : positions.at(value);
    return <div key={i}><span>{label(chart.x, row[chart.x])}</span><div className="view-bar-track" role="meter" aria-label={label(chart.x, row[chart.x])} aria-valuemin={min} aria-valuemax={max || (min === 0 ? 1 : 0)} aria-valuenow={value}>
      <span className="view-bar-zero" style={{ left: `${zero}%` }} /><span className="view-bar-value" style={{ left: `${Math.min(zero, end)}%`, width: `${Math.abs(end - zero)}%` }} />
    </div><output>{String(row[chart.y])}</output></div>;
  })}</div>;
}

function Values({ chart, rows, label, fields }: { chart: Chart; rows: ViewRow[]; label: Label; fields?: Record<string, string> }) {
  const [page, setPage] = useState(0), size = 100, pages = Math.ceil(rows.length / size);
  const current = Math.min(page, Math.max(0, pages - 1));
  const excluded = chart.type === "scatter" ? rows.filter(row => row[chart.x] === null || row[chart.y] === null).length : 0;
  return <details className="view-chart-values"><summary>{i18n.t("Source values")}</summary>
    {chart.type === "scatter" && <p>{i18n.t("Rows with null coordinates excluded: {{count}}", { count: excluded })}</p>}
    <ol start={current * size + 1}>{rows.slice(current * size, (current + 1) * size).map((row, i) => <li key={i}>{fields?.[chart.x] ?? chart.x}: {label(chart.x, row[chart.x])}; {fields?.[chart.y] ?? chart.y}: {label(chart.y, row[chart.y])}</li>)}</ol>
    {pages > 1 && <div className="view-chart-pagination"><Button size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>{i18n.t("Previous values")}</Button><span>{current + 1} / {pages}</span><Button size="sm" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>{i18n.t("Next values")}</Button></div>}
  </details>;
}

export function ViewChart({ chart, rows, label, fields }: { chart: Chart; rows: ViewRow[]; label: Label; fields?: Record<string, string> }) {
  return <>{chart.type === "bar" ? <Bars rows={rows} chart={chart} label={label} /> : <Plot chart={chart} rows={rows} label={label} fields={fields} />}<Values chart={chart} rows={rows} label={label} fields={fields} /></>;
}
