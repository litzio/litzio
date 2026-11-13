# Citations v1 — 검증 이력

- Status: Historical
- Moved: 2026-11-13
- Last verified: 2026-11-13 (원문 이동과 현재 계약 링크 확인; 과거 실험 재실행 없음).
- Authority: 당시 검증 기록. 현재 규칙은 [원래 계약](../design/citations-v1.md)을 따른다.

당시 수치·캡처·실행 범위와 한계를 보존한다. 현재 요구사항이나 현재 기능의 증명이 아니다.

## Previous verification metadata

- Document settings verification: 2026-10-27 (#580: inline settings, per-tab expansion, notation previews and existing document operations; [integration, checks and captures](../design/editor-ux-shell-v1.md#document-settings-placement-554)).
- Nested authoring verification: 2026-10-24 (#377: Editor slash tests and `citation-authoring` menu/insertion/Save → Reload on lists, quotes, simple admonitions, endnote definitions, cells, Figure captions and headings, including a citation-only list item).
- Last verified: 2026-10-27 (#463: Editor-styled citation key candidates; verification below).
- Previous verification: 2026-10-26 (#473: conditional References and shared Display/command-center connections; verification below).
- Previous verification: 2026-10-25 (#438: Editor bibliography connections apply on Save; verification below).
- Previous verification: 2026-10-23 (units A, B and C; execution results recorded below).

### Unit A historical evidence (#332)

Core tests own role/key/group preservation, exact first-occurrence numbering, all inline surfaces,
metadata path rejection, mark-preserving operations and immutable refusal. Existing literal-`@`,
shorthand, Unicode and semantic-loss tests remain. CLI tests own command/batch/JSON integration,
dry-run and unchanged file bytes. Editor tests own adapter/schema/clipboard and Save integration;
browser checks own actual typing, Undo/Redo, numbers and Save → Reload.

Local verification on Windows, 2026-10-22:

| Check | Result |
| --- | --- |
| Core / CLI / Editor complete unit suites | 233 / 65 / 258 passed |
| Repository `pnpm typecheck` | All five packages passed |
| Editor build / CLI production build | Passed; Vite reports its large-chunk warning |
| `pnpm browser:test citations --screenshots` | Passed: actual typing, cut/paste, history, live numbering, bilingual status and repeated Save → Reload |
| `pnpm browser:test continuous-editing reference-save-reload cross-reference footnotes layout-rules` | All five passed |
| `pnpm browser:test quiet-document --screenshots` | Passed; captures are separate manual review evidence |
| `pnpm browser:test http-host` | Both production Host and browser-crash recovery checks passed |
| `pnpm docs:check` / `git diff --check` | Passed |

The Core numbering regression first reproduced stale numbers after swapping footnote references
(A=1/B=2 before Save, versus B=1/A=2 after Save), then passed using the shared endnote ordering policy.
There is no new numbering implementation in an interface. Remote CI, the full stable browser suite,
Linux execution, Desktop packaging/install/update and real OS IME were not run locally. Packaging
and distribution boundaries are unchanged; those platform checks remain CI/release work. No push or
PR was made for this implementation, so this record does not claim that required CI passed.

Visual captures use actual Chrome on Windows, a checkout-owned persistent profile, Pretendard,
DPR 1 / 100% zoom, height 1000px, scroll top, loaded fonts/images, no hover or selection. The base is
`1b26d33674fe11c234245c3a6fc0f62f3bbd1feb`; the After captures use this feature's implementation. The
quiet-document rest pairs at 1440px and 414px are byte-identical, retaining the original layout and
reference style. The new Korean citation states show the document after the verified move and Save:
numeric text, wrapped groups, table caption and endnote, without clipping at 375px.

| State | Before | After |
| --- | --- | --- |
| Quiet document, 1440px | [Before](../design/assets/citations-332/before-1440-rest.png) | [After](../design/assets/citations-332/after-1440-rest.png) |
| Quiet document, 414px | [Before](../design/assets/citations-332/before-414-rest.png) | [After](../design/assets/citations-332/after-414-rest.png) |
| Citations, Korean UI, 1440px | Not admitted by the base | [Citation display](../design/assets/citations-332/citations-1440.png) |
| Citations, Korean UI, 375px | Not admitted by the base | [Citation display](../design/assets/citations-332/citations-375.png) |

The base screenshot sweep exposed a capture-preparation problem: after the 414px Display capture,
the full-screen sidebar stayed open at 375px and blocked the next hover target. The screenshot-only
loop now closes it before the next narrow viewport. This changes no product behavior or assertions.
The usable base rest captures precede the blocked step; the base sweep was interrupted, not passed.


### Unit B verification (#265)

On Windows, 2026-10-22, Core 240, CLI 66, Editor 263 and Desktop 39 unit tests passed.
`pnpm typecheck` passed all packages. The Editor and production CLI builds passed with the
existing Vite large-chunk warning and Node punycode deprecation warning. Frozen installation
and license review are recorded above. A focused Core rerun includes exact 5,000-entry and
4 MiB boundary acceptance plus over-limit refusal.

`pnpm browser:test bibliography --screenshots` passed with real clipboard movement, Undo/Redo,
Save, document-specific root retention/reopen, per-tab source snapshots, delayed Reload isolation,
invalid bibliography recovery, caption/endnote status, malicious strings, Korean and 375px output.
Browser text/status was compared against Node evaluation of the same Markdown and BibTeX snapshot.
The existing `citations --screenshots`, `quiet-document --screenshots`, `layout-rules`,
`continuous-editing` and `footnotes` scenarios also passed. Production `pnpm browser:test http-host`
passed both HTTP and process-crash recovery checks, including actual References parity, external
change/Reload and unchanged BibTeX through Save. The fixture preparation suite passed after its fix.

New exact fixtures first exposed Citation.js dropping `online.journaltitle`; the adapter now
reports conversion loss instead of approving the entry. Ordinal edition fixtures cover 11/21/22/23.
The HTTP fixture setup initially replaced the pinned Root directory, correctly causing Host refusal;
the setup now preserves Roots and refreshes only their test contents. No product Root check was weakened.

Visual evidence was explicitly awaited and directly inspected. Quiet-document Before is HEAD
`811a5662a2c69d804b0d0f419f2d84a4b4df054d`; After is this B implementation. Chrome on Windows,
checkout-owned persistent profile, DPR 1, Pretendard, 100% zoom, height 1000px, fonts loaded,
no dialogs/selection/hover. Quiet-document pairs use the same rest state and scroll top and are
byte-identical. New References captures scroll to the trailing region after the verified move/Save.

| State | Before | After |
| --- | --- | --- |
| Quiet document, 1440px | [Before](../design/assets/bibliography-265/before-1440-rest.png) | [After](../design/assets/bibliography-265/after-1440-rest.png) |
| Quiet document, 414px | [Before](../design/assets/bibliography-265/before-414-rest.png) | [After](../design/assets/bibliography-265/after-414-rest.png) |
| Unreadable parent source, 1440px | No References region | [Unverified references](../design/assets/bibliography-265/unverified-1440.png) |
| Korean References, 1440px | No References region | [References](../design/assets/bibliography-265/references-ko-1440.png) |
| Korean References, 375px | No References region | [Wrapped references](../design/assets/bibliography-265/references-ko-375.png) |

Remote CI, the full stable browser suite, Linux, packaged Desktop/install/update and a live Zotero
export were not run. Shared Desktop route wiring and unit tests passed; packaged OS validation
remains CI/release work. Unit C and #265 umbrella completion remain outstanding.


Review corrections (2026-10-22): on base `cb975a14e51be6b748cde4e28ca153d4c0264ab6`,
six regression inputs (formatted corporate author, volume, pages, standard number, competing
publisher/howpublished and organization/institution) all incorrectly returned `complete`.
After the guard corrections all six return `incomplete` with `bibliography-field-unsupported`;
identical-value collision controls and existing exact IEEE fixtures still pass. The focused Core
suite (7 tests), CLI suite (66), repository typecheck and actual `bibliography` browser scenario
passed. CLI help now describes bounded reads rather than promising unevaluated resources.

The extended browser scenario records an actual dirty bibliography document through the production
recovery producer, verifies its fixed folder context and absence of bibliography source text,
restarts the page, opens from the narrower chapter folder and restores. Dirty edits and numbers
survive, References remain unverified through Save, explicit Reload uses the stored common-folder
context and agrees with Node, and the BibTeX hash remains unchanged. No recovery producer change
or test-seeded record is involved. Existing PNGs were captured from implementation commit
`cb975a14e51be6b748cde4e28ca153d4c0264ab6`; their fixture rendering is unchanged by these guards,
and no new screenshot claims are made for recovery.

### Unit C verification (#265)

On Windows, 2026-10-23, Core 241, CLI 66, Editor 268, file-commit 4 and Desktop 40 unit tests and
`pnpm typecheck` passed. A new Core test fixes `entries`: every readable key once in source order,
uncited incomplete entries without readiness warnings, one `duplicate` item per repeated key,
readable sources kept when another fails, and no list before evaluation. The CLI JSON parity test
compares `check`/`inspect` output with the Core report, including `entries`.

`pnpm browser:test citation-authoring` opens a chapter from the common folder and checks: slash
search and Enter insertion as `cite:p` with the next number; the form's refusal of an invalid key,
a pending typed key joining the group, an unresolved typed key, and multi-key `cite` applied as
`cite:t`; Escape without change; role/key replacement; Remove; Undo/Redo; Save writing explicit
roles and groups; Save → Reload; and an unchanged BibTeX hash. Writing it exposed two form defects,
both fixed: clicking a key's remove icon handed the click to ProseMirror and dismissed the form, and
a removed focused button would have dismissed it for keyboard users. `citations`, `bibliography`,
`cross-reference`, `footnotes`, `structural-block-authoring`, `basic-blocks`, `link-authoring` and
`section-reference` also passed.

The form reuses the reference form surface, select, input and button styles; key chips use existing
border, radius, spacing and type tokens, with no new adjustable value. These 1280px captures were
taken once by temporary local instrumentation for manual review, not by an automated assertion:

| State | Capture |
| --- | --- |
| Slash search for a bibliography word | [Slash search](../design/assets/citation-authoring-265/slash-search-1280.png) |
| Insert form with a typed missing key and a pending key | [Insert form](../design/assets/citation-authoring-265/insert-form-1280.png) |
| Edit form opened from an existing citation | [Edit form](../design/assets/citation-authoring-265/edit-form-1280.png) |

### Bibliography connection verification (#438)

On Windows, 2026-10-25, the new `bibliography-connection` browser scenario failed on base
`33cef1d22f1e1a075d1703230d400a258eea6dd1` because **Connect bibliography…** did not exist.
It now passes: same-folder `refs.bib` discovery, staged notice without an early file write,
isolated Undo/Redo preserving earlier typing, English/Korean notices and phone controls,
Source preview, successful Save resolving an existing citation, slash and form key discovery,
insertion, Save → Reload, and disconnect → Save → Reload. The first Save response is held
after disk commit while typing more body text; only the submitted declaration's resource
snapshot refreshes and the later text stays dirty. The BibTeX SHA-256 remains unchanged.

Editor tests passed (283), including recovery/checkpoint replay and failed/stale resource
read guards. Repository typecheck, Editor production build, documentation checks and
`git diff --check` passed. Existing `citations`, `bibliography`, `citation-authoring`,
`save-during-edit`, `document-session`, `source-view`, `recovery-structure`, `layout-rules`,
`focus-caret` and `quiet-document --screenshots` passed. Core semantic tests were reused;
no new Core rule or CLI command was needed. Packaged Desktop and other OS checks remain CI work.

The real product captures below were inspected directly. Quiet-document Before is base
`33cef1d22f1e1a075d1703230d400a258eea6dd1`, After is this implementation. Chrome on Windows,
checkout-owned persistent profile, DPR 1, 100% zoom, bundled Pretendard loaded, scroll top,
no selection/hover/focus; the rest pairs at 1440×1000 and 375×1000 are byte-identical.
The new connection captures use the verified staged declaration and preserved unsaved text:
English at 1280×720 and Korean at 375×812, full-page capture, sidebar closed on phone.

| State | Before | After |
| --- | --- | --- |
| Quiet document, 1440px | [Before](../design/assets/bibliography-438/before-1440-rest.png) | [After](../design/assets/bibliography-438/after-1440-rest.png) |
| Quiet document, 375px | [Before](../design/assets/bibliography-438/before-375-rest.png) | [After](../design/assets/bibliography-438/after-375-rest.png) |
| Staged connection, 1280px | Connection unavailable | [Save notice](../design/assets/bibliography-438/pending-1280.png) |
| Korean connection, 375px | Connection unavailable | [Wrapped notices and controls](../design/assets/bibliography-438/pending-ko-375.png) |


Review corrections (#444, 2026-10-25): the extended `bibliography-connection` scenario first
failed on `50979d58dccb5b16bf35defecc81913b6cf28920` for both findings in the same run:
`./refs.bib` and `sub/../refs.bib` offered `refs.bib` again, `References [2024].bib` was offered
despite Core refusal, and the open candidate list at 375px had document `scrollWidth` 1306px.
The existing pure `bibliographyError` implementation moved unchanged to Core's browser-safe
citation surface; admission, `updateBibliography` and Editor candidates now call that same
validator and lexical duplicate check. There is no new declaration rule or Editor path parser.
Invalid/equivalent candidates are hidden. Candidate buttons keep their compact height, constrain
their width to the choices panel and ellipsize a child text span; full filenames remain in `title`
and their localized accessible name. The document itself does not clip overflow.

The extended browser scenario passes both exclusions, open-list panel/button and page-width
bounds at 375px, the full-name tooltip and accessible name, and connecting a long valid filename
through Save → Reload. Core tests (255), Editor tests (283), repository typecheck and Editor build
passed. Existing Core metadata/duplicate-path tests protect the unchanged declaration rules.
The `layout-rules` and `quiet-document --screenshots` regressions, documentation and diff checks
also passed; 1440px/375px quiet rest captures remain byte-identical to the original implementation.
The following full-page captures were directly inspected, on Chrome/Windows, DPR 1, 100% zoom,
375×812 viewport, Pretendard loaded, the same saved body and open choices, sidebar closed,
no text selection/hover/focus. The Before image extends horizontally because of the reproduced bug.

| Open candidate list, 375px | Before | After |
| --- | --- | --- |
| Valid long name and Core-rejected name | [Overflow and invalid choice](../design/assets/bibliography-438/candidates-before-375.png) | [Contained choices](../design/assets/bibliography-438/candidates-after-375.png) |

### Conditional References verification (#473)

The extended `bibliography-connection` scenario failed against unchanged product code at
`c2329159016cdae6183885bd24de2bd8a8046e1e` for all four #473 regressions: an unused document
had a References area, Display and the command center lacked Connect bibliography, and removing
the only citation left the area behind. The passing scenario checks both entry points staging
without writes, declaration-only Save → Reload, Disconnect and its persistence, first-citation
insertion, last-citation removal and Undo, plus Source/pending-Save restrictions. Existing
connection Undo, loaded snapshots, Core-invalid/equivalent candidates, Korean notices and
long-filename Save → Reload checks remain.

The References connect action stays to avoid a second flow: all three entry points use the same
candidate controls in the shared Dialog. Core operations, CLI parity and Host contracts are
unchanged. The Display button uses the existing compact Button and spacing token; the Dialog
uses shared typography/surface/focus handling and the existing candidate ellipsis treatment.
The phone check also measures the Dialog's own scroll/client width and candidate bounds:
it failed with 1242px of content in a 341px popup before allowing its candidate grid item
to shrink, and passes with the existing long-filename buttons contained and ellipsized.

Editor tests (286), repository typecheck, Editor production build, documentation checks and
`git diff --check` passed. The targeted browser scenarios `citations`, `bibliography`,
`citation-authoring`, `command-center`, `editor-shell`, `layout-rules` and `quiet-document`
passed sequentially in this worktree with its persistent profile. Packaged Desktop and other
platform checks remain CI work.

Same-worktree Windows Chrome captures use its persistent profile, 1280×720 viewport, DPR 1,
default 100% zoom and bundled Pretendard, the same `unused.md` fixture, no citation/declaration
and scroll top. The phone capture uses 375×812 and the existing long-name fixture.

| State | Before | After |
| --- | --- | --- |
| Unused document, Files | [Before](../design/assets/references-473/before-unused-1280.png) | [After](../design/assets/references-473/after-unused-1280.png) |
| Unused document, Display | [Before](../design/assets/references-473/before-display-1280.png) | [After](../design/assets/references-473/after-display-1280.png) |
| Shared connection Dialog, phone | — | [Candidates](../design/assets/references-473/candidates-375.png) |

### Citation key candidate verification (#463)

The citation form reuses the command center's Base UI Combobox, list rows and selection tokens,
with the existing reference form surface, shared Input/Button and a bounded scrolling list.
Only the citation form owns this composition; there is no new shared combobox abstraction or
Core operation. CLI parity is unchanged because this is an Editor-only interaction.

The extended `citation-authoring` scenario checks author/title filtering, Korean display-text
filtering, pointer and Up/Down/Enter selection, active-descendant/listbox wiring, input focus,
Escape dismissal/reopening, 640px overflow bounds and preservation of typed/unknown/invalid keys.
Browser-dispatched composition events and legacy keyCode 229 check that IME keys cannot select,
apply or cancel. These are automated event checks, not a physical Windows IME session.
Existing role/key editing, Remove, Undo/Redo and Save → Reload checks remain, including unchanged
BibTeX bytes. `bibliography-connection` now locates the same loaded key through its listbox option.

Windows local verification (2026-10-26–27): Editor tests 291/291, repository typecheck, Editor production build,
documentation and diff checks; `citation-authoring`, `bibliography-connection`, `citations`,
`layout-rules` and `quiet-document --screenshots`. Packaging and other OS checks remain CI work.

Same-worktree product captures were directly inspected. Before is clean product HEAD
`ff37a32e273dfad90bde84a9c30e2a28ec5e3af3`; After is this implementation. Chrome/Windows uses
the checkout-owned persistent profile, DPR 1, default 100% zoom and bundled Pretendard after
fonts load. Both desktop captures use 1280×720, the same `authoring.md` fixture after slash
insertion of `conference`, and the newly opened form with an empty focused key input. The
375×812 capture uses that same form with the responsive sidebar closed. Temporary capture
instrumentation was removed; generated traces and bulk captures are not committed.
The quiet-document rest pair at 375px is byte-identical; the 1440px pair differs only at two
near-white edge pixels (335,630 and 335,845), with no document layout change.

| State | Before | After |
| --- | --- | --- |
| Citation form, 1280px | [Browser datalist input](../design/assets/citation-key-list-463/before-1280.png) | [Visible candidates](../design/assets/citation-key-list-463/after-1280.png) |
| Citation form, 375px | — | [Wrapped candidates](../design/assets/citation-key-list-463/after-375.png) |

Escape/reopen correction (2026-10-27): merge queue run
[40348049812](https://github.com/litzio/litzio/actions/runs/40348049812)
showed a visible list without an active descendant after Escape → Down. Base UI's inline
navigation stays open internally, but its popup close lifecycle temporarily rejects navigation
while the transition is `ending`. Reopening during that lifecycle loses the key, rather than
delaying its result. On unchanged product code at `8b67c36`, the original scenario reproduced;
a timing probe also lost the highlight with a 50ms key gap and still had none 250ms later.
This is a product defect, not an assertion that needs polling.

The form now uses Base UI's public close-completion action in a layout effect: its inline list
has no exit animation to await. Closing clears the internal highlight before another arrow.
The existing browser regression retains immediate assertions, checks Down and Up reopening
against the actual option id, and confirms Enter adds `unicode`, not the Korean search text.
Temporary timing instrumentation passed all 24 combinations: normal/6× CPU slowdown,
0/50/100/200ms key gaps, three repetitions each, with an immediate active descendant retained
250ms later. This instrumentation and its experimental delays are not part of the regression.
Core semantics and CLI commands are unchanged.

Final local checks passed: Editor 291 tests, repository typecheck, Editor production build,
`citation-authoring`, `bibliography-connection`, `citations`, documentation and diff checks.
The production build retains its existing large-chunk warning. PR CI covers the remaining
platform and packaging checks.
