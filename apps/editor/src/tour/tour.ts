import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

// Guided tours are Editor-only teaching overlays. A tour never edits a document and has no Core,
// CLI or Host counterpart: steps only observe the live engine document and the screen.

/** Closed set of screen places a tour may point at; resolvers live in `anchors.ts`. */
export type TourAnchorId = "document-title" | "document-body" | "document-first-line" | "block-insert" | "outline-panel";

/** Facts about the practice document that steps wait for. Derived from the live engine state. */
export type TourProbe = {
  title: string;
  titleFocused: boolean;
  /** Top-level headings that contain text. */
  headings: number;
  tables: number;
  references: number;
};

export const EMPTY_PROBE: TourProbe = { title: "", titleFocused: false, headings: 0, tables: 0, references: 0 };

/** Reads the progress facts from an engine document; `titleFocused` is a screen fact the caller adds. */
export function probeDocument(doc: ProseMirrorNode, titleFocused = false): TourProbe {
  let headings = 0, tables = 0, references = 0;
  doc.forEach(node => {
    if (node.type.name === "heading" && node.textContent.trim()) headings += 1;
    if (node.type.name === "table") tables += 1;
  });
  doc.descendants(node => {
    if (node.type.name === "crossReference") references += 1;
    return true;
  });
  return { title: String(doc.attrs.title ?? ""), titleFocused, headings, tables, references };
}

export type TourStep = {
  id: string;
  /** The highlighted place: border and number badge. */
  target: TourAnchorId;
  /** The only interactive area while this step shows. Defaults to the target. */
  region?: TourAnchorId;
  /** Open the outline before measuring. */
  prepare?: "outline";
  /** Move keyboard focus to the target when the step starts. */
  focusTarget?: boolean;
  /** Whether the step's goal is reached. Steps without a goal are always ready. */
  ready?(probe: TourProbe): boolean;
  /** Move on as soon as the goal is reached; otherwise the user presses Next. */
  auto?: boolean;
  title(): string;
  body(): string;
  /** Short note below the body, e.g. why a shortcut is unavailable. */
  hint?(): string;
};

export type TourState = { index: number; active: boolean };

export type TourEvent = { type: "probe"; probe: TourProbe } | { type: "next"; probe: TourProbe } | { type: "exit" };

export const startTour = (): TourState => ({ index: 0, active: true });

export function stepReady(step: TourStep, probe: TourProbe): boolean {
  return step.ready ? step.ready(probe) : true;
}

/** Pure transition: probes auto-advance ready steps, Next needs the goal, the last Next finishes. */
export function reduceTour(state: TourState, steps: readonly TourStep[], event: TourEvent): TourState {
  if (!state.active) return state;
  if (event.type === "exit") return { ...state, active: false };
  const step = steps[state.index];
  if (!step || !stepReady(step, event.probe)) return state;
  if (event.type === "probe" && !step.auto) return state;
  return state.index + 1 >= steps.length ? { ...state, active: false } : { index: state.index + 1, active: true };
}

export type Box = { top: number; left: number; width: number; height: number };

/**
 * Places the explanation card beside the interactive region: below, above, right, then left, and
 * inside the region's lower edge when none fits. Always clamped into the viewport.
 */
export function placeCard(region: Box, card: { width: number; height: number }, viewport: { width: number; height: number }, gap: number): { top: number; left: number } {
  const clamp = (value: number, size: number, limit: number) => Math.max(gap, Math.min(value, limit - size - gap));
  const centered = { left: clamp(region.left + region.width / 2 - card.width / 2, card.width, viewport.width), top: clamp(region.top + region.height / 2 - card.height / 2, card.height, viewport.height) };
  const below = region.top + region.height + gap, above = region.top - gap - card.height;
  const right = region.left + region.width + gap, left = region.left - gap - card.width;
  if (below + card.height + gap <= viewport.height) return { top: below, left: centered.left };
  if (above >= gap) return { top: above, left: centered.left };
  if (right + card.width + gap <= viewport.width) return { top: centered.top, left: right };
  if (left >= gap) return { top: centered.top, left };
  return { top: clamp(region.top + region.height - card.height - gap, card.height, viewport.height), left: clamp(region.left + region.width - card.width - gap, card.width, viewport.width) };
}
