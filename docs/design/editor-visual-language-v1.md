# Editor Visual Language — Quiet Document

- Status: Implemented
- Last verified: 2026-11-16 — 앱 글씨 역할·토큰을 대조하고 대상 브라우저 검사와 1440px 한국어 밝음·어두움 캡처를 확인했다. 설치형 Desktop·실제 AI 호출은 포함하지 않는다.
- Scope: Editor presentation. Core semantics, source format, Host persistence and editing state follow [ADR-0001](../adr/0001-single-document-editor-architecture.md) and [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md).
- Authority: [AGENTS.md](../../AGENTS.md), Accepted ADRs and [documentation governance](../contributing/documentation-governance.md). [ADR-0010](../adr/0010-supported-viewport-and-input.md) sets a minimum 640px with keyboard and pointer input.
- History: [Original rules, issue verification and captures through 2026-10-30](../reviews/editor-visual-language-history-2026-10-30.md) are Historical evidence. The v1 filename remains stable.

This document owns token/palette values, typography metrics, surface/theme details and state mappings. UI principles and decision rules follow [DESIGN.md](../../DESIGN.md).

## Direction

UI direction follows [DESIGN.md — Overview](../../DESIGN.md#overview).

[Reference mockup](assets/quiet-document-reference.png) is a visual reference, not a product screenshot or a contract for its tree, search, account, window decorations, numbering, references or autosave. Current feature contracts own those behaviors. [UI pattern targets and known mismatches](ui-patterns-v1.md#알려진-불일치) distinguish approved future work from current implementation; this document does not mark those targets complete.

## Tokens and palette

Document scrollbar uses `--id-color-border-strong` for its thumb, `--id-color-text-muted` on track hover/press, and a transparent track. [Layout Rules](editor-layout-rules-v1.md#alignment-and-ownership) owns dimensions and native scroll ownership.

Color roles and token ownership follow [DESIGN.md — Colors](../../DESIGN.md#colors). [index.css](../../apps/editor/src/index.css) maps product roles one way to shadcn/Tailwind. Product colors/radii use `--id-*` names. No alias cycles, duplicate role definitions or `!important`.

`accent` aliases `interaction`; `interaction-soft` aliases `surface-selected`; `text-selected` aliases `accent-hover`. Current Outline numbers inherit selected text; heading text retains normal color. shadcn `accent` means neutral hover and `muted` means a quiet background.

The table lists `--id-color-` roles; selected roles come from the preset tables below.

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| `paper` | `#ffffff` | `#1e2229` | Continuous Visual/Source sheet only |
| `canvas` | `#eceef2` | `#14171c` | Area outside paper |
| `surface` | `#ffffff` | `#262b34` | Floating surfaces, fields, current segments and Settings |
| `surface-subtle` | `#f6f7f9` | `#191d24` | Header, panels and neutral information |
| `surface-muted` | `#eef0f4` | `#242a33` | Code and muted faces |
| `surface-hover` | `#eaedf2` | `#303743` | Ordinary hover on panel and paper |
| `surface-pressed` | `#e3e7ee` | `#37404d` | Neutral open/pressed face and segment track |
| `text` | `#20242c` | `#edf0f5` | Main text |
| `text-muted` / `text-subtle` | `#545c68` / `#606874` | `#c3cad5` / `#b7c0ce` | Secondary labels / metadata |
| `text-on-accent` | `#ffffff` | `#14171c` | Primary-action text |
| `border` / `border-subtle` / `border-strong` | `#d9dde4` / `#e7eaf0` / `#bbc2cd` | `#737f90` / `#363e4a` / `#8491a3` | Structural separators / quiet edges / stronger rules |
| `border-control` | `#7b8390` | `#9aa6b7` | Recognizable fields and outlined controls |
| `paper-border` | Alias `border-subtle` | `#485363` | Independent paper edge |
| `danger` / `surface-danger` | `#a12b32` / `#fff1f0` | `#ffa4aa` / `#422b30` | Errors and destructive actions |
| `success` | `#14734b` | `#70d4a5` | Normal, successful and connected status text/dots |
| `warning` / `surface-warning` | `#875717` / `#fff8ed` | `#efc079` / `#3e3323` | Caution |
| `info` / `surface-info` | Alias `text-muted` / `surface-subtle` | Same aliases | Neutral information |
| `backdrop` | Black 10% | Black 45% | Modal backdrop |

Settings offers six validated presets, default Plum, with no free color picker. Missing, invalid or unreadable choices use Plum, including the CSS fallback before preferences load. Theme-scoped `--id-color-accent-{preset}` supplies each swatch and interaction role once. Scripts set validated IDs, never colors.

| Light preset | Interaction/primary/focus/number | Hover/selected text | Selected | Selected hover |
| --- | --- | --- | --- | --- |
| Blue / 파랑 | `#315fd4` | `#2449a6` | `#e9f0ff` | `#e1eaff` |
| Violet / 보라 | `#7041bd` | `#552c98` | `#f0eafa` | `#ebe3f7` |
| Plum / 자주 | `#8a3f85` | `#6d2c69` | `#f6eaf5` | `#f0e2ee` |
| Teal / 청록 | `#076f65` | `#075b53` | `#e4f3f0` | `#d5ebe7` |
| Green / 초록 | `#346d38` | `#27542b` | `#e9f2e7` | `#dfeadb` |
| Graphite / 흑연 | `#52616b` | `#3d4a53` | `#eaf0f3` | `#dfe8ed` |

| Dark preset | Interaction/primary/focus/number | Hover/selected text | Selected | Selected hover |
| --- | --- | --- | --- | --- |
| Blue | `#9abbff` | `#bdd2ff` | `#253954` | `#2d4260` |
| Violet | `#c4a8ff` | `#dac8ff` | `#38304e` | `#44395e` |
| Plum | `#dda3d5` | `#efc3e9` | `#432e40` | `#50384c` |
| Teal | `#6dd6c7` | `#a0e9de` | `#203d3b` | `#284946` |
| Green | `#9bce91` | `#c2e5ba` | `#2d3d2c` | `#374a35` |
| Graphite | `#b5c6d1` | `#d4e0e8` | `#303b43` | `#3a4751` |

UI text/generated small numbers meet 4.5:1; required control boundaries, focus and state indicators meet 3:1 against adjacent backgrounds, including canvas/paper in Flat. Document-tab markers meet 3:1 at rest and hover. Decorative dividers, segment face/shadow edges and rest-versus-hover differences do not carry a 3:1 state-boundary requirement; text and focus still do.

The encoded native-select chevron is a deliberate literal exception: data-URL SVG cannot inherit CSS variables, so its theme-specific stroke matches `text-muted`. Black/transparent mask alpha and zero-alpha rings are rendering mechanisms. Shadows remain tokens; document art and syntax/KaTeX content keep their own ownership.

## Typography

Document and UI share `Pretendard Variable → Pretendard → Noto Sans KR → Apple SD Gothic Neo → Malgun Gothic → Segoe UI → sans-serif`. The document stack aliases UI but has independent size/spacing tokens. Embedded controls retain UI typography. English and Korean use the same tokens.

Pretendard `1.3.9` is bundled through its official variable dynamic-subset CSS; Vite serves WOFF2 assets. All upstream ranges remain available, with upstream `font-display: swap` and weight range; fallback may appear during load or for unsupported glyphs. `--font-feature-sans: "cv08"` gives capital I its serifs in document/UI. KaTeX and code fonts are unaffected. Refresh the [OFL notice](../../apps/editor/public/licenses/Pretendard-OFL.txt) from the same version when updating.

| Role | Size / line height / treatment |
| --- | --- |
| Body, including callout prose | 17/28.9px, 400, document stack |
| H1–H6 | 34/45.9, 24/32.4, 20/27, 18/24.3, 16/21.6, 14/18.9px, document stack, 700 |
| Frontmatter title | H1 type while typing; empty `Add a title (optional)` / `제목 추가(선택)` uses subtle 14px normal UI type centered vertically within the same title slot; outward focus outline leaves breathing room without changing layout; no box at rest (#786) |
| App UI | Role combinations and shared classes follow [DESIGN.md — Typography](../../DESIGN.md#typography). Size tokens: `--font-size-xs/sm/md/lg/xl` = 12/14/16/20/24px; weights: `--font-weight-normal/medium/semibold` = 400/500/600. Default: sm/normal; HTML rem basis stays unchanged. |
| Figure/Table captions | 14/20px, UI stack; document token ownership |
| Table cells | 15/22px, UI stack for dense columns |
| Callout kind title | 14/21px semibold UI type |
| Endnote definition | 16/24px, document stack and normal text; separator label is UI metadata |
| Code block / inline code | Monospace 14/21px / 0.9em with inherited line height |
| Source | Read-only monospace 14/20px, subtle gutter numbers |
| Inline math / display equation | `--math-inline-size` (1.1em) / KaTeX's 1.21em; no internal KaTeX restyling |

### App typography reference captures

1440px, Korean UI, light/dark. The before images apply the saved pre-change CSS to the same DOM state; they are controlled CSS comparisons, not separate application runs. Assistant content and Desktop bridge values are fixtures; no live AI request or packaged Desktop verification is represented. Local identity/path displays are masked.

| Surface | Light | Dark |
| --- | --- | --- |
| Settings — About & updates | [before](assets/type-roles-1684/settings-about-light-before.png) / [after](assets/type-roles-1684/settings-about-light-after.png) | [before](assets/type-roles-1684/settings-about-dark-before.png) / [after](assets/type-roles-1684/settings-about-dark-after.png) |
| Settings — Assistant | [before](assets/type-roles-1684/settings-assistant-light-before.png) / [after](assets/type-roles-1684/settings-assistant-light-after.png) | [before](assets/type-roles-1684/settings-assistant-dark-before.png) / [after](assets/type-roles-1684/settings-assistant-dark-after.png) |
| Assistant tools and result cards | [before](assets/type-roles-1684/assistant-light-before.png) / [after](assets/type-roles-1684/assistant-light-after.png) | [before](assets/type-roles-1684/assistant-dark-before.png) / [after](assets/type-roles-1684/assistant-dark-after.png) |
| Window, Explorer and document | [before](assets/type-roles-1684/window-light-before.png) / [after](assets/type-roles-1684/window-light-after.png) | [before](assets/type-roles-1684/window-dark-before.png) / [after](assets/type-roles-1684/window-dark-after.png) |
| Plugin screen | [before](assets/type-roles-1684/plugin-light-before.png) / [after](assets/type-roles-1684/plugin-light-after.png) | [before](assets/type-roles-1684/plugin-dark-before.png) / [after](assets/type-roles-1684/plugin-dark-after.png) |

Korean prose wraps at eojeol boundaries with `--word-break-document: keep-all`: title, headings, paragraphs/lists/quotes/callouts, captions, cells and endnotes. Oversized tokens retain emergency wrapping. CSS declares `overflow-wrap: anywhere`, but Tiptap's injected `word-wrap` alias makes document prose compute to `break-word`; Source computes to `anywhere`. Headings retain `text-wrap: pretty`. Inline code/math keep contextual `keep-all` in headings and `normal` elsewhere, with `break-word`. Code blocks retain their own wrapping. [Layout Rules](editor-layout-rules-v1.md#exceptions-and-checks) owns local table/formula scrolling and prohibits document-wide clipping.

UI prose shares the same existing word-break token with `overflow-wrap: anywhere` at the shell, portal and embedded property-form/notice/helper boundaries (#833). Draft feedback beside the form (`.draft-status` in Equation/image/Mermaid) establishes the same boundary independently; it must not inherit the document root's `normal`. This covers draft messages, property explanations, Settings, dialog descriptions and other shell guidance in both languages. Document text, tables, Source, code, literal recovery comparisons and standalone file/path displays retain their own rules. Buttons, tabs, menu/options and input controls retain their existing wrapping/nowrap/ellipsis; prose defaults do not replace those control rules.

References read like links without box/fill: content-link color, underline on hover, subtle dashed underline when unresolved, with explicit localized unresolved text. Citations use numeric text/selected treatment; unchecked/incomplete/missing/duplicate resources use subtle dashed text, while complete limited IEEE entries have content-link color without underline. [Reference](section-references-v1.md#editor) and [citation](citations-v1.md) contracts own labels/readiness/interaction. Code comments/quotes use `text-subtle`, keywords `info`, strings `warning`, numbers/types `danger` on `surface-muted`.

## Surfaces and themes

| Surface | Expression |
| --- | --- |
| Shell | Quiet `surface-subtle` header/panels, shared structural rules; native caption background uses the same role |
| Paper | Continuous Visual/Source `paper`, independent inset edge/radius/shadow; grows without page sizes/breaks |
| Light Paper | Gentle `--shadow-paper: 0 2px 8px rgb(32 36 44 / 6%)`, quieter than overlays |
| Dark Paper | One step brighter than canvas, visible edge, zero elevation (`0 0 0 transparent`) |
| Floating menus/dialogs/properties | Themed `surface`, shared border/radius and `--shadow-overlay`; fields use control roles |
| Settings | Task-tab frame follows [DESIGN.md — Layout](../../DESIGN.md#layout); category navigation and content columns use subtle separators, without popup corners/shadow or a floating close button |
| Start without a document | Canvas with product mark/title, muted explanation and surface cards with subtle edges; never paper |
| Figure/Equation rest | Transparent; captions remain readable; metadata reserves no space |
| Callout | Kind icon, label, surface and side rule, no full outline. Note uses Info and info, Tip uses Lightbulb and success, Important uses Star and violet accent, Warning uses TriangleAlert and warning, Danger uses ShieldAlert and danger. Hint follows Tip. See also follows Note. Attention and Caution follow Warning. Error follows Danger. |
| Source editing forms | Equation/Mermaid full-column code-style source and preview; inline math uses its wrapping popover |

Settings → Appearance & language, the Activity bar toggle below Settings, and two Command Center choices share Light / Dark (#1042). With no saved choice, startup resolves the OS theme once and stores that explicit choice. Later OS changes do not change it. Resolved `:root[data-theme]` drives roles, `color-scheme` and Tailwind `dark:` together. Native and Base UI controls share roles. Images retain original pixels; KaTeX inherits text.

User theme changes use a 500ms whole-screen View Transition crossfade when available. Reduced motion, automated browsers and startup apply immediately; unsupported browsers also apply immediately. Native Desktop caption colors may change immediately. Duration lives in `--duration-theme-transition`; shared control colors and overlay opacity/transform use the motion tokens below. Focus indicators remain immediate. The command center keeps its entry transition but exits immediately so the next keystroke returns to the document. Other dialogs, menus and popovers retain their exit transition; keyboard focus returns after that lifecycle completes. Exiting overlays and notification lists stop intercepting pointer input immediately while their visual transitions finish. Disclosure uses CSS intrinsic-size interpolation only where supported. Progress values use transform, never width transitions. Reduced motion zeros both motion durations at the token source.

Motion evidence (#1681): the gallery capture pauses real CSS transitions at 15%, 40%, 70% and 100% of their token duration (light theme), plus the immediate reduced-motion result. Reproduce with `pnpm browser:test ui-gallery --screenshots`. These are sampled frames, not elapsed wall-clock recordings.

| Surface | Transition frames | Reduced motion |
| --- | --- | --- |
| Dialog | [1](assets/motion-1681/dialog-1.png), [2](assets/motion-1681/dialog-2.png), [3](assets/motion-1681/dialog-3.png), [4](assets/motion-1681/dialog-4.png) | [Immediate](assets/motion-1681/dialog-reduced.png) |
| Menu | [1](assets/motion-1681/menu-1.png), [2](assets/motion-1681/menu-2.png), [3](assets/motion-1681/menu-3.png), [4](assets/motion-1681/menu-4.png) | [Immediate](assets/motion-1681/menu-reduced.png) |
| Notification | [1](assets/motion-1681/notification-1.png), [2](assets/motion-1681/notification-2.png), [3](assets/motion-1681/notification-3.png), [4](assets/motion-1681/notification-4.png) | [Immediate](assets/motion-1681/notification-reduced.png) |
| Button hover | [1](assets/motion-1681/hover-1.png), [2](assets/motion-1681/hover-2.png), [3](assets/motion-1681/hover-3.png), [4](assets/motion-1681/hover-4.png) | [Immediate](assets/motion-1681/hover-reduced.png) |

External blocking [theme-init.js](../../apps/editor/public/theme-init.js) resolves theme/page before styles/app bundle; it temporarily sets native `color-scheme` without duplicating colors. Runtime applies theme/accent before React UI. [Desktop appearance](desktop-distribution-v1.md#appearance-595) owns native resolution/bridge and first-window background; no Host theme persistence is added.

Page style / 페이지 모양 offers Paper / 종이 (default) and Flat / 평면. `:root[data-page="flat"]`, after theme scopes, changes only canvas to paper, paper edge width/radius to zero and paper shadow to `0 0 0 transparent`. A transparent zero shadow stays valid when composed with the inset edge. Geometry and floating surfaces remain unchanged in either theme.

## Shared controls

Control selection follows [DESIGN.md — Components](../../DESIGN.md#components). Shared controls preserve refs, events and editor selection. Base UI owns shared button/focusable-disabled behavior; document-specific native controls retain their owner. [Control sizes, spacing and deliberate exceptions](editor-layout-rules-v1.md#controls-and-spacing) have one current home in Layout Rules. UI typography stays independent of document preferences.

Ghost rest is transparent; neutral hover is visible on panel/paper. Open-menu faces use neutral pressed fill without a control boundary. Secondary/Cancel has a themed outlined face and neutral hover. Select/outlined controls and modal inputs retain `border-control`; short property text fields use `surface-subtle`, a transparent rest border and visible hover/focus borders under [P05](ui-patterns-v1.md#p05-입력칸placeholder위계). Short field errors reuse `--word-break-document` (`keep-all`) for Korean eojeol boundaries and `overflow-wrap: anywhere` for oversized tokens (#819). Invalid fields retain a danger border and a connected short error under [P07](ui-patterns-v1.md#p07-입력-오류와-알림-센터); Command Center uses `surface-subtle` and structural `border`, and selected segments use surface/shadow/weight instead of a control edge.

Destructive Button appearance follows [DESIGN.md — Components](../../DESIGN.md#components). Keyboard focus retains danger text and adds the chosen-accent ring. Native disabled destructive buttons have an opaque muted face, readable secondary text and structural boundary; other native disabled controls retain dimming. Focusable `aria-disabled` keeps its muted face, secondary text, structural boundary, tooltip, focus ring and activation guard.

Controls/overlays change state without decorative transitions, pressed movement or enter/exit animation. Save retains its reduced-motion-aware progress spinner; theme changes have the whole-screen exception above. Action menu rows use shared line icons/text/separators; destructive rows use danger text/icons and enabled `surface-danger` hover. Disabled rows have no hover fill. [Menu behavior](editor-ux-shell-v1.md#unified-action-menus-516) and [P10](ui-patterns-v1.md#p10-메뉴와-선택-도구) own roles/navigation.

## State rules

Typography hierarchy and the current-value segment exception follow [DESIGN.md — Typography](../../DESIGN.md#typography).

The [assistant button status](main-agent-v1.md#대화와-표시) (#1424)
uses the existing 6px `agent-dot` slot as an absolute decoration inside the ghost
button: outlined `text-muted` circle for work, filled accent circle for unread
completion, warning square for attention. Shape and localized Tooltip/accessibility
name supplement color. The indicator reserves no layout space, introduces no
animation, and does not change the control variant or size.

These are independent axes. Visual interactions never write document attributes.

| Axis | Expression |
| --- | --- |
| Rest | No paragraph input box or block extent outline. Gutter/Edit/authoring metadata are hidden, without invisible pointer targets. Captions, references, errors and restrictions remain visible. Endnotes explicitly retain always-visible Edit under the [Endnotes contract](footnotes-v1.md#editor). |
| Mermaid kind | Editable Visual Editor retains a padded `Mermaid` badge at rest, including failures and pending source drafts; shared metadata typography, normal text contrast, muted surface, structural border, small radius and spacing tokens. Selected blocks add interaction-soft fill and interaction border (#846). Decorative chrome only; [Figure authoring](figure-authoring-v1.md#mermaid-editor) owns scope. |
| Heading depth (#887/#886) | Edit retains small, subdued `H1`–`H6` cues in the left gutter. Shared metadata size/line height, monospace as for section labels, and the theme's subtle text role; no badge fill. Center on the first heading line, including numbered/wrapped headings. Hide only while that row's block handles are visible. Decorative `aria-hidden` chrome with localized `Heading 2` / `제목 2` hover text; absent from ordinary Read, Source, text files, copying and saved documents. No setting, Outline or heading-size change. |
| Hover | Gutter, typed-block Edit and metadata appear without moving text; the route to buttons remains inside the hover area. One top-level block gets a neutral input-transparent extent overlay. Nested lists/cells indicate the whole top-level block. Geometry/clearance belongs to [Layout Rules](editor-layout-rules-v1.md#alignment-and-ownership). |
| Keyboard focus | Caret/selection plus a thin, pale chosen-accent gutter bar identify the cursor’s top-level flow block (paragraph, heading, bullet/ordered list; nested lists use the outer list). Only this one flow-block set receives the bar: blocks with their own boundary do not, including quotes with their existing left rule. The bar is absent without document focus and in Read; no frame or kind icon. `:focus-within` reveals tools; controls draw focus only on `:focus-visible`, never after a pointer click. |
| Current lists | Files, Outline and +/slash use selected surface/text and 600 semibold, no left marker. Hover uses selected-hover while current. Focus never changes current/ARIA state. Command Center retains Base UI highlighting and existing disabled/foreign-text exceptions. |
| Current segments | Shared view toggles use a pressed track, raised themed `surface`, `text`, 600 semibold and `--shadow-segment`, without control edge/marker. Inactive text is muted, normal text on hover, without a hover face. Hidden semibold labels reserve width. |
| Current tab/group | Document tabs stay flat with normal current text and an inset bottom accent marker; inactive is muted. Neutral hover preserves the marker; focus is independent. In split groups the focused group's tab-row adds selected-surface fill alongside active tab markers. |
| Pressed/open | Menu-open controls retain neutral pressed fill. Wide document/Outline on toggles use selected face/icon (selected-hover on hover), without marker/control boundary. The Activity bar Explorer item and the active screen item use the selected face/text; the open Explorer item adds the current-navigation marker. |
| Selected | The [block outline](#블록-윤곽과-연결-띠) and visible Edit; selection opens no properties. Mermaid's existing kind badge also reflects selection (#846). |
| Editing | Form/outline persist independently of selection. Typing hides no selected/editing outline. Completion/focus return follows feature contracts and [P04](ui-patterns-v1.md#p04-적용취소완료). |
| Dirty/invalid | Notices distinguish applied Save content from unapplied form input; errors preserve values. Labels/helpers/errors remain associated. Invalid field boundaries coexist with focus; operation failure does not mislabel a valid field. |
| Save refusal | Danger block/cell strokes and localized Cannot save badge identify the cause. They paint above selection/hover in the document's isolated stacking context below the header, without interactive hit targets. The danger message gives localized cause/action and collapsed keyboard-accessible Technical details retaining the original diagnostic. [Save](editing-session-save-v1.md#refused-block-highlighting-and-navigation-578-phase-1) owns lifetime/navigation. |
| Read-only | Native Read retains applied document content, hover/selection and reading aids while hiding authoring forms/tools and the empty-title hint (#849). Source soft-wraps unbroken words, with one subtle gutter number per source line and aligned continuations. Numbers/wrapping add no copied/stored characters. Foreign file rows remain subtle with crossed-file icon and native-marker description; admission follows the [support contract](document-support-v1.md). |
| Empty document | A lone empty editable paragraph shows the subtle document-type starting hint on the text axis and first `+`; its drag handle stays hidden. The hint is decoration, absent from selection/clipboard/Source/Save/dirty comparison. Title uses the small optional-title hint above. |
| Pending Figure | Dashed subtle frame contains compact `Choose image` / `Write Mermaid` actions (`이미지 선택` / `Mermaid 작성`). The actions open existing authoring flows; only completion commits content. Frame-background selection and caption behavior stay unchanged (#786). |
| Empty caption | Editable Table/image/pending/Mermaid captions use a muted italic hint only while selection is elsewhere. Number prefix/click surface remain. Generated text has an empty accessibility alternative and is absent from clipboard/Source/Save; read-only omits it. |
| Accent swatch | Checked native radio uses a 2px interaction-color circle outline with a 2px offset exposing the Settings surface; keyboard focus independently rings the transparent target. Hover subtly brightens the circle. Only the selected translated name is visible, muted metadata; all swatches keep accessible names/tooltips. No option box/background/check icon or per-circle visible name. |

Document input, IME composition and document-changing keydown commands suppress only the neutral hover outline until real pointer movement. Selection, transactions, scrolling, mouseover and resizing do not restore it; blocks passing under a stationary pointer remain suppressed. Mouseleave retains the last movement coordinates. Unsuppressed hover follows the block under the pointer, not selection. It disappears outside the host, between blocks or during block drag, where drag tint/drop line wins. The cursor bar follows selection through typing/IME/Enter independently of hover suppression. Gutter/Edit/metadata keep independent visibility. Existing no-hover fallbacks may keep tools visible and omit hover extent without creating touch-only support requirements.

Buttons use the solid 2px outer `--focus-ring`; list/menu rows, tab-group controls, checkboxes and table tools use `--focus-ring-inset`. Both use opaque `border-focus` (chosen accent). Current/error/pressed faces remain visible alongside focus. Primary controls separate accent face from ring with an inner surface boundary. Figure metadata's quiet filled fields are an explicit exception to always-visible field boundaries; [P05](ui-patterns-v1.md#p05-입력칸placeholder위계) tracks other current form differences.

Clean available Save is ghost, unsaved is accent, unavailable muted without hover. Saving preserves position/width/name while a spinner overlays a transparent label. The fixed status slot conveys unsaved/saved/operation/failure with localized text/tooltip; clean Ready is blank. Settings' unseen-update dot uses accent with localized tooltip/name; About actions use selected fill/interaction outline without animation. [Shell](editor-ux-shell-v1.md#title-strip-and-tab-row-actions-695) and [Desktop](../reviews/desktop-distribution-history-2026-11.md#settings-update-cue-verification-665) own the operations.

### 블록 윤곽과 연결 띠

윤곽은 채움 없는 안쪽 선이며, 모서리와 여백은 [배치 규칙](editor-layout-rules-v1.md#alignment-and-ownership)을 따른다.
나란히 보이는 짝을 선택하면 양쪽 블록에서 띠를 향한 변이 열리고, 띠의 위·아래 직선과 곡선이 윤곽으로 이어진다.

| 상태 | 윤곽 색 | 연결 띠 채움 |
| --- | --- | --- |
| 블록 위에 올림 | `--id-color-block-hover-outline` | — |
| 블록 선택·편집·문서 보기의 대상 | `--id-color-interaction` | — |
| 저장 거부 블록 | `--id-color-danger` | — |
| 연결된 짝의 기본 표시 | — | 항목별 `--id-color-*`, 밝음·어두움 모두 `--opacity-linked-band-quiet` 7%. 띠가 겹쳐도 구별할 수 있고 선택·올림의 포인트 색과 자료·문서 글자가 먼저 보이는 농도다. |
| 연결된 짝에 올림·키보드 focus | `--id-color-interaction` | `--id-color-interaction`, `--opacity-linked-band-hover`. 올린 짝과 키보드 focus가 있는 짝이 다르면 두 짝을 같은 상태로 강조한다. |
| 나란히 보이는 짝을 선택 | `--id-color-interaction`으로 블록과 띠를 하나의 윤곽으로 표시 | 블록과 띠 전체에 `--id-color-interaction`, `--opacity-linked-band-selected`를 한 번 적용 |

띠는 각 블록 윤곽에서 해당 스크롤 영역의 보이는 가장자리까지 수평으로 이어지고, 두 칸 사이에서만 휜다. 세로 스크롤바 위로는 띠를 이어 그리고, 가로 스크롤바 위에는 그리지 않는다. 띠는 스크롤바 조작을 가로채지 않는다. 기본·올림·키보드 focus 상태의 띠와 화면 밖 짝을 가리키는 띠에는 외곽선이 없다. 선택 색은 올림과 겹쳐도 유지한다.

## Adjustable values and preferences

Values tuned by hand or changed by taste live under **Adjustable values** in `styles/tokens.css`, with a comment describing each purpose. Rules/scripts consume shared variables rather than repeat numbers. Regression checks read tokens/resolved relationships while preserving public constraints such as standard/compact control sizes, contrast, word boundaries and unmoved text.

| Area | Adjustable variables / owner |
| --- | --- |
| Palette/theme/page | Product roles/preset scopes above; `--id-color-paper`, `--id-color-canvas`, `--id-color-paper-border`, `--size-paper-border`, `--id-radius-paper`, `--shadow-paper` |
| Body/word boundaries | `--font-family-document`, `--font-size-document`, `--line-height-document`, `--word-break-document` |
| Headings/title | `--font-size-document-h1` through `-h6`, `--font-weight-document-heading`, `--line-height-document-heading`, `--space-document-heading-before/after`; `--id-color-document-heading-number` aliases interaction; `--space-heading-number-gap` and the fixed `--heading-number-column-h1…h6`/`--outline-number-column-h1…h6` fallbacks for [same-level number columns](heading-numbering-v1.md#same-level-number-columns-1839) |
| Block/quote/list | `--space-document-block`, `--space-document-list-indent`, `--space-document-quote-indent`, `--size-document-side-rule` |
| Captions/table | `--font-size-document-caption`, `--line-height-document-caption`, `--space-document-caption`, `--font-size-document-table`, `--line-height-document-table`, `--space-document-table-cell-block/inline` |
| Code/math | `--font-size-document-code`, `--line-height-document-code`, `--font-size-document-inline-code`, `--math-inline-size`, `--layout-equation-input-min-height`, `--layout-inline-math-input-min-height`, `--layout-inline-math-popover-width` |
| Endnotes | `--font-size-document-endnote`, `--line-height-document-endnote`, `--space-document-endnotes`, `--space-document-endnote-gap/indent` |
| Editing flow-block bar | `--size-editing-block-bar`, `--id-color-editing-block-bar` (pale chosen accent); supplementary range cue alongside the caret, not a replacement for the opaque control focus ring |
| Block outlines | `--id-color-block-hover-outline`, `--size-block-hover-outline`, `--id-radius-block-hover`, `--space-block-hover-inline/block`; geometry in [Layout Rules](editor-layout-rules-v1.md#alignment-and-ownership) |
| Document column/padding | `--layout-content-width`, `--layout-content-width-wide`, `--layout-content-gutter`, `--layout-document-block-padding`, `--layout-document-block-padding-narrow`, `--layout-document-end-space`; blank end space also controls caret clearance |
| Shell/navigation | `--layout-activity-bar-width`, `--layout-activity-bar-width-icons` (names hidden), `--layout-sidebar-width`, `--layout-sidebar-width-narrow`, `--layout-document-panel-width`, `--layout-assistant-width`, `--layout-sidebar-min-width`, `--layout-sidebar-max-width`, `--layout-document-panel-min-width`, `--layout-document-panel-max-width`, `--layout-document-tab-height`, `--layout-document-tab-max-width`, `--space-sidebar-tree-indent`, `--space-outline-indent` |
| Command Center | `--layout-command-center-width`, `--layout-command-center-popup-width`, `--layout-command-center-list-height` |
| Settings | `--layout-settings-content-width`, `--layout-settings-control-width`, `--layout-document-settings-label-width`, `--layout-document-settings-label-width-narrow`, `--space-document-settings-after` |
| Figure metadata | `--layout-figure-popover-width`, `--size-figure-property-thumbnail-max-width/height`, `--space-figure-popover-gap`; preview retains intrinsic ratio |
| Motion | `--duration-fast` (250ms, control colors), `--duration-normal` (250ms, surfaces, progress, disclosure), `--ease-motion` (deceleration); at most 250ms, reduced motion disables both durations |
| Heading depth | `--font-size-heading-level`, `--id-color-heading-level`, `--space-heading-level-gap`, `--layout-reading-heading-gutter`, `--space-heading-level-reading-gap`; all in Adjustable values, using existing metadata/theme tokens |
| Folder/image picker | `--layout-folder-picker-width`, `--layout-folder-picker-height` |
| File/reading previews/comparison | `--layout-file-preview-width`, `--layout-file-preview-image-max-height`, `--layout-reading-preview-width/height`, `--layout-recovery-compare-width`, `--layout-recovery-diff-max-height` |
| Template gallery | `--layout-template-card-min-width`, `--layout-template-preview-width/height`; [reading-only preview](document-templates-v1.md#editor-gallery-phase-2) uses existing paper/type/Popover roles |
| Other presentation | `--font-feature-sans`, `--layout-start-width`, `--size-start-mark`, `--size-overflow-fade`, `--reference-underline-offset`; start title has independent UI size/line-height tokens |

Theme/page/document-width/Activity bar label preferences select validated scopes/classes, never computed/stored pixel values. The [assistant panel](main-agent-v1.md#대화와-표시) and Explorer/Document navigation panels (#1025) are explicit resize exceptions: navigation remembers independently bounded widths ([geometry](editor-layout-rules-v1.md#alignment-and-ownership)); the assistant remembers a bounded 340–560px width, with its initial width supplied by `--layout-assistant-width`. [preferences.ts](../../apps/editor/src/preferences.ts) keeps display choices in browser/app-profile storage outside Markdown/frontmatter/Core/Host requests. Missing/invalid/unreadable storage uses an initial explicit OS theme choice, Plum accent, Paper, Standard width and shown Activity bar labels. Theme/accent/page/Activity bar label write failure keeps the live choice and shows the localized Settings alert (or a notification-center error outside Settings). Wide document retains its live choice if storage fails. Startup theme/page/accent/Activity bar labels apply before first UI; document state/history/drafts survive display changes.

Bibliography, citation chips, shortcut labels and notices reuse existing type/spacing/control roles. Behavior belongs to [Citations](citations-v1.md), [Shortcuts](editor-ux-shell-v1.md#shortcut-contract-381) and [UI patterns](ui-patterns-v1.md). Overlay focus/dismissal stays with feature owners; sizing/collision clearance with [Layout Rules](editor-layout-rules-v1.md). Visual review procedure and same-state Before/After requirements live in [Reviewing a visual change](../test/README.md#reviewing-a-visual-change).

## Product mark (#864)

The product mark uses the owner-approved E soft-knot [SVG originals](app-icon-v1.md): #A50034 on light surfaces and #E0244F on dark surfaces, without a background tile or added shadow. Existing header/start-screen geometry remains in force. Marks resolve `brand.icons.svg` / `darkSvg` according to the Editor theme; the adaptive favicon uses `smallSvg` / `smallDarkSvg` according to system color scheme, with ICO fallback. Plum remains the interaction accent. About explains the Litz wire/I/O name origin. Decorative artwork is separate from control/state contrast.

## Editing block bar verification (#1022)

Current scope is defined in [State rules](#state-rules); geometry is defined in [Layout Rules](editor-layout-rules-v1.md#alignment-and-ownership).

## PDF source paper (#1337)

`--id-color-pdf-paper` is fixed white in every theme because PDF pages preserve source colors. It is independent of the theme-aware document editor paper. The surrounding viewer uses existing theme surfaces; page-number input geometry uses existing spacing tokens. This is the source-art exception approved in the [PDF shell contract](editor-ux-shell-v1.md#read-only-pdf-tabs-1337).


## Core screen consistency (#1664)

공통 Button의 테두리 변형은 outline이며 본체 기본값은 default다. 플러그인 ui.Button은
outline을 기본으로 사용한다. 질문은 이름, 선택지·답변은 내용의 굵기다. 플러그인 설정은
SettingsSwitch와 form-field를 재사용한다. 새 표면·공통 상호작용 예외는 없다.

Windows persistent Chrome, 1440×1000, English/Plum에서 같은 상태를 Light/Dark로 비교했다.
Secondary와 Outline은 두 테마에서 바탕·글자색이 동일했고 통합은 기존 Outline을 따른다.
질문/선택지 위계, 스위치 오른쪽 선, secret 이름/상태 분리, 입력 간격과 버튼 경계를 검토했다.
합성 질문·플러그인 fixture의 UI 검증이며 실제 AI·외부 서비스·packaged Desktop 수락은 아니다.

| 화면 | Light Before / After | Dark Before / After |
| --- | --- | --- |
| 질문 대기 | [Before](assets/core-screen-consistency-1664/before-question-pending-light.png) / [After](assets/core-screen-consistency-1664/after-question-pending-light.png) | [Before](assets/core-screen-consistency-1664/before-question-pending-dark.png) / [After](assets/core-screen-consistency-1664/after-question-pending-dark.png) |
| 답변 기록 | [Before](assets/core-screen-consistency-1664/before-question-history-light.png) / [After](assets/core-screen-consistency-1664/after-question-history-light.png) | [Before](assets/core-screen-consistency-1664/before-question-history-dark.png) / [After](assets/core-screen-consistency-1664/after-question-history-dark.png) |
| 플러그인 설정 | [Before](assets/core-screen-consistency-1664/before-plugin-settings-light.png) / [After](assets/core-screen-consistency-1664/after-plugin-settings-light.png) | [Before](assets/core-screen-consistency-1664/before-plugin-settings-dark.png) / [After](assets/core-screen-consistency-1664/after-plugin-settings-dark.png) |
| 갤러리 Controls | [Before](assets/core-screen-consistency-1664/before-gallery-controls-light.png) / [After](assets/core-screen-consistency-1664/after-gallery-controls-light.png) | [Before](assets/core-screen-consistency-1664/before-gallery-controls-dark.png) / [After](assets/core-screen-consistency-1664/after-gallery-controls-dark.png) |
| 대표 화면: 플러그인 목록 | [Before](assets/core-screen-consistency-1664/before-plugin-list-light.png) / [After](assets/core-screen-consistency-1664/after-plugin-list-light.png) | [Before](assets/core-screen-consistency-1664/before-plugin-list-dark.png) / [After](assets/core-screen-consistency-1664/after-plugin-list-dark.png) |
| 대표 화면: 신뢰 확인 | [Before](assets/core-screen-consistency-1664/before-plugin-trust-light.png) / [After](assets/core-screen-consistency-1664/after-plugin-trust-light.png) | [Before](assets/core-screen-consistency-1664/before-plugin-trust-dark.png) / [After](assets/core-screen-consistency-1664/after-plugin-trust-dark.png) |
| 대표 화면: 갤러리 Dialog | [Before](assets/core-screen-consistency-1664/before-gallery-dialog-light.png) / [After](assets/core-screen-consistency-1664/after-gallery-dialog-light.png) | [Before](assets/core-screen-consistency-1664/before-gallery-dialog-dark.png) / [After](assets/core-screen-consistency-1664/after-gallery-dialog-dark.png) |
