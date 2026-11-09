export declare const SDK_VERSION: string;
export type PluginErrorKind = "auth" | "forbidden" | "not_found" | "unavailable" | "timeout" | "failed";
export declare class PluginOperationError extends Error { readonly kind: PluginErrorKind; constructor(kind: PluginErrorKind); }
export type PluginContext = { secrets?: Readonly<Record<string, string>>; settings: Readonly<Record<string, unknown>>; platform: string; env: Readonly<Record<string, string | undefined>>; isDirectory(path: string): boolean };
