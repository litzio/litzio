import { useEffect, useRef, useState } from "react";
import type { ReviewView } from "@litzio/core/views-v2";
import type { HostClient } from "../host-client.ts";
import { ReviewRenderer, type ReviewAdapter, type ReviewSnapshot } from "./ReviewRenderer.tsx";
import { Notice } from "../ui/primitives.tsx";
import { i18n } from "../i18n.ts";

export type ComparisonTarget = { root: string; document: string };
export function GeneratedComparison({ client, target, onOpen, onPending }: { client: HostClient; target: ComparisonTarget; onOpen(path: string): void; onPending?(pending: boolean): void }) {
  const open = useRef(onOpen); open.current = onOpen;
  const pendingChanged = useRef(onPending); pendingChanged.current = onPending;
  const pendingWrites = useRef(0);
  const [adapter, setAdapter] = useState<ReviewAdapter>();
  const [regenerationRequired, setRegenerationRequired] = useState(false);
  useEffect(() => {
    setRegenerationRequired(false);
    const controller = new AbortController(); let first = true, path: string | undefined, pending: string | undefined;
    let baseline: ReviewSnapshot["generatedBaseline"], progress: ReviewSnapshot["progress"], tail = Promise.resolve(), saving = 0, failed = false;
    let transport = Promise.resolve();
    const request = (body: object) => {
      if ("action" in body && body.action === "generated-progress") {
        // Wait for an admitted image/read, but release the read lane once the
        // progress request starts. Host permits reads during progress preparation.
        let result!: ReturnType<typeof send>;
        const started = transport.then(() => { result = send(body); });
        transport = started;
        return started.then(() => result);
      }
      const work = transport.then(() => send(body));
      transport = work.then(() => {}, () => {});
      return work;
    };
    const send = async (body: object) => {
      const status = "action" in body && body.action === "generated-status";
      const response = await client.request("/api/reviews", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({...(!status ? target : {}),...body}), signal: controller.signal });
      const value = await response.json(); controller.signal.throwIfAborted();
      if (!status) setRegenerationRequired(value.state === "regeneration-required");
      const definitive = value.receipt?.outcome === "success" || status && (value.receipt?.outcome === "failure" || value.state === "unknown");
      if (!response.ok || !definitive) throw new Error(value.error ?? "Comparison unavailable");
      return value;
    };
    const read = async (pageNo?: number): Promise<ReviewSnapshot> => {
      if (pending && !saving) { await request({action:"generated-status",requestId:pending}); pending = undefined; }
      const startedBaseline = baseline;
      const result = await request({action:"generated-compare",...(first ? {} : {pageNo})}); first = false;
      path = result.snapshot.documentPath;
      if (!saving && baseline !== startedBaseline && baseline?.sourceRevision !== result.generatedBaseline.sourceRevision) return read(pageNo);
      if (!saving) { baseline = result.generatedBaseline; progress = result.progress; failed = false; tail = Promise.resolve(); }
      return {...result.snapshot, state: result.state, generatedBaseline: result.generatedBaseline, progress: progress ?? result.progress};
    };
    setAdapter({ read, async loadPage(snapshot, pageNo) {
      const result = await request({action:"generated-compare",pageNo});
      if (result.state !== "ready" || result.snapshot.documentHash !== snapshot.documentHash) throw new Error("Comparison baseline changed");
      if (result.generatedBaseline.sourceRevision !== snapshot.generatedBaseline?.sourceRevision) {
        if (saving || baseline?.sourceRevision === result.generatedBaseline.sourceRevision) return undefined;
        throw new Error("Comparison baseline changed");
      }
      const geometry = (page: ReviewSnapshot["page"]) => page && {pageNo:page.pageNo,width:page.width,height:page.height,origin:page.origin,unit:page.unit,regions:page.regions};
      if (JSON.stringify(geometry(result.snapshot.page)) !== JSON.stringify(geometry(snapshot.pages?.find(page=>page.pageNo === pageNo)))
        || JSON.stringify(result.snapshot.mapping?.entries) !== JSON.stringify(snapshot.mapping?.entries)) throw new Error("Comparison material changed");
      return result.snapshot.imageUrl;
    }, async verify(snapshot) {
      const current = await request({action:"generated-read"});
      if (current.state !== "generated" || JSON.stringify(current.baseline) !== JSON.stringify(snapshot.generatedBaseline)) throw new Error("Comparison baseline changed");
    }, async saveProgress(snapshot, pageNo, checked) {
      if (failed) throw new Error("Read the files before saving again");
      baseline ??= snapshot.generatedBaseline;
      const checkedPages = new Set(progress?.checkedPages ?? snapshot.progress?.checkedPages ?? []);
      if (checked !== undefined) { if (checked) checkedPages.add(pageNo); else checkedPages.delete(pageNo); }
      progress = {checkedPages:[...checkedPages].sort((a,b)=>a-b),lastPage:pageNo};
      const next = progress; saving++;
      if (!pendingWrites.current++) pendingChanged.current?.(true);
      const work = tail.then(async () => {
        pending = crypto.randomUUID();
        const saved = await request({action:"generated-progress",requestId:pending,baseline,progress:next});
        baseline = saved.baseline; pending = undefined;
      });
      tail = work;
      try { await work; return {...snapshot,generatedBaseline:baseline,progress}; }
      catch (error) { failed = true; throw error; }
      finally { saving--; if (!--pendingWrites.current) pendingChanged.current?.(false); }
    }, async act() { throw new Error("Read-only comparison"); }, openDocument() { if (path) open.current(path); } });
    return () => controller.abort();
  }, [client,target.root,target.document]);
  const view: ReviewView = { kind:"litzio-view",schemaVersion:2,catalog:"litzio-v2",profile:"review",title:target.document,refresh:"manual",sources:{review:{plugin:"generated",review:"compare",bundleRef:"generated"}},layout:{component:"Panel",direction:"vertical",children:[{component:"SourceDocumentCompare",title:i18n.t("Source comparison"),source:"review"}]}};
  return adapter ? <ReviewRenderer view={view} adapter={adapter} unavailableMessage={regenerationRequired ? i18n.t("Regeneration required. Recreate the document from its source and reopen comparison.") : undefined} /> : <Notice>{i18n.t("Loading data…")}</Notice>;
}
