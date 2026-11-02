import { useEffect, useState } from "react";
import { AI_TASK, type AiExecutionSettings, type AiAgentStatus } from "@litzio/plugin-api/ai";
import type { UiHost } from "@litzio/plugin-api/ui";

export function activate(host: UiHost) {
  function Status() {
    const [status, setStatus] = useState<AiAgentStatus>();
    const [settings, setSettings] = useState<AiExecutionSettings>();
    const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
    const { Input, Button } = host;
    const [problem, setProblem] = useState("");
    useEffect(() => {
      let active = true;
      void host.readJson<AiAgentStatus>(AI_TASK.statusRoute.slice(1), {}).then(value => { if (active) setStatus(value); })
        .catch(() => { if (active) setProblem(host.text("Could not read AI agent status.")); });
      void host.readJson<AiExecutionSettings>(AI_TASK.settingsRoute.slice(1), {}).then(value => { if (active) setSettings(value); })
        .catch(() => { if (active) setProblem(host.text("Could not read AI settings.")); });
      return () => { active = false; };
    }, []);
    const save = async () => {
      if (!settings || busy) return;
      setBusy(true); setProblem(""); setSaved(false);
      try { setSettings(await host.requestJson<AiExecutionSettings>(AI_TASK.settingsRoute.slice(1), "PUT", settings)); setSaved(true); }
      catch (error) { setProblem(`${host.text("Could not save AI settings.")} ${error instanceof Error ? error.message : String(error)}`); }
      finally { setBusy(false); }
    };
    return <section className="settings-section settings-section--stacked" aria-labelledby="ai-agent-title">
      <div className="settings-label">
        <h3 id="ai-agent-title" className="settings-heading">{host.text("AI agent")}</h3>
        <p>{host.text("Runs AI tasks requested by feature plugins. Document review and applying results belong to the requesting feature.")}</p>
      </div>
      <div className="settings-label"><p>{host.text("Shared by all AI tasks. Changes apply to the next task.")}</p></div>
      <label htmlFor="ai-model">{host.text("Model")}</label>
      <Input id="ai-model" value={settings?.model ?? ""} disabled={!settings || busy} onChange={event => { setSettings({ ...settings!, model: event.target.value }); setSaved(false); }} />
      <label htmlFor="ai-effort">{host.text("Reasoning effort")}</label>
      <select id="ai-effort" className="form-select h-[var(--size-control)] w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
        value={settings?.reasoningEffort ?? "medium"} disabled={!settings || busy} onChange={event => { setSettings({ ...settings!, reasoningEffort: event.target.value as AiExecutionSettings["reasoningEffort"] }); setSaved(false); }}>
        {["low", "medium", "high", "xhigh"].map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      <div><Button variant="default" disabled={!settings?.model.trim() || busy} onClick={() => void save()}>{host.text(busy ? "Saving…" : "Save AI settings")}</Button></div>
      {saved ? <p role="status">{host.text("AI settings saved.")}</p> : null}
      <div className="settings-label" role="status">
        {problem ? <p role="alert">{problem}</p> : status ? <>
          <p>{host.text("Adapter")}: {status.adapter}</p>
          <p>{host.text(status.available ? "Available" : "Unavailable")}</p>
          <p>{host.text(status.loginRequired ? "Codex login is required on the Host." : "No additional login is required.")}</p>
        </> : <p>{host.text("Checking…")}</p>}
      </div>
    </section>;
  }
  return { commands: [], sidebar: [], tabs: [], settings: [{ id: AI_TASK.plugin, label: host.text("AI agent"),
    description: host.text("AI task settings and status"), View: Status }], dispose() {} };
}
