import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { flushSync } from "react-dom";
import { PLUGIN_UI, type UiRegistration } from "@litzio/plugin-api/config";
import type { UiHost, UiModule, PluginDialogProps, UiNotice } from "@litzio/plugin-api/ui";
import { Input } from "./components/ui/input.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./components/ui/dialog.tsx";
import { openExternalLink } from "./link-opening.ts";
import { ReadOnlyDocument } from "./ReadOnlyDocument.tsx";
import { Button } from "./components/ui/button.tsx";
import { i18n, type MessageKey } from "./i18n.ts";
import { UiRegistry, type ActiveUi } from "./plugin-ui-registry.ts";

type ShellApi = Pick<UiHost, "pickFolder" | "openTab" | "pickFile" | "openSettings" | "openDocument" | "openFolder">;
function PluginButton(props: React.ComponentProps<UiHost["Button"]>) {
  return <Button size="sm" variant="ghost" {...props} />;
}
function PluginDialog({ open, onClose, title, description, returnFocus, children, footer, testId }: PluginDialogProps) {
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent finalFocus={returnFocus} data-testid={testId}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      {children}<DialogFooter>{footer}</DialogFooter>
    </DialogContent>
  </Dialog>;
}
async function load(registration: UiRegistration, signal: AbortSignal) {
  const url = (asset: string) => `${import.meta.env.BASE_URL}${PLUGIN_UI.route.slice(1)}?${new URLSearchParams({ id: registration.id, revision: registration.revision, asset })}`;
  let link: HTMLLinkElement | undefined;
  let initialJob: any, initialJobRead: Promise<unknown> | undefined, stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => { stopped = true; clearTimeout(timer); };
  // Observe declared in-flight work even while the UI ESM is loading. Retain a
  // completion only after seeing its running state; completed tabs are not restored.
  const observeJob = async () => {
    let again = false;
    try {
      initialJobRead = (async () => {
        const response = await fetch(`${import.meta.env.BASE_URL}${registration.ui.jobRoute}`, { signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
        return payload;
      })();
      const job: any = await initialJobRead;
      if (job?.state === "running" || initialJob) initialJob = job;
      again = job?.state === "running";
    } catch { again = true; }
    if (!stopped && again) timer = setTimeout(observeJob, 1000);
  };
  if (registration.ui.jobRoute) void observeJob();
  signal.addEventListener("abort", stop, { once: true });
  try {
    if (registration.ui.style) {
      link = document.createElement("link"); link.rel = "stylesheet"; link.href = url(registration.ui.style);
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          signal.removeEventListener("abort", abort); link!.onload = null; link!.onerror = null;
          error ? reject(error) : resolve();
        };
        const abort = () => finish(new Error("UI loading stopped."));
        link!.onload = () => finish(); link!.onerror = () => finish(new Error("Plugin stylesheet failed to load."));
        signal.addEventListener("abort", abort, { once: true });
        document.head.append(link!);
      });
    }
    const module: UiModule = await import(/* @vite-ignore */ url(registration.ui.script));
    stop(); signal.removeEventListener("abort", stop);
    return { module, initialJob, initialJobRead, release: () => link?.remove() };
  } catch (error) { stop(); signal.removeEventListener("abort", stop); link?.remove(); throw error; }
}
/** Content-addressed URLs reuse native ESM records on re-registration. No
 * activation counters, global bridge, eval or second React copy. */
export function usePluginUi(shellApi: ShellApi) {
  const api = React.useRef(shellApi); api.current = shellApi;
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});
  const [notices, setNotices] = React.useState<Record<string, UiNotice | null>>({});
  const [plugins, setPlugins] = React.useState<ActiveUi[]>([]);
  const [observed, setObserved] = React.useState(false);
  const [problem, setProblem] = React.useState("");
  React.useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const registry = new UiRegistry(React.version, states => flushSync(() => {
      setPlugins(states);
      const keys = new Set(states.map(state => `${state.id}/${state.revision}`));
      setBusy(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => keys.has(key))));
      setNotices(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => keys.has(key))));
    }), load,
      (registration, guard, signal, initialJob, initialJobRead): UiHost => ({
        api: PLUGIN_UI.api, React, jsx, ReadingSurface: ReadOnlyDocument, Button: PluginButton, Input, Dialog: PluginDialog, initialJob, initialJobRead,
        features: registration.features,
        openSettings: (section, focus) => { guard(); api.current.openSettings(`plugin/${registration.id}/${section}`, focus); },
        openDocument: path => { guard(); return api.current.openDocument(path); },
        openFolder: path => { guard(); return api.current.openFolder(path); },
        setBusy: busy => { guard(); setBusy(previous => ({ ...previous, [`${registration.id}/${registration.revision}`]: busy })); },
        notify: notice => { guard(); setNotices(previous => ({ ...previous, [`${registration.id}/${registration.revision}`]: notice })); },
        openExternalLink: url => { guard(); openExternalLink(url); },
        text: (key, values) => i18n.t(key as MessageKey, values as any),
        readJson: async (route, query) => {
          guard();
          if (!/^api\/[a-z0-9-]+$/u.test(route)) throw new Error("Invalid Host read route.");
          const response = await fetch(`${import.meta.env.BASE_URL}${route}?${new URLSearchParams(query)}`, { signal });
          const value = await response.json(); guard();
          if (!response.ok) throw new Error(value.error ?? "Host read failed.");
          return value;
        },
        requestJson: async (route, method, body) => {
          guard();
          if (!/^api\/[a-z0-9-]+$/u.test(route)) throw new Error("Invalid Host route.");
          const response = await fetch(`${import.meta.env.BASE_URL}${route}`, { signal, method,
            ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
          const value = await response.json(); guard();
          if (!response.ok) throw new Error(value.error ?? "Host operation failed.");
          return value;
        },
        imageUrl: (path, uri) => `${import.meta.env.BASE_URL}document/${uri.split("/").map(encodeURIComponent).join("/")}?${new URLSearchParams({ path })}`,
        pickFolder: (options, focus) => { guard(); api.current.pickFolder(options, focus); },
        openTab: (kind, resource, current) => { guard(); return api.current.openTab(`${registration.id}/${kind}`, resource, current); },
        pickFile: (options, focus) => { guard(); api.current.pickFile({ ...options, open: path => { guard(); return options.open(path); } }, focus); },
      }), error => setProblem(String(error)));
    const observe = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}${PLUGIN_UI.route.slice(1)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Could not read UI plugin registrations.");
        const registrations: UiRegistration[] = await response.json();
        if (!stopped) { registry.reconcile(registrations); setProblem(""); setObserved(true); }
      } catch (error) {
        if (!stopped) { registry.reconcile([]); setProblem(String(error)); }
      } finally { if (!stopped) timer = setTimeout(observe, 500); }
    };
    void observe();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); registry.close(); };
  }, []);
  return { plugins, problem, observed,
    busy: Object.fromEntries(plugins.map(plugin => [plugin.id, busy[`${plugin.id}/${plugin.revision}`]])),
    notices: Object.fromEntries(plugins.filter(plugin => plugin.contributions).map(plugin => [plugin.id, notices[`${plugin.id}/${plugin.revision}`]])),
  };
}
