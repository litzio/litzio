import { useEffect, useRef, useState } from "react";
import type { UiHost } from "@litzio/plugin-api/ui";
import type { StructureReviewer } from "./structure-review.ts";
type Review = ReturnType<StructureReviewer["list"]> & { problem?: string };
export function ReviewPanel({ host, folder, summary = false, agentReady = true, onSelect, onChanged }: {
  host: UiHost; folder: string; summary?: boolean; agentReady?: boolean; onSelect?(refs: string[]): void; onChanged?(): Promise<void>;
}) {
  const { text, Button } = host;
  const [review, setReview] = useState<Review>(), [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false), pending = useRef(false);
  const [selected, setSelected] = useState("");
  const generation = useRef(0);
  const alive = useRef(true), enabled = host.features?.review !== false;
  const refresh = async () => {
    const version = generation.current;
    const value = await host.readJson<Review>("api/docling-review", { folder });
    if (alive.current && version === generation.current) setReview(value);
  };
  useEffect(() => {
    alive.current = true;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { if (!pending.current) await refresh(); }
      catch (error) { if (!stopped) setProblem(String(error)); }
      finally { if (!stopped) timer = setTimeout(poll, 1000); }
    };
    if (enabled) void poll();
    return () => { stopped = true; alive.current = false; clearTimeout(timer); };
  }, [folder, enabled]);
  const act = async (action: string) => {
    if (pending.current) return;
    generation.current++; pending.current = true; setBusy(true); setProblem("");
    try {
      const value = await host.requestJson<Review & { error?: string }>(`api/docling-review${["approve", "reject", "undo"].includes(action) ? `-${action}` : ""}`,
        action === "cancel" ? "DELETE" : "POST", { folder, id: action === "start" ? crypto.randomUUID() : selected });
      if (value.error) throw new Error(value.error);
      if (action === "approve" || action === "undo") await onChanged?.();
      if (alive.current) setReview(value);
    } catch (error) { if (alive.current) setProblem(error instanceof Error ? error.message : String(error)); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  const reason = !enabled ? "Review is disabled." : !review?.available || !agentReady ? "AI agent is disabled or unavailable." : host.features?.conversion === false ? "Enable PDF conversion to apply review corrections." : "";
  const task = review?.task, proposal = review?.proposals.find(p => p.id === selected);
  return <section className="docling-review" aria-label={text("Structure review")} aria-busy={busy}>
    <div className="docling-review-actions"><strong>{text("Structure review")}</strong>
      <span>{text("Pending proposals")}: {review?.proposals.filter(p => p.state === "pending" && !p.stale).length ?? "…"}</span>
      {summary ? <><Button disabled={busy || !!reason || task?.status === "running"} onClick={() => void act("start")}>{text("Run review")}</Button>
        {task?.status === "running" ? <Button disabled={busy || !review?.canCancel} onClick={() => void act("cancel")}>{text("Cancel review")}</Button> : null}</> : null}
    </div>
    {reason ? <p>{text(reason)}</p> : null}
    {task ? <p role="status">{text(task.status === "running" ? "Review in progress" : task.status === "success" ? "Review completed" : task.status === "cancelled" ? "Review cancelled" : task.status === "uncertain" ? "Review outcome is uncertain. Check before starting again." : "Review failed")}{task.failure ? ` · ${text(task.failure)}` : ""}{task.error ? ` · ${task.error}` : ""}</p> : null}
    {problem || review?.problem ? <p role="alert">{problem || review?.problem}</p> : null}
    {!summary && enabled && review?.available ? <div className="docling-review-content">
      <div className="docling-review-list" aria-label={text("Review proposals")}>
        {!review.proposals.length ? <p>{text("No review proposals yet.")}</p> : null}
        {review.proposals.map(p => <button type="button" key={p.id} aria-pressed={selected === p.id} onClick={() => {
          setSelected(p.id); onSelect?.([p.suggestion.self_ref, ...(p.suggestion.operation === "merge-paragraphs" ? [p.suggestion.value.next] : [])]);
        }}>{text(p.suggestion.operation)} · {p.suggestion.self_ref} · {text(p.stale ? "Stale proposal" : p.state)}</button>)}
      </div>
      {proposal ? <div className="docling-review-proposal">
        <strong>{text(proposal.suggestion.operation)} · {proposal.suggestion.self_ref}</strong>
        <p>{text("Target source")}: {proposal.before.text}{proposal.before.nextText ? ` · ${proposal.before.nextText}` : ""}</p>
        {proposal.suggestion.evidence.map((e, i) => <p key={i}>{text("Source page")} {e.page}: {e.text}</p>)}
        <p>{proposal.suggestion.reason}</p>
        <div className="docling-review-values"><div><strong>{text("Before")}</strong><pre>{proposal.before.label}{proposal.before.level ? ` H${proposal.before.level}` : ""}{proposal.before.corrections.length ? ` · ${JSON.stringify(proposal.before.corrections)}` : ""}</pre></div><div><strong>{text("After")}</strong><pre>{JSON.stringify(proposal.suggestion.value)}</pre></div></div>
        <p>{text(proposal.stale ? "Stale proposal" : proposal.state)}{proposal.validationError ? ` · ${proposal.validationError}` : ""}</p>

      </div> : null}
    </div> : null}
    {!summary && enabled && review?.available ? <div className="docling-review-actions">
          {proposal?.state === "pending" ? <Button disabled={busy || !!reason || proposal?.stale} onClick={() => void act("approve")}>{text("Approve proposal")}</Button> : null}
          {["pending", "inapplicable"].includes(proposal?.state ?? "") ? <Button disabled={busy || !!reason} onClick={() => void act("reject")}>{text("Reject proposal")}</Button> : null}
          {proposal?.state === "approved" ? <Button disabled={busy || !!reason || proposal?.stale} onClick={() => void act("undo")}>{text("Undo approval")}</Button> : null}
        </div> : null}
  </section>;
}
