import { useEffect, useReducer, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { DesktopBridge } from "../shared/desktop-bridge.ts";
import type { DocumentStartResponse, EditorFileResponse } from "../shared/document-protocol.ts";
import { getHostClient } from "./host-client.ts";
import { openedTab, type EditorGroups, type GroupAction } from "./document-tabs.ts";
import { createDocumentRequests } from "./document-session.ts";
import { readOpenTabs, writeOpenTabs } from "./preferences.ts";
import type { RecoveryRecord } from "./recovery-storage.ts";
import type { createTabAdmission, Tab } from "./tab-admission.ts";
import type { useFolderTrees } from "./shell/folder-tree.ts";
import type { Operation } from "./operation.ts";

/** Kept separate from restoration so the existing memory effect runs before shell effects. */
export function useTabNavigationMemory(tabs: Tab[], navigation: EditorGroups, activeId: string | null) {
  const startupOverrides = useRef(new Set<string>());
  const [tabsRestored, setTabsRestored] = useState(false);
  // A startup failure protects old memory until the user navigates this Host explicitly.
  const explicitNavigation = useRef(false);
  const [rememberVersion, advanceTabMemory] = useReducer(version => version + 1, 0);
  function rememberTabs(): void {
    explicitNavigation.current = true;
    advanceTabMemory();
  }
  const serializedTabs = JSON.stringify({ paths: navigation.groups.flatMap(group => group.tabs).flatMap(id => {
    const tab = tabs.find(tab => tab.id === id); return tab ? [tab.path] : [];
  }), activePath: tabs.find(tab => tab.id === activeId)?.path ?? null });
  // Like folder memory, explicit actions remember the live list, even after another tab wrote it.
  // Session reports, Save and restoration alone never write navigation preferences.
  useEffect(() => {
    if (tabsRestored && rememberVersion > 0) {
      const paths = navigation.groups.flatMap(group => group.tabs).flatMap(id => tabs.filter(tab => tab.id === id).map(tab => tab.path));
      writeOpenTabs({ paths, activePath: tabs.find(tab => tab.id === activeId)?.path ?? null });
    }
  }, [serializedTabs, tabsRestored, rememberVersion]);
  function markStartupOverride(path: string): void {
    startupOverrides.current.add(path);
  }
  return { tabsRestored, setTabsRestored, startupOverrides, rememberTabs, markStartupOverride, explicitNavigation, hasExplicitNavigation: rememberVersion > 0 };
}

/** Restore local navigation; admission owns registration and rejects late results. */
export function useHostTabRestore({ memory, folders, desktop, addInitial,
  refreshRecovery, reviewRecovery, setStart, setAllowedRoots, setTabs, navigate, setError, operationRef, setOperation }: {
  memory: ReturnType<typeof useTabNavigationMemory>;
  folders: Pick<ReturnType<typeof useFolderTrees>, "restored" | "rootOf">;
  desktop: DesktopBridge | undefined;
  addInitial: ReturnType<typeof createTabAdmission>["addInitial"];
  refreshRecovery: () => Promise<RecoveryRecord[] | null>;
  reviewRecovery: (record: RecoveryRecord, preserveCurrent?: boolean) => void;
  setStart: Dispatch<SetStateAction<DocumentStartResponse | null>>;
  setAllowedRoots: Dispatch<SetStateAction<string[] | undefined>>;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  navigate: Dispatch<GroupAction>;
  setError: (cause: Error | string) => void;
  operationRef: MutableRefObject<boolean>;
  setOperation: Dispatch<SetStateAction<Operation | "">>;
}) {
  const { tabsRestored, setTabsRestored } = memory;
  useEffect(() => {
    // Only remembered tabs need restored folder context. Without them, retain the existing
    // usable start/default document while folder restoration continues independently.
    if (tabsRestored || !folders.restored && readOpenTabs()?.paths.length) return;
    let current = true;
    const client = getHostClient();
    const { requestDocument, cancelReads } = createDocumentRequests(client);
    void (async () => {
      const path = new URLSearchParams(window.location.search).get("path")?.trim() || undefined;
      const saved = readOpenTabs();
      // Keep Host metadata and Desktop launch-file precedence. A browser default that
      // will not be used is optional; its failure cannot block the higher-priority route.
      let first: EditorFileResponse | DocumentStartResponse;
      try {
        const startup = await desktop?.startup?.();
        if (!current) return;
        first = await requestDocument("GET", startup?.document);
        if (startup) first = { ...first, samples: startup.samples, sampleProblem: startup.sampleProblem };
      }
      catch (cause) {
        if (!path && (desktop || !saved)) throw cause;
        first = { start: true };
      }
      if (!current) return;
      const next = path ? await requestDocument("GET", path, folders.rootOf(path)) : first;
      if (!current) return;
      const records = await refreshRecovery();
      if (!current) return;
      const initialTabs: Tab[] = [];
      const add = (file: EditorFileResponse) => addInitial(initialTabs, file, client);
      // Explicit URL/ Desktop launch documents win over navigation memory. The Vite default
      // is only a fallback when no preference exists; an empty preference keeps the start screen.
      const explicit = Boolean(path || desktop && !("start" in next));
      let activePath: string | null = null;
      let recovery: RecoveryRecord | undefined;
      if (explicit || !saved) {
        if (!("start" in next)) {
          add(next);
          activePath = next.path;
          recovery = records?.find(record => record.path === next.path);
        }
      } else if (records) {
        for (const remembered of saved.paths) {
          if (!current) return;
          // Even malformed/unsupported recovery records retain their existing review flow.
          if (records.some(record => record.path === remembered)) continue;
          try {
            const file = await requestDocument("GET", remembered, folders.rootOf(remembered));
            if (!current) return;
            if (!("start" in file) && !records.some(record => record.path === file.path)) add(file);
          } catch { /* Missing, refused and non-native documents are quietly left out. */ }
        }
        activePath = saved.activePath;
        recovery = records.find(record => saved.paths.includes(record.path));
      }
      if (!current) return;
      client.assertCurrent();
      setStart("start" in first ? first : { start: true, samples: first.samples, sampleProblem: first.sampleProblem });
      if ("start" in first) setAllowedRoots(first.allowedRoots);
      if (memory.explicitNavigation.current) return;
      setTabs(initialTabs);
      navigate({ type: "reset", tabs: initialTabs.map(tab => tab.id), active: openedTab(initialTabs, activePath ?? "")?.id ?? initialTabs[0]?.id ?? null });
      // With no clean tabs, the existing start-screen list already offers every record.
      // If clean tabs hide that list, surface the newest matching record in its usual dialog.
      if (recovery && (explicit || !saved || initialTabs.length > 0)) reviewRecovery(recovery);
    })().catch(cause => { if (current) setError(cause instanceof Error ? cause : String(cause)); }).finally(() => {
      if (current) { operationRef.current = false; setOperation(""); setTabsRestored(true); }
    });
    return () => { current = false; cancelReads(); };
  }, [folders.restored]);

}
