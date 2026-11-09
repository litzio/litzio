import { useEffect, useRef, useState } from "react";
import type { CatalogView } from "@litzio/core/views-v2";
import { i18n } from "../i18n.ts";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog.tsx";
import { Notice } from "../ui/primitives.tsx";
import { AssistantDataDetails } from "./AssistantDataDetails.tsx";
import { ViewRenderer } from "./ViewRenderer.tsx";
import { viewRequest } from "./view-api.ts";
import type { ViewsProps } from "./view-page.ts";

export function AssistantView({
  tab,
  view,
  client,
  onOpenDocument,
  provenanceRoots = [],
}: ViewsProps & { view: Extract<CatalogView, { refresh: "assistant" }> }) {
  const source = view.sources.stats;
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(view.title),
    [problem, setProblem] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current?.abort();
  }, [client]);
  return (
    <div className="views-page" data-testid="generated-view">
      <h2>{tab.label ?? view.title}</h2>
      <div className="view-controls">
      <Button size="sm" variant="secondary" onClick={() => setSaving(true)}>
        {i18n.t("Add to favorites")}
      </Button>
      </div>
      <p>
        {i18n.t("Assistant prepared data")} ·{" "}
        {source.provenance
          .slice(0, 3)
          .map((p) => p.label)
          .join(", ")}
        {source.provenance.length > 3 ? "…" : ""}
      </p>
      <ViewRenderer
        view={view}
        rows={source.rows}
        fields={Object.fromEntries(
          Object.entries(source.rowSchema).map(([k, v]) => [k, v.label]),
        )}
      />
      <AssistantDataDetails source={source} provenanceRoots={provenanceRoots} onOpenDocument={onOpenDocument} />
      <Dialog open={saving} onOpenChange={setSaving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{i18n.t("Add to favorites")}</DialogTitle>
            <DialogDescription>
              {i18n.t("Assistant prepared data")}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void viewRequest(
                client,
                { action: "save", plugin: view.owner, name, view },
                controller.current?.signal,
              )
                .then(() => {
                  setSaving(false);
                  window.dispatchEvent(
                    new CustomEvent("view-favourites-changed", {
                      detail: tab.hostId,
                    }),
                  );
                })
                .catch(() => setProblem(i18n.t("Unavailable")));
            }}
          >
            <label>
              {i18n.t("New favorite name")}
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            {problem ? <Notice tone="error">{problem}</Notice> : null}
            <Button type="submit" disabled={!name.trim()}>
              {i18n.t("Add favorite")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
