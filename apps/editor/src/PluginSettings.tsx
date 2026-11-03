import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog.tsx";
import { Info } from "lucide-react";
import type { SettingsSection } from "@litzio/plugin-api/ui";
import { SettingsRow, SettingsSwitch } from "@/components/ui/settings.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip.tsx";
import { Notice } from "./ui/primitives.tsx";

type Plugin = { id: string; version: string; revision: string; directory: string; enabled: boolean; bundledRevision: string | null };
const endpoint = `${import.meta.env.BASE_URL}api/worker-plugins`;
async function request<T>(options?: RequestInit): Promise<T> {
  const response = await fetch(endpoint, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? response.statusText);
  return value;
}

export function PluginSettings({ sections, errors, onOpen, focusSection }: { focusSection?: string; sections: SettingsSection[]; errors: Record<string, string>; onOpen(id: string): void }) {
  useTranslation();
  const [items, setItems] = useState<Plugin[] | null>(null);
  const focusTarget = useRef<HTMLButtonElement | null>(null);
  const focusRestored = useRef(false);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const [confirm, setConfirm] = useState<Plugin | null>(null);
  const [busy, setBusy] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void request<Plugin[]>({ signal: controller.signal }).then(setItems).catch(error => { if (!controller.signal.aborted) setProblem(String(error)); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (items && focusSection && focusTarget.current && !focusRestored.current) {
      focusTarget.current.focus(); focusRestored.current = true;
    }
  }, [items, sections, focusSection]);
  const register = async () => {
    setBusy(true); setProblem("");
    try {
      await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bundled: confirm!.id }) });
      setItems(await request<Plugin[]>());
      setActionErrors(previous => { const next = { ...previous }; delete next[confirm!.id]; return next; });
      setConfirm(null);
    } catch (error) { setProblem(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const toggle = async (item: Plugin, enabled: boolean) => {
    setBusy(true); setProblem("");
    setActionErrors(previous => { const next = { ...previous }; delete next[item.id]; return next; });
    try {
      await request({ method: enabled ? "PATCH" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, ...(enabled ? { enabled: true } : {}) }) });
      setItems(await request<Plugin[]>());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProblem(message); setActionErrors(previous => ({ ...previous, [item.id]: message }));
    } finally { setBusy(false); }
  };
  const pluginError = (id: string) => actionErrors[id] ?? errors[id];
  return <div data-testid="plugin-settings" aria-busy={busy}>
    {!items && !problem ? <p role="status">{i18n.t("Loading…")}</p> : null}
    {items?.length === 0 ? <p>{i18n.t("No installed plugins.")}</p> : null}
    {items?.map(item => <section key={item.id} data-testid={`installed-plugin-${item.id}`}>
      <SettingsSwitch label={item.id} checked={item.enabled} disabled={busy} onChange={enabled => void toggle(item, enabled)} description={<>
        <span>{/^[a-f0-9]{64}$/i.test(item.version) ? item.version.slice(0, 12) : item.version} · {i18n.t(pluginError(item.id) ? "Error" : item.enabled ? "Enabled" : "Off")}</span>
        <Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={i18n.t("Installation details")} />}><Info aria-hidden="true" /></TooltipTrigger>
          <TooltipContent className="block [overflow-wrap:anywhere]">
            <dl>
              <dt>{i18n.t("Version")}</dt><dd>{item.version}</dd>
              <dt>{i18n.t("Installation revision")}</dt><dd>{item.revision}</dd>
              <dt>{i18n.t("Installation path")}</dt><dd>{item.directory}</dd>
              {item.bundledRevision ? <><dt>{i18n.t("App default revision")}</dt><dd>{item.bundledRevision}</dd></> : null}
            </dl>
            <p>{i18n.t(item.bundledRevision === null ? "Not bundled with this app" : item.revision === item.bundledRevision ? "Matches app default" : "Differs from app default")}</p>
            {pluginError(item.id) ? <p>{pluginError(item.id)}</p> : null}
          </TooltipContent>
        </Tooltip>
      </>} />
      {(item.enabled && sections.some(section => section.id.startsWith(`plugin/${item.id}/`))) || (item.bundledRevision && item.bundledRevision !== item.revision) ? <SettingsRow label={i18n.t("Settings")}>
        <div className="flex flex-wrap items-center gap-2">
          {sections.filter(section => section.id.startsWith(`plugin/${item.id}/`)).map(section => <Button key={section.id} ref={section.id === focusSection ? focusTarget : undefined} size="sm" variant="secondary" disabled={busy || !item.enabled} onClick={() => onOpen(section.id)}>{i18n.t(section.label as any)}</Button>)}
          {item.bundledRevision && item.bundledRevision !== item.revision ? <Button size="sm" variant="secondary" disabled={busy} onClick={event => { opener.current = event.currentTarget; setProblem(""); setConfirm(item); }}>{i18n.t("Register app default again")}</Button> : null}
        </div>
      </SettingsRow> : null}
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
