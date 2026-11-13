/** The stable browser suite, shared by the runner and its coverage/selection checks.
 * Order feeds eight round-robin shards, balanced by descending measured duration
 * and least-loaded shard from CI run 43428753339 (94 scenarios, 2026-11-13).
 */
export const STABLE_SCENARIOS = [
  "document-tabs",
  "folder-memory",
  "assistant",
  "recovery",
  "command-center",
  "figure-authoring",
  "table-authoring",
  "caption-selection",
  "image-assets",
  "equation-save-during-edit",
  "mermaid-authoring",
  "property-drafts",
  "desktop-updates",
  "folder-navigation",
  "cross-reference",
  "continuous-editing",
  "save-session",
  "citation-authoring",
  "pending-figure",
  "visual-states",
  "layout-rules",
  "quiet-document",
  "file-actions",
  "table-caption",
  "footnotes",
  "editor-shell",
  "block-move",
  "reference-save-reload",
  "read-view",
  "ui-language",
  "open-files",
  "inline-document-settings",
  "bibliography-connection",
  "short-field-errors",
  "brand-config",
  "figure-draft-race",
  "label-authoring",
  "external-html-paste",
  "notification-center",
  "editor-groups",
  "template-gallery",
  "external-change",
  "recovery-storage",
  "equation-insertion",
  "local-host",
  "assistant-result",
  "inline-math-authoring",
  "source-view",
  "new-document",
  "pre-save-diff",
  "bibliography",
  "document-scroll",
  "selection-toolbar",
  "text-mode",
  "atom-boundaries",
  "table-cell-editing",
  "panel-lists",
  "file-preview",
  "writeability-preflight",
  "image-link-preview",
  "focus-caret",
  "vite-plugins",
  "link-authoring",
  "color-mode",
  "quote-save-reload",
  "admonition-authoring",
  "outline",
  "structural-block-authoring",
  "code-highlighting",
  "inline-math-split",
  "save-error",
  "basic-blocks",
  "assistant-question",
  "list-format",
  "citations",
  "section-reference",
  "heading-levels",
  "recovery-structure",
  "equation-node-selection-typing",
  "markdown-input",
  "source-view-pending",
  "empty-elements",
  "ui-gallery",
  "reference-preview",
  "draft-notice-layout",
  "app-reset",
  "list-authoring",
  "document-title",
  "numbering-mode",
  "document-session",
  "provider-session-log",
  "ui-prose-wrap",
  "reveal-folder",
  "save-during-edit",
];

/** These scenarios inspect notification content, actions, history or stacking.
 * All others assume the floating center is absent (#1003 owner decision).
 */
export const NOTIFICATION_SCENARIOS = [
  "desktop-updates",
  "reveal-folder",
  "color-mode",
  "image-assets",
  "pending-figure",
  "writeability-preflight",
  "notification-center",
  "assistant",
  "numbering-mode",
  "continuous-editing",
  "cross-reference",
  "document-tabs",
  "editor-shell",
  "equation-node-selection-typing",
  "external-change",
  "external-html-paste",
  "file-actions",
  "folder-navigation",
  "footnotes",
  "mermaid-authoring",
  "open-files",
  "read-view",
  "reference-save-reload",
  "save-error",
  "save-session",
  "recovery",
  "source-view-pending",
  "structural-block-authoring",
  "table-authoring",
  "text-mode",
  "ui-language",
];

/** Production HTTP has a different startup and filesystem policy; run it against its own Host. */
export const HTTP_SCENARIOS = ["plugin-screen-code","http-host", "http-plugins"];

/** Select before starting a server probe or browser; an invalid/empty shard must fail. */
export function selectBrowserScenarios(args: readonly string[]): {
  scenarios: string[];
  screenshots: boolean;
  shard?: string;
} {
  const screenshots = args.includes("--screenshots");
  const shards = args.filter(arg => arg.startsWith("--shard"));
  const requested = args.filter(arg => arg !== "--screenshots" && !arg.startsWith("--shard"));
  if (requested.some(name => HTTP_SCENARIOS.includes(name)) && requested.some(name => !HTTP_SCENARIOS.includes(name))) {
    throw new Error("Run HTTP Host scenarios separately from Vite scenarios.");
  }
  if (shards.length > 1) throw new Error("Specify --shard only once.");
  if (shards.length) {
    const match = /^--shard=([1-9]\d*)\/([1-9]\d*)$/.exec(shards[0]!);
    if (!match) throw new Error("Use --shard=<index>/<count> with positive integers.");
    const index = Number(match[1]);
    const count = Number(match[2]);
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index > count || count > STABLE_SCENARIOS.length) {
      throw new Error("Shard index must be within its count, and every shard must contain scenarios.");
    }
    if (requested.length || screenshots) throw new Error("Use --shard with the full stable suite, without names or --screenshots.");
    return {
      scenarios: STABLE_SCENARIOS.filter((_, position) => position % count === index - 1),
      screenshots: false,
      shard: `${index}/${count}`,
    };
  }
  if (screenshots && (requested.length !== 1 || !["local-host", "vite-plugins", "provider-session-log", "save-session", "numbering-mode", "document-scroll", "heading-levels", "brand-config", "assistant", "assistant-question", "assistant-result", "read-view", "text-mode", "draft-notice-layout", "color-mode", "selection-toolbar", "ui-prose-wrap", "short-field-errors", "notification-center", "reference-preview", "image-link-preview", "document-title", "list-format", "link-authoring", "panel-lists", "pre-save-diff", "external-change", "reveal-folder", "save-error", "mermaid-authoring", "image-assets", "inline-math-authoring", "empty-elements", "inline-document-settings", "file-actions", "table-caption", "table-authoring", "figure-authoring", "source-view", "cross-reference", "command-center", "file-preview", "ui-language", "quiet-document", "folder-navigation", "desktop-updates", "open-files", "document-tabs", "editor-groups", "recovery", "recovery-structure", "footnotes", "citations", "bibliography", "bibliography-connection", "ui-gallery", ...HTTP_SCENARIOS].includes(requested[0]!))) {
    throw new Error("Use: pnpm browser:test reference-preview|image-link-preview|document-title|list-format|panel-lists|mermaid-authoring|image-assets|figure-authoring|source-view|quiet-document|folder-navigation|desktop-updates|open-files|document-tabs|footnotes|citations|bibliography|bibliography-connection|http-host --screenshots");
  }
  return { scenarios: requested.length ? requested : [...STABLE_SCENARIOS], screenshots };
}
