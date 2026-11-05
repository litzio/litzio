# Generated views v1

- Status: Implemented
- Last verified: 2026-11-05 — Core/file-commit and Host/HTTP/CLI tests; provider stdio boundary tests, production browser generation/favourite/reopen/manual refresh/CLI equality and 1440px/640px captures; actual Codex gpt-6-luna low proposal/correction/exhaustion. Copilot generation uses fake ACP/browser evidence, not a paid live Copilot response.
- Authority: [ADR-0020](../adr/0020-plugin-architecture.md), [#1210](https://github.com/litzio/litzio/issues/1210).
- Scope: Core v1, file-commit exclusive creation, built-in statistics, Host/CLI operations, shared bundled rendering and both assistant adapters. No plugin SDK scope expansion, external data, settings migration or data migration.

## Definition and binding

`@litzio/core/views` owns validation, canonical JSON and evaluation. Definitions use `kind: litzio-view`, `schemaVersion: 1`, `catalog: litzio-v1`, `refresh: manual`. `sources.stats` names only the built-in read operation `folder.statistics`, version 1. `args` is empty or has a relative `folder` filter; absolute paths, traversal and URLs are rejected. Runtime Host/root identity is supplied separately and is never a persisted field.

`layout` is one `VerticalPanel` with 1–8 Table or BarChart children. Each panel has title, source `stats`, result path `/rows`; Table binds unique columns and BarChart binds x/y. Source output fields are `folder` (string), `documents` and `headings` (nonnegative safe integers), `modified` (UTC ISO timestamp with milliseconds or null). Chart y must be numeric. Unknown properties, versions, components, actions, operations, fields, result paths, arbitrary code, remote resources and transforms are rejected. Labels are plain text, never markup. SDK plugin generatedUi/views remain unsupported; built-in statistics do not extend the SDK.

Strict JSON definitions contain only the specification and query, with no data, Host URL, hostId, credentials or conversation properties. Canonical serialization sorts object keys by code unit, preserves array order, normalizes defaults, uses two-space indentation and ends with LF. Input and canonical output must fit 32 KiB UTF-8; labels have 160-character limits. Results have at most 2000 rows; exceeding limits fails rather than truncating the input silently.

## Evaluation

`evaluateView` validates raw rows before applying at most eight filters, grouping/aggregation, sorting and limit, in that order. `eq` is exact typed equality including null dates; `contains` is case-sensitive substring matching on folder; `range` has inclusive min/max on numeric fields or timestamps. At least one bound is required, null bounds and reversed ranges fail, and null row dates never match a range.

One optional `groupBy` and one `aggregate` must occur together. Group by folder/documents/headings uses exact values. Modified dates require interval day, week or month: UTC day, Monday-start UTC week (labelled with Monday's date), or UTC calendar month. Null dates form a separate null group. Aggregates are count (row count) or sum/avg/min/max over documents/headings. Output then has only `group` and numeric `value`; raw-field bindings are invalid. An empty input yields no groups. No join, expression, formula, multi-field group or custom statistics are accepted.

Rows are first ordered by folder/documents/headings/modified, using locale-independent comparison (null first), so input order cannot change floating point accumulation. Groups default to ascending group key; raw rows default to that same field ordering. Optional sort uses an output field and asc/desc, preserving deterministic ties. Limit defaults to 2000 and applies last. Non-finite aggregate results fail. UI and CLI must consume this output without recalculating it.

## New-file publication

`@litzio/file-commit.createFile` writes UTF-8 to a unique temporary sibling, flushes and closes it, then hard-links the complete inode to the requested new name. Publication atomically refuses an existing directory entry, including symlinks. There is no pre-created empty target and no rename fallback on filesystems without hard links. Failures clean the temporary file; a process crash can leave a temporary sibling, but the target is absent or complete. This is process-crash protection, not a promise of directory durability after power loss. Existing `commitFile` replacement semantics do not change.

The caller owns allowed-directory checks and safe favourite names. This primitive does not create parent directories or enforce Host Roots. A saved favourite must always use a new name; existing-view update/migration is outside this contract.

## Verification ownership

Core tests cover strict rejection, field/type bindings, canonical reparse, filter order, deterministic aggregates and UTC buckets. File-commit tests cover complete publication, duplicate refusal, competing creators and write/flush/link failures with existing-file preservation. These are different boundaries; future Host/CLI/browser tests verify integration rather than repeat every Core input combination.

## Host operations and CLI

`POST /api/views` takes a strict action input and returns a requestId, operation (`view.validate/save/run/list/open`), version 1, scope, outcome and timestamp receipt. Validation/storage/open/list use Host scope; run uses folder scope and returns the real root target and Core rows. Failure is an error with failure receipt, never empty successful data. The common handler is shared by Vite and HTTP daemon; CLI sends to an explicit Host after protocol checking and never falls back or replays a request. Transport loss after dispatch is uncertain.

```text
view validate <file> --host <origin> --json
view save <file> --name <new-name> --host <origin> --json
view run <file> --root <opened-folder> --host <origin> --json
view run --name <saved-favourite> --root <opened-folder> --host <origin> --json
view list --host <origin> --json
view open <name> --host <origin> --json
```

The built-in source owns the `litzio.statistics` data namespace. save/list/open require that exact plugin id, and the CLI supplies it. Favourites live in `<Host settings directory>/plugins/litzio.statistics/views/<name>.view.json`; clients cannot choose a storage path. `LITZIO_DATA_DIR` or `LITZIO_PLUGINS_SETTINGS_FILE` isolates this location. Names follow shared safe-file-stem rules, NFC, at most 100 characters; case variants of an existing name are refused. Save always uses exclusive new-file publication. At most 200 favourites are accepted. Open only reads and validates a definition, without a root, query, LLM call or automatic data refresh. List returns names and open returns the definition; no document-folder file appears.

Run requires an explicit root checked against Host file access, then pins a narrower RootAccess for traversal. It recursively reads non-hidden, non-symlink directories and native `.md` files; ordinary Markdown is ignored, malformed UTF-8/native data fails. Each visited folder gets a row, including empty folders; documents/headings count direct children only, modified is their latest mtime (null when no native documents). Nested folder counts are separate rows. Frontmatter titles are not heading blocks. Limits: 1000 examined Markdown files, 1 MiB per file, 5000 directory entries, depth 16 and 2000 output rows; excess fails. This operation uses no network or secret and does not extend plugin SDK scopes.

`apps/editor/test/views.test.ts` checks Host-created favourites, collision and path rejection, definition-only reopen with the root absent, explicit rerun after document changes and identical aggregated HTTP/CLI rows, root and receipt meaning (excluding per-run requestId/time). Its server/data directories are isolated and closed/deleted after the test.

## Basic UI, generated tabs and favourites

Sidebar and Command center → Document statistics open a Host-bound task tab. Its basic Table is always available and is never replaced by a generated/saved view. The opened-folder selector fixes the runtime root for a query. A first generated view also ensures that Host's basic tab exists. Basic, generated and favourite views use the same bundled `ViewRenderer` (native Table, meter BarChart, vertical panel), shared Button/Input/Dialog/Notice, existing document task tabs and product tokens. There is no remote JS/CSS or HTML rendering, new editor engine or settings-screen migration. Table overflow scrolls inside the panel at the supported 640px minimum width.

Every successful proposal or favourite open creates a **new tab**, retaining the selected Host and optional runtime root. A favourite can open without a root: only the definition is needed. Its opened-folder selector lets the user choose a query root later; selection alone does not query data. Opening draws the validated specification without LLM calls or data queries; Refresh data explicitly runs the shared Host operation. No view tab automatically runs, polls data or restores a definition at app startup. View tabs have no document Save/draft/recovery session. Closing a tab does not delete the favourite. Host removal requires closing its view tabs, as with other Host work; it cannot rebind to another Host.

★ 즐겨찾기에 추가 opens a new-name Dialog. It never overwrites the basic UI or an existing favourite. On success the originating Host's basic tab refreshes its favourite list; names in that list open the stored definition only. Duplicate save retains the dialog/input and shows the failure. Refresh favourites is a separate list read and does not query document data. Stored files still contain only definition/query; root paths, data and conversations remain outside them.

## Assistant proposal and correction

The existing Assistant composer has Generate view and an opened-folder selector. The user's current provider/model/reasoning selection and conversation are captured for the entire sequence. Normal Send remains normal chat. Generation calls the existing conversation Host operations and Codex app-server/Copilot ACP adapters; it does not create a separate CLI-based model interface or default-model policy.

`viewGeneration: true` sends the finite Core catalog in the existing read-only context envelope. Host forces that turn to read-only with no document paths, references or opened-folder contents, rejects app dynamic tools, and denies Copilot permission requests. Human messages stay readable; provider context/schema is stripped by the existing transcript context boundary. This is narrower than the user's normal conversation permissions, not a sandbox for malicious trusted Node code.

Only the completed turn's assistant text can become a proposal. Partial responses never validate/render. The app parses one complete JSON object (or one JSON code fence) and asks `view.validate`. A parser/schema rejection is shown in the generation progress list and returned as a visible correction message in the **same conversation/model/effort/provider**, at most twice. All three invalid proposals end in explicit failure. Host/transport/provider errors do not trigger model correction or alternate models. Stop aborts polling, interrupts the same conversation and cannot publish a late result. Generation locks composer/model controls until completion; a new conversation clears its progress display. Each turn is bounded to 180 seconds, with an explicit timeout and manual stop if still active.

Successful validation opens a new tab with the definition. Rendering authorizes no save or document mutation. The user separately refreshes data or adds a favourite. Opening favourites never invokes the assistant.

## Integration evidence

`pnpm browser:test generated-views` is a production HTTP scenario, included in both platform HTTP CI jobs. Assistant replies are fixtures for deterministic UI testing; actual Host validation, statistics, safe favourite storage and CLI execution are real. It checks a deliberately bad binding → visible correction on the same model → new tab → data refresh → save → duplicate refusal → basic list → definition-only reopen without new model/query calls → manual refresh → CLI aggregate equality. Both provider choices pass through the same app path. `--screenshots` separately saves `tmp/1210-evidence/captures/generated-{1440,640}.png` and `favourites-{1440,640}.png` for manual review.

The generation state-machine tests own the two-correction cap, final-only parsing, cancellation, changed conversation/model/effort rejection and no transport fallback. The existing provider tests add real child-stdio checks for both catalog envelopes, readable transcripts and tool denial. They do not repeat Core field/aggregation combinations.

Actual Codex verification used **gpt-6-luna, low** and the same app generation helper and Host conversation adapters, with an isolated checkout `tmp` assistant cwd. Normal output passed first validation. A deliberately injected invalid `authorEmail` binding used an actual Core diagnostic and succeeded after one correction; injecting it for all proposals exhausted the two-correction limit and failed explicitly. These are controlled error-injection cases, not observed natural model-error rates. All runs stayed in the same per-case thread/model and recorded zero tool calls. Raw definitions/results and timings are under `tmp/1210-evidence/real-ai/`; no live Copilot model response or installed Desktop/remote Host execution is claimed.
