import type { RefObject } from "react";
import type { PdfProgress } from "./server-types.ts";
import type { UiHost } from "@litzio/plugin-api/ui";

export const phases: Record<PdfProgress["phase"], string> = {
  checking: "Checking the Docling server…", uploading: "Uploading PDF…", pending: "Waiting in the Docling queue…",
  started: "Docling is processing the PDF…", downloading: "Downloading the Docling result…", writing: "Creating the source bundle and {{product}} document…",
};
export function DoclingConversionDialog({ host, open, input, pending, returnFocus, onStart, onClose }: {
  host: UiHost; open: boolean; input: string; pending: boolean;
  returnFocus: RefObject<HTMLElement | null>; onStart(): void; onClose(): void;
}) {
  const { Dialog, Button, text } = host;
  const output = input.replace(/\.pdf$/iu, "") + ".docling";
  return <Dialog open={open} onClose={onClose} returnFocus={returnFocus} testId="docling-conversion"
    title={text("Convert with Docling")} description={text("Creates a source bundle and {{product}} document.")}
    footer={<>
      <Button size="default" variant="secondary" onClick={onClose}>{text("Cancel")}</Button>
      <Button size="default" disabled={pending || !input} variant="default" onClick={onStart}>{text("Convert")}</Button>
    </>}>
    <p className="[overflow-wrap:anywhere]">{input.split(/[\\/]/u).at(-1)}</p>
    <p className="[overflow-wrap:anywhere]">{text("Result folder")}: {output}</p>
    <p>{text("Existing names get -2, -3, and so on. Existing folders are never overwritten.")}</p>
  </Dialog>;
}
