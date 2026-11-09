import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { getDocument, GlobalWorkerOptions, TextLayer, AnnotationMode, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?worker&url";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Notice } from "../ui/primitives.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
import { ZoomIn, ZoomOut } from "lucide-react";
import type { HostClient } from "../host-client.ts";
import pdfStyles from "pdfjs-dist/web/pdf_viewer.css?inline";
import "./pdf-viewer.css";

GlobalWorkerOptions.workerSrc = workerUrl;
const failure = "The PDF could not be opened. It may be unavailable, damaged, or larger than 25 MiB.";

export function PdfViewer({ client, root, path, active }: { client: HostClient; root: string; path: string; active: boolean }) {
  const { t } = useTranslation();
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [error, setError] = useState<"password" | "failed">();
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const zoomBy = (factor: number) => setZoom(value => Math.min(4, Math.max(.25, (value === "fit" ? Number(scroll.current?.querySelector<HTMLElement>("[data-pdf-page]")?.dataset.scale ?? 1) : value) * factor)));
  useEffect(() => {
    const controller = new AbortController();
    let task: ReturnType<typeof getDocument> | undefined;
    void (async () => {
      try {
        const response = await client.request(`/api/file-preview?${new URLSearchParams({ root, path })}`, { signal: controller.signal });
        if (!response.ok) throw Error();
        const data = new Uint8Array(await response.arrayBuffer());
        if (controller.signal.aborted) return;
        task = getDocument({ data, cMapUrl: new URL("/pdf-assets/cmaps/", location.href).href, cMapPacked: true, standardFontDataUrl: new URL("/pdf-assets/standard_fonts/", location.href).href, enableXfa: false, isEvalSupported: false, useWasm: false, useWorkerFetch: false, disableAutoFetch: true });
        task.onPassword = () => { if (!controller.signal.aborted) setError("password"); void task?.destroy(); };
        const document = await task.promise;
        if (!controller.signal.aborted) setPdf(document);
      } catch { if (!controller.signal.aborted) setError(previous => previous ?? "failed"); }
    })();
    return () => { controller.abort(); void task?.destroy(); };
  }, [client, root, path]);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth - 32));
    observer.observe(element);
    const wheel = (event: WheelEvent) => { if (event.ctrlKey) { event.preventDefault(); zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1); } };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener("wheel", wheel); };
  }, []);
  const fail = useCallback(() => setError("failed"), []);
  const go = (number: number) => {
    if (!pdf || !Number.isInteger(number)) return;
    const next = Math.min(pdf.numPages, Math.max(1, number));
    scroll.current?.querySelector(`[data-pdf-page="${next}"]`)?.scrollIntoView({ block: "start" });
    setPage(next);
  };
  return <div className="pdf-viewer">
    <style>{`@scope (.pdf-viewer) { ${pdfStyles} }`}</style>
    <div className="pdf-toolbar" role="toolbar" aria-label={t("PDF controls")}>
      <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" disabled={!pdf || !!error} aria-label={t("Zoom out")} onClick={() => zoomBy(1 / 1.2)} />}><ZoomOut /></TooltipTrigger><TooltipContent>{t("Zoom out")}</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" disabled={!pdf || !!error} aria-label={t("Zoom in")} onClick={() => zoomBy(1.2)} />}><ZoomIn /></TooltipTrigger><TooltipContent>{t("Zoom in")}</TooltipContent></Tooltip>
      <Button variant="ghost" size="sm" disabled={!pdf || !!error} onClick={() => setZoom("fit")}>{t("Fit width")}</Button>
      <span>{zoom === "fit" ? "" : `${Math.round(zoom * 100)}%`}</span>
      {pdf && !error ? <label className="pdf-page-control">{t("Page")} <Input key={page} aria-label={t("Page")} type="number" min={1} max={pdf.numPages} defaultValue={page} onKeyDown={event => { if (event.key === "Enter") go(Number(event.currentTarget.value)); }} onBlur={event => go(Number(event.currentTarget.value))} /> / {pdf.numPages}</label> : null}
    </div>
    {error ? <Notice tone="error">{t(error === "password" ? "Password-protected PDFs cannot be opened." : failure)}</Notice> : !pdf ? <Notice>{t("Loading…")}</Notice> : null}
    <div className="pdf-scroll" ref={scroll} tabIndex={0} aria-label={t("PDF pages")}>
      {pdf && !error && width > 0 ? Array.from({ length: pdf.numPages }, (_, index) => <PdfPage key={index} pdf={pdf} number={index + 1} width={width} zoom={zoom} active={active} scroll={scroll.current!} onCurrent={setPage} onError={fail} />) : null}
    </div>
  </div>;
}

function PdfPage({ pdf, number, width, zoom, active, scroll, onCurrent, onError }: { pdf: PDFDocumentProxy; number: number; width: number; zoom: number | "fit"; active: boolean; scroll: HTMLElement; onCurrent(page: number): void; onError(): void }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [size, setSize] = useState({ width: 612, height: 792 });
  const scale = zoom === "fit" ? Math.min(width / size.width, 4) : zoom;
  useEffect(() => {
    const element = container.current!;
    const nearby = new IntersectionObserver(entries => setNear(entries[0]!.isIntersecting), { root: scroll, rootMargin: "800px 0px" });
    const current = new IntersectionObserver(entries => { if (entries[0]!.isIntersecting && active) onCurrent(number); }, { root: scroll, rootMargin: "0px 0px -65% 0px" });
    nearby.observe(element); current.observe(element);
    return () => { nearby.disconnect(); current.disconnect(); };
  }, [scroll, number, active, onCurrent]);
  useEffect(() => {
    if (!near || !active) return;
    let cancelled = false, render: RenderTask | undefined, layer: TextLayer | undefined;
    const drawing = canvas.current!, textContainer = text.current!;
    void (async () => {
      try {
        const page = await pdf.getPage(number);
        if (cancelled) return;
        const natural = page.getViewport({ scale: 1 });
        setSize(previous => previous.width === natural.width && previous.height === natural.height ? previous : { width: natural.width, height: natural.height });
        const viewport = page.getViewport({ scale });
        // Bound each canvas independently of a PDF's declared dimensions and monitor DPR.
        const ratio = Math.min(devicePixelRatio || 1, 2, 4096 / Math.max(viewport.width, viewport.height));
        drawing.width = Math.ceil(viewport.width * ratio); drawing.height = Math.ceil(viewport.height * ratio);
        render = page.render({ canvas: drawing, viewport, transform: [ratio, 0, 0, ratio, 0, 0], annotationMode: AnnotationMode.DISABLE, background: "rgb(255,255,255)" });
        await render.promise;
        if (cancelled) return;
        layer = new TextLayer({ textContentSource: page.streamTextContent(), container: textContainer, viewport });
        await layer.render();
      } catch { if (!cancelled) onError(); }
    })();
    return () => { cancelled = true; render?.cancel(); layer?.cancel(); textContainer.replaceChildren(); drawing.width = drawing.height = 0; };
  }, [pdf, number, near, active, scale, onError]);
  return <div ref={container} className="pdf-page" data-pdf-page={number} data-scale={scale} style={{ width: size.width * scale, height: size.height * scale, "--total-scale-factor": scale } as CSSProperties}>
    <canvas ref={canvas} /><div className="textLayer" ref={text} />
  </div>;
}
