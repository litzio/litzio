import { useEffect, useRef, useState } from "react";
import type { ReviewView } from "@litzio/core/views-v2";
import type { HostClient } from "../host-client.ts";
import { ReviewRenderer, type ReviewAdapter, type ReviewSnapshot } from "./ReviewRenderer.tsx";
import { Notice } from "../ui/primitives.tsx";
import { i18n } from "../i18n.ts";

export type ComparisonTarget = { root: string; document: string };
export function GeneratedComparison({ client, target, onOpen }: { client: HostClient; target: ComparisonTarget; onOpen(path: string): void }) {
  const open = useRef(onOpen); open.current = onOpen;
  const [adapter, setAdapter] = useState<ReviewAdapter>();
  useEffect(() => {
    const controller = new AbortController(); let first = true, path: string | undefined, pending: string | undefined;
    const request = async (body: object) => {
      const status = "action" in body && body.action === "generated-status";
      const response = await client.request("/api/reviews", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({...(!status ? target : {}),...body}), signal: controller.signal });
      const value = await response.json(); controller.signal.throwIfAborted();
      const definitive = value.receipt?.outcome === "success" || status && (value.receipt?.outcome === "failure" || value.state === "unknown");
      if (!response.ok || !definitive) throw new Error(value.error ?? "Comparison unavailable");
      return value;
    };
    const read = async (pageNo?: number): Promise<ReviewSnapshot> => {
      if (pending) { await request({action:"generated-status",requestId:pending}); pending = undefined; }
      const result = await request({action:"generated-compare",...(first ? {} : {pageNo})}); first = false;
      path = result.snapshot.documentPath;
      return {...result.snapshot, state: result.state, generatedBaseline: result.generatedBaseline, progress: result.progress};
    };
    setAdapter({ read, async verify(snapshot) {
      const current = await request({action:"generated-read"});
      if (current.state !== "generated" || JSON.stringify(current.baseline) !== JSON.stringify(snapshot.generatedBaseline)) throw new Error("Comparison baseline changed");
    }, async saveProgress(snapshot, pageNo, checked) {
      if (pending) throw new Error("Check the previous request before saving");
      const checkedPages = new Set(snapshot.progress?.checkedPages ?? []);
      if (checked !== undefined && snapshot.page) { if (checked) checkedPages.add(snapshot.page.pageNo); else checkedPages.delete(snapshot.page.pageNo); }
      pending = crypto.randomUUID();
      await request({action:"generated-progress",requestId:pending,baseline:snapshot.generatedBaseline,progress:{checkedPages:[...checkedPages].sort((a,b)=>a-b),lastPage:pageNo}});
      pending = undefined; return read(pageNo);
    }, async act() { throw new Error("Read-only comparison"); }, openDocument() { if (path) open.current(path); } });
    return () => controller.abort();
  }, [client,target.root,target.document]);
  const view: ReviewView = { kind:"litzio-view",schemaVersion:2,catalog:"litzio-v2",profile:"review",title:target.document,refresh:"manual",sources:{review:{plugin:"generated",review:"compare",bundleRef:"generated"}},layout:{component:"Panel",direction:"vertical",children:[{component:"SourceDocumentCompare",title:i18n.t("Source comparison"),source:"review"}]}};
  return adapter ? <ReviewRenderer view={view} adapter={adapter} /> : <Notice>{i18n.t("Loading data…")}</Notice>;
}
