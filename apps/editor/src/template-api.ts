import { getHostClient, type HostClient } from "./host-client.ts";
import type { SaveTemplateRequest, TemplateContent, TemplateList } from "../shared/template-protocol.ts";
import { i18n } from "./i18n.ts";

const templateText = i18n.getFixedT(null, "templates");

export const templateLanguage = () => i18n.resolvedLanguage === "ko" ? "ko" : "en";

export function createTemplateRequest(client: HostClient) { return async function templateRequest<T extends TemplateList | TemplateContent>(route: string, body?: SaveTemplateRequest, signal?: AbortSignal): Promise<T> {
  const response = await client.request(`/api/${route}`, {
    method: body ? "POST" : "GET", signal,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(templateError(payload.error ?? `request failed (${response.status})`));
  return payload as T;
}

}
export const templateRequest = createTemplateRequest(getHostClient());

// Host errors are literal transport details; localize the actionable naming failures here.
export function templateError(error: string): string {
  switch (error) {
    case "Template already exists.": return templateText("A template with this name already exists. Choose another name.");
    case "Template name is reserved for an app default.": return templateText("This name is reserved for an app default. Choose another name.");
    case "Template name must be a valid file stem.": return templateText("Enter a valid template file name without an extension or directory.");
    default: return error;
  }
}
