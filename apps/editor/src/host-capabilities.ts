import { hostRegistry } from "./host-client.ts";
import { LOCAL_HOST_ID } from "./host-locator.ts";
export function fileDeletion(hostId = LOCAL_HOST_ID): "trash" | "permanent" {
  return hostRegistry.get(hostId).capabilities?.fileDeletion ?? "permanent";
}
export async function connectHost(hostId = LOCAL_HOST_ID): Promise<void> {
  await hostRegistry.connect(hostId);
}
