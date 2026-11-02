import { useEffect, useRef, useState } from "react";
import type { UiHost } from "@litzio/plugin-api/ui";
import type { DashboardSnapshot } from "./shared/dashboard.ts";
import type { Request } from "./conversion/ServerSettings.tsx";
import type { ConversionJob, ServerCheck } from "./conversion/server-types.ts";
import { doclingFailureMessage } from "./conversion/server-types.ts";
import { phases } from "./conversion/ConversionDialog.tsx";
import "./dashboard.css";
import { ReviewPanel } from "./ReviewPanel.tsx";

export function Dashboard({ host, request, convert, compare, onStopped }: { host: UiHost; request: Request;
  onStopped(job: ConversionJob): void;
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
  const [filter, setFilter] = useState("all"), [limit, setLimit] = useState(10);
  const results = new Map(snapshot?.results.map(result => [result.id, result]));
  const attention = (id: string, status: string) => status === "error" || !!results.get(id)?.stale || !!results.get(id)?.pendingProposals;
  const records = snapshot?.requests ?? [];
  const counts = { running: records.filter(r => r.status === "running").length, error: records.filter(r => r.status === "error").length,
    attention: records.filter(r => attention(r.job.id, r.status)).length, success: records.filter(r => r.status === "success").length };
  const filtered = records.filter(r => filter === "all" || (filter === "attention" ? attention(r.job.id, r.status) : r.status === filter))
    .sort((a, b) => (b.job.finishedAt ?? b.job.startedAt) - (a.job.finishedAt ?? a.job.startedAt));
  const choose = (value: string) => { setFilter(value); setLimit(10); };
  const labels: Record<string, string> = { running: "In progress", error: "Failed", attention: "Needs attention", success: "Completed", uncertain: "Uncertain", cancelled: "Waiting stopped" };
  const chip = (status: string, label = labels[status] ?? status) => <span className={`docling-dashboard-state docling-dashboard-state--${status}`}>{text(label)}</span>;
  const relative = (time: number) => {
    const seconds = Math.max(0, Math.floor((now - time) / 1000));
    const unit = seconds < 60 ? "second" : seconds < 3600 ? "minute" : seconds < 86400 ? "hour" : "day";
    return new Intl.RelativeTimeFormat(document.documentElement.lang, { numeric: "auto" }).format(-Math.floor(seconds / ({ second: 1, minute: 60, hour: 3600, day: 86400 }[unit])), unit);
  };
  const busyReason = pending ? text("Loading…") : running ? text("A conversion is already in progress.") : "";
  const convertButton = () => features?.conversion ? <span title={busyReason}><Button variant="default" disabled={pending || running} onClick={() => convert(focus())}>{text("Convert PDF…")}</Button></span> : null;
  return <div className="docling-dashboard" data-testid="docling-dashboard">
    <header className="docling-dashboard-row"><div className="docling-dashboard-details"><h1>{text("Docling dashboard")}</h1><p className="docling-dashboard-meta">{text("Convert PDFs and open conversion folders for comparison.")}</p></div>
      <div className="docling-dashboard-actions">{features?.comparison ? <Button onClick={() => compare(focus())}>{text("Open conversion folder…")}</Button> : null}{convertButton()}
        <Button onClick={() => host.openSettings("server", focus())}>{text("Settings")}</Button></div></header>
    {busyReason ? <p className="docling-dashboard-meta" role="status">{busyReason}</p> : null}
    {problem ? <p role="alert">{problem}</p> : null}
    <section className="docling-dashboard-summary" aria-label={text("Connection status")}>
      <div><p><span className={`docling-dashboard-dot ${connection?.report?.ok && connection.server === snapshot?.server ? "is-connected" : ""}`} />{text("Docling server")}: <span role="status">{text(checking ? "Checking…" : connection?.report?.ok && connection.server === snapshot?.server ? "Connected" : "Not connected")}</span></p>
        <p><span className={`docling-dashboard-dot ${snapshot?.agent?.available && !snapshot.agent.loginRequired ? "is-connected" : ""}`} />{text("AI agent")}: {text(!snapshot?.agent ? "Off" : snapshot.agent.loginRequired ? "Login required" : snapshot.agent.available ? "Available" : "Unavailable")}</p>
        <span title={checking ? text("Checking…") : undefined}><Button disabled={checking} onClick={() => void check()}>{text("Check again")}</Button></span></div>
      {Object.entries(counts).map(([key, count]) => <button type="button" key={key} className="docling-dashboard-count" aria-pressed={filter === key} onClick={() => choose(filter === key ? "all" : key)}><span>{text(labels[key]!)}</span><strong>{count}</strong></button>)}
    </section>
    <div className="docling-dashboard-priority"><section><h2>{text("Needs attention")} · {counts.attention}</h2>
      <p className="docling-dashboard-meta">{text("Failed conversions, stale maps and pending proposals.")}</p>
      {records.filter(r => attention(r.job.id, r.status)).slice(0, 3).map(({ job, status }) => <p key={job.id}>{chip(status === "error" ? "error" : "attention", status === "error" ? "Failed" : results.get(job.id)?.stale ? "Correspondence map is stale" : "Pending proposals")} {fileName(job.input)}</p>)}
      <Button onClick={() => choose("attention")}>{text("Show all")}</Button></section>
      <section><h2>{text("In progress")} · {counts.running}</h2>
        {records.filter(r => r.status === "running").map(({ job, canCancel }) => <div key={job.id} data-request-id={job.id}><strong>{fileName(job.input)}</strong> {chip("running")}
          <p>{text(phases[job.progress.phase])} · {text("Elapsed: {{seconds}} s", { seconds: Math.max(0, Math.floor((now - job.startedAt) / 1000)) })}</p>
          <progress max={Object.keys(phases).length} value={Object.keys(phases).indexOf(job.progress.phase) + 1} aria-label={text(phases[job.progress.phase])} />
          {canCancel ? <div><span title={pending ? text("Loading…") : undefined}><Button disabled={pending} onClick={() => void act(async () => { const stopped = await request<ConversionJob>("history", "POST", { id: job.id }); onStopped(stopped); })}>{text("Stop waiting")}</Button></span><p className="docling-dashboard-meta">{text("Stopping cancels only {{product}} requests and waiting. It does not cancel the Docling server task.")}</p></div> : <p>{text("Controlled by another Host")}</p>}</div>)}
        {!counts.running ? <p className="docling-dashboard-meta">{text("No conversion jobs yet.")}</p> : null}</section></div>
    <section aria-labelledby="docling-results-title"><div className="docling-dashboard-row"><h2 id="docling-results-title">{text("Recent conversion results")} · {text(filter === "all" ? "All" : labels[filter]!)}</h2>{filter !== "all" ? <Button onClick={() => choose("all")}>{text("Show all")}</Button> : null}</div>
      {!snapshot ? <p>{text("Loading…")}</p> : !records.length ? <div className="docling-dashboard-empty"><p>{text("No conversion results yet.")}</p>{convertButton()}</div> : <>
        <div className="docling-dashboard-table-scroll"><table><thead><tr>{["Original file", "Pages", "Converted", "Correspondence map", "Pending proposals", "Actions"].map(label => <th key={label} scope="col">{text(label)}</th>)}</tr></thead>
          <tbody>{filtered.slice(0, limit).map(({ job, status }) => {
            const result = results.get(job.id), unavailable = result?.missing ? "The result folder no longer exists." : result?.problem;
            const reason = pending ? "Loading…" : unavailable || (!features?.comparison ? "Docling comparison is disabled." : !result ? "No conversion results yet." : "");
            return <tr key={job.id} data-result-id={result?.id} data-record-id={job.id} data-state={status}>
              <th scope="row" title={job.input}>{fileName(job.input)}<div>{chip(status)}</div>{status === "error" ? <p className="docling-dashboard-meta">{text(doclingFailureMessage(job.failure))}</p> : null}{status === "uncertain" ? <p className="docling-dashboard-meta">{text("The outcome is uncertain. Check the server task before starting again. Clearing the record does not stop the server task.")}</p> : null}</th>
              <td>{result?.pages ?? "—"}</td><td title={new Date(job.finishedAt ?? job.startedAt).toLocaleString()}>{relative(job.finishedAt ?? job.startedAt)}</td>
              <td>{result ? chip(unavailable ? "error" : result.stale ? "attention" : "success", unavailable || (result.stale ? "Correspondence map is stale" : "Correspondence map is current")) : "—"}</td><td>{result ? <span className="docling-dashboard-state">{result.pendingProposals ?? "—"}</span> : "—"}</td>
              <td><div className="docling-dashboard-actions">{result ? <span title={text(reason)}><Button variant="secondary" disabled={!!reason} onClick={() => void act(() => host.openTab("comparison", result!.folder))}>{text("Open comparison")}</Button></span> : null}
                <details className="docling-dashboard-menu" onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary aria-label={`${text("Actions")}: ${fileName(job.input)}`}>⋯</summary><div className="docling-dashboard-menu-content">
                  {result ? <><span title={text(pending ? "Loading…" : unavailable || "")}><Button disabled={pending || !!unavailable} onClick={() => void act(() => host.openDocument(result.path))}>{text("Open document")}</Button></span>
                    <span title={text(pending ? "Loading…" : result.missing ? "The result folder no longer exists." : "")}><Button disabled={pending || !!result.missing} onClick={() => void act(async () => { const error = await host.openFolder(result.folder); if (error) throw new Error(error); })}>{text("Open folder")}</Button></span>
                    {!unavailable ? <ReviewPanel host={host} folder={result.folder} agentReady={!!snapshot.agent?.available && !snapshot.agent.loginRequired} summary /> : null}</> : features?.conversion && status !== "running" ? <span title={busyReason}><Button disabled={pending || running} onClick={() => convert(focus(), job.input)}>{text(status === "uncertain" ? "Start again…" : "Retry…")}</Button></span> : null}
                  <span title={text(status === "uncertain" ? pending ? "Loading…" : "" : "Only an uncertain request record can be cleared.")}><Button disabled={pending || status !== "uncertain"} onClick={() => void act(() => request("history", "DELETE", { id: job.id }))}>{text("Clear record")}</Button></span>
                </div></details></div>{result && reason ? <p className="docling-dashboard-meta">{text(reason)}</p> : null}</td></tr>;
          })}</tbody></table></div>{!filtered.length ? <p>{text("No matching conversions.")}</p> : null}
        {filtered.length > limit ? <Button onClick={() => setLimit(value => value + 10)}>{text("Show more")}</Button> : null}</>}
    </section></div>;
}
