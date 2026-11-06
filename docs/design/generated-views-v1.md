# Generated views v1

> 후속 설계: [동적 뷰 재정의 v1](dynamic-views-v1.md)은 Draft다. 두 데이터 종류·우측 보기·플러그인 화면·V7 선행 구현을 제안하며, 아래 현재 구현/기존 로드맵의 완료 주장과 구분한다. 수락 시 변경되는 범위는 새 설계와 ADR-0020 개정안을 따른다.

- Status: Implemented
- Host assembly (#1246): `host-services.ts` composes independent plugin and view services and lazily initializes the assistant. Plugin management/secret routes belong to `plugin-service.ts`; views receive that same plugin runtime explicitly through `view-service.ts`. Assistant shutdown closes only its provider/conversation resources; Host shutdown closes plugins independently, including when assistant initialization or shutdown fails. Views retain no separate runtime resources. Request paths, lazy plugin start, receipts and stored formats are unchanged.
- Last verified: 2026-11-06 — V3 query forms/states, keyword-specific field errors, public owner persistence and #1266 review entry fixtures; generated-views/HTTP recovery browser 2/2, targeted Host/CLI/plugin checks and visual-tokens. V2 Host/CLI evidence is retained below; external-service UI/CLI acceptance remains separate. Previous 2026-11-05 — #1218 fixture plugin schema Core/Host/CLI and generated-views browser scenario; actual Codex gpt-6-luna low via existing conversation adapter generated status/points grouping, validated and evaluated to open=5. Initial local HTTP recovery companion failed waiting for browser close after owned PID termination; final-build rerun passed 2/2. After separating fixture module paths to prevent import-cache reuse, combined http-plugins/generated-views passed 3/3. No timeout relaxation. Previous #1210 evidence: Core/file-commit and Host/HTTP/CLI tests; provider stdio boundary tests, production browser generation/favourite/reopen/manual refresh/CLI equality and 1440px/640px captures; actual Codex gpt-6-luna low proposal/correction/exhaustion. Copilot generation uses fake ACP/browser evidence, not a paid live Copilot response.
- Authority: [ADR-0020](../adr/0020-plugin-architecture.md), [#1210](https://github.com/litzio/litzio/issues/1210).
- Scope: V2 query Host/CLI supersedes v1 Host behavior as described below. Existing renderer/assistant call sites now use v2 query envelopes; V3 supplies forms/states and query/InputForm generation; V6 tools/cards and V4 completed-bundle review generation use the same authoring catalog. Historical Core v1, file-commit exclusive creation, built-in statistics, Host/CLI operations, shared bundled rendering and both assistant adapters. Includes #1218 operation row-schema declarations for active plugin reads; no external API, settings migration or data migration. The final V1 section documents the separately implemented catalog v2 Core/SDK layer, now consumed by the V2 query Host/CLI.

## D1 dynamic data contract (Core and SDK)

Implemented 2026-11-06 in Core/SDK only, following the [dynamic views design](dynamic-views-v1.md). This section supersedes the earlier component names and field/column limits throughout this document. Host/CLI assistant snapshot execution, screen entry points and assistant context integration remain D2/D3/D4 work; line/scatter/horizontal rendering remains V7 work. Their availability is not implied by schema acceptance.

Query definitions require `owner`. `sources.stats.kind: operation` retains manual refresh, operation/version/args and existing transforms/forms. `kind: assistant` requires assistant refresh, UTC millisecond `generatedAt`, public scalar `rowSchema`, complete inline `rows`, 1–64 `provenance` entries and optional plain-text `method`. `method` allows ordinary comparison characters such as `<` and `>`; renderers must display it as text, never interpret it as HTML. Its 4,096-character limit and rejection of disruptive control characters remain. It forbids forms, operation args and transforms. Owner authorization and provenance identity checks belong to the Host request boundary; Core validates their representation. Inline rows and provenance are the favorite snapshot: canonical `.view.json` needs no companion snapshot file. Operation favorites retain definition/args without result rows.

Operation definitions retain 32 KiB/2,000 rows/512-character strings. Assistant definitions allow 1 MiB UTF-8 (input and canonical), 10,000 rows and 4,096-character scalar strings/method. Labels remain 160 characters. Table columns and rowSchema fields have no count ceiling. Rows match declared fields exactly, numbers are finite, dates are UTC timestamps, and secret assistant fields are rejected. Canonical serialization sorts object keys by code unit, preserves every array order, normalizes schema defaults, uses two-space indentation and ends with LF.

`Chart` has `type: bar | line | scatter`, title/source/data/x/y and optional type-specific strict `options` (currently empty for each type; unknown keys fail). All y bindings are numeric. Line x is numeric or date, non-null, unique and strictly ascending after connected transforms or in supplied assistant order; nullable y remains a gap. Date groupBy outputs retain date semantics for line x: UTC day/week buckets (`YYYY-MM-DD`) and month buckets (`YYYY-MM`) are ordered and deduplicated by aggregation before the final line order check. Scatter x is numeric; duplicate coordinates and null coordinates remain in Core rows for the renderer's value list/exclusion reporting. `Panel` has `direction: vertical | horizontal`. Horizontal has exactly two leaf children; a vertical root may contain horizontal groups one level deep. All layouts have at most eight leaves. Review remains a separate profile with a vertical Panel and its existing review bindings. No aliases or migration read old component names.

SDK `contributes.screens` references 1–8 unique query view IDs from the same manifest. Screen IDs are unique, at most one is primary, and `SCREEN_ICONS` is the bundled icon-key allowlist (`LayoutDashboard`, `Table`, `ChartColumn`, `FileText`, `Folder`). Default definitions must use the plugin's owner; connected sources must bind that same plugin's declared operations. `validateManifest` rejects invalid contributions before entry execution. Core limits, schemas and types are re-exported by the SDK.

Regression coverage lives in the existing Core views and SDK manifest test suites. Core owns source/row/binding/limit/chart/layout combinations; SDK tests screen declarations and plugin ownership. Existing Host/CLI/browser fixtures exercise operation queries with the new wire form. These fixtures do not prove live AI synthesis, remote provenance availability or the later renderers.

## V2 query Host and CLI

Implemented 2026-11-06: `server/views.ts` accepts catalog v2 query definitions through Core `views-v2`. No v1 reader or migration is provided; rejected files remain intact. This section supersedes the v1 Host/storage/CLI behavior below. Earlier renderer/assistant evidence describes v1. V2 also updates existing call sites to emit/parse v2 query definitions so this PR works independently; V3/V6 own the new forms/states and proposal tools/cards.

`POST /api/views` adds `catalog` (public Core schema, limits, current operations with their Host-owned `plugin` identity and `{plugin,id,title,definition}` contributed views) and `propose` (same validated definition, canonical JSON, inputState and receipt as validate; no query/save/UI action). SDK validates contributed query definitions against the same plugin's operations before executing its entry. PluginHost owns loaded declarations and operation identity; view-service has no state or independent lifetime. Disabling removes contributed views from catalog. Open/validate/run recheck current operations and versions. Base UI can consume catalog operations independently of explicit views; fallback forms and unsupported-input presentation belong to V3.

The existing statistics definition, renderer structural check and assistant generation context now use v2 query types/schema. Favorite save lets Host infer ownership. The existing basic favorites list reads plugin identities from the POST catalog and issues list/open in each owning namespace; labels, controls, tab lifetime and rendering are unchanged. Existing error presentation includes safe inputIssues paths/keywords. These are call-site changes, not a v1 compatibility layer or V3 renderer implementation. Existing Button/Dialog/Notice/Tooltip implementations and visual tokens are reused with no layout changes.

CI diagnosis: `generated-views` first failed at the basic statistics table because its old v1 definition was refused by the v2 Host. The later invalid-binding correction/duplicate-save steps never ran, hence the secondary missing-HTTP-failures error. The browser fixture now supplies a v2 proposal and explicitly selects the plugin namespace in CLI run. All interaction/row/correction/cancellation assertions and the expected two HTTP 400 failures remain unchanged. Verification: production `pnpm browser:test http-host http-plugins plugin-jobs generated-views` passed 5/5 on Windows (about 1.3 minutes), including Save/Reload/conflict/reconnect. No actual external service or live model was used.

Generation exposure uses the common query/review schema in `shared/view-generation.ts`. Default and per-plugin contexts accept fixed-args/InputForm queries and review definitions for explicitly supplied completed bundles on the same Host. Context tests accept both profiles; Host validate/propose additionally checks the actual review source before returning a result card.

### Catalog HTTP contract (V2 authority)

The single catalog endpoint is **`POST /api/views`**, with `Content-Type: application/json` and body **`{"action":"catalog"}`**. It follows the same action/receipt dispatch as the other view operations. `GET /api/views/catalog` is not a supported API. V3 must consume **`response.catalog.operations`**, not `response.operations`.

A successful response (HTTP 200) has this structure:

```json
{
  "catalog": {
    "schema": {},
    "limits": {},
    "operations": [
      {"plugin":"example.jira","operation":"example.jira.search","version":1,"inputSchema":{},"rowSchema":{}}
    ]
  },
  "views": [{"plugin":"example.jira","id":"issues","title":"My issues","definition":{}}],
  "receipt": {"requestId":"...","operation":"view.catalog","version":1,"scope":"host","outcome":"success","timestamp":"..."}
}
```

The empty objects above stand for Core's actual public schema, limits, row/input schema and validated definition. A read operation whose input schema cannot pass Core's persistence/public-schema check (for example `anyOf`) is omitted individually from `catalog.operations`; it does not fail the catalog or hide built-in statistics/other supported operations. Its ordinary plugin operation remains callable through the operation API. No unsupported schema or exception text is published. CLI `view catalog` returns this exact envelope with an added `host` field.

Save resolves the owner from the registered source operation; only `folder.statistics` uses `litzio.statistics`. An optional supplied plugin must match. New files use file-commit exclusive creation at `<Host settings directory>/plugins/<plugin>/views/<name>.view.json` with the existing 200-file limit per collection. List/open/named run select a plugin namespace. Duplicate names never overwrite. Only canonical definition/args are persisted.

Run/save accept optional `input`, replacing the entire source args object before Core validation. Missing form-bound required inputs may be saved/proposed with `inputState: {state:"needs-input",missing:[...]}` but cannot execute. Run applies the original full input validator before invoking. Secret/writeOnly/password input remains fail-closed. Open restores the definition/args and inputState without querying or requiring a document Root. Run returns effective `args`, Core rows, public fields, root target and receipt. Plugin results use `publicOperationResult`; failures preserve #1233 fixed errorKind/message and safe source receipt. Local refusals use fixed messages and code (`unavailable`, `owner-mismatch`, `invalid-view-request`) without publishing exception/schema-input text. Unavailable/version-changed favorites remain on disk. A removed, secret or incompatible bound output field also returns `code: unavailable` and fixed new-view advice; binding checks remain Core-owned.

### Input refusal contract

Input-value rejection returns HTTP 400 with `{error, code:"invalid-input", inputIssues: {field?: string; keyword: string}[], receipt}`. `error` is fixed Host advice; receipt has failure outcome and the requested view operation. `field`, when present, is a JSON Pointer relative to the effective args object (for example `/preset` or `/filters/0/name`). Required-field errors use the missing declared public field's path. `keyword` is the validator keyword, such as `required`, `type`, `enum`, `minLength`, `pattern` or `format`. Core persistence limits also use `maxLength`, `additionalProperties` or `secret`. Secret/unknown field names are omitted, as are their values; no raw schema message, pattern, enum candidates or validator params are published. A semantic validator refusal without schema diagnostics has an empty array.

For example: `{"error":"View inputs are invalid. Check the indicated fields.","code":"invalid-input","inputIssues":[{"field":"/preset","keyword":"required"}],"receipt":{...}}`. Missing form-bound input is still allowed in static validate/save/open (`inputState: needs-input`); executing it produces this input refusal. A non-object replacement `input` produces `[{keyword:"type"}]`. CLI preserves the identical inputIssues structure. Input refusals do not carry #1233 `errorKind`; plugin execution errors keep their fixed #1233 `errorKind` and have no inputIssues. Invalid view structure/storage and unavailable source remain separate refusal categories.

CLI `view catalog`, `view propose <file>`, `view run <file> --input <args.json> --root <root>`, `view save <file> --input <args.json> --name <name>`, `view list --plugin <id>`, `view open <name> --plugin <id>` and `view run --name <name> --plugin <id> --root <root>` use the same Host handler. Explicit `--host` is required. CLI adds only `host`; independent requests have different receipt IDs/timestamps. Save infers the plugin; list/open/named run default to built-in statistics when plugin is omitted.

The existing `views.test.ts` now checks HTTP/CLI over one real Host/plugin child with a six-value preset schema and one representative changed preset: five-column Jira-style rows, whole-args replacement, propose/catalog, new storage, definition-only open, input restoration, manual run, safe input diagnostics, authentication classification, per-operation catalog exclusion, removed-column/disable/version-change refusal and file preservation. This fixture does not claim actual Jira, browser renderer or assistant acceptance. Existing statistics/file tests remain; Core input combinations are not duplicated.

## Definition and binding

`@litzio/core/views` owns validation, canonical JSON and evaluation. Definitions use `kind: litzio-view`, `schemaVersion: 1`, `catalog: litzio-v1`, `refresh: manual`. `sources.stats` names a registered read operation and its declared version. Only operations with a row schema participate. Core receives declarations explicitly; its default registry contains `folder.statistics` v1. Host adds active plugin operations as `<plugin-id>.<operation-id>`, validating `args` against their input schema before invoking them. The statistics declaration accepts empty args or a relative `folder`; absolute paths, traversal and URLs are rejected. Runtime Host/root identity is supplied separately and is never a persisted field.

`layout` is one `VerticalPanel` with 1–8 Table or BarChart children. Each panel has title, source `stats`, result path `/rows`; Table binds unique columns and BarChart binds x/y. The built-in statistics output fields are `folder` (string), `documents` and `headings` (nonnegative safe integers), `modified` (UTC ISO timestamp with milliseconds or null). Chart y must be numeric. Unknown properties, versions, components, actions, operations, fields, result paths, arbitrary code, remote resources and transforms are rejected. Labels are plain text, never markup. SDK generatedUi remains unsupported; SDK views declarations use the v2 contract layer below and do not change this v1 runtime. A read operation may declare `rowSchema`, independently of those contribution points. Plugin operation results are arrays of rows; their ordinary outputSchema validation still applies.

Strict JSON definitions contain only the specification and query, with no data, Host URL, hostId, credentials or conversation properties. Canonical serialization sorts object keys by code unit, preserves array order, normalizes defaults, uses two-space indentation and ends with LF. Input and canonical output must fit 32 KiB UTF-8; labels have 160-character limits. Results have at most 2000 rows; exceeding limits fails rather than truncating the input silently.

## Operation row schema (#1218)

Core owns `rowSchema` and `RowSchema`; SDK re-exports them and accepts the optional declaration on read operations only. A declaration maps field names to `{type, label, date?, nullable?, secret?}`. Types are string, number (numeric), boolean; dates are strings flagged `date: true` and require UTC ISO timestamps with milliseconds. Defaults for date/nullable/secret are false. Labels are plain text. There are one or more fields without a count ceiling, with names limited to 80 characters; `group` and `value` are reserved and cannot be declared. No migration or compatibility layer is provided.

All filters, grouping, aggregates, sort and panel bindings resolve against that operation's public fields. Date fields require day/week/month grouping; other types forbid intervals. Contains requires non-date strings; ranges require numbers or dates. Sum/avg/min/max require numeric fields and fail explicitly if a member value is null. Grouped output is `group`/`value`, with numeric group only for a numeric grouping field. Secret fields cannot be bound, filtered, grouped or sorted and are omitted from assistant catalog/schema context. The shared plugin-operation return boundary (`publicOperationResult`) first applies known-secret redaction (`safePluginValue`), validates the outputSchema, then uses Core `parseOperationRows` to validate declared field values and strip secret fields before publishing any result. Generic operation invoke (HTTP/CLI/assistant) and views all receive these public rows. A mismatch returns a failure receipt without the result. Plugin source failures preserve the Host `errorKind` and fixed advice from the [operation failure contract](plugin-stage1-v1.md#작업-실패-공개-분류-1233); manual refresh displays that kind and advice in the existing Notice. Raw exception or service response text is never published. Core evaluation reuses that same idempotent row parser, including for built-in statistics; secret fields already stripped by the boundary need not be present. Undeclared result fields are also removed. The assistant context is generated from the target Host's current read-operation declarations for both providers.

The target Host validates operation semantics before definitions reach the bundled renderer. The renderer checks catalog structure and uses returned field labels for table headers. It never reimplements transformations. Favorites currently use the existing app-owned `litzio.statistics` collection and controls, including plugin-backed definitions; this change does not add plugin UI surfaces or new components. Opening still does not invoke the plugin; a disabled/unavailable source fails explicitly at validation/reopen/run.

## Evaluation

`evaluateView` validates raw rows before applying at most eight filters, grouping/aggregation, sorting and limit, in that order. `eq` is exact typed equality including null dates; `contains` is case-sensitive substring matching on declared non-date strings; `range` has inclusive min/max on numeric fields or timestamps. At least one bound is required, null bounds and reversed ranges fail, and null row dates never match a range.

One optional `groupBy` and one `aggregate` must occur together. Group by a non-date field uses exact values. Date fields require interval day, week or month: UTC day, Monday-start UTC week (labelled with Monday's date), or UTC calendar month. Null dates form a separate null group. Aggregates are count (row count) or sum/avg/min/max over declared numeric fields. Output then has only `group` and numeric `value`; raw-field bindings are invalid. An empty input yields no groups. No join, expression, formula, multi-field group or custom statistics are accepted.

Rows are first ordered by public fields in declaration order (folder/documents/headings/modified for statistics), using locale-independent comparison (null first), so input order cannot change floating point accumulation. Groups default to ascending group key; raw rows default to that same field ordering. Optional sort uses an output field and asc/desc, preserving deterministic ties. Limit defaults to 2000 and applies last. Non-finite aggregate results fail. UI and CLI must consume this output without recalculating it.

## Signed bar rendering

The bundled BarChart uses the existing accent/surface/text-muted palette and spacing tokens, with a shared zero baseline across rows. Negative bars extend left from zero, positive bars right, and zero has no fill. The domain includes zero and all returned values; all-negative and all-zero domains remain valid. Accessible meter values expose the signed value and domain. This replaces the native meter's zero-clamping assumption without adding a component or changing the panel/control layout. Geometry normalization avoids overflow for finite numeric extremes.

The generated-views browser fixture includes negative/zero/positive values and checks rendered bar direction relative to the baseline. Manual renderer comparison: [1440px Before](assets/generated-views-1218/before-1440.png) / [After](assets/generated-views-1218/after-1440.png), [640px Before](assets/generated-views-1218/before-640.png) / [After](assets/generated-views-1218/after-640.png); [capture metadata and renderer-only baseline scope](assets/generated-views-1218/capture-metadata.json). The existing spacing and accent/surface/text-muted tokens are reused; no new common interaction or control is introduced. Its CLI operation invoke also checks secret removal and result-type refusal. This is distinct from Core's transform tests and Host's return-boundary regression.

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

Every successful proposal or favorite open creates a **new tab**, retaining the selected Host and optional runtime root. A favorite can open without a root: only the definition is needed. Its opened-folder selector lets the user choose a query root later; selection alone does not query data. Opening draws the validated specification without LLM calls or data queries; Refresh data explicitly runs the shared Host operation. No view tab automatically runs, polls data or restores a definition at app startup. View tabs have no document Save/draft/recovery session. Closing a tab aborts its pending view requests and discards late results, so a delayed favorite open cannot create another tab or recreate the basic tab. Closing does not delete the favorite. Host removal requires closing its view tabs, as with other Host work; it cannot rebind to another Host.

★ 즐겨찾기에 추가 opens the shared new-name Dialog, proposing the view title as the editable name. It never overwrites the basic UI or an existing favorite. On success the originating Host's basic tab refreshes its Favorites list; starred names in that list open the stored definition only. Duplicate save retains the dialog/input and shows the failure. The list header's Refresh favorites icon button reads the list without querying document data; an empty list shows a short hint. English UI follows the glossary's American spelling; the existing `favourites` API result field is unchanged. Stored files still contain only definition/query; root paths, data and conversations remain outside them.

The shared renderer labels the root folder `.` as `(Root)` / `(최상위)` in table and chart text only, including folder grouping. Core rows and CLI JSON retain `.`. A completed query shows only a local hour/minute (`Queried: 16:07` / `조회: 16:07`); the shared Tooltip holds the full operation/version, scope, root, ISO timestamp and request ID.

## Assistant proposal and correction

The existing Assistant composer has Generate view and an opened-folder selector. The user's current provider/model/reasoning selection and conversation are captured for the entire sequence. Normal Send remains normal chat. Generation calls the existing conversation Host operations and Codex app-server/Copilot ACP adapters; it does not create a separate CLI-based model interface or default-model policy.

`viewGeneration: true` sends the finite Core catalog in the existing read-only context envelope. Host forces that turn to read-only with no document paths, references or opened-folder contents, rejects app dynamic tools, and denies Copilot permission requests. Human messages stay readable; provider context/schema is stripped by the existing transcript context boundary. This is narrower than the user's normal conversation permissions, not a sandbox for malicious trusted Node code.

Only the completed turn's assistant text can become a proposal. Partial responses never validate/render. The app parses one complete JSON object (or one JSON code fence) and asks `view.validate`. A parser/schema rejection is shown in the generation progress list and returned as a visible correction message in the **same conversation/model/effort/provider**, at most twice. All three invalid proposals end in explicit failure. Host/transport/provider errors do not trigger model correction or alternate models. App-owned progress, correction and failure text has English/Korean translations; Core/provider diagnostic details remain intact.

Each attempt is bounded to 180 seconds, including awaited HTTP responses. Stop, disposing the assistant panel and timeout abort prepare/send/poll/validate fetches and discard late results. Cancellation immediately releases the generation's pending UI state, including composer, model and new-conversation controls; a new conversation clears its progress display. Before each send the app prepares an opaque Host cancellation handle (`prepare-view-generation`); the send carries `viewGenerationRequest`, and cancellation sends `cancel-view-generation` independently of the aborted transport. No model turn starts until preparation has completed. Host retains cancellation while diagnostics/provider admission await a conversation ID, then interrupts that eventual exact turn; it never interrupts a later unrelated turn in the same conversation. Handles expire after 180 seconds and are bounded, daemon-owned, transient state. Aborting a save/read transport does not roll back a completed Host operation.

Successful validation opens a new tab with the definition. Rendering authorizes no save or document mutation. The user separately refreshes data or adds a favourite. Opening favourites never invokes the assistant.

## Historical integration evidence (v1)

The following records v1 acceptance. Current V3 renderer regression uses v2 fixtures as stated below; the V2 Host/CLI tests remain separate.

`pnpm browser:test generated-views` is a production HTTP scenario, included in both platform HTTP CI jobs. Assistant replies are fixtures for deterministic UI testing; actual Host validation, built-in statistics and a registered fixture plugin with status/points schema, safe favorite storage and CLI execution are real. It checks a deliberately bad binding → visible correction on the same model → new tab → data refresh → save → duplicate refusal → basic list → definition-only reopen without new model/query calls → manual refresh → CLI aggregate equality. Both provider choices pass through the same app path. Delayed favorite-open and generation-poll responses verify fetch cancellation, immediate control recovery and no late tab creation. `--screenshots` separately saves `tmp/1210-evidence/captures/generated-{1440,640}.png` and `favorites-{1440,640}.png` for manual review.

The generation state-machine tests own the two-correction cap, final-only parsing, delayed send/poll/validation cancellation, hung-request timeout, Korean progress, changed conversation/model/effort rejection and no transport fallback. Host tests delay provider admission and verify that cancellation interrupts the eventual real fixture turn. The existing provider tests add real child-stdio checks for both catalog envelopes, readable transcripts and tool denial. They do not repeat Core field/aggregation combinations.

Actual Codex verification used **gpt-6-luna, low** and the same app generation helper and Host conversation adapters, with an isolated checkout `tmp` assistant cwd. Normal output passed first validation. A deliberately injected invalid `authorEmail` binding used an actual Core diagnostic and succeeded after one correction; injecting it for all proposals exhausted the two-correction limit and failed explicitly. These are controlled error-injection cases, not observed natural model-error rates. All runs stayed in the same per-case thread/model and recorded zero tool calls. Raw definitions/results and timings are under `tmp/1210-evidence/real-ai/`; no live Copilot model response or installed Desktop/remote Host execution is claimed.

## Catalog v2 contract layer (V1)

2026-11-06: Core/SDK contracts, consumed by V2 query Host/CLI above; existing renderer/assistant query call sites use v2; new forms/states and tools/cards remain V3/V6. The v2 reader rejects v1, with no conversion or migration. [Design PR #1237](https://github.com/litzio/litzio/pull/1237) defines the split; its complete implementation is not claimed here.

`@litzio/core/views-v2` exports `catalogViewSchema`, `queryViewSchema`, `reviewViewSchema`, and `CatalogView`, `QueryView`, `ReviewView`. Definitions use schemaVersion 2, catalog litzio-v2, profile query/review and manual refresh. `validateCatalogView`, `parseCatalogView`, `serializeCatalogView` own strict binding validation and canonical JSON under 32 KiB. `evaluateQueryView` validates execution inputs and reuses the existing sole row-processing implementation. LineChart/HorizontalPanel belong to V7 and are not accepted yet.

Query retains sources.stats and /rows. `VIEW_LIMITS.columns` is 12 unique public columns; `VIEW_LIMITS.inputs` is 8 top-level scalar form fields. InputForm has Select/TextInput/DateInput/NumberInput/Checkbox and one SubmitButton. Args are the sole stored values. `validateViewInputs` static mode returns ready/needs-input and missing fields: only required properties bound by the form may be absent. Execute mode applies the entire original JSON Schema and operation validator. Unknown fields, invalid type/enum/date/range, secret/writeOnly/password bindings and unsupported nested/conditional forms are rejected. Optional removal, empty string and explicit null differ. Valid fixed nested args remain supported for direct `properties` and homogeneous `items` schemas. Before either persistence or public catalog creation, the same capability check rejects schema references (local/external/cyclic), composition/conditional applicators, pattern/tuple/schema-valued additional properties and unknown schema keywords. These constructs remain outside the v2 persistence capability even if Ajv accepts the original operation input; ordinary operation validation is unchanged. Secret declarations cannot bypass inspection through an unexamined applicator. Public schema filtering also recurses into array items, and refuses a secret schema at the root or item level. `compileViewInputSchema` uses Ajv without coercion or inserting defaults. `createCatalogV2` publishes the schema, limits and public operation fields.

Review persists only sources.review `{plugin,review,bundleRef}`. PageSurface/SourceDocumentCompare/ReviewList/ReviewDetail are allowed, query controls and arbitrary actions are not. `reviewBundleSchema`, `reviewPageSchema`, `reviewMappingSchema`, `reviewProposalSchema`, `reviewBaselineSchema` and their inferred types describe neutral completed data. Opaque references cannot be URLs. A document target uses a snapshot-local Core NodePath plus document revision/hash, never Editor positions. Page bbox bounds, pt/px units, TOPLEFT/BOTTOMLEFT origin and proposal action eligibility are validated. `REVIEW_LIMITS` publishes resource limits; V4 must enforce Host/Root ownership, generation consistency, list/image byte limits, baseline rechecks and official writes. Schema validation alone does not prove those runtime properties. `SourceState` supplies the shared state vocabulary without adding a service error classification.

Existing Core views tests cover v2 canonical round trips, missing versus executable inputs, scalar type/enum/date/range failures, 12/13 columns and unknown action/secret/cross-profile rejection. Secret regression cases cover `$ref`, allOf/anyOf/oneOf, conditional/pattern/additional-property paths, cyclic/external references, and nested array redaction; safe fixed nested inputs still round trip. SDK manifest tests check same-plugin operation/version/effect bindings before entry execution. No browser, external service or Docling acceptance is claimed.

## V3 query renderer (catalog v2)

공통 진입점은 `@litzio/core/views-v2`의 CatalogView를 받고 query/review를 분기한다. QueryViews만 stats args를 읽으며 review는 V5 ReviewRenderer로 전달한다. v1 reader나 migration은 없다.
폼 8입력·표 12열을 Core 계약대로 소비하고 자료 가공은 Host/Core 결과만 표시한다.
동작은 [공통 조회 패턴](ui-patterns-v1.md#query-renderer-v3), 조합은 [UI 결정표](ui-decision-table-v1.md#catalog-query-renderer-v3-1241-a안)를 따른다.

V2 Host가 병합된 상태에서 renderer 회귀는 generated-views browser 시나리오의 v2 fixture로 검증한다. Host/CLI 계약은 별도 대상 검사로 확인한다.
폼은 대상 Host의 `POST /api/views {action:"catalog"}` 응답의 `catalog.operations`에서 operation/version에 맞는 공개
inputSchema를 읽는다. 실행·신규 저장·열기는 기존 `POST /api/views` envelope를 사용한다.
V2의 실제 plugin namespace·입력·Host/CLI 검사는 유지하며, 외부 서비스까지 포함한 UI/CLI 동시 수락은 별도 gate다.
화면은 Core의 validateViewInputs(execute)를 사용한다. CSP에서 실행 가능한 @cfworker/json-schema 4.1.6 해석 evaluator를 Core compiler로 주입하고 Host의 기본 Ajv 검증은 유지한다. 날짜·길이·pattern·required 등 같은 schema를 검증하며 값 coercion/default 삽입을 하지 않는다. Core/Host의 ViewInputIssue(field, keyword)를 고정 필드 오류로 표시하고 원문 오류는 표시하지 않는다.
브라우저 fixture 통과를 실제 서비스·Host·비서 제작 수락으로 계산하지 않는다.

#1263 UI 보완의 입력/표시·폼 행동·스크롤 규칙과 캡처는
[조회 폼 패턴](ui-patterns-v1.md#query-form-refinement-1263)을 따른다.
입력 title과 Host field label을 소비하며 현재 v2 form 명세에는 enum 항목별 label slot이 없다.
renderer가 새 schema나 label DSL을 추가하지 않는다.

### V3 차단 결함 보완

- `POST /api/views {action:"catalog"}` 응답 `catalog.operations`의 operation별 `plugin`은 Host가 확인한 실제 소유자다. 통계만
  `litzio.statistics`를 사용하고 플러그인 조회의 save는 이 소유자를 보낸다. 소유자 확인 전에는
  저장을 막는다. 즐겨찾기 list/open도 `(plugin, name)`을 유지한다. operation 이름에서 소유자를 추측하지 않는다.
- Host의 실행 입력 거부는 실패 응답의 `code:"invalid-input", inputIssues: [{field?, keyword}]`로 전달한다.
  `field`는 `/text` 같은 JSON Pointer다. 앱은 이를 해석해 선언된 필드에만 오류를 연결하고 나머지는 form 오류로 표시한다. message/value는 소비하지 않는다.
- optional 입력을 비우면 args 속성을 제거한다. 빈 문자열이 명시적 const/enum 값이거나
  required 문자열이면 실제 빈 문자열을 유지하고 Core schema를 따른다. 지정된 빈 문자열의 X로 속성을 제거할 수 있다.
- CatalogView는 탭/비서 생성/즐겨찾기 결과를 그대로 통과한다. review는 `sources.stats`에
  접근하지 않고 `ReviewRenderer`와 Host별 adapter를 사용한다. adapter의 `POST /api/reviews`
  read 결과 `{snapshot, receipt}`는 V5의 ReviewSnapshot이며 action은 source/root/requestId,
  proposalId/baseline을 보낸다. Core read model 조립과 실제 write는 V4 소유이며 renderer에서 재구현하지 않는다.

현재 위 카탈로그 소유자·입력 진단·review transport 연결은 공용 fixture로 검증한다.
V2/V4의 실제 Host 서비스 통합과 CLI 일치는 별도 gate다. CSP는 완화하지 않는다.

V2의 `code:"unavailable"`은 삭제된 열·버전/가용성 변경으로 사용할 수 없는 뷰이며, service unavailable 작업 오류와 구분해 새 뷰가 필요함을 안내한다. 카탈로그 HTTP 계약은 작은 `readViewCatalog` adapter 한 곳이 소비한다.

### V2/V5 병합 뒤 생성 노출과 진입점

#1264·#1261·#1266 병합 뒤 query 생성 context에 Core query schema의 InputForm과
원래 inputs 한도를 다시 노출한다. V4에서는 명시적으로 제공된 같은 Host의 완료 bundle에 대한 review profile도 shared/view-generation.ts의 공용 schema/instruction에서 연다. 공통 진입점의 ReviewAdapter 계약은 #1266에서도 같으며 mapping이 없는 snapshot을
거부하지 않는다. mapping 없는 review의 제안 표시·허용 동작은 V5가 소유한다.

## V6 비서 결과 카드

Codex 일반 대화의 `view_catalog` → `propose_view`는 기존 Host `view.propose`를 호출한다.
Generate view도 같은 propose 검증 결과를 대화 카드에 둔다. 카드는 제목·검증 상태·수동 조회 안내와
공통 Button의 ‘뷰 열기’를 제공하며 수동 조회 안내는 tooltip에 둔다. 클릭 시 원래 Host로 재검증하고 새 탭을 열며 조회·저장하지 않는다.
즐겨찾기 저장은 탭에서 사용자가 요청한다. Copilot 일반 대화는 동적 도구가 없어 CLI 대안을 안내한다.
Generate view는 양 공급자에서 선택 모델을 유지하고 검증 실패만 최대 두 번 교정하며 진행을 보인다.
일반 도구도 한 turn에서 최초 제안과 두 번 교정까지만 허용한다. 공급자·전송 실패는 자동 교정하지 않는다.
대화는 turn과 도구 receipt, 카드는 검증 명세와 선택 Root, 열린 탭은 입력 초안·조회·저장 상태를 소유한다.
중단·패널 닫기·unmount는 생성 요청을 취소하고 늦은 결과를 버린다. 중단된 turn에는 카드를 표시하지 않는다.
일반 대화의 `view_catalog`도 `shared/view-generation.ts`의 동일 생성 catalog를 반환하며
공용 query/InputForm·review schema를 같은 생성 범위 정의에서 노출한다. review source는 사용자가 제공한 완료 plugin/review/bundleRef만 쓰며 참조를 발명하거나 다른 Host로 재연결하지 않는다. Host는 validate/propose에서 실제 완료 bundle과 기여 가용성을 재검증한다. view.propose는 문서 변경 제안이나 승인·Undo를 실행하지 않는다.

2026-11-06 검증: stdio fixture의 catalog/propose/교정 cap과 기존 취소 검사를 보완했다.
브라우저 generated-views fixture는 카드 → 새 탭 → 수동 조회와 일반 대화 도구 카드 경로를 검증한다.
실제 AI·Jira·Docling 수락을 뜻하지 않는다. PowerShell 7 예시는 격리 data directory의 localhost Host와
fixture.issues.read로 invoke/catalog/validate/propose/run --input/save를 실행했다.

1440px 수동 검토: [결과 카드](assets/catalog-v6/result-card-1440.png), [열린 탭](assets/catalog-v6/result-tab-1440.png).

V6 대화 표시 보완: 생성 명세는 ‘뷰 명세’에 기본 접힘으로 보관한다. 교정 메타데이터는
공급자 context와 사용자 item에 연결해 내부 교정 지시를 사용자 메시지로 표시하지 않는다.
진행은 최신 한 줄과 최종 교정 횟수로 압축하고 검증 실패는 고정 문구로 안내한다.
1440px [교정 없음](assets/catalog-v6/result-card-no-correction-1440.png)과
[교정 1회](assets/catalog-v6/result-card-1440.png)를 fixture로 확인했다.

V4 review의 Host·CLI·K1 완료 bundle은 [플러그인 1단계 V4 계약](plugin-stage1-v1.md#v4-공용-review-hostcli)에 구현했다. V3/V5의 /api/reviews snapshot transport와 연결하며 Core read model은 document-reader 경계를 사용한다. 실제 브라우저·외부 서비스 수락은 별도 검증이다. 공용 자료 읽기·제안·승인·거절·Undo·status는 같은 PluginHost dispatcher를 사용하며 문서 의미를 renderer나 CLI에 구현하지 않는다.

이미지가 없거나 로드에 실패한 PageSurface는 영역 좌표계 바깥, 도구줄 아래 별도 줄에 안내를 표시한다. 독립 페이지와 SourceDocumentCompare에 동일하게 적용한다. `review-v5`에서 두 사용처의 안내와 영역이 겹치지 않는지 확인한다(#1278).

## V7 Chart and Panel renderer

- Status: Implemented
- Last verified: 2026-11-06 — Core 기존 Chart/Panel 검증과 번들 renderer 대조. 브라우저·fixture 검증 범위는 PR 기록을 따른다. D2/D3/D4 통합·실제 AI 수락은 포함하지 않는다.
- Scope: 공통 Chart의 bar/line/scatter, Panel의 horizontal 배치. [동적 뷰 설계](dynamic-views-v1.md#카탈로그-부품)의 V7 담당 구현.

`ViewChart`는 Core가 반환한 행을 정렬·집계·보간하지 않는다. line은 숫자 또는 UTC date x의 단일 series이며 Core의 strict ascending·중복 x 거부를 재사용한다. null y에서 선을 끊고 고립된 값도 점으로 표시한다. scatter는 숫자 좌표만 표시하며 중복 좌표는 유지하고 null x/y는 그리지 않는다. 회귀선·연결선은 없다. bar는 기존 부호·영점 기준을 유지한다. 세 type의 `options`는 현재 필요한 추가 설정이 없어 strict 빈 객체만 허용하며 생략은 기본 동작이다.

모든 Chart는 native details/summary의 원자료 값 목록을 제공한다. 100행 단위 목록과 이전/다음 버튼으로 반환된 모든 행을 원래 순서대로 확인한다. null은 `—`로 보이며 scatter의 제외 건수는 목록에 표시한다. SVG는 접근성 트리에서 숨기고 원자료를 접근 가능한 표현으로 사용한다. 목록은 새 통계나 데이터 샘플이 아니다.

`ViewPanels`는 renderer 자체의 inline-size container를 사용한다. 가용 폭 960px 이상에서 horizontal의 두 자식을 같은 폭으로 나란히 표시하며 960px 미만에서는 세로로 접는다. 창이 넓어도 좁은 우측 영역에서는 세로다. 한 단계·두 자식·전체 leaf 8개 검증은 Core를 재사용한다. Table, shell, context와 요청 수명은 이 renderer가 소유하지 않는다.

UI 선택은 기존 작업 탭의 ViewRenderer·제품 색/간격 토큰·공통 Button과 native 목록을 재사용한다. 새로운 스타일 DSL이나 공용 상호작용 예외는 없다. 개발 갤러리의 `예시: Chart와 Panel`은 메모리 행으로 렌더링·폭 경계만 확인하며 실제 AI·Host/CLI 연결 증거를 대신하지 않는다.

V7 시각 검토: 같은 메모리 예시·Dark/Korean·100% zoom에서 [1440px Before](assets/dynamic-views-v7/before-1440.png) / [After](assets/dynamic-views-v7/after-1440.png), [640px Before](assets/dynamic-views-v7/before-640.png) / [After](assets/dynamic-views-v7/after-640.png)를 확인했다. 960px 경계는 창 폭을 유지하고 실제 renderer 폭을 959/960px로 선택하는 브라우저 단언으로 보호한다. 정렬·간격·한국어 줄바꿈·패널 내부 잘림은 캡처 수동 검토이며 픽셀 단언은 아니다. Before는 D1 renderer, After는 V7 renderer로 동일 예시를 렌더링했다.

검증 역할: 기존 Core views 검사는 line 순서/중복/null과 타입·옵션 거부를 보호한다. 기존 `ui-gallery` 시나리오 보완은 SVG의 null 단절·scatter 중복/제외 좌표의 축 영향·접근 가능한 원자료 순서 및 실제 container 폭 접힘이라는 브라우저 고유 위험을 보호한다. 별도 subprocess·전수 조합·실제 AI 호출은 추가하지 않는다. 캡처는 `--screenshots` 수동 실행에서만 생성한다. 직접 소유한 전용 서버에서 fixture를 검증했으며 CLI/비서 데이터의 실제 UI 통합 수락은 후속 통합에서 확인한다.
