import { ASSISTANT_TRANSPORT_LIMITS } from "../shared/assistant-limits.ts";
import type { HostClient } from "./host-client.ts";
import type { AiProvider } from "../shared/assistant.ts";

export async function observeAssistantProvider<T>(
  request: (url: string) => Promise<T>, route: string, provider: AiProvider, update: (value: T) => void,
) {
  const url = `${route}?provider=${provider}`;
  update(await request(`${url}&cache=prefer`));
  update(await request(`${url}&cache=revalidate`));
}

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
