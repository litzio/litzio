/** The stable browser suite, shared by the runner and its coverage/selection checks.
 * Order feeds round-robin shards. Positions balance four shards using rounded scenario durations
 * from CI run 41946600342 (descending duration, least-loaded shard).
 */
export const STABLE_SCENARIOS = [
  "vite-plugins",
  "recovery",
  "document-tabs",
  "assistant",
  "provider-session-log",
  "folder-memory",
  "table-authoring",
  "figure-authoring",
  "command-center",
  "cross-reference",
  "desktop-updates",
  "continuous-editing",
  "table-caption",
  "folder-navigation",
  "equation-save-during-edit",
  "image-assets",
  "caption-selection",
  "save-session",
  "visual-states",
  "mermaid-authoring",
  "pending-figure",
  "quiet-document",
  "property-drafts",
  "citation-authoring",
  "layout-rules",
  "file-actions",
  "ui-language",
  "inline-document-settings",
  "notification-center",
  "reference-save-reload",
  "read-view",
  "external-html-paste",
  "editor-shell",
  "block-move",
  "open-files",
  "multi-host",
  "label-authoring",
  "footnotes",
  "recovery-storage",
  "source-view",
  "assistant-result",
  "bibliography-connection",
  "writeability-preflight",
  "editor-groups",
  "short-field-errors",
  "text-mode",
  "selection-toolbar",
  "figure-draft-race",
  "template-gallery",
  "table-cell-editing",
  "bibliography",
  "equation-insertion",
  "inline-math-authoring",
  "link-authoring",
  "panel-lists",
  "brand-config",
  "image-link-preview",
  "document-scroll",
  "focus-caret",
  "structural-block-authoring",
  "new-document",
  "code-highlighting",
  "recovery-structure",
  "atom-boundaries",
  "external-change",
  "admonition-authoring",
  "document-title",
  "save-error",
  "outline",
  "equation-node-selection-typing",
  "host-settings",
  "pre-save-diff",
  "color-mode",
  "quote-save-reload",
  "basic-blocks",
  "reference-preview",
  "inline-math-split",
  "section-reference",
  "list-authoring",
  "markdown-input",
  "draft-notice-layout",
  "file-preview",
  "list-format",
  "ui-prose-wrap",
  "heading-levels",
  "empty-elements",
  "numbering-mode",
  "source-view-pending",
  "save-during-edit",
  "citations",
  "ui-gallery",
  "review-v5",
  "reveal-folder",
  "document-session",
  "app-reset",
];

/** These scenarios inspect notification content, actions, history or stacking.
 * All others assume the floating center is absent (#1003 owner decision).
 */
export const NOTIFICATION_SCENARIOS = [
  "multi-host",
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
export const HTTP_SCENARIOS = ["http-host", "http-plugins", "plugin-jobs", "generated-views"];

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
  if (screenshots && (requested.length !== 1 || !["provider-session-log", "multi-host", "host-settings", "save-session", "numbering-mode", "document-scroll", "heading-levels", "brand-config", "assistant", "assistant-result", "read-view", "text-mode", "draft-notice-layout", "color-mode", "selection-toolbar", "ui-prose-wrap", "short-field-errors", "notification-center", "reference-preview", "image-link-preview", "document-title", "list-format", "link-authoring", "panel-lists", "pre-save-diff", "external-change", "reveal-folder", "save-error", "mermaid-authoring", "image-assets", "inline-math-authoring", "empty-elements", "inline-document-settings", "file-actions", "table-caption", "table-authoring", "figure-authoring", "source-view", "cross-reference", "command-center", "file-preview", "ui-language", "quiet-document", "folder-navigation", "desktop-updates", "open-files", "document-tabs", "editor-groups", "recovery", "recovery-structure", "footnotes", "citations", "bibliography", "bibliography-connection", "review-v5", "ui-gallery", ...HTTP_SCENARIOS].includes(requested[0]!))) {
    throw new Error("Use: pnpm browser:test reference-preview|image-link-preview|document-title|list-format|panel-lists|mermaid-authoring|image-assets|figure-authoring|source-view|quiet-document|folder-navigation|desktop-updates|open-files|document-tabs|footnotes|citations|bibliography|bibliography-connection|http-host --screenshots");
  }
  return { scenarios: requested.length ? requested : [...STABLE_SCENARIOS], screenshots };
}
