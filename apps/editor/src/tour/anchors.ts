import type { TourAnchorId } from "./tour.ts";

/**
 * Closed anchor registry: tours name places by id, never by selector. Each id resolves to one
 * element of the active editor; hidden tabs keep their editors mounted, so a candidate must have
 * a rendered box. Attributes `data-litzio-anchor` mark places that had no stable hook.
 */
const ANCHORS: Record<TourAnchorId, string> = {
  "document-title": '[data-litzio-anchor="document-title"]',
  "document-body": '[data-litzio-anchor="document-body"]',
  "document-first-line": '[data-litzio-anchor="document-body"] .ProseMirror > :first-child',
  "block-insert": '[data-litzio-anchor="document-body"] .block-controls:is(.visible, :hover, :focus-within) .block-insert, [data-litzio-anchor="document-body"].document--empty .block-insert',
  "outline-panel": '[data-litzio-anchor="outline-panel"]',
};

export function resolveAnchor(id: TourAnchorId, root: ParentNode = document): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>(ANCHORS[id])) {
    const box = element.getBoundingClientRect();
    if (box.width > 0 && box.height > 0 && element.getClientRects().length > 0) return element;
  }
  return null;
}
