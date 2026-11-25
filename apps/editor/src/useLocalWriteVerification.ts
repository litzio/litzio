import { useEffect, useRef, useState } from "react";
import type { LocalWriteStatus } from "../shared/document-protocol.ts";
import { useNotifications } from "./components/ui/notification-center.tsx";
import type { HostClient } from "./host-client.ts";
import { i18n } from "./i18n.ts";

export async function readLocalWriteStatus(client: HostClient, path: string, revision: string, signal?: AbortSignal): Promise<LocalWriteStatus | undefined> {
  const query = new URLSearchParams({ path, revision });
  const response = await client.request(`/api/local-write-status?${query}`, { signal });
  if (response.ok) return response.json();
}

/** Temporary #1986 receipt observer shared by the tab and the plugin document view. */
export function useLocalWriteVerification(client: HostClient | undefined, path: string, revision: string | undefined,
  paused: boolean, onSettled: (revision: string, status: Exclude<LocalWriteStatus, { state: "pending" }>) => void) {
  const observe = useRef(onSettled);
  observe.current = onSettled;
  const [notice, setNotice] = useState<{ revision: string; corrected: boolean }>();
  useEffect(() => {
    if (!client || !revision || paused) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const status = await readLocalWriteStatus(client, path, revision, controller.signal);
        if (!status || controller.signal.aborted) return;
        if (status.state === "pending") { timer = setTimeout(() => void check(), 500); return; }
        if (status.state === "corrected" || status.state === "uncorrected") {
          setNotice({ revision, corrected: status.state === "corrected" });
        }
        observe.current(revision, status);
      } catch { /* Existing disk revision checks still protect the next Save. */ }
    };
    timer = setTimeout(() => void check(), 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [client, path, revision, paused]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useNotifications(notice ? [{ id: `verify-local-write:${notice.revision}`, testId: "local-write-correction", severity: "warning",
    message: notice.corrected ? i18n.t("The Host checked your save and corrected the file.")
      : i18n.t("The Host could not confirm or correct the saved file.") }] : []);
}
