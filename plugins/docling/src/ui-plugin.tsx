import type { UiHost, UiContributions, UiNotice } from "@litzio/plugin-api/ui";
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
  let stoppedConversion = (_job: ConversionJob) => {};
  function Conversion() {
    const converter = useDoclingConversion(request, host.initialJob as ConversionJob | undefined, host.initialJobRead);
    stoppedConversion = converter.observe;
    const [open, setOpen] = useState(false), [input, setInput] = useState("");
    const [notice, setNotice] = useState<UiNotice | null>(null);
    const returnFocus = useRef<HTMLElement | null>(null), finished = useRef("");
    const attempt = useRef(0), currentId = useRef(converter.job?.id); currentId.current = converter.job?.id;
    const dashboardNotice = (message: string) => setNotice({ id: `start-${Date.now()}`, message: host.text(message), severity: "info",
      actionLabel: host.text("View dashboard"), reveal: () => { setNotice(null); void host.openTab("dashboard", "Docling"); } });
    openConversion = (focus, path) => {
      returnFocus.current = focus;
      if (converter.job?.state === "running") { dashboardNotice("A conversion is already in progress."); return; }
      if (path) { setInput(path); setOpen(true); }
      else host.pickFile({ choose: "pdf", title: host.text("Convert with Docling"), description: host.text("Choose a PDF on the Host device."),
        open: async path => { setInput(path); setOpen(true); return ""; },
      }, focus);
    };
    // Keep the PDF action available so a second attempt can reveal the dashboard.
    useEffect(() => { host.setBusy(converter.pending); }, [converter.pending]);
    useEffect(() => { host.notify(conversionEnabled ? notice : null); }, [notice]);
    useEffect(() => {
      if (!notice?.id.startsWith("start-")) return;
      const timer = setTimeout(() => setNotice(value => value?.id === notice.id ? null : value), 5000);
      return () => clearTimeout(timer);
    }, [notice]);
    const failureNotice = (id: string, message: string, settings = false) => setNotice({ id, message, severity: "error",
      actionLabel: host.text(settings ? "Open settings" : "View dashboard"),
      reveal: () => { setNotice(null); if (settings) host.openSettings("server", returnFocus.current); else void host.openTab("dashboard", "Docling"); } });
    useEffect(() => {
      const job = converter.job;
      if (!job || job.state === "running" || finished.current === job.id) return;
      finished.current = job.id;
      if (job.state === "success" && conversionEnabled) {
        const version = attempt.current;
        const current = () => version === attempt.current && currentId.current === job.id;
        setNotice({ id: job.id, message: host.text("Conversion complete."), severity: "info",
          ...(comparisonEnabled ? { actionLabel: host.text("Open comparison"), reveal: () => {
            setNotice(null);
            void host.openTab("comparison", job.output, current).then(problem => {
              if (current() && problem) failureNotice(job.id, problem);
            });
          } } : { actionLabel: host.text("View dashboard"), reveal: () => { setNotice(null); void host.openTab("dashboard", "Docling"); } }) });
      } else if (job.state === "error") failureNotice(job.id,
        `${host.text(doclingFailureMessage(job.failure))}${job.failure?.taskId ? ` (${host.text("Server task")}: ${job.failure.taskId})` : ""}`,
        ["unreachable", "version", "openapi", "not-ready"].includes(job.failure?.code ?? ""));
    }, [converter.job?.id, converter.job?.state]);
    return conversionEnabled ? <DoclingConversionDialog host={host} open={open} input={input}
      pending={converter.pending} returnFocus={returnFocus} onClose={() => setOpen(false)}
      onStart={() => {
        if (converter.pending) return;
        setOpen(false);
        if (converter.job?.state === "running") { dashboardNotice("A conversion is already in progress."); return; }
        attempt.current++; dashboardNotice("Conversion started.");
        void converter.start(input).catch(error => failureNotice(`failure-${Date.now()}`, error instanceof Error ? error.message : String(error), true));
      }} /> : null;
  }
  function Comparison({ data }: { data: ComparisonSnapshot }) {
    const [snapshot, setSnapshot] = useState<ComparisonSnapshot>();
    const [problem, setProblem] = useState("");
    const [loading, setLoading] = useState(true);
    const [pageSelection, setPageSelection] = useState<number[]>([]), [reason, setReason] = useState("");
    const [pageBusy, setPageBusy] = useState(false), [pageProblem, setPageProblem] = useState("");
    const pagePending = useRef(false);
    const ko = host.text("Source pages") !== "Source pages";
    const copy: Record<string, string> = { "Excluded": "제외됨", "Select page": "페이지 선택", "Exclude selected pages": "선택 페이지 제외", "Exclusion reason": "제외 이유", "Undo exclusion": "제외 해제" };
    const pageText = (key: string) => ko && copy[key] ? copy[key] : host.text(key);
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
    async function changePages(id?: string) {
      if (pagePending.current) return;
      pagePending.current = true; setPageBusy(true); setPageProblem("");
      try {
        await host.requestJson("api/plugin-operation", "POST", { plugin: "docling", operation: id ? "remove-correction" : "add-correction",
          args: id ? { folder, id } : { folder, entry: { id: `pages-${Date.now()}-${Math.random().toString(16).slice(2)}`, operation: "exclude-pages",
            value: { pages: pageSelection }, reason: reason.trim(), approvedAt: new Date().toISOString() } } });
        setPageSelection([]); setReason(""); await reload();
      } catch (error) { setPageProblem(error instanceof Error ? error.message : String(error)); }
      finally { pagePending.current = false; setPageBusy(false); }
    }
    return <div className="docling-review-comparison">
      <div className="docling-page-actions">
        <span>{pageText("Exclude selected pages")} · {pageSelection.join(", ") || "—"}</span>
        <host.Input aria-label={pageText("Exclusion reason")} placeholder={pageText("Exclusion reason")} value={reason} disabled={pageBusy} onChange={event => setReason(event.target.value)} />
        <host.Button disabled={pageBusy || loading || !snapshot || !pageSelection.length || !reason.trim() || !conversionEnabled} onClick={() => void changePages()}>{pageText("Exclude selected pages")}</host.Button>
        {pageProblem ? <p role="alert">{pageProblem}</p> : null}
      </div>
      {snapshot ? <DoclingCompareView snapshot={snapshot} ReadingSurface={host.ReadingSurface} Button={host.Button} text={pageText}
        pageActions={page => page.exclusion
          ? <host.Button variant="secondary" size="sm" disabled={pageBusy || loading || !conversionEnabled} onClick={() => void changePages(page.exclusion!.id)}>{pageText("Undo exclusion")} ({page.exclusion.pages.join(", ")})</host.Button>
          : <label><input type="checkbox" aria-label={`${pageText("Select page")} ${page.page_no}`} checked={pageSelection.includes(page.page_no)} disabled={pageBusy || loading || !conversionEnabled}
            onChange={event => setPageSelection(value => event.target.checked ? [...value, page.page_no].sort((a, b) => a - b) : value.filter(n => n !== page.page_no))} />{pageText("Select page")}</label>}
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
      View: () => <Dashboard host={host} request={request} onStopped={job => stoppedConversion(job)} convert={(focus, path) => openConversion(focus, path)} compare={comparison} /> },
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
