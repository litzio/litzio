import type { HostConnection } from "../shared/desktop-bridge.ts";
import { hostConnection, setDesktopHost } from "./host-client.ts";

type Connection = { phase: "connecting" | "connected" | "disconnected"; problem?: string; version?: HostConnection; ended?: boolean };
let state: Connection = { phase: "connecting" };
const listeners = new Set<() => void>();
export const desktopConnection = {
  get: () => state,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
function update(value: Connection) { state = value; listeners.forEach(listener => listener()); }
export function disconnectDesktop(problem?: string, ended = false) {
  if (ended) hostConnection.endScreenConnection();
  if (state.phase === "connected" || ended) update({ ...state, phase: "disconnected", problem, ended });
}
export async function connectDesktop(reconnect = false): Promise<void> {
  const desktop = window.litzioDesktop;
  if (!desktop) return;
  if (reconnect) hostConnection.endScreenConnection();
  update({ ...state, phase: "connecting", problem: undefined });
  try {
    const version = await (reconnect ? desktop.reconnectDaemon() : desktop.hostConnection());
    setDesktopHost(version.url, version.instanceId, version.screenInstanceGuard);
    update({ phase: "connected", version });
  } catch (error) { update({ ...state, phase: "disconnected", problem: String(error) }); }
}
