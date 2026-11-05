import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { EditorFileResponse } from "../shared/document-protocol.ts";
import type { EditorSession, SessionSnapshot } from "./DocumentTab.tsx";
import { type HostClient, getHostClient, hostRegistry } from "./host-client.ts";
import { LOCAL_HOST_ID, locatorKey } from "./host-locator.ts";
import { openedTab, type GroupAction } from "./document-tabs.ts";
import { newRecoveryId, recoveryStorage, type RecoveryRecord } from "./recovery-storage.ts";
import { prepareRecovery } from "./recovery-restore.ts";
import { UiError } from "./ui-message.ts";

export type Tab = { client: HostClient; hostId: string; id: string; path: string; file: EditorFileResponse; recoveryId: string; restored?: SessionSnapshot };

/** Shell admission; callers retain operation UI and Host restoration lifetimes. */
export function createTabAdmission({ tabs, latestTabs, nextId, startupOverrides, splitAvailable, focused,
  sessions, setTabs, navigate, placeTab, rememberTabs, setRecoveryReview, refreshRecovery }: {
  tabs: Tab[];
  latestTabs: MutableRefObject<Tab[]>;
  nextId: MutableRefObject<number>;
  startupOverrides: MutableRefObject<Set<string>>;
  splitAvailable: MutableRefObject<boolean>;
  focused: number;
  sessions: MutableRefObject<Map<string, EditorSession>>;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  navigate: Dispatch<GroupAction>;
  placeTab: (id: string, group?: number, hostId?: string) => void;
  rememberTabs: (hostId?: string) => void;
  setRecoveryReview: (value: null) => void;
  refreshRecovery: () => Promise<RecoveryRecord[] | null>;
}) {
  function acceptFile(file: EditorFileResponse, client: HostClient, group = focused, hostId = LOCAL_HOST_ID): void {
    client.assertCurrent();
    startupOverrides.current.add(locatorKey({ hostId, path: file.path }));
    const existing = openedTab(latestTabs.current, file.path, hostId);
    const target = splitAvailable.current ? group : focused;
    if (existing) placeTab(existing.id, target);
    else {
      const id = `document-${++nextId.current}`;
      const recoveryId = newRecoveryId();
      setTabs(previous => [...previous, { client, id, hostId, path: file.path, file, recoveryId }]);
      placeTab(id, target, hostId);
    }
  }
  async function restoreRecovery(record: RecoveryRecord): Promise<void> {
    hostRegistry.get(record.hostId);
    const client = getHostClient(record.hostId);
    client.assertCurrent();
    const restored = prepareRecovery(record);
    const existing = openedTab(tabs, record.path, record.hostId);
    const owner = existing && sessions.current.get(existing.id);
    if (owner && (owner.busyRef.current || owner.editorRef.current?.hasUnsavedChanges())) {
      throw new UiError({ key: "This document already has open work. Close its tab before restoring a recovery record." });
    }
    const recoveryId = newRecoveryId();
    startupOverrides.current.add(locatorKey(record));
    await recoveryStorage.restore(record, recoveryId);
    try { client.assertCurrent(); }
    catch (cause) {
      // restore only transfers the durable record to recoveryId; preserve it for review.
      setRecoveryReview(null);
      await refreshRecovery();
      throw cause;
    }
    const id = `document-${++nextId.current}`;
    setTabs(previous => [...previous.filter(tab => tab.id !== existing?.id), { client, id, hostId: record.hostId, path: record.path, file: restored.file, recoveryId, restored }]);
    if (existing) navigate({ type: "close", id: existing.id });
    navigate({ type: "open", id });
    rememberTabs(record.hostId);
    setRecoveryReview(null);
    await refreshRecovery();
  }
  function addInitial(initialTabs: Tab[], file: EditorFileResponse, client: HostClient): void {
    client.assertCurrent();
    if (!openedTab(initialTabs, file.path)) initialTabs.push({ client, hostId: LOCAL_HOST_ID, id: `document-${++nextId.current}`, path: file.path, file, recoveryId: newRecoveryId() });
  }
  function acceptRestored(file: EditorFileResponse, client: HostClient, hostId: string, path: string): void {
    if (startupOverrides.current.has(locatorKey({ hostId, path })) ||
        startupOverrides.current.has(locatorKey({ hostId, path: file.path })) ||
        openedTab(latestTabs.current, file.path, hostId)) return;
    const id = `document-${++nextId.current}`;
    const tab = { client, hostId, id, path: file.path, file, recoveryId: newRecoveryId() };
    // Reserve this admission before another restoration response can allocate a duplicate ID.
    latestTabs.current = [...latestTabs.current, tab];
    setTabs(previous => [...previous, tab]);
    navigate({ type: "open", id });
  }
  return { acceptFile, restoreRecovery, addInitial, acceptRestored };
}
