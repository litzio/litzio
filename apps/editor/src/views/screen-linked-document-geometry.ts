import type { ScreenLinkedDocumentItem } from "@litzio/plugin-sdk";

export type Rect = { left: number; top: number; width: number; height: number };
export type Band = { id: string; key: string; path: string; direction?: string; emphasis: string; color: string };

type Endpoint = { x: number; top: number; bottom: number };

export function expand(rect: Rect, inline: number, block: number): Rect {
  return { left: rect.left - inline, top: rect.top - block, width: rect.width + 2 * inline, height: rect.height + 2 * block };
}

export function intersects(rect: Rect, viewport: Rect) {
  return rect.left < viewport.left + viewport.width && rect.left + rect.width > viewport.left &&
    rect.top < viewport.top + viewport.height && rect.top + rect.height > viewport.top;
}

function endpoint(outline: Rect, viewport: Rect, side: "left" | "right"): Endpoint {
  const start = viewport.top;
  const end = start + viewport.height;
  const edge = side === "left" ? outline.left : outline.left + outline.width;
  return {
    x: Math.max(viewport.left, Math.min(edge, viewport.left + viewport.width)),
    top: Math.max(start, outline.top),
    bottom: Math.min(end, outline.top + outline.height),
  };
}

function exit(viewport: Rect, side: "left" | "right", above: boolean): Endpoint {
  const y = above ? viewport.top : viewport.top + viewport.height;
  return { x: side === "left" ? viewport.left : viewport.left + viewport.width, top: y, bottom: y };
}

function ribbon(left: Endpoint, right: Endpoint) {
  const middle = (left.x + right.x) / 2;
  return `M${left.x},${left.top} C${middle},${left.top} ${middle},${right.top} ${right.x},${right.top} L${right.x},${right.bottom} C${middle},${right.bottom} ${middle},${left.bottom} ${left.x},${left.bottom} Z`;
}

export function linkedBand(item: ScreenLinkedDocumentItem, index: number, left: Rect, right: Rect,
  sourceViewport: Rect, documentViewport: Rect, emphasis: string): Band | undefined {
  const sourceVisible = intersects(left, sourceViewport);
  const documentVisible = intersects(right, documentViewport);
  if (!sourceVisible && !documentVisible || emphasis === "quiet" && (!sourceVisible || !documentVisible)) return;
  const sourceAbove = left.top + left.height <= sourceViewport.top;
  const documentAbove = right.top + right.height <= documentViewport.top;
  // A horizontally clipped box has no meaningful above/below direction.
  if (!sourceVisible && !sourceAbove && left.top < sourceViewport.top + sourceViewport.height) return;
  if (!documentVisible && !documentAbove && right.top < documentViewport.top + documentViewport.height) return;
  const from = sourceVisible ? endpoint(left, sourceViewport, "right") : exit(sourceViewport, "right", sourceAbove);
  const to = documentVisible ? endpoint(right, documentViewport, "left") : exit(documentViewport, "left", documentAbove);
  const direction = !sourceVisible ? `source-${sourceAbove ? "above" : "below"}`
    : !documentVisible ? `document-${documentAbove ? "above" : "below"}` : undefined;
  const color = /^--id-color-[\w-]+$/.test(item.colorToken) ? `var(${item.colorToken}, var(--id-color-info))` : "var(--id-color-info)";
  return { id: item.id, key: JSON.stringify([item.id, index]), path: ribbon(from, to), direction, emphasis, color };
}
