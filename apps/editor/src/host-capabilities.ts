import { hostClient } from "./host-client.ts";
export let fileDeletion: "trash" | "permanent" = "permanent";

/** The confirmation names the actual Host deletion adapter, in Desktop and browsers alike. */
export async function connectHost(): Promise<void> {
  try {
    const response = await hostClient.request("/api/host-capabilities");
    if (response.ok) fileDeletion = (await response.json()).fileDeletion === "trash" ? "trash" : "permanent";
  } catch { /* Vite has no capability endpoint; its deletion remains permanent. */ }
}
