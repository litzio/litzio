import type { ScreenLinkedDocumentItem } from "@litzio/plugin-sdk";

export type Rect = { left: number; top: number; width: number; height: number };
export type Band = { id: string; key: string; path: string; direction?: string; emphasis: string; color: string; fused: boolean };

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

function ribbon(left: Endpoint, right: Endpoint, gutter: Rect, start = left.x, end = right.x) {
  const curveStart = gutter.left;
  const curveEnd = curveStart + gutter.width;
  const middle = (curveStart + curveEnd) / 2;
  return `M${start},${left.top} H${curveStart} C${middle},${left.top} ${middle},${right.top} ${curveEnd},${right.top}` +
    ` H${end} V${right.bottom} H${curveEnd} C${middle},${right.bottom} ${middle},${left.bottom} ${curveStart},${left.bottom} H${start} Z`;
}

export function linkedBand(item: ScreenLinkedDocumentItem, index: number, left: Rect, right: Rect,
  sourceViewport: Rect, documentViewport: Rect, gutter: Rect, emphasis: string, selectedBlock: boolean): Band | undefined {
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
  return { id: item.id, key: JSON.stringify([item.id, index]), path: ribbon(from, to, gutter), direction, emphasis, color,
    fused: selectedBlock && !direction };
}

export type OutlineStyle = { radius: number; stroke: number };

function roundedBox(rect: Rect, radius: number) {
  const { left, top, width, height } = rect;
  if (width <= 0 || height <= 0) return "";
  const right = left + width, bottom = top + height;
  const r = Math.min(radius, width / 2, height / 2);
  return `M${left + r},${top} H${right - r} A${r},${r} 0 0 1 ${right},${top + r}` +
    ` V${bottom - r} A${r},${r} 0 0 1 ${right - r},${bottom} H${left + r}` +
    ` A${r},${r} 0 0 1 ${left},${bottom - r} V${top + r} A${r},${r} 0 0 1 ${left + r},${top} Z`;
}

function insetEndpoint(end: Endpoint, stroke: number): Endpoint {
  const inset = Math.min(stroke, (end.bottom - end.top) / 2);
  return { ...end, top: end.top + inset, bottom: end.bottom - inset };
}

// All subpaths wind clockwise. Nonzero filling joins the boxes and ribbons,
// including branches that overlap. The inset union cuts out the border interior.
export function fusedLinkPaths(sources: Rect[], target: Rect, sourceViewport: Rect, documentViewport: Rect, gutter: Rect,
  sourceStyle: OutlineStyle, documentStyle: OutlineStyle) {
  const to = endpoint(target, documentViewport, "left");
  const targetJoin = Math.max(to.x, target.left + Math.min(documentStyle.radius, target.width / 2, target.height / 2));
  const outer = [roundedBox(target, documentStyle.radius)];
  const inner = [roundedBox(expand(target, -documentStyle.stroke, -documentStyle.stroke),
    Math.max(0, documentStyle.radius - documentStyle.stroke))];
  for (const source of sources) {
    const from = endpoint(source, sourceViewport, "right");
    const sourceJoin = Math.min(from.x, source.left + source.width - Math.min(sourceStyle.radius, source.width / 2, source.height / 2));
    outer.push(roundedBox(source, sourceStyle.radius), ribbon(from, to, gutter, sourceJoin, targetJoin));
    inner.push(roundedBox(expand(source, -sourceStyle.stroke, -sourceStyle.stroke), Math.max(0, sourceStyle.radius - sourceStyle.stroke)),
      ribbon(insetEndpoint(from, sourceStyle.stroke), insetEndpoint(to, documentStyle.stroke), gutter, sourceJoin, targetJoin));
  }
  return { outer: outer.join(" "), inner: inner.join(" ") };
}
