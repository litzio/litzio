import type { ReviewView, ReviewBaseline, ReviewProposal } from "@litzio/core/views-v2";
import type { HostClient } from "../host-client.ts";
import type { ReviewAdapter, ReviewSnapshot } from "../review/ReviewRenderer.tsx";

/** Thin transport boundary; V4 owns snapshot assembly and all semantic writes. */
export function createReviewAdapter(client: HostClient, view: ReviewView, root: string, signal: AbortSignal, open: (path: string) => void): ReviewAdapter {
  let documentPath: string | undefined;
  const request = async (input: Record<string, unknown>) => {
    const response = await client.request("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ ...view.sources.review, root, requestId: crypto.randomUUID(), ...input }) });
    const result = await response.json();
    signal.throwIfAborted();
    if (!response.ok || result.receipt?.outcome !== "success") throw new Error("Review operation unavailable");
    return result;
  };
  return {
    async read(pageNo) {
      const result = await request({ action: "read", pageNo });
      const snapshot: ReviewSnapshot = result.snapshot;
      if (!snapshot?.bundle || !snapshot.documentPath) throw new Error("Review data unavailable");
      documentPath = snapshot.documentPath;
      return snapshot;
    },
    async act(action, proposal: ReviewProposal, baseline: ReviewBaseline) { await request({ action, proposalId: proposal.id, baseline }); },
    openDocument() { if (documentPath && !signal.aborted) open(documentPath); },
  };
}
