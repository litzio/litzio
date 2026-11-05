import type { ViewRow } from "@litzio/core/views";
import type { QueryView as View, ViewInputIssue } from "@litzio/core/views-v2";
import type { createCatalogV2 } from "@litzio/core/views-v2";
import type { HostClient } from "../host-client.ts";
export const STATISTICS_PLUGIN = "litzio.statistics";
export class ViewValidationError extends Error {
  constructor(reason: string) {
    let message = reason;
    try {
      const issues = JSON.parse(reason);
      if (Array.isArray(issues)) message = issues.map(issue => `${Array.isArray(issue.path) ? issue.path.join(".") : "view"}: ${issue.message}`).join("; ");
    } catch { /* Parser/refusal errors are already text. */ }
    super(message);
  }
}
export const statisticsView = { kind: "litzio-view", schemaVersion: 2, catalog: "litzio-v2", profile: "query", title: "Document statistics", refresh: "manual", sources: { stats: { operation: "folder.statistics", version: 1, args: {} } }, layout: { component: "VerticalPanel", children: [{ component: "Table", title: "Documents by folder", source: "stats", data: "/rows", columns: ["folder", "documents", "headings", "modified"] }] } } as const;
export type ViewResult = { catalog?: Omit<ReturnType<typeof createCatalogV2>, "operations"> & { operations: (ReturnType<typeof createCatalogV2>["operations"][number] & { plugin: string })[] }; fields?: Record<string, string>; view?: View; rows?: ViewRow[]; favourites?: string[]; name?: string; target?: { root: string }; receipt: { requestId: string; operation: string; version: number; scope: string; outcome: string; timestamp: string } };
export async function viewRequest(client: HostClient, input: unknown, signal?: AbortSignal): Promise<ViewResult> {
  signal?.throwIfAborted();
  const response = await client.request("/api/views", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal });
  const result = await response.json();
  signal?.throwIfAborted();
  if (!response.ok || result.receipt?.outcome !== "success") {
    const Validation = response.status === 400 && result.receipt?.operation === "view.validate" ? ViewValidationError : Error;
    const issues = result.inputIssues?.map((issue: ViewInputIssue) => `${issue.field ?? "input"}: ${issue.keyword}`).join("; ");
    throw new Validation(result.errorKind ? `[${result.errorKind}] ${result.error}` : [result.error ?? "View operation failed", issues].filter(Boolean).join(" "));
  }
  return result;
}
