import { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Bell, ChevronDown, ChevronRight, X } from "lucide-react";
import { Button } from "./button.tsx";
import { i18n } from "../../i18n.ts";

export type Notification = {
  id: string; message: string; severity: "info" | "warning" | "error";
  actionLabel?: string;
  reveal?(): void;
  render?(): ReactNode;
  /** Changes to details/navigation, without treating them as a new cause. */
  revision?: string;
  testId?: string;
  context?: string;
  dismissLabel?: string;
};
type RegisteredNotification = Notification & { source?: string };
type Register = (source: string, items?: Notification[]) => void;
const Registry = createContext<Register>(() => {});
const Items = createContext<RegisteredNotification[]>([]);
export const NotificationScope = createContext<{ name: string; reveal(action: () => void): void } | null>(null);

/** In-memory UI state owned by this App instance; never part of document/recovery state. */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<Record<string, RegisteredNotification[]>>({});
  const register = useCallback<Register>((source, items) => setSources(previous => {
    const next = { ...previous };
    if (items?.length) next[source] = items.map(item => ({ ...item, source }));
    else delete next[source];
    return next;
  }), []);
  return <Registry value={register}><Items value={Object.values(sources).flat()}>{children}</Items></Registry>;
}

/** Keep the nonediting history boundary outside the shell while sharing its panel geometry. */
export function ShellNotificationCenter({ panelWidth, sidebarWidth, documentPanelWidth }: { panelWidth: string; sidebarWidth?: number; documentPanelWidth?: number }) {
  return <div className="shell-notifications" style={{ "--notification-panel-width": panelWidth, "--sidebar-width": sidebarWidth ? `${sidebarWidth}px` : undefined, "--document-panel-width": documentPanelWidth ? `${documentPanelWidth}px` : undefined } as CSSProperties}><NotificationCenter items={useContext(Items)} /></div>;
}

/** Callbacks read the latest source render, while registry updates follow observable content. */
export function useNotifications(items: Notification[]) {
  const register = useContext(Registry);
  const scope = useContext(NotificationScope);
  const source = useId();
  const latest = useRef({ items, scope });
  latest.current = { items, scope };
  const signature = JSON.stringify([scope?.name, items.map(({ id, message, severity, revision, testId, dismissLabel, actionLabel, reveal }) =>
    [id, message, severity, revision, testId, dismissLabel, actionLabel, !!reveal])]);
  useLayoutEffect(() => {
    register(source, items.map((item, index) => ({ ...item, id: `${source}:${item.id}`,
      context: scope?.name,
      render: item.render ? () => latest.current.items[index]?.render?.() : undefined,
      reveal: item.reveal ? () => {
        const current = latest.current;
        const action = () => current.items[index]?.reveal?.();
        if (current.scope) current.scope.reveal(action); else action();
      } : undefined,
    })));
  }, [register, source, signature]);
  useLayoutEffect(() => () => register(source), [register, source]);
}

export function NotificationSource({ items }: { items: Notification[] }) { useNotifications(items); return null; }

/** Warnings/errors and explicitly named actions expand once without moving focus. */
export function NotificationCenter({ items }: { items: RegisteredNotification[] }) {
  useTranslation();
  const toggle = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const previousCount = useRef(0);
  const dismissed = useRef(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(() => items.some(item => (item.severity !== "info" || !!item.actionLabel)));
  const [announcement, setAnnouncement] = useState<{ sequence: number; text: string }>();
  const previous = useRef<string[]>([]);
  const visible = items.filter(item => !hidden.includes(item.id));
  // testId already identifies typed producers. Generic errors/standing warnings
  // need their message too, so unrelated causes are not presented as one kind.
  const groups = new Map<string, RegisteredNotification[]>();
  for (const item of visible) {
    const kind = item.testId && !["error", "notice", "writeability-warning"].includes(item.testId) ? item.testId : item.message;
    const key = JSON.stringify([item.source, item.context, item.severity, kind]);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const visibleIds = JSON.stringify(visible.map(item => item.id));
  useLayoutEffect(() => {
    if (!visible.length && previousCount.current) {
      setExpanded(false);
      if (dismissed.current || list.current?.contains(document.activeElement)) toggle.current?.focus();
    } else if (dismissed.current) {
      list.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
    dismissed.current = false;
    previousCount.current = visible.length;
  }, [visibleIds]);
  const dismiss = (entries: Notification[]) => {
    dismissed.current = true;
    setHidden(value => [...value, ...entries.map(item => item.id)]);
  };
  const severity = visible.some(item => item.severity === "error") ? "error" : visible.some(item => item.severity === "warning") ? "warning" : "info";
  const label = i18n.t(severity === "error" ? "Error" : severity === "warning" ? "Warning" : "Information");
  const accessibleLabel = visible.length ? i18n.t("Notifications: {{severity}}, {{count}}", { severity: label, count: visible.length }) : i18n.t("Notifications: none");
  const causes = JSON.stringify(items.map(item => [item.id, item.severity]));
  useLayoutEffect(() => {
    const ids = items.map(item => item.id);
    setHidden(value => value.filter(id => ids.includes(id)));
    if (items.some(item => (item.severity !== "info" || !!item.actionLabel) && !previous.current.includes(item.id))) setExpanded(true);
    if (visible.some(item => !previous.current.includes(item.id))) {
      const text = items.filter(item => item.actionLabel && !previous.current.includes(item.id))
        .map(item => `${item.message} · ${item.actionLabel}`).join(". ") || accessibleLabel;
      setAnnouncement(value => ({ sequence: (value?.sequence ?? 0) + 1, text }));
    }
    previous.current = ids;
  }, [causes]);
  return <>
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="notification-announcement">
      {announcement ? <span key={announcement.sequence}>{announcement.text}</span> : null}
    </div>
    <aside className="notification-center" data-severity={visible.length ? severity : undefined} aria-label={i18n.t("Notifications")}>
    <ul ref={list} hidden={!expanded} id="notification-list" aria-label={i18n.t("Notifications")}>{Array.from(groups, ([key, entries]) => {
      const rows = entries.map(item => <li key={item.id} data-severity={item.severity}>
      <div className="notification-content">
        {entries.length === 1 && item.context ? <p className="notification-context">{item.context}</p> : null}
        <div data-testid={item.testId} role={item.severity === "error" && !item.actionLabel ? "alert" : "status"}>
        {item.render ? item.render() : <p>{item.message}</p>}
        {item.reveal ? <Button className="notification-reveal" size="sm" variant="ghost" onClick={item.reveal}>{item.actionLabel ?? i18n.t("Go to problem")}</Button> : null}
        </div>
      </div>
      <Button size="icon-sm" variant="ghost" aria-label={item.dismissLabel ?? i18n.t("Dismiss notification")}
        onClick={() => dismiss([item])}><X /></Button>
    </li>);
      if (entries.length === 1) return rows;
      const first = entries[0]!;
      const kind = i18n.t(first.testId === "numbering-warning" ? "Numbering warnings" : first.testId === "mermaid-error" ? "Mermaid errors" : first.severity === "error" ? "Error" : first.severity === "warning" ? "Warning" : "Information");
      const summary = i18n.t("{{kind}} · {{count}}", { kind, count: entries.length });
      return <NotificationGroup key={key} summary={summary} context={first.context} severity={first.severity}
        expanded={openGroups.includes(key)} onToggle={() => setOpenGroups(value => value.includes(key) ? value.filter(entry => entry !== key) : [...value, key])}
        onDismiss={() => dismiss(entries)}>{rows}</NotificationGroup>;
    })}{visible.length ? null : <li>{i18n.t("No notifications")}</li>}</ul>
    <Button ref={toggle} size="sm" variant="outline" aria-label={accessibleLabel} aria-expanded={expanded} aria-controls={expanded ? "notification-list" : undefined}
      onClick={() => setExpanded(value => !value)}><Bell />{visible.length ? <span>{label} · {visible.length}</span> : null}</Button>
  </aside></>;
}

function NotificationGroup({ summary, context, severity, expanded, onToggle, onDismiss, children }: {
  summary: string; context?: string; severity: Notification["severity"]; expanded: boolean;
  onToggle(): void; onDismiss(): void; children: ReactNode;
}) {
  const id = useId();
  return <li className="notification-group" data-severity={severity}>
    <div>
      <div className="notification-group-heading">
        <div className="notification-content">
          {context ? <p className="notification-context">{context}</p> : null}
          <Button size="sm" variant="ghost" aria-expanded={expanded} aria-controls={id} onClick={onToggle}>
            {expanded ? <ChevronDown /> : <ChevronRight />}{summary}
          </Button>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label={i18n.t("Dismiss group: {{summary}}", { summary })} onClick={onDismiss}><X /></Button>
      </div>
      <ul id={id} hidden={!expanded} aria-label={summary}>{children}</ul>
    </div>
  </li>;
}
