import { useEffect, useState, useRef, useSyncExternalStore } from "react";
import type { CatalogView } from "@litzio/core/views-v2";
import { hostRegistry, getHostClient, hostLabel } from "../host-client.ts";
import { viewRequest, type ViewScreen, type ViewResult } from "./view-api.ts";
import { Views } from "./Views.tsx";
import { Button } from "../components/ui/button.tsx";
import { Notice } from "../ui/primitives.tsx";
import { i18n } from "../i18n.ts";
export function ViewWorkspace({
  id,
  hostId,
  root,
  owner,
  screen,
  view,
  onView,
  onHost,
  onGenerate,
  onOpenDocument,
  onOpenReview,
}: {
  id: string;
  hostId: string;
  root: string;
  owner: string;
  screen?: ViewScreen;
  view?: CatalogView;
  onView(view: CatalogView): void;
  onHost?(hostId: string): void;
  onGenerate(root: string, view?: CatalogView): void;
  onOpenReview?(view: CatalogView): void;
  onOpenDocument?(path: string, hostId: string): void;
}) {
  useSyncExternalStore(
    hostRegistry.subscribe,
    hostRegistry.snapshot,
    hostRegistry.snapshot,
  );
  const identity = useRef({ view, revision: 0 });
  if (identity.current.view !== view)
    identity.current = { view, revision: identity.current.revision + 1 };
  const currentView = useRef(view);
  currentView.current = view;
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => lifetime.current?.abort();
  }, [hostId]);
  const [opening, setOpening] = useState(false);
  const [chosenRoot, setChosenRoot] = useState(root);
  const [catalog, setCatalog] = useState<ViewResult>();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setCatalog(undefined);
    setFavorites([]);
    setProblem("");
    const refresh = () => {
      void Promise.all([
        viewRequest(
          getHostClient(hostId),
          { action: "catalog" },
          controller.signal,
        ),
        viewRequest(
          getHostClient(hostId),
          { action: "list", plugin: owner },
          controller.signal,
        ),
      ])
        .then(([c, f]) => {
          if (!controller.signal.aborted) {
            setCatalog(c);
            setFavorites(f.favourites ?? []);
            if (screen && !currentView.current) {
              const initial = c.views?.find(
                (v) =>
                  v.plugin === owner && screen.defaultViewIds.includes(v.id),
              );
              if (initial) onView(initial.definition);
            }
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setProblem(i18n.t("Unavailable"));
        });
    };
    refresh();
    window.addEventListener("view-favourites-changed", refresh);
    window.addEventListener("plugins-changed", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("view-favourites-changed", refresh);
      window.removeEventListener("plugins-changed", refresh);
    };
  }, [hostId, owner]);
  const active =
    hostRegistry.get(hostId).state === "connected" &&
    (!screen ||
      catalog?.screens?.some((s) => s.plugin === owner && s.id === screen.id));
  return (
    <div className="view-workspace" data-testid="view-workspace">
      <div className="view-controls">
        {onHost ? (
          <label>
            {i18n.t("Host")}
            <select
              className="form-select"
              value={hostId}
              onChange={(e) => onHost(e.target.value)}
            >
              {hostRegistry.list().map((h) => (
                <option value={h.hostId} key={h.hostId}>
                  {hostLabel(h.hostId)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          disabled={!active}
          onClick={() => onGenerate(chosenRoot, view)}
        >
          {i18n.t("Ask assistant")}
        </Button>
      </div>
      {!active ? <Notice>{i18n.t("Unavailable")}</Notice> : null}
      {problem ? <Notice tone="error">{problem}</Notice> : null}
      {screen ? (
        <section aria-label={i18n.t("Default views")}>
          <h3>{i18n.t("Default views")}</h3>
          {catalog?.views
            ?.filter(
              (v) => v.plugin === owner && screen.defaultViewIds.includes(v.id),
            )
            .map((v) => (
              <Button
                size="sm"
                variant="ghost"
                key={v.id}
                onClick={() => onView(v.definition)}
              >
                {v.title}
              </Button>
            ))}
        </section>
      ) : null}
      <section aria-label={i18n.t("Favorites")}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("view-favourites-changed", { detail: hostId }),
            )
          }
        >
          {i18n.t("Refresh favorites")}
        </Button>
        <label>
          {i18n.t("Opened folder")}
          <select
            className="form-select"
            aria-label={i18n.t("Statistics folder")}
            value={chosenRoot}
            onChange={(e) => setChosenRoot(e.target.value)}
          >
            <option value="">{i18n.t("Choose a folder")}</option>
            {root ? <option value={root}>{root}</option> : null}
          </select>
        </label>
        {favorites.map((name) => (
          <Button
            key={name}
            size="sm"
            variant="ghost"
            disabled={opening}
            onClick={() => {
              setOpening(true);
              const signal = lifetime.current!.signal;
              void viewRequest(
                getHostClient(hostId),
                { action: "open", plugin: owner, name },
                signal,
              )
                .then((v) => {
                  if (!signal.aborted && v.view) { if (v.view.profile === "review" && onOpenReview) onOpenReview(v.view); else onView(v.view); }
                })
                .catch(() => {
                  if (!signal.aborted) setProblem(i18n.t("Unavailable"));
                })
                .finally(() => {
                  if (!signal.aborted) setOpening(false);
                });
            }}
          >
            {name}
          </Button>
        ))}
      </section>
      {opening ? <Notice>{i18n.t("Loading data…")}</Notice> : null}
      <div hidden={opening}>
        {view &&
        (active ||
          (view.profile === "query" && view.refresh === "assistant")) ? (
          <Views
            key={`${hostId}:${identity.current.revision}`}
            tab={{ id, hostId, root: chosenRoot, view }}
            client={getHostClient(hostId)}
            roots={root ? [root] : []}
            onOpen={onView}
            onRoot={setChosenRoot}
            onOpenDocument={onOpenDocument}
          />
        ) : null}
      </div>
    </div>
  );
}
