# Continuous document editing v1 — 검증 이력

- Status: Historical
- Moved: 2026-11-13
- Last verified: 2026-11-13 (원문 이동과 현재 계약 링크 확인; 과거 실험 재실행 없음).
- Authority: 당시 검증 기록. 현재 규칙은 [원래 계약](../design/document-editing-v1.md)을 따른다.

당시 수치·캡처·실행 범위와 한계를 보존한다. 현재 요구사항이나 현재 기능의 증명이 아니다.

## Previous verification metadata

- Select-all verification: 2026-10-29 (#751: Editor tests, typecheck/build, docs and targeted persistent Windows Chrome continuous-editing, footnotes, figure-authoring and image-assets regressions; Cmd+A uses Apple platform emulation).
- Title contract update: 2026-10-29 (#722; frontmatter-only title and H1–H6 body sections replace the #255/#472 leading-H1 policy).
- Last verified: 2026-10-28 (#637: in-document block equation form, native input drag/paste isolation and wider wrapping inline math form; targeted Editor and browser checks and same-state 1440/640px captures).
- Equation metadata verified: 2026-10-30 (#788: separate metadata/source entry, explicit completion boundaries and Undo, dialog exclusion, pointer caret, tab switching and applied-only Save; targeted browser checks and [1440/640px captures](../design/ui-patterns-v1.md#p04-적용취소완료)).
- Property Apply verification: 2026-10-27 (#576: shared Ctrl/Cmd+Enter submission, validation/busy guards, IME/modifier exclusions and prose hard-break isolation; Editor tests and targeted Windows Chrome browser regressions, with Apple platform emulation rather than native macOS).
- Code-language verification: 2026-10-28 (#645: selection-only menu, common grammar choices, preserved unlisted values, typeahead, language/body Undo/Redo and exact disk Save/Reload; [verification](../design/document-editing-v1.md#code-language-selection-verification-645)).
- Body-heading verification: 2026-10-26 (#472: Editor 287/287, typecheck/build, docs check; new-document, structural-block-authoring, document-title, basic-blocks and markdown-input browser regressions with the worktree's persistent Chrome profile. New insertion/menu unit assertions and browser insert/H2 promotion regressions failed on unchanged implementation before the fix).
- Double-click verification: 2026-10-26 (#470: equation-insertion checks display-formula entry through Edit, LaTeX-field focus, Cancel/Escape caret restoration, unchanged document and Undo/Redo, and an existing draft; the new entry assertion failed before the change).
- Inline math focus verification: 2026-10-26 (#460: Apply/Escape immediately restore editor focus and the caret after the formula; inline-math-authoring checks subsequent typing and Undo, alongside equation-insertion, equation-node-selection-typing, inline-math-split and property-drafts browser regressions).
- Previous Equation-end verification: 2026-10-25 (#436: `/Equation` at the document end → Apply → Enter/ArrowDown/Control+End or direct typing; the end gap cursor and explicit node selection both reached following prose. #714 supersedes explicit node-selected typing with the input-ignore policy below; gap-cursor input and the other key commands are unchanged. Browser regression also checks Chromium composition and disk Save/Reload; native OS IME is not tested).
- Previous verification: 2026-10-25 (#429 document-end shortcuts, including integration with #431/#433/#432: Editor 281/281, typecheck/build, focus-caret, continuous-editing and table-authoring browser regressions; final Figure/table, delayed focus check, native Shift selection and Apple keymap emulation on Windows Chrome; native macOS not tested).
- Table Tab verification: 2026-10-25 (#430 last-cell Tab row addition, including integration with #431/#433: Editor 281/281, typecheck/build, table-authoring and continuous-editing browser regressions including first-cell focus, typing, one-step Undo and disk Save/Reload).
- Whole-document Undo verification: 2026-10-25 (#427: saved/new/applied/local-asset Figures, Backspace/Delete and Undo/Redo; figure-authoring, image-assets and atom-boundaries browser regressions; Editor 280/280, typecheck/build).
- Previous verification: 2026-10-24 (#387 atom boundary selection: Editor 273/273, typecheck/build, six browser scenarios including the 48-case keyboard matrix, visible selection, deletion, Undo/Redo and disk Save/Reload).
- Previous verification: 2026-10-23 (source 7a214dcb lookup/handle/display-numbering changes: Editor 271/271, typecheck/build, eight browser regressions and actual 2000/5000-block input plus complete canonical Save/Reload; mixed 2000 input p95 111.7ms remains above 100ms; [evidence and limits](editor-guard-performance-2026-10-23.md)).
- Previous verification: 2026-10-23 (citation scope reconciled with the implemented units A–C [Citations contract](../design/citations-v1.md); documentation comparison only).
- Previous verification: 2026-10-22 (#332 citation atom preservation through editing, typed clipboard, history and Save → Reload; [Citations](../design/citations-v1.md)).
- Previous verification: 2026-10-19 (#255 document title: Core section/native tests, Editor save and section-command tests, the `document-title` browser scenario and CLI refusals on a scratch file; same-state 1440px captures against `a3d8992`: untitled [before](../design/assets/document-title-255/before-1440-untitled.png)/[after](../design/assets/document-title-255/after-1440-untitled.png), titled (unchanged) [before](../design/assets/document-title-255/before-1440-titled.png)/[after](../design/assets/document-title-255/after-1440-titled.png)).
- Previous verification: 2026-10-16 (Equation node-selection typing, IME-keydown composition and accepted paste, Undo/Redo and real Save/Reload; #275 property-close typing for Equation/Figure/Table/section label; ADR-0006 native editing boundary compared with code/tests). Previous verification: 2026-10-15 (#275 property-close typing). Previous verification: 2026-10-12 (heading Tab/Shift+Tab, history, selection and Core Save/Reload regression).
- Property-entry verification: 2026-10-27 (#557: selected-node Enter regression fails on unchanged master `c3f7153`; Figure/Table/math share explicit property entry and draft lifecycle. [Same-state form comparison](editor-visual-language-history-2026-10-30.md#property-form-comparison)).

### Empty-element verification and visual comparison

Before changes, the pinned MyST probe parsed empty admonitions, `>`, bullet/ordered
markers and dollar math, while native admission refused the first three and the
canonical equation writer produced `mystDirectiveError`. The implementation keeps
MyST's own empty node shapes and full semantic/re-serialization checks.

Core tests cover all supported admonition kinds, nested empty list items, empty/filled
transitions, equation numbering, label rename, and located refusal without mutation
for labels that dollar math cannot preserve. CLI tests exercise existing command inputs
and real file preservation. Editor tests exercise insertion, dirty-state collection and
Host replay. `empty-elements` checks actual disk Save/Reload, unchanged Editor state,
localized display-only prompts and typing/Undo. `equation-insertion` also checks empty
Apply, Cancel preserving the structure, and clearing an already applied new equation.
The latter first reproduced an automatic form reopen; automatic entry is now limited to
insertion/remount, not every transition to empty. No retry or timeout change was used.

Local checks: Core, CLI and Editor package tests, workspace typecheck, Editor production
build, docs/whitespace, and `empty-elements`, `equation-insertion`,
`equation-save-during-edit`, `list-authoring`, `admonition-authoring`, `layout-rules` and
`quiet-document` passed. Edge and packaged Desktop checks are left to CI.

The first CI artifacts exposed two test assumptions: `empty-elements` left Korean
as the shared profile preference, and `ui-language` expected a now-valid empty block
equation to fail. The former restores its preference in `finally`; the latter uses
the existing empty inline-math refusal to retain live error-translation coverage,
including unchanged document and draft checks. `ui-language`, `empty-elements` and
`quote-save-reload` also pass in one sequential local run. No retry or timeout increase
was used to address either failure.

Capture-only `pnpm browser:test empty-elements --screenshots` uses identical scratch
content, insertion commands, scroll, fonts and 1440/640×900 viewports. Before is the
base product at `1304a90e650d8cd54a7c0a0c5368a4d854dfa93e`; after is #574. Four small
review PNGs are retained; traces and generated logs remain under ignored `tmp/`.
Windows Chrome reused this checkout's persistent profile. BadPasswordAttempts was 0
before its first launch and 1 thereafter; each launch checked below the owner threshold.
Runner-owned servers and browser contexts are closed after each execution.

| Viewport | Before | After |
| --- | --- | --- |
| 1440px | [PNG](../design/assets/empty-elements-574/before-1440.png) | [PNG](../design/assets/empty-elements-574/after-1440.png) |
| 640px | [PNG](../design/assets/empty-elements-574/before-640.png) | [PNG](../design/assets/empty-elements-574/after-640.png) |

### Title verification and captures (#722)

Single-line title boundaries preserve surrounding spaces, quotes, colons, `#`,
strings resembling YAML null/boolean/numbers and Unicode exactly, independent
of key order and other metadata edits. Core regressions check direct operations,
opening and final write refusal of multiline/block-scalar titles, exact reopened
values and byte-identical second writes. Frontmatter keeps its actual final
line terminator; admitted block-scalar reference templates retain their trailing
spaces/newlines in either key order and through every metadata write operation.

Core title admission/operations/canonical reopening, CLI single/batch/revision/refusal
writes, Editor metadata history/recovery and real HTTP title Save are covered by
existing suites. The `document-title` browser scenario verifies absent/empty titles,
Undo/Redo, Enter, Source, actual Save → Reload, H1 movement with its label, and
Core-numbered section references. Existing `new-document`, `structural-block-authoring`,
`block-move`, `outline`, `recovery-structure`, `layout-rules`, `quiet-document`,
`focus-caret` and `equation-save-during-edit` cover the interface consequences. Old fixed-H1/H2-first assertions are replaced by
positive movement/H1-authoring assertions under the 2026-10-29 owner decision;
Native refusal and semantic round-trip checks are retained.

Manual captures use 1440×900 and 640×900, English/light, fonts ready and the same
checkout-owned persistent Chrome profile. Before is master `6d9f8d4e`; After is
this change. The existing-file comparison uses the same source and sidebar fixture
inventory; its empty metadata input and ordinary body H1 are the intended change.
The authored example is a separate file demonstrating title, numbered H1/H2,
Outline and section reference agreement. Manual review confirms title wrapping,
body alignment and no horizontal overflow at 640px. Screenshot-only capture passes
are manual evidence, separate from automated assertions. Large runner traces/logs
remain uncommitted. [Capture metadata and SHA-256 hashes](../design/assets/frontmatter-title-722/capture-metadata.json).

| Viewport | Before, existing file | After, existing file | After, authored title/body |
| --- | --- | --- | --- |
| 1440px | [Before](../design/assets/frontmatter-title-722/before-1440.png) | [After](../design/assets/frontmatter-title-722/after-existing-1440.png) | [Authored](../design/assets/frontmatter-title-722/after-authored-1440.png) |
| 640px | [Before](../design/assets/frontmatter-title-722/before-640.png) | [After](../design/assets/frontmatter-title-722/after-existing-640.png) | [Authored](../design/assets/frontmatter-title-722/after-authored-640.png) |

### Code-language input verification (#499/#527)

Historical evidence: #645 supersedes the free-text input and its composition handling.
The measurements and captures below describe the former control. Current behavior is
defined in [Code highlighting](../design/document-editing-v1.md#code-highlighting) and verified below.

On baseline `ff37a32e273dfad90bde84a9c30e2a28ec5e3af3`, CDP updates `ㅎ` → `한글`
and `Input.insertText(한글)` produced `ㅎ한글한글` in the language field. An independent
native input outside the editor and the code body both produced `한글` once. Tracking
the field's value setter identified React `restoreStateOfTarget` restoring the old
NodeView attribute after each input event, followed by the new attribute during React's
commit. Writing the old value destroyed the browser's composing range; the second update
started another composition. This confirms the controlled NodeView field's fault under
the automated lifecycle; it does not claim verification with a native Windows IME.

The existing `code-highlighting` regression now checks keyboard menu selection and
dismissal, custom/empty names, fence-name filtering, attribute/input Undo/Redo, each
composition update immediately, commit/cancel, code-body composition and Undo/Redo,
then exact canonical disk Save and Reload. The code body's existing behavior required
no change. Editor tests (291/291), workspace typecheck, Editor build, `layout-rules`,
`quiet-document`, `code-highlighting`, docs and whitespace checks passed locally.

Queue follow-up (2026-10-27, run `40344185308`, with #560): the menu was visible before its
frame-scheduled focus reached an item. The trace sent End less than 1ms after the visibility
wait returned and then Enter about 2ms later; both keydowns targeted the trigger, which
closed the menu without a language transaction. The regression now waits for the first
item's actual focus, then the intended item's focus before confirmation, and checks both
the input and engine language together after selection. No retry or timeout increase is
used, and the composition-update assertions above remain immediate.
Local probes on master `3a8be3ec509e9c647a913a3e631984fb75434065` integrated into this
branch selected the language correctly with 50ms and 100ms key holds (three trials each).
The corrected full `code-highlighting` scenario passed three consecutive runs with the
same Windows persistent profile, without retries. The integrated Editor suite passed
291/291; docs and whitespace checks passed. This is a test readiness correction; no
product code was changed for the queue failure.

Same-state manual captures: English, bundled Pretendard, Windows Chrome 155, DPR/zoom 1,
900px height, scroll top, code language `js` focused, identical composed body text. The
menu-only captures show the new disclosure after clicking it. These images do not assert
native IME behavior. [Protocol, setter evidence, environment and hashes](../design/assets/code-language-499/verification.json).

| Width | Before | After | Language menu |
| --- | --- | --- | --- |
| 1440px | [PNG](../design/assets/code-language-499/before-1440.png) | [PNG](../design/assets/code-language-499/after-1440.png) | [PNG](../design/assets/code-language-499/menu-1440.png) |
| 390px | [PNG](../design/assets/code-language-499/before-390.png) | [PNG](../design/assets/code-language-499/after-390.png) | [PNG](../design/assets/code-language-499/menu-390.png) |
