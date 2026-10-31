import type { UiHost, UiContributions } from "@litzio/plugin-api/ui";
import { DoclingCompareView } from "./CompareView.tsx";
import type { ComparisonSnapshot } from "./compare.ts";
import { useEffect, useRef, useState } from "react";
import { DoclingServerSettings, useDoclingConversion, type Request } from "./ServerSettings.tsx";
import { DoclingConversionDialog } from "./ConversionDialog.tsx";
import { doclingFailureMessage, type ConversionJob } from "./server-types.ts";

export function activate(host: UiHost): UiContributions {
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
    useEffect(() => { host.notify(notice ? { ...notice, severity: "error", reveal: () => { setInput(converter.job?.input ?? input); setOpen(true); } } : null); }, [notice, converter.job?.input, input]);
    useEffect(() => {
      const job = converter.job;
      if (!job) return;
      if (job.state === "running") { setNotice(null); return; }
      if (finished.current === job.id) return;
      finished.current = job.id;
      if (job.state === "success") {
        const version = attempt.current;
        const current = () => version === attempt.current && currentId.current === job.id;
        void host.openTab("comparison", job.output, current).then(problem => {
          if (!current()) return;
          if (problem) setNotice({ id: job.id, message: problem });
          else { setOpen(false); setNotice(null); }
        });
      } else if (job.state === "error") setNotice({ id: job.id, message: `${host.text(doclingFailureMessage(job.failure))}${job.failure?.taskId ? ` (${host.text("Server task")}: ${job.failure.taskId})` : ""}` });
    }, [converter.job?.id, converter.job?.state]);
    return <DoclingConversionDialog host={host} open={open} input={input || converter.job?.input || ""} job={converter.job}
      pending={converter.pending} problem={converter.problem} returnFocus={returnFocus} onClose={() => setOpen(false)}
      onStart={() => { attempt.current++; setNotice(null); void converter.start(input).catch(error => setNotice({ id: `start-${Date.now()}`, message: error instanceof Error ? error.message : String(error) })); }}
      onCancel={() => void converter.cancel()} />;
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
        Button={props => <host.Button variant="secondary" {...props} />} GuideLink={GuideLink} /> }],
    fileActions: [{ id: "convert", label: "Convert with Docling", extensions: [".pdf"], run: (path, focus) => openConversion(focus, path) }],
    commands: [{ id: "convert", label: "Convert with Docling", keywords: ["PDF", "Docling", "도클링", "변환"], run: focus => openConversion(focus) }],
    sidebar: [{ id: "comparison", label: "Docling comparison", run: comparison }],
    tabs: [{ id: "comparison", label: "Docling comparison", className: "docling-tab",
      open: async folder => {
        const path = folder.replace(/[\\/]+$/, "") + (folder.includes("\\") ? "\\" : "/") + "document.md";
        const snapshot = await host.readJson<ComparisonSnapshot>("api/docling-compare", { path });
        return { path: snapshot.path, data: snapshot };
      },
      View: ({ data }: { data: ComparisonSnapshot }) => <DoclingCompareView snapshot={data} ReadingSurface={host.ReadingSurface}
        Button={host.Button} text={host.text} imageUrl={uri => host.imageUrl(data.path, uri)} />,
      notices: (snapshot: ComparisonSnapshot) => snapshot.stale ? [{ id: "stale", severity: "warning",
        message: `${snapshot.map.source.name}: ${host.text("The correspondence map does not match this document. Connections and sync scrolling are disabled. Reconvert to compare.")}` }] : [],
    }],
    dispose() {}, // CompareView releases observers/frames in React's unmount cleanup.
  };
}
