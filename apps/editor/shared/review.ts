/** Host-owned, daemon-lifetime observation of an unconfirmed proposal change. */
export const REVIEW_UNAVAILABLE_GUIDANCE = "Status checks cannot resolve this outcome. Do not repeat this change. Open the result document and inspect it.";
export const REVIEW_PENDING_GUIDANCE = "The request is still being observed. Check status with the same requestId; do not resend this change.";
export type ReviewVerification = "pending" | "unavailable";
export type ReviewPendingChange = {
  proposalId: string;
  requestId: string;
  action: "approve" | "reject" | "undo";
  receipt: { requestId: string; outcome: string };
  verification: ReviewVerification;
  guidance?: string;
};
