import { i18n } from "./i18n.ts";
import { useEffect, useRef, useState } from "react";
import type { JobContribution, JobSnapshot } from "@litzio/plugin-sdk";
import type { HostClient } from "./host-client.ts";
import { hostLabel } from "./host-client.ts";
import { Button } from "./components/ui/button.tsx";
import { Input } from "./components/ui/input.tsx";
import { Notice } from "./ui/primitives.tsx";
import "./views/views.css";

type Plugin = { id: string; name: string; running: boolean; jobs?: JobContribution[] };
export function PluginJobs({ client, hostId, roots, active, onOpen }: { client: HostClient; hostId: string; roots: string[]; active: boolean; onOpen(path: string): Promise<unknown> }) {
  const [plugins, setPlugins] = useState<Plugin[]>([]), [selected, setSelected] = useState("");
  const [root, setRoot] = useState(roots[0] ?? ""), [folder, setFolder] = useState("");
  const [entries, setEntries] = useState<{ path: string; name: string; kind: string }[]>([]), [file, setFile] = useState(""), [output, setOutput] = useState("result.md");
  const [job, setJob] = useState<JobSnapshot>(), [requestId, setRequestId] = useState(""), [problem, setProblem] = useState(""), [busy, setBusy] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  const request = async (body?: unknown) => {
    const signal = lifetime.current!.signal;
    const response = await client.request("/api/plugins", { ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}), signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
    const value = await response.json(); signal.throwIfAborted();
    if (!response.ok) throw new Error(value.error ?? "Job request failed"); return value;
  };
  useEffect(() => { void request().then(value => setPlugins(value.plugins)).catch(error => { if (!lifetime.current?.signal.aborted) setProblem(String(error)); }); }, [client]);
  const choices = plugins.filter(plugin => plugin.running).flatMap(plugin => (plugin.jobs ?? []).map(binding => ({ plugin, binding, key: `${plugin.id}/${binding.id}` })));
  const choice = choices.find(item => item.key === selected);
  const locked = busy || !!job && ["running", "uncertain"].includes(job.state);
  useEffect(() => {
    const controller = new AbortController();
    if (root && active && !locked) void client.request(`/api/folder?${new URLSearchParams({ root, path: folder || root })}`, { signal: controller.signal }).then(async response => { if (!response.ok) throw new Error("Cannot list Host folder"); return response.json(); }).then(value => { if (!controller.signal.aborted) setEntries(value.entries); }).catch(error => { if (!controller.signal.aborted) setProblem(String(error)); });
    return () => controller.abort();
  }, [client, root, folder, active, locked]);
  useEffect(() => {
    if (!active || !requestId || job?.state !== "running" || busy) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { try { const response = await client.request("/api/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "job-status", requestId }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) }); if (!response.ok) throw new Error(); const value = await response.json(); if (!controller.signal.aborted) { setJob(value.job); if (value.job.state === "running") timer = setTimeout(poll, 1000); } } catch { if (!controller.signal.aborted) setJob(previous => previous ? { ...previous, state: "uncertain", result: undefined } : previous); } };
    timer = setTimeout(poll, 1000); return () => { controller.abort(); clearTimeout(timer); };
  }, [active, requestId, job?.state, busy, client]);
  const run = async (action: () => Promise<void>) => { setBusy(true); setProblem(""); try { await action(); } catch (error) { if (!lifetime.current?.signal.aborted) { setProblem(String(error)); setJob(previous => previous?.state === "running" ? { ...previous, state: "uncertain", result: undefined } : previous); } } finally { if (!lifetime.current?.signal.aborted) setBusy(false); } };
  const relative = (value: string) => value.slice(root.length).replace(/^[\\/]/, "").replaceAll("\\", "/");
  return <div className="views-page" data-testid="plugin-jobs"><header><h2>{i18n.t("Plugin jobs")}</h2><p>{hostLabel(hostId)}</p></header>
    <div className="view-controls"><label>{i18n.t("Job")}<select aria-label="Job" value={selected} disabled={locked} onChange={e => setSelected(e.target.value)}><option value="">—</option>{choices.map(item => <option key={item.key} value={item.key}>{item.plugin.name} · {item.binding.title}</option>)}</select></label>
    <label>{i18n.t("Opened folder")}<select aria-label="Job root" value={root} disabled={locked} onChange={e => { setRoot(e.target.value); setFolder(""); setFile(""); }}><option value="">—</option>{roots.map(root => <option key={root}>{root}</option>)}</select></label></div>
    <p>{i18n.t("Select a file on this Host. No Desktop upload.")}</p>
    <div className="view-controls"><Button variant="secondary" disabled={locked || !folder} onClick={() => setFolder("")}>{i18n.t("Root folder")}</Button><select aria-label="Host input file" value={file} disabled={locked || !choice} onChange={e => { const entry = entries.find(item => item.path === e.target.value); if (entry?.kind === "folder") { setFolder(entry.path); setFile(""); } else setFile(e.target.value); }}><option value="">{folder || root || "—"}</option>{entries.filter(entry => entry.kind === "folder" || choice?.binding.accept.some(extension => entry.name.toLowerCase().endsWith(extension))).map(entry => <option key={entry.path} value={entry.path}>{entry.kind === "folder" ? "▸ " : ""}{entry.name}</option>)}</select>
    <label>{i18n.t("Result path in Root")}<Input aria-label="Result path in Root" value={output} disabled={locked} onChange={e => setOutput(e.target.value)} /></label>
    <Button disabled={locked || !choice || !file || !output} onClick={() => void run(async () => {
      const id = crypto.randomUUID(); setRequestId(id);
      const initial: JobSnapshot = { requestId: id, plugin: choice!.plugin.id, job: choice!.binding.id, root, state: "running", phase: "Starting", stopRequested: false }; setJob(initial);
      try { const value = await request({ action: "job-start", plugin: initial.plugin, job: initial.job, requestId: id, root, file: relative(file), output }); setJob(value.job); }
      catch { if (!lifetime.current?.signal.aborted) setJob({ ...initial, state: "uncertain" }); }
    })}>{i18n.t("Start job")}</Button></div>
    <label>{i18n.t("Request ID")}<Input aria-label="Request ID" value={requestId} disabled={busy || job?.state === "running"} onChange={e => { setRequestId(e.target.value); setJob(undefined); }} /></label>
    <div className="view-controls"><Button variant="secondary" disabled={busy || !requestId} onClick={() => void run(async () => { const value = await request({ action: "job-status", requestId }); setJob(value.job); })}>{i18n.t("Check status")}</Button><Button variant="secondary" disabled={busy || !job || !["running", "uncertain"].includes(job.state) || job.stopRequested} onClick={() => void run(async () => { const value = await request({ action: "job-stop", requestId }); setJob(value.job); })}>{i18n.t("Request cancellation")}</Button></div>
    {job ? <section aria-live="polite"><p>{i18n.t(job.state)} · {job.phase}</p>{job.progress ? <><progress max={job.progress.total} value={job.progress.done} /> {job.progress.done}/{job.progress.total}</> : null}{job.stopRequested && job.state !== "stopped" ? <p>{i18n.t("Cancellation requested; not confirmed.")}</p> : null}{job.state === "uncertain" ? <Notice tone="warning">{i18n.t("Outcome uncertain. Check this request ID; do not resend start.")}</Notice> : null}{job.error ? <Notice tone="error">{job.error}</Notice> : null}{job.state === "completed" ? <Button onClick={() => void run(async () => { const value = await request({ action: "job-result", requestId }); await onOpen(value.job.result.path); })}>{i18n.t("Open result document")}</Button> : null}</section> : null}
    {problem ? <Notice tone="error">{problem}</Notice> : null}
  </div>;
}
