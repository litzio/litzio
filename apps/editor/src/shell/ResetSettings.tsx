import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { AppResetPlan } from "../../shared/app-reset.ts";
import { Button } from "../components/ui/button.tsx";
import { DangerConfirmation } from "../components/ui/danger-confirmation.tsx";
import { Notice } from "../ui/primitives.tsx";

export function ResetSettings({ desktop }: { desktop: DesktopBridge }) {
  const { t } = useTranslation();
  const button = useRef<HTMLButtonElement>(null);
  const [plan, setPlan] = useState<AppResetPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [removeFolders, setRemoveFolders] = useState(false);
  if (!desktop.resetPlan || !desktop.resetApp) return null;
  return <section className="settings-group" aria-labelledby="reset-app-heading">
    <h3 id="reset-app-heading" className="settings-group-heading">{t("Reset app")}</h3>
    <div className="settings-section">
      <div className="settings-actions"><Button ref={button} size="sm" variant="destructive" disabled={busy} onClick={async () => {
        setProblem(""); setBusy(true);
        try { setPlan(await desktop.resetPlan!()); }
        catch (error) { setProblem((error as Error).message); }
        finally { setBusy(false); }
      }}>{t("Review app reset…")}</Button></div>
      {!plan && problem ? <Notice tone="error">{problem}</Notice> : null}
    </div>
    {plan ? <DangerConfirmation title={t("Reset app?")}
      description={t("All local Litzio data listed below will be permanently deleted. Save your work first. The app will close and restart.")}
      action={t("Delete data and restart")} pending={busy} error={problem} returnFocus={button}
      onClose={() => { setPlan(null); setProblem(""); }} onConfirm={() => {
        setBusy(true); setProblem("");
        void desktop.resetApp!(removeFolders, plan.revision).then(result => { if (!result.ok) setProblem(result.reason); })
          .catch(error => setProblem((error as Error).message)).finally(() => setBusy(false));
      }}>
      <div className="max-h-[45vh] overflow-y-auto space-y-3 text-sm [overflow-wrap:anywhere]">
        <h4 className="font-medium">{t("Data to delete")}</h4>
        <p>{t("Settings, secrets, templates, skills, edited samples, local conversations, recovery and caches.")}</p>
        <details><summary>{t("Deletion locations")}</summary><ul className="list-disc pl-5 space-y-1">
          {Array.from(new Set(plan.targets.map(target => target.path))).map(target => <li key={target}><code>{target}</code></li>)}
        </ul></details>
        <h4 className="font-medium">{t("Data kept outside Litzio")}</h4>
        <p>{t("External documents and plugin source files, other browser profiles (including Litzio origin data), and Codex/Copilot accounts and provider-side data are not deleted. The application and CLI stay installed.")}</p>
        <label className="flex items-start gap-2"><input type="checkbox" checked={removeFolders} disabled={busy} onChange={event => setRemoveFolders(event.target.checked)} />
          <span>{t("Also remove empty settings folders")}</span></label>
        <p>{t("All listed data is deleted either way. Unchecked leaves only empty target folders.")}</p>
      </div>
    </DangerConfirmation> : null}
  </section>;
}
