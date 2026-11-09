import { useEffect, useRef, useState } from "react";
import type { ReviewView } from "@litzio/core/views-v2";
import type { HostClient } from "../host-client.ts";
import { i18n } from "../i18n.ts";
import { Notice } from "../ui/primitives.tsx";
import { ReviewRenderer, type ReviewAdapter } from "./ReviewRenderer.tsx";
import { createReviewAdapter, type ReviewObservation } from "../views/review-api.ts";
import "../views/views.css";

export function ReviewViewPage({ tab, view, client, onOpenDocument }: { tab: { hostId: string; root: string }; view: ReviewView; client: HostClient; onOpenDocument?(path: string, hostId: string): void }) {
  const [adapter, setAdapter] = useState<ReviewAdapter>();
  const observation = useRef<ReviewObservation>({});
  const openDocument = useRef(onOpenDocument);
  openDocument.current = onOpenDocument;
  useEffect(() => {
    const controller = new AbortController();
    setAdapter(createReviewAdapter(client, view, tab.root, controller.signal, path => openDocument.current?.(path, tab.hostId), observation.current));
    return () => controller.abort();
  }, [client, tab.root, tab.hostId, view]);
  return <div className="views-page" data-testid="review-view">{adapter ? <ReviewRenderer key={`${tab.hostId}:${tab.root}:${view.sources.review.bundleRef}`} view={view} adapter={adapter} /> : <Notice>{i18n.t("Loading data…")}</Notice>}</div>;
}
