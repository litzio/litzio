import { i18n } from "../i18n.ts";
import { useEffect, useState } from "react";
import { validateView, type View, type ViewRow } from "@litzio/core/views";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog.tsx";
import { Notice } from "../ui/primitives.tsx";
import type { HostClient } from "../host-client.ts";
import { hostLabel } from "../host-client.ts";
import { STATISTICS_PLUGIN, statisticsView, viewRequest, type ViewResult } from "./view-api.ts";
import "./views.css";

export type ViewTab = { id: string; hostId: string; root: string; view?: View; basic?: boolean; label?: string };
export function ViewRenderer({ view, rows }: { view: View; rows?: ViewRow[] }) {
  const valid = validateView(view);
  return <div className="view-panels">{valid.layout.children.map((panel, index) => <section key={index} className="view-panel" aria-label={panel.title}>
    <h3>{panel.title}</h3>
    {rows === undefined ? <p>{i18n.t("Data has not been queried. Refresh manually.")}</p> : panel.component === "Table" ? <div className="view-table-scroll"><table><thead><tr>{panel.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{panel.columns.map(column => <td key={column}>{row[column] === null ? "—" : String(row[column])}</td>)}</tr>)}</tbody></table>{!rows.length ? <p>{i18n.t("No matching rows.")}</p> : null}</div> : <div className="view-bars">{rows.map((row, i) => <div key={i}><span>{String(row[panel.x] ?? "—")}</span><meter aria-label={String(row[panel.x] ?? "—")} min={0} max={Math.max(1, ...rows.map(r => Number(r[panel.y])))} value={Number(row[panel.y])} /><output>{String(row[panel.y])}</output></div>)}{!rows.length ? <p>{i18n.t("No matching rows.")}</p> : null}</div>}
  </section>)}</div>;
}
export function Views({ tab, client, roots, onOpen, onRoot }: { tab: ViewTab; client: HostClient; roots: string[]; onOpen(view: View, root: string, hostId: string, label?: string): void; onRoot(root: string): void }) {
  const root = tab.root;
  const [result, setResult] = useState<ViewResult>(), [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false), [favourites, setFavourites] = useState<string[]>([]), [saving, setSaving] = useState(false), [name, setName] = useState("");
  const view = tab.view ?? validateView(statisticsView);
  const list = async () => { const value = await viewRequest(client, { action: "list", plugin: STATISTICS_PLUGIN }); setFavourites(value.favourites ?? []); };
  useEffect(() => {
    if (!tab.basic) return;
    let alive = true;
    const refresh = () => { void viewRequest(client, { action: "list", plugin: STATISTICS_PLUGIN }).then(value => { if (alive) setFavourites(value.favourites ?? []); }).catch(error => { if (alive) setProblem(String(error)); }); };
    const changed = (event: Event) => { if ((event as CustomEvent).detail === tab.hostId) refresh(); };
    refresh(); window.addEventListener("view-favourites-changed", changed);
    return () => { alive = false; window.removeEventListener("view-favourites-changed", changed); };
  }, [client, tab.basic, tab.hostId]);
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); setProblem(""); try { await action(); } catch (error) { setProblem(String(error)); } finally { setBusy(false); } };
  return <div className="views-page" data-testid={tab.basic ? "statistics-view" : "generated-view"}>
    <header><h2>{tab.basic ? i18n.t("Document statistics") : tab.label ?? view.title}</h2><p>{hostLabel(tab.hostId)} · {root || i18n.t("Choose a folder")}</p></header>
    <div className="view-controls">
      <label>{i18n.t("Opened folder")}<select aria-label={i18n.t("Statistics folder")} value={root} disabled={busy} onChange={event => { onRoot(event.target.value); setResult(undefined); }}><option value="">{i18n.t("Choose a folder")}</option>{roots.map(folder => <option key={folder} value={folder}>{folder}</option>)}</select></label>
      <Button variant="secondary" size="sm" disabled={busy || !root} onClick={() => void run(async () => setResult(await viewRequest(client, { action: "run", root, view })))}>{i18n.t("Refresh data")}</Button>
      {!tab.basic ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setName(""); setSaving(true); setProblem(""); }}>{i18n.t("★ Add to favourites")}</Button> : <p>{i18n.t("Ask the assistant to generate a view. The basic table stays here.")}</p>}
    </div>
    {problem ? <Notice tone="error">{problem}</Notice> : null}
    <ViewRenderer view={view} rows={result?.rows} />
    {result ? <p className="view-receipt" aria-label={i18n.t("View receipt")}>{result.receipt.operation} v{result.receipt.version} · {result.target?.root} · {result.receipt.timestamp} · {result.receipt.requestId}</p> : null}
    {tab.basic ? <section className="view-favourites" aria-label={i18n.t("Favourite views")}><h3>{i18n.t("Favourite views")}</h3><Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(list)}>{i18n.t("Refresh favourites")}</Button>{favourites.length ? <ul>{favourites.map(name => <li key={name}><Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(async () => { const value = await viewRequest(client, { action: "open", plugin: STATISTICS_PLUGIN, name }); onOpen(value.view!, root, tab.hostId, value.name); })}>{name}</Button></li>)}</ul> : <p>{i18n.t("No favourite views yet.")}</p>}</section> : null}
    <Dialog open={saving} onOpenChange={open => { if (!busy) setSaving(open); }}><DialogContent><DialogHeader><DialogTitle>{i18n.t("★ Add to favourites")}</DialogTitle><DialogDescription>{i18n.t("Save this definition and query with a new name. Data is queried only when you refresh.")}</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); void run(async () => { await viewRequest(client, { action: "save", plugin: STATISTICS_PLUGIN, name, view }); window.dispatchEvent(new CustomEvent("view-favourites-changed", { detail: tab.hostId })); setSaving(false); }); }}><label>{i18n.t("New favourite name")}<Input autoFocus aria-label={i18n.t("New favourite name")} aria-invalid={!!problem} aria-describedby={problem ? `view-save-error-${tab.id}` : undefined} value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label>{problem ? <p id={`view-save-error-${tab.id}`} role="alert">{problem}</p> : null}<div className="view-controls"><Button type="submit" disabled={busy || !name.trim()}>{i18n.t("Add favourite")}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setSaving(false)}>{i18n.t("Cancel")}</Button></div></form></DialogContent></Dialog>
  </div>;
}
