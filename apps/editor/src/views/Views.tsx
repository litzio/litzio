import { AssistantDataDetails } from "./AssistantDataDetails.tsx";
import { type ViewRootBinding } from "./view-provenance.ts";
import { DataTable, type TableField } from "../components/DataTable.tsx";
import { i18n } from "../i18n.ts";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { builtinViewOperations, type ViewRow } from "@litzio/core/views";
import { queryViewSchema as allQueryViewSchema, operationQueryViewSchema as queryViewSchema, compilePortableViewInputSchema, validateViewInputs, ViewInputError, type ViewOperation, type CatalogView, type OperationQueryView as View, type SourceState } from "@litzio/core/views-v2";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog.tsx";
import { Notice, FieldError } from "../ui/primitives.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
import { RotateCw, Star } from "lucide-react";
import type { HostClient } from "../host-client.ts";
import { hostRegistry, hostLabel } from "../host-client.ts";
import { STATISTICS_PLUGIN, statisticsView, viewRequest, readViewCatalog, type ViewResult } from "./view-api.ts";
import { QueryInputs, type InputSchema } from "./QueryInputs.tsx";
import { sourceFailure, inputIssueMessage } from "./source-state.ts";
import { ReviewRenderer, type ReviewAdapter } from "../review/ReviewRenderer.tsx";
import { createReviewAdapter, type ReviewObservation } from "./review-api.ts";
import { readableLabel } from "./view-label.ts";
import "./views.css";
import { ViewChart } from "./ViewChart.tsx";
import { ViewPanels } from "./ViewPanels.tsx";

export type ViewTab = { id: string; hostId: string; root: string; view?: CatalogView; basic?: boolean; jobs?: boolean; label?: string; screen?: import("./view-api.ts").ViewScreen };
export function ViewRenderer({ view, rows, fields, fieldTypes }: { view: Extract<CatalogView, {profile: "query"}>; rows?: ViewRow[]; fields?: Record<string, string>; fieldTypes?: Record<string, TableField> }) {
  const valid = allQueryViewSchema.parse(view);
  const label = (field: string, value: ViewRow[string]) => valid.sources.stats.kind === "operation" && valid.sources.stats.operation === "folder.statistics" && value === "." && (field === "folder" || field === "group" && valid.sources.stats.groupBy?.field === "folder")
    ? i18n.t("(Root)") : value === null ? "—" : String(value);
  return <ViewPanels layout={valid.layout} renderLeaf={(panel, index) => <section key={index} className="view-panel" aria-label={panel.title}>
    <h3>{panel.title}</h3>
    {!rows?.length ? null : panel.component === "Table" ? <DataTable rows={rows} columns={panel.columns} title={panel.title} labels={fields} fields={valid.sources.stats.kind === "assistant" ? valid.sources.stats.rowSchema : fieldTypes} label={label} loadedOnly={valid.refresh === "manual"} /> : <ViewChart chart={panel} rows={rows} label={label} fields={fields} />}
  </section>} />;
}
const emptyInputErrors = () => ({ fields: Object.create(null) as Record<string, string> });

type ViewsProps = { provenanceRoots?: readonly ViewRootBinding[]; unavailable?: boolean; onGenerate?(view?: CatalogView):void; tab: ViewTab; client: HostClient; roots: string[]; onOpen(view: CatalogView, root: string, hostId: string, label?: string): void; onRoot(root: string): void; onOpenDocument?(path: string, hostId: string): void };
export function Views(props: ViewsProps) {
  const identity = useRef({view:props.tab.view,hostId:props.tab.hostId,revision:0});
  if(identity.current.view !== props.tab.view || identity.current.hostId !== props.tab.hostId) identity.current={view:props.tab.view,hostId:props.tab.hostId,revision:identity.current.revision+1};
  return <ViewInstance key={identity.current.revision} {...props} />;
}
function ViewInstance(props: ViewsProps) {
  return props.tab.view?.profile === "review" ? <ReviewViewPage key={`${props.tab.hostId}:${props.tab.root}:${props.tab.view.sources.review.plugin}:${props.tab.view.sources.review.review}:${props.tab.view.sources.review.bundleRef}`} {...props} view={props.tab.view} /> : props.tab.view?.refresh === "assistant" ? <AssistantView {...props} view={props.tab.view} /> : <QueryViews {...props} tab={{ ...props.tab, view: props.tab.view }} />;
}
function ReviewViewPage({ tab, view, client, onOpenDocument }: ViewsProps & { view: Extract<CatalogView, { profile: "review" }> }) {
  const [adapter, setAdapter] = useState<ReviewAdapter>();
  const observation = useRef<ReviewObservation>({});
  const openDocument = useRef(onOpenDocument);
  openDocument.current = onOpenDocument;
  useEffect(() => {
    const controller = new AbortController();
    setAdapter(createReviewAdapter(client, view, tab.root, controller.signal, path => openDocument.current?.(path, tab.hostId), observation.current));
    return () => controller.abort();
  }, [client, tab.root, tab.hostId, view]);
  return <div className="views-page" data-testid="review-view">{adapter ? <ReviewRenderer key={`${tab.hostId}:${tab.root}:${view.sources.review.bundleRef}`} view={view} adapter={adapter} /> : <Notice>{i18n.t("Loading data…")}</Notice>}</div>;
}
function QueryViews({ tab, client, roots, onOpen, onRoot, onGenerate, unavailable:explicitUnavailable }: Omit<ViewsProps, "tab"> & { tab: Omit<ViewTab, "view"> & { view?: View } }) {
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
  const [busy, setBusy] = useState(false), [favourites, setFavourites] = useState<{ plugin: string; name: string }[]>([]), [saving, setSaving] = useState(false), [name, setName] = useState("");
  const [saveProblem, setSaveProblem] = useState("");
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
  const list = async () => {
    const lists = [{ plugin: base.owner, value: await request({ action: "list", plugin: base.owner }) }];
    return lists.flatMap(({ plugin, value }) => (value.favourites ?? []).map(name => ({ plugin, name })));
  };
  useEffect(() => {
    if (!tab.basic) return;
    let alive = true;
    const refresh = () => { void list().then(value => { if (alive) setFavourites(value); }).catch(error => { if (alive && !lifetime.current?.signal.aborted) setProblem(sourceFailure(error).message); }); };
    const changed = (event: Event) => { if ((event as CustomEvent).detail === tab.hostId) refresh(); };
    refresh(); window.addEventListener("view-favourites-changed", changed);
    return () => { alive = false; window.removeEventListener("view-favourites-changed", changed); };
  }, [client, tab.basic, tab.hostId]);
  const run = async (action: () => Promise<void>, save = false) => { if (busy) return; setBusy(true); (save ? setSaveProblem : setProblem)(""); try { await action(); } catch (error) { if (!lifetime.current?.signal.aborted) (save ? setSaveProblem : setProblem)(sourceFailure(error).message); } finally { if (!lifetime.current?.signal.aborted) setBusy(false); } };
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
      {!tab.basic ? <Button variant="secondary" size="sm" disabled={busy || !owner} onClick={() => { setName(view.title); setSaving(true); setSaveProblem(""); }}><Star aria-hidden="true" />{i18n.t("Add to favorites", { defaultValue: "Add to favorites" })}</Button> : <p>{i18n.t("Ask the assistant to generate a view. The basic table stays here.")}</p>}
    </div>
    {view.form ? <form ref={formElement} className="view-query-form" noValidate onSubmit={event => { event.preventDefault(); void query(); }}>
      {schema ? <QueryInputs view={view} schema={schema} errors={inputErrors.fields} change={(field, value, remove) => { setArgs(previous => { const next = { ...previous }; if (remove) delete next[field]; else next[field] = value; return next; }); setInputErrors(emptyInputErrors()); }} /> : null}
      <div className="form-actions view-query-actions"><Button type="submit" disabled={unavailable || busy || (needsRoot && !root) || !schema}>{view.form.submit.label}</Button></div>
    </form> : null}
    <FieldError id={`view-input-error-${tab.id}`}>{inputErrors.common}</FieldError>
    {state === "loading" ? <Notice>{i18n.t("Loading data…")}</Notice> : state === "idle" ? <Notice>{i18n.t("Data has not been queried. Refresh manually.")}</Notice> : state === "empty" ? <Notice>{i18n.t("No matching rows.")}</Notice> : null}
    {result && (state === "loading" || state === "needs-input" || !!problem || JSON.stringify(args) !== queriedArgs) ? <Notice tone="warning">{i18n.t("Previous query result")} · {queriedAt}{JSON.stringify(args) !== queriedArgs ? ` · ${i18n.t("Search conditions changed")}` : ""}</Notice> : null}
    {problem ? <Notice tone={state === "uncertain" ? "warning" : "error"}>{problem}</Notice> : null}
    <div aria-busy={state === "loading"}><ViewRenderer key={result?.receipt.requestId ?? "idle"} view={view} rows={result?.rows} fields={result?.fields} fieldTypes={operation ? {...operation.rowSchema,...(view.sources.stats.groupBy?{group:operation.rowSchema[view.sources.stats.groupBy.field]}:{})} : undefined} /></div>
    {result ? <p className="view-receipt"><Tooltip><TooltipTrigger render={<Button size="sm" variant="ghost" className="text-muted-foreground" aria-label={i18n.t("View receipt")} />}>{i18n.t("Queried: {{time}}", { time: queriedAt })}</TooltipTrigger><TooltipContent className="flex-col items-start break-all"><div>{result.receipt.operation} v{result.receipt.version} · {result.receipt.scope}</div><div>{result.target?.root}</div><div>{result.receipt.timestamp}</div><div>{result.receipt.requestId}</div></TooltipContent></Tooltip></p> : null}
    {tab.basic ? <section className="view-favorites" aria-label={i18n.t("Favorites")}><div className="view-favorites-header"><h3>{i18n.t("Favorites")}</h3><Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={i18n.t("Refresh favorites")} disabled={busy} />} onClick={() => void run(async () => setFavourites(await list()))}><RotateCw aria-hidden="true" /></TooltipTrigger><TooltipContent>{i18n.t("Refresh favorites")}</TooltipContent></Tooltip></div>{favourites.length ? <ul>{favourites.map(({ plugin, name }) => <li key={`${plugin}:${name}`}><Button variant="ghost" size="sm" title={name} disabled={busy} onClick={() => void run(async () => { const value = await request({ action: "open", plugin, name }); onOpen(value.view!, root, tab.hostId, value.name); })}><Star aria-hidden="true" className="view-favorite-icon" /><span className="view-favorite-name">{name}</span></Button></li>)}</ul> : <Notice>{i18n.t("No favorites yet.")}</Notice>}</section> : null}
    <Dialog open={saving} onOpenChange={open => { if (!busy) setSaving(open); }}><DialogContent><DialogHeader><DialogTitle>{i18n.t("Add to favorites", { defaultValue: "Add to favorites" })}</DialogTitle><DialogDescription>{i18n.t("Save the current inputs, including conditions not yet queried. Reopening restores inputs without querying.", { defaultValue: "Save the current inputs, including conditions not yet queried. Reopening restores inputs without querying." })}</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); void run(async () => { await request({ action: "save", plugin: owner, name, view }); window.dispatchEvent(new CustomEvent("view-favourites-changed", { detail: tab.hostId })); setSaving(false); }, true); }}><label>{i18n.t("New favorite name")}<Input autoFocus aria-label={i18n.t("New favorite name")} aria-invalid={!!saveProblem} aria-describedby={saveProblem ? `view-save-error-${tab.id}` : undefined} value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label><FieldError id={`view-save-error-${tab.id}`}>{saveProblem}</FieldError><div className="view-controls"><Button type="submit" disabled={busy || !owner || !name.trim()}>{i18n.t("Add favorite")}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setSaving(false)}>{i18n.t("Cancel")}</Button></div></form></DialogContent></Dialog>
  </div>;
}

function AssistantView({
  tab,
  view,
  client,
  onGenerate,
  onOpenDocument,
  provenanceRoots = [],
}: ViewsProps & { view: Extract<CatalogView, { refresh: "assistant" }> }) {
  const source = view.sources.stats;
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(view.title),
    [problem, setProblem] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current?.abort();
  }, [client]);
  return (
    <div className="views-page" data-testid="generated-view">
      <h2>{tab.label ?? view.title}</h2>
      <div className="view-controls">
      <Button size="sm" variant="secondary" onClick={() => setSaving(true)}>
        {i18n.t("Add to favorites")}
      </Button>
      </div>
      <p>
        {i18n.t("Assistant prepared data")} ·{" "}
        {source.provenance
          .slice(0, 3)
          .map((p) => p.label)
          .join(", ")}
        {source.provenance.length > 3 ? "…" : ""}
      </p>
      <ViewRenderer
        view={view}
        rows={source.rows}
        fields={Object.fromEntries(
          Object.entries(source.rowSchema).map(([k, v]) => [k, v.label]),
        )}
      />
      <AssistantDataDetails source={source} provenanceRoots={provenanceRoots} onOpenDocument={onOpenDocument} />
      <Dialog open={saving} onOpenChange={setSaving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{i18n.t("Add to favorites")}</DialogTitle>
            <DialogDescription>
              {i18n.t("Assistant prepared data")}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void viewRequest(
                client,
                { action: "save", plugin: view.owner, name, view },
                controller.current?.signal,
              )
                .then(() => {
                  setSaving(false);
                  window.dispatchEvent(
                    new CustomEvent("view-favourites-changed", {
                      detail: tab.hostId,
                    }),
                  );
                })
                .catch(() => setProblem(i18n.t("Unavailable")));
            }}
          >
            <label>
              {i18n.t("New favorite name")}
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            {problem ? <Notice tone="error">{problem}</Notice> : null}
            <Button type="submit" disabled={!name.trim()}>
              {i18n.t("Add favorite")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
