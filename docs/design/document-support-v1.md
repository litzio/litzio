# Native document support v1

- Status: Implemented
- Other tools' frontmatter fields: 2026-11-28 (#2059; kept uninterpreted with exact source lines, metadata operations replace only their own key's lines; Core tests).
- Minimal text escapes: 2026-11-28 (#2058; only escapes that keep the meaning or keep default MyST from reading a citation; Core `writer-bytes` tests and the full local-write corpus; contract after the line-start syntax rule below).
- Checklists: 2026-11-23 (#1893; Core admission/canonical/operation tests, CLI tests, Editor unit tests and the `list-authoring` and `external-checklist-paste` browser scenarios; [contract](#checklists-1893)).
- Line-start syntax: 2026-11-20 (#1846; a refused paragraph line that MyST reads as `+++`, `%`, `:::` or `(label)=` is escaped in a later write attempt; master-saved bytes pinned by Core `writer-bytes` tests).
- Paragraph tail normalization: 2026-11-04 (#1107; shared Core writes, CLI file workflow and Editor Save/Reload/assistant-send regressions).
- Template update: 2026-11-04 (#936 owner-approved optional `template: { name, description }`; [template contract](document-templates-v1.md)).
- Title update: 2026-10-29 (#722; optional single-line plain frontmatter title, no leading-H1 title inference).
- Fixed numbering: 2026-10-29 (#720 Core/CLI; [numbering contract](heading-numbering-v1.md#fixed-numbers-720)).
- Feature sample verification: 2026-10-28 (#528 localized folders, Core read-model coverage and canonical CLI check/format; Desktop replacement/preservation unit tests and development browser entry/captures; no local packaged Desktop run).
- Save diagnostics: 2026-10-28 (#578 phase 2; stable Core codes, CLI JSON pass-through and bilingual Editor guidance; [inventory](#save-diagnostic-codes-578-phase-2)).
- Mermaid Figure update: 2026-10-28 (#651 PR 1; Core/CLI source/admission/canonical contract; [Figure authoring](figure-authoring-v1.md#mermaid-figures-651-core-and-cli)).
- Empty structural elements: 2026-10-27 (#574; canonical forms and verification below).
- Documentation verification: 2026-10-26 (Open protection and implemented Editor label rename compared with the session/reference contracts and current code; no new browser execution).
- CLI insertion verification: 2026-10-15 (#280 Core body-end and CLI single/batch insertion tests; one-write and unchanged-file refusal).
- Last verified: 2026-11-16 — #1658: 샘플 수명·표 번호 숨김·Read/Text를 구현과 기존 테스트에 정적으로 대조했다. 제품·브라우저·Desktop 실행 재검증 없음.
- Previous verification: 2026-10-29 (#730 adjacent-list canonical boundaries, numbering/content preservation and stable reopen; Core regressions and Editor paragraph deletion through Host Save).
- Previous verification: 2026-10-24 (#366 citation-only and footnote-only list admission, update and canonical reopen; Core list regressions).
- Previous verification: 2026-10-22 (#332 citation roles and bibliography declarations; Core/CLI/Editor tests and browser Save → Reload, detailed in [Citations](citations-v1.md)).
- Previous verification: 2026-10-20 (#328: literal @ admission, canonical escaping and bracket shorthand refusal; Core/CLI tests and Editor save-path code inspection).
- Previous verification: 2026-10-19 (#255: the leading level-1 heading is the document title and stays first in Core operations; admission and format unchanged).
- Previous verification: 2026-10-17 (UX review: Core `hasNativeMarker` for the sidebar folder listing; Core native tests and the stable browser suite. Admission unchanged).
- Previous verification: 2026-10-15 (#271 strict Unicode/UTF-8 admission and unchanged-file refusal; #266 metadata locator refusal in Core operations and single/batch CLI; #232 native admission; #236 Open refusal Alert).
- Scope: Core, CLI and shared Editor Hosts; [ADR-0006](../adr/0006-native-document-boundary.md) and [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md).

## Text files in the Editor (#817)

The owner's [2026-10-31 decision](https://github.com/litzio/litzio/issues/817)
adds a separate text document kind: existing `.txt` files and `.md` files refused by
Core's existing native admission open automatically as text sessions. Under #939,
non-native `.md` defaults to view-only Markdown with a Read/Text toggle; `.txt`
continues directly in Text. Reading reflects the current unsaved source buffer
without changing admission, saving or recovery. Raw HTML is disabled; the limited
Markdown display and MyST limitations follow [Plain text mode](editor-ux-shell-v1.md#plain-text-mode-817). `.txt` is always
text, even with native-looking content. No Editor-side Markdown support rules are added.
Strict UTF-8 decoding still applies; unreadable/invalid-byte files and other extensions
are refused. New Document still creates only native `.md` through Core.

Native documents retain Core parse, operations, validation and canonical serialization.
Text documents have only a source string and revision, no Core read model or semantic
edits. Text Save writes the submitted string unchanged through File commit. It never
adds a marker, imports, converts (#501), formats or repairs content. Host checks the
path and current disk revision before replacing the file. The text editor stays mounted
after Save even if the new bytes pass Core admission. Open or Reload classifies them again.
Text Save can write to an admitted file at the matching revision, like an external text
editor. The structured-document validity guarantee applies to Core-backed writes.
See [session protection](editing-session-save-v1.md#text-editing-sessions-817).

Text editing has no CLI command or Core semantic operation.

## Contract

Core rejects unpaired UTF-16 surrogates before parsing source and before canonical writing, including string fields such as text, URLs, labels, code, metadata and nested options. Valid Korean, emoji and literal U+FFFD remain supported. CLI document/operations JSON reads and shared Host document/request text reads strictly decode UTF-8; malformed bytes are refused rather than replaced. A leading BOM retains the existing parse normalization rule. Refusal leaves original file bytes unchanged. This validation does not introduce a new semantic operation or CLI command.

Public `parse(source)` accepts an Litzio native document. It validates metadata and complete semantic structure, then performs canonical write preflight. It never returns a partially supported document. Public `serialize(document)` validates native semantics before and after canonical output. Existing serializer diagnostics, complete semantic fingerprints and round-trip guards remain mandatory. MyST fragment parsing is internal to Core operations and serialization.

HTML recognition remains enabled so unsupported HTML is refused instead of silently admitted as literal text. Public source diagnostics reach the URL recognizer even though automatic linkification is off. The [Parser security boundary](parser-security-v1.md) records the pinned URL/inline HTML backports, public API verification and removal conditions.

A native file may start with closed YAML frontmatter. When present it must be a mapping with valid YAML and unique keys. Litzio reads optional single-line plain-string `title`, `numbering`, `bibliography`, `template`, and `status`. The `litzio` key is preserved as an external field regardless of its value. Other top-level fields (plain scalar keys) belong to other tools: they are not interpreted and keep their exact source lines through every write (line endings become LF and a byte order mark is dropped, as for the whole file). A metadata operation replaces only the lines of the top-level key it changes, appends a new key at the end and removes only a deleted key's lines; when that does not read back as the edited YAML (for example a flow-style mapping), the whole YAML is written only if it has no fields of other tools. Otherwise the operation is refused with `native-metadata`, because a YAML reading cannot keep every value of another tool (a 64-bit integer, `1.0`, `0x1F`). Litzio's field names keep their rules when another tool uses them in another form: a block-scalar `title`, `status: deprecated` or a string `template` is refused with `native-metadata`. `template` contains exactly a non-empty single-line string `name` and a single-line string `description` (empty allowed); unknown/missing fields, nonstrings, line separators and YAML block scalar syntax are refused with `native-metadata`. `title` supports empty and single-line plain strings, preserving surrounding spaces and all accepted characters exactly. Line separators (LF/CR, VT/FF, NEL, U+2028/U+2029), YAML block scalar title syntax (`|`/`>` and their chomping variants), nonstrings, inline formatting and math are explicitly refused by operations, admission and final writes with `native-metadata` and single-line guidance; none are flattened. An absent title stays absent even when the body starts with H1. `numbering` accepts `headings: boolean`, `title: false`, and the [reference templates](heading-numbering-v1.md#reference-templates-445) for `figure`, `table` and `equation` (template string or template-only object); unknown keys and other per-kind options remain rejected. Omitting heading settings disables heading numbering; omitting a reference template uses its MyST default. `bibliography` is a non-empty sequence of relative `.bib` paths under the [citation declaration contract](citations-v1.md#bibliography-declaration-and-readiness); no resource is read. Custom starts and per-level numbering settings are unsupported. Heading prefixes remain unsupported. Accepted YAML comments and spelling survive body edits. Metadata never appears as an editable body block, but remains part of the Core snapshot: the first body block has path `[1]`. When the file has no frontmatter, Core reserves block zero in memory without shifting source lines. A body edit leaves frontmatter absent. Adding the first metadata field writes a YAML header.

```markdown
---
litzio: 1
title: My document
---

# First section

Body text.
```

Frontmatter retains the final YAML line terminator before its closing delimiter.
This matters beyond title: supported reference templates can contain block scalar
strings with meaningful trailing spaces/newlines. Parse and all metadata writes
preserve them independently of key order. Metadata edits retain the YAML library's
complete serialization; they do not trim scalar content. Canonical output still
uses LF and remains byte-identical on a second write.

`createDocument()` returns the minimal native document with no body blocks. An empty document, an empty Figure/table/admonition/quote/list item/equation and an unresolved cross-reference are permitted authoring states. Footnotes retain their existing completeness and write rules; see [Endnotes](footnotes-v1.md).

## Supported meaning

Support is decided from Core semantic structure and existing authoring helpers, not output-string equality or an Editor `editable` flag. Source evidence also enforces explicit syntax restrictions before parser normalization can hide unsupported input, including the table directive and option rules below.

| Content | Native boundary |
| --- | --- |
| Headings | H1–H6, non-empty supported inline content, no line breaks or additional attributes. |
| Paragraphs and inline content | Text, strong/emphasis/delete/code, ordinary links with non-empty content, inline math, supported subscript/superscript, footnote references, `{eq}`, `{numref}`, `{ref}` without custom display text, and explicit `{cite}`, `{cite:t}`, `{cite:p}` keys/groups. Existing inline nesting/round-trip restrictions apply. Distinct adjacent links with identical targets are unsupported. |
| Equation | Display math value (including empty), optional label and fixed `:enumerator:` string. Filled equations without label or fixed number use `$$` on separate opening and closing lines when the LaTeX reads back intact. Other filled equations use `{math}`. Empty equations use dollar fences and retain their optional closing-line label. Empty equations with a fixed number are permitted only as an intermediate operation state and refused at final canonical write. No `:enumerated: false` or arbitrary attributes. |
| Figure | Empty/pending, one image or one option-free non-empty `mermaid` directive, optional container label, fixed `:enumerator:` string and one supported inline caption. A top-level `![alt](url)` alone in its paragraph is a captionless Figure. A Figure with only an image URL and optional alt text uses this form if that one image line reads back with the same URL and alt text; otherwise that Figure alone keeps `{figure}`, for example a path with non-ASCII characters or spaces. Captions, labels, numbering options, pending Figures and Mermaid use `{figure}`. Numbering follows the [shared contract](heading-numbering-v1.md#fixed-numbers-720). Image links with titles, images in prose or links, and multiple images in one paragraph are unsupported. Alt text requires an image. Mermaid source is opaque. No legends, subfigures, mixed content or extra directive/image/Mermaid attributes. |
| Table | Rectangular GFM grid with a header row, supported inline cells with hard breaks, column alignment and optional table caption, note paragraphs, label and fixed number. Only plain GFM and the exact `{table}` directive are accepted for simple grids. Directive options may contain only `name` / `label`, `enumerator` and numbering visibility (`enumerated` / `numbered`), and any MyST VFile diagnostic within the directive's source range causes refusal, including duplicate/unknown options in colon-line or YAML syntax. `{csv-table}`, `{list-table}` and other table directives are refused with or without caption/Label. Canonical output uses a bare GFM grid unless the table has a caption, label, notes, fixed number or explicit numbering visibility. Numbering visibility and paragraph legends follow the [table format contract](table-caption-v1.md). Complex tables follow [ADR-0024](../adr/0024-complex-tables.md). |
| List | Ordered or unordered lists with supported paragraph content and supported nested lists; existing start and nesting rules. Ordered lists preserve style and delimiter under the [ordered format contract](#ordered-list-formats-734). A list retains at least one item. Each item may be empty, including a parent with only a nested list, or contain supported inline content such as text, a citation, footnote reference, math, code or semantic reference. This applies at every nesting level. Insert/update operations normalize whitespace-only content to empty content as described below. A [checklist](#checklists-1893) is an unordered list whose every item has a check state. No arbitrary nested blocks. |
| Code | Plain fenced code with the existing language contract; no captioned/directive variants. |
| Quote, divider, admonition | An empty quote or one supported paragraph; thematic break; all standard admonition kinds with an empty body or one supported paragraph. Top-level GitHub alerts with one supported paragraph map `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION` to `note`, `tip`, `important`, `warning`, `danger`. The marker occupies the first line and the body lines have explicit `>` markers. Escape the opening `[` for a literal quote. Write an eligible alert in GitHub syntax if it reads back unchanged. Empty boxes, other kinds and fallback forms use MyST directives. Custom titles/options and additional body blocks are unsupported. |
| Footnote and target | One non-empty supported paragraph per definition, no footnote references inside definitions; citations and document references are supported. Label targets and semantic references follow their existing contracts. |

Markdown images other than a top-level standalone image (see Figure above), checkboxes outside the [checklist contract](#checklists-1893), unsupported roles/directives, attributes or nesting reject the entire file. Alternative supported Markdown/MyST spellings may be accepted and normalized. No generic Markdown Import, automatic marker insertion, Migration, unsupported native read-only opening or block source replacement is provided. Separate plain text editing follows #817 above.

Bare `@name` (including `@kim` and `@param`) is literal text, as is already escaped `\@name`. Core disables MyST's shorthand citation extension at the parse boundary while keeping explicit roles parsed. In accordance with [ADR-0008 decision 3](../adr/0008-citations-and-bibliography.md#3-지원할-인용-형태), unescaped citation-like brackets such as `[@key]`, `[@a; @b]` and `[@key, p. 3]` are refused with `native-content` and guidance to use an explicit citation role or escape the opening bracket or the `@` for literal text. This applies to supported text surfaces including endnote definitions; actual links, code and math retain their syntax. Code or math inside such brackets, as in ``[`@param`]`` or `[$@key$]`, is still refused because default MyST reads the bracket as a citation; `\[` keeps it literal. Explicit `{cite}`, `{cite:t}` and `{cite:p}` roles follow [Citations](citations-v1.md), preserving exact keys, group order and narrative/parenthetical meaning. Prefix/suffix/partial and other unsupported attributes are refused.

## Paragraph leading indentation (#1160)

Core semantic writes and canonical serialization remove an initial run of ASCII
space (U+0020) and tab (U+0009) before paragraph content, including formatting marks.
Whitespace-only bodies retain their existing empty-body/admission rules.
These are Markdown indentation characters; arbitrary lengths in semantic input
are removed rather than encoded as `&#x20;`. Paragraphs in lists, quotes,
admonitions, endnote definitions and table notes follow the same rule; container indentation
and list markers remain structural. The run stops at any other character, hard
break or data-bearing inline atom (code, math, link, reference or citation).
NBSP and other Unicode spaces are excluded from cleanup: they are explicit text,
not Markdown indentation. Existing canonical refusal still applies where MyST
cannot round-trip them; this change does not widen their write support.
Interior whitespace, space-only tails, code blocks, headings, table cells and
captions (including Figure captions) retain their existing contracts. Existing
entities use ordinary parsing and the next canonical write; no migration is added.
CLI format and Core-backed Host writes share this rule without a new command.
Editor Save reflects prefix removal with Core's length calculation and ordinary
engine selection mapping, even when the caret is inside the removed prefix.

## Paragraph blank-line tails (#1107)

Core semantic writes remove a paragraph's trailing hard breaks or text line
separators and the whitespace-only suffix around them before applying the existing
lossless-write checks. The suffix must contain a line break; spaces without a line
break retain their existing rules. Interior breaks, actual text and formatting are
preserved. Data-bearing atoms, including code, math, references, citations and links
(even whitespace-only link labels), are not blank tails. No padding or invisible
placeholder is inserted. Canonical serialization and semantic fingerprints remain
strict; parsed documents are not repaired or normalized on admission.

This rule covers paragraph insert/update, split/merge/hard-break and generic text
edits, quote/admonition bodies, list items at every depth, Figure captions and
footnote/endnote definitions and table notes. If normalization empties the paragraph,
its owner's empty-content rule applies. Cells preserve explicit hard breaks, and table
captions and headings remain single-line.
Editor Save uses the same Core operations as CLI writes and reflects this Core cleanup in the live editor under the [Save selection/history contract](editing-session-save-v1.md#save-acknowledgement) (#1127). Existing CLI commands
expose the rule; no new operation or command is needed. Assistant sending supplies
only the active document path and excludes unsaved body content under the
[#1106 context contract](main-agent-v1.md#대화와-표시); it does not
serialize the editor's unsaved content or depend on Save normalization.

## Empty structural elements (#574)

Core admission and existing insert/update operations accept an empty body as an authored
structure. MyST's empty body has no paragraph child; Core creates that exact shape for
empty admonitions, quotes and list items, keeping the complete fingerprint guard intact.
No parse-time content removal or synthetic placeholder text is used.

For admonitions, quotes and list items at every nesting level, Core semantic operations
normalize content with no visible inline content to `[]` (#624). This includes generic
`replaceText` and `updateNodeTextAtPath` edits of the body, its paragraph or a text leaf:
Core removes an emptied paragraph from its supported structural owner. A nested list
survives when its parent item's paragraph becomes empty. All these paths share one inline
normalization function; unsupported structures are never normalized away. The existing visibility
predicate treats spaces, tabs, newlines and other JavaScript `trim()` whitespace, including
whitespace inside formatting-only marks and break-only content, as empty. Links retain
their URL and optional title even when the label contains only whitespace. Citations,
semantic references, footnote references, inline math and inline code also remain meaningful
without a plain-text node and are not removed. The shared `structuralInlineContent` rule
in Core's inline boundary also checks native admission, so a saved whitespace-label link
can reopen without a separate parser policy. No parsed content is removed or normalized.
The pinned writer round-trips space/tab/newline/break link labels with destination data.
If link formatting cannot round-trip (for example a bold whitespace-only label becomes
literal `** **`), the existing lossless-write guard refuses with a reason and corrective
action; file writes leave the original unchanged. If any meaningful content remains, the
[paragraph blank-line tail rule](#paragraph-blank-line-tails-1107) applies before the
existing content normalization and lossless-write checks. Editor and CLI share these operations; neither applies
its own whitespace rule. Heading, footnote and endnote empty-content restrictions are
unchanged. Native structural shape rules and the full canonical round-trip guard are unchanged.

| Element | Canonical empty form | Filled form |
| --- | --- | --- |
| Standard admonition | `:::{note}\n:::` (its selected kind) | Existing standard directive with one paragraph |
| Quote | `>` | Existing Markdown quote |
| Bullet list item | `-` | `- text` with continuation lines indented to the item's content |
| Ordered list item | `3.` (its start) | Existing numbered list |
| Checklist item | `- [ ]` (its check state) | `- [ ] text` / `- [x] text` |
| Equation | `$$\n$$` | Dollar fences on separate lines when the LaTeX round-trips, otherwise `{math}` |
| Labeled equation | `$$\n$$ (eq-empty)` | Existing `{math}` with label option |

The pinned MyST parser reads an empty `{math}` directive as `mystDirectiveError`.
Dollar math retains an empty value and an optional label (including Korean). MyST's
derived `html_id` is admitted only when it equals the identifier-derived value; the
existing fingerprint rule ignores only that derived value. Other fields still fail closed.
Some directive labels cannot retain identity in empty dollar math: `A B` changes its
identifier from `a b` to `a-b`, and `a)b` / `a$b` do not parse as that equation.
These writes fail with a located write error instructing the user to enter content,
remove the label, or choose a compatible label. The original file remains unchanged.
All equations retain the existing official number, including when empty.

An empty equation may retain an authored fixed number during editing operations. Only final
canonical write refuses it with `fixed-number-unrepresentable` and asks the author to enter
equation content or clear the fixed number. MyST 1.7.4 rejects an empty `{math}` body, while
`$$` has no directive options. No dummy LaTeX or parser extension is used. An empty equation
without an enumerator remains savable, including in a fixed document (a nonblocking missing-number
warning). Editor Number input follows the existing property draft/Apply/Cancel contract;
the existing Save error path presents the content-or-clear guidance in English and Korean.
Numbering consistency warnings are displayed separately and never disable Save.
The [fixed-number contract](heading-numbering-v1.md#fixed-numbers-720) defines the distinction.

Existing CLI input paths share Core's rules, including empty `--text`, `--latex` and
list content arrays. No new empty-element commands are added: the existing operations
already express these states. Migration and stored-data compatibility are out of scope.

## Interfaces and errors

- Label rename (#216): `update-label --update-references true` calls Core `updateLabel` with `{ updateReferences: true }` for an existing Equation/Figure/Table/section label. It atomically updates only references previously resolved to that target, preserving display content and refusing conflicts or meaning changes; omission/`false` keeps references untouched. Single edits and `apply-batch` share this option. [Section references](section-references-v1.md#opt-in-label-rename-with-references-216) defines resolution, implicit heading IDs and refusals. The implemented [Editor entry point](section-references-v1.md#editor) uses this Core opt-in for non-empty label renames. Native admission is unchanged.
- Equation authoring: `insert-equation <file> --at <index|end> --latex <latex> [--label <label>]` composes Core `insertEquation` and `updateLabel` in one edit and one file replacement. Empty LaTeX is supported; the shared [label collision rules](section-references-v1.md#core), including implicit heading IDs, apply; failures preserve the original. Single commands and `apply-batch` share this contract (#280).
- Top-level body insertions accept CLI `--at end`, resolved by Core `bodyEndIndex(document)` before trailing endnote definitions. Without endnotes it is after the last body block; a new empty native document returns 1. Numeric positions, including the metadata refusal below, retain their existing rules. The command scope and batch behavior are in [CLI batch application](filesystem-host-boundary-v1.md#cli-batch-application-215).
- The [document title](document-editing-v1.md#document-title-255) is optional frontmatter `title`, exposed by `EditableDocument.title` and changed through Core `updateDocumentTitle` / CLI `update-title`. It has no label/reference. Every H1–H6 is a body section; no positional title restrictions or implicit promotion apply.
- Body operations reject top-level index `0` and paths starting with `0` at Core operation time: `block 0 is the document metadata; body blocks start at 1`. This includes insertion, movement, removal and section operations. Metadata stays at snapshot index `0`; body indices and paths are not renumbered for interfaces. Single CLI edits and Editor receive the same Core guidance; `apply-batch` wraps it as `operation N (command): <reason>; nothing was written`. Refusal preserves original file bytes and never falls through to metadata or round-trip errors.
- Core native errors use `native-metadata` and `native-content`. All explicit write validation guards also carry a stable `WriteIssueCode` through `canonicalWriteIssue` / `writeIssueOf`, alongside the original English reason, action and snapshot path/source line where identified. Unknown exceptions have no code. The [diagnostic inventory](#save-diagnostic-codes-578-phase-2) defines the code families.
- CLI `litzio create <file>` accepts optional `--template <name|id>` and `--language <ko|en>` under the [template contract](document-templates-v1.md), and exclusively creates a new `.md` file. It never overwrites. Without `--input`, parent directories must already exist; authored `--input` creation follows the parent-directory rules below. Shared `createDocumentSourceFile` creation (empty/template/assistant/plugin-authored documents) uses `file-commit.createFile`: write and fsync a temporary sibling, then exclusively publish it with a hard link. Partial writes leave no destination or temporary sibling; existing names are never replaced. Filesystems without hard-link support fail without a direct-write fallback. `check` returns a failing exit code for rejected files; JSON failures contain `ok: false`, `validation.valid: false` and `error` diagnostics, without a document model. `inspect`, `format` and editing commands use the same admission and preserve rejected file bytes.
- Markdown fragments (#1843): Core `readMarkdownFragment(markdown)` reads Markdown text as the whole body of a native document, through the same admission and canonical round-trip as Open. It returns the editable body blocks, the referenced endnote definitions and whether formatting was found, or nothing when any part is not native content or is source the parse consumes without editable content (link reference definitions, MyST comments, block breaks); it never returns part of the text. Canonical write is unchanged. The Editor's [plain-text Markdown paste](document-editing-v1.md#plain-text-markdown-paste-1843) uses it; pasting is an editor input interaction, so no CLI command is added.
- Shared Host native Open/Reload/Save/Source and asset creation use Core admission; Core-refused `.md` and `.txt` opening follows the separate text kind above. Vite, HTTP and Desktop do not implement separate syntax decisions. Failed Open/Reload retains the current document, selection, unsaved content and drafts; startup failure has no document installed. Filesystem permissions and revision conflicts remain independent checks.
- Editor explicit Open (sidebar file selection and the start screen's sample action) shows a modal Alert for Host errors whose code is `native-*`. It names the rejected file, displays Core's reason and corrective action, and states that the current document has not changed (or that no document opened). One OK button or Escape closes it and returns focus to the opening control. The same refusal is not repeated in the top error message. Other Open failures, startup failures and Reload failures retain their existing error presentation. Open/New preserves existing unsaved sessions in tabs; operation guards and Close confirmation follow the [session protection contract](editing-session-save-v1.md#switching-and-recovery).
- Choosing a folder (Open folder…) lists names without reading document contents. A sidebar listing may return a positive `litzio: 1` prefix hint for Markdown. Unmarked or unreadable Markdown has no hint and `.txt` has a text-only hint. Open uses full Core validation. A refusal Alert displays Core's reason and action when the file cannot be opened.
- Whole-document Source previews the applied native document through Core without writing. It retains visual editor state and unapplied property drafts. `replaceBlockSource`, CLI `replace-block-source`, Host source-apply/replay and Editor Edit source are removed.

## Save diagnostic codes (#578 phase 2)

Codes identify the failing check, independently of UI language, English wording, Editor types,
transport and filesystem. `writeIssueOf` preserves the outer reason and the first structured
Core diagnostic in its cause chain. `DocumentDiagnosticError` supplies a code to guards that
previously threw plain errors; existing actionable `DocumentWriteError` checks retain their
actions and locations. `NativeDocumentError.code` also appears in its `WriteIssue`. No predicate,
support boundary, canonical guard or write order changes.

The pre-implementation refusal inventory covers native admission/metadata, tree shape, operation
input and snapshot guards, inline validation, empty required content, structural block validators,
labels and reference rewriting, Unicode, endnote integrity, writer diagnostics/exceptions and
both whole-document and operation-specific round-trip comparisons:

| Stable code | Existing refusal checks |
| --- | --- |
| `native-metadata` | Invalid YAML, unsupported metadata, numbering or reference templates. |
| `native-content` | Unsupported native blocks, attributes, inline nesting and citation shorthand. |
| `invalid-structure` | Invalid root, missing node type, invalid children array. |
| `invalid-operation` | Wrong operation argument/type, path/index/offset, stale value, illegal block order or structural operation. |
| `unsupported-content` | Unsupported inline kinds/formatting, block shapes, list/code/citation content and writer diagnostics. |
| `empty-content` | Required paragraph/heading/endnote text is empty, or a split would create an empty persistent paragraph. |
| `round-trip-mismatch` | Fingerprint loss, operation content/canonical instability, or changed block boundaries. |
| `serialization-failed` | Writer throws without a specific serialization diagnostic. |
| `invalid-unicode` | Unpaired UTF-16 surrogate, including an unrepresentable text split. |
| `invalid-label` | Invalid/unreferenceable target or endnote label syntax, or an empty equation label that dollar math cannot preserve. |
| `label-conflict` | Label collides with another target, including automatic heading IDs. |
| `invalid-reference` | Unsupported reference/target notation, ambiguous rename or changed reference resolution. |
| `invalid-footnote` | Missing, repeated or unused definition, nested endnote reference or invalid endnote relationships. |
| `line-break` | A heading or caption contains a line break, or a structured table cell contains a literal newline instead of an inline break node. |
| `table-cell-whitespace` | Leading/trailing cell whitespace. |
| `table-shape` | Missing columns, ragged grid or invalid column alignment. |
| `invalid-figure` | Invalid image/alt/Mermaid/caption property combination. |
| `fixed-number-unrepresentable` | Final write of an empty equation retaining a fixed number; enter equation content or clear the fixed number. |

Read-model invariant exceptions in `editable.ts` and unexpected upstream/runtime errors remain
uncoded; the existing generic guidance applies. Supported unresolved document references remain
an authoring state, not a save error. File/revision/transport failures retain their own phases.

Numbering consistency diagnostics use a separate warning family: `numbering-missing` and
`numbering-duplicate`. They carry kind and snapshot path, never throw, and never gate writing.
They are not `WriteIssueCode` values. See [fixed numbering](heading-numbering-v1.md#fixed-numbers-720).

CLI `check --format json` passes Core `WriteIssue.code` through the existing `error` object,
including non-native serialization refusals; its JSON envelope and exit status are unchanged.
No new command or semantic operation is introduced. Editor collection guards tag the same code
families at their existing checks without inferring codes from prose. Host forwards the code
as `failure.code`, retaining submitted block/cell/path and original diagnostics. The localized
[Save guidance](editing-session-save-v1.md#diagnostic-guidance-578-phase-2) is presentation only.

Multiple refusal collection is **not included**. Editor collection can fail before a replay
payload exists; Host replay performs dependent label clearing/reassignment, merges/splits,
insertions, cell reshaping and ordering. Core's native/serialization checks validate a complete
snapshot and stop at the first failure. Running each edit against the opening snapshot would
reject valid dependent edits and mislocate later blocks; continuing after failure would create
secondary errors. A separate Core validation pass over the proposed final semantic document is
required. No sequential replay continuation or duplicate Editor semantics is added. The existing
list-shaped highlighting/navigation contract is unchanged.

## Canonical output and compatibility

### Local canonical output (#1983)

The [Editor Host Save path](editing-session-save-v1.md#빠른-저장-1983) can splice one
top-level block into confirmed canonical source with a YAML header. Files without a header use full Save. Core requires an exact match to the
first canonical write attempt, because document-wide retries can change escaping
outside the edited block. It uses the existing semantic operation and writer on one
single-line paragraph or a table with one changed cell. Paragraph inline content is
limited to ordinary text, supported emphasis marks, code, single-line math and simple
HTTP(S) links. Table edits allow plain cell text and single-line math.

Unknown spans, list neighbours, endnote references, reference definitions or targets,
unsupported inline syntax, multiline prose and complex tables ([ADR-0024](../adr/0024-complex-tables.md): cells with start columns and blocks) use full Save. These exclusions protect
against list continuation, document-wide reference binding and endnote relocation.
Core rereads the changed block and its existing neighbours, compares their exact
boundaries and meanings, and preserves source outside the replacement. Structural,
title, label, numbering and metadata edits use full Save. Any inconclusive check also
uses full Save. [ADR-0006](../adr/0006-native-document-boundary.md#amendment-국소-정규-저장-1983)
defines the temporary interval between local commit and full readback.

Canonical lists use `-` and one space after each nonempty item marker, including
numbered items. Adjacent unordered lists alternate `-` / `*` to retain separate
boundaries. The writer also uses `*` when empty nested items would form a thematic
break. Ordered delimiters retain their
meaning: when two ordered siblings use the same delimiter, the second receives a
style line, including `{style=decimal}` for the default. Different delimiters already
separate lists. Starts, kind, items and nesting survive repeated byte-stable writes.
This also applies to the internal writer's nested flows; Native List v1 still permits
at most one nested list per item. No serializer guard is relaxed.

#### Loose and tight lists (#2064)

An ordinary Markdown list is loose when a blank line separates two of its items
or two direct blocks in one item. Each nested list has its own spacing. Core reads
both mdast spread fields and exposes optional `loose: true` per list in the
editable model, `inspect --format json`, and list authoring input. Omission
defaults to tight. Checklists and complex-table cell lists keep their existing
formats.

Canonical writing keeps the list's loose or tight rendering. It prefers a blank
line between items in a loose list and can retain the original inner separator
when that spelling fails the full round-trip check. A single-item list can be
loose only if it has two direct blocks. Separators required before a nested
marker, such as a non-1 number or an empty dash, remain. The round-trip
fingerprint compares looseness independently at each list level.

Adding or removing an item retains the spacing of its surviving list. An item
moved by indent or outdent takes the destination's spacing. New lists and new
sublists default to tight. The Editor provides spacing preservation on save.

### Ordered list formats (#734)

`ListContent` accepts ordered-only `style` (`decimal`, `lower-alpha`, `upper-alpha`,
`lower-roman`, `upper-roman`) and `delimiter` (`.` or `)`). Omitted values mean
`decimal` and `.`. The editable projection omits these default values; Core node
creation and parsing record both effective values, and the complete fingerprint
checks both. Bullet lists reject either field. Start bounds and nesting stay unchanged.
The existing CLI `insert-list` / `update-list --list` JSON calls these Core operations;
`inspect` exposes the format, including nested content, with effective top-level defaults.

The saved form uses Python MyST's `attrs_block` spelling on its own line immediately
before a numeric Markdown list (an optional blank line is accepted):

```markdown
{style=lower-alpha}
3) Third clause
4) Fourth clause
```

Non-decimal styles always receive this line. Decimal omits it unless needed for an
adjacent boundary. Numeric source markers retain their delimiter. Direct `a)` source
syntax and typing input rules are outside this contract. This is a local extension
of the pinned **JS** MyST schema, not an official JS MyST list field. It supports only
the five style values, unquoted or double-quoted, rather than general block attributes.

`patches/myst-parser@1.7.4.patch` reuses markdown-it's list rule to read this subset
and retain the token delimiter. `patches/myst-to-md@1.0.17.patch` delegates list bodies
to the existing writer, chooses the semantic delimiter per list and inserts style
lines for formats/boundaries. It retains `bulletOther` from #730, replacing ordered
delimiter alternation. Remove these patches when upstream supports the same semantics
and the format, adjacency and canonical round-trip regressions pass without them.
No markdown-it version override is introduced. First-stage cross-checks against
Python MyST-parser 4.0.1 confirmed boundary, style, delimiter and start for all ten
formats, non-default starts, adjacency and nesting. External HTML/PDF output is outside
this change; the Editor's display/interaction is defined in [Editor UX Shell](editor-ux-shell-v1.md#unified-action-menus-516).

### Checklists (#1893)

A checklist is the third list kind beside bullet and numbered lists: an unordered list
whose every item has a check state (checked or not). `ListContent` marks it with
`checklist: true`, and each of its items carries `checked`; other lists and their items
have neither field. Insert/update input may omit an item's `checked` (unchecked); the
editable projection and `inspect --format json` always give it. A checklist item holds
the same content as any list item: zero or one paragraph and at most one nested list.
Nesting follows the existing rule in both directions: a checklist item may hold a bullet,
numbered or checklist list, and any list item may hold a checklist.

The saved form is tight GFM task-list syntax, `- [ ] text` and `- [x] text`, with
the `-` / `*` alternation for adjacent
unordered lists and nested items indented as in other lists. An empty item is the
checkbox alone (`- [ ]`). Alternative spellings are accepted and normalized: `*` or `+`
markers, `[X]`, and extra spaces after the checkbox. An escaped `\[ ]` stays text in an
ordinary bullet list.

Native admission refuses these checkbox shapes with a `native-content` reason that names
the shape: a checkbox on a numbered item (`1. [x] …`), a list where only some items have a
checkbox, and checklist items separated by blank lines (myst-parser reads checkboxes only
in tight lists). `parse()` still reads such Markdown; only native admission refuses it.

`myst-to-md@1.0.17` has no task-list writer and drops `listItem.checked` (#103). The
write-only clone writes each checkbox as raw text before the item's prepared inline content
and keeps checklists tight; the serializer diagnostics and the complete semantic
fingerprint still guard every write. Two pinned parser patches make the written form read
back as the same tree: `markdown-it-task-lists@2.1.1` reads a checkbox alone as an empty
task item, as GFM does, and `myst-parser@1.7.4` keeps no empty text node in front of an
item's formatted content. See the [dependency patch register](../contributing/dependency-patches.md).

Core `updateListItemChecked(document, path, item, checked)` checks or unchecks one checklist
item without rewriting the list: `path` is the top-level list and `item` the item's index in
that list, then in each nested list below it. CLI `insert-list` / `update-list --list` take the
same `ListContent` JSON, and `update-list-item-checked <file> --path <list> --item <indexes>
--checked <true|false>` calls the new operation, with the existing dry-run, batch and
unchanged-file refusal contracts. Switching a list between bullets, numbers and checkboxes is a
whole-list `updateList`, as between bullets and numbers. The Editor interaction is in
[Continuous editing](document-editing-v1.md#lists-and-checklists).

The [v0.1.0-beta.1 candidate release record](../releases/v0.1.0-beta.1.md) summarizes compatibility and behavior changes since beta.4. That record describes compatibility for the candidate build.

Files use UTF-8 and canonical LF line endings. CRLF/mixed input is normalized. A leading UTF-8 BOM is removed; U+FEFF elsewhere is content. Straight and curly quotes retain their meaning. Canonical output is semantic preservation, not byte preservation. Literal dollars and context-sensitive math retain the existing MyST boundary corrections.

Paired double tildes (`~~text~~`) and the MyST `{del}` role both read as strikethrough. The canonical writer prefers double tildes and falls back to the role where the delimiters cannot preserve the marks and text. The pinned MyST reader treats single `~` delimiters as text. Escape literal runs of two or more tildes when they would form syntax.

Inside GFM table cells, inline code and math pipes receive one additional backslash
on write; MyST removes it before inline parsing. Exact authored strings, including
existing backslashes, and column alignment survive reopening and repeated saves.
Outside cells, serialization is unchanged. The [table contract](table-caption-v1.md#cell-code-and-math-preservation-622)
defines the scope; the complete semantic guard remains mandatory.

The canonical writer escapes literal `@` where the pinned MyST citation rule would interpret it as a citation, so external MyST parsers also read the saved text literally. Email text such as `a@b.com`, URL contexts and link display text do not gain unnecessary escapes. Semantic text supplied by Core operations (including CLI and Editor edits) is already literal; bracket-shaped text entered through those operations is escaped on write rather than treated as source citation shorthand. Existing semantic fingerprints and round-trip refusal remain mandatory. No new operation or CLI command is needed.

CommonMark closes or opens `*`/`**` next to inner punctuation only when the outer neighbour is whitespace or punctuation, so a Korean particle or any letter or digit touching the mark would leave literal asterisks (#1820). When a strong or emphasis starts or ends with punctuation (ASCII punctuation or Unicode P/S) and the touching outer character is neither whitespace nor punctuation, the canonical writer writes that one outer character as an uppercase hexadecimal character reference, one code point per reference: `**정확도(Accuracy)**&#xB97C; 본다`, `값&#xC744;**(정확도)** 본다`. The text and marks read back unchanged in Litzio, other MyST tools and CommonMark 0.31 renderers; only the source shows the reference. Native files containing such references are admitted and keep them on repeated saves. A reference after a line ending keeps that line ending, and `@`/`$` after it are escaped as usual. A character whose reference does not read back as itself (control characters), or one directly after a hard break or after spaces ending a line, is left unencoded: a symbol edge then saves as before, and a punctuation edge is still refused. Counting Unicode symbols as punctuation makes markdown-it 13 and CommonMark 0.31 readers agree on marks such as `**값→**`. This follows mdast-util-to-markdown 2.x. Adjacent marks share one `*` run, which may not close the first mark and open the second when punctuation meets a letter or digit (#1831). The pinned markdown-it 13 also counts only ASCII and Unicode P punctuation, one UTF-16 unit at a time, so a symbol or supplementary character touching a punctuation edge leaves literal asterisks there (`**(a)**😀`). The writer always writes `*` with the references above first and keeps that output whenever the pinned reader reads it back unchanged, so `**굵게***기울임*`, `**→***b*` and `**값→**😀` keep their bytes. Only when that is refused and such a boundary exists does it write once more: the later mark of each mixed pair as `_` or `__` (`**정확도(A)**_를_ 본다`, `*값*__(를)__ 본다`), a letter or digit right after `_` as a reference because `_` cannot close inside a word (`**정확도(A)**_를_&#xBCF8;다`), and an outer character as a reference where markdown-it 13 alone fails (`**(a)**&#x1F600;`, `**(a)**&#x2192;`); this second write also counts markdown-it 14.1, which judges the same UTF-16 unit with symbols as punctuation. Chains of three or more adjacent marks are not switched, and a document with adjacent marks whose touching characters the readers class differently (`**→***a.*`) gets no second write. If that is also refused, the first refusal stands. Author-written `**…**를` source is not rewritten: it is read as literal asterisks, as other MyST tools read it.

Paragraph text can start a physical line (a paragraph's first line, or after a soft or hard line break, also inside marks and links) with characters MyST reads there as block syntax: a block break `+++`, a comment `%`, a colon fence `:::` or a whole-line target `(label)=` (#1846). The plain write leaves such text as it is and the reload would turn it into a block, so it is refused. The canonical write then makes one more attempt, after the mark attempt above: on each such line start the pinned parser reads as a block, the first character is written with a backslash escape (`\+++`, `\% 주석`, `\:::`, `\(label)=`). These are ASCII punctuation escapes that the pinned myst-parser, mystmd, Sphinx's MyST and GitHub all read back as the same character. A line ending before the escape is written with it (a hard break as `\` and a line ending). Text the parser reads as text is not escaped, so `(측정)=` keeps its bytes even in a document that takes this attempt. Table captions are written on the directive line and are not line starts; headings forbid line breaks, and table-cell breaks use inline tags on the same physical source line. Role content (such as `{sub}`) is raw source and is not escaped, so such text inside a role is still refused. As with the mark attempt, a document the plain write keeps never takes this attempt, and if it is refused as well the first refusal stands. A `$` or `@` escape directly after a line break keeps its existing refusal.

Text escapes are written only where a reader could take the character as syntax (#2058). Upstream mdast-util-to-markdown escapes every `_`, `[` and `&` in text, `(` after `]` and `#` at a line start; the canonical writer instead leaves an underscore between ASCII letters or digits (`snake_case`), brackets (`[[Page]]`, `[!x]`, `[x]`), an ampersand that is not a terminated character reference (`R&D`, but `\&amp;`) and a line-start `#` that cannot open a heading (`#tag`, but `\# a`) unescaped, and escapes a literal `$` only where the pinned dollar-math rule would open math (`\$5 and $10`). `[` stays escaped before `^` or `@` and at a line start before a task marker, and every bracket in a block that holds a literal `@` stays escaped, because default MyST reads `[... \@key ...]` as a citation. A block keeps these narrowed escapes only when the whole document reads back with the same meaning and that block reads as no literal syntax, citation shorthand included; otherwise that block is written with the upstream escapes, through the same per-block fallback as the other conventions above. That fallback names every block whose reread differs (while the block count still aligns) or reads as literal syntax, and rewrites only those, accumulating newly named blocks for at most two retries; only a refusal that names no further block writes every block that tried a convention as before. An author's unneeded escape such as `\_` is not meaning and is not kept on a full save.

Desktop sample copying, versioned preservation, preparation failures and the development Editor copy follow the [sample distribution contract](desktop-distribution-v1.md#native-sample), implementing [ADR-0016 sample lifetime](../adr/0016-shared-local-daemon-host.md#④-샘플-문서-수명). HTTP Host has no sample offer. The compatibility notice is in the [v0.0.1-beta.4 release record](../releases/v0.0.1-beta.4.md); published beta.3 history is unchanged. Core applies this contract independently of external MyST frontmatter validation.

## Verification

Core tests own optional frontmatter, YAML validity, supported content and semantic round-trip rejection. CLI tests own exclusive creation, structured failures and unchanged bytes. Shared Host tests own admission, revision conflicts and atomic file replacement. Browser tests own real Save → Reload, native admission state retention, Source, numbering and independent property drafts. Production HTTP and packaged Desktop tests exercise their deployment boundaries. Parser security and whole-document semantic-loss guards remain in place.

## Block semantic comparison (#1201)

`compareDocuments(before, after)` accepts two opaque native Core Documents and returns
`{ changes, documentChanged }`. Each change has `kind: added | removed | changed`,
optional `before` / `after` snapshot-local NodePaths, and textual `details` including
changed level, inline content/marks/link destinations, equation source and attributes,
figure path/caption or Mermaid source. A table is one block, including its rows, cells, caption and notes.
No engine types, source edits, persistent block identity or write operation are involved.

Comparison reuses the canonical round-trip semantic fingerprint and jsdiff block
sequence matching. Source whitespace, mark nesting order and canonical table syntax
are not changes in meaning. Moves remain removal plus addition; only same-position singleton 1:1
replacement runs are paired, for equal block kinds whose fingerprints do not occur
on the other side and whose payload text shares at least 50% of the longer payload
(using jsdiff diffChars, 100ms timeout). Payload excludes schema/field names. Ambiguous replacement runs remain removed/added. Frontmatter YAML
values compare separately (`documentChanged`); comments and key order do not count.
Paths are valid only within their own input snapshot and never identify a persistent block.

Bounds: at most 10000 blocks total, 2000000 UTF-16 fingerprint units, and a 500ms
jsdiff timeout. Refusal throws; callers must explain the failure and retain source
comparison. Fingerprinting/parsing are outside the jsdiff timeout. This is a bounded
first implementation, not a measured two-Editor rendering budget.

The shared Host operation `executeCompareOperation({ before, after })` takes supplied
native source strings (combined maximum 1000000 UTF-16 units), without reading paths
or accessing a live editing session. `POST /api/document-compare` and
`litzio compare <before> <after> --json` use this same executor. CLI reads both UTF-8
files and prints the complete result; HTTP takes source strings. Both preserve Core
refusals and return `before` / `after` editable projections plus
`receipt: { beforeRevision, afterRevision }` (source revision hashes). Receipts are
returned only and are not persisted. Neither interface writes documents, recovery
records, acknowledged revisions or assets. Images compare paths/attributes; this
operation does not preserve historical image bytes or establish pixel equality.

The Core foundation PR supplied Core/Host/CLI only. The owner-selected pre-save
Visual/Source UI is defined in [Editing session and Save](editing-session-save-v1.md#pre-save-visual-comparison-1201).
Recovery reuses that same Visual/Source display with its existing dry-run contract
([recovery Visual comparison](editing-session-save-v1.md#recovery-visual-comparison-1201)).


#1203 review measurements (reviewer supplied, 2026-11-05): plain 2000/5000 blocks
approximately 293/585ms; mixed 2000 blocks 608ms; mixed 5000 blocks refused after
approximately 1.83s at the fingerprint budget. These include work outside jsdiff's
timeout and are observations, not a latency guarantee. Core tests protect both
block-count and fingerprint-size refusal. UI rendering requires separate measurements.

## 공식 JSON 읽기 출력

CLI `inspect --format json`의 `nodes`는 Core `getEditableDocument`의 인라인 구조를 그대로 노출한다. 문단·제목·인용·주의 상자·미주 정의·그림 caption 노드·표 cell 노드는 `content: InlineContent[]`를 제공한다. 표 캡션은 table 노드의 `caption`, 표 주석은 문단별 `InlineContent[]`를 담은 같은 노드의 `notes`, 목록은 `items[].content`와 재귀적인 `items[].list`로 제공하며 체크리스트는 `checklist: true`와 항목마다 `checked`를 함께 준다. 빈 인라인 내용은 빈 배열이다.

`text`는 기존 표시·요약 소비자를 위해 유지한다. `content`가 구조 보존과 재작성의 입력이며 `text`에서 서식이나 원자를 추론하지 않는다. 인라인 서식, 첨자, 수식, 코드, 링크, 참조, 미주 표시는 Core 타입 그대로다. 경로는 해당 revision의 locator다. 번호 등 파생 표시 필드는 저장 의미가 아니다. JSON 투영은 Core 공용 `machineNodes`를 CLI·Host·SDK가 함께 사용한다. 비서의 `read_document`는 원문과 revision을 반환하며 별도의 의미 투영을 만들지 않는다. 비서가 JSON 구조를 필요로 하면 같은 CLI를 사용한다.

## 문서 글자 수 (#2041)

Core `countDocumentCharacters(readModel)`은 문서 본문의 grapheme 수를 반환한다. 본문 제목·문단·인용·콜아웃, 중첩 목록, 표 셀·캡션·주석, 그림 캡션, 미주 본문, 인라인·블록 코드를 포함한다. 링크는 표시 문구를 센다. 문서 설정과 frontmatter 제목 등 메타데이터, URL·대체 텍스트·레이블, 인라인·블록 수식, Mermaid 원문, 자동 번호와 인용·참조 마커는 제외한다.

서식 조각을 이어서 grapheme을 나눈다. 조합형 한글과 결합 이모지는 각각 한 글자다. Unicode `White_Space`로 구성된 grapheme은 공백 포함 값에만 센다. 탭·NBSP·본문 줄바꿈이 포함되며 CRLF는 하나로 센다. 블록과 셀 사이에 공백을 추가하지 않는다.

`litzio inspect <file>`은 기존 텍스트 출력 뒤에 `Characters (with spaces)`와 `Characters (without spaces)`를 표시한다. JSON은 기존 revision에 대응하는 `characterCount: { withSpaces, withoutSpaces }`를 추가한다.

## 문서 검토 상태

선택 frontmatter `status`는 문자열 `draft`, `review`, `approved`만 받는다. 빈 값·빈 문자열·다른 값·비문자열은 `native-metadata`로 거부한다. 생략한 문서는 상태 없는 보통 문서다. 상태는 문서가 소유하는 표시이며 편집·저장·연산을 제한하지 않는다. 정규 직렬화는 기존 metadata 키 순서·주석을 유지한다. 새 `status`는 기존 키 뒤에 추가하며 이미 있는 값은 제자리에서 바꾸고 제거는 그 키만 지운다. 공식 작성 입력의 키 순서는 `litzio`, `title`(있으면), `status`(있으면)다. 상태가 없는 문서의 출력은 바뀌지 않는다.

`EditableDocument.status`는 없으면 필드를 생략한다. Core `updateDocumentStatus(document, status | null)`은 상태만 정하거나 없앤다. 본문 편집은 상태를 보존하고 본문 경로는 상태와 무관하다. CLI `update-status <file> (--value <draft|review|approved> | --remove)`와 `apply-batch`의 `{command:"update-status",value:"draft"}` / `{command:"update-status",remove:true}`가 같은 Host 수정 경로를 쓴다. 대상 revision·dry-run·receipt·실패 시 원본 보존은 기존 수정 명령과 같다. `inspect --format json`의 최상위 `status`는 없으면 null이고 텍스트 출력은 `status: absent`다. SDK는 같은 연산·타입·값 목록을 재수출한다.

템플릿으로 새 문서를 만들 때 상태를 물려받지 않는다. `compareDocuments`는 상태 차이를 `documentChanged`로 표시하며 본문 `changes`에는 포함하지 않는다.

## 공식 문서 작성 입력

Host의 새 문서 작성은 화면 `saveDocument`, CLI `create --input`, HTTP `PUT /api/document`가 같은 `createAuthoredDocumentFile`을 사용한다. 열린 폴더·Host Root 범위 확인 후 없는 상위 폴더를 단계별로 만든다. 실패하면 요청이 만든 동일 식별자의 빈 폴더만 역순으로 제거한다. 다른 파일이나 완성된 공유 그림이 있으면 보존한다. 기존 문서는 배타적 게시로 보호하며 임시 파일·fsync·hard-link 게시와 크기·개수 한도는 유지한다.

그림은 key에서 만든 `<stem>.<MIME 확장자>`를 사용한다. 이미 저장된 파일과 편집기 붙여넣기·가져오기·검토 내보내기의 이름은 바꾸지 않는다.

| 입력/충돌 | 파일 이름 규칙 |
| --- | --- |
| `table-003` | `table-003.png` (PNG) |
| Unicode·대소문자 | NFC 정규화·소문자 변환. 한글 유지. 대소문자만 다른 key는 같은 후보 이름을 사용 |
| 금지 문자 | 제어 문자·`<>:"/\\|?*`는 `-`로, 위험한 percent escape와 연속 점도 치환. 앞 점·끝 점/공백 제거 |
| Windows 예약 이름 | `_` 접두사 (예: `CON` → `_con.png`) |
| 길이·빈 stem | UTF-8 80 byte 이내로 자르며 Unicode 문자를 나누지 않음. 비면 `image` |
| 기존 이름·같은 내용 | 실제 파일의 전체 SHA-256·길이 확인 후 재사용. 기존 대소문자 표기 유지 |
| 기존 이름·다른 내용 | `-<내용 SHA-256 앞 8자리>` 추가. 그 이름도 다른 내용이면 덮어쓰지 않고 거절 |

게시된 그림의 전체 내용 검증과 inode 기반 임시 파일 소유 확인은 이름과 별개로 유지한다. 완성된 그림은 다른 저장이 즉시 재사용할 수 있으므로 이후 문서 작성 실패 시에도 삭제하지 않는다.

Core `documentAuthoringSchema`와 `authorDocument`가 CLI `create --input` 및 화면 `saveDocument`의 공통 계약이다. SDK는 Core schema를 재수출하고 request의 이미지 바인딩을 검증한다. 입력은 `{title?, status?, inputs:[{key,blocks:[]}]} `이다.

- `status`는 같은 세 문자열 중 하나이며 생략할 수 있다. CLI `create --input`과 화면 `saveDocument`도 같은 schema를 사용한다.
- paragraph·heading(level)·quote·admonition(variant)·footnote(label)는 `text` 또는 `content: InlineContent[]` 중 정확히 하나를 받는다. 문자열은 Markdown 해석 없이 글자 그대로다.
- table의 `rows` 각 셀과 figure의 `caption`은 문자열 또는 같은 InlineContent 배열이다. table은 `caption`, `notes`, `label`, `align`도 받는다. 셀의 줄바꿈은 문자열의 줄 끝 또는 `InlineContent`의 `break`로 작성한다. `notes`의 각 문단은 문자열 또는 `InlineContent[]`다.
- list는 Core ListContent의 `ordered`, `checklist`, `loose`, `start`, `style`, `delimiter`, `items:[{content,checked?,list?}]`를 받는다. 기존 문자열 items도 유지하며 체크리스트의 문자열 항목은 체크 안 됨이다.
- target(label)은 heading 앞의 Core target 블록이다. figure·table·equation도 label을 받는다. 참조는 InlineContent의 reference(role,label), 미주 표시는 footnote(label), 정의는 footnote 블록으로 연결한다. 정의는 Core 규칙대로 본문 뒤 첫 참조 순서로 배치하며 입력별 target receipt는 재배치된 경로를 가리킨다.

읽기 출력의 `content`(표 칸의 `break` 포함), 목록 `items`, 표 `notes`를 변환 없이 해당 입력 필드에 넣는다. JSON nodes의 type은 blocks의 kind에, 표 cell 노드의 `content`는 rows에, 표 노드의 `notes`는 그대로 notes에, 별도 그림 caption 노드는 figure.caption에 매핑한다. path·text·editable·파생 번호 등 조회 필드는 입력이 아니다.

Core 수정 연산과 native 검증·정규 직렬화 재검증을 재사용한다. 이 완성 문서 작성 입력은 끊긴 미주, 사용되지 않은 정의, 중복 레이블(암시적 heading ID 포함), 없는 참조 대상, 지원하지 않는 중첩을 거부한다. 일반 편집 초안에서 미해결 상호 참조를 허용하는 계약은 유지한다. `DocumentAuthoringError.diagnostics`는 입력 path와 reason을 제공하고 message에도 포함한다.

Core는 각 블록의 수정 연산을 실행하고, 전체 문서를 다시 직렬화해 정규 원문의 바이트 일치와 블록 경계를 검증한다. Host는 이 검증을 통과한 작성 결과의 원문을 그대로 배타적으로 게시한다.

4 MiB 입력/출력, 5000 input·block, 문자열 16384자, 표 500행·32열·총 8,000칸, 목록당 100항목 한도를 적용한다. 모든 중첩 문자열에도 같은 한도를 적용하며 중첩 목록 항목과 표 주석 문단은 총 block 한도에 합산한다. 표의 지원 범위는 한 행의 머리글과 직사각형 격자, 인라인 셀, 캡션과 주석 문단이다.
