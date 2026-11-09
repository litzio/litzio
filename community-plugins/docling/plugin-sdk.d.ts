export declare const SDK_VERSION: string;
export declare const DOCUMENT_AUTHORING_LIMITS: Readonly<{ bytes: number; inputs: number; blocks: number; string: number; tableRows: number; tableColumns: number }>;
export declare function authorDocument(input: unknown, imageAssets?: Readonly<Record<string, string>>): Promise<{ source: string; documentRevision: string; documentHash: string; inputs: { key: string; targets: { path: number[]; documentRevision: string; documentHash: string }[] }[] }>;
export type PluginErrorKind = "auth" | "forbidden" | "not_found" | "unavailable" | "timeout" | "failed";
export declare class PluginOperationError extends Error { readonly kind: PluginErrorKind; constructor(kind: PluginErrorKind); }
export type PluginContext = { secrets?: Readonly<Record<string, string>>; settings: Readonly<Record<string, unknown>>; platform: string; env: Readonly<Record<string, string | undefined>>; isDirectory(path: string): boolean };
