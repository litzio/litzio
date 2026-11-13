# Editing session and Save v1 — 검증 이력

- Status: Historical
- Moved: 2026-11-13
- Last verified: 2026-11-13 (원문 이동과 현재 계약 링크 확인; 과거 실험 재실행 없음).
- Authority: 당시 검증 기록. 현재 규칙은 [원래 계약](../design/editing-session-save-v1.md)을 따른다.

당시 수치·캡처·실행 범위와 한계를 보존한다. 현재 요구사항이나 현재 기능의 증명이 아니다.

## Previous verification metadata

- Diff performance verification: 2026-11-03 (#1009 F09: recovery owns the representative large-input browser measurement; recovery-diff unit and recovery/pre-save browser checks).
- Editor groups verification: 2026-10-29 (#488 phase 1; one mounted session per document across group moves, group actions/focused shortcuts, dirty-close and navigation-only reload; [contract and evidence](../design/editor-ux-shell-v1.md#two-editor-groups-488-phase-1)).
- Recovery support verification: 2026-10-29 (#705: current-schema validation and stored plaintext refusal path; Editor tests and typecheck).
- Pre-save comparison verification: 2026-10-28 (#655 stage 2: Save parity, read-only state, external revisions, refusal locations and missing files; [visual evidence](editor-visual-language-history-2026-10-30.md#pre-save-comparison-655)).
- Visual comparison verification: 2026-11-05 (#1201: persistent-Chrome pre-save and bibliography regressions, paired 1440/640 light/dark captures, locale counts, mapping-failure Source fallback, Editor unit/type/build and documentation/boundary checks; [contract and captures](../design/editing-session-save-v1.md#pre-save-visual-comparison-1201)).
- Image rename verification: 2026-10-27 (#504: file-actions browser checks inactive dirty/property-draft refusal, clean active/inactive tabs, Source-to-Visual reload, subsequent Save and other-window revision conflict).
- Property Apply verification: 2026-10-27 (#576: shared Ctrl/Cmd+Enter submission, validation/busy guards, IME/modifier exclusions and prose hard-break isolation; Editor tests and targeted Windows Chrome browser regressions, with Apple platform emulation rather than native macOS).
- Previous execution verification: 2026-10-27 (#557 Editor tests/typecheck/build and inline-math property draft regressions: outside focus, independent instances, applied-only Save/Source, tab switching and discard/close guards).

### Host persistence verification (#296 PR3)

The Vite [`recovery` scenario](../../apps/editor/test/recovery.browser.js) covers the start-screen
**Review recovery → Restore work** entry point after a page reload. The production HTTP scenario
does not check that start-list entry point.

Tests wait for the actual expected committed record before forced termination; they establish
last-successful-record recovery, not survival of unrecorded input, power loss or OS cache loss.
Changing HTTP scheme/host/port or browser profile selects different storage; Desktop's stable
origin alone does not share records with HTTP or another profile. Windows observations do not
establish Linux/macOS execution, installed-app upgrade behavior or cross-device recovery.
Required CI must pass before #296 is considered complete. See the [test guide](../test/README.md#local-recovery-regression).

HTTP/Desktop execution details and native-dialog automation limits: [Host persistence evidence](editing-session-save-history-2026-11.md#host-persistence-evidence-296-pr3).

## Evidence

### Verification record

- Documentation verification: 2026-10-26 (startup priority and Open/New/close protection compared with ADR-0007/0009, App.tsx, Host handlers and existing regression code; no new Editor/browser/Desktop execution).
- Last verified: 2026-10-24 (#409: synchronous clean acknowledgement on return to the saved snapshot; same-turn Undo/Reload, browser-tab close, partial Undo and queued-cleanup/new-input regressions; staged Electron close/restart observation).
- Previous verification: 2026-10-24 (#383 review follow-up: unused default read failure does not block remembered tabs or explicit URL startup; actual fallback failure remains visible; document-tabs regression).
- Documentation verification: 2026-10-24 (#417 review: current production HTTP explicit-path recovery coverage and Vite start-list coverage compared with test code; no new browser execution).
- Previous verification: 2026-10-24 (#383: tab navigation memory, startup precedence, missing/refused/non-native exclusions and recovery priority; document-tabs/recovery/recovery-structure browser regressions and Editor checks).
- Previous verification: 2026-10-24 (#391 review: nested outside-click dismissal and pending guards, refreshed captures with environment metadata; final validation recorded in the PR).
- Previous verification: 2026-10-24 (#382: explicit record/all-record deletion confirmations; Editor tests, typecheck/build and recovery browser checks including cancellation/focus and Korean/English 1440/375px captures).
- Previous verification: 2026-10-23 (Save shortcut recovery summary reconciled with the Host persistence verification below; documentation comparison only).
- Previous verification: 2026-10-22 (#331: actual engine-created deletion sentinel, structured Vite New/Reload/Restore/Save and Windows production HTTP crash/Restore/Save/Reload/conflict; readable fallback and open-dialog Korean/English reason changes).
- Previous verification: 2026-10-16 (#296 PR3: actual Windows packaged Desktop and production HTTP/Chrome process termination, same-profile restart, restore, Save/Reload and external-conflict preservation; Desktop normal close and pending Figure. Linux HTTP remains a required CI check).
- Previous verification: 2026-10-16 (#296 PR2: client IndexedDB and recovery UI; actual Vite persistence/restore/Save/Reload, multiwindow conflict and failure checks).
- Previous verification: 2026-10-16 (#296 PR1: recovery-capable initialization, Editor snapshot tests and initialization/Save replay browser regression).
- Previous verification: 2026-10-16 (#204: independent tabs, Close and all-tabs guards; see the [review](document-tabs-204-2026-10-16.md) for exact validation and approved visuals).
- Previous verification: 2026-10-16 (#204 PR 1: session ownership, stale-completion unit checks, Editor/Desktop tests, typecheck/build and 16 existing browser scenarios for Open/New, Save/Reload, Source, drafts/assets, outline and Desktop guards).
- Previous verification: 2026-10-15 (#275 Equation/Figure/Table/section-label Apply/typing, retained caption/cell caret, history/Source and real Save/Reload browser regressions; ADR-0006 draft contract cleanup by code/test comparison). Previous verification: 2026-10-14 (#220 1차 저장 실패 위치·조치, split 문단·표 셀·저장 불가 문서·응답 확인 불가 안내와 기존 Save 보호 회귀).

- Switching verification: 2026-10-15 (#291: Open/New confirmation, Save failure/conflict, draft retention/loss, pending work and focus browser regressions; real Vite New and production HTTP Save/reopen; 1440/375px dialog captures reviewed, final visual approval remains with the user).
- PR #301 review verification: 2026-10-15 (delayed Save with programmatically injected applied edits stops Open/New, retains the session and drafts, shows the existing Unsaved changes status, and allows an explicit retry; original `c8aecd9` failed this regression).
- Encoding verification: 2026-10-15 (#271 Source/Save invalid-Unicode and request UTF-8 refusal; Vite/production HTTP repeated valid Unicode Save → Reload and external-conflict regressions).

### Recovery deletion evidence (#382)

#382 visual evidence uses the same recorded document and viewport before requesting deletion and
with the new confirmation open (the former immediate-delete behavior had no confirmation surface):
[review at 1440px](../design/assets/recovery-382/prompt-1440.png),
[confirmation at 1440px](../design/assets/recovery-382/delete-confirm-1440.png),
[review at 375px](../design/assets/recovery-382/prompt-375.png),
[confirmation at 375px](../design/assets/recovery-382/delete-confirm-375.png),
[Korean confirmation at 375px](../design/assets/recovery-382/delete-confirm-ko-375.png),
[Clear all at 375px](../design/assets/recovery-382/clear-confirm-375.png).
Capture refresh for the #391 review: product/test HEAD
`b46c13d0f85ca4cddc9e4afe361eabc1b7ce61b1` (latest master merged), Windows Chrome,
checkout-owned persistent profile, Vite `http://127.0.0.1:5173`, 1440×900 and 375×900,
DPR 1 / 100% zoom, scroll top, the same recovery record before deletion and with the
confirmation open. Korean capture changes only the UI language while that dialog stays open.
Bundled Pretendard Variable 1.3.9 and the existing product font stack are unchanged;
each capture waits for `document.fonts.ready`. The nested confirmation now has its own
Base UI backdrop, dimming/blurring the parent while keeping only the top dialog interactive.
The pre-existing narrow parent recovery-review clipping is outside this change.

The recovery scenario checks confirmed deletion, Cancel/Escape preservation and focus return,
all-record cancellation, outside-click dismissal of only the top confirmation at both entry points,
pending outside-click refusal at both entry points, live Korean/English target and warning text,
and popup content bounds.

### Structured recovery evidence (#331)

Visual evidence re-captured on 2026-10-22 after review found that the earlier temporary prompt
images preceded the dialog and did **not** prove its state. The following replacements were
inspected with the dialog visible and Restore's enabled/disabled state checked before capture:

- [Prompt before](../design/assets/recovery-331/prompt-before.png): the real New/title/Enter flow generated
  the empty deletion sentinel; Restore is disabled with the deletion-metadata reason.
- [Prompt after](../design/assets/recovery-331/prompt-after.png): the same writing/reopen flow with fixed
  production code offers enabled Restore.
- [Fallback before](../design/assets/recovery-331/fallback-before-en.png) and
  [fallback after](../design/assets/recovery-331/fallback-after-en.png): a test-owned record with unknown
  deletion path `999` is refused in both. The copy shows the old attribute dump versus readable
  math, table cells/caption and Figure caption.
- [Korean fallback](../design/assets/recovery-331/fallback-after-ko.png): the same open refusal dialog after
  switching language, retaining the disabled Restore action and readable copy.

Comparison conditions: Windows Chrome, checkout-owned persistent profile, Vite origin
`http://127.0.0.1:5191`, 1280×1000 viewport, DPR 1, bundled fonts loaded. Product HEAD was
`7e62ee22aba6477a067bef4f42f16309eb0afa73`; the capture-only scenario changes are included with
these images. For prompt-before, only `editor-schema.tsx` and `editor-snapshot.ts` were temporarily
replaced with `811a5662a2c69d804b0d0f419f2d84a4b4df054d` versions; the temporary scenario asserted
disabled Restore and stopped after capture. For fallback-before, only `recovery-storage.ts` used
that older version: **it shows the new guidance with the old producer, not the complete baseline
UI**. Each temporary replacement was restored and `git diff --exit-code -- apps/editor/src`
passed before final regression. Test-created filenames differ between runs; content and steps match.
All fallback images enlarge the textarea to 420px and scroll it to the top **for capture only**;
this is not the product's default control height or a stylesheet change. The after images expose
the complete sample copy; the longer old dump still continues below its viewport. No user records
or user browser profile were accessed. Final `recovery-structure --screenshots` passed; the two
before runs intentionally stopped at the confirmed refusal or internal-attribute regression.

### Host persistence evidence (#296 PR3)

On Windows x64, `pnpm browser:test http-host` now also kills the owned Chrome browser process
tree and relaunches a new PID with the same checkout-owned persistent profile and exact HTTP
origin. The production server stays running: this is a client crash, not a server restart or
page reload. Both restarts explicitly request `?path=…` under the
[startup precedence contract](../design/editing-session-save-v1.md#tab-navigation-memory-383). The test compares committed IndexedDB
records before/after restart, then exercises the matching-file recovery review dialog, user
Restore, dirty state, unchanged disk until explicit Save, actual Save/Reload, and a second crash
followed by an external disk change and a 409 with both external bytes and recovered work preserved.

The packaged Windows Desktop regression uses the bundled `litzio://app` UI origin (ADR-0017),
the real fixed daemon HTTP Host (ADR-0016), and verifies
that Electron `userData` and `sessionData` are the same isolated test profile across new app PIDs.
Forced app-tree termination preserves the committed record including an inserted pending Figure;
Restore and Save/Reload use the real packaged Editor and file Host. A subsequent normal window
close exercises the real `beforeunload`/main-process guard with the native dialog's response stubbed
to **Close without saving** (the offered buttons are asserted). Restart retains that record;
external modification before Restore produces 409 on Save without overwriting either side.
The OS-native dialog click itself is not automated. No file API, IndexedDB implementation or
recovery UI is mocked in these Host flows.

### Save, switching and property interaction evidence

Historical #291 evidence (the confirmation now belongs to Close): the unmodified `ae464b7` Editor reproduced the draft information bar plus the red Open refusal, with that refusal still present after cancelling the property draft. At 1440×800 and 375×800 the two header bars were stacked without geometric overlap. The new confirmation does not create this refusal error; Cancel/Escape preserve content, selection, undo availability and drafts. Existing unrelated errors remain until dismissed or resolved. `open-files` covers these transitions, pending Save/Open, Save failure/conflict and the draft-only case; `writeability-preflight` checks that a failed target Open also keeps the old work. `new-document`, `save-session` and `http-host` exercise real creation, content rejection and persisted Save/reopen. Baseline images are `tmp/291-before-*-draft-refusal.png` and `tmp/291-before-*-after-draft-cancel.png`; `pnpm browser:test open-files --screenshots` captures the new dialog in `tmp/291-dialog-{1440,375}-{no-drafts,drafts}.png` (100% zoom, DPR 1, bundled Pretendard, Windows Chrome).

For #275, the unmodified `5594143` Editor was reproduced with `math.md`: Edit the
labeled `eq-a` Equation, change `x` to `x + 1`, Apply, then type `Typed275` without
another click. Apply left `{type: "node", anchor: 102}` focused in the document;
typing replaced the Equation with a paragraph. Source lost the math directive but
retained `{eq}` pointing to `eq-a`, and its chip changed from resolved to unresolved.
Apply click, Enter on Apply and Enter in Label all reproduced it, with and without
renaming the label. A different label deliberately leaves the old reference
unresolved already at Apply; this is distinct from the subsequent node loss.
Ctrl+Enter in LaTeX did not submit the form. The existing `focusBlock` selected the
atom on form close; restoring an engine text/gap caret fixes that interaction
without changing Core semantics or adding a CLI operation. The
`equation-save-during-edit` browser regression failed on the original code and now
covers immediate typing at middle/end/sole Equations, a reference-preserving label
case change, Undo/Redo before and after Save, Source equality with disk and Reload.

The rename-to-missing observation above predates #374. Current non-empty property renames
[update references atomically](../design/section-references-v1.md#editor); they do not trigger #375's
deletion notice. The original reproduction remains historical evidence of the focus bug.

Review follow-up on `1b76abb` reproduced the same loss for Figure, Table and section
label properties. With a caret in unrelated prose, Edit → Apply click or Enter →
typing left a whole-block NodeSelection, replaced that target with prose, and
made its `{numref}`/`{ref}` unresolved. Cancel and Escape had the same result.
Table-cell selections survived all three closing paths; Figure-caption selections
survived Cancel/Escape, but Apply replaced even an unchanged caption and mapped
its caret out of the Figure. The shared close rule now retains only an internal
text selection, otherwise returning a text/gap caret after the block. Figure
Apply uses the existing attribute-only transaction when its caption is unchanged.
`property-drafts` covers both Apply methods with Figure caption, Table grid/cell
and section-label/heading/reference checks; its Cancel/Escape cases retain the
unchanged document. `figure-authoring` covers formatted caption caret/typing and
Save/Reload, as well as validation finishing after focus has moved elsewhere.
This is still Editor interaction only, with no new Core operation or CLI command.

Before the change, an actual browser Save replaced the editor, changed selection from 287 to 1, and changed `can().undo()` from true to false. `save-session.browser.js` exercises real scratch-file persistence across Save/history, transient content, delayed responses, rejection, conflict, draft preservation and reload. Its composed Endnote/Figure case retains the scattered opening source through normalization, successive saves and Undo/Redo, changes reference order and a Figure's caption, and edits a definition while a real Save response is held. It compares complete Markdown, SHA-256 revisions, the previous accepted `savedEdits`, Source previews and unchanged Editor/selection across Save; Reload retains the empty Figure and the later definition edit. Core's existing footnote source and write-refusal tests also run after Figure caption parsing: nested MyST parsing must not leave the cached source tokenizer's tail rule enabled, losing definition provenance and dropped-definition checks. Existing Figure, table, Source and delayed-save scenarios cover their distinct integration risks. Run `pnpm browser:test save-session` or the complete CI suite described in [TEST_GUIDE](../test/TEST_GUIDE.md).

### Recovery review layout (#395)

The regression was reproduced at product HEAD `c587663d18744d8950859a1ae77fd72ddbc9cb1c`
with only the new browser assertions present. At 375px the popup had `clientWidth=341`,
`scrollWidth=390`, and all three footer buttons exceeded its right boundary. At 1440px it had
`382/390` client/scroll widths. `break-word` did not reduce the path's intrinsic minimum width;
`anywhere` supplies those opportunities during grid sizing, without clipping or a new footer layout.
The early failure also prevented the scenario's later expected 409/400 requests; those missing-request
reports were secondary, not additional product failures.

| Recovery review, same record/state | Before | After |
| --- | --- | --- |
| 1440×900 | [Before](../design/assets/recovery-395/before-1440.png) | [After](../design/assets/recovery-395/after-1440.png) |
| 375×900 | [Before](../design/assets/recovery-395/before-375.png) | [After](../design/assets/recovery-395/after-375.png) |

Capture environment: Windows Chrome, same checkout-owned persistent profile, Vite at
`http://127.0.0.1:5173`, DPR 1, 100% zoom, scroll top, English UI, fonts ready, bundled
Pretendard Variable 1.3.9 and the unchanged product fallback stack. Actual capture HEAD is
`c587663d18744d8950859a1ae77fd72ddbc9cb1c` for both pairs; After includes the one-line
RecoveryPrompt `break-words` to `[overflow-wrap:anywhere]` working-tree change and the extended
recovery scenario. No other product change was present. Historical #382 evidence above is preserved.

The existing recovery scenario now checks path and popup scroll/client widths and footer-button
rectangles at both sizes even without `--screenshots`, plus Playwright actionability trials for enabled
review actions. Its incompatible-record case uses a long unbroken Windows path with Korean text,
expanded plaintext and the clipboard error visible, retaining the disabled Restore assertion.

After visual review: at 375px the path and popup are bounded (`309/309` and `341/341`
client/scroll widths), and at 1440px they are `350/350` and `382/382`. All review actions
remain inside the dialog; enabled actions pass click trials. The desktop footer remains one row.
The [long incompatible-record capture](../design/assets/recovery-395/incompatible-375.png) also keeps its
expanded plaintext, standing clipboard error and all footer buttons visible at 375×900.


### Visual comparison captures and observed timing

Manual Windows persistent Chrome, 1440/640 × 900, English, light/dark, same technical
document, unchanged frontmatter title “Converter report”, and applied “Preview. 미리보기.” heading edit. Before is source-only baseline
`c1f8f2a8`; after is the selected Visual comparison with one adjacent context block
and the remaining 11 blocks collapsed. Baseline and final capture use a task-owned
5191 Vite server to avoid another checkout's default-port server. The server and
browser session are stopped after capture; no caller-owned server is stopped.

| Width/theme | Before (Source-only baseline) | After (Visual) |
| --- | --- | --- |
| 1440 light | [Before](../design/assets/visual-compare-1201/before-1440-light.png) | [After](../design/assets/visual-compare-1201/visual-1440-light.png) |
| 1440 dark | [Before](../design/assets/visual-compare-1201/before-1440-dark.png) | [After](../design/assets/visual-compare-1201/visual-1440-dark.png) |
| 640 light | [Before](../design/assets/visual-compare-1201/before-640-light.png) | [After](../design/assets/visual-compare-1201/visual-640-light.png) |
| 640 dark | [Before](../design/assets/visual-compare-1201/before-640-dark.png) | [After](../design/assets/visual-compare-1201/visual-640-dark.png) |

One small-document observation: comparison request round trip 59ms; response to both
Editor DOMs attached 49ms. This separates the request from attachment, not pure Core
CPU from pure rendering; it excludes completion of async assets and is not a
large-document benchmark or a guarantee at the provisional 1000-block limit.


## Additional previous verification metadata

- Last verified: 2026-11-05 — master 303e9a1의 Host 등록·탭·비서·템플릿 진입 코드를 정적 대조. 문서 검사 수행; 실제 원격 연결·제품 실행은 재검증하지 않음.
- Recovery Visual verification: 2026-11-05 (#1201: recovery, bibliography, multi-Host, pre-save and text browser regressions; 1440/640 light/dark captures; workspace typecheck, targeted unit, production build and documentation/boundary checks; [contract](../design/editing-session-save-v1.md#recovery-visual-comparison-1201)).
- Save refusal verification: 2026-10-28 (#578 phase 2: structured Core codes and bilingual cause/action in the alert and badge; [diagnostic guidance](../design/editing-session-save-v1.md#diagnostic-guidance-578-phase-2). Phase 1: localized summaries and collapsed original details, block/cell highlighting and keyboard reveal, list-shaped state with conservative submitted-snapshot invalidation; no Host/Core validation policy change).
- File operations verification: 2026-10-27 (#505 / #504 PR A: Editor/Host/Desktop unit tests, workspace typecheck, production Editor build and targeted persistent-Chrome browser checks; packaged Desktop is CI-only).
