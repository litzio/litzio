import { PluginJobPanel } from "../PluginJobPanel.tsx";
import type { ViewRootBinding } from "./view-provenance.ts";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CatalogView } from "@litzio/core/views-v2";
import { hostRegistry, getHostClient, hostLabel } from "../host-client.ts";
import { viewRequest, type ViewScreen, type ViewResult } from "./view-api.ts";
import { Views } from "./Views.tsx";
import { Button } from "../components/ui/button.tsx";
import { Notice } from "../ui/primitives.tsx";
import { i18n } from "../i18n.ts";

export function ViewWorkspace({
  roots = [],
  jobsActive = true,
  id,
  hostId,
  root,
  owner,
  screen,
  view,
  onHost,
  onGenerate,
  onSelect,
  onOpenDocument,
  onOpenReview,
  provenanceRoots,
  client = getHostClient(hostId),
}: {
  roots?: string[];
  jobsActive?: boolean;
  provenanceRoots?: readonly ViewRootBinding[];
  client?: import("../host-client.ts").HostClient;
  id: string;
  hostId: string;
  root: string;
  owner: string;
  screen?: ViewScreen;
  view?: CatalogView;
  onHost?(hostId: string): void;
  onSelect?(): void;
  onGenerate(root: string, view?: CatalogView): void;
  onOpenReview?(view: CatalogView): void;
  onOpenDocument?(path: string, hostId: string): void;
}) {
  useSyncExternalStore(
    hostRegistry.subscribe,
    hostRegistry.snapshot,
    hostRegistry.snapshot,
  );
  const connected = hostRegistry.get(hostId).state === "connected";
  const [pages, setPages] = useState<Record<string, CatalogView>>(() => {
    const initial: Record<string, CatalogView> = {};
    if (view) initial.generated = view;
    return initial;
  });
  const [selected, setSelected] = useState(view ? "generated" : "");
  const current = useRef(selected);
  current.current = selected;
  const [chosenRoot, setChosenRoot] = useState(root);
  const [catalog, setCatalog] = useState<ViewResult>();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [opening, setOpening] = useState(false),
    [problem, setProblem] = useState("");
  const lifetime = useRef<AbortController | null>(null),
    selection = useRef(0),
    openRequest = useRef<AbortController | null>(null);
  const cancelOpen = () => {
    selection.current++;
    openRequest.current?.abort();
    setOpening(false);
  };
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      controller.abort();
      openRequest.current?.abort();
    };
  }, [hostId]);
  useEffect(() => {
    if (!connected) cancelOpen();
  }, [connected]);
  useEffect(() => {
    if (!view) return;
    cancelOpen();
    setPages((previous) => ({ ...previous, generated: view }));
    setSelected("generated");
  }, [view]);
  const select = (key: string, definition: CatalogView) => {
    cancelOpen();
    onSelect?.();
    if (definition.profile === "review" && onOpenReview) {
      onOpenReview(definition);
      return;
    }
    setPages((previous) =>
      previous[key] === definition
        ? previous
        : { ...previous, [key]: definition },
    );
    setSelected(key);
  };
  useEffect(() => {
    const controller = new AbortController();
    if (!connected) return () => controller.abort();
    const refresh = () => {
      void Promise.all([
        viewRequest(client, { action: "catalog" }, controller.signal),
        viewRequest(
          client,
          { action: "list", plugin: owner },
          controller.signal,
        ),
      ])
        .then(([c, f]) => {
          if (controller.signal.aborted) return;
          setCatalog(c);
          setFavorites(f.favourites ?? []);
          setProblem("");
          if (screen && !current.current) {
            const initial = c.views?.find(
              (v) => v.plugin === owner && screen.defaultViewIds.includes(v.id),
            );
            if (initial) {
              const key = `default:${initial.id}`;
              current.current = key;
              setPages((previous) => ({
                ...previous,
                [key]: initial.definition,
              }));
              setSelected(key);
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
  }, [hostId, owner, connected]);
  const changeRoot = (root: string) => {
    cancelOpen();
    onSelect?.();
    setChosenRoot(root);
  };
  const active =
    connected &&
    (!screen ||
      catalog?.screens?.some((s) => s.plugin === owner && s.id === screen.id));
  const openFavorite = (name: string) => {
    cancelOpen();
    onSelect?.();
    const version = selection.current;
    setOpening(true);
    setProblem("");
    const controller = new AbortController();
    openRequest.current = controller;
    const signal = AbortSignal.any([
      lifetime.current!.signal,
      controller.signal,
    ]);
    void viewRequest(client, { action: "open", plugin: owner, name }, signal)
      .then((value) => {
        if (signal.aborted || selection.current !== version || !value.view)
          return;
        if (value.view.profile === "review" && onOpenReview)
          onOpenReview(value.view);
        else {
          setPages((previous) => ({
            ...previous,
            [`favorite:${name}`]: value.view!,
          }));
          setSelected(`favorite:${name}`);
        }
      })
      .catch(() => {
        if (!signal.aborted && version === selection.current)
          setProblem(i18n.t("Unavailable"));
      })
      .finally(() => {
        if (!signal.aborted && version === selection.current) setOpening(false);
      });
  };
  const defaults = catalog?.views?.filter(
    v => v.plugin === owner && screen?.defaultViewIds.includes(v.id),
  ) ?? [];
  const showDefaults = defaults.length > 1 ||
    defaults.length === 1 && !!selected && (opening || selected !== `default:${defaults[0].id}`);
  const showHost = !!onHost && hostRegistry.list().length > 1;
  const showGenerated = !!view && selected !== "generated";
  return (
    <div className="view-workspace" data-testid="view-workspace">
      {showHost || showGenerated ? <div className="view-controls">
        {showHost && onHost ? (
          <label>
            {i18n.t("Host")}
            <select
              className="form-select settings-select"
              value={hostId}
              onChange={(e) => {
                cancelOpen();
                onSelect?.();
                onHost(e.target.value);
              }}
            >
              {hostRegistry.list().map((h) => (
                <option value={h.hostId} key={h.hostId}>
                  {hostLabel(h.hostId)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {showGenerated && view ? (
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={selected === "generated"}
            onClick={() => select("generated", view)}
          >
            {i18n.t("Current generated view")}
          </Button>
        ) : null}
      </div> : null}
      {!active ? <Notice>{i18n.t("Unavailable")}</Notice> : null}
      {problem ? <Notice tone="error">{problem}</Notice> : null}
      {screen && catalog?.screens?.find(s => s.plugin === owner && s.id === screen.id)?.jobs?.length ? <PluginJobPanel key={`${hostId}:${owner}:${screen.id}`} client={client} plugin={owner} jobIds={catalog.screens.find(s => s.plugin === owner && s.id === screen.id)!.jobs!} roots={roots} active={!!active && jobsActive} onOpen={async path => { onOpenDocument?.(path, hostId); }} /> : null}
      {showDefaults ? (
        <section aria-label={i18n.t("Default views")}>
          <h3>{i18n.t("Default views")}</h3>
          {defaults.map((v) => (
            <Button
              key={v.id}
              size="sm"
              variant="ghost"
              disabled={!active}
              aria-pressed={selected === `default:${v.id}`}
              onClick={() =>
                select(
                  `default:${v.id}`,
                  pages[`default:${v.id}`] ?? v.definition,
                )
              }
            >
              {v.title}
            </Button>
          ))}
        </section>
      ) : null}
      <details
        className="view-workspace-favorites"
        role="region"
        aria-label={i18n.t("Favorites")}
      >
        <summary>{i18n.t("Favorites")}</summary>
        <Button
          size="sm"
          variant="ghost"
          disabled={!connected}
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("view-favourites-changed", { detail: hostId }),
            )
          }
        >
          {i18n.t("Refresh favorites")}
        </Button>
        {favorites.map((name) => (
          <Button
            key={name}
            size="sm"
            variant="ghost"
            disabled={!connected}
            onClick={() => openFavorite(name)}
          >
            {name}
          </Button>
        ))}
      </details>
      {opening ? <Notice>{i18n.t("Loading data…")}</Notice> : null}
      {Object.entries(pages).map(([key, definition]) => (
        <div
          key={key}
          hidden={selected !== key || opening}
          inert={selected !== key || opening}
        >
          <Views
            tab={{ id, hostId, root: chosenRoot, view: definition }}
            client={client}
            roots={root ? [root] : []}
            onOpen={(view) => select("opened", view)}
            onGenerate={(definition) => onGenerate(chosenRoot, definition)}
            onRoot={changeRoot}
            provenanceRoots={provenanceRoots}
            onOpenDocument={onOpenDocument}
            unavailable={!active}
          />
        </div>
      ))}
    </div>
  );
}
