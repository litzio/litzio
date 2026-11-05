import { validateView, rowsSchema, type ViewRow } from "@litzio/core";
const cell = (row: ViewRow, field: string) => (row as unknown as Record<string, string | number | null>)[field];
export function ViewRenderer({ spec, data }: { spec: unknown; data: ViewRow[] }) {
  const view = validateView(spec), rows = rowsSchema.parse(data);
  return <div className="view-panels"><h2>{view.title}</h2>{view.layout.children.map((panel, i) => <section className="view-card" key={i}>
    <h3>{panel.title}</h3>{panel.component === "Table" ? <table><thead><tr>{panel.columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={String(cell(row, "folder") ?? cell(row, "setting"))}>{panel.columns.map(c => <td key={c}>{cell(row, c) ?? "—"}</td>)}</tr>)}</tbody></table> : <div role="img" aria-label={panel.title}>{rows.map(row => <div className="view-bar" key={String(cell(row, "folder") ?? cell(row, "setting"))}><span>{String(cell(row, "folder") ?? cell(row, "setting"))}</span><meter min={0} max={Math.max(1, ...rows.map(r => Number(cell(r, panel.y))))} value={Number(cell(row, panel.y))} /><strong>{Number(cell(row, panel.y))}</strong></div>)}</div>}
  </section>)}</div>;
}
