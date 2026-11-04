import { Fragment, useEffect, useState } from "react";
import { Ellipsis } from "lucide-react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { useNotifications } from "@/components/ui/notification-center.tsx";
import { SettingsRow } from "@/components/ui/settings.tsx";
import { i18n } from "../i18n.ts";

export function DesktopMenu({ desktop }: { desktop: DesktopBridge }) {
  const [disconnected, setDisconnected] = useState(false);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!desktop.checkDaemon) return;
    let active = true, checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try { await desktop.checkDaemon(); } catch { if (active) setDisconnected(true); }
      finally { checking = false; }
    };
    void check();
    const timer = setInterval(() => { void check(); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [desktop]);
  useNotifications([
    ...(disconnected ? [{ id: "daemon-disconnected", message: i18n.t("Disconnected from daemon"), severity: "error" as const,
      testId: "daemon-disconnected", revision: String(busy), actionLabel: i18n.t("Reconnect"), render: () => <><p>{i18n.t("Disconnected from daemon")}</p><Button className="notification-reveal" variant="ghost" size="sm" disabled={busy} onClick={async () => {
        setBusy(true); setProblem("");
        try { await desktop.reconnectDaemon(); setDisconnected(false); }
        catch (error) { setProblem(String(error)); }
        finally { setBusy(false); }
      }}>{i18n.t("Reconnect")}</Button></> }] : []),
    ...(problem ? [{ id: "daemon-problem", message: problem, severity: "error" as const }] : []),
  ]);
  return <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={i18n.t("Desktop menu")} />}><Ellipsis /></DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuItem onClick={() => { void desktop.openInBrowser().catch(error => setProblem(String(error))); }}>{i18n.t("Open in browser")}</DropdownMenuItem>
      <DropdownMenuItem onClick={() => { void desktop.stopDaemon().then(stopped => { if (stopped) setDisconnected(true); }).catch(error => setProblem(String(error))); }}>{i18n.t("Stop daemon")}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function DaemonStatus({ desktop }: { desktop: DesktopBridge }) {
  const [info, setInfo] = useState<Awaited<ReturnType<DesktopBridge["daemonInfo"]>>>();
  useEffect(() => {
    let active = true;
    const read = () => { void desktop.daemonInfo?.().then(value => { if (active) setInfo(value); }).catch(() => {}); };
    read(); const timer = setInterval(read, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [desktop]);
  if (!info) return null;
  return <>
    <SettingsRow label={i18n.t("Local daemon")}><span>{info.state} · {i18n.t(info.launcher === "desktop" ? "Desktop" : info.launcher === "cli-start" ? "CLI (start)" : "CLI (run)")} · {info.productVersion}</span></SettingsRow>
    <SettingsRow label={i18n.t("Address")}><span className="break-all">{info.url}</span></SettingsRow>
    <details className="settings-section"><summary>{i18n.t("Details")}</summary>
      <dl className="settings-facts">
        {Object.entries({ protocolVersion: info.protocolVersion, pid: info.pid, startedAt: info.startedAt, access: info.roots.length ? info.roots.join(", ") : "unrestricted", nonLoopback: String(info.nonLoopback), daemonHome: info.daemonHome, executable: info.executable, ...(info.log ? { log: info.log } : {}) }).map(([name, value]) => <Fragment key={name}><dt>{name}</dt><dd className="break-all">{value}</dd></Fragment>)}
      </dl>
    </details>
  </>;
}
