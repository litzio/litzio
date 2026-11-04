import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
import { Ellipsis } from "lucide-react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { useNotifications } from "@/components/ui/notification-center.tsx";
import { SettingsRow } from "@/components/ui/settings.tsx";
import { connectDesktop, desktopConnection, disconnectDesktop } from "../desktop-connection.ts";
import { i18n } from "../i18n.ts";

// Native errors include Electron wrappers; unknown failures keep a neutral explanation.
function connectionMessage(problem = "") {
  if (problem.includes("protocol mismatch")) return "The local daemon uses an incompatible protocol.";
  if (problem.includes("fetch failed") || problem.includes("not responding")) return "The local daemon is not responding or is incompatible.";
  if (problem.includes("Daemon startup")) return "The local daemon could not be started.";
  return "Cannot connect to the local daemon.";
}

export function DesktopMenu({ desktop }: { desktop: DesktopBridge }) {
  const connection = useSyncExternalStore(desktopConnection.subscribe, desktopConnection.get);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    if (connection.phase !== "connected") return;
    let active = true, checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try { await desktop.checkDaemon(); } catch (error) { if (active) disconnectDesktop(String(error)); }
      finally { checking = false; }
    };
    void check();
    const timer = setInterval(() => { void check(); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [desktop, connection.phase]);
  const busy = connection.phase === "connecting";
  // Keep the same notice through reconnect; its disappearance acknowledges success.
  useNotifications([
    ...(connection.phase !== "connected" ? [{ id: "daemon-disconnected", message: i18n.t(busy ? "Connecting to daemon" : "Disconnected from daemon"), severity: busy ? "info" as const : "error" as const,
      testId: "daemon-disconnected", revision: String(busy), actionLabel: i18n.t("Reconnect"), render: () => <>
        <p>{i18n.t(busy ? "Connecting to daemon" : "Disconnected from daemon")}</p>
        {!busy ? <><p>{i18n.t(connectionMessage(connection.problem))}</p>{connection.version ? <p className="break-all">{connection.version.url}</p> : null}<p>{i18n.t("Reconnect, or use the CLI matching the running daemon to stop it and start the desired version.")}</p></> : null}
        {connection.problem ? <details><summary>{i18n.t("Details")}</summary><p className="break-all">{connection.problem}</p></details> : null}
        <Button className="notification-reveal" variant="ghost" size="sm" disabled={busy} onClick={() => { void connectDesktop(true); }}>{i18n.t("Reconnect")}</Button></> }] : []),
    ...(connection.version && connection.version.productVersion !== connection.version.desktopVersion ? [{ id: "daemon-version", message: i18n.t("Daemon version differs. Restart the daemon with the CLI to switch versions."), severity: "warning" as const }] : []),
    ...(problem ? [{ id: "daemon-problem", message: problem, severity: "error" as const }] : []),
  ]);
  return <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={i18n.t("Desktop menu")} />}><Ellipsis /></DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuItem onClick={() => { void desktop.openInBrowser().catch(error => setProblem(String(error))); }}>{i18n.t("Open in browser")}</DropdownMenuItem>
      <DropdownMenuItem onClick={() => { void desktop.stopDaemon().then(stopped => { if (stopped) disconnectDesktop(); }).catch(error => setProblem(String(error))); }}>{i18n.t("Stop daemon")}</DropdownMenuItem>
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
