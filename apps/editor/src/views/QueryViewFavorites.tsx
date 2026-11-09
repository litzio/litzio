import { useEffect, useState, type RefObject } from "react";
import type { OperationQueryView } from "@litzio/core/views-v2";
import type { HostClient } from "../host-client.ts";
import { i18n } from "../i18n.ts";
import { Button } from "../components/ui/button.tsx";
import { Notice, FieldError } from "../ui/primitives.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
import { sourceFailure } from "./source-state.ts";
import type { ViewResult } from "./view-api.ts";
import type { ViewTab, ViewsProps } from "./view-page.ts";
import { Input } from "../components/ui/input.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog.tsx";
import { RotateCw, Star } from "lucide-react";

/** Favorite UI is separate from query execution and can be removed independently. */
export function useQueryViewFavorites({ tab, view, owner, request, busy, setBusy, lifetime, root, onOpen, setProblem, client }: {
  tab: Omit<ViewTab, "view">; view: OperationQueryView; owner?: string;
  request(input: unknown): Promise<ViewResult>; busy: boolean; setBusy(value: boolean): void;
  lifetime: RefObject<AbortController | null>; root: string; onOpen: ViewsProps["onOpen"];
  setProblem(value: string): void; client: HostClient;
}) {
  const base = view;
  const [favourites, setFavourites] = useState<{ plugin: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false), [name, setName] = useState("");
  const [saveProblem, setSaveProblem] = useState("");
  const list = async () => {
    const lists = [{ plugin: base.owner, value: await request({ action: "list", plugin: base.owner }) }];
    return lists.flatMap(({ plugin, value }) => (value.favourites ?? []).map(name => ({ plugin, name })));
  };
  useEffect(() => {
    if (!tab.basic) return;
    let alive = true;
    const refresh = () => { void list().then(value => { if (alive) setFavourites(value); }).catch(error => { if (alive && !lifetime.current?.signal.aborted) setProblem(sourceFailure(error).message); }); };
    const changed = (event: Event) => { if ((event as CustomEvent).detail === tab.hostId) refresh(); };
    refresh(); window.addEventListener("view-favourites-changed", changed);
    return () => { alive = false; window.removeEventListener("view-favourites-changed", changed); };
  }, [client, tab.basic, tab.hostId]);
  const run = async (action: () => Promise<void>, save = false) => { if (busy) return; setBusy(true); (save ? setSaveProblem : setProblem)(""); try { await action(); } catch (error) { if (!lifetime.current?.signal.aborted) (save ? setSaveProblem : setProblem)(sourceFailure(error).message); } finally { if (!lifetime.current?.signal.aborted) setBusy(false); } };
  return {
    actions: (!tab.basic ? <Button variant="secondary" size="sm" disabled={busy || !owner} onClick={() => { setName(view.title); setSaving(true); setSaveProblem(""); }}><Star aria-hidden="true" />{i18n.t("Add to favorites", { defaultValue: "Add to favorites" })}</Button> : <p>{i18n.t("Ask the assistant to generate a view. The basic table stays here.")}</p>),
    list: (tab.basic ? <section className="view-favorites" aria-label={i18n.t("Favorites")}><div className="view-favorites-header"><h3>{i18n.t("Favorites")}</h3><Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={i18n.t("Refresh favorites")} disabled={busy} />} onClick={() => void run(async () => setFavourites(await list()))}><RotateCw aria-hidden="true" /></TooltipTrigger><TooltipContent>{i18n.t("Refresh favorites")}</TooltipContent></Tooltip></div>{favourites.length ? <ul>{favourites.map(({ plugin, name }) => <li key={`${plugin}:${name}`}><Button variant="ghost" size="sm" title={name} disabled={busy} onClick={() => void run(async () => { const value = await request({ action: "open", plugin, name }); onOpen(value.view!, root, tab.hostId, value.name); })}><Star aria-hidden="true" className="view-favorite-icon" /><span className="view-favorite-name">{name}</span></Button></li>)}</ul> : <Notice>{i18n.t("No favorites yet.")}</Notice>}</section> : null),
    dialog: (<Dialog open={saving} onOpenChange={open => { if (!busy) setSaving(open); }}><DialogContent><DialogHeader><DialogTitle>{i18n.t("Add to favorites", { defaultValue: "Add to favorites" })}</DialogTitle><DialogDescription>{i18n.t("Save the current inputs, including conditions not yet queried. Reopening restores inputs without querying.", { defaultValue: "Save the current inputs, including conditions not yet queried. Reopening restores inputs without querying." })}</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); void run(async () => { await request({ action: "save", plugin: owner, name, view }); window.dispatchEvent(new CustomEvent("view-favourites-changed", { detail: tab.hostId })); setSaving(false); }, true); }}><label>{i18n.t("New favorite name")}<Input autoFocus aria-label={i18n.t("New favorite name")} aria-invalid={!!saveProblem} aria-describedby={saveProblem ? `view-save-error-${tab.id}` : undefined} value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label><FieldError id={`view-save-error-${tab.id}`}>{saveProblem}</FieldError><div className="view-controls"><Button type="submit" disabled={busy || !owner || !name.trim()}>{i18n.t("Add favorite")}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setSaving(false)}>{i18n.t("Cancel")}</Button></div></form></DialogContent></Dialog>),
  };
}
