import { REVIEW_UNAVAILABLE_GUIDANCE } from "../../shared/review.ts";
import type { ReviewView, ReviewBaseline, ReviewProposal } from "@litzio/core/views-v2";
import type { HostClient } from "../host-client.ts";
import type { ReviewAdapter, ReviewSnapshot } from "../review/ReviewRenderer.tsx";

export type ReviewObservation = { pending?: NonNullable<ReviewAdapter["pending"]> };

/** Thin transport boundary; V4 owns snapshot assembly and all semantic writes. */
export function createReviewAdapter(client: HostClient, view: ReviewView, root: string, signal: AbortSignal, open: (path: string) => void, observation: ReviewObservation = {}): ReviewAdapter {
  let documentPath: string | undefined;
  const uncertain = () => new Error(observation.pending?.verification === "unavailable" ? REVIEW_UNAVAILABLE_GUIDANCE : "Outcome unknown. Query the same requestId; do not resend the change.");
  const request = async (input: Record<string, unknown>) => {
    const response = await client.request("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ ...view.sources.review, root, ...input }) });
    const result = await response.json();
    signal.throwIfAborted();
    return { ok: response.ok, ...result };
  };
  return {
    get pending() { return observation.pending ? structuredClone(observation.pending) : undefined; },
    async read(pageNo) {
      if (observation.pending) {
        if (observation.pending.verification === "unavailable") throw uncertain();
        const result = await request({ action: "status", requestId: observation.pending.requestId });
        if (result.receipt?.requestId === observation.pending.requestId) observation.pending = { ...observation.pending, receipt: result.receipt, verification: result.verification, guidance: result.guidance };
        if (!result.ok || result.receipt?.requestId !== observation.pending.requestId || !["success", "failure"].includes(result.receipt?.outcome)) throw uncertain();
        observation.pending = undefined;
      }
      const result = await request({ action: "read", pageNo });
      if (!result.ok || result.receipt?.outcome !== "success") throw new Error("Review data unavailable");
      const snapshot: ReviewSnapshot = result.snapshot;
      if (!snapshot?.bundle || !snapshot.documentPath) throw new Error("Review data unavailable");
      documentPath = snapshot.documentPath;
      // A new tab has no local observation: restore it from the authoritative Host snapshot.
      const unresolved = snapshot.unresolved?.[0];
      if (unresolved) observation.pending = { requestId: unresolved.requestId, receipt: unresolved.receipt, verification: unresolved.verification, guidance: unresolved.guidance };
      return snapshot;
    },
    async act(action, proposal: ReviewProposal, baseline: ReviewBaseline) {
      if (observation.pending) throw uncertain();
      observation.pending = { requestId: crypto.randomUUID() };
      const result = await request({ action, requestId: observation.pending.requestId, proposalId: proposal.id, baseline });
      if (result.pending?.requestId) observation.pending = { requestId: result.pending.requestId, receipt: result.pending.receipt, verification: result.pending.verification, guidance: result.pending.guidance };
      else if (result.receipt?.requestId === observation.pending.requestId) observation.pending = { ...observation.pending, receipt: result.receipt, verification: result.verification, guidance: result.guidance };
      if (!result.ok || result.receipt?.requestId !== observation.pending.requestId || result.receipt?.outcome !== "success") throw uncertain();
      observation.pending = undefined;
    },
    openDocument() { if (documentPath && !signal.aborted) open(documentPath); },
  };
}
