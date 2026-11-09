import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { compilePortableViewInputSchema, validateViewInputs, ViewInputError, type ViewOperation, type OperationQueryView as View, type SourceState } from "@litzio/core/views-v2";
import { i18n } from "../i18n.ts";
import { Button } from "../components/ui/button.tsx";
import { Notice, FieldError } from "../ui/primitives.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
import { hostRegistry, hostLabel } from "../host-client.ts";
import { viewRequest, readViewCatalog, type ViewResult } from "./view-api.ts";
import { QueryInputs, type InputSchema } from "./QueryInputs.tsx";
import { sourceFailure, inputIssueMessage } from "./source-state.ts";
import { ViewRenderer } from "./ViewRenderer.tsx";
import type { ViewTab, ViewsProps } from "./view-page.ts";
import "./views.css";

const emptyInputErrors = () => ({ fields: Object.create(null) as Record<string, string> });
export function QueryViewPage({ tab, client, unavailable:explicitUnavailable }: Omit<ViewsProps, "tab"> & { tab: Omit<ViewTab, "view"> & { view: View } }) {
  useSyncExternalStore(hostRegistry.subscribe,hostRegistry.snapshot,hostRegistry.snapshot);
  const unavailable=explicitUnavailable || hostRegistry.get(tab.hostId).state !== "connected";
  const base = tab.view;
  const [args, setArgs] = useState(base.sources.stats.args);
  const view: View = { ...base, sources: { stats: { ...base.sources.stats, args } } };
  const [catalogOperation, setOperation] = useState<ViewOperation & { plugin: string }>();
  const operation = catalogOperation;
  const schema = operation?.inputSchema as InputSchema | undefined;
  const [inputErrors, setInputErrors] = useState<{ fields: Record<string, string>; common?: string }>(emptyInputErrors);
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
  const request = async (input: unknown) => {
    const signal = lifetime.current!.signal;
    const value = await viewRequest(client, input, signal);
    signal.throwIfAborted(); return value;
  };
  useEffect(() => {
    let alive = true;
    void readViewCatalog(client, lifetime.current!.signal).then(catalog => {
      const op = catalog.operations?.find((op: { operation: string; version: number }) => op.operation === base.sources.stats.operation && op.version === base.sources.stats.version);
      if (!op || typeof op.plugin !== "string" || !op.plugin) throw new Error();
      if (alive) setOperation({ ...op, plugin: op.plugin, validateArgs: compilePortableViewInputSchema(op.inputSchema) });
    }).catch(() => { if (alive) setProblem(i18n.t("Input catalog unavailable. Reopen the view after checking the Host.")); });
    return () => { alive = false; };
  }, [client, base.sources.stats.operation, base.sources.stats.version]);
  const queriedAt = result ? new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(result.receipt.timestamp)) : "";
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
      const value = await request({ action: "run", view });
      if (id !== generation.current) return;
      setResult(value); setQueriedArgs(JSON.stringify(args)); setState(value.rows?.length ? "success" : "empty");
    } catch (error) {
      if (id === generation.current && !lifetime.current?.signal.aborted) { if (error instanceof ViewInputError) showInputErrors(error); else { const failure = sourceFailure(error); setProblem(failure.message); setState(failure.state); } }
    } finally { if (!lifetime.current?.signal.aborted) setBusy(false); }
  };
  return <div className="views-page" data-testid="plugin-query-view">
    {!tab.screen ? <header><h1>{tab.label ?? view.title}</h1><p>{hostLabel(tab.hostId)}</p></header> : null}
    {!view.form ? <div className="view-controls"><Button variant="secondary" size="sm" disabled={unavailable || busy || !operation} onClick={() => void query()}>{i18n.t("Refresh data")}</Button></div> : null}
    {view.form ? <form className="view-query-form" noValidate onSubmit={event => { event.preventDefault(); void query(); }}>
      {schema ? <QueryInputs actions={<Button type="submit" disabled={unavailable || busy || !schema}>{view.form.submit.label}</Button>} client={unavailable ? undefined : client} suggestions={operation?.inputSuggestions} hints={operation?.inputHints} view={view} schema={schema} errors={inputErrors.fields} change={(field, value, remove) => { setArgs(previous => { const next = { ...previous }; if (remove) delete next[field]; else next[field] = value; return next; }); setInputErrors(emptyInputErrors()); }} /> : null}
    </form> : null}
    <FieldError id={`view-input-error-${tab.id}`}>{inputErrors.common}</FieldError>
    {state === "loading" ? <Notice>{i18n.t("Loading data…")}</Notice> : state === "idle" ? <Notice>{i18n.t("Data has not been queried. Refresh manually.")}</Notice> : state === "empty" ? <Notice>{i18n.t("No matching rows.")}</Notice> : null}
    {result && (state === "loading" || state === "needs-input" || !!problem || JSON.stringify(args) !== queriedArgs) ? <Notice tone="warning">{i18n.t("Previous query result")} · {queriedAt}{JSON.stringify(args) !== queriedArgs ? ` · ${i18n.t("Search conditions changed")}` : ""}</Notice> : null}
    {problem ? <Notice tone={state === "uncertain" ? "warning" : "error"}>{problem}</Notice> : null}
    <div aria-busy={state === "loading"}><ViewRenderer key={result?.receipt.requestId ?? "idle"} view={view} coverage={result?.coverage} columnScope={operation && !view.sources.stats.groupBy ? JSON.stringify([tab.hostId, operation.plugin, tab.screen?.id ?? base.sources.stats.operation]) : undefined} columnFields={operation?.rowSchema} rows={result?.rows} fields={result?.fields} fieldTypes={operation ? {...operation.rowSchema,...(view.sources.stats.groupBy?{group:operation.rowSchema[view.sources.stats.groupBy.field]}:{})} : undefined} /></div>
    {result ? <p className="view-receipt"><Tooltip><TooltipTrigger render={<Button size="sm" variant="ghost" className="text-muted-foreground" aria-label={i18n.t("View receipt")} />}>{i18n.t("Queried: {{time}}", { time: queriedAt })}</TooltipTrigger><TooltipContent className="flex-col items-start break-all"><div>{result.receipt.operation} v{result.receipt.version} · {result.receipt.scope}</div><div>{result.receipt.timestamp}</div><div>{result.receipt.requestId}</div></TooltipContent></Tooltip></p> : null}
  </div>;
}
