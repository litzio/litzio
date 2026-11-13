import { hostConnection } from "./host-client.ts";
export function fileDeletion(): "trash" | "permanent" {
  return hostConnection.get().capabilities?.fileDeletion ?? "permanent";
}
export async function connectHost(): Promise<void> {
  await hostConnection.connect();
}
