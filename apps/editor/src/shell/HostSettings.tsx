import { HostStatus } from "../components/HostStatus.tsx";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Info, Pencil, RefreshCw, X, Trash2 } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip.tsx";
import "./host-settings.css";
import { useTranslation } from "react-i18next";
import type { DesktopBridge, RegisteredHost } from "../../shared/desktop-bridge.ts";
import { hostRegistry, type HostRuntime } from "../host-client.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { FieldError, Notice } from "../ui/primitives.tsx";

export function HostSettings({ desktop, closeWork, prepareRemoval }: {
  desktop: DesktopBridge; closeWork(hostId: string): void; prepareRemoval(hostId: string): Promise<void>;
}) {
  const { t } = useTranslation();
  const [hosts, setHosts] = useState<RegisteredHost[]>([]);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [version, setVersion] = useState("");
  const [origin, setOrigin] = useState("");
  const [label, setLabel] = useState("");
  const [problem, setProblem] = useState("");
  const [protectionWarning, setProtectionWarning] = useState(false);
  const [registrationProblem, setRegistrationProblem] = useState("");
  const registrationErrorId = useId();
  const [saved, setSaved] = useState(false);
  const checkAttempt = useRef(0);
  const [checking, setChecking] = useState(false);
  const [connection, setConnection] = useState<Pick<HostRuntime, "state" | "failure" | "reason" | "warning">>();
  const clearCheck = () => { checkAttempt.current++; setChecking(false); setConnection(undefined); };
  useEffect(() => () => { checkAttempt.current++; }, []);
  const check = async () => {
    const attempt = ++checkAttempt.current;
    setChecking(true); setConnection({ state: "connecting" });
    try {
      const result = await desktop.checkHost(origin);
      if (checkAttempt.current !== attempt) return;
      setConnection(result.state === "connected" ? { state: "connected", warning: result.warning } : {
        state: "disconnected", failure: result.state === "protocol-mismatch" ? "protocol-mismatch" : "unreachable",
        reason: result.state === "protocol-mismatch" ? t("Host protocol mismatch.") : result.reason || t("Could not reach Host."),
      });
    } catch {
      if (checkAttempt.current === attempt) setConnection({ state: "disconnected", failure: "unreachable", reason: t("Check the Host address and try again.") });
    } finally { if (checkAttempt.current === attempt) setChecking(false); }
  };
  const [busy, setBusy] = useState(false);
  useSyncExternalStore(hostRegistry.subscribe, hostRegistry.snapshot, hostRegistry.snapshot);
  const refresh = async () => {
    const data = await desktop.registeredHosts();
    setProtectionWarning(!!data.cliRemovalProtectionWarning);
    for (const host of data.hosts) if (data.allowedHostIds.includes(host.hostId)) hostRegistry.add(host.hostId, host.origin, host.label);
    setHosts(data.hosts); setAllowed(data.allowedHostIds); setVersion(data.productVersion);
  };
  useEffect(() => {
    void refresh().catch(error => setProblem(String(error)));

  }, []);
  const run = async (action: () => Promise<void>, registration = false, refusal?: string) => {
    setBusy(true); setProblem("");
    if (registration) setRegistrationProblem("");
    try { await action(); await refresh(); }
    catch (error) { (registration ? setRegistrationProblem : setProblem)(refusal ?? (error instanceof Error ? error.message : String(error))); }
    finally { setBusy(false); }
  };
  return <div data-testid="host-settings" aria-busy={busy}>
    {protectionWarning ? <Notice tone="warning" role="alert">{t("Could not record CLI removal protection.")}</Notice> : null}
    <Notice tone="warning" className="host-access-warning">
      <span>{t("Host OS access · No auth · Keep ports private")}</span>
      <Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={t("Host access details")} />}><Info aria-hidden="true" /></TooltipTrigger>
        <TooltipContent><p>{t("Remote files and assistant tasks use the target Host's OS account and access permissions.")} {t("Hosts currently have no authentication. Do not expose their ports to the public internet.")}</p></TooltipContent>
      </Tooltip>
    </Notice>
    <form className="settings-section" onSubmit={event => {
      event.preventDefault();
      void run(async () => { await desktop.registerHost(origin, label); setSaved(true); clearCheck(); setOrigin(""); setLabel(""); }, true);
    }}>
      <label>{t("Host address")}<Input aria-invalid={!!registrationProblem} aria-describedby={registrationProblem ? registrationErrorId : undefined} value={origin} onChange={event => { clearCheck(); setOrigin(event.target.value); }} placeholder="https://host.example:3000" required /></label>
      <label>{t("Host label")}<Input aria-invalid={!!registrationProblem} aria-describedby={registrationProblem ? registrationErrorId : undefined} value={label} onChange={event => setLabel(event.target.value)} required /></label>
      {registrationProblem ? <FieldError id={registrationErrorId}>{registrationProblem}</FieldError> : null}
      <div className="settings-actions host-registration-actions">
        <Button type="button" size="sm" variant="secondary" disabled={busy || checking || !origin} onClick={() => void check()}>{t("Check connection")}</Button>
        {connection ? <HostStatus runtime={connection} /> : null}
        <Button type="submit" size="sm" disabled={busy}>{t("Register Host")}</Button></div>
    </form>
    {saved || hosts.some(host => !allowed.includes(host.hostId)) ? <Notice>
      {t("Registration saved. New Hosts cannot connect in this window. Save your work and apply drafts, then restart.")}
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(async () => {
        const result = await desktop.restartForHosts();
        if (!result.ok) throw new Error(result.reason);
      })}>{t("Restart to apply Hosts")}</Button>
    </Notice> : null}
    {problem ? <Notice tone="error" role="alert">{problem}</Notice> : null}
    {hosts.length === 0 ? <p>{t("No remote Hosts registered.")}</p> : null}
    {hosts.map(host => <HostRow key={host.hostId} host={host} applied={allowed.includes(host.hostId)} busy={busy}
      rename={value => run(async () => { await desktop.renameHost(host.hostId, value); })}
      reconnect={() => run(() => hostRegistry.connect(host.hostId, version))}
      closeWork={() => closeWork(host.hostId)}
      remove={() => run(async () => { await prepareRemoval(host.hostId); hostRegistry.remove(host.hostId); }, false, t("Close Host work and resolve recovery records before retrying removal."))} />)}
  </div>;
}
function HostRow({ host, applied, busy, rename, reconnect, closeWork, remove }: {
  host: RegisteredHost; applied: boolean; busy: boolean;
  rename(value: string): Promise<void>; reconnect(): Promise<void>; closeWork(): void; remove(): Promise<void>;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(host.label);
  let runtime;
  if (applied) { try { runtime = hostRegistry.get(host.hostId); } catch { /* Startup has not registered this client yet. */ } }
  const actions = [
    { label: t("Rename"), icon: Pencil, type: "submit" as const, disabled: busy || label === host.label, variant: "secondary" as const },
    { label: t("Reconnect"), icon: RefreshCw, disabled: busy || !applied, action: reconnect, variant: "secondary" as const },
    { label: t("Close Host work"), icon: X, disabled: busy, action: closeWork, variant: "secondary" as const },
    { label: t("Remove"), icon: Trash2, disabled: busy, action: remove, variant: "destructive" as const },
  ];
  return <section className="settings-section settings-section--stacked host-registration">
    <div className="host-summary">
      <h3 className="settings-heading">{host.label}</h3>
      <p className="settings-description host-origin">{host.origin}</p>
      <HostStatus runtime={runtime} restartRequired={!applied} />
    </div>
    <form onSubmit={event => { event.preventDefault(); void rename(label); }}>
      <label>{t("Host label")}<Input value={label} onChange={event => setLabel(event.target.value)} required /></label>
      <div className="host-actions">
        {actions.map(({ label: actionLabel, icon: Icon, type, disabled, action, variant }) => <Tooltip key={actionLabel}>
          <TooltipTrigger render={<Button size="sm" type={type ?? "button"} variant={variant} disabled={disabled} aria-label={actionLabel} onClick={action ? () => void action() : undefined} />}>
            <Icon aria-hidden="true" /><span className="host-action-label">{actionLabel}</span>
          </TooltipTrigger><TooltipContent>{actionLabel}</TooltipContent>
        </Tooltip>)}
      </div>
    </form>
  </section>;
}
