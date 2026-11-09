/** Bound ordinary assistant history and tool-result responses without truncation. */
export const ASSISTANT_TRANSPORT_LIMITS = { requestBytes: 1048576 + 65536, responseBytes: 8 * 1048576 } as const;
