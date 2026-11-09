import { ASSISTANT_TRANSPORT_LIMITS } from "../shared/assistant-limits.ts";
import type { HostClient } from "./host-client.ts";
/** A conversation owns this transport for its entire lifetime. */
export function createAssistantRequest(client: HostClient) {
  return async function request<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const encoded = body ? JSON.stringify(body) : undefined;
    if (encoded && new TextEncoder().encode(encoded).byteLength > ASSISTANT_TRANSPORT_LIMITS.requestBytes) throw new Error("Assistant request exceeds byte limit.");
    const response = await client.request(url, { ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: encoded } : {}), signal });
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > ASSISTANT_TRANSPORT_LIMITS.responseBytes) throw new Error("Assistant response exceeds byte limit.");
    const data = JSON.parse(text);
    if (!response.ok) {
      throw new Error(data.error ?? response.statusText);
    }
    return data;
  };
}
