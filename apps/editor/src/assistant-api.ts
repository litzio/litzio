import { ViewValidationError } from "./views/view-api.ts";
import { VIEW_TRANSPORT_LIMITS } from "../shared/view-limits.ts";
import type { HostClient } from "./host-client.ts";
/** A conversation owns this transport for its entire lifetime. */
export function createAssistantRequest(client: HostClient) {
  return async function request<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const encoded = body ? JSON.stringify(body) : undefined;
    if (encoded && new TextEncoder().encode(encoded).byteLength > VIEW_TRANSPORT_LIMITS.requestBytes) throw new Error("Assistant request exceeds view transport byte limit.");
    const response = await client.request(url, { ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: encoded } : {}), signal });
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > VIEW_TRANSPORT_LIMITS.responseBytes) throw new Error("Assistant response exceeds view transport byte limit.");
    const data = JSON.parse(text);
    if (!response.ok) {
      if (data.receipt?.operation === "view.propose" && data.receipt.outcome === "failure") throw new ViewValidationError("The view definition is invalid. Check the catalog and bindings.");
      throw new Error(data.error ?? response.statusText);
    }
    return data;
  };
}
