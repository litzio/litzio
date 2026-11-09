import type { CatalogView } from "@litzio/core/views-v2";
import type { HostClient } from "../host-client.ts";
export type ViewTab = { id: string; hostId: string; root: string; comparison?: { root: string; document: string }; pdf?: string; view?: CatalogView; jobs?: boolean; label?: string; screen?: import("./view-api.ts").ViewScreen };
export type ViewsProps = { unavailable?: boolean; tab: ViewTab; client: HostClient; onOpenDocument?(path: string, hostId: string): void };
