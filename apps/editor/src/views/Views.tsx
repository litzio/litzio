import { i18n } from "../i18n.ts";
import { useEffect, useRef, useState } from "react";
import type { ViewRow } from "@litzio/core/views";
import { queryViewSchema, type QueryView as View, type SourceState } from "@litzio/core/views-v2";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog.tsx";
import { Notice, FieldError } from "../ui/primitives.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
import { RotateCw, Star } from "lucide-react";
import type { HostClient } from "../host-client.ts";
import { hostLabel } from "../host-client.ts";
import { STATISTICS_PLUGIN, statisticsView, viewRequest, type ViewResult } from "./view-api.ts";
import { QueryInputs, type InputSchema } from "./QueryInputs.tsx";
import { sourceFailure } from "./source-state.ts";
import "./views.css";

export type ViewTab = { id: string; hostId: string; root: string; view?: View; basic?: boolean; jobs?: boolean; label?: string };
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
  })}</div>;
}
export function ViewRenderer({ view, rows, fields }: { view: View; rows?: ViewRow[]; fields?: Record<string, string> }) {
  const valid = queryViewSchema.parse(view);
  const label = (field: string, value: ViewRow[string]) => valid.sources.stats.operation === "folder.statistics" && value === "." && (field === "folder" || field === "group" && valid.sources.stats.groupBy?.field === "folder")
    ? i18n.t("(Root)") : value === null ? "—" : String(value);
  return <div className="view-panels">{valid.layout.children.map((panel, index) => <section key={index} className="view-panel" aria-label={panel.title}>
    <h3>{panel.title}</h3>
    {!rows?.length ? null : panel.component === "Table" ? <div className="view-table-scroll" tabIndex={0} aria-label={panel.title}><table><thead><tr>{panel.columns.map(column => <th key={column} scope="col">{fields?.[column] ?? column}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{panel.columns.map(column => <td key={column}>{label(column, row[column])}</td>)}</tr>)}</tbody></table></div> : <ViewBars rows={rows} x={panel.x} y={panel.y} label={label} />}
  </section>)}</div>;
}
export function Views({ tab, client, roots, onOpen, onRoot }: { tab: ViewTab; client: HostClient; roots: string[]; onOpen(view: View, root: string, hostId: string, label?: string): void; onRoot(root: string): void }) {
  const root = tab.root, base = tab.view ?? queryViewSchema.parse(statisticsView);
  const [args, setArgs] = useState(base.sources.stats.args);
  const view: View = { ...base, sources: { stats: { ...base.sources.stats, args } } };
  const formElement = useRef<HTMLFormElement>(null);
  const [schema, setSchema] = useState<InputSchema>();
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (Object.keys(inputErrors).length) formElement.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [inputErrors]);
  const [state, setState] = useState<SourceState>("idle");
  const [result, setResult] = useState<ViewResult>(), [problem, setProblem] = useState("");
  const [queriedArgs, setQueriedArgs] = useState<string>();
  const [busy, setBusy] = useState(false), [favourites, setFavourites] = useState<string[]>([]), [saving, setSaving] = useState(false), [name, setName] = useState("");
  const [saveProblem, setSaveProblem] = useState("");
  const lifetime = useRef<AbortController | null>(null), generation = useRef(0);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => { generation.current++; controller.abort(); }; }, []);
  useEffect(() => { generation.current++; setResult(undefined); setState("idle"); setProblem(""); }, [root]);
  const request = async (input: unknown) => {
    const signal = lifetime.current!.signal;
    const value = await viewRequest(client, input, signal);
    signal.throwIfAborted(); return value;
  };
  useEffect(() => {
    if (!base.form) return;
    let alive = true;
    void client.request("/api/views/catalog", { signal: lifetime.current!.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(catalog => {
      const op = catalog.operations?.find((op: { operation: string; version: number }) => op.operation === base.sources.stats.operation && op.version === base.sources.stats.version);
      if (!op) throw new Error();
      if (alive) setSchema(op.inputSchema);
    }).catch(() => { if (alive) setProblem(i18n.t("Input catalog unavailable. Reopen the view after checking the Host.")); });
    return () => { alive = false; };
  }, [client, base.sources.stats.operation, base.sources.stats.version]);
  const queriedAt = result ? new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(result.receipt.timestamp)) : "";
  const list = async () => { const value = await request({ action: "list", plugin: STATISTICS_PLUGIN }); setFavourites(value.favourites ?? []); };
  useEffect(() => {
    if (!tab.basic) return;
    let alive = true;
    const refresh = () => { void request({ action: "list", plugin: STATISTICS_PLUGIN }).then(value => { if (alive) setFavourites(value.favourites ?? []); }).catch(error => { if (alive && !lifetime.current?.signal.aborted) setProblem(sourceFailure(error).message); }); };
    const changed = (event: Event) => { if ((event as CustomEvent).detail === tab.hostId) refresh(); };
    refresh(); window.addEventListener("view-favourites-changed", changed);
    return () => { alive = false; window.removeEventListener("view-favourites-changed", changed); };
  }, [client, tab.basic, tab.hostId]);
  const run = async (action: () => Promise<void>, save = false) => { if (busy) return; setBusy(true); (save ? setSaveProblem : setProblem)(""); try { await action(); } catch (error) { if (!lifetime.current?.signal.aborted) (save ? setSaveProblem : setProblem)(sourceFailure(error).message); } finally { if (!lifetime.current?.signal.aborted) setBusy(false); } };
  const query = async () => {
    if (busy) return;
    const errors: Record<string, string> = {};
    if (view.form) {
      if (!schema) return;
      for (const field of schema.required ?? []) if (!Object.hasOwn(args, field)) errors[field] = i18n.t("Check this value against the operation requirements.");
      for (const control of formElement.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-view-field]") ?? []) {
        if (!control.checkValidity()) errors[control.dataset.viewField!] = i18n.t("Check this value against the operation requirements.");
      }
    }
    setInputErrors(errors);
    if (Object.keys(errors).length) { setState("needs-input"); return; }
    const id = ++generation.current;
    setBusy(true); setProblem(""); setState("loading");
    try {
      const value = await request({ action: "run", root, view });
      if (id !== generation.current) return;
      setResult(value); setQueriedArgs(JSON.stringify(args)); setState(value.rows?.length ? "success" : "empty");
    } catch (error) {
      if (id === generation.current && !lifetime.current?.signal.aborted) { const failure = sourceFailure(error); setProblem(failure.message); setState(failure.state); }
    } finally { if (!lifetime.current?.signal.aborted) setBusy(false); }
  };
  return <div className="views-page" data-testid={tab.basic ? "statistics-view" : "generated-view"}>
    <header><h2>{tab.basic ? i18n.t("Document statistics") : tab.label ?? view.title}</h2><p>{hostLabel(tab.hostId)} · {root || i18n.t("Choose a folder")}</p></header>
    <div className="view-controls">
      <label>{i18n.t("Opened folder")}<select className="form-select settings-select" aria-label={i18n.t("Statistics folder")} value={root} disabled={busy} onChange={event => onRoot(event.target.value)}><option value="">{i18n.t("Choose a folder")}</option>{roots.map(folder => <option key={folder} value={folder}>{folder}</option>)}</select></label>
      {!view.form ? <Button variant="secondary" size="sm" disabled={busy || !root} onClick={() => void query()}>{i18n.t("Refresh data")}</Button> : null}
      {!tab.basic ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setName(view.title); setSaving(true); setSaveProblem(""); }}><Star aria-hidden="true" />{i18n.t("Add to favorites", { defaultValue: "Add to favorites" })}</Button> : <p>{i18n.t("Ask the assistant to generate a view. The basic table stays here.")}</p>}
    </div>
    {view.form ? <form ref={formElement} className="view-query-form" noValidate onSubmit={event => { event.preventDefault(); void query(); }}>
      {schema ? <QueryInputs view={view} schema={schema} errors={inputErrors} change={(field, value, remove) => { setArgs(previous => { const next = { ...previous }; if (remove) delete next[field]; else next[field] = value; return next; }); setInputErrors({}); }} /> : null}
      <FieldError id={`view-form-error-${tab.id}`}>{inputErrors.form}</FieldError>
      <Button type="submit" disabled={busy || !root || !schema}>{view.form.submit.label}</Button>
    </form> : null}
    {state === "loading" ? <Notice>{i18n.t("Loading data…")}</Notice> : state === "idle" ? <Notice>{i18n.t("Data has not been queried. Refresh manually.")}</Notice> : state === "empty" ? <Notice>{i18n.t("No matching rows.")}</Notice> : null}
    {result && (state === "loading" || !!problem || JSON.stringify(args) !== queriedArgs) ? <Notice tone="warning">{i18n.t("Previous query result")} · {queriedAt}{JSON.stringify(args) !== queriedArgs ? ` · ${i18n.t("Search conditions changed")}` : ""}</Notice> : null}
    {problem ? <Notice tone={state === "uncertain" ? "warning" : "error"}>{problem}</Notice> : null}
    <div aria-busy={state === "loading"}><ViewRenderer view={view} rows={result?.rows} fields={result?.fields} /></div>
    {result ? <p className="view-receipt"><Tooltip><TooltipTrigger render={<Button size="sm" variant="ghost" className="text-muted-foreground" aria-label={i18n.t("View receipt")} />}>{i18n.t("Queried: {{time}}", { time: queriedAt })}</TooltipTrigger><TooltipContent className="flex-col items-start break-all"><div>{result.receipt.operation} v{result.receipt.version} · {result.receipt.scope}</div><div>{result.target?.root}</div><div>{result.receipt.timestamp}</div><div>{result.receipt.requestId}</div></TooltipContent></Tooltip></p> : null}
    {tab.basic ? <section className="view-favorites" aria-label={i18n.t("Favorites")}><div className="view-favorites-header"><h3>{i18n.t("Favorites")}</h3><Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={i18n.t("Refresh favorites")} disabled={busy} />} onClick={() => void run(list)}><RotateCw aria-hidden="true" /></TooltipTrigger><TooltipContent>{i18n.t("Refresh favorites")}</TooltipContent></Tooltip></div>{favourites.length ? <ul>{favourites.map(name => <li key={name}><Button variant="ghost" size="sm" title={name} disabled={busy} onClick={() => void run(async () => { const value = await request({ action: "open", plugin: STATISTICS_PLUGIN, name }); onOpen(value.view!, root, tab.hostId, value.name); })}><Star aria-hidden="true" className="view-favorite-icon" /><span className="view-favorite-name">{name}</span></Button></li>)}</ul> : <Notice>{i18n.t("No favorites yet.")}</Notice>}</section> : null}
    <Dialog open={saving} onOpenChange={open => { if (!busy) setSaving(open); }}><DialogContent><DialogHeader><DialogTitle>{i18n.t("Add to favorites", { defaultValue: "Add to favorites" })}</DialogTitle><DialogDescription>{i18n.t("Save the current inputs, including conditions not yet queried. Reopening restores inputs without querying.", { defaultValue: "Save the current inputs, including conditions not yet queried. Reopening restores inputs without querying." })}</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); void run(async () => { await request({ action: "save", plugin: STATISTICS_PLUGIN, name, view }); window.dispatchEvent(new CustomEvent("view-favourites-changed", { detail: tab.hostId })); setSaving(false); }, true); }}><label>{i18n.t("New favorite name")}<Input autoFocus aria-label={i18n.t("New favorite name")} aria-invalid={!!saveProblem} aria-describedby={saveProblem ? `view-save-error-${tab.id}` : undefined} value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label><FieldError id={`view-save-error-${tab.id}`}>{saveProblem}</FieldError><div className="view-controls"><Button type="submit" disabled={busy || !name.trim()}>{i18n.t("Add favorite")}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setSaving(false)}>{i18n.t("Cancel")}</Button></div></form></DialogContent></Dialog>
  </div>;
}
