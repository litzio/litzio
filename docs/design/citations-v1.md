# Citations v1

- Status: Implemented
- Last verified: 2026-11-13 (검증 이력 분류·이동과 링크 대조. 기존 계약 문구 보존; 제품·브라우저·Desktop 재실행 없음).
- Scope: [ADR-0008](../adr/0008-citations-and-bibliography.md) units A, B and C, under [Native document support](document-support-v1.md). Unit D extensions remain separate decisions.

검증 이력은 [별도 기록](../reviews/citations-history-2026-11.md)에 보존한다.


## Native meaning and canonical writing

`{cite}`, `{cite:t}` and `{cite:p}` accept one or more exact bibliography keys. Core exposes
`{ kind: "citation", role: "cite" | "cite:t" | "cite:p", keys: string[] }` in supported inline
content. The role preserves narrative versus parenthetical meaning and whether a single key
is a group. Keys retain case and Unicode; they never use the label or endnote namespace.

The pinned MyST parser and writer own role parsing and output. A single narrative cite writes
`{cite}`; a narrative group writes `{cite:t}`; a parenthetical group writes `{cite:p}`. Multiple
keys in `{cite}` therefore canonicalize to `{cite:t}`. Separators become commas, while key order,
repetitions and single-key groups remain. No key sorting, range compression or author generation occurs.

Keys must be non-empty and contain no whitespace, control characters, commas, semicolons,
braces, brackets, backticks or backslashes. Prefix, suffix, partial and unknown attributes are
unsupported. Projection checks every citation/group field and canonical writing retains the full
semantic fingerprint guard. Ambiguous keys or parser/writer meaning changes fail closed.
Citation atoms have Core inline offset length one, regardless of the number of keys. Bold, italic
and deletion marks preserve their meaning; links and subscript/superscript cannot contain citations.
Citation-only content is a non-empty persistent paragraph, including after paragraph split/merge
or heading-to-paragraph conversion. The shared inline semantic comparison verifies canonical
round-trip preservation of roles, ordered keys and marks; whitespace-only results remain refused.

The #328 boundary remains: bare `@name` is literal text, canonical writing escapes it when needed
by default MyST, and unescaped bracket shorthand is rejected. Its `native-content` correction
now offers an explicit citation role as well as escaping for literal text. No shorthand alias is added.

## Bibliography declaration and readiness

Optional frontmatter `bibliography` is a non-empty sequence of relative `.bib` path strings.
`/`, `./` and `..` are allowed. Strings are kept as written and in declaration order. Scalar
coercion, empty values, inline entries, URLs, absolute/drive/UNC paths, backslashes and globs
are refused. Duplicate lexical paths, including equivalent `.`/`..` spellings, are refused;
Core does not case-fold paths or inspect filesystem identities. Metadata errors retain the stable
`native-metadata` code, and unsupported citation meaning retains `native-content`.

Only saved, declared `.bib` files are read on Open/Reload and after saving a changed declaration. They are never created or modified. A permitted
declaration can name a missing resource or traverse above the document directory; admission alone
does not grant permission to read it. The read boundary is specified below.

Core `citationReport(document)` returns `bibliography`, ordered `citations`, and
`readiness: { status: "not-evaluated", complete: null, diagnostics: [] }`. Each citation has its
top-level snapshot `path`, canonical `role`, original `keys`, `numbers` and numeric `text`.
Without source snapshots there are no fabricated missing-key or resolved diagnostics. Validation and writeability remain
separate from readiness, and `check` exit 0 does not mean bibliography completion.

Numbers follow the first exact key occurrence in reading order, including group order: body
blocks, directive captions before their contents, nested lists, then the canonical endnotes region. The same key
always reuses its number. Core's shared `firstReferenceNumbers` policy serves endnotes and citations
with separate maps. The existing Core `endnoteOrder` also applies before Save, when an operation has
changed footnote reference order but the snapshot's definitions have not yet moved. Report paths
still address that input snapshot. `citationText` produces `[2], [1]` in stored order. Numbers are derived and never
persisted in Markdown. This follows the existing Core/MyST content traversal used for endnotes;
the Editor's existing below-table caption placement does not change the semantic order.

## Operations and CLI

Core owns `updateBibliography(document, paths)` and `insertCitation`, `updateCitation`,
`removeCitation`. An empty `paths` array removes the optional declaration; an empty declaration
in source is invalid. Updates retain unrelated metadata and YAML comments.

Citation operations address an editable paragraph, heading, quote or simple admonition with
`path: [block]`, or a table cell with `[table,row,cell]`, using the existing Core UTF-16 inline
offsets. Endnote definitions also support citations with `[block]`. Insertion accepts offsets from
zero through content length. Update/removal require the start of an existing citation atom and retain
surrounding marks. Other inline surfaces (Figure/table captions and list items) keep the existing
typed content operations; no alternate raw-source write path is added.

| CLI command | Required options |
| --- | --- |
| `update-bibliography <file>` | `--paths <JSON string array>`; `[]` removes |
| `insert-citation <file>` | `--path <indexes> --offset <n> --role <cite\|cite:t\|cite:p> --keys <JSON string array>` |
| `update-citation <file>` | Same options, replacing the existing atom's role and key group |
| `remove-citation <file>` | `--path <indexes> --offset <n>` |

Single commands and `apply-batch` use the same Core operations. Batches accept `keys` and `paths`
as arrays or JSON strings. Existing revision, dry-run, canonical reparse and atomic file replacement
contracts apply; a failure writes no bytes. `--content` also accepts typed citation items.

`check --format json`, `inspect --format json` and edit/format JSON dry runs expose the Core report
under `citations`. Once resources are evaluated, `citations.entries` lists every readable key once,
in source order, with its source, `complete`/`incomplete`/`duplicate` status and display text
(the key for a duplicate). Formatting an uncited entry never changes readiness. Text check/inspect print declarations, roles, keys, numeric groups and
`citation readiness: evaluated; complete: true/false` when citations or declarations exist. `format` preserves declarations and explicit roles in its
canonical output. Ordinary successful file edits retain their existing stdout contract and send
resource warnings to stderr; resource warnings do not change successful exit 0. Text check/inspect
and text dry-run diagnostics appear on stdout; JSON output embeds them under `citations`.
Document check/inspect/edit commands accept optional `--bibliography-root <directory>`; default
is the document directory, independent of process cwd. This is not a `daemon run` option.

## Editor

An inline citation is a Tiptap atom in the single document state. Its role and keys map both ways
through the existing inline adapter, and Save replays existing Core content operations. Typing around
it, moving content, Undo/Redo and supported clipboard operations preserve its meaning. Table captions
use the same Core numeric display as the rest of the document.

Authoring uses the command center’s `Insert citation…` at a retained caret without requiring
whitespace, or the slash menu on supported inline surfaces: paragraphs, list items (including
nested lists), quotes, simple admonitions, endnote definitions, table cells, Figure captions and
headings. Only top-level paragraphs also offer block commands; the [location matrix](editor-ux-shell-v1.md#nested-inline-slash-menu-377)
records the existing Core save paths. **Citation…** opens a form at the caret. `/Citation`,
`/cite` and `/인용` select this item first in either UI language, including in an empty paragraph;
applying the form inserts an inline citation and keeps the paragraph. These queries do not offer
Quote; use `/quote`, `/blockquote` or `/인용문` for that block. A query
also lists up to 20 readable entries whose key or display words start with it, inserted directly as
`cite:p`. A citation chip's edit button opens the same form with its stored role and keys. The form
chooses `cite:p` (default), `cite:t` or `cite`, keeps an ordered key group, and searches every readable
entry through an Editor-styled combobox/listbox. Candidates show the key and the existing evaluated
bibliography text, including available author and title; long display text wraps rather than hiding
the title behind a long author list. No additional bibliography parsing is done.
Search matches key or display text case-insensitively, then renders up to 50 results with a narrowing
notice when more match. The command center's Base UI combobox and list styles are reused locally.
Up/Down highlights a candidate while focus stays in the input; Enter or a pointer selection adds it
to the key group without applying the form. Without a highlighted candidate, Enter adds the typed
key. Tab proceeds to Add. Escape first closes an open candidate list without changing the draft;
closing completes immediately because this inline list has no exit animation. Up/Down reopens
the list with a matching candidate highlighted, including immediately after Escape.
Escape with the list closed cancels the form. Native composition keys (including legacy keyCode 229)
do not navigate, select, apply or cancel. Typed keys absent from the bibliography remain citable
and show as unresolved; keys Core refuses are rejected in the form. Apply uses Core's canonical
citation (multi-key `cite` becomes `cite:t`); leaving the form cancels; Remove deletes the
atom and keeps the surrounding text. Entries follow the tab's last loaded resource snapshot (Open/Reload or Save of a changed declaration), so a tab whose
folder cannot read the declared file offers typed keys only. The Editor never writes `.bib` files.

The chip uses shared reference typography and selection tokens. It shows Core numbers and the
same readiness as the derived list, including caption citations. English/Korean accessible labels
identify keys and status. Incomplete states retain dashed text; no active bibliography URL is emitted.
A single derived References section follows canonical endnotes, outside the ProseMirror document.
It contains only cited keys in current number order, including missing/duplicate/unverified keys.
Moving citations and Undo/Redo recompute numbers; Save never inserts this section into `.md`.

Hovering a citation chip, or reaching either side of it with the focused editor's caret (including
native atomic selection), shows a [reading preview](editor-ux-shell-v1.md#endnote-and-citation-reading-previews-752)
of the cited entries in key order. It reuses the derived References' formatted parts and readiness
messages from the same loaded bibliography snapshot; missing or unchecked keys keep their existing
status. The browser title tooltip is replaced, while accessible key/status labels and the existing
chip click/selection and Edit button behavior remain. Preview display never changes selection,
focus, document content, Core semantics or the CLI surface.

### Connect and disconnect bibliography files (#438)

Owner decision (2026-10-25): connections apply on Save. The existing Host read contract
continues to accept only declarations from an admitted, saved document; the Editor cannot
ask it to read arbitrary resource targets. No Host read capability or persistence is added.

Owner decision (2026-10-26, [#473](https://github.com/litzio/litzio/issues/473)) supersedes
the earlier #438 sentence “including when the document has no declaration or citations.”
The trailing References area exists only while the current document has a bibliography
declaration (saved or staged) or at least one citation. Removing the last citation or staging
removal of the last declaration hides it when neither remains; connecting a file or inserting
a citation shows it immediately.

**Connect bibliography…** is available in the expanded **Document settings** block above the title while
the document has a bibliography declaration (saved or staged), and as a command-center item. Both share the Saved-in-document availability rules: disabled without a document, during pending work or in Source, with the existing availability reason on command/Settings entries. Connecting opens the existing connection dialog and returns focus to the row’s Connect button; the collapsed summary reflects currently staged bibliography filenames.
Documents without a connected bibliography file do not show the Document settings row; the
command-center item keeps the connection path available, and the References area offers the same
action whenever it is shown.
The connect action also remains inside a visible References area, alongside the existing
declaration list and Disconnect actions. All entry points open the same candidate UI in the
shared Dialog, which returns focus to its opener on close. Merely opening it does not show
an unused References area or change document history.

The existing folder listing offers `.bib` files in the document's
own folder. Candidates use the same browser-safe Core `bibliographyError` validation and lexical
normalization as admission and `updateBibliography`: adding the candidate must leave the full
staged declaration valid. Equivalent existing paths (including `./` and cancellable `..` segments)
and filenames Core rejects are hidden. No declaration/path rules are duplicated in the Editor.
Long candidate names ellipsize inside compact buttons, keeping the full name in their title and
accessible name. Existing declarations, including parent/subfolder paths, remain visible and can be
disconnected. Paths remain document-relative; the existing pinned local folder context or HTTP
Root union and real-path checks still govern reads. Files outside the reading boundary remain
unverified. Litzio never writes `.bib` files.

Connect/Disconnect changes one ProseMirror document attribute in one isolated Undo step, using
the same dirty, recovery, Source and Save pipeline as other document edits. Save replay calls
Core `updateBibliography(document, paths)`; the Editor does not edit frontmatter. CLI parity
already exists as `update-bibliography` and is unchanged. Until Save, existing references and
search choices retain their last loaded data, and the UI says “Save this document to load the
connected bibliography files.” The declaration list reflects staged changes immediately.

After a successful Save whose submitted declaration differs from the loaded snapshot, the
session requests only `/api/bibliography` for that Save's revision and pinned folder context.
It replaces only `DocumentFileResponse.bibliography`; the editor body, history, selection,
property drafts and edits made after the submitted snapshot are retained. Save remains busy
until this bounded read settles. A read failure yields existing unverified resource states
without turning the successful document write into a failed Save. Failed Save never refreshes.
Undo/Redo after Save can stage a different declaration again and require another Save.

External `.bib` edits still require Reload; no watcher or automatic refresh on ordinary Save
is added. The notice reads: “If you edit a .bib file in another app, save your document, then
choose Reload to update its references.” English and Korean explain both lifecycles.

## Bibliography snapshots and limited formatting (unit B)

`citationReport(document, sources)` and the browser-safe `evaluateBibliography` accept relative
source labels with text or stable read-error codes. They return typed text/emphasis parts and
`readiness: { status: "evaluated", complete: boolean, diagnostics }`. Core has no filesystem,
Root, absolute path or network lookup. The installed Citation.js BibLaTeX parser retains raw
entry types and fields before conversion; only `standard.number` is explicitly supplemented.
There is no citeproc, CSL style, automatic export, watcher, or bibliography writer.

| Original types | Limited complete output |
| --- | --- |
| `article` | Author initials, quoted title, journal, volume/issue/pages, year, DOI or URL |
| `inproceedings`, `conference` | Author, quoted title, conference, year, pages, locator |
| `book` | Author or editors, title, edition, place/publisher, year, locator |
| `techreport`, `report` | Author or institution, title, institution, report number, year, locator |
| `standard` | Title, original standard number, institution, year, locator |
| `online` | Author or organization, title, optional site, year, URL and full access date |
| `misc` | Available author, title, source, year, locator |

Exact punctuation is protected by `packages/core/test/bibliography.test.ts`. Unsupported original
types (including `proceedings` even when converted to book), unknown semantic fields, conversion
loss, complex names/dates and missing required fields receive minimal text plus diagnostics.
Each minimal part ends with exactly one period (`Title. n.d.`, never `n.d..`).
`abstract`, `keywords`, `file` are intentionally ignored. Converted markup is rendered as literal
text and diagnosed; URLs are text only. DOI takes precedence over URL. Publication year is required.
Every rendered scalar and name component is checked for converted markup or residual TeX,
including volume/issue/pages and the original `standard.number` supplement. Distinct supported
original values mapping to one scalar (such as publisher/howpublished or organization/institution)
are ambiguous and diagnosed; identical original values are accepted. No metadata is silently
repaired and `.bib` bytes remain external source authority.

Stable diagnostics include `bibliography-type-unsupported`, `bibliography-field-unsupported`,
`bibliography-field-missing`, `bibliography-key-duplicate`, `bibliography-entry-uncited` (info),
`bibliography-unreadable`, `bibliography-invalid`, `bibliography-limit`, `bibliography-changed`,
`citation-key-unresolved` and `citation-key-unverified`. Diagnostics carry source/key/field and
citation path when applicable; parser line/column is included when the library reports it.
Duplicate keys never pick an entry. If any declared resource fails, even keys in readable files
are unverified because unseen duplicates remain possible. Unresolved means all resources were
read but the key was absent. Resource failures never affect native admission or lossless Save.

The shared stateless `/api/bibliography?path=…&revision=…` handler derives declarations from the
admitted document, checks its revision, and cannot accept arbitrary resource targets. Local Vite/
Desktop reads pin the folder context on document Open: the outermost opened sidebar folder containing
the document ([ADR-0009](../adr/0009-multiple-opened-folders.md)); absent context means document
directory. Sidebar folder changes and Reload retain that tab boundary; explicit close/reopen uses
the new context. HTTP always uses the startup Root union and ignores local folder context. CLI
uses its explicit root or document directory. Lexical/real paths, symlinks and Root identity are
checked through the existing RootAccess helper. Document/media admission and folder filtering
are unchanged.

Limits are **16 files, 1 MiB per file, 4 MiB combined UTF-8 bytes, 5,000 parsed entries**. Node
reads are bounded and compare descriptor/path identity, size and timestamps before/after; malformed
UTF-8, changed/replaced files and limit errors become resource warnings. Core independently applies
snapshot limits. No read-in-progress check guarantees observation of every future external change.

Each tab owns its loaded resource snapshot and displays an external-change notice. Ordinary Save
retains it; Save of a changed declaration refreshes only that snapshot, and Reload replaces it only
in that tab. Removing the last declaration clears the snapshot without a resource read. Recovery
stores declarations/context, never bibliography text: restored sources are unverified until Reload
or Save of a changed declaration. Old recovery records without resource context retain
unchecked chips. The References section reuses document spacing, color and type tokens, wraps at
the supported minimum width of 640px ([ADR-0010](../adr/0010-supported-viewport-and-input.md)), and renders strings with typed React nodes rather than HTML injection.

## Dependency and fixture provenance

Installed direct packages are `@citation-js/core@0.9.0` and `@citation-js/plugin-bibtex@0.9.0`.
Their seven-package graph also includes `@citation-js/date@0.5.1`, `@citation-js/name@0.4.2`,
`sync-fetch-undici@0.7.1`, `whatwg-mimetype@5.0.0` (MIT) and `moo@0.5.3` (BSD-3-Clause).
The [distribution notice](../../apps/editor/public/licenses/Bibliography-THIRD-PARTY.txt) includes
license text and the date/name upstream license-file absence; it is copied into Editor/HTTP assets
and Desktop assets. The CLI build also collects bundled dependency notices. No CSL/citeproc entered
the installed graph. Frozen installation passed. Production audit reported 14 existing advisories
(3 high, 9 moderate, 2 low) in the MyST dependency tree (`katex`, `markdown-it`, `linkify-it`,
`csv-parse`); none belongs to the added Citation.js graph. This is not a clean security audit.

The synthetic IEEE fixtures are accompanied by an unchanged real Better BibTeX regression export:
[upstream fixture at 83e7f67](https://github.com/retorquere/zotero-better-bibtex/blob/83e7f67ff859e4c057b1754d5a0ad648a16da151/test/fixtures/export/Author%20multi-character%20initial%20gets%20shortened%20%232419.bibtex).
Local `packages/core/test/fixtures/better-bibtex-2419.bib` SHA-256 is
`bc6a45b4cd2b9d6e39add2ec0c58305dd5d07faf54dc2fd161642f0b3d2a0afd`;
the adjacent `better-bibtex-LICENSE.txt` preserves upstream MIT terms. Its unsupported metadata is
explicitly diagnosed. Zotero itself was not run or connected.

## Verification

### Citation paragraph stabilization plan (2026-10-23)

Scope: preserve citation-only content through existing paragraph split, merge and heading
conversion, and reuse the shared inline semantic comparison. Completion requires exact role,
key order and marks after canonical round-trip, Host replay and representative browser
split/merge Save → Reload. Existing empty/whitespace, UTF-16 and unsupported-content refusals
remain required. No new operation, CLI surface, parser or Editor schema change is needed;
existing CLI commands already call these Core operations. Verification uses Core tests,
targeted Editor replay tests, repository typecheck/docs checks and the `citations` browser scenario.

Results for [#351](https://github.com/litzio/litzio/issues/351): the new split and conversion
regressions failed on base `496d800` with the non-empty error before the fix. After the fix,
Core 243 tests, Editor `editor.test.ts` 89 tests, repository typecheck, Editor build,
`pnpm docs:check` and `git diff --check` passed. The `citations` browser scenario passed against
this checkout's Vite server on port 5272: actual Enter split left a bold citation-only paragraph,
Save → Reload retained its semantics, and Backspace merge plus Save → Reload restored the
pre-split canonical bytes. The Host regression additionally checks opening-snapshot offsets
through Tiptap edit collection and replay. No new CLI operation is introduced and Core cases
are not repeated in CLI/browser. Full browser, HTTP and packaged Desktop suites remain CI checks.
Vite's existing large-chunk warning remains. The caller-owned Vite process and runner-owned
persistent browser context were closed after verification.
