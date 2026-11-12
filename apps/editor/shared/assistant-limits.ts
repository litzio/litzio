/** Bound ordinary assistant history and tool-result responses without truncation. */
export const ASSISTANT_TRANSPORT_LIMITS = { requestBytes: 1048576 + 65536, responseBytes: 8 * 1048576 } as const;

/** Bound ACKed window work if the sending window disappears; delivery still has its own 10s limit. */
export const ASSISTANT_WINDOW_WORK_TIMEOUT_MS = 5 * 60_000;
