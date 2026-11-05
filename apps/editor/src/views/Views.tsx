import { i18n } from "../i18n.ts";
import { useEffect, useRef, useState } from "react";
import { viewSchema, validateView, type View, type ViewRow } from "@litzio/core/views";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog.tsx";
import { Notice } from "../ui/primitives.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
import { RotateCw, Star } from "lucide-react";
import type { HostClient } from "../host-client.ts";
import { hostLabel } from "../host-client.ts";
import { STATISTICS_PLUGIN, statisticsView, viewRequest, type ViewResult } from "./view-api.ts";
import "./views.css";

export type ViewTab = { id: string; hostId: string; root: string; view?: View; basic?: boolean; label?: string };
function ViewBars({ rows, x, y, label }: { rows: ViewRow[]; x: string; y: string; label(field: string, value: ViewRow[string]): string }) {
  const values = rows.map(row => Number(row[y]));
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const scale = Math.max(1, Math.abs(min), Math.abs(max));
  const range = (max / scale - min / scale) || 1;
  const position = (value: number) => (value / scale - min / scale) / range * 100;
  const zero = position(0);
  return <div className="view-bars">{rows.map((row, i) => {
    const value = values[i], end = position(value);
    return <div key={i}><span>{label(x, row[x])}</span><div className="view-bar-track" role="meter" aria-label={label(x, row[x])} aria-valuemin={min} aria-valuemax={max || (min === 0 ? 1 : 0)} aria-valuenow={value}>
      <span className="view-bar-zero" style={{ left: `${zero}%` }} />
      <span className="view-bar-value" style={{ left: `${Math.min(zero, end)}%`, width: `${Math.abs(end - zero)}%` }} />
    </div><output>{String(row[y])}</output></div>;
  })}{!rows.length ? <p>{i18n.t("No matching rows.")}</p> : null}</div>;
}
export function ViewRenderer({ view, rows, fields }: { view: View; rows?: ViewRow[]; fields?: Record<string, string> }) {
  // Target Host validates operation semantics; renderer checks catalog structure.
  const valid = viewSchema.parse(view);
  const label = (field: string, value: ViewRow[string]) => valid.sources.stats.operation === "folder.statistics" && value === "." && (field === "folder" || field === "group" && valid.sources.stats.groupBy?.field === "folder")
    ? i18n.t("(Root)") : value === null ? "—" : String(value);
  return <div className="view-panels">{valid.layout.children.map((panel, index) => <section key={index} className="view-panel" aria-label={panel.title}>
    <h3>{panel.title}</h3>
    {rows === undefined ? <p>{i18n.t("Data has not been queried. Refresh manually.")}</p> : panel.component === "Table" ? <div className="view-table-scroll"><table><thead><tr>{panel.columns.map(column => <th key={column} scope="col">{fields?.[column] ?? column}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{panel.columns.map(column => <td key={column}>{label(column, row[column])}</td>)}</tr>)}</tbody></table>{!rows.length ? <p>{i18n.t("No matching rows.")}</p> : null}</div> : <ViewBars rows={rows} x={panel.x} y={panel.y} label={label} />}
  </section>)}</div>;
}
export function Views({ tab, client, roots, onOpen, onRoot }: { tab: ViewTab; client: HostClient; roots: string[]; onOpen(view: View, root: string, hostId: string, label?: string): void; onRoot(root: string): void }) {
  const root = tab.root;
  const [result, setResult] = useState<ViewResult>(), [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false), [favourites, setFavourites] = useState<string[]>([]), [saving, setSaving] = useState(false), [name, setName] = useState("");
  const view = tab.view ?? validateView(statisticsView);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  const request = async (input: unknown) => {
    const signal = lifetime.current!.signal;
    const value = await viewRequest(client, input, signal);
    signal.throwIfAborted(); return value;
  };
  const queriedAt = result ? new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(result.receipt.timestamp)) : "";
  const list = async () => { const value = await request({ action: "list", plugin: STATISTICS_PLUGIN }); setFavourites(value.favourites ?? []); };
  useEffect(() => {
    if (!tab.basic) return;
    let alive = true;
    const refresh = () => { void request({ action: "list", plugin: STATISTICS_PLUGIN }).then(value => { if (alive) setFavourites(value.favourites ?? []); }).catch(error => { if (alive && !lifetime.current?.signal.aborted) setProblem(String(error)); }); };
    const changed = (event: Event) => { if ((event as CustomEvent).detail === tab.hostId) refresh(); };
    refresh(); window.addEventListener("view-favourites-changed", changed);
    return () => { alive = false; window.removeEventListener("view-favourites-changed", changed); };
  }, [client, tab.basic, tab.hostId]);
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); setProblem(""); try { await action(); } catch (error) { if (!lifetime.current?.signal.aborted) setProblem(String(error)); } finally { if (!lifetime.current?.signal.aborted) setBusy(false); } };
  return <div className="views-page" data-testid={tab.basic ? "statistics-view" : "generated-view"}>
    <header><h2>{tab.basic ? i18n.t("Document statistics") : tab.label ?? view.title}</h2><p>{hostLabel(tab.hostId)} · {root || i18n.t("Choose a folder")}</p></header>
    <div className="view-controls">
      <label>{i18n.t("Opened folder")}<select aria-label={i18n.t("Statistics folder")} value={root} disabled={busy} onChange={event => { onRoot(event.target.value); setResult(undefined); }}><option value="">{i18n.t("Choose a folder")}</option>{roots.map(folder => <option key={folder} value={folder}>{folder}</option>)}</select></label>
      <Button variant="secondary" size="sm" disabled={busy || !root} onClick={() => void run(async () => setResult(await request({ action: "run", root, view })))}>{i18n.t("Refresh data")}</Button>
      {!tab.basic ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setName(view.title); setSaving(true); setProblem(""); }}>{i18n.t("★ Add to favorites")}</Button> : <p>{i18n.t("Ask the assistant to generate a view. The basic table stays here.")}</p>}
    </div>
    {problem ? <Notice tone="error">{problem}</Notice> : null}
    <ViewRenderer view={view} rows={result?.rows} fields={result?.fields} />
    {result ? <p className="view-receipt"><Tooltip><TooltipTrigger render={<Button size="sm" variant="ghost" className="text-muted-foreground" aria-label={i18n.t("View receipt")} />}>{i18n.t("Queried: {{time}}", { time: queriedAt })}</TooltipTrigger><TooltipContent className="flex-col items-start break-all"><div>{result.receipt.operation} v{result.receipt.version} · {result.receipt.scope}</div><div>{result.target?.root}</div><div>{result.receipt.timestamp}</div><div>{result.receipt.requestId}</div></TooltipContent></Tooltip></p> : null}
    {tab.basic ? <section className="view-favorites" aria-label={i18n.t("Favorites")}><div className="view-favorites-header"><h3>{i18n.t("Favorites")}</h3><Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={i18n.t("Refresh favorites")} disabled={busy} />} onClick={() => void run(list)}><RotateCw aria-hidden="true" /></TooltipTrigger><TooltipContent>{i18n.t("Refresh favorites")}</TooltipContent></Tooltip></div>{favourites.length ? <ul>{favourites.map(name => <li key={name}><Button variant="ghost" size="sm" title={name} disabled={busy} onClick={() => void run(async () => { const value = await request({ action: "open", plugin: STATISTICS_PLUGIN, name }); onOpen(value.view!, root, tab.hostId, value.name); })}><Star aria-hidden="true" className="view-favorite-icon" /><span className="view-favorite-name">{name}</span></Button></li>)}</ul> : <p>{i18n.t("No favorites yet.")}</p>}</section> : null}
    <Dialog open={saving} onOpenChange={open => { if (!busy) setSaving(open); }}><DialogContent><DialogHeader><DialogTitle>{i18n.t("★ Add to favorites")}</DialogTitle><DialogDescription>{i18n.t("Save this definition and query with a new name. Data is queried only when you refresh.")}</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); void run(async () => { await request({ action: "save", plugin: STATISTICS_PLUGIN, name, view }); window.dispatchEvent(new CustomEvent("view-favourites-changed", { detail: tab.hostId })); setSaving(false); }); }}><label>{i18n.t("New favorite name")}<Input autoFocus aria-label={i18n.t("New favorite name")} aria-invalid={!!problem} aria-describedby={problem ? `view-save-error-${tab.id}` : undefined} value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label>{problem ? <p id={`view-save-error-${tab.id}`} role="alert">{problem}</p> : null}<div className="view-controls"><Button type="submit" disabled={busy || !name.trim()}>{i18n.t("Add favorite")}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setSaving(false)}>{i18n.t("Cancel")}</Button></div></form></DialogContent></Dialog>
  </div>;
}
