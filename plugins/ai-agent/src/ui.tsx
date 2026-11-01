import { useEffect, useState } from "react";
import { AI_TASK, type AiAgentStatus } from "@litzio/plugin-api/ai";
import type { UiHost } from "@litzio/plugin-api/ui";

export function activate(host: UiHost) {
  function Status() {
    const [status, setStatus] = useState<AiAgentStatus>();
    const [problem, setProblem] = useState("");
    useEffect(() => {
      let active = true;
      void host.readJson<AiAgentStatus>(AI_TASK.statusRoute.slice(1), {}).then(value => { if (active) setStatus(value); })
        .catch(() => { if (active) setProblem(host.text("Could not read AI agent status.")); });
      return () => { active = false; };
    }, []);
    return <section className="settings-section settings-section--stacked" aria-labelledby="ai-agent-title">
      <div className="settings-label">
        <h3 id="ai-agent-title" className="settings-heading">{host.text("AI agent")}</h3>
        <p>{host.text("Runs AI tasks requested by feature plugins. Document review and applying results belong to the requesting feature.")}</p>
      </div>
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
    description: host.text("AI task execution status"), View: Status }], dispose() {} };
}
