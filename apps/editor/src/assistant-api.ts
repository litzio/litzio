import type { HostClient } from "./host-client.ts";
/** A conversation owns this transport for its entire lifetime. */
export function createAssistantRequest(client: HostClient) {
  return async function request<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await client.request(url, { ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}), signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? response.statusText);
    return data;
  };
}
