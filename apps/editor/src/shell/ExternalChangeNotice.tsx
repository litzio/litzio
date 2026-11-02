import { useNotifications } from "../components/ui/notification-center.tsx";
import { Button } from "../components/ui/button.tsx";
import { i18n } from "../i18n.ts";
import type { EditorSession } from "../DocumentTab.tsx";

/** The same actions serve proactive detection and Save's final revision guard. */
export function ExternalChangeNotice({ session, onReveal, onCompare }: {
  session: EditorSession; onReveal(): void; onCompare(session: EditorSession): void;
}) {
  const conflict = session.status === "save-conflict";
  const message = i18n.t(conflict
    ? "The file changed outside the editor. Your changes are kept. Compare them or reload from disk."
    : "The file changed outside the editor. Reload to see the disk version.");
  const act = (action: () => void) => {
    onReveal();
    requestAnimationFrame(() => { if (session.isCurrent()) action(); });
  };
  useNotifications(session.externalChanged || conflict ? [{
    id: `external-change:${session.externalRevision}:${conflict}`, testId: "external-change", message,
    severity: conflict ? "error" : "warning", revision: `${session.busy}:${conflict}`,
    render: () => <><p>{message}</p><div className="message-actions flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" disabled={session.busy} onClick={() => act(() => { void session.reload(); })}>{i18n.t("Reload from disk")}</Button>
      <Button variant="ghost" size="sm" disabled={session.busy} onClick={() => act(() => onCompare(session))}>{i18n.t("Compare with disk")}</Button>
    </div>{conflict && session.kind === "native" && session.saveFailure ? <details className="save-error-details">
      <summary>{i18n.t("Technical details")}</summary><p>{session.saveFailure.details}</p>
    </details> : null}</>,
  }] : []);
  return null;
}
