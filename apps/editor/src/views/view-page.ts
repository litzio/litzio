import type { CatalogView } from "@litzio/core/views-v2";
import type { HostClient } from "../host-client.ts";
import type { ViewRootBinding } from "./view-provenance.ts";

export type ViewTab = { id: string; hostId: string; root: string; pdf?: string; view?: CatalogView; basic?: boolean; jobs?: boolean; label?: string; screen?: import("./view-api.ts").ViewScreen };
export type ViewsProps = { provenanceRoots?: readonly ViewRootBinding[]; unavailable?: boolean; onGenerate?(view?: CatalogView):void; tab: ViewTab; client: HostClient; roots: string[]; onOpen(view: CatalogView, root: string, hostId: string, label?: string): void; onRoot(root: string): void; onOpenDocument?(path: string, hostId: string): void };
