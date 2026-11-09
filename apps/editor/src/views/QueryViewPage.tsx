import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { builtinViewOperations } from "@litzio/core/views";
import { operationQueryViewSchema as queryViewSchema, compilePortableViewInputSchema, validateViewInputs, ViewInputError, type ViewOperation, type OperationQueryView as View, type SourceState } from "@litzio/core/views-v2";
import { i18n } from "../i18n.ts";
import { Button } from "../components/ui/button.tsx";
import { Notice, FieldError } from "../ui/primitives.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
import { hostRegistry, hostLabel } from "../host-client.ts";
import { STATISTICS_PLUGIN, statisticsView, viewRequest, readViewCatalog, type ViewResult } from "./view-api.ts";
import { useQueryViewFavorites } from "./QueryViewFavorites.tsx";
import { QueryInputs, type InputSchema } from "./QueryInputs.tsx";
import { sourceFailure, inputIssueMessage } from "./source-state.ts";
import { ViewRenderer } from "./ViewRenderer.tsx";
import type { ViewTab, ViewsProps } from "./view-page.ts";
import "./views.css";

const emptyInputErrors = () => ({ fields: Object.create(null) as Record<string, string> });
export function QueryViewPage({ tab, client, roots, onOpen, onRoot, unavailable:explicitUnavailable }: Omit<ViewsProps, "tab"> & { tab: Omit<ViewTab, "view"> & { view?: View } }) {
  useSyncExternalStore(hostRegistry.subscribe,hostRegistry.snapshot,hostRegistry.snapshot);
  const unavailable=explicitUnavailable || hostRegistry.get(tab.hostId).state !== "connected";
  const root = tab.root, base = tab.view ?? queryViewSchema.parse(statisticsView);
  // Stage 1 plugin operations are host-scoped; only the built-in statistics source uses a folder.
  const needsRoot = base.sources.stats.operation === "folder.statistics";
  const [args, setArgs] = useState(base.sources.stats.args);
  const view: View = { ...base, sources: { stats: { ...base.sources.stats, args } } };
  const formElement = useRef<HTMLFormElement>(null);
  const [catalogOperation, setOperation] = useState<ViewOperation & { plugin: string }>();
  const builtin = builtinViewOperations.find(op => op.operation === base.sources.stats.operation && op.version === base.sources.stats.version);
  const operation = catalogOperation ?? (builtin ? { ...builtin, plugin: STATISTICS_PLUGIN } : undefined);
  const schema = operation?.inputSchema as InputSchema | undefined;
  const owner = base.sources.stats.operation === "folder.statistics" ? STATISTICS_PLUGIN : operation?.plugin;
  const [inputErrors, setInputErrors] = useState<{ fields: Record<string, string>; common?: string }>(emptyInputErrors);
  useEffect(() => { if (Object.keys(inputErrors.fields).length) formElement.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [inputErrors]);
  const [state, setState] = useState<SourceState>("idle");
  const [result, setResult] = useState<ViewResult>(), [problem, setProblem] = useState("");
  const [queriedArgs, setQueriedArgs] = useState<string>();
  const [busy, setBusy] = useState(false);
  const lifetime = useRef<AbortController | null>(null), generation = useRef(0);
  useEffect(() => hostRegistry.subscribe(() => {
    if (hostRegistry.get(tab.hostId).state !== "connected") { generation.current++; setBusy(false); setState("unavailable"); setProblem(i18n.t("Unavailable")); }
  }), [tab.hostId]);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => { generation.current++; controller.abort(); }; }, []);
  useEffect(() => { if(unavailable){generation.current++;setBusy(false);setState("unavailable");setProblem(i18n.t("Unavailable"));} },[unavailable]);
  useEffect(() => { generation.current++; setResult(undefined); setState("idle"); setProblem(""); }, [root]);
  const request = async (input: unknown) => {
    const signal = lifetime.current!.signal;
    const value = await viewRequest(client, input, signal);
    signal.throwIfAborted(); return value;
  };
  useEffect(() => {
    if (base.sources.stats.operation === "folder.statistics") return;
    let alive = true;
    void readViewCatalog(client, lifetime.current!.signal).then(catalog => {
      const op = catalog.operations?.find((op: { operation: string; version: number }) => op.operation === base.sources.stats.operation && op.version === base.sources.stats.version);
      if (!op || typeof op.plugin !== "string" || !op.plugin) throw new Error();
      if (alive) setOperation({ ...op, plugin: op.plugin, validateArgs: compilePortableViewInputSchema(op.inputSchema) });
    }).catch(() => { if (alive) setProblem(i18n.t("Input catalog unavailable. Reopen the view after checking the Host.")); });
    return () => { alive = false; };
  }, [client, base.sources.stats.operation, base.sources.stats.version]);
  const queriedAt = result ? new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(result.receipt.timestamp)) : "";
  const favorites = useQueryViewFavorites({ tab, view, owner, request, busy, setBusy, lifetime, root, onOpen, setProblem, client });
  const showInputErrors = (error: unknown) => {
    const fields: Record<string, string> = Object.create(null);
    let common: string | undefined;
    if (error instanceof ViewInputError) for (const issue of error.inputIssues) {
      const name = issue.field?.startsWith("/") ? issue.field.split("/")[1].replaceAll("~1", "/").replaceAll("~0", "~") : undefined;
      if (name && view.form?.fields.some(f => f.field === name)) fields[name] ??= inputIssueMessage(issue.keyword, schema?.properties?.[name]);
      else common ??= inputIssueMessage(issue.keyword);
    }
    if (!Object.keys(fields).length && !common) common = i18n.t("Check this value against the operation requirements.");
    setInputErrors({ fields, common }); setProblem(""); setState("needs-input");
  };
  const query = async () => {
    if (busy || unavailable) return;
    setInputErrors(emptyInputErrors());
    {
      if (!operation) return;
      try { validateViewInputs(view, operation, "execute", compilePortableViewInputSchema); }
      catch (error) { showInputErrors(error); return; }
    }
    const id = ++generation.current;
    setBusy(true); setProblem(""); setState("loading");
    try {
      const value = await request({ action: "run", ...(needsRoot ? { root } : {}), view });
      if (id !== generation.current) return;
      setResult(value); setQueriedArgs(JSON.stringify(args)); setState(value.rows?.length ? "success" : "empty");
    } catch (error) {
      if (id === generation.current && !lifetime.current?.signal.aborted) { if (error instanceof ViewInputError) showInputErrors(error); else { const failure = sourceFailure(error); setProblem(failure.message); setState(failure.state); } }
    } finally { if (!lifetime.current?.signal.aborted) setBusy(false); }
  };
  return <div className="views-page" data-testid={tab.basic ? "statistics-view" : "generated-view"}>
    <header><h2>{tab.basic ? i18n.t("Document statistics") : tab.label ?? view.title}</h2><p>{hostLabel(tab.hostId)}{needsRoot ? ` · ${root || i18n.t("Choose a folder")}` : ""}</p></header>
    <div className="view-controls">
      {needsRoot ? <label>{i18n.t("Opened folder")}<select className="form-select settings-select" aria-label={i18n.t("Statistics folder")} value={root} disabled={busy} onChange={event => onRoot(event.target.value)}><option value="">{i18n.t("Choose a folder")}</option>{roots.map(folder => <option key={folder} value={folder}>{folder}</option>)}</select></label> : null}
      {!view.form ? <Button variant="secondary" size="sm" disabled={unavailable || busy || (needsRoot && !root) || !operation} onClick={() => void query()}>{i18n.t("Refresh data")}</Button> : null}
      {favorites.actions}
    </div>
    {view.form ? <form ref={formElement} className="view-query-form" noValidate onSubmit={event => { event.preventDefault(); void query(); }}>
      {schema ? <QueryInputs client={unavailable ? undefined : client} suggestions={operation?.inputSuggestions} view={view} schema={schema} errors={inputErrors.fields} change={(field, value, remove) => { setArgs(previous => { const next = { ...previous }; if (remove) delete next[field]; else next[field] = value; return next; }); setInputErrors(emptyInputErrors()); }} /> : null}
      <div className="form-actions view-query-actions"><Button type="submit" disabled={unavailable || busy || (needsRoot && !root) || !schema}>{view.form.submit.label}</Button></div>
    </form> : null}
    <FieldError id={`view-input-error-${tab.id}`}>{inputErrors.common}</FieldError>
    {state === "loading" ? <Notice>{i18n.t("Loading data…")}</Notice> : state === "idle" ? <Notice>{i18n.t("Data has not been queried. Refresh manually.")}</Notice> : state === "empty" ? <Notice>{i18n.t("No matching rows.")}</Notice> : null}
    {result && (state === "loading" || state === "needs-input" || !!problem || JSON.stringify(args) !== queriedArgs) ? <Notice tone="warning">{i18n.t("Previous query result")} · {queriedAt}{JSON.stringify(args) !== queriedArgs ? ` · ${i18n.t("Search conditions changed")}` : ""}</Notice> : null}
    {problem ? <Notice tone={state === "uncertain" ? "warning" : "error"}>{problem}</Notice> : null}
    <div aria-busy={state === "loading"}><ViewRenderer key={result?.receipt.requestId ?? "idle"} view={view} rows={result?.rows} fields={result?.fields} fieldTypes={operation ? {...operation.rowSchema,...(view.sources.stats.groupBy?{group:operation.rowSchema[view.sources.stats.groupBy.field]}:{})} : undefined} /></div>
    {result ? <p className="view-receipt"><Tooltip><TooltipTrigger render={<Button size="sm" variant="ghost" className="text-muted-foreground" aria-label={i18n.t("View receipt")} />}>{i18n.t("Queried: {{time}}", { time: queriedAt })}</TooltipTrigger><TooltipContent className="flex-col items-start break-all"><div>{result.receipt.operation} v{result.receipt.version} · {result.receipt.scope}</div><div>{result.target?.root}</div><div>{result.receipt.timestamp}</div><div>{result.receipt.requestId}</div></TooltipContent></Tooltip></p> : null}
    {favorites.list}
    {favorites.dialog}
  </div>;
}
