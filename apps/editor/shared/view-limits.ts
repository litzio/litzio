/** Query definitions have a 32 KiB Core limit; transport includes metadata and rows. */
export const VIEW_TRANSPORT_LIMITS = { requestBytes: 32768 + 65536, responseBytes: 8 * 1048576 } as const;
