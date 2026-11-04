import type { HostConnection } from "../shared/desktop-bridge.ts";
import { setDesktopHost } from "./host-client.ts";

type Connection = { phase: "connecting" | "connected" | "disconnected"; problem?: string; version?: HostConnection };
let state: Connection = { phase: "connecting" };
const listeners = new Set<() => void>();
export const desktopConnection = {
  get: () => state,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
function update(value: Connection) { state = value; listeners.forEach(listener => listener()); }
export function disconnectDesktop() { update({ ...state, phase: "disconnected" }); }
export async function connectDesktop(reconnect = false): Promise<void> {
  const desktop = window.litzioDesktop;
  if (!desktop) return;
  update({ ...state, phase: "connecting", problem: undefined });
  try {
    const version = await (reconnect ? desktop.reconnectDaemon() : desktop.hostConnection());
    setDesktopHost(version.url);
    update({ phase: "connected", version });
  } catch (error) { update({ ...state, phase: "disconnected", problem: String(error) }); }
}
