import { snapshotSection, changeFor, serializeChange, parseCommandArgs, isEditCommand, flag, optionalFlag, intFlag, jsonFlag, pathFlag, captionInput, textOrContent, variantFlag, insertionIndex, machineNodes, COMMAND_OPTIONS, applyDocumentBatch } from "../../../apps/editor/server/document-edit-commands.ts";
import { executeCompareOperation } from "../../../apps/editor/server/document-compare.ts";
import { executeFolderTrash } from "../../../apps/editor/server/file-operations.ts";
import { osTrashAvailable, trashFile } from "../../../apps/editor/server/os-trash.ts";
import { createDocumentSourceFile } from "../../../apps/editor/server/document-create.ts";
import { executeTemplateOperation, templateLanguage } from "../../../apps/editor/server/document-templates.ts";
import { brand } from "../../../brand.ts";
import { readBibliographySources } from "../../../apps/editor/server/bibliography.ts";
import { versionText } from "./version.ts";
import fs, { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalWriteError,
  createDocument,
  NativeDocumentError,
  writeIssueOf,
  getEditableDocument,
  ADMONITION_VARIANTS,
  inspectDocument,
  parse,
  sectionMarker,
  blockTargets,
  targetNumbers,
  numberingReport,
  serialize,
  endnotesInPlace,
  citationReport,
  inlineContentText as inlineText,
  unresolvedReferences,
  validateStructure,
  type Document,
  type EditableBlock,
  type EditableDocument,
  type NodePath,
  type InlineContent,
  type CitationReport,
  type ListContent,
} from "@litzio/core";
import { assertUnicode, commitFile, decodeUtf8, preflightFileCommit, textRevision } from "@litzio/file-commit";
import { resolveMediaPath } from "../../../apps/editor/server/document-path.ts";
import { figureMediaPath } from "../../../apps/editor/shared/figure-media-path.ts";
import { createAssistantHost } from "../../../apps/editor/server/assistant-host.ts";

const HELP_GROUPS = [
  "Create and inspect",
  "Check",
  "Edit — batch",
  "Edit — insert blocks",
  "Edit — text and content",
  "Edit — structure",
  "Edit — tables",
  "Edit — labels, footnotes and numbering",
  "Format",
  "Serve",
] as const;

type CommandSpec = {
  name: string;
  readOnly?: boolean;
  group: (typeof HELP_GROUPS)[number]; // Display-only top-level help grouping.
  summary: string;
  usage: string;
  details: string[];
};

type OutputFormat = "text" | "json";

type ParsedArgs = {
  file: string;
  flags: string[];
  format: OutputFormat;
};

const BODY_INDEX_NOTE = "Block 0 is the document metadata; body blocks start at 1 (also the first index in a path).";
const PATH_NOTE = [
  "Paths identify nodes in the current document snapshot.",
  "Structural edits may change them.",
];

const REVISION_NOTE = [
  `Use --if-revision with the revision from ${brand.cliCommand} inspect <file> --format json.`,
  "Revision must be 64 lowercase hexadecimal characters; a mismatch refuses the edit (exit 1).",
  "Successful writes do not print a new revision for single edits.",
  "Before each subsequent edit, run inspect again to get the new revision and paths.",
];
const DRY_RUN_NOTE = [
  "--dry-run runs the same edits and canonical write checks without committing or creating temporary files.",
  "Text prints the result revision, check summary and bibliography diagnostics on stdout, then --- markdown --- and canonical Markdown. Other warnings use stderr.",
  "--dry-run --format json prints dryRun, revision, markdown and the same diagnostic fields as check; batches add applied.",
  "Original literal-syntax warnings also print on stderr; JSON previews keep their Core entries in originalWarnings (or []).",
  "Failures keep the usual stderr messages and exit 1, including in JSON mode.",
  "Shared read-only checks cover current revision and file permissions; directory writes, disk space and rename locks may still fail on write.",
];

const PARAGRAPH_PATH_NOTE = [
  `Use ${brand.cliCommand} inspect <file> to find a NodePath in the current snapshot.`,
  "Structural edits may change paths; run inspect again after editing.",
];
const OFFSET_NOTE = [
  "Offset is measured in UTF-16 code units over rendered paragraph content.",
  "A hard break and an inline math expression each count as one character position.",
  "Offset must be strictly inside the paragraph (0 < offset < length).",
  "Edits that cannot preserve paragraph semantics in canonical Markdown are rejected.",
];
const FIGURE_NOTE = [
  "Without an image or Mermaid source the Figure is pending: it has no content yet.",
  "Caption and label are optional. Alt text needs an image. An empty --alt or --caption removes that property.",
  "Use --caption for text or --caption-content for Core InlineContent JSON; they are mutually exclusive.",
  "Values that cannot round-trip through canonical Markdown are rejected.",
];
const LIST_NOTE = [
  "--list is Core ListContent JSON: {\"ordered\": boolean, \"start\"?: number, \"items\": [...]}.",
  "Each item is {\"content\": InlineContent[], \"list\"?: ListContent}; the optional list nests below the item.",
  "Numbered lists start at \"start\" (default 1); optional style: decimal (default), lower-alpha, upper-alpha, lower-roman, upper-roman; delimiter: . (default) or ).",
  "Bullet lists have no start, style or delimiter. Empty items are saved as list markers.",
  "Example: --list '{\"ordered\":false,\"items\":[{\"content\":[{\"kind\":\"text\",\"text\":\"First\"}]}]}'",
];
const CODE_NOTE = [
  "The language is one word such as python; omit it or pass an empty --language for none.",
  "Code line breaks must be \\n.",
];
const ADMONITION_KIND_NOTE = `Kinds: ${ADMONITION_VARIANTS.join(", ")}.`;
const COMMANDS: CommandSpec[] = [
  { name: "app-reset", group: "Serve", summary: "Inspect or reset local app and Host data after closing every client",
    usage: `${brand.cliCommand} app-reset inspect|apply [--profile <directory>] [--updater-cache <directory>] [--remove-folders] [--confirm --revision <plan-sha>]`,
    details: ["inspect lists deleted and retained data. apply requires the reviewed revision and confirmation; live Desktop/Host/CLI writers refuse reset. External browser profiles and provider accounts remain untouched."] },
  { name: "folder-trash", group: "Create and inspect", summary: "Move a child folder to OS Trash", usage: `${brand.cliCommand} folder-trash <path> --root <folder> [--host <origin>] [--check | --revision <sha256>] --json`, details: ["Only descendants of root are eligible. No permanent deletion. --check inspects file count and external image references without moving. Receipts distinguish refusal before mutation from uncertain OS results. Window drafts are not visible to CLI."] },
  { name: "compare", readOnly: true, group: "Create and inspect", summary: "Compare native document block meaning (read-only)", usage: `${brand.cliCommand} compare <before> <after> --json`, details: ["Read-only native source snapshots; block paths are snapshot-local. Moves are removed + added. Returns source revision receipts; does not contact a live daemon."] },
  { name: "templates", group: "Create and inspect", summary: "List, read or save document templates",
    usage: `${brand.cliCommand} templates list [--json] [--language <ko|en>]`,
    details: [`${brand.cliCommand} templates read <name|id> [--json] [--language <ko|en>]`,
      `${brand.cliCommand} templates save <name> --from <file> [--description <text>]`,
      "Save never overwrites. Names of app defaults in both languages are reserved."] },
  { name: "plugins", group: "Serve", summary: "Manage plugins on an explicit target Host", usage: `${brand.cliCommand} plugins start <pluginId> --input <json-file>|status|stop|result <requestId>|list|install <id-or-directory>|scaffold [directory] --id <id>|validate <directory>|register <directory>|unregister <id>|trust <id> --registration <registrationId> [--digest <digest>]|enable <id> [--trust --registration <registrationId>]|disable|reload <id>|secret-status <id>|secret-delete <id> <name>|settings <id> --file <json> --host <origin> --json`, details: ["plugins install <id-or-directory> validates, bundles if needed, registers, trusts, enables and reloads. ID resolves under the Host authoring directory; repeat after edits. Validation failures return file/location diagnostics. Manual registration never executes code. Community plugins require explicit registration trust before enable; enable --trust --registration <registrationId> records trust and enables only that inspected registration. Read registrationId from plugins list; a replaced registration requires fresh confirmation. Updates retain trust until registration is removed or replaced. All plugins start disabled."] },

  { name: "operation", group: "Serve", summary: "Invoke a declared plugin operation", usage: `${brand.cliCommand} operation invoke <pluginId.operationId> --input <json-file> --host <origin> --json`, details: ["Uses only the named Host. Does not retry or fall back to local execution."] },
  { name: "assistant", group: "Serve", summary: "Read or configure official Assistant settings",
    usage: `${brand.cliCommand} assistant import-image <document> --source <absolute-image-path> | assistant delete <id> --host <origin> | assistant settings | assistant configure --file <json-file> | assistant provider-log <id> <codex|copilot> --host <origin> | assistant conversation <id> --host <origin> | assistant answer <id> --file <json-file> --host <origin>`, details: ["configure takes the complete Assistant settings snapshot; validation errors name the field and allowed values or reason. Uses the same Host operation as HTTP; failures exit nonzero.", "conversation explicitly reopens the target Host snapshot without starting a turn. answer takes { turnId, requestId, answers } and uses the same question validation and provider delivery as the chat. No local fallback or automatic retry."] },
  {
    name: "apply-batch",
    group: "Edit — batch",
    summary: "Apply document edits in order with one atomic file commit",
    usage: `${brand.cliCommand} apply-batch <file> --operations <json-file|-> [--if-revision <revision>] [--dry-run] [--format <text|json>]`,
    details: [
      "--operations reads a non-empty JSON array of { command, ...options } from a UTF-8 file, or stdin with -.",
      "Stdin accepts one leading UTF-8 BOM for Windows PowerShell pipes; file input rules are unchanged.",
      `Example: cat operations.json | ${brand.cliCommand} apply-batch document.md --operations -`,
      "Use existing flag names without -- as keys. Scalar options accept string, number or boolean only.",
      "JSON options (content, caption-content, cells, list, keys, paths, and insert-table align) accept objects/arrays",
      "directly or existing JSON strings. Required, unknown and mutually exclusive options follow single edits.",
      "JSON options accept objects, arrays or strings only; null option values are rejected.",
      "All document edit commands, including format, are allowed; create, check, inspect, daemon,",
      "apply-batch and per-operation if-revision, dry-run and format options are forbidden.",
      "Top-level insertions accept at: \"end\", resolved by Core before endnotes on each step's snapshot.",
      "Table row/column positions, removal positions and move destinations remain numeric.",
      "insert-equation accepts label; insert-table accepts caption or caption-content and label, as in single edits.",
      "Paths and indexes use the preceding step's canonical placement snapshot; no automatic tracking.",
      BODY_INDEX_NOTE,
      "Each step applies Core, validates ordinary write checks and places endnotes for the next step.",
      "Footnote cleanup waits for the completed batch, so temporarily moving its last reference retains its definition.",
      "--if-revision checks the original once, before Core operations (64 lowercase hexadecimal characters).",
      "Without --dry-run, only the final result is committed, against the original revision. Any failure exits 1 without writing.",
      "Step errors: operation <1-based index> (<command>): <original error>; nothing was written.",
      "Only step input/options, Core, validation and intermediate placement errors have that prefix.",
      "Batch-wide errors (original read/parse, revision, final validation and commit) keep single-command messages without a prefix.",
      "Without --dry-run, JSON success: {\"ok\":true,\"command\":\"apply-batch\",\"applied\":N,\"revision\":\"<result revision>\"}.",
      "Without --dry-run, text success prints nothing. Run inspect again for paths before a later request.",
      ...DRY_RUN_NOTE,
    ],
  },
  {
    name: "create",
    group: "Create and inspect",
    summary: `Create a ${brand.name.en} native document, optionally from a template`,
    usage: `${brand.cliCommand} create <file> [--template <name|id> | --input <json-file>] [--language <ko|en>] [--format <text|json>]`,
    details: ["Create a new .md file in an existing directory. --input accepts {authoring, images:[{key,mime,base64}]} through the shared Host authoring operation. Existing files are never overwritten. Success prints the created path; --format json prints the creation receipt."],
  },

  {
    name: "update-bibliography",
    group: "Edit — labels, footnotes and numbering",
    summary: "Set relative .bib declarations and evaluate bounded bibliography resources",
    usage: `${brand.cliCommand} update-bibliography <file> --paths <json>`,
    details: ["--paths is a JSON array of relative .bib paths; [] removes the optional declaration.",
      "Paths use /; ./ and .. are allowed. Duplicate paths, globs, URLs and absolute paths are refused.",
      "Declared bibliography resources are read within the configured boundary. Resource warnings do not block writing."],
  },
  ...(["insert-citation", "update-citation"] as const).map(name => ({
    name,
    group: "Edit — labels, footnotes and numbering" as const,
    summary: name === "insert-citation" ? "Insert an explicit citation at an inline offset" : "Replace a citation's role and key group",
    usage: `${brand.cliCommand} ${name} <file> --path <indexes> --offset <number> --role <cite|cite:t|cite:p> --keys <json>`,
    details: ["--keys is a non-empty JSON array of exact bibliography keys, in group order.",
      "Targets: paragraph, heading, quote, simple admonition, endnote definition, or table cell [table,row,cell].",
      "Offsets use Core UTF-16 inline units; a whole citation group is one unit.",
      name === "insert-citation" ? "Insert at 0 through content length." : "Offset must point to the start of an existing citation atom; surrounding marks are kept.",
      "Multiple keys with cite canonicalize to cite:t. Bounded bibliography reads report readiness warnings.", ...PATH_NOTE],
  })),
  {
    name: "remove-citation",
    group: "Edit — labels, footnotes and numbering",
    summary: "Remove one citation atom at an inline offset",
    usage: `${brand.cliCommand} remove-citation <file> --path <indexes> --offset <number>`,
    details: ["Uses the same targets and Core inline offsets as update-citation.",
      "Offset must point to an existing citation; it removes the whole group. An unsaveable empty block is refused.", ...PATH_NOTE],
  },
  {
    name: "host",
    group: "Serve",
    summary: "Manage Desktop-local remote Host registrations",
    usage: `${brand.cliCommand} host list|check <origin>|register <origin> <label>|rename <hostId> <label>|remove <hostId>|connect <hostId>|status <hostId>`,
    details: ["JSON results. Registration requires Desktop restart; probes do not change window connections. Removal refuses without Desktop work/recovery protection."],
  },
  {
    name: "daemon",
    group: "Serve",
    summary: "Run and manage the HTTP daemon",
    usage: `${brand.cliCommand} daemon run [--root <folder> ...] [--port <port>] [--host <IP>] [--public-origin <origin>] [--channel <stable|beta|development>]`,
    details: [
      "run executes in this terminal in the foreground. --root/--host/--port/--public-origin configure a server; without them it uses local mode. status lists local and manual daemons with URLs; --json includes manualInstances. start/stop target local mode only. daemon alone shows help.",
      `${brand.cliCommand} daemon start|status [--channel <stable|beta|development>] [status: --json]`,
      `${brand.cliCommand} daemon stop --confirm [--channel <stable|beta|development>]`,
      "start starts a background daemon for this PC; Desktop discovers and connects to it. status prints a table (--json for structured output).",
      "Local mode: 127.0.0.1 with a stable port derived from the OS user identity and channel (20000–44575).",
      "Without --root, the entire server disk is accessible. Repeat --root to restrict folders.",
      "Roots are server filesystem access boundaries,",
      "not a workspace or an initial folder selection. Use Open Folder to choose a root or subfolder.",
      "Requires the production Editor build. Manual --host/--root/--port modes are not registered for discovery.",
      "For an access-controlled reverse proxy, set --public-origin to its exact http(s) origin.",
      "Non-loopback binding requires --public-origin. There is no authentication in this phase (decision #1145).",
      "Non-loopback startup warns that anyone who can reach the port can access it; without --root, disk and assistant (AI) execution are exposed.",
      "Serve at the site root (/); subpath hosting is not supported. Ctrl+C stops the server.",
    ],
  },
  {
    name: "insert-hard-break",
    group: "Edit — text and content",
    summary: "Insert a hard break within a supported Paragraph",
    usage: `${brand.cliCommand} insert-hard-break <file> --path <indexes> --offset <number>`,
    details: ["Insert a line break without creating a new paragraph.", ...OFFSET_NOTE, ...PARAGRAPH_PATH_NOTE],
  },
  {
    name: "split-paragraph",
    group: "Edit — structure",
    summary: "Split a top-level Paragraph",
    usage: `${brand.cliCommand} split-paragraph <file> --path <indexes> --offset <number>`,
    details: ["Split a supported top-level paragraph; both sides must be non-empty.", ...OFFSET_NOTE, ...PARAGRAPH_PATH_NOTE],
  },
  {
    name: "merge-paragraph",
    group: "Edit — structure",
    summary: "Merge a Paragraph with the previous Paragraph",
    usage: `${brand.cliCommand} merge-paragraph <file> --path <indexes>`,
    details: ["Merge the current top-level paragraph with the immediately previous paragraph.",
      "Both paragraphs must have supported inline content. No automatic space is inserted.", ...PARAGRAPH_PATH_NOTE],
  },
  {
    name: "check", readOnly: true,
    group: "Check",
    summary: "Validate a document",
    usage: `${brand.cliCommand} check <file> [--format <text|json>]`,
    details: [
      `Validate a document: its structure, and whether ${brand.name.en} can rewrite it as canonical`,
      "Markdown without losing semantics (the same check format and Editor Save use).",
      "Exits 1 when it cannot.",
      "JSON failures may include optional error.code from Core; unclassified errors may omit the code.",
      "References ({eq}, {numref}, {ref}, and links such as [](#label) whose URL starts with #)",
      "that name no target in this document, as MyST resolves them (including the implicit IDs",
      "of unlabeled headings), are reported as warnings with their block and line; they do not",
      "fail the check. JSON: references.unresolved, with role or link.",
      "MyST inherited-property lookup failures are also warnings, with a reason in text and JSON.",
      "Pending Figures (no content yet) are reported as readiness warnings with their block and",
      "label (JSON: readiness.pendingFigures). They do not fail the check or stop Save and format.",
      "Document-relative Figure images that are not regular files or cannot be checked warn with block, label and source",
      "(JSON: readiness.missingImageFigures). URLs and absolute paths are skipped, as are paths",
      "the Host refuses (including escapes outside the document directory). No image decoding is done.",
      "Missing-image warnings do not fail the check or change writes.",
      "Footnote definitions not written after the body in first-reference order are reported as a",
      "note: format and Editor Save write them there (JSON: endnotes.inPlace).",
      "Output format is text by default; JSON is available with --format json.",
    ],
  },
  {
    name: "inspect", readOnly: true,
    group: "Create and inspect",
    summary: "Inspect semantic blocks and editable targets",
    usage: `${brand.cliCommand} inspect <file> [--format <text|json>]`,
    details: [
      "Inspect semantic blocks and editable targets.",
      "JSON includes revision: the SHA-256 of the original UTF-8 text read for this inspect.",
      ...REVISION_NOTE,
      "",
      "Editability fields describe the current semantic projection.",
      "numbers= (JSON: numbers) gives the computed number of a block's first equation, figure or",
      "captioned table, as MyST numbers them; numbers are never written to the document.",
      "Other Core commands may support additional text operations.",
      "",
      ...PATH_NOTE,
      "Metadata is not listed. " + BODY_INDEX_NOTE,
    ],
  },
  {
    name: "format",
    group: "Format",
    summary: "Canonically format a document",
    usage: `${brand.cliCommand} format <file>`,
    details: ["Canonically format a document. Footnote definitions are written after the body, in the",
      `order of the first reference to each (endnotes), as every ${brand.name.en} write does.`],
  },
  {
    name: "replace-text",
    group: "Edit — text and content",
    summary: "Replace text in the first matching paragraph or heading",
    usage: `${brand.cliCommand} replace-text <file> --from <text> --to <text>`,
    details: ["Select only the first matching paragraph or heading by rendered text, not throughout the document.",
      "Replace all matches within that block's individual text nodes.",
      "Matches crossing formatting/text-node boundaries may be left unchanged, still exiting 0 (e.g. a**bc**d, --from abc).",
      "Use update-node-text instead when you know the path; it also substitutes within individual text nodes.",
      "For formatted content, replace the whole block with structured --content: update-heading or update-quote.",
      "For a paragraph in apply-batch, insert-block --content for the new paragraph first, then remove-block on the old one.",
      "Intermediate steps keep ordinary write checks; footnote cleanup waits for batch completion. Check first with --dry-run."],
  },
  {
    name: "insert-block",
    group: "Edit — insert blocks",
    summary: "Insert a Paragraph block at a top-level index",
    usage: `${brand.cliCommand} insert-block <file> --at <index|end> (--text <text> | --content <json>)`,
    details: [
      "Insert a Paragraph block at a top-level index.",
      "Use --text for plain text or --content for Core InlineContent JSON (marks, math, links and references).",
      "",
      "The current implementation inserts a Paragraph block only.",
    ],
  },
  {
    name: "insert-heading",
    group: "Edit — insert blocks",
    summary: "Insert a Heading block at a top-level index",
    usage: `${brand.cliCommand} insert-heading <file> --at <index|end> --level <1-6> (--text <text> | --content <json>)`,
    details: [
      "Insert a Heading block at a top-level index.",
      "Heading levels 1 through 6 are supported. --content is Core InlineContent JSON without line breaks.",
    ],
  },
  {
    name: "update-heading",
    group: "Edit — text and content",
    summary: "Replace the text of a Heading, keeping its level",
    usage: `${brand.cliCommand} update-heading <file> --path <index> (--text <text> | --content <json>)`,
    details: [
      "Replace the entire inline content of one editable top-level Heading, keeping its level.",
      "--content is Core InlineContent JSON (marks, links, inline math and references); headings cannot hold line breaks.",
      "Headings require supported native inline content.",
      "Use update-node-text instead when substituting text at a known path.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-admonition",
    group: "Edit — insert blocks",
    summary: "Insert a simple admonition of a standard MyST kind",
    usage: `${brand.cliCommand} insert-admonition <file> --at <index|end> --variant <kind> --text <text>`,
    details: [
      "Insert a top-level admonition through Core.",
      ADMONITION_KIND_NOTE,
      "An empty body is a supported authoring state.",
    ],
  },
  {
    name: "update-admonition-variant",
    group: "Edit — text and content",
    summary: "Change the kind of a simple admonition",
    usage: `${brand.cliCommand} update-admonition-variant <file> --path <index> --variant <kind>`,
    details: [
      "Change one editable top-level admonition to another kind, keeping its body.",
      ADMONITION_KIND_NOTE,
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-quote",
    group: "Edit — insert blocks",
    summary: "Insert a Quote at a top-level index",
    usage: `${brand.cliCommand} insert-quote <file> --at <index|end> (--text <text> | --content <json>)`,
    details: [
      "Insert a top-level block quote holding one paragraph.",
      "Use --text for plain text or --content for Core InlineContent JSON. An empty quote is a supported authoring state.",
    ],
  },
  {
    name: "update-quote",
    group: "Edit — text and content",
    summary: "Replace the text of a Quote",
    usage: `${brand.cliCommand} update-quote <file> --path <index> (--text <text> | --content <json>)`,
    details: [
      "Replace the entire paragraph content of one editable top-level Quote.",
      "Quotes contain one paragraph of supported native inline content.",
      "Use update-node-text instead when substituting text at a known path.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-footnote",
    group: "Edit — labels, footnotes and numbering",
    summary: "Insert a footnote reference and its definition",
    usage: `${brand.cliCommand} insert-footnote <file> --path <indexes> --offset <number> (--text <text> | --content <json>)`,
    details: [
      "Insert a footnote reference at --offset in one editable top-level Paragraph, Heading, Quote or",
      "simple admonition, or a table cell (--path table,row,cell), and its definition at the end of the",
      "document. The label is the next unused number; shown numbers follow reference order.",
      "--text or --content is the definition.",
      "Offset is measured in UTF-16 code units over rendered content; inline math and footnotes count as one.",
      "Offset may be 0 or the content length.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "remove-footnote",
    group: "Edit — labels, footnotes and numbering",
    summary: "Remove a footnote definition and all its references",
    usage: `${brand.cliCommand} remove-footnote <file> --path <index>`,
    details: ["Remove one definition and every reference to its label through Core.", ...PATH_NOTE],
  },
  {
    name: "update-footnote",
    group: "Edit — labels, footnotes and numbering",
    summary: "Replace the text of a footnote definition",
    usage: `${brand.cliCommand} update-footnote <file> --path <index> (--text <text> | --content <json>)`,
    details: [
      "Replace the paragraph of one editable footnote definition, keeping its label.",
      "Definitions contain one paragraph without footnote references.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-divider",
    group: "Edit — insert blocks",
    summary: "Insert a divider (thematic break) at a top-level index",
    usage: `${brand.cliCommand} insert-divider <file> --at <index|end>`,
    details: ["Insert a top-level divider, written as a Markdown thematic break."],
  },
  {
    name: "update-heading-level",
    group: "Edit — structure",
    summary: "Change an editable Heading's level through Core",
    usage: `${brand.cliCommand} update-heading-level <file> --path <index> --from <1-6> --to <1-6>`,
    details: [
      "Change one editable top-level Heading from its current level to another level.",
      "The current level must match --from.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "convert-block",
    group: "Edit — structure",
    summary: "Convert a Paragraph or Heading to another text block kind",
    usage: `${brand.cliCommand} convert-block <file> --path <index> --to <paragraph|heading> [--level <1-6>]`,
    details: [
      "Convert one top-level Paragraph to a Heading, a Heading to a Paragraph,",
      "or a Heading to another level. Inline content is kept.",
      "--level is required with --to heading and not allowed with --to paragraph.",
      "Conversions that cannot keep the content, such as a line break in a heading, are rejected.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-equation",
    group: "Edit — insert blocks",
    summary: "Insert an Equation block at a top-level index",
    usage: `${brand.cliCommand} insert-equation <file> --at <index|end> --latex <latex> [--label <label>]`,
    details: [
      "Insert an Equation block at a top-level index.",
      "An empty Equation is saved with dollar fences.",
      "--label sets the label in the same write, under update-label's validation and duplicate rules.",
    ],
  },
  {
    name: "insert-figure",
    group: "Edit — insert blocks",
    summary: "Insert a Figure block at a top-level index",
    usage: `${brand.cliCommand} insert-figure <file> --at <index|end> [--image <url> | --mermaid <source>] [--alt <text>] [--caption <text> | --caption-content <json>] [--label <label>]`,
    details: [
      "Insert a Figure block at a top-level index.",
      ...FIGURE_NOTE,
      "--label sets the new Figure's label in the same write, under update-label's rules.",
      "Connect an image to a pending Figure later with update-figure --image.",
      "--mermaid inserts an opaque Mermaid source instead of an image; no alt text or conversion.",
    ],
  },
  {
    name: "update-media-references",
    group: "Edit — text and content",
    summary: "Replace exact Figure media sources in one document through Core",
    usage: `${brand.cliCommand} update-media-references <file> --from <source> --to <source>`,
    details: ["Replace every matching Figure image source, preserving caption, alt and label.",
      "Sources match exactly. No filesystem traversal, image rename or URL normalization is performed.",
      "Uses canonical validation and the normal revision-checked write, dry-run and batch contracts."],
  },
  {
    name: "update-figure",
    group: "Edit — text and content",
    summary: "Update a Figure's image, Mermaid source, alt text, or caption through Core",
    usage: `${brand.cliCommand} update-figure <file> --path <indexes> [--image <url> | --mermaid <source>] [--alt <text>] [--caption <text> | --caption-content <json>]`,
    details: [
      "Update one top-level Figure through Core. Omitted properties are unchanged.",
      ...FIGURE_NOTE,
      "The Figure label is preserved; change it with update-label.",
      "--mermaid replaces source only on an existing Mermaid Figure. Mermaid syntax is not validated.",
      "--image \"\" removes the image; the caption and label stay. Remove its alt text with --alt \"\".",
      ...PATH_NOTE,
    ],
  },
  {
    name: "remove-block",
    group: "Edit — structure",
    summary: "Remove a top-level block",
    usage: `${brand.cliCommand} remove-block <file> --at <index>`,
    details: ["Remove one top-level block only. Removing a heading does not remove its section content.",
      "Use remove-section instead when removing a heading with its content and subsections."],
  },
  {
    name: "move-block",
    group: "Edit — structure",
    summary: "Move a top-level block",
    usage: `${brand.cliCommand} move-block <file> --from <index> --to <index>`,
    details: ["Move one top-level block only; moving a heading does not move its section content.",
      "Use move-section instead when moving a heading with its content and subsections.",
      "Footnote definitions are written after the body in first-reference",
      "order wherever they are moved; move a reference to change their order."],
  },
  {
    name: "move-section",
    group: "Edit — structure",
    summary: "Move a heading's section",
    usage: `${brand.cliCommand} move-section <file> --from <heading index> --to <index>`,
    details: [
      "Move the section a top-level heading opens: its label targets, content and deeper sections.",
      "--to is the start of another section or the block count (the end). Heading levels are kept.",
      "Footnote definitions (endnotes) are in no section and stay after the body.",
      "inspect shows each heading's section as [start,end).",
      "Use move-block instead when moving just one top-level block.",
    ],
  },
  {
    name: "remove-section",
    group: "Edit — structure",
    summary: "Remove a heading's section",
    usage: `${brand.cliCommand} remove-section <file> --at <heading index>`,
    details: ["Remove the section a top-level heading opens: its label targets, content and deeper sections.",
      "Footnote definitions (endnotes) are kept. Removing the last reference to one is refused without writing.",
      "Use remove-block instead when removing just one top-level block."],
  },
  {
    name: "insert-table",
    group: "Edit — tables",
    summary: "Insert a Markdown table at a top-level index",
    usage: `${brand.cliCommand} insert-table <file> --at <index|end> --cells <json> [--align <json>] [--caption <text> | --caption-content <json>] [--label <label>]`,
    details: [
      "Insert a Markdown table at a top-level index.",
      "--cells is a JSON array of rows, each an array of cells; the first row is the header row.",
      "A cell is its text or Core InlineContent JSON. Every row needs the same number of cells. Cells may be empty.",
      "--align is an optional JSON array of left, center, right or null, one per column.",
      "Cell content must be one line without leading or trailing whitespace.",
      "--caption is single-line text; --caption-content is Core InlineContent JSON. They are mutually exclusive.",
      "--label follows update-label's validation and duplicate rules; a caption is not required for a label.",
      "Insertion, caption and label are applied in one write; any failure leaves the original unchanged.",
      "Example: --cells '[[\"Port\",\"Type\"],[\"U\",\"AC\"]]'",
    ],
  },
  {
    name: "insert-list",
    group: "Edit — insert blocks",
    summary: "Insert a bullet or numbered list at a top-level index",
    usage: `${brand.cliCommand} insert-list <file> --at <index|end> --list <json>`,
    details: [
      "Insert a bullet or numbered list, optionally with nested lists, at a top-level index.",
      ...LIST_NOTE,
    ],
  },
  {
    name: "update-list",
    group: "Edit — text and content",
    summary: "Replace the content of an editable list through Core",
    usage: `${brand.cliCommand} update-list <file> --path <index> --list <json>`,
    details: [
      "Replace the kind, numbering, items and nesting of one editable top-level list.",
      ...LIST_NOTE,
      "inspect --format json shows an editable list's current content in the same shape.",
      "Task lists and items with several paragraphs or other blocks are not native content.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-code-block",
    group: "Edit — insert blocks",
    summary: "Insert a fenced code block at a top-level index",
    usage: `${brand.cliCommand} insert-code-block <file> --at <index|end> --code <text> [--language <name>]`,
    details: [
      "Insert a fenced code block at a top-level index. The code is kept exactly, including blank lines and indentation.",
      ...CODE_NOTE,
    ],
  },
  {
    name: "update-code-block",
    group: "Edit — text and content",
    summary: "Replace the language or code of a code block through Core",
    usage: `${brand.cliCommand} update-code-block <file> --path <index> [--language <name>] [--code <text>]`,
    details: [
      "Update one editable top-level code block. Omitted properties are unchanged.",
      ...CODE_NOTE,
      "Code blocks with captions, labels or other directive options are not native content.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-table-row",
    group: "Edit — tables",
    summary: "Insert an empty row into a Markdown table",
    usage: `${brand.cliCommand} insert-table-row <file> --path <table> --at <row>`,
    details: [
      "Insert an empty body row into a top-level Markdown table.",
      "Row 0 is the header row, so --at is from 1 to the row count (the end).",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-table-column",
    group: "Edit — tables",
    summary: "Insert an empty column into a Markdown table",
    usage: `${brand.cliCommand} insert-table-column <file> --path <table> --at <column>`,
    details: [
      "Insert an empty column, header cell included, into a top-level Markdown table.",
      "--at is from 0 to the column count (the end).",
      ...PATH_NOTE,
    ],
  },
  {
    name: "remove-table-row",
    group: "Edit — tables",
    summary: "Remove a body row from a Markdown table",
    usage: `${brand.cliCommand} remove-table-row <file> --path <table> --at <row>`,
    details: [
      "Remove a body row from a top-level Markdown table.",
      "Row 0 is the header row and cannot be removed, so --at is from 1 to the last row.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "remove-table-column",
    group: "Edit — tables",
    summary: "Remove a column from a Markdown table",
    usage: `${brand.cliCommand} remove-table-column <file> --path <table> --at <column>`,
    details: [
      "Remove a column, header cell included, from a top-level Markdown table.",
      "A table keeps at least one column; use remove-block to remove the whole table.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "move-table-row",
    group: "Edit — tables",
    summary: "Move a body row within a Markdown table",
    usage: `${brand.cliCommand} move-table-row <file> --path <table> --from <row> --to <row>`,
    details: [
      "Move a body row of a top-level Markdown table. Row 0 is the header row and stays first.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "move-table-column",
    group: "Edit — tables",
    summary: "Move a column within a Markdown table",
    usage: `${brand.cliCommand} move-table-column <file> --path <table> --from <column> --to <column>`,
    details: [
      "Move a column, header cell and alignment included, within a top-level Markdown table.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "update-table-alignment",
    group: "Edit — tables",
    summary: "Set or clear the alignment of a Markdown table column",
    usage: `${brand.cliCommand} update-table-alignment <file> --path <table> --column <column> --align <left|center|right|none>`,
    details: [
      "Set the alignment of one column of a top-level Markdown table, or clear it with none.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "update-reference-templates",
    group: "Edit — labels, footnotes and numbering",
    summary: "Set document reference templates through Core",
    usage: `${brand.cliCommand} update-reference-templates <file> [--figure <template>] [--table <template>] [--equation <template>] [--reset <figure|table|equation|all>]`,
    details: ["Templates contain %s (or {number}). Omitted kinds are unchanged. --reset restores MyST defaults; it cannot also set the same kind."],
  },
  {
    name: "update-title",
    group: "Edit — labels, footnotes and numbering",
    summary: "Set or remove the single-line frontmatter document title through Core",
    usage: `${brand.cliCommand} update-title <file> (--text <text> | --remove)`,
    details: ["An empty --text stores an empty title. --remove deletes the field. Body headings and labels are unchanged."],
  },
  {
    name: "update-heading-numbering",
    group: "Edit — labels, footnotes and numbering",
    summary: "Enable or disable document heading numbers through Core",
    usage: `${brand.cliCommand} update-heading-numbering <file> --enabled <true|false>`,
    details: ["H1-H6 are numbered body sections. Only numbering settings are written, never heading text."],
  },
  {
    name: "update-table-caption",
    group: "Edit — tables",
    summary: "Set or remove a table caption through Core",
    usage: `${brand.cliCommand} update-table-caption <file> --path <table> (--text <text> | --content <json>)`,
    details: ["Set a single-line caption; empty text removes it. Every table remains a numbered table directive, with or without a caption or label."],
  },
  {
    name: "update-table-cell",
    group: "Edit — tables",
    summary: "Replace the content of a Markdown table cell through Core",
    usage: `${brand.cliCommand} update-table-cell <file> --path <table,row,cell> (--text <text> | --content <json>)`,
    details: [
      "Replace the whole content of one cell in a top-level Markdown table. Use an empty --text to clear it.",
      "--content is Core InlineContent JSON (marks, links, inline math and references) without line breaks.",
      "The content must be one line without leading or trailing whitespace. Cells require supported native inline content.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "update-node-text",
    group: "Edit — text and content",
    summary: "Update text at a NodePath through Core",
    usage: `${brand.cliCommand} update-node-text <file> --path <indexes> --from <text> --to <text>`,
    details: [
      "Substitute text at a known Core NodePath.",
      "Use update-heading or update-quote instead when replacing the entire heading or quote content.",
      "",
      "Use:",
      `  ${brand.cliCommand} inspect <file>`,
      "",
      "to discover paths and editable targets.",
      "",
      ...PATH_NOTE,
    ],
  },
  {
    name: "update-equation-latex",
    group: "Edit — text and content",
    summary: "Update Equation LaTeX through Core",
    usage: `${brand.cliCommand} update-equation-latex <file> --path <indexes> --from <latex> --to <latex>`,
    details: [
      "Update one Equation's LaTeX source through Core.",
      "The label and document structure must remain unchanged.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-target",
    group: "Edit — labels, footnotes and numbering",
    summary: "Label the next block, typically a section heading, with a (label)= target",
    usage: `${brand.cliCommand} insert-target <file> --at <index|end> --label <label>`,
    details: [
      "Insert a (label)= target at a top-level index. Before a heading, {ref}`label` references name that section.",
      "A section label uses 1-100 ASCII letters, digits or | @ < > * . / _ - + : characters and must not name another target.",
      "Rename a target with update-label and remove it with remove-block.",
    ],
  },
  {
    name: "update-numbering-mode",
    group: "Edit — labels, footnotes and numbering",
    summary: "Clear fixed numbers or fix current display numbers for all caption targets",
    usage: `${brand.cliCommand} update-numbering-mode <file> --mode automatic|fixed`,
    details: ["Fixed preserves existing numbers and fills missing numbers from the current display. No document option is stored."],
  },
  {
    name: "update-enumerator",
    group: "Edit — labels, footnotes and numbering",
    summary: "Set or clear a fixed Equation, Figure or Table number through Core",
    usage: `${brand.cliCommand} update-enumerator <file> --path <index> --enumerator <number>`,
    details: [
      "Set an authored number string, such as 17, A.3 or 4-2. Use an empty --enumerator to clear it.",
      "Fixed numbers survive moves and are used by references. Missing or duplicate numbers warn without blocking writes.",
      "Saving an empty equation with a fixed number is refused: enter equation content or clear the fixed number.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "update-label",
    group: "Edit — labels, footnotes and numbering",
    summary: "Set, change, or remove an Equation, Figure, Table or target label through Core",
    usage: `${brand.cliCommand} update-label <file> --path <index> --label <label> [--update-references <true|false>]`,
    details: [
      "Set the label (reference target name) of one top-level Equation, Figure or Table. Use an empty --label to remove it.",
      "A (label)= target can be renamed but not emptied; remove it with remove-block.",
      "The label must be one line without leading or trailing spaces, be referenceable, and not name another target in the document.",
      "References stay untouched by default (or with --update-references false).",
      "--update-references true renames an existing non-empty label and its resolved same-document role/fragment references atomically.",
      "Only labeled Equations, Figures, Tables and section targets immediately before headings support this opt-in.",
      "Conflicts (including implicit heading IDs), ambiguous targets or reference notation that cannot preserve meaning are refused without writing.",
      "apply-batch accepts the same option as \"update-references\": true or false.",
      ...PATH_NOTE,
    ],
  },
];

function main(argv: string[]): number {
  if (argv.includes("--version")) {
    if (argv.length !== 1) throw new Error("--version must be used alone");
    process.stdout.write(versionText());
    return 0;
  }
  const [command, ...rest] = argv;
  if (!command) {
    process.stderr.write(topLevelHelp());
    return 2;
  }
  if (command === "-h" || command === "--help") {
    process.stdout.write(topLevelHelp());
    return 0;
  }
  if (command === "help") {
    if (rest.length === 0) {
      process.stdout.write(topLevelHelp());
      return 0;
    }
    if (rest.length === 1 && findCommand(rest[0])) {
      process.stdout.write(commandHelp(rest[0]));
      return 0;
    }
    process.stderr.write(topLevelHelp());
    return 2;
  }

  const spec = findCommand(command);
  if (!spec) {
    process.stderr.write(`unknown command: ${command}\n\n${topLevelHelp()}`);
    return 2;
  }
  if (isCommandHelpRequest(rest)) {
    process.stdout.write(commandHelp(command));
    return 0;
  }
  if (command === "compare") {
    if (rest.length !== 3 || rest[2] !== "--json" || rest[0].startsWith("--") || rest[1].startsWith("--")) throw new Error(commandHelp(command));
    process.stdout.write(JSON.stringify(executeCompareOperation({ before: readFile(rest[0]), after: readFile(rest[1]) })) + "\n");
    return 0;
  }
  if (command === "templates") {
    const [operation, ...args] = rest;
    const tokens = operation === "list" ? args : args.slice(1);
    const name = args[0];
    const allowed = operation === "save" ? ["--from", "--description"] : ["--json", "--language"];
    const seen = new Set<string>();
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (!allowed.includes(token) || seen.has(token)) throw new Error(commandHelp(command));
      seen.add(token);
      if (token !== "--json" && (tokens[++index] === undefined || tokens[index].startsWith("--"))) throw new Error(`missing ${token}`);
    }
    const language = templateLanguage(optionalFlag(tokens, "--language"));
    let result: unknown;
    if (operation === "list") result = executeTemplateOperation("list", { language });
    else if (operation === "read" && name) result = executeTemplateOperation("read", { template: name, language });
    else if (operation === "save" && name) result = executeTemplateOperation("save", { name, from: flag(tokens, "--from"), description: optionalFlag(tokens, "--description") });
    else throw new Error(commandHelp(command));
    if (operation === "read" && !seen.has("--json")) process.stdout.write((result as { source: string }).source);
    else if (operation === "list" && !seen.has("--json")) {
      const inventory = result as import("../../../apps/editor/shared/template-protocol.ts").TemplateList;
      process.stdout.write(inventory.templates.map(item => `${item.id} (${item.kind}) ${item.name}\n  ${item.description}`).join("\n") + "\n");
      for (const problem of inventory.problems) process.stderr.write(`${problem.file}: ${problem.error}\n`);
    } else process.stdout.write(JSON.stringify(result) + "\n");
    return 0;
  }
  if (command === "daemon") {
    if (rest.length === 0) { process.stdout.write(commandHelp(command)); return 0; }
    throw new Error(commandHelp(command));
  }
  if (!rest[0]) {
    process.stderr.write(commandHelp(command));
    return 2;
  }
  const { file, flags, format } = parseCommandArgs(command, rest);
  const ifRevision = optionalFlag(flags, "--if-revision");
  const dryRun = flags.includes("--dry-run");
  const bibliographyRoot = optionalFlag(flags, "--bibliography-root");

  /** Apply one Core operation and write the result only over the file as it was read. */
  function edit(path: string, change: (document: Document) => Document): number {
    // Both checks use the source the change was made to, never a later read.
    const source = readFile(path);
    const revision = textRevision(source);
    if (ifRevision !== undefined && ifRevision !== revision) {
      throw new Error("revision mismatch; run inspect again; nothing was written");
    }
    const original = parse(source);
    const references = unresolvedReferences(original);
    return finishEdit(path, serializeChange(original, change), revision, { command }, dryRun, format, references, bibliographyRoot);
  }

  if (command === "apply-batch") {
    const { markdown, revision, applied, references } = applyBatch(file, flag(flags, "--operations"), ifRevision);
    return finishEdit(file, markdown, revision, { command, applied }, dryRun, format, references, bibliographyRoot);
  }
  if (isEditCommand(command)) {
    return edit(file, changeFor(command, flags));
  }

  switch (command) {
    case "create": {
      if (flags.includes("--input")) throw new Error("Structured creation requires runCliAsync or the CLI executable");
      if (path.extname(file).toLowerCase() !== ".md") throw new Error("document path must point to a .md file");
      const template = optionalFlag(flags, "--template");
      const language = templateLanguage(optionalFlag(flags, "--language"));
      const receipt = template === undefined ? createDocumentSourceFile(file, serialize(createDocument()))
        : executeTemplateOperation("create", { path: file, template, language });
      process.stdout.write((format === "json" ? JSON.stringify(receipt) : receipt.path) + "\n");
      return 0;
    }
    case "check": {
      return checkDocument(parse(readFile(file)), file, format, undefined, bibliographyRoot);
    }
    case "inspect": {
      process.stdout.write(format === "json" ? inspectFileJson(file, bibliographyRoot) : inspectFile(file, bibliographyRoot));
      return 0;
    }
    default:
      process.stderr.write(topLevelHelp());
      return 2;
  }
}

type EditResult = { command: string; applied?: number };
type Preview = EditResult & { dryRun: true; revision: string; markdown: string;
  originalWarnings: ReturnType<typeof unresolvedReferences> };

/** The only edit write boundary. Preview never enters file-commit's mutation path. */
function finishEdit(file: string, markdown: string, revision: string, result: EditResult,
  dryRun: boolean, format: OutputFormat, references: ReturnType<typeof unresolvedReferences>, bibliographyRoot?: string): number {
  if (dryRun) {
    const resultRevision = textRevision(markdown);
    const document = parse(markdown);
    preflightFileCommit(file, markdown, revision);
    const status = checkDocument(document, file, format, { ...result, dryRun: true, revision: resultRevision, markdown,
      originalWarnings: references.filter(reference => "footnote" in reference || "syntax" in reference) }, bibliographyRoot);
    if (status === 0) warnLiteralSyntax(references);
    return status;
  }
  const citations = resourceReport(parse(markdown), file, bibliographyRoot);
  commitFile(file, markdown, revision);
  for (const diagnostic of citations.readiness.diagnostics) {
    if (diagnostic.severity === "warning") process.stderr.write(`warning: ${diagnostic.code}${diagnostic.source ? ` ${quote(diagnostic.source)}` : ""}${diagnostic.key ? ` key=${quote(diagnostic.key)}` : ""}${diagnostic.field ? ` field=${quote(diagnostic.field)}` : ""}\n`);
  }
  warnLiteralSyntax(references);
  if (result.command === "apply-batch" && format === "json") {
    process.stdout.write(`${JSON.stringify({ ok: true, ...result, revision: textRevision(markdown) })}\n`);
  }
  return 0;
}

/** Shared check diagnostics and presentation for files and canonical edit previews. */
function checkDocument(document: Document, file: string, format: OutputFormat, preview?: Preview, bibliographyRoot?: string): number {
  validateStructure(document);
  const writeError = canonicalWriteError(document);
  const unresolved = unresolvedReferences(document);
  // Publish readiness, apart from writeability: a pending Figure is saved, not finished.
  const blocks = getEditableDocument(document).blocks;
  const numbering = numberingReport(blocks);
  const pendingFigures = blocks.flatMap(block =>
    block.block === "figure" && block.contentKind === "none" ? [{ path: block.path, label: block.label }] : []);
  const missingImageFigures = blocks.flatMap(block => {
    if (block.block !== "figure" || block.contentKind !== "image") return [];
    const source = block.imageUrl;
    const mediaPath = figureMediaPath(source);
    if (mediaPath === undefined) return [];
    let resolved: string;
    try { resolved = resolveMediaPath(mediaPath, file); }
    catch { return []; } // Host-refused paths are outside this existence check's scope.
    try { if (fs.statSync(resolved).isFile()) return []; }
    catch { /* A stat failure cannot establish a regular file; warn without claiming absence. */ }
    return [{ path: block.path, label: block.label, source }];
  });
  const endnotes = { inPlace: endnotesInPlace(document) };
  const citations = resourceReport(document, file, bibliographyRoot);
  if (format === "json") {
    process.stdout.write(`${JSON.stringify({
      ok: writeError === undefined,
      command: "check",
      ...preview,
      validation: { valid: true },
      writeability: writeError === undefined ? { writable: true } : { writable: false, error: writeError },
      references: { unresolved },
      numbering,
      readiness: { pendingFigures, missingImageFigures },
      endnotes,
      citations,
    })}\n`);
  } else {
    if (preview) process.stdout.write(`dry run; nothing was written\nrevision: ${preview.revision}\n`);
    process.stdout.write(`${summarize(document)}\n`);
    process.stdout.write(formatCitations(citations));
    process.stdout.write(formatNumbering(numbering));
    if (writeError === undefined) process.stdout.write("writeability ok\n");
    else process.stderr.write(`writeability failed: ${writeError}\n`);
    for (const reference of unresolved) {
      process.stderr.write(`warning: ${referenceWarning(reference)}\n`);
    }
    for (const { path, label } of pendingFigures) {
      process.stderr.write(`warning: Figure${label ? ` ${quote(label)}` : ""} (block ${path[0]}) has no content yet\n`);
    }
    for (const { path, label, source } of missingImageFigures) {
      process.stderr.write(`warning: Figure${label ? ` ${quote(label)}` : ""} (block ${path[0]}) image ${quote(source)} is not a file or could not be checked\n`);
    }
    if (!endnotes.inPlace) process.stderr.write("note: format and Save move footnote definitions after the body, in first-reference order\n");
    if (preview) process.stdout.write(`--- markdown ---\n${preview.markdown}`);
  }
  return writeError === undefined ? 0 : 1;
}

/** Report original-source intent after a successful commit or preview; operation clones have no evidence. */
function warnLiteralSyntax(references: ReturnType<typeof unresolvedReferences>): void {
  for (const reference of references) {
    if ("footnote" in reference || "syntax" in reference) {
      process.stderr.write(`warning: ${referenceWarning(reference, true)}\n`);
    }
  }
}

function referenceWarning(reference: ReturnType<typeof unresolvedReferences>[number], written = false): string {
  const { path, line } = reference;
  const at = line === undefined ? `block ${path[0]}` : `block ${path[0]}, line ${line}`;
  if ("syntax" in reference) {
    const kind = reference.syntax === "inline-code" ? "inline code"
      : reference.syntax === "reference-image" ? "reference image" : "reference link";
    const reason = reference.syntax === "inline-code" ? "has no closing backtick run" : "has no definition";
    const suffix = written ? "; written as literal text"
      : reference.syntax === "inline-code" ? "; parsed as literal text" : " in this document";
    return `${kind} ${quote(reference.source)} (${at}) ${reason}${suffix}`;
  }
  if ("footnote" in reference) {
    const suffix = written ? `; written as literal \\[^${reference.label}]` : " in this document";
    return `footnote [^${reference.label}] (${at}) has no definition${suffix}`;
  }
  const source = "role" in reference ? `{${reference.role}}\`${reference.label}\`` : `link ${reference.link}`;
  return `${source} (${at}) ${reference.reason ?? "names no target in this document"}`;
}

function applyBatch(file: string, operationsFile: string, ifRevision: string | undefined) {
  const input = operationsFile === "-"
    ? decodeUtf8(readFileSync(0)).replace(/^\uFEFF/, "")
    : readFile(operationsFile);
  const operations: unknown = JSON.parse(input);
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error("--operations must be a non-empty JSON array");
  }
  const source = readFile(file);
  const revision = textRevision(source);
  if (ifRevision !== undefined && ifRevision !== revision) {
    throw new Error("revision mismatch; run inspect again; nothing was written");
  }
  return { ...applyDocumentBatch(source, operations), revision };
}

function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find((command) => command.name === name);
}

function isCommandHelpRequest(args: string[]): boolean {
  if (args.length === 1) return args[0] === "-h" || args[0] === "--help";
  return args.length === 2 && !args[0].startsWith("-") && (args[1] === "-h" || args[1] === "--help");
}

function topLevelHelp(): string {
  const width = Math.max(...COMMANDS.map((command) => command.name.length));
  const lines = [
    `${brand.name.en} CLI`,
    "",
    "Usage:",
    `  ${brand.cliCommand} <command> [options]`,
    `  ${brand.cliCommand} --version  Show the build version and commit (use alone).`,
    "",
    "Start here:",
    `  Before editing, use ${brand.cliCommand} inspect <file> --format json for current paths and revision.`,
    "  One edit: choose a command below. Multiple edits: use apply-batch.",
    "  Use --if-revision to guard edits and --dry-run to preview them.",
    "  Batch paths use each preceding step's result; they are not tracked automatically.",
    `  Details: ${brand.cliCommand} help <command>`,
    "",
    "Commands:",
    ...HELP_GROUPS.flatMap((group) => [
      `  ${group}:`,
      ...COMMANDS.filter((command) => command.group === group)
        .map((command) => `    ${command.name.padEnd(width)}  ${command.summary}`),
      "",
    ]),
    "",
  ];
  return lines.join("\n");
}

function commandHelp(name: string): string {
  const spec = findCommand(name);
  if (!spec) return topLevelHelp();
  if (name === "assistant" || name === "app-reset") return ["Usage:", `  ${spec.usage}`, "", ...spec.details, ""].join("\n");
  const editing = isEditCommand(name);
  const addressed = /--(?:at|path|from) <(?:index|heading index|table)/.test(spec.usage);
  return ["Usage:", `  ${spec.usage}${editing ? " [--if-revision <revision>] [--dry-run [--format <text|json>]]" : ""}`, "", ...spec.details,
    ...(spec.usage.includes("--at <index|end>") ? ["",
      "--at end inserts at the body end before endnote definitions, or after the last body block.",
      "For an empty native document this is index 1. Core resolves the position on the current snapshot.",
      "apply-batch accepts the same position as \"at\": \"end\"."] : []),
    ...(editing && addressed ? ["", BODY_INDEX_NOTE] : []),
    "", "--bibliography-root <directory> permits declared bibliography files within that directory.",
    "Default: document directory. Applies to check, inspect, edits and their previews; never writes .bib files.",
    ...(editing ? ["", ...REVISION_NOTE, ...DRY_RUN_NOTE] : []), ""].join("\n");
}

function inspectFile(file: string, bibliographyRoot?: string): string {
  const document = parse(readFile(file));
  const editable = getEditableDocument(document);
  return `title: ${editable.title === undefined ? "absent" : quote(editable.title)}\n${formatInspect(editable)}\n${formatNumbering(numberingReport(editable.blocks))}${formatCitations(resourceReport(document, file, bibliographyRoot))}`;
}

function inspectFileJson(file: string, bibliographyRoot?: string): string {
  const source = readFile(file);
  const document = parse(source);
  const editable = getEditableDocument(document);
  return `${JSON.stringify({
    ok: true,
    command: "inspect",
    revision: textRevision(source),
    title: editable.title ?? null,
    nodes: machineNodes(editable),
    numbering: numberingReport(editable.blocks),
    citations: resourceReport(document, file, bibliographyRoot),
  })}\n`;
}

function formatNumbering(report: ReturnType<typeof numberingReport>): string {
  return [`numbering: ${report.mode}`, ...report.diagnostics.map(diagnostic =>
    `warning: ${diagnostic.code} ${diagnostic.kind} (block ${diagnostic.path[0]})${diagnostic.enumerator !== undefined ? ` enumerator=${quote(diagnostic.enumerator)}` : ""}`)].join("\n") + "\n";
}

function resourceReport(document: Document, file: string, root?: string): CitationReport {
  const report = citationReport(document);
  return citationReport(document, readBibliographySources(file, report.bibliography, null, root));
}

function formatCitations(report: CitationReport): string {
  if (!report.bibliography.length && !report.citations.length) return "";
  return [
    ...report.bibliography.map(source => `bibliography ${quote(source)}`),
    ...report.citations.map(citation => `citation (block ${citation.path[0]}) role=${citation.role} keys=${JSON.stringify(citation.keys)} text=${quote(citation.text)}`),
    `citation readiness: ${report.readiness.status}; complete: ${report.readiness.complete}`,
    ...(report.references ?? []).map(reference => `${reference.text} (${reference.status})`),
    ...report.readiness.diagnostics.map(d => `${d.severity}: ${d.code}${d.source ? ` ${quote(d.source)}` : ""}${d.key ? ` key=${quote(d.key)}` : ""}${d.field ? ` field=${quote(d.field)}` : ""}`),
  ].join("\n") + "\n";
}

function formatInspect(document: EditableDocument): string {
  const markers = document.blocks.map(sectionMarker);
  const numbers = targetNumbers(document.blocks.map(blockTargets));
  // A heading's section is its half-open top-level block range [start,end). Numbers are the
  // computed numbers of the block's first equation, figure or table; they are never written.
  return document.blocks.flatMap((block, index) => {
    const [first, ...rest] = formatBlock(block);
    const section = typeof markers[index] === "number" ? snapshotSection(document, index) : undefined;
    const numbered = Object.entries(numbers[index]).map(([kind, number]) => `${kind}:${number}`).join(",");
    return [`${first}${section ? ` section=[${section.start},${section.end})` : ""}${numbered ? ` numbers=${numbered}` : ""}${"enumerator" in block && block.enumerator !== undefined ? ` enumerator=${quote(block.enumerator)}` : ""}`, ...rest];
  }).join("\n");
}

function formatBlock(block: EditableBlock): string[] {
  const path = formatPath(block.path);
  if (block.block === "heading") {
    return [`${path} heading level=${block.level} textEditable=${block.editable} text=${quote(block.text)}`];
  }
  if (block.block === "paragraph") {
    return [`${path} paragraph inlineEditable=${block.editable} text=${quote(block.text)}`];
  }
  if (block.block === "admonition") {
    return [`${path} admonition variant=${quote(block.variant)} text=${quote(block.text)}`];
  }
  if (block.block === "figure") {
    const captionPath = formatPath(block.caption.path);
    return [
      `${path} figure figureEditable=${block.editable} label=${quote(block.label)} image=${quote(block.imageUrl)} alt=${quote(block.imageAlt)} content=${block.contentKind}${block.mermaidSource !== undefined ? ` mermaid=${quote(block.mermaidSource)}` : ""}`,
      `  ${captionPath} caption textEditable=${block.caption.editable} text=${quote(block.caption.text)}`,
    ];
  }
  if (block.block === "equation") {
    return [`${path} equation label=${quote(block.label)} latex=${quote(block.latex)}`];
  }
  if (block.block === "table") {
    const cells = block.rows.flatMap((row) =>
      row.cells.map(
        (cell) =>
          `  ${formatPath(cell.path)} cell header=${cell.header} textEditable=${cell.editable} text=${quote(cell.text)}`,
      ),
    );
    return [`${path} table`, ...cells];
  }
  if (block.block === "list") {
    return [`${path} list${block.ordered ? ` style=${block.style ?? "decimal"} delimiter=${quote(block.delimiter ?? ".")}` : ""}`, ...formatListItems(block, 1)];
  }
  if (block.block === "quote") {
    return [`${path} quote inlineEditable=${block.editable} text=${quote(block.text)}`];
  }
  if (block.block === "footnote") {
    return [`${path} footnote label=${quote(block.label)} inlineEditable=${block.editable} text=${quote(block.text)}`];
  }
  if (block.block === "divider") {
    return [`${path} divider`];
  }
  if (block.block === "code") {
    return [`${path} code language=${quote(block.language)} code=${quote(block.code)}`];
  }
  if (block.block === "target") {
    return [`${path} target label=${quote(block.label)}`];
  }
  throw new Error("Unknown native block");
}

function formatListItems(list: ListContent, depth: number): string[] {
  const indent = "  ".repeat(depth);
  return list.items.flatMap((item, index) => [
    `${indent}${list.ordered ? `${(list.start ?? 1) + index}${list.delimiter ?? "."}` : "-"} text=${quote(inlineText(item.content))}${list.ordered ? ` style=${list.style ?? "decimal"}` : ""}`,
    ...(item.list ? formatListItems(item.list, depth + 1) : []),
  ]);
}

function formatPath(path: NodePath): string {
  return path.join(",");
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function readFile(path: string): string {
  return decodeUtf8(readFileSync(path));
}

function summarize(document: Document): string {
  const lines = ["structure valid"];
  for (const block of inspectDocument(document)) {
    const kind = block.kind ? `:${block.kind}` : "";
    lines.push(`${block.index} ${block.type}${kind}`);
  }
  return lines.join("\n");
}

function reportError(args: string[], error: unknown): number {
  if (args[0] === "check" && args.includes("--format") && args[args.indexOf("--format") + 1] === "json") {
    process.stdout.write(`${JSON.stringify({ ok: false, command: "check", validation: { valid: false },
      error: { ...writeIssueOf(error), ...(error instanceof NativeDocumentError ? { code: error.code } : {}) } })}\n`);
  } else {
    const issue = writeIssueOf(error);
    const hint = issue.code === "fixed-number-unrepresentable"
      ? " Enter equation content before setting the fixed number; in a batch, reorder those operations." : "";
    process.stderr.write(`${issue.reason}${hint}\n`);
  }
  return 1;
}

/** Run a synchronous command with the same output and error status as the executable. */
export function runCli(args: string[]): number {
  try {
    return main(args);
  } catch (error) {
    return reportError(args, error);
  }
}

/** Asynchronous command surface; synchronous commands keep the existing runCli API. */
export async function runCliAsync(args: string[]): Promise<number> {
  if (args[0] === "folder-trash" && !isCommandHelpRequest(args.slice(1))) {
    try {
      const processArgs = args.slice(1);
      const [target, ...tokens] = processArgs;
      const seen = new Set<string>();
      for (let i = 0; i < tokens.length; i++) {
        const flag = tokens[i];
        if (!["--root", "--host", "--check", "--revision", "--json"].includes(flag) || seen.has(flag)) throw new Error(commandHelp("folder-trash"));
        seen.add(flag);
        if (["--root", "--host", "--revision"].includes(flag) && (!tokens[++i] || tokens[i].startsWith("--"))) throw new Error(commandHelp("folder-trash"));
      }
      if (!target || target.startsWith("--") || !seen.has("--root") || !seen.has("--json")) throw new Error(commandHelp("folder-trash"));
      const input = { root: flag(tokens, "--root"), path: target, checkOnly: seen.has("--check") };
      const origin = optionalFlag(tokens, "--host");
      type Result = import("../../../apps/editor/shared/file-operations.ts").FolderTrashResult;
      type Request = import("../../../apps/editor/shared/file-operations.ts").FolderTrashRequest;
      const invoke = async (request: Request): Promise<Result> => {
        if (!origin) return executeFolderTrash(request, { remove: await osTrashAvailable() ? trashFile : undefined });
        const url = new URL("/api/folder-trash", origin);
        try {
          return await (await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) })).json();
        } catch {
          return { error: "The Host response was interrupted. Check the source folder and OS Trash before trying again.",
            receipt: { operation: "folder.trash", outcome: request.checkOnly ? "refused" : "uncertain", source: request.checkOnly ? "unchanged" : "unknown", checkOnly: request.checkOnly === true } };
        }
      };
      const revision = optionalFlag(tokens, "--revision");
      if (revision && input.checkOnly) throw new Error("--check cannot be combined with --revision");
      let result = await invoke(revision ? { ...input, expectedRevision: revision } : { ...input, checkOnly: true });
      if (!input.checkOnly && !revision && result.receipt.outcome === "success") {
        result = result.revision ? await invoke({ ...input, expectedIdentity: result.identity, expectedRevision: result.revision })
          : { error: "Folder contents could not be fully checked. Moving to Trash is unavailable.", receipt: { operation: "folder.trash", outcome: "refused", source: "unchanged", checkOnly: false } };
      }
      process.stdout.write(JSON.stringify(result) + "\n");
      return result.receipt.outcome === "success" ? 0 : 1;
    } catch (error) { return reportError(args, error); }
  }

  if (args[0] === "create" && args.includes("--input") && !args.includes("--version") && !isCommandHelpRequest(args.slice(1))) {
    try {
      const { file, flags, format } = parseCommandArgs("create", args.slice(1));
      if (flags.includes("--template") || flags.includes("--language")) throw new Error("--input cannot be combined with --template or --language");
      const input = flag(flags, "--input");
      const { DOCUMENT_REQUEST_MAX_BYTES } = await import("@litzio/plugin-sdk");
      if (fs.statSync(input).size > DOCUMENT_REQUEST_MAX_BYTES) throw new Error("Document payload exceeds 32 MiB");
      const source = readFileSync(input);
      if (source.byteLength > DOCUMENT_REQUEST_MAX_BYTES) throw new Error("Document payload exceeds 32 MiB");
      const { createAuthoredDocumentFile } = await import("../../../apps/editor/server/document-authoring.ts");
      const receipt = await createAuthoredDocumentFile(file, JSON.parse(decodeUtf8(source)));
      process.stdout.write((format === "json" ? JSON.stringify(receipt) : receipt.path) + "\n");
      return 0;
    } catch (error) { return reportError(args, error); }
  }
  if (args[0] === "app-reset" && !args.includes("--version") && !isCommandHelpRequest(args.slice(1))) return (await import("./app-reset.ts")).appResetCli(args.slice(1));
  if (["plugins", "operation"].includes(args[0]) && !args.includes("--version") && !isCommandHelpRequest(args.slice(1))) return (await import("./plugins.ts")).pluginCli(args);
  if (args[0] === "host" && !args.includes("--version") && !isCommandHelpRequest(args.slice(1))) {
    try { return await (await import("./remote-host.ts")).remoteHostCli(args.slice(1)); }
    catch (error) { return reportError(args, error); }
  }
  if (args[0] !== "assistant" || args.includes("--version") || isCommandHelpRequest(args.slice(1))) return runCli(args);
  try {
    const operation = args[1];
    if (operation === "import-image") {
      if (args.length !== 5 || args[3] !== "--source") throw new Error("Usage: assistant import-image <document> --source <absolute-image-path>");
      const { executeDocumentTool, documentFolders } = await import("../../../apps/editor/server/assistant-document-tools.ts");
      const { LOCAL_FILE_ACCESS } = await import("../../../apps/editor/server/file-access.ts");
      const result = executeDocumentTool("import_document_image", { path: args[2], source: args[4] }, { access: LOCAL_FILE_ACCESS, permissionMode: "full-access", folders: documentFolders([], "full-access", LOCAL_FILE_ACCESS) });
      process.stdout.write(JSON.stringify(result) + "\n");
      return "error" in result ? 1 : 0;
    }
    if (operation === "conversation" || operation === "answer" || operation === "delete") {
      const read = operation !== "answer";
      if (read ? args.length !== 5 || args[3] !== "--host" : args.length !== 7 || args[3] !== "--file" || args[5] !== "--host") throw new Error(commandHelp("assistant"));
      const origin = new URL(args[read ? 4 : 6]);
      if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Expected a Host origin.");
      const input = read ? undefined : JSON.parse(readFileSync(args[4], "utf8"));
      const response = await fetch(`${origin.origin}/api/assistant/conversations`, { method: "POST", headers: { "Content-Type": "application/json", "X-Litzio-Protocol": "4", Connection: "close" }, body: JSON.stringify(read ? { action: operation === "delete" ? "delete" : "resume", id: args[2] } : { ...input, action: "answer", id: args[2] }), signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Assistant conversation request failed.");
      process.stdout.write(JSON.stringify(result) + "\n"); return 0;
    }
    if (operation === "provider-log") {
      if (args.length !== 6 || args[4] !== "--host" || !["codex", "copilot"].includes(args[3])) throw new Error(commandHelp("assistant"));
      const origin = new URL(args[5]);
      if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Expected a Host origin.");
      const response = await fetch(`${origin.origin}/api/assistant/conversations`, { method: "POST", headers: { "Content-Type": "application/json", "X-Litzio-Protocol": "4" }, body: JSON.stringify({ action: "provider-log", id: args[2], provider: args[3] }), signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Provider log lookup failed.");
      process.stdout.write(JSON.stringify(result) + "\n"); return result.available === false ? 1 : 0;
    }
    if (operation === "settings" ? args.length !== 2 : operation !== "configure" || args.length !== 4 || args[2] !== "--file") throw new Error(commandHelp("assistant"));
    const host = createAssistantHost();
    try { process.stdout.write(JSON.stringify(await host.invoke(operation, operation === "configure" ? JSON.parse(readFileSync(args[3], "utf8")) : {})) + "\n"); }
    finally { await host.close(); }
    return 0;
  } catch (error) { return reportError(args, error); }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  let releaseResetGuard: (() => void) | undefined;
  try {
    if (args.length && args[0] !== "app-reset" && args[0] !== "help" && !findCommand(args[0])?.readOnly && !isCommandHelpRequest(args) && !isCommandHelpRequest(args.slice(1)) && !args.includes("--version")) {
      try { releaseResetGuard = new (await import("../../../apps/editor/server/reset-guard.ts")).ResetGuard().actor("cli"); }
      catch (error) { throw new Error(`Cannot acquire the app-reset writer guard: ${(error as Error).message}. This write command cannot run with restricted permissions. Edit the document file directly with the editing tool, then run litzio check.`); }
    }
    if (args[0] === "daemon" && ["run", "start", "stop", "status"].includes(args[1]) && !args.includes("--version") && !isCommandHelpRequest(args.slice(1))) {
      const { daemonCli } = await import("./daemon.ts");
      // Source checkout runs use an explicit Editor build; the distributable carries it beside cli.mjs.
      const editorDir = fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "../../../apps/editor/dist/" : "./editor/", import.meta.url));
      await daemonCli(args[1], args.slice(2), editorDir, fileURLToPath(import.meta.url));
    } else process.exitCode = await runCliAsync(args);
  } catch (error) {
    process.exitCode = reportError(args, error);
  }
  finally { releaseResetGuard?.(); }
}
