import { ScreenFrame } from "../components/ui/task-header.tsx";
import { PluginScreenCode, ScreenBoundary } from "./PluginScreenCode.tsx";
import { useEffect, useState, useSyncExternalStore } from "react";
import { desktopConnection } from "../desktop-connection.ts";
import { hostConnection, type HostClient } from "../host-client.ts";
import { viewRequest, type ViewScreen, type ViewResult } from "./view-api.ts";
import { Notice } from "../ui/primitives.tsx";
import { i18n } from "../i18n.ts";
import type { ScreenFileOpen, ScreenOpenDocumentResult } from "@litzio/plugin-sdk";
import { matchesFileAction } from "../../shared/plugin-file-actions.ts";

/** Plugin manifest screens; definitions are supplied by the active plugin, never saved view files. */
export function ViewWorkspace({ roots = [], id, root, owner, screen, fileOpen, onOpenDocument, client }: {
  roots?: string[]; client: HostClient; id: string; root: string; owner: string; screen: ViewScreen;
  fileOpen?: ScreenFileOpen;
  onOpenDocument?(path: string, signal: AbortSignal): Promise<ScreenOpenDocumentResult>;
}) {
  useSyncExternalStore(hostConnection.subscribe, hostConnection.snapshot, hostConnection.snapshot);
  const current = hostConnection.getScreenClient() === client;
  const canReadCatalog = current && hostConnection.get().state === "connected";
  const [catalogClient, setCatalogClient] = useState<HostClient>();
  const [catalog, setCatalog] = useState<ViewResult>();
  const [problem, setProblem] = useState("");
  useEffect(() => {
    if (!current) { setCatalog(undefined); setProblem(""); }
    if (!canReadCatalog) return;
    const controller = new AbortController();
    let observed: ViewScreen | undefined;
    let request = 0;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const currentRequest = ++request;
      void viewRequest(client, { action: "screens" }, controller.signal).then(catalog => {
        if (controller.signal.aborted || currentRequest !== request) return;
        setCatalogClient(client); setCatalog(catalog); setProblem("");
        observed = catalog.screens?.find(s => s.plugin === owner && s.id === screen.id);
      }).catch(() => { if (!controller.signal.aborted && currentRequest === request) setProblem(i18n.t("Unavailable")); });
    };
    // Observe explicit Host reload/disable, including changes made by CLI/assistant.
    // This never watches files or triggers a reload, and does not transfer source on each check.
    const observe = async () => {
      try {
        const next = await viewRequest(client, { action: "screens", screenCode: false }, controller.signal);
        const nextScreen = next.screens?.find(s => s.plugin === owner && s.id === screen.id);
        if (!controller.signal.aborted && (nextScreen?.codeRevision !== observed?.codeRevision || nextScreen?.activation !== observed?.activation)) {
          if (!nextScreen) setCatalog(undefined);
          refresh();
        }
      } catch { /* Connection registry owns availability; keep retrying only this connection. */ }
      if (!controller.signal.aborted) timer = setTimeout(observe, 2000);
    };
    refresh(); window.addEventListener("plugins-changed", refresh);
    if (screen.entry) timer = setTimeout(observe, 2000);
    return () => { controller.abort(); clearTimeout(timer); window.removeEventListener("plugins-changed", refresh); };
  }, [client, owner, current, canReadCatalog, screen.id]);
  const contribution = catalogClient === client ? catalog?.screens?.find(s => s.plugin === owner && s.id === screen.id) : undefined;
  const keepOnProbeFailure = desktopConnection.get().version?.screenInstanceGuard === true;
  const active = current && !!contribution && (canReadCatalog || keepOnProbeFailure);
  const loading = current && canReadCatalog && Boolean(contribution?.activation ?? (!catalogClient && !problem && screen.activation));
  const selection = fileOpen && contribution?.fileActions?.some(action =>
    action.id === fileOpen.actionId && matchesFileAction(action, fileOpen.path)) ? fileOpen : undefined;
  return <div className="view-workspace task-surface" data-testid="view-workspace">
    <ScreenFrame title={screen.title}>
    {loading ? <Notice role="status">{i18n.t("Loading")}</Notice> : !active ? <Notice>{i18n.t("Unavailable")}</Notice> : null}
    {problem ? <Notice tone="error">{problem}</Notice> : null}
    <ScreenBoundary resetKey={contribution?.codeRevision}>{active && contribution?.code ? <PluginScreenCode key={`local:${owner}:${screen.id}:${contribution.codeRevision}`} code={contribution.code} owner={owner} client={client} roots={roots} fileOpen={selection} onOpen={onOpenDocument} /> : null}</ScreenBoundary>
  </ScreenFrame></div>;
}
