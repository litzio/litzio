import { i18n } from "../i18n.ts";
import type { SourceState } from "@litzio/core/views-v2";

// #1233: untrusted text is never used as user-facing failure advice.
const messages: Record<string, string> = {
  auth: "Authentication required. Check credentials in plugin settings.",
  forbidden: "Access denied. Ask the service administrator for permission.",
  not_found: "Target not found. Check the target address or identifier.",
  unavailable: "Service unavailable. Try again later.",
  timeout: "Operation timed out. Check the service connection.",
  failed: "View operation failed. Check the settings and target.",
};
export class ViewOperationError extends Error {
  constructor(public kind: unknown, public uncertain = false, public code?: string) { super("View operation failed"); }
}
export function sourceFailure(error: unknown): { state: SourceState; message: string } {
  if (error instanceof ViewOperationError && error.code === "unavailable") return { state: "unavailable", message: i18n.t("This view is no longer available. Create a new view.") };
  if (error instanceof ViewOperationError && error.uncertain) return { state: "uncertain", message: i18n.t("The outcome is unknown. Check the target before trying again.") };
  const kind = error instanceof ViewOperationError && typeof error.kind === "string" && Object.hasOwn(messages, error.kind) ? error.kind : "failed";
  return { state: kind === "unavailable" ? "unavailable" : "failure", message: i18n.t(messages[kind], { defaultValue: messages[kind] }) };
}

/** Fixed advice from the validator keyword and public constraints; never from input values/messages. */
export function inputIssueMessage(keyword: string, schema?: { format?: string; minimum?: number; maximum?: number; minLength?: number; maxLength?: number }): string {
  if (keyword === "required") return i18n.t("Enter a value.");
  if (keyword === "pattern") return i18n.t("Use the required format.");
  if (keyword === "format" && schema?.format === "date") return i18n.t("Enter a valid date (YYYY-MM-DD).");
  const limit = schema?.[keyword as "minimum" | "maximum" | "minLength" | "maxLength"];
  if (typeof limit === "number" && Number.isFinite(limit)) {
    if (keyword === "minimum") return i18n.t("Enter a value of at least {{n}}.", { n: limit });
    if (keyword === "maximum") return i18n.t("Enter a value of at most {{n}}.", { n: limit });
    if (keyword === "minLength") return i18n.t("Use at least {{n}} characters.", { n: limit });
    if (keyword === "maxLength") return i18n.t("Use at most {{n}} characters.", { n: limit });
  }
  return i18n.t("Check this value against the operation requirements.");
}
