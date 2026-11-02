import { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Bell, X } from "lucide-react";
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
type Register = (source: string, items?: Notification[]) => void;
const Registry = createContext<Register>(() => {});
const Items = createContext<Notification[]>([]);
export const NotificationScope = createContext<{ name: string; reveal(action: () => void): void } | null>(null);

/** In-memory UI state owned by this App instance; never part of document/recovery state. */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<Record<string, Notification[]>>({});
  const register = useCallback<Register>((source, items) => setSources(previous => {
    const next = { ...previous };
    if (items?.length) next[source] = items;
    else delete next[source];
    return next;
  }), []);
  return <Registry value={register}><Items value={Object.values(sources).flat()}>{children}</Items></Registry>;
}

/** Render inside the shell so its geometry follows the document and right panels. */
export function ShellNotificationCenter() { return <NotificationCenter items={useContext(Items)} />; }

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
export function NotificationCenter({ items }: { items: Notification[] }) {
  useTranslation();
  const [hidden, setHidden] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(() => items.some(item => (item.severity !== "info" || !!item.actionLabel)));
  const [announcement, setAnnouncement] = useState<{ sequence: number; text: string }>();
  const previous = useRef<string[]>([]);
  const visible = items.filter(item => !hidden.includes(item.id));
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
    <ul hidden={!expanded} id="notification-list" aria-label={i18n.t("Notifications")}>{visible.map(item => <li key={item.id} data-severity={item.severity}>
      <div className="notification-content">
        {item.context ? <p className="notification-context">{item.context}</p> : null}
        <div data-testid={item.testId} role={item.severity === "error" && !item.actionLabel ? "alert" : "status"}>
        {item.render ? item.render() : <p>{item.message}</p>}
        {item.reveal ? <Button className="notification-reveal" size="sm" variant="ghost" onClick={item.reveal}>{item.actionLabel ?? i18n.t("Go to problem")}</Button> : null}
        </div>
      </div>
      <Button size="icon-sm" variant="ghost" aria-label={item.dismissLabel ?? i18n.t("Dismiss notification")}
        onClick={() => setHidden(value => [...value, item.id])}><X /></Button>
    </li>)}{visible.length ? null : <li>{i18n.t("No notifications")}</li>}</ul>
    <Button size="sm" variant="outline" aria-label={accessibleLabel} aria-expanded={expanded} aria-controls={expanded ? "notification-list" : undefined}
      onClick={() => setExpanded(value => !value)}><Bell />{visible.length ? <span>{label} · {visible.length}</span> : null}</Button>
  </aside></>;
}
