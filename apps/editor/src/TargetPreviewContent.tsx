import type { Editor } from "@tiptap/core";
import type { ReferenceRole } from "@litzio/core";
import { useLayoutEffect, useRef } from "react";
import { referenceTargetBlock } from "./cross-reference.tsx";
import { fragmentTarget } from "./link-opening.ts";

/** A local reference chip that a target preview can open from. Citations and endnotes have their own previews. */
export const TARGET_REFERENCE_CHIP = ".cross-reference[data-label]:not(.citation, .footnote-reference) > .cross-reference-chip";

/** The top-level block a `#fragment` link or a reference chip resolves to, by the link's Core lookup
 * or the chip's own target calculation; undefined when it names nothing in this document. */
export function previewTargetBlock(editor: Editor, anchor: Element): number | undefined {
  const { doc } = editor.state;
  const href = anchor.matches("a[href]") ? anchor.getAttribute("href")! : undefined;
  if (href !== undefined) return fragmentTarget(doc, href);
  if (!anchor.matches(TARGET_REFERENCE_CHIP)) return undefined;
  const reference = anchor.parentElement!;
  return referenceTargetBlock(doc, reference.dataset.role as ReferenceRole, reference.dataset.label ?? "");
}

// A heading section never needs more blocks than fill the preview; this only bounds the work.
const SECTION_BLOCKS = 40;

/** Copy the block as the document already renders it (numbers, captions, math, images), without
 * editor instances, NodeView controls, focusable descendants, selection marks or document writes. */
export function TargetPreviewContent({ editor, index }: { editor: Editor; index: number }) {
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = body.current;
    if (!element) return;
    const { doc } = editor.state;
    let pos = 0;
    for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
    const section = doc.child(index).type.name === "heading";
    const blocks: Element[] = [];
    element.replaceChildren();
    for (let i = index; i < doc.childCount && blocks.length < SECTION_BLOCKS; pos += doc.child(i).nodeSize, i++) {
      const name = doc.child(i).type.name;
      if (i > index && (!section || name === "heading")) break;
      // A section shows its content, not the next heading's label or the trailing endnotes.
      if (i > index && (name === "labelTarget" || name === "footnoteDefinition")) continue;
      const rendered = editor.view.nodeDOM(pos);
      if (!(rendered instanceof Element)) continue;
      // React NodeViews render inside a wrapper; copy the block itself, so block rules apply as in the document.
      const source = rendered.matches(".react-renderer") && rendered.firstElementChild ? rendered.firstElementChild : rendered;
      const block = readOnlyCopy(source);
      // A table is never narrowed below its document layout: up to the document column, it takes its
      // content width, and the preview cuts what does not fit.
      if (name === "table" && block instanceof HTMLElement) block.style.maxWidth = `${source.getBoundingClientRect().width}px`;
      blocks.push(block);
      element.append(block);
      if (element.scrollHeight > element.clientHeight) break;
    }
    const clip = () => {
      const bottom = element.scrollHeight > element.clientHeight;
      const right = element.scrollWidth > element.clientWidth;
      if (bottom || right) element.dataset.clipped = bottom && right ? "both" : bottom ? "bottom" : "right";
      else delete element.dataset.clipped;
    };
    clip();
    // Copied images may finish decoding after this layout.
    element.addEventListener("load", clip, true);
    return () => element.removeEventListener("load", clip, true);
  }, [editor, index]);
  return <div className="document-editor reference-preview-document" ref={body} />;
}

function readOnlyCopy(source: Element): Element {
  const copy = source.cloneNode(true) as Element;
  // Editing affordances: hover metadata, object tools, draft status and any control.
  copy.querySelectorAll(".block-metadata, [data-object-tools], .table-row-layer, .draft-status, form, input, select, textarea, button")
    .forEach(element => element.remove());
  // Links read as in the endnote preview: formatted text, never a focusable destination.
  copy.querySelectorAll("a").forEach(anchor => {
    const span = document.createElement("span");
    span.className = "reference-preview-link";
    span.append(...anchor.childNodes);
    anchor.replaceWith(span);
  });
  for (const element of [copy, ...copy.querySelectorAll("*")]) {
    for (const name of ["contenteditable", "tabindex", "draggable", "data-testid", "data-selected", "data-current-cell", "data-table-menu-target", "data-empty-prompt"]) {
      element.removeAttribute(name);
    }
    if (["link", "button"].includes(element.getAttribute("role") ?? "")) element.removeAttribute("role");
    // Mermaid styles address their own SVG ids; other ids would repeat the document's.
    if (!(element instanceof SVGElement)) element.removeAttribute("id");
    element.classList.remove("ProseMirror-selectednode");
  }
  return copy;
}
