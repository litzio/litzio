import { useSyncExternalStore } from "react";
import type { z } from "zod";
import type { assistantSourceSchema } from "@litzio/core/views-v2";
import { DataTable } from "../components/DataTable.tsx";
import { Button } from "../components/ui/button.tsx";
import { Notice } from "../ui/primitives.tsx";
import { hostRegistry } from "../host-client.ts";
import { resolveViewDocument, type ViewRootBinding } from "./view-provenance.ts";
import { i18n } from "../i18n.ts";
import "./views.css";

/** Cards and all destinations inspect the same persisted source without recalculation. */
export function AssistantDataDetails({ source, provenanceRoots = [], onOpenDocument }: {
  source: z.infer<typeof assistantSourceSchema>;
  provenanceRoots?: readonly ViewRootBinding[];
  onOpenDocument?(path: string, hostId: string): void;
}) {
  useSyncExternalStore(hostRegistry.subscribe, hostRegistry.snapshot, hostRegistry.snapshot);
  return <section className="view-panel">
    <Notice tone="warning">{i18n.t("Assistant content may be inaccurate.")}</Notice>
    <time dateTime={source.generatedAt}>{source.generatedAt}</time>
    <details className="view-sources"><summary>{i18n.t("View sources", { count: source.provenance.length })}</summary>
      <ul>{source.provenance.map((entry, index) => {
        const target = resolveViewDocument(entry, provenanceRoots);
        const available = target && onOpenDocument && hostRegistry.list().some(host => host.hostId === target.hostId && hostRegistry.get(host.hostId).state === "connected");
        return <li key={index}>{entry.kind === "document" ? <>
          <Button size="sm" variant="ghost" className="max-w-full whitespace-normal text-left h-auto" disabled={!available}
            onClick={() => { if (available) onOpenDocument!(target!.path, target!.hostId); }}>{entry.label}</Button>
          {!available ? <span>{i18n.t("Unavailable")}</span> : null}
          <p>{entry.path} · {entry.revision}</p>
        </> : <span>{entry.label} · {entry.refId}</span>}</li>;
      })}</ul>
    </details>
    <details><summary>{i18n.t("View data")}</summary>
      {source.method ? <p>{source.method}</p> : null}
      <DataTable title={i18n.t("View data")} rows={source.rows} columns={Object.keys(source.rowSchema)} fields={source.rowSchema}
        labels={Object.fromEntries(Object.entries(source.rowSchema).map(([key, field]) => [key, field.label ?? key]))} />
    </details>
  </section>;
}
