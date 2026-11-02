import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog.tsx";
import { Notice } from "./ui/primitives.tsx";

type Plugin = { id: string; version: string; revision: string; directory: string; enabled: boolean; bundledRevision: string | null };
const endpoint = `${import.meta.env.BASE_URL}api/worker-plugins`;
async function request<T>(options?: RequestInit): Promise<T> {
  const response = await fetch(endpoint, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? response.statusText);
  return value;
}

export function PluginSettings() {
  useTranslation();
  const [items, setItems] = useState<Plugin[] | null>(null);
  const [problem, setProblem] = useState("");
  const [confirm, setConfirm] = useState<Plugin | null>(null);
  const [busy, setBusy] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void request<Plugin[]>({ signal: controller.signal }).then(setItems).catch(error => { if (!controller.signal.aborted) setProblem(String(error)); });
    return () => controller.abort();
  }, []);
  const register = async () => {
    setBusy(true); setProblem("");
    try {
      await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bundled: confirm!.id }) });
      setItems(await request<Plugin[]>()); setConfirm(null);
    } catch (error) { setProblem(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <div data-testid="plugin-settings" aria-busy={busy}>
    {!items && !problem ? <p role="status">{i18n.t("Loading…")}</p> : null}
    {items?.length === 0 ? <p>{i18n.t("No installed plugins.")}</p> : null}
    {items?.map(item => <section key={item.id} className="settings-section settings-section--stacked" data-testid={`installed-plugin-${item.id}`}>
      <div className="settings-label min-w-0">
        <h3 className="settings-heading">{item.id}</h3>
        <p>{i18n.t(item.enabled ? "Enabled" : "Off")}</p>
        <dl className="grid gap-2 text-sm [overflow-wrap:anywhere]">
          <div><dt>{i18n.t("Version")}</dt><dd>{item.version}</dd></div>
          <div><dt>{i18n.t("Installation revision")}</dt><dd><code title={item.revision}>{item.revision.slice(0, 12)}</code></dd></div>
          <div><dt>{i18n.t("Installation path")}</dt><dd>{item.directory}</dd></div>
          {item.bundledRevision ? <div><dt>{i18n.t("App default revision")}</dt><dd><code title={item.bundledRevision}>{item.bundledRevision.slice(0, 12)}</code></dd></div> : null}
        </dl>
        <p>{i18n.t(item.bundledRevision === null ? "Not bundled with this app" : item.revision === item.bundledRevision ? "Matches app default" : "Differs from app default")}</p>
      </div>
      {item.bundledRevision && item.bundledRevision !== item.revision ? <div className="settings-actions">
        <Button size="sm" variant="secondary" disabled={busy} onClick={event => { opener.current = event.currentTarget; setProblem(""); setConfirm(item); }}>{i18n.t("Register app default again")}</Button>
      </div> : null}
    </section>)}
    {problem && !confirm ? <Notice tone="error">{problem}</Notice> : null}
    <Dialog open={!!confirm} onOpenChange={open => { if (!open && !busy) setConfirm(null); }}>
      <DialogContent showCloseButton={false} finalFocus={() => opener.current?.isConnected ? opener.current : true} aria-busy={busy}>
        <DialogHeader><DialogTitle>{i18n.t("Register app default again?")}</DialogTitle>
          <DialogDescription>{i18n.t("Register the bundled revision of {{name}}? This turns the plugin on.", { name: confirm?.id ?? "" })}</DialogDescription></DialogHeader>
        {problem ? <Notice tone="error">{problem}</Notice> : null}
        <DialogFooter><Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirm(null)} autoFocus>{i18n.t("Cancel")}</Button>
          <Button size="sm" disabled={busy} onClick={() => void register()}>{i18n.t("Register app default again")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
