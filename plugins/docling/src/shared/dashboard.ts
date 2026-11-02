import type { RequestRecord } from "@litzio/plugin-api/worker";
export type Features = { conversion: boolean; comparison: boolean; review: boolean };
export type ConversionResult = { id: string; folder: string; path: string; convertedAt: number; name?: string; pages?: number; stale?: boolean; problem?: string; missing?: boolean };
export type DashboardSnapshot = { agent?: import("@litzio/plugin-api/ai").AiAgentStatus | null; server: string; features: Features; requests: RequestRecord[]; results: ConversionResult[] };
