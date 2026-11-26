import type { UiMessage } from "./ui-message.ts";
import { assertPastedLabelsAvailable, footnoteDefinitionsMarkdown, inlineContentText, planFootnotePaste, writeIssueOf, type FootnoteDefinition } from "@litzio/core";
import { Extension, isMacOS } from "@tiptap/core";
import { splitBlockAs } from "@tiptap/pm/commands";
import { closeHistory } from "@tiptap/pm/history";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { DOMParser as PMDOMParser, DOMSerializer, Fragment, Slice, type Node as PMNode, type DOMOutputSpec, type Schema } from "@tiptap/pm/model";
import { isStructureLocked } from "./structure-lock.ts";
import { AllSelection, NodeSelection, Plugin, Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { ASSET_FORMATS } from "../shared/asset-policy.ts";
import { addTableRowBelow, changeHeadingLevel, TABLE_DELETE_META } from "./block-commands.ts";
import { leadingCheckbox, normalizeExternalHTML, type ExternalHTML } from "./external-html.ts";
import { markdownPaste } from "./markdown-paste.ts";
import { linkUrlsInNodes, type AutoLink } from "./pasted-url.ts";
import { freshBlockPath, TABLE_CELL_SOURCE_ATTR } from "./tiptap-document.ts";
import { REDO_SHORTCUT, UNDO_SHORTCUT } from "./shortcuts.ts";
import { canEditEndnoteAt } from "./endnotes.ts";
import { fromTiptapContent, toTiptapContent } from "./tiptap-inline.ts";
import { inTableCell, isComplexTable, tableCellOf, tableCellRange } from "./table-structure.ts";
import { TableMap } from "@tiptap/pm/tables";

const FOOTNOTES_ATTR = "data-litzio-footnotes";

function referenceLabels(fragment: Fragment): string[] {
  const labels = new Set<string>();
  fragment.descendants(node => { if (node.type.name === "footnoteReference") labels.add(String(node.attrs.label)); });
  return [...labels];
}

function definitionsOf(doc: PMNode): FootnoteDefinition[] {
  const definitions: FootnoteDefinition[] = [];
  doc.forEach(node => {
    if (node.type.name === "footnoteDefinition") definitions.push({ label: String(node.attrs.label),
      content: fromTiptapContent({ type: "doc", content: [{ type: "paragraph", content: node.toJSON().content }] }) });
  });
  return definitions;
}

/** Capture every selected reference's definition before a cut can delete anything. */
export function clipboardFootnotes(doc: PMNode, slice: Slice): FootnoteDefinition[] {
  const definitions = definitionsOf(doc);
  return referenceLabels(slice.content).map(label => {
    const definition = definitions.find(note => note.label === label);
    if (!definition) throw new Error("The selected endnote has no definition.");
    return definition;
  });
}

/** Apply Core's clipboard plan only to the incoming slice, then insert missing definitions
 * with fresh session locators in the same transaction as the paste. */
export function pasteFootnotes(state: EditorState, slice: Slice, incoming: FootnoteDefinition[], tr = closeHistory(state.tr)): Transaction {
  const references = referenceLabels(slice.content);
  if (!references.length) return tr.replaceSelection(slice);
  if (references.some(label => !incoming.some(note => note.label === label))) throw new Error("Clipboard endnote definition is missing.");
  const existing = definitionsOf(state.doc);
  const labels = [...referenceLabels(state.doc.content), ...existing.map(note => note.label)];
  const plan = planFootnotePaste(labels, existing, incoming.filter(note => references.includes(note.label)));
  const rename = new Map(plan.labels.map(item => [item.from, item.to]));
  const copy = (node: PMNode): PMNode => node.isText ? node : node.type.create(
    node.type.name === "footnoteReference" ? { ...node.attrs, label: rename.get(String(node.attrs.label)) ?? node.attrs.label } : node.attrs,
    Fragment.fromArray(node.content.content.map(copy)), node.marks);
  tr.replaceSelection(new Slice(Fragment.fromArray(slice.content.content.map(copy)), slice.openStart, slice.openEnd));
  for (const note of plan.definitions) {
    const content = state.schema.nodeFromJSON(toTiptapContent(note.content)).firstChild!.content;
    tr.insert(tr.doc.content.size, state.schema.nodes.footnoteDefinition.create({ label: note.label, sourcePath: freshBlockPath() }, content));
  }
  return tr;
}

const TYPES = new Set(["paragraph", "heading", "admonition", "quote", "divider", "equation", "figure", "table", "tableGrid", "tableRow", "tableCell", "tableCaption", "tableNotes", "tableNote", "bulletList", "orderedList", "listItem", "taskList", "taskItem", "codeBlock", "text", "hardBreak", "inlineMath", "crossReference", "footnoteReference", "citation"]);
const COPY_RESTRICTION = "This selection cannot be copied losslessly. Use Source to copy its original Markdown. The selection is kept.";
const CUT_RESTRICTION = "This selection cannot be cut losslessly. Use Source to copy its original Markdown. Nothing was removed.";

/** Every textblock exposes one inline editing surface in the shared document. */
function selectAllScope(state: EditorState): { from: number; to: number } | undefined {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.$from.sameParent(selection.$to) ||
      !selection.$from.parent.isTextblock ||
      !canEditEndnoteAt(state, selection.from)) return undefined;
  return { from: selection.$from.start(), to: selection.$from.end() };
}

// Blocks with an explicit reference label. Section labels never travel through the clipboard.
const EXPLICIT_LABELS = new Set(["equation", "figure", "table", "labelTarget"]);
const PASTE_LABEL_CONFLICT = "Pasting would reuse a label that already names another target. Cut the original to move it, or give it a distinct label before copying. Nothing was pasted; the clipboard is kept.";
// Product policy: turn off document-wide Mod-a expansion here; no settings UI.
const EXPAND_SELECT_ALL_TO_DOCUMENT = true;

export function selectAllTransaction(state: EditorState, previous?: EditorState,
  expand = EXPAND_SELECT_ALL_TO_DOCUMENT): Transaction {
  const scope = selectAllScope(state);
  const fullBlock = scope && scope.from < scope.to &&
    state.selection.from === scope.from && state.selection.to === scope.to;
  if (expand && (!scope || state === previous || fullBlock)) {
    return state.tr.setSelection(new AllSelection(state.doc));
  }
  return scope ? state.tr.setSelection(TextSelection.create(state.doc, scope.from, scope.to)) : state.tr;
}

/** Use the real keymap order (including input-rule Undo), with full native transactions. */
export function runHistoryShortcut(view: EditorView, shortcut: typeof UNDO_SHORTCUT): boolean {
  const mac = isMacOS();
  const event = new KeyboardEvent("keydown", { key: shortcut.key, ctrlKey: !mac, metaKey: mac });
  return Boolean(view.someProp("handleKeyDown", handler => handler(view, event)));
}

export function isInternalClipboard(html: string): boolean {
  return /\bdata-litzio-type\s*=/.test(html);
}

/** Litzio's own clipboard must hold only typed content it can paste losslessly. */
function internalPasteError(html: string, schema: Schema): UiMessage | undefined {
  const document = new DOMParser().parseFromString(html, "text/html");
  const allowed = new Set(["P", "DIV", "SPAN", "S", "DEL", "H1", "H2", "H3", "H4", "H5", "H6", "STRONG", "B", "EM", "I", "A", "BR", "CODE", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH"]);
  // A checklist item starts with its checkbox (in Tiptap's label), as other apps read it; that one
  // checkbox is the item's check state, not content.
  const checkboxes = new Set<Element>();
  for (const item of document.body.querySelectorAll('[data-litzio-type="taskItem"]')) {
    const box = leadingCheckbox(item);
    if (box) checkboxes.add(box).add(box.parentElement?.tagName === "LABEL" && box.parentElement.parentElement === item ? box.parentElement : box);
  }
  // Content of a typed textblock must be what its schema allows: marks and inline atoms in a heading,
  // with no block inside text.
  const misplaced = (element: Element, typed: string) => {
    const type = schema.nodes[typed], parent = schema.nodes[element.parentElement?.closest("[data-litzio-type]")?.getAttribute("data-litzio-type") ?? ""];
    return Boolean(type && parent?.isTextblock && !parent.contentMatch.matchType(type));
  };
  for (const element of document.body.querySelectorAll("*")) {
    const typed = element.getAttribute("data-litzio-type");
    // The Figure's typed attrs own its image; only its figcaption is parsed as content.
    if (["IMG", "FIGCAPTION"].includes(element.tagName) && element.closest('[data-litzio-type="figure"]')) continue;
    if (checkboxes.has(element)) continue;
    if ((!typed && (!allowed.has(element.tagName) || element.hasAttribute("style"))) ||
        (typed && !TYPES.has(typed)) || misplaced(element, typed ?? (element.tagName === "BR" ? "hardBreak" : "")) ||
        (["TABLE", "THEAD", "TBODY", "TR", "TD", "TH"].includes(element.tagName) && !element.closest('[data-litzio-type="table"]')) ||
        // Only a typed cell of a typed table keeps its spans: a complex table moved or copied in Litzio (ADR-0024).
        ((element.hasAttribute("colspan") || element.hasAttribute("rowspan")) && !(typed === "tableCell" && element.closest('[data-litzio-type="table"]')))) {
      return { key: "This clipboard content includes unsupported structure or formatting. Nothing was pasted; the clipboard and your selection are kept. Paste plain text explicitly or use supported content." };
    }
  }
  return undefined;
}

function portable(node: PMNode): boolean {
  return TYPES.has(node.type.name) &&
    node.content.content.every(portable);
}

/** Session locators never travel with clipboard content. Engine Slice openness is retained. */
function explicitLabel(node: PMNode): boolean {
  return EXPLICIT_LABELS.has(node.type.name) && typeof node.attrs.label === "string" && !!node.attrs.label;
}

/** Explicit labels pasted or copy-dropped must not repeat another explicit label (Core).
 * Implicit heading IDs are left to Save; duplicates already in the document do not block. */
function labelConflict(added: string[], others: string[]): UiMessage | undefined {
  if (!added.length) return undefined;
  try { assertPastedLabelsAvailable(added, others); return undefined; }
  catch (cause) {
    return { key: writeIssueOf(cause).code === "label-conflict" ? PASTE_LABEL_CONFLICT
      : "This clipboard content cannot be preserved. Nothing was pasted; your clipboard and selection are kept." };
  }
}

function freshSlice(slice: Slice): Slice {
  const copy = (node: PMNode): PMNode => {
    if (node.isText) return node;
    return node.type.create("sourcePath" in node.attrs ? { ...node.attrs, sourcePath: freshBlockPath() }
      : TABLE_CELL_SOURCE_ATTR in node.attrs ? { ...node.attrs, [TABLE_CELL_SOURCE_ATTR]: "" } : node.attrs,
      Fragment.fromArray(node.content.content.map(copy)), node.marks);
  };
  return new Slice(Fragment.fromArray(slice.content.content.map(copy)), slice.openStart, slice.openEnd);
}

/** External content joins the text around the selection only through a paragraph edge. Other
 * edge blocks (headings, lists, code) stay whole instead of merging into or absorbing that text. */
function closeExternalSlice(slice: Slice): Slice {
  const open = (node: PMNode | null, depth: number) => depth === 1 && node?.type.name === "paragraph" ? 1 : 0;
  return new Slice(slice.content, open(slice.content.firstChild, slice.openStart), open(slice.content.lastChild, slice.openEnd));
}

/** Inline parts of larger structures cannot be split by block paste. */
const INLINE_PLACES = new Set(["tableCell", "tableCaption", "tableNote", "figure", "footnoteDefinition"]);

/** The slice as the inline content of one textblock, or undefined when it holds blocks. Open
 * wrappers (a copied cell's table and row) are descended; a closed block is a block. */
function inlineContentOf(slice: Slice): Fragment | undefined {
  let content = slice.content;
  for (let open = Math.min(slice.openStart, slice.openEnd); ; open--) {
    if (content.content.every(node => node.isInline)) return content;
    const node = content.firstChild;
    if (content.childCount !== 1 || open < 1 || !node) return undefined;
    if (node.isTextblock) return node.content;
    content = node.content;
  }
}

function paragraphBeside(state: EditorState, after: boolean): Transaction {
  const { $from } = state.selection;
  let pos = state.selection instanceof NodeSelection
    ? (after ? state.selection.to : state.selection.from)
    : (after ? $from.after(1) : $from.before(1));
  if (state.selection instanceof NodeSelection && state.selection.node.type.name === "footnoteDefinition") {
    state.doc.forEach((node, at) => { if (node.type.name === "footnoteDefinition") pos = Math.min(pos, at); });
  }
  const node = state.schema.nodes.paragraph.create({ sourcePath: freshBlockPath() });
  const tr = state.tr.insert(pos, node);
  return tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView();
}

/** Enter at the start of a non-empty heading opens an empty paragraph above it; the caret stays at the heading start. */
function headingStartEnter(state: EditorState): Transaction {
  const tr = paragraphBeside(state, false);
  return tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(state.selection.from))).scrollIntoView();
}

/** A selected preview has no text caret; text input must leave it and the document unchanged. */
function selectedPreview(state: EditorState): boolean {
  return state.selection instanceof NodeSelection &&
    ["equation", "figure", "footnoteDefinition"].includes(state.selection.node.type.name);
}

/** A whole complex table selected as a block (ADR-0024). Typing must not replace its grid,
 * caption and notes with the typed text; Delete, cut and paste still act on the block. */
function selectedComplexTable(state: EditorState): boolean {
  return state.selection instanceof NodeSelection && state.selection.node.type.name === "table" && isComplexTable(state.selection.node);
}

/** A selection without a native text caret: typing and composition must not replace it. */
function readOnlySelection(state: EditorState): boolean {
  return selectedPreview(state) || selectedComplexTable(state);
}

function fullCaptionRange(state: EditorState, from: number, to: number): boolean {
  const $from = state.doc.resolve(from), $to = state.doc.resolve(to);
  return $from.sameParent($to) && ["figure", "tableCaption"].includes($from.parent.type.name) &&
    from === $from.start() && to === $from.end() && from < to;
}

/** The caret goes to the end of a final paragraph. After any other final block, it goes to a new empty paragraph. */
export function documentEnd(state: EditorState): Transaction {
  const end = state.doc.content.size;
  // A content-only editor adds no block; the caret goes to the end of the last one.
  if (isStructureLocked(state)) return state.tr.setSelection(Selection.atEnd(state.doc)).scrollIntoView();
  if (state.doc.lastChild?.type.name === "paragraph") return state.tr.setSelection(TextSelection.create(state.doc, end - 1)).scrollIntoView();
  const tr = state.tr.insert(end, state.schema.nodes.paragraph.create({ sourcePath: freshBlockPath() }));
  return tr.setSelection(TextSelection.create(tr.doc, end + 1)).scrollIntoView();
}

/** Whether the caret is on the last line of a nested block (table row, list, quote, caption) that ends the document. */
function atNestedDocumentEnd(view: EditorView): boolean {
  const { state } = view, { selection } = state, { $from } = selection;
  if (!selection.empty || $from.depth < 2 || $from.after(1) !== state.doc.content.size) return false;
  const lastLine = $from.node(1).type.name === "table" && $from.parent.type.name !== "tableNote"
    ? $from.index(1) === $from.node(1).childCount - 1
    : !TextSelection.findFrom(state.doc.resolve($from.after()), 1, true);
  return lastLine && view.endOfTextblock("down");
}

export function tableTab(state: EditorState, backward: boolean, editable: boolean): Transaction | null {
  const { $from } = state.selection;
  const cell = tableCellOf($from);
  if (!cell) return null;
  // Every cell in document order, the cells that start with a list included; a cell's text
  // starts in its first textblock.
  const cells: { node: PMNode; pos: number }[] = [];
  const start = $from.before(1);
  $from.node(1).descendants((node, pos) => {
    if (node.type.name !== "tableCell") return true;
    cells.push({ node, pos: start + 1 + pos });
    return false;
  });
  const index = cells.findIndex(item => item.pos === tableCellRange($from)!.from);
  const target = cells[index + (backward ? -1 : 1)];
  if (target) return state.tr.setSelection(TextSelection.create(state.doc, cellTextblock(target.node, target.pos, false).from)).scrollIntoView();
  // A complex table gains no row: Tab leaves it, as in a read-only table.
  if (!backward && editable && !isComplexTable($from.node(1))) return addTableRowBelow(state, $from.index(0), { row: cell.row, column: 0 });
  const edge = backward ? $from.before(1) : $from.after(1);
  const selection = TextSelection.findFrom(state.doc.resolve(edge), backward ? -1 : 1, true);
  return selection ? state.tr.setSelection(selection).scrollIntoView() : paragraphBeside(state, !backward);
}

/** The content range of the first (or last) textblock of the cell node at `cellPos`. */
function cellTextblock(cell: PMNode, cellPos: number, last: boolean): { from: number; to: number } {
  let found = { from: cellPos + 1, to: cellPos + 1 }, done = false;
  cell.descendants((node, offset) => {
    if (done || node.isTextblock === false) return !done;
    found = { from: cellPos + 2 + offset, to: cellPos + 2 + offset + node.content.size };
    done = !last;
    return false;
  });
  return found;
}

/** ArrowUp/ArrowDown from a grid cell's first/last visual line, or from a selected cell node, reaches the
 * same column of the adjacent row; the native caret and ProseMirror would follow document order to the
 * side cell instead. The final row continues into the caption. The first row's ArrowUp leaves the table
 * for the nearest selectable position before it (as from prose), or the native gap before a table that
 * starts the document. A text caret keeps its horizontal position where the target textblock has a line
 * there, otherwise it lands at the start (down) or end (up). Moves within a multi-line cell stay native. */
function tableVertical(view: EditorView, down: boolean): Transaction | null {
  const { state } = view, { selection, doc } = state;
  if (view.composing) return null;
  const $side = down ? selection.$to : selection.$from;
  let $cell, x: number | undefined;
  const cell = tableCellRange($side);
  if (selection instanceof NodeSelection && selection.node.type.name === "tableCell") $cell = selection.$from;
  else if (selection instanceof TextSelection && cell && selection.$from.sameParent(selection.$to) &&
      // Only from the cell's first (up) or last (down) textblock; moves between its blocks stay native.
      $side.start() === cellTextblock(doc.nodeAt(cell.from)!, cell.from, down).from && view.endOfTextblock(down ? "down" : "up")) {
    $cell = doc.resolve(cell.from);
    x = view.coordsAtPos($side.pos).left;
  } else return null;
  // Keep a text caret's horizontal position on the target textblock's first (down) or last (up) line.
  const caretIn = (from: number, to: number) => {
    let caret = down ? from : to;
    if (x !== undefined && from < to) {
      const line = view.coordsAtPos(caret);
      const hit = view.posAtCoords({ left: x, top: (line.top + line.bottom) / 2 });
      if (hit && hit.pos >= from && hit.pos <= to) caret = hit.pos;
    }
    return state.tr.setSelection(TextSelection.create(doc, caret)).scrollIntoView();
  };
  // Rows and columns of the grid, as TableMap lays out merged cells: the target is the cell at the
  // current cell's first column, in the row below its last row or above its first.
  const tablePos = $cell.before(1), table = $cell.node(1), grid = $cell.node(2), gridStart = $cell.start(2);
  const map = TableMap.get(grid), rect = map.findCell($cell.pos - gridStart);
  const target = down ? rect.bottom : rect.top - 1;
  if (target < 0) {
    const $table = doc.resolve(tablePos), before = Selection.findFrom($table, -1);
    if (!before) return state.tr.setSelection(new GapCursor($table)).scrollIntoView();
    if (!(before instanceof TextSelection)) return state.tr.setSelection(before).scrollIntoView();
    return caretIn(before.$head.start(), before.$head.end());
  }
  if (target >= map.height) {
    let pos = -1;
    table.forEach((child, offset) => { if (child.type.name === "tableCaption") pos = tablePos + 1 + offset; });
    return state.tr.setSelection(TextSelection.create(doc, pos + 1)).scrollIntoView();
  }
  const offset = map.map[target * map.width + rect.left];
  // The target cell's first (down) or last (up) textblock.
  const { from, to } = cellTextblock(grid.nodeAt(offset)!, gridStart + offset, !down);
  return caretIn(from, to);
}

/** A caret key (Home, End, arrows) moves the native caret, and its selectionchange may still be
 * queued when the next key arrives. Read that caret first, so Backspace/Delete decide on it
 * instead of the stale engine selection; otherwise the browser's own deletion merges the
 * blocks and the engine re-reads them without their inline atoms (#1821). Only an engine text
 * selection and a native selection inside text blocks of this editor are read. */
function readQueuedCaret(view: EditorView): void {
  const native = view.dom.ownerDocument.getSelection();
  if (view.composing || !view.hasFocus() || !(view.state.selection instanceof TextSelection) ||
      !native?.anchorNode || !native.focusNode || !view.dom.contains(native.anchorNode) || !view.dom.contains(native.focusNode)) return;
  let $anchor, $head;
  try {
    $anchor = view.state.doc.resolve(view.posAtDOM(native.anchorNode, native.anchorOffset));
    $head = view.state.doc.resolve(view.posAtDOM(native.focusNode, native.focusOffset));
  } catch { return; }
  if (!$anchor.parent.isTextblock || !$head.parent.isTextblock) return;
  const selection = view.someProp("createSelectionBetween", create => create(view, $anchor, $head)) ?? TextSelection.between($anchor, $head);
  if (!selection.eq(view.state.selection)) view.dispatch(view.state.tr.setSelection(selection));
}

/** A heading cannot hold line breaks. Joining prose that has them therefore uses
 * the paragraph type and ProseMirror's normal join transform. */
export function joinRichProse(state: EditorState, backward: boolean): Transaction | null {
  const { selection } = state;
  if (!selection.empty || selection.$from.depth !== 1) return null;
  const { $from } = selection;
  if ($from.parentOffset !== (backward ? 0 : $from.parent.content.size)) return null;
  const boundary = backward ? $from.before() : $from.after();
  const $boundary = state.doc.resolve(boundary);
  const left = $boundary.nodeBefore, right = $boundary.nodeAfter;
  if (left?.type.name !== "heading" || right?.type.name !== "paragraph" ||
      !right.content.content.some(node => node.type.name === "hardBreak")) return null;
  const tr = state.tr.setNodeMarkup(boundary - left.nodeSize, state.schema.nodes.paragraph, left.attrs).join(boundary);
  return tr.setSelection(TextSelection.create(tr.doc, boundary - 1)).scrollIntoView();
}

export function documentInteraction(reject: (reason?: UiMessage) => void): Extension {
  return Extension.create({
    name: "documentInteraction",
    priority: 120,
    addKeyboardShortcuts() {
      // State identity also distinguishes first/second presses in an empty surface.
      // Any intervening transaction (typing, pointer selection, history) starts afresh.
      let scopedState: EditorState | undefined;
      const end = () => {
        const { view } = this.editor;
        view.dispatch(documentEnd(view.state)); return true;
      };
      const tab = (backward: boolean) => {
        const { state, view } = this.editor;
        if (view.composing) return false;
        const tr = tableTab(state, backward, this.editor.isEditable);
        if (tr) { view.dispatch(tr); return true; }
        const { selection } = state, { $from } = selection;
        // Selected text keeps its toolbar Tab; only an editable top-level heading caret changes level.
        if (!this.editor.isEditable || !selection.empty || $from.depth !== 1 || $from.parent.type.name !== "heading") return false;
        const level = Number($from.parent.attrs.level) + (backward ? -1 : 1);
        if (level >= 1 && level <= 6) view.dispatch(changeHeadingLevel(state, $from.index(0), level));
        // H1 and H6 boundaries retain focus.
        return true;
      };
      const join = (backward: boolean) => {
        readQueuedCaret(this.editor.view);
        const { state, commands } = this.editor;
        const selection = state.selection;
        if (this.editor.isEditable && !this.editor.view.composing && backward && selection instanceof TextSelection &&
            selection.empty && selection.$from.parentOffset === 0 &&
            ["figure", "tableCaption"].includes(selection.$from.parent.type.name)) return true;
        if (this.editor.isEditable && !this.editor.view.composing && backward && selection instanceof TextSelection &&
            selection.empty && selection.$from.parent.type.name === "tableNote" && !selection.$from.parent.content.size) {
          const { $from } = selection;
          const removeGroup = $from.node(-1).childCount === 1;
          const depth = removeGroup ? $from.depth - 1 : $from.depth;
          const from = $from.before(depth), to = $from.after(depth);
          const tr = closeHistory(state.tr).delete(from, to);
          const previous = TextSelection.findFrom(tr.doc.resolve(from), -1, true);
          if (previous) tr.setSelection(previous);
          this.editor.view.dispatch(tr.scrollIntoView());
          return true;
        }
        if (state.selection instanceof NodeSelection && state.selection.node.type.name === "table") {
          this.editor.view.dispatch(closeHistory(state.tr).deleteSelection().setMeta(TABLE_DELETE_META, true).scrollIntoView());
          return true;
        }
        // Whole-document deletion must not merge with a just-applied property edit or insertion.
        // Use the engine's deletion and history boundary so one Undo restores the exact document.
        if (state.selection instanceof AllSelection) {
          this.editor.view.dispatch(closeHistory(state.tr).deleteSelection().scrollIntoView());
          return true;
        }
        const { $from } = state.selection;
        // Before the engine join can delete an adjacent atom, show its normal node
        // selection. Keep empty-block removal, list lifting and isolating boundaries.
        if ($from.depth === 1 && $from.parent.content.size > 0 &&
            ["paragraph", "heading"].includes($from.parent.type.name)) {
          const adjacent = state.doc.resolve(backward ? $from.before() : $from.after());
          const node = backward ? adjacent.nodeBefore : adjacent.nodeAfter;
          if (node?.isAtom && (backward ? commands.selectNodeBackward() : commands.selectNodeForward())) return true;
        }
        const tr = joinRichProse(this.editor.state, backward);
        if (!tr) return false;
        this.editor.view.dispatch(tr); return true;
      };
      return {
        "Mod-a": () => {
          const { view } = this.editor;
          const { state } = view;
          if (view.composing) return false;
          view.dispatch(selectAllTransaction(state, scopedState));
          scopedState = view.state;
          return true;
        },
        Backspace: () => join(true),
        Delete: () => join(false),
        // A native clipboard event may target the body when an AllSelection has
        // non-editable endpoints. Reject these unsupported selections at the keymap too.
        "Mod-c": () => {
          if (this.editor.state.selection.content().content.content.every(portable)) return false;
          reject({ key: COPY_RESTRICTION }); return true;
        },
        "Mod-x": () => {
          if (this.editor.state.selection.content().content.content.every(portable)) return false;
          reject({ key: CUT_RESTRICTION }); return true;
        },
        Tab: () => tab(false),
        "Shift-Tab": () => tab(true),
        "Mod-End": end,
        ...(isMacOS() ? { "Mod-ArrowDown": end } : {}),
        // Closed final blocks (including the gap after Apply) have no line below them either.
        ArrowUp: () => {
          const { view, state } = this.editor;
          const { selection } = state;
          const { $from } = selection;
          const cellMove = tableVertical(view, false);
          if (cellMove) { view.dispatch(cellMove); return true; }
          if (!selection.empty || $from.parent.type.name !== "tableCaption" || !view.endOfTextblock("up")) return false;
          const cell = TextSelection.findFrom(state.doc.resolve($from.before()), -1, true);
          if (!cell) return false;
          view.dispatch(state.tr.setSelection(cell).scrollIntoView()); return true;
        },
        ArrowDown: () => {
          const { view } = this.editor;
          const cellMove = tableVertical(view, true);
          if (cellMove) { view.dispatch(cellMove); return true; }
          const { selection, doc } = view.state;
          const finalBlock = selection.to === doc.content.size &&
            (selection instanceof GapCursor || selection instanceof NodeSelection && selection.node.isBlock);
          if (!finalBlock && !atNestedDocumentEnd(view)) return false;
          view.dispatch(documentEnd(view.state)); return true;
        },
        Enter: () => {
          const { state, view } = this.editor;
          if (view.composing) return false;
          const { selection } = state;
          if (selection instanceof NodeSelection && selection.node.isBlock) {
            view.dispatch(paragraphBeside(state, true)); return true;
          }
          if (selection.$from.depth > 0 && ["table", "admonition", "quote", "footnoteDefinition", "figure"].includes(selection.$from.node(1).type.name)) {
            if (!selection.empty) return false;
            view.dispatch(paragraphBeside(state, true)); return true;
          }
          if (selection.$from.parent.type.name === "heading") {
            if (selection.empty && selection.$from.parentOffset === 0) {
              view.dispatch(selection.$from.parent.content.size === 0
                ? state.tr.setNodeMarkup(selection.$from.before(), state.schema.nodes.paragraph, { sourcePath: freshBlockPath() })
                : headingStartEnter(state));
              return true;
            }
            return splitBlockAs((node, atEnd) => atEnd || node.content.size === 0
              ? { type: state.schema.nodes.paragraph, attrs: { sourcePath: freshBlockPath() } }
              : { type: node.type, attrs: { ...node.attrs, sourcePath: freshBlockPath() } })(state, view.dispatch);
          }
          return false;
        },
      };
    },
    addProseMirrorPlugins() {
      const schema = this.editor.schema;
      // Pasted URLs link as the Link extension judges typed ones; its own paste rules are off.
      const autoLink: AutoLink = value => {
        const shouldAutoLink = this.editor.extensionManager.extensions.find(extension => extension.name === "link")?.options.shouldAutoLink;
        return typeof shouldAutoLink === "function" ? Boolean(shouldAutoLink(value)) : true;
      };
      const serializers = DOMSerializer.nodesFromSchema(schema);
      for (const [type, serialize] of Object.entries(serializers)) {
        if (type === "text") continue;
        serializers[type] = node => {
          const spec = serialize(node) as readonly unknown[];
          const attrs = typeof spec[1] === "object" && !Array.isArray(spec[1]) ? spec[1] : {};
          const children = attrs === spec[1] ? spec.slice(2) : spec.slice(1);
          return [spec[0], { ...attrs, "data-litzio-type": type, "data-litzio-attrs": JSON.stringify(node.attrs) }, ...children] as DOMOutputSpec;
        };
      }
      const parser = new PMDOMParser(schema, [
        ...Object.keys(serializers).filter(type => type !== "text").map(type => ({
          tag: `[data-litzio-type="${type}"]`, node: type,
          getAttrs: (element: HTMLElement) => {
            try { return JSON.parse(element.getAttribute("data-litzio-attrs") ?? "{}"); } catch { return false; }
          },
          ...(type === "figure" ? { contentElement: "figcaption" } : {}),
          // As Tiptap reads its own checklist item: the content is in the item's div, and the
          // leading checkbox is the check state.
          ...(type === "taskItem" ? {
            contentElement: (element: HTMLElement) => element.querySelector<HTMLElement>(":scope > div") ?? element,
            getAttrs: (element: HTMLElement) => {
              let attrs: Record<string, unknown>;
              try { attrs = JSON.parse(element.getAttribute("data-litzio-attrs") ?? "{}"); } catch { return false; }
              const box = leadingCheckbox(element);
              return box ? { ...attrs, checked: box.checked } : attrs;
            },
          } : {}),
        })),
        ...PMDOMParser.fromSchema(schema).rules,
      ]);
      // Parsing (transformPastedHTML) precedes handlePaste/handleDrop for the same clipboard data.
      let pasted: (Omit<ExternalHTML, "error"> & { error?: UiMessage }) | undefined;
      let external = false;
      // Shown once the engine's paste transaction is applied; the structure guard may still refuse it.
      let pastedNotice: UiMessage | undefined;
      let pastedFootnotes: FootnoteDefinition[] = [];
      // Only a paste reads clipboard text as Markdown; dropped text stays plain.
      let textPaste = false;
      // Set by the text parse of a paste or drop; transformPasted of the same event consumes it.
      let linkPastedText = false;
      const fail = (message: UiMessage) => { reject(message); return true; };
      const copyWithFootnotes = (view: EditorView, event: ClipboardEvent, cut: boolean): boolean => {
        const slice = view.state.selection.content();
        const restriction: UiMessage = { key: cut ? CUT_RESTRICTION : COPY_RESTRICTION };
        if (!slice.content.content.every(portable)) { event.preventDefault(); return fail(restriction); }
        if (!referenceLabels(slice.content).length) return false;
        event.preventDefault();
        try {
          const notes = clipboardFootnotes(view.state.doc, slice);
          const markdown = footnoteDefinitionsMarkdown(notes);
          const { dom, text } = view.serializeForClipboard(slice);
          if (!event.clipboardData || !dom.firstElementChild) throw new Error("Clipboard unavailable");
          dom.firstElementChild.setAttribute(FOOTNOTES_ATTR, JSON.stringify(notes));
          event.clipboardData.setData("text/html", dom.innerHTML);
          const plain = `${text}\n\n${markdown}`;
          event.clipboardData.setData("text/plain", plain);
          if (event.clipboardData.getData("text/html") !== dom.innerHTML || event.clipboardData.getData("text/plain") !== plain) throw new Error("Clipboard write failed");
          if (cut && view.editable) view.dispatch(closeHistory(view.state.tr).deleteSelection().scrollIntoView().setMeta("uiEvent", "cut"));
          return true;
        } catch { return fail(restriction); }
      };
      // A selected block has no native text caret. Keep the DOM read-only for that
      // selection, while the engine remains editable for explicit keymaps/clipboard.
      const syncPreviewInput = (view: EditorView) => {
        view.dom.contentEditable = String(view.editable && !readOnlySelection(view.state));
      };
      const rejectPreviewComposition = (view: EditorView) => {
        if (!readOnlySelection(view.state)) return false;
        syncPreviewInput(view);
        return true;
      };
      return [new Plugin({
        view: view => {
          syncPreviewInput(view);
          // Chromium may send native/menu clipboard events to the body when a
          // selection ends in a non-editable NodeView. Route this editor's focused
          // event to ProseMirror's clipboard handler, retaining the native data object.
          const restrict = (event: ClipboardEvent) => {
            if (!view.hasFocus() || view.dom.contains(event.target as globalThis.Node)) return;
            if (!view.state.selection.content().content.content.every(portable)) {
              event.preventDefault();
              reject({ key: event.type === "cut" ? CUT_RESTRICTION : COPY_RESTRICTION });
              return;
            }
            if (!event.clipboardData) return;
            const forwarded = new ClipboardEvent(event.type, { clipboardData: event.clipboardData, bubbles: true, cancelable: true });
            view.dom.dispatchEvent(forwarded);
            if (forwarded.defaultPrevented) event.preventDefault();
          };
          const document = view.dom.ownerDocument;
          document.addEventListener("copy", restrict, true);
          document.addEventListener("cut", restrict, true);
          return {
            // The notice shares the restriction message channel.
            update(view, previous) {
              syncPreviewInput(view);
              if (pastedNotice && view.state.doc !== previous.doc) reject(pastedNotice);
              pastedNotice = undefined;
            },
            destroy() {
              document.removeEventListener("copy", restrict, true);
              document.removeEventListener("cut", restrict, true);
            },
          };
        },
        props: {
        // Edit temporarily makes a selected preview's DOM read-only: a focus caret
        // cannot turn that selection into title text. Actual Read must still accept
        // a native pointer caret in another block.
        createSelectionBetween: (view, anchor, head) => view.editable && anchor.pos === head.pos && view.hasFocus() &&
          !view.dom.isContentEditable && selectedPreview(view.state) ? view.state.selection : null,
        clipboardSerializer: new DOMSerializer(serializers, DOMSerializer.marksFromSchema(schema)),
        clipboardParser: parser,
        clipboardTextSerializer: slice => slice.content.textBetween(0, slice.content.size, "\n\n", node =>
          node.type.name === "equation" ? `$$\n${node.attrs.latex}\n$$` :
          node.type.name === "inlineMath" ? `$${node.attrs.value}$` :
          node.type.name === "crossReference" ? `{${node.attrs.role}}\`${node.attrs.label}\`` :
          node.type.name === "footnoteReference" ? `[^${node.attrs.label}]` :
          node.type.name === "citation" ? inlineContentText([{ kind: "citation", role: node.attrs.role, keys: node.attrs.keys }]) :
          node.type.name === "figure" ? `![${node.attrs.imageAlt}](${node.attrs.imageUrl})` : ""),
        handleDOMEvents: {
          mousedown: (view, event) => {
            // Let an actual pointer place a text caret before the browser's default action.
            const target = event.target instanceof Element ? event.target : null;
            const readonly = target?.closest('[contenteditable="false"]');
            if (event.button === 0 && (!readonly || readonly === view.dom) &&
                !target?.closest('[data-testid="footnote-definition"][aria-readonly="true"]')) {
              // Tiptap's focus transaction synchronizes the selected preview back to
              // read-only. Finish focus first, then let this same native click place
              // its caret on the now-editable surface.
              if (selectedPreview(view.state)) view.focus();
              view.dom.contentEditable = String(view.editable);
            }
            return false;
          },
          beforeinput: (view, event) => {
            if (readOnlySelection(view.state) && /^(insert|delete)/.test(event.inputType)) {
              syncPreviewInput(view);
              if (event.cancelable) event.preventDefault();
              return true;
            }
            if (!this.editor.isEditable || view.composing || event.isComposing || !event.cancelable) return false;
            const insert = event.inputType === "insertText" || event.inputType === "insertReplacementText";
            if (!insert && !event.inputType.startsWith("delete")) return false;
            if (insert && typeof event.data !== "string") return false;
            let ranges: StaticRange[];
            try {
              if (typeof event.getTargetRanges !== "function") return false;
              ranges = event.getTargetRanges();
            } catch { return false; }
            if (ranges.length !== 1) return false;
            const range = ranges[0]!;
            let from: number, to: number;
            try {
              from = view.posAtDOM(range.startContainer, range.startOffset);
              to = view.posAtDOM(range.endContainer, range.endOffset);
            } catch { return false; }
            if (!fullCaptionRange(view.state, from, to)) return false;
            // Chrome can remove the React-owned wrappers while replacing a whole rich caption.
            // Use the browser's exact target range and ProseMirror's normal transaction/history.
            event.preventDefault();
            view.dispatch((insert ? view.state.tr.insertText(event.data!, from, to) : view.state.tr.delete(from, to)).scrollIntoView());
            return true;
          },
          keydown: (view, event) => {
            // ProseMirror skips keymaps during composition. Consume the shortcut here
            // so Chromium cannot select the whole document behind the composing range.
            if (this.editor.isEditable && (view.composing || event.isComposing) && selectAllScope(view.state) &&
                !event.altKey && !event.shiftKey && (isMacOS() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) &&
                (event.key.toLowerCase() === "a" || ["Process", "Unidentified"].includes(event.key) && event.code === "KeyA")) {
              event.preventDefault();
              return true;
            }
            // Native range extension still needs an editable selection surface.
            // Let the existing engine/browser navigation place that range, without
            // admitting character input or releasing on composition-cancel keys.
            if (selectedPreview(view.state) && /^(Arrow(Left|Right|Up|Down)|Home|End)$/.test(event.key)) {
              view.dom.contentEditable = String(view.editable);
              view.focus();
            }
            if (!isMacOS() && this.editor.isEditable && !view.composing && event.ctrlKey && !event.metaKey) {
              const shortcut = UNDO_SHORTCUT.matches(event, { opaqueOnly: true }) ? UNDO_SHORTCUT
                : REDO_SHORTCUT.matches(event, { opaqueOnly: true }) ? REDO_SHORTCUT : undefined;
              if (shortcut) {
                // IME Process/229 has no character for the engine keymap to resolve.
                // Reuse that keymap, including Markdown input-rule Undo, with a visible key.
                runHistoryShortcut(view, shortcut);
                event.preventDefault();
                return true;
              }
            }
            return false;
          },
          compositionstart: view => {
            if (rejectPreviewComposition(view)) return true;
            const { from, to } = view.state.selection;
            // Empty the selected caption through the engine before Chromium's noncancelable
            // composition replacement can remove its NodeView contentDOM wrappers.
            if (this.editor.isEditable && fullCaptionRange(view.state, from, to)) view.dispatch(view.state.tr.delete(from, to));
            return false;
          },
          compositionupdate: rejectPreviewComposition,
          copy: (view, event) => {
            return copyWithFootnotes(view, event, false);
          },
          // Runs before the engine's own paste handler, which reads the text in this same event.
          // The state ends with the event: a paste skipped during composition must not leak into
          // a later drop.
          paste: view => {
            if (view.composing) return false;
            textPaste = true;
            queueMicrotask(() => { textPaste = false; });
            return false;
          },
          cut: (view, event) => {
            return copyWithFootnotes(view, event, true);
          },
        },
        // Litzio's typed clipboard is pasted as is; other HTML is normalized to supported structure first.
        transformPastedHTML: html => {
          textPaste = false;
          pastedFootnotes = [];
          external = !isInternalClipboard(html);
          // External HTML text links its URLs like pasted text; Litzio's own clipboard is not changed.
          linkPastedText = external;
          pasted = external ? normalizeExternalHTML(html) : { html, error: internalPasteError(html, schema) };
          if (!external) {
            try {
              const value = new DOMParser().parseFromString(html, "text/html").querySelector(`[${FOOTNOTES_ATTR}]`)?.getAttribute(FOOTNOTES_ATTR);
              if (value) {
                const notes: unknown = JSON.parse(value);
                if (!Array.isArray(notes)) throw new Error("Invalid footnotes");
                footnoteDefinitionsMarkdown(notes);
                pastedFootnotes = notes;
              }
            } catch { pasted.error = { key: "This clipboard content cannot be preserved. Nothing was pasted; your clipboard and selection are kept." }; }
          }
          return pasted.html;
        },
        // Clipboard text with Markdown formatting is read by Core as when opening a document.
        // Code, inline code, Ctrl+Shift+V (plain) and dropped text keep the engine's text paste.
        clipboardTextParser: (text, $context, plain) => {
          const paste = textPaste;
          textPaste = false;
          pastedFootnotes = [];
          const literalPlace = $context.parent.type.spec.code || $context.marks().some(mark => mark.type.spec.code);
          const markdown = paste && !plain && !literalPlace
            ? markdownPaste(schema, text, autoLink, portable) : undefined;
          // The engine's own text slice links its URLs in transformPasted; Markdown linked them already.
          linkPastedText = !markdown;
          if (!markdown) return null as unknown as Slice;
          // The engine reopens a parsed text slice as it does parsed HTML; close its edges alike.
          external = true;
          pastedFootnotes = markdown.footnotes;
          return markdown.slice;
        },
        // Content parsed from clipboard or dropped text and external HTML links its URLs here, with
        // one function; Litzio's own clipboard and block moves are pasted as they are.
        transformPasted: slice => {
          const linked = linkPastedText ? new Slice(Fragment.fromArray(linkUrlsInNodes(slice.content.content, schema.marks.link!, autoLink)), slice.openStart, slice.openEnd) : slice;
          linkPastedText = false;
          return freshSlice(external ? closeExternalSlice(linked) : linked);
        },
        handleDrop: (view, _event, slice, moved) => {
          textPaste = false;
          pastedFootnotes = [];
          const { error, notice } = moved ? {} : pasted ?? {};
          pasted = undefined;
          external = false;
          if (error) return fail(error);
          // A copy drop adds its blocks' labels as a paste does; a move keeps them.
          if (!moved) {
            const otherLabels: string[] = [];
            view.state.doc.forEach(node => { if (explicitLabel(node)) otherLabels.push(node.attrs.label); });
            const droppedLabels: string[] = [];
            slice.content.descendants(node => { if (explicitLabel(node)) droppedLabels.push(node.attrs.label); });
            const conflict = labelConflict(droppedLabels, otherLabels);
            if (conflict) return fail(conflict);
          }
          pastedNotice = notice;
          return false;
        },
        // Consume ordinary text on selected previews without replacing content or adding space.
        // Text carets and explicit property inputs retain their existing input paths.
        handleTextInput(view, _from, _to, text) {
          return !!text && readOnlySelection(view.state);
        },
        handlePaste: (view, event, slice) => {
          const notes = pastedFootnotes;
          pastedFootnotes = [];
          const html = Boolean(event.clipboardData?.getData("text/html"));
          const { error, notice } = html ? pasted ?? {} : {};
          pasted = undefined;
          textPaste = false;
          external = false;
          if (error) return fail(error);
          if (event.clipboardData?.files.length && !isInternalClipboard(event.clipboardData.getData("text/html"))) return fail(`Add one ${ASSET_FORMATS} image at a time. Your selection and clipboard are kept.`);
          if (!slice.content.content.every(portable)) return fail({ key: "This clipboard content cannot be preserved. Nothing was pasted; your clipboard and selection are kept." });
          // Text in a table cell is in the cell's blocks; the cell is the inline place.
          const target = inTableCell(view.state.selection.$from) ? "tableCell" : view.state.selection.$from.parent.type.name;
          if (target === "heading" || target === "tableCaption" || target === "tableCell") {
            let lineBreak = false;
            // A soft break read from Markdown is a physical newline inside a text node.
            slice.content.descendants(node => {
              if (node.isText && node.text!.includes("\n") || target !== "tableCell" && node.type.name === "hardBreak") lineBreak = true;
            });
            if (lineBreak && target === "tableCell") return fail({ key: "A table cell needs hard line breaks. Use Shift+Enter in the cell. The clipboard and selection are kept." });
            if (lineBreak) return fail(`A ${target === "heading" ? "heading" : "table caption"} cannot contain line breaks. Paste into a paragraph to keep them. The clipboard and selection are kept.`);
          }
          // Inline places take inline content only. The engine would otherwise split the place
          // and carry the text after the caret into the body.
          if (INLINE_PLACES.has(target)) {
            const inline = inlineContentOf(slice);
            if (!inline) return fail({ key: "Only inline content can be pasted here. Paste blocks into a paragraph. Nothing was pasted; the clipboard and selection are kept." });
            if (target === "tableNote" && referenceLabels(inline).length) return fail({ key: "Table notes cannot contain endnote references. Nothing was pasted; the clipboard and selection are kept." });
            if (target === "footnoteDefinition" && referenceLabels(inline).length) return fail({ key: "An endnote cannot contain another endnote. Nothing was pasted; the clipboard and selection are kept." });
          }
          const { selection } = view.state;
          const besideEquation = selection instanceof NodeSelection && selection.node.type.name === "equation";
          // Consume empty accepted content: delegating a non-null empty Slice deletes the selection.
          if (besideEquation && !slice.size) return true;
          let tr: Transaction;
          try {
            tr = pasteFootnotes(view.state, slice, notes, besideEquation ? paragraphBeside(view.state, true) : closeHistory(view.state.tr));
          } catch { return fail({ key: "This clipboard content cannot be preserved. Nothing was pasted; your clipboard and selection are kept." }); }
          // Explicit labels the paste adds must not repeat another explicit label (Core). Implicit
          // heading IDs are left to Save; duplicates already in the document do not block the paste.
          const existing = new Set<unknown>();
          view.state.doc.forEach(node => existing.add(node.attrs.sourcePath));
          const pastedLabels: string[] = [];
          const otherLabels: string[] = [];
          tr.doc.forEach(node => {
            if (!explicitLabel(node)) return;
            if (existing.has(node.attrs.sourcePath) || node.type.name === "labelTarget") otherLabels.push(node.attrs.label);
            else pastedLabels.push(node.attrs.label);
          });
          const conflict = labelConflict(pastedLabels, otherLabels);
          if (conflict) return fail(conflict);
          if (besideEquation || notes.length || referenceLabels(slice.content).length) {
            pastedNotice = notice;
            view.dispatch(tr.scrollIntoView().setMeta("paste", true).setMeta("uiEvent", "paste"));
            return true;
          }
          // The engine's own paste transaction follows. Close history first so it is its own
          // Undo step, never merged with typing just before it.
          view.dispatch(closeHistory(view.state.tr));
          pastedNotice = notice;
          return false;
        },
      } })];
    },
  });
}
