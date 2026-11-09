import { JobObservations } from "./job-observations.ts";
import { randomUuid } from "./uuid.ts";
import { i18n } from "./i18n.ts";
import { useEffect, useRef, useState } from "react";
import { defaultJobOutput, type JobContribution, type JobSnapshot } from "@litzio/plugin-sdk";
import { CopyButton } from "./components/CopyButton.tsx";
import type { HostClient } from "./host-client.ts";
import { hostLabel } from "./host-client.ts";
import { Button } from "./components/ui/button.tsx";
import { SettingsSelect, SettingsInput } from "./components/ui/settings.tsx";
import { Progress } from "./components/ui/progress.tsx";
import { Notice } from "./ui/primitives.tsx";
import "./views/views.css";

class JobRefused extends Error {}
const stateLabels = { running: "In progress", completed: "Completed", failed: "Failed", stopped: "Cancelled", uncertain: "Outcome uncertain" } as const;

type FileSelection = { root: string; relativePath: string };

type Plugin = { id: string; name: string; running: boolean; jobs?: JobContribution[] };
export function PluginJobs({ client, hostId, roots, active, onOpen }: { client: HostClient; hostId: string; roots: string[]; active: boolean; onOpen(path: string): Promise<unknown> }) {
  const [plugins, setPlugins] = useState<Plugin[]>([]), [selected, setSelected] = useState("");
  const [root, setRoot] = useState(roots[0] ?? ""), [folder, setFolder] = useState("");
  const [entries, setEntries] = useState<{ path: string; name: string; kind: string }[]>([]), [file, setFile] = useState<FileSelection>(), [output, setOutput] = useState("result.md");
  const [job, setJob] = useState<JobSnapshot>(), [problem, setProblem] = useState(""), [busy, setBusy] = useState(false);
  const changeRoot = (next: string) => {
    if (next !== root) { setRoot(next); setFolder(""); setFile(undefined); setEntries([]); }
  };
  const requestId = job?.requestId;
  const [recent, setRecent] = useState<JobSnapshot[]>([]);
  useEffect(() => { if (job) setRecent(previous => [job, ...previous.filter(item => item.requestId !== job.requestId)]); }, [job]);
  const observations = useRef(new JobObservations());
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  const request = async (body?: unknown) => {
    const signal = lifetime.current!.signal;
    const response = await client.request("/api/plugins", { ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}), signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
    const value = await response.json(); signal.throwIfAborted();
    if (!response.ok) { const message = value.error ?? "Job request failed"; throw response.status >= 400 && response.status < 500 ? new JobRefused(message) : new Error(message); } return value;
  };
  const observe = (action: "job-status" | "job-stop", id: string) => observations.current.observe(id, "action", () => request({ action, requestId: id }), value => setJob(value.job), error => { throw error; });
  useEffect(() => {
    void Promise.all([request(), request({ action: "job-list" })]).then(([catalog, history]) => {
      setPlugins(catalog.plugins); setRecent(history.jobs);
      const latest = history.jobs.find((item: JobSnapshot) => ["running", "uncertain"].includes(item.state)) ?? history.jobs[0];
      if (latest) { setJob(latest); changeRoot(latest.root); setSelected(`${latest.plugin}/${latest.job}`); }
    }).catch(error => { if (!lifetime.current?.signal.aborted) setProblem(String(error)); });
  }, [client]);
  const choices = plugins.filter(plugin => plugin.running).flatMap(plugin => (plugin.jobs ?? []).map(binding => ({ plugin, binding, key: `${plugin.id}/${binding.id}` })));
  const choice = choices.find(item => item.key === selected);
  useEffect(() => {
    if (choice && file) setOutput(defaultJobOutput(choice.binding, file.relativePath));
  }, [selected, file]);
  const locked = busy || !!job && ["running", "uncertain"].includes(job.state);
  useEffect(() => {
    const controller = new AbortController();
    if (root && active && !locked) void listJobFolder(client, root, folder, controller.signal).then(value => { if (!controller.signal.aborted) setEntries(value); }).catch(error => { if (!controller.signal.aborted) setProblem(String(error)); });
    return () => controller.abort();
  }, [client, root, folder, active, locked]);
  useEffect(() => {
    if (!active || !requestId || job?.state !== "running" || busy) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await observations.current.observe(requestId, "poll", async () => {
        const response = await client.request("/api/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "job-status", requestId }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) throw new Error();
        return response.json();
      }, value => { if (!controller.signal.aborted) setJob(value.job); }, () => {
        if (!controller.signal.aborted) setJob(previous => previous?.requestId === requestId ? { ...previous, state: "uncertain", result: undefined } : previous);
      });
      if (!controller.signal.aborted) timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 1000); return () => { controller.abort(); clearTimeout(timer); };
  }, [active, requestId, job?.state, busy, client]);
  const run = async (action: () => Promise<void>) => { setBusy(true); setProblem(""); try { await action(); } catch (error) { if (!lifetime.current?.signal.aborted) { setProblem(String(error)); setJob(previous => previous?.state === "running" ? { ...previous, state: "uncertain", result: undefined } : previous); } } finally { if (!lifetime.current?.signal.aborted) setBusy(false); } };
  return <div className="views-page" data-testid="plugin-jobs"><header><h2>{i18n.t("Plugin jobs")}</h2><p>{hostLabel(hostId)}</p></header>
    <div>
      {recent.length ? <SettingsSelect label={i18n.t("Recent jobs")} value={requestId ?? ""} disabled={busy} onChange={id => { const item = recent.find(item => item.requestId === id); if (item) { setJob(item); changeRoot(item.root); setSelected(`${item.plugin}/${item.job}`); setProblem(""); } }} options={recent.map(item => ({ value: item.requestId, label: `${plugins.find(plugin => plugin.id === item.plugin)?.name ?? item.plugin} · ${i18n.t(stateLabels[item.state])} · ${Math.floor(item.elapsedMs / 1000)}s` }))} /> : null}
      <SettingsSelect label={i18n.t("Job")} value={selected} disabled={locked} onChange={setSelected} options={[{ value: "", label: "—" }, ...choices.map(item => ({ value: item.key, label: `${item.plugin.name} · ${item.binding.title}` }))]} />
      <SettingsSelect label={i18n.t("Opened folder")} description={i18n.t("Select a file on this Host. No Desktop upload.")} value={root} disabled={locked} onChange={changeRoot} options={[{ value: "", label: "—" }, ...roots.map(value => ({ value, label: value }))]} />
      <SettingsSelect label={i18n.t("Input file")} description={folder || undefined} value={file?.root === root ? file.relativePath.split("/").at(-1)! : ""} disabled={locked || !choice} onChange={name => {
        const entry = entries.find(item => item.name === name);
        if (!entry) { setFile(undefined); return; }
        const relativePath = folder ? `${folder}/${entry.name}` : entry.name;
        if (entry.kind === "folder") { setFolder(relativePath); setFile(undefined); setEntries([]); }
        else setFile({ root, relativePath });
      }} options={[{ value: "", label: "—" }, ...jobEntries(entries, choice?.binding).map(entry => ({ value: entry.name, label: `${entry.kind === "folder" ? "▸ " : ""}${entry.name}` }))]} />
      {folder ? <Button size="sm" variant="secondary" disabled={locked} onClick={() => { setFolder(""); setFile(undefined); setEntries([]); }}>{i18n.t("Return to opened folder")}</Button> : null}
      <SettingsInput label={i18n.t("Result path in Root")} value={output} disabled={locked} onChange={setOutput} />
    </div>
    <div className="view-controls">
    <Button disabled={locked || !choice || !file || file.root !== root || !output} onClick={() => void run(async () => {
      if (!file || file.root !== root) return;
      const id = randomUuid();
      const initial: JobSnapshot = { requestId: id, plugin: choice!.plugin.id, job: choice!.binding.id, root, elapsedMs: 0, state: "running", phase: "Starting", stopRequested: false }; setJob(initial);
      try { const value = await request({ action: "job-start", plugin: initial.plugin, job: initial.job, requestId: id, root, file: file.relativePath, output }); setJob(value.job); }
      catch (error) { if (!lifetime.current?.signal.aborted) {
        if (error instanceof JobRefused) { setProblem(error.message); setJob({ ...initial, state: "failed", phase: "", error: undefined }); }
        else setJob({ ...initial, state: "uncertain" });
      } }
    })}>{i18n.t("Start job")}</Button></div>
    {job ? <section className="view-panel plugin-job-status" aria-live="polite">
      <div className="view-controls plugin-job-summary">
        <JobState job={job} />
        {job.state === "running" && job.phase ? <p>{job.phase}</p> : null}
        <p>{i18n.t("Elapsed: {{seconds}} s", { seconds: Math.floor(job.elapsedMs / 1000) })}</p>
      </div>
      {job.progress ? <div className="plugin-job-progress"><Progress aria-label={i18n.t("Job progress")} max={job.progress.total} value={job.progress.done} /><span>{job.progress.done}/{job.progress.total}</span></div> : null}
      {job.state === "uncertain" ? <Notice tone="warning">{i18n.t("The job outcome is uncertain. Check the status before starting again.")}</Notice> : null}
      {job.error ? <Notice tone="error">{job.errorKind ? `[${job.errorKind}] ${job.error}` : job.error}</Notice> : null}
      <JobActions job={job} busy={busy} request={request} observe={observe} run={run} onOpen={onOpen} />
    </section> : null}
    {problem ? <Notice tone="error">{problem}</Notice> : null}
  </div>;
}

export function JobState({ job }: { job: JobSnapshot }) {
  return <span className="host-status" role="status" aria-label={i18n.t("Job status")} data-tone={job.state === "failed" ? "danger" : job.state === "uncertain" ? "warning" : job.state === "stopped" ? "muted" : "connected"}>
          <span className="agent-dot" aria-hidden="true" />
          {i18n.t(job.state === "running" && job.stopRequested ? "Cancellation requested" : stateLabels[job.state])}
        </span>;
}
export function JobActions({ job, busy, request, observe, run, onOpen, compact = false }: { compact?: boolean; job: JobSnapshot; busy: boolean; request(body: unknown): Promise<any>; observe(action: "job-status" | "job-stop", id: string): Promise<void>; run(action: () => Promise<void>): Promise<void>; onOpen(path: string): Promise<unknown> }) {
  const requestId = job.requestId;
  return <>      <div className="view-controls">
        {job.state === "uncertain" ? <Button variant={compact ? "ghost" : "secondary"} size={compact ? "sm" : "default"} disabled={busy} onClick={() => void run(() => observe("job-status", requestId))}>{i18n.t("Recheck status")}</Button> : null}
        {job.state === "running" && !job.stopRequested ? <Button variant={compact ? "ghost" : "secondary"} size={compact ? "sm" : "default"} disabled={busy} onClick={() => void run(() => observe("job-stop", requestId))}>{i18n.t("Request cancellation")}</Button> : null}
        {job.state === "completed" && job.result?.kind !== "file" ? <Button variant={compact ? "ghost" : "default"} size={compact ? "sm" : "default"} aria-label={compact ? i18n.t("Open result: {{file}}", { file: job.file ?? job.requestId }) : undefined} disabled={busy} onClick={() => void run(async () => { const value = await request({ action: "job-result", requestId }); await onOpen(value.job.result.path); })}>{i18n.t(compact ? "Open" : "Open result document")}</Button> : null}
      </div>
      {job.state === "completed" && job.result?.kind === "file" ? <div className="view-controls plugin-job-file-result">{compact ? null : <p>{job.result.path}</p>}<CopyButton text={job.result.path} label={i18n.t("Copy result path")} /></div> : null}</>;
}
export function jobEntries(entries: { name: string; path: string; kind: string }[], choice?: JobContribution) {
  return entries.filter(entry => entry.kind === "folder" || choice?.accept.some(extension => entry.name.toLowerCase().endsWith(extension)));
}
export async function listJobFolder(client: HostClient, root: string, folder: string, signal: AbortSignal) {
  const response = await client.request(`/api/folder?${new URLSearchParams({ root, path: folder ? `${root.replace(/[\\/]$/, "")}/${folder}` : root })}`, { signal });
  if (!response.ok) throw new Error("Cannot list Host folder");
  return (await response.json()).entries as { name: string; path: string; kind: string }[];
}
