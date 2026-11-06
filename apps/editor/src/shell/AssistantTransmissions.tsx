import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
import { useHostClient } from "../host-context.tsx";
import { createAssistantRequest } from "../assistant-api.ts";
import { ASSISTANT } from "../../shared/assistant.ts";
import type { AssistantTransmission } from "../../shared/assistant-transmissions.ts";
import { i18n } from "../i18n.ts";

type Entry = Omit<AssistantTransmission, "payload"> & { complete: boolean };
type Listing = { entries: Entry[]; failures: number; incomplete: string[]; nextOffset: number | null };
export function AssistantTransmissions() {
  const client = useHostClient(), request = createAssistantRequest(client);
  const [open, setOpen] = useState(false), [list, setList] = useState<Listing>();
  const [selected, setSelected] = useState<Entry>(), [text, setText] = useState("");
  const [next, setNext] = useState<number | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(""); try { await fn(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } };
  const load = async (offset = 0) => { const page = await request<Listing>(ASSISTANT.transmissionsRoute, { action: "list", offset }); setList(old => offset && old ? { ...page, entries: [...old.entries, ...page.entries] } : page); };
  const read = async (id: string, offset = 0) => { const page = await request<{ metadata: Entry; text: string; nextOffset: number | null }>(ASSISTANT.transmissionsRoute, { action: "read", id, offset }); setSelected(page.metadata); setText(page.text); setNext(page.nextOffset); setConfirm(false); };
  return <>
    <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={i18n.t("Transmission log")} onClick={() => { setOpen(true); void run(() => load()); }} />}><FileText /></TooltipTrigger><TooltipContent>{i18n.t("Transmission log")}</TooltipContent></Tooltip>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-[calc(100%-2rem)] md:max-w-2xl min-w-0" onKeyDown={event => event.stopPropagation()}>
      <DialogHeader><DialogTitle>{i18n.t("Transmission log")}</DialogTitle></DialogHeader>
      <details><summary>{i18n.t("About this log")}</summary><p>{i18n.t("Messages, saved content and public tool results sent by Litzio are stored on this Host until deleted. Sensitive document content may be included. Provider internal history and final model input are not observed. Image paths are recorded, not image bytes.")}</p></details>
      {error ? <p role="alert">{error}</p> : null}
      {list?.failures || list?.incomplete.length ? <p role="status">{i18n.t("Some log records are unavailable or incomplete. Assistant sends continue independently.")}</p> : null}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => load())}>{i18n.t("Refresh")}</Button>
      <div className="max-h-48 overflow-auto min-w-0 grid gap-1">
        {list?.entries.length === 0 ? <p>{i18n.t("No transmissions recorded.")}</p> : null}
        {list?.entries.map(entry => <Button key={entry.id} size="sm" variant="ghost" disabled={busy} className="h-auto justify-start whitespace-normal text-left break-all" onClick={() => { if (!entry.complete) { setSelected(entry); setText(""); setNext(null); setConfirm(false); } else void run(() => read(entry.id)); }}>{new Date(entry.at).toLocaleString()} · {entry.provider} · {entry.tool ?? entry.method} · {entry.bytes} B · {i18n.t(entry.status)}{!entry.complete ? ` · ${i18n.t("Incomplete")}` : ""}</Button>)}
        {list?.incomplete.map(id => <Button key={id} size="sm" variant="outline" disabled={busy} onClick={() => { setSelected({ id, complete: false } as Entry); setText(""); setNext(null); }}>{i18n.t("Incomplete")} · {id}</Button>)}
      </div>
      {list?.nextOffset !== null && list?.nextOffset !== undefined ? <Button disabled={busy} onClick={() => void run(() => load(list.nextOffset!))}>{i18n.t("Load more")}</Button> : null}
      {selected ? <section className="min-w-0 grid gap-2">
        <p className="break-all">{selected.conversationId} · {selected.turnId} · {selected.id}</p>
        <ul>{selected.sources?.map((source, index) => <li key={index} className="break-all">{i18n.t(source.kind)} · {source.label} · {source.bytes} B</li>)}</ul>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all bg-muted p-3 rounded-md" aria-label={i18n.t("Sent payload")}>{text}</pre>
        {next !== null ? <Button disabled={busy} onClick={() => void run(() => read(selected.id, next))}>{i18n.t("Next payload page")}</Button> : null}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => { if (!confirm) { setConfirm(true); return; } void run(async () => { await request(ASSISTANT.transmissionsRoute, { action: "delete", id: selected.id }); setSelected(undefined); setText(""); setConfirm(false); await load(); }); }}>{confirm ? i18n.t("Confirm log deletion") : i18n.t("Delete log record")}</Button>
      </section> : null}
    </DialogContent></Dialog>
  </>;
}
