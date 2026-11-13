# Generated views v1

> #1341(2026-11-09)에서 비서 생성·즐겨찾기·snapshot·통계·차트 기능을 제거했다. 아래는 당시 구현/제안과 검증 기록이며 현재 요구사항이 아니다. 남는 플러그인 화면·조회·표는 [현재 계약](plugin-screens-v1.md), review는 [플러그인 1단계](plugin-stage1-v1.md)를 따른다. 상태·후속 링크를 확인했으며 과거 실험을 다시 실행했다는 뜻이 아니다.

> 후속 설계: [동적 뷰 재정의 v1](dynamic-views-v1.md)은 Draft다. 두 데이터 종류·우측 보기·플러그인 화면·V7 선행 구현을 제안하며, 아래 현재 구현/기존 로드맵의 완료 주장과 구분한다. 수락 시 변경되는 범위는 새 설계와 ADR-0020 개정안을 따른다.

- Status: Historical
- Host assembly (#1246): `host-services.ts` composes independent plugin and view services and lazily initializes the assistant. Plugin management/secret routes belong to `plugin-service.ts`; views receive that same plugin runtime explicitly through `view-service.ts`. Assistant shutdown closes only its provider/conversation resources; Host shutdown closes plugins independently, including when assistant initialization or shutdown fails. Views retain no separate runtime resources. Request paths, lazy plugin start, receipts and stored formats are unchanged.
- Last verified: 2026-11-09 — Historical 상태·후속 계약 링크 대조. 과거 시험 재실행 아님.
- Previous verification: 2026-11-06 — V3 query forms/states, keyword-specific field errors, public owner persistence and #1266 review entry fixtures; generated-views/HTTP recovery browser 2/2, targeted Host/CLI/plugin checks and visual-tokens. V2 Host/CLI evidence is retained below; external-service UI/CLI acceptance remains separate. Previous 2026-11-05 — #1218 fixture plugin schema Core/Host/CLI and generated-views browser scenario; actual Codex gpt-6-luna low via existing conversation adapter generated status/points grouping, validated and evaluated to open=5. Initial local HTTP recovery companion failed waiting for browser close after owned PID termination; final-build rerun passed 2/2. After separating fixture module paths to prevent import-cache reuse, combined http-plugins/generated-views passed 3/3. No timeout relaxation. Previous #1210 evidence: Core/file-commit and Host/HTTP/CLI tests; provider stdio boundary tests, production browser generation/favourite/reopen/manual refresh/CLI equality and 1440px/640px captures; actual Codex gpt-6-luna low proposal/correction/exhaustion. Copilot generation uses fake ACP/browser evidence, not a paid live Copilot response.
- Authority: [ADR-0020](../adr/0020-plugin-architecture.md), [#1210](https://github.com/litzio/litzio/issues/1210).
- Scope: V2 query Host/CLI supersedes v1 Host behavior as described below. Existing renderer/assistant call sites now use v2 query envelopes; V3 supplies forms/states and query/InputForm generation; V6 tools/cards and V4 completed-bundle review generation use the same authoring catalog. Historical Core v1, file-commit exclusive creation, built-in statistics, Host/CLI operations, shared bundled rendering and both assistant adapters. Includes #1218 operation row-schema declarations for active plugin reads; no external API, settings migration or data migration. The final V1 section documents the separately implemented catalog v2 Core/SDK layer, now consumed by the V2 query Host/CLI.

## 명시적 생성 버튼 제거 (2026-11-06)

소유자 결정으로 composer의 Generate view와 전용 요청을 준비하는 Ask assistant 버튼을
통계·생성 탭·문서 우측 보기·플러그인 화면에서 제거했다. 아래 Generate view 관련 기록은
유지된 내부 Host/CLI 생성 기능과 과거 검증 기록이며 현재 UI 진입점을 뜻하지 않는다.
일반 Send 대화의 view_catalog/propose_view, 검증 결과 카드·새 탭·즐겨찾기는 유지한다.
Copilot 일반 대화에는 동적 뷰 도구가 없으며 기존 CLI 대안의 한계도 그대로다.

일반 대화는 첨부하지 않은 현재 문서의 경로만 전달한다. 현재 문서 본문을 자동 snapshot으로
수집하지 않는다. 명시적으로 첨부한 저장 UTF-8 자료와 이전의 성공한 공개 도구 결과는 선택적
뷰 context로 전달될 수 있다. 이 context의 1 MiB/64개 출처 상한은 일반 문서 읽기의 상한이
아니며, 초과해도 원래 첨부/도구 결과는 보존하고 뷰 context만 unavailable로 표시한다.
전용 내부 생성 경로의 저장 현재 문서 자동 첨부와 구분한다. 사용자 데이터 migration은 없다.

UI 선택은 기존 공통 Button의 삭제이며 새로운 표면·토큰·상호작용 예외는 없다.
1440px English Light [전](assets/remove-generate-view/before-1440.png) /
[후](assets/remove-generate-view/after-1440.png), 640px Korean Dark
[전](assets/remove-generate-view/before-640.png) /
[후](assets/remove-generate-view/after-640.png)는 해당 viewport의 composer 부분 캡처다.
합성 fixture와 checkout 전용 Host/persistent Chrome을 사용하고 경로를 담는 select는 mask했다.
버튼 제거 후 control 정렬·여백·잘림·한국어 줄바꿈을 직접 확인했다. 문서 표 편집과
Settings 등 다른 공통 Button 사용처는 바꾸지 않는다.

기존 generated-views browser는 일반 Send의 검증 카드 → 새 탭 → 수동 조회·즐겨찾기 경로와
생성 버튼 부재를 보호한다. 사라진 UI의 교정·중단·destination 생성 사례는 그 시나리오에서
제거하며 내부 서비스의 기존 view-generation/provider 검사는 유지한다. 기존 provider fixture의
두 child를 재사용해 현재 문서는 경로만, 별도 명시 첨부는 본문을 전달하는 경계를 검사한다.
이 검사는 모델 품질 검사가 아니며 새 subprocess나 전수 조합을 추가하지 않는다.

일반 대화 실제 제품 경로도 격리 Host와 합성 folder에서 Codex `gpt-6-luna` / `low`로
확인했다. 일반 Send의 catalog/propose 도구 결과 카드가 생기고, Open view 후 수동 조회로
연결 표의 행이 표시됐다. 이 한 사례는 대화 경로 유지의 근거이며 모델의 전반적 품질,
Copilot 도구 지원, 외부 서비스·원격 Host 수락을 보증하지 않는다.

## D1 dynamic data contract (Core and SDK)

Implemented 2026-11-06 in Core/SDK only, following the [dynamic views design](dynamic-views-v1.md). This section supersedes the earlier component names and field/column limits throughout this document. Host/CLI assistant snapshot execution follows the [D2 implemented contract](#d2-dynamic-data-host-and-cli); assistant context integration remains D4 work; screen entry points follow the [D3 app contract](#d3-앱-위치와-읽기-표); line/scatter/horizontal rendering follows the [V7 implemented contract](#v7-chart-and-panel-renderer). Their availability is not implied by schema acceptance.

Query definitions require `owner`. `sources.stats.kind: operation` retains manual refresh, operation/version/args and existing transforms/forms. `kind: assistant` requires assistant refresh, UTC millisecond `generatedAt`, public scalar `rowSchema`, complete inline `rows`, 1–64 `provenance` entries and optional plain-text `method`. `method` allows ordinary comparison characters such as `<` and `>`; renderers must display it as text, never interpret it as HTML. Its 4,096-character limit and rejection of disruptive control characters remain. It forbids forms, operation args and transforms. Owner authorization and provenance identity checks belong to the Host request boundary; Core validates their representation. Inline rows and provenance are the favorite snapshot: canonical `.view.json` needs no companion snapshot file. Operation favorites retain definition/args without result rows.

Operation definitions retain 32 KiB/2,000 rows/512-character strings. Assistant definitions allow 1 MiB UTF-8 (input and canonical), 10,000 rows and 4,096-character scalar strings/method. Labels remain 160 characters. Table columns and rowSchema fields have no count ceiling. Rows match declared fields exactly, numbers are finite, dates are UTC timestamps, and secret assistant fields are rejected. Canonical serialization sorts object keys by code unit, preserves every array order, normalizes schema defaults, uses two-space indentation and ends with LF.

`Chart` has `type: bar | line | scatter`, title/source/data/x/y and optional type-specific strict `options` (currently empty for each type; unknown keys fail). All y bindings are numeric. Line x is numeric or date, non-null, unique and strictly ascending after connected transforms or in supplied assistant order; nullable y remains a gap. Date groupBy outputs retain date semantics for line x: UTC day/week buckets (`YYYY-MM-DD`) and month buckets (`YYYY-MM`) are ordered and deduplicated by aggregation before the final line order check. Scatter x is numeric; duplicate coordinates and null coordinates remain in Core rows for the renderer's value list/exclusion reporting. `Panel` has `direction: vertical | horizontal`. Horizontal has exactly two leaf children; a vertical root may contain horizontal groups one level deep. All layouts have at most eight leaves. Review remains a separate profile with a vertical Panel and its existing review bindings. No aliases or migration read old component names.

SDK `contributes.screens` references up to 8 unique query view IDs and up to 16 unique K1 job IDs from the same manifest. At least one view or job is required; screens with jobs require SDK 0.3.0 or later. Screen IDs are unique, at most one is primary, and `SCREEN_ICONS` is the bundled icon-key allowlist (`LayoutDashboard`, `Table`, `ChartColumn`, `FileText`, `Folder`). Default definitions must use the plugin's owner; connected sources must bind that same plugin's declared operations. `validateManifest` rejects invalid contributions before entry execution. Core limits, schemas and types are re-exported by the SDK.

Regression coverage lives in the existing Core views and SDK manifest test suites. Core owns source/row/binding/limit/chart/layout combinations; SDK tests screen declarations and plugin ownership. Existing Host/CLI/browser fixtures exercise operation queries with the new wire form. These fixtures do not prove live AI synthesis, remote provenance availability or the later renderers.

## D2 dynamic data Host and CLI

Implemented 2026-11-06 for the Host/CLI boundary. This supersedes the operation-only statements below; D3/D4/V7 integration and final product acceptance remain separate.

`view.validate/propose/save/open/run` share Core's two-source validation and canonical serializer. Connected owners must match the registered operation owner; assistant owners must be built-in `litzio.assistant`/`litzio.statistics` or a registered plugin for new proposals/saves. An optional `plugin` request field on validate/propose must match the definition owner. Save still accepts an inferred owner over HTTP, while CLI save requires explicit `--plugin <owner>`. Registered disabled plugins may save assistant snapshots. Removed namespaces cannot create new favorites, but existing files can still be listed/opened/run without registering or executing a plugin. Connected sources continue to recheck active operations/version/public bindings and refuse unavailable sources without changing files.

Assistant favorites store the entire canonical inline snapshot. Open performs no query. Run needs no Root and returns Core rows, public field labels, provenance, generatedAt, optional method and a Host-scope receipt without external lookup/recalculation. `input` is refused for assistant save/run. Connected run retains whole-args replacement. Only the built-in folder statistics requires a Root and returns folder receipts; stage 1 plugin reads run at Host scope without a Root. CLI supports both file and named assistant runs without `--root`; it never opens a UI.

Public HTTP/CLI assistant results carry `provenanceStatus: unverified`, including reopened snapshots. Only trusted in-process callers can supply `scope.proposal: {owner, provenance}` (or the second argument to view-service execute). The server must fix that owner from the starting request, not promote a client assertion. Propose requires that owner and deep identity equality of every claimed provenance entry with the supplied list; it then returns `verified`. This verifies list membership only, never factual accuracy. Trusted scope is not a public JSON request field and is never persisted.

Catalog preserves `{catalog, views, receipt}` and adds top-level `screens: [{plugin,id,title,icon,defaultViewIds,jobs,primary}]` from active loaded manifests. Disabling hides both screens and contributed default views; no favorite file is removed.

Core still enforces raw/canonical 32 KiB connected and 1 MiB assistant definitions. Saved-file/CLI reads reject oversized files before reading and recheck actual bytes. Shared `VIEW_TRANSPORT_LIMITS` permits a 1 MiB + 64 KiB request envelope and 8 MiB response envelope. The response budget accommodates both definition and escaped canonical text plus catalog metadata, not larger definitions. HTTP keeps any smaller configured Host body limit. After strict JSON admission, `jsonc-parser` source spans preserve the raw view value byte count independently of envelope whitespace and the later canonical check. CLI collects responses with an explicit streaming byte ceiling. Host response overflow fails with a failure receipt and no rows; no path truncates rows or substitutes samples.

Verification extends the existing Host/CLI test: one existing real Host/plugin child covers namespace save/reopen, disabled snapshot execution, catalog screen removal, connected refusal, large normal proposals and HTTP/file byte refusals. A lightweight in-process case owns trusted proposal owner/provenance checks. Core continues to own schema/row combinations; no new subprocess or browser scenario is added. These are localhost fixture results, not live model, remote Host, external service or three-location UI acceptance.

## V2 query Host and CLI

Implemented 2026-11-06: `server/views.ts` dispatches catalog v2 requests; `server/view-validation.ts` owns query admission, `server/view-query.ts` runs connected queries, `server/view-statistics.ts` owns the built-in statistics source, and `server/view-favorites.ts` reads favorite definitions. These module boundaries preserve the existing behavior. The dispatcher accepts catalog v2 query definitions through Core `views-v2`. No v1 reader or migration is provided; rejected files remain intact. This section supersedes the v1 Host/storage/CLI behavior below. Earlier renderer/assistant evidence describes v1. V2 also updates existing call sites to emit/parse v2 query definitions so this PR works independently; V3/V6 own the new forms/states and proposal tools/cards.

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

Run/save accept optional `input`, replacing the entire source args object before Core validation. Missing form-bound required inputs may be saved/proposed with `inputState: {state:"needs-input",missing:[...]}` but cannot execute. Run applies the original full input validator before invoking. Secret/writeOnly/password input remains fail-closed. Open restores the definition/args and inputState without querying or requiring a document Root. Run returns effective `args`, Core rows, public fields and receipt; only folder-scoped queries return a root target. Plugin results use `publicOperationResult`; failures preserve #1233 fixed errorKind/message and safe source receipt. Local refusals use fixed messages and code (`unavailable`, `owner-mismatch`, `invalid-view-request`) without publishing exception/schema-input text. Unavailable/version-changed favorites remain on disk. A removed, secret or incompatible bound output field also returns `code: unavailable` and fixed new-view advice; binding checks remain Core-owned.

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

All filters, grouping, aggregates, sort and panel bindings resolve against that operation's public fields. Date fields require day/week/month grouping; other types forbid intervals. Contains requires non-date strings; ranges require numbers or dates. Sum/avg/min/max require numeric fields and fail explicitly if a member value is null. Grouped output is `group`/`value`, with numeric group only for a numeric grouping field. Secret fields cannot be bound, filtered, grouped or sorted and are omitted from assistant catalog/schema context. The shared plugin-operation return boundary (`publicOperationResult`) first applies known-secret redaction (`safePluginValue`), validates the outputSchema, then uses Core `parseOperationRows` to validate declared field values and strip secret fields before publishing any result. Generic operation invoke (HTTP/CLI/assistant) and views all receive these public rows. A mismatch returns a failure receipt without the result. Plugin source failures preserve the Host `errorKind` and fixed advice from the [operation failure contract](https://github.com/litzio/litzio/blob/archive/2026-11-13-plugins-declarative/docs/design/plugin-stage1-v1.md#작업-실패-공개-분류-1233); manual refresh displays that kind and advice in the existing Notice. Raw exception or service response text is never published. Core evaluation reuses that same idempotent row parser, including for built-in statistics; secret fields already stripped by the boundary need not be present. Undeclared result fields are also removed. The assistant context is generated from the target Host's current read-operation declarations for both providers.

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

Every successful proposal or favorite open creates a **new tab**, retaining the selected Host and optional runtime root. A favorite can open without a root: only the definition is needed. For folder-scoped queries, its opened-folder selector lets the user choose a query root later; selection alone does not query data. Opening draws the validated specification without LLM calls or data queries; Refresh data explicitly runs the shared Host operation. No view tab automatically runs, polls data or restores a definition at app startup. View tabs have no document Save/draft/recovery session. Closing a tab aborts its pending view requests and discards late results, so a delayed favorite open cannot create another tab or recreate the basic tab. Closing does not delete the favorite. Host removal requires closing its view tabs, as with other Host work; it cannot rebind to another Host.

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

공통 진입점은 `@litzio/core/views-v2`의 CatalogView를 받고 query/review를 분기한다. `src/views/Views.tsx`는 분기만 소유한다. `src/views/QueryViewPage.tsx`만 stats args와 조회·입력 상태를 읽고, 공통 Table·Chart·Panel 렌더링은 `src/views/ViewRenderer.tsx`가 소유한다. review는 `src/review/ReviewViewPage.tsx`를 거쳐 V5 ReviewRenderer로 전달한다. 비서 데이터 표시는 `src/views/AssistantView.tsx`, 조회 페이지의 즐겨찾기 UI는 `src/views/QueryViewFavorites.tsx`에 분리되어 있다. v1 reader나 migration은 없다.
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

V4 review의 Host·CLI·K1 완료 bundle은 [플러그인 1단계 V4 계약](https://github.com/litzio/litzio/blob/archive/2026-11-13-plugins-declarative/docs/design/plugin-stage1-v1.md#v4-공용-review-hostcli)에 구현했다. V3/V5의 /api/reviews snapshot transport와 연결하며 Core read model은 document-reader 경계를 사용한다. 실제 브라우저·외부 서비스 수락은 별도 검증이다. 공용 자료 읽기·제안·승인·거절·Undo·status는 같은 PluginHost dispatcher를 사용하며 문서 의미를 renderer나 CLI에 구현하지 않는다.

이미지가 없거나 로드에 실패한 PageSurface는 영역 좌표계 바깥, 도구줄 아래 별도 줄에 안내를 표시한다. 독립 페이지와 SourceDocumentCompare에 동일하게 적용한다. `review-v5`에서 두 사용처의 안내와 영역이 겹치지 않는지 확인한다(#1278).


## D4 assistant material context

D4 supplies source-specific authoring instructions from `shared/view-generation.ts` to both
provider adapters. Generate view remains read-only and tool-free. Host preparation reuses
`checkedReferences` and Explorer visibility for multiple attached files and the saved current
document inside existing opened Roots. The existing folder API supplies opaque directory IDs from filesystem identity. The app combines these with its registered Host and opened Root; Host snapshot admission recomputes and compares each ID. These display identities do not grant access or authenticate a client. Without document identity, Host-issued reference IDs are used.
Unsaved editor content is not presented as a saved revision. Completed public tool receipts
already in the conversation can join the supplied snapshot. Material text is context, never a
human transcript item or a persisted view source. The correction attempts reuse the original
material bytes; later disk changes do not silently alter those bytes.

Assistant calculations can combine those materials into completed scalar rows and a plain-text
method. Connected sources retain operation-owner/manual-refresh instructions. Assistant source
instructions use the request owner, assistant refresh, supplied provenance and the D1 limits.
Missing material asks for references or ordinary-chat reads. Both context material and provider
view output have a 1 MiB byte cap; limit errors fail explicitly without sampling or model changes.
The existing state machine retains at most two validation corrections, one 180-second deadline
per attempt and no transport retries. Destination cancellation signals are combined with the
request signal; invalidated destinations cannot receive late successful results.

The existing assistant-result card and common Button are reused, with collapsed provenance,
plain-text method and paged complete-row inspection. No new style tokens or UI surface are
introduced. Cards and all destinations consume D3's common DataTable and destination registry;
D2's Host/CLI contract is merged. Generate view now calls `propose-view-generation`
through the existing assistant service. The Host checks the prepared request ID, its actual
conversation/turn, completion, cancellation and deadline before supplying D2's in-process
proposal scope. The scope contains the captured material identities and admitted owner; clients
cannot send a proposal scope in the body. Ordinary `propose_view` uses the same D2 validation.
Public HTTP/CLI propose, card reopen and saved-data reopen remain unverified. Provenance identity checking never proves
factual correctness. Source opening requires a matching already-opened Host/Root binding and a fresh Root identity check before the existing document-open path, preserving unsaved tabs. Unknown or replaced Roots remain unavailable.

Verification covers Host snapshot scope/byte limits, completed tool receipts, both provider
stdio envelopes and the existing correction/cancellation state machine. The new Host material
case protects the read boundary, rather than duplicating Core row-schema cases. The card browser
case checks complete-row pagination and visible provenance with a synthetic assistant source;
this is fixture evidence, not actual AI, external service or multi-destination product acceptance.

D4 pre-integration verification on 2026-11-06: provider/view-generation/assistant-host target
checks passed (32 cases); the material case also checks reuse of Host-issued read-result
references. Production HTTP fixture and the runner's recovery case passed. Manual captures
at 1440px and 640px include Korean dark mode; card-local vertical panel markup fixes an
observed horizontal details layout without changing shared assistant-result CSS. D2/D3
integration, actual AI, remote Host and final saved-data acceptance were still unverified at that independent stage.

D3's destination documentPath is preferred over the currently selected document when the
user submits a prepared request. A destination from another Host fails before provider work;
prepared requests use the generation path on submit rather than ordinary conversation send.
The destination pins documentPath/documentDirty together. Document switching and panel hiding retain the original target; manual selection, target close and Host invalidation abort it. A cancelled target is removed from the composer, so a later ordinary message cannot reuse its expired token. Screen admission receives the actual contribution plugin/id rather than the app instance token ID.

A current-view refinement is supplied once as a bounded Host-issued reference material, including its stored rows and historical provenance. It is not promoted to a fresh read of those historical documents; the generated result cites that supplied snapshot unless the files are attached and read again. Assistant output reuses Core's schema and semantic checks before Host proposal, so chart/type diagnostics reach the existing maximum-two-correction loop without exposing upstream provider errors or duplicating chart rules. Host owner/provenance admission remains authoritative.

### D2/D4 admission and transport

A prepared request defaults to the server's assistant namespace. A statistics target selects
the built-in namespace; a screen target must match an active Host screen contribution before
its plugin namespace is captured. A client namespace assertion is compared with that admitted
owner rather than promoted to authority. Connected proposals use the operation-owner catalog
captured for that request. Correction attempts preserve the original owner/material scope.
The generated proposal action rejects arbitrary extra scope fields, other turns and cancelled
or expired handles. Verified provenance means membership in the supplied request snapshot,
not factual correctness or authentication of app display identities.

The assistant transport uses D2's request envelope (1 MiB + 64 KiB) and response/card envelope
(8 MiB, including definition plus canonical text); each definition retains Core's smaller
source-specific limit. Exceeding a bound fails explicitly without truncation or sampling.
The app supplies only Host-issued IDs from its opened folder listings. The Host rechecks the existing Root boundary and physical identity before providing document provenance. No Root ID is derived from an absolute path, account, URL or model claim. Connected tabs admit their exact registered operation/version through the existing Host catalog, keeping its owner without inventing a screen contribution.

The added Host test uses one existing fixture child to protect the new admitted-request
boundary: matching scope versus public unverified proposals, substituted provenance/owner,
wrong turn, cancelled handle and attempted client scope injection. Existing state-machine
cases retain timeout/cancellation/correction protection; they do not repeat Core row cases.
The streamed-output boundary excludes user input from the provider byte budget. The fixture
checks an exact-budget completion and an explicit one-byte overflow; it first reproduced the
incorrect rejection caused by charging user text to output. The browser correction expectation
follows the new assistant proposal route while keeping
both binding refusal and duplicate-save refusal required.

### Ordinary transport and optional view capture

Ordinary conversation keeps checked attachment descriptors unchanged: Codex receives its existing localImage input and Copilot receives the existing path reference. Images are not decoded as view text. View text capture supports saved UTF-8 text, and an unsupported image/binary attachment produces an explicit text-material guidance error only for a view request. An ordinary send whose optional snapshot cannot be collected still proceeds, supplying `viewAuthoring.unavailable` rather than an incomplete material prefix. Replacing unsupported attachments with supported text allows a later view request.

A successful ordinary public read/execution result remains successful and complete when optional view capture crosses 1 MiB or 64 provenance entries. The original result is preserved; separate metadata describes view unavailability. The conversation retains only the capture failure state, not a partial snapshot that could be mistaken for complete data. Subsequent ordinary messages and restored history remain usable. A Generate view or assistant proposal still explicitly refuses an oversized/unavailable snapshot; there is no sampling, silent truncation or increased limit. The failure state is owned by the existing conversation, without a new registry or persistence system; restored histories are checked again from their full public results.

Regression coverage reuses the existing Codex/Copilot adapter children with a valid 1x1 PNG, including Codex localImage and Copilot path preservation, unsupported view rejection and later text recovery. The existing document-tool case protects an oversized successful read and the 64/65 read boundary, subsequent ordinary sends and restored history, with explicit view rejection. Sixty-five sequential public reads are necessary to exercise this boundary through the real tool callback; they took about 0.56 seconds locally and add no subprocess. These are fixture regressions; the earlier actual-AI acceptance below was not rerun for this bounded transport correction.

### D4 integrated verification (2026-11-06)

D2 and D3 were merged through master before this integration. The existing target checks cover Host-issued Root metadata, same-path directory replacement, rejected client identity claims, current-view reference snapshots, exact operation/version admission, Core chart diagnostics and request cancellation. The existing generated-view browser scenario now protects mapped source opening with an unsaved editor, the pinned dirty-document boundary, hidden-panel completion on the original document, and full-row common-table pagination. It adds one synthetic generation to that scenario, without a new subprocess or a combinatorial suite (production HTTP scenario about 22 seconds locally).

Actual app acceptance used Codex `gpt-6-luna` / `low`, normal speed and isolated synthetic data. Two saved sales documents contained January 10/30 and February 20/40; the existing public `read_document` tool read a third document supplying a +3 adjustment. Generate view produced completed rows 43/63 with the two supplied document identities and the public-result reference. The admitted proposal was verified as supplied-list membership. The same conversation was used to refine document and plugin-screen destinations, including a Table and line Chart with UTC datetime coordinates. An initial string-x line proposal failed; Core's specific chart diagnostic now reaches the existing two-correction loop, and the follow-up request made the date requirement explicit. This is an iterative authoring acceptance, not a one-shot accuracy guarantee.

The actual result opened in a new task tab and saved/reopened as an assistant snapshot without another model call or query. A mapped source reopened an existing dirty document without losing its unsaved marker. DocumentPath/documentDirty remained pinned after switching to another document before submit; hiding the assistant during generation delivered only to the original document. Manual favorite selection cancelled a subsequent refinement and retained the manually selected snapshot. A real local synthetic plugin screen received the explicit `fixture.sales` / `dashboard` descriptor and its own owner, accepted a generated assistant snapshot and saved it in that namespace. Reopening the plugin snapshot caused no query or model call; general assistant, statistics and plugin lists stayed separate. The connected default view queried only on manual refresh, its rows matched CLI `view run`, and switching back preserved the already-loaded default state without another query.

These results use local synthetic documents and a local synthetic plugin, not a real remote service or large data set. Remote/large-data acceptance remains unverified. Core meaning, write paths, limits, maximum corrections and deadlines were not relaxed. The dynamic-views proposal remains Draft; this section does not declare all future product acceptance complete.

Card visual comparison uses the earlier `2ab8bcbe` AssistantDataDetails implementation and the integrated component in the same app fixture. Common Notice, Button, DataTable and native details are reused; there are no new tokens or interaction exceptions. At 1440px and Korean dark 640px, labels, borders, table/filter centers, pagination and expanded details were inspected. Background account/path surfaces are masked, and all visible data is synthetic:
[1440 before](assets/dynamic-views-d4/before-1440.png) / [1440 after](assets/dynamic-views-d4/after-1440.png),
[640 before](assets/dynamic-views-d4/before-640-ko-dark.png) / [640 after](assets/dynamic-views-d4/after-640-ko-dark.png).

## D3 앱 위치와 읽기 표

D3는 새 작업 탭의 두 query source 표시, 문서 탭별 우측 보기, SDK screens의 앱 번들 화면을 제공한다. 통계 즐겨찾기는 `litzio.statistics`, 우측 보기는 `litzio.assistant`, 플러그인 화면은 plugin owner로 목록을 분리한다. 뷰를 새 탭으로 열 때 통계 탭을 자동 생성하지 않는다. 화면 Host 선택은 다른 Host로 자동 fallback하지 않으며 저장 파일을 지우지 않는다.

앱 destination은 kind/id/Host/owner/Root와 generation·AbortSignal로 요청 위치를 고정한다. 문서 숨김은 결과 소유권을 바꾸지 않고 문서 닫힘·새 요청·화면 Host 변경·연결 해제는 token을 무효화한다. 생성 서비스/카드 연결과 통합 수락 범위는 위 D4 절을 따른다. 이 절 자체는 실제 AI 수락 완료를 뜻하지 않는다.

공통 DataTable은 타입별 열 정렬/필터, AND 결합, 불러온 자료 범위 안내, 50행 페이지와 내부 가로 스크롤을 제공한다. 필터와 정렬은 전체 불러온 행에 적용한 뒤 페이지를 나누며 명세·args·원행을 바꾸지 않는다. 저장/다시 열기는 원래 순서와 필터 없음으로 시작한다. 동작 기준은 [UI 패턴](ui-patterns-v1.md#데이터-표-정렬필터-제안), 공통 선택과 검증 범위는 [UI 결정표](ui-decision-table-v1.md#동적-뷰-d3-공통-구현)를 따른다.
## V7 Chart and Panel renderer

- Status: Historical
- Last verified: 2026-11-06 — Core 기존 Chart/Panel 검증과 번들 renderer 대조. 브라우저·fixture 검증 범위는 PR 기록을 따른다. D2/D3/D4 통합·실제 AI 수락은 포함하지 않는다.
- Scope: 공통 Chart의 bar/line/scatter, Panel의 horizontal 배치. [동적 뷰 설계](dynamic-views-v1.md#카탈로그-부품)의 V7 담당 구현.

`ViewChart`는 Core가 반환한 행을 정렬·집계·보간하지 않는다. line은 숫자 또는 UTC date x의 단일 series이며 Core의 strict ascending·중복 x 거부를 재사용한다. null y에서 선을 끊고 고립된 값도 점으로 표시한다. scatter는 숫자 좌표만 표시하며 중복 좌표는 유지하고 null x/y는 그리지 않는다. 회귀선·연결선은 없다. bar는 기존 부호·영점 기준을 유지한다. 세 type의 `options`는 현재 필요한 추가 설정이 없어 strict 빈 객체만 허용하며 생략은 기본 동작이다.

모든 Chart는 native details/summary의 원자료 값 목록을 제공한다. 100행 단위 목록과 이전/다음 버튼으로 반환된 모든 행을 원래 순서대로 확인한다. null은 `—`로 보이며 scatter의 제외 건수는 목록에 표시한다. SVG는 접근성 트리에서 숨기고 원자료를 접근 가능한 표현으로 사용한다. 목록은 새 통계나 데이터 샘플이 아니다.

`ViewPanels`는 renderer 자체의 inline-size container를 사용한다. 가용 폭 960px 이상에서 horizontal의 두 자식을 같은 폭으로 나란히 표시하며 960px 미만에서는 세로로 접는다. 창이 넓어도 좁은 우측 영역에서는 세로다. 한 단계·두 자식·전체 leaf 8개 검증은 Core를 재사용한다. Table, shell, context와 요청 수명은 이 renderer가 소유하지 않는다.

UI 선택은 기존 작업 탭의 ViewRenderer·제품 색/간격 토큰·공통 Button과 native 목록을 재사용한다. 새로운 스타일 DSL이나 공용 상호작용 예외는 없다. 개발 갤러리의 `예시: Chart와 Panel`은 메모리 행으로 렌더링·폭 경계만 확인하며 실제 AI·Host/CLI 연결 증거를 대신하지 않는다.

V7 시각 검토: 같은 메모리 예시·Dark/Korean·100% zoom에서 [1440px Before](assets/dynamic-views-v7/before-1440.png) / [After](assets/dynamic-views-v7/after-1440.png), [640px Before](assets/dynamic-views-v7/before-640.png) / [After](assets/dynamic-views-v7/after-640.png)를 확인했다. 960px 경계는 창 폭을 유지하고 실제 renderer 폭을 959/960px로 선택하는 브라우저 단언으로 보호한다. 정렬·간격·한국어 줄바꿈·패널 내부 잘림은 캡처 수동 검토이며 픽셀 단언은 아니다. Before는 D1 renderer, After는 V7 renderer로 동일 예시를 렌더링했다.

검증 역할: 기존 Core views 검사는 line 순서/중복/null과 타입·옵션 거부를 보호한다. 기존 `ui-gallery` 시나리오 보완은 SVG의 null 단절·scatter 중복/제외 좌표의 축 영향·접근 가능한 원자료 순서 및 실제 container 폭 접힘이라는 브라우저 고유 위험을 보호한다. 별도 subprocess·전수 조합·실제 AI 호출은 추가하지 않는다. 캡처는 `--screenshots` 수동 실행에서만 생성한다. 직접 소유한 전용 서버에서 fixture를 검증했으며 CLI/비서 데이터의 실제 UI 통합 수락은 후속 통합에서 확인한다.


### D3 보기 인스턴스와 선택 수명

문서별 ViewWorkspace와 DocumentPanel은 숨김·개요 전환·다른 문서·비서 표시 중에도 유지하고 문서 탭 닫기에 해제한다. 숨김은 접근성 트리와 포커스에서 제외한다. 네 navigation tab의 aria-controls 대상은 항상 mount하고 선택한 panel만 보인다. 일반 작업 탭도 새 definition을 받으면 이전 요청을 취소하고 args·결과·표 상태를 새 인스턴스로 전환한다. Host offline/unavailable은 기존 결과를 제거하지 않으며 오래된 결과와 실행 불가 상태를 함께 표시한다. 다시 연결해도 실행을 자동 반복하지 않는다.

문서 가용 폭과 popup 경계는 표시 중인 panel만 측정한다. 기존 cross-reference·Desktop 배치 검사는 이 경계를 사용하고, 실패한 문서 열기의 탭 보존 검사는 숨겨진 보기 navigation과 구분해 문서 탭을 비교한다. 폴더 외부 변경 검사는 기존 자동 반영 기한과 단언을 유지하며, 실패 시 version/listing 응답을 경로 없이 남겨 감시와 화면 반영을 구분한다.

플러그인 화면은 기본 뷰·현재 생성 뷰·선택한 즐겨찾기의 인스턴스를 구분한다. 기본 뷰로 전환해도 생성 뷰를 다시 선택할 수 있다. 수동 기본/즐겨찾기/Root 선택은 같은 destination의 생성 token과 이전 open 요청을 무효화한다. 명시한 Host의 진입은 다른 Host로 열려 있던 화면을 전환하고 이전 임시 상태·요청을 해제한다. document destination에는 시작 documentPath와 documentDirty를 함께 고정한다.

출처는 요약과 펼칠 수 있는 전체 목록으로 제공한다. `ViewRootBinding {hostId,id,path}`는 신뢰된 앱/Host 문맥의 매핑만 받으며 `resolveViewDocument`는 Host·Root identity가 모두 일치할 때만 상대 path를 해석한다. known Host가 연결되어 있고 매핑과 onOpenDocument가 있을 때 기존 문서 열기/미저장 보호 경로를 사용한다. 현재 Host의 Root identity 공급 API와 D4의 실제 매핑은 없으므로 앱은 이를 추측하지 않고 해당 문서 출처를 unavailable로 남긴다. 이 조건의 실제 출처 열기 및 실제 AI 수락은 통합 미완료다.


### 플러그인·동적 뷰 화면 간소화 (#1329)

플러그인 화면은 기본 뷰 내용을 바로 표시한다. Host가 하나면 Host 선택을 숨기고 기본 뷰가 하나이며 현재 선택되어 있으면 기본 뷰 목록을 숨긴다. 다른 즐겨찾기·생성 뷰를 선택했을 때는 기본 뷰로 돌아가는 선택을 제공한다. 현재 생성 뷰도 다른 뷰에서 돌아올 때만 선택 버튼을 표시한다. 즐겨찾기 목록과 목록 새로고침은 native details/summary로 접으며, 결과 새로고침·즐겨찾기 추가는 뷰 안에 유지한다. 저장·Host 전환·요청 수명 계약은 유지한다.

폴더 선택은 공통 QueryViews에서 폴더 source가 있을 때 한 번만 표시한다. 현재 폴더 source는 앱 내장 `folder.statistics`이며 stage 1 SDK 읽기 작업은 host 범위다. Host도 host 범위 조회에 Root를 요구하거나 검사하지 않으며 `receipt.scope: host`와 폴더 target 없는 결과를 반환한다. 내장 통계는 계속 Root 접근 검사·folder receipt·target을 사용한다. HTTP/CLI는 같은 run 작업을 사용하며 host 조회의 `--root`는 선택 사항이다. 이 절은 앞선 Root 필수·선택 UI 설명 중 host 범위 조회에 해당하는 부분을 대체한다. 카탈로그·SDK 형식과 즐겨찾기 저장 형식은 바꾸지 않는다. 일반 생성 뷰에도 같은 source 기준을 적용하고 비서 snapshot은 폴더 선택 없이 유지한다.

기존 `views.test.ts`의 HTTP/실제 CLI 경로는 named/direct host 조회의 Root 없는 실행과 receipt/target을 보호한다. 기존 `http-plugins`는 실제 Docling artifact와 합성 health 서버에서 열린 폴더 없이 조회·실패·재조회를 검사한다. `generated-views`는 접힌 즐겨찾기의 사용자 접근과 기본 뷰 복귀·입력 보존을 확인한다. 새 subprocess나 전수 조합은 추가하지 않는다. 실제 Docling 서버·변환 품질·원격 Host 수락 검증은 포함하지 않는다.

시각 검토는 같은 Docling 화면의 [1440 이전](assets/plugin-screen-1329/before-1440.png) / [이후](assets/plugin-screen-1329/after-1440.png), [한국어 다크 640 이전](assets/plugin-screen-1329/before-640-ko-dark.png) / [이후](assets/plugin-screen-1329/after-640-ko-dark.png)를 사용한다. 이전은 master 구현, 이후는 폴더 없이 실행한 결과다. 경로·계정 표시는 마스킹하며 결과 표의 정렬·필터 동작은 변경하지 않는다.

## Table link columns (#1332)

Public string row fields may declare `linkField` naming another declared public string field in the same row, e.g. `key: {type:"string",label:"Key",linkField:"url"}` with `url: {type:"string",label:"URL",nullable:true}`. Missing, secret, non-string and self targets are rejected by Core. Table displays the original cell text as a native anchor only when its target passes `externalLinkUrl` (http/https); null, empty, malformed URLs and other schemes remain text. Empty/null display values also remain text. Click and Enter use `openExternalLink`, including Desktop's existing external-browser handling. Underline/accent and focus-visible outline use existing theme tokens in shared DataTable; no surface exception is needed.

URL data remains in rows, including CLI results. Sorting/filtering compare original scalar values; operation definitions/favourites and assistant canonical snapshots retain their existing persistence rules. Grouped rows have no target URL and therefore remain text. No HTML, arbitrary actions, internal links or cell formatting are introduced. Plugin link declarations require a supported SDK contract at least 0.3.0 in `requiresSdk`.

Visual fixture review: [1440px](../reviews/assets/view-link-1332-1440.png), [Korean dark 640px](../reviews/assets/view-link-1332-ko-dark-640.png). Shared DataTable gallery fixture; these captures do not establish live Jira or packaged Desktop acceptance.

## 플러그인 화면의 K1 패널 (#1340)

`screens[].jobs`는 동일 플러그인의 K1 작업을 화면에 배치한다. defaultViewIds와 독립이며 작업만 있는 화면을 허용한다. SDK 0.3.0 요구·Host 다중 시작·파일별 결과·CLI는 [플러그인 1단계](https://github.com/litzio/litzio/blob/archive/2026-11-13-plugins-declarative/docs/design/plugin-stage1-v1.md#플러그인-화면-작업-패널-1340)를 따른다. 공통 작업 패널은 조회 뷰 위에 세로 배치되며 기존 조회 실행 방식은 유지한다. 패널은 비서 뷰 생성·즐겨찾기·저장 뷰 파일을 소비하지 않는다.

2026-11-13: 해당 선언형·Docling·검수 기능은 삭제했다. 현재 계획이 아니며 보관 브랜치 `archive/plugins-declarative-2026-11-13`, 태그 `archive/2026-11-13-plugins-declarative`에서 당시 소스를 확인한다.
