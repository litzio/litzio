import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScreenPickedPath, ScreenPickPathInput } from "@litzio/plugin-sdk";
import type { FolderBrowseResponse, FolderPlace } from "../../shared/document-protocol.ts";
import type { HostClient } from "../host-client.ts";
import { HostClientContext } from "../host-context.tsx";
import { FolderDialog } from "../shell/FolderDialog.tsx";
import { splitDocumentPath } from "../shell/document-path.ts";
import { i18n } from "../i18n.ts";
import { isScreenPath } from "./screen-path.ts";

type Choice = { input: ScreenPickPathInput; roots: string[]; controller: AbortController;
  isCurrent(): boolean; finish(value: ScreenPickedPath | null, error?: unknown): void };

/** A pending dialog belongs to this screen, not to the window's Open folder action. */
export function useScreenPathPicker(client: HostClient, roots: string[], lifetime: React.RefObject<AbortController | null>) {
  const [choice, setChoice] = useState<Choice>();
  const pending = useRef<Choice | undefined>(undefined);
  const rootsKey = JSON.stringify(roots);
  const latestRoots = useRef(rootsKey); latestRoots.current = rootsKey;
  useEffect(() => () => pending.current?.finish(null, new DOMException("Screen folders changed or screen closed.", "AbortError")), [rootsKey]);
  const pickPath = useCallback(async (input: ScreenPickPathInput): Promise<ScreenPickedPath | null> => {
    const signal = lifetime.current?.signal;
    signal?.throwIfAborted(); client.assertCurrent();
    if (latestRoots.current !== rootsKey) throw new DOMException("Screen folders changed.", "AbortError");
    if (!["pdf", "folder", "document"].includes(input.kind)) throw new Error("Choose pdf, folder or document.");
    if (pending.current) throw new Error(i18n.t("Wait for the current operation to finish."));
    const initialPath = input.initialPath ?? roots[0];
    if (!initialPath || !isScreenPath(initialPath, roots, true)) throw new Error(i18n.t("Choose a path inside this screen's opened folders."));
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const abort = () => next.finish(null, new DOMException("Screen closed or reloaded.", "AbortError"));
      const next: Choice = { input: { ...input, initialPath }, roots: [...roots], controller, isCurrent: () => latestRoots.current === rootsKey,
        finish(value, error) {
          if (pending.current !== next) return;
          pending.current = undefined; controller.abort(); signal?.removeEventListener("abort", abort); setChoice(undefined);
          if (error) reject(error); else resolve(value);
        } };
      pending.current = next; signal?.addEventListener("abort", abort, { once: true }); setChoice(next);
    });
  }, [client, rootsKey, lifetime]);
  return { pickPath, dialog: choice ? <ScreenPathDialog choice={choice} client={client} /> : null };
}

function ScreenPathDialog({ choice, client }: { choice: Choice; client: HostClient }) {
  const { input, roots, controller } = choice;
  const assertPath = (path: string) => {
    controller.signal.throwIfAborted(); client.assertCurrent();
    if (!choice.isCurrent()) throw new DOMException("Screen folders changed.", "AbortError");
    if (!isScreenPath(path, roots, true)) throw new Error(i18n.t("Choose a path inside this screen's opened folders."));
  };
  const browse = useMemo(() => async (path: string): Promise<FolderBrowseResponse> => {
    try {
      assertPath(path);
      const response = await client.request(`/api/folder-browse?${new URLSearchParams({ path, ...(input.kind === "pdf" ? { files: "pdf" } : {}) })}`, { signal: controller.signal });
      const reply = await response.json();
      if (!response.ok || !Array.isArray(reply.entries) || !Array.isArray(reply.crumbs)) throw new Error(reply.error ?? `HTTP ${response.status}`);
      assertPath(reply.path);
      return { ...reply, crumbs: reply.crumbs.filter((crumb: { path: string }) => isScreenPath(crumb.path, roots, true)),
        entries: reply.entries.filter((entry: { path: string }) => isScreenPath(entry.path, roots)) };
    } catch (error) { choice.finish(null, error); throw error; }
  }, [choice, client]);
  const places = useCallback(async (): Promise<FolderPlace[]> => roots.map(path => ({ kind: "root", name: splitDocumentPath(path).name || path, path })), [choice]);
  const select = async (path: string) => {
    try {
      assertPath(path);
      const listing = await browse(input.kind === "folder" ? path : splitDocumentPath(path).directory);
      assertPath(path);
      const entry = listing.entries.find(entry => entry.path === path);
      if (input.kind !== "folder" && (!entry || entry.kind === "folder" || !(input.kind === "pdf" ? /\.pdf$/i : /\.md$/i).test(path))) throw new Error(i18n.t("Unavailable"));
      choice.finish({ path: input.kind === "folder" ? listing.path : entry!.path, kind: input.kind });
    } catch (error) { choice.finish(null, error); }
    return "";
  };
  return <HostClientContext.Provider value={client}><FolderDialog open selectOnly choose={input.kind} initialPath={input.initialPath!}
    title={i18n.t(input.kind === "folder" ? "Choose folder" : input.kind === "pdf" ? "Choose PDF" : "Choose document")}
    description={i18n.t("Choose inside this screen's opened folders. This does not open another folder.")}
    showSidebarHint={false} recent={[]} allowedRoots={roots} browse={browse} places={places}
    onOpen={select} onClose={() => choice.finish(null)} /></HostClientContext.Provider>;
}
