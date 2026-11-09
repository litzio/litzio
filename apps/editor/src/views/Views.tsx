import { useRef } from "react";
import { QueryViewPage } from "./QueryViewPage.tsx";
import { ReviewViewPage } from "../review/ReviewViewPage.tsx";
import type { ViewsProps } from "./view-page.ts";
export type { ViewTab } from "./view-page.ts";

export function Views(props: ViewsProps) {
  const identity = useRef({view:props.tab.view,hostId:props.tab.hostId,revision:0});
  if(identity.current.view !== props.tab.view || identity.current.hostId !== props.tab.hostId) identity.current={view:props.tab.view,hostId:props.tab.hostId,revision:identity.current.revision+1};
  return <ViewInstance key={identity.current.revision} {...props} />;
}
function ViewInstance(props: ViewsProps) {
  if (!props.tab.view) return null;
  return props.tab.view?.profile === "review" ? <ReviewViewPage key={`${props.tab.hostId}:${props.tab.root}:${props.tab.view.sources.review.plugin}:${props.tab.view.sources.review.review}:${props.tab.view.sources.review.bundleRef}`} {...props} view={props.tab.view} /> : <QueryViewPage {...props} tab={{ ...props.tab, view: props.tab.view }} />;
}
