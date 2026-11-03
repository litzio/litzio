# Document templates v1

- Status: Implemented
- Last verified: 2026-11-04 — Core metadata/round-trip, CLI, shared Host routes and Desktop protocol adapter tests; no packaged Desktop or gallery UI verification.
- Scope: #936 phase 1, Core semantics and thin CLI/Host interfaces. Gallery and assistant integration are subsequent phases.
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
Neither default declares `bibliography`.

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
and assistant should use the same ID and source contract; no gallery UI,
generated AGENTS.md/guide change or assistant prompt/tool integration is included.
The assistant's later permission-before-application flow remains phase 3.

## CLI

```text
litzio templates list [--json] [--language <ko|en>]
litzio templates read <name|id> [--json] [--language <ko|en>]
litzio templates save <name> --from <file> [--description <text>]
litzio create <file> [--template <name|id>] [--language <ko|en>]
```

List JSON matches the Host catalog. Read prints Markdown, or the content record
with `--json`. Save prints the saved content record as JSON. CLI uses the same
store and Core operations, strict UTF-8 and existing `create` exclusive write;
it does not implement YAML/AST semantics.

## Verification scope

Existing Core native tests own valid/malformed metadata, immutable operations,
other-metadata/body preservation and canonical repeatability. Existing CLI tests
exercise in-process command parsing/output, shared storage and create/reopen;
no new subprocess is added. Existing Editor Host tests own localized default
previews, HTTP transport, filesystem collision/no-overwrite, Root refusal and
broken-file reporting, with one temporary listener closed by test cleanup.
Host path tests cover source/packaged location calculation without writing the
shared user folder. The existing Desktop protocol test verifies forwarding its injected Host run directory and using the shared save/create routes, without packaging or a new listener. This adds no browser scenario or visual surface.

Placeholder substitution, folder templates, Docling result formatting (#1103),
gallery UI and assistant integration are outside phase 1.
