# Filesystem Host Boundary v1 — 검증 이력

- Status: Historical
- Moved: 2026-11-13
- Last verified: 2026-11-13 (원문 이동과 현재 계약 링크 확인; 과거 실험 재실행 없음).
- Authority: 당시 검증 기록. 현재 규칙은 [원래 계약](../design/filesystem-host-boundary-v1.md)을 따른다.

당시 수치·캡처·실행 범위와 한계를 보존한다. 현재 요구사항이나 현재 기능의 증명이 아니다.

## Previous verification metadata

- Non-overlapping roots verification: 2026-10-29 (#702: Editor 338 unit tests, typecheck/build; persistent Chrome folder-navigation/memory, layout-rules, quiet-document, document-tabs, editor-shell and reveal-folder; [behavior and captures](../design/editor-ux-shell-v1.md#non-overlapping-opened-folders-702)).
- Folder refresh verification: 2026-10-26 (#494: loaded-list refresh and asset parent updates; [behavior and verification](../design/editor-ux-shell-v1.md#folder-refresh-494)).
- Last verified: 2026-10-25 (#425 owner persistence decision: Editor tests/typecheck/build, folder-memory/navigation/command-center/document-tabs/editor-shell/quiet-document; [restoration evidence](editor-ux-shell-history-2026-11.md#section-persistence-decision-and-verification-2026-10-25)).
- Literal syntax verification: 2026-10-15 (#304: original-source warnings in check, single/batch writes and dry-run JSON; Core/CLI tests and source CLI).
- CLI preview verification: 2026-10-15 (#292: shared file-commit preflight, dry-run no-write boundary, failure parity and result/check output; source CLI and Core/CLI/file-commit tests).
- CLI insertion verification: 2026-10-15 (#280 single-write properties, unchanged-file refusal and per-step batch `end` resolution; Core/CLI tests).
- Start-up/CLI path verification: 2026-10-15 (#287 unit tests for refusal before path I/O and valid Unicode names; Desktop tested without Electron).
- Previous verification: 2026-10-17 (UX review: sidebar folder listing marks documents without the native marker through Core `hasNativeMarker`; Editor/Core unit tests and the stable browser suite. Write handlers unchanged).
- Encoding verification: 2026-10-15 (#271 malformed UTF-8/Unicode refusal, raw-byte revision checks, original preservation and temporary cleanup; Vite/production HTTP repeated Unicode Save → Reload and existing external-conflict regressions).
- Path verification: 2026-10-15 (#278 shared helper and real HTTP refusal before path I/O, no replacement files, valid Unicode names and pre-normalization checks; PR #284 strict percent-encoded query refusal for document/media reads, form decoding and valid Unicode URL regressions).


## Additional previous verification metadata

- Folder Trash verification: 2026-11-10 (#1401: injected Host/HTTP/CLI regressions, bounded inspection, Windows persistent-Chrome file-actions/folder-navigation/recovery-storage/folder-memory and production HTTP Save/Reload/recovery; real Windows Trash and packaged Desktop remain merge-queue CI scope).
- Template verification: 2026-11-04 (#936 Core/CLI and shared Host route tests; [template API](../design/document-templates-v1.md)).
- Post-replacement cleanup verification: 2026-10-27 (PR #609 review P1: four regressions failed before the fix; Host/HTTP 26, Editor 313, shared file-commit 4 passed / 2 platform skips, dedicated-port file-actions browser passed; shared file-commit behavior unchanged).
- Referenced image rename verification: 2026-10-27 (#504 PR B: Core/CLI/Host tests, file-actions browser dirty/draft protection and clean-tab reload, other-window Save conflict, production HTTP Save/Reload/recovery; rollback failures use real temporary files with injected I/O errors).
- File operations verification: 2026-10-27 (#505 / #504 PR A: Editor/Host/Desktop unit tests, workspace typecheck, production Editor build and targeted persistent-Chrome browser checks; packaged Desktop is CI-only).
- Previous verification: 2026-10-24 (#367 cross-tab follow-up: explicit Open/Close remembers the current tab's list, tree-only updates leave preferences intact; folder-memory browser regression; Host handlers unchanged).
- Previous verification: 2026-10-24 (#367 review follow-up: user Open/Close wins over same-path restoration, unchanged path preferences are not rewritten; folder-memory browser regression; Host handlers unchanged).
- Previous verification: 2026-10-24 (#367: browser preference restoration/Open/Close race and Reload regression; tab Non-goal compared with [ADR-0007](../adr/0007-editing-session-lifetime.md) and the [editing-session contract](../design/editing-session-save-v1.md#switching-and-recovery); Host handlers unchanged).
- Previous verification: 2026-10-23 (#235 [ADR-0009](../adr/0009-multiple-opened-folders.md): several opened folders in the Sidebar, paths restored from browser preferences, outermost-folder context; Host handlers unchanged; Editor unit tests and stable browser suite).
- Previous verification: 2026-10-22 (#217: all-file Sidebar listing, bounded read-only image preview; Host/Editor/Desktop protocol tests and actual Vite/production HTTP browser regressions).
- Previous verification: 2026-10-16 (#204: Editor tab admission and navigation wording checked; Host persistence and write handlers unchanged).
- Previous verification: 2026-10-14 (#215: CLI batch sequential-byte equivalence, original preservation, revision/output, batch-wide versus step errors, null option rejection and commit conflict regressions. #214: CLI inspect revision and edit precondition, real-file stale path/byte preservation and commit conflict regressions. #237: unsupported save edit fields rejected with unchanged file bytes in Host tests; actual Vite `save-session`, production HTTP and packaged Desktop Save/Reload/conflict regressions. #211 / PR #229: proxy-safe normal media separators and standalone dot-segment transport retain Host traversal checks; Editor/Host unit tests and actual Vite `image-assets` loading/Save/Reload; image choice listing, link/copy and HTTP root denial; shared handlers, root enforcement and full regressions on 2026-10-13).
