# Desktop app icon v1

- Status: Implemented
- Last verified: 2026-11-02 (#905; SVG rasterization, mask pixel checks, targeted tests and Editor captures; native packaging belongs to Windows CI).
- Authority: [ADR-0004](../adr/0004-desktop-host-distribution.md), [Desktop distribution](desktop-distribution-v1.md), [owner decision #905](https://github.com/litzio/litzio/issues/905) and [packager guide](../guides/branding.md).
- Scope: Desktop EXE, window/taskbar, NSIS installer/uninstaller and shortcuts, Editor product marks and favicon.

## Artwork and provenance

The owner approved candidate E (soft knot) on 2026-11-02 in #905: a flat trefoil with transparent crossing gaps. Grok Bot generated the candidate; the owner selected the SVGs from the [original archive](https://github.com/user-attachments/files/34252104/litzio-E-icon-set.zip). The four SVGs are copied byte for byte, under the repository [MIT license](../../LICENSE). Archive PNG/ICO files are references only. This replaces #864's ribbon L PNGs and the older [#170 selection](app-icon-v1-plan.md).

- [Base SVG](../../apps/desktop/assets/litzio-E.svg): 48px and larger.
- [Small SVG](../../apps/desktop/assets/litzio-E-small.svg): 16–32px and favicon.
- [Dark SVG](../../apps/desktop/assets/litzio-E-dark.svg) and [small dark SVG](../../apps/desktop/assets/litzio-E-small-dark.svg): dark backgrounds.
- [Windows ICO](../../apps/desktop/assets/icon.ico): 16, 24, 32, 48, 64, 128, 256px PNG frames.

Light artwork uses #A50034, dark artwork #E0244F. The Plum interaction accent remains unchanged. At 16px the crossings are subtle. Plugin icons are outside this contract.

## Regeneration and integration

```powershell
pnpm --filter @litzio/desktop icons
```

The helper reuses pinned Electron's Chromium canvas to preserve SVG luminance masks (some renderers, including CairoSVG, erase these gaps). It renders every frame directly at its target size, compares alpha pixels against the same SVG with mask attributes removed, and fails if fewer than three gap pixels survive at any size. The checked PNG buffers are encoded unchanged into ICO. Intermediate PNGs live in ignored `apps/desktop/build/icons`. The hidden Electron window always closes. No new dependency or Playwright browser installation is needed.

Commit the four source SVGs, generated ICO, and `apps/editor/public/favicon.svg` / `favicon.ico`. Packaging consumes the committed ICO so Windows Desktop CI needs no rasterizer startup. Alternate-brand CI explicitly regenerates its own ICO using the same pinned Electron and pixel check. This keeps packaging reproducible without depending on downloaded browser caches.

`brand.ts` owns `icons.svg`, `smallSvg`, `darkSvg`, `smallDarkSvg`, `ico`. Header/start marks use the configured SVGs according to the Editor theme. Vite serves/emits the configured adaptive favicon and ICO, so changing only source paths changes the built brand even without editing public assets. The generation command refreshes those public files for repository discovery. The self-contained favicon embeds both configured small SVGs and uses `prefers-color-scheme`; its 32KB limit is checked. SVG is preferred, ICO is the fallback. Paseo discovery is intentionally not tested.

Desktop runtime, `win.icon`, NSIS installer/uninstaller and EXE shortcuts use the configured ICO. Alternate-brand CI swaps SVG variants, verifies the different ICO, exact Editor SVG bytes and adaptive favicon, and retains existing install/update/uninstall checks. README uses a relative-path picture with a dark SVG source.

No document semantics change; no Core operation or CLI command is needed.

## Verification boundary

Local checks cover generation and gap pixels at all seven sizes, targeted Desktop tests/types, Editor types/build, docs, and the persistent brand-config browser scenario in both themes, English/Korean and 1440/640px. Captures are review evidence, not semantic or native Windows proof. Browser screenshots show the page; favicon resource rendering/color is checked separately because headless screenshots do not include native tab chrome.

Native packaging/install/update/uninstall and alternate-brand proof run only in required Windows CI. Historical native captures do not prove the new artwork's native appearance. GitHub README appearance can be checked on the PR branch by switching GitHub Settings → Appearance between light and dark, opening README and confirming the picture selects the matching relative SVG. Paseo automatic recognition remains outside verification by owner instruction.

Review captures: [640px light](assets/905-icon/editor-640-light.png), [640px dark](assets/905-icon/editor-640-dark.png), [generated ICO frames](assets/905-icon/ico-frames.png). The page captures include a labeled rendering of the actual favicon resource at 16/32px, rather than native browser tab chrome.
