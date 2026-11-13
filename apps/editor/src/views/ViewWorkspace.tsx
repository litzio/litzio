import { PluginScreenCode, ScreenBoundary } from "./PluginScreenCode.tsx";
import type { ComparisonTarget } from "../review/GeneratedComparison.tsx";
import { PluginJobPanel } from "../PluginJobPanel.tsx";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CatalogView } from "@litzio/core/views-v2";
import { hostRegistry, getHostClient, hostLabel, type HostClient } from "../host-client.ts";
import { viewRequest, type ViewScreen, type ViewResult } from "./view-api.ts";
import { Views } from "./Views.tsx";
import { Button } from "../components/ui/button.tsx";
import { Notice } from "../ui/primitives.tsx";
import { i18n } from "../i18n.ts";

/** Plugin manifest screens; definitions are supplied by the active plugin, never saved view files. */
export function ViewWorkspace({ roots = [], jobsActive = true, id, hostId, root, owner, screen, onHost, onOpenDocument, onCompare, client = getHostClient(hostId) }: {
  roots?: string[]; jobsActive?: boolean; client?: HostClient; id: string; hostId: string; root: string; owner: string; screen: ViewScreen;
  onCompare?(target: ComparisonTarget): void;
  onHost?(hostId: string): void; onOpenDocument?(path: string, hostId: string): void;
}) {
  useSyncExternalStore(hostRegistry.subscribe, hostRegistry.snapshot, hostRegistry.snapshot);
  const connected = hostRegistry.get(hostId).state === "connected";
  const [catalogClient, setCatalogClient] = useState<HostClient>();
  const [catalog, setCatalog] = useState<ViewResult>();
  const [problem, setProblem] = useState("");
  const [pages, setPages] = useState<Record<string, CatalogView>>({});
  const [selected, setSelected] = useState("");
  const current = useRef(selected); current.current = selected;
  useEffect(() => {
    const controller = new AbortController();
    if (!connected) return () => controller.abort();
    let revision: string | undefined;
    let request = 0;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const currentRequest = ++request;
      void viewRequest(client, { action: "catalog" }, controller.signal).then(catalog => {
        if (controller.signal.aborted || currentRequest !== request) return;
        setCatalogClient(client); setCatalog(catalog); setProblem("");
        revision = catalog.screens?.find(s => s.plugin === owner && s.id === screen.id)?.codeRevision;
        if (!current.current) {
          const initial = catalog.views?.find(v => v.plugin === owner && screen.defaultViewIds.includes(v.id));
          if (initial) {
            current.current = initial.id;
            setPages(previous => ({ ...previous, [initial.id]: initial.definition })); setSelected(initial.id);
          }
        }
      }).catch(() => { if (!controller.signal.aborted && currentRequest === request) setProblem(i18n.t("Unavailable")); });
    };
    // Observe explicit Host reload/disable, including changes made by CLI/assistant.
    // This never watches files or triggers a reload, and does not transfer source on each check.
    const observe = async () => {
      try {
        const next = await viewRequest(client, { action: "catalog", screenCode: false }, controller.signal);
        const nextScreen = next.screens?.find(s => s.plugin === owner && s.id === screen.id);
        if (!controller.signal.aborted && nextScreen?.codeRevision !== revision) { if (!nextScreen) setCatalog(undefined); refresh(); }
      } catch { /* Connection registry owns availability; keep retrying only this connection. */ }
      if (!controller.signal.aborted) timer = setTimeout(observe, 2000);
    };
    refresh(); window.addEventListener("plugins-changed", refresh);
    if (screen.entry) timer = setTimeout(observe, 2000);
    return () => { controller.abort(); clearTimeout(timer); window.removeEventListener("plugins-changed", refresh); };
  }, [client, hostId, owner, connected, screen.id]);
  const contribution = catalogClient === client ? catalog?.screens?.find(s => s.plugin === owner && s.id === screen.id) : undefined;
  const active = connected && !!contribution;
  const defaults = catalog?.views?.filter(v => v.plugin === owner && screen.defaultViewIds.includes(v.id)) ?? [];
  return <div className="view-workspace" data-testid="view-workspace">
    <h1>{screen.title}</h1>
    {hostRegistry.list().length > 1 && onHost ? <div className="view-controls"><label>{i18n.t("Host")}<select className="form-select settings-select" value={hostId} onChange={event => onHost(event.target.value)}>{hostRegistry.list().map(h => <option value={h.hostId} key={h.hostId}>{hostLabel(h.hostId)}</option>)}</select></label></div> : null}
    {!active ? <Notice>{i18n.t("Unavailable")}</Notice> : null}
    {problem ? <Notice tone="error">{problem}</Notice> : null}
    <ScreenBoundary resetKey={contribution?.codeRevision}>{active && contribution?.code ? <PluginScreenCode key={`${hostId}:${owner}:${screen.id}:${contribution.codeRevision}`} code={contribution.code} owner={owner} client={client} /> : null}</ScreenBoundary>
    {contribution?.jobs?.length ? <PluginJobPanel key={`${hostId}:${owner}:${screen.id}`} client={client} plugin={owner} jobIds={contribution.jobs} roots={roots} active={active && jobsActive} onCompare={onCompare} onOpen={async path => { onOpenDocument?.(path, hostId); }} /> : null}
    {defaults.length > 1 ? <section className="view-controls" aria-label={i18n.t("Default views")}>{defaults.map(v => <Button key={v.id} size="sm" variant="ghost" disabled={!active} aria-pressed={selected === v.id} onClick={() => {
      setPages(previous => previous[v.id] ? previous : { ...previous, [v.id]: v.definition }); setSelected(v.id);
    }}>{v.title}</Button>)}</section> : null}
    {Object.entries(pages).map(([key, definition]) => <div key={key} hidden={selected !== key} inert={selected !== key}><Views tab={{ id, hostId, root, screen, view: definition }} client={client} onOpenDocument={onOpenDocument} unavailable={!active} /></div>)}
  </div>;
}
