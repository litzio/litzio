import type { TemplateMetadata } from "@litzio/core";

export type TemplateLanguage = "ko" | "en";
export type TemplateSummary = TemplateMetadata & { id: string; kind: "builtin" | "user" };
export type TemplateContent = TemplateSummary & { source: string };
export type TemplateList = { directory: string; templates: TemplateSummary[]; problems: { file: string; error: string }[] };
export type SaveTemplateRequest = { name: string; description?: string; from: string };
