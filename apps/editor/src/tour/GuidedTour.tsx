import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { Button } from "@/components/ui/button.tsx";
import type { DocumentEditorHandle } from "../DocumentEditor.tsx";
import { resolveAnchor } from "./anchors.ts";
import { EMPTY_PROBE, placeCard, type Box, type TourEvent, type TourProbe, type TourState, type TourStep } from "./tour.ts";
import "./tour.css";

type Props = {
  steps: readonly TourStep[];
  state: TourState;
  /** The practice document's editor; resolved again whenever it changes. */
  getEditor(): DocumentEditorHandle | null;
  onEvent(event: TourEvent): void;
  /** The screen change a step asks for before it is measured. */
  onPrepare(kind: NonNullable<TourStep["prepare"]>): void;
};

const boxOf = (element: Element | null): Box | null => {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null;
};
const sameBox = (a: Box | null, b: Box | null) => a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);
const sameProbe = (a: TourProbe, b: TourProbe) => a.title === b.title && a.titleFocused === b.titleFocused && a.headings === b.headings && a.tables === b.tables && a.references === b.references;
// Pointer input outside the interactive region is refused; wheel scrolling still moves the page.
const POINTER_EVENTS = ["pointerdown", "mousedown", "mouseup", "click", "dblclick", "auxclick", "contextmenu", "dragstart", "touchstart"] as const;

/**
 * Spotlight layer: dims the screen outside the step's interactive region, outlines and numbers the
 * target, and refuses pointer and keyboard input aimed anywhere else. Menus portalled to
 * `.ui-portal` stay usable so the `/` menu and block menus work. Escape always leaves.
 */
export function GuidedTour({ steps, state, getEditor, onEvent, onPrepare }: Props) {
  useTranslation();
  const step = steps[state.index]!;
  const card = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<Box | null>(null);
  const [region, setRegion] = useState<Box | null>(null);
  const [cardBox, setCardBox] = useState<{ top: number; left: number } | null>(null);
  const [probe, setProbe] = useState<TourProbe>(EMPTY_PROBE);
  const latest = useRef({ step, onEvent, getEditor, probe });
  latest.current = { step, onEvent, getEditor, probe };

  const refresh = () => {
    const editor = latest.current.getEditor();
    if (!editor) return;
    const next = editor.tourProbe();
    if (sameProbe(latest.current.probe, next)) return;
    latest.current.probe = next;
    setProbe(next);
    latest.current.onEvent({ type: "probe", probe: next });
  };

  // One measuring loop: geometry follows resize, scroll, panel changes and typing alike; it also
  // follows the editor handle, which is replaced when the practice tab remounts.
  useEffect(() => {
    let frame = 0, subscribed: DocumentEditorHandle | null = null, unsubscribe = () => {};
    const tick = () => {
      const editor = latest.current.getEditor();
      if (editor !== subscribed) { unsubscribe(); subscribed = editor; unsubscribe = editor ? editor.onTourChange(refresh) : () => {}; refresh(); }
      const current = latest.current.step;
      const nextTarget = boxOf(resolveAnchor(current.target)), nextRegion = boxOf(resolveAnchor(current.region ?? current.target));
      setTarget(previous => sameBox(previous, nextTarget) ? previous : nextTarget);
      setRegion(previous => sameBox(previous, nextRegion) ? previous : nextRegion);
      frame = requestAnimationFrame(tick);
    };
    tick();
    globalThis.document.addEventListener("focusin", refresh);
    globalThis.document.addEventListener("focusout", refresh);
    return () => { cancelAnimationFrame(frame); unsubscribe(); globalThis.document.removeEventListener("focusin", refresh); globalThis.document.removeEventListener("focusout", refresh); };
  }, []);

  // A step may need a screen state (the outline) and may hand focus to its target.
  useEffect(() => {
    if (step.prepare) onPrepare(step.prepare);
    if (!step.focusTarget) return;
    let tries = 0;
    const focus = () => {
      const element = resolveAnchor(step.target);
      if (element) (element.closest<HTMLElement>(".ProseMirror") ?? element).focus();
      else if (tries++ < 20) setTimeout(focus, 50);
    };
    focus();
  }, [state.index]);

  useLayoutEffect(() => {
    const element = card.current;
    if (!element || !region) { setCardBox(null); return; }
    const size = { width: element.offsetWidth, height: element.offsetHeight };
    const gap = parseFloat(getComputedStyle(globalThis.document.documentElement).fontSize) || 16;
    const next = placeCard(region, size, { width: window.innerWidth, height: window.innerHeight }, gap);
    setCardBox(previous => previous && previous.top === next.top && previous.left === next.left ? previous : next);
  });

  // Input guard. Allowed: the card, the live region, and portalled menus.
  useEffect(() => {
    const allowed = (node: EventTarget | null) => {
      if (!(node instanceof Node)) return false;
      const element = node instanceof Element ? node : node.parentElement;
      const current = latest.current.step;
      return !!(card.current?.contains(node) || resolveAnchor(current.region ?? current.target)?.contains(node) || element?.closest(".ui-portal"));
    };
    const refuse = (event: Event) => { if (!allowed(event.target)) { event.preventDefault(); event.stopPropagation(); } };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); latest.current.onEvent({ type: "exit" }); return; }
      // Composition keys already belong to an allowed field; anything else aimed elsewhere is refused.
      if (!event.isComposing) refuse(event);
    };
    for (const type of POINTER_EVENTS) window.addEventListener(type, refuse, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("keypress", refuse, true);
    window.addEventListener("keyup", refuse, true);
    return () => {
      for (const type of POINTER_EVENTS) window.removeEventListener(type, refuse, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keypress", refuse, true);
      window.removeEventListener("keyup", refuse, true);
    };
  }, []);

  const last = state.index + 1 >= steps.length;
  const ready = step.ready ? step.ready(probe) : true;
  const hole = region ?? { top: 0, left: 0, width: 0, height: 0 };
  const clip = region ? `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${hole.left}px ${hole.top}px, ${hole.left}px ${hole.top + hole.height}px, ${hole.left + hole.width}px ${hole.top + hole.height}px, ${hole.left + hole.width}px ${hole.top}px, ${hole.left}px ${hole.top}px)` : undefined;
  return createPortal(
    <div className="tour-layer" data-testid="guided-tour" data-step={step.id} data-index={state.index}>
      <div className="tour-dim" style={{ clipPath: clip }} />
      {target ? <div className="tour-ring" data-testid="tour-ring" style={{ top: target.top, left: target.left, width: target.width, height: target.height }}>
        <span className="tour-badge" aria-hidden="true">{state.index + 1}</span>
      </div> : null}
      <div ref={card} className="tour-card" role="region" aria-label={i18n.t("Guided tour")} data-testid="tour-card"
        style={cardBox ? { top: cardBox.top, left: cardBox.left } : { right: "var(--space-4)", bottom: "var(--space-4)" }}>
        <p className="tour-progress">{i18n.t("Step {{step}} of {{count}}", { step: state.index + 1, count: steps.length })}</p>
        <h2 className="tour-title">{step.title()}</h2>
        <p className="tour-body" aria-live="polite">{step.body()}</p>
        {step.hint && !ready ? <p className="tour-hint">{step.hint()}</p> : null}
        <div className="tour-actions">
          <Button type="button" variant="ghost" size="sm" data-testid="tour-skip" onClick={() => onEvent({ type: "exit" })}>{i18n.t("Skip tour")}</Button>
          <Button type="button" size="sm" data-testid="tour-next" disabled={!ready} onClick={() => onEvent({ type: "next", probe })}>{i18n.t(last ? "Done" : "Next")}</Button>
        </div>
      </div>
    </div>, globalThis.document.body);
}
