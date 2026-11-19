import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.ts";
import { memo, useCallback, useLayoutEffect, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import type { Editor, EditorEvents } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { blockDropTarget, reorderBlock } from "./block-reorder.ts";
import { endnoteLabel } from "./endnotes.ts";
import { Button } from "@/components/ui/button.tsx";
import { GripVertical, Plus } from "lucide-react";
import { saveErrorBadge, type SaveErrorLocation } from "./save-error.ts";

// Flow blocks have no boundary of their own; framed NodeViews and ruled quotes do.
const editingFlowBlocks = new Set(["paragraph", "heading", "bulletlist", "orderedlist"]);

type BlockHandlesProps = {
  readOnly?: boolean;
  showHeadingLevels?: boolean;
  editor: Editor;
  saveLocations: readonly SaveErrorLocation[];
  /** Block whose menu is open; its controls stay visible. */
  menuIndex?: number;
  onInsert(index: number, top: number): void;
  onOpenMenu(index: number, top: number): void;
  /** Why the block cannot be moved now: moving recreates its view, which would drop an open draft. */
  moveBlockedHint?(index: number): string | undefined;
};

/** An endnote follows its first reference: it is not dragged, and nothing is inserted after it. */
const ENDNOTE_HINT = "Endnotes follow the order of their first reference. Click for block actions.";

type HandleControlsProps = {
  index: number;
  name: string;
  endnote: boolean;
  blocked?: string;
  onInsert(index: number): void;
  onOpenMenu(index: number): void;
  onDragStart(event: ReactDragEvent, index: number): void;
};

const HandleControls = memo(function HandleControls({ index, name, endnote, blocked,
  onInsert, onOpenMenu, onDragStart }: HandleControlsProps) {
  useTranslation();
  const kind = i18n.t(name, { defaultValue: name });
  return <>
    {endnote ? <span className="block-insert-space" aria-hidden="true" /> : <Button variant="ghost" size="icon" className="block-insert"
      aria-label={i18n.t("Insert block after {{kind}} block {{number}}", { kind, number: index + 1 })}
      title={i18n.t("Insert block below")} aria-haspopup="menu"
      onMouseDown={event => event.stopPropagation()} onClick={() => onInsert(index)}><Plus aria-hidden="true" /></Button>}
    <Button variant="ghost" size="icon" draggable={!blocked} className="block-handle" data-endnote={endnote}
      aria-label={endnote ? i18n.t("Actions for endnote block {{number}}", { number: index + 1 }) : i18n.t("Move {{kind}} block {{number}}", { kind, number: index + 1 })}
      title={blocked ?? i18n.t("Drag to move, click for block actions")} aria-haspopup="menu"
      onMouseDown={event => event.stopPropagation()} onClick={() => onOpenMenu(index)}
      onDragStart={event => {
        if (blocked) { event.preventDefault(); return; }
        onDragStart(event, index);
      }}><GripVertical aria-hidden="true" /></Button>
  </>;
});

export const BlockHandles = memo(function BlockHandles({ readOnly = false, showHeadingLevels = false, editor, saveLocations, menuIndex, onInsert, onOpenMenu, moveBlockedHint }: BlockHandlesProps) {
  useTranslation();
  const gutter = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; doc: ProseMirrorNode } | null>(null);
  const [blocks, setBlocks] = useState<{ top: number; height: number; name: string; endnote: boolean; sourcePath: string;
    heading?: { level: number; center: number };
    cell?: { top: number; left: number; width: number; height: number } }[]>([]);
  // Event handlers read the latest measured geometry, not the controls' last render.
  const geometry = useRef(blocks);
  geometry.current = blocks;
  const [active, setActive] = useState(-1);
  const [cursorBlock, setCursorBlock] = useState(-1);
  const [cursorFocused, setCursorFocused] = useState(false);
  const [hovered, setHovered] = useState(-1);
  const [dropTop, setDropTop] = useState<number | null>(null);
  const [moving, setMoving] = useState<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const host = gutter.current!.parentElement!;
    const rectangles = () => {
      const result: DOMRect[] = [];
      editor.state.doc.forEach((_node, pos) => {
        const element = editor.view.nodeDOM(pos);
        if (element instanceof HTMLElement) result.push(element.getBoundingClientRect());
      });
      return result;
    };
    let pointer: { x: number; y: number } | null = null;
    // Preserve the last coordinates through mouseleave/scroll hit-test changes.
    let lastPointer: { x: number; y: number } | null = null;
    let typing = false;
    let handlingKey = false;
    let scrollFrame: number | null = null;
    // Host-relative block geometry of the last measurement; scrolling does not change it.
    let measured: { top: number; height: number }[] = [];
    let latest = geometry.current;
    let selectionBlocks = [-1, -1];
    // The block row includes its gutter controls; selection never supplies a hover extent.
    const updateHovered = (rects?: DOMRect[]) => {
      const point = pointer;
      if (!point || typing || drag.current) {
        setHovered(-1);
        return;
      }
      const bounds = host.getBoundingClientRect();
      if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) {
        setHovered(-1);
        return;
      }
      setHovered((rects ?? rectangles()).findIndex(rect => point.y >= rect.top && point.y <= rect.bottom));
    };
    const leave = () => { pointer = null; setHovered(-1); };
    // Keep gutter controls independent; only real pointer movement restores the neutral outline.
    const input = () => { typing = true; setHovered(-1); };
    // Bracket ProseMirror's keydown listener on this same element, including stopped bubbling.
    const keydown = () => { handlingKey = true; };
    const keydownEnd = () => { handlingKey = false; };
    const scroll = () => {
      if (!pointer || drag.current || scrollFrame !== null) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = null;
        updateHovered();
      });
    };
    // A dragged body block lands in the body: the endnotes after it keep their own order.
    const bodyRectangles = () => {
      let end = editor.state.doc.childCount;
      while (end > 0 && endnoteLabel(editor.state.doc.child(end - 1)) !== undefined) end--;
      return rectangles().slice(0, end);
    };
    const dropTarget = (y: number, from: number) => blockDropTarget(bodyRectangles(), y, from);
    // `top` and `height` are host-relative client pixels, so a reused measurement yields the same block.
    const blockAt = (node: ProseMirrorNode, pos: number, index: number, top: number, height: number,
      hostRect: DOMRect, scale: number) => {
      const endnote = endnoteLabel(node) !== undefined;
      const headingElement = node.type.name === "heading" ? editor.view.nodeDOM(pos) : null;
      const heading = headingElement instanceof HTMLElement
        ? { level: Number(node.attrs.level), center: top / scale + parseFloat(getComputedStyle(headingElement).lineHeight) / 2 }
        : undefined;
      const location = saveLocations.find(location => location.index === index);
      const element = location?.cell ? editor.view.nodeDOM(pos) : null;
      const cellRect = element instanceof HTMLElement && location?.cell
        ? element.querySelectorAll("tr")[location.cell.row]?.children[location.cell.column]?.getBoundingClientRect() : undefined;
      // Clip to the scroll viewport so a horizontally hidden cell cannot paint over the gutter.
      const scrollRect = element instanceof HTMLElement ? element.querySelector(".table-scroll")?.getBoundingClientRect() : undefined;
      const left = cellRect ? Math.max(cellRect.left, scrollRect?.left ?? cellRect.left) : 0;
      const right = cellRect ? Math.min(cellRect.right, scrollRect?.right ?? cellRect.right) : 0;
      const cell = cellRect && right > left ? { top: (cellRect.top - hostRect.top) / scale, left: (left - hostRect.left) / scale,
        width: (right - left) / scale, height: cellRect.height / scale } : undefined;
      return {top: top / scale, height: height / scale, endnote, heading,
        cell,
        sourcePath: String(node.attrs.sourcePath ?? ""),
        name: endnote ? "endnote" : node.type.name.replace(/Block$/, "").toLowerCase()};
    };
    const publish = (next: typeof latest, hostRect: DOMRect) => {
      latest = next;
      setBlocks(previous => previous.length === next.length && previous.every((block, index) => {
        const current = next[index];
        return block.top === current.top && block.height === current.height && block.name === current.name &&
          block.endnote === current.endnote && block.sourcePath === current.sourcePath &&
          block.heading?.level === current.heading?.level && block.heading?.center === current.heading?.center &&
          JSON.stringify(block.cell) === JSON.stringify(current.cell);
      }) ? previous : next);
      updateHovered(pointer && !typing && !drag.current
        ? measured.map(block => new DOMRect(0, hostRect.top + block.top, 0, block.height)) : undefined);
    };
    const update = () => {
      const rects = rectangles();
      const hostRect = host.getBoundingClientRect();
      const scale = Number(getComputedStyle(host).zoom) || 1;
      measured = rects.map(rect => ({ top: rect.top - hostRect.top, height: rect.height }));
      let blockPos = 0;
      publish(measured.map(({ top, height }, index) => {
        const node = editor.state.doc.child(index);
        const pos = blockPos;
        blockPos += node.nodeSize;
        return blockAt(node, pos, index, top, height, hostRect, scale);
      }), hostRect);
    };
    // Most transactions move no block: a typed character stays on its line. Measure the changed blocks,
    // the selection's blocks before and after, the block after each and the last block. When none moved,
    // every other block is where it was, so only the measured blocks are rebuilt.
    const updateChanged = (transaction: Transaction) => {
      const doc = editor.state.doc;
      const before = transaction.before;
      if (saveLocations.length || doc.childCount !== measured.length || before.childCount !== doc.childCount) return false;
      const selection = editor.state.selection;
      const changed = new Set([...selectionBlocks, selection.$from.index(0), selection.$to.index(0)]);
      // `before` precedes appended transactions too; unchanged blocks keep their node identity.
      if (doc !== before) {
        for (let index = 0; index < doc.childCount; index++) {
          if (doc.child(index) === before.child(index)) continue;
          changed.add(index);
          if (changed.size > 32) return false;
        }
      }
      const checked = new Set([doc.childCount - 1]);
      for (const index of changed) {
        if (index < 0 || index >= doc.childCount) continue;
        checked.add(index);
        if (index + 1 < doc.childCount) checked.add(index + 1);
      }
      const hostRect = host.getBoundingClientRect();
      const scale = Number(getComputedStyle(host).zoom) || 1;
      const next = latest.slice();
      let moved = false;
      doc.forEach((node, pos, index) => {
        if (moved || !checked.has(index)) return;
        const element = editor.view.nodeDOM(pos);
        const rect = element instanceof HTMLElement ? element.getBoundingClientRect() : undefined;
        const block = measured[index];
        if (!rect || Math.abs(rect.top - hostRect.top - block.top) > 0.01 || Math.abs(rect.height - block.height) > 0.01) {
          moved = true;
          return;
        }
        next[index] = blockAt(node, pos, index, block.top, block.height, hostRect, scale);
      });
      if (moved) return false;
      publish(next, hostRect);
      return true;
    };
    const transaction = (event?: EditorEvents["transaction"]) => {
      if (handlingKey && event?.transaction.docChanged) input();
      if (!event || !updateChanged(event.transaction)) update();
      const selection = editor.state.selection;
      selectionBlocks = [selection.$from.index(0), selection.$to.index(0)];
      setActive(selection.$from.index(0));
      setCursorBlock(selection.$from.index(0));
    };
    const hover = (event: MouseEvent) => {
      if (!event.isTrusted || (lastPointer?.x === event.clientX && lastPointer.y === event.clientY)) return;
      lastPointer = { x: event.clientX, y: event.clientY };
      typing = false;
      if (!host.contains(event.target as Node)) { leave(); return; }
      pointer = lastPointer;
      const rects = rectangles();
      updateHovered(rects);
      setActive(event.target instanceof Element && event.target.closest(".heading-level") ? -1
        : rects.findIndex(rect => event.clientY >= rect.top - 8 && event.clientY <= rect.bottom + 8));
    };
    const over = (event: DragEvent) => {
      if (!drag.current) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      // No line where the block would stay in place, or above the title.
      const target = dropTarget(event.clientY, drag.current.index);
      setDropTop(target ? target.line - host.getBoundingClientRect().top : null);
    };
    const end = () => { drag.current = null; setDropTop(null); setMoving(null); leave(); };
    let dropped = false;
    const drop = (event: DragEvent) => {
      const source = drag.current;
      if (!source) return;
      event.preventDefault();
      event.stopPropagation();
      end();
      if (!source.doc.eq(editor.state.doc)) return;
      const target = dropTarget(event.clientY, source.index);
      if (target) editor.view.dispatch(reorderBlock(editor.state, source.index, target.to));
      dropped = true;
    };
    // Focusing the editor during the drop keeps Chromium from starting the next drag; wait for its end.
    const finish = () => {
      end();
      if (dropped) editor.view.focus();
      dropped = false;
    };
    // Native focus includes nested editable content without treating another panel as document focus.
    const focusIn = () => setCursorFocused(true);
    const focusOut = (event: FocusEvent) => setCursorFocused(editor.view.dom.contains(event.relatedTarget as Node | null));
    const windowBlur = () => setCursorFocused(false);
    const windowFocus = () => setCursorFocused(editor.view.dom.contains(document.activeElement));
    windowFocus();
    editor.view.dom.addEventListener("focusin", focusIn);
    editor.view.dom.addEventListener("focusout", focusOut);
    window.addEventListener("blur", windowBlur);
    window.addEventListener("focus", windowFocus);
    editor.on("transaction", transaction);
    // Layout changes must not replace the hovered block with the selected one.
    const resize = new ResizeObserver(update);
    resize.observe(host);
    // A minimum-height paper can stay fixed while fonts, images or NodeViews resize the content.
    resize.observe(editor.view.dom);
    // A reread can replace React NodeViews with the same final outer height.
    // Measure after their DOM commits, even when ResizeObserver sees no net resize.
    let layoutFrame = 0;
    const mutations = new MutationObserver(() => {
      cancelAnimationFrame(layoutFrame);
      layoutFrame = requestAnimationFrame(update);
    });
    mutations.observe(editor.view.dom, { childList: true, subtree: true });
    // Settings can move the content without resizing either the paper or editor.
    const settings = host.querySelector(".document-settings");
    if (settings) resize.observe(settings);
    window.addEventListener("mousemove", hover);
    editor.view.dom.addEventListener("beforeinput", input, true);
    editor.view.dom.addEventListener("keydown", keydown, true);
    editor.view.dom.addEventListener("keydown", keydownEnd);
    editor.view.dom.addEventListener("compositionstart", input, true);
    host.addEventListener("mouseleave", leave);
    window.addEventListener("blur", leave);
    window.addEventListener("scroll", scroll, true);
    if (saveLocations.length) host.addEventListener("scroll", update, true);
    // Capture before ProseMirror's native content drag/drop handler.
    host.addEventListener("dragover", over, true);
    host.addEventListener("drop", drop, true);
    host.addEventListener("dragend", finish);
    transaction();
    return () => {
      editor.off("transaction", transaction);
      editor.view.dom.removeEventListener("focusin", focusIn);
      editor.view.dom.removeEventListener("focusout", focusOut);
      window.removeEventListener("blur", windowBlur);
      window.removeEventListener("focus", windowFocus);
      resize.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(layoutFrame);
      window.removeEventListener("mousemove", hover);
      editor.view.dom.removeEventListener("beforeinput", input, true);
      editor.view.dom.removeEventListener("keydown", keydown, true);
      editor.view.dom.removeEventListener("keydown", keydownEnd);
      editor.view.dom.removeEventListener("compositionstart", input, true);
      host.removeEventListener("mouseleave", leave);
      window.removeEventListener("blur", leave);
      window.removeEventListener("scroll", scroll, true);
      host.removeEventListener("scroll", update, true);
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
      host.removeEventListener("dragover", over, true);
      host.removeEventListener("drop", drop, true);
      host.removeEventListener("dragend", finish);
    };
  }, [editor, saveLocations]);
  const insert = useCallback((index: number) => {
    const block = geometry.current[index];
    if (block) onInsert(index, block.top);
  }, [onInsert]);
  const openMenu = useCallback((index: number) => {
    const block = geometry.current[index];
    if (block) onOpenMenu(index, block.top);
  }, [onOpenMenu]);
  const startDrag = useCallback((event: ReactDragEvent, index: number) => {
    const block = geometry.current[index];
    if (!block) { event.preventDefault(); return; }
    drag.current = {index, doc: editor.state.doc};
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", i18n.t("Move block"));
    setMoving({top: block.top, height: block.height});
  }, [editor]);
  const cursor = !readOnly && cursorFocused && !moving ? blocks[cursorBlock] : undefined;
  return <div className="block-gutter" ref={gutter}>
    {cursor && editingFlowBlocks.has(cursor.name) && <div className="editing-block-bar" data-testid="editing-block-bar"
      data-block-index={cursorBlock} aria-hidden="true" style={{ top: cursor.top, height: cursor.height }} />}
    {(!readOnly || showHeadingLevels) && blocks.map((block, index) => {
      const blocked = block.endnote ? i18n.t(ENDNOTE_HINT)
        : moveBlockedHint?.(index);
      return <div key={index} className="block-gutter-row">
        {showHeadingLevels && block.heading ? <span className="heading-level" aria-hidden="true"
          title={i18n.t("Heading {{level}}", { level: block.heading.level })}
          style={{ top: block.heading.center }}>H{block.heading.level}</span> : null}
        {!readOnly ? <div className={`block-controls${active === index || menuIndex === index ? " visible" : ""}`}
          data-menu-open={menuIndex === index} style={{top: block.top}}>
          <HandleControls index={index} name={block.name} endnote={block.endnote}
            blocked={blocked} onInsert={insert} onOpenMenu={openMenu} onDragStart={startDrag} />
        </div> : null}
      </div>;
    })}
    {!moving && blocks[hovered] && <div className="block-hover-outline" data-testid="block-hover-outline" aria-hidden="true"
      data-heading-level={showHeadingLevels ? blocks[hovered].heading?.level : undefined}
      style={{top: `calc(${blocks[hovered].top}px - var(--space-block-hover-block))`,
        height: `calc(${blocks[hovered].height}px + 2 * var(--space-block-hover-block))`}} />}
    {saveLocations.map((location, index) => {
      const block = blocks[location.index];
      if (!block) return null;
      return <div key={index}>
        <div className="block-save-error" data-testid="block-save-error" data-block-index={location.index}
          style={{top: `calc(${block.top}px - var(--space-block-hover-block))`,
            height: `calc(${block.height}px + 2 * var(--space-block-hover-block))`}}>
          <span className="block-save-error-badge">{saveErrorBadge(location.code, location.type)}</span>
        </div>
        {block.cell ? <div className="cell-save-error" data-testid="cell-save-error" aria-label={i18n.t("Cannot save")}
          style={block.cell} /> : null}
      </div>;
    })}
    {moving && <div className="block-drag-source" data-testid="block-drag-source" style={moving} />}
    {dropTop !== null && <div className="block-drop-line" data-testid="block-drop-line" style={{top: dropTop}} />}
  </div>;
});
