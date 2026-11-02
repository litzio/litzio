import type { UiHost, UiContributions } from "@litzio/plugin-api/ui";
import { DoclingCompareView } from "./comparison/CompareView.tsx";
import type { ComparisonSnapshot } from "./comparison/compare.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import { DoclingServerSettings, useDoclingConversion, type Request } from "./conversion/ServerSettings.tsx";
import { DoclingConversionDialog } from "./conversion/ConversionDialog.tsx";
import { doclingFailureMessage, type ConversionJob } from "./conversion/server-types.ts";
import { ReviewPanel } from "./ReviewPanel.tsx";
import { Dashboard } from "./Dashboard.tsx";

export function activate(host: UiHost): UiContributions {
  const conversionEnabled = host.features?.conversion !== false, comparisonEnabled = host.features?.comparison !== false;
  const request: Request = (endpoint, method = "GET", body) => host.requestJson(`api/docling-${endpoint}`, method, body);
  let openConversion = (_focus: HTMLElement | null, _path?: string) => {};
  function Conversion() {
    const converter = useDoclingConversion(request, host.initialJob as ConversionJob | undefined, host.initialJobRead);
    const [open, setOpen] = useState(false), [input, setInput] = useState("");
    const [notice, setNotice] = useState<{ id: string; message: string } | null>(null);
    const returnFocus = useRef<HTMLElement | null>(null), finished = useRef("");
    const attempt = useRef(0), currentId = useRef(converter.job?.id); currentId.current = converter.job?.id;
    openConversion = (focus, path) => {
      returnFocus.current = focus;
      if (path || converter.job?.state === "running") { setInput(path ?? converter.job!.input); setOpen(true); setNotice(null); }
      else host.pickFile({ choose: "pdf", title: host.text("Convert with Docling"), description: host.text("Choose a PDF on the Host device."),
        open: async path => { setInput(path); setOpen(true); setNotice(null); return ""; },
      }, focus);
    };
    useEffect(() => { host.setBusy(converter.pending || converter.job?.state === "running"); }, [converter.pending, converter.job?.state]);
    useEffect(() => { host.notify(conversionEnabled && notice ? { ...notice, severity: "error", reveal: () => { setInput(converter.job?.input ?? input); setOpen(true); } } : null); }, [notice, converter.job?.input, input]);
    useEffect(() => {
      const job = converter.job;
      if (!job) return;
      if (job.state === "running") { setNotice(null); return; }
      if (finished.current === job.id) return;
      finished.current = job.id;
      if (job.state === "success") {
        if (!comparisonEnabled || !conversionEnabled) { setOpen(false); return; }
        const version = attempt.current;
        const current = () => version === attempt.current && currentId.current === job.id;
        void host.openTab("comparison", job.output, current).then(problem => {
          if (!current()) return;
          if (problem) setNotice({ id: job.id, message: problem });
          else { setOpen(false); setNotice(null); }
        });
      } else if (job.state === "error") setNotice({ id: job.id, message: `${host.text(doclingFailureMessage(job.failure))}${job.failure?.taskId ? ` (${host.text("Server task")}: ${job.failure.taskId})` : ""}` });
    }, [converter.job?.id, converter.job?.state]);
    return conversionEnabled ? <DoclingConversionDialog host={host} open={open} input={input || converter.job?.input || ""} job={converter.job}
      pending={converter.pending} problem={converter.problem} returnFocus={returnFocus} onClose={() => setOpen(false)}
      onStart={() => { attempt.current++; setNotice(null); void converter.start(input).catch(error => setNotice({ id: `start-${Date.now()}`, message: error instanceof Error ? error.message : String(error) })); }}
      onCancel={() => void converter.cancel()} /> : null;
  }
  function Comparison({ data }: { data: ComparisonSnapshot }) {
    const [snapshot, setSnapshot] = useState<ComparisonSnapshot>();
    const [problem, setProblem] = useState("");
    const [loading, setLoading] = useState(true);
    const [refs, setRefs] = useState<string[]>([]);
    const alive = useRef(false), generation = useRef(0);
    const cancelWait = useRef<(() => void) | undefined>(undefined);
    const folder = data.path.replace(/[\\/][^\\/]+$/, "");
    // Local/HTTP read failures get two brief recovery opportunities, then need a person.
    // This budget belongs to document reads, never to proposal observation or mutations.
    const reload = useCallback(async () => {
      const version = ++generation.current;
      cancelWait.current?.(); setLoading(true); setProblem("");
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (!alive.current || version !== generation.current) return;
        try {
          const current = await host.readJson<ComparisonSnapshot>("api/docling-compare", { path: data.path });
          if (alive.current && version === generation.current) { setSnapshot(current); setProblem(""); setLoading(false); }
          return;
        } catch (error) {
          if (!alive.current || version !== generation.current) return;
          setSnapshot(undefined); setProblem(error instanceof Error ? error.message : String(error));
          if (attempt === 3) { setLoading(false); throw error; }
          await new Promise<void>(resolve => {
            const done = () => { clearTimeout(timer); if (cancelWait.current === done) cancelWait.current = undefined; resolve(); };
            const timer = setTimeout(done, 1000);
            cancelWait.current = done;
          });
        }
      }
    }, [data.path]);
    useEffect(() => {
      alive.current = true;
      let stopped = false;
      // An effect discarded before this microtask (including StrictMode replay)
      // must not issue a document request or consume a new recovery budget.
      queueMicrotask(() => { if (!stopped) void reload().catch(() => {}); });
      return () => { stopped = true; alive.current = false; generation.current++; cancelWait.current?.(); };
    }, [reload]);
    return <div className="docling-review-comparison">
      {snapshot ? <DoclingCompareView snapshot={snapshot} ReadingSurface={host.ReadingSurface} Button={host.Button} text={host.text}
        selectedRefs={refs} imageUrl={uri => host.imageUrl(snapshot.path, uri)} />
        : <div className="docling-compare" role="status">
          <p>{host.text(loading ? "Loading…" : "The comparison may not be current. Automatic reload stopped. Reload it to continue.")}</p>
          {problem ? <p role="alert">{problem}</p> : null}
          {!loading ? <host.Button variant="secondary" onClick={() => void reload().catch(() => {})}>{host.text("Reload comparison")}</host.Button> : null}
        </div>}
      <ReviewPanel host={host} folder={folder} documentReady={!!snapshot} documentLoading={loading} onSelect={setRefs} onChanged={reload} />
    </div>;
  }

  function GuideLink({ children }: { children?: React.ReactNode }) {
    const href = "https://github.com/litzio/litzio/blob/master/docs/guides/docling-server.md";
    return <a href={href} className="w-fit text-primary underline underline-offset-4" onClick={event => { event.preventDefault(); host.openExternalLink(href); }}>{children}</a>;
  }
  const comparison = (returnFocus: HTMLElement | null) => host.pickFolder({
    title: host.text("Docling comparison"),
    description: host.text("Choose a conversion folder containing document.md and document.docling-map.json."),
    open: folder => host.openTab("comparison", folder),
  }, returnFocus);
  return {
    View: Conversion,
    settings: [{ id: "server", label: "Docling", description: "PDF conversion on the Host device.",
      View: () => <DoclingServerSettings request={request} text={host.text} Input={host.Input}
        Button={props => <host.Button variant="secondary" {...props} />} GuideLink={GuideLink} serverEnabled={conversionEnabled} /> }],
    fileActions: conversionEnabled ? [{ id: "convert", label: "Convert with Docling", extensions: [".pdf"], run: (path, focus) => openConversion(focus, path) }] : [],
    commands: [{ id: "dashboard", label: "Docling dashboard", keywords: ["Docling", "도클링"], run: () => host.openTab("dashboard", "Docling").then(() => {}) },
      ...(conversionEnabled ? [{ id: "convert", label: "Convert with Docling", keywords: ["PDF", "Docling", "도클링", "변환"], run: (focus: HTMLElement | null) => openConversion(focus) }] : [])],
    sidebar: [{ id: "dashboard", label: "Docling", run: () => host.openTab("dashboard", "Docling").then(() => {}) }],
    tabs: [{ id: "dashboard", label: "Docling dashboard", className: "docling-dashboard-tab", open: async () => ({ path: "Docling", data: null }),
      View: () => <Dashboard host={host} request={request} convert={(focus, path) => openConversion(focus, path)} compare={comparison} /> },
      ...(comparisonEnabled ? [{ id: "comparison", label: "Docling comparison", className: "docling-tab",
      open: async (folder: string) => {
        const path = folder.replace(/[\\/]+$/, "") + (folder.includes("\\") ? "\\" : "/") + "document.md";
        const snapshot = await host.readJson<ComparisonSnapshot>("api/docling-compare", { path });
        return { path: snapshot.path, data: snapshot };
      },
      View: Comparison,
      notices: (snapshot: ComparisonSnapshot) => snapshot.stale ? [{ id: "stale", severity: "warning" as const,
        message: `${snapshot.map.source.name}: ${host.text("The correspondence map does not match this document. Connections and sync scrolling are disabled. Reconvert to compare.")}` }] : [],
    }] : [])],
    dispose() {}, // CompareView releases observers/frames in React's unmount cleanup.
  };
}
