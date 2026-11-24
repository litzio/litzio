import { fragmentTargetLookup } from "@litzio/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { canEditEndnoteAt } from "./endnotes.ts";
import { referenceContext } from "./reference-context.ts";
import type { UiMessage } from "./ui-message.ts";

const fragmentTargets = new WeakMap<ProseMirrorNode, ReturnType<typeof fragmentTargetLookup>>();

export function fragmentTarget(doc: ProseMirrorNode, href: string): number | undefined {
  if (!href.startsWith("#")) return undefined;
  let lookup = fragmentTargets.get(doc);
  if (!lookup) {
    lookup = fragmentTargetLookup(referenceContext(doc));
    fragmentTargets.set(doc, lookup);
  }
  return lookup(href);
}

export function unresolvedLink(href: string): UiMessage {
  return { key: "Unresolved reference: no target labeled “{{label}}” in this document", values: { label: href.slice(1) } };
}

/** Opening is narrower than authoring: relative links and other schemes stay in the document. */
export function externalLinkUrl(href: string): string | undefined {
  const value = href.trim();
  if (!/^https?:\/\//i.test(value) || /\s/.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch { /* Incomplete URL drafts cannot be opened. */ }
  return undefined;
}

export function openExternalLink(href: string): void {
  const url = externalLinkUrl(href);
  if (url) window.open(url, "_blank", "noopener");
}

/** ProseMirror normally finishes composition on mousedown, before handleClick runs. */
export function handleLinkMouseDown(view: EditorView, event: MouseEvent): boolean {
  if (!view.composing || !(event.ctrlKey || event.metaKey) ||
      !(event.target instanceof Element) || !event.target.closest("a[href]")) return false;
  event.preventDefault();
  return true;
}

/** ProseMirror calls handleClick only after a single click, excluding selection drags. */
export function handleLinkClick(view: EditorView, pos: number, event: MouseEvent, followFragment: (href: string) => void): boolean {
  if (view.composing || event.button !== 0 || event.detail !== 1 ||
      (view.editable && !(event.ctrlKey || event.metaKey)) || event.altKey || event.shiftKey ||
      !canEditEndnoteAt(view.state, pos)) return false;
  const href = linkMarkHref(view, event);
  if (href === undefined || (!href.startsWith("#") && (!view.editable || !externalLinkUrl(href)))) return false;
  event.preventDefault();
  if (href.startsWith("#")) followFragment(href);
  else openExternalLink(href);
  return true;
}

/** Read view anchors have native click defaults. Fragment navigation belongs to the editor,
 * including keyboard activation (which has no ProseMirror mousedown/up pair). */
export function handleLinkActivation(view: EditorView, event: MouseEvent, followFragment: (href: string) => void): boolean {
  const href = linkMarkHref(view, event);
  if (!href?.startsWith("#")) return false;
  event.preventDefault();
  if (!view.editable && event.detail === 0) followFragment(href);
  return true;
}

function linkMarkHref(view: EditorView, event: MouseEvent): string | undefined {
  const target = event.target instanceof Element ? event.target : null;
  const anchor = target?.closest("a[href]");
  if (!anchor || !view.dom.contains(anchor)) return undefined;
  const boundary = target?.closest('[contenteditable="false"], [aria-readonly="true"]');
  if (boundary && boundary !== view.dom && view.dom.contains(boundary)) return undefined;
  // Only ordinary link marks, never anchors rendered by other NodeViews.
  const href = anchor.getAttribute("href")!;
  const mark = view.state.doc.nodeAt(view.posAtDOM(anchor, 0))?.marks.find(mark => mark.type.name === "link" && mark.attrs.href === href);
  return mark ? href : undefined;
}
