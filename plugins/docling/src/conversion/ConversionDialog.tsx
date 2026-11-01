import { useEffect, useState, type RefObject } from "react";
import { doclingFailureMessage, type ConversionJob, type PdfProgress } from "./server-types.ts";
import type { UiHost } from "@litzio/plugin-api/ui";

export const phases: Record<PdfProgress["phase"], string> = {
  checking: "Checking the Docling server…", uploading: "Uploading PDF…", pending: "Waiting in the Docling queue…",
  started: "Docling is processing the PDF…", downloading: "Downloading the Docling result…", writing: "Creating the source bundle and {{product}} document…",
};
export function DoclingConversionDialog({ host, open, input, job, pending, problem, returnFocus, onStart, onCancel, onClose }: {
  host: UiHost; open: boolean; input: string; job: ConversionJob | null; pending: boolean; problem: string;
  returnFocus: RefObject<HTMLElement | null>; onStart(): void; onCancel(): void; onClose(): void;
}) {
  const { Dialog, Button, text } = host;
  const [now, setNow] = useState(Date.now());
  const current = job?.input === input ? job : null;
  const running = current?.state === "running";
  useEffect(() => {
    if (!running || !open) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, open]);
  return <Dialog open={open} onClose={onClose} returnFocus={returnFocus} testId="docling-conversion"
    title={text("Convert with Docling")} description={text(host.features?.comparison === false ? "Creates a source bundle and {{product}} document." : "Creates a source bundle and {{product}} document, then opens Docling comparison.")}
    footer={<>
      <Button size="default" variant="secondary" onClick={onClose}>{text(running ? "Keep in background" : "Close")}</Button>
      {running ? <Button size="default" disabled={pending} variant="secondary" onClick={onCancel}>{text("Stop waiting")}</Button>
        : <Button size="default" disabled={pending || !input} variant="default" onClick={onStart}>{text(current ? "Convert again" : "Start conversion")}</Button>}
    </>}>
      <p className="[overflow-wrap:anywhere]">{input}</p>
      <p>{text("Results go beside the PDF in a new name.docling folder. Existing names get -2, -3, and so on; existing folders are never overwritten.")}</p>
      {current ? <div role="status" aria-live="polite" className="[overflow-wrap:anywhere]">
        <p>{text(current.state === "running" ? phases[current.progress.phase] : current.state === "cancelled" ? "{{product}} waiting stopped. The server task may continue." : current.state === "success" ? "Conversion complete." : "Docling conversion failed.")}</p>
        <p>{text("Elapsed: {{seconds}} s", { seconds: Math.max(0, Math.floor((now - current.startedAt) / 1000)) })}</p>
        {current.progress.taskId ? <p>{text("Server task")}: {current.progress.taskId}</p> : null}
        <p>{text("Result folder")}: {current.output}</p>
        {current.state === "error" ? <p>{text(doclingFailureMessage(current.failure))}</p> : null}
      </div> : null}
      {problem ? <p role="alert">{problem}</p> : null}
      <p>{text("Stopping cancels only {{product}} requests and waiting. It does not cancel the Docling server task.")}</p>
  </Dialog>;
}
