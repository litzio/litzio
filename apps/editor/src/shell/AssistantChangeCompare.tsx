import { useCallback, useState } from "react";
import type { HostClient } from "../host-client.ts";
import { Button } from "../components/ui/button.tsx";
import SourceCompare, { type Comparison } from "./SourceCompare.tsx";
import { i18n } from "../i18n.ts";

type Preview = Comparison & { path: string; copyRevision: string; diskRevision: string };
export function AssistantChangeCompare({ client, conversation, change, path, isDirty, onApplied, onDiscarded }: {
  client: HostClient; conversation: string; change: string; path: string; isDirty(): boolean; onApplied(): Promise<void>; onDiscarded(): void;
}) {
  const [preview, setPreview] = useState<Preview>();
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"Changes applied" | "Changes discarded">();
  const [error, setError] = useState("");
  const request = useCallback(async (action: string, extra = {}, signal?: AbortSignal) => {
    const response = await client.request("/api/assistant/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: `changes-${action}`, id: conversation, change, ...extra }), signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
    return result;
  }, [client, conversation, change]);
  const load = useCallback(async (signal: AbortSignal) => {
    const result: Preview = await request("preview", {}, signal);
    setPreview(result); return result;
  }, [request, revision]);
  async function act(action: "apply" | "discard") {
    setBusy(true); setError("");
    try {
      if (action === "apply" && isDirty()) throw new Error(i18n.t("Save or close your unsaved edits before applying Assistant changes."));
      await request(action, { copyRevision: preview?.copyRevision, diskRevision: preview?.diskRevision });
      setOutcome(action === "apply" ? "Changes applied" : "Changes discarded");
      if (action === "apply") {
        try { await onApplied(); } catch (error) { setError((error as Error).message); }
      } else onDiscarded();
    } catch (error) { setError(String((error as Error).message)); setPreview(undefined); setRevision(value => value + 1); }
    finally { setBusy(false); }
  }
  const blocked = !outcome && (isDirty() ? i18n.t("Save or close your unsaved edits before applying Assistant changes.") : preview?.changed ? i18n.t("The original changed. Discard this copy and ask the Assistant to edit the current document.") : "");
  return <div className="h-full min-w-0 overflow-auto p-4" data-testid="assistant-change-comparison">
    <header className="flex flex-wrap items-center gap-2 p-4">
      <strong className="min-w-0 flex-1 break-all" title={path} tabIndex={0}>{path.split(/[\\/]/).at(-1)}</strong>
      {!outcome ? <><Button disabled={busy || !preview || preview.changed} onClick={() => void act("apply")}>{i18n.t("Apply")}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => void act("discard")}>{i18n.t("Discard")}</Button></> : <span role="status">{i18n.t(outcome)}</span>}
      {error || blocked ? <p role="alert" className="basis-full text-sm">{error || blocked}</p> : null}
    </header>
    {!outcome ? <SourceCompare pending load={load} visual={{ client, path }} /> : null}
  </div>;
}
