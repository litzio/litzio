# Document templates v1

- Status: Implemented
- Last verified: 2026-11-04 — Phase 1 Core/CLI/Host/Desktop adapter tests; phase 2 gallery, retained reading preview, naming feedback and 1440/640px review; phase 3 generated guidance, CLI path and YAML-comment preservation checks. No real model call; packaged Desktop verification is CI-only.
- Shared-operation verification: 2026-11-04 (#1128: common Host operations, fake Codex tool calls/receipt history and child CLI execution; no real model call, packaged behavior is CI-only).
- Scope: #1128 and #936 phases 1–3: Core semantics, thin CLI/Host interfaces, Editor gallery and assistant guidance.
- Authority: [#936 owner decisions](https://github.com/litzio/litzio/issues/936), including the 2026-11-04 approval of optional `template: { name, description }`; [native support](document-support-v1.md), [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md) and [ADR-0006](../adr/0006-native-document-boundary.md).

## Native document semantics

A template is an ordinary native Markdown document accepted by Core, not a new
document format. Its optional front matter field is:

```yaml
litzio: 1
title: Document title
template:
  name: My report
  description: A reusable work report
```

When present, `template` must be a mapping containing exactly `name` and
`description`, both single-line strings. Name must contain non-whitespace text;
description may be empty. Line separators, YAML block scalar syntax, missing or
extra fields, nonstrings and invalid Unicode are refused. Inline-looking text in
these fields is literal metadata, not Markdown. Title remains independent.
Unknown metadata keys and duplicate YAML keys retain existing refusal rules.

Core exposes `getTemplateMetadata`, `updateTemplateMetadata` (null removes the
field), and `createDocumentFromTemplate`. The latter requires template metadata
and removes **only** `template`. Body, title, numbering and bibliography remain as
authored. Operations clone the input; canonical serialization and repeated reopen
must preserve accepted metadata. User templates containing `bibliography` retain
it under the existing contract; this work adds no citation behavior. Relative
resource paths are retained as written; assets are not copied or rebased.

## Storage and app defaults

`hostPaths().templates` is the single user-template directory, independent of
the current document folder and assistant cwd. Source runs use
`<checkout>/.litzio-dev/templates`; packaged CLI/Desktop use
`~/<brand.folders.shared>/templates` (official brand: `~/.litzio/templates`).
No per-folder catalog, registry, watcher or migration is introduced.

The two app defaults are **AI 작업 보고서 / AI work report** (`builtin:ai-report`)
and **기술 문서 / Technical document** (`builtin:technical-document`). Like
[localized samples](desktop-distribution-v1.md#native-sample), content is
available in `ko` and `en`; callers pass UI language, defaulting to `en`.
Neither default declares `bibliography`. Per the additional #936 owner instruction
(2026-11-04), both Korean resources author the existing
[Korean reference-style preset](heading-numbering-v1.md#reference-templates-445):
`numbering: { figure: "그림 %s", table: "표 %s", equation: "식 (%s)" }`.
Their generated documents retain it, so captions/references use 그림 1, 표 1 and
식 (1). English resources omit numbering overrides and retain MyST defaults.

Defaults are ordinary native Markdown strings embedded as read-only app resources
in `builtin-templates.ts`, shared by source and bundled Hosts/CLI. They are never
materialized in the user directory. This takes the owner-requested read-only
alternative to sample replacement (#1045): every read receives the current app
default, without overwriting user files at startup or update. Users save a copy
under another name to customize it. No separate deployment asset lookup is needed.

User templates are `<name>.md` files. Catalog names must be valid cross-platform
file stems (the existing file-operation rule), and exactly match the filename
stem. Names compare after NFC normalization and case folding. Both languages'
default names are reserved. IDs are `user:<name>`; built-in IDs remain stable
across language changes. Invalid native files, malformed UTF-8, name mismatches,
collisions and linked entries are reported as catalog `problems`, not silently
admitted. Catalog reads do not create the directory.

Save reads an existing authorized native document, sets name and description
through Core, and writes canonical Markdown using exclusive creation (`wx`).
Description defaults to the document's existing template description, otherwise
empty. Existing names/files, including invalid catalog files, are never replaced.
The store rejects symlink/junction directories and linked template files.

## Host API for the gallery and assistant

These routes belong to the shared stateless document handler, so Vite, Desktop
and HTTP use the same contract. They do not depend on a plugin being enabled.

| Request | Response |
| --- | --- |
| `GET /api/templates?language=ko` | `{ directory, templates: [{ id, name, description, kind }], problems: [{ file, error }] }` |
| `GET /api/template?id=<id-or-name>&language=ko` | `{ id, name, description, kind, source }`; source is canonical native Markdown for preview |
| `POST /api/templates` with `{ name, from, description? }` | 201, the saved template content record; `from` is a disk document path |
| `PUT /api/document` with `{ path, template, language? }` | 201, the existing native document response; template is an ID or localized name |

`kind` is `builtin` or `user`. IDs are preferred for subsequent requests. A
localized built-in name resolves in the requested language; user names are
language-independent. Supported language values are only `ko` and `en`.
No template in the existing document PUT means the existing empty-document
creation. Creation retains `.md`, existing-parent, Host RootAccess and exclusive
write checks; template admission finishes before writing the destination.
Saving checks `from` against Host Roots. The app-owned template directory is an
explicit capability outside document Roots; callers cannot supply its path.
Errors retain the existing Host status/error response (400 invalid/missing or
duplicate template, 403 outside Roots, 405 unsupported method). The list keeps
valid templates available while reporting individual broken user files.

The protocol types live in `apps/editor/shared/template-protocol.ts`. Listing,
preview and saving do not apply a template to an existing document. The gallery
and assistant use the same ID and source contract. The gallery uses these routes;
HTTP, CLI and Codex tools use the same template operations described below.

## Editor gallery (phase 2)

The sidebar and command center open one **Template gallery** task tab, using the
existing shell/group/tab lifetime. It has no document Save or recovery session.
New document… remains the empty-document entry. The gallery groups built-in and
user cards; only the Built-in badge is persistent. Descriptions are available on
hover and in the keyboard-accessible preview.

The approved C interaction uses one common Popover and one retained read-only
DocumentEditor. Hover and keyboard focus open it after a short 300ms delay;
leaving closes after 150ms. Selecting another card swaps the Core-parsed editable
read model into the same reading editor state. This isolated preview state has no
writable draft/history; normal document sessions retain their existing lifecycle.
Preview content is cached during a catalog visit and invalidated on refresh,
language change or gallery reentry. Escape closes and returns focus to the card.
The preview uses viewport collision placement and an internally scrollable region;
640px prefers vertical placement. No essential action exists only inside it.

**New document from template** on the card reuses the existing folder/name flow.
When no folder is open it first opens the folder picker. Creation passes the
stable template ID and current UI language to the existing document PUT, then
opens/focuses the returned native document. Cancel never writes a destination.

**Save as template…** in the command center accepts a current native document.
Unsaved applied content or drafts require document Save first: the Host POST reads
the acknowledged disk path, not UI source text. A Dialog collects name and optional
description. Reserved/duplicate/invalid names show localized field feedback and
retain the form. Success refreshes the gallery on its next visit. User originals
and built-in resources are not overwritten.

Catalog loading errors use Notice with Refresh; each broken user file is reported
while valid cards remain usable. Empty groups have an explicit empty state.
**Open template folder** uses the existing in-app folder-opening path (including
Host Root checks and missing-directory errors), with the full path on hover.
It does not extend the Desktop OS-folder capability or create a directory on read.

Shared implementation: Button secondary/ghost, Input, Dialog/FieldError, Notice,
common Popover, Lucide FileText/FolderOpen/RotateCcw and existing role tokens.
The approved gallery preview is the sole surface exception: a larger reading
popover rather than a metadata editing form. Core, Host API and Plugin API are
unchanged; this is an Editor interaction, so no new CLI operation is needed.

## CLI

```text
litzio templates list [--json] [--language <ko|en>]
litzio templates read <name|id> [--json] [--language <ko|en>]
litzio templates save <name> --from <file> [--description <text>]
litzio create <file> [--template <name|id>] [--language <ko|en>] [--format <text|json>]
```

List JSON matches the Host catalog. Read prints Markdown, or the content record
with `--json`. Save prints the saved content record as JSON. CLI uses the same
Host operations and Core, strict UTF-8 and common exclusive creation;
it does not implement YAML/AST semantics. Default create remains silent; `--format json` returns the creation receipt including path, source, revision and file identity.

## Shared Host operations and assistant (#1128)

`document-templates.ts` owns the template-specific `templateOperations` definitions
and `executeTemplateOperation`: input validation, result shape and explicit
`TemplateScope`. HTTP and CLI adapt their existing syntax; Codex reuses those
specifications through the existing active-turn tool handler. No general registry,
new plugin API or live CLI-to-Host transport is introduced ([ADR-0015](../adr/0015-shared-host-operations.md)).

| Operation | Codex input | Result |
| --- | --- | --- |
| `list_templates` | `{language?}` | Existing TemplateList with catalog problems |
| `read_template` | `{template, language?}` | Existing TemplateContent |
| `create_document` template form | `{path, template, language?}`; no title/blocks | `{path, source, revision, identity}` creation receipt |
| `save_template` | `{name, from, description?}` | Saved TemplateContent; original unchanged |

The alternative `create_document` form still accepts title and paragraph/heading
blocks. Template form removes only template metadata through Core, without model
reconstruction. HTTP, CLI and ordinary/tool creation share `document-create.ts`:
canonical admission before `wx`, identity from the opened descriptor and revision
of the written source. The HTTP adapter adds the native read model; CLI can emit
the receipt as JSON. CLI stdout does not create a card in another window.

List/read need no opened folder or document write access. Create/save require
captured write access (`opened-folders` or `full-access`) and an absolute source
or destination inside the turn's pinned opened folders and Host Roots. Save's
purpose-built destination is the fixed app-owned template catalog, not arbitrary
filesystem write access. Host composition pins the catalog to the same source or
packaged run as HTTP; input cannot select a directory. Existing name, native,
UTF-8, symlink, no-overwrite and Root checks remain in force.

New Codex conversations acquire the added tools. Existing threads are not
retrofitted. Template creation uses the existing result card/Open/guarded Undo;
changed disk content, unsaved edits and recovery keep their existing protection.
There is no new undo service or shared editor history.

Generated assistant AGENTS.md and `litzio-guide` query `list_templates` at request
time, propose a suitable template and wait for consent before reading/applying it.
An explicitly named template supplies consent; a missing entry never silently
falls back. Saving requires confirmation of name, description and disk source,
followed by read-back and a refreshed catalog. Unsaved edits must be saved first
if intended for the template. These consent rules are instructions, not a parser
of natural-language authorization. Host input and scope checks run independently.

Inside Litzio, templates use Litzio tools. CLI guidance is for terminal Codex
continuation and richer terminal authoring with existing apply-batch/check.
Copilot has no Litzio template tools (#1121); it offers text guidance.

Before launching Codex, the Host prepends `<assistant cwd>/bin/<CLI identity>` to that child's
PATH. A private launcher invokes this Host's CLI with its runtime: source CLI
and tsx for source runs, bundled `cli.mjs` for distributed HTTP, explicitly supplied
bundled CLI and Electron RunAsNode for packaged Desktop. The Windows launcher uses
a runtime-directory junction and JS arguments so Unicode installation paths do not
enter batch source. It works independently of optional Desktop CLI integration.
CLI/runtime-specific subdirectories prevent Desktop and HTTP Hosts sharing a cwd
from replacing one another's launcher. Parent process, system/user PATH and registry are untouched; no executable is
selected from another installation's PATH. It does not connect CLI to a live Host,
share drafts or turn a failed Host call into local re-execution.

## Verification scope

Existing Core native tests own valid/malformed metadata, immutable operations,
other-metadata/body preservation and canonical repeatability. Existing CLI tests
exercise in-process command parsing/output, shared storage and create/reopen. Existing Editor Host tests own localized default
previews, HTTP transport, filesystem collision/no-overwrite, Root refusal and
broken-file reporting, with one temporary listener closed by test cleanup.
Host path tests cover source/packaged location calculation without writing the
shared user folder. The existing Desktop protocol test verifies forwarding its injected Host run
directory and using the shared save/create routes, without packaging or a new listener.
Phase 2 adds one `pnpm browser:test template-gallery` scenario: browser-specific
preview lifetime/keyboard focus, native PageDown scrolling in the existing long
preview, real template PUT/open and localized POST feedback. Focus is asserted
directly and scrolling waits for actual scrollTop movement, without a fixed sleep.
Host write/collision semantics are not repeated: POST failures/success and broken
catalogs are injected at transport, while creation uses a real scratch file.
This representative flow adds no subprocess or theme/content cross product.
Measured final local scenario time is about 12 seconds; the gallery, representative
layout and quiet-document run takes about 1.2 minutes including runner setup.
The existing `layout-rules` and `quiet-document` cover the shared shell.
`desktop-updates` keeps its real Tab route through the new gallery entry, Docling
and Settings. The original fixed Explorer-to-Docling assertion failed in CI;
the updated check asserts each stop rather than skipping focus/order validation. Manual
captures are separate from automatic assertions; see [gallery visual review](#gallery-visual-review).

Placeholder substitution, folder templates and Docling result formatting (#1103)
remain outside this contract. Phase 3 extends the existing generated-environment
test with consent, live catalog and CLI command guidance assertions. Existing CLI
template tests verify list/read/save/create and refusal paths; no duplicate write
harness or real model call was added for phase 3. #1128 extends the existing fake app-server test with tool registration, captured permissions, template save/create/read and receipt history. One real CLI read from that fake child proves PATH execution; the same test asserts parent PATH preservation. The existing ai-result browser case uses an actual template creation receipt for Open/guarded Undo (12 seconds locally). Existing packaged Desktop CLI CI adds one template read through the private launcher while optional CLI integration is off; no new packaging run or local install/update/uninstall is added. Core preservation assertions also
check the YAML marker comment before and after template creation.

## Gallery visual review

Windows persistent Chrome, Korean, Plum, 100% zoom, 1000px height; 1440px Light
and 640px Dark. The ordinary document view demonstrates the new sidebar entry;
the gallery is a new surface with no previous product counterpart. Manual review
checked row centers, control padding, Korean wrapping, internal scrolling,
viewport clipping, dark contrast and the Settings/Docling task-tab conventions.
The reading preview removes the unused empty title slot and table authoring-tool
gutters locally (the regression first failed with a 76px heading-to-table gap); normal document rendering remains unchanged. At the Ratings
heading, the table keeps the ordinary block gap instead of the extra 60px gutter.

| State | 1440px Light | 640px Dark |
| --- | --- | --- |
| Before document shell | [Before](assets/template-gallery-936/before-document-1440.png) | [Before](assets/template-gallery-936/before-document-640.png) |
| After document shell | [After](assets/template-gallery-936/after-document-1440.png) | [After](assets/template-gallery-936/after-document-640.png) |
| Gallery | [Cards](assets/template-gallery-936/after-gallery-1440.png) | [Cards](assets/template-gallery-936/after-gallery-640.png) |
| Preview open | [Preview](assets/template-gallery-936/after-preview-1440.png) | [Preview](assets/template-gallery-936/after-preview-640.png) |
| Preview scrolled to table/equation | [Scrolled](assets/template-gallery-936/after-preview-scrolled-1440.png) | [Scrolled](assets/template-gallery-936/after-preview-scrolled-640.png) |

[Capture body](assets/template-gallery-936/capture.browser.js) runs manually as a
temporary replacement of `quiet-document.browser.js` through `pnpm browser:test
quiet-document --screenshots`, then restores the original. It saves the existing
technical sample as a named checkout-local user template through the real POST UI.
Seed its `diagram.svg` beside the template first: relative assets are not copied
by the phase-1 contract. Delete only those two owned fixtures after capture.
The shared user directory is never used. Captures and their body are manual
review evidence, not automatic success checks. Large traces/build output remain
ignored under `tmp`.

The new gallery strings use a bundled i18next `templates` namespace. Adding all
20 strings to the existing default namespace alone reproduced TypeScript 7.0.2
`TS2859` on an otherwise unchanged baseline; separating the resource-key types
preserves typed keys/interpolation without changing compiler checks or dependencies.

`litzio create` prints the created file path on one line on success, for both empty and template documents. `--format json` retains the shared creation receipt.
