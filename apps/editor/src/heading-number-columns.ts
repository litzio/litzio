// Heading number columns (#1839): same-level heading text starts on one vertical line in the page
// and in the Outline. Each level's number sits in a column; text follows after a small gap.
//
// The one decision about the column width lives here. While `fitToDocument` is true, each level's
// column fits the widest number of that level in the open document. Set it to false to use the
// fixed widths in styles/tokens.css Adjustable values (`--heading-number-column-h1`…,
// `--outline-number-column-h1`…) instead; no other rule changes.
export const fitToDocument = true;

export type NumberedHeading = { level: number; number: string };

/** Font properties a measured number shares with the number it stands for. */
const fontProperties = ["font-family", "font-size", "font-weight", "font-style", "font-stretch", "font-kerning",
  "font-variant-numeric", "font-feature-settings", "font-variation-settings", "letter-spacing"] as const;

/** Same-level numbers as one key, so a caller can skip measuring when no number changed. */
export function numberColumnsKey(headings: readonly NumberedHeading[]): string {
  return fitToDocument ? headings.map(heading => `${heading.level}:${heading.number}`).join("|") : "";
}

/**
 * Sets `${prefix}${level}` on `target` to the widest number of that level, in em of that level's
 * number font (so zoom and font size preferences keep it), or removes it to fall back to the token.
 * `fontOf(level)` returns the computed style of a rendered number of that level.
 */
export function applyNumberColumns(target: HTMLElement, prefix: string, headings: readonly NumberedHeading[],
  fontOf: (level: number) => Partial<Record<(typeof fontProperties)[number], string>> | undefined): void {
  const widths = fitToDocument ? measure(headings, fontOf) : new Map<number, string>();
  for (let level = 1; level <= 6; level += 1) {
    const width = widths.get(level);
    if (width) target.style.setProperty(`${prefix}${level}`, width);
    else target.style.removeProperty(`${prefix}${level}`);
  }
}

/** Reads the font properties of `style` for `applyNumberColumns`. */
export function numberFont(style: CSSStyleDeclaration, overrides: Partial<Record<(typeof fontProperties)[number], string>> = {}) {
  return Object.fromEntries(fontProperties.map(name => [name, overrides[name] ?? style.getPropertyValue(name)])) as Record<(typeof fontProperties)[number], string>;
}

function measure(headings: readonly NumberedHeading[], fontOf: Parameters<typeof applyNumberColumns>[3]): Map<number, string> {
  const byLevel = new Map<number, Set<string>>();
  for (const { level, number } of headings) {
    if (!byLevel.has(level)) byLevel.set(level, new Set());
    byLevel.get(level)!.add(number);
  }
  // Off-screen, outside any editable or accessible content; one layout read for all numbers.
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;white-space:pre;contain:layout style";
  const spans: { level: number; size: number; span: HTMLSpanElement }[] = [];
  for (const [level, numbers] of byLevel) {
    const font = fontOf(level);
    const size = Number.parseFloat(font?.["font-size"] ?? "");
    if (!font || !(size > 0)) continue;
    for (const number of numbers) {
      const span = document.createElement("span");
      for (const name of fontProperties) if (font[name]) span.style.setProperty(name, font[name]!);
      span.style.display = "inline-block";
      span.textContent = number;
      probe.append(span);
      spans.push({ level, size, span });
    }
  }
  document.body.append(probe);
  const widest = new Map<number, number>();
  for (const { level, size, span } of spans) widest.set(level, Math.max(widest.get(level) ?? 0, span.getBoundingClientRect().width / size));
  probe.remove();
  // Round up so the widest number never pushes its own text past the shared line.
  return new Map([...widest].map(([level, em]) => [level, `${Math.ceil(em * 1000) / 1000}em`]));
}

/** Re-measures after web fonts finish loading, since fallback glyph widths differ. */
export function onFontsLoaded(listener: () => void): () => void {
  const fonts = document.fonts;
  if (!fonts) return () => {};
  fonts.addEventListener("loadingdone", listener);
  return () => fonts.removeEventListener("loadingdone", listener);
}
