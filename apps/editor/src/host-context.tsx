import { createContext, useContext, useState } from "react";
import { LOCAL_HOST_ID } from "./host-locator.ts";
import { getHostClient } from "./host-client.ts";
export const HostContext = createContext(LOCAL_HOST_ID);
/** Mount a separate surface for each Host. Tab/filter changes never retarget it. */
export function useHostId() {
  const value = useContext(HostContext);
  const [hostId] = useState(value);
  return hostId;
}
export function useHostClient() {
  const hostId = useHostId();
  const [client] = useState(() => getHostClient(hostId));
  return client;
}
