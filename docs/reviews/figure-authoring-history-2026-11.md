# Figure authoring v1 — 검증 이력

- Status: Historical
- Moved: 2026-11-13
- Last verified: 2026-11-13 (원문 이동과 현재 계약 링크 확인; 과거 실험 재실행 없음).
- Authority: 당시 검증 기록. 현재 규칙은 [원래 계약](../design/figure-authoring-v1.md)을 따른다.

당시 수치·캡처·실행 범위와 한계를 보존한다. 현재 요구사항이나 현재 기능의 증명이 아니다.

## Previous verification metadata

- Mermaid update: 2026-10-28 (#651: Core/CLI source semantics and Editor in-document authoring/rendering).
- Mermaid image verification: 2026-10-29 (#707: newline label decoding, XML/XHTML serialization, decoder failure notice and recovery in `mermaid-authoring`; unchanged source/disk/history).
- Property-entry update: 2026-10-27 (#557: shared selection/Enter/double-click and explicit property drafts; see [Continuous editing](../design/document-editing-v1.md#continuous-editing)).
- Active image preview verification: 2026-10-26 (#480: Figure browser preview/race/focus/overflow checks and [same-state manual captures](../design/folder-picker-v1.md#active-image-preview-480); Editor tests/typecheck/build).
- Double-click verification: 2026-10-26 (#470: figure-authoring checks Image-field focus, Edit-equivalent Cancel/Escape, unchanged document and Undo/Redo, caption word selection, pending entry and preservation of invalid/unapplied drafts; new entry assertions failed before the change).
- Image picker verification: 2026-10-26 (#461: click selection, sibling visibility, editing/Tab filtering, Use and reopening in figure-authoring; image-assets/folder-navigation/layout-rules/quiet-document browser regressions and Editor tests/typecheck/build).
- Caption-label verification: 2026-10-26 (#462 Core template rule, CLI inspect, cross-reference browser immediate update, Undo/Redo, Source and Save → Reload).
- CLI insertion verification: 2026-10-15 (#280 `--at end` before endnotes; Core/CLI tests).
- Property-focus verification: 2026-10-15 (#275 actual Apply click/Enter/Cancel/Escape reproduction, shared safe caret restoration, unchanged-caption caret/typing and formatted Save/Reload browser regressions).

### Popover comparison and verification (#757)

Same-state manual captures use Windows installed Chrome, checkout-owned persistent profiles,
English UI, bundled Pretendard, DPR 1 and default zoom, at 1440/640 × 900. Before is clean
`777368e1`; After is this PR. Both use the Mermaid/image fixture with sixteen preceding plain
context paragraphs so each target can be placed near the viewport's top or bottom. The
selected target and its caption remain visible in After; following document content may be covered.
The separate capture traversal waits for real Mermaid image rendering. It is presentation evidence,
not an additional pixel gate. Large traces/build outputs and the temporary capture driver stay
outside Git. The preview-to-prose first-click defect observed here is corrected by #760.

| Target / viewport / placement | Before | After |
| --- | --- | --- |
| image / 1440px / below | [Before](../design/assets/figure-properties-757/before-image-1440-below.png) | [After](../design/assets/figure-properties-757/after-image-1440-below.png) |
| image / 1440px / above | [Before](../design/assets/figure-properties-757/before-image-1440-above.png) | [After](../design/assets/figure-properties-757/after-image-1440-above.png) |
| image / 640px / below | [Before](../design/assets/figure-properties-757/before-image-640-below.png) | [After](../design/assets/figure-properties-757/after-image-640-below.png) |
| image / 640px / above | [Before](../design/assets/figure-properties-757/before-image-640-above.png) | [After](../design/assets/figure-properties-757/after-image-640-above.png) |
| mermaid / 1440px / below | [Before](../design/assets/figure-properties-757/before-mermaid-1440-below.png) | [After](../design/assets/figure-properties-757/after-mermaid-1440-below.png) |
| mermaid / 1440px / above | [Before](../design/assets/figure-properties-757/before-mermaid-1440-above.png) | [After](../design/assets/figure-properties-757/after-mermaid-1440-above.png) |
| mermaid / 640px / below | [Before](../design/assets/figure-properties-757/before-mermaid-640-below.png) | [After](../design/assets/figure-properties-757/after-mermaid-640-below.png) |
| mermaid / 640px / above | [Before](../design/assets/figure-properties-757/before-mermaid-640-above.png) | [After](../design/assets/figure-properties-757/after-mermaid-640-above.png) |

## Visual verification

The same pending Markdown was opened at master `252de5c` and with this implementation in Chrome (1440×1000, DPR 1, zoom 1, same profile and preferences). Before, canonical preflight made the document read-only; after, the pending Figure is editable and visibly incomplete. Both retain caption and `Figure 1`. The new frame uses existing muted text/surface tokens and a dashed boundary; no global control style or document typography changes.

| Before | After |
| --- | --- |
| ![Pending Figure at master 252de5c](../design/assets/pending-figure-before.png) | ![Editable pending Figure with no-content frame](../design/assets/pending-figure-after.png) |

Screenshots are manual presentation evidence. The `pending-figure` browser regression separately proves actual insertion/Apply/Source/history/Save/Reload and subsequent image connection; `layout-rules` and `quiet-document` check existing geometry and typography.

### Relative paths and load failure (#211)

The same clean `tmp/image-assets/paths.md` was opened before the fix at `2d5b2fb` and after it in this worktree's Vite server on port 5373. Both captures use the same checkout-specific persistent Chrome profile, 1440×1000 viewport, DPR 1, zoom 1, scroll top, no hovered/selected block and loaded Pretendard fonts. The first Figure uses `./assets/diagram.svg`, the second uses `assets/diagram.svg`, and the third uses the missing `assets/missing.png`. Before, the second and third showed broken images without an explanation. After, both valid sources load the same image and only the missing image shows an error Notice, with its caption retained.

| Before | After |
| --- | --- |
| ![Bare relative path and missing image fail silently](../design/assets/relative-image-path-before.png) | ![Both relative paths load and the missing image has an error Notice](../design/assets/relative-image-path-after.png) |

These captures are manual evidence, separate from the automated `image-assets` integration checks. The error Notice uses the existing danger text/surface/border and 14/20px UI type; it is visible at rest and adds no controls. The 375px collapsed-sidebar state was also inspected. The existing `figure-authoring`, `pending-figure`, `layout-rules` and `quiet-document` regressions protect properties, pending content and surrounding presentation.

## Additional previous verification metadata

- Media reference verification: 2026-10-27 (#504: simultaneous exact source replacement, canonical preservation/refusal, CLI dry-run/batch/revision conflicts, real Host rename and Editor reload).
- CLI asset verification: 2026-10-15 (#289 document-relative image-file/stat warnings, directory/junction and stat-failure regressions, Host path parity and dry-run result checks; source CLI and targeted tests).
- Last verified: 2026-10-14 (#212: empty-Figure paste/drop fill, existing-image insertion, single Undo/Redo and real-file Save → Reload in `image-assets`; changed-target cancellation/rollback in Editor tests. #211 / PR #229: normal media separators and standalone dot-segment transport in Editor path-table tests; Host traversal rejection, actual image loading/failure and unchanged Save → Reload paths in Editor tests and `image-assets`; Choose… image selection and existing pending Figure regressions).
