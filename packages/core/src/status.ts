export const DOCUMENT_STATUSES = ["draft", "review", "approved"] as const;
export type DocumentStatus = typeof DOCUMENT_STATUSES[number];
