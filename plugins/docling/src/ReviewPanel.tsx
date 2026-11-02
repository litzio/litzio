import { useEffect, useRef, useState } from "react";
import type { UiHost } from "@litzio/plugin-api/ui";
import type { StructureReviewer } from "./structure-review.ts";
type Review = ReturnType<StructureReviewer["list"]> & { problem?: string };
export function ReviewPanel({ host, folder, summary = false, agentReady = true, documentReady = true, onSelect, onChanged }: {
  host: UiHost; folder: string; summary?: boolean; agentReady?: boolean; documentReady?: boolean; onSelect?(refs: string[]): void; onChanged?(): Promise<void>;
}) {
  const { text, Button } = host;
  const [review, setReview] = useState<Review>(), [problem, setProblem] = useState("");
  const [readProblem, setReadProblem] = useState("");
  const [busy, setBusy] = useState(false), pending = useRef(false);
  const [selected, setSelected] = useState("");
  const generation = useRef(0), needsDocumentRefresh = useRef(false);
  const alive = useRef(true), enabled = host.features?.review !== false;
  const refresh = async () => {
    const version = generation.current;
    try {
      if (needsDocumentRefresh.current) {
        await onChanged?.();
        if (!alive.current || version !== generation.current) return;
      }
      const value = await host.readJson<Review>("api/docling-review", { folder });
      if (!alive.current || version !== generation.current) return;
      needsDocumentRefresh.current = false;
      setReview(value); setReadProblem("");
    } catch (error) {
      if (alive.current && version === generation.current) setReadProblem(error instanceof Error ? error.message : String(error));
      throw error;
    }
  };

  useEffect(() => {
    alive.current = true;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { if (!pending.current) await refresh(); }
      catch { /* refresh owns contextual read errors; observation retries GET only. */ }
      finally { if (!stopped) timer = setTimeout(poll, 1000); }
    };
    if (enabled) void poll();
    return () => { stopped = true; alive.current = false; clearTimeout(timer); };
  }, [folder, enabled]);
  const act = async (action: string) => {
    if (pending.current) return;
    generation.current++; pending.current = true; setBusy(true); setProblem("");
    const changesDocument = action === "approve" || action === "undo";
    // Even a failed response may follow a committed publication. Never replay it.
    if (changesDocument) needsDocumentRefresh.current = true;
    const errors: string[] = [];
    try {
      const value = await host.requestJson<Review & { error?: string }>(`api/docling-review${["approve", "reject", "undo"].includes(action) ? `-${action}` : ""}`,
        action === "cancel" ? "DELETE" : "POST", { folder, id: action === "start" ? crypto.randomUUID() : selected });
      if (value.error) throw new Error(value.error);
      if (!changesDocument && alive.current) setReview(value);
    } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    try { if (changesDocument) await refresh(); }
    catch { /* Keep the reconciliation flag and read error for the next poll. */ }
    finally {
      pending.current = false;
      if (alive.current) { setProblem(errors.join("; ")); setBusy(false); }
    }
  };

  const reason = !enabled ? "Review is disabled." : !review?.available || !agentReady ? "AI agent is disabled or unavailable." : host.features?.conversion === false ? "Enable PDF conversion to apply review corrections." : (!documentReady || needsDocumentRefresh.current) ? "Loading…" : "";
  const task = review?.task, proposal = review?.proposals.find(p => p.id === selected);
  type Proposal = Review["proposals"][number];
  const kind = (operation: Proposal["suggestion"]["operation"]) => text({ heading: "Heading depth", "merge-paragraphs": "Merge paragraphs", furniture: "Header/footer classification" }[operation]);
  const state = (p: Proposal) => text(p.stale ? "Stale" : { pending: "Pending", approved: "Approved", rejected: "Rejected", inapplicable: "Cannot apply" }[p.state]);
  const source = (p: Proposal) => p.before.text || p.suggestion.evidence[0]?.text || text("Original source unavailable");
  const excerpt = (value: string) => { const chars = Array.from(value.replace(/\s+/gu, " ").trim()); return chars.slice(0, 100).join("") + (chars.length > 100 ? "…" : ""); };
  const heading = (level?: number | null) => level ? text("Heading {{level}}", { level }) : text("Body text");
  const classification = (label?: string, level?: number) => label === "section_header" || label === "title"
    ? (level ? heading(level) : text("Heading"))
    : text(label === "text" ? "Body text" : label === "page_header" ? "Page header" : label === "page_footer" ? "Page footer" : "Other content");
  const changeValue = (change: Proposal["suggestion"] | Proposal["before"]["corrections"][number]) => "level" in change.value
    ? heading(change.value.level) : "label" in change.value ? classification(change.value.label) : text("Merge paragraphs");
  return <section className="docling-review" aria-label={text("Structure review")} aria-busy={busy}>
    <div className="docling-review-actions"><strong>{text("Structure review")}</strong>
      <span>{text("Pending proposals")}: {review?.proposals.filter(p => p.state === "pending" && !p.stale).length ?? "…"}</span>
      {summary ? <><Button disabled={busy || !!reason || task?.status === "running"} onClick={() => void act("start")}>{text("Run review")}</Button>
        {task?.status === "running" ? <Button disabled={busy || !review?.canCancel} onClick={() => void act("cancel")}>{text("Cancel review")}</Button> : null}</> : null}
    </div>
    {reason ? <p>{text(reason)}</p> : null}
    {task ? <p role="status">{text(task.status === "running" ? "Review in progress" : task.status === "success" ? "Review completed" : task.status === "cancelled" ? "Review cancelled" : task.status === "uncertain" ? "Review outcome is uncertain. Check before starting again." : "Review failed")}{task.failure ? ` · ${text(task.failure)}` : ""}{task.error ? ` · ${task.error}` : ""}</p> : null}
    {problem || readProblem || review?.problem ? <p role="alert">{[problem, readProblem, review?.problem].filter(Boolean).join("; ")}</p> : null}
    {!summary && enabled && review?.available ? <div className="docling-review-content">
      <div className="docling-review-list" aria-label={text("Review proposals")}>
        {!review.proposals.length ? <p>{text("No review proposals yet.")}</p> : null}
        {review.proposals.map(p => <button type="button" key={p.id} aria-pressed={selected === p.id} onClick={() => {
          setSelected(p.id); onSelect?.([p.suggestion.self_ref, ...(p.suggestion.operation === "merge-paragraphs" ? [p.suggestion.value.next] : [])]);
        }}>
          <span className="docling-review-source">{excerpt(source(p))}</span>
          <span className="docling-review-item-labels"><span>{kind(p.suggestion.operation)}</span><span className="docling-review-state">{state(p)}</span></span>
          <span className="docling-review-meta">{p.suggestion.self_ref}</span>
        </button>)}
      </div>
      {proposal ? <div className="docling-review-proposal">
        <strong>{kind(proposal.suggestion.operation)}</strong>
        <span className="docling-review-meta">{proposal.suggestion.self_ref}</span>
        <p>{text("Target source")}: {proposal.before.text}{proposal.before.nextText ? ` · ${proposal.before.nextText}` : ""}</p>
        {proposal.suggestion.evidence.map((e, i) => <p key={i}>{text("Source page")} {e.page}: {e.text}</p>)}
        <p>{proposal.suggestion.reason}</p>
        <div className="docling-review-values">
          <div><strong>{text("Before")}</strong>{proposal.suggestion.operation === "merge-paragraphs" ? <>
            <p>{proposal.before.text || text("Original source unavailable")}</p><p>{proposal.before.nextText || text("Original source unavailable")}</p>
          </> : <p>{classification(proposal.before.label, proposal.before.level)}</p>}</div>
          <div><strong>{text("After")}</strong><p>{proposal.suggestion.operation === "merge-paragraphs"
            ? (proposal.before.text && proposal.before.nextText ? `${proposal.before.text} ${proposal.before.nextText}` : text("Original source unavailable"))
            : changeValue(proposal.suggestion)}</p></div>
        </div>
        {proposal.before.corrections.length ? <div><strong>{text("Approved changes")}</strong><ul>{proposal.before.corrections.map((change, index) => <li key={index}>{kind(change.operation)}: {changeValue(change)}</li>)}</ul></div> : null}
        <p className="docling-review-status">{state(proposal)}{proposal.validationError ? ` · ${proposal.validationError}` : ""}</p>

      </div> : null}
    </div> : null}
    {!summary && enabled && review?.available ? <div className="docling-review-actions">
          {proposal?.state === "pending" ? <Button variant="default" disabled={busy || !!reason || proposal?.stale} onClick={() => void act("approve")}>{text("Approve proposal")}</Button> : null}
          {["pending", "inapplicable"].includes(proposal?.state ?? "") ? <Button variant="secondary" disabled={busy || !!reason} onClick={() => void act("reject")}>{text("Reject proposal")}</Button> : null}
          {proposal?.state === "approved" ? <Button variant="secondary" disabled={busy || !!reason || proposal?.stale} onClick={() => void act("undo")}>{text("Undo approval")}</Button> : null}
        </div> : null}
  </section>;
}
