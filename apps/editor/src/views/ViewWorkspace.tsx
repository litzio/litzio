import { PluginScreenCode, ScreenBoundary } from "./PluginScreenCode.tsx";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { hostRegistry, getHostClient, type HostClient } from "../host-client.ts";
import { viewRequest, type ViewScreen, type ViewResult } from "./view-api.ts";
import { Notice } from "../ui/primitives.tsx";
import { i18n } from "../i18n.ts";

/** Plugin manifest screens; definitions are supplied by the active plugin, never saved view files. */
export function ViewWorkspace({ roots = [], id, hostId, root, owner, screen, onHost, onOpenDocument, client = getHostClient(hostId) }: {
  roots?: string[]; client?: HostClient; id: string; hostId: string; root: string; owner: string; screen: ViewScreen;
  onHost?(hostId: string): void; onOpenDocument?(path: string, hostId: string): void;
}) {
  useSyncExternalStore(hostRegistry.subscribe, hostRegistry.snapshot, hostRegistry.snapshot);
  const connected = hostRegistry.get(hostId).state === "connected";
  const [catalogClient, setCatalogClient] = useState<HostClient>();
  const [catalog, setCatalog] = useState<ViewResult>();
  const [problem, setProblem] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    if (!connected) return () => controller.abort();
    let revision: string | undefined;
    let request = 0;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const currentRequest = ++request;
      void viewRequest(client, { action: "screens" }, controller.signal).then(catalog => {
        if (controller.signal.aborted || currentRequest !== request) return;
        setCatalogClient(client); setCatalog(catalog); setProblem("");
        revision = catalog.screens?.find(s => s.plugin === owner && s.id === screen.id)?.codeRevision;
      }).catch(() => { if (!controller.signal.aborted && currentRequest === request) setProblem(i18n.t("Unavailable")); });
    };
    // Observe explicit Host reload/disable, including changes made by CLI/assistant.
    // This never watches files or triggers a reload, and does not transfer source on each check.
    const observe = async () => {
      try {
        const next = await viewRequest(client, { action: "screens", screenCode: false }, controller.signal);
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
  return <div className="view-workspace" data-testid="view-workspace">
    <h1>{screen.title}</h1>
    {!active ? <Notice>{i18n.t("Unavailable")}</Notice> : null}
    {problem ? <Notice tone="error">{problem}</Notice> : null}
    <ScreenBoundary resetKey={contribution?.codeRevision}>{active && contribution?.code ? <PluginScreenCode key={`${hostId}:${owner}:${screen.id}:${contribution.codeRevision}`} code={contribution.code} owner={owner} client={client} roots={roots} onOpen={path => onOpenDocument?.(path, hostId)} /> : null}</ScreenBoundary>
  </div>;
}
