/** Host-owned, daemon-lifetime observation of an unconfirmed proposal change. */
export type ReviewPendingChange = {
  proposalId: string;
  requestId: string;
  action: "approve" | "reject" | "undo";
  receipt: { requestId: string; outcome: string };
};
