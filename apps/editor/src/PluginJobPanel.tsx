import type { ComparisonTarget } from "./review/GeneratedComparison.tsx";
import { JobObservations } from "./job-observations.ts";
import { useEffect, useId, useRef, useState } from "react";
import { JOB_START_FAILURE_MESSAGES, JOB_BATCH_MAX_FILES, type JobContribution, type JobSnapshot, type BatchJobResult } from "@litzio/plugin-sdk";
import type { HostClient } from "./host-client.ts";
import { JobActions, JobState, jobEntries, listJobFolder } from "./PluginJobs.tsx";
import { Info, LoaderCircle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "./components/ui/tooltip.tsx";
import { ChoiceGroup } from "./components/ui/choice-group.tsx";
import { Progress } from "./components/ui/progress.tsx";
import { SettingsSelect } from "./components/ui/settings.tsx";
import { Button } from "./components/ui/button.tsx";
import { Notice } from "./ui/primitives.tsx";
import { i18n } from "./i18n.ts";
import { randomUuid } from "./uuid.ts";

export function PluginJobPanel({ client, plugin, jobIds, roots, active, onOpen, onCompare }: {
  client: HostClient; plugin: string; jobIds: string[]; roots: string[]; active: boolean; onCompare?(target: ComparisonTarget): void; onOpen(path: string): Promise<unknown>;
}) {
  const [bindings, setBindings] = useState<JobContribution[]>([]), [selected, setSelected] = useState(jobIds[0] ?? "");
  const [root, setRoot] = useState(roots[0] ?? ""), [folder, setFolder] = useState("");
  const [entries, setEntries] = useState<{ name: string; path: string; kind: string }[]>([]), [files, setFiles] = useState<string[]>([]);
  const [jobs, setJobs] = useState<JobSnapshot[]>([]), [busy, setBusy] = useState(false), [problem, setProblem] = useState("");
  const observations = useRef(new JobObservations());
  const lifetime = useRef<AbortController | null>(null);
  const request = async (body?: unknown) => {
    const signal = AbortSignal.any([lifetime.current!.signal, AbortSignal.timeout(10000)]);
    const response = await client.request("/api/plugins", { ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}), signal });
    const value = await response.json(); signal.throwIfAborted();
    if (!response.ok) throw new Error(value.error ?? i18n.t("Unavailable"));
    return value;
  };
  const update = (job: JobSnapshot) => setJobs(previous => previous.map(item => item.requestId === job.requestId ? job : item));
  const observe = (action: "job-status" | "job-stop", id: string) => observations.current.observe(id, "action", () => request({ action, requestId: id }), value => update(value.job), error => { throw error; });
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    setBusy(false);
    if (active) void Promise.all([request(), request({ action: "job-list", plugin })]).then(([catalog, history]) => {
      if (controller.signal.aborted) return;
      if (history.warning) setProblem(i18n.t(history.warning));
      setBindings(catalog.plugins.find((p: { id: string }) => p.id === plugin)?.jobs?.filter((job:JobContribution)=>!(job.resultKind==="native-document"&&job.workspace)) ?? []); setJobs(previous => [
        ...history.jobs.filter((job: JobSnapshot) => !previous.some(item => item.requestId === job.requestId)),
        ...previous.map(item => history.jobs.find((job: JobSnapshot) => job.requestId === item.requestId) ?? item),
      ]);
    }).catch(() => { if (!controller.signal.aborted) setProblem(i18n.t("Unavailable")); });
    return () => controller.abort();
  }, [client, plugin, active]);
  const hintId = useId();
  const choice = bindings.find(job => job.id === selected && jobIds.includes(job.id));
  const enabled = active && roots.includes(root);
  const resetFolder = (value: string) => { setFolder(value); setEntries([]); setFiles([]); };
  useEffect(() => {
    const controller = new AbortController();
    if (enabled && root) void listJobFolder(client, root, folder, controller.signal).then(value => { if (!controller.signal.aborted) setEntries(value); }).catch(() => { if (!controller.signal.aborted) setProblem(i18n.t("Cannot list Host folder")); });
    return () => controller.abort();
  }, [client, root, folder, enabled]);
  const running = jobs.filter(job => job.state === "running").map(job => job.requestId).join(",");
  useEffect(() => {
    if (!active || !running) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await Promise.all(running.split(",").map(async requestId => {
        await observations.current.observe(requestId, "poll", async () => {
          const response = await client.request("/api/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "job-status", requestId }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
          if (!response.ok) throw new Error();
          return response.json();
        }, value => { if (!controller.signal.aborted) update(value.job); }, () => {
          if (!controller.signal.aborted) setJobs(previous => previous.map(job => job.requestId === requestId && job.state === "running" ? { ...job, state: "uncertain", result: undefined } : job));
        });
      }));
      if (!controller.signal.aborted) timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 1000); return () => { controller.abort(); clearTimeout(timer); };
  }, [client, active, running]);
  const run = async (action: () => Promise<void>) => {
    const signal = lifetime.current!.signal;
    setBusy(true); setProblem("");
    try { await action(); } catch { if (!signal.aborted) setProblem(i18n.t("The job outcome is uncertain. Check the status before starting again.")); }
    finally { if (!signal.aborted) setBusy(false); }
  };
  return <section className="view-panel plugin-job-panel" data-testid="plugin-job-panel" aria-label={i18n.t("Plugin jobs")}>
    <div className="plugin-job-input">
    {jobIds.length > 1 ? <ChoiceGroup className="plugin-job-choices" aria-label={i18n.t("Job")} value={selected} disabled={!active || busy} onValueChange={value => { setSelected(value); setFiles([]); }} options={bindings.filter(job => jobIds.includes(job.id)).map(job => ({ value: job.id, label: `${job.title} · ${job.accept.join(", ")} → ${job.resultKind === "file" ? job.resultExtension : ".md"}` }))} /> : null}
    <Tooltip><TooltipTrigger render={<div role="group" tabIndex={0} aria-label={root || i18n.t("Open a folder to select input files.")} />}>
      <SettingsSelect label={i18n.t("Opened folder")} value={enabled ? root : ""} disabled={!active || busy} onChange={value => { if (value !== root) { setRoot(value); resetFolder(""); } }} options={[{ value: "", label: "—" }, ...roots.map(value => ({ value, label: value.replace(/[\\/]$/, "").split(/[\\/]/).at(-1) || value }))]} />
    </TooltipTrigger><TooltipContent>{root || i18n.t("Open a folder to select input files.")}</TooltipContent></Tooltip>
    {folder ? <div className="view-controls"><span>{folder}</span><Button variant="secondary" size="sm" disabled={busy} onClick={() => resetFolder("")}>{i18n.t("Return to opened folder")}</Button></div> : null}
    <div className="plugin-job-files" role="group" aria-label={i18n.t("Input file")}>
      {jobEntries(entries, choice).map(entry => entry.kind === "folder" ? <Button key={entry.name} variant="ghost" size="sm" disabled={!enabled || busy} onClick={() => resetFolder(folder ? `${folder}/${entry.name}` : entry.name)}>▸ {entry.name}</Button> : <label key={entry.name}><input type="checkbox" disabled={!enabled || busy || !choice || !files.includes(entry.name) && files.length >= JOB_BATCH_MAX_FILES} checked={files.includes(entry.name)} onChange={event => setFiles(previous => event.target.checked ? [...previous, entry.name] : previous.filter(name => name !== entry.name))} />{entry.name}</label>)}
    </div>
    <div className="view-controls plugin-job-start"><Button aria-describedby={hintId} disabled={!enabled || !choice || !files.length || busy} onClick={() => void run(async () => {
      const signal = lifetime.current!.signal;
      const selectedFiles = files.map(name => folder ? `${folder}/${name}` : name);
      const requestIds = selectedFiles.map(() => randomUuid());
      setFiles([]);
      try {
        const value = await request({ action: "job-start-many", plugin, job: selected, root, files: selectedFiles, requestIds });
        const additions = (value.files as BatchJobResult[]).map(item => item.job ?? { requestId: item.requestId ?? randomUuid(), plugin, job: selected, root, file: item.file, startedAt: Date.now(), state: "failed" as const, phase: "", elapsedMs: 0, stopRequested: false, errorKind: item.errorKind, startFailure: item.startFailure, error: item.error });
        setJobs(previous => [...additions.reverse(), ...previous]);
      } catch {
        if (signal.aborted) return;
        setJobs(previous => [...selectedFiles.map((file, index) => ({ requestId: requestIds[index], plugin, job: selected, root, file, startedAt: Date.now(), state: "uncertain" as const, phase: "", elapsedMs: 0, stopRequested: false })), ...previous]);
        throw new Error();
      }
    })}>{choice?.title ?? i18n.t("Start job")}</Button><span>{i18n.t("{{count}} files selected", { count: files.length })}</span></div>
    <p id={hintId} className="plugin-job-hint" tabIndex={0}>{!active ? i18n.t("Unavailable") : !enabled ? i18n.t("Open a folder to select input files.") : !choice ? i18n.t("Select a job to choose input files.") : !jobEntries(entries, choice).some(entry => entry.kind !== "folder") ? i18n.t("No supported files here. Supported formats: {{formats}}. Choose another folder.", { formats: choice.accept.join(", ") }) : !files.length ? i18n.t("Select files to start this job.") : null}</p>
    </div>
    {jobs.length ?
    <div className="view-table-scroll" role="region" tabIndex={0} aria-label={i18n.t("Plugin jobs")}><table>
      <thead><tr>{(["File", "Result file", "Job", "Status", "Phase", "Elapsed", "Actions"] as const).map(label => <th key={label}>{i18n.t(label)}</th>)}</tr></thead>
      <tbody>{[...jobs].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)).map(job => <tr key={job.requestId}>
        <td>{job.file ?? "—"}</td><td>{job.output ?? "—"}</td><td>{bindings.find(binding => binding.id === job.job)?.title ?? job.job}</td>
        <td><div className="plugin-job-state"><JobState job={job} />{job.error || job.state === "uncertain" ? <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={i18n.t("Job details: {{file}}", { file: job.file ?? job.requestId })} />}><Info aria-hidden="true" /></TooltipTrigger><TooltipContent><div className="space-y-1">
          {job.state === "uncertain" ? <p>{i18n.t("The job outcome is uncertain. Check the status before starting again.")}</p> : null}
          {job.startFailure ? <p>{i18n.t(JOB_START_FAILURE_MESSAGES[job.startFailure.kind])}{job.startFailure.path ? ` ${job.startFailure.path}` : ""}</p> : job.error ? <p>{job.errorKind ? `[${job.errorKind}] ${job.error}` : job.error}</p> : null}
        </div></TooltipContent></Tooltip> : null}</div></td>
        <td className="plugin-job-phase"><div className="plugin-job-phase-label">{job.state === "running" && !job.progress ? <LoaderCircle className="animate-spin" size={16} aria-label={i18n.t("In progress")} /> : null}{job.phase}</div>{job.progress ? <div className="plugin-job-progress"><Progress aria-label={i18n.t("Job progress")} value={job.progress.done} max={job.progress.total} /><span>{job.progress.done}/{job.progress.total}</span></div> : null}</td><td>{Math.floor(job.elapsedMs / 1000)} s</td><td><JobActions compact job={job} busy={busy || !active} request={request} observe={observe} run={run} onOpen={onOpen} onCompare={onCompare} /></td>
      </tr>)}</tbody>
    </table></div> : null}
    {problem ? <Notice tone="error">{problem}</Notice> : null}
  </section>;
}
