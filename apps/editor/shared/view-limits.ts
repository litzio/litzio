/** Transport envelopes include metadata and, for proposals, both definition and canonical text.
 * Core still enforces each source's smaller definition limit. Never truncate results. */
export const VIEW_TRANSPORT_LIMITS = { requestBytes: 1048576 + 65536, responseBytes: 8 * 1048576 } as const;
