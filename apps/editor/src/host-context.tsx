import { createContext, useContext, useState } from "react";
import { getHostClient, type HostClient } from "./host-client.ts";
export const HostClientContext = createContext<HostClient | undefined>(undefined);
/** A mounted surface keeps its client even when the current connection changes. */
export function useHostClient() {
  const inherited = useContext(HostClientContext);
  const [client] = useState(() => inherited ?? getHostClient());
  return client;
}
