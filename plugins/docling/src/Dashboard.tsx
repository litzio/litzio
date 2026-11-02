import { useEffect, useRef, useState } from "react";
import type { UiHost } from "@litzio/plugin-api/ui";
import type { DashboardSnapshot, Features } from "./shared/dashboard.ts";
import type { Request } from "./conversion/ServerSettings.tsx";
import type { ServerCheck } from "./conversion/server-types.ts";
import { doclingFailureMessage } from "./conversion/server-types.ts";
import { phases } from "./conversion/ConversionDialog.tsx";
import "./dashboard.css";
import { ReviewPanel } from "./ReviewPanel.tsx";

export function Dashboard({ host, request, convert, compare }: { host: UiHost; request: Request;
  convert(focus: HTMLElement | null, path?: string): void; compare(focus: HTMLElement | null): void }) {
  const { text, Button } = host;
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>();
  const [problem, setProblem] = useState("");
  const [pending, setPending] = useState(false), pendingRef = useRef(false);
  const generation = useRef(0);
  const [checking, setChecking] = useState(true), checkingRef = useRef(false);
  const [connection, setConnection] = useState<{ report?: ServerCheck; at: number; server: string }>();
  const [now, setNow] = useState(Date.now());
  const alive = useRef(true);
  const refresh = async (afterAction = false) => {
    const version = generation.current;
    const [value, agent] = await Promise.all([request<DashboardSnapshot>("dashboard"), request<DashboardSnapshot["agent"]>("review-agent")]);
    value.agent = agent;
    if (alive.current && version === generation.current && (!pendingRef.current || afterAction)) { setSnapshot(value); setNow(Date.now()); }
    return value;
  };
  const check = async () => {
    if (checkingRef.current) return;
    checkingRef.current = true; setChecking(true);
    try {
      const value = await refresh();
      const report = await request<ServerCheck>("dashboard", "POST", {});
      if (alive.current) setConnection({ report, at: Date.now(), server: value.server });
    } catch (error) { if (alive.current) { setConnection({ at: Date.now(), server: "" }); setProblem(String(error)); } }
    finally { checkingRef.current = false; if (alive.current) setChecking(false); }
  };
  useEffect(() => {
    alive.current = true;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await refresh(); } catch (error) { if (!stopped) setProblem(String(error)); }
      finally { if (!stopped) timer = setTimeout(poll, 1000); }
    };
    void check().then(() => { if (!stopped) timer = setTimeout(poll, 1000); });
    return () => { stopped = true; alive.current = false; clearTimeout(timer); };
  }, []);
  const act = async (action: () => Promise<unknown>) => {
    if (pendingRef.current) return;
    generation.current++; pendingRef.current = true; setPending(true); setProblem("");
    try { await action(); await refresh(true); }
    catch (error) { if (alive.current) setProblem(error instanceof Error ? error.message : String(error)); }
    finally { pendingRef.current = false; if (alive.current) setPending(false); }
  };
  const changeFeature = (name: keyof Features, enabled: boolean) => {
    if (!snapshot || pendingRef.current) return;
    setSnapshot({ ...snapshot, features: { ...snapshot.features, [name]: enabled } });
    return act(async () => {
      try { await request("features", "PUT", { [name]: enabled }); }
      catch (error) { await refresh(true); throw error; }
    });
  };
  const formatTime = (value: number) => new Date(value).toLocaleString(document.documentElement.lang);
  const fileName = (path: string) => path.split(/[\\/]/u).at(-1) ?? path;
  const focus = () => document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // A newly enabled action must belong to the new activation. Showing it from
  // the save response first would call the still-disabled activation's handler.
  const selectedFeatures = snapshot?.features;
  const features = selectedFeatures && {
    conversion: selectedFeatures.conversion && host.features?.conversion !== false,
    comparison: selectedFeatures.comparison && host.features?.comparison !== false,
  };
  const running = snapshot?.requests.some(record => record.status === "running");
  return <div className="docling-dashboard" data-testid="docling-dashboard">
    <header><h1>{text("Docling dashboard")}</h1><p>{text("Convert PDFs and open conversion folders for comparison.")}</p></header>
    {problem ? <p role="alert">{problem}</p> : null}
    <section aria-labelledby="docling-connection-title">
      <h2 id="docling-connection-title">{text("Connection status")}</h2>
      <div className="docling-dashboard-row">
        <div className="docling-dashboard-details"><p className="docling-dashboard-path">{snapshot?.server ?? text("Loading…")}</p>
          <p role="status">{text(checking ? "Checking…" : connection?.report?.ok && connection.server === snapshot?.server ? "Connected" : "Not connected")}</p>
          <p className="docling-dashboard-meta">{text("Last checked")}: {connection && connection.server === snapshot?.server ? formatTime(connection.at) : text("Not checked yet")}</p></div>
        <div className="docling-dashboard-actions"><Button variant="secondary" disabled={checking} onClick={() => void check()}>{text("Check again")}</Button>
          {features?.conversion ? <Button onClick={() => host.openSettings("server", focus())}>{text("Settings")}</Button> : null}</div>
      </div>
      <p className="docling-dashboard-meta">{text("Connection checks verify version and readiness, not conversion models. The server operator must prepare the profile models.")}</p>
    </section>
    <section aria-labelledby="docling-jobs-title">
      <h2 id="docling-jobs-title">{text("Conversion jobs")}</h2>
      {!snapshot ? <p>{text("Loading…")}</p> : !snapshot.requests.length ? <p className="docling-dashboard-meta">{text("No conversion jobs yet.")}</p> :
        <ul className="docling-dashboard-list">{snapshot.requests.map(({ job, status, canCancel }) => <li key={job.id} data-request-id={job.id} data-state={status}>
          <div className="docling-dashboard-row"><div className="docling-dashboard-details">
            <h3 title={job.input}>{fileName(job.input)}</h3>
            <p><span className={`docling-dashboard-state docling-dashboard-state--${status}`}>{text(status === "running" ? "In progress" : status === "success" ? "Completed" : status === "uncertain" ? "Uncertain" : status === "cancelled" ? "Waiting stopped" : "Failed")}</span>
              <span className="docling-dashboard-meta"> · {formatTime(job.finishedAt ?? job.startedAt)}</span></p>
            {status === "running" ? <p>{text(phases[job.progress.phase])} · {text("Elapsed: {{seconds}} s", { seconds: Math.max(0, Math.floor((now - job.startedAt) / 1000)) })}</p> : null}
            {status === "error" ? <p>{text(doclingFailureMessage(job.failure))}</p> : null}
            {status === "uncertain" ? <p>{text("The outcome is uncertain. Check the server task before starting again. Clearing the record does not stop the server task.")}</p> : null}
            {job.progress.taskId ? <p className="docling-dashboard-meta">{text("Server task")}: {job.progress.taskId}</p> : null}
          </div><div className="docling-dashboard-actions">
            {status === "running" && canCancel ? <Button variant="secondary" disabled={pending} onClick={() => void act(() => request("history", "POST", { id: job.id }))}>{text("Stop waiting")}</Button> : null}
            {status === "running" && !canCancel ? <span className="docling-dashboard-meta">{text("Controlled by another Host")}</span> : null}
            {features?.conversion && (status === "error" || status === "cancelled" || status === "uncertain") ? <Button variant="secondary" disabled={pending || running} onClick={() => convert(focus(), job.input)}>{text(status === "uncertain" ? "Start again…" : "Retry…")}</Button> : null}
            {status === "uncertain" ? <Button disabled={pending} onClick={() => void act(() => request("history", "DELETE", { id: job.id }))}>{text("Clear record")}</Button> : null}
          </div></div>
        </li>)}</ul>}
      {running ? <p className="docling-dashboard-meta">{text("Stopping cancels only {{product}} requests and waiting. It does not cancel the Docling server task.")}</p> : null}
    </section>
    <section aria-labelledby="docling-results-title">
      <p role="status">{text("AI agent")}: {text(!snapshot?.agent ? "Off" : snapshot.agent.loginRequired ? "Login required" : snapshot.agent.available ? "Available" : "Unavailable")}</p>
      <h2 id="docling-results-title">{text("Recent conversion results")}</h2>
      {!snapshot?.results.length ? <p className="docling-dashboard-meta">{text("No conversion results yet.")}</p> : <ul className="docling-dashboard-list">{snapshot.results.map(result => <li key={result.id} data-result-id={result.id}>
        <div className="docling-dashboard-row"><div className="docling-dashboard-details">
          <h3>{result.name ?? fileName(result.folder)}</h3>
          <p className="docling-dashboard-meta">{result.pages === undefined ? "" : `${text("doclingPages", { count: result.pages })} · `}{formatTime(result.convertedAt)}</p>
          <p className="docling-dashboard-path">{result.folder}</p>
          <p>{text(result.missing ? "The result folder no longer exists." : result.problem ?? (result.stale ? "Correspondence map is stale" : "Correspondence map is current"))}</p>
        </div><div className="docling-dashboard-actions">
          {features?.comparison ? <Button disabled={pending || !!result.missing || !!result.problem} onClick={() => void act(() => host.openTab("comparison", result.folder))}>{text("Open comparison")}</Button> : null}
          <Button disabled={pending || !!result.missing || !!result.problem} onClick={() => void act(() => host.openDocument(result.path))}>{text("Open document")}</Button>
          <Button disabled={pending || !!result.missing} onClick={() => void act(async () => { const error = await host.openFolder(result.folder); if (error) throw new Error(error); })}>{text("Open folder")}</Button>
        </div></div>
        {!result.missing && !result.problem ? <ReviewPanel host={host} folder={result.folder} agentReady={!!snapshot.agent?.available && !snapshot.agent.loginRequired} summary /> : null}
      </li>)}</ul>}
    </section>
    <section aria-labelledby="docling-features-title">
      <h2 id="docling-features-title">{text("Features")}</h2>
      <div className="docling-dashboard-features">{(["conversion", "comparison", "review"] as const).map(name => <label key={name}>
        <input type="checkbox" checked={selectedFeatures?.[name] ?? (host.features?.[name] !== false)} disabled={!selectedFeatures || pending} onChange={event => void changeFeature(name, event.target.checked)} />
        {text(name === "conversion" ? "PDF conversion" : name === "comparison" ? "Docling comparison" : "Structure review")}
      </label>)}</div>
      <p className="docling-dashboard-meta">{text("Disabling a feature hides its controls. Accepted jobs keep running; open comparison tabs are retained in a disabled state.")}</p>
    </section>
    <section aria-labelledby="docling-quick-title">
      <h2 id="docling-quick-title">{text("Quick actions")}</h2>
      <div className="docling-dashboard-actions">
        {features?.conversion ? <Button variant="secondary" disabled={pending || running} onClick={() => convert(focus())}>{text("Convert PDF…")}</Button> : null}
        {features?.comparison ? <Button variant="secondary" onClick={() => compare(focus())}>{text("Open conversion folder…")}</Button> : null}
        {features && !features.conversion && !features.comparison ? <p className="docling-dashboard-meta">{text("Enable a feature to use quick actions.")}</p> : null}
      </div>
    </section>
  </div>;
}
