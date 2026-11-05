# Generated views v1

- Status: Implemented
- Last verified: 2026-11-05 — Core validation, canonical round-trip and evaluation; exclusive file creation tests. Host, CLI, assistant and browser integration are follow-up work in #1210.
- Authority: [ADR-0020](../adr/0020-plugin-architecture.md), [#1210](https://github.com/litzio/litzio/issues/1210).
- Scope: Core v1 definition and calculation, and file-commit exclusive creation. No user-facing view command or UI is delivered by this first increment.

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
