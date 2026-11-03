# Editing block indicator visual spike #1022

- Status: Historical
- Last verified: 2026-11-03 — Windows Chrome persistent-profile manual captures, typecheck and Editor build. This is an unmerged owner comparison, not a product contract.
- Issue: [#1022](https://github.com/litzio/litzio/issues/1022)
- Current authority: [Visual Language](../design/editor-visual-language-v1.md), [Layout Rules](../design/editor-layout-rules-v1.md), [UI patterns](../design/ui-patterns-v1.md).

## Scope

Development-only `?spike1022=frame|gutter|containers` enables three alternatives in the actual Editor. No query, an unknown value and production builds retain the baseline. No setting or document field is stored. No Core/CLI operation is needed: this is selection/focus chrome only. No tests were added and this branch must not be merged or made into a PR.

BlockHandles reuses its measured top-level rectangles and ProseMirror selection. The selected block is independent of pointer hover; nested items indicate the whole outer list. Focus leaving the engine hides the experiment. Existing hover suppression, controls, document layout and semantic operations remain unchanged. The overlay is an aria-hidden, input-transparent sibling outside editable content and print. Existing Lucide icons and gutter/hover/theme tokens are reused; the experimental bar is twice the hover stroke width.

## Comparison

| Variant | Writing focus and range | Kind and tools |
| --- | --- | --- |
| frame | A continuous outline is easiest to notice; its bottom edge follows wrapping and Enter. It adds a persistent boundary around ordinary prose. | Range is explicit but the outline itself does not communicate kind. Existing hover can outline a second block. |
| gutter | Less enclosure around text; the thin line follows the full top-level height. Enter follows the resulting selection. | Icon gives kind; bar and icon sit between existing handles and text. The small gap to the move handle is visually busy, though no hit target is added. |
| containers | Same line for lists, quotes, admonitions, code, equations and tables; ordinary paragraph/heading and Figure stay quiet. | Omits ordinary prose kind/range feedback. Moving between prose and a container makes the cue appear/disappear. |

Typing and Enter were exercised for all three variants at the three capture positions. Native Enter from the flat admonition exits to a paragraph; frame/gutter follow it and containers hides there. Captures return inside the admonition. This preserves the existing semantic behavior. Hover remained suppressed after input. Long typing sessions, native Korean IME, other viewport sizes and special NodeView source-input focus are not established by these captures.

Manual inspection of all ten images found no text displacement, indicator clipping or body overlap at 1440px. Gutter icon and move handle are close together, and the admonition already has its own colored left rule. These are comparison tradeoffs, not owner approval.

Recommendation: compare gutter first because it supplies both kind and range while leaving the text unenclosed; adoption is the owner's decision.

## Captures

Windows installed Chrome, persistent checkout profile, 1440×1000, Light × nine and gutter Dark × one. Existing English converter-control sample copied to `tmp/spike-1022` with assets and bibliography. Original files and user application data are untouched; no Save was performed. PNGs are manual visual evidence, not pixel assertions. [Metadata](../design/assets/spike-1022/capture-metadata.json) records the fixture and hashes.

| Variant | Paragraph | Nested list | Admonition |
| --- | --- | --- | --- |
| frame | [Light](../design/assets/spike-1022/frame-paragraph-light.png) | [Light](../design/assets/spike-1022/frame-nested-list-light.png) | [Light](../design/assets/spike-1022/frame-admonition-light.png) |
| gutter | [Light](../design/assets/spike-1022/gutter-paragraph-light.png) | [Light](../design/assets/spike-1022/gutter-nested-list-light.png) · [Dark](../design/assets/spike-1022/gutter-nested-list-dark.png) | [Light](../design/assets/spike-1022/gutter-admonition-light.png) |
| containers | [Light](../design/assets/spike-1022/containers-paragraph-light.png) | [Light](../design/assets/spike-1022/containers-nested-list-light.png) | [Light](../design/assets/spike-1022/containers-admonition-light.png) |

## Reproduction and adoption boundary

Use an isolated development server with `LITZIO_AI_AGENT_CWD`, `LITZIO_AI_AGENT_SETTINGS_FILE`, `LITZIO_DOCLING_SETTINGS_FILE` and `LITZIO_PLUGINS_DIR` pointing into checkout `tmp`, plus a free port. Do not use the owner's application data. Copy `apps/editor/samples/en/*` recursively to `tmp/spike-1022`. Copy [manual capture script](../../apps/editor/test/manual/spike-1022.js) temporarily to `apps/editor/test/spike1022.browser.js`, set `LITZIO_BROWSER_URL` to that server and run `pnpm browser:test spike1022`. Remove the temporary bridge afterward. It is deliberately absent from the stable suite. The runner owns and closes its persistent browser; stop the caller-owned server separately.

Adoption requires an explicit choice, updating the keyboard-focus/hover state language in Visual Language and gutter priorities/clearance in Layout Rules, resolving heading-cue and existing typed-block selection/editing-outline coexistence, and deciding focus lifetime for special source forms and multi-block selections. Appropriate regression coverage belongs to that implementation, not this capture-only spike. No migration, new semantic layer, settings system or public plugin API is proposed.

## Verification

- `pnpm typecheck`, Editor production build and `pnpm docs:check` passed.
- Existing Editor tests: 419 passed. The initial run found the temporary capture bridge in the stable-scenario inventory; after removing that bridge, the unchanged tests all passed.
- Existing `pnpm browser:test quiet-document` passed with no experiment query. Capture-only `pnpm browser:test spike1022` completed on Windows Chrome; it does not establish pixel correctness or long-session usability.
- `git diff --check` passed. The runner closed its persistent browser; the owned Vite process (PID 49848, port 5182) was terminated. The pre-existing port 5173 server was left alone.
- No Edge, local packaging, PR, merge or user application-directory write was performed.
