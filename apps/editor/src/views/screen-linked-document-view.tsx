import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { ScreenLinkedDocumentItem, ScreenLinkedDocumentViewProps } from "@litzio/plugin-sdk";
import { Button } from "../components/ui/button.tsx";
import { useTranslation } from "react-i18next";
import { DocumentViewSnapshot, type DocumentViewGeometry } from "./screen-document-view.tsx";
import { expand, fusedLinkPaths, intersects, linkedBand, type Band, type Rect } from "./screen-linked-document-geometry.ts";
import "./screen-linked-document-view.css";

type LinkedProps = ScreenLinkedDocumentViewProps<ReactNode>;
type ItemIndex = ReturnType<typeof indexItems>;

function indexItems(items: LinkedProps["items"]) {
  const byId = new Map<string, ScreenLinkedDocumentItem>();
  const byPath = new Map<string, ScreenLinkedDocumentItem[]>();
  for (const item of items) {
    const boxes = item.boxes.filter(box => [box.left, box.top, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0);
    if (!boxes.length || byId.has(item.id)) continue;
    const entry = { ...item, boxes };
    const key = JSON.stringify(entry.path);
    byId.set(entry.id, entry);
    const group = byPath.get(key);
    if (group) group.push(entry);
    else byPath.set(key, [entry]);
  }
  return { byId, byPath };
}

/** The source content and selected ID are controlled by the screen. */
export function LinkedDocumentView({ document: view, revision, source, sourceLabel, sourceRef, sourceScale = 1, items, selectedId, onSelect }: LinkedProps) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const sourceViewport = useRef<HTMLDivElement>(null);
  const setSourceViewport = useCallback((element: HTMLDivElement | null) => {
    sourceViewport.current = element;
    sourceRef?.(element);
  }, [sourceRef]);
  const [geometry, setGeometry] = useState<DocumentViewGeometry>();
  const index = useMemo(() => indexItems(items), [items]);
  const matching = geometry?.revision === revision ? geometry : undefined;
  const scale = Number.isFinite(sourceScale) && sourceScale > 0 ? sourceScale : 1;
  const height = view.height ?? 480;
  const fillHeight = height === "fill";
  const select = (id: string) => {
    const item = index.byId.get(id);
    if (!item || !matching) return;
    const key = JSON.stringify(item.path);
    if (matching.positions.blocks.some(block => block.key === key)) onSelect(id);
  };
  const firstItem = (key: string) => {
    const group = index.byPath.get(key);
    return group?.find(item => item.id === selectedId) ?? group?.[0];
  };
  return <div className="linked-document-view" data-fill-height={fillHeight || undefined}>
    <p className="type-helper linked-document-narrow-hint">{t("Widen the window to compare side by side.")}</p>
    <div ref={host} className="linked-document-panes">
      <div ref={setSourceViewport} className="linked-document-source" role="region" aria-label={sourceLabel} tabIndex={0}
        style={fillHeight ? undefined : { height }} onClick={event => {
          const id = linkedId(event.target, event.currentTarget, "data-linked-item");
          if (id !== undefined) select(id);
        }}>{source}</div>
      <DocumentViewSnapshot view={{ ...view, onBlockClick: block => {
        view.onBlockClick?.(block);
        const item = firstItem(JSON.stringify(block.path));
        if (item && block.revision === revision) onSelect(item.id);
      } }} onGeometry={setGeometry} />
      <LinkedBands host={host} source={sourceViewport} geometry={matching} index={index}
        sourceScale={scale} selectedId={selectedId} onSelect={select} />
    </div>
  </div>;
}

function linkedId(target: EventTarget | null, host: HTMLElement, attribute: string) {
  const element = target instanceof Element && target.closest(`[${attribute}]`);
  return element && host.contains(element) ? element.getAttribute(attribute) ?? undefined : undefined;
}

function viewportRect(element: HTMLElement, host: DOMRect): Rect {
  const box = element.getBoundingClientRect();
  return { left: box.left + element.clientLeft - host.left, top: box.top + element.clientTop - host.top,
    width: element.clientWidth, height: element.clientHeight };
}

function scrollbarRects(pane: HTMLElement, viewport: Rect): Rect[] {
  // Both panes use the same border on every edge. clientLeft includes any
  // scrollbar on the left, while clientWidth and clientHeight exclude them.
  const border = pane.clientTop;
  const left = pane.clientLeft - border;
  const width = pane.offsetWidth - 2 * border;
  return [
    { left: viewport.left - left, top: viewport.top, width: left, height: viewport.height },
    { left: viewport.left + viewport.width, top: viewport.top, width: width - left - viewport.width, height: viewport.height },
    { left: viewport.left - left, top: viewport.top + viewport.height, width, height: pane.offsetHeight - 2 * border - viewport.height },
  ].filter(rect => rect.width > 0 && rect.height > 0);
}

function rectPath({ left, top, width, height }: Rect) {
  return `M${left},${top}h${width}v${height}h${-width}Z`;
}

type Outline = Rect & { key: string };
type BlockAction = { key: string; item: ScreenLinkedDocumentItem; style: CSSProperties };

type Drawing = {
  bands: Band[];
  fused?: ReturnType<typeof fusedLinkPaths>;
  left: Outline[];
  right: Outline[];
  actions: BlockAction[];
  sourceViewport: Rect;
  documentViewport: Rect;
  gutter: Rect;
  paintPath: string;
};

function LinkedBands({ host, source, geometry, index, sourceScale, selectedId, onSelect }: {
  host: RefObject<HTMLDivElement | null>;
  source: RefObject<HTMLDivElement | null>;
  geometry?: DocumentViewGeometry;
  index: ItemIndex;
  sourceScale: number;
  selectedId?: string;
  onSelect(id: string): void;
}) {
  const hitClip = useId();
  const paintClip = useId();
  const fusedClip = useId();
  const fusedBorder = useId();
  const [drawing, setDrawing] = useState<Drawing>();
  const probe = useRef<HTMLSpanElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const blockIndex = useMemo(() => new Map(geometry?.positions.blocks.map(block => [block.key, block])), [geometry?.positions]);
  const selected = selectedId === undefined ? undefined : index.byId.get(selectedId);
  const selectedPath = selected && JSON.stringify(selected.path);
  useLayoutEffect(() => {
    if (!host.current || !source.current || !geometry || !probe.current) {
      setDrawing(undefined);
      return;
    }
    const root = host.current;
    const leftPane = source.current;
    const { viewport: rightPane, paper, actionHost, scale, positions } = geometry;
    const tokens = probe.current;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const hostBox = root.getBoundingClientRect();
      const paperBox = paper.getBoundingClientRect();
      const actionsBox = actionHost.getBoundingClientRect();
      const origin = { left: paperBox.left - hostBox.left, top: paperBox.top - hostBox.top };
      const sourceViewport = viewportRect(leftPane, hostBox);
      const documentViewport = viewportRect(rightPane, hostBox);
      const sourceOrigin = { left: sourceViewport.left - leftPane.scrollLeft, top: sourceViewport.top - leftPane.scrollTop };
      const gutterLeft = leftPane.getBoundingClientRect().right - hostBox.left;
      const gutterRight = rightPane.getBoundingClientRect().left - hostBox.left;
      const gutter = { left: gutterLeft, top: 0, width: Math.max(0, gutterRight - gutterLeft), height: hostBox.height };
      const paintPath = [
        { left: 0, top: 0, width: hostBox.width, height: hostBox.height },
        ...scrollbarRects(leftPane, sourceViewport),
        ...scrollbarRects(rightPane, documentViewport),
      ].map(rectPath).join(" ");
      const { width: inline, height: block } = tokens.getBoundingClientRect();
      const focus = document.activeElement;
      const focusId = focus?.matches(":focus-visible") ? linkedId(focus, root, "data-linked-item") : undefined;
      const focusedBlock = rightPane.contains(focus) ? focus?.getAttribute("data-linked-action") : null;
      const point = pointer.current;
      const underPointer = point && document.elementFromPoint(point.x, point.y);
      let hovered = linkedId(underPointer, root, "data-linked-band") ?? linkedId(underPointer, leftPane, "data-linked-item");
      const x = point && point.x - hostBox.left;
      if (hovered === undefined && point && underPointer && rightPane.contains(underPointer) &&
        x !== null && x >= documentViewport.left && x < documentViewport.left + documentViewport.width) {
        const y = point.y - paperBox.top;
        const key = positions.blocks.find(rect => !rect.key.includes(":") && y >= rect.top && y < rect.top + rect.height)?.key;
        const group = key && index.byPath.get(key);
        if (group) hovered = (group.find(item => item.id === selectedId) ?? group[0]).id;
      }
      const active = new Set([selectedId, hovered, focusId]);
      const bands: Band[] = [];
      const fusedSources: Rect[] = [];
      let fusedTarget: Rect | undefined;
      const left: Outline[] = [];
      const right: Outline[] = [];
      const actions: BlockAction[] = [];
      // Join through visible document blocks, plus the active items that may have a partner offscreen.
      const candidates = new Set<ScreenLinkedDocumentItem>();
      for (const position of positions.blocks) {
        const group = index.byPath.get(position.key);
        if (!group) continue;
        const top = origin.top + position.top;
        const bottom = top + position.height;
        const viewportBottom = documentViewport.top + documentViewport.height;
        if (top - block * scale < viewportBottom && bottom + block * scale > documentViewport.top) {
          for (const item of group) candidates.add(item);
        }
        // Tab visits the visible actions. Hold on to a focused action until focus moves,
        // even if the user scrolls it out of view.
        if (position.key === focusedBlock || top < viewportBottom && bottom > documentViewport.top) {
          const item = group.find(item => item.id === selectedId) ?? group[0];
          actions.push({ key: position.key, item, style: {
            left: paperBox.left - actionsBox.left + position.left,
            top: paperBox.top - actionsBox.top + position.top,
            maxWidth: position.width,
          } });
        }
      }
      for (const id of active) {
        const item = id === undefined ? undefined : index.byId.get(id);
        if (item) candidates.add(item);
      }
      const rightPaths = new Set<string>();
      for (const item of candidates) {
        const key = JSON.stringify(item.path);
        const position = blockIndex.get(key);
        if (!position) continue;
        const to = { ...position, left: origin.left + position.left, top: origin.top + position.top };
        const toOutline = expand(to, inline * scale, block * scale);
        const emphasis = item.id === selectedId ? "selected" : active.has(item.id) ? "hover" : "quiet";
        if (emphasis !== "quiet" && intersects(toOutline, documentViewport) && !rightPaths.has(key)) {
          rightPaths.add(key);
          right.push(to);
        }
        item.boxes.forEach((rect, boxIndex) => {
          const from = { ...rect, left: sourceOrigin.left + rect.left, top: sourceOrigin.top + rect.top };
          const fromOutline = expand(from, inline * sourceScale, block * sourceScale);
          const band = gutter.width ? linkedBand(item, boxIndex, fromOutline, toOutline,
            sourceViewport, documentViewport, gutter, emphasis, key === selectedPath) : undefined;
          if (band) bands.push(band);
          if (band?.fused) {
            fusedSources.push(fromOutline);
            fusedTarget = toOutline;
          } else if (emphasis !== "quiet" && intersects(fromOutline, sourceViewport)) {
            left.push({ ...from, key: JSON.stringify([item.id, boxIndex]) });
          }
        });
      }
      let fused: Drawing["fused"];
      if (fusedTarget) {
        const style = getComputedStyle(tokens);
        const radius = parseFloat(style.borderTopLeftRadius), stroke = parseFloat(style.outlineWidth);
        fused = fusedLinkPaths(fusedSources, fusedTarget, sourceViewport, documentViewport, gutter,
          { radius: radius * sourceScale, stroke: stroke * sourceScale },
          { radius: radius * scale, stroke: stroke * scale });
      }
      setDrawing({ bands: [...bands.filter(band => band.emphasis === "quiet"), ...bands.filter(band => band.emphasis !== "quiet")],
        fused, left, right: fused ? right.filter(outline => outline.key !== selectedPath) : right,
        actions, sourceViewport, documentViewport, gutter, paintPath });
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const move = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      queue();
    };
    const leave = () => { pointer.current = null; queue(); };
    const observer = new ResizeObserver(queue);
    for (const element of [root, leftPane, rightPane, paper, tokens]) observer.observe(element);
    root.addEventListener("scroll", queue, true);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerleave", leave);
    root.addEventListener("focusin", queue);
    root.addEventListener("focusout", queue);
    draw();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener("scroll", queue, true);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", leave);
      root.removeEventListener("focusin", queue);
      root.removeEventListener("focusout", queue);
    };
  }, [host, source, geometry, index, blockIndex, sourceScale, selectedId, selectedPath]);
  return <>
    <span className="linked-document-outline-measure" ref={probe} aria-hidden="true" />
    {drawing && geometry && <>
      <svg className="linked-document-bands" aria-hidden="true">
        <defs>
          <clipPath id={hitClip}><rect x={drawing.gutter.left} y={drawing.gutter.top} width={drawing.gutter.width} height={drawing.gutter.height} /></clipPath>
          <clipPath id={paintClip}>
            <path d={drawing.paintPath} clipRule="evenodd" />
          </clipPath>
          {drawing.fused && <>
            <clipPath id={fusedClip}>
              <rect x={drawing.sourceViewport.left} y={drawing.sourceViewport.top}
                width={drawing.sourceViewport.width} height={drawing.sourceViewport.height} />
              <rect x={drawing.sourceViewport.left + drawing.sourceViewport.width} y={0}
                width={drawing.documentViewport.left - drawing.sourceViewport.left - drawing.sourceViewport.width}
                height={drawing.gutter.height} />
              <rect x={drawing.documentViewport.left} y={drawing.documentViewport.top}
                width={drawing.documentViewport.width} height={drawing.documentViewport.height} />
            </clipPath>
            <mask id={fusedBorder} x={0} y={0} width="100%" height="100%" maskUnits="userSpaceOnUse">
              <rect width="100%" height="100%" fill="white" />
              <path d={drawing.fused.inner} fill="black" />
            </mask>
          </>}
        </defs>
        <g clipPath={`url(#${paintClip})`}>
          {drawing.bands.map(band => <path key={band.key} data-testid="linked-document-band" data-emphasis={band.emphasis}
            visibility={band.fused ? "hidden" : undefined}
            data-direction={band.direction} data-id={band.id} d={band.path} style={{ "--band-item-color": band.color } as CSSProperties} />)}
          {drawing.fused && <g clipPath={`url(#${fusedClip})`}>
            <path className="linked-document-fused-fill" d={drawing.fused.outer} />
            <path className="linked-document-fused-border" d={drawing.fused.outer} mask={`url(#${fusedBorder})`} />
          </g>}
        </g>
        <g clipPath={`url(#${hitClip})`}>
          {drawing.bands.map(band => <path key={band.key} className="linked-document-band-hit" data-linked-band={band.id}
            d={band.path} onClick={() => onSelect(band.id)} />)}
        </g>
      </svg>
      <Outlines outlines={drawing.left} viewport={drawing.sourceViewport} scale={sourceScale} side="source" />
      <Outlines outlines={drawing.right} viewport={drawing.documentViewport} scale={geometry.scale} side="document" />
      {createPortal(drawing.actions.map(({ key, item, style }) => <Button key={key} variant="outline" size="sm" className="linked-document-action"
        style={style} data-linked-item={item.id} data-linked-action={key}
        aria-pressed={item.id === selectedId} onClick={() => onSelect(item.id)}><span>{item.label}</span></Button>), geometry.actionHost)}
    </>}
  </>;
}

function Outlines({ outlines, viewport, scale, side }: { outlines: Outline[]; viewport: Rect; scale: number; side: string }) {
  return <div className="linked-document-outline-clip" style={viewport} aria-hidden="true">
    {outlines.map(({ key, left, top, width, height }) => <div className="linked-document-outline" data-side={side}
      key={key}
      style={{ zoom: scale, left: (left - viewport.left) / scale, top: (top - viewport.top) / scale, width: width / scale, height: height / scale }} />)}
  </div>;
}
