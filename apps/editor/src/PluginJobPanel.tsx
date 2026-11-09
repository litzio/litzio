import { useEffect, useRef, useState } from "react";
import { JOB_BATCH_MAX_FILES, type JobContribution, type JobSnapshot, type BatchJobResult } from "@litzio/plugin-sdk";
import type { HostClient } from "./host-client.ts";
import { JobActions, JobState, jobEntries, listJobFolder } from "./PluginJobs.tsx";
import { SettingsSelect } from "./components/ui/settings.tsx";
import { Button } from "./components/ui/button.tsx";
import { Notice } from "./ui/primitives.tsx";
import { i18n } from "./i18n.ts";
import { randomUuid } from "./uuid.ts";

export function PluginJobPanel({ client, plugin, jobIds, roots, active, onOpen }: {
  client: HostClient; plugin: string; jobIds: string[]; roots: string[]; active: boolean; onOpen(path: string): Promise<unknown>;
}) {
  const [bindings, setBindings] = useState<JobContribution[]>([]), [selected, setSelected] = useState(jobIds[0] ?? "");
  const [root, setRoot] = useState(roots[0] ?? ""), [folder, setFolder] = useState("");
  const [entries, setEntries] = useState<{ name: string; path: string; kind: string }[]>([]), [files, setFiles] = useState<string[]>([]);
  const [jobs, setJobs] = useState<JobSnapshot[]>([]), [busy, setBusy] = useState(false), [problem, setProblem] = useState("");
  const lifetime = useRef<AbortController | null>(null);
  const request = async (body?: unknown) => {
    const signal = AbortSignal.any([lifetime.current!.signal, AbortSignal.timeout(10000)]);
    const response = await client.request("/api/plugins", { ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}), signal });
    const value = await response.json(); signal.throwIfAborted();
    if (!response.ok) throw new Error(value.error ?? i18n.t("Unavailable"));
    return value;
  };
  const update = (job: JobSnapshot) => setJobs(previous => previous.map(item => item.requestId === job.requestId ? job : item));
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    setBusy(false);
    if (active) void Promise.all([request(), request({ action: "job-list", plugin })]).then(([catalog, history]) => {
      if (controller.signal.aborted) return;
      setBindings(catalog.plugins.find((p: { id: string }) => p.id === plugin)?.jobs ?? []); setJobs(previous => [
        ...history.jobs.filter((job: JobSnapshot) => !previous.some(item => item.requestId === job.requestId)),
        ...previous.map(item => history.jobs.find((job: JobSnapshot) => job.requestId === item.requestId) ?? item),
      ]);
    }).catch(() => { if (!controller.signal.aborted) setProblem(i18n.t("Unavailable")); });
    return () => controller.abort();
  }, [client, plugin, active]);
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
        try {
          const response = await client.request("/api/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "job-status", requestId }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
          if (!response.ok) throw new Error();
          const value = await response.json(); if (!controller.signal.aborted) update(value.job);
        } catch { if (!controller.signal.aborted) setJobs(previous => previous.map(job => job.requestId === requestId && job.state === "running" ? { ...job, state: "uncertain", result: undefined } : job)); }
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
    <h3>{i18n.t("Plugin jobs")}</h3>
    {jobIds.length > 1 ? <SettingsSelect label={i18n.t("Job")} value={selected} disabled={!active || busy} onChange={value => { setSelected(value); setFiles([]); }} options={bindings.filter(job => jobIds.includes(job.id)).map(job => ({ value: job.id, label: job.title }))} /> : null}
    <SettingsSelect label={i18n.t("Opened folder")} value={enabled ? root : ""} disabled={!active || busy} onChange={value => { setRoot(value); resetFolder(""); }} options={[{ value: "", label: "—" }, ...roots.map(value => ({ value, label: value }))]} />
    {folder ? <div className="view-controls"><span>{folder}</span><Button variant="secondary" size="sm" disabled={busy} onClick={() => resetFolder("")}>{i18n.t("Return to opened folder")}</Button></div> : null}
    <div className="plugin-job-files" role="group" aria-label={i18n.t("Input file")}>
      {jobEntries(entries, choice).map(entry => entry.kind === "folder" ? <Button key={entry.name} variant="ghost" size="sm" disabled={!enabled || busy} onClick={() => resetFolder(folder ? `${folder}/${entry.name}` : entry.name)}>▸ {entry.name}</Button> : <label key={entry.name}><input type="checkbox" disabled={!enabled || busy || !choice || !files.includes(entry.name) && files.length >= JOB_BATCH_MAX_FILES} checked={files.includes(entry.name)} onChange={event => setFiles(previous => event.target.checked ? [...previous, entry.name] : previous.filter(name => name !== entry.name))} />{entry.name}</label>)}
    </div>
    <div className="view-controls"><Button disabled={!enabled || !choice || !files.length || busy} onClick={() => void run(async () => {
      const signal = lifetime.current!.signal;
      const selectedFiles = files.map(name => folder ? `${folder}/${name}` : name);
      const requestIds = selectedFiles.map(() => randomUuid());
      setFiles([]);
      try {
        const value = await request({ action: "job-start-many", plugin, job: selected, root, files: selectedFiles, requestIds });
        const additions = (value.files as BatchJobResult[]).map(item => item.job ?? { requestId: randomUuid(), plugin, job: selected, root, file: item.file, state: "failed" as const, phase: "", elapsedMs: 0, stopRequested: false, error: i18n.t("Cannot start this file. Check the input, result path and plugin availability.") });
        setJobs(previous => [...additions.reverse(), ...previous]);
      } catch {
        if (signal.aborted) return;
        setJobs(previous => [...selectedFiles.map((file, index) => ({ requestId: requestIds[index], plugin, job: selected, root, file, state: "uncertain" as const, phase: "", elapsedMs: 0, stopRequested: false })), ...previous]);
        throw new Error();
      }
    })}>{i18n.t("Start job")}</Button></div>
    <div className="view-table-scroll" role="region" tabIndex={0} aria-label={i18n.t("Plugin jobs")}><table>
      <thead><tr>{(["File", "Job", "Status", "Phase", "Elapsed", "Actions"] as const).map(label => <th key={label}>{i18n.t(label)}</th>)}</tr></thead>
      <tbody>{jobs.map(job => <tr key={job.requestId}>
        <td>{job.file ?? "—"}</td><td>{bindings.find(binding => binding.id === job.job)?.title ?? job.job}</td>
        <td><JobState job={job} />{job.state === "uncertain" ? <Notice tone="warning">{i18n.t("The job outcome is uncertain. Check the status before starting again.")}</Notice> : null}{job.error ? <Notice tone="error">{job.errorKind ? `[${job.errorKind}] ${job.error}` : job.error}</Notice> : null}</td>
        <td>{job.phase}</td><td>{Math.floor(job.elapsedMs / 1000)} s</td><td><JobActions compact job={job} busy={busy || !active} request={request} update={update} run={run} onOpen={onOpen} /></td>
      </tr>)}</tbody>
    </table></div>
    {problem ? <Notice tone="error">{problem}</Notice> : null}
  </section>;
}
