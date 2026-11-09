import type { ViewRow } from "@litzio/core/views";
import { ViewInputError, type ViewInputIssue, type CatalogView as View, type ViewOperation } from "@litzio/core/views-v2";
import { ViewOperationError } from "./source-state.ts";
import type { HostClient } from "../host-client.ts";
export type ViewResult = { catalog?: { operations: PublicViewOperation[] }; screens?: ViewScreen[]; views?: {plugin:string;id:string;title:string;definition:View}[]; fields?: Record<string, string>; view?: View; rows?: ViewRow[]; receipt: { requestId: string; operation: string; version: number; scope: string; outcome: string; timestamp: string } };
export async function viewRequest(client: HostClient, input: unknown, signal?: AbortSignal): Promise<ViewResult> {
  signal?.throwIfAborted();
  const response = await client.request("/api/views", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal });
  const result = await response.json();
  signal?.throwIfAborted();
  if (!response.ok || result.receipt?.outcome !== "success") {
    if (result.code === "unavailable") throw new ViewOperationError(result.errorKind, false, "unavailable");
    if (result.code === "invalid-input" && Array.isArray(result.inputIssues) && result.inputIssues.every((issue: unknown) => issue && typeof issue === "object" && "keyword" in issue && typeof issue.keyword === "string" && (!("field" in issue) || typeof issue.field === "string"))) {
      throw new ViewInputError("Invalid operation args", result.inputIssues.map((issue: ViewInputIssue) => ({ field: issue.field, keyword: issue.keyword })));
    }
    throw new ViewOperationError(result.errorKind, result.receipt?.outcome === "uncertain");
  }
  return result;
}

export type PublicViewOperation = Omit<ViewOperation, "validateArgs"> & { plugin?: string };
/** V2 owns the HTTP envelope. Keep its catalog path/shape at this single boundary. */
export async function readViewCatalog(client: HostClient, signal?: AbortSignal): Promise<{ operations: PublicViewOperation[] }> {
  const result = await viewRequest(client, { action: "catalog" }, signal);
  if (!result.catalog || !Array.isArray(result.catalog.operations)) throw new ViewOperationError("unavailable");
  return result.catalog;
}

export type ViewScreen = {plugin:string;id:string;title:string;icon:string;defaultViewIds:string[];jobs?:string[];primary:boolean};
