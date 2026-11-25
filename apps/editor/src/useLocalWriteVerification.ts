import { useEffect, useRef, useState } from "react";
import type { LocalWriteStatus } from "../shared/document-protocol.ts";
import { useNotifications } from "./components/ui/notification-center.tsx";
import type { HostClient } from "./host-client.ts";
import { i18n } from "./i18n.ts";

/** Temporary #1986 receipt observer shared by the tab and the plugin document view. */
export function useLocalWriteVerification(client: HostClient | undefined, path: string, revision: string | undefined,
  onCorrection: (revision: string, corrected: string) => void) {
  const observe = useRef(onCorrection);
  observe.current = onCorrection;
  const [notice, setNotice] = useState<{ revision: string; corrected: boolean }>();
  useEffect(() => {
    if (!client || !revision) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const query = new URLSearchParams({ path, revision });
    const check = async () => {
      try {
        const response = await client.request(`/api/local-write-status?${query}`, { signal: controller.signal });
        if (!response.ok) return;
        const status: LocalWriteStatus = await response.json();
        if (controller.signal.aborted) return;
        if (status.state === "pending") timer = setTimeout(() => void check(), 500);
        if (status.state === "corrected" || status.state === "uncorrected") {
          setNotice({ revision, corrected: status.state === "corrected" });
          if (status.state === "corrected") observe.current(revision, status.revision);
        }
      } catch { /* Existing disk revision checks still protect the next Save. */ }
    };
    timer = setTimeout(() => void check(), 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [client, path, revision]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useNotifications(notice ? [{ id: `verify-local-write:${notice.revision}`, testId: "local-write-correction", severity: "warning",
    message: notice.corrected ? i18n.t("The Host checked your save and corrected the file.")
      : i18n.t("The Host could not confirm or correct the saved file.") }] : []);
}
